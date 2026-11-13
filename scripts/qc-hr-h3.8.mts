// QC — HR V2 · H3.8 payslip (in-app 07c + PDF) · yearly history by tax year · salary certificate (หนังสือรับรองเงินเดือน, PDF)
//      brief ledger/hr-briefs/hr-brief-H3.8.md (DRAFT · Q-list defaults) + notes ledger/wo-notes/hr-H3.8-oracle.md (vectors with arithmetic)
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// 🔴 A slip is a SNAPSHOT: every number comes from stored HrPayrollItem columns + snapshotJson (H3.4 v2 lines / v1 snapshot). Vectors are hand
//    arithmetic (scripts/qc-hr-h3.8-lib.mts). Yearly totals must reconcile with the H3.6 50 ทวิ figures of the same year (S3.7, real H3.6 service).
// 🔴 Authorisation from DB membership (passed viewer claims are never enough) · self = resolveSelf → employeeOfUser · refusals = {ok, code, reason} only.
// Tenants qc-hr-h38-<stamp> · runs dated 2031–2032 · opts.now injected · SKIP while hr/payslip-rules.ts is absent (QC_FORCE=1 runs) · --list
// Base for statics = baseRef("QC_H38_BASE") + pathInBase guard (never a hard-coded sha)
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h3.8.mts
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  type Any, type Base, type Sev, ROOT, rd, short, errText, textOf, srt, failedKeys, stripComments, canon, sha, keysDeep, jsonOf, loadOpt, modState,
  PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, baseRef, pathInBase, changedVsBase, diffHunks, fileAt, makeRegistry, qc4Env, makeFixtures, cleanupFx, residueOf,
  vOf, fitnessNoEnv, importsOf, tagOf, HR_FORBIDDEN_DTO_KEYS, msgParity, testidsOf, tokensOnly, useServerFile,
} from "./qc-hr-lib.mjs";
import { pdfPagesText, thNorm } from "./qc-hr-h3.6-lib.mjs";
import { VECS, VEC, V9, V10, K, STATE_TABLE, TEXT_KEYS, LAW_CLAIM, EARN_CODES, DEDUCT_CODES, brokenItems, prng, randomItem, holdRunRow, v1Item, type ItemIn } from "./qc-hr-h3.8-lib.mjs";

const SUITE = "qc-hr-h3.8";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-h38-";
const H = "src/lib/modules/hr/";
const F = {
  rules: `${H}payslip-rules.ts`, svc: `${H}payslip.ts`, pdf: `${H}payslip-pdf.tsx`, route: `${H}payslip-route.ts`, acts: `${H}payslip-actions.ts`, ui: `${H}payslip-ui.tsx`,
  priv: `${H}privacy.ts`, self: `${H}self.ts`, selfUi: `${H}self-ui.tsx`, inbox: `${H}inbox.ts`, inboxShared: `${H}inbox-shared.ts`,
  rMeSlip: "src/app/app/me/hr/pay/[runId]/pdf/route.ts", rMeCert: "src/app/app/me/hr/salary-cert/[certId]/route.ts",
  rGateSlip: "src/app/app/sys/[id]/payroll/[runId]/slip/[employeeId]/pdf/route.ts", rGateCert: "src/app/app/sys/[id]/hr/payroll/salary-cert/[certId]/route.ts",
  pMeSlip: "src/app/app/me/hr/pay/[runId]/page.tsx", pMePay: "src/app/app/me/hr/pay/page.tsx", pGateSlip: "src/app/app/sys/[id]/payroll/[runId]/slip/[employeeId]/page.tsx",
  pPayroll: "src/app/app/sys/[id]/hr/payroll/page.tsx", schema: "prisma/schema/payroll.prisma", hrSchema: "prisma/schema/hr.prisma", scope: "src/lib/core/scope.ts",
  env: "scripts/hr-qc-env.mts", th: "src/messages/th/common.json", en: "src/messages/en/common.json", inv: "scripts/hr-ui-inventory.json", visual: "scripts/visual-hr.mts",
};
const ROUTES = [F.rMeSlip, F.rMeCert, F.rGateSlip, F.rGateCert];
const ROUTE_HELPER: Record<string, string> = { [F.rMeSlip]: "myPayslipPdfGet", [F.rMeCert]: "mySalaryCertGet", [F.rGateSlip]: "payslipPdfGet", [F.rGateCert]: "salaryCertGet" };
const FROZEN = [
  PAYROLL_RULES_FILE, `${H}payroll.ts`, `${H}payroll-actions.ts`, `${H}payroll-ui.tsx`, `${H}payroll-run-rules.ts`, `${H}payroll-run-ui.tsx`, `${H}payroll-rules-v2.ts`, `${H}payroll-digest.ts`,
  `${H}law.ts`, `${H}service.ts`, `${H}scope.ts`, `${H}privacy-shared.ts`, `${H}filings`, `${H}bank-files`, "src/lib/modules/account", "src/lib/modules/approval", "src/lib/outbox-consumers.ts",
  "src/lib/core/rbac.ts", "scripts/seed-hr-qc.mts", "scripts/fitness-hr.mts", "scripts/qc-hr-lib.mts", "scripts/qc-hf-hr-privacy.mts", "scripts/qc-hr-h3.6.mts", "scripts/qc-hr-h3.6-lib.mts",
  "scripts/qc-hr-h2.10.mts", "scripts/with-gate-lock.sh", "package.json", "pnpm-lock.yaml",
];
const MARKED = [F.priv, F.self, F.selfUi, F.pMePay, F.pGateSlip, F.pPayroll, F.schema, F.hrSchema, F.scope, F.env, F.inbox, F.inboxShared, F.visual];
const TESTIDS = [
  "hr-slip", "hr-slip-state", "hr-slip-status", "hr-slip-net", "hr-slip-bank", "hr-slip-earnings", "hr-slip-deductions", "hr-slip-line-*", "hr-slip-earnings-total", "hr-slip-deductions-total",
  "hr-slip-pdf", "hr-slip-cert", "hr-slip-history", "hr-slip-hist-*", "hr-slip-note", "hr-slip-years", "hr-slip-year-*",
  "hr-salarycert-mine", "hr-salarycert-purpose", "hr-salarycert-submit", "hr-salarycert-mine-*", "hr-salarycert-dl-*", "hr-salarycert-cancel-*",
  "hr-salarycert", "hr-salarycert-req-*", "hr-salarycert-issue-*", "hr-salarycert-reject-*", "hr-salarycert-new", "hr-salarycert-row-*", "hr-salarycert-gdl-*", "hr-salarycert-void-*",
];
const SLIP_LINE_CODES = ["BASE", "DAY_WAGE", "HOUR_WAGE", "HOLIDAY_PAY", "HOLIDAY_WORK", "PRORATION", "UNPAID_LEAVE", "UNPAID_CAP", "OT", "COMMISSION", "BONUS", "ALLOWANCE", "REFUND", "LATE_RULE", "ABSENT_RULE", "ADVANCE", "DEDUCTION", "V1_OTHER", "SSO", "WHT"];
const PURPOSES = ["GENERAL", "BANK", "VISA", "RENTAL", "OTHER"];
const AUDIT_ACTIONS = ["hr.payslip.download", "hr.salarycert.request", "hr.salarycert.cancel", "hr.salarycert.issue", "hr.salarycert.reject", "hr.salarycert.void", "hr.salarycert.download"];
const PURE_EXPORTS = ["slipView", "slipState", "taxYearOf", "yearTotals", "salaryCertContent", "salaryCertDocNo", "SLIP_TEXT", "SLIP_TEXT_EN", "slipTextFor", "SLIP_PURPOSES"];

const SEV: Record<string, Sev> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS = `
S1.1|R1|C|R|[static] migration 20270110000000_hr_payslip*: CREATE TABLE HrSalaryCertificate · CHECK status/purpose/ISSUED completeness · UNIQUE (systemId, docNo) · partial unique open request · FK HrEmployee RESTRICT · additive only
S1.2|R1|C|R|[static] payroll.prisma model HrSalaryCertificate (HrPayrollRun/HrPayrollItem blocks unchanged) · hr.prisma back-relation · core/scope.ts sys() · hr-qc-env entry
S1.3|R2|C|R|[static] pure payslip-rules.ts: value imports ⊆ account/totals · account/doc-numbering · ./filings/figures · no db/clock/random/fetch · exports ${PURE_EXPORTS.length} names
S1.4|R3|C|R|[static] no recompute: payslip*.ts(x) import no payroll-rules*/payroll-run-rules (value)/law/ot-rules · no ssoContribution/ssoV2/whtYtdV2/monthlyWhtSatang/computeRunItemV2/computeItem · no HrSalaryProfile/ytdJson/lawRowIds/filingJson/hrLawTable
S1.5|R9|C|R|[static] PDF reuses the existing path: payslip-pdf.tsx imports @react-pdf/renderer + Sarabun from public/fonts/sarabun + wrapPdf (account/public-doc-pdf) · package.json dependencies identical to base (no new library)
S1.6|frozen|C|G|[static] [control] payroll-rules sha · frozen files/dirs unchanged vs base (payroll*.ts, law, service, filings, bank-files, account, approval, rbac, seed, qc-hr-lib, privacy suite, gate lock, package.json)
S1.7|§5|M|R|[static] marked hunks "HR H3.8": ≥ 1 hunk in each of privacy.ts · self.ts · self-ui.tsx · me/hr/pay page · slip page · payroll page · payroll.prisma · hr.prisma · core/scope.ts · hr-qc-env · inbox.ts · inbox-shared.ts · visual-hr.mts — every hunk marked
S1.8|R13|C|R|[static] 4 routes: GET → payslip-route helper · HEAD exported = 405 · rsc/prefetch answered before requireTenant · runtime nodejs · no prisma/tenantDb/nationalId in route files
S1.9|R6|C|R|[static] self surfaces never take an employeeId: me/hr pages + routes have no employeeId · every exported my*/requestSalaryCertificate/cancelMySalaryCertRequest calls resolveSelf and reads no input employeeId
S1.10|R10|C|R|[static] client boundary: payslip-ui.tsx is a server module · no "use client" file under hr/ imports payslip(.ts)/payslip-pdf/payslip-route/payslip-rules (value) · new client files name no nationalId/bankAccountNo/contentJson
S1.11|R7 R11|C|R|[static] payslip.ts gate reads membership from DB · does not import hrViewerOf · 7 audit action names · payslip-actions.ts "use server" wrappers calling requireTenant()
S1.12|R14|M|R|[static] UI testids (mockup 07c regions + certificate cards) · inventory rows wo H3.8 both ways · messages hr.slip / hr.slipLine (20 codes) / hr.salaryCert th = en · visual-hr SPECS["3.8"] · tokens only
S2.1|R12|C|R|[pure] SLIP_TEXT / SLIP_TEXT_EN: ${TEXT_KEYS.length} keys both · th Thai, en ASCII · slipTextFor(locale) · no law-as-fact wording (เพดาน · ไม่ถึงเกณฑ์ · ตามกฎหมาย · 5 %)
S2.2|R4|C|R|[pure] V1 plain monthly: earnings 16,000 · deductions 750 (SSO) + 0 (WHT) · net 15,250 — exact view
S2.3|R4|C|R|[pure] V2 mockup 07c: BASE 16,000 · OT 600 · COMMISSION 1,200 (count 2) | LATE_RULE 150 (count 3) · SSO 750 · WHT 0 ⇒ 17,800 − 900 = 16,900 — exact view
S2.4|R4|C|R|[pure] V3 mid-month starter: PRORATION −14,000 stays inside earnings (qty 16) ⇒ 16,000 − 750 = 15,250
S2.5|R4|C|R|[pure] V4 refund + advance: REFUND 500 earnings · ADVANCE 3,000 deduction ⇒ 20,500 − 3,750 = 16,750
S2.6|R4|C|R|[pure] V5 SSO cap + WHT: ssoBase = stored 17,500 · SSO 875 · WHT 2,708.33 ⇒ net 46,416.67 (no rate/cap computed)
S2.7|R4|C|R|[pure] V6 bonus with one-off WHT: 40,000 − 2,125 = 37,875
S2.8|R4|C|R|[pure] V7 legacy v1 (adjustment notes never in the view) · V8 v1 without detail ⇒ balancing V1_OTHER 500 + flag
S2.9|R4|C|R|[pure] broken stored data B1–B10 ⇒ {ok:false, code:"SLIP_DATA"} (Σ lines ≠ gross · net ≠ gross − SSO − WHT · negative · non-integer · unknown code · engine 3 · null)
S2.10|R4|C|R|[pure] properties ×60 seeded v2 items: earnings − deductions = net exactly · Σ lines per section = section total · sections by code · deterministic · input not mutated
S2.11|R5|C|R|[pure] slipState: 10-row table (v1 APPROVED/PAID issued · v2 needs stepsJson.finalized · REVERSED ⇒ WITHDRAWN · DRAFT)
S2.12|R8|C|R|[pure] taxYearOf = Bangkok year of payDate (31 Dec 17:30Z ⇒ next year) · yearTotals sums count/gross/income/tax/sso/net per year, newest first · income = 40(1) income (H3.6 itemFigures)
S2.13|R11|C|R|[pure] salaryCertContent exact (MONTHLY_BASE · bahtText words · disclaimer = certNote · no ID) · salaryCertDocNo(1|12, 2032-01-10) = HRSC-2032-0001 | -0012 via formatDocNo
S2.14|R9|C|R|[pure] renderPayslipPdf(V2 slip): %PDF · 1 page · 16,900.00 / 17,800.00 / 900.00 · name · bank •••4321 only · renderSalaryCertPdf: %PDF · docNo · 18,000.00
S3.0|fix|C|G|[db] [control] fixture: 8 runs in system A (v1 PAID · v2 APPROVED/PAID finalized · REVERSED · DRAFT · APPROVED unfinalized · Dec run paid in Jan) + system B · Σ items = run totals
S3.1|R4 R10|C|R|[db] slipForViewer (owner) = vectors on stored rows: e1 RA2 = V2 · e2 RA3 = V3 · e3 RA7 = V5 · e4 RA1 = V7 · full DTO incl. payDate/taxYear/state/bankMasked "KBank •••4321"
S3.2|R3|C|R|[db] snapshot only: a new HrSalaryProfile (99,999) changes nothing · tampered stored net ⇒ SLIP_DATA (in-app + PDF), never repaired · restored ⇒ ok
S3.3|R5|C|R|[db] states: gate in-app DRAFT / NOT_FINAL / WITHDRAWN shown with state · PDF refuses NOT_ISSUED / NOT_FINAL / WITHDRAWN with fixed texts · self gets NO for all three
S3.4|R6 R8|C|R|[db] mySlips (self e4): own ISSUED slips only grouped by tax year · 2031 count 2 · gross 31,400 · income 31,600 · SSO 1,500 · net 29,900 · rows newest first · href /app/me/hr/pay/<runId>
S3.5|R6|C|R|[db] mySlip: own RA1/RA2 ok (= V7 / V1) · RA3 (not in run) · RA4 reversed · RA6 unfinalized · unknown id · unlinked member ⇒ NO (identical bytes)
S3.6|R8|C|R|[db] slipHistory e1: 2031 = 4 slips · gross 105,150 · income 107,650 · tax 1,750 · SSO 3,125 · net 100,275 · 2032 = Dec run paid 5 Jan 2032 (1 slip · 18,000)
S3.7|R8|C|R|[db] reconcile with H3.6: issueTaxCertificate ANNUAL 2031 for e1 (real H3.6 service) ⇒ contentJson total 107,650 · tax 1,750 · SSO fund 3,125 = slipHistory 2031 income/tax/SSO
S3.8|R9 R11|C|R|[db] gate PDF: %PDF bytes · fileName payslip-<period>[-code].pdf without name/ID · audit hr.payslip.download after keys exact {runId, employeeId, periodKey, by:GATE} · no outbox · no stored bytes
S3.9|R6 R11|C|R|[db] self PDF: own RA2 ok + audit by SELF · RA3 / RA6 / unknown / member ⇒ NO (identical) · nothing audited on refusal
S3.10|R7|C|R|[db] matrix 12 viewers × (in-app · PDF · history) for e1: owner / payroll all-branch / read-only payroll / branch payroll ok · managers · HR staff · member · self · other tenant · 2 forged ⇒ NO · branch payroll ⇒ NO for e5 (home u2) and e6 (borrowed into u1)
S3.11|R7|C|R|[db] forged claims ignored: passed role OWNER over a STAFF membership · passed hr.payroll.read · self actor carrying employeeId/systemId of e1 ⇒ still only e4 / NO
S3.12|R12|C|R|[db] every refusal = exactly {ok:false, code, reason} with the fixed text · unknown run · other tenant · no right · other branch · other's slip ⇒ identical bytes
S3.13|R10|C|R|[db] DTO keys exact (slip · employee · line · mine · year · row · history · certificate rows) · no HR_FORBIDDEN_DTO_KEYS · no national ID / full bank number in any DTO
S3.14|R11|C|R|[db] salary-cert request (self): REQUESTED row + audit · cancel ⇒ CANCELLED · second open ⇒ certReqOpen · bad purpose ⇒ purpose · ended ⇒ inactive · unlinked ⇒ NO · self cannot issue (gate fn ⇒ NO)
S3.15|R11 Q3|C|R|[db] inbox (default Q3): owner's listInbox type CERT lists e4's request without any ฿ key · MANAGER without gate does not see it · decideInbox APPROVED ⇒ ISSUED HRSC-2032-0002
S3.16|R11|C|R|[db] owner issues e1 (no request) ⇒ HRSC-2032-0001 · content salary = BASE 18,000 of the latest issued slip (2031-12) · contentSha256 = sha(canon(content)) · no 13-digit ID · audit keys · counter (HR system, WHT_CERT, HRSC:2032) · no AccountDocument
S3.17|R11|C|R|[db] issue refusals consume no number: no slip ⇒ certNoSlip · daily payer ⇒ certNoBase · system without profile ⇒ profile · gate holder for own employee ⇒ own · read-only / manager ⇒ NO · reject ⇒ REJECTED then notDecidable
S3.18|R11|C|R|[db] frozen certificate: renamed employee ⇒ PDF still shows issued name · tampered content ⇒ certChanged · void owner only (certVoidOwner) · reason 1–200 · voided ⇒ voided · reissue ⇒ HRSC-2032-0003 (no reuse)
S3.19|R6 R11|C|R|[db] self certificates: own live ISSUED listed + PDF (audit by SELF) · e1's certId ⇒ NO · voided ⇒ hidden + NO
S3.20|R5 R8|C|R|[db] reversed run (after S4.1): history 2031 for e1 = 3 slips · gate PDF ⇒ withdrawn · certificate source skips it
S3.21|R6|C|R|[db] H2.10 myDocuments keeps its keys but lists ISSUED slips only (RA2, RA1 — not RA6 unfinalized / RA4 reversed) with href /app/me/hr/pay/<runId>
S4.1|X6|C|R|[db] hold RA7 row FOR UPDATE ⇒ gate PDF read waits on the lock (seen in pg_stat_activity) · holder flips RA7 to REVERSED and commits ⇒ the read answers WITHDRAWN (no stale slip)
S4.2|X6|C|R|[db] 5 parallel self requests ⇒ 1 REQUESTED + 4 certReqOpen · 4 parallel issues of that request ⇒ 1 ISSUED HRSC-2032-0005 + 3 notDecidable (0004 = S5.1) · counter lastNo 5 · numbers 0001–0005 contiguous
S5.1|R13|C|R|[db] route helpers: rsc / prefetch ⇒ 204, nothing audited · GET ⇒ 200 application/pdf attachment no-store nosniff safe file name · refusal ⇒ 404/409 fixed text (th/en) no bytes · self + certificate helpers
S5.2|R13|C|R|[db] HEAD / POST to the 4 helpers ⇒ 405 Allow GET before any read · no audit row
S5.3|R14|M|R|[static] pages link with a highlighted <a download> to the PDF routes · no action redirects to a PDF/certificate route
S6.1|hotfix|C|G|[db] [control] loadPayslipForViewer (HF-HR-0): self opens own APPROVED v1 slip · member null · owner opens a DRAFT
S6.2|R5|C|R|[db] loadPayslipForViewer (marked hunk): self + v2 APPROVED unfinalized ⇒ null · self + REVERSED ⇒ null
S6.3|R11 X11|C|R|[db] audit rows of H3.8 actions carry no national ID / name / ฿ key · no outbox event from any H3.8 call
S6.4|X11|C|R|[db] PDFs: slip shows no national ID, no full account (•••4321 only), no colleague's name · certificate shows no national ID
X12.1|X12|M|G|[run] fitness + fitness-hr without env ⇒ exit 0
Z1|house|C|G|no residue (HrSalaryCertificate · HrTaxCertificate · HrFilingPerson/Profile · AccountDocSequence of the QC tenants)
`.trim().split("\n").map((l) => {
  const [id, g, sv, b, t] = l.split("|");
  return [`H3.8-${id}`, g, SEV[sv], (b === "R" ? "RED" : "GREEN") as Base, t] as const;
});
const { chk, printList, skipExit, finish } = makeRegistry(SUITE, "H3.8-", CHECKS);
if (ARGV.includes("--list")) {
  printList();
  process.exit(0);
}
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, F.rules))) skipReasons.push(`${F.rules} absent (H3.8 not built)`);
if (skipReasons.length && !FORCE) skipExit(skipReasons);
const ck = (id: string, r: Record<string, unknown>, exp: string, extra = "") => chk(id, Object.values(r).every(Boolean), exp, `${failedKeys(r)}${extra ? ` ${extra}` : ""}`);
const BASE = baseRef("QC_H38_BASE");
const IN_BASE = !!BASE && pathInBase(F.rules, BASE);
const exists = (p: string) => existsSync(join(ROOT, p));
const bodies = (src: string) => [...src.matchAll(/export\s+async\s+function\s+(\w+)\s*\(([\s\S]*?)(?=\nexport\s|$)/g)].map((m) => ({ name: m[1]!, body: m[2]! }));
function listDirDeep(d: string, out: string[] = []): string[] {
  const abs = join(ROOT, d);
  if (!existsSync(abs)) return out;
  for (const n of readdirSync(abs, { withFileTypes: true })) {
    const p = `${d}${n.name}`;
    if (n.isDirectory()) listDirDeep(`${p}/`, out);
    else out.push(p);
  }
  return out;
}
const migFile = (): string => {
  const d = "prisma/migrations/";
  const hit = exists(d) ? readdirSync(join(ROOT, d)).find((n) => n.startsWith("20270110000000_hr_payslip")) : undefined;
  return hit ? rd(`${d}${hit}/migration.sql`) : "";
};
const modelBlock = (s: string, m: string) => {
  const i = s.indexOf(`model ${m} {`);
  return i < 0 ? "" : s.slice(i, s.indexOf("\n}", i) + 2);
};
const payslipFiles = () => [F.rules, F.svc, F.pdf, F.route, F.acts, F.ui].filter(exists);

// ═════════════════════════ statics ═════════════════════════
function runStatic(): void {
  console.log(`── [static] base ${BASE.slice(0, 9) || "?"}${IN_BASE ? " (H3.8 in base)" : ""} ──`);
  {
    const s = migFile();
    const noOther = !/\bDROP\b/i.test(s) && !/ALTER\s+TYPE/i.test(s) && [...s.matchAll(/ALTER\s+TABLE\s+"(\w+)"/gi)].every((m) => m[1] === "HrSalaryCertificate");
    ck("S1.1", {
      file: !!s, table: /CREATE TABLE "HrSalaryCertificate"/.test(s), status: /CHECK[\s\S]{0,200}REQUESTED[\s\S]{0,80}ISSUED[\s\S]{0,80}REJECTED[\s\S]{0,80}CANCELLED/.test(s),
      purpose: PURPOSES.every((p) => new RegExp(`'${p}'`).test(s)), issuedComplete: /status"?\s*<>\s*'ISSUED'[\s\S]{0,300}"docNo"\s+IS NOT NULL/i.test(s),
      docNo: /UNIQUE INDEX[^;]*\("systemId",\s*"docNo"\)/.test(s), openReq: /UNIQUE INDEX[^;]*\("systemId",\s*"employeeId"\)[^;]*WHERE[^;]*REQUESTED/i.test(s),
      fk: /REFERENCES "HrEmployee"\("id"\) ON DELETE RESTRICT/.test(s), additive: noOther,
    }, "migration shape", s ? "" : "∅ migration");
  }
  {
    const p = rd(F.schema);
    const pb = BASE ? (fileAt(BASE, F.schema) ?? "") : "";
    ck("S1.2", {
      model: /model HrSalaryCertificate \{/.test(p), runSame: !!pb && modelBlock(p, "HrPayrollRun") === modelBlock(pb, "HrPayrollRun"), itemSame: !!pb && modelBlock(p, "HrPayrollItem") === modelBlock(pb, "HrPayrollItem"),
      back: /HrSalaryCertificate\[\]/.test(rd(F.hrSchema)), scope: /HrSalaryCertificate:\s*sys\(\)/.test(rd(F.scope)), env: /hrSalaryCertificate/.test(rd(F.env)),
    }, "schema + registries");
  }
  {
    const s = stripComments(rd(F.rules));
    const allowed = new Set(["@/lib/modules/account/totals", "@/lib/modules/account/doc-numbering", "./filings/figures"]);
    const bad = importsOf(s).filter((i) => !i.type && !allowed.has(i.spec)).map((i) => i.spec);
    const exp = PURE_EXPORTS.filter((n) => !new RegExp(`export\\s+(async\\s+)?(function|const|type)\\s+${n}\\b`).test(s));
    ck("S1.3", { file: !!s, imports: bad.length === 0, impure: !/tenantDb|prisma|Date\.now|new Date\(\)|Math\.random|fetch\(|randomUUID|node:crypto/.test(s), exports: exp.length === 0 }, "pure layer", `bad=${bad.join(",") || "-"} missing=${exp.join(",") || "-"}`);
  }
  {
    const files = payslipFiles();
    const imp = files.flatMap((f) => importsOf(stripComments(rd(f))).filter((i) => !i.type && /payroll-rules|payroll-run-rules|\/law$|\.\/law"?$|ot-rules/.test(i.spec)).map((i) => `${f}:${i.spec}`));
    const tok = files.filter((f) => /ssoContribution|ssoV2|whtYtdV2|monthlyWhtSatang|computeRunItemV2|computeItem|hrSalaryProfile|HrSalaryProfile|ytdJson|lawRowIds|filingJson|hrLawTable/.test(stripComments(rd(f))));
    ck("S1.4", { files: files.length >= 4, imports: imp.length === 0, tokens: tok.length === 0 }, "stored data only", `files=${files.length} ${imp.join(",")} ${tok.join(",")}`);
  }
  {
    const s = stripComments(rd(F.pdf));
    const pkg = (t: string) => { try { const j = JSON.parse(t); return canon({ d: j.dependencies, dd: j.devDependencies }); } catch { return "x"; } };
    const pkgSame = !!BASE && pkg(rd("package.json")) === pkg(fileAt(BASE, "package.json") ?? "");
    ck("S1.5", { file: !!s, reactPdf: /@react-pdf\/renderer/.test(s), sarabun: /Sarabun/.test(s) && /sarabun/.test(s), wrap: /wrapPdf/.test(s) && /account\/public-doc-pdf|filings\/cert-pdf/.test(s), pkgSame }, "existing PDF path + no new dependency");
  }
  {
    const rulesSha = sha(rd(PAYROLL_RULES_FILE));
    const diff = IN_BASE ? "unchanged" : BASE ? changedVsBase(BASE, FROZEN) : "no base";
    ck("S1.6", { rules: rulesSha === PAYROLL_RULES_SHA, frozen: diff === "unchanged" }, "frozen", IN_BASE ? "n/a · H3.8 in base" : diff);
  }
  {
    const bad: string[] = [];
    if (!IN_BASE)
      for (const f of MARKED) {
        const hs = BASE ? diffHunks(BASE, f) : null;
        if (!hs || hs.length === 0) bad.push(`${f.split("/").pop()}:none`);
        else if (!hs.every((h) => h.added.some((l) => l.includes("HR H3.8")))) bad.push(`${f.split("/").pop()}:unmarked`);
      }
    chk("S1.7", bad.length === 0, "marked hunks in 13 files", IN_BASE ? "n/a · H3.8 in base" : bad.join(" ") || "ok");
  }
  {
    const bad: string[] = [];
    for (const r of ROUTES) {
      const s = stripComments(rd(r));
      if (!s) { bad.push(`${r.split("/app/").pop()}:∅`); continue; }
      const iR = s.search(/["']rsc["']/);
      const iT = s.indexOf("requireTenant");
      const ok = /export\s+async\s+function\s+GET/.test(s) && /export\s+(async\s+)?function\s+HEAD/.test(s) && /status:\s*405/.test(s) && iR >= 0 && iT > iR && new RegExp(`\\b${ROUTE_HELPER[r]}\\(`).test(s) && /runtime\s*=\s*["']nodejs["']/.test(s) && !/prisma|tenantDb|nationalId/.test(s);
      if (!ok) bad.push(r.split("/app/").pop()!);
    }
    chk("S1.8", bad.length === 0, "4 routes ok", bad.join(" ") || "ok");
  }
  {
    const me = [F.rMeSlip, F.rMeCert, F.pMeSlip, F.pMePay].map((f) => stripComments(rd(f)));
    const sv = stripComments(rd(F.svc));
    const selfFns = bodies(sv).filter((b) => /^(my|requestSalaryCertificate|cancelMySalaryCertRequest|downloadMy|listMy)/.test(b.name));
    const badFns = selfFns.filter((b) => !/resolveSelf\(/.test(b.body) || /\b(input|i|q|args|params|o)\s*(\?\.|\.)\s*employeeId\b|\[\s*["']employeeId["']\s*\]/.test(b.body)).map((b) => b.name);
    ck("S1.9", { pages: me.every(Boolean) && me.every((s) => !/employeeId/.test(s)), fns: selfFns.length >= 6, resolve: badFns.length === 0 }, "self from session only", `selfFns=${selfFns.length} bad=${badFns.join(",") || "-"}`);
  }
  {
    const ui = rd(F.ui);
    const clients = listDirDeep(H).filter((f) => /\.tsx?$/.test(f) && /^\s*["']use client["']/.test(rd(f)));
    const imp = clients.filter((f) => importsOf(rd(f)).some((i) => !i.type && /payslip(-pdf|-route|-rules)?$/.test(i.spec))).map((f) => f.split("/").pop());
    const fresh = clients.filter((f) => BASE && !pathInBase(f, BASE)).filter((f) => /nationalId|bankAccountNo|contentJson/.test(stripComments(rd(f)))).map((f) => f.split("/").pop());
    ck("S1.10", { ui: !!ui && !/^\s*["']use client["']/.test(ui), imports: imp.length === 0, fresh: fresh.length === 0 }, "server ui · clean client files", `${imp.join(",")} ${fresh.join(",")}`);
  }
  {
    const sv = stripComments(rd(F.svc));
    const acts = rd(F.acts);
    const u = useServerFile(acts, ["requestSalaryCertAction", "cancelSalaryCertRequestAction", "issueSalaryCertAction", "rejectSalaryCertAction", "voidSalaryCertAction"], [/requireTenant\(\)/]);
    ck("S1.11", { db: /membership\.find(First|Unique)/.test(sv), noViewerOf: !/hrViewerOf/.test(importsOf(sv).map((i) => i.spec).join(" ") + sv.slice(0, 3000)), audit: AUDIT_ACTIONS.every((a) => sv.includes(`"${a}"`)), acts: Object.values(u.r).every(Boolean) }, "DB gate + audit + actions", `acts=${failedKeys(u.r)} got=${u.got.join(",")}`);
  }
  {
    const src = [F.ui, F.pMeSlip, F.pMePay, F.pGateSlip, F.pPayroll].map((f) => rd(f)).join("\n");
    // ORACLE-EDIT (H3.8 builder · S1.12): testidsOf(src, prefix) needs ≥ 1 character after the prefix, so the two bare region ids "hr-slip" /
    //   "hr-salarycert" could never be found (check unpassable by construction) ⇒ the bare ids are taken only from exact data-testid="…" attributes ◂
    const bare = [...src.matchAll(/data-testid="(hr-slip|hr-salarycert)"/g)].map((m) => m[1]!);
    const ids = new Set([...testidsOf(src, "hr-slip"), ...testidsOf(src, "hr-salarycert"), ...bare]);
    const miss = TESTIDS.filter((t) => !ids.has(t));
    const rows = ((jsonOf(F.inv)?.rows ?? []) as Any[]).filter((r) => r.wo === "H3.8");
    const rowIds = new Set(rows.map((r) => String(r.testid)));
    const invOk = TESTIDS.every((t) => rowIds.has(t)) && rows.every((r) => r.oracle === "qc-hr-h3.8" && ids.has(String(r.testid)));
    const th = jsonOf(F.th)?.hr ?? {};
    const en = jsonOf(F.en)?.hr ?? {};
    const m1 = msgParity(th.slip ?? {}, en.slip ?? {}, ["title", "net", "earnings", "deductions", "totalEarnings", "totalDeductions", "pdf", "cert", "history", "note"]);
    const m2 = msgParity(th.slipLine ?? {}, en.slipLine ?? {}, SLIP_LINE_CODES);
    const m3 = msgParity(th.salaryCert ?? {}, en.salaryCert ?? {}, ["title", "request", "purpose", "submit", "issue", "reject", "void", "download", ...PURPOSES.map((p) => `p${p}`)]);
    const vis = rd(F.visual);
    const visOk = /"3\.8":\s*\[/.test(vis) && ["slip-self", "pay-history", "slip-gate", "salarycert-gate"].every((k) => vis.includes(`key: "${k}"`));
    const tk = tokensOnly(stripComments(rd(F.ui)));
    ck("S1.12", { ids: miss.length === 0, inv: invOk, m1: Object.values(m1).every(Boolean), m2: Object.values(m2).every(Boolean), m3: Object.values(m3).every(Boolean), vis: visOk, tokens: !!rd(F.ui) && Object.values(tk).every(Boolean) }, "UI contract", `missing=${miss.length}/${TESTIDS.length} invRows=${rows.length}`);
  }
  {
    const ui = stripComments(rd(F.ui));
    const acts = stripComments(rd(F.acts));
    ck("S5.3", { anchor: /<a\b[^>]*\bdownload\b[^>]*>|<a\b[^>]*\bhref=\{[^}]*\/pdf/.test(ui) && /download/.test(ui) && /\/pdf/.test(ui) && /salary-cert\//.test(ui), noRedirect: !!acts && !/redirect\([^)]*(\/pdf|salary-cert\/)/.test(acts) }, "<a download> links");
  }
}

// ═════════════════════════ pure ═════════════════════════
type RO = { ok: boolean; text: string; value: Any };
const REAL = { log: console.log, info: console.info, warn: console.warn, error: console.error };
const CAPTURED: string[] = [];
let depth = 0;
async function callMod(Mo: Any, fn: string, args: unknown[]): Promise<RO> {
  const mo = Mo && !Mo.__err ? Mo : null;
  if (typeof mo?.[fn] !== "function") return { ok: false, text: `∅${fn} (${modState(Mo, fn)})`, value: undefined };
  const cap = (...a: unknown[]) => void CAPTURED.push(a.map((x) => (typeof x === "string" ? x : short(x, 400))).join(" "));
  if (depth++ === 0) Object.assign(console, { log: cap, info: cap, warn: cap, error: cap });
  try {
    const v = (await mo[fn](...args)) as Any;
    const ok = v !== null && v !== undefined && !(typeof v === "object" && v.ok === false);
    return { ok, text: ok ? "" : String(v?.reason ?? textOf(v) ?? short(v, 80)), value: v };
  } catch (e) {
    return { ok: false, text: `THROW ${errText(e)}`, value: undefined };
  } finally {
    if (--depth === 0) Object.assign(console, REAL);
  }
}
const pick = (v: Any) => (v && typeof v === "object" ? { earnings: v.earnings, deductions: v.deductions, earningsSatang: v.earningsSatang, deductionsSatang: v.deductionsSatang, netSatang: v.netSatang, ssoBaseSatang: v.ssoBaseSatang, employerSsoSatang: v.employerSsoSatang, flags: v.flags } : v);
const bufOf = (x: unknown): Buffer | null => (x instanceof Uint8Array ? Buffer.from(x) : null);
const pdfText = (x: unknown): { pages: number; text: string } => {
  const b = bufOf(x);
  if (!b || b.subarray(0, 5).toString() !== "%PDF-") return { pages: 0, text: "" };
  try {
    const p = pdfPagesText(b);
    return { pages: p.length, text: p.join("\n") };
  } catch {
    return { pages: -1, text: "" };
  }
};

async function runPure(R: Any, PDFM: Any, T: Record<string, string>): Promise<void> {
  console.log(`── [pure] payslip-rules ${modState(R, F.rules)} ──`);
  const rr = R && !R.__err ? R : null;
  {
    const th = rr?.SLIP_TEXT ?? {};
    const en = rr?.SLIP_TEXT_EN ?? {};
    const fEn = typeof rr?.slipTextFor === "function" ? rr.slipTextFor("en") : null;
    const fTh = typeof rr?.slipTextFor === "function" ? rr.slipTextFor("th") : null;
    const vals = [...Object.values(th), ...Object.values(en)].map(String);
    ck("S2.1", {
      keys: TEXT_KEYS.every((k) => typeof th[k] === "string" && typeof en[k] === "string"), thai: TEXT_KEYS.every((k) => /[฀-๿]/.test(String(th[k] ?? ""))),
      ascii: TEXT_KEYS.every((k) => !/[฀-๿]/.test(String(en[k] ?? "x")) && String(en[k] ?? "") !== ""), locale: fEn === en && fTh === th && rr?.slipTextFor?.(null) === th,
      neutral: vals.length > 0 && !vals.some((v) => LAW_CLAIM.test(v)), accountant: /นักบัญชี/.test(String(th.slipNote ?? "")) && /นักบัญชี/.test(String(th.certNote ?? "")),
    }, "texts", `keys=${Object.keys(th).length}`);
  }
  const view = (id: string) => {
    const v = VEC[id]!;
    try {
      return rr?.slipView ? rr.slipView({ engineVersion: v.engineVersion, item: v.item }) : "∅slipView";
    } catch (e) {
      return `THROW ${errText(e)}`;
    }
  };
  const vecCheck = (cid: string, ids: string[]) => {
    const bad = ids.filter((id) => { const got = view(id); return !(got?.ok === true && canon(pick(got)) === canon(VEC[id]!.exp)); });
    chk(cid, bad.length === 0, ids.map((i) => `${i} net ${VEC[i]!.exp.netSatang}`).join(" · "), bad.length ? bad.map((id) => `${id}=${short(pick(view(id)), 160)}`).join(" | ") : "ok");
  };
  vecCheck("S2.2", ["V1"]);
  vecCheck("S2.3", ["V2"]);
  vecCheck("S2.4", ["V3"]);
  vecCheck("S2.5", ["V4"]);
  vecCheck("S2.6", ["V5"]);
  vecCheck("S2.7", ["V6"]);
  {
    const v7 = view("V7");
    vecCheck("S2.8", ["V7", "V8"]);
    if (v7?.ok && /ทำงานวันเสาร์|แก้วแตก/.test(JSON.stringify(v7))) console.log("  ⚠ S2.8: adjustment note leaked into the view");
  }
  {
    const bad: string[] = [];
    for (const b of brokenItems()) {
      let got: Any;
      try { got = rr?.slipView ? rr.slipView({ engineVersion: b.engineVersion, item: b.item }) : "∅"; } catch (e) { got = `THROW ${errText(e)}`; }
      if (!(got?.ok === false && got?.code === "SLIP_DATA")) bad.push(`${b.id}=${short(got, 60)}`);
    }
    chk("S2.9", bad.length === 0, "10 × SLIP_DATA", bad.join(" | ") || "ok");
  }
  {
    const r = prng(3808);
    const bad: string[] = [];
    for (let i = 0; i < 60 && bad.length < 3; i++) {
      const it: ItemIn = randomItem(r);
      const before = JSON.stringify(it);
      let a: Any, b: Any;
      try { a = rr?.slipView?.({ engineVersion: 2, item: it }); b = rr?.slipView?.({ engineVersion: 2, item: JSON.parse(before) }); } catch (e) { bad.push(`#${i} THROW ${errText(e)}`); continue; }
      const sum = (xs: Any[]) => (Array.isArray(xs) ? xs.reduce((s, l) => s + Number(l?.amountSatang ?? NaN), 0) : NaN);
      const ok = a?.ok === true && a.earningsSatang - a.deductionsSatang === it.netSatang && a.netSatang === it.netSatang && sum(a.earnings) === a.earningsSatang && sum(a.deductions) === a.deductionsSatang
        && a.earnings.every((l: Any) => EARN_CODES.has(l.code)) && a.deductions.every((l: Any) => DEDUCT_CODES.has(l.code)) && canon(a) === canon(b) && JSON.stringify(it) === before;
      if (!ok) bad.push(`#${i} net=${it.netSatang} got=${short(a, 80)}`);
    }
    chk("S2.10", bad.length === 0, "60 sets hold", bad.join(" | ") || "ok");
  }
  {
    const bad = STATE_TABLE.filter((t) => { try { return rr?.slipState?.(t.in) !== t.want; } catch { return true; } }).map((t) => `${t.in.status}/v${t.in.engineVersion}/${t.in.finalized}`);
    chk("S2.11", bad.length === 0, "10 rows", bad.join(" ") || "ok");
  }
  {
    let r: Record<string, boolean> = { fn: false };
    try {
      const y1 = rr.taxYearOf(new Date("2031-12-31T17:30:00Z"));
      const y2 = rr.taxYearOf(new Date("2031-12-31T16:59:59Z"));
      const rows = [
        { payDate: new Date("2031-01-30T05:00:00Z"), grossSatang: 3_000_000, netSatang: 2_875_000, whtSatang: 50_000, ssoEmployeeSatang: 75_000, incomeSatang: 3_000_000 },
        { payDate: new Date("2031-02-27T05:00:00Z"), grossSatang: 1_765_000, netSatang: 1_690_000, whtSatang: 0, ssoEmployeeSatang: 75_000, incomeSatang: 1_765_000 },
        { payDate: new Date("2031-12-31T17:30:00Z"), grossSatang: 1_800_000, netSatang: 1_725_000, whtSatang: 0, ssoEmployeeSatang: 75_000, incomeSatang: 1_800_000 },
      ];
      const t = rr.yearTotals(rows) as Any[];
      const want = [
        { taxYear: 2032, count: 1, grossSatang: 1_800_000, incomeSatang: 1_800_000, taxSatang: 0, ssoSatang: 75_000, netSatang: 1_725_000 },
        { taxYear: 2031, count: 2, grossSatang: 4_765_000, incomeSatang: 4_765_000, taxSatang: 50_000, ssoSatang: 150_000, netSatang: 4_565_000 },
      ];
      const sub = (x: Any) => Object.fromEntries(Object.keys(want[0]!).map((k) => [k, x?.[k]]));
      r = { y1: y1 === 2032, y2: y2 === 2031, totals: Array.isArray(t) && canon(t.map(sub)) === canon(want) };
    } catch (e) {
      r = { fn: false, [`throw ${errText(e).slice(0, 40)}`]: false };
    }
    ck("S2.12", r, "BKK tax year + totals");
  }
  {
    let r: Record<string, boolean> = { fn: false };
    try {
      const bt = (await import("@/lib/modules/account/totals")) as Any;
      const input = {
        seq: 1, issueDate: "2032-01-10", purpose: "BANK", employer: { name: "บริษัท คิวซี สลิป จำกัด", address: "1 ถนนทดสอบ กรุงเทพมหานคร 10400" },
        employee: { name: "เอกชัย หนึ่งดี", position: "บาริสต้า", startDate: "2030-01-01", endDate: null, active: true },
        salary: { amountSatang: 1_800_000, periodKey: "2031-12", runId: "run-x" }, signerName: "นายผู้ลงนาม ทดสอบ",
      };
      const want = {
        v: 1, docNo: "HRSC-2032-0001", issueDate: "2032-01-10", purpose: "BANK", employer: input.employer, employee: input.employee,
        salary: { basis: "MONTHLY_BASE", amountSatang: 1_800_000, words: bt.bahtText(1_800_000), periodKey: "2031-12", runId: "run-x" }, signerName: input.signerName, disclaimer: rr.SLIP_TEXT.certNote,
      };
      const got = rr.salaryCertContent(input);
      r = { content: canon(got) === canon(want), noId: !/\d{13}/.test(JSON.stringify(got)), d1: rr.salaryCertDocNo(1, "2032-01-10") === "HRSC-2032-0001", d12: rr.salaryCertDocNo(12, "2032-01-10") === "HRSC-2032-0012", purposes: canon(rr.SLIP_PURPOSES) === canon(PURPOSES) };
    } catch (e) {
      r = { fn: false, [`throw ${errText(e).slice(0, 40)}`]: false };
    }
    ck("S2.13", r, "certificate content + number");
  }
  {
    let r: Record<string, boolean> = { fn: false };
    try {
      const v = rr.slipView({ engineVersion: 2, item: VEC.V2!.item });
      const dto = { ok: true, runId: "run-x", periodKey: "2031-09", payDate: "2031-10-02", taxYear: 2031, status: "PAID", state: "ISSUED", engineVersion: 2, employee: { name: "น้ำฝน ทดสอบ", position: "บาริสต้า", code: "A01" }, ...v, bankMasked: "KBank •••4321" };
      const p = pdfText(await PDFM.renderPayslipPdf(dto, { employerName: "บริษัท คิวซี สลิป จำกัด" }));
      const c = rr.salaryCertContent({ seq: 1, issueDate: "2032-01-10", purpose: "BANK", employer: { name: "บริษัท คิวซี สลิป จำกัด", address: "1 ถนนทดสอบ" }, employee: { name: "เอกชัย หนึ่งดี", position: null, startDate: null, endDate: null, active: true }, salary: { amountSatang: 1_800_000, periodKey: "2031-12", runId: "run-x" }, signerName: "นายผู้ลงนาม" });
      const q = pdfText(await PDFM.renderSalaryCertPdf(c));
      r = {
        slipPdf: p.pages === 1, nums: ["16,900.00", "17,800.00", "900.00"].every((n) => p.text.includes(n)), name: thNorm(p.text).includes(thNorm("น้ำฝน")), bank: p.text.includes("4321") && !p.text.includes("54321"),
        certPdf: q.pages >= 1 && q.text.includes("HRSC-2032-0001") && q.text.includes("18,000.00"),
      };
    } catch (e) {
      r = { fn: false, [`throw ${errText(e).slice(0, 40)}`]: false };
    }
    ck("S2.14", r, "PDFs render");
  }
  void T;
}

// ═════════════════════════ db ═════════════════════════
const { P, coreHash } = await qc4Env(SUITE);
if (FORCE && skipReasons.length) console.log(`⚠️ QC_FORCE=1 — running although: ${skipReasons.join(" · ")}`);
const R = await loadOpt(F.rules, "@/lib/modules/hr/payslip-rules");
const SV = await loadOpt(F.svc, "@/lib/modules/hr/payslip");
const PDFM = await loadOpt(F.pdf, "@/lib/modules/hr/payslip-pdf");
const RT = await loadOpt(F.route, "@/lib/modules/hr/payslip-route");
const PRIV = (await import("@/lib/modules/hr/privacy")) as Any;
const SELF = (await import("@/lib/modules/hr/self")) as Any;
const INBOX = (await import("@/lib/modules/hr/inbox")) as Any;
const FIL = (await import("@/lib/modules/hr/filings/service")) as Any;
const T: Record<string, string> = (R && !R.__err ? R.SLIP_TEXT : null) ?? {};
const TEN: Record<string, string> = (R && !R.__err ? R.SLIP_TEXT_EN : null) ?? {};
console.log(`[${SUITE}] rules=${modState(R, F.rules)} · service=${modState(SV, F.svc)} · pdf=${modState(PDFM, F.pdf)} · route=${modState(RT, F.route)} · base=${BASE.slice(0, 9)}`);
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${SLUG_PREFIX}${Date.now()}${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
const S = (fn: string, ...a: unknown[]) => callMod(SV, fn, a);
const RTc = (fn: string, ...a: unknown[]) => callMod(RT, fn, a);
const NOW = { now: new Date("2032-01-10T03:00:00Z") };
const IDS = ["1102000123454", "3100600999991", "0105555000013"];
const isNo = (r: RO) => r.value?.ok === false && r.value?.code === "NO" && r.value?.reason === T.no && keysDeep(r.value).size === 3;
const codeIs = (r: RO, code: string, key: string) => r.value?.ok === false && r.value?.code === code && r.value?.reason === T[key] && srt(Object.keys(r.value)) === K.refusal;
const shown = (r: RO) => (r.ok ? "ok" : `"${short(r.text, 60)}"`);
const raw = async (sql: string, ...p: unknown[]) => ((await fx.rawRows(sql, ...p)) ?? []) as Any[];
const auditCount = async (tid: string, like = "hr.%") => Number((await raw(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = $1 AND "action" LIKE $2`, tid, like))[0]?.n ?? -1);
/** writes to the new table tolerate its absence (base / not built) so the run reaches every check */
const exq = (sql: string, ...p: unknown[]) => P.$executeRawUnsafe(sql, ...p).catch((e: unknown) => (console.log(`  ⚠ ${errText(e).slice(0, 90)}`), -1));
const scRows = async (tid: string) => raw(`SELECT * FROM "HrSalaryCertificate" WHERE "tenantId" = $1 ORDER BY "createdAt", "id"`, tid);

async function runDb(): Promise<void> {
  const TT = await fx.newTenant("", "QC HR H3.8 สลิป");
  const T2 = await fx.newTenant("-other", "QC HR H3.8 ร้านอื่น");
  const u1 = await fx.newUnit(TT, `สาขาเหนือ ${tag}`, "u1");
  const u2 = await fx.newUnit(TT, `สาขาใต้ ${tag}`, "u2");
  const sys = async (n: string, t = TT) => (await sysSvc.createSystem(t, "HR", `${n} ${tag}`)).id as string;
  const [sA, sB, sO] = [await sys("ทีม A"), await sys("ทีม B"), await sys("ทีมอื่น", T2)];
  const cA = { tenantId: TT, systemId: sA };
  const cB = { tenantId: TT, systemId: sB };
  const cO = { tenantId: T2, systemId: sO };
  const mk = (t: string, r: "OWNER" | "MANAGER" | "STAFF", ua: string[], p: Record<string, boolean>, tid = TT) => fx.mkUser(tid, t, `QC38 ${t} ${tag}`, r, ua, p);
  const RD = { "hr.payroll.read": true };
  const U = {
    owner: await mk("owner", "OWNER", [], {}),
    pay: await mk("pay", "STAFF", ["*"], { ...RD, "hr.payroll.pay": true }),
    payRead: await mk("payread", "STAFF", ["*"], RD),
    payBranch: await mk("paybranch", "STAFF", [u1], RD),
    mgr: await mk("mgr", "MANAGER", [u1], {}),
    mgrAll: await mk("mgrall", "MANAGER", ["*"], {}),
    hrStaff: await mk("hrstaff", "STAFF", ["*"], { "hr.leave.read": true, "hr.employee.create": true }),
    member: await mk("member", "STAFF", [], {}),
    self: await mk("self", "STAFF", [], {}),
    self2: await mk("self2", "STAFF", [], {}),
    ended: await mk("ended", "STAFF", [], {}),
    other: await mk("other", "OWNER", [], {}, T2),
  };
  const V = Object.fromEntries(Object.entries(U).map(([k, w]) => [k, vOf(w)])) as Record<keyof typeof U, Any>;
  const forgedA = { ...V.member, role: "OWNER", unitAccess: ["*"] };
  const forgedB = { ...V.member, permissions: { "hr.payroll.read": true }, unitAccess: ["*"] };
  const actorOf = (w: Any) => ({ tenantId: w.tenantId, userId: w.id, role: w.role, unitAccess: w.unitAccess, permissions: w.permissions });
  const emp = async (c: Any, code: string, nm: string, o: Record<string, unknown> = {}) => {
    const id = await fx.mkEmp(c.tenantId, c.systemId, `${nm} ${tag}`, { code, startDate: "2030-01-01", position: "บาริสต้า", unitId: (o.unitId as string) ?? u1, ...(o.linkedUserId ? { linkedUserId: o.linkedUserId as string } : {}), ...(o.status ? { status: o.status as string } : {}), ...(o.active === false ? { active: false } : {}) });
    if (o.data) await P.hrEmployee.update({ where: { id }, data: o.data });
    return id;
  };
  const E = {
    e1: await emp(cA, "A01", "เอกชัย", { data: { nationalId: "1102000123454", bankName: "KBank", bankAccountNo: "123-4-54321", subdistrict: "ทุ่งพญาไท", district: "ราชเทวี", province: "กรุงเทพมหานคร", postcode: "10400" } }),
    e2: await emp(cA, "A02", "บุษบา", { data: { nationalId: "3100600999991" } }),
    e3: await emp(cA, "A03", "ชัยวัฒน์"),
    e4: await emp(cA, "A04", "ดำรง", { linkedUserId: U.self.id }),
    e5: await emp(cA, "A05", "ห้าวหาญ", { unitId: u2 }),
    e6: await emp(cA, "A06", "หกฉาก", { unitId: u2 }),
    e7: await emp(cA, "A07", "เจ็ดดาว", { linkedUserId: U.ended.id, status: "ENDED", active: false }),
    e8: await emp(cA, "A08", "แปดทิศ"),
    e9: await emp(cA, "A09", "เก้ากล้า"),
    e10: await emp(cA, "A10", "สิบทิศ", { linkedUserId: U.pay.id }),
    e11: await emp(cA, "A11", "สิบเอ็ด", { linkedUserId: U.self2.id }),
    b1: await emp(cB, "B01", "บีหนึ่ง"),
  };
  await P.hrEmployeeUnit.create({ data: { tenantId: TT, systemId: sA, employeeId: E.e6, unitId: u1, fromDate: new Date("2030-01-01T00:00:00Z"), toDate: null } });
  const HAS_STEPS = !!(await fx.rawRows(`SELECT 1 AS x FROM information_schema.columns WHERE table_name = 'HrPayrollRun' AND column_name = 'stepsJson'`))?.length;
  type It = { e: string; it: ItemIn };
  const mkRun = async (c: Any, periodKey: string, payDay: string, status: string, ev: number, items: It[], final = ev >= 2 && status !== "DRAFT") => {
    const tot = (f: (i: ItemIn) => number) => items.reduce((a, x) => a + f(x.it), 0);
    const run = await P.hrPayrollRun.create({
      data: {
        tenantId: c.tenantId, systemId: c.systemId, periodKey, payDate: new Date(`${payDay}T12:00:00+07:00`), status, engineVersion: ev,
        totalGrossSatang: tot((i) => i.grossSatang), totalSsoEmployeeSatang: tot((i) => i.ssoEmployeeSatang), totalSsoEmployerSatang: tot((i) => i.ssoEmployerSatang), totalWhtSatang: tot((i) => i.whtSatang),
        totalNetSatang: tot((i) => i.netSatang), totalAddSatang: tot((i) => i.addSatang),
      },
    });
    for (const x of items) await P.hrPayrollItem.create({ data: { tenantId: c.tenantId, systemId: c.systemId, runId: run.id, employeeId: x.e, ...x.it } });
    if (final && HAS_STEPS) await P.$executeRawUnsafe(`UPDATE "HrPayrollRun" SET "stepsJson" = '{"finalized":true}'::jsonb WHERE "id" = $1`, run.id);
    return run.id as string;
  };
  const e1v1 = v1Item(3_000_000, [], { add: 0, deduct: 0, gross: 3_000_000, ssoBase: 1_500_000, ee: 75_000, wht: 50_000 });
  const RA = {
    r1: await mkRun(cA, "2031-01", "2031-01-30", "PAID", 1, [{ e: E.e1, it: e1v1 }, { e: E.e4, it: VEC.V7!.item }]),
    r2: await mkRun(cA, "2031-02", "2031-02-27", "APPROVED", 2, [E.e1, E.e4, E.e5, E.e6, E.e10, E.e11].map((e) => ({ e, it: e === E.e1 ? VEC.V2!.item : VEC.V1!.item }))),
    r3: await mkRun(cA, "2031-03", "2031-03-31", "PAID", 2, [{ e: E.e1, it: VEC.V4!.item }, { e: E.e2, it: VEC.V3!.item }, { e: E.e9, it: V9 }]),
    r4: await mkRun(cA, "2031-04", "2031-04-30", "REVERSED", 2, [{ e: E.e1, it: VEC.V1!.item }, { e: E.e4, it: VEC.V1!.item }]),
    r5: await mkRun(cA, "2031-05", "2031-05-29", "DRAFT", 2, [{ e: E.e1, it: VEC.V1!.item }]),
    r6: await mkRun(cA, "2031-06", "2031-06-30", "APPROVED", 2, [{ e: E.e1, it: VEC.V1!.item }, { e: E.e4, it: VEC.V1!.item }], false),
    r7: await mkRun(cA, "2031-07", "2031-07-31", "PAID", 2, [{ e: E.e1, it: VEC.V6!.item }, { e: E.e3, it: VEC.V5!.item }]),
    r8: await mkRun(cA, "2031-12", "2032-01-05", "PAID", 2, [{ e: E.e1, it: V10 }]),
    rb: await mkRun(cB, "2031-02", "2031-02-27", "PAID", 2, [{ e: E.b1, it: VEC.V1!.item }]),
  };
  {
    const runs = (await P.hrPayrollRun.findMany({ where: { tenantId: TT } })) as Any[];
    const items = (await P.hrPayrollItem.findMany({ where: { tenantId: TT } })) as Any[];
    const sums = runs.every((r) => items.filter((i) => i.runId === r.id).reduce((a, i) => a + i.netSatang, 0) === r.totalNetSatang);
    const ident = items.every((i) => i.netSatang === i.grossSatang - i.ssoEmployeeSatang - i.whtSatang);
    ck("S3.0", { runs: runs.length === 9, items: items.length === 20, sums, ident, steps: HAS_STEPS }, "fixture ok", `${runs.length} runs ${items.length} items`);
  }
  // filing profile/person for e1 (H3.6 reconcile + certificate employer data) — system A only
  await P.hrFilingProfile.create({ data: { tenantId: TT, systemId: sA, taxId: "0105555000013", employerName: "บริษัท คิวซี สลิป จำกัด", employerAddress: "1 ถนนทดสอบ แขวงทุ่งพญาไท เขตราชเทวี กรุงเทพมหานคร 10400", signerName: "นายผู้ลงนาม ทดสอบ" } });
  await P.hrFilingPerson.create({ data: { tenantId: TT, systemId: sA, employeeId: E.e1, title: "นาย", firstName: "เอกชัย", lastName: "หนึ่งดี" } });

  const slip = (v: Any, runId: string, employeeId: string, c: Any = cA) => S("slipForViewer", c, v, { runId, employeeId });
  const pdf = (v: Any, runId: string, employeeId: string, c: Any = cA) => S("downloadPayslipPdf", c, v, { runId, employeeId });
  const hist = (v: Any, employeeId: string, taxYear: number, c: Any = cA) => S("slipHistory", c, v, { employeeId, taxYear });
  const expSlip = (runId: string, periodKey: string, payDate: string, status: string, empName: string, code: string, vid: string, bank: string | null, taxYear = 2031, ev = 2) => ({
    ok: true, runId, periodKey, payDate, taxYear, status, state: "ISSUED", engineVersion: ev, employee: { name: `${empName} ${tag}`, position: "บาริสต้า", code }, ...VEC[vid]!.exp, bankMasked: bank,
  });

  // S3.1
  {
    const cases = [
      ["e1/RA2", await slip(V.owner, RA.r2, E.e1), expSlip(RA.r2, "2031-02", "2031-02-27", "APPROVED", "เอกชัย", "A01", "V2", "KBank •••4321")],
      ["e2/RA3", await slip(V.owner, RA.r3, E.e2), expSlip(RA.r3, "2031-03", "2031-03-31", "PAID", "บุษบา", "A02", "V3", null)],
      ["e3/RA7", await slip(V.owner, RA.r7, E.e3), expSlip(RA.r7, "2031-07", "2031-07-31", "PAID", "ชัยวัฒน์", "A03", "V5", null)],
      ["e4/RA1", await slip(V.owner, RA.r1, E.e4), expSlip(RA.r1, "2031-01", "2031-01-30", "PAID", "ดำรง", "A04", "V7", null, 2031, 1)],
    ] as const;
    const bad = cases.filter(([, g, w]) => canon(g.value) !== canon(w)).map(([n, g]) => `${n}=${short(g.value ?? g.text, 140)}`);
    chk("S3.1", bad.length === 0, "4 stored vectors exact", bad.join(" | ") || "ok");
  }
  // S3.2
  {
    const before = canon((await slip(V.owner, RA.r3, E.e1)).value);
    await P.hrSalaryProfile.create({ data: { tenantId: TT, systemId: sA, employeeId: E.e1, baseSalarySatang: 9_999_900 } });
    const after = canon((await slip(V.owner, RA.r3, E.e1)).value);
    await P.$executeRawUnsafe(`UPDATE "HrPayrollItem" SET "netSatang" = "netSatang" + 1 WHERE "runId" = $1 AND "employeeId" = $2`, RA.r3, E.e1);
    const t1 = await slip(V.owner, RA.r3, E.e1);
    const t2 = await pdf(V.owner, RA.r3, E.e1);
    await P.$executeRawUnsafe(`UPDATE "HrPayrollItem" SET "netSatang" = "netSatang" - 1 WHERE "runId" = $1 AND "employeeId" = $2`, RA.r3, E.e1);
    const back = await slip(V.owner, RA.r3, E.e1);
    ck("S3.2", { ok: (await slip(V.owner, RA.r3, E.e1)).value?.netSatang === 1_675_000, same: before === after, tamper: codeIs(t1, "SLIP_DATA", "slipData"), tamperPdf: codeIs(t2, "SLIP_DATA", "slipData"), back: canon(back.value) === before }, "snapshot only", `tamper=${shown(t1)}`);
  }
  // S3.3
  {
    const st = async (r: string) => (await slip(V.owner, r, E.e1)).value?.state;
    const sd = { draft: await st(RA.r5), nf: await st(RA.r6), wd: await st(RA.r4) };
    const pd = [await pdf(V.owner, RA.r5, E.e1), await pdf(V.owner, RA.r6, E.e1), await pdf(V.owner, RA.r4, E.e1)];
    const me = [await S("mySlip", actorOf(U.self), { runId: RA.r6 }), await S("mySlip", actorOf(U.self), { runId: RA.r4 })];
    ck("S3.3", { inApp: sd.draft === "DRAFT" && sd.nf === "NOT_FINAL" && sd.wd === "WITHDRAWN", pdfDraft: codeIs(pd[0]!, "NOT_ISSUED", "notIssued"), pdfNf: codeIs(pd[1]!, "NOT_FINAL", "notFinal"), pdfWd: codeIs(pd[2]!, "WITHDRAWN", "withdrawn"), self: me.every(isNo) }, "states", JSON.stringify(sd));
  }
  // S3.4 + S3.13 (part)
  const mine = await S("mySlips", actorOf(U.self));
  {
    const v = mine.value;
    const want = { ok: true, years: [{ taxYear: 2031, count: 2, grossSatang: 3_140_000, incomeSatang: 3_160_000, taxSatang: 0, ssoSatang: 150_000, netSatang: 2_990_000, slips: [
      { runId: RA.r2, periodKey: "2031-02", payDate: "2031-02-27", netSatang: 1_525_000, href: `/app/me/hr/pay/${RA.r2}` },
      { runId: RA.r1, periodKey: "2031-01", payDate: "2031-01-30", netSatang: 1_465_000, href: `/app/me/hr/pay/${RA.r1}` },
    ] }] };
    chk("S3.4", canon(v) === canon(want), "e4 2031 · 2 slips · net 29,900", short(v ?? mine.text, 220));
  }
  // S3.5
  {
    const a = actorOf(U.self);
    const o1 = await S("mySlip", a, { runId: RA.r1 });
    const o2 = await S("mySlip", a, { runId: RA.r2 });
    const n = [await S("mySlip", a, { runId: RA.r3 }), await S("mySlip", a, { runId: RA.r4 }), await S("mySlip", a, { runId: RA.r6 }), await S("mySlip", a, { runId: "nope-run-id" }), await S("mySlip", actorOf(U.member), { runId: RA.r1 })];
    ck("S3.5", { own1: canon(pick(o1.value)) === canon(VEC.V7!.exp), own2: canon(pick(o2.value)) === canon(VEC.V1!.exp), no: n.every(isNo), same: new Set(n.map((x) => JSON.stringify(x.value))).size === 1 }, "own only", n.map(shown).join(" "));
  }
  // S3.6
  const h31 = await hist(V.owner, E.e1, 2031);
  {
    const y = h31.value?.year;
    const h32 = await hist(V.owner, E.e1, 2032);
    const y2 = h32.value?.year;
    ck("S3.6", {
      y2031: y?.taxYear === 2031 && y?.count === 4 && y?.grossSatang === 10_515_000 && y?.incomeSatang === 10_765_000 && y?.taxSatang === 175_000 && y?.ssoSatang === 312_500 && y?.netSatang === 10_027_500,
      order: canon((y?.slips ?? []).map((s: Any) => s.runId)) === canon([RA.r7, RA.r3, RA.r2, RA.r1]), href: (y?.slips ?? []).every((s: Any) => s.href === `/app/sys/${sA}/payroll/${s.runId}/slip/${E.e1}`),
      y2032: y2?.count === 1 && y2?.netSatang === 1_725_000 && y2?.slips?.[0]?.periodKey === "2031-12",
    }, "hand totals", short(y ?? h31.text, 160));
  }
  // S3.7 reconcile with H3.6 50 ทวิ
  {
    const r = await callMod(FIL, "issueTaxCertificate", [cA, V.owner, { employeeId: E.e1, taxYear: 2031, kind: "ANNUAL" }, NOW]);
    const row = r.ok ? (await raw(`SELECT "contentJson" FROM "HrTaxCertificate" WHERE "id" = $1`, r.value.certId))[0] : null;
    const c = row?.contentJson ?? {};
    const y = h31.value?.year ?? {};
    ck("S3.7", { h36: r.ok, total: c.totalSatang === 10_765_000, tax: c.totalTaxSatang === 175_000, sso: c.funds?.ssoSatang === 312_500, slipInc: y.incomeSatang === c.totalSatang, slipTax: y.taxSatang === c.totalTaxSatang, slipSso: y.ssoSatang === c.funds?.ssoSatang }, "slips = 50 ทวิ", `h36=${shown(r)} cert=${c.totalSatang}/${c.totalTaxSatang}/${c.funds?.ssoSatang} slip=${y.incomeSatang}/${y.taxSatang}/${y.ssoSatang}`);
  }
  // S3.8
  {
    const a0 = await auditCount(TT, "hr.payslip.download");
    const o0 = await P.outboxEvent.count({ where: { tenantId: TT } });
    const d = await pdf(V.owner, RA.r2, E.e1);
    const aud = (await raw(`SELECT "after", "actorId", "targetId" FROM "AuditLog" WHERE "tenantId" = $1 AND "action" = 'hr.payslip.download' ORDER BY "createdAt" DESC LIMIT 1`, TT))[0];
    const p = pdfText(d.value?.bytes);
    const fn = String(d.value?.fileName ?? "");
    ck("S3.8", {
      pdf: p.pages >= 1 && p.text.includes("16,900.00"), ct: d.value?.contentType === "application/pdf", name: /^payslip-2031-02(-[A-Za-z0-9_-]+)?\.pdf$/.test(fn) && !/\d{13}|เอกชัย/.test(fn),
      audit: (await auditCount(TT, "hr.payslip.download")) === a0 + 1 && srt(Object.keys(aud?.after ?? {})) === K.audDl && aud?.after?.by === "GATE" && aud?.after?.periodKey === "2031-02" && aud?.actorId === U.owner.id,
      outbox: (await P.outboxEvent.count({ where: { tenantId: TT } })) === o0, noStore: (await scRows(TT)).length === 0,
    }, "gate PDF", `${shown(d)} file=${fn}`);
  }
  // S3.9
  {
    const a = actorOf(U.self);
    const a0 = await auditCount(TT, "hr.payslip.download");
    const ok = await S("downloadMyPayslipPdf", a, { runId: RA.r2 });
    const aud = (await raw(`SELECT "after" FROM "AuditLog" WHERE "tenantId" = $1 AND "action" = 'hr.payslip.download' ORDER BY "createdAt" DESC LIMIT 1`, TT))[0];
    const a1 = await auditCount(TT, "hr.payslip.download");
    const n = [await S("downloadMyPayslipPdf", a, { runId: RA.r3 }), await S("downloadMyPayslipPdf", a, { runId: RA.r6 }), await S("downloadMyPayslipPdf", a, { runId: "nope" }), await S("downloadMyPayslipPdf", actorOf(U.member), { runId: RA.r2 })];
    ck("S3.9", { ok: pdfText(ok.value?.bytes).pages >= 1, by: aud?.after?.by === "SELF" && aud?.after?.employeeId === E.e4, no: n.every(isNo), same: new Set(n.map((x) => JSON.stringify(x.value))).size === 1, quiet: (await auditCount(TT, "hr.payslip.download")) === a1 && a1 === a0 + 1 }, "self PDF", n.map(shown).join(" "));
  }
  // S3.10 matrix + S3.11 forged
  {
    const allow = ["owner", "pay", "payRead", "payBranch"];
    const deny = ["mgr", "mgrAll", "hrStaff", "member", "self", "other"];
    const bad: string[] = [];
    const a0 = await auditCount(TT, "hr.payslip.download");
    for (const k of [...allow, ...deny]) {
      const v = V[k as keyof typeof V];
      const res = [await slip(v, RA.r2, E.e1), await pdf(v, RA.r2, E.e1), await hist(v, E.e1, 2031)];
      const want = allow.includes(k);
      res.forEach((r, i) => { if (want ? !r.ok : !isNo(r)) bad.push(`${k}#${i}`); });
    }
    for (const [n, v] of [["forgedA", forgedA], ["forgedB", forgedB]] as const) for (const r of [await slip(v, RA.r2, E.e1), await pdf(v, RA.r2, E.e1), await hist(v, E.e1, 2031)]) if (!isNo(r)) bad.push(n);
    for (const e of [E.e5, E.e6]) for (const r of [await slip(V.payBranch, RA.r2, e), await pdf(V.payBranch, RA.r2, e), await hist(V.payBranch, e, 2031)]) if (!isNo(r)) bad.push(`payBranch/${e === E.e5 ? "e5" : "e6"}`);
    const written = (await auditCount(TT, "hr.payslip.download")) - a0;
    chk("S3.10", bad.length === 0 && written === allow.length, `allow ${allow.join(",")} · rest NO · ${allow.length} audit rows`, `${bad.join(" ") || "matrix ok"} audit+${written}`);
    const fa = actorOf(U.self) as Any;
    const forgedActor = { ...fa, employeeId: E.e1, systemId: sB, linkedUserId: U.owner.id };
    const m2 = await S("mySlips", forgedActor);
    const s2 = await S("mySlip", forgedActor, { runId: RA.r3, employeeId: E.e1 });
    ck("S3.11", { roleClaim: isNo(await slip(forgedA, RA.r2, E.e1)), permClaim: isNo(await slip(forgedB, RA.r2, E.e1)), selfList: canon(m2.value) === canon(mine.value) && mine.ok, selfOne: isNo(s2) }, "claims ignored");
  }
  // S3.12
  {
    const rs = [await slip(V.owner, "nope-run", E.e1), await slip(V.other, RA.r2, E.e1, cO), await slip(V.owner, RA.r2, E.e1, cO), await slip(V.member, RA.r2, E.e1), await slip(V.payBranch, RA.r2, E.e5), await pdf(V.mgr, RA.r2, E.e1), await hist(V.hrStaff, E.e1, 2031), await S("mySlip", actorOf(U.self), { runId: RA.r7 })];
    const one = new Set(rs.map((r) => JSON.stringify(r.value)));
    chk("S3.12", rs.every(isNo) && one.size === 1, `8 × {ok:false,code:"NO",reason:no}`, [...one].map((x) => short(x, 80)).join(" | "));
  }
  // S3.13
  {
    const s1 = (await slip(V.owner, RA.r2, E.e1)).value;
    const hv = h31.value;
    const certList = await S("listSalaryCertificates", cA, V.owner, {});
    const all = [s1, mine.value, hv, certList.value];
    const forb = all.flatMap((x) => [...keysDeep(x)].filter((k) => HR_FORBIDDEN_DTO_KEYS.includes(k)));
    const blob = JSON.stringify(all);
    ck("S3.13", {
      slip: srt(Object.keys(s1 ?? {})) === K.slip && srt(Object.keys(s1?.employee ?? {})) === K.emp && [...(s1?.earnings ?? []), ...(s1?.deductions ?? [])].every((l: Any) => srt(Object.keys(l)) === K.line),
      mine: srt(Object.keys(mine.value ?? {})) === K.mine && (mine.value?.years ?? []).every((y: Any) => srt(Object.keys(y)) === K.year && y.slips.every((r: Any) => srt(Object.keys(r)) === K.row)),
      hist: srt(Object.keys(hv ?? {})) === K.hist && srt(Object.keys(hv?.year ?? {})) === K.year, certs: certList.ok && Array.isArray(certList.value?.items),
      forbidden: forb.length === 0, ids: !IDS.some((x) => blob.includes(x)) && !blob.includes("54321"),
    }, "DTO shapes", `forbidden=${[...new Set(forb)].join(",") || "-"}`);
  }
  // S3.14 requests
  let req2 = "";
  {
    const a = actorOf(U.self);
    const a0 = await auditCount(TT, "hr.salarycert.request");
    const r1 = await S("requestSalaryCertificate", a, { purpose: "BANK" }, NOW);
    const c1 = await S("cancelMySalaryCertRequest", a, { certId: r1.value?.certId }, NOW);
    const r2 = await S("requestSalaryCertificate", a, { purpose: "BANK" }, NOW);
    req2 = String(r2.value?.certId ?? "");
    const dup = await S("requestSalaryCertificate", a, { purpose: "GENERAL" }, NOW);
    const bad = await S("requestSalaryCertificate", actorOf(U.self2), { purpose: "LOAN_SHARK" }, NOW);
    const end = await S("requestSalaryCertificate", actorOf(U.ended), { purpose: "BANK" }, NOW);
    const unl = await S("requestSalaryCertificate", actorOf(U.member), { purpose: "BANK" }, NOW);
    const selfIssue = await S("issueSalaryCertificate", cA, V.self, { requestId: req2 }, NOW);
    const rows = await scRows(TT);
    const my = await S("listMySalaryCertificates", a);
    const it = (my.value?.items ?? []).find((x: Any) => x.id === req2);
    ck("S3.14", {
      req: r1.ok && r2.ok && rows.find((x) => x.id === req2)?.status === "REQUESTED" && rows.find((x) => x.id === r1.value?.certId)?.status === "CANCELLED", cancel: c1.ok,
      dup: codeIs(dup, "CERT_REQ_OPEN", "certReqOpen"), purpose: codeIs(bad, "PURPOSE", "purpose"), ended: codeIs(end, "INACTIVE", "inactive"), unlinked: isNo(unl), selfIssue: isNo(selfIssue),
      list: srt(Object.keys(it ?? {})) === K.myCert && it?.status === "REQUESTED" && it?.canCancel === true, audit: (await auditCount(TT, "hr.salarycert.request")) === a0 + 2,
    }, "request flow", `${shown(r2)} dup=${shown(dup)}`);
  }
  // S3.16 owner issues e1 first ⇒ 0001
  let c1Id = "";
  {
    const r = await S("issueSalaryCertificate", cA, V.owner, { employeeId: E.e1, purpose: "GENERAL" }, NOW);
    c1Id = String(r.value?.certId ?? "");
    const row = (await scRows(TT)).find((x) => x.id === c1Id);
    const c = row?.contentJson ?? {};
    const seqRow = (await raw(`SELECT "lastNo", "docType"::text AS t FROM "AccountDocSequence" WHERE "systemId" = $1 AND "periodKey" = 'HRSC:2032'`, sA))[0];
    const aud = (await raw(`SELECT "after" FROM "AuditLog" WHERE "tenantId" = $1 AND "action" = 'hr.salarycert.issue' ORDER BY "createdAt" DESC LIMIT 1`, TT))[0];
    ck("S3.16", {
      ok: r.ok && r.value?.docNo === "HRSC-2032-0001" && row?.status === "ISSUED" && row?.docNo === "HRSC-2032-0001", salary: c.salary?.amountSatang === 1_800_000 && c.salary?.periodKey === "2031-12" && c.salary?.runId === RA.r8 && c.salary?.basis === "MONTHLY_BASE",
      employer: c.employer?.name === "บริษัท คิวซี สลิป จำกัด" && c.signerName === "นายผู้ลงนาม ทดสอบ", sha: !!row && row.contentSha256 === sha(canon(c)), noId: !/\d{13}/.test(JSON.stringify(c)),
      audit: srt(Object.keys(aud?.after ?? {})) === K.audIssue && aud?.after?.docNo === "HRSC-2032-0001", counter: seqRow?.t === "WHT_CERT" && Number(seqRow?.lastNo) === 1,
      noDoc: Number((await raw(`SELECT count(*)::int AS n FROM "AccountDocument" WHERE "tenantId" = $1`, TT))[0]?.n ?? -1) === 0,
    }, "HRSC-2032-0001", `${shown(r)} salary=${c.salary?.amountSatang}`);
  }
  // S3.15 inbox
  {
    const l = await callMod(INBOX, "listInbox", [cA, V.owner, { type: "CERT" }, NOW]);
    const item = (l.value?.items ?? []).find((x: Any) => x.id === req2);
    const lm = await callMod(INBOX, "listInbox", [cA, V.mgr, {}, NOW]);
    const mgrSees = (lm.value?.items ?? []).some((x: Any) => x.type === "CERT");
    const d = await callMod(INBOX, "decideInbox", [cA, V.owner, { batchKey: `qc38${tag}cert0001`, decision: "APPROVED", items: [{ type: "CERT", id: req2 }] }, NOW]);
    let row = (await scRows(TT)).find((x) => x.id === req2);
    if (row?.status !== "ISSUED") await S("issueSalaryCertificate", cA, V.owner, { requestId: req2 }, NOW); // fallback so later checks keep their numbers
    row = (await scRows(TT)).find((x) => x.id === req2);
    ck("S3.15", { listed: item?.type === "CERT" && item?.employeeId === E.e4, noMoney: !!item && ![...keysDeep(item)].some((k) => /Satang/.test(k)), mgr: !mgrSees, decided: d.value?.ok === true && d.value?.results?.[0]?.ok === true, issued: row?.status === "ISSUED" && row?.docNo === "HRSC-2032-0002" }, "inbox CERT", `list=${shown(l)} decide=${short(d.value ?? d.text, 100)}`);
  }
  // S3.17 refusals (no number consumed) + reject
  {
    const n8 = await S("issueSalaryCertificate", cA, V.owner, { employeeId: E.e8, purpose: "GENERAL" }, NOW);
    const n9 = await S("issueSalaryCertificate", cA, V.owner, { employeeId: E.e9, purpose: "GENERAL" }, NOW);
    const nb = await S("issueSalaryCertificate", cB, V.owner, { employeeId: E.b1, purpose: "GENERAL" }, NOW);
    const own = await S("issueSalaryCertificate", cA, V.pay, { employeeId: E.e10, purpose: "GENERAL" }, NOW);
    const ro = await S("issueSalaryCertificate", cA, V.payRead, { employeeId: E.e1, purpose: "GENERAL" }, NOW);
    const mg = await S("issueSalaryCertificate", cA, V.mgrAll, { employeeId: E.e1, purpose: "GENERAL" }, NOW);
    const r3 = await S("requestSalaryCertificate", actorOf(U.self), { purpose: "VISA" }, NOW);
    const rj = await S("rejectSalaryCertRequest", cA, V.owner, { requestId: r3.value?.certId }, NOW);
    const rj2 = await S("rejectSalaryCertRequest", cA, V.owner, { requestId: r3.value?.certId }, NOW);
    const is3 = await S("issueSalaryCertificate", cA, V.owner, { requestId: r3.value?.certId }, NOW);
    const seq = Number((await raw(`SELECT "lastNo" FROM "AccountDocSequence" WHERE "systemId" = $1 AND "periodKey" = 'HRSC:2032'`, sA))[0]?.lastNo ?? -1);
    ck("S3.17", {
      noSlip: codeIs(n8, "CERT_NO_SLIP", "certNoSlip"), noBase: codeIs(n9, "CERT_NO_BASE", "certNoBase"), profile: codeIs(nb, "PROFILE", "profile"), own: codeIs(own, "OWN", "own"), ro: isNo(ro), mgr: isNo(mg),
      reject: rj.ok && (await scRows(TT)).find((x) => x.id === r3.value?.certId)?.status === "REJECTED", again: codeIs(rj2, "NOT_DECIDABLE", "notDecidable") && codeIs(is3, "NOT_DECIDABLE", "notDecidable"), seq: seq === 2,
    }, "refusals", `${shown(n8)} ${shown(n9)} ${shown(nb)} ${shown(own)} seq=${seq}`);
  }
  // S3.18 frozen certificate + void + reissue
  {
    await P.hrEmployee.update({ where: { id: E.e1 }, data: { name: `เปลี่ยนชื่อ ${tag}`, position: "ผู้จัดการ" } });
    const d1 = await S("downloadSalaryCertificate", cA, V.owner, { certId: c1Id });
    const t1 = pdfText(d1.value?.bytes);
    const orig = (await raw(`SELECT "contentJson" FROM "HrSalaryCertificate" WHERE "id" = $1`, c1Id))[0]?.contentJson;
    await exq(`UPDATE "HrSalaryCertificate" SET "contentJson" = jsonb_set("contentJson", '{salary,amountSatang}', '9999999'::jsonb) WHERE "id" = $1`, c1Id);
    const tam = await S("downloadSalaryCertificate", cA, V.owner, { certId: c1Id });
    await exq(`UPDATE "HrSalaryCertificate" SET "contentJson" = $2::jsonb WHERE "id" = $1`, c1Id, JSON.stringify(orig ?? {}));
    await P.hrEmployee.update({ where: { id: E.e1 }, data: { name: `เอกชัย ${tag}`, position: "บาริสต้า" } });
    const vNon = await S("voidSalaryCertificate", cA, V.pay, { certId: c1Id, reason: "ออกผิด" }, NOW);
    const vBad = await S("voidSalaryCertificate", cA, V.owner, { certId: c1Id, reason: "" }, NOW);
    const vOk = await S("voidSalaryCertificate", cA, V.owner, { certId: c1Id, reason: "ออกผิด" }, NOW);
    const dv = await S("downloadSalaryCertificate", cA, V.owner, { certId: c1Id });
    const re = await S("issueSalaryCertificate", cA, V.owner, { employeeId: E.e1, purpose: "GENERAL" }, NOW);
    ck("S3.18", {
      frozen: t1.pages >= 1 && thNorm(t1.text).includes(thNorm("เอกชัย")) && !thNorm(t1.text).includes(thNorm("เปลี่ยนชื่อ")), changed: codeIs(tam, "CERT_CHANGED", "certChanged"),
      voidOwner: codeIs(vNon, "CERT_VOID_OWNER", "certVoidOwner"), reason: codeIs(vBad, "VOID_REASON", "voidReason"), voided: vOk.ok && codeIs(dv, "VOIDED", "voided"), reissue: re.value?.docNo === "HRSC-2032-0003",
    }, "frozen + void + 0003", `${shown(d1)} ${shown(tam)} ${shown(re)}`);
  }
  // S3.19 self certificates
  {
    const a = actorOf(U.self);
    const l1 = await S("listMySalaryCertificates", a);
    const has = (l1.value?.items ?? []).some((x: Any) => x.id === req2 && x.status === "ISSUED" && x.docNo === "HRSC-2032-0002");
    const a0 = await auditCount(TT, "hr.salarycert.download");
    const d = await S("downloadMySalaryCertificate", a, { certId: req2 });
    const aud = (await raw(`SELECT "after" FROM "AuditLog" WHERE "tenantId" = $1 AND "action" = 'hr.salarycert.download' ORDER BY "createdAt" DESC LIMIT 1`, TT))[0];
    const foreign = await S("downloadMySalaryCertificate", a, { certId: c1Id });
    await S("voidSalaryCertificate", cA, V.owner, { certId: req2, reason: "ทดสอบ" }, NOW);
    const l2 = await S("listMySalaryCertificates", a);
    const dv = await S("downloadMySalaryCertificate", a, { certId: req2 });
    ck("S3.19", { listed: has, pdf: pdfText(d.value?.bytes).pages >= 1, audit: (await auditCount(TT, "hr.salarycert.download")) === a0 + 1 && aud?.after?.by === "SELF", foreign: isNo(foreign), hidden: !(l2.value?.items ?? []).some((x: Any) => x.id === req2) && l2.ok, voided: isNo(dv) }, "self certs", `${shown(l1)} ${shown(d)}`);
  }
  // S3.21 myDocuments (H2.10 shape kept)
  {
    const r = await callMod(SELF, "myDocuments", [actorOf(U.self)]);
    const ps = (r.value?.payslips ?? []) as Any[];
    ck("S3.21", { keys: srt(Object.keys(r.value ?? {})) === "certificate,myRequestsSlot,notes,ok,payslips", ids: canon(ps.map((p) => p.runId).sort()) === canon([RA.r1, RA.r2].sort()), href: ps.length > 0 && ps.every((p) => p.href === `/app/me/hr/pay/${p.runId}`) }, "issued slips · self href", short(ps.map((p) => `${p.periodKey}:${p.href}`), 160));
  }
  // S6.1 / S6.2 loadPayslipForViewer
  {
    const L = (v: Any, r: string, e: string) => PRIV.loadPayslipForViewer(cA, v, r, e).catch(() => "THROW");
    ck("S6.1", { selfOwn: !!(await L(V.self, RA.r1, E.e4)) && (await L(V.self, RA.r1, E.e4)) !== "THROW", member: (await L(V.member, RA.r1, E.e4)) === null, ownerDraft: !!(await L(V.owner, RA.r5, E.e1)) }, "hotfix semantics kept");
    ck("S6.2", { unfinal: (await L(V.self, RA.r6, E.e4)) === null, reversed: (await L(V.self, RA.r4, E.e4)) === null }, "self: issued only");
  }
  // S5.1 / S5.2 route helpers
  {
    const url = (p: string) => `https://qc.invalid${p}`;
    const req = (m = "GET", h: Record<string, string> = {}) => new Request(url("/x"), { method: m, headers: h });
    const a0 = await auditCount(TT);
    const rsc = await RTc("payslipPdfGet", req("GET", { rsc: "1" }), cA, V.owner, RA.r2, E.e1);
    const pre = await RTc("payslipPdfGet", req("GET", { "next-router-prefetch": "1" }), cA, V.owner, RA.r2, E.e1);
    const quiet = (await auditCount(TT)) === a0;
    const ok = await RTc("payslipPdfGet", req(), cA, V.owner, RA.r2, E.e1);
    const okR = ok.value as Response | undefined;
    const cd = okR?.headers.get("content-disposition") ?? "";
    const bytes = okR ? Buffer.from(await okR.arrayBuffer()) : Buffer.alloc(0);
    const no = (await RTc("payslipPdfGet", req(), cA, V.member, RA.r2, E.e1)).value as Response | undefined;
    const nf = (await RTc("payslipPdfGet", req(), cA, V.owner, RA.r6, E.e1)).value as Response | undefined;
    const en = (await RTc("payslipPdfGet", req(), cA, V.member, RA.r2, E.e1, { locale: "en" })).value as Response | undefined;
    const me = (await RTc("myPayslipPdfGet", req(), actorOf(U.self), RA.r2)).value as Response | undefined;
    const meNo = (await RTc("myPayslipPdfGet", req(), actorOf(U.self), RA.r3)).value as Response | undefined;
    const reCert = await S("issueSalaryCertificate", cA, V.owner, { employeeId: E.e3, purpose: "GENERAL" }, NOW);
    const sc = (await RTc("salaryCertGet", req(), cA, V.owner, String(reCert.value?.certId ?? "x"))).value as Response | undefined;
    const msc = (await RTc("mySalaryCertGet", req(), actorOf(U.self), String(reCert.value?.certId ?? "x"))).value as Response | undefined;
    const body = async (r?: Response) => (r ? await r.text() : "∅");
    ck("S5.1", {
      r204: (rsc.value as Response | undefined)?.status === 204 && (pre.value as Response | undefined)?.status === 204 && quiet,
      ok: okR?.status === 200 && okR.headers.get("content-type") === "application/pdf" && /^attachment; filename="payslip-[A-Za-z0-9_.-]+\.pdf"$/.test(cd) && okR.headers.get("cache-control") === "no-store" && okR.headers.get("x-content-type-options") === "nosniff" && bytes.subarray(0, 5).toString() === "%PDF-",
      no: no?.status === 404 && (await body(no)) === T.no, nf: nf?.status === 409 && (await body(nf)) === T.notFinal, en: en?.status === 404 && (await body(en)) === TEN.no && !!TEN.no,
      self: me?.status === 200 && meNo?.status === 404, cert: reCert.ok && sc?.status === 200 && msc?.status === 404,
    }, "route helpers", `ok=${okR?.status} cd=${cd}`);
    const a1 = await auditCount(TT);
    const heads = [
      await RTc("payslipPdfGet", req("HEAD"), cA, V.owner, RA.r2, E.e1), await RTc("payslipPdfGet", req("POST"), cA, V.owner, RA.r2, E.e1),
      await RTc("myPayslipPdfGet", req("HEAD"), actorOf(U.self), RA.r2), await RTc("salaryCertGet", req("HEAD"), cA, V.owner, String(reCert.value?.certId ?? "x")), await RTc("mySalaryCertGet", req("HEAD"), actorOf(U.self), "x"),
    ].map((r) => r.value as Response | undefined);
    ck("S5.2", { s405: heads.every((h) => h?.status === 405 && h.headers.get("allow") === "GET"), quiet: (await auditCount(TT)) === a1 }, "405 first", heads.map((h) => h?.status ?? "∅").join(","));
  }
  // S6.3 / S6.4 privacy
  {
    const rows = await raw(`SELECT "action", "after" FROM "AuditLog" WHERE "tenantId" = $1 AND ("action" LIKE 'hr.payslip%' OR "action" LIKE 'hr.salarycert%')`, TT);
    const blob = JSON.stringify(rows.map((r) => r.after));
    const outbox = await P.outboxEvent.count({ where: { tenantId: TT } });
    ck("S6.3", { some: rows.length >= 8, ids: !IDS.some((x) => blob.includes(x)), names: !/เอกชัย|ดำรง|บุษบา/.test(blob), money: !rows.some((r) => [...keysDeep(r.after)].some((k) => /Satang/.test(k))), outbox: outbox === 0 }, "audit clean", `rows=${rows.length} outbox=${outbox}`);
    const sp = pdfText((await pdf(V.owner, RA.r2, E.e1)).value?.bytes);
    const cp = pdfText((await S("downloadSalaryCertificate", cA, V.owner, { certId: String((await scRows(TT)).find((x) => x.docNo === "HRSC-2032-0003")?.id ?? "x") })).value?.bytes);
    ck("S6.4", { slip: sp.pages >= 1 && !IDS.some((x) => sp.text.includes(x)) && !sp.text.includes("54321") && sp.text.includes("4321") && !thNorm(sp.text).includes(thNorm("บุษบา")), cert: cp.pages >= 1 && !IDS.some((x) => cp.text.includes(x)) }, "PDF privacy");
  }
  // S4.1 hold the run row ⇒ PDF read waits ⇒ sees REVERSED
  {
    const h = await holdRunRow(P, RA.r7, async (tx: Any) => tx.$executeRawUnsafe(`UPDATE "HrPayrollRun" SET "status" = 'REVERSED'::"PayrollRunStatus" WHERE "id" = $1`, RA.r7), () => pdf(V.owner, RA.r7, E.e1));
    ck("S4.1", { waited: h.waited, withdrawn: codeIs(h.res, "WITHDRAWN", "withdrawn"), holder: !h.holderErr }, "waits then WITHDRAWN", `waited=${h.waited} res=${shown(h.res)} ${h.holderErr}`);
  }
  // S3.20 after the reversal
  {
    const y = (await hist(V.owner, E.e1, 2031)).value?.year;
    const p7 = await pdf(V.owner, RA.r7, E.e1);
    const p3 = await S("issueSalaryCertificate", cA, V.owner, { employeeId: E.e3, purpose: "BANK" }, NOW); // e3's only issued slip was RA7 (now reversed)
    ck("S3.20", { hist: y?.count === 3 && y?.netSatang === 10_027_500 - 3_787_500, pdf: codeIs(p7, "WITHDRAWN", "withdrawn"), source: codeIs(p3, "CERT_NO_SLIP", "certNoSlip") }, "reversed excluded", `count=${y?.count} cert=${shown(p3)}`);
  }
  // S4.2 parallel request + parallel issue
  {
    const a = actorOf(U.self2);
    const rq = await Promise.all([0, 1, 2, 3, 4].map(() => S("requestSalaryCertificate", a, { purpose: "BANK" }, NOW)));
    const okReq = rq.filter((r) => r.ok);
    const rid = String(okReq[0]?.value?.certId ?? "");
    const is = await Promise.all([0, 1, 2, 3].map(() => S("issueSalaryCertificate", cA, V.owner, { requestId: rid }, NOW)));
    const okIs = is.filter((r) => r.ok);
    const docs = (await scRows(TT)).filter((x) => x.docNo).map((x) => String(x.docNo)).sort();
    const seq = Number((await raw(`SELECT "lastNo" FROM "AccountDocSequence" WHERE "systemId" = $1 AND "periodKey" = 'HRSC:2032'`, sA))[0]?.lastNo ?? -1);
    const want = ["HRSC-2032-0001", "HRSC-2032-0002", "HRSC-2032-0003", "HRSC-2032-0004", "HRSC-2032-0005"]; // 0004 = e3 certificate of S5.1, 0005 = this race
    ck("S4.2", {
      req: okReq.length === 1 && rq.filter((r) => !r.ok).every((r) => codeIs(r, "CERT_REQ_OPEN", "certReqOpen")), issue: okIs.length === 1 && okIs[0]?.value?.docNo === "HRSC-2032-0005" && is.filter((r) => !r.ok).every((r) => codeIs(r, "NOT_DECIDABLE", "notDecidable")),
      contiguous: canon(docs) === canon(want), seq: seq === 5,
    }, "1 + 1 · contiguous", `req ${okReq.length}/5 issue ${okIs.length}/4 docs=${docs.join(",")} seq=${seq}`);
  }
}

// ═════════════════════════ main ═════════════════════════
let crashed = "";
const MINE = ["HrSalaryCertificate", "HrTaxCertificate", "HrFilingFile", "HrFilingPerson", "HrFilingProfile", "AccountDocSequence"];
async function cleanMine(): Promise<void> {
  for (const tid of fx.tenants) for (const t of MINE) await fx.rawRows(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid);
}
try {
  runStatic();
  await runPure(R, PDFM, T);
  await runDb();
} catch (e) {
  crashed = errText(e);
  console.log(`💥 harness: ${crashed}`);
}
{
  const r = await fitnessNoEnv().catch((e: unknown) => ({ ok: false, note: errText(e) }));
  chk("X12.1", r.ok, "exit 0 ×2", r.note);
}
await cleanMine();
await cleanupFx(P, fx, SLUG);
{
  const res = await residueOf(P, fx, SLUG, SLUG_PREFIX);
  const mine: string[] = [];
  for (const tid of fx.tenants) for (const t of MINE) {
    const r = await fx.rawRows(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid);
    if (r && Number(r[0]?.n ?? 0) !== 0) mine.push(`${t}=${r[0]?.n}`); // table absent (r = null) = nothing to leave behind
  }
  chk("Z1", res.length === 0 && mine.length === 0, "none", [...res, ...mine].join(",") || "none");
}
const missing = [F.rules, F.svc, F.pdf, F.route, F.acts, F.ui, ...ROUTES, F.pMeSlip].filter((f) => !exists(f));
process.exitCode = finish({ forced: FORCE, crashed, missing });
await P.$disconnect?.();
