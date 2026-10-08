// QC — HR V2 · H0.6 — Payroll reversal correctness (D2b + CRM seam): a REVERSED run frees its period, unbinds its adjustments,
//      emits `hr.payroll.reversed`; CRM un-pays commissions exactly once
// ⚠️ Oracle under change control (controller owns it) — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// requires: nothing seeded — own throwaway tenants `qc-hr-h0.6-<rand>` (+ `-b`), swept in `finally` (every table with tenantId, 4 passes)
//
// Contract (ledger/hr-briefs/hr-brief-H0.6.md §2 R1–R8 · §3 oracle · §6 Q1–Q3 · base session/hr 103fde95 ⊇ hotfix/hr-privacy afcb9bc3):
//   R1 migration 20261202000000_hr_payroll_run_live_unique: DROP "HrPayrollRun_systemId_periodKey_key" · partial unique
//      "HrPayrollRun_systemId_periodKey_live_key" ("systemId","periodKey") WHERE "status" <> 'REVERSED' · plain index
//      "HrPayrollRun_systemId_periodKey_idx" · + "reversedAt" TIMESTAMP(3) NULL · "reversedById" TEXT NULL (read here via $queryRaw only)
//   R2 reverseRun(ctx, runId, reason?, actor?) — one tenantDb(ctx).$transaction · advisory lock hr:payroll:run:<systemId>:<periodKey> + FOR UPDATE ·
//      fixed Thai refusals ("ไม่พบรอบจ่าย" · "รอบนี้กลับรายการไปแล้ว" · no-JV text · "รอบนี้กลับรายการไม่ได้ในสถานะปัจจุบัน") + refusal audits ·
//      guarded updateMany → REVERSED + reversedAt + reversedById · reverseEntry(…, tx) inside the tx (no ACCOUNT system ⇒ skip, still REVERSED) ·
//      unbind every HrPayAdjustment of the run (count check) · emitOutbox hr.payroll.reversed#<runId> {runId, periodKey, adjustmentIds} ·
//      audit hr.payroll.reverse {runId, periodKey, adjustmentCount, journalEntryId, reversalEntryId} + actor · items kept (Q1)
//   R3 createPayrollRun dup check / payrollRunPeriods / stranded views: a REVERSED run does not "take" its period
//   R4 crm/commissions.ts onPayrollReversed({tenantId, hrSystemId, runId, adjustmentIds}) PAID → APPROVED by the pair rule, audit
//      crm.commission.unpaid, replay-safe · bridge onPayrollReversed · consumer map line · webhook label · HR facade adjustmentsByIds
//   R5 a commission clawed back by CRM (REVERSED negative row + DEDUCTION) is untouched; its DEDUCTION re-enters the next run like any row
//   R6 races (10 lanes in 2 worker PROCESSES, own pool each) · R7 ids/counts only in payload + audit
//   FREEZE: payroll-rules.ts · computeItem · markPaid block (sha256 taken on the base)
//
// Groups: S0 fixture control · S1 reverse happy path · X8 payload · S2 period freed · S3 CRM un-pay · X9 replay · S4 clawback (R5) ·
//         S5 guards + texts · X1 cross-scope · S6/X6 races + ledger · S7 no ACCOUNT system (X8 default) · S8 static · Z1 residue.
//
// SKIP convention (house style of qc-hr-h0.1): while the H0.6 migration / onPayrollReversed / adjustmentsByIds are absent the suite prints
//   SKIPPED + JSON_SUMMARY {skipped:true} and exits 0 · `QC_FORCE=1` (or `--force-run`) runs everything anyway — on the base every check
//   that needs the new code is RED for the right reason, controls are green, no crash, no residue.
// Shared QC4: our own events are hand-delivered to the consumer map BY ID (whatever their status — a foreign drainer may have claimed
//   them) · never a global drain · races wait on a stdin barrier (GO/ROUND lines), not on wall-clock windows (machine under CPU steal).
// --list = print every id without touching the DB.
//
// Run (QC4 only): bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h0.6.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";

const SUITE = "qc-hr-h0.6";
const THIS_FILE = "scripts/qc-hr-h0.6.mts";
const ROOT = process.cwd();
const ARGV = process.argv.slice(2);
const LIST = ARGV.includes("--list");
const WORKER_AT = ARGV.indexOf("--h06-worker");
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const QC4_HOST_MARK = "ep-frosty-lab";
/** base of the marked-hunk diff (S8.5) — the oracle's base on session/hr; H0.5 (PIN) does not touch the four files */
const BASE_REF = process.env.QC_H06_BASE || "103fde95";

const PAY_FILE = "src/lib/modules/hr/payroll.ts";
const ACT_FILE = "src/lib/modules/hr/payroll-actions.ts";
const HR_INDEX = "src/lib/modules/hr/index.ts";
const RULES_FILE = "src/lib/modules/hr/payroll-rules.ts";
const SCHEMA_FILE = "prisma/schema/payroll.prisma";
const MIG_DIR = "prisma/migrations/20261202000000_hr_payroll_run_live_unique";
const MIG_FILE = `${MIG_DIR}/migration.sql`;
const CRM_FILE = "src/lib/modules/crm/commissions.ts";
const BRIDGE_FILE = "src/lib/platform/crm-bridges/commissions.ts";
const CONSUMERS_FILE = "src/lib/outbox-consumers.ts";
const WEBHOOK_LABELS = "src/lib/webhooks/labels.ts";
const AUTOMATION_LABELS = "src/lib/automation/labels.ts";
// hashes taken on the base (103fde95 — same values as qc-hr-h0.1 on f85f5455) — FREEZE (hr-brief-COMMON §C.4/C.5 · H0.6 §4)
const RULES_SHA = "75a66c0c1354e932e7ba29609dcbf0919ffe82b51f476a3945fd1a0749833bf7";
const COMPUTE_ITEM_SHA = "b151a83c16eb96cb9adca8d5ed8b622612ebc50c39ad729f6f7966c43a47cd13";
const MARKPAID_BLOCK_SHA = "893a9e4e25add025394a2484feaf3b2aaeb2807c168ff20f9f29a90c4bc853c3";

// fixed Thai texts — R2.2 (the no-JV text is today's payroll.ts text, kept unchanged: §3 S5 "unchanged text" · qc-hr-h0.1 S4.7 · OQ-1)
const T_NOT_FOUND = "ไม่พบรอบจ่าย";
const T_ALREADY = "รอบนี้กลับรายการไปแล้ว";
const T_NO_JV = "รอบนี้ยังไม่ได้ลงบัญชี — ไม่มีรายการให้กลับ (รอบที่ยังเป็นร่าง ยกเลิกได้ด้วยปุ่ม \"ลบร่าง\")";
const T_BAD_STATUS = "รอบนี้กลับรายการไม่ได้ในสถานะปัจจุบัน";
const FIXED_REVERSE = [T_NOT_FOUND, T_ALREADY, T_NO_JV, T_BAD_STATUS];
const T_DUP = (p: string) => `มีรอบจ่ายงวด ${p} อยู่แล้ว — ลบหรือเลือกงวดอื่น`;
const T_PAID_NEEDS_APPROVED = "ต้องอนุมัติรอบก่อนจึงจ่ายได้";
const T_APPROVE_NOT_DRAFT = "รอบนี้อนุมัติหรือจ่ายไปแล้ว";
const T_LABEL = "เมื่อกลับรายการรอบจ่ายเงินเดือน (HR)";

// ═════════════════════════ registry (id · X-group · sev · title) ═════════════════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Def = readonly [string, string, Sev, string];
const D = (id: string, x: string, sev: Sev, title: string): Def => [`H0.6-${id}`, x, sev, title] as const;
const CHECKS: readonly Def[] = [
  D("S0.1", "-", "MAJOR", "[control] fixture: R1 (period P) created → approved with expect (balanced JV) → markPaid → hr.payroll.paid#R1 hand-delivered ⇒ R1 PAID, the 3 adjustments (OT · DEDUCTION · COMMISSION↔C1) bound to R1, C1 PAID"),
  D("S1.1", "-", "CRITICAL", "reverseRun(ctx, R1, \"เหตุผล\", ACTOR) → {ok:true} · status REVERSED · reversedAt set (≈ now) · reversedById = ACTOR.userId [raw SQL]"),
  D("S1.2", "-", "CRITICAL", "original JV REVERSED · exactly one reversal entry (journal REVERSAL) · its lines are the original's with Dr/Cr swapped per account · balanced"),
  D("S1.3", "-", "CRITICAL", "all 3 adjustments: runId = null · status APPROVED · kind/amount/period unchanged · COMMISSION row keeps crmCommissionId = C1 · C1.hrPayAdjustmentId unchanged"),
  D("S1.4", "-", "CRITICAL", "one audit hr.payroll.reverse (target R1 · actorId = ACTOR) carrying runId · periodKey · adjustmentCount 3 · journalEntryId (original) · reversalEntryId (the reversal)"),
  D("S1.5", "-", "CRITICAL", "exactly one outbox event hr.payroll.reversed for R1 · idempotencyKey hr.payroll.reversed#R1 · tenant T · systemId = the HR system"),
  D("S1.6", "-", "MAJOR", "R1 keeps its items and its 7 totals (history — §6 Q1): item rows + digest byte-identical to before the reverse"),
  D("X8.1", "X8", "CRITICAL", "payload is exactly {runId, periodKey, adjustmentIds} (no other key) · adjustmentIds = the 3 ids (strings, no duplicates) · neither the payload nor the reverse/unpaid audits carry an employee name, a satang amount or a note"),
  D("S2.1", "-", "CRITICAL", "after the reverse, before a new run: payrollRunPeriods(HR) has no P · strandedAdjustments(HR) lists none of the 3 unbound rows (period counts as open again)"),
  D("S2.2", "-", "CRITICAL", "createPayrollRun(P) succeeds ⇒ R2 DRAFT · binds exactly the same 3 adjustment ids · its 7 totals and items digest equal R1's"),
  D("S2.3", "-", "MAJOR", "with R2 live: payrollRunPeriods has P · an APPROVED unbound row inserted into P is listed by strandedAdjustments (a live run takes the period)"),
  D("S2.4", "-", "CRITICAL", "DB: unique index HrPayrollRun_systemId_periodKey_live_key on (systemId, periodKey) WHERE status <> 'REVERSED' · no other unique on (systemId, periodKey) · plain HrPayrollRun_systemId_periodKey_idx · columns reversedAt (timestamp, nullable) + reversedById (text, nullable)"),
  D("S2.5", "-", "MAJOR", "a third createPayrollRun(P) while R2 is live → PayrollInputError with the exact text \"มีรอบจ่ายงวด P อยู่แล้ว — ลบหรือเลือกงวดอื่น\" · still one live run"),
  D("S2.6", "-", "MAJOR", "raw INSERT (rolled back): a second live row for P → unique violation 23505 · an extra REVERSED row for P → accepted (the index only covers live runs)"),
  D("S2.7", "-", "MAJOR", "strandedCommissionAdjustments(T) does not list the unbound COMMISSION row while P has only the REVERSED run (the CRM sweeper must not move it out of P · OQ-4)"),
  D("S3.1", "-", "CRITICAL", "consumers[\"hr.payroll.reversed\"] exists · delivering R1's event (by id) ⇒ C1 PAID → APPROVED · C1.hrPayAdjustmentId unchanged"),
  D("S3.2", "-", "CRITICAL", "exactly one audit crm.commission.unpaid for C1 · before {status PAID} · after {status APPROVED, via PAYROLL_REVERSED, runId R1} · actor null"),
  D("X9.1", "X9", "CRITICAL", "replay: the event delivered again ×2 in a row + ×2 in parallel + onPayrollReversed(…) called directly ({unpaid: 0}) ⇒ C1 byte-identical · still one unpaid audit"),
  D("S3.3", "-", "CRITICAL", "approve(expect) + markPaid R2 → hr.payroll.paid#R2 delivered ⇒ C1 PAID again · observed trail PAID → APPROVED → PAID · one unpaid audit"),
  D("X9.2", "X9", "MAJOR", "late replay after R2 is PAID: hr.payroll.reversed#R1 and hr.payroll.paid#R1 delivered again ⇒ C1 stays PAID · no new unpaid audit (OQ-3)"),
  D("S4.1", "-", "CRITICAL", "clawback (R5) on HR system HB: C3 paid in R0b, clawed back (C3r REVERSED + DEDUCTION D3 bound to R1b) · C2 paid in R1b, clawed back (C2r + D2 in P+1) ⇒ after reverseRun(R1b): C2r, C3r, C3 and D2 byte-identical"),
  D("S4.2", "-", "CRITICAL", "A2 (COMMISSION↔C2) and D3 (DEDUCTION↔C3r) unbound, APPROVED, links intact · R2b = createPayrollRun(P) binds exactly {A2, D3} with R1b's totals"),
  D("S4.3", "-", "MAJOR", "hr.payroll.reversed#R1b delivered ⇒ C2 PAID → APPROVED (pair rule R4 · OQ-2) · reversal rows untouched · R2b paid ⇒ C2 PAID · money nets to zero (C2 + C2r = 0 · A2 in R2b − D2 = 0)"),
  D("S5.1", "-", "CRITICAL", "DRAFT run → {ok:false} with the exact no-JV text (unchanged) · still DRAFT · no reversal, no event"),
  D("S5.2", "-", "CRITICAL", "second reverse of R1 → exact \"รอบนี้กลับรายการไปแล้ว\" · still one reversal entry and one event"),
  D("S5.3", "-", "MAJOR", "DRAFT that carries a journalEntryId → exact \"รอบนี้กลับรายการไม่ได้ในสถานะปัจจุบัน\" · still DRAFT · journalEntryId unchanged"),
  D("S5.4", "-", "CRITICAL", "reverseEntry throws (journalEntryId points at a missing entry) ⇒ {ok:false} with a fixed Thai note (not the thrown message) · run APPROVED · adjustments still bound · no event · no hr.payroll.reverse success audit (tx rolled back)"),
  D("S5.5", "-", "MAJOR", "refusal audits (H0.1 style): one row per refusal of S5.1 · S5.2 · S5.3 — action hr.payroll.reverse(.refused), target = the run, a refusal code, actorId = ACTOR"),
  D("S5.6", "-", "MAJOR", "[static] reverseRun body never returns a raw error text: no `.message`, no String(e), no ${e…} interpolation"),
  D("X1.1", "X1", "CRITICAL", "reverseRun of R1 from the other tenant's ctx and from the same tenant's other HR system → exact \"ไม่พบรอบจ่าย\" · R1 untouched"),
  D("X1.2", "X1", "CRITICAL", "hr.payroll.reversed with R1's payload delivered under the other tenant + onPayrollReversed({other tenant, R1 ids}) ⇒ 0 changes · C1 untouched"),
  D("X1.3", "X1", "MAJOR", "HR facade adjustmentsByIds(ctx, ids) returns {id, crmCommissionId} rows only for ids of this tenant + system (other tenant's / other system's ids dropped · OQ-6)"),
  D("S6.0", "X6", "MAJOR", "[control] 2 worker PROCESSES (own pool each, 5 lanes each = 10 connections) answered every lane of all 12 rounds behind the GO barrier"),
  D("X6.1", "X6", "CRITICAL", "10 ∥ reverseRun on one run ×3: exactly 1 ok · 9 × exact \"รอบนี้กลับรายการไปแล้ว\" · 1 reversal entry · 1 hr.payroll.reversed event · adjustments unbound · no throw"),
  D("X6.2", "X6", "CRITICAL", "5 reverseRun ∥ 5 createPayrollRun(same period) ×3: 1 reverse ok · creates refused only with the dup text · ≤1 live run · afterwards the period has exactly one live run (a sequential create when no lane won) that binds every adjustment of the period"),
  D("X6.3", "X6", "CRITICAL", "5 markPaid ∥ 5 reverseRun ×3: 1 reverse ok · final REVERSED · 1 reversal entry · hr.payroll.paid events = markPaid ok count ≤ 1 · 1 reversed event · refusals fixed texts"),
  D("X6.4", "X6", "CRITICAL", "5 approveRun(expect) ∥ 5 reverseRun on a DRAFT ×3: exactly one approve ok and one JV · reverse ok ⇒ REVERSED + 1 reversal · else APPROVED, 0 reversal, every reverse refused with the exact no-JV text · never two JVs"),
  D("S6.5", "X6", "CRITICAL", "ledger after everything (qc-payroll-reverse semantics): every REVERSED run's JV is REVERSED with exactly one mirrored reversal · live runs' JVs POSTED, no reversal · ΣDr = ΣCr · one hr.payroll.reversed event per REVERSED run, none for live runs"),
  D("S7.1", "X8", "CRITICAL", "tenant without an ACCOUNT system: approved run (no JV) → exact no-JV text · still APPROVED · adjustment still bound"),
  D("S7.2", "X8", "CRITICAL", "run with a JV whose ACCOUNT system is deleted afterwards (controller default) → {ok:true} · REVERSED · adjustment unbound · event · audit carries jvReversed:false · the JV untouched (no reversal entry)"),
  D("S8.1", "-", "CRITICAL", "[static] consumer map \"hr.payroll.reversed\": crmFirst(crmCommissionBridge(\"onPayrollReversed\"), withAutomation(…)) · bridge exports onPayrollReversed → crm.commissions.onPayrollReversed · commissions.ts exports onPayrollReversed inside a `HR H0.6 ▸` block · payroll.ts exports adjustmentsByIds · hr/index.ts re-exports it"),
  D("S8.2", "-", "CRITICAL", "[static] webhook label { value: \"hr.payroll.reversed\", label: \"เมื่อกลับรายการรอบจ่ายเงินเดือน (HR)\" } exactly once across webhooks/labels + automation/labels · every src file that lists \"hr.payroll.paid\" also lists \"hr.payroll.reversed\""),
  D("S8.3", "-", "CRITICAL", "[static] migration 20261202000000_hr_payroll_run_live_unique: DROP old unique · partial unique WHERE status <> 'REVERSED' · plain index · reversedAt + reversedById columns · schema: no @@unique([systemId, periodKey]), @@index([systemId, periodKey]), reversedAt DateTime?, reversedById String?"),
  D("S8.4", "-", "CRITICAL", "[static] FREEZE: payroll-rules.ts sha256 (F16.2) · computeItem body sha256 · markPaid block sha256 = base"),
  D("S8.5", "-", "MAJOR", "[static] vs base: crm/commissions.ts · crm-bridges/commissions.ts · outbox-consumers.ts · webhooks/labels.ts each changed, every hunk carries `HR H0.6` · commissions.ts append-only (no line removed)"),
  D("S8.6", "-", "MAJOR", "[static] reverseRun(ctx, runId, reason?, actor?: PayrollActor) · tenantDb(ctx).$transaction · period advisory lock + FOR UPDATE re-read · reverseEntry(…, tx) (4 args) · emitOutbox hr.payroll.reversed in the body · reverseRunAction passes the actor"),
  D("Z1", "-", "MAJOR", "residue: throwaway tenants and every tenantId row (outbox, audit, CRM, account, HR) are gone"),
];

if (LIST) {
  console.log(`${SUITE} — ${CHECKS.length} checks (id · X · sev · title)`);
  for (const [id, x, sev, t] of CHECKS) console.log(`${id}\t${x}\t${sev}\t${t}`);
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
  const bad = [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u.includes(QC4_HOST_MARK));
  if (bad.length) {
    console.error(`🔴 ${SUITE}: writes only on QC4 (${QC4_HOST_MARK}) — ${bad.map(([n]) => n).join(", ")} is not (nothing written)`);
    process.exit(4);
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const errText = (e: unknown) => `${(e as Any)?.name ?? "Error"}(${(e as Any)?.code ?? "-"}): ${(e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 200)}`;

// ═════════════════════════ WORKER MODE (own process = own Prisma pool) ═════════════════════════
//   argv: --h06-worker <base64url(JSON { tenantId, sys, actor, rounds: { fn, a }[][] })>
//   prints `H06READY` once its pool is warm, then per stdin line `GO <i>` runs round i's lanes in parallel and prints
//   `H06ROUND <i> {"at":…,"res":[…]}` · `END` = disconnect + exit. No wall-clock window: the parent releases each round.
if (WORKER_AT >= 0) {
  const arg = JSON.parse(Buffer.from(String(ARGV[WORKER_AT + 1]), "base64url").toString("utf8")) as { tenantId: string; sys: string; actor: Any; rounds: { fn: string; a: Any }[][] };
  const PW = ((await import("@/lib/core/db" as string)) as Any).prisma as Any;
  const PAYW = (await import("@/lib/modules/hr/payroll" as string)) as Any;
  // open ≥ 6 pool connections before the first round (each lane holds its own transaction)
  await Promise.all(Array.from({ length: 6 }, () => PW.$queryRawUnsafe("SELECT 1 AS one FROM pg_sleep(0.3)")));
  const ctx = { tenantId: arg.tenantId, systemId: arg.sys };
  const one = async (c: { fn: string; a: Any }): Promise<string> => {
    try {
      if (c.fn === "reverse") {
        const r = await PAYW.reverseRun(ctx, c.a.runId, "แข่งกลับรายการ (ข้อสอบ H0.6)", arg.actor);
        return r?.ok === true ? "OK" : `NO:${String(r?.note ?? r?.reason ?? "")}`;
      }
      if (c.fn === "create") {
        const r = await PAYW.createPayrollRun(ctx, { periodKey: c.a.periodKey, payDate: new Date(c.a.payDate) });
        return `OK:${r?.id}`;
      }
      if (c.fn === "markPaid") {
        const r = await PAYW.markPaid(ctx, c.a.runId);
        return r?.ok === true ? "OK" : `NO:${String(r?.note ?? "")}`;
      }
      if (c.fn === "approve") {
        const r = await PAYW.approveRun(ctx, c.a.runId, c.a.expect, arg.actor);
        return r?.ok === true ? "OK" : `NO:${String(r?.note ?? "")}`;
      }
      return "ERR:unknown-fn";
    } catch (e) {
      if (c.fn === "create" && (e as Any)?.name === "PayrollInputError") return `NO:${(e as Error).message}`;
      return `ERR:${errText(e)}`;
    }
  };
  console.log("H06READY");
  const rl = createInterface({ input: process.stdin });
  for await (const raw of rl) {
    const line = String(raw).trim();
    const m = /^GO (\d+)$/.exec(line);
    if (m) {
      const i = Number(m[1]);
      const at = Date.now();
      const res = await Promise.all((arg.rounds[i] ?? []).map(one));
      console.log(`H06ROUND ${i} ${JSON.stringify({ at, res })}`);
      continue;
    }
    if (line === "END") break;
  }
  await PW.$disconnect();
  process.exit(0);
}

// ═════════════════════════ SKIP guard (static — before any DB connection) ═════════════════════════
const rd = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const PAY_SRC = rd(PAY_FILE);
const CRM_SRC = rd(CRM_FILE);
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, MIG_FILE))) skipReasons.push(`${MIG_FILE}: partial unique index migration absent`);
if (!/export async function onPayrollReversed\(/.test(CRM_SRC)) skipReasons.push(`${CRM_FILE}: onPayrollReversed absent`);
if (!/export async function adjustmentsByIds\(/.test(PAY_SRC)) skipReasons.push(`${PAY_FILE}: adjustmentsByIds absent`);
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: H0.6 not built: partial unique index / onPayrollReversed / adjustmentsByIds absent`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], findings: [], skipped: true, reason: skipReasons, registered: CHECKS.length })}`);
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — running although ${skipReasons.length} prerequisite(s) are missing (expected: RED for the right reason, no crash)`);

// ═════════════════════════ harness ═════════════════════════
const TITLE = new Map(CHECKS.map(([id, , , t]) => [id, t]));
const SEV = new Map(CHECKS.map(([id, , s]) => [id, s]));
const results = new Map<string, { ok: boolean; sev: Sev }>();
function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  const full = `H0.6-${id}`;
  if (!TITLE.has(full)) throw new Error(`check id not registered: ${id}`);
  results.set(full, { ok: !!ok, sev: SEV.get(full)! });
  console.log(`  ${ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)}${ok ? "" : ` — expected ${String(expected)} | actual ${String(actual)}`}`);
  return !!ok;
}
const short = (v: unknown, n = 260) => {
  try {
    const s = typeof v === "string" ? v : (JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)) ?? "undefined");
    return s.length > n ? `${s.slice(0, n)}…` : s;
  } catch {
    return String(v).slice(0, n);
  }
};
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => {
    if (typeof x === "bigint") return x.toString();
    if (x instanceof Date) return x.toISOString();
    if (x && typeof x === "object" && !Array.isArray(x)) return Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Any)[k]]));
    return x;
  }) ?? "undefined";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const squash = (s: string) => s.replace(/\s+/g, " ");
const THAI = /[฀-๿]/;
const seg = (src: string, a: string, b: string, inc: boolean) => {
  const i = src.indexOf(a);
  if (i < 0) return "";
  const j = src.indexOf(b, i + a.length);
  return j < 0 ? "" : src.slice(i, j + (inc ? b.length : 0));
};
/** body of `export async function name(` up to the next top-level `\nexport ` */
function fnBody(src: string, name: string): string {
  const i = src.indexOf(`export async function ${name}(`);
  if (i < 0) return "";
  const j = src.indexOf("\nexport ", i + 10);
  return src.slice(i, j < 0 ? undefined : j);
}
/** argument texts of the first call `name(` in src (depth-0 commas) — [] when absent */
function callArgs(src: string, name: string): string[] {
  const i = src.indexOf(`${name}(`);
  if (i < 0) return [];
  let depth = 0;
  let cur = "";
  const out: string[] = [];
  for (let k = i + name.length; k < src.length; k += 1) {
    const ch = src[k]!;
    if (ch === "(" || ch === "{" || ch === "[") {
      depth += 1;
      if (depth === 1 && ch === "(") continue;
    } else if (ch === ")" || ch === "}" || ch === "]") {
      depth -= 1;
      if (depth === 0) {
        if (cur.trim()) out.push(cur.trim());
        return out;
      }
    } else if (ch === "," && depth === 1) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  return out;
}

type Res = { kind: "OK" | "NO" | "THROW" | "MISSING"; v?: Any; msg: string; name?: string };
/** service call: {ok:true} = OK · {ok:false} = NO (note/reason) · throw = THROW · function absent = MISSING */
const call = async (fn: Any, ...args: Any[]): Promise<Res> => {
  if (typeof fn !== "function") return { kind: "MISSING", msg: "MISSING (function absent)" };
  try {
    const v = await fn(...args);
    return v?.ok === true ? { kind: "OK", v, msg: String(v?.note ?? v?.reason ?? "") } : { kind: "NO", v, msg: String(v?.note ?? v?.reason ?? "") };
  } catch (e) {
    return { kind: "THROW", msg: errText(e), name: (e as Any)?.name };
  }
};
/** raw call (returns the value) — throw / absent recorded */
const raw = async (fn: Any, ...args: Any[]): Promise<{ ok: boolean; v?: Any; err: string }> => {
  if (typeof fn !== "function") return { ok: false, err: "MISSING (function absent)" };
  try {
    return { ok: true, v: await fn(...args), err: "" };
  } catch (e) {
    return { ok: false, err: errText(e) };
  }
};
const rs = (r: Res) => `${r.kind}${r.msg ? `:${r.msg.slice(0, 140)}` : ""}`;
/** first value under `key` anywhere in o (depth-first) */
const deepGet = (o: Any, key: string): Any => {
  if (!o || typeof o !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(o, key)) return o[key];
  for (const v of Object.values(o)) {
    const r = deepGet(v, key);
    if (r !== undefined) return r;
  }
  return undefined;
};
const numLeaves = (o: Any, out: number[] = []): number[] => {
  if (typeof o === "number") out.push(o);
  else if (o && typeof o === "object") for (const v of Object.values(o)) numLeaves(v, out);
  return out;
};

// ═════════════════════════ S5.6 + S8 static ═════════════════════════
function runStatic(): void {
  const pay = PAY_SRC;
  const rev = fnBody(pay, "reverseRun");
  // S5.6
  {
    const bad = [/\.message\b/, /String\(\s*(e|err|error)\s*\)/, /\$\{\s*(e|err|error)\b/].filter((re) => re.test(rev)).map((re) => re.source);
    chk("S5.6", !!rev && bad.length === 0, "no .message / String(e) / ${e} in reverseRun", rev ? `found ${bad.join(" · ")}` : "reverseRun absent");
  }
  // S8.1
  {
    const cons = rd(CONSUMERS_FILE);
    const consLine = /"hr\.payroll\.reversed"\s*:\s*crmFirst\(\s*crmCommissionBridge\(\s*"onPayrollReversed"\s*(as\s+\w+\s*)?\)\s*,\s*withAutomation\(\s*async\s*\(\)\s*=>\s*\{\s*\}\s*\)\s*\)/.test(cons);
    const br = rd(BRIDGE_FILE);
    const brFn = fnBody(br, "onPayrollReversed");
    const bridge = /export async function onPayrollReversed\(\s*evt\s*:\s*BridgeEvent\s*\)/.test(br) && /crm\.commissions\.onPayrollReversed\(/.test(brFn);
    const crmAt = CRM_SRC.indexOf("export async function onPayrollReversed(");
    const marker = crmAt > 0 ? CRM_SRC.lastIndexOf("HR H0.6 ▸", crmAt) : -1;
    const crmMarked = crmAt > 0 && marker > 0 && !CRM_SRC.slice(marker, crmAt).includes("◂");
    const payFn = /export async function adjustmentsByIds\(/.test(pay);
    const idx = rd(HR_INDEX);
    const reexp = /export\s*\{[^}]*\badjustmentsByIds\b[^}]*\}\s*from\s*"\.\/payroll"/.test(idx);
    chk("S8.1", consLine && bridge && crmMarked && payFn && reexp, "consumer line · bridge · marked CRM fn · payroll fn · facade re-export", `consumer=${consLine} bridge=${bridge} crmFn=${crmAt > 0} marked=${crmMarked} payrollFn=${payFn} facade=${reexp}`);
  }
  // S8.2
  {
    const wl = rd(WEBHOOK_LABELS);
    const al = rd(AUTOMATION_LABELS);
    const exact = wl.split(`{ value: "hr.payroll.reversed", label: "${T_LABEL}" }`).length - 1;
    const total = (wl.split('"hr.payroll.reversed"').length - 1) + (al.split('"hr.payroll.reversed"').length - 1);
    const files: string[] = [];
    const walk = (dir: string) => {
      const abs = join(ROOT, dir);
      if (!existsSync(abs)) return;
      for (const f of readdirSync(abs)) {
        const rel = `${dir}/${f}`;
        const st = statSync(join(ROOT, rel));
        if (st.isDirectory()) walk(rel);
        else if (/\.(ts|tsx)$/.test(f)) files.push(rel);
      }
    };
    walk("src");
    const listsPaid = files.filter((f) => rd(f).includes('"hr.payroll.paid"'));
    const missingTwin = listsPaid.filter((f) => !rd(f).includes('"hr.payroll.reversed"'));
    chk("S8.2", exact === 1 && total === 1 && listsPaid.length > 0 && missingTwin.length === 0, "label once (exact) · declared once across both registries · twin in every file listing hr.payroll.paid", `exact=${exact} declared=${total} paidFiles=${listsPaid.join(",")} missingTwin=${missingTwin.join(",") || "-"}`);
  }
  // S8.3
  {
    const mig = rd(MIG_FILE);
    const m = {
      file: !!mig,
      drop: /DROP INDEX\s+(IF EXISTS\s+)?"HrPayrollRun_systemId_periodKey_key"/.test(mig),
      partial: /CREATE UNIQUE INDEX\s+"HrPayrollRun_systemId_periodKey_live_key"\s+ON\s+"HrPayrollRun"\s*\(\s*"systemId"\s*,\s*"periodKey"\s*\)\s*WHERE\s*\(?\s*"status"\s*<>\s*'REVERSED'/.test(mig),
      plain: /CREATE INDEX\s+"HrPayrollRun_systemId_periodKey_idx"\s+ON\s+"HrPayrollRun"\s*\(\s*"systemId"\s*,\s*"periodKey"\s*\)/.test(mig),
      colAt: /ADD COLUMN\s+"reversedAt"\s+TIMESTAMP\(3\)/.test(mig),
      colBy: /ADD COLUMN\s+"reversedById"\s+TEXT/.test(mig),
    };
    const sch = rd(SCHEMA_FILE);
    const model = seg(sch, "model HrPayrollRun {", "\n}", true);
    const s = {
      model: !!model,
      noUnique: !/@@unique\(\[\s*systemId\s*,\s*periodKey\s*\]\)/.test(model),
      index: /@@index\(\[\s*systemId\s*,\s*periodKey\s*\]\)/.test(model),
      at: /\breversedAt\s+DateTime\?/.test(model),
      by: /\breversedById\s+String\?/.test(model),
    };
    chk("S8.3", Object.values(m).every(Boolean) && Object.values(s).every(Boolean), "migration 6/6 · schema 5/5", `migration ${short(m)} · schema ${short(s)}`);
  }
  // S8.4
  {
    const r = sha(rd(RULES_FILE)) === RULES_SHA;
    const ci = sha(seg(pay, "function computeItem(", "\n}\n", true)) === COMPUTE_ITEM_SHA;
    const mp = sha(seg(pay, "// ── จ่ายแล้ว (APPROVED→PAID) ──", "// ◂ CRM C3.3", true)) === MARKPAID_BLOCK_SHA;
    chk("S8.4", r && ci && mp, "3 hashes = base", `rules=${r} computeItem=${ci} markPaid=${mp}`);
  }
  // S8.5
  {
    const files = [CRM_FILE, BRIDGE_FILE, CONSUMERS_FILE, WEBHOOK_LABELS];
    const why: string[] = [];
    for (const f of files) {
      let diff = "";
      try {
        diff = execFileSync("git", ["diff", "-U0", BASE_REF, "--", f], { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
      } catch (e) {
        why.push(`${f}: git diff failed (${errText(e).slice(0, 80)})`);
        continue;
      }
      const hunks = diff.split(/^@@[^\n]*\n/m).slice(1);
      if (hunks.length === 0) {
        why.push(`${f}: unchanged vs ${BASE_REF}`);
        continue;
      }
      const unmarked = hunks.filter((h) => !h.split("\n").filter((l) => l.startsWith("+")).join("\n").includes("HR H0.6")).length;
      const removed = hunks.reduce((n, h) => n + h.split("\n").filter((l) => l.startsWith("-")).length, 0);
      if (unmarked) why.push(`${f}: ${unmarked}/${hunks.length} hunk(s) without HR H0.6`);
      if (f === CRM_FILE && removed) why.push(`${f}: ${removed} line(s) removed (append-only)`);
    }
    chk("S8.5", why.length === 0, `4 files changed vs ${BASE_REF}, every hunk marked HR H0.6, commissions.ts append-only`, why.join(" · "));
  }
  // S8.6
  {
    const sig = /export async function reverseRun\( ctx: Ctx, runId: string, reason\?: string, actor\?: PayrollActor,? \)/.test(squash(rev));
    const tx = /tenantDb\(ctx\)\.\$transaction\(/.test(rev);
    const lock = /lockRunPeriod\(|pg_advisory_xact_lock/.test(rev);
    const forUpdate = /lockRunRow\(|FOR UPDATE/.test(rev);
    const reArgs = callArgs(rev, "reverseEntry");
    const emits = /emitOutbox\(/.test(rev) && /hr\.payroll\.reversed/.test(rev);
    const act = fnBody(rd(ACT_FILE), "reverseRunAction");
    const actorPassed = callArgs(act, "reverseRun").length === 4;
    chk("S8.6", sig && tx && lock && forUpdate && reArgs.length === 4 && emits && actorPassed, "signature · tx · lock · FOR UPDATE · reverseEntry 4 args · emit · action passes actor",
      `sig=${sig} tx=${tx} lock=${lock} forUpdate=${forUpdate} reverseEntryArgs=${reArgs.length} emit=${emits} actionArgs=${callArgs(act, "reverseRun").length}`);
  }
}

// ═════════════════════════ DB part ═════════════════════════
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const sys = (await import("@/lib/modules/system/service" as string)) as Any;
const hrSvc = (await import("@/lib/modules/hr/service" as string)) as Any;
const PAY = (await import("@/lib/modules/hr/payroll" as string)) as Any;
const DIG = (await import("@/lib/modules/hr/payroll-digest" as string)) as Any;
const GL = (await import("@/lib/modules/account/gl" as string)) as Any;
const HRF = (await import("@/lib/modules/hr" as string).catch(() => ({}))) as Any;
const CM = (await import("@/lib/modules/crm/commissions" as string).catch(() => ({}))) as Any;
const OBX = (await import("@/lib/outbox-consumers" as string).catch(() => ({}))) as Any;
const CONS: Any = OBX.consumers ?? {};

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, "q");
const SLUG = `qc-hr-h0.6-${rand}`;
const OWNER_UID = `qc-h06-owner-${rand}`;
const ACTOR = { userId: OWNER_UID, isOwner: true };
const TENANTS: string[] = [];
const B = (baht: number) => Math.round(baht * 100);
const TOTALS = ["totalGrossSatang", "totalSsoEmployeeSatang", "totalSsoEmployerSatang", "totalWhtSatang", "totalNetSatang", "totalAddSatang", "totalDeductSatang"];
const NAMES: string[] = [];
const GROUP_CRASHES: string[] = [];
const AMOUNTS: number[] = [];
const P_MAIN = "2032-03";
const payDateOf = (p: string, day = 25) => new Date(`${p}-${String(day).padStart(2, "0")}T03:00:00Z`);
const nextP = (p: string, n = 1) => {
  const m = Number(p.slice(5, 7)) - 1 + n;
  return `${Number(p.slice(0, 4)) + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
};

type Ctx = { tenantId: string; systemId: string };
async function emp(ctx: Ctx, name: string, baht: number): Promise<string> {
  NAMES.push(name);
  AMOUNTS.push(B(baht));
  const e = await hrSvc.createEmployee(ctx, { name });
  await PAY.setSalaryProfile(ctx, { employeeId: e.id, baseSalarySatang: B(baht), ssoEligible: true });
  return e.id as string;
}
async function adjApproved(ctx: Ctx, employeeId: string, periodKey: string, kind: string, satang: number, extra: Any = {}): Promise<string> {
  AMOUNTS.push(satang);
  const r = await PAY.requestAdjustment(ctx, { employeeId, periodKey, kind, amountSatang: satang, requestedById: "qc-h06-requester", note: `รายการทดสอบ ${kind}`, ...extra });
  if (!r?.ok) throw new Error(`fixture: requestAdjustment ${short(r)}`);
  const d = await PAY.decideAdjustment(ctx, r.id, "APPROVED", { userId: OWNER_UID, isOwner: true });
  if (!d?.ok) throw new Error(`fixture: decideAdjustment ${short(d)}`);
  return r.id as string;
}
const mkRun = async (ctx: Ctx, periodKey: string): Promise<string> => (await PAY.createPayrollRun(ctx, { periodKey, payDate: payDateOf(periodKey) })).id as string;
const runRow = (id: string) => P.hrPayrollRun.findUnique({ where: { id } });
const digestItems = (runId: string) => P.hrPayrollItem.findMany({ where: { runId }, select: DIG.PAYROLL_DIGEST_SELECT });
const expectOf = async (runId: string) => {
  const r = await runRow(runId);
  const items = await digestItems(runId);
  return { totalNetSatang: Number(r?.totalNetSatang ?? 0), itemCount: items.length, totalGrossSatang: Number(r?.totalGrossSatang ?? 0), itemsDigest: DIG.payrollItemsDigest(items) as string };
};
const approve = async (ctx: Ctx, runId: string) => PAY.approveRun(ctx, runId, await expectOf(runId), ACTOR);
const itemsState = async (runId: string) => stable(await P.hrPayrollItem.findMany({ where: { runId }, orderBy: { employeeId: "asc" } }));
const totalsOf = (r: Any) => stable(Object.fromEntries(TOTALS.map((t) => [t, r?.[t]])));
const boundIds = async (runId: string) => ((await P.hrPayAdjustment.findMany({ where: { runId }, select: { id: true }, orderBy: { id: "asc" } })) as Any[]).map((a) => a.id as string).sort();
const adjRows = async (ids: string[]) => (await P.hrPayAdjustment.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } })) as Any[];
const revCols = async (runId: string): Promise<{ ok: boolean; at?: Date | null; by?: string | null; err?: string }> => {
  try {
    const rows = (await P.$queryRawUnsafe(`SELECT "reversedAt", "reversedById" FROM "HrPayrollRun" WHERE "id" = $1`, runId)) as Any[];
    return { ok: true, at: rows[0]?.reversedAt ?? null, by: rows[0]?.reversedById ?? null };
  } catch (e) {
    return { ok: false, err: errText(e) };
  }
};
const linesOf = (entryId: string) => P.accountJournalLine.findMany({ where: { entryId } }) as Promise<Any[]>;
const balanced = (lines: Any[]) => {
  const dr = lines.reduce((s, l) => s + Number(l.debit), 0);
  const cr = lines.reduce((s, l) => s + Number(l.credit), 0);
  return dr === cr && dr > 0;
};
/** original + reversal net to zero on every account, both balanced */
const mirrored = async (origId: string, revId: string) => {
  const a = await linesOf(origId);
  const b = await linesOf(revId);
  const net = new Map<string, number>();
  for (const l of [...a, ...b]) net.set(l.accountId, (net.get(l.accountId) ?? 0) + Number(l.debit) - Number(l.credit));
  return balanced(a) && balanced(b) && a.length === b.length && [...net.values()].every((v) => v === 0);
};
const reversalsOf = (entryId: string) => P.accountJournalEntry.findMany({ where: { reversalOfId: entryId } }) as Promise<Any[]>;
const evOf = (tenantId: string, key: string) => P.outboxEvent.findMany({ where: { tenantId, idempotencyKey: key } }) as Promise<Any[]>;
const auditsOf = (tenantId: string, runId: string) => P.auditLog.findMany({ where: { tenantId, targetId: runId, action: { startsWith: "hr.payroll.reverse" } }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
const isRefusalAudit = (a: Any) => String(a.action).endsWith(".refused") || deepGet({ b: a.before, a: a.after }, "refused") !== undefined || deepGet({ b: a.before, a: a.after }, "code") !== undefined;
const successAudits = async (tenantId: string, runId: string) => (await auditsOf(tenantId, runId)).filter((a) => a.action === "hr.payroll.reverse" && !isRefusalAudit(a));
const refusalAudits = async (tenantId: string, runId: string) => (await auditsOf(tenantId, runId)).filter(isRefusalAudit);
/** hand-deliver one of OUR outbox rows to the consumer map (whatever its status) */
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
const deliverKey = async (tenantId: string, key: string) => {
  const evs = await evOf(tenantId, key);
  const out: { ok: boolean; err: string }[] = [];
  for (const e of evs) out.push(await deliver(e));
  return { n: evs.length, out };
};
const comm = (id: string) => P.crmCommission.findUnique({ where: { id } });
const unpaidAudits = (tenantId: string, id: string) => P.auditLog.findMany({ where: { tenantId, action: "crm.commission.unpaid", targetId: id } }) as Promise<Any[]>;
const sameIds = (a: string[], b: string[]) => stable([...a].sort()) === stable([...b].sort());

// ── worker harness (S6) ──
type Wk = { ch: Any; lines: string[]; buf: string; err: string; exited: number | null };
function spawnWorker(arg: Any): Wk {
  const enc = Buffer.from(JSON.stringify(arg), "utf8").toString("base64url");
  const tsxBin = join(ROOT, "node_modules/.bin/tsx");
  const [bin, args] = existsSync(tsxBin) ? [tsxBin, [THIS_FILE, "--h06-worker", enc]] : ["pnpm", ["exec", "tsx", THIS_FILE, "--h06-worker", enc]];
  const ch = spawn(bin as string, args as string[], { env: process.env, cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
  const w: Wk = { ch, lines: [], buf: "", err: "", exited: null };
  ch.stdout.on("data", (d: Buffer) => {
    w.buf += String(d);
    for (let k = w.buf.indexOf("\n"); k >= 0; k = w.buf.indexOf("\n")) {
      w.lines.push(w.buf.slice(0, k));
      w.buf = w.buf.slice(k + 1);
    }
  });
  ch.stderr.on("data", (d: Buffer) => (w.err = (w.err + String(d)).slice(-800)));
  ch.on("close", (code: number | null) => (w.exited = code ?? -1));
  ch.on("error", (e: Error) => {
    w.err += ` spawn error ${e.message}`;
    w.exited = -2;
  });
  return w;
}
async function waitLine(w: Wk, pred: (l: string) => boolean, ms: number): Promise<string | null> {
  const t0 = Date.now();
  for (;;) {
    const i = w.lines.findIndex(pred);
    if (i >= 0) return w.lines.splice(i, 1)[0]!;
    if (w.exited !== null || Date.now() - t0 > ms) return null;
    await sleep(250);
  }
}

async function runDb(): Promise<void> {
  const t = await P.tenant.create({ data: { name: "QC HR H0.6", slug: SLUG } });
  TENANTS.push(t.id);
  const T = t.id as string;
  const t2 = await P.tenant.create({ data: { name: "QC HR H0.6 other", slug: `${SLUG}-b` } });
  TENANTS.push(t2.id);
  const T2 = t2.id as string;
  const H = (await sys.createSystem(T, "HR", "HR main")).id as string;
  const HB = (await sys.createSystem(T, "HR", "HR clawback")).id as string;
  const HX = (await sys.createSystem(T, "HR", "HR races")).id as string;
  const HO = (await sys.createSystem(T, "HR", "HR other")).id as string;
  const ACC = (await sys.createSystem(T, "ACCOUNT", "บัญชี")).id as string;
  await GL.ensureAccounting({ tenantId: T, systemId: ACC });
  const CRM = (await sys.createSystem(T, "CRM", "CRM คอมมิชชัน")).id as string;
  await P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify({ uiVersion: 2, bridgesEnabled: true, commission: { basis: "PAID", approvalRequired: false, payrollLink: true } }), CRM);
  const H2 = (await sys.createSystem(T2, "HR", "HR other tenant")).id as string;
  const cH: Ctx = { tenantId: T, systemId: H };
  const cHB: Ctx = { tenantId: T, systemId: HB };
  const cHX: Ctx = { tenantId: T, systemId: HX };
  const cHO: Ctx = { tenantId: T, systemId: HO };
  const cH2: Ctx = { tenantId: T2, systemId: H2 };
  const cCRM = { tenantId: T, systemId: CRM, actorUserId: OWNER_UID };
  const reverse = (ctx: Ctx, runId: string, why = "เหตุผล") => call(PAY.reverseRun, ctx, runId, why, ACTOR);
  /** a CRM commission row the C3.3 way (raw APPROVED row) + its HR adjustment through requestAdjustment(crmCommissionId) */
  const mkCommission = async (label: string, amount: number, period: string): Promise<string> => {
    AMOUNTS.push(amount);
    return (await P.crmCommission.create({
      data: { tenantId: T, systemId: CRM, dealId: `${SLUG}-deal-${label}`, ruleId: `${SLUG}-rule`, userId: `qc-h06-sales-${rand}`, amountSatang: BigInt(amount), basisSatang: BigInt(amount * 10),
        basis: "PAID", status: "APPROVED", periodKey: period, refType: "DEAL_PAYMENT", refId: `${SLUG}-pay-${label}#c1`, decidedAt: new Date() },
    })).id as string;
  };
  const linkCommission = async (ctx: Ctx, cid: string, employeeId: string, period: string, amount: number): Promise<string> => {
    const r = await PAY.requestAdjustment(ctx, { employeeId, periodKey: period, kind: "COMMISSION", amountSatang: amount, note: `ค่าคอมมิชชัน CRM (ข้อสอบ) · อ้างอิง ${cid}`, requestedById: "qc-h06-requester", crmCommissionId: cid });
    if (!r?.ok) throw new Error(`fixture: commission adjustment ${short(r)}`);
    const d = await PAY.decideAdjustment(ctx, r.id, "APPROVED", { userId: OWNER_UID, isOwner: true });
    if (!d?.ok) throw new Error(`fixture: decide commission adjustment ${short(d)}`);
    await P.crmCommission.update({ where: { id: cid }, data: { hrPayAdjustmentId: r.id } });
    return r.id as string;
  };
  const group = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      const m = `${name}: ${errText(e)}`;
      GROUP_CRASHES.push(m);
      console.log(`💥 group ${m}`);
    }
  };
  let R1 = "";
  let JE1 = "";
  let ADJ3: string[] = [];
  let aOT = "";
  let aCOM = "";
  let C1 = "";
  let e1 = "";
  let R2: string | null = null;
  let r2Err = "";
  let a71 = "";
  let x81: { pl: Any; payloadOk: boolean } = { pl: null, payloadOk: false };
  const payRun = async (ctx: Ctx, runId: string) => {
    const ap = await approve(ctx, runId);
    const mp = await PAY.markPaid(ctx, runId);
    const dl = await deliverKey(ctx.tenantId, `hr.payroll.paid#${runId}`);
    return { ap, mp, dl };
  };

  // ───────── S0 fixture · S1 · S2 · S3 (one sequential story) ─────────
  await group("S0-S3", async () => {
  console.log("── S0 fixture ──");
  e1 = await emp(cH, "สมชาย กลับรายการ", 30_000);
  const e2 = await emp(cH, "สมหญิง กลับรายการ", 18_000);
  aOT = await adjApproved(cH, e1, P_MAIN, "OT", B(1_500));
  const aDED = await adjApproved(cH, e2, P_MAIN, "DEDUCTION", B(500));
  C1 = await mkCommission("c1", B(2_000), P_MAIN);
  aCOM = await linkCommission(cH, C1, e1, P_MAIN, B(2_000));
  ADJ3 = [aOT, aDED, aCOM].sort();
  R1 = await mkRun(cH, P_MAIN);
  const pay1 = await payRun(cH, R1);
  const r1 = await runRow(R1);
  JE1 = (r1?.journalEntryId ?? "") as string;
  const c1Paid = (await comm(C1))?.status;
  const trail: string[] = [String(c1Paid)];
  chk("S0.1", r1?.status === "PAID" && !!JE1 && balanced(await linesOf(JE1)) && sameIds(await boundIds(R1), ADJ3) && c1Paid === "PAID" && pay1.dl.n === 1,
    "PAID · JV · 3 bound · C1 PAID", `status=${r1?.status} jv=${!!JE1} ap=${short(pay1.ap)} mp=${pay1.mp?.ok} paidEvents=${pay1.dl.n} deliver=${short(pay1.dl.out)} bound=${(await boundIds(R1)).length} C1=${c1Paid}`);
  const r1ItemsBefore = await itemsState(R1);
  const r1DigestBefore = DIG.payrollItemsDigest(await digestItems(R1));
  const r1TotalsBefore = totalsOf(r1);
  const adjBefore = await adjRows(ADJ3);

  // ───────── S1 reverse happy path ─────────
  console.log("── S1 reverse ──");
  const tCall = Date.now();
  const rv1 = await reverse(cH, R1, "เหตุผล");
  const r1b = await runRow(R1);
  const cols = await revCols(R1);
  const atOk = cols.ok && cols.at instanceof Date && Math.abs(cols.at.getTime() - tCall) < 3_600_000;
  chk("S1.1", rv1.kind === "OK" && r1b?.status === "REVERSED" && atOk && cols.by === OWNER_UID, "ok · REVERSED · reversedAt ≈ now · reversedById = actor",
    `${rs(rv1)} status=${r1b?.status} cols=${cols.ok ? `at=${cols.at instanceof Date ? cols.at.toISOString() : cols.at} by=${cols.by}` : cols.err}`);
  const je1 = JE1 ? await P.accountJournalEntry.findUnique({ where: { id: JE1 } }) : null;
  const revs1 = JE1 ? await reversalsOf(JE1) : [];
  const mir1 = revs1.length === 1 ? await mirrored(JE1, revs1[0].id) : false;
  chk("S1.2", je1?.status === "REVERSED" && revs1.length === 1 && revs1[0]?.journal === "REVERSAL" && mir1, "REVERSED · 1 REVERSAL · mirrored", `orig=${je1?.status} reversals=${revs1.length} journal=${revs1[0]?.journal} mirrored=${mir1}`);
  {
    const after = await adjRows(ADJ3);
    const same = (a: Any, b: Any) => a.kind === b.kind && a.amountSatang === b.amountSatang && a.periodKey === b.periodKey && a.employeeId === b.employeeId;
    const ok = after.length === 3 && after.every((a: Any, i: number) => a.runId === null && a.status === "APPROVED" && same(a, adjBefore[i])) && after.find((a: Any) => a.id === aCOM)?.crmCommissionId === C1 && (await comm(C1))?.hrPayAdjustmentId === aCOM;
    chk("S1.3", ok, "3 × runId null APPROVED unchanged · link intact", short(after.map((a: Any) => [a.kind, a.status, a.runId ? "bound" : "null", a.crmCommissionId ? "crm" : "-"])));
  }
  {
    const au = await successAudits(T, R1);
    const a = au[0];
    const body = { b: a?.before, a: a?.after };
    const rid = revs1[0]?.id;
    const ok = au.length === 1 && a.actorId === OWNER_UID && deepGet(body, "runId") === R1 && deepGet(body, "periodKey") === P_MAIN && Number(deepGet(body, "adjustmentCount")) === 3 && deepGet(body, "journalEntryId") === JE1 && !!rid && deepGet(body, "reversalEntryId") === rid;
    chk("S1.4", ok, "1 audit with runId/periodKey/adjustmentCount 3/journalEntryId/reversalEntryId · actor", `audits=${au.length} actor=${a?.actorId === OWNER_UID} body=${short(body, 300)}`);
  }
  const ev1 = await evOf(T, `hr.payroll.reversed#${R1}`);
  const evAll1 = (await P.outboxEvent.findMany({ where: { tenantId: T, type: "hr.payroll.reversed" } })) as Any[];
  chk("S1.5", ev1.length === 1 && evAll1.filter((e) => e.payload?.runId === R1).length === 1 && ev1[0]?.type === "hr.payroll.reversed" && ev1[0]?.systemId === H, "1 event · key · systemId",
    `byKey=${ev1.length} byType=${evAll1.length} type=${ev1[0]?.type} sys=${ev1[0]?.systemId === H}`);
  chk("S1.6", (await itemsState(R1)) === r1ItemsBefore && DIG.payrollItemsDigest(await digestItems(R1)) === r1DigestBefore && totalsOf(r1b) === r1TotalsBefore, "items + totals unchanged",
    `items=${(await itemsState(R1)) === r1ItemsBefore} totals=${totalsOf(r1b) === r1TotalsBefore}`);
  {
    const pl = ev1[0]?.payload ?? null;
    const keys = pl ? Object.keys(pl).sort() : [];
    const ids = Array.isArray(pl?.adjustmentIds) ? (pl.adjustmentIds as unknown[]) : [];
    x81 = { pl, payloadOk: stable(keys) === stable(["adjustmentIds", "periodKey", "runId"]) && pl.runId === R1 && pl.periodKey === P_MAIN && ids.every((x) => typeof x === "string") && new Set(ids).size === ids.length && sameIds(ids as string[], ADJ3) };
  }

  // ───────── S2 period freed ─────────
  console.log("── S2 period freed ──");
  {
    const per = await raw(PAY.payrollRunPeriods, cH);
    const st = await raw(PAY.strandedAdjustments, cH, 500);
    const listed = st.ok ? (st.v as Any[]).filter((s) => ADJ3.includes(s.id)).length : -1;
    chk("S2.1", per.ok && !(per.v as string[]).includes(P_MAIN) && st.ok && listed === 0, "P open · none stranded", `periods=${per.ok ? short(per.v) : per.err} strandedOfOurs=${listed}`);
    const sc = await raw(PAY.strandedCommissionAdjustments, T, 500);
    const scListed = sc.ok ? (sc.v as Any[]).some((s) => s.id === aCOM) : true;
    chk("S2.7", sc.ok && !scListed, "A_comm not stranded", sc.ok ? `listed=${scListed} (${(sc.v as Any[]).length} rows)` : sc.err);
  }
  try {
    R2 = await mkRun(cH, P_MAIN);
  } catch (e) {
    r2Err = errText(e);
  }
  {
    const r2 = R2 ? await runRow(R2) : null;
    const ok = !!r2 && r2.status === "DRAFT" && sameIds(await boundIds(R2!), ADJ3) && totalsOf(r2) === r1TotalsBefore && DIG.payrollItemsDigest(await digestItems(R2!)) === r1DigestBefore;
    chk("S2.2", ok, "R2 DRAFT · same 3 ids · totals + digest = R1", R2 ? `status=${r2?.status} bound=${(await boundIds(R2)).length} totals=${totalsOf(r2) === r1TotalsBefore}` : `create threw: ${r2Err}`);
  }
  {
    const per = await raw(PAY.payrollRunPeriods, cH);
    let extra: string | null = null;
    let listed = false;
    if (R2) {
      extra = (await P.hrPayAdjustment.create({ data: { tenantId: T, systemId: H, employeeId: e2, periodKey: P_MAIN, kind: "BONUS", amountSatang: 777, status: "APPROVED", decidedById: OWNER_UID, decidedAt: new Date(), requestedById: "qc-h06-requester" } })).id as string;
      const st = await raw(PAY.strandedAdjustments, cH, 500);
      listed = st.ok && (st.v as Any[]).some((s) => s.id === extra);
      await P.hrPayAdjustment.delete({ where: { id: extra } });
    }
    chk("S2.3", !!R2 && per.ok && (per.v as string[]).includes(P_MAIN) && listed, "P taken · extra row stranded", `R2=${!!R2} periods=${per.ok ? short(per.v) : per.err} extraListed=${listed}`);
  }
  {
    const idx = (await P.$queryRawUnsafe(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'HrPayrollRun'`)) as Any[];
    const onPair = (d: string) => /\(\s*"systemId"\s*,\s*"periodKey"\s*\)/.test(d);
    const live = idx.find((i) => i.indexname === "HrPayrollRun_systemId_periodKey_live_key");
    const liveOk = !!live && /CREATE UNIQUE INDEX/i.test(live.indexdef) && onPair(live.indexdef) && /WHERE\s*\(\s*status\s*<>\s*'REVERSED'/i.test(live.indexdef);
    const otherUnique = idx.filter((i) => i !== live && /CREATE UNIQUE INDEX/i.test(i.indexdef) && onPair(i.indexdef)).map((i) => i.indexname);
    const plain = idx.find((i) => i.indexname === "HrPayrollRun_systemId_periodKey_idx" && !/UNIQUE/i.test(i.indexdef) && onPair(i.indexdef));
    const colsI = (await P.$queryRawUnsafe(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'HrPayrollRun' AND column_name IN ('reversedAt','reversedById')`)) as Any[];
    const cAt = colsI.find((c) => c.column_name === "reversedAt");
    const cBy = colsI.find((c) => c.column_name === "reversedById");
    const colOk = /timestamp/i.test(String(cAt?.data_type)) && cAt?.is_nullable === "YES" && /text|character varying/i.test(String(cBy?.data_type)) && cBy?.is_nullable === "YES";
    chk("S2.4", liveOk && otherUnique.length === 0 && !!plain && colOk, "partial unique · no plain unique · _idx · 2 nullable columns",
      `live=${live ? live.indexdef : "absent"} otherUnique=${otherUnique.join(",") || "-"} plain=${!!plain} cols=${short(colsI)}`);
  }
  {
    let msg = "";
    let made = "";
    if (R2) {
      try {
        made = await mkRun(cH, P_MAIN);
      } catch (e) {
        msg = (e as Any)?.name === "PayrollInputError" ? (e as Error).message : `THROW ${errText(e)}`;
      }
    }
    const live = (await P.hrPayrollRun.count({ where: { systemId: H, periodKey: P_MAIN, status: { not: "REVERSED" } } })) as number;
    chk("S2.5", !!R2 && !made && msg === T_DUP(P_MAIN) && live === 1, "exact dup text · 1 live run", `R2=${!!R2} created=${made || "-"} msg=${msg || "-"} live=${live}`);
  }
  {
    const tryInsert = async (status: string): Promise<string> => {
      try {
        await P.$transaction(async (tx: Any) => {
          await tx.$executeRawUnsafe(`INSERT INTO "HrPayrollRun" ("id","tenantId","systemId","periodKey","payDate","status") VALUES ($1,$2,$3,$4,$5,$6::"PayrollRunStatus")`,
            `qc-h06-ins-${rand}-${status.toLowerCase()}`, T, H, P_MAIN, payDateOf(P_MAIN), status);
          throw new Error("QC_ROLLBACK");
        });
        return "COMMITTED";
      } catch (e) {
        const m = errText(e);
        if (/QC_ROLLBACK/.test(m)) return "ACCEPTED";
        if ((e as Any)?.meta?.code === "23505" || /23505|unique constraint/i.test(m)) return "UNIQUE";
        return `ERR ${m}`;
      }
    };
    const liveIns = R2 ? await tryInsert("DRAFT") : "no R2";
    const revIns = await tryInsert("REVERSED");
    const leftover = (await P.hrPayrollRun.count({ where: { id: { startsWith: `qc-h06-ins-${rand}` } } })) as number;
    chk("S2.6", liveIns === "UNIQUE" && revIns === "ACCEPTED" && leftover === 0, "live → UNIQUE · REVERSED → ACCEPTED (rolled back)", `live=${liveIns} reversed=${revIns} leftover=${leftover}`);
  }

  // ───────── S3 CRM un-pay ─────────
  console.log("── S3 CRM un-pay ──");
  const consFn = CONS?.["hr.payroll.reversed"];
  {
    const ev = (await evOf(T, `hr.payroll.reversed#${R1}`))[0];
    // X1.2 first half: the same event forged under the other tenant — before the real delivery (C1 still PAID)
    const forged = ev ? await deliver({ ...ev, id: `${ev.id}-forged`, tenantId: T2 }) : { ok: false, err: "no event" };
    const direct = await raw(CM.onPayrollReversed, { tenantId: T2, hrSystemId: H, runId: R1, adjustmentIds: ADJ3 });
    const afterForged = await comm(C1);
    const x12 = afterForged?.status === "PAID" && (await unpaidAudits(T, C1)).length === 0 && (await unpaidAudits(T2, C1)).length === 0 && typeof consFn === "function" && forged.ok && direct.ok && Number(direct.v?.unpaid ?? -1) === 0;
    chk("X1.2", x12, "forged delivery + direct call under T2 ⇒ 0 changes", `consumer=${typeof consFn} forged=${forged.ok ? "ok" : forged.err} direct=${direct.ok ? short(direct.v) : direct.err} C1=${afterForged?.status}`);
    const d = ev ? await deliver(ev) : { ok: false, err: "no hr.payroll.reversed event for R1" };
    const c = await comm(C1);
    trail.push(String(c?.status));
    chk("S3.1", typeof consFn === "function" && d.ok && c?.status === "APPROVED" && c?.hrPayAdjustmentId === aCOM, "consumer · C1 APPROVED · link unchanged", `consumer=${typeof consFn} deliver=${d.ok ? "ok" : d.err} C1=${c?.status} link=${c?.hrPayAdjustmentId === aCOM}`);
    const au = await unpaidAudits(T, C1);
    const a = au[0];
    const ok = au.length === 1 && a.before?.status === "PAID" && a.after?.status === "APPROVED" && a.after?.via === "PAYROLL_REVERSED" && a.after?.runId === R1 && a.actorId === null;
    chk("S3.2", ok, "1 unpaid audit before/after/via/runId · actor null", `audits=${au.length} ${short(a ? { before: a.before, after: a.after, actor: a.actorId } : null)}`);
    const snap0 = stable(await comm(C1));
    const reps: { ok: boolean; err: string }[] = [];
    if (ev) {
      reps.push(await deliver(ev), await deliver(ev));
      reps.push(...(await Promise.all([deliver(ev), deliver(ev)])));
    }
    const dir = await raw(CM.onPayrollReversed, { tenantId: T, hrSystemId: H, runId: R1, adjustmentIds: ADJ3 });
    const snap1 = stable(await comm(C1));
    const au2 = await unpaidAudits(T, C1);
    chk("X9.1", !!ev && reps.length === 4 && reps.every((r) => r.ok) && dir.ok && Number(dir.v?.unpaid ?? -1) === 0 && snap1 === snap0 && au2.length === 1 && c?.status === "APPROVED",
      "4 replays ok · direct {unpaid:0} · unchanged · 1 audit", `replays=${reps.map((r) => (r.ok ? "ok" : r.err.slice(0, 40))).join("|") || "-"} direct=${dir.ok ? short(dir.v) : dir.err} unchanged=${snap1 === snap0} audits=${au2.length}`);
  }
  {
    let paid2: Any = null;
    if (R2) paid2 = await payRun(cH, R2);
    const c = await comm(C1);
    trail.push(String(c?.status));
    const au = await unpaidAudits(T, C1);
    chk("S3.3", !!R2 && paid2?.ap?.ok === true && paid2?.mp?.ok === true && paid2?.dl?.n === 1 && c?.status === "PAID" && stable(trail) === stable(["PAID", "APPROVED", "PAID"]) && au.length === 1,
      "R2 PAID · C1 PAID · trail PAID→APPROVED→PAID · 1 audit", R2 ? `ap=${short(paid2?.ap)} mp=${paid2?.mp?.ok} paidEvents=${paid2?.dl?.n} C1=${c?.status} trail=${trail.join("→")} audits=${au.length}` : `no R2 (${r2Err.slice(0, 120)}) · trail=${trail.join("→")}`);
    const lateRev = await deliverKey(T, `hr.payroll.reversed#${R1}`);
    const latePaid = await deliverKey(T, `hr.payroll.paid#${R1}`);
    const c2 = await comm(C1);
    chk("X9.2", !!R2 && (await runRow(R2))?.status === "PAID" && lateRev.n === 1 && lateRev.out.every((o) => o.ok) && latePaid.out.every((o) => o.ok) && c2?.status === "PAID" && (await unpaidAudits(T, C1)).length === 1,
      "late replays ⇒ C1 PAID · 1 audit", `R2=${R2 ? (await runRow(R2))?.status : "-"} lateRev=${short(lateRev)} latePaid=${short(latePaid)} C1=${c2?.status} audits=${(await unpaidAudits(T, C1)).length}`);
  }
  {
    const au = [...(await successAudits(T, R1)), ...(await unpaidAudits(T, C1))];
    const blob = JSON.stringify([x81.pl, au.map((a) => [a.before, a.after])]);
    const nameLeak = NAMES.filter((n) => blob.includes(n));
    const noteLeak = /รายการทดสอบ|ค่าคอมมิชชัน CRM \(ข้อสอบ\)/.test(blob);
    const amountLeak = numLeaves([x81.pl, au.map((a) => [a.before, a.after])]).filter((x) => AMOUNTS.includes(x));
    chk("X8.1", x81.payloadOk && nameLeak.length === 0 && !noteLeak && amountLeak.length === 0, "exact keys · 3 ids · no name/amount/note (payload + reverse/unpaid audits)",
      `payload=${short(x81.pl)} names=${nameLeak.length} note=${noteLeak} amounts=${amountLeak.join(",") || "-"} audits=${au.length}`);
  }
  });

  // ───────── S5 guards + texts ─────────
  await group("S5", async () => {
  console.log("── S5 guards ──");
  {
    // S5.1 DRAFT
    const p51 = "2032-05";
    const r51 = await mkRun(cH, p51);
    const ref0 = (await refusalAudits(T, r51)).length;
    const res = await reverse(cH, r51);
    const row = await runRow(r51);
    const ev = await evOf(T, `hr.payroll.reversed#${r51}`);
    const ref1 = (await refusalAudits(T, r51)).length;
    chk("S5.1", res.kind === "NO" && res.msg === T_NO_JV && row?.status === "DRAFT" && !row?.journalEntryId && ev.length === 0, "exact no-JV text · DRAFT", `${rs(res)} status=${row?.status} events=${ev.length}`);
    // S5.2 second reverse of R1
    const n0 = (await refusalAudits(T, R1)).length;
    const res2 = await reverse(cH, R1);
    const n1 = (await refusalAudits(T, R1)).length;
    const revs = JE1 ? await reversalsOf(JE1) : [];
    const evs = await evOf(T, `hr.payroll.reversed#${R1}`);
    chk("S5.2", res2.kind === "NO" && res2.msg === T_ALREADY && revs.length === 1 && evs.length === 1, "exact already text · 1 reversal · 1 event", `${rs(res2)} reversals=${revs.length} events=${evs.length}`);
    // S5.3 DRAFT that carries a journalEntryId
    const p53 = "2032-06";
    const r53 = await mkRun(cH, p53);
    const orphan = `qc-h06-orphan-${rand}`;
    await P.hrPayrollRun.update({ where: { id: r53 }, data: { journalEntryId: orphan } });
    const m0 = (await refusalAudits(T, r53)).length;
    const res3 = await reverse(cH, r53);
    const row3 = await runRow(r53);
    const m1 = (await refusalAudits(T, r53)).length;
    chk("S5.3", res3.kind === "NO" && res3.msg === T_BAD_STATUS && row3?.status === "DRAFT" && row3?.journalEntryId === orphan, "exact status text · DRAFT · jv unchanged", `${rs(res3)} status=${row3?.status} jv=${row3?.journalEntryId === orphan}`);
    // S5.5 refusal audits
    const checkRefusal = async (runId: string) => {
      const rows = await refusalAudits(T, runId);
      const last = rows[rows.length - 1];
      return !!last && last.actorId === OWNER_UID && (String(last.action) === "hr.payroll.reverse" || String(last.action) === "hr.payroll.reverse.refused") && typeof deepGet({ b: last.before, a: last.after }, "code") === "string";
    };
    const s55 = { draft: ref1 - ref0 === 1 && (await checkRefusal(r51)), already: n1 - n0 === 1 && (await checkRefusal(R1)), status: m1 - m0 === 1 && (await checkRefusal(r53)) };
    chk("S5.5", s55.draft && s55.already && s55.status, "one refusal row each · code · actor", `${short(s55)} deltas=${ref1 - ref0}/${n1 - n0}/${m1 - m0}`);
    // S5.4 reverseEntry throws inside the tx
    const p54 = "2032-07";
    const a54 = await adjApproved(cH, e1, p54, "BONUS", B(250));
    const r54 = await mkRun(cH, p54);
    const ap54 = await approve(cH, r54);
    const je54 = ((await runRow(r54))?.journalEntryId ?? "") as string;
    await P.hrPayrollRun.update({ where: { id: r54 }, data: { journalEntryId: `qc-h06-missing-entry-${rand}` } });
    const res4 = await reverse(cH, r54);
    const row4 = await runRow(r54);
    const bound4 = await boundIds(r54);
    const ev4 = await evOf(T, `hr.payroll.reversed#${r54}`);
    const succ4 = (await successAudits(T, r54)).length;
    await P.hrPayrollRun.update({ where: { id: r54 }, data: { journalEntryId: je54 || null } });
    const thrown = "ไม่พบรายการบัญชีที่จะกลับ";
    chk("S5.4", ap54?.ok === true && !!je54 && res4.kind === "NO" && THAI.test(res4.msg) && !res4.msg.includes(thrown) && row4?.status === "APPROVED" && sameIds(bound4, [a54]) && ev4.length === 0 && succ4 === 0,
      "fixed note · APPROVED · bound · no event · no success audit", `${rs(res4)} status=${row4?.status} bound=${bound4.length} events=${ev4.length} successAudits=${succ4}`);
  }
  });

  // ───────── S4 clawback (R5) on HB ─────────
  await group("S4", async () => {
  console.log("── S4 clawback ──");
  {
    const P0 = nextP(P_MAIN, -1);
    const eb = await emp(cHB, "สมปอง คืนค่าคอม", 25_000);
    // C3 paid in R0b (P0) then clawed back while P has no run ⇒ C3r + DEDUCTION D3 in P
    const C3 = await mkCommission("c3", B(1_000), P0);
    const A3 = await linkCommission(cHB, C3, eb, P0, B(1_000));
    const R0b = await mkRun(cHB, P0);
    const pay0 = await payRun(cHB, R0b);
    const rv3 = await raw(CM.reverse, cCRM, { refId: `${SLUG}-pay-c3`, reason: "ยกเลิกการรับชำระ (ข้อสอบ H0.6)" });
    const C3r = ((await P.crmCommission.findFirst({ where: { reversedOfId: C3 } })) as Any)?.id as string | undefined;
    const D3row = C3r ? ((await P.hrPayAdjustment.findFirst({ where: { crmCommissionId: C3r } })) as Any) : null;
    if (!C3r || !D3row || D3row.periodKey !== P_MAIN) throw new Error(`fixture S4: clawback of C3 did not produce C3r + DEDUCTION in ${P_MAIN} (paid0=${short(pay0.ap)} reverse=${rv3.ok ? short(rv3.v) : rv3.err} C3r=${C3r ?? "-"} D3=${short(D3row)})`);
    const D3 = D3row.id as string;
    if (D3row.status === "PENDING") await PAY.decideAdjustment(cHB, D3, "APPROVED", { userId: OWNER_UID, isOwner: true });
    // C2 paid in R1b (P) then clawed back ⇒ C2r + D2 in P+1
    const C2 = await mkCommission("c2", B(1_500), P_MAIN);
    const A2 = await linkCommission(cHB, C2, eb, P_MAIN, B(1_500));
    const R1b = await mkRun(cHB, P_MAIN);
    const pay1b = await payRun(cHB, R1b);
    const bound1b = await boundIds(R1b);
    const rv2 = await raw(CM.reverse, cCRM, { refId: `${SLUG}-pay-c2`, reason: "ยกเลิกการรับชำระ (ข้อสอบ H0.6)" });
    const C2r = ((await P.crmCommission.findFirst({ where: { reversedOfId: C2 } })) as Any)?.id as string | undefined;
    const D2row = C2r ? ((await P.hrPayAdjustment.findFirst({ where: { crmCommissionId: C2r } })) as Any) : null;
    if (!C2r || !D2row) throw new Error(`fixture S4: clawback of C2 did not produce C2r + DEDUCTION (reverse=${rv2.ok ? short(rv2.v) : rv2.err})`);
    const fixOk = (await comm(C3))?.status === "PAID" && (await comm(C2))?.status === "PAID" && sameIds(bound1b, [A2, D3]) && pay1b.ap?.ok === true;
    if (!fixOk) console.log(`     ⚠️ S4 fixture: C3=${(await comm(C3))?.status} C2=${(await comm(C2))?.status} R1b bound=${bound1b.length} ap=${short(pay1b.ap)}`);
    const r1bRow = await runRow(R1b);
    const snap = async () => stable({ c2r: await comm(C2r), c3r: await comm(C3r), c3: await comm(C3), d2: await P.hrPayAdjustment.findUnique({ where: { id: D2row.id } }) });
    const before = await snap();
    const rv = await reverse(cHB, R1b);
    const after = await snap();
    chk("S4.1", fixOk && rv.kind === "OK" && after === before && (await comm(C2r))?.status === "REVERSED" && (await comm(C3r))?.status === "REVERSED", "reversal rows + C3 + D2 byte-identical",
      `fixture=${fixOk} reverse=${rs(rv)} unchanged=${after === before} C2r=${(await comm(C2r))?.status} C3r=${(await comm(C3r))?.status} D2=${D2row.periodKey}/${D2row.status}`);
    const rowsAB = await adjRows([A2, D3]);
    const unbound = rowsAB.length === 2 && rowsAB.every((a: Any) => a.runId === null && a.status === "APPROVED") && rowsAB.find((a: Any) => a.id === A2)?.crmCommissionId === C2 && rowsAB.find((a: Any) => a.id === D3)?.crmCommissionId === C3r;
    let R2b: string | null = null;
    let err2b = "";
    try {
      R2b = await mkRun(cHB, P_MAIN);
    } catch (e) {
      err2b = errText(e);
    }
    const r2bRow = R2b ? await runRow(R2b) : null;
    chk("S4.2", unbound && !!R2b && sameIds(await boundIds(R2b!), [A2, D3]) && totalsOf(r2bRow) === totalsOf(r1bRow), "unbound + links · R2b binds {A2, D3} · totals = R1b",
      `unbound=${unbound} R2b=${R2b ? `bound=${(await boundIds(R2b)).length} totals=${totalsOf(r2bRow) === totalsOf(r1bRow)}` : err2b}`);
    const dl = await deliverKey(T, `hr.payroll.reversed#${R1b}`);
    const c2After = (await comm(C2))?.status;
    const revRowsSame = stable({ c2r: await comm(C2r), c3r: await comm(C3r) }) === stable({ c2r: JSON.parse(before).c2r, c3r: JSON.parse(before).c3r });
    let c2Final: string | undefined;
    if (R2b) {
      await payRun(cHB, R2b);
      c2Final = (await comm(C2))?.status;
    }
    const c2a = BigInt((await comm(C2))?.amountSatang ?? 0);
    const c2ra = BigInt((await comm(C2r))?.amountSatang ?? 1);
    const a2a = Number(rowsAB.find((a: Any) => a.id === A2)?.amountSatang ?? 0);
    const d2a = Number(D2row.amountSatang);
    chk("S4.3", dl.n === 1 && dl.out.every((o) => o.ok) && c2After === "APPROVED" && revRowsSame && c2Final === "PAID" && c2a + c2ra === BigInt(0) && a2a - d2a === 0,
      "C2 APPROVED then PAID · reversal rows untouched · nets zero", `deliver=${short(dl)} C2=${c2After}→${c2Final ?? "-"} revRows=${revRowsSame} crmNet=${(c2a + c2ra).toString()} hrNet=${a2a - d2a}`);
    void A3;
  }
  });

  // ───────── S7 no ACCOUNT system ─────────
  await group("S7", async () => {
  console.log("── S7 no ACCOUNT system ──");
  {
    const f = await emp(cH2, "สมศรี ไม่มีบัญชี", 20_000);
    const p71 = "2032-08";
    a71 = await adjApproved(cH2, f, p71, "BONUS", B(300));
    const r71 = await mkRun(cH2, p71);
    const ap = await approve(cH2, r71);
    const res = await reverse(cH2, r71);
    const row = await runRow(r71);
    chk("S7.1", ap?.ok === true && !row?.journalEntryId && res.kind === "NO" && res.msg === T_NO_JV && row?.status === "APPROVED" && sameIds(await boundIds(r71), [a71]), "exact no-JV · APPROVED · bound",
      `ap=${short(ap)} jv=${row?.journalEntryId ?? null} ${rs(res)} status=${row?.status} bound=${(await boundIds(r71)).length}`);
    const ACC2 = (await sys.createSystem(T2, "ACCOUNT", "บัญชีชั่วคราว")).id as string;
    await GL.ensureAccounting({ tenantId: T2, systemId: ACC2 });
    const p72 = "2032-09";
    const a72 = await adjApproved(cH2, f, p72, "BONUS", B(350));
    const r72 = await mkRun(cH2, p72);
    const ap2 = await approve(cH2, r72);
    const je72 = ((await runRow(r72))?.journalEntryId ?? "") as string;
    await P.appSystem.delete({ where: { id: ACC2 } });
    const res2 = await reverse(cH2, r72);
    const row2 = await runRow(r72);
    const ev = await evOf(T2, `hr.payroll.reversed#${r72}`);
    const au = await successAudits(T2, r72);
    const jvRev = au[0] ? deepGet({ b: au[0].before, a: au[0].after }, "jvReversed") : undefined;
    const je = je72 ? await P.accountJournalEntry.findUnique({ where: { id: je72 } }) : null;
    const revs = je72 ? await reversalsOf(je72) : [];
    chk("S7.2", ap2?.ok === true && !!je72 && res2.kind === "OK" && row2?.status === "REVERSED" && (await boundIds(r72)).length === 0 && ((await adjRows([a72]))[0]?.runId ?? "x") === null && ev.length === 1 && au.length === 1 && jvRev === false && je?.status === "POSTED" && revs.length === 0,
      "ok · REVERSED · unbound · event · jvReversed:false · JV untouched", `ap=${ap2?.ok} jv=${!!je72} ${rs(res2)} status=${row2?.status} bound=${(await boundIds(r72)).length} events=${ev.length} audits=${au.length} jvReversed=${jvRev} entry=${je?.status} reversals=${revs.length}`);
  }
  });

  // ───────── X1 cross-scope ─────────
  await group("X1", async () => {
  console.log("── X1 cross-scope ──");
  {
    const before = stable({ run: await runRow(R1), adj: await adjRows(ADJ3), ev: (await evOf(T, `hr.payroll.reversed#${R1}`)).length, revs: JE1 ? (await reversalsOf(JE1)).length : -1 });
    const o1 = await reverse(cH2, R1);
    const o2 = await reverse(cHO, R1);
    const after = stable({ run: await runRow(R1), adj: await adjRows(ADJ3), ev: (await evOf(T, `hr.payroll.reversed#${R1}`)).length, revs: JE1 ? (await reversalsOf(JE1)).length : -1 });
    chk("X1.1", o1.kind === "NO" && o1.msg === T_NOT_FOUND && o2.kind === "NO" && o2.msg === T_NOT_FOUND && after === before, "exact ไม่พบรอบจ่าย ×2 · R1 untouched", `otherTenant=${rs(o1)} otherSystem=${rs(o2)} unchanged=${after === before}`);
    const hbAdj = ((await P.hrPayAdjustment.findFirst({ where: { systemId: HB } })) as Any)?.id as string | undefined;
    const ids = [aOT, aCOM, a71, ...(hbAdj ? [hbAdj] : [])];
    const r = await raw(HRF.adjustmentsByIds, cH, ids);
    const rows = r.ok && Array.isArray(r.v) ? (r.v as Any[]) : [];
    const got = rows.map((x) => String(x?.id));
    const shapeOk = rows.every((x) => x && typeof x.id === "string" && "crmCommissionId" in x);
    const comRow = rows.find((x) => x?.id === aCOM);
    const ok = r.ok && shapeOk && got.every((g) => g === aOT || g === aCOM) && comRow?.crmCommissionId === C1 && !got.includes(a71) && (!hbAdj || !got.includes(hbAdj));
    chk("X1.3", ok, "own rows only · {id, crmCommissionId}", r.ok ? `rows=${short(rows)}` : r.err);
  }
  });

  // ───────── S6 races (2 worker processes) ─────────
  await group("S6", async () => {
  console.log("── S6 races ──");
  const x1 = await emp(cHX, "สมใจ แข่งกัน", 22_000);
  const x2 = await emp(cHX, "สมหมาย แข่งกัน", 16_000);
  type Round = { sc: "X6.1" | "X6.2" | "X6.3" | "X6.4"; period: string; runId: string; adj: string[]; lanes: { fn: string; a: Any }[]; jv0?: number; rv0?: number; jv1?: number; rv1?: number };
  const rounds: Round[] = [];
  const LANES = 10;
  const pat = (a: string, b: string, nA: number, nB: number) => [...Array(nA).fill(a), ...Array(5 - nA).fill(b), ...Array(nB).fill(a), ...Array(5 - nB).fill(b)] as string[];
  for (const [sc, base] of [["X6.1", "2033-01"], ["X6.2", "2033-04"], ["X6.3", "2033-07"], ["X6.4", "2033-10"]] as const) {
    for (let k = 0; k < 3; k += 1) {
      const period = nextP(base, k);
      const adj = [await adjApproved(cHX, k % 2 ? x2 : x1, period, "BONUS", B(100 + k))];
      const runId = await mkRun(cHX, period);
      if (sc !== "X6.4") {
        const ap = await approve(cHX, runId);
        if (!ap?.ok) throw new Error(`fixture X6: approve ${period} ${short(ap)}`);
        if (sc === "X6.1" && k === 0) await PAY.markPaid(cHX, runId);
      }
      const ex = sc === "X6.4" ? await expectOf(runId) : null;
      const fns = sc === "X6.1" ? Array(LANES).fill("reverse") : sc === "X6.2" ? pat("reverse", "create", 3, 2) : sc === "X6.3" ? pat("markPaid", "reverse", 2, 3) : pat("approve", "reverse", 2, 3);
      rounds.push({ sc, period, runId, adj, lanes: fns.map((fn: string) => ({ fn, a: { runId, periodKey: period, payDate: payDateOf(period).toISOString(), expect: ex } })) });
    }
  }
  const mkArg = (from: number) => ({ tenantId: T, sys: HX, actor: ACTOR, rounds: rounds.map((r) => r.lanes.slice(from, from + 5)) });
  const wA = spawnWorker(mkArg(0));
  const wB = spawnWorker(mkArg(5));
  const res: (string[] | null)[] = rounds.map(() => null);
  const jvCount = () => P.accountJournalEntry.count({ where: { systemId: ACC, journal: { not: "REVERSAL" } } }) as Promise<number>;
  const rvCount = () => P.accountJournalEntry.count({ where: { systemId: ACC, journal: "REVERSAL" } }) as Promise<number>;
  let workerNote = "";
  try {
    const READY_MS = 30 * 60_000;
    const ROUND_MS = 30 * 60_000;
    const ra = await waitLine(wA, (l) => l === "H06READY", READY_MS);
    const rb = await waitLine(wB, (l) => l === "H06READY", READY_MS);
    if (!ra || !rb) throw new Error(`workers not ready (A=${!!ra} B=${!!rb}) · A: ${wA.err.slice(-200)} · B: ${wB.err.slice(-200)}`);
    for (let i = 0; i < rounds.length; i += 1) {
      rounds[i]!.jv0 = await jvCount();
      rounds[i]!.rv0 = await rvCount();
      wA.ch.stdin.write(`GO ${i}\n`);
      wB.ch.stdin.write(`GO ${i}\n`);
      const la = await waitLine(wA, (l) => l.startsWith(`H06ROUND ${i} `), ROUND_MS);
      const lb = await waitLine(wB, (l) => l.startsWith(`H06ROUND ${i} `), ROUND_MS);
      rounds[i]!.jv1 = await jvCount();
      rounds[i]!.rv1 = await rvCount();
      if (!la || !lb) {
        workerNote = `round ${i} missing (A=${!!la} B=${!!lb}) · A: ${wA.err.slice(-160)} · B: ${wB.err.slice(-160)}`;
        break;
      }
      const pa = JSON.parse(la.slice(`H06ROUND ${i} `.length)).res as string[];
      const pb = JSON.parse(lb.slice(`H06ROUND ${i} `.length)).res as string[];
      res[i] = [...pa, ...pb];
      console.log(`     ${rounds[i]!.sc} ${rounds[i]!.period}: ${res[i]!.map((x) => (x.startsWith("OK") ? "OK" : x.startsWith("NO:") ? "NO" : "ERR")).join(" ")}`);
    }
  } catch (e) {
    workerNote = errText(e);
  } finally {
    for (const w of [wA, wB]) {
      try {
        w.ch.stdin.write("END\n");
      } catch {
        /* closed */
      }
    }
    for (const w of [wA, wB]) if ((await waitLine(w, () => false, 60_000)) === null && w.exited === null) w.ch.kill("SIGKILL");
  }
  const complete = res.every((r) => !!r && r.length === LANES);
  chk("S6.0", complete, `${rounds.length} rounds × ${LANES} lanes answered`, complete ? "ok" : `${res.filter(Boolean).length}/${rounds.length} rounds · ${workerNote}`);
  const nOk = (xs: string[], fn: string, lanes: { fn: string }[]) => xs.filter((x, i) => lanes[i]!.fn === fn && x.startsWith("OK")).length;
  const of = (xs: string[], fn: string, lanes: { fn: string }[]) => xs.filter((_, i) => lanes[i]!.fn === fn);
  const notes = (xs: string[]) => xs.filter((x) => !x.startsWith("OK")).map((x) => (x.startsWith("NO:") ? x.slice(3) : x));
  const judge = async (sc: Round["sc"], fn: (r: Round, xs: string[]) => Promise<string | null>) => {
    const bad: string[] = [];
    for (const [i, r] of rounds.entries()) {
      if (r.sc !== sc) continue;
      const xs = res[i];
      if (!xs) {
        bad.push(`${r.period}: no result`);
        continue;
      }
      const why = await fn(r, xs);
      if (why) bad.push(`${r.period}: ${why}`);
    }
    return bad;
  };
  {
    const bad = await judge("X6.1", async (r, xs) => {
      const row = await runRow(r.runId);
      const revs = row?.journalEntryId ? await reversalsOf(row.journalEntryId) : [];
      const ev = await evOf(T, `hr.payroll.reversed#${r.runId}`);
      const bound = await boundIds(r.runId);
      const ok = nOk(xs, "reverse", r.lanes) === 1 && notes(xs).length === 9 && notes(xs).every((n) => n === T_ALREADY) && row?.status === "REVERSED" && revs.length === 1 && (r.rv1 ?? 0) - (r.rv0 ?? 0) === 1 && ev.length === 1 && bound.length === 0;
      return ok ? null : `ok=${nOk(xs, "reverse", r.lanes)} notes=${[...new Set(notes(xs))].map((n) => n.slice(0, 60)).join(" | ")} status=${row?.status} reversals=${revs.length} events=${ev.length} bound=${bound.length}`;
    });
    chk("X6.1", complete && bad.length === 0, "3/3 rounds: 1 ok · 9 already · 1 reversal · 1 event · unbound", bad.join(" · "));
  }
  {
    const bad = await judge("X6.2", async (r, xs) => {
      const revOk = nOk(xs, "reverse", r.lanes);
      const crOk = nOk(xs, "create", r.lanes);
      const revNotes = notes(of(xs, "reverse", r.lanes));
      const crNotes = notes(of(xs, "create", r.lanes));
      const liveDuring = (await P.hrPayrollRun.count({ where: { systemId: HX, periodKey: r.period, status: { not: "REVERSED" } } })) as number;
      let seq = "";
      if (liveDuring === 0) {
        try {
          await mkRun(cHX, r.period);
          seq = "created";
        } catch (e) {
          seq = `refused: ${errText(e).slice(0, 80)}`;
        }
      }
      const live = (await P.hrPayrollRun.findMany({ where: { systemId: HX, periodKey: r.period, status: { not: "REVERSED" } } })) as Any[];
      const bindsAll = live.length === 1 && sameIds(await boundIds(live[0].id), r.adj);
      const ok = revOk === 1 && crOk <= 1 && revNotes.every((n) => n === T_ALREADY) && crNotes.every((n) => n === T_DUP(r.period)) && liveDuring <= 1 && (liveDuring === 1 || seq === "created") && bindsAll && (await runRow(r.runId))?.status === "REVERSED";
      return ok ? null : `revOk=${revOk} crOk=${crOk} revNotes=${[...new Set(revNotes)].map((n) => n.slice(0, 50)).join("|")} crNotes=${[...new Set(crNotes)].map((n) => n.slice(0, 50)).join("|")} liveDuring=${liveDuring} seq=${seq || "-"} live=${live.length} bindsAll=${bindsAll}`;
    });
    chk("X6.2", complete && bad.length === 0, "3/3 rounds: 1 reverse ok · dup refusals · ≤1 live · period re-runnable, binds all", bad.join(" · "));
  }
  {
    const bad = await judge("X6.3", async (r, xs) => {
      const revOk = nOk(xs, "reverse", r.lanes);
      const mpOk = nOk(xs, "markPaid", r.lanes);
      const row = await runRow(r.runId);
      const revs = row?.journalEntryId ? await reversalsOf(row.journalEntryId) : [];
      const paidEv = await evOf(T, `hr.payroll.paid#${r.runId}`);
      const revEv = await evOf(T, `hr.payroll.reversed#${r.runId}`);
      const ok = revOk === 1 && mpOk <= 1 && notes(of(xs, "reverse", r.lanes)).every((n) => n === T_ALREADY) && notes(of(xs, "markPaid", r.lanes)).every((n) => n === T_PAID_NEEDS_APPROVED) && row?.status === "REVERSED" && revs.length === 1 && paidEv.length === mpOk && revEv.length === 1 && (await boundIds(r.runId)).length === 0;
      return ok ? null : `revOk=${revOk} mpOk=${mpOk} notes=${[...new Set(notes(xs))].map((n) => n.slice(0, 50)).join("|")} status=${row?.status} reversals=${revs.length} paidEv=${paidEv.length} revEv=${revEv.length}`;
    });
    chk("X6.3", complete && bad.length === 0, "3/3 rounds: 1 reverse ok · REVERSED · 1 reversal · paid events = markPaid ok ≤ 1 · 1 reversed event", bad.join(" · "));
  }
  {
    const bad = await judge("X6.4", async (r, xs) => {
      const apOk = nOk(xs, "approve", r.lanes);
      const revOk = nOk(xs, "reverse", r.lanes);
      const row = await runRow(r.runId);
      const dJv = (r.jv1 ?? 0) - (r.jv0 ?? 0);
      const dRv = (r.rv1 ?? 0) - (r.rv0 ?? 0);
      const apNotes = notes(of(xs, "approve", r.lanes));
      const revNotes = notes(of(xs, "reverse", r.lanes));
      let ok = apOk === 1 && dJv === 1 && apNotes.every((n) => n === T_APPROVE_NOT_DRAFT) && !!row?.journalEntryId;
      if (revOk === 1) ok = ok && row?.status === "REVERSED" && dRv === 1 && revNotes.every((n) => n === T_ALREADY || n === T_NO_JV);
      else ok = ok && revOk === 0 && row?.status === "APPROVED" && dRv === 0 && revNotes.every((n) => n === T_NO_JV);
      return ok ? null : `apOk=${apOk} revOk=${revOk} status=${row?.status} jv+${dJv} rev+${dRv} apNotes=${[...new Set(apNotes)].map((n) => n.slice(0, 40)).join("|")} revNotes=${[...new Set(revNotes)].map((n) => n.slice(0, 50)).join("|")}`;
    });
    chk("X6.4", complete && bad.length === 0, "3/3 rounds: 1 approve + 1 JV · reverse wins ⇒ REVERSED + 1 reversal · else APPROVED + no-JV refusals", bad.join(" · "));
  }

  // ───────── S6.5 ledger + events, whole tenant ─────────
  {
    const runs = (await P.hrPayrollRun.findMany({ where: { tenantId: T } })) as Any[];
    const bad: string[] = [];
    for (const r of runs) {
      const ev = await evOf(T, `hr.payroll.reversed#${r.id}`);
      if (r.status === "REVERSED" && ev.length !== 1) bad.push(`${r.periodKey}/${r.status}: ${ev.length} reversed events`);
      if (r.status !== "REVERSED" && ev.length !== 0) bad.push(`${r.periodKey}/${r.status}: ${ev.length} reversed events on a live run`);
      if (!r.journalEntryId) continue;
      const e = await P.accountJournalEntry.findUnique({ where: { id: r.journalEntryId } });
      if (!e) continue; // S5.3 orphan id (DRAFT)
      const revs = await reversalsOf(e.id);
      if (r.status === "REVERSED") {
        if (e.status !== "REVERSED" || revs.length !== 1 || !(await mirrored(e.id, revs[0].id))) bad.push(`${r.periodKey}: entry ${e.status} reversals ${revs.length}`);
      } else if (e.status !== "POSTED" || revs.length !== 0) bad.push(`${r.periodKey}/${r.status}: entry ${e.status} reversals ${revs.length}`);
    }
    const lines = (await P.accountJournalLine.findMany({ where: { systemId: ACC }, select: { debit: true, credit: true } })) as Any[];
    const dr = lines.reduce((s, l) => s + Number(l.debit), 0);
    const cr = lines.reduce((s, l) => s + Number(l.credit), 0);
    if (dr !== cr) bad.push(`ΣDr ${dr} ≠ ΣCr ${cr}`);
    chk("S6.5", runs.length > 0 && bad.length === 0, "every run consistent · ΣDr = ΣCr", `${runs.length} runs · ${bad.slice(0, 8).join(" · ")}${bad.length > 8 ? ` …+${bad.length - 8}` : ""}`);
  }
  });
}

// ═════════════════════════ cleanup + residue ═════════════════════════
async function cleanup(): Promise<string[]> {
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  const d = async (f: () => Promise<unknown>) => {
    try {
      await f();
    } catch {
      /* order/FK — next pass */
    }
  };
  if (!ids.length) return [];
  const inList = ids.map((x) => `'${x}'`).join(",");
  const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema = current_schema() and column_name='tenantId'`).catch(() => [])) as Any[])
    .map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
  for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await d(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
  for (const id of ids) await d(() => P.tenant.delete({ where: { id } }));
  const left: string[] = [];
  for (const t of tables) {
    const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: -1 }])) as Any[];
    const n = Number(r?.[0]?.n ?? 0);
    if (n !== 0) left.push(`${t}=${n}`);
  }
  return left;
}

let crashed = "";
let left: string[] = ["(cleanup not run)"];
try {
  runStatic();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 4).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  try {
    left = await cleanup();
  } catch (e) {
    left = [`cleanup threw: ${errText(e)}`];
  }
}
const leftTenants = (await P.tenant.count({ where: { slug: { startsWith: SLUG } } }).catch(() => -1)) as number;
const leftAudit = (await P.auditLog.count({ where: { OR: [{ tenantId: { in: TENANTS } }, { actorId: OWNER_UID }] } }).catch(() => -1)) as number;
const leftOutbox = (await P.outboxEvent.count({ where: { tenantId: { in: TENANTS } } }).catch(() => -1)) as number;
console.log(`RESIDUE tenants=${leftTenants} rows=${left.length} audit=${leftAudit} outbox=${leftOutbox}`);
chk("Z1", TENANTS.length > 0 && left.length === 0 && leftTenants === 0 && leftAudit === 0 && leftOutbox === 0, "0 rows · 0 tenants · 0 audit · 0 outbox", `tenants=${TENANTS.length} leftTenants=${leftTenants} audit=${leftAudit} outbox=${leftOutbox} ${left.join(",")}`);
for (const [id] of CHECKS) if (!results.has(id)) chk(id.slice(5), false, "checked", crashed ? `not reached (harness crashed: ${crashed.slice(0, 160)})` : GROUP_CRASHES.length ? `not reached (group crash: ${GROUP_CRASHES.join(" · ").slice(0, 240)})` : "not reached");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== passed ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, findings: failed.map((id) => ({ id, sev: results.get(id)!.sev })), skipped: false, forced: FORCE, missing: skipReasons, crashed: crashed ? crashed.slice(0, 200) : null, groupCrashes: GROUP_CRASHES.map((g) => g.slice(0, 200)) })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);
