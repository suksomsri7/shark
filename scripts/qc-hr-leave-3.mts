// QC — HR V2 · fix ticket HR-LEAVE-3 (H5.3 hunt F1–F4) · brief ledger/hr-briefs/hr-brief-LEAVE-3.md (+ CONTROLLER RULINGS) · notes ledger/wo-notes/hr-LEAVE-3-oracle.md
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit. Tenant qc-hr-leave3-* · 2031 dates · --list
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-leave-3.mts
// Statics base = QC_LEAVE3_BASE || merge-base(HEAD, session/hr) · registry re-based to ed06b0514 (fix round 1: all GREEN; was 28 RED on 0af86c805) · part b = qc-hr-leave-3b.mts
import { execFileSync } from "node:child_process";
import { type Any, type Base, ROOT, rd, errText, canon, sha, stripComments, PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, diffHunks, makeRegistry, failedKeys, srcFiles } from "./qc-hr-lib.mjs";
import { setupLeave3, underLock, callAct, shiftOf, entryOf, bk, dist } from "./qc-hr-leave-3-lib.mjs";
import { bodyOf } from "./qc-hr-priv-2-lib.mjs";

const SUITE = "qc-hr-leave-3";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const N = Number(process.env.QC_LEAVE3_N ?? 20);
const H = "src/lib/modules/hr/", AP = "src/lib/modules/approval/";
const T = {
 two: "คุณตัดสินขั้นก่อนหน้าของคำขอนี้แล้ว — ขั้นนี้ต้องให้ผู้อนุมัติคนอื่นตัดสิน",
 lost: "ไม่มีสิทธิ์ตัดสินขั้นนี้ หรือถูกตัดสินไปแล้ว",
 bad: "การตัดสินไม่ถูกต้อง",
 edit: (n: number | string) => `แก้ขั้นอนุมัติของสายนี้ไม่ได้ เพราะมีคำขอรอตัดสินอยู่ ${n} รายการ — ตัดสินหรือยกเลิกคำขอเหล่านั้นก่อน หรือปิดสายนี้แล้วสร้างสายใหม่`,
 gate: "ใบลานี้เคยผ่านขั้นอนุมัติบางขั้นแล้วก่อนถูกถอนจากสาย — ให้เจ้าของกิจการเป็นผู้ตัดสิน",
 paid: "เดือนนี้อนุมัติเงินเดือนแล้ว — แก้เวลาย้อนหลังไม่ได้",
};
const SEV: Record<string, "CRITICAL" | "MAJOR" | "MINOR"> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS = `
ST1|static|C|G|payroll-rules.ts sha frozen
ST2|static|C|G|changed ⊆ allowed (+ older qc-*.mts with every hunk ORACLE-EDIT…LEAVE-3) · frozen unchanged
ST3|static|M|G|src hunks marked HR LEAVE-3 · no bare removal
ST4|static|M|G|no settings write in changed src
ST5|static|M|G|fixed texts: TWO_PERSON · R3 count template · R4 OWNER gate
R1.1|R1|C|G|AM+PM paid no-show ⇒ LEAVE · fraction 1.0
R1.2|R1|C|G|work day 480/0/0 ld1.0 []
R1.3|R1|C|G|sync no wait · createPayrollRunV2 ok
R1.4|R1|C|G|paid+paid: no deduction line · gross 3,000,000
R1.5|R1|C|G|AM unpaid+PM paid ⇒ 240/240/0 · UNPAID −50,000 only
R1.6|R1|M|G|mirror (PM unpaid)
R1.7|R1|M|G|two shifts 09–13/13–17 ⇒ both LEAVE · 480
R1.8|R1|M|G|base-shape stored row ⇒ STALE ⇒ recompute LEAVE ⇒ 480
R1.9|R1|M|G|AM approved + PM pending ⇒ PENDING_LEAVE
R1.10|R1|M|G|PM revoked ⇒ ABSENT 240/0/240
R1.11|R1|M|G|AM half + PM worked ⇒ 240 + work 240
R1.12|R1|M|G|full day · single AM no-show · 4 h unpaid · run ok
R1.13|R1|M|G|(Q7) legacy AM+AM ⇒ LEAVE_MISMATCH
R1.14|R1|M|G|MONEY-2 paid-month gate refuses
R2.1|R2|C|G|OWNER replay expectedStep 1 ×2 ⇒ lost · step 2
R2.2|R2|C|G|same MANAGER both steps ⇒ TWO_PERSON · nothing written
R2.3|R2|C|G|bulkDecide([id,id]) ⇒ done 1 · step 2 · 1 decision
R2.4|R2|C|G|AI approval_decide: TWO_PERSON · stale expectedStep refused
R2.5|R2|C|G|OWNER both steps (no step) ⇒ APPROVED · 1 approval.owner_override {step 2, previousDeciderStep 1} · effect once
R2.6|R2|C|G|stale step: direct · bulkDecide map · bulk action ⇒ lost · decideAction bad step ⇒ text
R2.15|R2|C|G|OWNER double click via decideAction / bulkDecideAction ⇒ one step
R2.7|R2|C|G|held row lock: 2 OWNERs ⇒ 1 ok · same MANAGER ×2 ⇒ 1 step
R2.8|R2|C|G|single-step chain ± step: literal results/rows
R2.9|R2|M|G|two managers complete · effect once
R2.10|R2|M|G|SELF_APPROVAL literal (PO + HrLeave)
R2.11|R2|M|G|[static] callers pass a step · no other caller
R2.12|R2|M|G|[static] page step · hidden step:<id>
R2.13|R2|C|G|same-user double click seq + parallel ×N ⇒ ≤ 1 step
R2.14|R2|m|G|PurchaseOrder M→O two users · no override audit
R3.1|R3|C|G|stranding edit (step 2 → [1]) ⇒ text "1" · unchanged · decidable
R3.2|R3|M|G|non-stranding edits with pending (rename · role of current step · add step) ⇒ allowed · decidable
R3.3|R3|M|G|no pending ⇒ step change allowed
R3.4|R3|m|G|same steps reordered ⇒ allowed
R3.5|R3|m|G|disabled chain still decidable
R3.6|R3|M|G|count = this policy only ⇒ "2"
R3.7|R3|M|G|renumber [1,2]→[1,3] at step 2 ⇒ refused
R4.1|R4|C|G|withdraw HrLeave ⇒ both CANCELLED · audit 1 · 0 events · released
R4.2|R4|C|G|then decideLeaveAs refused
R4.3|R4|C|G|(Q5) legacy cancelled+decided ⇒ MANAGER text · OWNER ok
R4.4|R4|M|G|CH-4: cancelled, no decision ⇒ direct works
R4.5|R4|m|G|PO withdrawal ⇒ CANCELLED
R4.6|R4|M|G|not-mine withdrawal ⇒ nothing
R4.7|R4|M|G|cancelLeave ∥ approve (A7b) consistent
R4.8|R4|M|G|decided request withdrawal ⇒ nothing
R4.9|R4|C|G|(Q6) withdraw correction ⇒ CANCELLED · direct refused
R4.10|R4|C|G|(Q6) withdraw swap ⇒ CANCELLED · direct refused
R4.11|R4|C|G|action withdrawal ∥ approve ⇒ consistent
Z1|house|C|G|no residue · own law rows
`.trim().split("\n").map((l) => {
 const [id, g, sv, b, t] = l.split("|");
 return [`LEAVE-3-${id}`, g, SEV[sv], (b === "R" ? "RED" : "GREEN") as Base, t] as const;
});
const { chk, printList, finish } = makeRegistry(SUITE, "LEAVE-3-", CHECKS);
if (ARGV.includes("--list")) { printList(); process.exit(0); }
const ck = (id: string, r: Record<string, unknown>, exp: string, extra = "") => chk(id, Object.values(r).every(Boolean), exp, `${failedKeys(r)}${extra ? ` ${extra}` : ""}`);
const git = (a: string[]) => { try { return execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }).trim(); } catch { return ""; } };
const BASE = process.env.QC_LEAVE3_BASE || git(["merge-base", "HEAD", "session/hr"]) || "2ab0c6b62ba4bac7ce8981c320e81d199e904502";
const code = (p: string) => stripComments(rd(p));
const at = (src: string, from: number) => { let d = 0; for (let k = from; k < src.length; k++) { if (src[k] === "(") d++; else if (src[k] === ")" && --d === 0) return src.slice(from, k + 1); } return src.slice(from); };
const callsOf = (src: string, re: RegExp) => [...src.matchAll(re)].map((m) => at(src, m.index! + m[0].length - 1));

// ═════════════════════════ statics ═════════════════════════
const ALLOWED = [`${H}judge.ts`, `${H}work-entries-rules.ts`, `${H}service.ts`, `${H}index.ts`, `${AP}service.ts`, `${AP}actions.ts`, "src/lib/approval-effects.ts", "src/app/app/approvals/page.tsx", "src/app/app/approvals/BulkApprovals.tsx", "src/lib/ai/tools.ts", "src/lib/ai/proposals.ts", `${H}ot.ts`, `${H}self.ts`];
const OWN = ["scripts/qc-hr-leave-3.mts", "scripts/qc-hr-leave-3-lib.mts", "scripts/qc-hr-leave-3b.mts"];
function runStatic(): void {
 ck("ST1", { sha: sha(rd(PAYROLL_RULES_FILE)) === PAYROLL_RULES_SHA }, "payroll-rules.ts sha");
 const changed = [...new Set([...git(["diff", "--name-only", BASE, "--"]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard"]).split("\n")].filter(Boolean))].filter((f) => !/^(ledger|scratchpad)\//.test(f));
 const inBase = (f: string) => git(["cat-file", "-t", `${BASE}:${f}`]) === "blob";
 // ORACLE-EDIT (HR PRIV-3 · controller merge): explicit allowlist — the later ticket PRIV-3 (merged after LEAVE-3/PREPROD-1): exactly these files, each hunk adds "HR PRIV-3" on an ADDED line · its two controller-authorised JSON row files by name · unmarked still fails ◂
 const P3_FILES: string[] = ["scripts/qc-hr-h3.6.mts", "src/lib/modules/hr/payroll-opening-actions.ts", "src/lib/modules/hr/work-entries-actions.ts", "src/lib/modules/hr/stock-charge-actions.ts", "src/lib/modules/hr/attendance-pay-actions.ts", "src/lib/modules/hr/payslip-actions.ts", "src/lib/modules/hr/bank-files/actions.ts", "src/lib/modules/hr/filings/actions.ts", "scripts/qc-hr-leave-3.mts", "scripts/qc-hr-preprod-1.mts", "prisma/migrations/20270112000000_hr_tenant_scoped_unique_keys/migration.sql", "prisma/schema/payroll.prisma", "scripts/fitness-hr.mts", "scripts/qc-hr-h0.6.mts", "scripts/qc-hr-h1.3.mts", "scripts/qc-hr-h2.10.mts", "scripts/qc-hr-h3.9.mts", "scripts/qc-hr-h4.3-lib.mts", "scripts/qc-hr-priv-2.mts", "scripts/qc-hr-priv-3-lib.mts", "scripts/qc-hr-priv-3.mts", "scripts/qc-hr-priv-3b.mts", "scripts/visual-hr.mts", "src/app/app/sys/[id]/hr/employees/page.tsx", "src/app/app/sys/[id]/hr/leave/page.tsx", "src/app/app/sys/[id]/hr/payroll/page.tsx", "src/lib/modules/hr/actions.ts", "src/lib/modules/hr/hr-target.ts", "src/lib/modules/hr/nav.ts", "src/lib/modules/hr/ot-actions.ts", "src/lib/modules/hr/ot.ts", "src/lib/modules/hr/payroll-actions.ts", "src/lib/modules/hr/privacy.ts", "src/lib/modules/hr/service.ts", "src/lib/modules/hr/swap-actions.ts", "src/lib/modules/hr/swap.ts", "src/lib/modules/hr/ui.tsx"]; // ORACLE-EDIT (HR PRIV-3 · controller merge) ◂
 const P3_DATA = ["scripts/hr-ui-inventory.json", "scripts/walk-hr-matrix.json"]; // ORACLE-EDIT (HR PRIV-3 · controller merge): JSON rows (no comment syntax) — content judged by fitness F16.8 + the controller walk ◂
 const p3Ok = (f: string) => P3_DATA.includes(f) || (P3_FILES.includes(f) && (diffHunks(BASE, f) ?? []).length > 0 && (diffHunks(BASE, f) ?? []).every((h) => h.added.some((l) => l.includes("HR PRIV-3")))); // ORACLE-EDIT (HR PRIV-3 · controller merge) ◂
 {
  const markedOracle = (f: string) => {
   const hs = diffHunks(BASE, f) ?? [];
   return hs.length > 0 && hs.every((h) => h.added.length > 0 && h.added.some((l) => /ORACLE-EDIT[^\n]*LEAVE-3/.test(l)));
  };
  const bad = changed.filter((f) => !(ALLOWED.includes(f) || OWN.includes(f) || (/^scripts\/qc-[^/]+\.mts$/.test(f) && inBase(f) && markedOracle(f)) || p3Ok(f))); // ORACLE-EDIT (HR PRIV-3 · controller merge): + p3Ok ◂
  const frozen = [...srcFiles("src/lib/modules/hr").filter((f) => /\/(judge-rules|work-entries|leave|leave-rules|rules|lifecycle|attendance-pay[^/]*|payroll[^/]*|correction[^/]*|swap[^/]*)\.tsx?$/.test(f)), "prisma", "src/lib/core"];
  const fz = git(["diff", "--name-only", BASE, "--", ...frozen]).split("\n").filter((f) => f && !p3Ok(f)).join("\n"); // ORACLE-EDIT (HR PRIV-3 · controller merge): + p3Ok ◂
  ck("ST2", { allowed: !!BASE && !bad.length, frozen: fz === "" }, "only allowed files", `base=${BASE.slice(0, 9)} outside=${bad.slice(0, 6).join(",") || "none"} frozen=${fz.replace(/\n/g, ",").slice(0, 120) || "none"}`);
 }
 {
  const bad: string[] = [];
  for (const f of changed.filter((x) => x.startsWith("src/") && !p3Ok(x))) { // ORACLE-EDIT (HR PRIV-3 · controller merge) ST3: + p3Ok ◂
   const hs = diffHunks(BASE, f);
   if (!hs) { bad.push(`${f}:git`); continue; }
   hs.forEach((h, i) => {
    if (!h.added.length) bad.push(`${f.split("/").pop()}#${i + 1}:bare-removal`);
    else if (!h.added.some((l) => l.includes("HR LEAVE-3"))) bad.push(`${f.split("/").pop()}#${i + 1}`);
   });
  }
  ck("ST3", { marked: !bad.length }, "every hunk marked", bad.slice(0, 8).join(" ") || "ok");
  const sw: string[] = [];
  for (const f of changed.filter((x) => x.startsWith("src/"))) for (const h of diffHunks(BASE, f) ?? []) for (const l of h.added) if (/appSystem\s*\.\s*(update|updateMany|upsert)\b|UPDATE\s+"AppSystem"|jsonb_set\s*\(\s*(COALESCE\s*\()?\s*"?settings/.test(l)) sw.push(`${f.split("/").pop()}: ${l.trim().slice(0, 60)}`);
  ck("ST4", { none: !sw.length }, "no settings writes", sw.slice(0, 3).join(" | ") || "none");
 }
 {
  const ap = rd(`${AP}service.ts`), sv = rd(`${H}service.ts`);
  const tpl = T.edit("\u0000").split("\u0000");
  const r = { two: ap.includes(T.two), edit: new RegExp(`${tpl[0]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\$\\{[^}]+\\}${tpl[1]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(ap), gate: sv.includes(T.gate) };
  ck("ST5", r, "texts present");
 }
}
runStatic();
if (ARGV.includes("--static")) process.exit(0); // statics only (no DB)

// ═════════════════════════ DB ═════════════════════════
const S = await setupLeave3(SUITE);
const { P, tag, TT, U, V, c, rows, safe, sys, fx } = S;
const ctxA = { tenantId: TT };
const own = V.owner;
let crashed = "";
const missing: string[] = [];
const AP_ = (await import("@/lib/modules/approval/service")) as Any;
const ACT = (await import("@/lib/modules/approval/actions").catch((e: unknown) => ({ __err: errText(e) }))) as Any;
const EFF = (await import("@/lib/approval-effects")) as Any;
const SV = (await import("@/lib/modules/hr/service")) as Any;
const LV = (await import("@/lib/modules/hr/leave")) as Any;
const JG = (await import("@/lib/modules/hr/judge")) as Any;
const WE = (await import("@/lib/modules/hr/work-entries")) as Any;
const ATP = (await import("@/lib/modules/hr/attendance-pay")) as Any;
const PAY = (await import("@/lib/modules/hr/payroll")) as Any;
const CORR = (await import("@/lib/modules/hr/correction")) as Any;
const SWAP = (await import("@/lib/modules/hr/swap")) as Any;
const PROP = (await import("@/lib/ai/proposals").catch((e: unknown) => ({ __err: errText(e) }))) as Any;
for (const [k, m] of Object.entries({ actions: ACT, proposals: PROP })) if (m.__err) missing.push(`${k}: ${m.__err}`);
const n1 = async (sql: string, ...a: unknown[]) => Number((await rows(sql, ...a))[0]?.n ?? -1);

// ── chain helpers (h53l p1) ──
let dayN = 0;
const nextDay = () => new Date(Date.UTC(2031, 0, 6) + dayN++ * 86_400_000).toISOString().slice(0, 10);
type W = { s: string; pol: string; e: string; apId: string };
const world = async (name: string, steps: Any[], entityType = "HrLeave"): Promise<W> => {
 const s = await sys(name);
 const pol = (await P.hrLeavePolicy.create({ data: { tenantId: TT, systemId: s, category: "VACATION", name: `พักร้อน ${tag}`, quotaDays: 300, paid: true } })).id as string;
 const e = await fx.mkEmp(TT, s, `พนง ${name} ${tag}`, { startDate: "2030-01-01", unitId: S.u1 });
 const ap = await AP_.createPolicy(ctxA, { name: `สาย ${name}`, entityType, systemId: s, steps });
 return { s, pol, e, apId: ap.id as string };
};
type F = { leaveId: string; reqId: string; day: string };
const file = async (w: W, actor = U.staff.id, e = w.e): Promise<F> => {
 const d = nextDay();
 const r = await SV.requestLeave(c(w.s), { employeeId: e, type: "VACATION", policyId: w.pol, fromDate: d, toDate: d, actorUserId: actor });
 return { leaveId: r.id as string, reqId: (await rows(`SELECT id FROM "ApprovalRequest" WHERE "entityId" = $1`, r.id))[0]?.id as string, day: d };
};
const reqRow = async (id: string) => (await rows(`SELECT status::text AS s, "currentStepOrder" AS o FROM "ApprovalRequest" WHERE id = $1`, id))[0] ?? {};
const decisions = (id: string) => rows(`SELECT "stepOrder" AS o, "decidedById" AS by, decision::text AS d FROM "ApprovalDecision" WHERE "requestId" = $1 ORDER BY "createdAt", id`, id);
const leaveSt = async (id: string) => (await rows(`SELECT status::text AS s FROM "HrLeave" WHERE id = $1`, id))[0]?.s;
const useN = (id: string) => n1(`SELECT count(*)::int AS n FROM "HrLeaveBalanceTxn" WHERE "leaveId" = $1 AND kind::text = 'USE'`, id);
const evN = (type: string, id: string) => n1(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = $2 AND (payload->>'leaveId' = $3 OR payload->>'requestId' = $3)`, TT, type, id);
const audN = (action: string, id: string) => n1(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = $1 AND action = $2 AND ("targetId" = $3 OR after->>'requestId' = $3 OR before->>'requestId' = $3)`, TT, action, id);
const overrideRows = (id: string) => rows(`SELECT after, "targetId" AS t FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'approval.owner_override' AND "targetId" = $2`, TT, id);
const decide = (who: keyof typeof V, reqId: string, decision: "APPROVED" | "REJECTED" = "APPROVED", expectedStep?: number) =>
 safe(() => AP_.decide(V[who], ctxA, reqId, { decision, ...(expectedStep === undefined ? {} : { expectedStep }) }));
const deliver = async (f: F, entityType = "HrLeave") => {
 const r = await reqRow(f.reqId);
 if (r.s !== "APPROVED" && r.s !== "REJECTED") return;
 await EFF.applyApprovalEffect({ tenantId: TT, type: r.s === "APPROVED" ? "approval.request.approved" : "approval.request.rejected", payload: { requestId: f.reqId, entityType, entityId: f.leaveId } });
};
const res3 = (r: Any) => canon({ ok: r?.ok, status: r?.status, note: r?.note ?? null, ...(r?.code ? { code: r.code } : {}), ...(r?.reason ? { reason: r.reason } : {}) });
const LOST = canon({ ok: false, status: "PENDING", note: null });
const nothing = async (f: F, step: number, nDec: number) => {
 const r = await reqRow(f.reqId);
 return r.s === "PENDING" && r.o === step && (await decisions(f.reqId)).length === nDec && (await evN("approval.request.approved", f.reqId)) === 0 && (await leaveSt(f.leaveId)) === "PENDING";
};
const MO = [{ order: 1, approverRole: "MANAGER" }, { order: 2, approverRole: "OWNER" }];
const MM = [{ order: 1, approverRole: "MANAGER" }, { order: 2, approverRole: "MANAGER" }];
const act = (name: string) => ACT?.[name];

try {
 // ═════════════════════════ R1 (F1) judge reads every approved leave of the day ═════════════════════════
 await (async () => {
  const NOW = bk("2031-09-05");
  const mkSys = async (name: string) => {
   const s = await sys(name, true);
   const sh = await shiftOf(P, TT, s, "เช้า", 540, 1020), shA = await shiftOf(P, TT, s, "ครึ่งแรก", 540, 780), shB = await shiftOf(P, TT, s, "ครึ่งหลัง", 780, 1020);
   const polP = (await P.hrLeavePolicy.create({ data: { tenantId: TT, systemId: s, category: "SICK", name: `ป่วย ${tag}`, paid: true, quotaDays: 30, allowHalfDay: true, allowHours: true } })).id as string;
   const polU = (await P.hrLeavePolicy.create({ data: { tenantId: TT, systemId: s, category: "PERSONAL", name: `กิจไม่รับค่าจ้าง ${tag}`, paid: false, quotaDays: 30, allowHalfDay: true, allowHours: true } })).id as string;
   await ATP.saveAttendancePayPolicy(c(s), own, { enabled: true });
   const emp = async (code: string) => {
    const e = await fx.mkEmp(TT, s, `พนง ${code} ${tag}`, { startDate: "2030-01-01", unitId: S.u1, code });
    await P.hrSalaryProfile.create({ data: { tenantId: TT, systemId: s, employeeId: e, baseSalarySatang: 3_000_000, ssoEligible: true, personalDeductionJson: { spouse: false, children: 0 } } });
    return e;
   };
   const roster = async (e: string, day: string, io: [string, string] | null, shift = sh, win: [number, number] = [540, 1020]) => {
    const re = await entryOf(P, TT, s, e, day, shift, S.u1, win);
    if (io) for (const [k, t] of [["IN", io[0]], ["OUT", io[1]]] as const) await P.hrAttendance.create({ data: { tenantId: TT, systemId: s, employeeId: e, kind: k, at: bk(day, t), rosterEntryId: re, source: "KIOSK" } });
   };
   const leave = async (e: string, day: string, paid: boolean, extra: Any = {}, approve = true) => {
    const r = await SV.requestLeave(c(s), { employeeId: e, type: paid ? "SICK" : "PERSONAL", policyId: paid ? polP : polU, fromDate: day, toDate: day, actorUserId: U.staff.id, ...extra });
    if (approve) await SV.decideLeave(c(s), r.id, "APPROVED", U.owner.id, { from: "PENDING" });
    return r.id as string;
   };
   return { s, sh, shA, shB, polP, polU, emp, roster, leave };
  };
  const S1 = await mkSys("R1 คู่ครึ่งวัน"), S2 = await mkSys("R1 คุม-ค้าง"), S3 = await mkSys("R1 คุม-สะอาด");
  // S1 — RED subjects (no-show unless noted)
  const eA = await S1.emp("A"), eB = await S1.emp("B"), eC = await S1.emp("C"), eD = await S1.emp("D");
  await S1.roster(eA, "2031-08-05", null); await S1.leave(eA, "2031-08-05", true, { halfDay: "AM" }); await S1.leave(eA, "2031-08-05", true, { halfDay: "PM" });
  await S1.roster(eB, "2031-08-06", null); await S1.leave(eB, "2031-08-06", false, { halfDay: "AM" }); await S1.leave(eB, "2031-08-06", true, { halfDay: "PM" });
  await S1.roster(eC, "2031-08-07", null); await S1.leave(eC, "2031-08-07", true, { halfDay: "AM" }); await S1.leave(eC, "2031-08-07", false, { halfDay: "PM" });
  await S1.roster(eD, "2031-08-05", null, S1.shA, [540, 780]); await S1.roster(eD, "2031-08-05", null, S1.shB, [780, 1020]);
  await S1.leave(eD, "2031-08-05", true, { halfDay: "AM" }); await S1.leave(eD, "2031-08-05", true, { halfDay: "PM" });
  // S2 — controls that block a run by design + stale
  const eF = await S2.emp("F"), eH = await S2.emp("H"), eI = await S2.emp("I"), eJ = await S2.emp("J");
  await S2.roster(eF, "2031-08-05", null); await S2.leave(eF, "2031-08-05", true, { halfDay: "AM" }); await S2.leave(eF, "2031-08-05", true, { halfDay: "PM" }, false);
  await S2.roster(eH, "2031-08-05", null);
  const hAm = await S2.leave(eH, "2031-08-05", true, { halfDay: "AM" });
  { const src = (await P.hrLeave.findUnique({ where: { id: hAm } })) as Any; const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = src; void _i; void _c; void _u; await P.hrLeave.create({ data: { ...rest, policyId: S2.polU, type: "PERSONAL" } }); } // legacy second AM (Q7)
  await S2.roster(eI, "2031-08-05", null); await S2.leave(eI, "2031-08-05", true, { halfDay: "AM" }); const iPm = await S2.leave(eI, "2031-08-05", true, { halfDay: "PM" });
  await S2.roster(eJ, "2031-08-06", null); const jAm = await S2.leave(eJ, "2031-08-06", true, { halfDay: "AM" }); await S2.leave(eJ, "2031-08-06", true, { halfDay: "PM" });
  // S3 — clean controls (run must create on base and after)
  const eE = await S3.emp("E"), eK = await S3.emp("K"), eG = await S3.emp("G");
  await S3.roster(eE, "2031-08-05", ["13:00", "17:00"]); await S3.leave(eE, "2031-08-05", true, { halfDay: "AM" });
  await S3.roster(eK, "2031-08-05", null); await S3.leave(eK, "2031-08-05", true, { halfDay: "AM" });
  await S3.roster(eK, "2031-08-12", ["09:00", "17:00"]);
  await S3.roster(eG, "2031-08-04", null); await S3.leave(eG, "2031-08-04", true);
  await S3.roster(eG, "2031-08-08", null); await S3.leave(eG, "2031-08-08", false, { hours: 4 });
  for (const d of ["2031-08-09", "2031-08-16", "2031-08-23", "2031-08-30", "2031-09-05"]) await safe(() => JG.runAttendanceJobs({ now: bk(d), tenantId: TT }));
  const att = (e: string, day: string) => rows(`SELECT id, status::text AS st, "leaveFraction"::text AS fr, "slotKey" AS k FROM "HrAttendanceDay" WHERE "employeeId" = $1 AND date = $2::date ORDER BY "slotKey"`, e, day);
  const wd = async (e: string, day: string) => (await rows(`SELECT "paidLeaveMin" AS pl, "unpaidLeaveMin" AS ul, "absentMin" AS ab, "workMin" AS w, "leaveDays"::text AS ld, review FROM "HrWorkDay" WHERE "employeeId" = $1 AND date = $2::date`, e, day))[0];
  const wdS = (x: Any) => (x ? `${x.pl}/${x.ul}/${x.ab}/${x.w}/${x.ld}/[${(x.review ?? []).join(",")}]` : "∅");
  const build = (s: string) => safe(() => WE.buildWorkEntrySnapshot(c(s), own, { periodKey: "2031-08" }, { now: NOW }));
  const ownA = { userId: U.owner.id, isOwner: true };
  const runFor = async (s: string) => {
   const sy = await safe(() => ATP.syncAttendanceDeductions(c(s), own, { periodKey: "2031-08" }, { now: NOW }));
   for (const r of await rows(`SELECT id FROM "HrPayAdjustment" WHERE "systemId" = $1 AND status::text = 'PENDING'`, s)) await safe(() => PAY.decideAdjustment(c(s), r.id, "APPROVED", ownA));
   const R = await safe(() => PAY.createPayrollRunV2(c(s), V.pay, { periodKey: "2031-08", payDate: bk("2031-08-31", "10:00") }, { now: NOW, actor: { userId: U.pay.id, isOwner: false } }));
   return { sy, R };
  };
  const lines = async (runId: string | undefined, e: string) => {
   const it = runId ? (await rows(`SELECT "grossSatang" AS g, "snapshotJson"->'lines' AS l FROM "HrPayrollItem" WHERE "runId" = $1 AND "employeeId" = $2`, runId, e))[0] : null;
   return { g: it ? Number(it.g) : null, l: ((it?.l ?? []) as Any[]).filter((x) => x.code !== "BASE").map((x) => `${x.code}:${x.day ?? "-"}:${x.minutes ?? "-"}:${x.amountSatang}`) };
  };
  // S1
  const b1 = await build(S1.s);
  const aA = await att(eA, "2031-08-05"), aD = await att(eD, "2031-08-05");
  const fr = (xs: Any[]) => xs.map((x) => x.fr ?? "-").join(",");
  ck("R1.1", { built: b1?.ok === true, leave: aA.length === 1 && aA.every((x) => x.st === "LEAVE"), frac: fr(aA) === "1.0" }, "LEAVE · 1.0", `att=${aA.map((x) => x.st).join(",")} fr=${fr(aA)}`);
  const wA = await wd(eA, "2031-08-05");
  ck("R1.2", { day: wdS(wA) === "480/0/0/0/1.0/[]" }, "480/0/0/0/1.0/[]", wdS(wA));
  const r1 = await runFor(S1.s);
  const waitS1 = ((r1.sy?.wait ?? []) as Any[]).length;
  ck("R1.3", { synced: r1.sy?.ok === true, noWait: waitS1 === 0, run: r1.R?.ok === true && !!r1.R?.id }, "title", `wait=${waitS1} run=${r1.R?.ok}:${r1.R?.code ?? ""}`);
  const lA = await lines(r1.R?.id, eA);
  ck("R1.4", { noLines: !!r1.R?.id && lA.l.filter((x) => /^(UNPAID_LEAVE|ABSENT_RULE|LATE_RULE)/.test(x)).length === 0, gross: lA.g === 3_000_000 }, "title", `g=${lA.g} ${lA.l.join(" ")}`);
  const wB = await wd(eB, "2031-08-06"), lB = await lines(r1.R?.id, eB);
  const dedL = (l: string[]) => l.filter((x) => /^(UNPAID_LEAVE|ABSENT_RULE|LATE_RULE)/.test(x)).join(" ");
  ck("R1.5", { day: wdS(wB) === "240/240/0/0/1.0/[]", lines: dedL(lB.l) === "UNPAID_LEAVE:2031-08-06:240:-50000" }, "title", `${wdS(wB)} lines=${dedL(lB.l) || "none"}`);
  const wC = await wd(eC, "2031-08-07"), lC = await lines(r1.R?.id, eC);
  ck("R1.6", { day: wdS(wC) === "240/240/0/0/1.0/[]", lines: dedL(lC.l) === "UNPAID_LEAVE:2031-08-07:240:-50000" }, "mirror", `${wdS(wC)} lines=${dedL(lC.l) || "none"}`);
  const wD = await wd(eD, "2031-08-05");
  ck("R1.7", { slots: aD.length === 2 && aD.every((x) => x.st === "LEAVE"), day: wdS(wD) === "480/0/0/0/1.0/[]" }, "both LEAVE · 480", `att=${aD.map((x) => `${x.st}:${x.fr ?? "-"}`).join(",")} ${wdS(wD)}`);
  // S3 (clean controls) — run, approve, MONEY-2 gate
  await build(S3.s);
  const wE = await wd(eE, "2031-08-05"), wK = await wd(eK, "2031-08-05"), wG1 = await wd(eG, "2031-08-04"), wG2 = await wd(eG, "2031-08-08");
  const r3 = await runFor(S3.s);
  const lE = await lines(r3.R?.id, eE), lK = await lines(r3.R?.id, eK), lG = await lines(r3.R?.id, eG);
  ck("R1.11", { day: wdS(wE) === "240/0/0/240/0.5/[]", lines: !!r3.R?.id && dedL(lE.l) === "" }, "title", `${wdS(wE)} lines=${dedL(lE.l) || "none"} run=${r3.R?.ok}:${r3.R?.code ?? ""}`);
  ck("R1.12", { full: wdS(wG1) === "480/0/0/0/1.0/[]", hourly: wdS(wG2) === "0/240/240/0/0.5/[]", single: wdS(wK) === "240/0/240/0/0.5/[]", run: r3.R?.ok === true, kLines: dedL(lK.l) === "ABSENT_RULE:-:-:-50000", gLines: dedL(lG.l).split(" ").sort().join(" ") === "ABSENT_RULE:-:-:-50000 UNPAID_LEAVE:2031-08-08:240:-50000" },
   "controls", `full=${wdS(wG1)} hourly=${wdS(wG2)} single=${wdS(wK)} run=${r3.R?.ok}:${r3.R?.code ?? ""} K=${dedL(lK.l)} G=${dedL(lG.l)}`);
  {
   const ap = r3.R?.id ? await safe(() => PAY.approveRun(c(S3.s), r3.R.id, undefined, ownA)) : null;
   const u = await S3.leave(eK, "2031-08-12", false, { halfDay: "PM" }, false);
   const e = await safe(() => SV.decideLeave(c(S3.s), u, "APPROVED", U.owner.id, { from: "PENDING" }).then(() => ({ ok: true })));
   ck("R1.14", { approved: ap?.ok !== false && !!ap, refused: e?.ok === false && String(e.reason).includes(T.paid), pending: (await leaveSt(u)) === "PENDING" }, "title", `approve=${JSON.stringify(ap)?.slice(0, 80)} decide=${String(e?.reason ?? e?.ok).slice(0, 90)}`);
  }
  // S2 (blocking controls)
  await build(S2.s);
  const wF = await wd(eF, "2031-08-05"), wH = await wd(eH, "2031-08-05");
  ck("R1.9", { pending: (wF?.review ?? []).includes("PENDING_LEAVE") }, "PENDING_LEAVE", wdS(wF));
  ck("R1.13", { mismatch: (wH?.review ?? []).includes("LEAVE_MISMATCH") }, "LEAVE_MISMATCH", wdS(wH));
  // 1.10 revoke PM → recompute → ABSENT 240
  const rv = await safe(() => SV.decideLeave(c(S2.s), iPm, "REJECTED", U.owner.id, { from: "APPROVED" }).then(() => ({ ok: true })));
  for (const r of await att(eI, "2031-08-05")) await safe(() => JG.recomputeAttendanceDay(c(S2.s), own, { dayId: r.id, reason: "qc leave-3 ถอนใบลาครึ่งบ่าย" }, { now: NOW }));
  // 1.8 base-shape stored row (ABSENT · AM leave · 0.5) on eJ
  const jRows = await att(eJ, "2031-08-06");
  for (const r of jRows) await P.$executeRawUnsafe(`UPDATE "HrAttendanceDay" SET status = 'ABSENT', "leaveId" = $2, "leaveFraction" = 0.5, "workedMin" = 0, "lateMin" = 0, "earlyOutMin" = 0 WHERE id = $1`, r.id, jAm);
  await build(S2.s);
  const wI = await wd(eI, "2031-08-05"), wJ0 = await wd(eJ, "2031-08-06");
  ck("R1.10", { revoked: rv?.ok === true, day: wdS(wI) === "240/0/240/0/0.5/[]" }, "ABSENT 240", `${wdS(wI)} revoke=${rv?.ok ?? rv?.reason}`);
  for (const r of jRows) await safe(() => JG.recomputeAttendanceDay(c(S2.s), own, { dayId: r.id, reason: "qc leave-3 คำนวณใหม่หลังแก้คู่ครึ่งวัน" }, { now: NOW }));
  await build(S2.s);
  const aJ = await att(eJ, "2031-08-06"), wJ = await wd(eJ, "2031-08-06");
  ck("R1.8", { stale: (wJ0?.review ?? []).includes("STALE"), leave: aJ.length === 1 && aJ.every((x) => x.st === "LEAVE"), day: wdS(wJ) === "480/0/0/0/1.0/[]" }, "title", `before=${wdS(wJ0)} att=${aJ.map((x) => x.st).join(",")} after=${wdS(wJ)}`);
 })();

 // ═════════════════════════ R2 (F2) expected step + two-person rule ═════════════════════════
 await (async () => {
  { // 2.1 OWNER replay with expectedStep 1
   const w = await world("R2.1", MO);
   const o: string[] = [];
   for (let i = 0; i < 3; i++) {
    const f = await file(w);
    const a = await decide("owner", f.reqId, "APPROVED", 1), b = await decide("owner", f.reqId, "APPROVED", 1);
    const r = await reqRow(f.reqId);
    o.push(`${a.ok}/${res3(b) === LOST ? "lost" : res3(b)}→${r.s}@${r.o}·dec=${(await decisions(f.reqId)).length}`);
   }
   ck("R2.1", { all: o.every((x) => x === "true/lost→PENDING@2·dec=1") }, "title", dist(o));
  }
  { // 2.2 same MANAGER both steps
   const w = await world("R2.2", MM);
   const f = await file(w);
   const a = await decide("mgr", f.reqId), b = await decide("mgr", f.reqId);
   const nw = await nothing(f, 2, 1);
   const want = canon({ ok: false, status: "PENDING", note: null, code: "TWO_PERSON", reason: T.two });
   const done = await decide("mgr2", f.reqId);
   await deliver(f);
   ck("R2.2", { first: a.ok === true, refused: res3(b) === want, nothing: nw, other: done.ok === true && done.status === "APPROVED" && (await leaveSt(f.leaveId)) === "APPROVED" }, "title", `b=${res3(b).slice(0, 140)} done=${done.status}`);
  }
  { // 2.3 bulk duplicate id
   const w = await world("R2.3", MM);
   const o: string[] = [];
   for (let i = 0; i < 3; i++) {
    const f = await file(w);
    const r = await safe(() => AP_.bulkDecide(V.mgr, ctxA, [f.reqId, f.reqId], "APPROVED", null));
    const q = await reqRow(f.reqId);
    o.push(`done=${r.done}·failed=${(r.failed ?? []).length}·${q.s}@${q.o}·dec=${(await decisions(f.reqId)).length}`);
   }
   ck("R2.3", { all: o.every((x) => x === "done=1·failed=0·PENDING@2·dec=1") }, "title", dist(o));
  }
  { // 2.4 AI approval_decide
   const w = await world("R2.4", MM);
   const run = (who: keyof typeof U, payload: Any, i: number) => (PROP.runKind ? PROP.runKind(V[who], TT, "approval_decide", payload, `qc-l3-${tag}-${i}`, U[who].id).then((t: string) => ({ ok: true, t }), (e: unknown) => ({ ok: false, t: e instanceof Error ? e.message : String(e) })) : Promise.resolve({ ok: false, t: "∅runKind" }));
   const f = await file(w);
   const a = await run("mgr", { requestId: f.reqId, decision: "APPROVED" }, 1), b = await run("mgr", { requestId: f.reqId, decision: "APPROVED" }, 2);
   const nb = await nothing(f, 2, 1);
   const g = await file(w);
   await decide("mgr", g.reqId);
   const s2 = await run("mgr2", { requestId: g.reqId, decision: "APPROVED", expectedStep: 1 }, 3);
   const ns = await nothing(g, 2, 1);
   ck("R2.4", { first: a.ok, two: !b.ok && b.t.includes(T.two), nothing: nb, stale: !s2.ok && /[฀-๿]/.test(s2.t), staleNothing: ns }, "title", `b=${b.t.slice(0, 70)} stale=${s2.t.slice(0, 60)}`);
  }
  { // 2.5 OWNER both steps → override audit
   const w = await world("R2.5", MO);
   const f = await file(w);
   const a = await decide("owner", f.reqId), b = await decide("owner", f.reqId);
   await deliver(f); await deliver(f);
   const ov = await overrideRows(f.reqId);
   const j = (ov[0]?.after ?? {}) as Any;
   ck("R2.5", { ok: a.ok && b.ok && b.status === "APPROVED", decs: (await decisions(f.reqId)).length === 2, audit: ov.length === 1 && j.step === 2 && j.previousDeciderStep === 1, effect: (await leaveSt(f.leaveId)) === "APPROVED" && (await useN(f.leaveId)) === 1 && (await evN("hr.leave.decided", f.leaveId)) === 1 },
    "title", `audit=${ov.length} ${JSON.stringify(j).slice(0, 90)}`);
  }
  { // 2.6 stale expectedStep (direct · bulk action · decideAction bad value)
   const w = await world("R2.6", MM);
   const f = await file(w);
   await decide("mgr", f.reqId);
   const d = await decide("mgr2", f.reqId, "APPROVED", 1);
   const nd = await nothing(f, 2, 1);
   const g = await file(w);
   await decide("mgr", g.reqId);
   const b = await callAct(U.mgr2, act("bulkDecideAction"), { requestIds: [g.reqId], decision: "APPROVED", [`step:${g.reqId}`]: "1" });
   const nbk = await nothing(g, 2, 1);
   const k = await file(w);
   await decide("mgr", k.reqId);
   const m = await safe(() => AP_.bulkDecide(V.mgr2, ctxA, [k.reqId], "APPROVED", null, { [k.reqId]: 1 }));
   const nm = m.done === 0 && (m.failed ?? [])[0]?.reason === T.lost && (await nothing(k, 2, 1));
   const h = await file(w);
   const x = await callAct(U.mgr, act("decideAction"), { requestId: h.reqId, decision: "APPROVED", step: "x" });
   const nx = await nothing(h, 1, 0);
   const bf = (b.value?.failed ?? []) as Any[];
   ck("R2.6", { direct: res3(d) === LOST && nd, map: nm, bulk: b.value?.status === "done" && b.value?.done === 0 && bf.length === 1 && bf[0]?.reason === T.lost && nbk, badValue: x.value?.ok === false && x.value?.reason === T.bad && nx },
    "title", `direct=${res3(d).slice(0, 50)} bulk=${b.text.slice(0, 90)} bad=${x.text.slice(0, 60)}`);
  }
  { // 2.15 OWNER double click through the web actions (step always sent)
   const w = await world("R2.15", MO);
   const f = await file(w), g = await file(w);
   const a1 = await callAct(U.owner, act("decideAction"), { requestId: f.reqId, decision: "APPROVED", step: "1" });
   const a2 = await callAct(U.owner, act("decideAction"), { requestId: f.reqId, decision: "APPROVED", step: "1" });
   const bf = { requestIds: [g.reqId], decision: "APPROVED", [`step:${g.reqId}`]: "1" };
   const b1 = await callAct(U.owner, act("bulkDecideAction"), bf), b2 = await callAct(U.owner, act("bulkDecideAction"), bf);
   ck("R2.15", { page: a1.value?.ok === true && a2.value?.ok === false && (await nothing(f, 2, 1)), bulk: b1.value?.done === 1 && b2.value?.done === 0 && (await nothing(g, 2, 1)) }, "one step each", `page=${a1.text.slice(0, 30)}/${a2.text.slice(0, 50)} bulk=${b1.value?.done}/${b2.value?.done}`);
  }
  { // 2.7 under held row lock (GREEN)
   const w1 = await world("R2.7a", [{ order: 1, approverRole: "OWNER" }]);
   const w2 = await world("R2.7b", MM);
   const o: string[] = [];
   for (let i = 0; i < 4; i++) {
    const f = await file(w1);
    const calls = [() => decide("owner", f.reqId), () => decide("owner2", f.reqId)];
    const { res } = await underLock(P, { rowSql: `SELECT id FROM "ApprovalRequest" WHERE id = $1 FOR UPDATE`, args: [f.reqId] }, i % 2 ? calls.reverse() : calls);
    o.push(`A:ok=${res.filter((r: Any) => r.ok).length}·${(await reqRow(f.reqId)).s}·dec=${(await decisions(f.reqId)).length}`);
    const g = await file(w2);
    const { res: r2 } = await underLock(P, { rowSql: `SELECT id FROM "ApprovalRequest" WHERE id = $1 FOR UPDATE`, args: [g.reqId] }, [() => decide("mgr", g.reqId, "APPROVED", 1), () => decide("mgr", g.reqId, "APPROVED", 1)]);
    const q = await reqRow(g.reqId);
    o.push(`B:ok=${r2.filter((r: Any) => r.ok).length}·${q.s}@${q.o}·dec=${(await decisions(g.reqId)).length}`);
   }
   ck("R2.7", { all: o.every((x) => x === "A:ok=1·APPROVED·dec=1" || x === "B:ok=1·PENDING@2·dec=1") }, "1 ok each", dist(o));
  }
  { // 2.8 single-step chain ± expectedStep (byte-identical)
   const w = await world("R2.8", [{ order: 1, approverRole: "MANAGER" }]);
   const out: string[] = [];
   for (const [k, dec, st] of [["a", "APPROVED", undefined], ["b", "APPROVED", 1], ["c", "REJECTED", 1], ["d", "REJECTED", undefined]] as const) {
    const f = await file(w);
    const r = await decide("mgr", f.reqId, dec, st);
    const again = await decide("mgr", f.reqId, "APPROVED", st);
    await deliver(f);
    const ds = (await decisions(f.reqId)).map((x: Any) => `${x.o}:${x.d}:${x.by === U.mgr.id ? "mgr" : x.by}`);
    out.push(`${k}=${res3(r)}|${res3(again)}|${(await reqRow(f.reqId)).s}|${ds.join(",")}|${await leaveSt(f.leaveId)}|ev${await evN(`approval.request.${dec === "APPROVED" ? "approved" : "rejected"}`, f.reqId)}|aud${await audN("approval.owner_override", f.reqId)}`);
   }
   const W8 = (k: string, d: string) => `${k}={"note":null,"ok":true,"status":"${d}"}|{"note":null,"ok":false,"status":"${d}"}|${d}|1:${d}:mgr|${d}|ev1|aud0`;
   const want = [W8("a", "APPROVED"), W8("b", "APPROVED"), W8("c", "REJECTED"), W8("d", "REJECTED")];
   const bad = out.filter((x, i) => x !== want[i]);
   ck("R2.8", { same: !bad.length }, "literal", bad.join(" ‖ ").slice(0, 240) || "ok");
  }
  { // 2.9 two different managers
   const w = await world("R2.9", MM);
   const f = await file(w);
   const a = await decide("mgr", f.reqId), b = await decide("mgr2", f.reqId);
   await deliver(f); await deliver(f);
   const ds = await decisions(f.reqId);
   ck("R2.9", { ok: a.ok && b.ok && b.status === "APPROVED", decs: ds.length === 2 && new Set(ds.map((x: Any) => x.by)).size === 2, effect: (await leaveSt(f.leaveId)) === "APPROVED" && (await useN(f.leaveId)) === 1 && (await evN("hr.leave.decided", f.leaveId)) === 1 && (await audN("hr.leave.decide", f.leaveId)) === 1 }, "title", `${a.ok}/${b.status} decs=${ds.length}`);
  }
  { // 2.10 SELF_* unchanged
   await AP_.createPolicy(ctxA, { name: "สาย PO", entityType: "PurchaseOrder", steps: [{ order: 1, approverRole: "MANAGER" }] });
   const po = await AP_.submitForApproval(ctxA, { entityType: "PurchaseOrder", entityId: `po-${tag}-self`, requestedById: U.mgr.id });
   const a = await decide("mgr", po.requestId);
   const w = await world("R2.10", [{ order: 1, approverRole: "MANAGER" }]);
   const e = await fx.mkEmp(TT, w.s, `พนง ผจก ${tag}`, { startDate: "2030-01-01", unitId: S.u1, linkedUserId: U.mgr2.id });
   const f = await file(w, U.mgr2.id, e);
   const b = await decide("mgr2", f.reqId);
   const self = { ok: false, status: "PENDING", note: null, code: "SELF_APPROVAL", message: "อนุมัติคำขอของตัวเองไม่ได้ — ให้ผู้อนุมัติคนอื่นตัดสิน", reason: "อนุมัติคำขอของตัวเองไม่ได้ — ให้ผู้อนุมัติคนอื่นตัดสิน" };
   ck("R2.10", { po: canon(a) === canon(self), leave: canon(b) === canon(self) }, "title", `${canon(a).slice(0, 80)} | ${canon(b).slice(0, 80)}`);
  }
  { // 2.11 statics — callers pass a step
   const acts = code(`${AP}actions.ts`), prop = code("src/lib/ai/proposals.ts"), tools = code("src/lib/ai/tools.ts");
   const bulkCalls = [bodyOf(acts, "decideAction"), bodyOf(acts, "bulkDecideAction")].map((b) => callsOf(b, /\bbulkDecide\s*\(/g).join(" "));
   const ai = prop.slice(prop.indexOf('kind === "approval_decide"'), prop.indexOf('kind === "inventory_consume"'));
   const aiCalls = callsOf(ai, /\bapprovalSvc\.decide\s*\(/g).join(" ");
   const tool = tools.slice(tools.indexOf("const approvalDecide"), tools.indexOf("const inventoryConsume"));
   const callers = srcFiles("src").filter((f) => f !== `${AP}service.ts` && /\bbulkDecide\s*\(|\b(approvalSvc|approval|AP|ap)\s*\.\s*decide\s*\(/.test(code(f)));
   const r = { actions: bulkCalls.every((x) => /\bsteps?\b|expectedStep/.test(x)), ai: /expectedStep/.test(aiCalls) && /currentStepOrder/.test(ai), tools: /expectedStep/.test(tool) && /currentStepOrder/.test(tool), onlyCallers: callers.every((f) => [`${AP}actions.ts`, "src/lib/ai/proposals.ts"].includes(f)) };
   ck("R2.11", r, "steps passed", `callers=${callers.join(",")}`);
  }
  { // 2.12 statics — page + BulkApprovals
   const page = code("src/app/app/approvals/page.tsx"), bulk = code("src/app/app/approvals/BulkApprovals.tsx");
   const r = { page: /\bstep\s*:\s*r\.currentStepOrder\b/.test(page), type: /\bstep\s*\??\s*:\s*number/.test(bulk), hidden: /type\s*=\s*["']hidden["']/.test(bulk) && /`step:\$\{\s*\w+\.id\s*\}`|["']step:["']\s*\+\s*\w+\.id/.test(bulk) };
   ck("R2.12", r, "step:<id> rendered");
  }
  { // 2.13 same-user double click: sequential + unlocked parallel ×N
   const w = await world("R2.13", MM);
   const f = await file(w);
   const a = await decide("mgr", f.reqId), b = await decide("mgr", f.reqId);
   const seq = a.ok === true && b.ok === false && (await nothing(f, 2, 1));
   const o: string[] = [];
   for (let i = 0; i < N; i++) {
    const g = await file(w);
    await Promise.all([decide("mgr", g.reqId), decide("mgr", g.reqId)]);
    const q = await reqRow(g.reqId);
    o.push(`${q.s}@${q.o}·dec=${(await decisions(g.reqId)).length}`);
   }
   ck("R2.13", { seq, parallel: o.every((x) => x === "PENDING@2·dec=1") }, `seq refused · PENDING@2·dec=1 ×${N}`, `seq=${seq} ${dist(o)}`);
  }
  { // 2.14 non-HR subject two users
   await AP_.createPolicy(ctxA, { name: "สาย PO2", entityType: "PurchaseOrder", unitId: S.u1, steps: MO });
   const po = await AP_.submitForApproval(ctxA, { entityType: "PurchaseOrder", entityId: `po-${tag}-two`, unitId: S.u1, requestedById: U.staff.id });
   const a = await decide("mgr", po.requestId), b = await decide("owner", po.requestId);
   ck("R2.14", { ok: a.ok && b.ok && b.status === "APPROVED", decs: (await decisions(po.requestId)).length === 2, noAudit: (await audN("approval.owner_override", po.requestId)) === 0 }, "APPROVED", `${a.ok}/${b.status}`);
  }
 })();

 // ═════════════════════════ R3 (F3) no step edits while requests are open ═════════════════════════
 await (async () => {
  const pol = async (id: string) => { const p = (await P.approvalPolicy.findUnique({ where: { id }, include: { steps: { orderBy: { order: "asc" } } } })) as Any; return canon({ name: p?.name, th: p?.thresholdSatang, steps: (p?.steps ?? []).map((s: Any) => [s.order, s.approverRole, s.approverUserId]) }); };
  const upd = (w: W, input: Any) => AP_.updatePolicy(ctxA, w.apId, { systemId: w.s, ...input }).then(() => "ok", (e: unknown) => (e instanceof Error ? e.message : String(e)));
  {
   const w = await world("R3.1", MO);
   const f = await file(w);
   await decide("mgr", f.reqId);
   const before = await pol(w.apId);
   const r = await upd(w, { name: "สาย R3.1 แก้", steps: [{ order: 1, approverRole: "OWNER" }] });
   const after = await pol(w.apId);
   const d = await decide("owner", f.reqId);
   ck("R3.1", { text: r === T.edit(1), same: before === after, decidable: d.ok === true && d.status === "APPROVED" }, "title", `r=${r.slice(0, 80)} same=${before === after} d=${res3(d).slice(0, 60)}`);
  }
  {
   const w = await world("R3.2", MO);
   const f = await file(w), g = await file(w);
   await decide("mgr", f.reqId); // f at step 2 · g at step 1
   const r1 = await upd(w, { name: "สาย R3.2 ชื่อใหม่", steps: MO });
   const r2 = await upd(w, { name: "สาย R3.2 ชื่อใหม่", steps: MM }); // role change of f's current step
   const d = await decide("mgr2", f.reqId);
   const r3 = await upd(w, { name: "สาย R3.2 ชื่อใหม่", steps: [...MM, { order: 3, approverRole: "OWNER" }] }); // add a step
   const g1 = await decide("mgr", g.reqId);
   const p = await pol(w.apId);
   ck("R3.2", { rename: r1 === "ok", role: r2 === "ok" && d.ok === true && d.status === "APPROVED", add: r3 === "ok" && g1.ok === true && (await reqRow(g.reqId)).o === 2, steps: p.includes("สาย R3.2 ชื่อใหม่") && p.includes('[3,"OWNER",null]') }, "title", `${r1.slice(0, 40)}|${r2.slice(0, 40)}|${r3.slice(0, 40)} d=${res3(d).slice(0, 50)}`);
   const r4 = await upd(w, { name: "สาย R3.2 ชื่อใหม่", steps: [...MM, { order: 3, approverRole: "OWNER" }].reverse() });
   ck("R3.4", { ok: r4 === "ok", same: (await pol(w.apId)) === p }, "allowed", r4.slice(0, 80));
  }
  {
   const w = await world("R3.7", MO);
   const f = await file(w);
   await decide("mgr", f.reqId);
   const before = await pol(w.apId);
   const r = await upd(w, { name: "สาย R3.7", steps: [{ order: 1, approverRole: "MANAGER" }, { order: 3, approverRole: "OWNER" }] });
   ck("R3.7", { text: r === T.edit(1), same: (await pol(w.apId)) === before, pending: (await reqRow(f.reqId)).o === 2 }, "title", r.slice(0, 90));
  }
  {
   const w = await world("R3.5", MO);
   const f = await file(w);
   await AP_.setPolicyActive(ctxA, w.apId, false);
   const d1 = await decide("mgr", f.reqId), d2 = await decide("owner", f.reqId);
   ck("R3.5", { decided: d1.ok === true && d2.ok === true && d2.status === "APPROVED" }, "decidable while disabled", `${res3(d1)} ${res3(d2)}`);
  }
  {
   const w = await world("R3.3", MO);
   const f = await file(w);
   await decide("mgr", f.reqId); await decide("owner2", f.reqId);
   const r = await upd(w, { name: "สาย R3.3", steps: [{ order: 1, approverRole: "OWNER" }] });
   ck("R3.3", { ok: r === "ok", steps: (await pol(w.apId)).includes('"steps":[[1,"OWNER",null]]') }, "allowed", r.slice(0, 80));
  }
  {
   const w = await world("R3.6a", MO), x = await world("R3.6b", MO);
   for (const v of [w, w, x]) await decide("mgr", (await file(v)).reqId); // all at step 2
   const r = await upd(w, { name: "สาย R3.6", steps: [{ order: 1, approverRole: "MANAGER" }] });
   ck("R3.6", { text: r === T.edit(2) }, "text 2", r.slice(0, 90));
  }
 })();

 // ═════════════════════════ R4 (F4) withdraw = cancel the leave ═════════════════════════
 await (async () => {
  const cancelAct = act("cancelMyRequestAction");
  const w = await world("R4", MO);
  const bal = async () => { const b = await safe(() => LV.leaveBalances(c(w.s), own, { employeeId: w.e, year: 2031 })); const it = b?.items?.find((i: Any) => i.name?.includes("พักร้อน")) ?? b?.items?.[0]; return `${it?.pending}|${it?.available}`; };
  {
   const b0 = await bal();
   const f = await file(w);
   const b1 = await bal();
   const r = await callAct(U.staff, cancelAct, { requestId: f.reqId });
   const b2 = await bal();
   ck("R4.1", { action: !r.threw, req: (await reqRow(f.reqId)).s === "CANCELLED", leave: (await leaveSt(f.leaveId)) === "CANCELLED", audit: (await audN("hr.leave.cancel", f.leaveId)) === 1, noEvent: (await evN("hr.leave.decided", f.leaveId)) === 0, released: b2 === b0 && b1 !== b0 },
    "title", `leave=${await leaveSt(f.leaveId)} bal ${b0} → ${b1} → ${b2} ${r.threw ? r.text.slice(0, 60) : ""}`);
   const d = await safe(() => LV.decideLeaveAs(c(w.s), V.mgr2, f.leaveId, "APPROVED"));
   ck("R4.2", { refused: d?.ok === false, leave: (await leaveSt(f.leaveId)) === "CANCELLED", noUse: (await useN(f.leaveId)) === 0 }, "title", `d=${JSON.stringify(d).slice(0, 90)} leave=${await leaveSt(f.leaveId)}`);
  }
  {
   const f = await file(w);
   await decide("mgr", f.reqId);
   await AP_.cancelRequest(ctxA, f.reqId); // legacy shape: chain cancelled after a decided step
   const m = await safe(() => LV.decideLeaveAs(c(w.s), V.mgr2, f.leaveId, "APPROVED"));
   const lm = await leaveSt(f.leaveId);
   const o = await safe(() => LV.decideLeaveAs(c(w.s), V.owner, f.leaveId, "APPROVED"));
   ck("R4.3", { mgr: m?.ok === false && m?.reason === T.gate && lm === "PENDING", owner: o?.ok === true && (await leaveSt(f.leaveId)) === "APPROVED" && (await useN(f.leaveId)) === 1 }, "title", `mgr=${JSON.stringify(m).slice(0, 100)} owner=${JSON.stringify(o).slice(0, 60)}`);
  }
  {
   const f = await file(w), g = await file(w);
   const c1 = await AP_.cancelRequest(ctxA, f.reqId), c2 = await AP_.cancelRequest(ctxA, g.reqId);
   const e1 = await safe(() => SV.decideLeave(c(w.s), f.leaveId, "APPROVED", U.owner.id, { from: "PENDING" }).then(() => ({ ok: true })));
   const e2 = await safe(() => LV.decideLeaveAs(c(w.s), V.mgr2, g.leaveId, "APPROVED"));
   ck("R4.4", { cancelled: c1 && c2, owner: e1?.ok === true && (await leaveSt(f.leaveId)) === "APPROVED", manager: e2?.ok === true && (await leaveSt(g.leaveId)) === "APPROVED" }, "direct works", `owner=${e1?.ok ?? e1?.reason} mgr=${JSON.stringify(e2).slice(0, 80)}`);
  }
  {
   await AP_.createPolicy(ctxA, { name: "สาย PO3", entityType: "PurchaseOrder", unitId: S.u1, steps: MO });
   const po = await AP_.submitForApproval(ctxA, { entityType: "PurchaseOrder", entityId: `po-${tag}-cx`, unitId: S.u1, requestedById: U.staff.id });
   const r = await callAct(U.staff, cancelAct, { requestId: po.requestId });
   ck("R4.5", { ok: !r.threw && (await reqRow(po.requestId)).s === "CANCELLED" }, "CANCELLED", r.text.slice(0, 80));
  }
  {
   const f = await file(w);
   const a = await callAct(U.mgr, cancelAct, { requestId: f.reqId }), b = await callAct(U.staff2, cancelAct, { requestId: f.reqId });
   ck("R4.6", { unchanged: !a.threw && !b.threw && (await reqRow(f.reqId)).s === "PENDING" && (await leaveSt(f.leaveId)) === "PENDING" && (await audN("hr.leave.cancel", f.leaveId)) === 0 }, "nothing", `${a.text.slice(0, 40)} ${b.text.slice(0, 40)}`);
   await decide("mgr", f.reqId); await decide("owner", f.reqId); await deliver(f);
   const r = await callAct(U.staff, cancelAct, { requestId: f.reqId });
   ck("R4.8", { unchanged: !r.threw && (await reqRow(f.reqId)).s === "APPROVED" && (await leaveSt(f.leaveId)) === "APPROVED" && (await useN(f.leaveId)) === 1 && (await audN("hr.leave.cancel", f.leaveId)) === 0 }, "nothing", r.text.slice(0, 80));
  }
  const race = async (withdraw: (f: F) => Promise<unknown>, label: string) => {
   const o: string[] = [];
   for (let i = 0; i < 4; i++) {
    const f = await file(w);
    await decide("mgr", f.reqId);
    const calls = [() => withdraw(f), () => decide("owner", f.reqId)];
    await underLock(P, { rowSql: `SELECT id FROM "ApprovalRequest" WHERE id = $1 FOR UPDATE`, args: [f.reqId] }, i % 2 ? calls.reverse() : calls);
    await deliver(f);
    const r = (await reqRow(f.reqId)).s, l = await leaveSt(f.leaveId), u = await useN(f.leaveId);
    const okk = (r === "APPROVED" && l === "APPROVED" && u === 1) || (r === "CANCELLED" && l === "CANCELLED" && u === 0);
    o.push(`${label}${i % 2 ? "approveFirst" : "withdrawFirst"}·${r}/${l}/use${u}·${okk ? "OK" : "BAD"}`);
   }
   return o;
  };
  const o7 = await race((f) => safe(() => SV.cancelLeave(c(w.s), f.leaveId, { actorUserId: U.staff.id })), "");
  ck("R4.7", { consistent: o7.every((x) => x.endsWith("OK")) }, "OK ×4", dist(o7));
  const o11 = await race((f) => callAct(U.staff, cancelAct, { requestId: f.reqId }), "");
  ck("R4.11", { consistent: o11.every((x) => x.endsWith("OK")), withdrew: o11.some((x) => x.startsWith("withdrawFirst·CANCELLED/CANCELLED")) }, "title", dist(o11));
  { // 4.9 time correction (Q6)
   const sC = await sys("R4 แก้เวลา");
   const ec = await fx.mkUser(TT, "c1", `QL3 c1 ${tag}`, "STAFF" as Any, [S.u1], {});
   const e = await fx.mkEmp(TT, sC, `พนง แก้เวลา ${tag}`, { startDate: "2030-01-01", unitId: S.u1, linkedUserId: ec.id });
   await AP_.createPolicy(ctxA, { name: "สาย แก้เวลา", entityType: "HrTimeCorrection", systemId: sC, steps: [{ order: 1, approverRole: "MANAGER" }] });
   const now = bk("2031-03-10", "20:00");
   const rq = await safe(() => CORR.requestCorrection(c(sC), { userId: ec.id, role: "STAFF", unitAccess: [S.u1], permissions: {} }, { action: "ADD", kind: "IN", at: bk("2031-03-10", "09:00"), reason: "ลืมลงเวลาเข้า qc" }, { now }));
   const r = rq?.requestId ? await callAct(ec, cancelAct, { requestId: rq.requestId }) : { threw: true, text: `fixture ${JSON.stringify(rq).slice(0, 80)}` };
   const st = async () => (await rows(`SELECT status::text AS s FROM "HrTimeCorrection" WHERE id = $1`, rq?.id ?? "∅"))[0]?.s;
   const s1 = await st();
   const d = rq?.id ? await safe(() => CORR.decideCorrection(c(sC), V.mgr, rq.id, { decision: "APPROVED" }, { now })) : null;
   ck("R4.9", { fixture: !!rq?.requestId, cancelled: s1 === "CANCELLED", refused: d?.ok === false && (await st()) === "CANCELLED", audit: (await audN("hr.correction.cancel", rq?.id ?? "∅")) === 1 }, "title", `after=${s1} decide=${JSON.stringify(d).slice(0, 70)} ${r.threw ? r.text : ""}`);
  }
  { // 4.10 shift swap (Q6)
   const sW = await sys("R4 สลับกะ");
   const w1 = await fx.mkUser(TT, "w1", `QL3 w1 ${tag}`, "STAFF" as Any, [S.u1], {}), w2 = await fx.mkUser(TT, "w2", `QL3 w2 ${tag}`, "STAFF" as Any, [S.u1], {});
   const eA = await fx.mkEmp(TT, sW, `พนง ขอสลับ ${tag}`, { startDate: "2030-01-01", unitId: S.u1, linkedUserId: w1.id });
   const eB = await fx.mkEmp(TT, sW, `พนง รับกะ ${tag}`, { startDate: "2030-01-01", unitId: S.u1, linkedUserId: w2.id });
   const ent = await entryOf(P, TT, sW, eA, "2031-04-08", await shiftOf(P, TT, sW, "เช้า", 540, 1020), S.u1, [540, 1020]);
   await AP_.createPolicy(ctxA, { name: "สาย สลับกะ", entityType: "HrShiftSwapRequest", systemId: sW, steps: [{ order: 1, approverRole: "MANAGER" }] });
   const va = (u: Any) => ({ userId: u.id, role: "STAFF", unitAccess: [S.u1], permissions: {} });
   const rq = await safe(() => SWAP.requestSwap(c(sW), va(w1), { fromEntryId: ent, targetEmployeeId: eB }));
   const rs = rq?.id ? await safe(() => SWAP.respondSwap(c(sW), va(w2), rq.id, { accept: true })) : null;
   const req = rq?.id ? (await rows(`SELECT id FROM "ApprovalRequest" WHERE "entityId" = $1`, rq.id))[0]?.id : null;
   const r = req ? await callAct(w1, cancelAct, { requestId: req }) : { threw: true, text: `fixture ${JSON.stringify(rq).slice(0, 60)} ${JSON.stringify(rs).slice(0, 60)}` };
   const st = async () => (await rows(`SELECT status::text AS s FROM "HrShiftSwapRequest" WHERE id = $1`, rq?.id ?? "∅"))[0]?.s;
   const s1 = await st();
   const d = rq?.id ? await safe(() => SWAP.decideSwap(c(sW), V.mgr, rq.id, { decision: "APPROVED" })) : null;
   ck("R4.10", { fixture: !!req, cancelled: s1 === "CANCELLED", refused: d?.ok === false && (await st()) === "CANCELLED", audit: (await audN("hr.swap.cancel", rq?.id ?? "∅")) === 1 }, "title", `after=${s1} decide=${JSON.stringify(d).slice(0, 70)} ${r.threw ? r.text : ""}`);
  }
 })();
} catch (x) {
 crashed = errText(x);
 console.log(`CRASH ${crashed} ${(x as Error)?.stack?.split("\n").slice(1, 5).join(" | ")}`);
}
const left = await S.cleanup().catch((e: unknown) => [`cleanup ${errText(e)}`]);
chk("Z1", left.length === 0 && S.lawOk, "residue none · law 3", `${left.join(",") || "none"} law=${S.lawOk}`);
process.exit(finish({ forced: FORCE, crashed, missing }));
