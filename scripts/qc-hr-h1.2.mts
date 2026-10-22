// QC — HR V2 · H1.2 — time and leave model: HrShift · HrRosterEntry · HrShiftSwapRequest · HrAttendance evidence columns ·
//      HrTimeCorrection · HrOtRequest · HrLeavePolicy (category = HrLeaveType) · HrLeaveBalanceTxn ledger · HrHoliday ·
//      HrLeave + policy/days/half-day/hours/attachment · judgement ABSENT/EARLY_OUT · pure hr/time-rules.ts · settings CRUD
// ⚠️ Oracle under change control (controller owns it) — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// requires: nothing seeded for the main groups — own throwaway tenants `qc-hr-h1.2-<stamp>` (main: 2 units u1/u2 · HR systems A, sys2,
//   D (S5 digests), M (S5.6 MONTHLY)) and `-other` (X2 / S6.1 other tenant), swept in `finally` · S7.2–S7.4/S7.6 READ (never write)
//   the seeded `qc-hr-v2` tenant if present
//
// Contract (ledger/hr-briefs/hr-brief-H1.2.md §2 R1–R12 · §3 · §9 rulings 22 Oct · base session/hr 2a5f9a3e — H0.7 and H1.1 NOT merged):
//   R1 migration A 20261205000000_hr_time_leave_model (additive, 8 enums, 8 tables, HrAttendance +7, HrLeave +5, raw partial/expression
//      uniques) · R2 migration B 20261205000001_hr_judgement_enums = exactly 2 × ALTER TYPE … ADD VALUE IF NOT EXISTS · R3 no backfill ·
//   R4 src/lib/modules/hr/time-rules.ts (pure) bkkDayKey · bkkMidnight · addDays · shiftWindow · paidMinutes · overlapMinutes ·
//      rosterDayOf · leaveDaysBetween · R5 src/lib/modules/hr/settings.ts · R6 existing readers byte-identical · R7 privacy ·
//   R8 payroll freeze · R9 settings stub + hr/settings-actions.ts · R10 scope.ts / hr-qc-env registrations · R11 seed + expected
//   (all new tables / columns are read and written here through $queryRaw / $executeRaw only — the base Prisma client does not know them)
//
// ORACLE CONTRACT (the brief names no signature — fixed here, builder asks for an ORACLE-EDIT if it must differ):
//   settings.ts  lists  : listShifts(ctx, { scope }) · listLeavePolicies(ctx, { scope }) · listHolidays(ctx, { year, scope })
//                          scope = hrScopeOf(viewer) of H1.1 ({ unitIds: "*" | string[] }) · return an array of rows (keys = model columns)
//                writes : createShift(ctx, viewer, input) · updateShift(ctx, viewer, id, patch) · archiveShift(ctx, viewer, id) ·
//                          createLeavePolicy(ctx, viewer, input) · updateLeavePolicy(ctx, viewer, id, patch) · archiveLeavePolicy(ctx, viewer, id) ·
//                          upsertHoliday(ctx, viewer, input) (no `id` ⇒ insert · with `id` ⇒ update) · deleteHoliday(ctx, viewer, id)
//                          viewer = HrViewer { role, unitAccess, permissions, userId } · input keys = R1 column names (unitId null = shop-wide)
//                          success = { ok: true, id } · refusal = { ok: false, reason: <fixed Thai text> } (a thrown Error with the Thai text
//                          is accepted as a refusal too)
//   settings-actions.ts : createShiftAction · updateShiftAction · archiveShiftAction · createLeavePolicyAction · updateLeavePolicyAction ·
//                          archiveLeavePolicyAction · upsertHolidayAction · deleteHolidayAction — each `(formData: FormData)` · form fields:
//                          systemId · unitId ("" = shop-wide) · id (+ shiftId / policyId / holidayId, same value) · name · startMin / endMin /
//                          breakMin / graceMin (minutes) + start / end ("HH:MM", same values) · colour · category · quotaDays · date · kind
//   time-rules.ts       : shiftWindow(day, { startMin, endMin, crossesMidnight }) → { start: Date, end: Date } · refusal = throw / null /
//                          { ok:false } · paidMinutes({ startMin, endMin, breakMin, crossesMidnight }) → number · overlapMinutes({start,end},
//                          {start,end}) → number · rosterDayOf(at, windows[{ id, day, date, start, end }]) → the window's day (string) or the
//                          element / its id / its index · leaveDaysBetween(from, to, { halfDay, excluded: Set<day> }) → "N.N"
//
// Groups: S1 migration/schema · S2 time-rules (pure) · S3 settings CRUD + unit scope · S4 uniques under race · S5 frozen digests ·
//         S6 privacy · S7 seed/expected · X1 idempotency · X2 isolation · X3 action matrix · X7 no today · X8 HR-only · X12 fitness · Z1 residue
// Base expectation per check (registry column 4): RED = needs H1.2 (red for the right reason on 2a5f9a3e) · GREEN = control that must stay green.
//
// FROZEN (S5): computed on 2a5f9a3e by this oracle's own S5 fixture (HR system D, employees D01–D03, dates 2030, ids → labels, timestamps
//   createdAt/updatedAt/pinSetAt → "<ts>") · keys that H0.7 / H1.1 add by design (filedById · linkApprovedById · unitId · employmentStatus ·
//   probationEndAt · contractEndAt · filedBy) are dropped before hashing so the digests stay valid on the H1.1 merge commit · every other key
//   (incl. any H1.2 column leaking into a whole-row reader) changes the digest · key ORDER is part of the digest (§9 extra ruling on R6).
//   S5.6 = the H1.1 frozen MONTHLY digest (same 4-employee fixture as qc-hr-h1.1, code copied verbatim).
//
// SKIP convention (house style of qc-hr-h1.1): while nothing of H1.2 exists (no migration folder A · no hr/time-rules.ts) the suite prints
//   SKIPPED + JSON_SUMMARY {skipped:true} and exits 0 · QC_FORCE=1 (or --force-run) runs everything · on the base every RED check is red
//   for the right reason, GREEN controls are green, no crash, no residue. --list = print every id without touching the DB.
// Server actions are called for real inside a simulated Next request scope with real temporary Session rows (technique of qc-hr-h0.3 /
//   qc-hr-h1.1) — never over HTTP.
//
// Run (QC4 only):
//   bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h1.2.mts
//   bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-hr-h1.2.mts      (SKIP exit 0 on the base)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const SUITE = "qc-hr-h1.2";
const ROOT = process.cwd();
const ARGV = process.argv.slice(2);
const LIST = ARGV.includes("--list");
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const QC4_HOST_MARK = "ep-frosty-lab";
const SLUG_PREFIX = "qc-hr-h1.2-";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MIG_A_DIR = "prisma/migrations/20261205000000_hr_time_leave_model";
const MIG_B_DIR = "prisma/migrations/20261205000001_hr_judgement_enums";
const MIG_A = `${MIG_A_DIR}/migration.sql`;
const MIG_B = `${MIG_B_DIR}/migration.sql`;
const TIME_RULES = "src/lib/modules/hr/time-rules.ts";
const SETTINGS = "src/lib/modules/hr/settings.ts";
const SETTINGS_ACTIONS = "src/lib/modules/hr/settings-actions.ts";
const SCOPE_FILE = "src/lib/modules/hr/scope.ts";
const PRIVACY_SHARED = "src/lib/modules/hr/privacy-shared.ts";
const RULES_FILE = "src/lib/modules/hr/payroll-rules.ts";
const PAYROLL_FILE = "src/lib/modules/hr/payroll.ts";
const CORE_SCOPE = "src/lib/core/scope.ts";
const SCHEMA_DIR = "prisma/schema";
const HR_ENV = "scripts/hr-qc-env.mts";
const SEED_FILE = "scripts/seed-hr-qc.mts";
const FITNESS_HR = "scripts/fitness-hr.mts";
const AI_TOOLS = "src/lib/ai/tools.ts";
const CALENDAR = "src/lib/modules/calendar/service.ts";
const EXPECTED = "scripts/hr-expected.json";
/** sha256 of payroll-rules.ts (FREEZE — COMMON §C.4 · same value as qc-hr-h0.6/h0.7/h1.1) */
const RULES_SHA = "75a66c0c1354e932e7ba29609dcbf0919ffe82b51f476a3945fd1a0749833bf7";
/** sha256 of the `model HrWorkSchedule { … }` block of hr.prisma on 2a5f9a3e (R1: untouched) */
const WORK_SCHEDULE_SHA = "cf480f5f67df248ddd0c64bf43b79676f815a8c28ec199ab071badb4cfb0a062";

// ── fixed texts (R5 · Q3) ──
const T_SHIFT_DUP = "มีกะชื่อนี้อยู่แล้วในสาขานี้";
const T_HOLIDAY_DUP = "มีวันหยุดวันนี้อยู่แล้ว";
const T_POLICY_DUP = "มีประเภทการลาชื่อนี้อยู่แล้ว";
const T_SHIFT_EQUAL = "เวลาเริ่มกับเวลาเลิกกะต้องไม่เท่ากัน";
const T_OTHER_UNIT = "รายการนี้เป็นของสาขาอื่น — คุณจัดการได้เฉพาะสาขาของคุณ";

// ── R1 model (column · kind · nullable · default) ──
type Kind = "text" | "int" | "bool" | "date" | "ts" | "dec41" | "dec96" | "json" | `E:${string}`;
type Col = readonly [string, Kind, boolean, string?];
const ENUMS: Record<string, readonly string[]> = {
  HrRosterSource: ["TEMPLATE", "MANUAL", "AI"],
  HrClockSource: ["KIOSK", "MANAGER", "MOBILE", "CORRECTION", "POS", "IMPORT"],
  HrRequestStatus: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
  HrSwapStatus: ["AWAITING_PEER", "PENDING", "APPROVED", "REJECTED", "CANCELLED"],
  HrOtTiming: ["BEFORE", "AFTER"],
  HrLeaveTxnKind: ["GRANT", "USE", "CARRY", "EXPIRE", "ADJUST"],
  HrHolidayKind: ["PUBLIC", "SHOP"],
  HrHalfDay: ["AM", "PM"],
};
const JUDGEMENT_6 = ["ON_TIME", "LATE", "DAY_OFF", "NO_SCHEDULE", "ABSENT", "EARLY_OUT"];
const BASE_COLS: readonly Col[] = [["id", "text", false], ["tenantId", "text", false], ["systemId", "text", false], ["createdAt", "ts", false, "CURRENT_TIMESTAMP"]];
const UPD: Col = ["updatedAt", "ts", false];
const TABLES: Record<string, readonly Col[]> = {
  HrShift: [...BASE_COLS, UPD, ["unitId", "text", true], ["name", "text", false], ["code", "text", true], ["startMin", "int", false], ["endMin", "int", false], ["breakMin", "int", false, "0"], ["graceMin", "int", false, "15"], ["crossesMidnight", "bool", false, "false"], ["colour", "text", true], ["active", "bool", false, "true"], ["sortOrder", "int", false, "0"]],
  HrRosterEntry: [...BASE_COLS, UPD, ["employeeId", "text", false], ["date", "date", false], ["shiftId", "text", false], ["unitId", "text", true], ["startMin", "int", false], ["endMin", "int", false], ["breakMin", "int", false], ["crossesMidnight", "bool", false], ["published", "bool", false, "false"], ["publishedAt", "ts", true], ["source", "E:HrRosterSource", false, "MANUAL"], ["note", "text", true], ["createdById", "text", true]],
  HrShiftSwapRequest: [...BASE_COLS, UPD, ["requesterEmployeeId", "text", false], ["fromEntryId", "text", false], ["targetEmployeeId", "text", true], ["toEntryId", "text", true], ["status", "E:HrSwapStatus", false, "AWAITING_PEER"], ["reason", "text", true], ["requestedByUserId", "text", true], ["peerDecidedAt", "ts", true], ["decidedById", "text", true], ["decidedAt", "ts", true]],
  HrTimeCorrection: [...BASE_COLS, UPD, ["employeeId", "text", false], ["attendanceId", "text", true], ["rosterEntryId", "text", true], ["kind", "E:HrAttendanceKind", false], ["proposedAt", "ts", false], ["originalAt", "ts", true], ["reason", "text", false], ["status", "E:HrRequestStatus", false, "PENDING"], ["requestedByUserId", "text", true], ["decidedById", "text", true], ["decidedAt", "ts", true], ["resultAttendanceId", "text", true], ["evidenceJson", "json", true]],
  HrOtRequest: [...BASE_COLS, UPD, ["employeeId", "text", false], ["rosterEntryId", "text", true], ["date", "date", false], ["startAt", "ts", false], ["endAt", "ts", false], ["minutes", "int", false], ["timing", "E:HrOtTiming", false], ["reason", "text", true], ["status", "E:HrRequestStatus", false, "PENDING"], ["requestedByUserId", "text", true], ["decidedById", "text", true], ["decidedAt", "ts", true], ["multiplierBp", "int", true]],
  HrLeavePolicy: [...BASE_COLS, UPD, ["unitId", "text", true], ["category", "E:HrLeaveType", false], ["name", "text", false], ["paid", "bool", false, "true"], ["quotaDays", "dec41", true], ["minServiceDays", "int", false, "0"], ["firstYearProrata", "bool", false, "false"], ["carryMaxDays", "dec41", false, "0"], ["carryExpiresMonthDay", "text", true], ["allowHalfDay", "bool", false, "true"], ["allowHours", "bool", false, "false"], ["attachmentAfterDays", "int", true], ["yearStartMonth", "int", false, "1"], ["active", "bool", false, "true"], ["sortOrder", "int", false, "0"]],
  // ledger — never updated ⇒ no updatedAt required
  HrLeaveBalanceTxn: [...BASE_COLS, ["employeeId", "text", false], ["policyId", "text", false], ["kind", "E:HrLeaveTxnKind", false], ["days", "dec41", false], ["leaveYear", "int", false], ["effectiveDate", "date", false], ["leaveId", "text", true], ["sourceKey", "text", false], ["note", "text", true], ["createdById", "text", true]],
  HrHoliday: [...BASE_COLS, UPD, ["unitId", "text", true], ["date", "date", false], ["name", "text", false], ["kind", "E:HrHolidayKind", false], ["presetYear", "int", true], ["shopOpen", "bool", false, "false"], ["note", "text", true]],
};
const NEW_TABLES = Object.keys(TABLES);
const ATT_NEW: readonly Col[] = [["rosterEntryId", "text", true], ["source", "E:HrClockSource", true], ["lat", "dec96", true], ["lng", "dec96", true], ["accuracyM", "int", true], ["photoKey", "text", true], ["deviceId", "text", true]];
const LEAVE_NEW: readonly Col[] = [["policyId", "text", true], ["days", "dec41", true], ["halfDay", "E:HrHalfDay", true], ["hours", "dec41", true], ["attachmentKey", "text", true]];
const ATT_BASE = ["id", "tenantId", "systemId", "employeeId", "kind", "at", "note", "judgement", "dueMin", "lateMin"];
const LEAVE_BASE = ["id", "tenantId", "systemId", "employeeId", "type", "fromDate", "toDate", "status", "reason", "decidedById", "createdAt", "filedById"];
/** declared FKs (table.column → referenced table · pg confdeltype c=CASCADE r=RESTRICT n=SET NULL) */
const FKS: readonly [string, string, string, "c" | "r" | "n"][] = [
  ["HrRosterEntry", "employeeId", "HrEmployee", "c"],
  ["HrRosterEntry", "shiftId", "HrShift", "r"],
  ["HrShiftSwapRequest", "fromEntryId", "HrRosterEntry", "c"],
  ["HrAttendance", "rosterEntryId", "HrRosterEntry", "n"],
  ["HrTimeCorrection", "employeeId", "HrEmployee", "c"],
  ["HrTimeCorrection", "attendanceId", "HrAttendance", "n"],
  ["HrOtRequest", "employeeId", "HrEmployee", "c"],
  ["HrLeaveBalanceTxn", "employeeId", "HrEmployee", "c"],
  ["HrLeaveBalanceTxn", "policyId", "HrLeavePolicy", "r"],
  ["HrLeaveBalanceTxn", "leaveId", "HrLeave", "n"],
  ["HrLeave", "policyId", "HrLeavePolicy", "n"],
];
/** sensitive new columns (R7) — no DTO / page / action / AI / outbox reads them in H1.2 */
const R7_FIELDS = ["lat", "lng", "accuracyM", "photoKey", "deviceId", "attachmentKey"];
/** every H1.2 column name that may not surface in an existing DTO */
const H12_NEW_KEYS = ["rosterEntryId", "source", ...R7_FIELDS, "policyId", "days", "halfDay", "hours"];
/** keys H0.7 / H1.1 add by design — dropped before the S5 digests (see FROZEN above) */
const PRIOR_WO_KEYS = new Set(["filedById", "linkApprovedById", "unitId", "employmentStatus", "probationEndAt", "contractEndAt", "filedBy"]);
const SETTINGS_ACTION_NAMES = ["createShiftAction", "updateShiftAction", "archiveShiftAction", "createLeavePolicyAction", "updateLeavePolicyAction", "archiveLeavePolicyAction", "upsertHolidayAction", "deleteHolidayAction"] as const;

// ── S5.6 MONTHLY fixture — copied verbatim from qc-hr-h1.1 (S6.5) · values frozen there ──
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
/** H1.1 frozen value (qc-hr-h1.1 FROZEN_DIGEST / FROZEN_TOTALS / FROZEN_FLAGS) */
const FROZEN_MONTHLY_DIGEST = "72166a3e2a2ebb6a37405a105f7db540b946fda05fe020639bbe79a60b87e5c8";
const FROZEN_MONTHLY_TOTALS = "10725000:195000:195000:100000:10430000:475000:100000";
const FROZEN_MONTHLY_FLAGS = "M01=-,M02=-,M03=-,M04=PARTIAL_MONTH";

/** S5.1–S5.5 frozen on 2a5f9a3e (forced run of this oracle — see FROZEN above) */
const FROZEN_S5: Record<string, string> = {
  "S5.1": "8436a89981a0146a04c8954c6b0a49752eb7cb9c0661df9927bc356bd8fe46c9",
  "S5.2": "f43008cba9f7bfae26638ae985e4c11565803988943cf3cf2f3921de10b8a62d",
  "S5.3": "54ef63446a674b6108da0bf977e2b50aab14cfd40252f18c94c0d4eb0f2798b1",
  "S5.4": "9a4c6047d670e99934b26da17183246f1c3ce07415ccc1c7f81f66cb09df1fb3",
  "S5.5": "840adc0a26e7efd47a1e90cc033305236855d619f8b06aaf42dbb91c3b5e9643",
};
/** S7.3 frozen read of the seeded qc-hr-v2 attendance (count · judgement distribution) on 22 Oct 2026 */
const FROZEN_S73 = "120|OUT:-=60,IN:LATE=1,IN:ON_TIME=59";

// ═════════════════════════ registry (id · group · severity · base expectation · title) ═════════════════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Base = "RED" | "GREEN";
type Def = readonly [string, string, Sev, Base, string];
const D = (id: string, g: string, sev: Sev, base: Base, title: string): Def => [`H1.2-${id}`, g, sev, base, title] as const;
const CHECKS: readonly Def[] = [
  // S1 migration / schema (R1 · R2 · R10)
  D("S1.1", "R1", "CRITICAL", "RED", "[static] migration A " + MIG_A_DIR + " exists · additive (no DROP · ALTER COLUMN · RENAME · ALTER TYPE) · 8 CREATE TYPE with the exact labels"),
  D("S1.2", "R1", "CRITICAL", "RED", "[static] migration A: 8 CREATE TABLE with the R1 columns / types / nullability / defaults (DECIMAL(4,1) days · quotaDays · carryMaxDays · hours)"),
  D("S1.3", "R1", "CRITICAL", "RED", "[static] HrAttendance +7 nullable columns without DEFAULT (lat/lng DECIMAL(9,6)) · FK rosterEntryId → HrRosterEntry ON DELETE SET NULL · index (rosterEntryId)"),
  D("S1.4", "R1", "CRITICAL", "RED", "[static] HrLeave +5 nullable columns (days/hours DECIMAL(4,1)) · FK policyId → HrLeavePolicy ON DELETE SET NULL · no requestedByUserId (Q1 ruled)"),
  D("S1.5", "R1", "CRITICAL", "RED", "[static] uniques: shift (systemId, COALESCE(unitId,''), lower(name)) WHERE active · roster (employeeId,date,shiftId) · swap (fromEntryId) open · correction ×2 · OT (employeeId,startAt) live · policy name · holiday (systemId,date,COALESCE(unitId,'')) · balance (systemId,sourceKey)"),
  D("S1.6", "R2", "CRITICAL", "RED", "[static] migration B " + MIG_B_DIR + " = exactly ADD VALUE IF NOT EXISTS 'ABSENT' + 'EARLY_OUT' · sorts after A · A has no ADD VALUE"),
  D("S1.7", "R1", "MAJOR", "RED", "[static] schema: 8 models with the R1 fields/types · 8 enums · HrAttendanceJudgement 6 values in order · HrAttendance/HrLeave new fields · HrLeave.type still HrLeaveType · HrWorkSchedule block byte-identical"),
  D("S1.8", "R10", "MAJOR", "RED", "[static] core/scope.ts registers the 8 models as sys() · hr-qc-env.mts HR_TABLES has the 8 models"),
  D("S1.9", "R1", "CRITICAL", "RED", "[db] QC4 columns / types / nullability exact for the 8 tables + the 12 new HrAttendance/HrLeave columns"),
  D("S1.10", "R2", "CRITICAL", "RED", "[db] enum HrAttendanceJudgement labels = " + JUDGEMENT_6.join(",") + " (in order) · 8 new enums with the exact labels"),
  D("S1.11", "R1", "CRITICAL", "GREEN", "[db] [control] additive: every base column of HrAttendance (10) and HrLeave (11 + H0.7 filedById) still exists"),
  D("S1.12", "R1", "CRITICAL", "RED", "[db] FK delete actions via pg_constraint: 11 FKs Cascade / Restrict / SetNull as declared"),
  // S2 time-rules vectors (R4, pure)
  D("S2.1", "R4", "CRITICAL", "RED", "[pure] time-rules.ts exports the 8 helpers · imports nothing from prisma / core/db / ./service"),
  D("S2.2", "R4", "CRITICAL", "RED", "[pure] bkkDayKey 16:59:59Z → 10-21 · 17:00Z → 10-22 · leap 02-29 · year end 2027-01-01 · bkkMidnight / addDays (leap-safe) vectors"),
  D("S2.3", "R4", "CRITICAL", "RED", "[pure] 500 instants 2026–2030 incl. other zones' DST dates: bkkDayKey = bkkParts().dateStr · bkkMidnight exactly −07:00 · days exactly 24 h"),
  D("S2.4", "R4", "MAJOR", "RED", "[pure] shiftWindow day shift 07:00–15:00 ⇒ 00:00Z–08:00Z same day"),
  D("S2.5", "R4", "CRITICAL", "RED", "[pure] overnight 22:00–06:00: 10-31 ⇒ 15:00Z–23:00Z (ends BKK 11-01) · 01-31 → 02-01 · 12-31 → 01-01 · 2028-02-28 → 02-29"),
  D("S2.6", "R4", "CRITICAL", "RED", "[pure] shiftWindow refuses start = end · minutes < 0 / > 1439 · crossesMidnight ≠ (endMin < startMin) · endMin 1440 with crossesMidnight · accepts endMin 1440 without"),
  D("S2.7", "R4", "MAJOR", "RED", "[pure] paidMinutes 480−60 = 420 · break ≥ length ⇒ 0 · overnight 22–06 no break = 480"),
  D("S2.8", "R4", "MAJOR", "RED", "[pure] overlapMinutes: disjoint 0 · touching 0 · contained 60 · partial 60 · overnight vs next-day morning 0 · overnight vs early morning 60"),
  D("S2.9", "R4", "CRITICAL", "RED", "[pure] rosterDayOf: 02:00 BKK 11-01 inside the 10-31 night window ⇒ 10-31 (D13b) · between windows ⇒ null"),
  D("S2.10", "R4", "MAJOR", "RED", "[pure] leaveDaysBetween 3 days ⇒ \"3.0\" · AM half ⇒ \"0.5\" · one excluded holiday ⇒ \"2.0\" · from > to ⇒ refusal"),
  D("S2.11", "R4", "MAJOR", "RED", "[static] time-rules.ts never reads the clock (no Date.now · no argument-less new Date())"),
  D("S2.12", "R4", "MAJOR", "RED", "[static] settings.ts imports shiftWindow from ./time-rules and calls it (one validation rule)"),
  // S3 settings CRUD + unit scope (R5)
  D("S3.1", "R5", "CRITICAL", "RED", "[service] owner createShift shop-wide + u1 + u2 ⇒ 3 rows with the given unitId / times / colour"),
  D("S3.2", "R5", "CRITICAL", "RED", "[service] overnight 22:00–06:00 stored crossesMidnight true · start = end ⇒ \"" + T_SHIFT_EQUAL + "\" · mismatching flag ⇒ refused · 0 rows"),
  D("S3.3", "R5", "CRITICAL", "RED", "[service] 🔴 listShifts(scope manager-u1) ⇒ every active shop-wide + u1 row · never a u2 row"),
  D("S3.4", "R5", "CRITICAL", "RED", "[service] 🔴 manager-u1 createShift on u2 ⇒ \"" + T_OTHER_UNIT + "\" · on shop-wide ⇒ refused · 0 rows · on u1 ⇒ ok"),
  D("S3.5", "R5", "CRITICAL", "RED", "[service] archiveShift of a shift used by a roster entry ⇒ active false · entry intact · hard DELETE ⇒ 23001 (FK Restrict)"),
  D("S3.6", "R5", "MAJOR", "RED", "[service] duplicate active name same unit (incl. case) ⇒ \"" + T_SHIFT_DUP + "\" · same name other unit ok · archived + new same name ok"),
  D("S3.7", "R5", "MAJOR", "RED", "[service] policy category outside HrLeaveType ⇒ refused · quotaDays 6.5 ok · 6.25 refused · carryMaxDays > quotaDays refused · duplicate ⇒ \"" + T_POLICY_DUP + "\""),
  D("S3.8", "R5", "CRITICAL", "RED", "[service] 🔴 policy unit scope: manager-u1 list ⇒ shop-wide + u1 only · create on u2 ⇒ out-of-branch text · shop-wide refused · u1 ok"),
  D("S3.9", "R5", "MAJOR", "RED", "[service] upsertHoliday shop-wide + u1 same date ⇒ 2 rows · 2nd shop-wide same date ⇒ \"" + T_HOLIDAY_DUP + "\" · manager-u1 on u2 ⇒ out-of-branch text"),
  D("S3.10", "R5", "MAJOR", "RED", "[service] listHolidays({year 2031}) = Bangkok-year bounds: 2031-01-01 + 2031-12-31 in · 2030-12-31 + 2032-01-01 out · deleteHoliday hard-deletes"),
  D("S3.11", "R9", "CRITICAL", "RED", "[action] plain member + staff-u1 createShiftAction ⇒ refused (Thai, no fixture data) · 0 rows · owner createShiftAction ⇒ row"),
  D("S3.12", "R5", "MAJOR", "RED", "[db] audit: one hr.settings.<entity>.<op> row per successful S3 write · before/after carry ids only (no names)"),
  // S4 uniques under race (R1)
  D("S4.1", "R1", "CRITICAL", "RED", "[race] roster (employeeId,date,shiftId) 10-way × 3 rounds ⇒ exactly 1 row · 9 × 23505 per round"),
  D("S4.2", "R1", "CRITICAL", "RED", "[race] holiday shop-wide (systemId,date,COALESCE(unitId,'')) 10-way × 3 ⇒ 1 row per round"),
  D("S4.3", "R5", "CRITICAL", "RED", "[race] createShift same active name 10-way × 3 (service path) ⇒ 1 row per round · losers get \"" + T_SHIFT_DUP + "\""),
  D("S4.4", "R5", "CRITICAL", "RED", "[race] createLeavePolicy same name 10-way × 3 ⇒ 1 row per round · losers get \"" + T_POLICY_DUP + "\""),
  D("S4.5", "R1", "CRITICAL", "RED", "[race] HrLeaveBalanceTxn (systemId,sourceKey) 10-way × 3 ⇒ 1 row per round"),
  D("S4.6", "R1", "CRITICAL", "RED", "[race] swap open per fromEntryId 10-way × 3 ⇒ 1 · CANCELLED + new open ⇒ accepted"),
  D("S4.7", "R1", "CRITICAL", "RED", "[race] OT live (employeeId,startAt) 10-way × 3 ⇒ 1 · REJECTED + new ⇒ accepted"),
  D("S4.8", "R1", "CRITICAL", "RED", "[race] correction PENDING per attendanceId 10-way × 3 ⇒ 1"),
  // S5 frozen digests (R3 · R6 · R8)
  D("S5.1", "R6", "CRITICAL", "GREEN", "[digest] listAttendance(ctxD, 50) JSON (ids → labels) = FROZEN"),
  D("S5.2", "R6", "CRITICAL", "GREEN", "[digest] listLeaves(ctxD, 100) + pendingLeaves(ctxD, 100) JSON = FROZEN"),
  D("S5.3", "R6", "CRITICAL", "GREEN", "[digest] leaveItemsForViewer owner / manager-u1 / staff-u1 (linked D01) = FROZEN"),
  D("S5.4", "R6", "MAJOR", "GREEN", "[digest] monthlyAttendance 2030-03 per employee (D01–D03) = FROZEN"),
  D("S5.5", "R6", "MAJOR", "GREEN", "[digest] employeesUnavailable ×2 dates · isOnLeave(staff-u1) ×2 instants · kioskRoster = FROZEN"),
  D("S5.6", "R8", "CRITICAL", "GREEN", "[digest] MONTHLY payroll fixture items + 7 totals + flags = the H1.1 frozen digest 72166a3e…"),
  D("S5.7", "R3", "CRITICAL", "RED", "[db] every S5 HrAttendance/HrLeave row has all 12 new columns present and null · a new clock() + requestLeave() also writes null"),
  D("S5.8", "R8", "CRITICAL", "GREEN", "[static] payroll-rules.ts sha 75a66c0c… · payroll.ts unchanged vs the merge-base with origin/session/hr (or QC_H12_BASE)"),
  // S6 privacy (R7)
  D("S6.1", "R7", "CRITICAL", "GREEN", "[dto] matrix owner · payroll · manager-u1 · hr.leave.read · plain member · self · other tenant: profile + leave-item key lists = base (+ H0.7/H1.1 additions) · no H1.2 key"),
  D("S6.2", "R7", "CRITICAL", "GREEN", "[static] privacy-shared.ts: no H1.2 key · EMPLOYEE_SENSITIVE_FIELDS still the 6 keys · LeaveItemDto keys ⊆ base ∪ {filedBy}"),
  D("S6.3", "R7", "CRITICAL", "RED", "[static] fitness-hr F16.1 SENSITIVE_FIELDS ⊇ lat · lng · photoKey · attachmentKey · fitness-hr exit 0"),
  D("S6.4", "R7", "CRITICAL", "GREEN", "[static] no code under hr/** · app/**/hr/** · ai/** · outbox-consumers.ts reads " + R7_FIELDS.join("|")),
  D("S6.5", "R6", "MAJOR", "GREEN", "[static] ai/tools.ts (~2084 · ~2393) and calendar/service.ts (~135) map named leave fields (no spread / return of the row)"),
  D("S6.6", "R7", "CRITICAL", "RED", "[dto] settings lists carry no employee data (no employee* key · no employee name in the JSON)"),
  // S7 seed / expected (R11)
  D("S7.1", "R11", "MAJOR", "RED", "[static] seed-hr-qc.mts writes HrShift (one crossesMidnight) · HrLeavePolicy (\"รอเจ้าของยืนยัน\") · HrHoliday · no roster / txn / request rows"),
  D("S7.2", "R11", "MAJOR", "RED", "[db read] seeded qc-hr-v2: 4 shifts (3 shop-wide = HQC.shifts + colours shift-1..3 · night 22–06) · 4 policies (HQ12 defaults) · 2 holidays (PUBLIC presetYear · SHOP huahin)"),
  D("S7.3", "R11", "MAJOR", "GREEN", "[db read] seeded qc-hr-v2 attendance: 120 rows (= hr-expected.json) · judgement distribution = FROZEN"),
  D("S7.4", "R11", "MAJOR", "RED", "[db read] hr-expected.json counts include HrShift 4 · HrLeavePolicy 4 · HrHoliday 2 · every Hr* count = live (roster/txn/request tables 0)"),
  D("S7.5", "R10", "MAJOR", "RED", "[static+db] HR_DELETE_ORDER lists the 8 delegates children-first · applying it to our main tenant leaves 0 rows in the 8 tables"),
  D("S7.6", "R11", "CRITICAL", "GREEN", "[db read] other tenants untouched: seeded qc-hr-v2 row counts (HR + payroll + new settings tables + audit/outbox) identical before/after · other-tenant fixture employee unchanged"),
  // X
  D("X1.1", "X1", "MAJOR", "RED", "[db] idempotency: the same sourceKey inserted twice sequentially ⇒ 1 row (2nd = 23505)"),
  D("X2.1", "X2", "CRITICAL", "RED", "[service] other tenant's shift / policy / holiday ids from our ctx ⇒ refused / not found · rows unchanged"),
  D("X2.2", "X2", "CRITICAL", "RED", "[service] sys2's shift from system A's ctx ⇒ archive/update refused · never in system A lists (flag: no roster-entry writer in H1.2)"),
  D("X2.3", "X2", "CRITICAL", "RED", "[service] 🔴 manager-u1 never reads a u2 policy / holiday / shift through any list (years 2030–2032)"),
  D("X3.1", "X3", "CRITICAL", "RED", "[action] matrix 8 settings actions × {member, staff-u1, manager-u1@u2} refused + unchanged · × {manager-u1@u1, owner, manager-all} ok"),
  D("X7.1", "X7", "MAJOR", "GREEN", "[static+run] oracle never uses today: fixture date literals ≥ 2030 (pure vectors excepted) · today's date absent from every S5 payload"),
  D("X8.1", "X8", "MAJOR", "RED", "[run] HR with no ACCOUNT/POS system (main tenant) ran every S3 path green"),
  D("X12.1", "X12", "MAJOR", "GREEN", "[run] fitness-hr.mts runs without env (no DATABASE_URL) ⇒ exit 0"),
  D("Z1", "-", "CRITICAL", "GREEN", "residue: tenants qc-hr-h1.2-* gone · no row of ours in the 8 new tables + HR/payroll/audit/outbox · users/sessions gone"),
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
  const full = `H1.2-${id}`;
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
const textOf = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["reason", "message", "error", "note"]) if (typeof o[k] === "string" && o[k]) return String(o[k]);
  }
  return "";
};
const srt = (a: Iterable<string>) => [...a].sort().join(",");
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
/** SQL normalised for regexes: comments dropped · lower case · no double quotes · no ::text casts · single spaces */
function normSql(p: string): string {
  return rd(p)
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n")
    .replace(/"/g, "")
    .replace(/::text/gi, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}
/** SQL with comments dropped and whitespace collapsed (case + quotes kept) */
function rawSql(p: string): string {
  return rd(p)
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n")
    .replace(/\s+/g, " ");
}
const SQL_TYPE = (k: Kind) =>
  k === "text" ? "TEXT" : k === "int" ? "INTEGER" : k === "bool" ? "BOOLEAN" : k === "date" ? "DATE" : k === "ts" ? "TIMESTAMP(3)" : k === "dec41" ? "DECIMAL(4,1)" : k === "dec96" ? "DECIMAL(9,6)" : k === "json" ? "JSONB" : `"${k.slice(2)}"`;
const PRISMA_TYPE = (k: Kind) =>
  k === "text" ? "String" : k === "int" ? "Int" : k === "bool" ? "Boolean" : k === "date" || k === "ts" ? "DateTime" : k === "dec41" || k === "dec96" ? "Decimal" : k === "json" ? "Json" : k.slice(2);
function colDefOk(defs: Map<string, string>, [name, kind, nullable, dflt]: Col): boolean {
  const d = defs.get(name);
  if (!d) return false;
  const t = SQL_TYPE(kind).replace(/[()]/g, (m) => `\\${m}`).replace(/"/g, '"');
  if (!new RegExp(`^${t}(\\s|$)`, "i").test(d)) return false;
  if (/NOT NULL/i.test(d) === nullable) return false;
  if (dflt !== undefined) {
    const want = kind.startsWith("E:") ? `'${dflt}'` : dflt;
    if (!new RegExp(`DEFAULT ${want.replace(/[()]/g, (m) => `\\${m}`)}(\\s|$)`, "i").test(d)) return false;
  }
  return true;
}
/** CREATE TABLE "<t>" ( … ); → column name → rest of the definition */
function createTableDefs(sql: string, table: string): Map<string, string> | null {
  const m = sql.match(new RegExp(`CREATE TABLE "${table}" \\((.*?)\\);`, "i"));
  if (!m) return null;
  const out = new Map<string, string>();
  for (const part of m[1]!.split(/,\s*(?="|CONSTRAINT)/)) {
    const mm = part.trim().match(/^"([^"]+)"\s+(.*)$/);
    if (mm) out.set(mm[1]!, mm[2]!.trim());
  }
  return out;
}
/** ALTER TABLE "<t>" ADD COLUMN … (every statement on that table) → column name → definition */
function addColumnDefs(sql: string, table: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of sql.matchAll(new RegExp(`ALTER TABLE "${table}" (ADD COLUMN .*?);`, "gi"))) {
    for (const part of m[1]!.split(/,\s*(?=ADD COLUMN)/i)) {
      const mm = part.trim().match(/^ADD COLUMN "([^"]+)"\s+(.*)$/i);
      if (mm) out.set(mm[1]!, mm[2]!.trim());
    }
  }
  return out;
}

// ═════════════════════════ statics (no DB) ═════════════════════════
const allSchema = () =>
  existsSync(join(ROOT, SCHEMA_DIR))
    ? readdirSync(join(ROOT, SCHEMA_DIR))
        .filter((f) => f.endsWith(".prisma"))
        .map((f) => rd(join(SCHEMA_DIR, f)))
        .join("\n")
    : "";
function runStatic(): void {
  console.log("── [S1/S2/S5/S6/S7] statics ──");
  const a = rawSql(MIG_A);
  const an = normSql(MIG_A);
  // S1.1
  const enumOk = (name: string) => new RegExp(`CREATE TYPE "${name}" AS ENUM \\(\\s*${ENUMS[name]!.map((v) => `'${v}'`).join(",\\s*")}\\s*\\)`, "i").test(a);
  const s11 = {
    exists: !!a.trim(),
    noDrop: !/\bDROP\b/i.test(a),
    noAlterCol: !/ALTER COLUMN/i.test(a),
    noRename: !/\bRENAME\b/i.test(a),
    noAlterType: !/ALTER TYPE/i.test(a),
    enums: Object.keys(ENUMS).every(enumOk),
  };
  chk("S1.1", Object.values(s11).every(Boolean), "exists · additive · 8 enums exact", a.trim() ? `${failedKeys(s11)} · enums missing/wrong=${Object.keys(ENUMS).filter((n) => !enumOk(n)).join(",") || "0"}` : `∅ ${MIG_A}`);
  // S1.2
  const bad12: string[] = [];
  for (const [t, cols] of Object.entries(TABLES)) {
    const defs = createTableDefs(a, t);
    if (!defs) {
      bad12.push(`${t}:∅`);
      continue;
    }
    for (const c of cols) if (!colDefOk(defs, c)) bad12.push(`${t}.${c[0]}${defs.has(c[0]) ? `(${short(defs.get(c[0]), 40)})` : ":∅"}`);
  }
  chk("S1.2", !!a.trim() && bad12.length === 0, "8 tables · every R1 column exact", a.trim() ? bad12.slice(0, 10).join(" ") + (bad12.length > 10 ? ` … +${bad12.length - 10}` : "") : `∅ ${MIG_A}`);
  // S1.3
  const att = addColumnDefs(a, "HrAttendance");
  const bad13 = ATT_NEW.filter((c) => !colDefOk(att, c) || /DEFAULT/i.test(att.get(c[0]) ?? "")).map((c) => c[0]);
  const fkAtt = /ALTER TABLE "HrAttendance" ADD CONSTRAINT "[^"]+" FOREIGN KEY \("rosterEntryId"\) REFERENCES "HrRosterEntry" ?\("id"\) ON DELETE SET NULL/i.test(a);
  const idxAtt = /CREATE INDEX "[^"]+" ON "HrAttendance" ?\("rosterEntryId"\)/i.test(a);
  chk("S1.3", bad13.length === 0 && fkAtt && idxAtt, "7 nullable columns · FK SET NULL · index", `bad=${bad13.join(",") || "0"} fk=${fkAtt} idx=${idxAtt}`);
  // S1.4
  const lv = addColumnDefs(a, "HrLeave");
  const bad14 = LEAVE_NEW.filter((c) => !colDefOk(lv, c) || /DEFAULT/i.test(lv.get(c[0]) ?? "")).map((c) => c[0]);
  const fkLv = /ALTER TABLE "HrLeave" ADD CONSTRAINT "[^"]+" FOREIGN KEY \("policyId"\) REFERENCES "HrLeavePolicy" ?\("id"\) ON DELETE SET NULL/i.test(a);
  const hrSch = rd("prisma/schema/hr.prisma");
  const leaveModel = block(allSchema(), "model HrLeave {");
  const noReq = !lv.has("requestedByUserId") && !/^\s*requestedByUserId\b/m.test(leaveModel);
  chk("S1.4", !!a.trim() && bad14.length === 0 && fkLv && noReq, "5 nullable columns · FK SET NULL · no requestedByUserId", `bad=${bad14.join(",") || "0"} fk=${fkLv} noRequestedByUserId=${noReq}`);
  // S1.5 (normalised SQL: lower case, no quotes)
  const U = (re: string) => new RegExp(`create unique index \\S+ on ${re}`).test(an);
  const s15 = {
    shiftName: U(`hrshift ?\\( ?systemid, ?coalesce\\( ?unitid, ?'' ?\\), ?lower\\( ?name ?\\) ?\\) where \\(?\\s*\\(?active`),
    roster: U(`hrrosterentry ?\\( ?employeeid, ?date, ?shiftid ?\\)`),
    swapOpen: U(`hrshiftswaprequest ?\\( ?fromentryid ?\\) where (?=[^;]*awaiting_peer)(?=[^;]*'pending')`),
    corrAtt: U(`hrtimecorrection ?\\( ?attendanceid ?\\) where (?=[^;]*'pending')(?=[^;]*attendanceid is not null)`),
    corrEntry: U(`hrtimecorrection ?\\( ?employeeid, ?rosterentryid, ?kind ?\\) where (?=[^;]*'pending')(?=[^;]*rosterentryid is not null)`),
    otLive: U(`hrotrequest ?\\( ?employeeid, ?startat ?\\) where (?=[^;]*'pending')(?=[^;]*'approved')`),
    policyName: U(`hrleavepolicy ?\\( ?systemid, ?coalesce\\( ?unitid, ?'' ?\\), ?lower\\( ?name ?\\) ?\\) where \\(?\\s*\\(?active`),
    holiday: U(`hrholiday ?\\( ?systemid, ?date, ?coalesce\\( ?unitid, ?'' ?\\) ?\\)`),
    balance: U(`hrleavebalancetxn ?\\( ?systemid, ?sourcekey ?\\)`),
  };
  chk("S1.5", !!an.trim() && Object.values(s15).every(Boolean), "9 uniques", an.trim() ? failedKeys(s15) : `∅ ${MIG_A}`);
  // S1.6
  const bLines = rd(MIG_B)
    .split("\n")
    .map((l) => l.replace(/--.*$/, "").trim())
    .filter(Boolean);
  const s16 = {
    exists: bLines.length > 0,
    two: bLines.length === 2,
    absent: bLines.some((l) => /^ALTER TYPE "HrAttendanceJudgement" ADD VALUE IF NOT EXISTS 'ABSENT';?$/i.test(l)),
    early: bLines.some((l) => /^ALTER TYPE "HrAttendanceJudgement" ADD VALUE IF NOT EXISTS 'EARLY_OUT';?$/i.test(l)),
    order: MIG_B_DIR > MIG_A_DIR && existsSync(join(ROOT, MIG_A)),
    aNoAddValue: !/ADD VALUE/i.test(a),
  };
  chk("S1.6", Object.values(s16).every(Boolean), "2 lines · after A · A clean", `${failedKeys(s16)} lines=${bLines.length}`);
  // S1.7 schema
  const sch = allSchema();
  const badSch: string[] = [];
  const fieldOk = (model: string, [name, kind, nullable]: Col) => {
    const re = new RegExp(`^\\s*${name}\\s+${PRISMA_TYPE(kind)}${nullable ? "\\?" : "(?!\\?)"}(\\s|$)`, "m");
    if (!re.test(model)) return false;
    const line = model.split("\n").find((l) => new RegExp(`^\\s*${name}\\s`).test(l)) ?? "";
    if (kind === "date" && !/@db\.Date\b/.test(line)) return false;
    if (kind === "dec41" && !/@db\.Decimal\(4,\s*1\)/.test(line)) return false;
    if (kind === "dec96" && !/@db\.Decimal\(9,\s*6\)/.test(line)) return false;
    return true;
  };
  for (const [t, cols] of Object.entries(TABLES)) {
    const m = block(sch, `model ${t} {`);
    if (!m) {
      badSch.push(`${t}:∅`);
      continue;
    }
    for (const c of cols) if (c[0] !== "id" && !fieldOk(m, c)) badSch.push(`${t}.${c[0]}`);
  }
  const attModel = block(sch, "model HrAttendance {");
  for (const c of ATT_NEW) if (!fieldOk(attModel, c)) badSch.push(`HrAttendance.${c[0]}`);
  for (const c of LEAVE_NEW) if (!fieldOk(leaveModel, c)) badSch.push(`HrLeave.${c[0]}`);
  const enumBody = (name: string) => block(sch, `enum ${name} {`).replace(/\/\/.*$/gm, "").replace(/\s+/g, " ").trim();
  for (const [n, vals] of Object.entries(ENUMS)) if (enumBody(n) !== `enum ${n} { ${vals.join(" ")} }`) badSch.push(`enum ${n}`);
  if (enumBody("HrAttendanceJudgement") !== `enum HrAttendanceJudgement { ${JUDGEMENT_6.join(" ")} }`) badSch.push("enum HrAttendanceJudgement");
  if (!/^\s*type\s+HrLeaveType\s/m.test(leaveModel)) badSch.push("HrLeave.type");
  const ws = block(hrSch, "model HrWorkSchedule {");
  const wsSha = createHash("sha256").update(ws).digest("hex");
  if (wsSha !== WORK_SCHEDULE_SHA) badSch.push(`HrWorkSchedule sha ${wsSha.slice(0, 12)}`);
  chk("S1.7", badSch.length === 0, "every model/field/enum · HrWorkSchedule identical", badSch.slice(0, 12).join(" ") + (badSch.length > 12 ? ` … +${badSch.length - 12}` : ""));
  // S1.8
  const cs = rd(CORE_SCOPE);
  const env = rd(HR_ENV);
  const tablesBlock = block(env, "export const HR_TABLES = {", "} as const;");
  const missScope = NEW_TABLES.filter((t) => !new RegExp(`\\b${t}:\\s*sys\\(\\)`).test(cs));
  const missEnv = NEW_TABLES.filter((t) => !new RegExp(`model:\\s*"${t}"`).test(tablesBlock));
  chk("S1.8", missScope.length === 0 && missEnv.length === 0, "8 × sys() · 8 × HR_TABLES", `scope missing=${missScope.join(",") || "0"} · hr-qc-env missing=${missEnv.join(",") || "0"}`);

  // S2.1 (static part) · S2.11 · S2.12
  const tr = rd(TIME_RULES);
  const trCode = stripComments(tr);
  const imports = [...trCode.matchAll(/from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1] ?? m[2] ?? "");
  staticNotes.trImportsBad = imports.filter((s) => /prisma|core\/db|\.\/service|tenantDb|@\/lib\/core\/db/.test(s));
  staticNotes.trExists = !!tr;
  const clockReads = [...trCode.matchAll(/Date\.now\(|new Date\(\s*\)/g)].length;
  chk("S2.11", !!tr && clockReads === 0, "0 clock reads", tr ? `clock reads=${clockReads}` : `∅ ${TIME_RULES}`);
  const st = stripComments(rd(SETTINGS));
  const s212 = { exists: !!st, imp: /import\s*\{[^}]*\bshiftWindow\b[^}]*\}\s*from\s*["']\.\/time-rules["']/.test(st), call: /\bshiftWindow\(/.test(st) };
  chk("S2.12", Object.values(s212).every(Boolean), "import + call", st ? failedKeys(s212) : `∅ ${SETTINGS}`);

  // S5.8 FREEZE + payroll.ts vs base
  const rsha = createHash("sha256").update(rd(RULES_FILE)).digest("hex");
  let base = process.env.QC_H12_BASE ?? "";
  let payDiff = "?";
  try {
    if (!base) base = execFileSync("git", ["merge-base", "HEAD", "origin/session/hr"], { cwd: ROOT, encoding: "utf8" }).trim();
    const out = execFileSync("git", ["diff", "--name-only", base, "--", PAYROLL_FILE, RULES_FILE], { cwd: ROOT, encoding: "utf8" }).trim();
    payDiff = out ? `changed: ${out.replace(/\n/g, ",")}` : "unchanged";
  } catch (e) {
    payDiff = `git: ${errText(e).slice(0, 60)}`;
  }
  chk("S5.8", rsha === RULES_SHA && payDiff === "unchanged", `${RULES_SHA.slice(0, 16)} · unchanged vs ${base.slice(0, 8)}`, `${rsha.slice(0, 16)} · ${payDiff} (base ${base.slice(0, 8) || "?"})`);

  // S6.2 privacy-shared
  const ps = rd(PRIVACY_SHARED);
  const psCode = stripComments(ps);
  const listOf = (name: string) => [...block(ps, `export const ${name} = [`, "] as const").matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]!);
  const leaveDto = block(psCode, "export type LeaveItemDto = {", "\n};");
  const leaveKeys = [...leaveDto.matchAll(/^\s*([A-Za-z]+)\??\s*:/gm)].map((m) => m[1]!);
  const h12Hits = H12_NEW_KEYS.filter((k) => new RegExp(`(^|[\\s{,])${k}\\??\\s*:|"${k}"`, "m").test(psCode));
  const s62 = {
    noH12: h12Hits.length === 0,
    sens6: srt(listOf("EMPLOYEE_SENSITIVE_FIELDS")) === srt(["nationalId", "ssoNumber", "houseRegAddress", "bankName", "bankAccountNo", "bankAccountName"]),
    leaveKeys: leaveKeys.length > 0 && leaveKeys.every((k) => ["id", "employeeName", "type", "fromDate", "toDate", "status", "reason", "filedBy"].includes(k)) && ["id", "employeeName", "type", "fromDate", "toDate", "status", "reason"].every((k) => leaveKeys.includes(k)),
  };
  chk("S6.2", Object.values(s62).every(Boolean), "no H1.2 key · 6 sensitive · leave DTO keys", `${failedKeys(s62)} hits=${h12Hits.join(",") || "0"} leaveKeys=${leaveKeys.join(",")}`);

  // S6.3 (static part — fitness result joins later)
  const fit = rd(FITNESS_HR);
  const sens = [...block(fit, "export const SENSITIVE_FIELDS = [", "] as const").matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]!);
  staticNotes.f161Missing = ["lat", "lng", "photoKey", "attachmentKey"].filter((k) => !sens.includes(k));

  // S6.4 sensitive new fields read nowhere
  const files = [
    ...listFiles("src/lib/modules/hr", (p) => /\.(ts|tsx)$/.test(p)),
    ...listFiles("src/app", (p) => /\.(ts|tsx)$/.test(p) && /\/hr\//.test(p)),
    ...listFiles("src/lib/ai", (p) => /\.(ts|tsx)$/.test(p)),
    "src/lib/outbox-consumers.ts",
  ].filter((p) => existsSync(join(ROOT, p)));
  const re64 = new RegExp(`\\b(${R7_FIELDS.join("|")})\\b`);
  const hits64 = files.filter((f) => re64.test(stripComments(rd(f))));
  chk("S6.4", files.length > 20 && hits64.length === 0, "0 files", `${hits64.join(",") || "0"} of ${files.length} files`);

  // S6.5 out-of-HR whole-row leave readers map named fields
  const tools = rd(AI_TOOLS);
  const cal = rd(CALENDAR);
  const i1 = tools.indexOf("prisma.hrLeave.findMany(");
  const seg1 = i1 >= 0 ? tools.slice(i1, tools.indexOf("\n};", i1)) : "";
  const seg2 = block(tools, "async function employeeNameForLeave(", "\n}");
  const i3 = cal.indexOf("db.hrLeave.findMany(");
  const seg3 = i3 >= 0 ? cal.slice(i3, cal.indexOf("\n  }\n", i3) > 0 ? cal.indexOf("\n  }\n", i3) : i3 + 1500) : "";
  const noSpread = (s: string, v: string) => !new RegExp(`\\.\\.\\.\\s*${v}\\b`).test(s);
  const s65 = {
    tools2084: !!seg1 && /leaves\.map\(\(l\) => \(\{/.test(seg1) && noSpread(seg1, "l") && !/JSON\.stringify\(\s*leaves\b|:\s*leaves\s*[,}]/.test(seg1),
    tools2393: !!seg2 && /return leave\?\.employee\?\.name/.test(seg2) && noSpread(seg2, "leave") && !/return leave\s*;/.test(seg2),
    calendar135: !!seg3 && /events\.push\(\{/.test(seg3) && noSpread(seg3, "l") && /title:/.test(seg3),
  };
  chk("S6.5", Object.values(s65).every(Boolean), "3 readers map named fields", failedKeys(s65));

  // S7.1 seed
  const seed = stripComments(rd(SEED_FILE));
  const s71 = {
    shift: /hrShift\b|"HrShift"/.test(seed),
    night: /crossesMidnight:\s*true/.test(seed),
    policy: /hrLeavePolicy\b|"HrLeavePolicy"/.test(seed) && rd(SEED_FILE).includes("รอเจ้าของยืนยัน"),
    holiday: /hrHoliday\b|"HrHoliday"/.test(seed) && /presetYear/.test(seed),
    noRequests: !/(hrRosterEntry|hrLeaveBalanceTxn|hrShiftSwapRequest|hrTimeCorrection|hrOtRequest)\.(create|createMany|upsert)\b|INSERT INTO "(HrRosterEntry|HrLeaveBalanceTxn|HrShiftSwapRequest|HrTimeCorrection|HrOtRequest)"/.test(seed),
  };
  chk("S7.1", Object.values(s71).every(Boolean), "shifts (night) · policies (รอเจ้าของยืนยัน) · holidays · no request rows", failedKeys(s71));

  // S7.5 static part
  const order = block(env, "export const HR_DELETE_ORDER = [", "] as const;");
  const pos = (k: string) => {
    const m = order.match(new RegExp(`"${k}"`));
    return m?.index ?? -1;
  };
  const dl = ["hrShiftSwapRequest", "hrTimeCorrection", "hrOtRequest", "hrLeaveBalanceTxn", "hrRosterEntry", "hrShift", "hrLeavePolicy", "hrHoliday"];
  const missing = dl.filter((k) => pos(k) < 0);
  const orderOk =
    missing.length === 0 &&
    ["hrShiftSwapRequest", "hrTimeCorrection", "hrOtRequest", "hrLeaveBalanceTxn"].every((c) => pos(c) < pos("hrRosterEntry")) &&
    pos("hrRosterEntry") < pos("hrShift") &&
    pos("hrLeaveBalanceTxn") < pos("hrLeavePolicy") &&
    pos("hrShift") < pos("hrEmployee") &&
    pos("hrRosterEntry") < pos("hrEmployee");
  staticNotes.deleteOrder = orderOk ? "ok" : `missing=${missing.join(",") || "0"} order=${orderOk}`;

  // X7.1 static part — our own fixture dates are ≥ 2030 outside the pure-vector block
  const self = rd("scripts/qc-hr-h1.2.mts");
  const pure = block(self, "/* PURE-VECTORS-" + "BEGIN */", "/* PURE-VECTORS-" + "END */");
  const rest = self.replace(pure, "");
  const early = [...rest.matchAll(/["'`](20[0-2]\d)-\d\d-\d\d/g)].map((m) => m[0]!.slice(1));
  staticNotes.x71 = early;
}
const staticNotes: Record<string, Any> = {};

// ═════════════════════════ SKIP guard (static — before any DB connection) ═════════════════════════
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, MIG_A_DIR)) && !existsSync(join(ROOT, TIME_RULES))) {
  skipReasons.push(`H1.2 not built: ${MIG_A_DIR} absent · ${TIME_RULES} absent`);
}
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: H1.2 not built`);
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

// ── Next request scope (technique of qc-hr-h0.3 / qc-hr-h1.1) ──
const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null)) as Any;
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  if (!nextWork?.workAsyncStorage || !nextWorkUnit?.workUnitAsyncStorage || !nextCookies?.RequestCookies) throw new Error("no Next request scope (next/dist/... not loadable)");
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": SUITE, "x-forwarded-for": "203.0.113.142" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  return nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}

const { prisma } = (await import("@/lib/core/db")) as Any;
const P = prisma as Any;
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const hr = (await import("@/lib/modules/hr/service")) as Any;
const pay = (await import("@/lib/modules/hr/payroll")) as Any;
const privacy = (await import("@/lib/modules/hr/privacy" as string)) as Any;
const digestMod = (await import("@/lib/modules/hr/payroll-digest" as string)) as Any;
const coreHash = (await import("@/lib/core/hash" as string)) as Any;
const hqcEnv = (await import("./hr-qc-env.mjs" as string)) as Any;
const loadOpt = async (file: string, spec: string) =>
  existsSync(join(ROOT, file)) ? ((await import(spec).catch((e: unknown) => ({ __err: errText(e) }))) as Any) : null;
const trMod = await loadOpt(TIME_RULES, "@/lib/modules/hr/time-rules");
const stMod = await loadOpt(SETTINGS, "@/lib/modules/hr/settings");
const saMod = await loadOpt(SETTINGS_ACTIONS, "@/lib/modules/hr/settings-actions");
const scopeMod = await loadOpt(SCOPE_FILE, "@/lib/modules/hr/scope");
const modState = (m: Any, f: string) => (m === null ? `∅ ${f}` : m.__err ? `import error ${m.__err}` : "loaded");
console.log(`[${SUITE}] modules: time-rules=${modState(trMod, TIME_RULES)} · settings=${modState(stMod, SETTINGS)} · settings-actions=${modState(saMod, SETTINGS_ACTIONS)} · hr/scope=${modState(scopeMod, SCOPE_FILE)}`);

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const SLUG = `${SLUG_PREFIX}${stamp}`;
const tenants: string[] = [];
const users: string[] = [];
const names: string[] = []; // every person / employee / unit name we create (leak checks)
const FIX_TS = new Date("2030-01-01T00:00:00Z");

// ── schema probes (raw only) ──
const colCache = new Map<string, Map<string, string>>();
/** column → format_type(…) of a table ("" map when the table does not exist) */
async function colsOf(table: string): Promise<Map<string, string>> {
  if (!colCache.has(table)) {
    const r = (await P.$queryRawUnsafe(
      `SELECT a.attname AS n, format_type(a.atttypid, a.atttypmod) AS t FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace s ON s.oid = c.relnamespace
        WHERE c.relname = $1 AND s.nspname = current_schema() AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`,
      table,
    )) as Any[];
    colCache.set(table, new Map(r.map((x) => [x.n as string, x.t as string])));
  }
  return colCache.get(table)!;
}
const tableExists = async (t: string) => (await colsOf(t)).size > 0;
let seq = 0;
const newId = (p = "r") => `qch12${p}${stamp}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** INSERT with every value cast to its column type · throws (caller maps the PG code) · missing table/column ⇒ Error ∅… */
async function rawInsert(table: string, data: Record<string, unknown>, client: Any = P): Promise<string> {
  const cols = await colsOf(table);
  if (cols.size === 0) throw new Error(`∅table ${table}`);
  const row: Record<string, unknown> = { id: newId(table.slice(2, 5).toLowerCase()), ...data };
  if (cols.has("updatedAt") && !("updatedAt" in row)) row.updatedAt = FIX_TS;
  const keys = Object.keys(row);
  const missing = keys.filter((k) => !cols.has(k));
  if (missing.length) throw new Error(`∅col ${table}.${missing.join(",")}`);
  const sql = `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(",")}) VALUES (${keys.map((k, i) => `$${i + 1}::${cols.get(k)}`).join(",")})`;
  await client.$executeRawUnsafe(sql, ...keys.map((k) => row[k]));
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
async function rawOne(table: string, id: string): Promise<Any | null | "∅table"> {
  if (!(await tableExists(table))) return "∅table";
  const r = await rawRows(`SELECT * FROM "${table}" WHERE id = $1`, id);
  return r?.[0] ?? null;
}
/** PG error code of a failed statement (23505 unique · 23001 restrict · 23503 FK · other) */
function pgCode(e: unknown): string {
  const ee = e as Any;
  let meta = "";
  try {
    meta = JSON.stringify(ee?.meta ?? {});
  } catch {
    /* ignore */
  }
  const s = [ee?.code, ee?.meta?.code, ee?.cause?.code, ee?.cause?.originalCode, e instanceof Error ? e.message : String(e), meta].join(" ");
  const m = s.match(/\b(23505|23001|23503|23502|23514|22P02|42P01|42703|42883)\b/);
  if (m) return m[1]!;
  if (/P2002|unique constraint|duplicate key/i.test(s)) return "23505";
  if (/P2003|foreign key/i.test(s)) return "23503";
  if (/∅table|∅col/.test(s)) return s.match(/∅(table|col)[^ ]*/)?.[0] ?? "∅";
  return `other:${short(s, 60)}`;
}
const tryInsert = async (table: string, data: Record<string, unknown>, client: Any = P): Promise<string> => {
  try {
    await rawInsert(table, data, client);
    return "ok";
  } catch (e) {
    return pgCode(e);
  }
};

type Who = { id: string; name: string; email: string; cookie: string; tenantId: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, boolean> };
async function mkUser(tenantId: string, tag: string, name: string, role: Who["role"], unitAccess: string[], permissions: Record<string, boolean>): Promise<Who> {
  const email = `${SLUG}-${tag}@qc.invalid`;
  const u = await P.user.create({ data: { email, name } });
  users.push(u.id);
  names.push(name);
  await P.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions, acceptedAt: new Date() } });
  const token = coreHash.randomToken(32) as string;
  const DAY = 86_400_000;
  await P.session.create({ data: { userId: u.id, tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 30 * DAY), expiresAt: new Date(Date.now() + 90 * DAY) } });
  const cookie = `shark_session=${token}; __Host-shark_session=${token}; shark_tenant=${tenantId}`;
  return { id: u.id, name, email, cookie, tenantId, role, unitAccess, permissions };
}
const vOf = (w: Who) => ({ role: w.role, unitAccess: w.unitAccess, permissions: w.permissions, userId: w.id });
let HAS_EMP_UNIT = false;
type EmpOpts = { linkedUserId?: string | null; unitId?: string | null; code?: string; startDate?: string; position?: string };
async function mkEmp(tenantId: string, systemId: string, name: string, o: EmpOpts = {}): Promise<string> {
  const e = await P.hrEmployee.create({
    data: { tenantId, systemId, name, linkedUserId: o.linkedUserId ?? null, code: o.code ?? null, position: o.position ?? null, startDate: o.startDate ? new Date(`${o.startDate}T00:00:00Z`) : null },
  });
  names.push(name);
  // H1.1 home unit — only when the column exists (today's base: absent ⇒ unit-dependent checks are RED "not built")
  if (o.unitId && HAS_EMP_UNIT) await P.$executeRawUnsafe(`UPDATE "HrEmployee" SET "unitId" = $1 WHERE id = $2`, o.unitId, e.id);
  return e.id as string;
}
async function newTenant(suffix: string, name: string): Promise<string> {
  const t = await P.tenant.create({ data: { name, slug: `${SLUG}${suffix}` } });
  tenants.push(t.id);
  return t.id as string;
}
async function newUnit(tenantId: string, name: string, slug: string): Promise<string> {
  const u = await P.businessUnit.create({ data: { tenantId, type: "SHOP", name, slug: `${SLUG}-${slug}` } });
  names.push(name);
  return u.id as string;
}
function spawnTsx(args: string[], env: Record<string, string | undefined>, timeoutMs = 240_000): Promise<{ code: number; out: string }> {
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
/** settings service call — { ok, id, text } · a missing module/function ⇒ ok false with "∅…" */
type SvcOut = { ok: boolean; id: string | null; text: string; value: unknown };
async function svc(fn: string, ...args: unknown[]): Promise<SvcOut> {
  if (typeof stMod?.[fn] !== "function") return { ok: false, id: null, text: `∅${fn} (${modState(stMod, SETTINGS)})`, value: undefined };
  try {
    const v = (await stMod[fn](...args)) as Any;
    const ok = !(v?.ok === false || v?.status === "error");
    return { ok, id: (v?.id ?? v?.row?.id ?? v?.shift?.id ?? v?.policy?.id ?? v?.holiday?.id ?? null) as string | null, text: textOf(v), value: v };
  } catch (e) {
    return { ok: false, id: null, text: e instanceof Error ? e.message : String(e), value: undefined };
  }
}
async function svcList(fn: string, ...args: unknown[]): Promise<Any[] | null> {
  if (typeof stMod?.[fn] !== "function") return null;
  try {
    const v = (await stMod[fn](...args)) as Any;
    return Array.isArray(v) ? v : Array.isArray(v?.rows) ? v.rows : null;
  } catch {
    return null;
  }
}
const scopeOf = (w: Who): Any => {
  try {
    if (typeof scopeMod?.hrScopeOf === "function") return scopeMod.hrScopeOf(vOf(w));
  } catch {
    /* fall through */
  }
  return w.role === "OWNER" || w.unitAccess.includes("*") ? { unitIds: "*" } : { unitIds: w.unitAccess };
};

const refusals: Record<string, string> = {};
let s3Writes = 0; // successful settings writes in S3 (audit count — S3.12)
const s3Pass: boolean[] = [];

// ═════════════════════════ pure S2 (time-rules) ═════════════════════════
/* PURE-VECTORS-BEGIN */
function runPure(): void {
  console.log("── [S2] time-rules vectors (pure) ──");
  const T = trMod && !trMod.__err ? trMod : null;
  const HELPERS = ["bkkDayKey", "bkkMidnight", "addDays", "shiftWindow", "paidMinutes", "overlapMinutes", "rosterDayOf", "leaveDaysBetween"];
  const missingFx = HELPERS.filter((h) => typeof T?.[h] !== "function");
  chk("S2.1", !!T && missingFx.length === 0 && (staticNotes.trImportsBad ?? []).length === 0, "8 exports · no DB import", `${modState(trMod, TIME_RULES)} · missing=${missingFx.join(",") || "0"} · badImports=${(staticNotes.trImportsBad ?? []).join(",") || "0"}`);
  const call = (fn: string, ...a: unknown[]): Any => {
    try {
      return typeof T?.[fn] === "function" ? T[fn](...a) : "∅fn";
    } catch (e) {
      return { __throw: errText(e) };
    }
  };
  const iso = (d: Any) => (d instanceof Date && Number.isFinite(d.getTime()) ? d.toISOString() : `∅(${short(d, 40)})`);
  // S2.2
  {
    const r = {
      a: call("bkkDayKey", new Date("2026-10-21T16:59:59Z")) === "2026-10-21",
      b: call("bkkDayKey", new Date("2026-10-21T17:00:00Z")) === "2026-10-22",
      leap: call("bkkDayKey", new Date("2028-02-28T17:00:00Z")) === "2028-02-29",
      yearEnd: call("bkkDayKey", new Date("2026-12-31T17:00:00Z")) === "2027-01-01",
      midnight: iso(call("bkkMidnight", "2026-10-22")) === "2026-10-21T17:00:00.000Z",
      addLeap: call("addDays", "2028-02-28", 1) === "2028-02-29",
      addNoLeap: call("addDays", "2027-02-28", 1) === "2027-03-01",
      addYear: call("addDays", "2026-12-31", 1) === "2027-01-01",
      addBack: call("addDays", "2030-03-01", -1) === "2030-02-28",
    };
    chk("S2.2", !!T && Object.values(r).every(Boolean), "9 vectors", T ? failedKeys(r) : modState(trMod, TIME_RULES));
  }
  // S2.3 — 500 instants (other zones' DST dates 2026–2030 + LCG fill)
  {
    const inst: Date[] = [];
    const nthSun = (y: number, m: number, n: number) => {
      const d = new Date(Date.UTC(y, m, 1));
      const first = (7 - d.getUTCDay()) % 7;
      return Date.UTC(y, m, 1 + first + (n - 1) * 7);
    };
    const lastSun = (y: number, m: number) => {
      const d = new Date(Date.UTC(y, m + 1, 0));
      return Date.UTC(y, m, d.getUTCDate() - d.getUTCDay());
    };
    for (let y = 2026; y <= 2030; y++) {
      for (const day of [nthSun(y, 2, 2), nthSun(y, 10, 1), lastSun(y, 2), lastSun(y, 9), nthSun(y, 3, 1), nthSun(y, 9, 1)]) {
        for (const off of [0, 5_400_000, 9_000_000, 61_199_000, 61_200_000, 86_399_000]) inst.push(new Date(day + off));
      }
    }
    let x = 0x2a5f9a3e;
    const lo = Date.UTC(2026, 0, 1);
    const span = Date.UTC(2031, 0, 1) - lo;
    while (inst.length < 500) {
      x = (Math.imul(x, 1103515245) + 12345) >>> 0;
      inst.push(new Date(lo + Math.floor((x / 0x1_0000_0000) * span / 1000) * 1000));
    }
    let bad = 0;
    let first = "";
    for (const at of inst) {
      const k = call("bkkDayKey", at);
      const ref = hr.bkkParts(at).dateStr;
      const m0 = call("bkkMidnight", k);
      const m1 = call("bkkMidnight", call("addDays", k, 1));
      const [yy, mm, dd] = String(k).split("-").map(Number);
      const exact = m0 instanceof Date && m0.getTime() === Date.UTC(yy!, mm! - 1, dd!) - 7 * 3_600_000;
      const ok = k === ref && exact && m1 instanceof Date && m1.getTime() - m0.getTime() === 86_400_000 && m0.getTime() <= at.getTime() && at.getTime() < m1.getTime();
      if (!ok) {
        bad++;
        if (!first) first = `${at.toISOString()}→${short(k, 30)} ref ${ref}`;
      }
    }
    chk("S2.3", !!T && inst.length === 500 && bad === 0, "500/500", T ? `bad=${bad}/${inst.length} ${first}` : modState(trMod, TIME_RULES));
  }
  const win = (day: string, s: Any) => call("shiftWindow", day, s);
  const DAY = { startMin: 420, endMin: 900, crossesMidnight: false };
  const NIGHT = { startMin: 1320, endMin: 360, crossesMidnight: true };
  // S2.4
  {
    const w = win("2026-11-02", DAY);
    chk("S2.4", iso(w?.start) === "2026-11-02T00:00:00.000Z" && iso(w?.end) === "2026-11-02T08:00:00.000Z", "00:00Z–08:00Z", `${iso(w?.start)}–${iso(w?.end)}`);
  }
  // S2.5
  {
    const a = win("2026-10-31", NIGHT);
    const b = win("2027-01-31", NIGHT);
    const c = win("2026-12-31", NIGHT);
    const d = win("2028-02-28", NIGHT);
    const endDay = (w: Any): string => {
      if (!(w?.end instanceof Date)) return "∅";
      return hr.bkkParts(w.end).dateStr;
    };
    const r = {
      oct: iso(a?.start) === "2026-10-31T15:00:00.000Z" && iso(a?.end) === "2026-10-31T23:00:00.000Z" && endDay(a) === "2026-11-01",
      month: endDay(b) === "2027-02-01" && iso(b?.start) === "2027-01-31T15:00:00.000Z",
      year: endDay(c) === "2027-01-01",
      leap: endDay(d) === "2028-02-29",
    };
    chk("S2.5", !!T && Object.values(r).every(Boolean), "4 overnight vectors", T ? `${failedKeys(r)} oct=${iso(a?.start)}–${iso(a?.end)}` : modState(trMod, TIME_RULES));
  }
  // S2.6
  {
    const refused = (s: Any) => {
      const w = win("2026-11-02", s);
      return w === null || w === undefined || w?.__throw !== undefined || w?.ok === false || !(w?.start instanceof Date) || !(w?.end instanceof Date);
    };
    const r = {
      equal: refused({ startMin: 600, endMin: 600, crossesMidnight: false }),
      negative: refused({ startMin: -1, endMin: 480, crossesMidnight: false }),
      startOver: refused({ startMin: 1440, endMin: 60, crossesMidnight: true }),
      endOver: refused({ startMin: 420, endMin: 1500, crossesMidnight: false }),
      flagFalse: refused({ startMin: 1320, endMin: 360, crossesMidnight: false }),
      flagTrue: refused({ startMin: 420, endMin: 900, crossesMidnight: true }),
      end1440Cross: refused({ startMin: 420, endMin: 1440, crossesMidnight: true }),
      end1440Ok: !refused({ startMin: 420, endMin: 1440, crossesMidnight: false }),
    };
    chk("S2.6", !!T && Object.values(r).every(Boolean), "7 refusals + endMin 1440 accepted", T ? failedKeys(r) : modState(trMod, TIME_RULES));
  }
  // S2.7
  {
    const r = {
      day: call("paidMinutes", { startMin: 420, endMin: 900, breakMin: 60, crossesMidnight: false }) === 420,
      zero: call("paidMinutes", { startMin: 420, endMin: 480, breakMin: 90, crossesMidnight: false }) === 0,
      night: call("paidMinutes", { startMin: 1320, endMin: 360, breakMin: 0, crossesMidnight: true }) === 480,
    };
    chk("S2.7", !!T && Object.values(r).every(Boolean), "420 · 0 · 480", T ? failedKeys(r) : modState(trMod, TIME_RULES));
  }
  // S2.8
  {
    const I = (a: string, b: string) => ({ start: new Date(a), end: new Date(b) });
    const A = I("2026-11-02T00:00:00Z", "2026-11-02T08:00:00Z");
    const N = I("2026-10-31T15:00:00Z", "2026-10-31T23:00:00Z");
    const r = {
      disjoint: call("overlapMinutes", A, I("2026-11-02T09:00:00Z", "2026-11-02T10:00:00Z")) === 0,
      touching: call("overlapMinutes", A, I("2026-11-02T08:00:00Z", "2026-11-02T09:00:00Z")) === 0,
      contained: call("overlapMinutes", A, I("2026-11-02T01:00:00Z", "2026-11-02T02:00:00Z")) === 60,
      partial: call("overlapMinutes", A, I("2026-11-02T07:00:00Z", "2026-11-02T09:00:00Z")) === 60,
      nightVsMorning: call("overlapMinutes", N, I("2026-11-01T00:00:00Z", "2026-11-01T08:00:00Z")) === 0,
      nightVsEarly: call("overlapMinutes", N, I("2026-10-31T22:00:00Z", "2026-11-01T02:00:00Z")) === 60,
    };
    chk("S2.8", !!T && Object.values(r).every(Boolean), "0 · 0 · 60 · 60 · 0 · 60", T ? failedKeys(r) : modState(trMod, TIME_RULES));
  }
  // S2.9
  {
    const wn = win("2026-10-31", NIGHT);
    const wd = win("2026-11-02", DAY);
    const windows = [
      { id: "w0", day: "2026-10-31", date: "2026-10-31", start: wn?.start, end: wn?.end },
      { id: "w1", day: "2026-11-02", date: "2026-11-02", start: wd?.start, end: wd?.end },
    ];
    const hit = call("rosterDayOf", new Date("2026-10-31T19:00:00Z"), windows);
    const miss = call("rosterDayOf", new Date("2026-11-01T07:00:00Z"), windows);
    const isW0 = (r: Any) => r === "2026-10-31" || r === "w0" || r === 0 || r?.day === "2026-10-31" || r?.date === "2026-10-31" || r?.id === "w0" || r === windows[0];
    chk("S2.9", isW0(hit) && (miss === null || miss === undefined), "10-31 · null", `02:00 BKK 11-01 → ${short(hit, 60)} · 14:00 BKK 11-01 → ${short(miss, 60)}`);
  }
  // S2.10
  {
    const none = { halfDay: null, excluded: new Set<string>() };
    const three = call("leaveDaysBetween", "2030-03-04", "2030-03-06", none);
    const half = call("leaveDaysBetween", "2030-03-04", "2030-03-04", { halfDay: "AM", excluded: new Set<string>() });
    const excl = call("leaveDaysBetween", "2030-03-04", "2030-03-06", { halfDay: null, excluded: new Set(["2030-03-05"]) });
    const rev = call("leaveDaysBetween", "2030-03-06", "2030-03-04", none);
    const refusedRev = rev === null || rev === undefined || rev?.__throw !== undefined || rev?.ok === false;
    chk("S2.10", three === "3.0" && half === "0.5" && excl === "2.0" && refusedRev, "3.0 · 0.5 · 2.0 · refusal", `${short(three, 30)} · ${short(half, 30)} · ${short(excl, 30)} · rev=${short(rev, 50)}`);
  }
}
/* PURE-VECTORS-END */

// ═════════════════════════ S5 digest helpers ═════════════════════════
const TS_KEYS = new Set(["createdAt", "updatedAt", "pinSetAt"]);
const s5Payloads: string[] = [];
function normJson(v: unknown, labels: Map<string, string>): string {
  const s = JSON.stringify(v, function (k, val) {
    if (PRIOR_WO_KEYS.has(k)) return undefined;
    if (TS_KEYS.has(k)) return val == null ? null : "<ts>";
    if (val instanceof Set) return [...val].map((x) => labels.get(String(x)) ?? String(x)).sort();
    if (typeof val === "string" && labels.has(val)) return labels.get(val);
    return val;
  });
  s5Payloads.push(s ?? "");
  return s ?? "undefined";
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

async function runDb(): Promise<void> {
  HAS_EMP_UNIT = (await colsOf("HrEmployee")).has("unitId");
  const present = await Promise.all(NEW_TABLES.map(async (t) => [t, await tableExists(t)] as const));
  console.log(`[${SUITE}] schema probe: ${present.map(([t, p]) => `${t}=${p}`).join(" ")} · HrEmployee.unitId(H1.1)=${HAS_EMP_UNIT}`);

  // ═══ S2 pure (needs only bkkParts from service) ═══
  runPure();

  // ── qc-hr-v2 snapshot (S7.6) ──
  const qcT = await hqcEnv.findQcTenant(P);
  const QC_TABLES = ["HrEmployee", "HrAttendance", "HrLeave", "HrWorkSchedule", "HrEmployeeDoc", "HrSalaryProfile", "HrPayAdjustment", "HrPayrollRun", "HrPayrollItem", ...NEW_TABLES.filter((t) => ["HrShift", "HrLeavePolicy", "HrHoliday"].includes(t)), "AuditLog", "OutboxEvent"];
  const qcSnap = async () => {
    if (!qcT) return "∅qc-hr-v2";
    const out: string[] = [];
    for (const t of QC_TABLES) out.push(`${t}=${await rawCount(t, `"tenantId" = $1`, qcT.tenantId)}`);
    return out.join(",");
  };
  const qcBefore = await qcSnap();

  // ── setup ──
  const T = await newTenant("", "QC HR H1.2 กะและการลา");
  const T2 = await newTenant("-other", "QC HR H1.2 ร้านอื่น");
  const u1 = await newUnit(T, `สาขาเหนือ ${stamp}`, "u1");
  const u2 = await newUnit(T, `สาขาใต้ ${stamp}`, "u2");
  const sA = await sysSvc.createSystem(T, "HR", "ทีมงาน A");
  await sleep(30);
  const sys2 = await sysSvc.createSystem(T, "HR", "ทีมงาน สอง");
  await sleep(30);
  const sD = await sysSvc.createSystem(T, "HR", "ทีมดิจิสต์");
  await sleep(30);
  const sM = await sysSvc.createSystem(T, "HR", "ทีมเงินเดือนรายเดือน");
  const sO = await sysSvc.createSystem(T2, "HR", "ทีมร้านอื่น");
  const ctxA = { tenantId: T, systemId: sA.id };
  const ctx2 = { tenantId: T, systemId: sys2.id };
  const ctxD = { tenantId: T, systemId: sD.id };
  const ctxO = { tenantId: T2, systemId: sO.id };
  const pathS = `/app/sys/${sA.id}/hr/settings`;
  const U = {
    owner: await mkUser(T, "owner", `QC เจ้าของ ${stamp}`, "OWNER", [], {}),
    mgrU1: await mkUser(T, "mgru1", `QC ผู้จัดการสาขาเหนือ ${stamp}`, "MANAGER", [u1], { "hr.employee.create": true }),
    mgrAll: await mkUser(T, "mgrall", `QC ผู้จัดการทุกสาขา ${stamp}`, "MANAGER", ["*"], {}),
    staffU1: await mkUser(T, "staffu1", `QC พนักงานเหนือ ${stamp}`, "STAFF", [u1], { "hr.leave.request": true }),
    payAll: await mkUser(T, "payall", `QC เงินเดือน ${stamp}`, "STAFF", ["*"], { "hr.payroll.read": true, "hr.leave.read": true }),
    hrRead: await mkUser(T, "hrread", `QC อ่านลา ${stamp}`, "STAFF", ["*"], { "hr.leave.read": true }),
    member: await mkUser(T, "member", `QC สมาชิก ${stamp}`, "STAFF", [], {}),
    other: await mkUser(T2, "other", `QC ร้านอื่น ${stamp}`, "OWNER", [], {}),
  };
  const E = {
    e1: await mkEmp(T, sA.id, `พนง-เหนือ ${stamp}`, { unitId: u1 }),
    e2: await mkEmp(T, sA.id, `พนง-ใต้ ${stamp}`, { unitId: u2 }),
    e3: await mkEmp(T, sA.id, `พนง-ไร้สาขา ${stamp}`),
    eX: await mkEmp(T2, sO.id, `พนง-ร้านอื่น ${stamp}`),
  };
  const eXBefore = JSON.stringify(await P.hrEmployee.findUnique({ where: { id: E.eX } }));

  // ═══ S1 DB catalogue ═══
  console.log("── [S1] QC4 catalogue ──");
  {
    const info = (await P.$queryRawUnsafe(
      `SELECT table_name AS t, column_name AS c, data_type AS dt, udt_name AS udt, is_nullable AS n, numeric_precision AS p, numeric_scale AS s FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
      [...NEW_TABLES, "HrAttendance", "HrLeave"],
    )) as Any[];
    const okDb = (t: string, [c, kind, nullable]: Col) => {
      const r = info.find((x) => x.t === t && x.c === c);
      if (!r || (r.n === "YES") !== nullable) return false;
      if (kind === "text") return r.dt === "text";
      if (kind === "int") return r.dt === "integer";
      if (kind === "bool") return r.dt === "boolean";
      if (kind === "date") return r.dt === "date";
      if (kind === "ts") return r.dt === "timestamp without time zone";
      if (kind === "json") return r.dt === "jsonb";
      if (kind === "dec41") return r.dt === "numeric" && Number(r.p) === 4 && Number(r.s) === 1;
      if (kind === "dec96") return r.dt === "numeric" && Number(r.p) === 9 && Number(r.s) === 6;
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
    for (const c of ATT_NEW) if (!okDb("HrAttendance", c)) bad.push(`HrAttendance.${c[0]}`);
    for (const c of LEAVE_NEW) if (!okDb("HrLeave", c)) bad.push(`HrLeave.${c[0]}`);
    chk("S1.9", bad.length === 0, "8 tables + 12 columns exact", bad.slice(0, 14).join(" ") + (bad.length > 14 ? ` … +${bad.length - 14}` : ""));
    const enumOf = async (name: string) => ((await P.$queryRawUnsafe(`SELECT e.enumlabel AS l FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = $1 ORDER BY e.enumsortorder`, name)) as Any[]).map((r) => r.l as string).join(",");
    const j = await enumOf("HrAttendanceJudgement");
    const badEnums: string[] = [];
    for (const [n, vals] of Object.entries(ENUMS)) if ((await enumOf(n)) !== vals.join(",")) badEnums.push(n);
    chk("S1.10", j === JUDGEMENT_6.join(",") && badEnums.length === 0, JUDGEMENT_6.join(","), `judgement=${j} · enums wrong/missing=${badEnums.join(",") || "0"}`);
    const has = (t: string, c: string) => info.some((x) => x.t === t && x.c === c);
    const miss = [...ATT_BASE.filter((c) => !has("HrAttendance", c)).map((c) => `HrAttendance.${c}`), ...LEAVE_BASE.filter((c) => !has("HrLeave", c)).map((c) => `HrLeave.${c}`)];
    chk("S1.11", miss.length === 0, "0 missing", miss.join(",") || "0 missing");
    const fk = (await P.$queryRawUnsafe(
      `SELECT cl.relname::text AS t, a.attname::text AS c, rf.relname::text AS ref, c.confdeltype::text AS d FROM pg_constraint c
         JOIN pg_class cl ON cl.oid = c.conrelid JOIN pg_class rf ON rf.oid = c.confrelid
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f' AND cl.relname = ANY($1::text[])`,
      [...NEW_TABLES, "HrAttendance", "HrLeave"],
    )) as Any[];
    const badFk = FKS.filter(([t, c, ref, d]) => !fk.some((r) => r.t === t && r.c === c && r.ref === ref && String(r.d) === d)).map(([t, c, , d]) => {
      const r = fk.find((x) => x.t === t && x.c === c);
      return `${t}.${c}${r ? `=${r.d}≠${d}` : ":∅"}`;
    });
    chk("S1.12", badFk.length === 0, "11 FKs as declared", badFk.join(" ") || "all");
  }

  // ═══ S5 frozen digests (before anything else writes HR rows in system D) ═══
  console.log("── [S5] frozen digests (system D) ──");
  const labels = new Map<string, string>([[T, "T"], [T2, "T2"], [sD.id, "sysD"], [sA.id, "sysA"], [u1, "u1"], [u2, "u2"], ...Object.entries(U).map(([k, w]) => [w.id, k] as [string, string])]);
  const D1 = await mkEmp(T, sD.id, "QC-H12 ดีหนึ่ง", { code: "D01", position: "แคชเชียร์", unitId: u1, linkedUserId: U.staffU1.id, startDate: "2030-01-01" });
  await sleep(15);
  const D2 = await mkEmp(T, sD.id, "QC-H12 ดีสอง", { code: "D02", position: "บาริสต้า", unitId: u1, startDate: "2030-01-02" });
  await sleep(15);
  const D3 = await mkEmp(T, sD.id, "QC-H12 ดีสาม", { code: "D03", position: "ครัว", unitId: u1 });
  labels.set(D1, "D01").set(D2, "D02").set(D3, "D03");
  const attIds: string[] = [];
  const leaveIds: string[] = [];
  let s5Error = "";
  try {
    // clocks through clock() (judgement NO_SCHEDULE — no schedule in system D), then pinned to fixed 2030 instants
    const c1 = await hr.clock(ctxD, { employeeId: D1, kind: "IN" });
    const c2 = await hr.clock(ctxD, { employeeId: D1, kind: "OUT" });
    const c3 = await hr.clock(ctxD, { employeeId: D2, kind: "IN" });
    const c4 = await hr.clock(ctxD, { employeeId: D3, kind: "IN" });
    const pin: [Any, string][] = [[c1, "2030-03-04T01:55:00Z"], [c2, "2030-03-04T10:05:00Z"], [c3, "2030-03-05T02:20:00Z"], [c4, "2030-03-04T03:00:00Z"]];
    for (const [c, at] of pin) {
      await P.hrAttendance.update({ where: { id: c.id }, data: { at: new Date(at) } });
      attIds.push(c.id);
    }
    // older-style rows with stored judgements (direct writes — the engine of 13 Aug)
    for (const [kind, at, judgement, dueMin, lateMin] of [
      ["IN", "2030-03-06T00:10:00Z", "ON_TIME", 420, 0],
      ["IN", "2030-03-07T00:40:00Z", "LATE", 420, 40],
      ["OUT", "2030-03-07T09:00:00Z", null, null, null],
    ] as [string, string, string | null, number | null, number | null][]) {
      const r = await P.hrAttendance.create({ data: { tenantId: T, systemId: sD.id, employeeId: D2, kind, at: new Date(at), note: kind === "OUT" ? "ออกตามเวลา" : null, judgement, dueMin, lateMin } });
      attIds.push(r.id);
    }
    attIds.forEach((id, i) => labels.set(id, `AT${i + 1}`));
    // leaves (all D01 — staff-u1's own rows, so H0.7's row scope cannot change S5.3) via requestLeave / decideLeave
    for (const [type, from, to, reason] of [
      ["PERSONAL", "2030-03-04", "2030-03-04", "ธุระที่บ้าน"],
      ["SICK", "2030-03-12", "2030-03-13", "ไข้หวัด"],
      ["VACATION", "2030-04-01", "2030-04-03", "พักร้อน"],
      ["OTHER", "2030-05-10", "2030-05-10", null],
    ] as [string, string, string, string | null][]) {
      const r = await hr.requestLeave(ctxD, { employeeId: D1, type, fromDate: from, toDate: to, reason });
      leaveIds.push(r.id);
      await sleep(20);
    }
    leaveIds.forEach((id, i) => labels.set(id, `LV${i + 1}`));
    await hr.decideLeave(ctxD, leaveIds[0], "APPROVED", U.owner.id);
    await hr.decideLeave(ctxD, leaveIds[2], "REJECTED", U.owner.id);
    await P.hrEmployee.update({ where: { id: D3 }, data: { active: false } });
  } catch (e) {
    s5Error = errText(e);
    console.log(`  ⚠ S5 fixture: ${s5Error}`);
  }
  const dig = async (id: string, f: () => Promise<unknown>) => {
    let d = "∅";
    try {
      d = sha(normJson(await f(), labels));
    } catch (e) {
      d = `THROW ${errText(e)}`;
    }
    const want = FROZEN_S5[id] ?? "∅";
    console.log(`  ℹ ${id} digest=${d}`);
    chk(id, !s5Error && d === want, want.slice(0, 16), `${d.slice(0, 16)}${s5Error ? ` (fixture: ${s5Error.slice(0, 60)})` : ""}`);
  };
  await dig("S5.1", () => hr.listAttendance(ctxD, 50));
  await dig("S5.2", async () => ({ list: await hr.listLeaves(ctxD, 100), pending: await hr.pendingLeaves(ctxD, 100) }));
  await dig("S5.3", async () => ({
    owner: await privacy.leaveItemsForViewer(ctxD, vOf(U.owner)),
    mgrU1: await privacy.leaveItemsForViewer(ctxD, vOf(U.mgrU1)),
    staffU1: await privacy.leaveItemsForViewer(ctxD, vOf(U.staffU1)),
  }));
  await dig("S5.4", async () => {
    const out: Record<string, unknown> = {};
    for (const [k, id] of [["D01", D1], ["D02", D2], ["D03", D3]]) out[k] = await hr.monthlyAttendance(ctxD, id, new Date("2030-03-01T00:00:00Z"));
    return out;
  });
  await dig("S5.5", async () => ({
    unavail0304: await hr.employeesUnavailable(ctxD, [D1, D2, D3], new Date("2030-03-04T05:00:00Z")),
    unavail0320: await hr.employeesUnavailable(ctxD, [D1, D2, D3], new Date("2030-03-20T05:00:00Z")),
    onLeave0304: await hr.isOnLeave(T, U.staffU1.id, new Date("2030-03-04T03:00:00Z")),
    onLeave0320: await hr.isOnLeave(T, U.staffU1.id, new Date("2030-03-20T03:00:00Z")),
    kiosk: await hr.kioskRoster(ctxD),
  }));
  // S5.6 MONTHLY fixture — verbatim from qc-hr-h1.1 S6.5
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
    console.log(`  ℹ S5.6 MONTHLY fixture computed: digest=${digest} totals=${totals} flags=${flags}`);
    chk("S5.6", digest === FROZEN_MONTHLY_DIGEST && totals === FROZEN_MONTHLY_TOTALS && flags === FROZEN_MONTHLY_FLAGS, `${FROZEN_MONTHLY_DIGEST.slice(0, 16)} · ${FROZEN_MONTHLY_TOTALS} · ${FROZEN_MONTHLY_FLAGS}`, `${digest.slice(0, 16)} · ${totals} · ${flags}`);
  }
  // S5.7 new columns null on pre-existing + new rows
  {
    let newAtt = "";
    let newLeave = "";
    try {
      newAtt = (await hr.clock(ctxD, { employeeId: D2, kind: "IN" })).id;
      newLeave = (await hr.requestLeave(ctxD, { employeeId: D1, type: "PERSONAL", fromDate: "2030-06-03", toDate: "2030-06-03", reason: "QC ใหม่" })).id;
    } catch (e) {
      console.log(`  ⚠ S5.7 new writes: ${errText(e)}`);
    }
    const attCols = await colsOf("HrAttendance");
    const lvCols = await colsOf("HrLeave");
    const missA = ATT_NEW.map((c) => c[0]).filter((c) => !attCols.has(c));
    const missL = LEAVE_NEW.map((c) => c[0]).filter((c) => !lvCols.has(c));
    let nonNull = 0;
    if (!missA.length) {
      const r = (await rawRows(`SELECT * FROM "HrAttendance" WHERE id = ANY($1::text[])`, [...attIds, newAtt].filter(Boolean))) ?? [];
      for (const row of r) for (const c of ATT_NEW) if (row[c[0]] !== null) nonNull++;
    }
    if (!missL.length) {
      const r = (await rawRows(`SELECT * FROM "HrLeave" WHERE id = ANY($1::text[])`, [...leaveIds, newLeave].filter(Boolean))) ?? [];
      for (const row of r) for (const c of LEAVE_NEW) if (row[c[0]] !== null) nonNull++;
    }
    chk("S5.7", !missA.length && !missL.length && nonNull === 0 && !!newAtt && !!newLeave, "12 columns present · 0 non-null", `missing=${[...missA.map((c) => `HrAttendance.${c}`), ...missL.map((c) => `HrLeave.${c}`)].join(",") || "0"} nonNull=${nonNull} rows=${attIds.length + 1}+${leaveIds.length + 1}`);
  }

  // ═══ S6.1 privacy matrix (system D) ═══
  console.log("── [S6] privacy ──");
  {
    const BASE_PROFILE = ["id", "name", "nickname", "code", "phone", "email", "gender", "birthDate", "maritalStatus", "position", "department", "employmentType", "startDate", "endDate", "addressLine", "subdistrict", "district", "province", "postcode", "emergencyName", "emergencyPhone", "emergencyRelation", "note", "active", "hasPin"];
    const SENS6 = ["nationalId", "ssoNumber", "houseRegAddress", "bankName", "bankAccountNo", "bankAccountName"];
    const H11_PROFILE = ["unitId", "unitName", "employmentStatus", "probationEndAt", "contractEndAt"];
    const LEAVE6 = ["id", "employeeName", "type", "fromDate", "toDate", "status"];
    // expected on 2a5f9a3e: profile null | base | base+sens · leave keys base6 | base6+reason · rows may be [] for member (H0.7 row scope)
    const M: [string, Who, Any, "null" | "base" | "sens", boolean, boolean][] = [
      ["owner", U.owner, ctxD, "sens", true, false],
      ["payroll", U.payAll, ctxD, "sens", true, false],
      ["managerU1", U.mgrU1, ctxD, "base", true, false],
      ["hrRead", U.hrRead, ctxD, "base", true, false],
      ["member", U.member, ctxD, "null", false, true],
      ["self", U.staffU1, ctxD, "null", false, false],
      ["otherTenant", U.other, { tenantId: T2, systemId: sD.id }, "null", false, true],
    ];
    const bad: string[] = [];
    for (const [tag, w, ctx, prof, reason, mayBeEmpty] of M) {
      let p: Any = null;
      let li: Any = null;
      try {
        p = await privacy.loadEmployeeProfileForViewer(ctx, vOf(w), D1);
        li = await privacy.leaveItemsForViewer(ctx, vOf(w));
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
      if (tag === "otherTenant" ? items.length !== 0 : !emptyOk && (srt(keys) !== srt(want) && !(srt([...keys].filter((k) => k !== "filedBy")) === srt(want)))) bad.push(`${tag}:leaveKeys=${srt(keys)}`);
      const h12 = [...(pk ?? []), ...keys].filter((k) => H12_NEW_KEYS.includes(k));
      if (h12.length) bad.push(`${tag}:H1.2 keys ${h12.join("+")}`);
      if ((p?.docs ?? []).length) bad.push(`${tag}:docs`);
    }
    chk("S6.1", bad.length === 0, "7 viewers as base", bad.join(" ") || "7 viewers ok");
  }

  // ═══ S3 settings CRUD + unit scope ═══
  console.log("── [S3] settings CRUD + unit scope ──");
  const rowsOf = async (table: string, where: string, ...p: unknown[]) => (await tableExists(table) ? ((await rawRows(`SELECT * FROM "${table}" WHERE ${where}`, ...p)) ?? []) : null);
  const sh = (o: Record<string, unknown>) => ({ unitId: null, code: null, breakMin: 0, graceMin: 15, crossesMidnight: false, colour: null, sortOrder: 0, ...o });
  const S: Record<string, string | null> = {};
  const w = async (label: string, fn: string, ...args: unknown[]) => {
    const r = await svc(fn, ...args);
    if (r.ok) s3Writes++;
    if (label) refusals[label] = r.ok ? "" : r.text;
    return r;
  };
  const idByName = async (table: string, name: string, systemId = sA.id) => ((await rowsOf(table, `"tenantId" = $1 AND "systemId" = $2 AND name = $3 ORDER BY "createdAt" DESC`, T, systemId, name)) ?? [])[0]?.id ?? null;
  {
    const a = await w("", "createShift", ctxA, vOf(U.owner), sh({ name: "กะเช้า", startMin: 420, endMin: 900, breakMin: 60, colour: "shift-1" }));
    const b = await w("", "createShift", ctxA, vOf(U.owner), sh({ unitId: u1, name: "กะบ่าย", startMin: 720, endMin: 1200, colour: "shift-2" }));
    const c = await w("", "createShift", ctxA, vOf(U.owner), sh({ unitId: u2, name: "กะปิด", startMin: 900, endMin: 1380, colour: "shift-3" }));
    S.shop = a.id ?? (await idByName("HrShift", "กะเช้า"));
    S.u1 = b.id ?? (await idByName("HrShift", "กะบ่าย"));
    S.u2 = c.id ?? (await idByName("HrShift", "กะปิด"));
    const rows = (await rowsOf("HrShift", `"tenantId" = $1 AND "systemId" = $2`, T, sA.id)) ?? [];
    const by = (id: string | null) => rows.find((r) => r.id === id);
    const r = {
      ok: a.ok && b.ok && c.ok,
      shop: by(S.shop)?.unitId === null && by(S.shop)?.startMin === 420 && by(S.shop)?.endMin === 900 && by(S.shop)?.breakMin === 60 && by(S.shop)?.colour === "shift-1",
      u1: by(S.u1)?.unitId === u1 && by(S.u1)?.startMin === 720,
      u2: by(S.u2)?.unitId === u2 && by(S.u2)?.endMin === 1380,
    };
    s3Pass.push(chk("S3.1", Object.values(r).every(Boolean), "3 rows as given", `${failedKeys(r)} ${a.ok ? "" : `(${short(a.text, 60)})`}`));
  }
  {
    const n = await w("", "createShift", ctxA, vOf(U.owner), sh({ name: "กะดึก", startMin: 1320, endMin: 360, crossesMidnight: true, colour: "shift-4" }));
    S.night = n.id ?? (await idByName("HrShift", "กะดึก"));
    const nr = S.night ? await rawOne("HrShift", S.night) : null;
    const eq = await w("S3.2.equal", "createShift", ctxA, vOf(U.owner), sh({ name: "กะเท่ากัน", startMin: 600, endMin: 600 }));
    const mis = await w("S3.2.flag", "createShift", ctxA, vOf(U.owner), sh({ name: "กะธงผิด", startMin: 1320, endMin: 360, crossesMidnight: false }));
    const n0 = (await rawCount("HrShift", `"tenantId" = $1 AND name IN ('กะเท่ากัน','กะธงผิด')`, T));
    s3Pass.push(chk("S3.2", n.ok && (nr as Any)?.crossesMidnight === true && !eq.ok && eq.text === T_SHIFT_EQUAL && !mis.ok && isThai(mis.text) && n0 === 0, `night stored · "${T_SHIFT_EQUAL}" · flag refused · 0 rows`, `night=${n.ok ? (nr as Any)?.crossesMidnight : short(n.text, 50)} equal="${short(eq.text, 50)}" flag="${short(mis.text, 40)}" rows=${n0}`));
  }
  {
    const l = await svcList("listShifts", ctxA, { scope: scopeOf(U.mgrU1) });
    const ids = (l ?? []).map((r: Any) => r.id as string);
    const must = [S.shop, S.u1, S.night].filter(Boolean) as string[];
    s3Pass.push(chk("S3.3", !!l && must.length === 3 && must.every((x) => ids.includes(x)) && !!S.u2 && !ids.includes(S.u2), "shop-wide + u1 + night · no u2", l ? `n=${ids.length} hasU2=${S.u2 ? ids.includes(S.u2) : "?"} missing=${must.filter((x) => !ids.includes(x)).length}` : "∅listShifts"));
  }
  {
    const a = await w("S3.4.u2", "createShift", ctxA, vOf(U.mgrU1), sh({ unitId: u2, name: "กะผู้จัดการใต้", startMin: 480, endMin: 960 }));
    const b = await w("S3.4.shop", "createShift", ctxA, vOf(U.mgrU1), sh({ name: "กะผู้จัดการทั้งร้าน", startMin: 480, endMin: 960 }));
    const c = await w("", "createShift", ctxA, vOf(U.mgrU1), sh({ unitId: u1, name: "กะผู้จัดการเหนือ", startMin: 480, endMin: 960 }));
    const n0 = await rawCount("HrShift", `"tenantId" = $1 AND name IN ('กะผู้จัดการใต้','กะผู้จัดการทั้งร้าน')`, T);
    const n1 = await rawCount("HrShift", `"tenantId" = $1 AND name = 'กะผู้จัดการเหนือ' AND "unitId" = $2`, T, u1);
    s3Pass.push(chk("S3.4", !a.ok && a.text === T_OTHER_UNIT && !b.ok && isThai(b.text) && n0 === 0 && c.ok && n1 === 1, `"${T_OTHER_UNIT}" · refused · 0 · u1 ok`, `u2="${short(a.text, 50)}" shop="${short(b.text, 40)}" rows=${n0} u1=${c.ok ? n1 : short(c.text, 40)}`));
  }
  {
    let entry = "";
    let entryErr = "";
    try {
      entry = await rawInsert("HrRosterEntry", { tenantId: T, systemId: sA.id, employeeId: E.e1, date: "2031-03-02", shiftId: S.u1, unitId: u1, startMin: 720, endMin: 1200, breakMin: 0, crossesMidnight: false });
    } catch (e) {
      entryErr = pgCode(e);
    }
    const ar = S.u1 ? await w("", "archiveShift", ctxA, vOf(U.owner), S.u1) : ({ ok: false, text: "∅shift" } as SvcOut);
    const row = S.u1 ? ((await rawOne("HrShift", S.u1)) as Any) : null;
    const ent = entry ? ((await rawOne("HrRosterEntry", entry)) as Any) : null;
    let del = "∅";
    if (S.u1 && (await tableExists("HrShift"))) {
      try {
        await P.$transaction(async (tx: Any) => {
          await tx.$executeRawUnsafe(`DELETE FROM "HrShift" WHERE id = $1`, S.u1);
          throw new Error("QC_ROLLBACK");
        });
      } catch (e) {
        del = /QC_ROLLBACK/.test(String((e as Error)?.message)) ? "deleted(rolled back)" : pgCode(e);
      }
    }
    s3Pass.push(chk("S3.5", ar.ok && row?.active === false && ent?.shiftId === S.u1 && del === "23001", "archived · entry intact · 23001", `archive=${ar.ok ? "ok" : short(ar.text, 40)} active=${row?.active} entry=${entry ? (ent?.shiftId === S.u1 ? "intact" : "CHANGED") : entryErr} delete=${del}`));
  }
  {
    const d1 = await w("S3.6.dup", "createShift", ctxA, vOf(U.owner), sh({ name: "กะเช้า", startMin: 480, endMin: 960 }));
    const l0 = await w("", "createShift", ctxA, vOf(U.owner), sh({ unitId: u1, name: "Morning", startMin: 480, endMin: 960 }));
    const l1 = await w("S3.6.case", "createShift", ctxA, vOf(U.owner), sh({ unitId: u1, name: "morning", startMin: 480, endMin: 960 }));
    const other = await w("", "createShift", ctxA, vOf(U.owner), sh({ unitId: u2, name: "Morning", startMin: 480, endMin: 960 }));
    const again = await w("", "createShift", ctxA, vOf(U.owner), sh({ unitId: u1, name: "กะบ่าย", startMin: 720, endMin: 1200 })); // S.u1 archived in S3.5
    s3Pass.push(chk("S3.6", !d1.ok && d1.text === T_SHIFT_DUP && l0.ok && !l1.ok && l1.text === T_SHIFT_DUP && other.ok && again.ok, `dup/case "${T_SHIFT_DUP}" · other unit ok · after archive ok`, `dup="${short(d1.text, 40)}" case="${short(l1.text, 40)}" otherUnit=${other.ok} afterArchive=${again.ok ? "ok" : short(again.text, 40)}`));
  }
  const pol = (o: Record<string, unknown>) => ({ unitId: null, category: "PERSONAL", paid: true, quotaDays: null, ...o });
  {
    const bad = await w("S3.7.cat", "createLeavePolicy", ctxA, vOf(U.owner), pol({ name: "ลาแปลก", category: "ANNUAL" }));
    const ok65 = await w("", "createLeavePolicy", ctxA, vOf(U.owner), pol({ name: "ลาพักร้อน", category: "VACATION", quotaDays: 6.5, carryMaxDays: 6 }));
    const r625 = await w("S3.7.step", "createLeavePolicy", ctxA, vOf(U.owner), pol({ name: "ลาเศษ", category: "VACATION", quotaDays: 6.25 }));
    const carry = await w("S3.7.carry", "createLeavePolicy", ctxA, vOf(U.owner), pol({ name: "ลาสะสมเกิน", category: "VACATION", quotaDays: 6, carryMaxDays: 7 }));
    const dup = await w("S3.7.dup", "createLeavePolicy", ctxA, vOf(U.owner), pol({ name: "ลาพักร้อน", category: "VACATION", quotaDays: 6 }));
    const q = ok65.ok ? (((await rowsOf("HrLeavePolicy", `"tenantId" = $1 AND name = 'ลาพักร้อน'`, T)) ?? [])[0] as Any) : null;
    const n0 = await rawCount("HrLeavePolicy", `"tenantId" = $1 AND name IN ('ลาแปลก','ลาเศษ','ลาสะสมเกิน')`, T);
    s3Pass.push(chk("S3.7", !bad.ok && ok65.ok && String(q?.quotaDays) === "6.5" && !r625.ok && !carry.ok && !dup.ok && dup.text === T_POLICY_DUP && n0 === 0, `bad cat refused · 6.5 stored · 6.25 / carry refused · "${T_POLICY_DUP}" · 0 rows`, `cat=${bad.ok ? "ACCEPTED" : "refused"} 6.5=${ok65.ok ? String(q?.quotaDays) : short(ok65.text, 30)} 6.25=${r625.ok ? "ACCEPTED" : "refused"} carry=${carry.ok ? "ACCEPTED" : "refused"} dup="${short(dup.text, 40)}" rows=${n0}`));
  }
  {
    const P1 = await w("", "createLeavePolicy", ctxA, vOf(U.owner), pol({ name: "ลากิจทั้งร้าน", quotaDays: 3 }));
    const P2 = await w("", "createLeavePolicy", ctxA, vOf(U.owner), pol({ unitId: u1, name: "ลากิจเหนือ", quotaDays: 3 }));
    const P3 = await w("", "createLeavePolicy", ctxA, vOf(U.owner), pol({ unitId: u2, name: "ลากิจใต้", quotaDays: 3 }));
    S.pShop = P1.id ?? (await idByName("HrLeavePolicy", "ลากิจทั้งร้าน"));
    S.pU1 = P2.id ?? (await idByName("HrLeavePolicy", "ลากิจเหนือ"));
    S.pU2 = P3.id ?? (await idByName("HrLeavePolicy", "ลากิจใต้"));
    const l = await svcList("listLeavePolicies", ctxA, { scope: scopeOf(U.mgrU1) });
    const ids = (l ?? []).map((r: Any) => r.id as string);
    const a = await w("S3.8.u2", "createLeavePolicy", ctxA, vOf(U.mgrU1), pol({ unitId: u2, name: "ลาผู้จัดการใต้" }));
    const b = await w("S3.8.shop", "createLeavePolicy", ctxA, vOf(U.mgrU1), pol({ name: "ลาผู้จัดการทั้งร้าน" }));
    const c = await w("", "createLeavePolicy", ctxA, vOf(U.mgrU1), pol({ unitId: u1, name: "ลาผู้จัดการเหนือ" }));
    const n0 = await rawCount("HrLeavePolicy", `"tenantId" = $1 AND name IN ('ลาผู้จัดการใต้','ลาผู้จัดการทั้งร้าน')`, T);
    const listOk = !!l && !!S.pShop && !!S.pU1 && !!S.pU2 && ids.includes(S.pShop) && ids.includes(S.pU1) && !ids.includes(S.pU2);
    s3Pass.push(chk("S3.8", P1.ok && P2.ok && P3.ok && listOk && !a.ok && a.text === T_OTHER_UNIT && !b.ok && isThai(b.text) && n0 === 0 && c.ok, "list shop+u1 · u2 text · shop refused · u1 ok", `owner=${[P1.ok, P2.ok, P3.ok].join("/")} list=${l ? (listOk ? "ok" : `n=${ids.length}`) : "∅"} u2="${short(a.text, 40)}" shop=${b.ok ? "ACCEPTED" : "refused"} rows=${n0} u1=${c.ok}`));
  }
  const hol = (o: Record<string, unknown>) => ({ unitId: null, kind: "PUBLIC", presetYear: null, shopOpen: false, note: null, ...o });
  {
    const a = await w("", "upsertHoliday", ctxA, vOf(U.owner), hol({ date: "2031-04-13", name: "สงกรานต์" }));
    const b = await w("", "upsertHoliday", ctxA, vOf(U.owner), hol({ unitId: u1, date: "2031-04-13", name: "สงกรานต์ สาขาเหนือเปิด", kind: "SHOP", shopOpen: true }));
    const dup = await w("S3.9.dup", "upsertHoliday", ctxA, vOf(U.owner), hol({ date: "2031-04-13", name: "สงกรานต์ซ้ำ" }));
    const u2h = await w("", "upsertHoliday", ctxA, vOf(U.owner), hol({ unitId: u2, date: "2031-05-01", name: "วันแรงงาน ใต้", kind: "SHOP" }));
    const mg = await w("S3.9.mgr", "upsertHoliday", ctxA, vOf(U.mgrU1), hol({ unitId: u2, date: "2031-05-02", name: "ผู้จัดการใส่ใต้", kind: "SHOP" }));
    S.hU2 = u2h.id ?? (await idByName("HrHoliday", "วันแรงงาน ใต้"));
    const n = await rawCount("HrHoliday", `"tenantId" = $1 AND date = '2031-04-13'::date`, T);
    const nm = await rawCount("HrHoliday", `"tenantId" = $1 AND name = 'ผู้จัดการใส่ใต้'`, T);
    s3Pass.push(chk("S3.9", a.ok && b.ok && n === 2 && !dup.ok && dup.text === T_HOLIDAY_DUP && u2h.ok && !mg.ok && mg.text === T_OTHER_UNIT && nm === 0, `2 rows · "${T_HOLIDAY_DUP}" · manager-u1 u2 "${T_OTHER_UNIT}"`, `shop=${a.ok} u1=${b.ok} rows=${n} dup="${short(dup.text, 40)}" mgrU2="${short(mg.text, 40)}" (${nm})`));
  }
  {
    for (const [date, name] of [["2030-12-31", "สิ้นปี 2030"], ["2031-01-01", "ปีใหม่ 2031"], ["2031-12-31", "สิ้นปี 2031"], ["2032-01-01", "ปีใหม่ 2032"]]) await w("", "upsertHoliday", ctxA, vOf(U.owner), hol({ date, name }));
    const l = await svcList("listHolidays", ctxA, { year: 2031, scope: scopeOf(U.owner) });
    const ds = (l ?? []).map((r: Any) => (r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10)));
    const delId = await idByName("HrHoliday", "ปีใหม่ 2032");
    const del = delId ? await w("", "deleteHoliday", ctxA, vOf(U.owner), delId) : ({ ok: false, text: "∅row" } as SvcOut);
    const gone = delId ? await rawCount("HrHoliday", `id = $1`, delId) : -1;
    s3Pass.push(chk("S3.10", !!l && ds.includes("2031-01-01") && ds.includes("2031-12-31") && !ds.includes("2030-12-31") && !ds.includes("2032-01-01") && del.ok && gone === 0, "01-01 + 12-31 in · neighbours out · delete hard", l ? `dates=${[...new Set(ds)].sort().join(",")} delete=${del.ok ? gone : short(del.text, 40)}` : "∅listHolidays"));
  }
  {
    const act = async (who: Who, name: string) => inAct(who, pathS, () => (typeof saMod?.createShiftAction === "function" ? saMod.createShiftAction(fd({ systemId: sA.id, unitId: u1, name, startMin: "480", endMin: "960", start: "08:00", end: "16:00", breakMin: "60", graceMin: "15", colour: "shift-2" })) : Promise.reject(new Error(`∅createShiftAction (${modState(saMod, SETTINGS_ACTIONS)})`))));
    const m = await act(U.member, "กะสมาชิก");
    const s = await act(U.staffU1, "กะพนักงาน");
    const o = await act(U.owner, "กะเจ้าของผ่านฟอร์ม");
    if (okOut(o)) s3Writes++;
    const n0 = await rawCount("HrShift", `"tenantId" = $1 AND name IN ('กะสมาชิก','กะพนักงาน')`, T);
    const n1 = await rawCount("HrShift", `"tenantId" = $1 AND name = 'กะเจ้าของผ่านฟอร์ม'`, T);
    refusals["S3.11.member"] = m.text;
    refusals["S3.11.staff"] = s.text;
    const clean = (x: Out) => !okOut(x) && isThai(x.text) && !names.some((n) => x.text.includes(n)) && ![u1, u2, T, sA.id].some((id) => x.text.includes(id));
    s3Pass.push(chk("S3.11", typeof saMod?.createShiftAction === "function" && clean(m) && clean(s) && n0 === 0 && okOut(o) && n1 === 1, "refused ×2 (Thai, clean) · 0 rows · owner row", `member="${short(m.text, 40)}" staff="${short(s.text, 40)}" rows=${n0} owner=${okOut(o) ? n1 : short(o.text, 50)}`));
  }
  {
    const rows = (await rawRows(`SELECT action, before::text AS b, after::text AS a FROM "AuditLog" WHERE "tenantId" = $1 AND action LIKE 'hr.settings.%'`, T)) ?? [];
    const shapeOk = rows.every((r) => /^hr\.settings\.[A-Za-z-]+\.[A-Za-z]+$/.test(r.action));
    const settingNames = ["กะเช้า", "กะบ่าย", "กะปิด", "กะดึก", "Morning", "ลาพักร้อน", "ลากิจทั้งร้าน", "ลากิจเหนือ", "ลากิจใต้", "สงกรานต์", "วันแรงงาน", "ปีใหม่", "สิ้นปี", "กะผู้จัดการเหนือ", "ลาผู้จัดการเหนือ", "กะเจ้าของผ่านฟอร์ม"];
    const leaky = rows.filter((r) => settingNames.some((n) => `${r.b ?? ""}${r.a ?? ""}`.includes(n)) || names.some((n) => `${r.b ?? ""}${r.a ?? ""}`.includes(n)));
    s3Pass.push(chk("S3.12", s3Writes > 0 && rows.length === s3Writes && shapeOk && leaky.length === 0, `${s3Writes} rows · hr.settings.<entity>.<op> · ids only`, `audit=${rows.length} writes=${s3Writes} shape=${shapeOk} leaky=${leaky.length} actions=${[...new Set(rows.map((r) => r.action))].join(",") || "∅"}`));
  }

  // ═══ S6.6 settings DTOs carry no employee data ═══
  {
    const ls = [await svcList("listShifts", ctxA, { scope: scopeOf(U.owner) }), await svcList("listLeavePolicies", ctxA, { scope: scopeOf(U.owner) }), await svcList("listHolidays", ctxA, { year: 2031, scope: scopeOf(U.owner) })];
    const json = JSON.stringify(ls);
    const keys = new Set(ls.flatMap((l) => (l ?? []).flatMap((r: Any) => Object.keys(r))));
    const bad = [...keys].filter((k) => /employee|linkedUser|pin|salary/i.test(k));
    const empNames = names.filter((n) => n.startsWith("พนง") || n.startsWith("QC-H12"));
    const leak = empNames.filter((n) => json.includes(n));
    chk("S6.6", ls.every((l) => Array.isArray(l) && l.length > 0) && bad.length === 0 && leak.length === 0, "3 lists · no employee keys / names", `lists=${ls.map((l) => (Array.isArray(l) ? l.length : "∅")).join("/")} badKeys=${bad.join(",") || "0"} names=${leak.length}`);
  }

  // ═══ S4 uniques under race ═══
  console.log("── [S4] uniques under race (10-way × 3) ──");
  const race = async (n: number, f: (i: number) => Promise<string>) => Promise.all(Array.from({ length: n }, (_, i) => f(i)));
  const tally = (rs: string[]) => {
    const m: Record<string, number> = {};
    for (const r of rs) m[r] = (m[r] ?? 0) + 1;
    return m;
  };
  const RACE_TS = (d: string, h: number) => new Date(`${d}T${String(h).padStart(2, "0")}:00:00Z`);
  let raceShift = "";
  let racePolicy = "";
  try {
    raceShift = await rawInsert("HrShift", { tenantId: T, systemId: sA.id, name: "กะแข่ง", startMin: 420, endMin: 900 });
    racePolicy = await rawInsert("HrLeavePolicy", { tenantId: T, systemId: sA.id, category: "VACATION", name: "นโยบายแข่ง" });
  } catch (e) {
    console.log(`  ⚠ race fixtures: ${pgCode(e)}`);
  }
  const rounds = async (id: string, mk: (round: number) => Promise<{ rs: string[]; rows: number }>, expectLoser = "23505") => {
    const out: string[] = [];
    let ok = true;
    for (let r = 0; r < 3; r++) {
      const { rs, rows } = await mk(r);
      const t = tally(rs);
      const good = (t.ok ?? 0) === 1 && (t[expectLoser] ?? 0) === 9 && rows === 1;
      if (!good) ok = false;
      out.push(`r${r + 1}:${short(t, 60)}/rows=${rows}`);
    }
    return { ok, detail: out.join(" ") };
  };
  {
    const r = await rounds("S4.1", async (k) => {
      const date = `2031-07-0${k + 1}`;
      const rs = await race(10, () => tryInsert("HrRosterEntry", { tenantId: T, systemId: sA.id, employeeId: E.e2, date, shiftId: raceShift, startMin: 420, endMin: 900, breakMin: 0, crossesMidnight: false }));
      return { rs, rows: await rawCount("HrRosterEntry", `"employeeId" = $1 AND date = $2::date`, E.e2, date) };
    });
    chk("S4.1", !!raceShift && r.ok, "1 ok + 9 × 23505 ×3", raceShift ? r.detail : "∅ HrShift fixture");
  }
  {
    const r = await rounds("S4.2", async (k) => {
      const date = `2031-08-0${k + 1}`;
      const rs = await race(10, (i) => tryInsert("HrHoliday", { tenantId: T, systemId: sA.id, unitId: null, date, name: `วันหยุดแข่ง ${k}-${i}`, kind: "PUBLIC" }));
      return { rs, rows: await rawCount("HrHoliday", `"systemId" = $1 AND date = $2::date AND "unitId" IS NULL`, sA.id, date) };
    });
    chk("S4.2", r.ok, "1 per round", r.detail);
  }
  for (const [id, fn, table, text, mk] of [
    ["S4.3", "createShift", "HrShift", T_SHIFT_DUP, (n: string) => sh({ unitId: u1, name: n, startMin: 420, endMin: 900 })],
    ["S4.4", "createLeavePolicy", "HrLeavePolicy", T_POLICY_DUP, (n: string) => pol({ unitId: u1, name: n, quotaDays: 3 })],
  ] as [string, string, string, string, (n: string) => Any][]) {
    const out: string[] = [];
    let ok = typeof stMod?.[fn] === "function";
    for (let k = 0; k < 3; k++) {
      const nm = `${id === "S4.3" ? "กะชิง" : "ลาชิง"} ${k}`;
      const rs = await race(10, () => svc(fn, ctxA, vOf(U.owner), mk(nm)));
      const rows = await rawCount(table, `"tenantId" = $1 AND name = $2`, T, nm);
      const losers = rs.filter((x) => !x.ok);
      const good = rs.filter((x) => x.ok).length === 1 && rows === 1 && losers.length === 9 && losers.every((x) => x.text === text);
      if (!good) ok = false;
      out.push(`r${k + 1}:ok=${rs.filter((x) => x.ok).length}/rows=${rows}/texts=${short(srt(new Set(losers.map((x) => x.text.slice(0, 30)))), 60)}`);
    }
    chk(id, ok, `1 row · 9 × "${text}" ×3`, out.join(" "));
  }
  {
    const r = await rounds("S4.5", async (k) => {
      const key = `grant:${E.e1}:${racePolicy}:2031-r${k}`;
      const rs = await race(10, () => tryInsert("HrLeaveBalanceTxn", { tenantId: T, systemId: sA.id, employeeId: E.e1, policyId: racePolicy, kind: "GRANT", days: 6, leaveYear: 2031, effectiveDate: "2031-01-01", sourceKey: key }));
      return { rs, rows: await rawCount("HrLeaveBalanceTxn", `"systemId" = $1 AND "sourceKey" = $2`, sA.id, key) };
    });
    chk("S4.5", !!racePolicy && r.ok, "1 per round", racePolicy ? r.detail : "∅ HrLeavePolicy fixture");
  }
  {
    const entries: string[] = [];
    for (let k = 0; k < 3; k++) {
      try {
        entries.push(await rawInsert("HrRosterEntry", { tenantId: T, systemId: sA.id, employeeId: E.e1, date: `2031-09-0${k + 1}`, shiftId: raceShift, startMin: 420, endMin: 900, breakMin: 0, crossesMidnight: false }));
      } catch {
        /* table absent on the base */
      }
    }
    const r = await rounds("S4.6", async (k) => {
      const rs = await race(10, () => tryInsert("HrShiftSwapRequest", { tenantId: T, systemId: sA.id, requesterEmployeeId: E.e1, fromEntryId: entries[k] ?? "∅", reason: "ติดธุระ" }));
      return { rs, rows: await rawCount("HrShiftSwapRequest", `"fromEntryId" = $1`, entries[k] ?? "∅") };
    });
    let reopen = "∅";
    if (entries[0]) {
      await rawRows(`UPDATE "HrShiftSwapRequest" SET status = 'CANCELLED' WHERE "fromEntryId" = $1 RETURNING id`, entries[0]);
      reopen = await tryInsert("HrShiftSwapRequest", { tenantId: T, systemId: sA.id, requesterEmployeeId: E.e1, fromEntryId: entries[0], reason: "ขอใหม่" });
    }
    chk("S4.6", entries.length === 3 && r.ok && reopen === "ok", "1 per round · reopen ok", `${r.detail} reopen=${reopen}`);
  }
  {
    const r = await rounds("S4.7", async (k) => {
      const startAt = RACE_TS(`2031-10-0${k + 1}`, 11);
      const rs = await race(10, () => tryInsert("HrOtRequest", { tenantId: T, systemId: sA.id, employeeId: E.e1, date: `2031-10-0${k + 1}`, startAt, endAt: RACE_TS(`2031-10-0${k + 1}`, 12), minutes: 60, timing: "AFTER" }));
      return { rs, rows: await rawCount("HrOtRequest", `"employeeId" = $1 AND "startAt" = $2::timestamp(3)`, E.e1, startAt) };
    });
    let again = "∅";
    if (await tableExists("HrOtRequest")) {
      const startAt = RACE_TS("2031-10-01", 11);
      await rawRows(`UPDATE "HrOtRequest" SET status = 'REJECTED' WHERE "employeeId" = $1 AND "startAt" = $2::timestamp(3) RETURNING id`, E.e1, startAt);
      again = await tryInsert("HrOtRequest", { tenantId: T, systemId: sA.id, employeeId: E.e1, date: "2031-10-01", startAt, endAt: RACE_TS("2031-10-01", 12), minutes: 60, timing: "AFTER" });
    }
    chk("S4.7", r.ok && again === "ok", "1 per round · after REJECTED ok", `${r.detail} again=${again}`);
  }
  {
    const atts: string[] = [];
    for (let k = 0; k < 3; k++) atts.push((await P.hrAttendance.create({ data: { tenantId: T, systemId: sA.id, employeeId: E.e1, kind: "IN", at: RACE_TS(`2031-11-0${k + 1}`, 2) } })).id);
    const r = await rounds("S4.8", async (k) => {
      const rs = await race(10, () => tryInsert("HrTimeCorrection", { tenantId: T, systemId: sA.id, employeeId: E.e1, attendanceId: atts[k], kind: "IN", proposedAt: RACE_TS(`2031-11-0${k + 1}`, 1), originalAt: RACE_TS(`2031-11-0${k + 1}`, 2), reason: "กดผิดเวลา" }));
      return { rs, rows: await rawCount("HrTimeCorrection", `"attendanceId" = $1`, atts[k]) };
    });
    chk("S4.8", r.ok, "1 per round", r.detail);
  }

  // ═══ X1 idempotency ═══
  {
    const key = `use:${stamp}:X1`;
    const a = racePolicy ? await tryInsert("HrLeaveBalanceTxn", { tenantId: T, systemId: sA.id, employeeId: E.e1, policyId: racePolicy, kind: "USE", days: -1, leaveYear: 2031, effectiveDate: "2031-03-03", sourceKey: key }) : "∅policy";
    const b = racePolicy ? await tryInsert("HrLeaveBalanceTxn", { tenantId: T, systemId: sA.id, employeeId: E.e1, policyId: racePolicy, kind: "USE", days: -1, leaveYear: 2031, effectiveDate: "2031-03-03", sourceKey: key }) : "∅policy";
    const n = await rawCount("HrLeaveBalanceTxn", `"systemId" = $1 AND "sourceKey" = $2`, sA.id, key);
    chk("X1.1", a === "ok" && b === "23505" && n === 1, "ok · 23505 · 1 row", `${a} · ${b} · rows=${n}`);
  }

  // ═══ X2 isolation ═══
  console.log("── [X] isolation · matrix · fitness ──");
  {
    const ids: Record<string, string> = {};
    try {
      ids.shift = await rawInsert("HrShift", { tenantId: T2, systemId: sO.id, name: "กะร้านอื่น", startMin: 420, endMin: 900 });
      ids.policy = await rawInsert("HrLeavePolicy", { tenantId: T2, systemId: sO.id, category: "SICK", name: "ลาป่วยร้านอื่น" });
      ids.holiday = await rawInsert("HrHoliday", { tenantId: T2, systemId: sO.id, date: "2031-06-01", name: "วันหยุดร้านอื่น", kind: "SHOP" });
    } catch (e) {
      ids.err = pgCode(e);
    }
    const snap = async () => JSON.stringify([await rawOne("HrShift", ids.shift ?? "∅"), await rawOne("HrLeavePolicy", ids.policy ?? "∅"), await rawOne("HrHoliday", ids.holiday ?? "∅")]);
    const before = await snap();
    const r = [
      await svc("updateShift", ctxA, vOf(U.owner), ids.shift ?? "∅", { name: "แก้ข้ามร้าน" }),
      await svc("archiveShift", ctxA, vOf(U.owner), ids.shift ?? "∅"),
      await svc("updateLeavePolicy", ctxA, vOf(U.owner), ids.policy ?? "∅", { name: "แก้ข้ามร้าน" }),
      await svc("archiveLeavePolicy", ctxA, vOf(U.owner), ids.policy ?? "∅"),
      await svc("upsertHoliday", ctxA, vOf(U.owner), { id: ids.holiday ?? "∅", unitId: null, date: "2031-06-02", name: "แก้ข้ามร้าน", kind: "SHOP" }),
      await svc("deleteHoliday", ctxA, vOf(U.owner), ids.holiday ?? "∅"),
    ];
    const after = await snap();
    const lists = [await svcList("listShifts", ctxA, { scope: scopeOf(U.owner) }), await svcList("listLeavePolicies", ctxA, { scope: scopeOf(U.owner) }), await svcList("listHolidays", ctxA, { year: 2031, scope: scopeOf(U.owner) })];
    const seen = lists.flatMap((l) => (l ?? []).map((x: Any) => x.id)).filter((x) => Object.values(ids).includes(x));
    chk("X2.1", !ids.err && typeof stMod?.updateShift === "function" && r.every((x) => !x.ok) && before === after && lists.every(Array.isArray) && seen.length === 0, "6 refusals · unchanged · never listed", `${ids.err ? `fixture ${ids.err} · ` : ""}refused=${r.filter((x) => !x.ok).length}/6 (${short(r[0]!.text, 30)}) unchanged=${before === after} listed=${seen.length}`);
  }
  {
    let s2 = "";
    try {
      s2 = await rawInsert("HrShift", { tenantId: T, systemId: sys2.id, name: "กะระบบสอง", startMin: 420, endMin: 900 });
    } catch (e) {
      s2 = "";
      console.log(`  ⚠ X2.2 fixture: ${pgCode(e)}`);
    }
    const before = JSON.stringify(await rawOne("HrShift", s2 || "∅"));
    const a = await svc("archiveShift", ctxA, vOf(U.owner), s2 || "∅");
    const b = await svc("updateShift", ctxA, vOf(U.owner), s2 || "∅", { name: "แก้ข้ามระบบ" });
    const after = JSON.stringify(await rawOne("HrShift", s2 || "∅"));
    const l = await svcList("listShifts", ctxA, { scope: scopeOf(U.owner) });
    const l2 = await svcList("listShifts", ctx2, { scope: scopeOf(U.owner) });
    chk("X2.2", !!s2 && typeof stMod?.archiveShift === "function" && !a.ok && !b.ok && before === after && !!l && !l.some((x: Any) => x.id === s2) && !!l2 && l2.some((x: Any) => x.id === s2), "refused ×2 · unchanged · only in sys2's list", `fixture=${!!s2} archive=${a.ok ? "ACCEPTED" : "refused"} update=${b.ok ? "ACCEPTED" : "refused"} unchanged=${before === after} inA=${l ? l.some((x: Any) => x.id === s2) : "∅"} inSys2=${l2 ? l2.some((x: Any) => x.id === s2) : "∅"}`);
  }
  {
    const all: string[] = [];
    let ok = true;
    for (const [fn, extra] of [["listShifts", {}], ["listLeavePolicies", {}], ["listHolidays", { year: 2030 }], ["listHolidays", { year: 2031 }], ["listHolidays", { year: 2032 }]] as [string, Record<string, unknown>][]) {
      const l = await svcList(fn, ctxA, { ...extra, scope: scopeOf(U.mgrU1) });
      if (!l) ok = false;
      all.push(...(l ?? []).filter((x: Any) => x.unitId === u2).map((x: Any) => `${fn}:${x.id}`));
    }
    const u2Rows = (await rawCount("HrShift", `"tenantId" = $1 AND "unitId" = $2`, T, u2)) + (await rawCount("HrLeavePolicy", `"tenantId" = $1 AND "unitId" = $2`, T, u2)) + (await rawCount("HrHoliday", `"tenantId" = $1 AND "unitId" = $2`, T, u2));
    chk("X2.3", ok && u2Rows >= 3 && all.length === 0, "0 u2 rows in 5 lists (u2 rows exist)", `lists=${ok ? "5" : "∅"} u2RowsInDb=${u2Rows} leaked=${all.length}`);
  }

  // ═══ X3 action matrix ═══
  {
    const A = saMod && !saMod.__err ? saMod : null;
    const missingActs = SETTINGS_ACTION_NAMES.filter((n) => typeof A?.[n] !== "function");
    let n = 0;
    const fresh = (p: string) => `${p} ${++n}`;
    const unitOf = (t: "u1" | "u2") => (t === "u1" ? u1 : u2);
    const fx = async (table: string, t: "u1" | "u2") => {
      try {
        if (table === "HrShift") return await rawInsert("HrShift", { tenantId: T, systemId: sA.id, unitId: unitOf(t), name: fresh("กะเมทริกซ์"), startMin: 480, endMin: 960 });
        if (table === "HrLeavePolicy") return await rawInsert("HrLeavePolicy", { tenantId: T, systemId: sA.id, unitId: unitOf(t), category: "PERSONAL", name: fresh("ลาเมทริกซ์") });
        return await rawInsert("HrHoliday", { tenantId: T, systemId: sA.id, unitId: unitOf(t), date: `2032-02-${String(10 + (n % 18)).padStart(2, "0")}`, name: fresh("หยุดเมทริกซ์"), kind: "SHOP" });
      } catch {
        return "";
      }
    };
    type Cell = { act: (typeof SETTINGS_ACTION_NAMES)[number]; run: (who: Who, t: "u1" | "u2") => Promise<{ out: Out; happened: boolean }> };
    const call = (who: Who, name: string, f: Record<string, string>) => inAct(who, pathS, () => (typeof A?.[name] === "function" ? A[name](fd(f)) : Promise.reject(new Error(`∅${name}`))));
    const cells: Cell[] = [
      { act: "createShiftAction", run: async (who, t) => { const nm = fresh("กะฟอร์ม"); const out = await call(who, "createShiftAction", { systemId: sA.id, unitId: unitOf(t), name: nm, startMin: "480", endMin: "960", start: "08:00", end: "16:00", breakMin: "60", graceMin: "15", colour: "shift-2" }); return { out, happened: (await rawCount("HrShift", `"tenantId" = $1 AND name = $2`, T, nm)) > 0 }; } },
      { act: "updateShiftAction", run: async (who, t) => { const id = await fx("HrShift", t); const nm = fresh("กะแก้ฟอร์ม"); const out = await call(who, "updateShiftAction", { systemId: sA.id, id, shiftId: id, name: nm }); return { out, happened: ((await rawOne("HrShift", id)) as Any)?.name === nm }; } },
      { act: "archiveShiftAction", run: async (who, t) => { const id = await fx("HrShift", t); const out = await call(who, "archiveShiftAction", { systemId: sA.id, id, shiftId: id }); return { out, happened: ((await rawOne("HrShift", id)) as Any)?.active === false }; } },
      { act: "createLeavePolicyAction", run: async (who, t) => { const nm = fresh("ลาฟอร์ม"); const out = await call(who, "createLeavePolicyAction", { systemId: sA.id, unitId: unitOf(t), category: "PERSONAL", name: nm, quotaDays: "3" }); return { out, happened: (await rawCount("HrLeavePolicy", `"tenantId" = $1 AND name = $2`, T, nm)) > 0 }; } },
      { act: "updateLeavePolicyAction", run: async (who, t) => { const id = await fx("HrLeavePolicy", t); const nm = fresh("ลาแก้ฟอร์ม"); const out = await call(who, "updateLeavePolicyAction", { systemId: sA.id, id, policyId: id, name: nm }); return { out, happened: ((await rawOne("HrLeavePolicy", id)) as Any)?.name === nm }; } },
      { act: "archiveLeavePolicyAction", run: async (who, t) => { const id = await fx("HrLeavePolicy", t); const out = await call(who, "archiveLeavePolicyAction", { systemId: sA.id, id, policyId: id }); return { out, happened: ((await rawOne("HrLeavePolicy", id)) as Any)?.active === false }; } },
      { act: "upsertHolidayAction", run: async (who, t) => { const nm = fresh("หยุดฟอร์ม"); const out = await call(who, "upsertHolidayAction", { systemId: sA.id, unitId: unitOf(t), date: `2032-03-${String(1 + (n % 27)).padStart(2, "0")}`, name: nm, kind: "SHOP" }); return { out, happened: (await rawCount("HrHoliday", `"tenantId" = $1 AND name = $2`, T, nm)) > 0 }; } },
      { act: "deleteHolidayAction", run: async (who, t) => { const id = await fx("HrHoliday", t); const out = await call(who, "deleteHolidayAction", { systemId: sA.id, id, holidayId: id }); return { out, happened: !!id && (await rawCount("HrHoliday", `id = $1`, id)) === 0 }; } },
    ];
    const roles: [string, Who, "u1" | "u2", boolean][] = [
      ["member", U.member, "u1", false],
      ["staffU1", U.staffU1, "u1", false],
      ["mgrU1@u2", U.mgrU1, "u2", false],
      ["mgrU1@u1", U.mgrU1, "u1", true],
      ["owner", U.owner, "u2", true],
      ["mgrAll", U.mgrAll, "u2", true],
    ];
    const bad: string[] = [];
    for (const [tag, who, t, allow] of roles) {
      for (const c of cells) {
        const { out, happened } = await c.run(who, t);
        const good = allow ? okOut(out) && happened : !okOut(out) && !happened;
        if (!good) bad.push(`${tag}/${c.act.replace("Action", "")}:${happened ? "did" : "not"}${allow ? "" : `"${short(out.text, 20)}"`}`);
      }
    }
    chk("X3.1", missingActs.length === 0 && bad.length === 0, "48 cells as expected", `missing=${missingActs.join(",") || "0"} bad=${bad.length}/48 ${bad.slice(0, 6).join(" ")}`);
  }

  // ═══ X7 / X8 / X12 ═══
  {
    const today = hr.bkkParts(new Date()).dateStr; // only to prove its absence
    const hit = s5Payloads.filter((p) => p.includes(today)).length;
    const early = (staticNotes.x71 ?? []) as string[];
    chk("X7.1", early.length === 0 && hit === 0 && s5Payloads.length >= 5, "0 pre-2030 fixture literals · today in 0 payloads", `literals<2030=${early.slice(0, 4).join(",") || "0"} todayHits=${hit}/${s5Payloads.length}`);
  }
  {
    const systems = (await P.appSystem.findMany({ where: { tenantId: T }, select: { type: true } })) as Any[];
    const hrOnly = systems.every((s) => s.type === "HR");
    chk("X8.1", hrOnly && s3Pass.length === 12 && s3Pass.every(Boolean), "HR-only tenant · S3 12/12 green", `types=${srt(new Set(systems.map((s) => s.type)))} S3=${s3Pass.filter(Boolean).length}/${s3Pass.length}`);
  }
  {
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_OPTIONS: "--max-old-space-size=2048" };
    const r = await spawnTsx([FITNESS_HR], env, 300_000);
    const summary = r.out.match(/JSON_SUMMARY (\{.*\})/)?.[1] ?? "";
    let total = "?";
    try {
      const j = JSON.parse(summary);
      total = `${j.passed}/${j.total}`;
    } catch {
      /* keep ? */
    }
    chk("X12.1", r.code === 0 && !!summary, "exit 0", `exit=${r.code} passed=${total}${r.code !== 0 ? ` ${short(r.out.split("\n").filter((l) => /❌/.test(l)).join(" "), 120)}` : ""}`);
    const miss = (staticNotes.f161Missing ?? []) as string[];
    chk("S6.3", miss.length === 0 && r.code === 0, "F16.1 ⊇ 4 keys · fitness-hr exit 0", `F16.1 missing=${miss.join(",") || "0"} fitness exit=${r.code}`);
  }

  // ═══ S7 seed / expected (READ-ONLY qc-hr-v2) ═══
  console.log("── [S7] seed / expected (read-only qc-hr-v2) ──");
  {
    let exp: Any = null;
    try {
      exp = JSON.parse(rd(EXPECTED) || "null");
    } catch {
      exp = null;
    }
    if (!qcT) {
      for (const id of ["S7.2", "S7.3", "S7.4"]) chk(id, false, "seeded tenant", "qc-hr-v2 not seeded on QC4");
    } else {
      const q = qcT.tenantId;
      const shifts = (await rowsOf("HrShift", `"tenantId" = $1`, q)) ?? null;
      const pols = (await rowsOf("HrLeavePolicy", `"tenantId" = $1`, q)) ?? null;
      const hols = (await rowsOf("HrHoliday", `"tenantId" = $1`, q)) ?? null;
      const huahin = ((await P.businessUnit.findFirst({ where: { tenantId: q, slug: hqcEnv.HQC.units.huahin.slug }, select: { id: true } })) as Any)?.id;
      const H = hqcEnv.HQC.shifts;
      const shop = (shifts ?? []).filter((s) => s.unitId === null && !s.crossesMidnight);
      const timesOk = ["morning", "afternoon", "closing"].every((k) => shop.some((s) => s.startMin === H[k].startMin && s.endMin === H[k].endMin && s.graceMin === H[k].graceMin));
      const pol = (c: string) => (pols ?? []).find((p) => p.category === c);
      const r = {
        shifts: !!shifts && shifts.length === 4 && shop.length === 3 && timesOk && srt(shop.map((s) => s.colour)) === "shift-1,shift-2,shift-3" && shifts.some((s) => s.crossesMidnight === true && s.startMin === 1320 && s.endMin === 360),
        policies:
          !!pols && pols.length === 4 &&
          String(pol("SICK")?.quotaDays) === "30" && pol("SICK")?.paid === true && pol("SICK")?.attachmentAfterDays === 3 &&
          String(pol("PERSONAL")?.quotaDays) === "3" && pol("PERSONAL")?.paid === true &&
          String(pol("VACATION")?.quotaDays) === "6" && pol("VACATION")?.minServiceDays === 365 && String(pol("VACATION")?.carryMaxDays) === "6" && pol("VACATION")?.carryExpiresMonthDay === "03-31" &&
          pol("OTHER")?.paid === false && pol("OTHER")?.quotaDays === null,
        holidays: !!hols && hols.length === 2 && hols.some((h) => h.kind === "PUBLIC" && h.presetYear !== null) && hols.some((h) => h.kind === "SHOP" && h.unitId === huahin),
        expected: !!exp && Number(exp?.counts?.HrShift) === shifts?.length && Number(exp?.counts?.HrLeavePolicy) === pols?.length && Number(exp?.counts?.HrHoliday) === hols?.length,
      };
      chk("S7.2", Object.values(r).every(Boolean), "4 shifts · 4 policies · 2 holidays · expected sections", `${failedKeys(r)} (shifts=${shifts?.length ?? "∅"} policies=${pols?.length ?? "∅"} holidays=${hols?.length ?? "∅"})`);
      const dist = (await rawRows(`SELECT COALESCE(judgement::text, '-') AS j, kind::text AS k, count(*)::int AS n FROM "HrAttendance" WHERE "tenantId" = $1 GROUP BY 1, 2 ORDER BY 1, 2`, q)) ?? [];
      const total = dist.reduce((s, x) => s + Number(x.n), 0);
      const d = `${total}|${dist.map((x) => `${x.k}:${x.j}=${x.n}`).join(",")}`;
      console.log(`  ℹ S7.3 qc-hr-v2 attendance = ${d}`);
      chk("S7.3", total === 120 && Number(exp?.attendanceRows) === 120 && Number(exp?.counts?.HrAttendance) === 120 && d === FROZEN_S73, `120 = expected · ${FROZEN_S73}`, `${d} · expected.attendanceRows=${exp?.attendanceRows ?? "∅"}`);
      const live: Record<string, number> = {};
      const keys = ["HrEmployee", "HrAttendance", "HrLeave", "HrWorkSchedule", "HrSalaryProfile", "HrPayAdjustment", "HrPayrollRun", "HrPayrollItem", "HrShift", "HrLeavePolicy", "HrHoliday"];
      for (const k of keys) live[k] = await rawCount(k, `"tenantId" = $1`, q);
      const zero = ["HrRosterEntry", "HrShiftSwapRequest", "HrTimeCorrection", "HrOtRequest", "HrLeaveBalanceTxn"];
      const zeros = await Promise.all(zero.map(async (k) => [k, await rawCount(k, `"tenantId" = $1`, q)] as const));
      const diff = keys.filter((k) => Number(exp?.counts?.[k]) !== live[k]);
      const nz = zeros.filter(([, v]) => v !== 0).map(([k, v]) => `${k}=${v}`);
      chk("S7.4", !!exp && diff.length === 0 && nz.length === 0 && live.HrShift === 4 && live.HrLeavePolicy === 4 && live.HrHoliday === 2, "every Hr* count = live · new 3 = 4/4/2 · request tables 0", `diff=${diff.map((k) => `${k}:${exp?.counts?.[k] ?? "∅"}≠${live[k]}`).join(" ") || "0"} nonZero=${nz.join(",") || "0"}`);
    }
  }
  const eXAfter = JSON.stringify(await P.hrEmployee.findUnique({ where: { id: E.eX } }));
  tail = { T, qcSnap, qcBefore, eXSame: eXAfter === eXBefore };
}

// S7.5 / S7.6 are evaluated after cleanup (S7.5 needs the HR_DELETE_ORDER pass · S7.6 the whole run)
let tail: { T: string; qcSnap: () => Promise<string>; qcBefore: string; eXSame: boolean } | null = null;

// ═════════════════════════ cleanup ═════════════════════════
const NEW_DELETE_ORDER = ["HrShiftSwapRequest", "HrTimeCorrection", "HrOtRequest", "HrLeaveBalanceTxn", "HrRosterEntry", "HrShift", "HrHoliday", "HrLeavePolicy"];
let s75Db = "not run";
async function cleanup(): Promise<void> {
  const d = async (n: string, f: () => Promise<unknown>) => {
    try {
      await f();
    } catch (e) {
      console.log(`  ⚠ cleanup ${n}: ${errText(e).slice(0, 90)}`);
    }
  };
  // S7.5 db part — apply hr-qc-env HR_DELETE_ORDER (delegates the client knows) to the main tenant first
  if (tail?.T) {
    const errs: string[] = [];
    for (const m of (hqcEnv.HR_DELETE_ORDER ?? []) as string[]) {
      if (!P[m]?.deleteMany) continue;
      try {
        await P[m].deleteMany({ where: { tenantId: tail.T } });
      } catch (e) {
        errs.push(`${m}:${pgCode(e)}`);
      }
    }
    const left: string[] = [];
    for (const t of NEW_DELETE_ORDER) {
      const n = await rawCount(t, `"tenantId" = $1`, tail.T);
      if (n !== 0) left.push(`${t}=${n}`);
    }
    s75Db = errs.length || left.length ? `errors=${errs.join(",") || "0"} left=${left.join(",") || "0"}` : "ok";
  }
  for (let pass = 0; pass < 2; pass++) {
    for (const tid of tenants) {
      for (const t of NEW_DELETE_ORDER) if (await tableExists(t)) await d(t, () => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid));
      if (await tableExists("HrEmployeeUnit")) await d("HrEmployeeUnit", () => P.$executeRawUnsafe(`DELETE FROM "HrEmployeeUnit" WHERE "tenantId" = $1`, tid));
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

// S7.5 / S7.6 (after cleanup)
if (results.size) {
  chk("S7.5", staticNotes.deleteOrder === "ok" && s75Db === "ok", "order ok · 0 rows left", `static=${staticNotes.deleteOrder ?? "∅"} db=${s75Db}`);
  if (tail) {
    const qcAfter = await tail.qcSnap();
    chk("S7.6", tail.qcBefore === qcAfter && !tail.qcBefore.startsWith("∅") && tail.eXSame, "qc-hr-v2 counts identical · other-tenant employee unchanged", `qc-hr-v2 ${tail.qcBefore === qcAfter ? `identical (${short(qcAfter, 90)})` : `${short(tail.qcBefore, 80)} → ${short(qcAfter, 80)}`} · eX ${tail.eXSame ? "unchanged" : "CHANGED"}`);
  }
}

const residue: string[] = [];
for (const tid of tenants) {
  for (const m of ["hrLeave", "hrEmployee", "hrAttendance", "hrSalaryProfile", "hrPayAdjustment", "hrPayrollRun", "hrPayrollItem", "auditLog", "outboxEvent", "membership", "appSystem", "businessUnit"]) {
    const n = await P[m].count({ where: { tenantId: tid } }).catch(() => -1);
    if (n !== 0) residue.push(`${m}=${n}`);
  }
  for (const t of NEW_DELETE_ORDER) {
    const n = await rawCount(t, `"tenantId" = $1`, tid);
    if (n > 0 || n === -2) residue.push(`${t}=${n}`);
  }
}
const leftUsers = await P.user.count({ where: { OR: [{ id: { in: users.length ? users : ["∅"] } }, { email: { startsWith: `${SLUG}-` } }] } }).catch(() => -1);
const leftSessions = users.length ? await P.session.count({ where: { userId: { in: users } } }).catch(() => -1) : 0;
if (leftUsers !== 0) residue.push(`user=${leftUsers}`);
if (leftSessions !== 0) residue.push(`session=${leftSessions}`);
const leftTenants = await P.tenant.count({ where: { slug: { startsWith: SLUG_PREFIX } } }).catch(() => -1);
if (leftTenants !== 0) residue.push(`tenant(${SLUG_PREFIX}*)=${leftTenants}`);
console.log(`RESIDUE ${residue.length ? residue.join(",") : "none"} (tenants=${tenants.length} users=${users.length})`);
chk("Z1", residue.length === 0 && tenants.length > 0, "none", residue.join(",") || "none");
for (const [id] of CHECKS) if (!results.has(id)) chk(id.replace(/^H1\.2-/, ""), false, "checked", crashed ? `not reached (harness crashed: ${crashed.slice(0, 80)})` : "not reached");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
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
