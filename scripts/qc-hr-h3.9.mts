// QC — HR V2 · H3.9 reports + employee register (ทะเบียนลูกจ้าง LPA s.112–115 [V2]) + CSV/XLSX exports with PDPA column rules
//      brief ledger/hr-briefs/hr-brief-H3.9.md (DRAFT · §9 defaults) · full matrix + catalog ledger/wo-notes/hr-H3.9-design.md
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// 🔴 Goldens are hand-derived (ledger/wo-notes/hr-H3.9-oracle.md §3) — fixture scripts/fixtures/hr-h3.9-vectors.json + hr-h3.9-texts.json.
//    The CSV text the export must equal is built HERE by an independent writer (csvTextOf) — never by the code under test.
// Tenants qc-hr-h39-<stamp> · data dated 2030–2032 · SKIP while hr/reports-rules.ts is absent (QC_FORCE=1 runs) · --list
// Statics compare with baseRef("QC_H39_BASE") (merge-base HEAD origin/session/hr) from day one · v2 checks (S7.x) need H3.4
//   (hr/payroll-run-rules.ts) — on a base without H3.4 they print "n/a — H3.4 absent" and FAIL by design (presence guard, no crash).
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h3.9.mts
import { existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  type Any, type Base, type Sev, ROOT, rd, short, errText, textOf, srt, failedKeys, stripComments, canon, sha, keysDeep, jsonOf, loadOpt, modState,
  PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, baseRef, commitInBase, pathInBase, changedVsBase, diffHunks, fileAt, makeRegistry, qc4Env, makeFixtures, cleanupFx, residueOf,
  vOf, fitnessNoEnv, importsOf, tagOf, HR_FORBIDDEN_DTO_KEYS, msgParity, testidsOf, inventoryParity, hrNavLabels, QUERY_COUNTER,
} from "./qc-hr-lib.mjs";

const SUITE = "qc-hr-h3.9";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-h39-";
const H = "src/lib/modules/hr/";
const F = {
  rules: `${H}reports-rules.ts`, svc: `${H}reports.ts`, ui: `${H}reports-ui.tsx`, rh: `${H}reports-route.ts`,
  page: "src/app/app/sys/[id]/hr/reports/page.tsx", route: "src/app/app/sys/[id]/hr/reports/export/route.ts",
  empPage: "src/app/app/sys/[id]/hr/employees/[employeeId]/page.tsx",
  mig: "prisma/migrations/20270109000000_hr_employee_register_fields/migration.sql",
  hrSchema: "prisma/schema/hr.prisma", paySchema: "prisma/schema/payroll.prisma", coreScope: "src/lib/core/scope.ts", env: "scripts/hr-qc-env.mts",
  hrUi: `${H}ui.tsx`, overview: `${H}overview-ui.tsx`, nav: `${H}nav.ts`, layout: "src/app/app/layout.tsx",
  th: "src/messages/th/common.json", en: "src/messages/en/common.json", inv: "scripts/hr-ui-inventory.json", visual: "scripts/visual-hr.mts",
  payroll: `${H}payroll.ts`, runRules: `${H}payroll-run-rules.ts`,
};
const FIX = "scripts/fixtures/";
const VEC = jsonOf(`${FIX}hr-h3.9-vectors.json`) as Any;
const TX = jsonOf(`${FIX}hr-h3.9-texts.json`) as Any;
const T = (TX?.th ?? {}) as Record<string, string>;
const TE = (TX?.en ?? {}) as Record<string, string>;
const CAT = (VEC?.catalog ?? {}) as Record<string, { period: string; totals: boolean; thaiOnly: boolean; columns: [string, string, boolean, string, string][] }>;
const IDS = (VEC?.reportIds ?? []) as string[];
const GOLD = (VEC?.golden ?? {}) as Record<string, Any>;
const FROZEN = [
  PAYROLL_RULES_FILE, `${H}payroll.ts`, `${H}payroll-actions.ts`, `${H}payroll-ui.tsx`, `${H}payroll-rules-v2.ts`, `${H}payroll-digest.ts`, `${H}privacy.ts`,
  `${H}privacy-shared.ts`, `${H}service.ts`, `${H}scope.ts`, `${H}judge.ts`, `${H}clock.ts`, `${H}leave.ts`, `${H}leave-rules.ts`, `${H}ot.ts`, `${H}ot-rules.ts`,
  `${H}correction.ts`, `${H}work-entries.ts`, `${H}law.ts`, `${H}nav.ts`, `${H}bank-files`, "src/lib/core/rbac.ts", "src/lib/outbox-consumers.ts",
  "src/lib/modules/approval", "src/lib/modules/account", "scripts/seed-hr-qc.mts", "scripts/fitness-hr.mts", "scripts/qc-hr-lib.mts",
  "scripts/qc-hr-h1.2.mts", "scripts/qc-hr-h1.3.mts", "scripts/qc-hf-hr-privacy.mts", "scripts/qc-hr-h2.5.mts", "scripts/qc-hr-h3.5.mts",
];
const TESTIDS = ["hr-report-picker", "hr-report-period", "hr-report-unit", "hr-report-table", "hr-report-row-*", "hr-report-totals", "hr-report-export-csv",
  "hr-report-export-xlsx", "hr-report-notes", "hr-report-warnings", "hr-report-empty"];
const REG_TESTIDS = ["hr-register-card", "hr-register-nationality", "hr-register-benefits", "hr-register-save", "hr-report-fullid-toggle", "hr-report-fullid-ack", "hr-report-fullid-warning", "hr-report-fullid-save"]; // ruling Q2
/** tokens that may never appear in report code (S1.6): sensitive / health / location / ratchet tokens (qc-hr-h1.2 S6.4 · qc-hr-h1.3 S6.1 · F16.1) */
const BANNED = ["bankAccountNo", "bankAccountName", "bankName", "houseRegAddress", "ssoNumber", "pinCode", "pinHash", "offboardNote", "offboardReason",
  "attachmentKey", "photoKey", "lat", "lng", "accuracyM", "deviceId", "ytdJson", "lawRowIds", "sourceRef", "filingJson", "bankFileKey", "hrLawTable",
  "HrLawTable", "hrWorkEntry", "HrWorkEntry", "linkedUserId", "emergencyPhone", "emergencyName"];
const RECOMPUTE = ["computeItem", "computeRunItemV2", "ssoContribution", "monthlyWhtSatang", "ssoV2", "whtYtdV2", "computeItemV2", "payableGrossSatang", "otAmount", "buildWorkEntrySnapshot"];

const SEV: Record<string, Sev> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS = `
S1.1|R1|C|R|[static] files: reports-rules.ts · reports.ts · reports-ui.tsx · reports-route.ts · reports page · export route · register migration
S1.2|R10|C|R|[static] migration 20270109000000: CREATE TABLE "HrEmployeeRegister" (employeeId UNIQUE · nationality ≤ 60 CHECK · otherBenefits ≤ 500 CHECK) only · model in hr.prisma · HrEmployee/HrSalaryProfile/HrPayrollRun/HrPayrollItem blocks unchanged · core scope sys() · hr-qc-env
S1.3|R2|C|R|[static] pure layer reports-rules.ts: imports ⊆ ./bank-files/{generic,xlsx,encode} (+ type-only) · no db/clock/random/process/fetch
S1.4|R7|C|R|[static] one CSV/XLSX writer: reports*.ts import csvBytes + xlsxBytes from bank-files · no own quoting/zip/BOM code
S1.5|frozen|C|G|[static] [control] payroll-rules sha · frozen files/dirs unchanged vs base · no new tab label in hrTabs/layout
S1.6|R4 R5|C|R|[static] reports*.ts + page + route: no banned token (bank/houseReg/sso no./PIN/GPS/photo/device/attachment/offboard/ytdJson/lawRowIds/sourceRef/HrLawTable/HrWorkEntry) · no punch-table read · no recompute fn · nationalId only in reports.ts
S1.7|R8|C|R|[static] export route: GET → reportExportGet · router fetch 204 first · page imports a scope.ts guard + reports.ts loader
S1.8|R11|M|R|[static] nav decision: hrTabs + layout HR labels = base (no "รายงาน" tab) · overview/hub link to /hr/reports (testid hr-overview-reports-link) · nav.ts unchanged
S1.9|R12|M|R|[static] UI testids (report page + register card) · inventory rows wo H3.9 · hr.report th = en keys · visual spec "3.9" · no "use client" report file imports reports.ts/db or reads sensitive fields
S1.11|R4|C|R|[static] membership gate pinned: every exported async fn of reports.ts calls gateOf( · page/route/actions reach report data only through reports.ts
S1.10|§5|M|R|[static] every hunk in shared files marked "HR H3.9" (core scope · hr-qc-env · hr.prisma · hub/overview · employee page · messages · inventory · visual)
S2.0|fix|C|G|[pure] [control] fixture self-consistency: catalog keys unique · golden widths = catalog · golden totals = Σ golden rows (own baht/tenths parser)
S2.1|R6|C|R|[pure] REPORT_TEXT / REPORT_TEXT_EN = texts fixture byte-exact · reportTextFor(locale)
S2.2|R3|C|R|[pure] REPORT_IDS + REPORT_CATALOG = fixture (key · class P/$/I · sum · th · en · period kind · totals · thaiOnly) · REPORT_LIMITS
S2.3|R4|C|R|[pure] columnsFor(report, {money, fullId}, page|export) for 9 reports × 4 access sets × 2 surfaces = catalog minus $ when !money (I kept)
S2.4|R3|C|R|[pure] maskCitizenId · bahtText · tenthsText · addressOf vectors
S2.5|R3|C|R|[pure] ageOn vectors (birthday on the day · leap day · future/null ⇒ null)
S2.6|R3|C|R|[pure] absentMinOf · whtIncomeOf (v1 base+add · v2 whtIncomeSatang · non-integer/negative ⇒ 0) · wagePartsOf (v1 / v2 line codes)
S2.7|R7|C|R|[pure] reportTable(golden) = header (th · en · register always th) + rows + totals row ("รวม"/"Total") for every golden
S2.8|R7|C|R|[pure] reportBytes CSV = BOM + independent CSV text · XLSX parseImportFile = same table · deterministic · input not mutated
S2.9|R7|C|R|[pure] exportProblem: numeric/date cells exempt · formula (incl. after whitespace) ⇒ FORMULA names · control char ⇒ ENCODING first
S2.10|R3|M|R|[pure] periodOk vectors (month/year/day kinds · 2000–2600 · malformed ⇒ false · unknown report ⇒ false)
S3.0|fix|C|G|[db] [control] fixture inserted: 5 employees · 2 units · judge days · corrections · OT · leave ledger · 5 runs (Σ items = run totals)
S3.1|R3a|C|R|[db] time 2031-10 owner = golden (rows · totals · order code→name→id) · out-of-period rows ignored · notes timeNote
S3.2|R3b|C|R|[db] leave 2031 = teamLeaveBalances rows 1:1 (owner) · e1/P1 row golden · ruling Q1: payroll all-branch = owner rows · payroll branch = u1 rows only · no reason anywhere
S3.3|R3c|C|R|[db] ot 2031-10 owner = golden (status counts · settled segments by class · ฿) · CANCELLED / unsettled segments ignored
S3.4|R3d|C|R|[db] payroll-month 2031-10 / 2031-09 / 2031-08 (REVERSED) / 2031-11 (DRAFT) + payroll-year 2031 = goldens · read stored item columns
S3.5|R3e|C|R|[db] tax-month 2031-11 / 2031-10 / 2031-09 (Bangkok pay month) + tax-year 2031 / 2030 = goldens · income 40(1) rule v1/v2 · notes taxNote
S3.6|R3f|C|R|[db] wages (s.114) 2031-10 (v2-shaped lines) / 2031-09 (v1 snapshot) = goldens · notes s114Note
S3.7|R3g|C|R|[db] register 2031-10-31 owner: page + export (setting OFF ⇒ IDs masked) = golden · leaver kept · warnings counts · notes duty/under-10/retention
S3.8|R10|C|R|[db] saveRegisterFields: gates (owner · hr-admin in branch · benefits needs payroll) · out of branch/other ⇒ NO · limits ⇒ registerInput · audit fields only · loadRegisterFields keys by gate
S3.10|A|C|R|[db] revoked OT (ruling A): APPROVED+revokedAt and CANCELLED+revokedAt never in approved count/minutes · kept HOLIDAY_WORK minutes only in keptHolidayWorkMin (฿ only for money viewers)
S3.11|B|C|R|[db] register "10 or more" note (ruling B): all-branch viewers get duty/under-10 · branch-limited payroll viewer gets neither (no shop-wide count signal)
S3.12|F2e|C|R|[db] fix r1/r2: register as of a date — hired after the date not listed · end date = last employed day (ended only when endDate < as-of) · ENDED without endDate = ended, blank end date
S3.9|R7|C|R|[db] owner exports: time CSV + register CSV = independent CSV text of golden · XLSX = same table · file names · content types
S4.1|R4|C|R|[db] gate matrix 10 viewers × 9 reports × page/export = design matrix (ok ⇔ allowed · NO otherwise)
S4.2|R4|C|R|[db] column sets: DTO keys + export header = columnsFor(viewer access) for every allowed cell of the matrix
S4.3|R4|C|R|[db] branch: u1 viewers see u1 rows only · totals from visible rows (≠ run totals) · unassigned hidden · unit filter in/out of scope · unknown unit ⇒ []
S4.4|R4|C|R|[db] national ID, setting OFF (default): no full ID in any page or export of any viewer (register export masked too)
S4.5|R4|C|R|[db] manager / hr-admin: no $ key · no money value (OT ฿ strings absent from DTO and export text) · payroll/tax/wages/register NO
S4.6|X11|C|R|[db] forbidden keys absent from every DTO (HR_FORBIDDEN_DTO_KEYS + snapshot/ytd/GPS/photo/attachment) · sentinel secrets absent from DTOs, exports, audit
S4.7|X2|C|R|[db] cross-tenant / cross-system ctx ⇒ NO with identical bytes · own empty system ⇒ ok rows []
S4.10|X2|C|R|[db] membership gate on every entry point: non-member (other tenant owner) and role-claim mismatch ⇒ NO for loadReport · exportReport · reportExportGet (404) · get/setReportSettings · load/saveRegisterFields · nothing written
S4.11|F2c|C|R|[db] fix r1: XLSX exports of every non-owner allowed cell parsed — no full ID · no secret · managers/hr-admin/leave reader: no ฿ strings
S4.12|F1|C|R|[db] fix r1/r2: settings lost update, deterministic — raw tx holds hr:clockpolicy + reads; setReportSettings(OFF) blocks; raw tx writes stale settings + another key; OFF and the other key both survive (×3)
S4.8|Q2|C|R|[db] ruling Q2 setting "full national ID in register export": owner only (others settingOwner) · ON needs acknowledge (ackFullId) · default OFF · other settings keys kept · audit hr.report.setting
S4.9|Q2|C|R|[db] setting ON: register export full for owner / all-branch payroll only · branch payroll masked · pages + tax exports masked · export audit fullId true/false · OFF again ⇒ masked
S5.1|R9|C|R|[db] export audit: 1 row hr.report.export · targetType HrReport · after keys exactly {report period format rowCount columns unitId fullId} · no values · refusals not audited
S5.2|R8|C|R|[db] route helper: rsc / next-router-prefetch ⇒ 204 no audit · 200 attachment + no-store + nosniff + type · 404 NO text · 400 input text · 409 formula text · no bytes on refusal
S5.5|F2a F2b|C|R|[db] fix r1: route HEAD/POST ⇒ 405 no audit (reports + bank-file helper) · injected source cap ⇒ LIMIT text (time · ot · payroll-year · tax-year · wages · corrections) not truncated totals · no audit
S5.3|R3|M|R|[db] input refusals: bad report / period / format / unit type ⇒ INPUT text · not audited · nothing written
S5.4|R7|C|R|[db] export guard on real data: position "+SUM(A1)" ⇒ FORMULA naming the employee · page still ok · nationality with BEL ⇒ ENCODING
S6.1|R13|M|R|[db] performance: time 300 employees × 31 days ≤ 12 queries · ≤ 5000 ms · totals exact
S6.2|R13|M|R|[db] performance: tax-year + payroll-year 12 runs × 300 items ≤ 12 queries each · ≤ 5000 ms · totals exact
S6.3|R13|M|R|[db] performance: register 300 + time CSV export 300 rows ≤ 12 queries · ≤ 5000 ms
S7.1|v2|C|R|[db] [needs H3.4] item from computeRunItemV2 stored as H3.4 stores it ⇒ payroll-month = item columns · tax-month income = whtIncomeSatang · wages = Σ lines by code
S7.2|v2|C|R|[static] [needs H3.4] seam: payroll.ts writes the snapshot keys the reports read (engineVersion 2 · whtIncomeSatang · lines · payType) · reports never import payroll-run-rules
S7.3|Q5|C|R|[db] [needs H3.4] ruling Q5: v2 runs count only when finalized (journalEntryId set or stepsJson.finalized = true) · unfinalized v2 APPROVED excluded from payroll/tax/wages · v1 rule unchanged
X12.1|X12|M|G|[run] fitness + fitness-hr without env ⇒ exit 0
Z1|house|C|G|no residue (HrEmployeeRegister included)
`.trim().split("\n").map((l) => {
  const [id, g, sv, b, t] = l.split("|");
  return [`H3.9-${id}`, g, SEV[sv], (b === "R" ? "RED" : "GREEN") as Base, t] as const;
});
const { chk, printList, skipExit, finish } = makeRegistry(SUITE, "H3.9-", CHECKS);
if (ARGV.includes("--list")) {
  printList();
  process.exit(0);
}
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, F.rules))) skipReasons.push(`${F.rules} absent (H3.9 not built)`);
if (skipReasons.length && !FORCE) skipExit(skipReasons);
const ck = (id: string, r: Record<string, unknown>, exp: string, extra = "") => chk(id, Object.values(r).every(Boolean), exp, `${failedKeys(r)}${extra ? ` ${extra}` : ""}`);
// base = merge-base with origin/session/hr; when that is older than the tip this WO was cut from (session/hr merged locally, not yet
//   pushed: 5d7bcf0c4 = H3.5 merge), the cut point is used instead — statics never see earlier merged WOs as "changed"
const BASE_CUT = "5d7bcf0c4";
const BASE0 = ((b: string) => (b && commitInBase(BASE_CUT, b) ? b : BASE_CUT))(baseRef("QC_H39_BASE"));
// ORACLE-EDIT (builder H3.9 merge round · controller 13 Nov): base-aware — the local integration branch session/hr can hold merges not pushed to origin yet
//   (postmerge pushes later); when merge-base(HEAD, session/hr) is a descendant of the origin-derived base it is the newer base and is used (an env override wins) ◂
const LOCAL_MB = (() => {
  try {
    return execFileSync("git", ["merge-base", "HEAD", "session/hr"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
})();
const BASE = !process.env.QC_H39_BASE && LOCAL_MB && LOCAL_MB !== BASE0 && commitInBase(BASE0, LOCAL_MB) ? LOCAL_MB : BASE0;
const IN_BASE = pathInBase(F.svc, BASE);
const HAS_H34 = existsSync(join(ROOT, F.runRules));
const code = (p: string) => stripComments(rd(p));
const listFiles = (d: string): string[] => {
  const out: string[] = [];
  const walk = (x: string) => {
    if (!existsSync(join(ROOT, x))) return;
    for (const n of readdirSync(join(ROOT, x), { withFileTypes: true })) n.isDirectory() ? walk(`${x}/${n.name}`) : out.push(`${x}/${n.name}`);
  };
  walk(d);
  return out;
};
const markedOk = (file: string) => {
  const hs = diffHunks(BASE, file);
  if (!hs) return false;
  const mine = hs.filter((h) => h.added.some((l) => /HR H3\.9/.test(l)));
  return mine.length > 0 && hs.every((h) => h.added.concat(h.removed).some((l) => /HR H\d|H\d\.\d/.test(l)));
};
const modelBlock = (src: string | null, name: string) => {
  if (!src) return "";
  const i = src.search(new RegExp(`^model ${name} \\{`, "m"));
  return i < 0 ? "" : src.slice(i, src.indexOf("\n}", i) + 2);
};

// ═════════════════════════ independent helpers (never the code under test) ═════════════════════════
const keysOf = (r: string, money = true) => (CAT[r]?.columns ?? []).filter((c) => money || c[1] !== "$").map((c) => c[0]);
const labelsOf = (r: string, locale: "th" | "en", money = true) => (CAT[r]?.columns ?? []).filter((c) => money || c[1] !== "$").map((c) => (CAT[r]!.thaiOnly || locale === "th" ? c[3] : c[4]));
const sumKeys = (r: string) => (CAT[r]?.columns ?? []).filter((c) => c[2]).map((c) => c[0]);
const csvCellOf = (s: string) => (/[,"\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
/** the export text the CSV must equal: BOM + cells joined by "," + CRLF after every row */
const csvTextOf = (table: string[][]) => "﻿" + table.map((r) => r.map(csvCellOf).join(",") + "\r\n").join("");
const parseCsv = (txt: string): string[][] => {
  const s = txt.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === '"' && s[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") row.push(cell), (cell = "");
    else if (c === "\r" && s[i + 1] === "\n") row.push(cell), rows.push(row), (row = []), (cell = ""), i++;
    else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows;
};
const moneyOf = (s: string): number | null => (/^-?\d+\.\d{2}$/.test(s) ? Math.round(Number(s) * 100) : null);
const bahtOwn = (n: number) => `${n < 0 ? "-" : ""}${Math.floor(Math.abs(n) / 100)}.${String(Math.abs(n) % 100).padStart(2, "0")}`;
const padRows = (rows: string[][]) => {
  const w = Math.max(0, ...rows.map((r) => r.length));
  return rows.map((r) => [...r, ...Array(w - r.length).fill("")]);
};
/** golden → the table a CSV export must contain (header + rows + totals) */
const goldTable = (report: string, g: Any, locale: "th" | "en" = "th", money = true) => [labelsOf(report, locale, money), ...(g.rows as string[][]), ...(g.totals ? [locale === "en" ? [TE.total, ...(g.totals as string[]).slice(1)] : (g.totals as string[])] : [])];
/** ruling Q2: default register export = IDs masked like the page (golden pageIds) */
const maskedRegister = () => {
  const g = GOLD["register|2031-10-31|ownerExport"];
  return { ...g, rows: (g.rows as string[][]).map((row, i) => [...row.slice(0, -1), g.pageIds[i] as string]) };
};
const totalsRecord = (report: string, g: Any): Record<string, string> | null => {
  if (!g.totals) return null;
  const ks = keysOf(report);
  const sk = new Set(sumKeys(report));
  return Object.fromEntries(ks.map((k, i) => [k, (g.totals as string[])[i]!] as const).filter(([k]) => sk.has(k)));
};
const rowsRecord = (report: string, g: Any) => (g.rows as string[][]).map((r) => Object.fromEntries(keysOf(report).map((k, i) => [k, r[i]!])));

type RO = { ok: boolean; text: string; value: Any };
const CAPTURED: string[] = [];
const REAL_CONSOLE = { log: console.log, info: console.info, warn: console.warn, error: console.error };
let capDepth = 0;
async function callMod(Mo: Any, file: string, fn: string, args: unknown[]): Promise<RO> {
  const mo = Mo && !Mo.__err ? Mo : null;
  if (typeof mo?.[fn] !== "function") return { ok: false, text: `∅${fn} (${modState(Mo, file)})`, value: undefined };
  const cap = (...a: unknown[]) => void CAPTURED.push(a.map((x) => (typeof x === "string" ? x : short(x, 400))).join(" "));
  if (capDepth++ === 0) Object.assign(console, { log: cap, info: cap, warn: cap, error: cap });
  try {
    const v = (await mo[fn](...args)) as Any;
    const ok = v !== null && v !== undefined && !(typeof v === "object" && v.ok === false);
    return { ok, text: ok ? "" : String(v?.reason ?? textOf(v) ?? short(v, 80)), value: v };
  } catch (e) {
    return { ok: false, text: `THROW ${errText(e)}`, value: undefined };
  } finally {
    if (--capDepth === 0) Object.assign(console, REAL_CONSOLE);
  }
}
const pureCall = (Mo: Any, fn: string, ...a: unknown[]): Any => {
  try {
    return typeof Mo?.[fn] === "function" ? Mo[fn](...a) : `∅${fn}`;
  } catch (e) {
    return `THROW ${errText(e)}`;
  }
};
const dec = (b: unknown) => (b instanceof Uint8Array ? Buffer.from(b).toString("utf8") : "");
const dtoArr = (report: string, v: Any, money = true): string[][] => (Array.isArray(v?.rows) ? v.rows.map((r: Any) => keysOf(report, money).map((k) => (typeof r?.values?.[k] === "string" ? r.values[k] : `∅${k}`))) : []);
const dtoTot = (report: string, v: Any, money = true): string[] | null =>
  v?.totals ? keysOf(report, money).map((k, i) => (i === 0 ? "รวม" : typeof v.totals[k] === "string" ? v.totals[k] : "")) : null;
const sameGold = (report: string, v: Any, g: Any, money = true) => canon(dtoArr(report, v, money)) === canon(g.rows) && canon(dtoTot(report, v, money)) === canon(g.totals ?? null);

// ═════════════════════════ static ═════════════════════════
function runStatic(): void {
  console.log(`── [static] base ${BASE.slice(0, 9)}${IN_BASE ? " (H3.9 in base)" : ""} · H3.4 ${HAS_H34 ? "present" : "absent"} ──`);
  // S1.1
  ck("S1.1", Object.fromEntries([F.rules, F.svc, F.ui, F.rh, F.page, F.route, F.mig].map((p) => [p.split("/").slice(-2).join("/"), existsSync(join(ROOT, p))])), "7 files");
  // S1.2
  {
    const mig = rd(F.mig);
    const hrCur = rd(F.hrSchema);
    const hrBase = fileAt(BASE, F.hrSchema);
    const payCur = rd(F.paySchema);
    const payBase = fileAt(BASE, F.paySchema);
    const blk = modelBlock(hrCur, "HrEmployeeRegister");
    const r = {
      create: /CREATE TABLE "HrEmployeeRegister"/.test(mig),
      cols: ["id", "tenantId", "systemId", "employeeId", "nationality", "otherBenefits", "updatedById", "createdAt", "updatedAt"].every((c) => new RegExp(`"${c}"`).test(mig)),
      unique: /CREATE UNIQUE INDEX[^;]*"HrEmployeeRegister"[^;]*\("employeeId"\)/.test(mig),
      chkNat: /CHECK[^;]*"nationality"[^;]*60/.test(mig),
      chkBen: /CHECK[^;]*"otherBenefits"[^;]*500/.test(mig),
      additive: !/ALTER TABLE\s+"(HrEmployee|HrSalaryProfile|HrPayrollRun|HrPayrollItem)"|DROP |ALTER TYPE/.test(mig),
      model: !!blk && /nationality\s+String\?/.test(blk) && /otherBenefits\s+String\?/.test(blk) && /employeeId\s+String\s+@unique/.test(blk),
      frozenBlocks:
        !!hrBase && !!payBase && modelBlock(hrCur, "HrEmployee") === modelBlock(hrBase, "HrEmployee") && modelBlock(payCur, "HrSalaryProfile") === modelBlock(payBase, "HrSalaryProfile") &&
        modelBlock(payCur, "HrPayrollRun") === modelBlock(payBase, "HrPayrollRun") && modelBlock(payCur, "HrPayrollItem") === modelBlock(payBase, "HrPayrollItem"),
      scope: /\bHrEmployeeRegister:\s*sys\(\)/.test(rd(F.coreScope)),
      env: /model:\s*"HrEmployeeRegister"/.test(rd(F.env)),
    };
    ck("S1.2", r, "1 new table · checks · frozen blocks · scope · env");
  }
  // S1.3
  {
    const src = code(F.rules);
    const imps = importsOf(rd(F.rules));
    const okImp = (i: { type: boolean; spec: string }) => i.type || /^\.\/bank-files\/(generic|xlsx|encode)$/.test(i.spec);
    const r = {
      exists: src.length > 0,
      imports: imps.every(okImp),
      noIo: !/\bprisma\b|tenantDb|Date\.now|new Date\(\s*\)|Math\.random|process\.|fetch\(|"use server"|readFileSync|\bawait\b/.test(src),
    };
    ck("S1.3", r, "pure", `imports=${imps.map((i) => i.spec).join(",") || "∅"}`);
  }
  // S1.4
  {
    const all = [F.rules, F.svc, F.rh, F.ui].map(code).join("\n");
    const r = {
      csv: /\bcsvBytes\b/.test(all) && /from\s+["']\.\/bank-files\/generic["']/.test(rd(F.rules)),
      xlsx: /\bxlsxBytes\b/.test(all) && /from\s+["']\.\/bank-files\/xlsx["']/.test(rd(F.rules)),
      noOwn: !/replace\(\/"\/g,\s*['"]""['"]\)|0xef,\s*0xbb,\s*0xbf|\\ufeff|deflateRawSync|PK\\x03\\x04|0x04034b50/.test(all),
    };
    ck("S1.4", r, "generic writer reused");
  }
  // S1.5
  {
    // ORACLE-EDIT (builder H3.9 fix r1 · controller 13 Nov) F2a: bank-files/download-route.ts may change only by HR H3.9-marked hunks (HEAD guard); the rest of bank-files stays frozen ◂
    const DLR = `${H}bank-files/download-route.ts`;
    //   and scripts/qc-hr-h3.5.mts only by hunks that carry an "ORACLE-EDIT … H3.9" marker (S6.6 HEAD check) ◂
    const H35 = "scripts/qc-hr-h3.5.mts";
    // ORACLE-EDIT (builder HR-SET-1 · 13 Nov) S1.5: base-aware — once H3.9 is in the base (IN_BASE) a frozen file may differ only by hunks marked with a later
    //   ticket ("HR H<n>.<n>" · "HR-SET-<n>" · "ORACLE-EDIT …" naming one); any unmarked hunk still fails ◂
    const laterOnly = (f: string) => IN_BASE && (diffHunks(BASE, f) ?? []).length > 0 && (diffHunks(BASE, f) ?? []).every((h) => h.added.some((l) => /HR-SET-\d+|HR H\d+\.\d+|ORACLE-EDIT[^\n]*H\d+\.\d+/.test(l)));
    const diff = changedVsBase(BASE, FROZEN.flatMap((f) => (f === `${H}bank-files` ? listFiles(f).filter((x) => x !== DLR) : f === H35 ? [] : [f])).flatMap((f) => (f.endsWith(".ts") || f.endsWith(".mts") || f.endsWith(".tsx") ? (laterOnly(f) ? [] : [f]) : [f])));
    const h35Hunks = diffHunks(BASE, H35) ?? [];
    const dlrOk = (changedVsBase(BASE, [DLR]) === "unchanged" || markedOk(DLR)) && h35Hunks.every((h) => h.added.some((l) => /ORACLE-EDIT[^\n]*H3\.9/.test(l)));
    const n = hrNavLabels();
    const b = (s: string | null, at: string) => (s && s.indexOf(at) >= 0 ? s.slice(s.indexOf(at), s.indexOf("];", s.indexOf(at))) : "");
    const labels = (s: string) => [...s.matchAll(/label:\s*["']([^"']+)["']/g)].map((m) => m[1]);
    const baseT = labels(b(fileAt(BASE, F.hrUi), "export function hrTabs"));
    const baseL = labels(b(fileAt(BASE, F.layout), 'case "HR":'));
    const r = {
      sha: sha(rd(PAYROLL_RULES_FILE)) === PAYROLL_RULES_SHA,
      frozen: diff === "unchanged" && dlrOk,
      tabs: baseT.length > 0 && canon(n.T) === canon(baseT) && canon(n.L) === canon(baseL),
    };
    ck("S1.5", r, `sha · ${FROZEN.length} unchanged · tabs`, `${diff} T=${n.T.join("/")}`);
  }
  // S1.6
  {
    const files = [F.rules, F.svc, F.rh, F.ui, F.page, F.route].filter((p) => existsSync(join(ROOT, p)));
    const re = new RegExp(`\\b(${BANNED.join("|")})\\b`, "g");
    const hits = files.flatMap((f) => [...new Set(code(f).match(re) ?? [])].map((t) => `${f.split("/").pop()}:${t}`));
    const punch = files.filter((f) => /\bhrAttendance\.(findMany|findFirst|findUnique|count|aggregate|groupBy)\(|FROM\s+"HrAttendance"(?!Day)/.test(code(f)));
    const rec = files.flatMap((f) => RECOMPUTE.filter((fn) => new RegExp(`\\b${fn}\\s*\\(`).test(code(f))).map((fn) => `${f.split("/").pop()}:${fn}`));
    const nid = files.filter((f) => f !== F.svc && /\bnationalId\b/.test(code(f)));
    const r = { files: files.length === 6, banned: hits.length === 0, punch: punch.length === 0, recompute: rec.length === 0, nationalIdOnlySvc: nid.length === 0 };
    ck("S1.6", r, "clean", `banned=${hits.join(",") || "0"} punch=${punch.join(",") || "0"} recompute=${rec.join(",") || "0"} nid=${nid.join(",") || "0"}`);
  }
  // S1.7
  {
    const route = code(F.route);
    const rh = code(F.rh);
    const page = code(F.page);
    const r = {
      get: /export\s+async\s+function\s+GET/.test(route) && /reportExportGet\s*\(/.test(route),
      router204: /isRouterFetch\s*\(/.test(rh) && /status:\s*204/.test(rh) && rh.indexOf("isRouterFetch(") < rh.indexOf("exportReport("),
      headers: /attachment/.test(rh) && /no-store/.test(rh) && /nosniff/.test(rh),
      pageGuard: importsOf(rd(F.page)).some((i) => i.spec === "@/lib/modules/hr/scope") && /\b(loadReport|reportAccessOf)\s*\(/.test(page),
    };
    ck("S1.7", r, "route + page wired");
  }
  // S1.8
  {
    const hub = code(F.hrUi) + code(F.overview);
    const r = {
      link: /\/hr\/reports/.test(hub) && /hr-overview-reports-link/.test(hub),
      page: existsSync(join(ROOT, F.page)),
      nav: changedVsBase(BASE, [F.nav]) === "unchanged",
    };
    ck("S1.8", r, "no tab · hub link");
  }
  // S1.9
  {
    const ui = rd(F.ui);
    const emp = rd(F.empPage) + ui;
    const ids = new Set([...testidsOf(ui, "hr-report-"), ...testidsOf(emp, "hr-register-")]);
    const th = jsonOf(F.th)?.hr?.report ?? {};
    const en = jsonOf(F.en)?.hr?.report ?? {};
    const mp = msgParity(th, en, ["title", "export"]);
    const inv = inventoryParity("/hr/reports", new Set(testidsOf(ui, "hr-report-")), "H3.9", "qc-hr-h3.9");
    const clientFiles = listFiles("src/lib/modules/hr").filter((p) => /reports?[-.]/.test(p) && /^\s*["']use client["']/m.test(rd(p)));
    const badClient = clientFiles.filter((p) => importsOf(rd(p)).some((i) => !i.type && /reports(\.ts)?$|reports-route|\/core\/db|privacy$|bank-files\/(service|build)/.test(i.spec)) || /\b(nationalId|citizenIdFull|baseSalarySatang)\b/.test(code(p)));
    const r = {
      testids: [...TESTIDS, ...REG_TESTIDS].every((t) => ids.has(t)),
      inventory: inv.rows >= TESTIDS.length && inv.codeNoRow.length === 0 && inv.rowNoCode.length === 0 && inv.meta,
      msg: Object.values(mp).every(Boolean),
      visual: /"3\.9":\s*\[/.test(rd(F.visual)) && /\/hr\/reports/.test(rd(F.visual)),
      client: badClient.length === 0,
    };
    ck("S1.9", r, "ui contract", `missing=${[...TESTIDS, ...REG_TESTIDS].filter((t) => !ids.has(t)).join(",") || "0"} inv=${inv.rows}/${inv.codeNoRow.length}/${inv.rowNoCode.length} badClient=${badClient.join(",") || "0"}`);
  }
  // S1.11 ORACLE-EDIT (builder H3.9 · controller rulings 13 Nov): membership gate pinned for every entry point ◂
  {
    const svc = code(F.svc);
    const fns = [...svc.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)].map((m) => m[1]!);
    const body = (n: string) => {
      const i = svc.indexOf(`function ${n}(`);
      const j = svc.indexOf("\nexport ", i + 1);
      return svc.slice(i, j < 0 ? undefined : j);
    };
    const ungated = fns.filter((n) => !/\bgateOf\(/.test(body(n)));
    const acts = code(`${H}reports-actions.ts`);
    const r = {
      fns: fns.length >= 6,
      gated: ungated.length === 0,
      page: /\bloadReport\(/.test(code(F.page)) && !/tenantDb|hrEmployee|hrPayrollItem/.test(code(F.page)),
      route: /reportExportGet\(/.test(code(F.route)) && /\bexportReport\(/.test(code(F.rh)) && !/tenantDb/.test(code(F.rh) + code(F.route)),
      actions: /saveRegisterFields\(/.test(acts) && /setReportSettings\(/.test(acts) && !/tenantDb/.test(acts),
    };
    ck("S1.11", r, "gateOf in every entry", `fns=${fns.join(",")} ungated=${ungated.join(",") || "0"}`);
  }
  // S1.10
  {
    const files = [F.coreScope, F.env, F.hrSchema, F.th, F.en, F.inv, F.visual];
    const hub = [F.hrUi, F.overview].filter((f) => (diffHunks(BASE, f) ?? []).length > 0);
    const emp = (diffHunks(BASE, F.empPage) ?? []).length > 0 ? [F.empPage] : [];
    const all = [...files, ...hub, ...emp];
    // ORACLE-EDIT (builder HR-SET-1 · 13 Nov) S1.10: base-aware — once H3.9 is in the base (IN_BASE) its own hunks are gone: the shared files may only carry hunks
    //   marked with some ticket ("HR H<n>.<n>" · "HR-SET-<n>"); hub/json presence is n/a · before that the original rule applies unchanged ◂
    const anyMarked = (f: string) => (diffHunks(BASE, f) ?? [{ added: [], removed: [] }]).every((h) => h.added.concat(h.removed).some((l) => /HR H\d+\.\d+|HR-SET-\d+/.test(l)));
    const bad = IN_BASE ? files.filter((f) => !/\.json$/.test(f) && !anyMarked(f)) : all.filter((f) => !markedOk(f) && !/\.json$/.test(f));
    const jsonTouched = IN_BASE || [F.th, F.en, F.inv].every((f) => (diffHunks(BASE, f) ?? []).length > 0);
    ck("S1.10", { marked: bad.length === 0, hub: IN_BASE || hub.length > 0, json: jsonTouched }, "every hunk marked", `unmarked=${bad.join(",") || "0"}${IN_BASE ? " · H3.9 in base" : ""}`);
  }
}

// ═════════════════════════ pure ═════════════════════════
function runFixtureControl(): void {
  const keysUnique = IDS.every((r) => new Set(keysOf(r)).size === keysOf(r).length) && IDS.length === 9 && IDS.every((r) => !!CAT[r]);
  const bad: string[] = [];
  for (const [k, g] of Object.entries(GOLD)) {
    const report = k.split("|")[0]!;
    const money = !/managerBranch/.test(k);
    const w = keysOf(report, money).length;
    if (g.row) {
      if (g.row.length !== w) bad.push(`${k}:w`);
      continue;
    }
    if (!(g.rows as string[][]).every((r) => r.length === w) || (g.totals && g.totals.length !== w)) bad.push(`${k}:width`);
    if (!g.totals) continue;
    const ks = keysOf(report, money);
    const sk = new Set(sumKeys(report));
    ks.forEach((key, i) => {
      if (!sk.has(key)) return;
      const cells = (g.rows as string[][]).map((r) => r[i]!);
      const want = g.totals[i] as string;
      const m = moneyOf(want);
      const sum = m !== null ? bahtOwn(cells.reduce((a, c) => a + (moneyOf(c) ?? NaN), 0)) : /^\d+\.\d$/.test(want) ? (cells.reduce((a, c) => a + Math.round(Number(c) * 10), 0) / 10).toFixed(1) : String(cells.reduce((a, c) => a + Number(c), 0));
      if (sum !== want) bad.push(`${k}:${key}=${sum}≠${want}`);
    });
  }
  chk("S2.0", keysUnique && bad.length === 0 && !!T.no && !!TE.no, "consistent", bad.join(" ") || "ok");
}

function runPure(R: Any): void {
  console.log("── [pure] ──");
  // S2.1
  {
    const eq = (a: Any, b: Record<string, string>) => !!a && typeof a === "object" && canon(a) === canon(b);
    const fr = pureCall(R, "reportTextFor", "en");
    const fth = pureCall(R, "reportTextFor", "th");
    const fnull = pureCall(R, "reportTextFor", null);
    ck("S2.1", { th: eq(R?.REPORT_TEXT, T), en: eq(R?.REPORT_TEXT_EN, TE), forEn: eq(fr, TE), forTh: eq(fth, T), fallback: eq(fnull, T) }, "byte-exact");
  }
  // S2.2
  {
    const c = R?.REPORT_CATALOG;
    const bad: string[] = [];
    for (const r of IDS) {
      const got = c?.[r];
      const want = CAT[r]!;
      const cols = Array.isArray(got?.columns) ? got.columns.map((x: Any) => [x.key, x.cls, x.sum, x.th, x.en]) : null;
      if (!got || got.period !== want.period || got.totals !== want.totals || got.thaiOnly !== want.thaiOnly || canon(cols) !== canon(want.columns)) bad.push(r);
    }
    ck("S2.2", { ids: canon(R?.REPORT_IDS) === canon(IDS), catalog: bad.length === 0, extra: !!c && Object.keys(c).length === 9, limits: R?.REPORT_LIMITS?.employees === VEC.limits.employees }, "catalog = fixture", `bad=${bad.join(",") || "0"}`);
  }
  // S2.3
  {
    const bad: string[] = [];
    for (const r of IDS)
      for (const money of [true, false])
        for (const fullId of [true, false])
          for (const surface of ["page", "export"]) {
            const got = pureCall(R, "columnsFor", r, { money, fullId }, surface);
            if (canon(got) !== canon(keysOf(r, money))) bad.push(`${r}/${money ? "$" : "-"}/${fullId ? "id" : "m"}/${surface}`);
          }
    const pins = canon(keysOf("ot", false)) === canon(VEC.columnsFor["ot:noMoney"]) && canon(keysOf("time", false)) === canon(VEC.columnsFor["time:noMoney"]);
    ck("S2.3", { matrix: bad.length === 0, pins }, "72 cells", `bad=${bad.slice(0, 6).join(",") || "0"}${bad.length > 6 ? `…+${bad.length - 6}` : ""}`);
  }
  // S2.4
  {
    const P = VEC.pure;
    const vec = (fn: string, rows: [unknown, unknown][]) => rows.filter(([i, o]) => canon(pureCall(R, fn, i)) !== canon(o)).map(([i]) => `${fn}(${short(i, 20)})`);
    const bad = [...vec("maskCitizenId", P.mask), ...vec("bahtText", P.baht), ...vec("tenthsText", P.tenths), ...vec("addressOf", P.address)];
    chk("S2.4", bad.length === 0, "all vectors", bad.join(" ") || "ok");
  }
  // S2.5
  {
    const bad = (VEC.pure.age as [string | null, string, number | null][]).filter(([b, on, o]) => pureCall(R, "ageOn", b, on) !== o).map(([b, on]) => `${b}@${on}=${pureCall(R, "ageOn", b, on)}`);
    chk("S2.5", bad.length === 0, "8 vectors", bad.join(" ") || "ok");
  }
  // S2.6
  {
    const P = VEC.pure;
    const bad = [
      ...(P.absentMin as [Any, number][]).filter(([i, o]) => pureCall(R, "absentMinOf", i) !== o).map(([i]) => `absent(${canon(i)})`),
      ...(P.whtIncome as [Any, number][]).filter(([i, o]) => pureCall(R, "whtIncomeOf", i) !== o).map(([i]) => `wht(${canon(i)})`),
      ...(P.wageParts as [Any, Any][]).filter(([i, o]) => canon(pureCall(R, "wagePartsOf", i)) !== canon(o)).map(([i]) => `wage(v${i.engineVersion})`),
      ...(canon(R?.WAGE_CODES_V2) === canon(VEC.wageCodesV2) ? [] : ["WAGE_CODES_V2"]),
    ];
    chk("S2.6", bad.length === 0, "all vectors", short(bad.join(" "), 160) || "ok");
  }
  // S2.7
  {
    const bad: string[] = [];
    for (const [k, g] of Object.entries(GOLD)) {
      if (g.row) continue;
      const report = k.split("|")[0]!;
      const money = !/managerBranch/.test(k);
      const keys = keysOf(report, money);
      for (const locale of ["th", "en"] as const) {
        const got = pureCall(R, "reportTable", { report, keys, rows: rowsRecord(report, g).map((r) => Object.fromEntries(keys.map((x) => [x, r[x] ?? ""]))), totals: totalsRecord(report, g), locale });
        if (canon(got) !== canon(goldTable(report, g, locale, money))) bad.push(`${k}/${locale}`);
      }
    }
    chk("S2.7", bad.length === 0, `${Object.keys(GOLD).length - 1} goldens × th/en`, bad.slice(0, 5).join(" ") || "ok");
  }
  // S2.8
  {
    const g = GOLD["register|2031-10-31|ownerExport"];
    const t1 = goldTable("register", g);
    const g2 = GOLD["time|2031-10|owner"];
    const t2 = goldTable("time", g2);
    const frozen = JSON.stringify(t1);
    const c1 = pureCall(R, "reportBytes", t1, "CSV");
    const c1b = pureCall(R, "reportBytes", t1, "CSV");
    const c2 = pureCall(R, "reportBytes", t2, "CSV");
    const x1 = pureCall(R, "reportBytes", t1, "XLSX");
    let xlsxOk = false;
    try {
      const p = x1 instanceof Uint8Array ? DORM.parseImportFile(x1) : null;
      xlsxOk = !!p?.ok && canon(padRows([p.headers, ...p.rows])) === canon(padRows(t1));
    } catch {
      xlsxOk = false;
    }
    const r = {
      csvRegister: dec(c1) === csvTextOf(t1),
      csvTime: dec(c2) === csvTextOf(t2),
      deterministic: c1 instanceof Uint8Array && c1b instanceof Uint8Array && Buffer.compare(Buffer.from(c1), Buffer.from(c1b)) === 0,
      xlsx: xlsxOk,
      notMutated: JSON.stringify(t1) === frozen,
    };
    ck("S2.8", r, "bytes = independent text");
  }
  // S2.9
  {
    const bad = (VEC.pure.exportProblem as Any[]).filter((v) => canon(pureCall(R, "exportProblem", v.rows, v.names)) !== canon(v.want)).map((v, i) => `#${i}`);
    chk("S2.9", bad.length === 0, "6 vectors", bad.join(",") || "ok");
  }
  // S2.10
  {
    const bad = (VEC.pure.period as [string, unknown, boolean][]).filter(([r, p, o]) => pureCall(R, "periodOk", r, p) !== o).map(([r, p]) => `${r}:${p}`);
    chk("S2.10", bad.length === 0, "14 vectors", bad.join(" ") || "ok");
  }
}

// ═════════════════════════ db ═════════════════════════
const { P, coreHash } = await qc4Env(SUITE, { countQueries: true });
if (FORCE && skipReasons.length) console.log(`⚠️ QC_FORCE=1 — running although: ${skipReasons.join(" · ")}`);
const R = await loadOpt(F.rules, "@/lib/modules/hr/reports-rules");
const SV = await loadOpt(F.svc, "@/lib/modules/hr/reports");
const RH = await loadOpt(F.rh, "@/lib/modules/hr/reports-route");
const RUN2 = HAS_H34 ? await loadOpt(F.runRules, "@/lib/modules/hr/payroll-run-rules") : null;
const DORM = (await import("@/lib/modules/dorm/import-parse")) as Any;
const LEAVE = (await import("@/lib/modules/hr/leave")) as Any;
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
console.log(`[${SUITE}] rules=${modState(R, F.rules)} · service=${modState(SV, F.svc)} · route=${modState(RH, F.rh)} · H3.4=${HAS_H34 ? modState(RUN2, F.runRules) : "absent"}`);
const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${SLUG_PREFIX}${Date.now()}${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
const S = (fn: string, ...a: unknown[]) => callMod(SV, F.svc, fn, a);
const MINE = ["HrEmployeeRegister"];
const SECRET = { acct: "9876501234", house: "QC39-SECRET-HOUSE", sso: "QC39SSO777", reason: "QC39-SECRET-REASON", phone: "0812399999", note: "QC39-SECRET-NOTE", mail: "qc39secret@qc.invalid" };
const PERIOD: Record<string, string> = { time: "2031-10", leave: "2031", ot: "2031-10", "payroll-month": "2031-10", "payroll-year": "2031", "tax-month": "2031-11", "tax-year": "2031", wages: "2031-10", register: "2031-10-31" };
const noOf = (v: Any) => v?.ok === false && v?.code === "NO" && v?.reason === T.no;
const d0 = (day: string) => new Date(`${day}T00:00:00.000Z`);
const tableExists = async (t: string) => !!(await fx.rawRows(`SELECT to_regclass($1)::text AS r`, `"${t}"`))?.[0]?.r;

async function runDb(): Promise<void> {
  const TT = await fx.newTenant("", "QC HR H3.9 รายงาน");
  const T2 = await fx.newTenant("-other", "QC HR H3.9 ร้านอื่น");
  const u1 = await fx.newUnit(TT, "QC39 สาขาเหนือ", "u1");
  const u2 = await fx.newUnit(TT, "QC39 สาขาใต้", "u2");
  const sys = async (n: string, t = TT) => (await sysSvc.createSystem(t, "HR", `${n} ${tag}`)).id as string;
  const [sA, sB, sO, sP] = [await sys("ทีม A"), await sys("ทีม B"), await sys("ทีมอื่น", T2), await sys("ทีมใหญ่")];
  const cA = { tenantId: TT, systemId: sA };
  const cB = { tenantId: TT, systemId: sB };
  const cO = { tenantId: T2, systemId: sO };
  const cP = { tenantId: TT, systemId: sP };
  const mk = (t: string, r: "OWNER" | "MANAGER" | "STAFF", ua: string[], p: Record<string, boolean>, tid = TT) => fx.mkUser(tid, t, `QC39 ${t} ${tag}`, r, ua, p);
  const U = {
    owner: await mk("owner", "OWNER", [], {}),
    payAll: await mk("payall", "STAFF", ["*"], { "hr.payroll.read": true }),
    payBranch: await mk("paybranch", "STAFF", [u1], { "hr.payroll.read": true }),
    mgr: await mk("mgr", "MANAGER", [u1], {}),
    mgrAll: await mk("mgrall", "MANAGER", ["*"], {}),
    leaveReader: await mk("leaveread", "STAFF", [u1], { "hr.leave.read": true }),
    hrAdmin: await mk("hradmin", "STAFF", [u1], { "hr.employee.create": true }),
    self: await mk("self", "STAFF", [], {}),
    member: await mk("member", "STAFF", [], {}),
    other: await mk("other", "OWNER", [], {}, T2),
  };
  const V = Object.fromEntries(Object.entries(U).map(([k, w]) => [k, vOf(w)])) as Record<keyof typeof U, Any>;
  const emp = async (nm: string, o: Record<string, unknown>, extra: Record<string, unknown>) => {
    const id = await fx.mkEmp(TT, sA, nm, o as Any);
    await P.hrEmployee.update({ where: { id }, data: { phone: SECRET.phone, email: SECRET.mail, bankName: "KBank", bankAccountNo: SECRET.acct, bankAccountName: "QC39 SECRET", houseRegAddress: SECRET.house, ssoNumber: SECRET.sso, note: SECRET.note, ...extra } });
    return id;
  };
  const E = {
    e1: await emp("QC39 เอ หนึ่ง", { code: "A01", unitId: u1, startDate: "2030-01-15", position: "แคชเชียร์", status: "ACTIVE", linkedUserId: U.self.id },
      { gender: "FEMALE", birthDate: d0("1990-02-28"), department: "หน้าร้าน", addressLine: "12/3 ถ.สุขุมวิท", subdistrict: "คลองเตย", district: "คลองเตย", province: "กรุงเทพมหานคร", postcode: "10110", nationalId: "1101700203451" }),
    e2: await emp("QC39 บี สอง", { code: "A02", unitId: u1, startDate: "2031-03-01", position: "บาริสต้า", status: "PROBATION" }, { gender: "MALE", birthDate: d0("2000-10-31"), province: "เชียงใหม่", nationalId: "3-1006-01234-56-7" }),
    e5: await emp("QC39 อี ห้า", { code: "A03", unitId: u1, startDate: "2030-05-01", endDate: "2031-09-30", position: "เสิร์ฟ", status: "ENDED", active: false }, { gender: "FEMALE", birthDate: d0("1995-05-05"), offboardNote: SECRET.note }),
    e3: await emp("QC39 ซี สาม", { code: "B01", unitId: u2, startDate: "2029-06-01", status: "ACTIVE" }, {}),
    e4: await emp("QC39 ดี สี่", { startDate: "2028-01-01", position: "ครัว" }, { gender: "OTHER", birthDate: d0("1985-12-01"), nationalId: "5000011111223" }),
  };
  const nameOf = (id: string) => (Object.entries(E).find(([, v]) => v === id)?.[0] ?? id);
  // salary profiles (register rate)
  const prof = (e: string, payType: string, base: number, daily: number | null, hourly: number | null) =>
    P.hrSalaryProfile.create({ data: { tenantId: TT, systemId: sA, employeeId: e, baseSalarySatang: base, payType, dailyRateSatang: daily, hourlyRateSatang: hourly } });
  await prof(E.e1, "MONTHLY", 1_500_000, null, null);
  await prof(E.e2, "DAILY", 0, 50_000, null);
  await prof(E.e5, "MONTHLY", 1_200_000, null, null);
  await prof(E.e4, "HOURLY", 0, null, 6_000);
  // register table (raw — decoupled from the writer under test; absent table ⇒ skipped, S3.7 fails)
  const regRows: [string, string | null, string | null][] = [[E.e1, "ไทย", "ค่าอาหาร 50 บาท/วัน"], [E.e5, "เมียนมา", null], [E.e4, "ไทย", null]];
  const HAS_REG = await tableExists("HrEmployeeRegister");
  if (HAS_REG)
    for (const [e, n, b] of regRows)
      await P.$executeRawUnsafe(`INSERT INTO "HrEmployeeRegister" ("id","tenantId","systemId","employeeId","nationality","otherBenefits","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now(),now())`, `qc39reg-${tag}-${e.slice(-6)}`, TT, sA, e, n, b);
  // judge days
  type DayIn = [string, string, string, string, Record<string, unknown>];
  const days: DayIn[] = [
    [E.e1, "2031-10-01", "s1", "ON_TIME", { startMin: 420, endMin: 900, workedMin: 450 }],
    [E.e1, "2031-10-02", "s1", "LATE", { startMin: 420, endMin: 900, lateMin: 12, workedMin: 438 }],
    [E.e1, "2031-10-03", "s1", "EARLY_OUT", { startMin: 420, endMin: 900, earlyOutMin: 30, workedMin: 420 }],
    [E.e1, "2031-10-04", "s1", "ABSENT", { startMin: 420, endMin: 900, leaveFraction: "0.5" }],
    [E.e1, "2031-10-05", "DAY", "DAY_OFF", {}],
    [E.e1, "2031-10-06", "s1", "LEAVE", { startMin: 420, endMin: 900, leaveFraction: "1.0" }],
    [E.e1, "2031-10-07", "s1", "LATE", { startMin: 420, endMin: 900, lateMin: 5, workedMin: 500, otMin: 25, missingOut: true }],
    [E.e1, "2031-10-07", "s2", "ON_TIME", { startMin: 1080, endMin: 1320, workedMin: 240 }],
    [E.e1, "2031-09-30", "s1", "ON_TIME", { startMin: 420, endMin: 900, workedMin: 480 }],
    [E.e1, "2031-11-01", "s1", "LATE", { startMin: 420, endMin: 900, lateMin: 99, workedMin: 381 }],
    [E.e2, "2031-10-01", "s1", "ABSENT", { startMin: 1320, endMin: 360, crossesMidnight: true }],
    [E.e2, "2031-10-02", "s1", "ON_TIME", { startMin: 1320, endMin: 360, crossesMidnight: true, workedMin: 480 }],
    [E.e2, "2031-10-03", "DAY", "NO_SCHEDULE", {}],
    [E.e3, "2031-10-01", "s1", "ON_TIME", { startMin: 600, endMin: 900, workedMin: 300, otMin: 10 }],
    [E.e4, "2031-10-15", "s1", "LATE", { startMin: 480, endMin: 960, lateMin: 60, workedMin: 420 }],
    [E.e5, "2031-09-30", "s1", "ON_TIME", { startMin: 420, endMin: 900, workedMin: 480 }],
  ];
  for (const [e, day, slot, status, o] of days)
    await P.hrAttendanceDay.create({ data: { tenantId: TT, systemId: sA, employeeId: e, date: d0(day), slotKey: slot, status, judgedAt: new Date(`${day}T23:00:00Z`), ...o } });
  // corrections
  for (const [st, day] of [["APPROVED", "2031-10-07"], ["PENDING", "2031-10-08"], ["APPROVED", "2031-09-30"]] as const)
    await P.hrTimeCorrection.create({ data: { tenantId: TT, systemId: sA, employeeId: E.e1, kind: "OUT", proposedAt: new Date(`${day}T08:05:00Z`), reason: SECRET.reason, status: st, day: d0(day) } });
  // OT
  const seg = (cls: string, minutes: number, bp: number, amt: number) => ({ cls, minutes, multiplierBp: bp, amountSatang: amt });
  const ot = (e: string, day: string, status: string, minutes: number, o: Record<string, unknown> = {}) =>
    P.hrOtRequest.create({ data: { tenantId: TT, systemId: sA, employeeId: e, date: d0(day), startAt: new Date(`${day}T10:00:00Z`), endAt: new Date(`${day}T12:00:00Z`), minutes, timing: "AFTER", reason: SECRET.reason, status, ...o } });
  const SET = new Date("2031-10-20T03:00:00Z");
  await ot(E.e1, "2031-10-02", "APPROVED", 120, { settledAt: SET, amountSatang: 18_750, paidMinutes: 120, segmentsJson: [seg("OT_WORKDAY", 120, 15000, 18_750)] });
  await ot(E.e1, "2031-10-06", "APPROVED", 240, { settledAt: SET, amountSatang: 50_000, paidMinutes: 240, segmentsJson: [seg("HOLIDAY_WORK", 180, 10000, 25_000), seg("OT_HOLIDAY", 60, 30000, 25_000)] });
  await ot(E.e1, "2031-10-10", "PENDING", 60);
  await ot(E.e1, "2031-10-11", "REJECTED", 30);
  await ot(E.e1, "2031-10-12", "CANCELLED", 45, { segmentsJson: [seg("OT_WORKDAY", 45, 15000, 7_031)], amountSatang: 7_031, settledAt: SET });
  await ot(E.e1, "2031-10-13", "APPROVED", 90);
  await ot(E.e1, "2031-11-02", "APPROVED", 60, { settledAt: SET, amountSatang: 9_375, segmentsJson: [seg("OT_WORKDAY", 60, 15000, 9_375)] });
  // ORACLE-EDIT (builder H3.9 · controller rulings 13 Nov) ruling A: revoked requests — approved-then-revoked (ot.ts: status CANCELLED + revokedAt) keeps a HOLIDAY_WORK part ⇒ own column only;
  //   APPROVED + revokedAt (defensive) never counts anywhere ◂
  await ot(E.e1, "2031-10-14", "CANCELLED", 120, { revokedAt: SET, settledAt: SET, amountSatang: 15_000, paidMinutes: 120, segmentsJson: [seg("HOLIDAY_WORK", 120, 10000, 15_000)] });
  await ot(E.e1, "2031-10-15", "APPROVED", 30, { revokedAt: SET, settledAt: SET, amountSatang: 4_688, paidMinutes: 30, segmentsJson: [seg("OT_WORKDAY", 30, 15000, 4_688)] });
  await ot(E.e3, "2031-10-20", "APPROVED", 60, { settledAt: SET, amountSatang: 9_375, paidMinutes: 60, segmentsJson: [seg("OT_WORKDAY", 60, 15000, 9_375)] });
  // leave
  const pol = await P.hrLeavePolicy.create({ data: { tenantId: TT, systemId: sA, category: "VACATION", name: "QC39 พักร้อน", quotaDays: "6.0", yearStartMonth: 1 } });
  await P.hrLeaveBalanceTxn.create({ data: { tenantId: TT, systemId: sA, employeeId: E.e1, policyId: pol.id, kind: "GRANT", days: "6.0", leaveYear: 2031, effectiveDate: d0("2031-01-01"), sourceKey: `qc39-g-${tag}` } });
  const lv = await P.hrLeave.create({ data: { tenantId: TT, systemId: sA, employeeId: E.e1, type: "VACATION", fromDate: d0("2031-10-06"), toDate: d0("2031-10-07"), status: "APPROVED", reason: SECRET.reason, policyId: pol.id, days: "1.5" } });
  await P.hrLeaveBalanceTxn.create({ data: { tenantId: TT, systemId: sA, employeeId: E.e1, policyId: pol.id, kind: "USE", days: "-1.5", leaveYear: 2031, effectiveDate: d0("2031-10-06"), sourceKey: `qc39-u-${tag}`, leaveId: lv.id } });
  // payroll runs
  type It = { e: string; gross: number; add: number; deduct: number; ssoBase: number; sso: number; wht: number; net: number; snap: Record<string, unknown> };
  const mkRun = async (c: Any, periodKey: string, payDate: Date, status: string, engineVersion: number, items: It[], journal: string | null = status === "DRAFT" ? null : `qc39-jv-${tag}-${periodKey}`) => {
    const t = (f: keyof It) => items.reduce((a, i) => a + (i[f] as number), 0);
    const run = await P.hrPayrollRun.create({
      data: { tenantId: c.tenantId, systemId: c.systemId, periodKey, payDate, status, engineVersion, journalEntryId: journal, totalGrossSatang: t("gross"), totalAddSatang: t("add"), totalDeductSatang: t("deduct"), totalSsoEmployeeSatang: t("sso"), totalSsoEmployerSatang: t("sso"), totalWhtSatang: t("wht"), totalNetSatang: t("net") },
    });
    for (const i of items)
      await P.hrPayrollItem.create({ data: { tenantId: c.tenantId, systemId: c.systemId, runId: run.id, employeeId: i.e, grossSatang: i.gross, addSatang: i.add, deductSatang: i.deduct, ssoBaseSatang: i.ssoBase, ssoEmployeeSatang: i.sso, ssoEmployerSatang: i.sso, whtSatang: i.wht, netSatang: i.net, snapshotJson: i.snap } });
    return run.id as string;
  };
  const v1snap = (base: number, add: number, deduct: number, adj: [string, number][]) => ({ baseSalarySatang: base, addSatang: add, deductSatang: deduct, adjustments: adj.map(([kind, amountSatang]) => ({ kind, amountSatang, note: SECRET.note })), ssoEligible: true });
  const bkk = (day: string) => new Date(`${day}T12:00:00+07:00`);
  const RUN = {
    r9: await mkRun(cA, "2031-09", bkk("2031-09-30"), "APPROVED", 1, [
      { e: E.e1, gross: 1_518_750, add: 18_750, deduct: 0, ssoBase: 1_500_000, sso: 75_000, wht: 10_000, net: 1_433_750, snap: v1snap(1_500_000, 18_750, 0, [["OT", 18_750]]) },
      { e: E.e5, gross: 1_150_000, add: 0, deduct: 50_000, ssoBase: 1_200_000, sso: 60_000, wht: 0, net: 1_090_000, snap: v1snap(1_200_000, 0, 50_000, [["DEDUCTION", 50_000]]) },
    ]),
    r10: await mkRun(cA, "2031-10", new Date("2031-10-31T20:00:00Z"), "PAID", 2, [ // finalized: journalEntryId set (ruling Q5)
      { e: E.e1, gross: 1_566_750, add: 68_750, deduct: 2_000, ssoBase: 1_498_000, sso: 74_900, wht: 12_345, net: 1_479_505,
        snap: { engineVersion: 2, payType: "MONTHLY", whtIncomeSatang: 1_566_750, ssoWageSatang: 1_498_000, flags: [], lines: [
          { code: "BASE", ref: "profile", day: null, minutes: null, amountSatang: 1_500_000 }, { code: "UNPAID_LEAVE", ref: "employment", day: "2031-10-04", minutes: 240, amountSatang: -31_250 },
          { code: "HOLIDAY_WORK", ref: "employment", day: "2031-10-06", minutes: 60, amountSatang: 31_250 }, { code: "OT", ref: "adj1", day: null, minutes: null, amountSatang: 68_750 },
          { code: "LATE_RULE", ref: "adj2", day: null, minutes: null, amountSatang: -2_000, requestedSatang: 2_000 } ] } },
      { e: E.e3, gross: 1_000_000, add: 0, deduct: 0, ssoBase: 1_000_000, sso: 50_000, wht: 0, net: 950_000, snap: { engineVersion: 2, payType: "MONTHLY", whtIncomeSatang: 1_000_000, lines: [{ code: "BASE", ref: "profile", day: null, minutes: null, amountSatang: 1_000_000 }] } },
      { e: E.e4, gross: 840_000, add: 0, deduct: 0, ssoBase: 840_000, sso: 42_000, wht: 0, net: 798_000, snap: { engineVersion: 2, payType: "HOURLY", whtIncomeSatang: 840_000, lines: [{ code: "HOUR_WAGE", ref: "2031-10-15", day: "2031-10-15", minutes: 8400, amountSatang: 840_000 }] } },
    ]),
    r8: await mkRun(cA, "2031-08", bkk("2031-08-31"), "REVERSED", 1, [{ e: E.e1, gross: 9_999_900, add: 0, deduct: 0, ssoBase: 1_500_000, sso: 75_000, wht: 0, net: 9_924_900, snap: v1snap(9_999_900, 0, 0, []) }]),
    r11: await mkRun(cA, "2031-11", bkk("2031-11-30"), "DRAFT", 1, [{ e: E.e1, gross: 8_888_800, add: 0, deduct: 0, ssoBase: 1_500_000, sso: 75_000, wht: 0, net: 8_813_800, snap: v1snap(8_888_800, 0, 0, []) }]),
    r12: await mkRun(cA, "2030-12", bkk("2030-12-31"), "APPROVED", 1, [{ e: E.e1, gross: 1_400_000, add: 0, deduct: 0, ssoBase: 1_400_000, sso: 70_000, wht: 9_000, net: 1_321_000, snap: v1snap(1_400_000, 0, 0, []) }]),
  };
  // S3.0
  {
    const runs = (await P.hrPayrollRun.findMany({ where: { tenantId: TT }, include: { items: true } })) as Any[];
    const sums = runs.every((r) => r.items.reduce((a: number, i: Any) => a + i.netSatang, 0) === r.totalNetSatang && r.items.every((i: Any) => i.grossSatang - i.ssoEmployeeSatang - i.whtSatang === i.netSatang));
    const nDays = await P.hrAttendanceDay.count({ where: { tenantId: TT } });
    const nOt = await P.hrOtRequest.count({ where: { tenantId: TT } });
    ck("S3.0", { runs: runs.length === 5, sums, days: nDays === days.length, ot: nOt === 10, // ORACLE-EDIT ruling A: +2 revoked requests ◂
      emps: Object.values(E).every(Boolean) }, "fixture", `runs=${runs.length} days=${nDays} ot=${nOt} register=${HAS_REG ? "table" : "absent"}`);
  }
  const load = (v: Any, report: string, period = PERIOD[report]!, o: Record<string, unknown> = {}, c: Any = cA, opts: Any = {}) => S("loadReport", c, v, { report, period, ...o }, opts);
  const exp = (v: Any, report: string, format = "CSV", period = PERIOD[report]!, o: Record<string, unknown> = {}, c: Any = cA, opts: Any = {}) => S("exportReport", c, v, { report, period, format, ...o }, opts);
  const goldOk = async (id: string, v: Any, report: string, period: string, key: string, o: Record<string, unknown> = {}, money = true) => {
    const r = await load(v, report, period, o);
    const ok = r.ok && sameGold(report, r.value, GOLD[key], money);
    if (!ok) console.log(`     ${id} ${key}: got rows=${short(dtoArr(report, r.value, money), 260)} totals=${short(dtoTot(report, r.value, money), 160)} ${r.ok ? "" : r.text}`);
    return ok;
  };
  // S3.1
  {
    const r = await load(V.owner, "time");
    ck("S3.1", { golden: await goldOk("S3.1", V.owner, "time", "2031-10", "time|2031-10|owner"), note: (r.value?.notes ?? []).includes(T.timeNote), cols: canon((r.value?.columns ?? []).map((c: Any) => c.key)) === canon(keysOf("time")) }, "golden");
  }
  // S3.2
  {
    const r = await load(V.owner, "leave", "2031");
    const tb = await LEAVE.teamLeaveBalances(cA, V.owner, { year: 2031 });
    const fields = ["granted", "carried", "used", "adjusted", "expired", "balance", "pending"];
    const want: string[] = (tb?.rows ?? []).flatMap((row: Any) => (row.items ?? []).map((it: Any) => [row.employeeId, it.name, it.category, ...fields.map((f) => it[f]), it.unlimited ? "Y" : ""].join("|"))).sort();
    const got: string[] = (r.value?.rows ?? []).map((x: Any) => [x.employeeId, x.values?.policy, x.values?.category, ...fields.map((f) => x.values?.[f]), x.values?.unlimited].join("|")).sort();
    const e1 = dtoArr("leave", r.value).filter((row) => row[0] === "A01" && row[3] === "QC39 พักร้อน");
    const rows = (v: Any) => ((v?.rows ?? []) as Any[]).map((x) => [x.employeeId, x.values?.policy, ...fields.map((f) => x.values?.[f])].join("|")).sort();
    const pa = await load(V.payAll, "leave", "2031");
    const pb = await load(V.payBranch, "leave", "2031");
    const u1Emps = new Set([E.e1, E.e2, E.e5]);
    const wantB = ((r.value?.rows ?? []) as Any[]).filter((x) => u1Emps.has(x.employeeId)).map((x) => [x.employeeId, x.values?.policy, ...fields.map((f) => x.values?.[f])].join("|")).sort();
    ck("S3.2", {
      ok: r.ok,
      same: canon(got) === canon(want) && got.length > 0,
      e1: canon(e1) === canon([GOLD["leave|2031|e1P1"].row]),
      payAll: pa.ok && canon(rows(pa.value)) === canon(rows(r.value)),
      payBranch: pb.ok && wantB.length > 0 && canon(rows(pb.value)) === canon(wantB),
      noReason: ![r, pa, pb].some((x) => JSON.stringify(x.value ?? {}).includes(SECRET.reason)),
    }, "= teamLeaveBalances", `rows=${got.length}/${want.length} pa=${pa.ok ? pa.value?.rows?.length : pa.text} pb=${pb.ok ? pb.value?.rows?.length : pb.text}`);
  }
  // S3.3
  ck("S3.3", { golden: await goldOk("S3.3", V.owner, "ot", "2031-10", "ot|2031-10|owner") }, "golden");
  // S3.4
  ck("S3.4", {
    m10: await goldOk("S3.4", V.owner, "payroll-month", "2031-10", "payroll-month|2031-10|owner"),
    m09: await goldOk("S3.4", V.owner, "payroll-month", "2031-09", "payroll-month|2031-09|owner"),
    reversed: await goldOk("S3.4", V.owner, "payroll-month", "2031-08", "payroll-month|2031-08|owner"),
    draft: await goldOk("S3.4", V.owner, "payroll-month", "2031-11", "payroll-month|2031-11|owner"),
    year: await goldOk("S3.4", V.owner, "payroll-year", "2031", "payroll-year|2031|owner"),
  }, "goldens");
  // S3.5
  {
    const r = await load(V.owner, "tax-month", "2031-11");
    ck("S3.5", {
      m11: await goldOk("S3.5", V.owner, "tax-month", "2031-11", "tax-month|2031-11|owner"),
      m10: await goldOk("S3.5", V.owner, "tax-month", "2031-10", "tax-month|2031-10|owner"),
      m09: await goldOk("S3.5", V.owner, "tax-month", "2031-09", "tax-month|2031-09|owner"),
      y31: await goldOk("S3.5", V.owner, "tax-year", "2031", "tax-year|2031|owner"),
      y30: await goldOk("S3.5", V.owner, "tax-year", "2030", "tax-year|2030|owner"),
      note: (r.value?.notes ?? []).includes(T.taxNote),
    }, "goldens");
  }
  // S3.6
  {
    const r = await load(V.owner, "wages", "2031-10");
    ck("S3.6", { m10: await goldOk("S3.6", V.owner, "wages", "2031-10", "wages|2031-10|owner"), m09: await goldOk("S3.6", V.owner, "wages", "2031-09", "wages|2031-09|owner"), note: (r.value?.notes ?? []).includes(T.s114Note) }, "goldens");
  }
  // S3.7
  {
    const g = GOLD["register|2031-10-31|ownerExport"];
    const r = await load(V.owner, "register");
    const pageRows = (g.rows as string[][]).map((row, i) => [...row.slice(0, -1), g.pageIds[i]]);
    const e = await exp(V.owner, "register");
    const warn = (r.value?.warnings ?? []).map((w: Any) => [w.field, w.count]);
    const notes = r.value?.notes ?? [];
    ck("S3.7", {
      page: r.ok && canon(dtoArr("register", r.value)) === canon(pageRows) && r.value?.totals === null,
      export: e.ok && dec(e.value?.bytes) === csvTextOf(goldTable("register", maskedRegister())),
      warnings: canon(warn) === canon(g.warnings),
      notes: notes.includes(T.registerUnder10) && notes.includes(T.registerRetention) && notes.includes(T.registerMissing) && !notes.includes(T.registerDuty),
    }, "golden", `${r.ok ? "" : r.text} rows=${short(dtoArr("register", r.value), 200)}`);
  }
  // S3.8
  {
    const before = await P.auditLog.count({ where: { tenantId: TT, action: "hr.register.update" } });
    const w = (v: Any, input: Record<string, unknown>) => S("saveRegisterFields", cA, v, input);
    const okOwner = await w(V.owner, { employeeId: E.e3, nationality: "ลาว", otherBenefits: "ที่พัก" });
    const okAdmin = await w(V.hrAdmin, { employeeId: E.e2, nationality: "ไทย" });
    const adminBen = await w(V.hrAdmin, { employeeId: E.e2, otherBenefits: "x" });
    const outBranch = await w(V.hrAdmin, { employeeId: E.e3, nationality: "ไทย" });
    const member = await w(V.member, { employeeId: E.e2, nationality: "ไทย" });
    const other = await S("saveRegisterFields", cO, V.other, { employeeId: E.e2, nationality: "ไทย" });
    const long = await w(V.owner, { employeeId: E.e2, nationality: "ก".repeat(61) });
    const ctrl = await w(V.owner, { employeeId: E.e2, otherBenefits: "a\u0000b" });
    const ben501 = await w(V.owner, { employeeId: E.e2, otherBenefits: "ข".repeat(501) });
    const rows = HAS_REG ? ((await fx.rawRows(`SELECT "employeeId","nationality","otherBenefits" FROM "HrEmployeeRegister" WHERE "tenantId" = $1 ORDER BY "employeeId"`, TT)) ?? []) : [];
    const aud = (await P.auditLog.findMany({ where: { tenantId: TT, action: "hr.register.update" } })) as Any[];
    const audTxt = JSON.stringify(aud.map((a) => a.after));
    const lOwner = await S("loadRegisterFields", cA, V.owner, { employeeId: E.e3 });
    const lAdmin = await S("loadRegisterFields", cA, V.hrAdmin, { employeeId: E.e2 });
    const lMem = await S("loadRegisterFields", cA, V.member, { employeeId: E.e2 });
    const r = {
      owner: okOwner.ok && rows.some((x: Any) => x.employeeId === E.e3 && x.nationality === "ลาว" && x.otherBenefits === "ที่พัก"),
      admin: okAdmin.ok && rows.some((x: Any) => x.employeeId === E.e2 && x.nationality === "ไทย"),
      benefitsNeedPayroll: noOf(adminBen.value),
      outBranch: noOf(outBranch.value) && noOf(member.value) && noOf(other.value),
      limits: [long, ctrl, ben501].every((x) => x.value?.ok === false && x.text === T.registerInput),
      audit: aud.length - before === 2 && aud.every((a) => a.after && canon(Object.keys(a.after).sort()) === canon(["employeeId", "fields"])) && !/ลาว|ที่พัก|ไทย/.test(audTxt),
      load: srt(Object.keys(lOwner.value ?? {})) === srt(["ok", "nationality", "otherBenefits"]) && srt(Object.keys(lAdmin.value ?? {})) === srt(["ok", "nationality"]) && noOf(lMem.value),
    };
    ck("S3.8", r, "writer contract", `${okOwner.text} ${okAdmin.text}`);
    // restore e2/e3 for later register reads
    if (HAS_REG) await P.$executeRawUnsafe(`DELETE FROM "HrEmployeeRegister" WHERE "tenantId" = $1 AND "employeeId" IN ($2,$3)`, TT, E.e2, E.e3);
  }
  // S3.9
  {
    const t = await exp(V.owner, "time");
    const tx = await exp(V.owner, "time", "XLSX");
    const rg = await exp(V.owner, "register", "XLSX");
    const parse = (b: unknown) => {
      try {
        const p = b instanceof Uint8Array ? DORM.parseImportFile(b) : null;
        return p?.ok ? padRows([p.headers, ...p.rows]) : null;
      } catch {
        return null;
      }
    };
    const gt = goldTable("time", GOLD["time|2031-10|owner"]);
    const gr = goldTable("register", maskedRegister());
    ck("S3.9", {
      csv: t.ok && dec(t.value?.bytes) === csvTextOf(gt),
      xlsx: tx.ok && canon(parse(tx.value?.bytes)) === canon(padRows(gt)) && rg.ok && canon(parse(rg.value?.bytes)) === canon(padRows(gr)),
      names: t.value?.fileName === "HR_time_2031-10.csv" && tx.value?.fileName === "HR_time_2031-10.xlsx" && rg.value?.fileName === "HR_register_2031-10-31.xlsx",
      types: t.value?.contentType === "text/csv; charset=utf-8" && tx.value?.contentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      meta: t.value?.rowCount === 4 && canon(t.value?.columns) === canon(keysOf("time")),
    }, "bytes");
  }
  // S3.10 ORACLE-EDIT (builder H3.9 · controller rulings 13 Nov) ruling A: revoked OT never in approved · kept holiday-work minutes in their own column ◂
  {
    const o = await load(V.owner, "ot", "2031-10");
    const m = await load(V.mgr, "ot", "2031-10");
    const me = await exp(V.mgr, "ot");
    const row = (v: Any, e: string) => (((v?.rows ?? []) as Any[]).find((r) => r.employeeId === e)?.values ?? {}) as Record<string, string>;
    const a = row(o.value, E.e1);
    const b = row(m.value, E.e1);
    const mt = JSON.stringify(m.value ?? {}) + dec(me.value?.bytes);
    ck("S3.10", {
      approved: a.approved === "3" && a.approvedMin === "450" && a.otWorkdayMin === "120" && a.holidayWorkMin === "180" && a.otWorkdayAmt === "187.50",
      kept: a.keptHolidayWorkMin === "120" && a.keptHolidayWorkAmt === "150.00" && a.amount === "687.50",
      manager: m.ok && b.keptHolidayWorkMin === "120" && !("keptHolidayWorkAmt" in b) && !mt.includes("150.00") && !mt.includes("46.88"),
    }, "revoked excluded · kept own column", short(a, 200));
  }
  // S3.11 ORACLE-EDIT (builder H3.9 · controller rulings 13 Nov) ruling B: shop-wide "10 or more" note only for all-branch viewers ◂
  {
    const o = await load(V.owner, "register");
    const pa = await load(V.payAll, "register");
    const pb = await load(V.payBranch, "register");
    const n = (v: Any) => (v?.notes ?? []) as string[];
    const sig = (v: Any) => n(v).includes(T.registerDuty) || n(v).includes(T.registerUnder10);
    ck("S3.11", { owner: n(o.value).includes(T.registerUnder10), payAll: n(pa.value).includes(T.registerUnder10), branch: pb.ok && !sig(pb.value) && n(pb.value).includes(T.registerRetention) }, "all-branch only", short(n(pb.value), 120));
  }
  // S3.12 ORACLE-EDIT (builder H3.9 fix r1 · controller 13 Nov) F2e: register as of a date ◂
  {
    const r = await load(V.owner, "register", "2031-02-28");
    const row = (e: string) => ((r.value?.rows ?? []) as Any[]).find((x) => x.employeeId === e)?.values as Record<string, string> | undefined;
    const e5 = row(E.e5);
    const now = await load(V.owner, "register", "2031-10-31");
    const e5n = ((now.value?.rows ?? []) as Any[]).find((x) => x.employeeId === E.e5)?.values;
    // ORACLE-EDIT (builder H3.9 fix r2 · controller 13 Nov) ruling 3(b)(c): endDate is the last employed day (payroll-run-rules proration counts it) ⇒ on that day still working · ENDED with no endDate = ended ◂
    const last = await load(V.owner, "register", "2031-09-30");
    const e5l = ((last.value?.rows ?? []) as Any[]).find((x) => x.employeeId === E.e5)?.values;
    const eNoEnd = await fx.mkEmp(TT, sB, "QC39 จบไม่มีวัน", { code: "Z01", startDate: "2030-01-01", status: "ENDED", active: false });
    const nb = await load(V.owner, "register", "2031-10-31", {}, cB);
    const nbe = ((nb.value?.rows ?? []) as Any[]).find((x) => x.employeeId === eNoEnd)?.values;
    ck("S3.12", {
      ok: r.ok,
      notHired: !row(E.e2) && !!row(E.e1) && !!row(E.e3) && !!row(E.e4),
      e5: !!e5 && e5.endDate === "" && e5.status === "ทำงาน" && e5.age === "35",
      later: e5n?.endDate === "2031-09-30" && e5n?.status === "สิ้นสุด",
      lastDay: e5l?.endDate === "2031-09-30" && e5l?.status === "ทำงาน",
      endedNoDate: nbe?.status === "สิ้นสุด" && nbe?.endDate === "",
    }, "as of the date", `${short(e5, 120)} last=${short(e5l, 120)} noEnd=${short(nbe, 120)}`);
  }
  // ── S4 matrix ──
  const ALLOW: Record<string, string[]> = {
    owner: IDS, payAll: IDS, payBranch: IDS, // ruling Q1: payroll viewers see the leave report (branch-limited = own branches)
    mgr: ["time", "leave", "ot"], mgrAll: ["time", "leave", "ot"], leaveReader: ["leave"], hrAdmin: ["time", "ot"], self: [], member: [], other: [],
  };
  const MONEY = new Set(["owner", "payAll", "payBranch"]);
  const cells: { who: string; report: string; page: RO; csv: RO }[] = [];
  for (const who of Object.keys(ALLOW))
    for (const report of IDS) cells.push({ who, report, page: await load(V[who as keyof typeof V], report), csv: await exp(V[who as keyof typeof V], report) });
  // S4.1
  {
    const bad = cells.filter((c) => {
      const allowed = ALLOW[c.who]!.includes(c.report);
      return allowed ? !(c.page.ok && c.csv.ok) : !(noOf(c.page.value) && noOf(c.csv.value));
    }).map((c) => `${c.who}/${c.report}:${c.page.ok ? "ok" : "no"}${c.csv.ok ? "ok" : "no"}`);
    chk("S4.1", bad.length === 0, `${cells.length} cells as matrix`, bad.slice(0, 8).join(" ") || "ok");
  }
  // S4.2
  {
    const bad: string[] = [];
    for (const c of cells.filter((x) => ALLOW[x.who]!.includes(x.report))) {
      const money = MONEY.has(c.who);
      const keys = keysOf(c.report, money);
      const dk = canon((c.page.value?.columns ?? []).map((x: Any) => x.key));
      const rowKeys = (c.page.value?.rows ?? []).every((r: Any) => canon(Object.keys(r.values ?? {}).sort()) === canon([...keys].sort()) && srt(Object.keys(r).filter((k) => k !== "values")) === "employeeId");
      const head = parseCsv(dec(c.csv.value?.bytes))[0] ?? [];
      if (dk !== canon(keys) || !rowKeys || canon(head) !== canon(labelsOf(c.report, "th", money))) bad.push(`${c.who}/${c.report}`);
    }
    chk("S4.2", bad.length === 0, "keys = columnsFor", bad.slice(0, 8).join(" ") || "ok");
  }
  // S4.3
  {
    const runTotalNet = "32275.05";
    const pm = await load(V.payBranch, "payroll-month", "2031-10");
    const regB = await exp(V.payBranch, "register");
    const r = {
      time: await goldOk("S4.3", V.mgr, "time", "2031-10", "time|2031-10|branch"),
      payroll: sameGold("payroll-month", pm.value, GOLD["payroll-month|2031-10|branch"]) && pm.value?.totals?.net !== runTotalNet,
      tax: await goldOk("S4.3", V.payBranch, "tax-year", "2031", "tax-year|2031|branch"),
      ot: await goldOk("S4.3", V.mgr, "ot", "2031-10", "ot|2031-10|managerBranch", {}, false),
      unitIn: await goldOk("S4.3", V.owner, "time", "2031-10", "time|2031-10|u2", { unitId: u2 }),
      unitOut: (await load(V.mgr, "time", "2031-10", { unitId: u2 })).value?.rows?.length === 0,
      unknown: (await load(V.owner, "time", "2031-10", { unitId: "nope-unit" })).value?.rows?.length === 0,
      unassigned: !dtoArr("time", (await load(V.mgr, "time")).value).some((row) => row[1] === "QC39 ดี สี่") && !dtoArr("payroll-month", pm.value).some((row) => row[1] === "QC39 ดี สี่"),
      registerBranch: dec(regB.value?.bytes) === csvTextOf(goldTable("register", GOLD["register|2031-10-31|branchExport"])),
    };
    ck("S4.3", r, "visible rows only");
  }
  // S4.4 (setting OFF — default)
  const FULL_IDS = ["1101700203451", "3-1006-01234-56-7", "5000011111223", "3100601234567"];
  const hasFull = (t: string) => FULL_IDS.some((f) => t.includes(f));
  {
    const bad: string[] = [];
    for (const c of cells) {
      if (c.page.ok && hasFull(JSON.stringify(c.page.value))) bad.push(`${c.who}/${c.report}/page`);
      if (c.csv.ok && hasFull(dec(c.csv.value?.bytes))) bad.push(`${c.who}/${c.report}/csv`);
    }
    const xl = await exp(V.owner, "register", "XLSX");
    const xlTxt = (() => {
      try {
        const p = xl.value?.bytes instanceof Uint8Array ? DORM.parseImportFile(xl.value.bytes) : null;
        return JSON.stringify(p?.rows ?? []);
      } catch {
        return "";
      }
    })();
    ck("S4.4", { none: bad.length === 0, xlsx: xl.ok && xlTxt.includes("•••3451") && !hasFull(xlTxt) }, "masked everywhere", bad.join(" ") || "");
  }
  // S4.5
  {
    const money = ["187.50", "687.50", "93.75", "281.25", "781.25", "250.00", "150.00", "46.88"]; // ORACLE-EDIT (builder H3.9 · controller rulings 13 Nov) ruling A: kept / revoked ฿ ◂
    const bad: string[] = [];
    for (const c of cells.filter((x) => ["mgr", "mgrAll", "hrAdmin", "leaveReader"].includes(x.who) && ALLOW[x.who]!.includes(x.report))) {
      const ks = [...keysDeep(c.page.value)];
      if (ks.some((k) => /Satang$|Amt$|^amount$|^gross$|^net$|^wht$/.test(k))) bad.push(`${c.who}/${c.report}:key`);
      const txt = JSON.stringify(c.page.value) + dec(c.csv.value?.bytes);
      if (money.some((m) => txt.includes(m))) bad.push(`${c.who}/${c.report}:value`);
    }
    const refused = ["payroll-month", "payroll-year", "tax-month", "tax-year", "wages", "register"].every((r) => cells.filter((c) => c.report === r && ["mgr", "mgrAll", "hrAdmin", "leaveReader"].includes(c.who)).every((c) => noOf(c.page.value)));
    ck("S4.5", { clean: bad.length === 0, refused }, "no ฿ for managers", bad.join(" ") || "");
  }
  // S4.6
  {
    const FORB = new Set([...HR_FORBIDDEN_DTO_KEYS, "snapshotJson", "ytdJson", "lawRowIds", "lat", "lng", "photoKey", "deviceId", "attachmentKey", "offboardNote", "nationalId", "linkedUserId", "segmentsJson", "lines"]);
    const sec = Object.values(SECRET);
    const audits = JSON.stringify(await P.auditLog.findMany({ where: { tenantId: TT, action: { startsWith: "hr.report." } }, select: { after: true, before: true } }));
    const bad: string[] = [];
    for (const c of cells) {
      // ORACLE-EDIT (builder H3.9 · controller rulings 13 Nov) 1: payType is a catalog column of wages/register — allowed for money viewers in those reports only ◂
      // ORACLE-EDIT (builder H3.9 · ruling 1, same check): keys are scanned on served DTOs only — a refusal is the contract shape {ok:false, code, reason} (brief R7/S4.7) whose "reason" is the fixed text, not a leave/OT reason; secrets below still scan every cell ◂
      const k = c.page.ok ? [...keysDeep(c.page.value)].filter((x) => FORB.has(x) && !(MONEY.has(c.who) && keysOf(c.report).includes(x))) : [];
      if (k.length) bad.push(`${c.who}/${c.report}:${k.join(",")}`);
      const txt = JSON.stringify(c.page.value ?? {}) + dec(c.csv.value?.bytes);
      if (sec.some((s) => txt.includes(s))) bad.push(`${c.who}/${c.report}:secret`);
      // ORACLE-EDIT (builder H3.9 fix r1 · controller 13 Nov) F2c: a refusal carries exactly {ok, code, reason} — no data riding along ◂
      for (const [sf, x] of [["page", c.page], ["csv", c.csv]] as const) if (!x.ok && srt(Object.keys(x.value ?? {})) !== srt(["ok", "code", "reason"])) bad.push(`${c.who}/${c.report}/${sf}:refusalKeys`);
    }
    const capturedLeak = CAPTURED.some((l) => sec.some((s) => l.includes(s)));
    const seen = cells.filter((c) => c.page.ok && c.csv.ok).length;
    ck("S4.6", { seen: seen === 36, // ORACLE-EDIT (builder H3.9 · controller rulings 13 Nov) 2: the matrix has exactly 36 allowed cells (9+9+9+3+3+1+2) ◂
       dto: bad.length === 0, audit: !sec.some((s) => audits.includes(s)), console: !capturedLeak }, "no forbidden key / secret", `${bad.slice(0, 6).join(" ")} seen=${seen}`);
  }
  // S4.7
  {
    const a = await load(V.owner, "time", "2031-10", {}, { tenantId: TT, systemId: sO });
    const b = await load(V.owner, "time", "2031-10", {}, { tenantId: T2, systemId: sA });
    const d = await load(V.owner, "time", "2031-10", {}, { tenantId: TT, systemId: "nope" });
    const own = await load(V.other, "time", "2031-10", {}, cO);
    const empty = await load(V.owner, "payroll-month", "2031-10", {}, cB);
    const same = [a, b, d].every((x) => canon(x.value) === canon({ ok: false, code: "NO", reason: T.no }));
    ck("S4.7", { same, own: own.ok && own.value?.rows?.length === 0, empty: empty.ok && empty.value?.rows?.length === 0 }, "identical NO");
  }
  // S4.10 ORACLE-EDIT (builder H3.9 · controller rulings 13 Nov): membership gate on every entry point (non-member · role-claim mismatch) ◂
  {
    const cnt = async () => [await P.auditLog.count({ where: { tenantId: TT } }), HAS_REG ? Number((await fx.rawRows(`SELECT count(*)::int AS n FROM "HrEmployeeRegister" WHERE "tenantId" = $1 AND "nationality" = 'QC39X'`, TT))?.[0]?.n ?? -1) : 0];
    const before = await cnt();
    const intruders: Record<string, Any> = { other: V.other, claim: { ...V.member, role: "OWNER" } };
    const bad: string[] = [];
    for (const [who, v] of Object.entries(intruders)) {
      const calls: [string, RO][] = [
        ["load", await load(v, "time")],
        ["export", await exp(v, "register")],
        ["getSet", await S("getReportSettings", cA, v)],
        ["setSet", await S("setReportSettings", cA, v, { registerFullId: true, acknowledge: true })],
        ["loadReg", await S("loadRegisterFields", cA, v, { employeeId: E.e1 })],
        ["saveReg", await S("saveRegisterFields", cA, v, { employeeId: E.e1, nationality: "QC39X" })],
      ];
      for (const [nm, r] of calls) if (!noOf(r.value)) bad.push(`${who}/${nm}`);
      let st = 0;
      try {
        st = typeof RH?.reportExportGet === "function" ? ((await RH.reportExportGet(new Request("http://qc.invalid/x?report=time&period=2031-10&format=csv"), cA, v, {})) as Response).status : 0;
      } catch {
        st = -1;
      }
      if (st !== 404) bad.push(`${who}/route=${st}`);
    }
    // ORACLE-EDIT (builder H3.9 fix r1 · controller 13 Nov) F2c: forged permission / branch claims are ignored (DB membership wins) · register fields of another branch refused ◂
    const fBranch = { ...V.payBranch, unitAccess: ["*"] };
    const fPay = { ...V.mgr, permissions: { "hr.payroll.read": true } };
    const fb = await load(fBranch, "payroll-month", "2031-10");
    const fbX = await exp(fBranch, "register");
    const fp = await load(fPay, "payroll-month", "2031-10");
    const fpT = await load(fPay, "time", "2031-10");
    const forged = {
      branch: fb.ok && sameGold("payroll-month", fb.value, GOLD["payroll-month|2031-10|branch"]) && fbX.ok && dec(fbX.value?.bytes) === csvTextOf(goldTable("register", GOLD["register|2031-10-31|branchExport"])),
      pay: noOf(fp.value) && fpT.ok && !(fpT.value?.columns ?? []).some((c: Any) => /Amt$|^amount$/.test(c.key)) && canon(dtoArr("time", fpT.value)) === canon(GOLD["time|2031-10|branch"].rows),
      regOtherBranch: noOf((await S("loadRegisterFields", cA, V.hrAdmin, { employeeId: E.e3 })).value) && noOf((await S("loadRegisterFields", cA, V.payBranch, { employeeId: E.e3 })).value),
    };
    const after = await cnt();
    ck("S4.10", { refused: bad.length === 0, noWrite: canon(after.slice(1)) === canon(before.slice(1)) && Number(after[0]) - Number(before[0]) === 1, ...forged }, "NO everywhere · forged claims ignored", bad.join(" ") || "ok");
  }
  // S4.11 ORACLE-EDIT (builder H3.9 fix r1 · controller 13 Nov) F2c: XLSX of non-owner viewers ◂
  {
    const money = ["187.50", "687.50", "93.75", "281.25", "781.25", "250.00", "150.00", "46.88"];
    const bad: string[] = [];
    let n = 0;
    for (const who of ["payAll", "payBranch", "mgr", "mgrAll", "leaveReader", "hrAdmin"] as const)
      for (const report of ALLOW[who]!) {
        const x = await exp(V[who], report, "XLSX");
        let txt = "";
        try {
          const p = x.value?.bytes instanceof Uint8Array ? DORM.parseImportFile(x.value.bytes) : null;
          txt = p?.ok ? JSON.stringify([p.headers, ...p.rows]) : "";
        } catch {
          txt = "";
        }
        if (!x.ok || !txt) {
          bad.push(`${who}/${report}:parse`);
          continue;
        }
        n++;
        if (hasFull(txt) || Object.values(SECRET).some((sv) => txt.includes(sv))) bad.push(`${who}/${report}:leak`);
        if (!MONEY.has(who) && money.some((m) => txt.includes(m))) bad.push(`${who}/${report}:money`);
      }
    ck("S4.11", { all: bad.length === 0, n: n === 27 }, "xlsx clean", `${bad.join(" ") || "ok"} n=${n}`);
  }
  // S4.8 setting writer (ruling Q2)
  {
    const sysRow = await P.appSystem.findFirst({ where: { id: sA }, select: { settings: true } });
    await P.appSystem.update({ where: { id: sA }, data: { settings: { ...((sysRow?.settings as Any) ?? {}), qc39Keep: { a: 1 } } } });
    const before = await P.auditLog.count({ where: { tenantId: TT, action: "hr.report.setting" } });
    const g0 = await S("getReportSettings", cA, V.owner);
    const byPay = await S("setReportSettings", cA, V.payAll, { registerFullId: true, acknowledge: true });
    const byMgr = await S("setReportSettings", cA, V.mgrAll, { registerFullId: true, acknowledge: true });
    const noAck = await S("setReportSettings", cA, V.owner, { registerFullId: true });
    const on = await S("setReportSettings", cA, V.owner, { registerFullId: true, acknowledge: true });
    const g1 = await S("getReportSettings", cA, V.owner);
    const other = await S("setReportSettings", cO, V.other, { registerFullId: true, acknowledge: true });
    const gB = await S("getReportSettings", cB, V.owner);
    const after = await P.appSystem.findFirst({ where: { id: sA }, select: { settings: true } });
    const aud = (await P.auditLog.findMany({ where: { tenantId: TT, action: "hr.report.setting" } })) as Any[];
    const resave = await S("setReportSettings", cA, V.owner, { registerFullId: true }); // ORACLE-EDIT (builder H3.9 fix r1 · controller 13 Nov) F2d: re-saving while ON needs no new acknowledgement ◂
    ck("S4.8", {
      resave: resave.ok && resave.value?.registerFullId === true,
      defaultOff: g0.ok && g0.value?.registerFullId === false && typeof g0.value?.warning === "string" && g0.value.warning === T.fullIdWarning,
      ownerOnly: byPay.text === T.settingOwner && byMgr.text === T.settingOwner,
      ack: noAck.value?.ok === false && noAck.text === T.ackFullId,
      on: on.ok && g1.value?.registerFullId === true,
      scoped: other.ok && gB.ok && gB.value?.registerFullId === false,
      keep: (after?.settings as Any)?.qc39Keep?.a === 1,
      audit: aud.length - before === 1 && canon(aud.at(-1)?.after) === canon({ registerFullId: true }),
    }, "owner-only setting", `${byPay.text} | ${noAck.text}`);
  }
  // S4.9 setting ON
  {
    const a0 = await P.auditLog.count({ where: { tenantId: TT, action: "hr.report.export" } });
    const lastAudit = async () => ((await P.auditLog.findMany({ where: { tenantId: TT, action: "hr.report.export" }, orderBy: { createdAt: "desc" }, take: 1 })) as Any[])[0];
    const oR = await exp(V.owner, "register");
    const oA = await lastAudit();
    const pR = await exp(V.payAll, "register");
    const pA = await lastAudit();
    const bR = await exp(V.payBranch, "register");
    const bA = await lastAudit();
    const oT = await exp(V.owner, "tax-month");
    const pT = [await exp(V.payAll, "tax-month"), await exp(V.payAll, "tax-year", "CSV", "2031")]; // ORACLE-EDIT (builder H3.9 fix r1 · controller 13 Nov) F2c: full-ID ON never reaches tax exports ◂
    const oPage = await load(V.owner, "register");
    await S("setReportSettings", cA, V.owner, { registerFullId: false });
    const oOff = await exp(V.owner, "register");
    const offA = await lastAudit();
    const a1 = await P.auditLog.count({ where: { tenantId: TT, action: "hr.report.export" } });
    ck("S4.9", {
      owner: oR.ok && dec(oR.value?.bytes) === csvTextOf(goldTable("register", GOLD["register|2031-10-31|ownerExport"])) && oA?.after?.fullId === true,
      payAll: pR.ok && hasFull(dec(pR.value?.bytes)) && pA?.after?.fullId === true,
      branch: bR.ok && dec(bR.value?.bytes) === csvTextOf(goldTable("register", GOLD["register|2031-10-31|branchExport"])) && bA?.after?.fullId === false,
      tax: oT.ok && !hasFull(dec(oT.value?.bytes)) && pT.every((x) => x.ok && !hasFull(dec(x.value?.bytes)) && dec(x.value?.bytes).includes("•••3451")),
      page: oPage.ok && !hasFull(JSON.stringify(oPage.value)),
      off: oOff.ok && dec(oOff.value?.bytes) === csvTextOf(goldTable("register", maskedRegister())) && offA?.after?.fullId === false,
      audits: a1 - a0 === 7, // ORACLE-EDIT (builder H3.9 fix r1 · controller 13 Nov): +2 payAll tax exports ◂
    }, "full only owner/payAll register export", `audits=${a1 - a0}`);
  }
  // S5.1
  {
    const before = await P.auditLog.count({ where: { tenantId: TT, action: "hr.report.export" } });
    const ok = await exp(V.owner, "time", "CSV", "2031-10", { unitId: u1 });
    const mid = await P.auditLog.findMany({ where: { tenantId: TT, action: "hr.report.export" }, orderBy: { createdAt: "desc" }, take: 1 });
    await exp(V.member, "time");
    await exp(V.owner, "time", "PDF");
    const after = await P.auditLog.count({ where: { tenantId: TT, action: "hr.report.export" } });
    const a = mid[0] as Any;
    const all = JSON.stringify(await P.auditLog.findMany({ where: { tenantId: TT, action: "hr.report.export" }, select: { after: true } }));
    const r = {
      one: ok.ok && after - before === 1,
      shape: a?.targetType === "HrReport" && a?.targetId === "time" && a?.actorId === U.owner.id && srt(Object.keys(a?.after ?? {})) === srt(["report", "period", "format", "rowCount", "columns", "unitId", "fullId"]) && a?.after?.fullId === false,
      values: a?.after?.report === "time" && a?.after?.period === "2031-10" && a?.after?.format === "CSV" && a?.after?.rowCount === 2 && canon(a?.after?.columns) === canon(keysOf("time")) && a?.after?.unitId === u1,
      noValues: !/QC39 |1101700203451|15000\.00|เชียงใหม่/.test(all),
    };
    ck("S5.1", r, "1 audit · shape", `delta=${after - before}`);
  }
  // S5.2
  {
    const url = (q: string) => `http://qc.invalid/app/sys/${sA}/hr/reports/export?${q}`;
    const get = async (q: string, v: Any, h: Record<string, string> = {}) => {
      if (typeof RH?.reportExportGet !== "function") return null;
      try {
        return (await RH.reportExportGet(new Request(url(q), { headers: h }), cA, v, {})) as Response;
      } catch {
        return null;
      }
    };
    const a0 = await P.auditLog.count({ where: { tenantId: TT, action: "hr.report.export" } });
    const rsc = await get("report=time&period=2031-10&format=csv", V.owner, { rsc: "1" });
    const pre = await get("report=time&period=2031-10&format=csv", V.owner, { "next-router-prefetch": "1" });
    const a1 = await P.auditLog.count({ where: { tenantId: TT, action: "hr.report.export" } });
    const ok = await get("report=time&period=2031-10&format=csv", V.owner);
    const okX = await get("report=register&period=2031-10-31&format=xlsx", V.owner);
    const no = await get("report=time&period=2031-10&format=csv", V.member);
    const bad = await get("report=time&period=2031-13&format=csv", V.owner);
    const okTxt = ok ? Buffer.from(await ok.arrayBuffer()).toString("utf8") : "";
    const noTxt = no ? await no.text() : "";
    const badTxt = bad ? await bad.text() : "";
    const r = {
      router: rsc?.status === 204 && pre?.status === 204 && a1 === a0,
      ok: ok?.status === 200 && okTxt === csvTextOf(goldTable("time", GOLD["time|2031-10|owner"])) && ok.headers.get("content-disposition") === 'attachment; filename="HR_time_2031-10.csv"' && ok.headers.get("cache-control") === "no-store" && ok.headers.get("x-content-type-options") === "nosniff",
      xlsx: okX?.status === 200 && okX.headers.get("content-type") === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      no: no?.status === 404 && noTxt === T.no,
      input: bad?.status === 400 && badTxt === T.input,
    };
    ck("S5.2", r, "route contract", `status=${rsc?.status}/${ok?.status}/${no?.status}/${bad?.status}`);
  }
  // S5.5 ORACLE-EDIT (builder H3.9 fix r1 · controller 13 Nov) F2a HEAD/POST · F2b injected source cap ⇒ LIMIT ◂
  {
    const a0 = await P.auditLog.count({ where: { tenantId: TT } });
    const DLM = (await import("@/lib/modules/hr/bank-files/download-route")) as Any;
    const call = async (fn: () => Promise<Response>) => {
      try {
        return (await fn()).status;
      } catch {
        return -1;
      }
    };
    const head = await call(() => RH.reportExportGet(new Request("http://qc.invalid/x?report=time&period=2031-10&format=csv", { method: "HEAD" }), cA, V.owner, {}));
    const post = await call(() => RH.reportExportGet(new Request("http://qc.invalid/x?report=time&period=2031-10&format=csv", { method: "POST" }), cA, V.owner, {}));
    const bank = await call(() => DLM.bankFileGet(new Request("http://qc.invalid/x", { method: "HEAD" }), cA, V.owner, "nosuchfile0000", {}));
    const capped = (report: string, period: string, cap: number) => S("loadReport", cA, V.owner, { report, period }, { __takeCap: cap });
    const lim = [
      await capped("time", "2031-10", 3), await capped("ot", "2031-10", 2), await capped("payroll-year", "2031", 2), await capped("tax-year", "2031", 2), await capped("wages", "2031-10", 1),
      await S("exportReport", cA, V.owner, { report: "time", period: "2031-10", format: "CSV" }, { __takeCap: 3 }),
    ];
    const corr = await capped("time", "2031-10", 1);
    const big = await capped("time", "2031-10", 100_000);
    const a1 = await P.auditLog.count({ where: { tenantId: TT } });
    ck("S5.5", {
      head: head === 405 && post === 405 && bank === 405,
      limit: lim.every((x) => x.value?.ok === false && x.value?.code === "LIMIT" && x.text === T.limit) && corr.value?.code === "LIMIT",
      notCapped: big.ok && sameGold("time", big.value, GOLD["time|2031-10|owner"]),
      noAudit: a1 === a0,
    }, "405 · LIMIT not truncation", lim.map((x) => (x.ok ? "ok" : x.value?.code)).join(","));
  }
  // S5.3
  {
    const before = await P.auditLog.count({ where: { tenantId: TT } });
    const tries = [
      await load(V.owner, "nope", "2031-10"), await load(V.owner, "time", "2031-13"), await load(V.owner, "time", "2031"), await load(V.owner, "register", "2031-02-30"),
      await exp(V.owner, "time", "PDF"), await exp(V.owner, "time", "CSV", "1999-12"), await load(V.owner, "time", "2031-10", { unitId: 42 }),
    ];
    const after = await P.auditLog.count({ where: { tenantId: TT } });
    ck("S5.3", { refused: tries.every((t) => t.value?.ok === false && t.value?.code === "INPUT" && t.text === T.input), noAudit: after === before }, "INPUT ×7", tries.map((t) => (t.ok ? "ok" : t.value?.code ?? t.text.slice(0, 12))).join(","));
  }
  // S5.4
  {
    await P.hrEmployee.update({ where: { id: E.e3 }, data: { position: "+SUM(A1)" } });
    const f = await exp(V.owner, "register");
    const page = await load(V.owner, "register");
    await P.hrEmployee.update({ where: { id: E.e3 }, data: { position: null } });
    if (HAS_REG) await P.$executeRawUnsafe(`UPDATE "HrEmployeeRegister" SET "nationality" = $1 WHERE "employeeId" = $2`, "ไทย\u0007", E.e4);
    const g = await exp(V.owner, "register");
    if (HAS_REG) await P.$executeRawUnsafe(`UPDATE "HrEmployeeRegister" SET "nationality" = $1 WHERE "employeeId" = $2`, "ไทย", E.e4);
    ck("S5.4", {
      formula: f.value?.ok === false && f.value?.code === "FORMULA" && f.text === T.formula.replace("{names}", "QC39 ซี สาม"),
      page: page.ok,
      encoding: g.value?.ok === false && g.value?.code === "ENCODING" && g.text === T.encoding.replace("{names}", "QC39 ดี สี่"),
    }, "guard", `${f.text} | ${g.text}`);
  }
  // ── S6 performance (system sP · 300 employees) ──
  {
    const N = 300;
    const ids = Array.from({ length: N }, (_, i) => `qc39p${tag}${String(i).padStart(3, "0")}`);
    await P.hrEmployee.createMany({ data: ids.map((id, i) => ({ id, tenantId: TT, systemId: sP, name: `QC39P ${String(i).padStart(3, "0")}`, code: `P${String(i).padStart(3, "0")}`, unitId: i % 2 ? u1 : u2, startDate: d0("2031-01-01"), gender: "MALE" })) });
    const rows: Any[] = [];
    for (const id of ids)
      for (let d = 1; d <= 31; d++) rows.push({ tenantId: TT, systemId: sP, employeeId: id, date: d0(`2032-01-${String(d).padStart(2, "0")}`), slotKey: "s1", status: d % 7 === 0 ? "LATE" : "ON_TIME", lateMin: d % 7 === 0 ? 3 : 0, workedMin: 480, startMin: 420, endMin: 900, judgedAt: new Date("2032-02-01T00:00:00Z") });
    for (let i = 0; i < rows.length; i += 2000) await P.hrAttendanceDay.createMany({ data: rows.slice(i, i + 2000) });
    for (let m = 1; m <= 12; m++) {
      const pk = `2032-${String(m).padStart(2, "0")}`;
      const run = await P.hrPayrollRun.create({ data: { tenantId: TT, systemId: sP, periodKey: pk, payDate: new Date(`${pk}-25T12:00:00+07:00`), status: "APPROVED", engineVersion: 1, totalGrossSatang: N * 1_000_000, totalNetSatang: N * 950_000, totalSsoEmployeeSatang: N * 50_000, totalSsoEmployerSatang: N * 50_000 } });
      await P.hrPayrollItem.createMany({ data: ids.map((e) => ({ tenantId: TT, systemId: sP, runId: run.id, employeeId: e, grossSatang: 1_000_000, ssoBaseSatang: 1_000_000, ssoEmployeeSatang: 50_000, ssoEmployerSatang: 50_000, whtSatang: 0, netSatang: 950_000, snapshotJson: { baseSalarySatang: 1_000_000, addSatang: 0 } })) });
    }
    const measure = async (fn: () => Promise<RO>) => {
      const q0 = QUERY_COUNTER.n;
      const t0 = Date.now();
      const r = await fn();
      return { r, q: QUERY_COUNTER.n - q0, ms: Date.now() - t0 };
    };
    const tm = await measure(() => load(V.owner, "time", "2032-01", {}, cP));
    const lateDays = 4; // d = 7, 14, 21, 28
    ck("S6.1", { ok: tm.r.ok && tm.r.value?.rows?.length === N, q: tm.q <= 12, ms: tm.ms <= 5000, totals: tm.r.value?.totals?.workedMin === String(N * 31 * 480) && tm.r.value?.totals?.lateMin === String(N * lateDays * 3) }, "≤12 q · ≤5 s", `q=${tm.q} ms=${tm.ms}`);
    const ty = await measure(() => load(V.owner, "tax-year", "2032", {}, cP));
    const py = await measure(() => load(V.owner, "payroll-year", "2032", {}, cP));
    ck("S6.2", {
      tax: ty.r.ok && ty.r.value?.rows?.length === N && ty.q <= 12 && ty.ms <= 5000 && ty.r.value?.totals?.income === bahtOwn(N * 12 * 1_000_000),
      pay: py.r.ok && py.r.value?.rows?.length === N && py.q <= 12 && py.ms <= 5000 && py.r.value?.totals?.net === bahtOwn(N * 12 * 950_000),
    }, "≤12 q · ≤5 s", `tax q=${ty.q} ms=${ty.ms} · pay q=${py.q} ms=${py.ms}`);
    const rg = await measure(() => load(V.owner, "register", "2032-01-31", {}, cP));
    const ex = await measure(() => exp(V.owner, "time", "CSV", "2032-01", {}, cP));
    ck("S6.3", { reg: rg.r.ok && rg.r.value?.rows?.length === N && rg.q <= 12 && rg.ms <= 5000, exp: ex.r.ok && ex.r.value?.rowCount === N && ex.q <= 12 && ex.ms <= 5000 }, "≤12 q · ≤5 s", `reg q=${rg.q} ms=${rg.ms} · csv q=${ex.q} ms=${ex.ms}`);
  }
  // ── S7 v2 (needs H3.4) ──
  {
    if (!HAS_H34 || typeof RUN2?.computeRunItemV2 !== "function") chk("S7.1", false, "H3.4 present", `n/a — H3.4 absent (${F.runRules})`);
    else {
      const law = {
        SSO: { id: "qc39-sso", json: { rateBp: 500, minBaseSatang: 165000, maxBaseSatang: 1750000, rounding: "BAHT_HALF_UP", employerEqualsEmployee: true } },
        TAX_BRACKET: { id: "qc39-tax", json: { bands: [[15000000, 0], [30000000, 500], [50000000, 1000], [75000000, 1500], [100000000, 2000], [200000000, 2500], [500000000, 3000], [null, 3500]].map(([u, r]) => ({ upToSatang: u, rateBp: r })), rounding: "SATANG_HALF_UP_ONCE" } },
        DEDUCTION: { id: "qc39-ded", json: { expenseRateBp: 5000, expenseCapSatang: 10000000, personalSatang: 6000000, spouseSatang: 6000000, childSatang: 3000000, ssoAllowanceCapSatang: 900000 } },
      };
      const input = { employeeId: E.e2, payType: "MONTHLY", baseSalarySatang: 3_000_000, dailyRateSatang: null, hourlyRateSatang: null, ssoEligible: true, deductions: {}, periodKey: "2031-12", startDate: "2031-03-01", endDate: null, normalDayMin: 480, catCapBp: 1000, totalCapBp: 2000, monthIndex: 12, prior: { incomeSatang: 0, whtSatang: 0, ssoSatang: 0 },
        days: [{ workDayId: "qc39-wd", day: "2031-12-05", dayClass: "HOLIDAY", holidayKind: "PUBLIC", workMin: 0, paidLeaveMin: 0, unpaidLeaveMin: 0, holidayWorkMin: 120, holidayPaidMin: 480, unplannedMin: 0, review: [], otHolidayWorkMin: 0 }],
        adjustments: [{ id: "qc39-adj-ot", kind: "OT", sourceType: null, amountSatang: 25_000 }] };
      let out: Any = null;
      try {
        out = RUN2.computeRunItemV2(input, law);
      } catch (e) {
        out = { ok: false, code: errText(e) };
      }
      if (!out || out.ok === false) chk("S7.1", false, "vector computes", `computeRunItemV2 ${short(out, 120)}`);
      else {
        // ORACLE-EDIT (builder H3.9 · controller rulings 13 Nov) 3: finalized (journalEntryId) — ruling Q5 excludes unfinalized v2 runs (S7.3 keeps "neither ⇒ excluded") ◂
        const run = await P.hrPayrollRun.create({ data: { tenantId: TT, systemId: sA, periodKey: "2031-12", payDate: new Date("2031-12-28T12:00:00+07:00"), status: "APPROVED", engineVersion: 2, journalEntryId: `qc39-jv-s71-${tag}`, totalGrossSatang: out.grossSatang, totalNetSatang: out.netSatang } });
        await P.hrPayrollItem.create({ data: { tenantId: TT, systemId: sA, runId: run.id, employeeId: E.e2, grossSatang: out.grossSatang, addSatang: out.addSatang, deductSatang: out.deductSatang, ssoBaseSatang: out.ssoBaseSatang, ssoEmployeeSatang: out.ssoEmployeeSatang, ssoEmployerSatang: out.ssoEmployerSatang, whtSatang: out.whtSatang, netSatang: out.netSatang,
          snapshotJson: { engineVersion: 2, payType: "MONTHLY", normalDayMin: 480, lines: out.lines, flags: out.flags, carry: out.carry, receivable: out.receivable, availableSatang: out.availableSatang, whtIncomeSatang: out.whtIncomeSatang, ssoWageSatang: out.ssoWageSatang } } });
        const sumC = (codes: string[]) => (out.lines as Any[]).filter((l) => codes.includes(l.code)).reduce((a, l) => a + l.amountSatang, 0);
        const pm = await load(V.owner, "payroll-month", "2031-12");
        const tm = await load(V.owner, "tax-month", "2031-12");
        const wg = await load(V.owner, "wages", "2031-12");
        const row = (v: Any) => (v?.rows ?? []).find((r: Any) => r.employeeId === E.e2)?.values ?? {};
        const p = row(pm.value);
        const t = row(tm.value);
        const w = row(wg.value);
        const r = {
          payroll: p.gross === bahtOwn(out.grossSatang) && p.net === bahtOwn(out.netSatang) && p.wht === bahtOwn(out.whtSatang) && p.ssoEmployee === bahtOwn(out.ssoEmployeeSatang) && p.engine === "2",
          tax: t.income === bahtOwn(out.whtIncomeSatang) && t.ssoBase === bahtOwn(out.ssoBaseSatang),
          wages: w.wage === bahtOwn(sumC(VEC.wageCodesV2)) && w.ot === bahtOwn(sumC(["OT"])) && w.holidayWork === bahtOwn(sumC(["HOLIDAY_WORK"])) && w.rate === bahtOwn(sumC(["BASE"])),
        };
        ck("S7.1", r, "reads stored v2", `p=${short(p, 120)} w=${short(w, 120)}`);
      }
    }
    if (!HAS_H34) chk("S7.2", false, "H3.4 present", `n/a — H3.4 absent (${F.runRules})`);
    else {
      const pay = code(F.payroll);
      const svc = code(F.svc);
      ck("S7.2", {
        writer: /whtIncomeSatang/.test(pay) && /\blines\b/.test(pay) && /payType/.test(pay) && /engineVersion:\s*2/.test(pay),
        reader: /whtIncomeSatang/.test(code(F.rules) + svc) && /\blines\b/.test(code(F.rules) + svc),
        noImport: ![F.rules, F.svc].some((f) => importsOf(rd(f)).some((i) => !i.type && /payroll-run-rules|payroll-rules(-v2)?$|\/payroll$/.test(i.spec))),
      }, "seam");
    }
  }
  // S7.3 ruling Q5 — v2 runs count only when finalized (needs H3.4 stepsJson)
  {
    const cols = await fx.rawRows(`SELECT column_name FROM information_schema.columns WHERE table_name = 'HrPayrollRun' AND column_name = 'stepsJson'`);
    if (!HAS_H34 || !cols?.length) chk("S7.3", false, "H3.4 present", `n/a — H3.4 absent (${F.runRules}${cols?.length ? "" : " · no stepsJson column"})`);
    else {
      const mkV2 = async (pk: string, payDay: string, journal: string | null, finalized: boolean | null, net: number) => {
        const run = await P.hrPayrollRun.create({ data: { tenantId: TT, systemId: sB, periodKey: pk, payDate: new Date(`${payDay}T12:00:00+07:00`), status: "APPROVED", engineVersion: 2, journalEntryId: journal, totalGrossSatang: net, totalNetSatang: net } });
        if (finalized !== null) await P.$executeRawUnsafe(`UPDATE "HrPayrollRun" SET "stepsJson" = $1::jsonb WHERE "id" = $2`, JSON.stringify({ finalized }), run.id);
        const e = await fx.mkEmp(TT, sB, `QC39 V2 ${pk}`, { code: `V${pk.slice(5)}` });
        await P.hrPayrollItem.create({ data: { tenantId: TT, systemId: sB, runId: run.id, employeeId: e, grossSatang: net, ssoBaseSatang: 0, ssoEmployeeSatang: 0, ssoEmployerSatang: 0, whtSatang: 0, netSatang: net, snapshotJson: { engineVersion: 2, payType: "MONTHLY", whtIncomeSatang: net, lines: [{ code: "BASE", amountSatang: net }] } } });
      };
      await mkV2("2033-01", "2033-01-31", null, true, 100_000); // flag only ⇒ counts
      await mkV2("2033-02", "2033-02-28", "qc39-jv-v2", null, 200_000); // journal only ⇒ counts
      await mkV2("2033-03", "2033-03-31", null, null, 300_000); // neither ⇒ excluded
      await mkV2("2033-04", "2033-04-30", null, false, 400_000); // flag false ⇒ excluded
      const v1 = await P.hrPayrollRun.create({ data: { tenantId: TT, systemId: sB, periodKey: "2033-05", payDate: new Date("2033-05-31T12:00:00+07:00"), status: "APPROVED", engineVersion: 1, journalEntryId: null, totalGrossSatang: 500_000, totalNetSatang: 500_000 } });
      const e5v1 = await fx.mkEmp(TT, sB, "QC39 V1 2033-05", { code: "V05" });
      await P.hrPayrollItem.create({ data: { tenantId: TT, systemId: sB, runId: v1.id, employeeId: e5v1, grossSatang: 500_000, ssoBaseSatang: 0, ssoEmployeeSatang: 0, ssoEmployerSatang: 0, whtSatang: 0, netSatang: 500_000, snapshotJson: { baseSalarySatang: 500_000, addSatang: 0 } } });
      const py = await load(V.owner, "payroll-year", "2033", {}, cB);
      const ty = await load(V.owner, "tax-year", "2033", {}, cB);
      const w3 = await load(V.owner, "wages", "2033-03", {}, cB);
      ck("S7.3", {
        payroll: py.ok && py.value?.rows?.length === 3 && py.value?.totals?.net === bahtOwn(800_000),
        tax: ty.ok && ty.value?.totals?.income === bahtOwn(800_000),
        wages: w3.ok && w3.value?.rows?.length === 0,
      }, "finalized v2 + all v1", `py=${py.value?.totals?.net} ty=${ty.value?.totals?.income}`);
    }
  }
  // S4.12 ORACLE-EDIT (builder H3.9 fix r2 · controller 13 Nov) ruling 4 (replaces the timing race): deterministic lost-update check — a raw transaction holds hr:clockpolicy:<sys> (the key
  //   every clock-policy writer incl. the judge cursor takes), reads settings, then setReportSettings(OFF) starts and must BLOCK; the raw transaction writes the
  //   stale settings + another key and commits; afterwards OFF and the other key must both be there. Judge-cursor part dropped (cannot be made deterministic
  //   without a hook in frozen judge.ts — the raw transaction is the same lock + read-modify-write protocol). ◂
  {
    const T3 = await fx.newTenant("-race", "QC HR H3.9 race");
    const sR = await sys("ทีม race", T3);
    const cR = { tenantId: T3, systemId: sR };
    const oR = vOf(await fx.mkUser(T3, "race-owner", `QC39 race owner ${tag}`, "OWNER", [], {}));
    const sl = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const st = async () => ((await P.appSystem.findFirst({ where: { id: sR }, select: { settings: true } }))?.settings ?? {}) as Any;
    const out: string[] = [];
    let ok = true;
    for (let k = 0; k < 3; k++) {
      await S("setReportSettings", cR, oR, { registerFullId: true, acknowledge: true });
      let settled = false;
      let call: Promise<RO> | null = null;
      let blocked = false;
      try {
        await P.$transaction(async (tx: Any) => {
          await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, `hr:clockpolicy:${sR}`);
          const rows = (await tx.$queryRawUnsafe(`SELECT "settings" FROM "AppSystem" WHERE "id" = $1`, sR)) as Any[];
          const stale = (rows[0]?.settings ?? {}) as Any;
          call = S("setReportSettings", cR, oR, { registerFullId: false }).then((x) => ((settled = true), x));
          await sl(400);
          blocked = !settled;
          await tx.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = $1::jsonb WHERE "id" = $2`, JSON.stringify({ ...stale, qc39Other: k }), sR);
        }, { timeout: 20_000, maxWait: 10_000 });
      } catch (e) {
        out.push(`tx:${errText(e).slice(0, 60)}`);
      }
      const r = call ? await (call as Promise<RO>) : null;
      const s1 = await st();
      const round = !!r?.ok && blocked && s1?.hrReports?.registerFullId === false && s1?.qc39Other === k;
      if (!round) ok = false;
      out.push(`r${k}:blocked=${blocked} off=${s1?.hrReports?.registerFullId === false} other=${s1?.qc39Other === k}`);
    }
    ck("S4.12", { deterministic: ok }, "setting write waits for the clock-policy lock · no lost update", out.join(" "));
  }
}

let crashed = "";
try {
  runStatic();
  runFixtureControl();
  runPure(R);
  const fz = await fitnessNoEnv();
  chk("X12.1", fz.ok, "exit 0 ×2", fz.note);
  await runDb();
} catch (e) {
  crashed = errText(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  for (const tid of fx.tenants) for (const t of MINE) if (await tableExists(t)) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid).catch(() => null);
  for (const tid of fx.tenants) {
    for (const m of ["hrAttendanceDay", "hrTimeCorrection", "hrOtRequest", "hrLeaveBalanceTxn"]) await (P as Any)[m].deleteMany({ where: { tenantId: tid } }).catch(() => null);
    await P.hrLeave.deleteMany({ where: { tenantId: tid } }).catch(() => null);
    await P.hrLeavePolicy.deleteMany({ where: { tenantId: tid } }).catch(() => null);
  }
  await cleanupFx(P, fx, SLUG);
  const left = await residueOf(P, fx, SLUG, SLUG_PREFIX);
  for (const tid of fx.tenants)
    for (const t of MINE) {
      if (!(await tableExists(t))) continue;
      const r = await fx.rawRows(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid);
      if (!r || Number(r[0]?.n) !== 0) left.push(`${t}=${r?.[0]?.n ?? "?"}`);
    }
  chk("Z1", left.length === 0, "none", left.join() || "clean");
}
process.exit(finish({ forced: FORCE, crashed, missing: skipReasons }));
