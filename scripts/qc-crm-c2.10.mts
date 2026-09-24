// QC — CRM v2 WO C2.10: stale deals · staff notifications · the whole CRM job set
//      `deals.markStale` (daily 06:00 BKK through the C0.5 dispatcher) + the daily stale DIGEST (one message per recipient) ·
//      `src/lib/modules/crm/notifications.ts` (+ `notifications-shared.ts`) = 10 templates × 3 channels (in-app · push · e-mail),
//      shop settings + per-user prefs (`CrmUserPref`), quiet hours that DEFER (never drop) · every CRM job registered with its cadence ·
//      events `crm.deal.stale` + `crm.activity.overdue`
// Oracle writer · the C2.10 builder must NOT touch this file · QC database only (.env.qc / .env.qc2 — loaded by scripts/acc-v2-env.mts)
// Run: bash scripts/iso.sh bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c2.10.mts
//      `--force-run` = run every check while the C2.10 service is absent — C2.10 checks red for the right reason, fixtures + the
//                      structural facts that do not need C2.10 + CLEAN green
// requires: crm-seed   (house style — this oracle reads NO seeded row; everything lives in throwaway tenants `qc-c210-<rand>-*`)
//
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE: qc-kanban-notify · qc-push · qc-cron · qc-member-m3.6 (notification templates) ·
//   qc-member-fix-s3 (quiet hours / digest / lease — the pure helpers move to a shared file in this work order) · qc-crm-c0.5
//   (dispatcher + the outbox route) · qc-crm-c2.1 (the `crm.deal.stale{days}` / `crm.activity.overdue` cron triggers must NOT double-fire) ·
//   qc-crm-c2.2 · qc-crm-c2.8 (their minute/daily jobs stay registered) · qc-crm-c1.5 (deals) · qc-crm-c1.6 (activities) ·
//   qc-crm-c1.7 (visibility) · qc-crm-c1.11 (home page + uiVersion) · qc-crm-v1 · qc-member-m1.9 (30/15/10/5 — untouched).
//
// SOURCES: crm-brief-C2.10.md (facts: copy `kanban/notify.ts` + `kanban/digest.ts`; staff push `core/push.ts`; NO LINE-to-staff and no
//   staff quiet hours today; LIFT the member quiet-hour pure functions into a shared helper — do not copy) · crm-brief-COMMON.md ·
//   crm-brief-RESOLUTIONS.md (R-A settings service · R-C.1 only three migrations ⇒ C2.10 has NO new column/table · R-C.6 no
//   `/api/cron/crm/*`, no `vercel.json` entry — `scripts/crm-cron.mts` + the C0.5 registry are the path to production ·
//   R-E.12 every "LINE immediate" default becomes push, every "LINE digest" becomes e-mail digest + in-app · R-E.14 uiVersion 1) ·
//   CRM-RUN §2 "C2.10" (S1 5 · S2 2 · S3 6 · S4 3 · S5 2 = 18) · MASTER-PLAN §4 (X1 X4 X5 X7 X8 X9) §6 row C2.10 ·
//   blueprint §7.4 (the 10 staff templates + their defaults + recipients) §7.5 (the job table: stale 06:00 · sequences 5 min ·
//   email-scheduled 5 min · activities hourly/5 min · score-decay 03:00 · close-due + record-field-due 07:00 · company-cache 04:00 ·
//   web/e-mail purge 02:00 · reports-scheduled · outbox) · mockup 01 ("ดีลที่ต้องดู") · src/lib/platform/minute-jobs.ts (registry ·
//   aligned windows · lease 15 min · `runMinuteJobs(now, { cadence })`) · src/lib/core/cron-auth.ts (`isCronAuthorized` — Bearer or
//   X-Cron-Secret, SHARK_CRON_SECRET or CRON_SECRET, constant-time) · src/lib/modules/kanban/digest.ts:93 (`sweepKanbanEmailHourly` —
//   the "AppNotification rows with emailedAt null + a link marker" deferral pattern C2.10 reuses) · src/lib/modules/member/
//   notifications.ts:69/82 (the PRIVATE `inQuietWindow` / `nextQuietEnd` to lift) · src/lib/core/push.ts:145/211 (injectable `post`) ·
//   src/lib/modules/crm/automation.ts:1463 (C2.1's cron candidate keys `crm.deal.stale#<days>#<id>#<anchorISO>` — C2.10 must use the
//   SAME key so the two paths can never fire a rule twice) · prisma/schema/crm.prisma (CrmUserPref { notifications Json, quietHours
//   Json?, @@unique(systemId, userId) } · CrmStage.staleDays · CrmDeal.lastActivityAt/stageEnteredAt — there is NO staleAt column).
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this) ══════════════════════════════════
//   A. `crm.deals.markStale(opts?: { now?: Date; tenantIds?: string[]; systemIds?: string[]; deps?: CrmNotifyDeps; deadline?: number;
//        signal?: AbortSignal })` → { marked: number; digests: number; cutOff: boolean }   (in `crm/deals.ts`, block `// CRM C2.10 ▸`)
//      • a deal is STALE when kind OPEN · archivedAt null · (lastActivityAt ?? stageEnteredAt) ≤ now − staleDays, where staleDays =
//        `CrmStage.staleDays` of its current stage, else `settings.crm.staleDaysDefault` (default 14)
//      • per stale deal it emits `crm.deal.stale` with the EXACT key C2.1's poller uses —
//        `crm.deal.stale#<days>#<dealId>#<(lastActivityAt ?? stageEnteredAt).toISOString()>` — payload ids only
//        { dealId, days, stageId, ownerUserId?, teamId? } ⇒ (1) one event per quiet spell for free (emitOutbox dedupes on
//        (tenantId, idempotencyKey)), (2) a new activity starts a new spell, (3) C2.1's daily catch-up poller and this job can never
//        make the same rule run twice (same key ⇒ `insertMainRun` dedupes)
//      • then ONE digest notification per recipient (never one per deal) through B, template key `deal.stale.digest`, vars
//        { count, systemId } — recipients = each stale deal's owner + the lead of its team, filtered by what that user may SEE
//      • only uiVersion-2 systems (filtered in SQL) · `tenantIds`/`systemIds` restrict the sweep (the job passes none; tests always do)
//      • claimed and looped like every C0.5 job: overlapping runs do the work once, a run that dies is retried after the lease
//   B. `src/lib/modules/crm/notifications.ts` — the staff notifier (ctx = { tenantId, systemId, actorUserId }):
//      `notifyStaff(ctx, input: { key: CrmNotifKey; userIds: string[]; refType: string; refId: string; vars?: Record<string, string |
//        number>; now?: Date }, opts?: { deps?: CrmNotifyDeps }) → { inApp: number; push: number; email: number; deferred: number }`
//        • effective channel = the shop default of that template AND the user's own override (the user wins when set)
//        • IN_APP ⇒ ONE `AppNotification` with `recipientUserId` set (never a shop-wide row), title/body from the template, the body
//          carries the deep link `/app/sys/<systemId>/crm/…` (which is ALSO what the deferral sweep selects on) and the record id
//        • dedupe per (recipientUserId, key, refType, refId, Thai day) ⇒ redelivery / parallel delivery writes ONE row (X4)
//        • PUSH / EMAIL go through `opts.deps` when given (tests never reach a real transport) and are SKIPPED — not dropped — while the
//          recipient is inside quiet hours: the in-app row stays with `emailedAt = null` and `runFanout` sends it after the window
//        • a user who cannot SEE the record (visibleWhere / no CRM read key / not a member any more) is never notified (X1)
//      `runFanout(opts?: { now?: Date; tenantIds?: string[]; deps?: CrmNotifyDeps })` → { sent: number }  — the hourly sweep of rows
//        whose quiet window has ended (`emailedAt = null` + the CRM link marker + a lookback window), stamping `emailedAt` so nothing
//        is ever sent twice (the `sweepKanbanEmailHourly` pattern)
//      `getNotificationSettings(ctx, actor)` / `setTemplate(ctx, actor, key, patch)` / `setNotificationSettings(ctx, actor, patch)` —
//        gate `crm.settings.manage`, stored at `settings.crm.notifications` through the C1.5 single-`jsonb_set` writer, every mutation
//        audited `crm.notify.*` (X9) · `getMyPrefs(ctx, actor)` / `setMyPrefs(ctx, actor, patch)` — a user's OWN prefs + own quiet
//        hours in `CrmUserPref` (no permission key needed; nobody can write another user's row)
//      `CrmNotifyDeps = { push?: (req) => Promise<{ ok: boolean }>; email?: (req) => Promise<{ ok: boolean }> }` — req carries ids only
//   C. `src/lib/modules/crm/notifications-shared.ts` (pure): `CRM_NOTIF_CHANNELS = ["IN_APP","PUSH","EMAIL"]` (LINE-to-staff is OUT —
//      brief + R-E.12) · `CRM_NOTIF_TEMPLATES` = THE 10 of blueprint §7.4, keys `lead.assigned` · `customer.replied` ·
//      `deal.stale.digest` · `tasks.today` · `activity.reminder` · `lead.hot` · `deal.closed` · `commission.status` ·
//      `quota.progress` · `invoice.paid`, each { key, label (Thai), title (Thai), body (Thai with {{vars}}), defaults: per channel
//      boolean, digest?: boolean } · `crmNotifDefaults()` · `CRM_QUIET_DEFAULT = { enabled: true, from: "21:00", to: "07:00" }`
//   D. `src/lib/core/quiet-hours.ts` (new, pure, no prisma): `inQuietWindow(now, from, to)` · `nextQuietEnd(now, to)` · `parseHM` —
//      LIFTED from `member/notifications.ts` (its private copies are DELETED and it imports these instead, inside a
//      `// CRM C2.10 ▸ … ◂` block): one engine for quiet hours, Thai time through the existing +07:00 helpers, never raw getHours().
//   E. JOBS — registered in `src/lib/platform/minute-jobs.ts` (block `// CRM C2.10 ▸ … ◂`), each best-effort and idempotent, all
//      reachable through `scripts/crm-cron.mts minute|hourly|daily`: `crm.deals.stale` (daily) · `crm.notify.fanout` (hourly) ·
//      `crm.activities.overdue` (hourly, emits `crm.activity.overdue` once per overdue task) · `crm.activities.reminders` (minute) ·
//      `crm.companies.cache` (daily) · `crm.purge.web` (daily) · `crm.purge.email` (daily) · `crm.reports.scheduled` (daily).
//      Already registered by earlier work orders and left alone: `crm.automation.waits` (hourly) · `crm.automation.cron` (daily —
//      it already covers close-due AND record-field-due, so those get no job of their own) · `crm.sequences` (minute) ·
//      `crm.emails.scheduled` (minute, C2.5) · `crm.scoring.decay` (daily, C2.8) · `crm.heartbeat`.
//      R-C.6 stays true: NO `/api/cron/crm/*` route and NO new `vercel.json` entry.
//   F. UI: `/crm/settings/notifications` (shop templates × channels + quiet hours + digest hour) and the per-user tab, guard
//      `type: "CRM"` → requireCrmV2Page → crmCan(…, "crm.settings.manage") → notFound() (the per-user tab needs no key) ·
//      nav entry { path "/crm/settings/notifications", status "ready", wo "C2.10" } · mockup 01: the home page (C1.11's
//      `crm/home.tsx`) gets the "ดีลที่ต้องดู" block with testids `crm-home-stale-list` / `crm-home-stale-row-*` ·
//      inventory rows (page "/settings/notifications", wo "C2.10") ≥ 8 · no new permission key, no migration.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// CHECK INVENTORY: 40 checks = S0 4 · S1 5 · S2 2 · S3 6 · S4 3 · S5 2 (S1–S5 = the 18 of CRM-RUN §2) · X1 3 · X4 2 · X5 2 · X7 2 ·
//   X8 3 · X9 2 · U 3 · CLEAN  (C2.10-FATAL only when something throws).
//   n/a: X2 (no REST op / AI tool — C2.11) · X3 (no shared counter: the digest is one row per (user, key, day), proven by X4) ·
//   X6 (the only free text is the shop's own template body, rendered into a notification it owns) · X10 (no file / secret stored).
// HOUSE RULES: SKIP guard before any DB connection · throwaway tenants swept in `finally` · the dispatcher state rows of the C2.10 jobs
//   (`OpsAlertState minute-job:*`) are snapshotted and restored · push/e-mail always through injected deps (a real transport call is
//   counted and fails X8.2) · synthetic clocks live in the PAST (Sep 2026) and `now` is THE clock · the cron routes are NEVER called
//   with a valid secret (that would run the whole platform's daily cron on the shared QC DB) · last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const NOTIF_FILE = "src/lib/modules/crm/notifications.ts";
const NOTIF_SHARED = "src/lib/modules/crm/notifications-shared.ts";
const NOTIF_SPEC = "@/lib/modules/crm/notifications";
const NOTIF_SHARED_SPEC = "@/lib/modules/crm/notifications-shared";
const QUIET_FILE = "src/lib/core/quiet-hours.ts";
const QUIET_SPEC = "@/lib/core/quiet-hours";
const MEMBER_NOTIF = "src/lib/modules/member/notifications.ts";
const DEALS_FILE = "src/lib/modules/crm/deals.ts";
const JOBS_FILE = "src/lib/platform/minute-jobs.ts";
const CRON_RUNNER = "scripts/crm-cron.mts";
const HOME_FILE = "src/lib/modules/crm/home.tsx";
const PAGE_DIR = "src/app/app/sys/[id]/crm/settings/notifications";
const PAGE = `${PAGE_DIR}/page.tsx`;
const COMP_DIR = "src/components/crm/notifications";
const NAV_FILE = "src/lib/modules/crm/nav.ts";
const INVENTORY = "scripts/crm-ui-inventory.json";
const TICK_SPEC = "@/app/api/cron/tick/route";
const HOURLY_SPEC = "@/app/api/cron/hourly/route";

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
// SKIP guard
// ═══════════════════════════════════════════════════════════════════════════════════
const notifSrc0 = read(NOTIF_FILE);
const BUILT = /export\s+async\s+function\s+notifyStaff\b/.test(notifSrc0) || /export\s+async\s+function\s+runFanout\b/.test(notifSrc0);
if (!FORCE && !BUILT) {
  console.log(`⚠️  SKIPPED — WO C2.10 not built yet (${NOTIF_FILE} absent or without notifyStaff/runFanout) (run with --force-run to exercise the fixtures and the cleanup)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c210-${rand}`;

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
const fnOf = (mod: Any, ...names: string[]): Any => {
  for (const n of names) {
    let v: Any = mod;
    for (const p of n.split(".")) v = v?.[p];
    if (typeof v === "function") return v;
  }
  return undefined;
};
const DAY = 86_400_000;
const ABSENT = BUILT ? "" : " · [crm/notifications.ts ABSENT]";
// synthetic clock: 2026-09-10, 11:00 Thai (04:00Z) — a Thursday, outside a 21:00–07:00 quiet window
const NOW = new Date("2026-09-10T04:00:00.000Z");
const NIGHT = new Date("2026-09-10T15:00:00.000Z"); // 22:00 Thai — inside 21:00–07:00
const MORNING = new Date("2026-09-11T01:30:00.000Z"); // 08:30 Thai the next day — after the window
const thaiYmd = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

console.log(`\n═══ QC CRM v2 · C2.10 — stale deals · staff notifications · jobs ═══`);
console.log(`[env] DB ${host} · tag ${TAG}${FORCE && !BUILT ? " · --force-run with C2.10 ABSENT (C2.10 checks expected red; fixtures + CLEAN green)" : ""}\n`);

const TENANTS: string[] = [];
const USERS: string[] = [];
const PII: string[] = [];
const pii = <T extends string>(s: T): T => { PII.push(s); return s; };
let seq = 0;
const nx = () => `${++seq}`;
let phoneSeq = 0;
const phoneOf = (): string => pii(`08${String((Math.floor(Math.random() * 9_000_000) + 1_000_000) * 10 + (phoneSeq++ % 10)).padStart(8, "0").slice(-8)}`);
const NONE = `${TAG}-none`;
const OPS_KEYS: string[] = [];
let opsSnap: Any[] = [];
// transport spies — a real send would have to go through these (X8.2)
const SENT: { ch: string; req: Any }[] = [];
const DEPS = {
  push: async (req: Any) => { SENT.push({ ch: "PUSH", req }); return { ok: true }; },
  email: async (req: Any) => { SENT.push({ ch: "EMAIL", req }); return { ok: true }; },
};
const sentTo = (ch: string, userId: string) => SENT.filter((s) => s.ch === ch && j(s.req).includes(userId)).length;

try {
  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — structure
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S0 · structure ──");
  const NT = (await import(NOTIF_SPEC as string).catch(() => ({}))) as Any;
  const NSH = (await import(NOTIF_SHARED_SPEC as string).catch(() => ({}))) as Any;
  const QH = (await import(QUIET_SPEC as string).catch(() => ({}))) as Any;
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => ({}))) as Any;
  const MJ = (await import("@/lib/platform/minute-jobs" as string).catch(() => ({}))) as Any;
  const AUTO = (await import("@/lib/modules/crm/automation" as string).catch(() => ({}))) as Any;
  const notifyStaff = fnOf(NT, "notifyStaff") ?? fnOf(CRM, "notifications.notifyStaff");
  const runFanout = fnOf(NT, "runFanout") ?? fnOf(CRM, "notifications.runFanout");
  const getSettings = fnOf(NT, "getNotificationSettings") ?? fnOf(CRM, "notifications.getNotificationSettings");
  const setTemplate = fnOf(NT, "setTemplate") ?? fnOf(CRM, "notifications.setTemplate");
  const setSettings = fnOf(NT, "setNotificationSettings") ?? fnOf(CRM, "notifications.setNotificationSettings");
  const getMyPrefs = fnOf(NT, "getMyPrefs") ?? fnOf(CRM, "notifications.getMyPrefs");
  const setMyPrefs = fnOf(NT, "setMyPrefs") ?? fnOf(CRM, "notifications.setMyPrefs");
  const markStale = fnOf(CRM, "deals.markStale") ?? fnOf(await import("@/lib/modules/crm/deals" as string).catch(() => ({})), "markStale");
  const TPL = Array.isArray(NSH.CRM_NOTIF_TEMPLATES) ? (NSH.CRM_NOTIF_TEMPLATES as Any[]) : [];
  const WANT_KEYS = ["lead.assigned", "customer.replied", "deal.stale.digest", "tasks.today", "activity.reminder", "lead.hot", "deal.closed", "commission.status", "quota.progress", "invoice.paid"];
  {
    const need: [string, Any][] = [["notifyStaff", notifyStaff], ["runFanout", runFanout], ["getNotificationSettings", getSettings], ["setTemplate", setTemplate],
      ["setNotificationSettings", setSettings], ["getMyPrefs", getMyPrefs], ["setMyPrefs", setMyPrefs], ["deals.markStale", markStale]];
    const missing = need.filter(([, f]) => typeof f !== "function").map(([n]) => n);
    chk("C2.10-S0.1", "the 8 contract entries exist: `crm.notifications.notifyStaff` · runFanout · getNotificationSettings · setTemplate · setNotificationSettings · getMyPrefs · setMyPrefs (all on the facade) and `crm.deals.markStale`",
      missing.length === 0, "8 entries", `missing=${missing.join(",") || "-"}${ABSENT}`);
  }
  {
    const shSrc = read(NOTIF_SHARED);
    const impure = /from\s+["'](@prisma\/client|@\/lib\/core\/db|next\/[^"']+|server-only|\.\/db)["']/.test(shSrc);
    const keys = TPL.map((t) => String(t?.key));
    const missKeys = WANT_KEYS.filter((k) => !keys.includes(k));
    const chans = Array.isArray(NSH.CRM_NOTIF_CHANNELS) ? (NSH.CRM_NOTIF_CHANNELS as Any[]).map(String) : [];
    const shaped = TPL.every((t) => thai(t?.label) && thai(t?.title) && thai(t?.body) && t?.defaults && typeof t.defaults === "object");
    chk("C2.10-S0.2", "notifications-shared.ts is pure and carries THE 10 staff templates of blueprint §7.4 (keys lead.assigned · customer.replied · deal.stale.digest · tasks.today · activity.reminder · lead.hot · deal.closed · commission.status · quota.progress · invoice.paid), each with a Thai label/title/body and per-channel defaults · CRM_NOTIF_CHANNELS = IN_APP · PUSH · EMAIL exactly (LINE-to-staff is OUT — brief + R-E.12)",
      shSrc.length > 0 && !impure && TPL.length === 10 && missKeys.length === 0 && shaped && j([...chans].sort()) === j(["EMAIL", "IN_APP", "PUSH"]),
      "10 templates · 3 channels", `shared=${shSrc.length > 0} impure=${impure} templates=${TPL.length} missing=${missKeys.join(",") || "-"} shaped=${shaped} channels=${chans.join(",") || "-"}${ABSENT}`);
  }
  {
    // the quiet-hour helpers are LIFTED, not copied (no second engine — COMMON "no second engine" rule)
    const qSrc = read(QUIET_FILE);
    const mSrc = read(MEMBER_NOTIF);
    const inQuiet = fnOf(QH, "inQuietWindow");
    const nextEnd = fnOf(QH, "nextQuietEnd");
    const memberImports = new RegExp(`from\\s+["']@/lib/core/quiet-hours["']`).test(mSrc);
    const memberPrivateGone = !/function\s+inQuietWindow\s*\(/.test(mSrc) && !/function\s+nextQuietEnd\s*\(/.test(mSrc);
    const crmImports = new RegExp(`from\\s+["']@/lib/core/quiet-hours["']`).test(read(NOTIF_FILE));
    // 22:00 Thai is inside 21:00–07:00 · 09:00 Thai is not · the deferral lands on 07:00 Thai
    const night = typeof inQuiet === "function" ? inQuiet(NIGHT, "21:00", "07:00") === true : false;
    const day = typeof inQuiet === "function" ? inQuiet(NOW, "21:00", "07:00") === false : false;
    const endAt = typeof nextEnd === "function" ? (nextEnd(NIGHT, "07:00") as Date) : null;
    const endOk = !!endAt && new Date(endAt).toISOString() === "2026-09-11T00:00:00.000Z"; // 07:00 Thai next day
    chk("C2.10-S0.3", "quiet hours are ONE engine: the pure helpers live in `src/lib/core/quiet-hours.ts`, `member/notifications.ts` IMPORTS them (its private inQuietWindow/nextQuietEnd are gone — lifted, not copied) and the CRM notifier imports the same file · they are Thai-time: 22:00 Thai is inside 21:00–07:00, 11:00 Thai is not, and the deferral of a 22:00 event lands on 07:00 Thai the next morning",
      qSrc.length > 0 && typeof inQuiet === "function" && typeof nextEnd === "function" && memberImports && memberPrivateGone && crmImports && night && day && endOk,
      "shared helper · member lifted · Thai window", `file=${qSrc.length > 0} inQuietWindow=${typeof inQuiet} memberImports=${memberImports} memberPrivateGone=${memberPrivateGone} crmImports=${crmImports} night=${night} day=${day} end=${endAt ? new Date(endAt).toISOString() : "-"}${ABSENT}`);
  }
  {
    const files = [NOTIF_FILE, NOTIF_SHARED, QUIET_FILE].map(read).join("\n");
    const dealsSrc = read(DEALS_FILE);
    const rawClock = /\bgetHours\(\)|\bgetDay\(\)|\bgetDate\(\)/.test(read(NOTIF_FILE)) || /\bgetHours\(\)|\bgetDay\(\)/.test(read(QUIET_FILE).replace(/getUTC\w+\(\)/g, ""));
    const anyType = /(:\s*any\b|\bas any\b|<any>)/.test(read(NOTIF_FILE)) || /(:\s*any\b|\bas any\b|<any>)/.test(read(NOTIF_SHARED));
    const marks = ["X1", "X4", "X8"].filter((x) => new RegExp(`AUDIT-CLASS ${x}\\b`).test(files));
    const staleMark = /AUDIT-CLASS X[45]\b/.test(dealsSrc) && /CRM C2\.10 ▸/.test(dealsSrc);
    chk("C2.10-S0.4", "code rules: no raw `getHours()/getDay()/getDate()` anywhere in the new files (Thai time only through the +07:00 helpers — X8), no `any` in them, the sites are marked `// AUDIT-CLASS X1 / X4 / X8`, and `markStale` sits in a `// CRM C2.10 ▸` block of deals.ts marked AUDIT-CLASS X4/X5 [static]",
      read(NOTIF_FILE).length > 0 && !rawClock && !anyType && marks.length === 3 && staleMark,
      "no raw clock · no any · markers", `rawClock=${rawClock} any=${anyType} markers=${marks.join(",") || "-"} dealsBlock=${staleMark}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP
  // ═════════════════════════════════════════════════════════════════════════════
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const teamsSvc = (await import("@/lib/core/teams" as string)) as Any;
  const mkUser = async (suffix: string) => {
    const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix || "owner"} ${TAG}` } });
    USERS.push(u.id);
    return u.id as string;
  };
  const userA = await mkUser("");       // OWNER
  const userM = await mkUser("-mgr");   // MANAGER
  const userO1 = await mkUser("-own1"); // STAFF · owner of the stale deals
  const userO2 = await mkUser("-own2"); // STAFF · owner of another deal
  const userLead = await mkUser("-lead"); // team lead of O1
  const userTh = await mkUser("-thana"); // STAFF of another team (must NOT be notified)
  const userGone = await mkUser("-gone"); // membership removed later
  const SALES = { "crm.contact.read": true, "crm.deal.read": true, "crm.activity.read": true };
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
  const tidA = await mkTenant("a");
  for (const [u, r, p] of [[userA, "OWNER", {}], [userM, "MANAGER", {}], [userO1, "STAFF", SALES], [userO2, "STAFF", SALES], [userLead, "STAFF", SALES], [userTh, "STAFF", SALES], [userGone, "STAFF", SALES]] as [string, string, Record<string, unknown>][]) await member(tidA, u, r, p);
  const crmA = await mk(tidA, "CRM", "CRM");   // S1/S2 stale + digest
  const crmN = await mk(tidA, "CRM", "CRM แจ้งเตือน"); // S3 templates/channels
  const crmV = await mk(tidA, "CRM", "CRM v1"); // U (uiVersion 1)
  for (const s of [crmA, crmN]) await setCrm(s, { uiVersion: 2, bridgesEnabled: true });
  await setCrm(crmV, { uiVersion: 2, bridgesEnabled: true });
  const owner = { userId: userA, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> };
  const manager = { userId: userM, role: "MANAGER", unitAccess: ["*"] as string[], permissions: {} as Record<string, unknown> };
  const staffActor = (userId: string, perms: Record<string, unknown>) => ({ userId, role: "STAFF", unitAccess: ["*"] as string[], permissions: perms });
  const o1 = staffActor(userO1, SALES);
  const ctxOf = (sys: string, uid: string | null = userA) => ({ tenantId: tidA, systemId: sys, actorUserId: uid });
  const cA = ctxOf(crmA);
  const cN = ctxOf(crmN);
  const cV = ctxOf(crmV);

  // teams: T (lead userLead · member userO1) · T2 (userTh)
  const mkTeam = async (name: string, lead: string | null, members: string[]) => {
    const t = await call(teamsSvc.createTeam, { tenantId: tidA, actorUserId: userA }, { name: `${name} ${TAG}`, leadUserId: lead });
    const id = (t.v?.id as string) ?? (await P.team.create({ data: { tenantId: tidA, name: `${name} ${TAG}-raw`, leadUserId: lead } })).id;
    if (!t.ok && lead) await P.teamMember.create({ data: { tenantId: tidA, teamId: id, userId: lead, role: "LEAD" } }).catch(() => null);
    for (const u of members) await P.teamMember.create({ data: { tenantId: tidA, teamId: id, userId: u, role: "MEMBER" } }).catch(() => null);
    return id as string;
  };
  const teamT = await mkTeam("ทีมภูเก็ต", userLead, [userO1]);
  await mkTeam("ทีมกระบี่", null, [userTh]);

  const STD = [{ name: "ผู้สนใจใหม่", kind: "OPEN", probability: 10, staleDays: 3 }, { name: "เสนอราคา", kind: "OPEN", probability: 60, staleDays: null }, { name: "ชนะ", kind: "WON", probability: 100, staleDays: null }, { name: "แพ้", kind: "LOST", probability: 0, staleDays: null }];
  const mkPipe = async (sys: string) => {
    const p = (await P.crmPipeline.create({
      data: { tenantId: tidA, systemId: sys, name: `ขาย ${TAG}-${nx()}`, stages: { create: STD.map((s, i) => ({ tenantId: tidA, systemId: sys, sortOrder: i, ...s })) } },
      include: { stages: true },
    })) as Any;
    return { id: p.id as string, st: [...(p.stages as Any[])].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.id as string) };
  };
  const pA = await mkPipe(crmA);
  const pN = await mkPipe(crmN);
  const pV = await mkPipe(crmV);
  const mkContact = async (sys: string) => {
    const name = pii(`ลูกค้า ${TAG}-${nx()}`);
    const partyId = (await P.party.create({ data: { tenantId: tidA, name, kind: "PERSON" } })).id as string;
    return (await P.crmContact.create({ data: { tenantId: tidA, systemId: sys, name, firstName: name, phone: phoneOf(), partyId, ownerUserId: userA } })).id as string;
  };
  const mkDeal = async (sys: string, pipe: { id: string; st: string[] }, opts: { ownerUserId: string; teamId?: string | null; stageIdx?: number; idleDays?: number; kind?: string; archived?: boolean; lastActivity?: boolean }) => {
    const contactId = await mkContact(sys);
    const anchor = new Date(NOW.getTime() - (opts.idleDays ?? 0) * DAY);
    const d = (await P.crmDeal.create({
      data: {
        tenantId: tidA, systemId: sys, contactId, pipelineId: pipe.id, stageId: pipe.st[opts.stageIdx ?? 0],
        title: pii(`ดีล ${TAG}-${nx()}`), valueSatang: 500_000, ownerUserId: opts.ownerUserId, teamId: opts.teamId ?? null,
        kind: opts.kind ?? "OPEN", stageEnteredAt: anchor, ...(opts.lastActivity ? { lastActivityAt: anchor } : {}),
        ...(opts.archived ? { archivedAt: new Date(NOW.getTime() - DAY) } : {}),
      },
    })) as Any;
    return { id: d.id as string, contactId, anchor };
  };
  const staleEvents = async (dealId: string) => ((await P.outboxEvent.findMany({ where: { tenantId: tidA, type: "crm.deal.stale" } })) as Any[]).filter((e) => j(e.payload).includes(dealId));
  const notesOf = async (userId: string, mark?: string) =>
    ((await P.appNotification.findMany({ where: { tenantId: tidA, recipientUserId: userId }, orderBy: { createdAt: "asc" } })) as Any[]).filter((n) => !mark || `${n.title} ${n.body}`.includes(mark));
  const stale = async (sys: string, opts: Record<string, Any> = {}) => call(markStale, { now: NOW, tenantIds: [tidA], systemIds: [sys], deps: DEPS, ...opts });

  // snapshot the dispatcher state rows of the C2.10 jobs (shared table)
  const C210_JOBS: [string, number, string][] = [["crm.deals.stale", 1440, "daily"], ["crm.notify.fanout", 60, "hourly"], ["crm.activities.overdue", 60, "hourly"], ["crm.activities.reminders", 5, "minute"], ["crm.companies.cache", 1440, "daily"], ["crm.purge.web", 1440, "daily"], ["crm.purge.email", 1440, "daily"], ["crm.reports.scheduled", 1440, "daily"]];
  for (const [n] of C210_JOBS) OPS_KEYS.push(`minute-job:lease:${n}`, `minute-job:run:${n}`, `minute-job:ok:${n}`);
  opsSnap = (await P.opsAlertState.findMany({ where: { source: { in: OPS_KEYS } }, select: { source: true, lastAlertAt: true } }).catch(() => [])) as Any[];

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — markStale
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S1 · markStale ──");
  {
    const d3 = await mkDeal(crmA, pA, { ownerUserId: userO1, teamId: teamT, stageIdx: 0, idleDays: 4 });  // stage staleDays 3 · idle 4 ⇒ stale
    const dFresh = await mkDeal(crmA, pA, { ownerUserId: userO1, teamId: teamT, stageIdx: 0, idleDays: 2 }); // idle 2 ⇒ not stale
    const dDefault = await mkDeal(crmA, pA, { ownerUserId: userO2, stageIdx: 1, idleDays: 20 });            // staleDays null ⇒ default 14 ⇒ stale
    const dUnderDefault = await mkDeal(crmA, pA, { ownerUserId: userO2, stageIdx: 1, idleDays: 9 });        // 9 < 14 ⇒ not stale
    const r = await stale(crmA);
    const e1 = await staleEvents(d3.id);
    chk("C2.10-S1.1", "staleness is per stage: a deal idle 4 days in a stage with staleDays 3 is stale, the same stage at 2 days is not · a stage with staleDays null falls back to the shop default (14): idle 20 days is stale, idle 9 days is not",
      r.ok && e1.length === 1 && (await staleEvents(dFresh.id)).length === 0 && (await staleEvents(dDefault.id)).length === 1 && (await staleEvents(dUnderDefault.id)).length === 0,
      "2 stale · 2 fresh", `run=${r.ok ? j(r.v) : r.err} d3=${e1.length} fresh=${(await staleEvents(dFresh.id)).length} default=${(await staleEvents(dDefault.id)).length} under=${(await staleEvents(dUnderDefault.id)).length}${ABSENT}`);
    const ev = e1[0];
    const payload = (ev?.payload ?? {}) as Record<string, unknown>;
    const keyWant = `crm.deal.stale#${Math.max(3, 0)}#${d3.id}#${d3.anchor.toISOString()}`;
    const again = await stale(crmA);
    chk("C2.10-S1.2", "emitted ONCE per quiet spell with the key C2.1's poller uses — `crm.deal.stale#<days>#<dealId>#<(lastActivityAt ?? stageEnteredAt).toISOString()>` — payload ids only { dealId, days, stageId, ownerUserId } · a second run on the same day adds NO second event (there is no staleAt column: the outbox key IS the flag)",
      e1.length === 1 && String(ev?.idempotencyKey ?? "") === keyWant && String(payload.dealId ?? "") === d3.id && Number(payload.days) === 3 && !PII.some((p) => j(payload).includes(p)) && again.ok && (await staleEvents(d3.id)).length === 1,
      "1 event · exact key", `key=${cut(ev?.idempotencyKey, 90)} want=${cut(keyWant, 90)} payload=${cut(j(payload), 120)} afterSecondRun=${(await staleEvents(d3.id)).length}${ABSENT}`);
    // an activity clears it ⇒ a new spell may be announced later
    await P.crmDeal.update({ where: { id: d3.id }, data: { lastActivityAt: new Date(NOW.getTime() - 1 * DAY) } });
    const afterActivity = await stale(crmA);
    const cleared = await staleEvents(d3.id);
    await P.crmDeal.update({ where: { id: d3.id }, data: { lastActivityAt: new Date(NOW.getTime() - 9 * DAY) } });
    const newSpell = await stale(crmA);
    const spell2 = await staleEvents(d3.id);
    const won = await mkDeal(crmA, pA, { ownerUserId: userO1, stageIdx: 2, idleDays: 30, kind: "WON" });
    const archived = await mkDeal(crmA, pA, { ownerUserId: userO1, stageIdx: 0, idleDays: 30, archived: true });
    await stale(crmA);
    chk("C2.10-S1.3", "an activity clears it: after `lastActivityAt` moves to 1 day ago the deal is no longer stale (no new event) and when it goes quiet again (9 days) a NEW event is announced for the NEW spell (2 events in total, different keys) · a WON deal and an archived deal are never stale, however old",
      afterActivity.ok && cleared.length === 1 && newSpell.ok && spell2.length === 2 && new Set(spell2.map((e) => String(e.idempotencyKey))).size === 2 && (await staleEvents(won.id)).length === 0 && (await staleEvents(archived.id)).length === 0,
      "1 → 2 events · WON/archived never", `afterActivity=${cleared.length} newSpell=${spell2.length} keys=${new Set(spell2.map((e) => String(e.idempotencyKey))).size} won=${(await staleEvents(won.id)).length} archived=${(await staleEvents(archived.id)).length}${ABSENT}`);
    // C2.1 must not fire twice for the same spell
    const rule = await call(AUTO.createRule, { tenantId: tidA, systemId: crmA, actorUserId: userA }, owner, {
      name: `ดีลนิ่ง ${TAG}`, trigger: { event: "crm.deal.stale", params: { days: 3 } },
      actions: [{ type: "NOTIFY_STAFF", params: { userIds: [userA], text: `${TAG}-stale-rule` } }],
    });
    const rid = (rule.v?.id as string) ?? NONE;
    const dRule = await mkDeal(crmA, pA, { ownerUserId: userO1, stageIdx: 0, idleDays: 5, lastActivity: true });
    await stale(crmA);
    const evRule = (await staleEvents(dRule.id))[0];
    const OBX = (await import("@/lib/outbox-consumers" as string).catch(() => ({}))) as Any;
    const CONS: Any = OBX.consumers ?? {};
    if (evRule) await call(CONS?.["crm.deal.stale"], { id: evRule.id, tenantId: tidA, type: "crm.deal.stale", payload: evRule.payload, systemId: crmA, unitId: null });
    const cron = await call(AUTO.runCronTriggers, { now: NOW, tenantId: tidA });
    const runs = (await P.automationRun.count({ where: { ruleId: rid, crmContactId: dRule.contactId } })) as number;
    const runsAll = (await P.automationRun.count({ where: { ruleId: rid } })) as number;
    chk("C2.10-S1.4", "no double fire with C2.1: the same spell announced by `markStale` (live event ⇒ its consumer) and then by C2.1's daily catch-up poller runs the `crm.deal.stale{days:3}` rule EXACTLY ONCE (one AutomationRun for that deal) — the two paths must build the same idempotency key",
      rule.ok && !!evRule && cron.ok && runs === 1 && runsAll === 1,
      "1 run", `rule=${rule.ok ? "ok" : rule.err} event=${!!evRule} cron=${cron.ok ? j(cron.v) : cron.err} runsForDeal=${runs} runsTotal=${runsAll}${ABSENT}`);
    const notes1 = await notesOf(userO1, "นิ่ง");
    const notesLead = await notesOf(userLead, "นิ่ง");
    const notesTh = await notesOf(userTh, "นิ่ง");
    chk("C2.10-S1.5", "the digest goes to the people who own the work: ONE row for the owner of the stale deals (userO1) and ONE for the LEAD of his team, none for a STAFF of another team · every row has recipientUserId set (never a shop-wide announcement) and carries the deep link `/app/sys/<systemId>/crm` plus no customer name/phone",
      notes1.length === 1 && notesLead.length === 1 && notesTh.length === 0 && notes1.every((n) => !!n.recipientUserId && String(n.body).includes(`/app/sys/${crmA}/crm`)) && !PII.some((p) => `${notes1[0]?.title} ${notes1[0]?.body}`.includes(p)),
      "1 · 1 · 0", `owner=${notes1.length} lead=${notesLead.length} otherTeam=${notesTh.length} body=${cut(notes1[0]?.body, 120)}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — the digest is aggregated, not one message per deal
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2 · digest ──");
  {
    const sys = await mk(tidA, "CRM", "CRM สรุป");
    await setCrm(sys, { uiVersion: 2, bridgesEnabled: true });
    const pipe = await mkPipe(sys);
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) ids.push((await mkDeal(sys, pipe, { ownerUserId: userO1, teamId: teamT, stageIdx: 0, idleDays: 6 })).id);
    await mkDeal(sys, pipe, { ownerUserId: userO2, stageIdx: 0, idleDays: 6 });
    const r = await call(markStale, { now: NOW, tenantIds: [tidA], systemIds: [sys], deps: DEPS });
    const n1 = (await notesOf(userO1)).filter((n) => String(n.body).includes(`/app/sys/${sys}/crm`));
    const n2 = (await notesOf(userO2)).filter((n) => String(n.body).includes(`/app/sys/${sys}/crm`));
    const again = await call(markStale, { now: new Date(NOW.getTime() + 3_600_000), tenantIds: [tidA], systemIds: [sys], deps: DEPS });
    const n1b = (await notesOf(userO1)).filter((n) => String(n.body).includes(`/app/sys/${sys}/crm`));
    chk("C2.10-S2.1", "3 stale deals of ONE owner ⇒ exactly ONE digest row that says how many (the number 3 is in the title/body), never three rows · a second run later the same Thai day does not add another (dedupe per recipient × template × Thai day)",
      r.ok && n1.length === 1 && /3/.test(`${n1[0]?.title} ${n1[0]?.body}`) && again.ok && n1b.length === 1,
      "1 row · says 3", `run=${r.ok ? j(r.v) : r.err} rows=${n1.length} text=${cut(`${n1[0]?.title} ${n1[0]?.body}`, 140)} afterSecondRun=${n1b.length}${ABSENT}`);
    chk("C2.10-S2.2", "each owner gets his own digest only: userO2 (one stale deal) has exactly ONE row of his own and userO1's row does not mention userO2's deal id — the digest is built per recipient out of what that recipient may see",
      n2.length === 1 && !!n1[0] && !String(n1[0]?.body ?? "").includes(String((await P.crmDeal.findFirst({ where: { systemId: sys, ownerUserId: userO2 } }))?.id ?? NONE)),
      "1 row each", `o2=${n2.length} leak=${String(n1[0]?.body ?? "").length > 0}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — 10 templates × channels · shop/user prefs · quiet hours
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3 · templates · channels · quiet hours ──");
  const notify = async (ctx: Any, key: string, userIds: string[], refId: string, extra: Record<string, Any> = {}) =>
    call(notifyStaff, ctx, { key, userIds, refType: "CrmDeal", refId, vars: { count: 1 }, now: NOW, ...extra }, { deps: DEPS });
  {
    const settings = await call(getSettings, cN, owner);
    const view = (settings.v ?? {}) as Any;
    const tplView = (view.templates ?? {}) as Record<string, Any>;
    const missing = WANT_KEYS.filter((k) => !tplView[k]);
    const digestDefaults = tplView["deal.stale.digest"]?.channels ?? tplView["deal.stale.digest"] ?? {};
    const hotDefaults = tplView["lead.hot"]?.channels ?? tplView["lead.hot"] ?? {};
    chk("C2.10-S3.1", "getNotificationSettings returns all 10 templates with their per-channel defaults translated through R-E.12 — \"LINE ทันที\" becomes PUSH on (lead.hot), \"LINE รายวัน (สรุป)\" becomes the e-mail digest + in-app (deal.stale.digest: IN_APP on, EMAIL on) — plus the shop quiet hours (default 21:00–07:00, enabled) and the digest hour (08:00)",
      settings.ok && missing.length === 0 && hotDefaults?.PUSH === true && digestDefaults?.IN_APP === true && digestDefaults?.EMAIL === true && view.quietHours?.enabled === true && String(view.quietHours?.from) === "21:00" && String(view.quietHours?.to) === "07:00",
      "10 templates · defaults · quiet 21–07", `settings=${settings.ok ? cut(j(view), 200) : settings.err} missing=${missing.join(",") || "-"}${ABSENT}`);
  }
  {
    SENT.length = 0;
    const dN = await mkDeal(crmN, pN, { ownerUserId: userO1, teamId: teamT, stageIdx: 0, idleDays: 1 });
    const r = await notify(cN, "lead.hot", [userO1], dN.id);
    const notes = (await notesOf(userO1)).filter((n) => String(n.body).includes(dN.id));
    chk("C2.10-S3.2", "a template that is on for all three channels reaches all three with the injected deps: ONE AppNotification for that user (title/body rendered from the template), ONE push and ONE e-mail — and the return value counts them ({ inApp: 1, push: 1, email: 1 })",
      r.ok && notes.length === 1 && thai(notes[0]?.title) && sentTo("PUSH", userO1) === 1 && sentTo("EMAIL", userO1) === 1 && Number(r.v?.inApp ?? 0) === 1,
      "1 · 1 · 1", `notify=${r.ok ? j(r.v) : r.err} inApp=${notes.length} push=${sentTo("PUSH", userO1)} email=${sentTo("EMAIL", userO1)}${ABSENT}`);
  }
  {
    SENT.length = 0;
    const dOff = await mkDeal(crmN, pN, { ownerUserId: userO1, stageIdx: 0, idleDays: 1 });
    const shopOff = await call(setTemplate, cN, owner, "lead.hot", { channels: { EMAIL: false } });
    const r1 = await notify(cN, "lead.hot", [userO1], dOff.id);
    const emailAfterShopOff = sentTo("EMAIL", userO1);
    const userOff = await call(setMyPrefs, cN, o1, { notifications: { "lead.hot": { PUSH: false } } });
    const dOff2 = await mkDeal(crmN, pN, { ownerUserId: userO1, stageIdx: 0, idleDays: 1 });
    SENT.length = 0;
    const r2 = await notify(cN, "lead.hot", [userO1], dOff2.id);
    const pushAfterUserOff = sentTo("PUSH", userO1);
    const userOn = await call(setMyPrefs, cN, o1, { notifications: { "lead.hot": { EMAIL: true } } }); // the user turns back on what the shop turned off
    const dOn = await mkDeal(crmN, pN, { ownerUserId: userO1, stageIdx: 0, idleDays: 1 });
    SENT.length = 0;
    const r3 = await notify(cN, "lead.hot", [userO1], dOn.id);
    chk("C2.10-S3.3", "the effective channel is the shop default combined with the user's own override, and the USER wins when he has one: the shop switching EMAIL off silences e-mail · the user switching PUSH off for himself silences push (other users keep it) · the user switching EMAIL back on for himself gets e-mail again although the shop default is off",
      shopOff.ok && r1.ok && emailAfterShopOff === 0 && userOff.ok && r2.ok && pushAfterUserOff === 0 && userOn.ok && r3.ok && sentTo("EMAIL", userO1) === 1,
      "shop off · user off · user on", `shopOff=${shopOff.ok ? "ok" : shopOff.err} emailAfterShopOff=${emailAfterShopOff} userOff=${userOff.ok ? "ok" : userOff.err} pushAfterUserOff=${pushAfterUserOff} userOn=${userOn.ok ? "ok" : userOn.err} emailNow=${sentTo("EMAIL", userO1)}${ABSENT}`);
  }
  {
    // quiet hours DEFER, never drop
    SENT.length = 0;
    const dQ = await mkDeal(crmN, pN, { ownerUserId: userO2, stageIdx: 0, idleDays: 1 });
    const r = await call(notifyStaff, cN, { key: "lead.hot", userIds: [userO2], refType: "CrmDeal", refId: dQ.id, vars: { count: 1 }, now: NIGHT }, { deps: DEPS });
    const notes = (await notesOf(userO2)).filter((n) => String(n.body).includes(dQ.id));
    const pushInQuiet = sentTo("PUSH", userO2);
    const stampedBefore = notes[0]?.emailedAt ?? null;
    const fan1 = await call(runFanout, { now: MORNING, tenantIds: [tidA], deps: DEPS });
    const afterFan = (await notesOf(userO2)).filter((n) => String(n.body).includes(dQ.id));
    const pushAfter = sentTo("PUSH", userO2);
    const fan2 = await call(runFanout, { now: new Date(MORNING.getTime() + 3_600_000), tenantIds: [tidA], deps: DEPS });
    const pushAfterTwice = sentTo("PUSH", userO2);
    chk("C2.10-S3.4", "quiet hours DEFER, they never drop: a notification at 22:00 Thai writes the in-app row at once (the inbox is passive) but sends NO push/e-mail and leaves `emailedAt` null · the hourly `runFanout` after 07:00 sends it exactly once and stamps `emailedAt`, so a second sweep sends nothing more",
      r.ok && notes.length === 1 && pushInQuiet === 0 && stampedBefore === null && Number(r.v?.deferred ?? 0) >= 1 && fan1.ok && pushAfter === 1 && !!afterFan[0]?.emailedAt && fan2.ok && pushAfterTwice === 1,
      "0 now · 1 after · stamped", `notify=${r.ok ? j(r.v) : r.err} inApp=${notes.length} pushInQuiet=${pushInQuiet} fanout=${fan1.ok ? j(fan1.v) : fan1.err} pushAfter=${pushAfter} stamped=${!!afterFan[0]?.emailedAt} twice=${pushAfterTwice}${ABSENT}`);
  }
  {
    // the user's OWN quiet hours win over the shop's
    SENT.length = 0;
    const setOwn = await call(setMyPrefs, cN, o1, { quietHours: { enabled: true, from: "09:00", to: "18:00" } });
    const dOwn = await mkDeal(crmN, pN, { ownerUserId: userO1, stageIdx: 0, idleDays: 1 });
    const rMid = await call(notifyStaff, cN, { key: "lead.hot", userIds: [userO1, userO2], refType: "CrmDeal", refId: dOwn.id, vars: { count: 1 }, now: NOW }, { deps: DEPS });
    const mine = sentTo("PUSH", userO1);
    const other = sentTo("PUSH", userO2);
    await call(setMyPrefs, cN, o1, { quietHours: { enabled: false, from: "09:00", to: "18:00" } });
    chk("C2.10-S3.5", "a user's OWN quiet window beats the shop's: at 11:00 Thai (outside the shop window 21:00–07:00 but inside userO1's own 09:00–18:00) userO1 gets no push now while userO2 — same event, same call — gets his immediately · the window is read in Thai time, never from the server clock",
      setOwn.ok && rMid.ok && mine === 0 && other === 1,
      "0 for him · 1 for the other", `setOwn=${setOwn.ok ? "ok" : setOwn.err} mine=${mine} other=${other}${ABSENT}`);
  }
  {
    SENT.length = 0;
    const dVis = await mkDeal(crmN, pN, { ownerUserId: userO1, teamId: teamT, stageIdx: 0, idleDays: 1 });
    for (const entity of ["DEAL"]) await P.crmVisibilityPolicy.create({ data: { tenantId: tidA, systemId: crmN, role: "STAFF", teamId: null, pipelineId: null, entity, visibility: "OWN" } });
    const r = await call(notifyStaff, cN, { key: "deal.closed", userIds: [userO1, userTh, userGone], refType: "CrmDeal", refId: dVis.id, vars: { count: 1 }, now: NOW }, { deps: DEPS });
    await P.membership.deleteMany({ where: { tenantId: tidA, userId: userGone } });
    const r2 = await call(notifyStaff, cN, { key: "deal.closed", userIds: [userGone], refType: "CrmDeal", refId: dVis.id, vars: { count: 1 }, now: NOW }, { deps: DEPS });
    await P.crmVisibilityPolicy.deleteMany({ where: { systemId: crmN } });
    const mine = (await notesOf(userO1)).filter((n) => String(n.body).includes(dVis.id));
    const theirs = (await notesOf(userTh)).filter((n) => String(n.body).includes(dVis.id));
    const goneRows = (await notesOf(userGone)).filter((n) => String(n.body).includes(dVis.id));
    chk("C2.10-S3.6", "nobody is ever told about a record he cannot open: under an OWN policy the owner is notified while a STAFF of another team, named explicitly in the call, is NOT · and a user whose membership was removed gets nothing at all (the recipient list is filtered, not trusted)",
      r.ok && mine.length === 1 && theirs.length === 0 && r2.ok && goneRows.length <= 1 && sentTo("PUSH", userTh) === 0,
      "owner only", `notify=${r.ok ? j(r.v) : r.err} owner=${mine.length} otherTeam=${theirs.length} pushOther=${sentTo("PUSH", userTh)} goneRows=${goneRows.length}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — the job set · the dispatcher · the cron secret
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S4 · jobs · cron ──");
  {
    const reg = (globalThis as Any)[Symbol.for("shark.platform.minute-jobs.registry")] as Map<string, Any> | undefined;
    const bad: string[] = [];
    for (const [name, every, cadence] of C210_JOBS) {
      const job = reg?.get(name);
      if (!job) { bad.push(`${name}:missing`); continue; }
      if (job.everyMinutes !== every || (job.cadence ?? "minute") !== cadence || job.vpsOnly === true) bad.push(`${name}:${job.everyMinutes}/${job.cadence}/vps=${job.vpsOnly}`);
    }
    const inherited = ["crm.automation.waits", "crm.automation.cron", "crm.sequences", "crm.emails.scheduled", "crm.scoring.decay"].filter((n) => !reg?.get(n));
    const runner = read(CRON_RUNNER);
    chk("C2.10-S4.1", `the whole CRM job set is registered with the cadence of blueprint §7.5: C2.10 adds ${C210_JOBS.map(([n]) => n).join(" · ")} · the jobs of the earlier work orders are still there (crm.automation.waits/cron · crm.sequences · crm.emails.scheduled · crm.scoring.decay) · scripts/crm-cron.mts still knows minute | hourly | daily`,
      bad.length === 0 && inherited.length === 0 && /minute/.test(runner) && /hourly/.test(runner) && /daily/.test(runner),
      "8 new + 5 inherited", `bad=${bad.join(" | ") || "-"} missingInherited=${inherited.join(",") || "-"} runner=${runner.length > 0}${ABSENT}`);
  }
  {
    // the daily cadence really runs markStale once per window (aligned windows of C0.5)
    const sys = await mk(tidA, "CRM", "CRM รายวัน");
    await setCrm(sys, { uiVersion: 2, bridgesEnabled: true });
    const pipe = await mkPipe(sys);
    const d = await mkDeal(sys, pipe, { ownerUserId: userO1, stageIdx: 0, idleDays: 8 });
    const reg = (globalThis as Any)[Symbol.for("shark.platform.minute-jobs.registry")] as Map<string, Any> | undefined;
    const job = reg?.get("crm.deals.stale");
    const ctrl = { signal: new AbortController().signal, deadline: Date.now() + 20_000 };
    const r1 = job ? await call(job.run, NOW, 20_000, ctrl) : MISSING;
    const ev1 = await staleEvents(d.id);
    const r2 = job ? await call(job.run, NOW, 20_000, ctrl) : MISSING;
    const ev2 = await staleEvents(d.id);
    chk("C2.10-S4.2", "the registered daily job really is markStale: invoking the closure the dispatcher stores marks the 8-day-old deal (one `crm.deal.stale`) and invoking it again with the same `now` adds nothing — the job is idempotent on its own, before the dispatcher's lease even comes into play",
      !!job && r1.ok && ev1.length === 1 && r2.ok && ev2.length === 1,
      "1 event · idempotent", `job=${!!job} first=${r1.ok ? "ok" : r1.err} events=${ev1.length} second=${r2.ok ? "ok" : r2.err} after=${ev2.length}${ABSENT}`);
  }
  {
    const vercel = existsSync("vercel.json") ? (JSON.parse(read("vercel.json")) as Any) : {};
    const crons = ((vercel.crons ?? []) as Any[]).map((c) => String(c?.path));
    const noCrmRoute = !existsSync("src/app/api/cron/crm");
    const tickSrc = read("src/app/api/cron/tick/route.ts");
    const hourlySrc = read("src/app/api/cron/hourly/route.ts");
    const noCrmInTick = !/modules\/crm|crm\./.test(tickSrc.replace(/\/\/[^\n]*/g, "")) && !/modules\/crm/.test(hourlySrc.replace(/\/\/[^\n]*/g, ""));
    chk("C2.10-S4.3", "R-C.6 still holds after adding 8 jobs: NO `/api/cron/crm/*` route, NO new `vercel.json` entry (still only the two platform crons) and the CRM jobs are NOT bolted into `/api/cron/tick` or `/api/cron/hourly` — `scripts/crm-cron.mts` on the VPS crontab is the only production path (the hook in `/api/cron/outbox` stays the harmless extra)",
      noCrmRoute && crons.length === 2 && crons.includes("/api/cron/tick") && crons.includes("/api/cron/hourly") && noCrmInTick,
      "no route · 2 crons · untouched", `crmRoute=${!noCrmRoute} crons=${crons.join(",") || "-"} crmInPlatformRoutes=${!noCrmInTick}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 — UI (mockup 01 + the settings page) — static; pixel parity is gate D7
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S5 · UI static ──");
  {
    const page = read(PAGE);
    const nav = read(NAV_FILE);
    const home = read(HOME_FILE);
    let inv: Any[] = [];
    try { inv = (JSON.parse(read(INVENTORY)).rows ?? []) as Any[]; } catch { inv = []; }
    const rows = inv.filter((r) => r?.wo === "C2.10");
    const uiFiles = [...new Set([PAGE, ...walk(PAGE_DIR), ...walk(COMP_DIR)])].filter((f) => read(f).length > 0);
    const uiSrc = uiFiles.map(read).join("\n");
    const needIds = ["crm-notify-template-row-", "crm-notify-channel-", "crm-notify-quiet-from", "crm-notify-quiet-to", "crm-notify-save"];
    const missIds = needIds.filter((t) => !uiSrc.includes(t));
    const homeIds = ["crm-home-stale-list", "crm-home-stale-row-"].filter((t) => !home.includes(t));
    chk("C2.10-S5.1", `mockup 01 + the settings page: the home page (${HOME_FILE}) grows the "ดีลที่ต้องดู" block (testids crm-home-stale-list / crm-home-stale-row-*) and ${PAGE} is guarded like every CRM v2 page (type "CRM" → requireCrmV2Page → crmCan(… "crm.settings.manage") → notFound()) with a nav entry (status ready · wo C2.10) and ≥ 8 inventory rows carrying its testids [static]`,
      home.length > 0 && homeIds.length === 0 && page.length > 0 && /type:\s*"CRM"/.test(page) && /requireCrmV2Page/.test(page) && /crm\.settings\.manage/.test(page) && /notFound\(/.test(page)
      && /path:\s*"\/crm\/settings\/notifications"[^}]*status:\s*"ready"[^}]*wo:\s*"C2\.10"/.test(nav) && rows.length >= 8 && missIds.length === 0,
      "home block · guarded page · nav · ≥ 8 rows", `homeMissing=${homeIds.join(",") || "-"} page=${page.length > 0} guard=${/requireCrmV2Page/.test(page)} perm=${/crm\.settings\.manage/.test(page)} nav=${/\/crm\/settings\/notifications/.test(nav)} rows=${rows.length} missingIds=${missIds.join(",") || "-"}`, "MAJOR");
  }
  {
    const files = [...walk(PAGE_DIR), ...walk(COMP_DIR)];
    const isClient = (f: string) => /^\s*["']use client["']/.test(read(f));
    const isServer = (f: string) => /^\s*["']use server["']/.test(read(f));
    const badClient = files.filter(isClient).filter((f) => /from\s+["'](@\/lib\/core\/db|@prisma\/client|@\/lib\/modules\/crm(\/(?!.*-shared)[^"']*)?)["']/.test(read(f)));
    const serverFiles = files.filter(isServer);
    const serverBad = serverFiles.filter((f) => /export\s+(type|interface|const|let|function\s)/.test(read(f)) || !/assertCrmV2|crmUiVersion/.test(read(f)));
    const homeSrc = read(HOME_FILE);
    const homePii = /phone|email/i.test(homeSrc.split("\n").filter((l) => /stale/i.test(l)).join("\n"));
    chk("C2.10-S5.2", "the pages obey the C1.x rules: no `'use client'` file of this work order imports prisma or a non-shared CRM module, every `\"use server\"` file exports async functions only and calls assertCrmV2, and the new home block renders no phone/e-mail of a customer [static]",
      files.length > 0 && badClient.length === 0 && serverFiles.length >= 1 && serverBad.length === 0 && !homePii,
      "clean", `files=${files.length} badClient=${badClient.join(",") || "-"} serverFiles=${serverFiles.length} serverBad=${serverBad.join(",") || "-"} homePii=${homePii}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X1 · X4 · X5 — scope · redelivery · claims
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X1 · X4 · X5 ──");
  {
    const tidB = await mkTenant("b");
    await member(tidB, userA, "OWNER");
    const crmB = await mk(tidB, "CRM", "CRM-B");
    await setCrm(crmB, { uiVersion: 2, bridgesEnabled: true });
    const pipeB = await mkPipe(crmA); // pipeline of tenant A, used with tenant B's ctx below
    void pipeB;
    const foreign = await call(notifyStaff, { tenantId: tidB, systemId: crmB, actorUserId: userA }, { key: "lead.hot", userIds: [userO1], refType: "CrmDeal", refId: NONE, vars: {}, now: NOW }, { deps: DEPS });
    const rowsForO1 = (await notesOf(userO1)).filter((n) => String(n.body).includes(NONE));
    const cross = await call(markStale, { now: NOW, tenantIds: [tidB], systemIds: [crmB], deps: DEPS });
    const evInB = (await P.outboxEvent.count({ where: { tenantId: tidB, type: "crm.deal.stale" } })) as number;
    chk("C2.10-X1.1", "tenant scope: notifying a user of tenant A through tenant B's ctx (he is not a member there) writes nothing, and a sweep restricted to tenant B never touches tenant A's deals (0 events in B, whose only CRM system has no deals)",
      (foreign.ok || refusedThai(foreign)) && rowsForO1.length === 0 && cross.ok && evInB === 0,
      "0 rows · 0 events", `foreign=${foreign.ok ? j(foreign.v) : foreign.err} rows=${rowsForO1.length} sweep=${cross.ok ? j(cross.v) : cross.err} eventsInB=${evInB}${ABSENT}`);
  }
  {
    const sys = await mk(tidA, "CRM", "CRM ระบบสอง");
    await setCrm(sys, { uiVersion: 2, bridgesEnabled: true });
    const pipe = await mkPipe(sys);
    const d = await mkDeal(sys, pipe, { ownerUserId: userO1, stageIdx: 0, idleDays: 9 });
    const r = await call(markStale, { now: NOW, tenantIds: [tidA], systemIds: [crmA], deps: DEPS }); // sweep the OTHER system
    const ev = await staleEvents(d.id);
    chk("C2.10-X1.2", "system scope: a sweep of one CRM system leaves a 9-day-old deal of ANOTHER CRM system of the same shop alone (systemIds is honoured — a sweep that ignores it would eat other suites' rows on the shared QC database)",
      r.ok && ev.length === 0, "0 events", `sweep=${r.ok ? j(r.v) : r.err} events=${ev.length}${ABSENT}`);
  }
  {
    const settingsStaff = await call(getSettings, cN, staffActor(userO1, SALES));
    const setStaff = await call(setTemplate, cN, staffActor(userO1, SALES), "lead.hot", { channels: { PUSH: false } });
    const ownPrefs = await call(setMyPrefs, cN, o1, { notifications: { "tasks.today": { PUSH: false } } });
    const otherPrefs = await call(setMyPrefs, cN, o1, { userId: userO2, notifications: { "tasks.today": { PUSH: false } } });
    const o2row = (await P.crmUserPref.findFirst({ where: { systemId: crmN, userId: userO2 } })) as Any;
    chk("C2.10-X1.3", "shop settings need `crm.settings.manage` (a STAFF with only the read keys is refused in Thai on getNotificationSettings and setTemplate) while every user may write his OWN prefs · a payload that names ANOTHER user is ignored or refused — nobody edits somebody else's preferences",
      refusedAs(settingsStaff, ["FORBIDDEN", "NOT_FOUND"]) && refusedAs(setStaff, ["FORBIDDEN", "NOT_FOUND"]) && ownPrefs.ok && (!otherPrefs.ok || !o2row || !j(o2row.notifications ?? {}).includes("tasks.today")),
      "refused ×2 · own ok · no cross-write", `get=${settingsStaff.ok ? "ACCEPTED" : settingsStaff.code} set=${setStaff.ok ? "ACCEPTED" : setStaff.code} own=${ownPrefs.ok ? "ok" : ownPrefs.err} other=${otherPrefs.ok ? "ACCEPTED" : otherPrefs.code} o2=${cut(j(o2row?.notifications ?? null), 80)}${ABSENT}`);
  }
  {
    const sys = await mk(tidA, "CRM", "CRM ยิงพร้อมกัน");
    await setCrm(sys, { uiVersion: 2, bridgesEnabled: true });
    const pipe = await mkPipe(sys);
    const d = await mkDeal(sys, pipe, { ownerUserId: userO1, stageIdx: 0, idleDays: 7 });
    SENT.length = 0;
    const res = await Promise.all([0, 1, 2, 3].map(() => call(markStale, { now: NOW, tenantIds: [tidA], systemIds: [sys], deps: DEPS })));
    const ev = await staleEvents(d.id);
    const notes = (await notesOf(userO1)).filter((n) => String(n.body).includes(`/app/sys/${sys}/crm`));
    chk("C2.10-X4.1", "4 markStale sweeps started TOGETHER on the same system ⇒ exactly ONE `crm.deal.stale` event and ONE digest row for the owner (the outbox key and the per-day dedupe do the work — no sweep throws)",
      res.every((r) => r.ok) && ev.length === 1 && notes.length === 1,
      "1 event · 1 digest", `ok=${res.filter((r) => r.ok).length}/4 events=${ev.length} digests=${notes.length}${ABSENT}`);
  }
  {
    SENT.length = 0;
    const dR = await mkDeal(crmN, pN, { ownerUserId: userO2, stageIdx: 0, idleDays: 1 });
    const one = await notify(cN, "customer.replied", [userO2], dR.id);
    const two = await notify(cN, "customer.replied", [userO2], dR.id);
    const par = await Promise.all([0, 1, 2].map(() => notify(cN, "customer.replied", [userO2], dR.id)));
    const notes = (await notesOf(userO2)).filter((n) => String(n.body).includes(dR.id));
    chk("C2.10-X4.2", "notification dedupe per (user, template, refType, refId, Thai day): the same event delivered once, again and 3× in parallel ⇒ ONE AppNotification and ONE push for that user — a redelivered outbox event never buzzes a phone twice",
      one.ok && two.ok && par.every((r) => r.ok) && notes.length === 1 && sentTo("PUSH", userO2) === 1,
      "1 row · 1 push", `first=${one.ok ? "ok" : one.err} again=${two.ok ? "ok" : two.err} parallel=${par.filter((r) => r.ok).length}/3 rows=${notes.length} push=${sentTo("PUSH", userO2)}${ABSENT}`);
  }
  {
    // X5: a run that died after announcing (the digest row exists) must not announce twice; the lease is the dispatcher's (C0.5)
    const sys = await mk(tidA, "CRM", "CRM ตายกลางทาง");
    await setCrm(sys, { uiVersion: 2, bridgesEnabled: true });
    const pipe = await mkPipe(sys);
    const d = await mkDeal(sys, pipe, { ownerUserId: userO1, stageIdx: 0, idleDays: 7 });
    const first = await call(markStale, { now: NOW, tenantIds: [tidA], systemIds: [sys], deps: DEPS });
    const evOnce = await staleEvents(d.id);
    const notesOnce = (await notesOf(userO1)).filter((n) => String(n.body).includes(`/app/sys/${sys}/crm`));
    // simulate "died right after the event, before the digest": delete the digest row and run again
    if (notesOnce[0]) await P.appNotification.delete({ where: { id: notesOnce[0].id } });
    const second = await call(markStale, { now: new Date(NOW.getTime() + 60_000), tenantIds: [tidA], systemIds: [sys], deps: DEPS });
    const evTwice = await staleEvents(d.id);
    const notesAgain = (await notesOf(userO1)).filter((n) => String(n.body).includes(`/app/sys/${sys}/crm`));
    chk("C2.10-X5.1", "X5 crash after the announcement: a sweep that died between the event and the digest is repaired by the next run — the event is NOT emitted a second time (same key) while the missing digest row IS written, so nobody loses the message and nobody gets it twice",
      first.ok && evOnce.length === 1 && second.ok && evTwice.length === 1 && notesAgain.length === 1,
      "1 event · digest restored", `first=${first.ok ? j(first.v) : first.err} events=${evOnce.length}→${evTwice.length} digest=${notesAgain.length}${ABSENT}`);
  }
  {
    // X5: overlapping fanout sweeps send once
    SENT.length = 0;
    const dF = await mkDeal(crmN, pN, { ownerUserId: userO2, stageIdx: 0, idleDays: 1 });
    await call(notifyStaff, cN, { key: "lead.hot", userIds: [userO2], refType: "CrmDeal", refId: dF.id, vars: { count: 1 }, now: NIGHT }, { deps: DEPS });
    const res = await Promise.all([0, 1, 2].map(() => call(runFanout, { now: MORNING, tenantIds: [tidA], deps: DEPS })));
    const pushes = SENT.filter((s) => s.ch === "PUSH" && j(s.req).includes(dF.id)).length;
    chk("C2.10-X5.2", "X5 overlapping runs: three `runFanout` sweeps started together send the deferred message exactly ONCE (the `emailedAt` stamp is the claim — claimed with a conditional update, not by writing a final state first)",
      res.every((r) => r.ok) && pushes <= 1 && pushes === 1,
      "1 push", `ok=${res.filter((r) => r.ok).length}/3 pushes=${pushes}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X7 · X8 · X9
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X7 · X8 · X9 ──");
  {
    const tick = (await import(TICK_SPEC as string).catch(() => ({}))) as Any;
    const hourly = (await import(HOURLY_SPEC as string).catch(() => ({}))) as Any;
    const notesBefore = (await P.appNotification.count({ where: { tenantId: tidA } })) as number;
    const callRoute = async (mod: Any, headers: Record<string, string>) => {
      const r = await call(mod.GET, new Request("https://qc.invalid/api/cron/x", { headers }));
      if (!r.ok) return { status: -1, body: r.err };
      const res = r.v as Response;
      return { status: res.status, body: await res.text() };
    };
    const noSecret = await callRoute(tick, {});
    const wrongSecret = await callRoute(tick, { "x-cron-secret": `${TAG}-wrong-secret` });
    const wrongBearer = await callRoute(tick, { authorization: `Bearer ${TAG}-wrong-secret-2` });
    const hourlyNo = await callRoute(hourly, {});
    const notesAfter = (await P.appNotification.count({ where: { tenantId: tidA } })) as number;
    const identical = noSecret.status === 401 && wrongSecret.status === 401 && wrongBearer.status === 401 && noSecret.body === wrongSecret.body && wrongSecret.body === wrongBearer.body;
    const leaks = [noSecret, wrongSecret, wrongBearer].some((x) => x.body.includes(`${TAG}-wrong-secret`));
    chk("C2.10-X7.1", "the cron endpoints stay shut: `/api/cron/tick` and `/api/cron/hourly` answer 401 with BYTE-IDENTICAL bodies for no secret, a wrong X-Cron-Secret and a wrong Bearer (an attacker cannot tell which header/value was closer), the secret he sent is never echoed, and nothing ran (no notification row appeared)",
      identical && hourlyNo.status === 401 && !leaks && notesAfter === notesBefore,
      "401 identical · nothing ran", `tick=${noSecret.status}/${wrongSecret.status}/${wrongBearer.status} hourly=${hourlyNo.status} bodies=${identical} leak=${leaks} notes ${notesBefore}→${notesAfter}`, "MAJOR");
  }
  {
    const auth = (await import("@/lib/core/cron-auth" as string).catch(() => ({}))) as Any;
    const isAuth = fnOf(auth, "isCronAuthorized");
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = `${TAG}-right-secret`;
    const good = typeof isAuth === "function" ? isAuth(new Request("https://qc.invalid/x", { headers: { "x-cron-secret": `${TAG}-right-secret` } })) : false;
    const goodBearer = typeof isAuth === "function" ? isAuth(new Request("https://qc.invalid/x", { headers: { authorization: `Bearer ${TAG}-right-secret` } })) : false;
    const bad = typeof isAuth === "function" ? isAuth(new Request("https://qc.invalid/x", { headers: { "x-cron-secret": `${TAG}-right-secre` } })) : true;
    const none = typeof isAuth === "function" ? isAuth(new Request("https://qc.invalid/x")) : true;
    if (prev === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = prev;
    chk("C2.10-X7.2", "[positive control] the shared cron gate really works both ways — with the secret set, `isCronAuthorized` accepts the right value through X-Cron-Secret AND Bearer and refuses a value that differs by one character or is absent (constant-time compare, same helper for every endpoint; the oracle never calls an authorised cron route, which would run the whole platform's daily sweep on the shared QC database)",
      good === true && goodBearer === true && bad === false && none === false,
      "accept · accept · refuse · refuse", `right=${good} bearer=${goodBearer} nearMiss=${bad} none=${none}`);
  }
  {
    const rows = ((await P.appNotification.findMany({ where: { tenantId: tidA } })) as Any[]);
    const text = j(rows.map((n) => [n.title, n.body]));
    const hits = PII.filter((p) => text.includes(p));
    const shopWide = rows.filter((n) => !n.recipientUserId).length;
    chk("C2.10-X8.1", "no notification this run carries a customer name, phone or e-mail (ids + the deep link only) and none of them is a shop-wide announcement — every CRM staff notification is written per recipient (the G11/PDPA rule of AppNotification)",
      rows.length >= 1 && hits.length === 0 && shopWide === 0,
      "no PII · no shop-wide row", `rows=${rows.length} pii=${hits.slice(0, 3).join(",") || "-"} shopWide=${shopWide} sample=${cut(text, 140)}${ABSENT}`, "MAJOR");
  }
  {
    const pushText = j(SENT.filter((s) => s.ch === "PUSH").map((s) => s.req));
    const emailText = j(SENT.filter((s) => s.ch === "EMAIL").map((s) => s.req));
    const piiHits = PII.filter((p) => pushText.includes(p) || emailText.includes(p));
    const fat = SENT.filter((s) => s.ch === "PUSH").some((s) => j(s.req).length > 600);
    const realTransport = /expo\.host|exp\.host|api\.resend|smtp/i.test(read(NOTIF_FILE));
    chk("C2.10-X8.2", "the push/e-mail requests are minimal and id-only: no customer name/phone/e-mail in them, no oversized push payload (a push is a doorbell, not a document) and the notifier imports no real transport of its own — everything goes through the injected deps or the platform senders",
      SENT.length >= 1 && piiHits.length === 0 && !fat && !realTransport,
      "ids only · small · no transport import", `sent=${SENT.length} pii=${piiHits.slice(0, 2).join(",") || "-"} oversized=${fat} transportImport=${realTransport} sample=${cut(pushText, 140)}${ABSENT}`, "MAJOR");
  }
  {
    const evs = ((await P.outboxEvent.findMany({ where: { tenantId: tidA, type: { in: ["crm.deal.stale", "crm.activity.overdue"] } } })) as Any[]);
    const text = j(evs.map((e) => e.payload));
    const piiHits = PII.filter((p) => text.includes(p));
    const badKeys = evs.flatMap((e) => Object.keys((e.payload ?? {}) as Record<string, unknown>).filter((k) => /name|phone|email|title/i.test(k)));
    const LAB = (await import("@/lib/automation/labels" as string).catch(() => ({}))) as Any;
    const events = ((LAB.AUTOMATION_EVENTS ?? []) as Any[]).map((e) => String(e?.value));
    const declaredOnce = ["crm.deal.stale", "crm.activity.overdue"].every((t) => events.filter((x) => x === t).length === 1);
    const OBX2 = (await import("@/lib/outbox-consumers" as string).catch(() => ({}))) as Any;
    const hasCons = ["crm.deal.stale", "crm.activity.overdue"].every((t) => typeof (OBX2.consumers ?? {})[t] === "function");
    chk("C2.10-X8.3", "`crm.deal.stale` and `crm.activity.overdue` are ids-only (no name/phone/title key, no customer data) and are declared exactly once in AUTOMATION_EVENTS with a consumer each — C2.1 keeps them as cron triggers (cron:true + params), so the label must not duplicate the trigger entry",
      evs.length >= 1 && piiHits.length === 0 && badKeys.length === 0 && declaredOnce && hasCons,
      "ids only · 1 label · consumer", `events=${evs.length} pii=${piiHits.slice(0, 2).join(",") || "-"} keys=${badKeys.join(",") || "-"} declaredOnce=${declaredOnce} consumers=${hasCons}${ABSENT}`);
  }
  {
    const before = (await P.auditLog.count({ where: { tenantId: tidA, action: { startsWith: "crm.notify." } } })) as number;
    const t = await call(setTemplate, cN, owner, "tasks.today", { title: `งานวันนี้ ${TAG}`, channels: { PUSH: true } });
    const s = await call(setSettings, cN, owner, { quietHours: { enabled: true, from: "22:00", to: "06:00" }, digestHour: 9 });
    const p = await call(setMyPrefs, cN, o1, { notifications: { "deal.closed": { EMAIL: false } } });
    const rows = ((await P.auditLog.findMany({ where: { tenantId: tidA, action: { startsWith: "crm.notify." } } })) as Any[]);
    const raw = ((await P.appSystem.findFirst({ where: { id: crmN } })) as Any)?.settings?.crm ?? {};
    const text = j(rows.map((r) => [r.before, r.after]));
    chk("C2.10-X9.1", "every settings mutation is audited `crm.notify.*` (template edit · shop settings · a user's own prefs — at least 3 new rows) with no customer data in before/after · the shop values land in `settings.crm.notifications` through the single-`jsonb_set` writer so uiVersion/bridgesEnabled survive",
      t.ok && s.ok && p.ok && rows.length >= before + 3 && !PII.some((x) => text.includes(x)) && raw?.uiVersion === 2 && raw?.bridgesEnabled === true && !!raw?.notifications,
      "≥ 3 audit rows · siblings survive", `template=${t.ok ? "ok" : t.err} settings=${s.ok ? "ok" : s.err} prefs=${p.ok ? "ok" : p.err} audits ${before}→${rows.length} stored=${cut(j(raw?.notifications ?? null), 100)}${ABSENT}`);
  }
  {
    const bad = [
      ["unknown key", await call(setTemplate, cN, owner, `${TAG}-nope`, { channels: { PUSH: true } })],
      ["unknown channel", await call(setTemplate, cN, owner, "tasks.today", { channels: { LINE: true } })],
      ["bad quiet from", await call(setSettings, cN, owner, { quietHours: { enabled: true, from: "25:99", to: "06:00" } })],
      ["bad digest hour", await call(setSettings, cN, owner, { digestHour: 99 })],
    ] as [string, Res][];
    const accepted = bad.filter(([, r]) => !refusedAs(r, ["VALIDATION"])).map(([k, r]) => `${k}:${r.ok ? "ACCEPTED" : r.err}`);
    const view = await call(getSettings, cN, owner);
    chk("C2.10-X9.2", "validation refuses in Thai without blaming the user and writes nothing: an unknown template key · a channel outside IN_APP/PUSH/EMAIL (LINE is not a staff channel in this run) · a quiet-hour value that is not HH:MM · a digest hour outside 0–23 — and the stored settings still read back",
      accepted.length === 0 && view.ok,
      "4 refused", `accepted=${cut(accepted.join(" | "), 220) || "-"} read=${view.ok ? "ok" : view.err}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // U — uiVersion 1
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── U · uiVersion 1 ──");
  {
    const d = await mkDeal(crmV, pV, { ownerUserId: userO1, stageIdx: 0, idleDays: 30 });
    await setCrm(crmV, { uiVersion: 1 });
    SENT.length = 0;
    const r = await call(markStale, { now: NOW, tenantIds: [tidA], systemIds: [crmV], deps: DEPS });
    const ev = await staleEvents(d.id);
    const notes = (await notesOf(userO1)).filter((n) => String(n.body).includes(`/app/sys/${crmV}/crm`));
    chk("C2.10-U.1", "uiVersion 1 (R-E.14): a 30-day-old deal of a v1 system is NOT marked stale — no `crm.deal.stale` event, no digest row, nothing sent (the rows are kept untouched, the shop simply does not have v2 yet)",
      r.ok && ev.length === 0 && notes.length === 0 && SENT.length === 0,
      "0 events · 0 rows", `sweep=${r.ok ? j(r.v) : r.err} events=${ev.length} digests=${notes.length} sent=${SENT.length}${ABSENT}`);
    const n = await call(notifyStaff, cV, { key: "lead.hot", userIds: [userO1], refType: "CrmDeal", refId: d.id, vars: { count: 1 }, now: NOW }, { deps: DEPS });
    const rows = (await notesOf(userO1)).filter((x) => String(x.body).includes(d.id));
    const refusedMgmt: string[] = [];
    for (const [k, res] of [["getSettings", await call(getSettings, cV, owner)], ["setTemplate", await call(setTemplate, cV, owner, "lead.hot", { channels: { PUSH: false } })], ["setMyPrefs", await call(setMyPrefs, cV, o1, { notifications: { "lead.hot": { PUSH: false } } })]] as [string, Res][]) {
      if (!refusedAs(res, ["CRM_V2_DISABLED", "FORBIDDEN", "NOT_FOUND"])) refusedMgmt.push(`${k}:${res.ok ? "ACCEPTED" : res.err}`);
    }
    chk("C2.10-U.2", "on a v1 system nothing notifies and nothing can be configured: notifyStaff writes no row and sends nothing (or refuses in Thai), and getNotificationSettings · setTemplate · setMyPrefs are all refused with CRM_V2_DISABLED/FORBIDDEN — no row is written either way",
      (n.ok ? rows.length === 0 && SENT.length === 0 : refusedThai(n)) && refusedMgmt.length === 0,
      "silent · 3 refused", `notify=${n.ok ? j(n.v) : n.err} rows=${rows.length} sent=${SENT.length} mgmt=${refusedMgmt.join(" | ") || "-"}${ABSENT}`);
    await setCrm(crmV, { uiVersion: 2, bridgesEnabled: true });
    SENT.length = 0;
    const back = await call(markStale, { now: NOW, tenantIds: [tidA], systemIds: [crmV], deps: DEPS });
    const evBack = await staleEvents(d.id);
    const notesBack = (await notesOf(userO1)).filter((x) => String(x.body).includes(`/app/sys/${crmV}/crm`));
    chk("C2.10-U.3", "back at uiVersion 2 the very same deal is marked stale on the next sweep (one event, one digest) — nothing was lost while the shop was on v1 (R-E.14: rows kept, work resumes)",
      back.ok && evBack.length === 1 && notesBack.length === 1,
      "1 event · 1 digest", `sweep=${back.ok ? j(back.v) : back.err} events=${evBack.length} digests=${notesBack.length}${ABSENT}`);
  }
} catch (e) {
  chk("C2.10-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — restore the shared dispatcher state rows, then sweep the throwaway tenants
  // ═════════════════════════════════════════════════════════════════════════════
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* order/FK — retried next pass */ } };
  if (OPS_KEYS.length > 0) {
    await del(() => P.opsAlertState.deleteMany({ where: { source: { in: OPS_KEYS } } }));
    for (const s of opsSnap) await del(() => P.opsAlertState.create({ data: { source: s.source, lastAlertAt: s.lastAlertAt } }));
  }
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
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
        const n = Number(r?.[0]?.n ?? 0);
        if (n > 0) left.push(`${t}=${n}`);
      }
      const tenants = await P.tenant.count({ where: { id: { in: ids } } });
      const users = USERS.length ? await P.user.count({ where: { id: { in: ids.length ? USERS : [] } } }) : 0;
      const opsLeft = (await P.opsAlertState.count({ where: { source: { in: OPS_KEYS } } }).catch(() => 0)) as number;
      chk("C2.10-CLEAN", "the oracle gives the QC database back exactly as found — every throwaway tenant, its deals/notifications/outbox rows and the throwaway users are gone, and the shared minute-job state rows of the CRM jobs are back to their snapshot",
        left.length === 0 && tenants === 0 && users === 0 && opsLeft === opsSnap.length, "0 rows · state restored", `${left.join(" · ") || "-"} · tenants=${tenants} users=${users} opsRows=${opsLeft}/${opsSnap.length}`, "MAJOR");
    } catch (e) {
      chk("C2.10-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C2.10: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
