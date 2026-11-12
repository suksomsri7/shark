// probe-trips-t0.5-race.mts — hunter T0.5 (untracked): promo redemption/release races + price/season/rule CRUD races + CURRENCY_LOCKED race,
// real parallel transactions on the lane QC DB. Temp tenants trips-hunt5-* removed in finally.
import { boot, cleanup, fmt, mkDep, mkOwner, mkProduct, mkTenant, mkUnit, out, q, rid, safeCall, type Rec } from "./probe-trips-t0.5-lib.mjs";

boot("probe-trips-t0.5-race");
const T = (await import("@/lib/modules/trips")) as Rec;
const SET = (await import("@/lib/core/settings")) as Rec;
const DB = (await import("@/lib/core/db")) as Rec;
const tally = (rs: Rec[]) => { const m: Rec = {}; for (const r of rs) { const k = r.ok === true ? (r.value?.replay ? "OK(replay)" : "OK") : r.ok === false ? `${r.code}/${r.details?.reason ?? ""}` : `RAW:${r.name}:${String(r.code ?? "")}:${String(r.e ?? "").slice(0, 80)}`; m[k] = (m[k] ?? 0) + 1; } return m; };
try {
  const tA = await mkTenant("r"); const uA = await mkUnit(tA, "r"); const uL = await mkUnit(tA, "rl"); const oa = await mkOwner(tA, "or");
  const C = (unit = uA): Rec => ({ tenantId: tA, unitId: unit, channel: "COUNTER", actor: { kind: "STAFF", userId: oa.userId }, now: new Date("2026-11-12T05:00:00Z"), locale: "th" });
  const inTx = async (body: (tx: unknown) => Promise<unknown>, unit = uA): Promise<Rec> => {
    try { return (await DB.tenantDb({ tenantId: tA, unitId: unit }).$transaction(body, { timeout: 60_000, maxWait: 60_000 })) as Rec; }
    catch (e) { const x = e as Rec; return x.name === "PricingAbort" ? { ok: false, code: x.code, details: x.details } : { ok: "RAW", name: x.name, code: x.code, e: String(x.message).replace(/\s+/g, " ").slice(0, 160) }; }
  };
  const redeem = (ruleId: string, contactKey: string, bookingId: string, d = 1000) => inTx((tx) => T.redeemPromoInTx(tx, C(), { ruleId, contactKey, bookingId, discountSatang: d }));
  const release = (bookingId: string) => inTx((tx) => T.releasePromoInTx(tx, C(), { bookingId }));
  const mkCode = async (code: string, extra: Rec = {}) => { const r = await T.savePriceRule(C(), { kind: "PROMO_CODE", params: { kind: "PROMO_CODE", code, discountBp: 1000, ...extra } }); if (r.ok !== true) throw new Error(`mkCode ${code} ${fmt(r)}`); return r.value.id as string; };
  const state = async (ruleId: string) => {
    const r = (await q(`SELECT "usedCount", active FROM "TripPriceRule" WHERE id=$1`, [ruleId]))[0];
    const a = (await q(`SELECT count(*) FILTER (WHERE status='ACTIVE')::int a, count(*)::int n FROM "TripPromoRedemption" WHERE "ruleId"=$1`, [ruleId]))[0];
    const ev = (await q(`SELECT type, count(*)::int n FROM "OutboxEvent" WHERE "tenantId"=$1 AND (payload->>'ruleId')=$2 GROUP BY type`, [tA, ruleId])).map((x) => `${x.type}=${x.n}`);
    return { usedCount: r.usedCount, active: r.active, activeRows: a.a, rows: a.n, events: ev };
  };

  // P1: 5 uses × 100 parallel distinct bookings
  const p1 = await mkCode("RACE5", { maxUses: 5 });
  out("P1 5 uses × 100 parallel", tally(await Promise.all(Array.from({ length: 100 }, (_, i) => redeem(p1, `c${i}@x`, `bk-p1-${i}`)))), await state(p1));
  // P2: perContact 1 × 20 parallel same contact (case/space variants) different bookings
  const p2 = await mkCode("RACEPC", { perContact: 1 });
  out("P2 perContact 1 × 20 same contact", tally(await Promise.all(Array.from({ length: 20 }, (_, i) => redeem(p2, i % 2 ? " Foo@X.com " : "foo@x.com", `bk-p2-${i}`)))), await state(p2));
  // P3: same booking twice/10× in parallel — (a) same contact, (b) different contacts
  const p3 = await mkCode("RACEBK", { maxUses: 100 });
  out("P3a same booking ×10 same contact", tally(await Promise.all(Array.from({ length: 10 }, () => redeem(p3, "same@x", "bk-p3-a")))), await state(p3));
  out("P3b same booking ×10 different contacts", tally(await Promise.all(Array.from({ length: 10 }, (_, i) => redeem(p3, `d${i}@x`, "bk-p3-b")))), await state(p3));
  // P4: release in parallel with new redemptions (maxUses 5) — 3 rounds
  const p4 = await mkCode("RACEREL", { maxUses: 5 });
  let n4 = 0;
  for (let round = 0; round < 3; round++) {
    const act = (await q(`SELECT "bookingId" FROM "TripPromoRedemption" WHERE "ruleId"=$1 AND status='ACTIVE'`, [p4])).map((x) => x.bookingId as string);
    const fill = await Promise.all(Array.from({ length: 5 - act.length }, () => redeem(p4, `f${n4}@x`, `bk-p4-${n4++}`)));
    const act2 = (await q(`SELECT "bookingId" FROM "TripPromoRedemption" WHERE "ruleId"=$1 AND status='ACTIVE'`, [p4])).map((x) => x.bookingId as string);
    const jobs: Promise<Rec>[] = [];
    for (const b of act2) { jobs.push(release(b)); jobs.push(release(b)); }
    for (let i = 0; i < 15; i++) jobs.push(redeem(p4, `n${n4}@x`, `bk-p4-${n4++}`));
    const rs = await Promise.all(jobs.sort(() => Math.random() - 0.5));
    const rel = rs.filter((r) => r.ok === true && "released" in (r.value ?? {})).reduce((s, r) => s + r.value.released, 0);
    out(`P4 round ${round} fill ${fill.length} · release×2 of ${act2.length} + 15 redeems`, tally(rs.filter((r) => !(r.ok === true && "released" in (r.value ?? {})))), { releasedTotal: rel }, await state(p4));
  }
  // P5: deactivate mid-flight
  const p5 = await mkCode("RACEOFF", { maxUses: 50 });
  const jobs5: Promise<Rec>[] = Array.from({ length: 40 }, (_, i) => redeem(p5, `o${i}@x`, `bk-p5-${i}`));
  jobs5.splice(15, 0, (async () => { const r = await T.setPriceRuleActive(C(), { id: p5, active: false, reason: "ปิดกลางทางทดสอบ hunt5" }); return { ok: "DEACT", r: r.ok }; })() as Promise<Rec>);
  out("P5 deactivate mid-flight (40 redeems)", tally(await Promise.all(jobs5)), await state(p5));
  // P5b: expired code (validTo yesterday) — redeem still succeeds?
  const p5b = await mkCode("RACEEXP", { validTo: "2026-11-01" });
  out("P5b redeem on code with validTo in the past", tally([await redeem(p5b, "e@x", "bk-p5b")]), await state(p5b));
  // P5c: redeem after release of same booking
  const p5c = await mkCode("RACEAGAIN", { maxUses: 3 });
  const a1 = await redeem(p5c, "z@x", "bk-again"); const r1 = await release("bk-again"); const a2 = await redeem(p5c, "z@x", "bk-again");
  out("P5c redeem → release → redeem same booking", { a1: a1.ok, r1: r1.value, a2: a2.ok === true ? { replay: a2.value.replay, usedCount: a2.value.usedCount } : a2 }, await state(p5c));
  // P5d: release twice in parallel ×10
  const p5d = await mkCode("RACEREL2", { maxUses: 3 });
  await redeem(p5d, "y@x", "bk-rel2");
  const rr = await Promise.all(Array.from({ length: 10 }, () => release("bk-rel2")));
  out("P5d release same booking ×10 parallel", rr.map((r) => r.value?.released ?? r.code ?? r.e).join(","), await state(p5d));

  // P6: codes — case variants, parallel create, parallel reactivate
  await mkCode("CASEX");
  out("P6a create 'casex' after 'CASEX'", fmt(await T.savePriceRule(C(), { kind: "PROMO_CODE", params: { kind: "PROMO_CODE", code: "casex", discountBp: 1 } })));
  out("P6b create 'DUPX' ×12 parallel", tally(await Promise.all(Array.from({ length: 12 }, () => safeCall(() => T.savePriceRule(C(), { kind: "PROMO_CODE", params: { kind: "PROMO_CODE", code: "DUPX", discountBp: 1 } }))))));
  const i1 = await mkCode("REACT"); await T.setPriceRuleActive(C(), { id: i1, active: false }); const i2 = await mkCode("react"); await T.setPriceRuleActive(C(), { id: i2, active: false });
  out("P6c reactivate 2 inactive rules with same code in parallel", tally(await Promise.all([i1, i2].map((id) => safeCall(() => T.setPriceRuleActive(C(), { id, active: true }))))), (await q(`SELECT count(*)::int n FROM "TripPriceRule" WHERE "unitId"=$1 AND upper(code)='REACT' AND active`, [uA]))[0]);
  // P6d: edit an inactive rule's code to collide, then reactivate
  const e1 = await mkCode("EDITA"); const e2 = await mkCode("EDITB"); await T.setPriceRuleActive(C(), { id: e2, active: false });
  out("P6d edit inactive EDITB→EDITA", fmt(await T.savePriceRule(C(), { id: e2, kind: "PROMO_CODE", params: { kind: "PROMO_CODE", code: "EDITA", discountBp: 1 } })), "reactivate", fmt(await T.setPriceRuleActive(C(), { id: e2, active: true })), e1.slice(-4));

  // R1: 20 parallel setPrice on the same tuple (NULL dims) and on a non-null tuple
  const pA = await mkProduct(tA, uA);
  const sId = (await T.saveSeason(C(), { name: "race", dateStart: "2027-01-01", dateEnd: "2027-01-31", priority: 1 })).value.id;
  const dId = await mkDep(pA, "2027-01-10");
  for (const [tag, dims] of [["all-null", {}], ["season+dep+mask+book", { paxTypeId: pA.pt.ADULT, seasonId: sId, departureId: dId, weekdayMask: 0b1111111, bookFrom: "2026-11-01", travelFrom: "2027-01-01", bookTo: "2026-12-31" }]] as [string, Rec][]) {
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => safeCall(() => T.setPrice(C(), { productId: pA.id, currency: "THB", amountMinor: 100_000 + i, ...dims }))));
    const rows = await q(`SELECT id, "amountMinor" FROM "TripPrice" WHERE "productId"=$1 AND ${tag === "all-null" ? `"paxTypeId" IS NULL AND "seasonId" IS NULL` : `"seasonId" IS NOT NULL`}`, [pA.id]);
    const last = (await q(`SELECT after FROM "AuditLog" WHERE "tenantId"=$1 AND "targetId"=$2 AND action='trips.price.set' ORDER BY "createdAt" DESC, id DESC LIMIT 1`, [tA, rows[0]?.id]))[0];
    const ids = new Set(rs.filter((r) => r.ok === true).map((r) => r.value.id));
    out(`R1 setPrice ×20 parallel ${tag}`, tally(rs), { rows: rows.length, distinctIdsReturned: ids.size, rowAmount: rows[0]?.amountMinor, lastAuditAfter: last?.after?.amountMinor });
  }
  // R2: overlapping seasons in parallel, equal priority
  const rs2 = await Promise.all(Array.from({ length: 10 }, (_, i) => safeCall(() => T.saveSeason(C(), { name: `ov${i}`, dateStart: `2028-0${(i % 3) + 1}-01`, dateEnd: "2028-06-30", priority: 5 }))));
  out("R2 10 overlapping seasons equal priority in parallel", tally(rs2), (await q(`SELECT count(*)::int n FROM "TripSeason" WHERE "unitId"=$1 AND priority=5 AND status='ACTIVE'`, [uA]))[0]);
  const s1 = (await T.saveSeason(C(), { name: "e1", dateStart: "2029-01-01", dateEnd: "2029-01-10", priority: 7 })).value.id, s2 = (await T.saveSeason(C(), { name: "e2", dateStart: "2029-02-01", dateEnd: "2029-02-10", priority: 7 })).value.id;
  const rs2b = await Promise.all([safeCall(() => T.saveSeason(C(), { id: s1, name: "e1", dateStart: "2029-01-01", dateEnd: "2029-02-05", priority: 7 })), safeCall(() => T.saveSeason(C(), { id: s2, name: "e2", dateStart: "2029-01-05", dateEnd: "2029-02-10", priority: 7 }))]);
  out("R2b two edits that each create overlap, parallel", tally(rs2b));
  // unarchive path: archived season edited back into an overlap? (saveSeason on ARCHIVED row skips the clash check)
  const s3 = (await T.saveSeason(C(), { name: "arch", dateStart: "2030-01-01", dateEnd: "2030-01-31", priority: 9 })).value.id;
  await T.archiveSeason(C(), { id: s3 });
  await T.saveSeason(C(), { name: "live", dateStart: "2030-01-01", dateEnd: "2030-01-31", priority: 9 });
  out("R2c edit ARCHIVED season (stays ARCHIVED?)", fmt(await T.saveSeason(C(), { id: s3, name: "arch2", dateStart: "2030-01-01", dateEnd: "2030-01-31", priority: 9 })), (await q(`SELECT status FROM "TripSeason" WHERE id=$1`, [s3]))[0]);

  // R4: CURRENCY_LOCKED race (LIVEABOARD DRAFT unpublished product, THB+USD allowed)
  const sc = await safeCall(() => SET.setSettings(oa, { tenantId: tA }, [{ key: "trips.general.currencies", scope: "UNIT", scopeId: uL, value: ["THB", "USD"] }], { ackLegalWarn: true }));
  out("R4 setup currencies", sc.ok);
  const pL = await mkProduct(tA, uL, { type: "LIVEABOARD", status: "DRAFT" });
  const pctx = { tenantId: tA, actorUserId: oa.userId };
  const res4: Rec = {}; let bad4 = 0;
  for (let round = 0; round < 12; round++) {
    await q(`DELETE FROM "TripPrice" WHERE "productId"=$1`, [pL.id]);
    await q(`UPDATE "TripProduct" SET currency='THB' WHERE id=$1`, [pL.id]); await q(`UPDATE "TripExtra" SET currency='THB' WHERE "productId"=$1`, [pL.id]);
    const [u, p] = await Promise.all([safeCall(() => T.updateProduct(pctx, { unitId: uL, productId: pL.id, currency: "USD" })), safeCall(() => T.setPrice(C(uL), { productId: pL.id, currency: "THB", amountMinor: 100_000 + round }))]);
    const k = `update:${u.ok === true ? "OK" : u.code} price:${p.ok === true ? "OK" : `${p.code}/${p.details?.reason ?? ""}`}`; res4[k] = (res4[k] ?? 0) + 1;
    const mism = await q(`SELECT p.currency pc, t.currency tc FROM "TripPrice" p JOIN "TripProduct" t ON t.id=p."productId" WHERE p."productId"=$1 AND p.currency<>t.currency`, [pL.id]);
    if (mism.length) bad4++;
  }
  out("R4 updateProduct(currency USD) ‖ setPrice(THB) ×12", res4, { roundsWithMismatchedPriceCurrency: bad4 });
  // R4b: rule on product then currency change
  await q(`DELETE FROM "TripPrice" WHERE "productId"=$1`, [pL.id]); await q(`UPDATE "TripProduct" SET currency='THB' WHERE id=$1`, [pL.id]);
  const [u2, r2] = await Promise.all([safeCall(() => T.updateProduct(pctx, { unitId: uL, productId: pL.id, currency: "USD" })), safeCall(() => T.savePriceRule(C(uL), { productId: pL.id, kind: "EARLY_BIRD", params: { kind: "EARLY_BIRD", minDaysBefore: 1, discountMinor: 100 } }))]);
  out("R4b updateProduct ‖ savePriceRule(product, discountMinor in product currency)", { update: u2.ok === true ? "OK" : u2.code, rule: r2.ok === true ? "OK" : r2.code, productCurrency: (await q(`SELECT currency FROM "TripProduct" WHERE id=$1`, [pL.id]))[0].currency });
} catch (e) { console.log("FATAL", e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(0, 5).join("\n")}` : e); } finally { await cleanup(); }
process.exit(0);
