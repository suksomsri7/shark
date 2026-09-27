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
// CHECK INVENTORY (90 = 84 + ORACLE-EDIT C3.3-H: H1–H6 money hunt 27 ก.ย.): S0 6 · S1 5 · S2 5 · S3 4 · S4 9 · S5 6 · S6 2 · S7 2 · S8 6 (the 30 of CRM-RUN §2 + S2.3/S4.6 money review + S4.7/S4.8/S5.5/S5.5a round 3) · M 17 (money gates + M9/M9a/M10/M11 round 3 + M12/M13 round 5 + M14–M16 round 6 /
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
      // ORACLE-EDIT C3.3 round-3 (26 ก.ย.) — posCount: count a POS bill on the deal (COUNTED row) then onPaid ×1 + ×2 in parallel (R1 race) ·
      //   hrDecide: HR decides the original's adjustment from its own connection (S-b race against the reversal)
      if (c.fn === "posCount") {
        if (typeof CM.onPaid !== "function") throw miss("onPaid");
        const row = await PW.crmDealPayment.create({ data: { tenantId: wT, systemId: c.sys, dealId: c.a.dealId, refType: "POS_SALE", refId: c.a.saleId, satang: BigInt(c.a.satang), status: "COUNTED", countedAt: new Date(c.a.now) } });
        await CM.onPaid(ctx, { dealId: c.a.dealId, refType: "DEAL_PAYMENT", refId: row.id });
        await Promise.all([CM.onPaid(ctx, { dealId: c.a.dealId, refType: "DEAL_PAYMENT", refId: row.id }), CM.onPaid(ctx, { dealId: c.a.dealId, refType: "DEAL_PAYMENT", refId: row.id })]);
        return "OK";
      }
      // ORACLE-EDIT C3.3 round-6 (26 ก.ย.) — apr: the (late) afterPaymentsReversed hook of the money path (M16 race)
      if (c.fn === "apr") {
        if (typeof CM.afterPaymentsReversed !== "function") throw miss("afterPaymentsReversed");
        await CM.afterPaymentsReversed({ tenantId: wT, systemId: c.sys }, { dealId: c.a.dealId });
        return "OK";
      }
      if (c.fn === "hrDecide") {
        const PAYW = (await import("@/lib/modules/hr/payroll" as string)) as Any;
        const r = await PAYW.decideAdjustment({ tenantId: wT, systemId: c.a.hrSystemId }, c.a.adjustmentId, c.a.decision, { userId: c.a.deciderId, isOwner: true });
        return `OK:${r?.ok === true ? "decided" : "late"}`;
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
  const mkDeal = async (tid: string, sys: string, pipe: Pipe, owner: string | null, value: number, collaborators: string[] = [], noDoc = false) => {
    const contactId = await mkContact(tid, sys, owner);
    const inv = noDoc ? "" : `${TAG}-inv-${nx()}`;
    const at = T("2026-09-01T03:00:00Z");
    const d = await P.crmDeal.create({
      data: { tenantId: tid, systemId: sys, contactId, pipelineId: pipe.id, stageId: pipe.OPEN, title: `ดีล ${TAG}-${nx()}`, valueSatang: value, kind: "OPEN",
        ownerUserId: owner, stageEnteredAt: at, createdAt: at, invoiceDocId: inv || null, collaboratorUserIds: collaborators },
    });
    await P.crmDealStageHistory.create({ data: { tenantId: tid, dealId: d.id, fromStageId: null, toStageId: pipe.OPEN, enteredAt: at, leftAt: null } });
    return { id: d.id as string, inv, value, tid, sys } as Deal;
  };
  type RuleSpec = { basis?: string; kind: string; config: Any; pipelineId?: string | null; minDealSatang?: number | null; split?: number; delay?: number; createdAt?: Date };
  const RULE_EPOCH = T("2026-08-01T00:00:00Z");
  const mkRule = async (tid: string, sys: string, r: RuleSpec) => (await P.crmCommissionRule.create({
    data: { tenantId: tid, systemId: sys, name: `กฎ ${TAG}-${nx()}`, basis: r.basis ?? "PAID", kind: r.kind, config: r.config, pipelineId: r.pipelineId ?? null, productIds: [],
      minDealSatang: r.minDealSatang === undefined || r.minDealSatang === null ? null : BigInt(r.minDealSatang), splitCollaboratorsBp: r.split ?? 0, payoutDelayDays: r.delay ?? 0,
      // ORACLE-EDIT C3.3 round-3 (26 ก.ย.) — onPaid now refuses money counted before the rule existed (no retro credit · M11); the fixture's rules
      //   exist since 1 Aug so every payment counted "now = NOWP (15 Sep)" is after them — M11 overrides this with its own dates
      createdAt: r.createdAt ?? RULE_EPOCH },
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
  // ORACLE-EDIT C3.3 round-3 (26 ก.ย.) — a REAL PosSale row (no FK on unitId; swept by tenantId) so pre-VAT = grand − vat is readable
  const mkSale = async (tid: string, sys: string, grand: number, vat: number) => (await P.posSale.create({
    data: { tenantId: tid, unitId: `${TAG}-unit`, systemId: sys, idempotencyKey: `${TAG}-sale-${nx()}`, status: "PAID", subtotalSatang: grand - vat, vatSatang: vat, grandTotalSatang: grand, paidAt: NOWP },
  })).id as string;
  const comm = async (where: Any) => (await P.crmCommission.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })) as Any[];
  const adjOf = async (commissionId: string | null | undefined) => (commissionId ? ((await P.hrPayAdjustment.findMany({ where: { crmCommissionId: commissionId } })) as Any[]) : []);
  const sumB = (rows: Any[]) => rows.reduce((s, r) => s + BigInt(r.amountSatang), Z);
  // ORACLE-EDIT C3.3 round-5 (26 ก.ย.) — ruling B1: a PAID row's refId is the incarnation key `<CrmDealPayment.id>#c<countedAt ms>` ⇒ the
  //   payment row id is the part before '#' (WON rows keep refId '' and REVERSAL rows the original's id — not touched by this helper)
  const payOf = (ref: unknown) => String(ref ?? "").split("#")[0];
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
    const byRef = new Map(rows.map((r) => [payOf(r.refId), r])); // ORACLE-EDIT C3.3 round-5 (26 ก.ย.)
    const ok = rows.length === 2 && [p11a, p11b].every((p) => {
      const r = byRef.get(p.rowId);
      // ORACLE-EDIT C3.3 money-review (26 ก.ย.) — ruling B1: basisSatang carries the FROZEN pre-VAT base T (= valueSatang 2,000,000), not the payment amount
      return r && r.userId === uTH && r.ruleId === rS1 && r.refType === "DEAL_PAYMENT" && /^[^#]+#c\d+$/.test(r.refId) && r.basis === "PAID" && Number(r.basisSatang) === 2_000_000 && r.status === "PENDING" && r.periodKey === PK && r.systemId === crmS1;
    });
    chk("C3.3-S1.1", "two partial payments of one deal through the real C2.7 money path (recordDocPayment → COUNTED) ⇒ exactly TWO CrmCommission rows — one per payment: refType DEAL_PAYMENT · refId = the incarnation key <CrmDealPayment id>#c<countedAt ms> (R-C.4 + round-5 B1) · basis PAID · basisSatang = the frozen pre-VAT base T (ruling B1) · user = the owner · status PENDING (approval chain exists) · periodKey = Thai month of countedAt (2026-09)",
      p11a.counted && p11b.counted && ok, "2 rows · shape", `counted=${p11a.counted}/${p11b.counted} rows=${rows.length} ${cut(j(rows.map((r) => ({ ref: payOf(r.refId) === p11a.rowId ? "a" : payOf(r.refId) === p11b.rowId ? "b" : r.refId, t: r.refType, basis: r.basis, bs: r.basisSatang, st: r.status, pk: r.periodKey, u: r.userId === uTH }))), 300)}${ABSENT}`);
    const a = byRef.get(p11a.rowId);
    const bb = byRef.get(p11b.rowId);
    chk("C3.3-S1.2", `partial payment = proportional commission (§11.6): 600,000 + 1,400,000 of T 2,000,000 at 5 % ⇒ ${e11a} + ${e11b} = ${full11} (the full commission) exactly`,
      a && bb && b(a.amountSatang) === e11a && b(bb.amountSatang) === e11b, `${e11a}/${e11b}`, `${a?.amountSatang ?? "-"}/${bb?.amountSatang ?? "-"}${ABSENT}`);
  }
  {
    const rows = await comm({ dealId: d12.id });
    const a = rows.find((r) => payOf(r.refId) === p12a.rowId); // ORACLE-EDIT C3.3 round-5 (26 ก.ย.)
    const bb = rows.find((r) => payOf(r.refId) === p12b.rowId);
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
      && wp.length === 1 && b(wp[0].amountSatang) === eWp && payOf(wp[0].refId) === pW1.rowId, // ORACLE-EDIT C3.3 round-5 (26 ก.ย.)
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

  {
    // ORACLE-EDIT C3.3 money-review (26 ก.ย.) — ruling S2 (new check S2.3): nobody but the OWNER approves his own commission
    const cS2 = await mk(tidA, "CRM", "CRM อนุมัติของตัวเอง");
    await setCrm(cS2, { uiVersion: 2, bridgesEnabled: true, commission: REQ });
    await APV.createPolicy({ tenantId: tidA }, { name: `คอมมิชชัน S2 ${TAG}`, entityType: "crm.commission", systemId: cS2, steps: [{ order: 1, approverRole: "OWNER" }] });
    await mkRule(tidA, cS2, { kind: "PCT", config: { pctBp: 1_000 } });
    const pS2 = await mkPipe(tidA, cS2);
    const dMg = await mkDeal(tidA, cS2, pS2, uM, 500_000); // 50,000 — under the manager's cap: only "own row" can refuse it
    const dOw = await mkDeal(tidA, cS2, pS2, uO, 500_000);
    await pay(dMg, "s23m", 500_000);
    await pay(dOw, "s23o", 500_000);
    const rM = (await comm({ dealId: dMg.id }))[0] as Any;
    const rO = (await comm({ dealId: dOw.id }))[0] as Any;
    const selfM = await call(F_.approve, ctx(tidA, cS2, uM), aM, { id: rM?.id ?? "-", reason: "อนุมัติของตัวเอง" });
    const stillM = rM ? ((await comm({ id: rM.id }))[0] as Any)?.status : "-";
    const pendM = await call(F_.pending, ctx(tidA, cS2, uM), aM);
    const pendO = await call(F_.pending, ctx(tidA, cS2, uO), aO);
    const selfO = await call(F_.approve, ctx(tidA, cS2, uO), aO, { id: rO?.id ?? "-", reason: "เจ้าของอนุมัติของตัวเอง" });
    await settle(tidA);
    const afterO = rO ? ((await comm({ id: rO.id }))[0] as Any)?.status : "-";
    const inM = idsOf(pendM.v).includes(String(rM?.id));
    const inO = idsOf(pendO.v).includes(String(rM?.id));
    chk("C3.3-S2.3", "ruling S2 — no self-approval: a MANAGER approving his OWN commission (50,000, under his cap) ⇒ FORBIDDEN (Thai), the row stays PENDING and it is not in his own pending() list (the OWNER still sees it there) · the OWNER approving his own commission ⇒ APPROVED",
      !!rM && !!rO && isFB(selfM) && stillM === "PENDING" && pendM.ok && !inM && pendO.ok && inO && selfO.ok && afterO === "APPROVED",
      "403 · PENDING · hidden · owner ok", `rows=${!!rM}/${!!rO} manager=${rs(selfM)} still=${stillM} inManagerList=${inM} inOwnerList=${inO} owner=${rs(selfO)} after=${afterO}${ABSENT}`);
  }
  {
    // ORACLE-EDIT C3.3 round-5 (26 ก.ย.) — ruling S4 (new check S2.4): rows of a PREVIOUS win are retired before the new win is credited
    const c24 = await mk(tidA, "CRM", "CRM ชนะซ้ำ");
    await setCrm(c24, { uiVersion: 2, bridgesEnabled: true, commission: AUTO });
    const r24 = await mkRule(tidA, c24, { basis: "WON", kind: "PCT", config: { pctBp: 1_000 } });
    const p24 = await mkPipe(tidA, c24);
    const d24 = await mkDeal(tidA, c24, p24, uC[1], 100_000);
    const c24o = ctx(tidA, c24, uO);
    const w1 = await call(DL.moveDeal, c24o, aO, d24.id, { stageId: p24.WON });
    await settle(tidA);
    const old = (await comm({ dealId: d24.id }))[0] as Any;
    // reopen WITHOUT the afterDealMoved hook (raw — the hook-skipped path the ruling is about) and lower the value to 50,000
    const reAt = new Date();
    await P.crmDealStageHistory.updateMany({ where: { dealId: d24.id, leftAt: null }, data: { leftAt: reAt } });
    await P.crmDealStageHistory.create({ data: { tenantId: tidA, dealId: d24.id, fromStageId: p24.WON, toStageId: p24.OPEN, enteredAt: reAt, leftAt: null } });
    await P.crmDeal.update({ where: { id: d24.id }, data: { kind: "OPEN", stageId: p24.OPEN, closedAt: null, stageEnteredAt: reAt, valueSatang: 50_000 } });
    await sleep(50);
    const w2 = await call(DL.moveDeal, c24o, aO, d24.id, { stageId: p24.WON });
    await settle(tidA);
    const e1 = fullOf("PCT", { pctBp: 1_000 }, b(100_000));
    const e2 = fullOf("PCT", { pctBp: 1_000 }, b(50_000));
    console.log(`  [arith] S2.4 WON 10 %: first win on 100,000 ⇒ ${e1} · reopened (hook skipped) · value 50,000 · re-win ⇒ old row removed, new ${e2}`);
    const rows = await comm({ dealId: d24.id });
    const oldGone = old ? !(await comm({ id: old.id }))[0] : false;
    const aud = old ? ((await P.auditLog.count({ where: { tenantId: tidA, action: "crm.commission.remove", targetId: old.id } })) as number) : 0;
    const ev = old ? ((await P.outboxEvent.findMany({ where: { tenantId: tidA, type: "crm.commission.removed" } })) as Any[]).filter((e) => e.payload?.commissionId === old.id) : [];
    const snap0 = j(rows);
    const cw = ctx(tidA, c24, null);
    const rr = [await call(F_.onWon, cw, { dealId: d24.id }), await call(F_.onWon, cw, { dealId: d24.id })];
    rr.push(...(await Promise.all([call(F_.onWon, cw, { dealId: d24.id }), call(F_.onWon, cw, { dealId: d24.id })])));
    const wonEv = ((await P.outboxEvent.findMany({ where: { tenantId: tidA, type: "crm.deal.won" } })) as Any[]).filter((e) => e.payload?.dealId === d24.id);
    for (const e of wonEv) { await deliver(e); await Promise.all([deliver(e), deliver(e)]); }
    const snap1 = j(await comm({ dealId: d24.id }));
    chk("C3.3-S2.4", `round-5 S4 — previous-win rows are retired: a deal won at 100,000 (${e1}) is reopened without the reopen hook, its value lowered to 50,000 and won again ⇒ the old row is REMOVED (row gone · audit crm.commission.remove · event crm.commission.removed) and ONE new row of ${e2} exists (refId '', same rule) · onWon ×2 + ×2 in parallel + the won events redelivered ⇒ unchanged`,
      w1.ok && w2.ok && !!old && b(old.amountSatang) === e1 && oldGone && aud === 1 && ev.length === 1 && rows.length === 1 && b(rows[0].amountSatang) === e2 && rows[0].ruleId === r24 && rows[0].refId === "" && rr.every((x) => x.ok) && snap1 === snap0,
      `removed · ${e2} · unchanged`, `win1=${rs(w1)} old=${old ? String(old.amountSatang) : "-"} gone=${oldGone} audit=${aud} event=${ev.length} rows=${desc(rows)} win2=${rs(w2)} replay=${rr.map((x) => (x.ok ? "ok" : x.err)).join("|")} unchanged=${snap1 === snap0}${ABSENT}`);
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
    const a = rows.find((r) => payOf(r.refId) === pt4a.rowId); // ORACLE-EDIT C3.3 round-5 (26 ก.ย.)
    const bb = rows.find((r) => payOf(r.refId) === pt4b.rowId);
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
    const pick = (ref: string, u: string) => rows.filter((r) => payOf(r.refId) === ref && r.userId === u); // ORACLE-EDIT C3.3 round-5 (26 ก.ย.)
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

  {
    // ORACLE-EDIT C3.3 money-review (26 ก.ย.) — ruling B1 (new check M6): the base T is valueSatang (pre-VAT) FROZEN on the first row of
    //   (deal, rule); wonValueSatang (Σ grand totals incl. VAT) drifts after every sale and must never move the shares
    const cF = await mk(tidA, "CRM", "CRM B1 คงที่");
    const cTT = await mk(tidA, "CRM", "CRM B1 ขั้นบันได");
    for (const x of [cF, cTT]) await setCrm(x, { uiVersion: 2, bridgesEnabled: true, commission: AUTO });
    const R_F = { kind: "FIXED", config: { fixedSatang: 15_000, pctBp: 300 } };
    const R_TT = { kind: "TIERED", config: { tiers: [{ uptoSatang: 500_000, pctBp: 500 }, { uptoSatang: null, pctBp: 800 }] } };
    await mkRule(tidA, cF, R_F);
    await mkRule(tidA, cTT, R_TT);
    const dF = await mkDeal(tidA, cF, await mkPipe(tidA, cF), uC[1], 300_000);
    const dT = await mkDeal(tidA, cTT, await mkPipe(tidA, cTT), uC[1], 1_000_000);
    // ORACLE-EDIT C3.3 round-3 (26 ก.ย.) — ruling S-a: every payment enters `paid` PRE-VAT ⇒ the POS bills are REAL PosSale rows (grand 107,000 ·
    //   vat 7,000 ⇒ net 100,000) so the product can read their VAT; the CrmDealPayment carries the gross like the money path writes it
    const posPay = async (d: Deal, amount: number) =>
      (await P.crmDealPayment.create({ data: { tenantId: d.tid, systemId: d.sys, dealId: d.id, refType: "POS_SALE", refId: await mkSale(d.tid, d.sys, amount, Math.round((amount * 7) / 107)), satang: BigInt(amount), status: "COUNTED", countedAt: NOWP } })).id as string;
    const refsF: string[] = [];
    for (let i = 1; i <= 3; i += 1) {
      await P.crmDeal.update({ where: { id: dF.id }, data: { wonValueSatang: BigInt(107_000 * i) } }); // R-E.7 drift (grand totals incl. 7 % VAT)
      const ref = await posPay(dF, 107_000);
      refsF.push(ref);
      await call(F_.onPaid, ctx(tidA, cF, null), { dealId: dF.id, refType: "DEAL_PAYMENT", refId: ref });
    }
    const refsT: string[] = [];
    for (let i = 1; i <= 2; i += 1) {
      await P.crmDeal.update({ where: { id: dT.id }, data: { wonValueSatang: BigInt(535_000 * i) } });
      const ref = await posPay(dT, 535_000);
      refsT.push(ref);
      await call(F_.onPaid, ctx(tidA, cTT, null), { dealId: dT.id, refType: "DEAL_PAYMENT", refId: ref });
    }
    await settle(tidA);
    const fullF = fullOf("FIXED", R_F.config, b(300_000));
    const expF = seqShares(fullF, b(300_000), [b(100_000), b(100_000), b(100_000)]); // pre-VAT: 107,000 × (107,000 − 7,000) / 107,000 = 100,000
    const driftF = fullOf("FIXED", R_F.config, b(321_000));
    const fullT = fullOf("TIERED", R_TT.config, b(1_000_000));
    const expT = seqShares(fullT, b(1_000_000), [b(500_000), b(500_000)]); // pre-VAT: 535,000 × 500,000 / 535,000 = 500,000
    const grossF = seqShares(fullF, b(300_000), [b(107_000), b(107_000), b(107_000)]);
    console.log(`  [arith] M6 FIXED 15,000 + ⌊300,000·300/10⁴⌋ = ${fullF} · 3 sales of 107,000 gross = 100,000 net ⇒ F(100k)/F(200k)−F(100k)/F(300k)−F(200k) = ${expF.join(" + ")} (gross shares would be ${grossF.join(" + ")} · a drifting base 321,000 would pay ${driftF}) · TIERED 5 %≤500k/8 % on 1,000,000 = 25,000 + 40,000 = ${fullT} · 2 × 535,000 gross = 500,000 net ⇒ ${expT.join(" + ")}`);
    const rF = await comm({ dealId: dF.id });
    const rT = await comm({ dealId: dT.id });
    // ORACLE-EDIT C3.3 round-5 (26 ก.ย.) — payOf() in okF/okT
    const okF = rF.length === 3 && refsF.every((ref, i) => { const r = rF.find((x) => payOf(x.refId) === ref); return r && b(r.amountSatang) === expF[i] && Number(r.basisSatang) === 300_000; }) && sumB(rF) === fullF;
    const okT = rT.length === 2 && refsT.every((ref, i) => { const r = rT.find((x) => payOf(x.refId) === ref); return r && b(r.amountSatang) === expT[i] && Number(r.basisSatang) === 1_000_000; }) && sumB(rT) === fullT;
    chk("C3.3-M6", `rulings B1 + S-a drift-proof pre-VAT base: 3 POS sales of 107,000 (100,000 + 7 % VAT) on a deal valued 300,000 while wonValueSatang drifts 107k→214k→321k ⇒ FIXED ฿150 + 3 % pays exactly ${fullF} in total (${expF.join("/")}), never ${driftF} · TIERED 5 % ≤ 500,000 / 8 % above on a deal of 1,000,000 paid by two sales of 535,000 (500,000 net) ⇒ exactly ${fullT} (${expT.join("/")}, the running total is proportional) · every payment enters the running total pre-VAT · every row's basisSatang = the frozen base`,
      okF && okT, `${fullF} · ${fullT}`, `fixed=${desc(rF)} Σ=${sumB(rF)} bs=${rF.map((r) => String(r.basisSatang)).join("/")} tiered=${desc(rT)} Σ=${sumB(rT)}${ABSENT}`);
  }
  {
    // ORACLE-EDIT C3.3 money-review (26 ก.ย.) — ruling B2 (new check M7): the running total heals itself after a voided payment
    const c7 = await mk(tidA, "CRM", "CRM B2 ยกเลิกงวด");
    await setCrm(c7, { uiVersion: 2, bridgesEnabled: true, commission: AUTO });
    await mkRule(tidA, c7, { kind: "PCT", config: { pctBp: 1_000 } });
    const d7 = await mkDeal(tidA, c7, await mkPipe(tidA, c7), uC[2], 10_000_000);
    const q1 = await pay(d7, "m7p1", 6_000_000);
    const q2 = await pay(d7, "m7p2", 6_000_000);
    const v1 = await call(PM.reverseDocPayment, { tenantId: tidA, systemId: c7 }, { documentId: d7.inv, paymentId: q1.paymentId });
    await settle(tidA);
    const q3 = await pay(d7, "m7p3", 4_000_000);
    const T7 = b(10_000_000);
    const full7 = fullOf("PCT", { pctBp: 1_000 }, T7);
    const e1 = F(full7, T7, b(6_000_000));
    const e2 = F(full7, T7, b(12_000_000)) - e1; // p1 still counted
    const eTop = F(full7, T7, b(6_000_000)) - e2; // ORACLE-EDIT C3.3-H2 (27 ก.ย.): p1 voided ⇒ p2's clipped share is restored at once (ONE top-up row on p2)
    const e3 = F(full7, T7, b(6_000_000) + b(4_000_000)) - e2 - eTop; // p3: running total over p2 (e2 + top-up, credited) + p3
    const expNet = e1 + e2 - e1 + eTop + e3;
    console.log(`  [arith] M7 T 10,000,000 · 10 % ⇒ full ${full7} · p1 6M ⇒ ${e1} · p2 6M ⇒ F(12M)−${e1} = ${e2} · void p1 ⇒ −${e1} · p3 4M ⇒ F(6M+4M)−${e2} = ${e3} · net ${expNet}`);
    const rows = await comm({ dealId: d7.id });
    const orig = (ref: string) => rows.find((r) => payOf(r.refId) === ref && !r.reversedOfId && !/#t\d+$/.test(String(r.refId))); // ORACLE-EDIT C3.3 round-5 (26 ก.ย.) · C3.3-H2: base row, not a top-up
    const top2 = rows.filter((r) => payOf(r.refId) === q2.rowId && /#c\d+#t\d+$/.test(String(r.refId)) && !r.reversedOfId); // ORACLE-EDIT C3.3-H2
    const o1 = orig(q1.rowId);
    const rev1 = rows.filter((r) => r.reversedOfId && r.reversedOfId === o1?.id);
    const net = sumB(rows.filter((r) => r.status !== "REJECTED"));
    chk("C3.3-M7", `ruling B2 self-healing running total [VAT mode: the fixture's invoices are id-only (no account document) ⇒ no VAT, net = gross, so Σ shares = F_T(Σ net counted)]: T 10,000,000 at 10 % · p1 6M (${e1}) · p2 6M (${e2}) · p1 voided (reversal −${e1}) · p3 4M (${e3}) ⇒ net exactly ${expNet} = the full commission — the voided payment's share is earned again by the next payment, never lost and never paid twice`,
      q1.counted && q2.counted && v1.ok && q3.counted && !!o1 && b(o1.amountSatang) === e1 && b(orig(q2.rowId)?.amountSatang ?? -1) === e2 && b(orig(q3.rowId)?.amountSatang ?? -1) === e3
      && rev1.length === 1 && b(rev1[0].amountSatang) === -e1 && top2.length === 1 && b(top2[0].amountSatang) === eTop && net === expNet && expNet === full7, // ORACLE-EDIT C3.3-H2
      `${e1}/${e2}/−${e1}/${e3} · net ${expNet}`, `rows=${desc(rows)} net=${net} void=${rs(v1)}${ABSENT}`);
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

  {
    // ORACLE-EDIT C3.3 money-review (26 ก.ย.) — ruling S6 (new check S4.6): approvalRequired + NO chain ⇒ stays PENDING (never auto-approved)
    //   and the owner is told ONCE (template `commission.pending`, flag AuditLog `crm.commission.escalate`) however often the row is advanced
    const c6 = await mk(tidA, "CRM", "CRM ไม่มีสายอนุมัติ");
    await setCrm(c6, { uiVersion: 2, bridgesEnabled: true, commission: REQ });
    await mkRule(tidA, c6, { kind: "PCT", config: { pctBp: 1_000 } });
    const d6 = await mkDeal(tidA, c6, await mkPipe(tidA, c6), uPK, 100_000);
    await pay(d6, "s46", 100_000);
    const r6 = (await comm({ dealId: d6.id }))[0] as Any;
    const adv = fnOf(CM, "advanceById");
    const a1 = await call(adv, { tenantId: tidA, commissionId: r6?.id ?? null });
    const a2 = await Promise.all([call(adv, { tenantId: tidA, commissionId: r6?.id ?? null }), call(adv, { tenantId: tidA, commissionId: r6?.id ?? null })]);
    const sy = await call(F_.syncPayroll, ctx(tidA, c6, null), {});
    await settle(tidA);
    const after6 = r6 ? ((await comm({ id: r6.id }))[0] as Any) : null;
    const reqs = r6 ? ((await P.approvalRequest.count({ where: { tenantId: tidA, entityId: r6.id } })) as number) : -1;
    const notes = r6 ? ((await P.appNotification.findMany({ where: { tenantId: tidA, recipientUserId: uO, body: { contains: `r=${r6.id}` } } })) as Any[]) : [];
    const pendingNotes = notes.filter((x) => String(x.body).includes("n=commission.pending"));
    const flags = r6 ? ((await P.auditLog.count({ where: { tenantId: tidA, action: "crm.commission.escalate", targetId: r6.id } })) as number) : -1;
    const adj6 = await adjOf(r6?.id);
    chk("C3.3-S4.6", "ruling S6: approvalRequired with NO `crm.commission` chain ⇒ the row stays PENDING (no ApprovalRequest, no adjustment) even after 3 more advances (1 + 2 in parallel) and a syncPayroll · the OWNER got exactly ONE `commission.pending` notification for it and there is exactly ONE `crm.commission.escalate` flag",
      !!r6 && a1.ok && a2.every((x) => x.ok) && sy.ok && after6?.status === "PENDING" && !after6?.approvalRequestId && reqs === 0 && adj6.length === 0 && pendingNotes.length === 1 && flags === 1,
      "PENDING · 1 notice · 1 flag", `row=${!!r6} advance=${a1.ok ? "ok" : a1.err}/${a2.map((x) => (x.ok ? "ok" : x.err)).join(",")} status=${after6?.status ?? "-"} requests=${reqs} adj=${adj6.length} notices=${pendingNotes.length}/${notes.length} flags=${flags}${ABSENT}`);
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
    // ORACLE-EDIT C3.3 round-5 (26 ก.ย.) — N5 (new check S0.5): `crm.commission.removed` — registered once (label + consumer) and emitted,
    //   ids/satang only, when the PENDING commission of a voided payment is deleted (S5.1 above)
    const lab = read(LABELS_FILE) + "\n" + read(WEBHOOK_LABELS);
    const count = (lab.match(/value:\s*["']crm\.commission\.removed["']/g) ?? []).length;
    const evs = ((await P.outboxEvent.findMany({ where: { tenantId: tidA, type: "crm.commission.removed" } })) as Any[]).filter((e) => e.payload?.dealId === DP.s51.d.id);
    const okKeys = ["amountSatang", "commissionId", "dealId", "periodKey", "reversedOfId", "ruleId", "status", "systemId", "userId"];
    const e = evs[0];
    const keysOk = !!e && Object.keys(e.payload ?? {}).every((k) => okKeys.includes(k));
    const leak = PII.filter((x) => j(evs.map((z) => z.payload)).includes(x));
    chk("C3.3-S0.5", "round-5 N5 — event `crm.commission.removed`: declared EXACTLY ONCE across the two label registries with a consumer in outbox-consumers.ts · emitted when the PENDING commission of a voided payment is deleted (S5.1): one event, key `crm.commission.removed#<id>`, payload ids + amount only (amountSatang = the removed amount, status PENDING), no PII",
      count === 1 && typeof CONS?.["crm.commission.removed"] === "function" && evs.length === 1 && e?.idempotencyKey === `crm.commission.removed#${e?.payload?.commissionId}` && keysOk
      && Number(e?.payload?.amountSatang) === Number(DP.s51.exp) && e?.payload?.status === "PENDING" && e?.systemId === crmP && leak.length === 0,
      "1 label · consumer · 1 event ids-only", `labels=${count} consumer=${typeof CONS?.["crm.commission.removed"]} events=${evs.length} payload=${cut(j(e?.payload), 200)} leaks=${leak.length}${ABSENT}`, "MAJOR");
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
    // ORACLE-EDIT C3.3 money-review (26 ก.ย.) — ruling B3: the original's HR adjustment is still HR-PENDING and in no run ⇒ it is WITHDRAWN
    //   (hr.withdrawCommissionAdjustment deletes it under guard PENDING + runId null), NOTHING is deducted, the original's link is cleared and
    //   the reversal row is closed with a note — a DEDUCTION would take back money HR never paid
    const origAdjGone = origAdj[0] ? !(await P.hrPayAdjustment.findUnique({ where: { id: origAdj[0].id } })) : false;
    const origAdjNow = await adjOf(orig?.id);
    chk("C3.3-S5.2", `reverse AFTER approval while HR has NOT approved the adjustment yet (PENDING, no run — ruling B3): ONE REVERSED row = −${DP.s52.exp} · reversedOfId = the original · refType REVERSAL · refId = original id · periodKey ${expK} (first month after ${base} without a payroll run) · the original's un-approved HR adjustment is withdrawn (row gone, link cleared), NOTHING deducted, the reversal row carries the settled note · the original row keeps APPROVED`,
      r.ok && origAdj.length === 1 && rv.ok && revRows.length === 1 && b(s52Rev.amountSatang) === -DP.s52.exp && s52Rev.status === "REVERSED" && s52Rev.refType === "REVERSAL" && s52Rev.refId === orig?.id
      && s52Rev.periodKey === expK && dAdj.length === 0 && origAdjGone && origAdjNow.length === 0 && !origAfter?.hrPayAdjustmentId && !s52Rev.hrPayAdjustmentId && !!s52Rev.note
      && origAfter?.status === "APPROVED",
      `−${DP.s52.exp} · withdrawn · 0 deduction · note`, `approve=${rs(r)} origAdj=${origAdj.length} gone=${origAdjGone} now=${origAdjNow.length} origLink=${origAfter?.hrPayAdjustmentId ?? null} void=${rs(rv)} rev=${cut(j(revRows.map((x) => ({ a: x.amountSatang, s: x.status, t: x.refType, p: x.periodKey, note: x.note }))), 200)} ded=${dAdj.length} orig=${origAfter?.status}${ABSENT}`);
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
    // ORACLE-EDIT C3.3 money-review (26 ก.ย.) — ruling B3: after the withdrawal of S5.2 there is no deduction to double; the replay must not
    //   create one, nor re-send the original, nor reopen the settled reversal
    const origNow = await adjOf(orig?.id);
    chk("C3.3-X4.2", "X4 (M10) reversal never double-reverses: the void replayed + commissions.reverse(refId) ×2 in a row + ×2 in parallel ⇒ still ONE negative row, still NO deduction and NO adjustment for the original (ruling B3 — its un-approved adjustment was withdrawn), the settled note stays",
      rv2.ok && rr.every((r) => r.ok) && revRows.length === 1 && dAdj.length === 0 && origNow.length === 0 && !!revRows[0]?.note && !revRows[0]?.hrPayAdjustmentId,
      "1 · 0 · 0", `void2=${rs(rv2)} calls=${rr.map((r) => (r.ok ? "ok" : r.err)).join("|")} reversals=${revRows.length} deductions=${dAdj.length} origAdj=${origNow.length} note=${!!revRows[0]?.note}${ABSENT}`);
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

  {
    // ORACLE-EDIT C3.3 money-review (26 ก.ย.) — ruling B4 (new check M8): a rule that already has commission rows cannot change its basis
    const before = (await P.crmCommissionRule.findUnique({ where: { id: rS1 } })) as Any;
    const hasRows = (await P.crmCommission.count({ where: { ruleId: rS1 } })) as number;
    const refusedB = await call(F_.updateRule, ctx(tidA, crmS1, uO), aO, rS1, { basis: "WON" });
    const after = (await P.crmCommissionRule.findUnique({ where: { id: rS1 } })) as Any;
    // ORACLE-EDIT C3.3 round-3 (26 ก.ย.) — the refusal also covers kind / config (rate) / minDealSatang; a non-money field (name) still changes
    const refusedK = await call(F_.updateRule, ctx(tidA, crmS1, uO), aO, rS1, { kind: "FIXED", config: { fixedSatang: 1_000 } });
    const refusedC = await call(F_.updateRule, ctx(tidA, crmS1, uO), aO, rS1, { config: { pctBp: 600 } });
    const refusedMin = await call(F_.updateRule, ctx(tidA, crmS1, uO), aO, rS1, { minDealSatang: 1_000 });
    const afterAll = (await P.crmCommissionRule.findUnique({ where: { id: rS1 } })) as Any;
    const nameOk = await call(F_.updateRule, ctx(tidA, crmS1, uO), aO, rS1, { name: `กฎเปลี่ยนชื่อ ${TAG}` });
    const afterName = (await P.crmCommissionRule.findUnique({ where: { id: rS1 } })) as Any;
    const moneySame = afterName && afterName.kind === before?.kind && j(afterName.config) === j(before?.config) && j(afterName.minDealSatang) === j(before?.minDealSatang) && afterName.basis === before?.basis;
    const ctrlId = await mkRule(tidA, crmR, { kind: "PCT", config: { pctBp: 100 } }); // no rows ⇒ the basis may change (positive control)
    const ctrl = await call(F_.updateRule, ctx(tidA, crmR, uO), aO, ctrlId, { basis: "WON" });
    const ctrlRow = (await P.crmCommissionRule.findUnique({ where: { id: ctrlId } })) as Any;
    chk("C3.3-M8", "ruling B4 (+ round 3): on a rule that already has commission rows, changing the basis (PAID → WON), the kind (PCT → FIXED), the rate (config 500 → 600 bp) or minDealSatang ⇒ VALIDATION (Thai) each time and the rule is byte-identical afterwards · a rename of the same rule succeeds with the money fields unchanged · a basis change on a rule WITHOUT rows succeeds (positive control)",
      hasRows > 0 && isVal(refusedB) && isVal(refusedK) && isVal(refusedC) && isVal(refusedMin) && j(after) === j(before) && j(afterAll) === j(before) && nameOk.ok && !!moneySame && ctrl.ok && ctrlRow?.basis === "WON",
      "4 × VALIDATION · unchanged · rename ok · control ok", `rows=${hasRows} basis=${rs(refusedB)} kind=${rs(refusedK)} config=${rs(refusedC)} min=${rs(refusedMin)} unchanged=${j(afterAll) === j(before)} rename=${rs(nameOk)}/${moneySame} control=${rs(ctrl)}/${ctrlRow?.basis}${ABSENT}`, "MAJOR");
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
  // ═════════════════════════════════════════════════════════════════════════════
  // ORACLE-EDIT C3.3 round-3 (26 ก.ย.) — controller round-3 rulings: R1 (value-0 base grows) · S-b (reversal vs HR reject race) ·
  //   S-c (rehome in place, never an APPROVED adjustment) · S-d (chain self-decision · requestedById never null) · S-e (queue has no
  //   3-day cut for a deal with no row yet) · no retro credit (M11). Tenants Q and M are dedicated so the scoped minute-job
  //   `runPayrollSync(now, { tenantIds })` touches nothing of tenant A.
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── round 3 · R1 · S-a..S-e ──");
  const ADV = fnOf(CM, "advanceById");
  const SYNC = fnOf(CM, "runPayrollSync");
  const spawnT = (tid: string, arg: Any, startAt: number) => new Promise<string[]>((resolve) => {
    const enc = Buffer.from(JSON.stringify(arg), "utf8").toString("base64url");
    const ch = spawn("pnpm", ["exec", "tsx", THIS_FILE, "--x3-worker", tid, String(startAt), enc], { env: process.env });
    let out = "";
    const to = setTimeout(() => { try { ch.kill("SIGKILL"); } catch { /* gone */ } }, 300_000);
    ch.stdout.on("data", (d: Any) => { out += String(d); });
    ch.stderr.on("data", (d: Any) => { out += String(d); });
    ch.on("error", (e: Any) => { clearTimeout(to); resolve([`SPAWN-ERROR ${String(e)}`]); });
    ch.on("close", () => { clearTimeout(to); const m = /X3WORKER (\[.*\])/.exec(out); resolve(m ? (JSON.parse(m[1]) as string[]) : [`NO-OUTPUT ${cut(out, 200)}`]); });
  });
  const R5 = { kind: "PCT", config: { pctBp: 500 } };
  const R10 = { kind: "PCT", config: { pctBp: 1_000 } };

  // ── M9 · R1: a deal WITHOUT value — T = max(frozen, pre-VAT so far) grows; new rows carry the grown T ──
  const cM9 = await mk(tidA, "CRM", "CRM R1 ไม่มีมูลค่า");
  await setCrm(cM9, { uiVersion: 2, bridgesEnabled: true, commission: AUTO });
  await mkRule(tidA, cM9, R5);
  const pM9 = await mkPipe(tidA, cM9);
  const T1 = b(10_000);
  const T2 = b(110_000) > T1 ? b(110_000) : T1;
  const m9a = fullOf("PCT", R5.config, T1) >= Z ? F(fullOf("PCT", R5.config, T1), T1, b(10_000)) : Z;
  const m9b = F(fullOf("PCT", R5.config, T2), T2, b(110_000)) - m9a;
  console.log(`  [arith] M9 value 0 · 5 % · bill 1 10,700 gross (700 VAT ⇒ 10,000 net): T=10,000 ⇒ ${m9a} · bill 2 107,000 gross (100,000 net): T=max(10,000, 110,000)=110,000 ⇒ F=⌊5,500·110,000/110,000⌋ − ${m9a} = ${m9b} · Σ ${m9a + m9b}`);
  let m9seq = "";
  let m9ok = false;
  {
    const d = await mkDeal(tidA, cM9, pM9, uC[1], 0, [], true);
    const s1 = await mkSale(tidA, cM9, 10_700, 700);
    const r1 = (await P.crmDealPayment.create({ data: { tenantId: tidA, systemId: cM9, dealId: d.id, refType: "POS_SALE", refId: s1, satang: BigInt(10_700), status: "COUNTED", countedAt: NOWP } })).id as string;
    await call(F_.onPaid, ctx(tidA, cM9, null), { dealId: d.id, refType: "DEAL_PAYMENT", refId: r1 });
    const s2 = await mkSale(tidA, cM9, 107_000, 7_000);
    const r2 = (await P.crmDealPayment.create({ data: { tenantId: tidA, systemId: cM9, dealId: d.id, refType: "POS_SALE", refId: s2, satang: BigInt(107_000), status: "COUNTED", countedAt: NOWP } })).id as string;
    await call(F_.onPaid, ctx(tidA, cM9, null), { dealId: d.id, refType: "DEAL_PAYMENT", refId: r2 });
    await settle(tidA);
    const rows = await comm({ dealId: d.id });
    const a = rows.find((r) => payOf(r.refId) === r1); // ORACLE-EDIT C3.3 round-5 (26 ก.ย.)
    const bb = rows.find((r) => payOf(r.refId) === r2);
    m9ok = rows.length === 2 && !!a && !!bb && b(a.amountSatang) === m9a && b(bb.amountSatang) === m9b && b(a.basisSatang) === T1 && b(bb.basisSatang) === T2 && sumB(rows) === m9a + m9b;
    m9seq = `${desc(rows)} bs=${rows.map((r) => String(r.basisSatang)).join("/")}`;
  }
  const M9R = 3;
  const m9deals: { d: Deal; s1: string; s2: string }[] = [];
  for (let r = 0; r < M9R; r += 1) {
    const d = await mkDeal(tidA, cM9, pM9, uC[1], 0, [], true);
    m9deals.push({ d, s1: await mkSale(tidA, cM9, 10_700, 700), s2: await mkSale(tidA, cM9, 107_000, 7_000) });
  }
  const m9Start = Date.now() + 45_000;
  const m9Arg = (which: "s1" | "s2") => ({ rounds: m9deals.map((x, r) => ({ atMs: r * 3_000, calls: [{ ph: "R", fn: "posCount", sys: cM9, a: { dealId: x.d.id, saleId: x[which], satang: which === "s1" ? 10_700 : 107_000, now: NOWP.toISOString() }, n: 1 }] })) });
  const m9w = (await Promise.all([spawnT(tidA, m9Arg("s1"), m9Start), spawnT(tidA, m9Arg("s2"), m9Start)])).flat();
  await settle(tidA);
  {
    const per: string[] = [];
    let ok = true;
    for (const x of m9deals) {
      const rows = await comm({ dealId: x.d.id });
      const bs = rows.map((r) => b(r.basisSatang));
      const good = rows.length === 2 && sumB(rows) === m9a + m9b && bs.every((v) => v <= T2) && bs.some((v) => v === T2);
      ok = ok && good;
      per.push(`${rows.length}r/Σ${sumB(rows)}/bs${bs.join("|")}`);
    }
    chk("C3.3-M9a", `[positive control] 2 worker PROCESSES counted the two bills of each of ${M9R} value-0 deals at the same moment (count + onPaid ×1 + ×2 in parallel) and every call returned`,
      m9w.length === M9R * 2 && m9w.every((o) => o === "R:OK"), `${M9R * 2} R:OK`, `${m9w.length} ${cut(m9w.filter((o) => o !== "R:OK").slice(0, 2).join(" | "), 200)}${ABSENT}`, "MAJOR");
    chk("C3.3-M9", `ruling R1 (BLOCKER) — a deal with valueSatang 0: T = max(frozen, pre-VAT so far) GROWS and each new row carries the grown T · sequential: bill 10,700 ⇒ ${m9a} (basis 10,000) then bill 107,000 ⇒ ${m9b} (basis 110,000), Σ ${m9a + m9b} · the same two bills counted in parallel by 2 processes (${M9R} rounds) ⇒ Σ still ${m9a + m9b}, every basisSatang ≤ 110,000 and the largest = 110,000`,
      m9ok && ok, `${m9a}+${m9b} · parallel Σ ${m9a + m9b}`, `seq=${m9seq} parallel=${per.join(" ")}${ABSENT}`);
  }

  // ── M11 · no retro credit: money counted before the rule existed earns nothing from that rule ──
  {
    const c11 = await mk(tidA, "CRM", "CRM กฎมาทีหลัง");
    await setCrm(c11, { uiVersion: 2, bridgesEnabled: true, commission: AUTO });
    const late = await mkRule(tidA, c11, { ...R10, createdAt: T("2026-09-16T00:00:00Z") }); // after the payment (15 Sep 12:00 Thai)
    const early = await mkRule(tidA, c11, { ...R10, createdAt: T("2026-09-01T00:00:00Z") }); // before it (positive control)
    const d = await mkDeal(tidA, c11, await mkPipe(tidA, c11), uC[1], 100_000);
    const ref = await rawPay(d, 100_000);
    const r = await call(F_.onPaid, ctx(tidA, c11, null), { dealId: d.id, refType: "DEAL_PAYMENT", refId: ref });
    await settle(tidA);
    const rows = await comm({ dealId: d.id });
    chk("C3.3-M11", "no retroactive credit: a payment counted on 15 Sep earns NOTHING from a rule created on 16 Sep, while a rule created on 1 Sep (positive control) pays its 10,000 for the same payment",
      r.ok && rows.filter((x) => x.ruleId === late).length === 0 && rows.filter((x) => x.ruleId === early).length === 1 && Number(rows.find((x) => x.ruleId === early)?.amountSatang) === 10_000,
      "late 0 · early 10,000", `onPaid=${rs(r)} late=${rows.filter((x) => x.ruleId === late).length} early=${desc(rows.filter((x) => x.ruleId === early))}${ABSENT}`, "MAJOR");
  }

  // ── ORACLE-EDIT C3.3 round-5 (26 ก.ย.) — M12 (ruling B1 incarnation key) · M13 (ruling S1 zero-share revisit) ──
  {
    const APC = fnOf(CM, "afterPaymentCounted");
    const APR = fnOf(CM, "afterPaymentsReversed");
    const c12 = await mk(tidA, "CRM", "CRM ร่างใหม่ของงวด");
    await setCrm(c12, { uiVersion: 2, bridgesEnabled: true, commission: AUTO });
    await mkRule(tidA, c12, R10);
    const d = await mkDeal(tidA, c12, await mkPipe(tidA, c12), uC[1], 10_000);
    const payRef = `${TAG}-m12p`;
    const docRef = `${TAG}-m12doc`;
    await P.crmDealPayment.create({ data: { tenantId: tidA, systemId: c12, dealId: d.id, refType: "PAYMENT", refId: payRef, satang: BigInt(9_700), status: "COUNTED", countedAt: NOWP } });
    const t0 = new Date(NOWP.getTime() + 60_000);
    const sRow = await P.crmDealPayment.create({ data: { tenantId: tidA, systemId: c12, dealId: d.id, refType: "DOC_SETTLE", refId: docRef, satang: BigInt(300), status: "COUNTED", countedAt: t0 } });
    const c0 = { tenantId: tidA, systemId: c12 };
    const a1 = await call(APC, c0, { dealId: d.id, refType: "PAYMENT", refId: payRef });
    const a2 = await call(APC, c0, { dealId: d.id, refType: "DOC_SETTLE", refId: docRef });
    await settle(tidA);
    const rows0 = await comm({ dealId: d.id });
    // the C2.7 "wake": REVERSED + re-COUNTED in ONE statement (the REVERSED state is never visible) — new satang 100, new countedAt
    const t1 = new Date(NOWP.getTime() + 2 * 3_600_000);
    await P.crmDealPayment.update({ where: { id: sRow.id }, data: { satang: BigInt(100), countedAt: t1 } });
    const a3 = await call(APC, c0, { dealId: d.id, refType: "DOC_SETTLE", refId: docRef });
    await settle(tidA);
    const rows1 = await comm({ dealId: d.id });
    const T12 = b(10_000);
    const full12m = fullOf("PCT", R10.config, T12);
    const eP = F(full12m, T12, b(9_700));
    const eS = F(full12m, T12, b(10_000)) - eP;
    const eN = F(full12m, T12, b(9_800)) - eP; // the stale settle key no longer counts: paid = 9,700 + 100
    const expNet = eP + eS - eS + eN;
    console.log(`  [arith] M12 T 10,000 · 10 % ⇒ full ${full12m} · payment 9,700 ⇒ ${eP} · settle 300 (key #c${t0.getTime()}) ⇒ F(10,000)−${eP} = ${eS} · settle re-counted as 100 (key #c${t1.getTime()}) ⇒ −${eS} reversal + F(9,800)−${eP} = ${eN} · net ${expNet}`);
    const oldKey = `${sRow.id}#c${t0.getTime()}`;
    const newKey = `${sRow.id}#c${t1.getTime()}`;
    const oldRow = rows1.find((r) => r.refId === oldKey);
    const rev = oldRow ? rows1.filter((r) => r.reversedOfId === oldRow.id) : [];
    const newRow = rows1.filter((r) => r.refId === newKey);
    const net = sumB(rows1.filter((r) => r.status !== "REJECTED"));
    const snap0 = j(rows1);
    const rp = [await call(APC, c0, { dealId: d.id, refType: "DOC_SETTLE", refId: docRef }), await call(APR, c0, { dealId: d.id })];
    rp.push(...(await Promise.all([call(APC, c0, { dealId: d.id, refType: "DOC_SETTLE", refId: docRef }), call(APC, c0, { dealId: d.id, refType: "DOC_SETTLE", refId: docRef }), call(APR, c0, { dealId: d.id })])));
    await settle(tidA);
    const snap1 = j(await comm({ dealId: d.id }));
    chk("C3.3-M12", `round-5 B1 incarnation key: payment 9,700 (${eP}) + DOC_SETTLE 300 (${eS}, refId ${"<id>#c<t0>"}) · the settle row is re-counted in one statement as 100 with a new countedAt ⇒ afterPaymentCounted reverses the old key (−${eS}) and credits the new key <id>#c<t1> (${eN}) ⇒ net exactly ${expNet} · afterPaymentCounted ×3 (2 in parallel) + afterPaymentsReversed ×2 ⇒ unchanged`,
      a1.ok && a2.ok && a3.ok && rows0.length === 2 && !!oldRow && b(oldRow.amountSatang) === eS && rev.length === 1 && b(rev[0].amountSatang) === -eS && newRow.length === 1 && b(newRow[0].amountSatang) === eN && net === expNet && rp.every((x) => x.ok) && snap1 === snap0,
      `−${eS} · +${eN} · net ${expNet}`, `rows=${desc(rows1)} old=${!!oldRow} rev=${rev.length} new=${newRow.length} net=${net} replay=${rp.map((x) => (x.ok ? "ok" : x.err)).join("|")} unchanged=${snap1 === snap0}${ABSENT}`);
  }
  {
    const c13 = await mk(tidA, "CRM", "CRM งวดที่เคยได้ศูนย์");
    await setCrm(c13, { uiVersion: 2, bridgesEnabled: true, commission: AUTO });
    await mkRule(tidA, c13, R10);
    const d = await mkDeal(tidA, c13, await mkPipe(tidA, c13), uC[1], 10_000);
    const tA = new Date(NOWP.getTime() - 10 * DAY);
    const pA = await pay(d, "m13a", 10_000, tA);
    const pB = await pay(d, "m13b", 4_000, new Date(tA.getTime() + 3_600_000)); // over-collection: its share is 0 ⇒ no row
    const bBefore = (await comm({ dealId: d.id })).filter((r) => payOf(r.refId) === pB.rowId).length;
    const v = await call(PM.reverseDocPayment, { tenantId: tidA, systemId: c13 }, { documentId: d.inv, paymentId: pA.paymentId }); // voided 10 days later
    await settle(tidA);
    const rows = await comm({ dealId: d.id });
    const T13 = b(10_000);
    const f13 = fullOf("PCT", R10.config, T13);
    const eA = F(f13, T13, b(10_000));
    const eB0 = F(f13, T13, b(14_000)) - eA;
    const eB = F(f13, T13, b(4_000));
    console.log(`  [arith] M13 T 10,000 · 10 % ⇒ full ${f13} · A 10,000 ⇒ ${eA} · B 4,000 ⇒ F(14,000)−${eA} = ${eB0} (no row) · void A (10 days later) ⇒ −${eA} and B re-credited F(4,000)−0 = ${eB} · net ${eA - eA + eB}`);
    const rowA = rows.find((r) => payOf(r.refId) === pA.rowId && !r.reversedOfId);
    const revA = rowA ? rows.filter((r) => r.reversedOfId === rowA.id) : [];
    const rowB = rows.filter((r) => payOf(r.refId) === pB.rowId && !r.reversedOfId);
    const net = sumB(rows.filter((r) => r.status !== "REJECTED"));
    chk("C3.3-M13", `round-5 S1 zero-share revisit: A 10,000 earns ${eA} · B 4,000 over-collects (share ${eB0} ⇒ no row) · A is voided 10 days later (outside the minute-job's 3-day window) ⇒ −${eA} AND B is re-credited ${eB} by afterPaymentsReversed itself ⇒ net ${eB}`,
      pA.counted && pB.counted && eB0 === Z && bBefore === 0 && v.ok && !!rowA && b(rowA.amountSatang) === eA && revA.length === 1 && b(revA[0].amountSatang) === -eA && rowB.length === 1 && b(rowB[0].amountSatang) === eB && net === eB,
      `−${eA} · +${eB} · net ${eB}`, `rows=${desc(rows)} bBefore=${bBefore} void=${rs(v)} net=${net}${ABSENT}`);
  }

  // ── M10 · S-e: value set 4 days after the money — the minute-job queue (1ก) still credits it (tenant M, scoped run) ──
  {
    const tidM = await mkTenant("m");
    await member(tidM, uO, "OWNER");
    await member(tidM, uTH, "STAFF", SALES);
    const c10 = await mk(tidM, "CRM", "CRM มูลค่ามาทีหลัง");
    await setCrm(c10, { uiVersion: 2, bridgesEnabled: true, commission: AUTO });
    await mkRule(tidM, c10, R10);
    const d = await mkDeal(tidM, c10, await mkPipe(tidM, c10), uTH, 0, [], true); // no value · no document ⇒ T = 0
    const ref = await rawPay(d, 100_000);
    const first = await call(F_.onPaid, ctx(tidM, c10, null), { dealId: d.id, refType: "DEAL_PAYMENT", refId: ref });
    const before = (await comm({ dealId: d.id })).length;
    await P.crmDeal.update({ where: { id: d.id }, data: { valueSatang: 100_000 } }); // the value is filled in later
    const later = new Date(NOWP.getTime() + 4 * DAY);
    const run = await call(SYNC, later, { tenantIds: [tidM] });
    await settle(tidM);
    const rows = await comm({ dealId: d.id });
    const exp = fullOf("PCT", R10.config, b(100_000));
    chk("C3.3-M10", `ruling S-e: a payment counted on a deal with NO value and NO document earns nothing at first (T = 0) · 4 days later the value 100,000 is filled in and the minute-job queue runPayrollSync(now = +4 days, scoped to this tenant) still credits it (${exp}, period ${PK}) — no 3-day cut for a deal that has no row for the rule yet`,
      first.ok && before === 0 && run.ok && rows.length === 1 && b(rows[0].amountSatang) === exp && payOf(rows[0].refId) === ref && rows[0].periodKey === PK, // ORACLE-EDIT C3.3 round-5 (26 ก.ย.)
      `0 → ${exp}`, `first=${rs(first)} before=${before} run=${rs(run)} rows=${desc(rows)}${ABSENT}`);
  }

  // ── tenant Q: S4.8 (chain self-decision · requestedById) → S4.7 (rehome) → S5.5 (withdraw after rehome + race with HR reject) ──
  const tidQ = await mkTenant("q");
  await member(tidQ, uO, "OWNER");
  await member(tidQ, uM, "MANAGER", { "crm._maxCommissionApproveSatang": CAP });
  await member(tidQ, uTH, "STAFF", SALES);
  const hrQ = await mk(tidQ, "HR", "พนักงาน Q");
  const cHRQ = { tenantId: tidQ, systemId: hrQ };
  const eQ: Record<string, string> = {};
  for (const u of [uO, uM, uTH]) eQ[u] = await mkEmp(tidQ, hrQ, u);
  const cQC = await mk(tidQ, "CRM", "CRM สายอนุมัติ Q");
  const cQS = await mk(tidQ, "CRM", "CRM อัตโนมัติ Q");
  await setCrm(cQC, { uiVersion: 2, bridgesEnabled: true, commission: REQ });
  await setCrm(cQS, { uiVersion: 2, bridgesEnabled: true, commission: AUTO });
  await APV.createPolicy({ tenantId: tidQ }, { name: `คอมมิชชัน Q ${TAG}`, entityType: "crm.commission", systemId: cQC, steps: [{ order: 1, approverRole: "MANAGER" }] });
  await mkRule(tidQ, cQC, R10);
  await mkRule(tidQ, cQS, R10);
  const pQC = await mkPipe(tidQ, cQC);
  const pQS = await mkPipe(tidQ, cQS);
  const qRow = async (sys: string, pipe: Pipe, owner: string, value: number) => {
    const d = await mkDeal(tidQ, sys, pipe, owner, value);
    const ref = await rawPay(d, value);
    await call(F_.onPaid, ctx(tidQ, sys, null), { dealId: d.id, refType: "DEAL_PAYMENT", refId: ref });
    await settle(tidQ);
    return { d, ref, row: (await comm({ dealId: d.id }))[0] as Any };
  };
  const decideAs = async (who: string, role: string, commissionId: string | undefined) => {
    const req = await reqOf(tidQ, commissionId);
    if (!req) return { ok: false, status: "NO_REQUEST" };
    return APV.decide({ userId: who, role, unitAccess: role === "OWNER" ? [] : ["*"], permissions: {} }, { tenantId: tidQ }, req.id, { decision: "APPROVED", note: `ข้อสอบ ${TAG}` });
  };
  {
    const qM = await qRow(cQC, pQC, uM, 100_000); // the MANAGER's own commission
    const qT = await qRow(cQC, pQC, uTH, 200_000);
    const qO = await qRow(cQC, pQC, uO, 300_000); // the OWNER's own commission
    const qA = await qRow(cQS, pQS, uTH, 400_000); // auto path (approvalRequired false)
    const dM = await decideAs(uM, "MANAGER", qM.row?.id);
    const dT = await decideAs(uM, "MANAGER", qT.row?.id);
    const dO = await decideAs(uO, "OWNER", qO.row?.id);
    await settle(tidQ);
    const st = async (x: { row: Any }) => (x.row ? ((await comm({ id: x.row.id }))[0] as Any) : null);
    const [sM, sT, sO, sA] = [await st(qM), await st(qT), await st(qO), await st(qA)];
    const [aM, aT, aO2, aA] = [await adjOf(sM?.id), await adjOf(sT?.id), await adjOf(sO?.id), await adjOf(sA?.id)];
    // ORACLE-EDIT C3.3 round-5 (26 ก.ย.) — ruling S3: the self-decided row is NOT rejected — it stays PENDING, keeps its request, gets a Thai note
    //   and the OWNER is escalated to exactly once (AuditLog `crm.commission.escalate`)
    const escM = sM ? ((await P.auditLog.count({ where: { tenantId: tidQ, action: "crm.commission.escalate", targetId: sM.id } })) as number) : -1;
    chk("C3.3-S4.8", "ruling S-d (+ round-5 S3): a chain decision by the row's OWN user (a MANAGER who is the chain step) does not approve it ⇒ stays PENDING (request kept · note · owner notified once), no HR adjustment · the same MANAGER approving someone else's row ⇒ APPROVED and the HR adjustment's requestedById = him · the OWNER deciding his own row ⇒ APPROVED, requestedById = owner · the auto path (approvalRequired false) ⇒ requestedById = the row's user — never null",
      dM.ok && dT.ok && dO.ok && sM?.status === "PENDING" && !!sM?.approvalRequestId && !!sM?.note && aM.length === 0 && escM === 1 && sT?.status === "APPROVED" && aT.length === 1 && aT[0].requestedById === uM
      && sO?.status === "APPROVED" && aO2.length === 1 && aO2[0].requestedById === uO && sA?.status === "APPROVED" && aA.length === 1 && aA[0].requestedById === uTH,
      "PENDING+note+1 escalation · by=manager · by=owner · by=user", `decide=${dM.ok}/${dT.ok}/${dO.ok} self=${sM?.status}/req=${!!sM?.approvalRequestId}/note=${!!sM?.note}/esc=${escM}/${aM.length} other=${sT?.status}/${aT[0]?.requestedById === uM} owner=${sO?.status}/${aO2[0]?.requestedById === uO} auto=${sA?.status}/${aA[0]?.requestedById === uTH ? "user" : aA[0]?.requestedById ?? "null"}${ABSENT}`);
  }
  let rehomed: { ref: string; row: Any; adjId: string | null } | null = null;
  {
    const qA = await qRow(cQS, pQS, uTH, 500_000); // will be HR-APPROVED after the run exists (stranded but approved)
    const qB = await qRow(cQS, pQS, uM, 600_000); // stays HR-PENDING in a period that gets a run (stranded)
    const adjA0 = (await adjOf(qA.row?.id))[0] as Any;
    const adjB0 = (await adjOf(qB.row?.id))[0] as Any;
    await PAY.createPayrollRun(cHRQ, { periodKey: PK, payDate: T("2026-09-30T03:00:00Z") }); // pulls nothing (both still PENDING at HR)
    if (adjA0) await PAY.decideAdjustment(cHRQ, adjA0.id, "APPROVED", { userId: uO, isOwner: true });
    const snapA = j(adjA0 ? await P.hrPayAdjustment.findUnique({ where: { id: adjA0.id } }) : null);
    const expB = freePeriod(adjB0?.periodKey ?? PK, await runsOf(hrQ), false);
    const s1 = await call(SYNC, new Date(), { tenantIds: [tidQ] });
    const s2 = await call(SYNC, new Date(), { tenantIds: [tidQ] });
    await settle(tidQ);
    const a1 = adjA0 ? ((await P.hrPayAdjustment.findUnique({ where: { id: adjA0.id } })) as Any) : null;
    const b1 = adjB0 ? ((await P.hrPayAdjustment.findUnique({ where: { id: adjB0.id } })) as Any) : null;
    const rowB = qB.row ? ((await comm({ id: qB.row.id }))[0] as Any) : null;
    const adjsB = await adjOf(qB.row?.id);
    chk("C3.3-S4.7", `ruling S-c: the stranded-adjustment sweeper (runPayrollSync ×2, scoped) never touches an HR-APPROVED adjustment sitting in a period that has a run (byte-identical, same id, still APPROVED) · an HR-PENDING one in that period is moved IN PLACE: same id, periodKey ${adjB0?.periodKey ?? PK} → ${expB} (next month without a run), still PENDING, the commission still points at it and there is still exactly one`,
      !!adjA0 && !!adjB0 && s1.ok && s2.ok && j(a1) === snapA && a1?.status === "APPROVED" && b1?.id === adjB0.id && b1?.periodKey === expB && b1?.status === "PENDING" && rowB?.hrPayAdjustmentId === adjB0.id && adjsB.length === 1,
      `A untouched · B ${expB}`, `A=${!!adjA0} untouched=${j(a1) === snapA}/${a1?.status} B=${b1 ? `${b1.id === adjB0?.id ? "same" : "NEW"}/${b1.periodKey}/${b1.status}` : "gone"} link=${rowB?.hrPayAdjustmentId === adjB0?.id} count=${adjsB.length} runs=${rs(s1)}${ABSENT}`);
    rehomed = { ref: qB.ref, row: qB.row, adjId: adjB0?.id ?? null };
  }
  // S5.5 part 1 — the rehomed (PENDING, moved) original is reversed ⇒ that adjustment is withdrawn, nothing deducted
  let s55a = false;
  let s55aWhy = "";
  if (rehomed?.row) {
    await P.crmDealPayment.update({ where: { id: rehomed.ref }, data: { status: "REVERSED", reversedAt: new Date() } });
    const rv = await call(F_.reverse, ctx(tidQ, cQS, null), { refId: rehomed.ref, reason: "ยกเลิกหลังย้ายงวด" });
    await settle(tidQ);
    const rev = (await comm({ reversedOfId: rehomed.row.id })) as Any[];
    const ded = rev.length ? await adjOf(rev[0].id) : [];
    const gone = rehomed.adjId ? !(await P.hrPayAdjustment.findUnique({ where: { id: rehomed.adjId } })) : false;
    s55a = rv.ok && rev.length === 1 && ded.length === 0 && gone && !!rev[0].note;
    s55aWhy = `reverse=${rs(rv)} rev=${rev.length} ded=${ded.length} withdrawn=${gone} note=${!!rev[0]?.note}`;
  } else s55aWhy = "no rehomed row";
  // S5.5 part 2 — reversal racing HR's REJECT of the original's PENDING adjustment (2 processes, ≥ 6 rounds)
  const S55R = 6;
  const race: { ref: string; row: Any; adjId: string | null }[] = [];
  for (let r = 0; r < S55R; r += 1) {
    const x = await qRow(cQS, pQS, uTH, 100_000 + r);
    const adj = (await adjOf(x.row?.id))[0] as Any;
    await P.crmDealPayment.update({ where: { id: x.ref }, data: { status: "REVERSED", reversedAt: new Date() } }); // the money was voided
    race.push({ ref: x.ref, row: x.row, adjId: adj?.id ?? null });
  }
  const raceStart = Date.now() + 45_000;
  const argRev = { rounds: race.map((x, r) => ({ atMs: r * 3_000, calls: [{ ph: "V", fn: "reverse", sys: cQS, a: { refId: x.ref }, n: 2 }] })) };
  const argHr = { rounds: race.map((x, r) => ({ atMs: r * 3_000, calls: [{ ph: "H", fn: "hrDecide", sys: cQS, a: { hrSystemId: hrQ, adjustmentId: x.adjId ?? "-", decision: "REJECTED", deciderId: uO }, n: 2 }] })) };
  const raceOut = (await Promise.all([spawnT(tidQ, argRev, raceStart), spawnT(tidQ, argHr, raceStart)])).flat();
  await settle(tidQ);
  {
    const vOut = raceOut.filter((o) => o.startsWith("V:"));
    const hOut = raceOut.filter((o) => o.startsWith("H:"));
    const hrWon = hOut.filter((o) => o === "H:OK:decided").length;
    chk("C3.3-S5.5a", `[positive control] ${S55R} rounds: the reversal (process 1, ×2) and HR's REJECT of the original's adjustment (process 2, ×2) fired at the same moment and every call returned (HR decided first in ${hrWon} calls — the rest arrived after the withdrawal)`,
      race.every((x) => x.row && x.adjId) && vOut.length === S55R * 2 && vOut.every((o) => o === "V:OK") && hOut.length === S55R * 2 && hOut.every((o) => /^H:OK/.test(o)),
      `${S55R * 4} results`, `${raceOut.length} ${cut(raceOut.filter((o) => !/^[VH]:OK/.test(o)).slice(0, 2).join(" | "), 200)}${ABSENT}`, "MAJOR");
    const per: string[] = [];
    let ok = true;
    for (const x of race) {
      const rev = (await comm({ reversedOfId: x.row?.id ?? "-" })) as Any[];
      const ded = rev.length ? await adjOf(rev[0].id) : [];
      const orig = x.adjId ? ((await P.hrPayAdjustment.findUnique({ where: { id: x.adjId } })) as Any) : null;
      const good = rev.length === 1 && ded.length === 0 && !!rev[0].note && (orig === null || orig.status === "REJECTED");
      ok = ok && good;
      per.push(`${rev.length}rev/${ded.length}ded/${orig ? orig.status : "withdrawn"}`);
    }
    chk("C3.3-S5.5", `ruling S-b: a reversal NEVER deducts money HR never paid — (1) the original whose PENDING adjustment the sweeper had moved in place is reversed ⇒ that adjustment is withdrawn, no DEDUCTION · (2) ${S55R} rounds of the reversal racing HR rejecting the original's adjustment on another connection ⇒ every round ends with ONE settled reversal row (note), ZERO DEDUCTION, and the original adjustment either withdrawn or REJECTED`,
      s55a && ok, "withdrawn · 0 DEDUCTION × rounds", `rehomed: ${s55aWhy} · race: ${per.join(" ")}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ORACLE-EDIT C3.3 round-6 (26 ก.ย.) — B-1 (per-rule "done" + nomatch flags) · B-2 (WON→WON) · S-1 (late reverse never hits the current
  //   incarnation) · S-2 (first-counted time survives a wake) · rejected incarnation · updateRule field classes. Tenant N is dedicated
  //   (scoped runPayrollSync). NOTE: `OpsAlertState` has no tenantId — the finally block deletes our nomatch flags explicitly.
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── round 6 · B-1 B-2 S-1 S-2 ──");
  const NOMATCH = "crm.commission.nomatch:";
  const flagsOfRule = async (ruleId: string) => (await P.opsAlertState.findMany({ where: { source: { startsWith: NOMATCH, endsWith: `:${ruleId}` } } })) as Any[];
  const tidN = await mkTenant("n");
  await member(tidN, uO, "OWNER");
  await member(tidN, uC[1], "STAFF", SALES);
  await member(tidN, uC[2], "STAFF", SALES);
  const c14 = await mk(tidN, "CRM", "CRM เปลี่ยนเจ้าของ");
  await setCrm(c14, { uiVersion: 2, bridgesEnabled: true, commission: AUTO });
  const team14 = (await P.team.create({ data: { tenantId: tidN, name: `ทีมอื่น ${TAG}` } })).id as string; // neither A nor B is a member
  const r14 = await mkRule(tidN, c14, R10);
  const r14t = (await P.crmCommissionRule.create({ data: { tenantId: tidN, systemId: c14, name: `กฎทีม ${TAG}`, basis: "PAID", kind: "PCT", config: { pctBp: 500 }, teamId: team14, productIds: [], createdAt: RULE_EPOCH } })).id as string;
  const p14 = await mkPipe(tidN, c14);
  const d14 = await mkDeal(tidN, c14, p14, uC[1], 10_000);
  const pay14 = await rawPay(d14, 10_000);
  {
    const a1 = await call(F_.onPaid, ctx(tidN, c14, null), { dealId: d14.id, refType: "DEAL_PAYMENT", refId: pay14 });
    await P.crmDeal.update({ where: { id: d14.id }, data: { ownerUserId: uC[2] } }); // A → B after the credit
    const s1 = await call(SYNC, new Date(), { tenantIds: [tidN] });
    const s2 = await call(SYNC, new Date(), { tenantIds: [tidN] });
    const a2 = await call(F_.onPaid, ctx(tidN, c14, null), { dealId: d14.id, refType: "DEAL_PAYMENT", refId: pay14 });
    await settle(tidN);
    const rows = await comm({ dealId: d14.id });
    const exp = fullOf("PCT", R10.config, b(10_000));
    const flags = await flagsOfRule(r14t);
    const wantFlag = `${NOMATCH}${pay14}#c${NOWP.getTime()}:${r14t}`;
    console.log(`  [arith] M14 T 10,000 · 10 % ⇒ ${exp} for owner A · team rule 5 % (owner not in the team) ⇒ 0 rows + flag ${wantFlag.slice(0, 40)}…`);
    chk("C3.3-M14", `round-6 B-1: a payment credited to owner A (${exp}) — the owner then becomes B, runPayrollSync ×2 (scoped) + onPaid again ⇒ still exactly ONE row (A, ${exp}), none for B, Σ ${exp}; the second rule (team the owner is not in) has 0 rows and exactly ONE OpsAlertState flag \`crm.commission.nomatch:<payId>#c<ms>:<ruleId>\``,
      a1.ok && s1.ok && s2.ok && a2.ok && rows.length === 1 && rows[0].userId === uC[1] && b(rows[0].amountSatang) === exp && rows[0].ruleId === r14 && sumB(rows) === exp
      && rows.filter((r) => r.ruleId === r14t).length === 0 && flags.length === 1 && flags[0].source === wantFlag,
      `1 row A ${exp} · 1 flag`, `rows=${desc(rows)} flags=${flags.length}/${flags[0]?.source === wantFlag} sync=${rs(s1)}/${rs(s2)}${ABSENT}`);
  }
  {
    // S0.6 — updateRule field classes on a rule WITH rows (r14) · and flags cleared by a matching edit on a rule WITHOUT rows (r14t)
    const cR6 = ctx(tidN, c14, uO);
    const snap = async () => { const r = (await P.crmCommissionRule.findUnique({ where: { id: r14 } })) as Any; return j({ basis: r?.basis, kind: r?.kind, config: r?.config, min: r?.minDealSatang, pipelineId: r?.pipelineId, teamId: r?.teamId, productIds: r?.productIds }); };
    const s0 = await snap();
    const okName = await call(F_.updateRule, cR6, aO, r14, { name: `กฎ 10% เปลี่ยนชื่อ ${TAG}` });
    const okOff = await call(F_.updateRule, cR6, aO, r14, { active: false });
    const okOn = await call(F_.updateRule, cR6, aO, r14, { active: true });
    const okSort = await call(F_.updateRule, cR6, aO, r14, { sortOrder: 7 });
    const p14b = await mkPipe(tidN, c14);
    const refused: [string, Res][] = [
      ["config", await call(F_.updateRule, cR6, aO, r14, { config: { pctBp: 2_000 } })],
      ["pipeline", await call(F_.updateRule, cR6, aO, r14, { pipelineId: p14b.id })],
      ["team", await call(F_.updateRule, cR6, aO, r14, { teamId: team14 })],
      ["products", await call(F_.updateRule, cR6, aO, r14, { productIds: [`${TAG}-prod`] })],
    ];
    const s1 = await snap();
    const after = (await P.crmCommissionRule.findUnique({ where: { id: r14 } })) as Any;
    const fBefore = (await flagsOfRule(r14t)).length;
    const clr = await call(F_.updateRule, cR6, aO, r14t, { teamId: null });
    const fAfter = (await flagsOfRule(r14t)).length;
    chk("C3.3-S0.6", "updateRule field classes: on a rule WITH rows, name / active (off → on) / sortOrder edits are allowed · money (config) AND matching (pipeline · team · products) edits are refused with VALIDATION and leave every money/matching field byte-identical · a matching edit (team → none) on a rule WITHOUT rows succeeds and clears that rule's nomatch flags (1 → 0)",
      okName.ok && okOff.ok && okOn.ok && okSort.ok && after?.active === true && after?.sortOrder === 7 && refused.every(([, r]) => isVal(r)) && s1 === s0 && fBefore === 1 && clr.ok && fAfter === 0,
      "4 allowed · 4 VALIDATION · unchanged · flags 1→0", `allowed=${[okName, okOff, okOn, okSort].map((r) => (r.ok ? "ok" : r.err)).join("|")} refused=${refused.map(([k, r]) => `${k}:${isVal(r) ? "VALIDATION" : rs(r)}`).join(" ")} unchanged=${s1 === s0} flags=${fBefore}→${fAfter} clear=${rs(clr)}${ABSENT}`, "MAJOR");
  }
  {
    // S2.5 — B-2: a move WON → WON (second won stage) changes nothing
    const c25 = await mk(tidA, "CRM", "CRM ชนะสองขั้น");
    await setCrm(c25, { uiVersion: 2, bridgesEnabled: true, commission: AUTO });
    await mkRule(tidA, c25, { basis: "WON", kind: "PCT", config: { pctBp: 1_000 } });
    const stages: [string, string, number][] = [["ใหม่", "OPEN", 20], ["ชนะ", "WON", 100], ["ชนะ-ส่งมอบ", "WON", 100], ["แพ้", "LOST", 0]];
    const pp = (await P.crmPipeline.create({ data: { tenantId: tidA, systemId: c25, name: `ขาย ${TAG}-${nx()}`, stages: { create: stages.map(([name, kind, probability], i) => ({ tenantId: tidA, systemId: c25, sortOrder: i, name, kind, probability })) } }, include: { stages: true } })) as Any;
    const sid = (name: string) => (pp.stages as Any[]).find((x) => x.name === name).id as string;
    const pipe25 = { id: pp.id as string, OPEN: sid("ใหม่"), WON: sid("ชนะ"), LOST: sid("แพ้") };
    const d25 = await mkDeal(tidA, c25, pipe25, uC[1], 100_000);
    const m1 = await call(DL.moveDeal, ctx(tidA, c25, uO), aO, d25.id, { stageId: sid("ชนะ") });
    await settle(tidA);
    const rows0 = await comm({ dealId: d25.id });
    const ev0 = (await P.outboxEvent.count({ where: { tenantId: tidA, systemId: c25, type: { startsWith: "crm.commission." } } })) as number;
    const m2 = await call(DL.moveDeal, ctx(tidA, c25, uM), aM, d25.id, { stageId: sid("ชนะ-ส่งมอบ") });
    await settle(tidA);
    const w = await call(F_.onWon, ctx(tidA, c25, null), { dealId: d25.id });
    await settle(tidA);
    const rows1 = await comm({ dealId: d25.id });
    const ev1 = (await P.outboxEvent.count({ where: { tenantId: tidA, systemId: c25, type: { startsWith: "crm.commission." } } })) as number;
    const rm = rows0[0] ? ((await P.auditLog.count({ where: { tenantId: tidA, action: "crm.commission.remove", targetId: rows0[0].id } })) as number) : -1;
    chk("C3.3-S2.5", `round-6 B-2: WON rule 10 % · deal 100,000 moved to the first WON stage ⇒ one row ${fullOf("PCT", { pctBp: 1_000 }, b(100_000))} · the MANAGER moves it WON → second WON stage and onWon runs again ⇒ the commission rows are byte-identical (id · createdAt · amount · status), no new crm.commission.* event, no crm.commission.remove audit`,
      m1.ok && m2.ok && w.ok && rows0.length === 1 && b(rows0[0].amountSatang) === b(10_000) && j(rows1) === j(rows0) && ev1 === ev0 && rm === 0,
      "identical · events unchanged", `move1=${rs(m1)} move2=${rs(m2)} onWon=${rs(w)} rows=${desc(rows1)} identical=${j(rows1) === j(rows0)} events=${ev0}→${ev1} removeAudit=${rm}${ABSENT}`);
  }
  {
    // M15 — S-2: a wake keeps the FIRST counted time (no retro credit for a rule created in between) · approvalRequired ON + chain
    const APC = fnOf(CM, "afterPaymentCounted");
    const c15 = await mk(tidA, "CRM", "CRM ปลุกงวดหลังสร้างกฎ");
    await setCrm(c15, { uiVersion: 2, bridgesEnabled: true, commission: REQ });
    await APV.createPolicy({ tenantId: tidA }, { name: `คอมมิชชัน M15 ${TAG}`, entityType: "crm.commission", systemId: c15, steps: [{ order: 1, approverRole: "OWNER" }] });
    const R1 = await mkRule(tidA, c15, R10);
    const t0 = NOWP;
    const d15 = await mkDeal(tidA, c15, await mkPipe(tidA, c15), uC[1], 1_000);
    const ref15 = `${TAG}-m15p`;
    const row15 = await P.crmDealPayment.create({ data: { tenantId: tidA, systemId: c15, dealId: d15.id, refType: "PAYMENT", refId: ref15, satang: BigInt(1_000), status: "COUNTED", countedAt: t0, createdAt: t0 } });
    const c0 = { tenantId: tidA, systemId: c15 };
    const x1 = await call(APC, c0, { dealId: d15.id, refType: "PAYMENT", refId: ref15 });
    await settle(tidA);
    const first = (await comm({ dealId: d15.id }))[0] as Any;
    const req0 = first?.approvalRequestId ? ((await P.approvalRequest.findUnique({ where: { id: first.approvalRequestId } })) as Any) : null;
    const LATE = await mkRule(tidA, c15, { ...R10, createdAt: new Date(t0.getTime() + DAY) });
    const t2 = new Date(t0.getTime() + 2 * DAY);
    await P.crmDealPayment.update({ where: { id: row15.id }, data: { satang: BigInt(500), countedAt: t2 } }); // the wake: one statement
    const x2 = await call(APC, c0, { dealId: d15.id, refType: "PAYMENT", refId: ref15 });
    await settle(tidA);
    const rows = await comm({ dealId: d15.id });
    const reqAfter = req0 ? ((await P.approvalRequest.findUnique({ where: { id: req0.id } })) as Any) : null;
    const T15 = b(1_000);
    const e0 = F(fullOf("PCT", R10.config, T15), T15, b(1_000));
    const e1 = F(fullOf("PCT", R10.config, T15), T15, b(500));
    // DOC_SETTLE counted (and born) before the only rule existed, woken after it ⇒ nothing
    const c15b = await mk(tidA, "CRM", "CRM ปิดยอดก่อนมีกฎ");
    await setCrm(c15b, { uiVersion: 2, bridgesEnabled: true, commission: REQ });
    await mkRule(tidA, c15b, { ...R10, createdAt: new Date(t0.getTime() + DAY) });
    const d15b = await mkDeal(tidA, c15b, await mkPipe(tidA, c15b), uC[1], 10_000);
    const doc15 = `${TAG}-m15doc`;
    const sr = await P.crmDealPayment.create({ data: { tenantId: tidA, systemId: c15b, dealId: d15b.id, refType: "DOC_SETTLE", refId: doc15, satang: BigInt(300), status: "COUNTED", countedAt: t0, createdAt: t0 } });
    const y1 = await call(APC, { tenantId: tidA, systemId: c15b }, { dealId: d15b.id, refType: "DOC_SETTLE", refId: doc15 });
    await P.crmDealPayment.update({ where: { id: sr.id }, data: { satang: BigInt(100), countedAt: t2 } });
    const y2 = await call(APC, { tenantId: tidA, systemId: c15b }, { dealId: d15b.id, refType: "DOC_SETTLE", refId: doc15 });
    await settle(tidA);
    const rowsB = await comm({ dealId: d15b.id });
    console.log(`  [arith] M15 T 1,000 · 10 % · counted 1,000 at t0 ⇒ PENDING ${e0} · rule LATE created t0+1d · woken as 500 at t0+2d ⇒ old PENDING deleted, R1 = F(500) = ${e1}, LATE 0 (first counted t0 < LATE) · DOC_SETTLE born/counted t0, only rule created t0+1d, woken t0+2d ⇒ 0 rows`);
    const live = rows.filter((r) => !r.reversedOfId);
    chk("C3.3-M15", `round-6 S-2 (approvalRequired ON + chain): a payment counted at t0 gives a PENDING ${e0} for R1 with a request · a rule LATE is created at t0+1d · the payment is woken as 500 at t0+2d ⇒ the old PENDING row is deleted and its request CANCELLED, ONE new R1 row ${e1} PENDING with key <id>#c<t0+2d>, LATE earns NOTHING (first counted at t0 — no retro credit) · a DOC_SETTLE born and counted before its only rule existed, woken after it ⇒ 0 rows`,
      x1.ok && x2.ok && !!first && b(first.amountSatang) === e0 && first.status === "PENDING" && req0?.status === "PENDING" && !(await comm({ id: first.id }))[0] && reqAfter?.status === "CANCELLED"
      && live.length === 1 && live[0].ruleId === R1 && b(live[0].amountSatang) === e1 && live[0].status === "PENDING" && live[0].refId === `${row15.id}#c${t2.getTime()}` && rows.filter((r) => r.ruleId === LATE).length === 0
      && y1.ok && y2.ok && rowsB.length === 0,
      `R1 ${e0} → ${e1} · LATE 0 · settle 0`, `first=${first ? `${first.amountSatang}/${first.status}/${req0?.status}` : "-"} rows=${desc(rows)} oldReq=${reqAfter?.status ?? "-"} late=${rows.filter((r) => r.ruleId === LATE).length} settleRows=${rowsB.length}${ABSENT}`);
  }
  {
    // S4.9 — a human-REJECTED row: its next incarnation is born PENDING with the "เคยถูกปฏิเสธ" note and is NOT auto-approved (approvalRequired off)
    const APC = fnOf(CM, "afterPaymentCounted");
    const c49 = await mk(tidA, "CRM", "CRM เคยถูกปฏิเสธ");
    await setCrm(c49, { uiVersion: 2, bridgesEnabled: true, commission: REQ });
    await APV.createPolicy({ tenantId: tidA }, { name: `คอมมิชชัน S4.9 ${TAG}`, entityType: "crm.commission", systemId: c49, steps: [{ order: 1, approverRole: "OWNER" }] });
    await mkRule(tidA, c49, R10);
    const d49 = await mkDeal(tidA, c49, await mkPipe(tidA, c49), uC[1], 100_000);
    const ref49 = `${TAG}-s49p`;
    const pr = await P.crmDealPayment.create({ data: { tenantId: tidA, systemId: c49, dealId: d49.id, refType: "PAYMENT", refId: ref49, satang: BigInt(100_000), status: "COUNTED", countedAt: NOWP } });
    const c0 = { tenantId: tidA, systemId: c49 };
    await call(APC, c0, { dealId: d49.id, refType: "PAYMENT", refId: ref49 });
    await settle(tidA);
    const old = (await comm({ dealId: d49.id }))[0] as Any;
    const rj = await call(F_.reject, ctx(tidA, c49, uO), aO, { id: old?.id ?? "-", reason: "ยอดไม่ตรงกับใบเสร็จ" });
    await setCrm(c49, { commission: AUTO }); // the shop now turns approvals OFF
    const t1 = new Date(NOWP.getTime() + 3_600_000);
    await P.crmDealPayment.update({ where: { id: pr.id }, data: { countedAt: t1 } }); // woken (same amount, new incarnation)
    const w = await call(APC, c0, { dealId: d49.id, refType: "PAYMENT", refId: ref49 });
    await settle(tidA);
    const nw = (await comm({ dealId: d49.id })).filter((r) => r.id !== old?.id && !r.reversedOfId);
    const a1 = await call(ADV, { tenantId: tidA, commissionId: nw[0]?.id ?? null });
    await Promise.all([call(ADV, { tenantId: tidA, commissionId: nw[0]?.id ?? null }), call(ADV, { tenantId: tidA, commissionId: nw[0]?.id ?? null })]);
    await settle(tidA);
    const cur = nw[0] ? ((await comm({ id: nw[0].id }))[0] as Any) : null;
    const oldNow = old ? ((await comm({ id: old.id }))[0] as Any) : null;
    const exp49 = fullOf("PCT", R10.config, b(100_000));
    chk("C3.3-S4.9", `round-6: a commission REJECTED by a person (${exp49}) — its payment is woken as a new incarnation after the shop turned approvals OFF ⇒ ONE new row ${exp49} PENDING whose note starts "เคยถูกปฏิเสธ", no approval request, and it stays PENDING after advanceById ×3 (1 + 2 in parallel) — never auto-approved · the REJECTED row is untouched`,
      rj.ok && oldNow?.status === "REJECTED" && w.ok && a1.ok && nw.length === 1 && b(nw[0].amountSatang) === exp49 && cur?.status === "PENDING" && String(cur?.note ?? "").startsWith("เคยถูกปฏิเสธ") && !cur?.approvalRequestId && cur?.refId === `${pr.id}#c${t1.getTime()}`,
      "PENDING · note · not auto-approved", `reject=${rs(rj)} old=${oldNow?.status} new=${desc(nw)} now=${cur?.status}/${cut(cur?.note, 30)}/req=${!!cur?.approvalRequestId}${ABSENT}`);
  }
  {
    // M16 — S-1: a late reverse({refId}) racing afterPaymentsReversed never reverses the CURRENT incarnation (worker processes)
    const APC = fnOf(CM, "afterPaymentCounted");
    const c16 = await mk(tidA, "CRM", "CRM ถอนมาช้า");
    await setCrm(c16, { uiVersion: 2, bridgesEnabled: true, commission: AUTO });
    await mkRule(tidA, c16, R10);
    const d16 = await mkDeal(tidA, c16, await mkPipe(tidA, c16), uC[1], 10_000);
    const doc16 = `${TAG}-m16doc`;
    const t0 = new Date(NOWP.getTime() + 60_000);
    const sr = await P.crmDealPayment.create({ data: { tenantId: tidA, systemId: c16, dealId: d16.id, refType: "DOC_SETTLE", refId: doc16, satang: BigInt(300), status: "COUNTED", countedAt: t0, createdAt: t0 } });
    const c0 = { tenantId: tidA, systemId: c16 };
    await call(APC, c0, { dealId: d16.id, refType: "DOC_SETTLE", refId: doc16 });
    const t1 = new Date(NOWP.getTime() + 2 * 3_600_000);
    await P.crmDealPayment.update({ where: { id: sr.id }, data: { satang: BigInt(100), countedAt: t1 } });
    await call(APC, c0, { dealId: d16.id, refType: "DOC_SETTLE", refId: doc16 });
    await settle(tidA);
    const before = j(await comm({ dealId: d16.id }));
    const T16 = b(10_000);
    const f16 = fullOf("PCT", R10.config, T16);
    const e300 = F(f16, T16, b(300));
    const e100 = F(f16, T16, b(100));
    console.log(`  [arith] M16 T 10,000 · 10 % · settle 300 ⇒ ${e300} · woken as 100 ⇒ −${e300} + ${e100} ⇒ Σ ${e300 - e300 + e100} · then 3 rounds × (reverse({refId}) ×3 ∥ afterPaymentsReversed ×3) in 2 processes`);
    const start = Date.now() + 45_000;
    const mkArg = (fn: string) => ({ rounds: [0, 1, 2].map((r) => ({ atMs: r * 3_000, calls: [{ ph: "S", fn, sys: c16, a: { refId: sr.id, dealId: d16.id }, n: 3 }] })) });
    const outs = (await Promise.all([spawnT(tidA, mkArg("reverse"), start), spawnT(tidA, mkArg("apr"), start)])).flat();
    await settle(tidA);
    const rows = await comm({ dealId: d16.id });
    const curKey = `${sr.id}#c${t1.getTime()}`;
    const curRow = rows.find((r) => r.refId === curKey);
    const curRev = curRow ? rows.filter((r) => r.reversedOfId === curRow.id) : [];
    chk("C3.3-M16", `round-6 S-1: settle 300 (${e300}) woken as 100 ⇒ −${e300} + ${e100} · then a late reverse({refId: <payId>}) and afterPaymentsReversed fired together (2 processes × 3 × 3 rounds) ⇒ every row byte-identical to before, the current incarnation <payId>#c<t1> has NO reversal, Σ = ${e100}`,
      outs.length === 18 && outs.every((o) => o === "S:OK") && j(rows) === before && !!curRow && b(curRow.amountSatang) === e100 && curRev.length === 0 && sumB(rows) === e300 - e300 + e100,
      `identical · Σ ${e100}`, `workers=${outs.length}/${cut(outs.filter((o) => o !== "S:OK").slice(0, 2).join(" | "), 160)} identical=${j(rows) === before} rows=${desc(rows)} Σ=${sumB(rows)} curRev=${curRev.length}${ABSENT}`);
  }


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
    // ORACLE-EDIT C3.3 money-review (26 ก.ย.) — ruling B3: only an HR-APPROVED/PAID original is taken back by a DEDUCTION ⇒ HR approves the
    //   original's adjustment first so "exactly ONE DEDUCTION under a 12-way race" stays the thing proven (tenant X has no payroll run)
    for (const a of await adjOf(c.orig)) await PAY.decideAdjustment({ tenantId: tidX, systemId: hrX }, a.id, "APPROVED", { userId: uO, isOwner: true });
    await P.crmDealPayment.update({ where: { id: c.ref }, data: { status: "REVERSED", reversedAt: new Date() } }); // the money was voided (raw — the race below is commissions.reverse itself)
  }
  // ORACLE-EDIT C3.3-H5 (27 ก.ย.) — ruling H5: an HR-APPROVED adjustment that was never in a payroll run is WITHDRAWN (no DEDUCTION for money
  //   never paid) ⇒ put the originals' adjustments INTO a payroll run first so "exactly ONE DEDUCTION under a 12-way race" stays the thing proven
  {
    const xcPeriods = new Set<string>();
    for (const c of xc) for (const a of await adjOf(c.orig)) xcPeriods.add(String(a.periodKey));
    for (const pk of xcPeriods) await PAY.createPayrollRun({ tenantId: tidX, systemId: hrX }, { periodKey: pk, payDate: T("2026-09-30T03:00:00Z") });
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
      const ra = rows.find((x) => pays.find((p) => p.id === payOf(x.refId) && Number(p.satang) === PA)); // ORACLE-EDIT C3.3 round-5 (26 ก.ย.)
      const rb = rows.find((x) => pays.find((p) => p.id === payOf(x.refId) && Number(p.satang) === PB));
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
      const ra = rows.filter((x) => payOf(x.refId) === xb[r].ra); // ORACLE-EDIT C3.3 round-5 (26 ก.ย.)
      const rb = rows.filter((x) => payOf(x.refId) === xb[r].rb);
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
    chk("C3.3-X3.3", `CRITICAL — 12 parallel reversals of the same payment (APPROVED commission whose adjustment HR already APPROVED — ruling B3 · ORACLE-EDIT money-review) ⇒ exactly ONE negative row (−${fullOf("PCT", R_X.config, b(1_000_000))}) and ONE DEDUCTION adjustment per round · ${ROUNDS} rounds`,
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
  // ORACLE-EDIT C3.3-H (money hunt 27 ก.ย.) — fix wave "C3.3-fix" · controller rulings H1–H6 (binding) · evidence of the bugs:
  //   scripts/pending/probe-hunt33.mts + .qc-shots/hunt33/probe-hunt33.log. Tenants H (money path, no HR) and HP (HR + payroll) are
  //   dedicated; every amount below is the oracle's own BigInt arithmetic. The hooks under test are the real entry points the money path
  //   calls after commit (afterPaymentCounted / afterPaymentsReversed) + the scoped minute job (runPayrollSync {tenantIds}).
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── C3.3-H · money hunt 27 ก.ย. ──");
  {
    const APC = fnOf(CM, "afterPaymentCounted");
    const APR = fnOf(CM, "afterPaymentsReversed");
    const H_NOHR = { basis: "PAID", approvalRequired: false, payrollLink: false };
    const tidH = await mkTenant("h");
    await member(tidH, uO, "OWNER");
    await member(tidH, uTH, "STAFF", SALES);
    const cH = await mk(tidH, "CRM", "CRM hunt");
    await setCrm(cH, { uiVersion: 2, bridgesEnabled: true, commission: H_NOHR });
    const rH = await mkRule(tidH, cH, R10);
    const pH = await mkPipe(tidH, cH);
    const cxH = { tenantId: tidH, systemId: cH };
    const payRow = async (d: Deal, refType: string, refId: string, satang: number, countedAt: Date) =>
      (await P.crmDealPayment.create({ data: { tenantId: d.tid, systemId: d.sys, dealId: d.id, refType, refId, satang: BigInt(satang), status: "COUNTED", countedAt } })).id as string;
    const voidRow = (id: string) => P.crmDealPayment.update({ where: { id }, data: { status: "REVERSED", reversedAt: new Date() } });
    const flagsH = async (dealId: string) => {
      const pays = ((await P.crmDealPayment.findMany({ where: { dealId }, select: { id: true } })) as Any[]).map((x) => String(x.id));
      return ((await P.opsAlertState.findMany({ where: { source: { startsWith: NOMATCH, endsWith: `:${rH}` } }, select: { source: true } })) as Any[])
        .filter((f) => pays.includes(String(f.source).slice(NOMATCH.length).split("#")[0])).length;
    };

    // ── H1 · value-0 deal: POS deposit → owner types the deal value → next POS sale ⇒ T = max(frozen, value) ──
    {
      const d = await mkDeal(tidH, cH, pH, uTH, 0, [], true);
      const s1 = await mkSale(tidH, cH, 1_070_000, 70_000);
      await payRow(d, "POS_SALE", s1, 1_070_000, NOWP);
      await call(APC, cxH, { dealId: d.id, refType: "POS_SALE", refId: s1 });
      const first = await comm({ dealId: d.id });
      await P.crmDeal.update({ where: { id: d.id }, data: { valueSatang: 5_000_000 } }); // deals.updateDeal on an OPEN deal (value only)
      const s2 = await mkSale(tidH, cH, 4_280_000, 280_000);
      await payRow(d, "POS_SALE", s2, 4_280_000, new Date(NOWP.getTime() + 60_000));
      await call(APC, cxH, { dealId: d.id, refType: "POS_SALE", refId: s2 });
      await call(SYNC, new Date(), { tenantIds: [tidH] });
      const rows = await comm({ dealId: d.id });
      const flags = await flagsH(d.id);
      const T1 = b(1_070_000 - 70_000);
      const e1 = fullOf("PCT", R10.config, T1); // first row: T = pre-VAT so far (value 0)
      const T2 = b(5_000_000) > T1 ? b(5_000_000) : T1; // ruling H1: never below the value the owner typed
      const eSum = F(fullOf("PCT", R10.config, T2), T2, T1 + b(4_280_000 - 280_000));
      console.log(`  [arith] H1 sale 1 net ${T1} ⇒ ${e1} (T ${T1}) · value typed 5,000,000 · sale 2 net 4,000,000 ⇒ T = max(${T1}, 5,000,000) = ${T2} ⇒ Σ = F(${T1 + b(4_000_000)}) = ${eSum}`);
      chk("C3.3-H1", `ruling H1 — value-0 deal: POS deposit 10,700 (net 10,000) ⇒ ${e1}; the owner then types the deal value 50,000 (deal still OPEN) and a second POS sale 42,800 (net 40,000) is counted ⇒ Σ = ${eSum} (T = max(frozen first basis, current value) because the first row was born with value 0), no nomatch flag on this deal`,
        first.length === 1 && b(first[0].amountSatang) === e1 && sumB(rows) === eSum && flags === 0 && rows.every((r) => b(r.amountSatang) > Z),
        `first ${e1} · Σ ${eSum} · flags 0`, `first=${desc(first)} rows=${desc(rows)} Σ=${sumB(rows)} flags=${flags}${ABSENT}`);
    }

    // ── H2 · clipped share restored on reversal (top-up keyed <incarnation>#t<n> on the latest COUNTED payment) ──
    {
      const d = await mkDeal(tidH, cH, pH, uTH, 1_000_000);
      const refA = `${TAG}-h2a`, refB = `${TAG}-h2b`;
      const idA = await payRow(d, "PAYMENT", refA, 600_000, new Date(NOWP.getTime() - 120_000));
      await call(APC, cxH, { dealId: d.id, refType: "PAYMENT", refId: refA });
      const idB = await payRow(d, "PAYMENT", refB, 600_000, new Date(NOWP.getTime() - 60_000));
      await call(APC, cxH, { dealId: d.id, refType: "PAYMENT", refId: refB });
      const before = await comm({ dealId: d.id });
      await voidRow(idA);
      await call(APR, cxH, { dealId: d.id });
      await call(SYNC, new Date(), { tenantIds: [tidH] });
      await call(APR, cxH, { dealId: d.id }); // replay — no second top-up
      await call(SYNC, new Date(), { tenantIds: [tidH] });
      const after = await comm({ dealId: d.id });
      const full = fullOf("PCT", R10.config, b(1_000_000));
      const [sA, sB] = seqShares(full, b(1_000_000), [b(600_000), b(600_000)]);
      const eNet = F(full, b(1_000_000), b(600_000));
      const topUps = after.filter((r) => payOf(r.refId) === idB && /#c\d+#t\d+$/.test(String(r.refId)) && !r.reversedOfId);
      const eTop = eNet - sB;
      await voidRow(idB);
      await call(APR, cxH, { dealId: d.id });
      await call(SYNC, new Date(), { tenantIds: [tidH] });
      const end = await comm({ dealId: d.id });
      console.log(`  [arith] H2 T 1,000,000 · full ${full} · A 600,000 ⇒ ${sA} · B 600,000 ⇒ clipped ${sB} · void A ⇒ counted 600,000 ⇒ net F = ${eNet} ⇒ top-up ${eTop} on B · void B ⇒ net 0`);
      chk("C3.3-H2", `ruling H2 — value 1,000,000 · 10 %: A 600,000 (${sA}) + B 600,000 (clipped ${sB}) · A cancelled ⇒ revisit restores the clipped share: net Σ = ${eNet} with exactly ONE top-up row ${eTop} keyed <B incarnation>#t<n> (replayed hook + minute job add nothing) · B cancelled afterwards ⇒ its top-up is reversed too ⇒ net 0`,
        sumB(before) === full && sumB(after) === eNet && topUps.length === 1 && b(topUps[0].amountSatang) === eTop && sumB(end) === Z,
        `before ${full} · after ${eNet} (1 top-up ${eTop}) · end 0`, `before=${sumB(before)} after=${sumB(after)} topUps=${topUps.length}:${desc(topUps)} end=${sumB(end)} rows=${cut(desc(after), 200)}${ABSENT}`);
    }

    // ── H3 · invoice with a deposit deducted: ratio denominator = grand BEFORE the deposit deduction ──
    {
      const net = 10_000_000, vat = 700_000, dep = 3_210_000, grand = net + vat - dep; // grand 7,490,000 as stored after the deduction
      const doc = await P.accountDocument.create({ data: { tenantId: tidH, systemId: `${TAG}-acc`, docType: "INVOICE", status: "PARTIAL", subTotal: net, discountAmount: 0, vatAmount: vat, depositDeducted: dep, grandTotal: grand } });
      const cash = grand / 2; // 3,745,000
      const adp = await P.accountDocumentPayment.create({ data: { tenantId: tidH, systemId: `${TAG}-acc`, documentId: doc.id, amount: cash } });
      const d = await mkDeal(tidH, cH, pH, uTH, net);
      await P.crmDeal.update({ where: { id: d.id }, data: { invoiceDocId: doc.id } });
      await payRow(d, "PAYMENT", adp.id, cash, NOWP);
      await call(APC, cxH, { dealId: d.id, refType: "PAYMENT", refId: adp.id });
      const rows = await comm({ dealId: d.id });
      const pre = (b(cash) * b(net)) / b(grand + dep); // 3,500,000
      const exp = F(fullOf("PCT", R10.config, b(net)), b(net), pre);
      const bug = F(fullOf("PCT", R10.config, b(net)), b(net), (b(cash) * b(net)) / b(grand));
      console.log(`  [arith] H3 net ${net} + VAT ${vat} − deposit ${dep} ⇒ grand ${grand} · half paid ${cash} ⇒ before VAT ${cash}×${net}/${grand + dep} = ${pre} ⇒ ${exp} (the post-deposit denominator would give ${bug})`);
      chk("C3.3-H3", `ruling H3 — invoice net 100,000 + VAT 7,000 with a 32,100 deposit deducted (grand 74,900): half paid (37,450) ⇒ before VAT = cash × net / (grandTotal + depositDeducted) = ${pre} ⇒ commission ${exp} (not ${bug})`,
        rows.length === 1 && b(rows[0].amountSatang) === exp, `${exp}`, `rows=${desc(rows)} Σ=${sumB(rows)}${ABSENT}`);
    }

    // ── HP tenant: HR system · rep uPK has a salary profile · rep uNK is linked + active but has NO payroll profile ──
    const tidHP = await mkTenant("hp");
    await member(tidHP, uO, "OWNER");
    await member(tidHP, uPK, "STAFF", SALES);
    await member(tidHP, uNK, "STAFF", SALES);
    const hrH = await mk(tidHP, "HR", "พนักงาน hunt");
    const cHRH = { tenantId: tidHP, systemId: hrH };
    const eWith = (await P.hrEmployee.create({ data: { tenantId: tidHP, systemId: hrH, name: `พนักงาน ${TAG}-${nx()}`, linkedUserId: uPK, active: true } })).id as string;
    await PAY.setSalaryProfile(cHRH, { employeeId: eWith, baseSalarySatang: 3_000_000 });
    const eNo = (await P.hrEmployee.create({ data: { tenantId: tidHP, systemId: hrH, name: `พนักงาน ${TAG}-${nx()}`, linkedUserId: uNK, active: true } })).id as string;
    const cHP = await mk(tidHP, "CRM", "CRM hunt payroll");
    await setCrm(cHP, { uiVersion: 2, bridgesEnabled: true, commission: AUTO });
    await mkRule(tidHP, cHP, R10);
    const pHP = await mkPipe(tidHP, cHP);
    const cxHP = { tenantId: tidHP, systemId: cHP };
    const ownerAct = { userId: uO, isOwner: true };

    // ── H5 · HR runs the month first, THEN approves the pending commission adjustment · payment voided later ──
    {
      const d = await mkDeal(tidHP, cHP, pHP, uPK, 1_000_000);
      const ref = `${TAG}-h5`;
      const pid = await payRow(d, "PAYMENT", ref, 1_000_000, NOWP);
      await call(APC, cxHP, { dealId: d.id, refType: "PAYMENT", refId: ref });
      await settle(tidHP);
      const orig = (await comm({ dealId: d.id, reversedOfId: null }))[0] as Any;
      const a0 = (await adjOf(orig?.id))[0] as Any;
      const P0 = String(a0?.periodKey ?? PK);
      const run = await call(PAY.createPayrollRun, cHRH, { periodKey: P0, payDate: T("2026-09-30T03:00:00Z") });
      const dec = a0 ? await call(PAY.decideAdjustment, cHRH, a0.id, "APPROVED", ownerAct) : MISSING;
      await call(SYNC, new Date(), { tenantIds: [tidHP] });
      const runs = await runsOf(hrH);
      const a1 = (await adjOf(orig?.id))[0] as Any;
      const unstranded = !!a1 && !a1.runId && !runs.has(String(a1.periodKey));
      await voidRow(pid);
      await call(APR, cxHP, { dealId: d.id });
      await settle(tidHP);
      await call(SYNC, new Date(), { tenantIds: [tidHP] });
      const rows = await comm({ dealId: d.id });
      const rev = rows.find((r) => r.reversedOfId === orig?.id) as Any;
      const ded = ((await P.hrPayAdjustment.findMany({ where: { tenantId: tidHP, crmCommissionId: { in: rows.map((r) => r.id) }, kind: "DEDUCTION" } })) as Any[]);
      const origAdj = await adjOf(orig?.id);
      const exp = fullOf("PCT", R10.config, b(1_000_000));
      console.log(`  [arith] H5 commission ${exp} · adj period ${P0} gets a run BEFORE HR approves it · then the payment is voided ⇒ never paid ⇒ nothing to deduct`);
      chk("C3.3-H5", `ruling H5 — commission ${exp} · HR creates the run of its period (${P0}) while the adjustment is PENDING, then approves it (decide) ⇒ after the minute job the adjustment is NOT stranded (runId null and its period has no run — refused or moved) · the payment is then voided ⇒ NO DEDUCTION, the original adjustment is withdrawn, the commission has its REVERSED row and nets 0`,
        run.ok && !!a0 && unstranded && !!rev && ded.length === 0 && origAdj.length === 0 && sumB(rows) === Z,
        "unstranded · 0 DEDUCTION · withdrawn · net 0", `run=${run.ok} decide=${rs(dec)} adjBefore=${a0 ? `${a0.periodKey}/${a0.status}` : "-"} adjAfterSync=${a1 ? `${a1.periodKey}/${a1.status}/run=${a1.runId ? "set" : "null"}` : "-"} runs=${[...runs].join(",")} rev=${!!rev} deductions=${ded.map((x) => `${x.periodKey}:${x.amountSatang}`).join(",") || "-"} origAdj=${origAdj.length} Σ=${sumB(rows)}${ABSENT}`);
    }

    // ── H4 · rep linked + active but WITHOUT a payroll profile ⇒ WAITING, never PAID, no DEDUCTION; HR binds no item-less adjustment ──
    {
      const d = await mkDeal(tidHP, cHP, pHP, uNK, 1_000_000);
      const ref = `${TAG}-h4`;
      const pid = await payRow(d, "PAYMENT", ref, 1_000_000, NOWP);
      await call(APC, cxHP, { dealId: d.id, refType: "PAYMENT", refId: ref });
      await settle(tidHP);
      await call(SYNC, new Date(), { tenantIds: [tidHP] });
      const orig = (await comm({ dealId: d.id, reversedOfId: null }))[0] as Any;
      const a0 = await adjOf(orig?.id);
      const dto = orig ? await call(F_.mine, ctx(tidHP, cHP, uNK), actor(uNK, "STAFF", SALES), {}) : MISSING;
      const mineRow = itemsOf(dto.v).find((r: Any) => r?.id === orig?.id);
      const Q = String(a0[0]?.periodKey ?? freePeriod(PK, await runsOf(hrH), false));
      const plain = await call(PAY.requestAdjustment, cHRH, { employeeId: eNo, periodKey: Q, kind: "BONUS", amountSatang: 50_000, note: `โบนัส ${TAG}`, requestedById: uO });
      if (plain.ok && plain.v?.id) await call(PAY.decideAdjustment, cHRH, plain.v.id, "APPROVED", ownerAct);
      for (const a of a0) await call(PAY.decideAdjustment, cHRH, a.id, "APPROVED", ownerAct);
      const run = await call(PAY.createPayrollRun, cHRH, { periodKey: Q, payDate: T("2026-10-30T03:00:00Z") });
      if (run.ok) { await call(PAY.approveRun, cHRH, run.v.id); await call(PAY.markPaid, cHRH, run.v.id); }
      await settle(tidHP);
      const mid = (await comm({ id: orig?.id }))[0] as Any;
      const plainAfter = plain.ok && plain.v?.id ? ((await P.hrPayAdjustment.findUnique({ where: { id: plain.v.id } })) as Any) : null;
      const items = run.ok ? ((await P.hrPayrollItem.findMany({ where: { runId: run.v.id }, select: { employeeId: true } })) as Any[]) : [];
      await voidRow(pid);
      await call(APR, cxHP, { dealId: d.id });
      await settle(tidHP);
      await call(SYNC, new Date(), { tenantIds: [tidHP] });
      const rows = await comm({ dealId: d.id });
      const ded = ((await P.hrPayAdjustment.findMany({ where: { tenantId: tidHP, crmCommissionId: { in: rows.map((r) => r.id) }, kind: "DEDUCTION" } })) as Any[]);
      const exp = fullOf("PCT", R10.config, b(1_000_000));
      console.log(`  [arith] H4 commission ${exp} for a rep whose HR employee has no payroll profile ⇒ must wait (no adjustment) · run ${Q} makes no item for that employee`);
      chk("C3.3-H4", `ruling H4 — rep linked to an ACTIVE employee WITHOUT a payroll profile · commission ${exp} ⇒ APPROVED with NO HR adjustment (DTO payroll WAITING_EMPLOYEE) even after the minute job · HR then pays run ${Q} ⇒ the commission is never PAID and a plain approved adjustment of that employee is NOT bound to the run (no item was produced) · the payment is voided ⇒ no DEDUCTION`,
        !!orig && orig.status === "APPROVED" && a0.length === 0 && mineRow?.payroll === "WAITING_EMPLOYEE" && mid?.status !== "PAID" && !items.some((i) => i.employeeId === eNo)
          && !!plainAfter && !plainAfter.runId && ded.length === 0,
        "APPROVED · 0 adj · WAITING · never PAID · plain unbound · 0 DEDUCTION",
        `orig=${orig ? `${orig.status}/${orig.amountSatang}` : "-"} adj=${a0.length} dto=${mineRow?.payroll ?? rs(dto)} afterRun=${mid?.status ?? "-"} run=${run.ok} itemForEmp=${items.some((i) => i.employeeId === eNo)} plain=${plainAfter ? `run=${plainAfter.runId ? "bound" : "null"}` : rs(plain)} deductions=${ded.length}${ABSENT}`);
    }

    // ── H6 · syncPayroll resumes from a per-system cursor (like the q1a queue) — rows beyond the page budget are eventually handed off ──
    {
      const src = read(C_FILE);
      const body = /export async function syncPayroll\([\s\S]*?\n}\n/.exec(src)?.[0] ?? "";
      const consts = [...src.matchAll(/const\s+([A-Z0-9_]+)\s*=\s*["'`](crm\.commission\.[^"'`]*cursor[^"'`]*)["'`]/gi)]
        .filter((m) => !/q1a/i.test(m[2])).map((m) => ({ name: m[1], key: m[2] }));
      const usesConst = consts.some((c) => new RegExp(`\\b${c.name}\\b`).test(body));
      const literal = /["'`]crm\.commission\.(?!q1a)[\w.]*cursor/i.test(body);
      const resetsEveryCall = /let\s+cursor\s*=\s*["'`]{2}\s*;/.test(body) && !usesConst && !literal;
      chk("C3.3-H6", "ruling H6 — syncPayroll keeps a per-system cursor in OpsAlertState (a `crm.commission.…cursor:<systemId>` key other than the q1a one, read at start and advanced/cleared per page) so rows beyond its 20×200 page budget are eventually handed off [static: syncPayroll body references that key]",
        body.length > 0 && (usesConst || literal) && !resetsEveryCall, "cursor key used in syncPayroll", `body=${body.length > 0} consts=${consts.map((c) => c.key).join(",") || "-"} usesConst=${usesConst} literal=${literal} resetsEveryCall=${resetsEveryCall}${ABSENT}`, "MAJOR");
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X8 — payloads ids only
  // ═════════════════════════════════════════════════════════════════════════════
  {
    const evs = ((await P.outboxEvent.findMany({ where: { tenantId: { in: [tidA, tidX] }, type: { in: [...EVENTS, "crm.commission.removed"] } } })) as Any[]); // ORACLE-EDIT C3.3 round-5 (26 ก.ย.)
    const allowed: Record<string, string[]> = {
      "hr.payroll.paid": ["periodKey", "runId"],
      "crm.commission.created": ["amountSatang", "commissionId", "dealId", "periodKey", "reversedOfId", "ruleId", "status", "systemId", "userId"],
      "crm.commission.approved": ["amountSatang", "commissionId", "dealId", "periodKey", "reversedOfId", "ruleId", "status", "systemId", "userId", "hrPayAdjustmentId"],
      "crm.commission.reversed": ["amountSatang", "commissionId", "dealId", "periodKey", "reversedOfId", "ruleId", "status", "systemId", "userId", "hrPayAdjustmentId"],
      // ORACLE-EDIT C3.3 round-5 (26 ก.ย.) — N5: the new event is held to the same ids-only rule
      "crm.commission.removed": ["amountSatang", "commissionId", "dealId", "periodKey", "reversedOfId", "ruleId", "status", "systemId", "userId"],
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
    // ORACLE-EDIT C3.3 round-6 (26 ก.ย.) — nomatch flags live in OpsAlertState (no tenantId): delete those naming our rules or our payments
    // ORACLE-EDIT C3.3 round-7 CLEAN (27 ก.ย.) — also purge first-count markers + q1a cursors owned by our payments/systems (key = prefix:<id> ⇒ part 2; ผู้คุมงานแก้จาก part 3 ที่ผู้สร้างเสนอ)
    const flagSql = `FROM "OpsAlertState" WHERE ("source" LIKE 'crm.commission.nomatch:%' AND (split_part("source", ':', 3) IN (SELECT "id" FROM "CrmCommissionRule" WHERE "tenantId" IN (${inList}))
      OR split_part(split_part("source", ':', 2), '#', 1) IN (SELECT "id" FROM "CrmDealPayment" WHERE "tenantId" IN (${inList}))))
      OR ("source" LIKE 'crm.commission.first:%' AND split_part("source", ':', 2) IN (SELECT "id" FROM "CrmDealPayment" WHERE "tenantId" IN (${inList})))
      OR ("source" LIKE 'crm.commission.%cursor:%' AND split_part("source", ':', 2) IN (SELECT "id" FROM "AppSystem" WHERE "tenantId" IN (${inList})))`; // ORACLE-EDIT C3.3-H (27 ก.ย.): every per-system cursor (q1a + the H6 syncPayroll cursor)
    const ourRules = ((await P.$queryRawUnsafe(`SELECT "id" FROM "CrmCommissionRule" WHERE "tenantId" IN (${inList})`).catch(() => [])) as Any[]).map((r) => String(r.id));
    const ourPays = ((await P.$queryRawUnsafe(`SELECT "id" FROM "CrmDealPayment" WHERE "tenantId" IN (${inList})`).catch(() => [])) as Any[]).map((r) => String(r.id));
    await del(() => P.$executeRawUnsafe(`DELETE ${flagSql}`));
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
      // ORACLE-EDIT C3.3 round-6 (26 ก.ย.) — no nomatch flag of ours survives (checked by the ids captured before the sweep)
      const flagRows = ((await P.opsAlertState.findMany({ where: { source: { startsWith: "crm.commission.nomatch:" } }, select: { source: true } })) as Any[]).map((f) => String(f.source));
      const flagsLeft = flagRows.filter((src) => { const [, key, rule] = src.split(":"); return ourRules.includes(rule) || ourPays.includes(String(key).split("#")[0]); }).length;
      chk("C3.3-CLEAN", "the oracle gives the QC database back exactly as found — every throwaway tenant and every row it owned (rules · commissions · deals · payments · HR employees/profiles/adjustments/runs · approval policies/requests · outbox · audit · notifications) and the throwaway users are gone",
        left.length === 0 && tenants === 0 && users === 0 && rules === 0 && adj === 0 && comms === 0 && flagsLeft === 0, "0 rows · 0 tenants · 0 users · 0 flags", `${left.join(" · ") || "-"} · tenants=${tenants} users=${users} rules=${rules} adj=${adj} comms=${comms} nomatchFlags=${flagsLeft}`, "MAJOR");
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
