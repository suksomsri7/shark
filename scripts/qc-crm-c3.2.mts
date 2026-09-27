// QC — CRM v2 WO C3.2: quotas (set · list · progress from the LEDGERS · reached ONCE per owner+period+threshold) · home page data
//      (6 KPIs · team leaderboard · lead sources of the period · "no owner" list for MANAGER — R-A) · saved views for objectKey
//      contact / company / deal with a REAL team scope (`MemberSavedView.objectKey/teamId`) · event `crm.quota.reached`
// Oracle writer · the C3.2 builder must NOT touch this file · QC database only (.env.qc — loaded by scripts/acc-v2-env.mts)
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c3.2.mts
//      `--force-run` = run every check while `quotas.ts` is absent — C3.2 checks red for the right reason ("module absent"), the
//                      answer-key control, the payment workers (C2.7 path, already built) and CLEAN green
//      `--x3-worker …` = internal worker mode (own PrismaClient = own pool) — see the WORKER block
// requires: crm-seed   (house style — this oracle reads NO seeded row: everything lives in throwaway tenants `qc-c32-<rand>-*`, so a
//                       controller reseed running at the same moment can neither break it nor be broken by it)
//
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE (not re-implemented here): qc-member-m1.5 (member saved views unchanged) ·
//   qc-crm-c3.1 (reports share the ledgers + the REPORT visibility level) · qc-crm-c2.10 (the "ดีลที่ต้องดู" block stays on the home page) ·
//   qc-crm-c2.7 (payments: the reached hook rides on the money path) · qc-crm-c1.4 / c1.3 / c1.5 (list*({savedViewId}) now honours teamId) ·
//   qc-crm-c1.7 (visibility) · qc-crm-c1.11 (home page + uiVersion) · qc-crm-c1.8 (3 registries) · qc-crm-v1 · qc-member-m1.9 (30/15/10/5).
//
// SOURCES: crm-brief-C3.2.md (+ its "Addendum (oracle author)") · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-A: C3.2 completes the
//   home page incl. the "no owner" list + bulk transfer for MANAGER · R-C.8 keys `<type>#<id>#<seq>` · R-E.8 sums in SQL as bigint ·
//   R-E.14 uiVersion 1) · CRM-RUN §2 "C3.2" (S1 progress vs ledgers 5 · S2 reached once/period 2 · S3 6 KPIs 6 · S4 saved views 3 kinds 3 ·
//   S5 visual owner/thana 4 = 20) · MASTER-PLAN §4 (X1 X3 X4 X8 X9) · blueprint §3.1 (mockup 01) §5.9 (`quotas.ts` set/list/progress/
//   checkReached) §7.1 (`crm.quota.reached` {ownerType, ownerId, periodKey, pct}) §7.4 (template `quota.progress` 80/100 %) §11.6 (period
//   month/quarter/year · team = Σ members or custom · retroactive change needs MANAGER+) · mockups 01 + 10 · prisma CrmQuota (crm_v2_c) ·
//   visibility-shared.ts (STAFF REPORT = OWN · team lead ≥ TEAM · MANAGER ALL) · brief.ts#homeFor (stale = stalledAt set) · payments.ts
//   (CrmDealPayment status COUNTED/REVERSED/LINKED, recordDocPayment, afterCounted) · notifications-shared.ts (`quota.progress`).
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this — details in the brief addendum) ══════════════════
//   ctx = { tenantId, systemId, actorUserId } · actor = MemberActor · the system is re-resolved in the tenant (type CRM) else NOT_FOUND ·
//   uiVersion ≠ 2 ⇒ CrmV2DisabledError (nothing read/written; checkReached returns without writing) · Thai errors that never blame the user ·
//   errors carry `.code` ∈ VALIDATION | NOT_FOUND | FORBIDDEN (CrmForbiddenError accepted) · every time window in Thai time (+07:00).
//   A. `src/lib/modules/crm/quotas-shared.ts` (pure): QUOTA_THRESHOLDS = [80, 100] · periodKeyOf(date, "MONTH"|"QUARTER"|"YEAR") →
//      "2026-09" | "2026-Q3" | "2026" (GREGORIAN year, Thai calendar boundaries) · periodRange(key) → { from, to } (half-open, UTC instants
//      of Thai midnights) · isPeriodKey(key) (year 2000–2199 ⇒ a Buddhist-era key such as "2569-10" is refused).
//   B. `src/lib/modules/crm/quotas.ts`:
//      setQuota(ctx, actor, { ownerType: "USER"|"TEAM", ownerId, periodKey, targetSatang, targetDeals?, targetActivities?, note? }) → QuotaDto
//        upsert on @@unique(systemId, ownerType, ownerId, periodKey) · key `crm.quota.manage` · a period that has ENDED needs MANAGER/OWNER ·
//        USER = a member of the tenant, TEAM = a Team of the tenant · audit `crm.quota.set` (before/after) · money as BigInt satang.
//      listQuotas(ctx, actor, { periodKey?, ownerType? }) → QuotaDto[] (QuotaDto = { id, ownerType, ownerId, periodKey, targetSatang (number),
//        targetDeals, targetActivities, note })
//      progress(ctx, actor, { ownerType, ownerId, periodKey }) → { quotaId|null, won, deals, paid, activities, targetSatang|null,
//        targetDeals|null, targetActivities|null, basis: "PAID"|"WON", pct|null }  — computed from the ledgers only:
//        won/deals = CrmDeal kind WON, not archived, owner ∈ owners, whose LATEST CrmDealStageHistory row into a WON stage is inside the period
//        paid = Σ CrmDealPayment.satang status COUNTED, countedAt inside the period, on non-archived deals of the owners
//        activities = CrmActivity doneAt inside the period, owner ∈ owners, type ∉ {NOTE, WEB, PORTAL}
//        owners = [userId] for USER · the team's CURRENT TeamMember rows for TEAM · TEAM target = its own CrmQuota row, else Σ members' USER
//        targets · pct = floor(achieved × 100 / target) with achieved = paid when settings.crm.commission.basis is PAID (default) else won
//        · visible = self · a team the actor belongs to · actor with REPORT level ALL or `crm.quota.manage` — anything else NOT_FOUND.
//      checkReached(ctx, target: { quotaId } | { userId, at?: Date }) → { emitted: { quotaId, threshold }[] } — for each threshold of
//        QUOTA_THRESHOLDS with pct ≥ threshold: ONE conditional insert (INSERT … ON CONFLICT DO NOTHING / createMany skipDuplicates — never
//        check-then-emit) of `crm.quota.reached`, key `crm.quota.reached#<systemId>:<ownerType>:<ownerId>:<periodKey>#<threshold>`, payload ids
//        only { quotaId, ownerType, ownerId, periodKey, threshold, pct }, OutboxEvent.systemId = the CRM system · { userId, at } evaluates
//        that user's USER quota and the TEAM quotas of his teams for the period containing `at` · wired so that EVERY counted payment and
//        EVERY move to WON reaches it AFTER its own transaction committed (in-process after-hook or outbox consumer — builder's choice)
//        ⇒ two payments committed in parallel still produce exactly one row per threshold · once per period even if progress dips and recovers.
//   C. `src/lib/modules/crm/home-data.ts` (NOT `home.ts`: `home.tsx` exists and `./home` would resolve to the new file) —
//      HomeFilters = { pipelineId?, ownerUserId?, periodKey? (default = Thai month of now), now?: Date } · key `crm.report.view` ·
//      every number over rows visible at the actor's REPORT level (visibility.resolve(…, "REPORT")) ∩ visibleWhere(entity):
//      kpis(ctx, actor, f) → { periodKey, openPipeline {count, valueSatang}, weighted {valueSatang}, won {count, valueSatang, targetSatang|null,
//        pct|null}, winRate {pct|null, prevPct|null, deltaPts|null, won, lost}, stale {count, valueSatang}, hotLeads {count, threshold} }
//      leaderboard(ctx, actor, f) → { periodKey, rows: { userId, name, wonSatang, wonCount, targetSatang|null, pct|null, openDeals }[] }
//      leadSources(ctx, actor, f) → { periodKey, items: { sourceKind, count }[] } · unowned(ctx, actor) → { deals: {id,title,valueSatang}[],
//        contacts: {id,name}[] } (key `crm.deal.reassign`) · homeData(ctx, actor, f) → { kpis, leaderboard, leadSources, unowned|null }
//   D. `src/lib/modules/crm/views.ts`: listViews(ctx, actor, objectKey) · createView(ctx, actor, { objectKey, name, scope: "PRIVATE"|"TEAM",
//      teamId?, filters }) · updateView · deleteView — objectKey ∈ contact|company|deal · filters whitelisted per objectKey · TEAM needs a
//      teamId of a team the actor is in (or MANAGER+) and is visible ONLY to the view owner + that team's current members · legacy rows
//      (scope TEAM, teamId null) keep meaning "whole shop" · listContacts/listCompanies/listDeals({ savedViewId }) apply exactly that rule.
//   E. facade blocks `// CRM C3.2 ▸ … ◂`: `export * as quotas` · `export * as home from "./home-data"` · `export * as views` · the event in
//      3 registries (automation/labels.ts once · consumer in outbox-consumers.ts → notifications.notifyStaff key `quota.progress`) ·
//      UI: home (mockup 01) testids · `/crm/settings/quotas` page (mockup 10) + nav + inventory · NO migration (crm_v2_c already has CrmQuota).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// CHECK INVENTORY: 47 = S0 4 · S1 5 · S2 2 · S3 6 · S4 3 · S5 4 (S1–S5 = the 20 of CRM-RUN §2) · S6 6 (brief extras · S6.6 = ORACLE-EDIT C3.2 SF-4) · K 1 (answer-key
//   control) · X1 6 · X3 4 (X3.1a/X3.2a = "did the worker processes really run" controls) · X4 2 · X8 1 · X9 2 · CLEAN
//   (C3.2-FATAL is added only when something throws)
//   n/a: X2 (no REST op / AI tool — `crm_quota_progress` is C3.4/C3.8) · X5 (no scheduled job: reached is event-driven; report schedules are
//   C3.1) · X6 (filters are whitelisted keys — S4.1; the quota note is plain text rendered escaped) · X7 (no public endpoint) · X10 (no file).
// HOUSE RULES: SKIP guard before any DB connection · throwaway tenants swept in `finally` (every table with tenantId, 4 passes) + users ·
//   NO global drainOutbox (it is not tenant-scoped and would run other sessions' events with this worktree's code) — our own events are
//   hand-delivered to the consumer map by id, regardless of status (a foreign drainer may have picked them already) · synthetic clock
//   NOW = 2026-09-15 12:00 Thai for the KPI fixture; the X3.2 money race uses the REAL current Thai month (recordDocPayment stamps now) ·
//   races run in worker PROCESSES (own pool) · the answer key is independent raw SQL (never the service's helpers) · last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const Q_FILE = "src/lib/modules/crm/quotas.ts";
const QS_FILE = "src/lib/modules/crm/quotas-shared.ts";
const H_FILE = "src/lib/modules/crm/home-data.ts";
const V_FILE = "src/lib/modules/crm/views.ts";
const Q_SPEC = "@/lib/modules/crm/quotas";
const QS_SPEC = "@/lib/modules/crm/quotas-shared";
const H_SPEC = "@/lib/modules/crm/home-data";
const V_SPEC = "@/lib/modules/crm/views";
const HOME_FILE = "src/lib/modules/crm/home.tsx";
const HOME_COMP_DIR = "src/components/crm/home";
const QUOTA_PAGE_DIR = "src/app/app/sys/[id]/crm/settings/quotas";
const QUOTA_PAGE = `${QUOTA_PAGE_DIR}/page.tsx`;
const QUOTA_COMP_DIR = "src/components/crm/quotas";
const INDEX_FILE = "src/lib/modules/crm/index.ts";
const LABELS_FILE = "src/lib/automation/labels.ts";
const WEBHOOK_LABELS = "src/lib/webhooks/labels.ts";
const CONSUMERS_FILE = "src/lib/outbox-consumers.ts";
const NAV_FILE = "src/lib/modules/crm/nav.ts";
const INVENTORY = "scripts/crm-ui-inventory.json";
const SCHEMA_DIR = "prisma/schema";
const MIG_DIR = "prisma/migrations";
const C30_MIG = "20261102000000_crm_v2_c";
const THIS_FILE = "scripts/qc-crm-c3.2.mts";
const EVT = "crm.quota.reached";

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
// SKIP guard — quotas.ts absent (or its C3.0 table absent) ⇒ SKIPPED, no DB connection.
// ═══════════════════════════════════════════════════════════════════════════════════
const qSrc0 = read(Q_FILE);
const BUILT = qSrc0.length > 0;
const schemaAll = existsSync(SCHEMA_DIR) ? readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".prisma")).map((f) => read(join(SCHEMA_DIR, f))).join("\n") : "";
const C30 = /model\s+CrmQuota\s*\{/.test(schemaAll) && existsSync(join(MIG_DIR, C30_MIG));
if (WORKER_AT < 0 && !FORCE && (!BUILT || !C30)) {
  const why = !BUILT ? `WO C3.2 not built yet (${Q_FILE} absent)${C30 ? "" : " — and its prerequisite C3.0 (CrmQuota · *_crm_v2_c) is absent too"}` : "prerequisite C3.0 absent: CrmQuota / prisma/migrations/*_crm_v2_c not in the tree";
  console.log(`⚠️  SKIPPED — ${why} (run with --force-run to exercise the fixtures, the answer key, the workers and the cleanup)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();

const fnOf = (mod: Any, ...names: string[]): Any => {
  for (const n of names) {
    let v: Any = mod;
    for (const p of n.split(".")) v = v?.[p];
    if (typeof v === "function") return v;
  }
  return undefined;
};
const codeOf = (e: Any) => String(e?.code ?? "-");
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════════════════════════════
// WORKER MODE — this file re-invoked as a child process (own PrismaClient = own pool, synchronised start per round).
//   argv: --x3-worker <mode> <tenantId> <crmSystemId> <startAtMs> <base64url(JSON arg)>
//     reach : { rounds: quotaId[], n }                 → round r at start + r·3 s: n parallel checkReached(ctx, { quotaId })
//     pay   : { rounds: {documentId, paymentId, amountSatang}[] } → round r at start + r·5 s: payments.recordDocPayment (the C2.7 path)
// ═══════════════════════════════════════════════════════════════════════════════════
if (WORKER_AT >= 0) {
  const [mode, wT, wS, wStart, wArg] = ARGV.slice(WORKER_AT + 1);
  const PW = ((await import("@/lib/core/db")) as Any).prisma as Any;
  const arg = JSON.parse(Buffer.from(String(wArg), "base64url").toString("utf8"));
  const err = (e: unknown) => `ERR:${codeOf(e)}:${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`;
  const at = async (t: number) => { const ms = t - Date.now(); if (ms > 0) await sleep(ms); };
  const out: string[] = [];
  if (mode === "reach") {
    const QW = (await import(Q_SPEC as string).catch(() => ({}))) as Any;
    const cr = fnOf(QW, "checkReached");
    const rounds = (arg.rounds ?? []) as string[];
    for (let r = 0; r < rounds.length; r += 1) {
      await at(Number(wStart) + r * 3000);
      out.push(...(await Promise.all(Array.from({ length: Number(arg.n ?? 4) }, async () => {
        try {
          if (!cr) throw Object.assign(new Error("checkReached missing"), { code: "MISSING_FUNCTION" });
          await cr({ tenantId: wT, systemId: wS, actorUserId: null }, { quotaId: rounds[r] });
          return "OK";
        } catch (e) { return err(e); }
      }))));
    }
  } else if (mode === "pay") {
    const PM = (await import("@/lib/modules/crm/payments" as string).catch(() => ({}))) as Any;
    const rec = fnOf(PM, "recordDocPayment");
    const rounds = (arg.rounds ?? []) as Any[];
    for (let r = 0; r < rounds.length; r += 1) {
      await at(Number(wStart) + r * 5000);
      try {
        if (!rec) throw Object.assign(new Error("recordDocPayment missing"), { code: "MISSING_FUNCTION" });
        const v = await rec({ tenantId: wT, systemId: wS }, rounds[r]);
        out.push(v?.counted === true ? "OK:counted" : `OK:skip-${String(v?.skipped ?? "?")}`);
      } catch (e) { out.push(err(e)); }
    }
  }
  console.log(`X3WORKER ${JSON.stringify(out)}`);
  await PW.$disconnect();
  process.exit(0);
}

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c32-${rand}`;

// ─────────────────────────── harness ───────────────────────────
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const cut = (v: unknown, n = 240) => { const s = String(v ?? ""); return s.length > n ? `${s.slice(0, n)}…` : s; };
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
const rs = (r: Res) => (r.ok ? `ok ${cut(j(r.v), 160)}` : r.err);
const n = (x: unknown) => (x === null || x === undefined || x === "" ? Number.NaN : Number(x));
const nn = (x: unknown) => (x === null || x === undefined ? null : Number(x));
const idsOf = (v: Any) => ((v?.items ?? v?.rows ?? v ?? []) as Any[]).map((r) => String(r?.id)).sort();
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// ─────────────────────────── Thai time (independent of the product) ───────────────────────────
const OFF = 7 * 3_600_000;
const T = (iso: string) => new Date(iso);
const monthKeyOf = (d: Date) => { const t = new Date(d.getTime() + OFF); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`; };
const rangeOf = (key: string): { from: Date; to: Date } => {
  let m = /^(\d{4})-(\d{2})$/.exec(key);
  if (m) { const y = Number(m[1]); const mo = Number(m[2]); return { from: new Date(Date.UTC(y, mo - 1, 1) - OFF), to: new Date(Date.UTC(y, mo, 1) - OFF) }; }
  m = /^(\d{4})-Q([1-4])$/.exec(key);
  if (m) { const y = Number(m[1]); const qq = Number(m[2]); return { from: new Date(Date.UTC(y, (qq - 1) * 3, 1) - OFF), to: new Date(Date.UTC(y, qq * 3, 1) - OFF) }; }
  m = /^(\d{4})$/.exec(key);
  if (m) { const y = Number(m[1]); return { from: new Date(Date.UTC(y, 0, 1) - OFF), to: new Date(Date.UTC(y + 1, 0, 1) - OFF) }; }
  throw new Error(`oracle: bad period key ${key}`);
};
const ts = (d: Date) => d.toISOString().replace("T", " ").replace("Z", ""); // UTC-naive literal for `timestamp(3)` columns (session-TZ proof)
const prevMonth = (key: string) => { const [y, mo] = key.split("-").map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`; };
const NOW = T("2026-09-15T05:00:00Z"); // 12:00 Thai
const PK = "2026-09";
const ABSENT = BUILT ? "" : " · [quotas.ts ABSENT]";

console.log(`\n═══ QC CRM v2 · C3.2 — quotas · home KPIs · leaderboard · saved views ═══`);
console.log(`[env] DB ${host} · tag ${TAG}${FORCE && (!BUILT || !C30) ? ` · --force-run with ${!BUILT ? "C3.2 ABSENT" : "C3.0 ABSENT"} (C3.2 checks expected red; controls + CLEAN green)` : ""}\n`);

const TENANTS: string[] = [];
const USERS: string[] = [];
const PII: string[] = [];
const pii = <S extends string>(s: S): S => { PII.push(s); return s; };
let seq = 0;
const nx = () => `${++seq}`;
let phoneSeq = 0;
const phoneOf = (): string => pii(`08${String((Math.floor(Math.random() * 9_000_000) + 1_000_000) * 10 + (phoneSeq++ % 10)).padStart(8, "0").slice(-8)}`);

try {
  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — structure (static + runtime shape)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S0 · structure ──");
  const Q = (await import(Q_SPEC as string).catch(() => ({}))) as Any;
  const QS = (await import(QS_SPEC as string).catch(() => ({}))) as Any;
  const H = (await import(H_SPEC as string).catch(() => ({}))) as Any;
  const VW = (await import(V_SPEC as string).catch(() => ({}))) as Any;
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => ({}))) as Any;
  const LAB = (await import("@/lib/automation/labels" as string).catch(() => ({}))) as Any;
  const OBX = (await import("@/lib/outbox-consumers" as string).catch(() => ({}))) as Any;
  const CONS: Any = OBX.consumers ?? {};
  const setQuotaF = fnOf(Q, "setQuota");
  const listQuotasF = fnOf(Q, "listQuotas");
  const progressF = fnOf(Q, "progress");
  const reachedF = fnOf(Q, "checkReached");
  const kpisF = fnOf(H, "kpis");
  const boardF = fnOf(H, "leaderboard");
  const sourcesF = fnOf(H, "leadSources");
  const unownedF = fnOf(H, "unowned");
  const homeDataF = fnOf(H, "homeData");
  const listViewsF = fnOf(VW, "listViews");
  const createViewF = fnOf(VW, "createView");
  const updateViewF = fnOf(VW, "updateView");
  const deleteViewF = fnOf(VW, "deleteView");
  const periodKeyOfF = fnOf(QS, "periodKeyOf");
  const periodRangeF = fnOf(QS, "periodRange");
  const isPeriodKeyF = fnOf(QS, "isPeriodKey");
  {
    const qsSrc = read(QS_FILE);
    const impure = /from\s+["'](@prisma\/client|@\/lib\/core\/db|next\/[^"']+|server-only|\.\/db|\.\/quotas)["']/.test(qsSrc);
    const missing = [["setQuota", setQuotaF], ["listQuotas", listQuotasF], ["progress", progressF], ["checkReached", reachedF], ["periodKeyOf", periodKeyOfF], ["periodRange", periodRangeF], ["isPeriodKey", isPeriodKeyF]]
      .filter(([, f]) => typeof f !== "function").map(([x]) => x);
    chk("C3.2-S0.1", "quotas.ts exports setQuota · listQuotas · progress · checkReached and quotas-shared.ts is pure (no prisma/next/server-only/./db) with QUOTA_THRESHOLDS = [80, 100] · periodKeyOf · periodRange · isPeriodKey",
      BUILT && qsSrc.length > 0 && !impure && missing.length === 0 && j(QS.QUOTA_THRESHOLDS) === "[80,100]",
      "4 + 3 fns · [80,100] · pure", `quotas=${BUILT} shared=${qsSrc.length > 0} impure=${impure} missing=${missing.join(",") || "-"} thresholds=${j(QS.QUOTA_THRESHOLDS)}${ABSENT}`);
  }
  {
    const missing = [["kpis", kpisF], ["leaderboard", boardF], ["leadSources", sourcesF], ["unowned", unownedF], ["homeData", homeDataF], ["listViews", listViewsF], ["createView", createViewF], ["updateView", updateViewF], ["deleteView", deleteViewF]]
      .filter(([, f]) => typeof f !== "function").map(([x]) => x);
    const noHomeTs = !existsSync("src/lib/modules/crm/home.ts");
    chk("C3.2-S0.2", "home-data.ts exports kpis · leaderboard · leadSources · unowned · homeData and views.ts exports listViews · createView · updateView · deleteView · NO `crm/home.ts` next to `home.tsx` (it would hijack `./home` imported by ui.tsx)",
      missing.length === 0 && noHomeTs, "9 fns · no home.ts", `missing=${missing.join(",") || "-"} home.ts=${!noHomeTs}${ABSENT}`);
  }
  {
    const idx = read(INDEX_FILE);
    const block = /CRM C3\.2 ▸[\s\S]*◂/.exec(idx)?.[0] ?? "";
    const ok = /export\s+\*\s+as\s+quotas\s+from\s+["']\.\/quotas["']/.test(block) && /export\s+\*\s+as\s+home\s+from\s+["']\.\/home-data["']/.test(block) && /export\s+\*\s+as\s+views\s+from\s+["']\.\/views["']/.test(block);
    chk("C3.2-S0.3", "facade: crm/index.ts exports the `quotas`, `home` (from ./home-data) and `views` namespaces inside a `// CRM C3.2 ▸ … ◂` block and crm.quotas.checkReached / crm.home.kpis / crm.views.listViews are reachable through it [static + runtime]",
      ok && typeof CRM?.quotas?.checkReached === "function" && typeof CRM?.home?.kpis === "function" && typeof CRM?.views?.listViews === "function",
      "block + 3 namespaces", `block=${block.length > 0} static=${ok} runtime=${typeof CRM?.quotas?.checkReached}/${typeof CRM?.home?.kpis}/${typeof CRM?.views?.listViews}${ABSENT}`);
  }
  {
    const events = ((LAB.AUTOMATION_EVENTS ?? []) as Any[]).map((e) => String(e?.value));
    const once = events.filter((x) => x === EVT).length === 1;
    const inWh = new RegExp(`value:\\s*["']${EVT.replace(/\./g, "\\.")}["']`).test(read(WEBHOOK_LABELS));
    const blocks = /CRM C3\.2 ▸/.test(read(LABELS_FILE)) && /CRM C3\.2 ▸/.test(read(CONSUMERS_FILE));
    const migs = existsSync(MIG_DIR) ? readdirSync(MIG_DIR).filter((d) => /crm/i.test(d) && d > C30_MIG) : [];
    chk("C3.2-S0.4", "3 registries (a new event without a consumer stalls the whole queue): `crm.quota.reached` declared EXACTLY ONCE in automation/labels.ts (block `// CRM C3.2 ▸`), never re-declared in webhooks/labels.ts, with a consumer in outbox-consumers.ts (block `// CRM C3.2 ▸`) · C3.2 ships NO migration (CrmQuota came with crm_v2_c — R-C.1)",
      once && !inWh && typeof CONS?.[EVT] === "function" && blocks && migs.length === 0,
      "1 label · consumer · no migration", `labelOnce=${once} webhookDup=${inWh} consumer=${typeof CONS?.[EVT]} blocks=${blocks} newCrmMigrations=${migs.join(",") || "-"}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S6.1 — period helpers (pure) — early, no fixture needed
  // ═════════════════════════════════════════════════════════════════════════════
  const periodPure = (() => {
    if (!periodKeyOfF || !periodRangeF || !isPeriodKeyF) return { ok: false, why: "helpers missing" };
    try {
      const a = periodKeyOfF(T("2026-09-30T17:30:00Z"), "MONTH") === "2026-10" && periodKeyOfF(T("2026-09-30T16:30:00Z"), "MONTH") === "2026-09"
        && periodKeyOfF(T("2026-09-30T17:30:00Z"), "QUARTER") === "2026-Q4" && periodKeyOfF(T("2026-09-30T16:30:00Z"), "QUARTER") === "2026-Q3"
        && periodKeyOfF(T("2026-12-31T17:00:00Z"), "YEAR") === "2027" && periodKeyOfF(T("2026-12-31T16:59:00Z"), "YEAR") === "2026";
      const r1 = periodRangeF("2026-09");
      const r2 = periodRangeF("2026-Q4");
      const b = new Date(r1.from).toISOString() === "2026-08-31T17:00:00.000Z" && new Date(r1.to).toISOString() === "2026-09-30T17:00:00.000Z"
        && new Date(r2.from).toISOString() === "2026-09-30T17:00:00.000Z" && new Date(r2.to).toISOString() === "2026-12-31T17:00:00.000Z";
      const c = isPeriodKeyF("2026-09") && isPeriodKeyF("2026-Q3") && isPeriodKeyF("2026") && !isPeriodKeyF("2569-10") && !isPeriodKeyF("2026-13") && !isPeriodKeyF("2026-Q5") && !isPeriodKeyF("26-10") && !isPeriodKeyF("");
      return { ok: a && b && c, why: `keys=${a} ranges=${b} valid=${c}` };
    } catch (e) { return { ok: false, why: cut(String((e as Error)?.message ?? e)) }; }
  })();

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — throwaway tenants: A (CRM main · reached · X3.1 · empty · v1 · member) · B (foreign) · X (the money race)
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
  const SALES = { "crm.contact.read": true, "crm.company.read": true, "crm.deal.read": true, "crm.activity.read": true, "crm.report.view": true };
  const actor = (userId: string, role: string, permissions: Record<string, unknown> = {}) => ({ userId, role, unitAccess: role === "OWNER" ? [] as string[] : ["*"], permissions });

  const uO = await mkUser("");
  const uM = await mkUser("-mgr");
  const uTH = await mkUser("-thana");
  const uPK = await mkUser("-pook");
  const uNK = await mkUser("-nok");
  const uKT = await mkUser("-kata");
  const uSAM = await mkUser("-sam"); // STAFF without crm.report.view
  const uGONE = await mkUser("-gone"); // owns a deal but is NOT a member of the tenant
  const uQS = await mkUser("-qstaff"); // STAFF holding crm.quota.manage
  const uRU = await mkUser("-ru");
  const uRU2 = await mkUser("-ru2");
  const uRU3 = await mkUser("-ru3");
  const uRU4 = await mkUser("-ru4");
  const uXU = [await mkUser("-xu1"), await mkUser("-xu2"), await mkUser("-xu3")];
  const uYU = [await mkUser("-yu1"), await mkUser("-yu2"), await mkUser("-yu3")];
  const tidA = await mkTenant("a");
  await member(tidA, uO, "OWNER");
  await member(tidA, uM, "MANAGER");
  for (const u of [uTH, uPK, uNK, uKT, uRU, uRU2, uRU3, uRU4, ...uXU]) await member(tidA, u, "STAFF", SALES);
  await member(tidA, uSAM, "STAFF", { "crm.contact.read": true, "crm.deal.read": true });
  await member(tidA, uQS, "STAFF", { ...SALES, "crm.quota.manage": true });
  const tidB = await mkTenant("b");
  await member(tidB, uO, "OWNER");
  const tidX = await mkTenant("x");
  await member(tidX, uO, "OWNER");
  for (const u of uYU) await member(tidX, u, "STAFF", SALES);

  const crmA = await mk(tidA, "CRM", "CRM"); // KPI + progress + saved views fixture
  const crmR = await mk(tidA, "CRM", "CRM โควตา"); // S2 reached · S6.2 · X9 · X8
  const crmX = await mk(tidA, "CRM", "CRM ยิงพร้อมกัน"); // X3.1
  const crmS = await mk(tidA, "CRM", "CRM ว่าง"); // X1.4 cross-system
  const crmV = await mk(tidA, "CRM", "CRM v1"); // X1.5
  const memA = await mk(tidA, "MEMBER", "สมาชิก"); // X1.6 member saved views
  const crmB = await mk(tidB, "CRM", "CRM-B");
  const crmY = await mk(tidX, "CRM", "CRM เงินเข้า"); // X3.2 / X4
  for (const s of [crmA, crmR, crmX, crmS, crmB, crmY]) await setCrm(s, { uiVersion: 2, bridgesEnabled: true });
  await setCrm(crmA, { scoring: { hot: 70, warm: 20, decayDays: 30 } });
  await setCrm(crmV, { uiVersion: 1, bridgesEnabled: true });
  const ctx = (tid: string, sys: string, uid: string | null) => ({ tenantId: tid, systemId: sys, actorUserId: uid });
  const aO = actor(uO, "OWNER");
  const aM = actor(uM, "MANAGER");
  const aTH = actor(uTH, "STAFF", SALES);
  const aPK = actor(uPK, "STAFF", SALES);
  const aNK = actor(uNK, "STAFF", SALES);
  const aKT = actor(uKT, "STAFF", SALES);
  const aSAM = actor(uSAM, "STAFF", { "crm.contact.read": true, "crm.deal.read": true });
  const aQS = actor(uQS, "STAFF", { ...SALES, "crm.quota.manage": true });

  // teams (tenant-scoped · raw fixture, not the product): P = lead M + thana + pook · K = lead nok + kata · T2 = RU2 + RU3
  const mkTeam = async (tid: string, name: string, lead: string | null, members: string[]) => {
    const t = await P.team.create({ data: { tenantId: tid, name: `${name} ${TAG}`, leadUserId: lead } });
    if (lead) await P.teamMember.create({ data: { tenantId: tid, teamId: t.id, userId: lead, role: "LEAD" } });
    for (const u of members) await P.teamMember.create({ data: { tenantId: tid, teamId: t.id, userId: u, role: "MEMBER" } });
    return t.id as string;
  };
  const teamP = await mkTeam(tidA, "ทีมขาย — ภูเก็ต", uM, [uTH, uPK]);
  const teamK = await mkTeam(tidA, "ทีมขาย — กระบี่", uNK, [uKT]);
  const teamT2 = await mkTeam(tidA, "ทีมโควตา", null, [uRU2, uRU3]);
  const teamOf: Record<string, string | null> = { [uTH]: teamP, [uPK]: teamP, [uM]: teamP, [uNK]: teamK, [uKT]: teamK };

  // pipelines (crmA): p1 B2B · p2 retail
  const mkPipe = async (tid: string, sys: string, stages: [string, string, string, number][]) => {
    const p = (await P.crmPipeline.create({
      data: { tenantId: tid, systemId: sys, name: `ขาย ${TAG}-${nx()}`, stages: { create: stages.map(([, name, kind, probability], i) => ({ tenantId: tid, systemId: sys, sortOrder: i, name, kind, probability })) } },
      include: { stages: true },
    })) as Any;
    const byKey: Record<string, string> = {};
    const kindOf: Record<string, string> = {};
    for (const [k, name] of stages) { const st = (p.stages as Any[]).find((s) => s.name === name); byKey[k] = st.id; kindOf[k] = st.kind; }
    return { id: p.id as string, st: byKey, kind: kindOf, first: stages[0][0] };
  };
  const p1 = await mkPipe(tidA, crmA, [["L", "ผู้สนใจ", "OPEN", 10], ["PR", "เสนอราคา", "OPEN", 50], ["NG", "ต่อรอง", "OPEN", 80], ["WON", "ชนะ", "WON", 100], ["LOST", "แพ้", "LOST", 0]]);
  const p2 = await mkPipe(tidA, crmA, [["NEW", "ใหม่", "OPEN", 20], ["WON", "ชนะ", "WON", 100], ["LOST", "แพ้", "LOST", 0]]);

  const mkParty = async (tid: string, name: string, kind = "PERSON") => (await P.party.create({ data: { tenantId: tid, name, kind } })).id as string;
  const mkContact = async (tid: string, sys: string, o: { owner: string | null; team?: string | null; score?: number; band?: string | null; sourceKind?: string | null; createdAt?: string; archived?: boolean; mergedInto?: string | null }) => {
    const name = pii(`ลูกค้า ${TAG}-${nx()}`);
    const partyId = await mkParty(tid, name);
    const c = await P.crmContact.create({
      data: {
        tenantId: tid, systemId: sys, name, firstName: name, phone: phoneOf(), email: pii(`${TAG}-c${nx()}@qc.invalid`), partyId,
        ownerUserId: o.owner, teamId: o.team ?? null, score: o.score ?? 0, scoreBand: o.band ?? null, sourceKind: o.sourceKind ?? null,
        createdAt: T(o.createdAt ?? "2026-07-01T03:00:00Z"), ...(o.archived ? { archivedAt: T("2026-09-01T03:00:00Z") } : {}), ...(o.mergedInto ? { mergedIntoId: o.mergedInto } : {}),
      },
    });
    return c.id as string;
  };
  type Pipe = Awaited<ReturnType<typeof mkPipe>>;
  type DSpec = { k: string; owner: string | null; team?: string | null; pipe: Pipe; stage: string; value: number; prob?: number; stalled?: boolean; archived?: boolean; hist?: [string, string][]; closedAt?: string; sys?: string; tid?: string; invoiceDocId?: string };
  const D: Record<string, { id: string; contactId: string; spec: DSpec }> = {};
  const mkDeal = async (s: DSpec) => {
    const tid = s.tid ?? tidA;
    const sys = s.sys ?? crmA;
    const team = s.team !== undefined ? s.team : (s.owner ? (teamOf[s.owner] ?? null) : null);
    const contactId = await mkContact(tid, sys, { owner: s.owner, team });
    const path: [string, string][] = [[s.pipe.first, "2026-07-01T03:00:00Z"], ...(s.hist ?? [])];
    if (path[path.length - 1][0] !== s.stage) path.push([s.stage, "2026-07-02T03:00:00Z"]);
    const last = path[path.length - 1];
    const kind = s.pipe.kind[s.stage];
    const d = await P.crmDeal.create({
      data: {
        tenantId: tid, systemId: sys, contactId, pipelineId: s.pipe.id, stageId: s.pipe.st[s.stage], title: pii(`ดีล ${TAG}-${s.k}`), valueSatang: s.value,
        kind, ownerUserId: s.owner, teamId: team, stageEnteredAt: T(last[1]), probabilityOverride: s.prob ?? null,
        closedAt: kind === "OPEN" ? null : T(s.closedAt ?? last[1]), createdAt: T("2026-07-01T03:00:00Z"),
        ...(s.stalled ? { stalledAt: new Date(NOW.getTime() - 10 * 86_400_000) } : {}), ...(s.archived ? { archivedAt: T("2026-09-14T03:00:00Z") } : {}),
        ...(s.invoiceDocId ? { invoiceDocId: s.invoiceDocId } : {}),
      },
    });
    for (let i = 0; i < path.length; i += 1) {
      const [st, at] = path[i];
      const next = path[i + 1];
      await P.crmDealStageHistory.create({
        data: { tenantId: tid, dealId: d.id, fromStageId: i === 0 ? null : s.pipe.st[path[i - 1][0]], toStageId: s.pipe.st[st], enteredAt: T(at), leftAt: next ? T(next[1]) : null },
      });
    }
    D[s.k] = { id: d.id as string, contactId, spec: s };
    return d.id as string;
  };
  const mkPay = (tid: string, sys: string, dealId: string, satang: number, status: string, countedAt: string | Date | null, reversedAt: string | null = null) =>
    P.crmDealPayment.create({
      data: { tenantId: tid, systemId: sys, dealId, refType: "PAYMENT", refId: `${TAG}-pay-${nx()}`, satang: BigInt(satang), status,
        countedAt: countedAt ? (countedAt instanceof Date ? countedAt : T(countedAt)) : null, reversedAt: reversedAt ? T(reversedAt) : null },
    });
  const mkAct = (owner: string, type: string, doneAt: string | null, dealKey: string) =>
    P.crmActivity.create({ data: { tenantId: tidA, systemId: crmA, type, title: `งาน ${TAG}-${nx()}`, ownerUserId: owner, doneAt: doneAt ? T(doneAt) : null, dueAt: T("2026-09-20T03:00:00Z"), dealId: D[dealKey].id, contactId: D[dealKey].contactId } });
  const mkQuota = (tid: string, sys: string, ownerType: string, ownerId: string, periodKey: string, target: number, deals: number | null = null, acts: number | null = null) =>
    P.crmQuota.create({ data: { tenantId: tid, systemId: sys, ownerType, ownerId, periodKey, targetSatang: BigInt(target), targetDeals: deals, targetActivities: acts, note: TAG } });

  // ── the KPI / progress fixture (crmA) — values are multiples of 100 satang ⇒ every rounding scheme of `weighted` agrees ──
  const SPECS: DSpec[] = [
    { k: "o1", owner: uTH, pipe: p1, stage: "L", value: 1_000_000, stalled: true },
    { k: "o2", owner: uTH, pipe: p1, stage: "PR", value: 2_000_000, prob: 70, hist: [["PR", "2026-07-05T03:00:00Z"]] },
    { k: "o3", owner: uPK, pipe: p1, stage: "NG", value: 3_000_000, hist: [["NG", "2026-07-06T03:00:00Z"]] },
    { k: "o4", owner: uPK, team: teamK, pipe: p2, stage: "NEW", value: 500_000, stalled: true }, // pook (team P) owns a deal of TEAM K
    { k: "o5", owner: uNK, pipe: p1, stage: "PR", value: 4_000_000, stalled: true, hist: [["PR", "2026-07-07T03:00:00Z"]] },
    { k: "o6", owner: uKT, pipe: p2, stage: "NEW", value: 600_000 },
    { k: "o7", owner: null, team: null, pipe: p1, stage: "L", value: 700_000 }, // no owner
    { k: "o8", owner: uGONE, team: null, pipe: p1, stage: "L", value: 800_000 }, // owner is not a member
    { k: "o9", owner: uTH, pipe: p1, stage: "L", value: 900_000, stalled: true, archived: true },
    { k: "o10", owner: uM, pipe: p2, stage: "NEW", value: 1_100_000 },
    { k: "r1", owner: uTH, pipe: p1, stage: "PR", value: 600_000, hist: [["WON", "2026-09-05T03:00:00Z"], ["PR", "2026-09-06T03:00:00Z"]] }, // reopened
    { k: "w1", owner: uTH, pipe: p1, stage: "WON", value: 4_000_000, hist: [["WON", "2026-09-03T03:00:00Z"]] },
    { k: "w2", owner: uTH, pipe: p1, stage: "WON", value: 2_500_000, hist: [["WON", "2026-08-31T17:30:00Z"]] }, // 1 Sep 00:30 Thai
    { k: "w3", owner: uTH, pipe: p1, stage: "WON", value: 1_000_000, hist: [["WON", "2026-08-31T16:30:00Z"]] }, // 31 Aug 23:30 Thai
    { k: "w4", owner: uTH, pipe: p1, stage: "WON", value: 700_000, closedAt: "2026-08-20T03:00:00Z", hist: [["WON", "2026-08-20T03:00:00Z"], ["PR", "2026-08-25T03:00:00Z"], ["WON", "2026-09-10T03:00:00Z"]] },
    { k: "w5", owner: uPK, pipe: p1, stage: "WON", value: 3_300_000, hist: [["WON", "2026-09-05T03:00:00Z"]] },
    { k: "w6", owner: uNK, pipe: p2, stage: "WON", value: 1_200_000, hist: [["WON", "2026-09-08T03:00:00Z"]] },
    { k: "w7", owner: uKT, pipe: p2, stage: "WON", value: 900_000, hist: [["WON", "2026-08-10T03:00:00Z"]] },
    { k: "w8", owner: uTH, pipe: p1, stage: "WON", value: 5_000_000, archived: true, hist: [["WON", "2026-09-04T03:00:00Z"]] },
    { k: "l1", owner: uTH, pipe: p1, stage: "LOST", value: 800_000, hist: [["LOST", "2026-09-09T03:00:00Z"]] },
    { k: "l2", owner: uPK, pipe: p1, stage: "LOST", value: 900_000, hist: [["LOST", "2026-09-11T03:00:00Z"]] },
    { k: "l3", owner: uNK, pipe: p2, stage: "LOST", value: 400_000, hist: [["LOST", "2026-08-15T03:00:00Z"]] },
    { k: "l4", owner: uKT, pipe: p2, stage: "LOST", value: 300_000, hist: [["LOST", "2026-09-12T03:00:00Z"]] },
  ];
  for (const s of SPECS) await mkDeal(s);
  // hot leads (settings.crm.scoring.hot = 70): the band is deliberately stale on two rows ⇒ the KPI reads the SCORE
  await mkContact(tidA, crmA, { owner: uTH, team: teamP, score: 75, band: "WARM" });
  await mkContact(tidA, crmA, { owner: uPK, team: teamP, score: 70, band: null });
  await mkContact(tidA, crmA, { owner: uTH, team: teamP, score: 69, band: "HOT" });
  await mkContact(tidA, crmA, { owner: uNK, team: teamK, score: 90, band: "HOT" });
  await mkContact(tidA, crmA, { owner: uKT, team: teamK, score: 80, band: "HOT", archived: true });
  // lead sources (contacts CREATED in the Thai month)
  const s4 = await mkContact(tidA, crmA, { owner: uNK, team: teamK, sourceKind: "REFERRAL", createdAt: "2026-09-05T03:00:00Z" });
  await mkContact(tidA, crmA, { owner: uKT, team: teamK, score: 85, band: "HOT", mergedInto: s4 });
  await mkContact(tidA, crmA, { owner: uTH, team: teamP, sourceKind: "WEB_FORM", createdAt: "2026-09-02T03:00:00Z" });
  await mkContact(tidA, crmA, { owner: uTH, team: teamP, sourceKind: "WEB_FORM", createdAt: "2026-09-03T03:00:00Z" });
  await mkContact(tidA, crmA, { owner: uPK, team: teamP, sourceKind: "LINE_OA", createdAt: "2026-09-04T03:00:00Z" });
  await mkContact(tidA, crmA, { owner: uKT, team: teamK, sourceKind: "CHAT", createdAt: "2026-08-31T17:05:00Z" }); // 1 Sep Thai
  await mkContact(tidA, crmA, { owner: uTH, team: teamP, sourceKind: null, createdAt: "2026-09-06T03:00:00Z" }); // → OTHER
  await mkContact(tidA, crmA, { owner: uPK, team: teamP, sourceKind: "OTHER", createdAt: "2026-09-07T03:00:00Z" });
  await mkContact(tidA, crmA, { owner: uTH, team: teamP, sourceKind: "WEB_FORM", createdAt: "2026-08-31T16:55:00Z" }); // 31 Aug Thai
  await mkContact(tidA, crmA, { owner: uNK, team: teamK, sourceKind: "WEB_FORM", createdAt: "2026-09-08T03:00:00Z", mergedInto: s4 });
  await mkContact(tidA, crmA, { owner: uTH, team: teamP, sourceKind: "WEB_FORM", createdAt: "2026-09-09T03:00:00Z", archived: true });
  // money ledger (thana Sep: 3.0M + 1.0M + 0.2M = 4.2M)
  await mkPay(tidA, crmA, D.w1.id, 3_000_000, "COUNTED", "2026-09-10T03:00:00Z");
  await mkPay(tidA, crmA, D.w2.id, 1_000_000, "COUNTED", "2026-09-30T16:59:00Z"); // 30 Sep 23:59 Thai
  await mkPay(tidA, crmA, D.w1.id, 500_000, "COUNTED", "2026-09-30T17:01:00Z"); // 1 Oct Thai
  await mkPay(tidA, crmA, D.w2.id, 800_000, "REVERSED", "2026-09-12T03:00:00Z", "2026-09-13T03:00:00Z");
  await mkPay(tidA, crmA, D.o1.id, 200_000, "COUNTED", "2026-09-14T03:00:00Z"); // a deposit on an OPEN deal counts
  await mkPay(tidA, crmA, D.o2.id, 999_900, "LINKED", null);
  await mkPay(tidA, crmA, D.w5.id, 1_500_000, "COUNTED", "2026-09-06T03:00:00Z"); // pook
  await mkPay(tidA, crmA, D.w8.id, 400_000, "COUNTED", "2026-09-05T03:00:00Z"); // archived deal
  await mkPay(tidA, crmA, D.w3.id, 600_000, "COUNTED", "2026-08-31T16:59:00Z"); // 31 Aug Thai
  // activities (thana Sep: CALL · MEETING · TASK 1 Sep 00:10 Thai = 3)
  await mkAct(uTH, "CALL", "2026-09-02T03:00:00Z", "w1");
  await mkAct(uTH, "MEETING", "2026-09-09T03:00:00Z", "w1");
  await mkAct(uTH, "TASK", "2026-08-31T17:10:00Z", "w1");
  await mkAct(uTH, "EMAIL", "2026-08-31T16:50:00Z", "w1");
  await mkAct(uTH, "NOTE", "2026-09-05T03:00:00Z", "w1");
  await mkAct(uTH, "CALL", null, "w1");
  await mkAct(uTH, "WEB", "2026-09-06T03:00:00Z", "w1");
  await mkAct(uPK, "CALL", "2026-09-07T03:00:00Z", "w5");
  // quotas (raw fixture, note = TAG): Sep USER · a TEAM K custom target · an Aug quota for thana
  const qTH = (await mkQuota(tidA, crmA, "USER", uTH, PK, 6_000_000, 4, 5)).id as string;
  await mkQuota(tidA, crmA, "USER", uPK, PK, 5_000_000);
  await mkQuota(tidA, crmA, "USER", uNK, PK, 2_000_000);
  await mkQuota(tidA, crmA, "USER", uKT, PK, 1_000_000);
  await mkQuota(tidA, crmA, "TEAM", teamK, PK, 4_000_000);
  await mkQuota(tidA, crmA, "USER", uTH, "2026-08", 3_000_000);
  void qTH;
  // companies (S4.2)
  const mkCompany = async (owner: string, team: string, industry: string) =>
    (await P.crmCompany.create({ data: { tenantId: tidA, systemId: crmA, partyId: await mkParty(tidA, `บริษัท ${TAG}-${nx()}`, "COMPANY"), name: `บริษัท ${TAG}-${nx()}`, industry, ownerUserId: owner, teamId: team } })).id as string;
  await mkCompany(uKT, teamK, "ดำน้ำ");
  await mkCompany(uNK, teamK, "โรงแรม");
  await mkCompany(uTH, teamP, "ดำน้ำ");

  // ═════════════════════════════════════════════════════════════════════════════
  // ANSWER KEY — independent raw SQL over the ledgers (never the service's helpers)
  // ═════════════════════════════════════════════════════════════════════════════
  const q = async (sql: string, ...params: unknown[]) => (await P.$queryRawUnsafe(sql, ...params)) as Any[];
  type Scope = { kind: "ALL" } | { kind: "OWN"; me: string } | { kind: "TEAM"; me: string; teamIds: string[]; mates: string[] };
  const scopeSql = (a: string, s: Scope, p: unknown[]): string => {
    if (s.kind === "ALL") return "TRUE";
    p.push(s.me);
    const me = `$${p.length}`;
    if (s.kind === "OWN") return `${a}."ownerUserId" = ${me}`;
    p.push(s.teamIds);
    const t = `$${p.length}::text[]`;
    p.push(s.mates);
    const m = `$${p.length}::text[]`;
    return `(${a}."ownerUserId" = ${me} OR ${a}."teamId" = ANY(${t}) OR ${a}."ownerUserId" = ANY(${m}))`;
  };
  const LAST = (tIdx: number) => `WITH last AS (SELECT h."dealId", s2."kind", max(h."enteredAt") AS at FROM "CrmDealStageHistory" h JOIN "CrmStage" s2 ON s2."id" = h."toStageId" WHERE h."tenantId" = $${tIdx} GROUP BY h."dealId", s2."kind")`;
  const winPct = (w: number, l: number) => (w + l > 0 ? Math.round((w * 100) / (w + l)) : null);
  // ORACLE-EDIT C3.2 SF-4 (26 ก.ย. · ruling: achievement basis = progress basis) ▸
  //   KPI-3 pct and the leaderboard pct use the SAME achievement as progress()/checkReached: basis read independently from
  //   AppSystem.settings.crm.commission.basis (anything but "WON" ⇒ PAID) · PAID ⇒ Σ COUNTED CrmDealPayment.satang by countedAt in the
  //   window on non-archived deals owned by the row's user (the sqlProgress paid formula) · WON ⇒ the row's won value · KPI-3 achieved and
  //   target = sums over the leaderboard users (owner-in-scope only) · won count/value columns unchanged · DTO carries won.basis,
  //   won.achievedSatang, leaderboard.basis and per-row achievedSatang ◂
  const sqlBasis = async (sys: string) => {
    const [b] = await q(`SELECT "settings"->'crm'->'commission'->>'basis' AS b FROM "AppSystem" WHERE "id" = $1`, sys);
    return b?.b === "WON" ? "WON" : "PAID";
  };
  type Kpi = { open: [number, number]; weighted: number; won: [number, number, number | null, number | null, string, number]; win: [number | null, number | null, number | null]; stale: [number, number]; hot: number };
  const sqlKpis = async (tid: string, sys: string, s: Scope, o: { key: string; pipelineId?: string; owner?: string; hot: number }): Promise<Kpi> => {
    const dealW = (p: unknown[]) => {
      let w = `d."systemId" = $1 AND d."archivedAt" IS NULL AND ${scopeSql("d", s, p)}`;
      if (o.pipelineId) { p.push(o.pipelineId); w += ` AND d."pipelineId" = $${p.length}`; }
      if (o.owner) { p.push(o.owner); w += ` AND d."ownerUserId" = $${p.length}`; }
      return w;
    };
    const p1q: unknown[] = [sys];
    const w1 = dealW(p1q);
    const [op] = await q(`SELECT count(*)::int AS n, COALESCE(sum(d."valueSatang"),0)::bigint AS v,
        COALESCE(sum(d."valueSatang"::bigint * COALESCE(d."probabilityOverride", st."probability")),0)::bigint AS wv,
        (count(*) FILTER (WHERE d."stalledAt" IS NOT NULL))::int AS sn, COALESCE(sum(d."valueSatang") FILTER (WHERE d."stalledAt" IS NOT NULL),0)::bigint AS sv
      FROM "CrmDeal" d JOIN "CrmStage" st ON st."id" = d."stageId" WHERE ${w1} AND d."kind" = 'OPEN'`, ...p1q);
    const closed = async (key: string) => {
      const r = rangeOf(key);
      const p: unknown[] = [sys];
      const w = dealW(p);
      p.push(tid, ts(r.from), ts(r.to));
      const t = p.length - 2;
      const rows = await q(`${LAST(t)} SELECT d."kind"::text AS kind, count(*)::int AS n, COALESCE(sum(d."valueSatang"),0)::bigint AS v
        FROM "CrmDeal" d JOIN last l ON l."dealId" = d."id" AND l."kind" = d."kind"
        WHERE ${w} AND d."kind" IN ('WON','LOST') AND l.at >= $${t + 1}::timestamp AND l.at < $${t + 2}::timestamp GROUP BY d."kind"`, ...p);
      const won = rows.find((x) => x.kind === "WON");
      const lost = rows.find((x) => x.kind === "LOST");
      return { won: Number(won?.n ?? 0), wonV: Number(won?.v ?? 0), lost: Number(lost?.n ?? 0) };
    };
    const cur = await closed(o.key);
    const prev = /^\d{4}-\d{2}$/.test(o.key) ? await closed(prevMonth(o.key)) : null;
    // ORACLE-EDIT C3.2 SF-4 (26 ก.ย. · ruling: achievement basis = progress basis) ▸ target + achieved over the leaderboard users
    const board = await sqlBoard(tid, sys, s, o.key, { owner: o.owner, pipelineId: o.pipelineId });
    const withT = board.filter((r) => r.targetSatang !== null);
    const target = withT.length ? withT.reduce((a, r) => a + Number(r.targetSatang), 0) : null;
    const achieved = board.reduce((a, r) => a + r.achievedSatang, 0);
    const basis = await sqlBasis(sys);
    // ◂
    const ph: unknown[] = [sys];
    let wh = `c."systemId" = $1 AND c."archivedAt" IS NULL AND c."mergedIntoId" IS NULL AND ${scopeSql("c", s, ph)}`;
    if (o.owner) { ph.push(o.owner); wh += ` AND c."ownerUserId" = $${ph.length}`; }
    ph.push(o.hot);
    wh += ` AND c."score" >= $${ph.length}`;
    const [hot] = await q(`SELECT count(*)::int AS n FROM "CrmContact" c WHERE ${wh}`, ...ph);
    const wp = winPct(cur.won, cur.lost);
    const pp = prev ? winPct(prev.won, prev.lost) : null;
    return {
      open: [Number(op.n), Number(op.v)],
      weighted: Math.round(Number(op.wv) / 100),
      won: [cur.won, cur.wonV, target, target && target > 0 ? Math.floor((achieved * 100) / target) : null, basis, achieved], // ORACLE-EDIT C3.2 SF-4
      win: [wp, pp, wp !== null && pp !== null ? wp - pp : null],
      stale: [Number(op.sn), Number(op.sv)],
      hot: Number(hot.n),
    };
  };
  const sqlProgress = async (tid: string, sys: string, owners: string[], key: string) => {
    const r = rangeOf(key);
    const [w] = await q(`${LAST(2)} SELECT count(*)::int AS n, COALESCE(sum(d."valueSatang"),0)::bigint AS v FROM "CrmDeal" d JOIN last l ON l."dealId" = d."id" AND l."kind" = d."kind"
      WHERE d."systemId" = $1 AND d."archivedAt" IS NULL AND d."kind" = 'WON' AND d."ownerUserId" = ANY($3::text[]) AND l.at >= $4::timestamp AND l.at < $5::timestamp`, sys, tid, owners, ts(r.from), ts(r.to));
    const [p] = await q(`SELECT COALESCE(sum(p."satang"),0)::bigint AS v FROM "CrmDealPayment" p JOIN "CrmDeal" d ON d."id" = p."dealId"
      WHERE p."systemId" = $1 AND p."status" = 'COUNTED' AND p."countedAt" >= $2::timestamp AND p."countedAt" < $3::timestamp AND d."archivedAt" IS NULL AND d."ownerUserId" = ANY($4::text[])`, sys, ts(r.from), ts(r.to), owners);
    const [a] = await q(`SELECT count(*)::int AS n FROM "CrmActivity" a WHERE a."systemId" = $1 AND a."ownerUserId" = ANY($2::text[]) AND a."doneAt" >= $3::timestamp AND a."doneAt" < $4::timestamp
      AND a."type"::text NOT IN ('NOTE','WEB','PORTAL')`, sys, owners, ts(r.from), ts(r.to));
    return { won: Number(w.v), deals: Number(w.n), paid: Number(p.v), activities: Number(a.n) };
  };
  const membersOfTeam = async (teamId: string) => (await q(`SELECT "userId" FROM "TeamMember" WHERE "teamId" = $1`, teamId)).map((x) => String(x.userId));
  const sqlTeamTarget = async (sys: string, teamId: string, key: string) => {
    const own = await q(`SELECT "targetSatang" AS v FROM "CrmQuota" WHERE "systemId" = $1 AND "ownerType" = 'TEAM' AND "ownerId" = $2 AND "periodKey" = $3`, sys, teamId, key);
    if (own.length) return Number(own[0].v);
    const [s] = await q(`SELECT count(*)::int AS n, COALESCE(sum("targetSatang"),0)::bigint AS v FROM "CrmQuota" WHERE "systemId" = $1 AND "ownerType" = 'USER' AND "periodKey" = $2 AND "ownerId" = ANY($3::text[])`, sys, key, await membersOfTeam(teamId));
    return Number(s.n) > 0 ? Number(s.v) : null;
  };
  // ORACLE-EDIT C3.2 SF-4 (26 ก.ย. · ruling: achievement basis = progress basis) ▸ per-row achievedSatang (basis) · optional owner/pipeline filters (the KPI-3 sums reuse these rows)
  type BoardRow = { userId: string; wonSatang: number; wonCount: number; achievedSatang: number; targetSatang: number | null; pct: number | null; openDeals: number };
  const sqlBoard = async (tid: string, sys: string, s: Scope, key: string, f: { owner?: string; pipelineId?: string } = {}): Promise<BoardRow[]> => {
    let users: string[];
    const pipeSql = (a: string, p: unknown[]) => (f.pipelineId ? (p.push(f.pipelineId), ` AND ${a}."pipelineId" = $${p.length}`) : "");
    if (s.kind === "ALL") {
      const pu: unknown[] = [sys, key, tid];
      const pw = pipeSql("d", pu);
      users = (await q(`SELECT DISTINCT x.u FROM (SELECT d."ownerUserId" AS u FROM "CrmDeal" d WHERE d."systemId" = $1 AND d."archivedAt" IS NULL AND d."ownerUserId" IS NOT NULL${pw}
          UNION SELECT qq."ownerId" FROM "CrmQuota" qq WHERE qq."systemId" = $1 AND qq."ownerType" = 'USER' AND qq."periodKey" = $2) x
        WHERE EXISTS (SELECT 1 FROM "Membership" m WHERE m."tenantId" = $3 AND m."userId" = x.u)`, ...pu)).map((x) => String(x.u));
    } else users = s.kind === "OWN" ? [s.me] : [...s.mates];
    if (f.owner) users = users.filter((u) => u === f.owner);
    const basis = await sqlBasis(sys);
    const r = rangeOf(key);
    const rows: BoardRow[] = [];
    for (const u of users) {
      const p: unknown[] = [sys];
      const w = `d."systemId" = $1 AND d."archivedAt" IS NULL AND ${scopeSql("d", s, p)}${pipeSql("d", p)}`;
      p.push(u);
      const ui = p.length;
      p.push(tid, ts(r.from), ts(r.to));
      const [won] = await q(`${LAST(ui + 1)} SELECT count(*)::int AS n, COALESCE(sum(d."valueSatang"),0)::bigint AS v FROM "CrmDeal" d JOIN last l ON l."dealId" = d."id" AND l."kind" = d."kind"
        WHERE ${w} AND d."ownerUserId" = $${ui} AND d."kind" = 'WON' AND l.at >= $${ui + 2}::timestamp AND l.at < $${ui + 3}::timestamp`, ...p);
      const po: unknown[] = [sys];
      const wo = `d."systemId" = $1 AND d."archivedAt" IS NULL AND ${scopeSql("d", s, po)}${pipeSql("d", po)}`;
      po.push(u);
      const [open] = await q(`SELECT count(*)::int AS n FROM "CrmDeal" d WHERE ${wo} AND d."ownerUserId" = $${po.length} AND d."kind" = 'OPEN'`, ...po);
      const tq = await q(`SELECT "targetSatang" AS v FROM "CrmQuota" WHERE "systemId" = $1 AND "ownerType" = 'USER' AND "ownerId" = $2 AND "periodKey" = $3`, sys, u, key);
      const target = tq.length ? Number(tq[0].v) : null;
      const pp: unknown[] = [sys, ts(r.from), ts(r.to), u];
      const [paid] = await q(`SELECT COALESCE(sum(p."satang"),0)::bigint AS v FROM "CrmDealPayment" p JOIN "CrmDeal" d ON d."id" = p."dealId"
        WHERE p."systemId" = $1 AND p."status" = 'COUNTED' AND p."countedAt" >= $2::timestamp AND p."countedAt" < $3::timestamp AND d."archivedAt" IS NULL
          AND d."ownerUserId" = $4${pipeSql("d", pp)}`, ...pp);
      const achieved = basis === "PAID" ? Number(paid.v) : Number(won.v);
      rows.push({ userId: u, wonSatang: Number(won.v), wonCount: Number(won.n), achievedSatang: achieved, targetSatang: target, pct: target && target > 0 ? Math.floor((achieved * 100) / target) : null, openDeals: Number(open.n) });
    }
    return rows.sort((a, b) => b.wonSatang - a.wonSatang || (b.pct ?? -1) - (a.pct ?? -1) || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  };
  // ◂ ORACLE-EDIT C3.2 SF-4
  const sqlSources = async (sys: string, s: Scope, key: string) => {
    const r = rangeOf(key);
    const p: unknown[] = [sys];
    const w = `c."systemId" = $1 AND c."archivedAt" IS NULL AND c."mergedIntoId" IS NULL AND ${scopeSql("c", s, p)}`;
    p.push(ts(r.from), ts(r.to));
    return (await q(`SELECT COALESCE(c."sourceKind"::text, 'OTHER') AS k, count(*)::int AS n FROM "CrmContact" c WHERE ${w} AND c."createdAt" >= $${p.length - 1}::timestamp AND c."createdAt" < $${p.length}::timestamp
      GROUP BY 1 ORDER BY 2 DESC, 1 ASC`, ...p)).map((x) => `${x.k}:${Number(x.n)}`);
  };
  const sqlUnowned = async (tid: string, sys: string) => {
    const deals = (await q(`SELECT d."id" FROM "CrmDeal" d WHERE d."systemId" = $1 AND d."kind" = 'OPEN' AND d."archivedAt" IS NULL
      AND (d."ownerUserId" IS NULL OR NOT EXISTS (SELECT 1 FROM "Membership" m WHERE m."tenantId" = $2 AND m."userId" = d."ownerUserId"))`, sys, tid)).map((x) => String(x.id)).sort();
    const contacts = (await q(`SELECT c."id" FROM "CrmContact" c WHERE c."systemId" = $1 AND c."archivedAt" IS NULL AND c."mergedIntoId" IS NULL
      AND (c."ownerUserId" IS NULL OR NOT EXISTS (SELECT 1 FROM "Membership" m WHERE m."tenantId" = $2 AND m."userId" = c."ownerUserId"))`, sys, tid)).map((x) => String(x.id)).sort();
    return { deals, contacts };
  };
  const kOf = (v: Any): Kpi | null => (v ? {
    open: [n(v.openPipeline?.count), n(v.openPipeline?.valueSatang)],
    weighted: n(v.weighted?.valueSatang),
    won: [n(v.won?.count), n(v.won?.valueSatang), nn(v.won?.targetSatang), nn(v.won?.pct), String(v.won?.basis), n(v.won?.achievedSatang)], // ORACLE-EDIT C3.2 SF-4
    win: [nn(v.winRate?.pct), nn(v.winRate?.prevPct), nn(v.winRate?.deltaPts)],
    stale: [n(v.stale?.count), n(v.stale?.valueSatang)],
    hot: n(v.hotLeads?.count),
  } : null);
  const bOf = (v: Any): BoardRow[] => ((v?.rows ?? []) as Any[]).map((r) => ({ userId: String(r.userId), wonSatang: n(r.wonSatang), wonCount: n(r.wonCount), achievedSatang: n(r.achievedSatang), targetSatang: nn(r.targetSatang), pct: nn(r.pct), openDeals: n(r.openDeals) }));
  const srcOf = (v: Any): string[] => ((v?.items ?? []) as Any[]).map((x) => `${String(x.sourceKind)}:${Number(x.count)}`);

  const S_ALL: Scope = { kind: "ALL" };
  const S_TH: Scope = { kind: "OWN", me: uTH };
  const S_NK: Scope = { kind: "TEAM", me: uNK, teamIds: [teamK], mates: [uNK, uKT] };
  const keyO = await sqlKpis(tidA, crmA, S_ALL, { key: PK, hot: 70 });
  const keyTH = await sqlKpis(tidA, crmA, S_TH, { key: PK, hot: 70 });
  const keyNK = await sqlKpis(tidA, crmA, S_NK, { key: PK, hot: 70 });
  const progTH = await sqlProgress(tidA, crmA, [uTH], PK);

  console.log("\n── K · answer-key control ──");
  {
    const HAND_O: Kpi = { open: [10, 14_300_000], weighted: 6_790_000, won: [5, 11_700_000, 14_000_000, 40, "PAID", 5_700_000], /* ORACLE-EDIT C3.2 SF-4: was 83 (won-based) */ win: [63, 67, -4], stale: [3, 5_500_000], hot: 3 };
    const HAND_TH: Kpi = { open: [3, 3_600_000], weighted: 1_800_000, won: [3, 7_200_000, 6_000_000, 70, "PAID", 4_200_000], /* ORACLE-EDIT C3.2 SF-4: was 120 */ win: [75, 100, -25], stale: [1, 1_000_000], hot: 1 };
    const HAND_NK: Kpi = { open: [3, 5_100_000], weighted: 2_220_000, won: [1, 1_200_000, 3_000_000, 0, "PAID", 0], /* ORACLE-EDIT C3.2 SF-4: was 40 */ win: [50, 50, 0], stale: [2, 4_500_000], hot: 1 };
    const HAND_P = { won: 7_200_000, deals: 3, paid: 4_200_000, activities: 3 };
    chk("C3.2-K.1", "[control] the oracle's independent SQL answer key reproduces the hand-computed fixture (owner / thana / nok KPIs + thana's Sep progress) — if this is red the fixture or the SQL is wrong, not the product",
      j(keyO) === j(HAND_O) && j(keyTH) === j(HAND_TH) && j(keyNK) === j(HAND_NK) && j(progTH) === j(HAND_P),
      "SQL = hand", `owner=${j(keyO)} thana=${j(keyTH)} nok=${j(keyNK)} progress=${j(progTH)}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — progress vs the ledgers (thana · Sep 2026) — 5
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S1 · progress vs ledgers ──");
  const cA = (uid: string) => ctx(tidA, crmA, uid);
  const prTH = await call(progressF, cA(uO), aO, { ownerType: "USER", ownerId: uTH, periodKey: PK });
  const pv = prTH.v ?? {};
  chk("C3.2-S1.1", "progress.won = Σ valueSatang of thana's WON, non-archived deals whose LATEST WON history row falls in the Thai month (1 Sep 00:30 Thai in · 31 Aug 23:30 Thai out · won-reopened-won counts at its last win even with a stale closedAt · reopened deal out · archived out) = SQL",
    prTH.ok && n(pv.won) === progTH.won, `${progTH.won}`, `${rs(prTH)}${ABSENT}`);
  chk("C3.2-S1.2", "progress.paid = Σ CrmDealPayment COUNTED with countedAt in the Thai month on thana's non-archived deals (30 Sep 23:59 Thai in · 1 Oct 00:01 Thai out · REVERSED / LINKED out · a deposit on an OPEN deal in · archived deal out) = SQL",
    prTH.ok && n(pv.paid) === progTH.paid, `${progTH.paid}`, `${rs(prTH)}${ABSENT}`);
  chk("C3.2-S1.3", "progress.deals = the number of those WON deals = SQL (and targetDeals is echoed from the quota row)",
    prTH.ok && n(pv.deals) === progTH.deals && nn(pv.targetDeals) === 4, `${progTH.deals} · targetDeals 4`, `${rs(prTH)}${ABSENT}`);
  chk("C3.2-S1.4", "progress.activities = CrmActivity done in the Thai month by thana, type ∉ {NOTE, WEB, PORTAL} (open task out · 31 Aug 23:50 Thai out · pook's out) = SQL (targetActivities echoed)",
    prTH.ok && n(pv.activities) === progTH.activities && nn(pv.targetActivities) === 5, `${progTH.activities} · targetActivities 5`, `${rs(prTH)}${ABSENT}`);
  {
    const tP = await sqlTeamTarget(crmA, teamP, PK);
    const tK = await sqlTeamTarget(crmA, teamK, PK);
    const gP = await sqlProgress(tidA, crmA, await membersOfTeam(teamP), PK);
    const gK = await sqlProgress(tidA, crmA, await membersOfTeam(teamK), PK);
    const pctOf = (a: number, t: number | null) => (t && t > 0 ? Math.floor((a * 100) / t) : null);
    const prP = await call(progressF, cA(uO), aO, { ownerType: "TEAM", ownerId: teamP, periodKey: PK });
    const prK = await call(progressF, cA(uO), aO, { ownerType: "TEAM", ownerId: teamK, periodKey: PK });
    await setCrm(crmA, { commission: { basis: "WON", approvalRequired: true, payrollLink: true } });
    const prW = await call(progressF, cA(uO), aO, { ownerType: "USER", ownerId: uTH, periodKey: PK });
    await setCrm(crmA, { commission: { basis: "PAID", approvalRequired: true, payrollLink: true } });
    const okUser = prTH.ok && nn(pv.targetSatang) === 6_000_000 && nn(pv.pct) === pctOf(progTH.paid, 6_000_000) && String(pv.basis) === "PAID";
    const okTeam = prP.ok && n(prP.v?.won) === gP.won && n(prP.v?.paid) === gP.paid && nn(prP.v?.targetSatang) === tP && nn(prP.v?.pct) === pctOf(gP.paid, tP)
      && prK.ok && n(prK.v?.won) === gK.won && nn(prK.v?.targetSatang) === tK && nn(prK.v?.pct) === pctOf(gK.paid, tK);
    const okWon = prW.ok && nn(prW.v?.pct) === pctOf(progTH.won, 6_000_000) && String(prW.v?.basis) === "WON";
    chk("C3.2-S1.5", `pct = floor(achieved × 100 / target) with achieved = paid under the default commission basis PAID (thana ${pctOf(progTH.paid, 6_000_000)} %) and = won once settings.crm.commission.basis is WON (${pctOf(progTH.won, 6_000_000)} %) · TEAM progress = Σ over the team's CURRENT members, target = the team's own row (K ${tK}) else Σ members' USER targets (P ${tP})`,
      okUser && okTeam && okWon, "user · team · basis", `user=${okUser} ${rs(prTH)} · teamP=${rs(prP)} (exp won ${gP.won} paid ${gP.paid} target ${tP}) · teamK=${rs(prK)} (exp won ${gK.won} target ${tK}) · WON-basis=${rs(prW)}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — the 6 KPIs (owner) vs the answer key — 6
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3 · 6 KPIs ──");
  const kO = await call(kpisF, cA(uO), aO, { now: NOW });
  const kv = kOf(kO.v);
  const kO2 = await call(kpisF, cA(uO), aO, { now: NOW, pipelineId: p2.id });
  const key2 = await sqlKpis(tidA, crmA, S_ALL, { key: PK, pipelineId: p2.id, hot: 70 });
  const kOpk = await call(kpisF, cA(uO), aO, { now: NOW, ownerUserId: uPK });
  const keyPK = await sqlKpis(tidA, crmA, S_ALL, { key: PK, owner: uPK, hot: 70 });
  const kOth = await call(kpisF, cA(uO), aO, { now: NOW, ownerUserId: uTH });
  const keyOTH = await sqlKpis(tidA, crmA, S_ALL, { key: PK, owner: uTH, hot: 70 });
  const kAug = await call(kpisF, cA(uO), aO, { now: NOW, periodKey: "2026-08" });
  const keyAug = await sqlKpis(tidA, crmA, S_ALL, { key: "2026-08", hot: 70 });
  const kv2 = kOf(kO2.v);
  const kvpk = kOf(kOpk.v);
  const kvth = kOf(kOth.v);
  const kvaug = kOf(kAug.v);
  chk("C3.2-S3.1", "KPI 1 \"pipeline เปิด\" = count + Σ valueSatang of visible OPEN, non-archived deals — and it follows the pipeline filter and the owner filter (= SQL each)",
    kO.ok && j(kv?.open) === j(keyO.open) && j(kv2?.open) === j(key2.open) && j(kvpk?.open) === j(keyPK.open) && String(kO.v?.periodKey) === PK,
    `${j(keyO.open)} · p2 ${j(key2.open)} · pook ${j(keyPK.open)}`, `${j(kv?.open)} · ${j(kv2?.open)} · ${j(kvpk?.open)} ${kO.ok ? `period=${kO.v?.periodKey}` : kO.err}${ABSENT}`);
  chk("C3.2-S3.2", "KPI 2 \"ถ่วงน้ำหนัก\" = Σ valueSatang × COALESCE(probabilityOverride, stage.probability) / 100 over the same OPEN deals (override wins over the stage) — all + pipeline filter (= SQL)",
    kO.ok && kv?.weighted === keyO.weighted && kv2?.weighted === key2.weighted, `${keyO.weighted} · p2 ${key2.weighted}`, `${kv?.weighted} · ${kv2?.weighted}${ABSENT}`);
  chk("C3.2-S3.3", "KPI 3 \"ชนะเดือนนี้ vs โควตา\" = count + Σ value of deals WON in the Thai month (latest WON history row) · target = Σ USER quotas of the leaderboard users · pct = floor(achieved×100/target) with achieved on the progress() basis (PAID default ⇒ COUNTED payments of those users in the window · ORACLE-EDIT C3.2 SF-4) · basis + achievedSatang in the DTO — Sep and with periodKey 2026-08 (= SQL)",
    kO.ok && j(kv?.won) === j(keyO.won) && kAug.ok && j(kvaug?.won) === j(keyAug.won), `${j(keyO.won)} · Aug ${j(keyAug.won)}`, `${j(kv?.won)} · ${j(kvaug?.won)}${ABSENT}`);
  chk("C3.2-S3.4", "KPI 4 \"อัตราชนะ\" = round-half-up(won × 100 / (won + lost)) over deals closed in the Thai month (latest history row into their current WON/LOST stage) · prevPct = the previous Thai month · deltaPts = pct − prevPct (= SQL: 63 · 67 · −4)",
    kO.ok && j(kv?.win) === j(keyO.win), j(keyO.win), `${j(kv?.win)}${ABSENT}`);
  chk("C3.2-S3.5", "KPI 5 \"ดีลนิ่ง\" = count + Σ value of visible OPEN, non-archived deals with stalledAt set (same set as the C2.10 \"ดีลที่ต้องดู\" card, uncapped) — all + owner filter (= SQL)",
    kO.ok && j(kv?.stale) === j(keyO.stale) && j(kvth?.stale) === j(keyOTH.stale), `${j(keyO.stale)} · thana ${j(keyOTH.stale)}`, `${j(kv?.stale)} · ${j(kvth?.stale)}${ABSENT}`);
  chk("C3.2-S3.6", "KPI 6 \"lead ร้อน\" = visible contacts (not archived, not merged) with score ≥ settings.crm.scoring.hot (70 here — a stale band never decides) · threshold echoed · owner filter (= SQL)",
    kO.ok && kv?.hot === keyO.hot && n(kO.v?.hotLeads?.threshold) === 70 && kvth?.hot === keyOTH.hot, `${keyO.hot} · threshold 70 · thana ${keyOTH.hot}`, `${kv?.hot} · ${String(kO.v?.hotLeads?.threshold)} · ${kvth?.hot}${ABSENT}`);

  // ═════════════════════════════════════════════════════════════════════════════
  // S6.4 / S6.5 — leaderboard + lead sources (owner) · X1.1 / X1.2 / X1.3 — visibility
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S6.4–S6.5 · leaderboard + lead sources · X1 visibility ──");
  const boardO = await sqlBoard(tidA, crmA, S_ALL, PK);
  const lbO = await call(boardF, cA(uO), aO, { now: NOW });
  chk("C3.2-S6.4", `leaderboard (owner, Sep): one row per tenant member who owns a visible deal or holds a USER quota (the non-member owner and the "no owner" deal are out) · wonSatang/wonCount/openDeals over visible deals · targetSatang = USER quota · achievedSatang + pct = floor(achieved×100/target) on the progress() basis (ORACLE-EDIT C3.2 SF-4) · leaderboard.basis echoed · ordered wonSatang desc, pct desc (null last), userId asc (= SQL, ${boardO.length} rows)`,
    lbO.ok && j(bOf(lbO.v)) === j(boardO) && String(lbO.v?.basis) === "PAID", j(boardO.map((r) => [r.wonSatang, r.achievedSatang, r.pct, r.openDeals])), `${lbO.ok ? `${j(bOf(lbO.v).map((r) => [r.wonSatang, r.achievedSatang, r.pct, r.openDeals]))} basis=${String(lbO.v?.basis)}` : lbO.err}${ABSENT}`);
  const srcO = await sqlSources(crmA, S_ALL, PK);
  const lsO = await call(sourcesF, cA(uO), aO, { now: NOW });
  chk("C3.2-S6.5", "lead sources (owner, Sep): contacts CREATED in the Thai month (1 Sep 00:05 Thai in · 31 Aug 23:55 Thai out · merged/archived out) grouped by sourceKind (null → OTHER), ordered count desc then key asc (= SQL)",
    lsO.ok && j(srcOf(lsO.v)) === j(srcO), j(srcO), `${lsO.ok ? j(srcOf(lsO.v)) : lsO.err}${ABSENT}`);
  {
    const k = await call(kpisF, cA(uTH), aTH, { now: NOW });
    const b = await call(boardF, cA(uTH), aTH, { now: NOW });
    const s = await call(sourcesF, cA(uTH), aTH, { now: NOW });
    const eb = await sqlBoard(tidA, crmA, S_TH, PK);
    const es = await sqlSources(crmA, S_TH, PK);
    chk("C3.2-X1.1", "thana (STAFF · REPORT level OWN by default) sees ONLY his own numbers: the 6 KPIs = SQL over his own rows (pook's team deals, Krabi deals and the team-K deal owned by pook are out) · leaderboard = his row only · lead sources = his contacts only",
      k.ok && j(kOf(k.v)) === j(keyTH) && b.ok && j(bOf(b.v)) === j(eb) && s.ok && j(srcOf(s.v)) === j(es),
      `${j(keyTH)} · ${eb.length} row · ${j(es)}`, `${k.ok ? j(kOf(k.v)) : k.err} · ${b.ok ? bOf(b.v).length : b.err} · ${s.ok ? j(srcOf(s.v)) : s.err}${ABSENT}`);
  }
  {
    const k = await call(kpisF, cA(uNK), aNK, { now: NOW });
    const b = await call(boardF, cA(uNK), aNK, { now: NOW });
    const s = await call(sourcesF, cA(uNK), aNK, { now: NOW });
    const eb = await sqlBoard(tidA, crmA, S_NK, PK);
    const es = await sqlSources(crmA, S_NK, PK);
    const noPhuket = b.ok && !bOf(b.v).some((r) => [uTH, uPK, uM].includes(r.userId));
    chk("C3.2-X1.2", "nok (STAFF · lead of team K ⇒ at least TEAM) sees team K: the 6 KPIs = SQL over (owner ∈ K members OR teamId = K) — the team-K deal owned by pook counts, nothing of team P · leaderboard = K members only (no Phuket user) · lead sources = team K contacts",
      k.ok && j(kOf(k.v)) === j(keyNK) && b.ok && j(bOf(b.v)) === j(eb) && noPhuket && s.ok && j(srcOf(s.v)) === j(es),
      `${j(keyNK)} · ${eb.length} rows · ${j(es)}`, `${k.ok ? j(kOf(k.v)) : k.err} · ${b.ok ? j(bOf(b.v).map((r) => r.userId === uNK ? "nok" : r.userId === uKT ? "kata" : "OTHER")) : b.err} · ${s.ok ? j(srcOf(s.v)) : s.err}${ABSENT}`);
  }
  {
    const before = (await P.auditLog.count({ where: { tenantId: tidA } })) as number;
    const k = await call(kpisF, cA(uSAM), aSAM, { now: NOW });
    const b = await call(boardF, cA(uSAM), aSAM, { now: NOW });
    const s = await call(sourcesF, cA(uSAM), aSAM, { now: NOW });
    const hd = await call(homeDataF, cA(uSAM), aSAM, { now: NOW });
    const after = (await P.auditLog.count({ where: { tenantId: tidA } })) as number;
    const ok = (r: Res) => isFB(r) || isNF(r);
    chk("C3.2-X1.3", "a STAFF without `crm.report.view` (he still has deal/contact read) gets a Thai FORBIDDEN/NOT_FOUND from kpis · leaderboard · leadSources · homeData — no number leaks through an error, nothing is written",
      ok(k) && ok(b) && ok(s) && ok(hd) && before === after, "4 refusals", `kpis=${rs(k)} board=${rs(b)} sources=${rs(s)} home=${rs(hd)} audit+${after - before}${ABSENT}`);
  }

  // ORACLE-EDIT C3.2 SF-4 (26 ก.ย. · ruling: achievement basis = progress basis) ▸ S6.6 — one truth for "achievement": home KPI-3 = progress() = leaderboard row, under BOTH bases
  {
    const basis0 = await sqlBasis(crmA);
    const out: string[] = [];
    let ok = true;
    for (const basis of ["PAID", "WON"] as const) {
      await setCrm(crmA, { commission: { basis, approvalRequired: true, payrollLink: true } }); // no settings writer for commission.basis in crm/settings.ts ⇒ the fixture's jsonb_set
      const lb = await call(boardF, cA(uO), aO, { now: NOW });
      for (const u of [uTH, uPK]) {
        const k = await call(kpisF, cA(uO), aO, { now: NOW, ownerUserId: u });
        const pr = await call(progressF, cA(uO), aO, { ownerType: "USER", ownerId: u, periodKey: PK });
        const row = lb.ok ? ((lb.v?.rows ?? []) as Any[]).find((r) => r.userId === u) : null;
        const exp = (await sqlBoard(tidA, crmA, S_ALL, PK, { owner: u }))[0];
        const vals = [nn(k.v?.won?.pct), nn(pr.v?.pct), nn(row?.pct), exp?.pct ?? null];
        const good = k.ok && pr.ok && lb.ok && vals.every((x) => x === vals[3]) && String(k.v?.won?.basis) === basis && String(pr.v?.basis) === basis && String(lb.v?.basis) === basis
          && n(k.v?.won?.achievedSatang) === exp?.achievedSatang && n(row?.achievedSatang) === exp?.achievedSatang;
        ok = ok && good;
        out.push(`${basis}/${u === uTH ? "thana" : "pook"}=${j(vals)}${good ? "" : ` k=${k.ok ? j(k.v?.won) : k.err} pr=${rs(pr)}`}`);
      }
    }
    await setCrm(crmA, { commission: { basis: basis0, approvalRequired: true, payrollLink: true } });
    const restored = (await sqlBasis(crmA)) === basis0;
    chk("C3.2-S6.6", "SF-4 one truth: for the same user (thana 70→120 · pook 30→66) home KPI-3 pct (ownerUserId filter) = progress(USER).pct = his leaderboard row pct = the oracle's SQL, under commission.basis PAID and again under WON (basis + achievedSatang echoed by all three) — basis restored afterwards",
      ok && restored, "4 × equal", `${out.join(" · ")} restored=${restored}${ABSENT}`);
  }
  // ◂ ORACLE-EDIT C3.2 SF-4

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 — visual owner / thana (static UI contract + the render data of the two personas) — 4 · pixel parity = gate D7
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S5 · UI (mockup 01 · 10) ──");
  let inv: Any[] = [];
  try { inv = (JSON.parse(read(INVENTORY)).rows ?? []) as Any[]; } catch { inv = []; }
  {
    const files = [HOME_FILE, ...walk(HOME_COMP_DIR)];
    const src = files.map(read).join("\n");
    const need = ["crm-home-kpi-open", "crm-home-kpi-weighted", "crm-home-kpi-won", "crm-home-kpi-winrate", "crm-home-kpi-stale", "crm-home-kpi-hot",
      "crm-home-leaderboard", "crm-home-leaderboard-row-", "crm-home-sources", "crm-home-source-row-", "crm-home-filter-pipeline", "crm-home-filter-owner",
      "crm-home-filter-range", "crm-home-saved-view", "crm-home-ai-risk", "crm-home-ai-draft", "crm-home-ai-summary", "crm-home-unowned", "crm-home-stale-list"];
    const miss = need.filter((t) => !src.includes(t));
    // ORACLE-EDIT C3.2-S5.1 (sweep 27 Sep, C4.1 registry policy · controller ruling): C4.1 moved the home rows' registry page from "/" to
    //   the canonical "/app/sys/[id]" ⇒ accept either value · threshold ≥ 12 and wo C3.2 unchanged
    const rows = inv.filter((r) => r?.wo === "C3.2" && ["/", "/app/sys/[id]"].includes(String(r?.page ?? "")));
    chk("C3.2-S5.1", "mockup 01: the home page (crm/home.tsx + components/crm/home/**) renders the 6 KPI tiles, the leaderboard, lead sources, pipeline/owner/range filters + saved-view picker, the 3 AI buttons (wired in C3.4), the MANAGER \"no owner\" block, and keeps C2.10's \"ดีลที่ต้องดู\" — every testid present + ≥ 12 inventory rows (page \"/\", wo C3.2) [static]",
      miss.length === 0 && rows.length >= 12, "19 testids · ≥ 12 rows", `missing=${miss.join(",") || "-"} rows=${rows.length}${ABSENT}`, "MAJOR");
  }
  {
    const page = read(QUOTA_PAGE);
    const src = [page, ...walk(QUOTA_PAGE_DIR), ...walk(QUOTA_COMP_DIR)].map(read).join("\n");
    const need = ["crm-quota-table", "crm-quota-row-", "crm-quota-period", "crm-quota-target-", "crm-quota-save"];
    const miss = need.filter((t) => !src.includes(t));
    const nav = read(NAV_FILE);
    const rows = inv.filter((r) => r?.wo === "C3.2" && String(r?.page ?? "") === "/settings/quotas");
    chk("C3.2-S5.2", "mockup 10 (right, \"โควตารายเดือน\"): `/crm/settings/quotas` is guarded like every CRM v2 page (type \"CRM\" → requireCrmV2Page → crmCan(… \"crm.quota.manage\") → notFound()), has a nav entry (status ready · wo C3.2), the quota testids and ≥ 5 inventory rows [static]",
      page.length > 0 && /type:\s*"CRM"/.test(page) && /requireCrmV2Page/.test(page) && /crm\.quota\.manage/.test(page) && /notFound\(/.test(page)
      && /path:\s*"\/crm\/settings\/quotas"[^}]*status:\s*"ready"[^}]*wo:\s*"C3\.2"/.test(nav) && miss.length === 0 && rows.length >= 5,
      "guarded page · nav · testids · ≥ 5 rows", `page=${page.length > 0} guard=${/requireCrmV2Page/.test(page)} perm=${/crm\.quota\.manage/.test(page)} nav=${/\/crm\/settings\/quotas/.test(nav)} missing=${miss.join(",") || "-"} rows=${rows.length}${ABSENT}`, "MAJOR");
  }
  {
    const home = read(HOME_FILE);
    const hO = await call(homeDataF, cA(uO), aO, { now: NOW });
    const hT = await call(homeDataF, cA(uTH), aTH, { now: NOW });
    const hM = await call(homeDataF, cA(uM), aM, { now: NOW });
    const ebT = await sqlBoard(tidA, crmA, S_TH, PK);
    const okO = hO.ok && j(kOf(hO.v?.kpis)) === j(keyO) && j(bOf(hO.v?.leaderboard)) === j(boardO) && hO.v?.unowned !== null && hO.v?.unowned !== undefined;
    const okT = hT.ok && j(kOf(hT.v?.kpis)) === j(keyTH) && j(bOf(hT.v?.leaderboard)) === j(ebT) && (hT.v?.unowned === null || hT.v?.unowned === undefined);
    const okM = hM.ok && hM.v?.unowned !== null && hM.v?.unowned !== undefined;
    chk("C3.2-S5.3", "the two personas the controller photographs get the right data: homeData(owner) = the owner answer key (KPIs + full leaderboard + \"no owner\" block) · homeData(thana) = thana's own KPIs + a one-row leaderboard + NO \"no owner\" block · MANAGER gets the block · home.tsx loads it through homeData with the session actor (no second computation in the component)",
      okO && okT && okM && /homeData\s*\(/.test(home), "owner · thana · manager · wired", `owner=${okO} ${hO.ok ? "" : hO.err} thana=${okT} ${hT.ok ? "" : hT.err} manager=${okM} wired=${/homeData\s*\(/.test(home)}${ABSENT}`, "MAJOR");
    const dto = j(hO.v ?? null) + j(hT.v ?? null);
    const leak = PII.filter((x) => /^08\d{8}$/.test(x) || x.includes("@")).filter((x) => dto.includes(x));
    const files = [...walk(HOME_COMP_DIR), ...walk(QUOTA_PAGE_DIR), ...walk(QUOTA_COMP_DIR)];
    const isClient = (f: string) => /^\s*["']use client["']/.test(read(f));
    const isServer = (f: string) => /^\s*["']use server["']/.test(read(f));
    const badClient = files.filter(isClient).filter((f) => /from\s+["'](@\/lib\/core\/db|@prisma\/client|@\/lib\/modules\/crm(\/(?!.*-shared)[^"']*)?)["']/.test(read(f)));
    const serverBad = [...files, ...walk("src/lib/modules/crm")].filter(isServer).filter((f) => /quota|home|view/i.test(f)).filter((f) => /export\s+(type|interface|const|let|function\s)/.test(read(f)) || !/assertCrmV2|crmUiVersion/.test(read(f)));
    chk("C3.2-S5.4", "the home DTO carries no customer phone / e-mail (names of deals/users only) · no `'use client'` file of this work order imports prisma or a non-shared CRM module · every `\"use server\"` file of it exports async functions only and calls assertCrmV2 [static + runtime]",
      hO.ok && leak.length === 0 && badClient.length === 0 && serverBad.length === 0, "no PII · clean", `dto=${hO.ok} leaks=${leak.length} badClient=${badClient.join(",") || "-"} serverBad=${serverBad.join(",") || "-"}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — saved views objectKey contact / company / deal (real team scope) — 3 · X1.6 team-only + member views unchanged
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S4 · saved views ──");
  const CT = await import("@/lib/modules/crm/contacts" as string).catch(() => ({})) as Any;
  const CO = await import("@/lib/modules/crm/companies" as string).catch(() => ({})) as Any;
  const DL = await import("@/lib/modules/crm/deals" as string).catch(() => ({})) as Any;
  const viewIds = (r: Res) => (r.ok ? ((r.v ?? []) as Any[]).map((x) => String(x?.id)) : []);
  {
    const cv = await call(createViewF, cA(uKT), aKT, { objectKey: "contact", name: `ลูกค้าของกมล ${TAG}`, scope: "TEAM", teamId: teamK, filters: { owner: uKT, bogus: "x" } });
    const id = String(cv.v?.id ?? "-");
    const row = (await P.memberSavedView.findFirst({ where: { id } })) as Any;
    const viaView = await call(CT.listContacts, cA(uNK), aNK, { savedViewId: id, pageSize: 100 });
    const explicit = await call(CT.listContacts, cA(uNK), aNK, { owner: uKT, pageSize: 100 });
    const lvNK = await call(listViewsF, cA(uNK), aNK, "contact");
    const lvTH = await call(listViewsF, cA(uTH), aTH, "contact");
    const thUse = await call(CT.listContacts, cA(uTH), aTH, { savedViewId: id, pageSize: 100 });
    const pv2 = await call(createViewF, cA(uTH), aTH, { objectKey: "contact", name: `ส่วนตัว ${TAG}`, scope: "PRIVATE", filters: { owner: uTH } });
    const lvPK = await call(listViewsF, cA(uPK), aPK, "contact");
    const lvTH2 = await call(listViewsF, cA(uTH), aTH, "contact");
    const stored = row && row.objectKey === "contact" && row.teamId === teamK && row.scope === "TEAM" && row.filters?.owner === uKT && !("bogus" in (row.filters ?? {}));
    chk("C3.2-S4.1", "contact views: kata saves a TEAM(K) view → stored with objectKey \"contact\" + teamId K + whitelisted filters (unknown key dropped) · nok lists it and listContacts({savedViewId}) = listContacts(with the same filters) (non-empty) · thana (team P) neither lists nor can use it (NOT_FOUND) · a PRIVATE view is listed only for its owner",
      cv.ok && stored && viaView.ok && explicit.ok && idsOf(viaView.v).length > 0 && same(idsOf(viaView.v), idsOf(explicit.v)) && viewIds(lvNK).includes(id) && lvTH.ok && !viewIds(lvTH).includes(id)
      && isNF(thUse) && pv2.ok && viewIds(lvTH2).includes(String(pv2.v?.id)) && lvPK.ok && !viewIds(lvPK).includes(String(pv2.v?.id)),
      "stored · applied · team-only · private", `create=${rs(cv)} stored=${!!stored} via=${viaView.ok ? idsOf(viaView.v).length : viaView.err} explicit=${explicit.ok ? idsOf(explicit.v).length : explicit.err} nokLists=${viewIds(lvNK).includes(id)} thanaLists=${viewIds(lvTH).includes(id)} thanaUse=${rs(thUse)} private=${rs(pv2)}${ABSENT}`);
  }
  {
    const cv = await call(createViewF, cA(uNK), aNK, { objectKey: "company", name: `บริษัทดำน้ำ ${TAG}`, scope: "TEAM", teamId: teamK, filters: { industry: "ดำน้ำ" } });
    const id = String(cv.v?.id ?? "-");
    const viaView = await call(CO.listCompanies, cA(uKT), aKT, { savedViewId: id, pageSize: 100 });
    const explicit = await call(CO.listCompanies, cA(uKT), aKT, { industry: "ดำน้ำ", pageSize: 100 });
    const thUse = await call(CO.listCompanies, cA(uTH), aTH, { savedViewId: id, pageSize: 100 });
    const lvKTco = await call(listViewsF, cA(uKT), aKT, "company");
    const lvKTct = await call(listViewsF, cA(uKT), aKT, "contact");
    chk("C3.2-S4.2", "company views: nok's TEAM(K) view {industry} → listCompanies({savedViewId}) for kata = listCompanies(with the same filter) (non-empty) · thana ⇒ NOT_FOUND · the view is listed under objectKey company and NOT under contact",
      cv.ok && viaView.ok && explicit.ok && idsOf(viaView.v).length > 0 && same(idsOf(viaView.v), idsOf(explicit.v)) && isNF(thUse) && viewIds(lvKTco).includes(id) && lvKTct.ok && !viewIds(lvKTct).includes(id),
      "applied · team-only · per objectKey", `create=${rs(cv)} via=${viaView.ok ? idsOf(viaView.v).length : viaView.err} explicit=${explicit.ok ? idsOf(explicit.v).length : explicit.err} thanaUse=${rs(thUse)} company=${viewIds(lvKTco).includes(id)} contact=${viewIds(lvKTct).includes(id)}${ABSENT}`);
  }
  let dealViewK = "-";
  {
    const cv = await call(createViewF, cA(uNK), aNK, { objectKey: "deal", name: `ดีลหน้าร้าน ${TAG}`, scope: "TEAM", teamId: teamK, filters: { pipelineId: p2.id } });
    dealViewK = String(cv.v?.id ?? "-");
    const viaView = await call(DL.listDeals, cA(uKT), aKT, { savedViewId: dealViewK, pageSize: 100 });
    const explicit = await call(DL.listDeals, cA(uKT), aKT, { pipelineId: p2.id, pageSize: 100 });
    const mUse = await call(DL.listDeals, cA(uM), aM, { savedViewId: dealViewK, pageSize: 100 });
    const lvM = await call(listViewsF, cA(uM), aM, "deal");
    chk("C3.2-S4.3", "deal views: nok's TEAM(K) view {pipelineId} → listDeals({savedViewId}) for kata = listDeals(with the same filter) (non-empty) · the MANAGER who leads team P (not a member of K) neither lists nor can use it (NOT_FOUND) — TEAM now means the real Team, not \"whole shop\"",
      cv.ok && viaView.ok && explicit.ok && idsOf(viaView.v).length > 0 && same(idsOf(viaView.v), idsOf(explicit.v)) && isNF(mUse) && lvM.ok && !viewIds(lvM).includes(dealViewK),
      "applied · team-only", `create=${rs(cv)} via=${viaView.ok ? idsOf(viaView.v).length : viaView.err} explicit=${explicit.ok ? idsOf(explicit.v).length : explicit.err} managerUse=${rs(mUse)} managerLists=${viewIds(lvM).includes(dealViewK)}${ABSENT}`);
  }
  {
    // member saved views (objectKey customer) — untouched; legacy CRM TEAM rows without teamId keep meaning "whole shop"
    const MV = (await import("@/lib/modules/member/views" as string).catch(() => ({}))) as Any;
    const mv = await call(MV.createSavedView, { tenantId: tidA, systemId: memA, actorUserId: uM }, aM, { name: `มุมมองสมาชิก ${TAG}`, scope: "TEAM", filters: { tier: "gold" } });
    const ml = await call(MV.listSavedViews, { tenantId: tidA, systemId: memA, actorUserId: uTH }, aTH);
    const mrow = (await P.memberSavedView.findFirst({ where: { id: String(mv.v?.id ?? "-") } })) as Any;
    const dtoKeys = ml.ok ? Object.keys(((ml.v ?? []) as Any[]).find((x) => x.id === mv.v?.id) ?? {}).sort().join(",") : "-";
    const memberOk = mv.ok && ml.ok && viewIds(ml).includes(String(mv.v?.id)) && dtoKeys === "columns,filters,id,name,ownerUserId,scope,sort" && mrow?.objectKey === "customer" && mrow?.teamId === null;
    const legacy = await P.memberSavedView.create({ data: { tenantId: tidA, systemId: crmA, ownerUserId: uM, scope: "TEAM", name: `ทั้งร้าน (เดิม) ${TAG}`, objectKey: "deal", filters: { pipelineId: p1.id } } });
    const lvTH = await call(listViewsF, cA(uTH), aTH, "deal");
    const lvKT = await call(listViewsF, cA(uKT), aKT, "deal");
    const useTH = await call(DL.listDeals, cA(uTH), aTH, { savedViewId: legacy.id, pageSize: 100 });
    const cust = await call(createViewF, cA(uO), aO, { objectKey: "customer", name: `ผิดชนิด ${TAG}`, scope: "PRIVATE", filters: {} });
    const onMember = await call(listViewsF, ctx(tidA, memA, uO), aO, "contact");
    const lvO = await call(listViewsF, cA(uO), aO, "contact");
    const delTH = await call(deleteViewF, cA(uTH), aTH, dealViewK);
    const stillThere = (await P.memberSavedView.count({ where: { id: dealViewK } })) as number;
    chk("C3.2-X1.6", "saved-view scope: a TEAM(K) view cannot be deleted by thana (NOT_FOUND, row kept) · member saved views are unchanged (TEAM = whole shop for members, same DTO keys, objectKey customer, teamId null) and never appear in CRM listViews · objectKey \"customer\" is refused by the CRM views API (VALIDATION) · a MEMBER system id is NOT_FOUND for it · a legacy CRM row (TEAM, teamId null) still means \"whole shop\" (listed + usable by thana and kata)",
      memberOk && viewIds(lvTH).includes(legacy.id) && viewIds(lvKT).includes(legacy.id) && useTH.ok && isVal(cust) && isNF(onMember) && lvO.ok && !viewIds(lvO).includes(String(mv.v?.id)) && isNF(delTH) && stillThere === 1,
      "scope rules", `member=${memberOk} (${rs(mv)} keys=${dtoKeys}) legacyTH=${viewIds(lvTH).includes(legacy.id)} legacyKT=${viewIds(lvKT).includes(legacy.id)} useTH=${useTH.ok ? "ok" : useTH.err} customer=${rs(cust)} memberSys=${rs(onMember)} delByThana=${rs(delTH)} kept=${stillThere}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S6.3 — "no owner" list (MANAGER) + bulk transfer (runs LAST on crmA: it moves two deals)
  // ═════════════════════════════════════════════════════════════════════════════
  {
    const exp = await sqlUnowned(tidA, crmA);
    const um = await call(unownedF, cA(uM), aM);
    const ut = await call(unownedF, cA(uTH), aTH);
    const got = { deals: ((um.v?.deals ?? []) as Any[]).map((x) => String(x.id)).sort(), contacts: ((um.v?.contacts ?? []) as Any[]).map((x) => String(x.id)).sort() };
    const br = await call(DL.bulkReassign, cA(uM), aM, { ids: got.deals.length ? got.deals : exp.deals, ownerUserId: uM, confirm: true, reason: `โอนดีลที่ไม่มีผู้ดูแล ${TAG}` });
    const after = await call(unownedF, cA(uM), aM);
    const exp2 = await sqlUnowned(tidA, crmA);
    chk("C3.2-S6.3", "R-A \"no owner\" list for MANAGER: unowned() = OPEN non-archived deals + live contacts whose owner is null or no longer a member of the tenant (= SQL) · a STAFF is refused (FORBIDDEN/NOT_FOUND) · after deals.bulkReassign the deals leave the list",
      um.ok && j(got) === j(exp) && exp.deals.length === 2 && (isFB(ut) || isNF(ut)) && br.ok && after.ok && ((after.v?.deals ?? []) as Any[]).length === 0 && exp2.deals.length === 0,
      `${j(exp)}`, `${um.ok ? j(got) : um.err} staff=${rs(ut)} bulk=${rs(br)} after=${after.ok ? ((after.v?.deals ?? []) as Any[]).length : after.err}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — reached ONCE per owner + period + threshold (crmR, direct checkReached) — 2 · X8.1 payload
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2 · reached once per period ──");
  const reachedOf = async (tid: string, ownerId: string, periodKey: string) =>
    ((await P.outboxEvent.findMany({ where: { tenantId: tid, type: EVT } })) as Any[]).filter((e) => e.payload?.ownerId === ownerId && e.payload?.periodKey === periodKey);
  const thr = (rows: Any[]) => ({ t80: rows.filter((r) => Number(r.payload?.threshold) === 80).length, t100: rows.filter((r) => Number(r.payload?.threshold) === 100).length, other: rows.filter((r) => ![80, 100].includes(Number(r.payload?.threshold))).length });
  const pR = await mkPipe(tidA, crmR, [["NEW", "ใหม่", "OPEN", 20], ["WON", "ชนะ", "WON", 100], ["LOST", "แพ้", "LOST", 0]]);
  const cR = ctx(tidA, crmR, null);
  const rDeal = async (owner: string, team: string | null = null) => mkDeal({ k: `r-${nx()}`, owner, team, pipe: pR, stage: "NEW", value: 100_000, sys: crmR });
  const S2ROWS: Any[] = [];
  {
    const d = await rDeal(uRU);
    const qSep = (await mkQuota(tidA, crmR, "USER", uRU, PK, 1_000_000)).id as string;
    const qOct = (await mkQuota(tidA, crmR, "USER", uRU, "2026-10", 100_000)).id as string;
    await mkPay(tidA, crmR, d, 850_000, "COUNTED", "2026-09-10T03:00:00Z");
    const c1 = await call(reachedF, cR, { quotaId: qSep });
    const a1 = thr(await reachedOf(tidA, uRU, PK));
    await mkPay(tidA, crmR, d, 300_000, "COUNTED", "2026-09-11T03:00:00Z");
    const c2 = await call(reachedF, cR, { quotaId: qSep });
    for (let i = 0; i < 3; i += 1) await call(reachedF, cR, { quotaId: qSep });
    const a2 = thr(await reachedOf(tidA, uRU, PK));
    await mkPay(tidA, crmR, d, 200_000, "COUNTED", "2026-10-05T03:00:00Z");
    const c3 = await call(reachedF, cR, { quotaId: qOct });
    await call(reachedF, cR, { quotaId: qOct });
    const a3 = thr(await reachedOf(tidA, uRU, "2026-10"));
    const a2b = thr(await reachedOf(tidA, uRU, PK));
    S2ROWS.push(...(await reachedOf(tidA, uRU, PK)), ...(await reachedOf(tidA, uRU, "2026-10")));
    chk("C3.2-S2.1", "USER quota: 85 % ⇒ exactly one `crm.quota.reached` at 80 (none at 100) · 115 % ⇒ one at 100 added · 3 more checkReached calls add nothing · the October quota of the same person has its OWN 80 + 100 (0 → 200 % in one step emits both) — once per owner + period + threshold",
      c1.ok && c2.ok && c3.ok && j(a1) === j({ t80: 1, t100: 0, other: 0 }) && j(a2) === j({ t80: 1, t100: 1, other: 0 }) && j(a3) === j({ t80: 1, t100: 1, other: 0 }) && j(a2b) === j(a2),
      "Sep 1/0 → 1/1 · Oct 1/1", `c1=${rs(c1)} after85=${j(a1)} after115=${j(a2)} oct=${j(a3)} sepAfterOct=${j(a2b)}${ABSENT}`);
  }
  {
    const d2 = await rDeal(uRU2, teamT2);
    const d3 = await rDeal(uRU3, teamT2);
    const qT = (await mkQuota(tidA, crmR, "TEAM", teamT2, PK, 1_000_000)).id as string;
    await mkPay(tidA, crmR, d2, 500_000, "COUNTED", "2026-09-10T03:00:00Z");
    const p3 = await mkPay(tidA, crmR, d3, 350_000, "COUNTED", "2026-09-11T03:00:00Z");
    const c1 = await call(reachedF, cR, { quotaId: qT });
    const a1 = thr(await reachedOf(tidA, teamT2, PK));
    await P.crmDealPayment.update({ where: { id: p3.id }, data: { status: "REVERSED", reversedAt: T("2026-09-12T03:00:00Z") } });
    const c2 = await call(reachedF, cR, { quotaId: qT });
    await mkPay(tidA, crmR, d3, 600_000, "COUNTED", "2026-09-13T03:00:00Z");
    const c3 = await call(reachedF, cR, { userId: uRU3, at: T("2026-09-13T03:00:00Z") });
    const c4 = await call(reachedF, cR, { userId: uRU2, at: T("2026-09-20T03:00:00Z") });
    const a3 = thr(await reachedOf(tidA, teamT2, PK));
    const typeOk = (await reachedOf(tidA, teamT2, PK)).every((e) => e.payload?.ownerType === "TEAM" && e.payload?.quotaId === qT);
    S2ROWS.push(...(await reachedOf(tidA, teamT2, PK)));
    chk("C3.2-S2.2", "TEAM quota (progress = Σ members): 85 % ⇒ one 80 · a reversal drops it to 50 % · a new payment lifts it to 110 % ⇒ one 100 and STILL one 80 (dipping and recovering never re-fires) · the {userId, at} form (a member's payment) reaches the TEAM quota of his team · rows carry ownerType TEAM + the quotaId",
      c1.ok && c2.ok && c3.ok && c4.ok && j(a1) === j({ t80: 1, t100: 0, other: 0 }) && j(a3) === j({ t80: 1, t100: 1, other: 0 }) && typeOk,
      "1/0 → 1/1", `c1=${rs(c1)} after85=${j(a1)} final=${j(a3)} userForm=${rs(c3)} typeOk=${typeOk}${ABSENT}`);
  }
  {
    const ALLOWED = ["quotaId", "ownerType", "ownerId", "periodKey", "threshold", "pct"];
    const ru = (await P.user.findMany({ where: { id: { in: [uRU, uRU2, uRU3] } } })) as Any[];
    const secrets = [...ru.map((u) => String(u.email)), ...ru.map((u) => String(u.name))];
    const bad = S2ROWS.filter((e) => Object.keys(e.payload ?? {}).some((k) => !ALLOWED.includes(k)) || secrets.some((s) => j(e.payload).includes(s) || String(e.idempotencyKey).includes(s))
      || !String(e.idempotencyKey).startsWith(`${EVT}#`) || !String(e.idempotencyKey).endsWith(`#${Number(e.payload?.threshold)}`) || e.systemId !== crmR);
    chk("C3.2-X8.1", "the `crm.quota.reached` rows are ids-only: payload keys ⊆ {quotaId, ownerType, ownerId, periodKey, threshold, pct}, no e-mail/name in payload or key · key `crm.quota.reached#…#<threshold>` (R-C.8) · OutboxEvent.systemId = the CRM system",
      S2ROWS.length >= 6 && bad.length === 0, "≥ 6 rows · 0 bad", `rows=${S2ROWS.length} bad=${bad.length} ${cut(j(bad.slice(0, 1).map((e) => ({ k: e.idempotencyKey, p: e.payload, s: e.systemId }))), 200)}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S6.1 · S6.2 · X9 — period helpers · setQuota/listQuotas · audit · retroactive
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S6.1–S6.2 · X9 ──");
  {
    const pq = await call(progressF, cA(uO), aO, { ownerType: "USER", ownerId: uTH, periodKey: "2026-Q3" });
    const py = await call(progressF, cA(uO), aO, { ownerType: "USER", ownerId: uTH, periodKey: "2026" });
    const eq = await sqlProgress(tidA, crmA, [uTH], "2026-Q3");
    const ey = await sqlProgress(tidA, crmA, [uTH], "2026");
    chk("C3.2-S6.1", "periods: periodKeyOf/periodRange/isPeriodKey on Thai boundaries (30 Sep 23:30 UTC-17:30 = Oct · Q4 starts 1 Oct 00:00 Thai · year flips at 1 Jan 00:00 Thai · \"2569-10\" (B.E.) · \"2026-13\" · \"2026-Q5\" refused) · progress for 2026-Q3 and 2026 = SQL (Jul–Sep window)",
      periodPure.ok && pq.ok && n(pq.v?.won) === eq.won && n(pq.v?.deals) === eq.deals && n(pq.v?.paid) === eq.paid && py.ok && n(py.v?.won) === ey.won,
      `helpers · Q3 ${j(eq)} · year won ${ey.won}`, `helpers=${periodPure.why} Q3=${rs(pq)} year=${rs(py)}${ABSENT}`);
  }
  const cRO = ctx(tidA, crmR, uO);
  {
    const before = (await P.crmQuota.count({ where: { systemId: crmR } })) as number;
    const bads: [string, Any][] = [
      ["B.E. key", { ownerType: "USER", ownerId: uRU4, periodKey: "2569-10", targetSatang: 100_000 }],
      ["month 13", { ownerType: "USER", ownerId: uRU4, periodKey: "2026-13", targetSatang: 100_000 }],
      ["negative", { ownerType: "USER", ownerId: uRU4, periodKey: "2026-11", targetSatang: -1 }],
      ["fraction", { ownerType: "USER", ownerId: uRU4, periodKey: "2026-11", targetSatang: 1.5 }],
      ["owner type", { ownerType: "SHOP", ownerId: uRU4, periodKey: "2026-11", targetSatang: 100 }],
      ["non-member", { ownerType: "USER", ownerId: uGONE, periodKey: "2026-11", targetSatang: 100 }],
    ];
    const res: string[] = [];
    for (const [label, input] of bads) { const r = await call(setQuotaF, cRO, aO, input); res.push(`${label}:${isVal(r) || isNF(r) ? "refused" : rs(r)}`); }
    const foreignTeam = (await P.team.create({ data: { tenantId: tidB, name: `ทีมร้านอื่น ${TAG}` } })).id as string;
    const ft = await call(setQuotaF, cRO, aO, { ownerType: "TEAM", ownerId: foreignTeam, periodKey: "2026-11", targetSatang: 100 });
    const mid = (await P.crmQuota.count({ where: { systemId: crmR } })) as number;
    const s1 = await call(setQuotaF, cRO, aO, { ownerType: "USER", ownerId: uRU4, periodKey: "2026-11", targetSatang: 500_000, targetDeals: 3 });
    const s2 = await call(setQuotaF, cRO, aO, { ownerType: "USER", ownerId: uRU4, periodKey: "2026-11", targetSatang: 700_000, targetDeals: 3 });
    const rows = (await P.crmQuota.findMany({ where: { systemId: crmR, ownerId: uRU4, periodKey: "2026-11" } })) as Any[];
    const lq = await call(listQuotasF, cRO, aO, { periodKey: "2026-11" });
    const lrow = lq.ok ? ((lq.v ?? []) as Any[]).find((x) => x.ownerId === uRU4) : null;
    chk("C3.2-S6.2", "setQuota refuses (Thai VALIDATION/NOT_FOUND, nothing written) a B.E. key, month 13, a negative or fractional target, an unknown owner type, a non-member user and a team of another tenant · setting the same owner+period twice UPSERTS one row (700 000) · listQuotas(period) returns it with targetSatang as a number",
      res.every((x) => x.endsWith("refused")) && (isVal(ft) || isNF(ft)) && mid === before && s1.ok && s2.ok && rows.length === 1 && Number(rows[0].targetSatang) === 700_000 && n(lrow?.targetSatang) === 700_000,
      "6+1 refused · 1 row · list", `${res.join(" ")} foreignTeam=${isVal(ft) || isNF(ft) ? "refused" : rs(ft)} written=${mid - before} upsert=${rows.length}/${rows[0] ? Number(rows[0].targetSatang) : "-"} list=${lq.ok ? j(lrow) : lq.err}${ABSENT}`);
    const aud = (await P.auditLog.findMany({ where: { tenantId: tidA, action: { startsWith: "crm.quota" }, targetId: rows[0]?.id ?? "-" }, orderBy: { createdAt: "asc" } })) as Any[];
    chk("C3.2-X9.1", "every quota mutation is audited: two setQuota calls on the same row ⇒ ≥ 2 AuditLog rows `crm.quota.*` on that quota, the second carries before (500000) and after (700000)",
      aud.length >= 2 && j(aud[aud.length - 1]?.before).includes("500000") && j(aud[aud.length - 1]?.after).includes("700000"),
      "≥ 2 · before/after", `rows=${aud.length} last=${cut(j({ b: aud[aud.length - 1]?.before, a: aud[aud.length - 1]?.after }), 200)}${ABSENT}`, "MAJOR");
  }
  {
    const past = "2026-08"; // ended before the real clock
    const cnt = async () => (await P.crmQuota.count({ where: { systemId: crmR, ownerId: uRU4, periodKey: past } })) as number;
    const b0 = await cnt();
    const st = await call(setQuotaF, ctx(tidA, crmR, uQS), aQS, { ownerType: "USER", ownerId: uRU4, periodKey: past, targetSatang: 100_000 });
    const b1 = await cnt();
    const stFuture = await call(setQuotaF, ctx(tidA, crmR, uQS), aQS, { ownerType: "USER", ownerId: uRU4, periodKey: "2027-01", targetSatang: 100_000 });
    const noKey = await call(setQuotaF, ctx(tidA, crmR, uTH), aTH, { ownerType: "USER", ownerId: uRU4, periodKey: "2027-02", targetSatang: 100_000 });
    const mg = await call(setQuotaF, ctx(tidA, crmR, uM), aM, { ownerType: "USER", ownerId: uRU4, periodKey: past, targetSatang: 100_000 });
    chk("C3.2-X9.2", "blueprint §11.6: changing a quota of a period that has ENDED needs MANAGER+ — a STAFF holding crm.quota.manage is FORBIDDEN there (nothing written) but may set a future period · a STAFF without the key is FORBIDDEN · the MANAGER may set the past period",
      isFB(st) && b1 === b0 && stFuture.ok && isFB(noKey) && mg.ok && (await cnt()) === 1,
      "forbidden · future ok · manager ok", `staffPast=${rs(st)} written=${b1 - b0} staffFuture=${rs(stFuture)} noKey=${rs(noKey)} manager=${rs(mg)}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X1.4 · X1.5 — cross-tenant / cross-system / invisible owners · uiVersion 1
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X1.4–X1.5 ──");
  {
    const foreign = await call(kpisF, ctx(tidB, crmA, uO), aO, { now: NOW });
    const other = await call(kpisF, ctx(tidA, crmS, uO), aO, { now: NOW });
    const pv1 = await call(progressF, cA(uTH), aTH, { ownerType: "USER", ownerId: uNK, periodKey: PK });
    const pv2 = await call(progressF, cA(uTH), aTH, { ownerType: "TEAM", ownerId: teamK, periodKey: PK });
    const pv3 = await call(progressF, cA(uNK), aNK, { ownerType: "TEAM", ownerId: teamK, periodKey: PK });
    const pv4 = await call(progressF, cA(uNK), aNK, { ownerType: "USER", ownerId: uTH, periodKey: PK });
    const pv5 = await call(progressF, cA(uTH), aTH, { ownerType: "USER", ownerId: uTH, periodKey: PK });
    const qA = (await P.crmQuota.findFirst({ where: { systemId: crmA, ownerId: uTH, periodKey: PK } })) as Any;
    const evBefore = (await P.outboxEvent.count({ where: { tenantId: tidA, type: EVT } })) as number;
    const cross = await call(reachedF, ctx(tidA, crmS, null), { quotaId: qA?.id ?? "-" });
    const evAfter = (await P.outboxEvent.count({ where: { tenantId: tidA, type: EVT } })) as number;
    chk("C3.2-X1.4", "scope: another tenant's ctx with this system ⇒ NOT_FOUND · another CRM system of the same tenant shows 0 open deals (no leak) · thana asking the progress of nok or of team K ⇒ NOT_FOUND, nok asking thana ⇒ NOT_FOUND, nok on his own team and thana on himself ⇒ ok · checkReached with a quota of another system writes nothing",
      isNF(foreign) && other.ok && n(other.v?.openPipeline?.count) === 0 && isNF(pv1) && isNF(pv2) && pv3.ok && isNF(pv4) && pv5.ok && evAfter === evBefore && (cross.ok || isNF(cross)),
      "404s · 0 · ok · 0 events", `foreign=${rs(foreign)} other=${other.ok ? other.v?.openPipeline?.count : other.err} th→nok=${rs(pv1)} th→K=${rs(pv2)} nok→K=${pv3.ok} nok→th=${rs(pv4)} th→th=${pv5.ok} crossReach=${rs(cross)} events+${evAfter - evBefore}${ABSENT}`);
  }
  {
    const pV = await mkPipe(tidA, crmV, [["NEW", "ใหม่", "OPEN", 20], ["WON", "ชนะ", "WON", 100], ["LOST", "แพ้", "LOST", 0]]);
    const dV = await mkDeal({ k: "v1", owner: uTH, team: null, pipe: pV, stage: "NEW", value: 100_000, sys: crmV });
    const qV = (await mkQuota(tidA, crmV, "USER", uTH, PK, 100_000)).id as string;
    await mkPay(tidA, crmV, dV, 150_000, "COUNTED", "2026-09-10T03:00:00Z");
    const cV = ctx(tidA, crmV, uO);
    const qBefore = (await P.crmQuota.count({ where: { systemId: crmV } })) as number;
    const aBefore = (await P.auditLog.count({ where: { tenantId: tidA, action: { startsWith: "crm.quota" } } })) as number;
    const k = await call(kpisF, cV, aO, { now: NOW });
    const pr = await call(progressF, cV, aO, { ownerType: "USER", ownerId: uTH, periodKey: PK });
    const sq = await call(setQuotaF, cV, aO, { ownerType: "USER", ownerId: uTH, periodKey: "2026-12", targetSatang: 100_000 });
    const lv = await call(listViewsF, cV, aO, "deal");
    const cr = await call(reachedF, ctx(tidA, crmV, null), { quotaId: qV });
    const evV = ((await P.outboxEvent.findMany({ where: { tenantId: tidA, type: EVT } })) as Any[]).filter((e) => e.payload?.quotaId === qV || e.systemId === crmV).length;
    const qAfter = (await P.crmQuota.count({ where: { systemId: crmV } })) as number;
    const aAfter = (await P.auditLog.count({ where: { tenantId: tidA, action: { startsWith: "crm.quota" } } })) as number;
    chk("C3.2-X1.5", "R-E.14: a uiVersion-1 CRM system is untouched — kpis · progress · setQuota · listViews answer CrmV2DisabledError, nothing is written (no quota, no audit) and checkReached on its (raw) 150 % quota emits NOTHING (rows kept, resumes at v2)",
      isV1(k) && isV1(pr) && isV1(sq) && isV1(lv) && (cr.ok || isV1(cr)) && evV === 0 && qAfter === qBefore && aAfter === aBefore,
      "4× disabled · 0 events · 0 writes", `kpis=${rs(k)} progress=${rs(pr)} set=${rs(sq)} views=${rs(lv)} reach=${rs(cr)} events=${evV} quotas+${qAfter - qBefore} audit+${aAfter - aBefore}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X3 · X4 — real concurrency (worker PROCESSES, one batch): reach race (crmX) + money race (tenant X)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X3 · X4 · concurrency (processes) ──");
  const ROUNDS = 3;
  const pX = await mkPipe(tidA, crmX, [["NEW", "ใหม่", "OPEN", 20], ["WON", "ชนะ", "WON", 100], ["LOST", "แพ้", "LOST", 0]]);
  const xQuotas: string[] = [];
  for (let r = 0; r < ROUNDS; r += 1) {
    const d = await mkDeal({ k: `x-${r}`, owner: uXU[r], team: null, pipe: pX, stage: "NEW", value: 100_000, sys: crmX });
    await mkPay(tidA, crmX, d, 1_200_000, "COUNTED", "2026-09-10T03:00:00Z");
    xQuotas.push((await mkQuota(tidA, crmX, "USER", uXU[r], PK, 1_000_000)).id as string);
  }
  const REAL = monthKeyOf(new Date());
  const pY = await mkPipe(tidX, crmY, [["NEW", "ใหม่", "OPEN", 20], ["WON", "ชนะ", "WON", 100], ["LOST", "แพ้", "LOST", 0]]);
  const payA: Any[] = [];
  const payB: Any[] = [];
  const yDeals: string[][] = [];
  for (let r = 0; r < ROUNDS; r += 1) {
    const base = await mkDeal({ k: `y0-${r}`, owner: uYU[r], team: null, pipe: pY, stage: "NEW", value: 100_000, sys: crmY, tid: tidX });
    const baseAt = new Date(Date.now() - 60_000);
    await mkPay(tidX, crmY, base, 600_000, "COUNTED", monthKeyOf(baseAt) === REAL ? baseAt : new Date());
    const d1 = await mkDeal({ k: `y1-${r}`, owner: uYU[r], team: null, pipe: pY, stage: "NEW", value: 100_000, sys: crmY, tid: tidX, invoiceDocId: `${TAG}-inv-${r}-a` });
    const d2 = await mkDeal({ k: `y2-${r}`, owner: uYU[r], team: null, pipe: pY, stage: "NEW", value: 100_000, sys: crmY, tid: tidX, invoiceDocId: `${TAG}-inv-${r}-b` });
    yDeals.push([d1, d2]);
    await mkQuota(tidX, crmY, "USER", uYU[r], REAL, 1_000_000);
    payA.push({ documentId: `${TAG}-inv-${r}-a`, paymentId: `${TAG}-pa-${r}`, amountSatang: 250_000 });
    payB.push({ documentId: `${TAG}-inv-${r}-b`, paymentId: `${TAG}-pb-${r}`, amountSatang: 250_000 });
  }
  const startAt = Date.now() + 45_000;
  const spawnW = (mode: string, tid: string, sys: string, arg: Any) => new Promise<string[]>((resolve) => {
    const enc = Buffer.from(JSON.stringify(arg), "utf8").toString("base64url");
    const ch = spawn("pnpm", ["exec", "tsx", THIS_FILE, "--x3-worker", mode, tid, sys, String(startAt), enc], { env: process.env });
    let out = "";
    const to = setTimeout(() => { try { ch.kill("SIGKILL"); } catch { /* gone */ } }, 300_000);
    ch.stdout.on("data", (d: Any) => { out += String(d); });
    ch.stderr.on("data", (d: Any) => { out += String(d); });
    ch.on("error", (e: Any) => { clearTimeout(to); resolve([`SPAWN-ERROR ${String(e)}`]); });
    ch.on("close", () => { clearTimeout(to); const m = /X3WORKER (\[.*\])/.exec(out); resolve(m ? (JSON.parse(m[1]) as string[]) : [`NO-OUTPUT ${cut(out, 200)}`]); });
  });
  const [wr1, wr2, wr3, wpA, wpB] = await Promise.all([
    spawnW("reach", tidA, crmX, { rounds: xQuotas, n: 4 }), spawnW("reach", tidA, crmX, { rounds: xQuotas, n: 4 }), spawnW("reach", tidA, crmX, { rounds: xQuotas, n: 4 }),
    spawnW("pay", tidX, crmY, { rounds: payA }), spawnW("pay", tidX, crmY, { rounds: payB }),
  ]);
  {
    const flat = [...wr1, ...wr2, ...wr3];
    chk("C3.2-X3.1a", `[positive control] 3 worker PROCESSES started together and returned ${ROUNDS * 12} checkReached results — if this is red, X3.1 proves nothing about concurrency`,
      flat.length === ROUNDS * 12 && flat.every((o) => o === "OK"), `${ROUNDS * 12} OK`, `${flat.length} ${cut(flat.filter((o) => o !== "OK").slice(0, 2).join(" | "), 200)}${ABSENT}`, "MAJOR");
    const per: string[] = [];
    for (let r = 0; r < ROUNDS; r += 1) per.push(j(thr(await reachedOf(tidA, uXU[r], PK))));
    chk("C3.2-X3.1", `${ROUNDS} rounds × 12 parallel checkReached on SEPARATE connections (3 processes × 4) against a quota at 120 % ⇒ exactly ONE row at 80 and ONE at 100 per round — the event is a conditional insert, never check-then-emit (and a collision never aborts the caller)`,
      per.every((x) => x === j({ t80: 1, t100: 1, other: 0 })), "1/1 each round", `${per.join(" ")}${ABSENT}`);
  }
  // hand-deliver OUR events (tenant X) to the consumer map — by id, whatever their status (a foreign drainer may have claimed them)
  const seen = new Set<string>();
  const deliverAll = async (tid: string) => {
    for (let round = 0; round < 6; round += 1) {
      const evs = ((await P.outboxEvent.findMany({ where: { tenantId: tid }, orderBy: { createdAt: "asc" } })) as Any[]).filter((e) => !seen.has(e.id));
      if (evs.length === 0) break;
      for (const e of evs) {
        seen.add(e.id);
        await call(CONS?.[e.type], { id: e.id, tenantId: e.tenantId, type: e.type, payload: e.payload, systemId: e.systemId, unitId: e.unitId });
      }
      await P.outboxEvent.updateMany({ where: { id: { in: evs.map((e) => e.id) }, status: "PENDING" }, data: { status: "DONE", processedAt: new Date() } });
    }
  };
  const moneyOf = async () => {
    const out: string[] = [];
    for (let r = 0; r < ROUNDS; r += 1) out.push(String((await P.crmDealPayment.count({ where: { dealId: { in: yDeals[r] }, status: "COUNTED" } })) as number));
    return out;
  };
  {
    const flat = [...wpA, ...wpB];
    const counted = await moneyOf();
    chk("C3.2-X3.2a", `[positive control] 2 worker PROCESSES recorded ${ROUNDS} × 2 payments in parallel through payments.recordDocPayment (the C2.7 money path) and every one was COUNTED — the race below really happened`,
      flat.length === ROUNDS * 2 && flat.every((o) => o === "OK:counted") && counted.every((c) => c === "2"), `${ROUNDS * 2} counted`, `${j(flat)} counted=${counted.join(",")}`, "MAJOR");
    await deliverAll(tidX);
    const per: string[] = [];
    for (let r = 0; r < ROUNDS; r += 1) per.push(j(thr(await reachedOf(tidX, uYU[r], REAL))));
    chk("C3.2-X3.2", `the brief's X3: per round, a quota at 60 % gets TWO payments of 25 % committed in parallel on separate connections (each alone 85 %, together 110 %) ⇒ after both commits (and our own events delivered to the consumers) exactly ONE row at 80 and ONE at 100 — neither lost (both transactions saw only their own row) nor doubled · ${ROUNDS} rounds · period ${REAL}`,
      per.every((x) => x === j({ t80: 1, t100: 1, other: 0 })), "1/1 each round", `${per.join(" ")}${ABSENT}`);
  }
  {
    const before = j(await Promise.all(uYU.map(async (u) => thr(await reachedOf(tidX, u, REAL)))));
    const notes0 = (await P.appNotification.count({ where: { tenantId: tidX } })) as number;
    const evs = ((await P.outboxEvent.findMany({ where: { tenantId: tidX }, orderBy: { createdAt: "asc" } })) as Any[]);
    const deliver = (e: Any) => call(CONS?.[e.type], { id: e.id, tenantId: e.tenantId, type: e.type, payload: e.payload, systemId: e.systemId, unitId: e.unitId });
    for (let i = 0; i < 2; i += 1) for (const e of evs) await deliver(e);
    await Promise.all(evs.flatMap((e) => [deliver(e), deliver(e)]));
    const after = j(await Promise.all(uYU.map(async (u) => thr(await reachedOf(tidX, u, REAL)))));
    const notes1 = (await P.appNotification.count({ where: { tenantId: tidX } })) as number;
    const reachedEvs = evs.filter((e) => e.type === EVT).length;
    chk("C3.2-X4.1", `X4 replay: every event of the money race (${evs.length}: deal.updated · quota.reached …) delivered to its consumer twice in a row and twice in parallel ⇒ the reached rows do not change (still one 80 + one 100 per owner and period)`,
      reachedEvs >= ROUNDS * 2 && after === before, "unchanged", `events=${evs.length} reached=${reachedEvs} before=${before} after=${after}${ABSENT}`);
    chk("C3.2-X4.2", "the `crm.quota.reached` consumer notifies (template `quota.progress` through notifications.notifyStaff) and a redelivered event notifies nobody twice: ≥ 1 in-app notification after the first delivery, the same count after 4 more deliveries",
      notes0 >= 1 && notes1 === notes0, "≥ 1 · unchanged", `first=${notes0} afterReplay=${notes1}${ABSENT}`, "MAJOR");
  }
} catch (e) {
  chk("C3.2-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
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
      const tagged = (await P.crmQuota.count({ where: { note: TAG } })) as number;
      chk("C3.2-CLEAN", "the oracle gives the QC database back exactly as found — every throwaway tenant and every row it owned (deals · history · payments · activities · quotas tagged qc-c32 · saved views · outbox · audit · notifications) and the throwaway users are gone",
        left.length === 0 && tenants === 0 && users === 0 && tagged === 0, "0 rows · 0 tenants · 0 users", `${left.join(" · ") || "-"} · tenants=${tenants} users=${users} quotas=${tagged}`, "MAJOR");
    } catch (e) {
      chk("C3.2-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C3.2: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
