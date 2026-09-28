// payments-shared.ts — ค่าคงที่/ชนิดบริสุทธิ์ของ "ทางเดินเงิน" ของ CRM v2 (ใบ C2.7 · มติผู้คุมงาน 24 ก.ย. 2569)
//
// 🔴 ไฟล์นี้ไม่แตะ prisma/เน็ต — หน้า 'use client' และ `deals.ts` (ที่ห้ามวนกลับไป import `payments.ts`) ใช้ตัวนี้ได้
// 🔴 มติ R-C.1 · C29: ใบ C2.7 **ไม่มี migration ไม่มีคอลัมน์ใหม่ ไม่มี event ใหม่** — ธง "เอกสารถูกยกเลิก" จึงเป็น
//    แท็กของดีล (`CrmDeal.tags`) และสายโยง "บิลหน้าร้าน ↔ ดีล" อยู่ที่ `CrmDealPayment(dealId,"POS_SALE",saleId)` เท่านั้น

/** ธง "เอกสารบัญชีของดีลนี้ถูกยกเลิก" — แท็กของดีล (ไม่มีคอลัมน์ · มติผู้คุมงาน C2.7 addendum 3) */
export const DEAL_VOIDED_TAG = "เอกสารถูกยกเลิก";

/** เพดานรายการดีลที่หน้าขายเลือกได้ต่อ Party (มติ C2.7 · สัญญา A `openDealsForParty`) */
export const POS_LINK_LIMIT = 20;

/** ชนิดของ "ของที่จ่ายเงินมา" ที่ผูกกับดีลได้ (R-C.4 — สองตัวนี้คือของที่ลูกค้าจ่ายมาจริง) */
export const MONEY_REF_TYPES = ["PAYMENT", "POS_SALE"] as const;

/**
 * มติรอบ 2 (SF-2) — "ปิดยอดเอกสาร": ภาษีหัก ณ ที่จ่ายก็คือรายได้ที่ร้านได้รับ แต่ `account.payment.recorded`
 * ส่งมาเฉพาะ "เงินเข้าจริง" (ไม่รวม WHT) ทั้งที่บัญชีถือว่าใบแจ้งหนี้ชำระครบแล้ว ⇒ ตอน `account.invoice.paid`
 * เราเติมส่วนต่างเป็นแถวเดียว `refType "DOC_SETTLE" · refId = id ของเอกสาร` (กันซ้ำด้วย unique เดิม)
 * 🔴 ไม่ใช่ "เงินอีกก้อน" — เป็นการปิดยอดของเอกสารใบนั้นให้เท่ากับยอดเต็ม จึงแยก refType ออกจาก R-C.4 ชัด ๆ
 */
export const DOC_SETTLE_REF_TYPE = "DOC_SETTLE";

/**
 * CRM C5.4-C ▸ (L2-M3 · มติผู้คุมงาน SF1) ใบลดหนี้ของเอกสารที่ลูกค้า **จ่ายเกินไปแล้ว** = เงินที่ต้องคืน ⇒ แถวเดียวต่อ (ดีล, เอกสารต้นทาง)
 * `refType "CREDIT_NOTE" · refId = id ของเอกสารต้นทาง (ใบแจ้งหนี้)` · satang **ติดลบ** = −ส่วนที่คืน
 *   ส่วนที่คืน = clamp(ยอดตัดหนี้ที่ยังมีผล + Σ ใบลดหนี้ − ยอดเอกสาร, 0, Σ ใบลดหนี้) และไม่เกินเงินที่ดีลนับจากเอกสารนั้น
 *   (ใบลดหนี้ก่อนรับเงิน = ลดหนี้ ไม่ใช่คืนเงิน ⇒ ลูกค้าจ่ายน้อยลงเอง ไม่มีแถว) · กระทบยอดใหม่ทุกครั้งที่ใบลดหนี้/การรับชำระของเอกสารนั้นเปลี่ยน
 *   แบบเดียวกับแถวปิดยอด (ถอน → ปลุกด้วย countedAt ใหม่) ⇒ คอมมิชชันใช้ "ร่าง" เดิมได้
 * มูลค่าที่ชนะลดด้วยใบลดหนี้ **ทุกใบ** (จ่ายแล้วหรือยัง) — คิดที่ฐานของเอกสารหลัก (`anchorWonOf`) ไม่ใช่จากแถวนี้ ◂
 */
export const CREDIT_NOTE_REF_TYPE = "CREDIT_NOTE";

/** ชนิดทั้งหมดที่โผล่ในตารางเงินของดีลได้ (R-C.4 สองตัว + ตัวปิดยอดเอกสารของ SF-2 + ใบลดหนี้ของ C5.4-C) */
export const ALL_MONEY_REF_TYPES = ["PAYMENT", "POS_SALE", "DOC_SETTLE", "CREDIT_NOTE"] as const;

/**
 * CRM C5.4-C ▸ มติผู้คุมงาน (คำถามเจ้าของ Q14 ยังค้าง): "มูลค่าที่ชนะ" ของทุกหน้า (รายงาน · หน้าแรก · โควตา · REST · CSV)
 * คิดบนฐาน **ก่อน VAT** — ค่าคงที่ตัวเดียวนี้คือจุดสลับ ถ้าเจ้าของตัดสินเป็นรวม VAT ให้เปลี่ยนเป็น "VAT_INCL"
 * (หมายเหตุ: ดีลที่ชนะโดยไม่มีเงินเข้าใช้ `valueSatang` ซึ่งเป็นยอดก่อน VAT เสมอ) ◂
 */
export const WON_VALUE_BASIS: "PRE_VAT" | "VAT_INCL" = "PRE_VAT";
export type MoneyRefType = (typeof ALL_MONEY_REF_TYPES)[number];

/** สถานะของแถวเงินในดีล: ผูกแล้ว (ยังไม่นับ) → นับแล้ว → ถอนคืน */
export const MONEY_STATUSES = ["LINKED", "COUNTED", "REVERSED"] as const;
export type MoneyStatus = (typeof MONEY_STATUSES)[number];

/** เพดานยอดเงินต่อรายการ (สตางค์) — กันเลขเพี้ยน/เลขมหึมาจาก payload ที่เชื่อไม่ได้ (AUDIT-CLASS X6) */
export const MONEY_MAX_SATANG = 1_000_000_000_00; // ฿1,000,000,000

/** ยอดเงินจาก payload ใช้ได้ไหม — จำนวนเต็มสตางค์ > 0 และไม่เกินเพดาน (ทศนิยม/ติดลบ/มหึมา = ใช้ไม่ได้) */
export function isUsableSatang(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v > 0 && v <= MONEY_MAX_SATANG;
}

export type DealMoneyRow = {
  id: string;
  refType: MoneyRefType;
  refId: string;
  satang: number;
  status: MoneyStatus;
  countedAt: Date | null;
};

export type DealMoney = {
  paidSatang: number;
  wonValueSatang: number;
  documentVoided: boolean;
  payments: DealMoneyRow[];
};

export type OpenDealOption = {
  id: string;
  title: string;
  valueSatang: number;
  stageName: string;
  ownerUserId: string | null;
};

export type DealForDoc = { dealId: string; systemId: string; title: string; path: string };

/** `CONFLICT` = มติรอบ 2 (B1): บิลใบนี้ถูกผูกกับดีลอื่นไปแล้ว — เงินก้อนเดียวห้ามนับสองดีล */
export type PaymentsErrorCode = "NOT_FOUND" | "FORBIDDEN" | "VALIDATION" | "CONFIRM_REQUIRED" | "CONFLICT";

/** error ของบริการเงิน — ข้อความไทยที่ไม่โทษผู้ใช้ · `.code` ให้ action/REST แปลงต่อ */
export class PaymentsError extends Error {
  readonly code: PaymentsErrorCode;
  constructor(code: PaymentsErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "PaymentsError";
  }
}
