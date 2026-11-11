// tender.ts — POS P2.9 ▸ บัตรของขวัญ/เครดิตร้านเป็น "วิธีชำระ" (ฝั่งสมาชิก · ห่อบาง ๆ เหนือ facade บัตรกำนัล) ◂
//
// 🔴 POS ห้าม import `@/lib/modules/giftcard` ตรง (hard rule P1.12 · ST2 ของ P2.9) — ทุกอย่างของบัตรที่หน้าขาย/ใบคืน/คิวต้องใช้ผ่านไฟล์นี้
// 🔴 ห่อบาง ๆ ล้วน: กติกาอยู่ที่ giftcard/service.ts (prepare* · useTender · refundTenderUse · refundToCard · issueStoreCredit)
// 🔴 ข้อผิดพลาดที่มีรหัส (GiftCardTenderError: GIFT_CARD_NOT_FOUND · GIFT_CARD_PIN · GIFT_CARD_LOCKED · GIFT_CARD_CHANGED · STORE_CREDIT_NOT_OWNER)
//    ผ่านออกไปตามเดิม — ผู้เรียกแยกด้วย `tenderErrorCode(e)` (ไม่ต้องรู้จักคลาสของโมดูลบัตร)

import * as giftcard from "@/lib/modules/giftcard";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** รหัสของข้อผิดพลาดวิธีชำระด้วยบัตร (ไม่ใช่ = null) */
export function tenderErrorCode(e: unknown): giftcard.GiftCardTenderCode | null {
  return e instanceof giftcard.GiftCardTenderError ? e.code : null;
}

/** R2 — ดูบัตรของขวัญ (ไม่ใช้ PIN · ไม่เขียน) · ไม่พบ/ร้านอื่น/เลขเครดิตร้าน = null */
export function giftCardTenderLookup(tenantId: string, number: unknown): Promise<giftcard.TenderLookupDto | null> {
  return giftcard.tenderLookup(tenantId, number);
}

/** R3 — ตรวจบัตรของขวัญ + PIN ก่อนตัวนับใบเสร็จ (ไม่ตัดยอด) */
export function prepareGiftCardTender(tenantId: string, input: { number: string; pin: string; satang: number }, db?: Tx, pinDb?: Tx) {
  return giftcard.prepareGiftTender(tenantId, input, db, pinDb); // POS P2.9 ▸ fix2: pinDb = tx สั้นของการตรวจก่อนบิล (commit เสมอ) ◂
}

/** POS P2.9 ▸ fix2: ตรวจบัตรของขวัญซ้ำใน tx ของบิล หลัง PIN ผ่านขั้นตรวจก่อนบิลแล้ว (ไม่เทียบ PIN ซ้ำ) ◂ */
export function recheckGiftCardTender(tenantId: string, input: { number: string; satang: number }, db?: Tx) {
  return giftcard.recheckGiftTender(tenantId, input, db);
}

/** R7 — ตรวจเครดิตร้านของสมาชิกของบิล (ไม่มี PIN) */
export function prepareStoreCreditTender(tenantId: string, input: { systemId: string; customerId: string; satang: number }, db?: Tx) {
  return giftcard.prepareStoreCreditTender(tenantId, input, db);
}

/** ล็อกแถวบัตรของบิล (เรียง id) — ใน tx ของบิล ก่อนตัวนับใบเสร็จ */
export function lockTenderCards(tx: Tx, giftCardIds: string[]) {
  return giftcard.lockTenderCards(tx, giftCardIds);
}

/** R3 R7 — ตัดยอดของแถวชำระใน tx ของบิล (USE refType PosPayment · ไม่ลงบัญชีเอง — มติ 1) */
export function useGiftCardTender(tenantId: string, input: { giftCardId: string; satang: number; saleId: string; paymentId: string; byUserId?: string | null }, tx: Tx) {
  return giftcard.useTender(tenantId, input, tx);
}

/** R5 (มติ 10) — void บิล: ย้อน USE ของแถวชำระทุกรายการ (idempotent ต่อ USE · walk-in ได้ · ไม่มี JV) */
export async function refundGiftCardTender(tenantId: string, input: { txnIds: string[] }): Promise<{ refunded: number }> {
  let refunded = 0;
  for (const txnId of [...new Set(input.txnIds.filter(Boolean))]) {
    const r = await giftcard.refundTenderUse(tenantId, { txnId });
    if (r.refunded) refunded += 1;
  }
  return { refunded };
}

/** R6 — บัตรรับเงินคืนได้ไหม (ACTIVE/DEPLETED · ยังไม่หมดอายุ) */
export function giftCardRefundable(tenantId: string, giftCardId: string, db?: Tx) {
  return giftcard.tenderRefundable(tenantId, giftCardId, db);
}

/** R6 — คืนเงินเข้าบัตรเดิมใน tx ของใบคืน */
export function refundToGiftCard(tenantId: string, input: { giftCardId: string; satang: number; idempotencyKey: string; refundSaleId: string; byUserId?: string | null }, tx: Tx) {
  return giftcard.refundToCard(tenantId, input, tx);
}

/** R7 — ออก/เติมเครดิตร้านของสมาชิกใน tx ของใบคืน */
export function issueStoreCredit(tenantId: string, input: { systemId: string; customerId: string; satang: number; idempotencyKey: string; refundSaleId: string; byUserId?: string | null }, tx: Tx) {
  return giftcard.issueStoreCredit(tenantId, input, tx);
}

/** R7 — เครดิตร้านของสมาชิก (อ่านอย่างเดียว · ไม่มี = null) */
export function storeCreditOf(tenantId: string, systemId: string, customerId: string) {
  return giftcard.storeCreditCardOf(tenantId, systemId, customerId);
}

/** R10 — ข้อมูลบัตรของแถวชำระ/แถวคืน (ชนิด · เลขปิดบัง · ยอดหลังรายการ) */
export function tenderCardInfo(tenantId: string, txnIds: string[]) {
  return giftcard.tenderCardInfo(tenantId, txnIds);
}

/** R2 (ช่องจอชำระ) — ร้านนี้เปิดใช้บัตรกำนัลอยู่ไหม */
export function giftCardTenderEnabled(tenantId: string) {
  return giftcard.tenderEnabled(tenantId);
}

/** POS P2.9 ▸ fix3 N4: id บัตรของแถวชำระเดิม → หมายเลข (เทียบคำขอซ้ำคีย์เดิม · ไม่ส่งออกจอ) ◂ */
export function giftCardNumbersByIds(tenantId: string, giftCardIds: string[], db?: Tx) {
  return giftcard.tenderCardNumbers(tenantId, giftCardIds, db);
}
