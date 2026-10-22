// QC — HR V2 · H2.1 — shift catalogue consumer + daily roster engine: hr/roster.ts (generate from HrWorkSchedule · manual add/move/remove ·
//      copy week · warn-only rule checks · publish → hr.roster.published) · pure hr/roster-rules.ts · HR-native day readers rosterOnDay/rosterAt
// ⚠️ Oracle under change control (controller owns it) — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// requires: nothing seeded — own throwaway tenants `qc-hr-h2.1-<stamp>` (main T: units u1/u2 · HR systems A + sys2) · `-d` (S8 frozen
//   fixture copied from qc-hr-h1.2 S5 · systems D / M / K) · `-other` (X2 / privacy other tenant) · `-nohr` (S6.8) — swept in `finally`
//
// Contract (ledger/hr-briefs/hr-brief-H2.1.md §2 R1–R13 · §3 · §9 rulings Q1–Q15 22 Oct · base session/hr c7753731 = H0.7 + H1.1 + H1.2 merged)
//
// ORACLE CONTRACT (R1 "oracle fixes the final form" — builder asks for an ORACLE-EDIT if it must differ):
//   roster.ts (viewer = SettingsViewer { role, unitAccess, permissions, userId } · days "YYYY-MM-DD" Bangkok · result {ok:true,…}|{ok:false,reason})
//     generateFromTemplate(ctx, viewer, { from, to, unitId? }) → { ok, created: number, skipped: { reason, employeeId, date }[] }
//          skip reasons used here: "EXISTS" · "NO_SHIFT" · "HOLIDAY" (others free, e.g. ENDED / OUT_OF_EMPLOYMENT)
//     addEntry(ctx, viewer, { employeeId, date, shiftId, note?, startMin?, endMin? }) → { ok, id }
//     moveEntry(ctx, viewer, entryId, { date?, shiftId?, employeeId? }) → { ok, id } · removeEntry(ctx, viewer, entryId) → { ok }
//     copyWeek(ctx, viewer, { fromWeek, toWeek, unitId? }) → { ok, created, skipped[], warnings? } (skip reasons "EXISTS" · "HOLIDAY" ·
//          "SHIFT_ARCHIVED" · any for ENDED) · INFO HOLIDAY_WORK / ON_LEAVE accepted from copyWeek().warnings OR checkRules() of the week
//     checkRules(ctx, viewer, { from, to, unitId? }) → { ok, warnings: RosterWarning[] }
//     publishRoster(ctx, viewer, { from, to, unitId? }) → { ok, published: number, eventId: string | null }
//     listRoster(ctx, viewer, { from, to, unitId? }) → { ok, entries, unpublishedCount, warnings } · entry keys EXACTLY R7:
//          id employeeId date shiftId unitId startMin endMin breakMin crossesMidnight window{start,end} paidMin published publishedAt source note
//     rosterOnDay({ tenantId, date, unitId?, systemId? }) / rosterAt({ tenantId, at, unitId?, systemId?, toleranceMin? }) →
//          { hrLinked, entries } · entry keys EXACTLY R8: systemId employeeId userId entryId shiftId date unitId startMin endMin breakMin
//          crossesMidnight start end
//   roster-rules.ts (pure): rosterWarnings(entries[{ id, employeeId, date, startMin, endMin, breakMin, crossesMidnight }], limits?) →
//          RosterWarning { rule, employeeId, day? | weekStart?, valueMin?, limitMin?, entryIds[] } · ROSTER_RULE_DEFAULTS · ROSTER_RULE_TEXT
//
// Groups: S1 generate · S2 manual ops · S3 copy week · S4 rule vectors · S5 publish + event · S6 readers · S7 branch scope + refusals ·
//         S8 frozen controls · X6 races · X2 isolation · X12 fitness · Z1 residue
// Base expectation per check (registry column 4): RED = needs H2.1 (red for the right reason on c7753731) · GREEN = control that must stay green.
// FROZEN (S8.1–S8.6): the qc-hr-h1.2 S5 fixture + frozen values (computed there on 2a5f9a3e, re-proved on the H1.2 merge) — here with
//   PUBLISHED roster rows that contradict the (absent) template for the same employees, incl. today's Bangkok day ⇒ clock() still says NO_SCHEDULE.
// SKIP convention (house style of qc-hr-h1.2): while src/lib/modules/hr/roster.ts is absent the suite prints SKIPPED + JSON_SUMMARY
//   {skipped:true} and exits 0 · QC_FORCE=1 (or --force-run) runs everything · --list = print every id without touching the DB.
//
// Run (QC4 only):
//   bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h2.1.mts
//   bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-hr-h2.1.mts      (SKIP exit 0 on the base)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const SUITE = "qc-hr-h2.1";
const ROOT = process.cwd();
const ARGV = process.argv.slice(2);
const LIST = ARGV.includes("--list");
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const QC4_HOST_MARK = "ep-frosty-lab";
const SLUG_PREFIX = "qc-hr-h2.1-";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ROSTER = "src/lib/modules/hr/roster.ts";
const ROSTER_RULES = "src/lib/modules/hr/roster-rules.ts";
const HR_INDEX = "src/lib/modules/hr/index.ts";
const SETTINGS = "src/lib/modules/hr/settings.ts";
const SCOPE_FILE = "src/lib/modules/hr/scope.ts";
const CONSUMERS_FILE = "src/lib/outbox-consumers.ts";
const AUTOMATION_LABELS = "src/lib/automation/labels.ts";
const WEBHOOK_LABELS = "src/lib/webhooks/labels.ts";
const RULES_FILE = "src/lib/modules/hr/payroll-rules.ts";
const FITNESS = "scripts/fitness.mts";
const FITNESS_HR = "scripts/fitness-hr.mts";
/** R13 frozen files (byte-identical vs base) */
const FROZEN_FILES = [
  "src/lib/modules/hr/service.ts",
  "src/lib/modules/hr/payroll-rules.ts",
  "src/lib/modules/hr/payroll.ts",
  "src/lib/modules/hr/payroll-actions.ts",
  "src/lib/modules/hr/payroll-digest.ts",
  "src/lib/modules/hr/privacy-shared.ts",
  "src/lib/modules/hr/time-rules.ts",
  "src/lib/modules/hr/settings.ts",
];
/** sha256 of payroll-rules.ts (FREEZE — COMMON §C.4 · same value as qc-hr-h0.6/h0.7/h1.1/h1.2) */
const RULES_SHA = "75a66c0c1354e932e7ba29609dcbf0919ffe82b51f476a3945fd1a0749833bf7";

// ── fixed texts (brief R2 · R5 · R6 · R10 · S7.4 · H1.1 · H1.2) ──
const T_NO_PERM = "คุณไม่มีสิทธิ์จัดตารางกะ";
const T_ENDED = "พนักงานคนนี้พ้นสภาพแล้ว — จัดกะไม่ได้";
const T_OUT_EMPLOY = "วันนี้อยู่นอกช่วงการจ้างของพนักงานคนนี้";
const T_SHIFT_OFF = "กะนี้ปิดใช้แล้ว — เลือกกะอื่น";
const T_SHIFT_NF = "ไม่พบกะนี้ — กรุณารีเฟรช";
const T_SHIFT_OTHER = "กะนี้เป็นของสาขาอื่น — เลือกกะของสาขานี้หรือกะที่ใช้ทั้งร้าน";
const T_DUP = "พนักงานคนนี้มีกะนี้ในวันนั้นแล้ว";
const T_PAST = "จัดกะย้อนหลังไม่ได้ — ใช้คำขอแก้เวลาแทน";
const T_SAME_WEEK = "สัปดาห์ต้นทางกับปลายทางต้องไม่ใช่สัปดาห์เดียวกัน";
const T_PUBLISH_RACE = "ตารางกะมีการแก้ไขระหว่างเผยแพร่ — กรุณากดเผยแพร่อีกครั้ง";
const T_OTHER_BRANCH = "พนักงานคนนี้อยู่สาขาอื่น — คุณจัดการได้เฉพาะสาขาของคุณ"; // H1.1 HR_OTHER_BRANCH_TEXT
const T_UNASSIGNED = "พนักงานคนนี้ยังไม่ระบุสาขาประจำ — ผู้ดูแลทุกสาขาเป็นผู้จัดการ"; // H1.1 HR_UNASSIGNED_TEXT
const T_OTHER_UNIT = "รายการนี้เป็นของสาขาอื่น — คุณจัดการได้เฉพาะสาขาของคุณ"; // H1.2 SETTINGS_TEXT.otherUnit
const T_SHIFT_EQUAL = "เวลาเริ่มกับเวลาเลิกกะต้องไม่เท่ากัน"; // H1.2 TIME_RULE_TEXT.shiftEqual
const T_SETTINGS_DUP = "มีกะชื่อนี้อยู่แล้วในสาขานี้"; // H1.2 SETTINGS_TEXT.shiftDup
const RULE_TEXTS = ["ชั่วโมงต่อวันเกินกำหนด", "พักระหว่างกะน้อยกว่ากำหนด", "กะซ้อนกัน", "ไม่มีวันหยุดในสัปดาห์", "ชั่วโมงต่อสัปดาห์เกินกำหนด", "ทำงานวันหยุด — คิดค่าจ้างวันหยุด", "ลาอนุมัติแล้วในวันนี้"];
const LABEL_TEXT = "เมื่อเผยแพร่ตารางกะ (HR)";
const EVENT = "hr.roster.published";
/** every fixed refusal an H2.1 path may return (S7.6) */
const FIXED_REFUSALS = new Set([T_NO_PERM, T_ENDED, T_OUT_EMPLOY, T_SHIFT_OFF, T_SHIFT_NF, T_SHIFT_OTHER, T_DUP, T_PAST, T_SAME_WEEK, T_PUBLISH_RACE, T_OTHER_BRANCH, T_UNASSIGNED, T_OTHER_UNIT, T_SHIFT_EQUAL]);
const R7_KEYS = ["id", "employeeId", "date", "shiftId", "unitId", "startMin", "endMin", "breakMin", "crossesMidnight", "window", "paidMin", "published", "publishedAt", "source", "note"];
const R8_KEYS = ["systemId", "employeeId", "userId", "entryId", "shiftId", "date", "unitId", "startMin", "endMin", "breakMin", "crossesMidnight", "start", "end"];
const PAYLOAD_KEYS = ["publishId", "systemId", "unitId", "from", "to", "entryIds", "employeeIds"];

// ── S8 fixtures — copied verbatim from qc-hr-h1.2 (S5) · values frozen there ──
const PRIOR_WO_KEYS = new Set(["filedById", "linkApprovedById", "unitId", "employmentStatus", "probationEndAt", "contractEndAt", "filedBy"]);
const H12_NEW_KEYS = ["rosterEntryId", "source", "lat", "lng", "accuracyM", "photoKey", "deviceId", "attachmentKey", "policyId", "days", "halfDay", "hours"];
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
const FROZEN_MONTHLY_DIGEST = "72166a3e2a2ebb6a37405a105f7db540b946fda05fe020639bbe79a60b87e5c8";
const FROZEN_MONTHLY_TOTALS = "10725000:195000:195000:100000:10430000:475000:100000";
const FROZEN_MONTHLY_FLAGS = "M01=-,M02=-,M03=-,M04=PARTIAL_MONTH";
/** qc-hr-h1.2 FROZEN_S5 (S5.1–S5.5) → here S8.1–S8.5 */
const FROZEN_S8: Record<string, string> = {
  "S8.1": "8436a89981a0146a04c8954c6b0a49752eb7cb9c0661df9927bc356bd8fe46c9",
  "S8.2": "f43008cba9f7bfae26638ae985e4c11565803988943cf3cf2f3921de10b8a62d",
  "S8.3": "54ef63446a674b6108da0bf977e2b50aab14cfd40252f18c94c0d4eb0f2798b1",
  "S8.4": "9a4c6047d670e99934b26da17183246f1c3ce07415ccc1c7f81f66cb09df1fb3",
  "S8.5": "840adc0a26e7efd47a1e90cc033305236855d619f8b06aaf42dbb91c3b5e9643",
};
/** S8.8 clock() judgement control (template-based, independent of today's weekday) */
const FROZEN_CLOCK = "K1=DAY_OFF:-:-|K2=ON_TIME:0:0|K3=NO_SCHEDULE:-:-";

// ═════════════════════════ registry (id · group · severity · base expectation · title) ═════════════════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Base = "RED" | "GREEN";
type Def = readonly [string, string, Sev, Base, string];
const D = (id: string, g: string, sev: Sev, base: Base, title: string): Def => [`H2.1-${id}`, g, sev, base, title] as const;
const CHECKS: readonly Def[] = [
  // S1 generate from template (R3 · R4)
  D("S1.1", "R4", "CRITICAL", "RED", "[service] owner generate 2030-03-04…03-10 ⇒ exactly the 23 expected TEMPLATE rows (template day × matching shift · unit of the day) · snapshot = shift times · published false"),
  D("S1.2", "R4", "MAJOR", "RED", "[service] dayOff weekday (e2 Wed) and unset weekdays (e2 Thu/Sun) ⇒ no TEMPLATE entry"),
  D("S1.3", "R4", "CRITICAL", "RED", "[service] template 09:00–18:00 without an identical active shift ⇒ skipped NO_SHIFT (e6 03-04) · no row · 0 HrShift created · archived 07–15 twin never chosen"),
  D("S1.4", "R4", "CRITICAL", "RED", "[service] e5 ENDED ⇒ none · e6 PROBATION ⇒ rows · e7 (startDate 03-07) ⇒ rows 03-07…03-10 only"),
  D("S1.5", "R3", "CRITICAL", "RED", "[service] e4 (home u2, borrowed to u1 03-04…03-10): borrowed days unitId u1 + u1 shift · generate 03-01…03-03 ⇒ unitId u2 + shop-wide twin (unit before shop-wide · Q2/Q3)"),
  D("S1.6", "R4", "CRITICAL", "RED", "[service] second run of the same range ⇒ created 0 · same row set · every updatedAt unchanged"),
  D("S1.7", "R4", "CRITICAL", "RED", "[service] pre-existing MANUAL (e1 03-05) and AI (e6 03-06) entries untouched · nothing added that employee-day · skipped EXISTS"),
  D("S1.8", "R6", "MAJOR", "RED", "[service] generate on the closed shop-wide holiday 2030-03-12 ⇒ created 0 · skipped HOLIDAY for every templated employee · 0 rows that day"),
  D("S1.9", "R4", "MAJOR", "RED", "[db] one audit hr.roster.generate for the first run · after = counts only (created 23 · no employee id / name)"),
  D("S1.10", "Q11", "MAJOR", "RED", "[service] 32-day range ⇒ generate / checkRules / listRoster / publish refused (Thai) · 0 rows · 31-day listRoster ok"),
  D("S1.11", "Q10", "MAJOR", "RED", "[service] generate over a past week (2020) writes 0 rows (refused or all skipped — flag 2)"),
  // S2 manual ops + snapshot (R5 · Q7 · Q10)
  D("S2.1", "R5", "CRITICAL", "RED", "[service] addEntry ⇒ MANUAL · snapshot = shift start/end/break/crossesMidnight · unitId of the day · published false"),
  D("S2.2", "R5", "CRITICAL", "RED", "[service] edit the HrShift times afterwards ⇒ the entry snapshot unchanged"),
  D("S2.3", "R5", "CRITICAL", "RED", "[service] overnight add (22–06) ⇒ crossesMidnight true · listRoster window 15:00Z D → 23:00Z D (= 06:00 D+1 BKK) · paidMin 480"),
  D("S2.4", "R5", "CRITICAL", "RED", "[service] duplicate (employee,date,shift) ⇒ \"" + T_DUP + "\" · still 1 row"),
  D("S2.5", "R5", "CRITICAL", "RED", "[service] archived shift ⇒ \"" + T_SHIFT_OFF + "\" · sys2 shift ⇒ \"" + T_SHIFT_NF + "\" · u2 shift for a u1 entry ⇒ \"" + T_SHIFT_OTHER + "\" · 0 rows"),
  D("S2.6", "R5", "CRITICAL", "RED", "[service] ENDED employee ⇒ \"" + T_ENDED + "\" · before startDate ⇒ \"" + T_OUT_EMPLOY + "\" · 0 rows"),
  D("S2.7", "R5", "CRITICAL", "RED", "[service] moveEntry date+shift in place: same id · snapshot re-taken · published false · source MANUAL · e4 borrowed-day entry moved out of the borrowing ⇒ unitId u1 → u2"),
  D("S2.8", "R5", "MAJOR", "RED", "[service] removeEntry of a published row ⇒ row gone · audit hr.roster.entry.remove after.wasPublished true"),
  D("S2.9", "Q10", "CRITICAL", "RED", "[service] past day (2020): add · move from a past row · move to a past day · remove a past row ⇒ \"" + T_PAST + "\" · nothing changed"),
  D("S2.10", "Q7", "MAJOR", "RED", "[service] addEntry time override 14:00–20:00 stored · 22:00–02:00 ⇒ crossesMidnight derived true · start = end ⇒ \"" + T_SHIFT_EQUAL + "\" · 0 rows"),
  // S3 copy week (R6 · Q6)
  D("S3.1", "R6", "CRITICAL", "RED", "[service] copyWeek 2030-03-04 → 03-11: copies on the same weekday · source MANUAL · times = CURRENT shift times (e3 Sr edited 18:00 → 19:00)"),
  D("S3.2", "R6", "CRITICAL", "RED", "[service] existing target employee-day (e2 03-15) untouched · skipped EXISTS"),
  D("S3.3", "R6", "CRITICAL", "RED", "[service] closed holiday 03-12 ⇒ 0 rows · skipped HOLIDAY · u1 shopOpen 03-13 ⇒ u1 rows copied + INFO HOLIDAY_WORK"),
  D("S3.4", "R6", "MAJOR", "RED", "[service] archived source shift ⇒ skipped SHIFT_ARCHIVED (e2 03-14) · ENDED e5 never copied"),
  D("S3.5", "R6", "MAJOR", "RED", "[service] fromWeek = toWeek ⇒ \"" + T_SAME_WEEK + "\" · 0 writes"),
  D("S3.6", "R6", "MAJOR", "RED", "[service] copy the same weeks again ⇒ created 0 · rows unchanged"),
  D("S3.7", "R6", "MAJOR", "RED", "[service] approved leave on the target day (e6 03-14) ⇒ row copied + INFO ON_LEAVE"),
  // S4 rule vectors (R9 · Q9)
  D("S4.1", "R9", "CRITICAL", "RED", "[pure] 10 h day ⇒ no MAX_DAY · 10.25 h ⇒ MAX_DAY valueMin 615 limitMin 600"),
  D("S4.2", "R9", "MAJOR", "RED", "[pure] two entries on one day summed ⇒ MAX_DAY 660 with both entryIds"),
  D("S4.3", "R9", "CRITICAL", "RED", "[pure] 15–23 then 07–15 next day (8 h gap) ⇒ REST with both ids"),
  D("S4.4", "R9", "CRITICAL", "RED", "[pure] overnight 22–06 then 15–23 same next day (9 h) ⇒ REST · then 17:00 start (11 h) ⇒ no REST"),
  D("S4.5", "R9", "MAJOR", "RED", "[pure] overlapping windows ⇒ OVERLAP (not REST) for that pair"),
  D("S4.6", "R9", "CRITICAL", "RED", "[pure] 7 working days Mon–Sun ⇒ DAY_OFF weekStart 2030-03-04 · 6 days ⇒ none"),
  D("S4.7", "R9", "CRITICAL", "RED", "[pure] Sun 22–06 + Mon 07:00 ⇒ REST across the week boundary · Mon-based Bangkok week: exactly one DAY_OFF weekStart 2030-03-11 (Sun-based/UTC weeks give none)"),
  D("S4.8", "R9", "CRITICAL", "RED", "[pure] 7 × 8 h = 56 h ⇒ MAX_WEEK valueMin 3360 · 6 × 8 h = 48 h ⇒ none"),
  D("S4.9", "R9", "CRITICAL", "RED", "[pure] overnight hours on the start day: 13–21 + 22–06 ⇒ MAX_DAY day D 960 · none on D+1 · Sun night counted in its Mon-week (MAX_WEEK 3360)"),
  D("S4.10", "R9", "CRITICAL", "RED", "[db] borrowed e4 u1 + u2 rows on 03-05 summed (MAX_DAY 660) · manager-u1 sees only the u1 entry id · manager-u2 only the u2 id and no u1-only employee"),
  D("S4.11", "R9", "CRITICAL", "RED", "[db] warnings never block: e1 has DAY_OFF + MAX_WEEK + ON_LEAVE(03-06) and publish of the week still flips every e1 row"),
  D("S4.12", "R9", "MAJOR", "RED", "[static+pure] roster-rules.ts: no DB import · no Date.now / new Date() · ROSTER_RULE_DEFAULTS {600,660,1,2880} · ROSTER_RULE_TEXT = the 7 Thai labels"),
  // S5 publish + event (R10 · R12)
  D("S5.1", "R10", "CRITICAL", "RED", "[service] owner publish 2030-03-04…03-10 ⇒ every unpublished candidate published · ONE shared publishedAt · already-published row untouched"),
  D("S5.2", "R10", "CRITICAL", "RED", "[db] exactly one outbox " + EVENT + " · key hr.roster.published#<publishId> · payload keys = R10 list · entryIds = flipped ids · ids only (no name)"),
  D("S5.3", "R10", "MAJOR", "RED", "[service] publish again with nothing new ⇒ published 0 · eventId null · no event · no audit"),
  D("S5.4", "R10", "CRITICAL", "RED", "[service] manager-u1 publish 03-11…03-17 ⇒ only unitId-u1 rows flip · u2 / null rows stay unpublished"),
  D("S5.5", "R10", "CRITICAL", "RED", "[race] row deleted under a row lock by a parallel lane during publish ⇒ \"" + T_PUBLISH_RACE + "\" · 0 rows flipped · 0 events (flag 4)"),
  D("S5.6", "R12", "CRITICAL", "RED", "[static+run] consumers[\"" + EVENT + "\"] = withAutomation(…) · label {\"" + EVENT + "\", \"" + LABEL_TEXT + "\"} exactly once in automation/labels · 0 in webhooks/labels · once in AUTOMATION_EVENTS and WEBHOOK_EVENTS"),
  D("S5.7", "R12", "CRITICAL", "RED", "[replay] the S5.1 event delivered by id ×2 sequential + ×2 parallel ⇒ no error · roster rows / audits / outbox count unchanged"),
  D("S5.8", "R10", "MAJOR", "RED", "[db] emitOutbox twice with the S5.1 idempotencyKey ⇒ still one outbox row"),
  D("S5.9", "R7", "MAJOR", "RED", "[service] listRoster.unpublishedCount = unpublished rows + published removals since the last publish (3)"),
  // S6 readers (R8 · Q4 · Q12)
  D("S6.1", "R8", "CRITICAL", "RED", "[reader] rosterOnDay = published rows only · never-published hidden · edited-after-publish listed with the live (moved) times"),
  D("S6.2", "R8", "CRITICAL", "RED", "[reader] APPROVED leave covering the day ⇒ excluded (e1 03-06) · PENDING ⇒ included (e2 03-04)"),
  D("S6.3", "R8", "CRITICAL", "RED", "[reader] ENDED / inactive employee ⇒ excluded even with a published entry (e5 03-07)"),
  D("S6.4", "R8", "CRITICAL", "RED", "[reader] unitId filter = entry.unitId: u1 ⇒ e4 borrowed entry in, e4 u2 entry out · u2 ⇒ the reverse · null-unit entry (e3) in for u1 (Q12)"),
  D("S6.5", "R8", "CRITICAL", "RED", "[reader] overnight entry of D listed for D, not for D+1"),
  D("S6.6", "R8", "CRITICAL", "RED", "[reader] rosterAt(02:00 BKK D+1) ⇒ exactly D's overnight entry (D13b) · start/end instants exact"),
  D("S6.7", "R8", "MAJOR", "RED", "[reader] multi-system tenant ⇒ rows of both HR systems · systemId filter narrows"),
  D("S6.8", "R8", "MAJOR", "RED", "[reader] tenant without an HR system ⇒ { hrLinked: false, entries: [] }"),
  D("S6.9", "R8", "CRITICAL", "RED", "[reader] result keys {hrLinked, entries} · entry keys exactly the R8 list · no name / leave / reason / money in the JSON · userId = linked user"),
  D("S6.10", "R8", "CRITICAL", "RED", "[static] hr/index.ts re-exports rosterOnDay + rosterAt from ./roster in a `HR H2.1 ▸` block · no logic · no onShiftToday"),
  // S7 branch scope + refusals (R2)
  D("S7.1", "R2", "CRITICAL", "RED", "[service] 🔴 manager-u1 add: e2 ⇒ \"" + T_OTHER_BRANCH + "\" · e3 ⇒ \"" + T_UNASSIGNED + "\" · e4 on a borrowed day ⇒ ok (u1) · e4 outside ⇒ refused"),
  D("S7.2", "R2", "CRITICAL", "RED", "[service] 🔴 manager-u1 generate 03-18…03-24 + copy → 03-25 touch only u1-of-the-day rows (e1/e6/e7)"),
  D("S7.3", "R2", "CRITICAL", "RED", "[service] listRoster matrix: owner = manager-all (all) · manager-u1 ⊆ u1-of-the-day (e4 in, e2/e3 out) · staff-u1 / member refused · other tenant 0 · entry keys exactly R7"),
  D("S7.4", "R2", "CRITICAL", "RED", "[service] staff-u1 + member: add · move · remove · generate · copy · publish ⇒ \"" + T_NO_PERM + "\" · 0 writes"),
  D("S7.5", "R2", "MAJOR", "RED", "[service] manager with unitAccess [] = tenant-wide (H1.1 amendment): add for e2 (u2) ok · listRoster shows e2 + e3"),
  D("S7.6", "R2", "CRITICAL", "RED", "[service] every refusal collected = one of the fixed texts byte-exact · no name / id inside"),
  D("S7.7", "R5", "MAJOR", "RED", "[db] audit hr.roster.* one row per successful op (add/move/remove/publish exact · generate/copy per call) · ids only · add/move/remove carry entryId…wasPublished"),
  D("S7.8", "R2", "MAJOR", "RED", "[service] manager-u1 unitId argument u2 ⇒ \"" + T_OTHER_UNIT + "\" (listRoster · generate) · 0 rows"),
  // S8 frozen controls (R13)
  D("S8.1", "R13", "CRITICAL", "GREEN", "[digest] listAttendance(ctxD, 50) with contradicting published roster rows = H1.2 FROZEN 8436a899…"),
  D("S8.2", "R13", "CRITICAL", "GREEN", "[digest] listLeaves + pendingLeaves = H1.2 FROZEN f43008cb…"),
  D("S8.3", "R13", "CRITICAL", "GREEN", "[digest] leaveItemsForViewer owner / manager-u1 / staff-u1 = H1.2 FROZEN 54ef6344…"),
  D("S8.4", "R13", "MAJOR", "GREEN", "[digest] monthlyAttendance 2030-03 D01–D03 = H1.2 FROZEN 9a4c6047…"),
  D("S8.5", "R13", "MAJOR", "GREEN", "[digest] employeesUnavailable ×2 · isOnLeave ×2 · kioskRoster = H1.2 FROZEN 840adc0a…"),
  D("S8.6", "R13", "CRITICAL", "GREEN", "[digest] MONTHLY payroll fixture = H1.1 FROZEN 72166a3e… (totals · flags)"),
  D("S8.7", "R13", "CRITICAL", "GREEN", "[static] payroll-rules.ts sha 75a66c0c… · service / payroll* / privacy-shared / time-rules / settings unchanged vs base"),
  D("S8.8", "R13", "CRITICAL", "GREEN", "[run] clock() still judges by HrWorkSchedule with published roster rows today: " + FROZEN_CLOCK),
  D("S8.9", "R13", "CRITICAL", "GREEN", "[dto] privacy matrix (owner · payroll · manager-u1 · hr.leave.read · member · self · other tenant) as H1.2 S6.1"),
  D("S8.10", "R13", "MAJOR", "GREEN", "[service] H1.2 settings behaviour: listShifts(manager-u1) = shop-wide + u1 active only · duplicate name ⇒ \"" + T_SETTINGS_DUP + "\""),
  // X
  D("X6.1", "X6", "CRITICAL", "RED", "[race] addEntry same key 10-way × 3 rounds ⇒ 1 row per round · 9 losers \"" + T_DUP + "\""),
  D("X6.2", "X6", "CRITICAL", "RED", "[race] publish ∥ moveEntry same day × 3 ⇒ both ok · never a published row with a stale snapshot · one event per publish that flipped rows"),
  D("X6.3", "X6", "CRITICAL", "RED", "[race] generate ∥ generate ⇒ same rows as one sequential run of an identical week · no duplicate employee-day"),
  D("X2.1", "X2", "CRITICAL", "RED", "[service] -other tenant employee / shift / entry ids from our ctx ⇒ refused · their rows unchanged"),
  D("X2.2", "X2", "CRITICAL", "RED", "[service] sys2 employee / entry ids in system A calls ⇒ refused · unchanged"),
  D("X12.1", "X12", "MAJOR", "GREEN", "[run] fitness.mts + fitness-hr.mts without env (PATH/HOME only) ⇒ exit 0"),
  D("Z1", "-", "CRITICAL", "GREEN", "residue: tenants qc-hr-h2.1-* gone · no row of ours in HR / roster / audit / outbox · users / sessions gone"),
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
  const full = `H2.1-${id}`;
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
const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).replace(/\s+/g, " ").slice(0, 180);
const isThai = (s: string) => /[฀-๿]/.test(s);
const textOf = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["reason", "message", "error"]) if (typeof o[k] === "string" && o[k]) return String(o[k]);
  }
  return "";
};
const srt = (a: Iterable<string>) => [...a].sort().join(",");
const failedKeys = (o: Record<string, unknown>) => Object.entries(o).filter(([, v]) => !v).map(([k]) => k).join(",") || "all";
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
/** "YYYY-MM-DD" of a @db.Date value / ISO string / day string */
const dk = (v: unknown): string => (v instanceof Date ? (Number.isFinite(v.getTime()) ? v.toISOString().slice(0, 10) : "∅") : typeof v === "string" ? v.slice(0, 10) : "∅");
const dbDate = (day: string) => new Date(`${day}T00:00:00Z`);
const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
const addDay = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const isoOf = (v: unknown): string => (v instanceof Date ? v.toISOString() : typeof v === "string" ? new Date(v).toISOString() : "∅");
function spawnTsx(args: string[], env: Record<string, string | undefined>, timeoutMs = 300_000): Promise<{ code: number; out: string }> {
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

// ═════════════════════════ statics (no DB) ═════════════════════════
const staticNotes: Record<string, Any> = {};
function runStatic(): void {
  console.log("── [S4.12 / S5.6 / S6.10 / S8.7] statics ──");
  // S4.12 static part
  const rr = rd(ROSTER_RULES);
  const rrCode = stripComments(rr);
  const imports = [...rrCode.matchAll(/from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1] ?? m[2] ?? "");
  staticNotes.rrExists = !!rr;
  staticNotes.rrBadImports = imports.filter((s) => /prisma|core\/db|\.\/service|\.\/roster$|\.\/settings|\.\/scope|tenantDb|@\/lib\/core/.test(s));
  staticNotes.rrClock = [...rrCode.matchAll(/Date\.now\(|new Date\(\s*\)/g)].length;
  // S5.6 static part
  const cons = stripComments(rd(CONSUMERS_FILE));
  const auto = rd(AUTOMATION_LABELS);
  const autoCode = stripComments(auto);
  const hook = stripComments(rd(WEBHOOK_LABELS));
  staticNotes.consumerLine = /["']hr\.roster\.published["']\s*:\s*withAutomation\(/.test(cons);
  staticNotes.autoLabel = [...autoCode.matchAll(/\{\s*value:\s*["']hr\.roster\.published["']\s*,\s*label:\s*["']([^"']*)["']\s*\}/g)].map((m) => m[1]);
  staticNotes.autoMentions = [...autoCode.matchAll(/hr\.roster\.published/g)].length;
  staticNotes.hookMentions = [...hook.matchAll(/hr\.roster\.published/g)].length;
  // S6.10
  const idx = rd(HR_INDEX);
  const idxCode = stripComments(idx);
  const i0 = idx.indexOf("// HR H2.1 ▸");
  const i1 = i0 >= 0 ? idx.indexOf("◂ HR H2.1", i0) : -1;
  const blk = i0 >= 0 ? idx.slice(i0, i1 > i0 ? i1 : undefined) : "";
  const blkCode = stripComments(blk);
  const s610 = {
    block: !!blk,
    onDay: /export\s*\{[^}]*\brosterOnDay\b[^}]*\}\s*from\s*["']\.\/roster["']/.test(blkCode),
    at: /export\s*\{[^}]*\brosterAt\b[^}]*\}\s*from\s*["']\.\/roster["']/.test(blkCode),
    noLogic: !/\bfunction\b|=>|\bawait\b|\bnew\s+[A-Z]|tenantDb|\bprisma\b|\bconst\b|\blet\b/.test(idxCode),
    noOnShiftToday: !/\bonShiftToday\b/.test(idxCode),
  };
  chk("S6.10", Object.values(s610).every(Boolean), "H2.1 block · rosterOnDay + rosterAt from ./roster · no logic · no onShiftToday", `${failedKeys(s610)}${blk ? "" : " (no `// HR H2.1 ▸` block)"}`);
  // S8.7
  const rsha = sha(rd(RULES_FILE));
  let base = process.env.QC_H21_BASE ?? "";
  let diff = "?";
  try {
    if (!base) base = execFileSync("git", ["merge-base", "HEAD", "origin/session/hr"], { cwd: ROOT, encoding: "utf8" }).trim();
    const out = execFileSync("git", ["diff", "--name-only", base, "--", ...FROZEN_FILES], { cwd: ROOT, encoding: "utf8" }).trim();
    diff = out ? `changed: ${out.replace(/\n/g, ",")}` : "unchanged";
  } catch (e) {
    diff = `git: ${errText(e).slice(0, 60)}`;
  }
  chk("S8.7", rsha === RULES_SHA && diff === "unchanged", `${RULES_SHA.slice(0, 16)} · ${FROZEN_FILES.length} files unchanged vs ${base.slice(0, 8)}`, `${rsha.slice(0, 16)} · ${diff} (base ${base.slice(0, 8) || "?"})`);
}

// ═════════════════════════ SKIP guard (static — before any DB connection) ═════════════════════════
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, ROSTER))) skipReasons.push(`H2.1 not built: ${ROSTER} absent`);
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: H2.1 not built`);
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

const { prisma } = (await import("@/lib/core/db")) as Any;
const P = prisma as Any;
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const hr = (await import("@/lib/modules/hr/service")) as Any;
const pay = (await import("@/lib/modules/hr/payroll")) as Any;
const privacy = (await import("@/lib/modules/hr/privacy" as string)) as Any;
const digestMod = (await import("@/lib/modules/hr/payroll-digest" as string)) as Any;
const coreHash = (await import("@/lib/core/hash" as string)) as Any;
const coreOutbox = (await import("@/lib/core/outbox" as string)) as Any;
const loadOpt = async (file: string, spec: string) =>
  existsSync(join(ROOT, file)) ? ((await import(spec).catch((e: unknown) => ({ __err: errText(e) }))) as Any) : null;
const rMod = await loadOpt(ROSTER, "@/lib/modules/hr/roster");
const rrMod = await loadOpt(ROSTER_RULES, "@/lib/modules/hr/roster-rules");
const stMod = await loadOpt(SETTINGS, "@/lib/modules/hr/settings");
const scopeMod = await loadOpt(SCOPE_FILE, "@/lib/modules/hr/scope");
const OBX = (await import("@/lib/outbox-consumers" as string).catch((e: unknown) => ({ __err: errText(e) }))) as Any;
const CONS: Any = OBX?.consumers ?? {};
const autoLabels = (await import("@/lib/automation/labels" as string).catch(() => null)) as Any;
const hookLabels = (await import("@/lib/webhooks/labels" as string).catch(() => null)) as Any;
const modState = (m: Any, f: string) => (m === null ? `∅ ${f}` : m.__err ? `import error ${m.__err}` : "loaded");
console.log(`[${SUITE}] modules: roster=${modState(rMod, ROSTER)} · roster-rules=${modState(rrMod, ROSTER_RULES)} · settings=${modState(stMod, SETTINGS)} · consumers=${OBX?.__err ? OBX.__err : "loaded"}`);

const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const SLUG = `${SLUG_PREFIX}${stamp}`;
const tenants: string[] = [];
const users: string[] = [];
const names: string[] = []; // every person / employee / unit name we create (leak checks)
const FIX_TS = new Date("2030-01-01T00:00:00Z");

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
type EmpOpts = { linkedUserId?: string | null; unitId?: string | null; code?: string; startDate?: string; endDate?: string; position?: string; status?: string; active?: boolean };
async function mkEmp(tenantId: string, systemId: string, name: string, o: EmpOpts = {}): Promise<string> {
  const e = await P.hrEmployee.create({
    data: {
      tenantId,
      systemId,
      name,
      linkedUserId: o.linkedUserId ?? null,
      code: o.code ?? null,
      position: o.position ?? null,
      startDate: o.startDate ? dbDate(o.startDate) : null,
      ...(o.endDate ? { endDate: dbDate(o.endDate) } : {}),
      ...(o.unitId ? { unitId: o.unitId } : {}),
      ...(o.status ? { employmentStatus: o.status } : {}),
      ...(o.active === false ? { active: false } : {}),
    },
  });
  names.push(name);
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
async function rawRows(sql: string, ...params: unknown[]): Promise<Any[] | null> {
  try {
    return (await P.$queryRawUnsafe(sql, ...params)) as Any[];
  } catch {
    return null;
  }
}

// ── roster service calls (module absent / function missing ⇒ ok false "∅…" — RED for the right reason) ──
type RO = { ok: boolean; text: string; value: Any };
let MAIN_T = "";
const okCounts: Record<string, number> = {};
const okEffect: Record<string, number> = {}; // generate/copy with created > 0 · publish with published > 0
async function ro(fn: string, ...args: unknown[]): Promise<RO> {
  const M = rMod && !rMod.__err ? rMod : null;
  if (typeof M?.[fn] !== "function") return { ok: false, text: `∅${fn} (${modState(rMod, ROSTER)})`, value: undefined };
  try {
    const v = (await M[fn](...args)) as Any;
    const ok = !!v && typeof v === "object" && v.ok !== false && v.status !== "error";
    if (ok && (args[0] as Any)?.tenantId === MAIN_T) {
      okCounts[fn] = (okCounts[fn] ?? 0) + 1;
      if ((fn === "generateFromTemplate" || fn === "copyWeek") && Number(v.created) > 0) okEffect[fn] = (okEffect[fn] ?? 0) + 1;
      if (fn === "publishRoster" && Number(v.published) > 0) okEffect[fn] = (okEffect[fn] ?? 0) + 1;
    }
    return { ok, text: ok ? "" : textOf(v), value: v };
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : String(e), value: undefined };
  }
}
/** reader call (no viewer) — value or error text */
async function rdr(fn: string, arg: Record<string, unknown>): Promise<{ v: Any; err: string }> {
  const M = rMod && !rMod.__err ? rMod : null;
  if (typeof M?.[fn] !== "function") return { v: null, err: `∅${fn} (${modState(rMod, ROSTER)})` };
  try {
    return { v: await M[fn](arg), err: "" };
  } catch (e) {
    return { v: null, err: errText(e) };
  }
}
const entriesOf = (v: Any): Any[] | null => (Array.isArray(v) ? v : Array.isArray(v?.entries) ? v.entries : null);
const eid = (e: Any): string => String(e?.entryId ?? e?.id ?? "");
const skippedOf = (r: RO): Any[] => (Array.isArray(r.value?.skipped) ? r.value.skipped : []);
const hasSkip = (r: RO, reason: string, employeeId?: string, date?: string) => skippedOf(r).some((s) => s?.reason === reason && (!employeeId || s?.employeeId === employeeId) && (!date || dk(s?.date) === date));
const refusals: { label: string; text: string }[] = [];
const noteRefusal = (label: string, r: RO) => {
  if (!r.ok) refusals.push({ label, text: r.text });
  return r;
};

// ═════════════════════════ main ═════════════════════════
let tail = null as { T: string } | null;
async function runDb(): Promise<void> {
  // ── tenants / units / systems ──
  const T = await newTenant("", "QC HR H2.1 ตารางกะ");
  MAIN_T = T;
  tail = { T };
  const TD = await newTenant("-d", "QC HR H2.1 ดิจิสต์");
  const T2 = await newTenant("-other", "QC HR H2.1 ร้านอื่น");
  const T3 = await newTenant("-nohr", "QC HR H2.1 ไม่มีระบบพนักงาน");
  const u1 = await newUnit(T, `สาขาเหนือ ${stamp}`, "u1");
  const u2 = await newUnit(T, `สาขาใต้ ${stamp}`, "u2");
  const du1 = await newUnit(TD, `ดีสาขาเหนือ ${stamp}`, "du1");
  const du2 = await newUnit(TD, `ดีสาขาใต้ ${stamp}`, "du2");
  const sA = await sysSvc.createSystem(T, "HR", "ทีมงาน A");
  await sleep(30);
  const sys2 = await sysSvc.createSystem(T, "HR", "ทีมงาน สอง");
  const sD = await sysSvc.createSystem(TD, "HR", "ทีมดิจิสต์");
  await sleep(30);
  const sM = await sysSvc.createSystem(TD, "HR", "ทีมเงินเดือนรายเดือน");
  await sleep(30);
  const sK = await sysSvc.createSystem(TD, "HR", "ทีมลงเวลา");
  const sO = await sysSvc.createSystem(T2, "HR", "ทีมร้านอื่น");
  const ctxA = { tenantId: T, systemId: sA.id };
  const ctxD = { tenantId: TD, systemId: sD.id };
  const ctxK = { tenantId: TD, systemId: sK.id };
  const ctxO = { tenantId: T2, systemId: sO.id };
  const U = {
    owner: await mkUser(T, "owner", `QC เจ้าของ ${stamp}`, "OWNER", [], {}),
    mgrU1: await mkUser(T, "mgru1", `QC ผู้จัดการสาขาเหนือ ${stamp}`, "MANAGER", [u1], { "hr.employee.create": true }),
    mgrU2: await mkUser(T, "mgru2", `QC ผู้จัดการสาขาใต้ ${stamp}`, "MANAGER", [u2], { "hr.employee.create": true }),
    mgrAll: await mkUser(T, "mgrall", `QC ผู้จัดการทุกสาขา ${stamp}`, "MANAGER", ["*"], {}),
    mgrEmpty: await mkUser(T, "mgrempty", `QC ผู้จัดการไม่ระบุสาขา ${stamp}`, "MANAGER", [], { "hr.employee.create": true }),
    staffU1: await mkUser(T, "staffu1", `QC พนักงานเหนือ ${stamp}`, "STAFF", [u1], { "hr.leave.request": true }),
    member: await mkUser(T, "member", `QC สมาชิก ${stamp}`, "STAFF", [], {}),
    other: await mkUser(T2, "other", `QC ร้านอื่น ${stamp}`, "OWNER", [], {}),
  };
  // S8 viewers (tenant -d · same keys as qc-hr-h1.2 so the frozen digests' user labels are identical)
  const UD = {
    owner: await mkUser(TD, "d-owner", `QC ดีเจ้าของ ${stamp}`, "OWNER", [], {}),
    mgrU1: await mkUser(TD, "d-mgru1", `QC ดีผู้จัดการเหนือ ${stamp}`, "MANAGER", [du1], { "hr.employee.create": true }),
    mgrAll: await mkUser(TD, "d-mgrall", `QC ดีผู้จัดการทุกสาขา ${stamp}`, "MANAGER", ["*"], {}),
    staffU1: await mkUser(TD, "d-staffu1", `QC ดีพนักงานเหนือ ${stamp}`, "STAFF", [du1], { "hr.leave.request": true }),
    payAll: await mkUser(TD, "d-payall", `QC ดีเงินเดือน ${stamp}`, "STAFF", ["*"], { "hr.payroll.read": true, "hr.leave.read": true }),
    hrRead: await mkUser(TD, "d-hrread", `QC ดีอ่านลา ${stamp}`, "STAFF", ["*"], { "hr.leave.read": true }),
    member: await mkUser(TD, "d-member", `QC ดีสมาชิก ${stamp}`, "STAFF", [], {}),
    other: U.other,
  };

  // ═══ S8 frozen fixture FIRST (copied from qc-hr-h1.2 S5 — system D of tenant -d) + contradicting published roster rows ═══
  console.log("── [S8] frozen controls (tenant -d) ──");
  const labels = new Map<string, string>([[TD, "T"], [T2, "T2"], [sD.id, "sysD"], [du1, "u1"], [du2, "u2"], ...Object.entries(UD).map(([k, w]) => [w.id, k] as [string, string])]);
  const D1 = await mkEmp(TD, sD.id, "QC-H12 ดีหนึ่ง", { code: "D01", position: "แคชเชียร์", unitId: du1, linkedUserId: UD.staffU1.id, startDate: "2030-01-01" });
  await sleep(15);
  const D2 = await mkEmp(TD, sD.id, "QC-H12 ดีสอง", { code: "D02", position: "บาริสต้า", unitId: du1, startDate: "2030-01-02" });
  await sleep(15);
  const D3 = await mkEmp(TD, sD.id, "QC-H12 ดีสาม", { code: "D03", position: "ครัว", unitId: du1 });
  labels.set(D1, "D01").set(D2, "D02").set(D3, "D03");
  const today = hr.bkkParts(new Date()).dateStr as string; // placement only — never inside an expected value
  {
    // published roster rows that contradict "no template" (incl. today) — clock() must keep judging NO_SCHEDULE
    const shD = await P.hrShift.create({ data: { tenantId: TD, systemId: sD.id, name: "กะดีเช้า", startMin: 420, endMin: 900 } });
    for (const [emp, day] of [[D1, today], [D2, today], [D1, "2030-03-04"], [D2, "2030-03-05"], [D3, "2030-03-04"], [D1, "2030-03-12"]] as [string, string][]) {
      await P.hrRosterEntry.create({ data: { tenantId: TD, systemId: sD.id, employeeId: emp, date: dbDate(day), shiftId: shD.id, unitId: du1, startMin: 420, endMin: 900, breakMin: 0, crossesMidnight: false, published: true, publishedAt: FIX_TS, source: "MANUAL" } });
    }
  }
  const attIds: string[] = [];
  const leaveIds: string[] = [];
  let s8Error = "";
  try {
    const c1 = await hr.clock(ctxD, { employeeId: D1, kind: "IN" });
    const c2 = await hr.clock(ctxD, { employeeId: D1, kind: "OUT" });
    const c3 = await hr.clock(ctxD, { employeeId: D2, kind: "IN" });
    const c4 = await hr.clock(ctxD, { employeeId: D3, kind: "IN" });
    const pin: [Any, string][] = [[c1, "2030-03-04T01:55:00Z"], [c2, "2030-03-04T10:05:00Z"], [c3, "2030-03-05T02:20:00Z"], [c4, "2030-03-04T03:00:00Z"]];
    for (const [c, at] of pin) {
      await P.hrAttendance.update({ where: { id: c.id }, data: { at: new Date(at) } });
      attIds.push(c.id);
    }
    for (const [kind, at, judgement, dueMin, lateMin] of [
      ["IN", "2030-03-06T00:10:00Z", "ON_TIME", 420, 0],
      ["IN", "2030-03-07T00:40:00Z", "LATE", 420, 40],
      ["OUT", "2030-03-07T09:00:00Z", null, null, null],
    ] as [string, string, string | null, number | null, number | null][]) {
      const r = await P.hrAttendance.create({ data: { tenantId: TD, systemId: sD.id, employeeId: D2, kind, at: new Date(at), note: kind === "OUT" ? "ออกตามเวลา" : null, judgement, dueMin, lateMin } });
      attIds.push(r.id);
    }
    attIds.forEach((id, i) => labels.set(id, `AT${i + 1}`));
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
    await hr.decideLeave(ctxD, leaveIds[0], "APPROVED", UD.owner.id);
    await hr.decideLeave(ctxD, leaveIds[2], "REJECTED", UD.owner.id);
    await P.hrEmployee.update({ where: { id: D3 }, data: { active: false } });
  } catch (e) {
    s8Error = errText(e);
    console.log(`  ⚠ S8 fixture: ${s8Error}`);
  }
  const TS_KEYS = new Set(["createdAt", "updatedAt", "pinSetAt"]);
  const normJson = (v: unknown): string => {
    const s = JSON.stringify(v, function (k, val) {
      if (PRIOR_WO_KEYS.has(k)) return undefined;
      if (TS_KEYS.has(k)) return val == null ? null : "<ts>";
      if (val instanceof Set) return [...val].map((x) => labels.get(String(x)) ?? String(x)).sort();
      if (typeof val === "string" && labels.has(val)) return labels.get(val);
      return val;
    });
    return s ?? "undefined";
  };
  const dig = async (id: string, f: () => Promise<unknown>) => {
    let d = "∅";
    try {
      d = sha(normJson(await f()));
    } catch (e) {
      d = `THROW ${errText(e)}`;
    }
    const want = FROZEN_S8[id] ?? "∅";
    console.log(`  ℹ ${id} digest=${d}`);
    chk(id, !s8Error && d === want, want.slice(0, 16), `${d.slice(0, 16)}${s8Error ? ` (fixture: ${s8Error.slice(0, 60)})` : ""}`);
  };
  await dig("S8.1", () => hr.listAttendance(ctxD, 50));
  await dig("S8.2", async () => ({ list: await hr.listLeaves(ctxD, 100), pending: await hr.pendingLeaves(ctxD, 100) }));
  await dig("S8.3", async () => ({
    owner: await privacy.leaveItemsForViewer(ctxD, vOf(UD.owner)),
    mgrU1: await privacy.leaveItemsForViewer(ctxD, vOf(UD.mgrU1)),
    staffU1: await privacy.leaveItemsForViewer(ctxD, vOf(UD.staffU1)),
  }));
  await dig("S8.4", async () => {
    const out: Record<string, unknown> = {};
    for (const [k, id] of [["D01", D1], ["D02", D2], ["D03", D3]]) out[k] = await hr.monthlyAttendance(ctxD, id, new Date("2030-03-01T00:00:00Z"));
    return out;
  });
  await dig("S8.5", async () => ({
    unavail0304: await hr.employeesUnavailable(ctxD, [D1, D2, D3], new Date("2030-03-04T05:00:00Z")),
    unavail0320: await hr.employeesUnavailable(ctxD, [D1, D2, D3], new Date("2030-03-20T05:00:00Z")),
    onLeave0304: await hr.isOnLeave(TD, UD.staffU1.id, new Date("2030-03-04T03:00:00Z")),
    onLeave0320: await hr.isOnLeave(TD, UD.staffU1.id, new Date("2030-03-20T03:00:00Z")),
    kiosk: await hr.kioskRoster(ctxD),
  }));
  // S8.6 MONTHLY fixture — verbatim from qc-hr-h1.1 S6.5 / qc-hr-h1.2 S5.6
  {
    const ctxM = { tenantId: TD, systemId: sM.id };
    const codeOf = new Map<string, string>();
    const empOf = new Map<string, string>();
    for (const m of MONTHLY_FIXTURE.employees) {
      const id = await mkEmp(TD, sM.id, `พนง-${m.code} ${stamp}`, { code: m.code, ...(m.start ? { startDate: m.start } : {}) });
      codeOf.set(id, m.code);
      empOf.set(m.code, id);
      await pay.setSalaryProfile(ctxM, { employeeId: id, baseSalarySatang: m.base, ssoEligible: m.sso, deductions: { spouse: m.spouse, children: m.children } });
    }
    for (const a of MONTHLY_FIXTURE.adjustments) {
      await P.hrPayAdjustment.create({ data: { tenantId: TD, systemId: sM.id, employeeId: empOf.get(a.code)!, periodKey: MONTHLY_FIXTURE.period, kind: a.kind, amountSatang: a.amount, status: "APPROVED", note: `QC ${a.kind}` } });
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
    console.log(`  ℹ S8.6 MONTHLY fixture computed: digest=${digest} totals=${totals} flags=${flags}`);
    chk("S8.6", digest === FROZEN_MONTHLY_DIGEST && totals === FROZEN_MONTHLY_TOTALS && flags === FROZEN_MONTHLY_FLAGS, `${FROZEN_MONTHLY_DIGEST.slice(0, 16)} · ${FROZEN_MONTHLY_TOTALS} · ${FROZEN_MONTHLY_FLAGS}`, `${digest.slice(0, 16)} · ${totals} · ${flags}`);
  }
  // S8.8 clock() judgement control — template every weekday · published roster rows today that say otherwise
  {
    const K1 = await mkEmp(TD, sK.id, `QC-H21 เคหนึ่ง ${stamp}`, { unitId: du1 });
    const K2 = await mkEmp(TD, sK.id, `QC-H21 เคสอง ${stamp}`, { unitId: du1 });
    const K3 = await mkEmp(TD, sK.id, `QC-H21 เคสาม ${stamp}`, { unitId: du1 });
    const shK = await P.hrShift.create({ data: { tenantId: TD, systemId: sK.id, name: "กะเคเช้า", startMin: 420, endMin: 900 } });
    for (let wd = 0; wd < 7; wd++) {
      await P.hrWorkSchedule.create({ data: { tenantId: TD, systemId: sK.id, employeeId: K1, weekday: wd, dayOff: true } });
      await P.hrWorkSchedule.create({ data: { tenantId: TD, systemId: sK.id, employeeId: K2, weekday: wd, dayOff: false, startMin: 0, endMin: 1440, graceMin: 1440 } });
    }
    for (const emp of [K1, K2, K3]) {
      for (const day of [today, addDay(today, -1), addDay(today, 1)]) {
        await P.hrRosterEntry.create({ data: { tenantId: TD, systemId: sK.id, employeeId: emp, date: dbDate(day), shiftId: shK.id, unitId: du1, startMin: 420, endMin: 900, breakMin: 0, crossesMidnight: false, published: true, publishedAt: FIX_TS, source: "MANUAL" } });
      }
    }
    const out: string[] = [];
    try {
      for (const [k, id] of [["K1", K1], ["K2", K2], ["K3", K3]] as [string, string][]) {
        const c = await hr.clock(ctxK, { employeeId: id, kind: "IN" });
        const row = (await P.hrAttendance.findUnique({ where: { id: c.id } })) as Any;
        out.push(`${k}=${row?.judgement ?? "∅"}:${row?.dueMin ?? "-"}:${row?.lateMin ?? "-"}`);
      }
    } catch (e) {
      out.push(`THROW ${errText(e)}`);
    }
    const got = out.join("|");
    chk("S8.8", got === FROZEN_CLOCK, FROZEN_CLOCK, got);
  }
  // S8.9 privacy matrix — verbatim from qc-hr-h1.2 S6.1 (system D)
  {
    const BASE_PROFILE = ["id", "name", "nickname", "code", "phone", "email", "gender", "birthDate", "maritalStatus", "position", "department", "employmentType", "startDate", "endDate", "addressLine", "subdistrict", "district", "province", "postcode", "emergencyName", "emergencyPhone", "emergencyRelation", "note", "active", "hasPin"];
    const SENS6 = ["nationalId", "ssoNumber", "houseRegAddress", "bankName", "bankAccountNo", "bankAccountName"];
    const H11_PROFILE = ["unitId", "unitName", "employmentStatus", "probationEndAt", "contractEndAt"];
    const LEAVE6 = ["id", "employeeName", "type", "fromDate", "toDate", "status"];
    const M: [string, Who, Any, "null" | "base" | "sens", boolean, boolean][] = [
      ["owner", UD.owner, ctxD, "sens", true, false],
      ["payroll", UD.payAll, ctxD, "sens", true, false],
      ["managerU1", UD.mgrU1, ctxD, "base", true, false],
      ["hrRead", UD.hrRead, ctxD, "base", true, false],
      ["member", UD.member, ctxD, "null", false, true],
      ["self", UD.staffU1, ctxD, "null", false, false],
      ["otherTenant", UD.other, { tenantId: T2, systemId: sD.id }, "null", false, true],
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
      if (tag === "otherTenant" ? items.length !== 0 : !emptyOk && srt(keys) !== srt(want) && !(srt([...keys].filter((k) => k !== "filedBy")) === srt(want))) bad.push(`${tag}:leaveKeys=${srt(keys)}`);
      const h12 = [...(pk ?? []), ...keys].filter((k) => H12_NEW_KEYS.includes(k));
      if (h12.length) bad.push(`${tag}:H1.2 keys ${h12.join("+")}`);
      if ((p?.docs ?? []).length) bad.push(`${tag}:docs`);
    }
    chk("S8.9", bad.length === 0, "7 viewers as base", bad.join(" ") || "7 viewers ok");
  }

  // ═══ main tenant fixture (system A) ═══
  console.log("── fixture (main tenant) ──");
  const E = {
    e1: await mkEmp(T, sA.id, `พนง-หนึ่ง ${stamp}`, { unitId: u1, linkedUserId: U.staffU1.id, status: "ACTIVE" }),
    e2: await mkEmp(T, sA.id, `พนง-สอง ${stamp}`, { unitId: u2, status: "ACTIVE" }),
    e3: await mkEmp(T, sA.id, `พนง-สาม ${stamp}`, { status: "ACTIVE" }),
    e4: await mkEmp(T, sA.id, `พนง-สี่ ${stamp}`, { unitId: u2, status: "ACTIVE" }),
    e5: await mkEmp(T, sA.id, `พนง-ห้า ${stamp}`, { unitId: u1, status: "ENDED", active: false, endDate: "2030-02-28" }),
    e6: await mkEmp(T, sA.id, `พนง-หก ${stamp}`, { unitId: u1, status: "PROBATION" }),
    e7: await mkEmp(T, sA.id, `พนง-เจ็ด ${stamp}`, { unitId: u1, status: "ACTIVE", startDate: "2030-03-07" }),
    eS: await mkEmp(T, sys2.id, `พนง-ระบบสอง ${stamp}`, { unitId: u1, status: "ACTIVE" }),
    eX: await mkEmp(T2, sO.id, `พนง-ร้านอื่น ${stamp}`, { status: "ACTIVE" }),
  };
  const empIds = new Set(Object.values(E));
  await P.hrEmployeeUnit.create({ data: { tenantId: T, systemId: sA.id, employeeId: E.e4, unitId: u1, fromDate: dbDate("2030-03-04"), toDate: dbDate("2030-03-10") } });
  type ShiftT = { startMin: number; endMin: number; breakMin: number; crossesMidnight: boolean };
  const SH: Record<string, ShiftT> = {};
  const mkShift = async (systemId: string, tenantId: string, name: string, unitId: string | null, startMin: number, endMin: number, o: { breakMin?: number; sortOrder?: number; active?: boolean } = {}) => {
    const crossesMidnight = endMin < startMin;
    const s = await P.hrShift.create({ data: { tenantId, systemId, unitId, name, startMin, endMin, breakMin: o.breakMin ?? 0, crossesMidnight, sortOrder: o.sortOrder ?? 0, active: o.active ?? true } });
    SH[s.id] = { startMin, endMin, breakMin: o.breakMin ?? 0, crossesMidnight };
    return s.id as string;
  };
  const S = {
    m: await mkShift(sA.id, T, "กะเช้า", null, 420, 900),
    x: await mkShift(sA.id, T, "กะเช้าเก่า", null, 420, 900, { sortOrder: -1, active: false }),
    a: await mkShift(sA.id, T, "กะบ่ายเหนือ", u1, 720, 1200, { sortOrder: 5 }),
    a0: await mkShift(sA.id, T, "กะบ่ายทั้งร้าน", null, 720, 1200, { sortOrder: -5 }),
    c: await mkShift(sA.id, T, "กะปิด", null, 900, 1380, { breakMin: 30 }),
    u2: await mkShift(sA.id, T, "กะใต้", u2, 480, 960),
    n: await mkShift(sA.id, T, "กะดึก", null, 1320, 360),
    e: await mkShift(sA.id, T, "กะเช้ามืด", null, 360, 840),
    r: await mkShift(sA.id, T, "กะสาย", null, 600, 1080),
    z: await mkShift(sA.id, T, "กะชั่วคราว", null, 480, 720),
    s2: await mkShift(sys2.id, T, "กะระบบสอง", null, 420, 900),
    o: await mkShift(sO.id, T2, "กะร้านอื่น", null, 420, 900),
  };
  const shiftCount0 = await P.hrShift.count({ where: { tenantId: T } });
  // templates (weekday 0 = Sunday)
  const tpl = async (emp: string, rows: [number, number, number][], off: number[] = []) => {
    for (const [wd, s, e] of rows) await P.hrWorkSchedule.create({ data: { tenantId: T, systemId: sA.id, employeeId: emp, weekday: wd, dayOff: false, startMin: s, endMin: e, graceMin: 15 } });
    for (const wd of off) await P.hrWorkSchedule.create({ data: { tenantId: T, systemId: sA.id, employeeId: emp, weekday: wd, dayOff: true } });
  };
  await tpl(E.e1, [[0, 420, 900], [1, 420, 900], [2, 420, 900], [3, 720, 1200], [4, 420, 900], [5, 420, 900], [6, 420, 900]]);
  await tpl(E.e2, [[1, 480, 960], [2, 720, 1200], [5, 420, 900], [6, 420, 900]], [3]);
  await tpl(E.e4, [0, 1, 2, 3, 4, 5, 6].map((wd) => [wd, 720, 1200] as [number, number, number]));
  await tpl(E.e5, [[1, 420, 900]]);
  await tpl(E.e6, [[1, 540, 1080], [2, 420, 900], [3, 420, 900], [4, 420, 900]]);
  await tpl(E.e7, [0, 1, 2, 3, 4, 5, 6].map((wd) => [wd, 420, 900] as [number, number, number]));
  // holidays · leaves
  await P.hrHoliday.create({ data: { tenantId: T, systemId: sA.id, unitId: null, date: dbDate("2030-03-12"), name: "วันหยุดร้านปิด", kind: "SHOP", shopOpen: false } });
  await P.hrHoliday.create({ data: { tenantId: T, systemId: sA.id, unitId: u1, date: dbDate("2030-03-13"), name: "วันหยุดสาขาเหนือเปิด", kind: "PUBLIC", shopOpen: true } });
  const leave = (emp: string, day: string, status: string) => P.hrLeave.create({ data: { tenantId: T, systemId: sA.id, employeeId: emp, type: "PERSONAL", fromDate: dbDate(day), toDate: dbDate(day), status, reason: "ธุระส่วนตัวลับ" } });
  await leave(E.e1, "2030-03-06", "APPROVED");
  await leave(E.e2, "2030-03-04", "PENDING");
  await leave(E.e6, "2030-03-14", "APPROVED");
  // raw entries (Prisma delegate — not through the service under test)
  const rawEntry = async (o: { employeeId: string; date: string; shiftId: string; unitId?: string | null; source?: string; published?: boolean; times?: [number, number, number]; systemId?: string; tenantId?: string }): Promise<string> => {
    const s = SH[o.shiftId]!;
    const [startMin, endMin, breakMin] = o.times ?? [s.startMin, s.endMin, s.breakMin];
    const r = await P.hrRosterEntry.create({
      data: {
        tenantId: o.tenantId ?? T,
        systemId: o.systemId ?? sA.id,
        employeeId: o.employeeId,
        date: dbDate(o.date),
        shiftId: o.shiftId,
        unitId: o.unitId === undefined ? null : o.unitId,
        startMin,
        endMin,
        breakMin,
        crossesMidnight: endMin < startMin,
        published: !!o.published,
        publishedAt: o.published ? FIX_TS : null,
        source: o.source ?? "MANUAL",
      },
    });
    return r.id as string;
  };
  const R = {
    e1Manual: await rawEntry({ employeeId: E.e1, date: "2030-03-05", shiftId: S.c, unitId: u1 }),
    e6Ai: await rawEntry({ employeeId: E.e6, date: "2030-03-06", shiftId: S.m, unitId: u1, source: "AI" }),
    e5Pub: await rawEntry({ employeeId: E.e5, date: "2030-03-07", shiftId: S.m, unitId: u1, published: true }),
    e3Manual: await rawEntry({ employeeId: E.e3, date: "2030-03-07", shiftId: S.r, unitId: null }),
    e2Temp: await rawEntry({ employeeId: E.e2, date: "2030-03-07", shiftId: S.z, unitId: u2 }),
    sys2Pub: await rawEntry({ employeeId: E.eS, date: "2030-03-05", shiftId: S.s2, unitId: u1, published: true, systemId: sys2.id }),
    other: await rawEntry({ employeeId: E.eX, date: "2030-04-02", shiftId: S.o, unitId: null, systemId: sO.id, tenantId: T2 }),
  };
  const rowsA = async (from: string, to: string): Promise<Any[]> =>
    (await P.hrRosterEntry.findMany({ where: { tenantId: T, systemId: sA.id, date: { gte: dbDate(from), lte: dbDate(to) } }, orderBy: [{ date: "asc" }, { employeeId: "asc" }] })) as Any[];
  const row = async (id: string): Promise<Any | null> => (id ? ((await P.hrRosterEntry.findUnique({ where: { id } })) as Any) : null);
  const snapOk = (r: Any, shiftId: string) => {
    const s = SH[shiftId];
    return !!r && !!s && r.startMin === s.startMin && r.endMin === s.endMin && r.breakMin === s.breakMin && r.crossesMidnight === s.crossesMidnight;
  };
  const sig = (rs: Any[]) => rs.map((r) => `${r.id}:${r.shiftId}:${r.startMin}-${r.endMin}:${r.published}:${r.publishedAt ? isoOf(r.publishedAt) : "-"}:${isoOf(r.updatedAt)}`).sort().join("|");
  const auditsOf = async (prefix: string): Promise<Any[]> => (await P.auditLog.findMany({ where: { tenantId: T, action: { startsWith: prefix } }, orderBy: { createdAt: "asc" } })) as Any[];
  const eventsOf = async (): Promise<Any[]> => (await P.outboxEvent.findMany({ where: { tenantId: T, type: EVENT }, orderBy: { createdAt: "asc" } })) as Any[];
  const containsAny = (s: string, list: string[]) => list.some((x) => x && s.includes(x));
  const empNames = names.filter((n) => n.startsWith("พนง"));

  // ═══ S8.10 H1.2 settings behaviour (control) ═══
  {
    const scope = typeof scopeMod?.hrScopeOf === "function" ? scopeMod.hrScopeOf(vOf(U.mgrU1)) : { unitIds: [u1] };
    let ids: string[] = [];
    let listErr = "";
    try {
      const l = (await stMod?.listShifts?.(ctxA, { scope })) as Any;
      ids = (Array.isArray(l) ? l : (l?.rows ?? [])).map((x: Any) => x.id as string);
    } catch (e) {
      listErr = errText(e);
    }
    let dup: Any = null;
    try {
      dup = await stMod?.createShift?.(ctxA, vOf(U.owner), { name: "กะเช้า", unitId: null, startMin: 480, endMin: 960, breakMin: 0, graceMin: 15, crossesMidnight: false, colour: null, sortOrder: 0 });
    } catch (e) {
      dup = { ok: false, reason: errText(e) };
    }
    const must = [S.m, S.a, S.a0, S.c, S.n];
    const r = { list: !listErr && must.every((x) => ids.includes(x)), noU2: !ids.includes(S.u2), noArchived: !ids.includes(S.x), noSys2: !ids.includes(S.s2), dup: dup?.ok === false && dup?.reason === T_SETTINGS_DUP };
    chk("S8.10", Object.values(r).every(Boolean), "shop-wide + u1 only · archived/u2/sys2 out · dup text", `${failedKeys(r)} n=${ids.length}${listErr ? ` err=${listErr}` : ""} dup=${short(dup, 60)}`);
  }

  // ═══ S4 pure vectors ═══
  console.log("── [S4] rule vectors (pure) ──");
  {
    const RR = rrMod && !rrMod.__err ? rrMod : null;
    const W = (entries: Any[]): Any[] | null => {
      try {
        const out = typeof RR?.rosterWarnings === "function" ? RR.rosterWarnings(entries, RR.ROSTER_RULE_DEFAULTS) : null;
        return Array.isArray(out) ? out : null;
      } catch (e) {
        console.log(`  ⚠ rosterWarnings threw: ${errText(e)}`);
        return null;
      }
    };
    let n = 0;
    const En = (date: string, s: number, e: number, brk = 0, emp = "P1") => ({ id: `v${++n}`, employeeId: emp, date, startMin: s, endMin: e, breakMin: brk, crossesMidnight: e < s });
    const find = (ws: Any[] | null, rule: string, pred: (w: Any) => boolean = () => true) => (ws ?? []).filter((w) => w?.rule === rule && pred(w));
    const ids = (w: Any) => srt((w?.entryIds ?? []) as string[]);
    const st = (ws: Any[] | null) => (ws ? short(ws.map((w) => `${w.rule}:${dk(w.day ?? w.weekStart)}:${w.valueMin ?? ""}`), 120) : `∅ (${modState(rrMod, ROSTER_RULES)})`);
    {
      const a = W([En("2030-03-04", 420, 1020)]);
      const bE = En("2030-03-04", 420, 1035);
      const b = W([bE]);
      const hit = find(b, "MAX_DAY");
      chk("S4.1", !!a && !!b && find(a, "MAX_DAY").length === 0 && hit.length === 1 && hit[0].valueMin === 615 && hit[0].limitMin === 600 && dk(hit[0].day) === "2030-03-04" && ids(hit[0]) === bE.id, "none · MAX_DAY 615/600", `10h=${st(a)} 10.25h=${st(b)}`);
    }
    {
      const x = En("2030-03-04", 420, 720);
      const y = En("2030-03-04", 780, 1140);
      const ws = W([x, y]);
      const hit = find(ws, "MAX_DAY");
      chk("S4.2", hit.length === 1 && hit[0].valueMin === 660 && ids(hit[0]) === srt([x.id, y.id]), "MAX_DAY 660 both ids", st(ws));
    }
    {
      const x = En("2030-03-04", 900, 1380);
      const y = En("2030-03-05", 420, 900);
      const ws = W([x, y]);
      const hit = find(ws, "REST");
      chk("S4.3", hit.length === 1 && ids(hit[0]) === srt([x.id, y.id]) && find(ws, "OVERLAP").length === 0, "REST (8 h) both ids", st(ws));
    }
    {
      const a = W([En("2030-03-04", 1320, 360), En("2030-03-05", 900, 1380)]);
      const b = W([En("2030-03-04", 1320, 360), En("2030-03-05", 1020, 1380)]);
      chk("S4.4", find(a, "REST").length === 1 && !!b && find(b, "REST").length === 0, "9 h ⇒ REST · 11 h ⇒ none", `9h=${st(a)} 11h=${st(b)}`);
    }
    {
      const x = En("2030-03-04", 420, 900);
      const y = En("2030-03-04", 720, 1200);
      const ws = W([x, y]);
      const ov = find(ws, "OVERLAP");
      chk("S4.5", ov.length === 1 && ids(ov[0]) === srt([x.id, y.id]) && find(ws, "REST", (w) => ids(w) === srt([x.id, y.id])).length === 0, "OVERLAP · no REST for the pair", st(ws));
    }
    const days = (from: string, k: number, s = 420, e = 900, emp = "P1") => Array.from({ length: k }, (_, i) => En(addDay(from, i), s, e, 0, emp));
    {
      const a = W(days("2030-03-04", 7));
      const b = W(days("2030-03-04", 6));
      const hit = find(a, "DAY_OFF");
      chk("S4.6", hit.length === 1 && dk(hit[0].weekStart ?? hit[0].day) === "2030-03-04" && !!b && find(b, "DAY_OFF").length === 0, "7 ⇒ DAY_OFF 03-04 · 6 ⇒ none", `7=${st(a)} 6=${st(b)}`);
    }
    {
      const x = En("2030-03-10", 1320, 360);
      const y = En("2030-03-11", 420, 900);
      const a = W([x, y]);
      const b = W([...days("2030-03-04", 6), En("2030-03-11", 360, 600), ...days("2030-03-12", 6)]);
      const dOff = find(b, "DAY_OFF");
      chk("S4.7", find(a, "REST", (w) => ids(w) === srt([x.id, y.id])).length === 1 && dOff.length === 1 && dk(dOff[0].weekStart ?? dOff[0].day) === "2030-03-11", "REST across weeks · one DAY_OFF 03-11", `rest=${st(a)} dayoff=${st(b)}`);
    }
    {
      const a = W(days("2030-03-04", 7));
      const b = W(days("2030-03-04", 6));
      const hit = find(a, "MAX_WEEK");
      chk("S4.8", hit.length === 1 && hit[0].valueMin === 3360 && hit[0].limitMin === 2880 && dk(hit[0].weekStart ?? hit[0].day) === "2030-03-04" && !!b && find(b, "MAX_WEEK").length === 0, "56 h ⇒ MAX_WEEK 3360 · 48 h ⇒ none", `56=${st(a)} 48=${st(b)}`);
    }
    {
      const a = W([En("2030-03-05", 780, 1260), En("2030-03-05", 1320, 360)]);
      const b = W([...days("2030-03-04", 6), En("2030-03-10", 1320, 360)]);
      const d5 = find(a, "MAX_DAY", (w) => dk(w.day) === "2030-03-05");
      const d6 = find(a, "MAX_DAY", (w) => dk(w.day) === "2030-03-06");
      const wk = find(b, "MAX_WEEK");
      chk("S4.9", d5.length === 1 && d5[0].valueMin === 960 && d6.length === 0 && wk.length === 1 && wk[0].valueMin === 3360 && dk(wk[0].weekStart ?? wk[0].day) === "2030-03-04", "D 960 · D+1 none · week 3360", `day=${st(a)} week=${st(b)}`);
    }
    {
      const dflt = RR?.ROSTER_RULE_DEFAULTS ?? null;
      const texts = RR?.ROSTER_RULE_TEXT ? Object.values(RR.ROSTER_RULE_TEXT as Record<string, string>) : [];
      const r = {
        exists: !!staticNotes.rrExists && !!RR,
        imports: (staticNotes.rrBadImports ?? []).length === 0,
        clock: staticNotes.rrClock === 0,
        defaults: !!dflt && dflt.maxDayMin === 600 && dflt.minRestMin === 660 && dflt.minDaysOffPerWeek === 1 && dflt.maxWeekMin === 2880,
        texts: RULE_TEXTS.every((t) => texts.includes(t)),
      };
      chk("S4.12", Object.values(r).every(Boolean), "pure · defaults · 7 labels", `${failedKeys(r)} (${modState(rrMod, ROSTER_RULES)}) badImports=${(staticNotes.rrBadImports ?? []).join(",") || "0"} clock=${staticNotes.rrClock}`);
    }
  }

  // ═══ S1 generate ═══
  console.log("── [S1] generate from template ──");
  const W1 = ["2030-03-04", "2030-03-10"] as const;
  const EXP: [string, string, string, string | null][] = [
    [E.e1, "2030-03-04", S.m, u1], [E.e1, "2030-03-06", S.a, u1], [E.e1, "2030-03-07", S.m, u1], [E.e1, "2030-03-08", S.m, u1], [E.e1, "2030-03-09", S.m, u1], [E.e1, "2030-03-10", S.m, u1],
    [E.e2, "2030-03-04", S.u2, u2], [E.e2, "2030-03-05", S.a0, u2], [E.e2, "2030-03-08", S.m, u2], [E.e2, "2030-03-09", S.m, u2],
    ...["2030-03-04", "2030-03-05", "2030-03-06", "2030-03-07", "2030-03-08", "2030-03-09", "2030-03-10"].map((d) => [E.e4, d, S.a, u1] as [string, string, string, string | null]),
    [E.e6, "2030-03-05", S.m, u1], [E.e6, "2030-03-07", S.m, u1],
    ...["2030-03-07", "2030-03-08", "2030-03-09", "2030-03-10"].map((d) => [E.e7, d, S.m, u1] as [string, string, string, string | null]),
  ];
  const before1 = await rowsA(W1[0], W1[1]);
  const gen1 = await ro("generateFromTemplate", ctxA, vOf(U.owner), { from: W1[0], to: W1[1] });
  const genAudits1 = await auditsOf("hr.roster.generate");
  const after1 = await rowsA(W1[0], W1[1]);
  const tmpl1 = after1.filter((r) => r.source === "TEMPLATE");
  {
    const bad: string[] = [];
    for (const [emp, day, shiftId, unitId] of EXP) {
      const r = tmpl1.find((x) => x.employeeId === emp && dk(x.date) === day);
      if (!r) bad.push(`${day}:missing`);
      else if (r.shiftId !== shiftId || r.unitId !== unitId || !snapOk(r, shiftId) || r.published !== false || r.publishedAt !== null) bad.push(`${day}:${r.shiftId === shiftId ? "" : "shift "}${r.unitId === unitId ? "" : "unit "}${snapOk(r, shiftId) ? "" : "snap "}${r.published ? "published" : ""}`);
    }
    chk("S1.1", gen1.ok && Number(gen1.value?.created) === 23 && tmpl1.length === 23 && bad.length === 0, "created 23 · 23 rows as expected", `${gen1.ok ? `created=${gen1.value?.created}` : short(gen1.text, 80)} rows=${tmpl1.length} bad=${bad.slice(0, 6).join(" ") || "0"}`);
    const e2None = tmpl1.filter((r) => r.employeeId === E.e2 && ["2030-03-06", "2030-03-07", "2030-03-10"].includes(dk(r.date)));
    chk("S1.2", gen1.ok && tmpl1.length > 0 && e2None.length === 0, "0 TEMPLATE rows for e2 Wed/Thu/Sun", `${gen1.ok ? "" : short(gen1.text, 60)} e2 rows on off days=${e2None.length}`);
    const shiftCount1 = await P.hrShift.count({ where: { tenantId: T } });
    const e6Mon = after1.filter((r) => r.employeeId === E.e6 && dk(r.date) === "2030-03-04");
    const xUsed = after1.some((r) => r.shiftId === S.x);
    chk("S1.3", gen1.ok && hasSkip(gen1, "NO_SHIFT", E.e6, "2030-03-04") && e6Mon.length === 0 && shiftCount1 === shiftCount0 && !xUsed, "NO_SHIFT skip · no row · 0 shifts created · archived twin unused", `skip=${hasSkip(gen1, "NO_SHIFT", E.e6, "2030-03-04")} rows=${e6Mon.length} shifts ${shiftCount0}→${shiftCount1} archivedUsed=${xUsed}`);
    const e5 = tmpl1.filter((r) => r.employeeId === E.e5).length;
    const e6 = tmpl1.filter((r) => r.employeeId === E.e6).length;
    const e7d = tmpl1.filter((r) => r.employeeId === E.e7).map((r) => dk(r.date)).sort().join(",");
    chk("S1.4", gen1.ok && e5 === 0 && e6 === 2 && e7d === "2030-03-07,2030-03-08,2030-03-09,2030-03-10", "e5 0 · e6 2 · e7 03-07…03-10", `e5=${e5} e6=${e6} e7=${e7d || "∅"}`);
  }
  {
    const g0 = await ro("generateFromTemplate", ctxA, vOf(U.owner), { from: "2030-03-01", to: "2030-03-03" });
    const pre = (await rowsA("2030-03-01", "2030-03-03")).filter((r) => r.employeeId === E.e4);
    const inside = tmpl1.filter((r) => r.employeeId === E.e4);
    const r = {
      ok: g0.ok,
      pre: pre.length === 3 && pre.every((x) => x.unitId === u2 && x.shiftId === S.a0),
      inside: inside.length === 7 && inside.every((x) => x.unitId === u1 && x.shiftId === S.a),
    };
    chk("S1.5", Object.values(r).every(Boolean), "borrowed u1 + Sa · before u2 + shop-wide twin", `${failedKeys(r)} pre=${pre.map((x) => `${x.unitId === u2 ? "u2" : x.unitId === u1 ? "u1" : "?"}/${x.shiftId === S.a0 ? "a0" : x.shiftId === S.a ? "a" : "?"}`).join(",") || "∅"} ${g0.ok ? "" : short(g0.text, 60)}`);
  }
  {
    const s0 = sig(after1);
    const gen2 = await ro("generateFromTemplate", ctxA, vOf(U.owner), { from: W1[0], to: W1[1] });
    const s1 = sig(await rowsA(W1[0], W1[1]));
    chk("S1.6", gen1.ok && gen2.ok && Number(gen2.value?.created) === 0 && s0 === s1, "created 0 · rows + updatedAt identical", `${gen2.ok ? `created=${gen2.value?.created}` : short(gen2.text, 60)} identical=${s0 === s1}`);
  }
  {
    const m = await row(R.e1Manual);
    const a = await row(R.e6Ai);
    const pre = before1;
    const same = (id: string, r: Any) => {
      const b = pre.find((x) => x.id === id);
      return !!b && !!r && isoOf(b.updatedAt) === isoOf(r.updatedAt) && b.shiftId === r.shiftId && b.source === r.source;
    };
    const e1d = after1.filter((r) => r.employeeId === E.e1 && dk(r.date) === "2030-03-05").length;
    const e6d = after1.filter((r) => r.employeeId === E.e6 && dk(r.date) === "2030-03-06").length;
    const r = { ok: gen1.ok, manual: same(R.e1Manual, m) && m?.source === "MANUAL", ai: same(R.e6Ai, a) && a?.source === "AI", only: e1d === 1 && e6d === 1, skip: hasSkip(gen1, "EXISTS", E.e1, "2030-03-05") && hasSkip(gen1, "EXISTS", E.e6, "2030-03-06") };
    chk("S1.7", Object.values(r).every(Boolean), "untouched · alone that day · EXISTS", `${failedKeys(r)} rows e1=${e1d} e6=${e6d}`);
  }
  {
    const g = await ro("generateFromTemplate", ctxA, vOf(U.owner), { from: "2030-03-12", to: "2030-03-12" });
    const n12 = (await rowsA("2030-03-12", "2030-03-12")).length;
    const who = [E.e1, E.e2, E.e4, E.e6, E.e7].filter((e) => !hasSkip(g, "HOLIDAY", e, "2030-03-12"));
    chk("S1.8", g.ok && Number(g.value?.created) === 0 && n12 === 0 && who.length === 0, "created 0 · 5 × HOLIDAY · 0 rows", `${g.ok ? `created=${g.value?.created}` : short(g.text, 60)} rows=${n12} missingHolidaySkip=${who.length}`);
  }
  {
    const a = genAudits1;
    const js = a.length ? JSON.stringify({ b: a[0].before, a: a[0].after }) : "";
    const leak = [...empIds].some((id) => js.includes(id)) || containsAny(js, names);
    chk("S1.9", gen1.ok && a.length === 1 && Number(a[0]?.after?.created) === 23 && !leak, "1 row · created 23 · counts only", `audits=${a.length} after=${short(a[0]?.after, 100)} leak=${leak}`);
  }
  {
    const range = { from: "2030-06-01", to: "2030-07-02" };
    const r = [
      noteRefusal("S1.10.gen", await ro("generateFromTemplate", ctxA, vOf(U.owner), range)),
      noteRefusal("S1.10.check", await ro("checkRules", ctxA, vOf(U.owner), range)),
      noteRefusal("S1.10.list", await ro("listRoster", ctxA, vOf(U.owner), range)),
      noteRefusal("S1.10.publish", await ro("publishRoster", ctxA, vOf(U.owner), range)),
    ];
    const ok31 = await ro("listRoster", ctxA, vOf(U.owner), { from: "2030-06-01", to: "2030-07-01" });
    const n = (await rowsA("2030-06-01", "2030-07-02")).length;
    chk("S1.10", typeof rMod?.listRoster === "function" && r.every((x) => !x.ok && isThai(x.text)) && n === 0 && ok31.ok, "4 refusals (Thai) · 0 rows · 31 days ok", `${r.map((x) => (x.ok ? "ACCEPTED" : short(x.text, 24))).join(" | ")} rows=${n} 31d=${ok31.ok ? "ok" : short(ok31.text, 30)}`);
  }
  {
    const g = await ro("generateFromTemplate", ctxA, vOf(U.owner), { from: "2020-01-06", to: "2020-01-12" });
    const n = await P.hrRosterEntry.count({ where: { tenantId: T, date: { lt: dbDate("2021-01-01") } } });
    chk("S1.11", typeof rMod?.generateFromTemplate === "function" && n === 0 && (!g.ok ? isThai(g.text) : Number(g.value?.created) === 0), "0 rows in 2020", `${g.ok ? `ok created=${g.value?.created}` : `refused "${short(g.text, 50)}"`} rows2020=${n}`);
  }

  // ═══ S4.10 DB pass (borrowed e4 · u1 + u2 rows summed) ═══
  console.log("── [S4.10] rule checks over the DB ──");
  const e4g0305 = tmpl1.find((r) => r.employeeId === E.e4 && dk(r.date) === "2030-03-05")?.id ?? "";
  const e4u2 = await rawEntry({ employeeId: E.e4, date: "2030-03-05", shiftId: S.u2, unitId: u2, times: [1230, 1410, 0] });
  {
    const wOf = async (w: Who) => {
      const r = await ro("checkRules", ctxA, vOf(w), { from: W1[0], to: W1[1] });
      return r.ok && Array.isArray(r.value?.warnings) ? (r.value.warnings as Any[]) : null;
    };
    const wo = await wOf(U.owner);
    const w1 = await wOf(U.mgrU1);
    const w2 = await wOf(U.mgrU2);
    const md = (ws: Any[] | null) => (ws ?? []).find((w) => w.rule === "MAX_DAY" && w.employeeId === E.e4 && dk(w.day) === "2030-03-05");
    const u1Only = [E.e1, E.e6, E.e7];
    const r = {
      lists: !!wo && !!w1 && !!w2,
      owner: md(wo)?.valueMin === 660 && srt(md(wo)?.entryIds ?? []) === srt([e4g0305, e4u2]),
      ownerE1: (wo ?? []).some((w) => w.employeeId === E.e1),
      mgrU1: !!md(w1) && srt(md(w1)?.entryIds ?? []) === e4g0305,
      mgrU2: !!md(w2) && srt(md(w2)?.entryIds ?? []) === e4u2,
      mgrU2Hidden: !(w2 ?? []).some((w) => u1Only.includes(w.employeeId)),
    };
    chk("S4.10", Object.values(r).every(Boolean), "summed 660 · per-viewer entry ids · u1-only people hidden from u2", `${failedKeys(r)} owner=${short(md(wo), 80)}`);
  }

  // ═══ S2 manual ops (week 2030-04-01) ═══
  console.log("── [S2] manual ops ──");
  {
    const a = await ro("addEntry", ctxA, vOf(U.owner), { employeeId: E.e1, date: "2030-04-02", shiftId: S.c, note: "QC เพิ่มเอง" });
    const r = await row(a.value?.id ?? "");
    chk("S2.1", a.ok && !!r && r.source === "MANUAL" && snapOk(r, S.c) && r.breakMin === 30 && r.unitId === u1 && r.published === false && r.shiftId === S.c && dk(r.date) === "2030-04-02", "MANUAL · snapshot (break 30) · u1 · unpublished", a.ok ? short(r && { s: r.source, t: `${r.startMin}-${r.endMin}/${r.breakMin}`, u: r.unitId === u1, p: r.published }, 120) : short(a.text, 80));
    S2.add = a.value?.id ?? "";
  }
  {
    const a = await ro("addEntry", ctxA, vOf(U.owner), { employeeId: E.e1, date: "2030-04-03", shiftId: S.e });
    S2.e = a.value?.id ?? "";
    await P.hrShift.update({ where: { id: S.e }, data: { endMin: 780 } });
    const r = await row(S2.e);
    chk("S2.2", a.ok && !!r && r.startMin === 360 && r.endMin === 840, "snapshot 360–840 kept after the shift became 360–780", a.ok ? `${r?.startMin}-${r?.endMin}` : short(a.text, 80));
    SH[S.e] = { ...SH[S.e]!, endMin: 780 };
  }
  {
    const a = await ro("addEntry", ctxA, vOf(U.owner), { employeeId: E.e1, date: "2030-04-04", shiftId: S.n });
    S2.n = a.value?.id ?? "";
    const r = await row(S2.n);
    const l = await ro("listRoster", ctxA, vOf(U.owner), { from: "2030-04-04", to: "2030-04-04" });
    const le = (entriesOf(l.value) ?? []).find((x) => x.id === S2.n);
    chk("S2.3", a.ok && r?.crossesMidnight === true && r?.startMin === 1320 && r?.endMin === 360 && isoOf(le?.window?.start) === "2030-04-04T15:00:00.000Z" && isoOf(le?.window?.end) === "2030-04-04T23:00:00.000Z" && le?.paidMin === 480, "crosses · window 15:00Z–23:00Z · paid 480", a.ok ? `cross=${r?.crossesMidnight} window=${isoOf(le?.window?.start)}–${isoOf(le?.window?.end)} paid=${le?.paidMin}` : short(a.text, 80));
  }
  {
    const d = noteRefusal("S2.4", await ro("addEntry", ctxA, vOf(U.owner), { employeeId: E.e1, date: "2030-04-02", shiftId: S.c }));
    const n = await P.hrRosterEntry.count({ where: { employeeId: E.e1, date: dbDate("2030-04-02"), shiftId: S.c } });
    chk("S2.4", !!S2.add && !d.ok && d.text === T_DUP && n === 1, `"${T_DUP}" · 1 row`, `"${short(d.text, 60)}" rows=${n}`);
  }
  {
    const x = noteRefusal("S2.5.archived", await ro("addEntry", ctxA, vOf(U.owner), { employeeId: E.e1, date: "2030-04-05", shiftId: S.x }));
    const s2 = noteRefusal("S2.5.sys2", await ro("addEntry", ctxA, vOf(U.owner), { employeeId: E.e1, date: "2030-04-05", shiftId: S.s2 }));
    const o = noteRefusal("S2.5.u2", await ro("addEntry", ctxA, vOf(U.owner), { employeeId: E.e1, date: "2030-04-05", shiftId: S.u2 }));
    const n = await P.hrRosterEntry.count({ where: { employeeId: E.e1, date: dbDate("2030-04-05") } });
    chk("S2.5", x.text === T_SHIFT_OFF && s2.text === T_SHIFT_NF && o.text === T_SHIFT_OTHER && !x.ok && !s2.ok && !o.ok && n === 0, "3 fixed texts · 0 rows", `archived="${short(x.text, 40)}" sys2="${short(s2.text, 40)}" u2="${short(o.text, 40)}" rows=${n}`);
  }
  {
    const a = noteRefusal("S2.6.ended", await ro("addEntry", ctxA, vOf(U.owner), { employeeId: E.e5, date: "2030-04-02", shiftId: S.m }));
    const b = noteRefusal("S2.6.employ", await ro("addEntry", ctxA, vOf(U.owner), { employeeId: E.e7, date: "2030-03-05", shiftId: S.m }));
    const n = (await P.hrRosterEntry.count({ where: { employeeId: E.e5, date: dbDate("2030-04-02") } })) + (await P.hrRosterEntry.count({ where: { employeeId: E.e7, date: dbDate("2030-03-05") } }));
    chk("S2.6", !a.ok && a.text === T_ENDED && !b.ok && b.text === T_OUT_EMPLOY && n === 0, "2 fixed texts · 0 rows", `ended="${short(a.text, 40)}" employ="${short(b.text, 40)}" rows=${n}`);
  }
  {
    // (a) e1 published row moved date + shift · (b) e4 borrowed-day row moved out of the borrowing
    if (S2.add) await P.hrRosterEntry.update({ where: { id: S2.add }, data: { published: true, publishedAt: FIX_TS } });
    const m = await ro("moveEntry", ctxA, vOf(U.owner), S2.add || "∅", { date: "2030-04-05", shiftId: S.a });
    const r = await row(S2.add);
    const b0 = await ro("addEntry", ctxA, vOf(U.owner), { employeeId: E.e4, date: "2030-03-08", shiftId: S.c });
    const bId = b0.value?.id ?? "";
    const rb0 = await row(bId);
    const mb = await ro("moveEntry", ctxA, vOf(U.owner), bId || "∅", { date: "2030-04-03" });
    const rb = await row(bId);
    const res = {
      a: m.ok && (m.value?.id ?? S2.add) === S2.add && !!r && dk(r.date) === "2030-04-05" && r.shiftId === S.a && snapOk(r, S.a) && r.published === false && r.source === "MANUAL",
      b: b0.ok && rb0?.unitId === u1 && mb.ok && rb?.id === bId && dk(rb?.date) === "2030-04-03" && rb?.unitId === u2,
    };
    chk("S2.7", Object.values(res).every(Boolean), "in place · re-snapshot · unpublished · unit recomputed", `${failedKeys(res)} a=${m.ok ? short(r && `${dk(r.date)} ${r.startMin}-${r.endMin} p=${r.published}`, 60) : short(m.text, 50)} b=${mb.ok ? `${rb0?.unitId === u1 ? "u1" : "?"}→${rb?.unitId === u2 ? "u2" : rb?.unitId === u1 ? "u1" : "?"}` : short(b0.ok ? mb.text : b0.text, 50)}`);
  }
  {
    if (S2.n) await P.hrRosterEntry.update({ where: { id: S2.n }, data: { published: true, publishedAt: FIX_TS } });
    const r = await ro("removeEntry", ctxA, vOf(U.owner), S2.n || "∅");
    const gone = S2.n ? (await P.hrRosterEntry.count({ where: { id: S2.n } })) === 0 : false;
    const a = (await auditsOf("hr.roster.entry.remove")).find((x) => x.after?.entryId === S2.n || x.targetId === S2.n);
    chk("S2.8", r.ok && gone && a?.after?.wasPublished === true, "gone · audit wasPublished true", `${r.ok ? "" : short(r.text, 50)} gone=${gone} audit=${short(a?.after, 100)}`);
  }
  {
    const past = await rawEntry({ employeeId: E.e1, date: "2020-01-08", shiftId: S.m, unitId: u1 });
    const pre = await row(past);
    const fut = await row(S2.e);
    const a = noteRefusal("S2.9.add", await ro("addEntry", ctxA, vOf(U.owner), { employeeId: E.e1, date: "2020-01-07", shiftId: S.m }));
    const b = noteRefusal("S2.9.moveFrom", await ro("moveEntry", ctxA, vOf(U.owner), past, { date: "2030-04-09" }));
    const c = noteRefusal("S2.9.moveTo", await ro("moveEntry", ctxA, vOf(U.owner), S2.e || "∅", { date: "2020-01-09" }));
    const d = noteRefusal("S2.9.remove", await ro("removeEntry", ctxA, vOf(U.owner), past));
    const post = await row(past);
    const fut2 = await row(S2.e);
    const n2020 = await P.hrRosterEntry.count({ where: { tenantId: T, date: { lt: dbDate("2021-01-01") } } });
    const r = { texts: [a, b, c, d].every((x) => !x.ok && x.text === T_PAST), past: !!post && isoOf(post.updatedAt) === isoOf(pre?.updatedAt) && dk(post.date) === "2020-01-08", fut: !!fut2 && isoOf(fut2.updatedAt) === isoOf(fut?.updatedAt) && dk(fut2.date) === "2030-04-03", n: n2020 === 1 };
    chk("S2.9", typeof rMod?.addEntry === "function" && Object.values(r).every(Boolean), `4 × "${T_PAST}" · nothing changed`, `${failedKeys(r)} ${[a, b, c, d].map((x) => short(x.text, 18)).join(" | ")} rows2020=${n2020}`);
    S2.past = past;
  }
  {
    const a = await ro("addEntry", ctxA, vOf(U.owner), { employeeId: E.e6, date: "2030-04-02", shiftId: S.a, startMin: 840, endMin: 1200 });
    const b = await ro("addEntry", ctxA, vOf(U.owner), { employeeId: E.e6, date: "2030-04-03", shiftId: S.m, startMin: 1320, endMin: 120 });
    const c = noteRefusal("S2.10.equal", await ro("addEntry", ctxA, vOf(U.owner), { employeeId: E.e6, date: "2030-04-04", shiftId: S.m, startMin: 600, endMin: 600 }));
    const ra = await row(a.value?.id ?? "");
    const rb = await row(b.value?.id ?? "");
    const n = await P.hrRosterEntry.count({ where: { employeeId: E.e6, date: dbDate("2030-04-04") } });
    const r = { a: a.ok && ra?.startMin === 840 && ra?.endMin === 1200 && ra?.crossesMidnight === false && ra?.breakMin === 0 && ra?.shiftId === S.a, b: b.ok && rb?.crossesMidnight === true && rb?.startMin === 1320 && rb?.endMin === 120, c: !c.ok && c.text === T_SHIFT_EQUAL && n === 0 };
    chk("S2.10", Object.values(r).every(Boolean), "override stored · crossesMidnight derived · equal refused", `${failedKeys(r)} a=${a.ok ? `${ra?.startMin}-${ra?.endMin}` : short(a.text, 40)} b=${b.ok ? `cross=${rb?.crossesMidnight}` : short(b.text, 40)} c="${short(c.text, 40)}"`);
  }

  // ═══ S3 copy week 03-04 → 03-11 ═══
  console.log("── [S3] copy week ──");
  await P.hrShift.update({ where: { id: S.z }, data: { active: false } });
  await P.hrShift.update({ where: { id: S.r }, data: { endMin: 1140 } });
  SH[S.r] = { ...SH[S.r]!, endMin: 1140 };
  const e2Pre = await rawEntry({ employeeId: E.e2, date: "2030-03-15", shiftId: S.c, unitId: u2 });
  const e2PreRow = await row(e2Pre);
  const src = await rowsA(W1[0], W1[1]);
  const cp = await ro("copyWeek", ctxA, vOf(U.owner), { fromWeek: "2030-03-04", toWeek: "2030-03-11" });
  const W2 = ["2030-03-11", "2030-03-17"] as const;
  const tgt = (await rowsA(W2[0], W2[1])).filter((r) => r.id !== e2Pre);
  const chk2 = await ro("checkRules", ctxA, vOf(U.owner), { from: W2[0], to: W2[1] });
  const infoW = [...(Array.isArray(cp.value?.warnings) ? cp.value.warnings : []), ...(Array.isArray(chk2.value?.warnings) ? chk2.value.warnings : [])] as Any[];
  const hasInfo = (rule: string, emp: string, day: string) => infoW.some((w) => w?.rule === rule && w?.employeeId === emp && dk(w?.day) === day);
  {
    const bad: string[] = [];
    for (const t of tgt) {
      const s = src.find((x) => x.employeeId === t.employeeId && x.shiftId === t.shiftId && dk(x.date) === addDay(dk(t.date), -7));
      if (!s) bad.push(`${dk(t.date)}:no source`);
      if (t.source !== "MANUAL") bad.push(`${dk(t.date)}:${t.source}`);
      if (t.employeeId !== E.e4 && !snapOk(t, t.shiftId)) bad.push(`${dk(t.date)}:snap`);
    }
    const e1m = tgt.find((r) => r.employeeId === E.e1 && dk(r.date) === "2030-03-11");
    const e3r = tgt.find((r) => r.employeeId === E.e3 && dk(r.date) === "2030-03-14");
    const e7d = tgt.filter((r) => r.employeeId === E.e7).map((r) => dk(r.date)).sort().join(",");
    const r = { ok: cp.ok && Number(cp.value?.created) === tgt.length && tgt.length > 0, rows: bad.length === 0, e1: e1m?.shiftId === S.m && snapOk(e1m, S.m), e3: e3r?.shiftId === S.r && e3r?.endMin === 1140, e7: e7d === "2030-03-14,2030-03-15,2030-03-16,2030-03-17" };
    chk("S3.1", Object.values(r).every(Boolean), "same weekday · MANUAL · current times", `${failedKeys(r)} ${cp.ok ? `created=${cp.value?.created} rows=${tgt.length}` : short(cp.text, 60)} bad=${bad.slice(0, 5).join(" ") || "0"} e3=${e3r?.endMin ?? "∅"}`);
  }
  {
    const p = await row(e2Pre);
    const n = (await rowsA("2030-03-15", "2030-03-15")).filter((r) => r.employeeId === E.e2).length;
    chk("S3.2", cp.ok && !!p && isoOf(p.updatedAt) === isoOf(e2PreRow?.updatedAt) && p.shiftId === S.c && n === 1 && hasSkip(cp, "EXISTS", E.e2, "2030-03-15"), "untouched · alone · EXISTS", `${cp.ok ? "" : short(cp.text, 50)} same=${!!p && isoOf(p.updatedAt) === isoOf(e2PreRow?.updatedAt)} rows=${n} skip=${hasSkip(cp, "EXISTS", E.e2, "2030-03-15")}`);
  }
  {
    const n12 = (await rowsA("2030-03-12", "2030-03-12")).length;
    const e1w = tgt.find((r) => r.employeeId === E.e1 && dk(r.date) === "2030-03-13");
    const e6w = tgt.find((r) => r.employeeId === E.e6 && dk(r.date) === "2030-03-13");
    const r = { ok: cp.ok, closed: n12 === 0 && skippedOf(cp).some((s) => s?.reason === "HOLIDAY" && dk(s?.date) === "2030-03-12"), open: e1w?.shiftId === S.a && e6w?.shiftId === S.m, info: hasInfo("HOLIDAY_WORK", E.e1, "2030-03-13") && hasInfo("HOLIDAY_WORK", E.e6, "2030-03-13") };
    chk("S3.3", Object.values(r).every(Boolean), "03-12 none + HOLIDAY · 03-13 u1 copied + HOLIDAY_WORK", `${failedKeys(r)} rows0312=${n12} e1=${!!e1w} e6=${!!e6w}`);
  }
  {
    const n14 = tgt.filter((r) => r.employeeId === E.e2 && dk(r.date) === "2030-03-14").length;
    const e5 = tgt.filter((r) => r.employeeId === E.e5).length;
    chk("S3.4", cp.ok && hasSkip(cp, "SHIFT_ARCHIVED", E.e2, "2030-03-14") && n14 === 0 && e5 === 0, "SHIFT_ARCHIVED · no e2 03-14 · no e5", `skip=${hasSkip(cp, "SHIFT_ARCHIVED", E.e2, "2030-03-14")} e2rows=${n14} e5rows=${e5}`);
  }
  {
    const c0 = await P.hrRosterEntry.count({ where: { tenantId: T } });
    const s = noteRefusal("S3.5", await ro("copyWeek", ctxA, vOf(U.owner), { fromWeek: "2030-03-04", toWeek: "2030-03-04" }));
    const c1 = await P.hrRosterEntry.count({ where: { tenantId: T } });
    chk("S3.5", !s.ok && s.text === T_SAME_WEEK && c0 === c1, `"${T_SAME_WEEK}" · 0 writes`, `"${short(s.text, 50)}" rows ${c0}→${c1}`);
  }
  {
    const s0 = sig(await rowsA(W2[0], W2[1]));
    const again = await ro("copyWeek", ctxA, vOf(U.owner), { fromWeek: "2030-03-04", toWeek: "2030-03-11" });
    const s1 = sig(await rowsA(W2[0], W2[1]));
    chk("S3.6", cp.ok && again.ok && Number(again.value?.created) === 0 && s0 === s1, "created 0 · unchanged", `${again.ok ? `created=${again.value?.created}` : short(again.text, 50)} same=${s0 === s1}`);
  }
  {
    const e6r = tgt.find((r) => r.employeeId === E.e6 && dk(r.date) === "2030-03-14");
    chk("S3.7", cp.ok && e6r?.shiftId === S.m && hasInfo("ON_LEAVE", E.e6, "2030-03-14"), "copied + ON_LEAVE", `row=${!!e6r} info=${hasInfo("ON_LEAVE", E.e6, "2030-03-14")}`);
  }

  // ═══ S5 publish (owner, week 03-04) ═══
  console.log("── [S5] publish + event ──");
  const ov = await ro("addEntry", ctxA, vOf(U.owner), { employeeId: E.e2, date: "2030-03-09", shiftId: S.n });
  const ovId = ov.value?.id ?? "";
  const preRules = await ro("checkRules", ctxA, vOf(U.owner), { from: W1[0], to: W1[1] });
  const prePub = await rowsA(W1[0], W1[1]);
  const cand = prePub.filter((r) => r.published === false);
  const ev0 = (await eventsOf()).length;
  const pub1 = await ro("publishRoster", ctxA, vOf(U.owner), { from: W1[0], to: W1[1] });
  const postPub = await rowsA(W1[0], W1[1]);
  const flipped = postPub.filter((r) => cand.some((c) => c.id === r.id) && r.published === true);
  const evs1 = await eventsOf();
  const ev1 = evs1.length === ev0 + 1 ? evs1[evs1.length - 1] : null;
  {
    const ats = new Set(flipped.map((r) => isoOf(r.publishedAt)));
    const e5 = postPub.find((r) => r.id === R.e5Pub);
    const r = { ok: pub1.ok && Number(pub1.value?.published) === cand.length && cand.length > 20, all: postPub.every((x) => x.published === true) && flipped.length === cand.length, oneAt: ats.size === 1, untouched: isoOf(e5?.publishedAt) === FIX_TS.toISOString() };
    chk("S5.1", Object.values(r).every(Boolean), `${cand.length} published · 1 publishedAt · pre-published untouched`, `${failedKeys(r)} ${pub1.ok ? `published=${pub1.value?.published}` : short(pub1.text, 60)} flipped=${flipped.length}/${cand.length} ats=${ats.size}`);
  }
  {
    const p = ev1?.payload ?? null;
    const keys = p ? Object.keys(p) : [];
    const js = JSON.stringify(p ?? {});
    const r = {
      one: evs1.length === ev0 + 1 && !!ev1,
      key: !!ev1 && ev1.idempotencyKey === `hr.roster.published#${p?.publishId}` && !!p?.publishId,
      keys: srt(keys) === srt(PAYLOAD_KEYS),
      vals: p?.systemId === sA.id && p?.unitId === null && dk(p?.from) === W1[0] && dk(p?.to) === W1[1],
      ids: srt((p?.entryIds ?? []) as string[]) === srt(flipped.map((r) => r.id)) && srt((p?.employeeIds ?? []) as string[]) === srt(new Set(flipped.map((r) => r.employeeId))) && new Set(p?.employeeIds ?? []).size === (p?.employeeIds ?? []).length,
      noName: !containsAny(js, names) && !/name|reason|salary/i.test(keys.join(",")),
      eventId: !!pub1.value?.eventId && (pub1.value.eventId === ev1?.id || pub1.value.eventId === p?.publishId),
    };
    chk("S5.2", Object.values(r).every(Boolean), "1 event · key · R10 keys · ids only", `${failedKeys(r)} events=${evs1.length - ev0} keys=${keys.join(",") || "∅"}`);
  }
  {
    const a0 = (await auditsOf("hr.roster.publish")).length;
    const p2 = await ro("publishRoster", ctxA, vOf(U.owner), { from: W1[0], to: W1[1] });
    const a1 = (await auditsOf("hr.roster.publish")).length;
    const e2n = (await eventsOf()).length;
    chk("S5.3", pub1.ok && p2.ok && Number(p2.value?.published) === 0 && p2.value?.eventId === null && e2n === evs1.length && a0 === a1, "0 · null · no event · no audit", `${p2.ok ? `published=${p2.value?.published} eventId=${p2.value?.eventId}` : short(p2.text, 50)} events +${e2n - evs1.length} audits +${a1 - a0}`);
  }
  {
    // S4.11 — warnings existed before the publish and did not block it
    const ws = (preRules.ok && Array.isArray(preRules.value?.warnings) ? preRules.value.warnings : []) as Any[];
    const has = (rule: string, pred: (w: Any) => boolean = () => true) => ws.some((w) => w.rule === rule && w.employeeId === E.e1 && pred(w));
    const e1Rows = postPub.filter((r) => r.employeeId === E.e1);
    const r = { dayOff: has("DAY_OFF", (w) => dk(w.weekStart ?? w.day) === "2030-03-04"), maxWeek: has("MAX_WEEK"), onLeave: has("ON_LEAVE", (w) => dk(w.day) === "2030-03-06"), published: pub1.ok && e1Rows.length === 7 && e1Rows.every((x) => x.published) };
    chk("S4.11", Object.values(r).every(Boolean), "e1 DAY_OFF + MAX_WEEK + ON_LEAVE · all 7 e1 rows published", `${failedKeys(r)} warnings=${ws.length}`);
  }
  {
    const consFn = CONS?.[EVENT];
    const autoN = Array.isArray(autoLabels?.AUTOMATION_EVENTS) ? (autoLabels.AUTOMATION_EVENTS as Any[]).filter((x) => x?.value === EVENT) : null;
    const hookN = Array.isArray(hookLabels?.WEBHOOK_EVENTS) ? (hookLabels.WEBHOOK_EVENTS as Any[]).filter((x) => x?.value === EVENT) : null;
    const r = {
      consumer: typeof consFn === "function" && staticNotes.consumerLine === true,
      autoLabel: (staticNotes.autoLabel ?? []).length === 1 && staticNotes.autoLabel[0] === LABEL_TEXT && staticNotes.autoMentions === 1,
      noHook: staticNotes.hookMentions === 0,
      runtime: !!autoN && autoN.length === 1 && autoN[0]?.label === LABEL_TEXT && !!hookN && hookN.length === 1,
    };
    chk("S5.6", Object.values(r).every(Boolean), "consumer · 1 automation label · 0 webhook-file label · 1 in each list", `${failedKeys(r)} consumer=${typeof consFn} autoLabels=${(staticNotes.autoLabel ?? []).length} hookMentions=${staticNotes.hookMentions} runtime=${autoN?.length ?? "∅"}/${hookN?.length ?? "∅"}`);
  }
  {
    const deliver = async (e: Any): Promise<{ ok: boolean; err: string }> => {
      const fn = CONS?.[e?.type];
      if (typeof fn !== "function") return { ok: false, err: `MISSING consumer for ${e?.type}` };
      try {
        await fn({ id: e.id, tenantId: e.tenantId, type: e.type, payload: e.payload, systemId: e.systemId, unitId: e.unitId });
        return { ok: true, err: "" };
      } catch (err) {
        return { ok: false, err: errText(err) };
      }
    };
    const s0 = sig(await rowsA("2030-03-01", "2030-04-30"));
    const a0 = (await auditsOf("hr.roster.")).length;
    const o0 = await P.outboxEvent.count({ where: { tenantId: T } });
    const reps: { ok: boolean; err: string }[] = [];
    if (ev1) {
      reps.push(await deliver(ev1), await deliver(ev1));
      reps.push(...(await Promise.all([deliver(ev1), deliver(ev1)])));
    }
    const s1 = sig(await rowsA("2030-03-01", "2030-04-30"));
    const a1 = (await auditsOf("hr.roster.")).length;
    const o1 = await P.outboxEvent.count({ where: { tenantId: T } });
    chk("S5.7", !!ev1 && reps.length === 4 && reps.every((x) => x.ok) && s0 === s1 && a0 === a1 && o0 === o1, "4 deliveries ok · nothing changed", `${ev1 ? reps.map((x) => (x.ok ? "ok" : short(x.err, 40))).join("|") : "no event"} rows=${s0 === s1} audits +${a1 - a0} outbox +${o1 - o0}`);
  }
  {
    let n = -1;
    let err = "";
    if (ev1 && typeof coreOutbox?.emitOutbox === "function") {
      try {
        for (let i = 0; i < 2; i++) await coreOutbox.emitOutbox(P, { tenantId: T, systemId: sA.id, type: EVENT, idempotencyKey: ev1.idempotencyKey, payload: ev1.payload });
        n = await P.outboxEvent.count({ where: { tenantId: T, idempotencyKey: ev1.idempotencyKey } });
      } catch (e) {
        err = errText(e);
      }
    }
    chk("S5.8", !!ev1 && n === 1, "1 row", ev1 ? `rows=${n}${err ? ` ${err}` : ""}` : "no S5.1 event (nothing emitted)");
  }

  // ═══ S6 prep + S5.9 ═══
  const nv = await ro("addEntry", ctxA, vOf(U.owner), { employeeId: E.e6, date: "2030-03-08", shiftId: S.m });
  const nvId = nv.value?.id ?? "";
  const e2Fri = postPub.find((r) => r.employeeId === E.e2 && dk(r.date) === "2030-03-08" && r.shiftId === S.m)?.id ?? "";
  const mv = await ro("moveEntry", ctxA, vOf(U.owner), e2Fri || "∅", { shiftId: S.c });
  const e7Sun = postPub.find((r) => r.employeeId === E.e7 && dk(r.date) === "2030-03-10")?.id ?? "";
  const rmE7 = await ro("removeEntry", ctxA, vOf(U.owner), e7Sun || "∅");
  {
    const l = await ro("listRoster", ctxA, vOf(U.owner), { from: W1[0], to: W1[1] });
    chk("S5.9", nv.ok && mv.ok && rmE7.ok && l.ok && l.value?.unpublishedCount === 3, "3 (new · moved · removed published)", `${l.ok ? `unpublishedCount=${l.value?.unpublishedCount}` : short(l.text, 50)} prep=${[nv.ok, mv.ok, rmE7.ok].join("/")}`);
  }

  // ═══ S6 readers ═══
  console.log("── [S6] readers ──");
  const onDay = async (date: string, extra: Record<string, unknown> = {}) => {
    const r = await rdr("rosterOnDay", { tenantId: T, date, systemId: sA.id, ...extra });
    return { ...r, es: entriesOf(r.v) };
  };
  const idsIn = (es: Any[] | null) => new Set((es ?? []).map(eid));
  {
    const d = await onDay("2030-03-08");
    const ids = idsIn(d.es);
    const m = (d.es ?? []).find((e) => eid(e) === e2Fri);
    const e1r = postPub.find((r) => r.employeeId === E.e1 && dk(r.date) === "2030-03-08")?.id ?? "∅";
    const mr = await row(e2Fri);
    const r = { list: !!d.es, e1: ids.has(e1r), hidden: !!nvId && !ids.has(nvId), edited: !!m && m.startMin === 900 && m.endMin === 1380 && mr?.published === false && !!mr?.publishedAt };
    chk("S6.1", Object.values(r).every(Boolean), "published only · new hidden · moved listed live", `${failedKeys(r)} ${d.err || `n=${ids.size}`}`);
  }
  {
    const a = await onDay("2030-03-06");
    const b = await onDay("2030-03-04");
    const e1r = postPub.find((r) => r.employeeId === E.e1 && dk(r.date) === "2030-03-06")?.id ?? "∅";
    const e2r = postPub.find((r) => r.employeeId === E.e2 && dk(r.date) === "2030-03-04")?.id ?? "∅";
    chk("S6.2", !!a.es && !!b.es && !idsIn(a.es).has(e1r) && idsIn(b.es).has(e2r) && idsIn(a.es).size > 0, "approved out · pending in", `${a.err || b.err || `e1in=${idsIn(a.es).has(e1r)} e2in=${idsIn(b.es).has(e2r)}`}`);
  }
  {
    const a = await onDay("2030-03-07");
    chk("S6.3", !!a.es && idsIn(a.es).size > 0 && !idsIn(a.es).has(R.e5Pub), "ENDED excluded", a.err || `e5in=${idsIn(a.es).has(R.e5Pub)} n=${idsIn(a.es).size}`);
  }
  {
    const a = await onDay("2030-03-05", { unitId: u1 });
    const b = await onDay("2030-03-05", { unitId: u2 });
    const c = await onDay("2030-03-07", { unitId: u1 });
    const e2r = postPub.find((r) => r.employeeId === E.e2 && dk(r.date) === "2030-03-05")?.id ?? "∅";
    const r = { u1: idsIn(a.es).has(e4g0305) && !idsIn(a.es).has(e4u2) && !idsIn(a.es).has(e2r) && idsIn(a.es).has(R.e1Manual), u2: idsIn(b.es).has(e4u2) && !idsIn(b.es).has(e4g0305) && idsIn(b.es).has(e2r), nullUnit: idsIn(c.es).has(R.e3Manual) };
    chk("S6.4", !!a.es && !!b.es && !!c.es && Object.values(r).every(Boolean), "entry.unitId · null-unit included", `${failedKeys(r)} ${a.err || b.err || c.err}`);
  }
  {
    const a = await onDay("2030-03-09");
    const b = await onDay("2030-03-10");
    chk("S6.5", ov.ok && !!a.es && !!b.es && idsIn(a.es).has(ovId) && !idsIn(b.es).has(ovId), "listed for D only", `${ov.ok ? "" : short(ov.text, 40)} D=${idsIn(a.es).has(ovId)} D+1=${idsIn(b.es).has(ovId)} ${a.err || b.err}`);
  }
  {
    const r = await rdr("rosterAt", { tenantId: T, at: new Date("2030-03-09T19:00:00Z"), systemId: sA.id });
    const es = entriesOf(r.v) ?? [];
    const e = es.find((x) => eid(x) === ovId);
    chk("S6.6", ov.ok && es.length === 1 && !!e && dk(e.date) === "2030-03-09" && isoOf(e.start) === "2030-03-09T15:00:00.000Z" && isoOf(e.end) === "2030-03-09T23:00:00.000Z", "exactly the 03-09 overnight entry · 15:00Z–23:00Z", r.err || `n=${es.length} hit=${!!e} ${e ? `${isoOf(e.start)}–${isoOf(e.end)}` : ""}`);
  }
  {
    const all = await rdr("rosterOnDay", { tenantId: T, date: "2030-03-05" });
    const es = entriesOf(all.v);
    const sysA = await onDay("2030-03-05");
    const r = { both: idsIn(es).has(R.sys2Pub) && idsIn(es).has(e4g0305), systems: (es ?? []).find((x) => eid(x) === R.sys2Pub)?.systemId === sys2.id, narrow: !!sysA.es && !idsIn(sysA.es).has(R.sys2Pub) && (sysA.es ?? []).every((x) => x.systemId === sA.id) };
    chk("S6.7", !!es && Object.values(r).every(Boolean), "both systems · systemId narrows", `${failedKeys(r)} ${all.err}`);
  }
  {
    const r = await rdr("rosterOnDay", { tenantId: T3, date: "2030-03-05" });
    chk("S6.8", !r.err && r.v?.hrLinked === false && Array.isArray(r.v?.entries) && r.v.entries.length === 0, "{hrLinked:false, entries:[]}", r.err || short(r.v, 80));
  }
  {
    const r = await rdr("rosterOnDay", { tenantId: T, date: "2030-03-04", systemId: sA.id });
    const es = entriesOf(r.v) ?? [];
    const badKeys = es.filter((e) => srt(Object.keys(e)) !== srt(R8_KEYS)).map((e) => srt(Object.keys(e)));
    const js = JSON.stringify(r.v ?? {});
    const e1 = es.find((e) => e.employeeId === E.e1);
    const res = { top: !!r.v && srt(Object.keys(r.v)) === "entries,hrLinked" && r.v.hrLinked === true, keys: es.length > 0 && badKeys.length === 0, noLeak: !containsAny(js, names) && !js.includes("ธุระส่วนตัวลับ") && !/salary|satang|reason|leaveType/i.test(js), user: e1?.userId === U.staffU1.id && es.filter((e) => e.employeeId !== E.e1).every((e) => e.userId === null) };
    chk("S6.9", Object.values(res).every(Boolean), "keys exact · no leak · userId", `${failedKeys(res)} ${r.err || `n=${es.length} badKeys=${badKeys[0] ?? "0"}`}`);
  }

  // ═══ S5.4 manager-u1 publish (week 03-11) ═══
  {
    const pre = await rowsA(W2[0], W2[1]);
    const e0 = (await eventsOf()).length;
    const p = await ro("publishRoster", ctxA, vOf(U.mgrU1), { from: W2[0], to: W2[1] });
    const post = await rowsA(W2[0], W2[1]);
    const fl = post.filter((r) => r.published && pre.find((x) => x.id === r.id)?.published === false);
    const r = {
      ok: p.ok && Number(p.value?.published) === fl.length && fl.length > 0,
      onlyU1: fl.every((x) => x.unitId === u1),
      allU1: post.filter((x) => x.unitId === u1).every((x) => x.published),
      othersStay: post.filter((x) => x.unitId !== u1).every((x) => !x.published) && post.some((x) => x.unitId !== u1),
      event: (await eventsOf()).length === e0 + 1,
    };
    chk("S5.4", Object.values(r).every(Boolean), "only u1 rows flip · 1 event", `${failedKeys(r)} ${p.ok ? `published=${p.value?.published} flipped=${fl.length}` : short(p.text, 60)}`);
  }

  // ═══ S5.5 forced count mismatch ═══
  {
    const a = await rawEntry({ employeeId: E.e1, date: "2030-04-09", shiftId: S.m, unitId: u1 });
    const b = await rawEntry({ employeeId: E.e6, date: "2030-04-10", shiftId: S.m, unitId: u1 });
    const c = await rawEntry({ employeeId: E.e7, date: "2030-04-11", shiftId: S.m, unitId: u1 });
    const e0 = (await eventsOf()).length;
    let res: RO = { ok: false, text: "not run", value: undefined };
    let waited = false;
    let holderErr = "";
    if (typeof rMod?.publishRoster === "function") {
      let release: () => void = () => {};
      const gate = new Promise<void>((r) => (release = r));
      let held: () => void = () => {};
      const heldP = new Promise<void>((r) => (held = r));
      const holder = P.$transaction(
        async (tx: Any) => {
          await tx.$queryRawUnsafe(`SELECT id FROM "HrRosterEntry" WHERE id = $1 FOR UPDATE`, b);
          held();
          await gate;
          await tx.$executeRawUnsafe(`DELETE FROM "HrRosterEntry" WHERE id = $1`, b);
        },
        { maxWait: 10_000, timeout: 30_000 },
      ).catch((e: unknown) => {
        holderErr = errText(e);
        held();
      });
      await heldP;
      const pubP = ro("publishRoster", ctxA, vOf(U.owner), { from: "2030-04-08", to: "2030-04-14" });
      for (let i = 0; i < 80 && !waited; i++) {
        await sleep(100);
        const w = await rawRows(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE '%HrRosterEntry%'`);
        waited = Number(w?.[0]?.n ?? 0) > 0;
      }
      release();
      await holder;
      res = await pubP;
    }
    const ra = await row(a);
    const rc = await row(c);
    const gone = (await P.hrRosterEntry.count({ where: { id: b } })) === 0;
    const e1n = (await eventsOf()).length;
    chk("S5.5", !res.ok && res.text === T_PUBLISH_RACE && ra?.published === false && rc?.published === false && gone && e1n === e0, `"${T_PUBLISH_RACE}" · 0 flipped · 0 events`, `${res.ok ? `ACCEPTED published=${res.value?.published}` : `"${short(res.text, 50)}"`} waitedOnLock=${waited} a=${ra?.published} c=${rc?.published} deleted=${gone} events +${e1n - e0}${holderErr ? ` holder=${holderErr}` : ""}`);
    if (!res.ok && res.text) refusals.push({ label: "S5.5", text: res.text });
  }

  // ═══ S7 branch scope + refusals ═══
  console.log("── [S7] branch scope + refusals ──");
  {
    const a = noteRefusal("S7.1.e2", await ro("addEntry", ctxA, vOf(U.mgrU1), { employeeId: E.e2, date: "2030-04-16", shiftId: S.m }));
    const b = noteRefusal("S7.1.e3", await ro("addEntry", ctxA, vOf(U.mgrU1), { employeeId: E.e3, date: "2030-04-16", shiftId: S.m }));
    const c = await ro("addEntry", ctxA, vOf(U.mgrU1), { employeeId: E.e4, date: "2030-03-06", shiftId: S.c });
    const d = noteRefusal("S7.1.e4out", await ro("addEntry", ctxA, vOf(U.mgrU1), { employeeId: E.e4, date: "2030-04-16", shiftId: S.c }));
    const rc = await row(c.value?.id ?? "");
    const n = await P.hrRosterEntry.count({ where: { tenantId: T, date: dbDate("2030-04-16") } });
    const r = { e2: !a.ok && a.text === T_OTHER_BRANCH, e3: !b.ok && b.text === T_UNASSIGNED, e4in: c.ok && rc?.unitId === u1, e4out: !d.ok && d.text === T_OTHER_BRANCH, rows: n === 0 };
    chk("S7.1", Object.values(r).every(Boolean), "other branch · unassigned · borrowed ok · outside refused", `${failedKeys(r)} e2="${short(a.text, 30)}" e3="${short(b.text, 30)}" e4=${c.ok ? "ok" : short(c.text, 30)} out="${short(d.text, 30)}"`);
  }
  {
    const g = await ro("generateFromTemplate", ctxA, vOf(U.mgrU1), { from: "2030-03-18", to: "2030-03-24" });
    const w3 = await rowsA("2030-03-18", "2030-03-24");
    const cpy = await ro("copyWeek", ctxA, vOf(U.mgrU1), { fromWeek: "2030-03-18", toWeek: "2030-03-25" });
    const w4 = await rowsA("2030-03-25", "2030-03-31");
    const okEmp = new Set([E.e1, E.e6, E.e7]);
    const r = { gen: g.ok && w3.length > 0 && w3.every((x) => okEmp.has(x.employeeId) && x.unitId === u1), copy: cpy.ok && w4.length > 0 && w4.every((x) => okEmp.has(x.employeeId) && x.unitId === u1) };
    chk("S7.2", Object.values(r).every(Boolean), "only e1/e6/e7 u1 rows", `${failedKeys(r)} gen=${g.ok ? w3.length : short(g.text, 40)} copy=${cpy.ok ? w4.length : short(cpy.text, 40)} emps=${srt(new Set([...w3, ...w4].map((x) => (x.employeeId === E.e2 ? "e2" : x.employeeId === E.e4 ? "e4" : x.employeeId === E.e3 ? "e3" : "u1emp"))))}`);
  }
  {
    const L = async (ctx: Any, w: Who) => ro("listRoster", ctx, vOf(w), { from: W1[0], to: W1[1] });
    const o = await L(ctxA, U.owner);
    const ma = await L(ctxA, U.mgrAll);
    const m1 = await L(ctxA, U.mgrU1);
    const st = noteRefusal("S7.3.staff", await L(ctxA, U.staffU1));
    const me = noteRefusal("S7.3.member", await L(ctxA, U.member));
    const ot = await L(ctxO, U.other);
    const ids = (r: RO) => srt((entriesOf(r.value) ?? []).map((e) => String(e.id)));
    const emps = (r: RO) => new Set((entriesOf(r.value) ?? []).map((e) => String(e.employeeId)));
    const oe = entriesOf(o.value) ?? [];
    const badKeys = oe.filter((e) => srt(Object.keys(e)) !== srt(R7_KEYS)).map((e) => srt(Object.keys(e)));
    const ours = new Set(oe.map((e) => String(e.id)));
    const r = {
      owner: o.ok && [E.e1, E.e2, E.e3, E.e4, E.e6].every((x) => emps(o).has(x)),
      keys: oe.length > 0 && badKeys.length === 0,
      mgrAll: ma.ok && ids(ma) === ids(o),
      mgrU1: m1.ok && emps(m1).has(E.e4) && !emps(m1).has(E.e2) && !emps(m1).has(E.e3) && [...emps(m1)].every((x) => [E.e1, E.e4, E.e5, E.e6, E.e7].includes(x)),
      staff: !st.ok && isThai(st.text) && !(entriesOf(st.value) ?? []).length,
      member: !me.ok && isThai(me.text),
      other: ot.ok ? (entriesOf(ot.value) ?? []).every((e) => !ours.has(String(e.id))) : isThai(ot.text),
      noNames: !containsAny(JSON.stringify(oe), names),
    };
    chk("S7.3", Object.values(r).every(Boolean), "matrix as R2 · R7 keys", `${failedKeys(r)} owner=${o.ok ? oe.length : short(o.text, 40)} badKeys=${badKeys[0] ?? "0"}`);
  }
  {
    const c0 = await P.hrRosterEntry.count({ where: { tenantId: T } });
    const s0 = sig(await rowsA("2030-03-01", "2030-05-31"));
    const out: RO[] = [];
    for (const w of [U.staffU1, U.member]) {
      out.push(noteRefusal("S7.4.add", await ro("addEntry", ctxA, vOf(w), { employeeId: E.e1, date: "2030-04-17", shiftId: S.m })));
      out.push(noteRefusal("S7.4.move", await ro("moveEntry", ctxA, vOf(w), S2.e || "∅", { date: "2030-04-18" })));
      out.push(noteRefusal("S7.4.remove", await ro("removeEntry", ctxA, vOf(w), S2.e || "∅")));
      out.push(noteRefusal("S7.4.gen", await ro("generateFromTemplate", ctxA, vOf(w), { from: "2030-04-15", to: "2030-04-21" })));
      out.push(noteRefusal("S7.4.copy", await ro("copyWeek", ctxA, vOf(w), { fromWeek: "2030-03-04", toWeek: "2030-04-15" })));
      out.push(noteRefusal("S7.4.publish", await ro("publishRoster", ctxA, vOf(w), { from: W2[0], to: W2[1] })));
    }
    const c1 = await P.hrRosterEntry.count({ where: { tenantId: T } });
    const s1 = sig(await rowsA("2030-03-01", "2030-05-31"));
    chk("S7.4", typeof rMod?.addEntry === "function" && out.every((x) => !x.ok && x.text === T_NO_PERM) && c0 === c1 && s0 === s1, `12 × "${T_NO_PERM}" · 0 writes`, `${out.filter((x) => x.text === T_NO_PERM).length}/12 (${short(out.find((x) => x.text !== T_NO_PERM)?.text ?? "", 40)}) rows ${c0}→${c1} same=${s0 === s1}`);
  }
  {
    const a = await ro("addEntry", ctxA, vOf(U.mgrEmpty), { employeeId: E.e2, date: "2030-04-29", shiftId: S.u2 });
    const l = await ro("listRoster", ctxA, vOf(U.mgrEmpty), { from: W1[0], to: W1[1] });
    const emps = new Set((entriesOf(l.value) ?? []).map((e) => String(e.employeeId)));
    chk("S7.5", a.ok && l.ok && emps.has(E.e2) && emps.has(E.e3), "add for u2 ok · list has e2 + e3", `add=${a.ok ? "ok" : short(a.text, 40)} list=${l.ok ? `e2=${emps.has(E.e2)} e3=${emps.has(E.e3)}` : short(l.text, 40)}`);
  }
  {
    const r = await ro("listRoster", ctxA, vOf(U.mgrU1), { from: W1[0], to: W1[1], unitId: u2 });
    const g = await ro("generateFromTemplate", ctxA, vOf(U.mgrU1), { from: "2030-04-22", to: "2030-04-28", unitId: u2 });
    noteRefusal("S7.8.list", r);
    noteRefusal("S7.8.gen", g);
    const n = (await rowsA("2030-04-22", "2030-04-28")).filter((x) => x.source === "TEMPLATE").length;
    chk("S7.8", !r.ok && r.text === T_OTHER_UNIT && !g.ok && g.text === T_OTHER_UNIT && n === 0, `2 × "${T_OTHER_UNIT}" · 0 rows`, `list="${short(r.text, 40)}" gen="${short(g.text, 40)}" rows=${n}`);
  }

  // ═══ X races / isolation ═══
  console.log("── [X] races · isolation · fitness ──");
  {
    const out: string[] = [];
    let ok = typeof rMod?.addEntry === "function";
    for (let k = 0; k < 3; k++) {
      const date = `2030-04-${15 + k}`;
      const rs = await Promise.all(Array.from({ length: 10 }, () => ro("addEntry", ctxA, vOf(U.owner), { employeeId: E.e6, date, shiftId: S.m })));
      const n = await P.hrRosterEntry.count({ where: { employeeId: E.e6, date: dbDate(date), shiftId: S.m } });
      const losers = rs.filter((x) => !x.ok);
      const good = rs.filter((x) => x.ok).length === 1 && n === 1 && losers.length === 9 && losers.every((x) => x.text === T_DUP);
      if (!good) ok = false;
      for (const l of losers) refusals.push({ label: "X6.1", text: l.text });
      out.push(`r${k + 1}:ok=${rs.filter((x) => x.ok).length}/rows=${n}/texts=${short(srt(new Set(losers.map((x) => x.text.slice(0, 24)))), 50)}`);
    }
    chk("X6.1", ok, `1 row · 9 × "${T_DUP}" ×3`, out.join(" "));
  }
  {
    const out: string[] = [];
    let ok = typeof rMod?.publishRoster === "function";
    for (let k = 0; k < 3; k++) {
      const date = `2030-04-${22 + k}`;
      const a = await ro("addEntry", ctxA, vOf(U.owner), { employeeId: E.e1, date, shiftId: S.m });
      const id = a.value?.id ?? "";
      const e0 = (await eventsOf()).length;
      const [p, m] = await Promise.all([ro("publishRoster", ctxA, vOf(U.owner), { from: date, to: date }), ro("moveEntry", ctxA, vOf(U.owner), id || "∅", { shiftId: S.c })]);
      const r = await row(id);
      const evN = (await eventsOf()).length - e0;
      const flippedN = p.ok && Number(p.value?.published) > 0 ? 1 : 0;
      const good = a.ok && p.ok && m.ok && !!r && r.shiftId === S.c && snapOk(r, S.c) && (!r.published || snapOk(r, r.shiftId)) && evN === flippedN;
      if (!good) ok = false;
      out.push(`r${k + 1}:${a.ok ? "" : "add✗"}pub=${p.ok ? p.value?.published : "✗"} move=${m.ok ? "ok" : "✗"} row=${r ? `${r.shiftId === S.c ? "c" : "m"}/${r.startMin}/p=${r.published}` : "∅"} ev=${evN}`);
    }
    chk("X6.2", ok, "consistent snapshot · events = flipping publishes", out.join(" "));
  }
  {
    const [g1, g2] = await Promise.all([ro("generateFromTemplate", ctxA, vOf(U.owner), { from: "2030-05-06", to: "2030-05-12" }), ro("generateFromTemplate", ctxA, vOf(U.owner), { from: "2030-05-06", to: "2030-05-12" })]);
    const g3 = await ro("generateFromTemplate", ctxA, vOf(U.owner), { from: "2030-05-13", to: "2030-05-19" });
    const a = await rowsA("2030-05-06", "2030-05-12");
    const b = await rowsA("2030-05-13", "2030-05-19");
    const norm = (rs: Any[]) => rs.map((r) => `${r.employeeId}|${weekdayOf(dk(r.date))}|${r.shiftId}|${r.unitId}`).sort().join(",");
    const dupDays = a.length - new Set(a.map((r) => `${r.employeeId}|${dk(r.date)}`)).size;
    const created = Number(g1.value?.created ?? 0) + Number(g2.value?.created ?? 0);
    chk("X6.3", g1.ok && g2.ok && g3.ok && a.length > 0 && norm(a) === norm(b) && dupDays === 0 && created === a.length, "parallel = sequential · no duplicate day", `${g1.ok && g2.ok ? `created=${created}` : short(g1.text || g2.text, 50)} rows=${a.length}/${b.length} same=${norm(a) === norm(b)} dupDays=${dupDays}`);
  }
  {
    const snap = async () => JSON.stringify(await P.hrRosterEntry.findMany({ where: { tenantId: T2 }, orderBy: { id: "asc" } }));
    const before = await snap();
    const out = [
      noteRefusal("X2.1.emp", await ro("addEntry", ctxA, vOf(U.owner), { employeeId: E.eX, date: "2030-04-03", shiftId: S.m })),
      noteRefusal("X2.1.shift", await ro("addEntry", ctxA, vOf(U.owner), { employeeId: E.e1, date: "2030-04-08", shiftId: S.o })),
      noteRefusal("X2.1.move", await ro("moveEntry", ctxA, vOf(U.owner), R.other, { date: "2030-04-03" })),
      noteRefusal("X2.1.remove", await ro("removeEntry", ctxA, vOf(U.owner), R.other)),
    ];
    const after = await snap();
    const leaked = (await P.hrRosterEntry.count({ where: { tenantId: T, employeeId: E.eX } })) + (await P.hrRosterEntry.count({ where: { tenantId: T, shiftId: S.o } }));
    chk("X2.1", typeof rMod?.addEntry === "function" && out.every((x) => !x.ok && isThai(x.text)) && before === after && leaked === 0, "4 refusals · unchanged", `${out.map((x) => (x.ok ? "ACCEPTED" : short(x.text, 20))).join(" | ")} unchanged=${before === after} leaked=${leaked}`);
  }
  {
    const before = JSON.stringify(await row(R.sys2Pub));
    const out = [
      noteRefusal("X2.2.emp", await ro("addEntry", ctxA, vOf(U.owner), { employeeId: E.eS, date: "2030-04-03", shiftId: S.m })),
      noteRefusal("X2.2.move", await ro("moveEntry", ctxA, vOf(U.owner), R.sys2Pub, { date: "2030-04-03" })),
      noteRefusal("X2.2.remove", await ro("removeEntry", ctxA, vOf(U.owner), R.sys2Pub)),
    ];
    const after = JSON.stringify(await row(R.sys2Pub));
    const n = await P.hrRosterEntry.count({ where: { tenantId: T, systemId: sA.id, employeeId: E.eS } });
    chk("X2.2", typeof rMod?.addEntry === "function" && out.every((x) => !x.ok && isThai(x.text)) && before === after && n === 0, "3 refusals · unchanged", `${out.map((x) => (x.ok ? "ACCEPTED" : short(x.text, 20))).join(" | ")} unchanged=${before === after} rows=${n}`);
  }

  // ═══ S7.6 / S7.7 (after every op) ═══
  {
    const ids = [T, sA.id, sys2.id, u1, u2, ...empIds, ...Object.values(S), ...Object.values(R)];
    const bad = refusals.filter((r) => !FIXED_REFUSALS.has(r.text) || containsAny(r.text, names) || containsAny(r.text, ids));
    const xRefusals = new Set(["X2.1.emp", "X2.1.shift", "X2.1.move", "X2.1.remove", "X2.2.emp", "X2.2.move", "X2.2.remove", "S1.10.gen", "S1.10.check", "S1.10.list", "S1.10.publish", "S7.3.staff", "S7.3.member"]);
    // not-found / range / read refusals have no fixed text in the brief (flag 3) — Thai + clean is enough for those
    const hard = bad.filter((r) => !xRefusals.has(r.label) || !isThai(r.text) || containsAny(r.text, names) || containsAny(r.text, ids));
    chk("S7.6", typeof rMod?.addEntry === "function" && refusals.length > 20 && hard.length === 0, "fixed texts · no name / id", `${refusals.length} refusals · bad=${hard.slice(0, 4).map((r) => `${r.label}:"${short(r.text, 30)}"`).join(" ") || "0"}`);
  }
  {
    const rows = await auditsOf("hr.roster.");
    const cnt = (a: string) => rows.filter((r) => r.action === a).length;
    const js = JSON.stringify(rows.map((r) => ({ b: r.before, a: r.after })));
    const entryAud = rows.filter((r) => /^hr\.roster\.entry\.(add|move|remove)$/.test(r.action));
    const entryKeys = ["entryId", "employeeId", "date", "shiftId", "unitId", "wasPublished"];
    const between = (n: number, lo: number, hi: number) => n >= lo && n <= hi;
    const r = {
      add: cnt("hr.roster.entry.add") === (okCounts.addEntry ?? 0) && (okCounts.addEntry ?? 0) > 0,
      move: cnt("hr.roster.entry.move") === (okCounts.moveEntry ?? 0) && (okCounts.moveEntry ?? 0) > 0,
      remove: cnt("hr.roster.entry.remove") === (okCounts.removeEntry ?? 0) && (okCounts.removeEntry ?? 0) > 0,
      publish: cnt("hr.roster.publish") === (okEffect.publishRoster ?? 0) && (okEffect.publishRoster ?? 0) > 0,
      generate: between(cnt("hr.roster.generate"), okEffect.generateFromTemplate ?? 0, okCounts.generateFromTemplate ?? 0) && (okEffect.generateFromTemplate ?? 0) > 0,
      copy: between(cnt("hr.roster.copy"), okEffect.copyWeek ?? 0, okCounts.copyWeek ?? 0) && (okEffect.copyWeek ?? 0) > 0,
      shape: entryAud.length > 0 && entryAud.every((x) => entryKeys.every((k) => x.after && k in x.after)),
      noNames: !containsAny(js, names) && !js.includes("ธุระส่วนตัวลับ"),
    };
    chk("S7.7", Object.values(r).every(Boolean), "1 audit per op · ids only", `${failedKeys(r)} counts add=${cnt("hr.roster.entry.add")}/${okCounts.addEntry ?? 0} move=${cnt("hr.roster.entry.move")}/${okCounts.moveEntry ?? 0} remove=${cnt("hr.roster.entry.remove")}/${okCounts.removeEntry ?? 0} publish=${cnt("hr.roster.publish")}/${okEffect.publishRoster ?? 0} gen=${cnt("hr.roster.generate")}/${okEffect.generateFromTemplate ?? 0}-${okCounts.generateFromTemplate ?? 0} copy=${cnt("hr.roster.copy")}/${okEffect.copyWeek ?? 0}-${okCounts.copyWeek ?? 0}`);
  }

  // ═══ X12 fitness without env ═══
  {
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_OPTIONS: "--max-old-space-size=2048" };
    const a = await spawnTsx([FITNESS], env, 400_000);
    const b = await spawnTsx([FITNESS_HR], env, 300_000);
    const tail = (o: string) => short(o.split("\n").filter((l) => /❌|FAIL|Error/.test(l)).join(" "), 100);
    chk("X12.1", a.code === 0 && b.code === 0, "exit 0 · 0", `fitness=${a.code}${a.code ? ` ${tail(a.out)}` : ""} fitness-hr=${b.code}${b.code ? ` ${tail(b.out)}` : ""}`);
  }
}
const S2: Record<string, string> = {};

// ═════════════════════════ cleanup ═════════════════════════
const NEW_DELETE_ORDER = ["HrShiftSwapRequest", "HrTimeCorrection", "HrOtRequest", "HrLeaveBalanceTxn", "HrRosterEntry", "HrShift", "HrHoliday", "HrLeavePolicy", "HrEmployeeUnit"];
async function cleanup(): Promise<void> {
  const d = async (n: string, f: () => Promise<unknown>) => {
    try {
      await f();
    } catch (e) {
      console.log(`  ⚠ cleanup ${n}: ${errText(e).slice(0, 90)}`);
    }
  };
  for (let pass = 0; pass < 2; pass++) {
    for (const tid of tenants) {
      for (const t of NEW_DELETE_ORDER) await d(t, () => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid));
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
  for (const m of ["hrLeave", "hrEmployee", "hrAttendance", "hrWorkSchedule", "hrSalaryProfile", "hrPayAdjustment", "hrPayrollRun", "hrPayrollItem", "auditLog", "outboxEvent", "membership", "appSystem", "businessUnit"]) {
    const n = await P[m].count({ where: { tenantId: tid } }).catch(() => -1);
    if (n !== 0) residue.push(`${m}=${n}`);
  }
  for (const t of NEW_DELETE_ORDER) {
    const r = await rawRows(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid);
    const n = r ? Number(r[0]?.n ?? -1) : -2;
    if (n !== 0) residue.push(`${t}=${n}`);
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
for (const [id] of CHECKS) if (!results.has(id)) chk(id.replace(/^H2\.1-/, ""), false, "checked", crashed ? `not reached (harness crashed: ${crashed.slice(0, 80)})` : "not reached");
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
