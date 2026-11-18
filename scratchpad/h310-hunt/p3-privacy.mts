// H3.10 hunter p3 — check E: privacy spot-check as a branch-limited payroll viewer (STAFF u1 + read/pay) and managers without the payroll key
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scratchpad/h310-hunt/p3-privacy.mts
import { type Any, setup, short, OPEN, T, MONTHS, errText } from "./common.mjs";

const S = await setup("h310-p3");
const { u1, u2, V, c, safe, sys, book, fin, emp, create, approve, pay, PAY, OPM, FS, BK, REP, PS } = S;
const out = (k: string, v: unknown) => console.log(`${k} ${typeof v === "string" ? v : short(v, 4000)}`);
const own = V.owner;
const PK = "2031-09";
const NOW = { now: T(MONTHS[PK]![1]) };
const PROFILE = { taxId: "0105555000013", branchNo: "000000", employerName: "บริษัท คิวซี ฮันเตอร์ จำกัด", employerAddress: "1 ถนนทดสอบ แขวงทุ่งพญาไท เขตราชเทวี กรุงเทพมหานคร 10400", deptName: "สำนักงานใหญ่", lto: false, branchType: "", rdUserId: "QCREF00000000000036", rdFormFlag: 2, ssoAccountNo: "9876543210", ssoBranchNo: "000000", ssoEncoding: "TIS620", ssoWageMode: "CLAMPED", signerName: "นายผู้ลงนาม ทดสอบ", certPrefix: "HR50" };
const BOGUS = "zzzzzzzzzzzzzzzzzzzzzzzzz";
let crashed = "";
try {
  const s = await sys("ทีมเป็นส่วนตัว");
  const b = await book("P");
  await PAY.setPayrollBook(c(s), own, { accountSystemId: b });
  const f = await fin(b, "P");
  await PAY.setPayrollPayAccount(c(s), own, { financeAccountId: f });
  const eU1 = await emp(s, "P01", { unit: u1, nid: "1102000123454", salary: 3_000_000 });
  const eU2 = await emp(s, "P02", { unit: u2, nid: "3100600999991", salary: 4_500_000 });
  await FS.saveFilingProfile(c(s), own, PROFILE);
  for (const e of [eU1, eU2]) await FS.saveFilingPerson(c(s), own, { employeeId: e, title: "นาย", firstName: "เอก", lastName: "ทดสอบ" });
  out("fx.opening", await safe(() => OPM.saveOpeningYtd(c(s), own, { employeeId: eU2, taxYear: 2031, ...OPEN, expectRev: null }, { now: T("2031-09-10T05:00:00Z") })));
  const R = (await create(s, PK))?.id as string;
  out("fx.approve", await approve(s, R));
  out("fx.pay", await pay(s, R, PK));
  const bf = await safe(() => BK.generateBankFile(c(s), own, { runId: R, format: "CSV", presetId: "GENERIC" }, NOW));
  const pf = await safe(() => FS.generateFiling(c(s), own, { kind: "PND1", period: PK }, NOW));
  const sc = await safe(() => PS.issueSalaryCertificate(c(s), own, { employeeId: eU2, purpose: "BANK" }, NOW));
  out("fx.docs", { bank: bf?.ok, filing: pf?.ok, cert: sc });
  const call = async (n: string, f: () => Promise<unknown>) => {
    try {
      return await f();
    } catch (e) {
      return { THROW: errText(e), n };
    }
  };
  const rowsOf = (x: Any) => (Array.isArray(x?.rows) ? x.rows.length : Array.isArray(x?.items) ? x.items.length : undefined);
  for (const who of ["payU1", "mgr", "mgrAll", "owner"] as const) {
    const v = V[who];
    const r: Record<string, unknown> = {};
    const pair = async (n: string, real: () => Promise<unknown>, bogus: () => Promise<unknown>) => {
      const a = (await call(n, real)) as Any;
      const z = (await call(n, bogus)) as Any;
      const leak = a?.ok === true || (a && typeof a === "object" && !("ok" in a) && !("THROW" in a));
      r[n] = { real: a?.ok === false ? `NO:${a.code}` : leak ? `DATA(${rowsOf(a) ?? Object.keys(a ?? {}).slice(0, 6).join(",")})` : short(a, 80), sameBytesAsUnknown: a?.ok === false ? JSON.stringify(a) === JSON.stringify(z) : null };
      if (a?.ok === false && JSON.stringify(a) !== JSON.stringify(z)) r[`${n}.diff`] = { real: short(a, 160), unknown: short(z, 160) };
    };
    await pair("bankList", () => BK.listBankFiles(c(s), v, { runId: R }), () => BK.listBankFiles(c(s), v, { runId: BOGUS }));
    await pair("bankDownload", () => BK.downloadBankFile(c(s), v, { fileId: bf?.fileId }, NOW), () => BK.downloadBankFile(c(s), v, { fileId: BOGUS }, NOW));
    await pair("filingDownload", () => FS.downloadFiling(c(s), v, { fileId: pf?.fileId }, NOW), () => FS.downloadFiling(c(s), v, { fileId: BOGUS }, NOW));
    await pair("filingList", () => FS.listFilingFiles(c(s), v, {}), () => FS.listFilingFiles({ tenantId: c(s).tenantId, systemId: BOGUS }, v, {}));
    await pair("slipOtherBranch", () => PS.slipForViewer(c(s), v, { runId: R, employeeId: eU2 }), () => PS.slipForViewer(c(s), v, { runId: R, employeeId: BOGUS }));
    await pair("slipOwnBranch", () => PS.slipForViewer(c(s), v, { runId: R, employeeId: eU1 }), () => PS.slipForViewer(c(s), v, { runId: BOGUS, employeeId: eU1 }));
    await pair("historyOtherBranch", () => PS.slipHistory(c(s), v, { employeeId: eU2, taxYear: 2031 }), () => PS.slipHistory(c(s), v, { employeeId: BOGUS, taxYear: 2031 }));
    await pair("salaryCertList", () => PS.listSalaryCertificates(c(s), v, {}), () => PS.listSalaryCertificates({ tenantId: c(s).tenantId, systemId: BOGUS }, v, {}));
    await pair("salaryCertDownload", () => PS.downloadSalaryCertificate(c(s), v, { certId: sc?.certId }), () => PS.downloadSalaryCertificate(c(s), v, { certId: BOGUS }));
    await pair("openingList", () => OPM.listOpeningYtd(c(s), v, { taxYear: 2031 }), () => OPM.listOpeningYtd({ tenantId: c(s).tenantId, systemId: BOGUS }, v, { taxYear: 2031 }));
    await pair("reportPayrollU2", () => REP.loadReport(c(s), v, { report: "payroll-month", period: PK, unitId: u2 }), () => REP.loadReport(c(s), v, { report: "payroll-month", period: PK, unitId: BOGUS }));
    await pair("reportTaxYear", () => REP.loadReport(c(s), v, { report: "tax-year", period: "2031" }), () => REP.loadReport({ tenantId: c(s).tenantId, systemId: BOGUS }, v, { report: "tax-year", period: "2031" }));
    await pair("runPreview", () => PAY.previewPayrollRunV2(c(s), v, { runId: R }), () => PAY.previewPayrollRunV2(c(s), v, { runId: BOGUS }));
    const rep = (await call("rep", () => REP.loadReport(c(s), v, { report: "payroll-month", period: PK }))) as Any;
    r.reportPayrollAll = rep?.ok ? { rows: rep.rows.map((x: Any) => x.employeeId === eU1 ? "eU1" : x.employeeId === eU2 ? "eU2" : "?"), net: rep.totals?.net } : `NO:${rep?.code}`;
    const ty = (await call("ty", () => REP.loadReport(c(s), v, { report: "tax-year", period: "2031" }))) as Any;
    r.taxYearRows = ty?.ok ? ty.rows.map((x: Any) => (x.employeeId === eU1 ? "eU1" : x.employeeId === eU2 ? "eU2" : "?")) : `NO:${ty?.code}`;
    const cs = await import("@/lib/modules/hr/settings");
    r.canOpenSettingsPage = (cs as Any).canManageHrSettings(v);
    out(`E.${who}`, r);
  }
  // journals card data (rendered for every viewer who opens the HR settings page — service takes no viewer)
  const acct = await safe(() => PAY.getPayrollAccounting(c(s)));
  out("E.accountingCardData", { keys: Object.keys(acct ?? {}), books: acct?.books?.length, payAccounts: acct?.payAccounts, payFinanceAccountId: !!acct?.payFinanceAccountId });
} catch (e) {
  crashed = errText(e);
  console.log(`CRASH ${crashed}`);
} finally {
  await S.cleanup();
}
process.exit(crashed ? 1 : 0);
