// QC — HR V2 · H2.5 — judgement from the roster · HrAttendanceDay snapshot · not-in/absent alerts · board 04A · calendar 04B · self · settings · cron (Mig)
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// Contract: ledger/hr-briefs/hr-brief-H2.5.md R1–R13 · §3 · §4 (DRAFT, defaults in force) · base session/hr 2e23c8164. Fixed here (ORACLE-EDIT to differ):
//   judge-rules: ATTENDANCE_POLICY_DEFAULT · attendancePolicyOf(raw) · JUDGE_ENGINE_VERSION · judgeEntry(input) → 11 keys ·
//     attributeSessions(entries, events, { employeeId, earlyInMin, closeGraceMin }) → { byEntry: { [entryId]: eventId[] }, rest: eventId[] }
//   judge: runAttendanceJobs({ now, tenantId?, deadline? }) → { finalized, late, absent } · recomputeAttendanceDay(ctx, viewer, { dayId, reason }, { now? }) →
//     { ok, id, changed, version } | { ok:false, reason } · loadAttendanceBoard(ctx, viewer, { day?, unit? }, { now? }) · loadAttendanceMonth(ctx, viewer,
//     { employeeId, month }, { now? }) (dto | null) · myAttendanceMonth({ tenantId, userId }, { month }, { now? }) · clock-settings: get/saveAttendancePolicy
//   alert firedAt = injected now · alertEmployee = NOT_IN only · summary: workDays = days with an ON_TIME/LATE/EARLY_OUT slot · onTime lateCount absentDays
//     leaveDays dayOffDays pendingDays = slots by status · earlyOutCount = slots earlyOutMin > 0 · missingOut = slots · lateMin otMin workedMin = Σ
// Fixtures `qc-hr-h25-<stamp>` (+`-other`) · 2031 rows raw · opts.now · new tables via raw SQL · SKIP while judge.ts absent · QC_FORCE=1 · --list.
// Run (lane DB): bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h2.5.mts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Any, type Def, type Sev, type Base, type Who, ROOT, rd, short, errText, isThai, srt, failedKeys, stripComments, sha, dbDate, sleep, tagOf,
  PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, baseRef, pathInBase, changedVsBase, diffHunks, makeRegistry, qc4Env, makeFixtures, cleanupFx, residueOf,
  vOf, canon, keysDeep, loadOpt, modState as st, hrNavLabels, useServerFile, inventoryParity, msgParity, tokensOnly, testidsOf, flat, jsonOf, importsOf,
} from "./qc-hr-lib.mjs";

const SUITE = "qc-hr-h2.5";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-h25-";
const H = "src/lib/modules/hr/";
const F = {
  rules: `${H}judge-rules.ts`, judge: `${H}judge.ts`, ui: `${H}attendance-ui.tsx`, acts: `${H}attendance-actions.ts`, job: `${H}attendance-job.ts`,
  page: "src/app/app/sys/[id]/hr/attendance/page.tsx", setPage: "src/app/app/sys/[id]/hr/settings/page.tsx", hourly: "src/app/api/cron/hourly/route.ts",
  crmCron: "scripts/crm-cron.mts", cons: "src/lib/outbox-consumers.ts", hooks: "src/lib/webhooks/labels.ts", scope: "src/lib/core/scope.ts", schema: "prisma/schema/hr.prisma",
  mig0: "prisma/migrations/20261230000000_hr_judgement/migration.sql", mig1: "prisma/migrations/20261230000001_hr_judgement_leave/migration.sql",
  th: "src/messages/th/common.json", en: "src/messages/en/common.json", visual: "scripts/visual-hr.mts", seed: "scripts/seed-hr-qc.mts", hqc: "scripts/hr-qc-env.mts",
};
const FROZEN = ["clock.ts", "clock-rules.ts", "time-rules.ts", "roster.ts", "swap.ts", "service.ts", "payroll.ts", "pin.ts", "privacy.ts", "privacy-shared.ts", "pos-seam.ts", "rules.ts"].map((f) => H + f);
const BRAIN_SHA = "edbeb819c3e3fc7d3da28ca7513c71f3168e9d53bae29eabbbe1cd96f36a1fa8"; // rules.ts FREEZE
const SEAM_SHA = "e7822846d2f4d37ba732237a8cd9286d836a6ad5f3c524ef19730e2869a2f508"; // pos-seam.ts
const T = {
  rNoPerm: "คุณไม่มีสิทธิ์คิดผลการลงเวลาใหม่",
  rNotFound: "ไม่พบผลการลงเวลาของวันนี้ — กรุณารีเฟรช",
  rOwn: "คิดผลการลงเวลาของตัวเองไม่ได้ — ให้เจ้าของร้านหรือผู้จัดการคนอื่นทำ",
  rReason: "ใส่เหตุผลที่คิดผลใหม่ (3–200 ตัวอักษร)",
  rPaid: "เดือนนี้อนุมัติเงินเดือนแล้ว — คิดผลการลงเวลาย้อนหลังไม่ได้",
  sAlert: "เวลาเตือนต้องอยู่ระหว่าง 0 ถึง 240 นาทีหลังเริ่มกะ",
  sAbsent: "เวลาที่นับว่าไม่มาต้องอยู่ระหว่าง 30 ถึง 720 นาทีหลังเริ่มกะ",
  sEarly: "เวลาผ่อนผันออกก่อนต้องอยู่ระหว่าง 0 ถึง 60 นาที",
  sOtStep: "หน่วยปัด OT ต้องเป็น 1, 5, 10, 15 หรือ 30 นาที",
  nLateT: "ยังไม่ลงเวลาเข้างาน",
  nLateSelfT: "คุณยังไม่ได้ลงเวลาเข้างาน",
  nAbsT: "ไม่พบการลงเวลาเข้างาน",
  stale: "ข้อมูลเปลี่ยนหลังบันทึกผล",
  mNoEmp: "บัญชีของคุณยังไม่ได้ผูกกับรายชื่อพนักงาน — ลงเวลาที่เครื่องหน้าร้าน หรือขอให้ผู้ดูแลผูกบัญชี",
  noPermission: "คุณไม่มีสิทธิ์ตั้งค่าระบบพนักงาน",
  shopWide: "รายการที่ใช้ทั้งร้านจัดการได้เฉพาะผู้ดูแลทุกสาขา — เลือกสาขาของคุณ",
};
const LABELS_TH = ["ปกติ", "สาย {n} นาที", "ออกก่อน {n} นาที", "ขาด", "ยังไม่มา", "ยังไม่ถึงเวลา", "ลา", "หยุด", "ไม่มีตาราง", "ไม่มีเวลาออก", "OT +{n} ชม.", "ทีมรายวัน", "ปฏิทินรายคน", "ลงเวลาแทน", T.stale];
const TESTIDS = ["page", "view-day", "view-month", "day-prev", "day-next", "banner", "row-", "slot-", "status-", "stale-", "clock-for", "cal", "cal-day-", "summary", "recompute-", "recompute-reason", "recompute-submit"].map((s) => `hr-att-${s}`);
const PDEF = { notInAlertMin: 10, absentAfterMin: null, earlyOutGraceMin: 0, flagEarlyOut: true, otStepMin: 15, alertsOn: true, alertEmployee: false };
const OUT_KEYS = "absentAt,alertAt,breakMin,earlyOutMin,final,lateMin,missingOut,otMin,phase,status,workedMin";
const TOP_KEYS = "alerts,canClockFor,day,nextDay,prevDay,rows,todayKey,totals,unitSel,units";
const SLOT_KEYS = "breaks,dayId,earlyOutMin,final,inAt,leave,lateMin,method,missingOut,otMin,outAt,phase,shift,slotKey,stale,status,stored,workedMin";
const SUM_KEYS = "absentDays,dayOffDays,earlyOutCount,lateCount,lateMin,leaveDays,missingOut,onTime,otMin,pendingDays,workDays,workedMin";
const FORBID = ["lat", "lng", "accuracyM", "photoKey", "deviceId", "distanceM", "inRadius", "note", "reason", "pinCode", "pinHash", "baseSalarySatang", "dailyRateSatang", "hourlyRateSatang", "nationalId", "bankAccountNo"];
const EV = ["hr.attendance.late", "hr.attendance.absent"];

// == registry ==
const D = (id: string, g: string, sev: Sev, base: Base, title: string): Def => [`H2.5-${id}`, g, sev, base, title] as const;
const d = (id: string, g: string, sev: Sev, title: string) => D(id, g, sev, "RED", title);
const [C, M] = ["CRITICAL", "MAJOR"] as const;
const CHECKS: readonly Def[] = [
  d("S1.1", "R1", C, "[pure] V01–V05 on time · grace · late · grace boundary · grace 0"),
  d("S1.2", "R1", C, "[pure] V06–V09 early out · its grace · flag off · late+early ⇒ LATE"),
  d("S1.3", "R1", C, "[pure] V10–V12 OT floor to step (HQ10)"),
  d("S1.4", "R1", C, "[pure] V13–V14 breaks"),
  d("S1.5", "R1", C, "[pure] V15–V21 missing OUT · absent · leave full/AM/PM"),
  d("S1.6", "R1", C, "[pure] V22–V24 overnight · break across midnight · midnight end"),
  d("S1.7", "R1", C, "[pure] V25–V34 live phases · PENDING · absentAt · final boundary"),
  d("S1.8", "R1", M, "[pure] V35–V38 no shift: DAY_OFF (+OT) · NO_SCHEDULE"),
  d("S1.9", "R1", M, "[pure] V39–V40 several sessions"),
  d("S1.10", "R1", M, "[pure] 11 output keys · alertAt/absentAt literals · deterministic · input untouched"),
  d("S1.11", "R1", M, "[pure] attendancePolicyOf literals · default constant · engine version 1"),
  d("S1.12", "R3", C, "[pure] attributeSessions A1–A9"),
  d("S2.1", "R2", C, "[db] linked session ⇒ LATE 20 · OT 30 · W490"),
  d("S2.2", "R3", C, "[db] D-H24-adopt: unlinked IN 04:30 adopted ⇒ ON_TIME W630, no DAY slot"),
  d("S2.3", "R3", C, "[db] D-H24-r2d: out-of-window / other employee's rosterEntryId never credits the entry"),
  d("S2.4", "R2", M, "[db] split day ⇒ two slots"),
  d("S2.5", "R2", C, "[db] overnight + break across midnight on start day · next day no double count"),
  d("S2.6", "R2", M, "[db] unrostered: NO_SCHEDULE · empty day · legacy template LATE 12 / DAY_OFF"),
  d("S2.7", "R2", M, "[db] roster in use ⇒ DAY_OFF · unpublished ignored · LEAVE · PENDING ⇒ ABSENT+pending · ended ⇒ none"),
  d("S3.1", "R4", C, "[db] finaliser: one HrAttendanceDay per final slot = live values"),
  d("S3.2", "R4", C, "[db] second run: 0 · rows identical · no outbox/audit"),
  d("S3.3", "R4", M, "[db] not final / outside D−7 not written · holidayId · other tenant only on its own run"),
  d("S3.4", "R4", C, "[db] edits after snapshot do not rewrite · readers stored+stale"),
  d("S4.1", "R5", C, "[db] recompute refusals rNoPerm / rNotFound / rOwn / rReason · nothing written"),
  d("S4.2", "R5", C, "[db] recompute changes only that row (v2, recomputedBy/Reason) · no event"),
  d("S4.3", "R5", M, "[db] identical recompute ⇒ changed false · one audit before/after"),
  d("S4.4", "R5", C, "[db] APPROVED/PAID month ⇒ rPaid · REVERSED ok · owner on manager row"),
  d("S5.1", "R7", C, "[db] not-in alert: quiet before alertAt · one per absent employee at alertAt"),
  d("S5.2", "R7", C, "[db] fires once · payload 4 ids · key type#alertId · no names"),
  d("S5.3", "R7", C, "[db] consumer ×2 ⇒ one notification per scoped recipient · notifiedAt"),
  d("S5.4", "R7", M, "[db] texts byte-exact (manager, self) · system B settings honoured"),
  d("S5.5", "R7", C, "[db] absent alert at absentAt only without IN · key · text"),
  d("S5.6", "R7", M, "[static+runtime] consumers · one automation label each · not in webhooks file"),
  d("S6.1", "R9", C, "[db] board readers dto · non-readers null"),
  d("S6.2", "R9", C, "[db] branch scope · no other-branch id · unit param clamped · [] = all"),
  d("S6.3", "R9", C, "[db] DTO keys exact · no sensitive keys/values · leave type only for wide readers"),
  d("S6.4", "R9", M, "[db] board statuses (literal) · totals"),
  d("S6.5", "R10", C, "[db] calendar keys · literal summaries · scope/tenant null"),
  d("S6.6", "R11", C, "[db] self calendar via employeeOfUser · unlinked ⇒ mNoEmp"),
  d("S7.1", "R12", M, "[db] policy default · hrClock and hrAttendance keep each other · audit"),
  d("S7.2", "R12", M, "[db] range texts · gate = saveClockPolicy · branch writer ⇒ shopWide"),
  d("S8.1", "R4", C, "[race] finaliser waits on hr:clock:<emp> · includes holder's OUT"),
  d("S8.2", "R4", C, "[race] finaliser waits on roster key · judges edited entry"),
  d("S8.3", "R6", C, "[race] 5 parallel runs: 2 alerts · 2 events · then one row per slot"),
  d("S8.4", "R5", M, "[race] 3 parallel recomputes ⇒ one changed"),
  d("S9.1", "R1", M, "[static] judge-rules pure"),
  d("S9.2", "R8", C, "[static] one marked hourly hunk · minute job hr.attendance /5 · crm-cron import"),
  d("S9.3", "R13", C, "[static] actions use server + requireTenant · no now: · page gated + 3 loaders"),
  d("S9.4", "R4", C, "[static] new tables written only in judge.ts"),
  D("S9.5", "-", C, "GREEN", "[static] [control] frozen shas · files unchanged vs base (n/a in base) · nav unchanged"),
  d("S9.6", "§4", M, "[static] messages hr.attendance labels · th = en"),
  d("S9.7", "§7", M, "[static] testids · inventory · tokens · 44 px · visual 2.5 · settings card id"),
  d("S9.8", "Q9", M, "[static] seed: HQC attendance roster + finaliser + attendanceDays"),
  d("S10.1", "§3", C, "[static] migrations · schema · core/scope registry"),
  D("Z1", "-", C, "GREEN", "residue: qc-hr-h25-* tenants/rows/users/sessions/new tables gone"),
];
const REG = makeRegistry(SUITE, "H2.5-", CHECKS);
const chk = REG.chk;
if (ARGV.includes("--list")) {
  REG.printList();
  process.exit(0);
}
const ck = (id: string, r: Record<string, unknown>, expected: string, extra = "") => chk(id, Object.values(r).every(Boolean), expected, `${failedKeys(r)}${extra ? ` ${extra}` : ""}`);

// == time (own +07:00) ==
/** ("2031-03-05", "07:12" | "07:15:59" | "+1 06:10") ⇒ instant */
const bk = (day: string, hm: string): Date => {
  const plus = hm.startsWith("+1 ") ? 1 : 0;
  const [h, mi, s] = hm.replace("+1 ", "").split(":").map(Number);
  const [y, mo, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, mo! - 1, d! + plus, h!, mi!, s ?? 0) - 7 * 3_600_000);
};
const hmOf = (v: unknown) => (v instanceof Date || typeof v === "string" ? new Date(new Date(v as Any).getTime() + 7 * 3_600_000).toISOString().slice(0, 16).replace("T", " ") : "∅");

// == S1 literal vectors ==
const DAY = "2031-03-05";
const SH: Record<string, Any> = {
  M: { startMin: 420, endMin: 900, crossesMidnight: false, graceMin: 15 }, G0: { startMin: 420, endMin: 900, crossesMidnight: false, graceMin: 0 },
  N: { startMin: 1320, endMin: 360, crossesMidnight: true, graceMin: 15 }, Z: { startMin: 960, endMin: 1440, crossesMidnight: false, graceMin: 15 },
};
// [id, shift (null = none · off = day off), events, want "status phase [F=final] [L late] [E early] [W worked] [B break] [O ot] [MO]" (zeros omitted),
//  extras { lv: FULL|AM|PM, pol: overrides, now: HH:MM on DAY (default DAY+2 12:00) }]
type Vec = [string, string | null, string, string, { lv?: string; pol?: Record<string, unknown>; now?: string }?];
const V: Vec[] = [
  ["V01", "M", "IN 06:54, OUT 15:01", "ON_TIME FINAL F W487"],
  ["V02", "M", "IN 07:12, OUT 15:04", "ON_TIME FINAL F W472"],
  ["V03", "M", "IN 07:16, OUT 15:00", "LATE FINAL F L16 W464"],
  ["V04", "M", "IN 07:15:59, OUT 15:00", "ON_TIME FINAL F W464"],
  ["V05", "G0", "IN 07:01, OUT 15:00", "LATE FINAL F L1 W479"],
  ["V06", "M", "IN 06:58, OUT 14:00", "EARLY_OUT FINAL F E60 W422"],
  ["V07", "M", "IN 07:00, OUT 14:56", "ON_TIME FINAL F W476", { pol: { earlyOutGraceMin: 5 } }],
  ["V08", "M", "IN 07:00, OUT 14:00", "ON_TIME FINAL F W420", { pol: { flagEarlyOut: false } }],
  ["V09", "M", "IN 07:20, OUT 14:30", "LATE FINAL F L20 E30 W430"],
  ["V10", "M", "IN 06:55, OUT 17:04", "ON_TIME FINAL F W609 O120"],
  ["V11", "M", "IN 07:00, OUT 16:29", "ON_TIME FINAL F W569 O60", { pol: { otStepMin: 30 } }],
  ["V12", "M", "IN 07:00, OUT 15:14", "ON_TIME FINAL F W494"],
  ["V13", "M", "IN 07:00, BREAK_START 11:00, BREAK_END 11:30, OUT 15:00", "ON_TIME FINAL F W450 B30"],
  ["V14", "M", "IN 07:00, BREAK_START 14:30, OUT 15:00", "ON_TIME FINAL F W450 B30"],
  ["V15", "M", "IN 07:00", "ON_TIME FINAL F MO"],
  ["V16", "M", "", "ABSENT FINAL F"],
  ["V17", "M", "", "LEAVE FINAL F", { lv: "FULL" }],
  ["V18", "M", "IN 07:00, OUT 15:00", "LEAVE FINAL F W480", { lv: "FULL" }],
  ["V19", "M", "IN 11:10, OUT 15:00", "ON_TIME FINAL F W230", { lv: "AM" }],
  ["V20", "M", "IN 07:00, OUT 11:00", "ON_TIME FINAL F W240", { lv: "PM" }],
  ["V21", "M", "", "ABSENT FINAL F", { lv: "AM" }],
  ["V22", "N", "IN 21:50, OUT +1 06:10", "ON_TIME FINAL F W500"],
  ["V23", "N", "IN 22:20, BREAK_START 23:50, BREAK_END +1 00:20, OUT +1 06:00", "LATE FINAL F L20 W430 B30"],
  ["V24", "Z", "IN 16:00, OUT +1 00:31", "ON_TIME FINAL F W511 O30"],
  ["V25", "M", "", "PENDING UPCOMING", { now: "06:30" }],
  ["V26", "M", "", "PENDING NOT_IN", { now: "07:09" }],
  ["V27", "M", "IN 07:16", "LATE OPEN L16 W164", { now: "10:00" }],
  ["V28", "M", "IN 07:00, BREAK_START 09:50", "ON_TIME ON_BREAK W170 B10", { now: "10:00" }],
  ["V29", "M", "", "ABSENT NOT_IN", { now: "15:30" }],
  ["V30", "M", "", "ABSENT NOT_IN", { pol: { absentAfterMin: 120 }, now: "09:00" }],
  ["V31", "M", "", "PENDING NOT_IN", { pol: { absentAfterMin: 120 }, now: "08:59" }],
  ["V32", "M", "IN 07:00, OUT 15:00", "ON_TIME CLOSED W480", { now: "16:00" }],
  ["V33", "M", "IN 07:00, OUT 15:00", "ON_TIME CLOSED W480", { now: "18:59" }],
  ["V34", "M", "IN 07:00, OUT 15:00", "ON_TIME FINAL F W480", { now: "19:00" }],
  ["V35", "off", "", "DAY_OFF FINAL F"],
  ["V36", "off", "IN 10:00, OUT 14:07", "DAY_OFF FINAL F W247 O240"],
  ["V37", null, "IN 09:00, OUT 17:00", "NO_SCHEDULE FINAL F W480"],
  ["V38", null, "IN 09:00, OUT 17:00", "NO_SCHEDULE CLOSED W480", { now: "23:00" }],
  ["V39", "M", "IN 07:05, OUT 11:00, IN 12:00, OUT 15:20", "ON_TIME FINAL F W435 O15"],
  ["V40", "M", "IN 07:40, OUT 10:00, IN 10:30, OUT 14:00", "LATE FINAL F L40 E60 W350"],
];
const GROUP: Record<string, [number, number]> = { "S1.1": [1, 5], "S1.2": [6, 9], "S1.3": [10, 12], "S1.4": [13, 14], "S1.5": [15, 21], "S1.6": [22, 24], "S1.7": [25, 34], "S1.8": [35, 38], "S1.9": [39, 40] };
const evs = (s: string) => (s ? s.split(", ").map((t) => ({ kind: t.split(" ")[0], at: bk(DAY, t.split(" ").slice(1).join(" ")) })) : []);
const vecIn = (id: string): Any => {
  const [, sh, ev, , x] = V.find((v) => v[0] === id)!;
  const [lv, pol, now] = [x?.lv, x?.pol, x?.now];
  return {
    day: DAY, shift: sh && sh !== "off" ? { ...SH[sh] } : null, ...(sh === "off" ? { dayOff: true } : sh === null ? { dayOff: false } : {}), events: evs(ev),
    leave: lv ? { halfDay: lv === "FULL" ? null : lv } : null, policy: { ...PDEF, ...(pol ?? {}) }, closeGraceMin: 240, now: now ? bk(DAY, now) : bk("2031-03-07", "12:00"),
  };
};
const outStr = (o: Any) =>
  !o || typeof o !== "object" ? `∅${short(o, 60)}` : [o.status, o.phase, o.final ? "F" : "", ...(["L", "lateMin", "E", "earlyOutMin", "W", "workedMin", "B", "breakMin", "O", "otMin"] as const).flatMap((k, i, a) => (i % 2 ? [] : [o[a[i + 1]!] ? `${k}${o[a[i + 1]!]}` : ""])), o.missingOut ? "MO" : ""].filter(Boolean).join(" ");
// attribution: [id, entries, events, want "<entry>:ids|…|rest:ids"]
const AE = (id: string, emp: string, day: string, s: number, e: number, cm = false) => ({ id, employeeId: emp, date: day, startMin: s, endMin: e, crossesMidnight: cm });
const AX = (id: string, kind: string, day: string, hm: string, re: string | null = null) => ({ id, kind, at: bk(day, hm), rosterEntryId: re });
const D1 = "2031-03-06";
const ATTR: [string, Any[], Any[], string][] = [
  ["A1", [AE("E1", "me", DAY, 420, 900)], [AX("i", "IN", DAY, "07:20", "E1"), AX("o", "OUT", DAY, "15:30", "E1")], "E1:i,o|rest:"],
  ["A2", [AE("E1", "me", DAY, 420, 900)], [AX("i", "IN", D1, "07:00", "E1")], "E1:|rest:i"],
  ["A3", [AE("E1", "me", DAY, 420, 900), AE("E9", "other", DAY, 420, 900)], [AX("i", "IN", DAY, "07:00", "E9")], "E1:i|rest:"],
  ["A4", [AE("E1", "me", DAY, 420, 900)], [AX("i", "IN", DAY, "04:30"), AX("o", "OUT", DAY, "15:00")], "E1:i,o|rest:"],
  ["A5", [AE("E2", "me", D1, 60, 540)], [AX("i", "IN", DAY, "20:00")], "E2:|rest:i"],
  ["A6", [AE("E1", "me", DAY, 420, 660), AE("E2", "me", DAY, 780, 1020)], [AX("i1", "IN", DAY, "06:55", "E1"), AX("o1", "OUT", DAY, "11:02", "E1"), AX("i2", "IN", DAY, "12:58", "E2"), AX("o2", "OUT", DAY, "17:00", "E2")], "E1:i1,o1|E2:i2,o2|rest:"],
  ["A7", [AE("E1", "me", DAY, 420, 660)], [AX("i", "IN", DAY, "07:00", "E1"), AX("o", "OUT", DAY, "19:30")], "E1:i|rest:o"],
  ["A8", [AE("N", "me", DAY, 1320, 360, true)], [AX("i", "IN", DAY, "21:50", "N"), AX("b", "BREAK_START", DAY, "+1 00:10", "N"), AX("e", "BREAK_END", DAY, "+1 00:40", "N"), AX("o", "OUT", DAY, "+1 06:05", "N")], "N:i,b,e,o|rest:"],
  ["A9", [AE("E1", "me", DAY, 420, 900), AE("E3", "me", DAY, 480, 960)], [AX("i", "IN", DAY, "07:40")], "E1:|E3:i|rest:"],
];
const attrStr = (r: Any, ids: string[]) => (!r?.byEntry ? `∅${short(r, 60)}` : [...ids.map((id) => `${id}:${(r.byEntry[id] ?? []).join(",")}`), `rest:${(r.rest ?? []).join(",")}`].join("|"));

// == statics ==
const BASE_REF = baseRef("QC_H25_BASE");
const IN_BASE = pathInBase(F.judge, BASE_REF);
const code = (p: string) => stripComments(rd(p));
function runStatic(): void {
  {
    const s = code(F.rules);
    const imp = importsOf(s);
    const r = {
      exists: !!s, imports: imp.every((i) => i.type || /^\.\/(time-rules|clock-rules)$/.test(i.spec)) && !/\bimport\s*\(|\brequire\(/.test(s),
      noClock: !/new Date\(\s*\)|Date\.now\(/.test(s), noDb: !/tenantDb|prisma|\$queryRaw|\$executeRaw/.test(s),
      exports: ["judgeEntry", "attributeSessions", "attendancePolicyOf", "ATTENDANCE_POLICY_DEFAULT", "JUDGE_ENGINE_VERSION"].every((n) => new RegExp(`export\\s+(const|function)\\s+${n}\\b`).test(s)),
    };
    ck("S9.1", r, "pure · 5 exports", `imports=[${imp.map((i) => i.spec)}]`);
  }
  {
    const route = rd(F.hourly);
    const marks = (route.match(/\/\/ HR H2\.5 ▸/g) ?? []).length;
    const at = route.indexOf("// HR H2.5 ▸");
    const blk = at >= 0 ? route.slice(at, at + 1200) : "";
    const hunks = IN_BASE ? [] : diffHunks(BASE_REF, F.hourly);
    const unmarked = hunks === null ? -1 : hunks.filter((h) => !h.added.some((l) => /HR H2\.5/.test(l))).length;
    const job = code(F.job);
    const r = {
      oneMark: marks === 1, call: /runAttendanceJobs\(\s*\{\s*now:\s*new Date\(\)/.test(blk) && /try\s*\{/.test(blk) && /logOps\(/.test(blk),
      hunks: IN_BASE || (!!hunks?.length && unmarked === 0), noField: !/attendance\w*\s*[,:]/i.test(route.slice(route.lastIndexOf("NextResponse.json({"))),
      job: /registerMinuteJob\(/.test(job) && /["']hr\.attendance["']/.test(job) && /everyMinutes:\s*5\b/.test(job) && /runAttendanceJobs\(/.test(job), crmCron: /attendance-job/.test(rd(F.crmCron)),
    };
    ck("S9.2", r, "1 marked hunk · job · import", `marks=${marks} hunks=${hunks?.length ?? "?"} unmarked=${unmarked}`);
  }
  {
    const [acts, ui, page] = [code(F.acts), code(F.ui), code(F.page)];
    const a = useServerFile(acts, ["recomputeAttendanceDayAction", "saveAttendancePolicyAction"], [/requireTenant\(/]);
    const both = page + ui;
    const r = { ...a.r, noNow: ![acts, ui, page].some((s) => /\bnow\s*:/.test(s)), gate: /notFound\(\)/.test(page) && ["loadAttendanceBoard", "loadAttendanceMonth", "myAttendanceMonth"].every((f) => both.includes(`${f}(`)), noOld: !/monthlyAttendance\(/.test(both) };
    ck("S9.3", r, "use server · no now · gated page", `exported=[${a.got}]`);
  }
  {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const n of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const p = `${dir}/${n.name}`;
        if (n.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(n.name) && p !== F.judge && /hrAttendance(Day|Alert)\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b|(INSERT INTO|UPDATE|DELETE FROM)\s+"HrAttendance(Day|Alert)"/.test(stripComments(readFileSync(join(ROOT, p), "utf8")))) hits.push(p);
      }
    };
    walk("src");
    const j = code(F.judge);
    chk("S9.4", /HrAttendanceDay|hrAttendanceDay/.test(j) && /HrAttendanceAlert|hrAttendanceAlert/.test(j) && !hits.length, "writers only in judge.ts", `judge=${!!j} others=[${hits.slice(0, 4)}]`);
  }
  {
    const diff = IN_BASE ? "unchanged" : changedVsBase(BASE_REF, FROZEN);
    const n = hrNavLabels();
    const nav = canon(["ภาพรวม", "ลงเวลา", "ตารางกะ", "จอลงเวลา", "ใบลา", "พนักงาน", "เงินเดือน", "ตั้งค่า", "ตารางกฎหมาย"]);
    const r = { payroll: sha(rd(PAYROLL_RULES_FILE)) === PAYROLL_RULES_SHA, brain: sha(rd(`${H}rules.ts`)) === BRAIN_SHA, seam: sha(rd(`${H}pos-seam.ts`)) === SEAM_SHA, frozen: diff === "unchanged", nav: canon(n.T) === nav && canon(n.L) === nav };
    ck("S9.5", r, `shas · ${FROZEN.length} unchanged · nav`, `${IN_BASE ? "n/a · H2.5 in base" : diff} (base ${BASE_REF.slice(0, 9) || "?"})`);
  }
  {
    const th = flat(jsonOf(F.th)?.hr?.attendance ?? {});
    const vals = Object.values(th).map(String);
    const re = (t: string) => new RegExp(`^${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{n\\\}/g, "\\{\\w+\\}")}$`);
    const miss = LABELS_TH.filter((t) => !vals.some((v) => re(t).test(v)));
    const p = msgParity(th, flat(jsonOf(F.en)?.hr?.attendance ?? {}), []);
    chk("S9.6", vals.length > 0 && !miss.length && Object.values(p).every(Boolean), `${LABELS_TH.length} labels · th=en`, `${failedKeys(p)} missing=[${miss.join(" | ")}]`);
  }
  {
    const ids = testidsOf(rd(F.ui) + rd(F.page), "hr-att-");
    const miss = TESTIDS.filter((t) => ![...ids].some((i) => (t.endsWith("-") ? i.startsWith(t) : i === t)));
    const p = inventoryParity("/hr/attendance", ids, "H2.5", SUITE);
    const ui = code(F.ui);
    const [btn, tall] = [(ui.match(/<button\b/g) ?? []).length, (ui.match(/min-h-\[44px\]|min-h-11\b/g) ?? []).length];
    const v = rd(F.visual);
    const vb = v.indexOf('"2.5"') >= 0 ? v.slice(v.indexOf('"2.5"'), v.indexOf('"2.5"') + 3000) : "";
    const r = { ids: ids.size > 0 && !miss.length, inv: p.rows > 0 && !p.codeNoRow.length && !p.rowNoCode.length && p.meta, card: /hr-settings-attendance-policy/.test(rd(F.setPage) + rd(F.ui)), ...tokensOnly(ui + code(F.page)), tall: btn > 0 && tall >= btn, visual: /view=day/.test(vb) && /view=month/.test(vb) };
    ck("S9.7", r, "ids · inventory · tokens · 44 px · visual", `missing=[${miss}] rows=${p.rows} codeNoRow=${p.codeNoRow.slice(0, 3)} rowNoCode=${p.rowNoCode.slice(0, 3)} btn=${btn}/${tall}`);
  }
  ck("S9.8", { hqc: /attendanceRoster/.test(rd(F.hqc)), seed: /runAttendanceJobs\(/.test(rd(F.seed)) && /attendanceDays/.test(rd(F.seed)) }, "HQC.attendanceRoster · seed finalises", "");
  {
    const m0 = rd(F.mig0);
    const m1 = rd(F.mig1).replace(/--.*$/gm, "").trim();
    const s = rd(F.schema);
    const en = s.indexOf("enum HrAttendanceJudgement");
    const r = {
      m0: /CREATE TYPE "HrAttendanceAlertKind" AS ENUM \('NOT_IN', 'ABSENT'\)/.test(m0) && /CREATE TABLE "HrAttendanceDay"/.test(m0) && /CREATE TABLE "HrAttendanceAlert"/.test(m0) && !/ALTER TYPE/.test(m0),
      uniques: /CREATE UNIQUE INDEX "[^"]+" ON "HrAttendanceDay"\("employeeId", "date", "slotKey"\)/.test(m0) && /CREATE UNIQUE INDEX "[^"]+" ON "HrAttendanceAlert"\("employeeId", "rosterEntryId", "kind"\)/.test(m0),
      m1: /^ALTER TYPE "HrAttendanceJudgement" ADD VALUE 'LEAVE';?$/.test(m1),
      schema: /model HrAttendanceDay \{/.test(s) && /model HrAttendanceAlert \{/.test(s) && /enum HrAttendanceAlertKind/.test(s) && en >= 0 && /\bLEAVE\b/.test(s.slice(en, s.indexOf("}", en))),
      registry: /HrAttendanceDay:\s*sys\(\)/.test(rd(F.scope)) && /HrAttendanceAlert:\s*sys\(\)/.test(rd(F.scope)),
    };
    ck("S10.1", r, "migrations · schema · registry", "");
  }
}

// == SKIP guard + modules ==
const skipReasons = existsSync(join(ROOT, F.judge)) ? [] : [`H2.5 not built: ${F.judge} absent`];
if (skipReasons.length && !FORCE) REG.skipExit(skipReasons);
const { P, coreHash } = await qc4Env(SUITE);
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — running although: ${skipReasons.join(" · ")} (expect RED for the right reason, no crash)`);
const mods = {
  rules: await loadOpt(F.rules, "@/lib/modules/hr/judge-rules"),
  judge: await loadOpt(F.judge, "@/lib/modules/hr/judge"),
  cset: (await import("@/lib/modules/hr/clock-settings")) as Any,
  sys: (await import("@/lib/modules/system/service")) as Any,
  cons: (await import("@/lib/outbox-consumers" as string).catch((e: unknown) => ({ __err: errText(e) }))) as Any,
  auto: (await import("@/lib/automation/labels")) as Any,
  hooks: (await import("@/lib/webhooks/labels")) as Any,
};
const JR: Any = mods.rules && !mods.rules.__err ? mods.rules : {};
const JG: Any = mods.judge && !mods.judge.__err ? mods.judge : {};
console.log(`[${SUITE}] modules: judge-rules=${st(mods.rules, F.rules)} · judge=${st(mods.judge, F.judge)}`);
async function call(M0: Any, fn: string, ...a: unknown[]): Promise<Any> {
  if (typeof M0?.[fn] !== "function") return { __err: `∅${fn}` };
  try {
    return await M0[fn](...a);
  } catch (e) {
    return { __err: `THROW ${errText(e)}` };
  }
}
const pure = (fn: string, ...a: unknown[]): Any => {
  try {
    return typeof JR[fn] === "function" ? JR[fn](...a) : `∅${fn}`;
  } catch (e) {
    return `THROW ${errText(e).slice(0, 50)}`;
  }
};
const said = (r: Any, t: string) => !!r && r.ok === false && r.reason === t;
const shown = (r: Any) => (!r ? "null" : r.__err ? r.__err : r.ok === false ? `"${short(r.reason, 40)}"` : r.ok === true ? `ok${r.changed !== undefined ? `/c=${r.changed}` : ""}` : "dto");

const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const SLUG = `${SLUG_PREFIX}${stamp}`;
const tag = tagOf(stamp);
const fx = makeFixtures(P, coreHash, SLUG);
const FIX_TS = new Date("2031-02-01T00:00:00Z");
const NEW_TABLES = ["HrAttendanceAlert", "HrAttendanceDay"];
const dayRows = (tid: string) => fx.rawRows(`SELECT * FROM "HrAttendanceDay" WHERE "tenantId" = $1 ORDER BY "employeeId", "date", "slotKey"`, tid);
const alertRows = async (tid: string) => fx.rawRows(`SELECT * FROM "HrAttendanceAlert" WHERE "tenantId" = $1 ORDER BY "firedAt", "id"`, tid);
const JCOLS = ["status", "lateMin", "earlyOutMin", "workedMin", "breakMin", "otMin", "missingOut", "startMin", "version", "updatedAt"];
const sig = (rows: Any[] | null) => (rows ? rows.map((r) => `${r.id}:${JCOLS.map((c) => (r[c] instanceof Date ? r[c].toISOString() : String(r[c]))).join("/")}`).join(";") : "∅");

// == DB ==
async function runDb(): Promise<void> {
  // ── S1 pure ──
  for (const [g, [a, b]] of Object.entries(GROUP)) {
    const bad: string[] = [];
    for (let i = a; i <= b; i++) {
      const v = V[i - 1]!;
      const got = typeof JR.judgeEntry === "function" ? outStr(pure("judgeEntry", vecIn(v[0]))) : "∅judgeEntry";
      if (got !== v[3]) bad.push(`${v[0]}=${got}`);
    }
    chk(g, !bad.length, `${b - a + 1} vectors`, bad.length ? bad.slice(0, 4).join(" · ") : "all");
  }
  {
    const inp = vecIn("V16");
    const before = canon(inp);
    const [o1, o2, oN, oO, oA] = [pure("judgeEntry", inp), pure("judgeEntry", inp), pure("judgeEntry", vecIn("V22")), pure("judgeEntry", vecIn("V35")), pure("judgeEntry", vecIn("V30"))];
    const r = {
      keys: !!o1 && typeof o1 === "object" && Object.keys(o1).sort().join(",") === OUT_KEYS,
      alert: hmOf(o1?.alertAt) === "2031-03-05 07:10" && hmOf(o1?.absentAt) === "2031-03-05 15:00",
      night: hmOf(oN?.alertAt) === "2031-03-05 22:10" && hmOf(oN?.absentAt) === "2031-03-06 06:00",
      setting: hmOf(oA?.absentAt) === "2031-03-05 09:00", noShift: oO?.alertAt === null && oO?.absentAt === null,
      same: typeof o1 === "object" && canon(o1) === canon(o2), untouched: canon(inp) === before,
    };
    ck("S1.10", r, "keys · literals · deterministic", `keys=${typeof o1 === "object" && o1 ? Object.keys(o1).sort().join(",") : o1}`);
  }
  {
    const p = (x: unknown) => canon(pure("attendancePolicyOf", x));
    const d = canon(PDEF);
    const full = { notInAlertMin: 30, absentAfterMin: 120, earlyOutGraceMin: 5, flagEarlyOut: false, otStepMin: 30, alertsOn: false, alertEmployee: true };
    const r = {
      constant: canon(JR.ATTENDANCE_POLICY_DEFAULT) === d && JR.JUDGE_ENGINE_VERSION === 1,
      nul: p(null) === d && p("x") === d && p([]) === d && p({ absentAfterMin: null }) === d,
      full: p(full) === canon(full),
      bad: p({ notInAlertMin: 241, absentAfterMin: 29, earlyOutGraceMin: 61, otStepMin: 7, flagEarlyOut: "yes", alertsOn: 1, alertEmployee: "no" }) === d,
      edges: p({ notInAlertMin: 0, absentAfterMin: 30, otStepMin: 1 }) === canon({ ...PDEF, notInAlertMin: 0, absentAfterMin: 30, otStepMin: 1 }) && p({ notInAlertMin: 10.5, absentAfterMin: 721, earlyOutGraceMin: 60 }) === canon({ ...PDEF, earlyOutGraceMin: 60 }),
    };
    ck("S1.11", r, "parser literals", `p(null)=${p(null)}`);
  }
  {
    const bad: string[] = [];
    for (const [id, ents, ev, want] of ATTR) {
      const ids = [...new Set(ents.filter((e) => e.employeeId === "me").map((e) => e.id as string))].sort();
      const got = typeof JR.attributeSessions === "function" ? attrStr(pure("attributeSessions", ents, ev, { employeeId: "me", earlyInMin: 120, closeGraceMin: 240 }), ids) : "∅attributeSessions";
      if (got !== want) bad.push(`${id}=${got}`);
    }
    chk("S1.12", !bad.length, `${ATTR.length} vectors`, bad.length ? bad.slice(0, 3).join(" · ") : "all");
  }

  // ── fixtures ──
  const TT = await fx.newTenant("", "QC HR H2.5");
  const T2 = await fx.newTenant("-other", "QC HR H2.5 other");
  const u1 = await fx.newUnit(TT, `north ${tag}`, "u1");
  await sleep(15);
  const u2 = await fx.newUnit(TT, `south ${tag}`, "u2");
  const sys = async (t: string, n: string) => (await mods.sys.createSystem(t, "HR", n)).id as string;
  const [sA, sB, sC, sO] = [await sys(TT, "HR A"), await sys(TT, "HR B"), await sys(TT, "HR C"), await sys(T2, "HR O")];
  const cA = { tenantId: TT, systemId: sA };
  const U: Record<string, Who> = {};
  for (const [k, role, ua, perm] of [
    ["owner", "OWNER", [], {}], ["mgrAll", "MANAGER", ["*"], {}], ["mgrU1", "MANAGER", [u1], {}], ["mgrEmpty", "MANAGER", [], {}],
    ["writer", "STAFF", ["*"], { "hr.employee.create": true }], ["writerU2", "STAFF", [u2], { "hr.employee.create": true }], ["payroll", "STAFF", ["*"], { "hr.payroll.read": true }],
    ["leaveReader", "STAFF", ["*"], { "hr.leave.read": true }], ["member", "STAFF", [], {}], ["self", "STAFF", [], {}], ["mgrSelf", "MANAGER", [u1], {}], ["selfB", "STAFF", [], {}], ["other", "OWNER", [], {}],
  ] as [string, Who["role"], string[], Record<string, boolean>][]) U[k] = await fx.mkUser(k === "other" ? T2 : TT, k.toLowerCase(), `QC ${k} ${tag}`, role, ua, perm);
  const NM = { e1: `หนึ่ง ${tag}`, e3: `สาม ${tag}` };
  const me = (tid: string, s: string, name: string, o: Record<string, unknown> = {}) => fx.mkEmp(tid, s, name, { startDate: "2030-01-01", ...o });
  const E = {
    e1: await me(TT, sA, NM.e1, { unitId: u1, linkedUserId: U.self!.id }), e2: await me(TT, sA, `สอง ${tag}`, { unitId: u1 }), e3: await me(TT, sA, NM.e3, { unitId: u2 }),
    eM: await me(TT, sA, `หัวหน้า ${tag}`, { unitId: u1, linkedUserId: U.mgrSelf!.id }), eL: await me(TT, sA, `เดิม ${tag}`, { unitId: u1 }), eN: await me(TT, sA, `ว่าง ${tag}`, { unitId: u1 }),
    eE: await me(TT, sA, `ออก ${tag}`, { unitId: u1, endDate: "2031-03-04" }), eB: await me(TT, sB, `บี ${tag}`, { unitId: u1, linkedUserId: U.selfB!.id }),
    eC: await me(TT, sC, `ซี ${tag}`, { unitId: u1 }), eO: await me(T2, sO, `อื่น ${tag}`),
  };
  const SHT: Record<string, [number, number, boolean]> = {};
  const mkShift = async (tid: string, s: string, name: string, a: number, b: number, cm = false) => {
    const id = (await P.hrShift.create({ data: { tenantId: tid, systemId: s, name: `${name} ${tag}`, startMin: a, endMin: b, crossesMidnight: cm, graceMin: 15 } })).id as string;
    SHT[id] = [a, b, cm];
    return id;
  };
  const [shM, shN, shS1, shS2] = [await mkShift(TT, sA, "กะเช้า", 420, 900), await mkShift(TT, sA, "กะดึก", 1320, 360, true), await mkShift(TT, sA, "กะแยกเช้า", 420, 660), await mkShift(TT, sA, "กะแยกบ่าย", 780, 1020)];
  const [shB, shC, shO] = [await mkShift(TT, sB, "กะเช้าบี", 420, 900), await mkShift(TT, sC, "กะเช้าซี", 420, 900), await mkShift(T2, sO, "กะเช้าอื่น", 420, 900)];
  const ent = async (emp: string, day: string, shiftId: string, unitId: string | null, o: { tid?: string; sys?: string; pub?: boolean } = {}) => {
    const [a, b, cm] = SHT[shiftId]!;
    const pub = o.pub ?? true;
    return (await P.hrRosterEntry.create({ data: { tenantId: o.tid ?? TT, systemId: o.sys ?? sA, employeeId: emp, date: dbDate(day), shiftId, unitId, startMin: a, endMin: b, breakMin: 0, crossesMidnight: cm, published: pub, publishedAt: pub ? FIX_TS : null, source: "MANUAL" } })).id as string;
  };
  const att = async (emp: string, kind: string, at: Date, re: string | null, x: Record<string, unknown> = {}) =>
    (await P.hrAttendance.create({ data: { tenantId: TT, systemId: sA, employeeId: emp, kind, at, rosterEntryId: re, source: "KIOSK", ...x } })).id as string;
  const atts = async (emp: string, day: string, re: string | null, list: [string, string][]) => { for (const [k, hm] of list) await att(emp, k, bk(day, hm), re); };
  const lv = async (emp: string, type: string, day: string, status: string) => (await P.hrLeave.create({ data: { tenantId: TT, systemId: sA, employeeId: emp, type, fromDate: dbDate(day), toDate: dbDate(day), status, reason: `เหตุผลลับ ${tag}` } })).id as string;
  const W = { mon: "2031-03-03", thu: "2031-03-06", fri: "2031-03-07", sat: "2031-03-08", sun: "2031-03-09", wed: DAY };
  const N1 = bk("2031-03-10", "12:00");
  // e1: Wed on time (geo/note must never leak) · Thu SICK approved · Fri PENDING · Sat unpublished · Sun holiday
  const x1w = await ent(E.e1, W.wed, shM, u1);
  await att(E.e1, "IN", bk(W.wed, "06:58"), x1w, { lat: 13.75, lng: 100.5, accuracyM: 20, deviceId: `dev-secret-${tag}`, note: `หมายเหตุลับ ${tag}`, distanceM: 35, inRadius: true, source: "MOBILE" });
  await att(E.e1, "OUT", bk(W.wed, "15:00"), x1w);
  await ent(E.e1, W.thu, shM, u1);
  await lv(E.e1, "SICK", W.thu, "APPROVED");
  await ent(E.e1, W.fri, shM, u1);
  const lvFri = await lv(E.e1, "PERSONAL", W.fri, "PENDING");
  await ent(E.e1, W.sat, shS1, u1, { pub: false });
  const hol = (await P.hrHoliday.create({ data: { tenantId: TT, systemId: sA, date: dbDate(W.sun), name: `หยุด ${tag}`, kind: "SHOP" } })).id as string;
  // e2: Wed linked LATE · Thu adopted (unlinked) · Fri stale link (row on Sat) · Sun split
  const x2w = await ent(E.e2, W.wed, shM, u1);
  const in2w = await att(E.e2, "IN", bk(W.wed, "07:20"), x2w);
  await att(E.e2, "OUT", bk(W.wed, "15:30"), x2w);
  await ent(E.e2, W.thu, shM, u1);
  await atts(E.e2, W.thu, null, [["IN", "04:30"], ["OUT", "15:00"]]);
  const x2f = await ent(E.e2, W.fri, shM, u1);
  await att(E.e2, "IN", bk(W.sat, "07:00"), x2f);
  const [xs1, xs2] = [await ent(E.e2, W.sun, shS1, u1), await ent(E.e2, W.sun, shS2, u1)];
  await atts(E.e2, W.sun, xs1, [["IN", "06:55"], ["OUT", "11:02"]]);
  await atts(E.e2, W.sun, xs2, [["IN", "12:58"], ["OUT", "17:00"]]);
  // e3 (u2): overnight + break across midnight · an IN carrying e2's Fri entry id
  await atts(E.e3, W.wed, await ent(E.e3, W.wed, shN, u2), [["IN", "21:50"], ["BREAK_START", "+1 00:10"], ["BREAK_END", "+1 00:40"], ["OUT", "+1 06:05"]]);
  await att(E.e3, "IN", bk(W.fri, "07:05"), x2f);
  // eM manager's own row · eL legacy template · eN unrostered · eE ended · eO other tenant
  await atts(E.eM, W.wed, await ent(E.eM, W.wed, shM, u1), [["IN", "07:30"], ["OUT", "15:00"]]);
  for (const [wd, off] of [[3, false], [4, true]] as const) await P.hrWorkSchedule.create({ data: { tenantId: TT, systemId: sA, employeeId: E.eL, weekday: wd, dayOff: off, startMin: 540, endMin: 1080, graceMin: 10, createdAt: new Date("2031-01-01T00:00:00Z") } });
  await atts(E.eL, W.wed, null, [["IN", "09:12"], ["OUT", "18:00"]]);
  await att(E.eN, "IN", bk(W.wed, "09:00"), null);
  const outN = await att(E.eN, "OUT", bk(W.wed, "17:00"), null);
  await ent(E.eE, W.wed, shM, u1);
  await ent(E.eO, W.wed, shO, null, { tid: T2, sys: sO });
  await ent(E.e1, "2031-02-19", shM, u1); // own week, outside the D−7 window

  const month = (ctx: Any, w: Who, emp: string) => call(JG, "loadAttendanceMonth", ctx, vOf(w), { employeeId: emp, month: "2031-03" }, { now: N1 });
  const slotsOf = (dto: Any, day: string): Any[] => (dto?.days ?? []).find((x: Any) => x.day === day)?.slots ?? [];
  const sl = (s: Any) => (!s ? "∅" : `${s.slotKey === "DAY" ? "DAY" : "E"}:${s.status}|L${s.lateMin}|E${s.earlyOutMin}|W${s.workedMin}|O${s.otMin}${s.missingOut ? "|MO" : ""}`);
  const cal: Record<string, Any> = {};
  for (const k of ["e1", "e2", "e3", "eL", "eN", "eE"] as const) cal[k] = await month(cA, U.owner!, E[k]);
  const day = (k: string, d: string) => slotsOf(cal[k], d).map(sl).join(" + ") || "-";
  // [check, employee, day, want] — slot strings literal (E = rostered entry, DAY = day slot)
  const SLOTS: [string, string, string, string][] = [
    ["S2.1", "e2", W.wed, "E:LATE|L20|E0|W490|O30"], ["S2.2", "e2", W.thu, "E:ON_TIME|L0|E0|W630|O0"],
    ["S2.3", "e2", W.fri, "E:ABSENT|L0|E0|W0|O0"], ["S2.3", "e2", W.sat, "DAY:DAY_OFF|L0|E0|W0|O0|MO"], ["S2.3", "e3", W.fri, "DAY:DAY_OFF|L0|E0|W0|O0|MO"],
    ["S2.4", "e2", W.sun, "E:ON_TIME|L0|E0|W247|O0 + E:ON_TIME|L0|E0|W242|O0"],
    ["S2.5", "e3", W.wed, "E:ON_TIME|L0|E0|W465|O0"], ["S2.5", "e3", W.thu, "DAY:DAY_OFF|L0|E0|W0|O0"],
    ["S2.6", "eN", W.wed, "DAY:NO_SCHEDULE|L0|E0|W480|O0"], ["S2.6", "eN", W.thu, "-"], ["S2.6", "eL", W.wed, "DAY:LATE|L12|E0|W528|O0"], ["S2.6", "eL", W.thu, "DAY:DAY_OFF|L0|E0|W0|O0"],
    ["S2.7", "e1", W.mon, "DAY:DAY_OFF|L0|E0|W0|O0"], ["S2.7", "e1", W.sat, "DAY:DAY_OFF|L0|E0|W0|O0"], ["S2.7", "e1", W.thu, "E:LEAVE|L0|E0|W0|O0"], ["S2.7", "e1", W.fri, "E:ABSENT|L0|E0|W0|O0"], ["S2.7", "eE", W.wed, "-"],
  ];
  const s2x: Record<string, boolean> = {
    "S2.1": slotsOf(cal.e2, W.wed)[0]?.slotKey === x2w && slotsOf(cal.e2, W.wed)[0]?.stored === false && slotsOf(cal.e2, W.wed)[0]?.final === true,
    "S2.2": !!slotsOf(cal.e2, W.thu)[0]?.shift, "S2.3": slotsOf(cal.e2, W.fri)[0]?.slotKey === x2f,
    "S2.4": srt(slotsOf(cal.e2, W.sun).map((s) => s.slotKey)) === srt([xs1, xs2]), "S2.5": slotsOf(cal.e3, W.wed)[0]?.breaks?.length === 1,
    "S2.6": !!cal.eN?.days && !!cal.eL?.days, "S2.7": !!slotsOf(cal.e1, W.thu)[0]?.leave && slotsOf(cal.e1, W.fri)[0]?.leave?.pending === true && !!cal.eE?.days,
  };
  for (const g of Object.keys(s2x)) {
    const bad = SLOTS.filter((x) => x[0] === g && day(x[1], x[2]) !== x[3]).map((x) => `${x[1]}@${x[2].slice(5)}=${day(x[1], x[2])}`);
    chk(g, !bad.length && s2x[g], SLOTS.filter((x) => x[0] === g).map((x) => `${x[1]}@${x[2].slice(5)}=${x[3]}`).join(" · ").slice(0, 160), `${bad.join(" · ").slice(0, 200) || "slots ok"} · extra=${s2x[g]}`);
  }

  // ── S6 viewer matrix (live, before any snapshot) ──
  const board = (ctx: Any, w: Who, i: Record<string, unknown> = {}) => call(JG, "loadAttendanceBoard", ctx, vOf(w), { day: W.wed, ...i }, { now: N1 });
  const B: Record<string, Any> = {};
  for (const k of Object.keys(U)) B[k] = await board(k === "other" ? { tenantId: T2, systemId: sA } : cA, U[k]!);
  const isDto = (b: Any) => !!b && !b.__err && Array.isArray(b.rows);
  const rowsOf = (b: Any): string[] => (isDto(b) ? b.rows.map((r: Any) => r.employeeId) : []);
  {
    const yes = ["owner", "mgrAll", "mgrU1", "mgrEmpty", "writer", "writerU2", "mgrSelf"];
    const no = ["payroll", "leaveReader", "member", "self", "selfB", "other"];
    ck("S6.1", { yes: yes.every((k) => isDto(B[k])), no: no.every((k) => B[k] === null || (k === "other" && isDto(B[k]) && !B[k].rows.length)) }, "7 dto · 6 null", [...yes, ...no].map((k) => `${k}=${shown(B[k])}`).join(" "));
  }
  {
    const u1set = srt([E.e1, E.e2, E.eM, E.eL, E.eN]);
    const b2 = await board(cA, U.mgrU1!, { unit: u2 });
    const r = {
      owner: srt(rowsOf(B.owner)) === srt([E.e1, E.e2, E.e3, E.eM, E.eL, E.eN]), mgrU1: srt(rowsOf(B.mgrU1)) === u1set && canon(B.mgrU1?.units?.map((u: Any) => u.id)) === canon([u1]) && !JSON.stringify(B.mgrU1 ?? "").includes(u2),
      clamp: srt(rowsOf(b2)) === u1set && !JSON.stringify(b2 ?? "").includes(u2), writerU2: srt(rowsOf(B.writerU2)) === E.e3, empty: rowsOf(B.owner).length > 0 && srt(rowsOf(B.mgrEmpty)) === srt(rowsOf(B.owner)),
    };
    ck("S6.2", r, "6 · u1 5 · clamp · u2 1 · [] all", `n=${["owner", "mgrU1", "writerU2"].map((k) => rowsOf(B[k]).length)} clamp=${rowsOf(b2).length}`);
  }
  {
    const all = ["owner", "mgrU1", "writer"].map((k) => B[k]);
    const bad = all.flatMap((b) => [...keysDeep(b)].filter((k) => FORBID.includes(k)));
    const json = JSON.stringify(all);
    const s0 = B.owner?.rows?.[0]?.slots?.[0];
    const thu = async (w: Who) => String(((await call(JG, "loadAttendanceBoard", cA, vOf(w), { day: W.thu }, { now: N1 }))?.rows ?? []).find((r: Any) => r.employeeId === E.e1)?.slots?.[0]?.leave?.label ?? "∅");
    const [lo, lm, lw] = [await thu(U.owner!), await thu(U.mgrU1!), await thu(U.writer!)];
    const keys = (o: Any) => (o && typeof o === "object" ? Object.keys(o).sort().join(",") : "∅");
    const r = {
      top: isDto(B.owner) && keys(B.owner) === TOP_KEYS, slot: keys(s0) === SLOT_KEYS, noKeys: !bad.length,
      noValues: isDto(B.owner) && ![`dev-secret-${tag}`, `หมายเหตุลับ ${tag}`, `เหตุผลลับ ${tag}`, "13.75", "pinHash"].some((x) => json.includes(x)), wide: /ป่วย/.test(lo) && /ป่วย/.test(lm), narrow: lw === "ลา",
    };
    ck("S6.3", r, "keys · no sensitive · leave type wide only", `top=${keys(B.owner)} slot=${keys(s0)} bad=[${bad}] leave=${lo}/${lm}/${lw}`);
  }
  {
    const got = Object.fromEntries((["e1", "e2", "e3", "eM", "eL", "eN"] as const).map((k) => [k, ((B.owner?.rows ?? []).find((r: Any) => r.employeeId === E[k])?.slots ?? []).map((s: Any) => s.status).join("+")]));
    const want = { e1: "ON_TIME", e2: "LATE", e3: "ON_TIME", eM: "LATE", eL: "LATE", eN: "NO_SCHEDULE" };
    const c = B.owner?.totals?.counts ?? {};
    chk("S6.4", canon(got) === canon(want) && !rowsOf(B.owner).includes(E.eE) && c.ON_TIME === 2 && c.LATE === 3 && B.owner?.totals?.workedMin === 2895, "statuses · counts 2/3 · worked 2895", `${canon(got)} c=${canon(c)} w=${B.owner?.totals?.workedMin}`);
  }
  {
    const s1 = { workDays: 1, onTime: 1, lateCount: 0, lateMin: 0, earlyOutCount: 0, absentDays: 1, leaveDays: 1, dayOffDays: 4, missingOut: 0, otMin: 0, workedMin: 482, pendingDays: 0 };
    const s2 = { workDays: 3, onTime: 3, lateCount: 1, lateMin: 20, earlyOutCount: 0, absentDays: 1, leaveDays: 0, dayOffDays: 3, missingOut: 1, otMin: 30, workedMin: 1609, pendingDays: 0 };
    const [m3, mO] = [await month(cA, U.mgrU1!, E.e3), await month(cA, U.owner!, E.eO)];
    const r = { keys: !!cal.e2?.days && Object.keys(cal.e2).sort().join(",") === "days,employee,month,summary" && Object.keys(cal.e2.summary ?? {}).sort().join(",") === SUM_KEYS, e1: canon(cal.e1?.summary) === canon(s1), e2: canon(cal.e2?.summary) === canon(s2), scope: m3 === null, tenant: mO === null };
    ck("S6.5", r, "keys · summaries · null ×2", `e1=${canon(cal.e1?.summary)} e2=${canon(cal.e2?.summary)} m3=${shown(m3)} mO=${shown(mO)}`);
  }
  {
    const mine = await call(JG, "myAttendanceMonth", { tenantId: TT, userId: U.self!.id }, { month: "2031-03", employeeId: E.e2 }, { now: N1 });
    const none = await call(JG, "myAttendanceMonth", { tenantId: TT, userId: U.member!.id }, { month: "2031-03" }, { now: N1 });
    const r = { ok: mine?.ok === true && mine?.employee?.id === E.e1, same: canon(mine?.summary) === canon(cal.e1?.summary), ownType: /ป่วย/.test(String(slotsOf(mine, W.thu)[0]?.leave?.label ?? "")), unlinked: said(none, T.mNoEmp) };
    ck("S6.6", r, "own · id ignored · own type · mNoEmp", `mine=${shown(mine)} none=${shown(none)}`);
  }

  // ── S3 finaliser ──
  const x2t = await ent(E.e2, "2031-03-10", shM, u1); // today of N1, open
  await att(E.e2, "IN", bk("2031-03-10", "07:00"), x2t);
  const cnt = async (m: string) => P[m].count({ where: { tenantId: TT } }) as Promise<number>;
  const [ob0, au0] = [await cnt("outboxEvent"), await cnt("auditLog")];
  const job = (now: Date, tenantId = TT) => call(JG, "runAttendanceJobs", { now, tenantId });
  const run1 = await job(N1);
  const rows1 = await dayRows(TT);
  const rowOf = (rows: Any[] | null, emp: string, d: string, key?: string) => (rows ?? []).find((r) => r.employeeId === emp && new Date(r.date).getTime() === dbDate(d).getTime() && (!key || r.slotKey === key));
  {
    const live = (["e1", "e2", "e3", "eL", "eN"] as const).flatMap((k) => (cal[k]?.days ?? []).filter((x: Any) => x.day >= "2031-03-03" && x.day <= "2031-03-10").flatMap((x: Any) => (x.slots ?? []).filter((s: Any) => s.final).map((s: Any) => ({ emp: E[k], d: x.day as string, s }))));
    const miss = live.filter(({ emp, d, s }) => { const r = rowOf(rows1, emp, d, s.slotKey); return !r || ["status", "lateMin", "earlyOutMin", "workedMin", "otMin", "missingOut"].some((c) => r[c] !== s[c]); });
    const r2 = rowOf(rows1, E.e2, W.wed, x2w);
    const r = { ran: !run1?.__err && Number(run1?.finalized) >= live.length, all: live.length === 25 && !miss.length, e2: !!r2 && r2.rosterEntryId === x2w && r2.inAttendanceId === in2w && r2.engineVersion === 1 && r2.version === 1 && r2.startMin === 420 };
    ck("S3.1", r, "25 live final slots = rows", `run=${short(run1, 70)} live=${live.length} rows=${rows1?.length ?? "∅"} miss=${miss.slice(0, 3).map((x) => x.d)}`);
  }
  {
    const run2 = await job(N1);
    ck("S3.2", { zero: run2?.finalized === 0, same: !!rows1 && sig(await dayRows(TT)) === sig(rows1), outbox: (await cnt("outboxEvent")) === ob0, audit: (await cnt("auditLog")) === au0 }, "0 · identical · quiet", `run2=${short(run2, 60)}`);
  }
  {
    const o0 = await dayRows(T2);
    await job(N1, T2);
    const o1 = await dayRows(T2);
    const h = rowOf(rows1, E.e1, W.sun);
    ck("S3.3", { today: !!rows1 && !rowOf(rows1, E.e2, "2031-03-10"), old: !!rows1 && !rowOf(rows1, E.e1, "2031-02-19"), holiday: h?.holidayId === hol && h?.status === "DAY_OFF", tenant: o0?.length === 0 && o1?.length === 1 && o1[0].status === "ABSENT" }, "today/old none · holidayId · T2 own run", `T2 ${o0?.length ?? "∅"}→${o1?.length ?? "∅"}`);
  }
  {
    await P.hrRosterEntry.update({ where: { id: x2w }, data: { startMin: 480 } });
    await P.hrLeave.update({ where: { id: lvFri }, data: { status: "APPROVED" } });
    await P.hrAttendance.delete({ where: { id: outN } });
    await job(N1);
    const after = await dayRows(TT);
    const [s2, s1] = [slotsOf(await month(cA, U.owner!, E.e2), W.wed)[0], slotsOf(await month(cA, U.owner!, E.e1), W.fri)[0]];
    const r = { rows: !!after && sig(after) === sig(rows1), e2: s2?.stored === true && s2?.stale === true && s2?.status === "LATE" && s2?.dayId === rowOf(after, E.e2, W.wed)?.id, e1: s1?.stored === true && s1?.stale === true && s1?.status === "ABSENT" };
    ck("S3.4", r, "unchanged · stored+stale", `e2=${s2 ? `${s2.status}/${s2.stored}/${s2.stale}` : "∅"} e1=${s1 ? `${s1.status}/${s1.stale}` : "∅"}`);
  }

  // ── S4 recompute ──
  const rowsR = (await dayRows(TT)) ?? [];
  const [idE2, idE1, idEM] = [rowOf(rowsR, E.e2, W.wed)?.id ?? "∅", rowOf(rowsR, E.e1, W.fri)?.id ?? "∅", rowOf(rowsR, E.eM, W.wed)?.id ?? "∅"];
  const rc = (ctx: Any, w: Who, dayId: string, reason = "แก้กะผิดเวลา") => call(JG, "recomputeAttendanceDay", ctx, vOf(w), { dayId, reason }, { now: N1 });
  {
    const o: Record<string, Any> = {
      payroll: await rc(cA, U.payroll!, idE2), member: await rc(cA, U.member!, idE2), branch: await rc(cA, U.writerU2!, idE2), tenant: await rc({ tenantId: T2, systemId: sO }, U.other!, idE2),
      bad: await rc(cA, U.owner!, "c00000000000000000000000x"), own: await rc(cA, U.mgrSelf!, idEM), short: await rc(cA, U.mgrU1!, idE2, "ab"), long: await rc(cA, U.mgrU1!, idE2, "ก".repeat(201)), blank: await rc(cA, U.mgrU1!, idE2, "     "),
    };
    const r = { perm: said(o.payroll, T.rNoPerm) && said(o.member, T.rNoPerm), nf: ["branch", "tenant", "bad"].every((k) => said(o[k], T.rNotFound)), own: said(o.own, T.rOwn), reason: ["short", "long", "blank"].every((k) => said(o[k], T.rReason)), noWrite: rowsR.length > 0 && sig(await dayRows(TT)) === sig(rowsR) };
    ck("S4.1", r, "fixed refusals · nothing written", Object.entries(o).map(([k, v]) => `${k}=${shown(v)}`).join(" "));
  }
  {
    const tables = async () => `${await cnt("hrAttendance")}/${await cnt("hrRosterEntry")}/${await cnt("hrLeave")}/${await cnt("outboxEvent")}`;
    const c0 = await tables();
    const res = await rc(cA, U.mgrU1!, idE2);
    const after = (await dayRows(TT)) ?? [];
    const row = after.find((x) => x.id === idE2);
    const r = {
      ok: res?.ok === true && res?.changed === true && res?.version === 2,
      row: !!row && row.status === "ON_TIME" && row.lateMin === 0 && row.otMin === 30 && row.workedMin === 490 && row.startMin === 480 && row.version === 2 && row.recomputedById === U.mgrU1!.id && row.recomputeReason === "แก้กะผิดเวลา",
      others: sig(after.filter((x) => x.id !== idE2)) === sig(rowsR.filter((x) => x.id !== idE2)), tables: (await tables()) === c0,
    };
    ck("S4.2", r, "one row ON_TIME/480/v2 · rest untouched", `${shown(res)} row=${row ? `${row.status}/${row.startMin}/v${row.version}` : "∅"}`);
  }
  {
    const s0 = sig(await dayRows(TT));
    const res = await rc(cA, U.mgrU1!, idE2, "ตรวจซ้ำ");
    const aud = (await P.auditLog.findMany({ where: { tenantId: TT, action: "hr.attendance.day_recomputed" } })) as Any[];
    const a = aud[0]?.after ?? {};
    ck("S4.3", { same: res?.ok === true && res?.changed === false, noWrite: sig(await dayRows(TT)) === s0, audit: aud.length === 1 && a.dayId === idE2 && a.before?.status === "LATE" && a.after?.status === "ON_TIME" }, "c=false · 1 audit", `${shown(res)} audits=${aud.length} ${short(a, 90)}`);
  }
  {
    const run = await P.hrPayrollRun.create({ data: { tenantId: TT, systemId: sA, periodKey: "2031-03", payDate: new Date("2031-03-31T00:00:00Z"), status: "APPROVED" } });
    const a = await rc(cA, U.owner!, idE1);
    await P.hrPayrollRun.update({ where: { id: run.id }, data: { status: "PAID" } });
    const p = await rc(cA, U.owner!, idE1);
    await P.hrPayrollRun.update({ where: { id: run.id }, data: { status: "REVERSED" } });
    const v = await rc(cA, U.owner!, idE1);
    const own = await rc(cA, U.owner!, idEM);
    const row = ((await dayRows(TT)) ?? []).find((x) => x.id === idE1);
    ck("S4.4", { approved: said(a, T.rPaid), paid: said(p, T.rPaid), reversed: v?.ok === true && v?.changed === true && row?.status === "LEAVE", owner: own?.ok === true && own?.changed === false }, "rPaid ×2 · REVERSED ⇒ LEAVE · owner ok", `a=${shown(a)} p=${shown(p)} v=${shown(v)} own=${shown(own)} row=${row?.status}`);
  }

  // ── S5 alerts (Wed 2031-03-12) ──
  const AD = "2031-03-12";
  await P.appSystem.update({ where: { id: sB }, data: { settings: { hrAttendance: { notInAlertMin: 30, alertEmployee: true } } } });
  await P.appSystem.update({ where: { id: sC }, data: { settings: { hrAttendance: { alertsOn: false } } } });
  const a1 = await ent(E.e1, AD, shM, u1);
  await ent(E.e3, AD, shM, u2);
  await att(E.e2, "IN", bk(AD, "06:58"), await ent(E.e2, AD, shM, u1));
  await ent(E.eM, AD, shM, u1);
  await lv(E.eM, "VACATION", AD, "APPROVED");
  const aB = await ent(E.eB, AD, shB, u1, { sys: sB });
  await ent(E.eC, AD, shC, u1, { sys: sC });
  const evsOf = async (type: string) => (await P.outboxEvent.findMany({ where: { tenantId: TT, type }, orderBy: { createdAt: "asc" } })) as Any[];
  const at = (hm: string, d = AD) => job(bk(d, hm));
  {
    const r0 = await at("07:09");
    const [al0, e0] = [await alertRows(TT), (await evsOf(EV[0]!)).length];
    const r1 = await at("07:10");
    const al1 = (await alertRows(TT)) ?? [];
    const ev1 = await evsOf(EV[0]!);
    ck("S5.1", { quiet: r0?.late === 0 && al0?.length === 0 && e0 === 0, fired: r1?.late === 2 && srt(al1.map((a) => `${a.employeeId}:${a.kind}`)) === srt([`${E.e1}:NOT_IN`, `${E.e3}:NOT_IN`]) && ev1.length === 2 }, "07:09 quiet · 07:10 e1+e3", `r0=${r0?.late ?? shown(r0)} r1=${r1?.late} alerts=${al1.length} ev=${ev1.length}`);
  }
  {
    await at("07:25");
    await att(E.e1, "IN", bk(AD, "07:40"), a1);
    const rB = await at("07:45");
    const al = (await alertRows(TT)) ?? [];
    const ev = await evsOf(EV[0]!);
    const pay = ev.map((e) => e.payload as Any);
    const al1 = al.find((a) => a.employeeId === E.e1);
    const r = {
      once: al.filter((a) => a.kind === "NOT_IN").length === 3 && rB?.late === 1 && ev.length === 3, keys: pay.every((p) => Object.keys(p ?? {}).sort().join(",") === "alertId,employeeId,rosterEntryId,systemId"),
      ids: !!al1 && pay.some((p) => p.alertId === al1.id && p.employeeId === E.e1 && p.rosterEntryId === a1 && p.systemId === sA) && ev.every((e) => e.idempotencyKey === `${EV[0]}#${(e.payload as Any)?.alertId}`),
      noNames: !pay.some((p) => isThai(JSON.stringify(p))),
    };
    ck("S5.2", r, "3 alerts (e1 e3 eB) · 4 ids · key", `alerts=${al.length} rB=${rB?.late} ev=${ev.length}`);
  }
  const deliver = async (e: Any) => {
    const fn = mods.cons?.consumers?.[e?.type];
    if (typeof fn !== "function") return `MISSING ${e?.type}`;
    try {
      await fn({ id: e.id, tenantId: e.tenantId, type: e.type, payload: e.payload, systemId: e.systemId, unitId: e.unitId });
      return "";
    } catch (err) {
      return errText(err);
    }
  };
  const nameOf = (uid: string) => Object.keys(U).find((k) => U[k]!.id === uid) ?? "?";
  const notes = async (w: Record<string, unknown> = {}) => (await P.appNotification.findMany({ where: { tenantId: TT, ...w } })) as Any[];
  {
    const errs: string[] = [];
    for (const e of await evsOf(EV[0]!)) errs.push(await deliver(e), await deliver(e));
    const all = await notes();
    const got: Record<string, number> = {};
    for (const n of all.filter((x) => x.title === T.nLateT)) got[nameOf(n.recipientUserId)] = (got[nameOf(n.recipientUserId)] ?? 0) + 1;
    const want = { owner: 3, mgrAll: 3, mgrEmpty: 3, writer: 3, mgrU1: 2, mgrSelf: 2, writerU2: 1 }; // e1 (u1) + eB (u1) + e3 (u2)
    const al = (await alertRows(TT)) ?? [];
    ck("S5.3", { errs: errs.every((x) => !x), recipients: canon(got) === canon(want), noBroadcast: !all.some((n) => n.recipientUserId === null), notified: al.length > 0 && al.every((a) => !!a.notifiedAt) }, canon(want), `errs=${errs.filter(Boolean).slice(0, 2)} got=${canon(got)}`);
  }
  {
    const all = await notes();
    const mgr = all.find((n) => n.recipientUserId === U.owner!.id && String(n.body).startsWith(NM.e1));
    const self = all.filter((n) => n.recipientUserId === U.selfB!.id);
    const r = {
      mgr: !!mgr && new RegExp(`^${NM.e1} ยังไม่ลงเวลาเข้ากะเช้า ${tag} \\(เริ่ม 07:00\\) — เลยเวลาเริ่ม \\d+ นาที$`).test(mgr.body),
      self: self.length === 1 && self[0].title === T.nLateSelfT && self[0].body === `กะเช้าบี ${tag} เริ่ม 07:00 — ถ้ามาถึงแล้ว ลงเวลาที่เครื่องหน้าร้านหรือมือถือ`,
      noIds: !all.some((n) => /\bc[a-z0-9]{20,}\b/.test(`${n.title} ${n.body}`)),
      setting: ((await alertRows(TT)) ?? []).some((a) => a.employeeId === E.eB && a.rosterEntryId === aB && new Date(a.firedAt).getTime() === bk(AD, "07:45").getTime()),
    };
    ck("S5.4", r, "texts · system B", `mgr="${short(mgr?.body, 80)}" self=${self.length}:"${short(self[0]?.body, 50)}"`);
  }
  {
    const [r0, r1] = [await at("14:59"), await at("15:00")];
    const ab = await evsOf(EV[1]!);
    const al = ((await alertRows(TT)) ?? []).filter((a) => a.kind === "ABSENT");
    for (const e of ab) await deliver(e);
    const n = (await notes({ title: T.nAbsT, recipientUserId: U.owner!.id })).map((x) => String(x.body));
    const re = new RegExp(`^${NM.e3} ไม่มีการลงเวลาเข้ากะเช้า ${tag} วันที่ .+ \\(07:00–15:00\\) และไม่มีใบลาที่อนุมัติ$`);
    const r = { before: r0?.absent === 0, at: r1?.absent === 2 && srt(al.map((a) => a.employeeId)) === srt([E.e3, E.eB]) && ab.length === 2, key: ab.length > 0 && ab.every((e) => e.idempotencyKey === `${EV[1]}#${(e.payload as Any)?.alertId}` && Object.keys(e.payload ?? {}).length === 4), text: n.some((b) => re.test(b)) };
    ck("S5.5", r, "15:00 e3+eB · key · text", `r0=${r0?.absent ?? shown(r0)} r1=${r1?.absent} absent=${al.length} body="${short(n[0], 80)}"`);
  }
  {
    const auto = (mods.auto?.AUTOMATION_EVENTS ?? []) as Any[];
    const hooks = (mods.hooks?.WEBHOOK_EVENTS ?? []) as Any[];
    ck("S5.6", { consumers: EV.every((e) => typeof mods.cons?.consumers?.[e] === "function"), marked: /\/\/ HR H2\.5 ▸/.test(rd(F.cons)), oneLabel: EV.every((e) => auto.filter((a) => a.value === e).length === 1 && isThai(auto.find((a) => a.value === e)?.label ?? "")), notInHooks: EV.every((e) => !rd(F.hooks).includes(`"${e}"`)), hooks: EV.every((e) => hooks.filter((a) => a.value === e).length === 1) }, "consumers · labels", "");
  }

  // ── S8 races (holder + ≤ 5 lanes) ──
  async function hold<X>(key: string, during: (tx: Any) => Promise<unknown>, fn: () => Promise<X>) {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let held: () => void = () => {};
    const heldP = new Promise<void>((r) => (held = r));
    let holderErr = "";
    const holder = P.$transaction(async (tx: Any) => {
      await tx.$queryRawUnsafe(`SELECT count(pg_advisory_xact_lock(hashtextextended($1::text, 0)))::int AS n`, key);
      held();
      await gate;
      await during(tx);
    }, { maxWait: 10_000, timeout: 60_000 }).catch((e: unknown) => ((holderErr = errText(e)), held()));
    await heldP;
    const p = fn();
    let seen = 0;
    for (let i = 0; i < 60 && !seen; i++) {
      await sleep(100);
      seen = Number((await fx.rawRows(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND wait_event = 'advisory'`))?.[0]?.n ?? 0);
    }
    release();
    await holder;
    return { res: await p, waited: seen > 0, holderErr };
  }
  {
    const d = "2031-03-13";
    const x = await ent(E.e2, d, shM, u1);
    await att(E.e2, "IN", bk(d, "07:00"), x);
    let outId = "";
    const h = await hold(`hr:clock:${E.e2}`, async (tx) => (outId = (await tx.hrAttendance.create({ data: { tenantId: TT, systemId: sA, employeeId: E.e2, kind: "OUT", at: bk(d, "15:05"), rosterEntryId: x, source: "KIOSK" } })).id), () => at("05:00", "2031-03-14"));
    const row = rowOf(await dayRows(TT), E.e2, d, x);
    chk("S8.1", h.waited && !h.holderErr && !h.res?.__err && row?.outAttendanceId === outId && row?.missingOut === false && row?.workedMin === 485, "waited · holder's OUT · W485", `waited=${h.waited} holder=${h.holderErr || "-"} run=${shown(h.res)} row=${row ? `${row.outAttendanceId === outId}/${row.missingOut}/W${row.workedMin}` : "∅"}`);
  }
  {
    const d = "2031-03-15";
    const x = await ent(E.e1, d, shM, u1);
    await att(E.e1, "IN", bk(d, "07:20"), x);
    const h = await hold(`hr:roster:${sA}:${E.e1}:${d}`, (tx) => tx.hrRosterEntry.update({ where: { id: x }, data: { startMin: 450 } }), () => at("12:00", "2031-03-16"));
    const row = rowOf(await dayRows(TT), E.e1, d, x);
    chk("S8.2", h.waited && !h.holderErr && row?.startMin === 450 && row?.status === "ON_TIME" && row?.lateMin === 0, "waited · 450 · ON_TIME", `waited=${h.waited} holder=${h.holderErr || "-"} row=${row ? `${row.startMin}/${row.status}` : "∅"}`);
  }
  {
    const d = "2031-03-19";
    const ys = [await ent(E.e1, d, shM, u1), await ent(E.e3, d, shM, u2)];
    const res = await Promise.all(Array.from({ length: 5 }, () => at("07:15", d)));
    const al = ((await alertRows(TT)) ?? []).filter((a) => ys.includes(a.rosterEntryId));
    const ev = (await evsOf(EV[0]!)).filter((e) => al.some((a) => a.id === (e.payload as Any)?.alertId));
    const fin = await Promise.all(Array.from({ length: 5 }, () => at("12:00", "2031-03-20")));
    const rows = ((await dayRows(TT)) ?? []).filter((r) => ys.includes(r.slotKey));
    ck("S8.3", { noThrow: [...res, ...fin].every((x) => !!x && !x.__err), alerts: al.length === 2 && ev.length === 2, sum: res.reduce((s, x) => s + Number(x?.late ?? 0), 0) === 2, rows: rows.length === 2 }, "2 · 2 · Σ2 · 2 rows", `alerts=${al.length} ev=${ev.length} Σ=${res.map((x) => x?.late ?? shown(x)).join("+")} rows=${rows.length}`);
  }
  {
    const id = rowOf(await dayRows(TT), E.eN, W.wed)?.id ?? "∅";
    const res = await Promise.all([1, 2, 3].map((i) => rc(cA, U.owner!, id, `ตรวจพร้อมกัน ${i}`)));
    const row = ((await dayRows(TT)) ?? []).find((x) => x.id === id);
    chk("S8.4", res.every((x) => x?.ok === true) && res.filter((x) => x.changed === true).length === 1 && row?.version === 2 && row?.missingOut === true, "1 changed · v2 · MO", `${res.map(shown).join(" | ")} v=${row?.version}`);
  }

  // ── S7 settings (system A, after the jobs) ──
  const setOf = async (id: string) => ((await P.appSystem.findFirst({ where: { id }, select: { settings: true } })) as Any)?.settings ?? {};
  const pol = (fn: string, w: Who, i?: Record<string, unknown>) => call(mods.cset, fn, cA, ...(i ? [vOf(w), i] : []));
  {
    const g0 = await pol("getAttendancePolicy", U.owner!);
    await pol("saveClockPolicy", U.owner!, { earlyInMin: 90 });
    const s1 = await pol("saveAttendancePolicy", U.owner!, { notInAlertMin: 30, otStepMin: 30 });
    const mid = await setOf(sA);
    await pol("saveClockPolicy", U.owner!, { closeGraceMin: 300 });
    const end = await setOf(sA);
    const g1 = await pol("getAttendancePolicy", U.owner!);
    const r = { dflt: canon(g0) === canon(PDEF), saved: s1?.ok === true && mid.hrAttendance?.notInAlertMin === 30 && mid.hrClock?.earlyInMin === 90, kept: end.hrAttendance?.otStepMin === 30 && end.hrClock?.closeGraceMin === 300 && end.hrClock?.earlyInMin === 90, get: g1?.notInAlertMin === 30 && g1?.otStepMin === 30, audit: (await P.auditLog.count({ where: { tenantId: TT, action: "hr.settings.attendance-policy.update" } })) === 1 };
    ck("S7.1", r, "default · both survive · audit 1", `g0=${short(g0, 70)} s1=${shown(s1)} end=${short(end, 110)}`);
  }
  {
    const before = canon(await setOf(sA));
    const sv = (w: Who, i: Record<string, unknown>) => pol("saveAttendancePolicy", w, i);
    const o: Record<string, Any> = { alert: await sv(U.owner!, { notInAlertMin: 241 }), absent: await sv(U.owner!, { absentAfterMin: 29 }), early: await sv(U.owner!, { earlyOutGraceMin: 61 }), step: await sv(U.owner!, { otStepMin: 7 }), member: await sv(U.member!, { notInAlertMin: 5 }), mgr: await sv(U.mgrU1!, { notInAlertMin: 5 }), branch: await sv(U.writerU2!, { notInAlertMin: 5 }) };
    const r = { alert: said(o.alert, T.sAlert), absent: said(o.absent, T.sAbsent), early: said(o.early, T.sEarly), step: said(o.step, T.sOtStep), gate: said(o.member, T.noPermission) && said(o.mgr, T.noPermission), branch: said(o.branch, T.shopWide), unchanged: before === canon(await setOf(sA)) };
    ck("S7.2", r, "fixed texts · nothing written", Object.entries(o).map(([k, v]) => `${k}=${shown(v)}`).join(" "));
  }
}

// == main ==
let crashed = "";
try {
  runStatic();
  await runDb();
} catch (e) {
  crashed = errText(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  for (const tid of fx.tenants) for (const t of NEW_TABLES) await fx.rawRows(`DELETE FROM "${t}" WHERE "tenantId" = $1 RETURNING 1`, tid);
  await cleanupFx(P, fx, SLUG);
}
const residue = await residueOf(P, fx, SLUG, SLUG_PREFIX);
const left: string[] = [];
for (const tid of fx.tenants) for (const t of NEW_TABLES) { const r = await fx.rawRows(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid); if (r && Number(r[0]?.n) !== 0) left.push(`${t}=${r[0]?.n}`); }
chk("Z1", !residue.length && !left.length, "none", [...residue, ...left].join(",") || "none");
const exit = REG.finish({ forced: FORCE, crashed, missing: skipReasons });
await P.$disconnect?.();
process.exit(exit);
