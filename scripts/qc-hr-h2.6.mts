// QC — HR V2 · H2.6 — time corrections: request → approval → void history · POS evidence (Mig) · brief ledger/hr-briefs/hr-brief-H2.6.md (R1–R12 · §3 · Q defaults)
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// API fixed by the brief (R3 R4 R7 R9 R11); actor/viewer = vOf(user); 2032 dates + opts.now; new columns read via raw SELECT * only.
// r2 (controller fix round): ORACLE-EDIT S1.2 (follow-up migration 20270101000001 drops the duplicate pending_target_key · adds selfApplied) ·
//   S3.4/S7.3 (stored evidence snapshot carries unitId per shift · DTO filters by viewer branch) · S4.5 (D+1 row must still exist) ·
//   S7.1 ITEM_KEYS + selfApplied (ruling Q4) · new S11.1 S11.2 S7.5 S7.6 S6.2
// SKIP while correction.ts absent · QC_FORCE=1 · --list · base env QC_H26_BASE (default e209390e7). Fixtures `qc-hr-h26-<stamp>` (+-chain, -other).
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h2.6.mts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  type Any, type Def, type Sev, type Base, type Who, ROOT, rd, short, errText, srt, stripComments, sha, dbDate, sleep, tagOf,
  PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, fileAt, diffHunks, srcFiles, holdAdvisory, makeRegistry, qc4Env, makeFixtures, cleanupFx, residueOf, vOf, canon, keysDeep, loadOpt, modState as st, flat, jsonOf, spawnTsx,
} from "./qc-hr-lib.mjs";

const SUITE = "qc-hr-h2.6";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-h26-";
// ORACLE-EDIT (controller, 12 Nov): default base = merge-base with origin/session/hr (iso.sh drops env, so the control run cannot pass QC_H26_BASE; the hard-coded pre-H4.1 SHA counted H4.1's hunks as unmarked)
const BASE = process.env.QC_H26_BASE || (() => { try { return execFileSync("git", ["merge-base", "HEAD", "origin/session/hr"], { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return "e209390e78bdd6ac5ec4b53251dd8c3786641b1d"; } })();
const H = "src/lib/modules/hr/";
const F = {
  rules: `${H}correction-rules.ts`, corr: `${H}correction.ts`, acts: `${H}correction-actions.ts`, ui: `${H}correction-ui.tsx`, ev: "src/lib/hr-pos-evidence.ts",
  mig: "prisma/migrations/20270101000000_hr_time_correction/migration.sql", mig2: "prisma/migrations/20270101000001_hr_time_correction_idx/migration.sql", schema: "prisma/schema/hr.prisma", eff: "src/lib/approval-effects.ts",
  apSvc: "src/lib/modules/approval/service.ts", apLab: "src/lib/modules/approval/labels.ts", apAct: "src/lib/modules/approval/actions.ts",
  cons: "src/lib/outbox-consumers.ts", auto: "src/lib/automation/labels.ts", hooks: "src/lib/webhooks/labels.ts", page: "src/app/app/sys/[id]/hr/attendance/page.tsx",
  attUi: `${H}attendance-ui.tsx`, th: "src/messages/th/common.json", en: "src/messages/en/common.json", inv: "scripts/hr-ui-inventory.json",
};
const MARK = "HR H2.6";
const FROZEN = ["payroll.ts", "payroll-rules.ts", "payroll-rules-v2.ts", "rules.ts", "pos-seam.ts", "roster.ts", "roster-rules.ts", "swap.ts", "swap-rules.ts", "leave.ts", "leave-rules.ts", "holidays.ts", "time-rules.ts", "clock-rules.ts", "judge-rules.ts", "privacy.ts", "privacy-shared.ts", "pin.ts", "lifecycle.ts", "scope.ts", "settings.ts"].map((f) => H + f);
const HUNKS = [`${H}clock.ts`, `${H}judge.ts`, `${H}service.ts`, `${H}pos-seam-read.ts`, `${H}index.ts`, F.apSvc, F.apLab, F.apAct, F.eff, F.cons, F.auto];
const SHAS: Record<string, string> = { [PAYROLL_RULES_FILE]: PAYROLL_RULES_SHA, [`${H}rules.ts`]: "edbeb819c3e3fc7d3da28ca7513c71f3168e9d53bae29eabbbe1cd96f36a1fa8", [`${H}pos-seam.ts`]: "9e7bc4ef89815aecd21c980bc262c7bbb4618b68d903d950ab2f25d2f2c575b8" };
const T = {
  reason: "ใส่เหตุผลที่ขอแก้เวลา (3–200 ตัวอักษร)", badInput: "ข้อมูลคำขอแก้เวลาไม่ครบ — เลือกชนิดและเวลาอีกครั้ง", empNf: "ไม่พบพนักงานคนนี้ หรือคุณไม่มีสิทธิ์ยื่นแทน",
  targetNf: "ไม่พบการลงเวลานี้ หรือถูกแก้ไปแล้ว — กรุณารีเฟรช", future: "เวลาที่ขอต้องไม่เกินเวลาปัจจุบัน", tooOld: "ขอแก้เวลาย้อนหลังได้ไม่เกิน 35 วัน — ติดต่อผู้จัดการ",
  outOfEmployment: "วันที่ขอแก้อยู่นอกช่วงการจ้างงาน", paid: "เดือนนี้อนุมัติเงินเดือนแล้ว — แก้เวลาย้อนหลังไม่ได้", dupPending: "มีคำขอแก้เวลารายการนี้รออนุมัติอยู่แล้ว — ยกเลิกคำขอเดิมก่อน",
  tooMany: "มีคำขอแก้เวลารออนุมัติครบ 5 รายการแล้ว — รอผลก่อนยื่นเพิ่ม", order: "ลำดับเข้า–พัก–ออกงานไม่ถูกต้องหลังแก้ — ตรวจชนิดและเวลาอีกครั้ง",
  tooLong: "ช่วงเข้างานถึงออกงานยาวเกิน 16 ชั่วโมง — ตรวจเวลาอีกครั้ง", dup: "มีการลงเวลาในนาทีเดียวกันอยู่แล้ว", same: "เวลาที่ขอเท่ากับเวลาเดิม", noPerm: "คุณไม่มีสิทธิ์ตัดสินคำขอแก้เวลา",
  stale: "คำขอนี้ถูกตัดสินหรือยกเลิกไปแล้ว — กรุณารีเฟรช", inChain: "คำขอนี้อยู่ในสายอนุมัติ — ตัดสินที่หน้าอนุมัติ", notOwn: "ยกเลิกได้เฉพาะคำขอที่คุณยื่นหรือคำขอของคุณเอง",
  detailNo: "ไม่พบคำขอแก้เวลานี้ หรือคุณไม่มีสิทธิ์ดู", recomputeReason: "แก้เวลาตามคำขอที่อนุมัติ", nPending: "คำขอแก้เวลารออนุมัติ", nApproved: "คำขอแก้เวลาได้รับอนุมัติ",
  nRejected: "คำขอแก้เวลาไม่ได้รับอนุมัติ", nCancelled: "คำขอแก้เวลาถูกยกเลิก — ข้อมูลการลงเวลาเปลี่ยนไป",
  period: "การแก้เวลานี้กระทบงวดเงินเดือนที่ปิดแล้วหรือล็อกไม่ได้ — ติดต่อผู้ดูแลเงินเดือน", // r3 (controller): PERIOD has its own text
};
const X = { mNoEmp: "บัญชีของคุณยังไม่ได้ผูกกับรายชื่อพนักงาน — ลงเวลาที่เครื่องหน้าร้าน หรือขอให้ผู้ดูแลผูกบัญชี", mInactive: "สถานะพนักงานของคุณปิดอยู่ — ติดต่อผู้จัดการ", self: "อนุมัติคำขอของตัวเองไม่ได้ — ให้ผู้อนุมัติคนอื่นตัดสิน", otherBranch: "พนักงานคนนี้อยู่สาขาอื่น — คุณจัดการได้เฉพาะสาขาของคุณ" };
const RULES = { BACK_DAYS: 35, MAX_PENDING: 5, REPEAT_AT: 3, REASON_MIN: 3, REASON_MAX: 200, DEDUPE_SEC: 60 };
const EV = "hr.attendance.corrected";
const EV_LABEL = "เมื่อแก้เวลาลงงาน (HR)";
const ITEM_KEYS = "action,createdAt,day,decidedAt,employeeId,employeeName,evidence,filedOnBehalf,id,kind,originalAt,periodCount,proposedAt,reason,repeat,selfApplied,status"; // ORACLE-EDIT r2 (ruling Q4): + selfApplied
const EV_KEYS = "action,attendanceId,correctionId,day,employeeId,kind,resultAttendanceId,systemId";
const FORBID = ["lat", "lng", "accuracyM", "photoKey", "deviceId", "distanceM", "inRadius", "note", "pinCode", "pinHash", "baseSalarySatang", "nationalId", "linkedUserId", "floatSatang", "expectedCashSatang", "countedCashSatang", "overShortSatang"];
const TESTIDS = ["hr-corr-form", "hr-corr-action", "hr-corr-kind", "hr-corr-time", "hr-corr-reason", "hr-corr-submit", "hr-corr-list", "hr-corr-card-", "hr-corr-approve-", "hr-corr-reject-", "hr-corr-cancel-", "hr-corr-evidence-", "hr-corr-repeat-", "hr-att-view-corr"];

// == registry ==
const D = (id: string, g: string, sev: Sev, base: Base, title: string): Def => [`H2.6-${id}`, g, sev, base, title] as const;
const d = (id: string, g: string, sev: Sev, title: string) => D(id, g, sev, "RED", title);
const [C, M] = ["CRITICAL", "MAJOR"] as const;
const CHECKS: readonly Def[] = [
  d("S1.1", "R1", C, "[static] files · pure rules"),
  d("S1.2", "R2", C, "[static+db] migration · schema · live columns/indexes · only migration"),
  d("S1.3", "R2", C, "[static] readers filter voidedAt · no other reader · sole writer"),
  d("S1.4", "R7", C, "[static] approval wiring (effect · label · allowlist · self-check · facade)"),
  d("S1.5", "R12", M, "[static+runtime] consumer · one label · not webhooks"),
  d("S1.6", "§5", M, "[static] actions · self has no employeeId · no now: · testids · inventory · messages"),
  D("S1.7", "R1", C, "GREEN", "[control] frozen files unchanged · shas"),
  D("S1.8", "R1", C, "GREEN", "[control] every hot-file hunk vs base marked HR H2.6"),
  d("S2.1", "R3", M, "[pure] rules + texts literal"),
  d("S2.2", "R3", M, "[pure] cleanCorrectionReason"),
  d("S2.3", "R3", C, "[pure] checkCorrection V1–V16"),
  d("S2.4", "R3", C, "[pure] sessionDayOf W1–W6"),
  d("S3.1", "R4", C, "[db] request refusals · nothing written · 35-day boundary"),
  d("S3.2", "R4", C, "[db] self: unlinked · inactive · foreign employee/row"),
  d("S3.3", "R6", C, "[db] on-behalf gate matrix · filedOnBehalf"),
  d("S3.4", "R4", C, "[db] PENDING row literal · evidence · no write · no chain"),
  d("S3.5", "R10", M, "[db] dupPending ×2 · tooMany"),
  d("S3.6", "R3", C, "[db] ORDER · TOO_LONG · DUP · SAME at request"),
  d("S4.1", "R5", C, "[db] ADD OUT applied · stored ON_TIME W490 v2"),
  d("S4.2", "R2", C, "[db] CHANGE IN: original voided intact · replacement ON_TIME · W482"),
  d("S4.3", "R2", C, "[db] VOID duplicate IN · W482"),
  d("S4.4", "R2", C, "[db] readers exclude voided rows"),
  d("S4.5", "R5", C, "[db] overnight OUT belongs to D"),
  d("S4.6", "R2", M, "[db] kiosk originals · timesOverridden W365"),
  d("S4.7", "R5", C, "[db] orphaned stored row · one row W490"),
  d("S4.8", "R7", C, "[db] reject ⇒ rows byte-identical"),
  d("S4.9", "R6", M, "[db] cancel: notOwn · filer · then stale"),
  d("S4.10", "R6", C, "[db] decider gates"),
  d("S5.1", "R4", C, "[db] chain request in tx · inChain · reject"),
  d("S5.2", "R6", C, "[db] core self-decision refused"),
  d("S5.3", "R7", C, "[db] core approve + effect ×2 once"),
  d("S5.4", "R5", C, "[db] chain apply after target voided ⇒ CANCELLED TARGET"),
  d("S5.5", "R6", M, "[db] employee cancels chained request"),
  d("S6.1", "R4", C, "[db] owner-auto with a policy"),
  d("S7.1", "R9", C, "[db] detail keys · viewer matrix · values"),
  d("S7.2", "R12", C, "[db] reason never in audit/outbox/notifications"),
  d("S7.3", "R11", C, "[db] POS evidence literal · never decides"),
  d("S7.4", "R9", M, "[db] periodCount/repeat · lists scoped"),
  d("S8.1", "R12", C, "[db] one event per apply · payload · replay"),
  d("S8.2", "R12", M, "[db] notification recipients/titles"),
  d("S9.1", "R8", C, "[race] payroll APPROVED meanwhile ⇒ paid"),
  d("S9.2", "R8", C, "[race] two deciders ⇒ one apply"),
  d("S9.3", "R8", C, "[race] kiosk punch meanwhile ⇒ dup"),
  d("S9.4", "R10", C, "[race] 5 parallel requests ⇒ 1 PENDING"),
  d("S9.5", "R7", C, "[race] effect ×3 ⇒ one apply"),
  d("S10.1", "R4", C, "[db] ENDED employee"),
  d("S11.1", "R8", C, "[db] paid by session-owning day: IN moved into a paid month ⇒ later OUT fix refused, Feb untouched"),
  d("S11.2", "R8", C, "[db] overnight OUT in a paid month for an open-month session ⇒ accepted, nothing written to April"),
  d("S11.3", "R8", C, "[db] already-stale neighbour in a paid month does not block an unrelated next-day correction"),
  d("S7.5", "R11", C, "[db] evidence: only this user's open/close times · DTO branch-scoped"),
  d("S7.6", "R9", M, "[db] listCorrections complete for a narrow-scope manager (branch filter in the query)"),
  d("S6.2", "Q4", M, "[db] owner self-filing applies at once · selfApplied on record + audit"),
  d("X2.1", "X2", C, "[db] other tenant/system raw ids"),
  D("X12.1", "X12", M, "GREEN", "[control] fitness ± env"),
  D("Z1", "-", C, "GREEN", "[control] residue none"),
];
const REG = makeRegistry(SUITE, "H2.6-", CHECKS);
const chk = (id: string, ok: unknown, e: unknown, a: unknown) => REG.chk(id, ok, e, a);
const ck = (id: string, r: Record<string, unknown>, e: string, extra = "") => chk(id, Object.values(r).every(Boolean), e, `${Object.entries(r).filter(([, v]) => !v).map(([k]) => k).join(",") || "all"}${extra ? ` · ${extra}` : ""}`);
if (ARGV.includes("--list")) {
  REG.printList();
  process.exit(0);
}
async function guard(ids: string[], f: () => Promise<void>): Promise<void> {
  try {
    await f();
  } catch (e) {
    for (const id of ids) if (!REG.results.has(`H2.6-${id}`)) chk(id, false, "ran", `block threw: ${errText(e).slice(0, 120)}`);
  }
}

// == static ==
const code = (p: string) => stripComments(rd(p));
const git = (a: string[]) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
const atBase = (p: string) => fileAt(BASE, p);
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
function runStatic(): void {
  const rules = rd(F.rules);
  ck("S1.1", {
    files: [F.rules, F.corr, F.acts, F.ui, F.ev].every((p) => existsSync(join(ROOT, p))),
    pure: !!rules && !/from\s+["']@\/lib\/core\/db["']|@prisma\/client["']|tenantDb|\bprisma\b|Date\.now\(|new Date\(\s*\)/.test(stripComments(rules)),
  }, "5 files · pure rules");
  const mig = rd(F.mig);
  const sc = rd(F.schema);
  const migs = (() => {
    try {
      return git(["diff", "--name-only", BASE, "--", "prisma/migrations"]).split("\n").filter(Boolean);
    } catch {
      return ["git?"];
    }
  })();
  S12.stat = {
    enum: /CREATE TYPE "HrCorrectionAction" AS ENUM \('ADD', 'CHANGE', 'VOID'\)/.test(mig),
    att: ["voidedAt\" TIMESTAMP(3)", "voidedByCorrectionId\" TEXT", "correctionId\" TEXT"].every((c) => mig.includes(c)) && /ALTER TABLE "HrAttendance"/.test(mig),
    corr: /ALTER TABLE "HrTimeCorrection"/.test(mig) && /"action" "HrCorrectionAction" NOT NULL DEFAULT 'ADD'/.test(mig) && /"day" DATE/.test(mig),
    uniq: /CREATE UNIQUE INDEX "HrTimeCorrection_pending_target_key"[^;]*\("attendanceId"\)[^;]*WHERE[^;]*'PENDING'/.test(mig) && /CREATE UNIQUE INDEX "HrTimeCorrection_pending_add_key"[^;]*\("employeeId", ?"day", ?"kind"\)[^;]*WHERE[^;]*'PENDING'[^;]*'ADD'/.test(mig),
    schema: /enum HrCorrectionAction \{\s*ADD\s+CHANGE\s+VOID\s*\}/.test(sc) && /voidedAt\s+DateTime\?/.test(sc) && /voidedByCorrectionId\s+String\?/.test(sc) && /correctionId\s+String\?/.test(sc) && /action\s+HrCorrectionAction/.test(sc),
    only: atBase(F.corr) !== null || migs.every((p) => p.startsWith("prisma/migrations/20270101000000_hr_time_correction/") || p.startsWith("prisma/migrations/20270101000001_hr_time_correction_idx/")), // ORACLE-EDIT r2 · controller 12 Nov: n/a once H2.6 is in the base (later WOs add migrations)
    // ORACLE-EDIT r2 (controller item 6): follow-up migration drops the duplicate pending_target_key (= H1.2 attendanceId_pending_key) · adds selfApplied (Q4 ruling)
    mig2: /DROP INDEX[^;]*"HrTimeCorrection_pending_target_key"/.test(rd(F.mig2)) && /"selfApplied" BOOLEAN NOT NULL DEFAULT false/.test(rd(F.mig2)) && /selfApplied\s+Boolean\s+@default\(false\)/.test(sc),
  };
  // S1.3 readers
  const cl = code(`${H}clock.ts`), jg = code(`${H}judge.ts`), sv = code(`${H}service.ts`), pr = code(`${H}pos-seam-read.ts`);
  const allowed = new Set([`${H}clock.ts`, `${H}judge.ts`, `${H}service.ts`, `${H}pos-seam-read.ts`, F.corr]);
  const readers: string[] = [];
  const writers: string[] = [];
  for (const p of srcFiles("src")) {
    const s = code(p);
    if (/\bhrAttendance\.(findMany|findFirst|findUnique|findFirstOrThrow|count|aggregate|groupBy)\(/.test(s) && !allowed.has(p)) readers.push(p);
    if (p !== F.corr && /modules\/hr\/|\/hr\/|^src\/lib\/[^/]+\.ts$/.test(p) && (/hrTimeCorrection\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/.test(s) || /voidedAt:\s*(?!null)[^\s,}]/.test(s) || /(INSERT INTO|UPDATE)\s+"HrTimeCorrection"/.test(s))) writers.push(p);
  }
  ck("S1.3", {
    clock: count(cl, /voidedAt:\s*null/g) >= 2, judge: count(jg, /voidedAt:\s*null/g) >= 1, service: count(sv, /voidedAt:\s*null/g) >= 3, posRead: count(pr, /voidedAt:\s*null/g) >= 2,
    noOtherReader: readers.length === 0, soleWriter: writers.length === 0 && /voidedAt/.test(code(F.corr)),
  }, "filters · sole writer", `readers=${readers.join(",") || "-"} writers=${writers.join(",") || "-"}`);
  const eff = code(F.eff);
  ck("S1.4", {
    effect: /entityType === "HrTimeCorrection"/.test(eff) && /applyCorrectionDecision\(/.test(eff),
    label: /value:\s*"HrTimeCorrection"/.test(code(F.apLab)), allow: /"HrTimeCorrection"/.test(code(F.apAct)),
    own: /req\.entityType === "HrTimeCorrection"/.test(code(F.apSvc)),
    facade: /applyCorrectionDecision/.test(code(`${H}index.ts`)),
  }, "effect · label · allowlist · self-check · facade");
  const auto = stripComments(rd(F.auto));
  S15.stat = {
    consumer: new RegExp(`["']${EV.replace(/\./g, "\\.")}["']\\s*:\\s*withAutomation\\(`).test(code(F.cons)),
    label: [...auto.matchAll(/value:\s*["']hr\.attendance\.corrected["']\s*,\s*label:\s*["']([^"']*)["']/g)].map((m) => m[1]).join("|") === EV_LABEL && auto.split(EV).length === 2,
    noHook: !rd(F.hooks).includes(EV),
  };
  const acts = rd(F.acts);
  const selfBody = (() => {
    const i = acts.indexOf("requestMyCorrectionAction");
    return i < 0 ? "" : acts.slice(i, acts.indexOf("\nexport", i + 10) > 0 ? acts.indexOf("\nexport", i + 10) : undefined);
  })();
  const ui = rd(F.ui) + rd(F.attUi) + rd(F.page);
  const inv = rd(F.inv);
  const msg = (p: string) => Object.keys(flat(jsonOf(p)?.hr?.correction ?? {})).sort().join(",");
  ck("S1.6", {
    useServer: /^\s*["']use server["']/.test(acts) && /requireTenant\(/.test(acts),
    actions: ["requestMyCorrectionAction", "requestCorrectionForAction", "decideCorrectionAction", "cancelCorrectionAction"].every((n) => new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(acts)),
    selfNoId: !!selfBody && !/employeeId/.test(stripComments(selfBody)),
    noNow: ![acts, rd(F.ui), rd(F.page)].some((s) => /\bnow:\s/.test(stripComments(s))),
    testids: TESTIDS.every((t) => ui.includes(t)), inventory: TESTIDS.every((t) => inv.includes(t)),
    messages: msg(F.th).length > 0 && msg(F.th) === msg(F.en),
  }, "actions · testids · inventory · messages");
  // controls
  const inBase = atBase(F.corr) !== null;
  let fr = "n/a";
  if (!inBase) {
    const ch = (() => {
      try {
        return git(["diff", "--name-only", BASE, "--", ...FROZEN]);
      } catch (e) {
        return `git ${errText(e).slice(0, 40)}`;
      }
    })();
    fr = ch ? `changed: ${ch.replace(/\n/g, ",")}` : "ok";
  }
  const shaBad = Object.entries(SHAS).filter(([p, h]) => sha(rd(p)) !== h).map(([p]) => p.split("/").pop());
  chk("S1.7", (fr === "ok" || fr === "n/a") && !shaBad.length, "unchanged · shas", `${fr} · sha bad=${shaBad.join(",") || "-"} (base ${BASE.slice(0, 9)})`);
  // every changed hunk vs base carries the marker on an added line (modified lines allowed) · approval-effects ≤ 1 hunk
  const hk = inBase ? ["n/a"] : HUNKS.map((p) => {
    const hs = diffHunks(BASE, p);
    if (hs === null) return `git ${p}`;
    const bad = hs.filter((h) => !h.added.some((l) => l.includes(MARK)));
    return !bad.length && (p !== F.eff || hs.length <= 1) ? "ok" : `${p.split("/").pop()} unmarked=${bad.length} hunks=${hs.length}`;
  });
  const bad = hk.filter((x) => x !== "ok" && x !== "n/a");
  chk("S1.8", bad.length === 0, "every hunk marked", bad.join(" · ") || hk[0]);
}
const S12: { stat: Record<string, boolean> } = { stat: {} };
const S15: { stat: Record<string, boolean> } = { stat: {} };

// == SKIP guard + modules ==
const skipReasons = existsSync(join(ROOT, F.corr)) ? [] : [`H2.6 not built: ${F.corr} absent`];
if (skipReasons.length && !FORCE) REG.skipExit(skipReasons);
const { P, coreHash } = await qc4Env(SUITE);
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — running although: ${skipReasons.join(" · ")} (expect RED for the right reason, no crash)`);
const okMod = (m: Any) => (m && !m.__err ? m : {});
const mods = {
  rules: await loadOpt(F.rules, "@/lib/modules/hr/correction-rules"), corr: await loadOpt(F.corr, "@/lib/modules/hr/correction"), ev: await loadOpt(F.ev, "@/lib/hr-pos-evidence"),
  judge: (await import("@/lib/modules/hr/judge")) as Any, svc: (await import("@/lib/modules/hr/service")) as Any, posRead: (await import("@/lib/modules/hr/pos-seam-read")) as Any,
  sys: (await import("@/lib/modules/system/service")) as Any, ap: (await import("@/lib/modules/approval/service")) as Any, eff: (await import("@/lib/approval-effects")) as Any,
  cons: (await import("@/lib/outbox-consumers" as string).catch((e: unknown) => ({ __err: errText(e) }))) as Any, auto: (await import("@/lib/automation/labels")) as Any,
};
const CR: Any = okMod(mods.rules);
const CM: Any = okMod(mods.corr);
const EVM: Any = okMod(mods.ev);
console.log(`[${SUITE}] modules: correction-rules=${st(mods.rules, F.rules)} · correction=${st(mods.corr, F.corr)} · hr-pos-evidence=${st(mods.ev, F.ev)}`);
async function call(M0: Any, fn: string, ...a: unknown[]): Promise<Any> {
  if (typeof M0?.[fn] !== "function") return { __err: `absent ${fn}` };
  try {
    return await M0[fn](...a);
  } catch (e) {
    return { __err: `THROW ${errText(e)}` };
  }
}
const pure = (fn: string, ...a: unknown[]): Any => {
  try {
    return typeof CR[fn] === "function" ? CR[fn](...a) : `absent ${fn}`;
  } catch (e) {
    return `THROW ${errText(e).slice(0, 50)}`;
  }
};
const said = (r: Any, t: string) => !!r && r.ok === false && r.reason === t;
const shown = (r: Any) => (!r ? "null" : r.__err ? r.__err : r.ok === false ? `"${short(r.reason, 40)}"` : r.ok === true ? `ok/${r.status ?? ""}` : short(r, 40));
const idOf = (r: Any): string => (r && r.ok === true && typeof r.id === "string" ? r.id : "∅");
const bk = (day: string, hm: string) => new Date(`${day}T${hm.length === 5 ? `${hm}:00` : hm}+07:00`);
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));

// == pure vectors ==
const L = (...xs: [string, string, string][]) => xs.map(([id, k, t]) => ({ id, kind: k, at: new Date(t) }));
const Z = (t: string) => `2032-03-02T${t}:00+07:00`;
const CHKV: [string, Any[], Any, string][] = [
  ["V1", L(["a", "IN", Z("08:55")]), { action: "ADD", kind: "OUT", at: new Date(Z("17:05")) }, "ok"],
  ["V2", [], { action: "ADD", kind: "OUT", at: new Date(Z("17:00")) }, "ORDER"],
  ["V3", L(["a", "IN", Z("08:55")]), { action: "ADD", kind: "OUT", at: new Date(Date.parse(Z("08:55")) + 961 * 60_000) }, "TOO_LONG"],
  ["V4", L(["a", "IN", Z("08:55")]), { action: "ADD", kind: "OUT", at: new Date(Date.parse(Z("08:55")) + 960 * 60_000) }, "ok"],
  ["V5", L(["a", "IN", Z("08:55")]), { action: "ADD", kind: "IN", at: new Date("2032-03-02T08:55:30+07:00") }, "DUP"],
  ["V6", L(["a", "IN", Z("08:58")], ["b", "IN", Z("09:30")], ["c", "OUT", Z("17:00")]), { action: "VOID", attendanceId: "b" }, "ok"],
  ["V7", L(["a", "IN", Z("08:55")], ["b", "OUT", Z("12:00")], ["c", "IN", Z("13:00")]), { action: "VOID", attendanceId: "b" }, "ORDER"],
  ["V8", L(["a", "IN", Z("08:55")], ["b", "OUT", Z("17:00")], ["c", "IN", "2032-03-03T08:55:00+07:00"]), { action: "VOID", attendanceId: "b" }, "ok"],
  ["V9", L(["a", "IN", Z("08:55")]), { action: "CHANGE", attendanceId: "a", at: new Date("2032-03-02T08:55:40+07:00") }, "SAME"],
  ["V10", L(["a", "IN", Z("08:55")]), { action: "CHANGE", attendanceId: "zz", at: new Date(Z("08:50")) }, "TARGET"],
  ["V11", L(["a", "IN", Z("09:00")], ["b", "OUT", Z("17:00")]), { action: "ADD", kind: "BREAK_START", at: new Date(Z("12:00")) }, "ok"],
  ["V12", L(["a", "IN", Z("09:00")], ["b", "OUT", Z("17:00")]), { action: "ADD", kind: "BREAK_END", at: new Date(Z("12:30")) }, "ORDER"],
  ["V13", L(["a", "IN", Z("09:00")], ["b", "BREAK_START", Z("12:00")], ["c", "OUT", Z("17:00")]), { action: "ADD", kind: "BREAK_END", at: new Date(Z("12:45")) }, "ok"],
  ["V14", L(["a", "IN", Z("09:00")], ["b", "OUT", Z("17:00")]), { action: "CHANGE", attendanceId: "b", at: new Date("2032-03-03T02:00:00+07:00") }, "TOO_LONG"],
  ["V15", L(["a", "IN", Z("09:00")], ["b", "OUT", Z("17:00")]), { action: "ADD", kind: "IN", at: new Date(Z("08:00")) }, "ORDER"],
  ["V16", L(["a", "IN", "2032-03-01T08:00:00+07:00"]), { action: "ADD", kind: "IN", at: new Date(Z("09:00")) }, "ok"],
];
const DAYV: [string, Any[], string, string, string][] = [
  ["W1", L(["a", "IN", Z("22:00")]), "2032-03-03T06:05:00+07:00", "OUT", "2032-03-02"],
  ["W2", [], "2032-03-03T06:05:00+07:00", "OUT", "2032-03-03"],
  ["W3", L(["a", "IN", Z("08:00")]), "2032-03-03T00:30:00+07:00", "OUT", "2032-03-03"],
  ["W4", [], Z("23:30"), "IN", "2032-03-02"],
  ["W5", L(["a", "IN", Z("22:00")], ["b", "OUT", Z("23:00")]), "2032-03-03T01:00:00+07:00", "OUT", "2032-03-03"],
  ["W6", [], "2032-03-02T17:30:00Z", "IN", "2032-03-03"],
];
function runPure(): void {
  const texts = CR.CORRECTION_TEXT ?? {};
  ck("S2.1", { rules: canon(CR.CORRECTION_RULES) === canon(RULES), texts: Object.entries(T).every(([k, v]) => texts[k] === v), period: pure("applyCodeText", "PERIOD") === T.period }, "literals", `bad=${Object.keys(T).filter((k) => texts[k] !== (T as Any)[k]).slice(0, 4).join(",")}`);
  const big = "ก".repeat(200);
  const rv: [unknown, string | null][] = [["  ลืมกดออก  ", "ลืมกดออก"], ["ab", null], ["", null], [123, null], [big, big], [`${big}ก`, null], ["😀😀😀", "😀😀😀"], ["  a b ", "a b"]];
  const rbad = rv.filter(([i, o]) => pure("cleanCorrectionReason", i) !== o).map(([i]) => short(i, 8));
  chk("S2.2", !rbad.length, `${rv.length} vectors`, rbad.join(" · ") || "all");
  const out = (r: Any) => (typeof r === "string" ? r : r?.ok === true ? "ok" : r?.ok === false ? String(r.code) : short(r, 20));
  const cbad = CHKV.filter(([, live, op, want]) => out(pure("checkCorrection", live, op)) !== want).map(([id, live, op]) => `${id}=${out(pure("checkCorrection", live, op))}`);
  chk("S2.3", !cbad.length, `${CHKV.length} vectors`, cbad.slice(0, 5).join(" · ") || "all");
  const dbad = DAYV.filter(([, live, at, k, want]) => pure("sessionDayOf", live, new Date(at), k) !== want).map(([id, live, at, k]) => `${id}=${pure("sessionDayOf", live, new Date(at), k)}`);
  chk("S2.4", !dbad.length, `${DAYV.length} vectors`, dbad.slice(0, 4).join(" · ") || "all");
}

// == fixtures ==
const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const SLUG = `${SLUG_PREFIX}${stamp}`;
const tag = tagOf(stamp);
const fx = makeFixtures(P, coreHash, SLUG);
const SECRET = `ลับ-${tag}`;
const RS = (s: string) => `${s} ${SECRET}`;
const NOW = bk("2032-03-20", "12:00");
const opt = { now: NOW };
const PUB = new Date("2032-02-01T00:00:00Z");
const rows = async (sql: string, ...p: unknown[]) => (await fx.rawRows(sql, ...p)) ?? [];
const attOf = (emp: string) => rows(`SELECT * FROM "HrAttendance" WHERE "employeeId" = $1 ORDER BY "at", "id"`, emp);
const liveOf = async (emp: string) => (await attOf(emp)).filter((r: Any) => !r.voidedAt);
const corrOf = async (id: string) => (await rows(`SELECT * FROM "HrTimeCorrection" WHERE "id" = $1`, id))[0] ?? null;
const corrsOf = (tid: string) => rows(`SELECT * FROM "HrTimeCorrection" WHERE "tenantId" = $1 ORDER BY "createdAt", "id"`, tid);
const dayOf = (emp: string, day: string) => rows(`SELECT * FROM "HrAttendanceDay" WHERE "employeeId" = $1 AND "date" = $2::date ORDER BY "slotKey"`, emp, day);
const noTime = (o: Any) => (o ? Object.fromEntries(Object.entries(o).filter(([k]) => !["voidedAt", "voidedByCorrectionId"].includes(k))) : o);
const evsOf = (tid: string) => P.outboxEvent.findMany({ where: { tenantId: tid, type: EV } }) as Promise<Any[]>;
const hold = <R,>(key: string, during: (tx: Any) => Promise<unknown>, fn: () => Promise<R>) => holdAdvisory(P, key, during, fn);

async function runDb(): Promise<void> {
  const TT = await fx.newTenant("", "QC HR H2.6");
  const TB = await fx.newTenant("-chain", "QC HR H2.6 chain");
  const T2 = await fx.newTenant("-other", "QC HR H2.6 other");
  const u1 = await fx.newUnit(TT, `north ${tag}`, "u1");
  await sleep(15);
  const u2 = await fx.newUnit(TT, `south ${tag}`, "u2");
  const ub = await fx.newUnit(TB, `chain ${tag}`, "ub");
  const sys = async (t: string, n: string) => (await mods.sys.createSystem(t, "HR", n)).id as string;
  const [sA, sP, sR, sB, sO] = [await sys(TT, "HR A"), await sys(TT, "HR P"), await sys(TT, "HR R"), await sys(TB, "HR B"), await sys(T2, "HR O")];
  const cA = { tenantId: TT, systemId: sA }, cP = { tenantId: TT, systemId: sP }, cR = { tenantId: TT, systemId: sR }, cB = { tenantId: TB, systemId: sB }, cO = { tenantId: T2, systemId: sO };
  const U: Record<string, Who> = {};
  const K = { "hr.employee.create": true };
  for (const [k, t, role, ua, perm] of [
    ["owner", TT, "OWNER", [], {}], ["mgrU1", TT, "MANAGER", [u1], {}], ["writer", TT, "STAFF", ["*"], K], ["writer2", TT, "STAFF", ["*"], K], ["writerU2", TT, "STAFF", [u2], K],
    ["payroll", TT, "STAFF", ["*"], { "hr.payroll.read": true }], ["member", TT, "STAFF", [], {}], ["self", TT, "STAFF", [], {}], ["selfI", TT, "STAFF", [], {}], ["stray", TT, "STAFF", [], {}],
    ["mgrSelf", TT, "STAFF", ["*"], K], ["ownerB", TB, "OWNER", [], {}], ["mgrB", TB, "MANAGER", ["*"], {}], ["mgrB2", TB, "MANAGER", ["*"], {}], ["writerB", TB, "STAFF", ["*"], K],
    ["selfB", TB, "STAFF", [], {}], ["other", T2, "OWNER", [], {}],
  ] as [string, string, Who["role"], string[], Record<string, boolean>][]) U[k] = await fx.mkUser(t, k.toLowerCase(), `QC ${k} ${tag}`, role, ua, perm);
  const me = (tid: string, s: string, name: string, o: Record<string, unknown> = {}) => fx.mkEmp(tid, s, name, { startDate: "2030-01-01", ...o });
  const E: Record<string, string> = {};
  for (const [k, tid, s, o] of [
    ["e1", TT, sA, { unitId: u1, linkedUserId: U.self!.id }], ["e2", TT, sA, { unitId: u1 }], ["e3", TT, sA, { unitId: u2 }], ["e4", TT, sA, { unitId: u1 }], ["e5", TT, sA, { unitId: u1 }],
    ["e6", TT, sA, { unitId: u1, linkedUserId: U.mgrSelf!.id }], ["e7", TT, sA, { unitId: u1 }], ["eV", TT, sA, { unitId: u1 }], ["eL", TT, sA, { unitId: u1 }],
    ["eI", TT, sA, { unitId: u1, linkedUserId: U.selfI!.id, active: false }], ["eE", TT, sA, { unitId: u1, endDate: "2032-03-05", status: "ENDED", active: false }], ["eE2", TT, sA, { unitId: u1 }],
    ["eK", TT, sA, { unitId: u1 }], ["eT", TT, sA, { unitId: u1 }], ["eX", TT, sA, { unitId: u1 }], ["eP", TT, sP, { unitId: u1 }], ["eR", TT, sR, { unitId: u1 }],
    ["eB", TB, sB, { unitId: ub, linkedUserId: U.selfB!.id }], ["eB2", TB, sB, { unitId: ub, linkedUserId: U.mgrB2!.id }], ["eB3", TB, sB, { unitId: ub }], ["eB4", TB, sB, { unitId: ub }], ["eO", T2, sO, {}],
  ] as [string, string, string, Record<string, unknown>][]) E[k] = await me(tid, s, k === "e1" ? `หนึ่ง ${tag}` : `${k} ${tag}`, o);
  const shift = async (tid: string, s: string, a: number, b: number, cm = false) => (await P.hrShift.create({ data: { tenantId: tid, systemId: s, name: `กะ ${a} ${tag}`, startMin: a, endMin: b, crossesMidnight: cm, graceMin: 15 } })).id as string;
  const SH = { M: await shift(TT, sA, 540, 1020), N: await shift(TT, sA, 1320, 360, true), R: await shift(TT, sR, 540, 1020) };
  const ent = async (emp: string, day: string, sh: string, unitId: string | null, x: Record<string, unknown> = {}, s = sA) => {
    const r = await P.hrShift.findFirst({ where: { id: sh } });
    return (await P.hrRosterEntry.create({ data: { tenantId: TT, systemId: s, employeeId: emp, date: dbDate(day), shiftId: sh, unitId, startMin: r.startMin, endMin: r.endMin, breakMin: 0, crossesMidnight: r.crossesMidnight, published: true, publishedAt: PUB, source: "MANUAL", ...x } })).id as string;
  };
  const att = async (emp: string, kind: string, at: Date, re: string | null, x: Record<string, unknown> = {}, c = cA) =>
    (await P.hrAttendance.create({ data: { ...c, employeeId: emp, kind, at, rosterEntryId: re, source: "KIOSK", ...x } })).id as string;
  const ON = { judgement: "ON_TIME", lateMin: 0, dueMin: 540 };
  const x1 = await ent(E.e1!, "2032-03-02", SH.M, u1);
  const in1 = await att(E.e1!, "IN", bk("2032-03-02", "08:55"), x1, ON);
  const x2 = await ent(E.e2!, "2032-03-03", SH.M, u1);
  const in2 = await att(E.e2!, "IN", bk("2032-03-03", "09:20"), x2, { judgement: "LATE", lateMin: 20, dueMin: 540, lat: 13.75, lng: 100.5, deviceId: `dev-${tag}`, note: `โน้ต ${SECRET}` });
  await att(E.e2!, "OUT", bk("2032-03-03", "17:00"), x2);
  const x2b = await ent(E.e2!, "2032-03-04", SH.M, u1);
  await att(E.e2!, "IN", bk("2032-03-04", "08:58"), x2b, ON);
  const dup2 = await att(E.e2!, "IN", bk("2032-03-04", "09:30"), x2b);
  await att(E.e2!, "OUT", bk("2032-03-04", "17:00"), x2b);
  const x3 = await ent(E.e3!, "2032-03-05", SH.N, u2);
  await att(E.e3!, "IN", bk("2032-03-05", "21:55"), x3, { ...ON, dueMin: 1320 });
  const x4 = await ent(E.e4!, "2032-03-08", SH.M, u1, { endMin: 900, timesOverridden: true });
  const in4 = await att(E.e4!, "IN", bk("2032-03-08", "08:55"), x4, ON);
  await att(E.e4!, "IN", bk("2032-03-09", "06:00"), null);
  const x5 = await ent(E.e5!, "2032-03-10", SH.M, u1);
  await att(E.e5!, "IN", bk("2032-03-10", "08:55"), x5, ON);
  const x6 = await ent(E.e6!, "2032-03-11", SH.M, u1);
  await att(E.e6!, "IN", bk("2032-03-11", "08:55"), x6, ON);
  const x7 = await ent(E.e7!, "2032-03-12", SH.M, u1);
  await att(E.e7!, "IN", bk("2032-03-12", "08:55"), x7, ON);
  const out7 = await att(E.e7!, "OUT", bk("2032-03-12", "09:00"), x7);
  const inV = await att(E.eV!, "IN", bk("2032-03-13", "07:00"), null);
  for (const k of ["eK", "eT", "eX"]) await att(E[k]!, "IN", bk("2032-03-12", "08:55"), await ent(E[k]!, "2032-03-12", SH.M, u1), ON);
  await att(E.eE!, "IN", bk("2032-03-04", "08:55"), await ent(E.eE!, "2032-03-04", SH.M, u1), ON);
  await att(E.eR!, "IN", bk("2032-03-02", "08:55"), await ent(E.eR!, "2032-03-02", SH.R, u1, {}, sR), ON, cR);
  await att(E.eP!, "IN", bk("2032-03-02", "08:55"), null, {}, cP);
  for (const [k, day] of [["eB", "2032-03-02"], ["eB2", "2032-03-02"], ["eB3", "2032-03-03"], ["eB4", "2032-03-03"]]) await att(E[k]!, "IN", bk(day!, "09:00"), null, {}, cB);
  await att(E.eO!, "IN", bk("2032-03-02", "09:00"), null, {}, cO);
  const shiftRow = (no: number, by: string, o: string, c: string | null, closedBy: string | null) =>
    P.posShift.create({ data: { tenantId: TT, unitId: u1, systemId: `qc-pos-${tag}`, deviceId: `qcdev${tag}0000`, shiftNo: no, status: c ? (closedBy ? "CLOSED" : "FORCE_CLOSED") : "OPEN", openedByUserId: by, openedAt: new Date(o), floatSatang: 100000, closedByUserId: closedBy, closedAt: c ? new Date(c) : null, expectedCashSatang: 777, countedCashSatang: 777, overShortSatang: 0 } });
  await shiftRow(7001, U.self!.id, "2032-03-02T08:50:00+07:00", "2032-03-02T17:03:00+07:00", U.self!.id);
  await shiftRow(7002, U.member!.id, "2032-03-02T08:00:00+07:00", "2032-03-02T16:00:00+07:00", U.member!.id);
  await shiftRow(7003, U.self!.id, "2032-03-05T08:00:00+07:00", "2032-03-05T16:00:00+07:00", U.self!.id);
  await shiftRow(7004, U.self!.id, "2032-03-02T18:00:00+07:00", "2032-03-02T23:00:00+07:00", null);
  const EVID = { posShifts: [{ shiftNo: 7001, openedAt: "2032-03-02T01:50:00.000Z", closedAt: "2032-03-02T10:03:00.000Z", forced: false }, { shiftNo: 7004, openedAt: "2032-03-02T11:00:00.000Z", closedAt: "2032-03-02T16:00:00.000Z", forced: true }], deviceLogout: null };
  // ORACLE-EDIT r2 (controller item 2): the stored snapshot carries the shift's unitId (DTO filters by the viewer's branch scope and drops it)
  const EVID_ROW = { posShifts: EVID.posShifts.map((x) => ({ ...x, unitId: u1 })), deviceLogout: null };
  for (const n of ["2032-03-04", "2032-03-06", "2032-03-11"]) await mods.judge.runAttendanceJobs({ now: bk(n, "12:00"), tenantId: TT });
  await P.hrRosterEntry.delete({ where: { id: x5 } }); // e5: stored row of 03-10 becomes orphaned
  await P.hrPayrollRun.create({ data: { tenantId: TT, systemId: sP, periodKey: "2032-03", payDate: new Date("2032-03-31T00:00:00Z"), status: "APPROVED" } });
  const rq = (c: Any, w: Who, input: Any, o: Any = opt) => call(CM, "requestCorrection", c, vOf(w), input, o);
  const dc = (c: Any, w: Who, id: string, decision: string, o: Any = opt) => call(CM, "decideCorrection", c, vOf(w), id, { decision }, o);
  const cc = (c: Any, w: Who, id: string) => call(CM, "cancelCorrection", c, vOf(w), id);
  const det = (c: Any, w: Who, id: string) => call(CM, "correctionDetail", c, vOf(w), id, opt);
  const ADD = (emp: string | undefined, kind: string, day: string, hm: string, why = "ลืมลงเวลา") => ({ action: "ADD", kind, at: bk(day, hm), reason: RS(why), ...(emp ? { employeeId: emp } : {}) });
  const notes = async (uid: string, title: string) => (await P.appNotification.findMany({ where: { recipientUserId: uid, title } })) as Any[];

  // ── S3.4 · S7.3 · S8.2 · S4.1 (e1 self ADD OUT) ──
  const att1 = await attOf(E.e1!);
  const r1 = await rq(cA, U.self!, ADD(undefined, "OUT", "2032-03-02", "17:05", "ลืมกดออก รีบไปรับลูก"));
  const c1 = idOf(r1);
  const k1 = await corrOf(c1);
  const pendTo = async (uid: string) => (await notes(uid, T.nPending)).length;
  const deciders = [U.owner!, U.writer!, U.writer2!, U.mgrSelf!];
  const nonDec = [U.self!, U.mgrU1!, U.writerU2!, U.payroll!, U.member!];
  const pn = { dec: await Promise.all(deciders.map((w) => pendTo(w.id))), non: await Promise.all(nonDec.map((w) => pendTo(w.id))) };
  await guard(["S3.4"], async () => {
    ck("S3.4", {
      result: r1?.ok === true && r1.status === "PENDING" && r1.requestId === null,
      row: !!k1 && k1.action === "ADD" && k1.kind === "OUT" && iso(k1.day)?.slice(0, 10) === "2032-03-02" && iso(k1.proposedAt) === "2032-03-02T10:05:00.000Z" && k1.originalAt === null && k1.attendanceId === null && k1.requestedByUserId === U.self!.id && k1.status === "PENDING" && k1.reason === RS("ลืมกดออก รีบไปรับลูก") && k1.employeeId === E.e1 && k1.systemId === sA,
      evidence: !!k1 && canon(k1.evidenceJson) === canon(EVID_ROW),
      noWrite: canon(await attOf(E.e1!)) === canon(att1), noChain: (await P.approvalRequest.count({ where: { entityId: c1 } })) === 0,
    }, "pending row", shown(r1));
  });
  const ev1 = await call(EVM, "posShiftEvidence", { tenantId: TT, userId: U.self!.id, from: bk("2032-03-02", "00:00"), to: bk("2032-03-03", "12:00") });
  const ev1o = await call(EVM, "posShiftEvidence", { tenantId: T2, userId: U.self!.id, from: bk("2032-03-02", "00:00"), to: bk("2032-03-03", "12:00") });
  const keep1 = await dayOf(E.e1!, "2032-03-02");
  const a1 = await dc(cA, U.writer!, c1, "APPROVED");
  const k1b = await corrOf(c1);
  const live1 = await liveOf(E.e1!);
  const new1 = live1.find((r: Any) => r.correctionId === c1);
  const day1 = (await dayOf(E.e1!, "2032-03-02"))[0];
  await guard(["S4.1", "S7.3"], async () => {
    ck("S4.1", {
      decided: a1?.ok === true && a1.status === "APPROVED" && k1b?.status === "APPROVED" && k1b?.decidedById === U.writer!.id && k1b?.resultAttendanceId === new1?.id,
      newRow: !!new1 && new1.kind === "OUT" && iso(new1.at) === "2032-03-02T10:05:00.000Z" && new1.source === "CORRECTION" && new1.rosterEntryId === x1 && new1.note === null && new1.lat === null && new1.deviceId === null && new1.voidedAt === null,
      original: canon(noTime((await attOf(E.e1!)).find((r: Any) => r.id === in1))) === canon(noTime(att1[0])) && !att1[0]?.voidedAt && live1.length === 2,
      stored: keep1.length === 1 && !!day1 && day1.status === "ON_TIME" && day1.workedMin === 490 && day1.missingOut === false && day1.outAttendanceId === new1?.id && day1.version === 2 && day1.recomputedById === U.writer!.id && day1.recomputeReason === T.recomputeReason,
    }, "applied · stored v2", `${shown(a1)} day=${day1 ? `${day1.status}/W${day1.workedMin}/v${day1.version}` : "∅"}`);
    ck("S7.3", {
      fn: Array.isArray(ev1) && canon(ev1) === canon(EVID_ROW.posShifts), tenant: Array.isArray(ev1o) && ev1o.length === 0,
      noCash: !!k1 && !keysDeep(k1.evidenceJson ?? {}).has("countedCashSatang") && !JSON.stringify(k1.evidenceJson ?? {}).includes("777"),
      notAuto: r1?.status === "PENDING", stillApplied: k1b?.status === "APPROVED",
    }, "evidence", short(ev1, 60));
  });
  const appr1 = await notes(U.self!.id, T.nApproved);

  // ── e2 CHANGE (manager files, owner decides) · VOID dup · BREAK pending ──
  const att2 = await attOf(E.e2!);
  const pre = { mm: await mods.svc.monthlyMinutes(cA, E.e2, new Date("2032-03-01T00:00:00Z")) };
  const r2 = await rq(cA, U.mgrU1!, { action: "CHANGE", attendanceId: in2, at: bk("2032-03-03", "08:58"), reason: RS("กดผิดเวลา"), employeeId: E.e2 });
  const c2 = idOf(r2);
  const a2 = await dc(cA, U.owner!, c2, "APPROVED");
  const r3 = await rq(cA, U.writer!, { action: "VOID", attendanceId: dup2, reason: RS("แตะซ้ำ"), employeeId: E.e2 });
  const c3 = idOf(r3);
  const a3 = await dc(cA, U.owner!, c3, "APPROVED");
  const cBr = idOf(await rq(cA, U.mgrU1!, ADD(E.e2, "BREAK_START", "2032-03-03", "12:00")));
  await guard(["S4.2", "S4.3"], async () => {
    const all = await attOf(E.e2!);
    const orig = all.find((r: Any) => r.id === in2);
    const rep = all.find((r: Any) => r.correctionId === c2);
    const k2 = await corrOf(c2);
    const dA = (await dayOf(E.e2!, "2032-03-03"))[0];
    ck("S4.2", {
      decided: a2?.ok === true && k2?.status === "APPROVED" && k2?.action === "CHANGE" && k2?.attendanceId === in2 && iso(k2?.originalAt) === "2032-03-03T02:20:00.000Z" && iso(k2?.proposedAt) === "2032-03-03T01:58:00.000Z" && k2?.resultAttendanceId === rep?.id && k2?.requestedByUserId === U.mgrU1!.id,
      original: !!orig && !!orig.voidedAt && orig.voidedByCorrectionId === c2 && canon(noTime(orig)) === canon(noTime(att2.find((r: Any) => r.id === in2))),
      replacement: !!rep && rep.kind === "IN" && iso(rep.at) === "2032-03-03T01:58:00.000Z" && rep.source === "CORRECTION" && rep.judgement === "ON_TIME" && rep.lateMin === 0 && rep.dueMin === 540 && rep.rosterEntryId === x2 && rep.lat === null && rep.note === null && rep.deviceId === null,
      stored: !!dA && dA.status === "ON_TIME" && dA.lateMin === 0 && dA.workedMin === 482 && dA.inAttendanceId === rep?.id && dA.version === 2 && dA.recomputedById === U.owner!.id,
    }, "change", `${shown(r2)} ${shown(a2)} day=${dA ? `${dA.status}/W${dA.workedMin}` : "∅"}`);
    const vd = all.find((r: Any) => r.id === dup2);
    const k3 = await corrOf(c3);
    const dB = (await dayOf(E.e2!, "2032-03-04"))[0];
    ck("S4.3", {
      voided: a3?.ok === true && !!vd?.voidedAt && vd?.voidedByCorrectionId === c3 && k3?.resultAttendanceId === null && k3?.status === "APPROVED" && !all.some((r: Any) => r.correctionId === c3),
      stored: !!dB && dB.workedMin === 482 && dB.version === 2,
    }, "void", `${shown(a3)} day=${dB ? `W${dB.workedMin}/v${dB.version}` : "∅"}`);
  });

  // ── e3 overnight · e4 override + reject · e5 orphan · e6 gates · e7 readers ──
  const a4 = await dc(cA, U.writer!, idOf(await rq(cA, U.writerU2!, ADD(E.e3, "OUT", "2032-03-06", "06:05"))), "APPROVED");
  const r5 = await rq(cA, U.writer!, ADD(E.e4, "OUT", "2032-03-08", "15:00"));
  const a5 = await dc(cA, U.owner!, idOf(r5), "APPROVED");
  const att4 = await attOf(E.e4!);
  const day4 = await dayOf(E.e4!, "2032-03-09");
  const c9 = idOf(await rq(cA, U.writer!, ADD(E.e4, "OUT", "2032-03-09", "22:00")));
  const rj = await dc(cA, U.owner!, c9, "REJECTED");
  const a6 = await dc(cA, U.owner!, idOf(await rq(cA, U.writer!, ADD(E.e5, "OUT", "2032-03-10", "17:05"))), "APPROVED");
  const c7 = idOf(await rq(cA, U.writer!, ADD(E.e6, "OUT", "2032-03-11", "17:00")));
  const g = { mgr: await dc(cA, U.mgrU1!, c7, "APPROVED"), member: await dc(cA, U.member!, c7, "APPROVED"), u2: await dc(cA, U.writerU2!, c7, "APPROVED"), linked: await dc(cA, U.mgrSelf!, c7, "APPROVED"), filer: await dc(cA, U.writer!, c7, "APPROVED") };
  const gPend = (await corrOf(c7))?.status;
  const gOwner = await dc(cA, U.owner!, c7, "APPROVED");
  const a8 = await dc(cA, U.owner!, idOf(await rq(cA, U.writer!, { action: "VOID", attendanceId: out7, reason: RS("กดออกผิด"), employeeId: E.e7 })), "APPROVED");
  await guard(["S4.4", "S4.5", "S4.6", "S4.7", "S4.8", "S4.10"], async () => {
    const d3 = (await dayOf(E.e3!, "2032-03-05"))[0];
    ck("S4.5", { applied: a4?.ok === true, row: !!d3 && d3.workedMin === 490 && d3.missingOut === false && d3.version === 2, next: (await dayOf(E.e3!, "2032-03-06")).length === 1 && (await dayOf(E.e3!, "2032-03-06")).every((r: Any) => r.slotKey === "DAY" && r.status === "DAY_OFF" && r.workedMin === 0 && r.outAttendanceId === null && r.version === 1) /* ORACLE-EDIT S4.5: 03-06 มีแถว DAY_OFF ที่ตัวปิดวันบันทึกไว้แล้วตั้งแต่ฐาน (สัปดาห์ใช้ตารางกะ) — ข้อที่ตรวจจริงคือ OUT ไม่ไปตกวัน D+1 */, day: (await corrsOf(TT)).some((k: Any) => k.employeeId === E.e3 && iso(k.day)?.slice(0, 10) === "2032-03-05") }, "overnight", `${shown(a4)} W${d3?.workedMin}`);
    const d4 = (await dayOf(E.e4!, "2032-03-08"))[0];
    ck("S4.6", { applied: a5?.ok === true, kiosk: (await attOf(E.e4!)).find((r: Any) => r.id === in4)?.source === "KIOSK" && (await attOf(E.e2!)).find((r: Any) => r.id === in2)?.source === "KIOSK", override: !!d4 && d4.status === "ON_TIME" && d4.earlyOutMin === 0 && d4.workedMin === 365 }, "kiosk · override", `${shown(a5)} ${d4?.status}/E${d4?.earlyOutMin}/W${d4?.workedMin}`);
    const d5 = await dayOf(E.e5!, "2032-03-10");
    // ORACLE-EDIT S4.7 (ผู้คุมสั่งปักค่า): แถวกำพร้า (กะถูกลบ) ย้ายไปช่องสดที่ยังไม่มีแถวตามมติ r2 C ของ H2.5 = ช่อง DAY ไม่มีตาราง ⇒ NO_SCHEDULE
    ck("S4.7", { applied: a6?.ok === true, one: d5.length === 1 && d5[0].workedMin === 490 && d5[0].version === 2, slot: d5[0]?.slotKey === "DAY" && d5[0]?.status === "NO_SCHEDULE" }, "orphan", `${shown(a6)} rows=${d5.length} W${d5[0]?.workedMin}/v${d5[0]?.version} ${d5[0]?.slotKey === "DAY" ? "DAY" : "slot"}/${d5[0]?.status}`);
    ck("S4.8", { rejected: rj?.ok === true && rj.status === "REJECTED" && (await corrOf(c9))?.status === "REJECTED" && (await corrOf(c9))?.decidedById === U.owner!.id, att: canon(await attOf(E.e4!)) === canon(att4), day: canon(await dayOf(E.e4!, "2032-03-09")) === canon(day4) && day4.length > 0 }, "reject", shown(rj));
    ck("S4.10", { mgr: said(g.mgr, T.noPerm), member: said(g.member, T.noPerm), u2: said(g.u2, X.otherBranch), linked: said(g.linked, X.self), filer: said(g.filer, X.self), pending: gPend === "PENDING", owner: gOwner?.ok === true && gOwner.status === "APPROVED" }, "gates", Object.entries(g).map(([k, v]) => `${k}=${shown(v)}`).join(" "));
    const nk = await mods.svc.nextClockKind(cA, E.e7, { now: bk("2032-03-12", "10:00") });
    const mk = await mods.posRead.attendanceMarks(cA, E.e7, bk("2032-03-12", "00:00"), bk("2032-03-12", "10:00"));
    const ab = await mods.posRead.attendanceBetween(cA, E.e2, bk("2032-03-04", "00:00"), bk("2032-03-05", "00:00"));
    const mm = await mods.svc.monthlyMinutes(cA, E.e2, new Date("2032-03-01T00:00:00Z"));
    const ma = await mods.svc.monthlyAttendance(cA, E.e2, new Date("2032-03-01T00:00:00Z"));
    const mb = await mods.judge.loadAttendanceMonth(cA, vOf(U.owner!), { employeeId: E.e2, month: "2032-03" }, opt);
    ck("S4.4", {
      applied: a8?.ok === true, clock: nk === "OUT", marks: mk?.lastKind === "IN", between: ab.map((x: Any) => x.kind).join(",") === "IN,OUT", minutes: pre.mm === 910 && mm === 964,
      monthly: ma?.workedMinutes === 964 && ma?.lateCount === 0 && ma?.lateMinutes === 0 && ma?.onTimeCount === 2, board: mb?.summary?.workedMin === 964 && mb?.summary?.lateCount === 0,
    }, "readers", `next=${nk} marks=${mk?.lastKind} between=${ab.map((x: Any) => x.kind)} mm=${pre.mm}→${mm} late=${ma?.lateCount} board=${mb?.summary?.workedMin}`);
  });

  // ── eV: refusals · on-behalf matrix · dup · sequence · cancel ──
  const nTT = async () => (await corrsOf(TT)).length;
  const attV = await attOf(E.eV!);
  const n0 = await nTT();
  const ref = {
    reason: await rq(cA, U.writer!, { ...ADD(E.eV, "IN", "2032-03-14", "09:00"), reason: "ab" }),
    noKind: await rq(cA, U.writer!, { action: "ADD", at: bk("2032-03-14", "09:00"), reason: RS("x1"), employeeId: E.eV }),
    badAct: await rq(cA, U.writer!, { action: "MOVE", kind: "IN", at: bk("2032-03-14", "09:00"), reason: RS("x2"), employeeId: E.eV }),
    noTarget: await rq(cA, U.writer!, { action: "CHANGE", at: bk("2032-03-14", "09:00"), reason: RS("x3"), employeeId: E.eV }),
    future: await rq(cA, U.writer!, { ...ADD(E.eV, "IN", "2032-03-20", "12:02") }),
    old: await rq(cA, U.writer!, ADD(E.eV, "IN", "2032-02-13", "09:00")),
    foreign: await rq(cA, U.writer!, { action: "CHANGE", attendanceId: in1, at: bk("2032-03-02", "08:50"), reason: RS("x4"), employeeId: E.eV }),
    missing: await rq(cA, U.writer!, { action: "VOID", attendanceId: `nope-${tag}`, reason: RS("x5"), employeeId: E.eV }),
    paid: await rq(cP, U.writer!, ADD(E.eP, "OUT", "2032-03-02", "17:00")),
  };
  const n1 = await nTT();
  const edge = await rq(cA, U.writer!, ADD(E.eV, "IN", "2032-02-14", "09:00"));
  const mat = { member: await rq(cA, U.member!, ADD(E.eV, "IN", "2032-03-14", "09:00")), payroll: await rq(cA, U.payroll!, ADD(E.eV, "IN", "2032-03-14", "09:00")), u2: await rq(cA, U.writerU2!, ADD(E.eV, "IN", "2032-03-14", "09:00")), other: await rq(cO, U.other!, ADD(E.eV, "IN", "2032-03-14", "09:00")) };
  const mOk = await rq(cA, U.mgrU1!, ADD(E.eV, "IN", "2032-03-14", "09:00"));
  const wOk = await rq(cA, U.writer!, ADD(E.eV, "IN", "2032-03-15", "09:00"));
  const seq = { order: await rq(cA, U.writer!, ADD(E.eV, "OUT", "2032-03-12", "17:00")), long: await rq(cA, U.writer!, ADD(E.e4, "OUT", "2032-03-09", "22:01")), dup: await rq(cA, U.writer!, ADD(E.eV, "IN", "2032-03-13", "07:00")), same: await rq(cA, U.writer!, { action: "CHANGE", attendanceId: inV, at: bk("2032-03-13", "07:00"), reason: RS("x6"), employeeId: E.eV }) };
  const ch1 = await rq(cA, U.writer!, { action: "CHANGE", attendanceId: inV, at: bk("2032-03-13", "07:05"), reason: RS("x7"), employeeId: E.eV });
  const ch2 = await rq(cA, U.writer!, { action: "CHANGE", attendanceId: inV, at: bk("2032-03-13", "07:10"), reason: RS("x8"), employeeId: E.eV });
  const L1 = [await rq(cA, U.writer!, ADD(E.eL, "IN", "2032-03-02", "09:00")), await rq(cA, U.writer!, ADD(E.eL, "IN", "2032-03-02", "10:00"))];
  for (const dd of ["03", "04", "05", "06"]) L1.push(await rq(cA, U.writer!, ADD(E.eL, "IN", `2032-03-${dd}`, "09:00")));
  const many = await rq(cA, U.writer!, ADD(E.eL, "IN", "2032-03-07", "09:00"));
  const cM = idOf(mOk);
  const can = { writer: await cc(cA, U.writer!, cM), member: await cc(cA, U.member!, cM), filer: await cc(cA, U.mgrU1!, cM) };
  const afterCancel = await dc(cA, U.owner!, cM, "APPROVED");
  await guard(["S3.1", "S3.3", "S3.5", "S3.6", "S4.9"], async () => {
    ck("S3.1", {
      reason: said(ref.reason, T.reason), shape: [ref.noKind, ref.badAct, ref.noTarget].every((r) => said(r, T.badInput)), future: said(ref.future, T.future), old: said(ref.old, T.tooOld),
      target: said(ref.foreign, T.targetNf) && said(ref.missing, T.targetNf), paid: said(ref.paid, T.paid), nothing: n1 === n0 && n0 > 0, edge: edge?.ok === true && edge.status === "PENDING",
    }, "fixed texts", Object.entries(ref).map(([k, v]) => `${k}=${shown(v)}`).join(" "));
    const dm = await det(cA, U.owner!, idOf(mOk));
    ck("S3.3", { refused: Object.values(mat).every((r) => said(r, T.empNf)), mgr: mOk?.ok === true && mOk.status === "PENDING", key: wOk?.ok === true, behalf: dm?.ok === true && dm.item?.filedOnBehalf === true }, "gate", Object.entries(mat).map(([k, v]) => `${k}=${shown(v)}`).join(" "));
    const pendL = (await corrsOf(TT)).filter((k: Any) => k.employeeId === E.eL && k.status === "PENDING").length;
    ck("S3.5", { target: ch1?.ok === true && said(ch2, T.dupPending), add: L1[0]?.ok === true && said(L1[1], T.dupPending), many: L1.slice(2).every((r) => r?.ok === true) && said(many, T.tooMany) && pendL === 5 }, "limits", `ch2=${shown(ch2)} L1=${shown(L1[1])} many=${shown(many)} pend=${pendL}`);
    ck("S3.6", { order: said(seq.order, T.order), long: said(seq.long, T.tooLong), dup: said(seq.dup, T.dup), same: said(seq.same, T.same) }, "sequence", Object.entries(seq).map(([k, v]) => `${k}=${shown(v)}`).join(" "));
    ck("S4.9", { others: said(can.writer, T.notOwn) && said(can.member, T.notOwn), filer: can.filer?.ok === true && (await corrOf(cM))?.status === "CANCELLED", stale: said(afterCancel, T.stale), nothing: canon(await attOf(E.eV!)) === canon(attV) }, "cancel", `${shown(can.writer)} ${shown(can.filer)} ${shown(afterCancel)}`);
  });

  // ── S3.2 self ──
  await guard(["S3.2"], async () => {
    const s = {
      unlinked: await rq(cA, U.stray!, ADD(undefined, "IN", "2032-03-16", "09:00")), inactive: await rq(cA, U.selfI!, ADD(undefined, "IN", "2032-03-16", "09:00")),
      foreignEmp: await rq(cA, U.self!, ADD(E.e2, "IN", "2032-03-16", "09:00")), foreignRow: await rq(cA, U.self!, { action: "VOID", attendanceId: dup2, reason: RS("x9") }),
    };
    ck("S3.2", { unlinked: said(s.unlinked, X.mNoEmp), inactive: said(s.inactive, X.mInactive), foreignEmp: said(s.foreignEmp, T.empNf), foreignRow: said(s.foreignRow, T.targetNf) }, "self", Object.entries(s).map(([k, v]) => `${k}=${shown(v)}`).join(" "));
  });

  // ── S7.1 · S7.4 · S7.2 (readers) ──
  await guard(["S7.1", "S7.4"], async () => {
    const yes = [U.owner!, U.mgrU1!, U.writer!, U.self!];
    const ds = await Promise.all(yes.map((w) => det(cA, w, c1)));
    const no = [await det(cA, U.writerU2!, c1), await det(cA, U.payroll!, c1), await det(cA, U.member!, c1), await det(cA, U.stray!, c1), await det(cO, U.other!, c1), await det(cP, U.owner!, c1)];
    const it = ds[0]?.item;
    ck("S7.1", {
      viewers: ds.every((r) => r?.ok === true && Object.keys(r.item ?? {}).sort().join(",") === ITEM_KEYS && r.item.reason === RS("ลืมกดออก รีบไปรับลูก")),
      others: no.every((r) => said(r, T.detailNo)),
      values: !!it && it.id === c1 && it.employeeId === E.e1 && it.employeeName === `หนึ่ง ${tag}` && it.action === "ADD" && it.kind === "OUT" && it.day === "2032-03-02" && it.proposedAt === "2032-03-02T10:05:00.000Z" && it.originalAt === null && it.status === "APPROVED" && it.filedOnBehalf === false && canon(it.evidence) === canon(EVID),
      noForbidden: ds.every((r) => ![...keysDeep(r?.item ?? {})].some((k) => FORBID.includes(k))),
    }, "detail", `${shown(ds[0])} keys=${it ? Object.keys(it).sort().join(",") : "∅"} no=${no.map(shown).join("|")}`);
    const dBr = await det(cA, U.owner!, cBr);
    const dSelf = ds[3]?.item;
    const lm = await call(CM, "listCorrections", cA, vOf(U.mgrU1!), {}, opt);
    const lo = await call(CM, "listCorrections", cA, vOf(U.owner!), {}, opt);
    const my = await call(CM, "myCorrections", cA, vOf(U.self!), opt);
    const e3ids = (await corrsOf(TT)).filter((k: Any) => k.employeeId === E.e3).map((k: Any) => k.id);
    const ids = (r: Any) => (r?.ok === true && Array.isArray(r.items) ? r.items.map((x: Any) => x.id) : []);
    ck("S7.4", {
      repeat: dBr?.ok === true && dBr.item.periodCount === 3 && dBr.item.repeat === true && (await det(cA, U.owner!, c1))?.item?.periodCount === 1 && (await det(cA, U.owner!, c1))?.item?.repeat === false,
      selfNull: !!dSelf && dSelf.periodCount === null && dSelf.repeat === null,
      scoped: ids(lm).includes(c1) && !ids(lm).some((i: string) => e3ids.includes(i)) && e3ids.length === 1 && ids(lo).includes(e3ids[0]),
      mine: srt(ids(my)) === c1,
    }, "repeat · lists", `br=${dBr?.item?.periodCount}/${dBr?.item?.repeat} my=${ids(my).length}`);
  });

  // ── chain (TB) ──
  const pol = await mods.ap.createPolicy({ tenantId: TB }, { name: "QC26 สายแก้เวลา", entityType: "HrTimeCorrection", systemId: sB, steps: [{ order: 1, approverRole: "MANAGER" }] });
  const reqOf = async (id: string) => (await P.approvalRequest.findFirst({ where: { tenantId: TB, entityId: id } })) as Any;
  const fire = (id: string, reqId: string, approved = true) => mods.eff.applyApprovalEffect({ tenantId: TB, type: approved ? "approval.request.approved" : "approval.request.rejected", payload: { requestId: reqId, entityType: "HrTimeCorrection", entityId: id } }).then(() => "ok", (e: unknown) => `THROW ${errText(e)}`);
  const coreDecide = (w: Who, reqId: string, decision: string) => mods.ap.decide(vOf(w), { tenantId: TB }, reqId ?? "∅", { decision }).catch((e: unknown) => ({ ok: false, status: `THROW ${errText(e)}` }));
  const rB = await rq(cB, U.selfB!, ADD(undefined, "OUT", "2032-03-02", "17:00"));
  const cB1 = idOf(rB);
  const qB = await reqOf(cB1);
  const inCh = await dc(cB, U.ownerB!, cB1, "APPROVED");
  const rjB = await coreDecide(U.mgrB!, qB?.id, "REJECTED");
  const fB = await fire(cB1, qB?.id, false);
  const cB2 = idOf(await rq(cB, U.writerB!, ADD(E.eB2, "OUT", "2032-03-02", "17:00")));
  const qB2 = await reqOf(cB2);
  const sF = await coreDecide(U.writerB!, qB2?.id, "APPROVED");
  const sL = await coreDecide(U.mgrB2!, qB2?.id, "APPROVED");
  const stillP = (await P.approvalRequest.findFirst({ where: { id: qB2?.id ?? "∅" } }))?.status;
  const okB2 = await coreDecide(U.mgrB!, qB2?.id, "APPROVED");
  const fx1 = [await fire(cB2, qB2?.id), await fire(cB2, qB2?.id)];
  const xB3 = (await attOf(E.eB3!))[0]?.id ?? "∅";
  const cV = idOf(await rq(cB, U.writerB!, { action: "VOID", attendanceId: xB3, reason: RS("x10"), employeeId: E.eB3 }));
  const own = await rq(cB, U.ownerB!, { action: "CHANGE", attendanceId: xB3, at: bk("2032-03-03", "08:50"), reason: RS("x11"), employeeId: E.eB3 });
  const qV = await reqOf(cV);
  await coreDecide(U.mgrB!, qV?.id, "APPROVED");
  const fV = await fire(cV, qV?.id);
  const cS = idOf(await rq(cB, U.selfB!, ADD(undefined, "OUT", "2032-03-02", "17:30")));
  const qS = await reqOf(cS);
  const cnS = await cc(cB, U.selfB!, cS);
  const cB4 = idOf(await rq(cB, U.writerB!, ADD(E.eB4, "OUT", "2032-03-03", "17:00")));
  const qB4 = await reqOf(cB4);
  await coreDecide(U.mgrB!, qB4?.id, "APPROVED");
  const par = await Promise.all([fire(cB4, qB4?.id), fire(cB4, qB4?.id), fire(cB4, qB4?.id)]);
  await guard(["S5.1", "S5.2", "S5.3", "S5.4", "S5.5", "S6.1", "S9.5"], async () => {
    const evB = await evsOf(TB);
    ck("S5.1", { request: rB?.ok === true && rB.status === "PENDING" && !!qB && rB.requestId === qB.id && qB.entityType === "HrTimeCorrection" && qB.unitId === ub && qB.systemId === sB && qB.requestedById === U.selfB!.id && qB.policyId === pol.id, inChain: said(inCh, T.inChain), rejected: rjB?.ok === true && fB === "ok" && (await corrOf(cB1))?.status === "REJECTED" && (await liveOf(E.eB!)).length === 1 }, "chain", `${shown(rB)} ${shown(inCh)}`);
    ck("S5.2", { filer: sF?.ok === false && sF?.code === "SELF_APPROVAL", linked: sL?.ok === false && sL?.reason === X.self, pending: stillP === "PENDING" }, "core self", `${short(sF, 50)} ${short(sL, 50)}`);
    const k2 = await corrOf(cB2);
    ck("S5.3", { approved: okB2?.ok === true && fx1.every((x) => x === "ok") && k2?.status === "APPROVED" && k2?.decidedById === U.mgrB!.id, once: (await liveOf(E.eB2!)).filter((r: Any) => r.correctionId === cB2).length === 1 && evB.filter((e) => e.payload?.correctionId === cB2).length === 1 }, "effect", `${k2?.status}/${k2?.decidedById === U.mgrB!.id}`);
    const au = (await P.auditLog.findMany({ where: { tenantId: TB, action: "hr.correction.apply_refused" } })) as Any[];
    ck("S5.4", { cancelled: fV === "ok" && (await corrOf(cV))?.status === "CANCELLED", audit: au.some((a) => a.after?.correctionId === cV && a.after?.code === "TARGET" && a.after?.requestId === qV?.id) }, "target", `${fV} ${(await corrOf(cV))?.status}`);
    ck("S5.5", { cancelled: cnS?.ok === true && (await corrOf(cS))?.status === "CANCELLED" && (await P.approvalRequest.findFirst({ where: { id: qS?.id ?? "∅" } }))?.status === "CANCELLED" }, "cancel chain", shown(cnS));
    const ownId = idOf(own);
    ck("S6.1", { at: own?.ok === true && own.status === "APPROVED" && own.requestId === null && (await corrOf(ownId))?.status === "APPROVED" && (await corrOf(ownId))?.decidedById === U.ownerB!.id, noChain: (await P.approvalRequest.count({ where: { entityId: ownId } })) === 0, audit: ((await P.auditLog.findMany({ where: { tenantId: TB, action: "hr.correction.owner_auto" } })) as Any[]).filter((a) => ownId !== "∅" && JSON.stringify(a).includes(ownId)).length === 1, applied: (await liveOf(E.eB3!)).some((r: Any) => r.correctionId === ownId) }, "owner-auto", shown(own));
    ck("S9.5", { ok: par.every((x) => x === "ok"), once: (await liveOf(E.eB4!)).filter((r: Any) => r.correctionId === cB4).length === 1 && evB.filter((e) => e.payload?.correctionId === cB4).length === 1 && (await corrOf(cB4))?.status === "APPROVED" }, "parallel effect", par.join(","));
  });

  // ── races (TT) ──
  await guard(["S9.1", "S9.2", "S9.3", "S9.4"], async () => {
    const cRr = idOf(await rq(cR, U.writer!, ADD(E.eR, "OUT", "2032-03-02", "17:05")));
    const run = await P.hrPayrollRun.create({ data: { tenantId: TT, systemId: sR, periodKey: "2032-03", payDate: new Date("2032-03-31T00:00:00Z"), status: "DRAFT" } });
    const h1 = await hold(`hr:payroll:run:${sR}:2032-03`, (tx) => tx.hrPayrollRun.updateMany({ where: { id: run.id }, data: { status: "APPROVED" } }), () => dc(cR, U.owner!, cRr, "APPROVED"));
    ck("S9.1", { waited: h1.waited && !h1.holderErr, paid: said(h1.res, T.paid), cancelled: (await corrOf(cRr))?.status === "CANCELLED", nothing: (await attOf(E.eR!)).length === 1 }, "period lock", `${h1.waited} ${shown(h1.res)} ${h1.holderErr}`);
    const cT = idOf(await rq(cA, U.writer!, ADD(E.eT, "OUT", "2032-03-12", "17:00")));
    const two = await Promise.all([dc(cA, U.owner!, cT, "APPROVED"), dc(cA, U.writer2!, cT, "APPROVED")]);
    const evT = (await evsOf(TT)).filter((e) => e.payload?.correctionId === cT);
    ck("S9.2", { one: two.filter((r) => r?.ok === true).length === 1 && two.filter((r) => said(r, T.stale)).length === 1, row: (await liveOf(E.eT!)).filter((r: Any) => r.correctionId === cT).length === 1, event: evT.length === 1 }, "two deciders", two.map(shown).join(" | "));
    const cK = idOf(await rq(cA, U.writer!, ADD(E.eK, "OUT", "2032-03-12", "17:05")));
    const h3 = await hold(`hr:clock:${E.eK}`, (tx) => tx.hrAttendance.create({ data: { ...cA, employeeId: E.eK, kind: "OUT", at: bk("2032-03-12", "17:05:20"), source: "KIOSK" } }), () => dc(cA, U.owner!, cK, "APPROVED"));
    const lk = await liveOf(E.eK!);
    ck("S9.3", { waited: h3.waited && !h3.holderErr, dup: said(h3.res, T.dup), cancelled: (await corrOf(cK))?.status === "CANCELLED", rows: lk.length === 2 && !lk.some((r: Any) => r.source === "CORRECTION") }, "clock lock", `${h3.waited} ${shown(h3.res)}`);
    const five = await Promise.all([0, 1, 2, 3, 4].map(() => rq(cA, U.writer!, ADD(E.eX, "OUT", "2032-03-12", "17:00"))));
    const pX = (await corrsOf(TT)).filter((k: Any) => k.employeeId === E.eX && k.status === "PENDING").length;
    ck("S9.4", { one: five.filter((r) => r?.ok === true).length === 1 && five.filter((r) => said(r, T.dupPending)).length === 4, pending: pX === 1 }, "5 parallel", five.map(shown).join(" | "));
  });

  // ── ENDED ──
  await guard(["S10.1"], async () => {
    const aE = await dc(cA, U.owner!, idOf(await rq(cA, U.writer!, ADD(E.eE, "OUT", "2032-03-04", "17:00"))), "APPROVED");
    const after = await rq(cA, U.writer!, ADD(E.eE, "IN", "2032-03-06", "09:00"));
    const cE2 = idOf(await rq(cA, U.writer!, ADD(E.eE2, "IN", "2032-03-07", "09:00")));
    await P.hrEmployee.update({ where: { id: E.eE2 }, data: { endDate: dbDate("2032-03-06"), employmentStatus: "ENDED", active: false } });
    const late = await dc(cA, U.owner!, cE2, "APPROVED");
    ck("S10.1", { onBehalf: aE?.ok === true && (await liveOf(E.eE!)).length === 2, after: said(after, T.outOfEmployment), endedWhilePending: said(late, T.outOfEmployment) && (await corrOf(cE2))?.status === "CANCELLED" && (await liveOf(E.eE2!)).length === 0 }, "ended", `${shown(aE)} ${shown(after)} ${shown(late)}`);
  });

  // ── X2 ──
  await guard(["X2.1"], async () => {
    const att2b = await attOf(E.e2!);
    const x = { det: await det(cO, U.other!, cBr), dec: await dc(cO, U.other!, cBr, "APPROVED"), can: await cc(cO, U.other!, cBr), sysDet: await det(cP, U.owner!, cBr), apply: await call(CM, "applyCorrectionDecision", { tenantId: T2, systemId: sA, correctionId: cBr, requestId: "x", approved: true }, opt) };
    ck("X2.1", { refused: said(x.det, T.detailNo) && said(x.sysDet, T.detailNo) && x.dec?.ok === false && x.can?.ok === false && x.apply?.applied === false, unchanged: (await corrOf(cBr))?.status === "PENDING" && canon(await attOf(E.e2!)) === canon(att2b) }, "cross tenant", Object.entries(x).map(([k, v]) => `${k}=${shown(v)}`).join(" "));
  });

  // ── events · notifications · privacy sweeps ──
  await guard(["S8.1", "S8.2", "S7.2", "S1.2", "S1.5"], async () => {
    const evT = await evsOf(TT);
    const approved = (await corrsOf(TT)).filter((k: Any) => k.status === "APPROVED").map((k: Any) => k.id as string);
    const e1ev = evT.find((e) => e.payload?.correctionId === c1);
    const handler = mods.cons?.consumers?.[EV];
    let replay = "∅consumer";
    if (typeof handler === "function" && e1ev) {
      try {
        await handler(e1ev);
        await handler(e1ev);
        replay = "ok";
      } catch (e) {
        replay = `THROW ${errText(e)}`;
      }
    }
    ck("S8.1", {
      perApply: approved.length > 0 && srt(evT.map((e) => e.payload?.correctionId)) === srt(approved) && evT.length === approved.length,
      key: !!e1ev && e1ev.idempotencyKey === `${EV}#${c1}`,
      payload: !!e1ev && Object.keys(e1ev.payload ?? {}).sort().join(",") === EV_KEYS && e1ev.payload.systemId === sA && e1ev.payload.employeeId === E.e1 && e1ev.payload.action === "ADD" && e1ev.payload.kind === "OUT" && e1ev.payload.day === "2032-03-02" && e1ev.payload.attendanceId === null && e1ev.payload.resultAttendanceId === new1?.id,
      replay: replay === "ok",
    }, "event", `events=${evT.length} approved=${approved.length} replay=${replay}`);
    const all = (await P.appNotification.findMany({ where: { recipientUserId: { in: Object.values(U).map((w) => w.id) } } })) as Any[];
    const mine = (uid: string, t: string) => all.filter((n) => n.recipientUserId === uid && n.title === t).length;
    ck("S8.2", {
      pending: pn.dec.every((n) => n === 1) && pn.non.every((n) => n === 0), approved: appr1.length === 1 && mine(U.self!.id, T.nApproved) === 1,
      rejected: mine(U.writer!.id, T.nRejected) === 1, cancelled: mine(U.writer!.id, T.nCancelled) === 3, clean: all.filter((n) => [T.nPending, T.nApproved, T.nRejected, T.nCancelled].includes(n.title)).every((n) => !`${n.body}`.includes(SECRET) && !`${n.body}`.includes("17:05")),
    }, "notifications", `pend=${pn.dec.join("")}/${pn.non.join("")} rej=${mine(U.writer!.id, T.nRejected)} can=${mine(U.writer!.id, T.nCancelled)}`);
    const aud = (await P.auditLog.findMany({ where: { tenantId: { in: [TT, TB] }, action: { startsWith: "hr.correction" } } })) as Any[];
    const evAll = [...evT, ...(await evsOf(TB))];
    ck("S7.2", { audit: aud.length > 0 && aud.every((a) => !JSON.stringify(a).includes(SECRET)), outbox: evAll.every((e) => !JSON.stringify(e.payload).includes(SECRET) && !("reason" in (e.payload ?? {}))), notes: all.every((n) => !`${n.body}${n.title}`.includes(SECRET)) }, "reason stays private", `audit=${aud.length}`);
    const cols = await rows(`SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('HrAttendance','HrTimeCorrection') AND column_name IN ('voidedAt','voidedByCorrectionId','correctionId','action','day')`);
    const idx = await rows(`SELECT indexname FROM pg_indexes WHERE tablename = 'HrTimeCorrection' AND indexname IN ('HrTimeCorrection_attendanceId_pending_key','HrTimeCorrection_pending_add_key','HrTimeCorrection_pending_target_key')`);
    const idxN = srt(idx.map((r: Any) => r.indexname));
    // ORACLE-EDIT r2: duplicate pending_target_key dropped — the H1.2 attendanceId_pending_key (same definition) stays
    ck("S1.2", { ...S12.stat, live: cols.length === 5 && idxN === srt(["HrTimeCorrection_attendanceId_pending_key", "HrTimeCorrection_pending_add_key"]) }, "migration", `cols=${cols.length} idx=${idxN}`);
    const labels = ((mods.auto?.AUTOMATION_EVENTS ?? []) as Any[]).filter((a) => a.value === EV);
    ck("S1.5", { ...S15.stat, runtime: typeof handler === "function" && labels.length === 1 && labels[0].label === EV_LABEL }, "consumer · label");
  });

  // ══ r2 (controller fix round) — after the sweeps so earlier counts are untouched ══
  const sys2 = async (n: string) => (await mods.sys.createSystem(TT, "HR", n)).id as string;
  const [sFb, sHp] = [await sys2("HR F"), await sys2("HR H")];
  const cFb = { tenantId: TT, systemId: sFb }, cHp = { tenantId: TT, systemId: sHp };
  const eF = await me(TT, sFb, `eF ${tag}`, { unitId: u1 });
  const eH = await me(TT, sHp, `eH ${tag}`, { unitId: u1 });
  const inF = await att(eF, "IN", bk("2032-03-01", "00:30"), null, {}, cFb);
  const outF = await att(eF, "OUT", bk("2032-03-01", "08:00"), null, {}, cFb);
  await att(eH, "IN", bk("2032-03-31", "22:00"), null, {}, cHp);
  for (const n of ["2032-03-03", "2032-04-02"]) await mods.judge.runAttendanceJobs({ now: bk(n, "12:00"), tenantId: TT });
  // S11.1 (reviewer): A = fix the OUT of the Mar 1 session · B moves its IN to Feb 29 23:00 (approved) · Feb PAID · approve A ⇒ refused
  await guard(["S11.1"], async () => {
    const cA1 = idOf(await rq(cFb, U.writer!, { action: "CHANGE", attendanceId: outF, at: bk("2032-03-01", "09:00"), reason: RS("ออกผิด"), employeeId: eF }));
    const bB = await dc(cFb, U.owner!, idOf(await rq(cFb, U.writer!, { action: "CHANGE", attendanceId: inF, at: bk("2032-02-29", "23:00"), reason: RS("เข้าก่อนเที่ยงคืน"), employeeId: eF })), "APPROVED");
    await P.hrPayrollRun.create({ data: { tenantId: TT, systemId: sFb, periodKey: "2032-02", payDate: new Date("2032-02-29T00:00:00Z"), status: "PAID" } });
    const febBefore = canon(await dayOf(eF, "2032-02-29"));
    const attBefore = canon(await attOf(eF));
    const aA = await dc(cFb, U.owner!, cA1, "APPROVED");
    ck("S11.1", { filed: cA1 !== "∅", moved: bB?.ok === true, refused: said(aA, T.paid), cancelled: (await corrOf(cA1))?.status === "CANCELLED", feb: canon(await dayOf(eF, "2032-02-29")) === febBefore, punches: canon(await attOf(eF)) === attBefore }, "refused · Feb untouched", `${shown(bB)} ${shown(aA)}`);
  });
  // S11.2 (hunter): April PAID · March open · IN 03-31 22:00 · ADD OUT 04-01 06:00 ⇒ accepted · 03-31 W480 · nothing written to April
  await guard(["S11.2"], async () => {
    await P.hrPayrollRun.create({ data: { tenantId: TT, systemId: sHp, periodKey: "2032-04", payDate: new Date("2032-04-30T00:00:00Z"), status: "PAID" } });
    const aprBefore = canon(await rows(`SELECT * FROM "HrAttendanceDay" WHERE "employeeId" = $1 AND "date" >= '2032-04-01'::date ORDER BY "id"`, eH));
    const late = { now: bk("2032-04-03", "12:00") };
    const rH = await rq(cHp, U.owner!, ADD(eH, "OUT", "2032-04-01", "06:00"), late);
    const d31 = (await dayOf(eH, "2032-03-31"))[0];
    ck("S11.2", { accepted: rH?.ok === true && rH.status === "APPROVED", march: !!d31 && d31.workedMin === 480 && d31.missingOut === false && d31.version === 2, april: canon(await rows(`SELECT * FROM "HrAttendanceDay" WHERE "employeeId" = $1 AND "date" >= '2032-04-01'::date ORDER BY "id"`, eH)) === aprBefore }, "accepted · April untouched", `${shown(rH)} W${d31?.workedMin}/v${d31?.version}`);
  });
  // S11.3 (r3 · reviewer): March PAID · Mar 31 stored row already stale from a roster edit · ADD OUT for the Apr 1 session ⇒ accepted, Mar 31 untouched
  await guard(["S11.3"], async () => {
    const sQ = await sys2("HR Q");
    const cQ = { tenantId: TT, systemId: sQ };
    const eQ = await me(TT, sQ, `eQ ${tag}`, { unitId: u1 });
    const shQ = (await P.hrShift.create({ data: { tenantId: TT, systemId: sQ, name: `กะ Q ${tag}`, startMin: 540, endMin: 1020, crossesMidnight: false, graceMin: 15 } })).id as string;
    const xQ = (await P.hrRosterEntry.create({ data: { tenantId: TT, systemId: sQ, employeeId: eQ, date: dbDate("2032-03-31"), shiftId: shQ, unitId: u1, startMin: 540, endMin: 1020, breakMin: 0, crossesMidnight: false, published: true, publishedAt: PUB, source: "MANUAL" } })).id as string;
    await att(eQ, "IN", bk("2032-03-31", "08:55"), xQ, ON, cQ);
    await att(eQ, "OUT", bk("2032-03-31", "17:00"), xQ, {}, cQ);
    await att(eQ, "IN", bk("2032-04-01", "09:00"), null, {}, cQ);
    await mods.judge.runAttendanceJobs({ now: bk("2032-04-01", "12:00"), tenantId: TT });
    await P.hrRosterEntry.update({ where: { id: xQ }, data: { startMin: 600 } }); // roster edit after finalising ⇒ the Mar 31 row is stale
    await P.hrPayrollRun.create({ data: { tenantId: TT, systemId: sQ, periodKey: "2032-03", payDate: new Date("2032-03-31T00:00:00Z"), status: "PAID" } });
    const m31 = canon(await dayOf(eQ, "2032-03-31"));
    const rQ = await rq(cQ, U.owner!, ADD(eQ, "OUT", "2032-04-01", "17:00"), { now: bk("2032-04-03", "12:00") });
    const d31 = await dayOf(eQ, "2032-03-31");
    ck("S11.3", { stored: d31.length === 1, accepted: rQ?.ok === true && rQ.status === "APPROVED", untouched: canon(d31) === m31 }, "stale neighbour does not block", shown(rQ));
  });
  // S7.5: evidence shows only what THIS user did · DTO filtered to the viewer's branches
  await guard(["S7.5"], async () => {
    const uE = await fx.mkUser(TT, "self5", `QC self5 ${tag}`, "STAFF", [], {});
    const eE5 = await me(TT, sA, `eE5 ${tag}`, { unitId: u1, linkedUserId: uE.id });
    await att(eE5, "IN", bk("2032-03-16", "09:00"), null);
    const ps = (no: number, unitId: string, by: string, o: string, c: string, closedBy: string) =>
      P.posShift.create({ data: { tenantId: TT, unitId, systemId: `qc-pos-${tag}`, deviceId: `qcdev${tag}0000`, shiftNo: no, status: "CLOSED", openedByUserId: by, openedAt: new Date(o), floatSatang: 100000, closedByUserId: closedBy, closedAt: new Date(c), expectedCashSatang: 777, countedCashSatang: 777, overShortSatang: 0 } });
    await ps(7101, u1, U.member!.id, "2032-03-16T08:00:00+07:00", "2032-03-16T17:05:00+07:00", uE.id);
    await ps(7102, u2, uE.id, "2032-03-16T12:00:00+07:00", "2032-03-16T13:00:00+07:00", uE.id);
    await ps(7103, u1, uE.id, "2032-03-16T18:00:00+07:00", "2032-03-16T19:00:00+07:00", U.member!.id);
    const c5 = idOf(await rq(cA, U.writer!, ADD(eE5, "OUT", "2032-03-16", "17:00")));
    const row = await corrOf(c5);
    const want = [
      { shiftNo: 7101, unitId: u1, openedAt: null, closedAt: "2032-03-16T10:05:00.000Z", forced: false },
      { shiftNo: 7102, unitId: u2, openedAt: "2032-03-16T05:00:00.000Z", closedAt: "2032-03-16T06:00:00.000Z", forced: false },
      { shiftNo: 7103, unitId: u1, openedAt: "2032-03-16T11:00:00.000Z", closedAt: null, forced: false },
    ];
    const strip = (xs: Any[]) => xs.map(({ unitId: _u, ...x }: Any) => x);
    const dO = await det(cA, U.owner!, c5);
    const dM = await det(cA, U.mgrU1!, c5);
    ck("S7.5", {
      stored: canon(row?.evidenceJson) === canon({ posShifts: want, deviceLogout: null }),
      owner: dO?.ok === true && canon(dO.item.evidence) === canon({ posShifts: strip(want), deviceLogout: null }),
      branch: dM?.ok === true && canon(dM.item.evidence) === canon({ posShifts: strip(want.filter((x) => x.unitId === u1)), deviceLogout: null }),
    }, "own actions · branch scope", short(row?.evidenceJson, 80));
  });
  // S7.6: 450 newer rows of a u2 employee must not push c1 out of the u1 manager's list
  await guard(["S7.6"], async () => {
    const eX2 = await me(TT, sA, `eX2 ${tag}`, { unitId: u2 });
    await P.hrTimeCorrection.createMany({ data: Array.from({ length: 450 }, (_, i) => ({ tenantId: TT, systemId: sA, employeeId: eX2, kind: "OUT", proposedAt: bk("2032-03-17", "17:00"), reason: `r${i}`, status: "REJECTED", requestedByUserId: U.writer!.id })) });
    const lm2 = await call(CM, "listCorrections", cA, vOf(U.mgrU1!), {}, opt);
    const ids2 = lm2?.ok === true ? lm2.items.map((x: Any) => x.id) : [];
    ck("S7.6", { c1: ids2.includes(c1), noU2: lm2?.ok === true && !lm2.items.some((x: Any) => x.employeeId === eX2) }, "complete list", `n=${ids2.length}`);
  });
  // S6.2: OWNER files for their own linked row ⇒ applied at once (Q4) · flagged selfApplied
  await guard(["S6.2"], async () => {
    const eOB = await me(TB, sB, `eOB ${tag}`, { unitId: ub, linkedUserId: U.ownerB!.id });
    await att(eOB, "IN", bk("2032-03-05", "09:00"), null, {}, cB);
    const r6 = await rq(cB, U.ownerB!, ADD(undefined, "OUT", "2032-03-05", "17:00"));
    const id6 = idOf(r6);
    const k6 = await corrOf(id6);
    const au6 = ((await P.auditLog.findMany({ where: { tenantId: TB, action: "hr.correction.owner_auto" } })) as Any[]).filter((a) => a.after?.correctionId === id6);
    const others = (await corrsOf(TB)).filter((k: Any) => k.id !== id6);
    const d6 = await det(cB, U.ownerB!, id6);
    ck("S6.2", { applied: r6?.ok === true && r6.status === "APPROVED" && r6.requestId === null && k6?.decidedById === U.ownerB!.id, flag: k6?.selfApplied === true && others.every((k: Any) => k.selfApplied === false), audit: au6.length === 1 && au6[0].after?.selfApplied === true, dto: d6?.ok === true && d6.item.selfApplied === true }, "self-applied", shown(r6));
  });
}

let crashed = "";
try {
  runStatic();
  runPure();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  try {
    for (const tid of fx.tenants) for (const t of ["HrAttendanceAlert", "HrAttendanceDay", "PosShift"]) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid).catch(() => 0);
    await cleanupFx(P, fx, SLUG);
  } catch (e) {
    console.log(`💥 cleanup: ${errText(e)}`);
  }
}
{
  const env = { PATH: process.env.PATH, HOME: process.env.HOME };
  const res: string[] = [];
  for (const withEnv of [true, false])
    for (const f of ["scripts/fitness.mts", "scripts/fitness-hr.mts"]) {
      const r = await spawnTsx([f], withEnv ? (process.env as Record<string, string>) : env, 400_000);
      res.push(`${r.code}`);
    }
  chk("X12.1", res.every((r) => r === "0"), "0 ×4", res.join(" · "));
}
const residue = await residueOf(P, fx, SLUG, SLUG_PREFIX);
for (const tid of fx.tenants)
  for (const t of ["HrAttendanceDay", "HrAttendanceAlert", "PosShift"]) {
    const n = Number((await fx.rawRows(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid))?.[0]?.n ?? -1);
    if (n !== 0) residue.push(`${t}=${n}`);
  }
chk("Z1", residue.length === 0 && fx.tenants.length > 0, "none", residue.join(",") || "none");
const exitCode = REG.finish({ forced: FORCE, crashed, missing: skipReasons });
await P.$disconnect?.().catch?.(() => {});
process.exit(exitCode);
