// probe-trips-t0.5-edge.mts — hunter T0.5 (untracked): pure boundaries + adversarial input on resolver / snapshot / money-math. No DB writes.
import { loadTripsQcEnv } from "./trips-qc-env.mjs";

loadTripsQcEnv("probe-trips-t0.5-edge");
if (process.env.CI) { console.error("no CI"); process.exit(4); }
type Rec = Record<string, any>;
const core = (await import("../src/lib/modules/trips/pricing-core")) as Rec;
const snapM = (await import("../src/lib/modules/trips/snapshot")) as Rec;
const mm = (await import("../src/lib/modules/trips/money-math")) as Rec;
const R = core.resolveTripPrice as (x: unknown) => Rec;
const out = (tag: string, ...a: unknown[]) => console.log(`[${tag}]`, ...a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))));
const safe = (f: () => unknown): Rec => { try { const r = f() as Rec; return r; } catch (e) { return { THROW: true, name: (e as Error).name, msg: (e as Error).message.slice(0, 160) }; } };
const brief = (r: Rec) => (r.THROW ? r : r.ok ? { ok: true, payable: r.value.totals.payableSatang } : { ok: false, code: r.code, reason: r.details?.reason, issues: r.details?.issues?.slice?.(0, 2) });

const LD = { PARK_FEE: { passThrough: true, commissionPct: 0, discountable: false }, EQUIPMENT: { passThrough: false, commissionPct: 50, discountable: true }, TRANSFER: { passThrough: false, commissionPct: 100, discountable: true }, OTHER: { passThrough: false, commissionPct: 100, discountable: true } };
const POL = (o: Rec = {}): Rec => ({
  "trips.general.currencies": ["THB", "USD"], "trips.fx.rates": [{ currency: "USD", rateMicros: 35_500_000 }], "trips.pay.depositPct": 100, "trips.pay.depositBase": "TRIP_ONLY", "trips.pay.balanceDueDaysBefore": null,
  "trips.cancel.ladder": [{ fromDaysBefore: 30, refundPct: 100 }, { fromDaysBefore: 15, refundPct: 50 }, { fromDaysBefore: 0, refundPct: 0 }], "trips.cancel.shopCancelRefund": { EXTERNAL: 100, MIN_NOT_MET: 100, SHOP_FAULT: 100 },
  "trips.pax.childPricePct": 70, "trips.tax.vatRegistered": { registered: true }, "trips.tax.priceIncludesVat": true, "trips.tax.vatRate": { mode: "STANDARD", rateBp: 700 }, "trips.line.defaults": LD,
  "trips.parkFee.table": { groups: [{ thaiChildSatang: 0, thaiAdultSatang: 0, foreignChildSatang: 30_000, foreignAdultSatang: 60_000 }] }, "trips.price.manualOverrideApprovalPct": 10, "trips.price.costWarnMarginPct": 0, ...o,
});
const PT = [{ id: "pt_A", code: "ADULT", countsCapacity: true, active: true }, { id: "pt_C", code: "CHILD", countsCapacity: true, active: true }, { id: "pt_I", code: "INFANT", countsCapacity: false, active: true }];
const price = (o: Rec) => ({ id: "pr_r", optionId: null, paxTypeId: "pt_A", cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: 350_000, weekdayMask: null, bookFrom: null, bookTo: null, travelFrom: null, travelTo: null, priority: 0, ...o });
const rule = (id: string, params: Rec, o: Rec = {}) => ({ id, productId: null, kind: params.kind, params, dateFrom: null, dateTo: null, bookFrom: null, bookTo: null, priority: 0, active: true, usedCount: 0, ...o });
const base = (o: Rec = {}): Rec => ({
  now: "2026-11-12T05:00:00.000Z", tz: "Asia/Bangkok", unitId: "u1", channel: "WEB", actor: "STAFF", currency: "THB", product: { id: "p1", productType: "TOUR", currency: "THB" },
  departure: { id: "d1", localDate: "2026-12-12", startsAt: "2026-12-12T01:00:00.000Z", optionId: null, capacity: 60, sold: 0, held: 0, reserved: 0, minPax: null, days: 1, nights: 0, costSatang: 0, deckPlanVersionId: null },
  paxTypes: PT, pax: [{ paxTypeId: "pt_A", qty: 2 }], extras: [], requestedExtras: [], pickup: null, prices: [price({})], seasons: [], rules: [], promoCode: null, promoProviders: [], agency: null, agentDiscountSatang: 0,
  overrides: [], overrideGrant: { canOverride: false, approvals: [] }, policy: POL(), ...o,
});
const dep = (o: Rec) => ({ ...base().departure, ...o });
const seat = (r: Rec, ref = "seat:ADULT") => (r.ok ? r.value.items.find((i: Rec) => i.itemRef === ref) : null);
const u = (r: Rec, ref = "seat:ADULT") => { const s = seat(r, ref); return s ? [s.unitMinor, s.qty, s.priceSource] : brief(r); };

// ═══ 2. boundaries ═══
const EB = rule("eb", { kind: "EARLY_BIRD", minDaysBefore: 30, discountBp: 1000 });
// Bangkok: travel 2026-12-12, exactly 30 days before = 2026-11-12 local
out("B-EB-BKK 23:59:59 on day-30 (30d)", u(R(base({ rules: [EB], now: "2026-11-12T16:59:59.000Z" }))), "00:00:00 day-29 (29d)", u(R(base({ rules: [EB], now: "2026-11-12T17:00:00.000Z" }))));
// New York DST end 2026-11-01 (EDT→EST). travel 2026-12-01: 30 days before = 2026-11-01 local
const NY = { tz: "America/New_York", departure: dep({ localDate: "2026-12-01", startsAt: "2026-12-01T13:00:00.000Z" }) };
out("B-EB-NY local 2026-11-01 00:00 EDT(04:00Z)", u(R(base({ ...NY, rules: [EB], now: "2026-11-01T04:00:00.000Z" }))), "local 2026-10-31 23:59:59 EDT (31d)", u(R(base({ ...NY, rules: [EB], now: "2026-11-01T03:59:59.000Z" }))),
  "local 2026-11-01 23:59:59 EST (05:00Z+1d-1s, 30d)", u(R(base({ ...NY, rules: [EB], now: "2026-11-02T04:59:59.000Z" }))), "local 2026-11-02 00:00 EST (29d)", u(R(base({ ...NY, rules: [EB], now: "2026-11-02T05:00:00.000Z" }))));
// DST start 2027-03-14 NY; travel 2027-04-13 ⇒ day-30 = 2027-03-14
const NY2 = { tz: "America/New_York", departure: dep({ localDate: "2027-04-13", startsAt: "2027-04-13T13:00:00.000Z" }) };
out("B-EB-NY DST-start 2027-03-14 00:00 EST(05:00Z) 30d", u(R(base({ ...NY2, rules: [EB], now: "2027-03-14T05:00:00.000Z" }))), "2027-03-14 23:59:59 EDT(03:59:59Z+1) 30d", u(R(base({ ...NY2, rules: [EB], now: "2027-03-15T03:59:59.000Z" }))), "2027-03-15 00:00 EDT(04:00Z) 29d", u(R(base({ ...NY2, rules: [EB], now: "2027-03-15T04:00:00.000Z" }))));
const LM = rule("lm", { kind: "LAST_MINUTE", maxHoursBefore: 24, discountBp: 2000 });
out("B-LM exactly 24h", u(R(base({ rules: [LM], now: "2026-12-11T01:00:00.000Z" }))), "24h+1ms", u(R(base({ rules: [LM], now: "2026-12-11T00:59:59.999Z" }))), "0ms (= start)", u(R(base({ rules: [LM], now: "2026-12-12T01:00:00.000Z" }))), "1ms before", u(R(base({ rules: [LM], now: "2026-12-12T00:59:59.999Z" }))));
const FL0 = () => rule("fl0", { kind: "FREE_LEADER", everyPaid: 10, freeQty: 1, paxTypeCode: "ADULT" });
const GT = rule("gt", { kind: "GROUP_TIER", tiers: [{ minPax: 5, discountBp: 500 }, { minPax: 10, discountBp: 1000 }] });
out("B-GT 4/5/9/10 capacity pax (+2 infants not counted)", [4, 5, 9, 10].map((n) => u(R(base({ rules: [GT], prices: [price({}), price({ id: "pr_i", paxTypeId: "pt_I", amountMinor: 0 })], pax: [{ paxTypeId: "pt_A", qty: n - 2 }, { paxTypeId: "pt_C", qty: 2 }, { paxTypeId: "pt_I", qty: 2 }] })))));
out("B-GT+FL group of exactly 10 adults: GT 10% and FREE_LEADER 1", u(R(base({ rules: [GT, FL0()], pax: [{ paxTypeId: "pt_A", qty: 10 }] }))), u(R(base({ rules: [GT, FL0()], pax: [{ paxTypeId: "pt_A", qty: 10 }] })), "seat:ADULT:free"));
const FL = rule("fl", { kind: "FREE_LEADER", everyPaid: 10, freeQty: 1, paxTypeCode: "ADULT" });
for (const n of [9, 10, 11, 19, 20, 21]) { const r = R(base({ rules: [FL], pax: [{ paxTypeId: "pt_A", qty: n }] })); out(`B-FL ${n}`, u(r), u(r, "seat:ADULT:free"), r.ok ? r.value.totals.payableSatang : null); }
const FL2 = rule("fl2", { kind: "FREE_LEADER", everyPaid: 1, freeQty: 3, paxTypeCode: "ADULT" });
out("B-FL everyPaid1 freeQty3 2 pax (cap at N)", u(R(base({ rules: [FL2] }))), u(R(base({ rules: [FL2] })), "seat:ADULT:free"));
// seasons
const S = (id: string, a: string, b: string, p: number, status = "ACTIVE") => ({ id, dateStart: a, dateEnd: b, priority: p, status });
const sp = (sid: string, amt: number, o: Rec = {}) => price({ id: `pr_${sid}`, seasonId: sid, amountMinor: amt, ...o });
const seasonsIn = { seasons: [S("s_main", "2026-11-01", "2027-04-30", 0), S("s_ny", "2026-12-20", "2027-01-05", 10)], prices: [price({}), sp("s_main", 360_000), sp("s_ny", 390_000), price({ id: "pr_d", departureId: "d1", amountMinor: 450_000 })] };
for (const d of ["2026-10-31", "2026-11-01", "2026-12-19", "2026-12-20", "2026-12-31", "2027-01-05", "2027-01-06", "2027-04-30", "2027-05-01"]) {
  const withDep = d === "2026-12-31";
  out(`B-SEASON ${d}${withDep ? " (+dep price 4,500)" : ""}`, u(R(base({ ...seasonsIn, prices: withDep ? seasonsIn.prices : seasonsIn.prices.slice(0, 3), departure: dep({ localDate: d, startsAt: `${d}T01:00:00.000Z` }), now: "2026-10-01T00:00:00.000Z" }))));
}
out("B-SEASON tie equal priority (ids a<b): picks", u(R(base({ seasons: [S("s_b", "2026-12-01", "2026-12-31", 5), S("s_a", "2026-12-10", "2026-12-20", 5)], prices: [price({}), sp("s_b", 111_100), sp("s_a", 222_200)] }))));
out("B-SEASON archived ignored", u(R(base({ seasons: [S("s_x", "2026-12-01", "2026-12-31", 5, "ARCHIVED")], prices: [price({}), sp("s_x", 111_100)] }))));
// top season has rows only for CHILD ⇒ adult falls back? (order: "ไม่มีแถวราคาของสินค้านี้ = ข้ามไปฤดูถัดไป")
out("B-SEASON top season has CHILD row only; lower season has ADULT row ⇒ adult price", u(R(base({ seasons: [S("s_hi", "2026-12-01", "2026-12-31", 9), S("s_lo", "2026-12-01", "2026-12-31", 1)], prices: [price({}), sp("s_hi", 100_000, { paxTypeId: "pt_C" }), sp("s_lo", 200_000)] }))));
out("B-SEASON top season row filtered by weekdayMask ⇒ skip to next season?", u(R(base({ seasons: [S("s_hi", "2026-12-01", "2026-12-31", 9), S("s_lo", "2026-12-01", "2026-12-31", 1)], prices: [price({}), sp("s_hi", 100_000, { weekdayMask: 1 }), sp("s_lo", 200_000)] }))));
// child fallback at each level
const CH = (prices: Rec[], o: Rec = {}) => u(R(base({ pax: [{ paxTypeId: "pt_A", qty: 1 }, { paxTypeId: "pt_C", qty: 1 }], seasons: [S("s1", "2026-12-01", "2026-12-31", 0)], prices, ...o })), "seat:CHILD");
out("B-CHILD retail adult only ⇒ 70%", CH([price({})]));
out("B-CHILD retail child 200k + season adult 400k ⇒ season 70% (later level wins)", CH([price({}), price({ id: "pr_c", paxTypeId: "pt_C", amountMinor: 200_000 }), sp("s1", 400_000)]));
out("B-CHILD season child row + season adult ⇒ child row", CH([price({}), sp("s1", 400_000), sp("s1", 123_400, { id: "pr_s1c", paxTypeId: "pt_C" })]));
out("B-CHILD dep adult only ⇒ 70% of dep", CH([price({}), price({ id: "pr_d", departureId: "d1", amountMinor: 450_000 })]));
out("B-CHILD T28 null, adult only ⇒ PRICE_MISSING", CH([price({})], { policy: POL({ "trips.pax.childPricePct": null }) }));
out("B-CHILD level has only paxTypeId=null row 500k (needs ruling: 70% or 500k?)", CH([price({ paxTypeId: null, amountMinor: 500_000 })]));
out("B-CHILD odd 70% half-up 1 satang (1×70%=0.7→1) / 3 (2.1→2) / 5 (3.5→4)", [1, 3, 5].map((a) => CH([price({ amountMinor: a })])));
// blackout edges
const BO = (o: Rec) => rule("bo", { kind: "BLACKOUT", dates: [], ranges: [{ from: "2026-12-10", to: "2026-12-12" }], ...o });
const PC = rule("pc", { kind: "PROMO_CODE", code: "SEA10", discountBp: 1000 });
for (const d of ["2026-12-09", "2026-12-10", "2026-12-12", "2026-12-13"]) { const r = R(base({ rules: [BO({}), EB, PC], promoCode: "SEA10", now: "2026-10-01T00:00:00.000Z", departure: dep({ localDate: d, startsAt: `${d}T01:00:00.000Z` }) })); out(`B-BLACKOUT ${d}`, u(r), r.ok ? [r.value.totals.discountSatang, r.value.warnings.map((w: Rec) => w.code)] : null); }
// price windows
for (const [bf, bt, tf, tt] of [["2026-11-12", null, null, null], ["2026-11-13", null, null, null], [null, "2026-11-12", null, null], [null, "2026-11-11", null, null], [null, null, "2026-12-12", "2026-12-12"], [null, null, "2026-12-13", null]]) {
  out(`B-WINDOW book[${bf},${bt}] travel[${tf},${tt}] (book 2026-11-12, travel 2026-12-12)`, u(R(base({ prices: [price({ amountMinor: 100_000, priority: -1 }), price({ id: "pr_w", amountMinor: 999_900, priority: 5, bookFrom: bf, bookTo: bt, travelFrom: tf, travelTo: tt })] }))));
}
// booking-window of rules (bookFrom/bookTo) — book date at local midnight
out("B-RULE bookTo = today (Bangkok 2026-11-12 00:00 local)", u(R(base({ rules: [{ ...EB, params: { ...EB.params, minDaysBefore: 0 }, bookTo: "2026-11-12" }], now: "2026-11-11T17:00:00.000Z" }))), "bookTo = yesterday", u(R(base({ rules: [{ ...EB, params: { ...EB.params, minDaysBefore: 0 }, bookTo: "2026-11-11" }], now: "2026-11-11T17:00:00.000Z" }))));
// schedule due date in DST zone
const sch = (tz: string, d: string, days: number) => { const r = R(base({ tz, departure: dep({ localDate: d, startsAt: `${d}T13:00:00.000Z` }), now: "2026-10-01T12:00:00.000Z", policy: POL({ "trips.pay.depositPct": 30, "trips.pay.balanceDueDaysBefore": days }) })); return r.ok ? r.value.paymentSchedule.map((s: Rec) => [s.kind, s.amountSatang, s.dueAt]) : brief(r); };
out("B-SCHED BKK due 2026-12-02 23:59 local", sch("Asia/Bangkok", "2026-12-12", 10));
out("B-SCHED NY due 2027-03-14 (DST start) 23:59 EDT = 03:59Z next", sch("America/New_York", "2027-03-24", 10));
out("B-SCHED NY due 2026-11-01 (DST end) 23:59 EST = 04:59Z next", sch("America/New_York", "2026-11-11", 10));
out("B-SCHED due == today ⇒ single BALANCE", sch("Asia/Bangkok", "2026-10-11", 10));

// ═══ ruling probes ═══
const AG = (o: Rec = {}) => ({ agentAccountId: "ag", agentTierId: "t", vatRegistered: false,
  tier: { refId: "tier", mode: "COMMISSION_PCT", rateBp: 1500, fixedSatang: null, unitMinorByPaxCode: { ADULT: 300_000 }, minSellMinor: null, markupCapBp: null },
  contract: { refId: "con", mode: "COMMISSION_PCT", rateBp: 2000, fixedSatang: null, unitMinorByPaxCode: null, minSellMinor: null, markupCapBp: null },
  terms: { collector: "AGENT_COLLECTS", sellerOfRecord: "SHOP_PRINCIPAL", vatMode: "NONE", vatRateBp: 700, wht: { applies: false, mode: "RATE", rateBp: 300, eWht: false, grossUp: true, minPerContractSatang: 0, continuous: "EVERY_PAYMENT", remitter: "SHOP", payerType: "J", payeeType: "J" },
    discountFromCommission: { enabled: true, capPct: 100 }, earnedAt: "AFTER_TRAVEL", clawbackOnCancel: true, actualSaleSatang: null }, policySnapshot: null, ...o });
{ const r = R(base({ actor: "AGENT", channel: "AGENT_PORTAL", agency: AG() })); out("RULING contract (no prices) over tier (ADULT 3,000): seat price/source, rate", u(r), r.ok ? [r.value.commission.rateSource, r.value.commission.rateBp, r.value.commission.commissionSatang] : null); }
{ // COMMISSION_FIXED with an INFANT seat priced > 0 ⇒ resolver vs snapshot recompute
  const ag = AG({ tier: { refId: "tier", mode: "COMMISSION_FIXED", rateBp: null, fixedSatang: 50_000, unitMinorByPaxCode: null, minSellMinor: null, markupCapBp: null }, contract: null });
  const inp = base({ actor: "AGENT", channel: "AGENT_PORTAL", agency: ag, pax: [{ paxTypeId: "pt_A", qty: 2 }, { paxTypeId: "pt_I", qty: 1 }], prices: [price({}), price({ id: "pr_i", paxTypeId: "pt_I", amountMinor: 100_000 })] });
  const r = R(inp);
  const snap = snapM.toTripsSnapshot({ input: inp, priced: r.value, policy: { trips: { v: 1, domain: "trips", at: "x", template: null, values: { ...inp.policy, "trips.cancel.refundForm": "MONEY", "trips.cancel.nameChangeFree": true, "trips.cancel.changeDateFee": null, "trips.tax.invoiceOnEachPayment": true, "trips.tax.cancelFeeVat": "X" }, sources: {} } } });
  out("F-FIXED quote: C, remit", [r.value.commission.commissionSatang, r.value.commission.remitToShopSatang], "recompute COMMISSION (no change):", snapM.recomputeFromSnapshot(snap, { kind: "COMMISSION" }).value);
}
{ // promo + manual override on the same line: promo.discountSatang vs totals.discountSatang
  const inp = base({ rules: [PC], promoCode: "SEA10", overrides: [{ itemRef: "seat:ADULT", unitMinor: 340_000, reason: "ลูกค้าประจำ ลดพิเศษ" }], overrideGrant: { canOverride: true, approvals: [] } });
  const r = R(inp);
  out("F-PROMO+MANUAL promo, totals.discount, adult line", r.value.promo, r.value.totals.discountSatang, u(r));
}
{ // duplicate overrides on the same itemRef — ratchet below the T11 cap without approval
  const ovs = [350_000 * 0.9, 315_000 * 0.9, 283_500 * 0.9].map((x) => ({ itemRef: "seat:ADULT", unitMinor: Math.floor(x), reason: "ลูกค้าประจำ ลดพิเศษ" }));
  const r = R(base({ overrides: ovs, overrideGrant: { canOverride: true, approvals: [] } }));
  const one = R(base({ overrides: [ovs[2]], overrideGrant: { canOverride: true, approvals: [] } }));
  out("F-OVERRIDE-RATCHET 3 overrides same line 3,500→3,150→2,835→2,551.50 (cap 10%)", brief(r), u(r), "single override to same final price:", brief(one));
}
{ // agent discount when COMMISSION_FIXED exceeds line amounts
  const ag = AG({ tier: { refId: "tier", mode: "COMMISSION_FIXED", rateBp: null, fixedSatang: 1_000_000, unitMinorByPaxCode: null, minSellMinor: null, markupCapBp: null }, contract: null });
  const r = R(base({ actor: "AGENT", channel: "AGENT_PORTAL", agency: ag, agentDiscountSatang: 900_000 }));
  out("F-AGENTDISC > line amounts (fixed comm 10,000×2, disc 9,000 on 7,000 of seats)", r.ok ? { items: r.value.items.map((i: Rec) => [i.itemRef, i.amountSatang, i.agentDiscountSatang]), totals: r.value.totals, C: r.value.commission.commissionSatang, agDisc: r.value.commission.agentDiscountSatang, remit: r.value.commission.remitToShopSatang } : brief(r));
}

// ═══ 7. adversarial (pure) ═══
const A = (tag: string, o: Rec) => out(`ADV ${tag}`, brief(safe(() => R(base(o)))));
const BIG = 2 ** 31, MAXS = 2 ** 53;
for (const [k, v] of [["NaN", NaN], ["Infinity", Infinity], ["-1", -1], ["2^31", BIG], ["2^53", MAXS], ["'2'", "2"], ["1.5", 1.5]] as [string, unknown][]) A(`pax.qty=${k}`, { pax: [{ paxTypeId: "pt_A", qty: v }] });
for (const [k, v] of [["NaN", NaN], ["-1", -1], ["2^31", BIG], ["'350000'", "350000"]] as [string, unknown][]) A(`price.amountMinor=${k}`, { prices: [price({ amountMinor: v })] });
A("extra key on root", { evil: 1 });
A("__proto__ key in pax item (JSON)", { pax: [JSON.parse('{"paxTypeId":"pt_A","qty":2,"__proto__":{"x":1}}')] });
A("constructor key policy", { policy: { ...POL(), constructor: 1 } });
A("pax empty", { pax: [] });
A("pax all qty 0", { pax: [{ paxTypeId: "pt_A", qty: 0 }] });
A("unknown pax type", { pax: [{ paxTypeId: "nope", qty: 1 }] });
A("51 pax entries", { pax: Array.from({ length: 51 }, () => ({ paxTypeId: "pt_A", qty: 1 })) });
A("50×100000 pax at INT4 price (Σ > 2^53)", { pax: Array.from({ length: 50 }, () => ({ paxTypeId: "pt_A", qty: 100_000 })), prices: [price({ amountMinor: 2_147_483_647 })] });
A("days=INT4 + PER_PAX_DAY extra", { departure: dep({ days: 2_147_483_647 }), extras: [{ id: "x", kind: "OTHER", basis: "PER_PAX_DAY", mandatory: true, priceMinor: 100, paxPrices: null, currency: "THB", commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7", label: "x" }] });
A("requestedExtras 10000 lines", { requestedExtras: Array.from({ length: 10_000 }, () => ({ extraId: "x", qty: 1 })) });
A("prices 5001 rows", { prices: Array.from({ length: 5001 }, (_, i) => price({ id: `p${i}` })) });
A("policy T28 = 150", { policy: POL({ "trips.pax.childPricePct": 150 }) });
A("policy T11 = -5", { policy: POL({ "trips.price.manualOverrideApprovalPct": -5 }) });
A("policy vatRate rateBp 20000", { policy: POL({ "trips.tax.vatRate": { mode: "STANDARD", rateBp: 20000 } }) });
A("policy fx rateMicros NaN", { currency: "USD", product: { id: "p1", productType: "LIVEABOARD", currency: "USD" }, prices: [price({ currency: "USD" })], policy: POL({ "trips.fx.rates": [{ currency: "USD", rateMicros: NaN }] }) });
A("policy fx rateMicros 2^31-1 × big", { currency: "USD", product: { id: "p1", productType: "LIVEABOARD", currency: "USD" }, prices: [price({ currency: "USD", amountMinor: 2_147_483_647 })], pax: [{ paxTypeId: "pt_A", qty: 100_000 }], policy: POL({ "trips.fx.rates": [{ currency: "USD", rateMicros: 2_147_483_647 }] }) });
A("rule discountBp 20000 (ignored by schema?)", { rules: [rule("x", { kind: "EARLY_BIRD", minDaysBefore: 0, discountBp: 20000 })] });
A("rule discountMinor 2^53", { rules: [rule("x", { kind: "EARLY_BIRD", minDaysBefore: 0, discountMinor: MAXS })] });
A("rule GROUP_TIER minPax 0 / unsorted", { rules: [rule("x", { kind: "GROUP_TIER", tiers: [{ minPax: 10, discountBp: 2000 }, { minPax: 2, discountBp: 100 }] })] });
A("promo provider discount 2^31", { promoProviders: [{ key: "p", ref: "r", label: "l", discountSatang: BIG }] });
A("promo provider discount -5", { promoProviders: [{ key: "p", ref: "r", label: "l", discountSatang: -5 }] });
for (const code of ["S​EA10", "ＳＥＡ１０", "sea10\u0000", "x".repeat(64), "x".repeat(65), "SEA10‮", "🐠🐠🐠"]) A(`promoCode ${JSON.stringify(code).slice(0, 30)}`, { rules: [PC], promoCode: code });
A("now far past 0001-01-01", { now: "0001-01-01T00:00:00.000Z" });
A("now far future 9999-12-31", { now: "9999-12-31T23:59:59.000Z" });
A("now = 'yesterday' (Date.parse accepts?)", { now: "Thu, 12 Nov 2026 05:00:00 GMT" });
A("now = '2026'", { now: "2026" });
A("localDate 9999-12-31", { departure: dep({ localDate: "9999-12-31", startsAt: "9999-12-31T00:00:00.000Z" }) });
A("tz bogus 'Mars/Olympus'", { tz: "Mars/Olympus" });
A("override unitMinor NaN", { overrides: [{ itemRef: "seat:ADULT", unitMinor: NaN, reason: "ลูกค้าประจำ ลดพิเศษ" }], overrideGrant: { canOverride: true, approvals: [] } });
A("override reason 10 spaces+1", { overrides: [{ itemRef: "seat:ADULT", unitMinor: 360_000, reason: "          x" }], overrideGrant: { canOverride: true, approvals: [] } });
A("override reason 10 zero-width chars", { overrides: [{ itemRef: "seat:ADULT", unitMinor: 360_000, reason: "​".repeat(10) }], overrideGrant: { canOverride: true, approvals: [] } });
A("agentDiscountSatang NaN", { agentDiscountSatang: NaN });
A("agency bogus extra key", { actor: "AGENT", agency: { ...AG(), evil: 1 } });
A("extra paxPrices value -1", { extras: [{ id: "x", kind: "OTHER", basis: "PER_PAX", mandatory: true, priceMinor: 0, paxPrices: { ADULT: -1 }, currency: "THB", commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7", label: "x" }] });
A("extra paxPrices __proto__ key", { extras: [{ id: "x", kind: "OTHER", basis: "PER_PAX", mandatory: true, priceMinor: 0, paxPrices: JSON.parse('{"__proto__":{"ADULT":5},"constructor":7}'), currency: "THB", commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7", label: "x" }] });
A("paxType code '__proto__' / 'constructor'", { paxTypes: [...PT, { id: "pt_p", code: "constructor", countsCapacity: true, active: true }], pax: [{ paxTypeId: "pt_p", qty: 1 }], prices: [price({ paxTypeId: "pt_p" })], extras: [{ id: "x", kind: "OTHER", basis: "PER_PAX", mandatory: true, priceMinor: 0, paxPrices: { ADULT: 1 }, currency: "THB", commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7", label: "x" }] });
A("agency tier unitMinorByPaxCode with 'constructor' pax code", { actor: "AGENT", channel: "AGENT_PORTAL", paxTypes: [...PT, { id: "pt_p", code: "constructor", countsCapacity: true, active: true }], pax: [{ paxTypeId: "pt_p", qty: 1 }], prices: [price({ paxTypeId: "pt_p" })], agency: AG({ contract: null, tier: { refId: "tier", mode: "COMMISSION_PCT", rateBp: 1500, fixedSatang: null, unitMinorByPaxCode: {}, minSellMinor: null, markupCapBp: null } }) });
A("input null", null as unknown as Rec);
out("ADV input = null", brief(safe(() => R(null))), "input = 'x'", brief(safe(() => R("x"))));

// snapshot recompute adversarial
const sInp = base({ pax: [{ paxTypeId: "pt_A", qty: 2 }] });
const snap = snapM.toTripsSnapshot({ input: sInp, priced: R(sInp).value, policy: { trips: { v: 1, domain: "trips", at: "x", template: null, values: { ...sInp.policy, "trips.cancel.refundForm": "MONEY", "trips.cancel.nameChangeFree": true, "trips.cancel.changeDateFee": null, "trips.tax.invoiceOnEachPayment": true, "trips.tax.cancelFeeVat": "X" }, sources: {} } } });
const RC = (tag: string, ev: unknown) => { const r = safe(() => snapM.recomputeFromSnapshot(snap, ev)); out(`ADV-RC ${tag}`, r.THROW ? r : r.ok ? { ok: true, refund: r.value.refundSatang, kept: r.value.keptSatang, paid: r.value.paidSatang, C: r.value.commissionSatang } : { ok: false, code: r.code, msg: r.messageTh }); };
for (const [k, v] of [["NaN", NaN], ["1.5", 1.5], ["-100", -100], ["'500'", "500"], ["Infinity", Infinity], ["2^60", 2 ** 60]] as [string, unknown][]) RC(`CANCEL paidSatang=${k}`, { kind: "CANCEL", at: "2026-11-20T00:00:00Z", reasonKind: "CUSTOMER", paidSatang: v });
for (const [k, v] of [["NaN", NaN], ["1.5", 1.5], ["2^60", 2 ** 60]] as [string, unknown][]) RC(`CANCEL deductions=${k}`, { kind: "CANCEL", at: "2026-11-20T00:00:00Z", reasonKind: "CUSTOMER", deductionsSatang: v });
RC("CANCEL at='garbage'", { kind: "CANCEL", at: "garbage", reasonKind: "CUSTOMER" });
RC("CANCEL reasonKind='toString'", { kind: "CANCEL", at: "2026-11-20T00:00:00Z", reasonKind: "toString" });
RC("CANCEL reasonKind='__proto__'", { kind: "CANCEL", at: "2026-11-20T00:00:00Z", reasonKind: "__proto__" });
RC("CANCEL at year 9999", { kind: "CANCEL", at: "9999-01-01T00:00:00Z", reasonKind: "CUSTOMER" });
RC("COMMISSION on non-agency", { kind: "COMMISSION" });
RC("event null", null);
RC("event {kind:'X'}", { kind: "X" });
out("ADV-RC snapshot null", safe(() => snapM.recomputeFromSnapshot(null, { kind: "TOTALS" })));
// field mutation of a stored snapshot: one line amount changed ⇒ CANCEL reflects only that
{ const m = JSON.parse(JSON.stringify(snap)); m.lines[0].amountSatang += 1000; m.totals.payableSatang += 1000;
  const a = snapM.recomputeFromSnapshot(snap, { kind: "CANCEL", at: "2026-11-20T00:00:00Z", reasonKind: "CUSTOMER" }).value, b = snapM.recomputeFromSnapshot(m, { kind: "CANCEL", at: "2026-11-20T00:00:00Z", reasonKind: "CUSTOMER" }).value;
  out("SN-MUT line0 +1000 ⇒ refund diff", b.refundSatang - a.refundSatang, "paid diff", b.paidSatang - a.paidSatang);
  const m2 = JSON.parse(JSON.stringify(snap)); m2.policy.trips.values["trips.tax.vatRate"] = { mode: "STANDARD", rateBp: 1000 };
  const c = snapM.recomputeFromSnapshot(m2, { kind: "CANCEL", at: "2026-11-20T00:00:00Z", reasonKind: "CUSTOMER" }).value;
  out("SN-MUT policy vatRate 7%→10% ⇒ refundVat", a.refundVatSatang, "→", c.refundVatSatang, "refund same?", a.refundSatang === c.refundSatang, " · tax.vatRateBp field still", m2.tax.vatRateBp);
  const m3 = JSON.parse(JSON.stringify(snap)); m3.cancelLadder = [{ daysBefore: 0, refundBp: 10000 }];
  out("SN-MUT ladder ⇒ refund", snapM.recomputeFromSnapshot(m3, { kind: "CANCEL", at: "2026-11-20T00:00:00Z", reasonKind: "CUSTOMER" }).value.refundSatang, "vs", a.refundSatang);
}
// money-math adversarial
for (const [k, f] of [["mulBpHalfUp(NaN,1)", () => mm.mulBpHalfUp(NaN, 1)], ["allocateLastRemainder(5,[NaN,1])", () => mm.allocateLastRemainder(5, [NaN, 1])], ["allocateLastRemainder(-5,[1,1])", () => mm.allocateLastRemainder(-5, [1, 1])], ["allocateLastRemainder(5,[-3,1])", () => mm.allocateLastRemainder(5, [-3, 1])], ["allocateWithin(10,[1,1])", () => mm.allocateWithin(10, [1, 1])], ["mulDivHalfUp(-5,1,2)", () => mm.mulDivHalfUp(-5, 1, 2)], ["divCeil(-3,2)", () => mm.divCeil(-3, 2)]] as [string, () => unknown][]) out(`MM ${k}`, safe(f as () => Rec));
process.exit(0);
