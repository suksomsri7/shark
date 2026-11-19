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
  /** snapshot.tax.vatRegistered (ไม่มี ⇒ true) */
  vatRegistered: boolean;
  paidSatang: number;
  refundedSatang: number;
  /** มีคำขอคืนเงินเปิด ∨ (รอบยกเลิก ∧ สถานะยังนับ) */
  pendingRefund: boolean;
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
export type ParsedCostRows = { ok: true; rows: CostRowIn[] } | { ok: false; code: ParseCode };
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const KIND_SET: readonly string[] = TRIP_COST_KINDS;
const CTL_RE = /[\u0000-\u001f\u007f]/;
const ROW_KEYS = new Set(["id", "kind", "amountSatang", "note"]);
const FORM_KEYS = new Set(["id", "kind", "amountText", "note"]);

/** id / kind / note ของแถว (ร่วมกันสองรูปแบบ) — ผิด ⇒ null */
function rowBase(r: Record<string, unknown>): { id: string | null; kind: TripCostKind; note: string | null } | null {
  const id = r.id;
  if (id !== undefined && (typeof id !== "string" || id.length < 1 || id.length > 100 || CTL_RE.test(id))) return null;
  if (typeof r.kind !== "string" || !KIND_SET.includes(r.kind)) return null;
  const note = r.note;
  if (note !== undefined && note !== null && typeof note !== "string") return null;
  let n: string | null = null;
  if (typeof note === "string") {
    if (CTL_RE.test(note)) return null;
    const t = note.trim();
    if (t.length > TRIP_COST_NOTE_MAX) return null;
    n = t.length ? t : null;
  }
  return { id: typeof id === "string" ? id : null, kind: r.kind as TripCostKind, note: n };
}

/** ชุดต้นทุนทั้งรอบ (ลำดับตัดสินตามใบสั่ง §3.1) */
export function parseCostRows(raw: unknown): ParsedCostRows {
  if (!Array.isArray(raw)) return { ok: false, code: "INVALID_INPUT" };
  if (raw.length > TRIP_COST_ROWS_MAX) return { ok: false, code: "COST_ROWS_LIMIT" };
  const rows: CostRowIn[] = [];
  let amountBad = false;
  for (const r of raw) {
    if (!isRec(r) || Object.keys(r).some((k) => !ROW_KEYS.has(k))) return { ok: false, code: "INVALID_INPUT" };
    const base = rowBase(r);
    if (!base) return { ok: false, code: "INVALID_INPUT" };
    const a = r.amountSatang;
    if (typeof a !== "number" || !Number.isSafeInteger(a)) return { ok: false, code: "INVALID_INPUT" };
    if (a < 1 || a > TRIP_COST_AMOUNT_MAX) amountBad = true;
    rows.push({ id: base.id, kind: base.kind, amountSatang: a, note: base.note });
  }
  const ids = rows.map((r) => r.id).filter((x): x is string => x !== null);
  if (new Set(ids).size !== ids.length) return { ok: false, code: "INVALID_INPUT" };
  if (amountBad) return { ok: false, code: "COST_AMOUNT_INVALID" };
  let total = 0;
  for (const r of rows) total += r.amountSatang;
  if (total > INT4_MAX) return { ok: false, code: "COST_AMOUNT_INVALID" };
  return { ok: true, rows };
}

/** ฟอร์มของจอ (ยอดเป็นข้อความบาท · N11) → parseCostRows */
export function costRowsFromForm(raw: unknown): ParsedCostRows | { ok: false; code: "COST_AMOUNT_FORMAT" } {
  if (!Array.isArray(raw)) return { ok: false, code: "INVALID_INPUT" };
  if (raw.length > TRIP_COST_ROWS_MAX) return { ok: false, code: "COST_ROWS_LIMIT" };
  const out: Record<string, unknown>[] = [];
  let problem: "COST_AMOUNT_FORMAT" | "COST_AMOUNT_INVALID" | null = null;
  for (const r of raw) {
    if (!isRec(r) || Object.keys(r).some((k) => !FORM_KEYS.has(k)) || typeof r.amountText !== "string") return { ok: false, code: "INVALID_INPUT" };
    const text = r.amountText;
    const satang = parseAmountSatang(text);
    if (satang === null) {
      const why = amountProblemOf(text);
      if (why === "format") problem = "COST_AMOUNT_FORMAT";
      else if (problem === null) problem = "COST_AMOUNT_INVALID";
      continue;
    }
    if (satang > TRIP_COST_AMOUNT_MAX && problem === null) problem = "COST_AMOUNT_INVALID";
    const row: Record<string, unknown> = { kind: r.kind, amountSatang: satang };
    if (r.id !== undefined) row.id = r.id;
    if (r.note !== undefined) row.note = r.note;
    out.push(row);
  }
  if (problem !== null) {
    // แถวอื่นผิดรูปด้วย ⇒ บอกเรื่องรูปแบบแถวก่อน (ไม่ให้ผู้ใช้แก้ยอดแล้วเจอข้อผิดพลาดใหม่)
    const shape = parseCostRows(out.map((x) => ({ ...x, amountSatang: 1 })));
    return shape.ok ? { ok: false, code: problem } : shape;
  }
  return parseCostRows(out);
}

/** คีย์เนื้อหาของชุดต้นทุน — ไม่ขึ้นกับลำดับแถว · นับซ้ำ · null ≡ ไม่มีหมายเหตุ */
export function costContentKey(rows: readonly { kind: string; amountSatang: number; note?: string | null }[]): string {
  return JSON.stringify(rows.map((r) => JSON.stringify([r.kind, r.amountSatang, r.note ?? null])).sort());
}
// ── /T1.7a1 report-core ──
