// QC — HR V2 · H3.2 late/early/absent → PENDING HrPayAdjustment(DEDUCTION) pro-rata (opt-in, default OFF, HQ11) · refund of over-deduction ·
//      "OT by day class" deferred to H3.4 (no OT pricing here) · brief ledger/hr-briefs/hr-brief-H3.2.md (DRAFT · Q1–Q14 defaults)
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// 🔴 Every expected number is a LITERAL worked by hand in ledger/wo-notes/hr-H3.2-oracle.md (never computed by the code under test).
// CONTRACT = brief R2–R11 (names, keys, texts); preview lateSatang/absentSatang = live entitlement per rule · pendingSatang/approvedSatang = Σ signed rows of the work period
// Tenants qc-hr-h32-<stamp> · Aug–Oct 2031 · opts.now injected · SKIP while hr/attendance-pay.ts is absent (QC_FORCE=1 runs) · --list
// Base for statics = baseRef("QC_H32_BASE") (merge-base HEAD origin/session/hr) · base-diff parts n/a once attendance-pay.ts is in the base
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h3.2.mts
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  type Any, type Base, type Sev, ROOT, rd, short, errText, textOf, srt, failedKeys, stripComments, dk, dbDate, tagOf, canon,
  PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, baseRef, pathInBase, changedVsBase, diffHunks, makeRegistry, qc4Env, makeFixtures, cleanupFx, residueOf,
  vOf, fitnessNoEnv, holdAdvisory, importsOf, jsonOf, loadOpt, modState, sha, keysDeep, HR_FORBIDDEN_DTO_KEYS, msgParity,
} from "./qc-hr-lib.mjs";

const SUITE = "qc-hr-h3.2";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-h32-";
const H = "src/lib/modules/hr/";
const F = {
  rules: `${H}attendance-pay-rules.ts`, ap: `${H}attendance-pay.ts`, acts: `${H}attendance-pay-actions.ts`, ui: `${H}attendance-pay-ui.tsx`,
  mig: "prisma/migrations/20270105000000_hr_attendance_pay/migration.sql", schema: "prisma/schema/payroll.prisma", scope: "src/lib/core/scope.ts", env: "scripts/hr-qc-env.mts",
  payroll: `${H}payroll.ts`, we: `${H}work-entries.ts`, setPage: "src/app/app/sys/[id]/hr/settings/page.tsx", attPage: "src/app/app/sys/[id]/hr/attendance/page.tsx",
  th: "src/messages/th/common.json", en: "src/messages/en/common.json", inv: "scripts/hr-ui-inventory.json",
};
const FROZEN = [
  PAYROLL_RULES_FILE, `${H}payroll-rules-v2.ts`, `${H}ot.ts`, `${H}ot-rules.ts`, `${H}judge.ts`, `${H}judge-rules.ts`, `${H}work-entries-rules.ts`, `${H}law.ts`,
  `${H}leave.ts`, `${H}leave-rules.ts`, `${H}clock.ts`, `${H}clock-rules.ts`, `${H}correction.ts`, `${H}correction-rules.ts`, `${H}lifecycle.ts`, `${H}privacy.ts`,
  `${H}privacy-shared.ts`, `${H}stock-charge.ts`, `${H}service.ts`, "scripts/seed-hr-qc.mts",
];
const T = {
  no: "ไม่พบข้อมูลรายการหักสาย/ขาดนี้ หรือคุณไม่มีสิทธิ์ดู",
  syncNo: "คุณไม่มีสิทธิ์คำนวณรายการหักสาย/ขาด",
  policyNo: "เฉพาะเจ้าของร้านเท่านั้นที่ตั้งกฎหักสาย/ขาดได้",
  off: "ยังไม่ได้เปิดกฎหักสาย/ขาด — เจ้าของร้านเปิดได้ที่หน้าตั้งค่า HR",
  period: "งวดต้องเป็นรูปแบบ YYYY-MM",
  frozen: "งวดนี้อนุมัติเงินเดือนแล้ว — คำนวณรายการหักใหม่ไม่ได้",
  stale: "ข้อมูลเวลาทำงานของรายการนี้เปลี่ยนแล้ว — กด 'คำนวณรายการหักสาย/ขาด' ใหม่ก่อนอนุมัติ",
  attRow: "รายการนี้มาจากกฎหักสาย/ขาด — ลบหรือย้ายไม่ได้ ให้ปฏิเสธ หรือแก้ข้อมูลเวลาแล้วคำนวณใหม่",
  noEmp: "บัญชีของคุณยังไม่ได้ผูกกับพนักงาน — ติดต่อผู้จัดการ",
  sFree: "นาทีที่ไม่หักต้องอยู่ระหว่าง 0 ถึง 60",
  sStep: "ปัดนาทีได้เฉพาะ 1, 5, 10 หรือ 15 นาที",
  warn: "ระบบหักเฉพาะเวลาที่ไม่ได้ทำงานจริงตามสัดส่วน — ไม่มีค่าปรับ (ม.76 พ.ร.บ.คุ้มครองแรงงาน) · ทุกรายการต้องมีผู้อนุมัติ",
  adjLate: "หักเวลามาสาย/ออกก่อน {n} นาที ({m})",
  adjAbsent: "หักเวลาขาดงาน {n} นาที ({m})",
  refund: "คืนเงินหักสาย/ขาด ({m})",
  // ORACLE-EDIT (controller ruling 12 Nov · closes the brief's accepted gap D1): approveRun refusal while a bound LATE/ABSENT deduction is stale
  // ORACLE-EDIT (fix r1 R2c): order of steps reversed — recompute the run first, then compute deductions, then approve
  runStale: "มีรายการหักสาย/ขาดในรอบนี้ที่ข้อมูลเวลาเปลี่ยนแล้ว — กด 'คำนวณใหม่' ที่รอบจ่ายก่อน แล้วกด 'คำนวณรายการหักสาย/ขาด' จากนั้นจึงอนุมัติ",
  // ORACLE-EDIT (fix r1 R1): approve gate "deductions of the work period must match the time data"
  // ORACLE-EDIT (fix r3 N1): the refusal now also names the pull step ("ดึงชั่วโมงทำงาน")
  runSync: "รายการหักสาย/ขาดของงวดนี้ยังไม่ตรงกับข้อมูลเวลา — กด 'คำนวณใหม่' ที่รอบจ่ายก่อน แล้วกด 'ดึงชั่วโมงทำงาน' และ 'คำนวณรายการหักสาย/ขาด' จากนั้นจึงอนุมัติ",
};
// H1.3 texts (decideAdjustment, unchanged)
const OWN_REQ = "อนุมัติรายการที่ตัวเองยื่นไม่ได้ — ให้เจ้าของหรือผู้มีสิทธิ์อนุมัติแทน";
const OWN_ROW = "อนุมัติรายการของตัวเองไม่ได้ — ให้ผู้อนุมัติคนอื่นหรือเจ้าของร้านตัดสิน";
const DEF = { enabled: false, late: true, earlyOut: true, absent: true, freeMin: 0, stepMin: 1 };
const BASE_KEYS = ["employeeId", "name", "code", "lateMin", "absentMin", "days", "adjustmentIds"];
const MONEY_KEYS = ["lateSatang", "absentSatang", "pendingSatang", "approvedSatang"];
const LINES_KEYS = srt(["ok", "adjustmentId", "employeeId", "workPeriodKey", "rule", "gen", "entitledSatang", "amountSatang", "lines"]);
const MY_KEYS = srt(["adjustmentId", "status", "kind", "periodKey", "workPeriodKey", "rule", "minutes", "amountSatang", "lines"]);
const TESTIDS = ["hr-attpay-policy", "hr-attpay-enabled", "hr-attpay-free", "hr-attpay-step", "hr-attpay-warn", "hr-attpay-save", "hr-attpay-panel", "hr-attpay-sync", "hr-attpay-row-*"];

const SEV: Record<string, Sev> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS = `
S1.1|R7|C|R|[static] attendance-pay*.ts never write HrPayAdjustment · no emitOutbox
S1.2|§2|C|R|[static] no OT pricing tokens in attendance-pay*.ts + payroll.ts H3.2 block (no kind OT)
S1.3|R3|C|R|[static] rules file pure (imports ⊆ node:crypto · no clock/random/db)
S1.4|R7|C|R|[static] payroll.ts writer · approve hook · cancel refusal · marked hunks
S1.5|R1|M|R|[static] work-entries.ts: workEntryStatesInTx in a marked pure-addition hunk (n/a once in base)
S1.6|R9|C|R|[static] migration 20270105000000 additive · model · scope · hr-qc-env
S1.7|R11|M|R|[static] actions · UI testids · inventory · hr.attpay th=en · warn · pages
S1.8|frozen|C|G|[static] payroll-rules sha · frozen files unchanged vs base
S2.1|R2|C|R|[pure] policy default + 6 lenient vectors · ATT_TEXT byte-exact
S2.2|R3|C|R|[pure] ฿15,000/480 late 1·4·5·29·30·31·180 (7 vectors)
S2.3|R3|C|R|[pure] early out 45 · late+early one line · absent 480 · half-day 240 (4)
S2.4|R3|C|R|[pure] ฿14,000 and ฿12,345: late 30 · absent 480 (4)
S2.5|R3|C|R|[pure] N 420 late/absent cap · cap le ≤ N − a (2 + 2)
S2.6|R3|C|R|[pure] freeMin 5 · step 15 · both (3 multi-day vectors)
S2.7|R3|C|R|[pure] per-day floor (1,040 not 1,041) · 1-satang edges · max-int base (5)
S2.8|R3|C|R|[pure] day classes HOLIDAY/DAY_OFF/UNSCHEDULED · info flags · toggles (5)
S2.9|R3|C|R|[pure] refusal codes OFF/PAY_TYPE/NO_BASE/BAD_INPUT/BLOCKED + order (10)
S2.10|R3|M|R|[pure] digest 64-hex deterministic · basis-sensitive · purity
S2.11|R6|C|R|[pure] delta plan (16 vectors)
S3.1|R2|C|R|[db] default OFF: policy = default · sync refused off · nothing written
S3.2|R2|C|R|[db] save policy: owner only · sFree · sStep · stored literal
S3.3|R4|C|R|[db] sync refused: manager/member syncNo · bad period · nothing written
S4.1|fixture|C|G|[db] fixture sanity: H3.1 day minutes · states · H2.9 OT
S4.2|R4|M|R|[db] sync before build ⇒ all wait MISSING · 0 rows
S4.3|R7|C|R|[db] first sync (payroll user): 5 rows literal · notes
S4.4|R9|C|R|[db] header rows: lines literal · entitled · base · N · gen · digest
S4.5|R4|C|R|[db] wait/skip codes (REVIEW · PAY_TYPE · NO_PROFILE)
S4.6|§2|C|R|[db] no double pay with H2.9 OT on a late day
S5.1|R4|C|R|[db] idempotent: sync again + 2 in parallel ⇒ created 0 · same ids · 5 rows
S5.2|R12|C|R|[race] sync waits on hr:payroll:run:<sys>:<P> then completes
S6.1|Q14|C|R|[db] approval: requester refused · employee refused · owner approves eL/eS
S6.2|R8|C|R|[db] leave approved later ⇒ approve refused stale · sync waits OUTDATED
S6.3|R8|M|R|[db] cancelAdjustment of a rule row ⇒ attRow · row kept
S7.1|R6|C|R|[db] rebuild + sync ⇒ ABSENT REJECTED (SUPERSEDED) · approved LATE kept
S7.2|R6|C|R|[db] H2.6 correction ⇒ rebuild + sync ⇒ eM PENDING REJECTED
S7.3|R6|C|R|[db] policy freeMin 5 ⇒ superseded + new PENDING literals
S7.4|R2|C|R|[db] OFF ⇒ PENDING withdrawn (POLICY_OFF) · APPROVED kept · sync refused off
S7.5|R6|C|R|[db] ON again ⇒ gen 3 rows · E = approved ⇒ nothing
S8.1|R5|C|R|[db] Aug DRAFT run ⇒ deduction targets 2031-09
S8.2|R8|C|R|[db] approved + bound to the APPROVED Sept run · sync Sept (frozen) allowed, writes nothing (ORACLE-EDIT fix r1 R3)
S8.3|R6|C|R|[db] correction after binding ⇒ refund in 2031-10 · bound untouched · Σ 0
S8.4|R6|C|R|[db] sync again ⇒ no second refund
S8.5|D1|C|R|[db] ORACLE-EDIT (controller · D1 closed): correction after approval ⇒ createPayrollRun does not bind the stale deduction
S8.6|D1|C|R|[db] ORACLE-EDIT (controller · D1 closed): delete draft + rebuild + sync ⇒ corrected PENDING 1,041 · approved ⇒ binds
S8.7|D1|C|R|[db] ORACLE-EDIT (controller · D1 closed): leave after binding ⇒ approveRun refused runStale · recompute leaves it unbound
S8.8|fix1|C|R|[db] ORACLE-EDIT (fix r1 R2): bound-in-draft 3,125 goes stale ⇒ sync waits RUN_STALE, writes nothing · recompute + sync ⇒ 1,041 · settled Aug+Sep 1,041 · no refund
S8.9|fix1|C|R|[db] ORACLE-EDIT (fix r1 R1): approved 3,125 stale before binding ⇒ approve(Aug) refused runSync ⇒ recompute + sync ⇒ 1,041 ⇒ settled 1,041
S8.10|fix1|C|R|[db] ORACLE-EDIT (fix r1 R3): Aug frozen without sync (legacy) ⇒ sync(Aug) allowed ⇒ refund 2,084 binds in Oct ⇒ settled 1,041
S8.11|fix1|C|R|[db] ORACLE-EDIT (fix r1 R3): raise / policy change after Aug freeze ⇒ row not stale, binds in Sept ⇒ settled 3,125 (×2)
S8.12|fix1|C|R|[pure] ORACLE-EDIT (fix r1 R5): period cap Σ ≤ base salary (31 absent days · 30 absent + late)
S8.13|fix1|C|R|[db] ORACLE-EDIT (fix r1 R6): other-tenant viewer on this shop's ctx ⇒ sync/save/preview/lines refused · nothing written
S8.14|fix1|C|R|[db] ORACLE-EDIT (fix r1 R8): human reject of 3,125 sticks on re-sync · new time data ⇒ new PENDING 1,041
S8.15|fix2|C|R|[db] ORACLE-EDIT (fix r2 F1): Aug frozen with the rule never on · raise to 3,000,000 · rule on in Nov ⇒ sync Aug writes nothing (NO_SNAPSHOT)
S8.16|fix2|C|R|[db] ORACLE-EDIT (fix r2 F2): in-force interval opens at the current period · July (before) approves without sync · OFF ⇒ stale approved Aug row still blocks · sync while OFF clears it
S8.17|fix2|C|R|[db] ORACLE-EDIT (fix r2 F3): run member without work hours passes the gate (a) · base → 0 ⇒ sync supersedes the approved row and the gate clears (b)
S8.18|fix2|C|R|[db] ORACLE-EDIT (fix r2 F4): sync ∥ OFF ×4 ⇒ no PENDING and no live header (behavioural)
S8.19|fix3|C|R|[db] ORACLE-EDIT (fix r3 N1): rule on · late 30 never pulled ⇒ approve(Aug) refused · pull + sync + approve ⇒ settled 3,125 (also with sync before pull)
S8.20|fix3|C|R|[db] ORACLE-EDIT (fix r3 · H2.11 merge): inbox decideAdjustmentAs on an attendance row goes through the H3.2 gate (stale refused · re-synced row approves)
S9.1|R10|C|R|[db] preview viewer matrix (money keys payroll only)
S9.2|R10|C|R|[db] preview literals (eL · eF · eH)
S9.3|R10|C|R|[db] lines reader: payroll literal · others identical bytes
S9.4|R10|C|R|[db] self reader: own row · keys · noEmp · no forbidden keys
X12.1|X12|M|G|[run] fitness + fitness-hr without env ⇒ exit 0
Z1|house|C|G|no residue
`.trim().split("\n").map((l) => {
  const [id, g, sv, b, t] = l.split("|");
  return [`H3.2-${id}`, g, SEV[sv], (b === "R" ? "RED" : "GREEN") as Base, t] as const;
});
const { chk, printList, skipExit, finish } = makeRegistry(SUITE, "H3.2-", CHECKS);
if (ARGV.includes("--list")) {
  printList();
  process.exit(0);
}
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, F.ap))) skipReasons.push(`${F.ap} absent (H3.2 not built)`);
if (skipReasons.length && !FORCE) skipExit(skipReasons);
const ck = (id: string, r: Record<string, unknown>, exp: string, extra = "") => chk(id, Object.values(r).every(Boolean), exp, `${failedKeys(r)}${extra ? ` ${extra}` : ""}`);
const BASE = baseRef("QC_H32_BASE") || "ded3c7948";
const IN_BASE = pathInBase(F.ap, BASE);
const block = (src: string, start: RegExp, len = 4000) => {
  const i = src.search(start);
  return i < 0 ? "" : src.slice(i, i + len);
};
/** hunks: every hunk carries an HR marker · ≥1 carries "HR H3.2" (other WOs' marked hunks tolerated) */
const markedOk = (file: string, pureAdd = false) => {
  const hs = diffHunks(BASE, file);
  if (!hs) return false;
  const mine = hs.filter((h) => h.added.some((l) => /HR H3\.2/.test(l)));
  return mine.length > 0 && hs.every((h) => h.added.concat(h.removed).some((l) => /HR H\d|H\d\.\d/.test(l))) && (!pureAdd || mine.every((h) => h.removed.length === 0));
};

// ═════════════════════════ statics ═════════════════════════
function runStatic(): void {
  const apFiles = [F.rules, F.ap, F.acts, F.ui].map((f) => [f, stripComments(rd(f))] as const);
  const all = apFiles.map(([, s]) => s).join("\n");
  const have = apFiles.every(([, s]) => s.length > 0);
  {
    const w = /\bhrPayAdjustment\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/.test(all) || /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"HrPayAdjustment"/i.test(all);
    ck("S1.1", { files: have, noWrite: !w, noOutbox: !/emitOutbox/.test(all) }, "no HrPayAdjustment write · no outbox", have ? "" : apFiles.filter(([, s]) => !s).map(([f]) => `∅${f}`).join(" "));
  }
  {
    const pay = rd(F.payroll);
    const i = pay.search(/HR H3\.2 ▸/);
    // ORACLE-EDIT (H3.4 builder, phase B): the end marker `// ◂ HR H3.2` is a comment, so it was stripped before the search below and the
    //   "block" ran to EOF (into the later HR H3.4 run block, which legitimately prices holidayWorkMin) — cut at the raw end marker first
    const j = i < 0 ? -1 : pay.indexOf("◂ HR H3.2", pay.indexOf("HR H3.2 ▸ รายการหักสาย/ออกก่อน/ขาดงาน") > 0 ? pay.indexOf("HR H3.2 ▸ รายการหักสาย/ออกก่อน/ขาดงาน") : i);
    const blk = i < 0 ? "" : stripComments(pay.slice(i, j > i ? j : undefined));
    const bad = /otWorkdayMin|otHolidayMin|holidayWorkMin|holidayPaidMin|OT_REQUEST|kind:\s*["']OT["']/;
    ck("S1.2", { files: have, ap: have && !bad.test(all), block: blk.length > 0 && !/holidayWorkMin|holidayPaidMin|kind:\s*["']OT["']/.test(blk.slice(0, blk.search(/◂ HR H3\.2/) > 0 ? blk.search(/◂ HR H3\.2/) : blk.length)) }, "no OT tokens", "");
  }
  {
    const src = rd(F.rules);
    const imp = importsOf(src).filter((x) => !x.type).map((x) => x.spec);
    const body = stripComments(src);
    ck("S1.3", { file: src.length > 0, imports: imp.every((s) => s === "node:crypto"), clock: !/Date\.now|new Date\(|Math\.random|prisma|tenantDb/.test(body) }, "pure", `imports=${imp.join(",") || "-"}`);
  }
  {
    const pay = rd(F.payroll);
    const dec = block(pay, /export async function decideAdjustment\(/, 6000);
    const can = block(pay, /export async function cancelAdjustment\(/, 3000);
    const r = {
      writer: /export async function writeAttendanceDeductionInTx\(/.test(pay), hook: /attendanceAdjustmentApproveCheckInTx\(/.test(dec), cancel: /LATE_RULE|ABSENT_RULE|attRow|ATT_TEXT/.test(can),
      marked: IN_BASE || markedOk(F.payroll),
    };
    ck("S1.4", r, "writer · hook · refusal · marked");
  }
  {
    const we = rd(F.we);
    ck("S1.5", { fn: /export async function workEntryStatesInTx\(/.test(we), marked: IN_BASE || markedOk(F.we, true) }, "marked export");
  }
  {
    const m = rd(F.mig);
    const r = {
      file: m.length > 0, table: /CREATE TABLE "HrAttendanceDeduction"/.test(m), uAdj: /CREATE UNIQUE INDEX[^;]*"HrAttendanceDeduction"\s*\(\s*"adjustmentId"\s*\)/.test(m),
      uGen: /CREATE UNIQUE INDEX[^;]*"HrAttendanceDeduction"\s*\([^)]*"workPeriodKey"[^)]*"gen"/.test(m), checks: (m.match(/CHECK\s*\(/g) ?? []).length >= 6,
      additive: m.length > 0 && !/DROP\s|ALTER TYPE|ALTER TABLE "HrPayAdjustment"/i.test(m), model: /model HrAttendanceDeduction\s*\{/.test(rd(F.schema)),
      scope: /HrAttendanceDeduction/.test(rd(F.scope)), env: /HrAttendanceDeduction/.test(rd(F.env)),
    };
    ck("S1.6", r, "additive migration + model + scope + env");
  }
  {
    const acts = rd(F.acts);
    const ui = rd(F.ui);
    const inv = ((jsonOf(F.inv)?.rows ?? []) as Any[]).filter((x) => TESTIDS.some((t) => String(x.testid) === t || (t.endsWith("*") && String(x.testid).startsWith(t.slice(0, -1)))));
    const th = jsonOf(F.th)?.hr?.attpay ?? {};
    const en = jsonOf(F.en)?.hr?.attpay ?? {};
    const mp = msgParity(th, en, []);
    const r = {
      useServer: /^\s*["']use server["']/.test(acts), noNow: acts.length > 0 && !/\bnow\s*:/.test(stripComments(acts)),
      testids: TESTIDS.every((t) => ui.includes(t.replace("*", ""))), inv: TESTIDS.every((t) => inv.some((x) => String(x.testid) === t)) && inv.every((x) => x.wo === "H3.2" && x.oracle === SUITE),
      msgs: Object.values(mp).every(Boolean), warn: (rd(F.rules) + ui).includes(T.warn),
      pages: /attendance-pay-ui/.test(rd(F.setPage)) && /attendance-pay-ui/.test(rd(F.attPage)),
    };
    ck("S1.7", r, "UI wired");
  }
  {
    const shaOk = sha(rd(PAYROLL_RULES_FILE)) === PAYROLL_RULES_SHA;
    const ch = changedVsBase(BASE, FROZEN);
    const bad = ch === "unchanged" ? [] : ch.startsWith("changed: ") ? ch.slice(9).split(",").filter((f) => {
      const hs = diffHunks(BASE, f);
      // ORACLE-EDIT (builder HR-SET-1 · 13 Nov) S1.8: a later fix ticket's hunks ("HR-SET-<n>") count as marked like "HR H<n>" ones · unmarked still fails ◂
      // ORACLE-EDIT (HR-MONEY-2 builder · pre-authorised) S1.8: "HR MONEY-2" hunks count as marked like "HR-SET-<n>" ones · unmarked still fails ◂
      return !hs || hs.some((h) => h.added.concat(h.removed).some((l) => /HR H3\.2/.test(l)) || !h.added.concat(h.removed).some((l) => /HR H\d|HR-SET-\d|HR MONEY-2/.test(l)));
    }) : [ch];
    ck("S1.8", { sha: shaOk, frozen: bad.length === 0 }, "unchanged", bad.join(","));
  }
}

// ═════════════════════════ pure ═════════════════════════
const POL = { enabled: true, late: true, earlyOut: true, absent: true, freeMin: 0, stepMin: 1 };
const dy = (d: string, o: Record<string, unknown> = {}) => ({ workDayId: `w${d}`, version: 1, day: `2031-08-${d}`, dayClass: "WORKDAY", lateMin: 0, earlyOutMin: 0, absentMin: 0, review: [] as string[], ...o });
const inp = (base: number, N: number, days: Any[], pol: Any = POL, payType = "MONTHLY") => ({ policy: pol, payType, baseSalarySatang: base, normalDayMin: N, days });
const fmt = (o: Any): string => {
  if (!o || typeof o !== "object") return `?${short(o, 40)}`;
  if (o.ok === false) return `!${o.code}`;
  const t = (x: Any) => `${x?.days}/${x?.minutes}/${x?.amountSatang}`;
  return `${(o.lines ?? []).map((l: Any) => `${String(l.day).slice(8)}:${String(l.rule)[0]}:${l.minutes}:${l.amountSatang}`).join(",")}|L${t(o.late)}|A${t(o.absent)}`;
};
const L1 = (m: number, a: number) => `04:L:${m}:${a}|L1/${m}/${a}|A0/0/0`;
const A1 = (m: number, a: number) => `04:A:${m}:${a}|L0/0/0|A1/${m}/${a}`;
const NONE = "|L0/0/0|A0/0/0";
type Vec = [string, Any, string];
const V: Record<string, Vec[]> = {
  "S2.2": [
    ["late1", inp(1_500_000, 480, [dy("04", { lateMin: 1 })]), L1(1, 104)], ["late4", inp(1_500_000, 480, [dy("04", { lateMin: 4 })]), L1(4, 416)],
    ["late5", inp(1_500_000, 480, [dy("04", { lateMin: 5 })]), L1(5, 520)], ["late29", inp(1_500_000, 480, [dy("04", { lateMin: 29 })]), L1(29, 3020)],
    ["late30", inp(1_500_000, 480, [dy("04", { lateMin: 30 })]), L1(30, 3125)], ["late31", inp(1_500_000, 480, [dy("04", { lateMin: 31 })]), L1(31, 3229)],
    ["late180", inp(1_500_000, 480, [dy("04", { lateMin: 180 })]), L1(180, 18750)],
  ],
  "S2.3": [
    ["early45", inp(1_500_000, 480, [dy("04", { earlyOutMin: 45 })]), L1(45, 4687)], ["late30+early45", inp(1_500_000, 480, [dy("04", { lateMin: 30, earlyOutMin: 45 })]), L1(75, 7812)],
    ["absent480", inp(1_500_000, 480, [dy("04", { absentMin: 480 })]), A1(480, 50000)], ["absent240", inp(1_500_000, 480, [dy("04", { absentMin: 240 })]), A1(240, 25000)],
  ],
  "S2.4": [
    ["14k late30", inp(1_400_000, 480, [dy("04", { lateMin: 30 })]), L1(30, 2916)], ["14k absent480", inp(1_400_000, 480, [dy("04", { absentMin: 480 })]), A1(480, 46666)],
    ["12345 late30", inp(1_234_500, 480, [dy("04", { lateMin: 30 })]), L1(30, 2571)], ["12345 absent480", inp(1_234_500, 480, [dy("04", { absentMin: 480 })]), A1(480, 41150)],
  ],
  "S2.5": [
    ["N420 late30", inp(1_500_000, 420, [dy("04", { lateMin: 30 })]), L1(30, 3571)], ["N420 absent480→420", inp(1_500_000, 420, [dy("04", { absentMin: 480 })]), A1(420, 50000)],
    ["absent300+late200", inp(1_500_000, 480, [dy("04", { absentMin: 300, lateMin: 200 })]), "04:A:300:31250,04:L:180:18750|L1/180/18750|A1/300/31250"],
    ["absent480+late30", inp(1_500_000, 480, [dy("04", { absentMin: 480, lateMin: 30 })]), A1(480, 50000)],
  ],
  "S2.6": [
    ["free5", inp(1_500_000, 480, [dy("04", { lateMin: 4 }), dy("05", { lateMin: 5 }), dy("06", { lateMin: 29 }), dy("07", { lateMin: 31 })], { ...POL, freeMin: 5 }), "06:L:24:2500,07:L:26:2708|L2/50/5208|A0/0/0"],
    ["step15", inp(1_500_000, 480, [dy("04", { lateMin: 14 }), dy("05", { lateMin: 29 }), dy("06", { lateMin: 31 })], { ...POL, stepMin: 15 }), "05:L:15:1562,06:L:30:3125|L2/45/4687|A0/0/0"],
    ["free5+step15", inp(1_500_000, 480, [dy("04", { lateMin: 31, earlyOutMin: 20 })], { ...POL, freeMin: 5, stepMin: 15 }), L1(30, 3125)],
  ],
  "S2.7": [
    ["per-day floor", inp(1_500_000, 480, [dy("04", { lateMin: 1 }), dy("05", { lateMin: 4 }), dy("06", { lateMin: 5 })]), "04:L:1:104,05:L:4:416,06:L:5:520|L3/10/1040|A0/0/0"],
    ["base 14400 late1", inp(14_400, 480, [dy("04", { lateMin: 1 })]), L1(1, 1)], ["base 14399 late1", inp(14_399, 480, [dy("04", { lateMin: 1 })]), L1(1, 0)],
    ["maxint absent480", inp(2_147_483_647, 480, [dy("04", { absentMin: 480 })]), A1(480, 71582788)], ["maxint late1", inp(2_147_483_647, 480, [dy("04", { lateMin: 1 })]), L1(1, 149130)],
  ],
  "S2.8": [
    ["classes", inp(1_500_000, 480, [dy("04", { dayClass: "HOLIDAY", lateMin: 60 }), dy("05", { dayClass: "DAY_OFF", lateMin: 30 }), dy("06", { dayClass: "UNSCHEDULED", absentMin: 480 })]), NONE],
    ["info flags", inp(1_500_000, 480, [dy("04", { lateMin: 30, review: ["HOURLY_LEAVE_UNUSED", "OT_VIA_ADJUSTMENT", "WORKED_ON_LEAVE"] })]), L1(30, 3125)],
    ["late off", inp(1_500_000, 480, [dy("04", { lateMin: 30, earlyOutMin: 45 })], { ...POL, late: false }), L1(45, 4687)],
    ["early off", inp(1_500_000, 480, [dy("04", { lateMin: 30, earlyOutMin: 45 })], { ...POL, earlyOut: false }), L1(30, 3125)],
    ["absent off", inp(1_500_000, 480, [dy("04", { absentMin: 480 })], { ...POL, absent: false }), NONE],
  ],
  "S2.9": [
    ["OFF", inp(1_500_000, 480, [dy("04", { lateMin: 30 })], { ...POL, enabled: false }), "!OFF"], ["DAILY", inp(1_500_000, 480, [dy("04", { lateMin: 30 })], POL, "DAILY"), "!PAY_TYPE"],
    ["HOURLY", inp(1_500_000, 480, [dy("04", { lateMin: 30 })], POL, "HOURLY"), "!PAY_TYPE"], ["base0", inp(0, 480, [dy("04", { lateMin: 30 })]), "!NO_BASE"],
    ["N59", inp(1_500_000, 59, [dy("04", { lateMin: 30 })]), "!BAD_INPUT"], ["N721", inp(1_500_000, 721, [dy("04", { lateMin: 30 })]), "!BAD_INPUT"],
    ["late-1", inp(1_500_000, 480, [dy("04", { lateMin: -1 })]), "!BAD_INPUT"], ["late1.5", inp(1_500_000, 480, [dy("04", { lateMin: 1.5 })]), "!BAD_INPUT"],
    ["STALE", inp(1_500_000, 480, [dy("04", { lateMin: 30 }), dy("05", { review: ["STALE"] })]), "!BLOCKED"], ["OFF before DAILY", inp(1_500_000, 480, [], { ...POL, enabled: false }, "DAILY"), "!OFF"],
  ],
};
const pr = (id: string, kind: string, status: string, amountSatang: number, bound = false, digest = "d1") => ({ id, kind, status, amountSatang, bound, digest });
const PLAN: [string, number, Any[], string][] = [
  ["P1 new", 9895, [], "[]|DEDUCTION:9895:PENDING"], ["P2 keep", 9895, [pr("p1", "DEDUCTION", "PENDING", 9895)], "[]|-"],
  ["P3 digest", 9895, [pr("p1", "DEDUCTION", "PENDING", 9895, false, "d0")], "[p1]|DEDUCTION:9895:PENDING"], ["P4 drop", 7812, [pr("a1", "DEDUCTION", "APPROVED", 9895)], "[a1]|DEDUCTION:7812:PENDING"],
  ["P5 top-up", 12000, [pr("a1", "DEDUCTION", "APPROVED", 9895)], "[]|DEDUCTION:2105:PENDING"], ["P6 refund", 0, [pr("b1", "DEDUCTION", "APPROVED", 3013, true)], "[]|ALLOWANCE:3013:APPROVED"],
  ["P7 part refund", 1000, [pr("b1", "DEDUCTION", "APPROVED", 3013, true)], "[]|ALLOWANCE:2013:APPROVED"], ["P8 bound top-up", 5000, [pr("b1", "DEDUCTION", "APPROVED", 3013, true)], "[]|DEDUCTION:1987:PENDING"],
  ["P9 zero", 0, [pr("p1", "DEDUCTION", "PENDING", 50000)], "[p1]|-"], ["P10 bound=E", 3013, [pr("b1", "DEDUCTION", "APPROVED", 3013, true), pr("p1", "DEDUCTION", "PENDING", 500)], "[p1]|-"],
  ["P11 refunded", 0, [pr("b1", "DEDUCTION", "APPROVED", 3013, true), pr("b2", "ALLOWANCE", "APPROVED", 3013, true)], "[]|-"],
  ["P12 both", 8332, [pr("a1", "DEDUCTION", "APPROVED", 9895), pr("p1", "DEDUCTION", "PENDING", 100)], "[a1,p1]|DEDUCTION:8332:PENDING"],
  ["P13 E=A", 2604, [pr("a1", "DEDUCTION", "APPROVED", 2604)], "[]|-"], ["P14 rejected ignored", 100, [pr("x", "DEDUCTION", "REJECTED", 100)], "[]|DEDUCTION:100:PENDING"],
  ["P15 two pend", 100, [pr("p1", "DEDUCTION", "PENDING", 100), pr("p2", "DEDUCTION", "PENDING", 100)], "[p1,p2]|DEDUCTION:100:PENDING"],
  ["P16 refund counted", 500, [pr("b1", "DEDUCTION", "APPROVED", 3013, true), pr("a1", "ALLOWANCE", "APPROVED", 2513)], "[]|-"],
];
function runPure(R: Any): void {
  const ok = R && !R.__err && typeof R.attendanceDeductionOf === "function";
  const st = modState(R, F.rules);
  const call = (fn: string, a: unknown) => {
    try {
      return R[fn](a);
    } catch (e) {
      return { ok: false, code: `THROW ${errText(e)}` };
    }
  };
  {
    const P0 = ok && typeof R.attendancePayPolicyOf === "function" ? R.attendancePayPolicyOf : null;
    const pv: [unknown, Any][] = [
      [undefined, DEF], [{ enabled: true }, { ...DEF, enabled: true }], [{ enabled: "yes" }, DEF], [{ freeMin: 61, stepMin: 7 }, DEF],
      [{ freeMin: 15, stepMin: 5, late: false }, { ...DEF, freeMin: 15, stepMin: 5, late: false }], [{ freeMin: 2.5, enabled: true, absent: false }, { ...DEF, enabled: true, absent: false }],
    ];
    const bad = P0 ? pv.filter(([i, w]) => canon(P0(i)) !== canon(w)).map(([i]) => short(i, 40)) : ["∅"];
    const tx = ok ? Object.entries(T).filter(([k, v]) => R.ATT_TEXT?.[k] !== v).map(([k]) => k) : ["∅"];
    ck("S2.1", { policy: bad.length === 0, def: ok && canon(R.ATT_PAY_POLICY_DEFAULT) === canon(DEF), text: tx.length === 0 }, "policy · texts", ok ? `${bad.join(" ")} ${tx.join(",")}` : st);
  }
  for (const [id, vs] of Object.entries(V)) {
    const bad = vs.map(([n, i, w]) => [n, ok ? fmt(call("attendanceDeductionOf", i)) : "∅", w]).filter(([, g, w]) => g !== w);
    chk(id, ok && bad.length === 0, `${vs.length} literals`, ok ? bad.map(([n, g, w]) => `${n}: ${g} ≠ ${w}`).join(" · ") || "ok" : st);
  }
  {
    const i0 = inp(1_500_000, 480, [dy("04", { lateMin: 30 }), dy("06", { absentMin: 480 })]);
    const frozen = JSON.parse(JSON.stringify(i0));
    const deep = (o: Any): Any => (Object.freeze(o), Object.values(o).forEach((v) => v && typeof v === "object" && deep(v)), o);
    let r: Any = { ok: false };
    let dg: Any[] = [];
    if (ok) {
      const [dn, rnd] = [Date.now, Math.random];
      Date.now = () => {
        throw new Error("clock");
      };
      Math.random = () => {
        throw new Error("random");
      };
      try {
        r = call("attendanceDeductionOf", deep(i0));
        const basis = (b: number) => ({ base: b, N: 480, policy: POL });
        dg = typeof R.attendanceDigest === "function" ? [R.attendanceDigest(r, basis(1_500_000)), R.attendanceDigest(r, basis(1_500_000)), R.attendanceDigest(r, basis(1_500_001))] : [];
      } catch (e) {
        dg = [errText(e)];
      } finally {
        Date.now = dn;
        Math.random = rnd;
      }
    }
    ck("S2.10", { pure: r.ok === true && canon(i0) === canon(frozen), hex: /^[0-9a-f]{64}$/.test(String(dg[0])), same: dg[0] === dg[1], basis: dg.length === 3 && dg[1] !== dg[2] }, "pure · digest", ok ? short(dg, 80) : st);
  }
  {
    const fp = (o: Any) => (o && Array.isArray(o.reject) ? `[${[...o.reject].sort().join(",")}]|${o.create ? `${o.create.kind}:${o.create.amountSatang}:${o.create.status}` : "-"}` : `?${short(o, 40)}`);
    const has = ok && typeof R.attendanceDeltaPlan === "function";
    const bad = PLAN.map(([n, E, rows, w]) => [n, has ? fp(call("attendanceDeltaPlan", { entitledSatang: E, digest: "d1", rows })) : "∅", w]).filter(([, g, w]) => g !== w);
    chk("S2.11", has && bad.length === 0, `${PLAN.length} plans`, has ? bad.map(([n, g, w]) => `${n}: ${g} ≠ ${w}`).join(" · ") || "ok" : st);
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
const { P, coreHash } = await qc4Env(SUITE);
if (FORCE && skipReasons.length) console.log(`⚠️ QC_FORCE=1 — running although: ${skipReasons.join(" · ")}`);
const R = await loadOpt(F.rules, "@/lib/modules/hr/attendance-pay-rules");
const AP = await loadOpt(F.ap, "@/lib/modules/hr/attendance-pay");
console.log(`[${SUITE}] rules=${modState(R, F.rules)} · attendance-pay=${modState(AP, F.ap)} · base=${BASE.slice(0, 9)}${IN_BASE ? " (H3.2 in base)" : ""}`);
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const JG = (await import("@/lib/modules/hr/judge")) as Any;
const WE = (await import("@/lib/modules/hr/work-entries")) as Any;
const pay = (await import("@/lib/modules/hr/payroll")) as Any;
const OT = (await import("@/lib/modules/hr/ot")) as Any;
const CM = (await import("@/lib/modules/hr/correction")) as Any;
const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${SLUG_PREFIX}${Date.now()}${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
const A_ = (fn: string, ...a: unknown[]) => callMod(AP, F.ap, fn, a);
const bk = (day: string, hm = "12:00") => new Date(`${day}T${hm}:00+07:00`);
const FIX_TS = new Date("2031-07-01T00:00:00Z");
const PER = "2031-08";
const NB = bk("2031-08-12");

async function runDb(): Promise<void> {
  const TT = await fx.newTenant("", "QC HR H3.2 หักสายขาด");
  const T2 = await fx.newTenant("-other", "QC HR H3.2 ร้านอื่น");
  const u1 = await fx.newUnit(TT, `สาขาเหนือ ${tag}`, "u1");
  const u2 = await fx.newUnit(TT, `สาขาใต้ ${tag}`, "u2");
  const sys = async (n: string, t = TT) => (await sysSvc.createSystem(t, "HR", `${n} ${tag}`)).id as string;
  const [sA, sB, sC, sO] = [await sys("ทีม A"), await sys("ทีม B"), await sys("ทีม C"), await sys("ทีมอื่น", T2)];
  const [cA, cB, cC, cO] = [sA, sB, sC].map((s) => ({ tenantId: TT, systemId: s })).concat([{ tenantId: T2, systemId: sO }]);
  // ORACLE-EDIT (controller ruling 12 Nov · D1 closed): system D for S8.5–S8.7 (stale approved deduction never bound into a run)
  const sD = await sys("ทีม D");
  const cD = { tenantId: TT, systemId: sD };
  const mk = (t: string, r: "OWNER" | "MANAGER" | "STAFF", ua: string[], p: Record<string, boolean>, tid = TT) => fx.mkUser(tid, t, `QC32 ${t} ${tag}`, r, ua, p);
  const U = {
    owner: await mk("owner", "OWNER", [], {}), payroll: await mk("payroll", "STAFF", ["*"], { "hr.payroll.read": true, "hr.payadjust.request": true, "hr.payadjust.approve": true }),
    mgrU1: await mk("mgru1", "MANAGER", [u1], {}), member: await mk("member", "STAFF", [], {}), self: await mk("self", "STAFF", [], { "hr.payadjust.approve": true }), other: await mk("other", "OWNER", [], {}, T2),
  };
  const Vw = Object.fromEntries(Object.entries(U).map(([k, w]) => [k, vOf(w)])) as Record<keyof typeof U, Any>;
  const who: Record<string, string> = Object.fromEntries(Object.entries(U).map(([k, w]) => [w.id, k]));
  const me = (s: string, n: string, o: Record<string, unknown> = {}, tid = TT) => fx.mkEmp(tid, s, `${n} ${tag}`, { startDate: "2030-01-01", ...o } as Any);
  const E = {
    eL: await me(sA, "แอล", { unitId: u1 }), eM: await me(sA, "เอ็ม", { unitId: u2 }), eS: await me(sA, "เอส", { unitId: u1, linkedUserId: U.self.id }), eF: await me(sA, "เอฟ", { unitId: u1 }),
    eH: await me(sA, "เอช", { unitId: u2 }), eW: await me(sA, "ดับบลิว", { unitId: u1 }), eD: await me(sB, "ดี", { unitId: u1 }), eN: await me(sB, "เอ็น", { unitId: u1 }),
    eR: await me(sC, "อาร์", { unitId: u1 }), eO: await me(sO, "โอ", {}, T2),
  };
  const nameOf: Record<string, string> = Object.fromEntries(Object.entries(E).map(([k, v]) => [v, k]));
  const eQ = await me(sD, "คิว", { unitId: u1 }); // ORACLE-EDIT (D1 closed) ◂
  nameOf[eQ] = "eQ"; // ORACLE-EDIT (D1 closed) ◂
  const prof = (c: Any, employeeId: string, base: number, o: Record<string, unknown> = {}) => pay.setSalaryProfile(c, { employeeId, baseSalarySatang: base, ssoEligible: true, ...o });
  for (const [k, b] of [["eL", 1_500_000], ["eM", 1_400_000], ["eS", 1_234_500], ["eF", 1_000_000], ["eH", 2_000_000], ["eW", 1_500_000]] as const) await prof(cA, E[k], b);
  await prof(cB, E.eD, 0, { payType: "DAILY", dailyRateSatang: 50_000 });
  await prof(cC, E.eR, 1_400_000);
  await prof(cD, eQ, 1_500_000); // ORACLE-EDIT (D1 closed) ◂
  const shiftOf = async (s: string) => ({ id: (await P.hrShift.create({ data: { tenantId: TT, systemId: s, name: `เช้า ${tag}`, startMin: 540, endMin: 1020, crossesMidnight: false, graceMin: 5 } })).id as string });
  const sh = { [sA]: await shiftOf(sA), [sB]: await shiftOf(sB), [sC]: await shiftOf(sC) };
  sh[sD] = await shiftOf(sD); // ORACLE-EDIT (D1 closed) ◂
  const ent = async (s: string, emp: string, day: string, unitId: string) =>
    (await P.hrRosterEntry.create({ data: { tenantId: TT, systemId: s, employeeId: emp, date: dbDate(day), shiftId: sh[s]!.id, unitId, startMin: 540, endMin: 1020, breakMin: 0, crossesMidnight: false, published: true, publishedAt: FIX_TS, source: "MANUAL" } })).id as string;
  const att = async (s: string, emp: string, kind: string, at: Date, re: string | null) => (await P.hrAttendance.create({ data: { tenantId: TT, systemId: s, employeeId: emp, kind, at, rosterEntryId: re, source: "KIOSK" } })).id as string;
  const work = async (s: string, emp: string, d: string, unit: string, inHm: string | null, outHm: string | null) => {
    const re = await ent(s, emp, `2031-08-${d}`, unit);
    const i = inHm ? await att(s, emp, "IN", bk(`2031-08-${d}`, inHm), re) : null;
    const o = outHm ? await att(s, emp, "OUT", bk(`2031-08-${d}`, outHm), re) : null;
    return { re, i, o };
  };
  const pol = async (s: string, category: string, name: string) => (await P.hrLeavePolicy.create({ data: { tenantId: TT, systemId: s, category, name: `${name} ${tag}`, paid: true, allowHours: true } })).id as string;
  const POL_SICK = await pol(sA, "SICK", "ลาป่วย");
  const POL_VAC = await pol(sA, "VACATION", "พักร้อน");
  const leave = async (s: string, emp: string, type: string, day: string, policyId: string, o: Record<string, unknown>) =>
    (await P.hrLeave.create({ data: { tenantId: TT, systemId: s, employeeId: emp, type, fromDate: dbDate(day), toDate: dbDate(day), status: "APPROVED", policyId, reason: `เหตุผลลับ ${tag}`, ...o } })).id as string;

  // ── fixture · week Mon 4 – Fri 8 Aug 2031 · shift 09:00–17:00 (480) · grace 5 ──
  await work(sA, E.eL, "04", u1, "09:30", "17:00");
  await work(sA, E.eL, "05", u1, "09:00", "16:15");
  await work(sA, E.eL, "06", u1, null, null);
  await work(sA, E.eL, "07", u1, "09:20", "19:00");
  await work(sA, E.eL, "08", u1, "09:03", "17:00");
  const mIn = await work(sA, E.eM, "04", u2, "09:31", "17:00");
  await work(sA, E.eS, "05", u1, "09:30", "17:00");
  await work(sA, E.eF, "04", u1, "09:00", null);
  await work(sA, E.eH, "08", u2, "10:00", "17:00");
  await P.hrHoliday.create({ data: { tenantId: TT, systemId: sA, unitId: u2, date: dbDate("2031-08-08"), name: `วันหยุด ${tag}`, kind: "PUBLIC" } });
  await work(sA, E.eW, "04", u1, "10:30", "17:00");
  await leave(sA, E.eW, "VACATION", "2031-08-04", POL_VAC, { hours: 1, days: 0.1 });
  await work(sB, E.eD, "04", u1, "09:30", "17:00");
  await work(sB, E.eN, "04", u1, "09:30", "17:00");
  const rIn = await work(sC, E.eR, "04", u1, "09:31", "17:00");
  const qIn = await work(sD, eQ, "04", u1, "09:30", "17:00"); // ORACLE-EDIT (D1 closed) ◂ late 30
  const POL_VAC_D = await pol(sD, "VACATION", "พักร้อน D"); // ORACLE-EDIT (D1 closed) ◂
  // ORACLE-EDIT (fix r1) ▸ one HR system per money scenario (S8.8–S8.11 · S8.14): employee ฿15,000 · N 480 · Mon 4 Aug IN 09:30 ⇒ late 30 ⇒ 3,125 ◂
  const mkScen = async (n: string) => {
    const s = await sys(`ทีม ${n}`);
    const c = { tenantId: TT, systemId: s };
    const emp = await me(s, `พนักงาน ${n}`, { unitId: u1 });
    nameOf[emp] = `e${n}`;
    await prof(c, emp, 1_500_000);
    sh[s] = await shiftOf(s);
    const w = await work(s, emp, "04", u1, "09:30", "17:00");
    return { s, c, emp, inId: w.i as string };
  };
  const SC = { G: await mkScen("G"), F: await mkScen("F"), H: await mkScen("H"), I: await mkScen("I"), J: await mkScen("J"), K: await mkScen("K") };
  // ORACLE-EDIT (fix r2) ▸ scenarios S8.15–S8.18 (rule NOT switched on in the S8.8 loop) · P1 has a 2nd employee with a salary but no roster/time ◂
  const SC3 = { R: await mkScen("R"), S: await mkScen("S"), T: await mkScen("T") }; // ORACLE-EDIT (fix r3) ◂ S8.19
  const SC2 = { N: await mkScen("N"), O: await mkScen("O"), P1: await mkScen("P1"), P2: await mkScen("P2"), Q0: await mkScen("Q0"), Q1: await mkScen("Q1"), Q2: await mkScen("Q2"), Q3: await mkScen("Q3") };
  const eP1b = await me(SC2.P1.s, "พนักงาน P1b", { unitId: u1 });
  nameOf[eP1b] = "eP1b";
  await prof(SC2.P1.c, eP1b, 1_500_000);
  const ask = await OT.requestOt(cA, Vw.owner, { employeeId: E.eL, date: "2031-08-07", start: "17:00", end: "19:00", reason: "QC" }, { now: bk("2031-08-07", "10:00") }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
  const dec = ask?.ok ? await OT.decideOtRequest(cA, Vw.owner, ask.id, "APPROVED", { now: bk("2031-08-07", "10:05") }).catch((e: unknown) => ({ ok: false, reason: errText(e) })) : ask;
  const job = (now: Date) => JG.runAttendanceJobs({ now, tenantId: TT });
  for (const d of ["2031-08-06", "2031-08-09", "2031-08-12"]) await job(bk(d));
  await OT.settleOtRequests({ tenantId: TT, systemId: sA, now: NB }).catch(() => null);

  const build = (c: Any, per = PER) => WE.buildWorkEntrySnapshot(c, Vw.owner, { periodKey: per }, { now: NB }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
  // ORACLE-EDIT (fix r1): later months are pulled "after" they end (no future-day flags)
  const buildAt = (c: Any, per: string) => WE.buildWorkEntrySnapshot(c, Vw.owner, { periodKey: per }, { now: bk("2031-12-15") }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
  const sync = (c: Any, v: Any, per = PER) => A_("syncAttendanceDeductions", c, v, { periodKey: per }, { now: NB });
  const savePol = (c: Any, v: Any, raw: Any) => A_("saveAttendancePayPolicy", c, v, raw);
  const rows = async (s = sA) => (await P.hrPayAdjustment.findMany({ where: { tenantId: TT, systemId: s, sourceType: { in: ["LATE_RULE", "ABSENT_RULE"] } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })) as Any[];
  const hdrs = async (s = sA) => ((await fx.rawRows(`SELECT * FROM "HrAttendanceDeduction" WHERE "tenantId" = $1 AND "systemId" = $2 ORDER BY "createdAt", id`, TT, s)) ?? []) as Any[];
  const gen = (r: Any) => String(r.sourceRef ?? "").match(new RegExp(`^att:2031-08:${r.employeeId}:(\\d+)$`))?.[1] ?? "BADREF";
  const rs = (r: Any) => `${nameOf[r.employeeId]}:${r.sourceType === "LATE_RULE" ? "L" : "A"}:${String(r.kind)[0]}:${String(r.status)[0]}:${r.amountSatang}:${r.periodKey}:g${gen(r)}:${who[r.requestedById] ?? "-"}:${who[r.decidedById] ?? "-"}:${r.runId ? "bound" : "free"}`;
  const live = async (s = sA) => (await rows(s)).filter((r) => r.status !== "REJECTED").map(rs).sort().join(" ");
  const find = async (k: string, rule: "LATE_RULE" | "ABSENT_RULE", status?: string) => (await rows()).filter((r) => r.employeeId === E[k as keyof typeof E] && r.sourceType === rule && (!status || r.status === status)).pop();
  const lineStr = (h: Any) => ((Array.isArray(h?.linesJson) ? h.linesJson : []) as Any[]).map((l) => `${String(l.day).slice(8)}:${l.minutes}:${l.amountSatang}`).join(",");
  const hdrOf = async (adjId: string | undefined) => (await hdrs()).find((h) => h.adjustmentId === adjId);
  const prevOf = (v: Any, c = cA) => A_("attendanceDeductionPreview", c, v, { periodKey: PER });
  const decide = (id: string | undefined, w: keyof typeof U) => pay.decideAdjustment(cA, id ?? "∅", "APPROVED", { userId: U[w].id, isOwner: w === "owner" }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
  const rec = async (c: Any, s: string, emp: string, day: string) => {
    const id = (await P.hrAttendanceDay.findFirst({ where: { tenantId: TT, systemId: s, employeeId: emp, date: dbDate(day) }, select: { id: true } }))?.id as string;
    return JG.recomputeAttendanceDay(c, Vw.owner, { dayId: id, reason: "แก้ผลตรวจ QC" }, { now: NB }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
  };
  const nAdj = async () => P.hrPayAdjustment.count({ where: { tenantId: TT, sourceType: { in: ["LATE_RULE", "ABSENT_RULE"] } } });
  const M = "ส.ค. 2574";

  // ── S3 policy (before build) ──
  {
    const g = await A_("getAttendancePayPolicy", cA);
    const s0 = await sync(cA, Vw.owner);
    ck("S3.1", { def: g.ok && canon(g.value) === canon(DEF), off: !s0.ok && s0.text === T.off, none: (await nAdj()) === 0 }, "default · off", `${short(g.value, 60)} ${shown(s0)}`);
    const [m1, p1, x1] = [await savePol(cA, Vw.mgrU1, { enabled: true }), await savePol(cA, Vw.payroll, { enabled: true }), await savePol(cA, Vw.member, { enabled: true })];
    const f1 = await savePol(cA, Vw.owner, { enabled: true, freeMin: 61 });
    const st1 = await savePol(cA, Vw.owner, { enabled: true, stepMin: 7 });
    const o1 = await savePol(cA, Vw.owner, { enabled: true });
    for (const c of [cB, cC]) await savePol(c, Vw.owner, { enabled: true });
    const stored = ((await P.appSystem.findUnique({ where: { id: sA }, select: { settings: true } }))?.settings as Any)?.hrAttendancePay;
    ck("S3.2", { refused: [m1, p1, x1].every((r) => !r.ok && r.text === T.policyNo), free: !f1.ok && f1.text === T.sFree, step: !st1.ok && st1.text === T.sStep, ok: o1.ok, stored: canon(stored) === canon({ ...DEF, enabled: true }) }, "owner only · strict", `${shown(m1)} ${shown(f1)} ${shown(st1)} ${shown(o1)} ${short(stored, 80)}`);
    const [a, b, c] = [await sync(cA, Vw.mgrU1), await sync(cA, Vw.member), await sync(cA, Vw.owner, "2031-13")];
    ck("S3.3", { mgr: !a.ok && a.text === T.syncNo, member: !b.ok && b.text === T.syncNo, period: !c.ok && c.text === T.period, none: (await nAdj()) === 0 }, "refused", `${shown(a)} ${shown(b)} ${shown(c)}`);
    const s1 = await sync(cA, Vw.owner);
    const w = (s1.value?.wait ?? []) as Any[];
    ck("S4.2", { ok: s1.ok && s1.value?.created === 0, wait: w.length === 6 && w.every((x) => x.code === "MISSING"), none: (await nAdj()) === 0 }, "all MISSING", `${shown(s1)} ${short(w, 80)}`);
  }

  // ── S4 build + first sync (payroll user) ──
  const b0 = await build(cA);
  {
    const wd = ((await fx.rawRows(`SELECT * FROM "HrWorkDay" WHERE "tenantId" = $1 AND "systemId" = $2`, TT, sA)) ?? []) as Any[];
    const dd = (k: string, d: string) => wd.find((r) => nameOf[r.employeeId] === k && dk(r.date) === `2031-08-${d}`);
    const h = (k: string, d: string) => {
      const r = dd(k, d);
      return r ? `${r.dayClass}:${r.dayStatus}:l${r.lateMin}:e${r.earlyOutMin}:a${r.absentMin}:w${r.workMin}:pl${r.paidLeaveMin}:ow${r.otWorkdayMin}` : "∅";
    };
    const got = [["eL", "04"], ["eL", "05"], ["eL", "06"], ["eL", "07"], ["eL", "08"], ["eM", "04"], ["eS", "05"], ["eH", "08"], ["eW", "04"]].map(([k, d]) => `${k}${d}=${h(k!, d!)}`).join(" ");
    const want = "eL04=WORKDAY:WORKED:l30:e0:a0:w450:pl0:ow0 eL05=WORKDAY:WORKED:l0:e45:a0:w435:pl0:ow0 eL06=WORKDAY:ABSENT:l0:e0:a480:w0:pl0:ow0 eL07=WORKDAY:WORKED:l20:e0:a0:w460:pl0:ow120 eL08=WORKDAY:WORKED:l0:e0:a0:w477:pl0:ow0 eM04=WORKDAY:WORKED:l31:e0:a0:w449:pl0:ow0 eS05=WORKDAY:WORKED:l30:e0:a0:w450:pl0:ow0 eH08=HOLIDAY:WORKED:l0:e0:a0:w0:pl0:ow0 eW04=WORKDAY:WORKED:l30:e0:a0:w390:pl60:ow0";
    const pv = await WE.workEntryPreview(cA, Vw.owner, { periodKey: PER }, { now: NB }).catch(() => null);
    const states = srt(((pv?.rows ?? []) as Any[]).map((r) => `${nameOf[r.employeeId]}=${r.state}`));
    const otRow = await P.hrPayAdjustment.findFirst({ where: { tenantId: TT, employeeId: E.eL, sourceType: "OT_REQUEST" } });
    ck("S4.1", { built: (b0 as Any)?.ok === true, days: got === want, states: states === "eF=REVIEW,eH=CURRENT,eL=CURRENT,eM=CURRENT,eS=CURRENT,eW=CURRENT", ot: dec?.ok === true && otRow?.amountSatang === 18750 && otRow?.kind === "OT" },
      "H3.1 literals", got === want ? `${states} ot=${otRow?.amountSatang}` : got);
  }
  const s1 = await sync(cA, Vw.payroll);
  {
    const want = "eL:A:D:P:50000:2031-08:g1:payroll:-:free eL:L:D:P:9895:2031-08:g1:payroll:-:free eM:L:D:P:3013:2031-08:g1:payroll:-:free eS:L:D:P:2571:2031-08:g1:payroll:-:free eW:L:D:P:3125:2031-08:g1:payroll:-:free";
    const got = await live();
    const notes = srt((await rows()).map((r) => `${nameOf[r.employeeId]}:${r.note}`));
    const wantNotes = srt([`eL:${T.adjAbsent.replace("{n}", "480").replace("{m}", M)}`, `eL:${T.adjLate.replace("{n}", "95").replace("{m}", M)}`, `eM:${T.adjLate.replace("{n}", "31").replace("{m}", M)}`, `eS:${T.adjLate.replace("{n}", "30").replace("{m}", M)}`, `eW:${T.adjLate.replace("{n}", "30").replace("{m}", M)}`]);
    const rr = await rows();
    ck("S4.3", { ok: s1.ok && s1.value?.created === 5, rows: got === want, notes: notes === wantNotes, cols: rr.length === 5 && rr.every((r) => r.hours === null && r.rateSatang === null && r.crmCommissionId === null) }, "5 rows literal", got === want ? `${notes === wantNotes ? "" : notes}` : got);
  }
  {
    const hs = await hdrs();
    const s = async (k: string, rule: "LATE_RULE" | "ABSENT_RULE") => {
      const h = hs.find((x) => x.employeeId === E[k as keyof typeof E] && x.rule === rule);
      return h ? `${lineStr(h)}|E${h.entitledSatang}|${h.amountSatang}|b${h.baseSalarySatang}|N${h.normalDayMin}|g${h.gen}|${h.kind}|${/^[0-9a-f]{64}$/.test(String(h.digest)) ? "hex" : "nohex"}` : "∅";
    };
    const got = [await s("eL", "LATE_RULE"), await s("eL", "ABSENT_RULE"), await s("eM", "LATE_RULE"), await s("eS", "LATE_RULE"), await s("eW", "LATE_RULE")].join(" ");
    const want = "04:30:3125,05:45:4687,07:20:2083|E9895|9895|b1500000|N480|g1|DEDUCTION|hex 06:480:50000|E50000|50000|b1500000|N480|g1|DEDUCTION|hex 04:31:3013|E3013|3013|b1400000|N480|g1|DEDUCTION|hex 05:30:2571|E2571|2571|b1234500|N480|g1|DEDUCTION|hex 04:30:3125|E3125|3125|b1500000|N480|g1|DEDUCTION|hex";
    const linked = (await rows()).every((r) => hs.some((h) => h.adjustmentId === r.id));
    ck("S4.4", { n: hs.length === 5, lit: got === want, linked }, "header literal", got === want ? "" : got);
  }
  {
    const w = ((s1.value?.wait ?? []) as Any[]).map((x) => `${nameOf[x.employeeId]}=${x.code}`).join(",");
    const sk = ((s1.value?.skipped ?? []) as Any[]).map((x) => `${nameOf[x.employeeId]}=${x.code}`).join(",");
    await build(cB);
    const sb = await sync(cB, Vw.owner);
    const skB = srt(((sb.value?.skipped ?? []) as Any[]).map((x) => `${nameOf[x.employeeId]}=${x.code}`));
    ck("S4.5", { a: w === "eF=REVIEW" && sk === "", eH: !(await rows()).some((r) => r.employeeId === E.eH || r.employeeId === E.eF), b: sb.ok && skB === "eD=PAY_TYPE,eN=NO_PROFILE", noneB: (await rows(sB)).length === 0 }, "codes", `${w} | ${sk} | ${shown(sb)} ${skB}`);
  }
  {
    const ot = (await P.hrPayAdjustment.findMany({ where: { tenantId: TT, employeeId: E.eL, kind: "OT" } })) as Any[];
    const h = (await hdrs()).find((x) => x.employeeId === E.eL && x.rule === "LATE_RULE");
    const l07 = ((h?.linesJson ?? []) as Any[]).find((l) => String(l.day).endsWith("-07"));
    ck("S4.6", { ot: ot.length === 1 && ot[0].sourceType === "OT_REQUEST" && ot[0].amountSatang === 18750 && ot[0].status === "APPROVED", noOt: !(await rows()).some((r) => r.kind === "OT"), line: l07?.minutes === 20 && l07?.amountSatang === 2083 },
      "OT only via H2.9", `${ot.map((r) => `${r.sourceType}:${r.amountSatang}`).join(",")} l07=${short(l07, 50)}`);
  }

  // ── S9 privacy (state after first sync) ──
  {
    const [o, p, m, x, t] = [await prevOf(Vw.owner), await prevOf(Vw.payroll), await prevOf(Vw.mgrU1), await prevOf(Vw.member), await prevOf(Vw.other, cO)];
    const keys = (r: RO) => [...new Set(((r.value?.rows ?? []) as Any[]).map((x) => srt(Object.keys(x))))];
    const withM = srt([...BASE_KEYS, ...MONEY_KEYS]);
    const r = {
      owner: o.ok && o.value?.rows?.length === 6 && keys(o).join() === withM, payroll: p.ok && p.value?.rows?.length === 6 && keys(p).join() === withM,
      mgr: m.ok && srt(((m.value?.rows ?? []) as Any[]).map((x) => nameOf[x.employeeId])) === "eF,eL,eS,eW" && keys(m).join() === srt(BASE_KEYS),
      member: !x.ok && x.text === T.no, other: t.ok && !((t.value?.rows ?? []) as Any[]).some((y) => nameOf[y.employeeId] && y.employeeId !== E.eO),
    };
    ck("S9.1", r, "matrix", `${shown(o)} ${shown(m)} ${short(keys(m), 80)} ${shown(x)} ${shown(t)}`);
    const row = (k: string) => ((o.value?.rows ?? []) as Any[]).find((y) => y.employeeId === E[k as keyof typeof E]);
    const ps = (y: Any) => (y ? `${y.code ?? "-"}:${y.lateMin}:${y.absentMin}:${y.days}:${(y.adjustmentIds ?? []).length}:${y.lateSatang}:${y.absentSatang}:${y.pendingSatang}:${y.approvedSatang}` : "∅");
    const got = `${ps(row("eL"))} ${ps(row("eF"))} ${ps(row("eH"))}`;
    chk("S9.2", got === "-:95:480:4:2:9895:50000:59895:0 REVIEW:0:0:0:0:0:0:0:0 -:0:0:0:0:0:0:0:0", "eL · eF · eH literal", got);
    const lid = (await find("eL", "LATE_RULE"))?.id ?? "∅";
    const lp = await A_("attendanceDeductionLines", cA, Vw.payroll, { adjustmentId: lid });
    const v = lp.value ?? {};
    const lit = `${v.employeeId === E.eL}:${v.workPeriodKey}:${v.rule}:${v.gen}:${v.entitledSatang}:${v.amountSatang}:${((v.lines ?? []) as Any[]).map((l) => `${String(l.day).slice(8)}:${l.minutes}:${l.amountSatang}`).join(",")}`;
    const refs = [await A_("attendanceDeductionLines", cA, Vw.mgrU1, { adjustmentId: lid }), await A_("attendanceDeductionLines", cA, Vw.member, { adjustmentId: lid }), await A_("attendanceDeductionLines", cO, Vw.other, { adjustmentId: lid }), await A_("attendanceDeductionLines", cA, Vw.owner, { adjustmentId: "nope" })];
    ck("S9.3", { ok: lp.ok && srt(Object.keys(v)) === LINES_KEYS, lit: lit === "true:2031-08:LATE_RULE:1:9895:9895:04:30:3125,05:45:4687,07:20:2083", same: refs.every((r) => !r.ok && r.text === T.no) }, "payroll only", `${lit} ${refs.map(shown).join(" ")}`);
    const my = await A_("myAttendanceDeductions", cA, { userId: U.self.id }, { periodKey: PER, employeeId: E.eL });
    const it = (my.value?.items ?? []) as Any[];
    const nm = await A_("myAttendanceDeductions", cA, { userId: U.member.id }, { periodKey: PER });
    const forb = [...keysDeep(my.value)].filter((k) => HR_FORBIDDEN_DTO_KEYS.includes(k));
    const i0 = it[0] ?? {};
    ck("S9.4", { own: my.ok && it.length === 1 && i0.adjustmentId === (await find("eS", "LATE_RULE"))?.id, keys: srt(Object.keys(i0)) === MY_KEYS, lit: `${i0.status}:${i0.kind}:${i0.rule}:${i0.minutes}:${i0.amountSatang}:${((i0.lines ?? []) as Any[]).map((l) => `${l.day}:${l.minutes}:${l.amountSatang}`).join(",")}` === "PENDING:DEDUCTION:LATE_RULE:30:2571:2031-08-05:30:2571", noEmp: !nm.ok && nm.text === T.noEmp, forb: forb.length === 0 },
      "self only", `${shown(my)} ${short(i0, 90)} ${shown(nm)} ${forb.join(",")}`);
  }

  // ── S5 idempotency + race ──
  {
    const ids0 = (await rows()).map((r) => r.id).join();
    const again = await sync(cA, Vw.owner);
    const [p1, p2] = await Promise.all([sync(cA, Vw.owner), sync(cA, Vw.payroll)]);
    const ids1 = (await rows()).map((r) => r.id).join();
    ck("S5.1", { again: again.ok && again.value?.created === 0 && again.value?.rejected === 0, par: p1.ok && p2.ok && p1.value?.created === 0 && p2.value?.created === 0, same: ids0 === ids1 && (await rows()).length === 5, hdr: (await hdrs()).length === 5 }, "no churn", `${shown(again)} ${shown(p1)} ${shown(p2)}`);
    const lk = await holdAdvisory(P, `hr:payroll:run:${sA}:${PER}`, async () => null, () => sync(cA, Vw.owner));
    ck("S5.2", { waited: lk.waited, ok: lk.res.ok && lk.res.value?.created === 0, holder: !lk.holderErr }, "waited · then ok", `${lk.waited} ${shown(lk.res)} ${lk.holderErr}`);
  }

  // ── S6 approval rules + stale hook ──
  {
    const [rM, rS, rL] = [await find("eM", "LATE_RULE"), await find("eS", "LATE_RULE"), await find("eL", "LATE_RULE")];
    const a1 = await decide(rM?.id, "payroll");
    const a2 = await decide(rS?.id, "self");
    const a3 = await decide(rL?.id, "owner");
    const a4 = await decide(rS?.id, "owner");
    const st = async (id?: string) => (await P.hrPayAdjustment.findUnique({ where: { id: id ?? "∅" } }))?.status;
    ck("S6.1", { req: a1?.ok === false && a1?.reason === OWN_REQ, self: a2?.ok === false && a2?.reason === OWN_ROW, owner: a3?.ok === true && a4?.ok === true, st: (await st(rL?.id)) === "APPROVED" && (await st(rM?.id)) === "PENDING" }, "H1.3 rules", `${short(a1, 50)} ${short(a2, 50)} ${short(a3, 30)}`);
    await leave(sA, E.eL, "SICK", "2031-08-06", POL_SICK, { days: 1 });
    const ab = await find("eL", "ABSENT_RULE");
    const a5 = await decide(ab?.id, "owner");
    const before = await live();
    const sy = await sync(cA, Vw.owner);
    const w = ((sy.value?.wait ?? []) as Any[]).map((x) => `${nameOf[x.employeeId]}=${x.code}`).sort().join(",");
    ck("S6.2", { refused: a5?.ok === false && a5?.reason === T.stale, pending: (await st(ab?.id)) === "PENDING", wait: sy.ok && w === "eF=REVIEW,eL=OUTDATED" && sy.value?.created === 0 && sy.value?.rejected === 0, same: before === (await live()) }, "stale ⇒ refused · no write", `${short(a5, 60)} ${shown(sy)} ${w}`);
    const c1 = await pay.cancelAdjustment(cA, ab?.id ?? "∅", { userId: U.owner.id, isOwner: true }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    ck("S6.3", { refused: c1?.ok === false && c1?.reason === T.attRow, kept: !!ab && (await st(ab?.id)) === "PENDING" }, "attRow", short(c1, 80));
  }

  // ── S7 re-sync ──
  {
    const ab = await find("eL", "ABSENT_RULE");
    const lt = await find("eL", "LATE_RULE");
    const rc = await rec(cA, sA, E.eL, "2031-08-06");
    await build(cA);
    const sy = await sync(cA, Vw.owner);
    const h = await hdrOf(ab?.id);
    const ab2 = await P.hrPayAdjustment.findUnique({ where: { id: ab?.id ?? "∅" } });
    const lt2 = await P.hrPayAdjustment.findUnique({ where: { id: lt?.id ?? "∅" } });
    ck("S7.1", { rec: rc?.ok === true, sy: sy.ok && sy.value?.created === 0 && sy.value?.rejected === 1, ab: ab2?.status === "REJECTED" && ab2?.decidedById === null && h?.endCode === "SUPERSEDED", lt: lt2?.status === "APPROVED" && lt2?.amountSatang === 9895 && lt2?.decidedById === U.owner.id }, "absent withdrawn", `${short(rc, 40)} ${shown(sy)} ${ab2?.status} ${h?.endCode}`);
    const mr = await find("eM", "LATE_RULE");
    const cr = await CM.requestCorrection(cA, Vw.owner, { action: "CHANGE", employeeId: E.eM, attendanceId: mIn.i, at: bk("2031-08-04", "09:00"), reason: "แก้เวลาเข้า QC" }, { now: NB }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    await build(cA);
    const sy2 = await sync(cA, Vw.owner);
    const mr2 = await P.hrPayAdjustment.findUnique({ where: { id: mr?.id ?? "∅" } });
    ck("S7.2", { cr: cr?.ok === true && cr?.status === "APPROVED", sy: sy2.ok && sy2.value?.created === 0 && sy2.value?.rejected === 1, gone: mr2?.status === "REJECTED" && (await hdrOf(mr?.id))?.endCode === "SUPERSEDED", noNew: (await rows()).filter((r) => r.employeeId === E.eM).length === 1 }, "eM withdrawn", `${short(cr, 50)} ${shown(sy2)} ${mr2?.status}`);
    const sv = await savePol(cA, Vw.owner, { enabled: true, freeMin: 5 });
    const sy3 = await sync(cA, Vw.owner);
    const want = "eL:L:D:P:8332:2031-08:g2:owner:-:free eS:L:D:P:2143:2031-08:g2:owner:-:free eW:L:D:P:2604:2031-08:g2:owner:-:free";
    const got = await live();
    const lt3 = await P.hrPayAdjustment.findUnique({ where: { id: lt?.id ?? "∅" } });
    const h2 = await hdrOf((await find("eL", "LATE_RULE", "PENDING"))?.id);
    const note2 = (await find("eL", "LATE_RULE", "PENDING"))?.note;
    ck("S7.3", { sv: sv.ok, sy: sy3.ok && sy3.value?.created === 3 && sy3.value?.rejected === 3, rows: got === want, sup: lt3?.status === "REJECTED" && (await hdrOf(lt?.id))?.endCode === "SUPERSEDED", lines: lineStr(h2) === "04:25:2604,05:40:4166,07:15:1562" && h2?.entitledSatang === 8332, note: note2 === T.adjLate.replace("{n}", "80").replace("{m}", M) },
      "freeMin 5 literal", `${shown(sy3)} ${got === want ? "" : got} ${lineStr(h2)}`);
    const w2 = await find("eW", "LATE_RULE", "PENDING");
    const aw = await decide(w2?.id, "owner");
    const off = await savePol(cA, Vw.owner, { enabled: false, freeMin: 5 });
    const after = await live();
    const ends = srt((await hdrs()).filter((x) => x.endCode === "POLICY_OFF").map((x) => nameOf[x.employeeId]));
    const so = await sync(cA, Vw.owner);
    ck("S7.4", { aw: aw?.ok === true, off: off.ok, live: after === "eW:L:D:A:2604:2031-08:g2:owner:owner:free", ends: ends === "eL,eS", refused: !so.ok && so.text === T.off }, "pending withdrawn · approved kept", `${after} ${ends} ${shown(so)}`);
    await savePol(cA, Vw.owner, { enabled: true, freeMin: 5 });
    const sy5 = await sync(cA, Vw.owner);
    const got5 = await live();
    ck("S7.5", { sy: sy5.ok && sy5.value?.created === 2 && sy5.value?.rejected === 0, rows: got5 === "eL:L:D:P:8332:2031-08:g3:owner:-:free eS:L:D:P:2143:2031-08:g3:owner:-:free eW:L:D:A:2604:2031-08:g2:owner:owner:free" }, "gen 3", `${shown(sy5)} ${got5}`);
  }

  // ── S8 bound rows → refund (system C) ──
  {
    await build(cC);
    const aug = await pay.createPayrollRun(cC, { periodKey: PER, payDate: new Date("2031-08-31T00:00:00Z") }).catch((e: unknown) => ({ __err: errText(e) }));
    const sc = await sync(cC, Vw.owner);
    const r0 = (await rows(sC))[0];
    const want0 = "eR:L:D:P:3013:2031-09:g1:owner:-:free";
    ck("S8.1", { run: !!aug?.id, sync: sc.ok && sc.value?.created === 1, row: (await live(sC)) === want0 }, "target 2031-09", `${short(aug, 40)} ${shown(sc)} ${await live(sC)}`);
    const ap = await pay.decideAdjustment(cC, r0?.id ?? "∅", "APPROVED", { userId: U.owner.id, isOwner: true }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    const sep = await pay.createPayrollRun(cC, { periodKey: "2031-09", payDate: new Date("2031-09-30T00:00:00Z") }).catch((e: unknown) => ({ __err: errText(e) }));
    await buildAt(cC, "2031-09"); // ORACLE-EDIT (fix r1 R1): approving a month needs its time data pulled + deductions computed
    await sync(cC, Vw.owner, "2031-09"); // ORACLE-EDIT (fix r1 R1)
    const sa = sep?.id ? await pay.approveRun(cC, sep.id).catch((e: unknown) => ({ ok: false, note: errText(e) })) : sep;
    const b1 = await P.hrPayAdjustment.findUnique({ where: { id: r0?.id ?? "∅" } });
    const fz = await sync(cC, Vw.owner, "2031-09");
    // ORACLE-EDIT (fix r1 R3): sync of a frozen work period is allowed and writes only to a later period — here nothing to write
    ck("S8.2", { ap: ap?.ok === true, run: sa?.ok === true, bound: !!sep?.id && b1?.runId === sep.id && b1?.status === "APPROVED", frozen: fz.ok && fz.value?.created === 0 && fz.value?.refunds === 0 && fz.value?.rejected === 0 }, "bound · frozen sync no-op", `${short(ap, 40)} ${short(sa, 40)} ${b1?.runId === sep?.id} ${shown(fz)}`);
    const del = aug?.id ? await pay.deleteDraftRun(cC, aug.id, { userId: U.owner.id, isOwner: true }).catch((e: unknown) => ({ ok: false, reason: errText(e) })) : aug;
    const cr = await CM.requestCorrection(cC, Vw.owner, { action: "CHANGE", employeeId: E.eR, attendanceId: rIn.i, at: bk("2031-08-04", "09:00"), reason: "แก้เวลาเข้า QC" }, { now: NB }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    await build(cC);
    const s3 = await sync(cC, Vw.owner);
    const rr = await rows(sC);
    const refund = rr.find((r) => r.kind === "ALLOWANCE");
    const b2 = await P.hrPayAdjustment.findUnique({ where: { id: r0?.id ?? "∅" } });
    const signed = rr.filter((r) => r.status === "APPROVED").reduce((a, r) => a + (r.kind === "DEDUCTION" ? r.amountSatang : -r.amountSatang), 0);
    const rh = await fx.rawRows(`SELECT kind::text AS kind, "entitledSatang", "amountSatang", gen FROM "HrAttendanceDeduction" WHERE "adjustmentId" = $1`, refund?.id ?? "∅");
    ck("S8.3", {
      del: del?.ok === true, cr: cr?.ok === true, sync: s3.ok && s3.value?.refunds === 1,
      refund: !!refund && `${refund.status}:${refund.amountSatang}:${refund.periodKey}:${refund.sourceType}:g${gen(refund)}:${refund.decidedById}:${refund.runId}` === "APPROVED:3013:2031-10:LATE_RULE:g2:null:null" && refund.note === T.refund.replace("{m}", M),
      bound: b2?.status === "APPROVED" && b2?.amountSatang === 3013 && b2?.runId === sep?.id, sum: signed === 0, hdr: rh?.[0]?.kind === "ALLOWANCE" && rh?.[0]?.entitledSatang === 0 && rh?.[0]?.amountSatang === 3013,
    }, "refund next open period", `${short(del, 30)} ${short(cr, 40)} ${shown(s3)} ${refund ? rs(refund) : "∅"} Σ${signed}`);
    const s4 = await sync(cC, Vw.owner);
    ck("S8.4", { ok: s4.ok && s4.value?.created === 0 && s4.value?.refunds === 0, n: (await rows(sC)).length === 2 }, "no second refund", `${shown(s4)} ${(await rows(sC)).length}`);
  }

  // ── ORACLE-EDIT (controller ruling 12 Nov · closes the brief's accepted gap D1) — S8.5–S8.7 (system D · eQ ฿15,000 · N 480) ──
  //   late 30 ⇒ 1,500,000 × 30 / 14,400 = 3,125 · correction IN 09:30 → 09:10 ⇒ late 10 ⇒ 15,000,000 / 14,400 = 1,041.67 → 1,041
  {
    const OWN = { userId: U.owner.id, isOwner: true };
    const st = async (id?: string) => P.hrPayAdjustment.findUnique({ where: { id: id ?? "∅" } });
    const itemOf = async (runId?: string) => (await P.hrPayrollItem.findFirst({ where: { tenantId: TT, systemId: sD, runId: runId ?? "∅", employeeId: eQ }, select: { deductSatang: true } }))?.deductSatang;
    await savePol(cD, Vw.owner, { enabled: true });
    await build(cD);
    const s0 = await sync(cD, Vw.owner);
    const q0 = (await rows(sD))[0];
    const a0 = await pay.decideAdjustment(cD, q0?.id ?? "∅", "APPROVED", OWN).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    const cr = await CM.requestCorrection(cD, Vw.owner, { action: "CHANGE", employeeId: eQ, attendanceId: qIn.i, at: bk("2031-08-04", "09:10"), reason: "แก้เวลาเข้า QC" }, { now: NB }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    const run1 = await pay.createPayrollRun(cD, { periodKey: PER, payDate: new Date("2031-08-31T00:00:00Z") }).catch((e: unknown) => ({ __err: errText(e) }));
    const q1 = await st(q0?.id);
    ck("S8.5", { s0: s0.ok && s0.value?.created === 1 && q0?.amountSatang === 3125, a0: a0?.ok === true, cr: cr?.ok === true, run: !!run1?.id, unbound: q1?.status === "APPROVED" && q1?.runId === null, item: (await itemOf(run1?.id)) === 0 },
      "stale approved row not bound", `${shown(s0)} ${short(a0, 30)} ${short(cr, 30)} ${short(run1, 40)} ${q1?.status}:${q1?.runId} item=${await itemOf(run1?.id)}`);
    const del = run1?.id ? await pay.deleteDraftRun(cD, run1.id, OWN).catch((e: unknown) => ({ ok: false, reason: errText(e) })) : run1;
    await build(cD);
    const s1 = await sync(cD, Vw.owner);
    const q2 = (await rows(sD)).find((r) => r.status === "PENDING");
    const h0 = (await hdrs(sD)).find((h) => h.adjustmentId === q0?.id);
    const a2 = await pay.decideAdjustment(cD, q2?.id ?? "∅", "APPROVED", OWN).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    const run2 = await pay.createPayrollRun(cD, { periodKey: PER, payDate: new Date("2031-08-31T00:00:00Z") }).catch((e: unknown) => ({ __err: errText(e) }));
    const b2 = await st(q2?.id);
    ck("S8.6", {
      del: del?.ok === true, sync: s1.ok && s1.value?.created === 1 && s1.value?.rejected === 1, old: (await st(q0?.id))?.status === "REJECTED" && h0?.endCode === "SUPERSEDED",
      row: !!q2 && `${q2.kind}:${q2.amountSatang}:${q2.periodKey}:g${String(q2.sourceRef).split(":").pop()}` === "DEDUCTION:1041:2031-08:g2", a2: a2?.ok === true, bound: !!run2?.id && b2?.runId === run2.id, item: (await itemOf(run2?.id)) === 1041,
    }, "corrected amount binds", `${short(del, 30)} ${shown(s1)} ${q2 ? `${q2.kind}:${q2.amountSatang}:${q2.periodKey}` : "∅"} ${short(a2, 30)} item=${await itemOf(run2?.id)}`);
    await leave(sD, eQ, "VACATION", "2031-08-04", POL_VAC_D, { hours: 1, days: 0.1 });
    const ap = run2?.id ? await pay.approveRun(cD, run2.id).catch((e: unknown) => ({ ok: false, note: errText(e) })) : run2;
    const rc = run2?.id ? await pay.recomputeDraftRun(cD, run2.id, OWN).catch((e: unknown) => ({ ok: false, reason: errText(e) })) : run2;
    const b3 = await st(q2?.id);
    ck("S8.7", { refused: ap?.ok === false && ap?.note === T.runStale, rc: rc?.ok === true, kept: b3?.status === "APPROVED", unbound: b3?.runId === null, item: (await itemOf(run2?.id)) === 0 },
      "approve refused · recompute unbinds", `${short(ap, 60)} ${short(rc, 30)} ${b3?.status}:${b3?.runId} item=${await itemOf(run2?.id)}`);
  }

  // ── ORACLE-EDIT (fix r1 · controller rulings R1–R8) — S8.8–S8.14 · money: late 30 = 1,500,000 × 30 / 14,400 = 3,125 ·
  //    corrected late 10 = 15,000,000 / 14,400 = 1,041.67 → 1,041 · refund 3,125 − 1,041 = 2,084 · settled = Σ APPROVED rows bound to APPROVED/PAID runs (DEDUCTION + · ALLOWANCE −)
  {
    const OWN = { userId: U.owner.id, isOwner: true };
    type Sc = (typeof SC)["G"];
    const runOf = (c: Any, per: string) => pay.createPayrollRun(c, { periodKey: per, payDate: new Date(`${per}-28T00:00:00Z`) }).catch((e: unknown) => ({ __err: errText(e) }));
    const apRun = (c: Any, id?: string) => (id ? pay.approveRun(c, id).catch((e: unknown) => ({ ok: false, note: errText(e) })) : Promise.resolve({ ok: false, note: "∅run" }));
    const recomp = (c: Any, id?: string) => (id ? pay.recomputeDraftRun(c, id, OWN).catch((e: unknown) => ({ ok: false, reason: errText(e) })) : Promise.resolve({ ok: false, reason: "∅run" }));
    const decideAs = (c: Any, id: string | undefined, st: "APPROVED" | "REJECTED") => pay.decideAdjustment(c, id ?? "∅", st, OWN).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    const corr = (x: Sc, hm: string) => CM.requestCorrection(x.c, Vw.owner, { action: "CHANGE", employeeId: x.emp, attendanceId: x.inId, at: bk("2031-08-04", hm), reason: "แก้เวลาเข้า QC" }, { now: NB }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    const prepMonth = async (x: Sc, per: string) => (await buildAt(x.c, per), await sync(x.c, Vw.owner, per));
    const settled = async (s: string) => {
      const st = new Map(((await P.hrPayrollRun.findMany({ where: { tenantId: TT, systemId: s }, select: { id: true, status: true } })) as Any[]).map((r) => [r.id, String(r.status)]));
      return (await rows(s)).filter((r) => r.status === "APPROVED" && r.runId && ["APPROVED", "PAID"].includes(st.get(r.runId) ?? "")).reduce((a, r) => a + (r.kind === "DEDUCTION" ? r.amountSatang : -r.amountSatang), 0);
    };
    const firstDed = async (s: string) => (await rows(s)).find((r) => r.kind === "DEDUCTION");
    const pendOf = async (s: string) => (await rows(s)).find((r) => r.status === "PENDING");
    const liveS = async (s: string) => (await rows(s)).filter((r) => r.status !== "REJECTED").map((r) => `${r.kind}:${r.status}:${r.amountSatang}:${r.periodKey}:${r.runId ? "b" : "f"}`).join(",");
    for (const x of Object.values(SC)) await savePol(x.c, Vw.owner, { enabled: true });

    // S8.8 — hunter B/B2: deduction bound into the Aug DRAFT, then the time data changes
    {
      const x = SC.G;
      await build(x.c);
      const s0 = await sync(x.c, Vw.owner);
      const d0 = await firstDed(x.s);
      await decideAs(x.c, d0?.id, "APPROVED");
      const aug = await runOf(x.c, PER);
      const bound0 = (await P.hrPayAdjustment.findUnique({ where: { id: d0?.id ?? "∅" } }))?.runId === aug?.id;
      await corr(x, "09:10");
      await build(x.c);
      const before = await liveS(x.s);
      const s1 = await sync(x.c, Vw.owner);
      const w1 = ((s1.value?.wait ?? []) as Any[]).map((w) => w.code).join(",");
      const same = before === (await liveS(x.s));
      const ap1 = await apRun(x.c, aug?.id);
      const rc = await recomp(x.c, aug?.id);
      const s2 = await sync(x.c, Vw.owner);
      const q = await pendOf(x.s);
      const aq = await decideAs(x.c, q?.id, "APPROVED");
      const ap2 = await apRun(x.c, aug?.id);
      await prepMonth(x, "2031-09");
      const sep = await runOf(x.c, "2031-09");
      const ap3 = await apRun(x.c, sep?.id);
      const set = await settled(x.s);
      const noRefund = !(await rows(x.s)).some((r) => r.kind === "ALLOWANCE");
      ck("S8.8", {
        setup: s0.ok && d0?.amountSatang === 3125 && bound0, wait: s1.ok && w1 === "RUN_STALE" && s1.value?.created === 0 && s1.value?.rejected === 0 && s1.value?.refunds === 0 && same,
        ap1: ap1?.ok === false && ap1?.note === T.runStale, rc: rc?.ok === true, s2: s2.ok && s2.value?.created === 1 && s2.value?.rejected === 1 && q?.amountSatang === 1041 && q?.periodKey === "2031-09",
        ap2: aq?.ok === true && ap2?.ok === true && ap3?.ok === true, settled: set === 1041, noRefund,
      }, "settled 1,041 · never +2,084", `${short(s1.value?.wait, 50)} same=${same} ${short(ap1, 40)} ${shown(s2)} q=${q?.amountSatang}@${q?.periodKey} ${short(ap2, 30)} ${short(ap3, 30)} settled=${set} ${await liveS(x.s)}`);
    }
    // S8.9 — reviewer M1: approved deduction goes stale before binding ⇒ the month cannot be approved until re-synced
    {
      const x = SC.F;
      await build(x.c);
      await sync(x.c, Vw.owner);
      const d0 = await firstDed(x.s);
      await decideAs(x.c, d0?.id, "APPROVED");
      await corr(x, "09:10");
      await build(x.c);
      const aug = await runOf(x.c, PER);
      const unbound = (await P.hrPayAdjustment.findUnique({ where: { id: d0?.id ?? "∅" } }))?.runId === null;
      const ap1 = await apRun(x.c, aug?.id);
      const rc = await recomp(x.c, aug?.id);
      const s1 = await sync(x.c, Vw.owner);
      const q = await pendOf(x.s);
      const aq = await decideAs(x.c, q?.id, "APPROVED");
      const ap2 = await apRun(x.c, aug?.id);
      await prepMonth(x, "2031-09");
      const sep = await runOf(x.c, "2031-09");
      const ap3 = await apRun(x.c, sep?.id);
      const set = await settled(x.s);
      ck("S8.9", { unbound, ap1: ap1?.ok === false && ap1?.note === T.runSync, rc: rc?.ok === true, s1: s1.ok && s1.value?.rejected === 1 && s1.value?.created === 1 && q?.amountSatang === 1041, ap2: aq?.ok === true && ap2?.ok === true && ap3?.ok === true, settled: set === 1041 },
        "approve refused until re-synced · settled 1,041", `${short(ap1, 50)} ${shown(s1)} q=${q?.amountSatang} ${short(ap2, 30)} ${short(ap3, 30)} settled=${set}`);
    }
    // S8.10 — hunter A: Aug approved WITHOUT a sync (legacy: rule switched off at approval) after the 3,125 was taken in Sept
    {
      const x = SC.H;
      await build(x.c);
      const aug = await runOf(x.c, PER);
      await sync(x.c, Vw.owner);
      const d0 = await firstDed(x.s);
      await decideAs(x.c, d0?.id, "APPROVED");
      await prepMonth(x, "2031-09");
      const sep = await runOf(x.c, "2031-09");
      const apS = await apRun(x.c, sep?.id);
      await corr(x, "09:10");
      await build(x.c);
      await savePol(x.c, Vw.owner, { enabled: false });
      await recomp(x.c, aug?.id);
      const apA = await apRun(x.c, aug?.id);
      await savePol(x.c, Vw.owner, { enabled: true });
      const s1 = await sync(x.c, Vw.owner);
      const rf = (await rows(x.s)).find((r) => r.kind === "ALLOWANCE");
      await prepMonth(x, "2031-10");
      const oct = await runOf(x.c, "2031-10");
      const apO = await apRun(x.c, oct?.id);
      const rf2 = await P.hrPayAdjustment.findUnique({ where: { id: rf?.id ?? "∅" } });
      const set = await settled(x.s);
      ck("S8.10", {
        setup: d0?.periodKey === "2031-09" && apS?.ok === true && apA?.ok === true, sync: s1.ok && s1.value?.refunds === 1, refund: !!rf && `${rf.status}:${rf.amountSatang}:${rf.periodKey}` === "APPROVED:2084:2031-10",
        bound: apO?.ok === true && !!oct?.id && rf2?.runId === oct.id, settled: set === 1041,
      }, "frozen sync ⇒ refund 2,084 in Oct · settled 1,041", `${short(apS, 30)} ${short(apA, 30)} ${shown(s1)} ${rf ? `${rf.status}:${rf.amountSatang}:${rf.periodKey}` : "∅"} ${short(apO, 30)} settled=${set}`);
    }
    // S8.11 — hunter C / C2: after Aug is frozen the owner raises the salary (I) / changes the rule (J) ⇒ the frozen month keeps its snapshot
    {
      const res: string[] = [];
      let all = true;
      for (const [key, x] of [["C", SC.I], ["C2", SC.J]] as const) {
        await build(x.c);
        const aug = await runOf(x.c, PER);
        await sync(x.c, Vw.owner);
        const d0 = await firstDed(x.s);
        await decideAs(x.c, d0?.id, "APPROVED");
        const apA = await apRun(x.c, aug?.id);
        const chg = key === "C" ? await pay.setSalaryProfile(x.c, { employeeId: x.emp, baseSalarySatang: 1_600_000, ssoEligible: true }).then(() => ({ ok: true })).catch((e: unknown) => ({ ok: false, reason: errText(e) })) : (await savePol(x.c, Vw.owner, { enabled: true, freeMin: 5 })).value;
        const sA = await sync(x.c, Vw.owner);
        await prepMonth(x, "2031-09");
        const sep = await runOf(x.c, "2031-09");
        const apS = await apRun(x.c, sep?.id);
        const b = await P.hrPayAdjustment.findUnique({ where: { id: d0?.id ?? "∅" } });
        const set = await settled(x.s);
        const ok = apA?.ok === true && chg?.ok === true && sA.ok && sA.value?.created === 0 && sA.value?.refunds === 0 && sA.value?.rejected === 0 && apS?.ok === true && !!sep?.id && b?.runId === sep.id && set === 3125;
        all = all && ok;
        res.push(`${key}:${short(apA, 20)} ${shown(sA)} ${short(apS, 30)} bound=${b?.runId === sep?.id} settled=${set}`);
      }
      ck("S8.11", { both: all }, "settled 3,125 ×2", res.join(" | "));
    }
    // S8.12 — period cap (pure): 31 × absent 480 = 31 × 50,000 = 1,550,000 > 1,500,000 ⇒ day 31 truncated to 0 · 30 absent (1,500,000) + day 31 late 30 ⇒ late 0
    {
      const days31 = Array.from({ length: 31 }, (_, i) => dy(String(i + 1).padStart(2, "0"), { absentMin: 480 }));
      const a = R && typeof R.attendanceDeductionOf === "function" ? R.attendanceDeductionOf(inp(1_500_000, 480, days31)) : null;
      const mixed = Array.from({ length: 30 }, (_, i) => dy(String(i + 1).padStart(2, "0"), { absentMin: 480 })).concat([dy("31", { lateMin: 30 })]);
      const b = R && typeof R.attendanceDeductionOf === "function" ? R.attendanceDeductionOf(inp(1_500_000, 480, mixed)) : null;
      const lastA = a?.lines?.[a.lines.length - 1];
      ck("S8.12", { a: a?.ok === true && a.absent.amountSatang === 1_500_000 && a.absent.days === 31 && lastA?.amountSatang === 0, b: b?.ok === true && b.absent.amountSatang === 1_500_000 && b.late.amountSatang === 0 && b.late.minutes === 30 },
        "Σ ≤ base", `${a?.absent?.amountSatang}/${lastA?.amountSatang} ${b?.absent?.amountSatang}+${b?.late?.amountSatang}`);
    }
    // S8.13 — tenancy at the service: an owner of another shop passes this shop's ctx
    {
      const n0 = await nAdj();
      const pol0 = ((await P.appSystem.findUnique({ where: { id: sA }, select: { settings: true } }))?.settings as Any)?.hrAttendancePay;
      const lid = (await rows())[0]?.id ?? "∅";
      const [a, b, c, d] = [await sync(cA, Vw.other), await savePol(cA, Vw.other, { enabled: false }), await prevOf(Vw.other, cA), await A_("attendanceDeductionLines", cA, Vw.other, { adjustmentId: lid })];
      const pol1 = ((await P.appSystem.findUnique({ where: { id: sA }, select: { settings: true } }))?.settings as Any)?.hrAttendancePay;
      ck("S8.13", { sync: !a.ok && a.text === T.syncNo, save: !b.ok && b.text === T.policyNo, prev: !c.ok && c.text === T.no, lines: !d.ok && d.text === T.no, none: (await nAdj()) === n0 && canon(pol0) === canon(pol1) }, "refused · nothing written", `${shown(a)} ${shown(b)} ${shown(c)} ${shown(d)}`);
    }
    // S8.14 — a human REJECT is a waiver for that exact data; new time data ⇒ new PENDING
    {
      const x = SC.K;
      await build(x.c);
      const s0 = await sync(x.c, Vw.owner);
      const d0 = await firstDed(x.s);
      const rj = await decideAs(x.c, d0?.id, "REJECTED");
      const s1 = await sync(x.c, Vw.owner);
      const live1 = await liveS(x.s);
      await corr(x, "09:10");
      await build(x.c);
      const s2 = await sync(x.c, Vw.owner);
      const q = await pendOf(x.s);
      ck("S8.14", { s0: s0.ok && s0.value?.created === 1 && d0?.amountSatang === 3125, rj: rj?.ok === true, stick: s1.ok && s1.value?.created === 0 && live1 === "", renew: s2.ok && s2.value?.created === 1 && q?.amountSatang === 1041 },
        "reject sticks · new data re-creates", `${short(rj, 30)} ${shown(s1)} live=${live1} ${shown(s2)} q=${q?.amountSatang}`);
    }

    // ── ORACLE-EDIT (fix r2 · controller F1–F4) ──
    const savePolAt = (c: Any, raw: Any, at: string) => A_("saveAttendancePayPolicy", c, Vw.owner, raw, { now: bk(at) });
    const inForceOf = async (s: string) => ((await P.appSystem.findUnique({ where: { id: s }, select: { settings: true } }))?.settings as Any)?.hrAttendancePayInForce;
    const codes = (r: RO, k: "wait" | "skipped") => ((r.value?.[k] ?? []) as Any[]).map((w) => w.code).join(",");
    // S8.15 — F1: Aug frozen at ฿15,000 with the rule never on · raise to ฿30,000 in Oct · rule on in Nov ⇒ sync Aug must not deduct
    //   (without the fix: current values ⇒ 3,000,000 × 30 / 14,400 = 6,250 PENDING)
    {
      const x = SC2.N;
      await build(x.c);
      const aug = await runOf(x.c, PER);
      const apA = await apRun(x.c, aug?.id);
      const raise = await pay.setSalaryProfile(x.c, { employeeId: x.emp, baseSalarySatang: 3_000_000, ssoEligible: true }).then(() => true).catch(() => false);
      const en = await savePolAt(x.c, { enabled: true }, "2031-11-10");
      const s1 = await sync(x.c, Vw.owner);
      const n = (await rows(x.s)).length;
      ck("S8.15", { apA: apA?.ok === true, raise, en: en.ok, sync: s1.ok && s1.value?.created === 0 && codes(s1, "skipped") === "NO_SNAPSHOT", none: n === 0 }, "no retroactive deduction", `${short(apA, 30)} ${shown(s1)} skipped=${codes(s1, "skipped")} rows=${n} ${await liveS(x.s)}`);
    }
    // S8.16 — F2: interval opens at the current period (Aug) · July run approves with no sync · OFF on 20 Aug closes it at Aug ·
    //   approved 3,125 goes stale (correction 09:10 ⇒ 1,041) ⇒ approve(Aug) refused runSync even though OFF · sync while OFF rejects it (no new deduction while OFF) ⇒ approve ok · settled 0
    {
      const x = SC2.O;
      const en = await savePolAt(x.c, { enabled: true }, "2031-08-01");
      const iv1 = canon(await inForceOf(x.s));
      const sJ = await sync(x.c, Vw.owner, "2031-07"); // July still open ⇒ NOT_IN_FORCE (a frozen month without a snapshot reports NO_SNAPSHOT — S8.15)
      const jul = await runOf(x.c, "2031-07");
      const apJ = await apRun(x.c, jul?.id);
      await build(x.c);
      await sync(x.c, Vw.owner);
      const d0 = await firstDed(x.s);
      await decideAs(x.c, d0?.id, "APPROVED");
      await corr(x, "09:10");
      await build(x.c);
      const off = await savePolAt(x.c, { enabled: false }, "2031-08-20");
      const iv2 = canon(await inForceOf(x.s));
      const aug = await runOf(x.c, PER);
      const held = (await P.hrPayAdjustment.findUnique({ where: { id: d0?.id ?? "∅" } }))?.runId === null;
      const ap1 = await apRun(x.c, aug?.id);
      const s1 = await sync(x.c, Vw.owner);
      const ap2 = await apRun(x.c, aug?.id);
      const set = await settled(x.s);
      ck("S8.16", {
        en: en.ok && iv1 === canon([{ from: "2031-08", to: null }]), jul: apJ?.ok === true && sJ.ok && sJ.value?.created === 0 && codes(sJ, "skipped") === "NOT_IN_FORCE",
        off: off.ok && iv2 === canon([{ from: "2031-08", to: "2031-08" }]) && held, block: ap1?.ok === false && ap1?.note === T.runSync,
        clear: s1.ok && s1.value?.rejected === 1 && s1.value?.created === 0 && ap2?.ok === true && (await liveS(x.s)) === "" && set === 0,
      }, "in-force months only · OFF still gated", `iv1=${iv1} ${short(apJ, 30)} ${shown(sJ)}/${codes(sJ, "skipped")} iv2=${iv2} ${short(ap1, 40)} ${shown(s1)} ${short(ap2, 30)} settled=${set}`);
    }
    // S8.17 — F3 dead ends: (a) employee in the run with no work hours (never pulled) and no rows ⇒ nothing owed ·
    //   (b) base salary → 0 with an APPROVED unbound 3,125 ⇒ entitlement 0 ⇒ sync supersedes it (system) ⇒ gate clears · settled 0
    {
      const a = SC2.P1;
      await savePol(a.c, Vw.owner, { enabled: true });
      await WE.buildWorkEntrySnapshot(a.c, Vw.owner, { periodKey: PER, employeeIds: [a.emp] }, { now: NB }).catch(() => null);
      const sa = await sync(a.c, Vw.owner);
      const da = await firstDed(a.s);
      await decideAs(a.c, da?.id, "APPROVED");
      const augA = await runOf(a.c, PER);
      const apA = await apRun(a.c, augA?.id);
      const b = SC2.P2;
      await savePol(b.c, Vw.owner, { enabled: true });
      await build(b.c);
      await sync(b.c, Vw.owner);
      const db0 = await firstDed(b.s);
      await decideAs(b.c, db0?.id, "APPROVED");
      const zero = await pay.setSalaryProfile(b.c, { employeeId: b.emp, baseSalarySatang: 0, ssoEligible: false }).then(() => true).catch(() => false);
      const sb = await sync(b.c, Vw.owner);
      const hb = (await hdrs(b.s)).find((h) => h.adjustmentId === db0?.id);
      const augB = await runOf(b.c, PER);
      const apB = await apRun(b.c, augB?.id);
      ck("S8.17", {
        a: sa.ok && codes(sa, "wait") === "MISSING" && da?.amountSatang === 3125 && apA?.ok === true && (await settled(a.s)) === 3125,
        b: zero && sb.ok && sb.value?.rejected === 1 && sb.value?.created === 0 && codes(sb, "skipped") === "NO_BASE" && hb?.endCode === "SUPERSEDED" && apB?.ok === true && (await settled(b.s)) === 0,
      }, "dead ends clear", `a: ${shown(sa)} wait=${codes(sa, "wait")} ${short(apA, 40)} · b: ${shown(sb)} ${hb?.endCode} ${short(apB, 40)}`);
    }
    // S8.18 — F4: sync ∥ OFF on four systems ⇒ after both: no PENDING row and no live (endCode null) header
    {
      const res: string[] = [];
      let ok = true;
      for (const x of [SC2.Q0, SC2.Q1, SC2.Q2, SC2.Q3]) {
        await savePol(x.c, Vw.owner, { enabled: true });
        await build(x.c);
        const [r1, r2] = await Promise.all([sync(x.c, Vw.owner), savePol(x.c, Vw.owner, { enabled: false })]);
        const pend = (await rows(x.s)).filter((r) => r.status === "PENDING").length;
        const liveH = (await hdrs(x.s)).filter((h) => h.endCode === null).length;
        ok = ok && r2.ok && pend === 0 && liveH === 0;
        res.push(`${r1.ok ? `c${r1.value?.created}` : "off"}/${r2.ok}:p${pend}h${liveH}`);
      }
      ck("S8.18", { none: ok }, "no PENDING · no live header", res.join(" "));
    }
    // S8.19 — fix r3 (N1): rule ON, Aug in force, late 30 on 4 Aug, work hours never pulled ⇒ approve(Aug) must not pass as "nothing owed"
    //   R: run → approve refused → pull + sync (target Sept: Aug has a draft) → approve deduction → approve Aug (live 3,125 = E) → Sept run ⇒ settled 3,125
    //   S: same, but a sync before the pull (waits MISSING, writes nothing) — approve still refused
    {
      const res: string[] = [];
      let all = true;
      for (const [key, x] of [["R", SC3.R], ["S", SC3.S]] as const) {
        await savePol(x.c, Vw.owner, { enabled: true });
        const s0 = key === "S" ? await sync(x.c, Vw.owner) : null;
        const aug = await runOf(x.c, PER);
        const ap1 = await apRun(x.c, aug?.id);
        await build(x.c);
        const s1 = await sync(x.c, Vw.owner);
        const d0 = await firstDed(x.s);
        await decideAs(x.c, d0?.id, "APPROVED");
        const ap2 = await apRun(x.c, aug?.id);
        await prepMonth(x, "2031-09");
        const sep = await runOf(x.c, "2031-09");
        const ap3 = await apRun(x.c, sep?.id);
        const set = await settled(x.s);
        const ok = (!s0 || (s0.ok && s0.value?.created === 0 && codes(s0, "wait") === "MISSING")) && ap1?.ok === false && ap1?.note === T.runSync && s1.ok && s1.value?.created === 1 && d0?.amountSatang === 3125 && ap2?.ok === true && ap3?.ok === true && set === 3125;
        all = all && ok;
        res.push(`${key}:${s0 ? `${shown(s0)}/${codes(s0, "wait")} ` : ""}${short(ap1, 40)} ${shown(s1)} ${short(ap2, 20)} ${short(ap3, 20)} settled=${set}`);
      }
      ck("S8.19", { both: all }, "never-pulled month refused · settled 3,125", res.join(" | "));
    }
    // S8.20 — H2.11 inbox: decideAdjustmentAs → decideAdjustment ⇒ same H3.2 lock + stale gate as the payroll page
    {
      const x = SC3.T;
      const asInbox = (id: string | undefined) => (typeof pay.decideAdjustmentAs === "function" ? pay.decideAdjustmentAs(x.c, Vw.owner, id ?? "∅", "APPROVED").catch((e: unknown) => ({ ok: false, reason: errText(e) })) : Promise.resolve({ ok: false, reason: "∅decideAdjustmentAs" }));
      await savePol(x.c, Vw.owner, { enabled: true });
      await build(x.c);
      await sync(x.c, Vw.owner);
      const d0 = await firstDed(x.s);
      await corr(x, "09:10");
      const a1 = await asInbox(d0?.id);
      const st1 = (await P.hrPayAdjustment.findUnique({ where: { id: d0?.id ?? "∅" } }))?.status;
      await build(x.c);
      const s1 = await sync(x.c, Vw.owner);
      const q = await pendOf(x.s);
      const a2 = await asInbox(q?.id);
      const st2 = (await P.hrPayAdjustment.findUnique({ where: { id: q?.id ?? "∅" } }))?.status;
      ck("S8.20", { stale: a1?.ok === false && a1?.reason === T.stale && st1 === "PENDING", resync: s1.ok && s1.value?.rejected === 1 && q?.amountSatang === 1041, ok: a2?.ok === true && st2 === "APPROVED" }, "inbox = same gate", `${short(a1, 60)} ${st1} ${shown(s1)} ${short(a2, 30)} ${st2}`);
    }
  }
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
  const MINE = ["HrAttendanceDeduction", "HrWorkEntry", "HrWorkDay", "HrAttendanceAlert", "HrAttendanceDay"];
  const exists = async (t: string) => !!(await fx.rawRows(`SELECT to_regclass($1)::text AS r`, `"${t}"`))?.[0]?.r;
  for (const tid of fx.tenants) for (const t of MINE) if (await exists(t)) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid).catch(() => null);
  await cleanupFx(P, fx, SLUG);
  const left = await residueOf(P, fx, SLUG, SLUG_PREFIX);
  for (const tid of fx.tenants)
    for (const t of MINE) {
      if (!(await exists(t))) continue; // ตารางยังไม่มี (ก่อน migration) = ไม่มีของเหลือ
      const r = await fx.rawRows(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid);
      if (!r || Number(r[0]?.n) !== 0) left.push(`${t}=${r?.[0]?.n ?? "?"}`);
    }
  chk("Z1", left.length === 0, "none", left.join() || "clean");
}
process.exit(finish({ forced: FORCE, crashed, missing: skipReasons }));
