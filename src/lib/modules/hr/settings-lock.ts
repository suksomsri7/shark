// HR-SET-1 ▸ ตัวเขียน AppSystem.settings ของ HR ทุกตัวผ่านไฟล์นี้ที่เดียว (ตรวจโดย scripts/qc-hr-set-1.mts S1.2 — ห้ามเขียน settings เองในไฟล์อื่น)
//   ลำดับล็อก (ทุกผู้เขียนเหมือนกัน ⇒ ไม่มีวงรอ):
//     (1) advisory hr:clockpolicy:<ระบบ>  →  (2) ล็อก advisory ของผู้เรียกเอง (ถ้ามี เช่น hr:otpolicy · hr:lifepolicy · hr:attpay:policy) ตามลำดับที่ส่งมา
//     →  (3) ล็อกแถว AppSystem (id · tenantId · type HR) FOR UPDATE  →  อ่านค่าใหม่ใต้ล็อก
//   เขียน: writeHrSettingsKeys อ่านแถวซ้ำใต้ล็อกแถว แล้วเปลี่ยนเฉพาะคีย์ของผู้เรียก (undefined = ลบคีย์) — คีย์อื่นคงค่าล่าสุดที่ commit แล้วเสมอ
//   ใช้ใน $transaction เดียวกันเท่านั้น (ล็อกทั้งหมดเป็นแบบ xact — ปล่อยเมื่อ tx จบ) ◂
import type { Prisma } from "@prisma/client";

type Ctx = { tenantId: string; systemId: string };
type Tx = Pick<Prisma.TransactionClient, "$executeRaw" | "$queryRaw" | "appSystem">;

const objOf = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {});
/** ล็อกตามลำดับ (1)→(2)→(3) แล้วคืนค่าตั้งล่าสุด (สำเนา) · null = ไม่พบระบบ HR นี้ในร้าน */
export async function lockHrSettings(tx: Tx, ctx: Ctx, ownLocks: readonly string[] = []): Promise<{ id: string; settings: Record<string, unknown> } | null> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr:clockpolicy:${ctx.systemId}`}, 0))`;
  for (const key of ownLocks) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  const row = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "AppSystem" WHERE "id" = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND "type" = 'HR'::"SystemType" FOR UPDATE`;
  if (!row.length) return null;
  const s = await tx.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "HR" }, select: { id: true, settings: true } });
  return s ? { id: s.id, settings: objOf(s.settings) } : null;
}

/** เปลี่ยนเฉพาะคีย์ใน patch บนค่าที่อ่านใหม่ใต้ล็อกแถว (undefined = ลบคีย์) · คืน { count } แบบ updateMany (1 = สำเร็จ) */
export async function writeHrSettingsKeys(tx: Tx, ctx: Ctx, patch: Record<string, unknown>): Promise<{ count: number }> {
  // ต้องเรียก lockHrSettings ใน tx เดียวกันก่อนเสมอ: ตรวจว่า backend นี้ (= tx นี้ — ล็อก xact ปล่อยเมื่อ tx จบ) ถือ advisory hr:clockpolicy:<ระบบ> อยู่จริง
  //   ไม่ถือ ⇒ โยน error (ข้อผิดพลาดของโค้ด ไม่ใช่ของผู้ใช้) — กันการเขียนข้าม (1) แล้วไปถือแถวก่อน clockpolicy ⇒ วงรอ (HR-SET-1 review m2)
  const held = await tx.$queryRaw<{ ok: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM pg_locks l, (SELECT hashtextextended(${`hr:clockpolicy:${ctx.systemId}`}, 0) AS k) h
      WHERE l.locktype = 'advisory' AND l.pid = pg_backend_pid() AND l.granted AND l.mode = 'ExclusiveLock' AND l.objsubid = 1
        AND l.classid::text::bigint = ((h.k >> 32) & 4294967295) AND l.objid::text::bigint = (h.k & 4294967295)
    ) AS "ok"`;
  if (!held[0]?.ok) throw new Error("writeHrSettingsKeys: lockHrSettings(tx, ctx) must run first in the same transaction");
  // ล็อกแถวซ้ำ (ถืออยู่แล้วจาก lockHrSettings — ซ้ำได้ใน tx เดียวกัน) แล้วอ่านใหม่ ⇒ คีย์อื่นเป็นค่าล่าสุดที่ commit แล้วเสมอ
  const row = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "AppSystem" WHERE "id" = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND "type" = 'HR'::"SystemType" FOR UPDATE`;
  if (!row.length) return { count: 0 };
  const cur = await tx.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "HR" }, select: { id: true, settings: true } });
  if (!cur) return { count: 0 };
  const next = objOf(cur.settings);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete next[k];
    else next[k] = v;
  }
  return tx.appSystem.updateMany({ where: { id: cur.id, tenantId: ctx.tenantId }, data: { settings: next as Prisma.InputJsonValue } });
}
