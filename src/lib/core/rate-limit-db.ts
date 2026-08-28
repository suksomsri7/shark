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
// 🔴 ภาระการเขียน: ทุก request = 1 คำสั่ง ⇒ **ห้ามซ้อนหลายชั้นโดยไม่จำเป็น**
//    ใช้ `INSERT … ON CONFLICT DO UPDATE … RETURNING` คำสั่งเดียวจบทุกกรณี (สร้าง/เพิ่ม/รีเซ็ต)
//    ⇒ atomic ในตัวเอง ไม่มีช่วง read-then-write ให้คำขอที่มาพร้อมกันนับทับกัน (ดูเหตุผลเต็มในฟังก์ชัน)
//
// fail-open: ตัวจำกัดล่ม **ห้าม** ทำให้แชททั้งระบบใช้ไม่ได้ (เหมือน siamdive2 `rate-limit.ts`)

import { prisma } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";

export type RateVerdict = { ok: boolean; retryAfterSec?: number };

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

  // 🔴 คำสั่งเดียวจบ — `INSERT … ON CONFLICT DO UPDATE … RETURNING` (ยกวิธีจาก siamdive2
  //    `src/lib/rate-limit.ts` ซึ่งพิสูจน์บน prod มาแล้ว)
  //
  //    เวอร์ชันแรกของไฟล์นี้แยกเป็นหลายคำสั่ง (updateMany → updateMany → findUnique → create
  //    → กู้ P2002) ซึ่ง **นับพลาดจริงเมื่อมีการยิงพร้อมกัน** — วัดแล้วบน Neon prod:
  //      ยิงพร้อมกัน 20 ครั้งบน key ใหม่ → ผ่านแค่ 15/20 และ count ใน DB = 15
  //      (ยิงเรียงกัน 20 ครั้ง → ถูกต้อง 20/20)
  //    ผิดสองทางพร้อมกัน: ปฏิเสธผู้ใช้ที่ยังไม่ถึงเพดาน **และ** นับหายทำให้เพดานรั่ว
  //    เหตุ: ทุกคำขอเห็น "ยังไม่มีแถว" พร้อมกัน → แข่งกันสร้าง → ตัวที่แพ้ต้องไปนับใหม่
  //    ซึ่งเป็นช่วง read-then-write ที่ไม่ atomic ระหว่างคำสั่ง
  //    ⇒ กติกาของไฟล์นี้: **ห้ามแตกเป็นหลายคำสั่ง** ไม่ว่าจะดูอ่านง่ายกว่าแค่ไหน
  //    (ด่าน: `qc-chat-security.mts` M9 ยิง 20 ครั้งพร้อมกันด้วย Promise.all)
  //
  //    fixed window: หน้าต่างหมดอายุ → รีเซ็ตเป็น 1 · ยังไม่หมด → +1 · ตัดสินจาก count ที่คืนมา
  try {
    const rows = await prisma.$queryRaw<{ count: number; windowStart: Date }[]>`
      INSERT INTO "ChatRateBucket" ("id", "key", "count", "windowStart", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, ${key}, 1, ${new Date(now)}, NOW(), NOW())
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "ChatRateBucket"."windowStart" <= ${new Date(now - windowMs)}
                       THEN 1 ELSE "ChatRateBucket"."count" + 1 END,
        "windowStart" = CASE WHEN "ChatRateBucket"."windowStart" <= ${new Date(now - windowMs)}
                             THEN ${new Date(now)} ELSE "ChatRateBucket"."windowStart" END,
        "updatedAt" = NOW()
      RETURNING "count", "windowStart"`;

    const row = rows[0];
    if (!row) return { ok: true }; // ไม่ควรเกิด (RETURNING เสมอ) — ปล่อยผ่านดีกว่าปิดแชท
    if (row.count <= limit) return { ok: true };

    // เต็มเพดาน — บอกเวลาที่หน้าต่างจะหมดจริงจากแถวใน DB
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
 * ต่อเข้า cron รายวันแล้วที่ `platform/cron.ts` (`rateBucketsSwept`)
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
