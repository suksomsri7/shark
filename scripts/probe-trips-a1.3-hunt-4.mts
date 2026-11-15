// hunt-4 — A1.3a money (seeded random × own reference in integer satang) · try = real path (bytes) · try writes nothing · snapshot stable · try ctx cannot be forged
// run: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-trips-a1.3-hunt-4.mts [cases=1500]
import { huntSetup, NOW, ADULT, CHILD, PARK_ADULT, PARK_CHILD, type Rec } from "./probe-trips-a1.3-hunt-lib.mjs"; // PROBE-EDIT (typecheck): .mts → .mjs (TS5097 · tsx maps .mjs → .mts)

const H = await huntSetup("probe-a1.3-hunt-4");
const { call, check, fmt, R } = H;
const CASES = Number(process.argv.find((a) => /^cases=\d+$/.test(a))?.slice(6) ?? 1500);
// PROBE-EDIT (typecheck): BigInt literal → BigInt() (TS2737 target ES2017)
const halfUp = (num: bigint, den: bigint) => (BigInt(2) * num + den) / (BigInt(2) * den);
const bp = (amt: number, rate: number) => Number(halfUp(BigInt(amt) * BigInt(rate), BigInt(10_000)));
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rnd = rng(0xa13);
const ri = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const noLadder = (v: unknown) => { const x = { ...R(v) }; delete x.cancelMinimumLadder; return JSON.stringify(x); };

try {
  const S = await H.mkShop("m4", { u: null, u2: null });
  const P = await H.mkProd(S, "P", "u");
  const tiers = await H.tiersOf(S);
  const X = await H.mkAccount(S, "X");               // fuzz account — no tier, no cards (drafts only)
  const Y = await H.mkAccount(S, "Y");               // saved-card account (try vs real)
  const dep = await H.mkDep(P, "2027-03-10");
  const a7 = R(await H.S("resolveSetting")({ tenantId: S.id }, "agency.price.minResalePrice", { unitId: P.unit })).value;
  console.log(`INFO A7 minResalePrice = ${fmt(a7)}`);
  const fp0 = await H.dbFingerprint([S.id]);

  // ── 1. money fuzz through tryAgentPrice drafts vs own reference ──
  type Case = { mode: string; rates: Rec[]; a: number; c: number; actual?: number };
  const mkCase = (): Case => {
    const a = ri(0, 12), c = ri(a === 0 ? 1 : 0, 12);
    const m = ri(0, 3);
    if (m === 0) return { mode: "COMMISSION_PCT", rates: [{ productKind: "TRIP", productId: P.id, mode: "COMMISSION_PCT", valueBp: rnd() < 0.1 ? [0, 1, 9999, 10000][ri(0, 3)] : ri(0, 10000) }], a, c };
    if (m === 1) return { mode: "COMMISSION_FIXED", rates: [{ productKind: "TRIP", productId: P.id, mode: "COMMISSION_FIXED", valueMinor: rnd() < 0.15 ? ri(300_000, 900_000) : ri(0, 120_000) }], a, c };
    const mode = m === 2 ? "NET" : "MARKUP";
    const rates: Rec[] = [];
    const generic = ri(1, 2 * ADULT);
    const minSell = rnd() < 0.5 ? null : generic + ri(0, 100_000);
    rates.push({ productKind: "TRIP", productId: P.id, mode, valueMinor: generic, minSellMinor: minSell, ...(mode === "MARKUP" ? { markupCapBp: ri(0, 5000) } : {}) });
    if (rnd() < 0.5) rates.push({ productKind: "TRIP", productId: P.id, paxTypeId: P.pt.CHILD, mode, valueMinor: ri(0, ADULT), ...(mode === "MARKUP" ? { markupCapBp: 0 } : {}) });
    return { mode, rates, a, c, actual: rnd() < 0.7 ? ri(0, 6_000_000) : undefined };
  };
  type Ref = { fail?: string; payable?: number; base?: number; C?: number; W?: number | null; remit?: number; earns?: number };
  const reference = (k: Case, wht: Rec): Ref => {
    const first = k.rates[0];
    let ua = ADULT, uc = CHILD;
    if (k.mode === "NET" || k.mode === "MARKUP") {
      const child = k.rates.find((r) => r.paxTypeId === P.pt.CHILD);
      ua = Number(first.valueMinor); uc = child ? Number(child.valueMinor) : Number(first.valueMinor);
    }
    const seat = ua * k.a + uc * k.c;
    const payable = seat + PARK_ADULT * k.a + PARK_CHILD * k.c; // shop prices VAT-inclusive (checked against totals below)
    const base = seat;
    const C = k.mode === "COMMISSION_PCT" ? bp(base, Number(first.valueBp)) : k.mode === "COMMISSION_FIXED" ? Number(first.valueMinor) * (k.a + k.c) : 0;
    const W = wht.applies === true && wht.mode === "RATE" && typeof wht.rateBp === "number" && (wht.continuous === "EVERY_PAYMENT" || C >= Number(wht.minPerContractSatang)) ? bp(C, wht.rateBp) : 0;
    if (C > base) return { fail: "COMMISSION_EXCEEDS_PAYABLE" }; // PROBE-EDIT (มติ Z4): คอมฯ รวม > ฐานคอมฯ ⇒ ปฏิเสธ (ตรวจก่อน gross-up)
    const remit = payable - C + (wht.grossUp === true ? W : 0);
    if (remit < 0) return { fail: "COMMISSION_EXCEEDS_PAYABLE" };
    let earns = C;
    if (k.mode === "NET" || k.mode === "MARKUP") {
      const minSell = first.minSellMinor !== null && first.minSellMinor !== undefined ? Number(first.minSellMinor) : typeof a7 === "number" ? a7 : null;
      if (k.actual !== undefined) {
        if (minSell !== null && BigInt(k.actual) < BigInt(minSell) * BigInt(k.a + k.c)) return { fail: "BELOW_MIN_SELL_PRICE" };
        if (k.mode === "MARKUP" && BigInt(seat) * BigInt(10_000 + Number(first.markupCapBp)) < BigInt(k.actual) * BigInt(10_000)) return { fail: "MARKUP_OVER_CAP" };
      }
      earns = k.actual === undefined ? 0 : Math.max(0, k.actual - seat);
    }
    return { payable, base, C, W, remit, earns };
  };
  let ran = 0, mism = 0, invariantBad = 0, firstWht: Rec | null = null;
  const sampleMism: string[] = [];
  const t0 = Date.now();
  for (let i = 0; i < CASES; i++) {
    const k = mkCase();
    const r = await call("tryAgentPrice", S.ctx(), { agentAccountId: X, unitId: P.unit, productId: P.id, slotId: dep, pax: [...(k.a ? [{ paxTypeId: P.pt.ADULT, qty: k.a }] : []), ...(k.c ? [{ paxTypeId: P.pt.CHILD, qty: k.c }] : [])], at: NOW.toISOString(), ...(k.actual !== undefined ? { actualSaleSatang: k.actual } : {}), draft: { ownerKind: "AGENT", rates: k.rates } }, { now: NOW });
    ran++;
    const v = R(r.priced), cm = R(v.commission), tt = R(v.totals), w = R(cm.wht);
    if (r.ok === true && !firstWht) firstWht = w;
    const ref = reference(k, r.ok === true ? w : firstWht ?? {});
    let bad = "";
    if (ref.fail) {
      if (!(r.ok === false && (r.reason === ref.fail))) bad = `want fail ${ref.fail} got ${fmt(r).slice(0, 200)}`;
    } else if (r.ok !== true) bad = `want ok got ${fmt(r).slice(0, 200)}`;
    else {
      const got = { payable: tt.payableSatang, base: cm.baseSatang, C: cm.commissionSatang, W: w.whtSatang, remit: cm.remitToShopSatang, earns: cm.agentEarnsSatang };
      for (const key of ["payable", "base", "C", "W", "remit", "earns"] as const) if (got[key] !== ref[key]) bad += `${key} ${String(got[key])}≠${String(ref[key])} `;
      // invariants
      const C = Number(cm.commissionSatang), base = Number(cm.baseSatang), pay = Number(tt.payableSatang), rem = Number(cm.remitToShopSatang);
      if (!(C >= 0 && rem >= 0 && C <= pay && rem <= pay + Number(w.whtSatang ?? 0) && (k.mode !== "COMMISSION_PCT" || C <= base))) { invariantBad++; bad += "INVARIANT "; }
      const items = Array.isArray(v.items) ? (v.items as Rec[]) : [];
      for (const it of items) if (!Number.isInteger(it.amountSatang) || Number(it.amountSatang) < 0) { invariantBad++; bad += "ITEM-NEG/FRAC "; }
    }
    if (bad) { mism++; if (sampleMism.length < 6) sampleMism.push(`#${i} ${k.mode} a${k.a} c${k.c} actual ${k.actual} rates ${fmt(k.rates).slice(0, 220)} → ${bad}`); }
  }
  console.log(`INFO money fuzz ${ran} cases in ${Math.round((Date.now() - t0) / 1000)} s · wht terms ${fmt(firstWht)}`);
  check(`M fuzz ${ran} cases (PCT/FIXED/NET/MARKUP × pax × actual) = own integer-satang reference, every field`, mism === 0, "0 mismatches", `${mism} mismatches · ${sampleMism.join(" || ")}`);
  check("M invariants: commission ≥ 0 · remit ≥ 0 · commission ≤ payable · PCT commission ≤ base · item amounts integer ≥ 0", invariantBad === 0, "0", String(invariantBad));

  // ── 2. try writes nothing ──
  const fp1 = await H.dbFingerprint([S.id]);
  check("M tryAgentPrice ×N wrote nothing (audit/outbox/cards/rates/accounts/updatedAt/departures)", JSON.stringify(fp0) === JSON.stringify(fp1), fmt(fp0), fmt(fp1));

  // ── 3. try (no draft, ACTIVE) ≡ real quote bytes · draft ≡ quote after saving the draft ──
  {
    let diffs = 0; const why: string[] = [];
    for (let i = 0; i < 12; i++) {
      const k = mkCase();
      if (k.actual !== undefined) delete k.actual;
      const pax = [...(k.a ? [{ paxTypeId: P.pt.ADULT, qty: k.a }] : []), ...(k.c ? [{ paxTypeId: P.pt.CHILD, qty: k.c }] : [])];
      const draftTry = await call("tryAgentPrice", S.ctx(), { agentAccountId: Y, unitId: P.unit, productId: P.id, slotId: dep, pax, at: NOW.toISOString(), draft: { ownerKind: "AGENT", rates: k.rates } }, { now: NOW });
      const card = await H.mkCard(S, { kind: "AGENT", agentAccountId: Y }, k.rates);
      const realTry = await call("tryAgentPrice", S.ctx(), { agentAccountId: Y, unitId: P.unit, productId: P.id, slotId: dep, pax, at: NOW.toISOString() }, { now: NOW });
      await H.AG("installAgencyPricingPort")();
      const q = await H.callTr("quoteTripLine", H.agentCtx(S, Y, P.unit, NOW), { productKind: "TRIP", unitId: P.unit, productId: P.id, slotId: dep, pax, extras: [] });
      const qv = q.ok === true ? noLadder(q.value) : `FAIL ${fmt(q)}`;
      const rt = realTry.ok === true ? noLadder(realTry.priced) : `FAIL ${fmt(realTry)}`;
      // draft refIds say "draft-000@0", saved say "<id>@<ver>" — compare with refIds/cardIds normalised
      const norm = (s: string) => s.replace(/"refId":"[^"]*"/g, '"refId":"*"').replace(/"(refId|ref)":"[^"]*@\d+"/g, '"$1":"*"');
      const dt = draftTry.ok === true ? noLadder(draftTry.priced) : `FAIL ${fmt(draftTry)}`;
      const sameReal = q.ok === true ? rt === qv : (realTry.ok === false);
      const sameDraft = norm(dt) === norm(rt) || (draftTry.ok === false && realTry.ok === false && draftTry.reason === realTry.reason);
      if (!sameReal || !sameDraft) { diffs++; if (why.length < 3) why.push(`#${i} ${k.mode} real=${sameReal} draft=${sameDraft} q=${qv.slice(0, 160)} try=${rt.slice(0, 160)} draft=${dt.slice(0, 160)}`); }
      // archive so the next case starts clean
      const cur = Number((await H.q<{ v: number }>(`SELECT version v FROM "AgentRateCard" WHERE id = $1`, [card.id]))[0].v);
      await call("setAgentRateCardStatus", S.ctx(), { cardId: card.id, expectedVersion: cur, action: "ARCHIVE" }, { now: NOW });
    }
    check("TP try(no draft, ACTIVE) ≡ quoteTripLine bytes (minus cancelMinimumLadder) and try(draft) ≡ try after saving (12 random cards)", diffs === 0, "0 diffs", `${diffs} · ${why.join(" || ")}`);
  }

  // ── 4. try vs real for an agency the real port refuses: unit outside account.unitIds ──
  {
    const RU = await H.mkAccount(S, "RU", { unitIds: [S.units.u2] });
    await H.mkCard(S, { kind: "AGENT", agentAccountId: RU }, [{ productKind: "TRIP", productId: P.id, mode: "COMMISSION_PCT", valueBp: 1111 }]);
    const t = await call("tryAgentPrice", S.ctx(), { agentAccountId: RU, unitId: P.unit, productId: P.id, slotId: dep, pax: [{ paxTypeId: P.pt.ADULT, qty: 2 }], at: NOW.toISOString() }, { now: NOW });
    const qq = await H.quote(S, RU, P, dep);
    check("TP account limited to unit u2, priced in unit u: try must not show a price the real path refuses (real = FORBIDDEN AGENCY_NOT_ENABLED)", !(t.ok === true && qq.ok === false), "try fails too (NOT_FOUND / VALIDATION) — or real succeeds", `try ${t.ok === true ? `ok rateBp ${R(R(t.priced).commission).rateBp}` : fmt(t)} · real ${fmt(qq).slice(0, 160)}`);
  }

  // ── 5. snapshot stability: snapshot built from the real path, then card edited / tier changed / card archived / setting changed ──
  {
    const T = await H.mkAccount(S, "T", { tierId: tiers.B });
    const card = await H.mkCard(S, { kind: "AGENT", agentAccountId: T }, [{ productKind: "TRIP", productId: P.id, mode: "COMMISSION_PCT", valueBp: 1300 }]);
    await H.AG("installAgencyPricingPort")();
    const ctx = H.agentCtx(S, T, P.unit, NOW);
    const ln = H.line(P, dep, 3, 1);
    const q0 = R(await H.TR("quoteTripLine")(ctx, ln));
    let snap: unknown = null, snapErr = "";
    try { const b = R(await H.TR("buildTripBookingSnapshot")(ctx, ln, q0.value)); if (b.ok === true) snap = b.value; else snapErr = fmt(b); } catch (e) { snapErr = String(e).slice(0, 200); }
    const snapJson = JSON.stringify(snap);
    const recompute = H.TR("recomputeFromSnapshot") as unknown as (...a: unknown[]) => Rec;
    const before = snap ? JSON.stringify(recompute(snap, { kind: "TOTALS" })) : "NO-SNAP";
    const quoteBefore = noLadder(R(await H.quote(S, T, P, dep, { adults: 3, children: 1 })).value);
    // mutate everything the snapshot must not follow
    const u = await call("upsertAgentRate", S.ctx(), { cardId: card.id, expectedVersion: card.version, rate: { id: card.rateIds[0], productKind: "TRIP", productId: P.id, mode: "COMMISSION_PCT", valueBp: 9000 } }, { now: NOW });
    const acc = (await H.q<{ u: string }>(`SELECT to_char("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') u FROM "AgentAccount" WHERE id = $1`, [T]))[0].u;
    const st = await call("setAgentAccountTier", S.ctx(), { agentAccountId: T, tierCode: "A", expectedUpdatedAt: acc }, { now: NOW });
    await H.setV(S, [{ key: "agency.comm.vatMode", scope: "UNIT", scopeId: P.unit, value: "INCLUSIVE" }]).catch((e) => console.log(`INFO setV vatMode: ${String(e).slice(0, 120)}`));
    const after = snap ? JSON.stringify(recompute(snap, { kind: "TOTALS" })) : "NO-SNAP";
    const quoteAfter = noLadder(R(await H.quote(S, T, P, dep, { adults: 3, children: 1 })).value);
    check("SN snapshot recompute unchanged after rate edit + tier change + X26 change", !!snap && before === after && JSON.stringify(snap) === snapJson, "same", `snap ${snap ? "ok" : snapErr} · edits ${u.ok}/${st.ok} · before ${before.slice(0, 120)} · after ${after.slice(0, 120)}`);
    const policyInSnap = snapJson.includes("agency.comm.vatMode");
    check("SN snapshot carries the agency policy block it was priced with (24 keys) and old refId", policyInSnap && snapJson.includes(`${card.rateIds[0]}@${card.version}`), "has policy + refId@v", `policy ${policyInSnap} · refId ${snapJson.includes(`${card.rateIds[0]}@${card.version}`)}`);
    check("SN control: new quote DOES move after the edits (proves the edits landed)", quoteBefore !== quoteAfter, "different", `before ${quoteBefore.slice(0, 80)} after ${quoteAfter.slice(0, 80)}`);
  }

  // ── 6. forged ctx: no outsider reaches the try shortcut; concurrent real quotes never see a draft ──
  {
    const Z = await H.mkAccount(S, "Z", { status: "SUSPENDED" });
    const port = ((await import("@/lib/modules/agency")) as unknown as Rec).agencyPricingPort;
    const portObj = R(port);
    const load = typeof portObj.load === "function" ? (portObj.load as (...a: unknown[]) => Promise<unknown>) : null;
    const direct = load ? await load.call(portObj, H.agentCtx(S, Z, P.unit), { agentAccountId: Z, productId: P.id, departureId: dep, travelDate: "2027-03-10", at: NOW }).catch((e) => `THROW ${String(e).slice(0, 80)}`) : "no-port-export";
    check("F port.load with a hand-made ctx for a SUSPENDED agency → null", direct === null || direct === "no-port-export", "null", fmt(direct));
    const W = await H.mkAccount(S, "W");
    const wCard = await H.mkCard(S, { kind: "AGENT", agentAccountId: W }, [{ productKind: "TRIP", productId: P.id, mode: "COMMISSION_PCT", valueBp: 1000 }]);
    const base = noLadder(R(await H.quote(S, W, P, dep)).value);
    const jobs: Promise<string>[] = [];
    for (let i = 0; i < 20; i++) {
      jobs.push(call("tryAgentPrice", S.ctx(), { agentAccountId: W, unitId: P.unit, productId: P.id, slotId: dep, pax: [{ paxTypeId: P.pt.ADULT, qty: 2 }], at: NOW.toISOString(), draft: { ownerKind: "AGENT", replacesCardId: wCard.id, rates: [{ productKind: "TRIP", productId: P.id, mode: "COMMISSION_PCT", valueBp: 9999 }] } }, { now: NOW }).then((r) => `try:${R(R(r.priced).commission).rateBp}`));
      jobs.push(H.quote(S, W, P, dep).then((r) => (noLadder(r.value) === base ? "real:same" : `real:DIFF ${R(R(r.value).commission).rateBp}`)));
    }
    const out = await Promise.all(jobs);
    const leaked = out.filter((s) => s.startsWith("real:DIFF"));
    check("F 20 draft tries interleaved with 20 real quotes → real quotes never priced with the draft", leaked.length === 0 && out.filter((s) => s === "try:9999").length === 20, "0 leaks · 20 try:9999", `${leaked.length} leaks · ${fmt(out.reduce<Record<string, number>>((m, s) => ((m[s] = (m[s] ?? 0) + 1), m), {}))}`);
    // try for SUSPENDED (allowed by §9) prices; real refuses
    const ts = await call("tryAgentPrice", S.ctx(), { agentAccountId: Z, unitId: P.unit, productId: P.id, slotId: dep, pax: [{ paxTypeId: P.pt.ADULT, qty: 1 }], at: NOW.toISOString() }, { now: NOW });
    check("F try SUSPENDED agency prices (§9 allows) while real path stays closed", ts.ok === true, "ok", fmt(ts).slice(0, 200));
    // TIER draft for an agency without tier
    const tn = await call("tryAgentPrice", S.ctx(), { agentAccountId: W, unitId: P.unit, productId: P.id, slotId: dep, pax: [{ paxTypeId: P.pt.ADULT, qty: 1 }], at: NOW.toISOString(), draft: { ownerKind: "TIER", rates: [{ productKind: "TRIP", productId: P.id, mode: "COMMISSION_PCT", valueBp: 4321 }] } }, { now: NOW });
    console.log(`INFO try draft ownerKind TIER for agency without tier → ${tn.ok === true ? `ok applied=${R(tn.trace).applied} rateBp=${R(R(tn.priced).commission).rateBp} warnings=${fmt(tn.warnings)}` : fmt(tn)}`);
  }
} catch (e) {
  console.log(`PROBE ERROR ${String(e instanceof Error ? e.stack : e).slice(0, 900)}`);
} finally {
  H.summary("hunt-4");
  await H.cleanup();
}
