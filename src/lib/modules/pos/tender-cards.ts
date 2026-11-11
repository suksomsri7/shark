// tender-cards.ts — POS P2.9 ▸ R10: ข้อมูลบัตรของแถวชำระ/แถวคืน (ใบเสร็จ · รายละเอียดบิล) ผ่าน member facade (โหลดตอนใช้) ◂
// 🔴 ไฟล์เบา: ไม่ import register/service (ตัวอ่านใบเสร็จ/บิลเรียกได้โดยไม่เกิดวงโหลดไฟล์) · แถวที่ไม่มี giftCardTxnId = ไม่มี query
import type { ReceiptPaymentCard } from "./receipt-render";

/** txnId → {kind, numberMasked, balanceAfterSatang} ของแถวที่มี giftCardTxnId (ไม่มีแถวบัตร = Map ว่าง ไม่มี query) */
export async function paymentCards(tenantId: string, payments: { giftCardTxnId?: string | null }[]): Promise<Map<string, ReceiptPaymentCard>> {
  const ids = payments.map((p) => p.giftCardTxnId ?? "").filter(Boolean);
  const out = new Map<string, ReceiptPaymentCard>();
  if (!ids.length) return out;
  const member = await import("@/lib/modules/member");
  for (const c of await member.tenderCardInfo(tenantId, ids)) out.set(c.txnId, { kind: c.kind, numberMasked: c.numberMasked, balanceAfterSatang: c.balanceAfterSatang });
  return out;
}
