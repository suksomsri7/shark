// http-errors.ts — คำปฏิเสธของ facade POS → รหัส REST ของ `/api/v1/pos` (ใบ P2.13 · brief §3 · มติ 5 · CD6)
//
// facade ของ POS คืน `{ ok: false, code, message }` (ไม่ throw) — แปลที่นี่ที่เดียว (แบบ CRM `toCrmApiError`):
//   *_NOT_FOUND → 404 not_found · PERMISSION_DENIED/NO_PERMISSION → 403 forbidden · VALIDATION/PAYMENT_MISMATCH/… → 422 validation ·
//   IDEMPOTENCY_CONFLICT → 409 idempotency_conflict · สถานะ (ออเดอร์/กะ/ช่องทาง/บิล/PRICE_CHANGED) → 409 state_conflict ·
//   *_TAKEN → 409 duplicate · RATE_LIMITED → 429 · BUSY → 503 upstream_unavailable · INTERNAL/UNKNOWN → 500 `internal` (CD6)
// 🔴 `Record<PosRefusalCode, …>` โดยตั้งใจ: facade เพิ่มรหัสใหม่แล้วลืมแปลที่นี่ = typecheck แดง (ไม่ตกไปทางเดาจากคำไทยของแกน)
// 🔴 message_th = ข้อความไทยของ facade (เขียนสำหรับเจ้าของร้านอยู่แล้ว) · message_en = ตารางนี้ (ASCII) · ไม่แตะแกน `mapError`
// 🔴 คำปฏิเสธที่ "คืนค่า" = facade ปฏิเสธก่อนเขียน ⇒ 409/429/503 ติดธง nothingWritten (ปล่อยการจองกันซ้ำ ให้ลองใหม่ด้วยคีย์เดิมได้)

import { ApiError, nothingWritten, type ApiErrorCode, type ApiErrorDetail } from "@/lib/api/respond";
import type { BillsRefusalCode } from "../bills-shared";
import type { CatalogErrorCode } from "../catalog";
import type { ChannelRefusalCode } from "../channel-shared";
import type { PosDeviceRefusalCode } from "../device-shared";
import type { OrderRefusalCode } from "../order-shared";
import type { ReceiptRefusalCode } from "../receipt";
import type { RefundRefusalCode } from "../refund-shared";
import type { RegisterRefusalCode } from "../register-shared";
import type { ReportRefusalCode } from "../reports";
import type { PosSaleErrorCode } from "../service";
import type { ShiftRefusalCode } from "../shift";
import type { TaxInvoiceRefusalCode } from "../tax-invoice-shared";

/** ทุกรหัสปฏิเสธของ facade ที่ op ของ REST POS เรียก */
export type PosRefusalCode =
  | RegisterRefusalCode
  | BillsRefusalCode
  | ReceiptRefusalCode
  | RefundRefusalCode
  | ShiftRefusalCode
  | PosDeviceRefusalCode
  | CatalogErrorCode
  | ChannelRefusalCode
  | OrderRefusalCode
  | ReportRefusalCode
  | TaxInvoiceRefusalCode
  | PosSaleErrorCode;

/** รหัสในซองที่ POS ใช้นอกชุดกลางของแกน — `internal` (500 · CD6) */
export const POS_EXTRA_ERROR_CODES = ["internal"] as const;
export type PosApiErrorCode = ApiErrorCode | (typeof POS_EXTRA_ERROR_CODES)[number];

export type PosRefusalHttp = { status: number; code: PosApiErrorCode; en: string };

/** คำปฏิเสธ → HTTP (ครบทุกรหัส · ตรวจด้วย typecheck) */
export const POS_REFUSAL_HTTP: Record<PosRefusalCode, PosRefusalHttp> = {
  ACCOUNT_PENDING: { status: 409, code: "state_conflict", en: "The accounting link of this shop is not ready yet, so this cannot be done now." },
  ALREADY_CLOCKED: { status: 409, code: "state_conflict", en: "This clock in/out was already recorded today." }, // POS P3.5 ▸ R13 (REST ไม่มี op ลงเวลา — ครบรหัสตาม Record) ◂
  ALREADY_ISSUED: { status: 409, code: "state_conflict", en: "A full tax invoice was already issued for this bill." },
  ALREADY_RECALLED: { status: 409, code: "state_conflict", en: "This held bill was already recalled by another device." },
  ALREADY_RECOUNTED: { status: 409, code: "state_conflict", en: "This shift was already recounted." },
  ALREADY_SET: { status: 409, code: "state_conflict", en: "This value is already set." },
  AMOUNT_MISMATCH: { status: 422, code: "validation", en: "The amount does not match the amount expected." },
  APPROVAL_MISMATCH: { status: 409, code: "state_conflict", en: "The approval does not match this request." },
  APPROVAL_REQUIRED: { status: 409, code: "state_conflict", en: "This change needs a manager approval in the app." },
  BENEFITS_EXCEED_TOTAL: { status: 422, code: "validation", en: "The member benefits are larger than the bill total." },
  BILL_DISCOUNT_EXCEEDS_TOTAL: { status: 422, code: "validation", en: "The bill discount is larger than the bill total." },
  BUSY: { status: 503, code: "upstream_unavailable", en: "The POS is busy saving another change for this shop. Nothing was saved; retry shortly." },
  CHANNEL_BUILTIN_LOCKED: { status: 409, code: "state_conflict", en: "Built-in sales channels cannot be changed this way." },
  CHANNEL_CODE_TAKEN: { status: 409, code: "duplicate", en: "Another sales channel of this branch already uses this code." },
  CHANNEL_INVALID: { status: 422, code: "validation", en: "The sales channel is unknown, archived, closed or belongs to another branch." },
  CHANNEL_LIMIT: { status: 409, code: "state_conflict", en: "This branch reached the maximum number of sales channels." },
  CHANNEL_NOT_FOUND: { status: 404, code: "not_found", en: "The sales channel was not found in this POS system." },
  CHANNEL_NOT_SOLD: { status: 422, code: "validation", en: "This product is not sold on that sales channel." },
  CHANNEL_PAUSED: { status: 409, code: "state_conflict", en: "The sales channel is paused and does not take orders right now." },
  CHANNEL_PAY_MISMATCH: { status: 422, code: "validation", en: "The payment method does not fit the sales channel (platform channels take one PLATFORM payment only)." },
  CONFLICT: { status: 409, code: "state_conflict", en: "The record changed or conflicts with another record. Read it again and retry." },
  COUPON_INVALID: { status: 422, code: "validation", en: "The coupon code cannot be used for this bill." },
  CREDIT_DISABLED: { status: 409, code: "state_conflict", en: "On-account (credit term) sales are turned off for this POS." }, // POS P3.6 ▸ R15 (REST ไม่รับ ON_ACCOUNT — ครบรหัสตาม Record) ◂
  CREDIT_INVOICE_PAID: { status: 409, code: "state_conflict", en: "The invoice of this on-account bill already has a payment. Refund the bill instead of voiding it." }, // POS P3.6 ▸ R8 ◂
  CREDIT_LIMIT_EXCEEDED: { status: 403, code: "forbidden", en: "This bill is over the credit limit of the company. A manager must allow it." }, // POS P3.6 ▸ R6 ◂
  CREDIT_REFUND_EXCEEDS_REMAINING: { status: 409, code: "state_conflict", en: "The refund is larger than what is still owed on the invoice of this on-account bill." }, // POS P3.6 ▸ fix2 H2 ◂
  CREDIT_NOT_ALLOWED: { status: 403, code: "forbidden", en: "This company has no active on-account credit." }, // POS P3.6 ▸ R4 ◂
  CREDIT_TERM_ZERO: { status: 409, code: "state_conflict", en: "The credit term of this company is 0 days, so it must pay now." }, // POS P3.6 ▸ R4 ◂
  CUSTOMER_INVALID: { status: 422, code: "validation", en: "The company of this bill is not valid for this shop." }, // POS P3.6 ▸ R5 ◂
  DBD_NOT_CONFIGURED: { status: 503, code: "upstream_unavailable", en: "The company registry lookup is not configured." },
  DBD_UNAVAILABLE: { status: 503, code: "upstream_unavailable", en: "The company registry lookup is not reachable right now." },
  DEAL_INVALID: { status: 422, code: "validation", en: "This deal cannot be linked to this bill." }, // POS P3.6 ▸ R10 ◂
  DEPOSIT_CLOSED: { status: 409, code: "state_conflict", en: "The deposit was already used up or refunded." },
  DEPOSIT_EXCEEDS: { status: 409, code: "state_conflict", en: "The deposit amount is larger than what is left on it." },
  DEPOSIT_LOCKED: { status: 409, code: "state_conflict", en: "The deposit is locked after too many wrong attempts." },
  DEPOSIT_NOT_FOUND: { status: 404, code: "not_found", en: "The deposit was not found in this branch." },
  DEPOSIT_NOT_OWNER: { status: 409, code: "state_conflict", en: "The deposit does not belong to the customer of this bill." },
  DEVICE_LIMIT: { status: 409, code: "state_conflict", en: "This branch reached the maximum number of registered devices." },
  DEVICE_NOT_FOUND: { status: 404, code: "not_found", en: "The device was not found in this branch." },
  DEVICE_REVOKED: { status: 409, code: "state_conflict", en: "The device was revoked and cannot be used." },
  DISCOUNT_EXCEEDS_LIMIT: { status: 403, code: "forbidden", en: "The discount is larger than this seller is allowed to give." },
  DRAWER_INSUFFICIENT: { status: 409, code: "state_conflict", en: "There is not enough cash in the drawer." },
  GIFT_CARD_CHANGED: { status: 409, code: "state_conflict", en: "The gift card balance or status changed. Read it again and retry." },
  GIFT_CARD_LOCKED: { status: 409, code: "state_conflict", en: "The gift card is locked after too many wrong PIN attempts." },
  GIFT_CARD_NOT_FOUND: { status: 404, code: "not_found", en: "The gift card was not found." },
  GIFT_CARD_PIN: { status: 422, code: "validation", en: "The gift card PIN is wrong." },
  HAS_REFUNDS: { status: 409, code: "state_conflict", en: "The bill already has refunds. Refund the rest instead of voiding it." },
  IDEMPOTENCY_CONFLICT: { status: 409, code: "idempotency_conflict", en: "This key was already used for a different request." },
  INTENT_CONSUMED: { status: 409, code: "state_conflict", en: "The payment request was already used for another bill." },
  INTENT_EXPIRED: { status: 409, code: "state_conflict", en: "The payment request expired." },
  INTENT_NOT_FOUND: { status: 404, code: "not_found", en: "The payment request was not found." },
  INTENT_NOT_PAID: { status: 409, code: "state_conflict", en: "The payment request is not paid yet." },
  INTERNAL: { status: 500, code: "internal", en: "The POS had an unexpected problem. Retry; if it keeps failing, contact support with the requestId." },
  INVALID_LINE: { status: 422, code: "validation", en: "One of the lines is not valid. See details for the line." },
  LINE_DISCOUNT_EXCEEDS_LINE: { status: 422, code: "validation", en: "A line discount is larger than the line total." },
  MEMBER_NOT_FOUND: { status: 404, code: "not_found", en: "The member was not found in the member system of this branch." },
  MEMBER_RIGHTS_CHANGED: { status: 409, code: "state_conflict", en: "The member benefits changed while the bill was saved. Quote again." },
  MEMBER_RIGHTS_UNSUPPORTED: { status: 422, code: "validation", en: "This member benefit cannot be used here." },
  MEMBER_SUSPENDED: { status: 409, code: "state_conflict", en: "The member is suspended." },
  MEMBER_SYSTEM_MISSING: { status: 409, code: "state_conflict", en: "This branch has no member system linked." },
  NOT_ELIGIBLE: { status: 409, code: "state_conflict", en: "The bill is not eligible for this operation." },
  NOT_FOUND: { status: 404, code: "not_found", en: "The record was not found in this POS system." },
  NO_EMPLOYEE: { status: 409, code: "state_conflict", en: "This user is not linked to an employee in HR." }, // POS P3.5 ▸ R13 ◂
  NO_PERMISSION: { status: 403, code: "forbidden", en: "This API key is not allowed to do that at this branch." },
  OFF_SCHEDULE: { status: 403, code: "forbidden", en: "Outside the scheduled working hours. A manager must allow it." }, // POS P3.5 ▸ R13 ◂
  OPTIONS_INVALID: { status: 422, code: "validation", en: "The chosen options are not valid for this product." },
  OPTIONS_REQUIRED: { status: 422, code: "validation", en: "This product needs its options to be chosen." },
  OPTION_UNAVAILABLE: { status: 409, code: "state_conflict", en: "One of the chosen options is sold out." },
  ORDER_NOT_FOUND: { status: 404, code: "not_found", en: "The order was not found in this branch." },
  ORDER_STATE_CHANGED: { status: 409, code: "state_conflict", en: "The order changed state in the meantime. Read it again." },
  ORDER_STATE_INVALID: { status: 409, code: "state_conflict", en: "The order is not in a state that allows this step." },
  ORDER_UNPAID: { status: 409, code: "state_conflict", en: "The order is not paid yet." },
  PAYMENT_MISMATCH: { status: 422, code: "validation", en: "The payments do not add up to the bill total (or the cash received is less than the cash part)." },
  PENDING_APPROVAL: { status: 409, code: "state_conflict", en: "A request for this is already waiting for approval." },
  PERMISSION_DENIED: { status: 403, code: "forbidden", en: "This API key is not allowed to do that at this branch." },
  PHONE_INVALID: { status: 422, code: "validation", en: "The phone number is not valid." },
  PIN_INVALID: { status: 422, code: "validation", en: "The PIN is not valid." },
  PIN_LOCKED: { status: 409, code: "state_conflict", en: "The PIN is locked after too many wrong attempts." },
  PIN_TAKEN: { status: 409, code: "duplicate", en: "Another staff member of this branch already uses this PIN." },
  PIN_THROTTLED: { status: 429, code: "rate_limited", en: "Too many PIN attempts. Wait and retry." },
  POINTS_BELOW_MIN: { status: 422, code: "validation", en: "The points are below the minimum that can be used." },
  POINTS_CAPPED: { status: 409, code: "state_conflict", en: "Fewer points can be used on this bill than requested." },
  POINTS_DISABLED: { status: 422, code: "validation", en: "Points cannot be used at this branch." },
  POINTS_INSUFFICIENT: { status: 422, code: "validation", en: "The member does not have enough points." },
  PRICE_CHANGED: { status: 409, code: "state_conflict", en: "The bill total is not the expected total any more. Quote again and resend with the new expectedGrandTotalSatang." },
  PRICE_NOT_SET: { status: 422, code: "validation", en: "One of the products has no price yet." },
  PRICE_RULE_LIMIT: { status: 409, code: "state_conflict", en: "The shop reached the maximum number of price rules." },
  PRICE_RULE_NOT_FOUND: { status: 404, code: "not_found", en: "The price rule was not found." },
  PRODUCT_NOT_FOUND: { status: 404, code: "not_found", en: "The product was not found or is not sold at this branch." },
  PRODUCT_UNAVAILABLE: { status: 409, code: "state_conflict", en: "The product is sold out (86) at this branch." },
  RATE_LIMITED: { status: 429, code: "rate_limited", en: "Too many attempts in a short time. Wait and retry." },
  REASON_REQUIRED: { status: 422, code: "validation", en: "A reason is required." },
  REFUND_EMPTY: { status: 422, code: "validation", en: "Nothing to refund: choose at least one line and quantity." },
  REFUND_EXCEEDS: { status: 422, code: "validation", en: "The refund is larger than what is left to refund on that line." },
  REFUND_METHOD_INVALID: { status: 422, code: "validation", en: "This refund method cannot be used for this bill." },
  SALE_NOT_FOUND: { status: 404, code: "not_found", en: "The bill was not found in this branch." },
  SALE_NOT_REFUNDABLE: { status: 409, code: "state_conflict", en: "The bill cannot be refunded (voided, fully refunded, a refund document, a gift card sale or a bill of another system)." },
  SALE_NOT_VOIDABLE: { status: 409, code: "state_conflict", en: "The bill cannot be voided." },
  SALE_VOIDED: { status: 409, code: "state_conflict", en: "The bill was voided." },
  SHIFT_ALREADY_OPEN: { status: 409, code: "state_conflict", en: "A shift is already open on this device." },
  SHIFT_CLOSED: { status: 409, code: "state_conflict", en: "The shift is closed." },
  SHIFT_NOT_FORCED: { status: 409, code: "state_conflict", en: "The shift was not force closed." },
  SHIFT_REQUIRED: { status: 409, code: "state_conflict", en: "This branch requires an open shift for this. Open a shift in the app first." },
  SPLIT_INVALID: { status: 422, code: "validation", en: "The split of payments or the bill split is not valid." },
  STAFF_TOKEN_INVALID: { status: 403, code: "forbidden", en: "The staff session on this device is not valid." },
  STOCK_INSUFFICIENT: { status: 409, code: "state_conflict", en: "There is not enough stock and the branch does not allow negative stock." },
  STORE_CREDIT_NOT_OWNER: { status: 409, code: "state_conflict", en: "The store credit does not belong to the customer of this bill." },
  TABLE_BUSY: { status: 409, code: "state_conflict", en: "The table is busy." },
  TABLE_EMPTY: { status: 409, code: "state_conflict", en: "The table has nothing to bill." },
  TABLE_HAS_DRAFT: { status: 409, code: "state_conflict", en: "The table has items that were not sent yet." },
  TABLE_HAS_UNPAID: { status: 409, code: "state_conflict", en: "The table still has unpaid items." },
  TABLE_INACTIVE: { status: 409, code: "state_conflict", en: "The table is not active." },
  TABLE_ITEMS_CHANGED: { status: 409, code: "state_conflict", en: "The items of the table changed. Quote again." },
  TABLE_NOT_FOUND: { status: 404, code: "not_found", en: "The table was not found." },
  TABLE_SESSION_CLOSED: { status: 409, code: "state_conflict", en: "The table session is closed." },
  TABLE_SPLIT_EXISTS: { status: 409, code: "state_conflict", en: "The table already has a bill split." },
  TABLE_SPLIT_LOCKED: { status: 409, code: "state_conflict", en: "The bill split is locked." },
  TABLE_SPLIT_NOT_FOUND: { status: 404, code: "not_found", en: "The bill split was not found." },
  TABLE_SPLIT_OPEN: { status: 409, code: "state_conflict", en: "The table has an open bill split." },
  TABLE_SPLIT_PART_PAID: { status: 409, code: "state_conflict", en: "Part of the bill split was already paid." },
  TAX_ID_INVALID: { status: 422, code: "validation", en: "The tax id is not valid (13 digits with a correct check digit)." },
  TIP_ACCOUNT_REQUIRED: { status: 409, code: "state_conflict", en: "Tips need a tip account to be set up first." },
  TOO_LATE: { status: 409, code: "state_conflict", en: "It is too late for this operation." },
  TOO_MANY_LINES: { status: 422, code: "validation", en: "The bill has too many lines." },
  UNIT_SYSTEM_MISMATCH: { status: 404, code: "not_found", en: "The branch does not belong to this POS system." },
  UNKNOWN: { status: 500, code: "internal", en: "The POS could not complete the request. Retry; if it keeps failing, contact support with the requestId." },
  VALIDATION: { status: 422, code: "validation", en: "The request was understood but a value cannot be accepted." },
  VARIANT_REQUIRED: { status: 422, code: "validation", en: "Choose a variant of this product." },
  VERSION_CHANGED: { status: 409, code: "state_conflict", en: "The record changed in the meantime. Read it again." },
  VOUCHER_COUPON_CONFLICT: { status: 422, code: "validation", en: "A voucher and a coupon cannot be used together on this bill." },
  VOUCHER_INVALID: { status: 422, code: "validation", en: "The voucher cannot be used for this bill." },
  WEAK_PIN: { status: 422, code: "validation", en: "The PIN is too easy to guess." },
  WEIGHT_REQUIRED: { status: 422, code: "validation", en: "This product is sold by weight: send a weighed barcode." },
};

/** ข้อความไทยกลางเมื่อ facade ไม่ได้ให้ข้อความมา (ตามสถานะ) */
const FALLBACK_TH: Record<number, string> = {
  403: "คีย์นี้ไม่มีสิทธิ์ทำรายการนี้ที่สาขานี้",
  404: "ไม่พบรายการนี้ในระบบขายหน้าร้าน",
  409: "สถานะของรายการไม่เอื้อให้ทำรายการนี้ — อ่านข้อมูลล่าสุดแล้วลองใหม่",
  422: "ข้อมูลที่ส่งมาไม่ถูกต้อง",
  429: "ทำรายการถี่เกินไป — รอสักครู่แล้วลองใหม่",
  500: "ระบบขายหน้าร้านขัดข้องชั่วคราว — ลองอีกครั้ง",
  503: "ระบบไม่ว่างชั่วคราว ยังไม่ได้บันทึก — ลองใหม่อีกครั้ง",
};

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isThai = (v: unknown): v is string => typeof v === "string" && /[ก-๙]/.test(v);
const isPosRefusalCode = (c: unknown): c is PosRefusalCode => typeof c === "string" && Object.prototype.hasOwnProperty.call(POS_REFUSAL_HTTP, c);

/** error ของ REST ด้วยรหัสของ POS (รวม `internal` ที่แกนยังไม่มี — ซองเป็นสตริงอยู่แล้ว) */
export function posApiError(status: number, code: PosApiErrorCode, th: string, en: string, hint?: string, details?: ApiErrorDetail[]): ApiError {
  return new ApiError(status, code as ApiErrorCode, th, en, hint, details);
}

function detailsOf(r: Record<string, unknown>, th: string): ApiErrorDetail[] | undefined {
  if (typeof r.lineIndex === "number" && Number.isInteger(r.lineIndex)) return [{ path: `lines.${r.lineIndex}`, message: th }];
  if (typeof r.field === "string" && r.field) return [{ path: r.field, message: th }];
  return undefined;
}

function hintOf(code: PosRefusalCode, r: Record<string, unknown>): string | undefined {
  if (code === "PRICE_CHANGED" && typeof r.grandTotalSatang === "number") return `ยอดปัจจุบัน ${r.grandTotalSatang} สตางค์ (grandTotalSatang) — คิดราคาใหม่ด้วย POST /sales/quote แล้วส่ง expectedGrandTotalSatang ใหม่`;
  if (code === "IDEMPOTENCY_CONFLICT" && typeof r.saleId === "string") return `บิลเดิมของคีย์นี้: ${r.saleId}`;
  if (code === "POINTS_CAPPED" && typeof r.allowedPoints === "number") return `ใช้ได้สูงสุด ${r.allowedPoints} แต้ม`;
  // POS P2.13 ▸ fix1 F6: คำขออนุมัติ (ยกเลิก/คืนเงินเกินกติกาของร้าน) — บอก requestId · รอผู้จัดการอนุมัติในแอป · ห้ามลองใหม่ด้วยคีย์ใหม่ ◂
  if ((code === "APPROVAL_REQUIRED" || code === "PENDING_APPROVAL") && typeof r.requestId === "string" && r.requestId) {
    return `คำขออนุมัติ ${r.requestId} รอผู้จัดการอนุมัติในแอป — ไม่ต้องลองใหม่ด้วย Idempotency-Key ใหม่ (approval request ${r.requestId} waits for a manager in the app)`;
  }
  return undefined;
}

/**
 * คำปฏิเสธของ facade (ค่าที่คืน `{ok:false, code, message}`) หรือ error ที่ facade โยน (PosSaleError · CatalogError) → `ApiError`
 * ไม่รู้จัก = คืนตัวเดิม (ให้ `mapError` ของแกนจัดการ — ข้อความที่ไม่ใช่ไทยไม่หลุดถึงผู้เรียก)
 */
export function toPosApiError(e: unknown): unknown {
  if (e instanceof ApiError) return e;
  const returned = isRecord(e) && e.ok === false;
  const thrown = e instanceof Error;
  const r: Record<string, unknown> = isRecord(e) ? e : thrown ? (e as unknown as Record<string, unknown>) : {};
  const code = r.code;
  if (!(returned || thrown) || !isPosRefusalCode(code)) return e;
  const row = POS_REFUSAL_HTTP[code];
  const raw = returned ? r.message : thrown ? (e as Error).message : undefined;
  const th = isThai(raw) ? raw : (FALLBACK_TH[row.status] ?? FALLBACK_TH[422]!);
  // POS P2.14 ▸ fix2 G3: คำปฏิเสธที่พก messageEn (ภาษาอังกฤษล้วน) ใช้แทนข้อความกลางของรหัส ◂
  const en = typeof r.messageEn === "string" && r.messageEn.trim() && !isThai(r.messageEn) ? r.messageEn : row.en;
  const err = posApiError(row.status, row.code, th, en, hintOf(code, r), detailsOf(r, th));
  // ค่าที่ "คืน" = ปฏิเสธก่อนเขียน · ที่ "โยน" ถือว่าอาจเขียนไปแล้ว ยกเว้น BUSY (catalog: "ยังไม่ได้บันทึก")
  // POS P2.13 ▸ fix1 F6: APPROVAL_REQUIRED = facade ยื่นคำขออนุมัติแล้ว (เขียนแถว) ⇒ ไม่ใช่ nothingWritten — เก็บคำตอบ (requestId) ให้คีย์เดิมตอบซ้ำ ◂
  const safe = (returned && code !== "APPROVAL_REQUIRED") || code === "BUSY";
  return safe && (row.status === 409 || row.status === 429 || row.status === 503) ? nothingWritten(err) : err;
}

/**
 * ผลของ facade → `data` ของคำตอบ (CD9): สำเร็จ = ผลที่ตัด `ok` ทิ้ง (เหลือฟิลด์เดียว = ค่าของฟิลด์นั้น) · ปฏิเสธ = โยน `ApiError` ตามตาราง
 */
export function posData(result: unknown): unknown {
  if (!isRecord(result) || result.ok !== true) throw toPosApiError(isRecord(result) ? result : { ok: false, code: "INTERNAL" });
  const { ok: _ok, ...rest } = result;
  const keys = Object.keys(rest);
  return keys.length === 1 ? rest[keys[0]!] : rest;
}

/** แบบเดียวกับ posData แต่คืนทั้งก้อน (ตัด ok) — ใช้เมื่อ op ต้องหยิบหลายฟิลด์ไปประกอบซอง (รายการแบ่งหน้า) */
export function posResult<T extends { ok: boolean }>(result: T): Omit<Extract<T, { ok: true }>, "ok"> {
  if (!isRecord(result) || result.ok !== true) throw toPosApiError(isRecord(result) ? result : { ok: false, code: "INTERNAL" });
  const { ok: _ok, ...rest } = result as Record<string, unknown>;
  return rest as Omit<Extract<T, { ok: true }>, "ok">;
}
