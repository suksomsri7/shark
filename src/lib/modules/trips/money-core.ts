// ─────────────────────────────────────────────────────────────
// trips/money-core.ts — สูตรเงินฝั่ง trips (บริสุทธิ์): งวดจ่ายจาก snapshot · ปันการรับเงินเข้างวด · VAT ต่อเอกสาร ·
//   ใบเสนอคืนเงินจาก snapshot · แตกยอดคืนต่อใบรับ · ผัง G.3 ของคำขอคืนเงิน · ข้อมูลเอกสาร (13ค) · พอร์ตลงบัญชีเปล่า · RUN TRIPS T0.7a
// ใบสั่ง ledger/trips-briefs/T0.7.md §4 (§22 มติผู้คุมชนะ) · CC §G.3 §H.0–§H.2 · มติ T0.5 ข้อ 5 8
//
// 🔴 บริสุทธิ์: import ค่าได้แค่ ./money-math ./snapshot ./booking-core (+ import type) · ไม่มี I/O · ไม่อ่านนาฬิกา · ไม่ throw · ไม่แก้อินพุต
// 🔴 เงินทุกตัวเป็นจำนวนเต็มสตางค์ 0..int4 · หาร/ปัดผ่าน money-math เท่านั้น · ยอดมาจาก snapshot/แถวที่จดไว้ (ไม่คิดจากค่าตั้งปัจจุบัน)
// 🔴 ไม่มีค่าธุรกิจตายตัว (อัตรา VAT/ขั้นบันได/ขั้นต่ำตามประกาศ มาจาก snapshot หรือผู้เรียกส่งเข้ามา)
// ─────────────────────────────────────────────────────────────
import { z } from "zod";
import { INT4_MAX } from "./booking-core";
import { allocateWithin, mulBpHalfUp, mulDivHalfUp, vatOfInclusive } from "./money-math";
import { recomputeFromSnapshot, type CancelComputed, type CancelLine } from "./snapshot";

// ── T0.7 money ──
// ═══════════════ §4.1 ค่าคงที่ ═══════════════
export const TRIP_TENDERS = ["CASH", "PROMPTPAY", "TRANSFER", "CARD"] as const;
export type TripTender = (typeof TRIP_TENDERS)[number];
export type TenderGroup = "CASH" | "BANK" | "CARD";
/** กลุ่ม tender — คืนเงินข้ามกลุ่มไม่ได้ (ใบสั่ง §8.4 · §17 ข้อ 8) · ไม่รู้จัก ⇒ null */
export function tenderGroupOf(t: string): TenderGroup | null {
  if (t === "CASH") return "CASH";
  if (t === "PROMPTPAY" || t === "TRANSFER") return "BANK";
  if (t === "CARD") return "CARD";
  return null;
}
export const TRIP_REFUND_STATUSES = ["REQUESTED", "QUOTED", "APPROVED", "REJECTED", "WITHDRAWN", "EXECUTING", "DONE", "FAILED"] as const;
export type TripRefundStatus = (typeof TRIP_REFUND_STATUSES)[number];
/** คำขอที่ยังเปิด (กันรับเงิน/แก้การจอง/ยื่นซ้ำ · ค่าคงที่ §16 ข้อ 5) */
export const TRIP_REFUND_OPEN_STATUSES = ["REQUESTED", "QUOTED", "APPROVED", "EXECUTING", "FAILED"] as const;
/** ตาราง CC :709 ตรงตัว (ไม่มีแถวอื่น) */
export const TRIP_REFUND_TRANSITIONS: readonly (readonly [TripRefundStatus, TripRefundStatus])[] = [
  ["REQUESTED", "QUOTED"],
  ["QUOTED", "APPROVED"],
  ["QUOTED", "REJECTED"],
  ["QUOTED", "WITHDRAWN"],
  ["APPROVED", "EXECUTING"],
  ["EXECUTING", "DONE"],
  ["EXECUTING", "FAILED"],
  ["FAILED", "EXECUTING"],
];
export function canTransitionRefund(from: string, to: string): boolean {
  return TRIP_REFUND_TRANSITIONS.some(([a, b]) => a === from && b === to);
}
/**
 * ผังที่โค้ดใช้จริง = ตารางสัญญา (CC :709 · คงไว้ตรงตัวข้างบน) + ทางออกของคำขอที่อนุมัติแล้ว (มติผู้คุม r1 V4 · r2 W1 W7):
 * APPROVED → QUOTED (ข้อเท็จจริงเงินเปลี่ยนหลังอนุมัติ ⇒ คำนวณใหม่ ณ วันที่ยื่นเดิม · ต้องอนุมัติใหม่) ·
 * APPROVED → WITHDRAWN (ผู้มีสิทธิ์อนุมัติถอนคำขอที่บันทึกโอนคืนไม่ได้)
 */
export const TRIP_REFUND_TRANSITIONS_OPS: readonly (readonly [TripRefundStatus, TripRefundStatus])[] = [
  ...TRIP_REFUND_TRANSITIONS,
  ["APPROVED", "QUOTED"],
  ["APPROVED", "WITHDRAWN"],
];
export function canTransitionRefundOps(from: string, to: string): boolean {
  return TRIP_REFUND_TRANSITIONS_OPS.some(([a, b]) => a === from && b === to);
}
/** entityType ของคำอนุมัติแก้ยอดคืนมือ */
export const TRIP_REFUND_ENTITY = "trips.refund";
/** เลขอ้างอิงธนาคาร/อนุมัติบัตร — ข้อความล้วน (เก็บใน audit after.reference เท่านั้น · ใบสั่ง §6 · §17 ข้อ 5) */
export const MONEY_REFERENCE = z.string().regex(/^[A-Za-z0-9 ._/-]{1,64}$/);
/** สถานะงวดที่รับเงินได้ (ใบสั่ง §4.4) */
export const TRIP_DUE_OPEN_STATUSES = ["OPEN", "PARTLY_PAID", "OVERDUE"] as const;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const int4 = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= INT4_MAX;
const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);

// ═══════════════ §4.2 งวดจากจาก snapshot ═══════════════
export type DueDraft = { seq: number; kind: string; dueAt: string; amountSatang: number; vatableSatang: number; passThroughSatang: number; amountMinor: number | null };
const DUE_KINDS: ReadonlySet<string> = new Set(["DEPOSIT", "BALANCE", "INSTALMENT"]);
/** `snap.paymentSchedule` เรียง seq ตรงตัว (ไม่คำนวณใหม่) · Σ ยอด = payable · Σ เก็บแทน = passThrough · ยอด = vatable + เก็บแทน · ไม่ตรง ⇒ SNAPSHOT_INVALID */
export function dueDraftsFromSnapshot(snap: unknown): { ok: true; value: DueDraft[] } | { ok: false; reason: "SNAPSHOT_INVALID" } {
  const bad = { ok: false as const, reason: "SNAPSHOT_INVALID" as const };
  if (!isRec(snap) || !isRec(snap.totals) || !Array.isArray(snap.paymentSchedule) || snap.paymentSchedule.length === 0) return bad;
  const payable = snap.totals.payableSatang;
  const pt = snap.totals.passThroughSatang;
  if (!int4(payable) || !int4(pt)) return bad;
  const out: DueDraft[] = [];
  for (const r of snap.paymentSchedule) {
    if (!isRec(r)) return bad;
    const { seq, kind, dueAt, amountSatang, vatableSatang, passThroughSatang, amountMinor } = r;
    if (!int4(seq) || seq < 1 || typeof kind !== "string" || !DUE_KINDS.has(kind) || typeof dueAt !== "string" || Number.isNaN(Date.parse(dueAt))) return bad;
    if (!int4(amountSatang) || !int4(vatableSatang) || !int4(passThroughSatang) || amountSatang !== vatableSatang + passThroughSatang) return bad;
    if (amountMinor !== undefined && amountMinor !== null && !int4(amountMinor)) return bad;
    out.push({ seq, kind, dueAt, amountSatang, vatableSatang, passThroughSatang, amountMinor: int4(amountMinor) ? amountMinor : null });
  }
  out.sort((a, b) => a.seq - b.seq);
  if (new Set(out.map((d) => d.seq)).size !== out.length) return bad;
  if (sum(out.map((d) => d.amountSatang)) !== payable || sum(out.map((d) => d.passThroughSatang)) !== pt) return bad;
  return { ok: true, value: out };
}

// ═══════════════ §4.3 VAT ต่อเอกสาร ═══════════════
export type ReceiptVatCtx = { vatRegistered: boolean; vatRateBp: number; vat7Satang: number; nonPtSatang: number };
/** VAT ของใบรับหนึ่งใบ (ต่อเอกสาร · ปัดครึ่งขึ้น ป.86/2542 ข้อ 4(6)) — ไม่จด VAT ⇒ 0 · บรรทัดยกเว้น/ไม่มี VAT ที่ไม่ใช่เก็บแทน ⇒ ปันฐานตามสัดส่วน VAT7 */
export function receiptVatSatang(vatableSatang: number, ctx: ReceiptVatCtx): number {
  if (!isRec(ctx) || ctx.vatRegistered !== true || !int4(vatableSatang) || !int4(ctx.vatRateBp) || !int4(ctx.vat7Satang) || !int4(ctx.nonPtSatang)) return 0;
  if (ctx.nonPtSatang === 0 || ctx.vat7Satang === 0 || vatableSatang === 0) return 0;
  const base = ctx.vat7Satang === ctx.nonPtSatang ? vatableSatang : mulDivHalfUp(vatableSatang, ctx.vat7Satang, ctx.nonPtSatang);
  return vatOfInclusive(base, ctx.vatRateBp);
}
type SnapLine = { itemRef?: unknown; label?: unknown; qty?: unknown; amountSatang?: unknown; vatSatang?: unknown; passThrough?: unknown; taxKind?: unknown };
const linesOf = (snap: Rec): SnapLine[] => (Array.isArray(snap.lines) ? snap.lines.filter(isRec) : []);
const taxOf = (snap: Rec): { vatRegistered: boolean; pricesIncludeVat: boolean; vatRateBp: number } | null => {
  const t = snap.tax;
  if (!isRec(t) || !int4(t.vatRateBp)) return null;
  return { vatRegistered: t.vatRegistered === true, pricesIncludeVat: t.pricesIncludeVat !== false, vatRateBp: t.vatRateBp };
};
/** ยอดที่ลูกค้าจ่ายของบรรทัด (ราคาไม่รวม VAT ⇒ + VAT ของบรรทัด VAT7) — สูตรเดียวกับ snapshot.cancelOf */
const lineDue = (l: SnapLine, excl: boolean): number => (int4(l.amountSatang) ? l.amountSatang : 0) + (excl && l.taxKind === "VAT7" && int4(l.vatSatang) ? l.vatSatang : 0);
/** บริบท VAT ต่อเอกสารของการจอง (จาก snapshot) · snapshot เสีย ⇒ null */
export function receiptVatCtxOf(snap: unknown): ReceiptVatCtx | null {
  if (!isRec(snap)) return null;
  const tax = taxOf(snap);
  if (!tax) return null;
  const nonPt = linesOf(snap).filter((l) => l.passThrough !== true);
  const excl = !tax.pricesIncludeVat;
  return {
    vatRegistered: tax.vatRegistered,
    vatRateBp: tax.vatRateBp,
    vat7Satang: sum(nonPt.filter((l) => l.taxKind === "VAT7").map((l) => lineDue(l, excl))),
    nonPtSatang: sum(nonPt.map((l) => lineDue(l, excl))),
  };
}

// ═══════════════ §4.4 ปันการรับเงินเข้างวด ═══════════════
export type DueState = { id: string; seq: number; status: string; amountSatang: number; vatableSatang: number; passThroughSatang: number; paidSatang: number; paidPassThroughSatang: number };
export type PaymentSlice = { dueId: string; seq: number; amountSatang: number; passThroughSatang: number; vatableSatang: number; completesDue: boolean; duePaidBeforeSatang: number };
const OPEN_DUE: ReadonlySet<string> = new Set(TRIP_DUE_OPEN_STATUSES);
/**
 * เติมงวดที่รับเงินได้ตามลำดับ seq · ต่อชิ้น: เก็บแทนสะสม = round(pt × (paid + a) / amount) − เก็บแทนที่รับแล้ว (สูตรสะสมเดียวกับ snapshot.ts :310–:315)
 * ⇒ งวดที่จ่ายครบได้เก็บแทนครบพอดีเสมอ · ยอดเกินยอดค้าง = OVERPAYMENT · ไม่มีงวดค้าง = NOTHING_DUE · ยอดผิดรูป = INVALID_AMOUNT
 */
export function allocatePayment(dues: readonly DueState[], amountSatang: number): { ok: true; slices: PaymentSlice[] } | { ok: false; reason: "INVALID_AMOUNT" | "NOTHING_DUE" | "OVERPAYMENT" } {
  if (typeof amountSatang !== "number" || !Number.isSafeInteger(amountSatang) || amountSatang < 1 || amountSatang > INT4_MAX) return { ok: false, reason: "INVALID_AMOUNT" };
  if (!Array.isArray(dues)) return { ok: false, reason: "NOTHING_DUE" };
  const open = dues
    .filter((d) => isRec(d) && typeof d.status === "string" && OPEN_DUE.has(d.status) && int4(d.amountSatang) && int4(d.paidSatang) && int4(d.passThroughSatang) && int4(d.paidPassThroughSatang) && d.paidSatang < d.amountSatang)
    .map((d) => ({ id: d.id, seq: d.seq, amountSatang: d.amountSatang, passThroughSatang: d.passThroughSatang, paidSatang: d.paidSatang, paidPassThroughSatang: d.paidPassThroughSatang }))
    .sort((a, b) => a.seq - b.seq);
  const outstanding = sum(open.map((d) => d.amountSatang - d.paidSatang));
  if (outstanding <= 0) return { ok: false, reason: "NOTHING_DUE" };
  if (amountSatang > outstanding) return { ok: false, reason: "OVERPAYMENT" };
  let left = amountSatang;
  const slices: PaymentSlice[] = [];
  for (const d of open) {
    if (left <= 0) break;
    const a = Math.min(left, d.amountSatang - d.paidSatang);
    const ptAfter = mulDivHalfUp(d.passThroughSatang, d.paidSatang + a, d.amountSatang);
    const pt = Math.max(0, Math.min(a, ptAfter - d.paidPassThroughSatang));
    slices.push({ dueId: d.id, seq: d.seq, amountSatang: a, passThroughSatang: pt, vatableSatang: a - pt, completesDue: d.paidSatang + a === d.amountSatang, duePaidBeforeSatang: d.paidSatang });
    left -= a;
  }
  return { ok: true, slices };
}
/** สถานะการจองหลังรับเงิน: ครบ ⇒ PAID · บางส่วน ⇒ PART_PAID · 0 ⇒ null */
export function bookingStatusAfterPayment(paidSatang: number, payableSatang: number): "PAID" | "PART_PAID" | null {
  if (!Number.isFinite(paidSatang) || paidSatang <= 0) return null;
  return paidSatang >= payableSatang ? "PAID" : "PART_PAID";
}

// ═══════════════ §4.5 ใบเสนอคืนเงินจาก snapshot ═══════════════
export type RefundReasonKind = "CUSTOMER" | "EXTERNAL" | "MIN_NOT_MET" | "SHOP_FAULT";
export type RefundQuoteInput = {
  at: string;
  reasonKind: RefundReasonKind;
  paidSatang: number;
  deductionsSatang: number;
  passThroughPaidOut: boolean;
  /** ขั้นต่ำตามประกาศคืนเงิน 2563 ณ จำนวนวันก่อนเดินทาง (bp) — ผู้เรียกอ่านจากทะเบียนกฎหมาย (มติ §22 ข้อ 4) · ไม่ส่ง = ไม่ตรวจ */
  statutoryFloorBpAt?: (daysBefore: number) => number | null;
};
export type RefundQuote = {
  daysBefore: number;
  step: { daysBefore: number; refundBp: number } | null;
  refundBp: number;
  paidSatang: number;
  refundSatang: number;
  keptSatang: number;
  refundNonPtSatang: number;
  refundPassThroughSatang: number;
  refundVatSatang: number;
  keptVatSatang: number;
  deductionsSatang: number;
  lines: CancelLine[];
  warnings: string[];
};
const REASONS: ReadonlySet<string> = new Set(["CUSTOMER", "EXTERNAL", "MIN_NOT_MET", "SHOP_FAULT"]);
/**
 * แกน = recomputeFromSnapshot CANCEL ของ T0.5 (ไม่เขียนสูตรใหม่) + หลักฐานเงินเก็บแทนจ่ายออกแล้ว (คืนเก็บแทน 0 + คำเตือน) +
 * คำเตือนต่ำกว่าขั้นต่ำตามประกาศ (WARN เท่านั้น) · snapshot เสีย/คีย์ไม่ได้จด ⇒ SNAPSHOT_INVALID · อินพุตผิดรูป ⇒ INVALID_INPUT
 */
export function refundQuoteFromSnapshot(snap: unknown, input: RefundQuoteInput): { ok: true; value: RefundQuote } | { ok: false; reason: "SNAPSHOT_INVALID" | "INVALID_INPUT" | "SETTINGS_INVALID" } {
  if (!isRec(input) || typeof input.at !== "string" || typeof input.reasonKind !== "string" || !REASONS.has(input.reasonKind) || !int4(input.paidSatang) || !int4(input.deductionsSatang) || typeof input.passThroughPaidOut !== "boolean") {
    return { ok: false, reason: "INVALID_INPUT" };
  }
  let c: CancelComputed;
  try {
    const r = recomputeFromSnapshot(snap, { kind: "CANCEL", at: input.at, reasonKind: input.reasonKind, paidSatang: input.paidSatang, deductionsSatang: input.deductionsSatang });
    if (!r.ok) return { ok: false, reason: r.details.reason === "SETTINGS_INVALID" ? "SETTINGS_INVALID" : r.details.reason === "INVALID_INPUT" ? "INVALID_INPUT" : "SNAPSHOT_INVALID" };
    if (!("refundSatang" in r.value) || !("lines" in r.value)) return { ok: false, reason: "SNAPSHOT_INVALID" };
    c = r.value;
  } catch {
    return { ok: false, reason: "SNAPSHOT_INVALID" };
  }
  if (![c.paidSatang, c.refundSatang, c.keptSatang, c.refundPassThroughSatang, c.refundVatSatang, c.keptVatSatang].every((x) => typeof x === "number" && Number.isSafeInteger(x))) return { ok: false, reason: "SNAPSHOT_INVALID" };
  // ค่าใช้จ่ายจริงที่หักได้จริง (หลังตัดไม่ให้ติดลบ) = Σ (คืนตามขั้น − คืนจริง) ของบรรทัดที่ไม่ใช่เก็บแทน
  const deductionsUsed = sum(c.lines.filter((l) => l.rule === "BP").map((l) => mulBpHalfUp(l.paidSatang, c.refundBp) - l.refundSatang));
  const warnings: string[] = [];
  let refundPt = c.refundPassThroughSatang;
  let lines = c.lines.map((l) => ({ ...l }));
  if (input.passThroughPaidOut && refundPt > 0) {
    refundPt = 0;
    lines = lines.map((l) => (l.rule === "FULL" ? { ...l, refundSatang: 0, keptSatang: l.paidSatang } : l));
  }
  if (input.passThroughPaidOut) warnings.push("PASS_THROUGH_PAID_OUT");
  const refundNonPt = c.refundSatang - c.refundPassThroughSatang;
  const refundSatang = refundNonPt + refundPt;
  if (input.reasonKind === "CUSTOMER" && typeof input.statutoryFloorBpAt === "function") {
    let floor: number | null = null;
    try {
      floor = input.statutoryFloorBpAt(c.daysBefore);
    } catch {
      floor = null;
    }
    if (typeof floor === "number" && c.refundBp < floor) warnings.push("REFUND_BELOW_STATUTORY_MINIMUM");
  }
  return {
    ok: true,
    value: {
      daysBefore: c.daysBefore,
      step: c.step ? { daysBefore: c.step.daysBefore, refundBp: c.step.refundBp } : null,
      refundBp: c.refundBp,
      paidSatang: c.paidSatang,
      refundSatang,
      keptSatang: c.paidSatang - refundSatang,
      refundNonPtSatang: refundNonPt,
      refundPassThroughSatang: refundPt,
      refundVatSatang: c.refundVatSatang,
      keptVatSatang: c.keptVatSatang,
      deductionsSatang: deductionsUsed,
      lines,
      warnings,
    },
  };
}

// ═══════════════ §4.6 แตกยอดคืนต่อใบรับเดิม ═══════════════
export type ReceiptRow = { eventId: string; dueId: string | null; tender: string; amountSatang: number; vatableSatang: number; passThroughSatang: number; vatSatang: number };
export type RefundSlice = { eventId: string; dueId: string | null; tender: string; amountSatang: number; vatableSatang: number; passThroughSatang: number; vatSatang: number };
/**
 * เก็บแทน: ปันตามเก็บแทนของใบรับ · ส่วนไม่ใช่เก็บแทน: ปันตาม vatable ของใบรับ (allocateWithin · ผลรวมตรงพอดี · ต่อใบไม่เกินที่รับ)
 * VAT ส่วนคืนต่อใบ = min(VAT ของใบ, VAT ต่อเอกสารของส่วนคืน) · ส่วนเก็บ = ใบ − ส่วนคืน ทุกช่อง · ยอดขอเกินที่รับ ⇒ OVER_REFUND (ไม่ตัดเงียบ)
 * ใบที่คืน 0 ⇒ ไม่มีแถวคืน · ใบที่เก็บ 0 (ยอด 0 และ VAT 0) ⇒ ไม่มีแถวเก็บ · tender ของแถว = tender ของใบรับเดิม
 */
export function planRefundSlices(input: { receipts: readonly ReceiptRow[]; refundNonPtSatang: number; refundPassThroughSatang: number; vatCtx: ReceiptVatCtx }):
  | { ok: true; refunded: RefundSlice[]; retained: RefundSlice[] }
  | { ok: false; reason: "OVER_REFUND" | "INVALID_INPUT" } {
  if (!isRec(input) || !Array.isArray(input.receipts) || !int4(input.refundNonPtSatang) || !int4(input.refundPassThroughSatang)) return { ok: false, reason: "INVALID_INPUT" };
  const rs = input.receipts;
  for (const r of rs) {
    if (!isRec(r) || !int4(r.amountSatang) || !int4(r.vatableSatang) || !int4(r.passThroughSatang) || !int4(r.vatSatang) || r.amountSatang !== r.vatableSatang + r.passThroughSatang) return { ok: false, reason: "INVALID_INPUT" };
  }
  if (input.refundPassThroughSatang > sum(rs.map((r) => r.passThroughSatang)) || input.refundNonPtSatang > sum(rs.map((r) => r.vatableSatang))) return { ok: false, reason: "OVER_REFUND" };
  const ptA = allocateWithin(input.refundPassThroughSatang, rs.map((r) => r.passThroughSatang));
  const npA = allocateWithin(input.refundNonPtSatang, rs.map((r) => r.vatableSatang));
  if (sum(ptA) !== input.refundPassThroughSatang || sum(npA) !== input.refundNonPtSatang) return { ok: false, reason: "OVER_REFUND" };
  const refunded: RefundSlice[] = [];
  const retained: RefundSlice[] = [];
  rs.forEach((r, i) => {
    const np = npA[i] ?? 0;
    const pt = ptA[i] ?? 0;
    // คืนส่วนไม่ใช่เก็บแทนทั้งใบ ⇒ VAT ทั้งใบ (ไม่พึ่ง vatCtx ปัจจุบันที่อาจต่างจากตอนรับเงิน)
    const vat = np === r.vatableSatang ? r.vatSatang : Math.min(r.vatSatang, receiptVatSatang(np, input.vatCtx));
    const ref: RefundSlice = { eventId: r.eventId, dueId: r.dueId, tender: r.tender, amountSatang: np + pt, vatableSatang: np, passThroughSatang: pt, vatSatang: vat };
    const ret: RefundSlice = { eventId: r.eventId, dueId: r.dueId, tender: r.tender, amountSatang: r.amountSatang - ref.amountSatang, vatableSatang: r.vatableSatang - np, passThroughSatang: r.passThroughSatang - pt, vatSatang: r.vatSatang - vat };
    if (ref.amountSatang > 0) refunded.push(ref);
    if (ret.amountSatang > 0 || ret.vatSatang > 0) retained.push(ret);
  });
  return { ok: true, refunded, retained };
}

// ═══════════════ §4.7 คำอนุมัติ · เอกสาร ═══════════════
/** sha256 hex ของข้อความ UTF-8 (บริสุทธิ์ · ไฟล์นี้ import node:crypto ไม่ได้ — ใบสั่ง §1) — FIPS 180-4 */
const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
function sha256hexPure(text: string): string {
  const msg = new TextEncoder().encode(text);
  const bitLen = msg.length * 8;
  const padded = new Uint8Array((((msg.length + 9 + 63) >> 6) << 6));
  padded.set(msg);
  padded[msg.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  dv.setUint32(padded.length - 4, bitLen >>> 0);
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const W = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K256[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }
  return H.map((x) => x.toString(16).padStart(8, "0")).join("");
}
/** entityId ของคำอนุมัติแก้ยอดคืนมือ — ผูก หน่วย · คำขอ · ยอดคืนสุดท้าย (แบบ tripPriceOverrideEntityId · มติ T0.6 §17) */
export function tripRefundEntityId(i: { unitId: string; requestId: string; amountSatang: number }): string {
  return `trf1_${sha256hexPure(JSON.stringify(["trips.refund.v1", i.unitId, i.requestId, i.amountSatang]))}`;
}

export type MoneyDocument = {
  serviceInclVatSatang: number;
  preVatSatang: number;
  vatSatang: number;
  passThroughSatang: number;
  totalSatang: number;
  lines: { itemRef: string; label: string; qty: number; amountSatang: number; passThrough: boolean; taxKind: string }[];
};
/** ตัวเลขเอกสารรับเงินของทั้งการจอง (ภาพ 13ค) — VAT = vatOfInclusive(Σ VAT7 ที่ไม่ใช่เก็บแทน) ต่อเอกสาร · snapshot เสีย ⇒ null (ไม่ใช่ใบกำกับ · T0.7b) */
export function moneyDocumentOf(snap: unknown): MoneyDocument | null {
  if (!isRec(snap)) return null;
  const tax = taxOf(snap);
  if (!tax) return null;
  const excl = !tax.pricesIncludeVat;
  const ls = linesOf(snap);
  const nonPt = ls.filter((l) => l.passThrough !== true);
  const pt = ls.filter((l) => l.passThrough === true);
  const service = sum(nonPt.map((l) => lineDue(l, excl)));
  const vat = tax.vatRegistered ? vatOfInclusive(sum(nonPt.filter((l) => l.taxKind === "VAT7").map((l) => lineDue(l, excl))), tax.vatRateBp) : 0;
  const ptSum = sum(pt.map((l) => (int4(l.amountSatang) ? l.amountSatang : 0)));
  return {
    serviceInclVatSatang: service,
    preVatSatang: service - vat,
    vatSatang: vat,
    passThroughSatang: ptSum,
    totalSatang: service + ptSum,
    lines: ls.map((l) => ({
      itemRef: typeof l.itemRef === "string" ? l.itemRef : "",
      label: typeof l.label === "string" ? l.label : "",
      qty: int4(l.qty) ? l.qty : 0,
      amountSatang: l.passThrough === true ? (int4(l.amountSatang) ? l.amountSatang : 0) : lineDue(l, excl),
      passThrough: l.passThrough === true,
      taxKind: typeof l.taxKind === "string" ? l.taxKind : "NONE",
    })),
  };
}

// ═══════════════ §4.8 พอร์ตลงบัญชี (ตัวต่อเปล่า · T0.7b เสียบ · มติ §22 ข้อ 1) ═══════════════
export type PostingOutcome = { ok: true; accountDocId: string; accountEntryId: string } | { ok: false; retryable: boolean; reason: string };
export type TripsPostingPort = {
  postReceipt(ev: { tenantId: string; unitId: string; moneyEventId: string; idempotencyKey: string }): Promise<PostingOutcome>;
  postRefund(req: { tenantId: string; unitId: string; requestId: string }): Promise<PostingOutcome>;
};
/** ค่าเริ่ม: ยังไม่เชื่อมบัญชี V2 — T0.7a ไม่เรียกพอร์ตนี้ในเส้นทางเงิน (ไม่ลองซ้ำ · ไม่นับครั้ง) */
export const unavailablePostingPort: TripsPostingPort = Object.freeze({
  postReceipt: async (): Promise<PostingOutcome> => ({ ok: false, retryable: false, reason: "ACCOUNT_FACADE_MISSING" }),
  postRefund: async (): Promise<PostingOutcome> => ({ ok: false, retryable: false, reason: "ACCOUNT_FACADE_MISSING" }),
});
// ── /T0.7 money ──
