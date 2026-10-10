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

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";

export type RateVerdict = {
  ok: boolean;
  retryAfterSec?: number;
  /**
   * จำนวนครั้งที่นับไปแล้วในหน้าต่างนี้ (รวมครั้งนี้) — undefined เมื่อตัวจำกัดล่ม (fail-open)
   * ผู้เรียกที่อยากตอบหัว `X-RateLimit-Remaining` คำนวณเอง = limit − count
   */
  count?: number;
};

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
    if (row.count <= limit) return { ok: true, count: row.count };

    // เต็มเพดาน — บอกเวลาที่หน้าต่างจะหมดจริงจากแถวใน DB
    const resetAt = row.windowStart.getTime() + windowMs;
    return { ok: false, count: row.count, retryAfterSec: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
  } catch (e) {
    // DB ล่ม/ช้า → ปล่อยผ่าน แต่ **ไม่เงียบต่อเรา** (ปิดเงียบเคยทำให้ไล่หาสาเหตุนาน — storage/service.ts:129)
    void logOps("WARN", "rate-limit-db", "ตัวจำกัดอัตราบน DB ทำงานไม่ได้ — ปล่อยผ่านชั่วคราว", {
      detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    }).catch(() => {});
    return { ok: true };
  }
}

/**
 * C5.1-fix — CTE ของถังเดียว (`<name> AS (INSERT … ON CONFLICT … RETURNING "count", "windowStart")`) — ตรรกะเดียวกับ checkRateLimitDb
 * ให้คำสั่ง "นับ + เขียน" ของทางร้อน (tracking) ใส่ถังไว้ในคำสั่งเดียวกับงานเขียน · `after` = นับเฉพาะเมื่อถังก่อนหน้าผ่าน
 * ผู้เรียกตัดสินผ่าน/ไม่ผ่านจาก `"count" <= limit` ของ CTE นี้ (ความหมายเดียวกับ RateVerdict.ok)
 */
export function rateBucketCte(name: string, key: string, windowMs: number, now: number, after?: { after: string; limit: number }): Prisma.Sql {
  if (!/^[a-z][a-z0-9_]{0,15}$/.test(name) || (after && !/^[a-z][a-z0-9_]{0,15}$/.test(after.after))) throw new Error("rateBucketCte: ชื่อ CTE ไม่ถูกต้อง");
  const at = new Date(now);
  const cut = new Date(now - windowMs);
  const src = after
    ? Prisma.sql`SELECT gen_random_uuid()::text, ${key}, 1, ${at}, NOW(), NOW() FROM ${Prisma.raw(after.after)} p WHERE p."count" <= ${after.limit}`
    : Prisma.sql`VALUES (gen_random_uuid()::text, ${key}, 1, ${at}, NOW(), NOW())`;
  return Prisma.sql`${Prisma.raw(name)} AS (
    INSERT INTO "ChatRateBucket" ("id", "key", "count", "windowStart", "createdAt", "updatedAt")
    ${src}
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "ChatRateBucket"."windowStart" <= ${cut} THEN 1 ELSE "ChatRateBucket"."count" + 1 END,
      "windowStart" = CASE WHEN "ChatRateBucket"."windowStart" <= ${cut} THEN ${at} ELSE "ChatRateBucket"."windowStart" END,
      "updatedAt" = NOW()
    RETURNING "count", "windowStart")`;
}

/**
 * C5.1-fix (CRM tracking) — นับหลายถังใน **คำสั่งเดียว** (INSERT … ON CONFLICT ต่อถังเป็น CTE ของคำสั่งเดียวกัน)
 * ความหมายต่อถังเท่า `checkRateLimitDb` ทุกประการ (fixed window · atomic ต่อแถว · กติกา "ห้ามแตกเป็นหลายคำสั่ง" ยังจริง)
 * `chain: true` = ถังถัดไปนับเฉพาะเมื่อถังก่อนหน้า "ผ่าน" (ลำดับเดิมของ gate ที่ถาม IP ก่อนแล้วค่อยถามถังของเว็บ — IP ที่เกินเพดานแล้ว
 *   ไม่กินโควตาของเว็บร้าน) · ถังที่ไม่ได้นับ = `{ ok: false, skipped: true }`
 * fail-open แบบเดียวกัน: ฐานล่ม = ผ่านทุกถัง (มีบันทึก ops)
 * 🔴 กุญแจซ้ำกันในชุดเดียว = ปฏิเสธ (ON CONFLICT แตะแถวเดิมสองครั้งในคำสั่งเดียวไม่ได้)
 */
export async function checkRateLimitDbMany(
  entries: readonly { key: string; limit: number; windowMs: number }[],
  opts: { chain?: boolean; now?: number } = {},
): Promise<(RateVerdict & { skipped?: boolean })[]> {
  const now = opts.now ?? Date.now();
  if (entries.length === 0) return [];
  if (new Set(entries.map((e) => e.key)).size !== entries.length) throw new Error("checkRateLimitDbMany: กุญแจซ้ำกันในชุดเดียว");
  try {
    const ctes = entries.map((e, i) =>
      rateBucketCte(`r${i}`, e.key, e.windowMs, now, opts.chain && i > 0 ? { after: `r${i - 1}`, limit: entries[i - 1]!.limit } : undefined),
    );
    const cols = entries.map((_, i) => Prisma.sql`(SELECT "count" FROM ${Prisma.raw(`r${i}`)}) AS ${Prisma.raw(`"c${i}"`)}, (SELECT "windowStart" FROM ${Prisma.raw(`r${i}`)}) AS ${Prisma.raw(`"w${i}"`)}`);
    const rows = await prisma.$queryRaw<Record<string, number | Date | null>[]>`WITH ${Prisma.join(ctes, ", ")} SELECT ${Prisma.join(cols, ", ")}`;
    const r = rows[0] ?? {};
    return entries.map((e, i) => {
      const count = r[`c${i}`];
      const ws = r[`w${i}`];
      if (count === null || count === undefined) return { ok: false, skipped: true };
      const n = Number(count);
      if (n <= e.limit) return { ok: true, count: n };
      const resetAt = (ws instanceof Date ? ws.getTime() : now) + e.windowMs;
      return { ok: false, count: n, retryAfterSec: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
    });
  } catch (e) {
    void logOps("WARN", "rate-limit-db", "ตัวจำกัดอัตราบน DB ทำงานไม่ได้ — ปล่อยผ่านชั่วคราว", {
      detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    }).catch(() => {});
    return entries.map(() => ({ ok: true }));
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
