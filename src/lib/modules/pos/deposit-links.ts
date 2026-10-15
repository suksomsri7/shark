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
