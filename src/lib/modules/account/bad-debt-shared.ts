// bad-debt-shared.ts — ACC T5c (เลน 2) ▸ สถานะแสดงผล "ตัดหนี้สูญ" ของใบฝั่งขาย (pure · ใช้ได้ทั้ง server/client)
//
//   ใบที่ปิดด้วยการตัดหนี้สูญมีสถานะในฐานเป็น PAID (ตัดหนี้สูญ = แถวรับชำระช่องทาง BAD_DEBT · T5.7) — ห้ามอ่านว่า "ชำระเงินแล้ว"
//   ⇒ ป้ายที่คำนวณ (ไม่แก้สถานะในฐาน · ไม่ทำลายข้อมูลเดิม): ตัดทั้งใบไม่มีเงินจริง = "ตัดหนี้สูญ" · มีทั้งเงินจริงและตัด/ยังค้าง = "ตัดหนี้สูญบางส่วน"
//   รายงานลูกหนี้/อายุหนี้ใช้ยอดค้าง (grandTotal − paidTotal) อยู่แล้ว ⇒ ส่วนที่ตัดไม่ถูกนับเป็นหนี้ค้าง และไม่นับเป็นเงินรับ (ช่องทาง BAD_DEBT ไม่มีบัญชีเงิน)
export type BadDebtState = "FULL" | "PARTIAL";
export type BadDebtStatusView = { state: BadDebtState; writtenOffSatang: number; labelTh: string };

export const BAD_DEBT_LABEL_TH: Record<BadDebtState, string> = { FULL: "ตัดหนี้สูญ", PARTIAL: "ตัดหนี้สูญบางส่วน" };

/** payments = รายการชำระของใบ (ไม่ส่งรายการที่ยกเลิก หรือส่งพร้อม voidedAt) */
export function badDebtStatusOf(
  doc: { status: string },
  payments: readonly { channel: string; amount: number; voidedAt?: Date | string | null }[] | null | undefined,
): BadDebtStatusView | null {
  if (!payments?.length) return null;
  if (doc.status === "VOIDED" || doc.status === "CANCELLED" || doc.status === "DRAFT") return null;
  let writtenOff = 0;
  let other = 0;
  for (const p of payments) {
    if (p.voidedAt) continue;
    if (p.channel === "BAD_DEBT") writtenOff += p.amount;
    else other += p.amount;
  }
  if (writtenOff <= 0) return null;
  const state: BadDebtState = doc.status === "PAID" && other === 0 ? "FULL" : "PARTIAL";
  return { state, writtenOffSatang: writtenOff, labelTh: BAD_DEBT_LABEL_TH[state] };
}
