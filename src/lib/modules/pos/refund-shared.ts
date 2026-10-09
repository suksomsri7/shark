// POS P1.8 ▸ ชนิดข้อมูล + ค่าคงที่ของการคืนเงิน (ไม่แตะ prisma — จอ 'use client' ของ P1.16 import ได้) ◂
// ตัวทำงานจริง = refund.ts (refundSale · saleForRefund) · server action = refund-actions.ts · คณิตศาสตร์เงิน = refund-math.ts

export const REFUND_REASON_CODES = ["DAMAGED", "WRONG_ITEM", "CHANGED_MIND", "OTHER"] as const;
export type RefundReasonCode = (typeof REFUND_REASON_CODES)[number];
/** วิธีคืนเงินที่รับ (มติ R5 · R10): มัดจำ/ลงบิลห้อง = REFUND_METHOD_INVALID · บัตร/พร้อมเพย์ = อ้างอิงมือจนกว่า P1.7 */
export const REFUND_PAY_TYPES = ["CASH", "TRANSFER", "PROMPTPAY", "CARD"] as const;
export type RefundPayType = (typeof REFUND_PAY_TYPES)[number];
export const REFUND_REASON_MAX = 200;
/** คำนำหน้าเลขใบคืนปริยาย (O2 · settings.pos.receipt.refundPrefix) */
export const REFUND_PREFIX_DEFAULT = "CN";

export type RefundSaleInput = {
  saleId: string;
  /** lineId = PosSaleLine.id ของบิลเดิม · qty = จำนวนหน่วยที่คืน (จำนวนเต็ม ≥ 1 · บรรทัดชั่งคืนทั้งบรรทัด = 1) · restock true = รับของคืนเข้าคลัง */
  lines: { lineId: string; qty: number; restock?: boolean | null }[];
  payMethods: { type: RefundPayType; amountSatang: number; reference?: string | null }[];
  reasonCode: RefundReasonCode;
  /** ≤ 200 ตัว · บังคับเมื่อ reasonCode = OTHER */
  reason?: string | null;
  /** เครื่องที่คืน (ผูกกะที่เปิดอยู่ของเครื่องนี้) — ไม่ส่ง = ctx.deviceId */
  deviceId?: string;
  idempotencyKey: string;
  /** POS P1.15 R5: PIN ผู้จัดการที่เครื่องนี้ (คู่ managerUserId) — คืนทันทีแม้มีกติกา POS_REFUND (audit pos.approval.pin_override) */
  managerPin?: string | null;
  managerUserId?: string | null;
  /** POS P1.15U ▸ โทเคนผู้ขายของเครื่องนี้ — ผู้ขอ/ผู้ทำรายการ = คนในโทเคน · ผิด/หมดอายุ = STAFF_TOKEN_INVALID ◂ */
  staffToken?: string | null;
};

export type RefundRefusalCode =
  | "NO_PERMISSION"
  | "SALE_NOT_FOUND"
  | "SALE_NOT_REFUNDABLE"
  | "REFUND_EXCEEDS"
  | "REFUND_EMPTY"
  | "PAYMENT_MISMATCH"
  | "REFUND_METHOD_INVALID"
  | "SHIFT_REQUIRED"
  | "REASON_REQUIRED"
  | "IDEMPOTENCY_CONFLICT"
  | "VALIDATION"
  | "UNKNOWN";
export type RefundRefusal = { ok: false; code: RefundRefusalCode; message: string };

/** คีย์ข้อความ (pos.refund.errors.<key>) ของรหัสปฏิเสธ — จอใช้แปลภาษา · HAS_REFUNDS = voidSale ของบิลที่คืนไปแล้วบางส่วน (CD1) */
export const REFUND_ERROR_KEYS: Record<Exclude<RefundRefusalCode, "UNKNOWN"> | "HAS_REFUNDS", string> = {
  NO_PERMISSION: "noPermission",
  SALE_NOT_FOUND: "saleNotFound",
  SALE_NOT_REFUNDABLE: "saleNotRefundable",
  REFUND_EXCEEDS: "refundExceeds",
  REFUND_EMPTY: "refundEmpty",
  PAYMENT_MISMATCH: "paymentMismatch",
  REFUND_METHOD_INVALID: "refundMethodInvalid",
  SHIFT_REQUIRED: "shiftRequired",
  REASON_REQUIRED: "reasonRequired",
  IDEMPOTENCY_CONFLICT: "idempotencyConflict",
  VALIDATION: "validation",
  HAS_REFUNDS: "hasRefunds",
};

export type RefundDocLine = {
  id: string;
  refLineId: string | null;
  name: string;
  qty: number;
  unitPriceSatang: number;
  discountSatang: number;
  lineTotalSatang: number;
  restock: boolean | null;
};
export type RefundDoc = {
  id: string;
  /** เลขใบคืน CN${YYYYMM}-NNNN */
  receiptNo: string | null;
  saleId: string;
  status: string;
  subtotalSatang: number;
  serviceChargeSatang: number;
  vatSatang: number;
  grandTotalSatang: number;
  reasonCode: string | null;
  reason: string | null;
  shiftId: string | null;
  soldByUserId: string | null;
  createdAt: string;
  lines: RefundDocLine[];
  payments: { type: string; amountSatang: number; reference: string | null }[];
};
export type RefundSaleResult =
  | { ok: true; refund: RefundDoc; sale: { id: string; status: string; refundedSatang: number }; duplicated?: true }
  | RefundRefusal
  // POS P1.15 ▸ PIN ผู้จัดการผิด/ล็อก/เครื่องถูกเพิกถอน · ต้องรออนุมัติ (requestId) — จอแปลด้วย refusalMessageKey ของ pos.register ◂
  | { ok: false; code: "PIN_INVALID" | "PIN_LOCKED" | "DEVICE_REVOKED"; message: string }
  | { ok: false; code: "APPROVAL_REQUIRED" | "PENDING_APPROVAL"; message: string; requestId: string }
  // POS P1.15U ▸ staffToken ผิด/หมดอายุ ◂
  | { ok: false; code: "STAFF_TOKEN_INVALID"; message: string };

export type SaleForRefundLine = {
  lineId: string;
  name: string;
  qty: number;
  unitPriceSatang: number;
  discountSatang: number;
  lineTotalSatang: number;
  /** ยอดสุทธิหลังเกลี่ยส่วนลดท้ายบิล/คูปอง/สิทธิ์สมาชิก (ฐานของยอดคืน · refund-math.lineNets) */
  netSatang: number;
  refundedQty: number;
  refundedSatang: number;
  refundableQty: number;
  itemId: string | null;
  productId: string | null;
  serviceId: string | null;
  weightGrams: number | null;
  isBundle: boolean;
  /** มีของในคลังให้รับคืน (บรรทัดผูกคลัง/ชุด) — จอติ๊ก "รับของคืน" ไว้ก่อน (Q3) */
  stocked: boolean;
};
export type SaleForRefund = {
  ok: true;
  sale: {
    id: string;
    receiptNo: string | null;
    status: string;
    sourceModule: string;
    createdAt: string;
    grandTotalSatang: number;
    refundedSatang: number;
    serviceChargeSatang: number;
    serviceChargeRefundedSatang: number;
    tipSatang: number;
    vatSatang: number;
    netTotalSatang: number;
    shiftId: string | null;
    refundable: boolean;
    /** เหตุที่คืนไม่ได้ (refundable = false) — คีย์ pos.refund.errors.* */
    notRefundableCode: RefundRefusalCode | null;
  };
  lines: SaleForRefundLine[];
  payments: { type: string; amountSatang: number; reference: string | null }[];
  refunds: { id: string; receiptNo: string | null; grandTotalSatang: number; createdAt: string; reasonCode: string | null; reason: string | null; soldByUserId: string | null }[];
  member: { memberId: string; pointsEarned: number } | null;
  accounting: { docId: string; docNo: string | null } | null;
  /** ผู้ใช้นี้กดคืนเงินได้ไหม (pos.sale.refund) */
  canRefund: boolean;
};
export type SaleForRefundResult = SaleForRefund | RefundRefusal;
