// ─────────────────────────────────────────────────────────────
// trips/snapshot.ts — «TripsBookingSnapshot v1» : สร้าง + อ่าน + คำนวณย้อนหลัง (RUN TRIPS T0.5)
// ใบสั่ง ledger/trips-briefs/T0.5.md §7 (มติ §12 ข้อ snapshot เพิ่ม) · สัญญา CC §F.2 :616–:667 · §H.2 (ภาพ 15) · §H.3 (คอมฯ บางส่วน :639)
//
// 🔴 บริสุทธิ์: ไม่ import ค่าตั้ง (value) · prisma · db · ./pricing ./prices ./promo — อ่าน snapshot อย่างเดียว (CC :666)
// 🔴 คีย์ที่ไม่ได้จด ⇒ throw SnapshotKeyMissing (ไม่ตกไปอ่านค่าตั้งสด) · recompute* ไม่แก้อินพุต
// 🔴 ไม่มีไฟล์ของใบนี้เขียน policySnapshot ลง TripBooking (T0.6 เท่านั้น)
// ─────────────────────────────────────────────────────────────
import type { PolicySnapshot } from "@/lib/core/settings";
import { BP_UNIT, allocateWithin, mulBpHalfUp, mulDivHalfUp, vatOfExclusive, vatOfInclusive } from "./money-math";

// ═══════════════ ชนิด (เลี่ยง import จาก pricing-core — ข้อสอบ S-3 จำกัด import ของไฟล์นี้) ═══════════════
type Step = "RETAIL" | "SEASON" | "DEPARTURE" | "RULE" | "TIER" | "CONTRACT" | "PROMO" | "MANUAL";
type TraceEntry = { step: Step; refId?: string; amountMinor: number; note?: string };
type TaxKind = "VAT7" | "EXEMPT" | "NONE";
type ItemIn = {
  itemRef: string;
  kind: string;
  label: string;
  paxTypeCode: string | null;
  qty: number;
  unitMinor: number;
  grossMinor: number;
  discountSatang: number;
  agentDiscountSatang: number;
  amountMinor: number;
  amountSatang: number;
  vatSatang: number;
  commissionBp: number;
  commissionable: boolean;
  discountable: boolean;
  passThrough: boolean;
  taxKind: TaxKind;
  priceSource: Step;
  priceTrace: TraceEntry[];
  usesCapacity: boolean;
  commissionSeatQty: number;
};
type CommissionIn = {
  agentAccountId: string;
  agentTierId: string | null;
  mode: "COMMISSION_PCT" | "COMMISSION_FIXED" | "NET" | "MARKUP";
  rateSource: "TIER" | "CONTRACT";
  baseSatang: number;
  rateBp: number | null;
  fixedSatang: number | null;
  commissionSatang: number;
  collectMode: "SHOP_COLLECTS" | "AGENT_COLLECTS";
  sellerOfRecord: "SHOP_PRINCIPAL" | "AGENT_RESELLS";
  vatMode: "NONE" | "EXCLUSIVE" | "INCLUSIVE";
  vatRateBp: number;
  agencyVatRegistered: boolean;
  commissionVatSatang: number;
  earnedAt: "AFTER_TRAVEL" | "ON_CONFIRM";
  clawbackRule: string;
  wht: {
    applies: boolean;
    payerType: string;
    payeeType: string;
    mode: "RATE" | "PROGRESSIVE_50_1" | "NONE_FOREIGN" | "NONE";
    rateBp: number | null;
    eWht: boolean;
    whtSatang: number | null;
    grossUp: boolean;
    remitter: "SHOP" | "AGENT_ON_BEHALF" | "NONE";
    minPerContractSatang: number;
    continuous: string;
  };
  agentDiscountSatang: number;
  agentActualSaleSatang: number | null;
  paidSeats: number;
  collectedBy: "AGENT" | "SHOP";
  collectFromCustomerSatang: number;
  shopCollectsSatang: number;
  remitToShopSatang: number;
  payToAgentSatang: number;
  agentEarnsSatang: number;
};
type Step2 = { daysBefore: number; refundBp: number };
type PricedIn = {
  currency: string;
  fx: null | { rateMicros: number; source: "SETTING"; effectiveFrom: string };
  items: ItemIn[];
  totals: { grossSatang: number; discountSatang: number; agentDiscountSatang: number; passThroughSatang: number; vatableSatang: number; vatBaseSatang: number; vatSatang: number; payableSatang: number };
  commission: CommissionIn | null;
  paymentSchedule: { seq: number; kind: string; amountSatang: number; amountMinor?: number; vatableSatang: number; passThroughSatang: number; dueAt: string }[];
  cancelLadder: Step2[];
  cancelMinimumLadder: Step2[] | null;
  shopCancelRefundBpByReason: { EXTERNAL: number; MIN_NOT_MET: number; SHOP_FAULT: number };
  warnings: { code: string }[];
};
type InputIn = {
  now: string;
  tz: string;
  unitId: string;
  product: { id: string };
  departure: { id: string; localDate: string; startsAt: string; deckPlanVersionId: string | null };
  agency: { agentAccountId: string; agentTierId: string | null } | null;
};

export type TripsBookingSnapshot = {
  v: 1;
  productKind: "TRIP";
  at: string;
  refs: { unitId: string; productId: string; slotId: string; agentId?: string; agentTierId?: string };
  policy: { trips: PolicySnapshot; agency?: PolicySnapshot };
  currency: string;
  fx: PricedIn["fx"];
  travel: { localDate: string; startsAt: string; tz: string };
  lines: (Omit<ItemIn, "paxTypeCode"> & { paxTypeCode?: string })[];
  totals: PricedIn["totals"];
  commission: CommissionIn | null;
  cancelLadder: Step2[];
  cancelMinimumLadder: Step2[] | null;
  shopCancelRefundBpByReason: { EXTERNAL: number; MIN_NOT_MET: number; SHOP_FAULT: number };
  refundCredit: null;
  refundForm: unknown;
  nameChangeFree: unknown;
  changeDateFee: unknown;
  paymentSchedule: PricedIn["paymentSchedule"];
  tax: { vatRegistered: boolean; pricesIncludeVat: boolean; invoiceOnEachPayment: boolean; cancelFeeVat: boolean; vatRateBp: number };
  deckPlanVersionId: string | null;
  flags: { marketingEligible: boolean; messageMode: string; contactRoute: string; hidePriceOnVoucher: boolean };
  warnings: string[];
};
export type SnapshotFlags = Partial<TripsBookingSnapshot["flags"]>;

/** คีย์ค่าตั้งไม่ได้จดใน snapshot — ห้ามตกไปอ่านค่าตั้งสด */
export class SnapshotKeyMissing extends Error {
  readonly code = "SNAPSHOT_KEY_MISSING";
  readonly key: string;
  constructor(key: string) {
    super(`ไม่พบค่าตั้ง ${key} ใน snapshot ของการจอง`);
    this.name = "SNAPSHOT_KEY_MISSING";
    this.key = key;
  }
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);

/** อ่านค่าตั้งที่จดไว้ (โดเมน trips/agency) — ไม่มี ⇒ throw SnapshotKeyMissing */
export function snapshotValue(snap: unknown, domain: string, key: string): unknown {
  const pol = isRec(snap) && isRec(snap.policy) ? snap.policy[domain] : undefined;
  const values = isRec(pol) && isRec(pol.values) ? pol.values : null;
  if (!values || !Object.prototype.hasOwnProperty.call(values, key)) throw new SnapshotKeyMissing(key);
  return values[key];
}

/** ประกอบ snapshot (CC §F.2 ตรงตัว + ช่องเพิ่ม §7) — JSON ล้วน */
export function toTripsSnapshot(args: { input: InputIn; priced: PricedIn; policy: { trips: PolicySnapshot; agency?: PolicySnapshot | null }; flags?: SnapshotFlags }): TripsBookingSnapshot {
  const { input, priced, policy } = args;
  const tv = (k: string): unknown => snapshotValue({ policy: { trips: policy.trips } }, "trips", k);
  const vatReg = tv("trips.tax.vatRegistered");
  const vatRate = tv("trips.tax.vatRate");
  const registered = isRec(vatReg) ? vatReg.registered : null;
  const refs: TripsBookingSnapshot["refs"] = { unitId: input.unitId, productId: input.product.id, slotId: input.departure.id };
  if (input.agency) {
    refs.agentId = input.agency.agentAccountId;
    if (input.agency.agentTierId) refs.agentTierId = input.agency.agentTierId;
  }
  const snap: TripsBookingSnapshot = {
    v: 1,
    productKind: "TRIP",
    at: input.now,
    refs,
    policy: policy.agency ? { trips: policy.trips, agency: policy.agency } : { trips: policy.trips },
    currency: priced.currency,
    fx: priced.fx,
    travel: { localDate: input.departure.localDate, startsAt: input.departure.startsAt, tz: input.tz },
    lines: priced.items.map((i) => {
      const { paxTypeCode, ...rest } = i;
      return paxTypeCode ? { ...rest, paxTypeCode } : rest;
    }),
    totals: priced.totals,
    commission: priced.commission,
    cancelLadder: priced.cancelLadder,
    cancelMinimumLadder: priced.cancelMinimumLadder,
    shopCancelRefundBpByReason: priced.shopCancelRefundBpByReason,
    refundCredit: null,
    refundForm: tv("trips.cancel.refundForm") ?? null,
    nameChangeFree: tv("trips.cancel.nameChangeFree") ?? null,
    changeDateFee: tv("trips.cancel.changeDateFee") ?? null,
    paymentSchedule: priced.paymentSchedule,
    tax: {
      vatRegistered: registered !== false,
      pricesIncludeVat: tv("trips.tax.priceIncludesVat") !== false,
      invoiceOnEachPayment: tv("trips.tax.invoiceOnEachPayment") !== false,
      cancelFeeVat: tv("trips.tax.cancelFeeVat") === "SERVICE_WITH_VAT",
      vatRateBp: isRec(vatRate) && typeof vatRate.rateBp === "number" ? vatRate.rateBp : Number.NaN,
    },
    deckPlanVersionId: input.departure.deckPlanVersionId,
    flags: { marketingEligible: false, messageMode: "SHOP", contactRoute: "SHOP", hidePriceOnVoucher: false, ...(args.flags ?? {}) },
    warnings: priced.warnings.map((w) => w.code),
  };
  if (!Number.isInteger(snap.tax.vatRateBp)) throw new SnapshotKeyMissing("trips.tax.vatRate");
  return json(snap);
}

// ═══════════════ คำนวณย้อนหลังจาก snapshot อย่างเดียว ═══════════════
export type RecomputeEvent =
  | { kind: "TOTALS" }
  | { kind: "SCHEDULE" }
  | { kind: "CANCEL"; at: string; reasonKind: "CUSTOMER" | "EXTERNAL" | "MIN_NOT_MET" | "SHOP_FAULT"; paidSatang?: number; deductionsSatang?: number }
  | { kind: "COMMISSION"; remainingQtyByItemRef?: Record<string, number> };
export type CancelLine = { itemRef: string; paidSatang: number; refundSatang: number; keptSatang: number; rule: "BP" | "FULL" };
export type CancelComputed = {
  daysBefore: number;
  step: Step2 | null;
  refundBp: number;
  paidSatang: number;
  refundSatang: number;
  keptSatang: number;
  refundPassThroughSatang: number;
  refundVatSatang: number;
  keptVatSatang: number;
  lines: CancelLine[];
};
export type CommissionComputed = {
  baseSatang: number;
  commissionSatang: number;
  commissionVatSatang: number;
  whtSatang: number | null;
  remitToShopSatang: number;
  clawbackSatang: number;
  /** ร้านจ่ายเอเจนซี่ (SHOP_COLLECTS) · 0 เมื่อเอเจนซี่เก็บเงิน */
  payToAgentSatang: number;
};
type Fail = { ok: false; code: "VALIDATION"; messageTh: string; retryable: false; details: Record<string, unknown> };
export type RecomputeResult =
  | { ok: true; value: { totals: TripsBookingSnapshot["totals"] } | { paymentSchedule: TripsBookingSnapshot["paymentSchedule"] } | CancelComputed | CommissionComputed }
  | Fail;
const bad = (msg: string, details: Record<string, unknown> = {}): Fail => ({ ok: false, code: "VALIDATION", messageTh: msg, retryable: false, details });
const INT4 = 2_147_483_647;
const intOk = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= INT4;
const badInput = (field: string) => bad("ข้อมูลยังไม่ครบหรือรูปแบบยังไม่ตรง", { reason: "INVALID_INPUT", field });

// วันของร้านจากเวลา (Intl · สำเนาเล็ก — ไฟล์นี้ import ./pricing-core ไม่ได้)
const DAY_MS = 86_400_000;
const utcMid = (ymd: string): number => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
function localYmd(tz: string, at: Date): string | null {
  let f: Intl.DateTimeFormat;
  try {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return null; // เขตเวลาเพี้ยน = SETTINGS_INVALID (ไม่ตกไปกรุงเทพเงียบ ๆ)
  }
  const p = f.formatToParts(at);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

function readSnap(raw: unknown): TripsBookingSnapshot {
  return raw as TripsBookingSnapshot;
}

/** คำนวณจาก snapshot อย่างเดียว (บริสุทธิ์ · ไม่แก้อินพุต) — อัตรา VAT อ่านผ่าน snapshotValue เสมอ */
export function recomputeFromSnapshot(raw: unknown, event: RecomputeEvent): RecomputeResult {
  const rate = snapshotValue(raw, "trips", "trips.tax.vatRate");
  const vatRateBp = isRec(rate) && typeof rate.rateBp === "number" ? rate.rateBp : null;
  if (vatRateBp === null) throw new SnapshotKeyMissing("trips.tax.vatRate");
  const snap = readSnap(raw);
  if (!isRec(event)) return bad("ชนิดการคำนวณไม่ถูกต้อง");
  if (event.kind === "TOTALS") return { ok: true, value: { totals: json(snap.totals) } };
  if (event.kind === "SCHEDULE") return { ok: true, value: { paymentSchedule: json(snap.paymentSchedule) } };
  if (event.kind === "CANCEL") return cancelOf(snap, event, vatRateBp);
  if (event.kind === "COMMISSION") return commissionOf(snap, event);
  return bad("ชนิดการคำนวณไม่ถูกต้อง");
}

function cancelOf(snap: TripsBookingSnapshot, ev: Extract<RecomputeEvent, { kind: "CANCEL" }>, vatRateBp: number): RecomputeResult {
  const atMs = typeof ev.at === "string" ? Date.parse(ev.at) : Number.NaN;
  if (Number.isNaN(atMs)) return badInput("at");
  if (ev.paidSatang !== undefined && !intOk(ev.paidSatang)) return badInput("paidSatang");
  if (ev.deductionsSatang !== undefined && !intOk(ev.deductionsSatang)) return badInput("deductionsSatang");
  const atYmd = localYmd(snap.travel.tz, new Date(atMs));
  if (atYmd === null) return bad("ค่าตั้งของหน่วยไม่ถูกต้อง (เขตเวลา)", { reason: "SETTINGS_INVALID" });
  const daysBefore = (utcMid(snap.travel.localDate) - utcMid(atYmd)) / DAY_MS;
  let step: Step2 | null = null;
  let refundBp: number;
  if (ev.reasonKind === "CUSTOMER") {
    step = snap.cancelLadder.find((s) => daysBefore >= s.daysBefore) ?? null;
    refundBp = step ? step.refundBp : 0;
  } else {
    const r = snap.shopCancelRefundBpByReason[ev.reasonKind];
    if (typeof r !== "number") return bad("เหตุยกเลิกไม่ถูกต้อง", { reasonKind: ev.reasonKind });
    refundBp = r;
  }
  const excl = !snap.tax.pricesIncludeVat;
  const nonPt = snap.lines.filter((l) => !l.passThrough);
  const pt = snap.lines.filter((l) => l.passThrough);
  const lineDue = (l: (typeof snap.lines)[number]) => l.amountSatang + (excl && l.taxKind === "VAT7" ? l.vatSatang : 0);
  const nonPtDue = sum(nonPt.map(lineDue));
  const ptDue = sum(pt.map((l) => l.amountSatang));
  const paid = Math.max(0, Math.min(ev.paidSatang ?? snap.totals.payableSatang, nonPtDue + ptDue));
  // แยกส่วนที่จ่ายแล้วตามงวดที่จด (มติ r2 ข้อ 5): งวดเต็มตามลำดับ · งวดที่จ่ายไม่ครบ = ปันส่วนเก็บแทนตามสัดส่วนของงวดนั้น
  let left = paid;
  let paidPt = 0;
  for (const row of [...snap.paymentSchedule].sort((a, b) => a.seq - b.seq)) {
    if (left <= 0) break;
    if (left >= row.amountSatang) {
      paidPt += row.passThroughSatang;
      left -= row.amountSatang;
    } else {
      paidPt += row.amountSatang > 0 ? mulDivHalfUp(row.passThroughSatang, left, row.amountSatang) : 0;
      left = 0;
    }
  }
  paidPt = Math.min(paidPt, ptDue);
  const paidNonPt = Math.min(paid - paidPt, nonPtDue);
  paidPt = paid - paidNonPt;
  const nonPtPaid = allocateWithin(paidNonPt, nonPt.map(lineDue));
  const ptPaid = allocateWithin(paidPt, pt.map((l) => l.amountSatang));
  const rawRefund = nonPtPaid.map((p) => mulBpHalfUp(p, refundBp));
  const ded = allocateWithin(Math.max(0, ev.deductionsSatang ?? 0), rawRefund);
  const refundNonPt = rawRefund.map((r, i) => r - ded[i]);
  const lines: CancelLine[] = [
    ...nonPt.map((l, i) => ({ itemRef: l.itemRef, paidSatang: nonPtPaid[i], refundSatang: refundNonPt[i], keptSatang: nonPtPaid[i] - refundNonPt[i], rule: "BP" as const })),
    ...pt.map((l, i) => ({ itemRef: l.itemRef, paidSatang: ptPaid[i], refundSatang: ptPaid[i], keptSatang: 0, rule: "FULL" as const })),
  ];
  const refundSatang = sum(lines.map((l) => l.refundSatang));
  const vatIdx = nonPt.map((l, i) => (l.taxKind === "VAT7" ? i : -1)).filter((i) => i >= 0);
  const reg = snap.tax.vatRegistered;
  const refundVat = reg ? vatOfInclusive(sum(vatIdx.map((i) => refundNonPt[i])), vatRateBp) : 0;
  const paidVat = reg ? vatOfInclusive(sum(vatIdx.map((i) => nonPtPaid[i])), vatRateBp) : 0;
  return {
    ok: true,
    value: {
      daysBefore,
      step,
      refundBp,
      paidSatang: paid,
      refundSatang,
      keptSatang: paid - refundSatang,
      refundPassThroughSatang: sum(ptPaid),
      refundVatSatang: refundVat,
      keptVatSatang: paidVat - refundVat,
      lines,
    },
  };
}

function commissionOf(snap: TripsBookingSnapshot, ev: Extract<RecomputeEvent, { kind: "COMMISSION" }>): RecomputeResult {
  const c = snap.commission;
  if (!c) return { ok: true, value: { baseSatang: 0, commissionSatang: 0, commissionVatSatang: 0, whtSatang: null, remitToShopSatang: 0, clawbackSatang: 0, payToAgentSatang: 0 } };
  const rem = ev.remainingQtyByItemRef;
  if (rem !== undefined && (!isRec(rem) || Object.values(rem).some((q) => !intOk(q)))) return badInput("remainingQtyByItemRef");
  const remOf = (l: (typeof snap.lines)[number]) => {
    if (!rem || !Object.prototype.hasOwnProperty.call(rem, l.itemRef)) return l.qty;
    return Math.max(0, Math.min(l.qty, rem[l.itemRef]));
  };
  const scaled = (v: number, l: (typeof snap.lines)[number]) => (l.qty === 0 ? 0 : mulDivHalfUp(v, remOf(l), l.qty));
  const comm = snap.lines.filter((l) => l.commissionable && !l.passThrough);
  const base = sum(comm.map((l) => mulBpHalfUp(scaled(l.amountSatang + l.agentDiscountSatang, l), l.commissionBp)));
  const agentDisc = sum(snap.lines.map((l) => scaled(l.agentDiscountSatang, l)));
  // ที่นั่งที่จ่ายเงินตามที่จดต่อบรรทัด (ใช้ความจุ · ไม่ฟรี — มติ r2 ข้อ 4) ⇒ ไม่ยกเลิก = ค่าที่ quote ใช้ตรงตัว
  const paidSeats = sum(snap.lines.map((l) => Math.min(l.commissionSeatQty, remOf(l))));
  const gross = c.mode === "COMMISSION_PCT" ? (c.rateBp === null ? 0 : mulBpHalfUp(base, c.rateBp)) : c.mode === "COMMISSION_FIXED" ? (c.fixedSatang ?? 0) * paidSeats : 0;
  const gAfter = Math.max(0, gross - agentDisc);
  let C = gAfter;
  let Vc = 0;
  if (c.vatMode === "INCLUSIVE") {
    C = mulDivHalfUp(gAfter, BP_UNIT, BP_UNIT + c.vatRateBp);
    Vc = gAfter - C;
  } else if (c.vatMode === "EXCLUSIVE") Vc = vatOfExclusive(C, c.vatRateBp);
  const w = c.wht;
  let W: number | null = 0;
  if (w.applies && w.mode === "PROGRESSIVE_50_1") W = null;
  else if (w.applies && w.mode === "RATE" && w.rateBp !== null && (w.continuous === "EVERY_PAYMENT" || C >= w.minPerContractSatang)) W = mulBpHalfUp(C, w.rateBp);
  let payable = snap.totals.payableSatang;
  if (rem) {
    const lines = snap.lines.map((l) => ({ l, a: scaled(l.amountSatang, l) }));
    payable = sum(lines.map((x) => x.a));
    if (!snap.tax.pricesIncludeVat && snap.tax.vatRegistered) {
      const r = snapshotValue(snap, "trips", "trips.tax.vatRate");
      const bp = isRec(r) && typeof r.rateBp === "number" ? r.rateBp : snap.tax.vatRateBp;
      payable += vatOfExclusive(sum(lines.filter((x) => x.l.taxKind === "VAT7").map((x) => x.a)), bp);
    }
  }
  const agentCollects = c.collectMode === "AGENT_COLLECTS";
  const remit = agentCollects ? payable - C - Vc + (w.grossUp ? (W ?? 0) : 0) : 0;
  const payToAgent = agentCollects ? 0 : C + Vc - (W ?? 0);
  return {
    ok: true,
    value: { baseSatang: base, commissionSatang: C, commissionVatSatang: Vc, whtSatang: W, remitToShopSatang: remit, clawbackSatang: Math.max(0, c.commissionSatang - C), payToAgentSatang: payToAgent },
  };
}
