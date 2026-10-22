// QC — HR V2 · H0.7 — hotfix residuals: leave requester = user id (+ data fix) · owner's own leave · cancel my leave ·
//      linkedUserId 1↔1 per tenant + linkApprovedById ("link before salary") · plan steps carry the confirmer · self-binding of requestLeaveAction
// ⚠️ Oracle under change control (controller owns it) — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// requires: nothing seeded — own throwaway tenants `qc-hr-h0.7-<stamp>` (main) · `-b` (other tenant) · `-fix` (data-fix tenant), swept in `finally`
//
// Contract (ledger/hr-briefs/hr-brief-H0.7.md §2 R1–R10 · §3 · §6 Q1–Q3 · base session/hr 392bf457 ⊇ 527c155f):
//   R1 migration 20261203000000_hr_link_unique_requester: HrEmployee."linkApprovedById" TEXT NULL · HrLeave."filedById" TEXT NULL ·
//      partial unique "HrEmployee_tenantId_linkedUserId_key" ("tenantId","linkedUserId") WHERE "linkedUserId" IS NOT NULL
//      (new columns are read through $queryRaw only — the base Prisma client does not know them)
//   R2 requestLeave: ApprovalRequest.requestedById = employee.linkedUserId ?? input.actorUserId · both null ⇒
//      "ใบลานี้ยังไม่มีบัญชีผู้ยื่น — ให้ผู้จัดการยื่นแทน" · filedById = actor when actor ≠ linked user
//   R3 requestLeaveAction: STAFF without hr.employee.create / hr.leave.decide ⇒ posted employeeId ignored, employeeOfUser() ·
//      MANAGER/OWNER/key holders may post an employeeId of THIS HR system (other system/tenant ⇒ not-found text) + filedById
//   R4 owner's own leave ⇒ APPROVED at once · decidedById null · no ApprovalRequest · audit hr.leave.owner_auto {leaveId}
//   R5 cancelLeave(ctx, leaveId, { actorUserId }) + cancelLeaveAction: requester only · PENDING (or owner-auto APPROVED with fromDate in
//      the future) ⇒ HrLeave CANCELLED (enum has it — Q1) · pending ApprovalRequest → CANCELLED through the core · audit hr.leave.cancel
//   R6 link (src/lib/staff/service.ts grantStaffAccess) 1↔1 (DB index = final judge) · salary profile ⇒ payroll viewer only
//      ("พนักงานคนนี้มีข้อมูลเงินเดือน — ให้ผู้ดูแลเงินเดือนเป็นคนผูกบัญชี") · linkApprovedById = actor · unlink clears both ·
//      audit hr.employee.link {employeeId, userId, approvedById}
//   R7 executePlan hands the confirmer to runKind · hr_decide_leave / approval_decide stay blocked in plans (R5.4)
//   R8 scripts/hr-fix-approval-requester.mts [--tenant <id>] [--apply] — dry-run default · idempotent · counts/ids only
//   R9 readers unchanged (signature hash) · leave DTO unchanged except "ยื่นโดย <name>" for managers/HR · R10 fixed Thai texts
//
// Groups: S1 requester · S2 owner's own leave · S3 cancel · S4 link 1↔1 + linkApprovedById · S5 data fix · S6 plan steps ·
//         S7 statics · X6 data-fix replay · X7 link races · X8 privacy · X9 cancel-surface viewer matrix · Z1 residue
//
// SKIP convention (house style of qc-hr-h0.6): while nothing of H0.7 exists (no migration folder · no cancelLeave · no filedById in
//   hr/service.ts) the suite prints SKIPPED + JSON_SUMMARY {skipped:true} and exits 0 · QC_FORCE=1 (or --force-run) runs everything ·
//   on the base every check that needs the new code is RED for the right reason, controls are green, no crash, no residue.
// Server actions are called for real inside a simulated Next request scope with real temporary Session rows (technique of
//   qc-hr-h0.3 / qc-hf-o23) — never over HTTP. AI plans use aiMemberActor + newConversationId exactly like production.
// --list = print every id without touching the DB.
//
// Run (QC4 only):
//   bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h0.7.mts
//   bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-hr-h0.7.mts      (SKIP exit 0 on the base)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const SUITE = "qc-hr-h0.7";
const ROOT = process.cwd();
const ARGV = process.argv.slice(2);
const LIST = ARGV.includes("--list");
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const QC4_HOST_MARK = "ep-frosty-lab";
const SLUG_PREFIX = "qc-hr-h0.7-";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SERVICE_FILE = "src/lib/modules/hr/service.ts";
const ACTIONS_FILE = "src/lib/modules/hr/actions.ts";
const PAYROLL_FILE = "src/lib/modules/hr/payroll.ts";
const HR_INDEX = "src/lib/modules/hr/index.ts";
const RULES_FILE = "src/lib/modules/hr/payroll-rules.ts";
const PLANS_FILE = "src/lib/ai/plans.ts";
const HR_SCHEMA = "prisma/schema/hr.prisma";
const MIG_DIR = "prisma/migrations/20261203000000_hr_link_unique_requester";
const MIG_FILE = `${MIG_DIR}/migration.sql`;
const FIX_SCRIPT = "scripts/hr-fix-approval-requester.mts";
const UI_INVENTORY = "scripts/hr-ui-inventory.json";
/** sha256 of payroll-rules.ts on the base 392bf457 (FREEZE — COMMON §C.4) */
const RULES_SHA = "75a66c0c1354e932e7ba29609dcbf0919ffe82b51f476a3945fd1a0749833bf7";
/** sha256 of the 4 reader signatures (employeeOfUser · isOnLeave · payrollEmployeeOfUser · activeLinkedUserIds — header up to "{\n") on 392bf457 */
const READER_SIG_SHA = "e995b1282742e83be6a7457a3fc43bea63d183a895e5da372ba8c3010851964b";

// ── fixed texts (brief R2 · R4 · R6 · existing HF-HR-0 texts) ──
const T_NO_REQUESTER = "ใบลานี้ยังไม่มีบัญชีผู้ยื่น — ให้ผู้จัดการยื่นแทน";
const T_OWNER_NOTE = "เจ้าของร้าน — ไม่ต้องผ่านการอนุมัติ";
const T_SALARY_LINK = "พนักงานคนนี้มีข้อมูลเงินเดือน — ให้ผู้ดูแลเงินเดือนเป็นคนผูกบัญชี";
const T_SELF_DECIDE = "ใบลานี้เป็นของบัญชีผู้ตัดสินเอง — ให้หัวหน้าหรือเจ้าของกิจการเป็นผู้ตัดสิน";
const T_SELF_DECIDE_CHAIN = "อนุมัติคำขอของตัวเองไม่ได้ — ให้ผู้อนุมัติคนอื่นตัดสิน";
const T_PLAN_LEAVE = "ทำรายการนี้ผ่านแผนงานอัตโนมัติไม่ได้ กรุณาอนุมัติใบลาในหน้าระบบพนักงาน";

// ═════════════════════════ registry (id · group · severity · base expectation · title) ═════════════════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Def = readonly [string, string, Sev, "RED" | "GREEN", string];
const D = (id: string, g: string, sev: Sev, base: "RED" | "GREEN", title: string): Def => [`H0.7-${id}`, g, sev, base, title] as const;
const CHECKS: readonly Def[] = [
  // S1 requester (R2 · R3)
  D("S1.1", "R2", "CRITICAL", "RED", "[action] staff A files own leave (no employeeId posted) ⇒ 1 leave of A · ApprovalRequest.requestedById = user A · filedById null"),
  D("S1.2", "R2", "MAJOR", "RED", "[core] approval listMyRequests(user A) contains that request"),
  D("S1.3", "R2", "MAJOR", "RED", "[action] manager files for staff C (unlinked) ⇒ requestedById = manager · filedById = manager"),
  D("S1.4", "R3", "CRITICAL", "RED", "[action] 🔴 staff A posts employeeId of staff B ⇒ ignored: no leave of B · the new leave is A's own (filedById null)"),
  D("S1.5", "R3", "MAJOR", "RED", "[action] member with hr.leave.request but no employee ⇒ fixed Thai refusal · 0 leaves"),
  D("S1.6", "R3", "CRITICAL", "RED", "[action] 🔴 manager posts employeeId of another tenant / another HR system ⇒ Thai not-found text · 0 leaves"),
  D("S1.7", "R2", "MAJOR", "RED", "[service] requestLeave for unlinked C without actorUserId ⇒ \"" + T_NO_REQUESTER + "\" · 0 leaves"),
  D("S1.8", "R3", "MAJOR", "RED", "[action] STAFF holding hr.leave.decide files for C ⇒ allowed · requestedById = filedById = that user"),
  // S2 owner's own leave (R4)
  D("S2.1", "R4", "CRITICAL", "RED", "[action] owner files own leave ⇒ APPROVED · decidedById null · no ApprovalRequest"),
  D("S2.2", "R4", "MAJOR", "RED", "[db] exactly one audit hr.leave.owner_auto for it · payload carries leaveId (ids only)"),
  D("S2.3", "R4", "MAJOR", "RED", "[service] availability: isOnLeave(owner, a day inside) = true · isAvailable(owner employee) = false"),
  D("S2.4", "R4.1a", "CRITICAL", "GREEN", "[action+service] manager's own leave stays PENDING in the chain · decideLeave / approval.decide by the manager ⇒ existing self-decision texts"),
  D("S2.5", "R4", "MAJOR", "RED", "[action] manager files on behalf of the owner ⇒ same auto path (APPROVED · no request) · filedById = manager"),
  D("S2.6", "R4.1a", "CRITICAL", "GREEN", "[service] no OWNER self-approval: a (legacy) PENDING leave of the owner decided by the owner ⇒ self-decision text · unchanged"),
  // S3 cancel (R5)
  D("S3.1", "R5", "CRITICAL", "RED", "[service] staff A cancels own PENDING leave ⇒ HrLeave CANCELLED · ApprovalRequest CANCELLED (core) · one audit hr.leave.cancel"),
  D("S3.2", "R5", "CRITICAL", "RED", "[service] 🔴 staff B cancels A's PENDING leave ⇒ Thai refusal · leave + request unchanged"),
  D("S3.3", "R5", "MAJOR", "RED", "[service] A cannot cancel a chain-APPROVED leave ⇒ refusal · stays APPROVED / request APPROVED"),
  D("S3.4", "R5", "MAJOR", "RED", "[service] owner cancels own future owner-auto leave ⇒ CANCELLED · own past owner-auto leave ⇒ refused, stays APPROVED"),
  // S4 link 1↔1 + linkApprovedById (R6)
  D("S4.1", "R6", "CRITICAL", "RED", "[staff] payroll viewer links user X → employee P (salary profile) ⇒ ok · linkedUserId = X · linkApprovedById = viewer"),
  D("S4.2", "R6", "CRITICAL", "RED", "[staff] 🔴 manager (no hr.payroll.read) links an employee with salary profile ⇒ \"" + T_SALARY_LINK + "\" · no link"),
  D("S4.3", "R6", "MAJOR", "RED", "[staff] manager links user Y → employee Q (no salary profile) ⇒ ok · linkApprovedById = manager"),
  D("S4.4", "R6", "CRITICAL", "RED", "[staff+db] 🔴 X → second employee R ⇒ Thai refusal without P's name · DB probe (raw updateMany in a rolled-back tx) fails with unique violation"),
  D("X4.5", "R6", "CRITICAL", "GREEN", "[staff] two concurrent links of ONE account to TWO employees × 3 rounds ⇒ exactly one ok each round · 1 employee linked"),
  D("S4.6", "R6", "MAJOR", "RED", "[staff] unlink (revokeStaffAccess — ORACLE-EDIT Q-C) clears linkedUserId AND linkApprovedById · audit hr.employee.link unlinked"),
  D("S4.7", "R6", "MAJOR", "RED", "[db] audit hr.employee.link {employeeId, userId, approvedById} for S4.1 — ids only"),
  D("S4.8", "R1", "CRITICAL", "RED", "[db] QC4 has partial unique index HrEmployee_tenantId_linkedUserId_key (UNIQUE · WHERE linkedUserId IS NOT NULL)"),
  // S5 data fix (R8)
  D("S5.1", "R8", "CRITICAL", "RED", "[script] dry-run (--tenant) changes nothing · reports 2 fixable / 1 without linked user (that row's id listed)"),
  D("S5.2", "R8", "CRITICAL", "RED", "[script] --apply ⇒ the 2 rows get the linked user id · the unlinked row untouched and listed"),
  D("S5.3", "R8", "MAJOR", "RED", "[script] second --apply ⇒ 0 rows changed (state identical)"),
  D("S5.4", "R8", "CRITICAL", "RED", "[script] other tenant's legacy row untouched (and the script ran)"),
  D("S5.5", "R8", "MAJOR", "RED", "[script] output carries no names / e-mails / other tenant ids (and the script ran)"),
  // S6 plan steps (R7)
  D("S6.1", "R7", "MAJOR", "RED", "[static] executePlan passes the confirmer (opts.userId) to runKind"),
  D("S6.2", "R7", "MAJOR", "GREEN", "[plan] leave-request kind in a plan (only if such a kind exists) confirmed by A ⇒ A's leave · requestedById = A · filedById null (N/A when no kind)"),
  D("S6.3", "R5.4", "CRITICAL", "GREEN", "[plan] forged plan with hr_decide_leave ⇒ FAILED · R5.4 text · leave unchanged · createPlan refuses it"),
  // S7 statics / regression
  D("S7.1", "R1", "CRITICAL", "RED", "[static] migration " + MIG_DIR + " = exactly 3 statements (2 ADD COLUMN TEXT + partial unique index)"),
  D("S7.2", "R1", "MAJOR", "RED", "[static] hr.prisma: HrEmployee.linkApprovedById String? · HrLeave.filedById String?"),
  D("S7.3", "R1", "CRITICAL", "RED", "[db] QC4 columns HrEmployee.linkApprovedById + HrLeave.filedById exist (text, nullable)"),
  D("S7.4", "C.4", "CRITICAL", "GREEN", "[static] payroll-rules.ts byte-identical (sha256 of base)"),
  D("S7.5", "R9", "CRITICAL", "GREEN", "[static] reader signatures unchanged (employeeOfUser · isOnLeave · payrollEmployeeOfUser · activeLinkedUserIds) + still exported by hr/index.ts"),
  D("S7.6", "R10", "MAJOR", "RED", "[static] cancelLeave + cancelLeaveAction exist · no raw e.message in requestLeave / cancelLeave / their actions"),
  D("S7.7", "R5", "MAJOR", "RED", "[static] \"my requests\" UI wires cancelLeaveAction with a data-testid (…cancel…) listed in hr-ui-inventory.json"),
  D("S7.8", "R7", "MINOR", "GREEN", "[static] plans.ts still blocks hr_decide_leave + approval_decide (PLAN_HUMAN_ONLY)"),
  // X groups
  D("X6.1", "X6", "MAJOR", "RED", "[script] replay: dry-run after apply reports 0 fixable (1 unlinked) · no change"),
  D("X6.2", "X6", "MAJOR", "RED", "[script] two parallel --apply on 2 fresh legacy rows ⇒ both exit 0 · each row fixed once"),
  D("X7.1", "R4.3", "CRITICAL", "GREEN", "[staff] two different accounts → ONE employee concurrently × 3 ⇒ exactly one ok · employee linked to the winner"),
  D("X7.2", "R1", "CRITICAL", "RED", "[db] 🔴 bypass race: raw UPDATEs on 2 connections linking one user to 2 employees × 3 ⇒ exactly one commits"),
  D("X8.1", "C.1", "MAJOR", "RED", "[db] audits hr.leave.owner_auto · hr.leave.cancel · hr.employee.link exist and carry no names / e-mails"),
  D("X8.2", "C.1", "MAJOR", "RED", "[texts] refusals (S1.5 S1.6 S3.2 S4.2 S4.4) are Thai, carry no other person's name, no error internals"),
  D("X8.3", "R9", "MAJOR", "RED", "[dto] leaveItemsForViewer: staff keys unchanged and no filer name · manager sees \"ยื่นโดย <manager name>\" on S1.3's leave"),
  D("X9.1", "X9", "CRITICAL", "RED", "[action] cancelLeaveAction by OWNER on A's PENDING leave ⇒ refused · unchanged"),
  D("X9.2", "X9", "CRITICAL", "RED", "[action] … by payroll viewer ⇒ refused · unchanged"),
  D("X9.3", "X9", "CRITICAL", "RED", "[action] … by manager without payroll ⇒ refused · unchanged"),
  D("X9.4", "X9", "CRITICAL", "RED", "[action] … by staff with HR keys (request/read/decide) ⇒ refused · unchanged"),
  D("X9.5", "X9", "CRITICAL", "RED", "[action] … by plain member ⇒ refused · unchanged"),
  D("X9.6", "X9", "CRITICAL", "RED", "[action] … by a member of another tenant ⇒ refused · unchanged"),
  D("X9.7", "X9", "CRITICAL", "RED", "[action] … by A herself (the requester) ⇒ CANCELLED · request CANCELLED"),
  D("Z1", "-", "CRITICAL", "GREEN", "residue: tenants qc-hr-h0.7-* gone · no HrLeave/HrEmployee/ApprovalRequest/AuditLog/OutboxEvent/AiPlan of ours · users/sessions gone · no rate rows"),
];

if (LIST) {
  console.log(`${SUITE} — ${CHECKS.length} checks (id · group · sev · base · title)`);
  for (const [id, g, sev, base, t] of CHECKS) console.log(`${id}\t${g}\t${sev}\t${base}\t${t}`);
  process.exit(0);
}

// ═════════════════════════ helpers ═════════════════════════
const TITLE = new Map(CHECKS.map(([id, , , , t]) => [id, t]));
const SEV = new Map(CHECKS.map(([id, , sev]) => [id, sev]));
const results = new Map<string, { ok: boolean; expected: string; actual: string }>();
function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  const full = `H0.7-${id}`;
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
function block(src: string, start: string, end = "\nexport "): string {
  const i = src.indexOf(start);
  if (i < 0) return "";
  const j = src.indexOf(end, i + start.length);
  return src.slice(i, j < 0 ? undefined : j);
}
const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).replace(/\s+/g, " ").slice(0, 180);
const isThai = (s: string) => /[฀-๿]/.test(s);
const techLeak = (s: string) => /Error\b|prisma|P20\d\d|undefined|is not a function|\bat \/|invocation|ECONN|23505/i.test(s);
const textOf = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["message", "reason", "error"]) if (typeof o[k] === "string" && o[k]) return String(o[k]);
  }
  return "";
};
const sigOf = (src: string, name: string) => {
  const i = src.indexOf(`export async function ${name}(`);
  if (i < 0) return "";
  const j = src.indexOf("{\n", i);
  return src.slice(i, j + 2);
};

// ═════════════════════════ statics (no DB) ═════════════════════════
function runStatic(): void {
  console.log("── [S7/S6] statics ──");
  // S7.1 migration = exactly the three statements
  const mig = rd(MIG_FILE);
  const stmts = mig
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n")
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s && !/^(BEGIN|COMMIT)$/i.test(s));
  const has = (re: RegExp) => stmts.filter((s) => re.test(s)).length;
  const s71 = {
    exists: !!mig,
    n: stmts.length,
    emp: has(/^ALTER TABLE "HrEmployee" ADD COLUMN "linkApprovedById" TEXT$/i),
    leave: has(/^ALTER TABLE "HrLeave" ADD COLUMN "filedById" TEXT$/i),
    idx: has(/^CREATE UNIQUE INDEX "HrEmployee_tenantId_linkedUserId_key" ON "HrEmployee" ?\( ?"tenantId", ?"linkedUserId" ?\) WHERE "linkedUserId" IS NOT NULL$/i),
  };
  chk("S7.1", s71.exists && s71.n === 3 && s71.emp === 1 && s71.leave === 1 && s71.idx === 1, "3 statements: emp col · leave col · partial unique", short(s71));

  // S7.2 schema
  const sch = rd(HR_SCHEMA);
  const empModel = block(sch, "model HrEmployee {", "\n}");
  const leaveModel = block(sch, "model HrLeave {", "\n}");
  const s72 = { linkApprovedById: /^\s*linkApprovedById\s+String\?/m.test(empModel), filedById: /^\s*filedById\s+String\?/m.test(leaveModel) };
  chk("S7.2", s72.linkApprovedById && s72.filedById, "both String?", short(s72));

  // S7.4 FREEZE
  const rules = rd(RULES_FILE);
  const rsha = createHash("sha256").update(rules).digest("hex");
  chk("S7.4", rsha === RULES_SHA, RULES_SHA.slice(0, 16), `${rsha.slice(0, 16)} len=${rules.length}`);

  // S7.5 reader signatures + facade exports
  const svc = rd(SERVICE_FILE);
  const pay = rd(PAYROLL_FILE);
  const sigs = [sigOf(svc, "employeeOfUser"), sigOf(svc, "isOnLeave"), sigOf(pay, "payrollEmployeeOfUser"), sigOf(pay, "activeLinkedUserIds")];
  const ssha = createHash("sha256").update(sigs.join("\n--\n")).digest("hex");
  const idx = rd(HR_INDEX);
  const exported = ["employeeOfUser", "isOnLeave", "payrollEmployeeOfUser", "activeLinkedUserIds"].every((n) => new RegExp(`\\b${n}\\b`).test(idx));
  chk("S7.5", ssha === READER_SIG_SHA && exported, READER_SIG_SHA.slice(0, 16) + " + exported", `${ssha.slice(0, 16)} lens=${sigs.map((s) => s.length).join(",")} exported=${exported}`);

  // S7.6 cancel functions exist · no raw e.message
  const act = rd(ACTIONS_FILE);
  const fns = {
    requestLeave: block(svc, "export async function requestLeave("),
    cancelLeave: block(svc, "export async function cancelLeave("),
    requestLeaveAction: block(act, "export async function requestLeaveAction("),
    cancelLeaveAction: block(act, "export async function cancelLeaveAction("),
  };
  const rawMsg = (src: string) =>
    src
      .split("\n")
      .filter((l) => /\b(e|err|error|ex)\.message\b|\(e as Error\)\.message|String\(e\)/.test(l))
      .filter((l) => !/instanceof\s+Hr\w*Error/.test(l)).length;
  const s76 = {
    cancelLeave: !!fns.cancelLeave,
    cancelLeaveAction: !!fns.cancelLeaveAction,
    rawMsg: Object.fromEntries(Object.entries(fns).map(([k, v]) => [k, rawMsg(v)])),
  };
  chk("S7.6", s76.cancelLeave && s76.cancelLeaveAction && Object.values(s76.rawMsg).every((n) => n === 0), "both exist · rawMsg all 0", short(s76));

  // S7.7 UI wiring + inventory
  const roots = ["src/app/app/approvals", "src/lib/modules/hr", "src/lib/modules/approval", "src/components"];
  const files: string[] = [];
  const walk = (d: string) => {
    const abs = join(ROOT, d);
    if (!existsSync(abs)) return;
    for (const n of readdirSync(abs)) {
      const p = join(d, n);
      const st = statSync(join(ROOT, p));
      if (st.isDirectory()) walk(p);
      else if (/\.tsx$/.test(n)) files.push(p);
    }
  };
  roots.forEach(walk);
  const inv = rd(UI_INVENTORY);
  const wired: string[] = [];
  for (const f of files) {
    const src = rd(f);
    if (!src.includes("cancelLeaveAction")) continue;
    for (const m of src.matchAll(/data-testid=["'{`]+([\w:.\-${}]*cancel[\w:.\-${}]*)["'`}]/gi)) {
      const tid = m[1]!.replace(/\$\{[^}]*\}.*$/, "");
      if (tid && inv.includes(`"${tid}`)) wired.push(`${f}:${tid}`);
    }
  }
  chk("S7.7", wired.length > 0, "a .tsx using cancelLeaveAction + testid …cancel… in inventory", wired.length ? wired.slice(0, 3).join(" ") : `none (scanned ${files.length} tsx)`);

  // S7.8 R5.4 block kept
  const plans = rd(PLANS_FILE);
  const hum = block(plans, "const PLAN_HUMAN_ONLY", "};");
  chk("S7.8", /hr_decide_leave\s*:/.test(hum) && /approval_decide\s*:/.test(hum) && hum.includes(T_PLAN_LEAVE), "both kinds + texts", `len=${hum.length}`);

  // S6.1 executePlan → runKind carries the confirmer
  const ep = block(plans, "export async function executePlan(");
  const call = /runKind\(([^;]*?)\);/s.exec(ep)?.[1] ?? "";
  chk("S6.1", /userId/.test(call), "runKind(… opts.userId …)", call ? `runKind(${short(call, 120)})` : "no runKind call");
}

// ═════════════════════════ SKIP guard (static — before any DB connection) ═════════════════════════
const skipReasons: string[] = [];
{
  const svc = rd(SERVICE_FILE);
  const present = existsSync(join(ROOT, MIG_FILE)) || svc.includes("export async function cancelLeave(") || svc.includes("filedById");
  if (!present) skipReasons.push(`H0.7 not built: ${MIG_DIR} absent · hr/service.ts has no cancelLeave / filedById`);
}

// ═════════════════════════ env (QC4 only) ═════════════════════════
process.env.QC_ENV_FILE ??= ".env.qc";
if (process.env.QC_ENV_FILE === ".env") {
  console.error(`🔴 ${SUITE}: QC_ENV_FILE=.env is production — refused`);
  process.exit(4);
}
const { loadLegacyQcEnv } = await import("./qc-env-guard.mjs" as string);
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

// ── Next request scope (technique of qc-hr-h0.3 / qc-hf-o23) ──
const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null)) as Any;
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  if (!nextWork?.workAsyncStorage || !nextWorkUnit?.workUnitAsyncStorage || !nextCookies?.RequestCookies) throw new Error("no Next request scope (next/dist/... not loadable)");
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": SUITE, "x-forwarded-for": "203.0.113.137" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  return nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}

if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: H0.7 not built`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], findings: [], skipped: true, reason: skipReasons, registered: CHECKS.length })}`);
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — running although: ${skipReasons.join(" · ")} (expect RED for the right reason, no crash)`);

const { prisma } = (await import("@/lib/core/db")) as Any;
const P = prisma as Any;
const sys = (await import("@/lib/modules/system/service")) as Any;
const hr = (await import("@/lib/modules/hr/service")) as Any;
const act = (await import("@/lib/modules/hr/actions" as string)) as Any;
const privacy = (await import("@/lib/modules/hr/privacy" as string)) as Any;
const approval = (await import("@/lib/modules/approval/service")) as Any;
const effects = (await import("@/lib/approval-effects" as string)) as Any;
const staff = (await import("@/lib/staff/service" as string)) as Any;
const plans = (await import("@/lib/ai/plans")) as Any;
const proposals = (await import("@/lib/ai/proposals")) as Any;
const aiActor = (await import("@/lib/ai/actor")) as Any;
const convOwner = (await import("@/lib/ai/conversation-owner")) as Any;
const coreHash = (await import("@/lib/core/hash" as string)) as Any;

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
const names: string[] = []; // every person / employee name we create (X8 / S5.5 leak checks)
const ids: string[] = [];

type Who = { id: string; name: string; email: string; cookie: string; tenantId: string; role: string; permissions: Record<string, boolean> };
async function mkUser(tenantId: string | null, tag: string, name: string, role: "OWNER" | "MANAGER" | "STAFF", permissions: Record<string, boolean>): Promise<Who> {
  const email = `${SLUG}-${tag}@qc.invalid`;
  const u = await P.user.create({ data: { email, name } });
  users.push(u.id);
  emails.push(email);
  names.push(name);
  ids.push(u.id);
  let cookie = "";
  if (tenantId) {
    await P.membership.create({ data: { userId: u.id, tenantId, role, unitAccess: role === "STAFF" ? [] : ["*"], permissions, acceptedAt: new Date() } });
    const token = coreHash.randomToken(32) as string;
    const DAY = 86_400_000;
    await P.session.create({ data: { userId: u.id, tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 30 * DAY), expiresAt: new Date(Date.now() + 90 * DAY) } });
    cookie = `shark_session=${token}; __Host-shark_session=${token}; shark_tenant=${tenantId}`;
  }
  return { id: u.id, name, email, cookie, tenantId: tenantId ?? "", role, permissions };
}
async function mkEmp(tenantId: string, systemId: string, name: string, linkedUserId: string | null = null): Promise<string> {
  const e = await P.hrEmployee.create({ data: { tenantId, systemId, name, linkedUserId } });
  names.push(name);
  ids.push(e.id);
  return e.id as string;
}
const mOf = (w: Who) => ({ role: w.role, unitAccess: w.role === "STAFF" ? [] : ["*"], permissions: w.permissions });
const leavesOf = (employeeId: string): Promise<Any[]> =>
  P.hrLeave.findMany({ where: { employeeId }, orderBy: { createdAt: "asc" }, select: { id: true, status: true, decidedById: true, fromDate: true, systemId: true } });
const reqOf = (tenantId: string, leaveId: string): Promise<Any> => P.approvalRequest.findFirst({ where: { tenantId, entityType: "HrLeave", entityId: leaveId } });
const colCache = new Map<string, boolean>();
async function colExists(table: string, column: string): Promise<boolean> {
  const k = `${table}.${column}`;
  if (!colCache.has(k)) {
    const r = (await P.$queryRawUnsafe(`SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`, table, column)) as Any[];
    colCache.set(k, r.length > 0);
  }
  return colCache.get(k)!;
}
/** value of a column the base client does not know — "∅col" when the column is absent */
async function rawCol(table: string, column: string, id: string): Promise<string | null> {
  if (!(await colExists(table, column))) return "∅col";
  const r = (await P.$queryRawUnsafe(`SELECT "${column}" AS v FROM "${table}" WHERE id = $1`, id)) as Any[];
  return r[0] ? (r[0].v ?? null) : "∅row";
}
async function audits(tenantId: string, action: string, targetId?: string): Promise<Any[]> {
  return P.auditLog.findMany({ where: { tenantId, action, ...(targetId ? { targetId } : {}) }, select: { action: true, targetId: true, actorId: true, before: true, after: true } });
}
const hasName = (s: string, except: string[] = []) => names.filter((n) => !except.includes(n)).some((n) => s.includes(n)) || emails.some((e) => s.includes(e));

/** call a server action whatever its arity: (fd) · (prev, fd) · (systemId, prev, fd) */
type Out = { threw: boolean; value: unknown; text: string };
async function callAction(who: Who, fn: Any, systemId: string, form: FormData, path: string): Promise<Out> {
  if (typeof fn !== "function") return { threw: true, value: undefined, text: "∅fn" };
  try {
    const v = await inScope(who.cookie, path, () => (fn.length >= 3 ? fn(systemId, { status: "idle" }, form) : fn.length === 2 ? fn({ status: "idle" }, form) : fn(form)));
    return { threw: false, value: v, text: textOf(v) };
  } catch (e) {
    return { threw: true, value: undefined, text: e instanceof Error ? e.message : String(e) };
  }
}
async function cancelSvc(tenantId: string, systemId: string, leaveId: string, actorUserId: string): Promise<{ absent: boolean; ok: boolean; text: string }> {
  if (typeof hr.cancelLeave !== "function") return { absent: true, ok: false, text: "∅ cancelLeave" };
  try {
    const r = await hr.cancelLeave({ tenantId, systemId }, leaveId, { actorUserId });
    const ok = !(r === false || (r && typeof r === "object" && ((r as Any).ok === false || (r as Any).status === "error")));
    return { absent: false, ok, text: textOf(r) };
  } catch (e) {
    return { absent: false, ok: false, text: e instanceof Error ? e.message : String(e) };
  }
}

function spawnTsx(args: string[], timeoutMs = 180_000): Promise<{ code: number; out: string }> {
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
const runFix = (args: string[]) => (existsSync(join(ROOT, FIX_SCRIPT)) ? spawnTsx([FIX_SCRIPT, ...args]) : Promise.resolve({ code: -1, out: `∅ ${FIX_SCRIPT}` }));
const ints = (s: string) => [...s.matchAll(/(?<![\w.-])(\d{1,6})(?![\w.-])/g)].map((m) => Number(m[1]));

async function newTenant(suffix: string, name: string): Promise<string> {
  const t = await P.tenant.create({ data: { name, slug: `${SLUG}${suffix}` } });
  tenants.push(t.id);
  ids.push(t.id);
  return t.id as string;
}

const refusals: Record<string, string> = {};

async function runDb(): Promise<void> {
  // ── setup ──
  const tid = await newTenant("", "QC HR H0.7 ผู้ยื่น/ยกเลิก/ผูกบัญชี");
  const t2 = await newTenant("-b", "QC HR H0.7 ร้านอื่น");
  const sA = await sys.createSystem(tid, "HR", "ทีมงาน A");
  await sleep(30);
  const sB = await sys.createSystem(tid, "HR", "ทีมงาน B");
  const s2 = await sys.createSystem(t2, "HR", "ทีมร้านอื่น");
  ids.push(sA.id, sB.id, s2.id);
  const ctxA = { tenantId: tid, systemId: sA.id };
  const pathA = `/app/sys/${sA.id}/hr/leave`;
  await approval.createPolicy({ tenantId: tid }, { name: "QC สายลา", entityType: "HrLeave", systemId: sA.id, steps: [{ order: 1, approverRole: "MANAGER" }] });

  const U = {
    owner: await mkUser(tid, "owner", `QC เจ้าของ ${stamp}`, "OWNER", {}),
    manager: await mkUser(tid, "manager", `QC ผู้จัดการ ${stamp}`, "MANAGER", {}),
    viewer: await mkUser(tid, "viewer", `QC ผู้ดูเงินเดือน ${stamp}`, "STAFF", { "hr.payroll.read": true, "settings.staff.write": true, "hr.leave.request": true }),
    hrKey: await mkUser(tid, "hrkey", `QC แอดมินลา ${stamp}`, "STAFF", { "hr.leave.request": true, "hr.leave.read": true, "hr.leave.decide": true }),
    a: await mkUser(tid, "a", `QC พนักงานเอ ${stamp}`, "STAFF", { "hr.leave.request": true }),
    b: await mkUser(tid, "b", `QC พนักงานบี ${stamp}`, "STAFF", { "hr.leave.request": true }),
    noEmp: await mkUser(tid, "noemp", `QC ไม่มีทะเบียน ${stamp}`, "STAFF", { "hr.leave.request": true }),
    member: await mkUser(tid, "member", `QC สมาชิก ${stamp}`, "STAFF", {}),
    other: await mkUser(t2, "other", `QC ร้านอื่น ${stamp}`, "OWNER", {}),
  };
  const E = {
    owner: await mkEmp(tid, sA.id, `พนง-เจ้าของ ${stamp}`, U.owner.id),
    manager: await mkEmp(tid, sA.id, `พนง-ผู้จัดการ ${stamp}`, U.manager.id),
    a: await mkEmp(tid, sA.id, `พนง-เอ ${stamp}`, U.a.id),
    b: await mkEmp(tid, sA.id, `พนง-บี ${stamp}`, U.b.id),
    c: await mkEmp(tid, sA.id, `พนง-ซี ${stamp}`),
    sysB: await mkEmp(tid, sB.id, `พนง-ระบบบี ${stamp}`),
    other: await mkEmp(t2, s2.id, `พนง-ร้านอื่น ${stamp}`),
  };
  const leaveForm = (from: string, to: string, extra: Record<string, string> = {}) => fd({ systemId: sA.id, type: "PERSONAL", fromDate: from, toDate: to, reason: "ธุระ", ...extra });

  // ═══ S1 requester ═══
  console.log("── [S1] requester = user id · self-binding ──");
  const r11 = await callAction(U.a, act.requestLeaveAction, sA.id, leaveForm("2031-01-06", "2031-01-06"), pathA);
  const la = await leavesOf(E.a);
  const l11 = la[0];
  const ar11 = l11 ? await reqOf(tid, l11.id) : null;
  const f11 = l11 ? await rawCol("HrLeave", "filedById", l11.id) : "∅row";
  chk("S1.1", la.length === 1 && ar11?.requestedById === U.a.id && f11 === null, "1 leave · requestedById=userA · filedById null", `leaves=${la.length} requestedById=${ar11 ? (ar11.requestedById === U.a.id ? "userA" : ar11.requestedById === E.a ? "EMPLOYEE id" : "other") : "∅req"} filedById=${f11} · ${short(r11, 80)}`);
  const mine = (await approval.listMyRequests({ tenantId: tid }, U.a.id)) as Any[];
  chk("S1.2", !!ar11 && mine.some((r) => r.id === ar11.id), "my requests ∋ request", `mine=${mine.length} req=${ar11 ? "yes" : "no"}`);

  const r13 = await callAction(U.manager, act.requestLeaveAction, sA.id, leaveForm("2031-01-13", "2031-01-14", { employeeId: E.c }), pathA);
  const lc = await leavesOf(E.c);
  const l13 = lc[0];
  const ar13 = l13 ? await reqOf(tid, l13.id) : null;
  const f13 = l13 ? await rawCol("HrLeave", "filedById", l13.id) : "∅row";
  chk("S1.3", lc.length === 1 && ar13?.requestedById === U.manager.id && f13 === U.manager.id, "requestedById=filedById=manager", `leaves=${lc.length} requestedById=${ar13 ? (ar13.requestedById === U.manager.id ? "manager" : ar13.requestedById === E.c ? "EMPLOYEE id" : "other") : "∅req"} filedById=${f13 === U.manager.id ? "manager" : f13} · ${short(r13, 60)}`);

  const r14 = await callAction(U.a, act.requestLeaveAction, sA.id, leaveForm("2031-01-20", "2031-01-20", { employeeId: E.b }), pathA);
  const lb = await leavesOf(E.b);
  const la2 = await leavesOf(E.a);
  const l14 = la2.find((l) => !la.some((x) => x.id === l.id));
  const f14 = l14 ? await rawCol("HrLeave", "filedById", l14.id) : "∅row";
  chk("S1.4", lb.length === 0 && !!l14 && f14 === null, "0 leaves of B · 1 new leave of A · filedById null", `B=${lb.length} newA=${l14 ? 1 : 0} filedById=${f14} · ${short(r14, 60)}`);

  const before15 = await P.hrLeave.count({ where: { tenantId: tid } });
  const r15 = await callAction(U.noEmp, act.requestLeaveAction, sA.id, leaveForm("2031-01-27", "2031-01-27"), pathA);
  const r15b = await callAction(U.noEmp, act.requestLeaveAction, sA.id, leaveForm("2031-01-28", "2031-01-28", { employeeId: E.c }), pathA);
  const after15 = await P.hrLeave.count({ where: { tenantId: tid } });
  refusals["S1.5"] = r15.text;
  chk("S1.5", after15 === before15 && isThai(r15.text) && !techLeak(r15.text) && isThai(r15b.text), "Thai refusal ×2 · 0 leaves", `Δleaves=${after15 - before15} text="${short(r15.text, 70)}" posted="${short(r15b.text, 50)}"`);

  const r16a = await callAction(U.manager, act.requestLeaveAction, sA.id, leaveForm("2031-02-03", "2031-02-03", { employeeId: E.other }), pathA);
  const r16b = await callAction(U.manager, act.requestLeaveAction, sA.id, leaveForm("2031-02-04", "2031-02-04", { employeeId: E.sysB }), pathA);
  const n16 = (await leavesOf(E.other)).length + (await leavesOf(E.sysB)).length;
  refusals["S1.6"] = `${r16a.text} | ${r16b.text}`;
  chk("S1.6", n16 === 0 && isThai(r16a.text) && isThai(r16b.text) && !techLeak(r16a.text + r16b.text), "Thai not-found ×2 · 0 leaves", `leaves=${n16} other="${short(r16a.text, 50)}" sysB="${short(r16b.text, 50)}"`);

  const before17 = (await leavesOf(E.c)).length;
  let t17 = "";
  try {
    await hr.requestLeave(ctxA, { employeeId: E.c, type: "SICK", fromDate: "2031-02-10", toDate: "2031-02-10" });
    t17 = "∅ no refusal";
  } catch (e) {
    t17 = e instanceof Error ? e.message : String(e);
  }
  const after17 = (await leavesOf(E.c)).length;
  chk("S1.7", t17 === T_NO_REQUESTER && after17 === before17, T_NO_REQUESTER, `"${short(t17, 80)}" Δleaves=${after17 - before17}`);

  const beforeC = await leavesOf(E.c);
  const r18 = await callAction(U.hrKey, act.requestLeaveAction, sA.id, leaveForm("2031-02-17", "2031-02-17", { employeeId: E.c }), pathA);
  const l18 = (await leavesOf(E.c)).find((l) => !beforeC.some((x) => x.id === l.id));
  const ar18 = l18 ? await reqOf(tid, l18.id) : null;
  const f18 = l18 ? await rawCol("HrLeave", "filedById", l18.id) : "∅row";
  chk("S1.8", !!l18 && ar18?.requestedById === U.hrKey.id && f18 === U.hrKey.id, "leave · requestedById=filedById=hrKey", `leave=${l18 ? 1 : 0} requestedById=${ar18 ? (ar18.requestedById === U.hrKey.id ? "hrKey" : "other") : "∅req"} filedById=${f18 === U.hrKey.id ? "hrKey" : f18} · ${short(r18, 60)}`);

  // ═══ S2 owner's own leave ═══
  console.log("── [S2] owner's own leave ──");
  const r21 = await callAction(U.owner, act.requestLeaveAction, sA.id, leaveForm("2031-05-01", "2031-05-03", { employeeId: E.owner }), pathA);
  const lo = await leavesOf(E.owner);
  const l21 = lo[0];
  const ar21 = l21 ? await reqOf(tid, l21.id) : null;
  chk("S2.1", lo.length === 1 && l21?.status === "APPROVED" && l21?.decidedById === null && !ar21, "APPROVED · decidedById null · no request", `leaves=${lo.length} status=${l21?.status} decidedById=${l21?.decidedById ?? null} request=${ar21 ? ar21.status : "none"} · ${short(r21, 60)}`);
  const au21 = l21 ? await audits(tid, "hr.leave.owner_auto") : [];
  const au21p = au21.map((a) => JSON.stringify(a.after ?? a.before ?? {}));
  chk("S2.2", au21.length === 1 && au21p[0]!.includes(l21?.id ?? "∅") && !hasName(au21p.join(" ")), "1 audit · leaveId · no names", `audits=${au21.length} ${short(au21p[0] ?? "", 100)}`);
  const onLeave = await hr.isOnLeave(tid, U.owner.id, new Date("2031-05-02T05:00:00.000Z"));
  const avail = await hr.isAvailable(ctxA, E.owner, new Date("2031-05-02T05:00:00.000Z"));
  chk("S2.3", onLeave === true && avail === false, "isOnLeave true · isAvailable false", `isOnLeave=${onLeave} isAvailable=${avail}`);

  // S2.4 manager's own leave stays in the chain; no self-decision
  const r24 = await callAction(U.manager, act.requestLeaveAction, sA.id, leaveForm("2031-03-02", "2031-03-02", { employeeId: E.manager }), pathA);
  const lm = (await leavesOf(E.manager))[0];
  const ar24 = lm ? await reqOf(tid, lm.id) : null;
  let t24a = "";
  if (lm) {
    try {
      await hr.decideLeave(ctxA, lm.id, "APPROVED", U.manager.id);
      t24a = "∅ decided";
    } catch (e) {
      t24a = e instanceof Error ? e.message : String(e);
    }
  }
  const d24 = ar24 ? await approval.decide({ ...mOf(U.manager), userId: U.manager.id }, { tenantId: tid }, ar24.id, { decision: "APPROVED" }) : null;
  const lm2 = lm ? (await leavesOf(E.manager))[0] : null;
  const ar24b = ar24 ? await P.approvalRequest.findUnique({ where: { id: ar24.id } }) : null;
  chk(
    "S2.4",
    lm?.status === "PENDING" && ar24?.status === "PENDING" && t24a === T_SELF_DECIDE && d24?.ok === false && d24?.reason === T_SELF_DECIDE_CHAIN && lm2?.status === "PENDING" && ar24b?.status === "PENDING",
    "PENDING · both self-decision texts · unchanged",
    `leave=${lm?.status} req=${ar24?.status} direct="${short(t24a, 40)}" chain=${short(d24, 80)} after=${lm2?.status}/${ar24b?.status} · ${short(r24, 40)}`,
  );

  const r25 = await callAction(U.manager, act.requestLeaveAction, sA.id, leaveForm("2031-06-01", "2031-06-01", { employeeId: E.owner }), pathA);
  const l25 = (await leavesOf(E.owner)).find((l) => l.id !== l21?.id);
  const ar25 = l25 ? await reqOf(tid, l25.id) : null;
  const f25 = l25 ? await rawCol("HrLeave", "filedById", l25.id) : "∅row";
  chk("S2.5", !!l25 && l25.status === "APPROVED" && l25.decidedById === null && !ar25 && f25 === U.manager.id, "APPROVED · no request · filedById=manager", `leave=${l25?.status ?? "none"} request=${ar25 ? ar25.status : "none"} filedById=${f25 === U.manager.id ? "manager" : f25} · ${short(r25, 50)}`);

  // S2.6 legacy PENDING owner leave (seeded directly) — owner cannot decide own leave
  const l26 = await P.hrLeave.create({ data: { tenantId: tid, systemId: sA.id, employeeId: E.owner, type: "OTHER", fromDate: new Date("2031-07-01"), toDate: new Date("2031-07-01") } });
  let t26 = "";
  try {
    await hr.decideLeave(ctxA, l26.id, "APPROVED", U.owner.id);
    t26 = "∅ decided";
  } catch (e) {
    t26 = e instanceof Error ? e.message : String(e);
  }
  const l26b = await P.hrLeave.findUnique({ where: { id: l26.id }, select: { status: true } });
  chk("S2.6", t26 === T_SELF_DECIDE && l26b?.status === "PENDING", T_SELF_DECIDE, `"${short(t26, 60)}" status=${l26b?.status}`);
  await P.hrLeave.deleteMany({ where: { id: l26.id } }); // keep later counts clean

  // ═══ S3 cancel ═══
  console.log("── [S3] cancel my leave ──");
  if (l11) {
    const c31 = await cancelSvc(tid, sA.id, l11.id, U.a.id);
    const s31 = await P.hrLeave.findUnique({ where: { id: l11.id }, select: { status: true } });
    const q31 = ar11 ? await P.approvalRequest.findUnique({ where: { id: ar11.id }, select: { status: true } }) : null;
    const au31 = await audits(tid, "hr.leave.cancel", l11.id);
    chk("S3.1", !c31.absent && c31.ok && s31?.status === "CANCELLED" && q31?.status === "CANCELLED" && au31.length === 1, "CANCELLED · request CANCELLED · 1 audit", `${c31.absent ? "∅ cancelLeave" : `ok=${c31.ok}`} leave=${s31?.status} req=${q31?.status ?? "∅"} audits=${au31.length} "${short(c31.text, 40)}"`);
  } else chk("S3.1", false, "CANCELLED", "no S1.1 leave to cancel");

  await hr.requestLeave(ctxA, { employeeId: E.a, actorUserId: U.a.id, type: "PERSONAL", fromDate: "2031-03-09", toDate: "2031-03-09" });
  const l32 = (await leavesOf(E.a)).at(-1)!;
  const q32 = await reqOf(tid, l32.id);
  const c32 = await cancelSvc(tid, sA.id, l32.id, U.b.id);
  const s32 = await P.hrLeave.findUnique({ where: { id: l32.id }, select: { status: true } });
  const q32b = q32 ? await P.approvalRequest.findUnique({ where: { id: q32.id }, select: { status: true } }) : null;
  refusals["S3.2"] = c32.text;
  chk("S3.2", !c32.absent && !c32.ok && isThai(c32.text) && s32?.status === "PENDING" && (!q32 || q32b?.status === "PENDING"), "refused (Thai) · unchanged", `${c32.absent ? "∅ cancelLeave" : `ok=${c32.ok}`} "${short(c32.text, 50)}" leave=${s32?.status} req=${q32b?.status ?? "∅"}`);

  await hr.requestLeave(ctxA, { employeeId: E.a, actorUserId: U.a.id, type: "PERSONAL", fromDate: "2031-03-16", toDate: "2031-03-16" });
  const l33 = (await leavesOf(E.a)).at(-1)!;
  const q33 = await reqOf(tid, l33.id);
  let s33pre = "";
  if (q33) {
    const d = await approval.decide({ ...mOf(U.owner), userId: U.owner.id }, { tenantId: tid }, q33.id, { decision: "APPROVED" });
    await effects.applyApprovalEffect({ tenantId: tid, type: "approval.request.approved", payload: { requestId: q33.id, entityType: "HrLeave", entityId: l33.id } });
    s33pre = `decide=${d?.ok}`;
  }
  const s33a = await P.hrLeave.findUnique({ where: { id: l33.id }, select: { status: true } });
  const c33 = await cancelSvc(tid, sA.id, l33.id, U.a.id);
  const s33 = await P.hrLeave.findUnique({ where: { id: l33.id }, select: { status: true } });
  const q33b = q33 ? await P.approvalRequest.findUnique({ where: { id: q33.id }, select: { status: true } }) : null;
  chk("S3.3", !c33.absent && !c33.ok && s33a?.status === "APPROVED" && s33?.status === "APPROVED" && q33b?.status === "APPROVED", "refused · APPROVED/APPROVED", `${s33pre} pre=${s33a?.status} ${c33.absent ? "∅ cancelLeave" : `ok=${c33.ok}`} "${short(c33.text, 40)}" leave=${s33?.status} req=${q33b?.status ?? "∅"}`);

  await hr.requestLeave(ctxA, { employeeId: E.owner, actorUserId: U.owner.id, type: "OTHER", fromDate: "2020-02-03", toDate: "2020-02-04" });
  const lPast = (await leavesOf(E.owner)).find((l) => new Date(l.fromDate).getUTCFullYear() === 2020);
  const c34f = l21 ? await cancelSvc(tid, sA.id, l21.id, U.owner.id) : { absent: true, ok: false, text: "∅" };
  const s34f = l21 ? await P.hrLeave.findUnique({ where: { id: l21.id }, select: { status: true } }) : null;
  const c34p = lPast ? await cancelSvc(tid, sA.id, lPast.id, U.owner.id) : { absent: true, ok: false, text: "∅" };
  const s34p = lPast ? await P.hrLeave.findUnique({ where: { id: lPast.id }, select: { status: true } }) : null;
  chk(
    "S3.4",
    !c34f.absent && c34f.ok && s34f?.status === "CANCELLED" && !c34p.absent && !c34p.ok && s34p?.status === "APPROVED",
    "future CANCELLED · past refused APPROVED",
    `future: ${c34f.absent ? "∅" : `ok=${c34f.ok}`} ${s34f?.status} · past: ${c34p.absent ? "∅" : `ok=${c34p.ok}`} ${s34p?.status ?? "none"} "${short(c34p.text, 40)}"`,
  );

  // ═══ S4 link 1↔1 ═══
  console.log("── [S4] link 1↔1 + linkApprovedById ──");
  const X = await mkUser(null, "x", `QC ผู้ใช้เอ็กซ์ ${stamp}`, "STAFF", {});
  const Y = await mkUser(null, "y", `QC ผู้ใช้วาย ${stamp}`, "STAFF", {});
  const Y2 = await mkUser(null, "y2", `QC ผู้ใช้วายสอง ${stamp}`, "STAFF", {});
  const pName = `พนง-พี-มีเงินเดือน ${stamp}`;
  const EP = await mkEmp(tid, sA.id, pName);
  const EP2 = await mkEmp(tid, sA.id, `พนง-พีสอง-มีเงินเดือน ${stamp}`);
  const EQ = await mkEmp(tid, sA.id, `พนง-คิว ${stamp}`);
  const ER = await mkEmp(tid, sA.id, `พนง-อาร์ ${stamp}`);
  for (const e of [EP, EP2]) await P.hrSalaryProfile.create({ data: { tenantId: tid, systemId: sA.id, employeeId: e, baseSalarySatang: 1_500_000 } });
  const grant = (actor: Who, employeeId: string, email: string) =>
    staff.grantStaffAccess({ tenantId: tid, actorUserId: actor.id, employeeId, email }).catch((e: unknown) => ({ ok: false, reason: `THROW ${errText(e)}` }));
  const linkOf = async (id: string) => ({ u: (await P.hrEmployee.findUnique({ where: { id }, select: { linkedUserId: true } }))?.linkedUserId ?? null, by: await rawCol("HrEmployee", "linkApprovedById", id) });

  const g41 = await grant(U.viewer, EP, X.email);
  const k41 = await linkOf(EP);
  chk("S4.1", g41?.ok === true && k41.u === X.id && k41.by === U.viewer.id, "ok · linked X · approvedBy viewer", `ok=${g41?.ok} linked=${k41.u === X.id ? "X" : k41.u} by=${k41.by === U.viewer.id ? "viewer" : k41.by} ${short(g41?.reason ?? "", 50)}`);

  const g42 = await grant(U.manager, EP2, Y2.email);
  const k42 = await linkOf(EP2);
  refusals["S4.2"] = String(g42?.reason ?? "");
  chk("S4.2", g42?.ok === false && g42?.reason === T_SALARY_LINK && k42.u === null, T_SALARY_LINK + " · no link", `ok=${g42?.ok} "${short(g42?.reason ?? "", 80)}" linked=${k42.u ? "YES" : "no"}`);

  const g43 = await grant(U.manager, EQ, Y.email);
  const k43 = await linkOf(EQ);
  chk("S4.3", g43?.ok === true && k43.u === Y.id && k43.by === U.manager.id, "ok · approvedBy manager", `ok=${g43?.ok} linked=${k43.u === Y.id ? "Y" : k43.u} by=${k43.by === U.manager.id ? "manager" : k43.by}`);

  const g44 = await grant(U.viewer, ER, X.email);
  const k44 = await linkOf(ER);
  refusals["S4.4"] = String(g44?.reason ?? "");
  let probe = "";
  const SENTINEL = "QC_H07_ROLLBACK";
  try {
    await P.$transaction(async (tx: Any) => {
      try {
        await tx.hrEmployee.updateMany({ where: { id: ER }, data: { linkedUserId: X.id } });
        probe = "accepted";
      } catch (e) {
        const code = (e as Any)?.code ?? "";
        probe = code === "P2002" || /23505|unique/i.test(String((e as Error)?.message ?? "")) ? "unique-violation" : `other:${code}`;
      }
      throw new Error(SENTINEL); // always roll back
    });
  } catch (e) {
    if (!String((e as Error)?.message ?? "").includes(SENTINEL) && !probe) probe = `tx:${errText(e)}`;
  }
  const k44b = await linkOf(ER);
  chk(
    "S4.4",
    g44?.ok === false && isThai(String(g44?.reason ?? "")) && !String(g44?.reason ?? "").includes(pName) && k44.u === null && probe === "unique-violation" && k44b.u === null,
    "Thai refusal w/o P's name · probe unique-violation · rolled back",
    `ok=${g44?.ok} "${short(g44?.reason ?? "", 60)}" probe=${probe} after=${k44b.u ? "LINKED" : "null"}`,
  );

  // X4.5 one account → two employees concurrently
  const x45: string[] = [];
  let x45ok = true;
  for (let round = 0; round < 3; round++) {
    const Z = await mkUser(null, `z${round}`, `QC ผู้ใช้แซด${round} ${stamp}`, "STAFF", {});
    const e1 = await mkEmp(tid, sA.id, `พนง-แข่ง${round}-1 ${stamp}`);
    const e2 = await mkEmp(tid, sA.id, `พนง-แข่ง${round}-2 ${stamp}`);
    const rs = await Promise.all([grant(U.viewer, e1, Z.email), grant(U.viewer, e2, Z.email)]);
    const nOk = rs.filter((r: Any) => r?.ok === true).length;
    const nLinked = await P.hrEmployee.count({ where: { tenantId: tid, linkedUserId: Z.id } });
    x45.push(`r${round}:ok=${nOk},linked=${nLinked}`);
    if (!(nOk === 1 && nLinked === 1)) x45ok = false;
  }
  chk("X4.5", x45ok, "each round ok=1 linked=1", x45.join(" "));

  // S4.6 unlink
  // ORACLE-EDIT H0.7 S4.6 (pre-approved by the controller · Q-C): no new unlink function — revokeStaffAccess (staff/service.ts) clears
  //   linkedUserId + linkApprovedById in its tx and writes hr.employee.link {…, approvedById: null, unlinked: true}; called with its real
  //   signature { tenantId, actorUserId, membershipId } (membership of Y from S4.3's grant) instead of searching for an /unlink/i export
  const unlinkName = typeof staff.revokeStaffAccess === "function" ? "revokeStaffAccess" : undefined;
  let u46 = "∅ revokeStaffAccess (staff/service)";
  const mid46 = String((g43 as Any)?.membershipId ?? "");
  if (unlinkName) {
    try {
      u46 = short(await staff.revokeStaffAccess({ tenantId: tid, actorUserId: U.viewer.id, membershipId: mid46 }), 80);
    } catch (e) {
      u46 = `THROW ${errText(e)}`;
    }
  }
  const k46 = await linkOf(EQ);
  const au46 = (await P.auditLog.findMany({ where: { tenantId: tid, action: "hr.employee.link", targetId: EQ }, select: { after: true } })) as Any[];
  const hit46 = au46.map((a) => (a.after ?? {}) as Any).find((p) => p.unlinked === true && p.employeeId === EQ && p.userId === Y.id && p.approvedById === null);
  chk("S4.6", !!unlinkName && !!mid46 && k43.u === Y.id && k46.u === null && k46.by === null && !!hit46, "linkedUserId null · linkApprovedById null · audit unlinked", `fn=${unlinkName ?? "none"} → ${u46} · after u=${k46.u ? "set" : "null"} by=${k46.by} audit=${hit46 ? "unlinked" : "none"}`);

  const au47 = await P.auditLog.findMany({ where: { tenantId: tid, action: "hr.employee.link" }, select: { after: true, before: true } });
  const hit47 = au47.map((a: Any) => (a.after ?? {}) as Any).find((p: Any) => p.employeeId === EP);
  const j47 = au47.map((a: Any) => JSON.stringify([a.after, a.before])).join(" ");
  chk("S4.7", !!hit47 && hit47.userId === X.id && hit47.approvedById === U.viewer.id && !hasName(j47) && !j47.includes("@"), "{employeeId:P, userId:X, approvedById:viewer} · ids only", `audits=${au47.length} hit=${short(hit47 ?? null, 90)}`);

  const ix = (await P.$queryRawUnsafe(`SELECT indexdef FROM pg_indexes WHERE tablename = 'HrEmployee' AND indexname = 'HrEmployee_tenantId_linkedUserId_key'`)) as Any[];
  const def = String(ix[0]?.indexdef ?? "");
  chk("S4.8", /UNIQUE/i.test(def) && /"tenantId", "linkedUserId"/.test(def) && /WHERE \(?"linkedUserId" IS NOT NULL\)?/i.test(def), "partial unique index", def ? short(def, 140) : "∅ index");

  // X7.1 two accounts → one employee
  const x71: string[] = [];
  let x71ok = true;
  for (let round = 0; round < 3; round++) {
    const W1 = await mkUser(null, `w${round}a`, `QC ผู้ใช้ดับเบิลยู${round}a ${stamp}`, "STAFF", {});
    const W2 = await mkUser(null, `w${round}b`, `QC ผู้ใช้ดับเบิลยู${round}b ${stamp}`, "STAFF", {});
    const e = await mkEmp(tid, sA.id, `พนง-ชิง${round} ${stamp}`);
    const rs = await Promise.all([grant(U.viewer, e, W1.email), grant(U.viewer, e, W2.email)]);
    const nOk = rs.filter((r: Any) => r?.ok === true).length;
    const winner = rs.findIndex((r: Any) => r?.ok === true);
    const k = await linkOf(e);
    const okRound = nOk === 1 && k.u === (winner === 0 ? W1.id : W2.id);
    x71.push(`r${round}:ok=${nOk},match=${okRound}`);
    if (!okRound) x71ok = false;
  }
  chk("X7.1", x71ok, "each round ok=1 · linked to winner", x71.join(" "));

  // X7.2 DB-level bypass race (two connections)
  const x72: string[] = [];
  let x72ok = true;
  for (let round = 0; round < 3; round++) {
    const V = await mkUser(null, `v${round}`, `QC ผู้ใช้วี${round} ${stamp}`, "STAFF", {});
    const e1 = await mkEmp(tid, sA.id, `พนง-ตรง${round}-1 ${stamp}`);
    const e2 = await mkEmp(tid, sA.id, `พนง-ตรง${round}-2 ${stamp}`);
    const lane = (e: string) =>
      P.$transaction(
        async (tx: Any) => {
          await tx.$executeRawUnsafe(`UPDATE "HrEmployee" SET "linkedUserId" = $1 WHERE id = $2`, V.id, e);
          await sleep(400);
        },
        { maxWait: 10_000, timeout: 30_000 },
      ).then(
        () => "commit",
        (err: unknown) => `fail:${(err as Any)?.code ?? ""}`,
      );
    const rs = await Promise.all([lane(e1), lane(e2)]);
    const nLinked = await P.hrEmployee.count({ where: { tenantId: tid, linkedUserId: V.id } });
    x72.push(`r${round}:${rs.join("/")},linked=${nLinked}`);
    if (!(rs.filter((r) => r === "commit").length === 1 && nLinked === 1)) x72ok = false;
  }
  chk("X7.2", x72ok, "each round exactly 1 commit · 1 linked", x72.join(" "));

  // ═══ S6 plan steps ═══
  console.log("── [S6] plan steps ──");
  const ownerM = await P.membership.findFirst({ where: { tenantId: tid, userId: U.owner.id }, select: { role: true, unitAccess: true, permissions: true } });
  const ownerActor = aiActor.aiMemberActor(tid, U.owner.id, ownerM);
  const conv = await P.aiConversation.create({ data: { id: convOwner.newConversationId({ tenantId: tid, actor: ownerActor }), tenantId: tid, title: "qc h0.7" } });
  await hr.requestLeave(ctxA, { employeeId: E.b, actorUserId: U.b.id, type: "PERSONAL", fromDate: "2031-04-06", toDate: "2031-04-06" });
  const l63 = (await leavesOf(E.b)).at(-1)!;
  let created63 = "";
  try {
    await plans.createPlan({ tenantId: tid }, { conversationId: conv.id, title: "qc", steps: [{ kind: "hr_decide_leave", summary: "อนุมัติ", payload: { leaveId: l63.id, decision: "APPROVED" } }] });
    created63 = "∅ created";
  } catch (e) {
    created63 = e instanceof Error ? e.message : String(e);
  }
  const forged = await P.aiPlan.create({
    data: {
      tenantId: tid,
      conversationId: conv.id,
      title: "qc forged",
      hasDestructive: false,
      stepsJson: [{ kind: "hr_decide_leave", summary: "อนุมัติใบลา", payload: { leaveId: l63.id, decision: "APPROVED" }, status: "PENDING" }],
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  const ex63 = await plans.executePlan(mOf(U.owner), { tenantId: tid }, forged.id, { userId: U.owner.id });
  const p63 = await P.aiPlan.findUnique({ where: { id: forged.id }, select: { status: true } });
  const l63b = await P.hrLeave.findUnique({ where: { id: l63.id }, select: { status: true } });
  chk(
    "S6.3",
    created63.includes(T_PLAN_LEAVE) && ex63?.ok === false && ex63?.results?.[0]?.note === T_PLAN_LEAVE && p63?.status === "FAILED" && l63b?.status === "PENDING",
    "createPlan refuses · FAILED · R5.4 text · leave PENDING",
    `create="${short(created63, 50)}" exec=${short(ex63, 90)} plan=${p63?.status} leave=${l63b?.status}`,
  );

  const leaveKind = ["hr_request_leave", "hr_leave_request"].find((k) => proposals.isKnownKind?.(k));
  if (!leaveKind) {
    chk("S6.2", true, "N/A", "N/A — no leave-request proposal kind on this tree (brief §3 S6: 'if a kind exists'); S6.1 static carries R7");
  } else {
    const aM = await P.membership.findFirst({ where: { tenantId: tid, userId: U.a.id }, select: { role: true, unitAccess: true, permissions: true } });
    const aActor = aiActor.aiMemberActor(tid, U.a.id, aM);
    const convA = await P.aiConversation.create({ data: { id: convOwner.newConversationId({ tenantId: tid, actor: aActor }), tenantId: tid, title: "qc h0.7 a" } });
    const beforeA = await leavesOf(E.a);
    const pl = await P.aiPlan.create({
      data: {
        tenantId: tid,
        conversationId: convA.id,
        title: "qc leave",
        hasDestructive: false,
        stepsJson: [{ kind: leaveKind, summary: "ขอลา", payload: { type: "PERSONAL", fromDate: "2031-04-13", toDate: "2031-04-13" }, status: "PENDING" }],
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    const ex = await plans.executePlan(mOf(U.a), { tenantId: tid }, pl.id, { userId: U.a.id });
    const nl = (await leavesOf(E.a)).find((l) => !beforeA.some((x) => x.id === l.id));
    const q = nl ? await reqOf(tid, nl.id) : null;
    const f = nl ? await rawCol("HrLeave", "filedById", nl.id) : "∅row";
    chk("S6.2", !!nl && q?.requestedById === U.a.id && f === null, "A's leave · requestedById=A · filedById null", `kind=${leaveKind} exec=${short(ex, 70)} leave=${nl ? 1 : 0} req=${q?.requestedById === U.a.id ? "A" : q?.requestedById ?? "∅"} filed=${f}`);
  }

  // ═══ X8 privacy ═══
  console.log("── [X8] privacy ──");
  const auAll = await P.auditLog.findMany({ where: { tenantId: tid, action: { in: ["hr.leave.owner_auto", "hr.leave.cancel", "hr.employee.link"] } }, select: { action: true, before: true, after: true } });
  const kinds = new Set(auAll.map((a: Any) => a.action));
  const j81 = auAll.map((a: Any) => JSON.stringify([a.before, a.after])).join(" ");
  chk("X8.1", kinds.size === 3 && !hasName(j81) && !j81.includes("@"), "3 audit kinds · no names/e-mails", `kinds=${[...kinds].join(",") || "none"} names=${hasName(j81)}`);
  const bad82 = Object.entries(refusals).filter(([, t]) => !isThai(t) || techLeak(t) || hasName(t));
  chk("X8.2", Object.keys(refusals).length === 5 && bad82.length === 0, "5 refusals Thai · no names · no internals", bad82.length ? bad82.map(([k, t]) => `${k}="${short(t, 40)}"`).join(" ") : `n=${Object.keys(refusals).length}`);
  const vA = { ...mOf(U.a), userId: U.a.id };
  const vM = { ...mOf(U.manager), userId: U.manager.id };
  const itA = await privacy.leaveItemsForViewer(ctxA, vA);
  const itM = await privacy.leaveItemsForViewer(ctxA, vM);
  const baseKeys = ["employeeName", "fromDate", "id", "status", "toDate", "type"].join(",");
  const rowsA = [...itA.pending, ...itA.history] as Any[];
  const keysOkA = rowsA.every((r) => Object.keys(r).sort().join(",") === baseKeys);
  const leakA = rowsA.some((r) => JSON.stringify(r).includes(U.manager.name) || JSON.stringify(r).includes(U.hrKey.name));
  const rowM = ([...itM.pending, ...itM.history] as Any[]).find((r) => r.id === l13?.id);
  const jm = rowM ? JSON.stringify(rowM) : "";
  chk("X8.3", rowsA.length > 0 && keysOkA && !leakA && jm.includes("ยื่นโดย") && jm.includes(U.manager.name), "staff: base keys · no filer · manager: ยื่นโดย <name>", `staffRows=${rowsA.length} keysOk=${keysOkA} leak=${leakA} mgrRow=${short(rowM ?? null, 110)}`);

  // ═══ X9 cancel surface viewer matrix ═══
  console.log("── [X9] cancelLeaveAction viewer matrix ──");
  await hr.requestLeave(ctxA, { employeeId: E.a, actorUserId: U.a.id, type: "PERSONAL", fromDate: "2031-08-03", toDate: "2031-08-03" });
  const l9 = (await leavesOf(E.a)).at(-1)!;
  const q9 = await reqOf(tid, l9.id);
  const st9 = async () => ({ l: (await P.hrLeave.findUnique({ where: { id: l9.id }, select: { status: true } }))?.status, q: q9 ? (await P.approvalRequest.findUnique({ where: { id: q9.id }, select: { status: true } }))?.status : "∅" });
  const hasFn = typeof act.cancelLeaveAction === "function";
  const viewers: [string, Who, string][] = [
    ["X9.1", U.owner, sA.id],
    ["X9.2", U.viewer, sA.id],
    ["X9.3", U.manager, sA.id],
    ["X9.4", U.hrKey, sA.id],
    ["X9.5", U.member, sA.id],
    ["X9.6", U.other, sA.id],
  ];
  for (const [id, w, sid] of viewers) {
    const r = await callAction(w, act.cancelLeaveAction, sid, fd({ systemId: sid, leaveId: l9.id }), `/app/sys/${sid}/hr/leave`);
    const s = await st9();
    chk(id, hasFn && s.l === "PENDING" && (s.q === "PENDING" || s.q === "∅"), "refused · PENDING", `${hasFn ? "" : "∅ cancelLeaveAction · "}leave=${s.l} req=${s.q} "${short(r.text, 50)}"`);
  }
  const r97 = await callAction(U.a, act.cancelLeaveAction, sA.id, fd({ systemId: sA.id, leaveId: l9.id }), pathA);
  const s97 = await st9();
  chk("X9.7", hasFn && s97.l === "CANCELLED" && s97.q === "CANCELLED", "CANCELLED / CANCELLED", `${hasFn ? "" : "∅ cancelLeaveAction · "}leave=${s97.l} req=${s97.q} "${short(r97.text, 50)}"`);

  // ═══ S5 data fix (own tenant -fix + other tenant t2) ═══
  console.log("── [S5/X6] data fix script ──");
  const t3 = await newTenant("-fix", "QC HR H0.7 แก้ผู้ยื่นย้อนหลัง");
  const s3 = await sys.createSystem(t3, "HR", "ทีมแก้ข้อมูล");
  ids.push(s3.id);
  const pol3 = await approval.createPolicy({ tenantId: t3 }, { name: "QC สายลา fix", entityType: "HrLeave", systemId: s3.id, steps: [{ order: 1, approverRole: "OWNER" }] });
  const pol2 = await approval.createPolicy({ tenantId: t2 }, { name: "QC สายลา other", entityType: "HrLeave", systemId: s2.id, steps: [{ order: 1, approverRole: "OWNER" }] });
  const F1 = await mkUser(null, "f1", `QC ผู้ใช้แก้หนึ่ง ${stamp}`, "STAFF", {});
  const F2 = await mkUser(null, "f2", `QC ผู้ใช้แก้สอง ${stamp}`, "STAFF", {});
  const F3 = await mkUser(null, "f3", `QC ผู้ใช้ร้านอื่น ${stamp}`, "STAFF", {});
  const e5a = await mkEmp(t3, s3.id, `พนง-แก้-เอ ${stamp}`, F1.id);
  const e5b = await mkEmp(t3, s3.id, `พนง-แก้-บี ${stamp}`, F2.id);
  const e5c = await mkEmp(t3, s3.id, `พนง-แก้-ซี ${stamp}`);
  const e5o = await mkEmp(t2, s2.id, `พนง-แก้-ร้านอื่น ${stamp}`, F3.id);
  const legacy = async (tenantId: string, systemId: string, policyId: string, employeeId: string, day: string): Promise<string> => {
    const l = await P.hrLeave.create({ data: { tenantId, systemId, employeeId, type: "PERSONAL", fromDate: new Date(day), toDate: new Date(day) } });
    const r = await P.approvalRequest.create({ data: { tenantId, policyId, entityType: "HrLeave", entityId: l.id, systemId, requestedById: employeeId, idempotencyKey: `approval-HrLeave-${l.id}` } });
    ids.push(r.id);
    return r.id as string;
  };
  const ra = await legacy(t3, s3.id, pol3.id, e5a, "2031-09-01");
  const rb = await legacy(t3, s3.id, pol3.id, e5b, "2031-09-02");
  const rc = await legacy(t3, s3.id, pol3.id, e5c, "2031-09-03");
  const ro = await legacy(t2, s2.id, pol2.id, e5o, "2031-09-04");
  const snap = async (rid: string[]) => Object.fromEntries(((await P.approvalRequest.findMany({ where: { id: { in: rid } }, select: { id: true, requestedById: true } })) as Any[]).map((r) => [r.id, r.requestedById]));
  const S0 = await snap([ra, rb, rc, ro]);
  const outs: string[] = [];
  const ran = existsSync(join(ROOT, FIX_SCRIPT));

  const d1 = await runFix(["--tenant", t3]);
  outs.push(d1.out);
  const S1 = await snap([ra, rb, rc, ro]);
  const n1 = ints(d1.out);
  chk("S5.1", ran && d1.code === 0 && JSON.stringify(S1) === JSON.stringify(S0) && n1.includes(2) && n1.includes(1) && (d1.out.includes(rc) || d1.out.includes(e5c)), "exit 0 · unchanged · 2 / 1 · unlinked id listed", `code=${d1.code} unchanged=${JSON.stringify(S1) === JSON.stringify(S0)} ints=${n1.slice(0, 8).join(",")} listed=${d1.out.includes(rc) || d1.out.includes(e5c)} · ${short(d1.out.trim().split("\n").slice(-2).join(" | "), 100)}`);

  const a1 = await runFix(["--tenant", t3, "--apply"]);
  outs.push(a1.out);
  const S2 = await snap([ra, rb, rc, ro]);
  chk("S5.2", ran && a1.code === 0 && S2[ra] === F1.id && S2[rb] === F2.id && S2[rc] === e5c && (a1.out.includes(rc) || a1.out.includes(e5c)), "a→F1 · b→F2 · c untouched + listed", `code=${a1.code} a=${S2[ra] === F1.id ? "F1" : "unchanged"} b=${S2[rb] === F2.id ? "F2" : "unchanged"} c=${S2[rc] === e5c ? "untouched" : "CHANGED"} listed=${a1.out.includes(rc) || a1.out.includes(e5c)}`);

  const a2 = await runFix(["--tenant", t3, "--apply"]);
  outs.push(a2.out);
  const S3s = await snap([ra, rb, rc, ro]);
  chk("S5.3", ran && a2.code === 0 && JSON.stringify(S3s) === JSON.stringify(S2) && ints(a2.out).includes(0), "exit 0 · identical · reports 0", `code=${a2.code} identical=${JSON.stringify(S3s) === JSON.stringify(S2)} ints=${ints(a2.out).slice(0, 8).join(",")}`);
  chk("S5.4", ran && a1.code === 0 && S3s[ro] === e5o, "other tenant row = employee id still", `ran=${ran} code=${a1.code} other=${S3s[ro] === e5o ? "untouched" : "CHANGED"}`);

  const d2 = await runFix(["--tenant", t3]);
  outs.push(d2.out);
  const S4s = await snap([ra, rb, rc, ro]);
  const n2 = ints(d2.out);
  chk("X6.1", ran && d2.code === 0 && JSON.stringify(S4s) === JSON.stringify(S3s) && n2.includes(0) && n2.includes(1), "0 fixable · 1 unlinked · no change", `code=${d2.code} ints=${n2.slice(0, 8).join(",")} identical=${JSON.stringify(S4s) === JSON.stringify(S3s)}`);

  const rd1 = await legacy(t3, s3.id, pol3.id, e5a, "2031-09-08");
  const rd2 = await legacy(t3, s3.id, pol3.id, e5b, "2031-09-09");
  const par = await Promise.all([runFix(["--tenant", t3, "--apply"]), runFix(["--tenant", t3, "--apply"])]);
  par.forEach((p) => outs.push(p.out));
  const S5s = await snap([rd1, rd2, rc, ro]);
  chk("X6.2", ran && par.every((p) => p.code === 0) && S5s[rd1] === F1.id && S5s[rd2] === F2.id && S5s[rc] === e5c && S5s[ro] === e5o, "both exit 0 · rows fixed · others untouched", `codes=${par.map((p) => p.code).join(",")} d1=${S5s[rd1] === F1.id} d2=${S5s[rd2] === F2.id}`);

  const allOut = outs.join("\n");
  const leakTenant = allOut.includes(t2) || allOut.includes(ro) || allOut.includes(tid);
  chk("S5.5", ran && !hasName(allOut) && !leakTenant, "no names/e-mails/other tenant ids", `ran=${ran} names=${hasName(allOut)} otherTenant=${leakTenant}`);
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
  for (let pass = 0; pass < 2; pass++) {
    for (const tid of tenants) {
      const emps = (await P.hrEmployee.findMany({ where: { tenantId: tid }, select: { id: true } }).catch(() => [])) as Any[];
      const all = [...new Set([tid, ...ids, ...emps.map((e) => e.id as string)])];
      for (let i = 0; i < all.length; i += 50) {
        const part = all.slice(i, i + 50);
        await d("chatRateBucket", () => P.chatRateBucket.deleteMany({ where: { OR: part.map((x) => ({ key: { contains: x } })) } }));
      }
      for (const m of [
        "approvalDecision", "approvalRequest", "approvalStep", "approvalPolicy",
        "hrPayrollItem", "hrPayrollRun", "hrPayAdjustment", "hrSalaryProfile",
        "hrEmployeeDoc", "hrAttendance", "hrLeave", "hrWorkSchedule", "hrEmployee",
        "outboxEvent", "appNotification", "webhookDelivery", "auditLog", "aiProposal", "aiPlan", "aiMessage", "aiConversation",
        "party", "membership", "appSystemUnit", "appSystem",
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

// ── S7.3 needs only the DB catalogue (read after cleanup so it never depends on fixtures) ──
try {
  const c1 = await colExists("HrEmployee", "linkApprovedById");
  const c2 = await colExists("HrLeave", "filedById");
  const ty = (await P.$queryRawUnsafe(
    `SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE (table_name, column_name) IN (('HrEmployee','linkApprovedById'),('HrLeave','filedById'))`,
  )) as Any[];
  const okTy = ty.length === 2 && ty.every((r) => r.data_type === "text" && r.is_nullable === "YES");
  chk("S7.3", c1 && c2 && okTy, "both text NULL", `linkApprovedById=${c1} filedById=${c2} ${short(ty.map((r) => `${r.column_name}:${r.data_type}/${r.is_nullable}`), 90)}`);
} catch (e) {
  chk("S7.3", false, "both text NULL", `THROW ${errText(e)}`);
}

const residue: string[] = [];
for (const tid of tenants) {
  for (const m of ["hrLeave", "hrEmployee", "hrSalaryProfile", "approvalRequest", "approvalPolicy", "auditLog", "outboxEvent", "aiPlan", "aiConversation", "membership", "appSystem"]) {
    const n = await P[m].count({ where: { tenantId: tid } }).catch(() => -1);
    if (n !== 0) residue.push(`${m}=${n}`);
  }
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
for (const [id] of CHECKS) if (!results.has(id)) chk(id.replace(/^H0\.7-/, ""), false, "checked", crashed ? `not reached (harness crashed: ${crashed.slice(0, 80)})` : "not reached");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
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
  })}`,
);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);
