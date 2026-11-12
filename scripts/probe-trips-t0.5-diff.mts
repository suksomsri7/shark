// probe-trips-t0.5-diff.mts — hunter T0.5 (untracked): differential/property test of resolveTripPrice vs an independent BigInt reference
// written from ledger/trips-briefs/T0.5.md §3–§4 (not copied from the code). Pure — no DB writes.
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import { isDeepStrictEqual } from "node:util";

loadTripsQcEnv("probe-trips-t0.5-diff");
if (process.env.CI) { console.error("no CI"); process.exit(4); }

type Rec = Record<string, any>;
const core = (await import("../src/lib/modules/trips/pricing-core")) as Rec;
const resolveTripPrice = core.resolveTripPrice as (x: unknown) => Rec;
const snapM = (await import("../src/lib/modules/trips/snapshot")) as Rec;
const EXTRA_KEYS: Rec = { "trips.cancel.refundForm": "MONEY", "trips.cancel.nameChangeFree": true, "trips.cancel.changeDateFee": null, "trips.tax.invoiceOnEachPayment": true, "trips.tax.cancelFeeVat": "DAMAGES_NO_VAT_NO_WHT" };
const polSnap = (pol: Rec): Rec => ({ v: 1, domain: "trips", at: "2026-11-12T00:00:00.000Z", template: { key: "DIVE_SHOP", version: 1 }, values: { ...EXTRA_KEYS, ...pol }, sources: {} });
const deepFreeze = <T,>(v: T): T => { if (v && typeof v === "object") { for (const k of Object.keys(v as object)) deepFreeze((v as Rec)[k]); Object.freeze(v); } return v; };
const snapCnt = { built: 0, totals: 0, sched: 0, comm: 0, commRem: 0, cancel: 0, bad: 0 };

// ═══════ independent money (BigInt) ═══════
const Z = BigInt(0), ONE = BigInt(1), TWO = BigInt(2);
function hu(num: bigint, den: bigint): bigint {
  const neg = (num < Z) !== (den < Z);
  const a = num < Z ? -num : num, b = den < Z ? -den : den;
  const q = a / b, r = a % b;
  const up = r * TWO >= b ? q + ONE : q;
  return neg ? -up : up;
}
const md = (a: number, b: number, c: number) => Number(hu(BigInt(a) * BigInt(b), BigInt(c)));
const bp = (a: number, b: number) => md(a, b, 10000);
/** order §1: each line mulDivHalfUp(total, w, Σw) · last line (with weight) gets remainder */
function alloc(total: number, w: number[]): number[] {
  const S = w.reduce((s, x) => s + x, 0);
  const out = w.map(() => 0);
  if (!w.length) return out;
  if (S === 0) { out[w.length - 1] = total; return out; }
  let last = -1; w.forEach((x, i) => { if (x > 0) last = i; });
  let acc = 0;
  w.forEach((x, i) => { if (i !== last && x > 0) { out[i] = md(total, x, S); acc += out[i]; } });
  out[last] = total - acc;
  return out;
}
const ymdIn = (tz: string, d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const um = (y: string) => Date.UTC(+y.slice(0, 4), +y.slice(5, 7) - 1, +y.slice(8, 10));
const dBetween = (a: string, b: string) => Math.round((um(b) - um(a)) / 86400000);
const addD = (y: string, n: number) => new Date(um(y) + n * 86400000).toISOString().slice(0, 10);
const inR = (d: string, f: string | null, t: string | null) => (f === null || f <= d) && (t === null || d <= t);
const sc = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ═══════ reference resolver ═══════
type Out = { ok: true; items: Rec[]; totals: Rec; commission: Rec | null; schedule: Rec[]; promoTotal: number | null } | { ok: false; code: string; reason?: string };
export function ref(inp: Rec, opt: { childFromCommon?: boolean; contractReplacesTier?: boolean; fixedCountsAllSeats?: boolean } = {}): Out {
  const P = inp.policy;
  const thb = inp.currency === "THB";
  if ((!thb && inp.product.productType !== "LIVEABOARD") || !P["trips.general.currencies"].includes(inp.currency)) return { ok: false, code: "CURRENCY_NOT_ALLOWED" };
  let rate = 0;
  if (!thb) { const r = P["trips.fx.rates"].find((x: Rec) => x.currency === inp.currency); if (!r) return { ok: false, code: "VALIDATION", reason: "FX_RATE_MISSING" }; rate = r.rateMicros; }
  const toS = (m: number) => (thb ? m : md(m, rate, 1000000));
  if (inp.actor === "AGENT" && !inp.agency) return { ok: false, code: "FORBIDDEN", reason: "AGENCY_NOT_ENABLED" };
  const pts: Rec[] = inp.paxTypes;
  const q = new Map<string, number>();
  for (const p of inp.pax) { const t = pts.find((x) => x.id === p.paxTypeId); if (!t || !t.active) return { ok: false, code: "VALIDATION" }; q.set(t.id, (q.get(t.id) ?? 0) + p.qty); }
  const totalPax = [...q.values()].reduce((s, x) => s + x, 0);
  if (totalPax <= 0) return { ok: false, code: "VALIDATION" };
  const capPax = pts.filter((t) => t.countsCapacity).reduce((s, t) => s + (q.get(t.id) ?? 0), 0);
  const travel = inp.departure.localDate;
  const book = ymdIn(inp.tz, new Date(inp.now));
  const wd = new Date(um(travel)).getUTCDay();
  const optId = inp.departure.optionId;
  const rows = (inp.prices as Rec[]).filter((r) => r.currency === inp.currency && r.cabinTypeId === null && (r.optionId === null || r.optionId === optId)
    && (r.weekdayMask === null || ((r.weekdayMask >> wd) & 1) === 1) && inR(book, r.bookFrom, r.bookTo) && inR(travel, r.travelFrom, r.travelTo));
  const best = (rs: Rec[]) => [...rs].sort((a, b) => ((b.optionId !== null ? 1 : 0) - (a.optionId !== null ? 1 : 0)) || ((b.paxTypeId !== null ? 1 : 0) - (a.paxTypeId !== null ? 1 : 0)) || (b.priority - a.priority) || sc(a.id, b.id))[0] ?? null;
  const retail = rows.filter((r) => r.seasonId === null && r.departureId === null);
  const seasonsC = (inp.seasons as Rec[]).filter((s) => s.status === "ACTIVE" && s.dateStart <= travel && travel <= s.dateEnd).sort((a, b) => b.priority - a.priority || sc(a.id, b.id));
  const season = seasonsC.find((s) => rows.some((r) => r.seasonId === s.id && r.departureId === null));
  const seasonRows = season ? rows.filter((r) => r.seasonId === season.id && r.departureId === null) : [];
  const depRows = rows.filter((r) => r.departureId === inp.departure.id);
  const adult = pts.find((t) => t.code === "ADULT");
  const t28 = P["trips.pax.childPricePct"];
  const lvl = (rs: Rec[], t: Rec): number | null => {
    const ex = best(rs.filter((r) => r.paxTypeId === t.id)); if (ex) return ex.amountMinor;
    if (t.code === "CHILD" && t28 !== null && adult) {
      const a = best(rs.filter((r) => r.paxTypeId === adult.id || (opt.childFromCommon && r.paxTypeId === null)));
      if (a) return bp(a.amountMinor, t28 * 100);
    }
    const c = best(rs.filter((r) => r.paxTypeId === null)); return c ? c.amountMinor : null;
  };
  const seatTax = P["trips.tax.vatRate"].mode === "STANDARD" ? "VAT7" : "EXEMPT";
  const L: Rec[] = [];
  const seatTs = pts.filter((t) => (q.get(t.id) ?? 0) > 0).sort((a, b) => sc(a.code, b.code));
  for (const t of seatTs) {
    let u: number | null = null, src = "RETAIL";
    for (const [s, rs] of [["RETAIL", retail], ["SEASON", seasonRows], ["DEPARTURE", depRows]] as const) { const v = lvl(rs, t); if (v !== null) { u = v; src = s; } }
    if (u === null) return { ok: false, code: "VALIDATION", reason: "PRICE_MISSING" };
    L.push({ ref: `seat:${t.code}`, kind: "SEAT", code: t.code, qty: q.get(t.id), unit: u, disc: 0, adisc: 0, cbp: 10000, comm: true, dsc: true, pt: false, tax: seatTax, src, cap: t.countsCapacity, free: false, bo: false, xk: null });
  }
  const LD = P["trips.line.defaults"];
  const req = new Map<string, number>(); for (const r of inp.requestedExtras) req.set(r.extraId, (req.get(r.extraId) ?? 0) + r.qty);
  const days = inp.departure.days, nights = inp.departure.nights;
  for (const e of inp.extras as Rec[]) {
    const asked = req.get(e.id) ?? 0;
    if (!e.mandatory && asked <= 0) continue;
    const n = e.mandatory ? 1 : asked;
    const mult = e.basis === "PER_DAY" || e.basis === "PER_PAX_DAY" ? days : e.basis === "PER_BOAT_NIGHT" ? nights : 1;
    const base = { kind: "EXTRA", disc: 0, adisc: 0, comm: !e.passThrough && e.commissionable, dsc: !e.passThrough && e.discountable, pt: e.passThrough, tax: e.passThrough ? "NONE" : e.taxKind, src: "RETAIL", cap: false, free: false, bo: false, xk: e.kind };
    const cbp = base.comm ? LD[e.kind].commissionPct * 100 : 0;
    if (e.paxPrices) {
      for (const t of seatTs) { const pr = e.paxPrices[t.code]; if (pr === undefined) continue; const qty = (q.get(t.id) ?? 0) * mult; if (qty > 0) L.push({ ...base, ref: `extra:${e.id}:${t.code}`, code: t.code, qty, unit: pr, cbp }); }
    } else {
      const qty = (e.basis === "PER_PAX" || e.basis === "PER_PAX_DAY" ? totalPax : n) * mult;
      if (qty > 0) L.push({ ...base, ref: `extra:${e.id}`, code: null, qty, unit: e.priceMinor, cbp });
    }
  }
  if (inp.pickup && inp.pickup.surchargeSatang > 0) {
    const d = LD.TRANSFER; const pt = d.passThrough;
    L.push({ ref: `pickup:${inp.pickup.zoneId}`, kind: "PICKUP", code: null, qty: 1, unit: inp.pickup.surchargeSatang, disc: 0, adisc: 0, cbp: pt ? 0 : d.commissionPct * 100, comm: !pt && d.commissionPct > 0, dsc: !pt && d.discountable, pt, tax: pt ? "NONE" : seatTax, src: "RETAIL", cap: false, free: false, bo: false, xk: "TRANSFER" });
  }
  // step 4
  const rules = (inp.rules as Rec[]).filter((r) => r.params && r.params.kind === r.kind);
  const live = (r: Rec) => r.active && (r.productId === null || r.productId === inp.product.id) && inR(travel, r.dateFrom, r.dateTo) && inR(book, r.bookFrom, r.bookTo);
  const appl = (p: Rec, l: Rec) => { const a = p.appliesTo; if (!a) return true; if (a.optionIds && (optId === null || !a.optionIds.includes(optId))) return false; if (a.channels && !a.channels.includes(inp.channel)) return false; if (a.paxTypeCodes && l.kind === "SEAT" && !a.paxTypeCodes.includes(l.code)) return false; return true; };
  const lead = Date.parse(inp.departure.startsAt) - Date.parse(inp.now);
  const dAhead = dBetween(book, travel);
  const cut = (u: number, p: Rec) => (p.discountBp !== undefined ? u - bp(u, p.discountBp) : Math.max(0, u - p.discountMinor));
  for (const l of L) {
    if (l.pt) continue;
    const lv = rules.filter((r) => live(r) && appl(r.params, l));
    l.bo = lv.some((r) => r.kind === "BLACKOUT" && (r.params.dates.includes(travel) || r.params.ranges.some((g: Rec) => g.from <= travel && travel <= g.to)));
    if (l.bo || l.kind !== "SEAT") continue;
    const cands: { r: Rec; v: number }[] = [];
    for (const r of lv) {
      const p = r.params;
      if (p.kind === "EARLY_BIRD" && dAhead >= p.minDaysBefore) cands.push({ r, v: cut(l.unit, p) });
      if (p.kind === "LAST_MINUTE" && lead > 0 && lead <= p.maxHoursBefore * 3600000) cands.push({ r, v: cut(l.unit, p) });
      if (p.kind === "GROUP_TIER") { let tier: Rec | null = null; for (const t of p.tiers) if (capPax >= t.minPax && (!tier || t.minPax > tier.minPax)) tier = t; if (tier) cands.push({ r, v: l.unit - bp(l.unit, tier.discountBp) }); }
    }
    cands.sort((a, b) => a.v - b.v || b.r.priority - a.r.priority || sc(a.r.id, b.r.id));
    if (cands[0]) { l.unit = cands[0].v; l.src = "RULE"; }
  }
  for (const l of [...L]) {
    if (l.kind !== "SEAT" || l.bo) continue;
    let bestF: { r: Rec; f: number } | null = null;
    for (const r of rules.filter((r) => r.kind === "FREE_LEADER" && live(r) && r.params.paxTypeCode === l.code && appl(r.params, l)).sort((a, b) => b.priority - a.priority || sc(a.id, b.id))) {
      const f = Math.min(l.qty, Math.floor(l.qty / r.params.everyPaid) * r.params.freeQty);
      if (f > 0 && (!bestF || f > bestF.f)) bestF = { r, f };
    }
    if (bestF) { l.qty -= bestF.f; L.push({ ...l, ref: `${l.ref}:free`, qty: bestF.f, unit: 0, dsc: false, src: "RULE", free: true }); }
  }
  for (let i = L.length - 1; i >= 0; i--) if (L[i].qty <= 0) L.splice(i, 1);
  const ag = inp.agency;
  if (ag) for (const l of L) {
    if (l.kind !== "SEAT" || l.free) continue;
    const levels = opt.contractReplacesTier && ag.contract ? [["CONTRACT", ag.contract]] : [["TIER", ag.tier], ["CONTRACT", ag.contract]];
    for (const [s, lv] of levels) { const v = lv?.unitMinorByPaxCode?.[l.code]; if (lv && v !== undefined) { l.unit = v; l.src = s; } }
  }
  const kr: Rec = { SEAT: 0, EXTRA: 1, PICKUP: 2 };
  L.sort((a, b) => kr[a.kind] - kr[b.kind] || sc(a.ref, b.ref));
  // step 7
  let promoTotal: number | null = null;
  const rem = (l: Rec) => l.unit * l.qty - l.disc;
  const elig0 = (l: Rec) => l.dsc && !l.pt && !l.bo && !l.free;
  if (thb && inp.promoCode !== null && inp.promoCode.trim() !== "") {
    const code = inp.promoCode.trim().toUpperCase();
    const r = rules.filter((r) => r.kind === "PROMO_CODE" && r.active && r.params.code.trim().toUpperCase() === code && (r.productId === null || r.productId === inp.product.id)).sort((a, b) => b.priority - a.priority || sc(a.id, b.id))[0];
    if (r) {
      const p = r.params;
      const valid = !(p.validTo !== undefined && p.validTo < book) && !(p.validFrom !== undefined && p.validFrom > book) && !(p.maxUses !== undefined && r.usedCount >= p.maxUses) && inR(travel, r.dateFrom, r.dateTo) && inR(book, r.bookFrom, r.bookTo);
      const el = valid ? L.filter((l) => elig0(l) && appl(p, l) && rem(l) > 0) : [];
      if (el.length) {
        const am = p.discountBp !== undefined ? el.map((l) => bp(rem(l), p.discountBp)) : alloc(Math.min(p.discountMinor, el.reduce((s, l) => s + rem(l), 0)), el.map(rem));
        el.forEach((l, i) => { if (am[i] > 0) { l.disc += am[i]; l.src = "PROMO"; } });
        promoTotal = am.reduce((s, x) => s + x, 0);
      }
    }
  }
  if (thb) for (const pv of inp.promoProviders) {
    const el = L.filter((l) => elig0(l) && rem(l) > 0); if (!el.length || pv.discountSatang <= 0) continue;
    const am = alloc(Math.min(pv.discountSatang, el.reduce((s, l) => s + rem(l), 0)), el.map(rem));
    el.forEach((l, i) => { if (am[i] > 0) { l.disc += am[i]; l.src = "PROMO"; } });
  }
  // step 8
  if (inp.overrides.length) {
    if (inp.actor === "PUBLIC" || inp.actor === "AGENT" || !inp.overrideGrant.canOverride) return { ok: false, code: "FORBIDDEN" };
    for (const o of [...inp.overrides].sort((a: Rec, b: Rec) => sc(a.itemRef, b.itemRef))) {
      if (o.reason.trim().length < 10) return { ok: false, code: "VALIDATION", reason: "REASON_REQUIRED" };
      const l = L.find((x) => x.ref === o.itemRef); if (!l) return { ok: false, code: "VALIDATION" };
      if (l.pt) return { ok: false, code: "VALIDATION", reason: "PASS_THROUGH_LOCKED" };
      if (o.unitMinor < l.unit - bp(l.unit, P["trips.price.manualOverrideApprovalPct"] * 100) && !inp.overrideGrant.approvals.some((a: Rec) => a.itemRef === o.itemRef && a.unitMinor === o.unitMinor)) return { ok: false, code: "REQUIRES_APPROVAL" };
      l.unit = o.unitMinor; l.disc = 0; l.src = "MANUAL";
    }
  }
  const amtS = (l: Rec) => toS(l.unit * l.qty - l.disc - l.adisc);
  let comm: Rec | null = null;
  if (ag) {
    const lv = ag.contract ?? ag.tier;
    const mode = lv ? lv.mode : "COMMISSION_PCT";
    const cl = L.filter((l) => l.comm && !l.pt);
    const base = cl.reduce((s, l) => s + bp(amtS(l) + l.adisc, l.cbp), 0);
    const paid = L.filter((l) => l.kind === "SEAT" && !l.free && (opt.fixedCountsAllSeats || l.cap)).reduce((s, l) => s + l.qty, 0);
    const G = mode === "COMMISSION_PCT" ? (lv && lv.rateBp !== null ? bp(base, lv.rateBp) : 0) : mode === "COMMISSION_FIXED" ? (lv.fixedSatang ?? 0) * paid : 0;
    const ad = inp.agentDiscountSatang;
    if (ad > 0) {
      if (!thb || !ag.terms.discountFromCommission.enabled || ad > bp(G, ag.terms.discountFromCommission.capPct * 100)) return { ok: false, code: "DISCOUNT_OVER_CAP" };
      const el = cl.filter((l) => amtS(l) > 0); const a = alloc(ad, el.map(amtS)); el.forEach((l, i) => (l.adisc += a[i]));
    }
    const Ga = G - ad, vr = ag.terms.vatRateBp;
    let C = Ga, Vc = 0;
    if (ag.terms.vatMode === "INCLUSIVE") { C = md(Ga, 10000, 10000 + vr); Vc = Ga - C; } else if (ag.terms.vatMode === "EXCLUSIVE") Vc = bp(C, vr);
    const w = ag.terms.wht; let W: number | null = 0;
    if (w.applies && w.mode === "PROGRESSIVE_50_1") W = null; else if (w.applies && w.mode === "RATE" && w.rateBp !== null && (w.continuous === "EVERY_PAYMENT" || C >= w.minPerContractSatang)) W = bp(C, w.rateBp);
    comm = { base, C, Vc, W, grossUp: w.grossUp, Ci: Ga };
  }
  const items = L.map((l) => ({ itemRef: l.ref, qty: l.qty, unitMinor: l.unit, discountSatang: l.disc, agentDiscountSatang: l.adisc, amountSatang: amtS(l), vatSatang: 0, commissionBp: l.cbp, passThrough: l.pt, taxKind: l.tax, priceSource: l.src }));
  const reg = P["trips.tax.vatRegistered"].registered, incl = P["trips.tax.priceIncludesVat"], vbp = P["trips.tax.vatRate"].rateBp;
  const vl = items.filter((i) => i.taxKind === "VAT7");
  const vatable = vl.reduce((s, i) => s + i.amountSatang, 0);
  const vat = reg === false ? 0 : incl ? md(vatable, vbp, 10000 + vbp) : bp(vatable, vbp);
  alloc(vat, vl.map((i) => i.amountSatang)).forEach((v, k) => (vl[k].vatSatang = v));
  const sumA = items.reduce((s, i) => s + i.amountSatang, 0);
  const ptS = items.filter((i) => i.passThrough).reduce((s, i) => s + i.amountSatang, 0);
  const payable = sumA + (incl ? 0 : vat);
  const disc = items.reduce((s, i) => s + i.discountSatang, 0), adisc = items.reduce((s, i) => s + i.agentDiscountSatang, 0);
  const totals = { grossSatang: sumA + disc + adisc, discountSatang: disc, agentDiscountSatang: adisc, passThroughSatang: ptS, vatableSatang: vatable, vatBaseSatang: incl ? vatable - vat : vatable, vatSatang: vat, payableSatang: payable };
  let commission: Rec | null = null;
  if (comm) commission = { baseSatang: comm.base, commissionSatang: comm.C, commissionVatSatang: comm.Vc, whtSatang: comm.W, remitToShopSatang: payable - comm.C - comm.Vc + (comm.grossUp ? (comm.W ?? 0) : 0) };
  const dp = P["trips.pay.depositPct"], bd = P["trips.pay.balanceDueDaysBefore"];
  const due = bd === null ? null : addD(travel, -bd);
  let schedule: Rec[];
  if (due === null || dp >= 100 || due <= book || payable <= 0) schedule = [{ kind: "BALANCE", amountSatang: payable, passThroughSatang: ptS }];
  else {
    const allL = P["trips.pay.depositBase"] === "ALL_LINES";
    const d1 = allL ? bp(payable, dp * 100) : bp(payable - ptS, dp * 100);
    const d1pt = allL ? md(ptS, d1, payable) : 0;
    schedule = [{ kind: "DEPOSIT", amountSatang: d1, passThroughSatang: d1pt }, { kind: "BALANCE", amountSatang: payable - d1, passThroughSatang: ptS - d1pt }];
  }
  return { ok: true, items, totals, commission, schedule, promoTotal };
}

// ═══════ generator ═══════
let seed = Number(process.env.HUNT_SEED ?? 0x5eed05);
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const ch = (p: number) => rnd() < p;
const LD = { PARK_FEE: { passThrough: true, commissionPct: 0, discountable: false }, PORT_FEE: { passThrough: false, commissionPct: 0, discountable: false }, EQUIPMENT: { passThrough: false, commissionPct: 50, discountable: true }, NITROX: { passThrough: false, commissionPct: 50, discountable: true }, TRANSFER: { passThrough: false, commissionPct: 100, discountable: true }, INSURANCE: { passThrough: false, commissionPct: 100, discountable: true }, OTHER: { passThrough: false, commissionPct: 30, discountable: true } };
const PT = [{ id: "pt_A", code: "ADULT", countsCapacity: true, active: true }, { id: "pt_C", code: "CHILD", countsCapacity: true, active: true }, { id: "pt_I", code: "INFANT", countsCapacity: false, active: true }, { id: "pt_S", code: "SENIOR", countsCapacity: true, active: true }];
const amt = () => (ch(0.05) ? 0 : ch(0.1) ? ri(1, 999) : ri(50_000, 900_000));
const qtyG = () => (ch(0.04) ? ri(100, 100_000) : ch(0.1) ? 0 : ri(1, 12));
function gen(): Rec {
  const travel = addD("2026-11-01", ri(0, 420));
  const tz = ch(0.75) ? "Asia/Bangkok" : pick(["America/New_York", "Pacific/Auckland", "Europe/London"]);
  const nowMs = um(travel) - ri(-2, 120) * 86400000 + ri(-14, 30) * 3600000 + ri(0, 59) * 60000;
  const fx = ch(0.08);
  const currency = fx ? "USD" : "THB";
  const optionId = ch(0.6) ? "o1" : null;
  const pax = PT.filter(() => ch(0.6)).map((t) => ({ paxTypeId: t.id, qty: qtyG() }));
  if (!pax.length || pax.every((p) => p.qty === 0)) pax.push({ paxTypeId: "pt_A", qty: ri(1, 12) });
  if (ch(0.05)) pax.push({ paxTypeId: pax[0].paxTypeId, qty: ri(1, 3) }); // duplicate entry
  const seasons: Rec[] = [];
  for (let i = 0; i < ri(0, 3); i++) { const s = addD(travel, -ri(-3, 60)); seasons.push({ id: `s${i}`, dateStart: s, dateEnd: addD(s, ri(0, 90)), priority: pick([0, 0, 5, 10]), status: ch(0.9) ? "ACTIVE" : "ARCHIVED" }); }
  const prices: Rec[] = [];
  let pid = 0;
  const row = (o: Rec) => prices.push({ id: `pr${String(pid++).padStart(3, "0")}`, optionId: ch(0.2) ? pick(["o1", "o2"]) : null, paxTypeId: "pt_A", cabinTypeId: null, seasonId: null, departureId: null, currency: ch(0.95) ? currency : "EUR", amountMinor: amt(),
    weekdayMask: ch(0.15) ? ri(0, 127) : null, bookFrom: ch(0.1) ? addD(travel, -ri(0, 150)) : null, bookTo: ch(0.1) ? addD(travel, -ri(-5, 60)) : null, travelFrom: ch(0.1) ? addD(travel, -ri(-2, 10)) : null, travelTo: ch(0.1) ? addD(travel, ri(-2, 10)) : null, priority: pick([0, 0, 1, 5]), ...o });
  const levelRows = (o: Rec) => { for (const t of ["pt_A", "pt_A", "pt_C", "pt_I", "pt_S", null]) if (ch(0.35)) row({ paxTypeId: t, ...o }); };
  levelRows({}); if (ch(0.7)) row({ paxTypeId: "pt_A", optionId: null, weekdayMask: null, bookFrom: null, bookTo: null, travelFrom: null, travelTo: null, currency });
  for (const s of seasons) if (ch(0.8)) levelRows({ seasonId: s.id });
  if (ch(0.3)) levelRows({ departureId: "dep1" });
  const rules: Rec[] = [];
  const at = () => (ch(0.75) ? undefined : { ...(ch(0.4) ? { paxTypeCodes: [pick(["ADULT", "CHILD", "SENIOR"])] } : {}), ...(ch(0.3) ? { channels: [pick(["WEB", "COUNTER"])] } : {}), ...(ch(0.2) ? { optionIds: [pick(["o1", "o2"])] } : {}) });
  const disc = () => (ch(0.5) ? { discountBp: pick([0, 500, 1000, 3333, 10000, ri(1, 9999)]) } : { discountMinor: pick([1, 100, ri(1, 500_000), 99_999_999]) });
  const nR = ri(0, 5);
  for (let i = 0; i < nR; i++) {
    const kind = pick(["EARLY_BIRD", "LAST_MINUTE", "GROUP_TIER", "FREE_LEADER", "BLACKOUT", "PROMO_CODE"]);
    const a = at();
    const params: Rec = kind === "EARLY_BIRD" ? { kind, minDaysBefore: ri(0, 90), ...disc() } : kind === "LAST_MINUTE" ? { kind, maxHoursBefore: ri(0, 200), ...disc() }
      : kind === "GROUP_TIER" ? { kind, tiers: [{ minPax: ri(1, 5), discountBp: ri(0, 1500) }, { minPax: ri(6, 15), discountBp: ri(0, 3000) }] }
      : kind === "FREE_LEADER" ? { kind, everyPaid: ri(1, 12), freeQty: ri(1, 3), paxTypeCode: pick(["ADULT", "ADULT", "CHILD"]) }
      : kind === "BLACKOUT" ? { kind, dates: ch(0.5) ? [travel] : [addD(travel, 1)], ranges: ch(0.3) ? [{ from: addD(travel, -ri(0, 3)), to: addD(travel, ri(0, 3)) }] : [] }
      : { kind, code: pick(["SEA10", "sea10", "OFF50"]), ...disc(), ...(ch(0.3) ? { maxUses: ri(0, 5) } : {}), ...(ch(0.2) ? { validTo: addD(travel, -ri(0, 120)) } : ch(0.2) ? { validFrom: addD(travel, -ri(0, 120)) } : {}) };
    if (a) params.appliesTo = a;
    rules.push({ id: `ru${i}`, productId: ch(0.85) ? null : pick(["p1", "pX"]), kind, params, dateFrom: ch(0.15) ? addD(travel, -ri(0, 5)) : null, dateTo: ch(0.15) ? addD(travel, ri(-1, 5)) : null,
      bookFrom: ch(0.1) ? addD(travel, -ri(0, 100)) : null, bookTo: ch(0.1) ? addD(travel, -ri(0, 30)) : null, priority: pick([0, 0, 1, 10]), active: ch(0.92), usedCount: ri(0, 6) });
  }
  const extras: Rec[] = [
    { id: "x_park", kind: "PARK_FEE", basis: pick(["PER_PAX", "PER_PAX_DAY"]), mandatory: true, priceMinor: 60_000, paxPrices: { ADULT: 60_000, CHILD: 30_000 }, currency, commissionable: false, discountable: false, passThrough: true, taxKind: "NONE", label: "park" },
    { id: "x_cam", kind: "EQUIPMENT", basis: "PER_BOOKING", mandatory: false, priceMinor: amt(), paxPrices: null, currency, commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7", label: "cam" },
    { id: "x_nit", kind: "NITROX", basis: pick(["PER_PAX_DAY", "PER_DAY"]), mandatory: false, priceMinor: amt(), paxPrices: null, currency, commissionable: true, discountable: ch(0.5), passThrough: false, taxKind: "VAT7", label: "nitrox" },
    { id: "x_port", kind: "PORT_FEE", basis: "PER_BOOKING", mandatory: true, priceMinor: amt(), paxPrices: null, currency, commissionable: false, discountable: false, passThrough: false, taxKind: "VAT7", label: "port" },
    { id: "x_ins", kind: "INSURANCE", basis: "PER_PAX", mandatory: ch(0.3), priceMinor: amt(), paxPrices: null, currency, commissionable: true, discountable: true, passThrough: false, taxKind: "EXEMPT", label: "ins" },
    { id: "x_bn", kind: "OTHER", basis: "PER_BOAT_NIGHT", mandatory: false, priceMinor: amt(), paxPrices: null, currency, commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7", label: "night" },
    { id: "x_kid", kind: "OTHER", basis: "PER_PAX", mandatory: false, priceMinor: 0, paxPrices: { CHILD: amt(), SENIOR: amt() }, currency, commissionable: ch(0.5), discountable: true, passThrough: false, taxKind: "VAT7", label: "kid" },
  ].filter((e) => e.mandatory || ch(0.85));
  const requestedExtras = extras.filter((e) => !e.mandatory && ch(0.5)).map((e) => ({ extraId: e.id, qty: ch(0.05) ? ri(50, 1000) : ri(0, 3) }));
  const nights = ch(0.5) ? 0 : ri(1, 6);
  const agency = ch(0.3) ? genAgency(thbOf(currency)) : null;
  const ad = agency && ch(0.3) ? ri(0, 400_000) : 0;
  const overrides: Rec[] = [], approvals: Rec[] = [];
  if (ch(0.12)) for (const r of ["seat:ADULT", "seat:CHILD", "extra:x_cam", "extra:x_port", "seat:ADULT:free"].filter(() => ch(0.4))) {
    const u = ch(0.2) ? 0 : ri(10_000, 900_000);
    overrides.push({ itemRef: r, unitMinor: u, reason: ch(0.95) ? "ลูกค้าประจำ ลดพิเศษ" : "short" });
    if (ch(0.5)) approvals.push({ approvalId: `ap${r}`, itemRef: r, unitMinor: u });
  }
  const policy: Rec = {
    "trips.general.currencies": ["THB", "USD"], "trips.fx.rates": [{ currency: "USD", rateMicros: pick([35_500_000, 33_123_457, 1]) }],
    "trips.pay.depositPct": pick([0, 30, 50, 100, ri(1, 99)]), "trips.pay.depositBase": pick(["TRIP_ONLY", "ALL_LINES"]), "trips.pay.balanceDueDaysBefore": pick([null, 0, 7, 30, 60]),
    "trips.cancel.ladder": [{ fromDaysBefore: 30, refundPct: 100 }, { fromDaysBefore: 15, refundPct: 50 }, { fromDaysBefore: 0, refundPct: 0 }], "trips.cancel.shopCancelRefund": { EXTERNAL: 100, MIN_NOT_MET: 100, SHOP_FAULT: 100 },
    "trips.pax.childPricePct": pick([null, 70, 70, 50, 100, 0]), "trips.tax.vatRegistered": { registered: pick([true, true, false, null]) }, "trips.tax.priceIncludesVat": ch(0.7),
    "trips.tax.vatRate": { mode: ch(0.9) ? "STANDARD" : "EXEMPT_81_1_N", rateBp: pick([700, 700, 1000]) }, "trips.line.defaults": LD,
    "trips.parkFee.table": { groups: [{ thaiChildSatang: 0, thaiAdultSatang: 0, foreignChildSatang: 30_000, foreignAdultSatang: 60_000 }] },
    "trips.price.manualOverrideApprovalPct": pick([0, 10, 25]), "trips.price.costWarnMarginPct": 0,
  };
  return {
    now: new Date(nowMs).toISOString(), tz, unitId: "u1", channel: pick(["WEB", "COUNTER", "AGENT_PORTAL"]), actor: overrides.length ? "STAFF" : agency ? "AGENT" : pick(["PUBLIC", "STAFF", "SYSTEM"]), currency,
    product: { id: "p1", productType: fx || ch(0.3) ? "LIVEABOARD" : "TOUR", currency },
    departure: { id: "dep1", localDate: travel, startsAt: new Date(um(travel) + ri(-12, 20) * 3600000).toISOString(), optionId, capacity: 60, sold: ri(0, 10), held: 0, reserved: 0, minPax: ch(0.5) ? null : ri(1, 8), days: nights + 1, nights, costSatang: ch(0.3) ? ri(0, 5_000_000) : 0, deckPlanVersionId: null },
    paxTypes: PT, pax, extras, requestedExtras, pickup: ch(0.2) ? { zoneId: "z1", label: "hotel", surchargeSatang: ch(0.2) ? 0 : ri(1, 80_000) } : null,
    prices, seasons, rules, promoCode: ch(0.4) ? pick(["SEA10", " sea10 ", "OFF50", "NOPE"]) : null, promoProviders: thbOf(currency) && ch(0.15) ? [{ key: "points", ref: "pts1", label: "pts", discountSatang: ri(0, 300_000) }] : [],
    agency, agentDiscountSatang: ad, overrides, overrideGrant: { canOverride: true, approvals }, policy,
  };
}
function thbOf(c: string) { return c === "THB"; }
function genAgency(thb: boolean): Rec {
  const lvl = (refId: string): Rec => {
    const mode = pick(["COMMISSION_PCT", "COMMISSION_PCT", "COMMISSION_FIXED", "NET"]);
    return { refId, mode, rateBp: mode === "COMMISSION_PCT" ? pick([1000, 1500, 2000, ri(0, 10000)]) : null, fixedSatang: mode === "COMMISSION_FIXED" ? ri(0, 100_000) : null,
      unitMinorByPaxCode: ch(0.4) ? { ADULT: ri(100_000, 500_000), ...(ch(0.5) ? { CHILD: ri(50_000, 300_000) } : {}) } : null, minSellMinor: null, markupCapBp: null };
  };
  return { agentAccountId: "ag1", agentTierId: "t1", vatRegistered: ch(0.3), tier: ch(0.9) ? lvl("tier") : null, contract: ch(0.3) ? lvl("contract") : null,
    terms: { collector: pick(["AGENT_COLLECTS", "SHOP_COLLECTS"]), sellerOfRecord: "SHOP_PRINCIPAL", vatMode: pick(["NONE", "EXCLUSIVE", "INCLUSIVE"]), vatRateBp: 700,
      wht: { applies: ch(0.7), mode: pick(["RATE", "RATE", "PROGRESSIVE_50_1", "NONE_FOREIGN"]), rateBp: pick([300, 100, null]), eWht: false, grossUp: ch(0.6), minPerContractSatang: pick([0, 100_000]), continuous: pick(["EVERY_PAYMENT", "PER_CONTRACT"]), remitter: "SHOP", payerType: "JURISTIC", payeeType: "THAI_JURISTIC" },
      discountFromCommission: { enabled: thb && ch(0.7), capPct: pick([50, 100, 20]) }, earnedAt: "AFTER_TRAVEL", clawbackOnCancel: true, actualSaleSatang: null },
    policySnapshot: null };
}

// ═══════ compare ═══════
const proj = (v: Rec) => ({
  items: v.items.map((i: Rec) => ({ itemRef: i.itemRef, qty: i.qty, unitMinor: i.unitMinor, discountSatang: i.discountSatang, agentDiscountSatang: i.agentDiscountSatang, amountSatang: i.amountSatang, vatSatang: i.vatSatang, commissionBp: i.commissionBp, passThrough: i.passThrough, taxKind: i.taxKind, priceSource: i.priceSource })),
  totals: v.totals,
  commission: v.commission ? { baseSatang: v.commission.baseSatang, commissionSatang: v.commission.commissionSatang, commissionVatSatang: v.commission.commissionVatSatang, whtSatang: v.commission.wht.whtSatang, remitToShopSatang: v.commission.remitToShopSatang } : null,
  schedule: v.paymentSchedule.map((s: Rec) => ({ kind: s.kind, amountSatang: s.amountSatang, passThroughSatang: s.passThroughSatang })),
  promoTotal: v.promo ? v.promo.discountSatang : null,
});
const firstDiff = (a: unknown, b: unknown, path = ""): string | null => {
  if (isDeepStrictEqual(a, b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object") {
    if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) return `${path}.length ${a.length}≠${b.length}`;
    for (const k of new Set([...Object.keys(a as Rec), ...Object.keys(b as Rec)])) { const d = firstDiff((a as Rec)[k], (b as Rec)[k], `${path}.${k}`); if (d) return d; }
  }
  return `${path}: code=${JSON.stringify(a)} ref=${JSON.stringify(b)}`;
};
const shuffle = <T,>(xs: T[]): T[] => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const N = Number(process.env.HUNT_N ?? 20000);
const div = new Map<string, { n: number; ex: Rec; size: number; detail: string }>();
const note = (sig: string, inp: Rec, detail: string) => {
  const size = JSON.stringify(inp).length;
  const cur = div.get(sig);
  if (!cur) div.set(sig, { n: 1, ex: inp, size, detail }); else { cur.n++; if (size < cur.size) { cur.ex = inp; cur.size = size; cur.detail = detail; } }
};
const cnt = { ok: 0, fail: 0, match: 0, inv: 0, order: 0, idem: 0, mono: 0, throws: 0 };
const isInt = (x: unknown) => typeof x === "number" && Number.isSafeInteger(x);
function walkInts(v: unknown, path: string, bad: string[]) { if (typeof v === "number") { if (!Number.isSafeInteger(v)) bad.push(`${path}=${v}`); } else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walkInts(x, `${path}.${k}`, bad); }
for (let n = 0; n < N; n++) {
  const inp = gen();
  let got: Rec;
  try { got = resolveTripPrice(inp); } catch (e) { cnt.throws++; note(`THROW ${(e as Error).message.slice(0, 60)}`, inp, String(e)); continue; }
  const want = ref(inp);
  if (got.ok) cnt.ok++; else cnt.fail++;
  if (!got.ok || !want.ok) {
    const gc = got.ok ? "OK" : `${got.code}/${got.details?.reason ?? ""}`, wc = want.ok ? "OK" : `${want.code}/${want.reason ?? ""}`;
    if (gc !== wc) note(`OUTCOME code=${gc} ref=${wc}`, inp, JSON.stringify(got.ok ? {} : got.details).slice(0, 300)); else cnt.match++;
    continue;
  }
  const pg = proj(got.value);
  const pw = { items: want.items, totals: want.totals, commission: want.commission, schedule: want.schedule, promoTotal: want.promoTotal };
  const d = firstDiff(pg, pw);
  if (d) {
    // classify against alternative readings of the order
    const alts: [string, Rec][] = [["childFromCommon", { childFromCommon: true }], ["contractReplacesTier", { contractReplacesTier: true }], ["fixedCountsAllSeats", { fixedCountsAllSeats: true }]];
    let sig = `DIFF ${d.replace(/\d+/g, "#").slice(0, 70)}`;
    for (const [nm, o] of alts) { const w2 = ref(inp, o); if (w2.ok && !firstDiff(pg, { items: w2.items, totals: w2.totals, commission: w2.commission, schedule: w2.schedule, promoTotal: w2.promoTotal })) { sig = `ALT-READING ${nm} :: ${sig}`; break; } }
    note(sig, inp, d);
  } else cnt.match++;
  // invariants on the code's output
  const v = got.value, T = v.totals, bad: string[] = [];
  walkInts({ items: v.items.map((i: Rec) => ({ ...i, priceTrace: undefined })), T, c: v.commission, s: v.paymentSchedule }, "", bad);
  const sumAmt = v.items.reduce((s: number, i: Rec) => s + i.amountSatang, 0);
  const incl = inp.policy["trips.tax.priceIncludesVat"];
  if (sumAmt + (incl ? 0 : T.vatSatang) !== T.payableSatang) bad.push("Σamount(+vat) ≠ payable");
  if (T.vatBaseSatang + T.vatSatang !== (incl ? T.vatableSatang : T.vatableSatang + T.vatSatang)) bad.push("vatBase+vat ≠ vatable");
  const exempt = v.items.filter((i: Rec) => !i.passThrough && i.taxKind !== "VAT7").reduce((s: number, i: Rec) => s + i.amountSatang, 0);
  if (T.vatBaseSatang + T.vatSatang + T.passThroughSatang + exempt !== T.payableSatang) bad.push(`base+VAT+PT+exempt ≠ payable (${T.vatBaseSatang}+${T.vatSatang}+${T.passThroughSatang}+${exempt} vs ${T.payableSatang})`);
  if (v.items.some((i: Rec) => i.amountSatang < 0 || i.discountSatang < 0 || i.discountSatang + i.agentDiscountSatang > i.grossMinor)) bad.push("line negative / discount > line");
  if (v.items.some((i: Rec) => i.passThrough && (i.discountSatang || i.agentDiscountSatang || i.commissionBp || i.vatSatang))) bad.push("pass-through touched");
  if (v.paymentSchedule.reduce((s: number, x: Rec) => s + x.amountSatang, 0) !== T.payableSatang) bad.push("Σschedule ≠ payable");
  if (v.paymentSchedule.some((x: Rec) => x.vatableSatang + x.passThroughSatang !== x.amountSatang || x.amountSatang < 0 || x.passThroughSatang < 0)) bad.push("schedule row split");
  if (v.items.filter((i: Rec) => i.taxKind === "VAT7").reduce((s: number, i: Rec) => s + i.vatSatang, 0) !== T.vatSatang) bad.push("Σline vat ≠ vat");
  if (v.commission && v.commission.baseSatang > v.items.filter((i: Rec) => !i.passThrough).reduce((s: number, i: Rec) => s + i.amountSatang + i.agentDiscountSatang, 0)) bad.push("commission base > non-PT");
  if (v.promo && v.promo.discountSatang !== v.items.filter((i: Rec) => i.priceTrace.some((t: Rec) => t.step === "PROMO" && t.refId === v.promo.ruleId)).reduce((s: number, i: Rec) => s + i.discountSatang, 0) && !inp.promoProviders.length) bad.push(`promo.discountSatang ${v.promo.discountSatang} ≠ Σ line discount ${T.discountSatang}`);
  if (bad.length) { cnt.inv++; note(`INVARIANT ${bad[0].replace(/\d+/g, "#").slice(0, 80)}`, inp, bad.join(" | ")); }
  // snapshot recompute vs what was quoted (pure)
  try {
    const snap = deepFreeze(snapM.toTripsSnapshot({ input: inp, priced: got.value, policy: { trips: polSnap(inp.policy) } }));
    snapCnt.built++;
    const rc = (ev: Rec) => { const r = snapM.recomputeFromSnapshot(snap, ev); if (!r.ok) throw new Error(`recompute ${ev.kind} failed ${JSON.stringify(r)}`); return r.value; };
    const sb: string[] = [];
    if (!isDeepStrictEqual(rc({ kind: "TOTALS" }).totals, v.totals)) sb.push("TOTALS"); else snapCnt.totals++;
    if (!isDeepStrictEqual(rc({ kind: "SCHEDULE" }).paymentSchedule, v.paymentSchedule)) sb.push("SCHEDULE"); else snapCnt.sched++;
    if (v.commission) {
      const c = rc({ kind: "COMMISSION" });
      const want = { baseSatang: v.commission.baseSatang, commissionSatang: v.commission.commissionSatang, commissionVatSatang: v.commission.commissionVatSatang, whtSatang: v.commission.wht.whtSatang, remitToShopSatang: v.commission.remitToShopSatang, clawbackSatang: 0 };
      if (!isDeepStrictEqual(c, want)) sb.push(`COMMISSION recompute ${JSON.stringify(c)} ≠ quoted ${JSON.stringify(want)} mode=${v.commission.mode} seats=${JSON.stringify(v.items.filter((i: Rec) => i.kind === "SEAT").map((i: Rec) => [i.itemRef, i.qty]))}`); else snapCnt.comm++;
      const all: Rec = {}; for (const i of v.items) all[i.itemRef] = i.qty;
      const c2 = rc({ kind: "COMMISSION", remainingQtyByItemRef: all });
      if (c2.commissionSatang !== c.commissionSatang || c2.remitToShopSatang !== c.remitToShopSatang) sb.push(`COMMISSION(all remaining) ${JSON.stringify(c2)} ≠ ${JSON.stringify(c)}`); else snapCnt.commRem++;
    }
    const at = new Date(Date.parse(inp.departure.startsAt) - ri(-2, 60) * 86400000 - ri(0, 23) * 3600000).toISOString();
    const paid = ch(0.5) ? undefined : ri(0, T.payableSatang);
    const cx = rc({ kind: "CANCEL", at, reasonKind: pick(["CUSTOMER", "CUSTOMER", "EXTERNAL", "SHOP_FAULT"]), ...(paid === undefined ? {} : { paidSatang: paid }), ...(ch(0.2) ? { deductionsSatang: ri(0, 50_000) } : {}) });
    const pd = paid ?? T.payableSatang;
    const lsum = cx.lines.reduce((s: number, l: Rec) => s + l.refundSatang, 0);
    if (cx.paidSatang !== pd) sb.push(`CANCEL paid ${cx.paidSatang} ≠ ${pd}`);
    if (cx.refundSatang + cx.keptSatang !== cx.paidSatang || cx.refundSatang < 0 || cx.keptSatang < 0 || lsum !== cx.refundSatang) sb.push(`CANCEL refund ${cx.refundSatang} + kept ${cx.keptSatang} vs paid ${cx.paidSatang} Σlines ${lsum}`);
    if (cx.refundVatSatang < 0 || cx.keptVatSatang < 0 || cx.lines.some((l: Rec) => l.refundSatang < 0 || l.keptSatang < 0 || !Number.isSafeInteger(l.refundSatang))) sb.push(`CANCEL negative vat/lines ${JSON.stringify({ rv: cx.refundVatSatang, kv: cx.keptVatSatang })}`);
    if (cx.keptVatSatang > T.vatSatang) sb.push(`CANCEL keptVat ${cx.keptVatSatang} > document VAT ${T.vatSatang}`);
    if (!sb.length) snapCnt.cancel++;
    if (sb.length) { snapCnt.bad++; note(`SNAPSHOT ${sb[0].replace(/\d+/g, "#").slice(0, 90)}`, inp, sb.join(" | ")); }
  } catch (e) { snapCnt.bad++; note(`SNAPSHOT THROW ${(e as Error).message.slice(0, 80)}`, inp, String(e)); }
  // order independence
  const sh = { ...inp, paxTypes: shuffle(inp.paxTypes), pax: shuffle(inp.pax), extras: shuffle(inp.extras), requestedExtras: shuffle(inp.requestedExtras), prices: shuffle(inp.prices), seasons: shuffle(inp.seasons), rules: shuffle(inp.rules), overrides: shuffle(inp.overrides), overrideGrant: { ...inp.overrideGrant, approvals: shuffle(inp.overrideGrant.approvals) } };
  const g2 = resolveTripPrice(sh);
  const dd = firstDiff(g2, got);
  if (dd) { cnt.order++; note(`ORDER-DEPENDENT ${dd.replace(/\d+/g, "#").slice(0, 70)}`, inp, dd); }
  const g3 = resolveTripPrice(inp);
  if (!isDeepStrictEqual(g3, got)) { cnt.idem++; note("NOT-IDEMPOTENT", inp, ""); }
  // monotonic: add a valid 10% code / amount code ⇒ payable must not rise
  if (inp.currency === "THB" && !inp.overrides.length && !got.value.promo) {
    const m = { ...inp, promoCode: "MONO", rules: [...inp.rules, { id: "zz_mono", productId: null, kind: "PROMO_CODE", params: { kind: "PROMO_CODE", code: "MONO", ...(ch(0.5) ? { discountBp: ri(1, 10000) } : { discountMinor: ri(1, 10_000_000) }) }, dateFrom: null, dateTo: null, bookFrom: null, bookTo: null, priority: 0, active: true, usedCount: 0 }] };
    const g4 = resolveTripPrice(m);
    if (g4.ok && g4.value.totals.payableSatang > T.payableSatang) { cnt.mono++; note("MONOTONIC payable rose after adding discount", m, `${T.payableSatang} → ${g4.value.totals.payableSatang}`); }
    if (!g4.ok && got.ok) note(`MONOTONIC adding code made it fail ${g4.code}/${g4.details?.reason ?? ""}`, m, JSON.stringify(g4.details).slice(0, 200));
  }
}
console.log(`[snap] ${JSON.stringify(snapCnt)}`);
console.log(`[diff] runs=${N} codeOk=${cnt.ok} codeFail=${cnt.fail} exactMatch=${cnt.match} invariantViol=${cnt.inv} orderDep=${cnt.order} nonIdem=${cnt.idem} monoViol=${cnt.mono} throws=${cnt.throws}`);
const strip = (inp: Rec) => ({ ...inp, policy: "<std>", paxTypes: "<PT4>" });
for (const [sig, x] of [...div.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`\n### ${sig}  ×${x.n}\n  detail: ${x.detail.slice(0, 600)}\n  minimal(size ${x.size}): ${JSON.stringify(strip(x.ex)).slice(0, 3500)}`);
  if (sig.startsWith("DIFF") || sig.startsWith("ALT")) console.log(`  policy-sel: ${JSON.stringify({ t28: x.ex.policy["trips.pax.childPricePct"], vat: x.ex.policy["trips.tax.vatRegistered"], incl: x.ex.policy["trips.tax.priceIncludesVat"], rate: x.ex.policy["trips.tax.vatRate"], dep: x.ex.policy["trips.pay.depositPct"], base: x.ex.policy["trips.pay.depositBase"], due: x.ex.policy["trips.pay.balanceDueDaysBefore"], cap: x.ex.policy["trips.price.manualOverrideApprovalPct"], fx: x.ex.policy["trips.fx.rates"] })}`);
}
const { writeFileSync } = await import("node:fs");
writeFileSync(process.env.HUNT_OUT ?? "/tmp/claude-0/-root/df41f48a-2ba2-512c-8df1-75b7db31f4a8/scratchpad/diff-examples.json", JSON.stringify([...div.entries()].map(([k, v]) => ({ sig: k, n: v.n, detail: v.detail, ex: v.ex })), null, 1));
process.exit(0);
