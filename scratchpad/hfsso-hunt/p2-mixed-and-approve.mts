// probe 2 — MIXED 2026 run (totals · SSO110 · PND1 · bank · JV) + probe 4 — approve re-derive edge cases + concurrency (held period lock)
import { setup, short, T, B, PROFILE, underLock } from "./common.mjs";
const X = await setup("hunt-hfsso-p2");
const { P, sys, book, emp, c, safe, runOf, itemsOf, entries, linesBy, toPreFix, expectOf, PAY, FS, BK, V, ownerA, TT } = X;
const log = (k: string, v: unknown) => console.log(`${k}: ${short(v, 520)}`);
const pd = (d: string) => T(`${d}T05:00:00Z`);
try {
  // ══ P2 mixed ══
  const S = await sys("P2");
  await book("P2");
  const M: [string, number, Record<string, unknown>][] = [
    ["M01", 1_000, {}], ["M02", 1_650, {}], ["M03", 10_010, {}], ["M04", 15_000, {}], ["M05", 17_500, {}], ["M06", 20_000, {}], ["M07", 50_000, {}],
    ["M08", 30_000, { sso: false }], ["M09", 20_000, { start: "2026-09-15" }], ["M10", 17_500, { end: "2026-09-10" }],
  ];
  const ids: Record<string, string> = {};
  for (const [n, w, o] of M) ids[n] = await emp(S, n, { salary: B(w), ...(o as any) });
  await FS.saveFilingProfile(c(S), V.owner, PROFILE);
  for (const n of Object.keys(ids)) await FS.saveFilingPerson(c(S), V.owner, { employeeId: ids[n], title: "นาย", firstName: `ชื่อ${n}`, lastName: "ทดสอบ" });
  const r = await PAY.createPayrollRun(c(S), { periodKey: "2026-09", payDate: pd("2026-09-30") });
  const its = await itemsOf(r.id);
  const byE = Object.fromEntries(Object.entries(ids).map(([n, id]) => [n, its.find((i: any) => i.e === id)]));
  log("mixed items [code, sb, se, sr, w, n]", Object.entries(byE).map(([n, i]: any) => [n, i?.sb, i?.se, i?.sr, i?.w, i?.n]));
  log("mixed run", await runOf(r.id));
  log("approve", await safe(() => PAY.approveRun(c(S), r.id, undefined, ownerA)));
  log("pay", await PAY.markPaid(c(S), r.id));
  const sso = await safe(() => FS.previewFiling(c(S), V.owner, { kind: "SSO110", runId: r.id }));
  log("SSO110", { ok: sso?.ok, total: sso?.totalSatang, tax: sso?.taxSatang, lines: sso?.lineCount, ni: (sso?.notIncluded ?? []).map((x: any) => [x.cause, x.wageSatang, x.contributionSatang]) });
  const pnd = await safe(() => FS.previewFiling(c(S), V.owner, { kind: "PND1", period: "2026-09" }));
  log("PND1", { ok: pnd?.ok, total: pnd?.totalSatang, tax: pnd?.taxSatang, lines: pnd?.lineCount });
  const bank = await safe(() => BK.previewBankFile(c(S), V.owner, { runId: r.id, format: "CSV", presetId: "GENERIC" }));
  log("bank", { ok: bank?.ok, total: bank?.totalSatang });
  log("JV", await Promise.all((await entries(r.id)).map(async (e: any) => ({ st: e.status, lines: await linesBy(e.id) }))));

  // ══ P4 approve edge cases ══
  const S4 = await sys("P4");
  const F1 = await emp(S4, "F1", { salary: B(50_000) });
  await emp(S4, "F2", { salary: B(12_000) });
  // (a) SSO right (875) but WHT stale (old 9,000-cap value 171,667) — post-fix run, then WHT tampered to the old value
  const ra = await PAY.createPayrollRun(c(S4), { periodKey: "2026-03", payDate: pd("2026-03-31") });
  await P.$executeRawUnsafe(`UPDATE "HrPayrollItem" SET "whtSatang" = 171667, "netSatang" = "grossSatang" - "ssoEmployeeSatang" - 171667 WHERE "runId" = $1 AND "employeeId" = $2`, ra.id, F1);
  await P.$executeRawUnsafe(`UPDATE "HrPayrollRun" r SET "totalWhtSatang" = x.w, "totalNetSatang" = x.n FROM (SELECT sum("whtSatang")::int w, sum("netSatang")::int n FROM "HrPayrollItem" WHERE "runId" = $1) x WHERE r.id = $1`, ra.id);
  log("(a) WHT stale only ⇒ RECOMPUTE", (await safe(() => PAY.approveRun(c(S4), ra.id, undefined, ownerA)))?.code);
  // (b) SSO stale only: pre-fix run, then WHT set to the NEW value
  const rb = await PAY.createPayrollRun(c(S4), { periodKey: "2026-04", payDate: pd("2026-04-30") });
  await toPreFix(rb.id);
  await P.$executeRawUnsafe(`UPDATE "HrPayrollItem" SET "whtSatang" = 170417, "netSatang" = "grossSatang" - "ssoEmployeeSatang" - 170417 WHERE "runId" = $1 AND "employeeId" = $2`, rb.id, F1);
  log("(b) SSO stale only ⇒ RECOMPUTE", (await safe(() => PAY.approveRun(c(S4), rb.id, undefined, ownerA)))?.code);
  // (c) post-fix run with a bound bonus ⇒ approves (no RECOMPUTE)
  await P.hrPayAdjustment.create({ data: { tenantId: TT, systemId: S4, employeeId: F1, periodKey: "2026-05", kind: "BONUS", amountSatang: B(5_000), status: "APPROVED", note: "qc" } });
  await P.hrPayAdjustment.create({ data: { tenantId: TT, systemId: S4, employeeId: F1, periodKey: "2026-05", kind: "DEDUCTION", amountSatang: B(700), status: "APPROVED", note: "qc" } });
  const rc = await PAY.createPayrollRun(c(S4), { periodKey: "2026-05", payDate: pd("2026-05-29") });
  log("(c) run with adjustments", { run: await runOf(rc.id), items: await itemsOf(rc.id) });
  log("(c) approve", await safe(() => PAY.approveRun(c(S4), rc.id, undefined, ownerA)));
  // (d) wage changed after build (post-fix DRAFT 2026-06 at 50,000; profile → 60,000) ⇒ existing behaviour (approve with stored numbers), not RECOMPUTE
  const rd = await PAY.createPayrollRun(c(S4), { periodKey: "2026-06", payDate: pd("2026-06-30") });
  await P.hrSalaryProfile.updateMany({ where: { systemId: S4, employeeId: F1 }, data: { baseSalarySatang: B(60_000) } });
  log("(d) wage changed after build ⇒ approve", await safe(() => PAY.approveRun(c(S4), rd.id, undefined, ownerA)));
  log("(d) rows", await itemsOf(rd.id));
  // (d2) PRE-fix DRAFT + wage changed after build ⇒ RECOMPUTE, then recompute picks the NEW wage (60,000: SSO 875 · WHT (720,000−100,000−60,000−10,500=549,500 ⇒ 7,500+20,000+7,425=34,925 ⇒ 2,910.42))
  const rd2 = await PAY.createPayrollRun(c(S4), { periodKey: "2026-07", payDate: pd("2026-07-31") });
  await P.$executeRawUnsafe(`UPDATE "HrPayrollItem" SET "snapshotJson" = jsonb_set("snapshotJson", '{baseSalarySatang}', '5000000'::jsonb), "grossSatang" = 5000000 WHERE "runId" = $1 AND "employeeId" = $2`, rd2.id, F1);
  await toPreFix(rd2.id);
  log("(d2) stored pre-fix", await itemsOf(rd2.id));
  log("(d2) approve", (await safe(() => PAY.approveRun(c(S4), rd2.id, undefined, ownerA)))?.code);
  log("(d2) recompute", (await safe(() => PAY.recomputeDraftRun(c(S4), rd2.id, ownerA)))?.ok);
  log("(d2) rows after", await itemsOf(rd2.id));
  // (e) NEGATIVE_NET + pre-fix: RECOMPUTE first; after recompute still NEGATIVE_NET
  await P.hrSalaryProfile.updateMany({ where: { systemId: S4, employeeId: F1 }, data: { baseSalarySatang: B(50_000) } });
  await P.hrPayAdjustment.create({ data: { tenantId: TT, systemId: S4, employeeId: F1, periodKey: "2026-08", kind: "DEDUCTION", amountSatang: B(60_000), status: "APPROVED", note: "qc" } });
  const re = await PAY.createPayrollRun(c(S4), { periodKey: "2026-08", payDate: pd("2026-08-31") });
  await toPreFix(re.id);
  log("(e) approve pre-fix + negative", (await safe(() => PAY.approveRun(c(S4), re.id, undefined, ownerA)))?.code);
  await PAY.recomputeDraftRun(c(S4), re.id, ownerA);
  log("(e) after recompute", (await safe(() => PAY.approveRun(c(S4), re.id, undefined, ownerA)))?.code);

  // ══ concurrency (period lock held) ══
  const S5 = await sys("P5c");
  await book("P5c");
  await emp(S5, "G1", { salary: B(50_000) });
  const lockKey = (s: string, pk: string) => ({ key: `hr:payroll:run:${s}:${pk}`, seed: 0 });
  // (f1) approve queued first, recompute second ⇒ approve RECOMPUTE, recompute ok (875)
  const q1 = await PAY.createPayrollRun(c(S5), { periodKey: "2026-09", payDate: pd("2026-09-30") });
  await toPreFix(q1.id);
  const f1 = await underLock(P, lockKey(S5, "2026-09"), [() => safe(() => PAY.approveRun(c(S5), q1.id, undefined, ownerA)), () => safe(() => PAY.recomputeDraftRun(c(S5), q1.id, ownerA))]);
  log("(f1) approve∥recompute", { blocked: f1.blocked, res: f1.res.map((x: any) => x?.code ?? x?.ok), run: await runOf(q1.id) });
  // (f2) recompute queued first, approve with the pre-recompute expect second ⇒ STALE (not RECOMPUTE)
  const q2 = await PAY.createPayrollRun(c(S5), { periodKey: "2026-10", payDate: pd("2026-10-30") });
  await toPreFix(q2.id);
  const exp2 = await expectOf(q2.id);
  const f2 = await underLock(P, lockKey(S5, "2026-10"), [() => safe(() => PAY.recomputeDraftRun(c(S5), q2.id, ownerA)), () => safe(() => PAY.approveRun(c(S5), q2.id, exp2, ownerA))]);
  log("(f2) recompute∥approve(old expect)", { blocked: f2.blocked, res: f2.res.map((x: any) => x?.code ?? x?.ok), run: await runOf(q2.id) });
  // (f3) two approves on the recomputed q2 ⇒ one OK, one NOT_DRAFT, one JV
  const exp3 = await expectOf(q2.id);
  const f3 = await underLock(P, lockKey(S5, "2026-10"), [() => safe(() => PAY.approveRun(c(S5), q2.id, exp3, ownerA)), () => safe(() => PAY.approveRun(c(S5), q2.id, exp3, ownerA))]);
  log("(f3) approve∥approve", { blocked: f3.blocked, res: f3.res.map((x: any) => x?.code ?? x?.ok), jv: (await entries(q2.id)).length, run: await runOf(q2.id) });
  // (f4) two approves on a PRE-fix draft ⇒ both RECOMPUTE, audit 2, no JV
  const q4 = await PAY.createPayrollRun(c(S5), { periodKey: "2026-11", payDate: pd("2026-11-30") });
  await toPreFix(q4.id);
  const f4 = await underLock(P, lockKey(S5, "2026-11"), [() => safe(() => PAY.approveRun(c(S5), q4.id, undefined, ownerA)), () => safe(() => PAY.approveRun(c(S5), q4.id, undefined, ownerA))]);
  log("(f4) approve∥approve pre-fix", { blocked: f4.blocked, res: f4.res.map((x: any) => x?.code ?? x?.ok), jv: (await entries(q4.id)).length, status: (await runOf(q4.id)).status });
} catch (e) {
  console.log("CRASH", (e as Error)?.stack?.slice(0, 600));
} finally {
  await X.cleanup();
  await X.P.$disconnect?.();
}
