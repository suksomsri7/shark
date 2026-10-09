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
  /** POS P2.1 ▸ R11 Q4: ช่องทางขาย (SalesChannel.id ของสาขา) — บิลเดิมนับเป็นช่องทางปริยายตาม sourceModule ◂ */
  salesChannelId?: string;
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
  /** POS P2.1 ▸ R11: ช่องทางขายของบิล (บิลเดิม = defaultChannelCode(sourceModule) · "หน้าร้าน"/"เว็บร้าน …") ◂ */
  salesChannel: { code: string; name: string } | null;
  /** POS P2.1 ▸ R11: เลขออเดอร์แพลตฟอร์ม (แสดงแทนลูกค้าเมื่อไม่มีสมาชิก · mockup 12) ◂ */
  channelRef: string | null;
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
  /** POS P2.1 ▸ R11: ตัวเลือกของตัวกรอง "ทุกช่องทาง" = ช่องทางของบิลวันนี้ (id ใช้กับ salesChannelId) ◂ */
  salesChannels: { id: string; code: string; name: string }[];
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
  /**
   * POS P2.2 ▸ R11: priceSource = ชั้นราคาที่ชนะตอนขาย (บิลเดิม/ผู้เรียกเดิม = null) · priceRuleName = ชื่อโปร (อ่านตาม id · ไม่พบ = null) ·
   * listPriceSatang = ราคาปกติตอนขาย (ไม่รวมตัวเลือก) — ลิ้นชักบิลเขียน "ราคา LINE MAN" / "Happy hour · บ่ายชิล (ปกติ ฿75)" ◂
   */
  lines: {
    name: string;
    qty: number;
    unitPriceSatang: number;
    discountSatang: number;
    lineTotalSatang: number;
    options: string[];
    priceSource: "BASE" | "BRANCH" | "CHANNEL" | "RULE" | "OPEN" | "CUSTOM" | "WEIGHED" | null;
    priceRuleName: string | null;
    listPriceSatang: number | null;
  }[];
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
  /**
   * POS P1.12 (R15): ชื่อ/รหัส/ระดับจากสำเนาตอนขาย (บิลเก่า = ข้อมูลสด) · benefits = สิทธิ์ที่ใช้กับบิล (ระดับ/ว่อชเชอร์/แต้ม · ไม่รวมคูปอง · บิลเก่า = [])
   */
  member: {
    name: string;
    memberCode: string | null;
    tierName?: string;
    pointsEarned: number;
    customerId: string;
    benefits: { kind: string; label: string; discountSatang: number }[];
  } | null;
  accounting: { docNo: string | null; docId: string } | null;
  /**
   * POS P2.1 ▸ R11 มติ 7: ช่องทางขาย + เลขออเดอร์ + การรับเงิน · commission* เฉพาะผู้มี pos.report.view (เจ้าของ/ผู้จัดการ) —
   * คนอื่นไม่มีคีย์เหล่านี้ · บิลเดิม = ช่องทางปริยายตาม sourceModule (ค่าคอมฯ 0) ◂
   */
  channel: { code: string; name: string; ref: string | null; payout: "PLATFORM" | "DIRECT"; commissionSatang?: number; commissionVatSatang?: number } | null;
  receiptKind: "TAX_INVOICE_ABB" | "RECEIPT";
  /** POS P1.13 ▸ R7: ใบกำกับภาษีเต็มรูปของบิล — ISSUED (เลข + ชื่อผู้ซื้อ) · REQUESTED (ลูกค้าขอจากใบเสร็จออนไลน์ รอออก) · NONE ◂ */
  taxInvoice: {
    status: "NONE" | "REQUESTED" | "ISSUED";
    docNo?: string | null;
    buyerName?: string;
    requestId?: string;
    /** POS P1.13U มติ 4: ข้อมูลที่ลูกค้ากรอกในคำขอ (REQUESTED เท่านั้น) — เติมฟอร์ม 15A ก่อนออก · fix F2: เฉพาะผู้มีสิทธิ์ pos.taxinvoice.issue ที่สาขา ◂ */
    request?: { name: string; taxId: string; branchCode: string; address: string; email: string | null };
  };
  refunds: { id: string; receiptNo: string | null; grandTotalSatang: number; time: string; reasonCode: string | null; reason: string | null; byName: string; accounting: { docNo: string | null } | null }[];
  /** POS P1.18U ▸ มติ 9 (บิล drawer en): kind + params = ประโยคที่จอแปลตามภาษา (text ไทยเดิมคงไว้ · เพิ่มอย่างเดียว) ◂ */
  timeline: { time: string; text: string; kind?: BillTimelineKind; params?: Record<string, string | number | boolean | null> }[];
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
/** POS P1.18U ▸ ชนิดแถวไทม์ไลน์ของลิ้นชักบิล · ชื่อผู้ทำที่เป็น "ระบบ" (ไม่มีผู้ใช้) — จอแปลเองตามภาษา ◂ */
export type BillTimelineKind = "paid" | "posted" | "refund" | "void" | "reprint";
export const BILLS_SYSTEM_NAME = "ระบบ";
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
