// ─────────────────────────────────────────────────────────────
// trips/report-core.ts — ตัวช่วยบริสุทธิ์ของเงินระดับการจอง/รอบ (ต้นทุนรอบ · กำไรขั้นต้น · การ์ดเงินแผงรอบ) · RUN TRIPS T1.7a1 §3
// 🔴 บริสุทธิ์: import ค่าได้เฉพาะ ./money-math ./booking-view-core ./money-core (+ import type) · ไม่มี I/O · ไม่อ่านนาฬิกา · ไม่แก้อินพุต
// 🔴 ทุกตัวเลขเป็น "ตัวเลขบริหาร" ไม่ใช่รายงานบัญชี (OQ10/OQ21) · สตางค์จำนวนเต็มเสมอ · หาร/ปัดผ่าน money-math เท่านั้น
// 🔴 เงินเก็บแทน (ค่าอุทยาน ฯลฯ) ไม่ใช่รายได้และไม่ใช่ต้นทุน · ภาษีหัก ณ ที่จ่ายไม่ใช่ต้นทุน (N3)
// ─────────────────────────────────────────────────────────────
import { mulDivHalfUp } from "./money-math";
import { amountProblemOf, outstandingOf, parseAmountSatang } from "./booking-view-core";

// ── T1.7a1 report-core ──
// ═══════════════ ค่าคงที่ ═══════════════
/** = TripCost_kind_check · ลำดับแสดง */
export const TRIP_COST_KINDS = ["BOAT", "FUEL", "GUIDE", "FOOD", "PARK_FEE", "TRANSPORT", "EQUIPMENT", "OTHER"] as const;
export type TripCostKind = (typeof TRIP_COST_KINDS)[number];
export const TRIP_COST_ROWS_MAX = 30;
/** ต่อแถว ฿10,000,000.00 · รวมทั้งรอบ ≤ int4 */
export const TRIP_COST_AMOUNT_MAX = 1_000_000_000;
export const TRIP_COST_NOTE_MAX = 200;
const INT4_MAX = 2_147_483_647;
export const REPORT_LIVE_STATUSES = ["CONFIRMED", "PART_PAID", "PAID", "TRAVELLED", "NO_SHOW"] as const;
export const REPORT_PENDING_STATUSES = ["HOLD", "PENDING"] as const;
export const MONEY_COUNTED = ["LIVE", "CANCELLED", "PENDING_REFUND", "EXCLUDED"] as const;
export type MoneyCounted = (typeof MONEY_COUNTED)[number];
export const CHANNEL_GROUPS = { DIRECT: ["WEB", "LIFF", "EMBED", "COUNTER", "POS", "CHAT_AI"], AGENT: ["AGENT_PORTAL", "AGENT_LINK", "AGENT_API"], OTHER: ["OTA", "API", "IMPORT"] } as const;
export type ChannelGroup = keyof typeof CHANNEL_GROUPS;
/** N7 — ไม่มี CLOSED จนมีการปิดทริป (T1.5) */
export const DEPARTURE_REPORT_STATES = ["UPCOMING", "ENDED", "CANCELLED"] as const;
export type DepartureReportState = (typeof DEPARTURE_REPORT_STATES)[number];
export const MONEY_WARNING_CODES = ["PARK_FEE_WITH_PASS_THROUGH", "SUPPLIER_COSTS_NOT_INCLUDED", "SNAPSHOT_FALLBACK", "FX_BOOKINGS", "VAT_STATUS_UNKNOWN", "OTA_FEES_NOT_INCLUDED"] as const;
export type MoneyWarningCode = (typeof MONEY_WARNING_CODES)[number];

const LIVE_SET: readonly string[] = REPORT_LIVE_STATUSES;

// ═══════════════ เงินต่อการจอง ═══════════════
export type BookingMoneyIn = {
  status: string;
  collectMode: string;
  agentAccountId: string | null;
  channel: string;
  /** ที่นั่งที่กินความจุ (ฐานเดียวกับตัวนับ sold · N11) */
  seats: number;
  /** snapshot.totals.payableSatang (ผู้เรียกคิดสำรองเมื่อไม่มี) */
  payableSatang: number;
  passThroughSatang: number;
  vatSatang: number;
  commissionSatang: number;
  commissionVatSatang: number;
  /** snapshot.tax.vatRegistered (ผู้เรียก: ไม่มี ⇒ สถานะ VAT ของหน่วย · Q10) */
  vatRegistered: boolean;
  paidSatang: number;
  refundedSatang: number;
  /** มีคำขอคืนเงินเปิด ∨ (รอบยกเลิก ∧ สถานะยังนับ ∧ มีเงินรับไว้ · Q12) */
  pendingRefund: boolean;
  /** รอบถูกยกเลิก (Q12): การจองที่ยังค้างโดยไม่มีเงินรับไว้ ⇒ ไม่นับ (ไม่ใช่ยอดขาย/ค้างรับ ไม่ใช่รอคืนเงิน) — ไม่ระบุ = false */
  departureCancelled?: boolean;
  retained: readonly { amountSatang: number; vatSatang: number; passThroughSatang: number }[];
};
export type BookingMoney = {
  counted: MoneyCounted;
  seats: number;
  salesSatang: number;
  passThroughSatang: number;
  vatSatang: number;
  revenueExVatSatang: number;
  commissionCostSatang: number;
  collectedSatang: number;
  outstandingSatang: number;
  heldSatang: number;
  agentCollect: boolean;
  noShowUnpaid: boolean;
};
const ZERO: Omit<BookingMoney, "counted"> = { seats: 0, salesSatang: 0, passThroughSatang: 0, vatSatang: 0, revenueExVatSatang: 0, commissionCostSatang: 0, collectedSatang: 0, outstandingSatang: 0, heldSatang: 0, agentCollect: false, noShowUnpaid: false };

/** ลำดับตัดสิน: รอคืนเงิน ⇒ PENDING_REFUND · สถานะนับ ⇒ LIVE · ยกเลิก ⇒ CANCELLED · อื่น ⇒ EXCLUDED (ใบสั่ง §3.1) */
export function bookingMoneyOf(b: BookingMoneyIn): BookingMoney {
  const P = b.payableSatang;
  const T = b.passThroughSatang;
  const V = b.vatSatang;
  const net = b.paidSatang - b.refundedSatang;
  if (b.pendingRefund) return { ...ZERO, counted: "PENDING_REFUND", seats: b.seats, heldSatang: net };
  if (b.departureCancelled === true && LIVE_SET.includes(b.status)) return { ...ZERO, counted: "EXCLUDED" };
  if (LIVE_SET.includes(b.status)) {
    const agentCollect = b.collectMode === "AGENT" || b.agentAccountId !== null;
    const commissionCostSatang = b.commissionSatang + (b.vatRegistered ? 0 : b.commissionVatSatang);
    let sales = P - T;
    let pt = T;
    let vat = V;
    let noShowUnpaid = false;
    if (b.status === "NO_SHOW") {
      // N6 · C10: นับเท่าที่รับ — เงินที่รับลงส่วนที่ไม่ใช่เงินเก็บแทนก่อน
      const R = Math.min(Math.max(0, net), P);
      const nonPt = P - T;
      const s = Math.min(R, nonPt);
      sales = s;
      pt = R - s;
      vat = nonPt <= 0 ? 0 : s === nonPt ? V : mulDivHalfUp(V, s, nonPt);
      noShowUnpaid = R < P;
    }
    return {
      counted: "LIVE",
      seats: b.seats,
      salesSatang: sales,
      passThroughSatang: pt,
      vatSatang: vat,
      revenueExVatSatang: sales - vat,
      commissionCostSatang,
      collectedSatang: net,
      outstandingSatang: agentCollect ? 0 : outstandingOf({ status: b.status, payableSatang: P, paidSatang: b.paidSatang }),
      heldSatang: 0,
      agentCollect,
      noShowUnpaid,
    };
  }
  if (b.status === "CANCELLED") {
    let amount = 0;
    let pt = 0;
    let vat = 0;
    for (const r of b.retained) {
      amount += r.amountSatang;
      pt += r.passThroughSatang;
      vat += r.vatSatang;
    }
    const sales = amount - pt;
    return { ...ZERO, counted: "CANCELLED", salesSatang: sales, passThroughSatang: pt, vatSatang: vat, revenueExVatSatang: sales - vat, collectedSatang: net };
  }
  return { ...ZERO, counted: "EXCLUDED" };
}

export type MoneyTotals = {
  bookings: number;
  cancelledBookings: number;
  pendingRefundBookings: number;
  seats: number;
  salesSatang: number;
  passThroughSatang: number;
  vatSatang: number;
  revenueExVatSatang: number;
  commissionCostSatang: number;
  collectedSatang: number;
  outstandingSatang: number;
  heldSatang: number;
  retainedSatang: number;
  agentCollectBookings: number;
  noShowUnpaid: number;
};
/** บวกทีละช่อง · EXCLUDED ไม่นับ */
export function sumMoney(xs: readonly BookingMoney[]): MoneyTotals {
  const t: MoneyTotals = { bookings: 0, cancelledBookings: 0, pendingRefundBookings: 0, seats: 0, salesSatang: 0, passThroughSatang: 0, vatSatang: 0, revenueExVatSatang: 0, commissionCostSatang: 0, collectedSatang: 0, outstandingSatang: 0, heldSatang: 0, retainedSatang: 0, agentCollectBookings: 0, noShowUnpaid: 0 };
  for (const x of xs) {
    if (x.counted === "EXCLUDED") continue;
    if (x.counted === "LIVE") t.bookings += 1;
    if (x.counted === "CANCELLED") {
      t.cancelledBookings += 1;
      t.retainedSatang += x.collectedSatang;
    }
    if (x.counted === "PENDING_REFUND") t.pendingRefundBookings += 1;
    t.seats += x.seats;
    t.salesSatang += x.salesSatang;
    t.passThroughSatang += x.passThroughSatang;
    t.vatSatang += x.vatSatang;
    t.revenueExVatSatang += x.revenueExVatSatang;
    t.commissionCostSatang += x.commissionCostSatang;
    t.collectedSatang += x.collectedSatang;
    t.outstandingSatang += x.outstandingSatang;
    t.heldSatang += x.heldSatang;
    if (x.agentCollect) t.agentCollectBookings += 1;
    if (x.noShowUnpaid) t.noShowUnpaid += 1;
  }
  return t;
}

/** กำไรขั้นต้น = รายได้ก่อน VAT − ต้นทุนคอมฯ − ต้นทุนรอบ (ติดลบได้) · มาร์จิน bp ปัดครึ่งออกจากศูนย์ · รายได้ ≤ 0 ⇒ null */
export function profitOf(i: { revenueExVatSatang: number; commissionCostSatang: number; costSatang: number }): { grossProfitSatang: number; marginBp: number | null } {
  const gp = i.revenueExVatSatang - i.commissionCostSatang - i.costSatang;
  return { grossProfitSatang: gp, marginBp: i.revenueExVatSatang > 0 ? mulDivHalfUp(gp, 10_000, i.revenueExVatSatang) : null };
}
/** อัตราเต็ม (bp) · ความจุ 0 ⇒ null */
export function loadFactorBp(sold: number, capacity: number): number | null {
  return capacity > 0 ? mulDivHalfUp(sold, 10_000, capacity) : null;
}
export function channelGroupOf(channel: string): ChannelGroup {
  if ((CHANNEL_GROUPS.DIRECT as readonly string[]).includes(channel)) return "DIRECT";
  if ((CHANNEL_GROUPS.AGENT as readonly string[]).includes(channel)) return "AGENT";
  return "OTHER";
}
/** N7: ยกเลิก ⇒ CANCELLED · ยังไม่จบ ⇒ UPCOMING · อื่น ⇒ ENDED (เดินทางแล้ว) — ประมาณการทุกรอบจนมีการปิดทริป */
export function departureReportStateOf(d: { status: string; endsAt: Date }, now: Date): DepartureReportState {
  if (d.status === "CANCELLED") return "CANCELLED";
  return now.getTime() < d.endsAt.getTime() ? "UPCOMING" : "ENDED";
}
/** ตัวบ่งชี้ชั่วคราวของรอบเหมาลำ (C9 · ช่องจริงมากับ L1.11/S1.6): 1 การจองกินที่ครบความจุ */
export function charterLikeOf(d: { capacity: number; liveBookings: number; liveSeats: number }): boolean {
  return d.capacity > 0 && d.liveBookings === 1 && d.liveSeats >= d.capacity;
}

// ═══════════════ สิทธิ์ต้นทุน (N9 · แคบแบบ canSeeSensitive — trips.* ไม่นับ) ═══════════════
export function costAccessOf(m: { role: string; unitAccess: string[]; permissions: Record<string, unknown> } | null, unitId: string): { view: boolean; edit: boolean } {
  if (!m) return { view: false, edit: false };
  if (m.role === "OWNER") return { view: true, edit: true };
  const unitOk = Array.isArray(m.unitAccess) && (m.unitAccess.includes("*") || m.unitAccess.includes(unitId));
  if (!unitOk) return { view: false, edit: false };
  if (m.role === "MANAGER") return { view: true, edit: true };
  const edit = m.permissions?.["trips.cost.edit"] === true;
  return { view: edit || m.permissions?.["trips.cost.view"] === true, edit };
}

// ═══════════════ แถวต้นทุน ═══════════════
export type CostRowIn = { id: string | null; kind: TripCostKind; amountSatang: number; note: string | null };
type ParseCode = "INVALID_INPUT" | "COST_ROWS_LIMIT" | "COST_AMOUNT_INVALID";
/** ช่องที่ผิดของแถว (U6) — จอผูก aria-invalid ตามช่องนี้ */
export type CostRowField = "kind" | "amount" | "note";
/** row = ลำดับ (เริ่ม 0) ของแถวแรกที่ผิด (Q4) · field = ช่องที่ผิด (U6) · ไม่มี ⇒ ผิดทั้งชุด/รูปแถว */
export type ParsedCostRows = { ok: true; rows: CostRowIn[] } | { ok: false; code: ParseCode; row?: number; field?: CostRowField };
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const KIND_SET: readonly string[] = TRIP_COST_KINDS;
const CTL_RE = /[\u0000-\u001f\u007f]/;
/** U4: U+200B (ZWSP) ตัดทิ้งเงียบ ๆ ก่อนตรวจ */
const ZWSP_RE = /\u200b/g;
/** U4: อักขระควบคุม · มองไม่เห็น · bidi · ตัวคั่นบรรทัดพิเศษ — ยอม U+200C/U+200D (อีโมจิผสม/ข้อความที่วางจาก LINE) */
const NOTE_BAD_RE = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200e\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/;
/** Q13: รูปยอดในฟอร์ม — คอมมาเป็นตัวคั่นหลักพันเท่านั้น · ช่องว่างหัวท้ายได้ ข้างในไม่ได้ */
const AMOUNT_TEXT_RE = /^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/;
const ROW_KEYS = new Set(["id", "kind", "amountSatang", "note"]);
const FORM_KEYS = new Set(["id", "kind", "amountText", "note"]);

type RowBase = { ok: true; id: string | null; kind: TripCostKind; note: string | null } | { ok: false; field: CostRowField | null; invisible: boolean };
/** id / kind / note ของแถว (ใช้ทั้งทางบริการ parseCostRows และทางฟอร์ม costRowsFromForm) — ผิด ⇒ ช่องที่ผิด */
function rowBase(r: Record<string, unknown>): RowBase {
  const id = r.id;
  if (id !== undefined && (typeof id !== "string" || id.length < 1 || id.length > 100 || CTL_RE.test(id))) return { ok: false, field: null, invisible: false };
  if (typeof r.kind !== "string" || !KIND_SET.includes(r.kind)) return { ok: false, field: "kind", invisible: false };
  const note = r.note;
  if (note !== undefined && note !== null && typeof note !== "string") return { ok: false, field: "note", invisible: false };
  let n: string | null = null;
  if (typeof note === "string") {
    const clean = note.replace(ZWSP_RE, "");
    if (NOTE_BAD_RE.test(clean)) return { ok: false, field: "note", invisible: true };
    const t = clean.trim();
    if (t.length > TRIP_COST_NOTE_MAX) return { ok: false, field: "note", invisible: false };
    n = t.length ? t : null;
  }
  return { ok: true, id: typeof id === "string" ? id : null, kind: r.kind as TripCostKind, note: n };
}
/** ผลผิดของแถว (field เฉพาะเมื่อรู้ช่อง) */
const rowFail = <C extends string>(code: C, row: number, field: CostRowField | null) => ({ ok: false as const, code, row, ...(field ? { field } : {}) });

/** ชุดหลังแปลงยอดแล้ว: id ซ้ำ ⇒ INVALID_INPUT (แถวที่ซ้ำ) · Σ เกิน int4 ⇒ COST_AMOUNT_INVALID */
function finishRows(rows: CostRowIn[]): ParsedCostRows {
  const seen = new Set<string>();
  for (const [i, r] of rows.entries()) {
    if (r.id === null) continue;
    if (seen.has(r.id)) return rowFail("INVALID_INPUT", i, null);
    seen.add(r.id);
  }
  let total = 0;
  for (const r of rows) total += r.amountSatang;
  if (total > INT4_MAX) return { ok: false, code: "COST_AMOUNT_INVALID" };
  return { ok: true, rows };
}

/** ชุดต้นทุนทั้งรอบ (ทางบริการ · ยอดเป็นสตางค์) — แถวแรกที่ผิดชนะ · หมายเหตุมีอักขระต้องห้าม ⇒ INVALID_INPUT (ทางบริการ) */
export function parseCostRows(raw: unknown): ParsedCostRows {
  if (!Array.isArray(raw)) return { ok: false, code: "INVALID_INPUT" };
  if (raw.length > TRIP_COST_ROWS_MAX) return { ok: false, code: "COST_ROWS_LIMIT" };
  const rows: CostRowIn[] = [];
  for (const [i, r] of raw.entries()) {
    if (!isRec(r) || Object.keys(r).some((k) => !ROW_KEYS.has(k))) return rowFail("INVALID_INPUT", i, null);
    const base = rowBase(r);
    if (!base.ok) return rowFail("INVALID_INPUT", i, base.field);
    const a = r.amountSatang;
    if (typeof a !== "number" || !Number.isSafeInteger(a)) return rowFail("INVALID_INPUT", i, "amount");
    if (a < 1 || a > TRIP_COST_AMOUNT_MAX) return rowFail("COST_AMOUNT_INVALID", i, "amount");
    rows.push({ id: base.id, kind: base.kind, amountSatang: a, note: base.note });
  }
  return finishRows(rows);
}

/** ฟอร์มของจอ (ยอดเป็นข้อความบาท · N11 · Q13) — แถวแรกที่ผิดชนะ · ผลผิดมี row (Q4) + field (U6) · หมายเหตุมองไม่เห็น ⇒ COST_NOTE_INVISIBLE (U4) */
export function costRowsFromForm(raw: unknown): ParsedCostRows | { ok: false; code: "COST_AMOUNT_FORMAT" | "COST_NOTE_INVISIBLE"; row: number; field: CostRowField } {
  if (!Array.isArray(raw)) return { ok: false, code: "INVALID_INPUT" };
  if (raw.length > TRIP_COST_ROWS_MAX) return { ok: false, code: "COST_ROWS_LIMIT" };
  const rows: CostRowIn[] = [];
  for (const [i, r] of raw.entries()) {
    if (!isRec(r) || Object.keys(r).some((k) => !FORM_KEYS.has(k)) || typeof r.amountText !== "string") return rowFail("INVALID_INPUT", i, null);
    const base = rowBase(r);
    if (!base.ok) return base.invisible ? { ok: false, code: "COST_NOTE_INVISIBLE", row: i, field: "note" } : rowFail("INVALID_INPUT", i, base.field);
    const text = r.amountText.trim();
    // ตรวจรูปก่อนเรียกตัวแปลงกลาง (ตัวแปลงกลางตัดคอมมา/ช่องว่างทุกตำแหน่ง — ไม่แก้ตัวกลาง)
    if (!AMOUNT_TEXT_RE.test(text)) return { ok: false, code: "COST_AMOUNT_FORMAT", row: i, field: "amount" };
    const satang = parseAmountSatang(text);
    if (satang === null) return amountProblemOf(text) === "format" ? { ok: false, code: "COST_AMOUNT_FORMAT", row: i, field: "amount" } : rowFail("COST_AMOUNT_INVALID", i, "amount");
    if (satang > TRIP_COST_AMOUNT_MAX) return rowFail("COST_AMOUNT_INVALID", i, "amount");
    rows.push({ id: base.id, kind: base.kind, amountSatang: satang, note: base.note });
  }
  return finishRows(rows);
}

/** คีย์เนื้อหาของชุดต้นทุน — ไม่ขึ้นกับลำดับแถว · นับซ้ำ · null ≡ ไม่มีหมายเหตุ */
export function costContentKey(rows: readonly { kind: string; amountSatang: number; note?: string | null }[]): string {
  return JSON.stringify(rows.map((r) => JSON.stringify([r.kind, r.amountSatang, r.note ?? null])).sort());
}
// ── /T1.7a1 report-core ──
