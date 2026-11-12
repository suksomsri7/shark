// QC — HR V2 · H4.4 people lifecycle (alerts · notes · checklists · offboarding in ONE tx · retention) · brief ledger/hr-briefs/hr-brief-H4.4.md
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// Tenants qc-hr-h44-<stamp> · 2031 dates · opts.now injected · SKIP while hr/lifecycle.ts is absent (QC_FORCE=1 runs) · --list
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h4.4.mts
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  type Any, type Def, type Sev, type Base, type Who, ROOT, rd, short, errText, textOf, srt, failedKeys, stripComments, sha, dk, dbDate, sleep, tagOf,
  PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, baseRef, pathInBase, changedVsBase, diffHunks, makeRegistry, qc4Env, makeFixtures, cleanupFx, residueOf,
  vOf, fitnessNoEnv, importsOf, flat, jsonOf, testidsOf, loadOpt, modState, msgParity, tokensOnly, useServerFile,
} from "./qc-hr-lib.mjs";

const SUITE = "qc-hr-h4.4";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-h44-";
const H = "src/lib/modules/hr/";
const F = {
  life: `${H}lifecycle.ts`, acts: `${H}lifecycle-actions.ts`, ui: `${H}lifecycle-ui.tsx`, bridge: "src/lib/platform/hr-lifecycle-bridges.ts",
  mig: "prisma/migrations/20261231000000_hr_lifecycle/migration.sql", schema: "prisma/schema/hr.prisma", actions: `${H}actions.ts`, hrUi: `${H}ui.tsx`,
  profile: "src/app/app/sys/[id]/hr/employees/[employeeId]/page.tsx", settings: "src/app/app/sys/[id]/hr/settings/page.tsx",
  consumers: "src/lib/outbox-consumers.ts", labels: "src/lib/automation/labels.ts", cron: "src/app/api/cron/hourly/route.ts",
  layout: "src/app/app/layout.tsx", th: "src/messages/th/common.json", en: "src/messages/en/common.json", inv: "scripts/hr-ui-inventory.json", fitHr: "scripts/fitness-hr.mts",
};
const EV = { due: "hr.employee.milestone_due", started: "hr.employee.checklist_started", off: "hr.employee.offboarded" } as const;
const T: Record<string, string> = {
  noAccess: "คุณไม่มีสิทธิ์ดูหรือจัดการข้อมูลส่วนนี้ของพนักงานคนนี้",
  self: "บันทึกหรือดำเนินการกับข้อมูลของตัวเองไม่ได้ — ให้ผู้ดูแลคนอื่นทำแทน",
  ended: "พนักงานคนนี้สิ้นสุดการจ้างแล้ว",
  endFuture: "วันสิ้นสุดงานต้องไม่เกินวันนี้ — ถ้ายังไม่ถึงวันออก ให้ตั้งวันสิ้นสุดสัญญาไว้ก่อน",
  endBefore: "วันสิ้นสุดงานต้องไม่ก่อนวันเริ่มงาน",
  reason: "เลือกเหตุผลการสิ้นสุดการจ้าง",
  note: "หมายเหตุยาวเกินไป (ไม่เกิน 500 ตัวอักษร)",
  kind: "ชนิดบันทึกไม่ถูกต้อง",
  title: "กรุณาใส่หัวข้อ (ไม่เกิน 120 ตัวอักษร)",
  body: "กรุณาใส่รายละเอียด (ไม่เกิน 4,000 ตัวอักษร)",
  period: "การประเมินต้องระบุไตรมาส เช่น 2026-Q4",
  score: "คะแนนใช้ได้เฉพาะการประเมิน และต้องเป็น 1 ถึง 5",
  notProbation: "พนักงานคนนี้ไม่ได้อยู่ระหว่างทดลองงาน",
  lead: "จำนวนวันแจ้งล่วงหน้าไม่ถูกต้อง",
  board: "ไม่พบบอร์ดงานนี้ในร้าน — เลือกบอร์ดใหม่",
  template: "รายการตรวจสอบไม่ถูกต้อง (หัวข้อ 1–80 ตัวอักษร · ไม่เกิน 20 ข้อ · รหัสไม่ซ้ำ)",
  // r2 (controller rulings 1 · 8)
  revokeOwner: "พนักงานคนนี้ผูกกับบัญชีเจ้าของร้าน — เปลี่ยนเจ้าของร้านที่หน้าตั้งค่าร้านก่อน จึงจะสิ้นสุดการจ้างได้",
  revokeManager: "การถอนสิทธิ์บัญชีของผู้จัดการทำได้เฉพาะเจ้าของร้าน — ให้เจ้าของร้านเป็นผู้สิ้นสุดการจ้างคนนี้",
  keepAccess: "ร้านตั้งให้ถอนสิทธิ์บัญชีเมื่อสิ้นสุดการจ้าง — เฉพาะเจ้าของร้านเลือกเก็บสิทธิ์ไว้ได้",
  ownerSwitch: "ปิดการล้าง PIN หรือการถอนสิทธิ์บัญชีอัตโนมัติได้เฉพาะเจ้าของร้าน",
  offActive: "เริ่มรายการออกจากงานได้หลังสิ้นสุดการจ้างแล้วเท่านั้น",
};
const NO_PERM = "คุณไม่มีสิทธิ์ตั้งค่าระบบพนักงาน";
const SHOP_WIDE = "รายการที่ใช้ทั้งร้านจัดการได้เฉพาะผู้ดูแลทุกสาขา — เลือกสาขาของคุณ";
const PIN_WRONG = "PIN ไม่ถูกต้อง";
const M_INACTIVE = "สถานะพนักงานของคุณปิดอยู่ — ติดต่อผู้จัดการ";
const ON_KEYS = ["id_card", "sso", "bank", "pin", "roster", "contract", "pos_training"];
const OFF_KEYS = ["pin_revoked", "app_access", "property", "final_pay", "sso_out", "certificate"];
const NOTE_KEYS = "acknowledgedAt,authorName,body,createdAt,id,kind,periodLabel,score,title,visibleToEmployee";
const SELF_NOTE_KEYS = "acknowledgedAt,body,createdAt,id,kind,periodLabel,score,title";
// ORACLE-EDIT (builder H4.4 · S8.2): the literal was not in srt() order ("done" sorts before "doneAt") ⇒ could never match · same 8 keys
const TASK_KEYS = "done,doneAt,dueDate,hasCard,id,kind,sortOrder,title";
const DUE_KEYS = "date,employeeId,kind,name,open";
const UI_IDS = ["due", "banner", "pass", "checklist", "start-onboarding", "start-offboarding", "notes", "note-add", "offboard", "offboard-date", "offboard-reason", "offboard-note", "offboard-access", "offboard-confirm", "settings", "lead-probation", "lead-contract", "kanban", "template-onboarding", "template-offboarding"].map((s) => `hr-life-${s}`);
const UI_DYN = ["hr-life-due-*", "hr-life-task-*", "hr-life-note-*"];

// registry: id | group | sev C/M/m | base R/G | title
const SEV: Record<string, Sev> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS: readonly Def[] = `
S1.1|R1|M|R|[static] migration last · enum 5 labels · no ALTER TYPE/DROP
S1.2|R1|M|R|[static] 4 columns · CHECK note ≤ 500 · 2 indexes · note FK RESTRICT
S1.3|R1|M|R|[static] hr.prisma enum + fields · note Restrict · task Cascade
S1.4|R1|C|R|[db] 4 columns on the lane DB
S2.1|R4|M|R|policy defaults (14/30 · UNIT_MANAGER · kanban off · revoke ×2 · templates)
S2.2|R4|M|R|owner save ⇒ read back · hrClock kept · audit
S2.3|R4|M|R|settings validation texts
S2.4|R4|C|R|settings viewers (mgr-all ok · shopWide · noPermission)
S3.1|R5|C|R|sweep now=2030 ⇒ 0 (no today)
S3.2|R5|C|R|sweep ⇒ exactly P1/P4/C1 · key · payload ids only · systemId
S3.3|R5|M|R|rerun ⇒ 0 + quiet (outbox/audit) · next day ⇒ 0
S3.4|R5|M|R|extension ⇒ one new alert
S3.5|R5|M|R|bounded + fair: 60 ⇒ 50 then 60 · small system 3 in run 1
S4.1|R6|M|R|lifecycleDue owner: exact keys · P1/P4/C1 · no ended
S4.2|R6|C|R|lifecycleDue scope: mgr-u1 u1 only · others null
S4.3|R7|M|R|confirmProbation · notProbation · noAccess
S5.1|R8|C|R|offboard result: pinRevoked · cancelled 2/2/2 · spanning 1
S5.2|R8|C|R|row ENDED + offboard* · PIN null
S5.3|R8|M|R|leaves: future cancelled (+ approval) · spanning/past untouched
S5.4|R8|M|R|swaps closed · roster after end deleted · OT untouched
S5.5|R8/R14|C|R|1 event {employeeId,endDate} · no note/reason in outbox/audit
S5.6|R8|M|R|6 offboarding tasks · pin_revoked + app_access done · access revoked
S5.7|R8|M|R|offboard validation texts · refusals write nothing
S5.8|R3/R8|C|R|offboard gate: noAccess ×4 (same bytes) · mgr-role in branch ok
S5.9|R4/R8|M|R|autoRevokePin=false: hash kept · verifyPin refused
S5.10|R14|C|R|loadLifecycleForViewer keys · owner/mgr-u1 only
S6.1|R9|C|R|after: verifyPin ×2 + kiosk refused · clock no row
S6.2|R9|C|R|after: mobile · POS clockSelf/onShiftToday · kiosk list
S6.3|R9|C|R|restore two-step: PIN stays null · history kept
S6.4|R9|M|R|re-offboard: 2 events · overwritten
S7.1|R10|M|R|notes: WRITTEN forced visible · REVIEW · NOTE hidden · ENDED ok
S7.2|R10|M|R|note validation texts
S7.3|R3/R10|C|R|note non-viewers ×7 same noAccess · self
S7.4|R10|C|R|listReviewNotes keys · non-viewers null
S7.5|R10|C|R|myReviewNotes: own visible only · keys · peers none
S7.6|R10|M|R|acknowledge once · hidden/peer noAccess
S7.7|R10/R14|C|R|note audits clean · no outbox
S8.1|R11|M|R|startChecklist 7 · 1 event · idempotent · race
S8.2|R11|M|R|listChecklist keys · setTaskDone on/off
S8.3|R11|C|R|checklist non-viewers
S9.1|R12/R13|C|R|3 consumers · kanban off ⇒ 0 cards
S9.2|R12|C|R|milestone replay ×2 ⇒ 1 card (key · title)
S9.3|R12|M|R|checklist replay ×2 ⇒ 1 card per open task · linked
S9.4|R12/R14|C|R|offboarded replay ×2 ⇒ open tasks once · no leak in cards
S10.1|R8|C|R|[race] offboard waits on hr:clock · IN kept · ENDED
S10.2|R8|C|R|[race] offboard ×4 ⇒ 1 ok · 1 event/audit · 6 tasks
S10.3|R5|C|R|[race] sweep ∥ sweep ⇒ once each
S10.4|R8|C|R|[race] offboard ∥ setPin ⇒ PIN null
S16.1|r2-1|C|R|r2 STAFF clerk offboard ⇒ STAFF target access revoked in tx (membership · link · push · task)
S16.2|r2-1|C|R|r2 MANAGER target: non-owner revoke refused (nothing written) · owner ok
S16.3|r2-1|C|R|r2 OWNER-linked row: offboard refused for everyone (nothing written)
S16.4|r2-1|M|R|r2 untick: non-owner refused when policy revokes · owner keeps ⇒ accessKept
S16.5|r2-2|C|R|r2 self row: no hidden notes · no checklist · no offboard reason/note · tick/start refused
S16.6|r2-3|C|R|[race] r2 clockSelf ∥ offboard ⇒ no IN row for the ENDED employee
S16.7|r2-5|M|R|r2 decided approval request ⇒ leave CANCELLED · audit names the kept request
S16.8|r2-6|M|R|r2 audits: offboard ids + in tx · checklist start · tick/untick · acknowledge
S16.9|r2-8|M|R|r2 card assignee has HR rights · never the employee the card is about
S16.10|r2-8|M|R|r2 only OWNER switches off autoRevokePin / revokeAppAccess
S16.11|r2-8|M|R|[static] r2 sweep window ordered by due date
S16.12|r2-8|M|R|r2 offboarding checklist refused on an ACTIVE employee
S16.13|r3-1|C|R|r3 leave ledger: APPROVED 3d + PENDING 2d after end ⇒ year Σ = 10.0 · both CANCELLED · audit ids · re-run no-op
S16.14|r3-1|C|R|r3 a PENDING leave left on an ENDED employee cannot be approved (no USE row)
S16.15|r3-3|M|R|r3 due panel never lists the viewer's own row
S16.16|r3-2|M|R|[static] r3 remove + ENDED save show the "account kept" message
S11.1|R1|C|R|[db] delete employee with note ⇒ 23503 · note kept
S11.2|R1|M|R|[db] FK actions r/c
S11.3|R1|M|G|[static] no hrEmployee.delete in src
S12.1|R2|C|R|[static] lifecycle-actions use server · 7 wrappers · no DB · no now:
S12.2|R9|C|R|[static] remove + ENDED save → offboardEmployee
S12.3|R14|C|R|[static] emit/audit blocks free of sensitive keys
S12.4|R12/R14|C|R|[static] bridge via links only · clean
S12.5|R14|C|R|[static] AI + client files clean
S12.6|R14|M|R|[static] fitness-hr lists · fitness ×2 no env
S13.1|§5|M|R|[static] testids 20 + 3 · tokens only · 44 px
S13.2|§5|M|R|[static] inventory rows ⇄ testids
S13.3|§5|M|R|[static] hr.life th = en
S13.5|§5|M|G|[static] no new tab (layout + hrTabs as base)
S13.6|§5|M|R|[static] mounts: profile · settings · register
S14.1|R5/R13|M|R|[static] marked hunks: consumers (3) · cron (now: new Date())
S14.2|R13|M|R|[static] labels: 3 events once each
S15.1|frozen|C|G|[static] payroll-rules sha · 8 HR files unchanged
S15.2|frozen|M|G|[db] setEmployeeActive(false) keeps hash
Z1|house|C|G|no residue
`.trim().split("\n").map((l) => {
  const [id, g, sv, b, t] = l.split("|");
  return [`H4.4-${id}`, g, SEV[sv], (b === "R" ? "RED" : "GREEN") as Base, t] as const;
});
const { chk, printList, skipExit, finish } = makeRegistry(SUITE, "H4.4-", CHECKS);
if (ARGV.includes("--list")) {
  printList();
  process.exit(0);
}
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, F.life))) skipReasons.push(`${F.life} absent (H4.4 not built)`);
if (skipReasons.length && !FORCE) skipExit(skipReasons);
const ck = (id: string, r: Record<string, unknown>, exp: string, extra = "") => chk(id, Object.values(r).every(Boolean), exp, `${failedKeys(r)}${extra ? ` ${extra}` : ""}`);
const BASE = baseRef("QC_H44_BASE");
const IN_BASE = pathInBase(F.life, BASE);
const git = (a: string[]) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }).trim();
const atBase = (p: string) => {
  try {
    return git(["show", `${BASE}:${p}`]);
  } catch {
    return "";
  }
};
const block = (src: string, start: RegExp, len = 900) => {
  const i = src.search(start);
  return i < 0 ? "" : src.slice(i, i + len);
};

// ═════════════════════════ statics ═════════════════════════
function runStatic(): void {
  const mig = rd(F.mig);
  {
    const dirs = readdirSync(join(ROOT, "prisma/migrations")).filter((d) => /^\d{14}_/.test(d)).sort();
    const r = {
      file: !!mig,
      last: dirs.includes("20261231000000_hr_lifecycle") && !dirs.some((d) => d > "20261231000000_hr_lifecycle" && /_hr_/.test(d)) && dirs.filter((d) => /_hr_/.test(d) && d < "20261231000000").length > 0,
      enum: /CREATE TYPE "HrOffboardReason" AS ENUM \('RESIGNED',\s*'CONTRACT_END',\s*'PROBATION_FAILED',\s*'TERMINATED',\s*'OTHER'\)/.test(mig),
      noAlter: !/ALTER TYPE|DROP TABLE|DROP COLUMN|DROP TYPE/i.test(mig),
    };
    ck("S1.1", r, "folder last · enum · no ALTER TYPE/DROP");
  }
  {
    const r = {
      at: /"offboardedAt"\s+TIMESTAMP\(3\)/.test(mig), reason: /"offboardReason"\s+"HrOffboardReason"/.test(mig), note: /"offboardNote"\s+TEXT/.test(mig), by: /"offboardedById"\s+TEXT/.test(mig),
      check: /CHECK[\s\S]{0,80}"offboardNote"[\s\S]{0,40}500/.test(mig),
      idxP: /CREATE INDEX[^;]*"HrEmployee"[^;]*"systemId",\s*"probationEndAt"/.test(mig), idxC: /CREATE INDEX[^;]*"HrEmployee"[^;]*"systemId",\s*"contractEndAt"/.test(mig),
      fk: /"HrReviewNote_employeeId_fkey"[^;]*ON DELETE RESTRICT/.test(mig),
    };
    ck("S1.2", r, "columns · CHECK · indexes · FK RESTRICT");
  }
  {
    const s = stripComments(rd(F.schema));
    const emp = block(s, /model HrEmployee \{/, 6000);
    const note = block(s, /model HrReviewNote \{/, 900);
    const task = block(s, /model HrOnboardingTask \{/, 900);
    const r = {
      enum: /enum HrOffboardReason \{\s*RESIGNED\s+CONTRACT_END\s+PROBATION_FAILED\s+TERMINATED\s+OTHER\s*\}/.test(s),
      fields: ["offboardedAt\\s+DateTime\\?", "offboardReason\\s+HrOffboardReason\\?", "offboardNote\\s+String\\?", "offboardedById\\s+String\\?"].every((f) => new RegExp(f).test(emp)),
      restrict: /employee\s+HrEmployee\s+@relation\([^)]*onDelete:\s*Restrict/.test(note), cascade: /employee\s+HrEmployee\s+@relation\([^)]*onDelete:\s*Cascade/.test(task),
    };
    ck("S1.3", r, "enum · 4 fields · Restrict/Cascade");
  }

  chk("S11.3", !/hrEmployee\s*\.\s*delete(Many)?\s*\(/.test(gitGrep("hrEmployee", ["src"]).map((f) => stripComments(rd(f))).join("\n")), "none", gitGrep("hrEmployee\\s*\\.\\s*delete", ["src"]).join(",") || "none");
  {
    const a = stripComments(rd(F.acts));
    const names = ["offboardEmployeeAction", "addReviewNoteAction", "acknowledgeReviewNoteAction", "startChecklistAction", "setTaskDoneAction", "confirmProbationAction", "saveLifecyclePolicyAction"];
    const u = useServerFile(a, names, [/requireTenant\(/]);
    const noDb = !importsOf(a).some((i) => !i.type && /core\/db|@prisma\/client/.test(i.spec));
    const nowFiles = [F.acts, F.actions, F.ui, F.hrUi, F.profile, F.settings].filter((f) => /\bnow\s*:/.test(stripComments(rd(f))));
    ck("S12.1", { ...u.r, noDb, noNow: !nowFiles.length }, "7", `${u.got.join()} ${nowFiles.join()}`);
  }
  {
    const a = stripComments(rd(F.actions));
    const rem = block(a, /export async function removeEmployeeAction/, 900).split(/\nexport /)[0];
    const save = block(a, /export async function saveEmployeeProfileAction/, 3000).split(/\nexport /)[0];
    const r = { remove: /offboardEmployee\(/.test(rem), ended: /offboardEmployee\(/.test(save), noFalse: !/setEmployeeActive\([^)]*false\s*\)/.test(a) };
    ck("S12.2", r, "remove + ENDED → offboardEmployee");
  }
  {
    const l = stripComments(rd(F.life));
    const segs = (re: RegExp) => [...l.matchAll(re)].map((x) => l.slice(x.index ?? 0, (x.index ?? 0) + 500).split(/\}\s*\)\s*;/)[0]);
    const ev = segs(/emitOutbox\w*\(/g);
    const au = segs(/writeAudit\(/g);
    const bad = /offboardNote|offboardReason|\bnote\s*[:,}]|\bbody\b|\btitle\b|\bscore\b|\breason\s*[:,}]/;
    ck("S12.3", { file: !!l, events: ev.length >= 1, clean: [...ev, ...au].every((s) => !bad.test(s)) }, "clean", `${ev.length}/${au.length} ${[...ev, ...au].filter((s) => bad.test(s)).map((s) => short(s, 50)).join(" | ")}`);
  }
  {
    const b = stripComments(rd(F.bridge));
    const r = {
      file: !!b, links: /createCardFromExternal/.test(b) && importsOf(b).some((i) => /kanban\/links/.test(i.spec)),
      noTables: !/\.(hrEmployee|hrReviewNote|hrOnboardingTask)\b/.test(b), clean: !/offboardNote|offboardReason|\bscore\b|\.body\b|HrReviewNote/.test(b), gate: /enabled/.test(b),
    };
    ck("S12.4", r, "clean");
  }
  {
    const ai = gitGrep("HrReviewNote|hrReviewNote|offboardNote|offboardReason", ["src/lib/ai"]);
    const clients = gitGrep("use client", [H]).filter((f) => /^\s*["']use client["']/.test(rd(f)));
    const imp = clients.filter((f) => importsOf(rd(f)).some((i) => !i.type && /(^|\/)lifecycle(\.ts)?$/.test(i.spec)));
    ck("S12.5", { ai: !ai.length, client: !imp.length, ui: !!rd(F.ui) }, "clean", `${ai.join(",")} ${imp.join(",")}`);
  }
  {
    const s = rd(F.ui);
    const ids = testidsOf(s, "hr-life-");
    const miss = [...UI_IDS, ...UI_DYN].filter((t) => !ids.has(t));
    ck("S13.1", { file: !!s, ids: !miss.length, ...tokensOnly(stripComments(s)), h44: /min-h-\[44px\]|min-h-11\b|h-11\b/.test(s) }, "ids · tokens · 44 px", miss.join());
    const rows = ((jsonOf(F.inv)?.rows ?? []) as Any[]).filter((r) => String(r.testid ?? "").startsWith("hr-life-"));
    const rowIds = new Set(rows.map((r) => String(r.testid)));
    const want = [...UI_IDS, ...UI_DYN];
    ck("S13.2", { some: rows.length > 0, codeRow: want.every((t) => rowIds.has(t)), rowCode: [...rowIds].every((t) => ids.has(t)), meta: rows.every((r) => r.wo === "H4.4" && r.oracle === "qc-hr-h4.4") }, "rows", `rows=${rows.length}`);
    const th = flat(jsonOf(F.th)?.hr?.life ?? {});
    const en = flat(jsonOf(F.en)?.hr?.life ?? {});
    const mp = msgParity(th, en, []);
    ck("S13.3", mp, "hr.life th=en", `th=${Object.keys(th).length} en=${Object.keys(en).length}`);
  }
  {
    const tabs = (src: string) => block(src, /export function hrTabs/, 1600).split("\n}\n")[0];
    const r = { layout: changedVsBase(BASE, [F.layout]) === "unchanged", tabs: tabs(rd(F.hrUi)) === tabs(atBase(F.hrUi)) && tabs(rd(F.hrUi)).length > 0 };
    ck("S13.5", r, "layout + hrTabs as base", BASE.slice(0, 9));
  }
  {
    const p = stripComments(rd(F.profile));
    const r = { profile: /loadLifecycleForViewer/.test(p) && /lifecycle-ui/.test(p), settings: /lifecycle-ui/.test(stripComments(rd(F.settings))), register: /lifecycleDue/.test(stripComments(rd(F.hrUi)) + stripComments(rd(F.ui))) };
    ck("S13.6", r, "profile · settings · register mounts");
  }
  {
    const c = rd(F.consumers);
    const b = block(c, /HR H4\.4 ▸/, 1600);
    const hunks = IN_BASE ? null : diffHunks(BASE, F.consumers);
    const cb = block(rd(F.cron), /HR H4\.4 ▸/, 900);
    const ch = IN_BASE ? null : diffHunks(BASE, F.cron);
    const one = (h: unknown[] | null) => IN_BASE || (h !== null && h.length === 1);
    const r = { block: Object.values(EV).every((e) => b.includes(`"${e}"`)) && /◂/.test(b), hunk: one(hunks), cron: /sweepLifecycleAlerts\(\s*\{\s*now:\s*new Date\(\)/.test(cb) && /catch/.test(cb) && /◂ HR H4\.4/.test(cb), cronHunk: one(ch) };
    ck("S14.1", r, "hunks", IN_BASE ? "n/a hunk count · H4.4 in base" : `${hunks?.length}/${ch?.length}`);
    const l = stripComments(rd(F.labels));
    const n = Object.values(EV).map((e) => (l.match(new RegExp(`value:\\s*"${e.replace(/\./g, "\\.")}"`, "g")) ?? []).length);
    chk("S14.2", n.every((x) => x === 1), "1·1·1", n.join("·"));
  }
  {
    // ORACLE-EDIT (r2 ruling 3): pos-seam.ts may carry ONE marked hunk (clockSelf requireActive) — the other 7 stay byte-identical
    const files = ["rules.ts", "pos-seam-read.ts", "index.ts", "privacy-shared.ts", "pin.ts", "clock.ts", "service.ts"].map((f) => H + f);
    const seamH = IN_BASE ? null : diffHunks(BASE, `${H}pos-seam.ts`);
    const seamOk = IN_BASE || (seamH !== null && (seamH.length === 0 || (seamH.length === 1 && /HR H4\.4 ▸/.test(seamH[0].added.join("\n")))));
    const d = IN_BASE ? "n/a · H4.4 in base" : seamOk ? changedVsBase(BASE, files) : `pos-seam.ts hunks=${seamH?.length}`;
    const s = sha(rd(PAYROLL_RULES_FILE));
    chk("S15.1", s === PAYROLL_RULES_SHA && (IN_BASE || d === "unchanged"), `${PAYROLL_RULES_SHA.slice(0, 12)} · unchanged`, `${s.slice(0, 12)} · ${d}`);
  }
  {
    // r2 ruling 8: the candidate scan of the sweep is ordered by the due date (new entrants cannot be starved behind old ids)
    const l = stripComments(rd(F.life));
    const scans = [...l.matchAll(/hrEmployee\.findMany\(\{[\s\S]{0,600}?\}\s*\)/g)].map((m) => m[0]).filter((x) => /probationEndAt|contractEndAt/.test(x) && /take:/.test(x));
    const orderOf = (x: string) => x.match(/orderBy:\s*(\{[^}]*\}|\[[^\]]*\])/)?.[1] ?? "";
    const ok = scans.length > 0 && scans.every((x) => /probationEndAt|contractEndAt/.test(orderOf(x)));
    chk("S16.11", ok, "every due scan orderBy date", `${scans.length} scans`);
  }
}
function gitGrep(pat: string, paths: string[]): string[] {
  try {
    return git(["grep", "-lE", pat, "--", ...paths]).split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

// ═════════════════════════ DB ═════════════════════════
type RO = { ok: boolean; text: string; value: Any };
async function callMod(Mo: Any, fn: string, args: unknown[]): Promise<RO> {
  const mo = Mo && !Mo.__err ? Mo : null;
  if (typeof mo?.[fn] !== "function") return { ok: false, text: `∅${fn} (${modState(Mo, F.life)})`, value: undefined };
  try {
    const v = (await mo[fn](...args)) as Any;
    const ok = v !== null && v !== undefined && !(typeof v === "object" && v.ok === false);
    return { ok, text: ok ? "" : textOf(v), value: v };
  } catch (e) {
    return { ok: false, text: `THROW ${errText(e)}`, value: undefined };
  }
}
const shown = (r: RO) => (r.ok ? "ok" : `"${short(r.text, 50)}"`);
const fail = (x: unknown) => ({ ok: false, reason: errText(x), code: errText(x) });
const keysOf = (o: Any) => (o && typeof o === "object" ? srt(Object.keys(o)) : "∅");

const { P, coreHash } = await qc4Env(SUITE);
if (FORCE && skipReasons.length) console.log(`⚠️ QC_FORCE=1 — running although: ${skipReasons.join(" · ")}`);
const L = await loadOpt(F.life, "@/lib/modules/hr/lifecycle");
console.log(`[${SUITE}] lifecycle=${modState(L, F.life)} · base=${BASE.slice(0, 9)}${IN_BASE ? " (H4.4 in base)" : ""}`);
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const hr = (await import("@/lib/modules/hr/service")) as Any;
const pin = (await import("@/lib/modules/hr/pin")) as Any;
const clk = (await import("@/lib/modules/hr/clock")) as Any;
const seam = (await import("@/lib/modules/hr/pos-seam")) as Any;
const OC = (await import("@/lib/outbox-consumers")) as Any;
const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${SLUG_PREFIX}${Date.now()}${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
const L_ = (fn: string, ...a: unknown[]) => callMod(L, fn, a);
const bkk = (day: string, hm = "10:00") => new Date(`${day}T${hm}:00+07:00`);
const DAY = "2031-06-10";
const NOW = bkk(DAY);
const NOW1 = bkk("2031-06-11");
const OLD = bkk("2030-01-01");

async function underLock<R>(key: string, call: () => Promise<R>, during: (tx: Any) => Promise<unknown>): Promise<{ res: R; waited: boolean; holderErr: string }> {
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
  const TT = await fx.newTenant("", "QC HR H4.4 วงจรพนักงาน");
  const T2 = await fx.newTenant("-other", "QC HR H4.4 ร้านอื่น");
  const u1 = await fx.newUnit(TT, `สาขาเหนือ ${tag}`, "u1");
  const u2 = await fx.newUnit(TT, `สาขาใต้ ${tag}`, "u2");
  const sys = async (n: string, t = TT) => (await sysSvc.createSystem(t, "HR", `${n} ${tag}`)).id as string;
  const sA = await sys("ทีม A");
  const sO = await sys("ทีมอื่น", T2);
  const cA = { tenantId: TT, systemId: sA };
  const cO = { tenantId: T2, systemId: sO };
  const K = { "hr.employee.create": true };
  const mk = (t: string, r: Who["role"], ua: string[], p: Record<string, boolean>, tid = TT) => fx.mkUser(tid, t, `QC44 ${t} ${tag}`, r, ua, p);
  const U = {
    owner: await mk("owner", "OWNER", [], {}), mgrU1: await mk("mgru1", "MANAGER", [u1], K), mgrAll: await mk("mgrall", "MANAGER", ["*"], K), mgrRole: await mk("mgrrole", "MANAGER", [u1], {}),
    pay: await mk("pay", "STAFF", ["*"], { "hr.payroll.read": true }), leave: await mk("leave", "STAFF", [u1], { "hr.leave.read": true }), member: await mk("member", "STAFF", [], {}),
    a: await mk("sa", "STAFF", [u1], {}), d: await mk("sd", "STAFF", [u2], {}), o: await mk("so", "STAFF", [u1], {}), n: await mk("sn", "STAFF", [u1], {}), other: await mk("other", "OWNER", [], {}, T2),
  };
  const V = Object.fromEntries(Object.entries(U).map(([k, w]) => [k, vOf(w)])) as Record<keyof typeof U, Any>;
  const emp = async (s: string, n: string, o: Any = {}, x: Any = {}) => {
    const id = await fx.mkEmp(TT, s, `QC44 ${n} ${tag}`, { unitId: u1, startDate: "2031-01-05", status: "ACTIVE", ...o });
    if (Object.keys(x).length) await P.hrEmployee.update({ where: { id }, data: x });
    return id;
  };
  const withPin = async (ctx: Any, id: string, p: string) => {
    const r = await hr.setPin(ctx, id, p).catch(() => ({ ok: false }));
    if (!r?.ok) await P.hrEmployee.update({ where: { id }, data: { pinHash: `qc-fake-${tag}-${id}`, pinSetAt: new Date() } });
  };
  const evs = async (type: string) => await fm("outboxEvent", { tenantId: TT, type }, { orderBy: { createdAt: "asc" } });
  const evOf = (rows: Any[], ids: string[]) => rows.filter((e) => ids.includes(String(e.payload?.employeeId)));
  const counts = async () => `${await cnt("outboxEvent", { tenantId: TT })}:${await cnt("auditLog", { tenantId: TT })}`;
  const sweep = (now: Date) => L_("sweepLifecycleAlerts", { now, tenantId: TT });
  const row = (id: string) => P.hrEmployee.findUnique({ where: { id } }) as Promise<Any>;
  const fm = (mo: string, where: Any, o: Any = {}) => P[mo].findMany({ where, ...o }) as Promise<Any[]>;
  const fu = (mo: string, id: string) => P[mo].findUnique({ where: { id: id || "∅" } }) as Promise<Any>;
  const cnt = (mo: string, where: Any) => P[mo].count({ where }) as Promise<number>;
  const three = <R,>(f: (v: Any) => Promise<R>) => Promise.all([V.mgrRole, V.pay, V.member].map(f));
  const ob = (v: Any, e: string, i: Any, now = NOW, c: Any = cA) => L_("offboardEmployee", c, v, e, i, { now });
  const sv = (c: Any, v: Any, x: Any) => L_("saveLifecyclePolicy", c, v, x);
  const stc = (v: Any, e: string, k: string, c: Any = cA) => L_("startChecklist", c, v, e, k);
  const lsc = (v: Any, e: string) => L_("listChecklist", cA, v, e);
  const lrn = (v: Any, e: string) => L_("listReviewNotes", cA, v, e);
  const ack = (w: Who, id: string) => L_("acknowledgeReviewNote", { tenantId: TT, userId: w.id }, id);
  const my = (w: Who) => L_("myReviewNotes", { tenantId: TT, userId: w.id });
  const due = (v: Any) => L_("lifecycleDue", cA, v, { now: NOW });
  const vpin = (p: string, sysId: string) => pin.verifyPin({ tenantId: TT, pin: p, callerKey: `qc44-${tag}`, systemId: sysId }).catch(fail);

  const sS = await sys("ทีมตั้งค่า");
  const cS = { tenantId: TT, systemId: sS };
  await P.appSystem.update({ where: { id: sS }, data: { settings: { hrClock: { earlyInMin: 100, closeGraceMin: 200 } } } });
  {
    const g = (await L_("getLifecyclePolicy", cS)).value ?? {};
    const r = {
      lead: g.probationLeadDays === 14 && g.contractLeadDays === 30, assign: g.assignTo === "UNIT_MANAGER", kanban: g.kanban?.enabled === false && g.kanban?.boardId === null,
      revoke: g.autoRevokePin === true && g.revokeAppAccess === true,
      tpl: (g.onboardingTemplate ?? []).map((x: Any) => x.key).join() === ON_KEYS.join() && (g.offboardingTemplate ?? []).map((x: Any) => x.key).join() === OFF_KEYS.join(),
    };
    ck("S2.1", r, "defaults");
  }
  {
    const a0 = await cnt("auditLog", { tenantId: TT, action: "hr.settings.lifecycle.update" });
    const s = await sv(cS, V.owner, { probationLeadDays: 20 });
    const g = (await L_("getLifecyclePolicy", cS)).value ?? {};
    const st = (await fu("appSystem", sS))?.settings ?? {};
    const a1 = await cnt("auditLog", { tenantId: TT, action: "hr.settings.lifecycle.update" });
    ck("S2.2", { ok: s.ok, read: g.probationLeadDays === 20 && g.contractLeadDays === 30, clock: st.hrClock?.earlyInMin === 100, audit: a1 === a0 + 1 }, "20", shown(s));
  }
  {
    const tpl = [{ key: "a", title: "หนึ่ง", dueDays: 0 }, { key: "a", title: "สอง", dueDays: 0 }];
    const r = [
      await sv(cS, V.owner, { probationLeadDays: 91 }), await sv(cS, V.owner, { contractLeadDays: -1 }),
      await sv(cS, V.owner, { onboardingTemplate: tpl }), await sv(cS, V.owner, { kanban: { enabled: true, boardId: "nope" } }),
    ];
    const want = [T.lead, T.lead, T.template, T.board];
    chk("S2.3", r.every((x, i) => !x.ok && x.text === want[i]), "texts", r.map(shown).join(" "));
  }
  {
    const before = JSON.stringify((await fu("appSystem", sS))?.settings ?? {});
    const ok = await sv(cS, V.mgrAll, { contractLeadDays: 31 });
    const after1 = JSON.stringify((await fu("appSystem", sS))?.settings ?? {});
    const deny = [await sv(cS, V.mgrU1, { contractLeadDays: 5 }), ...(await three((v) => sv(cS, v, { contractLeadDays: 5 })))];
    const after2 = JSON.stringify((await fu("appSystem", sS))?.settings ?? {});
    const r = { all: ok.ok && after1 !== before, shop: deny[0].text === SHOP_WIDE, perm: deny.slice(1).every((x) => x.text === NO_PERM), none: after2 === after1 };
    ck("S2.4", r, "viewers", deny.map(shown).join(" "));
  }

  const E: Record<string, string> = {};
  E.P1 = await emp(sA, "p1", { status: "PROBATION" }, { probationEndAt: dbDate("2031-06-20") });
  E.P2 = await emp(sA, "p2", { status: "PROBATION" }, { probationEndAt: dbDate("2031-07-10") });
  E.P3 = await emp(sA, "p3", { status: "ACTIVE" }, { probationEndAt: dbDate("2031-06-15") });
  E.P4 = await emp(sA, "p4", { status: "PROBATION" }, { probationEndAt: dbDate("2031-06-01") });
  E.C1 = await emp(sA, "c1", { unitId: u2 }, { contractEndAt: dbDate("2031-07-05") });
  E.C2 = await emp(sA, "c2", { status: "ACTIVE" }, { contractEndAt: dbDate("2031-08-01") });
  E.X = await emp(sA, "x", { status: "ENDED", active: false }, { probationEndAt: dbDate("2031-06-12") });
  const sweepIds = Object.values(E);
  {
    const r = await sweep(OLD);
    const n = evOf(await evs(EV.due), sweepIds).length;
    chk("S3.1", r.ok && n === 0, "ok · 0", `${shown(r)} n=${n}`);
  }
  const r32 = await sweep(NOW);
  {
    const rows = evOf(await evs(EV.due), sweepIds);
    const got = srt(rows.map((e) => `${e.payload?.employeeId === E.P1 ? "P1" : e.payload?.employeeId === E.P4 ? "P4" : e.payload?.employeeId === E.C1 ? "C1" : "?"}:${e.payload?.milestone}:${e.payload?.dueDate}`));
    const want = srt(["P1:PROBATION_END:2031-06-20", "P4:PROBATION_END:2031-06-01", "C1:CONTRACT_END:2031-07-05"]);
    const keys = rows.every((e) => keysOf(e.payload) === "dueDate,employeeId,milestone" && e.idempotencyKey === `${EV.due}#${e.payload.employeeId}#${e.payload.milestone}#${e.payload.dueDate}`);
    ck("S3.2", { ok: r32.ok, set: got === want, keys, sys: rows.every((e) => e.systemId === sA) }, want, `${shown(r32)} got=${got}`);
  }
  {
    const c0 = await counts();
    const a = await sweep(NOW);
    const c1 = await counts();
    const b = await sweep(NOW1);
    const c2 = await counts();
    ck("S3.3", { a: a.ok && a.value?.emitted === 0, quiet: c0 === c1, b: b.ok && b.value?.emitted === 0 && c2 === c1 }, "0 · quiet · 0", `${c0}/${c1}/${c2}`);
  }
  {
    await P.hrEmployee.update({ where: { id: E.P1 }, data: { probationEndAt: dbDate("2031-06-23") } });
    const r = await sweep(NOW);
    const rows = evOf(await evs(EV.due), [E.P1]);
    chk("S3.4", r.ok && rows.length === 2 && rows.some((e) => e.payload?.dueDate === "2031-06-23"), "06-20,06-23", rows.map((e) => e.payload?.dueDate).join());
  }
  const sBig = await sys("ทีมใหญ่");
  const sSmall = await sys("ทีมเล็ก");
  {
    const mkMany = async (s: string, n: number) => {
      await P.hrEmployee.createMany({ data: Array.from({ length: n }, (_, i) => ({ tenantId: TT, systemId: s, name: `QC44 g ${tag} ${"abcdefghij"[i % 10]}${"abcdefghij"[Math.floor(i / 10)]}`, unitId: u1, employmentStatus: "PROBATION", probationEndAt: dbDate("2031-06-18") })) });
      return (await fm("hrEmployee", { systemId: s }, { select: { id: true } })).map((x) => x.id as string);
    };
    const big = await mkMany(sBig, 60);
    const small = await mkMany(sSmall, 3);
    await sweep(NOW);
    const n1 = [evOf(await evs(EV.due), big).length, evOf(await evs(EV.due), small).length];
    await sweep(NOW);
    const n2 = evOf(await evs(EV.due), big).length;
    chk("S3.5", n1[0] === 50 && n1[1] === 3 && n2 === 60, "50+3 then 60", `${n1.join("+")} then ${n2}`);
  }

  {
    const o = await due(V.owner);
    const items = (o.value?.items ?? []) as Any[];
    const has = (id: string, k: string) => items.some((i) => i.employeeId === id && i.kind === k);
    ck("S4.1", { ok: o.ok, keys: items.length > 0 && items.every((i) => keysOf(i) === DUE_KEYS), p1: has(E.P1, "PROBATION_END"), p4: has(E.P4, "PROBATION_END"), c1: has(E.C1, "CONTRACT_END"), x: !items.some((i) => i.employeeId === E.X) }, "items", `${shown(o)} n=${items.length}`);
    const mg = await due(V.mgrU1);
    const deny = await three((v) => due(v));
    const mi = (mg.value?.items ?? []) as Any[];
    ck("S4.2", { mgr: mg.ok && mi.some((i) => i.employeeId === E.P1) && !mi.some((i) => i.employeeId === E.C1), deny: deny.every((d) => d.value === null) }, "scope", "");
  }
  {
    const a = await L_("confirmProbation", cA, V.owner, E.P1, { now: NOW });
    const st = (await row(E.P1))?.employmentStatus;
    const b = await L_("confirmProbation", cA, V.owner, E.P1, { now: NOW });
    const c = await L_("confirmProbation", cA, V.mgrRole, E.P4, { now: NOW });
    ck("S4.3", { a: a.ok && st === "ACTIVE", b: b.text === T.notProbation, c: c.text === T.noAccess && (await row(E.P4))?.employmentStatus === "PROBATION" }, "ok", `${shown(a)} ${st} ${shown(b)} ${shown(c)}`);
  }

  const shift = (await P.hrShift.create({ data: { tenantId: TT, systemId: sA, name: `เช้า ${tag}`, startMin: 540, endMin: 1020, breakMin: 60, graceMin: 10, crossesMidnight: false } })).id as string;
  const ent = async (e: string, day: string) => (await P.hrRosterEntry.create({ data: { tenantId: TT, systemId: sA, employeeId: e, date: dbDate(day), shiftId: shift, unitId: u1, startMin: 540, endMin: 1020, breakMin: 60, crossesMidnight: false, published: true, publishedAt: NOW, source: "MANUAL" } })).id as string;
  const leave = async (e: string, from: string, to: string, status: string) => (await P.hrLeave.create({ data: { tenantId: TT, systemId: sA, employeeId: e, type: "PERSONAL", fromDate: dbDate(from), toDate: dbDate(to), status } })).id as string;
  const eO = await emp(sA, "leaver", { linkedUserId: U.o.id });
  const eB = await emp(sA, "peer");
  await withPin(cA, eO, "4821");
  const memO = (await P.membership.findFirst({ where: { tenantId: TT, userId: U.o.id } })) as Any;
  const L1 = await leave(eO, "2031-06-20", "2031-06-21", "PENDING");
  const L2 = await leave(eO, "2031-06-25", "2031-06-25", "APPROVED");
  const L3 = await leave(eO, "2031-06-09", "2031-06-12", "PENDING");
  const L4 = await leave(eO, "2031-05-01", "2031-05-01", "APPROVED");
  const pol = (await P.approvalPolicy.create({ data: { tenantId: TT, name: `QC44 ลา ${tag}`, entityType: "HrLeave" } })).id as string;
  const req = (await P.approvalRequest.create({ data: { tenantId: TT, policyId: pol, entityType: "HrLeave", entityId: L1, systemId: sA, requestedById: U.o.id, idempotencyKey: `approval-HrLeave-${L1}` } })).id as string;
  const R = { past: await ent(eO, "2031-06-09"), end: await ent(eO, DAY), f1: await ent(eO, "2031-06-12"), f2: await ent(eO, "2031-06-13"), b: await ent(eB, "2031-06-14") };
  const SW1 = (await P.hrShiftSwapRequest.create({ data: { tenantId: TT, systemId: sA, requesterEmployeeId: eO, fromEntryId: R.f1, status: "AWAITING_PEER" } })).id as string;
  const SW2 = (await P.hrShiftSwapRequest.create({ data: { tenantId: TT, systemId: sA, requesterEmployeeId: eB, fromEntryId: R.b, targetEmployeeId: eO, toEntryId: R.f2, status: "PENDING" } })).id as string;
  const OT = (await P.hrOtRequest.create({ data: { tenantId: TT, systemId: sA, employeeId: eO, date: dbDate("2031-06-08"), startAt: bkk("2031-06-08", "18:00"), endAt: bkk("2031-06-08", "19:00"), minutes: 60, timing: "AFTER" } })).id as string;
  const NOTE = `qcnote${tag}secret`;
  const off = await ob(V.owner, eO, { endDate: DAY, reason: "RESIGNED", note: NOTE, revokeAccess: true });
  {
    const v = off.value ?? {};
    ck("S5.1", { ok: off.ok, pin: v.pinRevoked === true, c: v.cancelled?.leaves === 2 && v.cancelled?.swaps === 2 && v.cancelled?.roster === 2, sp: v.spanning === 1 }, "2/2/2 · 1", `${shown(off)} ${short(v, 90)}`);
    const e = await row(eO);
    ck("S5.2", { a: e?.active === false && e?.employmentStatus === "ENDED", d: dk(e?.endDate) === DAY, at: e?.offboardedAt?.getTime?.() === NOW.getTime(), why: e?.offboardReason === "RESIGNED" && e?.offboardNote === NOTE && e?.offboardedById === U.owner.id, pin: e?.pinHash === null && e?.pinSetAt === null && e?.pinCode === null }, "row", `${e?.employmentStatus} ${dk(e?.endDate)} pin=${!!e?.pinHash}`);
    const ls = Object.fromEntries((await fm("hrLeave", { id: { in: [L1, L2, L3, L4] } })).map((x) => [x.id, x.status]));
    const rq = (await fu("approvalRequest", req))?.status;
    ck("S5.3", { l1: ls[L1] === "CANCELLED" && rq === "CANCELLED", l2: ls[L2] === "CANCELLED", l3: ls[L3] === "PENDING", l4: ls[L4] === "APPROVED" }, "CCPA", `${ls[L1]}/${rq} ${ls[L2]} ${ls[L3]} ${ls[L4]}`);
    const sw = await fm("hrShiftSwapRequest", { id: { in: [SW1, SW2] } });
    const open = await cnt("hrShiftSwapRequest", { tenantId: TT, status: { in: ["AWAITING_PEER", "PENDING"] }, OR: [{ requesterEmployeeId: eO }, { targetEmployeeId: eO }] });
    const ro = new Set((await fm("hrRosterEntry", { employeeId: eO })).map((x) => x.id));
    const ot = (await fu("hrOtRequest", OT))?.status;
    ck("S5.4", { open: open === 0, peer: sw.find((x) => x.id === SW2)?.status === "CANCELLED", kept: ro.has(R.past) && ro.has(R.end), gone: !ro.has(R.f1) && !ro.has(R.f2), ot: ot === "PENDING" }, "closed", `${open} ${ro.size} ${ot}`);
    const ev = evOf(await evs(EV.off), [eO]);
    const all = [...(await fm("outboxEvent", { tenantId: TT })).map((x) => JSON.stringify(x.payload)), ...(await fm("auditLog", { tenantId: TT })).map((x) => JSON.stringify([x.before, x.after]))];
    ck("S5.5", { one: ev.length === 1, keys: keysOf(ev[0]?.payload) === "employeeId,endDate" && ev[0]?.payload?.endDate === DAY, note: !all.some((s) => s.includes(NOTE)), reason: !all.some((s) => s.includes("RESIGNED")) }, "1 · ids only", `n=${ev.length} keys=${keysOf(ev[0]?.payload)}`);
    const tasks = await fm("hrOnboardingTask", { employeeId: eO, kind: "OFFBOARDING" }, { orderBy: { sortOrder: "asc" } });
    const done = (k: string) => !!tasks.find((t) => t.templateKey === k)?.doneAt;
    const mem = await fu("membership", memO?.id);
    ck("S5.6", { tasks: tasks.map((t) => t.templateKey).join() === OFF_KEYS.join(), pin: done("pin_revoked"), app: done("app_access"), mem: mem && mem.acceptedAt === null, link: (await row(eO))?.linkedUserId === null }, "6 · 2 done", tasks.map((t) => `${t.templateKey}${t.doneAt ? "+" : ""}`).join());
  }
  {
    const eV = await emp(sA, "v");
    const eM = await emp(sA, "mself", { linkedUserId: U.mgrU1.id });
    const c0 = await cnt("outboxEvent", { tenantId: TT });
    const tries = [
      await ob(V.owner, eV, { endDate: "2031-06-11", reason: "RESIGNED" }),
      await ob(V.owner, eV, { endDate: "2031-01-01", reason: "RESIGNED" }),
      await ob(V.owner, eV, { endDate: DAY, reason: "BORED" }),
      await L_("offboardEmployee", cA, V.owner, eV, { endDate: DAY, reason: "OTHER", note: "ก".repeat(501) }, { now: NOW }),
      await ob(V.mgrU1, eM, { endDate: DAY, reason: "OTHER" }),
      await ob(V.owner, eO, { endDate: DAY, reason: "OTHER" }),
    ];
    const want = [T.endFuture, T.endBefore, T.reason, T.note, T.self, T.ended];
    const still = (await row(eV))?.active === true && (await row(eM))?.active === true;
    ck("S5.7", { texts: tries.every((x, i) => !x.ok && x.text === want[i]), still, quiet: (await cnt("outboxEvent", { tenantId: TT })) === c0 }, want.map((w) => w.slice(0, 8)).join("·"), tries.map(shown).join(" "));
    const eU2 = await emp(sA, "south", { unitId: u2 });
    const eR = await emp(sA, "role");
    const deny = [await ob(V.mgrU1, eU2, { reason: "OTHER" }), ...(await Promise.all([V.pay, V.member].map((v) => ob(v, eV, { reason: "OTHER" })))), await ob(V.other, eV, { reason: "OTHER" }, NOW, cO)];
    const okRole = await ob(V.mgrRole, eR, { reason: "OTHER", revokeAccess: false });
    ck("S5.8", { deny: deny.every((d) => !d.ok && d.text === T.noAccess), alive: (await row(eU2))?.active === true && (await row(eV))?.active === true, role: okRole.ok && (await row(eR))?.active === false }, "denied", `${deny.map(shown).join(" ")} ${shown(okRole)}`);
  }
  const sN = await sys("ทีมเก็บ PIN");
  const cN = { tenantId: TT, systemId: sN };
  const eN = await fx.mkEmp(TT, sN, `QC44 keep ${tag}`, { unitId: u1, linkedUserId: U.n.id });
  await withPin(cN, eN, "5930");
  {
    await sv(cN, V.owner, { autoRevokePin: false });
    const r = await ob(V.owner, eN, { reason: "CONTRACT_END", revokeAccess: false }, NOW, cN);
    const e = await row(eN);
    const vp = await vpin("5930", sN);
    ck("S5.9", { ok: r.ok && r.value?.pinRevoked === false, kept: !!e?.pinHash && e?.active === false, vp: vp?.ok === false && vp?.reason === PIN_WRONG }, "kept", `${shown(r)} ${short(vp, 40)}`);
  }
  {
    const lo = await L_("loadLifecycleForViewer", cA, V.owner, eO);
    const lm = await L_("loadLifecycleForViewer", cA, V.mgrU1, eO);
    const deny = await three((v) => L_("loadLifecycleForViewer", cA, v, eO));
    const K5 = "contractEndAt,offboard,probationEndAt,startDate,status";
    const good = (x: RO) => x.ok && keysOf(x.value) === K5 && keysOf(x.value?.offboard) === "at,endDate,note,reason" && x.value.offboard.note === NOTE;
    ck("S5.10", { owner: good(lo), mgr: good(lm), deny: deny.every((d) => d.value === null) }, K5, keysOf(lo.value));
  }

  {
    const vp = await vpin("4821", sA);
    const ve = await pin.verifyPinOfEmployee({ tenantId: TT, systemId: sA, employeeId: eO, pin: "4821", callerKey: `kiosk:${U.owner.id}:${eO}` }).catch(fail);
    const kc = await clk.kioskClock(cA, { employeeId: eO, pin: "4821", callerKey: `kiosk:${U.owner.id}` }, { now: NOW }).catch(fail);
    const n0 = await cnt("hrAttendance", { employeeId: eO });
    const cl = await clk.clock(cA, { employeeId: eO, kind: "IN", requireActive: true }, { now: NOW }).then(() => "WROTE", (x: unknown) => `refused ${errText(x).slice(0, 30)}`);
    const n1 = await cnt("hrAttendance", { employeeId: eO });
    ck("S6.1", { vp: vp?.ok === false && vp?.reason === PIN_WRONG, ve: ve?.ok === false && ve?.reason === PIN_WRONG, kiosk: kc?.ok === false, clock: cl !== "WROTE" && n1 === n0 }, "refused", `${short([vp, ve, kc], 90)} ${cl}`);
  }
  {
    const mc = await clk.mobileClock({ tenantId: TT, userId: U.n.id }, { kind: "NEXT" }, { now: NOW }).catch(fail);
    const cs = await seam.clockSelf({ tenantId: TT, userId: U.n.id, kind: "IN" }).catch(fail);
    const os = await seam.onShiftToday({ tenantId: TT, at: NOW, userIds: [U.n.id] }).catch(() => ({ items: [{ active: true }] }));
    const kr = ((await hr.kioskRoster(cA).catch(() => [])) as Any[]).map((x) => x.id);
    const it = (os.items ?? []).find((i: Any) => i.employeeId === eN);
    ck("S6.2", { mobile: mc?.ok === false && textOf(mc) === M_INACTIVE, pos: cs?.ok === false && cs?.code === "NO_EMPLOYEE", shift: !it || it.active === false, kiosk: !kr.includes(eO) }, "refused", short([mc, cs, it?.active], 90));
  }
  {
    await hr.saveEmployeeProfile(cA, eO, { employmentStatus: "ACTIVE" });
    const rs = await hr.setEmployeeActive(cA, eO, true);
    const e = await row(eO);
    const vp = await vpin("4821", sA);
    ck("S6.3", { active: rs?.ok && e?.active === true, pin: e?.pinHash === null, old: vp?.ok === false, hist: !!e?.offboardedAt && e?.offboardReason === "RESIGNED" }, "null", `${short(rs, 30)} pin=${!!e?.pinHash}`);
    const r2 = await ob(V.owner, eO, { endDate: "2031-06-11", reason: "TERMINATED", revokeAccess: false }, NOW1);
    const ev = evOf(await evs(EV.off), [eO]);
    const e2 = await row(eO);
    ck("S6.4", { ok: r2.ok, two: ev.length === 2 && ev[0].idempotencyKey !== ev[1].idempotencyKey, at: e2?.offboardedAt?.getTime?.() === NOW1.getTime() && e2?.offboardReason === "TERMINATED" }, "2", `${shown(r2)} n=${ev.length}`);
  }

  const eA = await emp(sA, "ea", { linkedUserId: U.a.id });
  const eD = await emp(sA, "ed", { linkedUserId: U.d.id, unitId: u2 });
  const eM2 = (await P.hrEmployee.findFirst({ where: { systemId: sA, linkedUserId: U.mgrU1.id } }))?.id as string;
  const BODY = `qcbody${tag}`;
  const add = (v: Any, e: string, x: Any, c: Any = cA) => L_("addReviewNote", c, v, { employeeId: e, title: "มาสาย", body: BODY, ...x });
  const n1 = await add(V.owner, eA, { kind: "WRITTEN_WARNING", visibleToEmployee: false });
  const n2 = await add(V.mgrU1, eA, { kind: "REVIEW", periodLabel: "2031-Q2", score: 4 });
  const n3 = await add(V.mgrU1, eA, { kind: "NOTE" });
  const n4 = await add(V.owner, eO, { kind: "NOTE" });
  const nid = (r: RO) => String(r.value?.id ?? "");
  {
    const rows = Object.fromEntries((await fm("hrReviewNote", { employeeId: eA })).map((x) => [x.id, x]));
    ck("S7.1", { ok: n1.ok && n2.ok && n3.ok && n4.ok, w: rows[nid(n1)]?.visibleToEmployee === true, rv: rows[nid(n2)]?.score === 4 && rows[nid(n2)]?.periodLabel === "2031-Q2", nt: rows[nid(n3)]?.visibleToEmployee === false }, "vis", [n1, n2, n3, n4].map(shown).join(" "));
    const bad = [
      await add(V.owner, eA, { kind: "X" }), await add(V.owner, eA, { kind: "NOTE", title: "" }), await add(V.owner, eA, { kind: "NOTE", title: "ก".repeat(121) }),
      await add(V.owner, eA, { kind: "NOTE", body: "" }), await add(V.owner, eA, { kind: "REVIEW", score: 3 }), await add(V.owner, eA, { kind: "NOTE", score: 3 }), await add(V.owner, eA, { kind: "REVIEW", periodLabel: "2031-Q2", score: 6 }),
    ];
    const want = [T.kind, T.title, T.title, T.body, T.period, T.score, T.score];
    chk("S7.2", bad.every((x, i) => !x.ok && x.text === want[i]), "7 texts", bad.map(shown).join(" "));
  }
  {
    const c0 = await cnt("hrReviewNote", { tenantId: TT });
    const deny = [await add(V.mgrU1, eD, { kind: "NOTE" }), ...(await Promise.all([V.mgrRole, V.pay, V.leave, V.member].map((v) => add(v, eA, { kind: "NOTE" })))), await add(V.other, eA, { kind: "NOTE" }, cO), await add(V.owner, `nope${tag}`, { kind: "NOTE" })];
    const self = await add(V.mgrU1, eM2, { kind: "NOTE" });
    const c1 = await cnt("hrReviewNote", { tenantId: TT });
    ck("S7.3", { deny: deny.every((d) => !d.ok && d.text === T.noAccess), self: self.text === T.self, zero: c1 === c0 }, "noAccess ×7 · self", `${deny.map(shown).join(" ")} ${shown(self)}`);
  }
  {
    const lo = await lrn(V.owner, eA);
    const lm = await lrn(V.mgrU1, eA);
    const deny = [await lrn(V.mgrU1, eD), ...(await Promise.all([V.pay, V.mgrRole, V.member].map((v) => lrn(v, eA))))];
    const it = (r: RO) => (r.value?.items ?? []) as Any[];
    ck("S7.4", { owner: it(lo).length === 3 && it(lo).every((x) => keysOf(x) === NOTE_KEYS), mgr: it(lm).length === 3, deny: deny.every((d) => d.value === null) }, NOTE_KEYS, `${it(lo).length} ${keysOf(it(lo)[0])}`);
    const ma = await my(U.a);
    const md = await my(U.d);
    const mm = await my(U.member);
    const items = (r: RO) => (Array.isArray(r.value) ? r.value : (r.value?.items ?? [])) as Any[];
    ck("S7.5", { own: srt(items(ma).map((x) => x.id)) === srt([nid(n1), nid(n2)]), keys: items(ma).every((x) => keysOf(x) === SELF_NOTE_KEYS), peer: !items(md).some((x) => [nid(n1), nid(n2), nid(n3)].includes(x.id)), member: items(mm).length === 0 }, "2 own visible", `${items(ma).length} ${keysOf(items(ma)[0])}`);
    const k1 = await ack(U.a, nid(n1));
    const t1 = (await fu("hrReviewNote", nid(n1)))?.acknowledgedAt?.getTime?.();
    await sleep(20);
    const k2 = await ack(U.a, nid(n1));
    const t2 = (await fu("hrReviewNote", nid(n1)))?.acknowledgedAt?.getTime?.();
    const k3 = await ack(U.a, nid(n3));
    const k4 = await ack(U.d, nid(n2));
    ck("S7.6", { first: k1.ok && !!t1, once: k2.ok && t2 === t1, hidden: k3.text === T.noAccess, peer: k4.text === T.noAccess }, "once", [k1, k2, k3, k4].map(shown).join(" "));
    const au = await fm("auditLog", { tenantId: TT, action: "hr.review_note.add" });
    const ids = [nid(n1), nid(n2), nid(n3), nid(n4)].filter(Boolean);
    const obx = (await fm("outboxEvent", { tenantId: TT })).filter((e) => ids.some((i) => JSON.stringify(e.payload).includes(i)));
    ck("S7.7", { audit: au.length === 4 && au.every((a) => !JSON.stringify([a.before, a.after]).includes(BODY) && !JSON.stringify(a.after ?? {}).includes("มาสาย")), outbox: ids.length === 4 && obx.length === 0 }, "clean", `audit=${au.length} ev=${obx.length}`);
  }

  const eK = await emp(sA, "new1", { status: "PROBATION" });
  const eK2 = await emp(sA, "new2", { status: "PROBATION" });
  {
    const s1 = await stc(V.owner, eK, "ONBOARDING");
    const t1 = await fm("hrOnboardingTask", { employeeId: eK }, { orderBy: { sortOrder: "asc" } });
    const e1 = evOf(await evs(EV.started), [eK]).length;
    const s2 = await stc(V.owner, eK, "ONBOARDING");
    const t2 = await cnt("hrOnboardingTask", { employeeId: eK });
    const e2 = evOf(await evs(EV.started), [eK]).length;
    await Promise.all(Array.from({ length: 5 }, () => stc(V.owner, eK2, "ONBOARDING")));
    const t3 = await cnt("hrOnboardingTask", { employeeId: eK2 });
    const e3 = evOf(await evs(EV.started), [eK2]).length;
    ck("S8.1", { first: s1.ok && t1.map((t) => t.templateKey).join() === ON_KEYS.join() && e1 === 1, again: s2.ok && t2 === 7 && e2 === 1, race: t3 === 7 && e3 === 1 }, "7/1 · 7/1 · 7/1", `${shown(s1)} ${t1.length}/${e1} ${t2}/${e2} ${t3}/${e3}`);
    const lc = await lsc(V.owner, eK);
    const on = (lc.value?.onboarding ?? []) as Any[];
    const tid = String(on[0]?.id ?? t1[0]?.id ?? "∅");
    const d1 = await L_("setTaskDone", cA, V.owner, tid, true);
    const r1 = await fu("hrOnboardingTask", tid);
    const d0 = await L_("setTaskDone", cA, V.owner, tid, false);
    const r0 = await fu("hrOnboardingTask", tid);
    ck("S8.2", { keys: on.length === 7 && on.every((x) => keysOf(x) === TASK_KEYS), on: d1.ok && !!r1?.doneAt && r1?.doneById === U.owner.id, off: d0.ok && r0?.doneAt === null }, TASK_KEYS, `${keysOf(on[0])} ${shown(d1)} ${shown(d0)}`);
    const eU = await emp(sA, "s2new", { unitId: u2, status: "PROBATION" });
    const st = [...(await three((v) => stc(v, eK2, "OFFBOARDING"))), await stc(V.mgrU1, eU, "ONBOARDING")];
    const ls = [...(await three((v) => lsc(v, eK))), await lsc(V.mgrU1, eU)];
    ck("S8.3", { start: st.every((x) => !x.ok && x.text === T.noAccess), list: ls.every((x) => x.value === null), none: (await cnt("hrOnboardingTask", { employeeId: eU })) === 0 }, "denied", st.map(shown).join(" "));
  }

  const KS = (await sysSvc.createSystem(TT, "KANBAN", `บอร์ด ${tag}`)).id as string;
  const KB = (await P.kanbanBoard.create({ data: { tenantId: TT, systemId: KS, name: `งานคน ${tag}` } })).id as string;
  await P.kanbanColumn.create({ data: { tenantId: TT, systemId: KS, boardId: KB, name: "ต้องทำ", sortOrder: 0, position: "a0" } });
  await P.kanbanColumn.create({ data: { tenantId: TT, systemId: KS, boardId: KB, name: "เสร็จ", sortOrder: 1, position: "a1", isDoneColumn: true } });
  const cons = (OC.consumers ?? {}) as Record<string, Any>;
  const replay = async (e: Any) => {
    for (let i = 0; i < 2; i++) await cons[e.type]?.({ id: e.id, tenantId: e.tenantId, type: e.type, payload: e.payload, systemId: e.systemId, unitId: e.unitId }).catch((x: unknown) => console.log(`  ⚠ ${e.type}: ${errText(x).slice(0, 80)}`));
  };
  const cards = async (pfx: string) => fm("kanbanCard", { tenantId: TT, sourceKey: { startsWith: pfx } });
  {
    const reg = Object.values(EV).every((e) => typeof cons[e] === "function");
    const bigEv = (await evs(EV.due)).find((e) => e.systemId === sBig);
    if (bigEv) await replay(bigEv);
    const n = bigEv ? (await cards(`hrlife:${bigEv.payload?.employeeId}`)).length : -1;
    ck("S9.1", { reg, off: n === 0 }, "3 · 0", `${reg} ${n}`);
  }
  await sv(cA, V.owner, { kanban: { enabled: true, boardId: KB } });
  {
    const e = evOf(await evs(EV.due), [E.P4])[0];
    if (e) await replay(e);
    const cs = await cards(`hrlife:${E.P4}:`);
    ck("S9.2", { one: cs.length === 1 && cs[0]?.sourceKey === `hrlife:${E.P4}:PROBATION_END:2031-06-01`, title: /^ครบทดลองงาน: /.test(String(cs[0]?.title ?? "")) && String(cs[0]?.title).includes(`p4 ${tag}`) }, "1 card", `${cs.length} ${short(cs[0]?.title, 60)}`);
    const se = evOf(await evs(EV.started), [eK])[0];
    if (se) await replay(se);
    const tasks = await fm("hrOnboardingTask", { employeeId: eK });
    const tc = await cards("hrtask:");
    const mine = tc.filter((c) => tasks.some((t) => c.sourceKey === `hrtask:${t.id}`));
    ck("S9.3", { cards: mine.length === tasks.filter((t) => !t.doneAt).length && mine.length > 0, linked: tasks.filter((t) => !t.doneAt).every((t) => !!t.kanbanCardId && mine.some((c) => c.id === t.kanbanCardId)) }, "per open task", `${mine.length}/${tasks.length}`);
    for (const oe of evOf(await evs(EV.off), [eO])) await replay(oe);
    const ot = await fm("hrOnboardingTask", { employeeId: eO, kind: "OFFBOARDING" });
    const oc = (await cards("hrtask:")).filter((c) => ot.some((t) => c.sourceKey === `hrtask:${t.id}`));
    const allCards = await fm("kanbanCard", { tenantId: TT });
    const leak = allCards.filter((c) => [NOTE, BODY, "RESIGNED", "TERMINATED", "มาสาย"].some((x) => JSON.stringify([c.title, c.description]).includes(x)));
    ck("S9.4", { cards: oc.length === ot.filter((t) => !t.doneAt).length && oc.length > 0, uniq: new Set(oc.map((c) => c.sourceKey)).size === oc.length, leak: leak.length === 0 }, "once", `${oc.length}/${leak.length}`);
  }

  {
    const eZ = await emp(sA, "rclock");
    const h = await underLock(`hr:clock:${eZ}`, () => ob(V.owner, eZ, { endDate: DAY, reason: "OTHER", revokeAccess: false }), (tx) => tx.hrAttendance.create({ data: { tenantId: TT, systemId: sA, employeeId: eZ, kind: "IN", at: bkk(DAY, "09:58") } }));
    const rows = await cnt("hrAttendance", { employeeId: eZ });
    const e = await row(eZ);
    ck("S10.1", { waited: h.waited, ok: h.res.ok, row: rows === 1, ended: e?.employmentStatus === "ENDED" && e?.active === false, holder: !h.holderErr }, "waited · kept", `${h.waited} ${shown(h.res)} ${rows} ${h.holderErr}`);
  }
  {
    const eY = await emp(sA, "roff");
    const rs = await Promise.all(Array.from({ length: 4 }, () => ob(V.owner, eY, { endDate: DAY, reason: "OTHER", revokeAccess: false })));
    const ev = evOf(await evs(EV.off), [eY]).length;
    const au = (await fm("auditLog", { tenantId: TT, action: "hr.employee.offboard" })).filter((x) => JSON.stringify(x).includes(eY)).length;
    const tk = await cnt("hrOnboardingTask", { employeeId: eY });
    ck("S10.2", { one: rs.filter((r) => r.ok).length === 1, rest: rs.filter((r) => !r.ok).every((r) => r.text === T.ended), ev: ev === 1, au: au === 1, tk: tk === 6 }, "1/1/6", `${rs.map(shown).join(" ")} ${ev}/${au}/${tk}`);
  }
  {
    const sR = await sys("ทีมแข่ง");
    const ids: string[] = [];
    for (const n of ["a", "b", "c", "d"]) ids.push(await emp(sR, `r${n}`, { status: "PROBATION" }, { probationEndAt: dbDate("2031-06-15") }));
    const [a, b] = await Promise.all([sweep(NOW), sweep(NOW)]);
    const n = evOf(await evs(EV.due), ids).length;
    ck("S10.3", { n: n === 4, sum: a.ok && b.ok && Number(a.value?.emitted) + Number(b.value?.emitted) === 4 }, "4 · Σ 4", `n=${n} ${a.value?.emitted}+${b.value?.emitted}`);
  }
  {
    const eW = await emp(sA, "rpin");
    await withPin(cA, eW, "3377");
    const [o, s] = await Promise.all([ob(V.owner, eW, { endDate: DAY, reason: "OTHER", revokeAccess: false }), hr.setPin(cA, eW, "7788").catch(fail)]);
    const e = await row(eW);
    ck("S10.4", { off: o.ok, pin: e?.pinHash === null, inactive: e?.active === false }, "null", `${shown(o)} ${short(s, 30)} pin=${!!e?.pinHash}`);
  }

  // ═════════════ r2 addendum (controller rulings 1–8 · hunt F1/F2) ═════════════
  {
    const mem = (uid: string) => P.membership.findFirst({ where: { tenantId: TT, userId: uid } }) as Promise<Any>;
    const push = async (uid: string) => (await P.pushDevice.create({ data: { userId: uid, tenantId: TT, expoToken: `ExponentPushToken[qc44${tag}${uid.slice(-6)}]`, platform: "ios" } })).id as string;
    const pushIds: string[] = [];
    // rows that name this employee (tenant-wide counters also move with async kanban/notify work of earlier groups)
    const about = async (e: string) => `${(await fm("outboxEvent", { tenantId: TT })).filter((x) => JSON.stringify(x.payload).includes(e)).length}:${await cnt("auditLog", { tenantId: TT, targetId: e })}:${await cnt("hrOnboardingTask", { employeeId: e })}`;
    try {
      // S16.1 STAFF clerk (offboard key only) ⇒ STAFF target's access revoked in the same tx
      const clerk = await mk("clerk", "STAFF", [u1], K);
      const uS = await mk("r2s", "STAFF", [u1], {});
      const eS = await emp(sA, "r2s", { linkedUserId: uS.id });
      pushIds.push(await push(uS.id));
      const r1 = await ob(vOf(clerk), eS, { endDate: DAY, reason: "RESIGNED", revokeAccess: true });
      const m1 = await mem(uS.id);
      const p1 = await fu("pushDevice", pushIds[0]);
      const t1 = await fm("hrOnboardingTask", { employeeId: eS, templateKey: "app_access" });
      ck("S16.1", { ok: r1.ok && r1.value?.accessRevoked === true, mem: m1?.acceptedAt === null, link: (await row(eS))?.linkedUserId === null, push: p1?.tenantId === null, task: !!t1[0]?.doneAt }, "revoked in tx", shown(r1));
      // S16.2 MANAGER-linked target: non-owner + revoke ⇒ refused, nothing written · owner ⇒ ok
      const uM = await mk("r2m", "MANAGER", [u1], {});
      const eMg = await emp(sA, "r2m", { linkedUserId: uM.id });
      const c0 = await about(eMg);
      const r2a = await ob(V.mgrU1, eMg, { endDate: DAY, reason: "OTHER", revokeAccess: true });
      const c1 = await about(eMg);
      const still = (await row(eMg))?.active === true && (await mem(uM.id))?.acceptedAt !== null;
      const r2b = await ob(V.owner, eMg, { endDate: DAY, reason: "OTHER", revokeAccess: true });
      ck("S16.2", { refused: !r2a.ok && r2a.text === T.revokeManager, quiet: c0 === c1 && still, owner: r2b.ok && r2b.value?.accessRevoked === true && (await mem(uM.id))?.acceptedAt === null }, "manager ⇒ owner only", `${shown(r2a)} ${shown(r2b)}`);
      // S16.3 OWNER-linked row: refused for everyone (with or without revoke)
      const uO = await mk("r2o", "OWNER", [], {});
      const eOw = await emp(sA, "r2o", { linkedUserId: uO.id });
      const c2 = await about(eOw);
      const r3 = [await ob(V.mgrAll, eOw, { endDate: DAY, reason: "OTHER", revokeAccess: true }), await ob(V.owner, eOw, { endDate: DAY, reason: "OTHER", revokeAccess: true }), await ob(V.owner, eOw, { endDate: DAY, reason: "OTHER", revokeAccess: false })];
      const c3 = await about(eOw);
      ck("S16.3", { refused: r3.every((x) => !x.ok && x.text === T.revokeOwner), quiet: c2 === c3 && (await row(eOw))?.active === true && (await mem(uO.id))?.acceptedAt !== null }, "owner row refused", r3.map(shown).join(" "));
      // S16.4 untick: non-owner refused while the policy revokes · owner may keep ⇒ accessKept
      const uK = await mk("r2k", "STAFF", [u1], {});
      const eKp = await emp(sA, "r2k", { linkedUserId: uK.id });
      const r4a = await ob(vOf(clerk), eKp, { endDate: DAY, reason: "OTHER", revokeAccess: false });
      const a4 = (await row(eKp))?.active === true;
      const r4b = await ob(V.owner, eKp, { endDate: DAY, reason: "OTHER", revokeAccess: false });
      ck("S16.4", { refused: !r4a.ok && r4a.text === T.keepAccess && a4, kept: r4b.ok && r4b.value?.accessKept === true && r4b.value?.accessRevoked === false && (await mem(uK.id))?.acceptedAt !== null }, "keep = owner only", `${shown(r4a)} ${shown(r4b)}`);
      // S16.5 self row (viewer with the HR key, linked to the row): no hidden notes · no checklist · no offboard reason/note · tick/start refused
      const uX = await mk("r2x", "STAFF", [u1], K);
      const eX = await emp(sA, "r2x", { linkedUserId: uX.id });
      await add(V.owner, eX, { kind: "NOTE", visibleToEmployee: false });
      await add(V.owner, eX, { kind: "VERBAL_WARNING" });
      await stc(V.owner, eX, "ONBOARDING");
      const tX = (await fm("hrOnboardingTask", { employeeId: eX }))[0]?.id as string;
      const nl = await lrn(vOf(uX), eX);
      const cl = await lsc(vOf(uX), eX);
      const st = await stc(vOf(uX), eX, "ONBOARDING");
      const td = await L_("setTaskDone", cA, vOf(uX), tX, true);
      await ob(V.owner, eX, { endDate: DAY, reason: "TERMINATED", note: NOTE, revokeAccess: false });
      const lf = await L_("loadLifecycleForViewer", cA, vOf(uX), eX);
      const items = (nl.value?.items ?? []) as Any[];
      ck("S16.5", { notes: items.every((x) => x.visibleToEmployee === true) && items.length === 1, check: cl.value === null, start: st.text === T.self, tick: td.text === T.self && !(await fu("hrOnboardingTask", tX))?.doneAt, off: !lf.value || (lf.value.offboard?.reason == null && lf.value.offboard?.note == null) }, "self row hidden", `${items.length} ${short(cl.value, 20)} ${shown(st)} ${shown(td)} ${short(lf.value?.offboard, 60)}`);
      // S16.6 [race] clockSelf queued behind offboard on hr:clock ⇒ no IN row once ENDED
      const uC = await mk("r2c", "STAFF", [u1], {});
      const eC = await emp(sA, "r2c", { linkedUserId: uC.id });
      const key = `hr:clock:${eC}`;
      let release: () => void = () => {};
      const gate = new Promise<void>((r) => (release = r));
      let held: () => void = () => {};
      const heldP = new Promise<void>((r) => (held = r));
      const holder = P.$transaction(async (tx: Any) => {
        await tx.$queryRawUnsafe(`SELECT count(pg_advisory_xact_lock(hashtextextended($1::text, 0)))::int AS n`, key);
        held();
        await gate;
      }, { maxWait: 10_000, timeout: 40_000 }).catch(() => held());
      await heldP;
      const waiting = async (n: number) => {
        for (let i = 0; i < 80; i++) {
          const w = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND wait_event = 'advisory'`).catch(() => null)) as Any[] | null;
          if (Number(w?.[0]?.n ?? 0) >= n) return true;
          await sleep(100);
        }
        return false;
      };
      const offP = ob(V.owner, eC, { endDate: DAY, reason: "OTHER", revokeAccess: false });
      const w1 = await waiting(1);
      const csP = seam.clockSelf({ tenantId: TT, userId: uC.id, kind: "IN" }).catch(fail);
      const w2 = await waiting(2);
      release();
      await holder;
      const [o6, c6] = await Promise.all([offP, csP]);
      const ins = await cnt("hrAttendance", { employeeId: eC, kind: "IN" });
      ck("S16.6", { queued: w1 && w2, off: o6.ok, none: ins === 0 && c6?.ok === false }, "no IN row", `${w1}/${w2} ${shown(o6)} ${short(c6, 40)} in=${ins}`);
      // S16.7 approval request already decided ⇒ leave still CANCELLED · audit names the kept request
      const eL = await emp(sA, "r2l");
      const LD = await leave(eL, "2031-06-20", "2031-06-20", "PENDING");
      const RQ = (await P.approvalRequest.create({ data: { tenantId: TT, policyId: pol, entityType: "HrLeave", entityId: LD, systemId: sA, requestedById: U.owner.id, status: "APPROVED", idempotencyKey: `approval-HrLeave-${LD}` } })).id as string;
      const r7 = await ob(V.owner, eL, { endDate: DAY, reason: "OTHER" });
      const au7 = (await fm("auditLog", { tenantId: TT, action: "hr.employee.offboard", targetId: eL }))[0];
      ck("S16.7", { ok: r7.ok, leave: (await fu("hrLeave", LD))?.status === "CANCELLED", req: (await fu("approvalRequest", RQ))?.status === "APPROVED", trace: JSON.stringify(au7?.after ?? {}).includes(RQ) }, "cancelled + traced", short(au7?.after, 80));
      // S16.8 audits: ids of the main offboard (eO) · checklist start · tick/untick · acknowledge
      const auO = (await fm("auditLog", { tenantId: TT, action: "hr.employee.offboard", targetId: eO }, { orderBy: { createdAt: "asc" } }))[0];
      const aj = JSON.stringify(auO?.after ?? {});
      const ids = [L1, L2, SW1, SW2, R.f1, R.f2].every((x) => aj.includes(x));
      const lsrc = stripComments(rd(F.life));
      const inTx = /tx\.auditLog\.create\(\{[\s\S]{0,400}?"hr\.employee\.offboard"/.test(lsrc);
      const aStart = await cnt("auditLog", { tenantId: TT, action: "hr.checklist.start" });
      const aTick = await fm("auditLog", { tenantId: TT, action: "hr.checklist.task" });
      const aAck = await cnt("auditLog", { tenantId: TT, action: "hr.review_note.ack" });
      const ticks = aTick.map((x) => (x.after as Any)?.done);
      ck("S16.8", { ids, inTx, start: aStart >= 2, tick: ticks.includes(true) && ticks.includes(false), ack: aAck >= 1 }, "ids · in tx · 3 audits", `start=${aStart} tick=${ticks.join("")} ack=${aAck}`);
      // S16.9 card assignee: HR rights · never the employee the card is about (eM2 is linked to mgrU1, the first manager on u1)
      await P.hrEmployee.update({ where: { id: eM2 }, data: { employmentStatus: "PROBATION", probationEndAt: dbDate("2031-06-15") } });
      await sweep(NOW);
      const ev9 = evOf(await evs(EV.due), [eM2])[0];
      if (ev9) await replay(ev9);
      const card = (await cards(`hrlife:${eM2}:`))[0];
      const asg = card ? ((await fm("kanbanCardAssignee", { cardId: card.id })) as Any[]).map((x) => x.userId) : [];
      ck("S16.9", { card: !!card, notSelf: asg.length > 0 && !asg.includes(U.mgrU1.id), hr: asg.every((x) => [U.owner.id, U.mgrAll.id, U.mgrRole.id].includes(x)) }, "HR assignee · not the subject", `${asg.length}`);
      // S16.10 only OWNER switches the two automatic revokes off
      const s10 = [await sv(cS, V.mgrAll, { autoRevokePin: false }), await sv(cS, V.mgrAll, { revokeAppAccess: false })];
      const o10 = await sv(cS, V.owner, { revokeAppAccess: false });
      const back = await sv(cS, V.owner, { revokeAppAccess: true });
      ck("S16.10", { refused: s10.every((x) => !x.ok && x.text === T.ownerSwitch), owner: o10.ok && back.ok }, "owner only", s10.map(shown).join(" "));
      // S16.12 offboarding checklist cannot be started on an ACTIVE employee
      const eAc = await emp(sA, "r2act");
      const s12 = await stc(V.owner, eAc, "OFFBOARDING");
      ck("S16.12", { refused: !s12.ok && s12.text === T.offActive, none: (await cnt("hrOnboardingTask", { employeeId: eAc })) === 0 }, "refused", shown(s12));
      // S16.13 r3: offboard reverts the H2.7 leave ledger (APPROVED ⇒ use-revert) · PENDING releases its reservation · re-run = no-op
      const sL = await sys("ทีมลา");
      const cL = { tenantId: TT, systemId: sL };
      const settingsMod = (await import("@/lib/modules/hr/settings")) as Any;
      const pr = await settingsMod.createLeavePolicy(cL, V.owner, { unitId: null, category: "VACATION", name: `พักร้อน ${tag}`, quotaDays: 10 });
      const eLv = await fx.mkEmp(TT, sL, `QC44 lv ${tag}`, { unitId: u1, startDate: "2031-01-05", status: "ACTIVE" });
      const rq = (f: string, t: string) => hr.requestLeave(cL, { employeeId: eLv, type: "VACATION", policyId: pr?.id, fromDate: f, toDate: t, actorUserId: U.mgrAll.id }).catch((e: unknown) => ({ id: "", err: errText(e) }));
      const la = await rq("2031-06-20", "2031-06-22");
      const lp = await rq("2031-06-25", "2031-06-26");
      // approve through the real chain effect (the tenant has an HrLeave approval policy ⇒ requestLeave opened a request)
      const reqA = la?.id ? ((await P.approvalRequest.findFirst({ where: { tenantId: TT, entityType: "HrLeave", entityId: la.id } })) as Any) : null;
      if (reqA) {
        await P.approvalRequest.update({ where: { id: reqA.id }, data: { status: "APPROVED", decidedAt: new Date() } });
        await ((await import("@/lib/modules/hr/leave")) as Any).applyLeaveDecision({ tenantId: TT, systemId: sL, leaveId: la.id, requestId: reqA.id, approved: true }).catch(() => null);
      } else if (la?.id && (await fu("hrLeave", la.id))?.status === "PENDING") await hr.decideLeave(cL, la.id, "APPROVED", U.owner.id).catch(() => null);
      const sumOf = async () => ((await fm("hrLeaveBalanceTxn", { employeeId: eLv, leaveYear: 2031 })) as Any[]).reduce((n, x) => n + Number(String(x.days)), 0);
      const before13 = await sumOf();
      const st0 = [(await fu("hrLeave", la?.id))?.status, (await fu("hrLeave", lp?.id))?.status].join("/");
      const o13 = await ob(V.owner, eLv, { endDate: DAY, reason: "RESIGNED" }, NOW, cL);
      const after13 = await sumOf();
      const st1 = [(await fu("hrLeave", la?.id))?.status, (await fu("hrLeave", lp?.id))?.status].join("/");
      const au13 = JSON.stringify((await fm("auditLog", { tenantId: TT, action: "hr.employee.offboard", targetId: eLv }))[0]?.after ?? {});
      const n13 = await cnt("hrLeaveBalanceTxn", { employeeId: eLv });
      const again = await ob(V.owner, eLv, { endDate: DAY, reason: "RESIGNED" }, NOW, cL);
      ck("S16.13", { setup: st0 === "APPROVED/PENDING" && Math.abs(before13 - 7) < 1e-9, ok: o13.ok, sum: Math.abs(after13 - 10) < 1e-9, both: st1 === "CANCELLED/CANCELLED", audit: !!la?.id && !!lp?.id && au13.includes(la.id) && au13.includes(lp.id), noop: again.text === T.ended && (await cnt("hrLeaveBalanceTxn", { employeeId: eLv })) === n13 && Math.abs((await sumOf()) - 10) < 1e-9 }, "Σ 10.0 · CANCELLED ×2", `${st0} ${before13}→${after13} ${st1} ${shown(o13)}`);
      // S16.14 r3: a PENDING leave that slipped in on the ENDED employee (D-H44-leave-race) cannot be approved by H2.7
      const lz = (await P.hrLeave.create({ data: { tenantId: TT, systemId: sL, employeeId: eLv, type: "VACATION", policyId: pr?.id ?? null, fromDate: dbDate("2031-06-27"), toDate: dbDate("2031-06-27"), days: "1", status: "PENDING" } })).id as string;
      const dz = await hr.decideLeave(cL, lz, "APPROVED", U.owner.id).then(() => "ok", (e: unknown) => `refused ${errText(e).slice(0, 40)}`);
      ck("S16.14", { status: (await fu("hrLeave", lz))?.status !== "APPROVED", use: (await cnt("hrLeaveBalanceTxn", { sourceKey: `use:${lz}` })) === 0, sum: Math.abs((await sumOf()) - 10) < 1e-9 }, "not approvable", `${dz} ${(await fu("hrLeave", lz))?.status}`);
      // S16.15 r3: the due panel never lists the viewer's own row (eM2 = mgrU1's own row, probation due since S16.9)
      const own = await due(V.mgrU1);
      ck("S16.15", { ok: own.ok, none: !((own.value?.items ?? []) as Any[]).some((x) => x.employeeId === eM2) }, "own row absent", "");
      // S16.16 r3: the remove button and the ENDED profile save carry the "account kept" outcome to the user
      {
        const a = stripComments(rd(F.actions));
        const rem = block(a, /export async function removeEmployeeAction/, 1400).split(/\nexport /)[0];
        const save = block(a, /export async function saveEmployeeProfileAction/, 3200).split(/\nexport /)[0];
        chk("S16.16", /accessKept/.test(rem) && /ok\.kept|savedKept/.test(rem) && /accessKept/.test(save) && /savedKept/.test(save), "both paths", "");
      }
    } finally {
      await P.pushDevice.deleteMany({ where: { id: { in: pushIds } } }).catch(() => null);
    }
  }

  {
    let code = "";
    const eT = await emp(sA, "keepnote");
    await P.hrReviewNote.create({ data: { tenantId: TT, systemId: sA, employeeId: eT, kind: "WRITTEN_WARNING", title: "qc", body: "qc" } });
    // ORACLE-EDIT (builder H4.4 · S11.1): Prisma 7 raw errors carry P2010 with the PG code in meta.driverAdapterError.cause.originalCode ·
    //   PostgreSQL reports an ON DELETE RESTRICT refusal as 23001 restrict_violation (NO ACTION = 23503) ⇒ both codes = "refused by the FK"
    await P.$executeRawUnsafe(`DELETE FROM "HrEmployee" WHERE "id" = $1`, eT).catch((e: Any) => (code = [e?.meta?.driverAdapterError?.cause?.originalCode, e?.meta?.code, e?.code, errText(e)].filter(Boolean).map(String).join(" ")));
    const left = await cnt("hrReviewNote", { employeeId: eT });
    chk("S11.1", /23503|23001|P2003|foreign key/i.test(code) && left === 1, "23503|23001 · note kept", `${code.slice(0, 40) || "deleted"} ${left}`);
    const q = (await fx.rawRows(`SELECT c.conname::text AS conname, c.confdeltype::text AS confdeltype FROM pg_constraint c WHERE c.conname IN ('HrReviewNote_employeeId_fkey','HrOnboardingTask_employeeId_fkey')`)) ?? [];
    const by = Object.fromEntries(q.map((x: Any) => [x.conname, x.confdeltype]));
    chk("S11.2", by.HrReviewNote_employeeId_fkey === "r" && by.HrOnboardingTask_employeeId_fkey === "c", "r · c", short(by, 80));
  }

  {
    const eH = await emp(sA, "hash");
    await withPin(cA, eH, "2468");
    await hr.setEmployeeActive(cA, eH, false);
    const e = await row(eH);
    chk("S15.2", !!e?.pinHash && e?.active === false && e?.employmentStatus === "ENDED", "hash kept · ENDED", `pin=${e?.pinHash ? "set" : "null"} ${e?.employmentStatus}`);
    const cols = (await fx.rawRows(`SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name = 'HrEmployee' AND column_name IN ('offboardedAt','offboardReason','offboardNote','offboardedById')`)) ?? [];
    const c = Object.fromEntries(cols.map((x: Any) => [x.column_name, `${x.data_type}:${x.udt_name}`]));
    chk("S1.4", /^timestamp/.test(c.offboardedAt ?? "") && /HrOffboardReason/.test(c.offboardReason ?? "") && /^text/.test(c.offboardNote ?? "") && /^text/.test(c.offboardedById ?? ""), "4 columns", short(c, 120));
  }
}

// ═════════════════════════ run ═════════════════════════
let crashed = "";
try {
  runStatic();
  const fz = await fitnessNoEnv();
  const fh = rd(F.fitHr);
  ck("S12.6", { sens: /SENSITIVE_FIELDS\s*=\s*\[[^\]]*"offboardNote"/.test(fh), pin: /lifecycle\.ts/.test(fh), run: fz.ok }, "lists · exit 0 ×2", fz.note);
  await runDb();
} catch (e) {
  crashed = errText(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  const KANBAN = ["KanbanCardLink", "KanbanActivity", "KanbanCardAssignee", "KanbanCardLabel", "KanbanChecklistItem", "KanbanChecklist", "KanbanComment", "KanbanWatcher", "KanbanInboxItem", "KanbanCard", "KanbanColumn", "KanbanBoardMember", "KanbanBoardStar", "KanbanBoard"];
  const MINE = ["HrReviewNote", "HrOnboardingTask", ...KANBAN];
  for (const tid of fx.tenants) {
    for (const t of MINE) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid).catch(() => null);
    await P.chatRateBucket.deleteMany({ where: { key: { contains: tid } } }).catch(() => null);
  }
  await cleanupFx(P, fx, SLUG);
  const left = await residueOf(P, fx, SLUG, SLUG_PREFIX);
  for (const tid of fx.tenants)
    for (const t of MINE) {
      const r = await fx.rawRows(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid);
      if (r && Number(r[0]?.n) !== 0) left.push(`${t}=${r[0]?.n}`);
    }
  chk("Z1", left.length === 0, "none", left.join() || "clean");
}
process.exit(finish({ forced: FORCE, crashed, missing: skipReasons }));
