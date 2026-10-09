// payment-intent-shared.ts — ชนิดข้อมูล + ค่าคงที่ + ตัวอ่านค่าตั้งของใบขอรับเงิน (POS P1.7) · บริสุทธิ์ล้วน
//
// 🔴 ไฟล์นี้ client import ได้ (ไม่แตะ prisma/DB/env) — หน้า PayScreen (P1.7U) และหน้าตั้งค่า 17A ใช้ชนิด/ตัวอ่านชุดนี้
//    ตรรกะที่แตะ DB อยู่ที่ payment-intent.ts · server action อยู่ที่ payment-intent-actions.ts ("use server" = async function อย่างเดียว)
// สัญญา: ledger/pos-briefs/pos-brief-P1.7.md §2 R1–R8 · ตารางชื่อ ledger/wo-notes/pos-P1.7-oracle.md

export const PAYMENT_INTENT_KINDS = ["PROMPTPAY_STATIC", "PROMPTPAY_BEAM", "CARD_BEAM"] as const;
export type PaymentIntentKind = (typeof PAYMENT_INTENT_KINDS)[number];
export const PAYMENT_INTENT_STATUSES = ["PENDING", "PAID", "CONSUMED", "EXPIRED", "CANCELLED"] as const;
export type PaymentIntentStatus = (typeof PAYMENT_INTENT_STATUSES)[number];
export type PaymentIntentVia = "WEBHOOK" | "MANUAL";
/** วิธีจ่ายที่ขอ intent ได้ (เงินสด/โอน ไม่มี intent) */
export type PaymentIntentMethod = "PROMPTPAY" | "CARD";

/** id ของ intent = "pi_" + สุ่ม base64url (ไม่ใช่ cuid) — ใส่เป็น reference ของวิธีจ่ายได้ (≤ REGISTER_REFERENCE_MAX 100) */
export const PAYMENT_INTENT_ID_RE = /^pi_[A-Za-z0-9_-]{6,96}$/;
export const isPaymentIntentId = (v: unknown): v is string => typeof v === "string" && PAYMENT_INTENT_ID_RE.test(v);
/** referenceId ที่ส่งให้ Beam = "pos-" + id ของ intent (webhook route แยกปลายทางด้วยคำนำหน้านี้) */
export const POS_BEAM_REF_PREFIX = "pos-";
/** หน้าต่างใช้ intent ที่จ่ายแล้วในบิล (CD4/CD-F): paidAt เก่ากว่านี้ = INTENT_EXPIRED → ผู้จัดการจัดการเอง */
export const PAYMENT_INTENT_CONSUME_WINDOW_MS = 24 * 60 * 60 * 1000;

/** ค่าตั้ง `AppSystem(POS).settings.pos.payment` (CD-H) */
export type PosIntentSettings = {
  /** ร้านเลือกเปิด Beam เอง (CD1) — กุญแจแพลตฟอร์มอย่างเดียวไม่พอ */
  beam: { enabled: boolean };
  /** อายุ QR (นาที) จำนวนเต็ม 5..60 · ค่าอื่น = 15 */
  qrExpiryMinutes: number;
  /** ยืนยันเงินเข้าเองต้องเป็นผู้จัดการ (pos.shift.manage) */
  manualConfirmRequiresManager: boolean;
};
export const POS_QR_EXPIRY_DEFAULT = 15;
export const POS_QR_EXPIRY_MIN = 5;
export const POS_QR_EXPIRY_MAX = 60;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** อ่านค่าตั้งจาก settings JSON ทั้งก้อนของระบบ POS (ค่าเพี้ยน = ค่าปริยาย · ไม่โยน) */
export function parsePosIntentSettings(settings: unknown): PosIntentSettings {
  const pos = isRecord(settings) && isRecord(settings.pos) ? settings.pos : {};
  const pay = isRecord(pos.payment) ? pos.payment : {};
  const beam = isRecord(pay.beam) ? pay.beam : {};
  const q = pay.qrExpiryMinutes;
  const qrExpiryMinutes = typeof q === "number" && Number.isInteger(q) && q >= POS_QR_EXPIRY_MIN && q <= POS_QR_EXPIRY_MAX ? q : POS_QR_EXPIRY_DEFAULT;
  return { beam: { enabled: beam.enabled === true }, qrExpiryMinutes, manualConfirmRequiresManager: pay.manualConfirmRequiresManager === true };
}

/** รหัสปฏิเสธของใบขอรับเงิน (R8) — คืนเป็นข้อมูลเสมอ ไม่โยน */
export type PaymentIntentRefusalCode =
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "VALIDATION"
  | "DEVICE_REVOKED"
  | "IDEMPOTENCY_CONFLICT"
  | "PROMPTPAY_NOT_CONFIGURED"
  | "CARD_UNAVAILABLE"
  | "AMOUNT_MISMATCH"
  | "INTENT_NOT_FOUND"
  | "INTENT_NOT_PAID"
  | "INTENT_CONSUMED"
  | "INTENT_EXPIRED"
  | "INTENT_CANCELLED"
  | "INTENT_PAID"
  | "INTERNAL";
export type PaymentIntentRefusal = { ok: false; code: PaymentIntentRefusalCode; message: string };

/** มุมมองของ intent ที่ส่งให้จอ (วันที่เป็น ISO) */
export type PaymentIntentView = {
  id: string;
  unitId: string;
  kind: PaymentIntentKind;
  status: PaymentIntentStatus;
  amountSatang: number;
  /** STATIC/PROMPTPAY_BEAM = EMV ของ QR · CARD_BEAM = URL หน้าชำระบัตรของ Beam (ทำ QR ให้ลูกค้าสแกน) */
  qrPayload: string | null;
  expiresAt: string;
  paidAt: string | null;
  confirmedVia: PaymentIntentVia | null;
  lateWebhook: boolean;
  deviceId: string;
  createdAt: string;
};

export type CreatePaymentIntentInput = { method: PaymentIntentMethod; amountSatang: number; idempotencyKey: string; deviceId: string };
export type CreatePaymentIntentResult = { ok: true; intent: PaymentIntentView; reused: boolean } | PaymentIntentRefusal;
export type PaymentIntentActionResult = { ok: true; intent: PaymentIntentView; idempotent?: boolean } | PaymentIntentRefusal;
/** ผลอ่านสถานะสำหรับโพล 2 วินาที (R5) */
export type PaymentIntentStatusResult =
  | {
      ok: true;
      status: PaymentIntentStatus;
      amountSatang: number;
      kind: PaymentIntentKind;
      qrPayload: string | null;
      expiresAt: string;
      paidAt: string | null;
      confirmedVia: PaymentIntentVia | null;
    }
  | PaymentIntentRefusal;
/** ผลของ markIntentPaid (webhook/ยืนยันเอง) */
export type MarkIntentPaidResult = { ok: true; idempotent?: boolean; lateWebhook?: boolean; status: PaymentIntentStatus } | PaymentIntentRefusal;

/** รหัส → คีย์ข้อความใต้ `pos` (เช่น `payment.errors.intentNotPaid`) · ไม่รู้จัก = register.errors.unknown */
const INTENT_KEY: Partial<Record<PaymentIntentRefusalCode, string>> = {
  PROMPTPAY_NOT_CONFIGURED: "payment.errors.promptpayNotConfigured",
  CARD_UNAVAILABLE: "payment.errors.cardUnavailable",
  AMOUNT_MISMATCH: "payment.errors.amountMismatch",
  INTENT_NOT_FOUND: "payment.errors.intentNotFound",
  INTENT_NOT_PAID: "payment.errors.intentNotPaid",
  INTENT_CONSUMED: "payment.errors.intentConsumed",
  INTENT_EXPIRED: "payment.errors.intentExpired",
  INTENT_CANCELLED: "payment.errors.intentCancelled",
  INTENT_PAID: "payment.errors.intentPaid",
  IDEMPOTENCY_CONFLICT: "register.errors.idempotencyConflict",
  PERMISSION_DENIED: "register.errors.permissionDenied",
  DEVICE_REVOKED: "register.errors.deviceRevoked",
  VALIDATION: "register.errors.invalidLine",
  NOT_FOUND: "register.errors.notFound",
};
/** คีย์ข้อความ (ใต้ namespace `pos`) ของรหัสปฏิเสธใบขอรับเงิน — จอห้ามแสดง message ไทยของเซิร์ฟเวอร์/รหัสดิบ */
export function intentRefusalMessageKey(code: string): string {
  return Object.prototype.hasOwnProperty.call(INTENT_KEY, code) ? INTENT_KEY[code as PaymentIntentRefusalCode]! : "register.errors.unknown";
}
