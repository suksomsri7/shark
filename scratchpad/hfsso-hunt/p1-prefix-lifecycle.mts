// probe 1 — PRE-FIX data in production shape: rows stored by the old code (15,000 cap · 9,000 allowance cap · no marker) then every action with the new code
import { setup, short, T, B, PROFILE } from "./common.mjs";
const X = await setup("hunt-hfsso-p1");
const { P, sys, book, emp, c, safe, runOf, itemsOf, entries, linesBy, toPreFix, oldApprove, expectOf, PAY, FS, BK, REP, PS, LAB, V, ownerA, TT } = X;
const log = (k: string, v: unknown) => console.log(`${k}: ${short(v, 420)}`);
const pd = (d: string) => T(`${d}T05:00:00Z`);
try {
  const S = await sys("P1");
  const A = await book("P1");
  const E1 = await emp(S, "E1", { salary: B(20_000) });
  const E2 = await emp(S, "E2", { salary: B(50_000) });
  const E3 = await emp(S, "E3", { salary: B(12_000) });
  const E4 = await emp(S, "E4", { salary: B(50_000), spouse: true, children: 2 });
  await FS.saveFilingProfile(c(S), V.owner, PROFILE);
  for (const [id, n] of [[E1, "หนึ่ง"], [E2, "สอง"], [E3, "สาม"], [E4, "สี่"]] as const) await FS.saveFilingPerson(c(S), V.owner, { employeeId: id, title: "นาย", firstName: n, lastName: "ทดสอบ" });
  // an approved +1,000 bonus for E1 in 2026-10 (gets bound into the pre-fix draft)
  const adj = await P.hrPayAdjustment.create({ data: { tenantId: TT, systemId: S, employeeId: E1, periodKey: "2026-10", kind: "BONUS", amountSatang: B(1_000), status: "APPROVED", note: "qc" } });
  const mkOld = async (pk: string, day: string) => { const r = await PAY.createPayrollRun(c(S), { periodKey: pk, payDate: pd(day) }); await toPreFix(r.id); return r.id as string; };
  const r07 = await mkOld("2026-07", "2026-07-31");
  const r08 = await mkOld("2026-08", "2026-08-31");
  const r10 = await mkOld("2026-10", "2026-10-30");
  const r11 = await mkOld("2026-11", "2026-11-30");
  const r2511 = await mkOld("2025-11", "2025-11-28");
  const j07 = await oldApprove(S, A, r07);
  log("pay07", await PAY.markPaid(c(S), r07));
  const j08 = await oldApprove(S, A, r08);
  for (const id of [r07, r08, r10, r11, r2511]) log(`stored ${(await runOf(id)).pk}`, await runOf(id));
  log("items07", await itemsOf(r07));

  // ── read paths on PAID 07 / APPROVED 08 ──
  const slip = await safe(() => PS.slipForViewer(c(S), V.owner, { runId: r07, employeeId: E2 }));
  log("slip07 E2", slip);
  log("payslipData07 E1", (await PAY.payslipData(c(S), r07, E1))?.item);
  const sso = await safe(() => FS.previewFiling(c(S), V.owner, { kind: "SSO110", runId: r07 }));
  log("SSO110 07", { ok: sso?.ok, code: sso?.code, total: sso?.totalSatang, tax: sso?.taxSatang, lines: sso?.lineCount, rows: (sso?.rows ?? []).map((r: any) => [r.wageSatang ?? r.wage, r.employeeSatang ?? r.contributionSatang ?? r.sso]), ni: sso?.notIncluded, w: sso?.warnings });
  const pnd = await safe(() => FS.previewFiling(c(S), V.owner, { kind: "PND1", period: "2026-07" }));
  log("PND1 07", { ok: pnd?.ok, code: pnd?.code, total: pnd?.totalSatang, tax: pnd?.taxSatang, lines: pnd?.lineCount });
  const bank = await safe(() => BK.previewBankFile(c(S), V.owner, { runId: r07, format: "CSV", presetId: "GENERIC" }));
  log("bank07", { ok: bank?.ok, code: bank?.code, reason: bank?.reason, total: bank?.totalSatang, n: bank?.lineCount ?? bank?.rows?.length });
  const rep = await safe(() => REP.loadReport(c(S), V.owner, { report: "payroll-month", period: "2026-07" }));
  log("report payroll-month 07", { ok: rep?.ok, code: rep?.code, totals: rep?.totals ?? rep?.footer, rows: (rep?.rows ?? []).map((r: any) => r.values ?? r).slice(0, 4) });
  const lab = await safe(() => LAB.laborMonth(c(S), V.owner, { unitId: null, periodKey: "2026-07" }, { now: T("2026-11-14T05:00:00Z") }));
  log("labor 07 (actual = Σ gross + employer SSO = 13,485,000)", { ok: lab?.ok, code: lab?.code, basis: lab?.basis, cost: lab?.costSatang });

  // ── APPROVED 08: recompute refused, rows unchanged ──
  const rc08 = await safe(() => PAY.recomputeDraftRun(c(S), r08, ownerA));
  log("recompute APPROVED 08", rc08);
  log("08 after", await runOf(r08));

  // ── 2026-10 pre-fix DRAFT: approve ⇒ RECOMPUTE (no expect + exact expect) ──
  const a1 = await safe(() => PAY.approveRun(c(S), r10, undefined, ownerA));
  const a2 = await safe(async () => PAY.approveRun(c(S), r10, await expectOf(r10), ownerA));
  log("approve10 noexpect", a1);
  log("approve10 expect", a2);
  log("audit refused 10", await P.auditLog.count({ where: { tenantId: TT, action: "hr.payroll.approve.refused", targetId: r10 } }));
  // cancel-adjustment rebuild path (bound bonus removed) ⇒ new numbers + marker
  const ca = await safe(() => PAY.cancelAdjustment(c(S), adj.id, ownerA));
  log("cancelAdjustment (rebuild)", ca);
  log("10 after cancel", await runOf(r10));
  log("approve10 after rebuild", await safe(async () => PAY.approveRun(c(S), r10, await expectOf(r10), ownerA)));
  log("10 JV", await Promise.all((await entries(r10)).map(async (e: any) => ({ ...e, lines: await linesBy(e.id) }))));

  // ── 2026-11 recompute path ──
  log("approve11 before", (await safe(() => PAY.approveRun(c(S), r11, undefined, ownerA)))?.code);
  log("recompute11", await safe(() => PAY.recomputeDraftRun(c(S), r11, ownerA)));
  log("11 after", await runOf(r11));
  log("approve11", await safe(() => PAY.approveRun(c(S), r11, undefined, ownerA)));

  // ── 2025-11 pre-fix DRAFT approves unchanged ──
  log("approve 2025-11", await safe(() => PAY.approveRun(c(S), r2511, undefined, ownerA)));
  log("2025-11 after", await runOf(r2511));

  // ── reverse APPROVED 08 + re-create ──
  const rv = await safe(() => PAY.reverseRun(c(S), r08, "qc hf-sso", ownerA));
  log("reverse08", rv);
  const n08 = await safe(() => PAY.createPayrollRun(c(S), { periodKey: "2026-08", payDate: pd("2026-08-31") }));
  log("recreate08", n08);
  log("new08", await runOf(n08?.id));
  log("approve new08", await safe(() => PAY.approveRun(c(S), n08?.id, undefined, ownerA)));
  log("pay new08", await PAY.markPaid(c(S), n08?.id));
  for (const [k, id] of [["old08", r08], ["new08", n08?.id]] as const) log(`${k} entries`, await Promise.all((await entries(id)).map(async (e: any) => ({ id: e.id.slice(-6), st: e.status, rof: e.rof?.slice(-6) ?? null, lines: await linesBy(e.id) }))));
  // net per account across old08 + new08 entries
  const net = await X.rows(`SELECT a.code, (sum(l.debit) - sum(l.credit))::bigint AS net FROM "AccountJournalLine" l JOIN "AccountLedger" a ON a.id = l."accountId" JOIN "AccountJournalEntry" e ON e.id = l."entryId" WHERE e."refId" IN ($1, $2) GROUP BY a.code ORDER BY a.code`, r08, n08?.id);
  log("net08 by account (expect = new figures only)", net);
  log("j07 unchanged", await linesBy(j07));
  log("j08 orig id", j08.slice(-6));
  // a second reverse of PAID 07 and re-create: same story with status PAID
  log("reverse07(PAID)", await safe(() => PAY.reverseRun(c(S), r07, "qc hf-sso", ownerA)));
  const n07 = await safe(() => PAY.createPayrollRun(c(S), { periodKey: "2026-07", payDate: pd("2026-07-31") }));
  log("new07", await runOf(n07?.id));
  // documents after reversal + re-create: SSO110/PND1 of 2026-07 now read the new run
  const sso2 = await safe(() => FS.previewFiling(c(S), V.owner, { kind: "PND1", period: "2026-07" }));
  log("PND1 07 after reverse (new run is DRAFT)", { ok: sso2?.ok, code: sso2?.code, total: sso2?.totalSatang, tax: sso2?.taxSatang, lines: sso2?.lineCount });
} catch (e) {
  console.log("CRASH", (e as Error)?.stack?.slice(0, 600));
} finally {
  await X.cleanup();
  await X.P.$disconnect?.();
}
