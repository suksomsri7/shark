// deposit-links.ts — POS P2.9b ▸ ตัวอ่านมัดจำของแถวชำระ (ใบเสร็จ · ลิ้นชักบิล · ปิดวัน) — อ่านอย่างเดียว · ไม่ import register/service (กันวงโหลดไฟล์) ◂
// 🔴 แถว DEPOSIT ที่อ้างใบรับ (refSaleId = PosDeposit.receiptSaleId · CD2-A) เท่านั้น — แถว DEPOSIT ของทางเดิม (จอง/โรงแรม/เช่า) ไม่มีใบ = ไม่แสดงลิงก์
// 🔴 ไม่มีแถวอ้างใบ = ไม่มี query (บิลอื่นทุกใบอ่านเหมือนเดิม)

import { prisma } from "./db";

type Db = typeof prisma;

/** ลิงก์มัดจำของแถวชำระหนึ่งแถว — เลขใบรับ · คงเหลือหลังรายการนี้ (ณ เวลาที่ใช้) */
export type PaymentDepositLink = { depositId: string; receiptNo: string; receiptSaleId: string; remainingAfterSatang: number };

/**
 * แถวชำระ (PosPayment.id) → ลิงก์มัดจำ · คงเหลือหลังรายการ = ยอดมัดจำ − Σ(APPLY + REFUND − RESTORE) ของรายการจนถึง APPLY ของแถวนี้ (เรียงเวลา, id)
 */
export async function paymentDeposits(
  tenantId: string,
  payments: readonly { id: string; type: string; refSaleId: string | null }[],
  db: Db = prisma,
): Promise<Map<string, PaymentDepositLink>> {
  const out = new Map<string, PaymentDepositLink>();
  const rows = payments.filter((p) => p.type === "DEPOSIT" && p.refSaleId);
  if (!rows.length) return out;
  const deps = await db.posDeposit.findMany({ where: { tenantId, receiptSaleId: { in: rows.map((r) => r.refSaleId!) } }, select: { id: true, amountSatang: true, receiptNo: true, receiptSaleId: true } });
  if (!deps.length) return out;
  const txns = await db.posDepositTxn.findMany({
    where: { tenantId, depositId: { in: deps.map((d) => d.id) }, type: { in: ["APPLY", "RESTORE", "REFUND"] } },
    select: { id: true, depositId: true, type: true, satang: true, paymentId: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  for (const d of deps) {
    let left = d.amountSatang;
    for (const t of txns) {
      if (t.depositId !== d.id) continue;
      left += t.type === "RESTORE" ? t.satang : -t.satang;
      if (t.type === "APPLY" && t.paymentId) out.set(t.paymentId, { depositId: d.id, receiptNo: d.receiptNo ?? "", receiptSaleId: d.receiptSaleId, remainingAfterSatang: Math.max(0, left) });
    }
  }
  return out;
}

// ═══════ POS P2.9b ▸ fix2 มติ 3 (hunter N2): 4 หลักท้ายของเบอร์ผู้ฝาก (มัดจำ walk-in ที่บันทึกเบอร์) — ตัวนับผิดต่อมัดจำ ◂ ═══════
//   แบบ "จองช่องก่อนเทียบ" ของ PIN บัตรของขวัญ (giftcard verifyPin): ทุกการเทียบต้องได้ช่องจากตัวนับก่อน (UPDATE … RETURNING คำสั่งเดียว · ≤ 5 ช่องต่อรอบล็อก) ·
//   ช่องที่ 5 ตั้งล็อก 15 นาทีในคำสั่งเดียวกัน · ไม่ได้ช่อง (ล็อกอยู่) = LOCKED โดยไม่เทียบ · ถูก = คืนตัวนับเป็น 0 เฉพาะเมื่อไม่ถูกล็อกโดยคำขอผิดอื่น ·
//   เขียนด้วย client กลาง (นอกธุรกรรมของบิล — ผิดแล้วตัวนับต้องคงอยู่) · ไม่ส่ง 4 หลัก = ไม่นับ (ไม่ใช่การเดา)
export const DEPOSIT_PHONE_MAX_FAIL = 5;
export const DEPOSIT_PHONE_LOCK_MINUTES = 15;
export type DepositPhoneCheck = "OK" | "WRONG" | "LOCKED" | "MISSING";
export async function checkDepositPhone(tenantId: string, d: { id: string; phoneLast4: string | null }, given: string | null | undefined, db: Db = prisma): Promise<DepositPhoneCheck> {
  if (!d.phoneLast4) return "OK";
  const MAX = DEPOSIT_PHONE_MAX_FAIL;
  const MIN = DEPOSIT_PHONE_LOCK_MINUTES;
  if (!given) {
    const cur = await db.posDeposit.findFirst({ where: { id: d.id, tenantId }, select: { phoneLockedUntil: true } });
    return cur?.phoneLockedUntil && cur.phoneLockedUntil.getTime() > Date.now() ? "LOCKED" : "MISSING";
  }
  const rows = await db.$queryRaw<{ phoneFailedCount: number }[]>`
    UPDATE "PosDeposit"
       SET "phoneFailedCount" = (CASE WHEN "phoneLockedUntil" IS NOT NULL AND "phoneLockedUntil" <= now() THEN 0 ELSE "phoneFailedCount" END) + 1,
           "phoneLockedUntil" = CASE WHEN (CASE WHEN "phoneLockedUntil" IS NOT NULL AND "phoneLockedUntil" <= now() THEN 0 ELSE "phoneFailedCount" END) + 1 >= ${MAX}::int
                                     THEN now() + make_interval(mins => ${MIN}::int) ELSE NULL END
     WHERE id = ${d.id} AND "tenantId" = ${tenantId}
       AND (("phoneLockedUntil" IS NULL AND "phoneFailedCount" < ${MAX}::int) OR "phoneLockedUntil" <= now())
     RETURNING "phoneFailedCount"`;
  if (!rows[0]) return "LOCKED";
  const slot = Number(rows[0].phoneFailedCount);
  if (given === d.phoneLast4) {
    const reset = await db.$executeRaw`
      UPDATE "PosDeposit" SET "phoneFailedCount" = 0, "phoneLockedUntil" = NULL
       WHERE id = ${d.id} AND ("phoneLockedUntil" IS NULL OR "phoneFailedCount" = ${slot}::int)`;
    return reset === 0 ? "LOCKED" : "OK";
  }
  return slot >= MAX ? "LOCKED" : "WRONG";
}
/** เบอร์ของมัดจำ walk-in ที่บันทึกเบอร์: ปิดหมดเว้น 3 ตัวแรก (ไม่มี 4 หลักท้ายในตัวอ่านใด · มติ 3) */
export const maskDepositPhone = (masked: string | null): string | null => (masked ? `${masked.replace(/[^0-9]/g, "").slice(0, 3) || masked.slice(0, 3)}-xxx-xxxx` : null);
