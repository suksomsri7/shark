// probe 5 — opening YTD + SSO: SSO_HIGH uses the dated cap · v2 first run after an opening (allowance = actual, capped) · v1 ignores openings
import { setup, short, T, B } from "./common.mjs";
const X = await setup("hunt-hfsso-p5");
const { sys, emp, c, safe, itemsOf, PAY, OPM, V, ownerA, payA, withLaw } = X;
const log = (k: string, v: unknown) => console.log(`${k}: ${short(v, 600)}`);
const SEED = (await import("../../scripts/hr-seed-law-draft.mts" as string)) as any;
try {
  await withLaw((SEED.LAW_V1_ROWS as any[]).filter((r) => r.kind !== "OT"));
  const S = await sys("OPEN", true);
  const now = { now: T("2026-09-10T05:00:00Z") };
  const cases: [string, number, string, number, number][] = [
    // name, taxYear, asOfDay, months, ssoBaht
    ["old cap 8×750", 2026, "2026-08-31", 8, 6_000], ["8×750+1", 2026, "2026-08-31", 8, 6_001], ["8×875", 2026, "2026-08-31", 8, 7_000], ["8×875+1", 2026, "2026-08-31", 8, 7_001],
    ["2025 12×750", 2025, "2025-12-31", 12, 9_000], ["2025 12×750+1", 2025, "2025-12-31", 12, 9_001],
    ["2029 1×1000 (Dec-2028 875 paid Jan)", 2029, "2029-01-10", 1, 875],
  ];
  const ids: Record<string, string> = {};
  for (const [n, ty, d, m, s] of cases) {
    const e = await emp(S, `O${Object.keys(ids).length}`, { salary: B(50_000) });
    ids[n] = e;
    const r = await safe(() => OPM.saveOpeningYtd(c(S), V.owner, { employeeId: e, taxYear: ty, asOfDay: d, months: m, incomeSatang: B(50_000 * m), whtSatang: 0, ssoSatang: B(s), expectRev: null }, now));
    log(`opening ${n}`, { ok: r?.ok, code: r?.code, reason: r?.reason, warnings: r?.warnings });
  }
  // v2 first run in 2026-09 for an employee with the realistic opening (8 months, income 400,000 · WHT 13,733.36 · SSO 6,000 old cap)
  const S2 = await sys("OPEN2", true);
  const E = await emp(S2, "Q1", { salary: B(50_000) });
  const op = await safe(() => OPM.saveOpeningYtd(c(S2), V.owner, { employeeId: E, taxYear: 2026, asOfDay: "2026-08-31", months: 8, incomeSatang: B(400_000), whtSatang: 1_373_336, ssoSatang: B(6_000), expectRev: null }, now));
  log("opening Q1", { ok: op?.ok, w: op?.warnings });
  const r = await safe(() => PAY.createPayrollRunV2(c(S2), V.pay1, { periodKey: "2026-09", payDate: T("2026-09-30T05:00:00Z") }, { now: T("2026-10-02T05:00:00Z"), actor: payA }));
  log("v2 run 2026-09", { ok: r?.ok, code: r?.code, reason: r?.reason });
  if (r?.ok) {
    const it = await X.rows(`SELECT "ssoEmployeeSatang" AS se, "whtSatang" AS w, "ytdJson" AS y FROM "HrPayrollItem" WHERE "runId" = $1`, r.id);
    log("v2 item (expect se 87500 · projectedSso 950000 · tax 2,055,000 · wht 170416)", it);
  }
  // v1 shop with an opening: the v1 engine ignores openings (×12) — 170,417
  const S1 = await sys("OPEN1", false);
  const E1 = await emp(S1, "Q2", { salary: B(50_000) });
  const op1 = await safe(() => OPM.saveOpeningYtd(c(S1), V.owner, { employeeId: E1, taxYear: 2026, asOfDay: "2026-08-31", months: 8, incomeSatang: B(400_000), whtSatang: 1_373_336, ssoSatang: B(6_000), expectRev: null }, now));
  log("opening v1 shop", { ok: op1?.ok, code: op1?.code, w: op1?.warnings });
  const r1 = await safe(() => PAY.createPayrollRun(c(S1), { periodKey: "2026-09", payDate: T("2026-09-30T05:00:00Z") }));
  log("v1 run 2026-09", r1?.id ? await itemsOf(r1.id) : r1);
  void ownerA;
} catch (e) {
  console.log("CRASH", (e as Error)?.stack?.slice(0, 800));
} finally {
  await X.cleanup();
  await X.P.$disconnect?.();
}
