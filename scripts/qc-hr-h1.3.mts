// QC — HR V2 · H1.3 — money and law model: HrLawTable (4 DRAFT rows from today's frozen constants) · HrWorkEntry · HrPayrollRun +7
//      engine/accounting/maker-checker/file columns · HrPayrollItem + ytdJson/lawRowIds · HrPayAdjustment + sourceType/sourceRef (partial
//      unique beside crmCommissionId) · HrReviewNote · HrOnboardingTask · scripts/hr-seed-law-draft.mts
// ⚠️ Oracle under change control (controller owns it) — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// requires: nothing seeded for the main groups — own throwaway tenants `qc-hr-h1.3-<stamp>` (main: HR systems sH · sH2 · sM (S5 MONTHLY) ·
//   sR (S5.8 reverse/converge) + ACCOUNT + CRM) and `-other` (HR only: S3.3 / X2.1 other tenant · X8.1 no-ACCOUNT · S6.4 other viewer),
//   law rows under the key prefix `qc-h1.3-<stamp>*` (global table) — all swept in `finally` · S7.* READ (never write) the seeded
//   `qc-hr-v2` tenant and the global `v1:*` law rows
//
// Contract (ledger/hr-briefs/hr-brief-H1.3.md §2 R1–R10 · §3 · §9 rulings Q1–Q16 of 22 Oct · base session/hr 13a0601b = H0.7 + H1.1 merged,
//   H1.2 NOT merged — H1.3 builds on the H1.2 merge commit; every H1.2 reference here is probed by table name and is RED "not built" today):
//   R1 migration 20261206000000_hr_money_law_model (additive, one tx) · 6 CREATE TYPE: HrLawKind {SSO,TAX_BRACKET,DEDUCTION,OT,MIN_WAGE} ·
//      HrLawStatus {DRAFT,ACTIVE,RETIRED} · HrWorkEntryKind (10, Q9) · HrPaySource (7, Q5) · HrReviewNoteKind (4) · HrOnboardingKind (2)
//      HrLawTable = ONE SHARK-global table (Q1: no tenantId/systemId · core/scope.ts g("…") axis global) · HrWorkEntry · HrReviewNote ·
//      HrOnboardingTask (sys()) · HrPayrollRun +engineVersion INT NOT NULL DEFAULT 1 (+6 nullable) · HrPayrollItem +ytdJson +lawRowIds ·
//      HrPayAdjustment +sourceType +sourceRef (nullable, no default — Q2) · raw partial uniques / CHECKs (S1.6)
//   R2 no backfill · reader rule `sourceType ?? (crmCommissionId ? CRM_COMMISSION : MANUAL)` documented in a schema comment
//   R3 scripts/hr-seed-law-draft.mts — see ORACLE CONTRACT below · R4 crmCommissionId + its index untouched; CHECK forbids both links ·
//   R5 no engine change (payroll-rules.ts · payroll.ts · crm/commissions.ts · outbox-consumers.ts · account/** byte-identical vs base) ·
//   R6 privacy (F16.1 += ytdJson/filingJson/bankFileKey — Q12) · R7 no UI/events/permission keys · R8 registrations · R9 seed/expected
//   (all new tables / columns are read and written here through $queryRaw / $executeRaw only — the base Prisma client does not know them;
//    X2.2 / S7.5 use the generated delegates hrWorkEntry / hrReviewNote / hrOnboardingTask after the builder's `prisma generate`)
//
// ORACLE CONTRACT (the brief names no exact signature — fixed here; builder asks for an ORACLE-EDIT if it must differ):
//   hr-seed-law-draft.mts  CLI: `pnpm exec tsx scripts/hr-seed-law-draft.mts [--apply] [--key-prefix <p>]` (default prefix "v1") ·
//       sourceKey = `${prefix}:${kind}` · dry-run (default) writes nothing and prints the 4 rows + the digest (64 hex) · --apply prints
//       `created <n> · unchanged <n> · mismatched <n>` · tampered existing row ⇒ exit 1, a Thai sentence, nothing written (no row created)
//     exports (importing the module must NOT run main — guard on argv[1]; the oracle imports it in a child process):
//       LAW_V1_ROWS: { kind, effectiveFrom, json }[] in the order SSO, TAX_BRACKET, DEDUCTION, OT (effectiveFrom "1970-01-01" or a Date of it)
//       LAW_V1_DIGEST: string = sha256(utf8 JSON.stringify(canon(LAW_V1_ROWS.map(r => [r.kind, "YYYY-MM-DD", r.json])))) where canon sorts
//         object keys recursively (arrays keep order) and ∞ is null — value frozen below (FROZEN_LAW_DIGEST, CONTROLLER rules it)
//       verifyAgainstFrozen(): returns true or { ok: true, … } (sync or async) · false / { ok: false } / throw = fail
//   json shapes = brief R3 verbatim (integers only — satang + basis points).
//
// Groups: S1 migration/schema · S2 law seed = frozen constants · S3 source idempotency + CRM coexistence · S4 work entry / onboarding ·
//         S5 frozen digests + freezes · S6 privacy / no new surface · S7 seed/expected (read-only) · X1 replay · X2 isolation · X7 no today ·
//         X8 no ACCOUNT · X12 no env · Z1 residue
// Base expectation per check (registry column 4): RED = needs H1.3 (red for the right reason on 13a0601b) · GREEN = control that must stay green.
//   Deviation from brief §3 "RED on base: S1": S1.10 / S1.11 are controls (indexes / base columns unchanged) ⇒ GREEN.
//
// FROZEN (computed on the base 13a0601b by this oracle):
//   S2.5 FROZEN_LAW_DIGEST = canonical digest of the 4 rows the oracle derives itself from payroll-rules.ts (TS AST) — equals brief R3 literally
//   S5.1–S5.3 = the H1.1 frozen MONTHLY values (same 4-employee fixture as qc-hr-h1.1 :109-130, code copied verbatim)
//   S5.8 FROZEN_PATH_REVERSE / FROZEN_PATH_CONVERGE = sha256 of the normalised H0.6 trail (run status/totals/items digest · commission
//        status · adjustment binding) after paid#R1 → reverseRun + reversed#R1, and after the re-run R2 → paid#R2
//   S1.10 indexdefs · S1.7 crmCommissionId block · S5.6 qc-hr-h0.6 S8.4 block — byte strings / sha256 taken on the base
//
// SKIP convention (house style of qc-hr-h1.1 / h1.2): while neither the migration folder nor scripts/hr-seed-law-draft.mts exists the suite
//   prints SKIPPED + JSON_SUMMARY {skipped:true} and exits 0 · QC_FORCE=1 (or --force-run) runs everything · on the base every RED check is
//   red for the right reason, GREEN controls are green, no crash, no residue. --list = print every id without touching the DB.
// Races: 10 lanes on the shared Prisma pool (each statement on its own pooled connection) × 3 rounds (H1.2 S4 technique).
//
// Run (QC4 only):
//   bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h1.3.mts
//   bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-hr-h1.3.mts      (SKIP exit 0 on the base)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const SUITE = "qc-hr-h1.3";
const THIS_FILE = "scripts/qc-hr-h1.3.mts";
const ROOT = process.cwd();
const ARGV = process.argv.slice(2);
const LIST = ARGV.includes("--list");
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const QC4_HOST_MARK = "ep-frosty-lab";
const SLUG_PREFIX = "qc-hr-h1.3-";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MIG_DIR = "prisma/migrations/20261206000000_hr_money_law_model";
const MIG_FILE = `${MIG_DIR}/migration.sql`;
const MIG_ROOT = "prisma/migrations";
const SEED_LAW = "scripts/hr-seed-law-draft.mts";
const RULES_FILE = "src/lib/modules/hr/payroll-rules.ts";
const PAY_FILE = "src/lib/modules/hr/payroll.ts";
const PAY_UI = "src/lib/modules/hr/payroll-ui.tsx";
const PAY_ACTIONS = "src/lib/modules/hr/payroll-actions.ts";
const PRIVACY = "src/lib/modules/hr/privacy.ts";
const SLIP_PAGE = "src/app/app/sys/[id]/payroll/[runId]/slip/[employeeId]/page.tsx";
const CRM_FILE = "src/lib/modules/crm/commissions.ts";
const CONSUMERS = "src/lib/outbox-consumers.ts";
const ACCOUNT_DIR = "src/lib/modules/account";
const CORE_SCOPE = "src/lib/core/scope.ts";
const SCHEMA_DIR = "prisma/schema";
const PAY_SCHEMA = "prisma/schema/payroll.prisma";
const HQC_ENV = "scripts/hr-qc-env.mts";
const SEED_FILE = "scripts/seed-hr-qc.mts";
const EXPECTED = "scripts/hr-expected.json";
const FITNESS_HR = "scripts/fitness-hr.mts";
const H06_ORACLE = "scripts/qc-hr-h0.6.mts";
/** sha256 of payroll-rules.ts on the base (FREEZE — COMMON §C.4 · F16.2 · same value as qc-hr-h0.6/h1.1) */
const RULES_SHA = "75a66c0c1354e932e7ba29609dcbf0919ffe82b51f476a3945fd1a0749833bf7";
/** qc-hr-h0.6 S8.4 hashes (computeItem body · markPaid block) — values of qc-hr-h0.6.mts :71-72, re-verified on 13a0601b */
const COMPUTE_ITEM_SHA = "b151a83c16eb96cb9adca8d5ed8b622612ebc50c39ad729f6f7966c43a47cd13";
const MARKPAID_BLOCK_SHA = "893a9e4e25add025394a2484feaf3b2aaeb2807c168ff20f9f29a90c4bc853c3";
/** sha256 of the `  // S8.4\n … \n  }\n` block of qc-hr-h0.6.mts on 13a0601b (the freeze check itself must not drift) */
const H06_S84_BLOCK_SHA = "5f15f5f4a47844be3e1fb26e5337756aff603ea0ae9cf8467ac5692354049fc3";
/** sha256 of payroll.prisma from "  // crm_v2_c (CRM C3.0/C3.3)" through "  crmCommissionId String?\n" on 13a0601b (R4 · S1.7) */
const CRM_BLOCK_SHA = "119baf15b3a29a75460343dbd42bbc8285bd84872e9ec0ff0706b5e4654b3221";
/** pg_indexes.indexdef on QC4 at the base (S1.10 · byte-equal) */
const FROZEN_IDX_CRM = `CREATE UNIQUE INDEX "HrPayAdjustment_crmCommissionId_key" ON public."HrPayAdjustment" USING btree ("crmCommissionId") WHERE ("crmCommissionId" IS NOT NULL)`;
const FROZEN_IDX_LIVE = `CREATE UNIQUE INDEX "HrPayrollRun_systemId_periodKey_live_key" ON public."HrPayrollRun" USING btree ("systemId", "periodKey") WHERE (status <> 'REVERSED'::"PayrollRunStatus")`;
/** S1.11 — sha256 of "Table.col:type:nullable" for the 49 base columns on QC4 at the base */
const FROZEN_BASE_COL_SIG = "554083b36386ce4ea2909fb2d078e9b397ecf4f4eae739d5a1e8194a7f93a4da";
/** S2.5 — canonical digest of the 4 v1 rows (see ORACLE CONTRACT) · derived by this oracle from payroll-rules.ts on 13a0601b */
const FROZEN_LAW_DIGEST = "0ed9de8c2c4df9b4b05ce320889318cc4c755527448f56628235960ae38d9470";
/** S5.8 — H0.6 reverse / converge path digests (frozen on 13a0601b by the first forced run) */
const FROZEN_PATH_REVERSE = "6e0e7a3d231440f3ed0db67ea7c7b08c961149a2c3063e924e1f751e454932a9";
const FROZEN_PATH_CONVERGE = "f2ff11eaf080ce641cf289cac491fcbc05b62cd8791a77d78fbf5a6344a39fc9";

// ── fixed texts (today's payroll.ts — R4 "CRM path unchanged") ──
const T_CRM_DUP = "คอมมิชชันรายการนี้ถูกส่งเข้างวดเงินเดือนไปแล้ว (มีได้รายการเดียว)";

// ── R1 model (column · kind · nullable · default-regex) ──
type Kind = "text" | "int" | "bool" | "date" | "ts" | "json" | "textarr" | `E:${string}`;
type Col = readonly [string, Kind, boolean, string?];
const ENUMS: Record<string, readonly string[]> = {
  HrLawKind: ["SSO", "TAX_BRACKET", "DEDUCTION", "OT", "MIN_WAGE"],
  HrLawStatus: ["DRAFT", "ACTIVE", "RETIRED"],
  HrWorkEntryKind: ["WORK", "OT_WORKDAY", "HOLIDAY_WORK", "OT_HOLIDAY", "HOLIDAY_PAID", "LEAVE_PAID", "LEAVE_UNPAID", "ABSENT", "LATE", "EARLY_OUT"],
  HrPaySource: ["MANUAL", "CRM_COMMISSION", "POS_SALE_LINE", "OT_REQUEST", "LATE_RULE", "ABSENT_RULE", "INVENTORY_ISSUE"],
  HrReviewNoteKind: ["NOTE", "VERBAL_WARNING", "WRITTEN_WARNING", "REVIEW"],
  HrOnboardingKind: ["ONBOARDING", "OFFBOARDING"],
};
const ID: Col = ["id", "text", false];
const CREATED: Col = ["createdAt", "ts", false, "CURRENT_TIMESTAMP"];
const UPD: Col = ["updatedAt", "ts", false];
const TS_COLS: Col[] = [["tenantId", "text", false], ["systemId", "text", false]];
const TABLES: Record<string, readonly Col[]> = {
  // Q1 global — no tenantId / systemId (checked separately) · updatedAt not required by R1 (tolerated)
  HrLawTable: [ID, CREATED, ["kind", "E:HrLawKind", false], ["effectiveFrom", "date", false], ["json", "json", false], ["status", "E:HrLawStatus", false, "DRAFT"], ["sourceKey", "text", false], ["note", "text", true], ["approvedById", "text", true], ["approvedByName", "text", true], ["approvedAt", "ts", true], ["supersedesId", "text", true]],
  HrWorkEntry: [ID, ...TS_COLS, CREATED, ["employeeId", "text", false], ["date", "date", false], ["kind", "E:HrWorkEntryKind", false], ["minutes", "int", false], ["periodKey", "text", false], ["unitId", "text", true], ["rosterEntryId", "text", true], ["attendanceInId", "text", true], ["attendanceOutId", "text", true], ["leaveId", "text", true], ["otRequestId", "text", true], ["holidayId", "text", true], ["runId", "text", true], ["computedAt", "ts", false], ["note", "text", true]],
  HrReviewNote: [ID, ...TS_COLS, CREATED, UPD, ["employeeId", "text", false], ["kind", "E:HrReviewNoteKind", false], ["title", "text", false], ["body", "text", false], ["periodLabel", "text", true], ["score", "int", true], ["authorUserId", "text", true], ["visibleToEmployee", "bool", false, "false"], ["acknowledgedAt", "ts", true]],
  HrOnboardingTask: [ID, ...TS_COLS, CREATED, UPD, ["employeeId", "text", false], ["kind", "E:HrOnboardingKind", false], ["title", "text", false], ["sortOrder", "int", false, "0"], ["dueDate", "date", true], ["doneAt", "ts", true], ["doneById", "text", true], ["templateKey", "text", true], ["kanbanCardId", "text", true]],
};
const NEW_TABLES = Object.keys(TABLES);
const RUN_NEW: readonly Col[] = [["engineVersion", "int", false, "1"], ["accountSystemId", "text", true], ["createdById", "text", true], ["approvedById", "text", true], ["approvedAt", "ts", true], ["bankFileKey", "text", true], ["filingJson", "json", true]];
const ITEM_NEW: readonly Col[] = [["ytdJson", "json", true], ["lawRowIds", "textarr", false, "ARRAY"]];
const ADJ_NEW: readonly Col[] = [["sourceType", "E:HrPaySource", true], ["sourceRef", "text", true]];
const ADJ_BASE = ["id", "tenantId", "systemId", "employeeId", "periodKey", "kind", "amountSatang", "hours", "rateSatang", "note", "status", "requestedById", "decidedById", "decidedAt", "runId", "createdAt", "crmCommissionId"];
const RUN_BASE = ["id", "tenantId", "systemId", "periodKey", "payDate", "status", "totalGrossSatang", "totalSsoEmployeeSatang", "totalSsoEmployerSatang", "totalWhtSatang", "totalNetSatang", "totalAddSatang", "totalDeductSatang", "journalEntryId", "note", "createdAt", "reversedAt", "reversedById"];
const ITEM_BASE = ["id", "tenantId", "systemId", "runId", "employeeId", "grossSatang", "ssoBaseSatang", "ssoEmployeeSatang", "ssoEmployerSatang", "whtSatang", "netSatang", "addSatang", "deductSatang", "snapshotJson"];
const WE_SOURCE_IDS = ["rosterEntryId", "attendanceInId", "attendanceOutId", "leaveId", "otRequestId", "holidayId"];
const H13_KEYS = ["engineVersion", "accountSystemId", "createdById", "approvedById", "approvedAt", "bankFileKey", "filingJson", "ytdJson", "lawRowIds", "sourceType", "sourceRef"];
const S61_RE = /\b(ytdJson|filingJson|bankFileKey|lawRowIds|sourceRef|HrReviewNote|HrOnboardingTask|HrWorkEntry|HrLawTable|hrReviewNote|hrOnboardingTask|hrWorkEntry|hrLawTable)\b/g;

// ── R3 law rows (brief verbatim — the oracle ALSO derives them from payroll-rules.ts by AST and requires equality) ──
const SENTINEL = "1970-01-01";
const BRIEF_ROWS = [
  { kind: "SSO", effectiveFrom: SENTINEL, json: { rateBp: 500, minBaseSatang: 165000, maxBaseSatang: 1500000, rounding: "BAHT_HALF_UP", employerEqualsEmployee: true } },
  { kind: "TAX_BRACKET", effectiveFrom: SENTINEL, json: { bands: [[15000000, 0], [30000000, 500], [50000000, 1000], [75000000, 1500], [100000000, 2000], [200000000, 2500], [500000000, 3000], [null, 3500]].map(([u, r]) => ({ upToSatang: u, rateBp: r })), rounding: "SATANG_HALF_UP_ONCE" } },
  { kind: "DEDUCTION", effectiveFrom: SENTINEL, json: { expenseRateBp: 5000, expenseCapSatang: 10000000, personalSatang: 6000000, spouseSatang: 6000000, childSatang: 3000000, ssoAllowanceCapSatang: 900000 } },
  { kind: "OT", effectiveFrom: SENTINEL, json: { workdayMultiplierBp: 15000, daysPerMonth: 30, hoursPerDay: 8 } },
] as const;
const LAW_KINDS4 = ["SSO", "TAX_BRACKET", "DEDUCTION", "OT"];

// ── S5.1 MONTHLY fixture (own HR system "M") — copied verbatim from qc-hr-h1.1 :109-132 ──
const B = (baht: number) => Math.round(baht * 100);
const MONTHLY_FIXTURE = {
  period: "2030-05",
  payDate: "2030-05-31",
  employees: [
    { code: "M01", base: B(15_000), sso: true, spouse: false, children: 0, start: null as string | null },
    { code: "M02", base: B(27_500), sso: false, spouse: false, children: 0, start: null as string | null },
    { code: "M03", base: B(52_000), sso: true, spouse: true, children: 2, start: null as string | null },
    { code: "M04", base: B(9_000), sso: true, spouse: false, children: 0, start: "2030-05-16" as string | null },
  ],
  adjustments: [
    { code: "M01", kind: "OT", amount: B(1_250) },
    { code: "M02", kind: "BONUS", amount: B(3_000) },
    { code: "M03", kind: "DEDUCTION", amount: B(800) },
    { code: "M04", kind: "ALLOWANCE", amount: B(500) },
    { code: "M04", kind: "ADVANCE", amount: B(200) },
  ],
} as const;
/** frozen on 9c5aa1ea by qc-hr-h1.1 (H1.2 §10 confirmed) — payrollItemsDigest with employeeId := code */
const FROZEN_DIGEST = "72166a3e2a2ebb6a37405a105f7db540b946fda05fe020639bbe79a60b87e5c8";
const FROZEN_TOTALS = "10725000:195000:195000:100000:10430000:475000:100000";
const FROZEN_FLAGS = "M01=-,M02=-,M03=-,M04=PARTIAL_MONTH";

// ═════════════════════════ registry (id · group · severity · base expectation · title) ═════════════════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Base = "RED" | "GREEN";
type Def = readonly [string, string, Sev, Base, string];
const D = (id: string, g: string, sev: Sev, base: Base, title: string): Def => [`H1.3-${id}`, g, sev, base, title] as const;
const CHECKS: readonly Def[] = [
  // S1 migration / schema shape (R1 · R4 · R8)
  D("S1.1", "R1", "CRITICAL", "RED", "[static] " + MIG_DIR + " exists · sorts after every 20261205* (H1.2) folder · additive (no DROP · RENAME · ALTER COLUMN … TYPE · ALTER TYPE) · exactly 6 CREATE TYPE with the exact labels in order"),
  D("S1.2", "R1", "CRITICAL", "RED", "[static] 4 CREATE TABLE (HrLawTable · HrWorkEntry · HrReviewNote · HrOnboardingTask) with the R1 columns / SQL types / NOT NULL · HrLawTable has no tenantId / systemId (Q1 global)"),
  D("S1.3", "R1", "CRITICAL", "RED", "[static] HrPayrollRun +7 columns (engineVersion INTEGER NOT NULL DEFAULT 1 · accountSystemId · createdById · approvedById · approvedAt · bankFileKey · filingJson JSONB) · only engineVersion has a DEFAULT"),
  D("S1.4", "R1", "MAJOR", "RED", "[static] HrPayrollItem +2: ytdJson JSONB nullable · lawRowIds TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]"),
  D("S1.5", "R1", "CRITICAL", "RED", "[static] HrPayAdjustment +2 nullable, no DEFAULT: sourceType \"HrPaySource\" · sourceRef TEXT"),
  D("S1.6", "R1", "CRITICAL", "RED", "[static+db] raw SQL: HrPayAdjustment_tenant_source_key (tenantId,sourceType,sourceRef) WHERE sourceRef IS NOT NULL · CHECK sourceRef⇒sourceType · CHECK not crmCommissionId∧sourceRef · law ACTIVE partial unique (kind,effectiveFrom) · ACTIVE-needs-signoff CHECK · onboarding (employeeId,kind,templateKey) WHERE templateKey IS NOT NULL · CHECKs minutes 0..1440 · score 1..5 · engineVersion ≥ 1 (score 0/6 and engineVersion 0 ⇒ 23514, rolled back)"),
  D("S1.7", "R1", "MAJOR", "RED", "[static] schema: 4 models + fields as R1 · HrPayrollRun/HrPayrollItem/HrPayAdjustment new fields · crmCommissionId block (comment + field) byte-identical · no @unique on sourceRef · reader-rule comment `sourceType ?? (crmCommissionId ? CRM_COMMISSION : MANUAL)`"),
  D("S1.8", "R8", "MAJOR", "RED", "[static] core/scope.ts: HrWorkEntry · HrReviewNote · HrOnboardingTask sys() · HrLawTable g(\"…\") (axis global, Q1) · hr-qc-env.mts HR_TABLES +4 rows (hrLawTable without tenantId)"),
  D("S1.9", "R1", "CRITICAL", "RED", "[db] information_schema: columns / types / nullability / defaults exact on the 4 new tables + 11 new columns · enum labels exact and ordered (6 types)"),
  D("S1.10", "R4", "CRITICAL", "GREEN", "[db] [control] pg_indexes.indexdef of HrPayAdjustment_crmCommissionId_key and HrPayrollRun_systemId_periodKey_live_key byte-equal to the base"),
  D("S1.11", "R1", "CRITICAL", "GREEN", "[db] [control] additive: every base column of HrPayAdjustment (17) · HrPayrollRun (18) · HrPayrollItem (14) still exists with its base type"),
  D("S1.12", "R1", "MAJOR", "RED", "[db] pg_constraint: HrWorkEntry / HrReviewNote / HrOnboardingTask .employeeId → HrEmployee ON DELETE CASCADE · no FK on any HrWorkEntry source id (Q8) · no new FK on HrPayAdjustment"),
  // S2 law seed = frozen constants (R3)
  D("S2.1", "R3", "CRITICAL", "RED", "[run] " + SEED_LAW + " dry-run (default) ⇒ exit 0 · prints the 4 kinds + the digest · writes 0 rows (key prefix of this run)"),
  D("S2.2", "R3", "CRITICAL", "RED", "[static] verifyAgainstFrozen static leg: the oracle's OWN TS-AST read of payroll-rules.ts (:22-24 · :36-45 · :65-69 · :80 · :104-106) = brief R3 rows = the script's exported LAW_V1_ROWS (canonical JSON) · the script's verifyAgainstFrozen() ⇒ ok"),
  D("S2.3", "R3", "CRITICAL", "RED", "[pure] behavioural leg: the oracle's own evaluator over the script's LAW_V1_ROWS json vs the frozen functions (ssoContribution · annualTaxSatang · monthlyWhtSatang incl. spouse/children/SSO-year · otHourlyRateSatang) on ≥ 2,000 vectors ⇒ 0 mismatches (positive control: same evaluator over the AST rows ⇒ 0)"),
  D("S2.4", "R3", "CRITICAL", "RED", "[run+db] --apply ⇒ exactly 4 rows SSO / TAX_BRACKET / DEDUCTION / OT · all DRAFT · approvedAt/approvedById/approvedByName null · effectiveFrom 1970-01-01 (Q11) · output `created 4`"),
  D("S2.5", "R3", "CRITICAL", "RED", "[run+db] LAW_V1_DIGEST exported by the script = FROZEN_LAW_DIGEST · digest of the 4 applied DB rows (kind · effectiveFrom · json) = FROZEN_LAW_DIGEST"),
  D("S2.6", "R3", "MAJOR", "RED", "[run+db] --apply ×2 ⇒ `created 0 · unchanged 4` · row ids and createdAt unchanged"),
  D("S2.7", "R3", "CRITICAL", "RED", "[run+db] tampered row (same sourceKey, different json) ⇒ exit 1 · Thai text · nothing written (no row created for the prefix · tampered row unchanged)"),
  D("S2.8", "R3", "MAJOR", "RED", "[static] script: no write with ACTIVE · no update/delete/upsert on HrLawTable (no UPDATE/DELETE SQL) · ON CONFLICT (\"sourceKey\") DO NOTHING · exports LAW_V1_ROWS / LAW_V1_DIGEST / verifyAgainstFrozen · LAW_V1_ROWS integers only (no float literal)"),
  D("S2.9", "R1", "CRITICAL", "RED", "[db] raw ACTIVE row without sign-off ⇒ 23514 · two ACTIVE rows same kind + date (signed off) ⇒ 23505 (both in rolled-back tx) · no MIN_WAGE row seeded (Q4)"),
  // S3 source idempotency + CRM coexistence (R1 · R4)
  D("S3.1", "R1", "CRITICAL", "RED", "[race] 10 lanes × 3 rounds same (tenant, POS_SALE_LINE, ref) ⇒ exactly 1 row + 9 × 23505 per round · winner REJECTED ⇒ same ref still 23505 (Q14: REJECTED does not free sourceRef)"),
  D("S3.2", "R1", "MAJOR", "RED", "[db] same sourceRef, other sourceType (OT_REQUEST) ⇒ allowed (2 rows)"),
  D("S3.3", "R1", "MAJOR", "RED", "[db] same (sourceType, sourceRef) in the other tenant ⇒ allowed"),
  D("S3.4", "R1", "MAJOR", "RED", "[db] sourceType set + sourceRef null × 10 ⇒ 10 rows (index is partial)"),
  D("S3.5", "R1", "CRITICAL", "RED", "[db] sourceRef set, sourceType null ⇒ 23514"),
  D("S3.6", "R4", "CRITICAL", "RED", "[db] both crmCommissionId and sourceRef set ⇒ 23514"),
  D("S3.7", "R4", "CRITICAL", "GREEN", "[service] [control] CRM path unchanged: requestAdjustment({crmCommissionId}) ×2 ⇒ 1st ok · 2nd ok:false \"" + T_CRM_DUP + "\" · 1 row · sourceType/sourceRef null (or column absent)"),
  D("S3.8", "R4", "CRITICAL", "GREEN", "[race] [control] 10 lanes × 3 rounds requestAdjustment same crmCommissionId ⇒ 1 ok + 9 × the same Thai text · 1 row (C3.3 semantics; the new index never fires)"),
  D("S3.9", "R2", "MAJOR", "GREEN", "[service] [control] manual requestAdjustment (no CRM) ⇒ sourceType null · sourceRef null (or column absent) · reader rule resolves MANUAL (and the S3.7 row resolves CRM_COMMISSION)"),
  // S4 work entry / onboarding (R1)
  D("S4.1", "R1", "CRITICAL", "RED", "[race] HrWorkEntry unique (employeeId, date, kind) 10 lanes × 3 rounds ⇒ 1 row + 9 × 23505 per round"),
  D("S4.2", "R1", "MAJOR", "RED", "[db] same employee + date, two kinds (WORK · OT_WORKDAY) ⇒ 2 rows"),
  D("S4.3", "R1", "CRITICAL", "RED", "[db] minutes −1 / 1441 ⇒ 23514 · 0 and 1440 accepted"),
  D("S4.4", "R1", "MAJOR", "RED", "[db] source ids accept real H1.2/HR rows (HrRosterEntry · HrOtRequest · HrHoliday · HrAttendance · HrLeave) + any string · entry survives deletion of every source, ids intact (no FK — Q8) · needs H1.2 tables"),
  D("S4.5", "R1", "MAJOR", "RED", "[db] HrWorkEntry.date is `date` · Bangkok day key round-trips (2028-02-29 accepted · read back as 2028-02-29)"),
  D("S4.6", "R1", "CRITICAL", "RED", "[db] employee delete ⇒ cascade: 0 HrWorkEntry · 0 HrReviewNote · 0 HrOnboardingTask left for that employee"),
  D("S4.7", "R1", "MAJOR", "RED", "[race] onboarding (employeeId, kind, templateKey) 10 lanes × 3 rounds ⇒ 1 row per round · null templateKey × 3 ⇒ 3 rows"),
  // S5 frozen digests (R5)
  D("S5.1", "R5", "CRITICAL", "GREEN", "[service] [control] MONTHLY fixture (qc-hr-h1.1 :109-130 verbatim) items digest (employeeId := code) = " + FROZEN_DIGEST.slice(0, 16) + "…"),
  D("S5.2", "R5", "CRITICAL", "GREEN", "[service] [control] MONTHLY fixture run totals = " + FROZEN_TOTALS),
  D("S5.3", "R5", "CRITICAL", "GREEN", "[service] [control] MONTHLY fixture flags = " + FROZEN_FLAGS),
  D("S5.4", "R2", "CRITICAL", "RED", "[db] MONTHLY fixture run engineVersion = 1 · accountSystemId/createdById/approvedById/approvedAt/bankFileKey/filingJson null · every item lawRowIds = {} and ytdJson null"),
  D("S5.5", "R5", "CRITICAL", "GREEN", "[static] [control] payroll-rules.ts sha256 = 75a66c0c… · payroll.ts unchanged vs base (git)"),
  D("S5.6", "R5", "CRITICAL", "GREEN", "[static] [control] qc-hr-h0.6 S8.4 hashes recomputed (rules · computeItem · markPaid block) = base · the S8.4 block of qc-hr-h0.6.mts itself unchanged"),
  D("S5.7", "R5", "CRITICAL", "GREEN", "[static] [control] crm/commissions.ts · outbox-consumers.ts · src/lib/modules/account/** unchanged vs base (git)"),
  D("S5.8", "R5", "CRITICAL", "GREEN", "[service] [control] H0.6 path: run → approve → markPaid → paid#R1 → reverseRun → reversed#R1 ⇒ commission APPROVED, adjustment unbound · re-run R2 → paid#R2 ⇒ commission PAID · reverse/converge path digests = frozen"),
  // S6 privacy / no new surface (R6 · R7)
  D("S6.1", "R6", "CRITICAL", "GREEN", "[static] [control] no file under hr/** · app/**/{hr,payroll}/** · ai/** · outbox-consumers.ts reads ytdJson|filingJson|bankFileKey|lawRowIds|sourceRef|HrReviewNote|HrOnboardingTask|HrWorkEntry|HrLawTable more often than on the base (schema/migration/seed/oracle excluded)"),
  D("S6.2", "R6", "CRITICAL", "RED", "[static+run] fitness-hr F16.1 SENSITIVE_FIELDS ⊇ ytdJson · filingJson · bankFileKey (Q12) · fitness-hr exit 0"),
  D("S6.3", "R6", "CRITICAL", "GREEN", "[static] [control] whole-row readers (decideAdjustment · cancelAdjustment · listAdjustments · approveRun · listRuns · payslipData) consumed only by server code with named fields: no spread / return of the row · no JSON.stringify · no row as a client prop · callers not \"use client\" / \"use server\""),
  D("S6.4", "R6", "CRITICAL", "GREEN", "[dto] [control] matrix owner · payroll · manager · hr.leave.read · member · self · other tenant: profile + leave-item key lists = base · no H1.3 key · payslip access (owner/payroll/self = slip · others null)"),
  D("S6.5", "R7", "MAJOR", "GREEN", "[static] [control] git diff --name-only vs base (+ untracked) ⊆ migration · prisma/schema · seed-law script · core/scope.ts · hr-qc-env · fitness-hr · seed-hr-qc · hr-expected · this oracle · ledger/** (no page / route / action / message key)"),
  D("S6.6", "R7", "MAJOR", "GREEN", "[static] [control] outbox: consumer event keys = base · no added emitOutbox( line under src/ vs base"),
  // S7 seed / expected (R9 — read-only on qc-hr-v2)
  D("S7.1", "R9", "MAJOR", "RED", "[db read] hr-expected.json has \"HrPayrollRun.engineVersion\": 1 and \"HrLawTable.v1\": 4 · the seeded qc-hr-v2 paid run has engineVersion 1"),
  D("S7.2", "R9", "MAJOR", "GREEN", "[db read] [control] qc-hr-v2 live counts HrPayAdjustment 5 · HrPayrollItem 11 · HrPayrollRun 1 = hr-expected.json"),
  D("S7.3", "R9", "MAJOR", "RED", "[static+db read] seed-hr-qc.mts writes no HrWorkEntry/HrReviewNote/HrOnboardingTask/HrLawTable row · qc-hr-v2 has 0 rows in the 3 tenant tables (seed ×2 itself = builder evidence, not run here)"),
  D("S7.4", "R9", "MAJOR", "RED", "[db read] QC4 has exactly the 4 `v1:*` law rows (SSO · TAX_BRACKET · DEDUCTION · OT), all DRAFT · no ACTIVE row anywhere in HrLawTable"),
  D("S7.5", "R8", "MAJOR", "RED", "[static+db] HR_DELETE_ORDER lists hrWorkEntry · hrReviewNote · hrOnboardingTask before hrEmployee and not hrLawTable · deleting them for our main tenant leaves 0 rows"),
  // X
  D("X1.1", "X1", "MAJOR", "RED", "[run+db] seed script --apply ×3 on a fresh prefix ⇒ 4 rows · runs 2–3 `created 0 · unchanged 4`"),
  D("X2.1", "X2", "CRITICAL", "RED", "[db] source rows: other tenant same (type, ref) ⇒ allowed · same tenant, second HR system sH2 ⇒ 23505 (tenant-scoped by design, Q14)"),
  D("X2.2", "X2", "CRITICAL", "RED", "[db] tenantDb(sH2) on hrWorkEntry / hrReviewNote / hrOnboardingTask reads none of sH's rows · tenantDb(sH) reads them"),
  D("X7.1", "X7", "MAJOR", "GREEN", "[static] [control] no today-dependence: every date literal in this oracle's code ≥ 2030 (except the 1970-01-01 sentinel and the 2028-02-29 leap vector)"),
  D("X8.1", "X8", "MAJOR", "GREEN", "[service] [control] HR-only tenant (no ACCOUNT) still creates + approves a MONTHLY run (no JV) · engineVersion 1 when the column exists"),
  D("X12.1", "X12", "MAJOR", "GREEN", "[run] [control] fitness-hr.mts and `" + THIS_FILE + " --list` run without env ⇒ exit 0"),
  D("Z1", "-", "CRITICAL", "GREEN", "residue: tenants qc-hr-h1.3-* gone · 0 rows of ours in any tenantId table (incl. the 3 new + H1.2 tables) · law rows qc-h1.3-<stamp>* gone · users gone"),
];

if (LIST) {
  console.log(`${SUITE} — ${CHECKS.length} checks (id · group · sev · base · title)`);
  for (const [id, g, sev, base, t] of CHECKS) console.log(`${id}\t${g}\t${sev}\t${base}\t${t}`);
  process.exit(0);
}

// ═════════════════════════ helpers ═════════════════════════
const TITLE = new Map(CHECKS.map(([id, , , , t]) => [id, t]));
const SEV = new Map(CHECKS.map(([id, , sev]) => [id, sev]));
const BASE = new Map(CHECKS.map(([id, , , b]) => [id, b]));
const results = new Map<string, { ok: boolean; expected: string; actual: string }>();
function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  const full = `H1.3-${id}`;
  if (!TITLE.has(full)) throw new Error(`unregistered check id: ${id}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
const rd = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const short = (v: unknown, n = 200) => {
  try {
    return (typeof v === "string" ? v : (JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)) ?? "undefined")).replace(/\s+/g, " ").slice(0, n);
  } catch {
    return String(v).slice(0, n);
  }
};
function block(src: string, start: string, end = "\n}"): string {
  const i = src.indexOf(start);
  if (i < 0) return "";
  const j = src.indexOf(end, i + start.length);
  return src.slice(i, j < 0 ? undefined : j + end.length);
}
/** body of `export async function name(` / `export function name(` up to the next top-level `\nexport ` */
function fnBody(src: string, name: string): string {
  let i = src.indexOf(`export async function ${name}(`);
  if (i < 0) i = src.indexOf(`export function ${name}(`);
  if (i < 0) return "";
  const j = src.indexOf("\nexport ", i + 10);
  return src.slice(i, j < 0 ? undefined : j);
}
const seg = (src: string, a: string, b: string, inc: boolean) => {
  const i = src.indexOf(a);
  if (i < 0) return "";
  const j = src.indexOf(b, i + a.length);
  return j < 0 ? "" : src.slice(i, j + (inc ? b.length : 0));
};
const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).replace(/\s+/g, " ").slice(0, 200);
const isThai = (s: string) => /[฀-๿]/.test(s);
const srt = (a: Iterable<string>) => [...a].sort().join(",");
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const failedKeys = (o: Record<string, unknown>) => Object.entries(o).filter(([, v]) => !v).map(([k]) => k).join(",") || "all";
/** strip // and /* *\/ comments (rough — good enough for greps on our own sources) */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
function listFiles(dir: string, filter: (p: string) => boolean, out: string[] = []): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) listFiles(p, filter, out);
    else if (filter(p)) out.push(p);
  }
  return out;
}
/** canonical JSON value: object keys sorted recursively · arrays keep order · ∞ → null */
const canon = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(canon);
  if (typeof v === "number" && !Number.isFinite(v)) return null;
  if (v && typeof v === "object" && !(v instanceof Date)) return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Any)[k])]));
  return v;
};
const dayOf = (v: unknown): string => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));
/** canonical digest of law rows (ORACLE CONTRACT) */
const lawDigest = (rows: readonly Any[]): string => sha(JSON.stringify(canon(rows.map((r) => [r.kind, dayOf(r.effectiveFrom), r.json]))));
const stable = (v: unknown): string => JSON.stringify(canon(v), (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x)) ?? "undefined";
const numLeaves = (o: Any, out: number[] = []): number[] => {
  if (typeof o === "number") out.push(o);
  else if (o && typeof o === "object") for (const v of Object.values(o)) numLeaves(v, out);
  return out;
};

// ── git base (S5.5 · S5.7 · S6.1 · S6.5 · S6.6) ──
let BASE_REF = process.env.QC_H13_BASE ?? "";
function git(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}
function baseRef(): string {
  if (!BASE_REF) {
    try {
      BASE_REF = git(["merge-base", "HEAD", "origin/session/hr"]);
    } catch {
      BASE_REF = "13a0601b";
    }
  }
  return BASE_REF;
}
const atBase = (p: string): string => {
  try {
    return execFileSync("git", ["show", `${baseRef()}:${p}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
};
const changedVsBase = (paths: string[]): string => {
  try {
    const out = git(["diff", "--name-only", baseRef(), "--", ...paths]);
    return out ? `changed: ${out.replace(/\n/g, ",")}` : "unchanged";
  } catch (e) {
    return `git: ${errText(e).slice(0, 80)}`;
  }
};

// ═════════════════════════ pure: AST derivation of the v1 rows + evaluator (S2.2 / S2.3) ═════════════════════════
type LawRow = { kind: string; effectiveFrom: string; json: Any };
async function deriveRowsFromRules(): Promise<{ rows: LawRow[] | null; note: string }> {
  const src = rd(RULES_FILE);
  if (!src) return { rows: null, note: `∅ ${RULES_FILE}` };
  let ts: Any;
  try {
    ts = ((await import("typescript")) as Any).default ?? (await import("typescript"));
  } catch (e) {
    return { rows: null, note: `typescript not loadable: ${errText(e)}` };
  }
  const sf = ts.createSourceFile(RULES_FILE, src, ts.ScriptTarget.Latest, true);
  const consts = new Map<string, Any>();
  const fns = new Map<string, Any>();
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) consts.set(d.name.text, d.initializer);
    if (ts.isFunctionDeclaration(st) && st.name) fns.set(st.name.text, st);
  }
  const num = (n: Any): number => {
    if (!n) return Number.NaN;
    if (ts.isNumericLiteral(n)) return Number(String(n.text).replace(/_/g, ""));
    if (ts.isParenthesizedExpression(n)) return num(n.expression);
    if (ts.isIdentifier(n)) return consts.has(n.text) ? num(consts.get(n.text)) : Number.NaN;
    if (ts.isPropertyAccessExpression(n) && n.getText(sf) === "Number.POSITIVE_INFINITY") return Number.POSITIVE_INFINITY;
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AsteriskToken) return num(n.left) * num(n.right);
    return Number.NaN;
  };
  /** `const x = a ?? <default>` inside a function body → evaluated default */
  const qqDefault = (fn: string, v: string): number => {
    let out = Number.NaN;
    const walk = (n: Any) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === v && n.initializer && ts.isBinaryExpression(n.initializer) && n.initializer.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) out = num(n.initializer.right);
      ts.forEachChild(n, walk);
    };
    const f = fns.get(fn);
    if (f) walk(f);
    return out;
  };
  const textOf = (fn: string) => (fns.get(fn) ? fns.get(fn).getText(sf).replace(/\s+/g, " ") : "");
  // SSO :22-24 + rounding :28-29 + employer = employee :31
  const ssoTxt = textOf("ssoContribution");
  const rateBp = qqDefault("ssoContribution", "rateBp");
  const minBase = qqDefault("ssoContribution", "minBase");
  const maxBase = qqDefault("ssoContribution", "maxBase");
  const roundingBaht = /Math\.round\(rawSatang \/ BAHT\) \* BAHT/.test(ssoTxt) && /\(baseSatang \* rateBp\) \/ 10000/.test(ssoTxt);
  const emplEq = /employeeSatang: roundedSatang, employerSatang: roundedSatang/.test(ssoTxt);
  // TAX :36-45 + rounding once :57
  const bandsNode = consts.get("TAX_BANDS");
  const bands: { upToSatang: number | null; rateBp: number }[] = [];
  if (bandsNode && ts.isArrayLiteralExpression(bandsNode)) {
    for (const el of bandsNode.elements) {
      if (!ts.isObjectLiteralExpression(el)) continue;
      const get = (k: string) => el.properties.find((p: Any) => ts.isPropertyAssignment(p) && p.name.getText(sf) === k)?.initializer;
      const up = num(get("upToSatang"));
      bands.push({ upToSatang: Number.isFinite(up) ? up : null, rateBp: Math.round(num(get("ratePct")) * 100) });
    }
  }
  const taxTxt = textOf("annualTaxSatang");
  const taxOnce = /return Math\.round\(tax\); \}$/.test(taxTxt) && /tax \+= \(taxableInBand \* band\.ratePct\) \/ 100;/.test(taxTxt);
  // DEDUCTION :65-69 + expense rate literal :80
  let expenseRate = Number.NaN;
  {
    const f = fns.get("monthlyWhtSatang");
    const walk = (n: Any) => {
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AsteriskToken) {
        for (const s of [n.left, n.right]) if (ts.isNumericLiteral(s) && !Number.isInteger(Number(s.text))) expenseRate = Number(s.text);
      }
      ts.forEachChild(n, walk);
    };
    if (f) walk(f);
  }
  // OT :104-106
  const days = qqDefault("otHourlyRateSatang", "days");
  const hours = qqDefault("otHourlyRateSatang", "hours");
  const mult = qqDefault("otHourlyRateSatang", "mult");
  const rows: LawRow[] = [
    { kind: "SSO", effectiveFrom: SENTINEL, json: { rateBp, minBaseSatang: minBase, maxBaseSatang: maxBase, rounding: roundingBaht ? "BAHT_HALF_UP" : "?", employerEqualsEmployee: emplEq } },
    { kind: "TAX_BRACKET", effectiveFrom: SENTINEL, json: { bands, rounding: taxOnce ? "SATANG_HALF_UP_ONCE" : "?" } },
    {
      kind: "DEDUCTION",
      effectiveFrom: SENTINEL,
      json: {
        expenseRateBp: Math.round(expenseRate * 10000),
        expenseCapSatang: num(consts.get("EXPENSE_CAP_SATANG")),
        personalSatang: num(consts.get("PERSONAL_ALLOWANCE_SATANG")),
        spouseSatang: num(consts.get("SPOUSE_ALLOWANCE_SATANG")),
        childSatang: num(consts.get("CHILD_ALLOWANCE_SATANG")),
        ssoAllowanceCapSatang: num(consts.get("SSO_ALLOWANCE_CAP_SATANG")),
      },
    },
    { kind: "OT", effectiveFrom: SENTINEL, json: { workdayMultiplierBp: Math.round(mult * 10000), daysPerMonth: days, hoursPerDay: hours } },
  ];
  const bad = numLeaves(rows.map((r) => r.json)).filter((x) => !Number.isSafeInteger(x));
  return { rows, note: bad.length ? `non-integer/NaN leaves: ${bad.join(",")}` : "ok" };
}

/** the oracle's own evaluator over the law json (R3 shapes) — compared with the frozen functions */
function evaluator(rows: readonly Any[]) {
  const j = (k: string) => rows.find((r) => r?.kind === k)?.json as Any;
  const S = j("SSO");
  const T = j("TAX_BRACKET");
  const Dd = j("DEDUCTION");
  const O = j("OT");
  const sso = (sal: number) => {
    const base = Math.min(Math.max(sal, S.minBaseSatang), S.maxBaseSatang);
    const raw = (base * S.rateBp) / 10000;
    const emp = S.rounding === "BAHT_HALF_UP" ? Math.round(raw / 100) * 100 : Number.NaN;
    return { baseSatang: base, employeeSatang: emp, employerSatang: S.employerEqualsEmployee ? emp : Number.NaN };
  };
  const tax = (net: number) => {
    if (net <= 0) return 0;
    let t = 0;
    let prev = 0;
    for (const b of T.bands as Any[]) {
      const up = b.upToSatang === null ? Number.POSITIVE_INFINITY : b.upToSatang;
      if (net <= prev) break;
      t += ((Math.min(net, up) - prev) * (b.rateBp / 100)) / 100;
      prev = up;
    }
    return T.rounding === "SATANG_HALF_UP_ONCE" ? Math.round(t) : Number.NaN;
  };
  const wht = (sal: number, ssoYear: number, spouse: boolean, children: number) => {
    const annual = sal * 12;
    const expense = Math.min((annual * Dd.expenseRateBp) / 10000, Dd.expenseCapSatang);
    const net = Math.max(0, annual - expense - Dd.personalSatang - (spouse ? Dd.spouseSatang : 0) - Math.max(0, children) * Dd.childSatang - Math.min(Math.max(0, ssoYear), Dd.ssoAllowanceCapSatang));
    return Math.max(0, Math.round(tax(net) / 12));
  };
  const ot = (sal: number) => (sal <= 0 || O.daysPerMonth <= 0 || O.hoursPerDay <= 0 ? 0 : Math.round((sal / O.daysPerMonth / O.hoursPerDay) * (O.workdayMultiplierBp / 10000)));
  return { sso, tax, wht, ot };
}
async function behaviour(rows: readonly Any[]): Promise<{ n: number; mism: number; first: string }> {
  const R = (await import("@/lib/modules/hr/payroll-rules" as string)) as Any;
  let ev: ReturnType<typeof evaluator>;
  try {
    ev = evaluator(rows);
  } catch (e) {
    return { n: 0, mism: -1, first: `evaluator: ${errText(e)}` };
  }
  let n = 0;
  let mism = 0;
  let first = "";
  const cmp = (tag: string, a: unknown, b: unknown) => {
    n++;
    if (stable(a) !== stable(b)) {
      mism++;
      if (!first) first = `${tag}: frozen=${short(a, 60)} json=${short(b, 60)}`;
    }
  };
  // SSO: min/max ±1 + grid
  const ssoGrid = new Set<number>([0, 1, 164_999, 165_000, 165_001, 1_499_999, 1_500_000, 1_500_001, 9_999_999]);
  for (let s = 0; s <= 3_000_000; s += 1_237) ssoGrid.add(s);
  for (const s of ssoGrid) cmp(`sso(${s})`, R.ssoContribution(s), ev.sso(s));
  // annual tax: band edges ±1 + grid
  const edges = [15_000_000, 30_000_000, 50_000_000, 75_000_000, 100_000_000, 200_000_000, 500_000_000];
  const taxGrid = new Set<number>([-1, 0, 1, 999_999_999_99]);
  for (const e of edges) for (const d of [-1, 0, 1]) taxGrid.add(e + d);
  for (let t = 0; t <= 700_000_000; t += 1_700_003) taxGrid.add(t);
  for (const t of taxGrid) cmp(`tax(${t})`, R.annualTaxSatang(t), ev.tax(t));
  // monthly WHT: salaries × spouse × children 0–4 × SSO-year 0–12,000 baht
  const sal = [0, 1, 1_000_000, 1_250_000, 1_666_667, 2_083_333, 2_500_000, 3_000_000, 4_166_667, 5_000_001, 8_333_333, 12_500_000, 16_666_667, 25_000_000, 41_666_667];
  const ssoYear = [0, 450_000, 899_999, 900_000, 900_001, 1_200_000];
  for (const s of sal) for (const sp of [false, true]) for (let c = 0; c <= 4; c++) for (const y of ssoYear) cmp(`wht(${s},${y},${sp},${c})`, R.monthlyWhtSatang({ monthlySalarySatang: s, ssoEmployeeYearSatang: y, deductions: { spouse: sp, children: c } }), ev.wht(s, y, sp, c));
  // OT hourly rate
  for (let s = -100; s <= 6_000_000; s += 19_997) cmp(`ot(${s})`, R.otHourlyRateSatang(s), ev.ot(s));
  return { n, mism, first };
}

// ═════════════════════════ statics (no DB) ═════════════════════════
const staticNotes: Record<string, Any> = {};
function migStatements(): string {
  return rd(MIG_FILE)
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n")
    .replace(/\s+/g, " ");
}
/** lowercase, quotes stripped, whitespace collapsed — loose matching of raw SQL */
const loose = (s: string) => s.toLowerCase().replace(/"/g, "").replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").replace(/\s*,\s*/g, ", ").replace(/ on (\w+) \(/g, " on $1(");
function sqlType(k: Kind): RegExp {
  if (k === "text") return /TEXT/;
  if (k === "int") return /INTEGER/;
  if (k === "bool") return /BOOLEAN/;
  if (k === "date") return /DATE/;
  if (k === "ts") return /TIMESTAMP\(3\)/;
  if (k === "json") return /JSONB/;
  if (k === "textarr") return /TEXT\[\]/;
  return new RegExp(`"${k.slice(2)}"`);
}
/** column definition in a CREATE TABLE / ADD COLUMN fragment: `"col" TYPE [NOT NULL] [DEFAULT …]` */
function colDefOk(fragment: string, [c, k, nullable, def]: Col): boolean {
  const m = fragment.match(new RegExp(`"${c}" ([^,;]+?)(?=,\\s*(?:ADD COLUMN|"|CONSTRAINT)|\\s*;|\\s*\\)\\s*;|\\s*,?\\s*$)`));
  if (!m) return false;
  const spec = m[1]!;
  if (!sqlType(k).test(spec)) return false;
  if (/NOT NULL/.test(spec) === nullable) return false;
  if (def && !new RegExp(`DEFAULT\\s+'?${def.replace(/[[\]]/g, "\\$&")}`).test(spec)) return false;
  return true;
}
function runStatic(): void {
  console.log("── [static] S1 · S2.8 · S5.5–S5.7 · S6.1 · S6.3 · S6.5 · S6.6 · S7.5 · X7.1 ──");
  const mig = migStatements();
  // S1.1
  {
    const folders = existsSync(join(ROOT, MIG_ROOT)) ? readdirSync(join(ROOT, MIG_ROOT)).filter((f) => /^\d{14}_/.test(f)) : [];
    const h12 = folders.filter((f) => f.startsWith("20261205"));
    const name = MIG_DIR.split("/").pop()!;
    const types = [...mig.matchAll(/CREATE TYPE "(\w+)" AS ENUM \(([^)]*)\)/g)].map((m) => [m[1]!, m[2]!.replace(/[\s']/g, "")] as const);
    const enumOk = Object.entries(ENUMS).every(([n, v]) => types.some(([t, l]) => t === n && l === v.join(",")));
    const s11 = {
      exists: !!mig.trim(),
      sortsAfterH12: h12.every((f) => f < name) && name > "20261205000001_hr_judgement_enums",
      noDrop: !/\bDROP\b/i.test(mig),
      noRename: !/\bRENAME\b/i.test(mig),
      noAlterColType: !/ALTER COLUMN\s+"?\w+"?\s+(SET DATA\s+)?TYPE/i.test(mig),
      noAlterType: !/ALTER TYPE/i.test(mig),
      sixTypes: types.length === 6,
      labels: enumOk,
    };
    chk("S1.1", Object.values(s11).every(Boolean), "exists · after H1.2 · additive · 6 enums exact", mig ? `${failedKeys(s11)} (types=${types.map(([t]) => t).join(",") || "0"} · H1.2 folders=${h12.join(",") || "none on this tree"})` : `∅ ${MIG_FILE}`);
  }
  // S1.2
  {
    const bad: string[] = [];
    for (const [t, cols] of Object.entries(TABLES)) {
      const tb = seg(mig, `CREATE TABLE "${t}" (`, ");", true);
      if (!tb) {
        bad.push(`${t}:∅`);
        continue;
      }
      for (const c of cols) if (!colDefOk(tb, c)) bad.push(`${t}.${c[0]}`);
      if (t === "HrLawTable" && /"(tenantId|systemId)"/.test(tb)) bad.push("HrLawTable:has tenantId/systemId (Q1 global)");
    }
    chk("S1.2", bad.length === 0, "4 tables as R1", bad.slice(0, 12).join(" ") + (bad.length > 12 ? ` … +${bad.length - 12}` : ""));
  }
  const alterOf = (t: string) => [...mig.matchAll(new RegExp(`ALTER TABLE "${t}" ((?:ADD COLUMN [^;]+))+;`, "g"))].map((m) => m[0]).join(" ");
  // S1.3
  {
    const a = alterOf("HrPayrollRun");
    const bad = RUN_NEW.filter((c) => !colDefOk(a, c)).map((c) => c[0]);
    const defaults = [...a.matchAll(/"(\w+)" [^,;]*DEFAULT/g)].map((m) => m[1]!);
    chk("S1.3", !!a && bad.length === 0 && srt(defaults) === "engineVersion", "7 columns · only engineVersion DEFAULT 1 NOT NULL", a ? `bad=${bad.join(",") || "0"} defaults=${defaults.join(",") || "0"}` : "∅ ALTER TABLE \"HrPayrollRun\"");
  }
  // S1.4
  {
    const a = alterOf("HrPayrollItem");
    const yt = colDefOk(a, ITEM_NEW[0]!);
    const lr = /"lawRowIds" TEXT\[\] NOT NULL DEFAULT ARRAY\[\]::TEXT\[\]/.test(a);
    chk("S1.4", yt && lr, "ytdJson JSONB · lawRowIds TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]", a ? `ytdJson=${yt} lawRowIds=${lr} (${short(a.match(/"lawRowIds"[^,;]*/)?.[0] ?? "∅", 80)})` : "∅ ALTER TABLE \"HrPayrollItem\"");
  }
  // S1.5
  {
    const a = alterOf("HrPayAdjustment");
    const ok = ADJ_NEW.every((c) => colDefOk(a, c)) && !/"source(Type|Ref)" [^,;]*DEFAULT/.test(a);
    chk("S1.5", ok, "sourceType \"HrPaySource\" · sourceRef TEXT · nullable · no DEFAULT", a ? short(a, 160) : "∅ ALTER TABLE \"HrPayAdjustment\"");
  }
  // S1.6 static part (db part joins later)
  {
    const L = loose(mig);
    staticNotes.s16 = {
      sourceUnique: /create unique index hrpayadjustment_tenant_source_key on hrpayadjustment\(tenantid, sourcetype, sourceref\) where \(?sourceref is not null\)?/.test(L),
      checkRefNeedsType: /check \(\(?sourceref is null or sourcetype is not null\)?\)/.test(L),
      checkNotBoth: /check \(\(?crmcommissionid is null or sourceref is null\)?\)/.test(L),
      lawActiveUnique: /create unique index \w+ on hrlawtable\(kind, effectivefrom\) where \(?status = 'active'(::\w+)?\)?/.test(L),
      lawSignoff: /check \(\(?status <> 'active'(::\w+)? or \(?approvedat is not null and \(?approvedbyid is not null or approvedbyname is not null\)?\)?\)?\)/.test(L),
      onboardingUnique: /create unique index \w+ on hronboardingtask\(employeeid, kind, templatekey\) where \(?templatekey is not null\)?/.test(L),
      minutes: /check \(\(?minutes >= 0 and minutes <= 1440\)?\)|check \(\(?minutes between 0 and 1440\)?\)/.test(L),
      score: /check \(\(?score is null or \(?score >= 1 and score <= 5\)?\)?\)|check \(\(?score >= 1 and score <= 5\)?\)|check \(\(?score between 1 and 5\)?\)/.test(L),
      engineVersion: /check \(\(?engineversion >= 1\)?\)/.test(L),
    };
  }
  // S1.7 schema
  {
    const files = listFiles(SCHEMA_DIR, (p) => p.endsWith(".prisma"));
    const all = files.map((f) => rd(f)).join("\n");
    const model = (n: string) => block(all, `model ${n} {`, "\n}");
    const field = (m: string, f: string, type: string) => new RegExp(`^\\s*${f}\\s+${type.replace(/[?[\]()]/g, "\\$&")}(\\s|$)`, "m").test(m);
    const bad: string[] = [];
    const want: Record<string, [string, string][]> = {
      HrLawTable: [["kind", "HrLawKind"], ["effectiveFrom", "DateTime"], ["json", "Json"], ["status", "HrLawStatus"], ["sourceKey", "String"], ["note", "String?"], ["approvedById", "String?"], ["approvedByName", "String?"], ["approvedAt", "DateTime?"], ["supersedesId", "String?"]],
      HrWorkEntry: [["tenantId", "String"], ["systemId", "String"], ["employeeId", "String"], ["date", "DateTime"], ["kind", "HrWorkEntryKind"], ["minutes", "Int"], ["periodKey", "String"], ["unitId", "String?"], ...WE_SOURCE_IDS.map((x) => [x, "String?"] as [string, string]), ["runId", "String?"], ["computedAt", "DateTime"], ["note", "String?"]],
      HrReviewNote: [["employeeId", "String"], ["kind", "HrReviewNoteKind"], ["title", "String"], ["body", "String"], ["periodLabel", "String?"], ["score", "Int?"], ["authorUserId", "String?"], ["visibleToEmployee", "Boolean"], ["acknowledgedAt", "DateTime?"], ["updatedAt", "DateTime"]],
      HrOnboardingTask: [["employeeId", "String"], ["kind", "HrOnboardingKind"], ["title", "String"], ["sortOrder", "Int"], ["dueDate", "DateTime?"], ["doneAt", "DateTime?"], ["doneById", "String?"], ["templateKey", "String?"], ["kanbanCardId", "String?"], ["updatedAt", "DateTime"]],
      HrPayrollRun: [["engineVersion", "Int"], ["accountSystemId", "String?"], ["createdById", "String?"], ["approvedById", "String?"], ["approvedAt", "DateTime?"], ["bankFileKey", "String?"], ["filingJson", "Json?"]],
      HrPayrollItem: [["ytdJson", "Json?"], ["lawRowIds", "String[]"]],
      HrPayAdjustment: [["sourceType", "HrPaySource?"], ["sourceRef", "String?"], ["crmCommissionId", "String?"]],
    };
    for (const [m, fs] of Object.entries(want)) {
      const b = model(m);
      if (!b) {
        bad.push(`${m}:∅`);
        continue;
      }
      for (const [f, t] of fs) if (!field(b, f, t)) bad.push(`${m}.${f}`);
    }
    const we = model("HrWorkEntry");
    if (we && !/@@unique\(\[employeeId, date, kind\]\)/.test(we)) bad.push("HrWorkEntry:@@unique");
    if (we && !/^\s*date\s+DateTime\s+@db\.Date/m.test(we)) bad.push("HrWorkEntry.date @db.Date");
    const law = model("HrLawTable");
    if (law && !/@@unique\(\[sourceKey\]\)|sourceKey\s+String\s+@unique/.test(law)) bad.push("HrLawTable:sourceKey unique");
    if (law && /^\s*(tenantId|systemId)\s/m.test(law)) bad.push("HrLawTable:tenant/system field (Q1)");
    const adj = model("HrPayAdjustment");
    if (/^\s*sourceRef\s+String\?\s+.*@unique/m.test(adj)) bad.push("sourceRef @unique");
    const payS = rd(PAY_SCHEMA);
    const crmBlock = seg(payS, "  // crm_v2_c (CRM C3.0/C3.3)", "  crmCommissionId String?\n", true);
    const crmSha = crmBlock ? sha(crmBlock) : "∅";
    staticNotes.crmBlockSha = crmSha;
    if (crmSha !== CRM_BLOCK_SHA) bad.push(`crmCommissionId block sha ${crmSha.slice(0, 12)}`);
    const rule = all.replace(/\s+/g, " ").includes("sourceType ?? (crmCommissionId ? CRM_COMMISSION : MANUAL)");
    if (!rule) bad.push("reader-rule comment");
    for (const [n] of Object.entries(ENUMS)) if (!block(all, `enum ${n} {`, "\n}")) bad.push(`enum ${n}`);
    chk("S1.7", bad.length === 0, "schema as R1 · crm block identical · rule comment", bad.slice(0, 12).join(" ") + (bad.length > 12 ? ` … +${bad.length - 12}` : ""));
  }
  // S1.8 registrations
  {
    const sc = stripComments(rd(CORE_SCOPE));
    const env = rd(HQC_ENV);
    const tables = block(env, "export const HR_TABLES = {", "\n} as const") || block(env, "export const HR_TABLES = {", "\n};");
    const row = (k: string) => tables.match(new RegExp(`^\\s*${k}:\\s*\\{[^\\n]*\\}`, "m"))?.[0] ?? "";
    const s18 = {
      workEntry: /\bHrWorkEntry:\s*sys\(\)/.test(sc),
      reviewNote: /\bHrReviewNote:\s*sys\(\)/.test(sc),
      onboarding: /\bHrOnboardingTask:\s*sys\(\)/.test(sc),
      lawGlobal: /\bHrLawTable:\s*g\(\s*"[^"]+"\s*\)/.test(sc),
      envWorkEntry: /model:\s*"HrWorkEntry"/.test(row("hrWorkEntry")) && /tenantId:\s*true/.test(row("hrWorkEntry")),
      envReviewNote: /model:\s*"HrReviewNote"/.test(row("hrReviewNote")) && /tenantId:\s*true/.test(row("hrReviewNote")),
      envOnboarding: /model:\s*"HrOnboardingTask"/.test(row("hrOnboardingTask")) && /tenantId:\s*true/.test(row("hrOnboardingTask")),
      envLaw: /model:\s*"HrLawTable"/.test(row("hrLawTable")) && /tenantId:\s*false/.test(row("hrLawTable")),
    };
    chk("S1.8", Object.values(s18).every(Boolean), "4 scope.ts registrations · 4 HR_TABLES rows", failedKeys(s18));
    // S7.5 static part
    const order = block(env, "export const HR_DELETE_ORDER = [", "] as const");
    const pos = (k: string) => order.search(new RegExp(`"${k}"`));
    const emp = pos("hrEmployee");
    staticNotes.s75 = { three: ["hrWorkEntry", "hrReviewNote", "hrOnboardingTask"].every((k) => pos(k) >= 0 && emp > 0 && pos(k) < emp), noLaw: pos("hrLawTable") < 0 };
  }
  // S2.8 seed script statics
  {
    const s = rd(SEED_LAW);
    const code = stripComments(s);
    const rowsBlock = seg(code, "LAW_V1_ROWS", "];", true);
    staticNotes.s28 = {
      exists: !!s,
      exportsRows: /export const LAW_V1_ROWS\b/.test(code),
      exportsDigest: /export const LAW_V1_DIGEST\b/.test(code),
      exportsVerify: /export (async )?function verifyAgainstFrozen\b|export const verifyAgainstFrozen\b/.test(code),
      onConflict: /ON CONFLICT \(\s*"sourceKey"\s*\) DO NOTHING/i.test(code),
      noActiveWrite: !/(status\s*[:=]\s*["'`]ACTIVE|'ACTIVE'|"ACTIVE"|`ACTIVE`)/.test(code),
      noUpdateDelete: !/hrLawTable\.(update|updateMany|delete|deleteMany|upsert)\b|\bUPDATE\s+"HrLawTable"|\bDELETE\s+FROM\s+"HrLawTable"/i.test(code),
      noFloatInRows: !!rowsBlock && !/\b\d+\.\d+\b/.test(rowsBlock),
    };
  }
  // S5.5 FREEZE + payroll.ts vs base
  {
    const rsha = sha(rd(RULES_FILE));
    const payDiff = changedVsBase([PAY_FILE, RULES_FILE]);
    chk("S5.5", rsha === RULES_SHA && payDiff === "unchanged", `${RULES_SHA.slice(0, 16)} · unchanged vs ${baseRef().slice(0, 8)}`, `${rsha.slice(0, 16)} · ${payDiff}`);
  }
  // S5.6 h0.6 S8.4 hashes + the block itself
  {
    const pay = rd(PAY_FILE);
    const r = sha(rd(RULES_FILE)) === RULES_SHA;
    const ci = sha(seg(pay, "function computeItem(", "\n}\n", true)) === COMPUTE_ITEM_SHA;
    const mp = sha(seg(pay, "// ── จ่ายแล้ว (APPROVED→PAID) ──", "// ◂ CRM C3.3", true)) === MARKPAID_BLOCK_SHA;
    const h06 = rd(H06_ORACLE);
    const i = h06.indexOf("  // S8.4\n");
    const blk = i >= 0 ? h06.slice(i, h06.indexOf("\n  }\n", i) + 4) : "";
    const bsha = blk ? sha(blk) : "∅";
    chk("S5.6", r && ci && mp && bsha === H06_S84_BLOCK_SHA, "rules · computeItem · markPaid · S8.4 block = base", `rules=${r} computeItem=${ci} markPaid=${mp} s84block=${bsha.slice(0, 12)}`);
  }
  // S5.7
  {
    const d = changedVsBase([CRM_FILE, CONSUMERS, ACCOUNT_DIR]);
    chk("S5.7", d === "unchanged", `unchanged vs ${baseRef().slice(0, 8)}`, d);
  }
  // S6.1 no new reader of the new fields/tables (count vs base per file)
  {
    const files = [
      ...listFiles("src/lib/modules/hr", (p) => /\.(ts|tsx)$/.test(p)),
      ...listFiles("src/app", (p) => /\.(ts|tsx)$/.test(p) && /\/(hr|payroll)\//.test(p)),
      ...listFiles("src/lib/ai", (p) => /\.(ts|tsx)$/.test(p)),
      CONSUMERS,
    ].filter((p) => existsSync(join(ROOT, p)));
    const cnt = (s: string) => (stripComments(s).match(S61_RE) ?? []).length;
    const hits = files.map((f) => [f, cnt(rd(f)) - cnt(atBase(f))] as const).filter(([, n]) => n > 0).map(([f, n]) => `${f}+${n}`);
    chk("S6.1", files.length > 20 && hits.length === 0, "0 new reads", `${hits.join(",") || "0"} of ${files.length} files (base ${baseRef().slice(0, 8)})`);
  }
  // S6.2 static part
  {
    const fit = rd(FITNESS_HR);
    const sens = [...block(fit, "export const SENSITIVE_FIELDS = [", "] as const").matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]!);
    staticNotes.f161Missing = ["ytdJson", "filingJson", "bankFileKey"].filter((k) => !sens.includes(k));
  }
  // S6.3 whole-row readers stay server-side with named fields
  {
    const pay = rd(PAY_FILE);
    const bad: string[] = [];
    for (const fn of ["decideAdjustment", "cancelAdjustment", "approveRun"]) {
      const b = stripComments(fnBody(pay, fn));
      if (!b) bad.push(`${fn}:∅`);
      else if (/\breturn\s+(row|run|item|adj)\s*[;)]|\.\.\.\s*(row|run|item|adj)\b|JSON\.stringify\(\s*(row|run|item|adj)\b/.test(b)) bad.push(`${fn}:forwards row`);
    }
    const srcFiles = listFiles("src", (p) => /\.(ts|tsx)$/.test(p));
    // a caller = calls name( AND imports it from HR (payroll / privacy / the hr facade) — CRM/kanban have their own listRuns
    const importsHr = (src: string, mod: "payroll" | "privacy") => new RegExp(`from\\s+["'](\\./${mod}|@/lib/modules/hr/${mod}|@/lib/modules/hr|\\.\\./hr/${mod})["']`).test(src);
    const callers = (name: string) =>
      srcFiles.filter((f) => {
        if (f === PAY_FILE || (name === "loadPayslipForViewer" && f === PRIVACY)) return false;
        const src = stripComments(rd(f));
        return new RegExp(`\\b${name}\\(`).test(src) && importsHr(src, name === "loadPayslipForViewer" ? "privacy" : "payroll");
      });
    const isClient = (f: string) => /^\s*["']use (client|server)["']/m.test(rd(f).slice(0, 400));
    const allowed: Record<string, string[]> = { listRuns: [PAY_UI], listAdjustments: [PAY_UI], payslipData: [PRIVACY], loadPayslipForViewer: [SLIP_PAGE] };
    for (const [name, ok] of Object.entries(allowed)) {
      const cs = callers(name).filter((f) => !f.endsWith("/hr/index.ts"));
      const extra = cs.filter((f) => !ok.includes(f));
      if (extra.length) bad.push(`${name} callers +${extra.join(",")}`);
      for (const f of cs) if (isClient(f)) bad.push(`${name}:${f} is use client/server`);
    }
    const ui = stripComments(rd(PAY_UI));
    if (/=\{\s*(r|a|run|row|adj|item|it)\s*\}|\{\s*\.\.\.\s*(r|a|run|row|adj|item|it)\s*\}|JSON\.stringify\(\s*(r|a|run|runs|row|adj|adjustments|item|items)\b/.test(ui)) bad.push("payroll-ui forwards a row");
    const slip = stripComments(rd(SLIP_PAGE));
    if (!slip || /=\{\s*(run|item|slip|employee)\s*\}|\{\s*\.\.\.\s*(run|item|slip|employee)\s*\}|JSON\.stringify\(\s*(run|item|slip)\b/.test(slip)) bad.push("slip page forwards a row");
    const pv = stripComments(fnBody(rd(PRIVACY), "loadPayslipForViewer"));
    if (!pv || !/return \{ run, item, employee \};/.test(pv)) bad.push("loadPayslipForViewer shape");
    if (stripComments(rd(PAY_ACTIONS)).match(/\b(listRuns|listAdjustments|payslipData)\(/)) bad.push("payroll-actions calls a whole-row reader");
    chk("S6.3", bad.length === 0, "server-only · named fields", bad.join(" · ") || "ok");
  }
  // S6.5 changed files ⊆ allowed
  {
    let files: string[] = [];
    try {
      files = [...git(["diff", "--name-only", baseRef()]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard"]).split("\n")].filter(Boolean);
    } catch (e) {
      files = [`git:${errText(e).slice(0, 60)}`];
    }
    const ok = (f: string) =>
      f.startsWith(`${MIG_DIR}/`) || /^prisma\/schema\/[\w.-]+\.prisma$/.test(f) || [SEED_LAW, CORE_SCOPE, HQC_ENV, FITNESS_HR, SEED_FILE, EXPECTED, THIS_FILE].includes(f) || f.startsWith("ledger/");
    const extra = [...new Set(files)].filter((f) => !ok(f));
    chk("S6.5", extra.length === 0, "⊆ R1/R3/R8/R9 files + oracle + ledger", extra.slice(0, 10).join(",") || `ok (${new Set(files).size} files vs ${baseRef().slice(0, 8)})`);
  }
  // S6.6 outbox event types
  {
    const keys = (s: string) => new Set([...stripComments(s).matchAll(/^\s*"([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)"\s*:/gm)].map((m) => m[1]!));
    const now = keys(rd(CONSUMERS));
    const was = keys(atBase(CONSUMERS));
    let added = -1;
    try {
      added = git(["diff", "-U0", baseRef(), "--", "src"]).split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++") && /emitOutbox\(/.test(l)).length;
    } catch {
      added = -1;
    }
    chk("S6.6", now.size > 0 && srt(now) === srt(was) && added === 0, "consumer keys = base · 0 added emitOutbox(", `keys ${now.size} vs base ${was.size}${srt(now) === srt(was) ? "" : ` diff=${[...now].filter((k) => !was.has(k)).join(",")}`} · added emitOutbox=${added}`);
  }
  // X7.1 no today-dependence (date literals in our own code)
  {
    const code = stripComments(rd(THIS_FILE)).replace(/D\("[^\n]*\n/g, "");
    const lits = [...code.matchAll(/["'`](\d{4})-(\d{2})(?:-(\d{2}))?/g)].map((m) => m[0].slice(1));
    const early = lits.filter((l) => Number(l.slice(0, 4)) < 2030 && !["1970-01-01", "2028-02-29"].includes(l) && !/^20261205/.test(l));
    chk("X7.1", lits.length > 5 && early.length === 0, "0 literals < 2030 (sentinel/leap excepted)", `literals=${lits.length} early=${[...new Set(early)].slice(0, 6).join(",") || "0"}`);
  }
}

// ═════════════════════════ SKIP guard (static — before any DB connection) ═════════════════════════
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, MIG_FILE)) && !existsSync(join(ROOT, SEED_LAW))) {
  skipReasons.push(`H1.3 not built: ${MIG_DIR} absent · ${SEED_LAW} absent`);
}
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: H1.3 not built`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], findings: [], skipped: true, reason: skipReasons, registered: CHECKS.length })}`);
  process.exit(0);
}

// ═════════════════════════ env (QC4 only) ═════════════════════════
process.env.QC_ENV_FILE ??= ".env.qc";
if (process.env.QC_ENV_FILE === ".env") {
  console.error(`🔴 ${SUITE}: QC_ENV_FILE=.env is production — refused`);
  process.exit(4);
}
const { loadLegacyQcEnv } = (await import("./qc-env-guard.mjs" as string)) as Any;
loadLegacyQcEnv(SUITE);
{
  const bad = [
    ["DATABASE_URL", process.env.DATABASE_URL ?? ""],
    ["DIRECT_URL", process.env.DIRECT_URL ?? ""],
  ].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u!.includes(QC4_HOST_MARK));
  if (bad.length) {
    console.error(`🔴 STOP ${SUITE}: writes allowed on QC4 (${QC4_HOST_MARK}) only — ${bad.map(([n]) => n).join(", ")} is not (nothing written)`);
    process.exit(4);
  }
  let host = "?";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    /* host only — never the URL */
  }
  console.log(`[${SUITE}] DB host = ${host} (${host.includes(QC4_HOST_MARK) ? "QC4 ✓" : "not QC4"}) · git base ${baseRef().slice(0, 8)}`);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — running although: ${skipReasons.join(" · ")} (expect RED for the right reason, no crash)`);

const { prisma, tenantDb } = (await import("@/lib/core/db")) as Any;
const P = prisma as Any;
const sys = (await import("@/lib/modules/system/service")) as Any;
const pay = (await import("@/lib/modules/hr/payroll")) as Any;
const privacy = (await import("@/lib/modules/hr/privacy" as string)) as Any;
const digestMod = (await import("@/lib/modules/hr/payroll-digest" as string)) as Any;
const GL = (await import("@/lib/modules/account/gl" as string)) as Any;
const OBX = (await import("@/lib/outbox-consumers" as string).catch(() => ({}))) as Any;
const CONS: Any = OBX.consumers ?? {};
const hqcEnv = (await import("./hr-qc-env.mjs" as string)) as Any;

const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const SLUG = `${SLUG_PREFIX}${stamp}`;
const LAW_PREFIX = `qc-h1.3-${stamp}`;
const OWNER_UID = `qc-h13-owner-${stamp}`;
const ACTOR = { userId: OWNER_UID, isOwner: true };
const tenants: string[] = [];
const users: string[] = [];
const FIX_TS = new Date("2030-01-01T00:00:00Z");

// ── schema probes (raw only · tables may appear mid-run: the H1.2 builder migrates QC4 in parallel ⇒ probe by name, cache per call site) ──
async function colsOf(table: string): Promise<Map<string, string>> {
  const r = (await P.$queryRawUnsafe(
    `SELECT a.attname AS n, format_type(a.atttypid, a.atttypmod) AS t FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace s ON s.oid = c.relnamespace
      WHERE c.relname = $1 AND s.nspname = current_schema() AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`,
    table,
  )) as Any[];
  return new Map(r.map((x) => [x.n as string, x.t as string]));
}
const colCache = new Map<string, Map<string, string>>();
async function colsCached(table: string): Promise<Map<string, string>> {
  const c = colCache.get(table);
  if (c && c.size > 0) return c;
  const m = await colsOf(table);
  colCache.set(table, m);
  return m;
}
const tableExists = async (t: string) => (await colsCached(t)).size > 0;
let seq = 0;
const newId = (p = "r") => `qch13${p}${stamp}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** INSERT with every value cast to its column type · throws (caller maps the PG code) · missing table/column ⇒ Error ∅… */
async function rawInsert(table: string, data: Record<string, unknown>, client: Any = P): Promise<string> {
  const cols = await colsCached(table);
  if (cols.size === 0) throw new Error(`∅table ${table}`);
  const row: Record<string, unknown> = { id: newId(table.slice(2, 5).toLowerCase()), ...data };
  if (cols.has("updatedAt") && !("updatedAt" in row)) row.updatedAt = FIX_TS;
  const keys = Object.keys(row);
  const missing = keys.filter((k) => !cols.has(k));
  if (missing.length) throw new Error(`∅col ${table}.${missing.join(",")}`);
  const sql = `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(",")}) VALUES (${keys.map((k, i) => `$${i + 1}::${cols.get(k)}`).join(",")})`;
  await client.$executeRawUnsafe(sql, ...keys.map((k) => (row[k] !== null && typeof row[k] === "object" && !(row[k] instanceof Date) && !Array.isArray(row[k]) ? JSON.stringify(row[k]) : row[k])));
  return row.id as string;
}
async function rawRows(sql: string, ...params: unknown[]): Promise<Any[] | null> {
  try {
    return (await P.$queryRawUnsafe(sql, ...params)) as Any[];
  } catch {
    return null;
  }
}
async function rawCount(table: string, where: string, ...params: unknown[]): Promise<number> {
  if (!(await tableExists(table))) return -1;
  const r = await rawRows(`SELECT count(*)::int AS n FROM "${table}" WHERE ${where}`, ...params);
  return r ? Number(r[0]?.n ?? -1) : -2;
}
/** PG error code of a failed statement (23505 unique · 23514 check · 23503 FK · other) */
function pgCode(e: unknown): string {
  const ee = e as Any;
  let meta = "";
  try {
    meta = JSON.stringify(ee?.meta ?? {});
  } catch {
    /* ignore */
  }
  const s = [ee?.code, ee?.meta?.code, ee?.cause?.code, ee?.cause?.originalCode, e instanceof Error ? e.message : String(e), meta].join(" ");
  const m = s.match(/\b(23505|23001|23503|23502|23514|22P02|22007|22008|42P01|42703|42883|42704)\b/);
  if (m) return m[1]!;
  if (/P2002|unique constraint|duplicate key/i.test(s)) return "23505";
  if (/check constraint/i.test(s)) return "23514";
  if (/P2003|foreign key/i.test(s)) return "23503";
  if (/∅table|∅col/.test(s)) return s.match(/∅(table|col)[^ ]*/)?.[0] ?? "∅";
  return `other:${short(s, 60)}`;
}
const tryInsert = async (table: string, data: Record<string, unknown>, client: Any = P) => {
  try {
    await rawInsert(table, data, client);
    return "ok";
  } catch (e) {
    return pgCode(e);
  }
};
/** run fn inside a transaction that is always rolled back · returns fn's tag or the PG code of the failing statement */
async function rolledBack(fn: (tx: Any) => Promise<string>): Promise<string> {
  let tag = "";
  try {
    await P.$transaction(async (tx: Any) => {
      tag = await fn(tx);
      throw new Error("__ROLLBACK__");
    });
  } catch (e) {
    if (!(e instanceof Error && e.message === "__ROLLBACK__")) return pgCode(e);
  }
  return tag;
}
const race = async (n: number, f: (i: number) => Promise<string>) => Promise.all(Array.from({ length: n }, (_, i) => f(i)));
const tally = (rs: string[]) => {
  const m: Record<string, number> = {};
  for (const r of rs) m[r] = (m[r] ?? 0) + 1;
  return m;
};
async function rounds(mk: (round: number) => Promise<{ rs: string[]; rows: number; extra?: boolean }>, expectLoser = "23505") {
  const out: string[] = [];
  let ok = true;
  for (let r = 0; r < 3; r++) {
    const { rs, rows, extra } = await mk(r);
    const t = tally(rs);
    const good = (t.ok ?? 0) === 1 && (t[expectLoser] ?? 0) === 9 && rows === 1 && extra !== false;
    if (!good) ok = false;
    out.push(`r${r + 1}:${short(t, 70)}/rows=${rows}${extra === false ? "/extra✗" : ""}`);
  }
  return { ok, detail: out.join(" ") };
}

function spawnTsx(args: string[], env: Record<string, string | undefined> = process.env, timeoutMs = 240_000): Promise<{ code: number; out: string }> {
  return new Promise((res) => {
    const c = spawn("pnpm", ["exec", "tsx", ...args], { env: env as NodeJS.ProcessEnv, cwd: ROOT });
    let o = "";
    c.stdout.on("data", (d) => (o += String(d)));
    c.stderr.on("data", (d) => (o += String(d)));
    const t = setTimeout(() => c.kill("SIGTERM"), timeoutMs); // our own child only
    c.on("error", (e) => {
      clearTimeout(t);
      res({ code: -1, out: errText(e) });
    });
    c.on("close", (code) => {
      clearTimeout(t);
      res({ code: code ?? -1, out: o });
    });
  });
}
const runSeed = (args: string[]) => (existsSync(join(ROOT, SEED_LAW)) ? spawnTsx([SEED_LAW, ...args]) : Promise.resolve({ code: -1, out: `∅ ${SEED_LAW}` }));
const outLine = (o: string) => short(o.split("\n").filter((l) => /created|unchanged|mismatch|∅|Error|error/i.test(l)).slice(-2).join(" | ") || o.split("\n").filter(Boolean).slice(-1)[0] || "", 140);
const counts = (o: string) => {
  const m = o.match(/created\s+(\d+)\s*·\s*unchanged\s+(\d+)\s*·\s*mismatched\s+(\d+)/);
  return m ? { created: Number(m[1]), unchanged: Number(m[2]), mismatched: Number(m[3]) } : null;
};
async function lawRowsOf(prefix: string): Promise<Any[] | null> {
  if (!(await tableExists("HrLawTable"))) return null;
  return rawRows(
    `SELECT id, "sourceKey", kind::text AS kind, "effectiveFrom"::text AS "effectiveFrom", json, status::text AS status, "approvedAt", "approvedById", "approvedByName", "createdAt" FROM "HrLawTable" WHERE "sourceKey" LIKE $1 ORDER BY array_position(ARRAY['SSO','TAX_BRACKET','DEDUCTION','OT','MIN_WAGE'], kind::text), "sourceKey"`,
    `${prefix}:%`,
  );
}

type Who = { id: string; tenantId: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, boolean> };
async function mkUser(tenantId: string, tag: string, role: Who["role"], unitAccess: string[], permissions: Record<string, boolean>): Promise<Who> {
  const u = await P.user.create({ data: { email: `${SLUG}-${tag}@qc.invalid`, name: `QC H1.3 ${tag}` } });
  users.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions, acceptedAt: new Date() } });
  return { id: u.id, tenantId, role, unitAccess, permissions };
}
const vOf = (w: Who) => ({ role: w.role, unitAccess: w.unitAccess, permissions: w.permissions, userId: w.id });
async function mkEmp(tenantId: string, systemId: string, name: string, o: { code?: string; startDate?: string; linkedUserId?: string } = {}): Promise<string> {
  const e = await P.hrEmployee.create({ data: { tenantId, systemId, name, code: o.code ?? null, linkedUserId: o.linkedUserId ?? null, startDate: o.startDate ? new Date(`${o.startDate}T00:00:00Z`) : null } });
  return e.id as string;
}
async function newTenant(suffix: string, name: string): Promise<string> {
  const t = await P.tenant.create({ data: { name, slug: `${SLUG}${suffix}` } });
  tenants.push(t.id);
  return t.id as string;
}
const GROUP_CRASHES: string[] = [];
const group = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (e) {
    const m = `${name}: ${errText(e)}`;
    GROUP_CRASHES.push(m);
    console.log(`💥 group ${m}`);
  }
};

async function runDb(): Promise<void> {
  const probe: string[] = [];
  for (const t of [...NEW_TABLES, "HrShift", "HrRosterEntry", "HrOtRequest", "HrHoliday"]) probe.push(`${t}=${await tableExists(t)}`);
  probe.push(`HrPayAdjustment.sourceType=${(await colsCached("HrPayAdjustment")).has("sourceType")}`, `HrPayrollRun.engineVersion=${(await colsCached("HrPayrollRun")).has("engineVersion")}`);
  console.log(`[${SUITE}] schema probe: ${probe.join(" ")}`);

  // ── setup ──
  const T = await newTenant("", "QC HR H1.3 เงินและกฎหมาย");
  const T2 = await newTenant("-other", "QC HR H1.3 ร้านอื่น");
  const sH = (await sys.createSystem(T, "HR", "HR หลัก")).id as string;
  await sleep(20);
  const sH2 = (await sys.createSystem(T, "HR", "HR ระบบสอง")).id as string;
  await sleep(20);
  const sM = (await sys.createSystem(T, "HR", "ทีมเงินเดือนรายเดือน")).id as string;
  await sleep(20);
  const sR = (await sys.createSystem(T, "HR", "HR กลับรายการ")).id as string;
  const ACC = (await sys.createSystem(T, "ACCOUNT", "บัญชี")).id as string;
  await GL.ensureAccounting({ tenantId: T, systemId: ACC });
  const CRM = (await sys.createSystem(T, "CRM", "CRM คอมมิชชัน")).id as string;
  await P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify({ uiVersion: 2, bridgesEnabled: true, commission: { basis: "PAID", approvalRequired: false, payrollLink: true } }),
    CRM,
  );
  const sO = (await sys.createSystem(T2, "HR", "HR ร้านอื่น")).id as string;
  const ctxH = { tenantId: T, systemId: sH };
  const ctxH2 = { tenantId: T, systemId: sH2 };
  const ctxR = { tenantId: T, systemId: sR };
  const ctxO = { tenantId: T2, systemId: sO };
  const e1 = await mkEmp(T, sH, `พนง-หนึ่ง ${stamp}`);
  const e2 = await mkEmp(T, sH, `พนง-สอง ${stamp}`);
  const e3 = await mkEmp(T, sH2, `พนง-ระบบสอง ${stamp}`);
  const eO = await mkEmp(T2, sO, `พนง-ร้านอื่น ${stamp}`);
  await pay.setSalaryProfile(ctxH, { employeeId: e1, baseSalarySatang: B(20_000), ssoEligible: true });
  await pay.setSalaryProfile(ctxO, { employeeId: eO, baseSalarySatang: B(18_000), ssoEligible: true });

  // ═══ S1 DB catalogue ═══
  await group("S1-db", async () => {
    console.log("── [S1] QC4 catalogue ──");
    const info = (await P.$queryRawUnsafe(
      `SELECT table_name AS t, column_name AS c, data_type AS dt, udt_name AS udt, is_nullable AS n, column_default AS d FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
      [...NEW_TABLES, "HrPayrollRun", "HrPayrollItem", "HrPayAdjustment"],
    )) as Any[];
    const okDb = (t: string, [c, kind, nullable, def]: Col) => {
      const r = info.find((x) => x.t === t && x.c === c);
      if (!r || (r.n === "YES") !== nullable) return false;
      const d = String(r.d ?? "");
      if (def === "CURRENT_TIMESTAMP" ? !/CURRENT_TIMESTAMP/i.test(d) : def === "ARRAY" ? !/ARRAY\[\]/i.test(d) : def ? !new RegExp(`^'?${def}'?(::|$)`).test(d) : false) return false;
      if (kind === "text") return r.dt === "text";
      if (kind === "int") return r.dt === "integer";
      if (kind === "bool") return r.dt === "boolean";
      if (kind === "date") return r.dt === "date";
      if (kind === "ts") return r.dt === "timestamp without time zone";
      if (kind === "json") return r.dt === "jsonb";
      if (kind === "textarr") return r.dt === "ARRAY" && r.udt === "_text";
      return r.dt === "USER-DEFINED" && r.udt === kind.slice(2);
    };
    const bad: string[] = [];
    for (const [t, cols] of Object.entries(TABLES)) {
      if (!info.some((x) => x.t === t)) {
        bad.push(`${t}:∅`);
        continue;
      }
      for (const c of cols) if (!okDb(t, c)) bad.push(`${t}.${c[0]}`);
    }
    if (info.some((x) => x.t === "HrLawTable" && (x.c === "tenantId" || x.c === "systemId"))) bad.push("HrLawTable:tenant/system column");
    for (const [t, cols] of [["HrPayrollRun", RUN_NEW], ["HrPayrollItem", ITEM_NEW], ["HrPayAdjustment", ADJ_NEW]] as const) for (const c of cols) if (!okDb(t, c)) bad.push(`${t}.${c[0]}`);
    for (const c of ADJ_NEW) if (info.some((x) => x.t === "HrPayAdjustment" && x.c === c[0] && x.d !== null)) bad.push(`HrPayAdjustment.${c[0]}:has DEFAULT`);
    const enumOf = async (name: string) => ((await P.$queryRawUnsafe(`SELECT e.enumlabel AS l FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = $1 ORDER BY e.enumsortorder`, name)) as Any[]).map((r) => r.l as string).join(",");
    for (const [n, vals] of Object.entries(ENUMS)) if ((await enumOf(n)) !== vals.join(",")) bad.push(`enum ${n}`);
    chk("S1.9", bad.length === 0, "4 tables + 11 columns + 6 enums exact", bad.slice(0, 14).join(" ") + (bad.length > 14 ? ` … +${bad.length - 14}` : ""));
    const idx = async (name: string) => String(((await P.$queryRawUnsafe(`SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = $1`, name)) as Any[])[0]?.indexdef ?? "∅");
    const iCrm = await idx("HrPayAdjustment_crmCommissionId_key");
    const iLive = await idx("HrPayrollRun_systemId_periodKey_live_key");
    console.log(`  ℹ indexdef crm = ${iCrm}`);
    console.log(`  ℹ indexdef live = ${iLive}`);
    chk("S1.10", iCrm === FROZEN_IDX_CRM && iLive === FROZEN_IDX_LIVE, "2 indexdefs = base", `crm=${iCrm === FROZEN_IDX_CRM ? "=" : short(iCrm, 90)} live=${iLive === FROZEN_IDX_LIVE ? "=" : short(iLive, 90)}`);
    const typeOf = (t: string, c: string) => info.find((x) => x.t === t && x.c === c);
    const baseTypes = new Map<string, string>();
    for (const [t, cols] of [["HrPayAdjustment", ADJ_BASE], ["HrPayrollRun", RUN_BASE], ["HrPayrollItem", ITEM_BASE]] as const) for (const c of cols) baseTypes.set(`${t}.${c}`, "");
    const miss = [...baseTypes.keys()].filter((k) => {
      const [t, c] = k.split(".");
      return !typeOf(t!, c!);
    });
    // types of the base columns as of 13a0601b (int/text/timestamp/enum/jsonb/double)
    const typeSig = [...baseTypes.keys()].map((k) => {
      const [t, c] = k.split(".");
      const r = typeOf(t!, c!);
      return `${k}:${r ? (r.dt === "USER-DEFINED" ? r.udt : r.dt) : "∅"}:${r?.n ?? "∅"}`;
    });
    const sig = sha(typeSig.join("|"));
    staticNotes.baseColSig = sig;
    chk("S1.11", miss.length === 0 && baseTypes.size === 49 && sig === FROZEN_BASE_COL_SIG, "49 base columns · types/nullability = base", `missing=${miss.join(",") || "0"} sig=${sig === FROZEN_BASE_COL_SIG ? "=" : sig.slice(0, 16)}`);
    const fk = (await P.$queryRawUnsafe(
      `SELECT cl.relname::text AS t, a.attname::text AS c, rf.relname::text AS ref, c.confdeltype::text AS d FROM pg_constraint c
         JOIN pg_class cl ON cl.oid = c.conrelid JOIN pg_class rf ON rf.oid = c.confrelid
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f' AND cl.relname = ANY($1::text[])`,
      [...NEW_TABLES, "HrPayAdjustment"],
    )) as Any[];
    const badFk: string[] = [];
    for (const t of ["HrWorkEntry", "HrReviewNote", "HrOnboardingTask"]) if (!fk.some((r) => r.t === t && r.c === "employeeId" && r.ref === "HrEmployee" && r.d === "c")) badFk.push(`${t}.employeeId:${fk.find((r) => r.t === t && r.c === "employeeId")?.d ?? "∅"}`);
    for (const r of fk) if (r.t === "HrWorkEntry" && WE_SOURCE_IDS.includes(r.c)) badFk.push(`HrWorkEntry.${r.c}→${r.ref}`);
    for (const r of fk) if (r.t === "HrPayAdjustment") badFk.push(`HrPayAdjustment.${r.c}→${r.ref}`);
    chk("S1.12", badFk.length === 0, "3 CASCADE FKs · no source-id FK · no adjustment FK", badFk.join(" ") || "all");
    // S1.6 db part (rolled back)
    const s16 = staticNotes.s16 as Record<string, boolean>;
    const scoreBad = await rolledBack(async (tx) => {
      const r0 = await tryInsert("HrReviewNote", { tenantId: T, systemId: sH, employeeId: e1, kind: "NOTE", title: "ทดสอบ", body: "บันทึก", score: 0 }, tx);
      return r0;
    });
    const scoreBad6 = await rolledBack(async (tx) => tryInsert("HrReviewNote", { tenantId: T, systemId: sH, employeeId: e1, kind: "NOTE", title: "ทดสอบ", body: "บันทึก", score: 6 }, tx));
    const scoreOk = await rolledBack(async (tx) => tryInsert("HrReviewNote", { tenantId: T, systemId: sH, employeeId: e1, kind: "NOTE", title: "ทดสอบ", body: "บันทึก", score: 3 }, tx));
    const evBad = (await colsCached("HrPayrollRun")).has("engineVersion")
      ? await rolledBack(async (tx) => {
          const id = await rawInsert("HrPayrollRun", { tenantId: T, systemId: sH, periodKey: "2039-01", payDate: new Date("2039-01-25T03:00:00Z") }, tx);
          await tx.$executeRawUnsafe(`UPDATE "HrPayrollRun" SET "engineVersion" = 0 WHERE id = $1`, id);
          return "ok";
        })
      : "∅col";
    const db16 = scoreBad === "23514" && scoreBad6 === "23514" && scoreOk === "ok" && evBad === "23514";
    chk("S1.6", Object.values(s16).every(Boolean) && db16, "7 raw objects present · score/engineVersion CHECKs enforced", `static: ${failedKeys(s16)} · db: score0=${scoreBad} score6=${scoreBad6} score3=${scoreOk} engineVersion0=${evBad}`);
  });

  // ═══ S2 law seed = frozen constants ═══
  await group("S2", async () => {
    console.log("── [S2] law seed = frozen constants ──");
    const derived = await deriveRowsFromRules();
    const derivedDigest = derived.rows ? lawDigest(derived.rows) : "∅";
    const derivedEqBrief = !!derived.rows && stable(derived.rows) === stable(BRIEF_ROWS);
    console.log(`  ℹ oracle AST derivation: ${derived.note} · equals brief R3 rows=${derivedEqBrief} · digest=${derivedDigest}${derivedDigest === FROZEN_LAW_DIGEST ? " (= FROZEN)" : " (≠ FROZEN)"}`);
    // export probe (child process — import must not run main)
    let exp: Any = null;
    let expNote = "";
    if (existsSync(join(ROOT, SEED_LAW))) {
      const code =
        `import(${JSON.stringify(`file://${join(ROOT, SEED_LAW)}`)}).then(async (m0) => { const m = m0 && m0.LAW_V1_ROWS === undefined && m0.default ? m0.default : m0; let v = null, ve = ""; try { v = typeof m.verifyAgainstFrozen === "function" ? await m.verifyAgainstFrozen() : "∅fn"; } catch (e) { ve = String((e && e.message) || e); } ` +
        `console.log("H13EXPORT " + JSON.stringify({ rows: m.LAW_V1_ROWS ?? null, digest: m.LAW_V1_DIGEST ?? null, verify: v, verifyErr: ve }, (k, x) => (typeof x === "number" && !Number.isFinite(x) ? "∞" : x))); process.exit(0); })` +
        `.catch((e) => { console.log("H13EXPORT " + JSON.stringify({ importErr: String((e && e.message) || e) })); process.exit(0); });`;
      const r = await spawnTsx(["-e", code], process.env, 180_000);
      const line = r.out.split("\n").find((l) => l.startsWith("H13EXPORT "));
      try {
        exp = line ? JSON.parse(line.slice(10)) : null;
      } catch {
        exp = null;
      }
      expNote = exp ? (exp.importErr ? `import error ${short(exp.importErr, 80)}` : "loaded") : `no H13EXPORT line (exit ${r.code}: ${short(r.out, 100)})`;
    } else expNote = `∅ ${SEED_LAW}`;
    const scriptRows: Any[] | null = Array.isArray(exp?.rows) ? exp.rows : null;
    const normRows = scriptRows ? scriptRows.map((r: Any) => ({ kind: r?.kind, effectiveFrom: dayOf(r?.effectiveFrom), json: r?.json })) : null;
    const verifyOk = exp?.verify === true || exp?.verify?.ok === true;
    chk("S2.2", derivedEqBrief && derivedDigest === FROZEN_LAW_DIGEST && !!normRows && stable(normRows) === stable(BRIEF_ROWS) && verifyOk, "AST = brief = LAW_V1_ROWS · verifyAgainstFrozen ok",
      `AST=brief:${derivedEqBrief} · script: ${expNote}${normRows ? ` rows=brief:${stable(normRows) === stable(BRIEF_ROWS)}` : ""} · verify=${short(exp?.verify ?? exp?.verifyErr ?? "∅", 60)}`);
    // S2.3 behavioural
    const pc = derived.rows ? await behaviour(derived.rows) : { n: 0, mism: -1, first: "no AST rows" };
    console.log(`  ℹ positive control (evaluator over the AST rows): ${pc.n} vectors · ${pc.mism} mismatches${pc.first ? ` · ${pc.first}` : ""}`);
    const bh = normRows ? await behaviour(normRows) : { n: 0, mism: -1, first: `script rows: ${expNote}` };
    chk("S2.3", pc.n >= 2000 && pc.mism === 0 && bh.n >= 2000 && bh.mism === 0, "≥2000 vectors · 0 mismatches (control 0)", `script ${bh.n}/${bh.mism}${bh.first ? ` (${bh.first})` : ""} · control ${pc.n}/${pc.mism}`);
    // S2.8 statics
    const s28 = staticNotes.s28 as Record<string, boolean>;
    const intOnly = normRows ? numLeaves(normRows.map((r: Any) => r.json)).every((x) => Number.isSafeInteger(x)) : false;
    chk("S2.8", Object.values(s28).every(Boolean) && intOnly, "no ACTIVE write · no update/delete · ON CONFLICT DO NOTHING · exports · integers", `${failedKeys(s28)} · runtime integers=${intOnly}`);

    const pA = `${LAW_PREFIX}a`;
    // S2.1 dry-run
    const dry = await runSeed(["--key-prefix", pA]);
    const dryRows = await lawRowsOf(pA);
    const dryPrints = LAW_KINDS4.every((k) => dry.out.includes(k)) && /\b[0-9a-f]{64}\b/.test(dry.out);
    chk("S2.1", dry.code === 0 && dryPrints && dryRows !== null && dryRows.length === 0, "exit 0 · 4 kinds + digest printed · 0 rows", `exit=${dry.code} printed=${dryPrints} rows=${dryRows === null ? "∅table" : dryRows.length} · ${outLine(dry.out)}`);
    // S2.4 apply
    const ap1 = await runSeed(["--apply", "--key-prefix", pA]);
    const rows1 = (await lawRowsOf(pA)) ?? [];
    const c1 = counts(ap1.out);
    const s24 = {
      exit0: ap1.code === 0,
      four: rows1.length === 4 && srt(rows1.map((r) => r.kind)) === srt(LAW_KINDS4),
      keys: srt(rows1.map((r) => r.sourceKey)) === srt(LAW_KINDS4.map((k) => `${pA}:${k}`)),
      draft: rows1.length === 4 && rows1.every((r) => r.status === "DRAFT"),
      unsigned: rows1.length === 4 && rows1.every((r) => r.approvedAt === null && r.approvedById === null && r.approvedByName === null),
      sentinel: rows1.length === 4 && rows1.every((r) => r.effectiveFrom === SENTINEL),
      created4: c1?.created === 4,
    };
    chk("S2.4", Object.values(s24).every(Boolean), "4 DRAFT rows · unsigned · 1970-01-01 · created 4", `${failedKeys(s24)} rows=${rows1.length} · ${outLine(ap1.out)}`);
    // S2.5 digest
    const dbDigest = rows1.length === 4 ? lawDigest(rows1) : "∅";
    chk("S2.5", exp?.digest === FROZEN_LAW_DIGEST && dbDigest === FROZEN_LAW_DIGEST, FROZEN_LAW_DIGEST.slice(0, 16), `exported=${String(exp?.digest ?? "∅").slice(0, 16)} db=${dbDigest.slice(0, 16)}`);
    // S2.6 apply ×2
    const ap2 = await runSeed(["--apply", "--key-prefix", pA]);
    const rows2 = (await lawRowsOf(pA)) ?? [];
    const c2 = counts(ap2.out);
    const same = rows1.length === 4 && stable(rows1.map((r) => [r.id, r.createdAt])) === stable(rows2.map((r) => [r.id, r.createdAt]));
    chk("S2.6", ap2.code === 0 && c2?.created === 0 && c2?.unchanged === 4 && same, "created 0 · unchanged 4 · ids/createdAt same", `exit=${ap2.code} counts=${short(c2)} same=${same} · ${outLine(ap2.out)}`);
    // S2.7 tampered
    const pT = `${LAW_PREFIX}t`;
    let tam = "∅table";
    if (await tableExists("HrLawTable")) {
      tam = await tryInsert("HrLawTable", { kind: "SSO", effectiveFrom: SENTINEL, json: { ...BRIEF_ROWS[0].json, rateBp: 501 }, sourceKey: `${pT}:SSO`, note: "QC แถวถูกแก้" });
    }
    const before = stable((await lawRowsOf(pT)) ?? []);
    const apT = await runSeed(["--apply", "--key-prefix", pT]);
    const afterRows = (await lawRowsOf(pT)) ?? [];
    const thai = apT.out.split("\n").some((l) => isThai(l));
    chk("S2.7", tam === "ok" && apT.code === 1 && thai && afterRows.length === 1 && stable(afterRows) === before, "exit 1 · Thai · 1 row (tampered, unchanged)", `fixture=${tam} exit=${apT.code} thai=${thai} rows=${afterRows.length} unchanged=${stable(afterRows) === before} · ${outLine(apT.out)}`);
    // S2.9 ACTIVE guards (rolled back)
    let a1 = "∅table";
    let a2 = "∅table";
    if (await tableExists("HrLawTable")) {
      a1 = await rolledBack(async (tx) => tryInsert("HrLawTable", { kind: "MIN_WAGE", effectiveFrom: "2031-01-01", json: { q: 1 }, status: "ACTIVE", sourceKey: `${LAW_PREFIX}z:1` }, tx));
      a2 = await rolledBack(async (tx) => {
        const one = await tryInsert("HrLawTable", { kind: "MIN_WAGE", effectiveFrom: "2031-01-01", json: { q: 1 }, status: "ACTIVE", sourceKey: `${LAW_PREFIX}z:2`, approvedAt: FIX_TS, approvedByName: "QC ผู้ตรวจ" }, tx);
        if (one !== "ok") return `first:${one}`;
        return tryInsert("HrLawTable", { kind: "MIN_WAGE", effectiveFrom: "2031-01-01", json: { q: 2 }, status: "ACTIVE", sourceKey: `${LAW_PREFIX}z:3`, approvedAt: FIX_TS, approvedById: OWNER_UID }, tx);
      });
    }
    const minWage = rows1.some((r) => r.kind === "MIN_WAGE");
    chk("S2.9", a1 === "23514" && a2 === "23505" && rows1.length === 4 && !minWage, "unsigned ACTIVE 23514 · 2nd ACTIVE 23505 · no MIN_WAGE", `unsigned=${a1} second=${a2} minWage=${minWage} rows=${rows1.length}`);
    // X1.1 replay ×3
    const pX = `${LAW_PREFIX}x`;
    const outs: string[] = [];
    let x11 = true;
    for (let i = 0; i < 3; i++) {
      const r = await runSeed(["--apply", "--key-prefix", pX]);
      const c = counts(r.out);
      outs.push(`#${i + 1}:exit${r.code}/${c ? `${c.created}+${c.unchanged}` : "∅"}`);
      if (r.code !== 0 || !c || (i === 0 ? c.created !== 4 : c.created !== 0 || c.unchanged !== 4)) x11 = false;
    }
    const nX = (await lawRowsOf(pX))?.length ?? -1;
    chk("X1.1", x11 && nX === 4, "4 rows · 4+0 · 0+4 · 0+4", `${outs.join(" ")} rows=${nX}`);
  });

  // ═══ S3 source idempotency + CRM coexistence ═══
  await group("S3", async () => {
    console.log("── [S3] source idempotency + CRM coexistence ──");
    const adj = (tenantId: string, systemId: string, employeeId: string, o: Record<string, unknown>) => ({ tenantId, systemId, employeeId, periodKey: "2031-01", kind: "COMMISSION", amountSatang: 10_000, note: "QC H1.3 แหล่งที่มา", ...o });
    const refOf = (k: number) => `qc-h13-${stamp}-line-${k}`;
    const n = (where: string, ...p: unknown[]) => rawCount("HrPayAdjustment", where, ...p);
    let rej = "";
    const r31 = await rounds(async (k) => {
      const rs = await race(10, () => tryInsert("HrPayAdjustment", adj(T, sH, e1, { sourceType: "POS_SALE_LINE", sourceRef: refOf(k) })));
      const rows = await n(`"tenantId" = $1 AND "sourceRef" = $2`, T, refOf(k));
      if (k === 0 && rows === 1) {
        await P.$executeRawUnsafe(`UPDATE "HrPayAdjustment" SET status = 'REJECTED' WHERE "tenantId" = $1 AND "sourceRef" = $2`, T, refOf(0));
        rej = await tryInsert("HrPayAdjustment", adj(T, sH, e1, { sourceType: "POS_SALE_LINE", sourceRef: refOf(0) }));
      }
      return { rs, rows, extra: k === 0 ? rej === "23505" : undefined };
    });
    chk("S3.1", r31.ok && rej === "23505", "1 + 9 × 23505 ×3 · REJECTED keeps the ref", `${r31.detail} · afterRejected=${rej}`);
    const x = `qc-h13-${stamp}-shared`;
    const a = await tryInsert("HrPayAdjustment", adj(T, sH, e1, { sourceType: "POS_SALE_LINE", sourceRef: x }));
    const b = await tryInsert("HrPayAdjustment", adj(T, sH, e1, { sourceType: "OT_REQUEST", sourceRef: x }));
    chk("S3.2", a === "ok" && b === "ok" && (await n(`"tenantId" = $1 AND "sourceRef" = $2`, T, x)) === 2, "2 rows", `pos=${a} ot=${b}`);
    const o = await tryInsert("HrPayAdjustment", adj(T2, sO, eO, { sourceType: "POS_SALE_LINE", sourceRef: refOf(0) }));
    chk("S3.3", o === "ok", "allowed", o);
    const nul = await race(10, () => tryInsert("HrPayAdjustment", adj(T, sH, e2, { sourceType: "POS_SALE_LINE", sourceRef: null, note: `QC null-ref ${stamp}` })));
    const nNull = await n(`"tenantId" = $1 AND "employeeId" = $2 AND "sourceRef" IS NULL AND note = $3`, T, e2, `QC null-ref ${stamp}`);
    chk("S3.4", nul.every((r) => r === "ok") && nNull === 10, "10 ok · 10 rows", `${short(tally(nul))} rows=${nNull}`);
    const r35 = await tryInsert("HrPayAdjustment", adj(T, sH, e1, { sourceType: null, sourceRef: `qc-h13-${stamp}-untyped` }));
    chk("S3.5", r35 === "23514", "23514", r35);
    const r36 = await tryInsert("HrPayAdjustment", adj(T, sH, e1, { crmCommissionId: `qc-h13-${stamp}-both`, sourceType: "POS_SALE_LINE", sourceRef: `qc-h13-${stamp}-both` }));
    chk("S3.6", r36 === "23514", "23514", r36);
    // X2.1 (same tenant other HR system collides · other tenant does not — S3.3)
    const x21 = await tryInsert("HrPayAdjustment", adj(T, sH2, e3, { sourceType: "POS_SALE_LINE", sourceRef: refOf(1) }));
    chk("X2.1", o === "ok" && x21 === "23505", "other tenant ok · sH2 23505", `otherTenant=${o} sameTenantSH2=${x21}`);
    // S3.7 CRM path unchanged
    const raw2 = async (id: string | undefined, c: string) => {
      const cols = await colsCached("HrPayAdjustment");
      if (!id) return "∅row";
      if (!cols.has(c)) return "absent";
      const r = await rawRows(`SELECT "${c}"::text AS v FROM "HrPayAdjustment" WHERE id = $1`, id);
      return r?.[0] ? (r[0].v ?? null) : "∅row";
    };
    const cid = `qc-h13-${stamp}-crm1`;
    const q = (c: string) => pay.requestAdjustment(ctxH, { employeeId: e1, periodKey: "2031-02", kind: "COMMISSION", amountSatang: 50_000, note: "ค่าคอมมิชชัน CRM (ข้อสอบ)", requestedById: "qc-h13-requester", crmCommissionId: c });
    const f1 = await q(cid).catch((e: unknown) => ({ ok: false, reason: `THROW ${errText(e)}` }));
    const f2 = await q(cid).catch((e: unknown) => ({ ok: false, reason: `THROW ${errText(e)}` }));
    const nC = await n(`"crmCommissionId" = $1`, cid);
    const st = await raw2(f1?.id, "sourceType");
    const sr = await raw2(f1?.id, "sourceRef");
    chk("S3.7", f1?.ok === true && f2?.ok === false && f2?.reason === T_CRM_DUP && nC === 1 && (st === null || st === "absent") && (sr === null || sr === "absent"), "ok · exact dup text · 1 row · links null",
      `1st=${short(f1, 60)} 2nd=${short(f2, 90)} rows=${nC} sourceType=${st} sourceRef=${sr}`);
    // S3.8 race on crmCommissionId
    const r38 = await rounds(async (k) => {
      const c = `qc-h13-${stamp}-crmrace-${k}`;
      const rs = await race(10, async () => {
        try {
          const r = await q(c);
          return r?.ok === true ? "ok" : r?.reason === T_CRM_DUP ? "dup" : `no:${short(r?.reason, 40)}`;
        } catch (e) {
          return `throw:${pgCode(e)}`;
        }
      });
      return { rs, rows: await n(`"crmCommissionId" = $1`, c) };
    }, "dup");
    chk("S3.8", r38.ok, "1 ok + 9 dup ×3 · 1 row", r38.detail);
    // S3.9 manual path
    const m = await pay.requestAdjustment(ctxH, { employeeId: e1, periodKey: "2031-03", kind: "BONUS", amountSatang: 30_000, note: "โบนัส (ข้อสอบ)", requestedById: "qc-h13-requester" }).catch((e: unknown) => ({ ok: false, reason: `THROW ${errText(e)}` }));
    const mt = await raw2(m?.id, "sourceType");
    const mr = await raw2(m?.id, "sourceRef");
    const resolve = (sourceType: string | null, crm: string | null) => sourceType ?? (crm ? "CRM_COMMISSION" : "MANUAL");
    const manualRow = m?.id ? await P.hrPayAdjustment.findUnique({ where: { id: m.id }, select: { crmCommissionId: true } }) : null;
    const crmRow = f1?.id ? await P.hrPayAdjustment.findUnique({ where: { id: f1.id }, select: { crmCommissionId: true } }) : null;
    const resM = resolve(mt === "absent" ? null : (mt as string | null), manualRow?.crmCommissionId ?? null);
    const resC = resolve(st === "absent" ? null : (st as string | null), crmRow?.crmCommissionId ?? null);
    chk("S3.9", m?.ok === true && (mt === null || mt === "absent") && (mr === null || mr === "absent") && resM === "MANUAL" && resC === "CRM_COMMISSION", "links null · MANUAL / CRM_COMMISSION", `ok=${m?.ok} sourceType=${mt} sourceRef=${mr} resolve=${resM}/${resC}`);
  });

  // ═══ S4 work entry / onboarding ═══
  await group("S4", async () => {
    console.log("── [S4] work entry · onboarding ──");
    const we = (o: Record<string, unknown>) => ({ tenantId: T, systemId: sH, employeeId: e1, kind: "WORK", minutes: 480, periodKey: "2031-03", computedAt: FIX_TS, ...o });
    const nWe = (where: string, ...p: unknown[]) => rawCount("HrWorkEntry", where, ...p);
    const r41 = await rounds(async (k) => {
      const date = `2031-03-0${k + 1}`;
      const rs = await race(10, () => tryInsert("HrWorkEntry", we({ date })));
      return { rs, rows: await nWe(`"employeeId" = $1 AND date = $2::date AND kind::text = 'WORK'`, e1, date) };
    });
    chk("S4.1", r41.ok, "1 + 9 × 23505 ×3", r41.detail);
    const w1 = await tryInsert("HrWorkEntry", we({ date: "2031-03-10", kind: "WORK" }));
    const w2 = await tryInsert("HrWorkEntry", we({ date: "2031-03-10", kind: "OT_WORKDAY", minutes: 90 }));
    chk("S4.2", w1 === "ok" && w2 === "ok" && (await nWe(`"employeeId" = $1 AND date = '2031-03-10'::date`, e1)) === 2, "2 rows", `WORK=${w1} OT_WORKDAY=${w2}`);
    const m1 = await tryInsert("HrWorkEntry", we({ date: "2031-03-11", minutes: -1 }));
    const m2 = await tryInsert("HrWorkEntry", we({ date: "2031-03-12", minutes: 1441 }));
    const m3 = await tryInsert("HrWorkEntry", we({ date: "2031-03-13", minutes: 0 }));
    const m4 = await tryInsert("HrWorkEntry", we({ date: "2031-03-14", minutes: 1440 }));
    chk("S4.3", m1 === "23514" && m2 === "23514" && m3 === "ok" && m4 === "ok", "−1/1441 23514 · 0/1440 ok", `−1=${m1} 1441=${m2} 0=${m3} 1440=${m4}`);
    // S4.4 source ids (H1.2 tables probed by name — absent on 13a0601b)
    {
      const h12 = { shift: await tableExists("HrShift"), roster: await tableExists("HrRosterEntry"), ot: await tableExists("HrOtRequest"), hol: await tableExists("HrHoliday") };
      let detail = `H1.2 tables ${short(h12)}`;
      let ok = false;
      if (Object.values(h12).every(Boolean)) {
        try {
          const shiftId = await rawInsert("HrShift", { tenantId: T, systemId: sH, name: `กะ H1.3 ${stamp}`, startMin: 420, endMin: 900 });
          const rosterId = await rawInsert("HrRosterEntry", { tenantId: T, systemId: sH, employeeId: e1, date: "2031-04-01", shiftId, startMin: 420, endMin: 900, breakMin: 0, crossesMidnight: false });
          const otId = await rawInsert("HrOtRequest", { tenantId: T, systemId: sH, employeeId: e1, date: "2031-04-01", startAt: new Date("2031-04-01T09:00:00Z"), endAt: new Date("2031-04-01T10:00:00Z"), minutes: 60, timing: "AFTER" });
          const holId = await rawInsert("HrHoliday", { tenantId: T, systemId: sH, date: "2031-04-13", name: "วันหยุดทดสอบ", kind: "SHOP" });
          const attIn = (await P.hrAttendance.create({ data: { tenantId: T, systemId: sH, employeeId: e1, kind: "IN", at: new Date("2031-04-01T00:05:00Z") } })).id as string;
          const leave = (await P.hrLeave.create({ data: { tenantId: T, systemId: sH, employeeId: e1, type: "PERSONAL", fromDate: new Date("2031-04-02T00:00:00Z"), toDate: new Date("2031-04-02T00:00:00Z"), reason: "ธุระ" } })).id as string;
          detail += " · 6 source rows written";
          const ids = { rosterEntryId: rosterId, otRequestId: otId, holidayId: holId, attendanceInId: attIn, attendanceOutId: `not-a-real-id-${stamp}`, leaveId: leave };
          const weId = await rawInsert("HrWorkEntry", we({ date: "2031-04-01", ...ids }));
          await P.$executeRawUnsafe(`DELETE FROM "HrOtRequest" WHERE id = $1`, otId);
          await P.$executeRawUnsafe(`DELETE FROM "HrRosterEntry" WHERE id = $1`, rosterId);
          await P.$executeRawUnsafe(`DELETE FROM "HrHoliday" WHERE id = $1`, holId);
          await P.hrAttendance.delete({ where: { id: attIn } });
          await P.hrLeave.delete({ where: { id: leave } });
          const r = (await rawRows(`SELECT ${WE_SOURCE_IDS.map((c) => `"${c}"`).join(",")} FROM "HrWorkEntry" WHERE id = $1`, weId))?.[0];
          ok = !!r && WE_SOURCE_IDS.every((c) => r[c] === (ids as Any)[c]);
          detail += ` · entry ${r ? "survived" : "GONE"} · ids ${ok ? "intact" : short(r, 120)}`;
        } catch (e) {
          detail += ` · ${pgCode(e)}`;
        }
      } else detail += " · H1.2 tables missing (H1.3 builds on the H1.2 merge)";
      chk("S4.4", ok, "6 ids accepted · entry survives source deletion", detail);
    }
    {
      const cols = await colsCached("HrWorkEntry");
      const t = cols.get("date") ?? "∅";
      const ins = await tryInsert("HrWorkEntry", we({ date: "2028-02-29" }));
      const back = (await rawRows(`SELECT date::text AS d FROM "HrWorkEntry" WHERE "employeeId" = $1 AND date = '2028-02-29'::date`, e1))?.[0]?.d ?? "∅";
      chk("S4.5", t === "date" && ins === "ok" && back === "2028-02-29", "date · 2028-02-29 round-trips", `type=${t} insert=${ins} back=${back}`);
    }
    {
      const e4 = await mkEmp(T, sH, `พนง-ลบทิ้ง ${stamp}`);
      const a = await tryInsert("HrWorkEntry", we({ employeeId: e4, date: "2031-05-01" }));
      const b = await tryInsert("HrReviewNote", { tenantId: T, systemId: sH, employeeId: e4, kind: "NOTE", title: "บันทึก", body: "ทดสอบ" });
      const c = await tryInsert("HrOnboardingTask", { tenantId: T, systemId: sH, employeeId: e4, kind: "ONBOARDING", title: "รับชุดยูนิฟอร์ม" });
      let del = "ok";
      try {
        await P.hrEmployee.delete({ where: { id: e4 } });
      } catch (e) {
        del = pgCode(e);
      }
      const left = [await rawCount("HrWorkEntry", `"employeeId" = $1`, e4), await rawCount("HrReviewNote", `"employeeId" = $1`, e4), await rawCount("HrOnboardingTask", `"employeeId" = $1`, e4)];
      chk("S4.6", a === "ok" && b === "ok" && c === "ok" && del === "ok" && left.every((x) => x === 0), "3 rows → 0 after delete", `inserts=${a}/${b}/${c} delete=${del} left=${left.join("/")}`);
    }
    {
      const r47 = await rounds(async (k) => {
        const key = `tpl-${stamp}-${k}`;
        const rs = await race(10, () => tryInsert("HrOnboardingTask", { tenantId: T, systemId: sH, employeeId: e1, kind: "ONBOARDING", title: "เซ็นสัญญา", templateKey: key }));
        return { rs, rows: await rawCount("HrOnboardingTask", `"employeeId" = $1 AND "templateKey" = $2`, e1, key) };
      });
      const nulls = [];
      for (let i = 0; i < 3; i++) nulls.push(await tryInsert("HrOnboardingTask", { tenantId: T, systemId: sH, employeeId: e1, kind: "OFFBOARDING", title: `คืนกุญแจ ${i}` }));
      const nN = await rawCount("HrOnboardingTask", `"employeeId" = $1 AND kind::text = 'OFFBOARDING' AND "templateKey" IS NULL`, e1);
      chk("S4.7", r47.ok && nulls.every((x) => x === "ok") && nN === 3, "1 per round · 3 null-key rows", `${r47.detail} · null ${nulls.join(",")} rows=${nN}`);
    }
    // X2.2 tenantDb system filter
    {
      await tryInsert("HrReviewNote", { tenantId: T, systemId: sH, employeeId: e1, kind: "REVIEW", title: "ประเมิน", body: "ทดสอบ", score: 4 });
      const res: string[] = [];
      let ok = true;
      for (const d of ["hrWorkEntry", "hrReviewNote", "hrOnboardingTask"]) {
        try {
          const own = (await tenantDb(ctxH)[d].findMany({ where: { employeeId: e1 }, select: { id: true } })) as Any[];
          const other = (await tenantDb(ctxH2)[d].findMany({ where: { employeeId: e1 }, select: { id: true } })) as Any[];
          if (!(own.length > 0 && other.length === 0)) ok = false;
          res.push(`${d}:${own.length}/${other.length}`);
        } catch (e) {
          ok = false;
          res.push(`${d}:${short(errText(e), 50)}`);
        }
      }
      chk("X2.2", ok, "sH ≥1 · sH2 0 on 3 delegates", res.join(" "));
    }
    // S7.5 db part — the 3 delegates applied to our main tenant
    {
      const s75 = staticNotes.s75 as Record<string, boolean>;
      let db = "ok";
      for (const d of ["hrWorkEntry", "hrReviewNote", "hrOnboardingTask"]) {
        try {
          await P[d].deleteMany({ where: { tenantId: T } });
        } catch (e) {
          db = `${d}:${short(errText(e), 40)}`;
        }
      }
      const left = [await rawCount("HrWorkEntry", `"tenantId" = $1`, T), await rawCount("HrReviewNote", `"tenantId" = $1`, T), await rawCount("HrOnboardingTask", `"tenantId" = $1`, T)];
      chk("S7.5", Object.values(s75).every(Boolean) && db === "ok" && left.every((x) => x === 0), "order ok · 0 rows left", `static=${failedKeys(s75)} db=${db} left=${left.join("/")}`);
    }
  });

  // ═══ S5 frozen digests ═══
  let monthlyRun = "";
  await group("S5.1-S5.4", async () => {
    console.log("── [S5] MONTHLY fixture ──");
    const ctxM = { tenantId: T, systemId: sM };
    const codeOf = new Map<string, string>();
    const empOf = new Map<string, string>();
    for (const m of MONTHLY_FIXTURE.employees) {
      const id = await mkEmp(T, sM, `พนง-${m.code} ${stamp}`, { code: m.code, ...(m.start ? { startDate: m.start } : {}) });
      codeOf.set(id, m.code);
      empOf.set(m.code, id);
      await pay.setSalaryProfile(ctxM, { employeeId: id, baseSalarySatang: m.base, ssoEligible: m.sso, deductions: { spouse: m.spouse, children: m.children } });
    }
    for (const a of MONTHLY_FIXTURE.adjustments) {
      await P.hrPayAdjustment.create({ data: { tenantId: T, systemId: sM, employeeId: empOf.get(a.code)!, periodKey: MONTHLY_FIXTURE.period, kind: a.kind, amountSatang: a.amount, status: "APPROVED", note: `QC ${a.kind}` } });
    }
    let digest = "∅";
    let totals = "∅";
    let flags = "∅";
    let items: Any[] = [];
    try {
      const run = await pay.createPayrollRun(ctxM, { periodKey: MONTHLY_FIXTURE.period, payDate: new Date(`${MONTHLY_FIXTURE.payDate}T05:00:00Z`) });
      monthlyRun = run.id;
      items = (await P.hrPayrollItem.findMany({ where: { runId: run.id }, select: { id: true, ...digestMod.PAYROLL_DIGEST_SELECT, snapshotJson: true } })) as Any[];
      digest = digestMod.payrollItemsDigest(items.map((i) => ({ ...i, employeeId: codeOf.get(i.employeeId) ?? "?" })));
      const r = (await P.hrPayrollRun.findUnique({ where: { id: run.id } })) as Any;
      totals = [r.totalGrossSatang, r.totalSsoEmployeeSatang, r.totalSsoEmployerSatang, r.totalWhtSatang, r.totalNetSatang, r.totalAddSatang, r.totalDeductSatang].join(":");
      flags = items
        .map((i) => `${codeOf.get(i.employeeId)}=${((i.snapshotJson as Any)?.flags ?? []).join("+") || "-"}`)
        .sort()
        .join(",");
    } catch (e) {
      digest = `THROW ${errText(e)}`;
    }
    console.log(`  ℹ MONTHLY fixture computed: digest=${digest} totals=${totals} flags=${flags}`);
    chk("S5.1", digest === FROZEN_DIGEST, FROZEN_DIGEST.slice(0, 16), digest.slice(0, 64));
    chk("S5.2", totals === FROZEN_TOTALS, FROZEN_TOTALS, totals);
    chk("S5.3", flags === FROZEN_FLAGS, FROZEN_FLAGS, flags);
    // S5.4
    const rc = await colsCached("HrPayrollRun");
    const ic = await colsCached("HrPayrollItem");
    const missR = RUN_NEW.map((c) => c[0]).filter((c) => !rc.has(c));
    const missI = ITEM_NEW.map((c) => c[0]).filter((c) => !ic.has(c));
    let detail = `missing run=${missR.join(",") || "0"} item=${missI.join(",") || "0"}`;
    let ok = false;
    if (monthlyRun && !missR.length && !missI.length) {
      const r = (await rawRows(`SELECT "engineVersion", "accountSystemId", "createdById", "approvedById", "approvedAt", "bankFileKey", "filingJson" FROM "HrPayrollRun" WHERE id = $1`, monthlyRun))?.[0];
      const its = (await rawRows(`SELECT cardinality("lawRowIds") AS n, "ytdJson" FROM "HrPayrollItem" WHERE "runId" = $1`, monthlyRun)) ?? [];
      const runOk = !!r && Number(r.engineVersion) === 1 && ["accountSystemId", "createdById", "approvedById", "approvedAt", "bankFileKey", "filingJson"].every((c) => r[c] === null);
      const itemOk = its.length === 4 && its.every((i) => Number(i.n) === 0 && i.ytdJson === null);
      ok = runOk && itemOk;
      detail = `run=${short(r, 120)} items=${its.length} ${itemOk ? "clean" : short(its, 80)}`;
    }
    chk("S5.4", ok, "engineVersion 1 · 6 null · items {} / null", detail);
  });

  // S5.8 reverse / converge (+ S6.4 payslip uses the paid R2)
  let R2 = "";
  let selfUser: Who | null = null;
  let rEmp = "";
  await group("S5.8", async () => {
    console.log("── [S5.8] H0.6 reverse / converge path ──");
    selfUser = await mkUser(T, "self", "STAFF", [], {});
    rEmp = await mkEmp(T, sR, `พนง-R01 ${stamp}`, { code: "R01", linkedUserId: selfUser.id });
    await pay.setSalaryProfile(ctxR, { employeeId: rEmp, baseSalarySatang: B(30_000), ssoEligible: true });
    const PER = "2033-04";
    const cId = (await P.crmCommission.create({
      data: { tenantId: T, systemId: CRM, dealId: `${SLUG}-deal-1`, ruleId: `${SLUG}-rule`, userId: `qc-h13-sales-${stamp}`, amountSatang: BigInt(B(2_000)), basisSatang: BigInt(B(20_000)), basis: "PAID", status: "APPROVED", periodKey: PER, refType: "DEAL_PAYMENT", refId: `${SLUG}-pay-1#c1`, decidedAt: new Date("2033-04-02T03:00:00Z") },
    })).id as string;
    const rq = await pay.requestAdjustment(ctxR, { employeeId: rEmp, periodKey: PER, kind: "COMMISSION", amountSatang: B(2_000), note: "ค่าคอมมิชชัน CRM (ข้อสอบ)", requestedById: "qc-h13-requester", crmCommissionId: cId });
    if (!rq?.ok) throw new Error(`fixture: commission adjustment ${short(rq)}`);
    const dc = await pay.decideAdjustment(ctxR, rq.id, "APPROVED", ACTOR);
    if (!dc?.ok) throw new Error(`fixture: decide ${short(dc)}`);
    await P.crmCommission.update({ where: { id: cId }, data: { hrPayAdjustmentId: rq.id } });
    const adjId = rq.id as string;
    const expectOf = async (runId: string) => {
      const r = await P.hrPayrollRun.findUnique({ where: { id: runId } });
      const items = await P.hrPayrollItem.findMany({ where: { runId }, select: digestMod.PAYROLL_DIGEST_SELECT });
      return { totalNetSatang: Number(r?.totalNetSatang ?? 0), itemCount: items.length, totalGrossSatang: Number(r?.totalGrossSatang ?? 0), itemsDigest: digestMod.payrollItemsDigest(items) as string };
    };
    const deliverKey = async (key: string) => {
      const evs = (await P.outboxEvent.findMany({ where: { tenantId: T, idempotencyKey: key } })) as Any[];
      const out: string[] = [];
      for (const e of evs) {
        const fn = CONS?.[e.type];
        if (typeof fn !== "function") {
          out.push(`∅consumer ${e.type}`);
          continue;
        }
        try {
          await fn({ id: e.id, tenantId: e.tenantId, type: e.type, payload: e.payload, systemId: e.systemId, unitId: e.unitId });
          out.push("ok");
        } catch (err) {
          out.push(`throw ${errText(err).slice(0, 60)}`);
        }
      }
      return `${evs.length}:${out.join("+") || "-"}`;
    };
    const labels = new Map<string, string>();
    const state = async (step: string) => {
      const c = await P.crmCommission.findUnique({ where: { id: cId }, select: { status: true } });
      const a = await P.hrPayAdjustment.findUnique({ where: { id: adjId }, select: { runId: true, status: true } });
      const runs = (await P.hrPayrollRun.findMany({ where: { systemId: sR }, orderBy: { createdAt: "asc" } })) as Any[];
      const rs = [];
      for (const r of runs) {
        const items = (await P.hrPayrollItem.findMany({ where: { runId: r.id }, select: digestMod.PAYROLL_DIGEST_SELECT })) as Any[];
        rs.push({ run: labels.get(r.id) ?? "?", status: r.status, totals: [r.totalGrossSatang, r.totalSsoEmployeeSatang, r.totalSsoEmployerSatang, r.totalWhtSatang, r.totalNetSatang, r.totalAddSatang, r.totalDeductSatang].join(":"), items: digestMod.payrollItemsDigest(items.map((i) => ({ ...i, employeeId: "R01" }))), jv: !!r.journalEntryId });
      }
      return { step, commission: c?.status ?? "∅", adjustment: { status: a?.status ?? "∅", bound: a?.runId ? (labels.get(a.runId) ?? "?") : null }, runs: rs };
    };
    const trail: Any[] = [];
    const R1 = (await pay.createPayrollRun(ctxR, { periodKey: PER, payDate: new Date("2033-04-25T03:00:00Z") })).id as string;
    labels.set(R1, "R1");
    const ap1 = await pay.approveRun(ctxR, R1, await expectOf(R1), ACTOR);
    const mp1 = await pay.markPaid(ctxR, R1);
    const dp1 = await deliverKey(`hr.payroll.paid#${R1}`);
    trail.push(await state("paid#R1"));
    const rv = await pay.reverseRun(ctxR, R1, "ข้อสอบ H1.3 กลับรายการ", ACTOR);
    const dr = await deliverKey(`hr.payroll.reversed#${R1}`);
    const afterRev = await state("reversed#R1");
    trail.push(afterRev);
    const revDigest = sha(stable(trail));
    R2 = (await pay.createPayrollRun(ctxR, { periodKey: PER, payDate: new Date("2033-04-26T03:00:00Z") })).id as string;
    labels.set(R2, "R2");
    const ap2 = await pay.approveRun(ctxR, R2, await expectOf(R2), ACTOR);
    const mp2 = await pay.markPaid(ctxR, R2);
    const dp2 = await deliverKey(`hr.payroll.paid#${R2}`);
    const afterConv = await state("paid#R2");
    trail.push(afterConv);
    const convDigest = sha(stable(trail));
    console.log(`  ℹ path: approve1=${ap1?.ok} paid1=${mp1?.ok} deliver=${dp1} · reverse=${rv?.ok} deliver=${dr} · approve2=${ap2?.ok} paid2=${mp2?.ok} deliver=${dp2}`);
    console.log(`  ℹ path digests: reverse=${revDigest} converge=${convDigest}`);
    console.log(`  ℹ trail ${stable(trail)}`);
    const shape = afterRev.commission === "APPROVED" && afterRev.adjustment.bound === null && afterConv.commission === "PAID" && afterConv.adjustment.bound === "R2";
    chk("S5.8", rv?.ok === true && shape && revDigest === FROZEN_PATH_REVERSE && convDigest === FROZEN_PATH_CONVERGE, "APPROVED+unbound · PAID+R2 · 2 digests = frozen",
      `reverse=${rv?.ok} after-reverse ${afterRev.commission}/${afterRev.adjustment.bound} · after-converge ${afterConv.commission}/${afterConv.adjustment.bound} · rev=${revDigest === FROZEN_PATH_REVERSE ? "=" : revDigest.slice(0, 16)} conv=${convDigest === FROZEN_PATH_CONVERGE ? "=" : convDigest.slice(0, 16)}`);
  });

  // ═══ S6.4 DTO matrix ═══
  await group("S6.4", async () => {
    console.log("── [S6.4] privacy matrix ──");
    const BASE_PROFILE = ["id", "name", "nickname", "code", "phone", "email", "gender", "birthDate", "maritalStatus", "position", "department", "employmentType", "startDate", "endDate", "addressLine", "subdistrict", "district", "province", "postcode", "emergencyName", "emergencyPhone", "emergencyRelation", "note", "active", "hasPin"];
    const SENS6 = ["nationalId", "ssoNumber", "houseRegAddress", "bankName", "bankAccountNo", "bankAccountName"];
    const H11_PROFILE = ["unitId", "unitName", "employmentStatus", "probationEndAt", "contractEndAt"];
    const LEAVE6 = ["id", "employeeName", "type", "fromDate", "toDate", "status"];
    const PAYK = { "hr.payroll.read": true, "hr.leave.read": true };
    const U = {
      owner: await mkUser(T, "owner", "OWNER", [], {}),
      payroll: await mkUser(T, "payroll", "STAFF", ["*"], PAYK),
      manager: await mkUser(T, "manager", "MANAGER", ["*"], { "hr.leave.read": true, "hr.employee.create": true }),
      hrRead: await mkUser(T, "hrread", "STAFF", ["*"], { "hr.leave.read": true }),
      member: await mkUser(T, "member", "STAFF", [], {}),
      other: await mkUser(T2, "other", "OWNER", [], {}),
    };
    if (!selfUser || !rEmp) throw new Error("S5.8 fixture missing (self / R01)");
    await P.hrLeave.create({ data: { tenantId: T, systemId: sR, employeeId: rEmp, type: "PERSONAL", fromDate: new Date("2033-05-05T00:00:00Z"), toDate: new Date("2033-05-05T00:00:00Z"), reason: "ธุระส่วนตัว" } });
    const M: [string, Who, Any, "null" | "base" | "sens", boolean, boolean, boolean][] = [
      ["owner", U.owner, ctxR, "sens", true, false, true],
      ["payroll", U.payroll, ctxR, "sens", true, false, true],
      ["manager", U.manager, ctxR, "base", true, false, false],
      ["hrRead", U.hrRead, ctxR, "base", true, false, false],
      ["member", U.member, ctxR, "null", false, true, false],
      ["self", selfUser, ctxR, "null", false, false, true],
      ["otherTenant", U.other, { tenantId: T2, systemId: sR }, "null", false, true, false],
    ];
    const bad: string[] = [];
    const seen: string[] = [];
    for (const [tag, w, ctx, prof, reason, mayBeEmpty, slipWanted] of M) {
      let p: Any = null;
      let li: Any = null;
      let slip: Any = null;
      try {
        p = await privacy.loadEmployeeProfileForViewer(ctx, vOf(w), rEmp);
        li = await privacy.leaveItemsForViewer(ctx, vOf(w));
        slip = R2 ? await privacy.loadPayslipForViewer(ctx, vOf(w), R2, rEmp) : null;
      } catch (e) {
        bad.push(`${tag}:THROW ${errText(e).slice(0, 40)}`);
        continue;
      }
      const pk = p?.profile ? Object.keys(p.profile) : null;
      const extraOk = (k: string) => H11_PROFILE.includes(k) || (prof === "sens" && k === "payType");
      if (prof === "null" ? pk !== null : !pk || !BASE_PROFILE.every((k) => pk.includes(k)) || !pk.every((k) => BASE_PROFILE.includes(k) || SENS6.includes(k) || extraOk(k)) || SENS6.some((k) => pk.includes(k) !== (prof === "sens"))) bad.push(`${tag}:profile=${pk ? pk.length : "null"}`);
      const items = [...(li?.pending ?? []), ...(li?.history ?? [])] as Any[];
      const keys = new Set(items.flatMap((x) => Object.keys(x)));
      const want = new Set([...LEAVE6, ...(reason ? ["reason"] : [])]);
      const emptyOk = mayBeEmpty && items.length === 0;
      if (tag === "otherTenant" ? items.length !== 0 : !emptyOk && srt(keys) !== srt(want) && srt([...keys].filter((k) => k !== "filedBy")) !== srt(want)) bad.push(`${tag}:leaveKeys=${srt(keys)}`);
      const h13 = [...(pk ?? []), ...keys].filter((k) => H13_KEYS.includes(k));
      if (h13.length) bad.push(`${tag}:H1.3 keys ${h13.join("+")}`);
      if (!!slip !== slipWanted) bad.push(`${tag}:slip=${slip ? "yes" : "null"}`);
      seen.push(`${tag}:${pk ? pk.length : "∅"}/${items.length}/${slip ? "slip" : "-"}`);
    }
    chk("S6.4", !!R2 && bad.length === 0, "7 viewers as base", bad.join(" ") || seen.join(" "));
  });

  // ═══ X8.1 HR-only tenant (no ACCOUNT) ═══
  await group("X8.1", async () => {
    const types = ((await P.appSystem.findMany({ where: { tenantId: T2 }, select: { type: true } })) as Any[]).map((s) => s.type);
    let detail = "";
    let ok = false;
    try {
      const run = await pay.createPayrollRun(ctxO, { periodKey: "2034-01", payDate: new Date("2034-01-25T03:00:00Z") });
      const items = await P.hrPayrollItem.findMany({ where: { runId: run.id }, select: digestMod.PAYROLL_DIGEST_SELECT });
      const r0 = await P.hrPayrollRun.findUnique({ where: { id: run.id } });
      const ap = await pay.approveRun(ctxO, run.id, { totalNetSatang: Number(r0?.totalNetSatang ?? 0), itemCount: items.length, totalGrossSatang: Number(r0?.totalGrossSatang ?? 0), itemsDigest: digestMod.payrollItemsDigest(items) }, ACTOR);
      const r = await P.hrPayrollRun.findUnique({ where: { id: run.id } });
      const ev = (await colsCached("HrPayrollRun")).has("engineVersion") ? Number((await rawRows(`SELECT "engineVersion" FROM "HrPayrollRun" WHERE id = $1`, run.id))?.[0]?.engineVersion) : "n/a";
      ok = types.every((t) => t === "HR") && items.length === 1 && ap?.ok === true && r?.status === "APPROVED" && !r?.journalEntryId && (ev === "n/a" || ev === 1);
      detail = `types=${srt(new Set(types))} items=${items.length} approve=${short(ap, 60)} status=${r?.status} jv=${!!r?.journalEntryId} engineVersion=${ev}`;
    } catch (e) {
      detail = `THROW ${errText(e)}`;
    }
    chk("X8.1", ok, "HR-only · run + approve · no JV · engineVersion 1|n/a", detail);
  });

  // ═══ fitness-hr without env (S6.2 · X12.1) ═══
  await group("fitness", async () => {
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_OPTIONS: "--max-old-space-size=2048" };
    const f = await spawnTsx([FITNESS_HR], env, 300_000);
    const l = await spawnTsx([THIS_FILE, "--list"], env, 120_000);
    const listed = (l.out.match(/^H1\.3-/gm) ?? []).length;
    chk("X12.1", f.code === 0 && l.code === 0 && listed === CHECKS.length, `exit 0 · exit 0 · ${CHECKS.length} ids`, `fitness exit=${f.code}${f.code !== 0 ? ` ${short(f.out.split("\n").filter((x) => /❌/.test(x)).join(" "), 120)}` : ""} · --list exit=${l.code} ids=${listed}`);
    const miss = (staticNotes.f161Missing ?? []) as string[];
    chk("S6.2", miss.length === 0 && f.code === 0, "F16.1 ⊇ 3 keys · fitness-hr exit 0", `F16.1 missing=${miss.join(",") || "0"} fitness exit=${f.code}`);
  });

  // ═══ S7 seed / expected (READ-ONLY qc-hr-v2 · global v1 rows) ═══
  await group("S7", async () => {
    console.log("── [S7] seed / expected (read-only) ──");
    let exp: Any = null;
    try {
      exp = JSON.parse(rd(EXPECTED) || "null");
    } catch {
      exp = null;
    }
    const deep = (o: Any, k: string): Any => {
      if (!o || typeof o !== "object") return undefined;
      if (Object.prototype.hasOwnProperty.call(o, k)) return o[k];
      for (const v of Object.values(o)) {
        const r = deep(v, k);
        if (r !== undefined) return r;
      }
      return undefined;
    };
    const qcT = await hqcEnv.findQcTenant(P);
    const q = qcT?.tenantId as string | undefined;
    const liveN = async (m: string) => (q ? await P[m].count({ where: { tenantId: q } }) : -1);
    {
      const ev = deep(exp, "HrPayrollRun.engineVersion");
      const lv = deep(exp, "HrLawTable.v1");
      let live: Any = "∅";
      if (q) {
        const r = (await colsCached("HrPayrollRun")).has("engineVersion") ? await rawRows(`SELECT "engineVersion" FROM "HrPayrollRun" WHERE "tenantId" = $1`, q) : null;
        live = r ? r.map((x) => Number(x.engineVersion)).join(",") : "∅col";
      }
      chk("S7.1", ev === 1 && lv === 4 && live === "1", "expected engineVersion 1 · HrLawTable.v1 4 · live 1", `expected engineVersion=${ev ?? "∅"} HrLawTable.v1=${lv ?? "∅"} · live=${q ? live : "qc-hr-v2 not seeded"}`);
    }
    {
      const want = { hrPayAdjustment: 5, hrPayrollItem: 11, hrPayrollRun: 1 };
      const live = { hrPayAdjustment: await liveN("hrPayAdjustment"), hrPayrollItem: await liveN("hrPayrollItem"), hrPayrollRun: await liveN("hrPayrollRun") };
      const e = exp?.counts ?? {};
      const ok = Object.entries(want).every(([k, v]) => (live as Any)[k] === v) && e.HrPayAdjustment === 5 && e.HrPayrollItem === 11 && e.HrPayrollRun === 1;
      chk("S7.2", ok, "5 / 11 / 1 live = expected", `live=${short(live)} expected=${e.HrPayAdjustment}/${e.HrPayrollItem}/${e.HrPayrollRun}`);
    }
    {
      const seed = stripComments(rd(SEED_FILE));
      const noWrite = !/(hrWorkEntry|hrReviewNote|hrOnboardingTask|hrLawTable)\.(create|createMany|upsert)\b|INSERT INTO "(HrWorkEntry|HrReviewNote|HrOnboardingTask|HrLawTable)"/.test(seed);
      const rows = q ? [await rawCount("HrWorkEntry", `"tenantId" = $1`, q), await rawCount("HrReviewNote", `"tenantId" = $1`, q), await rawCount("HrOnboardingTask", `"tenantId" = $1`, q)] : [-9, -9, -9];
      chk("S7.3", noWrite && rows.every((x) => x === 0), "no seed write · 0/0/0 rows", `noWrite=${noWrite} rows=${rows.join("/")} (−1 = table absent · −9 = qc-hr-v2 not seeded)`);
    }
    {
      const v1 = (await lawRowsOf("v1")) ?? null;
      const active = (await tableExists("HrLawTable")) ? await rawCount("HrLawTable", `status::text = 'ACTIVE'`) : -1;
      const ok = !!v1 && v1.length === 4 && srt(v1.map((r) => r.kind)) === srt(LAW_KINDS4) && v1.every((r) => r.status === "DRAFT") && active === 0;
      chk("S7.4", ok, "4 v1 DRAFT rows · 0 ACTIVE", v1 ? `v1=${v1.map((r) => `${r.kind}:${r.status}`).join(",") || "0"} active=${active}` : "∅ HrLawTable");
    }
  });
}

// ═════════════════════════ cleanup ═════════════════════════
async function cleanup(): Promise<string[]> {
  const d = async (f: () => Promise<unknown>) => {
    try {
      await f();
    } catch {
      /* order/FK — next pass */
    }
  };
  if (await tableExists("HrLawTable").catch(() => false)) await d(() => P.$executeRawUnsafe(`DELETE FROM "HrLawTable" WHERE "sourceKey" LIKE $1`, `${LAW_PREFIX}%`));
  const ids = tenants.filter((x) => /^[a-z0-9]+$/i.test(x));
  const left: string[] = [];
  if (ids.length) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema = current_schema() and column_name='tenantId'`).catch(() => [])) as Any[])
      .map((r) => String(r.table_name))
      .filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await d(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
    for (const id of ids) await d(() => P.tenant.delete({ where: { id } }));
    // tables that appeared during the run (H1.2 builder) — re-list
    const tables2 = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema = current_schema() and column_name='tenantId'`).catch(() => [])) as Any[]).map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (const t of tables2) {
      const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: -1 }])) as Any[];
      const n = Number(r?.[0]?.n ?? 0);
      if (n !== 0) {
        await d(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
        const r2 = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: -1 }])) as Any[];
        if (Number(r2?.[0]?.n ?? 0) !== 0) left.push(`${t}=${r2?.[0]?.n}`);
      }
    }
  }
  for (const uid of users) {
    await d(() => P.session.deleteMany({ where: { userId: uid } }));
    await d(() => P.appNotification.deleteMany({ where: { recipientUserId: uid } }));
    await d(() => P.membership.deleteMany({ where: { userId: uid } }));
    await d(() => P.user.deleteMany({ where: { id: uid } }));
  }
  return left;
}

let crashed = "";
let left: string[] = ["(cleanup not run)"];
try {
  runStatic();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 4).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  try {
    left = await cleanup();
  } catch (e) {
    left = [`cleanup threw: ${errText(e)}`];
  }
}
if (staticNotes.crmBlockSha && CRM_BLOCK_SHA.startsWith("__")) console.log(`  ℹ FREEZE crm block sha = ${staticNotes.crmBlockSha}`);
if (staticNotes.baseColSig && FROZEN_BASE_COL_SIG.startsWith("__")) console.log(`  ℹ FREEZE base column signature = ${staticNotes.baseColSig}`);
const leftTenants = (await P.tenant.count({ where: { slug: { startsWith: SLUG } } }).catch(() => -1)) as number;
const leftUsers = (await P.user.count({ where: { OR: [{ id: { in: users.length ? users : ["∅"] } }, { email: { startsWith: `${SLUG}-` } }] } }).catch(() => -1)) as number;
const leftAudit = (await P.auditLog.count({ where: { OR: [{ tenantId: { in: tenants.length ? tenants : ["∅"] } }, { actorId: OWNER_UID }] } }).catch(() => -1)) as number;
const leftLaw = (await tableExists("HrLawTable").catch(() => false)) ? await rawCount("HrLawTable", `"sourceKey" LIKE $1`, `${LAW_PREFIX}%`) : 0;
const residue = [...left, ...(leftTenants ? [`tenant=${leftTenants}`] : []), ...(leftUsers ? [`user=${leftUsers}`] : []), ...(leftAudit ? [`audit=${leftAudit}`] : []), ...(leftLaw ? [`law=${leftLaw}`] : [])];
console.log(`RESIDUE ${residue.length ? residue.join(",") : "none"} (tenants=${tenants.length} users=${users.length})`);
chk("Z1", residue.length === 0 && tenants.length > 0, "none", residue.join(",") || "none");
for (const [id] of CHECKS) if (!results.has(id)) chk(id.replace(/^H1\.3-/, ""), false, "checked", crashed ? `not reached (harness crashed: ${crashed.slice(0, 120)})` : GROUP_CRASHES.length ? `not reached (group crash: ${GROUP_CRASHES.join(" · ").slice(0, 200)})` : "not reached");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
const asBase = [...results.entries()].filter(([id, r]) => (BASE.get(id) === "RED" ? !r.ok : r.ok)).length;
const offBase = [...results.entries()].filter(([id, r]) => (BASE.get(id) === "RED" ? r.ok : !r.ok)).map(([id]) => `${id}(${BASE.get(id)}→${results.get(id)!.ok ? "pass" : "fail"})`);
const nRed = CHECKS.filter(([, , , b]) => b === "RED").length;
console.log(`BASE-EXPECTATION ${asBase}/${results.size} as registered (RED-by-design ${nRed} · GREEN controls ${CHECKS.length - nRed})${offBase.length ? ` · off: ${offBase.join(" ")}` : ""}`);
console.log(`\n===== ${SUITE} ===== passed ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}${crashed ? " · CRASHED" : ""}${GROUP_CRASHES.length ? ` · group crashes ${GROUP_CRASHES.length}` : ""}`);
console.log(
  `JSON_SUMMARY ${JSON.stringify({
    suite: SUITE,
    total: results.size,
    passed: results.size - failed.length,
    failed,
    findings: failed.map((id) => ({ id, sev: SEV.get(id) ?? "CRITICAL" })),
    skipped: false,
    forced: FORCE,
    crashed: !!crashed,
    groupCrashes: GROUP_CRASHES,
    missing: skipReasons,
    baseRed: nRed,
    baseGreen: CHECKS.length - nRed,
    offBase,
  })}`,
);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);
