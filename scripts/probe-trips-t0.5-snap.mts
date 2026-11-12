// probe-trips-t0.5-snap.mts — hunter T0.5 (untracked): snapshot self-sufficiency on the lane QC DB (200 bookings), mocks 15 + 03 from snapshot,
// isolation (tenant B / unit A2), sellable vs quoteTrips, adversarial service input. Temp tenants trips-hunt5-* removed in finally.
import { isDeepStrictEqual } from "node:util";
import { boot, brief, cleanup, fmt, insertRow, mkDep, mkOwner, mkProduct, mkTenant, mkUnit, out, q, rid, safeCall, type Rec } from "./probe-trips-t0.5-lib.mjs";
import * as FX from "./trips-fixture.mjs";

boot("probe-trips-t0.5-snap");
const T = (await import("@/lib/modules/trips")) as Rec;
const SET = (await import("@/lib/core/settings")) as Rec;
const DB = (await import("@/lib/core/db")) as Rec;
let rs = 0x1234;
const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <X,>(xs: readonly X[]): X => xs[Math.floor(rnd() * xs.length)];
const BKK = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+07:00`);
const addD = (y: string, n: number) => new Date(Date.UTC(+y.slice(0, 4), +y.slice(5, 7) - 1, +y.slice(8, 10) + n)).toISOString().slice(0, 10);

const AGENCY = (rateBp: number, whtBp: number, vatMode: string) => ({
  agentAccountId: "ag-hunt5", agentTierId: "tier-hunt5", vatRegistered: vatMode !== "NONE",
  tier: { refId: "tier-hunt5", mode: "COMMISSION_PCT", rateBp, fixedSatang: null, unitMinorByPaxCode: null, minSellMinor: null, markupCapBp: null }, contract: null,
  terms: { collector: "AGENT_COLLECTS", sellerOfRecord: "SHOP_PRINCIPAL", vatMode, vatRateBp: 700, wht: { applies: true, mode: "RATE", rateBp: whtBp, eWht: false, grossUp: true, minPerContractSatang: 100_000, continuous: "EVERY_PAYMENT", remitter: "SHOP", payerType: "JURISTIC", payeeType: "THAI_JURISTIC" },
    discountFromCommission: { enabled: true, capPct: 50 }, earnedAt: "AFTER_TRAVEL", clawbackOnCancel: true, actualSaleSatang: null },
  policySnapshot: { v: 1, domain: "agency", at: "2026-11-12T00:00:00.000Z", template: null, values: { "agency.comm.rate": rateBp }, sources: {} },
});
let agencyNow = AGENCY(1500, 300, "NONE");
const unreg = T.registerAgencyPricingPort({ load: async () => agencyNow });

const findings: string[] = [];
const F = (s: string) => { findings.push(s); console.log(`  ❗ ${s}`); };
try {
  const tA = await mkTenant("a"), tB = await mkTenant("b");
  const uA = await mkUnit(tA, "a"), uA2 = await mkUnit(tA, "a2"), uA3 = await mkUnit(tA, "a3"), uB = await mkUnit(tB, "b");
  const oa = await mkOwner(tA, "oa"), ob = await mkOwner(tB, "ob");
  const C = (unit: string, o: Rec = {}): Rec => ({ tenantId: o.tenant ?? tA, unitId: unit, channel: o.ch ?? "COUNTER", actor: o.actor ?? { kind: "STAFF", userId: oa.userId }, now: o.now ?? new Date(FX.TRIPS_AS_OF), locale: "th" });
  const setV = async (tenantId: string, who: Rec, changes: Rec[]) => { const r = await safeCall(() => SET.setSettings(who, { tenantId }, changes, { ackLegalWarn: true })); return r; };
  const ok = (r: Rec, what: string) => { if (r.ok !== true) throw new Error(`${what}: ${fmt(r)}`); return r.value; };
  // ─── unit A: prices/seasons/rules via services ───
  const pA = await mkProduct(tA, uA, { slug: "hunt5-same" });
  const pA2 = await mkProduct(tA, uA2, { slug: "hunt5-same-a2" });
  const pB = await mkProduct(tB, uB, { slug: "hunt5-same" });
  out("setup settings A", brief(await setV(tA, oa, [{ key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: uA, value: { registered: true, thresholdSatang: 180_000_000, warnAtPct: 90 } },
    { key: "trips.pay.depositPct", scope: "UNIT", scopeId: uA, value: 30 }, { key: "trips.pay.balanceDueDaysBefore", scope: "UNIT", scopeId: uA, value: 14 },
    { key: "trips.cancel.ladder", scope: "UNIT", scopeId: uA, value: [{ fromDaysBefore: 30, refundPct: 100 }, { fromDaysBefore: 15, refundPct: 50 }, { fromDaysBefore: 0, refundPct: 0 }] }])));
  const sMain = ok(await T.saveSeason(C(uA), { name: "หลัก", dateStart: "2026-11-01", dateEnd: "2027-04-30", priority: 0 }), "season main").id;
  const sNy = ok(await T.saveSeason(C(uA), { name: "ปีใหม่", dateStart: "2026-12-20", dateEnd: "2027-01-05", priority: 10 }), "season ny").id;
  const dates = ["2026-11-20", "2026-11-28", "2026-12-05", "2026-12-12", "2026-12-24", "2026-12-31", "2027-01-03", "2027-01-15", "2027-02-14", "2027-03-01", "2027-03-20", "2027-04-30", "2027-05-01", "2027-06-15"];
  const deps: Record<string, string> = {};
  for (const d of dates) deps[d] = await mkDep(pA, d);
  const priceIds: string[] = [];
  for (const [pax, amt, extra] of [["ADULT", 350_000, {}], ["INFANT", 0, {}], ["ADULT", 360_000, { seasonId: sMain }], ["ADULT", 390_000, { seasonId: sNy }], ["CHILD", 280_000, { seasonId: sNy }], ["ADULT", 450_000, { departureId: deps["2026-12-31"] }]] as [string, number, Rec][]) {
    priceIds.push(ok(await T.setPrice(C(uA), { productId: pA.id, paxTypeId: pA.pt[pax], currency: "THB", amountMinor: amt, ...extra }), `price ${pax}`).id);
  }
  const rule = async (kind: string, params: Rec, o: Rec = {}) => ok(await T.savePriceRule(C(uA), { kind, params: { kind, ...params }, ...o }), `rule ${kind}`).id;
  const rEB = await rule("EARLY_BIRD", { minDaysBefore: 30, discountBp: 1000 });
  const rGT = await rule("GROUP_TIER", { tiers: [{ minPax: 6, discountBp: 500 }, { minPax: 10, discountBp: 800 }] });
  const rFL = await rule("FREE_LEADER", { everyPaid: 10, freeQty: 1, paxTypeCode: "ADULT" });
  const rBO = await rule("BLACKOUT", { dates: ["2027-02-14"], ranges: [] });
  const rPC = await rule("PROMO_CODE", { code: "hunt10", discountBp: 1000, maxUses: 100 });
  const rPA = await rule("PROMO_CODE", { code: "HUNTAMT", discountMinor: 50_000 });
  out("setup A", { sMain, sNy, prices: priceIds.length, rules: [rEB, rGT, rFL, rBO, rPC, rPA].length });

  // ─── 3. 200 bookings: quote + snapshot + recompute ───
  type Bk = { ctx: Rec; line: Rec; quote: Rec; snapJson: string; resJson: string; quoteId: string };
  const bks: Bk[] = [];
  const recAll = (snap: Rec): Rec => {
    const rc = (ev: Rec) => { try { return T.recomputeFromSnapshot(snap, ev); } catch (e) { return { THROW: (e as Error).message }; } };
    const seatRefs: Rec = {}; for (const l of snap.lines) if (l.kind === "SEAT") seatRefs[l.itemRef] = Math.floor(l.qty / 2);
    const tv = snap.travel.localDate;
    return { totals: rc({ kind: "TOTALS" }), sched: rc({ kind: "SCHEDULE" }), comm: rc({ kind: "COMMISSION" }), commHalf: rc({ kind: "COMMISSION", remainingQtyByItemRef: seatRefs }),
      c40: rc({ kind: "CANCEL", at: `${addD(tv, -40)}T10:00:00+07:00`, reasonKind: "CUSTOMER" }), c20: rc({ kind: "CANCEL", at: `${addD(tv, -20)}T23:59:59+07:00`, reasonKind: "CUSTOMER" }),
      c1: rc({ kind: "CANCEL", at: `${addD(tv, -1)}T00:00:00+07:00`, reasonKind: "CUSTOMER", paidSatang: snap.paymentSchedule[0].amountSatang }), ext: rc({ kind: "CANCEL", at: `${addD(tv, -3)}T12:00:00+07:00`, reasonKind: "EXTERNAL", deductionsSatang: 1234 }) };
  };
  let snapMismatch = 0, policyKeyCounts = new Set<number>();
  for (let i = 0; i < 200; i++) {
    const d = pick(dates);
    const nowD = addD(d, -ri(2, 60));
    const now = BKK(nowD < "2026-11-12" ? "2026-11-12" : nowD, `${String(ri(0, 23)).padStart(2, "0")}:${String(ri(0, 59)).padStart(2, "0")}`);
    const agent = rnd() < 0.3;
    const ctx = C(uA, { now, ...(agent ? { ch: "AGENT_PORTAL", actor: { kind: "AGENT", agentAccountId: "ag-hunt5" } } : {}) });
    const pax = [{ paxTypeId: pA.pt.ADULT, qty: ri(1, 14) }, ...(rnd() < 0.5 ? [{ paxTypeId: pA.pt.CHILD, qty: ri(1, 3) }] : []), ...(rnd() < 0.2 ? [{ paxTypeId: pA.pt.INFANT, qty: 1 }] : [])];
    const line: Rec = { productKind: "TRIP", unitId: uA, productId: pA.id, slotId: deps[d], pax, extras: rnd() < 0.5 ? [{ extraId: pA.cam, qty: ri(1, 2) }] : [], ...(rnd() < 0.4 ? { promoCode: pick(["hunt10", "HUNTAMT", " Hunt10 "]) } : {}) };
    const opts = agent && rnd() < 0.3 ? { agentDiscountSatang: ri(0, 20_000) } : {};
    const qr = await T.quoteTripLine(ctx, line, opts);
    if (qr.ok !== true) { out("quote-fail", i, brief(qr)); continue; }
    const sr = await T.buildTripBookingSnapshot(ctx, line, qr.value, opts);
    if (sr.ok !== true) { out("snap-fail", i, brief(sr)); continue; }
    const snapJson = JSON.stringify(sr.value);
    const snap = JSON.parse(snapJson);
    policyKeyCounts.add(Object.keys(snap.policy.trips.values).length);
    if (!isDeepStrictEqual(snap.totals, qr.value.totals)) snapMismatch++;
    const qt = await T.quoteTrips(ctx, { lines: [line], ...(opts.agentDiscountSatang ? { agentDiscountSatang: opts.agentDiscountSatang } : {}) });
    bks.push({ ctx, line, quote: qr.value, snapJson, resJson: JSON.stringify(recAll(snap)), quoteId: qt.ok ? qt.value.quoteId : "" });
  }
  out("3-built", { bookings: bks.length, snapTotalsVsQuoteMismatch: snapMismatch, policyKeyCounts: [...policyKeyCounts], withCommission: bks.filter((b) => b.quote.commission).length, withPromo: bks.filter((b) => b.quote.promo).length, withFree: bks.filter((b) => b.quote.items.some((x: Rec) => x.itemRef.endsWith(":free"))).length });
  // internal consistency of recompute vs quote at booking time
  let commNe = 0;
  for (const b of bks) { const r = JSON.parse(b.resJson); if (b.quote.commission && (r.comm.value.commissionSatang !== b.quote.commission.commissionSatang || r.comm.value.remitToShopSatang !== b.quote.commission.remitToShopSatang)) commNe++; }
  out("3-recompute COMMISSION ≠ quoted at booking time", commNe);

  // ─── mutate EVERYTHING live ───
  const mut: Rec = {};
  for (const id of priceIds) { const row = (await q(`SELECT * FROM "TripPrice" WHERE id=$1`, [id]))[0]; mut[`price ${id.slice(-6)}`] = brief(await T.setPrice(C(uA), { productId: pA.id, paxTypeId: row.paxTypeId, seasonId: row.seasonId, departureId: row.departureId, currency: "THB", amountMinor: row.amountMinor + 77_700 })); }
  mut.seasonNy = brief(await T.saveSeason(C(uA), { id: sNy, name: "ปีใหม่2", dateStart: "2026-12-01", dateEnd: "2027-01-31", priority: 20 }));
  mut.archiveMain = brief(await T.archiveSeason(C(uA), { id: sMain, reason: "ทดสอบการแก้ทุกอย่างหลังจอง" }));
  mut.ruleEB = brief(await T.savePriceRule(C(uA), { id: rEB, kind: "EARLY_BIRD", params: { kind: "EARLY_BIRD", minDaysBefore: 1, discountBp: 5000 } }));
  mut.ruleFL = brief(await T.savePriceRule(C(uA), { id: rFL, kind: "FREE_LEADER", params: { kind: "FREE_LEADER", everyPaid: 2, freeQty: 1, paxTypeCode: "ADULT" } }));
  mut.ruleGToff = brief(await T.setPriceRuleActive(C(uA), { id: rGT, active: false }));
  mut.rulePCchange = brief(await T.savePriceRule(C(uA), { id: rPC, kind: "PROMO_CODE", params: { kind: "PROMO_CODE", code: "HUNT10", discountBp: 9000 } }));
  mut.ruleBO = brief(await T.savePriceRule(C(uA), { id: rBO, kind: "BLACKOUT", params: { kind: "BLACKOUT", dates: dates, ranges: [] } }));
  const getV = async (key: string) => (await SET.resolveSetting({ tenantId: tA }, key, { unitId: uA }))?.value;
  const park = await getV("trips.parkFee.table"), lineDef = await getV("trips.line.defaults"), vatRate = await getV("trips.tax.vatRate");
  const changes: Rec[] = [
    ["trips.tax.vatRate", { ...vatRate, rateBp: 1000 }], ["trips.tax.priceIncludesVat", false], ["trips.tax.vatRegistered", { registered: false, thresholdSatang: 180_000_000, warnAtPct: 90 }],
    ["trips.cancel.ladder", [{ fromDaysBefore: 0, refundPct: 100 }]], ["trips.cancel.shopCancelRefund", { EXTERNAL: 10, MIN_NOT_MET: 10, SHOP_FAULT: 10 }], ["trips.pay.depositPct", 50], ["trips.pay.depositBase", "ALL_LINES"],
    ["trips.pay.balanceDueDaysBefore", 3], ["trips.pax.childPricePct", 50], ["trips.line.defaults", { ...lineDef, EQUIPMENT: { ...lineDef.EQUIPMENT, commissionPct: 5 } }],
    ["trips.parkFee.table", { ...park, groups: park.groups.map((g: Rec) => ({ ...g, foreignAdultSatang: g.foreignAdultSatang + 1 })) }], ["trips.sell.holdMinutes", 99], ["trips.price.manualOverrideApprovalPct", 50],
    ["trips.price.costWarnMarginPct", 20], ["trips.cancel.refundForm", "CREDIT"], ["trips.pax.childAgeBand", null], ["trips.tax.cancelFeeVat", "SERVICE_WITH_VAT"],
  ].map(([key, value]) => ({ key, scope: "UNIT", scopeId: uA, value }));
  for (const ch of changes) { if (ch.key === "trips.pax.childAgeBand") continue; const r = await setV(tA, oa, [ch]); mut[`set ${ch.key}`] = r.ok === true ? "ok" : brief(r); }
  await q(`UPDATE "TripExtra" SET "paxPrices" = '{"ADULT":99900,"CHILD":11100}'::jsonb, "priceMinor" = 99900 WHERE id = $1`, [pA.park]);
  await q(`UPDATE "TripExtra" SET "priceMinor" = 123400, "commissionable" = false, "taxKind" = 'EXEMPT' WHERE id = $1`, [pA.cam]);
  await q(`UPDATE "TripPaxType" SET "countsCapacity" = false WHERE id = $1`, [pA.pt.CHILD]);
  agencyNow = AGENCY(2000, 100, "EXCLUSIVE");
  out("mutations", mut);

  // fresh quotes must differ
  let freshSame = 0, freshDiff = 0, idSame = 0;
  for (const b of bks.slice(0, 40)) {
    const qr = await T.quoteTripLine(b.ctx, b.line, {});
    const qt = await T.quoteTrips(b.ctx, { lines: [b.line] });
    if (qr.ok && isDeepStrictEqual(qr.value.totals, b.quote.totals)) freshSame++; else freshDiff++;
    if (qt.ok && qt.value.quoteId === b.quoteId) idSame++;
  }
  out("3-fresh quote after mutations", { differ: freshDiff, same: freshSame, quoteIdSame: idSame });
  // archive product (raw — T0.2 archive service requires confirm; also try service)
  const arch = await safeCall(() => T.archiveProduct({ tenantId: tA, actorUserId: oa.userId }, { unitId: uA, productId: pA.id, confirm: true, reason: "hunt5 archive after bookings" }));
  if (arch.ok !== true) await q(`UPDATE "TripProduct" SET status='ARCHIVED' WHERE id=$1`, [pA.id]);
  out("archive product", brief(arch), "quote now", brief(await T.quoteTripLine(bks[0].ctx, bks[0].line, {})));
  // recompute every stored snapshot
  let same = 0; const diffs: string[] = [];
  for (const b of bks) { const r = JSON.stringify(recAll(JSON.parse(b.snapJson))); if (r === b.resJson) same++; else diffs.push(`${b.resJson.slice(0, 200)} → ${r.slice(0, 200)}`); }
  out("3-recompute after mutating everything: byte-identical", `${same}/${bks.length}`, diffs.slice(0, 2));
  if (same !== bks.length) F(`snapshot recompute changed after live mutation (${bks.length - same})`);
  // one-field mutation of a stored snapshot
  { const b = bks.find((x) => x.quote.commission) ?? bks[0]; const s = JSON.parse(b.snapJson); const r0 = JSON.parse(b.resJson);
    s.lines[0].amountSatang += 10_000;
    const r1 = recAll(s);
    const changed = Object.keys(r0).filter((k) => JSON.stringify(r0[k]) !== JSON.stringify(r1[k]));
    out("3-one-field mutation lines[0].amountSatang+10000 ⇒ outputs changed", changed, { c40: [r0.c40.value?.refundSatang, r1.c40.value?.refundSatang], comm: [r0.comm.value?.commissionSatang, r1.comm.value?.commissionSatang], totals: [r0.totals.value.totals.payableSatang, r1.totals.value.totals.payableSatang] });
  }

  // ─── mock 15 + mock 03 on DB (unit A3) from snapshot alone ───
  const RF = FX.REFUND_TR_0188, LB = FX.BOOKING_LB_0031, SIM = FX.TRIP_SIMILAN;
  out("setup A3", brief(await setV(tA, oa, [{ key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: uA3, value: { registered: true, thresholdSatang: 180_000_000, warnAtPct: 90 } },
    { key: "trips.cancel.ladder", scope: "UNIT", scopeId: uA3, value: [{ fromDaysBefore: 30, refundPct: 100 }, { fromDaysBefore: 15, refundPct: 50 }, { fromDaysBefore: 0, refundPct: 0 }] },
    { key: "trips.general.currencies", scope: "UNIT", scopeId: uA3, value: ["THB"] }])));
  const pR = await mkProduct(tA, uA3);
  ok(await T.setPrice(C(uA3), { productId: pR.id, paxTypeId: pR.pt.ADULT, currency: "THB", amountMinor: FX.PRODUCT_RACHA.adultSatang }), "racha price");
  const d15 = await mkDep(pR, RF.travelDate);
  const ctx15 = C(uA3, { now: BKK(RF.bookedOn, "12:00") });
  const line15 = { productKind: "TRIP", unitId: uA3, productId: pR.id, slotId: d15, pax: [{ paxTypeId: pR.pt.ADULT, qty: 2 }, { paxTypeId: pR.pt.CHILD, qty: 1 }], extras: [{ extraId: pR.cam, qty: 1 }] };
  const q15 = ok(await T.quoteTripLine(ctx15, line15, {}), "q15");
  const s15 = ok(await T.buildTripBookingSnapshot(ctx15, line15, q15, {}), "s15");
  const pL = await mkProduct(tA, uA3, { type: "LIVEABOARD", park: [SIM.parkPerPersonSatang, SIM.parkPerPersonSatang], nights: SIM.nights });
  out("setup LB settings (product scope)", brief(await setV(tA, oa, [{ key: "trips.pay.depositPct", scope: "PRODUCT", scopeId: pL.id, value: SIM.depositBp / 100 }, { key: "trips.pay.balanceDueDaysBefore", scope: "PRODUCT", scopeId: pL.id, value: SIM.balanceDaysBefore }])));
  ok(await T.setPrice(C(uA3), { productId: pL.id, paxTypeId: pL.pt.ADULT, currency: "THB", amountMinor: LB.cabinPerPersonSatang }), "lb price");
  const dL = await mkDep(pL, SIM.start, "18:00");
  const ctxL = C(uA3, { now: BKK(LB.bookedOn, "12:00") });
  const lineL = { productKind: "TRIP", unitId: uA3, productId: pL.id, slotId: dL, pax: [{ paxTypeId: pL.pt.ADULT, qty: 2 }], extras: [] };
  const qL = ok(await T.quoteTripLine(ctxL, lineL, {}), "qL");
  const sL = ok(await T.buildTripBookingSnapshot(ctxL, lineL, qL, {}), "sL");
  const m15 = () => T.recomputeFromSnapshot(JSON.parse(JSON.stringify(s15)), { kind: "CANCEL", at: RF.requestedAt, reasonKind: "CUSTOMER" }).value;
  const mL = () => T.recomputeFromSnapshot(JSON.parse(JSON.stringify(sL)), { kind: "SCHEDULE" }).value.paymentSchedule.map((x: Rec) => [x.kind, x.amountSatang, x.vatableSatang, x.passThroughSatang, x.dueAt]);
  const mLc = () => T.recomputeFromSnapshot(JSON.parse(JSON.stringify(sL)), { kind: "CANCEL", at: `${LB.bookedOn}T13:00:00+07:00`, reasonKind: "CUSTOMER", paidSatang: LB.depositSatang }).value;
  const before = JSON.stringify([m15(), mL(), mLc()]);
  out("mock15", { payable: q15.totals.payableSatang, refund: m15().refundSatang, kept: m15().keptSatang, refundVat: m15().refundVatSatang, keptVat: m15().keptVatSatang, daysBefore: m15().daysBefore, want: [RF.refundSatang, RF.keptSatang] });
  out("mock03", { payable: qL.totals.payableSatang, sched: mL(), want: [LB.depositSatang, LB.balanceSatang, LB.balanceDue], cancelDeposit: { refund: mLc().refundSatang, kept: mLc().keptSatang } });
  // change A3 settings + prices, then recompute again
  await setV(tA, oa, [{ key: "trips.cancel.ladder", scope: "UNIT", scopeId: uA3, value: [{ fromDaysBefore: 0, refundPct: 0 }] }, { key: "trips.pay.depositPct", scope: "PRODUCT", scopeId: pL.id, value: 90 }, { key: "trips.tax.priceIncludesVat", scope: "UNIT", scopeId: uA3, value: false }]);
  await q(`UPDATE "TripPrice" SET "amountMinor" = "amountMinor" * 2 WHERE "unitId" = $1`, [uA3]);
  await q(`UPDATE "TripProduct" SET status='ARCHIVED' WHERE "unitId" = $1`, [uA3]);
  out("mock15/03 after mutation identical", JSON.stringify([m15(), mL(), mLc()]) === before);

  // ─── 6. isolation ───
  const sA2 = ok(await T.saveSeason(C(uA2), { name: "หลัก", dateStart: "2026-11-01", dateEnd: "2027-04-30", priority: 0 }), "A2 season").id;
  ok(await T.setPrice(C(uA2), { productId: pA2.id, paxTypeId: pA2.pt.ADULT, currency: "THB", amountMinor: 111_100 }), "A2 price");
  const rA2 = ok(await T.savePriceRule(C(uA2), { kind: "PROMO_CODE", params: { kind: "PROMO_CODE", code: "HUNT10", discountBp: 100 } }), "A2 same code allowed").id;
  const pAx = await mkProduct(tA, uA, { slug: "hunt5-iso" }); // fresh active product in A for isolation targets
  const pidA = ok(await T.setPrice(C(uA), { productId: pAx.id, paxTypeId: pAx.pt.ADULT, currency: "THB", amountMinor: 999_900 }), "Ax price").id;
  const sA = ok(await T.saveSeason(C(uA), { name: "iso", dateStart: "2028-01-01", dateEnd: "2028-01-31", priority: 3 }), "iso season").id;
  const rA = ok(await T.savePriceRule(C(uA), { kind: "PROMO_CODE", params: { kind: "PROMO_CODE", code: "ISOA", discountBp: 9900 } }), "iso rule").id;
  const depA = await mkDep(pAx, "2027-03-01");
  const fp = async () => JSON.stringify(await q(`SELECT 'p' k, id, "amountMinor"::text v, "updatedAt"::text u FROM "TripPrice" WHERE "unitId"=$1 UNION ALL SELECT 's', id, status||priority, "updatedAt"::text FROM "TripSeason" WHERE "unitId"=$1 UNION ALL SELECT 'r', id, active::text||"usedCount", "updatedAt"::text FROM "TripPriceRule" WHERE "unitId"=$1 UNION ALL SELECT 'x', id, status, '' FROM "TripPromoRedemption" WHERE "unitId"=$1 ORDER BY 1,2`, [uA]));
  const before6 = await fp();
  const iso: Rec = {};
  for (const [tag, ctx] of [["B", C(uB, { tenant: tB, actor: { kind: "STAFF", userId: ob.userId } })], ["A2", C(uA2)], ["B-with-A-unitId", C(uA, { tenant: tB, actor: { kind: "STAFF", userId: ob.userId } })]] as [string, Rec][]) {
    const lineA = { productKind: "TRIP", unitId: ctx.unitId, productId: pAx.id, slotId: depA, pax: [{ paxTypeId: pAx.pt.ADULT, qty: 1 }] };
    const r: Rec = {
      listPrices: await safeCall(() => T.listPrices(ctx, { productId: pAx.id })), setPrice: await safeCall(() => T.setPrice(ctx, { productId: pAx.id, currency: "THB", amountMinor: 1 })),
      removePrice: await safeCall(() => T.removePrice(ctx, { id: pidA, reason: "ลบข้ามหน่วยทดสอบ hunt5" })), saveSeasonEdit: await safeCall(() => T.saveSeason(ctx, { id: sA, name: "x", dateStart: "2028-01-01", dateEnd: "2028-01-02" })),
      archiveSeason: await safeCall(() => T.archiveSeason(ctx, { id: sA, reason: "ข้ามหน่วยทดสอบ hunt5" })), savePriceRuleEdit: await safeCall(() => T.savePriceRule(ctx, { id: rA, kind: "PROMO_CODE", params: { kind: "PROMO_CODE", code: "ISOA", discountBp: 1 } })),
      savePriceRuleOnProduct: await safeCall(() => T.savePriceRule(ctx, { productId: pAx.id, kind: "BLACKOUT", params: { kind: "BLACKOUT", dates: [], ranges: [] } })),
      setPriceRuleActive: await safeCall(() => T.setPriceRuleActive(ctx, { id: rA, active: false, reason: "ข้ามหน่วยทดสอบ hunt5" })), setPriceSeasonRef: await safeCall(() => T.setPrice(ctx, { productId: tag === "A2" ? pA2.id : pB.id, seasonId: sA, currency: "THB", amountMinor: 5 })),
      quoteTripLine: await safeCall(() => T.quoteTripLine(ctx, lineA, {})), quoteTrips: await safeCall(() => T.quoteTrips(ctx, { lines: [lineA] })), loadPricingInput: await safeCall(() => T.loadPricingInput(ctx, lineA, {})),
      buildSnapshot: await safeCall(() => T.buildTripBookingSnapshot(ctx, lineA, bks[0].quote, {})), sellableQuote: await safeCall(() => T.tripSellable.quote(ctx, { lines: [lineA] })),
      redeem: await safeCall(() => DB.tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId }).$transaction((tx: unknown) => T.redeemPromoInTx(tx, ctx, { ruleId: rA, contactKey: "c@x", bookingId: rid("bk"), discountSatang: 1 }))),
      release: await safeCall(() => DB.tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId }).$transaction((tx: unknown) => T.releasePromoInTx(tx, ctx, { bookingId: "any" }))),
    };
    iso[tag] = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.ok === true ? { ok: true, v: fmt(v.value).slice(0, 80) } : { code: v.code, msg: String(v.messageTh ?? v.message ?? v.e ?? "").slice(0, 50), reason: v.details?.reason }]));
  }
  out("6-isolation", iso);
  const msgs = new Set<string>(); for (const t of Object.values(iso)) for (const [k, v] of Object.entries(t as Rec)) if (!["release"].includes(k)) msgs.add(`${(v as Rec).code}|${(v as Rec).msg}`);
  out("6-distinct outcomes", [...msgs]);
  out("6-unit A unchanged", (await fp()) === before6);
  // quote in A2 must not pick A's prices/seasons/codes (same slug/code)
  const dA2 = await mkDep(pA2, "2027-03-01");
  const qa2 = await T.quoteTripLine(C(uA2), { productKind: "TRIP", unitId: uA2, productId: pA2.id, slotId: dA2, pax: [{ paxTypeId: pA2.pt.ADULT, qty: 1 }], promoCode: "ISOA" }, {});
  out("6-A2 quote (A2 price 1,111 · A code ISOA 99% must not apply)", qa2.ok ? { unit: qa2.value.items[0].unitMinor, src: qa2.value.items[0].priceSource, promo: qa2.value.promo, warn: qa2.value.warnings.map((w: Rec) => w.code) } : brief(qa2));
  const qa2b = await T.quoteTripLine(C(uA2), { productKind: "TRIP", unitId: uA2, productId: pA2.id, slotId: dA2, pax: [{ paxTypeId: pA2.pt.ADULT, qty: 1 }], promoCode: "hunt10" }, {});
  out("6-A2 quote with own HUNT10 (1%)", qa2b.ok ? { promo: qa2b.value.promo, rA2 } : brief(qa2b));
  out("6-listSeasons A2 / B", (await T.listSeasons(C(uA2), {})).value?.map((s: Rec) => s.id === sA2), (await T.listSeasons(C(uB, { tenant: tB, actor: { kind: "STAFF", userId: ob.userId } }), {})).value);

  // ─── 8. sellable vs quoteTrips ───
  const pS = await mkProduct(tA, uA2); ok(await T.setPrice(C(uA2), { productId: pS.id, paxTypeId: pS.pt.ADULT, currency: "THB", amountMinor: 222_200 }), "pS");
  const dS = await mkDep(pS, "2027-03-02");
  const reqS = { lines: [{ productKind: "TRIP", unitId: uA2, productId: pS.id, slotId: dS, pax: [{ paxTypeId: pS.pt.ADULT, qty: 3 }], extras: [{ extraId: pS.cam, qty: 1 }], promoCode: "hunt10" }, { productKind: "TRIP", unitId: uA2, productId: pA2.id, slotId: dA2, pax: [{ paxTypeId: pA2.pt.ADULT, qty: 1 }] }] };
  const a = await T.tripSellable.quote(C(uA2), reqS), b = await T.quoteTrips(C(uA2), reqS);
  out("8-sellable.quote ≡ quoteTrips", isDeepStrictEqual(a, b), a.ok ? { id: a.value.quoteId.slice(0, 12), payable: a.value.totals.payable } : brief(a));
  const stubs: Rec = {};
  for (const k of ["availability", "hold", "confirm", "cancel", "reserveInTx", "finalizeInTx", "capacityRowsOf"]) stubs[k] = await safeCall(() => T.tripSellable[k](C(uA2), {}));
  out("8-stubs", Object.fromEntries(Object.entries(stubs).map(([k, v]) => [k, Array.isArray(v) ? `array(${(v as unknown[]).length})` : v.ok === false ? v.code : fmt(v).slice(0, 60)])));
  out("8-sellable.quote with opts smuggled (3rd arg overrides) ignored?", brief(await safeCall(() => (T.tripSellable.quote as (...x: unknown[]) => unknown)(C(uA2), reqS, { overrides: [{ itemRef: "seat:ADULT", unitMinor: 1, reason: "xxxxxxxxxxxxxxxx" }], canOverride: true }))));

  // ─── 7. adversarial service input ───
  const L0 = { productKind: "TRIP", unitId: uA2, productId: pS.id, slotId: dS, pax: [{ paxTypeId: pS.pt.ADULT, qty: 1 }] };
  const adv: [string, () => unknown][] = [
    ["quote qty 2^31", () => T.quoteTripLine(C(uA2), { ...L0, pax: [{ paxTypeId: pS.pt.ADULT, qty: 2 ** 31 }] })],
    ["quote qty NaN", () => T.quoteTripLine(C(uA2), { ...L0, pax: [{ paxTypeId: pS.pt.ADULT, qty: NaN }] })],
    ["quote qty '1'", () => T.quoteTripLine(C(uA2), { ...L0, pax: [{ paxTypeId: pS.pt.ADULT, qty: "1" }] })],
    ["quote 50×100000 pax", () => T.quoteTripLine(C(uA2), { ...L0, pax: Array.from({ length: 50 }, () => ({ paxTypeId: pS.pt.ADULT, qty: 100_000 })) })],
    ["quote pax of other product", () => T.quoteTripLine(C(uA2), { ...L0, pax: [{ paxTypeId: pA2.pt.ADULT, qty: 1 }] })],
    ["quote extra unknown", () => T.quoteTripLine(C(uA2), { ...L0, extras: [{ extraId: "nope", qty: 1 }] })],
    ["quote extra of other product", () => T.quoteTripLine(C(uA2), { ...L0, extras: [{ extraId: pA2.cam, qty: 1 }] })],
    ["quote pickup unknown", () => T.quoteTripLine(C(uA2), { ...L0, pickupZoneId: "nope" })],
    ["quote promo zero-width", () => T.quoteTripLine(C(uA2), { ...L0, promoCode: "HUN​T10" })],
    ["quote promo 64 emoji", () => T.quoteTripLine(C(uA2), { ...L0, promoCode: "🐠".repeat(32) })],
    ["quote promo 65 chars", () => T.quoteTripLine(C(uA2), { ...L0, promoCode: "A".repeat(65) })],
    ["quote currency usd lower", () => T.quoteTripLine(C(uA2), { ...L0, currency: "usd" })],
    ["quote currency USD on TOUR", () => T.quoteTripLine(C(uA2), { ...L0, currency: "USD" })],
    ["quote slot of other product", () => T.quoteTripLine(C(uA2), { ...L0, slotId: dA2 })],
    ["quote extra key", () => T.quoteTripLine(C(uA2), { ...L0, evil: 1 })],
    ["quote __proto__ key", () => T.quoteTripLine(C(uA2), JSON.parse(JSON.stringify(L0).replace("{", '{"__proto__":{"unitId":"x"},')))],
    ["quote ctx.now invalid Date", () => T.quoteTripLine({ ...C(uA2), now: new Date("x") }, L0)],
    ["quote ctx.now year 9999", () => T.quoteTripLine({ ...C(uA2), now: new Date("9999-01-01T00:00:00Z") }, L0)],
    ["quote ctx.now year 1", () => T.quoteTripLine({ ...C(uA2), now: new Date("0001-01-01T00:00:00Z") }, L0)],
    ["quote opts overrides non-array", () => T.quoteTripLine(C(uA2), L0, { overrides: "x" })],
    ["quote opts agentDiscount -1", () => T.quoteTripLine(C(uA2), L0, { agentDiscountSatang: -1 })],
    ["quote PUBLIC ctx on DRAFT product", async () => { await q(`UPDATE "TripProduct" SET status='DRAFT' WHERE id=$1`, [pS.id]); const r = await T.quoteTripLine({ ...C(uA2), actor: { kind: "PUBLIC" } }, L0); await q(`UPDATE "TripProduct" SET status='ACTIVE' WHERE id=$1`, [pS.id]); return r; }],
    ["quoteTrips 21 lines", () => T.quoteTrips(C(uA2), { lines: Array.from({ length: 21 }, () => L0) })],
    ["quoteTrips lines []", () => T.quoteTrips(C(uA2), { lines: [] })],
    ["quoteTrips null", () => T.quoteTrips(C(uA2), null)],
    ["quoteTrips line null", () => T.quoteTrips(C(uA2), { lines: [null] })],
    ["setPrice amount 2^31", () => T.setPrice(C(uA2), { productId: pS.id, currency: "THB", amountMinor: 2 ** 31 })],
    ["setPrice amount NaN", () => T.setPrice(C(uA2), { productId: pS.id, currency: "THB", amountMinor: NaN })],
    ["setPrice weekdayMask 128", () => T.setPrice(C(uA2), { productId: pS.id, currency: "THB", amountMinor: 1, weekdayMask: 128 })],
    ["setPrice priority 2^31", () => T.setPrice(C(uA2), { productId: pS.id, currency: "THB", amountMinor: 1, priority: 2 ** 31 })],
    ["setPrice bookFrom 0001-01-01", () => T.setPrice(C(uA2), { productId: pS.id, currency: "THB", amountMinor: 1, bookFrom: "0001-01-01", priority: -5 })],
    ["setPrice travelTo 9999-12-31", () => T.setPrice(C(uA2), { productId: pS.id, currency: "THB", amountMinor: 1, travelTo: "9999-12-31", priority: -5 })],
    ["setPrice date 2027-02-30", () => T.setPrice(C(uA2), { productId: pS.id, currency: "THB", amountMinor: 1, travelFrom: "2027-02-30" })],
    ["setPrice cabinTypeId bogus", () => T.setPrice(C(uA2), { productId: pS.id, currency: "THB", amountMinor: 1, cabinTypeId: "bogus-cabin", priority: -6 })],
    ["setPrice optionId of other product", () => T.setPrice(C(uA2), { productId: pS.id, currency: "THB", amountMinor: 1, optionId: pA2.opt })],
    ["setPrice paxType of other product", () => T.setPrice(C(uA2), { productId: pS.id, currency: "THB", amountMinor: 1, paxTypeId: pA2.pt.ADULT })],
    ["setPrice departure of other product", () => T.setPrice(C(uA2), { productId: pS.id, currency: "THB", amountMinor: 1, departureId: dA2 })],
    ["setPrice extra key", () => T.setPrice(C(uA2), { productId: pS.id, currency: "THB", amountMinor: 1, tenantId: tB })],
    ["setPrice PUBLIC actor", () => T.setPrice({ ...C(uA2), actor: { kind: "PUBLIC" } }, { productId: pS.id, currency: "THB", amountMinor: 1 })],
    ["saveSeason name 10k", () => T.saveSeason(C(uA2), { name: "x".repeat(10_000), dateStart: "2029-01-01", dateEnd: "2029-01-02" })],
    ["saveSeason priority NaN", () => T.saveSeason(C(uA2), { name: "x", dateStart: "2029-01-01", dateEnd: "2029-01-02", priority: NaN })],
    ["saveSeason 0001→9999", () => T.saveSeason(C(uA2), { name: "all-time", dateStart: "0001-01-01", dateEnd: "9999-12-31", priority: -999 })],
    ["savePriceRule maxUses 3e9", () => T.savePriceRule(C(uA2), { kind: "PROMO_CODE", params: { kind: "PROMO_CODE", code: "BIGMAX", discountBp: 100, maxUses: 3_000_000_000 } })],
    ["savePriceRule perContact 3e9", () => T.savePriceRule(C(uA2), { kind: "PROMO_CODE", params: { kind: "PROMO_CODE", code: "BIGPER", discountBp: 100, perContact: 3_000_000_000 } })],
    ["savePriceRule minDaysBefore 2^53", () => T.savePriceRule(C(uA2), { kind: "EARLY_BIRD", params: { kind: "EARLY_BIRD", minDaysBefore: 2 ** 53 - 1, discountBp: 100 } })],
    ["savePriceRule discountMinor 2^53", () => T.savePriceRule(C(uA2), { kind: "EARLY_BIRD", params: { kind: "EARLY_BIRD", minDaysBefore: 999999, discountMinor: 2 ** 53 - 1 } })],
    ["savePriceRule code zero-width", () => T.savePriceRule(C(uA2), { kind: "PROMO_CODE", params: { kind: "PROMO_CODE", code: "AB​C", discountBp: 1 } })],
    ["savePriceRule code ' abc ' (trim+upper)", () => T.savePriceRule(C(uA2), { kind: "PROMO_CODE", params: { kind: "PROMO_CODE", code: " abc ", discountBp: 1 } })],
    ["savePriceRule code 'ß' (upper→SS)", () => T.savePriceRule(C(uA2), { kind: "PROMO_CODE", params: { kind: "PROMO_CODE", code: "straße", discountBp: 1 } })],
    ["savePriceRule code 33 chars", () => T.savePriceRule(C(uA2), { kind: "PROMO_CODE", params: { kind: "PROMO_CODE", code: "A".repeat(33), discountBp: 1 } })],
    ["savePriceRule params __proto__", () => T.savePriceRule(C(uA2), { kind: "BLACKOUT", params: JSON.parse('{"kind":"BLACKOUT","dates":[],"ranges":[],"__proto__":{"x":1}}') })],
    ["savePriceRule params null", () => T.savePriceRule(C(uA2), { kind: "BLACKOUT", params: null })],
    ["savePriceRule productId ARCHIVED product", () => T.savePriceRule(C(uA2), { productId: pA2.id === "" ? "" : (bks.length ? pA.id : ""), kind: "BLACKOUT", params: { kind: "BLACKOUT", dates: [], ranges: [] } })],
    ["savePriceRule bookFrom > bookTo", () => T.savePriceRule(C(uA2), { kind: "BLACKOUT", params: { kind: "BLACKOUT", dates: [], ranges: [] }, bookFrom: "2027-02-02", bookTo: "2027-02-01" })],
    ["removePrice reason 10 zero-width", () => T.removePrice(C(uA2), { id: "nope", reason: "​".repeat(10) })],
    ["archiveSeason reason 10 zero-width (referenced)", async () => { const s = (await T.saveSeason(C(uA2), { name: "zw", dateStart: "2030-01-01", dateEnd: "2030-01-02", priority: 77 })).value.id; await T.setPrice(C(uA2), { productId: pS.id, seasonId: s, currency: "THB", amountMinor: 1 }); return T.archiveSeason(C(uA2), { id: s, reason: "​".repeat(10) }); }],
    ["listSeasons input 'x'", () => T.listSeasons(C(uA2), "x")],
    ["ctx null", () => T.setPrice(null, { productId: pS.id, currency: "THB", amountMinor: 1 })],
    ["redeem discount NaN", () => DB.tenantDb({ tenantId: tA, unitId: uA2 }).$transaction((tx: unknown) => T.redeemPromoInTx(tx, C(uA2), { ruleId: rA2, contactKey: "x", bookingId: "b", discountSatang: NaN }))],
    ["redeem contactKey 201 chars", () => DB.tenantDb({ tenantId: tA, unitId: uA2 }).$transaction((tx: unknown) => T.redeemPromoInTx(tx, C(uA2), { ruleId: rA2, contactKey: "x".repeat(201), bookingId: "b", discountSatang: 1 }))],
  ];
  const advOut: Rec = {};
  for (const [k, f] of adv) { const r = await safeCall(f); advOut[k] = r.ok === true ? `OK ${fmt(r.value).slice(0, 90)}` : r.ok === false ? `${r.code}/${r.details?.reason ?? ""} ${String(r.messageTh ?? r.message ?? "").slice(0, 40)}` : `RAW ${r.ok} ${r.name} ${r.code ?? ""} ${String(r.e).slice(0, 140)}`; }
  for (const [k, v] of Object.entries(advOut)) out(`7 ${k}`, v);
  // follow-ups for big maxUses / perContact: redeem (raw ::int cast?)
  for (const code of ["BIGMAX", "BIGPER"]) {
    const row = (await q(`SELECT id FROM "TripPriceRule" WHERE "unitId"=$1 AND code=$2`, [uA2, code]))[0];
    if (!row) { out(`7 redeem ${code}`, "rule not stored"); continue; }
    const r = await safeCall(() => DB.tenantDb({ tenantId: tA, unitId: uA2 }).$transaction((tx: unknown) => T.redeemPromoInTx(tx, C(uA2), { ruleId: row.id, contactKey: "c1", bookingId: rid("bk"), discountSatang: 100 })));
    out(`7 redeem on ${code}`, r.ok === true ? "OK" : r.ok === false ? `${r.code}/${r.details?.reason}` : `RAW ${r.name} ${r.code ?? ""} ${String(r.e).slice(0, 160)}`);
  }
  out("findings", findings);
} catch (e) { console.log("FATAL", errMsgFull(e)); } finally { unreg(); await cleanup(); }
function errMsgFull(e: unknown) { return e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(0, 4).join("\n")}` : String(e); }
process.exit(0);
