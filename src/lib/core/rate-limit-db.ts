// Rate limiter บน Postgres (WO-C3 / บั๊ก B2) — ทนข้าม instance ต่างจาก `core/rate-limit.ts`
//
// ทำไมต้องมี: `core/rate-limit.ts` เป็น Map ใน process เดียว บน Vercel ที่มีหลาย instance
// เพดานจริง = ที่ตั้งไว้ × จำนวน instance ⇒ แทบไม่กันอะไร (B2 ใน §5 ของแผน)
// ที่นี่นับบนแถวจริงใน `ChatRateBucket` (WO-C1/M6) → ทุก instance เห็นตัวเลขเดียวกัน
//
// 🔴 บทเรียนจาก §12 (SiamDive S2): ย้ายจาก memory ไป DB = **เพดานจริงเข้มขึ้นหลายเท่า
//    โดยไม่ตั้งใจ** — ห้ามยกตัวเลขเดิมมาดื้อ ๆ ต้องคำนวณจากผู้ใช้จริงใหม่ทุกครั้ง
//    (ตัวเลขของ chat API v1 คำนวณไว้ใน `modules/chat/public-auth.ts`)
//
// 🔴 ภาระการเขียน: ทุก request = 1 คำสั่ง UPDATE ⇒ **ห้ามซ้อนหลายชั้นโดยไม่จำเป็น**
//    ทางร้อน (แถวมีอยู่แล้ว · ยังไม่เต็ม) ใช้ query เดียว — `updateMany` ที่ใส่เงื่อนไข
//    "อยู่ในหน้าต่าง" + "ยังไม่ถึงเพดาน" ลงใน WHERE แล้ว `increment` ⇒ atomic ในตัวเอง
//    (ไม่มีช่วง read-then-write ให้ 2 instance นับทับกัน)
//
// fail-open: ตัวจำกัดล่ม **ห้าม** ทำให้แชททั้งระบบใช้ไม่ได้ (เหมือน siamdive2 `rate-limit.ts`)

import { prisma } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { Prisma } from "@prisma/client";

export type RateVerdict = { ok: boolean; retryAfterSec?: number };

const isP2002 = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/**
 * นับ 1 ครั้งเมื่อผ่าน · ถึงเพดานในหน้าต่างเวลา → `{ ok:false, retryAfterSec }`
 *
 * หน้าต่างแบบ fixed window ต่อ `key` (แถวเดียวต่อ key — `ChatRateBucket.key @unique`)
 * @param key    ถังแยก เช่น `chat:v1:key:<apiKeyId>`
 * @param limit  จำนวนสูงสุดในหน้าต่าง · windowMs = ความยาวหน้าต่าง (ms)
 */
export async function checkRateLimitDb(
  key: string,
  opts: { limit: number; windowMs: number },
  now = Date.now(),
): Promise<RateVerdict> {
  const { limit, windowMs } = opts;
  const nowDate = new Date(now);
  const floor = new Date(now - windowMs); // ต้นหน้าต่างที่ยังนับอยู่ — เก่ากว่านี้ = หมดอายุ

  // ทางร้อน: แถวมีอยู่ · หน้าต่างยังไม่หมด · ยังไม่ถึงเพดาน → +1 ในคำสั่งเดียว (atomic)
  const bump = async () =>
    (
      await prisma.chatRateBucket.updateMany({
        where: { key, windowStart: { gt: floor }, count: { lt: limit } },
        data: { count: { increment: 1 } },
      })
    ).count === 1;

  try {
    if (await bump()) return { ok: true };

    // ไม่ผ่านทางร้อน = อย่างใดอย่างหนึ่ง: (ก) ไม่มีแถว (ข) หน้าต่างหมดอายุ (ค) เต็มเพดาน
    // (ข) → รีเซ็ตหน้าต่างแล้วนับเป็นครั้งที่ 1 (ยังคงเป็น atomic เพราะเงื่อนไขอยู่ใน WHERE)
    const reset = await prisma.chatRateBucket.updateMany({
      where: { key, windowStart: { lte: floor } },
      data: { count: 1, windowStart: nowDate },
    });
    if (reset.count === 1) return { ok: true };

    const row = await prisma.chatRateBucket.findUnique({ where: { key } });
    if (!row) {
      // (ก) ครั้งแรกของ key นี้
      try {
        await prisma.chatRateBucket.create({ data: { key, count: 1, windowStart: nowDate } });
        return { ok: true };
      } catch (e) {
        // แข่งกันสร้าง: อีก instance ชนะไปแล้ว → กลับไปนับกับแถวของเขา **ห้ามปล่อยผ่านเฉย ๆ**
        // (ปล่อยผ่าน = ยิงพร้อมกัน N ครั้งแรกนับได้ 1 ⇒ เพดานรั่วทุกครั้งที่ key เกิดใหม่)
        if (!isP2002(e)) throw e;
        return { ok: await bump() };
      }
    }

    // (ค) เต็มเพดาน — บอกเวลาที่หน้าต่างจะหมดจริงจากแถวใน DB
    const resetAt = row.windowStart.getTime() + windowMs;
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
  } catch (e) {
    // DB ล่ม/ช้า → ปล่อยผ่าน แต่ **ไม่เงียบต่อเรา** (ปิดเงียบเคยทำให้ไล่หาสาเหตุนาน — storage/service.ts:129)
    void logOps("WARN", "rate-limit-db", "ตัวจำกัดอัตราบน DB ทำงานไม่ได้ — ปล่อยผ่านชั่วคราว", {
      detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    }).catch(() => {});
    return { ok: true };
  }
}

/**
 * กวาดแถวที่หมดอายุแล้วทิ้ง — ตารางนี้โตตามจำนวน key ที่เคยเห็น (ip/guest ไม่ซ้ำกันเลย)
 * ⚠️ ยังไม่มีใครเรียก: cron อยู่ในมืออีกสาย (`platform/cron.ts` ห้ามแตะในรอบนี้) → ต้องต่อสายทีหลัง
 */
export async function sweepRateBuckets(olderThanMs = 24 * 60 * 60_000, now = Date.now()): Promise<number> {
  const res = await prisma.chatRateBucket.deleteMany({
    where: { windowStart: { lt: new Date(now - olderThanMs) } },
  });
  return res.count;
}

/** ล้างถังของ key เดียว (เฉพาะเทส) — 🔴 ไม่มี key = ไม่ทำอะไร ห้ามล้างทั้งตารางบน prod */
export async function resetRateLimitDb(key?: string): Promise<void> {
  if (!key) return;
  await prisma.chatRateBucket.deleteMany({ where: { key } });
}
