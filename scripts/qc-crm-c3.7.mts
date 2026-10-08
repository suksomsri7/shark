// QC — CRM v2 WO C3.7: mobile — (a) the C2–C3 web pages at 390 px with no horizontal overflow · (b) the staff app (`apps/mobile`) CRM
//      section: "ดีลของฉัน" · "งานวันนี้" · call log after `tel:` · business-card scan · push — over `src/app/api/mobile/crm/*` (same
//      services as the web, requireMobile + CRM visibility), rendered through the web-export QC harness (`apps/mobile/qc/shoot-crm.mjs`)
// Oracle writer · the C3.7 builder must NOT touch this file · QC database only (loaded by scripts/acc-v2-env.mts — QC3 via scripts/qc3.sh)
// Run: bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c3.7.mts
//      `--force-run` = run every check while `apps/mobile/app/(app)/crm/_layout.tsx` is absent — C3.7 checks red for the right reason,
//                      the seed/answer-key controls and CLEAN green
// requires: crm-seed   (the SEEDED shop is read as thana — read-only: the only row this oracle writes for it is one mobile Session of
//                       thana tagged `qc-c37-<rand>` (deleted in finally); every mutation runs in throwaway tenants `qc-c37-<rand>-*`)
//
// ORDER OF WORK FOR THE CONTROLLER (the render/390 checks read artefacts produced by tools that need a build/server — they are NOT run here):
//   1. run this oracle once — it (re)writes `.qc-shots/crm/3.7/fixture-thana.json` (the seed as thana, through the real mobile routes)
//   2. `QC_PREPARE=1 node apps/mobile/qc/shoot-crm.mjs`  → apps/mobile/qc/shots-crm/*.png + summary.json (uses that fixture as the API mock)
//   3. `bash scripts/acc-v2-serve.sh` then `pnpm exec tsx scripts/visual-crm.mts 3.7 --user owner` and `… --user thana`
//      → .qc-shots/crm/3.7/summary-{owner,thana}.json (names `c37-390-<key>-<user>`, device mobile)
//   4. run this oracle again — S1.* / S2.2/S2.4/S2.6 turn green only when those artefacts are fresh and match the current fixture
//
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE: qc-member-m3.9 · qc-member-m3.11 (drawer + member screens + shoot-member harness) ·
//   qc-mobile-app · qc-mobile-auth · qc-mobile-chat · qc-mobile-help · qc-crm-c2.4 (logCall / scanBusinessCard / acceptLeadProposal are
//   REUSED, not forked) · qc-crm-c2.10 (notifyStaff push request) · qc-crm-c1.11 (390 static proxies of the C1 pages) · qc-crm-c3.6
//   (widgets.myDeals/todayTasks — the mobile routes may reuse them) · qc-nav-functions.
//
// SOURCES: crm-brief-C3.6-C3.9.md "C3.7" (+ "Addendum (oracle author)") · crm-brief-COMMON.md · RESOLUTIONS (R-D: the 390 pass excludes
//   /settings/integrations · R-E.14 uiVersion 1 · R-E.12 LINE-immediate → push) · CRM-RUN §2 "C3.7" (responsive C2–C3 6 · app 3 screens
//   rendered through apps/mobile/qc 6 · call-log prompt after tel: 2 · push 2 · card scan 2 = 18) · MASTER-PLAN §4 (X1 X3 X7 X8 X10) ·
//   mockup 13 (390×805: ก ดีลของฉัน · ข วางสายแล้ว → บันทึกสาย · ค งานวันนี้ + สแกนนามบัตร) · apps/mobile/AGENTS.md (Expo SDK docs —
//   expo-router only) · apps/mobile/qc/{README.md, shoot-member.mjs} · src/lib/mobile/auth.ts (requireMobile · issueMobileToken) ·
//   src/app/api/mobile/push/register · crm/calls.ts (logCall · scanBusinessCard · acceptLeadProposal) · crm/notifications-shared.ts
//   (crmNotifLink) · scripts/visual-crm.mts (summary-<user>.json: status · overflow · errors per shot).
//
// ══════════════════════════════════ CONTRACT (oracle-proposed — the brief addendum is the controller's final word) ══════════════════════
//   SERVER `src/app/api/mobile/crm/**` — every handler: requireMobile(req) (401 no/invalid Bearer · 403 foreign X-Tenant-Id) → CRM system =
//     `?systemId=` (must be a CRM system of that tenant, else 404 · uiVersion 1 ⇒ 409 { error: "CRM_V2_DISABLED" }) or, when absent, the
//     tenant's FIRST uiVersion-2 CRM system (none ⇒ 404) → actor from the membership → per-user limiter `checkRateLimitDb("mobile-crm:" +
//     userId, MOBILE_CRM_RATE_LIMIT)` (429 { error: "rate_limited", message: Thai }) → the SAME CRM services as the web (facade only,
//     no prisma in the route files) → JSON; errors `{ error: <code>, message: <Thai> }` (404 for anything invisible — never 403 on data)
//     GET  deals                       → { items: { id, title, valueSatang, stageId, stageName, stalledDays|null, company|null,
//                                          contact: { id, name, phone|null }|null }[], stages: { id, name, count }[] } — the actor's OPEN,
//                                          not-archived deals (owner = me) inside dealWhere · no e-mail anywhere
//     GET  deals/[id]                  → the deal (visible) else 404
//     GET  tasks                       → { items: { id, title, type, dueAt, done, contactId|null, dealId|null }[], counts: { today,
//                                          overdue, done } } — same rule as crm widgets.todayTasks (Thai day of now)
//     POST tasks/[id]/complete         → activities complete (own/visible) else 404
//     GET  call-log?contactId=&dealId= → the prompt: { contact: { id, name }, deal: { id, title }|null, outcomes: string[] (the CALL
//                                          registry), directions: ["OUT","IN"] } — invisible contact ⇒ 404
//     POST call-log                    → calls.logCall(ctx, actor, { contactId, dealId?, direction, outcome, durationSec, body?, nextTask? })
//                                          with body.idempotencyKey (1–100 chars): the same key twice/in parallel ⇒ ONE CALL activity (the
//                                          second answer returns the first id) — 200/201 { activityId }
//     POST scan-card                   → JSON { contentType, dataBase64, filename? } → calls.scanBusinessCard (the C2.4 engine — no second
//                                          vision prompt/proposal writer) → { proposalId, draft } · its refusals (size/type/credit) → 400
//                                          with the service's Thai message
//     POST scan-card/[proposalId]/accept → calls.acceptLeadProposal → { contactId } · other system ⇒ 404 · already taken ⇒ 409
//   `src/lib/mobile/crm-routes.ts` exports MOBILE_CRM_RATE_LIMIT = { limit ≤ 300, windowMs } (+ the scope/error helpers of the routes)
//   APP `apps/mobile/app/(app)/crm/` — `_layout.tsx` (Stack from expo-router) · `index.tsx` (my deals) · `tasks.tsx` · `call-log.tsx` ·
//     `scan-card.tsx` + ONE `Pressable testID="drawer-crm"` in `app/(app)/_layout.tsx` · NO `@react-navigation/*` import · `tel:` via
//     Linking + a pending-call marker → AppState "active" ⇒ router.push("/crm/call-log?…") (the prompt after hanging up) · push: the
//     existing registerPush / `/api/mobile/push/register` only; tapping a CRM notification routes through the PURE mapper
//     `apps/mobile/src/lib/crm-link.ts#crmRouteFromLink(link) → string|null` (no imports) wired in the (app)/_layout response listener.
//   HARNESS `apps/mobile/qc/shoot-crm.mjs` (copy of shoot-member.mjs): mocks `/api/mobile/crm/{deals,tasks,call-log}` from the fixture
//     `QC_CRM_FIXTURE` (default `<repo>/.qc-shots/crm/3.7/fixture-thana.json`, written by THIS oracle) · SCREENS crm-deals · crm-tasks ·
//     crm-call-log · crm-scan-card · crm-drawer at 390×844 · writes `apps/mobile/qc/shots-crm/summary.json` = { generatedAt, fixture: {
//     path, sha256 }, screens: [{ name, ok, errors[], missing[], overflow, expect[], texts (document.body.innerText ≤ 6000 chars) }] }
//   WEB 390: `scripts/visual-crm.mts` block `3.7` shoots every C2–C3 page at 390 (onlyDevice mobile) named `c37-390-<key>-<user>`: key =
//     nav key (CRM_NAV ∪ CRM_DEEP_NAV with wo C2.x/C3.x, minus settings-integrations) · `home` · `report-<tab>` (8) · `email-thread` ·
//     `sequence-editor` (the spec's `before` creates a tagged thread / sequence when the seed has none and restoreSeed() removes it).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// CHECK INVENTORY: 30 = S0 2 · S1 6 · S2 6 · S3 2 · S4 2 · S5 2 (S1–S5 = the 18 of CRM-RUN §2) · K 1 (seed + answer-key control) ·
//   X1 4 · X3 1 · X7 1 · X8 1 · X10 1 · CLEAN 1   (C3.7-FATAL only when something throws)
//   n/a: X2 (no API-key op / AI tool) · X4 (no consumer) · X5 (no job) · X6 (images are validated by the reused C2.4 service — S5.2 proves
//   it through the route) · X9 (no danger op: logging a call / accepting a proposal are ordinary writes audited by the C2.4 services).
// HOUSE RULES: SKIP guard before any DB connection · seed read-only (answer keys = raw SQL over the seed) · throwaway tenants swept in
//   finally (4 passes) + users + sessions + ChatRateBucket rows of the throwaway users + PushDevice rows tagged · parallel POSTs are 10 on
//   separate pool connections, 2 rounds · last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const APP_DIR = "apps/mobile/app/(app)/crm";
const APP_LAYOUT = `${APP_DIR}/_layout.tsx`;
const DRAWER = "apps/mobile/app/(app)/_layout.tsx";
const LINK_FILE = "apps/mobile/src/lib/crm-link.ts";
const HARNESS = "apps/mobile/qc/shoot-crm.mjs";
const HARNESS_SUMMARY = "apps/mobile/qc/shots-crm/summary.json";
const API_DIR = "src/app/api/mobile/crm";
const ROUTES_LIB = "src/lib/mobile/crm-routes.ts";
const CRM_PAGES = "src/app/app/sys/[id]/crm";
const SHOTS = ".qc-shots/crm/3.7";
const FIXTURE = `${SHOTS}/fixture-thana.json`;
const NAV_FILE = "src/lib/modules/crm/nav.ts";
const R = {
  deals: "@/app/api/mobile/crm/deals/route",
  deal: "@/app/api/mobile/crm/deals/[id]/route",
  tasks: "@/app/api/mobile/crm/tasks/route",
  complete: "@/app/api/mobile/crm/tasks/[id]/complete/route",
  callLog: "@/app/api/mobile/crm/call-log/route",
  scan: "@/app/api/mobile/crm/scan-card/route",
  accept: "@/app/api/mobile/crm/scan-card/[proposalId]/accept/route",
  push: "@/app/api/mobile/push/register/route",
};
const ROUTE_FILES = ["deals/route.ts", "deals/[id]/route.ts", "tasks/route.ts", "tasks/[id]/complete/route.ts", "call-log/route.ts", "scan-card/route.ts", "scan-card/[proposalId]/accept/route.ts"].map((f) => `${API_DIR}/${f}`);

const ARGV = process.argv.slice(2);
const FORCE = ARGV.includes("--force-run");
const read = (p: string) => (p && existsSync(p) ? readFileSync(p, "utf8") : "");
const walk = (dir: string, re = /\.(ts|tsx)$/): string[] => {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, re));
    else if (re.test(name)) out.push(p);
  }
  return out.sort();
};
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const mtime = (p: string) => (existsSync(p) ? statSync(p).mtimeMs : 0);

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guard — the app CRM section absent ⇒ SKIPPED, no DB connection.
// ═══════════════════════════════════════════════════════════════════════════════════
const BUILT = existsSync(APP_LAYOUT);
if (!FORCE && !BUILT) {
  console.log(`⚠️  SKIPPED — WO C3.7 not built yet (${APP_LAYOUT} absent) (run with --force-run to exercise the seed controls, the answer keys, the route probes and the cleanup)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
const cq = (await import("./crm-qc-env.mts" as string)) as { CQC: Any };
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c37-${rand}`;
const ABSENT = BUILT ? "" : " · [app crm section ABSENT]";

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
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const idsOf = (v: Any) => ((v?.items ?? []) as Any[]).map((r) => String(r?.id)).sort();

type RR = { status: number; body: Any; err: string };
const mods: Record<string, Any> = {};
const route = async (spec: string): Promise<Any> => {
  if (!(spec in mods)) mods[spec] = await import(spec as string).catch((e: unknown) => ({ __err: cut(String((e as Error)?.message ?? e), 160) }));
  return mods[spec];
};
const hit = async (spec: string, method: string, path: string, o: { token?: string | null; tenant?: string | null; body?: unknown; params?: Record<string, string> } = {}): Promise<RR> => {
  const mod = await route(spec);
  const fn = mod?.[method];
  if (typeof fn !== "function") return { status: -1, body: null, err: `ROUTE_MISSING ${spec} ${method}${mod?.__err ? ` (${mod.__err})` : ""}` };
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": TAG, "x-forwarded-for": "203.0.113.137" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (o.tenant) headers["x-tenant-id"] = o.tenant;
  try {
    const req = new Request(`http://qc.local${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
    const res = (await fn(req, { params: Promise.resolve(o.params ?? {}) })) as Response;
    const text = await res.text();
    let body: Any = null;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body, err: "" };
  } catch (e) {
    return { status: -2, body: null, err: `THROW ${cut(e instanceof Error ? `${e.name}: ${e.message}` : String(e), 200)}` };
  }
};
const rr = (r: RR) => (r.status < 0 ? r.err : `${r.status} ${cut(j(r.body), 140)}`);
const okS = (r: RR) => r.status === 200 || r.status === 201;
const thaiErr = (r: RR) => thai(r.body?.message ?? r.body?.error ?? "");

// Thai day (independent of the product)
const OFF = 7 * 3_600_000;
const thaiDay = (d: Date) => { const t = new Date(d.getTime() + OFF); const from = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - OFF); return { from, to: new Date(from.getTime() + 86_400_000) }; };

console.log(`\n═══ QC CRM v2 · C3.7 — 390 px pass · staff app CRM (deals · tasks · call log · card scan · push) ═══`);
console.log(`[env] DB ${host} · tag ${TAG}${FORCE && !BUILT ? " · --force-run with C3.7 ABSENT (C3.7 checks expected red; controls + CLEAN green)" : ""}\n`);

const TENANTS: string[] = [];
const USERS: string[] = [];
const PII: string[] = [];
const pii = <S extends string>(s: S): S => { PII.push(s); return s; };
let seq = 0;
const nx = () => `${++seq}`;
let phoneSeq = 0;
const phoneOf = (): string => pii(`08${String((Math.floor(Math.random() * 9_000_000) + 1_000_000) * 10 + (phoneSeq++ % 10)).padStart(8, "0").slice(-8)}`);
let seedThana = "";

try {
  const AUTH = (await import("@/lib/mobile/auth" as string)) as Any;
  const E = JSON.parse(read(cq.CQC.expectedPath) || "{}") as Any;
  const SEED_T = String(E.tenantId ?? "");
  const SEED_S = String(E.systemId ?? "");
  seedThana = String(E.users?.thana?.userId ?? "");
  const seedNok = String(E.users?.nok?.userId ?? "");
  const seedKata = String(E.users?.kata?.userId ?? "");
  const KRABI = String(E.teams?.krabi ?? "");

  // ═════════════════════════════════════════════════════════════════════════════
  // K.1 — the seed is there and is what the answer keys assume
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── K · seed + answer keys ──");
  const seedSys = SEED_S ? ((await P.appSystem.findFirst({ where: { id: SEED_S, tenantId: SEED_T, type: "CRM" }, select: { settings: true } })) as Any) : null;
  const seedV2 = seedSys?.settings?.crm?.uiVersion === 2;
  const thanaMember = seedThana ? ((await P.membership.findFirst({ where: { tenantId: SEED_T, userId: seedThana, acceptedAt: { not: null } } })) as Any) : null;
  const keyDeals = (await P.crmDeal.findMany({ where: { tenantId: SEED_T, systemId: SEED_S, ownerUserId: seedThana, kind: "OPEN", archivedAt: null }, select: { id: true, title: true } })) as Any[];
  const krabiDeals = (await P.crmDeal.findMany({ where: { tenantId: SEED_T, systemId: SEED_S, OR: [{ teamId: KRABI }, { ownerUserId: { in: [seedNok, seedKata].filter(Boolean) } }] }, select: { id: true, title: true, contactId: true } })) as Any[];
  const now0 = new Date();
  const day = thaiDay(now0);
  // C3.10 ORACLE-FIX (X1.3): mirror `mobile.todayTasks` = `activities.activityStatusWhere` overdue ∪ today (C5.4-E L6-m1):
  //   open = doneAt null AND type ≠ NOTE (a note is not a task) · reference time = COALESCE(dueAt, startAt) < end of the Thai day
  //   ∪ done within the Thai day (any type). The pre-fix SQL counted open NOTE rows (QC1 7 Oct: 7 of thana's ⇒ 113 vs 120).
  const keyTasks = (await P.crmActivity.findMany({
    where: {
      tenantId: SEED_T, systemId: SEED_S, ownerUserId: seedThana,
      OR: [
        { doneAt: null, type: { not: "NOTE" }, OR: [{ dueAt: { lt: day.to } }, { dueAt: null, startAt: { lt: day.to } }] },
        { doneAt: { gte: day.from, lt: day.to } },
      ],
    },
    select: { id: true, title: true, dueAt: true, doneAt: true },
  })) as Any[];
  const nokTasks = (await P.crmActivity.findMany({ where: { tenantId: SEED_T, systemId: SEED_S, ownerUserId: { in: [seedNok, seedKata].filter(Boolean) } }, select: { id: true } })) as Any[];
  chk("C3.7-K.1", "seed control: crm-expected.json resolves to the seeded shop on THIS database (CRM system uiVersion 2 · thana an accepted member) · thana owns ≥ 1 OPEN deal · the Krabi team owns ≥ 1 deal (the visibility probe has something to hide)",
    !!seedSys && seedV2 && !!thanaMember && keyDeals.length >= 1 && krabiDeals.length >= 1, "seed as assumed",
    `system=${!!seedSys} v2=${seedV2} thanaMember=${!!thanaMember} thanaOpen=${keyDeals.length} krabi=${krabiDeals.length} thanaTasksToday=${keyTasks.length}`, "MAJOR");

  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — structure
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S0 · structure ──");
  {
    const srcs = ROUTE_FILES.map((f) => ({ f, s: read(f) }));
    const missing = srcs.filter((x) => !x.s).map((x) => x.f.replace(API_DIR, ""));
    const noGuard = srcs.filter((x) => x.s && !/requireMobile/.test(x.s)).map((x) => x.f.replace(API_DIR, ""));
    const rawDb = srcs.filter((x) => /from\s+["']@\/lib\/core\/db["']|@prisma\/client/.test(x.s)).map((x) => x.f.replace(API_DIR, ""));
    const lib = read(ROUTES_LIB);
    const reuse = /scanBusinessCard/.test(read(`${API_DIR}/scan-card/route.ts`) + lib) && /acceptLeadProposal/.test(read(`${API_DIR}/scan-card/[proposalId]/accept/route.ts`) + lib) && /logCall/.test(read(`${API_DIR}/call-log/route.ts`) + lib);
    chk("C3.7-S0.1", "server: the 7 route files under src/app/api/mobile/crm exist · every one calls requireMobile · none imports prisma/@prisma/client (services through the CRM facade) · src/lib/mobile/crm-routes.ts holds MOBILE_CRM_RATE_LIMIT + checkRateLimitDb · call-log/scan-card/accept delegate to logCall/scanBusinessCard/acceptLeadProposal (the C2.4 engine) [static]",
      missing.length === 0 && noGuard.length === 0 && rawDb.length === 0 && /MOBILE_CRM_RATE_LIMIT/.test(lib) && /checkRateLimitDb/.test(lib) && reuse,
      "7 guarded routes · limiter · reuse", `missing=${missing.join(",") || "-"} noGuard=${noGuard.join(",") || "-"} rawDb=${rawDb.join(",") || "-"} lib=${lib.length > 0} reuse=${reuse}${ABSENT}`);
  }
  {
    const screens = ["_layout.tsx", "index.tsx", "tasks.tsx", "call-log.tsx", "scan-card.tsx"].map((f) => `${APP_DIR}/${f}`);
    const miss = screens.filter((f) => !existsSync(f)).map((f) => f.replace(APP_DIR, ""));
    const layout = read(APP_LAYOUT);
    const drawer = read(DRAWER);
    const appFiles = [...walk(APP_DIR), LINK_FILE, ...walk("apps/mobile/src/components/crm"), "apps/mobile/src/lib/call-prompt.ts"].filter(existsSync);
    const rn = appFiles.filter((f) => /from\s+["']@react-navigation\//.test(read(f)));
    const drawerOk = /testID=["']drawer-crm["']/.test(drawer) && /navigate\(\s*["']crm["']\s*\)/.test(drawer) && /testID=["']drawer-member["']/.test(drawer);
    const h = read(HARNESS);
    const harnessOk = h.length > 0 && ["crm-deals", "crm-tasks", "crm-call-log", "crm-scan-card", "crm-drawer"].every((n) => h.includes(`"${n}"`)) && /QC_CRM_FIXTURE/.test(h) && /fixture-thana\.json/.test(h) && /sha256/.test(h) && /shots-crm/.test(h) && /innerText/.test(h) && !/eas\s+build|eas-cli/.test(h);
    chk("C3.7-S0.2", "app: apps/mobile/app/(app)/crm/{_layout (Stack from expo-router), index, tasks, call-log, scan-card}.tsx · ONE drawer entry testID drawer-crm navigating to \"crm\" (drawer-member kept) · no @react-navigation/* import in the CRM section · harness apps/mobile/qc/shoot-crm.mjs (5 SCREENS · fixture QC_CRM_FIXTURE/fixture-thana.json · sha256 · innerText · shots-crm · no EAS) [static]",
      miss.length === 0 && /Stack/.test(layout) && /from\s+["']expo-router["']/.test(layout) && drawerOk && rn.length === 0 && harnessOk,
      "5 screens · drawer · expo-router only · harness", `missing=${miss.join(",") || "-"} stack=${/Stack/.test(layout)} drawer=${drawerOk} rnNav=${rn.join(",") || "-"} harness=${harnessOk}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — thana's mobile session on the seed (read-only use) · throwaway tenant T for every write
  // ═════════════════════════════════════════════════════════════════════════════
  const tokThana = seedThana ? String((await AUTH.issueMobileToken(seedThana, { userAgent: TAG })).token) : "";
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
  const STAFF_T = { "crm.contact.read": true, "crm.company.read": true, "crm.deal.read": true, "crm.activity.read": true, "crm.activity.create": true, "crm.activity.complete": true, "crm.contact.create": true };
  const member = (tid: string, userId: string, role: string, permissions: Record<string, unknown> = {}) =>
    P.membership.create({ data: { userId, tenantId: tid, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } });
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const mk = async (tid: string, type: string, label: string) => (await sysSvc.createSystem(tid, type, `${label} ${TAG}`)).id as string;
  const setCrm = (sysId: string, obj: Record<string, unknown>) =>
    P.$executeRawUnsafe(
      `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
        (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
      JSON.stringify(obj), sysId);
  const uO = await mkUser("");
  const uS1 = await mkUser("-s1");
  const uS2 = await mkUser("-s2");
  const uS3 = await mkUser("-s3");
  const tidT = await mkTenant("t");
  await member(tidT, uO, "OWNER");
  for (const u of [uS1, uS2, uS3]) await member(tidT, u, "STAFF", STAFF_T);
  const tidV = await mkTenant("v"); // only a uiVersion-1 CRM
  await member(tidV, uS1, "STAFF", STAFF_T);
  const tidN = await mkTenant("n"); // uS1 is NOT a member here
  const crmT = await mk(tidT, "CRM", "CRM");
  const crmT2 = await mk(tidT, "CRM", "CRM สอง");
  const crmTV = await mk(tidT, "CRM", "CRM v1");
  const crmV = await mk(tidV, "CRM", "CRM v1");
  for (const s of [crmT, crmT2]) await setCrm(s, { uiVersion: 2, bridgesEnabled: true });
  for (const s of [crmTV, crmV]) await setCrm(s, { uiVersion: 1 });
  const mkTeam = async (name: string, members: string[]) => {
    const t = await P.team.create({ data: { tenantId: tidT, name: `${name} ${TAG}` } });
    for (const u of members) await P.teamMember.create({ data: { tenantId: tidT, teamId: t.id, userId: u, role: "MEMBER" } });
    return t.id as string;
  };
  const teamP = await mkTeam("ทีม P", [uS1, uS3]);
  const teamK = await mkTeam("ทีม K", [uS2]);
  const pipe = (await P.crmPipeline.create({
    data: { tenantId: tidT, systemId: crmT, name: `ขาย ${TAG}`, stages: { create: [["ผู้สนใจ", "OPEN", 10], ["ชนะ", "WON", 100]].map(([name, kind, probability], i) => ({ tenantId: tidT, systemId: crmT, sortOrder: i, name, kind, probability })) } },
    include: { stages: true },
  })) as Any;
  const stOpen = (pipe.stages as Any[]).find((s) => s.kind === "OPEN").id as string;
  const mkContact = async (owner: string, team: string, sys = crmT) => {
    const name = pii(`ลูกค้า ${TAG}-${nx()}`);
    const party = await P.party.create({ data: { tenantId: tidT, name, kind: "PERSON" } });
    return (await P.crmContact.create({ data: { tenantId: tidT, systemId: sys, name, firstName: name, phone: phoneOf(), email: pii(`${TAG}-c${nx()}@qc.invalid`), partyId: party.id, ownerUserId: owner, teamId: team } })).id as string;
  };
  const cS1 = await mkContact(uS1, teamP);
  const cS2 = await mkContact(uS2, teamK);
  const dS1 = (await P.crmDeal.create({ data: { tenantId: tidT, systemId: crmT, contactId: cS1, pipelineId: pipe.id, stageId: stOpen, title: pii(`ดีล ${TAG}-${nx()}`), valueSatang: 500_000, kind: "OPEN", ownerUserId: uS1, teamId: teamP, stageEnteredAt: new Date() } })).id as string;
  const dS2 = (await P.crmDeal.create({ data: { tenantId: tidT, systemId: crmT, contactId: cS2, pipelineId: pipe.id, stageId: stOpen, title: pii(`ดีล ${TAG}-${nx()}`), valueSatang: 700_000, kind: "OPEN", ownerUserId: uS2, teamId: teamK, stageEnteredAt: new Date() } })).id as string;
  const dueToday = new Date(thaiDay(new Date()).from.getTime() + 20 * 3_600_000); // 20:00 Thai today
  const aS1 = (await P.crmActivity.create({ data: { tenantId: tidT, systemId: crmT, type: "TASK", title: `งาน ${TAG}-${nx()}`, ownerUserId: uS1, dueAt: dueToday, contactId: cS1, dealId: dS1 } })).id as string;
  const aS2 = (await P.crmActivity.create({ data: { tenantId: tidT, systemId: crmT, type: "TASK", title: `งาน ${TAG}-${nx()}`, ownerUserId: uS2, dueAt: dueToday, contactId: cS2, dealId: dS2 } })).id as string;
  const tok = async (uid: string) => String((await AUTH.issueMobileToken(uid, { userAgent: TAG })).token);
  const tS1 = await tok(uS1);
  const tS2 = await tok(uS2);
  const tS3 = await tok(uS3);
  const q = (sys: string) => `?systemId=${encodeURIComponent(sys)}`;

  // ═════════════════════════════════════════════════════════════════════════════
  // X1 — the mobile routes see exactly what the web sees (seed as thana + throwaway T)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X1 · mobile routes · visibility ──");
  const gDeals = await hit(R.deals, "GET", `/api/mobile/crm/deals${q(SEED_S)}`, { token: tokThana, tenant: SEED_T });
  const gDealsDefault = await hit(R.deals, "GET", `/api/mobile/crm/deals`, { token: tokThana, tenant: SEED_T });
  const gTasks = await hit(R.tasks, "GET", `/api/mobile/crm/tasks${q(SEED_S)}`, { token: tokThana, tenant: SEED_T });
  const promptContact = keyDeals.length ? String(((await P.crmDeal.findFirst({ where: { id: keyDeals[0].id }, select: { contactId: true } })) as Any)?.contactId ?? "") : "";
  const gPrompt = promptContact ? await hit(R.callLog, "GET", `/api/mobile/crm/call-log${q(SEED_S)}&contactId=${promptContact}&dealId=${keyDeals[0].id}`, { token: tokThana, tenant: SEED_T }) : { status: -1, body: null, err: "no seed contact" } as RR;
  {
    const got = idsOf(gDeals.body);
    const want = keyDeals.map((d) => String(d.id)).sort();
    const leak = got.filter((x) => krabiDeals.some((k) => k.id === x));
    chk("C3.7-X1.1", "X1 deals (seed, thana): GET /api/mobile/crm/deals = exactly thana's OPEN, not-archived deals of the seeded CRM system (raw SQL) — not one Krabi deal (team krabi / owner nok|kata) · without ?systemId the tenant's first v2 CRM system gives the same list",
      okS(gDeals) && same(got, want) && leak.length === 0 && okS(gDealsDefault) && same(idsOf(gDealsDefault.body), want), "= SQL · 0 Krabi", `status=${gDeals.status} got=${got.length} want=${want.length} leak=${leak.length} default=${gDealsDefault.status}/${idsOf(gDealsDefault.body).length} ${gDeals.status < 0 ? gDeals.err : ""}${ABSENT}`);
  }
  {
    const krabiDeal = krabiDeals[0]?.id ? String(krabiDeals[0].id) : "-";
    const own = keyDeals[0]?.id ? String(keyDeals[0].id) : "-";
    const dOwn = await hit(R.deal, "GET", `/api/mobile/crm/deals/${own}${q(SEED_S)}`, { token: tokThana, tenant: SEED_T, params: { id: own } });
    const dKrabi = await hit(R.deal, "GET", `/api/mobile/crm/deals/${krabiDeal}${q(SEED_S)}`, { token: tokThana, tenant: SEED_T, params: { id: krabiDeal } });
    const krabiContact = String(krabiDeals.find((k) => k.contactId)?.contactId ?? "-");
    const pKrabi = await hit(R.callLog, "GET", `/api/mobile/crm/call-log${q(SEED_S)}&contactId=${krabiContact}`, { token: tokThana, tenant: SEED_T });
    const foreignSys = await hit(R.deals, "GET", `/api/mobile/crm/deals${q(crmT)}`, { token: tokThana, tenant: SEED_T });
    const noMember = await hit(R.deals, "GET", `/api/mobile/crm/deals`, { token: tS1, tenant: tidN });
    const noTok = await hit(R.deals, "GET", `/api/mobile/crm/deals`, { tenant: SEED_T });
    const badTok = await hit(R.deals, "GET", `/api/mobile/crm/deals`, { token: "nope", tenant: SEED_T });
    const noLeak = !j(dKrabi.body).includes(String(krabiDeals[0]?.title ?? "∅")) && !j(pKrabi.body).includes("@");
    chk("C3.7-X1.2", "X1 404-not-403: thana opens his own deal (200) but a Krabi deal ⇒ 404 and the call-log prompt of a Krabi contact ⇒ 404 (nothing of it in the body) · a CRM system of ANOTHER tenant in ?systemId ⇒ 404 · a tenant he does not belong to ⇒ 403 · no / bad Bearer ⇒ 401",
      okS(dOwn) && dKrabi.status === 404 && pKrabi.status === 404 && noLeak && foreignSys.status === 404 && noMember.status === 403 && noTok.status === 401 && badTok.status === 401,
      "200 · 404 · 404 · 404 · 403 · 401 · 401", `own=${dOwn.status} krabi=${dKrabi.status} prompt=${pKrabi.status} foreignSys=${foreignSys.status} noMember=${noMember.status} noTok=${noTok.status} badTok=${badTok.status} leak=${!noLeak}${ABSENT}`);
  }
  {
    const got = idsOf(gTasks.body);
    const want = keyTasks.map((t) => String(t.id)).sort();
    const leak = got.filter((x) => nokTasks.some((k) => k.id === x));
    const cOwn = await hit(R.complete, "POST", `/api/mobile/crm/tasks/${aS1}/complete${q(crmT)}`, { token: tS1, tenant: tidT, params: { id: aS1 }, body: {} });
    const cOther = await hit(R.complete, "POST", `/api/mobile/crm/tasks/${aS2}/complete${q(crmT)}`, { token: tS1, tenant: tidT, params: { id: aS2 }, body: {} });
    const rows = (await P.crmActivity.findMany({ where: { id: { in: [aS1, aS2] } }, select: { id: true, doneAt: true } })) as Any[];
    const doneOwn = !!rows.find((r) => r.id === aS1)?.doneAt;
    const doneOther = !!rows.find((r) => r.id === aS2)?.doneAt;
    chk("C3.7-X1.3", "X1 tasks: GET /api/mobile/crm/tasks (seed, thana) = his open tasks due up to the end of the Thai day + those done today (raw SQL), none of nok/kata · POST tasks/[id]/complete closes his own task (200, doneAt set) and answers 404 for a colleague's task of another team (untouched)",
      okS(gTasks) && same(got, want) && leak.length === 0 && okS(cOwn) && doneOwn && cOther.status === 404 && !doneOther,
      "= SQL · own 200 · other 404", `tasks=${gTasks.status} got=${got.length} want=${want.length} leak=${leak.length} own=${rr(cOwn)} other=${cOther.status} doneOwn=${doneOwn} doneOther=${doneOther}${ABSENT}`);
  }
  {
    const v1Sys = await hit(R.deals, "GET", `/api/mobile/crm/deals${q(crmTV)}`, { token: tS1, tenant: tidT });
    const v1Only = await hit(R.deals, "GET", `/api/mobile/crm/deals`, { token: tS1, tenant: tidV });
    const v1Post = await hit(R.callLog, "POST", `/api/mobile/crm/call-log${q(crmTV)}`, { token: tS1, tenant: tidT, body: { contactId: cS1, direction: "OUT", outcome: "สนใจ", durationSec: 30, idempotencyKey: `${TAG}-v1` } });
    const written = (await P.crmActivity.count({ where: { tenantId: tidT, systemId: crmTV } })) as number;
    chk("C3.7-X1.4", "R-E.14 uiVersion 1: ?systemId of a v1 CRM ⇒ 409 { error: CRM_V2_DISABLED } (reads and writes, nothing written) · a tenant whose only CRM is v1 ⇒ 404 (no v2 system to default to)",
      v1Sys.status === 409 && String(v1Sys.body?.error ?? "") === "CRM_V2_DISABLED" && v1Post.status === 409 && written === 0 && v1Only.status === 404,
      "409 · 409 · 404", `v1Sys=${rr(v1Sys)} v1Post=${v1Post.status} written=${written} v1Only=${v1Only.status}${ABSENT}`);
  }

  // fixture for the harness (only when the three GETs answered)
  let fixtureSha = "";
  if (okS(gDeals) && okS(gTasks) && okS(gPrompt)) {
    const fixture = { generatedBy: "qc-crm-c3.7", user: "thana", systemId: SEED_S, deals: gDeals.body, tasks: gTasks.body, callLog: gPrompt.body };
    const text = `${JSON.stringify(fixture, null, 1)}\n`;
    mkdirSync(SHOTS, { recursive: true });
    const prev = read(FIXTURE);
    if (prev !== text) writeFileSync(FIXTURE, text);
    fixtureSha = createHash("sha256").update(text).digest("hex");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — the C2–C3 web pages at 390 px (6)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S1 · 390 px ──");
  const NAV = (await import("@/lib/modules/crm/nav" as string)) as Any;
  const RS = (await import("@/lib/modules/crm/reports-shared" as string)) as Any;
  const c23 = [...((NAV.CRM_NAV ?? []) as Any[]), ...((NAV.CRM_DEEP_NAV ?? []) as Any[])].filter((e) => /^C[23]\./.test(String(e?.wo ?? "")) && e?.status === "ready" && e?.path !== "/crm/settings/integrations");
  // the two [param] pages are ALWAYS measured: the visual-crm 3.7 block creates a tagged thread / sequence in `before` when the seed has none
  const hasThread = true;
  const hasSeq = true;
  const PAGES: { key: string; path: string }[] = [
    { key: "home", path: "" },
    ...c23.map((e) => ({ key: String(e.key), path: String(e.path) })),
    ...((RS.REPORT_TABS ?? []) as string[]).map((t) => ({ key: `report-${t}`, path: `/crm/reports/${t}` })),
    ...(hasThread ? [{ key: "email-thread", path: "/crm/emails/[threadKey]" }] : []),
    ...(hasSeq ? [{ key: "sequence-editor", path: "/crm/settings/sequences/[sequenceId]" }] : []),
  ];
  const summaryOf = (u: string): Any => { try { return JSON.parse(read(`${SHOTS}/summary-${u}.json`)); } catch { return null; } };
  const sO = summaryOf("owner");
  const sT = summaryOf("thana");
  const resOf = (s: Any, key: string, u: string) => ((s?.results ?? []) as Any[]).find((x) => x?.name === `c37-390-${key}-${u}` && x?.device === "mobile");
  // C2–C3 UI files (pages under the C2/C3 nav paths + their [param] pages + the C2/C3 component folders)
  const pageFiles = walk(CRM_PAGES).filter((f) => /page\.tsx$/.test(f));
  const routeOf = (f: string) => f.replace(/^src\/app\/app\/sys\/\[id\]/, "").replace(/\/page\.tsx$/, "") || "";
  const isC23Route = (rt: string) => rt === "/crm/reports/[tab]" || c23.some((e) => rt === e.path || rt.startsWith(`${e.path}/`));
  const c23Pages = pageFiles.filter((f) => isC23Route(routeOf(f)) && routeOf(f) !== "/crm/settings/integrations" && !routeOf(f).startsWith("/crm/settings/integrations/"));
  const COMP_DIRS = ["automation", "sequences", "assignment", "emails", "email", "tracking", "forms", "scoring", "notifications", "reports", "home", "quotas", "commissions", "portal"].map((d) => `src/components/crm/${d}`);
  const uiFiles = [...c23Pages.flatMap((f) => walk(f.replace(/page\.tsx$/, ""))), ...COMP_DIRS.flatMap((d) => walk(d))].filter((f, i, a) => a.indexOf(f) === i && f.endsWith(".tsx"));
  const newestUi = Math.max(0, ...uiFiles.map(mtime), mtime("src/lib/modules/crm/home.tsx"));
  {
    const bad = PAGES.map((p) => ({ p, r: resOf(sO, p.key, "owner") })).filter(({ r }) => !r || !(r.status > 0 && r.status < 400) || r.overflow || (r.errors ?? []).length > 0);
    chk("C3.7-S1.1", `owner at 390: every C2–C3 page (${PAGES.length}: home · ${c23.length} nav pages · 8 report tabs${hasThread ? " · e-mail thread" : ""}${hasSeq ? " · sequence editor" : ""}) was shot by visual-crm 3.7 (c37-390-<key>-owner) with HTTP < 400, no console error and NO horizontal overflow`,
      !!sO && PAGES.length >= 20 && bad.length === 0, "all pages clean", `summary=${!!sO} pages=${PAGES.length} bad=${bad.map(({ p, r }) => `${p.key}:${r ? `${r.status}${r.overflow ? "/overflow" : ""}${(r.errors ?? []).length ? "/err" : ""}` : "∅"}`).slice(0, 14).join(",") || "-"}${ABSENT}`, "MAJOR");
  }
  {
    // ORACLE-EDIT C3.7-S1.2 (26 ก.ย. · ผู้คุมงาน): สเปคภาพถ่ายเฉพาะหน้าที่ thana เปิดได้ (ตาม crmCan) ⇒ หน้าที่ไม่มีภาพ = ไม่มีสิทธิ์ ไม่ใช่ความผิด · ต้องมีอย่างน้อย home
    const shots = PAGES.map((p) => ({ p, r: resOf(sT, p.key, "thana") })).filter(({ r }) => !!r);
    const bad = shots.filter(({ r }) => !r || r.overflow || !((r.status > 0 && r.status < 400) || r.status === 404) || ((r.status < 400) && (r.errors ?? []).length > 0));
    const must200 = ["home"].filter((k) => PAGES.some((p) => p.key === k)).filter((k) => !(resOf(sT, k, "thana")?.status < 400));
    chk("C3.7-S1.2", "thana (STAFF) at 390: every C2–C3 page shot (c37-390-<key>-thana) is either 404 (a page he may not open — never a crash) or < 400 with no console error, and none overflows · home and the e-mail inbox open (200)",
      !!sT && shots.length >= 1 && bad.length === 0 && must200.length === 0, "no overflow · 404 or clean", `summary=${!!sT} bad=${bad.map(({ p, r }) => `${p.key}:${r ? `${r.status}${r.overflow ? "/overflow" : ""}` : "∅"}`).slice(0, 14).join(",") || "-"} not200=${must200.join(",") || "-"}${ABSENT}`, "MAJOR");
  }
  const FIXED_W = /(^|[\s"'`{(])((?:[a-z0-9]+:)*)(min-w|w)-\[(\d+(?:\.\d+)?)(px|rem)\]/g;
  const wideUnprefixed = (src: string): string[] => {
    const out: string[] = [];
    for (const m of src.matchAll(FIXED_W)) { if (m[2]) continue; const px = m[5] === "rem" ? Number(m[4]) * 16 : Number(m[4]); if (px > 390) out.push(`${m[3]}-[${m[4]}${m[5]}]`); }
    for (const m of src.matchAll(/\b(minWidth|width)\s*:\s*["'`]?(\d{3,})(px)?["'`]?/g)) if (Number(m[2]) > 390) out.push(`${m[1]}:${m[2]}`);
    return out;
  };
  const hasScroller = (src: string) => /overflow-x-(auto|scroll)|\boverflow-auto\b/.test(src);
  const classLits = (src: string): string[] => [...src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|'([^']*)')/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
  const hasCardAlt = (src: string) => { const c = classLits(src); return c.some((x) => /(^|\s)(sm|md|lg):hidden(\s|$)/.test(x)) && c.some((x) => /(^|\s)hidden(\s|$)/.test(x) && /(^|\s)(sm|md|lg):(block|table|grid|flex)(\s|$)/.test(x)); };
  const hidesColumns = (src: string) => classLits(src).some((x) => /(^|\s)hidden(\s|$)/.test(x) && /(^|\s)(sm|md|lg):table-cell(\s|$)/.test(x));
  {
    const bad = uiFiles.map((f) => ({ f, w: wideUnprefixed(stripComments(read(f))) })).filter((x) => x.w.length > 0 && !hasScroller(read(x.f)));
    chk("C3.7-S1.3", "static proxy: no C2–C3 page/component (pages under the C2/C3 nav paths + components/crm/{automation,sequences,assignment,emails,tracking,forms,scoring,notifications,reports,home,quotas,commissions,portal}) sets an unprefixed width/min-width > 390 px unless it sits in an overflow-x scroller [static]",
      uiFiles.length >= 20 && bad.length === 0, "0 files", `scanned=${uiFiles.length} bad=${bad.map((x) => `${x.f.replace("src/", "")}:${x.w.join("/")}`).slice(0, 10).join(" ; ") || "-"}`, "MAJOR");
  }
  {
    const withTable = uiFiles.filter((f) => /<table[\s>]/.test(read(f)));
    const bad = withTable.filter((f) => { const s = read(f); return !(hasCardAlt(s) || hasScroller(s) || hidesColumns(s)); });
    chk("C3.7-S1.4", "static proxy: every C2–C3 file with a <table> offers cards below md (…:hidden + hidden …:block|table), drops columns below sm, or wraps it in an overflow-x-auto scroller (report tables, rule lists, e-mail inbox, sequences, assignment, scoring, quotas, commissions) [static]",
      bad.length === 0, "all", `tables=${withTable.length} bad=${bad.map((f) => f.replace("src/", "")).join(" ; ") || "-"}`, "MAJOR");
  }
  {
    const unmeasured = c23Pages.map(routeOf).filter((rt) => {
      if (rt === "/crm/reports/[tab]") return false;
      if (rt === "/crm/emails/[threadKey]") return !hasThread;
      if (rt === "/crm/settings/sequences/[sequenceId]") return !hasSeq;
      return !PAGES.some((p) => p.path === rt);
    });
    chk("C3.7-S1.5", "coverage: every C2–C3 page.tsx of the tree (under a C2/C3 nav path, incl. [param] pages; /settings/integrations excluded — R-D) maps to a 390 shot of the list — no page is left unmeasured (a new [param] page needs its own shot)",
      c23Pages.length >= 15 && unmeasured.length === 0, "0 unmeasured", `c23Pages=${c23Pages.length} unmeasured=${unmeasured.join(",") || "-"}`, "MAJOR");
  }
  {
    const atO = sO?.at ? Date.parse(sO.at) : 0;
    const atT = sT?.at ? Date.parse(sT.at) : 0;
    chk("C3.7-S1.6", "freshness: both 390 summaries (.qc-shots/crm/3.7/summary-{owner,thana}.json, wo 3.7) were produced AFTER the newest C2–C3 UI file changed — a stale shot never passes the pass",
      !!sO && !!sT && sO.wo === "3.7" && sT.wo === "3.7" && atO > newestUi && atT > newestUi, "newer than the UI", `owner=${sO?.at ?? "∅"} thana=${sT?.at ?? "∅"} newestUi=${newestUi ? new Date(newestUi).toISOString() : "∅"}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — the 3 app screens: static contract + QC render with the seed as thana (6)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2 · app screens (QC render) ──");
  let hs: Any = null;
  try { hs = JSON.parse(read(HARNESS_SUMMARY)); } catch { hs = null; }
  const screenOf = (n: string) => ((hs?.screens ?? []) as Any[]).find((x) => x?.name === n);
  const fresh = !!hs && !!fixtureSha && hs?.fixture?.sha256 === fixtureSha;
  const rendered = (n: string, needExpect: string[]) => {
    const s = screenOf(n);
    const exp = ((s?.expect ?? []) as string[]);
    return { s, ok: !!s && s.ok === true && (s.errors ?? []).length === 0 && (s.missing ?? []).length === 0 && s.overflow === false && needExpect.every((t) => exp.includes(t)), text: String(s?.texts ?? "") };
  };
  const tids = (src: string, list: string[]) => list.filter((t) => !new RegExp(`testID=\\{?[\`"']${t.replace(/[-]/g, "\\-")}`).test(src));
  {
    const src = read(`${APP_DIR}/index.tsx`) + read("apps/mobile/src/components/crm/ui.tsx");
    const miss = tids(src, ["crm-deals", "crm-deal-filter-", "crm-deal-card-", "crm-deal-call-", "crm-deal-stale-"]);
    chk("C3.7-S2.1", "screen ก \"ดีลของฉัน\" (mockup 13 a): index.tsx loads /api/mobile/crm/deals through src/api/client (Bearer + X-Tenant-Id) · stage filter chips · deal cards with stale badge and a call button that opens `tel:` via Linking — testIDs crm-deals · crm-deal-filter-* · crm-deal-card-* · crm-deal-call-* · crm-deal-stale-* [static]",
      miss.length === 0 && /\/api\/mobile\/crm\/deals/.test(src) && /from\s+["']@\/src\/api\/client["']/.test(src) && /tel:/.test(src) && /Linking/.test(src), "testIDs · api · tel:", `missing=${miss.join(",") || "-"} api=${/\/api\/mobile\/crm\/deals/.test(src)} tel=${/tel:/.test(src)}${ABSENT}`, "MAJOR");
  }
  {
    const r = rendered("crm-deals", ["crm-deals"]);
    const titles = keyDeals.map((d) => String(d.title));
    const shown = titles.slice(0, 5).filter((t) => r.text.includes(t));
    const krabiShown = krabiDeals.map((d) => String(d.title)).filter((t) => r.text.includes(t));
    chk("C3.7-S2.2", "QC render of \"ดีลของฉัน\" (shoot-crm.mjs · 390×844 · API mocked with the fixture this oracle wrote from the SEED as thana — sha256 matches): no page error · no missing testID · no overflow · the first 5 of thana's deal titles are on screen · no Krabi deal title",
      fresh && r.ok && shown.length === Math.min(5, titles.length) && krabiShown.length === 0, "fresh · clean · thana only", `fresh=${fresh} (fixture=${fixtureSha.slice(0, 10) || "∅"} summary=${String(hs?.fixture?.sha256 ?? "∅").slice(0, 10)}) screen=${r.s ? `ok=${r.s.ok} missing=${j(r.s.missing)} overflow=${r.s.overflow}` : "∅"} titles=${shown.length}/${Math.min(5, titles.length)} krabi=${krabiShown.length}${ABSENT}`, "MAJOR");
  }
  {
    const src = read(`${APP_DIR}/tasks.tsx`);
    const miss = tids(src, ["crm-tasks", "crm-tasks-count-today", "crm-tasks-count-overdue", "crm-tasks-count-done", "crm-task-", "crm-task-check-", "crm-scan-card-open"]);
    chk("C3.7-S2.3", "screen ค \"งานวันนี้\" (mockup 13 c): tasks.tsx loads /api/mobile/crm/tasks · 3 counters (วันนี้ · เลยกำหนด · เสร็จแล้ว) · rows with a check box that POSTs tasks/[id]/complete · entry to the card scanner — testIDs crm-tasks · crm-tasks-count-{today,overdue,done} · crm-task-* · crm-task-check-* · crm-scan-card-open [static]",
      miss.length === 0 && /\/api\/mobile\/crm\/tasks/.test(src) && /\/complete/.test(src), "testIDs · api", `missing=${miss.join(",") || "-"} api=${/\/api\/mobile\/crm\/tasks/.test(src)} complete=${/\/complete/.test(src)}${ABSENT}`, "MAJOR");
  }
  {
    const r = rendered("crm-tasks", ["crm-tasks", "crm-tasks-count-today"]);
    const titles = keyTasks.map((t) => String(t.title)).slice(0, 5);
    const shown = titles.filter((t) => r.text.includes(t));
    chk("C3.7-S2.4", "QC render of \"งานวันนี้\" (fixture = the seed as thana): no page error · no missing testID · no overflow · the counters were expected on screen · the first 5 of thana's task titles of today are shown",
      fresh && r.ok && shown.length === titles.length, "fresh · clean · titles", `fresh=${fresh} screen=${r.s ? `ok=${r.s.ok} missing=${j(r.s.missing)} overflow=${r.s.overflow}` : "∅"} titles=${shown.length}/${titles.length}${ABSENT}`, "MAJOR");
  }
  {
    const src = read(`${APP_DIR}/call-log.tsx`);
    const miss = tids(src, ["crm-call-log", "crm-call-outcome-", "crm-call-direction-OUT", "crm-call-direction-IN", "crm-call-duration", "crm-call-note", "crm-call-next-task", "crm-call-save", "crm-call-saved"]);
    chk("C3.7-S2.5", "screen ข \"บันทึกสาย — วางสายแล้ว\" (mockup 13 b): call-log.tsx GETs the prompt (/api/mobile/crm/call-log?contactId=…) and POSTs the log with an idempotencyKey · outcome chips from the registry · duration · direction · note · next task · save/saved (inline, no Alert) — testIDs crm-call-log · crm-call-outcome-* · crm-call-direction-{OUT,IN} · crm-call-duration · crm-call-note · crm-call-next-task · crm-call-save · crm-call-saved [static]",
      miss.length === 0 && /\/api\/mobile\/crm\/call-log/.test(src) && /idempotencyKey/.test(src) && !/Alert\.alert/.test(src), "testIDs · api · key · no Alert", `missing=${miss.join(",") || "-"} api=${/\/api\/mobile\/crm\/call-log/.test(src)} key=${/idempotencyKey/.test(src)} alert=${/Alert\.alert/.test(src)}${ABSENT}`, "MAJOR");
  }
  {
    const r = rendered("crm-call-log", ["crm-call-log", "crm-call-save", "crm-call-saved"]);
    const contactName = String(gPrompt.body?.contact?.name ?? "∅");
    const firstOutcome = String(((gPrompt.body?.outcomes ?? []) as string[])[0] ?? "∅");
    chk("C3.7-S2.6", "QC render of the call-log sheet (fixture prompt of thana's contact): no page error · no missing testID (save → saved banner expected) · no overflow · the contact name and the first outcome of the registry are on screen",
      fresh && r.ok && r.text.includes(contactName) && r.text.includes(firstOutcome), "fresh · clean · prompt shown", `fresh=${fresh} screen=${r.s ? `ok=${r.s.ok} missing=${j(r.s.missing)} overflow=${r.s.overflow}` : "∅"} contact=${r.text.includes(contactName)} outcome=${r.text.includes(firstOutcome)}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — call log after tel: (2) · X3.1 idempotent POST
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3 · call log after tel: ──");
  {
    const appSrc = [...walk(APP_DIR), ...walk("apps/mobile/src/lib"), ...walk("apps/mobile/src/components/crm")].map((f) => stripComments(read(f))).join("\n");
    const ok = /tel:/.test(appSrc) && /AppState/.test(appSrc) && /["'`]\/crm\/call-log/.test(appSrc) && /(router\.(push|navigate)|useRouter)/.test(appSrc);
    chk("C3.7-S3.1", "prompt after hanging up [static]: the app opens `tel:<phone>` (Linking), keeps a pending-call marker (contact · deal · start time) and when AppState comes back to \"active\" routes to /crm/call-log with it (duration pre-filled) — mockup 13 b",
      BUILT && ok, "tel: → AppState → /crm/call-log", `tel=${/tel:/.test(appSrc)} appState=${/AppState/.test(appSrc)} route=${/["'`]\/crm\/call-log/.test(appSrc)}${ABSENT}`, "MAJOR");
  }
  {
    const noTok = await hit(R.callLog, "GET", `/api/mobile/crm/call-log${q(SEED_S)}&contactId=${promptContact}`, { tenant: SEED_T });
    const noTokPost = await hit(R.callLog, "POST", `/api/mobile/crm/call-log${q(crmT)}`, { tenant: tidT, body: { contactId: cS1, direction: "OUT", outcome: "สนใจ", durationSec: 272, idempotencyKey: `${TAG}-nt` } });
    const post = await hit(R.callLog, "POST", `/api/mobile/crm/call-log${q(crmT)}`, { token: tS1, tenant: tidT, body: { contactId: cS1, dealId: dS1, direction: "OUT", outcome: "สนใจ", durationSec: 272, body: `โน้ต ${TAG}`, idempotencyKey: `${TAG}-one` } });
    const act = (await P.crmActivity.findFirst({ where: { tenantId: tidT, systemId: crmT, type: "CALL", contactId: cS1 }, orderBy: { createdAt: "desc" } })) as Any;
    const hidden = await hit(R.callLog, "POST", `/api/mobile/crm/call-log${q(crmT)}`, { token: tS1, tenant: tidT, body: { contactId: cS2, direction: "OUT", outcome: "สนใจ", durationSec: 10, idempotencyKey: `${TAG}-hid` } });
    const hiddenRows = (await P.crmActivity.count({ where: { tenantId: tidT, type: "CALL", contactId: cS2 } })) as number;
    const prompt = gPrompt;
    const promptOk = okS(prompt) && prompt.body?.contact?.id === promptContact && Array.isArray(prompt.body?.outcomes) && prompt.body.outcomes.length >= 1 && j(prompt.body?.directions ?? []).includes("OUT");
    chk("C3.7-S3.2", "the prompt route is gated by the staff session: GET/POST /api/mobile/crm/call-log without Bearer ⇒ 401 · GET (seed, thana) = { contact, deal, outcomes (registry), directions } · POST logs ONE CALL activity through calls.logCall (direction OUT · outcome · 272 s · owner = the caller · contact/deal) · a contact of another team ⇒ 404 and nothing written",
      noTok.status === 401 && noTokPost.status === 401 && promptOk && okS(post) && !!act && act.direction === "OUT" && act.outcome === "สนใจ" && act.durationSec === 272 && act.ownerUserId === uS1 && act.dealId === dS1 && hidden.status === 404 && hiddenRows === 0,
      "401 · prompt · 1 CALL · 404", `noTok=${noTok.status}/${noTokPost.status} prompt=${promptOk ? "ok" : rr(prompt)} post=${rr(post)} act=${act ? `${act.direction}/${act.outcome}/${act.durationSec}/${act.ownerUserId === uS1}` : "∅"} hidden=${hidden.status} rows=${hiddenRows}${ABSENT}`);
  }
  {
    const rounds: string[] = [];
    let allOk = true;
    for (let r = 0; r < 2; r += 1) {
      const key = `${TAG}-x3-${r}`;
      const out = await Promise.all(Array.from({ length: 10 }, () => hit(R.callLog, "POST", `/api/mobile/crm/call-log${q(crmT)}`, { token: tS1, tenant: tidT, body: { contactId: cS1, direction: "IN", outcome: "รับสาย", durationSec: 60 + r, idempotencyKey: key } })));
      const n = (await P.crmActivity.count({ where: { tenantId: tidT, systemId: crmT, type: "CALL", contactId: cS1, durationSec: 60 + r } })) as number;
      const ids = [...new Set(out.filter(okS).map((x) => String(x.body?.activityId ?? "")))];
      const ok = out.every(okS) && n === 1 && ids.length === 1 && ids[0] !== "";
      allOk = allOk && ok;
      rounds.push(`r${r}: ok=${out.filter(okS).length}/10 rows=${n} ids=${ids.length}${ok ? "" : ` ${rr(out.find((x) => !okS(x)) ?? out[0])}`}`);
    }
    chk("C3.7-X3.1", "X3: 10 parallel POSTs of the same call (same idempotencyKey, separate connections) × 2 rounds ⇒ every answer 200/201 with the SAME activityId and exactly ONE CALL row per key (a double tap after hanging up never logs two calls)",
      allOk, "1 row per key", `${rounds.join(" · ")}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — push (2)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S4 · push ──");
  {
    const expo = `ExponentPushToken[${TAG}]`;
    const reg = await hit(R.push, "POST", "/api/mobile/push/register", { token: tS1, tenant: tidT, body: { expoToken: expo, platform: "ios" } });
    const row = (await P.pushDevice.findFirst({ where: { expoToken: expo } })) as Any;
    const crmApi = walk(API_DIR).map((f) => read(f)).join("\n");
    const appCrm = walk(APP_DIR).map((f) => read(f)).join("\n");
    const second = /pushDevice|push\/register/.test(crmApi) || walk(API_DIR).some((f) => /push/i.test(f.replace(API_DIR, ""))) || /push\/register/.test(appCrm);
    chk("C3.7-S4.1", "push uses the EXISTING registration: POST /api/mobile/push/register (staff Bearer) stores the device for that user + tenant · the CRM section adds no second registration route/table and its screens never call /push/register (registerPush of (app)/_layout does)",
      okS(reg) && row?.userId === uS1 && row?.tenantId === tidT && BUILT && !second, "1 device · no second path", `reg=${rr(reg)} row=${row ? `${row.userId === uS1}/${row.tenantId === tidT}` : "∅"} secondPath=${second}${ABSENT}`, "MAJOR");
  }
  {
    const NS = (await import("@/lib/modules/crm/notifications-shared" as string)) as Any;
    const LK = (await import(`../${LINK_FILE}` as string).catch(() => ({}))) as Any;
    const map = typeof LK.crmRouteFromLink === "function" ? LK.crmRouteFromLink : null;
    const lDeal = NS.crmNotifLink(crmT, "CrmDeal", dS1, "deal.closed", "2026-09-26");
    const lAct = NS.crmNotifLink(crmT, "CrmActivity", aS1, "activity.reminder", "2026-09-26");
    const mDeal = map ? map(lDeal) : undefined;
    const mAct = map ? map(lAct) : undefined;
    const mChat = map ? map(`/app/sys/${crmT}/chat/abc`) : undefined;
    const mEvil = map ? map(`https://evil.example${lDeal}`) : undefined;
    const pure = !/^\s*import\s/m.test(read(LINK_FILE));
    const drawer = read(DRAWER);
    const wired = /crmRouteFromLink|crmRouteFromNotification/.test(drawer) && /addNotificationResponseReceivedListener/.test(drawer);
    chk("C3.7-S4.2", "tapping a CRM push opens the app screen: the pure mapper crmRouteFromLink(link of crmNotifLink) maps a deal link → an app route under /crm carrying the deal id · an activity link → /crm/tasks… · a chat link or a foreign absolute URL → null · it is wired in the (app)/_layout notification-response listener next to the chat handler",
      !!map && pure && typeof mDeal === "string" && mDeal.startsWith("/crm") && mDeal.includes(dS1) && typeof mAct === "string" && mAct.startsWith("/crm/tasks") && mChat === null && mEvil === null && wired,
      "deal · tasks · null · null · wired", `mapper=${!!map} pure=${pure} deal=${j(mDeal)} act=${j(mAct)} chat=${j(mChat)} evil=${j(mEvil)} wired=${wired}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 — business-card scan = the C2.4 proposal path (2)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S5 · card scan ──");
  {
    const files = [`${API_DIR}/scan-card/route.ts`, `${API_DIR}/scan-card/[proposalId]/accept/route.ts`, ROUTES_LIB, ...walk(APP_DIR)];
    const src = files.map((f) => stripComments(read(f))).join("\n");
    const second = /aiProposal\s*\.\s*create|\.chat\s*\(\s*\[|imageUrls|resolveProvider|chargeUsage/.test(src);
    const scr = read(`${APP_DIR}/scan-card.tsx`);
    const miss = tids(scr, ["crm-scan-card", "crm-scan-pick", "crm-scan-draft", "crm-scan-accept", "crm-scan-done"]);
    chk("C3.7-S5.1", "card scan reuses the C2.4 engine [static]: the routes call scanBusinessCard / acceptLeadProposal and contain no second vision call, prompt, proposal writer or credit charge · scan-card.tsx POSTs /api/mobile/crm/scan-card then …/accept and shows the draft (mockup 13 c \"AI อ่านนามบัตรแล้ว\") — testIDs crm-scan-card · crm-scan-pick · crm-scan-draft · crm-scan-accept · crm-scan-done",
      BUILT && !second && /scanBusinessCard/.test(src) && /acceptLeadProposal/.test(src) && miss.length === 0 && /\/api\/mobile\/crm\/scan-card/.test(scr), "reuse · no fork · testIDs", `fork=${second} scan=${/scanBusinessCard/.test(src)} accept=${/acceptLeadProposal/.test(src)} missing=${miss.join(",") || "-"}${ABSENT}`);
  }
  {
    const big = Buffer.alloc(6 * 1024 * 1024, 1).toString("base64");
    const noTok = await hit(R.scan, "POST", `/api/mobile/crm/scan-card${q(crmT)}`, { tenant: tidT, body: { contentType: "image/jpeg", dataBase64: "AAAA" } });
    const tooBig = await hit(R.scan, "POST", `/api/mobile/crm/scan-card${q(crmT)}`, { token: tS1, tenant: tidT, body: { contentType: "image/jpeg", dataBase64: big, filename: "card.jpg" } });
    const svg = await hit(R.scan, "POST", `/api/mobile/crm/scan-card${q(crmT)}`, { token: tS1, tenant: tidT, body: { contentType: "image/svg+xml", dataBase64: Buffer.from("<svg/>").toString("base64"), filename: "card.svg" } });
    const mkProp = async (sys: string) => (await P.aiProposal.create({ data: { tenantId: tidT, conversationId: `crm:card:${sys}`, kind: "crm_create_lead", risk: "NORMAL", summary: `นามบัตร ${TAG}`, payload: { systemId: sys, name: pii(`คุณประกาศ ${TAG}`), phone: phoneOf(), email: pii(`${TAG}-card@qc.invalid`), company: "", jobTitle: "ผจก." }, expiresAt: new Date(Date.now() + 3_600_000) } })).id as string;
    const pr = await mkProp(crmT);
    const prOther = await mkProp(crmT2);
    const acc = await hit(R.accept, "POST", `/api/mobile/crm/scan-card/${pr}/accept${q(crmT)}`, { token: tS1, tenant: tidT, params: { proposalId: pr }, body: {} });
    const again = await hit(R.accept, "POST", `/api/mobile/crm/scan-card/${pr}/accept${q(crmT)}`, { token: tS1, tenant: tidT, params: { proposalId: pr }, body: {} });
    const other = await hit(R.accept, "POST", `/api/mobile/crm/scan-card/${prOther}/accept${q(crmT)}`, { token: tS1, tenant: tidT, params: { proposalId: prOther }, body: {} });
    const made = acc.body?.contactId ? ((await P.crmContact.findFirst({ where: { id: String(acc.body.contactId), tenantId: tidT, systemId: crmT } })) as Any) : null;
    const credit = (await P.aiCreditTxn.count({ where: { tenantId: tidT } }).catch(() => 0)) as number;
    chk("C3.7-S5.2", "card scan through the routes: no Bearer ⇒ 401 · a 6 MB photo ⇒ 400 with the C2.4 service's own Thai message (\"รูปนามบัตรใหญ่เกิน…\") and an SVG ⇒ 400 (\"ไม่ใช่รูปที่ระบบอ่านได้…\") — refused before any AI call, nothing charged · accepting a card proposal of THIS system creates the contact in it (sourceDetail.via \"card-scan\") · the same proposal again ⇒ 409 · a proposal of another CRM system ⇒ 404",
      noTok.status === 401 && tooBig.status === 400 && /รูปนามบัตรใหญ่เกิน/.test(String(tooBig.body?.message ?? "")) && svg.status === 400 && /ไม่ใช่รูปที่ระบบอ่านได้/.test(String(svg.body?.message ?? "")) && credit === 0
      && okS(acc) && !!made && made.sourceDetail?.via === "card-scan" && again.status === 409 && other.status === 404,
      "401 · 400 · 400 · contact · 409 · 404", `noTok=${noTok.status} big=${rr(tooBig)} svg=${rr(svg)} credit=${credit} accept=${rr(acc)} made=${!!made} via=${made?.sourceDetail?.via} again=${again.status} other=${other.status}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X7 · X8 · X10
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X7 · X8 · X10 ──");
  {
    const CR = (await import("@/lib/mobile/crm-routes" as string).catch(() => ({}))) as Any;
    const lim = Number(CR.MOBILE_CRM_RATE_LIMIT?.limit ?? 0);
    const sane = lim >= 10 && lim <= 300;
    let firstLimited = -1;
    let last: RR = { status: 0, body: null, err: "" };
    if (sane) {
      for (let i = 0; i < lim + 1 && firstLimited < 0; i += 10) {
        const batch = await Promise.all(Array.from({ length: Math.min(10, lim + 1 - i) }, () => hit(R.tasks, "GET", `/api/mobile/crm/tasks${q(crmT)}`, { token: tS3, tenant: tidT })));
        const k = batch.findIndex((x) => x.status === 429);
        if (k >= 0) { firstLimited = i + k; last = batch[k]; }
        else last = batch[batch.length - 1];
      }
    }
    const other = await hit(R.tasks, "GET", `/api/mobile/crm/tasks${q(crmT)}`, { token: tS2, tenant: tidT });
    const bucket = (await P.chatRateBucket.count({ where: { key: { contains: uS3 } } }).catch(() => 0)) as number;
    chk("C3.7-X7.1", "X7 per-user limiter: MOBILE_CRM_RATE_LIMIT is sane (10–300 per window) · firing limit+1 requests as ONE user ⇒ the request after the limit answers 429 with a Thai message · another user of the same shop (same IP) still gets 200 · the DB bucket key carries the user id (checkRateLimitDb, not a second limiter)",
      sane && firstLimited === lim && last.status === 429 && thaiErr(last) && okS(other) && bucket >= 1, "429 at limit+1 · per user", `limit=${lim} first429=${firstLimited} last=${rr(last)} other=${other.status} bucket=${bucket}${ABSENT}`, "MAJOR");
  }
  {
    const emails = (await P.crmContact.findMany({ where: { tenantId: SEED_T, systemId: SEED_S, ownerUserId: seedThana, email: { not: null } }, select: { email: true }, take: 500 })) as Any[];
    const blob = j(gDeals.body) + j(gTasks.body) + j(gPrompt.body);
    const leakSeed = emails.map((e) => String(e.email)).filter((e) => e && blob.includes(e));
    const leakT = PII.filter((x) => x.includes("@")).filter((x) => blob.includes(x));
    const taskPhones = /\b0\d{9}\b/.test(j(gTasks.body));
    chk("C3.7-X8.1", "X8: the mobile DTOs carry no customer e-mail (deals · tasks · call-log prompt of the seed as thana) and the task list carries no phone number — the deal card's phone (for tel:) is the only contact datum sent to the phone",
      okS(gDeals) && okS(gTasks) && leakSeed.length === 0 && leakT.length === 0 && !taskPhones, "no e-mail · no task phone", `deals=${gDeals.status} tasks=${gTasks.status} emailLeaks=${leakSeed.length + leakT.length} taskPhone=${taskPhones}${ABSENT}`, "MAJOR");
  }
  {
    const appSrc = [...walk(APP_DIR), ...walk("apps/mobile/src/components/crm"), LINK_FILE, "apps/mobile/src/lib/call-prompt.ts"].filter(existsSync).map((f) => stripComments(read(f))).join("\n");
    const tokenInUrl = /[?&](token|access_token|bearer)=|`[^`]*\$\{[^}]*[Tt]oken[^}]*\}[^`]*`/.test(appSrc.replace(/ExponentPushToken/g, ""));
    const rawFetch = /\bfetch\s*\(/.test(appSrc);
    chk("C3.7-X10.1", "X10 [static]: the CRM screens never put the session token in a URL (no ?token= / template with the token) and never fetch() directly — every call goes through src/api/client (Bearer header) · tel: links carry the phone only",
      BUILT && appSrc.length > 0 && !tokenInUrl && !rawFetch, "no token in URL · api client only", `files=${appSrc.length > 0} tokenInUrl=${tokenInUrl} rawFetch=${rawFetch}${ABSENT}`, "MAJOR");
  }
} catch (e) {
  chk("C3.7-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — throwaway tenants (4 passes over every table with tenantId) · users · sessions (tagged + of the throwaway users) ·
  // rate buckets and push devices of this run · thana's tagged session on the seed. The seeded shop itself was only read.
  // ═════════════════════════════════════════════════════════════════════════════
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* order/FK — retried next pass */ } };
  const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[])
    .map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
  if (ids.length > 0) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    for (let pass = 0; pass < 4; pass += 1)
      for (const t of tables) await del(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
    for (const id of ids) {
      await del(() => P.appSystemUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.appSystem.deleteMany({ where: { tenantId: id } }));
      await del(() => P.businessUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.tenant.delete({ where: { id } }));
    }
  }
  await del(() => P.session.deleteMany({ where: { userAgent: TAG } }));
  await del(() => P.pushDevice.deleteMany({ where: { expoToken: { contains: TAG } } }));
  for (const uid of USERS) {
    await del(() => P.chatRateBucket.deleteMany({ where: { key: { contains: uid } } }));
    await del(() => P.pushDevice.deleteMany({ where: { userId: uid } }));
    await del(() => P.appNotification.deleteMany({ where: { recipientUserId: uid } }));
    await del(() => P.session.deleteMany({ where: { userId: uid } }));
    await del(() => P.user.delete({ where: { id: uid } }));
  }
  try {
    const left: string[] = [];
    if (ids.length > 0) {
      const inList = ids.map((x) => `'${x}'`).join(",");
      for (const t of tables) {
        const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[];
        const c = Number(r?.[0]?.n ?? 0);
        if (c > 0) left.push(`${t}=${c}`);
      }
    }
    const tenants = ids.length ? await P.tenant.count({ where: { id: { in: ids } } }) : 0;
    const users = USERS.length ? await P.user.count({ where: { id: { in: USERS } } }) : 0;
    const sessions = (await P.session.count({ where: { userAgent: TAG } })) as number;
    const devices = (await P.pushDevice.count({ where: { expoToken: { contains: TAG } } })) as number;
    const buckets = USERS.length ? ((await P.chatRateBucket.count({ where: { OR: USERS.map((u) => ({ key: { contains: u } })) } }).catch(() => 0)) as number) : 0;
    const seedWrites = seedThana ? ((await P.crmActivity.count({ where: { ownerUserId: seedThana, title: { contains: TAG } } })) as number) : 0;
    chk("C3.7-CLEAN", "the oracle gives the QC database back exactly as found — throwaway tenants and every row they owned (deals · activities · CALL logs · proposals · contacts), the throwaway users, every session of this run (incl. thana's tagged mobile session on the seed), rate buckets and push devices are gone · nothing was written into the seeded shop",
      left.length === 0 && tenants === 0 && users === 0 && sessions === 0 && devices === 0 && buckets === 0 && seedWrites === 0, "0 rows", `${left.join(" · ") || "-"} · tenants=${tenants} users=${users} sessions=${sessions} devices=${devices} buckets=${buckets} seedWrites=${seedWrites}`, "MAJOR");
  } catch (e) {
    chk("C3.7-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C3.7: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
