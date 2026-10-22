// QC — HR V2 · H1.1 — org axis + lifecycle + pay type: HrEmployee.unitId (home branch = BusinessUnit) · HrEmployeeUnit (borrowed) ·
//      employmentStatus · probationEndAt/contractEndAt · HrSalaryProfile.payType + daily/hourly rates · hrScopeOf/unitWhere branch scope ·
//      writes carry unitId · DAILY/HOURLY runs refused until H3.4 (MONTHLY digest byte-identical) · verifyPin honours unitId · backfill · seed
// ⚠️ Oracle under change control (controller owns it) — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// requires: nothing seeded for the main groups — own throwaway tenants `qc-hr-h1.1-<stamp>` (main, 2 units) · `-one` (1 unit, backfill) ·
//   `-two` (2 units, backfill + other tenant), swept in `finally` · S9.2/S9.3 READ (never write) the seeded `qc-hr-v2` tenant if present
//
// Contract (ledger/hr-briefs/hr-brief-H1.1.md §2 R1–R11 · §3 · §6 Q1–Q3 · base session/hr 9c5aa1ea ⊇ hotfix afcb9bc3 · H0.7 NOT merged):
//   R1 migration 20261204000000_hr_org_axis (additive): HrEmployee."unitId" TEXT NULL (no FK — repo convention for unit refs, Q1) ·
//      "employmentStatus" "HrEmploymentStatus" NULL {PROBATION, ACTIVE, ENDED} · "probationEndAt"/"contractEndAt" DATE NULL ·
//      indexes (systemId, unitId) · (systemId, employmentStatus) · table HrEmployeeUnit {id, tenantId, systemId, employeeId, unitId,
//      fromDate DATE, toDate DATE NULL, note, createdAt} + (systemId, employeeId) · (systemId, unitId) + raw partial unique
//      (employeeId, unitId) WHERE "toDate" IS NULL · HrSalaryProfile."payType" "HrPayType" NOT NULL DEFAULT 'MONTHLY' {MONTHLY, DAILY, HOURLY} ·
//      "dailyRateSatang"/"hourlyRateSatang" INTEGER NULL · rates enforced in code (DAILY ⇒ daily > 0 · HOURLY ⇒ hourly > 0)
//      (all new columns are read/written here through $queryRaw / $executeRaw only — the base Prisma client does not know them)
//   R2 scripts/hr-backfill-units.mts (dry-run default · --apply · --tenant · idempotent · counts only): 1 unit ⇒ every employee gets it ·
//      ≥2 units ⇒ unitId stays null · status: endDate past or active=false ⇒ ENDED · employmentType PROBATION ⇒ PROBATION · else ACTIVE
//   R3 src/lib/modules/hr/scope.ts hrScopeOf(viewer) → { unitIds: "*" | string[] } (OWNER or unitAccess ∋ "*" ⇒ "*") · unitWhere(scope)
//      = Prisma where fragment applied to HrEmployee: "*" ⇒ every row (incl. unitId null) · list ⇒ home unit ∈ list OR an HrEmployeeUnit
//      borrowing into the list open today · unitId null ⇒ only "*" viewers · dated rows (leave / attendance): borrowing window covers the date
//   R4 reads apply the scope — ORACLE CONTRACT (brief names no signature): service readers take an optional trailing `scope` argument
//      listEmployees(ctx, take, scope) · listLeaves(ctx, take, scope) · pendingLeaves(ctx, take, scope) · listAttendance(ctx, take, scope) ·
//      listAdjustments(ctx, periodKey, take, scope) · viewer loaders apply hrScopeOf(v) themselves (leaveItemsForViewer ·
//      loadEmployeeProfileForViewer · loadPayslipForViewer) · AI pending_leaves applies the actor's scope · CRM readers unchanged
//   R5 writes: assertCan({module:"hr", action, unitId}) with the unit from the DB row · out-of-branch ⇒ "พนักงานคนนี้อยู่สาขาอื่น — คุณจัดการได้เฉพาะสาขาของคุณ" ·
//      null-unit targets only for all-branch actors · createEmployeeAction form field `unitId` must be ∈ the actor's units (null only all-branch)
//   R6 money gate unchanged · createPayrollRun refuses when any active profile is DAILY/HOURLY: "ยังไม่รองรับค่าจ้างรายวัน/รายชั่วโมงในรอบจ่าย — รอ H3.4" ·
//      MONTHLY run byte-identical (frozen digest below) · payroll-rules.ts FREEZE
//   R7 setEmployeeActive(false) ⇒ ENDED + endDate = today (Bangkok) when null · reactivation ⇒ ACTIVE (dates kept) · profile DTO adds
//      unitId · unitName · employmentStatus · probationEndAt · contractEndAt (+ payType only for payroll viewers) · profile form fields of the
//      same names (ORACLE CONTRACT: `unitId` · `employmentStatus` · `probationEndAt` · `contractEndAt`)
//   R9 verifyPin({ …, unitId }) — home/borrowed unit ≠ unitId ⇒ the same wrong-PIN text, counted like a wrong PIN · omitted ⇒ old behaviour
//   R10 seed-hr-qc writes home units per HQC + one borrowed row (jay → huahin) · R11 fixed Thai texts · no e.message
//
// Groups: S1 schema/migration · S2 backfill (+X6 replay) · S3 hrScopeOf/unitWhere · S4 reads · S5 writes · S6 money · S7 lifecycle + DTO ·
//         S8 verifyPin · S9 seed contract · X2 isolation · X8 privacy · X9 register/visual statics · Z1 residue
// Base expectation per check (registry column 4): RED = needs H1.1 (red for the right reason on 9c5aa1ea) · GREEN = control that must stay green.
// Checks marked "needs H0.7" in the title read nothing of H0.7 — they stay valid whether H0.7 is merged first or not.
//
// FROZEN (computed on the base 9c5aa1ea by this oracle's S6.5 fixture — see MONTHLY_FIXTURE): payrollItemsDigest over the run items with
//   employeeId replaced by the fixture employee code (ids change every run · codes do not) + the 7 run totals + per-code flags.
//
// SKIP convention (house style of qc-hr-h0.6 / h0.7): while nothing of H1.1 exists (no migration folder · no hr/scope.ts · no backfill script)
//   the suite prints SKIPPED + JSON_SUMMARY {skipped:true} and exits 0 · QC_FORCE=1 (or --force-run) runs everything ·
//   on the base every RED check is red for the right reason, GREEN controls are green, no crash, no residue.
// Server actions are called for real inside a simulated Next request scope with real temporary Session rows (technique of qc-hr-h0.3 /
//   qc-hr-h0.7) — never over HTTP. --list = print every id without touching the DB.
//
// Run (QC4 only):
//   bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h1.1.mts
//   bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-hr-h1.1.mts      (SKIP exit 0 on the base)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const SUITE = "qc-hr-h1.1";
const ROOT = process.cwd();
const ARGV = process.argv.slice(2);
const LIST = ARGV.includes("--list");
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const QC4_HOST_MARK = "ep-frosty-lab";
const SLUG_PREFIX = "qc-hr-h1.1-";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SERVICE_FILE = "src/lib/modules/hr/service.ts";
const ACTIONS_FILE = "src/lib/modules/hr/actions.ts";
const PAY_ACTIONS_FILE = "src/lib/modules/hr/payroll-actions.ts";
const SCOPE_FILE = "src/lib/modules/hr/scope.ts";
const PRIVACY_SHARED = "src/lib/modules/hr/privacy-shared.ts";
const RULES_FILE = "src/lib/modules/hr/payroll-rules.ts";
const UI_FILE = "src/lib/modules/hr/ui.tsx";
const CORE_SCOPE = "src/lib/core/scope.ts";
const SCHEMA_DIR = "prisma/schema";
const HR_SCHEMA = "prisma/schema/hr.prisma";
const PAY_SCHEMA = "prisma/schema/payroll.prisma";
const MIG_DIR = "prisma/migrations/20261204000000_hr_org_axis";
const MIG_FILE = `${MIG_DIR}/migration.sql`;
const BACKFILL = "scripts/hr-backfill-units.mts";
const SEED_FILE = "scripts/seed-hr-qc.mts";
const VISUAL_FILE = "scripts/visual-hr.mts";
const UI_INVENTORY = "scripts/hr-ui-inventory.json";
const MSG_TH = "src/messages/th.json";
/** sha256 of payroll-rules.ts on the base 9c5aa1ea (FREEZE — COMMON §C.4 · same value as qc-hr-h0.6/h0.7) */
const RULES_SHA = "75a66c0c1354e932e7ba29609dcbf0919ffe82b51f476a3945fd1a0749833bf7";

// ── fixed texts (brief R2 · R5 · R6 · R9) ──
const T_OTHER_BRANCH = "พนักงานคนนี้อยู่สาขาอื่น — คุณจัดการได้เฉพาะสาขาของคุณ";
const T_PAYTYPE = "ยังไม่รองรับค่าจ้างรายวัน/รายชั่วโมงในรอบจ่าย — รอ H3.4";
const T_NO_UNIT_PROMPT = "ยังไม่ระบุสาขาประจำ";

/** visual-hr SPECS["1.1"] page keys (CONTROLLER-RUN screenshots — registered here, taken by the controller) */
const VISUAL_KEYS = ["register-branches", "register-branch-manager", "profile-unit"] as const;
/** DTO keys added by R7 (payType only for payroll viewers) */
const NEW_DTO_KEYS = ["unitId", "unitName", "employmentStatus", "probationEndAt", "contractEndAt", "payType"] as const;
/** HrEmployee / HrSalaryProfile columns on the base (additive check — nothing may disappear) */
const BASE_EMP_COLS = [
  "id", "tenantId", "systemId", "name", "phone", "position", "pinCode", "pinHash", "pinSetAt", "linkedUserId", "active", "createdAt", "updatedAt",
  "code", "nickname", "gender", "birthDate", "email", "department", "employmentType", "startDate", "endDate", "maritalStatus", "addressLine",
  "subdistrict", "district", "province", "postcode", "nationalId", "ssoNumber", "houseRegAddress", "bankName", "bankAccountNo", "bankAccountName",
  "emergencyName", "emergencyPhone", "emergencyRelation", "note", "partyId",
] as const;
const BASE_SAL_COLS = ["id", "tenantId", "systemId", "employeeId", "baseSalarySatang", "otHourlyRateSatang", "ssoEligible", "taxId", "personalDeductionJson", "createdAt", "updatedAt"] as const;

// ── S6.5 MONTHLY fixture (own HR system "M") — values frozen on the base ──
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
/** frozen on 9c5aa1ea (first forced run of this oracle) — payrollItemsDigest with employeeId := code */
const FROZEN_DIGEST = "72166a3e2a2ebb6a37405a105f7db540b946fda05fe020639bbe79a60b87e5c8";
/** frozen 7 totals gross·ssoEmployee·ssoEmployer·wht·net·add·deduct + flags per code */
const FROZEN_TOTALS = "10725000:195000:195000:100000:10430000:475000:100000";
const FROZEN_FLAGS = "M01=-,M02=-,M03=-,M04=PARTIAL_MONTH";

// ═════════════════════════ registry (id · group · severity · base expectation · title) ═════════════════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Base = "RED" | "GREEN";
type Def = readonly [string, string, Sev, Base, string];
const D = (id: string, g: string, sev: Sev, base: Base, title: string): Def => [`H1.1-${id}`, g, sev, base, title] as const;
const CHECKS: readonly Def[] = [
  // S1 schema / migration (R1)
  D("S1.1", "R1", "CRITICAL", "RED", "[static] migration " + MIG_DIR + " exists · additive (no DROP · no ALTER COLUMN · no RENAME) · CREATE TYPE HrEmploymentStatus (PROBATION, ACTIVE, ENDED) + HrPayType (MONTHLY, DAILY, HOURLY)"),
  D("S1.2", "R1", "CRITICAL", "RED", "[static] migration adds HrEmployee unitId TEXT · employmentStatus · probationEndAt DATE · contractEndAt DATE · HrSalaryProfile payType NOT NULL DEFAULT 'MONTHLY' · dailyRateSatang / hourlyRateSatang INTEGER (all nullable except payType)"),
  D("S1.3", "R1", "CRITICAL", "RED", "[static] migration creates HrEmployeeUnit + indexes (systemId,employeeId) (systemId,unitId) · partial unique (employeeId,unitId) WHERE toDate IS NULL · HrEmployee (systemId,unitId) (systemId,employmentStatus) · no FK to BusinessUnit (Q1 convention)"),
  D("S1.4", "R1", "MAJOR", "RED", "[static] schema: HrEmployee unitId String? · employmentStatus HrEmploymentStatus? · probationEndAt/contractEndAt DateTime? @db.Date · 2 @@index · employmentType kept · model HrEmployeeUnit (fromDate @db.Date · toDate? @db.Date · 2 @@index) · payType HrPayType @default(MONTHLY) + 2 Int? rates · core/scope.ts HrEmployeeUnit: sys()"),
  D("S1.5", "R1", "CRITICAL", "RED", "[db] QC4 columns: HrEmployee unitId text NULL · employmentStatus enum NULL · probationEndAt/contractEndAt date NULL · HrSalaryProfile payType NOT NULL default MONTHLY · rates integer NULL · enum labels exact and ordered"),
  D("S1.6", "R1", "MAJOR", "RED", "[db] QC4 indexes: HrEmployee (systemId,unitId) + (systemId,employmentStatus) · HrEmployeeUnit (systemId,employeeId) + (systemId,unitId) + UNIQUE (employeeId,unitId) WHERE toDate IS NULL · no FK from HrEmployee to BusinessUnit"),
  D("S1.7", "R1", "CRITICAL", "RED", "[db] partial unique enforced (rolled-back tx): 2nd open borrowing of one employee to the same unit ⇒ 23505 · a closed + an open borrowing ⇒ accepted"),
  D("S1.8", "R1", "CRITICAL", "GREEN", "[db] additive: every base column of HrEmployee (39) and HrSalaryProfile (11) still exists on QC4"),
  D("S1.9", "R1", "MAJOR", "RED", "[db] a new profile via setSalaryProfile (no payType given) has payType MONTHLY · rates null"),
  // S2 backfill (R2) + X6 replay
  D("S2.1", "R2", "CRITICAL", "RED", "[script] " + BACKFILL + " --tenant <one-unit> (dry-run default) exits 0 and changes nothing (unitId / employmentStatus still null)"),
  D("S2.2", "R2", "CRITICAL", "RED", "[script] --apply --tenant <one-unit> ⇒ every employee of that tenant (active or not) gets unitId = the single unit"),
  D("S2.3", "R2", "CRITICAL", "RED", "[script] statuses: endDate in the past ⇒ ENDED · active=false ⇒ ENDED · employmentType PROBATION ⇒ PROBATION · else (incl. future endDate) ACTIVE"),
  D("X6.1", "X6", "MAJOR", "RED", "[script] replay: second --apply ⇒ exit 0 · state byte-identical · output reports a 0 count"),
  D("S2.4", "R2", "CRITICAL", "RED", "[script] --apply --tenant <two-unit> ⇒ unitId stays null for every employee · statuses set per R2"),
  D("S2.5", "R2", "CRITICAL", "RED", "[script] tenant-scoped: the one-unit run left the two-unit tenant and the main tenant untouched (statuses null until their own run · main tenant never run)"),
  D("S2.6", "R2", "MAJOR", "RED", "[script] output = counts only: no employee name / id, no e-mail, no other tenant id (and the script ran)"),
  // S3 hrScopeOf / unitWhere (R3)
  D("S3.1", "R3", "CRITICAL", "RED", "[pure] hr/scope.ts exports hrScopeOf + unitWhere · OWNER (unitAccess []) ⇒ \"*\" · MANAGER [\"*\"] ⇒ \"*\" · STAFF [\"*\"] ⇒ \"*\""),
  D("S3.2", "R3", "CRITICAL", "RED", "[pure] MANAGER [u1] ⇒ [u1] · STAFF [u1,u2] ⇒ [u1,u2] · MANAGER [] ⇒ [] (no branch ⇒ nothing — not all) · malformed unitAccess ⇒ [] (fail closed)"),
  D("S3.3", "R3", "CRITICAL", "RED", "[db] HrEmployee where unitWhere(\"*\") ⇒ every row of the system incl. the null-unit employee e3"),
  D("S3.4", "R3", "CRITICAL", "RED", "[db] 🔴 unitWhere([u1]) ⇒ exactly e1 (home u1) + e4 (home u2, borrowed to u1, open) (+ u1 lifecycle rows) · never e2 (u2) · e3 (null) · e5 (borrowing closed)"),
  D("S3.5", "R3", "MAJOR", "RED", "[db] unitWhere([u2]) ⇒ e2 + e4 + e5 (home u2) · never e1 / e3 · unitWhere([]) ⇒ no row"),
  // S4 reads (R4)
  D("S4.1", "R4", "CRITICAL", "RED", "[service] 🔴 listEmployees(ctx, 200, scope(manager-u1)) ⇒ only u1 rows + borrowed-in e4 · listEmployees(ctx, 200, scope(owner)) ⇒ every active row incl. e3"),
  D("S4.2", "R4", "CRITICAL", "RED", "[dto] 🔴 leaveItemsForViewer(manager-u1): pending = {L1 e1, L4 e4} · history ⊆ u1 rows (e1 · e4 · e5's row inside its closed borrowing) · no e2/e3 rows · staff-u1 (linked e1) never sees e2/e3 rows (needs H0.7 or H1.1)"),
  D("S4.3", "R4", "CRITICAL", "RED", "[service] pendingLeaves(ctx,100,scope u1) = {L1,L4} · listLeaves(ctx,100,scope u1) = {L1,L4,L6 (e5, dated inside the closed borrowing)} — not L5 (e5 after the window) / L2 / L3 / L7"),
  D("S4.4", "R4", "MAJOR", "RED", "[service] listAttendance(ctx,50,scope u1) = {A1 e1 · A4 e4 inside borrowing · A6 e5 inside closed borrowing} — not A4b (e4 before borrowing) · A5 (e5 after) · A2 (e2) · A3 (e3)"),
  D("S4.5", "R4", "CRITICAL", "RED", "[ai] 🔴 pending_leaves for manager-u1 member actor ⇒ exactly {L1, L4} · for the owner actor ⇒ all 5 pending rows of the system"),
  D("S4.6", "R4", "MAJOR", "RED", "[service] listAdjustments(ctx, undefined, 200, scope u1) ⇒ only e1's adjustment · scope \"*\" ⇒ all 3"),
  D("S4.7", "R4", "CRITICAL", "RED", "[dto] 🔴 loadEmployeeProfileForViewer(manager-u1): e2 ⇒ null · e3 ⇒ null · e1 ⇒ profile · e4 (borrowed in, open) ⇒ profile"),
  D("S4.8", "R4", "CRITICAL", "RED", "[dto] 🔴 loadPayslipForViewer(payroll viewer of u1 only): e2's slip ⇒ null · e1's slip ⇒ ok · owner ⇒ e2's slip ok (branch = extra filter, never widens)"),
  D("S4.9", "R4", "CRITICAL", "GREEN", "[control] all-branch viewers unchanged: listEmployees(scope \"*\") = every active row · leaveItemsForViewer(owner · manager-all · payroll-all with hr.leave.read) = every row incl. null-unit e3"),
  // S5 writes (R5)
  D("S5.1", "R5", "MAJOR", "GREEN", "[action] [control] manager-u1 saveEmployeeProfileAction(e1) ⇒ ok · name changed"),
  D("S5.2", "R5", "CRITICAL", "RED", "[action] 🔴 manager-u1 saveEmployeeProfileAction(e2) ⇒ exactly \"" + T_OTHER_BRANCH + "\" · e2 unchanged"),
  D("S5.3", "R5", "CRITICAL", "RED", "[action] 🔴 manager-u1 saveEmployeeProfileAction(e3, unitId null) ⇒ refused (Thai, no leak) · e3 unchanged"),
  D("S5.4", "R5", "CRITICAL", "RED", "[action] 🔴 manager-u1 createEmployeeAction(unitId=u2) ⇒ no employee created (text, if any, = the out-of-branch text) · createEmployeeAction(no unitId) ⇒ no employee created"),
  D("S5.5", "R5", "MAJOR", "RED", "[action] manager-u1 createEmployeeAction(unitId=u1) ⇒ created with unitId = u1"),
  D("S5.6", "R5", "MAJOR", "RED", "[action] owner: save e2 ok · save e3 ok · create with unitId=u2 ⇒ unitId u2 · create without unitId ⇒ unitId null"),
  D("S5.7", "R5", "CRITICAL", "RED", "[action] 🔴 manager-u1 on e2: setPinAction + clockAction ⇒ the out-of-branch text (no attendance row) · decideLeaveAction(L2) ⇒ still PENDING · removeEmployeeAction ⇒ still active"),
  D("S5.8", "R5", "CRITICAL", "RED", "[action] 🔴 manager-u1 moves e1 to u2 via the profile form (unitId=u2) ⇒ refused · e1.unitId stays u1"),
  D("S5.9", "R5", "MAJOR", "RED", "[action] borrowed e4 (home u2, open borrowing u1): manager-u1 clockAction(e4) now ⇒ ok (dated row, borrowed unit) · profile edit e4 ⇒ refused (home unit u2)"),
  D("S5.10", "R5", "MAJOR", "RED", "[static] every assertHrCan(...) call in hr/actions.ts + payroll-actions.ts passes a unitId or carries an all-branch marker (\"all-branch\"/\"ทุกสาขา\") · both helpers forward unitId into assertCan · the out-of-branch text is defined in hr/*.ts"),
  // S6 money (R6)
  D("S6.1", "R6", "CRITICAL", "GREEN", "[dto] [control] manager-u1 + manager-all profile DTOs carry none of the 6 sensitive keys and no payType"),
  D("S6.2", "R6", "CRITICAL", "GREEN", "[action] [control] branch scope never grants payroll: manager-u1 setSalaryProfileAction(e1) ⇒ refused · e1's salary unchanged"),
  D("S6.3", "R6", "CRITICAL", "RED", "[service] 🔴 createPayrollRun on a system with a DAILY profile ⇒ PayrollInputError \"" + T_PAYTYPE + "\" · 0 runs for the period"),
  D("S6.4", "R6", "CRITICAL", "RED", "[service] createPayrollRun on a system whose only profile is HOURLY ⇒ same text · 0 runs"),
  D("S6.5", "R6", "CRITICAL", "GREEN", "[service] [control] MONTHLY-only fixture run: items digest (employeeId := code) · 7 totals · flags = values frozen on the base 9c5aa1ea"),
  D("S6.6", "C.4", "CRITICAL", "GREEN", "[static] [control] payroll-rules.ts byte-identical (sha256 of the base)"),
  D("S6.7", "R1", "MAJOR", "RED", "[service] setSalaryProfile payType DAILY with dailyRateSatang 0 ⇒ refused (profile not DAILY) · DAILY with 40000 ⇒ stored payType DAILY · dailyRateSatang 40000"),
  // S7 lifecycle + DTO (R7)
  D("S7.1", "R7", "CRITICAL", "RED", "[service] setEmployeeActive(false) on e6 (no endDate) ⇒ employmentStatus ENDED · endDate = today (Bangkok)"),
  D("S7.2", "R7", "MAJOR", "RED", "[service] setEmployeeActive(false) on e7 (endDate 2030-01-31) ⇒ ENDED · endDate kept 2030-01-31"),
  D("S7.3", "R7", "MAJOR", "RED", "[service] setEmployeeActive(true) on e6 ⇒ ACTIVE · endDate kept"),
  D("S7.4", "R7", "CRITICAL", "RED", "[dto] owner profile of e1: unitId = u1 · unitName = u1's name · employmentStatus · probationEndAt · contractEndAt · payType keys present"),
  D("S7.5", "R7", "CRITICAL", "RED", "[dto] manager-all profile has the 5 non-money keys but no payType · payroll-all (hr.payroll.read) sees payType MONTHLY for e1 and DAILY for e2"),
  D("S7.6", "C.1", "CRITICAL", "GREEN", "[dto] [control] privacy matrix unchanged for all-branch viewers: base keys ⊆ DTO ⊆ base ∪ sensitive ∪ new keys · sensitive keys only for owner/payroll · plain member + other tenant ⇒ null"),
  D("S7.7", "R7", "MAJOR", "RED", "[action] owner saves e1 profile with employmentStatus PROBATION · probationEndAt 2031-03-31 · contractEndAt 2031-12-31 ⇒ stored"),
  D("S7.8", "R7", "MAJOR", "RED", "[static] privacy-shared.ts: EMPLOYEE_PROFILE_FIELDS keeps every base key + unitId/unitName/employmentStatus/probationEndAt/contractEndAt · EMPLOYEE_SENSITIVE_FIELDS still exactly the 6 keys · payType typed optional"),
  // S8 verifyPin (R9)
  D("S8.1", "R9", "CRITICAL", "RED", "[pin] 🔴 e2's PIN (home u2) with unitId = u1 ⇒ exactly the wrong-PIN text"),
  D("S8.2", "R9", "CRITICAL", "GREEN", "[pin] [control] e2's PIN with unitId = u2 ⇒ ok e2 · e4's PIN (borrowed to u1, open) with unitId = u1 ⇒ ok e4 · with u2 ⇒ ok"),
  D("S8.3", "R9", "MAJOR", "RED", "[pin] e5's PIN (borrowing to u1 closed) with unitId = u1 ⇒ wrong-PIN text"),
  D("S8.4", "R9", "MAJOR", "RED", "[pin] e3's PIN (no home unit) with unitId = u1 ⇒ wrong-PIN text (literal reading of R9 — flagged to the controller)"),
  D("S8.5", "R9", "CRITICAL", "GREEN", "[pin] [control] unitId omitted ⇒ ok for e1 · e2 · e3 · e4 (tenant-wide caller unchanged)"),
  D("S8.6", "R9", "MAJOR", "RED", "[pin] limiter unchanged: the unit-mismatch attempt is counted like a wrong PIN (caller bucket = 1) · a correct attempt leaves its bucket at 0"),
  // S9 seed contract (R10)
  D("S9.1", "R10", "MAJOR", "RED", "[static] seed-hr-qc.mts writes HrEmployee.unitId from HQC unit and an HrEmployeeUnit row for borrowedTo"),
  D("S9.2", "R10", "MAJOR", "RED", "[db read] seeded qc-hr-v2: every employee's unitId = the HQC home unit (by slug) · jay has one open borrowing to huahin"),
  D("S9.3", "R10", "MINOR", "RED", "[db read] seeded qc-hr-v2: employmentStatus per R2 (bow/kong PROBATION · fai ENDED · rest ACTIVE)"),
  // X groups
  D("X2.1", "X2", "CRITICAL", "GREEN", "[control] isolation: other-tenant ctx with our systemId ⇒ 0 employees / leaves / attendance · system B's employee never in any system-A result (every viewer, every scope)"),
  D("X8.1", "X8", "CRITICAL", "RED", "[texts] refusals of S5 (≥3) are Thai · carry no employee/unit name, no id, no error internals"),
  D("X8.2", "X8", "CRITICAL", "GREEN", "[dto] [control] payType never reaches non-payroll viewers (manager-u1 · manager-all · hr.leave.read staff) — not even for the DAILY employee"),
  D("X9.1", "X9", "MAJOR", "RED", "[static] register UI: ui.tsx uses hrScopeOf · \"" + T_NO_UNIT_PROMPT + "\" in th.json or hr UI · a branch testid (…branch…/…unit…) listed in hr-ui-inventory.json"),
  D("X9.2", "X9", "MINOR", "RED", "[static] visual-hr.mts SPECS[\"1.1\"] registers " + VISUAL_KEYS.join(" · ") + " (CONTROLLER-RUN, 3 viewports × owner / manager(branch) / staff)"),
  D("Z1", "-", "CRITICAL", "GREEN", "residue: tenants qc-hr-h1.1-* gone · no row of ours in HR/payroll/borrowing/audit/outbox · users/sessions gone · no rate rows"),
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
  const full = `H1.1-${id}`;
  if (!TITLE.has(full)) throw new Error(`unregistered check id: ${id}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
const rd = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const short = (v: unknown, n = 200) => {
  try {
    return (typeof v === "string" ? v : JSON.stringify(v) ?? "undefined").replace(/\s+/g, " ").slice(0, n);
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
const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).replace(/\s+/g, " ").slice(0, 180);
const isThai = (s: string) => /[฀-๿]/.test(s);
const techLeak = (s: string) => /Error\b|prisma|P20\d\d|undefined|is not a function|\bat \/|invocation|ECONN|23505|ไม่มีสิทธิ์: hr\./i.test(s);
const textOf = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["message", "reason", "error", "note"]) if (typeof o[k] === "string" && o[k]) return String(o[k]);
  }
  return "";
};
const srt = (a: Iterable<string>) => [...a].sort().join(",");

// ═════════════════════════ statics (no DB) ═════════════════════════
function migStatements(): string {
  return rd(MIG_FILE)
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n")
    .replace(/\s+/g, " ");
}
function runStatic(): void {
  console.log("── [S1/S5/S6/S7/S9/X9] statics ──");
  const mig = migStatements();
  const has = (re: RegExp) => re.test(mig);
  // S1.1
  const s11 = {
    exists: !!mig.trim(),
    drop: /\bDROP\b/i.test(mig),
    alterCol: /ALTER COLUMN/i.test(mig),
    rename: /\bRENAME\b/i.test(mig),
    statusEnum: has(/CREATE TYPE "HrEmploymentStatus" AS ENUM \( ?'PROBATION', ?'ACTIVE', ?'ENDED' ?\)/i),
    payEnum: has(/CREATE TYPE "HrPayType" AS ENUM \( ?'MONTHLY', ?'DAILY', ?'HOURLY' ?\)/i),
  };
  chk("S1.1", s11.exists && !s11.drop && !s11.alterCol && !s11.rename && s11.statusEnum && s11.payEnum, "exists · additive · 2 enums", short(s11));
  // S1.2
  const col = (name: string, type: string) => new RegExp(`ADD COLUMN "${name}" ${type}(?! NOT NULL)( |,|;|$)`, "i").test(mig);
  const s12 = {
    unitId: col("unitId", "TEXT"),
    status: col("employmentStatus", '"HrEmploymentStatus"'),
    probation: col("probationEndAt", "DATE"),
    contract: col("contractEndAt", "DATE"),
    payType: /ADD COLUMN "payType" "HrPayType" NOT NULL DEFAULT 'MONTHLY'/i.test(mig),
    daily: col("dailyRateSatang", "INTEGER"),
    hourly: col("hourlyRateSatang", "INTEGER"),
    empTable: /ALTER TABLE "HrEmployee"/i.test(mig),
    salTable: /ALTER TABLE "HrSalaryProfile"/i.test(mig),
  };
  chk("S1.2", Object.values(s12).every(Boolean), "all 7 columns (+ both ALTER TABLE)", short(s12));
  // S1.3
  const idx = (table: string, cols: string[]) => new RegExp(`CREATE INDEX "[^"]+" ON "${table}" ?\\( ?${cols.map((c) => `"${c}"`).join(", ?")} ?\\)`, "i").test(mig);
  const s13 = {
    table: /CREATE TABLE "HrEmployeeUnit" \(/i.test(mig),
    tableCols: ["tenantId", "systemId", "employeeId", "unitId", "fromDate", "toDate", "note", "createdAt"].every((c) => new RegExp(`CREATE TABLE "HrEmployeeUnit" \\([^;]*"${c}"`, "i").test(mig)),
    fromDate: /CREATE TABLE "HrEmployeeUnit" \([^;]*"fromDate" DATE NOT NULL/i.test(mig),
    toDate: /CREATE TABLE "HrEmployeeUnit" \([^;]*"toDate" DATE(,| ?\))/i.test(mig),
    eu1: idx("HrEmployeeUnit", ["systemId", "employeeId"]),
    eu2: idx("HrEmployeeUnit", ["systemId", "unitId"]),
    partial: /CREATE UNIQUE INDEX "[^"]+" ON "HrEmployeeUnit" ?\( ?"employeeId", ?"unitId" ?\) WHERE \(?"toDate" IS NULL\)?/i.test(mig),
    e1: idx("HrEmployee", ["systemId", "unitId"]),
    e2: idx("HrEmployee", ["systemId", "employmentStatus"]),
    noFkUnit: !/REFERENCES "BusinessUnit"/i.test(mig),
  };
  chk("S1.3", s13.table && s13.tableCols && s13.fromDate && s13.toDate && s13.eu1 && s13.eu2 && s13.partial && s13.e1 && s13.e2 && s13.noFkUnit, "table + 4 indexes + partial unique · no BusinessUnit FK", short(s13));
  // S1.4 schema + scope registration
  const sch = rd(HR_SCHEMA);
  const pay = rd(PAY_SCHEMA);
  const allSchema = existsSync(join(ROOT, SCHEMA_DIR))
    ? readdirSync(join(ROOT, SCHEMA_DIR))
        .filter((f) => f.endsWith(".prisma"))
        .map((f) => rd(join(SCHEMA_DIR, f)))
        .join("\n")
    : "";
  const emp = block(sch, "model HrEmployee {");
  const eu = block(allSchema, "model HrEmployeeUnit {");
  const sal = block(pay, "model HrSalaryProfile {");
  const enumBody = (name: string) => block(allSchema, `enum ${name} {`).replace(/\/\/.*$/gm, "").replace(/\s+/g, " ");
  const s14 = {
    unitId: /^\s*unitId\s+String\?/m.test(emp),
    status: /^\s*employmentStatus\s+HrEmploymentStatus\?/m.test(emp),
    probation: /^\s*probationEndAt\s+DateTime\?\s+@db\.Date/m.test(emp),
    contract: /^\s*contractEndAt\s+DateTime\?\s+@db\.Date/m.test(emp),
    idx1: /@@index\(\[systemId,\s*unitId\]\)/.test(emp),
    idx2: /@@index\(\[systemId,\s*employmentStatus\]\)/.test(emp),
    typeKept: /^\s*employmentType\s+HrEmploymentType\?/m.test(emp),
    statusEnum: enumBody("HrEmploymentStatus") === "enum HrEmploymentStatus { PROBATION ACTIVE ENDED }",
    euModel: !!eu && /^\s*fromDate\s+DateTime\s+@db\.Date/m.test(eu) && /^\s*toDate\s+DateTime\?\s+@db\.Date/m.test(eu) && /@@index\(\[systemId,\s*employeeId\]\)/.test(eu) && /@@index\(\[systemId,\s*unitId\]\)/.test(eu),
    payType: /^\s*payType\s+HrPayType\s+@default\(MONTHLY\)/m.test(sal),
    rates: /^\s*dailyRateSatang\s+Int\?/m.test(sal) && /^\s*hourlyRateSatang\s+Int\?/m.test(sal),
    payEnum: enumBody("HrPayType") === "enum HrPayType { MONTHLY DAILY HOURLY }",
    scopeReg: /\bHrEmployeeUnit:\s*sys\(\)/.test(rd(CORE_SCOPE)),
  };
  chk("S1.4", Object.values(s14).every(Boolean), "every field/enum/index/model + scope registration", short(Object.fromEntries(Object.entries(s14).filter(([, v]) => !v)), 220) || "all");

  // S5.10 assertHrCan call sites carry unitId (or an explicit all-branch marker)
  const s510: Record<string, unknown> = {};
  let bad = 0;
  let total = 0;
  for (const f of [ACTIONS_FILE, PAY_ACTIONS_FILE]) {
    const src = rd(f);
    const lines = src.split("\n");
    const helper = block(src, "function assertHrCan(", "\n}");
    const helperOk = /unitId/.test(helper) && /assertCan\([^;]*unitId/s.test(helper);
    s510[`${f.split("/").pop()}:helper`] = helperOk;
    if (!helperOk) bad++;
    lines.forEach((l, i) => {
      if (!/\bassertHrCan\(/.test(l) || /function assertHrCan\(/.test(l)) return;
      total++;
      const call = l.slice(l.indexOf("assertHrCan("));
      const args = call.slice(0, call.indexOf(")") + 1);
      const marked = /all-branch|ทุกสาขา/.test(l) || /all-branch|ทุกสาขา/.test(lines[i - 1] ?? "");
      if (!(/,\s*[^,]+,\s*[^)]+\)/.test(args) && /unit/i.test(args)) && !marked) bad++;
    });
  }
  const hrSrc = readdirSync(join(ROOT, "src/lib/modules/hr"))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => rd(`src/lib/modules/hr/${f}`))
    .join("\n");
  const textDefined = hrSrc.includes(T_OTHER_BRANCH);
  chk("S5.10", bad === 0 && total > 0 && textDefined, "0 call sites without unitId/marker · helpers forward unitId · text defined", `bad=${bad}/${total} helpers=${short(s510)} textDefined=${textDefined}`);

  // S6.6 FREEZE
  const rules = rd(RULES_FILE);
  const rsha = createHash("sha256").update(rules).digest("hex");
  chk("S6.6", rsha === RULES_SHA, RULES_SHA.slice(0, 16), `${rsha.slice(0, 16)} len=${rules.length}`);

  // S7.8 privacy-shared keys
  const ps = rd(PRIVACY_SHARED);
  const listOf = (name: string) => [...block(ps, `export const ${name} = [`, "] as const").matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]!);
  const prof = listOf("EMPLOYEE_PROFILE_FIELDS");
  const sens = listOf("EMPLOYEE_SENSITIVE_FIELDS");
  const BASE_PROFILE = ["id", "name", "nickname", "code", "phone", "email", "gender", "birthDate", "maritalStatus", "position", "department", "employmentType", "startDate", "endDate", "addressLine", "subdistrict", "district", "province", "postcode", "emergencyName", "emergencyPhone", "emergencyRelation", "note", "active", "hasPin"];
  const SENS6 = ["nationalId", "ssoNumber", "houseRegAddress", "bankName", "bankAccountNo", "bankAccountName"];
  const dtoType = block(ps, "export type EmployeeProfileDto = {", "\n};");
  const s78 = {
    baseKept: BASE_PROFILE.every((k) => prof.includes(k)),
    newKeys: ["unitId", "unitName", "employmentStatus", "probationEndAt", "contractEndAt"].every((k) => prof.includes(k)),
    payTypeNotPublic: !prof.includes("payType"),
    sens6: srt(sens) === srt(SENS6),
    payTypeOptional: /payType\?\s*:/.test(dtoType),
  };
  chk("S7.8", Object.values(s78).every(Boolean), "base kept · 5 new keys · payType optional (not in public list) · 6 sensitive", short(s78));

  // S9.1 seed writes units + borrowing
  const seed = rd(SEED_FILE);
  const s91 = { unitId: /unitId/.test(seed) && /\.unit\b/.test(seed), borrow: /HrEmployeeUnit|hrEmployeeUnit/.test(seed) && /borrowedTo/.test(seed) };
  chk("S9.1", s91.unitId && s91.borrow, "unitId from HQC unit + borrowing row", short(s91));

  // X9.1 register UI
  const ui = rd(UI_FILE);
  const inv = rd(UI_INVENTORY);
  const th = rd(MSG_TH);
  const tids = [...ui.matchAll(/data-testid=["'{`]+([\w:.\-]*(?:branch|unit)[\w:.\-]*)/gi)].map((m) => m[1]!).filter((t) => inv.includes(`"${t}`));
  const x91 = { scope: /hrScopeOf/.test(ui), prompt: th.includes(T_NO_UNIT_PROMPT) || ui.includes(T_NO_UNIT_PROMPT), testids: tids.length };
  chk("X9.1", x91.scope && x91.prompt && x91.testids > 0, "hrScopeOf · prompt text · ≥1 branch testid in inventory", short(x91));

  // X9.2 visual-hr SPECS["1.1"]
  const vis = rd(VISUAL_FILE);
  const spec11 = block(vis, '"1.1":', "\n  ],") || block(vis, "'1.1':", "\n  ],");
  const x92 = Object.fromEntries(VISUAL_KEYS.map((k) => [k, spec11.includes(`"${k}"`) || spec11.includes(`'${k}'`)]));
  chk("X9.2", !!spec11 && Object.values(x92).every(Boolean), "SPECS[\"1.1\"] with the 3 keys", spec11 ? short(x92) : "no SPECS[\"1.1\"]");
}

// ═════════════════════════ SKIP guard (static — before any DB connection) ═════════════════════════
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, MIG_FILE)) && !existsSync(join(ROOT, SCOPE_FILE)) && !existsSync(join(ROOT, BACKFILL))) {
  skipReasons.push(`H1.1 not built: ${MIG_DIR} absent · ${SCOPE_FILE} absent · ${BACKFILL} absent`);
}
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: H1.1 not built`);
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
  console.log(`[${SUITE}] DB host = ${host} (${host.includes(QC4_HOST_MARK) ? "QC4 ✓" : "not QC4"})`);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — running although: ${skipReasons.join(" · ")} (expect RED for the right reason, no crash)`);

// ── Next request scope (technique of qc-hr-h0.3 / qc-hr-h0.7) ──
const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null)) as Any;
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  if (!nextWork?.workAsyncStorage || !nextWorkUnit?.workUnitAsyncStorage || !nextCookies?.RequestCookies) throw new Error("no Next request scope (next/dist/... not loadable)");
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": SUITE, "x-forwarded-for": "203.0.113.141" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  return nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}

const { prisma } = (await import("@/lib/core/db")) as Any;
const P = prisma as Any;
const sys = (await import("@/lib/modules/system/service")) as Any;
const hr = (await import("@/lib/modules/hr/service")) as Any;
const pay = (await import("@/lib/modules/hr/payroll")) as Any;
const pinMod = (await import("@/lib/modules/hr/pin" as string)) as Any;
const act = (await import("@/lib/modules/hr/actions" as string)) as Any;
const payAct = (await import("@/lib/modules/hr/payroll-actions" as string)) as Any;
const privacy = (await import("@/lib/modules/hr/privacy" as string)) as Any;
const digestMod = (await import("@/lib/modules/hr/payroll-digest" as string)) as Any;
const scopeMod = existsSync(join(ROOT, SCOPE_FILE)) ? ((await import("@/lib/modules/hr/scope" as string).catch((e: unknown) => ({ __err: errText(e) }))) as Any) : null;
const aiActor = (await import("@/lib/ai/actor")) as Any;
const coreHash = (await import("@/lib/core/hash" as string)) as Any;
const hqcEnv = (await import("./hr-qc-env.mjs" as string)) as Any;
const WRONG_PIN = String(pinMod?.PIN_TEXT?.wrong ?? "PIN ไม่ถูกต้อง");

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const SLUG = `${SLUG_PREFIX}${stamp}`;
const tenants: string[] = [];
const users: string[] = [];
const emails: string[] = [];
const names: string[] = []; // every person / employee / unit name we create (X8 / S2.6 leak checks)
const ids: string[] = [];

// ── schema probes (the base client does not know the new columns — raw SQL only) ──
const colCache = new Map<string, boolean>();
async function colExists(table: string, column: string): Promise<boolean> {
  const k = `${table}.${column}`;
  if (!colCache.has(k)) {
    const r = (await P.$queryRawUnsafe(`SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`, table, column)) as Any[];
    colCache.set(k, r.length > 0);
  }
  return colCache.get(k)!;
}
async function tableExists(table: string): Promise<boolean> {
  const r = (await P.$queryRawUnsafe(`SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`, table)) as Any[];
  return r.length > 0;
}
/** value of a column the base client does not know — "∅col" when the column is absent */
async function rawCol(table: string, column: string, id: string): Promise<string | null> {
  if (!(await colExists(table, column))) return "∅col";
  const r = (await P.$queryRawUnsafe(`SELECT "${column}"::text AS v FROM "${table}" WHERE id = $1`, id)) as Any[];
  return r[0] ? (r[0].v ?? null) : "∅row";
}
async function rawSet(table: string, column: string, id: string, value: string | number | null, cast = ""): Promise<boolean> {
  if (!(await colExists(table, column))) return false;
  await P.$executeRawUnsafe(`UPDATE "${table}" SET "${column}" = $1${cast} WHERE id = $2`, value, id);
  return true;
}
let HAS_EU = false;
async function addBorrow(tenantId: string, systemId: string, employeeId: string, unitId: string, fromDate: string, toDate: string | null): Promise<string | null> {
  if (!HAS_EU) return null;
  const id = `qch11${stamp}${Math.random().toString(36).slice(2, 8)}`;
  await P.$executeRawUnsafe(
    `INSERT INTO "HrEmployeeUnit" ("id","tenantId","systemId","employeeId","unitId","fromDate","toDate","note","createdAt") VALUES ($1,$2,$3,$4,$5,$6::date,$7::date,$8,now())`,
    id, tenantId, systemId, employeeId, unitId, fromDate, toDate, "QC H1.1 ยืมตัว",
  );
  return id;
}

type Who = { id: string; name: string; email: string; cookie: string; tenantId: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, boolean> };
async function mkUser(tenantId: string, tag: string, name: string, role: Who["role"], unitAccess: string[], permissions: Record<string, boolean>): Promise<Who> {
  const email = `${SLUG}-${tag}@qc.invalid`;
  const u = await P.user.create({ data: { email, name } });
  users.push(u.id);
  emails.push(email);
  names.push(name);
  ids.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions, acceptedAt: new Date() } });
  const token = coreHash.randomToken(32) as string;
  const DAY = 86_400_000;
  await P.session.create({ data: { userId: u.id, tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 30 * DAY), expiresAt: new Date(Date.now() + 90 * DAY) } });
  const cookie = `shark_session=${token}; __Host-shark_session=${token}; shark_tenant=${tenantId}`;
  return { id: u.id, name, email, cookie, tenantId, role, unitAccess, permissions };
}
const vOf = (w: Who) => ({ role: w.role, unitAccess: w.unitAccess, permissions: w.permissions, userId: w.id });
type EmpOpts = { linkedUserId?: string | null; unitId?: string | null; code?: string; employmentType?: string; endDate?: string; startDate?: string; active?: boolean };
async function mkEmp(tenantId: string, systemId: string, name: string, o: EmpOpts = {}): Promise<string> {
  const e = await P.hrEmployee.create({
    data: {
      tenantId,
      systemId,
      name,
      linkedUserId: o.linkedUserId ?? null,
      code: o.code ?? null,
      employmentType: o.employmentType ?? null,
      endDate: o.endDate ? new Date(`${o.endDate}T00:00:00Z`) : null,
      startDate: o.startDate ? new Date(`${o.startDate}T00:00:00Z`) : null,
      active: o.active ?? true,
    },
  });
  names.push(name);
  ids.push(e.id);
  if (o.unitId) await rawSet("HrEmployee", "unitId", e.id, o.unitId);
  return e.id as string;
}
async function newTenant(suffix: string, name: string): Promise<string> {
  const t = await P.tenant.create({ data: { name, slug: `${SLUG}${suffix}` } });
  tenants.push(t.id);
  ids.push(t.id);
  return t.id as string;
}
async function newUnit(tenantId: string, name: string, slug: string): Promise<string> {
  const u = await P.businessUnit.create({ data: { tenantId, type: "SHOP", name, slug: `${SLUG}-${slug}` } });
  names.push(name);
  ids.push(u.id);
  return u.id as string;
}

function spawnTsx(args: string[], timeoutMs = 240_000): Promise<{ code: number; out: string }> {
  return new Promise((res) => {
    const c = spawn("pnpm", ["exec", "tsx", ...args], { env: { ...process.env } });
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
const runBackfill = (args: string[]) => (existsSync(join(ROOT, BACKFILL)) ? spawnTsx([BACKFILL, ...args]) : Promise.resolve({ code: -1, out: `∅ ${BACKFILL}` }));

/** call a server action inside a request scope — value or thrown message */
type Out = { threw: boolean; value: unknown; text: string };
async function inAct(who: Who, path: string, fn: () => Promise<unknown>): Promise<Out> {
  try {
    const v = await inScope(who.cookie, path, fn);
    return { threw: false, value: v, text: textOf(v) };
  } catch (e) {
    return { threw: true, value: undefined, text: e instanceof Error ? e.message : String(e) };
  }
}
const okOut = (o: Out) => !o.threw && !((o.value as Any)?.status === "error" || (o.value as Any)?.ok === false);

const refusals: Record<string, string> = {};

async function runDb(): Promise<void> {
  HAS_EU = await tableExists("HrEmployeeUnit");
  const hasUnitCol = await colExists("HrEmployee", "unitId");
  const hasPayType = await colExists("HrSalaryProfile", "payType");
  console.log(`[${SUITE}] schema probe: HrEmployee.unitId=${hasUnitCol} HrEmployeeUnit=${HAS_EU} HrSalaryProfile.payType=${hasPayType} hr/scope.ts=${!!scopeMod && !scopeMod.__err}${scopeMod?.__err ? ` (${scopeMod.__err})` : ""}`);

  // ── setup: main tenant T (2 units · HR systems A, B, M, H) · T1 (1 unit) · T2 (2 units, also "other tenant") ──
  const T = await newTenant("", "QC HR H1.1 สาขา");
  const T1 = await newTenant("-one", "QC HR H1.1 สาขาเดียว");
  const T2 = await newTenant("-two", "QC HR H1.1 สองสาขา");
  const u1 = await newUnit(T, `สาขาเหนือ ${stamp}`, "u1");
  const u2 = await newUnit(T, `สาขาใต้ ${stamp}`, "u2");
  const u0 = await newUnit(T1, `สาขาเดียว ${stamp}`, "u0");
  const v1 = await newUnit(T2, `สาขาตะวันออก ${stamp}`, "v1");
  await newUnit(T2, `สาขาตะวันตก ${stamp}`, "v2");
  const sA = await sys.createSystem(T, "HR", "ทีมงาน A");
  await sleep(30);
  const sB = await sys.createSystem(T, "HR", "ทีมงาน B");
  await sleep(30);
  const sM = await sys.createSystem(T, "HR", "ทีมเงินเดือนรายเดือน");
  await sleep(30);
  const sH = await sys.createSystem(T, "HR", "ทีมรายชั่วโมง");
  const s1 = await sys.createSystem(T1, "HR", "ทีมสาขาเดียว");
  const s2 = await sys.createSystem(T2, "HR", "ทีมสองสาขา");
  ids.push(sA.id, sB.id, sM.id, sH.id, s1.id, s2.id);
  const ctxA = { tenantId: T, systemId: sA.id };
  const pathA = `/app/sys/${sA.id}/hr/employees`;

  const PAY_KEYS = { "hr.payroll.read": true, "hr.payroll.create": true, "hr.leave.read": true };
  const U = {
    owner: await mkUser(T, "owner", `QC เจ้าของ ${stamp}`, "OWNER", [], {}),
    mgrU1: await mkUser(T, "mgru1", `QC ผู้จัดการสาขาเหนือ ${stamp}`, "MANAGER", [u1], { "hr.leave.read": true, "hr.employee.create": true }),
    mgrAll: await mkUser(T, "mgrall", `QC ผู้จัดการทุกสาขา ${stamp}`, "MANAGER", ["*"], {}),
    payU1: await mkUser(T, "payu1", `QC เงินเดือนสาขาเหนือ ${stamp}`, "STAFF", [u1], { ...PAY_KEYS, "hr.employee.create": true }),
    payAll: await mkUser(T, "payall", `QC เงินเดือนทุกสาขา ${stamp}`, "STAFF", ["*"], PAY_KEYS),
    hrRead: await mkUser(T, "hrread", `QC อ่านลา ${stamp}`, "STAFF", ["*"], { "hr.leave.read": true }),
    staffU1: await mkUser(T, "staffu1", `QC พนักงานเหนือ ${stamp}`, "STAFF", [u1], { "hr.leave.request": true }),
    member: await mkUser(T, "member", `QC สมาชิก ${stamp}`, "STAFF", [], {}),
    other: await mkUser(T2, "other", `QC ร้านอื่น ${stamp}`, "OWNER", [], {}),
  };
  const E = {
    e1: await mkEmp(T, sA.id, `พนง-เหนือ ${stamp}`, { unitId: u1, linkedUserId: U.staffU1.id }),
    e2: await mkEmp(T, sA.id, `พนง-ใต้ ${stamp}`, { unitId: u2 }),
    e3: await mkEmp(T, sA.id, `พนง-ไร้สาขา ${stamp}`),
    e4: await mkEmp(T, sA.id, `พนง-ยืมเปิด ${stamp}`, { unitId: u2 }),
    e5: await mkEmp(T, sA.id, `พนง-ยืมปิด ${stamp}`, { unitId: u2 }),
    e6: await mkEmp(T, sA.id, `พนง-พ้นสภาพ ${stamp}`, { unitId: u1 }),
    e7: await mkEmp(T, sA.id, `พนง-มีวันสิ้นสุด ${stamp}`, { unitId: u1, endDate: "2030-01-31" }),
    eB: await mkEmp(T, sB.id, `พนง-ระบบบี ${stamp}`, { unitId: u1 }),
    eX: await mkEmp(T2, s2.id, `พนง-ร้านอื่น ${stamp}`),
  };
  const bor4 = await addBorrow(T, sA.id, E.e4, u1, "2020-01-01", null);
  const bor5 = await addBorrow(T, sA.id, E.e5, u1, "2020-01-01", "2020-12-31");
  console.log(`[${SUITE}] fixtures: unitId written=${hasUnitCol} borrowings=${bor4 ? 1 : 0}+${bor5 ? 1 : 0}`);

  // leaves (system A)
  const mkLeave = async (employeeId: string, day: string, status = "PENDING") =>
    (await P.hrLeave.create({ data: { tenantId: T, systemId: sA.id, employeeId, type: "PERSONAL", fromDate: new Date(`${day}T00:00:00Z`), toDate: new Date(`${day}T00:00:00Z`), status, reason: "ธุระ" } })).id as string;
  const L = {
    L1: await mkLeave(E.e1, "2031-03-03"),
    L2: await mkLeave(E.e2, "2031-03-04"),
    L3: await mkLeave(E.e3, "2031-03-05"),
    L4: await mkLeave(E.e4, "2031-03-06"),
    L5: await mkLeave(E.e5, "2031-03-07"),
    L6: await mkLeave(E.e5, "2020-06-10", "APPROVED"),
    L7: await mkLeave(E.e2, "2031-02-02", "APPROVED"),
    LB: (await P.hrLeave.create({ data: { tenantId: T, systemId: sB.id, employeeId: E.eB, type: "SICK", fromDate: new Date("2031-03-03T00:00:00Z"), toDate: new Date("2031-03-03T00:00:00Z") } })).id as string,
  };
  // attendance (system A)
  const mkAtt = async (employeeId: string, at: string) => (await P.hrAttendance.create({ data: { tenantId: T, systemId: sA.id, employeeId, kind: "IN", at: new Date(at) } })).id as string;
  const A = {
    A1: await mkAtt(E.e1, "2031-03-03T02:00:00Z"),
    A2: await mkAtt(E.e2, "2031-03-03T02:01:00Z"),
    A3: await mkAtt(E.e3, "2031-03-03T02:02:00Z"),
    A4: await mkAtt(E.e4, "2031-03-03T02:03:00Z"),
    A4b: await mkAtt(E.e4, "2019-06-01T02:00:00Z"),
    A5: await mkAtt(E.e5, "2031-03-03T02:04:00Z"),
    A6: await mkAtt(E.e5, "2020-06-10T02:00:00Z"),
  };
  // adjustments (system A, PENDING)
  const mkAdj = async (employeeId: string) => (await P.hrPayAdjustment.create({ data: { tenantId: T, systemId: sA.id, employeeId, periodKey: "2031-03", kind: "BONUS", amountSatang: 10_000, status: "PENDING", note: "QC" } })).id as string;
  const ADJ = { a1: await mkAdj(E.e1), a2: await mkAdj(E.e2), a3: await mkAdj(E.e3) };

  // ═══ S1 DB catalogue ═══
  console.log("── [S1] QC4 catalogue ──");
  {
    const info = (await P.$queryRawUnsafe(
      `SELECT table_name AS t, column_name AS c, data_type AS dt, udt_name AS udt, is_nullable AS n, column_default AS d FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name IN ('HrEmployee','HrSalaryProfile')`,
    )) as Any[];
    const ci = (t: string, c: string) => info.find((r) => r.t === t && r.c === c);
    const okCol = (t: string, c: string, dt: string, nullable: boolean, udt?: string) => {
      const r = ci(t, c);
      return !!r && r.dt === dt && (r.n === "YES") === nullable && (!udt || r.udt === udt);
    };
    const enumOf = async (name: string) => ((await P.$queryRawUnsafe(`SELECT e.enumlabel AS l FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = $1 ORDER BY e.enumsortorder`, name)) as Any[]).map((r) => r.l as string).join(",");
    const pt = ci("HrSalaryProfile", "payType");
    const s15 = {
      unitId: okCol("HrEmployee", "unitId", "text", true),
      status: okCol("HrEmployee", "employmentStatus", "USER-DEFINED", true, "HrEmploymentStatus"),
      probation: okCol("HrEmployee", "probationEndAt", "date", true),
      contract: okCol("HrEmployee", "contractEndAt", "date", true),
      payType: okCol("HrSalaryProfile", "payType", "USER-DEFINED", false, "HrPayType") && /'MONTHLY'/.test(String(pt?.d ?? "")),
      daily: okCol("HrSalaryProfile", "dailyRateSatang", "integer", true),
      hourly: okCol("HrSalaryProfile", "hourlyRateSatang", "integer", true),
      statusEnum: (await enumOf("HrEmploymentStatus")) === "PROBATION,ACTIVE,ENDED",
      payEnum: (await enumOf("HrPayType")) === "MONTHLY,DAILY,HOURLY",
    };
    chk("S1.5", Object.values(s15).every(Boolean), "7 columns + 2 enums", short(Object.fromEntries(Object.entries(s15).filter(([, v]) => !v))) || "all");
    const cols = new Set(info.filter((r) => r.t === "HrEmployee").map((r) => r.c as string));
    const scols = new Set(info.filter((r) => r.t === "HrSalaryProfile").map((r) => r.c as string));
    const missing = [...BASE_EMP_COLS.filter((c) => !cols.has(c)), ...BASE_SAL_COLS.filter((c) => !scols.has(c)).map((c) => `HrSalaryProfile.${c}`)];
    chk("S1.8", missing.length === 0 && cols.size >= BASE_EMP_COLS.length, "0 missing", missing.length ? missing.join(",") : `0 missing (HrEmployee ${cols.size} cols · HrSalaryProfile ${scols.size})`);

    const idxOf = async (t: string) => (await P.$queryRawUnsafe(`SELECT indexname AS n, indexdef AS d FROM pg_indexes WHERE schemaname = current_schema() AND tablename = $1`, t)) as Any[];
    const ie = await idxOf("HrEmployee");
    const iu = await idxOf("HrEmployeeUnit");
    const hasIdx = (rows: Any[], cols2: string, unique = false) => rows.some((r) => String(r.d).includes(`(${cols2})`) && (unique ? /UNIQUE/.test(String(r.d)) : true));
    const fk = (await P.$queryRawUnsafe(
      `SELECT pg_get_constraintdef(c.oid) AS d FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid WHERE r.relname = 'HrEmployee' AND c.contype = 'f'`,
    )) as Any[];
    const s16 = {
      e1: hasIdx(ie, `"systemId", "unitId"`),
      e2: hasIdx(ie, `"systemId", "employmentStatus"`),
      u1: hasIdx(iu, `"systemId", "employeeId"`),
      u2: hasIdx(iu, `"systemId", "unitId"`),
      partial: iu.some((r) => /UNIQUE/.test(String(r.d)) && String(r.d).includes(`("employeeId", "unitId")`) && /WHERE \("toDate" IS NULL\)/.test(String(r.d))),
      noUnitFk: !fk.some((r) => /"BusinessUnit"/.test(String(r.d))),
    };
    chk("S1.6", Object.values(s16).every(Boolean), "4 indexes + partial unique · no BusinessUnit FK", short(s16));

    // S1.7 partial unique enforced (each probe in its own rolled-back tx)
    const probe = async (rows: [string | null][]): Promise<string> => {
      if (!HAS_EU) return "∅table";
      let outcome = "accepted";
      try {
        await P.$transaction(async (tx: Any) => {
          let i = 0;
          for (const [toDate] of rows) {
            i++;
            await tx.$executeRawUnsafe(
              `INSERT INTO "HrEmployeeUnit" ("id","tenantId","systemId","employeeId","unitId","fromDate","toDate","createdAt") VALUES ($1,$2,$3,$4,$5,'2031-01-01'::date,$6::date,now())`,
              `qch11p${stamp}${i}${Math.random().toString(36).slice(2, 6)}`, T, sA.id, E.e1, u2, toDate,
            );
          }
          throw new Error("QC_ROLLBACK");
        });
      } catch (e) {
        const s = `${(e as Any)?.code ?? ""} ${(e as Any)?.meta?.code ?? ""} ${e instanceof Error ? e.message : String(e)}`;
        outcome = /QC_ROLLBACK/.test(s) ? "accepted" : /23505|unique/i.test(s) ? "23505" : `other:${short(s, 60)}`;
      }
      return outcome;
    };
    const dup = await probe([[null], [null]]);
    const mixed = await probe([["2031-01-31"], [null]]);
    chk("S1.7", dup === "23505" && mixed === "accepted", "open+open 23505 · closed+open accepted", `open+open=${dup} closed+open=${mixed}`);
  }

  // ═══ S3 hrScopeOf / unitWhere ═══
  console.log("── [S3] hrScopeOf · unitWhere ──");
  const scopeOf = (v: Any): Any => {
    try {
      return typeof scopeMod?.hrScopeOf === "function" ? scopeMod.hrScopeOf(v) : undefined;
    } catch (e) {
      return { __throw: errText(e) };
    }
  };
  const ids_ = (s: Any) => (s?.unitIds === "*" ? "*" : Array.isArray(s?.unitIds) ? srt(s.unitIds) : `∅${short(s, 40)}`);
  const pv = (role: string, unitAccess: unknown, permissions: Record<string, boolean> = {}) => ({ role, unitAccess, permissions, userId: "qc" });
  {
    const r = { owner: ids_(scopeOf(pv("OWNER", []))), mgrStar: ids_(scopeOf(pv("MANAGER", ["*"]))), staffStar: ids_(scopeOf(pv("STAFF", ["*"]))) };
    chk("S3.1", typeof scopeMod?.hrScopeOf === "function" && typeof scopeMod?.unitWhere === "function" && r.owner === "*" && r.mgrStar === "*" && r.staffStar === "*", "exports · * · * · *", `exports=${typeof scopeMod?.hrScopeOf}/${typeof scopeMod?.unitWhere} ${short(r)}`);
    const q = {
      mgrU1: ids_(scopeOf(pv("MANAGER", [u1]))),
      staff12: ids_(scopeOf(pv("STAFF", [u1, u2]))),
      mgrNone: ids_(scopeOf(pv("MANAGER", []))),
      malformed: ids_(scopeOf(pv("MANAGER", "u1" as unknown))),
    };
    chk("S3.2", q.mgrU1 === u1 && q.staff12 === srt([u1, u2]) && q.mgrNone === "" && q.malformed === "", "[u1] · [u1,u2] · [] · []", short({ mgrU1: q.mgrU1 === u1 ? "u1" : q.mgrU1, staff12: q.staff12 === srt([u1, u2]) ? "u1,u2" : q.staff12, mgrNone: q.mgrNone || "[]", malformed: q.malformed || "[]" }));
  }
  const empIn = async (scope: Any): Promise<string | null> => {
    if (typeof scopeMod?.unitWhere !== "function") return null;
    try {
      const frag = scopeMod.unitWhere(scope);
      const rows = (await P.hrEmployee.findMany({ where: { AND: [{ tenantId: T, systemId: sA.id }, frag ?? {}] }, select: { id: true } })) as Any[];
      return srt(rows.map((r) => r.id as string));
    } catch (e) {
      return `THROW ${errText(e)}`;
    }
  };
  const label = (csv: string | null) => {
    if (csv === null) return "∅unitWhere";
    if (csv.startsWith("THROW")) return csv.slice(0, 120);
    const inv = new Map(Object.entries(E).map(([k, v]) => [v, k]));
    return csv.split(",").filter(Boolean).map((x) => inv.get(x) ?? "?").sort().join(",") || "∅";
  };
  const allA = srt([E.e1, E.e2, E.e3, E.e4, E.e5, E.e6, E.e7]);
  const wStar = await empIn({ unitIds: "*" });
  chk("S3.3", wStar === allA, "e1..e7", label(wStar));
  const wU1 = await empIn({ unitIds: [u1] });
  const wantU1 = srt([E.e1, E.e4, E.e6, E.e7]);
  chk("S3.4", wU1 === wantU1, "e1,e4,e6,e7", label(wU1));
  const wU2 = await empIn({ unitIds: [u2] });
  const wNone = await empIn({ unitIds: [] });
  chk("S3.5", wU2 === srt([E.e2, E.e4, E.e5]) && wNone === "", "u2 = e2,e4,e5 · [] = ∅", `u2=${label(wU2)} []=${label(wNone)}`);

  // ═══ S4 reads ═══
  console.log("── [S4] reads apply the scope ──");
  const scU1 = scopeOf(vOf(U.mgrU1)) ?? { unitIds: [u1] };
  const scAll = scopeOf(vOf(U.owner)) ?? { unitIds: "*" };
  const inv = new Map<string, string>([...Object.entries(E), ...Object.entries(L), ...Object.entries(A), ...Object.entries(ADJ)].map(([k, v]) => [v, k]));
  const lab = (xs: string[]) => xs.map((x) => inv.get(x) ?? "?").sort().join(",") || "∅";
  const seenA: string[] = []; // every id any system-A reader returned (X2.1)
  const idsOf = (rows: Any[]) => {
    const r = (rows ?? []).map((x: Any) => String(x.id));
    seenA.push(...r);
    return r;
  };
  {
    const a = idsOf(await hr.listEmployees(ctxA, 200, { unitIds: [u1] }));
    const b = idsOf(await hr.listEmployees(ctxA, 200, { unitIds: "*" }));
    chk("S4.1", srt(a) === wantU1 && srt(b) === allA, "u1 = e1,e4,e6,e7 · * = e1..e7", `u1=${lab(a)} *=${lab(b)}`);
  }
  {
    const w = await privacy.leaveItemsForViewer(ctxA, vOf(U.mgrU1));
    const p = idsOf(w.pending ?? []);
    const h = idsOf(w.history ?? []);
    const okHist = h.every((x) => [L.L1, L.L4, L.L6].includes(x)) && h.includes(L.L1) && h.includes(L.L4);
    const st = await privacy.leaveItemsForViewer(ctxA, vOf(U.staffU1));
    const stRows = [...idsOf(st.pending ?? []), ...idsOf(st.history ?? [])];
    const stBad = stRows.filter((x) => [L.L2, L.L3, L.L7].includes(x));
    chk("S4.2", srt(p) === srt([L.L1, L.L4]) && okHist && stBad.length === 0, "pending L1,L4 · history ⊆ L1,L4,L6 · staff-u1 no e2/e3 rows", `pending=${lab(p)} history=${lab(h)} staffU1 e2/e3 rows=${lab(stBad)}`);
  }
  {
    const p = idsOf(await hr.pendingLeaves(ctxA, 100, scU1));
    const h = idsOf(await hr.listLeaves(ctxA, 100, scU1));
    chk("S4.3", srt(p) === srt([L.L1, L.L4]) && srt(h) === srt([L.L1, L.L4, L.L6]), "pending L1,L4 · list L1,L4,L6", `pending=${lab(p)} list=${lab(h)}`);
  }
  {
    const a = idsOf(await hr.listAttendance(ctxA, 50, scU1));
    chk("S4.4", srt(a) === srt([A.A1, A.A4, A.A6]), "A1,A4,A6", lab(a));
  }
  const tools = (await import("@/lib/ai/tools")) as Any;
  const aiPending = async (w: Who): Promise<{ ids: string[]; err: unknown }> => {
    const m = await P.membership.findFirst({ where: { tenantId: T, userId: w.id }, select: { role: true, unitAccess: true, permissions: true } });
    const out = String(await tools.runTool({ tenantId: T, actor: aiActor.aiMemberActor(T, w.id, m) }, "pending_leaves", {}));
    let j: Any = null;
    try {
      j = JSON.parse(out);
    } catch {
      j = null;
    }
    const rows = (Array.isArray(j?.["ใบลารออนุมัติ"]) ? j["ใบลารออนุมัติ"] : []) as Any[];
    const r = rows.map((x) => String(x?.["รหัสใบลา"] ?? "")).filter(Boolean);
    seenA.push(...r);
    return { ids: r, err: j ? (j.error ?? null) : "∅json" };
  };
  {
    const m = await aiPending(U.mgrU1);
    const o = await aiPending(U.owner);
    chk("S4.5", srt(m.ids) === srt([L.L1, L.L4]) && srt(o.ids) === srt([L.L1, L.L2, L.L3, L.L4, L.L5]) && m.err === null, "manager-u1 L1,L4 · owner L1..L5", `manager-u1=${lab(m.ids)} (err ${short(m.err, 40)}) owner=${lab(o.ids)}`);
  }
  {
    const a = idsOf(await pay.listAdjustments(ctxA, undefined, 200, scU1));
    const b = idsOf(await pay.listAdjustments(ctxA, undefined, 200, scAll));
    chk("S4.6", srt(a) === srt([ADJ.a1]) && srt(b) === srt([ADJ.a1, ADJ.a2, ADJ.a3]), "u1 = a1 · * = a1,a2,a3", `u1=${lab(a)} *=${lab(b)}`);
  }
  const prof = async (ctx: Any, w: Who, emp: string) => {
    try {
      return (await privacy.loadEmployeeProfileForViewer(ctx, vOf(w), emp)) as Any;
    } catch (e) {
      return { __throw: errText(e) };
    }
  };
  {
    const r = { e2: await prof(ctxA, U.mgrU1, E.e2), e3: await prof(ctxA, U.mgrU1, E.e3), e1: await prof(ctxA, U.mgrU1, E.e1), e4: await prof(ctxA, U.mgrU1, E.e4) };
    chk("S4.7", r.e2 === null && r.e3 === null && !!r.e1?.profile && !!r.e4?.profile, "e2 null · e3 null · e1 + e4 profiles", short(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null ? "null" : v?.profile ? "profile" : short(v, 40)]))));
  }

  // payroll run R0 in system A (all MONTHLY at this point) — S4.8 payslip scope
  for (const [e, base] of [[E.e1, B(20_000)], [E.e2, B(18_000)], [E.e3, B(16_000)]] as [string, number][]) await pay.setSalaryProfile(ctxA, { employeeId: e, baseSalarySatang: base, ssoEligible: true });
  let R0 = "";
  try {
    R0 = (await pay.createPayrollRun(ctxA, { periodKey: "2030-01", payDate: new Date("2030-01-31T05:00:00Z") })).id as string;
  } catch (e) {
    R0 = `THROW ${errText(e)}`;
  }
  {
    const slip = async (w: Who, emp: string) => {
      try {
        return (await privacy.loadPayslipForViewer(ctxA, vOf(w), R0, emp)) ? "ok" : "null";
      } catch (e) {
        return `THROW ${errText(e).slice(0, 60)}`;
      }
    };
    const r = { u1e2: await slip(U.payU1, E.e2), u1e1: await slip(U.payU1, E.e1), owner2: await slip(U.owner, E.e2) };
    chk("S4.8", r.u1e2 === "null" && r.u1e1 === "ok" && r.owner2 === "ok", "null · ok · ok", `run=${R0.startsWith("THROW") ? R0.slice(0, 60) : "R0"} ${short(r)}`);
  }
  {
    const a = idsOf(await hr.listEmployees(ctxA, 200, { unitIds: "*" }));
    const allLeaves = srt([L.L1, L.L2, L.L3, L.L4, L.L5, L.L6, L.L7]);
    const res: string[] = [];
    let ok = srt(a) === allA;
    for (const [tag, w] of [["owner", U.owner], ["mgrAll", U.mgrAll], ["payAll", U.payAll]] as [string, Who][]) {
      const r = await privacy.leaveItemsForViewer(ctxA, vOf(w));
      const h = idsOf(r.history ?? []);
      const p = idsOf(r.pending ?? []);
      const good = srt(h) === allLeaves && srt(p) === srt([L.L1, L.L2, L.L3, L.L4, L.L5]);
      if (!good) ok = false;
      res.push(`${tag}:${good ? "all" : `${p.length}/${h.length}`}`);
    }
    chk("S4.9", ok, "every row for every all-branch viewer", `listEmployees(*)=${lab(a)} ${res.join(" ")}`);
  }

  // ═══ S8 verifyPin (before writes — S5 deactivation attempts must not interfere) ═══
  console.log("── [S8] verifyPin + unitId ──");
  const pins: Record<string, string> = {};
  {
    const used = new Set<string>();
    for (const k of ["e1", "e2", "e3", "e4", "e5"] as const) {
      let p = "";
      do p = String(100000 + Math.floor(Math.random() * 899999));
      while (used.has(p));
      used.add(p);
      pins[k] = p;
      const r = await hr.setPin(ctxA, E[k], p);
      if (r?.ok === false) console.log(`  ⚠ setPin ${k}: ${short(r?.reason, 60)}`);
    }
  }
  let ck = 0;
  const callerKey = () => `qc-h11:${stamp}:${++ck}`;
  const vp = async (k: keyof typeof pins, unitId?: string, key = callerKey()) => {
    try {
      const r = (await pinMod.verifyPin({ tenantId: T, pin: pins[k], callerKey: key, ...(unitId !== undefined ? { unitId } : {}) })) as Any;
      return { r, key, s: r?.ok ? (r.employeeId === E[k as keyof typeof E] ? "ok" : "ok-other") : String(r?.reason ?? "?") };
    } catch (e) {
      return { r: null, key, s: `THROW ${errText(e)}` };
    }
  };
  const bucket = async (key: string) => ((await P.chatRateBucket.findUnique({ where: { key: `hr-verifypin:${T}:${key}` }, select: { count: true } })) as Any)?.count ?? 0;
  {
    const a = await vp("e2", u1);
    chk("S8.1", a.s === WRONG_PIN, WRONG_PIN, a.s);
    const n81 = await bucket(a.key);
    const b = await vp("e2", u2);
    const c = await vp("e4", u1);
    const c2 = await vp("e4", u2);
    chk("S8.2", b.s === "ok" && c.s === "ok" && c2.s === "ok", "ok · ok · ok", `e2@u2=${b.s} e4@u1=${c.s} e4@u2=${c2.s}`);
    const d = await vp("e5", u1);
    chk("S8.3", d.s === WRONG_PIN, WRONG_PIN, d.s);
    const e = await vp("e3", u1);
    chk("S8.4", e.s === WRONG_PIN, WRONG_PIN, e.s);
    const f = await Promise.all((["e1", "e2", "e3", "e4"] as const).map((k) => vp(k)));
    chk("S8.5", f.every((x) => x.s === "ok"), "ok ×4", f.map((x) => x.s).join(" · "));
    const nOk = await bucket(b.key);
    chk("S8.6", n81 === 1 && nOk === 0, "mismatch bucket 1 · ok bucket 0", `mismatch bucket=${n81} ok bucket=${nOk}`);
  }

  // ═══ S6 money ═══
  console.log("── [S6] money gate · DAILY/HOURLY refusal · MONTHLY digest ──");
  {
    const SENS = ["nationalId", "ssoNumber", "houseRegAddress", "bankName", "bankAccountNo", "bankAccountName", "payType"];
    const a = await prof(ctxA, U.mgrU1, E.e1);
    const b = await prof(ctxA, U.mgrAll, E.e1);
    const leakA = Object.keys(a?.profile ?? {}).filter((k) => SENS.includes(k));
    const leakB = Object.keys(b?.profile ?? {}).filter((k) => SENS.includes(k));
    chk("S6.1", !!b?.profile && leakA.length === 0 && leakB.length === 0, "no sensitive / payType keys", `mgrU1=${a?.profile ? leakA.join(",") || "clean" : "no profile"} mgrAll=${b?.profile ? leakB.join(",") || "clean" : "no profile"}`);
  }
  {
    const before = (await P.hrSalaryProfile.findFirst({ where: { systemId: sA.id, employeeId: E.e1 }, select: { baseSalarySatang: true } })) as Any;
    const o = await inAct(U.mgrU1, `/app/sys/${sA.id}/hr/payroll`, () => payAct.setSalaryProfileAction(fd({ systemId: sA.id, employeeId: E.e1, baseSalaryBaht: "99999" })));
    const after = (await P.hrSalaryProfile.findFirst({ where: { systemId: sA.id, employeeId: E.e1 }, select: { baseSalarySatang: true } })) as Any;
    chk("S6.2", !okOut(o) && before?.baseSalarySatang === after?.baseSalarySatang && after?.baseSalarySatang === B(20_000), "refused · 2000000 unchanged", `threw=${o.threw} before=${before?.baseSalarySatang} after=${after?.baseSalarySatang}`);
  }
  const runCount = async (systemId: string, periodKey: string) => P.hrPayrollRun.count({ where: { tenantId: T, systemId, periodKey } });
  const tryRun = async (ctx: Any, periodKey: string, payDate: string): Promise<string> => {
    try {
      await pay.createPayrollRun(ctx, { periodKey, payDate: new Date(`${payDate}T05:00:00Z`) });
      return "created";
    } catch (e) {
      return e instanceof Error ? `${e.name}:${e.message}` : String(e);
    }
  };
  {
    const set = (await rawSet("HrSalaryProfile", "payType", (await P.hrSalaryProfile.findFirst({ where: { systemId: sA.id, employeeId: E.e2 }, select: { id: true } }))?.id ?? "", "DAILY", `::"HrPayType"`)) &&
      (await rawSet("HrSalaryProfile", "dailyRateSatang", (await P.hrSalaryProfile.findFirst({ where: { systemId: sA.id, employeeId: E.e2 }, select: { id: true } }))?.id ?? "", 40_000));
    const r = await tryRun(ctxA, "2030-02", "2030-02-28");
    const n = await runCount(sA.id, "2030-02");
    chk("S6.3", r === `PayrollInputError:${T_PAYTYPE}` && n === 0, `PayrollInputError:${T_PAYTYPE} · 0 runs`, `fixture DAILY=${set} → ${short(r, 90)} · runs=${n}`);
  }
  const ctxH = { tenantId: T, systemId: sH.id };
  {
    const h1 = await mkEmp(T, sH.id, `พนง-รายชั่วโมง ${stamp}`, { unitId: u1 });
    const pr = await pay.setSalaryProfile(ctxH, { employeeId: h1, baseSalarySatang: B(5_000), ssoEligible: false });
    const set = (await rawSet("HrSalaryProfile", "payType", pr.id, "HOURLY", `::"HrPayType"`)) && (await rawSet("HrSalaryProfile", "hourlyRateSatang", pr.id, 6_500));
    const r = await tryRun(ctxH, "2030-02", "2030-02-28");
    const n = await runCount(sH.id, "2030-02");
    chk("S6.4", r === `PayrollInputError:${T_PAYTYPE}` && n === 0, `PayrollInputError:${T_PAYTYPE} · 0 runs`, `fixture HOURLY=${set} → ${short(r, 90)} · runs=${n}`);
    // S1.9 default MONTHLY for a new profile (no payType given)
    const h0 = await mkEmp(T, sM.id, `พนง-ค่าเริ่มต้น ${stamp}`);
    const p0 = await pay.setSalaryProfile({ tenantId: T, systemId: sM.id }, { employeeId: h0, baseSalarySatang: B(10_000) });
    const pt = await rawCol("HrSalaryProfile", "payType", p0.id);
    const dr = await rawCol("HrSalaryProfile", "dailyRateSatang", p0.id);
    const hrr = await rawCol("HrSalaryProfile", "hourlyRateSatang", p0.id);
    chk("S1.9", pt === "MONTHLY" && dr === null && hrr === null, "MONTHLY · null · null", `payType=${pt} daily=${dr} hourly=${hrr}`);
    await P.hrSalaryProfile.deleteMany({ where: { id: p0.id } }); // keep system M = the frozen fixture only
    await P.hrEmployee.deleteMany({ where: { id: h0 } });
    // S6.7 rates enforced in code
    const h2 = await mkEmp(T, sH.id, `พนง-รายวัน ${stamp}`, { unitId: u1 });
    let refused = "";
    try {
      const r0 = await pay.setSalaryProfile(ctxH, { employeeId: h2, baseSalarySatang: 0, payType: "DAILY", dailyRateSatang: 0 });
      refused = r0 && (r0 as Any).ok === false ? "refused" : "accepted";
    } catch (e) {
      refused = isThai(e instanceof Error ? e.message : "") ? "refused" : `throw:${errText(e).slice(0, 60)}`;
    }
    const pz = (await P.hrSalaryProfile.findFirst({ where: { systemId: sH.id, employeeId: h2 }, select: { id: true } })) as Any;
    const ptz = pz ? await rawCol("HrSalaryProfile", "payType", pz.id) : "∅profile";
    let stored = "";
    try {
      const r1 = await pay.setSalaryProfile(ctxH, { employeeId: h2, baseSalarySatang: 0, payType: "DAILY", dailyRateSatang: 40_000 });
      stored = `${await rawCol("HrSalaryProfile", "payType", r1.id)}/${await rawCol("HrSalaryProfile", "dailyRateSatang", r1.id)}`;
    } catch (e) {
      stored = `throw:${errText(e).slice(0, 60)}`;
    }
    chk("S6.7", refused === "refused" && ptz !== "DAILY" && stored === "DAILY/40000", "refused (not DAILY) · DAILY/40000", `rate0=${refused} (payType ${ptz}) · rate40000=${stored}`);
  }
  {
    const ctxM = { tenantId: T, systemId: sM.id };
    const codeOf = new Map<string, string>();
    const empOf = new Map<string, string>();
    for (const m of MONTHLY_FIXTURE.employees) {
      const id = await mkEmp(T, sM.id, `พนง-${m.code} ${stamp}`, { code: m.code, ...(m.start ? { startDate: m.start } : {}) });
      codeOf.set(id, m.code);
      empOf.set(m.code, id);
      await pay.setSalaryProfile(ctxM, { employeeId: id, baseSalarySatang: m.base, ssoEligible: m.sso, deductions: { spouse: m.spouse, children: m.children } });
    }
    for (const a of MONTHLY_FIXTURE.adjustments) {
      await P.hrPayAdjustment.create({ data: { tenantId: T, systemId: sM.id, employeeId: empOf.get(a.code)!, periodKey: MONTHLY_FIXTURE.period, kind: a.kind, amountSatang: a.amount, status: "APPROVED", note: `QC ${a.kind}` } });
    }
    let digest = "∅";
    let totals = "∅";
    let flags = "∅";
    try {
      const run = await pay.createPayrollRun(ctxM, { periodKey: MONTHLY_FIXTURE.period, payDate: new Date(`${MONTHLY_FIXTURE.payDate}T05:00:00Z`) });
      const items = (await P.hrPayrollItem.findMany({ where: { runId: run.id }, select: { ...digestMod.PAYROLL_DIGEST_SELECT, snapshotJson: true } })) as Any[];
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
    chk("S6.5", digest === FROZEN_DIGEST && totals === FROZEN_TOTALS && flags === FROZEN_FLAGS, `${FROZEN_DIGEST.slice(0, 16)} · ${FROZEN_TOTALS} · ${FROZEN_FLAGS}`, `${digest.slice(0, 16)} · ${totals} · ${flags}`);
  }

  // ═══ S7 lifecycle + DTO ═══
  console.log("── [S7] lifecycle · DTO ──");
  const { thaiDateKey } = (await import("@/lib/ui/date")) as Any;
  {
    const d0 = thaiDateKey(new Date());
    await hr.setEmployeeActive(ctxA, E.e6, false);
    const d1 = thaiDateKey(new Date());
    const st = await rawCol("HrEmployee", "employmentStatus", E.e6);
    const end = ((await P.hrEmployee.findUnique({ where: { id: E.e6 }, select: { endDate: true } })) as Any)?.endDate?.toISOString?.().slice(0, 10) ?? null;
    chk("S7.1", st === "ENDED" && (end === d0 || end === d1), `ENDED · endDate ${d1}`, `status=${st} endDate=${end}`);
    await hr.setEmployeeActive(ctxA, E.e7, false);
    const st7 = await rawCol("HrEmployee", "employmentStatus", E.e7);
    const end7 = ((await P.hrEmployee.findUnique({ where: { id: E.e7 }, select: { endDate: true } })) as Any)?.endDate?.toISOString?.().slice(0, 10) ?? null;
    chk("S7.2", st7 === "ENDED" && end7 === "2030-01-31", "ENDED · 2030-01-31", `status=${st7} endDate=${end7}`);
    await hr.setEmployeeActive(ctxA, E.e6, true);
    const st6 = await rawCol("HrEmployee", "employmentStatus", E.e6);
    const end6 = ((await P.hrEmployee.findUnique({ where: { id: E.e6 }, select: { endDate: true, active: true } })) as Any) ?? {};
    chk("S7.3", st6 === "ACTIVE" && end6.active === true && end6.endDate?.toISOString?.().slice(0, 10) === end && end !== null, "ACTIVE · endDate kept", `status=${st6} active=${end6.active} endDate=${end6.endDate?.toISOString?.().slice(0, 10) ?? null}`);
  }
  {
    const o = await prof(ctxA, U.owner, E.e1);
    const p = o?.profile ?? {};
    const has = NEW_DTO_KEYS.every((k) => Object.prototype.hasOwnProperty.call(p, k));
    chk("S7.4", has && p.unitId === u1 && p.unitName === `สาขาเหนือ ${stamp}`, "6 keys · unitId u1 · unitName", `keys=${NEW_DTO_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(p, k)).join(",") || "none"} unitId=${p.unitId === u1 ? "u1" : short(p.unitId, 30)} unitName=${short(p.unitName, 40)}`);
    const m = (await prof(ctxA, U.mgrAll, E.e1))?.profile ?? {};
    const pa1 = (await prof(ctxA, U.payAll, E.e1))?.profile ?? {};
    const pa2 = (await prof(ctxA, U.payAll, E.e2))?.profile ?? {};
    const five = NEW_DTO_KEYS.filter((k) => k !== "payType").every((k) => Object.prototype.hasOwnProperty.call(m, k));
    chk("S7.5", five && !("payType" in m) && pa1.payType === "MONTHLY" && pa2.payType === "DAILY", "mgrAll 5 keys no payType · payroll MONTHLY / DAILY", `mgrAll five=${five} payType=${"payType" in m} · payAll e1=${short(pa1.payType, 20)} e2=${short(pa2.payType, 20)}`);
  }
  {
    const BASE_PROFILE = ["id", "name", "nickname", "code", "phone", "email", "gender", "birthDate", "maritalStatus", "position", "department", "employmentType", "startDate", "endDate", "addressLine", "subdistrict", "district", "province", "postcode", "emergencyName", "emergencyPhone", "emergencyRelation", "note", "active", "hasPin"];
    const SENS6 = ["nationalId", "ssoNumber", "houseRegAddress", "bankName", "bankAccountNo", "bankAccountName"];
    const allowed = new Set([...BASE_PROFILE, ...SENS6, ...NEW_DTO_KEYS]);
    const res: string[] = [];
    let ok = true;
    for (const [tag, w, sens] of [["owner", U.owner, true], ["payAll", U.payAll, true], ["mgrAll", U.mgrAll, false], ["hrRead", U.hrRead, false]] as [string, Who, boolean][]) {
      for (const emp of [E.e1, E.e2, E.e3]) {
        const r = await prof(ctxA, w, emp);
        const k = Object.keys(r?.profile ?? {});
        const good = !!r?.profile && BASE_PROFILE.every((x) => k.includes(x)) && k.every((x) => allowed.has(x)) && SENS6.every((x) => k.includes(x) === sens) && (!("payType" in r.profile) || sens);
        if (!good) {
          ok = false;
          res.push(`${tag}/${inv.get(emp)}:${r?.profile ? `extra=${k.filter((x) => !allowed.has(x)).join("+")} sens=${SENS6.filter((x) => k.includes(x)).length}` : "null"}`);
        }
      }
    }
    const mem = await prof(ctxA, U.member, E.e1);
    const oth = await prof({ tenantId: T2, systemId: sA.id }, U.other, E.e1);
    if (mem !== null || oth !== null) ok = false;
    chk("S7.6", ok, "matrix unchanged", `${res.join(" ") || "4 viewers × 3 employees ok"} · member=${mem === null ? "null" : "PROFILE"} otherTenant=${oth === null ? "null" : "PROFILE"}`);
  }
  {
    const o = await inAct(U.owner, pathA, () =>
      act.saveEmployeeProfileAction(sA.id, E.e1, { status: "idle" }, fd({ name: `พนง-เหนือ ${stamp}`, employmentStatus: "PROBATION", probationEndAt: "2031-03-31", contractEndAt: "2031-12-31" })),
    );
    const r = { st: await rawCol("HrEmployee", "employmentStatus", E.e1), pr: await rawCol("HrEmployee", "probationEndAt", E.e1), ct: await rawCol("HrEmployee", "contractEndAt", E.e1) };
    chk("S7.7", okOut(o) && r.st === "PROBATION" && r.pr === "2031-03-31" && r.ct === "2031-12-31", "PROBATION · 2031-03-31 · 2031-12-31", `action=${okOut(o) ? "ok" : short(o.text, 60)} ${short(r)}`);
  }

  // ═══ S5 writes ═══
  console.log("── [S5] writes carry unitId ──");
  const nameOf = async (id: string) => ((await P.hrEmployee.findUnique({ where: { id }, select: { name: true, active: true } })) as Any) ?? {};
  const save = (w: Who, emp: string, extra: Record<string, string>) => inAct(w, pathA, () => act.saveEmployeeProfileAction(sA.id, emp, { status: "idle" }, fd(extra)));
  {
    const o = await save(U.mgrU1, E.e1, { name: `พนง-เหนือ-แก้ ${stamp}` });
    names.push(`พนง-เหนือ-แก้ ${stamp}`);
    const n = await nameOf(E.e1);
    chk("S5.1", okOut(o) && n.name === `พนง-เหนือ-แก้ ${stamp}`, "ok · renamed", `${okOut(o) ? "ok" : short(o.text, 60)} name=${n.name === `พนง-เหนือ-แก้ ${stamp}` ? "renamed" : "unchanged"}`);
  }
  {
    const before = await nameOf(E.e2);
    const o = await save(U.mgrU1, E.e2, { name: `แก้ข้ามสาขา ${stamp}` });
    names.push(`แก้ข้ามสาขา ${stamp}`);
    const after = await nameOf(E.e2);
    refusals["S5.2"] = o.text;
    chk("S5.2", o.text === T_OTHER_BRANCH && after.name === before.name, T_OTHER_BRANCH, `"${short(o.text, 80)}" ${after.name === before.name ? "unchanged" : "CHANGED"}`);
    if (after.name !== before.name) await P.hrEmployee.update({ where: { id: E.e2 }, data: { name: before.name } });
  }
  {
    const before = await nameOf(E.e3);
    const o = await save(U.mgrU1, E.e3, { name: `แก้ไร้สาขา ${stamp}` });
    names.push(`แก้ไร้สาขา ${stamp}`);
    const after = await nameOf(E.e3);
    refusals["S5.3"] = o.text;
    chk("S5.3", !okOut(o) && after.name === before.name && isThai(o.text) && !techLeak(o.text), "refused Thai · unchanged", `"${short(o.text, 80)}" ${after.name === before.name ? "unchanged" : "CHANGED"}`);
    if (after.name !== before.name) await P.hrEmployee.update({ where: { id: E.e3 }, data: { name: before.name } });
  }
  const create = (w: Who, name: string, unitId?: string) => {
    names.push(name);
    return inAct(w, pathA, () => act.createEmployeeAction(fd({ systemId: sA.id, name, ...(unitId !== undefined ? { unitId } : {}) })));
  };
  const empByName = async (name: string) => ((await P.hrEmployee.findFirst({ where: { tenantId: T, systemId: sA.id, name }, select: { id: true } })) as Any)?.id ?? null;
  {
    const nm = `สร้างข้ามสาขา ${stamp}`;
    const o = await create(U.mgrU1, nm, u2);
    const id = await empByName(nm);
    const nm2 = `สร้างไร้สาขา ${stamp}`;
    const o2 = await create(U.mgrU1, nm2);
    const id2 = await empByName(nm2);
    refusals["S5.4"] = o.text;
    const textOk = !o.text || o.text === T_OTHER_BRANCH;
    chk("S5.4", id === null && id2 === null && textOk, "0 created ×2 · text = out-of-branch (if any)", `u2=${id ? "CREATED" : "none"} ("${short(o.text, 50)}") · noUnit=${id2 ? "CREATED" : "none"} ("${short(o2.text, 50)}")`);
    if (o2.text) refusals["S5.4b"] = o2.text;
  }
  {
    const nm = `สร้างสาขาตัวเอง ${stamp}`;
    const o = await create(U.mgrU1, nm, u1);
    const id = await empByName(nm);
    const unit = id ? await rawCol("HrEmployee", "unitId", id) : "∅row";
    chk("S5.5", !!id && unit === u1, "created · unitId u1", `${id ? "created" : "none"} unitId=${unit === u1 ? "u1" : unit} ${o.threw ? short(o.text, 50) : ""}`);
  }
  {
    const b2 = await nameOf(E.e2);
    const o1 = await save(U.owner, E.e2, { name: b2.name });
    const b3 = await nameOf(E.e3);
    const o2 = await save(U.owner, E.e3, { name: b3.name });
    const n3 = `เจ้าของสร้างใต้ ${stamp}`;
    await create(U.owner, n3, u2);
    const id3 = await empByName(n3);
    const n4 = `เจ้าของสร้างไร้สาขา ${stamp}`;
    await create(U.owner, n4);
    const id4 = await empByName(n4);
    const r = { saveE2: okOut(o1), saveE3: okOut(o2), u2: id3 ? await rawCol("HrEmployee", "unitId", id3) : "∅row", none: id4 ? await rawCol("HrEmployee", "unitId", id4) : "∅row" };
    chk("S5.6", r.saveE2 && r.saveE3 && r.u2 === u2 && r.none === null, "ok · ok · u2 · null", short({ ...r, u2: r.u2 === u2 ? "u2" : r.u2 }));
  }
  {
    // order: PIN → clock → decide → remove last (a deactivated e2 would refuse PIN/clock for the wrong reason)
    const pinO = await inAct(U.mgrU1, pathA, () => act.setPinAction(sA.id, E.e2, { status: "idle" }, fd({ pin: "975310" })));
    const attBefore = await P.hrAttendance.count({ where: { employeeId: E.e2 } });
    const clk = await inAct(U.mgrU1, pathA, () => act.clockAction(fd({ systemId: sA.id, employeeId: E.e2, kind: "IN" })));
    const attAfter = await P.hrAttendance.count({ where: { employeeId: E.e2 } });
    await inAct(U.mgrU1, pathA, () => act.decideLeaveAction(fd({ systemId: sA.id, leaveId: L.L2, status: "APPROVED" })));
    const l2 = ((await P.hrLeave.findUnique({ where: { id: L.L2 }, select: { status: true } })) as Any)?.status;
    const before = await nameOf(E.e2);
    await inAct(U.mgrU1, pathA, () => act.removeEmployeeAction(fd({ systemId: sA.id, employeeId: E.e2 })));
    const after = await nameOf(E.e2);
    refusals["S5.7.pin"] = pinO.text;
    refusals["S5.7.clock"] = clk.text;
    const r = { stillActive: after.active === true, pin: !okOut(pinO) && pinO.text === T_OTHER_BRANCH, clock: (clk.value as Any)?.ok === false && clk.text === T_OTHER_BRANCH, att: attAfter === attBefore, leave: l2 };
    chk("S5.7", r.stillActive && r.pin && r.clock && r.att && l2 === "PENDING", "active · pin + clock refused with the out-of-branch text · 0 att · PENDING", short({ ...r, pinText: short(pinO.text, 30), clockText: short(clk.text, 30) }));
    if (before.active && !after.active) await hr.setEmployeeActive(ctxA, E.e2, true);
  }
  {
    const o = await save(U.mgrU1, E.e1, { name: `พนง-เหนือ-แก้ ${stamp}`, unitId: u2 });
    const unit = await rawCol("HrEmployee", "unitId", E.e1);
    refusals["S5.8"] = o.text;
    chk("S5.8", !okOut(o) && unit === u1, "refused · unitId u1", `${okOut(o) ? "ok" : short(o.text, 60)} unitId=${unit === u1 ? "u1" : unit === u2 ? "u2 (MOVED)" : unit}`);
    if (unit === u2) await rawSet("HrEmployee", "unitId", E.e1, u1);
  }
  {
    const clk = await inAct(U.mgrU1, pathA, () => act.clockAction(fd({ systemId: sA.id, employeeId: E.e4, kind: "IN" })));
    const before = await nameOf(E.e4);
    const o = await save(U.mgrU1, E.e4, { name: `แก้ยืมตัว ${stamp}` });
    names.push(`แก้ยืมตัว ${stamp}`);
    const after = await nameOf(E.e4);
    refusals["S5.9"] = o.text;
    chk("S5.9", (clk.value as Any)?.ok === true && !okOut(o) && after.name === before.name, "clock ok · profile refused", `clock=${(clk.value as Any)?.ok === true ? "ok" : short(clk.text || clk.value, 50)} profile=${okOut(o) ? "OK (edited)" : short(o.text, 50)}`);
  }

  // ═══ S2 backfill ═══
  console.log("── [S2] backfill ──");
  {
    const mk = async (t: string, s: string, tag: string, o: EmpOpts) => mkEmp(t, s, `พนง-ย้อน-${tag} ${stamp}`, o);
    const one = {
      b1: await mk(T1, s1.id, "1a", {}),
      b2: await mk(T1, s1.id, "1b", { employmentType: "PROBATION" }),
      b3: await mk(T1, s1.id, "1c", { endDate: "2020-01-31" }),
      b4: await mk(T1, s1.id, "1d", { active: false }),
      b5: await mk(T1, s1.id, "1e", { endDate: "2099-12-31", employmentType: "FULL_TIME" }),
    };
    const two = { c1: await mk(T2, s2.id, "2a", {}), c2: await mk(T2, s2.id, "2b", { employmentType: "PROBATION" }), c3: await mk(T2, s2.id, "2c", { active: false }) };
    const want = { b1: "ACTIVE", b2: "PROBATION", b3: "ENDED", b4: "ENDED", b5: "ACTIVE" } as Record<string, string>;
    const stateOf = async (m: Record<string, string>) => {
      const out: Record<string, string> = {};
      for (const [k, id] of Object.entries(m)) out[k] = `${await rawCol("HrEmployee", "unitId", id)}|${await rawCol("HrEmployee", "employmentStatus", id)}`;
      return out;
    };
    const mainState = async () => {
      const out: string[] = [];
      for (const id of [E.e1, E.e2, E.e3, E.eB]) out.push(`${await rawCol("HrEmployee", "unitId", id)}|${await rawCol("HrEmployee", "employmentStatus", id)}`);
      return out.join(";");
    };
    const main0 = await mainState();
    const st0 = await stateOf(one);
    const dry = await runBackfill(["--tenant", T1]);
    const st1 = await stateOf(one);
    const unchanged = JSON.stringify(st0) === JSON.stringify(st1) && Object.values(st1).every((v) => /^(null|∅col)\|(null|∅col)$/.test(v));
    chk("S2.1", dry.code === 0 && unchanged && existsSync(join(ROOT, BACKFILL)), "exit 0 · nothing changed", `exit=${dry.code} unchanged=${unchanged} ${dry.code !== 0 ? short(dry.out.split("\n").slice(-3).join(" "), 90) : ""}`);
    const ap = await runBackfill(["--tenant", T1, "--apply"]);
    const st2 = await stateOf(one);
    const units = Object.values(st2).map((v) => v.split("|")[0]);
    chk("S2.2", ap.code === 0 && units.every((x) => x === u0), "every unitId = u0", `exit=${ap.code} unitIds=${units.map((x) => (x === u0 ? "u0" : x)).join(",")}`);
    const stats = Object.fromEntries(Object.entries(st2).map(([k, v]) => [k, v.split("|")[1]]));
    chk("S2.3", Object.entries(want).every(([k, w]) => stats[k] === w), short(want), short(stats));
    const ap2 = await runBackfill(["--tenant", T1, "--apply"]);
    const st3 = await stateOf(one);
    const ints = [...ap2.out.matchAll(/(?<![\w.-])(\d{1,6})(?![\w.-])/g)].map((m) => Number(m[1]));
    chk("X6.1", ap2.code === 0 && JSON.stringify(st2) === JSON.stringify(st3) && ints.includes(0) && existsSync(join(ROOT, BACKFILL)), "exit 0 · identical · a 0 count", `exit=${ap2.code} identical=${JSON.stringify(st2) === JSON.stringify(st3)} zero=${ints.includes(0)}`);
    const twoBefore = await stateOf(two);
    const main1 = await mainState();
    const apT2 = await runBackfill(["--tenant", T2, "--apply"]);
    const twoAfter = await stateOf(two);
    const tw = Object.fromEntries(Object.entries(twoAfter).map(([k, v]) => [k, v.split("|")]));
    chk("S2.4", apT2.code === 0 && Object.values(tw).every(([u]) => u === null || u === "null") && tw.c1?.[1] === "ACTIVE" && tw.c2?.[1] === "PROBATION" && tw.c3?.[1] === "ENDED", "unitId null ×3 · ACTIVE/PROBATION/ENDED", `exit=${apT2.code} ${short(twoAfter)}`);
    const twoUntouched = Object.values(twoBefore).every((v) => /\|(null|∅col)$/.test(v));
    chk("S2.5", ap.code === 0 && twoUntouched && main0 === main1, "T2 statuses null before its run · main tenant unchanged", `ranT1=${ap.code === 0} T2before=${short(twoBefore, 80)} mainUnchanged=${main0 === main1}`);
    const outs = [dry.out, ap.out, ap2.out].join("\n");
    const leak = names.filter((n) => outs.includes(n)).length + emails.filter((e) => outs.includes(e)).length + [...Object.values(one), ...Object.values(E), T, T2].filter((x) => outs.includes(x)).length;
    chk("S2.6", ap.code === 0 && leak === 0, "0 names / ids / e-mails / other tenant ids", `ran=${ap.code === 0} leaks=${leak}`);
  }

  // ═══ S9 seed contract (READ-ONLY on qc-hr-v2) ═══
  console.log("── [S9] seed contract (read-only qc-hr-v2) ──");
  {
    const q = await hqcEnv.findQcTenant(P);
    if (!q) {
      chk("S9.2", false, "seeded tenant", "qc-hr-v2 not seeded on QC4");
      chk("S9.3", false, "seeded tenant", "qc-hr-v2 not seeded on QC4");
    } else {
      const HQC = hqcEnv.HQC;
      const unitRows = (await P.businessUnit.findMany({ where: { tenantId: q.tenantId }, select: { id: true, slug: true } })) as Any[];
      const unitBySlug = new Map(unitRows.map((u) => [u.slug as string, u.id as string]));
      const emps = (await P.hrEmployee.findMany({ where: { tenantId: q.tenantId, systemId: q.hrSystemId }, select: { id: true, code: true } })) as Any[];
      const byCode = new Map(emps.map((e) => [e.code as string, e.id as string]));
      const bad: string[] = [];
      const badSt: string[] = [];
      for (const e of HQC.employees as Any[]) {
        const id = byCode.get(e.code);
        if (!id) {
          bad.push(`${e.key}:∅`);
          continue;
        }
        const u = await rawCol("HrEmployee", "unitId", id);
        if (u !== unitBySlug.get(HQC.units[e.unit].slug)) bad.push(`${e.key}:${u === "∅col" ? "∅col" : u === null ? "null" : "other"}`);
        const st = await rawCol("HrEmployee", "employmentStatus", id);
        const want = !e.active ? "ENDED" : e.employmentType === "PROBATION" ? "PROBATION" : "ACTIVE";
        if (st !== want) badSt.push(`${e.key}:${st}≠${want}`);
      }
      let borrow = "∅table";
      if (HAS_EU) {
        const jay = byCode.get((HQC.employees as Any[]).find((x) => x.key === "jay")?.code);
        const r = jay ? ((await P.$queryRawUnsafe(`SELECT "unitId" FROM "HrEmployeeUnit" WHERE "employeeId" = $1 AND "toDate" IS NULL`, jay)) as Any[]) : [];
        borrow = r.length === 1 && r[0].unitId === unitBySlug.get(HQC.units.huahin.slug) ? "ok" : `rows=${r.length}`;
      }
      chk("S9.2", bad.length === 0 && borrow === "ok", "14 home units · jay → huahin open", `bad=${bad.slice(0, 6).join(" ") || "0"} borrow=${borrow}`);
      chk("S9.3", badSt.length === 0, "statuses per R2", badSt.slice(0, 5).join(" ") || "all");
    }
  }

  // ═══ X ═══
  console.log("── [X] isolation · privacy ──");
  {
    const ctxO = { tenantId: T2, systemId: sA.id };
    const n1 = ((await hr.listEmployees(ctxO, 200, { unitIds: "*" })) as Any[]).length;
    const n2 = ((await hr.listLeaves(ctxO, 100, { unitIds: "*" })) as Any[]).length;
    const n3 = ((await hr.listAttendance(ctxO, 50, { unitIds: "*" })) as Any[]).length;
    const lo = await privacy.leaveItemsForViewer(ctxO, vOf(U.other));
    const n4 = (lo.pending?.length ?? 0) + (lo.history?.length ?? 0);
    const leakB = seenA.filter((x) => x === E.eB || x === L.LB).length;
    chk("X2.1", n1 + n2 + n3 + n4 === 0 && leakB === 0 && seenA.length > 0, "0 rows · system-B ids in 0 results", `otherTenant emp=${n1} leave=${n2} att=${n3} dto=${n4} · sysB hits=${leakB} of ${seenA.length}`);
  }
  {
    const txt = Object.entries(refusals).filter(([, v]) => !!v);
    const unitNames = [`สาขาเหนือ ${stamp}`, `สาขาใต้ ${stamp}`];
    const badT = txt.filter(([, v]) => !isThai(v) || techLeak(v) || names.some((n) => v.includes(n)) || unitNames.some((n) => v.includes(n)) || [...Object.values(E), u1, u2, T].some((x) => v.includes(x)));
    chk("X8.1", refusals["S5.2"] === T_OTHER_BRANCH && txt.length >= 3 && badT.length === 0, "S5.2 = out-of-branch text · ≥3 refusals · all clean", `S5.2=${refusals["S5.2"] === T_OTHER_BRANCH ? "fixed" : `"${short(refusals["S5.2"], 30)}"`} refusals=${txt.length} bad=${badT.map(([k, v]) => `${k}:"${short(v, 40)}"`).join(" ") || "0"}`);
  }
  {
    const res: string[] = [];
    for (const [tag, w] of [["mgrU1", U.mgrU1], ["mgrAll", U.mgrAll], ["hrRead", U.hrRead]] as [string, Who][]) {
      for (const emp of [E.e1, E.e2]) {
        const r = await prof(ctxA, w, emp);
        if (r?.profile && "payType" in r.profile) res.push(`${tag}/${inv.get(emp)}`);
      }
    }
    chk("X8.2", res.length === 0, "no payType key", res.join(" ") || "clean");
  }
}

// ═════════════════════════ cleanup ═════════════════════════
async function cleanup(): Promise<void> {
  const d = async (n: string, f: () => Promise<unknown>) => {
    try {
      await f();
    } catch (e) {
      console.log(`  ⚠ cleanup ${n}: ${errText(e).slice(0, 90)}`);
    }
  };
  const euTable = await tableExists("HrEmployeeUnit").catch(() => false);
  for (let pass = 0; pass < 2; pass++) {
    for (const tid of tenants) {
      const all = [...new Set([tid, ...ids])];
      for (let i = 0; i < all.length; i += 50) {
        const part = all.slice(i, i + 50);
        await d("chatRateBucket", () => P.chatRateBucket.deleteMany({ where: { OR: part.map((x) => ({ key: { contains: x } })) } }));
      }
      if (euTable) await d("HrEmployeeUnit", () => P.$executeRawUnsafe(`DELETE FROM "HrEmployeeUnit" WHERE "tenantId" = $1`, tid));
      for (const m of [
        "approvalDecision", "approvalRequest", "approvalStep", "approvalPolicy",
        "hrPayrollItem", "hrPayAdjustment", "hrPayrollRun", "hrSalaryProfile",
        "hrEmployeeDoc", "hrAttendance", "hrLeave", "hrWorkSchedule", "hrEmployee",
        "outboxEvent", "appNotification", "webhookDelivery", "auditLog", "aiProposal", "aiPlan", "aiMessage", "aiConversation",
        "party", "membership", "appSystemUnit", "appSystem", "businessUnit",
      ]) {
        if (P[m]?.deleteMany) await d(m, () => P[m].deleteMany({ where: { tenantId: tid } }));
      }
      await d("tenant", () => P.tenant.deleteMany({ where: { id: tid } }));
    }
  }
  const extra = ((await P.user.findMany({ where: { email: { startsWith: `${SLUG}-` } }, select: { id: true } }).catch(() => [])) as Any[]).map((u) => u.id as string);
  for (const uid of [...new Set([...users, ...extra])]) {
    await d("session", () => P.session.deleteMany({ where: { userId: uid } }));
    await d("appNotification(user)", () => P.appNotification.deleteMany({ where: { recipientUserId: uid } }));
    await d("membership(user)", () => P.membership.deleteMany({ where: { userId: uid } }));
    await d("user", () => P.user.deleteMany({ where: { id: uid } }));
  }
}

let crashed = "";
try {
  runStatic();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  try {
    await cleanup();
  } catch (e) {
    console.log(`💥 cleanup: ${errText(e)}`);
  }
}

const residue: string[] = [];
for (const tid of tenants) {
  for (const m of ["hrLeave", "hrEmployee", "hrAttendance", "hrSalaryProfile", "hrPayAdjustment", "hrPayrollRun", "hrPayrollItem", "auditLog", "outboxEvent", "membership", "appSystem", "businessUnit"]) {
    const n = await P[m].count({ where: { tenantId: tid } }).catch(() => -1);
    if (n !== 0) residue.push(`${m}=${n}`);
  }
}
if (await tableExists("HrEmployeeUnit").catch(() => false)) {
  const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "HrEmployeeUnit" WHERE "tenantId" = ANY($1::text[])`, tenants.length ? tenants : ["∅"]).catch(() => [{ n: -1 }])) as Any[];
  if (Number(r[0]?.n) !== 0) residue.push(`hrEmployeeUnit=${r[0]?.n}`);
}
{
  const all = [...new Set([...tenants, ...ids])];
  let nb = 0;
  for (let i = 0; i < all.length; i += 50) nb += await P.chatRateBucket.count({ where: { OR: all.slice(i, i + 50).map((x) => ({ key: { contains: x } })) } }).catch(() => -1000);
  if (nb !== 0) residue.push(`chatRateBucket=${nb}`);
}
const leftUsers = await P.user.count({ where: { OR: [{ id: { in: users.length ? users : ["∅"] } }, { email: { startsWith: `${SLUG}-` } }] } }).catch(() => -1);
const leftSessions = users.length ? await P.session.count({ where: { userId: { in: users } } }).catch(() => -1) : 0;
if (leftUsers !== 0) residue.push(`user=${leftUsers}`);
if (leftSessions !== 0) residue.push(`session=${leftSessions}`);
const leftTenants = await P.tenant.count({ where: { slug: { startsWith: SLUG_PREFIX } } }).catch(() => -1);
if (leftTenants !== 0) residue.push(`tenant(${SLUG_PREFIX}*)=${leftTenants}`);
console.log(`RESIDUE ${residue.length ? residue.join(",") : "none"} (tenants=${tenants.length} users=${users.length})`);
chk("Z1", residue.length === 0 && tenants.length > 0, "none", residue.join(",") || "none");
for (const [id] of CHECKS) if (!results.has(id)) chk(id.replace(/^H1\.1-/, ""), false, "checked", crashed ? `not reached (harness crashed: ${crashed.slice(0, 80)})` : "not reached");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
// base-expectation bookkeeping (registry column 4): RED checks are expected to fail on the base, GREEN controls to pass
const asBase = [...results.entries()].filter(([id, r]) => (BASE.get(id) === "RED" ? !r.ok : r.ok)).length;
const offBase = [...results.entries()].filter(([id, r]) => (BASE.get(id) === "RED" ? r.ok : !r.ok)).map(([id]) => `${id}(${BASE.get(id)}→${results.get(id)!.ok ? "pass" : "fail"})`);
const nRed = CHECKS.filter(([, , , b]) => b === "RED").length;
console.log(`BASE-EXPECTATION ${asBase}/${results.size} as registered (RED-by-design ${nRed} · GREEN controls ${CHECKS.length - nRed})${offBase.length ? ` · off: ${offBase.join(" ")}` : ""}`);
console.log(`\n===== ${SUITE} ===== passed ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}${crashed ? " · CRASHED" : ""}`);
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
    missing: skipReasons,
    baseRed: nRed,
    baseGreen: CHECKS.length - nRed,
    offBase,
  })}`,
);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);
