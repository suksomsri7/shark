// H3.10 hunter p1 — check B (end-to-end money invariants + reverse + re-run) · check A (stale pay account of the old book) · D2/D3 facts
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scratchpad/h310-hunt/p1-e2e-book.mts
import { type Any, setup, short, satOf, OPEN, T, MONTHS, underLock, errText } from "./common.mjs";

const S = await setup("h310-p1");
const { P, TT, u1, u2, U, V, c, rows, safe, sys, book, fin, emp, create, approve, pay, reverse, runOf, itemsOf, entries, linesBy, PAY, OPM, FS, BK, REP, PS } = S;
const out = (k: string, v: unknown) => console.log(`${k} ${typeof v === "string" ? v : short(v, 900)}`);
const sum = (xs: Any[], k: string) => xs.reduce((t, x) => t + Number(x[k] ?? 0), 0);
let crashed = "";
try {
  // ── fixture ──
  const sA = await sys("ทีม E2E");
  const BA = await book("A");
  const BB = await book("B");
  const own = V.owner;
  out("A0.setBookA", await safe(() => PAY.setPayrollBook(c(sA), own, { accountSystemId: BA })));
  const finA = await fin(BA, "bankA");
  const finB = await fin(BB, "bankB");
  out("A0.setPayA", await safe(() => PAY.setPayrollPayAccount(c(sA), own, { financeAccountId: finA })));
  const e1 = await emp(sA, "E01", { salary: 3_000_000, nid: "1102000123454", unit: u1 });
  const e2 = await emp(sA, "E02", { salary: 2_000_000, nid: "3100600999991", unit: u2 });
  const e3 = await emp(sA, "E03", { salary: 2_500_000, nid: "1500100123451", unit: u1, end: "2031-09-15" });
  const op = await safe(() => OPM.saveOpeningYtd(c(sA), own, { employeeId: e1, taxYear: 2031, ...OPEN, expectRev: null }, { now: T("2031-09-10T05:00:00Z") }));
  out("B0.opening", op);
  const openBefore = await rows(`SELECT id, rev, "incomeSatang" AS i, "whtSatang" AS w, "ssoSatang" AS s, "supersededAt" AS x FROM "HrPayrollOpeningYtd" WHERE "employeeId" = $1 ORDER BY rev`, e1);
  // D2: profile saved WITHOUT rdFormFlag
  const PROFILE = { taxId: "0105555000013", branchNo: "000000", employerName: "บริษัท คิวซี ฮันเตอร์ จำกัด", employerAddress: "1 ถนนทดสอบ แขวงทุ่งพญาไท เขตราชเทวี กรุงเทพมหานคร 10400", deptName: "สำนักงานใหญ่", lto: false, branchType: "", rdUserId: "QCREF00000000000036", ssoAccountNo: "9876543210", ssoBranchNo: "000000", ssoEncoding: "TIS620", ssoWageMode: "CLAMPED", signerName: "นายผู้ลงนาม ทดสอบ", certPrefix: "HR50" };
  out("D2.saveProfileNoFlag", await safe(() => FS.saveFilingProfile(c(sA), own, PROFILE)));
  out("D2.stored", await rows(`SELECT "rdFormFlag" FROM "HrFilingProfile" WHERE "systemId" = $1`, sA));
  out("D2.columnDefault", await rows(`SELECT column_default FROM information_schema.columns WHERE table_name = 'HrFilingProfile' AND column_name = 'rdFormFlag'`));
  for (const [e, f] of [[e1, "เอก"], [e2, "บุษ"], [e3, "ชัย"]] as const) await safe(() => FS.saveFilingPerson(c(sA), own, { employeeId: e, title: "นาย", firstName: f, lastName: "ทดสอบ" }));
  // daily employee on its own system (G-NA11)
  const sD = await sys("ทีมรายวัน");
  await emp(sD, "D01", { payType: "DAILY", salary: 0 });
  out("B0.dailyCreate", await create(sD, "2031-09"));

  // ── B: create → approve → pay ──
  const cr = await create(sA, "2031-09");
  out("B1.create", cr);
  const R1 = cr?.id as string;
  out("B1.approve", await approve(sA, R1));
  out("B1.pay", await pay(sA, R1, "2031-09"));
  const run1 = await runOf(R1);
  const it1 = await itemsOf(R1);
  out("B1.run", run1);
  out("B1.items", it1);
  const SUM = { g: sum(it1, "g"), n: sum(it1, "n"), w: sum(it1, "w"), se: sum(it1, "se"), sr: sum(it1, "sr"), sb: sum(it1, "sb"), inc: sum(it1, "inc"), a: sum(it1, "a"), d: sum(it1, "d") };
  out("B1.itemSums", SUM);
  out("B1.runTotals=items", { g: Number(run1.g) === SUM.g, n: Number(run1.n) === SUM.n, w: Number(run1.w) === SUM.w, se: Number(run1.se) === SUM.se, sr: Number(run1.sr) === SUM.sr, a: Number(run1.a) === SUM.a, d: Number(run1.d) === SUM.d });
  const NOW = T(MONTHS["2031-09"]![1]);
  // bank file
  const bf = await safe(() => BK.generateBankFile(c(sA), own, { runId: R1, format: "CSV", presetId: "GENERIC" }, { now: NOW }));
  out("B2.bank", { ok: bf?.ok, code: bf?.code, items: bf?.itemCount, total: bf?.totalSatang, eqNet: bf?.totalSatang === SUM.n, ni: bf?.notIncluded });
  // filings
  const pnd = await safe(() => FS.generateFiling(c(sA), own, { kind: "PND1", period: "2031-09" }, { now: NOW }));
  out("B3.pnd1", { ok: pnd?.ok, code: pnd?.code, reason: pnd?.reason, lines: pnd?.lineCount, total: pnd?.totalSatang, tax: pnd?.taxSatang, eqInc: pnd?.totalSatang === SUM.inc, eqTax: pnd?.taxSatang === SUM.w, ni: pnd?.notIncluded, w: pnd?.warnings });
  if (pnd?.bytes) out("D2.pnd1Header", Buffer.from(pnd.bytes).toString("latin1").split(/\r?\n/)[0]);
  const sso = await safe(() => FS.generateFiling(c(sA), own, { kind: "SSO110", runId: R1 }, { now: NOW }));
  out("B3.sso110", { ok: sso?.ok, code: sso?.code, reason: sso?.reason, lines: sso?.lineCount, total: sso?.totalSatang, tax: sso?.taxSatang, sb: SUM.sb, se: SUM.se, sr: SUM.sr, ni: sso?.notIncluded });
  // journals
  const en1 = await entries(R1);
  out("B4.entries", en1);
  for (const e of en1) out(`B4.lines.${e.journal}`, await linesBy(e.id));
  const acc = en1.find((e: Any) => String(e.k).endsWith("#accrual"));
  const pe = en1.find((e: Any) => String(e.k).endsWith("#pay"));
  const accL = acc ? await linesBy(acc.id) : [];
  const cr2120 = accL.filter((l: Any) => l.code === "2120").reduce((t: number, l: Any) => t + Number(l.cr), 0);
  out("B4.check", { accBal: acc && Number(acc.dr) === Number(acc.cr), payBal: pe && Number(pe.dr) === Number(pe.cr), cr2120, eqNet: cr2120 === SUM.n, payAmt: pe ? Number(pe.dr) : null, payEqNet: pe ? Number(pe.dr) === SUM.n : null, payBook: pe?.book === BA, accBook: acc?.book === BA });
  // payslips
  const slips: Any[] = [];
  for (const e of [e1, e2, e3]) slips.push(await safe(() => PS.slipForViewer(c(sA), own, { runId: R1, employeeId: e })));
  out("B5.slips", slips.map((s: Any) => ({ ok: s?.ok, state: s?.state, net: s?.netSatang, earn: s?.earningsSatang, ded: s?.deductionsSatang, sso: s?.ssoBaseSatang, er: s?.employerSsoSatang })));
  out("B5.slipNet=item", slips.map((s: Any, i: number) => s?.netSatang === Number(it1.find((x: Any) => x.e === [e1, e2, e3][i])?.n)));
  const hist = await safe(() => PS.slipHistory(c(sA), own, { employeeId: e1, taxYear: 2031 }));
  out("B5.historyE1", hist?.year ?? hist);
  // reports
  const pm = await safe(() => REP.loadReport(c(sA), own, { report: "payroll-month", period: "2031-09" }));
  out("B6.payrollMonth.totals", pm?.totals ?? pm);
  if (pm?.totals) out("B6.pm=items", { g: satOf(pm.totals.gross) === SUM.g, n: satOf(pm.totals.net) === SUM.n, w: satOf(pm.totals.wht) === SUM.w, se: satOf(pm.totals.ssoEmployee) === SUM.se, sr: satOf(pm.totals.ssoEmployer) === SUM.sr, a: satOf(pm.totals.add) === SUM.a, d: satOf(pm.totals.deduct) === SUM.d, rows: pm.rows.length });
  const ty = await safe(() => REP.loadReport(c(sA), own, { report: "tax-year", period: "2031" }));
  out("B6.taxYear", { totals: ty?.totals ?? ty, rows: ty?.rows?.map((r: Any) => r.values) });
  if (ty?.totals) out("B6.ty=items+opening", { inc: satOf(ty.totals.income), want: SUM.inc + OPEN.incomeSatang, wht: satOf(ty.totals.wht), wantW: SUM.w + OPEN.whtSatang, se: satOf(ty.totals.ssoEmployee), wantSe: SUM.se + OPEN.ssoSatang });

  // ── B: reverse ──
  const rv = await reverse(sA, R1);
  out("B7.reverse", rv);
  out("B7.run", await runOf(R1));
  const en2 = await entries(R1);
  const revs = await rows(`SELECT id, "reversalOfId" AS rof, "refId" FROM "AccountJournalEntry" WHERE "reversalOfId" = ANY($1::text[])`, en1.map((e: Any) => e.id));
  out("B7.entriesAfter", en2.map((e: Any) => [e.journal, e.status, e.k, Number(e.dr), Number(e.cr)]));
  out("B7.reversalsPerOriginal", en1.map((e: Any) => [e.journal, revs.filter((r: Any) => r.rof === e.id).length]));
  const net = await rows(`SELECT a.code, sum(l.debit - l.credit)::bigint AS net FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e.id = l."entryId" JOIN "AccountLedger" a ON a.id = l."accountId" WHERE e.id = ANY($1::text[]) GROUP BY a.code ORDER BY a.code`, [...en1.map((e: Any) => e.id), ...revs.map((r: Any) => r.id)]);
  out("B7.perLedgerNet", net.filter((x: Any) => Number(x.net) !== 0));
  out("B7.slipsAfter", (await Promise.all([e1, e2, e3].map((e) => safe(() => PS.slipForViewer(c(sA), own, { runId: R1, employeeId: e }))))).map((s: Any) => s?.state ?? s?.code));
  out("B7.pdfAfter", await safe(() => PS.downloadPayslipPdf(c(sA), own, { runId: R1, employeeId: e1 })).then((x: Any) => ({ ok: x?.ok, code: x?.code })));
  const NOW2 = new Date(NOW.getTime() + 3_600_000);
  out("B7.bankAfter", await safe(() => BK.downloadBankFile(c(sA), own, { fileId: bf?.fileId }, { now: NOW2 })).then((x: Any) => ({ ok: x?.ok, code: x?.code })));
  out("B7.pndAfter", await safe(() => FS.downloadFiling(c(sA), own, { fileId: pnd?.fileId }, { now: NOW2 })).then((x: Any) => ({ ok: x?.ok, code: x?.code })));
  out("B7.ssoAfter", await safe(() => FS.downloadFiling(c(sA), own, { fileId: sso?.fileId }, { now: NOW2 })).then((x: Any) => ({ ok: x?.ok, code: x?.code })));
  out("B7.newPndPreview", await safe(() => FS.previewFiling(c(sA), own, { kind: "PND1", period: "2031-09" }, { now: NOW2 })).then((x: Any) => ({ ok: x?.ok, code: x?.code, total: x?.totalSatang })));
  const pmAfter = await safe(() => REP.loadReport(c(sA), own, { report: "payroll-month", period: "2031-09" }));
  out("B7.pmAfter", { totals: pmAfter?.totals, rows: pmAfter?.rows?.length, status: pmAfter?.rows?.map((r: Any) => r.values.status) });
  const openAfter = await rows(`SELECT id, rev, "incomeSatang" AS i, "whtSatang" AS w, "ssoSatang" AS s, "supersededAt" AS x FROM "HrPayrollOpeningYtd" WHERE "employeeId" = $1 ORDER BY rev`, e1);
  out("B7.openingUntouched", short(openBefore) === short(openAfter));
  out("B7.workDaysUnbound", await rows(`SELECT count(*)::int AS n FROM "HrWorkDay" WHERE "runId" = $1`, R1));
  out("B7.adjBound", await rows(`SELECT count(*)::int AS n FROM "HrPayAdjustment" WHERE "runId" = $1`, R1));
  // re-run
  const cr2 = await create(sA, "2031-09");
  out("B8.recreate", cr2);
  const R2 = cr2?.id as string;
  out("B8.approve", await approve(sA, R2));
  const it2 = await itemsOf(R2);
  const strip = (xs: Any[]) => xs.map((x) => short({ ...x }));
  out("B8.sameItems", short(strip(it1)) === short(strip(it2)));
  if (short(strip(it1)) !== short(strip(it2))) out("B8.items2", it2);
  out("B8.oldPndNowDownloadable", await safe(() => FS.downloadFiling(c(sA), own, { fileId: pnd?.fileId }, { now: NOW2 })).then((x: Any) => ({ ok: x?.ok, code: x?.code })));
  out("B8.oldSsoNow", await safe(() => FS.downloadFiling(c(sA), own, { fileId: sso?.fileId }, { now: NOW2 })).then((x: Any) => ({ ok: x?.ok, code: x?.code })));
  out("B8.oldBankNow", await safe(() => BK.downloadBankFile(c(sA), own, { fileId: bf?.fileId }, { now: NOW2 })).then((x: Any) => ({ ok: x?.ok, code: x?.code })));
  out("B8.pay", await pay(sA, R2, "2031-09"));

  // ── A1: half-done state made directly in the DB: book → B, default pay account still finA (book A) ──
  out("A1.setBookB", await safe(() => PAY.setPayrollBook(c(sA), own, { accountSystemId: BB })));
  out("A1.payDefaultAfterSwitch", (await safe(() => PAY.getPayrollAccounting(c(sA))))?.payFinanceAccountId ?? null);
  await P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = jsonb_set(settings, '{hrPayroll,payFinanceAccountId}', to_jsonb($2::text), true) WHERE id = $1`, sA, finA);
  const acct = await safe(() => PAY.getPayrollAccounting(c(sA)));
  out("A1.stateForced", { bookId: acct?.bookId === BB, payDefault: acct?.payFinanceAccountId === finA, payAccountsShown: acct?.payAccounts?.map((a: Any) => a.id === finB ? "finB" : a.id) });
  const crO = await create(sA, "2031-10");
  const RO = crO?.id as string;
  out("A1.createOct", { ok: crO?.ok, code: crO?.code });
  out("A1.approveOct", await approve(sA, RO));
  out("A1.runOct", { book: (await runOf(RO))?.book === BB ? "BB" : (await runOf(RO))?.book });
  const pDef = await pay(sA, RO, "2031-10");
  out("A1.payDefault(finA)", pDef);
  const pA = await pay(sA, RO, "2031-10", finA);
  out("A1.payExplicitFinA", pA);
  out("A1.afterRefusals", { status: (await runOf(RO))?.status, payEntries: (await entries(RO)).filter((e: Any) => String(e.k).endsWith("#pay")).length, finALines: (await rows(`SELECT count(*)::int AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e.id = l."entryId" WHERE e."refId" = $1 AND e."systemId" = $2`, RO, BA))[0]?.n });
  out("A1.payExplicitFinB", await pay(sA, RO, "2031-10", finB));
  const peO = (await entries(RO)).filter((e: Any) => String(e.k).endsWith("#pay"));
  out("A1.payEntry", peO.map((e: Any) => ({ book: e.book === BB ? "BB" : e.book, dr: Number(e.dr) })));

  // ── A2: deterministic race — setPayrollPayAccount(finB) blocked on hr:clockpolicy while setPayrollBook(BB→BA) runs ──
  out("A2.reset", await safe(() => PAY.setPayrollPayAccount(c(sA), own, { financeAccountId: null })));
  const race = await underLock(P, { key: `hr:clockpolicy:${sA}`, seed: 0 }, [
    () => safe(() => PAY.setPayrollPayAccount(c(sA), own, { financeAccountId: finB })),
    () => safe(() => PAY.setPayrollBook(c(sA), own, { accountSystemId: BA })),
  ], [true, false]);
  out("A2.race", { res: race.res, blocked: race.blocked, holderErr: race.holderErr });
  const acct2 = await safe(() => PAY.getPayrollAccounting(c(sA)));
  out("A2.final", { book: acct2?.bookId === BA ? "BA" : acct2?.bookId === BB ? "BB" : acct2?.bookId, payDefault: acct2?.payFinanceAccountId === finB ? "finB(of BB)" : acct2?.payFinanceAccountId === finA ? "finA" : acct2?.payFinanceAccountId });
  const crN = await create(sA, "2031-11");
  const RN = crN?.id as string;
  out("A2.approveNov", await approve(sA, RN));
  out("A2.runNovBook", (await runOf(RN))?.book === BA ? "BA" : (await runOf(RN))?.book);
  out("A2.payDefault", await pay(sA, RN, "2031-11"));
  out("A2.afterRefusal", { status: (await runOf(RN))?.status, entries: (await entries(RN)).map((e: Any) => [e.k.split("#").pop(), e.book === BA ? "BA" : "BB"]) });
  // two setPayrollBook racing (held link lock): X → BB, Y → BA
  const lk = `account:hr-payroll-link:${TT}:${sA}`;
  await safe(() => PAY.setPayrollPayAccount(c(sA), own, { financeAccountId: null }));
  await safe(() => PAY.setPayrollPayAccount(c(sA), own, { financeAccountId: finA }));
  const race2 = await underLock(P, { key: lk, seed: 0 }, [
    () => safe(() => PAY.setPayrollBook(c(sA), own, { accountSystemId: BB })),
    () => safe(() => PAY.setPayrollBook(c(sA), own, { accountSystemId: BA })),
  ]);
  const acct3 = await safe(() => PAY.getPayrollAccounting(c(sA)));
  out("A2.twoBooks", { res: race2.res, blocked: race2.blocked, book: acct3?.bookId === BA ? "BA" : acct3?.bookId === BB ? "BB" : acct3?.bookId, link: acct3?.link, payDefault: acct3?.payFinanceAccountId === finA ? "finA" : acct3?.payFinanceAccountId === finB ? "finB" : acct3?.payFinanceAccountId });

  // ── D3: law rows present on the lane DB (not ours) + arithmetic ──
  out("D3.laneSsoRows", await rows(`SELECT "sourceKey", kind::text, "effectiveFrom"::text AS f, status::text, json->>'maxBaseSatang' AS max, json->>'minBaseSatang' AS min, json->>'rateBp' AS bp FROM "HrLawTable" WHERE kind::text = 'SSO' AND "sourceKey" NOT LIKE 'qc-h310hunt-%' ORDER BY "effectiveFrom", "sourceKey"`));
  const V2 = (await import("@/lib/modules/hr/payroll-rules-v2")) as Any;
  const PR = (await import("@/lib/modules/hr/payroll-rules")) as Any;
  const base = { rateBp: 500, minBaseSatang: 165000, rounding: "BAHT_HALF_UP", employerEqualsEmployee: true };
  out("D3.v2.15000", V2.ssoV2(2_000_000, { ...base, maxBaseSatang: 1_500_000 }));
  out("D3.v2.17500", V2.ssoV2(2_000_000, { ...base, maxBaseSatang: 1_750_000 }));
  out("D3.v1.default", PR.ssoContribution(2_000_000));
} catch (e) {
  crashed = errText(e);
  console.log(`CRASH ${crashed}`);
} finally {
  await S.cleanup();
}
process.exit(crashed ? 1 : 0);
