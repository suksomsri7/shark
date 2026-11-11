// refund-tenders-shared.ts — POS P2.9U ▸ ชนิดข้อมูลของตัวเลือกคืนเงินเข้าบัตร/เครดิตร้าน (จอ 12 · มติผู้คุม P2.9U ข้อ 8 · hunt H1) ◂
// 🔴 ไม่แตะ prisma — จอ 'use client' (BillsClient) import ได้ · ตัวอ่านจริง = refund-tenders.ts · action = refund-tender-actions.ts
// 🔴 ตัวเลขทั้งหมดเป็นเพดาน "แสดงผล" จากแถวชำระของบิล + ใบคืนก่อนหน้า — refundSale (refund.ts planRefundTenders) ตัดสินจริงทุกครั้ง

import type { RefundRefusal } from "./refund-shared";

/** บัตรของขวัญหนึ่งใบที่จ่ายบิลนี้ — capSatang = ส่วนที่บัตรจ่าย − ที่คืนเข้าใบนั้นแล้ว · refundable = คืนเข้าบัตรได้ (ACTIVE/DEPLETED · ยังไม่หมดอายุ) */
export type RefundTenderCard = { giftCardId: string; numberMasked: string; paidSatang: number; refundedSatang: number; capSatang: number; refundable: boolean };
export type RefundTenderOptions = {
  ok: true;
  cards: RefundTenderCard[];
  /** บิลของสมาชิก ⇒ ชิป "เครดิตร้าน · เข้ากระเป๋าสมาชิก" */
  memberBill: boolean;
  /** บิลมีแถวบัตร/เครดิตร้าน ⇒ เงินจริง (CASH/PROMPTPAY/TRANSFER/CARD) คืนได้ไม่เกิน cashLikeCapSatang (− ทิป − ที่คืนเป็นเงินแล้ว · H1) · null = ไม่จำกัดเพิ่ม */
  cashLikeCapSatang: number | null;
  /** ส่วนของบัตรที่คืนเข้าบัตรไม่ได้ (ระงับ/หมดอายุ) ที่ยังไม่ถูกคืน — บิล walk-in คืนเป็นเงินได้เฉพาะส่วนนี้ + ต้องมีเหตุผล (ผู้จัดการ/อนุมัติ) */
  stuckCardSatang: number;
};
export type RefundTenderOptionsResult = RefundTenderOptions | RefundRefusal;

/** ชิปวิธีคืนที่เลือก (จอ 12) — CASHLIKE = เงินสด/พร้อมเพย์/โอน/บัตร EDC */
export type RefundPick =
  | { kind: "CASHLIKE"; type: "CASH" | "PROMPTPAY" | "TRANSFER" | "CARD" }
  | { kind: "GIFT_CARD"; giftCardId: string }
  | { kind: "STORE_CREDIT" }
  | { kind: "PLATFORM" };
export type RefundAllocRow = { type: "CASH" | "PROMPTPAY" | "TRANSFER" | "CARD" | "PLATFORM" | "GIFT_CARD" | "STORE_CREDIT"; amountSatang: number; giftCardId?: string };
/**
 * แบ่งยอดคืนเป็นแถวตามสัญญา refundSale (มติ 8 · H1) — ชิปที่เลือกรับก่อนเท่าเพดานของมัน · ที่เหลือ: บัตรของบิลที่คืนเข้าได้ (ตามลำดับ) →
 * เครดิตร้าน (บิลสมาชิก) → เงินสด (เพดานเงินจริง) → ส่วนของบัตรที่ใช้ไม่ได้เป็นเงิน (walk-in เท่านั้น · ต้องมีเหตุผล = cardShareToCash) ·
 * uncovered > 0 = ยอดนี้คืนด้วยชิปนี้ไม่ได้ · บิลที่ไม่มีแถวบัตร/เครดิต = แถวเดียวของชิปที่เลือก (พฤติกรรม P1.16 เดิม)
 */
export function allocateRefund(totalSatang: number, pick: RefundPick, opts: RefundTenderOptions | null): { rows: RefundAllocRow[]; cardShareToCash: number; uncovered: number } {
  if (!(totalSatang > 0)) return { rows: [], cardShareToCash: 0, uncovered: 0 };
  if (pick.kind === "PLATFORM") return { rows: [{ type: "PLATFORM", amountSatang: totalSatang }], cardShareToCash: 0, uncovered: 0 };
  const tender = !!opts && (opts.cards.length > 0 || opts.cashLikeCapSatang !== null);
  if (!tender) {
    if (pick.kind === "CASHLIKE") return { rows: [{ type: pick.type, amountSatang: totalSatang }], cardShareToCash: 0, uncovered: 0 };
    if (pick.kind === "STORE_CREDIT") return { rows: [{ type: "STORE_CREDIT", amountSatang: totalSatang }], cardShareToCash: 0, uncovered: 0 };
    return { rows: [], cardShareToCash: 0, uncovered: totalSatang };
  }
  const o = opts!;
  const rows: RefundAllocRow[] = [];
  const add = (r: RefundAllocRow) => {
    if (r.amountSatang <= 0) return;
    const same = rows.find((x) => x.type === r.type && x.giftCardId === r.giftCardId);
    if (same) same.amountSatang += r.amountSatang;
    else rows.push({ ...r });
  };
  let left = totalSatang;
  let cashLeft = o.cashLikeCapSatang ?? Number.MAX_SAFE_INTEGER;
  const cards = o.cards.filter((c) => c.refundable && c.capSatang > 0);
  const cashType = pick.kind === "CASHLIKE" ? pick.type : "CASH";
  if (pick.kind === "CASHLIKE") {
    const a = Math.min(left, cashLeft);
    add({ type: pick.type, amountSatang: a });
    cashLeft -= a;
    left -= a;
  } else if (pick.kind === "GIFT_CARD") {
    const c = cards.find((x) => x.giftCardId === pick.giftCardId);
    const a = Math.min(left, c?.capSatang ?? 0);
    if (c) add({ type: "GIFT_CARD", amountSatang: a, giftCardId: c.giftCardId });
    left -= a;
  } else if (pick.kind === "STORE_CREDIT" && o.memberBill) {
    add({ type: "STORE_CREDIT", amountSatang: left });
    left = 0;
  }
  for (const c of cards) {
    if (left <= 0) break;
    if (pick.kind === "GIFT_CARD" && c.giftCardId === pick.giftCardId) continue;
    const a = Math.min(left, c.capSatang);
    add({ type: "GIFT_CARD", amountSatang: a, giftCardId: c.giftCardId });
    left -= a;
  }
  if (left > 0 && o.memberBill) {
    add({ type: "STORE_CREDIT", amountSatang: left });
    left = 0;
  }
  if (left > 0 && cashLeft > 0) {
    const a = Math.min(left, cashLeft);
    add({ type: cashType, amountSatang: a });
    cashLeft -= a;
    left -= a;
  }
  let cardShareToCash = 0;
  if (left > 0 && !o.memberBill && o.stuckCardSatang > 0) {
    cardShareToCash = Math.min(left, o.stuckCardSatang);
    add({ type: cashType, amountSatang: cardShareToCash });
    left -= cardShareToCash;
  }
  return { rows, cardShareToCash, uncovered: left };
}
