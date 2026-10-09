// bills-shared.ts — ชนิดข้อมูล + ค่าคงที่ของหน้า "บิลวันนี้" (POS P1.16 · จอ 12) · ไม่แตะ prisma — จอ 'use client' import ได้
// ตัวทำงานจริง = bills.ts (billsPageData · billDetail · voidSaleByActor) · server action = bills-actions.ts
// สัญญา = scripts/qc-pos-p1.16.mts + ตารางชื่อใน ledger/wo-notes/pos-P1.16-oracle.md (ใช้ชื่อตามนั้นทุกตัว)

export const BILL_STATUS_FILTERS = ["ALL", "PAID", "VOIDED", "REFUNDED", "OFF_SHIFT_CASH"] as const;
export type BillStatusFilter = (typeof BILL_STATUS_FILTERS)[number];
export const BILL_PAGE_SIZES = [10, 20, 50] as const;
export type BillPageSize = (typeof BILL_PAGE_SIZES)[number];
/** ความยาวสูงสุดของช่องค้นหา (เลขบิล / ชื่อ / เบอร์) */
export const BILL_Q_MAX = 60;
/** ความยาวสูงสุดของเหตุผลการยกเลิกบิล */
export const VOID_REASON_MAX = 200;

export type BillsRefusalCode = "NO_PERMISSION" | "SALE_NOT_FOUND" | "SALE_NOT_VOIDABLE" | "HAS_REFUNDS" | "SHIFT_CLOSED" | "REASON_REQUIRED" | "VALIDATION" | "UNKNOWN";
export type BillsRefusal = { ok: false; code: BillsRefusalCode; message: string };
/** รหัสปฏิเสธ → คีย์ข้อความ pos.bills.errors.* (จอแปลภาษาจากคีย์ ไม่แสดง message ไทยของเซิร์ฟเวอร์ตรง ๆ) */
export const BILLS_ERROR_KEYS: Record<BillsRefusalCode, string> = {
  NO_PERMISSION: "noPermission",
  SALE_NOT_FOUND: "saleNotFound",
  SALE_NOT_VOIDABLE: "saleNotVoidable",
  HAS_REFUNDS: "hasRefunds",
  SHIFT_CLOSED: "shiftClosed",
  REASON_REQUIRED: "reasonRequired",
  VALIDATION: "validation",
  UNKNOWN: "unknown",
};

export type BillSaleStatus = "PAID" | "VOIDED" | "REFUNDED";

// ── billsPageData (R1) ──
export type BillsPageQuery = {
  unitId: string;
  /** YYYY-MM-DD ตามเวลาไทย */
  date: string;
  status?: BillStatusFilter;
  /** เลขบิล (ขึ้นต้น) หรือ ชื่อ/เบอร์ลูกค้า · ≤ 60 ตัว */
  q?: string;
  /** sourceModule (POS · BOOKING · HOTEL …) */
  channel?: string;
  staffUserId?: string;
  /** เริ่มที่ 1 */
  page?: number;
  pageSize?: BillPageSize;
};
export type BillRow = {
  id: string;
  receiptNo: string | null;
  /** ISO ของ paidAt ?? createdAt */
  time: string;
  sourceModule: string;
  /** sub = รหัสสมาชิก / ระดับ — ไม่มี id */
  customer: { name: string; sub: string } | null;
  /** ชนิดการจ่ายไม่ซ้ำ เรียงตาม PAY_TYPE_ORDER คั่นด้วย "+" เช่น "CASH+PROMPTPAY" */
  payMethods: string;
  /** ผู้ขาย · "ระบบ" เมื่อไม่มีผู้ขาย (บิลของโมดูลอื่น) */
  staffName: string;
  grandTotalSatang: number;
  refundedSatang: number;
  status: BillSaleStatus;
  /** จ่ายเงินสดแต่ไม่ผูกกะ (เงินไม่ได้เข้าลิ้นชัก) */
  offShiftCash: boolean;
  /** ชื่อผู้ยกเลิกบิล (จาก AuditLog pos.sale.void) — ไม่มี audit = ไม่มีช่องนี้ */
  voidApprovedBy?: string;
  refunds: { id: string; receiptNo: string | null; grandTotalSatang: number }[];
};
export type BillsCounts = { all: number; paid: number; voided: number; refunded: number; offShiftCash: number };
export type BillsSummary = { netSatang: number; billCount: number; storeCount: number; onlineCount: number; avgSatang: number; yesterdayAvgSatang: number };
export type BillsPageData = {
  ok: true;
  date: string;
  counts: BillsCounts;
  summary: BillsSummary;
  items: BillRow[];
  total: number;
  page: number;
  pageSize: number;
  channels: string[];
  staff: { userId: string; name: string }[];
};
export type BillsPageDataResult = BillsPageData | BillsRefusal;

// ── billDetail (R2) ──
export type BillVoidBlockedReason = "SHIFT_CLOSED" | "HAS_REFUNDS" | "NOT_POS" | "NO_PERMISSION";
export type BillDetail = {
  id: string;
  receiptNo: string | null;
  status: BillSaleStatus;
  docType: "SALE";
  time: string;
  staffName: string;
  deviceName: string | null;
  shiftNo: number | null;
  sourceModule: string;
  lines: { name: string; qty: number; unitPriceSatang: number; discountSatang: number; lineTotalSatang: number; options: string[] }[];
  /** สตางค์ทั้งหมด · subtotal − lineDiscount − billDiscount − coupon − tier + serviceCharge = grandTotal */
  totals: {
    subtotal: number;
    lineDiscount: number;
    billDiscount: number;
    coupon: number;
    tier: number;
    serviceCharge: number;
    vatSatang: number;
    vatRateBp: number;
    grandTotal: number;
    tip: number;
    refunded: number;
  };
  payments: { type: string; amountSatang: number; tenderedSatang?: number; changeSatang?: number; reference?: string }[];
  member: { name: string; memberCode: string | null; tierName?: string; pointsEarned: number; customerId: string } | null;
  accounting: { docNo: string | null; docId: string } | null;
  receiptKind: "TAX_INVOICE_ABB" | "RECEIPT";
  refunds: { id: string; receiptNo: string | null; grandTotalSatang: number; time: string; reasonCode: string | null; reason: string | null; byName: string; accounting: { docNo: string | null } | null }[];
  timeline: { time: string; text: string }[];
  can: { void: boolean; refund: boolean; reprint: boolean };
  voidBlockedReason?: BillVoidBlockedReason;
};
export type BillDetailResult = { ok: true; bill: BillDetail } | BillsRefusal;

// ── voidSaleAction (R3) ──
export type VoidSaleByActorInput = { unitId: string; saleId: string; reason: string; idempotencyKey: string };
export type VoidSaleActionResult =
  | { ok: true; sale: { id: string; status: string }; duplicated?: true }
  | BillsRefusal
  // POS P1.15 ▸ PIN ผู้จัดการผิด/ล็อก/เครื่องถูกเพิกถอน · ต้องรออนุมัติ (requestId) — จอแปลด้วย refusalMessageKey ของ pos.register ◂
  | { ok: false; code: "PIN_INVALID" | "PIN_LOCKED" | "DEVICE_REVOKED"; message: string }
  | { ok: false; code: "APPROVAL_REQUIRED" | "PENDING_APPROVAL"; message: string; requestId: string }
  // POS P1.15U ▸ staffToken ผิด/หมดอายุ (ผู้ขอ = คนในโทเคน · มติ 2) ◂
  | { ok: false; code: "STAFF_TOKEN_INVALID"; message: string };

/** ป้ายเหตุผลการคืนเงิน (ไทม์ไลน์ · หน้าต่างคืนเงิน) — ตรงกับ REFUND_REASON_CODES ของ P1.8 */
export const REFUND_REASON_LABEL_TH: Record<string, string> = {
  DAMAGED: "สินค้ามีปัญหา",
  WRONG_ITEM: "ส่งผิดรายการ",
  CHANGED_MIND: "ลูกค้าเปลี่ยนใจ",
  OTHER: "อื่น ๆ",
};

/** วันที่ YYYY-MM-DD ที่มีอยู่จริง */
export function isBillDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
/** เลื่อนวันที่ YYYY-MM-DD ไป n วัน */
export function addBillDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
/** วันนี้ตามเวลาไทย */
export function bkkDateOf(d: Date = new Date()): string {
  return new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}
