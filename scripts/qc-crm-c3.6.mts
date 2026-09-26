// QC — CRM v2 WO C3.6: integrations page (status of the 24 systems of `src/lib/systems.ts` · last CRM-relevant outbox event · job health
//      from the C0.5 minute-job registry · `settings.crm.targets` pickers read by the bridges through ONE resolver) · PAGES widgets
//      ("ดีลของฉัน" · "งานวันนี้" for staff · "portal" entry for customers) · `MemberSavedView.teamId` honoured in MEMBER lists
// Oracle writer · the C3.6 builder must NOT touch this file · QC database only (loaded by scripts/acc-v2-env.mts — QC3 via scripts/qc3.sh)
// Run: bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c3.6.mts
//      `--force-run` = run every check while `src/lib/modules/crm/integrations.ts` is absent — C3.6 checks red for the right reason
//                      ("function missing" / legacy behaviour), the answer-key + scanner controls and CLEAN green
// requires: crm-seed   (house style — this oracle reads NO seeded row: everything lives in throwaway tenants `qc-c36-<rand>-*`, so a
//                       controller reseed running at the same moment can neither break it nor be broken by it)
//
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE (not re-implemented here): qc-pages (RG-1/RG-2: 3 new registry keys, no duplicate) ·
//   qc-member-m1.5 (member saved views: PRIVATE/TEAM rules, DTO) · qc-systems · qc-systems-manage · qc-crm-c3.2 (X1.6 pins the member
//   SavedViewDto keys — see addendum decision D-6) · qc-crm-c1.8 / c2.7 / c2.9 (bridges now read targets through the resolver) ·
//   qc-crm-c1.4 (convert → member system picker) · qc-crm-c1.5 (deal lines ↔ inventory) · qc-crm-c1.6 (deal ↔ kanban cards) ·
//   qc-crm-c0.5 (minute-job registry untouched) · qc-crm-c1.11 (uiVersion) · qc-member-m1.9 (30/15/10/5).
//
// SOURCES: crm-brief-C3.6-C3.9.md "C3.6" (+ its "Addendum (oracle author)") · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-A HR link
//   "ทีมขาย" → /app/settings/teams is C3.6's · R-D default ownership · R-D "C3.7 excludes /settings/integrations" ⇒ C3.6 makes its own page
//   responsive · R-E.14 uiVersion 1) · CRM-RUN §2 "C3.6" (status 24 systems enabled/lastEventAt 4 · targets set + used by bridges 4 ·
//   PAGES widgets 3 · MemberSavedView.teamId 2 · visual 3 = 16) · MASTER-PLAN §4 (X1 X3 X8 X9) · blueprint §3.16 (mockup 17) §4.5
//   (`targets` shape) §9 (24-system table, "(4) targets") · src/lib/systems.ts (SYSTEM_DEFS · FIXED_PAGE_SYSTEMS) ·
//   src/lib/platform/minute-jobs.ts (getMinuteJobStatus · OpsAlertState keys `minute-job:{run,ok}:<name>` · OpsEvent "minute-job") ·
//   src/lib/pages/{registry,service}.ts · src/lib/modules/member/{views,list}.ts · src/lib/member-bridges.ts#onCrmDealWon ·
//   crm/{contacts#convertOptions, consents#memberSystemOf, deals#inventoryItems, activities#dealKanbanCards, companies→accountSystemForCrm,
//   automation SEND_LINE} = the target-picking sites of today.
//
// ══════════════════════════════════ CONTRACT (oracle-proposed — the brief addendum is the controller's final word) ══════════════════════
//   ctx = { tenantId, systemId, actorUserId } · actor = MemberActor · the CRM system is re-resolved in the tenant (type CRM) else NOT_FOUND ·
//   uiVersion ≠ 2 ⇒ CrmV2DisabledError · errors carry `.code` ∈ VALIDATION | NOT_FOUND | FORBIDDEN · Thai messages that never blame the user.
//   A. `src/lib/modules/crm/integrations-shared.ts` (pure): CRM_TARGET_KINDS = ["member","account","kanban","chat","inventory"] ·
//      TARGET_TYPE = { member:"MEMBER", account:"ACCOUNT", kanban:"KANBAN", chat:"CHAT", inventory:"INVENTORY" } ·
//      INTEGRATION_EVENTS: Record<SystemCode (all 24 of SYSTEM_DEFS), readonly string[]> — the CRM-relevant outbox types of §9 for that
//      system (in + out); every listed type is a key of the outbox consumer map (no invented names) and each list ⊇ REQUIRED_EVENTS below.
//   B. `src/lib/modules/crm/integrations.ts`:
//      integrationStatus(ctx, actor, { now? }) → { systems: Row[24] in SYSTEM_DEFS order, jobs: JobRow[] }  (key `crm.settings.manage`)
//        Row = { code, no, label, kind, enabled, systemIds: string[], lastEventAt: ISO|null, lastEventType: string|null, events7d: number }
//        enabled: FIXED_PAGE system (KB · PAGES) ⇒ true · kind "business" ⇒ a BusinessUnit of that type with status ≠ ARCHIVED ·
//          kind "feature" ⇒ an AppSystem of that type with active = true · systemIds = those unit / system ids
//        lastEventAt/events7d = max(createdAt) / count(createdAt ≥ now − 7 d) over the tenant's OutboxEvent rows whose type ∈
//          INTEGRATION_EVENTS[code] (any status — a processed event is still the "last event")
//        JobRow = getMinuteJobStatus() of the C0.5 registry (name · everyMinutes · lastRunAt · lastOkAt · lastError) — every registered job
//      getTargets(ctx, actor) → { memberSystemId, accountSystemId, kanbanSystemId, chatSystemId, inventorySystemId } (stored · null default)
//      setTargets(ctx, actor, patch: Partial<that>) → getTargets() — key `crm.settings.manage` · every non-null id must be an ACTIVE
//        AppSystem of the kind's type IN THE SAME TENANT else VALIDATION (nothing written) · null clears · ONE `jsonb_set` statement that
//        merges only the patched keys into `settings.crm.targets` (other `settings.crm` keys and other targets survive — X3) · one
//        AuditLog row per effective change: action `crm.integrations.targets`, targetType "AppSystem", targetId = CRM system, before/after
//        = the 5 ids (X9)
//      listTargetCandidates(tenantId, kind) → { id, name, active }[] — THE ONLY raw lookup of target systems (active, createdAt asc)
//      resolveCrmTargets(tenantId, crmSystemId) → { member, account, kanban, chat, inventory } (string | null) — per kind:
//        (1) the stored target when it is an ACTIVE system of that type in the tenant (a stale/foreign/wrong-type id is ignored, never
//        returned) · (2) the link: MEMBER/KANBAN/CHAT/INVENTORY = an active system of that type sharing a BusinessUnit (AppSystemUnit)
//        with the CRM system (oldest first) · ACCOUNT = the AccountSystemLink book of accountSystemForCrm · (3) the tenant's ONLY active
//        system of that type · (4) null (callers keep today's legacy behaviour: read paths may scan every system of the kind, write
//        paths do nothing)
//   C. `src/lib/modules/crm/widgets.ts` (+ `src/lib/pages/registry.ts` keys `S:CRM:my-deals` · `S:CRM:today-tasks` · `S:CRM:portal`
//      with `data: "crm.myDeals" | "crm.todayTasks" | "crm.portalEntry"`; `pageForRender` hides the three when the page's CRM system is
//      not uiVersion 2):
//      myDeals(ctx, actor, { limit? ≤ 20 }) → { items: { id, title, valueSatang, stageName, stalled, href }[], total } = OPEN, not
//        archived deals owned by the actor inside dealWhere(actor) of THIS system (key `crm.deal.read`)
//      todayTasks(ctx, actor, { now?, limit? }) → { items: { id, title, type, dueAt, done, href }[], counts: { today, overdue, done } } —
//        activities owned by the actor inside activityWhere, Thai day of `now`: today = open & dueAt in the day · overdue = open & dueAt
//        before the day · done = doneAt in the day · items = the union (key `crm.activity.read`)
//      portalEntry(ctx, { contactId?, partyId? }) → { href } | null — href starts with "/b/" (R-C.5 base) and carries no PII · null when
//        the contact has no live CrmPortalAccess (revokedAt null) in THIS system or `settings.crm.portal.enabled` is not true
//   D. `src/lib/modules/member/views.ts` + `list.ts`: createSavedView input `teamId?` (TEAM only · MANAGER+ as today · team of the tenant
//      else MemberInputError) · listSavedViews = own PRIVATE + TEAM(teamId null = whole shop, legacy) + TEAM(teamId ∈ my teams, member or
//      lead) + own TEAM views · listMembers({ viewId }) of a view the actor may not list ⇒ MemberNotFoundError · SavedViewDto keys unchanged
//   E. facade block `// CRM C3.6 ▸ export * as integrations … export * as widgets … ◂` · page `/crm/settings/integrations` (mockup 17) ·
//      nav entry (wo C3.6 · perm crm.settings.manage) · inventory rows · `/p/[slug]` renders the data widgets · member views team picker ·
//      HR link "ทีมขาย" → /app/settings/teams (R-A) · NO migration (MemberSavedView.teamId came with crm_v2_a).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// CHECK INVENTORY: 29 = S0 2 · S1 4 · S2 4 · S3 3 · S4 2 · S5 3 (S1–S5 = the 16 of CRM-RUN §2) · K 2 (answer-key + scanner controls) ·
//   X1 4 · X3 1 · X8 1 · X9 1 · U 1 · CLEAN 1 (C3.6-FATAL is added only when something throws)
//   n/a: X2 (the integrations REST op / AI tool is C3.8) · X4 (no new consumer) · X5 (no job claims rows) · X6 (targets are ids validated
//   against the tenant; widgets take no free input) · X7 (no public endpoint: /p/ is behind the staff session, the portal widget is a link)
//   · X10 (no file / secret).
// HOUSE RULES: SKIP guard before any DB connection · throwaway tenants swept in `finally` (every table with tenantId, 4 passes) + users +
//   the synthetic minute-job rows (OpsAlertState `minute-job:*:qc-c36-*` · OpsEvent message `qc-c36-*`) · fixture outbox events are
//   written with status DONE (no drainer of another session ever picks them) · NO drainOutbox · answer keys are raw SQL / fixture facts,
//   never the product's helpers · parallel writes run on separate pool connections (rounds of ≥ 10) · last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const I_FILE = "src/lib/modules/crm/integrations.ts";
const IS_FILE = "src/lib/modules/crm/integrations-shared.ts";
const W_FILE = "src/lib/modules/crm/widgets.ts";
const I_SPEC = "@/lib/modules/crm/integrations";
const IS_SPEC = "@/lib/modules/crm/integrations-shared";
const W_SPEC = "@/lib/modules/crm/widgets";
const INDEX_FILE = "src/lib/modules/crm/index.ts";
const REGISTRY_FILE = "src/lib/pages/registry.ts";
const INT_PAGE_DIR = "src/app/app/sys/[id]/crm/settings/integrations";
const INT_PAGE = `${INT_PAGE_DIR}/page.tsx`;
const INT_COMP_DIR = "src/components/crm/integrations";
const P_PAGE = "src/app/p/[slug]/page.tsx";
const MEMBER_VIEWS_MENU = "src/components/member/MembersSavedViewsMenu.tsx";
const NAV_FILE = "src/lib/modules/crm/nav.ts";
const INVENTORY = "scripts/crm-ui-inventory.json";
const MIG_DIR = "prisma/migrations";
const C30_MIG = "20261102000000_crm_v2_c";
const MINUTE_JOBS_FILE = "src/lib/platform/minute-jobs.ts";
const MEMBER_BRIDGES = "src/lib/member-bridges.ts";
const BASELINE = "3accbb35"; // C3.0 + C3.1 + C3.2 accepted — the tree before C3.6 (scanner positive control)
const WIDGET_KEYS = ["S:CRM:my-deals", "S:CRM:today-tasks", "S:CRM:portal"] as const;
const KINDS = ["member", "account", "kanban", "chat", "inventory"] as const;
const TYPE_OF: Record<string, string> = { member: "MEMBER", account: "ACCOUNT", kanban: "KANBAN", chat: "CHAT", inventory: "INVENTORY" };
const KEY_OF: Record<string, string> = { member: "memberSystemId", account: "accountSystemId", kanban: "kanbanSystemId", chat: "chatSystemId", inventory: "inventorySystemId" };
/** §9 minimum per system (in + out) — every name exists in the consumer map today; the product list may add more, never fewer */
const REQUIRED_EVENTS: Record<string, string[]> = {
  HOTEL: ["hotel.checked_out"], SHOP: ["shop.order.paid"], BOOKING: ["booking.completed", "booking.no_show"], QUEUE: ["queue.served"],
  TICKET: ["ticket.order.paid"], MEMBER: ["member.created", "member.updated", "member.merged", "member.tier.changed"],
  REWARD: ["reward.redeemed"], COUPON: ["voucher.used"], POINT: ["point.earned"], CHAT: ["chat.message.received", "chat.conversation.status"],
  ACCOUNT: ["account.invoice.paid", "account.payment.recorded", "account.quotation.responded", "account.document.issued", "account.document.voided"],
  KANBAN: ["kanban.card.completed"], POS: ["pos.sale.paid", "pos.sale.voided"], HR: ["hr.leave.submitted"], MARKETING: ["campaign.sent"],
  RENTAL: ["rental.returned"], SCHOOL: ["school.enrolled"], CLINIC: ["clinic.visit.done"], PAGES: ["forms.submission.received"],
};

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
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guard — integrations.ts absent ⇒ SKIPPED, no DB connection.
// ═══════════════════════════════════════════════════════════════════════════════════
const BUILT = read(I_FILE).length > 0;
if (!FORCE && !BUILT) {
  console.log(`⚠️  SKIPPED — WO C3.6 not built yet (${I_FILE} absent) (run with --force-run to exercise the fixtures, the answer keys, the scanner control and the cleanup)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c36-${rand}`;
const ABSENT = BUILT ? "" : " · [integrations.ts ABSENT]";

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
const isVal = (r: Res) => refused(r) && (r.code === "VALIDATION" || /Input|Validation/i.test(r.name));
const rs = (r: Res) => (r.ok ? `ok ${cut(j(r.v), 160)}` : r.err);
const fnOf = (mod: Any, ...names: string[]): Any => {
  for (const n of names) {
    let v: Any = mod;
    for (const p of n.split(".")) v = v?.[p];
    if (typeof v === "function") return v;
  }
  return undefined;
};
const idsOf = (v: Any) => ((v?.items ?? v?.rows ?? v ?? []) as Any[]).map((r) => String(r?.id)).sort();
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const isoOf = (v: unknown): string | null => (v === null || v === undefined ? null : new Date(v as string).toISOString());

// ─────────────────────────── Thai time (independent of the product) ───────────────────────────
const T = (iso: string) => new Date(iso);
const NOW_TASKS = T("2026-09-15T05:00:00Z"); // 12:00 Thai · the Thai day = [2026-09-14T17:00Z, 2026-09-15T17:00Z)
const NOWR = new Date(Math.floor(Date.now() / 1000) * 1000); // real clock (outbox events are timestamped against it)
const ago = (ms: number) => new Date(NOWR.getTime() - ms);
const H = 3_600_000;
const D = 24 * H;

console.log(`\n═══ QC CRM v2 · C3.6 — integrations · targets resolver · PAGES widgets · member team views ═══`);
console.log(`[env] DB ${host} · tag ${TAG}${FORCE && !BUILT ? " · --force-run with C3.6 ABSENT (C3.6 checks expected red; controls + CLEAN green)" : ""}\n`);

const TENANTS: string[] = [];
const USERS: string[] = [];
const PII: string[] = [];
const JOB_NAMES: string[] = [];
const pii = <S extends string>(s: S): S => { PII.push(s); return s; };
let seq = 0;
const nx = () => `${++seq}`;
let phoneSeq = 0;
const phoneOf = (): string => pii(`08${String((Math.floor(Math.random() * 9_000_000) + 1_000_000) * 10 + (phoneSeq++ % 10)).padStart(8, "0").slice(-8)}`);

try {
  // ═════════════════════════════════════════════════════════════════════════════
  // modules (dynamic — may not exist yet)
  // ═════════════════════════════════════════════════════════════════════════════
  const I = (await import(I_SPEC as string).catch(() => ({}))) as Any;
  const IS = (await import(IS_SPEC as string).catch(() => ({}))) as Any;
  const W = (await import(W_SPEC as string).catch(() => ({}))) as Any;
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => ({}))) as Any;
  const SYS = (await import("@/lib/systems" as string)) as Any;
  const REG = (await import("@/lib/pages/registry" as string).catch(() => ({}))) as Any;
  const PGS = (await import("@/lib/pages/service" as string).catch((e: unknown) => ({ __err: String((e as Error)?.message ?? e) }))) as Any;
  const MJ = (await import("@/lib/platform/minute-jobs" as string)) as Any;
  const MB = (await import("@/lib/member-bridges" as string).catch(() => ({}))) as Any;
  const MV = (await import("@/lib/modules/member/views" as string).catch(() => ({}))) as Any;
  const ML = (await import("@/lib/modules/member/list" as string).catch(() => ({}))) as Any;
  const DL = (await import("@/lib/modules/crm/deals" as string).catch(() => ({}))) as Any;
  const CS = (await import("@/lib/modules/crm/settings" as string).catch(() => ({}))) as Any;
  const OBX = (await import("@/lib/outbox-consumers" as string).catch(() => ({}))) as Any;
  const CONS: Any = OBX.consumers ?? {};
  const statusF = fnOf(I, "integrationStatus");
  const getTargetsF = fnOf(I, "getTargets");
  const setTargetsF = fnOf(I, "setTargets");
  const resolveF = fnOf(I, "resolveCrmTargets");
  const candF = fnOf(I, "listTargetCandidates");
  const myDealsF = fnOf(W, "myDeals");
  const todayF = fnOf(W, "todayTasks");
  const portalF = fnOf(W, "portalEntry");
  const DEFS = (SYS.SYSTEM_DEFS ?? []) as Any[];
  const FIXED = (SYS.FIXED_PAGE_SYSTEMS ?? {}) as Record<string, string>;
  const consumerKeys = new Set(Object.keys(CONS));

  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — structure
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S0 · structure ──");
  {
    const isSrc = read(IS_FILE);
    const impure = /from\s+["'](@prisma\/client|@\/lib\/core\/db|next\/[^"']+|server-only|\.\/db|\.\/integrations)["']/.test(isSrc);
    const missing = [["integrationStatus", statusF], ["getTargets", getTargetsF], ["setTargets", setTargetsF], ["resolveCrmTargets", resolveF], ["listTargetCandidates", candF]]
      .filter(([, f]) => typeof f !== "function").map(([x]) => x);
    const IE = (IS.INTEGRATION_EVENTS ?? {}) as Record<string, string[]>;
    const codes = DEFS.map((d) => String(d.code));
    const keysOk = codes.length === 24 && codes.every((c) => Array.isArray(IE[c])) && Object.keys(IE).length === 24;
    const invented = Object.values(IE).flat().filter((t) => !consumerKeys.has(String(t)));
    const short = Object.entries(REQUIRED_EVENTS).filter(([c, need]) => !need.every((t) => (IE[c] ?? []).includes(t))).map(([c]) => c);
    chk("C3.6-S0.1", "integrations.ts exports integrationStatus · getTargets · setTargets · resolveCrmTargets · listTargetCandidates and integrations-shared.ts is pure with CRM_TARGET_KINDS = [member, account, kanban, chat, inventory] and INTEGRATION_EVENTS keyed by the 24 SYSTEM_DEFS codes — every listed type is a key of the outbox consumer map (no invented event) and each list ⊇ the §9 minimum",
      BUILT && isSrc.length > 0 && !impure && missing.length === 0 && j(IS.CRM_TARGET_KINDS) === j(KINDS) && keysOk && invented.length === 0 && short.length === 0,
      "5 fns · pure · 24 keys · real events", `built=${BUILT} shared=${isSrc.length > 0} impure=${impure} missing=${missing.join(",") || "-"} kinds=${j(IS.CRM_TARGET_KINDS)} keys=${keysOk} invented=${invented.join(",") || "-"} short=${short.join(",") || "-"}${ABSENT}`);
  }
  {
    const defs = ((REG.WIDGET_DEFS ?? []) as Any[]);
    const w = WIDGET_KEYS.map((k) => defs.find((d) => d?.key === k));
    const regOk = w.every((d) => !!d && d.type === "CRM" && typeof d.data === "string" && d.data.startsWith("crm."));
    const idx = read(INDEX_FILE);
    const block = /CRM C3\.6 ▸[\s\S]*?◂/.exec(idx)?.[0] ?? "";
    const facadeOk = /export\s+\*\s+as\s+integrations\s+from\s+["']\.\/integrations["']/.test(block) && /export\s+\*\s+as\s+widgets\s+from\s+["']\.\/widgets["']/.test(block);
    const migs = existsSync(MIG_DIR) ? readdirSync(MIG_DIR).filter((d) => /crm/i.test(d) && d > C30_MIG) : [];
    chk("C3.6-S0.2", "widgets.ts exports myDeals · todayTasks · portalEntry · the PAGES registry carries S:CRM:my-deals · S:CRM:today-tasks · S:CRM:portal (type CRM, `data` = crm.*) · facade block `// CRM C3.6 ▸` exports the `integrations` and `widgets` namespaces (reachable at runtime) · NO migration after crm_v2_c (MemberSavedView.teamId came with crm_v2_a)",
      typeof myDealsF === "function" && typeof todayF === "function" && typeof portalF === "function" && regOk && facadeOk && typeof CRM?.integrations?.resolveCrmTargets === "function" && typeof CRM?.widgets?.myDeals === "function" && migs.length === 0,
      "3 fns · 3 keys · facade · no migration", `fns=${typeof myDealsF}/${typeof todayF}/${typeof portalF} registry=${w.map((d) => (d ? `${d.key}:${d.data ?? "-"}` : "∅")).join(",")} facade=${facadeOk} runtime=${typeof CRM?.integrations?.resolveCrmTargets}/${typeof CRM?.widgets?.myDeals} newMigrations=${migs.join(",") || "-"}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — throwaway tenants: A (everything) · B (foreign) · M (member bridge) · I (inventory lines) · V (uiVersion 1 page)
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
  const crmOf = async (sysId: string) => ((await P.appSystem.findFirst({ where: { id: sysId }, select: { settings: true } }))?.settings?.crm ?? {}) as Any;
  const SALES = { "crm.contact.read": true, "crm.company.read": true, "crm.deal.read": true, "crm.activity.read": true, "crm.report.view": true, "member.customer.read": true };
  const actor = (userId: string, role: string, permissions: Record<string, unknown> = {}) => ({ userId, role, unitAccess: role === "OWNER" ? [] as string[] : ["*"], permissions });
  const ctx = (tid: string, sys: string, uid: string | null) => ({ tenantId: tid, systemId: sys, actorUserId: uid });

  const uO = await mkUser("");
  const uM = await mkUser("-mgr");
  const uTH = await mkUser("-thana");
  const uPK = await mkUser("-pook");
  const uNK = await mkUser("-nok");
  const uKT = await mkUser("-kata");
  const tidA = await mkTenant("a");
  await member(tidA, uO, "OWNER");
  await member(tidA, uM, "MANAGER");
  for (const u of [uTH, uPK, uNK, uKT]) await member(tidA, u, "STAFF", SALES);
  const tidB = await mkTenant("b");
  await member(tidB, uO, "OWNER");
  await member(tidB, uTH, "STAFF", SALES);
  const tidM = await mkTenant("m");
  await member(tidM, uO, "OWNER");
  const tidI = await mkTenant("i");
  await member(tidI, uO, "OWNER");
  const tidV = await mkTenant("v");
  await member(tidV, uO, "OWNER");
  const aO = actor(uO, "OWNER");
  const aM = actor(uM, "MANAGER");
  const aTH = actor(uTH, "STAFF", SALES);
  const aNK = actor(uNK, "STAFF", SALES);
  const aKT = actor(uKT, "STAFF", SALES);

  // systems of A (created in this order ⇒ createdAt asc = the "oldest first" of the resolver)
  const crmA = await mk(tidA, "CRM", "CRM");
  const memA1 = await mk(tidA, "MEMBER", "สมาชิก 1");
  const memA2 = await mk(tidA, "MEMBER", "สมาชิก 2");
  const kanA1 = await mk(tidA, "KANBAN", "งาน 1");
  const kanA2 = await mk(tidA, "KANBAN", "งาน 2");
  const chatA = await mk(tidA, "CHAT", "แชท");
  const invA1 = await mk(tidA, "INVENTORY", "สินค้า 1");
  const invA2 = await mk(tidA, "INVENTORY", "สินค้า 2");
  const accA = await mk(tidA, "ACCOUNT", "บัญชี");
  const posA = await mk(tidA, "POS", "หน้าร้าน");
  const hrA = await mk(tidA, "HR", "พนักงาน");
  await P.appSystem.update({ where: { id: hrA }, data: { active: false } }); // HR exists but switched off ⇒ disabled
  const crmS = await mk(tidA, "CRM", "CRM สอง"); // cross-system + raw foreign targets
  const crmV = await mk(tidA, "CRM", "CRM v1");
  for (const s of [crmA, crmS]) await setCrm(s, { uiVersion: 2, bridgesEnabled: true });
  await setCrm(crmV, { uiVersion: 1, bridgesEnabled: true });
  await setCrm(crmA, { scoring: { probe: TAG }, portal: { enabled: true } });
  const unitH = (await P.businessUnit.create({ data: { tenantId: tidA, type: "HOTEL", name: `โรงแรม ${TAG}`, slug: `${TAG}-hotel` } })).id as string;
  const unitC = (await P.businessUnit.create({ data: { tenantId: tidA, type: "CLINIC", name: `คลินิก ${TAG}`, slug: `${TAG}-clinic`, status: "ARCHIVED" } })).id as string;
  const memB = await mk(tidB, "MEMBER", "สมาชิก B");
  const kanB = await mk(tidB, "KANBAN", "งาน B");
  const crmB = await mk(tidB, "CRM", "CRM B");
  await setCrm(crmB, { uiVersion: 2, bridgesEnabled: true });

  // teams of A: P = lead manager + thana + pook · K = lead nok + kata
  const mkTeam = async (tid: string, name: string, lead: string | null, members: string[]) => {
    const t = await P.team.create({ data: { tenantId: tid, name: `${name} ${TAG}`, leadUserId: lead } });
    if (lead) await P.teamMember.create({ data: { tenantId: tid, teamId: t.id, userId: lead, role: "LEAD" } });
    for (const u of members) await P.teamMember.create({ data: { tenantId: tid, teamId: t.id, userId: u, role: "MEMBER" } });
    return t.id as string;
  };
  const teamP = await mkTeam(tidA, "ทีมขาย — ภูเก็ต", uM, [uTH, uPK]);
  const teamK = await mkTeam(tidA, "ทีมขาย — กระบี่", uNK, [uKT]);
  const teamB = await mkTeam(tidB, "ทีมต่างร้าน", null, []);

  // pipelines + deals (widgets)
  const mkPipe = async (tid: string, sys: string) => {
    const p = (await P.crmPipeline.create({
      data: { tenantId: tid, systemId: sys, name: `ขาย ${TAG}-${nx()}`, stages: { create: [["ผู้สนใจ", "OPEN", 10], ["เสนอราคา", "OPEN", 50], ["ชนะ", "WON", 100], ["แพ้", "LOST", 0]].map(([name, kind, probability], i) => ({ tenantId: tid, systemId: sys, sortOrder: i, name, kind, probability })) } },
      include: { stages: true },
    })) as Any;
    const st = (n: string) => (p.stages as Any[]).find((s) => s.name === n).id as string;
    return { id: p.id as string, L: st("ผู้สนใจ"), PR: st("เสนอราคา"), WON: st("ชนะ"), LOST: st("แพ้") };
  };
  const mkContact = async (tid: string, sys: string, owner: string | null, team: string | null, opts: { phone?: boolean } = {}) => {
    const name = pii(`ลูกค้า ${TAG}-${nx()}`);
    const party = await P.party.create({ data: { tenantId: tid, name, kind: "PERSON" } });
    const c = await P.crmContact.create({ data: { tenantId: tid, systemId: sys, name, firstName: name, phone: opts.phone === false ? null : phoneOf(), email: pii(`${TAG}-c${nx()}@qc.invalid`), partyId: party.id, ownerUserId: owner, teamId: team } });
    return c.id as string;
  };
  const mkDeal = async (tid: string, sys: string, pipe: Any, o: { owner: string | null; team: string | null; stage: string; kind: string; stalled?: boolean; archived?: boolean; value?: number; contactId?: string }) => {
    const contactId = o.contactId ?? (await mkContact(tid, sys, o.owner, o.team));
    const d = await P.crmDeal.create({
      data: { tenantId: tid, systemId: sys, contactId, pipelineId: pipe.id, stageId: o.stage, title: pii(`ดีล ${TAG}-${nx()}`), valueSatang: o.value ?? 1_000_000, kind: o.kind, ownerUserId: o.owner, teamId: o.team, stageEnteredAt: T("2026-09-01T03:00:00Z"),
        closedAt: o.kind === "OPEN" ? null : T("2026-09-02T03:00:00Z"), ...(o.stalled ? { stalledAt: ago(10 * D) } : {}), ...(o.archived ? { archivedAt: ago(2 * D) } : {}) },
    });
    return { id: d.id as string, contactId };
  };
  const pA = await mkPipe(tidA, crmA);
  const pS = await mkPipe(tidA, crmS);
  const dTH1 = await mkDeal(tidA, crmA, pA, { owner: uTH, team: teamP, stage: pA.L, kind: "OPEN", stalled: true });
  const dTH2 = await mkDeal(tidA, crmA, pA, { owner: uTH, team: teamP, stage: pA.PR, kind: "OPEN" });
  const dTHw = await mkDeal(tidA, crmA, pA, { owner: uTH, team: teamP, stage: pA.WON, kind: "WON" });
  const dTHa = await mkDeal(tidA, crmA, pA, { owner: uTH, team: teamP, stage: pA.L, kind: "OPEN", archived: true });
  const dNK = await mkDeal(tidA, crmA, pA, { owner: uNK, team: teamK, stage: pA.L, kind: "OPEN" }); // Krabi deal
  const dK0 = await mkDeal(tidA, crmA, pA, { owner: null, team: teamK, stage: pA.PR, kind: "OPEN" }); // Krabi deal, no owner
  const dO1 = await mkDeal(tidA, crmA, pA, { owner: uO, team: null, stage: pA.L, kind: "OPEN" });
  const dTHs = await mkDeal(tidA, crmS, pS, { owner: uTH, team: teamP, stage: pS.L, kind: "OPEN" }); // thana, other CRM system
  // activities (Thai day of NOW_TASKS = 2026-09-15)
  const mkAct = async (sys: string, owner: string, o: { due?: string | null; done?: string | null; deal?: { id: string; contactId: string } }) => {
    const deal = o.deal ?? dTH1;
    const a = await P.crmActivity.create({ data: { tenantId: tidA, systemId: sys, type: "TASK", title: `งาน ${TAG}-${nx()}`, ownerUserId: owner, dueAt: o.due ? T(o.due) : null, doneAt: o.done ? T(o.done) : null, dealId: deal.id, contactId: deal.contactId } });
    return a.id as string;
  };
  const aT1 = await mkAct(crmA, uTH, { due: "2026-09-15T02:00:00Z" }); // 09:00 Thai today
  const aT2 = await mkAct(crmA, uTH, { due: "2026-09-15T16:30:00Z" }); // 23:30 Thai today
  const aT3 = await mkAct(crmA, uTH, { due: "2026-09-14T03:00:00Z" }); // yesterday ⇒ overdue
  const aT4 = await mkAct(crmA, uTH, { due: "2026-09-15T00:00:00Z", done: "2026-09-15T01:00:00Z" }); // done today
  const aT5 = await mkAct(crmA, uTH, { due: "2026-09-15T17:30:00Z" }); // 00:30 Thai tomorrow ⇒ out
  const aT6 = await mkAct(crmA, uTH, { due: "2026-09-13T03:00:00Z", done: "2026-09-14T03:00:00Z" }); // done yesterday ⇒ out
  const aT7 = await mkAct(crmA, uTH, { due: null }); // no due ⇒ out
  const aN1 = await mkAct(crmA, uNK, { due: "2026-09-15T03:00:00Z", deal: dNK }); // nok's ⇒ out for thana
  const aTs = await mkAct(crmS, uTH, { due: "2026-09-15T03:00:00Z", deal: dTHs }); // other system ⇒ out
  void aT5; void aT6; void aT7; void aN1; void aTs;
  // portal fixture (crmA): company + contact with live access (kP) · without (kN) · revoked (kR)
  const coParty = await P.party.create({ data: { tenantId: tidA, name: `บริษัท ${TAG}`, kind: "COMPANY" } });
  const coA = (await P.crmCompany.create({ data: { tenantId: tidA, systemId: crmA, name: `บริษัท ${TAG}`, partyId: coParty.id } })).id as string;
  const kP = await mkContact(tidA, crmA, uTH, teamP);
  const kN = await mkContact(tidA, crmA, uTH, teamP);
  const kR = await mkContact(tidA, crmA, uTH, teamP);
  await P.crmPortalAccess.create({ data: { tenantId: tidA, systemId: crmA, companyId: coA, contactId: kP, acceptedAt: ago(D), loginMethods: ["EMAIL_OTP"] } });
  await P.crmPortalAccess.create({ data: { tenantId: tidA, systemId: crmA, companyId: coA, contactId: kR, acceptedAt: ago(2 * D), revokedAt: ago(H), loginMethods: ["EMAIL_OTP"] } });

  // outbox fixture — status DONE (no foreign drainer ever runs them) · createdAt relative to NOWR
  const ev = (tid: string, type: string, at: Date, sys: string | null, unit: string | null = null) =>
    P.outboxEvent.create({ data: { tenantId: tid, type, idempotencyKey: `${TAG}#${type}#${nx()}`, payload: {}, systemId: sys, unitId: unit, status: "DONE", processedAt: at, createdAt: at, availableAt: at } });
  await ev(tidA, "member.created", ago(2 * D), memA1);
  await ev(tidA, "member.updated", ago(1 * H), memA2);
  await ev(tidA, "account.invoice.paid", ago(10 * D), accA);
  await ev(tidA, "kanban.card.completed", ago(3 * H), kanA1);
  await ev(tidA, "chat.message.received", ago(1 * D), chatA);
  await ev(tidA, "chat.message.received", ago(2 * D), chatA);
  await ev(tidA, "chat.message.received", ago(9 * D), chatA);
  await ev(tidA, "pos.sale.paid", ago(30 * 60_000), posA);
  await ev(tidA, "hotel.checked_out", ago(5 * H), null, unitH);
  await ev(tidA, "tenant.branding.updated", ago(60_000), null); // belongs to no system
  await ev(tidB, "member.created", NOWR, memB); // newer, other tenant ⇒ never counted for A
  await ev(tidB, "pos.sale.paid", NOWR, null);

  // synthetic minute jobs (registered in THIS process only) + their state rows
  const jobBad = `${TAG}-bad`;
  const jobOk = `${TAG}-ok`;
  JOB_NAMES.push(jobBad, jobOk);
  const tOk0 = ago(2 * H);
  const tRun = ago(10 * 60_000);
  MJ.registerMinuteJob({ name: jobBad, everyMinutes: 60, run: async () => {} });
  MJ.registerMinuteJob({ name: jobOk, everyMinutes: 30, run: async () => {} });
  await P.opsAlertState.create({ data: { source: `minute-job:run:${jobBad}`, lastAlertAt: tRun } });
  await P.opsAlertState.create({ data: { source: `minute-job:ok:${jobBad}`, lastAlertAt: tOk0 } });
  await P.opsAlertState.create({ data: { source: `minute-job:run:${jobOk}`, lastAlertAt: tRun } });
  await P.opsAlertState.create({ data: { source: `minute-job:ok:${jobOk}`, lastAlertAt: tRun } });
  await P.opsEvent.create({ data: { level: "WARN", source: "minute-job", message: `${jobBad} · failed`, detail: `boom ${TAG}` } });

  // ═════════════════════════════════════════════════════════════════════════════
  // K.1 — answer-key controls (independent of the product: fixture facts + raw SQL)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── K · answer keys ──");
  const sqlSystems = async (tid: string) => {
    const out: Record<string, { enabled: boolean; ids: string[] }> = {};
    const sys = (await P.appSystem.findMany({ where: { tenantId: tid }, select: { id: true, type: true, active: true } })) as Any[];
    const units = (await P.businessUnit.findMany({ where: { tenantId: tid }, select: { id: true, type: true, status: true } })) as Any[];
    for (const d of DEFS) {
      const code = String(d.code);
      if (Object.prototype.hasOwnProperty.call(FIXED, code)) { out[code] = { enabled: true, ids: [] }; continue; }
      const ids = d.kind === "business"
        ? units.filter((u) => u.type === code && u.status !== "ARCHIVED").map((u) => String(u.id))
        : sys.filter((s) => s.type === code && s.active === true).map((s) => String(s.id));
      out[code] = { enabled: ids.length > 0, ids: ids.sort() };
    }
    return out;
  };
  const sqlEvents = async (tid: string, types: string[]) => {
    if (types.length === 0) return { last: null as string | null, n7: 0 };
    const r = (await P.$queryRawUnsafe(
      `SELECT max("createdAt") AS last, count(*) FILTER (WHERE "createdAt" >= $2)::int AS n7 FROM "OutboxEvent" WHERE "tenantId" = $1 AND "type" = ANY($3::text[])`,
      tid, ago(7 * D), types)) as Any[];
    return { last: r?.[0]?.last ? new Date(r[0].last).toISOString() : null, n7: Number(r?.[0]?.n7 ?? 0) };
  };
  const keyA = await sqlSystems(tidA);
  {
    const evA = await sqlEvents(tidA, REQUIRED_EVENTS.MEMBER);
    const evCh = await sqlEvents(tidA, REQUIRED_EVENTS.CHAT);
    const ok = keyA.CRM.enabled && keyA.MEMBER.ids.length === 2 && !keyA.HR.enabled && keyA.HOTEL.enabled && !keyA.CLINIC.enabled && keyA.KB.enabled && keyA.PAGES.enabled && !keyA.SHOP.enabled
      && evA.last === ago(1 * H).toISOString() && evCh.n7 === 2 && evCh.last === ago(1 * D).toISOString() && DEFS.length === 24;
    chk("C3.6-K.1", "answer-key control: the raw-SQL derivation over the fixture gives CRM/MEMBER(2)/HOTEL/KB/PAGES enabled, HR (inactive) · CLINIC (archived) · SHOP (absent) disabled · MEMBER last event = member.updated 1 h ago (other tenant's newer event ignored) · CHAT 2 events in 7 days (the 9-day-old one out) · SYSTEM_DEFS = 24",
      ok, "fixture facts", `enabled=${Object.entries(keyA).filter(([, v]) => v.enabled).map(([k]) => k).join(",")} member=${j(evA)} chat=${j(evCh)} defs=${DEFS.length}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — integration status (4)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S1 · status of the 24 systems ──");
  const cA = (uid: string | null) => ctx(tidA, crmA, uid);
  const st = await call(statusF, cA(uO), aO, { now: NOWR });
  const rows = ((st.v?.systems ?? []) as Any[]);
  const rowOf = (code: string) => rows.find((r) => r?.code === code);
  {
    const order = rows.map((r) => String(r?.code)).join(",");
    const want = DEFS.map((d) => String(d.code)).join(",");
    const labels = rows.every((r) => { const d = DEFS.find((x) => x.code === r?.code); return !!d && r.label === d.label && Number(r.no) === Number(d.no) && r.kind === d.kind; });
    chk("C3.6-S1.1", "integrationStatus(owner) lists exactly the 24 systems of src/lib/systems.ts in SYSTEM_DEFS order with the registry's code · no · label · kind (mockup 17: CRM in the centre + 23 around it)",
      st.ok && rows.length === 24 && order === want && labels, "24 rows · registry order", `${st.ok ? `rows=${rows.length} order=${order === want} labels=${labels}` : st.err}${ABSENT}`);
  }
  {
    const bad = DEFS.map((d) => String(d.code)).filter((c) => { const r = rowOf(c); return !r || r.enabled !== keyA[c].enabled || !same(((r.systemIds ?? []) as Any[]).map(String).sort(), keyA[c].ids); });
    chk("C3.6-S1.2", "enabled + systemIds per system = the raw-SQL answer key: feature ⇒ active AppSystem of that type (HR switched off = disabled) · business ⇒ BusinessUnit not ARCHIVED (HOTEL on · CLINIC archived = off · SHOP none = off) · KB/PAGES (fixed pages) = on · MEMBER lists both member systems",
      st.ok && rows.length === 24 && bad.length === 0, "24/24 match", `${st.ok ? `mismatch=${bad.map((c) => `${c}:${rowOf(c)?.enabled}/${j(rowOf(c)?.systemIds)}≠${keyA[c].enabled}/${j(keyA[c].ids)}`).join(" ; ") || "-"}` : st.err}${ABSENT}`);
  }
  {
    const IE = (IS.INTEGRATION_EVENTS ?? {}) as Record<string, string[]>;
    const bad: string[] = [];
    for (const d of DEFS) {
      const c = String(d.code);
      const r = rowOf(c);
      const k = await sqlEvents(tidA, IE[c] ?? REQUIRED_EVENTS[c] ?? []);
      if (!r || isoOf(r.lastEventAt) !== k.last || Number(r.events7d) !== k.n7) bad.push(`${c}:${isoOf(r?.lastEventAt)}/${r?.events7d}≠${k.last}/${k.n7}`);
    }
    const anchors = isoOf(rowOf("MEMBER")?.lastEventAt) === ago(1 * H).toISOString() && Number(rowOf("CHAT")?.events7d) === 2 && isoOf(rowOf("ACCOUNT")?.lastEventAt) === ago(10 * D).toISOString()
      && Number(rowOf("ACCOUNT")?.events7d) === 0 && isoOf(rowOf("HOTEL")?.lastEventAt) === ago(5 * H).toISOString() && isoOf(rowOf("POS")?.lastEventAt) === ago(30 * 60_000).toISOString() && rowOf("SHOP")?.lastEventAt == null;
    chk("C3.6-S1.3", "lastEventAt / events7d per system = max(createdAt) / 7-day count over THIS tenant's outbox rows whose type ∈ INTEGRATION_EVENTS[code] — anchors: MEMBER = member.updated 1 h ago (tenant B's newer member.created ignored) · CHAT 2 in 7 d · ACCOUNT 10 d ago with 0 in 7 d · HOTEL 5 h (by unit) · POS 30 min · SHOP none",
      st.ok && rows.length === 24 && bad.length === 0 && anchors, "SQL answer key", `${st.ok ? `mismatch=${bad.join(" ; ") || "-"} anchors=${anchors}` : st.err}${ABSENT}`);
  }
  {
    const jobs = ((st.v?.jobs ?? []) as Any[]);
    const jb = jobs.find((x) => x?.name === jobBad);
    const jo = jobs.find((x) => x?.name === jobOk);
    const staticNames = [...read(MINUTE_JOBS_FILE).matchAll(/registerMinuteJob\(\{\s*name:\s*"([^"]+)"/g)].map((m) => m[1]);
    const missingNames = staticNames.filter((nm) => !jobs.some((x) => x?.name === nm));
    const badOk = !!jb && isoOf(jb.lastRunAt) === tRun.toISOString() && isoOf(jb.lastOkAt) === tOk0.toISOString() && String(jb.lastError ?? "").includes(`boom ${TAG}`) && Number(jb.everyMinutes) === 60;
    const okOk = !!jo && isoOf(jo.lastRunAt) === tRun.toISOString() && isoOf(jo.lastOkAt) === tRun.toISOString() && (jo.lastError === null || jo.lastError === undefined) && Number(jo.everyMinutes) === 30;
    chk("C3.6-S1.4", "job health comes from the C0.5 registry (getMinuteJobStatus): every job registered in minute-jobs.ts is listed · a failing job shows its last run, its older last success and the WARN detail of the minute-job OpsEvent as lastError · a healthy job shows lastRunAt = lastOkAt and no error",
      st.ok && staticNames.length >= 10 && missingNames.length === 0 && badOk && okOk, "registry · 2 synthetic rows exact", `${st.ok ? `jobs=${jobs.length} static=${staticNames.length} missing=${missingNames.join(",") || "-"} bad=${badOk} ${cut(j(jb), 160)} ok=${okOk}` : st.err}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S2.1 — targets: set / read / resolver precedence
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2 · targets ──");
  const tv = (r: Res) => (r.ok ? KINDS.map((k) => r.v?.[k] ?? null) : null);
  const auditCount = async () => (await P.auditLog.count({ where: { tenantId: tidA, action: "crm.integrations.targets" } })) as number;
  {
    const cand = await call(candF, tidA, "member");
    const r0 = await call(resolveF, tidA, crmA); // no target, no link: member 2 ⇒ null · kanban 2 ⇒ null · chat 1 · inventory 2 ⇒ null · account 1
    await P.appSystemUnit.create({ data: { tenantId: tidA, systemId: crmA, unitId: unitH, type: "CRM" } });
    await P.appSystemUnit.create({ data: { tenantId: tidA, systemId: memA1, unitId: unitH, type: "MEMBER" } });
    const r1 = await call(resolveF, tidA, crmA); // link ⇒ member = memA1
    const set = await call(setTargetsF, cA(uO), aO, { memberSystemId: memA2, kanbanSystemId: kanA2, inventorySystemId: invA2 });
    const got = await call(getTargetsF, cA(uO), aO);
    const r2 = await call(resolveF, tidA, crmA); // target beats link
    const stored = (await crmOf(crmA)).targets ?? {};
    const preserved = (await crmOf(crmA)).scoring?.probe === TAG && (await crmOf(crmA)).uiVersion === 2;
    await P.appSystem.update({ where: { id: invA2 }, data: { active: false } });
    const r3 = await call(resolveF, tidA, crmA); // stale target (inactive) ignored ⇒ the ONLY active inventory = invA1
    await P.appSystem.update({ where: { id: invA2 }, data: { active: true } });
    const exp0 = [null, accA, null, chatA, null];
    const exp1 = [memA1, accA, null, chatA, null];
    const exp2 = [memA2, accA, kanA2, chatA, invA2];
    const exp3 = [memA2, accA, kanA2, chatA, invA1];
    const okStored = stored.memberSystemId === memA2 && stored.kanbanSystemId === kanA2 && stored.inventorySystemId === invA2 && (stored.chatSystemId ?? null) === null;
    chk("C3.6-S2.1", "targets: listTargetCandidates(member) = both member systems oldest first · resolveCrmTargets precedence: nothing set & 2 systems ⇒ null, the only CHAT/ACCOUNT ⇒ it · CRM↔MEMBER sharing a unit ⇒ the linked one · setTargets(owner) stores `settings.crm.targets.{member,kanban,inventory}SystemId` (other crm keys kept) · getTargets reads them back · a stored target beats the link · a target switched off (active=false) is ignored ⇒ the only active one",
      cand.ok && same(((cand.v ?? []) as Any[]).map((x) => String(x?.id)), [memA1, memA2]) && j(tv(r0)) === j(exp0) && j(tv(r1)) === j(exp1) && set.ok && okStored && preserved
      && got.ok && got.v?.memberSystemId === memA2 && got.v?.kanbanSystemId === kanA2 && got.v?.inventorySystemId === invA2 && (got.v?.chatSystemId ?? null) === null && (got.v?.accountSystemId ?? null) === null
      && j(tv(r2)) === j(exp2) && j(tv(r3)) === j(exp3),
      "precedence target > link > only > null", `cand=${rs(cand)} r0=${j(tv(r0))} r1=${j(tv(r1))} set=${rs(set)} stored=${j(stored)} kept=${preserved} get=${rs(got)} r2=${j(tv(r2))} r3=${j(tv(r3))}${ABSENT}`);
  }

  // X9.1 — audit on target changes
  {
    const before = await auditCount();
    const s1 = await call(setTargetsF, cA(uO), aO, { chatSystemId: chatA });
    const rowsA = (await P.auditLog.findMany({ where: { tenantId: tidA, action: "crm.integrations.targets" }, orderBy: { createdAt: "desc" }, take: 1 })) as Any[];
    const last = rowsA[0];
    const after = await auditCount();
    const okRow = !!last && last.actorId === uO && last.targetId === crmA && (last.before?.chatSystemId ?? null) === null && last.after?.chatSystemId === chatA && last.after?.memberSystemId === memA2;
    const leak = PII.filter((x) => j(last ?? {}).includes(x));
    chk("C3.6-X9.1", "X9: every effective target change writes ONE AuditLog row `crm.integrations.targets` (actor = the owner · targetId = the CRM system · before/after = the 5 ids) — ids only, no PII",
      s1.ok && after === before + 1 && okRow && leak.length === 0, "+1 row · before/after", `set=${rs(s1)} audit ${before}→${after} row=${cut(j(last), 200)} leak=${leak.length}${ABSENT}`, "MAJOR");
  }

  // X1.1 — targets can never point outside the tenant / to a wrong type / to a switched-off system; foreign raw ids are ignored
  {
    const snap = j((await crmOf(crmA)).targets ?? null);
    const nAudit = await auditCount();
    const foreign = await call(setTargetsF, cA(uO), aO, { memberSystemId: memB });
    const wrongType = await call(setTargetsF, cA(uO), aO, { memberSystemId: kanA1 });
    await P.appSystem.update({ where: { id: kanA1 }, data: { active: false } });
    const off = await call(setTargetsF, cA(uO), aO, { kanbanSystemId: kanA1 });
    await P.appSystem.update({ where: { id: kanA1 }, data: { active: true } });
    const byThana = await call(setTargetsF, cA(uTH), aTH, { memberSystemId: memA1 });
    const crossCtx = await call(setTargetsF, ctx(tidB, crmA, uO), aO, { memberSystemId: memA1 });
    const unchanged = j((await crmOf(crmA)).targets ?? null) === snap && (await auditCount()) === nAudit;
    // raw foreign / wrong-type ids injected straight into the settings of crmS (no unit link): the resolver must never return them
    await setCrm(crmS, { targets: { memberSystemId: memB, kanbanSystemId: kanA1, inventorySystemId: chatA, chatSystemId: crmB } });
    const rr = await call(resolveF, tidA, crmS);
    const expS = [null, accA, kanA1, chatA, null];
    chk("C3.6-X1.1", "X1: setTargets refuses (Thai VALIDATION, nothing stored, no audit) a system of ANOTHER tenant · a system of the wrong type · a switched-off system · a STAFF without crm.settings.manage is refused · another tenant's ctx ⇒ NOT_FOUND · ids of another tenant / wrong type written raw into settings are ignored by resolveCrmTargets (never returned)",
      isVal(foreign) && isVal(wrongType) && isVal(off) && (isFB(byThana) || isNF(byThana)) && isNF(crossCtx) && unchanged && rr.ok && j(tv(rr)) === j(expS),
      "refused · unchanged · ignored", `foreign=${rs(foreign)} wrongType=${rs(wrongType)} off=${rs(off)} thana=${rs(byThana)} cross=${rs(crossCtx)} unchanged=${unchanged} resolveS=${j(tv(rr))}${ABSENT}`);
  }

  // X3.1 — parallel writes of different settings keys never lose each other (single-statement jsonb_set)
  {
    const results: string[] = [];
    let allOk = true;
    for (let round = 0; round < 2; round += 1) {
      const even = round % 2 === 0;
      const want = { memberSystemId: even ? memA1 : memA2, kanbanSystemId: even ? kanA1 : kanA2, inventorySystemId: even ? invA1 : invA2, chatSystemId: even ? null : chatA, accountSystemId: even ? accA : null };
      const jobs: Promise<Res>[] = [
        call(setTargetsF, cA(uO), aO, { memberSystemId: want.memberSystemId }),
        call(setTargetsF, cA(uO), aO, { kanbanSystemId: want.kanbanSystemId }),
        call(setTargetsF, cA(uO), aO, { inventorySystemId: want.inventorySystemId }),
        call(setTargetsF, cA(uO), aO, { chatSystemId: want.chatSystemId }),
        call(setTargetsF, cA(uO), aO, { accountSystemId: want.accountSystemId }),
        call(setTargetsF, cA(uO), aO, { memberSystemId: want.memberSystemId }),
        call(setTargetsF, cA(uO), aO, { kanbanSystemId: want.kanbanSystemId }),
        call(CS.setCrmSettingsKey, { tenantId: tidA, systemId: crmA }, "chatToLead", even),
        call(CS.setCrmAiKey, { tenantId: tidA, systemId: crmA }, "chatSummary", !even),
        call(CS.setCrmRecordingDays, { tenantId: tidA, systemId: crmA }, even ? 365 : 400),
      ];
      const out = await Promise.all(jobs);
      const c = await crmOf(crmA);
      const t = c.targets ?? {};
      const ok = out.every((r) => r.ok) && KINDS.every((k) => (t[KEY_OF[k]] ?? null) === (want as Any)[KEY_OF[k]]) && c.chatToLead === even && c.ai?.chatSummary === !even
        && c.retention?.recordingDays === (even ? 365 : 400) && c.scoring?.probe === TAG && c.uiVersion === 2 && c.portal?.enabled === true;
      allOk = allOk && ok;
      results.push(`r${round}:${ok ? "ok" : `${out.filter((r) => !r.ok).map((r) => r.err).slice(0, 2).join("|")} t=${j(t)} c2l=${c.chatToLead}`}`);
    }
    chk("C3.6-X3.1", "X3: 2 rounds × 10 parallel writes (5 target kinds + 2 duplicates + chatToLead + ai.chatSummary + retention.recordingDays, each on its own pool connection) ⇒ every value of the round survives and unrelated keys (uiVersion · scoring · portal) are untouched — no read-modify-write of the settings JSON",
      allOk, "nothing lost", `${results.join(" · ")}${ABSENT}`);
  }
  // back to a known state for the rest of the file
  await call(setTargetsF, cA(uO), aO, { memberSystemId: memA2, kanbanSystemId: kanA2, inventorySystemId: invA2, chatSystemId: null, accountSystemId: null });

  // S2.2 — the member bridge (crm.deal.won → member) lands in the TARGET member system
  {
    const crmM = await mk(tidM, "CRM", "CRM");
    const memM1 = await mk(tidM, "MEMBER", "สมาชิก 1");
    const memM2 = await mk(tidM, "MEMBER", "สมาชิก 2");
    await setCrm(crmM, { uiVersion: 2, bridgesEnabled: true });
    const pM = await mkPipe(tidM, crmM);
    const won1 = await mkDeal(tidM, crmM, pM, { owner: uO, team: null, stage: pM.WON, kind: "WON" });
    const won2 = await mkDeal(tidM, crmM, pM, { owner: uO, team: null, stage: pM.WON, kind: "WON" });
    const evt = (dealId: string) => ({ id: `${TAG}-evt-${nx()}`, tenantId: tidM, type: "crm.deal.won", payload: { dealId }, systemId: crmM, unitId: null });
    const fire = fnOf(MB, "onCrmDealWon");
    const legacy = await call(fire, evt(won1.id)); // 2 member systems, no link, no target ⇒ nowhere (today's behaviour, kept)
    const cust0 = (await P.customer.count({ where: { tenantId: tidM } })) as number;
    const set = await call(setTargetsF, ctx(tidM, crmM, uO), aO, { memberSystemId: memM2 });
    const fired = await call(fire, evt(won2.id));
    const c2 = (await P.customer.findMany({ where: { tenantId: tidM }, select: { memberSystemId: true, sourceDetail: true } })) as Any[];
    const inTarget = c2.filter((c) => c.memberSystemId === memM2 && String(c.sourceDetail?.crmContactId ?? "") === won2.contactId).length;
    const inOther = c2.filter((c) => c.memberSystemId === memM1).length;
    chk("C3.6-S2.2", "used by bridges — member: a tenant with 2 member systems and no unit link: `crm.deal.won` (member-bridges onCrmDealWon) creates nobody while no target is set (legacy kept) · after setTargets(member = the 2nd system) the won deal's contact becomes a member of THAT system (source CRM · sourceDetail.crmContactId) and none lands in the 1st",
      typeof fire === "function" && legacy.ok && cust0 === 0 && set.ok && fired.ok && inTarget === 1 && inOther === 0, "0 → 1 in target", `legacy=${rs(legacy)} before=${cust0} set=${rs(set)} fired=${rs(fired)} inTarget=${inTarget} inOther=${inOther}${ABSENT}`);
  }

  // S2.3 — deal lines read the TARGET inventory system
  {
    const crmI = await mk(tidI, "CRM", "CRM");
    const invI1 = await mk(tidI, "INVENTORY", "คลัง 1");
    const invI2 = await mk(tidI, "INVENTORY", "คลัง 2");
    await setCrm(crmI, { uiVersion: 2, bridgesEnabled: true });
    const it1 = (await P.invItem.create({ data: { tenantId: tidI, systemId: invI1, sku: `${TAG}-1`, name: `สินค้า 1 ${TAG}` } })).id as string;
    const it2 = (await P.invItem.create({ data: { tenantId: tidI, systemId: invI2, sku: `${TAG}-2`, name: `สินค้า 2 ${TAG}` } })).id as string;
    const pI = await mkPipe(tidI, crmI);
    const dI = await mkDeal(tidI, crmI, pI, { owner: uO, team: null, stage: pI.L, kind: "OPEN" });
    const cI = ctx(tidI, crmI, uO);
    const line = (productId: string) => ({ lines: [{ name: `สินค้า ${TAG}`, qty: 1, unitPriceSatang: 10_000, productId }] });
    const legacy1 = await call(DL.setLines, cI, aO, dI.id, line(it1));
    const legacy2 = await call(DL.setLines, cI, aO, dI.id, line(it2));
    const set = await call(setTargetsF, cI, aO, { inventorySystemId: invI2 });
    const other = await call(DL.setLines, cI, aO, dI.id, line(it1));
    const target = await call(DL.setLines, cI, aO, dI.id, line(it2));
    chk("C3.6-S2.3", "used by bridges — inventory: with 2 inventory systems and no target, deal lines accept a product of either (legacy search kept) · after setTargets(inventory = the 2nd) a product of the 1st is refused (Thai NOT_FOUND/VALIDATION) and a product of the target is applied",
      legacy1.ok && legacy2.ok && set.ok && (isNF(other) || isVal(other)) && target.ok, "legacy both · target only", `legacy=${legacy1.ok ? "ok" : legacy1.err}/${legacy2.ok ? "ok" : legacy2.err} set=${rs(set)} other=${rs(other)} target=${target.ok ? "ok" : target.err}${ABSENT}`);
  }

  // S2.4 + K.2 — ONE resolver (static) with a positive control
  {
    const RAW = /appSystem\s*\.\s*(?:findFirst|findMany|findUnique|findFirstOrThrow|count)\s*\(\s*\{[^;]{0,500}?type\s*:\s*(?:["'](MEMBER|ACCOUNT|KANBAN|CHAT|INVENTORY)["']|\{\s*in\s*:\s*\[[^\]]*["'](MEMBER|ACCOUNT|KANBAN|CHAT|INVENTORY)["'])/g;
    const scan = (src: string): string[] => [...stripComments(src).matchAll(RAW)].map((m) => m[1] ?? m[2] ?? "?");
    const regionOf = (src: string): string => {
      const at = src.indexOf("export async function onCrmDealWon");
      if (at < 0) return "";
      const helper = src.indexOf("async function memberSystemForCrm");
      const start = helper >= 0 && helper < at ? helper : at;
      const nextExp = src.indexOf("\nexport async function ", at + 10);
      return src.slice(start, nextExp > 0 ? nextExp : undefined);
    };
    const files = [...walk("src/lib/modules/crm").filter((f) => !/integrations(-shared)?\.ts$/.test(f)), ...walk("src/lib/platform/crm-bridges"), "src/lib/platform/crm-outbound.ts"];
    const hits: string[] = [];
    for (const f of files) for (const t of scan(read(f))) hits.push(`${f.replace("src/lib/", "")}:${t}`);
    for (const t of scan(regionOf(read(MEMBER_BRIDGES)))) hits.push(`member-bridges#onCrmDealWon:${t}`);
    const MUST = ["src/lib/member-bridges.ts", "src/lib/modules/crm/contacts.ts", "src/lib/modules/crm/consents.ts", "src/lib/modules/crm/deals.ts", "src/lib/modules/crm/activities.ts", "src/lib/modules/crm/companies.ts", "src/lib/modules/crm/automation.ts"];
    const noRef = MUST.filter((f) => !/resolveCrmTargets|listTargetCandidates/.test(stripComments(read(f))));
    // positive control: the baseline tree (git) + synthetic snippets
    const git = (p: string) => { try { return execSync(`git show ${BASELINE}:${p}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }); } catch { return ""; } };
    const baseHits = ["src/lib/modules/crm/deals.ts", "src/lib/modules/crm/activities.ts", "src/lib/modules/crm/contacts.ts", "src/lib/modules/crm/consents.ts"].flatMap((f) => scan(git(f))).length + scan(regionOf(git(MEMBER_BRIDGES))).length;
    const synthBad = scan(`const s = await prisma.appSystem.findMany({ where: { tenantId, type: "KANBAN" }, select: { id: true } });`).length === 1
      && scan(`db.appSystem.findFirst({ where: { tenantId: t, type: { in: ["CRM", "MEMBER"] } } })`).length === 1;
    const synthClean = scan(`await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } }); const x = { type: "MEMBER" };`).length === 0;
    chk("C3.6-K.2", "scanner positive control: it flags the raw target lookups of the pre-C3.6 tree (git " + BASELINE + ": deals/activities/contacts/consents + member-bridges#onCrmDealWon ⇒ ≥ 5) and two synthetic violations, and passes a CRM-type lookup followed by an unrelated `type:` literal",
      baseHits >= 5 && synthBad && synthClean, "≥ 5 · flags · passes", `baseline=${baseHits} synthBad=${synthBad} synthClean=${synthClean}`, "MAJOR");
    chk("C3.6-S2.4", "used by bridges — ONE resolver [static]: no raw AppSystem lookup by type MEMBER/ACCOUNT/KANBAN/CHAT/INVENTORY is left in crm/** (except integrations*.ts), crm-bridges/**, crm-outbound.ts or member-bridges#onCrmDealWon · every former target-picking site (member-bridges · contacts convert · consents · deals lines · activities kanban · companies account · automation SEND_LINE) goes through resolveCrmTargets / listTargetCandidates",
      BUILT && hits.length === 0 && noRef.length === 0, "0 raw · 7 sites wired", `raw=${hits.join(" ; ") || "-"} unwired=${noRef.map((f) => f.replace("src/lib/", "")).join(",") || "-"}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — PAGES widgets (3) · X1.2 visibility
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3 · PAGES widgets ──");
  const mdTH = await call(myDealsF, cA(uTH), aTH, { limit: 20 });
  const mdO = await call(myDealsF, cA(uO), aO, { limit: 20 });
  {
    const items = ((mdTH.v?.items ?? []) as Any[]);
    const i1 = items.find((x) => x?.id === dTH1.id);
    const i2 = items.find((x) => x?.id === dTH2.id);
    const shape = !!i1 && !!i2 && i1.stalled === true && i2.stalled === false && typeof i1.title === "string" && Number(i1.valueSatang) === 1_000_000 && i1.stageName === "ผู้สนใจ" && i2.stageName === "เสนอราคา"
      && String(i1.href ?? "").includes(`/app/sys/${crmA}/crm/deals/${dTH1.id}`);
    chk("C3.6-S3.1", "widget \"ดีลของฉัน\": myDeals(thana) = his OPEN, not-archived deals of THIS system (the WON one, the archived one and his deal in the other CRM system are out) · total 2 · each item carries title · value · stage name · stale flag · a link into the deal · myDeals(owner) = the owner's own deal only (not everything he may see)",
      mdTH.ok && same(idsOf(mdTH.v), [dTH1.id, dTH2.id].sort()) && Number(mdTH.v?.total) === 2 && shape && mdO.ok && same(idsOf(mdO.v), [dO1.id]),
      "{dTH1,dTH2} · {dO1}", `thana=${mdTH.ok ? j(idsOf(mdTH.v)) : mdTH.err} total=${mdTH.v?.total} shape=${shape} owner=${mdO.ok ? j(idsOf(mdO.v)) : mdO.err}${ABSENT}`);
  }
  const tdTH = await call(todayF, cA(uTH), aTH, { now: NOW_TASKS });
  {
    const want = [aT1, aT2, aT3, aT4].sort();
    const c = tdTH.v?.counts ?? {};
    const it4 = ((tdTH.v?.items ?? []) as Any[]).find((x) => x?.id === aT4);
    chk("C3.6-S3.2", "widget \"งานวันนี้\": todayTasks(thana, now = 15 Sep 12:00 Thai) = today 2 (09:00 and 23:30 Thai) · overdue 1 (yesterday) · done 1 (done this morning) · items = those 4 — 00:30 Thai tomorrow, done yesterday, no due date, nok's task and his task of the other CRM system are out (Thai-day boundaries, not UTC)",
      tdTH.ok && same(idsOf(tdTH.v), want) && Number(c.today) === 2 && Number(c.overdue) === 1 && Number(c.done) === 1 && it4?.done === true,
      "4 items · 2/1/1", `${tdTH.ok ? `items=${j(idsOf(tdTH.v))} counts=${j(c)} doneFlag=${it4?.done}` : tdTH.err}${ABSENT}`);
  }
  {
    const cP = { tenantId: tidA, systemId: crmA };
    const eP = await call(portalF, cP, { contactId: kP });
    const eN = await call(portalF, cP, { contactId: kN });
    const eR = await call(portalF, cP, { contactId: kR });
    await setCrm(crmA, { portal: { enabled: false } });
    const eOff = await call(portalF, cP, { contactId: kP });
    await setCrm(crmA, { portal: { enabled: true } });
    // PAGES: a page of unit H (linked to CRM v2) with the 3 data widgets · a page of tenant V (CRM v1) with the same widgets
    const pageA = await P.page.create({ data: { tenantId: tidA, unitId: unitH, name: `หน้า ${TAG}`, slug: `${rand}a${nx()}q` } });
    for (const [i, k] of WIDGET_KEYS.entries()) await P.pageWidget.create({ data: { tenantId: tidA, pageId: pageA.id, widgetKey: k, sortOrder: i } });
    const crmVv = await mk(tidV, "CRM", "CRM v1");
    await setCrm(crmVv, { uiVersion: 1 });
    const unitV = (await P.businessUnit.create({ data: { tenantId: tidV, type: "HOTEL", name: `โรงแรม ${TAG}`, slug: `${TAG}-v-hotel` } })).id as string;
    await P.appSystemUnit.create({ data: { tenantId: tidV, systemId: crmVv, unitId: unitV, type: "CRM" } });
    const pageV = await P.page.create({ data: { tenantId: tidV, unitId: unitV, name: `หน้า ${TAG}`, slug: `${rand}v${nx()}q` } });
    for (const [i, k] of WIDGET_KEYS.entries()) await P.pageWidget.create({ data: { tenantId: tidV, pageId: pageV.id, widgetKey: k, sortOrder: i } });
    const rA = await call(PGS.pageForRender, pageA.slug);
    const rV = await call(PGS.pageForRender, pageV.slug);
    const keysA = ((rA.v?.widgets ?? []) as Any[]).map((w) => String(w?.key));
    const keysV = ((rV.v?.widgets ?? []) as Any[]).map((w) => String(w?.key));
    const hrefP = String(eP.v?.href ?? "");
    const hrefClean = hrefP.startsWith("/b/") && !PII.some((x) => hrefP.includes(x)) && !hrefP.includes(kP);
    chk("C3.6-S3.3", "widget \"portal\" + PAGES wiring: portalEntry(contact with live portal access) = { href \"/b/…\" } without PII/ids · no access ⇒ null · revoked access ⇒ null · portal switched off ⇒ null · pageForRender(page of a CRM-v2 unit) renders the 3 CRM widgets (S:CRM:my-deals · today-tasks · portal) · the same widgets on a page whose CRM is uiVersion 1 render nothing",
      eP.ok && hrefClean && eN.ok && eN.v === null && eR.ok && eR.v === null && eOff.ok && eOff.v === null && rA.ok && WIDGET_KEYS.every((k) => keysA.includes(k)) && rV.ok && WIDGET_KEYS.every((k) => !keysV.includes(k)),
      "href · null ×3 · v2 3 widgets · v1 none", `kP=${rs(eP)} kN=${rs(eN)} kR=${rs(eR)} off=${rs(eOff)} pageA=${rA.ok ? j(keysA) : rA.err || PGS.__err} pageV=${rV.ok ? j(keysV) : rV.err}${ABSENT}`);
  }
  {
    const mdNK = await call(myDealsF, cA(uNK), aNK, { limit: 20 });
    const tdNK = await call(todayF, cA(uNK), aNK, { now: NOW_TASKS });
    const krabi = [dNK.id, dK0.id];
    const noKrabi = mdTH.ok && !idsOf(mdTH.v).some((x) => krabi.includes(x)) && tdTH.ok && !idsOf(tdTH.v).includes(aN1);
    const crossSys = await call(myDealsF, cA(uTH), aTH, { limit: 20 });
    const otherSys = await call(myDealsF, ctx(tidA, crmS, uTH), aTH, { limit: 20 });
    const crossTenant = await call(myDealsF, ctx(tidB, crmA, uTH), aTH, { limit: 20 });
    const pOther = await call(portalF, { tenantId: tidA, systemId: crmS }, { contactId: kP });
    const pForeign = await call(portalF, { tenantId: tidB, systemId: crmB }, { contactId: kP });
    const noPerm = await call(myDealsF, cA(uTH), actor(uTH, "STAFF", { "crm.contact.read": true }), { limit: 20 });
    chk("C3.6-X1.2", "X1 widgets: thana's \"my deals\" never shows a Krabi deal (nok's · the owner-less team-K deal) and \"today\" never shows nok's task · nok's widget has his deal only · the other CRM system shows only that system's deal · another tenant's ctx ⇒ NOT_FOUND · the portal widget of a contact of another system/tenant ⇒ null (or NOT_FOUND) · a STAFF without crm.deal.read ⇒ refused",
      noKrabi && crossSys.ok && mdNK.ok && same(idsOf(mdNK.v), [dNK.id]) && tdNK.ok && same(idsOf(tdNK.v), [aN1]) && otherSys.ok && same(idsOf(otherSys.v), [dTHs.id]) && isNF(crossTenant)
      && ((pOther.ok && pOther.v === null) || isNF(pOther)) && ((pForeign.ok && pForeign.v === null) || isNF(pForeign)) && (isFB(noPerm) || isNF(noPerm)),
      "scoped", `noKrabi=${noKrabi} nok=${mdNK.ok ? j(idsOf(mdNK.v)) : mdNK.err} nokToday=${tdNK.ok ? j(idsOf(tdNK.v)) : tdNK.err} otherSys=${otherSys.ok ? j(idsOf(otherSys.v)) : otherSys.err} crossTenant=${rs(crossTenant)} pOther=${rs(pOther)} pForeign=${rs(pForeign)} noPerm=${rs(noPerm)}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — MemberSavedView.teamId in MEMBER lists (2) · X1.4
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S4 · member views with a real team ──");
  for (let i = 0; i < 5; i += 1) await P.customer.create({ data: { tenantId: tidA, memberSystemId: memA1, name: pii(i < 3 ? `วีไอพี ${TAG} ${i}` : `ทั่วไป ${TAG} ${i}`), memberCode: `${TAG}-${i}` } });
  const cMem = (uid: string) => ctx(tidA, memA1, uid);
  let viewK = "-";
  {
    const cv = await call(MV.createSavedView, cMem(uM), aM, { name: `ลูกค้า VIP กระบี่ ${TAG}`, scope: "TEAM", teamId: teamK, filters: { q: "วีไอพี" } });
    viewK = String(cv.v?.id ?? "-");
    const row = (await P.memberSavedView.findFirst({ where: { id: viewK } })) as Any;
    const lKT = await call(MV.listSavedViews, cMem(uKT), aKT);
    const lNK = await call(MV.listSavedViews, cMem(uNK), aNK);
    const lTH = await call(MV.listSavedViews, cMem(uTH), aTH);
    const lM = await call(MV.listSavedViews, cMem(uM), aM);
    const via = await call(ML.listMembers, cMem(uKT), aKT, { viewId: viewK, take: 50 });
    const explicit = await call(ML.listMembers, cMem(uKT), aKT, { q: "วีไอพี", take: 50 });
    const useTH = await call(ML.listMembers, cMem(uTH), aTH, { viewId: viewK, take: 50 });
    const vids = (r: Res) => (r.ok ? ((r.v ?? []) as Any[]).map((x) => String(x?.id)) : []);
    const ids = (r: Res) => (r.ok ? ((r.v?.items ?? []) as Any[]).map((x) => String(x?.id)).sort() : []);
    chk("C3.6-S4.1", "member TEAM view with a real team: the manager saves a TEAM view for team K ⇒ stored with teamId K · kata (member) and nok (lead) list it and listMembers({viewId}) for kata = listMembers(with the same filters) (3 VIP customers) · thana (team P) neither lists it nor can use it (MemberNotFoundError) · the creator still lists it",
      cv.ok && row?.teamId === teamK && row?.scope === "TEAM" && row?.objectKey === "customer" && vids(lKT).includes(viewK) && vids(lNK).includes(viewK) && lTH.ok && !vids(lTH).includes(viewK) && vids(lM).includes(viewK)
      && via.ok && explicit.ok && ids(via).length === 3 && same(ids(via), ids(explicit)) && isNF(useTH),
      "team-only · applied", `create=${rs(cv)} stored=${row?.teamId === teamK} kata=${vids(lKT).includes(viewK)} nok=${vids(lNK).includes(viewK)} thana=${vids(lTH).includes(viewK)} creator=${vids(lM).includes(viewK)} via=${via.ok ? ids(via).length : via.err} explicit=${explicit.ok ? ids(explicit).length : explicit.err} thanaUse=${rs(useTH)}${ABSENT}`);
  }
  {
    const legacy = await P.memberSavedView.create({ data: { tenantId: tidA, systemId: memA1, ownerUserId: uM, scope: "TEAM", name: `ทั้งร้าน (เดิม) ${TAG}`, objectKey: "customer", filters: { q: "ทั่วไป" } } });
    const priv = await P.memberSavedView.create({ data: { tenantId: tidA, systemId: memA1, ownerUserId: uKT, scope: "PRIVATE", name: `ของกมล ${TAG}`, objectKey: "customer", filters: { q: "วีไอพี" } } });
    const lTH = await call(MV.listSavedViews, cMem(uTH), aTH);
    const useLegacy = await call(ML.listMembers, cMem(uTH), aTH, { viewId: legacy.id, take: 50 });
    const usePrivTH = await call(ML.listMembers, cMem(uTH), aTH, { viewId: priv.id, take: 50 });
    const usePrivKT = await call(ML.listMembers, cMem(uKT), aKT, { viewId: priv.id, take: 50 });
    const dtoKeys = lTH.ok ? Object.keys(((lTH.v ?? []) as Any[]).find((x) => x?.id === legacy.id) ?? {}).sort().join(",") : "-";
    const vids = (lTH.ok ? ((lTH.v ?? []) as Any[]).map((x) => String(x?.id)) : []);
    chk("C3.6-S4.2", "legacy + private rules: a TEAM view WITHOUT teamId keeps meaning \"whole shop\" (thana lists and uses it: 2 customers) · someone else's PRIVATE view is not listed and cannot be used through listMembers({viewId}) (MemberNotFoundError) while its owner uses it · SavedViewDto keys unchanged (columns,filters,id,name,ownerUserId,scope,sort)",
      vids.includes(legacy.id) && !vids.includes(priv.id) && useLegacy.ok && ((useLegacy.v?.items ?? []) as Any[]).length === 2 && isNF(usePrivTH) && usePrivKT.ok && dtoKeys === "columns,filters,id,name,ownerUserId,scope,sort",
      "legacy whole shop · private owner-only", `legacyListed=${vids.includes(legacy.id)} privListed=${vids.includes(priv.id)} useLegacy=${useLegacy.ok ? ((useLegacy.v?.items ?? []) as Any[]).length : useLegacy.err} privTH=${rs(usePrivTH)} privKT=${usePrivKT.ok ? "ok" : usePrivKT.err} keys=${dtoKeys}${ABSENT}`);
  }
  {
    const foreignTeam = await call(MV.createSavedView, cMem(uM), aM, { name: `ทีมร้านอื่น ${TAG}`, scope: "TEAM", teamId: teamB, filters: {} });
    const otherSys = await call(ML.listMembers, ctx(tidA, memA2, uKT), aKT, { viewId: viewK, take: 50 });
    const byStaff = await call(MV.createSavedView, cMem(uKT), aKT, { name: `ทีมของกมล ${TAG}`, scope: "TEAM", teamId: teamK, filters: {} });
    const nForeign = (await P.memberSavedView.count({ where: { tenantId: tidA, teamId: teamB } })) as number;
    chk("C3.6-X1.4", "X1 member views: a team of ANOTHER tenant is refused (Thai input error, nothing stored) · the team-K view used from the other member system ⇒ NOT_FOUND · a STAFF still cannot create a TEAM view (MANAGER+ rule of M1.5 kept)",
      (isVal(foreignTeam) || isNF(foreignTeam)) && nForeign === 0 && isNF(otherSys) && (isFB(byStaff) || refused(byStaff)),
      "refused ×3", `foreignTeam=${rs(foreignTeam)} stored=${nForeign} otherSys=${rs(otherSys)} staff=${rs(byStaff)}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X1.3 status scope · X8.1 PII · U.1 uiVersion 1
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X · scope · PII · uiVersion 1 ──");
  {
    const byThana = await call(statusF, cA(uTH), aTH, { now: NOWR });
    const cross = await call(statusF, ctx(tidB, crmA, uO), aO, { now: NOWR });
    const stB = await call(statusF, ctx(tidB, crmB, uO), aO, { now: NOWR });
    const rowB = ((stB.v?.systems ?? []) as Any[]).find((r) => r?.code === "MEMBER");
    const hrB = ((stB.v?.systems ?? []) as Any[]).find((r) => r?.code === "HOTEL");
    const gB = await call(getTargetsF, ctx(tidB, crmA, uO), aO);
    chk("C3.6-X1.3", "X1 status: a STAFF without crm.settings.manage is refused (no status, no job list) · another tenant's ctx with this CRM system ⇒ NOT_FOUND (getTargets too) · tenant B's own status shows only B (its MEMBER row = B's member system and B's newest event, no HOTEL of A)",
      (isFB(byThana) || isNF(byThana)) && isNF(cross) && isNF(gB) && stB.ok && same(((rowB?.systemIds ?? []) as Any[]).map(String), [memB]) && isoOf(rowB?.lastEventAt) === NOWR.toISOString() && hrB?.enabled === false,
      "scoped", `thana=${rs(byThana)} cross=${rs(cross)} getTargetsCross=${rs(gB)} B=${stB.ok ? `${j(rowB?.systemIds)}/${isoOf(rowB?.lastEventAt)}/hotel=${hrB?.enabled}` : stB.err}${ABSENT}`);
  }
  {
    const dto = j(st.v ?? null) + j(mdTH.v ?? null) + j(mdO.v ?? null) + j(tdTH.v ?? null);
    const leak = PII.filter((x) => (/^08\d{8}$/.test(x) || x.includes("@")) && dto.includes(x));
    chk("C3.6-X8.1", "X8: the status DTO carries no event payload and the widget DTOs carry no customer phone / e-mail (deal titles and stage names only)",
      st.ok && mdTH.ok && tdTH.ok && leak.length === 0 && !/"payload"/.test(j(st.v ?? null)), "no PII", `status=${st.ok} leaks=${leak.length}${ABSENT}`, "MAJOR");
  }
  {
    const cV = ctx(tidA, crmV, uO);
    const snapV = j((await crmOf(crmV)).targets ?? null);
    const s = await call(statusF, cV, aO, { now: NOWR });
    const g = await call(getTargetsF, cV, aO);
    const t = await call(setTargetsF, cV, aO, { memberSystemId: memA1 });
    const m = await call(myDealsF, cV, aO, { limit: 20 });
    const td = await call(todayF, cV, aO, { now: NOW_TASKS });
    const pe = await call(portalF, { tenantId: tidA, systemId: crmV }, { contactId: kP });
    const emptyOrV1 = (r: Res) => isV1(r) || (r.ok && (r.v === null || ((r.v?.items ?? []) as Any[]).length === 0));
    chk("C3.6-U.1", "R-E.14 uiVersion 1: integrationStatus · getTargets · setTargets answer CrmV2DisabledError and nothing is stored · the widgets answer CrmV2DisabledError or nothing (portal null) — together with S3.3 (pages of a v1 CRM render no CRM widget)",
      isV1(s) && isV1(g) && isV1(t) && j((await crmOf(crmV)).targets ?? null) === snapV && emptyOrV1(m) && emptyOrV1(td) && (isV1(pe) || (pe.ok && pe.v === null)),
      "v1 refused / empty", `status=${rs(s)} get=${rs(g)} set=${rs(t)} myDeals=${rs(m)} today=${rs(td)} portal=${rs(pe)}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 — UI (static · pixel parity = gate D7 on mockup 17)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S5 · UI (mockup 17) ──");
  let inv: Any[] = [];
  try { inv = (JSON.parse(read(INVENTORY)).rows ?? []) as Any[]; } catch { inv = []; }
  const FIXED_W = /(^|[\s"'`{(])((?:[a-z0-9]+:)*)(min-w|w)-\[(\d+(?:\.\d+)?)(px|rem)\]/g;
  const wideUnprefixed = (src: string): string[] => {
    const out: string[] = [];
    for (const m of src.matchAll(FIXED_W)) {
      if (m[2]) continue;
      const px = m[5] === "rem" ? Number(m[4]) * 16 : Number(m[4]);
      if (px > 390) out.push(`${m[3]}-[${m[4]}${m[5]}]`);
    }
    for (const m of src.matchAll(/\b(minWidth|width)\s*:\s*["'`]?(\d{3,})(px)?["'`]?/g)) if (Number(m[2]) > 390) out.push(`${m[1]}:${m[2]}`);
    return out;
  };
  const classLits = (src: string): string[] => [...src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|'([^']*)')/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
  const hasCardAlt = (src: string) => { const c = classLits(src); return c.some((x) => /(^|\s)(sm|md|lg):hidden(\s|$)/.test(x)) && c.some((x) => /(^|\s)hidden(\s|$)/.test(x) && /(^|\s)(sm|md|lg):(block|table|grid|flex)(\s|$)/.test(x)); };
  const hasScroller = (src: string) => /overflow-x-(auto|scroll)|\boverflow-auto\b/.test(src);
  {
    const page = read(INT_PAGE);
    const files = [...walk(INT_PAGE_DIR), ...walk(INT_COMP_DIR)];
    const src = files.map(read).join("\n");
    const need = ["crm-integrations-page", "crm-integrations-map", "crm-integrations-node-", "crm-integrations-count-enabled", "crm-integrations-count-disabled",
      ...KINDS.map((k) => `crm-integrations-target-${k}`), "crm-integrations-targets-save", "crm-integrations-status-table", "crm-integrations-status-row-", "crm-integrations-jobs", "crm-integrations-job-row-"];
    const miss = need.filter((t) => !src.includes(t));
    const nav = read(NAV_FILE);
    const navOk = /path:\s*"\/crm\/settings\/integrations"[^}]*status:\s*"ready"[^}]*wo:\s*"C3\.6"[^}]*perm:\s*"crm\.settings\.manage"/.test(nav);
    const rowsInv = inv.filter((r) => r?.wo === "C3.6" && String(r?.page ?? "") === "/settings/integrations");
    const wide = files.flatMap((f) => wideUnprefixed(stripComments(read(f))).map((w) => `${f.replace(INT_COMP_DIR, "c")}:${w}`));
    const tables = files.filter((f) => /<table[\s>]/.test(read(f))).filter((f) => !(hasCardAlt(read(f)) || hasScroller(read(f))));
    chk("C3.6-S5.1", "mockup 17: `/crm/settings/integrations` is guarded like every CRM v2 page (type \"CRM\" → requireCrmV2Page → crmCan(… \"crm.settings.manage\") → notFound()) and loads through integrationStatus · map with 24 nodes + enabled/disabled counters · 5 target pickers + save · status table · job health list — every testid present · nav entry (ready · wo C3.6 · perm) · ≥ 8 inventory rows · 390 px: no unprefixed width > 390, tables → cards or a scroller (R-D: C3.7 does not cover this page) [static]",
      page.length > 0 && /type:\s*"CRM"/.test(page) && /requireCrmV2Page/.test(page) && /crm\.settings\.manage/.test(page) && /notFound\(/.test(page) && /integrationStatus\s*\(/.test(src)
      && miss.length === 0 && navOk && rowsInv.length >= 8 && wide.length === 0 && tables.length === 0,
      "guarded · testids · nav · rows · responsive", `page=${page.length > 0} guard=${/requireCrmV2Page/.test(page)} perm=${/crm\.settings\.manage/.test(page)} missing=${miss.join(",") || "-"} nav=${navOk} rows=${rowsInv.length} wide=${wide.join(";") || "-"} tables=${tables.join(",") || "-"}${ABSENT}`, "MAJOR");
  }
  {
    const pSrc = read(P_PAGE);
    const around = [pSrc, ...walk("src/lib/pages"), ...walk("src/components/pages")].map((x) => (x === pSrc ? x : read(x))).join("\n");
    const need = ["page-widget-crm-my-deals", "page-widget-crm-today-tasks", "page-widget-crm-portal", "page-widget-crm-deal-", "page-widget-crm-task-"];
    const miss = need.filter((t) => !around.includes(t));
    const wired = /myDeals\s*\(/.test(pSrc) && /todayTasks\s*\(/.test(pSrc);
    const badClient = [...walk("src/lib/pages"), ...walk("src/components/pages")].filter((f) => /^\s*["']use client["']/.test(read(f)) && /from\s+["'](@\/lib\/core\/db|@prisma\/client|@\/lib\/modules\/crm(\/(?!.*-shared)[^"']*)?)["']/.test(read(f)));
    chk("C3.6-S5.2", "PAGES widgets UI: `/p/[slug]` (behind the staff session — accessFor) loads \"my deals\" and \"today\" with the SESSION actor through crm widgets.myDeals / todayTasks and renders the data widgets (testids for the 3 widgets + their rows) · no 'use client' file of the pages layer imports prisma or a non-shared CRM module [static]",
      miss.length === 0 && wired && /accessFor/.test(pSrc) && badClient.length === 0, "wired · testids", `missing=${miss.join(",") || "-"} wired=${wired} badClient=${badClient.join(",") || "-"}${ABSENT}`, "MAJOR");
  }
  {
    const menu = read(MEMBER_VIEWS_MENU);
    const listActs = read("src/lib/modules/member/members-list-actions.ts");
    const hrFiles = [...walk("src/app/app/sys/[id]/hr"), ...walk("src/components/hr"), "src/lib/modules/hr/ui.tsx"];
    const hrSrc = hrFiles.map(read).join("\n");
    const hrLink = /\/app\/settings\/teams/.test(hrSrc) && /ทีมขาย/.test(hrSrc) && /hr-link-sales-teams/.test(hrSrc);
    chk("C3.6-S5.3", "member views UI: the saved-view menu offers a team picker (testid `member-view-team`) for TEAM views and the list action forwards `teamId` · HR hub has the \"ทีมขาย\" link to /app/settings/teams (testid `hr-link-sales-teams` — R-A: owned by C3.6) [static]",
      /member-view-team/.test(menu) && /teamId/.test(listActs) && hrLink, "team picker · HR link", `picker=${/member-view-team/.test(menu)} action=${/teamId/.test(listActs)} hrLink=${hrLink}${ABSENT}`, "MAJOR");
  }
} catch (e) {
  chk("C3.6-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — every row of the throwaway tenants (4 passes over every table with tenantId), systems/units/tenants, users, the synthetic
  // minute-job state rows. No drainOutbox (fixture events are DONE). No seeded row was touched.
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
  for (const uid of USERS) await del(() => P.appNotification.deleteMany({ where: { recipientUserId: uid } }));
  for (const uid of USERS) await del(() => P.session.deleteMany({ where: { userId: uid } }));
  for (const uid of USERS) await del(() => P.user.delete({ where: { id: uid } }));
  await del(() => P.opsAlertState.deleteMany({ where: { source: { startsWith: "minute-job:" }, AND: [{ source: { contains: TAG } }] } }));
  await del(() => P.opsEvent.deleteMany({ where: { source: "minute-job", message: { startsWith: TAG } } }));
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
    const states = (await P.opsAlertState.count({ where: { source: { contains: TAG } } })) as number;
    const ops = (await P.opsEvent.count({ where: { source: "minute-job", message: { startsWith: TAG } } })) as number;
    chk("C3.6-CLEAN", "the oracle gives the QC database back exactly as found — every throwaway tenant and every row it owned (systems · units · deals · activities · portal access · pages/widgets · customers · saved views · outbox · audit) · the throwaway users · the synthetic minute-job state rows are gone",
      left.length === 0 && tenants === 0 && users === 0 && states === 0 && ops === 0, "0 rows", `${left.join(" · ") || "-"} · tenants=${tenants} users=${users} jobStates=${states} opsEvents=${ops}`, "MAJOR");
  } catch (e) {
    chk("C3.6-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C3.6: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
