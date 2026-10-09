// receipt-public-shared.ts — สัญญาใบเสร็จออนไลน์ / ส่งใบเสร็จ / แจ้งปัญหา / ขอใบกำกับเต็มรูป / รีวิว (POS P1.11 · R1–R9)
// 🔴 ไฟล์บริสุทธิ์ — ไม่ import prisma/server/next ⇒ จอ 'use client' (P1.11U) import ชนิดข้อมูล + ค่าคงที่ได้
// 🔴 คำปฏิเสธเป็นข้อมูล {ok:false, code, message(ไทย)} เสมอ — จอห้ามแสดง message ของเซิร์ฟเวอร์ ใช้ receiptRefusalMessageKey(code)
// 🔴 ใบเสร็จสาธารณะไม่มีข้อมูลส่วนตัว (R2 · R9): ไม่มีชื่อ/เบอร์/อีเมลสมาชิก · ชื่อแคชเชียร์ · รหัสเครื่อง · id ภายใน

/** ความยาวสูงสุด (ตัวอักษร · นับ code point หลังตัดช่องว่าง) */
export const RECEIPT_ISSUE_MESSAGE_MAX = 500;
export const RECEIPT_ISSUE_CONTACT_MAX = 120;
export const RECEIPT_REVIEW_BODY_MAX = 500;
/** เพดาน (CD4 — นับจากแถว ไม่มีตารางตัวนับ): แจ้งปัญหา 3 ครั้ง/บิล/24 ชม. · ส่งใบเสร็จ 5 ครั้ง/บิล/24 ชม. */
export const RECEIPT_ISSUE_LIMIT_PER_DAY = 3;
export const RECEIPT_SEND_LIMIT_PER_DAY = 5;
/** ขอใบกำกับภาษีเต็มรูปได้ภายในกี่วันนับจากวันจ่าย (R5) */
export const TAX_INVOICE_REQUEST_DAYS = 7;

export type PublicReceiptStatus = "PAID" | "VOIDED" | "REFUNDED_PARTIAL" | "REFUNDED";
export type PublicTaxInvoiceAction = "AVAILABLE" | "REQUESTED" | "ISSUED" | "NOT_AVAILABLE";

export type PublicReceiptLine = { name: string; qty: number; unit?: string; options?: string[]; lineTotalSatang: number };

/** ใบเสร็จสาธารณะ (R2) — หน้า /r/<token> แสดงตามนี้เท่านั้น */
export type PublicReceipt = {
  shop: { name: string; branchLabel: string; logoUrl: string | null };
  receiptNo: string;
  /** เลขใบกำกับภาษีอย่างย่อ — เฉพาะบิลชนิด TAX_INVOICE_ABB ที่ออกเอกสารแล้ว */
  abbNo?: string;
  paidAt: string; // ISO
  status: PublicReceiptStatus;
  refundedSatang: number;
  lines: PublicReceiptLine[];
  /** ส่วนลดท้ายบิล + คูปอง + สิทธิ์สมาชิก รวมก้อนเดียว (ป้าย "ส่วนลด + คูปอง" · CD6) */
  discountSatang: number;
  /** F3: ค่าบริการ (อยู่ในยอดสุทธิ) · ทิป (นอกยอดสุทธิ) — Σบรรทัด − ส่วนลด + ค่าบริการ = ยอดสุทธิ · Σจ่าย = ยอดสุทธิ + ทิป */
  serviceChargeSatang: number;
  tipSatang: number;
  vat: { rateBp: number; satang: number; included: true } | null;
  grandTotalSatang: number;
  payments: { method: string; satang: number }[];
  /** แต้ม — เฉพาะบิลที่มีสมาชิก (balance จากโมดูลแต้ม) */
  points: { earned: number; balance: number } | null;
  actions: { taxInvoice: PublicTaxInvoiceAction; review: boolean; report: true };
};

export type PublicReceiptRefusalCode =
  | "TOKEN_NOT_FOUND"
  | "RATE_LIMITED"
  | "VALIDATION"
  | "NOT_ELIGIBLE"
  | "ALREADY_REQUESTED"
  | "NO_MEMBER"
  | "ALREADY_REVIEWED"
  | "REVIEW_EXPIRED"
  | "INTERNAL";
export type SendReceiptRefusalCode =
  | "PERMISSION_DENIED"
  | "SALE_NOT_FOUND"
  | "SALE_VOIDED"
  | "VALIDATION"
  | "NO_LINE_IDENTITY"
  | "NO_EMAIL"
  | "RATE_LIMITED"
  | "SEND_FAILED"
  | "INTERNAL";

export type ReceiptRefusal<C extends string = PublicReceiptRefusalCode> = { ok: false; code: C; message: string };

export type PublicReceiptResult = { ok: true; receipt: PublicReceipt } | ReceiptRefusal;
export type ReportReceiptIssueInput = { message: string; contact?: string | null };
export type ReportReceiptIssueResult = { ok: true; issueId: string } | ReceiptRefusal;
export type FullTaxInvoiceRequestInput = { name: string; taxId: string; branchCode?: string | null; address: string; email?: string | null };
export type FullTaxInvoiceRequestResult = { ok: true; requestId: string } | ReceiptRefusal;
export type ReceiptReviewInput = { rating: number; body?: string | null };
export type ReceiptReviewResult = { ok: true; reviewId: string } | ReceiptRefusal;
export type SendReceiptVia = "LINE" | "EMAIL";
export type SendReceiptInput = { saleId: string; via: SendReceiptVia; email?: string | null };
export type SendReceiptResult = { ok: true; via: SendReceiptVia } | ReceiptRefusal<SendReceiptRefusalCode>;

/** ข้อความไทยของทุกรหัส (log/REST — จอใช้คีย์ข้อความ) */
export const RECEIPT_ONLINE_MESSAGES: Readonly<Record<PublicReceiptRefusalCode | SendReceiptRefusalCode, string>> = {
  TOKEN_NOT_FOUND: "ไม่พบใบเสร็จนี้ — ตรวจลิงก์หรือสแกน QR บนใบเสร็จอีกครั้ง",
  RATE_LIMITED: "ส่งคำขอถี่เกินไป — ลองใหม่อีกครั้งในภายหลัง",
  VALIDATION: "ข้อมูลที่ส่งมาไม่ถูกต้อง — ตรวจแล้วลองใหม่",
  NOT_ELIGIBLE: "บิลนี้ขอใบกำกับภาษีเต็มรูปไม่ได้ (ขอได้เฉพาะใบกำกับภาษีอย่างย่อที่ชำระแล้ว ภายใน 7 วัน)",
  ALREADY_REQUESTED: "บิลนี้ส่งคำขอใบกำกับภาษีเต็มรูปไว้แล้ว — ร้านกำลังดำเนินการ",
  NO_MEMBER: "บิลนี้ไม่ได้ผูกสมาชิก — ให้คะแนนร้านได้เฉพาะบิลของสมาชิก",
  ALREADY_REVIEWED: "บิลนี้ให้คะแนนร้านไปแล้ว — ขอบคุณค่ะ",
  REVIEW_EXPIRED: "ลิงก์ให้คะแนนของบิลนี้หมดอายุแล้ว (30 วัน) — ขอบคุณที่อุดหนุนค่ะ",
  PERMISSION_DENIED: "บัญชีนี้ยังไม่มีสิทธิ์ดูบิล/ส่งใบเสร็จ — ขอสิทธิ์จากเจ้าของร้าน",
  SALE_NOT_FOUND: "ไม่พบบิลนี้ (อาจเป็นของสาขาอื่น)",
  SALE_VOIDED: "บิลนี้ถูกยกเลิกแล้ว — ส่งใบเสร็จไม่ได้",
  NO_LINE_IDENTITY: "ลูกค้ายังไม่มีบัญชีไลน์ที่ผูกกับร้าน — ส่งทางอีเมลหรือให้สแกน QR แทน",
  NO_EMAIL: "ยังไม่มีอีเมลของลูกค้า — กรอกอีเมลที่จะส่ง",
  SEND_FAILED: "ส่งใบเสร็จไม่สำเร็จ — ลองใหม่อีกครั้ง",
  INTERNAL: "ระบบใบเสร็จขัดข้องชั่วคราว — ลองอีกครั้ง",
};

/** สถานะที่หน้าแสดง (R8) — มาจากแถวบิลล้วน ไม่มีสถานะเก็บเพิ่ม */
export function publicReceiptStatus(s: { status: string; refundedSatang: number }): PublicReceiptStatus {
  if (s.status === "VOIDED") return "VOIDED";
  if (s.status === "REFUNDED") return "REFUNDED";
  return s.refundedSatang > 0 ? "REFUNDED_PARTIAL" : "PAID";
}

/** ความยาวเป็นตัวอักษร (code point) */
export const textLength = (s: string) => [...s].length;

/** ที่อยู่อีเมล (รูปแบบเดียวกับตัวส่งอีเมลกลาง) */
export const RECEIPT_EMAIL_RE = /^[^\s<>@,;"]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
