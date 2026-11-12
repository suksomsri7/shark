// QC — HR V2 · H3.1 work entries: roster + attendance + leave + holidays → one HrWorkDay per employee-day + HrWorkEntry kind rows ·
//      snapshot per period (build · state · freeze at approve · v2 gate) · brief ledger/hr-briefs/hr-brief-H3.1.md (DRAFT · Q1–Q16 defaults)
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// 🔴 Every expected number is a LITERAL worked by hand in ledger/wo-notes/hr-H3.1-oracle.md (never computed by the code under test).
// CONTRACT (brief R3–R8; ORACLE-EDIT if it must differ):
//   work-entries-rules.ts (pure): buildWorkDays(input) → WorkDay[] · WORK_RULES_DEFAULT {normalDayMin 480, breakRule "PLANNED_AFTER_5H", breakAfterMin 300} ·
//     WE_BLOCKING (9 codes) · WORK_ENTRY_ENGINE_VERSION = 1
//   work-entries.ts: buildWorkEntrySnapshot(ctx, viewer, {periodKey, employeeIds?}, {now?, pageSize?}) → {ok, periodKey, employees, written, unchanged, removed, blocking, next} ·
//     workEntryPreview(ctx, viewer, {periodKey}, {now?}) · workEntryDays(ctx, viewer, {employeeId, periodKey}, {now?}) · myWorkEntryDays(ctx, {userId}, {periodKey}, {now?}) ·
//     workEntriesApproveCheckInTx(tx, ctx, {runId, periodKey}) · bindWorkEntriesToRunInTx(tx, ctx, {runId, periodKey}) · WE_TEXT · refusals {ok:false, reason}
//   payroll.ts approveRun → {ok:false, code:"WORK_ENTRIES", note: WE_TEXT.approveBlocked} for engineVersion ≥ 2 runs only
// Tenants qc-hr-h31-<stamp> · July/Sept/Oct 2031 · opts.now injected · SKIP while hr/work-entries.ts is absent (QC_FORCE=1 runs) · --list
// Base for statics = QC_H31_BASE or 87d976773 (static base-diff parts n/a once work-entries.ts is in the base — pathInBase, as qc-hr-h4.4)
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h3.1.mts
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  type Any, type Base, type Sev, type Who, ROOT, rd, short, errText, textOf, srt, failedKeys, stripComments, dk, dbDate, sleep, tagOf,
  PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, baseRef, pathInBase, changedVsBase, diffHunks, makeRegistry, qc4Env, makeFixtures, cleanupFx, residueOf,
  vOf, fitnessNoEnv, importsOf, jsonOf, testidsOf, loadOpt, modState, sha, keysDeep, HR_FORBIDDEN_DTO_KEYS, tokensOnly,
} from "./qc-hr-lib.mjs";

const SUITE = "qc-hr-h3.1";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-h31-";
const H = "src/lib/modules/hr/";
const F = {
  rules: `${H}work-entries-rules.ts`, we: `${H}work-entries.ts`, acts: `${H}work-entries-actions.ts`, ui: `${H}work-entries-ui.tsx`,
  mig: "prisma/migrations/20270103000000_hr_work_days/migration.sql", pay: "prisma/schema/payroll.prisma", scope: "src/lib/core/scope.ts", env: "scripts/hr-qc-env.mts",
  judge: `${H}judge.ts`, payroll: `${H}payroll.ts`, payActs: `${H}payroll-actions.ts`, index: `${H}index.ts`,
  payPage: "src/app/app/sys/[id]/hr/payroll/page.tsx", attPage: "src/app/app/sys/[id]/hr/attendance/page.tsx", attUi: `${H}attendance-ui.tsx`,
  th: "src/messages/th/common.json", en: "src/messages/en/common.json", inv: "scripts/hr-ui-inventory.json",
};
const T = {
  no: "ไม่พบข้อมูลชั่วโมงทำงานนี้ หรือคุณไม่มีสิทธิ์ดู",
  buildNo: "คุณไม่มีสิทธิ์ดึงชั่วโมงทำงานเข้าเงินเดือน",
  period: "งวดต้องเป็นรูปแบบ YYYY-MM",
  frozen: "งวดนี้อนุมัติเงินเดือนแล้ว — ชั่วโมงทำงานถูกล็อกไว้ แก้ไม่ได้",
  tooMuch: "ข้อมูลของงวดนี้มากเกินไป — ลองดึงทีละสาขา",
  noEmp: "บัญชีของคุณยังไม่ได้ผูกกับพนักงาน — ติดต่อผู้จัดการ",
  approveBlocked: "ชั่วโมงทำงานของงวดนี้ยังไม่พร้อม — กด 'ดึงชั่วโมงทำงาน' และแก้รายการที่ต้องตรวจก่อนอนุมัติ",
};
const BLOCKING = ["LEAVE_MISMATCH", "MISSING_OUT", "NOT_FINAL", "NOT_STORED", "ORPHAN", "OVER_1440", "PENDING_LEAVE", "STALE", "STRAY_IN", "WORKED_ON_LEAVE"]; // ORACLE-EDIT r2 (item 4d): + OVER_1440
const MIN_KEYS = ["plannedMin", "workMin", "otWorkdayMin", "holidayWorkMin", "otHolidayMin", "holidayPaidMin", "paidLeaveMin", "unpaidLeaveMin", "absentMin", "lateMin", "earlyOutMin", "unplannedMin", "breakDeductMin"];
const ABBR = ["p", "w", "ow", "hw", "oh", "hp", "pl", "ul", "ab", "la", "eo", "un", "bd"];
const KIND_ORDER = ["WORK", "OT_WORKDAY", "HOLIDAY_WORK", "OT_HOLIDAY", "HOLIDAY_PAID", "LEAVE_PAID", "LEAVE_UNPAID", "ABSENT", "LATE", "EARLY_OUT"];
const OUT_KEYS = srt(["employeeId", "day", "periodKey", "unitId", "dayClass", "dayStatus", ...MIN_KEYS, "leaveDays", "review", "sources", "entries", "digest"]);
const DAY_KEYS = srt(["day", "dayClass", "dayStatus", ...MIN_KEYS, "leaveDays", "review", "leaveLabel", "sources"]);
const SUM_KEYS = srt(["employedDays", "worked", "leave", "absent", "dayOff", "holiday", "unscheduled", "pending", "leaveDays", "plannedMin", "workMin", "otWorkdayMin", "holidayWorkMin", "otHolidayMin", "holidayPaidMin", "paidLeaveMin", "unpaidLeaveMin", "absentMin", "lateMin", "lateCount", "earlyOutMin"]);
const TESTIDS = ["hr-we-panel", "hr-we-state", "hr-we-build", "hr-we-row-*", "hr-we-review", "hr-we-summary", "hr-we-day-*"];

const SEV: Record<string, Sev> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS = `
S1.1|R2|C|R|[static] migration 20270103000000_hr_work_days: last _hr_ folder · 2 enums exact · additive (no DROP/RENAME/ALTER TYPE)
S1.2|R2|C|R|[static] migration: HrWorkDay table · unique (employeeId,date) · employee FK CASCADE · CHECK minutes 0–1440 + leaveDays 0–1 · HrWorkEntry.workDayId FK CASCADE
S1.3|R2|M|R|[static] payroll.prisma models/enums · scope.ts HrWorkDay sys() · hr-qc-env hrWorkDay row
S1.4|R1|C|R|[static] only work-entries.ts writes HrWorkDay/HrWorkEntry · no emitOutbox there · rules file pure (no db/clock/random)
S1.5|R6|C|R|[static] payroll.ts: claimApproveExpected calls check + bind · WORK_ENTRIES code · payroll-actions maps it · hunks marked HR H3.1 (diff n/a once in base)
S1.6|R7|M|R|[static] judge.ts: exported workEntryDaysInTx in a marked pure-addition hunk (diff n/a once in base)
S1.7|R9|M|R|[static] actions use server · no now: · requireTenant · UI testids · inventory wo H3.1 · hr.we th=en · tokens · page mounts
S2.1|Q3|C|R|[pure] break rule: 7 literal vectors (planned break after 5 h · clocked first · CLOCKED_ONLY · threshold)
S2.2|R3|C|R|[pure] workday basics: on time · late · OT · early arrival · absent · late capped by unclocked break (6 vectors)
S2.3|R3|C|R|[pure] leave: full paid/unpaid · half AM/PM · split shifts · unequal split · worked into PM leave (9 vectors)
S2.4|R3|C|R|[pure] overnight shift owns its start day/period · next day other period (2 vectors)
S2.5|R3|C|R|[pure] day off · holiday · unscheduled · no-schedule work · leave on day off · normalDayMin · no-schedule half leave · holiday leave (17 vectors)
S2.6|R3|C|R|[pure] hourly leave offset late→early→absent · unused flag · unpaid (5 vectors)
S2.7|R3|C|R|[pure] review codes: stale · orphan · not final · not stored · missing out · stray IN · pending leave · mismatch · worked on leave · legacy · dedupe/sort · over 1440 (14 vectors)
S2.8|R3|M|R|[pure] employment window ∩ period · days outside range ignored (3 vectors)
S3.1|R3|C|R|[pure] digest: 64-hex · same input ⇒ same · slot order irrelevant · version change ⇒ differs
S3.2|R3|M|R|[pure] purity: deep-frozen input untouched · Date.now/Math.random trapped · output keys exact
S3.3|R3|C|R|[pure] entries mirror header (kind order H1.3 · zeros omitted) · every minute integer 0–1440 · review sorted unique
S3.4|R3|M|R|[pure] WE_BLOCKING exact · WORK_RULES_DEFAULT · engine version 1
S3.5|r2|C|R|[pure] ORACLE-EDIT r2 (new): minutes add up — late+early+absent ≤ max(0, planned − leave − regular) · planned-side ≤ planned · all vectors + 500 seeded random days
S4.1|R2|C|R|[db] catalogue: HrWorkDay columns/types/defaults · enums · HrWorkEntry.workDayId
S4.2|R4|C|R|[db] owner build July 2031: 6 employees · 165 days (31×5 + 10) · result counts
S4.3|R3|C|R|[db] 17 day literals from real H2.5 rows (break · late · OT · absent · leave · day-off work · half day · split · overnight · holiday · hourly · unscheduled)
S4.4|R8|C|R|[db] preview summaries eA/eB literal (counts · minutes · leaveDays)
S4.5|R4|C|R|[db] 27 kind rows · Σ per kind literal · source columns (roster · leave · holiday · workDayId · periodKey)
S4.6|R4|M|R|[db] sourcesJson attendance ids+versions · 64-hex hashes · version 1 · runId null · state CURRENT
S5.1|R4|C|R|[db] rebuild unchanged ⇒ written 0 · ids/versions/updatedAt/kind rows identical
S6.1|R5|C|R|[db] recompute (OUT moved) ⇒ only eC OUTDATED · rebuild ⇒ OT 60 · version 2 · source version 2 · written 1
S6.2|R5|C|R|[db] leave revoked ⇒ OUTDATED · rebuild ⇒ STALE review · state REVIEW
S6.3|R5|C|R|[db] recompute after revoke ⇒ rebuild ⇒ ABSENT 480 · no review · CURRENT
S6.5|r2|C|R|[db] ORACLE-EDIT r2 (new): shift grace 5 → 15 after build (LATE 10 row now stale, no version bump) ⇒ OUTDATED · v2 approve refused · rebuild ⇒ STALE review · still refused
S6.4|R5|C|R|[db] ORACLE-EDIT (new, controller): H2.6 correction (OUT 15:00 → 17:00: original voided · corrected punch · stored day recomputed) ⇒ snapshot built before = OUTDATED · rebuild = corrected minutes (ow 120 · source version 2) · CURRENT
S7.1|R3|C|R|[db] NOT_FINAL (day not over) ⇒ PENDING · ORPHAN after unpublish
S7.2|R3|M|R|[db] NOT_STORED (final, finaliser not run) · after finaliser ⇒ clean literal
S8.1|R6|C|R|[db] v1 approve binds 165 days + 27 kind rows to the run
S8.2|R6|C|R|[db] build after approve ⇒ frozen text · 0 writes · state FROZEN
S8.3|R6|C|R|[db] v2 run, no snapshot ⇒ approve refused WORK_ENTRIES + text · run DRAFT
S8.4|R6|C|R|[db] v2 run, MISSING_OUT review ⇒ refused
S8.5|R6|C|R|[db] v2 run, recompute after build ⇒ OUTDATED ⇒ refused
S8.6|R6|C|R|[db] rebuild clean ⇒ v2 approve ok · APPROVED · 31 days bound · literal day
S9.1|R4|C|R|[race] build ∥ build ⇒ both ok · one row per day · no 23505/text leak
S9.2|R4|C|R|[race] build waits on the period lock (hr:payroll:run:<sys>:<period>) then completes
S9.3|R6|C|R|[race] build ∥ v1 approve ⇒ approve ok (blocking review ignored for v1) · no unbound row of the period
S9.5|r2|C|R|[race] ORACLE-EDIT r2 (new): leave revoked between the builder's reads ⇒ never CURRENT with stale rows
S9.4|R5|C|R|[race] build ∥ recompute ⇒ CURRENT only with the new version · else OUTDATED · rebuild converges
S10.1|R8|C|R|[db] preview viewer matrix: owner 6 · payroll 6 · mgr u1 3 · writer u2 3 · member refused · other tenant sees none of ours
S10.2|R8|C|R|[db] IDOR: out-of-branch · unknown id · member · other tenant ⇒ identical refusal bytes
S10.3|R8|C|R|[db] self: own days only (employeeId ignored) · unlinked ⇒ noEmp
S10.4|R8|C|R|[db] DTO keys exact (preview · summary · days · sources) · no forbidden/money keys
S10.5|R8|M|R|[db] leaveLabel: policy name for leave readers · ลา for writer · null without leave
S10.6|R4|C|R|[db] build refused for manager/member (buildNo) · bad period · nothing written
S11.1|frozen|C|G|[static] payroll-rules sha · frozen files unchanged vs base (n/a once in base)
S11.2|fixture|C|G|[db] fixture sanity: H2.5 stored rows = the inputs the literals assume
S11.3|frozen|C|G|[db] v1 run of the fixture: gross 1,500,000 · approve ok · APPROVED
X12.1|X12|M|G|[run] fitness + fitness-hr without env ⇒ exit 0
Z1|house|C|G|no residue (tenants · users · HrWorkDay · HrWorkEntry · HrAttendanceDay)
`.trim().split("\n").map((l) => {
  const [id, g, sv, b, t] = l.split("|");
  return [`H3.1-${id}`, g, SEV[sv], (b === "R" ? "RED" : "GREEN") as Base, t] as const;
});
const { chk, printList, skipExit, finish } = makeRegistry(SUITE, "H3.1-", CHECKS);
if (ARGV.includes("--list")) {
  printList();
  process.exit(0);
}
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, F.we))) skipReasons.push(`${F.we} absent (H3.1 not built)`);
if (skipReasons.length && !FORCE) skipExit(skipReasons);
const ck = (id: string, r: Record<string, unknown>, exp: string, extra = "") => chk(id, Object.values(r).every(Boolean), exp, `${failedKeys(r)}${extra ? ` ${extra}` : ""}`);
// ORACLE-EDIT (controller, H3.1 build): default base = merge-base HEAD origin/session/hr (env QC_H31_BASE still overrides —
//   iso.sh drops env, a hard-coded pin breaks control runs) · base-diff checks n/a once H3.1 is in the base ·
const BASE = baseRef("QC_H31_BASE") || "87d976773a53ab279b8e6f0660e0d7a72e5fdba4";
const IN_BASE = pathInBase(F.we, BASE);
const git = (a: string[]) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }).trim();
const gitGrep = (re: string, paths: string[]) => {
  try {
    return git(["grep", "-lE", re, "--", ...paths]).split("\n").filter(Boolean);
  } catch {
    return [];
  }
};
const block = (src: string, start: RegExp, len = 2500) => {
  const i = src.search(start);
  return i < 0 ? "" : src.slice(i, i + len);
};

// ═════════════════════════ header strings (literal comparison) ═════════════════════════
type Hx = Partial<Record<(typeof ABBR)[number], number>>;
/** expected header: class|status|p… w… …|ld|r */
const Hd = (cls: string, st: string, m: Hx = {}, ld = "0.0", r = "") => `${cls}|${st}|${ABBR.map((a) => `${a}${m[a] ?? 0}`).join(" ")}|ld${ld}|r${r}`;
const ldOf = (v: unknown) => (v === null || v === undefined ? "∅" : Number(v as never).toFixed(1));
const reviewOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.replace(/^\{|\}$/g, "").split(",").filter(Boolean) : []);
const hdr = (d: Any) => (d ? `${d.dayClass}|${d.dayStatus}|${MIN_KEYS.map((k, i) => `${ABBR[i]}${d[k]}`).join(" ")}|ld${ldOf(d.leaveDays)}|r${reviewOf(d.review).join("+")}` : "∅");
const ents = (d: Any) => (Array.isArray(d?.entries) ? d.entries.map((e: Any) => `${e.kind}:${e.minutes}`).join(",") : "∅");
const W = "WORKDAY";
/** ORACLE-EDIT (H3.1 build): array of objects → JSON with each object's keys sorted (jsonb key order is not insertion order) */
const ksJson = (v: unknown) => JSON.stringify(Array.isArray(v) ? v.map((o) => (o && typeof o === "object" ? Object.fromEntries(Object.entries(o as Record<string, unknown>).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))) : o)) : v);

// ═════════════════════════ pure vectors (fixture — expanded inputs + literal headers) ═════════════════════════
const VF: Any = jsonOf("scripts/fixtures/hr-h3.1-vectors.json") ?? { vectors: [], window: [] };
const VEC: { id: string; g: string; input: Any; want: string; ents: string }[] = VF.vectors ?? [];
const WIN: { id: string; input: Any; want: string }[] = VF.window ?? [];
const vin = (id: string): Any => structuredClone(VEC.find((v) => v.id === id)?.input ?? null);
const winStr = (out: Any) => (!Array.isArray(out) ? "∅" : out.length === 0 ? "0" : `${out.length}|${out[0].day}|${out[out.length - 1].day}|${srt(new Set(out.map((d: Any) => d.dayClass)))}`);

function runPure(R: Any): void {
  const fn = R && !R.__err && typeof R.buildWorkDays === "function" ? R.buildWorkDays : null;
  const exec = (input: Any): Any => {
    if (!fn) return `∅buildWorkDays (${modState(R, F.rules)})`;
    try {
      return fn(input);
    } catch (e) {
      return `THROW ${errText(e)}`;
    }
  };
  for (const g of ["S2.1", "S2.2", "S2.3", "S2.4", "S2.5", "S2.6", "S2.7"]) {
    const vs = VEC.filter((v) => v.g === g);
    const bad: string[] = [];
    for (const { id, input, want: wantH, ents: wantE } of vs) {
      const out = exec(input);
      if (!Array.isArray(out)) {
        bad.push(`${id}:${short(out, 60)}`);
        continue;
      }
      const d = g === "S2.4" ? out[out.length - 1] : out[0];
      const got = g === "S2.4" ? `${hdr(d)}@${d?.periodKey}` : hdr(d);
      if (got !== wantH || ents(d) !== wantE) bad.push(`${id}=${got} [${ents(d)}]`);
    }
    chk(g, vs.length > 0 && !bad.length, `${vs.length} literal vectors`, bad.length ? `${bad.length} off · ${bad.slice(0, 2).join(" · ")}` : "all");
  }
  {
    const bad = WIN.map(({ id, input, want }) => [id, winStr(exec(input)), want]).filter(([, g, w]) => g !== w);
    chk("S2.8", WIN.length === 3 && !bad.length, "3 vectors", bad.map(([id, g]) => `${id}=${g}`).join(" · ") || "all");
  }
  // S3 properties
  {
    const a = exec(vin("L6"));
    const b = exec(vin("L6"));
    const r6 = vin("L6");
    if (r6) r6.days[0].slots.reverse();
    const s6 = vin("L6");
    if (s6) s6.days[0].slots[0].version = 2;
    const rev = exec(r6);
    const v2 = exec(s6);
    const dg = (x: Any) => (Array.isArray(x) ? String(x[0]?.digest ?? "") : "");
    ck("S3.1", { hex: /^[0-9a-f]{64}$/.test(dg(a)), same: !!dg(a) && dg(a) === dg(b), order: !!dg(a) && dg(a) === dg(rev), version: !!dg(v2) && dg(v2) !== dg(a) }, "hex · same · order · version", dg(a).slice(0, 12));
  }
  {
    const deepFreeze = (o: Any): Any => (o && typeof o === "object" ? (Object.values(o).forEach(deepFreeze), Object.freeze(o)) : o);
    const input = deepFreeze(vin("L8"));
    const before = JSON.stringify(input);
    const [dn, mr] = [Date.now, Math.random];
    let trapped = "";
    (Date as Any).now = () => ((trapped += "Date.now "), 0);
    (Math as Any).random = () => ((trapped += "Math.random "), 0);
    let out: Any;
    try {
      out = exec(input);
    } finally {
      (Date as Any).now = dn;
      (Math as Any).random = mr;
    }
    ck("S3.2", { array: Array.isArray(out), untouched: JSON.stringify(input) === before, noClock: trapped === "", keys: Array.isArray(out) && srt(Object.keys(out[0] ?? {})) === OUT_KEYS }, "untouched · no clock · keys", `${trapped}${Array.isArray(out) ? srt(Object.keys(out[0] ?? {})).slice(0, 80) : short(out, 60)}`);
  }
  {
    const all = VEC.map((v) => exec(v.input)).filter(Array.isArray).flat() as Any[];
    const KIND_OF: Record<string, string> = { WORK: "workMin", OT_WORKDAY: "otWorkdayMin", HOLIDAY_WORK: "holidayWorkMin", OT_HOLIDAY: "otHolidayMin", HOLIDAY_PAID: "holidayPaidMin", LEAVE_PAID: "paidLeaveMin", LEAVE_UNPAID: "unpaidLeaveMin", ABSENT: "absentMin", LATE: "lateMin", EARLY_OUT: "earlyOutMin" };
    const mirror = all.every((d) => {
      const want = KIND_ORDER.filter((k) => d[KIND_OF[k]!] > 0).map((k) => `${k}:${d[KIND_OF[k]!]}`).join(",");
      return ents(d) === want;
    });
    const ints = all.every((d) => MIN_KEYS.every((k) => Number.isInteger(d[k]) && d[k] >= 0 && d[k] <= 1440));
    const sorted = all.every((d) => Array.isArray(d.review) && d.review.join() === [...new Set(d.review as string[])].sort().join());
    ck("S3.3", { some: all.length >= 54, mirror, ints, sorted }, "mirror · ints · sorted", `${all.length} days`);
  }
  {
    // ORACLE-EDIT r2 (item 1, new check S3.5): minutes add up — over every vector + 500 seeded random days
    let seed = 0x31c0ffee;
    const rnd = () => ((seed = (seed + 0x6d2b79f5) | 0), (((seed ^ (seed >>> 15)) * (1 | seed)) >>> 0) / 4294967296);
    const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
    const pick = <X,>(xs: X[]): X => xs[ri(0, xs.length - 1)]!;
    const rand = (): Any => {
      const slots: Any[] = [];
      const n = ri(0, 3);
      const lvs: Any[] = [];
      if (rnd() < 0.4) lvs.push({ id: "LA", status: pick(["APPROVED", "APPROVED", "PENDING"]), halfDay: pick([null, "AM", "PM"]), hours: rnd() < 0.3 ? ri(1, 7) : null, paid: rnd() < 0.7, legacy: rnd() < 0.1 });
      for (let i = 0; i < n; i++) {
        if (rnd() < 0.2) {
          slots.push({ dayId: "ad-DAY", version: 1, slotKey: "DAY", stored: true, final: true, stale: false, orphan: false, status: pick(["NO_SCHEDULE", "DAY_OFF"]), startMin: null, endMin: null, crossesMidnight: null, plannedBreakMin: 0, workedMin: ri(0, 700), breakMin: 0, lateMin: 0, earlyOutMin: 0, otMin: ri(0, 700), missingOut: false, leaveId: null, leaveFraction: null, rosterEntryId: null });
          continue;
        }
        const st = ri(0, 46) * 30;
        const len = ri(2, 24) * 30;
        const cm = st + len > 1440;
        const status = pick(["ON_TIME", "LATE", "EARLY_OUT", "ABSENT", "LEAVE"]);
        const lv = lvs[0] && rnd() < 0.5 ? lvs[0] : null;
        slots.push({
          dayId: `ad-r${i}`, version: 1, slotKey: `r${i}`, stored: true, final: true, stale: false, orphan: false, status, startMin: st, endMin: cm ? st + len - 1440 : st + len, crossesMidnight: cm,
          plannedBreakMin: pick([0, 0, 30, 60]), workedMin: status === "ABSENT" ? 0 : ri(0, len + 180), breakMin: pick([0, 0, 15, 30, 60]), lateMin: status === "LATE" ? ri(1, len) : 0, earlyOutMin: status === "EARLY_OUT" || rnd() < 0.2 ? ri(0, len) : 0,
          otMin: ri(0, 1) ? ri(0, 240) : 0, missingOut: false, leaveId: lv ? lv.id : null, leaveFraction: lv ? (lv.hours ? "0.2" : lv.halfDay ? "0.5" : "1.0") : null, rosterEntryId: `re${i}`,
        });
      }
      return { employeeId: "E1", startDate: null, endDate: null, from: "2031-07-15", to: "2031-07-15", rules: { normalDayMin: pick([420, 480, 540]) }, days: [{ day: "2031-07-15", unitId: "u1", holiday: rnd() < 0.15 ? { id: "H1" } : null, slots, leaves: lvs }] };
    };
    const inputs = [...VEC.map((v) => v.input), ...Array.from({ length: 500 }, rand)];
    const bad: string[] = [];
    let days = 0;
    for (const [i, inp] of inputs.entries()) {
      const out = exec(inp);
      if (!Array.isArray(out)) {
        bad.push(`#${i}:${short(out, 40)}`);
        continue;
      }
      for (const d of out) {
        days++;
        const leave = d.paidLeaveMin + d.unpaidLeaveMin;
        const reg = d.workMin + d.holidayWorkMin;
        const short1 = d.lateMin + d.earlyOutMin + d.absentMin <= Math.max(0, d.plannedMin - leave - reg);
        const side = d.plannedMin === 0 || d.dayClass !== "WORKDAY" || d.review.includes("STRAY_IN") || leave + d.absentMin + d.lateMin + d.earlyOutMin + d.workMin <= d.plannedMin || d.workMin > 0 && d.plannedMin === 0;
        const ints = MIN_KEYS.every((k) => Number.isInteger(d[k]) && d[k] >= 0 && d[k] <= 1440);
        if (!short1 || !side || !ints) bad.push(`#${i}:${hdr(d)}`);
      }
    }
    ck("S3.5", { days: days >= 550, adds: bad.length === 0 }, "late+early+absent ≤ shortfall · planned-side ≤ planned", `${days} days · ${bad.length} off ${bad.slice(0, 2).join(" · ")}`);
  }
  {
    const ok = R && !R.__err;
    ck("S3.4", { blocking: ok && srt(R.WE_BLOCKING ?? []) === srt(BLOCKING), rules: ok && JSON.stringify(R.WORK_RULES_DEFAULT) === JSON.stringify({ normalDayMin: 480, breakRule: "PLANNED_AFTER_5H", breakAfterMin: 300 }), ver: ok && R.WORK_ENTRY_ENGINE_VERSION === 1 }, "exact", modState(R, F.rules));
  }
}

// ═════════════════════════ statics ═════════════════════════
function runStatic(): void {
  const mig = rd(F.mig);
  {
    const dirs = readdirSync(join(ROOT, "prisma/migrations")).filter((d) => /^\d{14}_/.test(d)).sort();
    const r = {
      file: !!mig,
      last: dirs.includes("20270103000000_hr_work_days") && (IN_BASE || !dirs.some((d) => d > "20270103000000_hr_work_days" && /_hr_/.test(d))), // ORACLE-EDIT: ordering n/a once in base
      cls: /CREATE TYPE "HrWorkDayClass" AS ENUM \('WORKDAY',\s*'DAY_OFF',\s*'HOLIDAY',\s*'UNSCHEDULED'\)/.test(mig),
      st: /CREATE TYPE "HrWorkDayStatus" AS ENUM \('WORKED',\s*'LEAVE',\s*'ABSENT',\s*'DAY_OFF',\s*'HOLIDAY',\s*'UNSCHEDULED',\s*'PENDING'\)/.test(mig),
      additive: !!mig && !/DROP |RENAME |ALTER TYPE/i.test(mig),
    };
    ck("S1.1", r, "last · enums · additive");
  }
  {
    const r = {
      table: /CREATE TABLE "HrWorkDay"/.test(mig),
      uniq: /CREATE UNIQUE INDEX[^;]*"HrWorkDay"[^;]*\("employeeId",\s*"date"\)/.test(mig),
      fkEmp: /"HrWorkDay"[^;]*FOREIGN KEY \("employeeId"\) REFERENCES "HrEmployee"[^;]*ON DELETE CASCADE/.test(mig),
      checkMin: /CHECK[^;]{0,200}"workMin"[^;]{0,40}1440/.test(mig),
      checkLd: /CHECK[^;]{0,120}"leaveDays"/.test(mig),
      col: /ALTER TABLE "HrWorkEntry" ADD COLUMN\s+"workDayId" TEXT/.test(mig),
      fkWe: /"HrWorkEntry"[^;]*FOREIGN KEY \("workDayId"\) REFERENCES "HrWorkDay"[^;]*ON DELETE CASCADE/.test(mig),
    };
    ck("S1.2", r, "table · unique · FKs · CHECKs · workDayId");
  }
  {
    const s = stripComments(rd(F.pay));
    const m = block(s, /model HrWorkDay \{/, 3000);
    const r = {
      model: /@@unique\(\[employeeId, date\]\)/.test(m) && /^\s*date\s+DateTime\s+@db\.Date/m.test(m) && /leaveDays\s+Decimal\s+@default\(0\)\s+@db\.Decimal\(2, 1\)/.test(m) && /review\s+String\[\]/.test(m),
      enums: /enum HrWorkDayClass \{\s*WORKDAY\s+DAY_OFF\s+HOLIDAY\s+UNSCHEDULED\s*\}/.test(s) && /enum HrWorkDayStatus \{\s*WORKED\s+LEAVE\s+ABSENT\s+DAY_OFF\s+HOLIDAY\s+UNSCHEDULED\s+PENDING\s*\}/.test(s),
      we: /workDayId\s+String\?/.test(block(s, /model HrWorkEntry \{/, 2500)),
      scope: /\bHrWorkDay:\s*sys\(\)/.test(rd(F.scope)),
      env: /hrWorkDay:\s*\{\s*model:\s*"HrWorkDay"/.test(rd(F.env)),
    };
    ck("S1.3", r, "models · enums · scope · env");
  }
  {
    const writers = gitGrep('hr(WorkDay|WorkEntry)\\s*\\.\\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\\b|(INSERT INTO|UPDATE|DELETE FROM)\\s+"Hr(WorkDay|WorkEntry)"', ["src"]).filter((f) => f !== F.we);
    const we = stripComments(rd(F.we));
    const rules = stripComments(rd(F.rules));
    const imp = importsOf(rules);
    const r = {
      we: !!we, only: writers.length === 0, noEvent: !!we && !/emitOutbox/.test(we),
      pure: !!rules && imp.every((i) => i.type || /^node:crypto$|^\.\/(time-rules|judge-rules)$/.test(i.spec)) && !/prisma|tenantDb|Date\.now|new Date\(\s*\)|Math\.random|\basync\b|\bawait\b|fetch\(/.test(rules),
    };
    ck("S1.4", r, "writer-only · no event · pure", writers.join(","));
  }
  {
    const pay = stripComments(rd(F.payroll));
    const claim = block(pay, /async function claimApproveExpected/, 4500);
    const acts = stripComments(rd(F.payActs));
    const hunks = IN_BASE ? [] : (diffHunks(BASE, F.payroll) ?? []) /* ORACLE-EDIT r2 (item 8): no other-WO exemption — base = merge-base */;
    const marked = IN_BASE || (hunks.length > 0 && hunks.every((h) => h.added.some((l) => /HR H3\.1/.test(l)) && h.removed.every((l) => /ApproveFailCode/.test(l))));
    const r = {
      check: /workEntriesApproveCheckInTx\(\s*tx/.test(claim), bind: /bindWorkEntriesToRunInTx\(\s*tx/.test(claim) && claim.indexOf("bindWorkEntriesToRunInTx") > claim.indexOf("updateMany"),
      code: /ApproveFailCode\s*=[^;]*"WORK_ENTRIES"/.test(pay), acts: /"WORK_ENTRIES"/.test(acts), marked,
    };
    ck("S1.5", r, "check · bind after claim · code · action · marked", IN_BASE ? "diff n/a (in base)" : `${hunks.length} hunks`);
  }
  {
    const j = rd(F.judge);
    const hunks = IN_BASE ? [] : (diffHunks(BASE, F.judge) ?? []);
    const r = { fn: /export async function workEntryDaysInTx\(/.test(j), marked: IN_BASE || (hunks.length > 0 && hunks.every((h) => h.removed.length === 0 && h.added.some((l) => /HR H3\.1/.test(l)))) };
    ck("S1.6", r, "export · marked additions", IN_BASE ? "diff n/a (in base)" : `${hunks.length} hunks`);
  }
  {
    const a = stripComments(rd(F.acts));
    const fns = [...a.matchAll(/export\s+async\s+function\s+(\w+)\s*\(([\s\S]*?)(?=\nexport\s|$)/g)];
    const ui = rd(F.ui);
    const ids = testidsOf(ui, "hr-we-");
    const inv = ((jsonOf(F.inv)?.rows ?? []) as Any[]).filter((x) => String(x.testid ?? "").startsWith("hr-we-"));
    const th = jsonOf(F.th)?.hr?.we;
    const en = jsonOf(F.en)?.hr?.we;
    const tok = tokensOnly(stripComments(ui));
    const r = {
      server: /^\s*["']use server["']/.test(a) && fns.length >= 2 && fns.every((m) => /requireTenant\(/.test(m[2]!)), noNow: !!a && !/\bnow\s*:/.test(a),
      ids: TESTIDS.every((t) => ids.has(t)), inv: TESTIDS.every((t) => inv.some((x) => x.testid === t && x.wo === "H3.1" && x.oracle === SUITE)),
      msg: !!th && !!en && srt(Object.keys(th)) === srt(Object.keys(en)) && Object.keys(th).length >= 5, tokens: !!ui && Object.values(tok).every(Boolean), h44: /min-h-\[44px\]|min-height:\s*44px|h-11\b|min-h-11/.test(ui),
      mounts: /work-entries-ui/.test(rd(F.payPage)) && (/work-entries-ui/.test(rd(F.attPage)) || /work-entries-ui/.test(rd(F.attUi))),
    };
    ck("S1.7", r, "actions · ids · inventory · messages · tokens · mounts", srt(ids));
  }
  {
    const FROZEN = ["payroll-rules-v2.ts", "payroll-digest.ts", "judge-rules.ts", "leave.ts", "leave-rules.ts", "holidays.ts", "roster.ts", "roster-rules.ts", "swap.ts", "clock.ts", "clock-rules.ts", "time-rules.ts", "privacy.ts", "privacy-shared.ts", "service.ts", "lifecycle.ts", "law.ts", "settings.ts"]
      .map((f) => H + f).concat(["src/lib/outbox-consumers.ts", "src/lib/automation/labels.ts", "src/lib/modules/approval/service.ts", "scripts/seed-hr-qc.mts"]);
    const sum = sha(rd(PAYROLL_RULES_FILE));
    const d = IN_BASE ? "n/a (H3.1 in base)" : changedVsBase(BASE, FROZEN);
    chk("S11.1", sum === PAYROLL_RULES_SHA && (IN_BASE || d === "unchanged"), `sha ${PAYROLL_RULES_SHA.slice(0, 10)} · unchanged`, `sha ${sum.slice(0, 10)} · ${d}`);
  }
}

// ═════════════════════════ DB ═════════════════════════
type RO = { ok: boolean; text: string; value: Any };
async function callMod(Mo: Any, file: string, fn: string, args: unknown[]): Promise<RO> {
  const mo = Mo && !Mo.__err ? Mo : null;
  if (typeof mo?.[fn] !== "function") return { ok: false, text: `∅${fn} (${modState(Mo, file)})`, value: undefined };
  try {
    const v = (await mo[fn](...args)) as Any;
    const ok = v !== null && v !== undefined && !(typeof v === "object" && v.ok === false);
    return { ok, text: ok ? "" : textOf(v) || short(v, 80), value: v };
  } catch (e) {
    return { ok: false, text: `THROW ${errText(e)}`, value: undefined };
  }
}
const shown = (r: RO) => (r.ok ? "ok" : `"${short(r.text, 60)}"`);
const keysOf = (o: Any) => (o && typeof o === "object" ? srt(Object.keys(o)) : "∅");

const { P, coreHash } = await qc4Env(SUITE);
if (FORCE && skipReasons.length) console.log(`⚠️ QC_FORCE=1 — running although: ${skipReasons.join(" · ")}`);
const R = await loadOpt(F.rules, "@/lib/modules/hr/work-entries-rules");
const WE = await loadOpt(F.we, "@/lib/modules/hr/work-entries");
console.log(`[${SUITE}] rules=${modState(R, F.rules)} · work-entries=${modState(WE, F.we)} · base=${BASE.slice(0, 9)}${IN_BASE ? " (H3.1 in base)" : ""}`);
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const JG = (await import("@/lib/modules/hr/judge")) as Any;
const pay = (await import("@/lib/modules/hr/payroll")) as Any;
const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${SLUG_PREFIX}${Date.now()}${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
const W_ = (fn: string, ...a: unknown[]) => callMod(WE, F.we, fn, a);
const bk = (day: string, hm = "12:00") => new Date(`${day}T${hm}:00+07:00`);
const FIX_TS = new Date("2031-06-01T00:00:00Z");
const PER = "2031-07";
const N_AUG1 = bk("2031-08-01");

/** holder ถือคีย์ advisory · เริ่ม call · รอจนเห็นการรอจริง · ปล่อย */
async function underLock<R0>(key: string, call: () => Promise<R0>): Promise<{ res: R0; waited: boolean; holderErr: string }> {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  let held: () => void = () => {};
  const heldP = new Promise<void>((r) => (held = r));
  let holderErr = "";
  const holder = P.$transaction(async (tx: Any) => {
    await tx.$queryRawUnsafe(`SELECT count(pg_advisory_xact_lock(hashtextextended($1::text, 0)))::int AS n`, key);
    held();
    await gate;
  }, { maxWait: 10_000, timeout: 30_000 }).catch((e: unknown) => {
    holderErr = errText(e);
    held();
  });
  await heldP;
  const callP = call();
  let waited = false;
  for (let i = 0; i < 60 && !waited; i++) {
    await sleep(100);
    const w = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND wait_event = 'advisory'`).catch(() => null)) as Any[] | null;
    waited = Number(w?.[0]?.n ?? 0) > 0;
  }
  release();
  await holder;
  return { res: await callP, waited, holderErr };
}

async function runDb(): Promise<void> {
  const TT = await fx.newTenant("", "QC HR H3.1 ชั่วโมงทำงาน");
  const T2 = await fx.newTenant("-other", "QC HR H3.1 ร้านอื่น");
  const u1 = await fx.newUnit(TT, `สาขาเหนือ ${tag}`, "u1");
  const u2 = await fx.newUnit(TT, `สาขาใต้ ${tag}`, "u2");
  const sys = async (n: string, t = TT) => (await sysSvc.createSystem(t, "HR", `${n} ${tag}`)).id as string;
  const [sA, sB, sC, sO] = [await sys("ทีม A"), await sys("ทีม B"), await sys("ทีม C"), await sys("ทีมอื่น", T2)];
  const [cA, cB, cC, cO] = [sA, sB, sC].map((s) => ({ tenantId: TT, systemId: s })).concat([{ tenantId: T2, systemId: sO }]);
  const mk = (t: string, r: Who["role"], ua: string[], p: Record<string, boolean>, tid = TT) => fx.mkUser(tid, t, `QC31 ${t} ${tag}`, r, ua, p);
  const U = {
    owner: await mk("owner", "OWNER", [], {}), payroll: await mk("payroll", "STAFF", ["*"], { "hr.payroll.read": true }), mgrU1: await mk("mgru1", "MANAGER", [u1], {}),
    writerU2: await mk("writeru2", "STAFF", [u2], { "hr.employee.create": true }), member: await mk("member", "STAFF", [], {}), self: await mk("self", "STAFF", [], {}),
    other: await mk("other", "OWNER", [], {}, T2),
  };
  const V = Object.fromEntries(Object.entries(U).map(([k, w]) => [k, vOf(w)])) as Record<keyof typeof U, Any>;
  const me = (s: string, n: string, o: Record<string, unknown> = {}, tid = TT) => fx.mkEmp(tid, s, `${n} ${tag}`, { startDate: "2030-01-01", ...o } as Any);
  const E = {
    eA: await me(sA, "เอ", { unitId: u1, linkedUserId: U.self.id }), eB: await me(sA, "บี", { unitId: u2 }), eC: await me(sA, "ซี", { unitId: u2 }),
    eD: await me(sA, "ดี", { unitId: u1, startDate: "2031-07-15", endDate: "2031-07-24" }), eH: await me(sA, "เอช", { unitId: u2 }), eU: await me(sA, "ยู", { unitId: u1 }),
    eP: await me(sB, "พี", { unitId: u1 }), eQ: await me(sB, "คิว", { unitId: u1 }), eR: await me(sC, "อาร์", { unitId: u1 }), eO: await me(sO, "โอ", {}, T2),
  };
  const shiftOf = async (s: string, name: string, a: number, b: number, cm = false, tid = TT) => ({ id: (await P.hrShift.create({ data: { tenantId: tid, systemId: s, name: `${name} ${tag}`, startMin: a, endMin: b, crossesMidnight: cm, graceMin: 15 } })).id as string, a, b, cm });
  const shA = { M: await shiftOf(sA, "เช้า", 420, 900), N: await shiftOf(sA, "ดึก", 1320, 360, true), S1: await shiftOf(sA, "แยกเช้า", 420, 660), S2: await shiftOf(sA, "แยกเย็น", 1020, 1320) };
  const shB = await shiftOf(sB, "เช้าบี", 420, 900);
  const shC = await shiftOf(sC, "เช้าซี", 420, 900);
  const ent = async (s: string, emp: string, day: string, sh: Any, unitId: string | null, breakMin = 0) =>
    (await P.hrRosterEntry.create({ data: { tenantId: TT, systemId: s, employeeId: emp, date: dbDate(day), shiftId: sh.id, unitId, startMin: sh.a, endMin: sh.b, breakMin, crossesMidnight: sh.cm, published: true, publishedAt: FIX_TS, source: "MANUAL" } })).id as string;
  const att = async (s: string, emp: string, kind: string, at: Date, re: string | null) => (await P.hrAttendance.create({ data: { tenantId: TT, systemId: s, employeeId: emp, kind, at, rosterEntryId: re, source: "KIOSK" } })).id as string;
  const io = async (s: string, emp: string, re: string | null, inAt: Date, outAt: Date | null) => {
    const i = await att(s, emp, "IN", inAt, re);
    const o = outAt ? await att(s, emp, "OUT", outAt, re) : null;
    return { i, o };
  };
  const pol = async (category: string, name: string, paid: boolean) => (await P.hrLeavePolicy.create({ data: { tenantId: TT, systemId: sA, category, name: `${name} ${tag}`, paid, allowHours: true } })).id as string;
  const POL = { sick: await pol("SICK", "ลาป่วย", true), unpaid: await pol("PERSONAL", "ลากิจไม่รับค่าจ้าง", false), vac: await pol("VACATION", "พักร้อน", true) };
  const leave = async (emp: string, type: string, day: string, policyId: string, o: Record<string, unknown> = {}) =>
    (await P.hrLeave.create({ data: { tenantId: TT, systemId: sA, employeeId: emp, type, fromDate: dbDate(day), toDate: dbDate(day), status: "APPROVED", policyId, reason: `เหตุผลลับ ${tag}`, ...o } })).id as string;

  // ── system A · July 2031 (week Mon 21 – Sun 27) ──
  const X: Record<string, string> = {};
  X.a21 = await ent(sA, E.eA, "2031-07-21", shA.M, u1, 60);
  await io(sA, E.eA, X.a21, bk("2031-07-21", "07:00"), bk("2031-07-21", "15:00"));
  X.a22 = await ent(sA, E.eA, "2031-07-22", shA.M, u1);
  await io(sA, E.eA, X.a22, bk("2031-07-22", "07:20"), bk("2031-07-22", "15:00"));
  X.a23 = await ent(sA, E.eA, "2031-07-23", shA.M, u1);
  await io(sA, E.eA, X.a23, bk("2031-07-23", "07:00"), bk("2031-07-23", "17:00"));
  X.a24 = await ent(sA, E.eA, "2031-07-24", shA.M, u1);
  X.a25 = await ent(sA, E.eA, "2031-07-25", shA.M, u1);
  const lvA25 = await leave(E.eA, "SICK", "2031-07-25", POL.sick, { days: 1 });
  await io(sA, E.eA, null, bk("2031-07-26", "09:00"), bk("2031-07-26", "19:00"));
  X.b21 = await ent(sA, E.eB, "2031-07-21", shA.M, u2);
  await io(sA, E.eB, X.b21, bk("2031-07-21", "11:00"), bk("2031-07-21", "15:00"));
  await leave(E.eB, "PERSONAL", "2031-07-21", POL.unpaid, { halfDay: "AM", days: 0.5 });
  X.b22a = await ent(sA, E.eB, "2031-07-22", shA.S1, u2);
  X.b22b = await ent(sA, E.eB, "2031-07-22", shA.S2, u2);
  await io(sA, E.eB, X.b22a, bk("2031-07-22", "07:00"), bk("2031-07-22", "11:00"));
  await io(sA, E.eB, X.b22b, bk("2031-07-22", "17:00"), bk("2031-07-22", "22:00"));
  X.b23a = await ent(sA, E.eB, "2031-07-23", shA.S1, u2);
  X.b23b = await ent(sA, E.eB, "2031-07-23", shA.S2, u2);
  await io(sA, E.eB, X.b23a, bk("2031-07-23", "07:00"), bk("2031-07-23", "11:00"));
  X.b24 = await ent(sA, E.eB, "2031-07-24", shA.N, u2);
  await io(sA, E.eB, X.b24, bk("2031-07-24", "22:00"), bk("2031-07-25", "06:00"));
  X.b31 = await ent(sA, E.eB, "2031-07-31", shA.N, u2);
  await io(sA, E.eB, X.b31, bk("2031-07-31", "22:00"), bk("2031-08-01", "06:00"));
  X.c21 = await ent(sA, E.eC, "2031-07-21", shA.M, u2);
  await io(sA, E.eC, X.c21, bk("2031-07-21", "09:00"), bk("2031-07-21", "15:00"));
  await leave(E.eC, "VACATION", "2031-07-21", POL.vac, { hours: 2, days: 0.2 });
  X.c22 = await ent(sA, E.eC, "2031-07-22", shA.M, u2);
  const c22 = await io(sA, E.eC, X.c22, bk("2031-07-22", "07:00"), bk("2031-07-22", "15:00"));
  X.c23 = await ent(sA, E.eC, "2031-07-23", shA.M, u2);
  const lvC23 = await leave(E.eC, "VACATION", "2031-07-23", POL.vac, { days: 1 });
  X.h25 = await ent(sA, E.eH, "2031-07-25", shA.M, u2);
  await io(sA, E.eH, X.h25, bk("2031-07-25", "07:00"), bk("2031-07-25", "16:00"));
  const hol = (await P.hrHoliday.create({ data: { tenantId: TT, systemId: sA, unitId: u2, date: dbDate("2031-07-25"), name: `วันหยุด ${tag}`, kind: "PUBLIC" } })).id as string;
  await leave(E.eD, "SICK", "2031-07-16", POL.sick, { days: 1 });
  await io(sA, E.eU, null, bk("2031-07-23", "10:00"), bk("2031-07-23", "15:00"));
  const job = (now: Date) => JG.runAttendanceJobs({ now, tenantId: TT });
  await job(bk("2031-07-28"));
  await job(N_AUG1);
  const adRows = async () => ((await P.$queryRawUnsafe(`SELECT id, "employeeId", date, "slotKey", status::text AS status, "workedMin", "lateMin", "otMin", "leaveFraction"::text AS f, "missingOut", version FROM "HrAttendanceDay" WHERE "tenantId" = $1 ORDER BY date, "slotKey"`, TT)) as Any[]);
  const nameOf = Object.fromEntries(Object.entries(E).map(([k, v]) => [v, k]));
  {
    const rows = await adRows();
    const pick = (k: string, d: string) => rows.filter((r) => nameOf[r.employeeId] === k && dk(r.date) === d).map((r) => `${r.status}:w${r.workedMin}:l${r.lateMin}:o${r.otMin}:f${r.f ?? "-"}`).sort().join("+");
    const got = [["eA", "2031-07-21"], ["eA", "2031-07-22"], ["eA", "2031-07-23"], ["eA", "2031-07-24"], ["eA", "2031-07-25"], ["eA", "2031-07-26"], ["eB", "2031-07-21"], ["eB", "2031-07-23"], ["eB", "2031-07-24"], ["eB", "2031-07-25"], ["eB", "2031-07-31"], ["eC", "2031-07-21"], ["eH", "2031-07-25"], ["eU", "2031-07-23"]].map(([k, d]) => `${k}${d!.slice(8)}=${pick(k!, d!)}`).join(" ");
    const want = "eA21=ON_TIME:w480:l0:o0:f- eA22=LATE:w460:l20:o0:f- eA23=ON_TIME:w600:l0:o120:f- eA24=ABSENT:w0:l0:o0:f- eA25=LEAVE:w0:l0:o0:f1.0 eA26=DAY_OFF:w600:l0:o600:f- eB21=ON_TIME:w240:l0:o0:f0.5 eB23=ABSENT:w0:l0:o0:f-+ON_TIME:w240:l0:o0:f- eB24=ON_TIME:w480:l0:o0:f- eB25=DAY_OFF:w0:l0:o0:f- eB31=ON_TIME:w480:l0:o0:f- eC21=LATE:w360:l120:o0:f0.2 eH25=ON_TIME:w540:l0:o60:f- eU23=NO_SCHEDULE:w300:l0:o0:f-";
    chk("S11.2", got === want, "H2.5 rows as assumed", got === want ? `${rows.length} rows` : got);
  }

  // ── S4 build ──
  const wdRows = async (tid = TT, s?: string) => (await fx.rawRows(`SELECT * FROM "HrWorkDay" WHERE "tenantId" = $1 ${s ? `AND "systemId" = '${s}'` : ""} ORDER BY date, "employeeId"`, tid)) as Any[] | null;
  const weRows = async (s: string) => (await fx.rawRows(`SELECT * FROM "HrWorkEntry" WHERE "tenantId" = $1 AND "systemId" = $2`, TT, s)) as Any[] | null;
  const build = (ctx: Any, v: Any, now: Date, input: Any = { periodKey: PER }) => W_("buildWorkEntrySnapshot", ctx, v, input, { now });
  {
    const cat = (await fx.rawRows(`SELECT column_name AS c, data_type AS dt, udt_name AS u, is_nullable AS n, column_default AS d FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'HrWorkDay'`)) as Any[] | null;
    const col = (c: string) => cat?.find((x) => x.c === c);
    const ints = MIN_KEYS.every((k) => col(k)?.dt === "integer" && col(k)?.n === "NO" && /^0/.test(String(col(k)?.d ?? "")));
    const we = (await fx.rawRows(`SELECT data_type AS dt FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'HrWorkEntry' AND column_name = 'workDayId'`)) as Any[] | null;
    const r = {
      table: (cat?.length ?? 0) > 0, ints, date: col("date")?.dt === "date", cls: col("dayClass")?.u === "HrWorkDayClass", st: col("dayStatus")?.u === "HrWorkDayStatus",
      ld: col("leaveDays")?.dt === "numeric", review: col("review")?.u === "_text", src: col("sourcesJson")?.dt === "jsonb", hash: col("inputHash")?.n === "NO" && col("digest")?.n === "NO", run: col("runId")?.n === "YES", we: we?.[0]?.dt === "text",
    };
    ck("S4.1", r, "catalogue", `${cat?.length ?? "∅"} cols`);
  }
  const b1 = await build(cA, V.owner, N_AUG1);
  const rows1 = (await wdRows(TT, sA)) ?? [];
  const day = (rows: Any[] | null, k: string, d: string) => (rows ?? []).find((r) => nameOf[r.employeeId] === k && dk(r.date) === d);
  {
    const per = (k: string) => rows1.filter((r) => nameOf[r.employeeId] === k).length;
    const v = b1.value ?? {};
    ck("S4.2", { ok: b1.ok, emp: v.employees === 6, written: v.written === 165, rows: rows1.length === 165, each: ["eA", "eB", "eC", "eH", "eU"].every((k) => per(k) === 31) && per("eD") === 10, block: v.blocking === 0, next: v.next === null }, "6 · 165 · 31×5 + 10", `${shown(b1)} ${short(v, 90)} rows=${rows1.length}`);
  }
  const LIT: [string, string, string][] = [
    ["eA", "2031-07-21", Hd(W, "WORKED", { p: 420, w: 420, bd: 60 })], ["eA", "2031-07-22", Hd(W, "WORKED", { p: 480, w: 460, la: 20 })], ["eA", "2031-07-23", Hd(W, "WORKED", { p: 480, w: 480, ow: 120 })],
    ["eA", "2031-07-24", Hd(W, "ABSENT", { p: 480, ab: 480 })], ["eA", "2031-07-25", Hd(W, "LEAVE", { p: 480, pl: 480 }, "1.0")], ["eA", "2031-07-26", Hd("DAY_OFF", "WORKED", { hw: 480, oh: 120 })],
    ["eA", "2031-07-27", Hd("DAY_OFF", "DAY_OFF")], ["eB", "2031-07-21", Hd(W, "WORKED", { p: 480, w: 240, ul: 240 }, "0.5")], ["eB", "2031-07-22", Hd(W, "WORKED", { p: 540, w: 540 })],
    ["eB", "2031-07-23", Hd(W, "WORKED", { p: 540, w: 240, ab: 300 })], ["eB", "2031-07-24", Hd(W, "WORKED", { p: 480, w: 480 })], ["eB", "2031-07-25", Hd("HOLIDAY", "HOLIDAY", { hp: 480 })],
    ["eB", "2031-07-31", Hd(W, "WORKED", { p: 480, w: 480 })], ["eC", "2031-07-21", Hd(W, "WORKED", { p: 480, w: 360, pl: 120 }, "0.2")], ["eH", "2031-07-25", Hd("HOLIDAY", "WORKED", { p: 480, hw: 480, oh: 60, hp: 480 })],
    ["eD", "2031-07-16", Hd("UNSCHEDULED", "LEAVE", { pl: 480 }, "1.0")], ["eU", "2031-07-23", Hd(W, "WORKED", { w: 300 })],
  ];
  {
    const bad = LIT.map(([k, d, want]) => [`${k}${d.slice(8)}`, hdr(day(rows1, k, d)), want]).filter(([, g, w]) => g !== w);
    chk("S4.3", rows1.length > 0 && !bad.length, `${LIT.length} literals`, bad.slice(0, 2).map(([id, g]) => `${id}=${g}`).join(" · ") || "all");
  }
  const prev = (ctx: Any, v: Any) => W_("workEntryPreview", ctx, v, { periodKey: PER }, { now: N_AUG1 });
  {
    const p = await prev(cA, V.owner);
    const rowOf = (k: string) => (p.value?.rows ?? []).find((r: Any) => r.employeeId === E[k as keyof typeof E]);
    const sumStr = (s: Any) => (s ? SUM_KEYS.split(",").map((k) => `${k}=${s[k]}`).join(" ") : "∅");
    const want = (o: Record<string, unknown>) => SUM_KEYS.split(",").map((k) => `${k}=${o[k] ?? 0}`).join(" ");
    const wA = want({ employedDays: 31, worked: 4, leave: 1, absent: 1, dayOff: 1, unscheduled: 24, leaveDays: "1.0", plannedMin: 2340, workMin: 1360, otWorkdayMin: 120, holidayWorkMin: 480, otHolidayMin: 120, paidLeaveMin: 480, absentMin: 480, lateMin: 20, lateCount: 1 });
    const wB = want({ employedDays: 31, worked: 5, dayOff: 5, holiday: 1, unscheduled: 20, leaveDays: "0.5", plannedMin: 2520, workMin: 1980, holidayPaidMin: 480, unpaidLeaveMin: 240, absentMin: 300 });
    const r = { ok: p.ok, a: sumStr(rowOf("eA")?.summary) === wA, b: sumStr(rowOf("eB")?.summary) === wB };
    ck("S4.4", r, "eA · eB literal", `${shown(p)} A: ${sumStr(rowOf("eA")?.summary).slice(0, 160)}`);
  }
  {
    const we = await weRows(sA);
    const by = new Map<string, [number, number]>();
    for (const x of we ?? []) by.set(x.kind, [(by.get(x.kind)?.[0] ?? 0) + 1, (by.get(x.kind)?.[1] ?? 0) + x.minutes]);
    const sums = KIND_ORDER.filter((k) => by.has(k)).map((k) => `${k}:${by.get(k)![0]}:${by.get(k)![1]}`).join(",");
    const W23 = day(rows1, "eA", "2031-07-23");
    const ot = (we ?? []).find((x) => x.kind === "OT_WORKDAY");
    const lp = (we ?? []).find((x) => x.kind === "LEAVE_PAID" && nameOf[x.employeeId] === "eA");
    const hp = (we ?? []).find((x) => x.kind === "HOLIDAY_PAID" && nameOf[x.employeeId] === "eB");
    const r = {
      n: we?.length === 27, sums: sums === "WORK:11:4480,OT_WORKDAY:1:120,HOLIDAY_WORK:2:960,OT_HOLIDAY:2:180,HOLIDAY_PAID:3:1440,LEAVE_PAID:4:1560,LEAVE_UNPAID:1:240,ABSENT:2:780,LATE:1:20",
      ot: !!ot && ot.rosterEntryId === X.a23 && !!W23 && ot.workDayId === W23.id, leave: lp?.leaveId === lvA25, hol: hp?.holidayId === hol, period: (we ?? []).every((x) => x.periodKey === PER && x.runId === null),
    };
    ck("S4.5", r, "27 · Σ kinds · sources", `${we?.length ?? "∅"} ${sums.slice(0, 120)}`);
  }
  {
    const a21 = day(rows1, "eA", "2031-07-21");
    const ad = (await adRows()).find((r) => nameOf[r.employeeId] === "eA" && dk(r.date) === "2031-07-21");
    const src = a21?.sourcesJson ?? {};
    const p = await prev(cA, V.owner);
    const r = {
      // ORACLE-EDIT (H3.1 build): sourcesJson is jsonb (S4.1) — Postgres returns object keys in its own order (length, then bytes) ⇒ compare key-sorted
      att: ksJson(src.attendanceDays) === ksJson([{ id: ad?.id, version: 1, slotKey: X.a21 }]), roster: JSON.stringify(src.rosterEntryIds) === JSON.stringify([X.a21]), hol: src.holidayId === null,
      hash: /^[0-9a-f]{64}$/.test(String(a21?.inputHash)) && /^[0-9a-f]{64}$/.test(String(a21?.digest)), ver: a21?.version === 1 && a21?.engineVersion === 1 && a21?.runId === null, cur: p.value?.state === "CURRENT",
    };
    ck("S4.6", r, "sources · hashes · version · CURRENT", short(src, 100));
  }
  // ── S5 idempotency ──
  {
    const b2 = await build(cA, V.owner, N_AUG1);
    const rows2 = (await wdRows(TT, sA)) ?? [];
    const sig = (rs: Any[]) => sha(rs.map((r) => `${r.id}:${r.version}:${isoOfSafe(r.updatedAt)}:${r.digest}`).join("|"));
    const we2 = await weRows(sA);
    ck("S5.1", { ok: b2.ok, zero: b2.value?.written === 0 && b2.value?.unchanged === 165, same: rows1.length > 0 && sig(rows2) === sig(rows1), we: (we2?.length ?? -1) === 27 }, "0 writes · identical", `${shown(b2)} ${short(b2.value, 80)}`);
  }
  // ── S6 changed inputs ──
  const rec = (ctx: Any, dayId: string, now = N_AUG1) => JG.recomputeAttendanceDay(ctx, V.owner, { dayId, reason: "แก้ผลตรวจ QC" }, { now }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
  const adId = async (k: string, d: string) => (await adRows()).find((r) => nameOf[r.employeeId] === k && dk(r.date) === d)?.id as string;
  const stateOf = async (k: string) => ((await prev(cA, V.owner)).value?.rows ?? []).find((r: Any) => r.employeeId === E[k as keyof typeof E])?.state ?? "∅";
  {
    await P.hrAttendance.update({ where: { id: c22.o! }, data: { at: bk("2031-07-22", "16:00") } });
    const rc = await rec(cA, await adId("eC", "2031-07-22"));
    const states = await Promise.all(["eA", "eB", "eC", "eD", "eH", "eU"].map(stateOf));
    const b = await build(cA, V.owner, N_AUG1);
    const r22 = day(await wdRows(TT, sA), "eC", "2031-07-22");
    const r = { rec: rc?.ok === true && rc?.version === 2, states: states.join() === "CURRENT,CURRENT,OUTDATED,CURRENT,CURRENT,CURRENT", one: b.value?.written === 1, lit: hdr(r22) === Hd(W, "WORKED", { p: 480, w: 480, ow: 60 }), ver: r22?.version === 2 && r22?.sourcesJson?.attendanceDays?.[0]?.version === 2 };
    ck("S6.1", r, "only eC OUTDATED · OT 60 · v2", `${states.join()} ${hdr(r22)}`);
  }
  {
    await P.hrLeave.update({ where: { id: lvC23 }, data: { status: "REJECTED" } });
    const s0 = await stateOf("eC");
    const b = await build(cA, V.owner, N_AUG1);
    const r23 = day(await wdRows(TT, sA), "eC", "2031-07-23");
    ck("S6.2", { outdated: s0 === "OUTDATED", stale: reviewOf(r23?.review).includes("STALE"), state: (await stateOf("eC")) === "REVIEW", blocking: Number(b.value?.blocking) >= 1 }, "OUTDATED → STALE → REVIEW", `${s0} ${hdr(r23)}`);
  }
  {
    const rc = await rec(cA, await adId("eC", "2031-07-23"));
    const s0 = await stateOf("eC");
    await build(cA, V.owner, N_AUG1);
    const r23 = day(await wdRows(TT, sA), "eC", "2031-07-23");
    ck("S6.3", { rec: rc?.ok === true, outdated: s0 === "OUTDATED", lit: hdr(r23) === Hd(W, "ABSENT", { p: 480, ab: 480 }), cur: (await stateOf("eC")) === "CURRENT" }, "ABSENT 480 · CURRENT", `${s0} ${hdr(r23)}`);
  }
  {
    await P.hrAttendance.update({ where: { id: c22.o! }, data: { at: bk("2031-07-22", "15:00") } });
    const dayId = await adId("eC", "2031-07-22");
    const [, b] = await Promise.all([rec(cA, dayId), build(cA, V.owner, N_AUG1)]);
    const ver = (await adRows()).find((r) => r.id === dayId)?.version;
    const srcV = day(await wdRows(TT, sA), "eC", "2031-07-22")?.sourcesJson?.attendanceDays?.[0]?.version;
    const st = await stateOf("eC");
    const inv = st === "CURRENT" ? srcV === ver : st === "OUTDATED" ? srcV === 2 : false;
    await build(cA, V.owner, N_AUG1);
    const r22 = day(await wdRows(TT, sA), "eC", "2031-07-22");
    ck("S9.4", { b: b.ok, ver: ver === 3, inv, conv: (await stateOf("eC")) === "CURRENT" && hdr(r22) === Hd(W, "WORKED", { p: 480, w: 480 }) }, "consistent · converges", `${st} src=${srcV} ver=${ver}`);
  }
  // ── S6.4 ORACLE-EDIT (new check, controller 12 Nov — closes D6 for corrections): H2.6 time correction → OUTDATED → rebuild from corrected minutes ──
  //   own system D (Dec 2031) so the July/Sept/Oct literals are untouched · owner files a CHANGE ⇒ approved + applied in the same tx (H2.6 Q4)
  {
    const sD = await sys("ทีม D");
    const cD = { tenantId: TT, systemId: sD };
    const eS = await me(sD, "เอส", { unitId: u1 });
    const shD = await shiftOf(sD, "เช้าดี", 420, 900);
    const xs = await ent(sD, eS, "2031-12-01", shD, u1);
    const p = await io(sD, eS, xs, bk("2031-12-01", "07:00"), bk("2031-12-01", "15:00"));
    const N2 = bk("2031-12-09"); // after the week (Mon 1 – Sun 7) is closed: DAY_OFF slots finalised
    await job(bk("2031-12-02"));
    await job(N2);
    const PD = { periodKey: "2031-12" };
    const b0 = await build(cD, V.owner, N2, PD);
    const st = async () => ((await W_("workEntryPreview", cD, V.owner, PD, { now: N2 })).value?.rows ?? []).find((r: Any) => r.employeeId === eS)?.state ?? "∅";
    const s0 = await st();
    const CM = (await import("@/lib/modules/hr/correction")) as Any;
    const rq = await CM.requestCorrection(cD, V.owner, { action: "CHANGE", employeeId: eS, attendanceId: p.o, at: bk("2031-12-01", "17:00"), reason: "แก้เวลาออก QC" }, { now: N2 }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    const voided = (await P.hrAttendance.findFirst({ where: { id: p.o! }, select: { voidedAt: true } }))?.voidedAt != null;
    const s1 = await st();
    const b1 = await build(cD, V.owner, N2, PD);
    const r1 = day(await wdRows(TT, sD), "eS", "2031-12-01") ?? (await wdRows(TT, sD))?.find((r) => r.employeeId === eS && dk(r.date) === "2031-12-01");
    const r = {
      before: b0.ok && s0 === "CURRENT", req: rq?.ok === true && rq?.status === "APPROVED", voided, outdated: s1 === "OUTDATED", rebuilt: b1.ok && b1.value?.written === 1,
      lit: hdr(r1) === Hd(W, "WORKED", { p: 480, w: 480, ow: 120 }), ver: r1?.version === 2 && r1?.sourcesJson?.attendanceDays?.[0]?.version === 2, cur: (await st()) === "CURRENT",
    };
    ck("S6.4", r, "OUTDATED → corrected minutes · CURRENT", `${s0}→${s1} ${short(rq, 60)} ${hdr(r1)}`);
  }
  // ── S6.5 + S9.5 ORACLE-EDIT r2 (new checks, controller items 2 + 3): system E · Jan 2032 (week Mon 5 – Sun 11) ──
  {
    const sE = await sys("ทีม E");
    const cE = { tenantId: TT, systemId: sE };
    const eG = await me(sE, "จี", { unitId: u1 });
    const eK = await me(sE, "เค", { unitId: u1 });
    const morning = (await P.hrShift.create({ data: { tenantId: TT, systemId: sE, name: `Morning ${tag}`, startMin: 420, endMin: 900, crossesMidnight: false, graceMin: 5 } })).id as string;
    const shE = { id: morning, a: 420, b: 900, cm: false };
    const xg = await ent(sE, eG, "2032-01-05", shE, u1);
    await io(sE, eG, xg, bk("2032-01-05", "07:10"), bk("2032-01-05", "15:00"));
    const xk = await ent(sE, eK, "2032-01-07", shE, u1);
    const lvK = (await P.hrLeave.create({ data: { tenantId: TT, systemId: sE, employeeId: eK, type: "SICK", fromDate: dbDate("2032-01-07"), toDate: dbDate("2032-01-07"), status: "APPROVED", reason: `ลับ ${tag}`, days: 1 } })).id as string;
    void xk;
    const NJ = bk("2032-01-13");
    await job(bk("2032-01-06"));
    await job(bk("2032-01-08"));
    await job(NJ);
    const PE = { periodKey: "2032-01" };
    const stE = async (emp: string) => ((await W_("workEntryPreview", cE, V.owner, PE, { now: NJ })).value?.rows ?? []).find((r: Any) => r.employeeId === emp)?.state ?? "∅";
    // S9.5 first (eK): the leave is revoked after the builder read its inputs, before it finished hashing them
    const bK = await W_("buildWorkEntrySnapshot", cE, V.owner, { ...PE, employeeIds: [eK] }, { now: NJ, __afterRead: async () => void (await P.hrLeave.update({ where: { id: lvK }, data: { status: "REJECTED" } })) });
    const sK = await stE(eK);
    const rK = ((await wdRows(TT, sE)) ?? []).find((r) => r.employeeId === eK && dk(r.date) === "2032-01-07");
    const consistent = !!rK && !reviewOf(rK.review).some((c) => c === "STALE" || c === "LEAVE_MISMATCH") && rK.paidLeaveMin === 480; // rows still say "leave" — only acceptable if the state is not CURRENT
    ck("S9.5", { built: bK.ok, notCurrent: sK !== "CURRENT" || !consistent }, "never CURRENT with pre-revoke rows", `${shown(bK)} state=${sK} ${hdr(rK)}`);
    // S6.5 (eG): grace 5 → 15 makes the stored LATE 10 row stale without any version bump
    await pay.setSalaryProfile(cE, { employeeId: eG, baseSalarySatang: 1_000_000, ssoEligible: true });
    const run = await pay.createPayrollRun(cE, { periodKey: "2032-01", payDate: new Date("2032-01-31T00:00:00Z") });
    await P.hrPayrollRun.update({ where: { id: run.id }, data: { engineVersion: 2 } });
    const bG = await W_("buildWorkEntrySnapshot", cE, V.owner, { ...PE, employeeIds: [eG] }, { now: NJ });
    const g0 = ((await wdRows(TT, sE)) ?? []).find((r) => r.employeeId === eG && dk(r.date) === "2032-01-05");
    const s0 = await stE(eG);
    await P.hrShift.update({ where: { id: morning }, data: { graceMin: 15 } });
    const s1 = await stE(eG);
    const refused = (a0: Any) => a0?.ok === false && a0?.code === "WORK_ENTRIES" && a0?.note === T.approveBlocked;
    const a1 = await pay.approveRun(cE, run.id);
    await W_("buildWorkEntrySnapshot", cE, V.owner, { ...PE, employeeIds: [eG] }, { now: NJ });
    const g1 = ((await wdRows(TT, sE)) ?? []).find((r) => r.employeeId === eG && dk(r.date) === "2032-01-05");
    const a2 = await pay.approveRun(cE, run.id);
    const status = (await P.hrPayrollRun.findUnique({ where: { id: run.id } }))?.status;
    ck("S6.5", {
      lit: bG.ok && hdr(g0) === Hd(W, "WORKED", { p: 480, w: 470, la: 10 }) && s0 === "CURRENT", outdated: s1 === "OUTDATED", refused: refused(a1),
      stale: reviewOf(g1?.review).includes("STALE"), still: refused(a2) && status === "DRAFT",
    }, "OUTDATED · refused · STALE · refused", `${s0}→${s1} ${hdr(g0)} | ${hdr(g1)} ${short(a1, 40)}`);
  }
  // ── S10 privacy (system A, July) ──
  {
    const n = async (v: Any, ctx = cA) => {
      const p = await prev(ctx, v);
      return p.ok ? String((p.value?.rows ?? []).length) : p.text === T.no ? "no" : `✗${short(p.text, 30)}`;
    };
    const po = await prev(cO, V.other);
    const leak = JSON.stringify(po.value ?? {}).includes(E.eA) || JSON.stringify(po.value ?? {}).includes(tag + "เอ");
    const got = [await n(V.owner), await n(V.payroll), await n(V.mgrU1), await n(V.writerU2), await n(V.member)].join(",");
    const mg = await prev(cA, V.mgrU1);
    const ids = srt((mg.value?.rows ?? []).map((r: Any) => r.employeeId));
    ck("S10.1", { got: got === "6,6,3,3,no", u1: ids === srt([E.eA, E.eD, E.eU]), other: po.ok && !leak }, "6,6,3,3,no · u1 only · no leak", `${got} other=${shown(po)}`);
  }
  const days = (ctx: Any, v: Any, employeeId: string) => W_("workEntryDays", ctx, v, { employeeId, periodKey: PER }, { now: N_AUG1 });
  {
    const rs = [await days(cA, V.mgrU1, E.eC), await days(cA, V.mgrU1, "no-such-employee"), await days(cA, V.member, E.eA), await days(cO, V.other, E.eA), await days(cA, V.writerU2, E.eA)];
    ck("S10.2", { all: rs.every((r) => !r.ok && r.text === T.no), same: new Set(rs.map((r) => JSON.stringify(r.value))).size === 1 }, "identical refusal × 5", rs.map(shown).join(" | "));
  }
  {
    const mine = await W_("myWorkEntryDays", cA, { userId: U.self.id }, { periodKey: PER, employeeId: E.eB }, { now: N_AUG1 });
    const none = await W_("myWorkEntryDays", cA, { userId: U.member.id }, { periodKey: PER }, { now: N_AUG1 });
    ck("S10.3", { own: mine.ok && mine.value?.employee?.id === E.eA && (mine.value?.days ?? []).length === 31, unlinked: !none.ok && none.text === T.noEmp }, "own · noEmp", `${shown(mine)} ${shown(none)}`);
  }
  {
    const p = await prev(cA, V.owner);
    const d = await days(cA, V.owner, E.eC);
    const row = p.value?.rows?.[0];
    const dd = (d.value?.days ?? []).find((x: Any) => x.day === "2031-07-21");
    const all = [...keysDeep(p.value), ...keysDeep(d.value)];
    const r = {
      top: keysOf(p.value) === "ok,periodKey,rows,state", row: keysOf(row) === "employeeId,name,position,reviewCount,state,summary", sum: keysOf(row?.summary) === SUM_KEYS,
      dtop: keysOf(d.value) === "days,employee,ok,periodKey,state", emp: keysOf(d.value?.employee) === "id,name", day: keysOf(dd) === DAY_KEYS, src: keysOf(dd?.sources) === "attendanceDayIds,holidayId,leaveIds,rosterEntryIds",
      clean: !all.some((k) => HR_FORBIDDEN_DTO_KEYS.includes(k) || /satang|salary|rate|amount|digest|inputhash|photo|^lat$|^lng$/i.test(k)),
    };
    ck("S10.4", r, "keys exact · clean", `${keysOf(dd).slice(0, 120)}`);
  }
  {
    const lab = async (v: Any, emp: string, d: string) => ((await days(cA, v, emp)).value?.days ?? []).find((x: Any) => x.day === d)?.leaveLabel;
    const r = { owner: (await lab(V.owner, E.eC, "2031-07-21")) === `พักร้อน ${tag}`, writer: (await lab(V.writerU2, E.eC, "2031-07-21")) === "ลา", mgr: (await lab(V.mgrU1, E.eA, "2031-07-25")) === `ลาป่วย ${tag}`, none: (await lab(V.owner, E.eA, "2031-07-22")) === null };
    ck("S10.5", r, "policy · ลา · null", "");
  }
  {
    const before = (await wdRows(TT, sA))?.length ?? -1;
    const rs = [await build(cA, V.mgrU1, N_AUG1), await build(cA, V.member, N_AUG1)];
    const bp = await build(cA, V.owner, N_AUG1, { periodKey: "2031-13" });
    ck("S10.6", { no: rs.every((r) => !r.ok && r.text === T.buildNo), period: !bp.ok && bp.text === T.period, none: before > 0 && ((await wdRows(TT, sA))?.length ?? -2) === before }, "buildNo ×2 · period · 0 writes", `${rs.map(shown).join(" | ")} ${shown(bp)}`);
  }
  // ── S8 v1 freeze (system A) ──
  {
    await pay.setSalaryProfile(cA, { employeeId: E.eA, baseSalarySatang: 1_500_000, ssoEligible: true });
    const run = await pay.createPayrollRun(cA, { periodKey: PER, payDate: new Date("2031-07-31T00:00:00Z") });
    const ap = await pay.approveRun(cA, run.id);
    const rr = await P.hrPayrollRun.findUnique({ where: { id: run.id } });
    chk("S11.3", ap?.ok === true && rr?.status === "APPROVED" && rr?.totalGrossSatang === 1_500_000, "approve ok · gross 1,500,000", `${short(ap, 60)} ${rr?.status} ${rr?.totalGrossSatang}`);
    const wd = (await wdRows(TT, sA)) ?? [];
    const we = (await weRows(sA)) ?? [];
    ck("S8.1", { days: wd.length === 165 && wd.every((x) => x.runId === run.id), kinds: we.length === 27 && we.every((x) => x.runId === run.id) }, "165 + 27 bound", `${wd.filter((x) => x.runId === run.id).length}/${wd.length} · ${we.filter((x) => x.runId === run.id).length}/${we.length}`);
    const sig0 = sha(wd.map((x) => `${x.id}:${x.version}:${isoOfSafe(x.updatedAt)}`).join("|"));
    const b = await build(cA, V.owner, N_AUG1);
    const sig1 = sha(((await wdRows(TT, sA)) ?? []).map((x) => `${x.id}:${x.version}:${isoOfSafe(x.updatedAt)}`).join("|"));
    const p = await prev(cA, V.owner);
    ck("S8.2", { frozen: !b.ok && b.text === T.frozen, same: wd.length > 0 && sig0 === sig1, state: p.value?.state === "FROZEN" }, "frozen · 0 writes · FROZEN", `${shown(b)} ${p.value?.state}`);
  }

  // ── S7 + S9.3 (system B · Sept 2031) ──
  {
    const xq = await ent(sB, E.eQ, "2031-09-02", shB, u1);
    await io(sB, E.eQ, xq, bk("2031-09-02", "07:00"), bk("2031-09-02", "15:00"));
    const xp = await ent(sB, E.eP, "2031-09-10", shB, u1);
    await io(sB, E.eP, xp, bk("2031-09-10", "07:00"), bk("2031-09-10", "15:00"));
    await job(bk("2031-09-03"));
    await P.hrRosterEntry.update({ where: { id: xq }, data: { published: false, publishedAt: null } });
    const PB = { periodKey: "2031-09" };
    const b1s = await build(cB, V.owner, bk("2031-09-10"), PB);
    const r1 = await wdRows(TT, sB);
    const p10 = day(r1, "eP", "2031-09-10");
    const q02 = day(r1, "eQ", "2031-09-02");
    ck("S7.1", { ok: b1s.ok, nf: reviewOf(p10?.review).includes("NOT_FINAL") && p10?.dayStatus === "PENDING", orphan: reviewOf(q02?.review).includes("ORPHAN") }, "NOT_FINAL · ORPHAN", `${shown(b1s)} ${hdr(p10)} | ${hdr(q02)}`);
    await build(cB, V.owner, bk("2031-09-11"), PB);
    const ns = day(await wdRows(TT, sB), "eP", "2031-09-10");
    await job(bk("2031-09-11"));
    await build(cB, V.owner, bk("2031-09-11"), PB);
    const ok10 = day(await wdRows(TT, sB), "eP", "2031-09-10");
    ck("S7.2", { ns: reviewOf(ns?.review).includes("NOT_STORED"), clean: hdr(ok10) === Hd(W, "WORKED", { p: 480, w: 480 }) }, "NOT_STORED → clean", `${hdr(ns)} → ${hdr(ok10)}`);
    await pay.setSalaryProfile(cB, { employeeId: E.eP, baseSalarySatang: 1_200_000, ssoEligible: true });
    const run = await pay.createPayrollRun(cB, { periodKey: "2031-09", payDate: new Date("2031-09-30T00:00:00Z") });
    const [bb, ap] = await Promise.all([build(cB, V.owner, bk("2031-09-12"), PB), pay.approveRun(cB, run.id)]);
    const r3 = (await wdRows(TT, sB)) ?? [];
    const st = (await P.hrPayrollRun.findUnique({ where: { id: run.id } }))?.status;
    ck("S9.3", { ap: ap?.ok === true && st === "APPROVED", build: bb.ok || bb.text === T.frozen, rows: r3.length === 60 && r3.every((x) => x.runId === run.id) }, "approve ok · all bound", `${short(ap, 50)} ${shown(bb)} ${r3.filter((x) => x.runId === run.id).length}/${r3.length}`);
  }

  // ── S8.3–S8.6 + S9.1/S9.2 (system C · Oct 2031, v2 gate) ──
  {
    const xr = await ent(sC, E.eR, "2031-10-06", shC, u1);
    await att(sC, E.eR, "IN", bk("2031-10-06", "07:00"), xr);
    await job(bk("2031-10-08"));
    await job(bk("2031-10-13"));
    await pay.setSalaryProfile(cC, { employeeId: E.eR, baseSalarySatang: 1_000_000, ssoEligible: true });
    const run = await pay.createPayrollRun(cC, { periodKey: "2031-10", payDate: new Date("2031-10-31T00:00:00Z") });
    await P.hrPayrollRun.update({ where: { id: run.id }, data: { engineVersion: 2 } });
    const statusOf = async () => (await P.hrPayrollRun.findUnique({ where: { id: run.id } }))?.status;
    const refused = (a: Any) => a?.ok === false && a?.code === "WORK_ENTRIES" && a?.note === T.approveBlocked;
    const a1 = await pay.approveRun(cC, run.id);
    ck("S8.3", { refused: refused(a1), draft: (await statusOf()) === "DRAFT" }, "WORK_ENTRIES · DRAFT", short(a1, 90));
    const PC = { periodKey: "2031-10" };
    const NOV = bk("2031-11-01");
    const [x1, x2] = await Promise.all([build(cC, V.owner, NOV, PC), build(cC, V.owner, NOV, PC)]);
    const rc = (await wdRows(TT, sC)) ?? [];
    ck("S9.1", { ok: x1.ok && x2.ok, rows: rc.length === 31 && new Set(rc.map((r) => dk(r.date))).size === 31, written: Number(x1.value?.written ?? 0) + Number(x2.value?.written ?? 0) === 31 }, "both ok · 31 rows", `${shown(x1)} ${shown(x2)} ${rc.length}`);
    const r06 = day(rc, "eR", "2031-10-06");
    const a2 = await pay.approveRun(cC, run.id);
    ck("S8.4", { review: reviewOf(r06?.review).includes("MISSING_OUT"), refused: refused(a2), draft: (await statusOf()) === "DRAFT" }, "MISSING_OUT ⇒ refused", `${hdr(r06)} ${short(a2, 60)}`);
    await att(sC, E.eR, "OUT", bk("2031-10-06", "15:00"), xr);
    const dayR = (await P.hrAttendanceDay.findFirst({ where: { tenantId: TT, systemId: sC, employeeId: E.eR, date: dbDate("2031-10-06") }, select: { id: true } }))?.id as string;
    const rcp = await rec(cC, dayR, NOV);
    const a3 = await pay.approveRun(cC, run.id);
    ck("S8.5", { rec: rcp?.ok === true && rcp?.version === 2, refused: refused(a3), draft: (await statusOf()) === "DRAFT" }, "OUTDATED ⇒ refused", short(a3, 80));
    const lk = await underLock(`hr:payroll:run:${sC}:2031-10`, () => build(cC, V.owner, NOV, PC));
    ck("S9.2", { waited: lk.waited, ok: lk.res.ok && lk.res.value?.written === 1, holder: !lk.holderErr }, "waited · then built", `${lk.waited} ${shown(lk.res)} ${lk.holderErr}`);
    const a4 = await pay.approveRun(cC, run.id);
    const rc2 = (await wdRows(TT, sC)) ?? [];
    ck("S8.6", { ok: a4?.ok === true && (await statusOf()) === "APPROVED", bound: rc2.length === 31 && rc2.every((r) => r.runId === run.id), lit: hdr(day(rc2, "eR", "2031-10-06")) === Hd(W, "WORKED", { p: 480, w: 480 }) }, "approved · bound · literal", `${short(a4, 60)} ${hdr(day(rc2, "eR", "2031-10-06"))}`);
  }
}
function isoOfSafe(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v ?? "∅");
}

// ═════════════════════════ run ═════════════════════════
let crashed = "";
try {
  runStatic();
  runPure(R);
  const fz = await fitnessNoEnv();
  chk("X12.1", fz.ok, "exit 0 ×2", fz.note);
  await runDb();
} catch (e) {
  crashed = errText(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  const MINE = ["HrWorkEntry", "HrWorkDay", "HrAttendanceAlert", "HrAttendanceDay"];
  for (const tid of fx.tenants) for (const t of MINE) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid).catch(() => null);
  await cleanupFx(P, fx, SLUG);
  const left = await residueOf(P, fx, SLUG, SLUG_PREFIX);
  for (const tid of fx.tenants)
    for (const t of MINE) {
      const exists = await fx.rawRows(`SELECT to_regclass($1)::text AS r`, `"${t}"`);
      if (!exists?.[0]?.r) continue; // ตารางยังไม่มี (ก่อน migration) = ไม่มีของเหลือ
      const r = await fx.rawRows(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid);
      if (!r || Number(r[0]?.n) !== 0) left.push(`${t}=${r?.[0]?.n ?? "?"}`);
    }
  chk("Z1", left.length === 0, "none", left.join() || "clean");
}
process.exit(finish({ forced: FORCE, crashed, missing: skipReasons }));
