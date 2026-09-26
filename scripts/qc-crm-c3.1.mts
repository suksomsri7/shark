// QC — CRM v2 WO C3.1: reports (8 tabs) + CSV export job + scheduled e-mail · mockup 09
//      `src/lib/modules/crm/reports.ts` (+ `reports-shared.ts`) · facade namespace `crm.reports` · settings.crm.reportSchedules[] (R-E.6)
//      · daily job `crm.reports.scheduled` (the C2.10 stub gets its body) · minute job `crm.reports.exports` · UI `/crm/reports[/tab]`
// Oracle writer · the C3.1 builder must NOT touch this file · QC database only (.env.qc — loaded by scripts/acc-v2-env.mts)
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c3.1.mts
//      `--force-run` = run every check while reports.ts is absent — C3.1 checks red for the right reason ("MISSING_FUNCTION"),
//                      the self-tests T0.x (query spy · independent SQL on the seed) + CLEAN green
// requires: crm-seed   (S1–S3 + X1.1–X1.4 + S6.4 read the seeded QC shop READ-ONLY and compare every number with an INDEPENDENT SQL
//                       computed here · everything that writes lives in throwaway tenants `qc-c31-<rand>-*` · the only rows the run
//                       leaves on the seed while it runs (export jobs + `crm.report.*` audit rows) are deleted in `finally`)
//
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE: qc-member-m3.8 (member reports/CSV) · qc-member-fix-s4 · qc-crm-c1.5 (deals.forecast
//   stays as it is) · qc-crm-c1.7 (visibility) · qc-crm-c2.10 (the job list — `crm.reports.scheduled` keeps name/cadence) · qc-crm-c0.5 ·
//   qc-crm-c2.7 (CrmDealPayment ledger) · qc-crm-c2.8 (score tables) · qc-nav-functions · qc-member-m1.9 (30/15/10/5 — untouched).
//
// SOURCES: crm-brief-C3.1.md (+ the addendum of this oracle) · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-E.6 schedules in
//   `settings.crm.reportSchedules[]`, no table · R-E.7 wonValueSatang / paidSatang · R-E.8 sums in SQL as bigint → JS number · R-E.14
//   uiVersion 1 · R-C.6 no `/api/cron/crm/*`) · CRM-RUN §2 "C3.1" (S1 16 tab-vs-SQL · S2 4 filters · S3 2 export job · S4 2 schedule ·
//   S5 2 visual = 26) · MASTER-PLAN §4 (X1 X5 X6 X8 X9 X10) · blueprint §2.2 (`/reports/{overview,forecast,funnel,reps,activities,lost,
//   sources,scores}` · `crm.report.view`) §3 row 3.9 · §5.9 `reports.ts` · §6.1/§6.2 (report.view/.team/.all · STAFF report = own) · §7.5
//   (`reports-scheduled`) · mockup 09 · src/lib/modules/crm/visibility.ts (REPORT entity · OWN/TEAM/ALL · lead ≥ TEAM · policies) ·
//   src/lib/modules/crm/deals.ts:1746 (`deals.forecast` — weighted = round(value × COALESCE(override, stage.probability) / 100)) ·
//   payments.ts (CrmDealPayment COUNTED) · scripts/crm-backfill-visibility.mts (the seed carries STAFF → TEAM for REPORT) ·
//   src/lib/core/csv.ts (`csvRow` = the only CSV engine) · src/lib/platform/minute-jobs.ts (C0.5 aligned windows from Thai midnight).
//
// ══════════════════════════════════ CONTRACT (oracle-proposed — see the addendum of crm-brief-C3.1.md) ══════════════════════════════════
//   ctx = { tenantId, systemId, actorUserId } · actor = MemberActor · the system is re-resolved in the tenant (type CRM) else NOT_FOUND ·
//   uiVersion ≠ 2 ⇒ CRM_V2_DISABLED (CrmV2DisabledError, code FORBIDDEN accepted) · no `crm.report.view` ⇒ FORBIDDEN (Thai, never blames).
//   Filters `ReportFilters = { from?: "YYYY-MM-DD"; to?: "YYYY-MM-DD" (Thai days, inclusive); teamId?; pipelineId?; ownerUserId? }` —
//   ids must belong to the tenant/system (else VALIDATION) · a filter NEVER widens what the actor may see.
//   REPORT SCOPE of an actor (AUDIT-CLASS X1): level = widest( visibility.resolve(actor, "REPORT"), crm.report.team ⇒ TEAM,
//     crm.report.all ⇒ ALL ) — OWNER ALL · MANAGER ALL (branch-limited like visibleWhere ALL) · team LEAD ≥ TEAM · STAFF default OWN
//     (seed policy STAFF→TEAM) · applied to each entity with visibility.ts's meaning: deals OWN = owner|collaborator = me · TEAM = OWN |
//     teamId ∈ my teams | owner ∈ my teammates · contacts the same without collaborators · activities by owner (an activity without an
//     owner counts only at ALL) · archived deals, archived and merged contacts never count.
//   Money = satang (numbers, summed in SQL). "in period" = the Thai-day window [from 00:00 +07, to+1 00:00 +07).
//   1. overview(ctx, actor, f) → { openDeals, openValueSatang, weightedSatang (OPEN · not OMITTED), wonDeals, wonValueSatang
//        (Σ COALESCE(wonValueSatang, valueSatang), closedAt in period), lostDeals (closedAt in period), winRatePct (1 dp | null),
//        avgWonSatang (round | null), paidSatang (Σ CrmDealPayment COUNTED, countedAt in period), activitiesDone (doneAt in period),
//        newLeads (contacts createdAt in period) } — open* are a snapshot (no period).
//   2. forecast(ctx, actor, f & { groupBy?: "month"|"owner"|"team" }) → { groupBy, rows: { key, label, deals, pipelineSatang,
//        bestCaseSatang, commitSatang, weightedSatang, closedSatang, quotaSatang }[] } — OPEN non-OMITTED by Thai month of
//        expectedCloseAt ("none" = no date) · pipeline = all three categories · bestCase = BEST_CASE + COMMIT · commit = COMMIT ·
//        closed = WON by Thai month of closedAt · period bounds expectedCloseAt (open) and closedAt (closed) · quota null when none.
//   3. funnel(ctx, actor, f) → { pipelineId, stages: { stageId, name, kind, entered, left, ratePct, avgDays }[] } — pipeline =
//        f.pipelineId else the default one · stages OPEN + WON by sortOrder (LOST lives in the lost tab) · from CrmDealStageHistory:
//        entered = distinct deals with a row INTO the stage (enteredAt in period) · left = those rows with leftAt · ratePct = entered /
//        entered(previous row) × 100 (first row 100) · avgDays = avg(durationSec ?? leftAt − enteredAt) of left rows, 1 dp.
//   4. reps(ctx, actor, f) → { rows: { key (ownerUserId|"none"), label, wonDeals, wonValueSatang, openDeals, openValueSatang, lostDeals,
//        paidSatang, activitiesDone, commissionSatang, quotaSatang, attainmentPct }[] }
//   5. activities(ctx, actor, f) → { rows: { key (ownerUserId), label, done, open, calls, callSeconds, byType: Record<type, n> }[] }
//        done / byType / calls / callSeconds = doneAt in period · open = doneAt null (snapshot)
//   6. lostReasons(ctx, actor, f) → { total, valueSatang, rows: { key (lostReasonId|"none"), label, deals, valueSatang, pct }[] }
//   7. sources(ctx, actor, f) → { bySource, byCampaign, byLink } rows { key, label, leads, deals, wonDeals, wonValueSatang, costSatang,
//        roi } — cohort = contacts createdAt in period · source = CONTACT.sourceKind · campaign = sourceDetail.campaignId ??
//        sourceDetail.utm.campaign · link = sourceDetail.linkId · cost = Σ CampaignVariantStat.costSatang when the key is an
//        MktCampaign of the tenant (else null) · roi = wonValue / cost (2 dp) when cost > 0 else null.
//   8. scores(ctx, actor, f) → { bands: { key (HOT|WARM|COLD|none), label, contacts, avgScore, withOpenDeal, withWonDeal }[],
//        topRules: { key (ruleId), label, logs, points }[] (CrmScoreLog createdAt in period, top 10 by points) }
//   9. getReport(ctx, actor, tab, f) — THE dispatcher over the 8 (C3.4's crm_reports tool + the export use it) · tab ∉ REPORT_TABS ⇒ VALIDATION
//  10. startExport(ctx, actor, { tab, filters }) → { jobId, status } — ALWAYS an async job: a `CrmImportJob` row kind "REPORT_EXPORT"
//        (QUEUED) + audit `crm.report.export` · runExportJobs({ now?, tenantIds?, systemIds?, deadline?, signal? }) → { done, failed }
//        claims with a LEASE (never a terminal state) · getExport(ctx, actor, jobId) → { jobId, tab, status, rowCount, filename, csv }
//        csv = UTF-8 WITHOUT BOM (the download layer adds U+FEFF), every line through `csvRow` · only the requester may read it ·
//        column order in the addendum · forecast adds a deal section (title · owner · stage · category · value · expected close).
//  11. listSchedules / saveSchedule(ctx, actor, { id?, tab, filters?, frequency: DAILY|WEEKLY|MONTHLY, weekday? 1..7 (Mon = 1),
//        dayOfMonth? 1..28, recipientUserIds: 1..20 staff user ids, active? }) / deleteSchedule(ctx, actor, id) — gate
//        `crm.report.all` · stored in `settings.crm.reportSchedules[]` through ONE jsonb_set statement · audits
//        `crm.report.schedule.save|delete` · a recipient that is not a staff member of the tenant / an e-mail string ⇒ VALIDATION.
//  12. runScheduled({ now?, tenantIds?, systemIds?, deps?: { email?: (req) => Promise<{ ok }> }, deadline?, signal? }) →
//        { sent, skipped, failed } — `now` is THE clock · slot = Thai day (DAILY) / ISO week Mon-start (WEEKLY, first run on or after
//        `weekday`) / Thai month (MONTHLY, first run on or after `dayOfMonth`) · catch-up: a missed day still sends that slot once ·
//        claim = LEASE 15 min per (schedule, slot) · one e-mail per recipient per slot, computed with THAT recipient's own actor
//        (re-resolved from Membership at send time; no membership / no report key ⇒ skipped) · req = { to (User.email), userId,
//        scheduleId, slot, subject (Thai, no CR/LF), html, attachments: [{ filename, content (CSV), contentType }] } · uiVersion 1 skipped.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// CHECK INVENTORY: 56 = S0 3 · S1 16 · S2 4 · S3 2 · S4 2 · S5 2 (S1–S5 = the 26 of CRM-RUN §2) · S6 5 (brief extras: synthetic funnel /
//   forecast / ROI · query-count guard · dispatcher) · T0 2 (self-tests: query spy + independent SQL — green even with reports.ts absent) ·
//   X1 6 · X5 3 · X6 2 · X8 3 · X9 2 · X10 1 · U 2 · CLEAN  (C3.1-FATAL only when something throws).
//   n/a: X2 (no REST op / AI tool here — C3.4 crm_reports, C3.8 REST) · X3 (no shared counter: reports only read) · X4 (no consumer) ·
//   X7 (no public endpoint — exports are downloaded by the signed-in requester).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const REPORTS_FILE = "src/lib/modules/crm/reports.ts";
const SHARED_FILE = "src/lib/modules/crm/reports-shared.ts";
const REPORTS_SPEC = "@/lib/modules/crm/reports";
const SHARED_SPEC = "@/lib/modules/crm/reports-shared";
const INDEX_FILE = "src/lib/modules/crm/index.ts";
const PAGE_DIR = "src/app/app/sys/[id]/crm/reports";
const PAGE = `${PAGE_DIR}/page.tsx`;
const TAB_PAGE = `${PAGE_DIR}/[tab]/page.tsx`;
const COMP_DIR = "src/components/crm/reports";
const NAV_FILE = "src/lib/modules/crm/nav.ts";
const INVENTORY = "scripts/crm-ui-inventory.json";

const ARGV = process.argv.slice(2);
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
// SKIP guard (before any DB connection)
// ═══════════════════════════════════════════════════════════════════════════════════
const BUILT = existsSync(REPORTS_FILE);
if (!FORCE && !BUILT) {
  console.log(`⚠️  SKIPPED — WO C3.1 not built yet (${REPORTS_FILE} absent) (run with --force-run to exercise the self-tests, the fixtures and the cleanup)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();

// ─────────────────────────── query spy (brief: "overview ≤ 12 queries on the seed") ───────────────────────────
// `src/lib/core/db.ts` exports `globalThis.prisma ?? new PrismaClient(…)` ⇒ a client installed on globalThis BEFORE that module loads
// IS the platform singleton every service uses. Ours is identical (same pg adapter, same tx options) plus two independent counters:
//   PR_Q = Prisma query events (`log: [{ emit: "event", level: "query" }]`) · PG_Q = statements sent on a pg pool client.
// T0.1 is the positive control that proves which counter works (3 raw SELECTs + 1 model count ⇒ +4) before S6.4 relies on it.
let PR_Q = 0;
let PG_Q = 0;
let SPY_ERR = "";
let spyClient: Any = null;
try {
  const { PrismaClient } = (await import("@prisma/client")) as Any;
  const { PrismaPg } = (await import("@prisma/adapter-pg")) as Any;
  const pgMod = (await import("pg" as string)) as Any;
  const PoolCtor = pgMod.Pool ?? pgMod.default?.Pool;
  const pool = new PoolCtor({ connectionString: process.env.DATABASE_URL });
  const wrapClient = (c: Any) => {
    if (c && !c.__qcSpy) {
      const oq = c.query.bind(c);
      c.query = (...qa: Any[]) => { PG_Q += 1; return oq(...qa); };
      c.__qcSpy = true;
    }
    return c;
  };
  const origConnect = pool.connect.bind(pool);
  pool.connect = (...a: Any[]) => {
    const cb = typeof a[a.length - 1] === "function" ? a.pop() : null;
    if (cb) return origConnect((err: Any, client: Any, done: Any) => cb(err, wrapClient(client), done));
    return origConnect().then(wrapClient);
  };
  spyClient = new PrismaClient({ adapter: new PrismaPg(pool), log: [{ emit: "event", level: "query" }], transactionOptions: { timeout: 30_000, maxWait: 10_000 } });
  spyClient.$on("query", () => { PR_Q += 1; });
  (globalThis as Any).prisma = spyClient;
} catch (e) {
  SPY_ERR = e instanceof Error ? e.message : String(e);
}
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const SPY_INSTALLED = !!spyClient && (prisma as unknown) === spyClient;

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c31-${rand}`;
const START = new Date();

// ─────────────────────────── harness ───────────────────────────
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const info = (s: string) => console.log(`  ℹ️  ${s}`);
const cut = (v: unknown, n = 240) => { const s = String(v ?? ""); return s.length > n ? `${s.slice(0, n)}…` : s; };
const j = (v: Any): string => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x)) ?? "undefined";
/** JSON without clock-dependent keys (a DTO may stamp when it was computed) */
const jStable = (v: Any): string => JSON.stringify(v, (k, x) => (/^(generatedAt|computedAt|asOf|now)$/.test(k) ? undefined : typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x)) ?? "undefined";
const thai = (s: unknown) => /[ก-๙]/.test(String(s ?? ""));
const BLAME = /คุณ(ทำ|กรอก|ใส่|เลือก)?ผิด|ผู้ใช้ผิด|ความผิดของคุณ/;
type Res = { ok: boolean; v: Any; err: string; code: string; msg: string };
const MISSING: Res = { ok: false, v: undefined, err: "MISSING_FUNCTION", code: "MISSING_FUNCTION", msg: "" };
const call = async (fn: Any, ...args: Any[]): Promise<Res> => {
  if (typeof fn !== "function") return MISSING;
  try {
    return { ok: true, v: await fn(...args), err: "", code: "", msg: "" };
  } catch (e) {
    const x = e as Any;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, v: undefined, err: `${x?.name ?? "Error"}(${x?.code ?? "-"}): ${cut(msg, 160)}`, code: String(x?.code ?? ""), msg };
  }
};
const refusedThai = (r: Res) => !r.ok && r.code !== "MISSING_FUNCTION" && thai(r.msg) && !BLAME.test(r.msg);
const refusedAs = (r: Res, codes: string[]) => refusedThai(r) && codes.includes(r.code);
const rd = (r: Res) => (r.ok ? cut(j(r.v), 160) : r.err);
const fnOf = (mod: Any, ...names: string[]): Any => {
  for (const n of names) {
    let v: Any = mod;
    for (const p of n.split(".")) v = v?.[p];
    if (typeof v === "function") return v;
  }
  return undefined;
};
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v as Any));
const n0 = (v: unknown): number => num(v) ?? 0;
const DAY = 86_400_000;
const MIN = 60_000;
const ABSENT = BUILT ? "" : " · [crm/reports.ts ABSENT]";
const at = (iso: string) => new Date(iso);
const thaiYmd = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => thaiYmd(new Date(new Date(`${ymd}T12:00:00+07:00`).getTime() + n * DAY));

console.log(`\n═══ QC CRM v2 · C3.1 — reports · export · schedule ═══`);
console.log(`[env] DB ${host} · tag ${TAG} · spy ${SPY_INSTALLED ? "installed" : `NOT installed (${cut(SPY_ERR, 80) || "db.ts did not reuse it"})`}${FORCE && !BUILT ? " · --force-run with C3.1 ABSENT (C3.1 checks expected red; T0 + CLEAN green)" : ""}\n`);

// ═══════════════════════════════════════════════════════════════════════════════════
// INDEPENDENT SQL — the oracle's own reading of the ledgers (never the service's helpers)
// ═══════════════════════════════════════════════════════════════════════════════════
const { Prisma } = (await import("@prisma/client")) as Any;
const S: Any = Prisma.sql;
const RAW = (s: string): Any => Prisma.raw(s);
const EMPTY: Any = Prisma.empty;
const Q = async (q: Any): Promise<Any[]> => (await P.$queryRaw(q)) as Any[];
const tableExists = async (t: string) => ((await Q(S`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${t}`))[0]?.n ?? 0) > 0;

type Lvl = "OWN" | "TEAM" | "ALL";
type Scope = { tenantId: string; systemId: string; level: Lvl; me: string; teams: string[]; mates: string[] };
type Flt = { from?: string | null; to?: string | null; teamId?: string | null; pipelineId?: string | null; ownerUserId?: string | null };
type Actor = { userId: string; role: string; unitAccess: string[]; permissions: Record<string, unknown> };
const RANK: Record<Lvl, number> = { OWN: 0, TEAM: 1, ALL: 2 };
const widest = (xs: (Lvl | null | undefined)[]): Lvl | null => xs.filter((x): x is Lvl => !!x).reduce<Lvl | null>((a, b) => (a === null || RANK[b] > RANK[a] ? b : a), null);
const isLvl = (v: unknown): v is Lvl => v === "OWN" || v === "TEAM" || v === "ALL";

/** the REPORT level of an actor, resolved from the DB by the oracle (visibility.ts semantics re-read, not imported) + the report keys */
async function reportScope(tenantId: string, systemId: string, actor: Actor): Promise<Scope> {
  const me = actor.userId;
  const tm = await Q(S`SELECT tm."teamId", tm."role"::text AS role FROM "TeamMember" tm JOIN "Team" t ON t."id" = tm."teamId"
                        WHERE tm."tenantId" = ${tenantId} AND tm."userId" = ${me} AND t."tenantId" = ${tenantId} AND t."archivedAt" IS NULL`);
  const teams = [...new Set(tm.map((r) => String(r.teamId)))];
  const isLead = tm.some((r) => r.role === "LEAD");
  const mates = teams.length
    ? [...new Set([me, ...(await Q(S`SELECT DISTINCT "userId" FROM "TeamMember" WHERE "tenantId" = ${tenantId} AND "teamId" = ANY(${teams}::text[])`)).map((r) => String(r.userId))])]
    : [me];
  const base = { tenantId, systemId, me, teams, mates };
  if (actor.role === "OWNER") return { ...base, level: "ALL" };
  const pol = await Q(S`SELECT "role"::text AS role, "teamId", "visibility"::text AS vis FROM "CrmVisibilityPolicy"
                         WHERE "tenantId" = ${tenantId} AND "systemId" = ${systemId} AND "entity" = 'REPORT' AND "pipelineId" IS NULL`);
  const teamPol = widest(pol.filter((p) => p.teamId !== null && teams.includes(p.teamId) && (p.role === null || p.role === actor.role)).map((p) => p.vis as Lvl));
  let lvl: Lvl;
  if (teamPol) lvl = teamPol;
  else {
    const rolePol = widest(pol.filter((p) => p.teamId === null && p.role === actor.role).map((p) => p.vis as Lvl));
    const st = (await Q(S`SELECT "settings"->'crm'->'visibility' AS v FROM "AppSystem" WHERE "id" = ${systemId}`))[0]?.v as Any;
    const sv = st && typeof st === "object" ? (isLvl(st[actor.role]) ? st[actor.role] : isLvl(st[actor.role]?.REPORT) ? st[actor.role].REPORT : null) : null;
    const roleLevel = rolePol ?? sv;
    if (actor.role === "MANAGER") lvl = roleLevel ?? "ALL";
    else if (isLead) lvl = widest(["TEAM", roleLevel])!;
    else lvl = roleLevel ?? "OWN";
  }
  const p = actor.permissions ?? {};
  if (p["crm.report.all"] === true) lvl = "ALL";
  else if (p["crm.report.team"] === true) lvl = widest([lvl, "TEAM"])!;
  return { ...base, level: lvl };
}

const lo = (f: Flt) => (f.from ? new Date(`${f.from}T00:00:00+07:00`).toISOString() : null);
const hi = (f: Flt) => (f.to ? new Date(new Date(`${f.to}T00:00:00+07:00`).getTime() + DAY).toISOString() : null);
/** column inside the Thai-day window of the filters (no bounds ⇒ TRUE; a bound on a NULL column ⇒ false) */
const per = (col: string, f: Flt): Any => {
  const c = RAW(col);
  const a = lo(f);
  const b = hi(f);
  return S`(TRUE ${a ? S`AND ${c} >= ${a}::timestamp` : EMPTY} ${b ? S`AND ${c} < ${b}::timestamp` : EMPTY})`;
};
const dScope = (sc: Scope, a = "d"): Any => {
  const A = RAW(a);
  if (sc.level === "ALL") return S`TRUE`;
  const own = S`(${A}."ownerUserId" = ${sc.me} OR ${sc.me} = ANY(${A}."collaboratorUserIds"))`;
  if (sc.level === "OWN") return own;
  return S`(${own} OR ${A}."teamId" = ANY(${sc.teams}::text[]) OR ${A}."ownerUserId" = ANY(${sc.mates}::text[]))`;
};
const cScope = (sc: Scope, a = "c"): Any => {
  const A = RAW(a);
  if (sc.level === "ALL") return S`TRUE`;
  if (sc.level === "OWN") return S`${A}."ownerUserId" = ${sc.me}`;
  return S`(${A}."ownerUserId" = ${sc.me} OR ${A}."teamId" = ANY(${sc.teams}::text[]) OR ${A}."ownerUserId" = ANY(${sc.mates}::text[]))`;
};
const aScope = (sc: Scope, a = "a"): Any => {
  const A = RAW(a);
  if (sc.level === "ALL") return S`TRUE`;
  if (sc.level === "OWN") return S`${A}."ownerUserId" = ${sc.me}`;
  return S`${A}."ownerUserId" = ANY(${sc.mates}::text[])`;
};
const dealBase = (sc: Scope, f: Flt, a = "d"): Any => {
  const A = RAW(a);
  return S`${A}."tenantId" = ${sc.tenantId} AND ${A}."systemId" = ${sc.systemId} AND ${A}."archivedAt" IS NULL AND ${dScope(sc, a)}
    ${f.pipelineId ? S`AND ${A}."pipelineId" = ${f.pipelineId}` : EMPTY} ${f.teamId ? S`AND ${A}."teamId" = ${f.teamId}` : EMPTY}
    ${f.ownerUserId ? S`AND ${A}."ownerUserId" = ${f.ownerUserId}` : EMPTY}`;
};
const contactBase = (sc: Scope, f: Flt, a = "c"): Any => {
  const A = RAW(a);
  return S`${A}."tenantId" = ${sc.tenantId} AND ${A}."systemId" = ${sc.systemId} AND ${A}."archivedAt" IS NULL AND ${A}."mergedIntoId" IS NULL AND ${cScope(sc, a)}
    ${f.teamId ? S`AND ${A}."teamId" = ${f.teamId}` : EMPTY} ${f.ownerUserId ? S`AND ${A}."ownerUserId" = ${f.ownerUserId}` : EMPTY}`;
};
const actBase = (sc: Scope, f: Flt, a = "a"): Any => {
  const A = RAW(a);
  return S`${A}."tenantId" = ${sc.tenantId} AND ${A}."systemId" = ${sc.systemId} AND ${aScope(sc, a)}
    ${f.teamId ? S`AND ${A}."ownerUserId" IN (SELECT tm."userId" FROM "TeamMember" tm WHERE tm."teamId" = ${f.teamId})` : EMPTY}
    ${f.ownerUserId ? S`AND ${A}."ownerUserId" = ${f.ownerUserId}` : EMPTY}`;
};
const WONV = `COALESCE(d."wonValueSatang", d."valueSatang"::bigint)`;
const WEIGHT = `round(d."valueSatang"::numeric * COALESCE(d."probabilityOverride", s."probability") / 100)`;

type Row = Record<string, number | null>;
type RowMap = Map<string, Row>;

async function expOverview(sc: Scope, f: Flt): Promise<Row> {
  const [d] = await Q(S`SELECT
      count(*) FILTER (WHERE d."kind" = 'OPEN')::int AS "openDeals",
      COALESCE(sum(d."valueSatang") FILTER (WHERE d."kind" = 'OPEN'), 0)::bigint AS "openValueSatang",
      COALESCE(sum(${RAW(WEIGHT)}) FILTER (WHERE d."kind" = 'OPEN' AND d."forecastCategory" <> 'OMITTED'), 0)::bigint AS "weightedSatang",
      count(*) FILTER (WHERE d."kind" = 'WON' AND ${per('d."closedAt"', f)})::int AS "wonDeals",
      COALESCE(sum(${RAW(WONV)}) FILTER (WHERE d."kind" = 'WON' AND ${per('d."closedAt"', f)}), 0)::bigint AS "wonValueSatang",
      count(*) FILTER (WHERE d."kind" = 'LOST' AND ${per('d."closedAt"', f)})::int AS "lostDeals"
    FROM "CrmDeal" d JOIN "CrmStage" s ON s."id" = d."stageId" WHERE ${dealBase(sc, f)}`);
  const [p] = await Q(S`SELECT COALESCE(sum(p."satang"), 0)::bigint AS v FROM "CrmDealPayment" p JOIN "CrmDeal" d ON d."id" = p."dealId"
    WHERE ${dealBase(sc, f)} AND p."status" = 'COUNTED' AND ${per('p."countedAt"', f)}`);
  const [a] = await Q(S`SELECT count(*)::int AS n FROM "CrmActivity" a WHERE ${actBase(sc, f)} AND a."doneAt" IS NOT NULL AND ${per('a."doneAt"', f)}`);
  const [c] = await Q(S`SELECT count(*)::int AS n FROM "CrmContact" c WHERE ${contactBase(sc, f)} AND ${per('c."createdAt"', f)}`);
  const won = n0(d?.wonDeals);
  const lost = n0(d?.lostDeals);
  const wonV = n0(d?.wonValueSatang);
  return {
    openDeals: n0(d?.openDeals), openValueSatang: n0(d?.openValueSatang), weightedSatang: n0(d?.weightedSatang),
    wonDeals: won, wonValueSatang: wonV, lostDeals: lost,
    winRatePct: won + lost > 0 ? Math.round((won * 1000) / (won + lost)) / 10 : null,
    avgWonSatang: won > 0 ? Math.round(wonV / won) : null,
    paidSatang: n0(p?.v), activitiesDone: n0(a?.n), newLeads: n0(c?.n),
  };
}

async function expForecast(sc: Scope, f: Flt, groupBy: "month" | "owner" | "team"): Promise<RowMap> {
  const keyOpen = groupBy === "month" ? `COALESCE(to_char(d."expectedCloseAt" + interval '7 hours', 'YYYY-MM'), 'none')` : groupBy === "owner" ? `COALESCE(d."ownerUserId", 'none')` : `COALESCE(d."teamId", 'none')`;
  const keyWon = groupBy === "month" ? `to_char(d."closedAt" + interval '7 hours', 'YYYY-MM')` : keyOpen;
  const open = await Q(S`SELECT ${RAW(keyOpen)} AS k, count(*)::int AS n,
      COALESCE(sum(d."valueSatang"), 0)::bigint AS pipe,
      COALESCE(sum(d."valueSatang") FILTER (WHERE d."forecastCategory" IN ('BEST_CASE', 'COMMIT')), 0)::bigint AS best,
      COALESCE(sum(d."valueSatang") FILTER (WHERE d."forecastCategory" = 'COMMIT'), 0)::bigint AS com,
      COALESCE(sum(${RAW(WEIGHT)}), 0)::bigint AS w
    FROM "CrmDeal" d JOIN "CrmStage" s ON s."id" = d."stageId"
    WHERE ${dealBase(sc, f)} AND d."kind" = 'OPEN' AND d."forecastCategory" <> 'OMITTED' AND ${per('d."expectedCloseAt"', f)} GROUP BY 1`);
  const won = await Q(S`SELECT ${RAW(keyWon)} AS k, COALESCE(sum(${RAW(WONV)}), 0)::bigint AS v FROM "CrmDeal" d
    WHERE ${dealBase(sc, f)} AND d."kind" = 'WON' AND d."closedAt" IS NOT NULL AND ${per('d."closedAt"', f)} GROUP BY 1`);
  const m: RowMap = new Map();
  const blank = (): Row => ({ deals: 0, pipelineSatang: 0, bestCaseSatang: 0, commitSatang: 0, weightedSatang: 0, closedSatang: 0 });
  for (const r of open) m.set(String(r.k), { ...blank(), deals: n0(r.n), pipelineSatang: n0(r.pipe), bestCaseSatang: n0(r.best), commitSatang: n0(r.com), weightedSatang: n0(r.w) });
  for (const r of won) m.set(String(r.k), { ...(m.get(String(r.k)) ?? blank()), closedSatang: n0(r.v) });
  return m;
}

async function defaultPipeline(tenantId: string, systemId: string): Promise<string | null> {
  const r = await Q(S`SELECT "id" FROM "CrmPipeline" WHERE "tenantId" = ${tenantId} AND "systemId" = ${systemId} AND "archivedAt" IS NULL
    ORDER BY "isDefault" DESC, "sortOrder" ASC, "createdAt" ASC, "id" ASC LIMIT 1`);
  return r[0]?.id ?? null;
}
async function expFunnel(sc: Scope, f: Flt): Promise<{ pipelineId: string | null; stages: Row[]; ids: string[] }> {
  const pid = f.pipelineId ?? (await defaultPipeline(sc.tenantId, sc.systemId));
  if (!pid) return { pipelineId: null, stages: [], ids: [] };
  const st = await Q(S`SELECT "id", "kind"::text AS kind FROM "CrmStage" WHERE "pipelineId" = ${pid} AND "kind"::text IN ('OPEN', 'WON') ORDER BY "sortOrder" ASC, "id" ASC`);
  const ids = st.map((s) => String(s.id));
  const agg = ids.length ? await Q(S`SELECT h."toStageId" AS sid, count(DISTINCT h."dealId")::int AS entered,
      count(DISTINCT h."dealId") FILTER (WHERE h."leftAt" IS NOT NULL)::int AS lft,
      (avg(COALESCE(h."durationSec"::float8, extract(epoch FROM (h."leftAt" - h."enteredAt")))) FILTER (WHERE h."leftAt" IS NOT NULL))::float8 AS avgsec
    FROM "CrmDealStageHistory" h JOIN "CrmDeal" d ON d."id" = h."dealId"
    WHERE h."tenantId" = ${sc.tenantId} AND h."toStageId" = ANY(${ids}::text[]) AND ${dealBase(sc, f)} AND ${per('h."enteredAt"', f)} GROUP BY 1`) : [];
  const by = new Map(agg.map((r) => [String(r.sid), r]));
  let prev: number | null = null;
  const stages: Row[] = [];
  for (const [i, sid] of ids.entries()) {
    const r = by.get(sid);
    const entered = n0(r?.entered);
    const ratePct = i === 0 ? (entered > 0 ? 100 : null) : prev && prev > 0 ? Math.round((entered * 1000) / prev) / 10 : null;
    const avg = num(r?.avgsec);
    stages.push({ entered, left: n0(r?.lft), ratePct, avgDays: avg === null ? null : Math.round((avg / 86_400) * 10) / 10 });
    prev = entered;
  }
  return { pipelineId: pid, stages, ids };
}

let HAS_COMMISSION = false;
let HAS_QUOTA = false;
async function expReps(sc: Scope, f: Flt): Promise<RowMap> {
  const deals = await Q(S`SELECT COALESCE(d."ownerUserId", 'none') AS k,
      count(*) FILTER (WHERE d."kind" = 'WON' AND ${per('d."closedAt"', f)})::int AS won,
      COALESCE(sum(${RAW(WONV)}) FILTER (WHERE d."kind" = 'WON' AND ${per('d."closedAt"', f)}), 0)::bigint AS wonv,
      count(*) FILTER (WHERE d."kind" = 'OPEN')::int AS open,
      COALESCE(sum(d."valueSatang") FILTER (WHERE d."kind" = 'OPEN'), 0)::bigint AS openv,
      count(*) FILTER (WHERE d."kind" = 'LOST' AND ${per('d."closedAt"', f)})::int AS lost
    FROM "CrmDeal" d WHERE ${dealBase(sc, f)} GROUP BY 1`);
  const paid = await Q(S`SELECT COALESCE(d."ownerUserId", 'none') AS k, COALESCE(sum(p."satang"), 0)::bigint AS v FROM "CrmDealPayment" p JOIN "CrmDeal" d ON d."id" = p."dealId"
    WHERE ${dealBase(sc, f)} AND p."status" = 'COUNTED' AND ${per('p."countedAt"', f)} GROUP BY 1`);
  const acts = await Q(S`SELECT a."ownerUserId" AS k, count(*)::int AS n FROM "CrmActivity" a
    WHERE ${actBase(sc, f)} AND a."ownerUserId" IS NOT NULL AND a."doneAt" IS NOT NULL AND ${per('a."doneAt"', f)} GROUP BY 1`);
  const comm = HAS_COMMISSION ? await Q(S`SELECT c."userId" AS k, COALESCE(sum(c."amountSatang"), 0)::bigint AS v FROM "CrmCommission" c JOIN "CrmDeal" d ON d."id" = c."dealId"
    WHERE ${dealBase(sc, f)} AND c."status"::text NOT IN ('REVERSED', 'REJECTED') AND ${per('c."createdAt"', f)} GROUP BY 1`) : [];
  const m: RowMap = new Map();
  const blank = (): Row => ({ wonDeals: 0, wonValueSatang: 0, openDeals: 0, openValueSatang: 0, lostDeals: 0, paidSatang: 0, activitiesDone: 0, commissionSatang: 0 });
  const get = (k: string) => { if (!m.has(k)) m.set(k, blank()); return m.get(k)!; };
  for (const r of deals) Object.assign(get(String(r.k)), { wonDeals: n0(r.won), wonValueSatang: n0(r.wonv), openDeals: n0(r.open), openValueSatang: n0(r.openv), lostDeals: n0(r.lost) });
  for (const r of paid) get(String(r.k)).paidSatang = n0(r.v);
  for (const r of acts) get(String(r.k)).activitiesDone = n0(r.n);
  for (const r of comm) get(String(r.k)).commissionSatang = n0(r.v);
  return m;
}

async function expActivities(sc: Scope, f: Flt): Promise<RowMap> {
  const rows = await Q(S`SELECT a."ownerUserId" AS k, a."type"::text AS t,
      count(*) FILTER (WHERE a."doneAt" IS NOT NULL AND ${per('a."doneAt"', f)})::int AS done,
      count(*) FILTER (WHERE a."doneAt" IS NULL)::int AS open,
      COALESCE(sum(a."durationSec") FILTER (WHERE a."doneAt" IS NOT NULL AND ${per('a."doneAt"', f)}), 0)::bigint AS secs
    FROM "CrmActivity" a WHERE ${actBase(sc, f)} AND a."ownerUserId" IS NOT NULL GROUP BY 1, 2`);
  const m: RowMap = new Map();
  for (const r of rows) {
    const k = String(r.k);
    const x = m.get(k) ?? { done: 0, open: 0, calls: 0, callSeconds: 0 };
    x.done = n0(x.done) + n0(r.done);
    x.open = n0(x.open) + n0(r.open);
    if (r.t === "CALL") { x.calls = n0(x.calls) + n0(r.done); x.callSeconds = n0(x.callSeconds) + n0(r.secs); }
    x[`t:${r.t}`] = n0(x[`t:${r.t}`]) + n0(r.done);
    m.set(k, x);
  }
  return m;
}

async function expLost(sc: Scope, f: Flt): Promise<{ total: number; valueSatang: number; rows: RowMap }> {
  const rows = await Q(S`SELECT COALESCE(d."lostReasonId", 'none') AS k, count(*)::int AS n, COALESCE(sum(d."valueSatang"), 0)::bigint AS v FROM "CrmDeal" d
    WHERE ${dealBase(sc, f)} AND d."kind" = 'LOST' AND ${per('d."closedAt"', f)} GROUP BY 1`);
  const total = rows.reduce((s, r) => s + n0(r.n), 0);
  const m: RowMap = new Map(rows.map((r) => [String(r.k), { deals: n0(r.n), valueSatang: n0(r.v), pct: total > 0 ? Math.round((n0(r.n) * 1000) / total) / 10 : null }]));
  return { total, valueSatang: rows.reduce((s, r) => s + n0(r.v), 0), rows: m };
}

async function expSources(sc: Scope, f: Flt): Promise<{ bySource: RowMap; byCampaign: RowMap; byLink: RowMap }> {
  const dim = async (expr: string, where: string): Promise<RowMap> => {
    const rows = await Q(S`WITH cohort AS (
        SELECT c."id", ${RAW(expr)} AS k FROM "CrmContact" c WHERE ${contactBase(sc, f)} AND ${per('c."createdAt"', f)}
      ), dl AS (
        SELECT d."contactId", count(*)::int AS n, count(*) FILTER (WHERE d."kind" = 'WON')::int AS w,
               COALESCE(sum(${RAW(WONV)}) FILTER (WHERE d."kind" = 'WON'), 0)::bigint AS wv
          FROM "CrmDeal" d WHERE ${dealBase(sc, f)} AND d."contactId" IN (SELECT "id" FROM cohort) GROUP BY 1
      )
      SELECT cohort.k AS k, count(*)::int AS leads, COALESCE(sum(dl.n), 0)::int AS deals, COALESCE(sum(dl.w), 0)::int AS won, COALESCE(sum(dl.wv), 0)::bigint AS wonv
        FROM cohort LEFT JOIN dl ON dl."contactId" = cohort."id" WHERE ${RAW(where)} GROUP BY 1`);
    const m: RowMap = new Map(rows.map((r) => [String(r.k), { leads: n0(r.leads), deals: n0(r.deals), wonDeals: n0(r.won), wonValueSatang: n0(r.wonv), costSatang: null, roi: null }]));
    return m;
  };
  const bySource = await dim(`COALESCE(c."sourceKind"::text, 'none')`, "TRUE");
  const byCampaign = await dim(`COALESCE(c."sourceDetail"->>'campaignId', c."sourceDetail"->'utm'->>'campaign')`, "cohort.k IS NOT NULL");
  const byLink = await dim(`c."sourceDetail"->>'linkId'`, "cohort.k IS NOT NULL");
  const keys = [...byCampaign.keys()];
  if (keys.length) {
    const camps = await Q(S`SELECT m."id" AS k, COALESCE((SELECT sum(v."costSatang") FROM "CampaignVariantStat" v WHERE v."campaignId" = m."id"), 0)::bigint AS cost
      FROM "MktCampaign" m WHERE m."tenantId" = ${sc.tenantId} AND m."id" = ANY(${keys}::text[])`);
    for (const c of camps) {
      const r = byCampaign.get(String(c.k));
      if (!r) continue;
      r.costSatang = n0(c.cost);
      r.roi = n0(c.cost) > 0 ? Math.round((n0(r.wonValueSatang) / n0(c.cost)) * 100) / 100 : null;
    }
  }
  return { bySource, byCampaign, byLink };
}

async function expScores(sc: Scope, f: Flt): Promise<{ bands: RowMap; topRules: RowMap }> {
  const bands = await Q(S`SELECT COALESCE(c."scoreBand"::text, 'none') AS k, count(*)::int AS n, avg(c."score")::float8 AS avg,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "CrmDeal" d WHERE d."contactId" = c."id" AND ${dealBase(sc, f)} AND d."kind" = 'OPEN'))::int AS wo,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "CrmDeal" d WHERE d."contactId" = c."id" AND ${dealBase(sc, f)} AND d."kind" = 'WON'))::int AS ww
    FROM "CrmContact" c WHERE ${contactBase(sc, f)} GROUP BY 1`);
  const rules = await Q(S`SELECT l."ruleId" AS k, count(*)::int AS n, COALESCE(sum(l."points"), 0)::bigint AS pts FROM "CrmScoreLog" l JOIN "CrmContact" c ON c."id" = l."contactId"
    WHERE ${contactBase(sc, f)} AND l."ruleId" IS NOT NULL AND ${per('l."createdAt"', f)} GROUP BY 1 ORDER BY 3 DESC, 1 ASC LIMIT 10`);
  return {
    bands: new Map(bands.map((r) => [String(r.k), { contacts: n0(r.n), avgScore: num(r.avg) === null ? null : Math.round(n0(r.avg) * 10) / 10, withOpenDeal: n0(r.wo), withWonDeal: n0(r.ww) }])),
    topRules: new Map(rules.map((r) => [String(r.k), { logs: n0(r.n), points: n0(r.pts) }])),
  };
}

// ─────────────────────────── service DTO → the same shapes (tolerant: bigint/Decimal/strings → number) ───────────────────────────
const rowsOf = (v: Any, ...keys: string[]): Any[] => { for (const k of keys) if (Array.isArray(v?.[k])) return v[k]; return Array.isArray(v) ? v : []; };
const mapOf = (rows: Any[], fields: string[]): RowMap => {
  const m: RowMap = new Map();
  for (const r of rows) {
    const k = String(r?.key ?? r?.id ?? "none");
    const o: Row = {};
    for (const fl of fields) o[fl] = num(r?.[fl]);
    m.set(k, o);
  }
  return m;
};
/** equal numbers (within `tol` when given) — null and 0 are the same "nothing" (a service may omit or zero an empty metric) */
const sameNum = (a: number | null, e: number | null, tol?: number) =>
  ((a ?? 0) === 0 && (e ?? 0) === 0) || (a !== null && e !== null && (tol === undefined ? a === e : Math.abs(a - e) <= tol));
const zeroRow = (r: Row) => Object.values(r).every((v) => v === null || v === 0);
/** compare two RowMaps on `fields` (all-zero rows dropped on both sides) → list of differences (empty = equal) */
const diffMaps = (act: RowMap, exp: RowMap, fields: string[], tol: Record<string, number> = {}): string[] => {
  const out: string[] = [];
  const pick = (r: Row) => Object.fromEntries(fields.map((fl) => [fl, r[fl] ?? null])) as Row;
  const A = new Map([...act.entries()].map(([k, r]) => [k, pick(r)] as [string, Row]).filter(([, r]) => !zeroRow(r)));
  const E = new Map([...exp.entries()].map(([k, r]) => [k, pick(r)] as [string, Row]).filter(([, r]) => !zeroRow(r)));
  for (const [k, e] of E) {
    const a = A.get(k);
    if (!a) { out.push(`${cut(k, 26)}:missing`); continue; }
    for (const fl of fields) {
      const ev = e[fl] ?? null;
      const av = a[fl] ?? null;
      if (!sameNum(av, ev, tol[fl])) out.push(`${cut(k, 26)}.${fl}:${av}≠${ev}`);
    }
  }
  for (const k of A.keys()) if (!E.has(k)) out.push(`${cut(k, 26)}:unexpected`);
  return out;
};
const diffRow = (act: Any, exp: Row, fields: string[], tol: Record<string, number> = {}): string[] =>
  fields.filter((fl) => !sameNum(num(act?.[fl]), exp[fl] ?? null, tol[fl])).map((fl) => `${fl}:${num(act?.[fl])}≠${exp[fl]}`);
const actsMap = (v: Any): RowMap => {
  const m: RowMap = new Map();
  for (const r of rowsOf(v, "rows")) {
    const o: Row = { done: num(r?.done), open: num(r?.open), calls: num(r?.calls), callSeconds: num(r?.callSeconds) };
    for (const [t, n] of Object.entries((r?.byType ?? {}) as Record<string, unknown>)) o[`t:${t}`] = num(n);
    m.set(String(r?.key ?? "none"), o);
  }
  return m;
};
const OV_FIELDS = ["openDeals", "openValueSatang", "weightedSatang", "wonDeals", "wonValueSatang", "lostDeals", "winRatePct", "avgWonSatang", "paidSatang", "activitiesDone", "newLeads"];
const FC_FIELDS = ["deals", "pipelineSatang", "bestCaseSatang", "commitSatang", "weightedSatang", "closedSatang"];
const REP_A = ["wonDeals", "wonValueSatang", "openDeals", "openValueSatang"];
const REP_B = ["lostDeals", "paidSatang", "activitiesDone", "commissionSatang"];
const SRC_FIELDS = ["leads", "deals", "wonDeals", "wonValueSatang"];
const ACT_TYPES = ["CALL", "MEETING", "EMAIL", "LINE", "TASK", "NOTE", "CHAT", "SMS", "WHATSAPP", "VISIT", "WEB", "PORTAL"];

/** RFC 4180 reader (quotes, doubled quotes, CRLF) — the oracle's own, never the product's */
const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i += 1; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i += 1; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
};
const dangerousCells = (csv: string) => parseCsv(csv).flat().filter((c) => /^[\t\r\n ]*[=+\-@]/.test(c) && !/^-?\d+(\.\d+)?$/.test(c));

// throwaway state (swept in finally)
const TENANTS: string[] = [];
const USERS: string[] = [];
const PII: string[] = [];
const pii = <X extends string>(s: X): X => { PII.push(s); return s; };
const SCHED_IDS: string[] = [];
let seq = 0;
const nx = () => `${++seq}`;
let T = "";
let SYS = "";
let seedBefore = "";
let SPY: "prisma" | "pg" | null = null;
const qcount = () => (SPY === "prisma" ? PR_Q : PG_Q);
// e-mail transport spy (a real transport call would have to go through here — X8)
type Mail = { req: Any };
const MAIL: Mail[] = [];
let hangFor: string | null = null;
let hangRelease: ((v: { ok: boolean }) => void) | null = null;
let slowMs = 0;
const DEPS = {
  email: async (req: Any) => {
    if (hangFor && req?.scheduleId === hangFor && !hangRelease) return new Promise<{ ok: boolean }>((res) => { hangRelease = res; });
    if (slowMs) await new Promise((r) => setTimeout(r, slowMs));
    MAIL.push({ req });
    return { ok: true };
  },
};
const mailsOf = (scheduleId: string) => MAIL.filter((m) => m.req?.scheduleId === scheduleId);

try {
  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — structure
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S0 · structure ──");
  const RP = (await import(REPORTS_SPEC as string).catch(() => ({}))) as Any;
  const RSH = (await import(SHARED_SPEC as string).catch(() => ({}))) as Any;
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => ({}))) as Any;
  const F = (name: string) => fnOf(RP, name) ?? fnOf(CRM, `reports.${name}`);
  const fn = {
    overview: F("overview"), forecast: F("forecast"), funnel: F("funnel"), reps: F("reps"), activities: F("activities"), lostReasons: F("lostReasons"),
    sources: F("sources"), scores: F("scores"), getReport: F("getReport"), startExport: F("startExport"), runExportJobs: F("runExportJobs"),
    getExport: F("getExport"), listSchedules: F("listSchedules"), saveSchedule: F("saveSchedule"), deleteSchedule: F("deleteSchedule"), runScheduled: F("runScheduled"),
  } as Record<string, Any>;
  const TAB_FN: [string, Any][] = [["overview", fn.overview], ["forecast", fn.forecast], ["funnel", fn.funnel], ["reps", fn.reps], ["activities", fn.activities], ["lost", fn.lostReasons], ["sources", fn.sources], ["scores", fn.scores]];
  {
    const missing = Object.entries(fn).filter(([, f]) => typeof f !== "function").map(([n]) => n);
    const facade = CRM?.reports && typeof CRM.reports.overview === "function" && typeof CRM.reports.runScheduled === "function";
    chk("C3.1-S0.1", "the 16 contract entries exist in reports.ts AND on the facade namespace `crm.reports` (overview · forecast · funnel · reps · activities · lostReasons · sources · scores · getReport · startExport · runExportJobs · getExport · listSchedules · saveSchedule · deleteSchedule · runScheduled)",
      missing.length === 0 && facade, "16 entries + facade", `missing=${missing.join(",") || "-"} facade=${!!facade}${ABSENT}`);
  }
  {
    const shSrc = read(SHARED_FILE);
    const impure = /from\s+["'](@prisma\/client|@\/lib\/core\/db|next\/[^"']+|server-only|\.\/db)["']/.test(shSrc);
    const tabs = Array.isArray(RSH.REPORT_TABS) ? (RSH.REPORT_TABS as Any[]).map(String) : [];
    const labels = (RSH.REPORT_TAB_LABEL ?? {}) as Record<string, unknown>;
    const freq = Array.isArray(RSH.REPORT_SCHEDULE_FREQUENCIES) ? (RSH.REPORT_SCHEDULE_FREQUENCIES as Any[]).map(String) : [];
    const want = ["overview", "forecast", "funnel", "reps", "activities", "lost", "sources", "scores"];
    chk("C3.1-S0.2", "reports-shared.ts is pure (no prisma/db/next) and carries THE 8 tab keys in mockup order `REPORT_TABS` = overview · forecast · funnel · reps · activities · lost · sources · scores (blueprint §2.2 URLs), a Thai `REPORT_TAB_LABEL` for each, and `REPORT_SCHEDULE_FREQUENCIES` = DAILY · WEEKLY · MONTHLY",
      shSrc.length > 0 && !impure && j(tabs) === j(want) && want.every((k) => thai(labels[k])) && j(freq) === j(["DAILY", "WEEKLY", "MONTHLY"]),
      "8 keys · Thai labels · 3 frequencies", `file=${shSrc.length > 0} impure=${impure} tabs=${j(tabs)} labels=${want.filter((k) => !thai(labels[k])).join(",") || "ok"} freq=${j(freq)}${ABSENT}`);
  }
  {
    const src = read(REPORTS_FILE);
    let bad = 0;
    for (let i = src.indexOf("findMany("); i !== -1; i = src.indexOf("findMany(", i + 1)) {
      let depth = 0;
      let end = i + "findMany".length;
      for (; end < src.length; end += 1) { const ch = src[end]; if (ch === "(") depth += 1; else if (ch === ")") { depth -= 1; if (depth === 0) break; } }
      if (!/\btake\s*:/.test(src.slice(i, end + 1))) bad += 1;
    }
    const inDb = /\$queryRaw|\.groupBy\(|\.aggregate\(/.test(src);
    const csv = /import\s*\{[^}]*\bcsvRow\b[^}]*\}\s*from\s*["']@\/lib\/core\/csv["']/.test(src) && !/replace\(\/"\/g/.test(src);
    const anyType = /(:\s*any\b|\bas any\b|<any>)/.test(src) || /(:\s*any\b|\bas any\b|<any>)/.test(read(SHARED_FILE));
    const rawClock = /\bget(Day|Date|Hours|Month|FullYear)\(\)/.test(src);
    const marks = ["X1", "X5", "X6", "X8"].filter((x) => new RegExp(`AUDIT-CLASS ${x}\\b`).test(src));
    const vis = /visibility|visibleWhere|resolve\(/.test(src);
    chk("C3.1-S0.3", "code rules of the brief [static]: every `findMany` in reports.ts has a `take` (member audit M13) · the numbers are aggregated in the database (`$queryRaw`/`groupBy`/`aggregate`) · CSV only through `csvRow` from @/lib/core/csv (no hand-made quoting) · no `any` · no raw getDay/getDate/getHours/getMonth/getFullYear (Thai time through +07:00 helpers) · sites marked AUDIT-CLASS X1/X5/X6/X8 · scope from the visibility module",
      src.length > 0 && bad === 0 && inDb && csv && !anyType && !rawClock && marks.length === 4 && vis,
      "clean", `file=${src.length > 0} findManyWithoutTake=${bad} inDb=${inDb} csvRow=${csv} any=${anyType} rawClock=${rawClock} markers=${marks.join(",") || "-"} visibility=${vis}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SEED (read-only) · actors · snapshot
  // ═════════════════════════════════════════════════════════════════════════════
  const cq = (await import("./crm-qc-env.mts" as string)) as Any;
  const seed = await cq.resolveCrmScope(prisma);
  if (!seed) throw new Error("the CRM seed is missing — run scripts/seed-member-qc.mts then scripts/seed-crm-qc.mts");
  T = seed.tenantId;
  SYS = seed.systemId;
  HAS_COMMISSION = await tableExists("CrmCommission");
  HAS_QUOTA = await tableExists("CrmQuota");
  const seedSig = async () => j(await Q(S`SELECT
      (SELECT count(*) FROM "CrmDeal" WHERE "systemId" = ${SYS})::int AS deals,
      (SELECT md5(COALESCE(string_agg("id" || ':' || "updatedAt"::text, ',' ORDER BY "id"), '')) FROM "CrmDeal" WHERE "systemId" = ${SYS}) AS "dealSig",
      (SELECT count(*) FROM "CrmContact" WHERE "systemId" = ${SYS})::int AS contacts,
      (SELECT count(*) FROM "CrmActivity" WHERE "systemId" = ${SYS})::int AS acts,
      (SELECT count(*) FROM "CrmDealStageHistory" WHERE "tenantId" = ${T})::int AS hist,
      (SELECT count(*) FROM "CrmDealPayment" WHERE "systemId" = ${SYS})::int AS pays,
      (SELECT count(*) FROM "CrmImportJob" WHERE "systemId" = ${SYS})::int AS jobs,
      (SELECT count(*) FROM "AuditLog" WHERE "tenantId" = ${T} AND "action" LIKE 'crm.report.%')::int AS audits,
      (SELECT count(*) FROM "CrmVisibilityPolicy" WHERE "systemId" = ${SYS})::int AS pol,
      (SELECT md5(COALESCE("settings"::text, '')) FROM "AppSystem" WHERE "id" = ${SYS}) AS settings,
      (SELECT count(*) FROM "Membership" WHERE "tenantId" = ${T})::int AS members`));
  seedBefore = await seedSig();
  const userOf = async (email: string) => (await P.user.findFirst({ where: { email }, select: { id: true, name: true, email: true } })) as Any;
  const memOf = async (userId: string) => (await P.membership.findFirst({ where: { tenantId: T, userId } })) as Any;
  const actorFrom = (userId: string, m: Any, add: Record<string, unknown> = {}, drop: string[] = []): Actor => {
    const perms: Record<string, unknown> = { ...((m?.permissions ?? {}) as Record<string, unknown>), ...add };
    for (const k of drop) delete perms[k];
    return { userId, role: String(m?.role ?? "STAFF"), unitAccess: Array.isArray(m?.unitAccess) ? (m.unitAccess as string[]) : [], permissions: perms };
  };
  const uOwner = await userOf("mb-owner@shark.local");
  const uThana = await userOf("mb-thana@shark.local");
  const uNok = await userOf("mb-nok@shark.local");
  const uKata = await userOf("mb-kata@shark.local");
  if (!uOwner || !uThana || !uNok || !uKata) throw new Error("seed users owner/thana/nok/kata not found — reseed");
  const REPORT_KEYS = ["crm.report.view", "crm.report.team", "crm.report.all", "crm.*"];
  const aOwner = actorFrom(uOwner.id, await memOf(uOwner.id));
  const aThana = actorFrom(uThana.id, await memOf(uThana.id), { "crm.report.view": true }, ["crm.report.team", "crm.report.all", "crm.*"]);
  const aThanaNoKey = actorFrom(uThana.id, await memOf(uThana.id), {}, REPORT_KEYS);
  const aNok = actorFrom(uNok.id, await memOf(uNok.id), { "crm.report.view": true }, ["crm.report.team", "crm.report.all", "crm.*"]);
  const aKata = actorFrom(uKata.id, await memOf(uKata.id), { "crm.report.view": true }, ["crm.report.team", "crm.report.all", "crm.*"]);
  const ctxSeed = (uid: string) => ({ tenantId: T, systemId: SYS, actorUserId: uid });
  const cO = ctxSeed(uOwner.id);
  const scO = await reportScope(T, SYS, aOwner);
  const scThana = await reportScope(T, SYS, aThana);
  const scNok = await reportScope(T, SYS, aNok);
  const scKata = await reportScope(T, SYS, aKata);
  const pipes = await Q(S`SELECT "id", "isDefault" FROM "CrmPipeline" WHERE "systemId" = ${SYS} AND "archivedAt" IS NULL ORDER BY "isDefault" DESC, "sortOrder" ASC, "createdAt" ASC, "id" ASC`);
  const defPipe = String(pipes[0]?.id ?? "");
  const otherPipe = String(pipes[1]?.id ?? "");
  const teamsSeed = await Q(S`SELECT "id", "name" FROM "Team" WHERE "tenantId" = ${T} AND "archivedAt" IS NULL ORDER BY "name"`);
  const krabi = String(teamsSeed.find((t) => /กระบี่/.test(String(t.name)))?.id ?? teamsSeed[0]?.id ?? "");
  info(`seed ${T}/${SYS} · pipelines ${pipes.length} · teams ${teamsSeed.length} · levels owner=${scO.level} thana=${scThana.level} nok=${scNok.level} kata=${scKata.level} · CrmCommission=${HAS_COMMISSION} CrmQuota=${HAS_QUOTA}`);

  // ═════════════════════════════════════════════════════════════════════════════
  // T0 — self-tests (green even when reports.ts is absent)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── T0 · self-tests ──");
  {
    const pr0 = PR_Q;
    const pg0 = PG_Q;
    await P.$queryRaw`SELECT 1`;
    await P.$queryRaw`SELECT 1`;
    await P.$queryRaw`SELECT 1`;
    await P.tenant.count({ where: { id: `${TAG}-none` } });
    const dPR = PR_Q - pr0;
    const dPG = PG_Q - pg0;
    SPY = SPY_INSTALLED ? (dPR === 4 ? "prisma" : dPG === 4 ? "pg" : null) : null;
    chk("C3.1-T0.1", "[positive control] the query spy works: our client IS the platform singleton (db.ts reuses globalThis.prisma) and 3 raw SELECTs + 1 model count move one of its counters by exactly 4 — so S6.4's \"overview ≤ 12 queries\" counts real round trips",
      SPY !== null, "+4 on one counter", `installed=${SPY_INSTALLED} prismaEvents=+${dPR} pgStatements=+${dPG} using=${SPY ?? "-"} ${SPY_ERR ? `err=${cut(SPY_ERR, 80)}` : ""}`, "MAJOR");
  }
  const expO = await expOverview(scO, {});
  {
    const raw = n0((await Q(S`SELECT count(*)::int AS n FROM "CrmDeal" WHERE "systemId" = ${SYS} AND "archivedAt" IS NULL`))[0]?.n);
    const allKinds = n0((await Q(S`SELECT count(*)::int AS n FROM "CrmDeal" d WHERE ${dealBase(scO, {})}`))[0]?.n);
    const thanaN = n0((await Q(S`SELECT count(*)::int AS n FROM "CrmDeal" d WHERE ${dealBase(scThana, {})}`))[0]?.n);
    const nokN = n0((await Q(S`SELECT count(*)::int AS n FROM "CrmDeal" d WHERE ${dealBase(scNok, {})}`))[0]?.n);
    const both = n0((await Q(S`SELECT count(*)::int AS n FROM "CrmDeal" d WHERE ${dealBase(scThana, {})} AND d."id" IN (SELECT d."id" FROM "CrmDeal" d WHERE ${dealBase(scNok, {})})`))[0]?.n);
    const thanaActs = n0((await Q(S`SELECT count(*)::int AS n FROM "CrmActivity" a WHERE ${actBase(scThana, {})}`))[0]?.n);
    const ownActs = n0((await Q(S`SELECT count(*)::int AS n FROM "CrmActivity" a WHERE a."systemId" = ${SYS} AND a."ownerUserId" = ${uThana.id}`))[0]?.n);
    chk("C3.1-T0.2", "[positive control] the oracle's independent SQL is sane on the seed: ALL covers every live deal · thana's report scope (the seed's STAFF→TEAM policy ⇒ team ภูเก็ต) and nok's (lead of กระบี่) are both non-empty, strictly smaller than ALL and disjoint — so X1 can tell a correct scope from a leaky one",
      raw > 0 && allKinds === raw && expO.openDeals! + expO.wonDeals! + expO.lostDeals! === raw && thanaN > 0 && nokN > 0 && thanaN < raw && nokN < raw && both === 0,
      "sane", `live=${raw} ALL=${allKinds} open+won+lost=${n0(expO.openDeals) + n0(expO.wonDeals) + n0(expO.lostDeals)} thana=${thanaN}(${scThana.level}) nok=${nokN}(${scNok.level}) overlap=${both} thanaActs=${thanaActs} (own ${ownActs})`);
    info(`SQL overview ALL = ${j(expO)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — every tab equals the independent SQL on the seed (OWNER, no filter)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S1 · 8 tabs vs SQL (seed · OWNER) ──");
  {
    const r = await call(fn.overview, cO, aOwner, {});
    const d1 = r.ok ? diffRow(r.v, expO, ["openDeals", "openValueSatang", "weightedSatang", "newLeads"]) : ["call"];
    chk("C3.1-S1.1", "overview · pipeline part: openDeals · openValueSatang · weightedSatang (Σ round(value × COALESCE(override, stage.probability)/100) over OPEN, OMITTED excluded) · newLeads equal the SQL",
      r.ok && d1.length === 0, j({ openDeals: expO.openDeals, openValueSatang: expO.openValueSatang, weightedSatang: expO.weightedSatang, newLeads: expO.newLeads }), `${r.ok ? d1.join(" ") : r.err}${ABSENT}`);
    const d2 = r.ok ? diffRow(r.v, expO, ["wonDeals", "wonValueSatang", "lostDeals", "winRatePct", "avgWonSatang", "paidSatang", "activitiesDone"], { winRatePct: 0.051, avgWonSatang: 1 }) : ["call"];
    chk("C3.1-S1.2", "overview · results part: wonDeals · wonValueSatang (Σ COALESCE(wonValueSatang, valueSatang)) · lostDeals · winRatePct · avgWonSatang · paidSatang (Σ CrmDealPayment COUNTED) · activitiesDone equal the SQL",
      r.ok && d2.length === 0, j({ wonDeals: expO.wonDeals, wonValueSatang: expO.wonValueSatang, lostDeals: expO.lostDeals, winRatePct: expO.winRatePct, paidSatang: expO.paidSatang, activitiesDone: expO.activitiesDone }), `${r.ok ? d2.join(" ") : r.err}${ABSENT}`);
  }
  {
    const exp = await expForecast(scO, {}, "month");
    const r = await call(fn.forecast, cO, aOwner, { groupBy: "month" });
    const rows = rowsOf(r.v, "rows");
    const d = r.ok ? diffMaps(mapOf(rows, FC_FIELDS), exp, FC_FIELDS) : ["call"];
    const quotaRows = HAS_QUOTA ? n0((await Q(S`SELECT count(*)::int AS n FROM "CrmQuota" WHERE "systemId" = ${SYS}`))[0]?.n) : 0;
    const quotaOk = quotaRows > 0 || rows.every((x) => num(x?.quotaSatang) === null || num(x?.quotaSatang) === 0);
    chk("C3.1-S1.3", "forecast by Thai month of expectedCloseAt × category: per month deals · pipeline (all OPEN non-OMITTED) · bestCase (BEST_CASE+COMMIT) · commit · weighted · closed (WON by Thai month of closedAt) equal the SQL · quota is the placeholder (null/0 while no CrmQuota row exists)",
      r.ok && d.length === 0 && quotaOk, `${exp.size} months`, `${r.ok ? cut(d.join(" "), 200) || `quota=${quotaOk}` : r.err}${ABSENT}`);
    info(`SQL forecast months = ${cut(j([...exp.entries()]), 300)}`);
  }
  {
    const eo = await expForecast(scO, {}, "owner");
    const et = await expForecast(scO, {}, "team");
    const ro = await call(fn.forecast, cO, aOwner, { groupBy: "owner" });
    const rt = await call(fn.forecast, cO, aOwner, { groupBy: "team" });
    const d = [...(ro.ok ? diffMaps(mapOf(rowsOf(ro.v, "rows"), FC_FIELDS), eo, FC_FIELDS).map((x) => `owner:${x}`) : ["owner:call"]), ...(rt.ok ? diffMaps(mapOf(rowsOf(rt.v, "rows"), FC_FIELDS), et, FC_FIELDS).map((x) => `team:${x}`) : ["team:call"])];
    chk("C3.1-S1.4", "forecast per owner and per team (groupBy owner|team, key = ownerUserId|teamId, \"none\" when empty) equal the SQL on the same six columns",
      ro.ok && rt.ok && d.length === 0, `${eo.size} owners · ${et.size} teams`, `${ro.ok && rt.ok ? cut(d.join(" "), 200) : `${ro.err} ${rt.err}`}${ABSENT}`);
  }
  {
    const exp = await expFunnel(scO, {});
    const r = await call(fn.funnel, cO, aOwner, {});
    const st = rowsOf(r.v, "stages");
    const ids = st.map((s) => String(s?.stageId ?? s?.id ?? ""));
    const d = r.ok ? exp.stages.flatMap((e, i) => diffRow(st[i], e, ["entered", "left"]).map((x) => `${i}:${x}`)) : ["call"];
    chk("C3.1-S1.5", "funnel (default pipeline) from CrmDealStageHistory: the stages are the pipeline's OPEN + WON stages in sortOrder (LOST excluded) and per stage `entered` (distinct deals INTO it) and `left` equal the SQL",
      r.ok && String(r.v?.pipelineId ?? "") === exp.pipelineId && j(ids) === j(exp.ids) && d.length === 0,
      `${exp.ids.length} stages ${j(exp.stages.map((s) => s.entered))}`, `${r.ok ? `pipeline=${r.v?.pipelineId === exp.pipelineId} order=${j(ids) === j(exp.ids)} ${d.join(" ")}` : r.err}${ABSENT}`);
    const d2 = r.ok ? exp.stages.flatMap((e, i) => diffRow(st[i], e, ["ratePct", "avgDays"], { ratePct: 0.051, avgDays: 0.051 }).map((x) => `${i}:${x}`)) : ["call"];
    chk("C3.1-S1.6", "funnel conversion and speed: ratePct = entered ÷ entered of the previous stage × 100 (first stage 100) and avgDays = average of durationSec (else leftAt − enteredAt) over the rows that left, 1 decimal — equal the SQL",
      r.ok && d2.length === 0, j(exp.stages.map((s) => [s.ratePct, s.avgDays])), `${r.ok ? d2.join(" ") : r.err}${ABSENT}`);
  }
  {
    const exp = await expReps(scO, {});
    const r = await call(fn.reps, cO, aOwner, {});
    const rows = rowsOf(r.v, "rows");
    const act = mapOf(rows, [...REP_A, ...REP_B, "quotaSatang"]);
    const d = r.ok ? diffMaps(act, exp, REP_A) : ["call"];
    chk("C3.1-S1.7", "reps (ยอดต่อคน): per owner wonDeals · wonValueSatang · openDeals · openValueSatang equal the SQL (rows keyed by ownerUserId)",
      r.ok && d.length === 0, `${exp.size} owners`, `${r.ok ? cut(d.join(" "), 200) : r.err}${ABSENT}`);
    const d2 = r.ok ? diffMaps(act, exp, REP_B) : ["call"];
    const labels = rows.every((x) => String(x?.label ?? "").trim().length > 0);
    const quotaOk = rows.every((x) => num(x?.quotaSatang) === null || num(x?.quotaSatang) === 0);
    chk("C3.1-S1.8", "reps · the rest: lostDeals · paidSatang (CrmDealPayment COUNTED) · activitiesDone · commissionSatang (CrmCommission when the table exists, else 0) equal the SQL, every row has a label, quota is the placeholder (null/0)",
      r.ok && d2.length === 0 && labels && quotaOk, "equal · labelled", `${r.ok ? `${cut(d2.join(" "), 180)} labels=${labels} quota=${quotaOk}` : r.err}${ABSENT}`);
  }
  {
    const exp = await expActivities(scO, {});
    const r = await call(fn.activities, cO, aOwner, {});
    const act = actsMap(r.v);
    const typeFields = ACT_TYPES.map((t) => `t:${t}`);
    const d = r.ok ? diffMaps(act, exp, ["done", ...typeFields]) : ["call"];
    chk("C3.1-S1.9", "activities per owner: done (doneAt in period) and the per-type breakdown `byType` (CALL/MEETING/EMAIL/LINE/TASK/NOTE/…) equal the SQL",
      r.ok && d.length === 0, `${exp.size} owners`, `${r.ok ? cut(d.join(" "), 200) : r.err}${ABSENT}`);
    const d2 = r.ok ? diffMaps(act, exp, ["open", "calls", "callSeconds"]) : ["call"];
    chk("C3.1-S1.10", "activities per owner: open (doneAt null — snapshot) · calls · callSeconds (Σ durationSec of done calls) equal the SQL",
      r.ok && d2.length === 0, "equal", `${r.ok ? cut(d2.join(" "), 200) : r.err}${ABSENT}`);
  }
  {
    const exp = await expLost(scO, {});
    const r = await call(fn.lostReasons, cO, aOwner, {});
    const rows = rowsOf(r.v, "rows");
    const d = r.ok ? diffMaps(mapOf(rows, ["deals", "valueSatang", "pct"]), exp.rows, ["deals", "valueSatang"]) : ["call"];
    chk("C3.1-S1.11", "lost reasons: per lostReasonId (\"none\" = no reason) the number of LOST deals and their value equal the SQL",
      r.ok && d.length === 0, j([...exp.rows.entries()].map(([k, v]) => [k.slice(-4), v.deals])), `${r.ok ? cut(d.join(" "), 200) : r.err}${ABSENT}`);
    const d2 = r.ok ? [...diffMaps(mapOf(rows, ["pct"]), exp.rows, ["pct"], { pct: 0.051 }), ...diffRow(r.v, { total: exp.total, valueSatang: exp.valueSatang }, ["total", "valueSatang"])] : ["call"];
    const labels = rows.every((x) => thai(x?.label) || String(x?.label ?? "").trim().length > 0);
    chk("C3.1-S1.12", "lost reasons: the total and its value equal the SQL, each row's pct = deals ÷ total (1 dp) and every row is labelled (the no-reason bucket in Thai)",
      r.ok && d2.length === 0 && labels, `total ${exp.total}`, `${r.ok ? `${d2.join(" ")} labels=${labels}` : r.err}${ABSENT}`);
  }
  {
    const exp = await expSources(scO, {});
    const r = await call(fn.sources, cO, aOwner, {});
    const d = r.ok ? diffMaps(mapOf(rowsOf(r.v, "bySource"), SRC_FIELDS), exp.bySource, SRC_FIELDS) : ["call"];
    chk("C3.1-S1.13", "sources by the lead's origin (CrmContact.sourceKind · cohort = contacts created in the period): leads → deals → wonDeals → wonValueSatang equal the SQL",
      r.ok && d.length === 0, j([...exp.bySource.entries()].map(([k, v]) => [k, v.leads, v.deals])), `${r.ok ? cut(d.join(" "), 200) : r.err}${ABSENT}`);
    const dc = r.ok ? [...diffMaps(mapOf(rowsOf(r.v, "byCampaign"), [...SRC_FIELDS, "costSatang", "roi"]), exp.byCampaign, [...SRC_FIELDS, "costSatang", "roi"], { roi: 0.011 }).map((x) => `camp:${x}`),
      ...diffMaps(mapOf(rowsOf(r.v, "byLink"), SRC_FIELDS), exp.byLink, SRC_FIELDS).map((x) => `link:${x}`)] : ["call"];
    chk("C3.1-S1.14", "sources by campaign (sourceDetail.campaignId ?? utm.campaign) and by tracked link (sourceDetail.linkId) equal the SQL, with cost/ROI empty where no MktCampaign cost exists",
      r.ok && dc.length === 0, j([...exp.byCampaign.entries()].map(([k, v]) => [k, v.leads])), `${r.ok ? cut(dc.join(" "), 200) : r.err}${ABSENT}`);
  }
  {
    const exp = await expScores(scO, {});
    const r = await call(fn.scores, cO, aOwner, {});
    const bands = mapOf(rowsOf(r.v, "bands"), ["contacts", "avgScore", "withOpenDeal", "withWonDeal"]);
    const d = r.ok ? diffMaps(bands, exp.bands, ["contacts", "avgScore"], { avgScore: 0.051 }) : ["call"];
    chk("C3.1-S1.15", "lead score by band (HOT/WARM/COLD/none): contacts and avgScore (1 dp) equal the SQL",
      r.ok && d.length === 0, j([...exp.bands.entries()].map(([k, v]) => [k, v.contacts, v.avgScore])), `${r.ok ? d.join(" ") : r.err}${ABSENT}`);
    const d2 = r.ok ? [...diffMaps(bands, exp.bands, ["withOpenDeal", "withWonDeal"]), ...diffMaps(mapOf(rowsOf(r.v, "topRules"), ["logs", "points"]), exp.topRules, ["logs", "points"]).map((x) => `rule:${x}`)] : ["call"];
    chk("C3.1-S1.16", "lead score · conversion: per band the contacts with an open deal / a won deal, and the top rules by points from CrmScoreLog (period-bound) equal the SQL",
      r.ok && d2.length === 0, `${exp.topRules.size} rules`, `${r.ok ? cut(d2.join(" "), 200) : r.err}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — filters team · pipeline · period (S2.4 = safety, after the fixtures)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2 · filters ──");
  {
    const f: Flt = { teamId: krabi };
    const eo = await expOverview(scO, f);
    const er = await expReps(scO, f);
    const ea = await expActivities(scO, f);
    const ro = await call(fn.overview, cO, aOwner, f);
    const rr = await call(fn.reps, cO, aOwner, f);
    const ra = await call(fn.activities, cO, aOwner, f);
    const d = [...(ro.ok ? diffRow(ro.v, eo, OV_FIELDS, { winRatePct: 0.051, avgWonSatang: 1 }).map((x) => `ov:${x}`) : ["ov:call"]),
      ...(rr.ok ? diffMaps(mapOf(rowsOf(rr.v, "rows"), [...REP_A, ...REP_B]), er, [...REP_A, ...REP_B]).map((x) => `reps:${x}`) : ["reps:call"]),
      ...(ra.ok ? diffMaps(actsMap(ra.v), ea, ["done", "open"]).map((x) => `acts:${x}`) : ["acts:call"])];
    chk("C3.1-S2.1", "team filter (teamId = ทีมกระบี่): overview · reps · activities narrow to that team (deals/contacts by teamId, activities by the team's members) and equal the SQL",
      !!krabi && ro.ok && rr.ok && ra.ok && d.length === 0 && n0(eo.openDeals) + n0(eo.wonDeals) > 0, `open ${eo.openDeals} · won ${eo.wonDeals}`, `${ro.ok ? cut(d.join(" "), 220) : ro.err}${ABSENT}`);
  }
  {
    const f: Flt = { pipelineId: otherPipe };
    const eo = await expOverview(scO, f);
    const ef = await expForecast(scO, f, "month");
    const eu = await expFunnel(scO, f);
    const ro = await call(fn.overview, cO, aOwner, f);
    const rf = await call(fn.forecast, cO, aOwner, { ...f, groupBy: "month" });
    const ru = await call(fn.funnel, cO, aOwner, f);
    const st = rowsOf(ru.v, "stages");
    const d = [...(ro.ok ? diffRow(ro.v, eo, ["openDeals", "openValueSatang", "weightedSatang", "wonDeals", "wonValueSatang", "lostDeals", "paidSatang"]).map((x) => `ov:${x}`) : ["ov:call"]),
      ...(rf.ok ? diffMaps(mapOf(rowsOf(rf.v, "rows"), FC_FIELDS), ef, FC_FIELDS).map((x) => `fc:${x}`) : ["fc:call"]),
      ...(ru.ok ? (j(st.map((s) => String(s?.stageId ?? s?.id ?? ""))) === j(eu.ids) ? eu.stages.flatMap((e, i) => diffRow(st[i], e, ["entered", "left"]).map((x) => `fn${i}:${x}`)) : ["fn:stage-order"]) : ["fn:call"])];
    chk("C3.1-S2.2", "pipeline filter (the second seed pipeline ขายปลีก): the deal-derived numbers of overview, the forecast months and the funnel of THAT pipeline's stages equal the SQL (contact/activity numbers are not pipeline-bound)",
      !!otherPipe && ro.ok && rf.ok && ru.ok && d.length === 0 && n0(eo.openDeals) + n0(eo.wonDeals) > 0, `open ${eo.openDeals} · ${ef.size} months · ${eu.ids.length} stages`, `${ro.ok ? cut(d.join(" "), 220) : ro.err}${ABSENT}`);
  }
  {
    const lastWon = (await Q(S`SELECT max("closedAt") AS m FROM "CrmDeal" WHERE "systemId" = ${SYS} AND "kind" = 'WON' AND "archivedAt" IS NULL`))[0]?.m as Date | null;
    const D0 = lastWon ? thaiYmd(new Date(lastWon)) : "2026-09-30";
    const f1: Flt = { from: D0, to: D0 };
    const f2: Flt = { to: addDays(D0, -1) };
    const f3: Flt = { from: "2026-11-01", to: "2026-11-30" };
    const e1 = await expOverview(scO, f1);
    const e2 = await expOverview(scO, f2);
    const el = await expLost(scO, f1);
    const e3 = await expForecast(scO, f3, "month");
    const r1 = await call(fn.overview, cO, aOwner, f1);
    const r2 = await call(fn.overview, cO, aOwner, f2);
    const rl = await call(fn.lostReasons, cO, aOwner, f1);
    const r3 = await call(fn.forecast, cO, aOwner, { ...f3, groupBy: "month" });
    const d = [...(r1.ok ? diffRow(r1.v, e1, OV_FIELDS, { winRatePct: 0.051, avgWonSatang: 1 }).map((x) => `day:${x}`) : ["day:call"]),
      ...(r2.ok ? diffRow(r2.v, e2, OV_FIELDS, { winRatePct: 0.051, avgWonSatang: 1 }).map((x) => `before:${x}`) : ["before:call"]),
      ...(rl.ok ? diffMaps(mapOf(rowsOf(rl.v, "rows"), ["deals", "valueSatang"]), el.rows, ["deals", "valueSatang"]).map((x) => `lost:${x}`) : ["lost:call"]),
      ...(r3.ok ? diffMaps(mapOf(rowsOf(r3.v, "rows"), FC_FIELDS), e3, FC_FIELDS).map((x) => `nov:${x}`) : ["nov:call"])];
    chk("C3.1-S2.3", `period filter (Thai days, inclusive): the day of the last win (${D0}) · everything up to the day before · November 2569 for the forecast — overview, lost reasons and forecast equal the SQL for each window`,
      r1.ok && r2.ok && rl.ok && r3.ok && d.length === 0 && n0(e1.wonDeals) > 0, `won that day ${e1.wonDeals} · before ${e2.wonDeals} · nov months ${e3.size}`, `${r1.ok ? cut(d.join(" "), 220) : r1.err}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — CSV export as an async job (seed · OWNER)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3 · export job ──");
  const jobIdOf = (r: Res) => String(r.v?.jobId ?? r.v?.id ?? "");
  {
    const exp = await expReps(scO, {});
    const names = new Map((await Q(S`SELECT "id", "name" FROM "User" WHERE "id" = ANY(${[...exp.keys()]}::text[])`)).map((u) => [String(u.id), String(u.name ?? "")]));
    const svc = await call(fn.reps, cO, aOwner, {});
    const st = await call(fn.startExport, cO, aOwner, { tab: "reps", filters: {} });
    const jobId = jobIdOf(st);
    const run = await call(fn.runExportJobs, { now: new Date(), tenantIds: [T], systemIds: [SYS] });
    const got = jobId ? await call(fn.getExport, cO, aOwner, jobId) : MISSING;
    const csv = String(got.v?.csv ?? "");
    const rows = parseCsv(csv.replace(/\s+$/, ""));
    const head = rows[0] ?? [];
    const body = rows.slice(1).filter((r) => r.some((c) => c.trim() !== ""));
    const byName = new Map(body.map((r) => [r[0] ?? "", r]));
    const bad: string[] = [];
    for (const [k, e] of exp) {
      if (k === "none" || zeroRow(e)) continue;
      const line = byName.get(names.get(k) ?? `?${k}`);
      if (!line) { bad.push(`${cut(names.get(k), 20)}:missing`); continue; }
      if (Number(line[1]) !== e.wonDeals || Math.abs(Number(line[2]) - n0(e.wonValueSatang) / 100) > 0.005) bad.push(`${cut(names.get(k), 20)}:${line[1]}/${line[2]}≠${e.wonDeals}/${n0(e.wonValueSatang) / 100}`);
    }
    chk("C3.1-S3.1", "export `reps` as a job: startExport → QUEUED job → runExportJobs → getExport DONE with the CSV: no BOM in the service output (the download layer adds U+FEFF), a Thai header of 11 columns (ผู้ดูแล · ชนะ · มูลค่าที่ชนะ (บาท) · …), one line per reps row, and each owner's won deals / won value in baht equal the SQL",
      st.ok && !!jobId && run.ok && got.ok && String(got.v?.status) === "DONE" && csv.length > 0 && csv.charCodeAt(0) !== 0xfeff && head.length === 11 && thai(head.join("")) && body.length === rowsOf(svc.v, "rows").length && bad.length === 0,
      "DONE · 11 cols · rows = SQL", `start=${rd(st)} run=${rd(run)} status=${got.v?.status ?? got.err} bom=${csv.charCodeAt(0) === 0xfeff} cols=${head.length} lines=${body.length}/${rowsOf(svc.v, "rows").length} bad=${cut(bad.join(" "), 140) || "-"}${ABSENT}`);
  }
  {
    const st = await call(fn.startExport, cO, aOwner, { tab: "overview", filters: {} });
    const jobId = jobIdOf(st);
    const runs = await Promise.all([0, 1, 2, 3].map(() => call(fn.runExportJobs, { now: new Date(), tenantIds: [T], systemIds: [SYS] })));
    const done = runs.reduce((s, r) => s + n0(r.v?.done), 0);
    const row = jobId ? ((await P.crmImportJob.findFirst({ where: { id: jobId } }).catch(() => null)) as Any) : null;
    const foreign = jobId ? await call(fn.getExport, ctxSeed(uThana.id), aThana, jobId) : MISSING;
    const audits = n0((await Q(S`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = ${T} AND "action" = 'crm.report.export' AND "createdAt" >= ${START.toISOString()}::timestamp`))[0]?.n);
    const reg = (globalThis as Any)[Symbol.for("shark.platform.minute-jobs.registry")] as Map<string, Any> | undefined;
    const job = reg?.get("crm.reports.exports");
    const jobOk = !!job && String(job.run).includes("runExportJobs");
    chk("C3.1-S3.2", "the export job is a LEASED job: 4 overlapping runExportJobs process it exactly once (Σ done = 1), the row is `CrmImportJob` kind REPORT_EXPORT · DONE · lease cleared · createdById = the requester · another staff member cannot read it (NOT_FOUND) · one `crm.report.export` audit per request · the minute job `crm.reports.exports` runs runExportJobs",
      st.ok && runs.every((r) => r.ok) && done === 1 && row?.kind === "REPORT_EXPORT" && row?.status === "DONE" && !row?.leaseUntil && row?.createdById === uOwner.id && refusedAs(foreign, ["NOT_FOUND"]) && audits === 2 && jobOk,
      "once · DONE · private · 2 audits · job", `start=${rd(st)} runs=${runs.filter((r) => r.ok).length}/4 Σdone=${done} row=${row ? `${row.kind}/${row.status}/${row.leaseUntil ? "L" : "-"}/${row.createdById === uOwner.id}` : "-"} foreign=${foreign.ok ? "READ!" : foreign.code} audits=${audits} minuteJob=${jobOk}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X1 — report scope on the seed (thana · nok · kata · OWNER · no key)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X1 · scope (seed) ──");
  const scopeCheck = async (ctx: Any, actor: Actor, sc: Scope) => {
    const [eo, er, ea, es] = [await expOverview(sc, {}), await expReps(sc, {}), await expActivities(sc, {}), await expSources(sc, {})];
    const [ro, rr, ra, rs] = [await call(fn.overview, ctx, actor, {}), await call(fn.reps, ctx, actor, {}), await call(fn.activities, ctx, actor, {}), await call(fn.sources, ctx, actor, {})];
    const d = [...(ro.ok ? diffRow(ro.v, eo, OV_FIELDS, { winRatePct: 0.051, avgWonSatang: 1 }).map((x) => `ov:${x}`) : [`ov:${ro.err}`]),
      ...(rr.ok ? diffMaps(mapOf(rowsOf(rr.v, "rows"), [...REP_A, ...REP_B]), er, [...REP_A, ...REP_B]).map((x) => `reps:${x}`) : ["reps:call"]),
      ...(ra.ok ? diffMaps(actsMap(ra.v), ea, ["done", "open"]).map((x) => `acts:${x}`) : ["acts:call"]),
      ...(rs.ok ? diffMaps(mapOf(rowsOf(rs.v, "bySource"), SRC_FIELDS), es.bySource, SRC_FIELDS).map((x) => `src:${x}`) : ["src:call"])];
    return { d, eo, er, ea, ok: ro.ok && rr.ok && ra.ok && rs.ok, repsKeys: rowsOf(rr.v, "rows").map((x) => String(x?.key ?? "")) };
  };
  {
    const x = await scopeCheck(ctxSeed(uThana.id), aThana, scThana);
    const acts = [...x.ea.values()].reduce((s, r) => s + n0(r.done) + n0(r.open), 0);
    chk("C3.1-X1.1", `thana (STAFF + crm.report.view · report level from the seed's own policies = ${scThana.level}) sees exactly his scope: overview · reps · activities · sources equal the SQL of HIS scope — strictly less than the shop (no deal of ทีมกระบี่)`,
      x.ok && x.d.length === 0 && n0(x.eo.openDeals) < n0(expO.openDeals), `open ${x.eo.openDeals}/${expO.openDeals} · acts ${acts}`, `${x.ok ? cut(x.d.join(" "), 220) : x.d.join(" ")}${ABSENT}`);
  }
  {
    const x = await scopeCheck(ctxSeed(uNok.id), aNok, scNok);
    const leak = x.repsKeys.includes(uThana.id);
    chk("C3.1-X1.2", `team lead nok (LEAD of ทีมกระบี่ · level ${scNok.level}) sees his team: overview · reps · activities · sources equal the SQL of team กระบี่ and no reps row belongs to thana (ภูเก็ต)`,
      x.ok && x.d.length === 0 && !leak && scNok.level === "TEAM", `open ${x.eo.openDeals}`, `${x.ok ? cut(x.d.join(" "), 200) : x.d.join(" ")} leakThana=${leak}${ABSENT}`);
  }
  {
    const x = await scopeCheck(ctxSeed(uKata.id), aKata, scKata);
    const rr = await call(fn.reps, cO, aOwner, {});
    const keys = rowsOf(rr.v, "rows").map((y) => String(y?.key ?? ""));
    chk("C3.1-X1.3", "OWNER = the whole shop (reps rows of BOTH teams: thana and nok) · kata (member of กระบี่, not lead) gets exactly the SQL of her resolved scope",
      rr.ok && keys.includes(uThana.id) && keys.includes(uNok.id) && x.ok && x.d.length === 0, `owner keys ⊇ thana,nok · kata ${scKata.level}`, `ownerRows=${keys.length} thana=${keys.includes(uThana.id)} nok=${keys.includes(uNok.id)} kata=${cut(x.d.join(" "), 160) || (x.ok ? "ok" : "call")}${ABSENT}`);
  }
  {
    const refused: string[] = [];
    for (const [tab, f] of TAB_FN) { const r = await call(f, ctxSeed(uThana.id), aThanaNoKey, {}); if (!refusedAs(r, ["FORBIDDEN", "NOT_FOUND"])) refused.push(`${tab}:${r.ok ? "ACCEPTED" : r.err}`); }
    const g = await call(fn.getReport, ctxSeed(uThana.id), aThanaNoKey, "overview", {});
    const e = await call(fn.startExport, ctxSeed(uThana.id), aThanaNoKey, { tab: "overview", filters: {} });
    for (const [k, r] of [["getReport", g], ["startExport", e]] as [string, Res][]) if (!refusedAs(r, ["FORBIDDEN", "NOT_FOUND"])) refused.push(`${k}:${r.ok ? "ACCEPTED" : r.err}`);
    const pageSrc = [PAGE, TAB_PAGE].map(read).join("\n");
    const guard = read(PAGE).length > 0 && /type:\s*"CRM"/.test(pageSrc) && /requireCrmV2Page/.test(pageSrc) && /crmCan\([^)]*"crm\.report\.view"\)/.test(pageSrc) && /notFound\(\)/.test(pageSrc);
    chk("C3.1-X1.4", "a STAFF WITHOUT `crm.report.view` gets nothing: all 8 tabs, getReport and startExport are refused FORBIDDEN/NOT_FOUND in Thai without blaming him, and the pages answer 404 (guard: type \"CRM\" → requireCrmV2Page → crmCan(…, \"crm.report.view\") → notFound()) [page part static]",
      refused.length === 0 && guard, "10 refused · page 404", `accepted=${cut(refused.join(" | "), 200) || "-"} pageGuard=${guard}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S6.4 / S6.5 — query-count guard · dispatcher (seed)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S6 · brief extras (seed) ──");
  {
    await call(fn.overview, cO, aOwner, {});
    const q0 = qcount();
    const r = await call(fn.overview, cO, aOwner, {});
    const used = qcount() - q0;
    chk("C3.1-S6.4", "query-count guard (brief): one overview on the seed costs ≤ 12 database round trips (spy proven by T0.1; the scope resolution is included) — numbers are aggregated in SQL, not by loading rows",
      SPY !== null && r.ok && used <= 12, "≤ 12", `queries=${used} spy=${SPY ?? "none"} call=${r.ok ? "ok" : r.err}${ABSENT}`, "MAJOR");
  }
  {
    const bad: string[] = [];
    for (const [tab, f] of TAB_FN) {
      const a = await call(fn.getReport, cO, aOwner, tab, {});
      const b = await call(f, cO, aOwner, {});
      if (!a.ok || !b.ok || jStable(a.v) !== jStable(b.v)) bad.push(`${tab}:${a.ok ? (b.ok ? "differs" : b.err) : a.err}`);
    }
    const unk = await call(fn.getReport, cO, aOwner, `${TAG}-nope`, {});
    chk("C3.1-S6.5", "getReport(tab) is THE dispatcher (C3.4's crm_reports tool and the export use it): for each of the 8 tabs it returns exactly what the tab's own function returns · an unknown tab is VALIDATION in Thai",
      bad.length === 0 && refusedAs(unk, ["VALIDATION"]), "8 identical · unknown refused", `bad=${cut(bad.join(" | "), 200) || "-"} unknown=${unk.ok ? "ACCEPTED" : unk.code}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // THROWAWAY FIXTURES — tenants `qc-c31-<rand>-a|b` (everything that writes)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── fixtures (throwaway tenants) ──");
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
  const uA = await mkUser("");
  const uS1 = await mkUser("-s1");
  const uS2 = await mkUser("-s2");
  const uNo = await mkUser("-nokey");
  const uOut = await mkUser("-out");
  const NAME = { S1: `QC -s1 ${TAG}`, S2: `QC -s2 ${TAG}` };
  const SALES = { "crm.contact.read": true, "crm.contact.create": true, "crm.deal.read": true, "crm.deal.create": true, "crm.activity.read": true };
  const REPORT = { ...SALES, "crm.report.view": true };
  const tidA = await mkTenant("a");
  const tidB = await mkTenant("b");
  for (const [u, r, p] of [[uA, "OWNER", {}], [uS1, "STAFF", REPORT], [uS2, "STAFF", REPORT], [uNo, "STAFF", SALES]] as [string, string, Record<string, unknown>][]) await member(tidA, u, r, p);
  await member(tidB, uOut, "OWNER");
  const crmF = await mk(tidA, "CRM", "CRM รายงาน");
  const crmS = await mk(tidA, "CRM", "CRM ตั้งเวลา");
  const crmL = await mk(tidA, "CRM", "CRM ซ้อน");
  const crmK = await mk(tidA, "CRM", "CRM ตายกลางทาง");
  const crmJ = await mk(tidA, "CRM", "CRM ช่องเวลา");
  const crmU = await mk(tidA, "CRM", "CRM สลับรุ่น");
  const crmV = await mk(tidA, "CRM", "CRM v1");
  const memA = await mk(tidA, "MEMBER", "สมาชิก");
  const crmB = await mk(tidB, "CRM", "CRM-B");
  for (const s of [crmF, crmS, crmL, crmK, crmJ, crmU, crmB]) await setCrm(s, { uiVersion: 2, bridgesEnabled: true });
  await setCrm(crmV, { uiVersion: 1 });
  const oA: Actor = { userId: uA, role: "OWNER", unitAccess: [], permissions: {} };
  const oOut: Actor = { userId: uOut, role: "OWNER", unitAccess: [], permissions: {} };
  const staff = (userId: string, perms: Record<string, unknown>): Actor => ({ userId, role: "STAFF", unitAccess: ["*"], permissions: perms });
  const s1 = staff(uS1, REPORT);
  const s2team = staff(uS2, { ...REPORT, "crm.report.team": true });
  const s2all = staff(uS2, { ...REPORT, "crm.report.all": true });
  const ctxA = (sys: string, uid: string = uA) => ({ tenantId: tidA, systemId: sys, actorUserId: uid });
  const cF = ctxA(crmF);
  const cS = ctxA(crmS);
  const teamT = (await P.team.create({ data: { tenantId: tidA, name: `ทีมทดสอบ ${TAG}` } })).id as string;
  for (const u of [uS1, uS2]) await P.teamMember.create({ data: { tenantId: tidA, teamId: teamT, userId: u, role: "MEMBER" } });
  const teamB = (await P.team.create({ data: { tenantId: tidB, name: `ทีมร้านอื่น ${TAG}` } })).id as string;

  const STD = [{ name: "ติดต่อ", kind: "OPEN", probability: 10 }, { name: "เสนอราคา", kind: "OPEN", probability: 50 }, { name: "ชนะ", kind: "WON", probability: 100 }, { name: "แพ้", kind: "LOST", probability: 0 }];
  const mkPipe = async (tid: string, sys: string, isDefault = false) => {
    const p = (await P.crmPipeline.create({
      data: { tenantId: tid, systemId: sys, name: `ขาย ${TAG}-${nx()}`, isDefault, stages: { create: STD.map((s, i) => ({ tenantId: tid, systemId: sys, sortOrder: i, ...s })) } },
      include: { stages: true },
    })) as Any;
    return { id: p.id as string, st: [...(p.stages as Any[])].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.id as string) };
  };
  let phoneSeq = 0;
  const phoneOf = (): string => pii(`08${String(7_000_000 + Math.floor(Math.random() * 900_000) * 10 + (phoneSeq++ % 10)).slice(-8)}`);
  const mkContact = async (tid: string, sys: string, ownerUserId: string, extra: Record<string, unknown> = {}) => {
    const name = pii(`ลูกค้า ${TAG}-${nx()}`);
    return (await P.crmContact.create({ data: { tenantId: tid, systemId: sys, name, firstName: name, phone: phoneOf(), email: pii(`k${nx()}-${TAG}@qc-customer.invalid`), ownerUserId, ...extra } })).id as string;
  };
  type DealOpt = { ownerUserId: string; stage: number; kind?: string; value?: number; closedAt?: Date | null; expectedCloseAt?: Date | null; forecastCategory?: string; probabilityOverride?: number | null; wonValueSatang?: number | null; teamId?: string | null; contactId?: string; title?: string };
  const mkDeal = async (tid: string, sys: string, pipe: { id: string; st: string[] }, o: DealOpt) => {
    const contactId = o.contactId ?? (await mkContact(tid, sys, o.ownerUserId));
    const d = (await P.crmDeal.create({
      data: {
        tenantId: tid, systemId: sys, contactId, pipelineId: pipe.id, stageId: pipe.st[o.stage], title: o.title ?? `ดีล ${TAG}-${nx()}`,
        valueSatang: o.value ?? 10_000, ownerUserId: o.ownerUserId, teamId: o.teamId ?? null, kind: o.kind ?? "OPEN", closedAt: o.closedAt ?? null,
        expectedCloseAt: o.expectedCloseAt ?? null, forecastCategory: o.forecastCategory ?? "PIPELINE", probabilityOverride: o.probabilityOverride ?? null,
        wonValueSatang: o.wonValueSatang === undefined || o.wonValueSatang === null ? null : BigInt(o.wonValueSatang),
      },
    })) as Any;
    return { id: d.id as string, contactId };
  };
  const hist = (tid: string, dealId: string, from: string | null, to: string, enteredAt: Date, leftAt: Date | null) =>
    P.crmDealStageHistory.create({ data: { tenantId: tid, dealId, fromStageId: from, toStageId: to, enteredAt, leftAt, durationSec: leftAt ? Math.round((leftAt.getTime() - enteredAt.getTime()) / 1000) : null } });

  // crmF — synthetic funnel (pF) · synthetic forecast (pF) · ROI + hostile + member-linked (pX)
  const pF = await mkPipe(tidA, crmF, true);
  const pX = await mkPipe(tidA, crmF);
  const T0 = at("2026-08-01T03:00:00.000Z");
  const dA = await mkDeal(tidA, crmF, pF, { ownerUserId: uS1, stage: 2, kind: "WON", closedAt: new Date(T0.getTime() + 5 * DAY), value: 5_000 });
  const dB = await mkDeal(tidA, crmF, pF, { ownerUserId: uS1, stage: 3, kind: "LOST", closedAt: new Date(T0.getTime() + 6 * DAY), value: 6_000 });
  const dC = await mkDeal(tidA, crmF, pF, { ownerUserId: uS1, stage: 0, value: 7_000 });
  await hist(tidA, dA.id, null, pF.st[0]!, T0, new Date(T0.getTime() + 2 * DAY));
  await hist(tidA, dA.id, pF.st[0]!, pF.st[1]!, new Date(T0.getTime() + 2 * DAY), new Date(T0.getTime() + 5 * DAY));
  await hist(tidA, dA.id, pF.st[1]!, pF.st[2]!, new Date(T0.getTime() + 5 * DAY), null);
  await hist(tidA, dB.id, null, pF.st[0]!, T0, new Date(T0.getTime() + 4 * DAY));
  await hist(tidA, dB.id, pF.st[0]!, pF.st[1]!, new Date(T0.getTime() + 4 * DAY), new Date(T0.getTime() + 6 * DAY));
  await hist(tidA, dB.id, pF.st[1]!, pF.st[3]!, new Date(T0.getTime() + 6 * DAY), null);
  await hist(tidA, dC.id, null, pF.st[0]!, T0, null);
  await mkDeal(tidA, crmF, pF, { ownerUserId: uS1, stage: 1, value: 100_000, forecastCategory: "COMMIT", expectedCloseAt: at("2026-10-31T17:30:00.000Z") });
  await mkDeal(tidA, crmF, pF, { ownerUserId: uS1, stage: 1, value: 200_000, forecastCategory: "BEST_CASE", probabilityOverride: 25, expectedCloseAt: at("2026-11-15T05:00:00.000Z") });
  await mkDeal(tidA, crmF, pF, { ownerUserId: uS2, stage: 0, value: 300_000, forecastCategory: "PIPELINE", expectedCloseAt: at("2026-11-20T05:00:00.000Z") });
  await mkDeal(tidA, crmF, pF, { ownerUserId: uS2, stage: 1, value: 999_000, forecastCategory: "OMITTED", expectedCloseAt: at("2026-11-10T05:00:00.000Z") });
  await mkDeal(tidA, crmF, pF, { ownerUserId: uS1, stage: 2, kind: "WON", value: 50_000, wonValueSatang: 70_000, closedAt: at("2026-11-03T05:00:00.000Z"), expectedCloseAt: at("2026-11-03T05:00:00.000Z") });
  await mkDeal(tidA, crmF, pF, { ownerUserId: uS1, stage: 1, value: 40_000, expectedCloseAt: at("2026-11-30T17:30:00.000Z") });
  const mc = (await P.mktCampaign.create({ data: { tenantId: tidA, systemId: memA, name: `แคมเปญ ${TAG}` } })) as Any;
  await P.campaignVariantStat.create({ data: { tenantId: tidA, systemId: memA, campaignId: mc.id, variant: "A", costSatang: 10_000 } });
  await P.campaignVariantStat.create({ data: { tenantId: tidA, systemId: memA, campaignId: mc.id, variant: "B", costSatang: 5_000 } });
  const kR1 = await mkContact(tidA, crmF, uS1, { sourceKind: "CAMPAIGN", sourceDetail: { campaignId: mc.id } });
  const kR2 = await mkContact(tidA, crmF, uS1, { sourceKind: "CAMPAIGN", sourceDetail: { campaignId: mc.id } });
  await mkDeal(tidA, crmF, pX, { ownerUserId: uS1, stage: 2, kind: "WON", value: 50_000, wonValueSatang: 60_000, closedAt: at("2026-09-10T05:00:00.000Z"), contactId: kR1 });
  await mkDeal(tidA, crmF, pX, { ownerUserId: uS1, stage: 0, value: 20_000, contactId: kR2 });
  const HOSTILE_TITLE = `=HYPERLINK("https://evil.example/${TAG}","คลิก")`;
  const HOSTILE_UTM = `@SUM(1+1)*cmd|' /C calc'!A0 ${TAG}`;
  await mkDeal(tidA, crmF, pX, { ownerUserId: uS1, stage: 0, value: 11_000, expectedCloseAt: at("2026-11-10T05:00:00.000Z"), title: HOSTILE_TITLE });
  await mkContact(tidA, crmF, uS1, { sourceKind: "WEB_FORM", sourceDetail: { utm: { source: "facebook", campaign: HOSTILE_UTM } } });
  // member-linked contact with sensitive member data (X8)
  const SENS = pii(`QC-SENSITIVE-${TAG}`);
  const BIRTH = "1990-04-17";
  const cust = (await P.customer.create({ data: { tenantId: tidA, memberSystemId: memA, name: pii(`สมาชิก ${TAG}`), phone: phoneOf(), email: pii(`m-${TAG}@qc-member.invalid`), birthDate: new Date(`${BIRTH}T00:00:00.000Z`), nationality: "TH" } })) as Any;
  let sensOk = false;
  try {
    const sec = (await P.memberSection.create({ data: { tenantId: tidA, systemId: memA, key: `qc${rand}`, label: "ข้อมูลสุขภาพ", sensitive: true } })) as Any;
    const fld = (await P.memberField.create({ data: { tenantId: tidA, systemId: memA, sectionId: sec.id, key: `qc${rand}f`, label: "โรคประจำตัว", type: "TEXT", sensitive: true } })) as Any;
    await P.memberFieldValue.create({ data: { tenantId: tidA, customerId: cust.id, fieldId: fld.id, valueText: SENS } });
    sensOk = true;
  } catch (e) { info(`sensitive member field fixture skipped: ${cut((e as Error)?.message, 120)}`); }
  const kM = await mkContact(tidA, crmF, uS1, { memberCustomerId: cust.id });
  await mkDeal(tidA, crmF, pX, { ownerUserId: uS1, stage: 1, value: 12_000, expectedCloseAt: at("2026-11-12T05:00:00.000Z"), contactId: kM, title: `ดีลผูกสมาชิก-${TAG}` }); // ORACLE-EDIT C3.1-X8.1 (26 ก.ย. · ผู้คุมงาน): ชื่อเดิมมีชื่อสมาชิก (needle PII) เป็น substring ⇒ แดงตลอดกาล
  // crmS — per-person scope + schedules
  const pS = await mkPipe(tidA, crmS, true);
  await mkDeal(tidA, crmS, pS, { ownerUserId: uS1, stage: 2, kind: "WON", value: 100_000, closedAt: at("2026-09-20T05:00:00.000Z"), teamId: teamT });
  await mkDeal(tidA, crmS, pS, { ownerUserId: uS1, stage: 0, value: 30_000, teamId: teamT });
  await mkDeal(tidA, crmS, pS, { ownerUserId: uS2, stage: 2, kind: "WON", value: 50_000, closedAt: at("2026-09-21T05:00:00.000Z"), teamId: teamT });
  for (const sys of [crmL, crmK, crmJ, crmU, crmV]) { const p = await mkPipe(tidA, sys, true); await mkDeal(tidA, sys, p, { ownerUserId: uS1, stage: 2, kind: "WON", value: 9_000, closedAt: at("2026-09-22T05:00:00.000Z") }); }
  info(`fixtures: tenants ${TENANTS.length} · CRM systems 8 · sensitive field ${sensOk}`);

  // ═════════════════════════════════════════════════════════════════════════════
  // S6.1–S6.3 — synthetic truth (hand-computed numbers)
  // ═════════════════════════════════════════════════════════════════════════════
  {
    const f: Flt = { pipelineId: pF.id, from: "2026-08-01", to: "2026-08-31" };
    const want = [{ entered: 3, left: 2, ratePct: 100, avgDays: 3 }, { entered: 2, left: 2, ratePct: 66.7, avgDays: 2.5 }, { entered: 1, left: 0, ratePct: 50, avgDays: null }];
    const mine = await expFunnel(await reportScope(tidA, crmF, oA), f);
    const selfOk = j(mine.stages) === j(want);
    const r = await call(fn.funnel, cF, oA, f);
    const st = rowsOf(r.v, "stages");
    const d = r.ok ? want.flatMap((w, i) => diffRow(st[i], w as Row, ["entered", "left", "ratePct", "avgDays"], { ratePct: 0.051, avgDays: 0.051 }).map((x) => `${i}:${x}`)) : ["call"];
    chk("C3.1-S6.1", "synthetic funnel (hand-computed): A s1 2 d → s2 3 d → WON · B s1 4 d → s2 2 d → LOST · C s1 open ⇒ stages [s1, s2, WON] entered 3/2/1 · left 2/2/0 · rate 100/66.7/50 · avgDays 3/2.5/— (the LOST stage is not a funnel row)",
      selfOk && r.ok && st.length === 3 && d.length === 0, j(want), `oracleSql=${selfOk ? "ok" : j(mine.stages)} svc=${r.ok ? `${st.length} stages ${d.join(" ")}` : r.err}${ABSENT}`);
  }
  {
    const f: Flt = { pipelineId: pF.id, from: "2026-10-01", to: "2026-11-30" };
    const wantM = new Map([["2026-11", { deals: 3, pipelineSatang: 600_000, bestCaseSatang: 300_000, commitSatang: 100_000, weightedSatang: 130_000, closedSatang: 70_000 }]]) as RowMap;
    const wantO = new Map([[uS1, { deals: 2, pipelineSatang: 300_000, bestCaseSatang: 300_000, commitSatang: 100_000, weightedSatang: 100_000, closedSatang: 70_000 }], [uS2, { deals: 1, pipelineSatang: 300_000, bestCaseSatang: 0, commitSatang: 0, weightedSatang: 30_000, closedSatang: 0 }]]) as RowMap;
    const scF = await reportScope(tidA, crmF, oA);
    const selfOk = diffMaps(await expForecast(scF, f, "month"), wantM, FC_FIELDS).length === 0 && diffMaps(await expForecast(scF, f, "owner"), wantO, FC_FIELDS).length === 0;
    const rm = await call(fn.forecast, cF, oA, { ...f, groupBy: "month" });
    const ro = await call(fn.forecast, cF, oA, { ...f, groupBy: "owner" });
    const d = [...(rm.ok ? diffMaps(mapOf(rowsOf(rm.v, "rows"), FC_FIELDS), wantM, FC_FIELDS) : ["month:call"]), ...(ro.ok ? diffMaps(mapOf(rowsOf(ro.v, "rows"), FC_FIELDS), wantO, FC_FIELDS).map((x) => `owner:${x}`) : ["owner:call"])];
    chk("C3.1-S6.2", "synthetic forecast (hand-computed · Thai months): a COMMIT deal closing 31 Oct 17:30Z (= 1 Nov Thai) is November · probabilityOverride 25 beats the stage's 50 · OMITTED is out · closed uses wonValueSatang (70,000) over valueSatang · a deal closing 30 Nov 17:30Z (= 1 Dec Thai) is outside a period ending 30 Nov ⇒ Nov = 3 deals · 600,000 · 300,000 · 100,000 · weighted 130,000 · closed 70,000 (and the same split per owner)",
      selfOk && rm.ok && ro.ok && d.length === 0, "Nov only", `oracleSql=${selfOk} ${rm.ok ? cut(d.join(" "), 200) : rm.err}${ABSENT}`);
  }
  {
    const want = { leads: 2, deals: 2, wonDeals: 1, wonValueSatang: 60_000, costSatang: 15_000, roi: 4 } as Row;
    const mine = (await expSources(await reportScope(tidA, crmF, oA), {})).byCampaign.get(mc.id);
    const selfOk = !!mine && diffRow(mine, want, Object.keys(want)).length === 0;
    const r = await call(fn.sources, cF, oA, {});
    const row = rowsOf(r.v, "byCampaign").find((x) => String(x?.key) === mc.id);
    const d = row ? diffRow(row, want, Object.keys(want), { roi: 0.011 }) : ["row missing"];
    chk("C3.1-S6.3", "ROI of a campaign (hand-computed): 2 leads with sourceDetail.campaignId = an MktCampaign whose variants cost 10,000 + 5,000 satang, one of them won 60,000 ⇒ leads 2 · deals 2 · won 1 · 60,000 · cost 15,000 · roi 4",
      selfOk && r.ok && d.length === 0, j(want), `oracleSql=${selfOk ? "ok" : j(mine)} svc=${r.ok ? d.join(" ") : r.err}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X1.5 / X1.6 · S2.4 — per-person scope, cross-scope, filter safety
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X1 · scope (throwaway) · S2.4 ──");
  {
    const res: string[] = [];
    let ok = true;
    for (const [label, actor, uid] of [["s1 default", s1, uS1], ["s2 +report.team", s2team, uS2], ["s2 +report.all", s2all, uS2]] as [string, Actor, string][]) {
      const sc = await reportScope(tidA, crmS, actor);
      const [eo, er] = [await expOverview(sc, {}), await expReps(sc, {})];
      const [ro, rr] = [await call(fn.overview, ctxA(crmS, uid), actor, {}), await call(fn.reps, ctxA(crmS, uid), actor, {})];
      const d = [...(ro.ok ? diffRow(ro.v, eo, OV_FIELDS, { winRatePct: 0.051, avgWonSatang: 1 }) : ["ov:call"]), ...(rr.ok ? diffMaps(mapOf(rowsOf(rr.v, "rows"), REP_A), er, REP_A) : ["reps:call"])];
      if (d.length) ok = false;
      res.push(`${label}(${sc.level}):won ${num(ro.v?.wonDeals)}/${eo.wonDeals} ${cut(d.join(" "), 60)}`);
    }
    const levels = [(await reportScope(tidA, crmS, s1)).level, (await reportScope(tidA, crmS, s2team)).level, (await reportScope(tidA, crmS, s2all)).level];
    chk("C3.1-X1.5", "report level per person (no policy in the shop): a STAFF with only crm.report.view sees ONLY HIS OWN numbers (OWN · blueprint §6.2 \"ของตัวเอง\") · + crm.report.team ⇒ his team · + crm.report.all ⇒ the whole shop — each equal to the SQL of that level",
      ok && j(levels) === j(["OWN", "TEAM", "ALL"]), "OWN · TEAM · ALL", `${res.join(" | ")}${ABSENT}`);
  }
  {
    const tries: [string, Res][] = [
      ["system of another tenant", await call(fn.overview, { tenantId: tidB, systemId: crmS, actorUserId: uOut }, oOut, {})],
      ["non-CRM system", await call(fn.overview, { tenantId: tidA, systemId: memA, actorUserId: uA }, oA, {})],
      ["seed tenant + foreign system", await call(fn.overview, { tenantId: T, systemId: crmS, actorUserId: uOwner.id }, aOwner, {})],
      ["tenant A + tenant B system", await call(fn.overview, { tenantId: tidA, systemId: crmB, actorUserId: uA }, oA, {})],
      ["export in tenant B system", await call(fn.startExport, { tenantId: tidA, systemId: crmB, actorUserId: uA }, oA, { tab: "overview", filters: {} })],
    ];
    const bad = tries.filter(([, r]) => !refusedAs(r, ["NOT_FOUND"])).map(([k, r]) => `${k}:${r.ok ? "ACCEPTED" : r.code}`);
    const leak = tries.some(([, r]) => r.msg.includes(TAG) || r.msg.includes(crmS) || r.msg.includes(crmB));
    chk("C3.1-X1.6", "cross-scope = 404-not-403: a system of another tenant · a non-CRM system · the seed tenant pointing at a throwaway system · tenant A pointing at tenant B's CRM system (reports and export) are all NOT_FOUND in Thai with nothing of the other side in the message",
      bad.length === 0 && !leak, "5 × NOT_FOUND", `accepted=${cut(bad.join(" | "), 200) || "-"} leak=${leak}${ABSENT}`);
  }
  {
    const eT = await expOverview(scThana, { teamId: krabi });
    const rT = await call(fn.overview, ctxSeed(uThana.id), aThana, { teamId: krabi });
    const narrowOk = rT.ok ? diffRow(rT.v, eT, OV_FIELDS, { winRatePct: 0.051, avgWonSatang: 1 }).length === 0 && n0(num(rT.v?.openDeals)) === 0 : refusedAs(rT, ["VALIDATION", "NOT_FOUND"]);
    const bad: string[] = [];
    for (const [k, f] of [["foreign team", { teamId: teamB }], ["foreign pipeline", { pipelineId: pF.id }], ["month 13", { from: "2026-13-45" }], ["from > to", { from: "2026-10-10", to: "2026-10-01" }], ["not a date", { to: "เมื่อวาน" }]] as [string, Flt][]) {
      const r = await call(fn.overview, cO, aOwner, f);
      const zero = r.ok && OV_FIELDS.every((fl) => (num(r.v?.[fl]) ?? 0) === 0);
      const okay = k.startsWith("foreign") ? refusedAs(r, ["VALIDATION", "NOT_FOUND"]) || zero : refusedAs(r, ["VALIDATION"]);
      if (!okay) bad.push(`${k}:${r.ok ? "ACCEPTED" : r.code}`);
    }
    chk("C3.1-S2.4", "filters are safe: thana asking for ทีมกระบี่ gets the intersection with his own scope (zero — a filter never widens visibility) · a team/pipeline id of another tenant is refused (or yields nothing) · an impossible date, from > to and a non-date are VALIDATION in Thai",
      narrowOk && bad.length === 0, "narrow · refused", `thana+krabi=${rT.ok ? `open ${num(rT.v?.openDeals)}` : rT.code} bad=${bad.join(" | ") || "-"}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X6 · X8.1 · X10 — hostile cells · no member/contact PII · private export
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X6 · X8 · X10 (export) ──");
  const exportCsv = async (ctx: Any, actor: Actor, tab: string, filters: Flt) => {
    const st = await call(fn.startExport, ctx, actor, { tab, filters });
    const jobId = jobIdOf(st);
    const run = await call(fn.runExportJobs, { now: new Date(), tenantIds: [ctx.tenantId], systemIds: [ctx.systemId] });
    const got = jobId ? await call(fn.getExport, ctx, actor, jobId) : MISSING;
    return { st, run, got, jobId, csv: String(got.v?.csv ?? "") };
  };
  const exF = await exportCsv(cF, oA, "forecast", { pipelineId: pX.id });
  const exS = await exportCsv(cF, oA, "sources", {});
  const exR = await exportCsv(cF, oA, "reps", {});
  {
    const hostileIn = exF.csv.includes(`'=HYPERLINK(`) && exS.csv.includes(`'@SUM(1+1)`);
    const danger = [...dangerousCells(exF.csv), ...dangerousCells(exS.csv), ...dangerousCells(exR.csv)];
    chk("C3.1-X6.1", "CSV neutralisation through `csvRow`: a deal titled =HYPERLINK(…) appears in the forecast export's deal section as '=HYPERLINK(…) and a web-form lead whose utm.campaign is @SUM(1+1)*cmd|… appears in the sources export as '@SUM(…) — no cell of the three exports starts with = + - @ (numbers excepted)",
      exF.got.ok && exS.got.ok && hostileIn && danger.length === 0, "neutralised", `forecast=${exF.got.ok ? exF.csv.length : exF.got.err} sources=${exS.got.ok ? exS.csv.length : exS.got.err} hostileNeutralised=${hostileIn} dangerous=${cut(danger.slice(0, 3).join(" · "), 120) || "-"}${ABSENT}`);
  }
  {
    const bad: string[] = [];
    for (const [k, args] of [["tab", { tab: `${TAG}-nope`, filters: {} }], ["tab missing", { filters: {} }], ["filter date", { tab: "overview", filters: { from: "2026-02-30" } }], ["filter foreign pipeline", { tab: "overview", filters: { pipelineId: pS.id } }]] as [string, Any][]) {
      const r = await call(fn.startExport, cF, oA, args);
      if (!refusedAs(r, ["VALIDATION", "NOT_FOUND"])) bad.push(`${k}:${r.ok ? "ACCEPTED" : r.code}`);
    }
    const jobsF = n0((await Q(S`SELECT count(*)::int AS n FROM "CrmImportJob" WHERE "systemId" = ${crmF}`))[0]?.n);
    chk("C3.1-X6.2", "hostile export requests write nothing: an unknown/missing tab, an impossible date and a pipeline of ANOTHER CRM system of the same shop are refused in Thai (VALIDATION/NOT_FOUND) and no job row is created for them (only the 3 real exports exist)",
      bad.length === 0 && jobsF === 3, "refused · 3 jobs", `accepted=${bad.join(" | ") || "-"} jobs=${jobsF}${ABSENT}`);
  }
  {
    const tabs: string[] = [];
    for (const [tab, f] of TAB_FN) { const r = await call(f, cF, oA, {}); tabs.push(r.ok ? j(r.v) : ""); }
    const blob = `${tabs.join("\n")}\n${exF.csv}\n${exS.csv}\n${exR.csv}`;
    const hits = [...PII, BIRTH].filter((p) => blob.includes(p));
    const memberDeal = exF.csv.includes(`ดีลผูกสมาชิก-${TAG}`);
    chk("C3.1-X8.1", "reports and exports carry NO personal data: the 8 tab payloads and the forecast/sources/reps CSVs contain no contact name/phone/e-mail and nothing of the linked member (phone · e-mail · birth date · the value of a `sensitive` member field) — while the member-linked deal itself IS in the forecast export (so the scan looked at the right rows)",
      tabs.every((x) => x.length > 0) && memberDeal && hits.length === 0 && sensOk, "0 PII · deal present", `tabs=${tabs.filter((x) => x.length > 0).length}/8 memberDeal=${memberDeal} pii=${cut(hits.slice(0, 3).join(","), 120) || "-"} sensitiveFixture=${sensOk}${ABSENT}`, "CRITICAL");
  }
  {
    const dto = exF.got.v ?? {};
    const urlKeys = Object.entries(dto as Record<string, unknown>).filter(([k, v]) => k !== "csv" && typeof v === "string" && /^(https?:|private:)/i.test(v)).map(([k]) => k);
    const row = exF.jobId ? ((await P.crmImportJob.findFirst({ where: { id: exF.jobId } }).catch(() => null)) as Any) : null;
    const asset = row?.fileId ? ((await P.fileAsset.findFirst({ where: { id: row.fileId } }).catch(() => null)) as Any) : null;
    const priv = !row?.fileId || (!!asset && /\/private\//.test(String(asset.path)) && String(asset.cdnUrl).startsWith("private://"));
    chk("C3.1-X10.1", "the export result is private: getExport's DTO carries no CDN/URL field (the CSV is handed to the requester only) and, when the job stored a file, it is a PRIVATE FileAsset (t/<tenant>/private/… · cdnUrl private://)",
      exF.got.ok && urlKeys.length === 0 && priv, "no URL · private", `urlKeys=${urlKeys.join(",") || "-"} fileId=${row?.fileId ?? "-"} private=${priv}${ABSENT}`, "MAJOR");
  }
  {
    const refused: string[] = [];
    const cV = ctxA(crmV);
    for (const [k, r] of [["overview", await call(fn.overview, cV, oA, {})], ["forecast", await call(fn.forecast, cV, oA, { groupBy: "month" })], ["getReport", await call(fn.getReport, cV, oA, "reps", {})],
      ["startExport", await call(fn.startExport, cV, oA, { tab: "overview", filters: {} })], ["saveSchedule", await call(fn.saveSchedule, cV, oA, { tab: "overview", frequency: "DAILY", recipientUserIds: [uA] })]] as [string, Res][]) {
      if (!refusedAs(r, ["CRM_V2_DISABLED", "FORBIDDEN", "NOT_FOUND"])) refused.push(`${k}:${r.ok ? "ACCEPTED" : r.err}`);
    }
    const jobsV = n0((await Q(S`SELECT count(*)::int AS n FROM "CrmImportJob" WHERE "systemId" = ${crmV}`))[0]?.n);
    const sched = ((await P.appSystem.findFirst({ where: { id: crmV } })) as Any)?.settings?.crm?.reportSchedules;
    chk("C3.1-U.1", "uiVersion 1 (R-E.14): on a v1 CRM system every report, the export and saving a schedule are refused (CRM_V2_DISABLED/FORBIDDEN/NOT_FOUND, Thai) and nothing is written (no job row, no schedule)",
      refused.length === 0 && jobsV === 0 && (!Array.isArray(sched) || sched.length === 0), "5 refused · nothing written", `accepted=${cut(refused.join(" | "), 200) || "-"} jobs=${jobsV} schedules=${Array.isArray(sched) ? sched.length : 0}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — schedules in settings.crm.reportSchedules[] + the daily sender
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S4 · schedules ──");
  const emailOf = new Map((await P.user.findMany({ where: { id: { in: USERS } }, select: { id: true, email: true }, take: 20 }) as Any[]).map((u) => [String(u.id), String(u.email)]));
  const schedIdOf = (r: Res) => { const id = String(r.v?.id ?? r.v?.scheduleId ?? ""); if (id) SCHED_IDS.push(id); return id; };
  const crmRaw = async (sys: string) => (((await P.appSystem.findFirst({ where: { id: sys } })) as Any)?.settings?.crm ?? {}) as Any;
  const runS = (now: Date, sys: string) => call(fn.runScheduled, { now, tenantIds: [tidA], systemIds: [sys], deps: DEPS });
  let sidS = "";
  {
    const defsBefore = n0(await P.reportDef.count({ where: { tenantId: tidA } }).catch(() => -1));
    const sv = await call(fn.saveSchedule, cS, oA, { tab: "reps", frequency: "DAILY", recipientUserIds: [uA, uS1], filters: {} });
    sidS = schedIdOf(sv);
    const raw = await crmRaw(crmS);
    const arr = Array.isArray(raw.reportSchedules) ? (raw.reportSchedules as Any[]) : [];
    const mine = arr.find((x) => String(x?.id) === sidS);
    const list = await call(fn.listSchedules, cS, oA);
    const listed = rowsOf(list.v, "schedules", "rows", "items").some((x) => String(x?.id) === sidS);
    const defsAfter = n0(await P.reportDef.count({ where: { tenantId: tidA } }).catch(() => -1));
    const audit = n0(await P.auditLog.count({ where: { tenantId: tidA, action: "crm.report.schedule.save" } }));
    chk("C3.1-S4.1", "saveSchedule stores the schedule in `settings.crm.reportSchedules[]` (R-E.6 — no table, no ReportDef row): { id, tab, frequency, recipientUserIds, filters } · the sibling keys uiVersion/bridgesEnabled survive (one jsonb_set) · listSchedules shows it · audited `crm.report.schedule.save`",
      sv.ok && !!sidS && !!mine && mine.tab === "reps" && mine.frequency === "DAILY" && j(mine.recipientUserIds ?? []).includes(uA) && j(mine.recipientUserIds ?? []).includes(uS1) && raw.uiVersion === 2 && raw.bridgesEnabled === true && list.ok && listed && defsAfter === defsBefore && audit >= 1,
      "stored · listed · audited", `save=${rd(sv)} stored=${cut(j(mine ?? null), 120)} siblings=${raw.uiVersion}/${raw.bridgesEnabled} listed=${listed} reportDef ${defsBefore}→${defsAfter} audit=${audit}${ABSENT}`);
  }
  {
    MAIL.length = 0;
    const N = at("2026-10-05T01:00:00+07:00");
    const run = await runS(N, crmS);
    const ms = mailsOf(sidS);
    const toOwner = ms.find((m) => m.req?.to === emailOf.get(uA));
    const toS1 = ms.find((m) => m.req?.to === emailOf.get(uS1));
    const csvOf = (m: Any) => String((m?.req?.attachments ?? [])[0]?.content ?? "");
    const ownerSees = csvOf(toOwner).includes(NAME.S1) && csvOf(toOwner).includes(NAME.S2);
    const s1Own = csvOf(toS1).includes(NAME.S1) && !csvOf(toS1).includes(NAME.S2);
    const shaped = ms.every((m) => thai(m.req?.subject) && !/[\r\n]/.test(String(m.req?.subject ?? "")) && /\.csv$/i.test(String((m.req?.attachments ?? [])[0]?.filename ?? "")) && String(m.req?.slot ?? "").length > 0);
    const reg = (globalThis as Any)[Symbol.for("shark.platform.minute-jobs.registry")] as Map<string, Any> | undefined;
    const job = reg?.get("crm.reports.scheduled");
    const jobOk = !!job && job.everyMinutes === 1440 && (job.cadence ?? "minute") === "daily" && String(job.run).includes("runScheduled");
    chk("C3.1-S4.2", "the daily sender e-mails the scheduled report: ONE e-mail per recipient (owner + s1) to their User.email, Thai subject without CR/LF, the tab as a .csv attachment — computed with EACH recipient's own scope (the owner's CSV lists s1 and s2, s1's lists only himself) · the registered daily job `crm.reports.scheduled` (1440 min · daily) now runs runScheduled",
      run.ok && ms.length === 2 && !!toOwner && !!toS1 && ownerSees && s1Own && shaped && jobOk, "2 mails · own scope · job wired", `run=${rd(run)} mails=${ms.length} owner=${!!toOwner}/${ownerSees} s1=${!!toS1}/${s1Own} shaped=${shaped} job=${jobOk}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X8.2 / X8.3 — recipients are staff of the tenant · e-mails carry no PII
  // ═════════════════════════════════════════════════════════════════════════════
  {
    const before = ((await crmRaw(crmS)).reportSchedules ?? []).length;
    const bad: string[] = [];
    for (const [k, rcp] of [["outsider user", [uOut]], ["raw e-mail", ["evil@example.com"]], ["mixed", [uA, uOut]], ["unknown id", [`${TAG}-ghost`]]] as [string, string[]][]) {
      const r = await call(fn.saveSchedule, cS, oA, { tab: "overview", frequency: "DAILY", recipientUserIds: rcp });
      if (!refusedAs(r, ["VALIDATION"])) { bad.push(`${k}:${r.ok ? "ACCEPTED" : r.code}`); schedIdOf(r); }
    }
    const after = ((await crmRaw(crmS)).reportSchedules ?? []).length;
    await P.membership.deleteMany({ where: { tenantId: tidA, userId: uS1 } });
    MAIL.length = 0;
    const run = await runS(at("2026-10-06T01:00:00+07:00"), crmS);
    const ms = mailsOf(sidS);
    chk("C3.1-X8.2", "recipients are restricted to staff of the tenant: a user of another tenant, a raw e-mail address, a mixed list and an unknown id are VALIDATION (nothing stored) · a recipient whose membership was removed after saving gets nothing on the next slot (only the owner is mailed)",
      bad.length === 0 && after === before && run.ok && ms.length === 1 && ms[0]?.req?.to === emailOf.get(uA), "4 refused · 1 mail", `accepted=${bad.join(" | ") || "-"} schedules ${before}→${after} run=${rd(run)} mails=${ms.map((m) => m.req?.to).join(",") || "-"}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X5 — scheduled report: overlap · crash after claim · fixed clock slots (+ jitter)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X5 · schedule lease + slots ──");
  const saveSimple = async (sys: string, extra: Record<string, unknown>) => schedIdOf(await call(fn.saveSchedule, ctxA(sys), oA, { tab: "overview", frequency: "DAILY", recipientUserIds: [uA], filters: {}, ...extra }));
  {
    const sid = await saveSimple(crmL, {});
    MAIL.length = 0;
    slowMs = 150;
    const NL = at("2026-10-05T02:00:00+07:00");
    const r1 = await Promise.all([0, 1].map(() => runS(NL, crmL)));
    const r2 = await Promise.all([0, 1, 2, 3].map((i) => runS(new Date(NL.getTime() + 37_000 + i * 250), crmL)));
    slowMs = 0;
    chk("C3.1-X5.1", "overlapping runs (2 together, then 4 together with jittered `now` inside the same Thai day, slow transport) ⇒ the schedule is e-mailed EXACTLY ONCE for that slot",
      !!sid && [...r1, ...r2].every((r) => r.ok) && mailsOf(sid).length === 1, "1 mail", `sid=${!!sid} ok=${[...r1, ...r2].filter((r) => r.ok).length}/6 mails=${mailsOf(sid).length}${ABSENT}`);
  }
  {
    const sid = await saveSimple(crmK, {});
    MAIL.length = 0;
    hangFor = sid || null;
    hangRelease = null;
    const NK = at("2026-10-06T01:00:00+07:00");
    const pA = sid ? runS(NK, crmK) : Promise.resolve(MISSING);
    for (let i = 0; i < 300 && !hangRelease; i += 1) await new Promise((r) => setTimeout(r, 50));
    const engaged = !!hangRelease;
    const b = await runS(new Date(NK.getTime() + 5 * MIN), crmK);
    const afterB = mailsOf(sid).length;
    const c = await runS(new Date(NK.getTime() + 16 * MIN), crmK);
    const afterC = mailsOf(sid).length;
    const d = await runS(new Date(NK.getTime() + 17 * MIN), crmK);
    const afterD = mailsOf(sid).length;
    const release = hangRelease as ((v: { ok: boolean }) => void) | null;
    if (release) release({ ok: false });
    await Promise.race([pA, new Promise((r) => setTimeout(r, 10_000))]);
    hangFor = null;
    const e = await runS(new Date(NK.getTime() + 18 * MIN), crmK);
    const afterE = mailsOf(sid).length;
    chk("C3.1-X5.2", "crash after claim: run A claims the slot and dies inside the transport (never returns) ⇒ a run 5 min later sends NOTHING (lease held — the claim is a lease, not a final \"sent\") · a run after the 15-min lease sends it ONCE · later runs, and A waking up with a failure, add nothing",
      engaged && b.ok && afterB === 0 && c.ok && afterC === 1 && d.ok && afterD === 1 && e.ok && afterE === 1, "0 · 1 · 1 · 1", `engaged=${engaged} +5m=${afterB} +16m=${afterC} +17m=${afterD} afterA=${afterE}${ABSENT}`);
  }
  {
    const jD = await saveSimple(crmJ, { frequency: "DAILY" });
    const jW = await saveSimple(crmJ, { frequency: "WEEKLY", weekday: 3 });
    const jM = await saveSimple(crmJ, { frequency: "MONTHLY", dayOfMonth: 1 });
    MAIL.length = 0;
    const times = [
      "2026-10-05T00:00:01.200+07:00", // Mon — first run: D1 · W no (before Wed) · M October (catch-up)
      "2026-10-05T23:59:59.800+07:00", // same Thai day
      "2026-10-06T00:00:00.300+07:00", // next day, only 23 h 59 m 59.1 s later — an interval model (≥ 24 h) would skip it
      "2026-10-06T09:00:00+07:00",
      "2026-10-08T00:00:00.500+07:00", // Thu — the week's Wednesday was missed ⇒ catch-up once
      "2026-10-09T00:00:00.100+07:00",
      "2026-10-14T00:00:00.100+07:00", // Wed of the next ISO week
      "2026-11-01T00:00:00.400+07:00", // Sun 1 Nov — new month · week of 26 Oct (Wed passed) · new day
      "2026-11-15T09:00:00+07:00",
    ];
    const got: Record<string, number[]> = { D: [], W: [], M: [] };
    let allOk = true;
    for (const t of times) {
      const r = await runS(at(t), crmJ);
      if (!r.ok) allOk = false;
      got.D!.push(mailsOf(jD).length);
      got.W!.push(mailsOf(jW).length);
      got.M!.push(mailsOf(jM).length);
    }
    const want = { D: [1, 1, 2, 2, 3, 4, 5, 6, 7], W: [0, 0, 0, 0, 1, 1, 2, 3, 4], M: [1, 1, 1, 1, 1, 1, 1, 2, 2] };
    chk("C3.1-X5.3", "fixed clock slots (C0.5 aligned windows from Thai midnight, never \"24 h since the last run\"): DAILY sends again at 00:00:00.3 the next day although only 23 h 59 m passed · WEEKLY (Wednesday) catches up on Thursday once per ISO week · MONTHLY (day 1) sends once per Thai month (catch-up on the first run of a month) — cumulative mails after 9 jittered runs equal the table",
      !!jD && !!jW && !!jM && allOk && j(got) === j(want), j(want), `${j(got)}${ABSENT}`);
  }
  {
    const rcp = [...emailOf.entries()].filter(([u]) => [uA, uS1, uS2, uNo].includes(u)).map(([, e]) => e);
    const all = MAIL.concat();
    const outside = all.filter((m) => !rcp.includes(String(m.req?.to)));
    const text = j(all.map((m) => [m.req?.subject, m.req?.html, m.req?.text, (m.req?.attachments ?? []).map((a: Any) => a?.content)]));
    const hits = [...PII, BIRTH].filter((p) => text.includes(p));
    const evs = (await P.outboxEvent.findMany({ where: { tenantId: tidA, type: { startsWith: "crm.report" } }, take: 50 })) as Any[];
    const evPii = PII.filter((p) => j(evs.map((e) => e.payload)).includes(p));
    chk("C3.1-X8.3", "the scheduled e-mails of this run go only to staff addresses of the tenant and carry no customer/member personal data in subject, body or CSV · any `crm.report.*` outbox event is ids-only",
      all.length >= 1 && outside.length === 0 && hits.length === 0 && evPii.length === 0, "staff only · 0 PII", `mails=${all.length} outside=${outside.map((m) => m.req?.to).join(",") || "-"} pii=${cut(hits.join(","), 80) || "-"} events=${evs.length}/${evPii.length}${ABSENT}`, "MAJOR");
  }
  {
    // U.2 — a v2 schedule is skipped while the system is on uiVersion 1 and resumes at 2 (rows kept)
    const sid = await saveSimple(crmU, {});
    MAIL.length = 0;
    await setCrm(crmU, { uiVersion: 1 });
    const r1 = await runS(at("2026-10-07T01:00:00+07:00"), crmU);
    const during = mailsOf(sid).length;
    await setCrm(crmU, { uiVersion: 2 });
    const r2 = await runS(at("2026-10-07T02:00:00+07:00"), crmU);
    const kept = ((await crmRaw(crmU)).reportSchedules ?? []).some((x: Any) => String(x?.id) === sid);
    chk("C3.1-U.2", "uiVersion 1 pauses a schedule without losing it: while the system is on v1 the sender skips it (0 mails) · back on v2 the same slot is sent once · the schedule row was kept all along",
      !!sid && r1.ok && during === 0 && r2.ok && mailsOf(sid).length === 1 && kept, "0 → 1 · kept", `sid=${!!sid} v1=${during} v2=${mailsOf(sid).length} kept=${kept}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X9 — audit · validation · permission
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X9 ──");
  {
    const sid = await saveSimple(crmS, { tab: "lost", frequency: "WEEKLY", weekday: 1 });
    const del = sid ? await call(fn.deleteSchedule, cS, oA, sid) : MISSING;
    const raw = await crmRaw(crmS);
    const gone = !(raw.reportSchedules ?? []).some((x: Any) => String(x?.id) === sid);
    const rows = (await P.auditLog.findMany({ where: { tenantId: tidA, action: { startsWith: "crm.report." } }, take: 200 })) as Any[];
    const acts = new Set(rows.map((r) => String(r.action)));
    const text = j(rows.map((r) => [r.before, r.after]));
    chk("C3.1-X9.1", "every mutation is audited without personal data: `crm.report.schedule.save`, `crm.report.schedule.delete` and `crm.report.export` rows exist for this tenant · deleteSchedule removes only that entry and the siblings of settings.crm (uiVersion 2, bridgesEnabled) survive",
      del.ok && gone && acts.has("crm.report.schedule.save") && acts.has("crm.report.schedule.delete") && acts.has("crm.report.export") && !PII.some((p) => text.includes(p)) && raw.uiVersion === 2 && raw.bridgesEnabled === true,
      "3 kinds · no PII · siblings", `delete=${rd(del)} gone=${gone} actions=${[...acts].join(",") || "-"} siblings=${raw.uiVersion}/${raw.bridgesEnabled}${ABSENT}`);
  }
  {
    const before = ((await crmRaw(crmS)).reportSchedules ?? []).length;
    const base = { tab: "overview", frequency: "DAILY", recipientUserIds: [uA], filters: {} };
    const bad: string[] = [];
    for (const [k, input] of [
      ["tab", { ...base, tab: `${TAG}-nope` }], ["frequency", { ...base, frequency: "HOURLY" }], ["weekday 8", { ...base, frequency: "WEEKLY", weekday: 8 }],
      ["dayOfMonth 31", { ...base, frequency: "MONTHLY", dayOfMonth: 31 }], ["no recipient", { ...base, recipientUserIds: [] }],
      ["21 recipients", { ...base, recipientUserIds: Array.from({ length: 21 }, () => uA) }], ["bad filter date", { ...base, filters: { from: "2026-02-30" } }],
    ] as [string, Any][]) {
      const r = await call(fn.saveSchedule, cS, oA, input);
      if (!refusedAs(r, ["VALIDATION"])) { bad.push(`${k}:${r.ok ? "ACCEPTED" : r.code}`); schedIdOf(r); }
    }
    const staffTry = await call(fn.saveSchedule, ctxA(crmS, uS2), staff(uS2, REPORT), base);
    if (!refusedAs(staffTry, ["FORBIDDEN"])) { bad.push(`staff:${staffTry.ok ? "ACCEPTED" : staffTry.code}`); schedIdOf(staffTry); }
    const after = ((await crmRaw(crmS)).reportSchedules ?? []).length;
    chk("C3.1-X9.2", "schedule input is validated in Thai (VALIDATION, nothing stored): unknown tab · frequency outside DAILY/WEEKLY/MONTHLY · weekday 8 · dayOfMonth 31 (max 28) · 0 or 21 recipients · an impossible filter date — and a STAFF with only crm.report.view may not schedule (FORBIDDEN · needs crm.report.all)",
      bad.length === 0 && after === before, "8 refused · 0 stored", `accepted=${cut(bad.join(" | "), 200) || "-"} schedules ${before}→${after}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 — UI (mockup 09) — static; pixel parity is gate D7
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S5 · UI static ──");
  {
    const files = [...new Set([PAGE, TAB_PAGE, ...walk(PAGE_DIR), ...walk(COMP_DIR)])].filter((f) => read(f).length > 0);
    const src = files.map(read).join("\n");
    const nav = read(NAV_FILE);
    let inv: Any[] = [];
    try { inv = (JSON.parse(read(INVENTORY)).rows ?? []) as Any[]; } catch { inv = []; }
    const rows = inv.filter((r) => r?.wo === "C3.1");
    const tabIds = ["overview", "forecast", "funnel", "reps", "activities", "lost", "sources", "scores"];
    const tabsOk = tabIds.every((k) => src.includes(`crm-report-tab-${k}`)) || (/crm-report-tab-\$\{/.test(src) && /REPORT_TABS/.test(src));
    const need = ["crm-report-filter-period", "crm-report-filter-team", "crm-report-filter-pipeline", "crm-report-export", "crm-report-schedule"].filter((t) => !src.includes(t));
    const invIds = new Set(rows.map((r) => String(r?.testid ?? "")));
    chk("C3.1-S5.1", `mockup 09: ${PAGE} + ${TAB_PAGE} with the 8 tabs (testids crm-report-tab-<key>), the filters period · team · pipeline, "ส่งออก CSV" and "ตั้งเวลาส่งอีเมล" (crm-report-filter-* · crm-report-export · crm-report-schedule) · nav entry { path "/crm/reports", status "ready", wo "C3.1" } · ≥ 13 inventory rows of wo C3.1 [static]`,
      read(PAGE).length > 0 && read(TAB_PAGE).length > 0 && tabsOk && need.length === 0 && /path:\s*"\/crm\/reports"[^}]*status:\s*"ready"[^}]*wo:\s*"C3\.1"/.test(nav) && rows.length >= 13 && invIds.has("crm-report-export"),
      "pages · tabs · filters · nav · ≥ 13 rows", `pages=${read(PAGE).length > 0}/${read(TAB_PAGE).length > 0} tabs=${tabsOk} missing=${need.join(",") || "-"} nav=${/\/crm\/reports/.test(nav)} rows=${rows.length}`, "MAJOR");
  }
  {
    const files = [...walk(PAGE_DIR), ...walk(COMP_DIR)];
    const isClient = (f: string) => /^\s*["']use client["']/.test(read(f));
    const isServer = (f: string) => /^\s*["']use server["']/.test(read(f));
    const badClient = files.filter(isClient).filter((f) => /from\s+["'](@\/lib\/core\/db|@prisma\/client|@\/lib\/modules\/crm(\/(?!.*-shared)[^"']*)?)["']/.test(read(f)));
    const serverFiles = [...files, "src/lib/modules/crm/reports-actions.ts"].filter((f) => read(f).length > 0 && isServer(f));
    const serverBad = serverFiles.filter((f) => /export\s+(type|interface|const|let|function\s)/.test(read(f)) || !/assertCrmV2|crmUiVersion/.test(read(f)));
    const ui = files.map(read).join("\n");
    const bom = /﻿|\\uFEFF|\\ufeff/.test(ui) && /text\/csv/.test(ui);
    chk("C3.1-S5.2", "the pages obey the C1.x rules: no `'use client'` file imports prisma or a non-shared CRM module · every `\"use server\"` file exports async functions only and calls assertCrmV2 · the download layer adds the BOM (U+FEFF) and serves text/csv (the service output has none) [static]",
      files.length > 0 && badClient.length === 0 && serverFiles.length >= 1 && serverBad.length === 0 && bom,
      "clean · BOM in UI", `files=${files.length} badClient=${badClient.join(",") || "-"} server=${serverFiles.length} serverBad=${serverBad.join(",") || "-"} bom=${bom}`, "MAJOR");
  }
} catch (e) {
  chk("C3.1-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — seed rows this run caused · shared state rows · throwaway tenants
  // ═════════════════════════════════════════════════════════════════════════════
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* order/FK — retried next pass */ } };
  const pending = hangRelease as ((v: { ok: boolean }) => void) | null;
  if (pending) pending({ ok: false });
  hangFor = null;
  if (T && SYS) {
    const jobs = (await P.crmImportJob.findMany({ where: { systemId: SYS, kind: "REPORT_EXPORT", createdAt: { gte: START } }, select: { id: true, fileId: true }, take: 500 }).catch(() => [])) as Any[];
    const storage = (await import("@/lib/storage/service" as string).catch(() => ({}))) as Any;
    for (const jb of jobs) if (jb.fileId) {
      if (typeof storage.deleteFileAsset === "function") await del(() => storage.deleteFileAsset({ tenantId: T }, jb.fileId));
      await del(() => P.fileAsset.deleteMany({ where: { id: jb.fileId, tenantId: T } }));
    }
    await del(() => P.crmImportJob.deleteMany({ where: { id: { in: jobs.map((x) => x.id) } } }));
    await del(() => P.auditLog.deleteMany({ where: { tenantId: T, action: { startsWith: "crm.report." }, createdAt: { gte: START } } }));
  }
  if (SCHED_IDS.length || TAG) {
    const states = (await P.opsAlertState.findMany({ where: { OR: [...SCHED_IDS.map((s) => ({ source: { contains: s } })), { source: { contains: TAG } }] }, select: { id: true }, take: 500 }).catch(() => [])) as Any[];
    if (states.length) await del(() => P.opsAlertState.deleteMany({ where: { id: { in: states.map((x) => x.id) } } }));
  }
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  let tables: string[] = [];
  if (ids.length > 0) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[])
      .map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    const files = ((await P.$queryRawUnsafe(`SELECT "fileId" FROM "CrmImportJob" WHERE "tenantId" IN (${inList}) AND "fileId" IS NOT NULL`).catch(() => [])) as Any[]).map((r) => String(r.fileId));
    const storage = (await import("@/lib/storage/service" as string).catch(() => ({}))) as Any;
    for (const fid of files) for (const tid of ids) if (typeof storage.deleteFileAsset === "function") await del(() => storage.deleteFileAsset({ tenantId: tid }, fid));
    for (let pass = 0; pass < 4; pass += 1)
      for (const t of tables) await del(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
    for (const id of ids) {
      await del(() => P.appSystemUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.appSystem.deleteMany({ where: { tenantId: id } }));
      await del(() => P.businessUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.tenant.delete({ where: { id } }));
    }
  }
  for (const uid of USERS) await del(() => P.appNotification.deleteMany({ where: { recipientUserId: uid } }));
  for (const uid of USERS) await del(() => P.membership.deleteMany({ where: { userId: uid } }));
  for (const uid of USERS) await del(() => P.user.delete({ where: { id: uid } }));
  try {
    const left: string[] = [];
    if (ids.length) {
      const inList = ids.map((x) => `'${x}'`).join(",");
      for (const t of tables) {
        const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[];
        const n = Number(r?.[0]?.n ?? 0);
        if (n > 0) left.push(`${t}=${n}`);
      }
    }
    const tenants = ids.length ? await P.tenant.count({ where: { id: { in: ids } } }) : 0;
    const users = USERS.length ? await P.user.count({ where: { id: { in: USERS } } }) : 0;
    const seedAfter = T && SYS ? j(await Q(S`SELECT
      (SELECT count(*) FROM "CrmDeal" WHERE "systemId" = ${SYS})::int AS deals,
      (SELECT md5(COALESCE(string_agg("id" || ':' || "updatedAt"::text, ',' ORDER BY "id"), '')) FROM "CrmDeal" WHERE "systemId" = ${SYS}) AS "dealSig",
      (SELECT count(*) FROM "CrmContact" WHERE "systemId" = ${SYS})::int AS contacts,
      (SELECT count(*) FROM "CrmActivity" WHERE "systemId" = ${SYS})::int AS acts,
      (SELECT count(*) FROM "CrmDealStageHistory" WHERE "tenantId" = ${T})::int AS hist,
      (SELECT count(*) FROM "CrmDealPayment" WHERE "systemId" = ${SYS})::int AS pays,
      (SELECT count(*) FROM "CrmImportJob" WHERE "systemId" = ${SYS})::int AS jobs,
      (SELECT count(*) FROM "AuditLog" WHERE "tenantId" = ${T} AND "action" LIKE 'crm.report.%')::int AS audits,
      (SELECT count(*) FROM "CrmVisibilityPolicy" WHERE "systemId" = ${SYS})::int AS pol,
      (SELECT md5(COALESCE("settings"::text, '')) FROM "AppSystem" WHERE "id" = ${SYS}) AS settings,
      (SELECT count(*) FROM "Membership" WHERE "tenantId" = ${T})::int AS members`)) : seedBefore;
    chk("C3.1-CLEAN", "the oracle gives the QC database back exactly as found — the seeded shop's deals/contacts/activities/history/payments/policies/settings/memberships are byte-for-byte the same signature as before, the export jobs + `crm.report.*` audit rows this run caused on the seed are gone, and every throwaway tenant, user and schedule-state row is swept",
      left.length === 0 && tenants === 0 && users === 0 && seedAfter === seedBefore, "0 rows · seed unchanged", `${left.join(" · ") || "-"} · tenants=${tenants} users=${users} seed=${seedAfter === seedBefore ? "same" : `${cut(seedBefore, 120)} → ${cut(seedAfter, 120)}`}`, "MAJOR");
  } catch (e) {
    chk("C3.1-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
  }
  await prisma.$disconnect().catch(() => null);
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C3.1: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
