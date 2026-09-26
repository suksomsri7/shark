// QC — CRM v2 WO C3.3: commissions → payroll — rules (PAID default | WON · PCT / FIXED / TIERED · pipeline scope · minDealSatang ·
//      splitCollaboratorsBp · payoutDelayDays) · onPaid (every CrmDealPayment COUNTED — partial payment = proportional share) / onWon ·
//      CrmCommission rows protected by the unique (dealId, ruleId, userId, refId) · approval `crm.commission` (chain or manual approve ≤
//      `crm._maxCommissionApproveSatang`, above ⇒ APPROVAL_REQUIRED) · APPROVED → HR `requestAdjustment` (kind COMMISSION, crmCommissionId)
//      · user without an (active) linked employee stays APPROVED "รอผูกพนักงาน" and is picked up when the link appears · NEW HR event
//      `hr.payroll.paid {runId, periodKey}` emitted INSIDE markPaid → commissions PAID · reversal (payment void): PENDING → REJECTED,
//      APPROVED/PAID → REVERSED negative row + DEDUCTION adjustment in the NEXT free period (a closed payroll run is never edited) · report + UI.
// Oracle writer · the C3.3 builder must NOT touch this file · QC database only (.env.qc — loaded by scripts/acc-v2-env.mts)
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c3.3.mts
//      `--force-run` = run every check while `commissions.ts` is absent — C3.3 checks red for the right reason ("module absent" /
//                      MISSING_FUNCTION / no rows), the fixtures, the C2.7 payment workers (already built) and CLEAN green
//      `--x3-worker …` = internal worker mode (own PrismaClient = own pool) — see the WORKER block
// requires: crm-seed   (house style — this oracle reads NO seeded row: everything lives in throwaway tenants `qc-c33-<rand>-*`, so a
//                       controller reseed running at the same moment can neither break it nor be broken by it)
//
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE (not re-implemented here): qc-payroll · qc-payroll-reverse · qc-hr-payadjust · qc-hr ·
//   qc-approval* · qc-crm-c2.7 (the money path now feeds commissions) · qc-crm-c3.2 (quota pct uses the same basis) · qc-crm-c1.8 (3
//   registries) · qc-crm-c1.5 (move to WON) · qc-crm-v1 · pnpm fitness (both modes) · qc-member-m1.9 (30/15/10/5).
//
// SOURCES: crm-brief-C3.3.md (+ its "Addendum (oracle author)") · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-C.4 refType
//   "DEAL_PAYMENT" / refId = CrmDealPayment.id · R-C.8 `#` keys · R-C.10 entityType `crm.commission` · R-D `crm-bridges/commissions.ts` ·
//   R-E.8 sums in SQL as bigint · R-E.14 uiVersion 1) · CRM-RUN §2 "C3.3" (S1 5 · S2 2 · S3 4 · S4 5 · S5 4 · S6 2 · S7 2 · S8 6 = 30) ·
//   MASTER-PLAN §4 (X1 X3 X4 X8 X9) + C0.3 note ("employeeOfUser returns inactive employees — C3.3 must check `active` itself") ·
//   blueprint §5.9 commissions · §6.1 (crm.commission.view/approve · crm._maxCommissionApproveSatang "ไม่กรอก = ไม่จำกัด") · §6.3 (approve:
//   MANAGER ≤ cap · OWNER ✓) · §7.1 (crm.commission.created/.approved/.reversed) · §7.2 (hr.payroll.paid) · §11.6 · decision C3 · mockup 10
//   right ("5% แรก ฿0–500,000 · 8% ส่วนเกิน · แบ่งผู้ร่วม 70/30" = marginal tiers + split · "คงที่ ฿150 ต่อดีล + 3%" = FIXED + pctBp ·
//   pending list with "อนุมัติที่เลือก" + "ส่ง payroll") · C3.0 addendum (refId NOT NULL DEFAULT '' · partial unique on
//   HrPayAdjustment.crmCommissionId · no FK) · C3.2 addendum (periodKey Gregorian "2026-09", Thai month windows) · hr/payroll.ts
//   (requestAdjustment refuses amount ≤ 0 ⇒ a reversal is a DEDUCTION with a positive amount · createPayrollRun pulls APPROVED
//   adjustments of its period once · @@unique(systemId, periodKey) on HrPayrollRun) · approval/service.ts (submitForApproval · decide).
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this — details in the brief addendum) ══════════════════
//   ctx = { tenantId, systemId, actorUserId } · actor = MemberActor · system re-resolved (id + tenant + type CRM) else NOT_FOUND ·
//   uiVersion ≠ 2 ⇒ CrmV2DisabledError for human entry points and a silent no-op for onPaid/onWon (nothing written) · errors carry `.code` ∈
//   VALIDATION | NOT_FOUND | FORBIDDEN | APPROVAL_REQUIRED | CONFLICT with a Thai message that never blames the user · money = BigInt satang.
//   A. `src/lib/modules/crm/commissions.ts`:
//      listRules(ctx, actor) · createRule(ctx, actor, RuleInput) · updateRule(ctx, actor, id, Partial<RuleInput>)   key crm.settings.manage
//        RuleInput = { name, basis?: "PAID"|"WON", kind: "PCT"|"FIXED"|"TIERED", config, pipelineId?, teamId?, productIds?, minDealSatang?,
//        splitCollaboratorsBp?, payoutDelayDays?, active?, sortOrder? } · config PCT {pctBp} · FIXED {fixedSatang, pctBp?} · TIERED
//        {tiers: [{uptoSatang: number|null, pctBp}]} ascending, last uptoSatang null · audit crm.commission.rule.create|update (before/after)
//      onPaid(ctx, { dealId, refType: "DEAL_PAYMENT", refId }) — refId = CrmDealPayment.id; the row is re-read (status COUNTED, same deal,
//        same system) and its `satang` is the only amount trusted (an amount in the input is ignored) · onWon(ctx, { dealId })
//      reverse(ctx, { refId, reason? }) — every commission of that payment row
//      approve(ctx, actor, { id, reason? }) · reject(ctx, actor, { id, reason })  key crm.commission.approve · cap = actor param
//        crm._maxCommissionApproveSatang (absent = unlimited · OWNER unlimited) · amount > cap ⇒ APPROVAL_REQUIRED, row unchanged
//      syncPayroll(ctx, { userId? }) → { requested } — APPROVED rows without an adjustment whose user now has an ACTIVE linked employee
//      mine(ctx, actor, f?) (own rows, any CRM v2 user) · list(ctx, actor, f?) (crm.commission.view) · pending(ctx, actor) (crm.commission.approve)
//      report(ctx, actor, { periodKey }) → { periodKey, rows: { userId, pendingSatang, approvedSatang, paidSatang, reversedSatang, netSatang,
//        count }[], totals } — crm.commission.view ⇒ every user · otherwise the actor's own row only
//      CommissionDto = { id, dealId, ruleId, userId, amountSatang: number, basisSatang: number, basis, status, periodKey, refType, refId,
//        reversedOfId, approvalRequestId, hrPayAdjustmentId, payroll: "WAITING_EMPLOYEE"|"REQUESTED"|"PAID"|null, … }
//   B. money rules (oracle arithmetic below, all BigInt): T = deal.wonValueSatang if > 0 else deal.valueSatang · full = PCT ⌊T·bp/10⁴⌋ ·
//      FIXED fixedSatang + ⌊T·pctBp/10⁴⌋ · TIERED ⌊Σ slice_i·bp_i / 10⁴⌋ (MARGINAL slices, one floor) · partial payments: running total
//      share = F(before + p) − F(before), F(x) = ⌊full·min(x,T)/T⌋ ⇒ Σ shares = full exactly · split: pool = ⌊A·splitBp/10⁴⌋, each
//      collaborator ⌊pool/N⌋ (owner never counted as a collaborator), owner = A − N·each · minDealSatang: T < min ⇒ nothing · periodKey =
//      Thai month of (countedAt | WON enteredAt) + payoutDelayDays · adjustment period = first month ≥ commission.periodKey without an
//      HrPayrollRun in that HR system · reversal period = first month > base (the original adjustment's period, else the commission's)
//      without a run.
//   C. HR: `requestAdjustment` accepts `crmCommissionId` (a second adjustment for the same commission is refused) · `markPaid` wraps the
//      guarded APPROVED→PAID update + `emitOutbox(hr.payroll.paid#<runId>, {runId, periodKey})` in ONE transaction.
//   D. events (3 registries): hr.payroll.paid · crm.commission.created · crm.commission.approved · crm.commission.reversed (ids only) ·
//      facade block `// CRM C3.3 ▸ export * as commissions from "./commissions" ◂` · bridge `src/lib/platform/crm-bridges/commissions.ts` ·
//      minute job `crm.commissions.payroll` · UI `/crm/settings/commissions` (rules + pending + "ส่ง payroll") and `/crm/commissions` (mine).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// CHECK INVENTORY (61): S0 4 · S1 5 · S2 2 · S3 4 · S4 5 · S5 4 · S6 2 · S7 2 · S8 6 (S1–S8 = the 30 of CRM-RUN §2) · M 5 (money gates /
//   BigInt) · X1 5 · X3 8 (X3.1a–X3.4a = "did the worker processes really run" controls) · X4 5 · X8 1 · X9 2 · CLEAN
//   (C3.3-FATAL is added only when something throws)
//   n/a: X2 (no REST op / AI tool — `crm_commissions_mine` is C3.4/C3.8) · X5 (the payroll sync job is idempotent by the partial unique —
//   proven by X4.5/S4.4, not a lease job) · X6 (rule config validated in X9.1) · X7 (no public endpoint) · X10 (no file).
// HOUSE RULES: SKIP guard before any DB connection · throwaway tenants swept in `finally` (every table with tenantId, 4 passes) + users ·
//   NO global drainOutbox — our own events are hand-delivered to the consumer map by id (a foreign drainer may have claimed them) ·
//   synthetic clock NOWP = 2026-09-15 12:00 Thai passed to recordDocPayment · races run in worker PROCESSES (own pool) · every expected
//   amount is computed here from the fixture with BigInt integer arithmetic (never by the service) · last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const C_FILE = "src/lib/modules/crm/commissions.ts";
const CS_FILE = "src/lib/modules/crm/commissions-shared.ts";
const C_SPEC = "@/lib/modules/crm/commissions";
const CS_SPEC = "@/lib/modules/crm/commissions-shared";
const BRIDGE_FILE = "src/lib/platform/crm-bridges/commissions.ts";
const PAYROLL_FILE = "src/lib/modules/hr/payroll.ts";
const HR_INDEX = "src/lib/modules/hr/index.ts";
const JOBS_FILE = "src/lib/platform/minute-jobs.ts";
const SET_PAGE_DIR = "src/app/app/sys/[id]/crm/settings/commissions";
const SET_PAGE = `${SET_PAGE_DIR}/page.tsx`;
const MINE_PAGE_DIR = "src/app/app/sys/[id]/crm/commissions";
const MINE_PAGE = `${MINE_PAGE_DIR}/page.tsx`;
const COMP_DIR = "src/components/crm/commissions";
const INDEX_FILE = "src/lib/modules/crm/index.ts";
const LABELS_FILE = "src/lib/automation/labels.ts";
const WEBHOOK_LABELS = "src/lib/webhooks/labels.ts";
const CONSUMERS_FILE = "src/lib/outbox-consumers.ts";
const NAV_FILE = "src/lib/modules/crm/nav.ts";
const INVENTORY = "scripts/crm-ui-inventory.json";
const SCHEMA_DIR = "prisma/schema";
const MIG_DIR = "prisma/migrations";
const C30_MIG = "20261102000000_crm_v2_c";
const THIS_FILE = "scripts/qc-crm-c3.3.mts";
const EVENTS = ["hr.payroll.paid", "crm.commission.created", "crm.commission.approved", "crm.commission.reversed"];
const WAITING = "รอผูกพนักงาน";

const ARGV = process.argv.slice(2);
const WORKER_AT = ARGV.indexOf("--x3-worker");
const FORCE = ARGV.includes("--force-run");
const read = (p: string) => (p && existsSync(p) ? readFileSync(p, "utf8") : "");
const walk = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out.sort();
};

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guard — commissions.ts absent (or its C3.0 tables absent) ⇒ SKIPPED, no DB connection.
// ═══════════════════════════════════════════════════════════════════════════════════
const BUILT = read(C_FILE).length > 0;
const schemaAll = existsSync(SCHEMA_DIR) ? readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".prisma")).map((f) => read(join(SCHEMA_DIR, f))).join("\n") : "";
const C30 = /model\s+CrmCommission\s*\{/.test(schemaAll) && /crmCommissionId/.test(schemaAll) && existsSync(join(MIG_DIR, C30_MIG));
if (WORKER_AT < 0 && !FORCE && (!BUILT || !C30)) {
  const why = !BUILT ? `WO C3.3 not built yet (${C_FILE} absent)${C30 ? "" : " — and its prerequisite C3.0 (CrmCommission · *_crm_v2_c) is absent too"}` : "prerequisite C3.0 absent: CrmCommission / HrPayAdjustment.crmCommissionId / prisma/migrations/*_crm_v2_c not in the tree";
  console.log(`⚠️  SKIPPED — ${why} (run with --force-run to exercise the fixtures, the arithmetic, the workers and the cleanup)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();

const fnOf = (mod: Any, ...names: string[]): Any => {
  for (const nm of names) {
    let v: Any = mod;
    for (const p of nm.split(".")) v = v?.[p];
    if (typeof v === "function") return v;
  }
  return undefined;
};
const codeOf = (e: Any) => String(e?.code ?? "-");
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════════════════════════════
// WORKER MODE — this file re-invoked as a child process (own PrismaClient = own pool, synchronised start per round).
//   argv: --x3-worker <tenantId> <startAtMs> <base64url(JSON { rounds: { atMs, seq?, calls: { ph, fn, sys, a, n }[] }[] })>
//   fn: pay (payments.recordDocPayment — the C2.7 path) · onPaid · reverse · deliver (an outbox event by id → consumers map)
//   a round runs all its calls (each ×n) in parallel — `seq` = one call after the other, each call's n copies in parallel
// ═══════════════════════════════════════════════════════════════════════════════════
if (WORKER_AT >= 0) {
  const [wT, wStart, wArg] = ARGV.slice(WORKER_AT + 1);
  const PW = ((await import("@/lib/core/db")) as Any).prisma as Any;
  const CM = (await import(C_SPEC as string).catch(() => ({}))) as Any;
  const PM = (await import("@/lib/modules/crm/payments" as string).catch(() => ({}))) as Any;
  const OBX = (await import("@/lib/outbox-consumers" as string).catch(() => ({}))) as Any;
  const arg = JSON.parse(Buffer.from(String(wArg), "base64url").toString("utf8")) as { rounds: { atMs: number; seq?: boolean; calls: { ph: string; fn: string; sys: string; a: Any; n: number }[] }[] };
  const err = (e: unknown) => `ERR:${codeOf(e)}:${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`;
  const miss = (what: string) => Object.assign(new Error(`${what} missing`), { code: "MISSING_FUNCTION" });
  const one = async (c: { fn: string; sys: string; a: Any }): Promise<string> => {
    const ctx = { tenantId: wT, systemId: c.sys, actorUserId: null };
    try {
      if (c.fn === "pay") {
        if (typeof PM.recordDocPayment !== "function") throw miss("recordDocPayment");
        const v = await PM.recordDocPayment({ tenantId: wT, systemId: c.sys }, { documentId: c.a.documentId, paymentId: c.a.paymentId, amountSatang: c.a.amountSatang }, { now: new Date(c.a.now) });
        return v?.counted === true ? "OK:counted" : `OK:skip-${String(v?.skipped ?? "?")}`;
      }
      if (c.fn === "onPaid") {
        if (typeof CM.onPaid !== "function") throw miss("onPaid");
        await CM.onPaid(ctx, { dealId: c.a.dealId, refType: "DEAL_PAYMENT", refId: c.a.refId });
        return "OK";
      }
      if (c.fn === "reverse") {
        if (typeof CM.reverse !== "function") throw miss("reverse");
        await CM.reverse(ctx, { refId: c.a.refId, reason: "ยกเลิกการรับชำระ (ข้อสอบ)" });
        return "OK";
      }
      if (c.fn === "deliver") {
        const e = await PW.outboxEvent.findUnique({ where: { id: c.a.eventId } });
        if (!e) return "OK:gone";
        const h = OBX.consumers?.[e.type];
        if (typeof h !== "function") throw miss(`consumer ${e.type}`);
        await h({ id: e.id, tenantId: e.tenantId, type: e.type, payload: e.payload, systemId: e.systemId, unitId: e.unitId });
        return "OK";
      }
      return "ERR:unknown-fn";
    } catch (e) { return err(e); }
  };
  const out: string[] = [];
  for (const round of arg.rounds) {
    const ms = Number(wStart) + round.atMs - Date.now();
    if (ms > 0) await sleep(ms);
    if (round.seq) {
      for (const c of round.calls) out.push(...(await Promise.all(Array.from({ length: c.n }, () => one(c)))).map((r) => `${c.ph}:${r}`));
    } else {
      const jobs = round.calls.flatMap((c) => Array.from({ length: c.n }, () => c));
      out.push(...(await Promise.all(jobs.map(async (c) => `${c.ph}:${await one(c)}`))));
    }
  }
  console.log(`X3WORKER ${JSON.stringify(out)}`);
  await PW.$disconnect();
  process.exit(0);
}

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c33-${rand}`;

// ─────────────────────────── harness ───────────────────────────
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, nm: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${nm}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const cut = (v: unknown, k = 240) => { const s = String(v ?? ""); return s.length > k ? `${s.slice(0, k)}…` : s; };
const j = (v: Any): string => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x)) ?? "undefined";
const thai = (s: unknown) => /[ก-๙]/.test(String(s ?? ""));
const BLAME = /คุณ(ทำ|กรอก|ใส่|เลือก)?ผิด|ผู้ใช้ผิด|ความผิดของคุณ|โง่|ผิดพลาดของคุณ/;
type Res = { ok: boolean; v: Any; err: string; code: string; name: string; msg: string };
const MISSING: Res = { ok: false, v: undefined, err: "MISSING_FUNCTION", code: "MISSING_FUNCTION", name: "", msg: "" };
const call = async (fn: Any, ...args: Any[]): Promise<Res> => {
  if (typeof fn !== "function") return MISSING;
  try {
    return { ok: true, v: await fn(...args), err: "", code: "", name: "", msg: "" };
  } catch (e) {
    const x = e as Any;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, v: undefined, err: `${x?.name ?? "Error"}(${x?.code ?? "-"}): ${cut(msg, 160)}`, code: String(x?.code ?? ""), name: String(x?.name ?? ""), msg };
  }
};
const refused = (r: Res) => !r.ok && r.code !== "MISSING_FUNCTION" && thai(r.msg) && !BLAME.test(r.msg);
const isV1 = (r: Res) => !r.ok && (r.name === "CrmV2DisabledError" || r.code === "CRM_V2_DISABLED");
const isNF = (r: Res) => refused(r) && !isV1(r) && (r.code === "NOT_FOUND" || /NotFound/i.test(r.name));
const isFB = (r: Res) => refused(r) && !isV1(r) && (r.code === "FORBIDDEN" || /Forbidden/i.test(r.name));
const isVal = (r: Res) => refused(r) && r.code === "VALIDATION";
const isAR = (r: Res) => refused(r) && r.code === "APPROVAL_REQUIRED";
const rs = (r: Res) => (r.ok ? `ok ${cut(j(r.v), 160)}` : r.err);
const itemsOf = (v: Any): Any[] => (Array.isArray(v) ? v : ((v?.items ?? v?.rows ?? []) as Any[]));
const idsOf = (v: Any) => itemsOf(v).map((r) => String(r?.id)).sort();
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// ─────────────────────────── Thai time + periods (independent of the product) ───────────────────────────
const OFF = 7 * 3_600_000;
const DAY = 86_400_000;
const T = (iso: string) => new Date(iso);
const monthKeyOf = (d: Date) => { const t = new Date(d.getTime() + OFF); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`; };
const nextMonth = (key: string) => { const [y, mo] = key.split("-").map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`; };
const periodOf = (at: Date, delayDays: number) => monthKeyOf(new Date(at.getTime() + delayDays * DAY));
/** first month ≥ base (strict=false) or > base (strict=true) that has no HrPayrollRun in `runs` */
const freePeriod = (base: string, runs: Set<string>, strict: boolean) => { let k = strict ? nextMonth(base) : base; while (runs.has(k)) k = nextMonth(k); return k; };
const NOWP = T("2026-09-15T05:00:00Z"); // 12:00 Thai — every payment of the fixture is counted "now = NOWP" (recordDocPayment opts.now)
const PK = "2026-09";

// ─────────────────────────── money arithmetic (BigInt · the oracle's own — never the service's) ───────────────────────────
const b = (x: number | bigint | string) => BigInt(x);
const Z = BigInt(0);
const TENK = BigInt(10_000);
type Tier = { uptoSatang: number | null; pctBp: number };
const fullOf = (kind: string, cfg: Any, total: bigint): bigint => {
  if (kind === "PCT") return (total * b(cfg.pctBp)) / TENK;
  if (kind === "FIXED") return b(cfg.fixedSatang) + (total * b(cfg.pctBp ?? 0)) / TENK;
  let prev = Z;
  let num = Z;
  for (const t of cfg.tiers as Tier[]) {
    const upper = t.uptoSatang === null ? total : (b(t.uptoSatang) < total ? b(t.uptoSatang) : total);
    if (upper > prev) num += (upper - prev) * b(t.pctBp);
    prev = t.uptoSatang === null ? total : b(t.uptoSatang);
    if (prev >= total) break;
  }
  return num / TENK; // MARGINAL slices, ONE floor over the summed numerator
};
const F = (full: bigint, total: bigint, x: bigint) => (x >= total ? full : (full * x) / total);
/** running-total shares of sequential payments: share_i = F(before + p_i) − F(before) ⇒ Σ = F(Σp) (= full when Σp = T) */
const seqShares = (full: bigint, total: bigint, pays: bigint[]) => { let cum = Z; return pays.map((p) => { const s = F(full, total, cum + p) - F(full, total, cum); cum += p; return s; }); };
/** any processing order: a share lies in [⌊full·p/T⌋, ⌊full·p/T⌋ + 1] */
const shareBounds = (full: bigint, total: bigint, p: bigint) => { const lo = (full * p) / total; return [lo, lo + BigInt(1)] as const; };
const splitOf = (amount: bigint, bp: number, nColl: number) => {
  if (nColl <= 0 || bp <= 0) return { owner: amount, each: Z };
  const pool = (amount * b(bp)) / TENK;
  const each = pool / b(nColl);
  return { owner: amount - each * b(nColl), each };
};
const ABSENT = BUILT ? "" : " · [commissions.ts ABSENT]";

console.log(`\n═══ QC CRM v2 · C3.3 — commissions → payroll ═══`);
console.log(`[env] DB ${host} · tag ${TAG}${FORCE && (!BUILT || !C30) ? ` · --force-run with ${!BUILT ? "C3.3 ABSENT" : "C3.0 ABSENT"} (C3.3 checks expected red; controls + CLEAN green)` : ""}\n`);

const TENANTS: string[] = [];
const USERS: string[] = [];
const PII: string[] = [];
const pii = <S extends string>(s: S): S => { PII.push(s); return s; };
let seq = 0;
const nx = () => `${++seq}`;
let phoneSeq = 0;
const phoneOf = (): string => pii(`08${String((Math.floor(Math.random() * 9_000_000) + 1_000_000) * 10 + (phoneSeq++ % 10)).padStart(8, "0").slice(-8)}`);
const consumerErr: string[] = [];

try {
  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — structure (static + runtime shape)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S0 · structure ──");
  const CM = (await import(C_SPEC as string).catch(() => ({}))) as Any;
  const CS = (await import(CS_SPEC as string).catch(() => ({}))) as Any;
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => ({}))) as Any;
  const OBX = (await import("@/lib/outbox-consumers" as string).catch(() => ({}))) as Any;
  const PM = (await import("@/lib/modules/crm/payments" as string)) as Any;
  const DL = (await import("@/lib/modules/crm/deals" as string)) as Any;
  const HRF = (await import("@/lib/modules/hr" as string).catch(() => ({}))) as Any;
  const PAY = (await import("@/lib/modules/hr/payroll" as string)) as Any;
  const APV = (await import("@/lib/modules/approval/service" as string)) as Any;
  const CONS: Any = OBX.consumers ?? {};
  const F_ = {
    listRules: fnOf(CM, "listRules"), createRule: fnOf(CM, "createRule"), updateRule: fnOf(CM, "updateRule"),
    onPaid: fnOf(CM, "onPaid"), onWon: fnOf(CM, "onWon"), reverse: fnOf(CM, "reverse"),
    approve: fnOf(CM, "approve"), reject: fnOf(CM, "reject"), syncPayroll: fnOf(CM, "syncPayroll"),
    mine: fnOf(CM, "mine"), list: fnOf(CM, "list"), pending: fnOf(CM, "pending"), report: fnOf(CM, "report"),
  };
  {
    const csSrc = read(CS_FILE);
    const impure = /from\s+["'](@prisma\/client|@\/lib\/core\/db|next\/[^"']+|server-only|\.\/db|\.\/commissions)["']/.test(csSrc);
    const missing = Object.entries(F_).filter(([, f]) => typeof f !== "function").map(([k]) => k);
    chk("C3.3-S0.1", "commissions.ts exports listRules · createRule · updateRule · onPaid · onWon · reverse · approve · reject · syncPayroll · mine · list · pending · report, and commissions-shared.ts is pure (no prisma/next/server-only/./db) exporting commissionOf + COMMISSION_WAITING_LABEL = \"รอผูกพนักงาน\"",
      BUILT && missing.length === 0 && csSrc.length > 0 && !impure && typeof CS.commissionOf === "function" && CS.COMMISSION_WAITING_LABEL === WAITING,
      "13 fns · pure shared", `built=${BUILT} missing=${missing.join(",") || "-"} shared=${csSrc.length > 0} impure=${impure} commissionOf=${typeof CS.commissionOf} label=${j(CS.COMMISSION_WAITING_LABEL)}${ABSENT}`);
  }
  {
    const idx = read(INDEX_FILE);
    const block = /CRM C3\.3 ▸[\s\S]*?◂/.exec(idx)?.[0] ?? "";
    const ok = /export\s+\*\s+as\s+commissions\s+from\s+["']\.\/commissions["']/.test(block);
    const bridge = read(BRIDGE_FILE);
    chk("C3.3-S0.2", "facade: crm/index.ts exports the `commissions` namespace inside a `// CRM C3.3 ▸ … ◂` block (crm.commissions.onPaid reachable) · R-D: the bridge file src/lib/platform/crm-bridges/commissions.ts exists (C3.3 is its only owner) [static + runtime]",
      ok && typeof CRM?.commissions?.onPaid === "function" && bridge.length > 0,
      "block · runtime · bridge", `block=${block.length > 0} static=${ok} runtime=${typeof CRM?.commissions?.onPaid} bridge=${bridge.length > 0}${ABSENT}`);
  }
  {
    const lab = read(LABELS_FILE) + "\n" + read(WEBHOOK_LABELS);
    const per = EVENTS.map((ev) => {
      const count = (lab.match(new RegExp(`value:\\s*["']${ev.replace(/\./g, "\\.")}["']`, "g")) ?? []).length;
      return { ev, count, consumer: typeof CONS?.[ev] === "function" };
    });
    const blocks = /CRM C3\.3 ▸/.test(read(CONSUMERS_FILE));
    chk("C3.3-S0.3", "3 registries (a new event without a consumer stalls the whole queue): hr.payroll.paid · crm.commission.created · crm.commission.approved · crm.commission.reversed are each declared EXACTLY ONCE across automation/labels.ts + webhooks/labels.ts and each has a consumer in outbox-consumers.ts (block `// CRM C3.3 ▸`)",
      per.every((x) => x.count === 1 && x.consumer) && blocks, "4 × (1 label · consumer)", `${per.map((x) => `${x.ev}:${x.count}/${x.consumer}`).join(" ")} block=${blocks}${ABSENT}`);
  }
  {
    const migs = existsSync(MIG_DIR) ? readdirSync(MIG_DIR).filter((d) => d > C30_MIG && (/crm/i.test(d) || /crmCommission|HrPayAdjustment/.test(read(join(MIG_DIR, d, "migration.sql"))))) : [];
    const hrIdx = read(HR_INDEX);
    const hrPure = hrIdx.length > 0 && !/from\s+["'](@\/lib\/core\/db|@prisma\/client)["']|new\s+PrismaClient/.test(hrIdx); // imports only — its header comment mentions PrismaClient
    const job = /name:\s*["']crm\.commissions\.payroll["']/.test(read(JOBS_FILE));
    chk("C3.3-S0.4", "C3.3 ships NO migration (crm_v2_c already has CrmCommissionRule/CrmCommission/HrPayAdjustment.crmCommissionId — R-C.1) · hr/index.ts stays a re-export-only facade (no db) · the payroll pick-up job `crm.commissions.payroll` is registered in platform/minute-jobs.ts",
      migs.length === 0 && hrPure && job, "no migration · pure facade · job", `newMigrations=${migs.join(",") || "-"} hrFacadePure=${hrPure} job=${job}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — throwaway tenants A (all functional groups) · B (foreign) · X (the X3 races)
  // ═════════════════════════════════════════════════════════════════════════════
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const mkUser = async (suffix: string) => {
    const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix || "owner"} ${TAG}` } });
    USERS.push(u.id);
    return u.id as string;
  };
  const mkTenant = async (suffix: string) => {
    const t = await P.tenant.create({ data: { name: `${TAG}-${suffix}`, slug: `${TAG}-${suffix}` } });
    TENANTS.push(t.id);
    return t.id as string;
  };
  const member = (tid: string, userId: string, role: string, permissions: Record<string, unknown> = {}) =>
    P.membership.create({ data: { userId, tenantId: tid, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } });
  const mk = async (tid: string, type: string, label: string) => (await sysSvc.createSystem(tid, type, `${label} ${TAG}`)).id as string;
  const setCrm = (sysId: string, obj: Record<string, unknown>) =>
    P.$executeRawUnsafe(
      `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
        (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
      JSON.stringify(obj), sysId);
  const SALES = { "crm.contact.read": true, "crm.deal.read": true, "crm.activity.read": true, "crm.report.view": true };
  const CAP = 100_000; // MANAGER cap ฿1,000
  const actor = (userId: string, role: string, permissions: Record<string, unknown> = {}) => ({ userId, role, unitAccess: role === "OWNER" ? [] as string[] : ["*"], permissions });

  const uO = await mkUser("");
  const uM = await mkUser("-mgr");
  const uTH = await mkUser("-thana");
  const uPK = await mkUser("-pook");
  const uNK = await mkUser("-nok"); // no employee until S4.4
  const uIN = await mkUser("-inactive"); // employee exists but active = false
  const uWR = await mkUser("-waitrev"); // no employee — S5.4
  const uC = [await mkUser("-c1"), await mkUser("-c2"), await mkUser("-c3")];
  const uBIG = await mkUser("-big");
  const uXE = [await mkUser("-xe1"), await mkUser("-xe2"), await mkUser("-xe3")];
  const tidA = await mkTenant("a");
  await member(tidA, uO, "OWNER");
  await member(tidA, uM, "MANAGER", { "crm._maxCommissionApproveSatang": CAP });
  for (const u of [uTH, uPK, uNK, uIN, uWR, ...uC, uBIG]) await member(tidA, u, "STAFF", SALES);
  const tidB = await mkTenant("b");
  await member(tidB, uO, "OWNER");
  const tidX = await mkTenant("x");
  await member(tidX, uO, "OWNER");
  for (const u of uXE) await member(tidX, u, "STAFF", SALES);
  const aO = actor(uO, "OWNER");
  const aM = actor(uM, "MANAGER", { "crm._maxCommissionApproveSatang": CAP });
  const aTH = actor(uTH, "STAFF", SALES);
  const aPK = actor(uPK, "STAFF", SALES);
  const aNK = actor(uNK, "STAFF", SALES);
  const ctx = (tid: string, sys: string, uid: string | null) => ({ tenantId: tid, systemId: sys, actorUserId: uid });

  const crmS1 = await mk(tidA, "CRM", "CRM จ่ายบางส่วน"); // S1
  const crmW = await mk(tidA, "CRM", "CRM ชนะ"); // S2
  const crmT = await mk(tidA, "CRM", "CRM ขั้นบันได"); // S3.1–S3.2
  const crmSp = await mk(tidA, "CRM", "CRM แบ่งผู้ร่วม"); // S3.3–S3.4
  const crmP = await mk(tidA, "CRM", "CRM เงินเดือน"); // S4–S8 · X1 · X9.2
  const crmG1 = await mk(tidA, "CRM", "CRM ขอบเขต pipeline"); // M3 · X1.5
  const crmG2 = await mk(tidA, "CRM", "CRM ยอดขั้นต่ำ"); // M1 · M2
  const crmG3 = await mk(tidA, "CRM", "CRM เลื่อนจ่าย"); // M2
  const crmG4 = await mk(tidA, "CRM", "CRM เงินก้อนใหญ่"); // M4
  const crmR = await mk(tidA, "CRM", "CRM กฎ"); // X9.1 rule CRUD
  const crmV = await mk(tidA, "CRM", "CRM v1"); // X1.4
  const hrA = await mk(tidA, "HR", "พนักงาน");
  const crmB = await mk(tidB, "CRM", "CRM-B");
  const crmXA = await mk(tidX, "CRM", "CRM ยิง A"); // X3.1
  const crmXB = await mk(tidX, "CRM", "CRM ยิง B"); // X3.2
  const crmXC = await mk(tidX, "CRM", "CRM ยิง C"); // X3.3
  const crmXD = await mk(tidX, "CRM", "CRM ยิง D"); // X3.4
  const hrX = await mk(tidX, "HR", "พนักงาน X");
  const REQ = { basis: "PAID", approvalRequired: true, payrollLink: true };
  const AUTO = { basis: "PAID", approvalRequired: false, payrollLink: true };
  for (const s of [crmS1, crmP, crmXD]) await setCrm(s, { uiVersion: 2, bridgesEnabled: true, commission: REQ });
  for (const s of [crmW, crmT, crmSp, crmG1, crmG2, crmG3, crmG4, crmR, crmB, crmXA, crmXB, crmXC]) await setCrm(s, { uiVersion: 2, bridgesEnabled: true, commission: AUTO });
  await setCrm(crmV, { uiVersion: 1, bridgesEnabled: true, commission: AUTO });
  // the approval chain `crm.commission` (step 1 = OWNER) — only where the fixture wants PENDING rows
  for (const [tid, s] of [[tidA, crmS1], [tidA, crmP], [tidX, crmXD]] as [string, string][]) {
    await APV.createPolicy({ tenantId: tid }, { name: `คอมมิชชัน ${TAG}`, entityType: "crm.commission", systemId: s, steps: [{ order: 1, approverRole: "OWNER" }] });
  }
  // HR fixture (HR's own data — raw): linked employees + salary profiles (a payroll run needs ≥ 1 profile)
  const mkEmp = async (tid: string, hr: string, userId: string, active = true) => {
    const e = await P.hrEmployee.create({ data: { tenantId: tid, systemId: hr, name: `พนักงาน ${TAG}-${nx()}`, linkedUserId: userId, active } });
    await PAY.setSalaryProfile({ tenantId: tid, systemId: hr }, { employeeId: e.id, baseSalarySatang: 3_000_000 });
    return e.id as string;
  };
  const eTH = await mkEmp(tidA, hrA, uTH);
  const ePK = await mkEmp(tidA, hrA, uPK);
  await mkEmp(tidA, hrA, uIN, false);
  const eXE: string[] = [];
  for (const u of uXE) eXE.push(await mkEmp(tidX, hrX, u));
  const cHR = { tenantId: tidA, systemId: hrA };
  const runsOf = async (hr: string) => new Set(((await P.hrPayrollRun.findMany({ where: { systemId: hr }, select: { periodKey: true } })) as Any[]).map((r) => String(r.periodKey)));

  // pipelines / contacts / deals (raw fixture — product tables written the way the product writes them)
  const mkPipe = async (tid: string, sys: string) => {
    const stages: [string, string, number][] = [["ใหม่", "OPEN", 20], ["ชนะ", "WON", 100], ["แพ้", "LOST", 0]];
    const p = (await P.crmPipeline.create({
      data: { tenantId: tid, systemId: sys, name: `ขาย ${TAG}-${nx()}`, stages: { create: stages.map(([name, kind, probability], i) => ({ tenantId: tid, systemId: sys, sortOrder: i, name, kind, probability })) } },
      include: { stages: true },
    })) as Any;
    const st = (k: string) => (p.stages as Any[]).find((s) => s.kind === k).id as string;
    return { id: p.id as string, OPEN: st("OPEN"), WON: st("WON"), LOST: st("LOST") };
  };
  type Pipe = Awaited<ReturnType<typeof mkPipe>>;
  const mkContact = async (tid: string, sys: string, owner: string | null) => {
    const name = pii(`ลูกค้า ${TAG}-${nx()}`);
    const party = await P.party.create({ data: { tenantId: tid, name, kind: "PERSON" } });
    const c = await P.crmContact.create({ data: { tenantId: tid, systemId: sys, name, firstName: name, phone: phoneOf(), email: pii(`${TAG}-c${nx()}@qc.invalid`), partyId: party.id, ownerUserId: owner } });
    return c.id as string;
  };
  type Deal = { id: string; inv: string; value: number; tid: string; sys: string };
  const mkDeal = async (tid: string, sys: string, pipe: Pipe, owner: string | null, value: number, collaborators: string[] = []) => {
    const contactId = await mkContact(tid, sys, owner);
    const inv = `${TAG}-inv-${nx()}`;
    const at = T("2026-09-01T03:00:00Z");
    const d = await P.crmDeal.create({
      data: { tenantId: tid, systemId: sys, contactId, pipelineId: pipe.id, stageId: pipe.OPEN, title: `ดีล ${TAG}-${nx()}`, valueSatang: value, kind: "OPEN",
        ownerUserId: owner, stageEnteredAt: at, createdAt: at, invoiceDocId: inv, collaboratorUserIds: collaborators },
    });
    await P.crmDealStageHistory.create({ data: { tenantId: tid, dealId: d.id, fromStageId: null, toStageId: pipe.OPEN, enteredAt: at, leftAt: null } });
    return { id: d.id as string, inv, value, tid, sys } as Deal;
  };
  type RuleSpec = { basis?: string; kind: string; config: Any; pipelineId?: string | null; minDealSatang?: number | null; split?: number; delay?: number };
  const mkRule = async (tid: string, sys: string, r: RuleSpec) => (await P.crmCommissionRule.create({
    data: { tenantId: tid, systemId: sys, name: `กฎ ${TAG}-${nx()}`, basis: r.basis ?? "PAID", kind: r.kind, config: r.config, pipelineId: r.pipelineId ?? null, productIds: [],
      minDealSatang: r.minDealSatang === undefined || r.minDealSatang === null ? null : BigInt(r.minDealSatang), splitCollaboratorsBp: r.split ?? 0, payoutDelayDays: r.delay ?? 0 },
  })).id as string;

  // hand-deliver OUR events to the consumer map — by id, whatever their status (a foreign drainer may have claimed them)
  const seen = new Set<string>();
  const deliver = async (e: Any) => {
    const r = await call(CONS?.[e.type], { id: e.id, tenantId: e.tenantId, type: e.type, payload: e.payload, systemId: e.systemId, unitId: e.unitId });
    if (!r.ok && r.code !== "MISSING_FUNCTION" && consumerErr.length < 12) consumerErr.push(`${e.type}: ${r.err}`);
    return r;
  };
  const settle = async (tid: string) => {
    for (let round = 0; round < 10; round += 1) {
      const evs = ((await P.outboxEvent.findMany({ where: { tenantId: tid }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })) as Any[]).filter((e) => !seen.has(e.id));
      if (evs.length === 0) break;
      for (const e of evs) { seen.add(e.id); await deliver(e); }
      await P.outboxEvent.updateMany({ where: { id: { in: evs.map((e) => e.id) }, status: "PENDING" }, data: { status: "DONE", processedAt: new Date() } });
    }
  };
  /** the real C2.7 money path: payment of the deal's (fake) invoice, counted at `now` → then our events delivered */
  const pay = async (d: Deal, label: string, amount: number, now: Date = NOWP) => {
    const paymentId = `${TAG}-${label}`;
    const r = await call(PM.recordDocPayment, { tenantId: d.tid, systemId: d.sys }, { documentId: d.inv, paymentId, amountSatang: amount }, { now });
    await settle(d.tid);
    const row = (await P.crmDealPayment.findFirst({ where: { dealId: d.id, refType: "PAYMENT", refId: paymentId } })) as Any;
    return { rowId: (row?.id ?? `-missing-${label}`) as string, paymentId, counted: r.ok && r.v?.counted === true, res: r };
  };
  const rawPay = async (d: Deal, amount: number, countedAt: Date = NOWP) =>
    (await P.crmDealPayment.create({ data: { tenantId: d.tid, systemId: d.sys, dealId: d.id, refType: "PAYMENT", refId: `${TAG}-raw-${nx()}`, satang: BigInt(amount), status: "COUNTED", countedAt } })).id as string;
  const comm = async (where: Any) => (await P.crmCommission.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })) as Any[];
  const adjOf = async (commissionId: string | null | undefined) => (commissionId ? ((await P.hrPayAdjustment.findMany({ where: { crmCommissionId: commissionId } })) as Any[]) : []);
  const sumB = (rows: Any[]) => rows.reduce((s, r) => s + BigInt(r.amountSatang), Z);
  const desc = (rows: Any[]) => rows.map((r) => `${r.userId === uTH ? "thana" : r.userId === uPK ? "pook" : String(r.userId).slice(-4)}:${String(r.refId).slice(-6)}:${String(r.amountSatang)}:${r.status}`).join(",");
  const reqOf = async (tid: string, commissionId: string | undefined) => (commissionId ? ((await P.approvalRequest.findFirst({ where: { tenantId: tid, entityType: "crm.commission", entityId: commissionId } })) as Any) : null);
  const decideReq = async (tid: string, commissionId: string | undefined, decision: "APPROVED" | "REJECTED") => {
    const req = await reqOf(tid, commissionId);
    if (!req) return { ok: false, status: "NO_REQUEST" };
    return APV.decide({ userId: uO, role: "OWNER", unitAccess: [], permissions: {} }, { tenantId: tid }, req.id, { decision, note: `ตัดสินโดยข้อสอบ ${TAG}` });
  };
  const ctxP = (uid: string | null = uO) => ctx(tidA, crmP, uid);

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — PAID basis · two partial payments → two proportional rows · unique dedupe (crmS1: PCT 5 % · chain ⇒ PENDING)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S1 · PAID partial payments ──");
  const R_S1 = { kind: "PCT", config: { pctBp: 500 } };
  const rS1 = await mkRule(tidA, crmS1, R_S1);
  const pS1 = await mkPipe(tidA, crmS1);
  const d11 = await mkDeal(tidA, crmS1, pS1, uTH, 2_000_000);
  const p11a = await pay(d11, "p11a", 600_000);
  const p11b = await pay(d11, "p11b", 1_400_000);
  const d12 = await mkDeal(tidA, crmS1, pS1, uTH, 3_333_333);
  const p12a = await pay(d12, "p12a", 1_111_111);
  const p12b = await pay(d12, "p12b", 2_222_222);
  const full11 = fullOf("PCT", R_S1.config, b(2_000_000));
  const [e11a, e11b] = seqShares(full11, b(2_000_000), [b(600_000), b(1_400_000)]);
  const full12 = fullOf("PCT", R_S1.config, b(3_333_333));
  const [e12a, e12b] = seqShares(full12, b(3_333_333), [b(1_111_111), b(2_222_222)]);
  const naive12 = (full12 * b(1_111_111)) / b(3_333_333) + (full12 * b(2_222_222)) / b(3_333_333);
  console.log(`  [arith] d11 T=2,000,000 · PCT 500bp ⇒ full ⌊2,000,000·500/10⁴⌋=${full11} · shares F(600,000)=${e11a} · F(2,000,000)−F(600,000)=${e11b}`);
  console.log(`  [arith] d12 T=3,333,333 ⇒ full ⌊3,333,333·500/10⁴⌋=${full12} · running total ${e12a} + ${e12b} = ${e12a + e12b} (naive per-payment floor ${naive12} loses ${full12 - naive12})`);
  {
    const rows = await comm({ dealId: d11.id });
    const byRef = new Map(rows.map((r) => [String(r.refId), r]));
    const ok = rows.length === 2 && [p11a, p11b].every((p) => {
      const r = byRef.get(p.rowId);
      const sat = p === p11a ? 600_000 : 1_400_000;
      return r && r.userId === uTH && r.ruleId === rS1 && r.refType === "DEAL_PAYMENT" && r.basis === "PAID" && Number(r.basisSatang) === sat && r.status === "PENDING" && r.periodKey === PK && r.systemId === crmS1;
    });
    chk("C3.3-S1.1", "two partial payments of one deal through the real C2.7 money path (recordDocPayment → COUNTED) ⇒ exactly TWO CrmCommission rows — one per payment: refType DEAL_PAYMENT · refId = the CrmDealPayment id (R-C.4) · basis PAID · basisSatang = that payment · user = the owner · status PENDING (approval chain exists) · periodKey = Thai month of countedAt (2026-09)",
      p11a.counted && p11b.counted && ok, "2 rows · shape", `counted=${p11a.counted}/${p11b.counted} rows=${rows.length} ${cut(j(rows.map((r) => ({ ref: r.refId === p11a.rowId ? "a" : r.refId === p11b.rowId ? "b" : r.refId, t: r.refType, basis: r.basis, bs: r.basisSatang, st: r.status, pk: r.periodKey, u: r.userId === uTH }))), 300)}${ABSENT}`);
    const a = byRef.get(p11a.rowId);
    const bb = byRef.get(p11b.rowId);
    chk("C3.3-S1.2", `partial payment = proportional commission (§11.6): 600,000 + 1,400,000 of T 2,000,000 at 5 % ⇒ ${e11a} + ${e11b} = ${full11} (the full commission) exactly`,
      a && bb && b(a.amountSatang) === e11a && b(bb.amountSatang) === e11b, `${e11a}/${e11b}`, `${a?.amountSatang ?? "-"}/${bb?.amountSatang ?? "-"}${ABSENT}`);
  }
  {
    const rows = await comm({ dealId: d12.id });
    const a = rows.find((r) => r.refId === p12a.rowId);
    const bb = rows.find((r) => r.refId === p12b.rowId);
    chk("C3.3-S1.3", `no satang lost (running-total rounding): T 3,333,333 · 5 % ⇒ full ${full12}; payments 1,111,111 then 2,222,222 ⇒ ${e12a} + ${e12b} = ${full12} (a per-payment floor would pay ${naive12}) · Σ rows = full`,
      rows.length === 2 && a && bb && b(a.amountSatang) === e12a && b(bb.amountSatang) === e12b && sumB(rows) === full12, `${e12a}+${e12b}=${full12}`, `${desc(rows)} Σ=${sumB(rows)}${ABSENT}`);
  }
  {
    const before = j(await comm({ dealId: { in: [d11.id, d12.id] } }));
    const dup = await call(PM.recordDocPayment, { tenantId: tidA, systemId: crmS1 }, { documentId: d11.inv, paymentId: p11a.paymentId, amountSatang: 600_000 }, { now: NOWP });
    const c1 = ctx(tidA, crmS1, null);
    const inp = { dealId: d11.id, refType: "DEAL_PAYMENT", refId: p11a.rowId };
    const seqR = [await call(F_.onPaid, c1, inp), await call(F_.onPaid, c1, inp)];
    const parR = await Promise.all([call(F_.onPaid, c1, inp), call(F_.onPaid, c1, inp), call(F_.onPaid, c1, { dealId: d12.id, refType: "DEAL_PAYMENT", refId: p12b.rowId })]);
    await settle(tidA);
    const after = j(await comm({ dealId: { in: [d11.id, d12.id] } }));
    chk("C3.3-S1.4", "replay: the same payment again through recordDocPayment (skipped DUPLICATE) · onPaid of an already-paid row ×2 in a row and ×2 in parallel (+ another in parallel) ⇒ the commission rows are byte-identical (no second row, no amount change, no throw)",
      dup.ok && dup.v?.skipped === "DUPLICATE" && [...seqR, ...parR].every((r) => r.ok) && after === before && JSON.parse(before).length === 4,
      "DUPLICATE · 5 ok · unchanged", `dup=${rs(dup)} calls=${[...seqR, ...parR].map((r) => (r.ok ? "ok" : r.err)).join("|")} unchanged=${after === before} rows=${JSON.parse(before).length}${ABSENT}`);
  }
  {
    const idx = ((await P.$queryRawUnsafe(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'CrmCommission'`)) as Any[]).map((r) => String(r.indexdef));
    const uniq = idx.some((d) => /UNIQUE/i.test(d) && /"dealId".*"ruleId".*"userId".*"refId"/.test(d));
    const a = (await comm({ dealId: d11.id }))[0];
    let dupErr = "no row to duplicate";
    if (a) {
      try {
        await P.$transaction(async (tx: Any) => {
          await tx.$executeRawUnsafe(
            `INSERT INTO "CrmCommission" ("id","tenantId","systemId","dealId","ruleId","userId","amountSatang","basisSatang","basis","periodKey","refType","refId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PAID'::"CrmCommissionBasis",$9,'DEAL_PAYMENT',$10)`,
            `${TAG}-dup`, a.tenantId, a.systemId, a.dealId, a.ruleId, a.userId, BigInt(1), BigInt(1), a.periodKey, a.refId);
          throw new Error("ROLLBACK-SENTINEL");
        });
      } catch (e) { dupErr = e instanceof Error ? e.message : String(e); }
    }
    chk("C3.3-S1.5", "the dedupe is a database fact, not a check-then-insert: the UNIQUE index (dealId, ruleId, userId, refId) exists on the live table and a second row with the same four values as a product-written commission is refused (23505) inside a rolled-back transaction",
      uniq && !!a && /23505|unique/i.test(dupErr) && !/ROLLBACK-SENTINEL/.test(dupErr), "unique · 23505", `index=${uniq} row=${!!a} insert=${cut(dupErr, 140)}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — WON basis (crmW: WON FIXED ฿150 + 3 % · PAID PCT 2 % — mockup 10 "คงที่ ฿150 ต่อดีล + 3% ของมูลค่า")
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2 · WON rules ──");
  const R_WON = { basis: "WON", kind: "FIXED", config: { fixedSatang: 15_000, pctBp: 300 } };
  const R_WP = { kind: "PCT", config: { pctBp: 200 } };
  const rWon = await mkRule(tidA, crmW, R_WON);
  const rWp = await mkRule(tidA, crmW, R_WP);
  const pW = await mkPipe(tidA, crmW);
  const lostW = (await P.crmLostReason.create({ data: { tenantId: tidA, systemId: crmW, key: `price-${rand}`, label: "ราคา" } })).id as string;
  const dW1 = await mkDeal(tidA, crmW, pW, uTH, 2_345_678);
  const dW2 = await mkDeal(tidA, crmW, pW, uTH, 1_000_000);
  const dW3 = await mkDeal(tidA, crmW, pW, uPK, 800_000);
  const cW = ctx(tidA, crmW, uO);
  const mvW1 = await call(DL.moveDeal, cW, aO, dW1.id, { stageId: pW.WON });
  await settle(tidA);
  const wonHist = (await P.crmDealStageHistory.findFirst({ where: { dealId: dW1.id, toStageId: pW.WON }, orderBy: { enteredAt: "desc" } })) as Any;
  const eWon = fullOf("FIXED", R_WON.config, b(2_345_678));
  const pkWon = wonHist ? periodOf(new Date(wonHist.enteredAt), 0) : "?";
  const rowsAfterWin = await comm({ dealId: dW1.id });
  const pW1 = await pay(dW1, "pw1", 1_000_000);
  const fullWp = fullOf("PCT", R_WP.config, b(2_345_678));
  const [eWp] = seqShares(fullWp, b(2_345_678), [b(1_000_000)]);
  console.log(`  [arith] dW1 T=2,345,678 · WON FIXED 15,000 + ⌊T·300/10⁴⌋ = ${eWon} · PAID 2 % full ⌊T·200/10⁴⌋=${fullWp} · share of 1,000,000 = ⌊${fullWp}·1,000,000/2,345,678⌋ = ${eWp}`);
  {
    const rows = await comm({ dealId: dW1.id });
    const won = rows.filter((r) => r.ruleId === rWon);
    const wp = rows.filter((r) => r.ruleId === rWp);
    const w = won[0];
    const okWin = mvW1.ok && rowsAfterWin.length === 1 && rowsAfterWin[0].ruleId === rWon;
    chk("C3.3-S2.1", `WON rule: moving the deal to WON (deals.moveDeal, the real path) ⇒ ONE row of the WON rule for the owner = ${eWon} (FIXED 15,000 + 3 % of T) · basis WON · refId '' · basisSatang = T · periodKey = Thai month of the WON history row (${pkWon}) — and NO row of the PAID rule on the win; the later payment of 1,000,000 adds only the PAID-rule row ${eWp} (the WON rule does not fire on money)`,
      okWin && won.length === 1 && w && b(w.amountSatang) === eWon && w.basis === "WON" && w.refId === "" && Number(w.basisSatang) === 2_345_678 && w.periodKey === pkWon && w.userId === uTH
      && wp.length === 1 && b(wp[0].amountSatang) === eWp && wp[0].refId === pW1.rowId,
      `won ${eWon} · paid ${eWp}`, `move=${rs(mvW1)} afterWin=${desc(rowsAfterWin)} now=${desc(rows)}${ABSENT}`);
  }
  {
    const before = j(await comm({ dealId: { in: [dW1.id, dW2.id, dW3.id] } }));
    const c0 = ctx(tidA, crmW, null);
    const seqR = [await call(F_.onWon, c0, { dealId: dW1.id }), await call(F_.onWon, c0, { dealId: dW1.id })];
    const parR = await Promise.all([call(F_.onWon, c0, { dealId: dW1.id }), call(F_.onWon, c0, { dealId: dW1.id })]);
    const wonEv = ((await P.outboxEvent.findMany({ where: { tenantId: tidA, type: "crm.deal.won" } })) as Any[]).filter((e) => e.payload?.dealId === dW1.id);
    for (const e of wonEv) { await deliver(e); await deliver(e); await Promise.all([deliver(e), deliver(e)]); }
    const mid = j(await comm({ dealId: { in: [dW1.id, dW2.id, dW3.id] } }));
    const mvL = await call(DL.moveDeal, cW, aO, dW2.id, { stageId: pW.LOST, lostReasonId: lostW });
    await settle(tidA);
    const lostWon = await call(F_.onWon, c0, { dealId: dW2.id });
    const p3 = await pay(dW3, "pw3", 800_000);
    const r2 = await comm({ dealId: dW2.id });
    const r3 = await comm({ dealId: dW3.id });
    const e3 = fullOf("PCT", R_WP.config, b(800_000));
    chk("C3.3-S2.2", `WON is idempotent and gated: onWon ×2 in a row + ×2 in parallel + the crm.deal.won event redelivered ×4 ⇒ still ONE WON row · a deal moved to LOST (and onWon forced on it) ⇒ no row · an OPEN deal that is paid in full gets only the PAID-rule row (${e3}), never a WON row`,
      [...seqR, ...parR].every((r) => r.ok) && wonEv.length >= 1 && mid === before && mvL.ok && r2.length === 0 && (lostWon.ok || refused(lostWon)) && p3.counted && r3.length === 1 && r3[0].ruleId === rWp && b(r3[0].amountSatang) === e3,
      "1 WON row · 0 · PAID only", `calls=${[...seqR, ...parR].map((r) => (r.ok ? "ok" : r.err)).join("|")} wonEvents=${wonEv.length} unchanged=${mid === before} lost=${rs(mvL)} lostRows=${r2.length} open=${desc(r3)}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — TIERED (marginal) + split between collaborators
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3 · TIERED / split ──");
  const R_T = { kind: "TIERED", config: { tiers: [{ uptoSatang: 10_000_000, pctBp: 300 }, { uptoSatang: 30_000_000, pctBp: 500 }, { uptoSatang: null, pctBp: 700 }] } };
  await mkRule(tidA, crmT, R_T);
  const pT = await mkPipe(tidA, crmT);
  const tierCases = [10_000_000, 10_000_100, 35_000_000];
  const tierDeals: Deal[] = [];
  for (const v of tierCases) { const d = await mkDeal(tidA, crmT, pT, uTH, v); tierDeals.push(d); await pay(d, `pt-${v}`, v); }
  const tierExp = tierCases.map((v) => fullOf("TIERED", R_T.config, b(v)));
  console.log(`  [arith] TIERED marginal 3 %≤1e7 · 5 %≤3e7 · 7 % above: T=10,000,000 ⇒ ${tierExp[0]} · T=10,000,100 ⇒ (1e7·300 + 100·500)/10⁴ = ${tierExp[1]} (flat 5 % would be 500,005) · T=35,000,000 ⇒ (1e7·300+2e7·500+5e6·700)/10⁴ = ${tierExp[2]}`);
  {
    const got: string[] = [];
    for (const d of tierDeals) { const rows = await comm({ dealId: d.id }); got.push(rows.length === 1 ? String(rows[0].amountSatang) : `rows=${rows.length}`); }
    chk("C3.3-S3.1", `TIERED is MARGINAL (mockup 10: "5% แรก ฿0–500,000 · 8% ส่วนเกิน") with one floor: exactly on a tier boundary the lower rate applies to all of it (${tierExp[0]}) · 100 satang above it only that excess earns the next rate (${tierExp[1]}) · across three tiers ${tierExp[2]}`,
      same(got, tierExp.map(String)), tierExp.join("/"), `${got.join("/")}${ABSENT}`);
  }
  const dT4 = await mkDeal(tidA, crmT, pT, uTH, 35_000_000);
  const pt4a = await pay(dT4, "pt4a", 12_345_678);
  const pt4b = await pay(dT4, "pt4b", 22_654_322);
  const fullT4 = fullOf("TIERED", R_T.config, b(35_000_000));
  const [eT4a, eT4b] = seqShares(fullT4, b(35_000_000), [b(12_345_678), b(22_654_322)]);
  console.log(`  [arith] dT4 TIERED full ${fullT4} paid 12,345,678 + 22,654,322 ⇒ ⌊${fullT4}·12,345,678/35,000,000⌋ = ${eT4a} + ${eT4b}`);
  {
    const rows = await comm({ dealId: dT4.id });
    const a = rows.find((r) => r.refId === pt4a.rowId);
    const bb = rows.find((r) => r.refId === pt4b.rowId);
    chk("C3.3-S3.2", `TIERED × partial payments: the full tiered commission ${fullT4} is shared by the running total — ${eT4a} + ${eT4b} = ${fullT4}, not the tier rate applied to each payment on its own`,
      rows.length === 2 && a && bb && b(a.amountSatang) === eT4a && b(bb.amountSatang) === eT4b, `${eT4a}+${eT4b}`, `${desc(rows)}${ABSENT}`);
  }
  const R_SP = { kind: "PCT", config: { pctBp: 1_000 }, split: 3_333 };
  await mkRule(tidA, crmSp, R_SP);
  const pSp = await mkPipe(tidA, crmSp);
  const dS1 = await mkDeal(tidA, crmSp, pSp, uTH, 1_000_015, [uC[0], uC[1], uC[2]]);
  await pay(dS1, "ps1", 1_000_015);
  const fullS1 = fullOf("PCT", R_SP.config, b(1_000_015));
  const spS1 = splitOf(fullS1, 3_333, 3);
  console.log(`  [arith] dS1 T=1,000,015 · 10 % ⇒ ${fullS1} · pool ⌊${fullS1}·3333/10⁴⌋ = ${spS1.each * BigInt(3)}+rem · each of 3 = ${spS1.each} · owner = ${spS1.owner}`);
  {
    const rows = await comm({ dealId: dS1.id });
    const own = rows.filter((r) => r.userId === uTH);
    const col = uC.map((u) => rows.filter((r) => r.userId === u));
    chk("C3.3-S3.3", `split (splitCollaboratorsBp 3333, 3 collaborators, equal shares — §11.6): 4 rows · each collaborator ${spS1.each} · owner ${spS1.owner} (the rounding remainder stays with the owner) · Σ = ${fullS1} exactly`,
      rows.length === 4 && own.length === 1 && b(own[0].amountSatang) === spS1.owner && col.every((c) => c.length === 1 && b(c[0].amountSatang) === spS1.each) && sumB(rows) === fullS1,
      `${spS1.owner} + 3×${spS1.each}`, `${desc(rows)} Σ=${sumB(rows)}${ABSENT}`);
  }
  const dS2 = await mkDeal(tidA, crmSp, pSp, uTH, 2_000_000, [uC[0], uTH]); // the owner listed as a collaborator ⇒ ignored (N = 1)
  const ps2a = await pay(dS2, "ps2a", 700_001);
  await P.crmDeal.update({ where: { id: dS2.id }, data: { ownerUserId: uPK, collaboratorUserIds: [uC[0], uPK] } }); // owner changes before the 2nd payment ⇒ credited = owner at payment (the new owner is listed too ⇒ still N = 1)
  const ps2b = await pay(dS2, "ps2b", 1_299_999);
  const fullS2 = fullOf("PCT", R_SP.config, b(2_000_000));
  const [aS2a, aS2b] = seqShares(fullS2, b(2_000_000), [b(700_001), b(1_299_999)]);
  const spA = splitOf(aS2a, 3_333, 1);
  const spB = splitOf(aS2b, 3_333, 1);
  console.log(`  [arith] dS2 full ${fullS2} · payment shares ${aS2a}/${aS2b} · split 1 collaborator: p1 thana ${spA.owner} + c1 ${spA.each} · p2 pook ${spB.owner} + c1 ${spB.each}`);
  {
    const rows = await comm({ dealId: dS2.id });
    const pick = (ref: string, u: string) => rows.filter((r) => r.refId === ref && r.userId === u);
    const ok = rows.length === 4 && pick(ps2a.rowId, uTH).length === 1 && b(pick(ps2a.rowId, uTH)[0].amountSatang) === spA.owner && pick(ps2a.rowId, uC[0]).length === 1 && b(pick(ps2a.rowId, uC[0])[0].amountSatang) === spA.each
      && pick(ps2b.rowId, uPK).length === 1 && b(pick(ps2b.rowId, uPK)[0].amountSatang) === spB.owner && pick(ps2b.rowId, uC[0]).length === 1 && b(pick(ps2b.rowId, uC[0])[0].amountSatang) === spB.each
      && pick(ps2b.rowId, uTH).length === 0 && sumB(rows) === fullS2;
    chk("C3.3-S3.4", `split × partial payments × owner change: each payment's share is split on its own (payment 1: thana ${spA.owner} + collaborator ${spA.each}; payment 2 after the owner became pook: pook ${spB.owner} + collaborator ${spB.each}) · the owner listed as a collaborator is not paid twice · Σ = ${fullS2}`,
      ok, `4 rows Σ ${fullS2}`, `${desc(rows)} Σ=${sumB(rows)}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // M — money gates: minDealSatang · payoutDelayDays (+ the Thai-midnight trap) · pipeline scope · BigInt past int32 · forged amount
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── M · money gates ──");
  await mkRule(tidA, crmG2, { kind: "PCT", config: { pctBp: 1_000 }, minDealSatang: 100_000 });
  const pG2 = await mkPipe(tidA, crmG2);
  const dG2a = await mkDeal(tidA, crmG2, pG2, uTH, 99_999);
  const dG2b = await mkDeal(tidA, crmG2, pG2, uTH, 100_000);
  await pay(dG2a, "pg2a", 99_999);
  const pg2b = await pay(dG2b, "pg2b", 100_000, T("2026-09-30T17:30:00Z")); // 1 Oct 00:30 Thai (still September in UTC)
  {
    const ra = await comm({ dealId: dG2a.id });
    const rb = await comm({ dealId: dG2b.id });
    chk("C3.3-M1", "minDealSatang 100,000 is inclusive: a deal of 99,999 earns nothing · a deal of exactly 100,000 earns 10,000",
      ra.length === 0 && rb.length === 1 && Number(rb[0].amountSatang) === 10_000, "0 · 10,000", `below=${ra.length} at=${desc(rb)}${ABSENT}`);
  }
  await mkRule(tidA, crmG3, { kind: "PCT", config: { pctBp: 1_000 }, delay: 7 });
  const pG3 = await mkPipe(tidA, crmG3);
  const dG3a = await mkDeal(tidA, crmG3, pG3, uTH, 100_000);
  const dG3b = await mkDeal(tidA, crmG3, pG3, uTH, 100_000);
  await pay(dG3a, "pg3a", 100_000, T("2026-09-25T03:00:00Z"));
  await pay(dG3b, "pg3b", 100_000, T("2026-09-20T03:00:00Z"));
  {
    const ea = periodOf(T("2026-09-25T03:00:00Z"), 7);
    const eb = periodOf(T("2026-09-20T03:00:00Z"), 7);
    const ec = periodOf(T("2026-09-30T17:30:00Z"), 0);
    const ra = await comm({ dealId: dG3a.id });
    const rb = await comm({ dealId: dG3b.id });
    const rc = await comm({ dealId: dG2b.id });
    chk("C3.3-M2", `periodKey = Thai month of (countedAt + payoutDelayDays): 25 Sep + 7 d ⇒ ${ea} · 20 Sep + 7 d ⇒ ${eb} · counted 2026-09-30T17:30Z (= 1 Oct 00:30 Thai) with no delay ⇒ ${ec} (a UTC month would say 2026-09)`,
      ra[0]?.periodKey === ea && rb[0]?.periodKey === eb && rc[0]?.periodKey === ec, `${ea}/${eb}/${ec}`, `${ra[0]?.periodKey ?? "-"}/${rb[0]?.periodKey ?? "-"}/${rc[0]?.periodKey ?? "-"}${ABSENT}`);
  }
  const pG1a = await mkPipe(tidA, crmG1);
  const pG1b = await mkPipe(tidA, crmG1);
  const rG1 = await mkRule(tidA, crmG1, { kind: "PCT", config: { pctBp: 1_000 }, pipelineId: pG1a.id });
  const dG1a = await mkDeal(tidA, crmG1, pG1a, uTH, 100_000);
  const dG1b = await mkDeal(tidA, crmG1, pG1b, uTH, 100_000);
  await pay(dG1a, "pg1a", 100_000);
  await pay(dG1b, "pg1b", 100_000);
  {
    const ra = await comm({ dealId: dG1a.id });
    const rb = await comm({ dealId: dG1b.id });
    chk("C3.3-M3", "rule scope: a rule limited to pipeline A pays a deal of pipeline A (10,000) and nothing for a deal of pipeline B in the same CRM system",
      ra.length === 1 && ra[0].ruleId === rG1 && Number(ra[0].amountSatang) === 10_000 && rb.length === 0, "1 · 0", `A=${desc(ra)} B=${rb.length}${ABSENT}`);
  }
  await mkRule(tidA, crmG4, { kind: "PCT", config: { pctBp: 10_000 } });
  const pG4 = await mkPipe(tidA, crmG4);
  const dG4a = await mkDeal(tidA, crmG4, pG4, uBIG, 2_000_000_000);
  const dG4b = await mkDeal(tidA, crmG4, pG4, uBIG, 2_000_000_000);
  await pay(dG4a, "pg4a", 2_000_000_000);
  await pay(dG4b, "pg4b", 2_000_000_000);
  {
    const cols = ((await P.$queryRawUnsafe(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND ((table_name='CrmCommission' AND column_name IN ('amountSatang','basisSatang')) OR (table_name='CrmCommissionRule' AND column_name='minDealSatang'))`)) as Any[]);
    const int8 = cols.length === 3 && cols.every((c) => c.data_type === "bigint");
    const rows = await comm({ dealId: { in: [dG4a.id, dG4b.id] } });
    const rep = await call(F_.report, ctx(tidA, crmG4, uO), aO, { periodKey: PK });
    const repRow = itemsOf(rep.v?.rows ?? []).find((r: Any) => r.userId === uBIG);
    const expNet = b(2_000_000_000) * BigInt(2);
    chk("C3.3-M4", `money is BigInt satang end to end: CrmCommission.amountSatang/basisSatang + rule.minDealSatang are int8 · two commissions of 2,000,000,000 each are stored exactly · report() sums them in SQL to ${expNet} (> int32) and returns it exactly (net and totals)`,
      int8 && rows.length === 2 && rows.every((r) => b(r.amountSatang) === b(2_000_000_000)) && rep.ok && repRow && b(repRow.netSatang) === expNet && b(rep.v?.totals?.netSatang ?? -1) === expNet,
      `int8 · ${expNet}`, `int8=${int8} rows=${desc(rows)} report=${rep.ok ? cut(j({ row: repRow, totals: rep.v?.totals }), 200) : rep.err}${ABSENT}`);
  }
  {
    const dG1c = await mkDeal(tidA, crmG1, pG1a, uTH, 100_000);
    const raw = await rawPay(dG1c, 50_000);
    const forged = await call(F_.onPaid, ctx(tidA, crmG1, null), { dealId: dG1c.id, refType: "DEAL_PAYMENT", refId: raw, satang: 999_999, amountSatang: 999_999 });
    const wrongDeal = await call(F_.onPaid, ctx(tidA, crmG1, null), { dealId: dG1a.id, refType: "DEAL_PAYMENT", refId: raw });
    const rc = await comm({ dealId: dG1c.id });
    const ra = await comm({ dealId: dG1a.id });
    const exp = seqShares(fullOf("PCT", { pctBp: 1_000 }, b(100_000)), b(100_000), [b(50_000)])[0];
    chk("C3.3-M5", `X1/X6 — the amount comes from the CrmDealPayment row, never from the input: onPaid with a forged satang 999,999 on a raw 50,000 payment pays ${exp} · onPaid naming another deal for that payment row writes nothing on that deal (no row / NOT_FOUND)`,
      forged.ok && rc.length === 1 && b(rc[0].amountSatang) === exp && (wrongDeal.ok || isNF(wrongDeal)) && ra.length === 1,
      `${exp} · untouched`, `forged=${rs(forged)} rows=${desc(rc)} wrongDeal=${rs(wrongDeal)} dealA=${ra.length}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4–S7 — approval → HR adjustment · reversal · hr.payroll.paid · approval cap (crmP: PCT 10 % · chain OWNER ⇒ PENDING)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S4 · approval → HrPayAdjustment ──");
  const rP = await mkRule(tidA, crmP, { kind: "PCT", config: { pctBp: 1_000 } });
  const pP = await mkPipe(tidA, crmP);
  const DP: Record<string, { d: Deal; p: Awaited<ReturnType<typeof pay>>; exp: bigint }> = {};
  const plan: [string, string, number][] = [
    ["th", uTH, 1_000_000], ["pk", uPK, 2_000_000], ["nk", uNK, 300_000], ["in", uIN, 400_000], ["rj", uTH, 500_000],
    ["s51", uTH, 600_000], ["s52", uTH, 700_000], ["s54", uWR, 800_000], ["s71", uTH, 1_000_000], ["s72", uTH, 1_000_010], ["x9", uTH, 100_000], ["pd", uPK, 200_000],
  ];
  for (const [k, owner, v] of plan) {
    const d = await mkDeal(tidA, crmP, pP, owner, v);
    const p = await pay(d, `pp-${k}`, v);
    DP[k] = { d, p, exp: fullOf("PCT", { pctBp: 1_000 }, b(v)) };
  }
  const cOf = async (k: string) => (await comm({ dealId: DP[k].d.id, refType: "DEAL_PAYMENT" }))[0] as Any;
  {
    const rows = await Promise.all(plan.map(([k]) => cOf(k)));
    const reqs = await Promise.all(rows.map((r) => reqOf(tidA, r?.id)));
    const ok = rows.every((r, i) => r && r.status === "PENDING" && b(r.amountSatang) === DP[plan[i][0]].exp && r.approvalRequestId && reqs[i] && reqs[i].id === r.approvalRequestId
      && reqs[i].status === "PENDING" && reqs[i].systemId === crmP && Number(reqs[i].amountSatang) === Number(r.amountSatang));
    chk("C3.3-S4.1", "approvalRequired (default) + a `crm.commission` chain ⇒ every new commission is PENDING and submitted to the central approval engine: ApprovalRequest(entityType \"crm.commission\" — R-C.10 · entityId = commission id · amountSatang = the amount · systemId = the CRM system) and CrmCommission.approvalRequestId points at it",
      ok, `${plan.length} PENDING + request`, `${rows.map((r, i) => `${plan[i][0]}:${r ? `${r.status}/${r.amountSatang}/${r.approvalRequestId ? "req" : "no-req"}/${reqs[i]?.status ?? "-"}` : "none"}`).join(" ")}${ABSENT}`);
  }
  for (const k of ["th", "pk", "nk", "in"]) await decideReq(tidA, (await cOf(k))?.id, "APPROVED");
  await decideReq(tidA, (await cOf("rj"))?.id, "REJECTED");
  await settle(tidA);
  const runs0 = await runsOf(hrA);
  {
    const th = await cOf("th");
    const pk = await cOf("pk");
    const at = await adjOf(th?.id);
    const ap = await adjOf(pk?.id);
    const expPk = freePeriod(PK, runs0, false);
    const okOne = (c: Any, adj: Any[], emp: string, amount: bigint) => c && c.status === "APPROVED" && !!c.decidedAt && adj.length === 1 && adj[0].kind === "COMMISSION" && b(adj[0].amountSatang) === amount
      && adj[0].employeeId === emp && adj[0].status === "PENDING" && adj[0].periodKey === expPk && adj[0].systemId === hrA && c.hrPayAdjustmentId === adj[0].id;
    chk("C3.3-S4.2", `the OWNER approves in the approval inbox (approval.decide → approval.request.approved → effect) ⇒ commission APPROVED (decidedAt) ⇒ ONE HrPayAdjustment through the HR facade: kind COMMISSION · amount = commission · employee = the user's linked employee · HR's own 4-eyes status PENDING · periodKey ${expPk} · crmCommissionId ↔ hrPayAdjustmentId linked both ways`,
      okOne(th, at, eTH, DP.th.exp) && okOne(pk, ap, ePK, DP.pk.exp), "2 × APPROVED + 1 adj", `th=${th?.status}/${cut(j(at.map((a) => ({ k: a.kind, a: a.amountSatang, e: a.employeeId === eTH, s: a.status, p: a.periodKey, l: th?.hrPayAdjustmentId === a.id }))), 160)} pk=${pk?.status}/${ap.length}${ABSENT}`);
  }
  let nokMineBefore: Res = MISSING;
  {
    const nk = await cOf("nk");
    const adj = await adjOf(nk?.id);
    nokMineBefore = await call(F_.mine, ctxP(uNK), aNK, {});
    const row = itemsOf(nokMineBefore.v).find((r: Any) => r?.id === nk?.id);
    chk("C3.3-S4.3", "a user with NO linked employee: approved ⇒ status APPROVED, no HrPayAdjustment, hrPayAdjustmentId null, and his \"my commissions\" row says \"รอผูกพนักงาน\" (payroll = WAITING_EMPLOYEE)",
      nk?.status === "APPROVED" && adj.length === 0 && !nk?.hrPayAdjustmentId && row && (row.payroll === "WAITING_EMPLOYEE" || j(row).includes(WAITING)),
      "APPROVED · waiting", `status=${nk?.status} adj=${adj.length} mine=${nokMineBefore.ok ? cut(j(row), 160) : nokMineBefore.err}${ABSENT}`);
  }
  await mkEmp(tidA, hrA, uNK); // HR links nok (the link "appears")
  const eNK = ((await P.hrEmployee.findFirst({ where: { tenantId: tidA, linkedUserId: uNK } })) as Any).id as string;
  {
    const cP0 = ctx(tidA, crmP, null);
    const s1 = await call(F_.syncPayroll, cP0, {});
    const s2 = await call(F_.syncPayroll, cP0, {});
    const par = await Promise.all([call(F_.syncPayroll, cP0, {}), call(F_.syncPayroll, cP0, { userId: uNK })]);
    await settle(tidA);
    const nk = await cOf("nk");
    const adj = await adjOf(nk?.id);
    const expP = freePeriod(nk?.periodKey ?? PK, await runsOf(hrA), false);
    chk("C3.3-S4.4", `the link appears ⇒ syncPayroll picks the waiting commission up: ×2 in a row + ×2 in parallel ⇒ exactly ONE adjustment (COMMISSION ${DP.nk.exp} · employee = the new link · period ${expP}) and the commission points at it`,
      [s1, s2, ...par].every((r) => r.ok) && adj.length === 1 && adj[0].employeeId === eNK && b(adj[0].amountSatang) === DP.nk.exp && adj[0].periodKey === expP && nk?.hrPayAdjustmentId === adj[0].id,
      "1 adj", `calls=${[s1, s2, ...par].map((r) => (r.ok ? j(r.v) : r.err)).join("|")} adj=${adj.length} emp=${adj[0]?.employeeId === eNK}${ABSENT}`);
  }
  {
    const inn = await cOf("in");
    const rj = await cOf("rj");
    await call(F_.syncPayroll, ctx(tidA, crmP, null), {});
    const ai = await adjOf(inn?.id);
    const ar = await adjOf(rj?.id);
    chk("C3.3-S4.5", "never pay the wrong person: a user whose linked employee is INACTIVE (employeeOfUser still returns it — MASTER-PLAN C0.3 note) stays APPROVED waiting even after syncPayroll · a commission whose approval was REJECTED is REJECTED with no adjustment",
      inn?.status === "APPROVED" && ai.length === 0 && !inn?.hrPayAdjustmentId && rj?.status === "REJECTED" && ar.length === 0,
      "waiting · REJECTED", `inactive=${inn?.status}/${ai.length} rejected=${rj?.status}/${ar.length}${ABSENT}`);
  }

  console.log("\n── S7 · approval cap ──");
  {
    const s71 = await cOf("s71");
    const s72 = await cOf("s72");
    const r1 = await call(F_.approve, ctxP(uM), aM, { id: s71?.id, reason: "ตรวจยอดกับใบเสร็จแล้ว" });
    await settle(tidA);
    const a71 = await adjOf(s71?.id);
    const c71 = await cOf("s71");
    chk("C3.3-S7.1", `manual approve within the cap: a MANAGER whose crm._maxCommissionApproveSatang = ${CAP} approves a commission of exactly ${DP.s71.exp} (≤ cap is inclusive) ⇒ APPROVED + one COMMISSION adjustment`,
      r1.ok && c71?.status === "APPROVED" && a71.length === 1 && b(a71[0].amountSatang) === DP.s71.exp, "APPROVED · 1 adj", `approve=${rs(r1)} status=${c71?.status} adj=${a71.length}${ABSENT}`);
    const r2 = await call(F_.approve, ctxP(uM), aM, { id: s72?.id, reason: "ตรวจยอดกับใบเสร็จแล้ว" });
    await settle(tidA);
    const mid = await cOf("s72");
    const aMid = await adjOf(s72?.id);
    const r3 = await call(F_.approve, ctxP(uO), aO, { id: s72?.id, reason: "เจ้าของอนุมัติยอดเกินเพดาน" });
    await settle(tidA);
    const c72 = await cOf("s72");
    const a72 = await adjOf(s72?.id);
    chk("C3.3-S7.2", `above the cap (${DP.s72.exp} > ${CAP}) the MANAGER gets APPROVAL_REQUIRED (Thai) and nothing changes (still PENDING, request still attached, no adjustment) · the OWNER (no cap) approves it ⇒ APPROVED + one adjustment`,
      isAR(r2) && mid?.status === "PENDING" && !!mid?.approvalRequestId && aMid.length === 0 && r3.ok && c72?.status === "APPROVED" && a72.length === 1,
      "APPROVAL_REQUIRED · then APPROVED", `manager=${rs(r2)} mid=${mid?.status}/${aMid.length} owner=${rs(r3)} final=${c72?.status}/${a72.length}${ABSENT}`);
  }

  console.log("\n── S5 · reversal (before the payroll run) ──");
  let s52Rev: Any = null;
  {
    const s51 = await cOf("s51");
    const rv = await call(PM.reverseDocPayment, { tenantId: tidA, systemId: crmP }, { documentId: DP.s51.d.inv, paymentId: DP.s51.p.paymentId });
    await settle(tidA);
    const late = await decideReq(tidA, s51?.id, "APPROVED"); // the chain decides after the money was voided
    await settle(tidA);
    const after = (await comm({ id: s51?.id ?? "-" }))[0] as Any;
    const revRows = await comm({ reversedOfId: s51?.id ?? "-" });
    const adj = await adjOf(s51?.id);
    chk("C3.3-S5.1", "reverse BEFORE approval: the payment is voided (reverseDocPayment — the C2.7 path) ⇒ the PENDING commission becomes REJECTED (or is removed) with NO negative row and NO adjustment · an approval of its request arriving later changes nothing (status-guarded effect)",
      rv.ok && !!s51 && (after === undefined || after.status === "REJECTED") && revRows.length === 0 && adj.length === 0,
      "REJECTED · 0 · 0", `void=${rs(rv)} lateDecide=${j(late)} after=${after?.status ?? "removed"} reversals=${revRows.length} adj=${adj.length}${ABSENT}`);
  }
  {
    const r = await call(F_.approve, ctxP(uO), aO, { id: (await cOf("s52"))?.id, reason: "อนุมัติก่อนยกเลิกบิล" });
    await settle(tidA);
    const orig = await cOf("s52");
    const origAdj = await adjOf(orig?.id);
    const runsNow = await runsOf(hrA);
    const base = origAdj[0]?.periodKey ?? orig?.periodKey ?? PK;
    const expK = freePeriod(base, runsNow, true);
    const rv = await call(PM.reverseDocPayment, { tenantId: tidA, systemId: crmP }, { documentId: DP.s52.d.inv, paymentId: DP.s52.p.paymentId });
    await settle(tidA);
    const revRows = await comm({ reversedOfId: orig?.id ?? "-" });
    s52Rev = revRows[0] ?? null;
    const dAdj = await adjOf(s52Rev?.id);
    const origAfter = (await comm({ id: orig?.id ?? "-" }))[0] as Any;
    chk("C3.3-S5.2", `reverse AFTER approval (adjustment requested, not yet in a run): ONE REVERSED row = −${DP.s52.exp} · reversedOfId = the original · refType REVERSAL · refId = original id · periodKey ${expK} (first month after ${base} without a payroll run) · ONE DEDUCTION adjustment ${DP.s52.exp} (HR amounts are positive) in ${expK} linked to the reversal row · the original row keeps APPROVED`,
      r.ok && origAdj.length === 1 && rv.ok && revRows.length === 1 && b(s52Rev.amountSatang) === -DP.s52.exp && s52Rev.status === "REVERSED" && s52Rev.refType === "REVERSAL" && s52Rev.refId === orig?.id
      && s52Rev.periodKey === expK && dAdj.length === 1 && dAdj[0].kind === "DEDUCTION" && b(dAdj[0].amountSatang) === DP.s52.exp && dAdj[0].periodKey === expK && dAdj[0].employeeId === eTH
      && s52Rev.hrPayAdjustmentId === dAdj[0].id && origAfter?.status === "APPROVED",
      `−${DP.s52.exp} · DEDUCTION ${expK}`, `approve=${rs(r)} origAdj=${origAdj.length} void=${rs(rv)} rev=${cut(j(revRows.map((x) => ({ a: x.amountSatang, s: x.status, t: x.refType, p: x.periodKey }))), 160)} ded=${cut(j(dAdj.map((a) => ({ k: a.kind, a: a.amountSatang, p: a.periodKey }))), 120)} orig=${origAfter?.status}${ABSENT}`);
  }
  {
    // X4.2 — reversal never double-reverses: the void replayed + commissions.reverse ×2 in a row + ×2 in parallel
    const orig = await cOf("s52");
    const rv2 = await call(PM.reverseDocPayment, { tenantId: tidA, systemId: crmP }, { documentId: DP.s52.d.inv, paymentId: DP.s52.p.paymentId });
    const c0 = ctx(tidA, crmP, null);
    const rr = [await call(F_.reverse, c0, { refId: DP.s52.p.rowId, reason: "ซ้ำ" }), await call(F_.reverse, c0, { refId: DP.s52.p.rowId, reason: "ซ้ำ" })];
    rr.push(...(await Promise.all([call(F_.reverse, c0, { refId: DP.s52.p.rowId, reason: "ซ้ำ" }), call(F_.reverse, c0, { refId: DP.s52.p.rowId, reason: "ซ้ำ" })])));
    await settle(tidA);
    const revRows = await comm({ reversedOfId: orig?.id ?? "-" });
    const dAdj = revRows.length ? await adjOf(revRows[0].id) : [];
    chk("C3.3-X4.2", "X4 (M10) reversal never double-reverses: the void replayed + commissions.reverse(refId) ×2 in a row + ×2 in parallel ⇒ still ONE negative row and ONE deduction",
      rv2.ok && rr.every((r) => r.ok) && revRows.length === 1 && dAdj.length === 1, "1 · 1", `void2=${rs(rv2)} calls=${rr.map((r) => (r.ok ? "ok" : r.err)).join("|")} reversals=${revRows.length} deductions=${dAdj.length}${ABSENT}`);
  }
  {
    const r = await call(F_.approve, ctxP(uO), aO, { id: (await cOf("s54"))?.id, reason: "อนุมัติ รอผูกพนักงาน" });
    await settle(tidA);
    const orig = await cOf("s54");
    const rv = await call(PM.reverseDocPayment, { tenantId: tidA, systemId: crmP }, { documentId: DP.s54.d.inv, paymentId: DP.s54.p.paymentId });
    await settle(tidA);
    const revRows = await comm({ reversedOfId: orig?.id ?? "-" });
    await mkEmp(tidA, hrA, uWR); // the link appears AFTER the reversal
    const sy = await call(F_.syncPayroll, ctx(tidA, crmP, null), {});
    await settle(tidA);
    const a1 = await adjOf(orig?.id);
    const a2 = await adjOf(revRows[0]?.id);
    chk("C3.3-S5.4", `a waiting (no employee) APPROVED commission that is reversed: ONE REVERSED row −${DP.s54.exp} and no adjustment · when the employee link appears later, syncPayroll sends NEITHER the original nor the reversal to payroll (they cancel out — nothing was ever paid)`,
      r.ok && orig?.status === "APPROVED" && rv.ok && revRows.length === 1 && b(revRows[0].amountSatang) === -DP.s54.exp && sy.ok && a1.length === 0 && a2.length === 0,
      "1 reversal · 0 adj", `approve=${rs(r)} void=${rs(rv)} reversals=${revRows.length} sync=${rs(sy)} adjOrig=${a1.length} adjRev=${a2.length}${ABSENT}`);
  }
  {
    // X9.2 — reject needs a reason and is audited; approve/reverse audited with the reason
    const x9 = await cOf("x9");
    const noReason = await call(F_.reject, ctxP(uO), aO, { id: x9?.id, reason: "" });
    const mid = await cOf("x9");
    const ok = await call(F_.reject, ctxP(uO), aO, { id: x9?.id, reason: "ยอดซ้ำกับดีลอื่น" });
    await settle(tidA);
    const fin = await cOf("x9");
    const s71 = await cOf("s71");
    const s52 = await cOf("s52");
    const aud = (await P.auditLog.findMany({ where: { tenantId: tidA, action: { startsWith: "crm.commission" } } })) as Any[];
    const has = (action: RegExp, target: string | undefined, text?: string) => aud.some((a) => action.test(a.action) && a.targetId === target && (!text || j(a).includes(text)));
    chk("C3.3-X9.2", "X9: reject without a reason ⇒ VALIDATION (nothing changes) · with a reason ⇒ REJECTED + audit `crm.commission.reject` carrying the reason · the MANAGER approve of S7.1 audited `crm.commission.approve` with its reason · the S5.2 reversal audited `crm.commission.reverse` on the original",
      isVal(noReason) && mid?.status === "PENDING" && ok.ok && fin?.status === "REJECTED" && has(/reject/, x9?.id, "ยอดซ้ำกับดีลอื่น") && has(/approve/, s71?.id, "ตรวจยอดกับใบเสร็จแล้ว") && has(/revers/, s52?.id),
      "VALIDATION · 3 audits", `noReason=${rs(noReason)} reject=${rs(ok)} status=${fin?.status} audits=${aud.map((a) => a.action).join(",") || "-"}${ABSENT}`, "MAJOR");
  }

  console.log("\n── S6 · hr.payroll.paid ──");
  for (const k of ["th", "pk", "nk"]) {
    const c = await cOf(k);
    for (const a of await adjOf(c?.id)) await PAY.decideAdjustment(cHR, a.id, "APPROVED", { userId: uO, isOwner: true });
  }
  const run09 = await PAY.createPayrollRun(cHR, { periodKey: PK, payDate: T("2026-09-30T03:00:00Z") });
  await PAY.approveRun(cHR, run09.id);
  const mp1 = await PAY.markPaid(cHR, run09.id);
  const mp2 = await PAY.markPaid(cHR, run09.id);
  const evPaid = () => P.outboxEvent.findMany({ where: { tenantId: tidA, type: "hr.payroll.paid" } }) as Promise<Any[]>;
  const paidEvents0 = await evPaid();
  await settle(tidA);
  {
    const src = /export async function markPaid\([\s\S]*?\n}\n/.exec(read(PAYROLL_FILE))?.[0] ?? "";
    const inTx = /\$transaction/.test(src) && /emitOutbox\(/.test(src) && /hr\.payroll\.paid/.test(src);
    const e = paidEvents0[0];
    const keys = e ? Object.keys(e.payload ?? {}).sort() : [];
    chk("C3.3-S6.1", "markPaid emits `hr.payroll.paid` INSIDE the transaction of its guarded APPROVED→PAID update [static: $transaction + emitOutbox in markPaid] · exactly ONE event for the run (a second markPaid ⇒ ok:false, no second event) · key `hr.payroll.paid#<runId>` · payload exactly { runId, periodKey } · systemId = the HR system",
      inTx && mp1.ok === true && mp2.ok === false && paidEvents0.length === 1 && e.idempotencyKey === `hr.payroll.paid#${run09.id}` && j(keys) === j(["periodKey", "runId"]) && e.payload.runId === run09.id && e.payload.periodKey === PK && e.systemId === hrA,
      "1 event · ids only", `static=${inTx} mark=${mp1.ok}/${mp2.ok} events=${paidEvents0.length} key=${e?.idempotencyKey ?? "-"} payload=${j(e?.payload)} sys=${e?.systemId === hrA}${ABSENT}`);
  }
  {
    const st = async (k: string) => (await cOf(k))?.status;
    const got = { th: await st("th"), pk: await st("pk"), nk: await st("nk"), s71: await st("s71"), s72: await st("s72"), s52: await st("s52"), s52rev: s52Rev ? ((await comm({ id: s52Rev.id }))[0] as Any)?.status : "-" };
    chk("C3.3-S6.2", "after `hr.payroll.paid` is consumed: the three commissions whose adjustments were in that run (thana · pook · nok) are PAID · commissions whose adjustments are still PENDING at HR (S7 ×2 · the S5.2 original) stay APPROVED · the S5.2 reversal row stays REVERSED",
      j(got) === j({ th: "PAID", pk: "PAID", nk: "PAID", s71: "APPROVED", s72: "APPROVED", s52: "APPROVED", s52rev: "REVERSED" }), "3 PAID · 3 APPROVED · REVERSED", `${j(got)}${ABSENT}`);
  }
  {
    const snap0 = j(await comm({ systemId: crmP }));
    const mp3 = await PAY.markPaid(cHR, run09.id);
    const evs = await evPaid();
    for (const e of evs) { await deliver(e); await deliver(e); await Promise.all([deliver(e), deliver(e)]); }
    const snap1 = j(await comm({ systemId: crmP }));
    chk("C3.3-X4.3", "X4: `hr.payroll.paid` replay (×2 in a row + ×2 in parallel) and a third markPaid ⇒ still one event and every commission row byte-identical (PAID rows unchanged, nothing flips back or twice)",
      mp3.ok === false && evs.length === 1 && snap1 === snap0, "unchanged", `mark3=${mp3.ok} events=${evs.length} unchanged=${snap1 === snap0}${ABSENT}`);
  }

  console.log("\n── S5.3 · reversal after PAID ──");
  {
    const run10 = await PAY.createPayrollRun(cHR, { periodKey: nextMonth(PK), payDate: T("2026-10-30T03:00:00Z") }); // an existing (DRAFT) run ⇒ that period is taken
    const closedSnap = async () => j({
      r9: await P.hrPayrollRun.findUnique({ where: { id: run09.id } }), i9: await P.hrPayrollItem.findMany({ where: { runId: run09.id }, orderBy: { id: "asc" } }),
      a9: await P.hrPayAdjustment.findMany({ where: { runId: run09.id }, orderBy: { id: "asc" } }),
      r10: await P.hrPayrollRun.findUnique({ where: { id: run10.id } }), i10: await P.hrPayrollItem.findMany({ where: { runId: run10.id }, orderBy: { id: "asc" } }),
    });
    const before = await closedSnap();
    const orig = await cOf("pk");
    const origAdj = await adjOf(orig?.id);
    const expK = freePeriod(origAdj[0]?.periodKey ?? PK, await runsOf(hrA), true);
    const rv = await call(PM.reverseDocPayment, { tenantId: tidA, systemId: crmP }, { documentId: DP.pk.d.inv, paymentId: DP.pk.p.paymentId });
    await settle(tidA);
    const after = await closedSnap();
    const revRows = await comm({ reversedOfId: orig?.id ?? "-" });
    const dAdj = await adjOf(revRows[0]?.id);
    const origAfter = await cOf("pk");
    chk("C3.3-S5.3", `reverse AFTER PAID: the PAID row stays PAID · ONE REVERSED row −${DP.pk.exp} and ONE DEDUCTION adjustment for pook's employee in ${expK} — the first month after ${origAdj[0]?.periodKey ?? PK} with no payroll run (${nextMonth(PK)} already has a DRAFT run) · the closed run ${PK} (run + items + its adjustments) and the ${nextMonth(PK)} run are byte-identical — a closed payroll run is never edited`,
      rv.ok && origAfter?.status === "PAID" && revRows.length === 1 && b(revRows[0].amountSatang) === -DP.pk.exp && revRows[0].periodKey === expK && dAdj.length === 1 && dAdj[0].kind === "DEDUCTION"
      && b(dAdj[0].amountSatang) === DP.pk.exp && dAdj[0].periodKey === expK && dAdj[0].employeeId === ePK && !dAdj[0].runId && after === before,
      `PAID · −${DP.pk.exp} · DEDUCTION ${expK} · runs untouched`, `void=${rs(rv)} orig=${origAfter?.status} rev=${desc(revRows)}/${revRows[0]?.periodKey ?? "-"} ded=${cut(j(dAdj.map((a) => ({ k: a.kind, a: a.amountSatang, p: a.periodKey }))), 120)} runsUntouched=${after === before}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X4.4 · X4.5 — approval replay after a manual decision · partial unique on HrPayAdjustment.crmCommissionId
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X4.4 · X4.5 ──");
  {
    const s71 = await cOf("s71");
    const th = await cOf("th");
    const late = await decideReq(tidA, s71?.id, "APPROVED");
    await settle(tidA);
    const apEv = ((await P.outboxEvent.findMany({ where: { tenantId: tidA, type: "approval.request.approved" } })) as Any[]).filter((e) => e.payload?.entityId === th?.id || e.payload?.entityId === s71?.id);
    for (const e of apEv) { await deliver(e); await Promise.all([deliver(e), deliver(e)]); }
    const a71 = await adjOf(s71?.id);
    const ath = await adjOf(th?.id);
    chk("C3.3-X4.4", "X4: the approval-approved event of an already-approved commission redelivered ×3 (incl. 2 in parallel), and the chain approving a request the MANAGER had already settled by hand ⇒ still exactly ONE adjustment per commission",
      apEv.length >= 1 && a71.length === 1 && ath.length === 1, "1 · 1", `lateDecide=${j(late)} events=${apEv.length} s71=${a71.length} th=${ath.length}${ABSENT}`);
  }
  {
    const th = await cOf("th");
    const a = (await adjOf(th?.id))[0] as Any;
    let dupErr = "no adjustment to duplicate";
    let nullOk = false;
    if (a) {
      try {
        await P.$transaction(async (tx: Any) => {
          const ins = (id: string, cid: string | null) => tx.$executeRawUnsafe(
            `INSERT INTO "HrPayAdjustment" ("id","tenantId","systemId","employeeId","periodKey","kind","amountSatang","crmCommissionId") VALUES ($1,$2,$3,$4,$5,'COMMISSION'::"HrPayItemKind",1,$6)`,
            id, a.tenantId, a.systemId, a.employeeId, "2027-01", cid);
          await ins(`${TAG}-n1`, null);
          await ins(`${TAG}-n2`, null);
          nullOk = true;
          await ins(`${TAG}-dup`, a.crmCommissionId);
          throw new Error("ROLLBACK-SENTINEL");
        });
      } catch (e) { dupErr = e instanceof Error ? e.message : String(e); }
    }
    const before = (await adjOf(th?.id)).length;
    const fac = await call(HRF.requestAdjustment, cHR, { employeeId: eTH, periodKey: "2027-01", kind: "COMMISSION", amountSatang: 1, note: "ทดสอบซ้ำ", requestedById: uO, crmCommissionId: th?.id });
    const after = (await adjOf(th?.id)).length;
    const facRefused = (!fac.ok && fac.code !== "MISSING_FUNCTION") || (fac.ok && fac.v?.ok === false);
    chk("C3.3-X4.5", "the partial unique on HrPayAdjustment.crmCommissionId is real: two NULL rows coexist (ordinary HR adjustments untouched) but a second row for the same commission is refused (23505, rolled back) · and through the HR facade `requestAdjustment({ …, crmCommissionId })` a second adjustment for the same commission is refused (ok:false or a thrown error) — the count stays 1",
      !!a && nullOk && /23505|unique/i.test(dupErr) && !/ROLLBACK-SENTINEL/.test(dupErr) && facRefused && before === 1 && after === 1,
      "NULLs ok · 23505 · facade refuses", `row=${!!a} nulls=${nullOk} insert=${cut(dupErr, 120)} facade=${rs(fac)} count=${before}→${after}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X1 — scope: "my commissions" · approval list needs the key · cross-tenant/system · uiVersion 1 untouched
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X1 · scope ──");
  {
    const mineTH = await call(F_.mine, ctxP(uTH), aTH, {});
    const mineNK = await call(F_.mine, ctxP(uNK), aNK, {});
    const sqlTH = ((await comm({ systemId: crmP, userId: uTH })) as Any[]).map((r) => String(r.id)).sort();
    const sqlNK = ((await comm({ systemId: crmP, userId: uNK })) as Any[]).map((r) => String(r.id)).sort();
    const listTH = await call(F_.list, ctxP(uTH), aTH, {});
    const repTH = await call(F_.report, ctxP(uTH), aTH, { periodKey: PK });
    const repUsers = itemsOf(repTH.v?.rows ?? []).map((r: Any) => r.userId);
    chk("C3.3-X1.1", "a STAFF sees only his own commissions: mine(thana) = exactly thana's rows of THIS CRM system (his rows in 8 other systems excluded) · mine(nok) = nok's rows · list() without crm.commission.view ⇒ FORBIDDEN/NOT_FOUND · report() for him has only his own row",
      mineTH.ok && same(idsOf(mineTH.v), sqlTH) && sqlTH.length >= 5 && mineNK.ok && same(idsOf(mineNK.v), sqlNK) && (isFB(listTH) || isNF(listTH)) && repTH.ok && repUsers.every((u: string) => u === uTH),
      `${sqlTH.length} · ${sqlNK.length} · refused · own row`, `mineTH=${mineTH.ok ? idsOf(mineTH.v).length : mineTH.err} mineNK=${mineNK.ok ? idsOf(mineNK.v).length : mineNK.err} list=${rs(listTH)} reportUsers=${repTH.ok ? repUsers.length : repTH.err}${ABSENT}`);
  }
  {
    const auditBefore = (await P.auditLog.count({ where: { tenantId: tidA, action: { startsWith: "crm.commission" } } })) as number;
    const pTH = await call(F_.pending, ctxP(uTH), aTH);
    const target = (await comm({ systemId: crmP, status: "PENDING" }))[0] as Any;
    const apTH = await call(F_.approve, ctxP(uTH), aTH, { id: target?.id ?? "-", reason: "พนักงานขอเอง" });
    const still = target ? ((await comm({ id: target.id }))[0] as Any)?.status : "-";
    const pM = await call(F_.pending, ctxP(uM), aM);
    const sqlPending = ((await comm({ systemId: crmP, status: "PENDING" })) as Any[]).map((r) => String(r.id)).sort();
    const auditAfter = (await P.auditLog.count({ where: { tenantId: tidA, action: { startsWith: "crm.commission" } } })) as number;
    chk("C3.3-X1.2", "the approval list needs crm.commission.approve: a STAFF gets FORBIDDEN/NOT_FOUND from pending() and from approve() (the row stays PENDING, no audit) · the MANAGER's pending() = exactly the PENDING rows of this system (SQL)",
      (isFB(pTH) || isNF(pTH)) && (isFB(apTH) || isNF(apTH)) && (!target || still === "PENDING") && pM.ok && same(idsOf(pM.v), sqlPending) && auditAfter === auditBefore,
      "refused · SQL", `staffPending=${rs(pTH)} staffApprove=${rs(apTH)} still=${still} managerPending=${pM.ok ? `${idsOf(pM.v).length}/${sqlPending.length}` : pM.err} audit+${auditAfter - auditBefore}${ABSENT}`);
  }
  {
    const anyRow = (await comm({ systemId: crmP, status: "PENDING" }))[0] as Any ?? (await cOf("s71"));
    const foreign = await call(F_.approve, ctx(tidB, crmP, uO), aO, { id: anyRow?.id ?? "-", reason: "ข้ามร้าน" });
    const otherSys = await call(F_.approve, ctx(tidA, crmS1, uO), aO, { id: anyRow?.id ?? "-", reason: "ข้ามระบบ" });
    const mineB = await call(F_.mine, ctx(tidB, crmP, uO), aO, {});
    const ruleBad = await call(F_.createRule, ctx(tidA, crmP, uO), aO, { name: "ข้ามระบบ", kind: "PCT", config: { pctBp: 100 }, pipelineId: pS1.id });
    const ruleRows = (await P.crmCommissionRule.count({ where: { systemId: crmP } })) as number;
    chk("C3.3-X1.3", "cross-tenant / cross-system ⇒ NOT_FOUND, never 403 and never a leak: approve() through another tenant's ctx or another CRM system of the same tenant · mine() with a foreign ctx · a rule naming a pipeline of another system ⇒ VALIDATION/NOT_FOUND with nothing written",
      isNF(foreign) && isNF(otherSys) && isNF(mineB) && (isVal(ruleBad) || isNF(ruleBad)) && ruleRows === 1,
      "404 × 3 · refused", `foreign=${rs(foreign)} otherSys=${rs(otherSys)} mineB=${rs(mineB)} rule=${rs(ruleBad)} rules=${ruleRows}${ABSENT}`);
  }
  {
    await P.crmCommissionRule.create({ data: { tenantId: tidA, systemId: crmV, name: `กฎ v1 ${TAG}`, basis: "PAID", kind: "PCT", config: { pctBp: 1_000 }, productIds: [] } });
    await P.crmCommissionRule.create({ data: { tenantId: tidA, systemId: crmV, name: `กฎ v1 won ${TAG}`, basis: "WON", kind: "FIXED", config: { fixedSatang: 5_000 }, productIds: [] } });
    const pV = await mkPipe(tidA, crmV);
    const dV = await mkDeal(tidA, crmV, pV, uTH, 100_000);
    const rawV = await rawPay(dV, 100_000);
    const recV = await call(PM.recordDocPayment, { tenantId: tidA, systemId: crmV }, { documentId: dV.inv, paymentId: `${TAG}-pv`, amountSatang: 100_000 }, { now: NOWP });
    const cV = ctx(tidA, crmV, null);
    const op = await call(F_.onPaid, cV, { dealId: dV.id, refType: "DEAL_PAYMENT", refId: rawV });
    const ow = await call(F_.onWon, cV, { dealId: dV.id });
    const cr = await call(F_.createRule, ctx(tidA, crmV, uO), aO, { name: "v1", kind: "PCT", config: { pctBp: 100 } });
    const mv = await call(F_.mine, ctx(tidA, crmV, uTH), aTH, {});
    await settle(tidA);
    const rows = (await P.crmCommission.count({ where: { systemId: crmV } })) as number;
    const rules = (await P.crmCommissionRule.count({ where: { systemId: crmV } })) as number;
    chk("C3.3-X1.4", "R-E.14: a uiVersion-1 CRM system is untouched — its (raw) rules and a COUNTED payment produce NO commission: recordDocPayment skips (V1), onPaid/onWon return without writing (or CrmV2DisabledError), createRule/mine ⇒ CrmV2DisabledError · 0 commission rows, rules unchanged",
      recV.ok && recV.v?.skipped === "V1" && (op.ok || isV1(op)) && (ow.ok || isV1(ow)) && isV1(cr) && isV1(mv) && rows === 0 && rules === 2,
      "0 rows · disabled", `record=${rs(recV)} onPaid=${rs(op)} onWon=${rs(ow)} createRule=${rs(cr)} mine=${rs(mv)} rows=${rows} rules=${rules}${ABSENT}`);
  }
  {
    const pdg = await call(F_.pending, ctxP(uO), aO);
    const other = await call(F_.onPaid, ctx(tidB, crmP, null), { dealId: DP.th.d.id, refType: "DEAL_PAYMENT", refId: DP.th.p.rowId });
    const rowsB = (await P.crmCommission.count({ where: { tenantId: tidB } })) as number;
    chk("C3.3-X1.5", "the bridge entry points are tenant-bound too: onPaid through another tenant's ctx naming this tenant's deal/payment ⇒ NOT_FOUND or a silent no-op, nothing written in either tenant · the OWNER's pending() works (positive control)",
      pdg.ok && (other.ok || isNF(other)) && rowsB === 0, "no-op · control", `pending=${pdg.ok ? idsOf(pdg.v).length : pdg.err} foreign=${rs(other)} rowsB=${rowsB}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X9.1 — rule CRUD: key crm.settings.manage · config validation · audit before/after
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X9.1 · rules ──");
  {
    const cR = (u: string) => ctx(tidA, crmR, u);
    const good = await call(F_.createRule, cR(uO), aO, { name: "ขายองค์กร B2B — มาตรฐาน", basis: "PAID", kind: "TIERED", config: { tiers: [{ uptoSatang: 50_000_000, pctBp: 500 }, { uptoSatang: null, pctBp: 800 }] }, splitCollaboratorsBp: 3_000 });
    const id = good.v?.id as string | undefined;
    const upd = await call(F_.updateRule, cR(uO), aO, id ?? "-", { config: { tiers: [{ uptoSatang: 50_000_000, pctBp: 600 }, { uptoSatang: null, pctBp: 800 }] } });
    const mgr = await call(F_.createRule, cR(uM), aM, { name: "ผู้จัดการ", kind: "PCT", config: { pctBp: 100 } });
    const stf = await call(F_.createRule, cR(uTH), aTH, { name: "พนักงาน", kind: "PCT", config: { pctBp: 100 } });
    const bads: [string, Any][] = [
      ["pct>100%", { name: "x", kind: "PCT", config: { pctBp: 10_001 } }],
      ["fixed<0", { name: "x", kind: "FIXED", config: { fixedSatang: -1 } }],
      ["tiers unsorted", { name: "x", kind: "TIERED", config: { tiers: [{ uptoSatang: 500, pctBp: 100 }, { uptoSatang: 100, pctBp: 200 }, { uptoSatang: null, pctBp: 300 }] } }],
      ["tiers open last missing", { name: "x", kind: "TIERED", config: { tiers: [{ uptoSatang: 500, pctBp: 100 }] } }],
      ["split>100%", { name: "x", kind: "PCT", config: { pctBp: 100 }, splitCollaboratorsBp: 10_001 }],
      ["delay<0", { name: "x", kind: "PCT", config: { pctBp: 100 }, payoutDelayDays: -1 }],
      ["kind", { name: "x", kind: "BONUS", config: { pctBp: 100 } }],
    ];
    const res: string[] = [];
    for (const [label, input] of bads) { const r = await call(F_.createRule, cR(uO), aO, input); res.push(`${label}:${isVal(r) ? "refused" : rs(r)}`); }
    const count = (await P.crmCommissionRule.count({ where: { systemId: crmR } })) as number;
    const aud = (await P.auditLog.findMany({ where: { tenantId: tidA, targetId: id ?? "-", action: { startsWith: "crm.commission.rule" } }, orderBy: { createdAt: "asc" } })) as Any[];
    const last = aud[aud.length - 1];
    const lr = await call(F_.listRules, cR(uO), aO);
    chk("C3.3-X9.1", "rules CRUD: the OWNER creates a TIERED rule (mockup 10) and updates it (500→600 bp) — audited `crm.commission.rule.*` with before/after · MANAGER and STAFF ⇒ FORBIDDEN (crm.settings.manage is owner-only by default) · 7 bad configs (pct > 100 %, negative fixed, unsorted tiers, no open last tier, split > 100 %, negative delay, unknown kind) ⇒ VALIDATION, nothing written · listRules returns the 1 rule",
      good.ok && !!id && upd.ok && isFB(mgr) && isFB(stf) && res.every((x) => x.endsWith("refused")) && count === 1 && aud.length >= 2 && j(last?.before).includes('"pctBp":500') && j(last?.after).includes('"pctBp":600') && lr.ok && itemsOf(lr.v).length === 1,
      "create · update · 2 × 403 · 7 × VALIDATION · audit", `create=${rs(good)} update=${rs(upd)} mgr=${rs(mgr)} staff=${rs(stf)} ${res.join(" ")} rules=${count} audits=${aud.length}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S8 — report · UI · personas (pixel parity = gate D7, the controller photographs owner/thana × 1440/390)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S8 · report / UI ──");
  {
    const sql = (await P.$queryRawUnsafe(
      `SELECT "userId", "status"::text AS st, sum("amountSatang")::text AS s, count(*)::int AS c FROM "CrmCommission" WHERE "systemId" = $1 AND "periodKey" = $2 GROUP BY 1, 2`, crmP, PK)) as Any[];
    const key = new Map<string, { pendingSatang: bigint; approvedSatang: bigint; paidSatang: bigint; reversedSatang: bigint; count: number }>();
    for (const r of sql) {
      const k = String(r.userId);
      const cur = key.get(k) ?? { pendingSatang: Z, approvedSatang: Z, paidSatang: Z, reversedSatang: Z, count: 0 };
      const s = b(r.s);
      if (r.st === "PENDING") cur.pendingSatang += s;
      if (r.st === "APPROVED") cur.approvedSatang += s;
      if (r.st === "PAID") cur.paidSatang += s;
      if (r.st === "REVERSED") cur.reversedSatang += s;
      if (r.st !== "REJECTED") cur.count += Number(r.c);
      key.set(k, cur);
    }
    const exp = [...key.entries()].filter(([, v]) => v.count > 0).map(([u, v]) => ({ userId: u, ...v, netSatang: v.approvedSatang + v.paidSatang + v.reversedSatang }))
      .sort((x, y) => (y.netSatang > x.netSatang ? 1 : y.netSatang < x.netSatang ? -1 : x.userId < y.userId ? -1 : 1));
    const rep = await call(F_.report, ctxP(uO), aO, { periodKey: PK });
    const got = itemsOf(rep.v?.rows ?? []).map((r: Any) => ({ userId: r.userId, pendingSatang: b(r.pendingSatang ?? 0), approvedSatang: b(r.approvedSatang ?? 0), paidSatang: b(r.paidSatang ?? 0), reversedSatang: b(r.reversedSatang ?? 0), count: Number(r.count), netSatang: b(r.netSatang ?? 0) }));
    const norm = (a: Any[]) => j(a.map((x) => [x.userId, x.pendingSatang, x.approvedSatang, x.paidSatang, x.reversedSatang, x.netSatang, x.count]));
    const totNet = exp.reduce((s, x) => s + x.netSatang, Z);
    chk("C3.3-S8.1", "report(periodKey 2026-09) = the SQL answer key over CrmCommission of this system: per user pending / approved / paid / reversed (negative) / net = approved + paid + reversed / count (REJECTED excluded) · ordered net desc then userId · totals.netSatang = Σ",
      rep.ok && norm(got) === norm(exp) && b(rep.v?.totals?.netSatang ?? -1) === totNet, `${exp.length} rows · net ${totNet}`, `${rep.ok ? cut(norm(got), 200) : rep.err} vs ${cut(norm(exp), 200)}${ABSENT}`);
  }
  let inv: Any[] = [];
  try { inv = (JSON.parse(read(INVENTORY)).rows ?? []) as Any[]; } catch { inv = []; }
  const nav = read(NAV_FILE);
  {
    const page = read(SET_PAGE);
    const src = [page, ...walk(SET_PAGE_DIR), ...walk(COMP_DIR)].map(read).join("\n");
    const need = ["crm-commission-rules", "crm-commission-rule-add", "crm-commission-rule-row-", "crm-commission-rule-name", "crm-commission-rule-basis", "crm-commission-rule-kind", "crm-commission-rule-save",
      "crm-commission-pending", "crm-commission-pending-row-", "crm-commission-select-", "crm-commission-approve-selected", "crm-commission-send-payroll"];
    const miss = need.filter((t) => !src.includes(t));
    const rows = inv.filter((r) => r?.wo === "C3.3" && String(r?.page ?? "") === "/settings/commissions");
    chk("C3.3-S8.2", "mockup 10 right: `/crm/settings/commissions` (rules + \"คอมมิชชันรออนุมัติ\" with \"อนุมัติที่เลือก\" and \"ส่ง payroll\") is guarded like every CRM v2 page (type \"CRM\" → requireCrmV2Page → crmCan(crm.settings.manage | crm.commission.approve) → notFound()) · nav entry (status ready · wo C3.3) · 12 testids · ≥ 8 inventory rows [static]",
      page.length > 0 && /type:\s*"CRM"/.test(page) && /requireCrmV2Page/.test(page) && /crm\.(settings\.manage|commission\.approve)/.test(page) && /notFound\(/.test(page)
      && /path:\s*"\/crm\/settings\/commissions"[^}]*status:\s*"ready"[^}]*wo:\s*"C3\.3"/.test(nav) && miss.length === 0 && rows.length >= 8,
      "guarded page · nav · testids · ≥ 8 rows", `page=${page.length > 0} guard=${/requireCrmV2Page/.test(page)} nav=${/\/crm\/settings\/commissions/.test(nav)} missing=${miss.join(",") || "-"} rows=${rows.length}${ABSENT}`, "MAJOR");
  }
  {
    const page = read(MINE_PAGE);
    const src = [page, ...walk(MINE_PAGE_DIR), ...walk(COMP_DIR)].map(read).join("\n");
    const need = ["crm-commission-mine", "crm-commission-mine-row-", "crm-commission-period", "crm-commission-waiting-badge"];
    const miss = need.filter((t) => !src.includes(t));
    const rows = inv.filter((r) => r?.wo === "C3.3" && String(r?.page ?? "") === "/commissions");
    chk("C3.3-S8.3", "\"my commissions\": `/crm/commissions` guarded (type \"CRM\" → requireCrmV2Page → notFound()) · loads through commissions.mine with the session actor · nav entry (ready · C3.3) · testids incl. the \"รอผูกพนักงาน\" badge · ≥ 3 inventory rows [static]",
      page.length > 0 && /type:\s*"CRM"/.test(page) && /requireCrmV2Page/.test(page) && /notFound\(/.test(page) && /mine\s*\(/.test(src)
      && /path:\s*"\/crm\/commissions"[^}]*status:\s*"ready"[^}]*wo:\s*"C3\.3"/.test(nav) && miss.length === 0 && rows.length >= 3,
      "guarded page · nav · testids · ≥ 3 rows", `page=${page.length > 0} guard=${/requireCrmV2Page/.test(page)} mine=${/mine\s*\(/.test(src)} nav=${/\/crm\/commissions"/.test(nav)} missing=${miss.join(",") || "-"} rows=${rows.length}${ABSENT}`, "MAJOR");
  }
  {
    const nk = await cOf("nk");
    const after = await call(F_.mine, ctxP(uNK), aNK, {});
    const before = itemsOf(nokMineBefore.v).find((r: Any) => r?.id === nk?.id);
    const now = itemsOf(after.v).find((r: Any) => r?.id === nk?.id);
    const s72 = await cOf("s72");
    const pkMine = await call(F_.mine, ctxP(uPK), aPK, {});
    const pkSeesThana = itemsOf(pkMine.v).some((r: Any) => r?.id === s72?.id);
    const thMine = await call(F_.mine, ctxP(uTH), aTH, {});
    const s72Row = itemsOf(thMine.v).find((r: Any) => r?.id === s72?.id);
    chk("C3.3-S8.4", "the DTO tells the payroll state the UI shows: nok's commission was WAITING_EMPLOYEE (\"รอผูกพนักงาน\") before the link and is PAID after the run · thana's S7.2 commission (adjustment requested, HR still deciding) is REQUESTED · amounts are plain numbers · pook's \"my commissions\" does not contain thana's row",
      nokMineBefore.ok && before && (before.payroll === "WAITING_EMPLOYEE" || j(before).includes(WAITING)) && after.ok && now?.payroll === "PAID" && s72Row?.payroll === "REQUESTED" && typeof s72Row?.amountSatang === "number" && pkMine.ok && !pkSeesThana,
      "WAITING → PAID · REQUESTED", `before=${before?.payroll ?? "-"} after=${now?.payroll ?? "-"} s72=${s72Row?.payroll ?? "-"}/${typeof s72Row?.amountSatang} pookSeesThana=${pkSeesThana}${ABSENT}`, "MAJOR");
  }
  {
    const pO = await call(F_.pending, ctxP(uO), aO);
    const mT = await call(F_.mine, ctxP(uTH), aTH, {});
    const rep = await call(F_.report, ctxP(uO), aO, { periodKey: PK });
    const sqlPend = ((await comm({ systemId: crmP, status: "PENDING" })) as Any[]).map((r) => String(r.id)).sort();
    chk("C3.3-S8.5", "the two personas the controller photographs get the right data: pending(owner) = SQL PENDING of the system · mine(thana) non-empty with his rows only · report(owner) answers (the pages load these three, nothing recomputed in a component)",
      pO.ok && same(idsOf(pO.v), sqlPend) && mT.ok && itemsOf(mT.v).length > 0 && itemsOf(mT.v).every((r: Any) => r.userId === uTH) && rep.ok,
      "owner · thana", `pending=${pO.ok ? `${idsOf(pO.v).length}/${sqlPend.length}` : pO.err} mine=${mT.ok ? itemsOf(mT.v).length : mT.err} report=${rep.ok}${ABSENT}`, "MAJOR");
  }
  {
    const pO = await call(F_.pending, ctxP(uO), aO);
    const mT = await call(F_.mine, ctxP(uTH), aTH, {});
    const rep = await call(F_.report, ctxP(uO), aO, { periodKey: PK });
    const dto = j(pO.v ?? null) + j(mT.v ?? null) + j(rep.v ?? null);
    const leak = PII.filter((x) => dto.includes(x));
    const files = [...walk(SET_PAGE_DIR), ...walk(MINE_PAGE_DIR), ...walk(COMP_DIR)];
    const isClient = (f: string) => /^\s*["']use client["']/.test(read(f));
    const isServer = (f: string) => /^\s*["']use server["']/.test(read(f));
    const badClient = files.filter(isClient).filter((f) => /from\s+["'](@\/lib\/core\/db|@prisma\/client|@\/lib\/modules\/crm(\/(?!.*-shared)[^"']*)?)["']/.test(read(f)));
    const serverBad = [...files, ...walk("src/lib/modules/crm")].filter(isServer).filter((f) => /commission/i.test(f)).filter((f) => /export\s+(type|interface|const|let|function\s)/.test(read(f)) || !/assertCrmV2|crmUiVersion|requireCrmV2/.test(read(f)));
    chk("C3.3-S8.6", "the commission DTOs (pending · mine · report) carry no customer name / phone / e-mail (ids, amounts, deal titles, user names only) · no `'use client'` file of this work order imports prisma or a non-shared CRM module · every `\"use server\"` commission file exports async functions only and gates on CRM v2 [static + runtime]",
      pO.ok && mT.ok && leak.length === 0 && badClient.length === 0 && serverBad.length === 0, "no PII · clean", `dto=${pO.ok && mT.ok} leaks=${leak.length} badClient=${badClient.join(",") || "-"} serverBad=${serverBad.join(",") || "-"}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X3 · X4.1 — real concurrency in worker PROCESSES (tenant X) + the global replay
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X3 · concurrency (processes) ──");
  const ROUNDS = 3;
  const R_X = { kind: "PCT", config: { pctBp: 500 } };
  const TX = 3_333_333;
  const PA = 1_111_111;
  const PB = 2_222_222;
  const fullX = fullOf("PCT", R_X.config, b(TX));
  const bA = shareBounds(fullX, b(TX), b(PA));
  const bB = shareBounds(fullX, b(TX), b(PB));
  console.log(`  [arith] X3 T=${TX} · 5 % ⇒ full ${fullX} · payment ${PA} ∈ [${bA[0]}, ${bA[1]}] · payment ${PB} ∈ [${bB[0]}, ${bB[1]}] · Σ must be ${fullX} in any order`);
  for (const s of [crmXA, crmXB, crmXC, crmXD]) await mkRule(tidX, s, R_X);
  const pXA = await mkPipe(tidX, crmXA);
  const pXB = await mkPipe(tidX, crmXB);
  const pXC = await mkPipe(tidX, crmXC);
  const pXD = await mkPipe(tidX, crmXD);
  const xa: Deal[] = [];
  const xb: { d: Deal; ra: string; rb: string }[] = [];
  const xc: { d: Deal; ref: string; orig: string | null; e: string }[] = [];
  const xd: { d: Deal; comm: string | null; eventId: string | null; e: string }[] = [];
  for (let r = 0; r < ROUNDS; r += 1) {
    xa.push(await mkDeal(tidX, crmXA, pXA, uXE[r], TX));
    const d = await mkDeal(tidX, crmXB, pXB, uXE[r], TX);
    xb.push({ d, ra: await rawPay(d, PA), rb: await rawPay(d, PB) });
    const dc = await mkDeal(tidX, crmXC, pXC, uXE[r], 1_000_000);
    const refC = await rawPay(dc, 1_000_000);
    await call(F_.onPaid, ctx(tidX, crmXC, null), { dealId: dc.id, refType: "DEAL_PAYMENT", refId: refC });
    const dd = await mkDeal(tidX, crmXD, pXD, uXE[r], 1_000_000);
    const refD = await rawPay(dd, 1_000_000);
    await call(F_.onPaid, ctx(tidX, crmXD, null), { dealId: dd.id, refType: "DEAL_PAYMENT", refId: refD });
    xc.push({ d: dc, ref: refC, orig: null, e: eXE[r] });
    xd.push({ d: dd, comm: null, eventId: null, e: eXE[r] });
  }
  await settle(tidX);
  for (const c of xc) {
    c.orig = ((await comm({ dealId: c.d.id, refType: "DEAL_PAYMENT" }))[0] as Any)?.id ?? null;
    await P.crmDealPayment.update({ where: { id: c.ref }, data: { status: "REVERSED", reversedAt: new Date() } }); // the money was voided (raw — the race below is commissions.reverse itself)
  }
  for (const x of xd) {
    x.comm = ((await comm({ dealId: x.d.id, refType: "DEAL_PAYMENT" }))[0] as Any)?.id ?? null;
    await decideReq(tidX, x.comm ?? undefined, "APPROVED");
    const ev = ((await P.outboxEvent.findMany({ where: { tenantId: tidX, type: "approval.request.approved" } })) as Any[]).find((e) => e.payload?.entityId === x.comm);
    x.eventId = ev?.id ?? null;
    if (ev) seen.add(ev.id); // NOT delivered here — the workers race it
  }
  const GAP = 4_000;
  const rounds: Any[] = [];
  for (let r = 0; r < ROUNDS; r += 1) rounds.push({ atMs: r * GAP, calls: [
    { ph: "A", fn: "pay", sys: crmXA, a: { documentId: xa[r].inv, paymentId: `${TAG}-xa-${r}`, amountSatang: PA, now: NOWP.toISOString() }, n: 2 },
    { ph: "A", fn: "pay", sys: crmXA, a: { documentId: xa[r].inv, paymentId: `${TAG}-xb-${r}`, amountSatang: PB, now: NOWP.toISOString() }, n: 2 },
  ] });
  for (let r = 0; r < ROUNDS; r += 1) rounds.push({ atMs: (ROUNDS + r) * GAP, calls: [
    { ph: "B", fn: "onPaid", sys: crmXB, a: { dealId: xb[r].d.id, refId: xb[r].ra }, n: 2 },
    { ph: "B", fn: "onPaid", sys: crmXB, a: { dealId: xb[r].d.id, refId: xb[r].rb }, n: 2 },
  ] });
  for (let r = 0; r < ROUNDS; r += 1) rounds.push({ atMs: (2 * ROUNDS + r) * GAP, calls: [{ ph: "C", fn: "reverse", sys: crmXC, a: { refId: xc[r].ref }, n: 4 }] });
  for (let r = 0; r < ROUNDS; r += 1) rounds.push({ atMs: (3 * ROUNDS + r) * GAP, calls: [{ ph: "D", fn: "deliver", sys: crmXD, a: { eventId: xd[r].eventId ?? "-" }, n: 4 }] });
  const spawnW = (arg: Any, startAt: number) => new Promise<string[]>((resolve) => {
    const enc = Buffer.from(JSON.stringify(arg), "utf8").toString("base64url");
    const ch = spawn("pnpm", ["exec", "tsx", THIS_FILE, "--x3-worker", tidX, String(startAt), enc], { env: process.env });
    let out = "";
    const to = setTimeout(() => { try { ch.kill("SIGKILL"); } catch { /* gone */ } }, 300_000);
    ch.stdout.on("data", (d: Any) => { out += String(d); });
    ch.stderr.on("data", (d: Any) => { out += String(d); });
    ch.on("error", (e: Any) => { clearTimeout(to); resolve([`SPAWN-ERROR ${String(e)}`]); });
    ch.on("close", () => { clearTimeout(to); const m = /X3WORKER (\[.*\])/.exec(out); resolve(m ? (JSON.parse(m[1]) as string[]) : [`NO-OUTPUT ${cut(out, 200)}`]); });
  });
  const start1 = Date.now() + 45_000;
  const w1 = (await Promise.all([spawnW({ rounds }, start1), spawnW({ rounds }, start1), spawnW({ rounds }, start1)])).flat();
  // batch 2 — every not-yet-delivered event of tenant X (the phase-A payments …) delivered by 3 processes × 4 in parallel, event by event
  const pendingX = ((await P.outboxEvent.findMany({ where: { tenantId: tidX }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })) as Any[]).filter((e) => !seen.has(e.id));
  const start2 = Date.now() + 45_000;
  const r2 = { rounds: [{ atMs: 0, seq: true, calls: pendingX.map((e) => ({ ph: "E", fn: "deliver", sys: e.systemId ?? crmXA, a: { eventId: e.id }, n: 4 })) }] };
  const w2 = pendingX.length ? (await Promise.all([spawnW(r2, start2), spawnW(r2, start2), spawnW(r2, start2)])).flat() : [];
  for (const e of pendingX) seen.add(e.id);
  await P.outboxEvent.updateMany({ where: { id: { in: pendingX.map((e) => e.id) }, status: "PENDING" }, data: { status: "DONE", processedAt: new Date() } });
  await settle(tidX);
  const ph = (p: string) => w1.filter((o) => o.startsWith(`${p}:`)).map((o) => o.slice(2));
  {
    const a = ph("A");
    const counted = a.filter((o) => o === "OK:counted").length;
    chk("C3.3-X3.1a", `[positive control] 3 worker PROCESSES × 4 = 12 parallel recordDocPayment per round (6 per payment) over ${ROUNDS} rounds returned ${ROUNDS * 12} results, exactly ${ROUNDS * 2} counted and the rest DUPLICATE, and the ${pendingX.length} resulting events were then raced by 3 more processes (${w2.length} deliveries) — if this is red X3.1 proves nothing`,
      a.length === ROUNDS * 12 && counted === ROUNDS * 2 && a.every((o) => o === "OK:counted" || o === "OK:skip-DUPLICATE") && w2.every((o) => /^E:OK/.test(o)),
      `${ROUNDS * 12} · ${ROUNDS * 2} counted`, `${a.length} counted=${counted} ${cut(a.filter((o) => !/^OK/.test(o)).slice(0, 2).join(" | "), 160)} batch2=${w2.length}/${cut(w2.filter((o) => !/^E:OK/.test(o)).slice(0, 2).join(" | "), 160)}`, "MAJOR");
    const per: string[] = [];
    let ok = true;
    for (let r = 0; r < ROUNDS; r += 1) {
      const pays = (await P.crmDealPayment.findMany({ where: { dealId: xa[r].id, status: "COUNTED" } })) as Any[];
      const rows = await comm({ dealId: xa[r].id });
      const ra = rows.find((x) => pays.find((p) => p.id === x.refId && Number(p.satang) === PA));
      const rb = rows.find((x) => pays.find((p) => p.id === x.refId && Number(p.satang) === PB));
      const good = pays.length === 2 && rows.length === 2 && ra && rb && sumB(rows) === fullX && b(ra.amountSatang) >= bA[0] && b(ra.amountSatang) <= bA[1] && b(rb.amountSatang) >= bB[0] && b(rb.amountSatang) <= bB[1];
      ok = ok && !!good;
      per.push(`${pays.length}p/${rows.length}r/Σ${sumB(rows)}`);
    }
    chk("C3.3-X3.1", `CRITICAL — two partial payments of one deal counted in parallel (12 callers, 3 processes) and their events raced ⇒ per round exactly 2 payments, exactly 2 commission rows, Σ = ${fullX} exactly and each row inside its proportional bounds · ${ROUNDS} rounds`,
      ok, `2p/2r/Σ${fullX} ×${ROUNDS}`, `${per.join(" ")}${ABSENT}`);
  }
  {
    const bOut = ph("B");
    chk("C3.3-X3.2a", `[positive control] ${ROUNDS} rounds × 12 parallel onPaid (3 processes × 4 — both payments of the deal at once) all returned without an error`,
      bOut.length === ROUNDS * 12 && bOut.every((o) => o === "OK"), `${ROUNDS * 12} OK`, `${bOut.length} ${cut(bOut.filter((o) => o !== "OK").slice(0, 2).join(" | "), 200)}${ABSENT}`, "MAJOR");
    const per: string[] = [];
    let ok = true;
    for (let r = 0; r < ROUNDS; r += 1) {
      const rows = await comm({ dealId: xb[r].d.id });
      const ra = rows.filter((x) => x.refId === xb[r].ra);
      const rb = rows.filter((x) => x.refId === xb[r].rb);
      const good = rows.length === 2 && ra.length === 1 && rb.length === 1 && sumB(rows) === fullX && b(ra[0].amountSatang) >= bA[0] && b(ra[0].amountSatang) <= bA[1] && b(rb[0].amountSatang) >= bB[0] && b(rb[0].amountSatang) <= bB[1];
      ok = ok && !!good;
      per.push(`${rows.length}r/Σ${sumB(rows)}`);
    }
    chk("C3.3-X3.2", `CRITICAL — 12 parallel onPaid on SEPARATE connections for the two payment rows of one deal (no row existed before) ⇒ exactly ONE row per (deal, rule, user, refId), Σ = ${fullX} (the running total is taken under a lock, not read-then-write) · ${ROUNDS} rounds`,
      ok, `2r/Σ${fullX} ×${ROUNDS}`, `${per.join(" ")}${ABSENT}`);
  }
  {
    const cOut = ph("C");
    chk("C3.3-X3.3a", `[positive control] ${ROUNDS} rounds × 12 parallel commissions.reverse of one voided payment returned without an error (the originals existed: ${xc.filter((c) => c.orig).length}/${ROUNDS})`,
      cOut.length === ROUNDS * 12 && cOut.every((o) => o === "OK") && xc.every((c) => c.orig), `${ROUNDS * 12} OK`, `${cOut.length} ${cut(cOut.filter((o) => o !== "OK").slice(0, 2).join(" | "), 200)}${ABSENT}`, "MAJOR");
    const per: string[] = [];
    let ok = true;
    for (const c of xc) {
      const revs = await comm({ reversedOfId: c.orig ?? "-" });
      const ded = revs.length ? ((await P.hrPayAdjustment.findMany({ where: { crmCommissionId: { in: revs.map((x) => x.id) } } })) as Any[]) : [];
      const good = revs.length === 1 && b(revs[0].amountSatang) === -(fullOf("PCT", R_X.config, b(1_000_000))) && ded.length === 1 && ded[0].kind === "DEDUCTION" && ded[0].employeeId === c.e;
      ok = ok && good;
      per.push(`${revs.length}rev/${ded.length}ded`);
    }
    chk("C3.3-X3.3", `CRITICAL — 12 parallel reversals of the same payment (APPROVED commission with a requested adjustment) ⇒ exactly ONE negative row (−${fullOf("PCT", R_X.config, b(1_000_000))}) and ONE DEDUCTION adjustment per round · ${ROUNDS} rounds`,
      ok, `1rev/1ded ×${ROUNDS}`, `${per.join(" ")}${ABSENT}`);
  }
  {
    const dOut = ph("D");
    chk("C3.3-X3.4a", `[positive control] ${ROUNDS} rounds × 12 parallel deliveries of the approval.request.approved event of a PENDING commission ran (the events existed: ${xd.filter((x) => x.eventId).length}/${ROUNDS})`,
      dOut.length === ROUNDS * 12 && dOut.every((o) => o === "OK") && xd.every((x) => x.eventId), `${ROUNDS * 12} OK`, `${dOut.length} ${cut(dOut.filter((o) => o !== "OK").slice(0, 2).join(" | "), 200)}${ABSENT}`, "MAJOR");
    const per: string[] = [];
    let ok = true;
    for (const x of xd) {
      const row = x.comm ? ((await comm({ id: x.comm }))[0] as Any) : null;
      const adj = await adjOf(x.comm);
      const good = row?.status === "APPROVED" && adj.length === 1 && adj[0].kind === "COMMISSION" && adj[0].employeeId === x.e && row?.hrPayAdjustmentId === adj[0].id;
      ok = ok && good;
      per.push(`${row?.status ?? "-"}/${adj.length}adj`);
    }
    chk("C3.3-X3.4", `CRITICAL — the approval-approved event of one commission consumed by 12 parallel callers (3 processes) ⇒ commission APPROVED and exactly ONE HR adjustment (the partial unique + a status-guarded claim) · ${ROUNDS} rounds`,
      ok, `APPROVED/1adj ×${ROUNDS}`, `${per.join(" ")}${ABSENT}`);
  }
  {
    const snap = async () => j({ c: await comm({ tenantId: { in: [tidA, tidX] } }), a: await P.hrPayAdjustment.findMany({ where: { tenantId: { in: [tidA, tidX] } }, orderBy: { id: "asc" } }) });
    const before = await snap();
    const evs = ((await P.outboxEvent.findMany({ where: { tenantId: { in: [tidA, tidX] } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })) as Any[]);
    for (const e of evs) { await deliver(e); await deliver(e); }
    for (const e of evs) await Promise.all([deliver(e), deliver(e)]);
    await settle(tidA);
    await settle(tidX);
    const after = await snap();
    const types = [...new Set(evs.map((e) => String(e.type)))].sort();
    chk("C3.3-X4.1", `X4 — EVERY event of both tenants (${evs.length}: ${cut(types.join(" · "), 200)}) delivered to its consumer twice in a row and then twice in parallel ⇒ every CrmCommission and HrPayAdjustment row is byte-identical (no second commission, adjustment, reversal or status flip)`,
      evs.length > 0 && after === before && JSON.parse(before).c.length > 0, "unchanged", `events=${evs.length} unchanged=${after === before} rows=${JSON.parse(before).c.length}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X8 — payloads ids only
  // ═════════════════════════════════════════════════════════════════════════════
  {
    const evs = ((await P.outboxEvent.findMany({ where: { tenantId: { in: [tidA, tidX] }, type: { in: EVENTS } } })) as Any[]);
    const allowed: Record<string, string[]> = {
      "hr.payroll.paid": ["periodKey", "runId"],
      "crm.commission.created": ["amountSatang", "commissionId", "dealId", "periodKey", "reversedOfId", "ruleId", "status", "systemId", "userId"],
      "crm.commission.approved": ["amountSatang", "commissionId", "dealId", "periodKey", "reversedOfId", "ruleId", "status", "systemId", "userId", "hrPayAdjustmentId"],
      "crm.commission.reversed": ["amountSatang", "commissionId", "dealId", "periodKey", "reversedOfId", "ruleId", "status", "systemId", "userId", "hrPayAdjustmentId"],
    };
    const badKeys = evs.filter((e) => Object.keys(e.payload ?? {}).some((k) => !allowed[e.type]?.includes(k))).map((e) => `${e.type}:${Object.keys(e.payload ?? {}).join("/")}`);
    const blob = j(evs.map((e) => e.payload));
    const notes = j(((await P.hrPayAdjustment.findMany({ where: { tenantId: { in: [tidA, tidX] } }, select: { note: true } })) as Any[]).map((a) => a.note));
    const ops = j(((await P.opsEvent.findMany({ where: { tenantId: { in: [tidA, tidX] } }, select: { message: true, detail: true } })) as Any[]));
    const leak = PII.filter((x) => blob.includes(x) || notes.includes(x) || ops.includes(x));
    const typesSeen = new Set(evs.map((e) => String(e.type)));
    chk("C3.3-X8.1", "X8 — payloads are ids only: every hr.payroll.paid / crm.commission.* event carries only whitelisted id/amount/period keys (hr.payroll.paid = exactly runId + periodKey) · no customer name, phone or e-mail in any payload, HR adjustment note or OpsEvent of this oracle · all four event types were actually emitted",
      evs.length > 0 && badKeys.length === 0 && leak.length === 0 && EVENTS.every((t) => typesSeen.has(t)), "ids only · 4 types", `events=${evs.length} types=${[...typesSeen].join(",") || "-"} badKeys=${cut(badKeys.join(" "), 160) || "-"} leaks=${leak.length}${ABSENT}`, "MAJOR");
  }
  if (consumerErr.length) console.log(`  [info] consumer errors seen while delivering our events (first ${consumerErr.length}): ${cut(consumerErr.join(" || "), 600)}`);
} catch (e) {
  chk("C3.3-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — every row of the throwaway tenants (4 passes over every table with tenantId), systems/tenants, users.
  // No global drainOutbox (not tenant-scoped) — our events go with the tenant sweep. No seeded row was touched.
  // ═════════════════════════════════════════════════════════════════════════════
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* order/FK — retried next pass */ } };
  if (ids.length > 0) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[])
      .map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1)
      for (const t of tables) await del(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
    for (const id of ids) {
      await del(() => P.appSystemUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.appSystem.deleteMany({ where: { tenantId: id } }));
      await del(() => P.businessUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.tenant.delete({ where: { id } }));
    }
    for (const uid of USERS) await del(() => P.appNotification.deleteMany({ where: { recipientUserId: uid } }));
    for (const uid of USERS) await del(() => P.user.delete({ where: { id: uid } }));
    try {
      const left: string[] = [];
      for (const t of tables) {
        const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[];
        const c = Number(r?.[0]?.n ?? 0);
        if (c > 0) left.push(`${t}=${c}`);
      }
      const tenants = await P.tenant.count({ where: { id: { in: ids } } });
      const users = USERS.length ? await P.user.count({ where: { id: { in: USERS } } }) : 0;
      const rules = (await P.crmCommissionRule.count({ where: { name: { contains: TAG } } })) as number;
      const adj = (await P.hrPayAdjustment.count({ where: { id: { startsWith: TAG } } })) as number;
      const comms = (await P.crmCommission.count({ where: { id: { startsWith: TAG } } })) as number;
      chk("C3.3-CLEAN", "the oracle gives the QC database back exactly as found — every throwaway tenant and every row it owned (rules · commissions · deals · payments · HR employees/profiles/adjustments/runs · approval policies/requests · outbox · audit · notifications) and the throwaway users are gone",
        left.length === 0 && tenants === 0 && users === 0 && rules === 0 && adj === 0 && comms === 0, "0 rows · 0 tenants · 0 users", `${left.join(" · ") || "-"} · tenants=${tenants} users=${users} rules=${rules} adj=${adj} comms=${comms}`, "MAJOR");
    } catch (e) {
      chk("C3.3-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C3.3: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
