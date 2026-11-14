// probe 1 — double counting: OVERLAP / OPENING_OVERLAP on every path (v1+v2 create · recompute · approve · after reverse · DRAFT predating) + reverse order + BKK boundary
import { setup, short, T } from "./common.mjs";
const X = await setup("hunt-h34y-p1");
const { sys, emp, save, create, createV1, approve, item, liveOf, PAY, c, V, ownerA, payA, safe, rows } = X;
const out: string[] = [];
const log = (k: string, v: unknown) => { const s = `${k}: ${short(v, 260)}`; out.push(s); console.log(s); };
try {
  // a) v2 DRAFT Sep (09-25) then opening asOf 09-30 → OVERLAP ; asOf 08-31 → ok ; approve w/o rebuild → INPUTS_CHANGED
  const A = await sys("A"); const eA = await emp(A, "A01");
  const d = await create(A, "2031-09");
  log("a.draft", d?.ok);
  log("a.save asOf 09-30 vs DRAFT", await save(A, V.owner, eA, { asOfDay: "2031-09-30", months: 9 }, T("2031-10-01T05:00:00Z")));
  log("a.save asOf 08-31", await save(A, V.owner, eA, {}, T("2031-09-10T05:00:00Z")));
  log("a.approve stale", await approve(A, d?.id));
  // b) v1: DRAFT Sep then opening asOf 09-30 → OVERLAP ; opening 08-31 then v1 create Aug (08-25) → OPENING_OVERLAP ; v1 recompute after opening covering payDay
  const B = await sys("B", false); const eB = await emp(B, "B01"); const eB2 = await emp(B, "B02", { pay: false });
  const v1 = await createV1(B, "2031-09");
  log("b.v1 draft", { id: !!v1?.id, err: v1?.reason });
  log("b.save 09-30 vs v1 DRAFT", await save(B, V.owner, eB, { asOfDay: "2031-09-30", months: 9 }, T("2031-10-01T05:00:00Z")));
  // b2: eB2 has no profile → not in Sep v1 run; save opening asOf 09-30 for eB2 (allowed) then give eB2 a profile and recompute the v1 DRAFT → must refuse
  log("b2.save eB2 09-30", await save(B, V.owner, eB2, { asOfDay: "2031-09-30", months: 9 }, T("2031-10-01T05:00:00Z")));
  await X.P.hrSalaryProfile.create({ data: { tenantId: X.TT, systemId: B, employeeId: eB2, baseSalarySatang: 3_000_000, ssoEligible: true, personalDeductionJson: { spouse: false, children: 0 } } });
  log("b2.v1 recompute (eB2 joins, opening covers payDay)", await safe(() => PAY.recomputeDraftRun(c(B), v1?.id, payA, { viewer: V.pay1, now: T("2031-10-02T06:00:00Z") })));
  log("b2.v1 items now", (await rows(`SELECT "employeeId" FROM "HrPayrollItem" WHERE "runId" = $1`, v1?.id)).map((r) => r.employeeId === eB2 ? "eB2" : "eB"));
  log("b2.v1 approve", await approve(B, v1?.id));
  // c) v2: reverse path — Sep approved, opening 08-31 saved; reverse Sep; edit opening asOf 09-30 (allowed now); recreate Sep → OPENING_OVERLAP
  const C = await sys("C"); const eC = await emp(C, "C01");
  const s9 = await create(C, "2031-09"); log("c.create", s9?.ok); log("c.approve", (await approve(C, s9?.id))?.ok);
  log("c.save 08-31", await save(C, V.owner, eC, {}, T("2031-10-03T05:00:00Z")));
  const rv = await safe(() => PAY.reverseRun(c(C), s9?.id, "hunter", ownerA)); log("c.reverse", rv?.ok ?? rv);
  log("c.edit asOf 09-30 (after reverse)", await save(C, V.owner, eC, { asOfDay: "2031-09-30", months: 9, incomeSatang: 27_000_000 }, T("2031-10-03T05:00:00Z"), 1));
  log("c.recreate Sep", await create(C, "2031-09", "2031-09-26T05:00:00Z", "2031-10-04T05:00:00Z"));
  log("c.create Oct (prior = opening only)", await (async () => { const r = await create(C, "2031-10"); const it = await item(r?.id, eC); return { ok: r?.ok, wht: it?.whtSatang, prior: it?.ytdJson?.prior, m: it?.snapshotJson?.ytdOpening }; })());
  // d) reverse order: runs Jan–Mar approved, then opening asOf 06-30 → OVERLAP ; asOf 2031-01-24 (before Jan payDay) → allowed? (opening before first run but after... runs exist)
  const D = await sys("D"); const eD = await emp(D, "D01");
  for (const pk of ["2031-01", "2031-02", "2031-03"]) { const r = await create(D, pk); await approve(D, r?.id); }
  log("d.save 06-30 after Jan–Mar runs", await save(D, V.owner, eD, { asOfDay: "2031-06-30", months: 6, incomeSatang: 18_000_000, whtSatang: 0, ssoSatang: 0 }, T("2031-07-01T05:00:00Z")));
  log("d.save 01-10 (before first run)", await save(D, V.owner, eD, { asOfDay: "2031-01-10", months: 0, incomeSatang: 500_000, whtSatang: 0, ssoSatang: 0 }, T("2031-07-01T05:00:00Z")));
  // e) BKK boundary on save: run payDate 2031-08-31T16:59Z (BKK 08-31) → OVERLAP for asOf 08-31 ; 17:00Z (BKK 09-01) → allowed
  const E1 = await sys("E1"); const e1 = await emp(E1, "E01");
  const r1 = await create(E1, "2031-08", "2031-08-31T16:59:00Z", "2031-09-02T05:00:00Z"); log("e.create 16:59Z", r1?.ok);
  log("e.save asOf 08-31 vs BKK 08-31 run", await save(E1, V.owner, e1));
  const E2 = await sys("E2"); const e2 = await emp(E2, "E02");
  const r2 = await create(E2, "2031-08", "2031-08-31T17:00:00Z", "2031-09-02T05:00:00Z"); log("e.create 17:00Z", r2?.ok);
  log("e.save asOf 08-31 vs BKK 09-01 run", await save(E2, V.owner, e2));
  // f) DRAFT predating: opening saved, then v2 create Aug with payDay 08-31 (= asOf) → OPENING_OVERLAP ; zero opening (asOf 01-01) vs Jan-1 payDay run
  const F = await sys("F"); const eF = await emp(F, "F01");
  log("f.save", (await save(F, V.owner, eF))?.ok);
  log("f.create Aug payDay=asOf", await create(F, "2031-08", "2031-08-31T05:00:00Z", "2031-09-02T05:00:00Z"));
  log("f.v2 runs left", (await rows(`SELECT count(*)::int AS n FROM "HrPayrollRun" WHERE "systemId" = $1`, F))[0]?.n);
  log("f.live", (await liveOf(eF)).length);
} catch (e) {
  console.log("ERR", e);
} finally {
  await X.cleanup();
}
