// ─────────────────────────────────────────────────────────────
// trips/report-core.ts — ตัวช่วยบริสุทธิ์ของเงินระดับการจอง/รอบ (ต้นทุนรอบ · กำไรขั้นต้น · การ์ดเงินแผงรอบ) · RUN TRIPS T1.7a1 §3
// 🔴 บริสุทธิ์: import ค่าได้เฉพาะ ./money-math ./booking-view-core ./money-core (+ import type) · ไม่มี I/O · ไม่อ่านนาฬิกา · ไม่แก้อินพุต
// 🔴 ทุกตัวเลขเป็น "ตัวเลขบริหาร" ไม่ใช่รายงานบัญชี (OQ10/OQ21) · สตางค์จำนวนเต็มเสมอ · หาร/ปัดผ่าน money-math เท่านั้น
// 🔴 เงินเก็บแทน (ค่าอุทยาน ฯลฯ) ไม่ใช่รายได้และไม่ใช่ต้นทุน · ภาษีหัก ณ ที่จ่ายไม่ใช่ต้นทุน (N3)
// ─────────────────────────────────────────────────────────────
import { mulDivHalfUp } from "./money-math";
import { amountProblemOf, outstandingOf, parseAmountSatang } from "./booking-view-core";
import { addDaysYmd, localToUtc, utcToLocal, weekdayOfYmd } from "./departures-core";
import { csvCell } from "./manifest-core";

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

// ── T1.7a2 report-core ──
// ═══════════════ ตัวแปลงแถวการจอง → BookingMoneyIn (ย้ายจาก costs.ts · D4 · ที่เดียวของ payable/VAT/รอคืนเงินของ snapshot) ═══════════════
/** แถวจากตัวอ่านการจองร่วม (costs.ts) — JSON path ของ snapshot เท่านั้น (ไม่ดึงทั้งก้อน · D3) */
export type BookingMoneyRow = {
  status: string;
  collectMode: string;
  agentAccountId: string | null;
  channel: string;
  currency: string;
  grossSatang: number;
  discountSatang: number;
  agentDiscountSatang: number;
  passThroughSatang: number;
  vatSatang: number;
  commissionSatang: number;
  commissionVatSatang: number;
  paidSatang: number;
  refundedSatang: number;
  payableJson: unknown;
  vatRegJson: unknown;
  inclVatJson: unknown;
  seats: number;
  retAmount: number;
  retVat: number;
  retPt: number;
  retN: number;
  openRefund: boolean;
};
/**
 * Q7: payable ของ snapshot ใช้ได้เมื่อเป็นจำนวนเต็มปลอดภัย 0..int4 · ไม่งั้น gross − ส่วนลด (+ VAT เมื่อราคาไม่รวม VAT · Q8)
 * Q10: snapshot ไม่บอกสถานะ VAT ⇒ สถานะของหน่วย (ไม่ถือว่าจด VAT เอง) · Q12: รอบยกเลิก — รอคืนเงินเฉพาะที่มีเงินรับไว้
 */
export function bookingMoneyInOfRow(b: BookingMoneyRow, u: { unitVatRegistered: boolean | null; departureCancelled: boolean }): { input: BookingMoneyIn; hasPayable: boolean; vatRegistered: boolean } {
  const hasPayable = typeof b.payableJson === "number" && Number.isSafeInteger(b.payableJson) && b.payableJson >= 0 && b.payableJson <= INT4_MAX;
  const payable = hasPayable ? Number(b.payableJson) : b.grossSatang - b.discountSatang - b.agentDiscountSatang + (b.inclVatJson === false ? b.vatSatang : 0);
  const vatRegistered = typeof b.vatRegJson === "boolean" ? b.vatRegJson : u.unitVatRegistered === true;
  const input: BookingMoneyIn = {
    status: b.status,
    collectMode: b.collectMode,
    agentAccountId: b.agentAccountId,
    channel: b.channel,
    seats: b.seats,
    payableSatang: payable,
    passThroughSatang: b.passThroughSatang,
    vatSatang: b.vatSatang,
    commissionSatang: b.commissionSatang,
    commissionVatSatang: b.commissionVatSatang,
    vatRegistered,
    paidSatang: b.paidSatang,
    refundedSatang: b.refundedSatang,
    pendingRefund: b.openRefund || (u.departureCancelled && LIVE_SET.includes(b.status) && b.paidSatang - b.refundedSatang > 0),
    departureCancelled: u.departureCancelled,
    retained: b.retN > 0 ? [{ amountSatang: b.retAmount, vatSatang: b.retVat, passThroughSatang: b.retPt }] : [],
  };
  return { input, hasPayable, vatRegistered };
}

// ═══════════════ ค่าคงที่ของรายงานตามช่วง (§3.1) ═══════════════
export const REPORT_TABS = ["sales", "load", "lead", "channel"] as const;
export type ReportTab = (typeof REPORT_TABS)[number];
export const REPORT_GROUPS = ["day", "week", "month"] as const;
export type ReportGroup = (typeof REPORT_GROUPS)[number];
export const REPORT_BASES = ["travel", "booked"] as const;
export type ReportBasis = (typeof REPORT_BASES)[number];
/** ชื่อใน URL (product → productId) */
export const REPORT_QUERY_PARAMS = ["from", "to", "basis", "product", "channel", "tab", "group", "page"] as const;
export const REPORT_RANGE_MAX_DAYS = 366;
export const REPORT_DAY_GROUP_MAX_DAYS = 62;
export const REPORT_PAGE_SIZE = 50;
export const REPORT_PAGE_MAX = 200;
export const REPORT_PRODUCTS_MAX = 200;
/** D3: เกินเพดาน ⇒ REPORT_TOO_LARGE (ไม่ตัดเงียบ) */
export const REPORT_DEPARTURE_CAP = 4_000;
export const REPORT_BOOKING_CAP = 40_000;
export const TRIPS_REPORT_CSV_CAP = 2_000;
/** ต่อคนต่อหน่วย (D5) */
export const REPORT_EXPORT_RATE = { limit: 20, windowMs: 3_600_000 } as const;
export const LEAD_BUCKETS = [
  { key: "D0", min: 0, max: 0 },
  { key: "D1_2", min: 1, max: 2 },
  { key: "D3_7", min: 3, max: 7 },
  { key: "D8_14", min: 8, max: 14 },
  { key: "D15_30", min: 15, max: 30 },
  { key: "D31_60", min: 31, max: 60 },
  { key: "D61P", min: 61, max: null },
] as const;
export type LeadBucketKey = (typeof LEAD_BUCKETS)[number]["key"];
/** 19 คอลัมน์คงที่ทุกไฟล์ (มี vat เสมอ · D2) */
export const REPORT_CSV_COLUMNS = [
  "date", "time", "product", "option", "state", "capacity", "sold", "loadFactorPct", "bookings", "cancelledBookings", "pendingRefundBookings",
  "sales", "passThrough", "vat", "revenueExVat", "collected", "outstanding", "held", "agentCollectBookings",
] as const;
/** ต่อท้ายเมื่อเห็นต้นทุนเท่านั้น */
export const REPORT_CSV_COST_COLUMNS = ["commission", "cost", "grossProfit", "marginPct"] as const;

// ═══════════════ ตัวกรองจาก URL · ช่วงวัน ═══════════════
export type ReportQuery = { from?: string; to?: string; basis?: string; productId?: string; channel?: string; tab?: string; group?: string; page?: number };
/** อ่านเฉพาะ REPORT_QUERY_PARAMS · อาร์เรย์ใช้ตัวแรก · ว่าง ⇒ ไม่ใส่ · page /^\d{1,4}$/ ⇒ จำนวนเต็ม · ค่าอื่นส่งต่อตามจริง (ตัวโหลดตรวจ) */
export function reportQueryOf(sp: Record<string, string | string[] | undefined>): ReportQuery {
  const out: ReportQuery = {};
  for (const k of REPORT_QUERY_PARAMS) {
    const raw = sp[k];
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v !== "string" || v.length === 0) continue;
    if (k === "page") {
      if (/^\d{1,4}$/.test(v)) out.page = Number(v);
    } else if (k === "product") out.productId = v;
    else out[k] = v;
  }
  return out;
}
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const isRealYmd = (s: unknown): s is string => typeof s === "string" && YMD_RE.test(s) && addDaysYmd(s, 0) === s;
const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000);
const monthStart = (ymd: string): string => `${ymd.slice(0, 7)}-01`;
const monthEnd = (ymd: string): string => {
  const [y, m] = ymd.split("-").map(Number);
  return addDaysYmd(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`, -1);
};
/** ว่าง ⇒ เดือนของวันนี้ · from อย่างเดียว ⇒ ถึงสิ้นเดือน · to อย่างเดียว ⇒ จากต้นเดือน · รูปผิด/วันไม่มีจริง/กลับด้าน ⇒ INVALID_INPUT · รวมปลาย > 366 ⇒ RANGE_TOO_LARGE */
export function reportRangeOf(i: { from?: string | null; to?: string | null }, today: string): { ok: true; from: string; to: string; days: number } | { ok: false; code: "INVALID_INPUT" | "RANGE_TOO_LARGE" } {
  const f = i.from === undefined || i.from === null || i.from === "" ? null : i.from;
  const t = i.to === undefined || i.to === null || i.to === "" ? null : i.to;
  // K3: ปี 2000–2100 เท่านั้น (ตรวจก่อนบวกวัน — ปลายปี 9999 บวกวันแล้วล้นจนโยน error)
  const yearOk = (x: string) => Number(x.slice(0, 4)) >= 2000 && Number(x.slice(0, 4)) <= 2100;
  if ((f !== null && (!isRealYmd(f) || !yearOk(f))) || (t !== null && (!isRealYmd(t) || !yearOk(t)))) return { ok: false, code: "INVALID_INPUT" };
  const from = f ?? (t !== null ? monthStart(t) : monthStart(today));
  const to = t ?? (f !== null ? monthEnd(f) : monthEnd(today));
  if (from > to) return { ok: false, code: "INVALID_INPUT" };
  const days = daysBetween(from, to) + 1;
  if (days > REPORT_RANGE_MAX_DAYS) return { ok: false, code: "RANGE_TOO_LARGE" };
  return { ok: true, from, to, days };
}
export function reportGroupOf(days: number): ReportGroup {
  return days <= 31 ? "day" : days <= 92 ? "week" : "month";
}
/** N10: ขอบ UTC ของช่วงวันตามเวลาร้าน คิดในโค้ด (ห้าม AT TIME ZONE ใน WHERE) · [gte, lt) */
export function reportUtcBoundsOf(from: string, to: string, tz: string): { gte: Date; lt: Date } {
  return { gte: localToUtc(tz, from, 0), lt: localToUtc(tz, addDaysYmd(to, 1), 0) };
}
export function reportPresetsOf(today: string): { key: "thisMonth" | "lastMonth" | "last30" | "next30"; from: string; to: string }[] {
  const lastEnd = addDaysYmd(monthStart(today), -1);
  return [
    { key: "thisMonth", from: monthStart(today), to: monthEnd(today) },
    { key: "lastMonth", from: monthStart(lastEnd), to: lastEnd },
    { key: "last30", from: addDaysYmd(today, -29), to: today },
    { key: "next30", from: today, to: addDaysYmd(today, 29) },
  ];
}
/** day = วันนั้น · week = วันจันทร์ ISO · month = YYYY-MM */
export function periodKeyOf(ymd: string, group: ReportGroup): string {
  if (group === "day") return ymd;
  if (group === "month") return ymd.slice(0, 7);
  return addDaysYmd(ymd, -((weekdayOfYmd(ymd) + 6) % 7));
}
/** ช่วงย่อยต่อเนื่องครบ ตัดหัวท้ายให้อยู่ใน [from, to] */
export function periodsOf(from: string, to: string, group: ReportGroup): { key: string; from: string; to: string }[] {
  const out: { key: string; from: string; to: string }[] = [];
  let cur = from;
  while (cur <= to) {
    const end = group === "day" ? cur : group === "week" ? addDaysYmd(periodKeyOf(cur, "week"), 6) : monthEnd(cur);
    const pe = end < to ? end : to;
    out.push({ key: periodKeyOf(cur, group), from: cur, to: pe });
    cur = addDaysYmd(pe, 1);
  }
  return out;
}
/** วันปฏิทินจากวันจอง (เขตเวลาหน่วย) ถึงวันเดินทาง — ติดลบได้ */
export function leadDaysOf(createdAt: Date, travelDate: string, tz: string): number {
  return daysBetween(utcToLocal(tz, createdAt).ymd, travelDate);
}
export function leadBucketOf(days: number): LeadBucketKey | null {
  if (days < 0) return null;
  for (const b of LEAD_BUCKETS) if (days >= b.min && (b.max === null || days <= b.max)) return b.key;
  return null;
}
/** ค่ากลางล่าง xs[floor((n − 1) / 2)] หลังเรียง (ไม่แก้อินพุต) · ว่าง ⇒ null */
export function medianOf(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)] ?? null;
}

// ═══════════════ CSV ข้อมูลล้วน (D2) ═══════════════
const plain2 = (n: number): string => {
  const v = Math.trunc(n);
  const abs = Math.abs(v);
  return `${v < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
};
/** สตางค์ ⇒ "-1200.00" (ไม่มีตัวคั่น ไม่มี ') */
export function bahtPlain(satang: number): string {
  return plain2(satang);
}
/** bp ⇒ "62.50" · null ⇒ "" */
export function pctPlain(bp: number | null): string {
  return bp === null || !Number.isFinite(bp) ? "" : plain2(bp);
}
export type ReportCell = string | number | { satang: number } | { bp: number | null } | null;
const cellOf = (c: ReportCell): string => {
  if (c === null) return "";
  if (typeof c === "string") return csvCell(c);
  if (typeof c === "number") return Number.isSafeInteger(c) ? String(c) : "";
  return "satang" in c ? bahtPlain(c.satang) : pctPlain(c.bp);
};
/** BOM + หัว + แถวข้อมูลเท่านั้น (ไม่มีบรรทัดข้อความ) · CRLF · สตริงผ่าน csvCell (กันสูตร) · แถวปรับให้เท่าหัว */
export function reportCsv(header: readonly string[], rows: readonly (readonly ReportCell[])[]): string {
  const w = header.length;
  const line = (cells: readonly ReportCell[]) => Array.from({ length: w }, (_, i) => cellOf(cells[i] ?? null)).join(",");
  return `﻿${[line(header), ...rows.map(line)].map((l) => `${l}\r\n`).join("")}`;
}
/** trips-report-<from>-<to>[-partial].csv · วันไม่จริง ⇒ trips-report[-partial].csv (ASCII · C19) */
export function reportFileName(from: string, to: string, partial?: boolean): string {
  const tail = partial ? "-partial" : "";
  return isRealYmd(from) && isRealYmd(to) ? `trips-report-${from}-${to}${tail}.csv` : `trips-report${tail}.csv`;
}
// ── /T1.7a2 report-core ──
