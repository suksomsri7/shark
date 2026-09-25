// QC — CRM v2 WO C2.1: automation scope CRM + the SHARED action runner (decision C18) — `src/lib/automation/action-runner.ts` (new) ·
//      move-only refactor of `src/lib/modules/member/journeys.ts` · `src/lib/modules/crm/automation.ts` + `automation-shared.ts` · CRM branch in
//      `src/lib/automation/engine.ts` · UI `src/app/app/sys/[id]/crm/settings/automation/**` + `src/components/crm/automation/**`
// Oracle writer · the C2.1 builder must NOT touch this file · QC database only (.env.qc)
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c2.1.mts
//      `--force-run`      = run every check while the C2.1 artefacts / the C2.0 column are absent — C2.1 checks red, the positive controls
//                           (journeys export baseline · member journey behaviour R.* · v1 KANBAN rule · S6 children) + CLEAN green: proves
//                           the fixtures and the cleanup
//      `--skip-children`  = do not spawn the S6 regression suites (S6.1/S6.2 are then RED "not run" — iteration only, never for sign-off)
// requires: crm-seed   (house style — this oracle reads NO seeded row; everything lives in throwaway tenants `qc-c21-<rand>-*`)
//
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE (not re-implemented here): qc-member-fix-s3 · qc-member-m3.6 · qc-member-m3.10 (imports
//   journeys) · qc-automation · qc-ai-automation · qc-crm-c0.5 · qc-crm-c1.8 · qc-crm-c1.11 · every earlier qc-crm-c1.* · qc-member-m1.9
//   (30/15/10/5). THIS file spawns qc-kanban-k2.9 and qc-member-m3.3 (S6 — CRM-RUN §2 C2.1 S6) before it creates any fixture.
//
// SOURCES: crm-brief-C2.1.md · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-A ISSUE_VOUCHER/GIVE_POINTS via the member adapter only ·
//   R-A object-template "date field due" starter rules materialised by C2.1 · R-C.11 16 automation actions · R-E.5 SEND_EMAIL before C2.5 =
//   plain send · R-E.14 uiVersion 1 ⇒ rules skip, rows kept, resume at 2) · CRM-RUN §2 "C2.1" (S1 3 · S2 6 · S3 6 · S4 8 · S5 3 · S6 2 · S7 2
//   = 30) · MASTER-PLAN §2 §4 (X1 X3 X4 X5 X6 X8 X9) §6 row C2.1 (C18: move the communication-action runner + WAIT lease out of journeys.ts,
//   WEBHOOK through webhookTargetProblem, quota/loop-guard per scope) · blueprint §7.3 (triggers · condition prefixes · 14 actions +
//   CREATE_DEAL · 6 starter rules · dry-run · quota 5,000 per scope) · mockup 07 (top) · decisions C13 C18 · C2.0 addendum R7
//   (AutomationRun.crmContactId + partial UNIQUE(ruleId, crmContactId, eventKey) WHERE crmContactId IS NOT NULL) · C1.8 (CRM events are
//   ids-only; rules load entities by id) · C1.7 (crmCan "crm.automation.manage") · src/lib/modules/crm/ui-version.ts · K2.9 precedent
//   (src/lib/modules/kanban/automation.ts: runForKanbanEvent, dryRun writes nothing, 60 s loop guard, monthly quota) · M3.3 / fix-s3 M7
//   (journeys.ts: eventKeyOf, unique dedupe, WAIT_THEN lease 15 min, consent at send time).
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this) ══════════════════════════════════
//   A. SHARED RUNNER `src/lib/automation/action-runner.ts` (decision C18 — MOVED code, not a copy)
//      exports (runtime): `executeActions` · `runDueWaits` · `eventKeyOf` · `WAIT_LEASE_MS` (= 15 * 60_000) + type `SubjectAdapter`
//        { resolveSubject(evt) · addressOf(subject, channel) · consentOf(subject, channel) /* at SEND time */ · runDomainAction(kind, params, env) }
//      · no static import from "@/lib/modules/*" (adapters are registered/passed in; dynamic import allowed) · it is the ONLY file under src/
//        that defines WAIT_LEASE_MS and the lease claim (updateMany … status "WAITING" … scheduledAt) — journeys.ts and crm/automation.ts
//        import it · the runner's runDueWaits resumes a WAITING row with the adapter of ITS rule's scope (a member-path call never cancels a
//        CRM row and vice versa)
//   B. `src/lib/modules/member/journeys.ts` move-only: runtime exports + arity EXACTLY the baseline below (JOURNEY_BASELINE) · imports
//      "@/lib/automation/action-runner" · behaviour byte-identical (R.* below + qc-member-m3.3 + qc-member-fix-s3 green)
//   C. `src/lib/modules/crm/automation-shared.ts` (pure: no prisma / next / server-only import) exports
//      CRM_RULE_TRIGGERS: readonly { value; label (Thai); cron?: boolean; params?: readonly string[] }[] — every AUTOMATION_EVENTS value that
//        starts with "crm." or "custom.record." + the 5 cron triggers crm.deal.stale{days} · crm.activity.overdue · crm.score.threshold{band} ·
//        crm.deal.close_due{daysBefore} · custom.record.field_due{objectKey, fieldKey, daysBefore}
//      CRM_ACTION_TYPES ⊇ MOVE_STAGE ASSIGN CREATE_ACTIVITY OPEN_KANBAN_CARD SEND_EMAIL SEND_LINE SEND_PUSH ENROLL_SEQUENCE STOP_SEQUENCE
//        SET_FIELD ADD_TAG REMOVE_TAG ADJUST_SCORE NOTIFY_STAFF WEBHOOK WAIT_THEN CREATE_DEAL ISSUE_VOUCHER GIVE_POINTS
//      CRM_STARTER_RULES: 6 × { key; name (Thai); trigger { event, params? }; conditions?; actions } · CRM_AUTOMATION_RUNS_PER_MONTH = 5000
//   D. `src/lib/modules/crm/automation.ts` (ctx { tenantId, systemId, actorUserId } · actor = MemberActor · manage = crmCan "crm.automation.manage"
//      · system re-resolved in the tenant, type CRM, else NOT_FOUND · uiVersion 1 ⇒ every management call refused (assertCrmV2, Thai) · audit
//      `crm.automation.*` with targetId = rule id on every mutation)
//      RuleInput = { name; trigger: { event; params? }; conditions?: { mode: "AND" | "OR"; items: { field; op; value? }[] }; actions:
//        { type; params? }[] (≤ 20, WAIT_THEN days ≤ 90, one nesting level); pipelineId?: string | null; enabled?: boolean }
//        field = `c.<contact col>` | `co.<company col>` | `d.<deal col>` | `f.<contact custom field key>` | `o.<objectKey>` (exists/count) |
//        `o.<objectKey>.<fieldKey>` (any record of the contact matches) · op ∈ eq neq gt gte lt lte between([a,b]) in([..]) contains
//        exists not_exists count_gte count_lte · one level AND/OR · evaluated on DB state loaded BY ID at run time
//      stored row: AutomationRule { scope "CRM", crmSystemId, pipelineId?, event = trigger.event, trigger, conditions, actions, kind "RULE",
//        actionType "NOTIFY" + actionConfig {} placeholders } — the v1 engine never sees it (scope KANBAN filter kept)
//      createRule(ctx, actor, input) → { id } · updateRule(ctx, actor, id, input) · toggleRule(ctx, actor, id, enabled) · deleteRule(ctx, actor,
//        id, { confirm: true, reason ≥ 5 chars }) (X9) · listRules(ctx, actor) · listRuns(ctx, actor, { ruleId? }) · usageThisMonth(ctx) →
//        { used, limit } · applyStarterRules(ctx, actor) → idempotent: the 6 CRM_STARTER_RULES + one custom.record.field_due rule per custom
//        object of the system created from an object template (OBJECT_TEMPLATES[k].starterRule → params { objectKey, fieldKey, daysBefore },
//        NOTIFY owner) — ALL enabled=false · dryRun(ctx, actor, input, { days? }) → { matched: {contactId?, dealId?, recordId?, …}[], total }
//        writes NOTHING (no AutomationRun, no outbox, no audit, no side effect)
//        Validation (Thai error, nothing written): unknown/non-CRM trigger · unknown action · > 20 actions · WAIT_THEN days > 90 · refs outside
//        the tenant/system: MOVE_STAGE stageId · CREATE_DEAL pipelineId · ASSIGN userId (must be a member of the tenant) · OPEN_KANBAN_CARD
//        boardId · WEBHOOK url failing webhookTargetProblem (127.0.0.1 / 169.254.169.254 / localhost)
//      runForCrmEvent(evt { tenantId; systemId?; type; payload; id?; idempotencyKey? }, opts?: { now?: Date; deps?: CrmRuleDeps }) → { runs }
//        never throws · rules = enabled, scope CRM, crmSystemId = evt.systemId (or the system of the entity loaded by id — never another
//        system/tenant), event = type, pipelineId null or = the deal's pipeline · subject contact resolved BY ID (payload.contactId · dealId →
//        deal.contactId · activityId → activity.contactId · recordId → record parent CONTACT, or DEAL → deal.contactId) and it must belong to
//        (evt.tenantId, rule.crmSystemId) · AUTOMATION_EVENTS system uiVersion 1 ⇒ nothing (rows kept) · one main AutomationRun per (rule,
//        contact, eventKey) — X4 via the C2.0 partial unique, insert-first · quota per scope: Tenant.limits.crm.automationRunsPerMonth ??
//        CRM_AUTOMATION_RUNS_PER_MONTH over runs of CRM rules of that system this Thai month ⇒ SKIPPED Thai "โควตา" (member/kanban quotas
//        untouched) · loop guard: a rule re-triggered by its own (or a sibling rule's) action chain stops (SKIPPED with a Thai reason) ·
//        conditions false ⇒ no action (a SKIPPED trace is allowed) · each step failing never stops the next · WAIT_THEN ⇒ WAITING row with
//        crmContactId set · consent at SEND time (consents.canContact; member-linked ⇒ MemberConsent) ⇒ not allowed = step SKIPPED, sender
//        NOT called, Thai reason · addresses: EMAIL = contact.email · LINE = contact.lineUserId, else the linked member's LINE identity ·
//        SEND_PUSH = staff (owner) push · WEBHOOK through webhookTargetProblem, body JSON with ids only · ISSUE_VOUCHER / GIVE_POINTS only
//        through the member adapter when memberCustomerId is set, else SKIPPED Thai (mentions สมาชิก) · ENROLL/STOP_SEQUENCE, ADJUST_SCORE =
//        no-op stubs (step recorded, run not FAILED) · template variables are substituted once ({ชื่อ} = contact name) — never re-expanded
//      CrmRuleDeps = { email?; line?; push?; sms?: (req) => Promise<{ ok; error?; skipped? }>; kanban?: (req { boardId, title, … }) =>
//        Promise<{ ok; cardId? }>; post?: (url, body) => Promise<void> } — QC injects them; defaults = crm outbound sendPlain · chat
//        sendLineToParty · staff push · kanban facade · real fetch (5 s)
//      runDueWaits(opts { now?; tenantId?; deps?; limit? }) → { ran } — thin delegation to the shared runner (CRM rows of a uiVersion-1 system
//        are left WAITING and resume after the flip back to 2)
//      runCronTriggers(opts { now?; tenantId? }) → { runs } — daily: crm.deal.close_due (OPEN deal, expectedCloseAt Thai date = today +
//        daysBefore) · custom.record.field_due (DATE value Thai date = today + daysBefore, record parent = contact) · crm.activity.overdue
//        (dueAt < now, doneAt null) · crm.deal.stale · eventKey per (trigger, entity, Thai day) ⇒ two overlapping runs = one run
//   E. `src/lib/automation/engine.ts`: `runForEvent(evt)` unchanged for v1 (scope KANBAN, boardId null) + CRM branch like the kanban
//      delegation: type starts with "crm." or "custom.record." ⇒ lazy import of "@/lib/modules/crm/automation" → runForCrmEvent (evt may carry
//      id / systemId / idempotencyKey) · `withAutomation` in outbox-consumers.ts forwards id + systemId (block `// CRM C2.1 ▸ … ◂`)
//   F. UI `/app/sys/[id]/crm/settings/automation` (CRM guard → requireCrmV2Page → crmCan crm.automation.manage else notFound) · nav entry
//      path "/crm/settings/automation" status ready wo C2.1 · testids with rows (page "/settings/automation", wo "C2.1") in
//      scripts/crm-ui-inventory.json · "use server" actions: async exports only + assertCrmV2 · client files never reach prisma
//
// WHAT THIS FILE PROVES: S0 structure (static + journeys export baseline) · S1–S7 of CRM-RUN (30) · S8 UI static · S9 brief extras ·
//   R member journeys behave as before (throwaway tenant) · U uiVersion-1 PERMANENT RULE · X1 X3 X4 X5 X6 X8 X9 · CLEAN.
//   n/a: X2 (no REST op / AI tool in C2.1 — ops arrive in C2.11) · X7 (no public endpoint) · X10 (no file / secret).
// HOUSE RULES: SKIP guard before any DB connection · throwaway tenants swept in `finally` (every table with tenantId, 4 passes) + users ·
//   no drainOutbox (our own pump only touches PENDING events of our lab tenant) · outbound fetch stubbed · WEBHOOK_ALLOW_PRIVATE removed
//   from this process · every sender injected · last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const RUNNER = "src/lib/automation/action-runner.ts";
const JOURNEYS = "src/lib/modules/member/journeys.ts";
const CRM_AUTO = "src/lib/modules/crm/automation.ts";
const CRM_AUTO_SH = "src/lib/modules/crm/automation-shared.ts";
const ENGINE = "src/lib/automation/engine.ts";
const CONS_FILE = "src/lib/outbox-consumers.ts";
const PAGE_DIR = "src/app/app/sys/[id]/crm/settings/automation";
const PAGE = `${PAGE_DIR}/page.tsx`;
const COMP_DIR = "src/components/crm/automation";
const NAV_FILE = "src/lib/modules/crm/nav.ts";
const INVENTORY = "scripts/crm-ui-inventory.json";
const SCHEMA_AUTO = "prisma/schema/automation.prisma";
/** runtime exports of journeys.ts at 21a96bb (name → typeof / arity) — the move-only refactor must keep them EXACTLY */
const JOURNEY_BASELINE: Record<string, number | "object"> = {
  JOURNEY_PRESETS: "object", canManageJourneys: 1, createFromPreset: 3, createJourney: 3, deleteJourney: 3, dryRun: 3, dryRunDraft: 3,
  duplicateJourney: 3, emitJourneyCronEvents: 0, getJourney: 3, journeyBuilderOptions: 2, journeyDetail: 3, journeyReportRows: 2,
  journeyStats: 3, listJourneys: 2, runDueWaits: 0, runForEvent: 1, toggleJourney: 4, updateJourney: 4,
};
const REQUIRED_ACTIONS = ["MOVE_STAGE", "ASSIGN", "CREATE_ACTIVITY", "OPEN_KANBAN_CARD", "SEND_EMAIL", "SEND_LINE", "SEND_PUSH", "ENROLL_SEQUENCE",
  "STOP_SEQUENCE", "SET_FIELD", "ADD_TAG", "REMOVE_TAG", "ADJUST_SCORE", "NOTIFY_STAFF", "WEBHOOK", "WAIT_THEN", "CREATE_DEAL", "ISSUE_VOUCHER", "GIVE_POINTS"];
const CRON_TRIGGERS: Record<string, string[]> = {
  "crm.deal.stale": ["days"], "crm.activity.overdue": [], "crm.score.threshold": ["band"], "crm.deal.close_due": ["daysBefore"],
  "custom.record.field_due": ["objectKey", "fieldKey", "daysBefore"],
};

const ARGV = process.argv.slice(2);
const FORCE = ARGV.includes("--force-run");
const SKIP_CHILDREN = ARGV.includes("--skip-children");
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
// SKIP guard — C2.1 not built, or its prerequisite C2.0 column absent ⇒ SKIPPED, no DB connection opened.
// ═══════════════════════════════════════════════════════════════════════════════════
const BUILT = existsSync(RUNNER) || existsSync(CRM_AUTO);
const runBlock = /model AutomationRun \{[\s\S]*?\n\}/.exec(read(SCHEMA_AUTO))?.[0] ?? "";
const C20 = /\bcrmContactId\b/.test(runBlock) && (existsSync("prisma/migrations") ? readdirSync("prisma/migrations").some((d) => /_crm_v2_b$/.test(d)) : false);
if (!FORCE && (!BUILT || !C20)) {
  const why = !BUILT
    ? `WO C2.1 not built yet (${RUNNER} and ${CRM_AUTO} missing)${C20 ? "" : " — and its prerequisite C2.0 (AutomationRun.crmContactId · migration *_crm_v2_b) is absent too"}`
    : "prerequisite C2.0 absent: AutomationRun.crmContactId / prisma/migrations/*_crm_v2_b not in the tree (C2.1 is built AFTER C2.0)";
  console.log(`⚠️  SKIPPED — ${why} (run with --force-run to exercise the fixtures and the cleanup)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
delete process.env.WEBHOOK_ALLOW_PRIVATE; // X6: the SSRF guard must be live in this process

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c21-${rand}`;
const FETCHES: string[] = [];
globalThis.fetch = (async (input: Any): Promise<Response> => {
  FETCHES.push(typeof input === "string" ? input : String(input?.url ?? input));
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

// ─────────────────────────── harness ───────────────────────────
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const cut = (v: unknown, n = 240) => { const s = String(v ?? ""); return s.length > n ? `${s.slice(0, n)}…` : s; };
const j = (v: Any): string =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x)) ?? "undefined";
const thai = (s: unknown) => /[ก-๙]/.test(String(s ?? ""));
type Res = { ok: boolean; v: Any; err: string; code: string; msg: string };
const call = async (fn: Any, ...args: Any[]): Promise<Res> => {
  if (typeof fn !== "function") return { ok: false, v: undefined, err: "MISSING_FUNCTION", code: "MISSING_FUNCTION", msg: "" };
  try {
    return { ok: true, v: await fn(...args), err: "", code: "", msg: "" };
  } catch (e) {
    const x = e as Any;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, v: undefined, err: `${x?.name ?? "Error"}(${x?.code ?? "-"}): ${cut(msg, 160)}`, code: String(x?.code ?? ""), msg };
  }
};
const refusedThai = (r: Res) => !r.ok && r.code !== "MISSING_FUNCTION" && thai(r.msg);
const DAY = 86_400_000;
const thaiYmd = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

console.log(`\n═══ QC CRM v2 · C2.1 — automation scope CRM + shared action runner ═══`);
console.log(`[env] DB ${host} · tag ${TAG}${FORCE && (!BUILT || !C20) ? ` · --force-run with ${!BUILT ? "C2.1 ABSENT" : "C2.0 column ABSENT"} (C2.1 checks expected red; positive controls + CLEAN green)` : ""}\n`);

// ═════════════════════════════════════════════════════════════════════════════
// S6 — regressions K2.9 + M3.3 as child processes, BEFORE any fixture exists (they drain the shared outbox)
// ═════════════════════════════════════════════════════════════════════════════
console.log("── S6 · regressions (child processes) ──");
const runChild = (file: string) =>
  new Promise<{ code: number | null; out: string }>((done) => {
    const ch = spawn("pnpm", ["exec", "tsx", file], { env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=1536" }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    ch.stdout.on("data", (d) => { out += String(d); });
    ch.stderr.on("data", (d) => { out += String(d); });
    ch.on("close", (code) => done({ code, out }));
    ch.on("error", (e) => done({ code: -1, out: String(e) }));
  });
/** baseline measured 19 Sep 2569 on session/crm 21a96bb (before C2.1): only these screenshot-evidence checks fail in a worktree without .qc-shots */
const S6_BASELINE: Record<string, { total: number; allowed: string[] }> = {
  "scripts/qc-kanban-k2.9.mts": { total: 26, allowed: ["K2.9-S11.7"] },
  "scripts/qc-member-m3.3.mts": { total: 32, allowed: ["M3.3-S9.2", "M3.3-S9.3"] },
};
for (const [id, file] of [["C2.1-S6.1", "scripts/qc-kanban-k2.9.mts"], ["C2.1-S6.2", "scripts/qc-member-m3.3.mts"]] as const) {
  let res = { code: -2 as number | null, out: "not run (--skip-children)" };
  if (!SKIP_CHILDREN) res = existsSync(file) ? await runChild(file) : { code: -3, out: "file missing" };
  const line = res.out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY ")) ?? "";
  let sum: Any = null;
  try { sum = JSON.parse(line.slice("JSON_SUMMARY ".length)); } catch { sum = null; }
  const base = S6_BASELINE[file];
  const failed = ((sum?.findings ?? []) as Any[]).map((f) => (typeof f === "string" ? f : String(f?.id ?? "")));
  const unexpected = failed.filter((f) => !base.allowed.includes(f));
  chk(id, `regression ${file} (child process, same gate lock) → JSON_SUMMARY not skipped · total ≥ ${base.total} · every failure is one of the pre-existing screenshot-evidence checks (${base.allowed.join(", ")} — they read .qc-shots/, absent in this worktree)`,
    !!sum && sum.skipped !== true && Number(sum.total) >= base.total && unexpected.length === 0 && Number(sum.passed) + failed.length === Number(sum.total), "green except baseline visuals",
    `exit=${res.code} unexpected=${unexpected.join(",") || "-"} ${line ? cut(line, 200) : cut(res.out.slice(-200), 200)}`);
}

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TENANTS: string[] = [];
const USERS: string[] = [];
const PII: string[] = [];
const pii = <T extends string>(s: T): T => { PII.push(s); return s; };
let seq = 0;
const nx = () => `${++seq}`;
let phoneSeq = 0;
const phoneOf = (): string => pii(`08${String((Math.floor(Math.random() * 9_000_000) + 1_000_000) * 10 + (phoneSeq++ % 10)).padStart(8, "0").slice(-8)}`);
const mailOf = (s: string) => pii(`${TAG}-${s}@qc-crm.example`);
const NONE = `${TAG}-none`;

try {
  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — structure (static + journeys export baseline)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S0 · structure ──");
  const RUN = (await import("@/lib/automation/action-runner" as string).catch(() => ({}))) as Any;
  const AUTO = (await import("@/lib/modules/crm/automation" as string).catch(() => ({}))) as Any;
  const ASH = (await import("@/lib/modules/crm/automation-shared" as string).catch(() => ({}))) as Any;
  const JRN = (await import("@/lib/modules/member/journeys" as string)) as Any;
  const MEM = (await import("@/lib/modules/member" as string)) as Any;
  const ENG = (await import("@/lib/automation/engine" as string)) as Any;
  const LAB = (await import("@/lib/automation/labels" as string)) as Any;
  const OBX = (await import("@/lib/outbox-consumers" as string)) as Any;
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => ({}))) as Any;
  const OBJT = (await import("@/lib/modules/crm/templates/objects" as string).catch(() => ({}))) as Any;
  const CONS: Any = OBX.consumers ?? {};
  const CT = CRM.contacts ?? {};
  const D = CRM.deals ?? {};
  const AC = CRM.activities ?? {};
  const OBJ = CRM.objects ?? {};
  const runnerSrc = read(RUNNER);
  const jrnSrc = read(JOURNEYS);
  const autoSrc = read(CRM_AUTO);
  const shSrc = read(CRM_AUTO_SH);
  const engSrc = read(ENGINE);
  const consSrc = read(CONS_FILE);
  {
    const fns = ["executeActions", "runDueWaits", "eventKeyOf"].filter((f) => typeof RUN?.[f] !== "function");
    chk("C2.1-S0.1", "action-runner.ts exists and exports executeActions · runDueWaits · eventKeyOf (functions) · WAIT_LEASE_MS = 15 min · the SubjectAdapter type (resolveSubject/addressOf/consentOf/runDomainAction)",
      runnerSrc.length > 0 && fns.length === 0 && RUN?.WAIT_LEASE_MS === 15 * 60_000 && /SubjectAdapter/.test(runnerSrc) && ["resolveSubject", "addressOf", "consentOf", "runDomainAction"].every((k) => runnerSrc.includes(k)),
      "exports", `exists=${runnerSrc.length > 0} missing=${fns.join(",") || "-"} lease=${RUN?.WAIT_LEASE_MS}`);
  }
  {
    const leaseDefs = walk("src").filter((f) => /\bWAIT_LEASE_MS\s*=/.test(read(f)));
    const modImports = (runnerSrc.match(/^\s*import[^;]*from\s+["']@\/lib\/modules\/[^"']+["']/gm) ?? []);
    chk("C2.1-S0.2", "ONE lease/claim implementation (C18): WAIT_LEASE_MS is defined only in action-runner.ts, which holds the WAITING claim (updateMany … WAITING … scheduledAt) and has no static import from @/lib/modules/* [static]",
      leaseDefs.length === 1 && leaseDefs[0] === RUNNER && /updateMany[\s\S]{0,300}WAITING[\s\S]{0,200}scheduledAt/.test(runnerSrc) && modImports.length === 0,
      `only ${RUNNER}`, `defs=${leaseDefs.join(",") || "-"} claim=${/updateMany[\s\S]{0,300}WAITING[\s\S]{0,200}scheduledAt/.test(runnerSrc)} modImports=${cut(modImports.join(" "), 120) || "-"}`);
  }
  {
    const now = Object.keys(JRN).sort();
    const diff: string[] = [];
    for (const [k, want] of Object.entries(JOURNEY_BASELINE)) {
      const got = typeof JRN[k] === "function" ? JRN[k].length : typeof JRN[k] === "object" && JRN[k] ? "object" : "missing";
      if (got !== want) diff.push(`${k}:${want}→${got}`);
    }
    const extra = now.filter((k) => !(k in JOURNEY_BASELINE));
    const facade = ["runForEvent", "runDueWaits", "emitJourneyCronEvents", "createJourney", "toggleJourney", "journeyDetail"].filter((k) => typeof MEM?.[k] !== "function");
    chk("C2.1-S0.3", "journeys.ts move-only: its runtime exports (19 names) and every function arity are EXACTLY the 21a96bb baseline, and the member facade still exports runForEvent/runDueWaits/emitJourneyCronEvents/createJourney/toggleJourney/journeyDetail (positive control: green before the refactor too)",
      diff.length === 0 && extra.length === 0 && facade.length === 0, "identical", `diff=${diff.join(" ") || "-"} extra=${extra.join(",") || "-"} facadeMissing=${facade.join(",") || "-"}`);
  }
  chk("C2.1-S0.4", "journeys.ts imports the shared runner (@/lib/automation/action-runner) and no longer holds its own lease constant / WAITING claim / channel send loop [static]",
    /from\s+["']@\/lib\/automation\/action-runner["']/.test(jrnSrc) && !/\bWAIT_LEASE_MS\s*=/.test(jrnSrc) && !/status:\s*"WAITING",\s*scheduledAt:\s*w\.scheduledAt/.test(jrnSrc),
    "delegates", `imports=${/from\s+["']@\/lib\/automation\/action-runner["']/.test(jrnSrc)} ownLease=${/\bWAIT_LEASE_MS\s*=/.test(jrnSrc)}`);
  {
    const need = ["createRule", "updateRule", "toggleRule", "deleteRule", "listRules", "listRuns", "usageThisMonth", "applyStarterRules", "dryRun", "runForCrmEvent", "runDueWaits", "runCronTriggers"];
    const missing = need.filter((f) => typeof AUTO?.[f] !== "function");
    const shImpure = /from\s+["'](@prisma\/client|@\/lib\/core\/db|next\/[^"']+|server-only|\.\/db|\.\/automation)["']/.test(shSrc);
    chk("C2.1-S0.5", "crm/automation.ts exports the 12 contract functions · automation-shared.ts exists and is pure (no prisma / next / server-only / db import) · crm/automation.ts imports the shared runner and defines no lease/claim of its own",
      missing.length === 0 && shSrc.length > 0 && !shImpure && /["']@\/lib\/automation\/action-runner["']/.test(autoSrc) && !/\bWAIT_LEASE_MS\s*=/.test(autoSrc) && !/updateMany[\s\S]{0,200}"WAITING"/.test(autoSrc),
      "12 fns · pure shared · runner reused", `missing=${missing.join(",") || "-"} shared=${shSrc.length > 0} impure=${shImpure} runner=${/["']@\/lib\/automation\/action-runner["']/.test(autoSrc)}`);
  }
  chk("C2.1-S0.6", "engine.ts keeps the v1 filter (scope \"KANBAN\", boardId null) and adds a CRM branch like the kanban delegation: lazy import(\"@/lib/modules/crm/automation\") for crm.* / custom.record.* [static]",
    /scope:\s*"KANBAN"/.test(engSrc) && /boardId:\s*null/.test(engSrc) && /import\(\s*["']@\/lib\/modules\/crm\/automation["']\s*\)/.test(engSrc) && /["']crm\.["']/.test(engSrc) && /custom\.record\./.test(engSrc),
    "v1 filter + lazy CRM branch", `v1=${/scope:\s*"KANBAN"/.test(engSrc)} lazy=${/import\(\s*["']@\/lib\/modules\/crm\/automation["']\s*\)/.test(engSrc)}`);
  chk("C2.1-S0.7", "outbox-consumers.ts: withAutomation forwards the event id and systemId to the engine inside a `// CRM C2.1 ▸ … ◂` block [static]",
    /CRM C2\.1 ▸/.test(consSrc) && /runForEvent\(\s*\{[^}]*\bid:\s*evt\.id[^}]*\}/.test(consSrc) && /runForEvent\(\s*\{[^}]*systemId/.test(consSrc),
    "block + id + systemId", `block=${/CRM C2\.1 ▸/.test(consSrc)} id=${/runForEvent\(\s*\{[^}]*\bid:\s*evt\.id[^}]*\}/.test(consSrc)}`, "MINOR");
  {
    const src = [autoSrc, runnerSrc, engSrc].join("\n");
    const miss = ["X1", "X3", "X4", "X5", "X6", "X8", "X9"].filter((x) => !new RegExp(`AUDIT-CLASS ${x}\\b`).test(src));
    chk("C2.1-S0.8", "implementation sites marked `// AUDIT-CLASS X1 X3 X4 X5 X6 X8 X9` in the owned files [static]", miss.length === 0, "7 markers", miss.join(",") || "-", "MINOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — throwaway tenants: A (2 CRM + member + kanban) · B (foreign) · V (uiVersion 1) · L (loop lab) · Q (quota)
  // ═════════════════════════════════════════════════════════════════════════════
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const mkUser = async (suffix: string) => {
    const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix || "owner"} ${TAG}` } });
    USERS.push(u.id);
    return u.id as string;
  };
  const userA = await mkUser("");
  const userM = await mkUser("-mgr");
  const userS = await mkUser("-staff");
  const userX = await mkUser("-outsider");
  const mkTenant = async (suffix: string) => {
    const t = await P.tenant.create({ data: { name: `${TAG}-${suffix}`, slug: `${TAG}-${suffix}` } });
    TENANTS.push(t.id);
    await P.membership.create({ data: { userId: userA, tenantId: t.id, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    await P.membership.create({ data: { userId: userM, tenantId: t.id, role: "MANAGER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    await P.membership.create({ data: { userId: userS, tenantId: t.id, role: "STAFF", unitAccess: ["*"], permissions: { "crm.contact.read": true, "crm.deal.read": true }, acceptedAt: new Date() } });
    return t.id as string;
  };
  const mk = async (tid: string, type: string, label: string) => (await sysSvc.createSystem(tid, type, `${label} ${TAG}`)).id as string;
  const setCrm = (sysId: string, obj: Record<string, unknown>) =>
    P.$executeRawUnsafe(
      `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
        (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
      JSON.stringify(obj), sysId);
  const owner = { userId: userA, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> };
  const staff = { userId: userS, role: "STAFF", unitAccess: ["*"] as string[], permissions: { "crm.contact.read": true, "crm.deal.read": true } as Record<string, unknown> };

  const tidA = await mkTenant("a");
  const crmA = await mk(tidA, "CRM", "CRM");
  const crmA2 = await mk(tidA, "CRM", "CRM สอง");
  const crmS = await mk(tidA, "CRM", "CRM เริ่มต้น");
  const crmS2 = await mk(tidA, "CRM", "CRM เริ่มต้น 2");
  const memA = await mk(tidA, "MEMBER", "สมาชิก");
  const kanA = await mk(tidA, "KANBAN", "บอร์ด");
  const tidB = await mkTenant("b");
  const crmB = await mk(tidB, "CRM", "CRM-B");
  const kanB = await mk(tidB, "KANBAN", "บอร์ด-B");
  const tidV = await mkTenant("v1");
  const crmV = await mk(tidV, "CRM", "CRM-V1");
  const memV = await mk(tidV, "MEMBER", "สมาชิก-V1");
  const tidL = await mkTenant("lab");
  const crmL = await mk(tidL, "CRM", "CRM-LAB");
  const tidQ = await mkTenant("q");
  const crmQ = await mk(tidQ, "CRM", "CRM-Q");
  const memQ = await mk(tidQ, "MEMBER", "สมาชิก-Q");
  for (const s of [crmA, crmA2, crmS, crmS2, crmB, crmL, crmQ]) await setCrm(s, { uiVersion: 2, bridgesEnabled: true });
  await setCrm(crmV, { uiVersion: 2, bridgesEnabled: true }); // flipped to 1 in section U after its rows exist
  const cA = { tenantId: tidA, systemId: crmA, actorUserId: userA };
  const cA2 = { tenantId: tidA, systemId: crmA2, actorUserId: userA };
  const cS = { tenantId: tidA, systemId: crmS, actorUserId: userA };
  const cS2 = { tenantId: tidA, systemId: crmS2, actorUserId: userA };
  const cB = { tenantId: tidB, systemId: crmB, actorUserId: userA };
  const cV = { tenantId: tidV, systemId: crmV, actorUserId: userA };
  const cL = { tenantId: tidL, systemId: crmL, actorUserId: userA };
  const cQ = { tenantId: tidQ, systemId: crmQ, actorUserId: userA };
  const boardA = (await P.kanbanBoard.create({ data: { tenantId: tidA, systemId: kanA, name: `บอร์ด ${TAG}` } })).id as string;
  const boardB = (await P.kanbanBoard.create({ data: { tenantId: tidB, systemId: kanB, name: `บอร์ด-B ${TAG}` } })).id as string;

  const STD = [
    { name: "ผู้สนใจใหม่", kind: "OPEN", probability: 10 }, { name: "คุยความต้องการ", kind: "OPEN", probability: 30 }, { name: "เสนอราคา", kind: "OPEN", probability: 60 },
    { name: "ชนะ", kind: "WON", probability: 100 }, { name: "แพ้", kind: "LOST", probability: 0 },
  ];
  const mkPipe = async (tid: string, sys: string, name: string) => {
    const p = (await P.crmPipeline.create({
      data: { tenantId: tid, systemId: sys, name: `${name} ${TAG}`, stages: { create: STD.map((s, i) => ({ tenantId: tid, systemId: sys, sortOrder: i, ...s })) } },
      include: { stages: true },
    })) as Any;
    return { id: p.id as string, st: [...(p.stages as Any[])].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.id as string) };
  };
  const pA = await mkPipe(tidA, crmA, "ขาย");
  const pA2 = await mkPipe(tidA, crmA, "ต่ออายุ");
  const pX = await mkPipe(tidA, crmA2, "ระบบสอง");
  const pB = await mkPipe(tidB, crmB, "ขาย-B");
  const pV = await mkPipe(tidV, crmV, "ขาย-V");
  const pL = await mkPipe(tidL, crmL, "ขาย-LAB");
  const pS = await mkPipe(tidA, crmS, "ขาย-S");
  const pQ = await mkPipe(tidQ, crmQ, "ขาย-Q");
  void pB; void pV; void pQ;

  const mkParty = async (tid: string, name: string) => (await P.party.create({ data: { tenantId: tid, name, kind: "PERSON" } })).id as string;
  const rawContact = async (tid: string, sys: string, label: string, extra: Record<string, Any> = {}) => {
    const name = pii(`${label} ${TAG}-${nx()}`);
    const phone = phoneOf();
    const partyId = await mkParty(tid, name);
    return (await P.crmContact.create({ data: { tenantId: tid, systemId: sys, name, firstName: name, phone, partyId, ownerUserId: userA, ...extra } })).id as string;
  };
  const grant = (tid: string, sys: string, contactId: string, channel: string, granted = true) =>
    P.crmContactConsent.create({ data: { tenantId: tid, systemId: sys, contactId, channel, granted, source: "STAFF" } });
  const idOf = (v: Any): string => {
    const x = typeof v === "string" ? v : (v?.contact?.id ?? v?.deal?.id ?? v?.rule?.id ?? v?.id ?? "");
    return typeof x === "string" && x ? x : NONE;
  };
  const rawDeal = async (c: Any, contactId: string, pipe: { id: string; st: string[] }, extra: Record<string, Any> = {}, stageIdx = 0) =>
    (await P.crmDeal.create({ data: { tenantId: c.tenantId, systemId: c.systemId, contactId, pipelineId: pipe.id, stageId: pipe.st[stageIdx], title: `ดีล ${TAG}-${nx()}`, valueSatang: 100_000, ownerUserId: userA, ...extra } })).id as string;
  const svcDeal = async (c: Any, contactId: string, pipe: { id: string; st: string[] }, stageIdx = 0) => {
    const r = await call(D.createDeal, c, owner, { pipelineId: pipe.id, stageId: pipe.st[stageIdx], title: `ดีล ${TAG}-${nx()}`, contactId, valueSatang: 100_000 });
    const id = idOf(r.v);
    return id !== NONE && (await P.crmDeal.findFirst({ where: { id } })) ? id : rawDeal(c, contactId, pipe, {}, stageIdx);
  };
  const tagsOf = async (contactId: string): Promise<string[]> => ((await P.crmContact.findFirst({ where: { id: contactId }, select: { tags: true } }))?.tags ?? []) as string[];
  const hasTag = async (contactId: string, t: string) => (await tagsOf(contactId)).includes(t);

  /** rule through the service; the RAW row of the contract only when the service is missing/refuses (fixture fallback — S-checks judge the service) */
  const RULES: string[] = [];
  const rawRule = async (c: Any, input: Any, enabled = true) => {
    const row = await P.automationRule.create({
      data: {
        tenantId: c.tenantId, name: input.name, event: input.trigger.event, enabled, actionType: "NOTIFY", actionConfig: {}, scope: "CRM",
        crmSystemId: c.systemId, pipelineId: input.pipelineId ?? null, kind: "RULE", trigger: input.trigger,
        conditions: input.conditions ?? { mode: "AND", items: [] }, actions: input.actions,
      },
    });
    RULES.push(row.id);
    return row.id as string;
  };
  const SERVICE_FAIL: string[] = [];
  const mkRule = async (c: Any, input: Any) => {
    const full = { enabled: true, ...input, name: input.name ?? `กฎ ${TAG}-${nx()}` };
    const r = await call(AUTO.createRule, c, owner, full);
    const id = idOf(r.v);
    if (r.ok && id !== NONE && (await P.automationRule.findFirst({ where: { id } }))) {
      RULES.push(id);
      if (full.enabled === false) await call(AUTO.toggleRule, c, owner, id, false);
      return id;
    }
    SERVICE_FAIL.push(`${full.name}:${r.err || "no id"}`);
    return rawRule(c, full, full.enabled !== false);
  };
  const SENT: { ch: string; req: Any }[] = [];
  const POSTS: { url: string; body: Any }[] = [];
  const send = (ch: string) => async (req: Any) => { SENT.push({ ch, req }); return { ok: true }; };
  const DEPS = {
    email: send("EMAIL"), line: send("LINE"), push: send("PUSH"), sms: send("SMS"),
    kanban: async (req: Any) => { SENT.push({ ch: "KANBAN", req }); return { ok: true, cardId: `${TAG}-card-${nx()}` }; },
    post: async (url: string, body: Any) => { POSTS.push({ url, body }); },
  };
  const sent = (ch: string, needle: string) => SENT.filter((s) => s.ch === ch && j(s.req).includes(needle)).length;
  const NOW = new Date();
  const ev = (tid: string, sys: string, type: string, payload: Record<string, unknown>, key?: string) => {
    const n = nx();
    return { id: `${TAG}-ev-${n}`, tenantId: tid, systemId: sys, type, payload, idempotencyKey: key ?? `${type}#${TAG}#${n}` };
  };
  const runCrm = (evt: Any, now: Date = NOW) => call(AUTO.runForCrmEvent, evt, { now, deps: DEPS });
  const waits = (opts: Record<string, unknown>) => call(AUTO.runDueWaits, { deps: DEPS, ...opts });
  const cron = (opts: Record<string, unknown>) => call(AUTO.runCronTriggers, opts);
  const runsOf = async (ruleId: string) => (await P.automationRun.findMany({ where: { ruleId }, orderBy: { createdAt: "asc" } })) as Any[];
  const mainRuns = async (ruleId: string, status: string[] = ["OK", "FAILED"]) => (await runsOf(ruleId)).filter((r) => r.stepIndex === null && status.includes(r.status));
  /** main runs of (rule, contact) through the C2.0 column — [] while the column is absent */
  const runsFor = async (ruleId: string, contactId: string, status: string[] = ["OK", "FAILED"]) =>
    ((await P.$queryRawUnsafe(`SELECT "id","status","detail","payload","eventKey","stepIndex" FROM "AutomationRun" WHERE "ruleId" = $1 AND "crmContactId" = $2`, ruleId, contactId).catch(() => [])) as Any[])
      .filter((r) => r.stepIndex === null && status.includes(r.status));
  const actsOf = (contactId: string) => P.crmActivity.count({ where: { contactId } }) as Promise<number>;
  const waitingOf = async (ruleId: string) => (await runsOf(ruleId)).filter((r) => r.status === "WAITING");
  const tenantTables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[])
    .map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
  const footprint = async (tid: string) => {
    const parts: string[] = [];
    for (const t of tenantTables) {
      const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid).catch(() => [{ n: 0 }])) as Any[];
      parts.push(`${t}=${r?.[0]?.n ?? 0}`);
    }
    return parts;
  };
  const evtOf = (row: Any) => ({ id: row.id, tenantId: row.tenantId, type: row.type, payload: row.payload, systemId: row.systemId, unitId: row.unitId, idempotencyKey: row.idempotencyKey });
  const consume = (evt: Any) => call(CONS?.[evt?.type], evt);
  /** our own drain of ONE lab tenant: PENDING crm.* / custom.record.* rows → consumer → DONE; quiet = no pending left */
  const pump = async (tid: string, rounds = 25) => {
    let handled = 0;
    for (let i = 0; i < rounds; i += 1) {
      const rows = (await P.outboxEvent.findMany({ where: { tenantId: tid, status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 200 })) as Any[];
      if (rows.length === 0) return { quiet: true, rounds: i, handled };
      for (const row of rows) {
        await consume(evtOf(row));
        await P.outboxEvent.update({ where: { id: row.id }, data: { status: "DONE", processedAt: new Date() } }).catch(() => null);
        handled += 1;
      }
    }
    return { quiet: false, rounds, handled };
  };

  // custom contact field `budget` (objectKey contact) + the "vehicle" object from its template (fields through the C1.2a/C1.2b engines)
  const mkBudgetField = async (tid: string, sys: string) => {
    const sec = await P.memberSection.create({ data: { tenantId: tid, systemId: sys, key: `qcsec${nx()}`, label: "ทดสอบ", objectKey: "contact" } });
    return (await P.memberField.create({ data: { tenantId: tid, systemId: sys, sectionId: sec.id, key: "budget", label: "งบประมาณ", type: "NUMBER", objectKey: "contact", filterable: true } })).id as string;
  };
  const budgetA = await mkBudgetField(tidA, crmA);
  const setBudget = (tid: string, contactId: string, fieldId: string, n: number) =>
    P.customRecordValue.create({ data: { tenantId: tid, recordType: "CONTACT", recordId: contactId, fieldId, valueNumber: n } });
  const VT = ((OBJT.OBJECT_TEMPLATES ?? []) as Any[]).find((t) => t.key === "vehicle") ?? null;
  const vFields = VT ? (VT.sections as Any[]).flatMap((s) => s.fields as Any[]) : [];
  const vTextKey: string = (vFields.find((f) => f.type === "TEXT" && f.key !== VT?.titleFieldKey) ?? vFields.find((f) => f.type === "TEXT"))?.key ?? "brand";
  const mkVehicleObject = async (c: Any) => {
    const r = await call(OBJ.create, c, owner, { key: "vehicle", label: VT?.label ?? "รถ", labelPlural: VT?.labelPlural ?? "รถ", parentType: "CONTACT", titleFieldKey: VT?.titleFieldKey ?? "plate", templateKey: "vehicle" });
    const row = await P.customObject.findFirst({ where: { systemId: c.systemId, key: "vehicle" } });
    return { ok: r.ok && !!row, id: (row?.id as string) ?? NONE, err: r.err };
  };
  const vehA = await mkVehicleObject(cA);
  const fieldIdOf = async (sys: string, objectKey: string, key: string) => ((await P.memberField.findFirst({ where: { systemId: sys, objectKey, key } }))?.id as string) ?? null;
  const mkVehicle = async (c: Any, contactId: string, values: Record<string, unknown>) => {
    const r = await call(OBJ.records?.create, c, owner, "vehicle", { parentId: contactId, title: `รถ ${TAG}-${nx()}`, values });
    const id = idOf(r.v?.record ?? r.v);
    if (id !== NONE && (await P.customRecord.findFirst({ where: { id } }))) return id;
    // fixture fallback: raw record + values (objects service refused — judged by C1.2b's own oracle, not here)
    const obj = await P.customObject.findFirst({ where: { systemId: c.systemId, key: "vehicle" } });
    if (!obj) return NONE;
    const rec = await P.customRecord.create({ data: { tenantId: c.tenantId, systemId: c.systemId, objectId: obj.id, parentType: "CONTACT", parentId: contactId, title: `รถ ${TAG}-${nx()}` } });
    for (const [k, v] of Object.entries(values)) {
      const fid = await fieldIdOf(c.systemId, "vehicle", k);
      if (!fid) continue;
      await P.customRecordValue.create({ data: { tenantId: c.tenantId, recordType: "CUSTOM", recordId: rec.id, fieldId: fid, ...(/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? { valueDate: new Date(`${v}T00:00:00.000Z`) } : { valueText: String(v) }) } });
    }
    return rec.id as string;
  };

  // ═════════════════════════════════════════════════════════════════════════════
  // R — member journeys behave exactly as before (positive control: green before AND after the move-only refactor)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── R · member journeys unchanged (throwaway tenant) ──");
  const MSENT: { ch: string; req: Any }[] = [];
  const mDeps = { line: async (req: Any) => { MSENT.push({ ch: "LINE", req }); return { ok: true }; }, email: async (req: Any) => { MSENT.push({ ch: "EMAIL", req }); return { ok: true }; } };
  const mCtx = (tid: string, sys: string) => ({ tenantId: tid, systemId: sys, actorUserId: userA });
  const mkCustomer = async (tid: string, memSys: string, label: string, line = true, consent: boolean | null = true) => {
    const cu = await P.customer.create({ data: { tenantId: tid, memberSystemId: memSys, name: pii(`${label} ${TAG}-${nx()}`), memberCode: `${TAG}-m${nx()}` } });
    const ext = `U${TAG.replace(/-/g, "")}${nx()}`;
    if (line) await P.memberChannelIdentity.create({ data: { tenantId: tid, customerId: cu.id, channel: "LINE", externalId: ext, linkedBy: "MANUAL" } });
    if (consent !== null) await P.memberConsent.create({ data: { tenantId: tid, customerId: cu.id, channel: "LINE", granted: consent, source: "STAFF", grantedAt: new Date() } });
    return { id: cu.id as string, ext };
  };
  const jIn = (name: string, actions: Any[]) => ({ name: `${name} ${TAG}`, trigger: { event: "member.created" }, conditions: { groups: [] }, actions, holdoutPct: 0, reentryDays: null, enabled: true });
  const jR = await call(JRN.createJourney, mCtx(tidA, memA), owner, jIn("journey R", [
    { type: "ADD_TAG", params: { tag: `r-${rand}` } }, { type: "SEND_LINE", params: { template: "สวัสดี {ชื่อ}" } },
    { type: "WAIT_THEN", params: { days: 1, thenActions: [{ type: "SEND_LINE", params: { template: "ตามต่อ" } }] } },
  ]));
  const jRid = idOf(jR.v);
  const cuR1 = await mkCustomer(tidA, memA, "สมาชิก R1");
  const cuR2 = await mkCustomer(tidA, memA, "สมาชิก R2");
  const mEvt = (tid: string, customerId: string) => ({ tenantId: tid, type: "member.created", payload: { customerId }, idempotencyKey: `member.created#${customerId}#${TAG}` });
  {
    const r = await call(JRN.runForEvent, mEvt(tidA, cuR1.id), { now: NOW, deps: mDeps });
    const cu = await P.customer.findFirst({ where: { id: cuR1.id } });
    const w = (await P.automationRun.findMany({ where: { ruleId: jRid, customerId: cuR1.id, status: "WAITING" } })) as Any[];
    chk("C2.1-R.1", "member journey (ADD_TAG · SEND_LINE · WAIT_THEN 1 {SEND_LINE}) → runs 1 · tag on the customer · LINE sent to the member's LINE identity · one WAITING row (positive control)",
      jR.ok && r.ok && r.v?.runs === 1 && j(cu?.tags).includes(`r-${rand}`) && MSENT.filter((s) => s.req?.to === cuR1.ext).length === 1 && w.length === 1,
      "1 run · tag · 1 LINE · 1 WAITING", `create=${jR.err || "ok"} run=${r.err || j(r.v)} tags=${j(cu?.tags)} line=${MSENT.filter((s) => s.req?.to === cuR1.ext).length} waiting=${w.length}`);
    const again = [await call(JRN.runForEvent, mEvt(tidA, cuR1.id), { now: NOW, deps: mDeps }), ...(await Promise.all(Array.from({ length: 4 }, () => call(JRN.runForEvent, mEvt(tidA, cuR1.id), { now: NOW, deps: mDeps }))))];
    const main = (await P.automationRun.findMany({ where: { ruleId: jRid, customerId: cuR1.id, stepIndex: null } })) as Any[];
    chk("C2.1-R.2", "same member event again (1 sequential + 4 parallel) → runs 0 each · still ONE main run · no second LINE (positive control)",
      again.every((x) => x.ok && x.v?.runs === 0) && main.length === 1 && MSENT.filter((s) => s.req?.to === cuR1.ext).length === 1, "deduped",
      `runs=${again.map((x) => x.v?.runs ?? x.err).join(",")} main=${main.length}`);
    await call(JRN.runForEvent, mEvt(tidA, cuR2.id), { now: NOW, deps: mDeps });
    await P.memberConsent.updateMany({ where: { customerId: cuR2.id, channel: "LINE" }, data: { granted: false, revokedAt: new Date() } });
    const later = new Date(NOW.getTime() + 2 * DAY);
    const par = await Promise.all([call(JRN.runDueWaits, { now: later, tenantId: tidA, deps: mDeps }), call(JRN.runDueWaits, { now: later, tenantId: tidA, deps: mDeps })]);
    const w1 = (await P.automationRun.findMany({ where: { ruleId: jRid, customerId: cuR1.id, stepIndex: { not: null } } })) as Any[];
    const w2 = (await P.automationRun.findMany({ where: { ruleId: jRid, customerId: cuR2.id, stepIndex: { not: null } } })) as Any[];
    chk("C2.1-R.3", "two overlapping member runDueWaits (now + 2 days) → the waiting SEND_LINE of R1 is sent exactly once and its row is OK (positive control)",
      par.every((x) => x.ok) && MSENT.filter((s) => s.req?.to === cuR1.ext).length === 2 && w1.length === 1 && w1[0].status === "OK", "once",
      `line=${MSENT.filter((s) => s.req?.to === cuR1.ext).length} rows=${w1.map((x) => x.status).join(",")} ${par.map((x) => x.err).join(" ")}`);
    chk("C2.1-R.4", "member consent revoked during the wait → the waiting SEND_LINE of R2 is NOT sent (step skipped with a Thai reason) — consent at send time (positive control)",
      MSENT.filter((s) => s.req?.to === cuR2.ext).length === 1 && w2.length === 1 && w2[0].status !== "WAITING" && /ถอน|ยินยอม/.test(j(w2[0])), "skipped",
      `line=${MSENT.filter((s) => s.req?.to === cuR2.ext).length} row=${cut(j(w2[0]), 200)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — the engine sees only scope CRM + crmSystemId (+ pipelineId)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S1 · engine scope ──");
  {
    const c1 = await rawContact(tidA, crmA, "ลูกค้า S1");
    const c1b = await rawContact(tidA, crmA, "ลูกค้า S1b");
    const c2 = await rawContact(tidA, crmA2, "ลูกค้าระบบสอง");
    const d1 = await rawDeal(cA, c1, pA);
    const d1b = await rawDeal(cA, c1b, pA2);
    const d2 = await rawDeal(cA2, c2, pX);
    const R = await mkRule(cA, { name: `S1 กฎ ${TAG}`, trigger: { event: "crm.deal.created" }, pipelineId: pA.id, actions: [{ type: "ADD_TAG", params: { tag: "s1" } }] });
    await P.automationRule.create({ data: { tenantId: tidA, name: `v1 ${TAG}`, event: "crm.deal.created", enabled: true, actionType: "NOTIFY", actionConfig: { title: `${TAG}-v1` } } });
    const e1 = ev(tidA, crmA, "crm.deal.created", { dealId: d1, contactId: c1, pipelineId: pA.id, stageId: pA.st[0] });
    const fired = await call(ENG.runForEvent, e1);
    const v1n = await P.appNotification.count({ where: { tenantId: tidA, title: `${TAG}-v1` } });
    const crmAsV1 = await P.appNotification.count({ where: { tenantId: tidA, title: `S1 กฎ ${TAG}` } });
    chk("C2.1-S1.1", "engine.runForEvent(crm.deal.created of system A) → the CRM rule runs once (tag on the deal's contact, main run OK) AND the v1 KANBAN rule on the same event still notifies · the v1 path never treats the CRM rule's NOTIFY placeholder as a notification",
      fired.ok && (await hasTag(c1, "s1")) && (await mainRuns(R, ["OK"])).length === 1 && v1n === 1 && crmAsV1 === 0, "CRM 1 · v1 1 · placeholder 0",
      `fired=${fired.err || j(fired.v)} tag=${await hasTag(c1, "s1")} runs=${(await mainRuns(R, ["OK"])).length} v1=${v1n} placeholder=${crmAsV1}`);
    const e2 = ev(tidA, crmA2, "crm.deal.created", { dealId: d2, contactId: c2, pipelineId: pX.id, stageId: pX.st[0] });
    await call(ENG.runForEvent, e2);
    await runCrm(e2);
    chk("C2.1-S1.2", "the same event type from the OTHER CRM system of the tenant (A2) never fires system A's rule (no run, no tag)",
      !(await hasTag(c2, "s1")) && (await mainRuns(R, ["OK", "FAILED", "SKIPPED", "WAITING"])).length === 1, "A only", `tagA2=${await hasTag(c2, "s1")} runs=${(await mainRuns(R, ["OK", "FAILED", "SKIPPED", "WAITING"])).length}`);
    await runCrm(ev(tidA, crmA, "crm.deal.created", { dealId: d1b, contactId: c1b, pipelineId: pA2.id, stageId: pA2.st[0] }));
    chk("C2.1-S1.3", "a rule bound to pipelineId P never fires for a deal of another pipeline of the same system",
      !(await hasTag(c1b, "s1")) && (await mainRuns(R, ["OK"])).length === 1, "P only", `tagOther=${await hasTag(c1b, "s1")}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — triggers: 3 events + 3 cron
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S2 · triggers ──");
  {
    const c21 = await rawContact(tidA, crmA, "ลูกค้า S2.1");
    const R21 = await mkRule(cA, { trigger: { event: "crm.contact.created" }, actions: [{ type: "ADD_TAG", params: { tag: "t-contact" } }] });
    const r = await runCrm(ev(tidA, crmA, "crm.contact.created", { contactId: c21 }));
    const rows = await runsFor(R21, c21, ["OK"]);
    chk("C2.1-S2.1", "trigger crm.contact.created (payload ids only) → the contact is loaded by id, action ran, ONE main run OK with crmContactId = the contact",
      r.ok && r.v?.runs === 1 && (await hasTag(c21, "t-contact")) && rows.length === 1, "1 run", `r=${r.err || j(r.v)} tag=${await hasTag(c21, "t-contact")} rows=${rows.length}`);

    const c22 = await rawContact(tidA, crmA, "ลูกค้า S2.2");
    const d22 = await rawDeal(cA, c22, pA);
    const R22 = await mkRule(cA, { trigger: { event: "crm.deal.stage.changed" }, actions: [{ type: "ADD_TAG", params: { tag: "t-stage" } }] });
    await runCrm(ev(tidA, crmA, "crm.deal.stage.changed", { dealId: d22, fromStageId: pA.st[0], toStageId: pA.st[1] }));
    chk("C2.1-S2.2", "trigger crm.deal.stage.changed with {dealId} only → subject = the deal's contact (loaded by id) → action ran once",
      (await hasTag(c22, "t-stage")) && (await runsFor(R22, c22, ["OK"])).length === 1, "tagged", `tag=${await hasTag(c22, "t-stage")} rows=${(await runsFor(R22, c22, ["OK"])).length}`);

    const c23 = await rawContact(tidA, crmA, "ลูกค้า S2.3");
    const rec23 = await mkVehicle(cA, c23, { [vTextKey]: `S23-${rand}` });
    const R23 = await mkRule(cA, { trigger: { event: "custom.record.created" }, actions: [{ type: "ADD_TAG", params: { tag: "t-record" } }] });
    await runCrm(ev(tidA, crmA, "custom.record.created", { objectKey: "vehicle", recordId: rec23, parentType: "CONTACT", parentId: c23 }));
    chk("C2.1-S2.3", "trigger custom.record.created → record loaded by id → parent contact → action ran once",
      vehA.ok && (await hasTag(c23, "t-record")) && (await runsFor(R23, c23, ["OK"])).length === 1, "tagged", `vehicleObj=${vehA.ok ? "ok" : vehA.err} tag=${await hasTag(c23, "t-record")}`);

    const c24 = await rawContact(tidA, crmA, "ลูกค้า S2.4");
    const c24n = await rawContact(tidA, crmA, "ลูกค้า S2.4n");
    await rawDeal(cA, c24, pA, { expectedCloseAt: new Date(NOW.getTime() + 3 * DAY) });
    await rawDeal(cA, c24n, pA, { expectedCloseAt: new Date(NOW.getTime() + 20 * DAY) });
    await mkRule(cA, { trigger: { event: "crm.deal.close_due", params: { daysBefore: 3 } }, actions: [{ type: "ADD_TAG", params: { tag: "t-close" } }] });
    const c25 = await rawContact(tidA, crmA, "ลูกค้า S2.5");
    const c25n = await rawContact(tidA, crmA, "ลูกค้า S2.5n");
    await mkVehicle(cA, c25, { nextService: thaiYmd(new Date(NOW.getTime() + 7 * DAY)) });
    await mkVehicle(cA, c25n, { nextService: thaiYmd(new Date(NOW.getTime() + 40 * DAY)) });
    await mkRule(cA, { trigger: { event: "custom.record.field_due", params: { objectKey: "vehicle", fieldKey: "nextService", daysBefore: 7 } }, actions: [{ type: "ADD_TAG", params: { tag: "t-field" } }] });
    const c26 = await rawContact(tidA, crmA, "ลูกค้า S2.6");
    const c26n = await rawContact(tidA, crmA, "ลูกค้า S2.6n");
    await P.crmActivity.create({ data: { tenantId: tidA, systemId: crmA, contactId: c26, type: "TASK", title: `ค้าง ${TAG}`, dueAt: new Date(NOW.getTime() - 3 * 3_600_000), ownerUserId: userA } });
    await P.crmActivity.create({ data: { tenantId: tidA, systemId: crmA, contactId: c26n, type: "TASK", title: `เสร็จ ${TAG}`, dueAt: new Date(NOW.getTime() - 3 * 3_600_000), doneAt: new Date(), ownerUserId: userA } });
    await mkRule(cA, { trigger: { event: "crm.activity.overdue" }, actions: [{ type: "ADD_TAG", params: { tag: "t-overdue" } }] });
    const cr = await cron({ now: NOW, tenantId: tidA });
    chk("C2.1-S2.4", "cron trigger crm.deal.close_due{daysBefore 3}: the OPEN deal closing in 3 days fires, the one closing in 20 days does not",
      cr.ok && (await hasTag(c24, "t-close")) && !(await hasTag(c24n, "t-close")), "3d only", `cron=${cr.err || j(cr.v)} due=${await hasTag(c24, "t-close")} far=${await hasTag(c24n, "t-close")}`);
    chk("C2.1-S2.5", "cron trigger custom.record.field_due{vehicle, nextService, 7}: the record due in 7 days fires for its parent contact, the one due in 40 days does not",
      cr.ok && (await hasTag(c25, "t-field")) && !(await hasTag(c25n, "t-field")), "7d only", `due=${await hasTag(c25, "t-field")} far=${await hasTag(c25n, "t-field")}`);
    chk("C2.1-S2.6", "cron trigger crm.activity.overdue: an open activity past its due time fires for its contact, a done one does not",
      cr.ok && (await hasTag(c26, "t-overdue")) && !(await hasTag(c26n, "t-overdue")), "open only", `open=${await hasTag(c26, "t-overdue")} done=${await hasTag(c26n, "t-overdue")}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — conditions: c. co. d. f.{key} o.{objectKey}[.{fieldKey}] + exists/count · AND/OR one level
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S3 · conditions ──");
  {
    const coParty = await P.party.create({ data: { tenantId: tidA, name: `บริษัท ${TAG}`, kind: "ORGANIZATION" } }).catch(() => P.party.create({ data: { tenantId: tidA, name: `บริษัท ${TAG}`, kind: "PERSON" } }));
    const co3 = (await P.crmCompany.create({ data: { tenantId: tidA, systemId: crmA, partyId: coParty.id, name: `บริษัท ${TAG}`, industry: "dive" } })).id as string;
    const c3 = await rawContact(tidA, crmA, "ลูกค้า S3", { lifecycleStage: "PROSPECT", score: 70, tags: ["vip"], companyId: co3 });
    await setBudget(tidA, c3, budgetA, 50_000);
    await mkVehicle(cA, c3, { [vTextKey]: `Toyota-${rand}` });
    const d3 = await rawDeal(cA, c3, pA, { valueSatang: 250_000, companyId: co3 }, 1);
    const T = { event: "crm.deal.updated" };
    const act = (t: string) => [{ type: "ADD_TAG", params: { tag: t } }];
    const rule = (items: Any[], mode = "AND") => mkRule(cA, { trigger: T, conditions: { mode, items }, actions: act(`s3-${nx()}`) });
    const RA = await rule([{ field: "c.lifecycleStage", op: "eq", value: "PROSPECT" }, { field: "c.score", op: "gte", value: 60 }, { field: "c.tags", op: "contains", value: "vip" }]);
    const RAn = await rule([{ field: "c.score", op: "gte", value: 90 }]);
    const RB = await rule([{ field: "d.valueSatang", op: "between", value: [200_000, 300_000] }, { field: "d.stageId", op: "eq", value: pA.st[1] }]);
    const RBn = await rule([{ field: "d.valueSatang", op: "lt", value: 100_000 }]);
    const RC = await rule([{ field: "co.industry", op: "eq", value: "dive" }]);
    const RCn = await rule([{ field: "co.industry", op: "eq", value: "bakery" }]);
    const RD = await rule([{ field: "f.budget", op: "gte", value: 40_000 }]);
    const RDn = await rule([{ field: "f.budget", op: "gte", value: 60_000 }]);
    const RE = await rule([{ field: "o.vehicle", op: "exists" }, { field: `o.vehicle.${vTextKey}`, op: "eq", value: `Toyota-${rand}` }]);
    const REn = await rule([{ field: "o.vehicle", op: "count_gte", value: 2 }]);
    const REn2 = await rule([{ field: "o.vehicle", op: "not_exists" }]);
    const RF = await rule([{ field: "c.score", op: "gte", value: 90 }, { field: "co.industry", op: "eq", value: "dive" }], "OR");
    const RFn = await rule([{ field: "c.score", op: "gte", value: 90 }, { field: "co.industry", op: "eq", value: "dive" }], "AND");
    const r = await runCrm(ev(tidA, crmA, "crm.deal.updated", { dealId: d3 }));
    const n = async (id: string) => (await mainRuns(id, ["OK"])).length;
    const pair = async (yes: string, ...no: string[]) => ({ yes: await n(yes), no: await Promise.all(no.map(n)) });
    const show = (p: Any) => `yes=${p.yes} no=${p.no.join(",")}`;
    const s31 = await pair(RA, RAn); chk("C2.1-S3.1", "c.* (lifecycleStage eq · score gte · tags contains) evaluated on the contact loaded by id: matching rule fires once, non-matching (score ≥ 90) does not", r.ok && s31.yes === 1 && s31.no.every((x) => x === 0), "1 / 0", `${show(s31)} ${r.err}`);
    const s32 = await pair(RB, RBn); chk("C2.1-S3.2", "d.* (valueSatang between · stageId eq) on the deal loaded by id: match fires, lt 100,000 does not", s32.yes === 1 && s32.no.every((x) => x === 0), "1 / 0", show(s32));
    const s33 = await pair(RC, RCn); chk("C2.1-S3.3", "co.* (industry eq) on the deal's company: dive fires, bakery does not", s33.yes === 1 && s33.no.every((x) => x === 0), "1 / 0", show(s33));
    const s34 = await pair(RD, RDn); chk("C2.1-S3.4", "f.{key} = contact custom field (budget 50,000): gte 40,000 fires, gte 60,000 does not", s34.yes === 1 && s34.no.every((x) => x === 0), "1 / 0", show(s34));
    const s35 = await pair(RE, REn, REn2); chk("C2.1-S3.5", "o.{objectKey} exists + o.{objectKey}.{fieldKey} eq fire · count_gte 2 (only 1 record) and not_exists do not", s35.yes === 1 && s35.no.every((x) => x === 0), "1 / 0,0", show(s35));
    const s36 = await pair(RF, RFn); chk("C2.1-S3.6", "one-level OR fires when one item holds (score<90 but industry dive) · the same items under AND do not", s36.yes === 1 && s36.no.every((x) => x === 0), "OR 1 / AND 0", show(s36));
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — every action (one rule, 17 steps, injected senders) + dry-run writes nothing
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S4 · actions ──");
  {
    const email4 = mailOf("s4");
    const line4 = `U${TAG.replace(/-/g, "")}s4`;
    const c4 = await rawContact(tidA, crmA, "ลูกค้า S4", { email: email4, lineUserId: line4, tags: ["s4-old"] });
    const c4name = (await P.crmContact.findFirst({ where: { id: c4 } })).name as string;
    await grant(tidA, crmA, c4, "EMAIL");
    await grant(tidA, crmA, c4, "LINE");
    const d4 = await rawDeal(cA, c4, pA);
    const R4 = await mkRule(cA, {
      name: `S4 ทุกการกระทำ ${TAG}`, trigger: { event: "crm.deal.updated" }, actions: [
        { type: "MOVE_STAGE", params: { stageId: pA.st[1] } },
        { type: "ASSIGN", params: { userId: userM } },
        { type: "CREATE_ACTIVITY", params: { type: "TASK", title: "โทรหา {ชื่อ}", dueIn: 1, assignTo: "owner" } },
        { type: "CREATE_DEAL", params: { pipelineId: pA2.id, titleTpl: "ต่ออายุ {ชื่อ}" } },
        { type: "SEND_EMAIL", params: { subject: `หัวข้อ ${TAG}`, template: "สวัสดี {ชื่อ}", to: "contact" } },
        { type: "SEND_LINE", params: { template: "สวัสดี {ชื่อ}" } },
        { type: "SEND_PUSH", params: { to: "owner", title: "ลูกค้า {ชื่อ}", template: "มีความเคลื่อนไหว" } },
        { type: "SET_FIELD", params: { objectKey: "contact", key: "budget", value: 12_345 } },
        { type: "ADD_TAG", params: { tag: "s4-add" } },
        { type: "REMOVE_TAG", params: { tag: "s4-old" } },
        { type: "NOTIFY_STAFF", params: { userIds: [userA], text: `${TAG}-notify` } },
        { type: "OPEN_KANBAN_CARD", params: { boardId: boardA, title: "ตามงาน {ชื่อ}" } },
        { type: "ENROLL_SEQUENCE", params: { sequenceId: `${TAG}-seq` } },
        { type: "STOP_SEQUENCE", params: {} },
        { type: "ADJUST_SCORE", params: { points: 5, reason: "ทดสอบ" } },
        { type: "WEBHOOK", params: { url: "https://hooks.example.com/qc-c21" } },
        { type: "WAIT_THEN", params: { days: 2, thenActions: [{ type: "ADD_TAG", params: { tag: "s4-after-wait" } }] } },
      ],
    });
    const scoreBefore = (await P.crmContact.findFirst({ where: { id: c4 } })).score;
    const r = await runCrm(ev(tidA, crmA, "crm.deal.updated", { dealId: d4 }));
    const deal = await P.crmDeal.findFirst({ where: { id: d4 } });
    const hist = await P.crmDealStageHistory.count({ where: { dealId: d4, toStageId: pA.st[1] } });
    const cRow = await P.crmContact.findFirst({ where: { id: c4 } });
    chk("C2.1-S4.1", "MOVE_STAGE moves the deal through the deals service (stage + history row) · ASSIGN sets the manager as owner (contact or deal)",
      r.ok && deal?.stageId === pA.st[1] && hist >= 1 && (cRow?.ownerUserId === userM || deal?.ownerUserId === userM), "moved · assigned",
      `run=${r.err || j(r.v)} stage=${deal?.stageId === pA.st[1]} hist=${hist} owner=${cRow?.ownerUserId === userM || deal?.ownerUserId === userM} fallback=${cut(SERVICE_FAIL.join(" | "), 160) || "-"}`);
    const act = await P.crmActivity.findFirst({ where: { contactId: c4, title: `โทรหา ${c4name}` } });
    const nd = await P.crmDeal.findFirst({ where: { contactId: c4, pipelineId: pA2.id } });
    chk("C2.1-S4.2", "CREATE_ACTIVITY creates the task with {ชื่อ} rendered · CREATE_DEAL opens a deal for the contact in the given pipeline",
      !!act && !!nd && String(nd?.title ?? "").includes(c4name), "activity + deal", `activity=${!!act} deal=${!!nd} title=${cut(nd?.title, 80)}`);
    chk("C2.1-S4.3", "SEND_EMAIL → email sender once to the contact's e-mail (subject kept) · SEND_LINE → LINE sender once to contact.lineUserId · SEND_PUSH → push sender once for the owner (all injected, consent granted)",
      sent("EMAIL", email4) === 1 && SENT.some((s) => s.ch === "EMAIL" && j(s.req).includes(`หัวข้อ ${TAG}`)) && sent("LINE", line4) === 1 && SENT.filter((s) => s.ch === "PUSH" && (j(s.req).includes(userA) || j(s.req).includes(userM))).length >= 1,
      "1 · 1 · 1", `email=${sent("EMAIL", email4)} line=${sent("LINE", line4)} push=${SENT.filter((s) => s.ch === "PUSH").length}`);
    const val = await P.customRecordValue.findFirst({ where: { recordType: "CONTACT", recordId: c4, fieldId: budgetA } });
    chk("C2.1-S4.4", "SET_FIELD writes the contact custom field (budget = 12,345) · ADD_TAG adds s4-add · REMOVE_TAG removes s4-old",
      Number(val?.valueNumber) === 12_345 && (cRow?.tags ?? []).includes("s4-add") && !(cRow?.tags ?? []).includes("s4-old"), "set · tags", `budget=${val?.valueNumber ?? "-"} tags=${j(cRow?.tags)}`);
    const note = await P.appNotification.count({ where: { tenantId: tidA, recipientUserId: userA, OR: [{ title: { contains: `${TAG}-notify` } }, { body: { contains: `${TAG}-notify` } }] } });
    chk("C2.1-S4.5", "NOTIFY_STAFF → an in-app notification for the listed user carrying the text · OPEN_KANBAN_CARD → the kanban sender is called once with the board of this tenant",
      note >= 1 && SENT.filter((s) => s.ch === "KANBAN" && j(s.req).includes(boardA)).length === 1, "notified · card", `notify=${note} kanban=${SENT.filter((s) => s.ch === "KANBAN").length}`);
    const main = (await mainRuns(R4, ["OK", "FAILED"]))[0];
    // ORACLE-EDIT 25 ก.ย. (Fable · C2.8 accepted): ADJUST_SCORE is no longer a stub — the step goes through `crm.scoring.adjust` (+5 here,
    //   one CrmScoreLog, single-statement bump); ENROLL/STOP_SEQUENCE were wired by C2.2. The main run must still be OK.
    chk("C2.1-S4.6", "ENROLL_SEQUENCE / STOP_SEQUENCE (C2.2) and ADJUST_SCORE (C2.8) are real steps: the main run is OK (not FAILED) and ADJUST_SCORE {points 5} moves the contact's score by exactly +5",
      main?.status === "OK" && /ENROLL_SEQUENCE|ลำดับ|sequence/i.test(j(main)) && Number(cRow?.score) === Number(scoreBefore) + 5, "OK · +5", `run=${main?.status ?? "-"} score=${scoreBefore}→${cRow?.score}`, "MAJOR");
    const w = await waitingOf(R4);
    const wOk = w.length === 1 && (w[0] as Any).crmContactId === c4 && Math.abs(new Date(w[0].scheduledAt).getTime() - (NOW.getTime() + 2 * DAY)) < 3_600_000;
    await waits({ now: new Date(NOW.getTime() + 3 * DAY), tenantId: tidA });
    const wAfter = (await runsOf(R4)).find((x) => x.id === w[0]?.id);
    chk("C2.1-S4.7", "WEBHOOK → post sender once to the public URL · WAIT_THEN → one WAITING row (crmContactId = contact, scheduledAt ≈ now + 2 days) that runDueWaits later resumes (thenActions ran, row OK)",
      POSTS.filter((p) => p.url === "https://hooks.example.com/qc-c21").length === 1 && wOk && wAfter?.status === "OK" && (await hasTag(c4, "s4-after-wait")), "post · wait → resumed",
      `posts=${POSTS.length} waiting=${w.length} contact=${(w[0] as Any)?.crmContactId === c4} resumed=${wAfter?.status} tag=${await hasTag(c4, "s4-after-wait")}`);
    const draft = { name: `ร่าง ${TAG}`, trigger: { event: "crm.deal.updated" }, conditions: { mode: "AND", items: [{ field: "d.valueSatang", op: "gte", value: 50_000 }] }, actions: [{ type: "ADD_TAG", params: { tag: "dry" } }] };
    const fp1 = await footprint(tidA);
    const dr = await call(AUTO.dryRun, cA, owner, draft, { days: 30 });
    const fp2 = await footprint(tidA);
    const diff = fp1.filter((x, i) => x !== fp2[i]);
    chk("C2.1-S4.8", "dryRun of a draft writes NOTHING (every tenant table incl. AutomationRun/OutboxEvent/AuditLog/AppNotification unchanged) and lists the matching deal/contact",
      dr.ok && diff.length === 0 && (j(dr.v).includes(d4) || j(dr.v).includes(c4)), "0 writes · listed", `dry=${dr.err || cut(j(dr.v), 120)} diff=${cut(diff.join(" "), 160) || "-"}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 — starter rules (6 + object-template date rules, disabled) · apply is idempotent · a starter really runs
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S5 · starter rules ──");
  {
    await mkVehicleObject(cS);
    const crmRules = (sys: string) => P.automationRule.findMany({ where: { crmSystemId: sys, scope: "CRM" } }) as Promise<Any[]>;
    const a1 = await call(AUTO.applyStarterRules, cS, owner);
    const r1 = await crmRules(crmS);
    const a2 = await call(AUTO.applyStarterRules, cS, owner);
    const r2 = await crmRules(crmS);
    const fieldDue = r1.filter((r) => r.event === "custom.record.field_due" && j(r.trigger).includes("vehicle") && j(r.trigger).includes("nextService"));
    const starters = (ASH.CRM_STARTER_RULES ?? []) as Any[];
    chk("C2.1-S5.1", "applyStarterRules: the 6 CRM_STARTER_RULES + the vehicle template's date-due rule (custom.record.field_due {vehicle, nextService, 7}) — ALL disabled, scope CRM, this system · re-apply creates nothing",
      a1.ok && a2.ok && starters.length === 6 && r1.length === 7 && fieldDue.length === 1 && r1.every((r) => r.enabled === false) && r2.length === r1.length && j(fieldDue[0]?.trigger).includes("7"),
      "7 disabled · idempotent", `apply=${a1.err || "ok"} starters=${starters.length} rows=${r1.length}→${r2.length} fieldDue=${fieldDue.length} enabled=${r1.filter((r) => r.enabled).length}`);
    const evs = new Set(starters.map((s) => s?.trigger?.event));
    const acts = new Set((ASH.CRM_ACTION_TYPES ?? []) as string[]);
    chk("C2.1-S5.2", "the 6 starters follow blueprint §7.3: triggers include crm.contact.created · crm.deal.stale{days 14} · crm.score.threshold · crm.deal.lost · Thai names · unique keys · every action type is in CRM_ACTION_TYPES",
      ["crm.contact.created", "crm.deal.stale", "crm.score.threshold", "crm.deal.lost"].every((e) => evs.has(e)) && starters.some((s) => s?.trigger?.event === "crm.deal.stale" && Number(s?.trigger?.params?.days) === 14)
        && starters.every((s) => thai(s?.name) && Array.isArray(s?.actions) && s.actions.length > 0 && s.actions.every((a: Any) => acts.has(a?.type)))
        && new Set(starters.map((s) => s?.key)).size === 6, "blueprint set", `events=${[...evs].join(",")}`);
    const lead = r1.find((r) => r.event === "crm.contact.created");
    const tg = lead ? await call(AUTO.toggleRule, cS, owner, lead.id, true) : { ok: false, err: "no starter" };
    const created = await call(CT.createContact, cS, owner, { firstName: pii(`ลีดเริ่มต้น ${TAG}`), phone: phoneOf() });
    const cid = idOf(created.v);
    const row = (await P.outboxEvent.findMany({ where: { tenantId: tidA, type: "crm.contact.created", systemId: crmS } })) as Any[];
    for (const e of row) await consume(evtOf(e));
    const runs = lead ? await runsFor(lead.id, cid, ["OK", "FAILED"]) : [];
    chk("C2.1-S5.3", "enable the \"new lead\" starter → a contact created through the contacts service → its real crm.contact.created outbox event through the consumer → the starter runs once for that contact (main run, not FAILED)",
      tg.ok && created.ok && row.length >= 1 && runs.length === 1 && runs[0].status === "OK", "1 run", `toggle=${(tg as Any).err || "ok"} contact=${created.err || cid} events=${row.length} runs=${runs.map((x) => x.status).join(",") || 0}`);
    const par = await Promise.all(Array.from({ length: 10 }, () => call(AUTO.applyStarterRules, cS2, owner)));
    const r3 = await crmRules(crmS2);
    const names = r3.map((r) => r.name);
    chk("C2.1-X3.1", "X3: applyStarterRules fired 10× in parallel on a fresh system → exactly the 6 starters (no object there), no duplicate name",
      par.every((x) => x.ok) && r3.length === 6 && new Set(names).size === 6, "6", `rows=${r3.length} ${par.find((x) => !x.ok)?.err ?? ""}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S7 — quota per scope (CRM limit does not touch member journeys / v1 rules) + loop guard of the scope
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S7 · quota per scope ──");
  {
    const jq = await call(JRN.createJourney, mCtx(tidQ, memQ), owner, jIn("journey Q", [{ type: "ADD_TAG", params: { tag: `q-${rand}` } }]));
    const cus = [await mkCustomer(tidQ, memQ, "Q1", false, null), await mkCustomer(tidQ, memQ, "Q2", false, null), await mkCustomer(tidQ, memQ, "Q3", false, null)];
    for (const cu of cus) await call(JRN.runForEvent, mEvt(tidQ, cu.id), { now: NOW, deps: mDeps });
    await P.tenant.update({ where: { id: tidQ }, data: { limits: { crm: { automationRunsPerMonth: 2 } } } });
    const RQ = await mkRule(cQ, { trigger: { event: "crm.contact.created" }, actions: [{ type: "ADD_TAG", params: { tag: "q" } }] });
    const cq = [await rawContact(tidQ, crmQ, "Q-a"), await rawContact(tidQ, crmQ, "Q-b"), await rawContact(tidQ, crmQ, "Q-c")];
    for (const c of cq) await runCrm(ev(tidQ, crmQ, "crm.contact.created", { contactId: c }));
    const third = await runsFor(RQ, cq[2], ["SKIPPED"]);
    const use = await call(AUTO.usageThisMonth, cQ);
    chk("C2.1-S7.1", "CRM quota (Tenant.limits.crm.automationRunsPerMonth = 2): 3 member-journey runs of the same tenant do NOT count · the first 2 CRM events run · the 3rd is SKIPPED with a Thai quota reason and no action · usageThisMonth.limit = 2",
      jq.ok && (await hasTag(cq[0], "q")) && (await hasTag(cq[1], "q")) && !(await hasTag(cq[2], "q")) && third.length === 1 && /โควตา/.test(j(third[0])) && use.ok && use.v?.limit === 2,
      "2 run · 3rd quota", `tags=${await hasTag(cq[0], "q")},${await hasTag(cq[1], "q")},${await hasTag(cq[2], "q")} skipped=${cut(j(third[0]), 120) || "-"} usage=${use.err || j(use.v)}`);
    const cu4 = await mkCustomer(tidQ, memQ, "Q4", false, null);
    const m4 = await call(JRN.runForEvent, mEvt(tidQ, cu4.id), { now: NOW, deps: mDeps });
    await P.automationRule.create({ data: { tenantId: tidQ, name: `v1 Q ${TAG}`, event: "crm.contact.created", enabled: true, actionType: "NOTIFY", actionConfig: { title: `${TAG}-v1q` } } });
    const cq4 = await rawContact(tidQ, crmQ, "Q-d");
    await call(ENG.runForEvent, ev(tidQ, crmQ, "crm.contact.created", { contactId: cq4 }));
    const def = await call(AUTO.usageThisMonth, cA);
    chk("C2.1-S7.2", "scopes are separate: with the CRM quota exhausted the member journey still runs and the v1 KANBAN rule still notifies · another tenant's CRM limit defaults to CRM_AUTOMATION_RUNS_PER_MONTH = 5,000",
      m4.ok && m4.v?.runs === 1 && (await P.appNotification.count({ where: { tenantId: tidQ, title: `${TAG}-v1q` } })) === 1 && ASH.CRM_AUTOMATION_RUNS_PER_MONTH === 5000 && def.ok && def.v?.limit === 5000,
      "member 1 · v1 1 · default 5000", `member=${m4.err || j(m4.v)} v1=${await P.appNotification.count({ where: { tenantId: tidQ, title: `${TAG}-v1q` } })} default=${def.err || j(def.v)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S9 — brief extras: catalogue + validation · member adapter (voucher/points) · member-linked LINE address + consent · cron wiring
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S9 · brief extras ──");
  {
    const trig = (ASH.CRM_RULE_TRIGGERS ?? []) as Any[];
    const tv = new Set(trig.map((t) => t?.value));
    const want = ((LAB.AUTOMATION_EVENTS ?? []) as Any[]).map((e) => e?.value).filter((v: string) => typeof v === "string" && (v.startsWith("crm.") || v.startsWith("custom.record.")));
    const missEv = want.filter((v: string) => !tv.has(v));
    const cronBad = Object.entries(CRON_TRIGGERS).filter(([k, ps]) => {
      const t = trig.find((x) => x?.value === k);
      return !t || t.cron !== true || !ps.every((p) => j(t.params ?? []).includes(p));
    }).map(([k]) => k);
    const acts = new Set((ASH.CRM_ACTION_TYPES ?? []) as string[]);
    const missAct = REQUIRED_ACTIONS.filter((a) => !acts.has(a));
    chk("C2.1-S9.1", "catalogue: CRM_RULE_TRIGGERS covers every crm.* / custom.record.* AUTOMATION_EVENTS value + the 5 cron triggers (cron: true, params) · Thai labels · CRM_ACTION_TYPES ⊇ the 17 blueprint actions + ISSUE_VOUCHER + GIVE_POINTS",
      trig.length > 0 && missEv.length === 0 && cronBad.length === 0 && trig.every((t) => thai(t?.label)) && missAct.length === 0, "complete",
      `missingEvents=${cut(missEv.join(","), 120) || "-"} cron=${cronBad.join(",") || "-"} missingActions=${missAct.join(",") || "-"}`);
    const n0 = await P.automationRule.count({ where: { tenantId: tidA } });
    const bad = [
      await call(AUTO.createRule, cA, owner, { name: `ผิด1 ${TAG}`, trigger: { event: "pos.sale.paid" }, actions: [{ type: "ADD_TAG", params: { tag: "x" } }] }),
      await call(AUTO.createRule, cA, owner, { name: `ผิด2 ${TAG}`, trigger: { event: "crm.contact.created" }, actions: [{ type: "SET_TIER", params: {} }] }),
      await call(AUTO.createRule, cA, owner, { name: `ผิด3 ${TAG}`, trigger: { event: "crm.contact.created" }, actions: [{ type: "WAIT_THEN", params: { days: 120, thenActions: [] } }] }),
      await call(AUTO.createRule, cA, owner, { name: `ผิด4 ${TAG}`, trigger: { event: "crm.contact.created" }, actions: Array.from({ length: 21 }, () => ({ type: "ADD_TAG", params: { tag: "x" } })) }),
    ];
    chk("C2.1-S9.2", "createRule refuses (Thai, nothing written): a non-CRM trigger (pos.sale.paid) · an unknown action (SET_TIER) · WAIT_THEN 120 days · 21 actions",
      bad.every(refusedThai) && (await P.automationRule.count({ where: { tenantId: tidA } })) === n0, "4 refused", bad.map((b) => (b.ok ? "ACCEPTED" : cut(b.err, 50))).join(" | "));
    const cu = await mkCustomer(tidA, memA, "สมาชิกผูก CRM");
    const cLinked = await rawContact(tidA, crmA, "ผู้ติดต่อเป็นสมาชิก", { memberCustomerId: cu.id });
    const cPlain = await rawContact(tidA, crmA, "ผู้ติดต่อทั่วไป");
    const RV = await mkRule(cA, { trigger: { event: "crm.contact.converted" }, actions: [{ type: "GIVE_POINTS", params: { points: 10 } }, { type: "ISSUE_VOUCHER", params: { templateId: `${TAG}-tpl` } }, { type: "SEND_LINE", params: { template: "ยินดีต้อนรับ" } }] });
    await runCrm(ev(tidA, crmA, "crm.contact.converted", { contactId: cPlain }));
    await runCrm(ev(tidA, crmA, "crm.contact.converted", { contactId: cLinked }));
    const plain = (await runsFor(RV, cPlain, ["OK", "FAILED"]))[0];
    const linked = (await runsFor(RV, cLinked, ["OK", "FAILED"]))[0];
    chk("C2.1-S9.3", "R-A: GIVE_POINTS / ISSUE_VOUCHER on a contact NOT linked to a member → steps SKIPPED with a Thai reason naming สมาชิก (run not FAILED) · on a member-linked contact they go to the member adapter (no \"not a member\" reason)",
      plain?.status === "OK" && /สมาชิก/.test(j(plain)) && !!linked && linked.status !== "FAILED" && j(linked) !== j(plain), "skipped / adapter",
      `plain=${cut(j(plain?.detail ?? plain), 120)} linked=${cut(j(linked?.detail ?? linked), 120)}`, "MAJOR");
    chk("C2.1-S9.4", "member-linked contact without lineUserId: SEND_LINE goes to the linked member's LINE identity (MemberConsent LINE granted ⇒ sent once)",
      sent("LINE", cu.ext) === 1, "1 to member identity", `line=${sent("LINE", cu.ext)}`);
    const wired = walk("src").some((f) => /registerMinuteJob\(\s*\{\s*name:\s*["']crm\.(automation|rules?)/.test(read(f))) || /crm\/automation|runCronTriggers/.test(read("src/lib/platform/cron.ts"));
    chk("C2.1-S9.5", "cron triggers + CRM waits are scheduled: a registered minute/hourly/daily job named crm.automation* (C0.5 registry) or the platform cron calls the CRM automation [static]", wired, "wired", String(wired), "MINOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // U — PERMANENT RULE: uiVersion 1 ⇒ CRM rules skip that system (rows kept, resume at 2) · v1 automation of other modules unchanged
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── U · uiVersion 1 ──");
  {
    const RVt = await mkRule(cV, { name: `V ตามแท็ก ${TAG}`, trigger: { event: "crm.contact.created" }, actions: [{ type: "ADD_TAG", params: { tag: "v" } }] });
    const RVw = await mkRule(cV, { name: `V รอ ${TAG}`, trigger: { event: "crm.deal.created" }, actions: [{ type: "WAIT_THEN", params: { days: 1, thenActions: [{ type: "ADD_TAG", params: { tag: "v-after" } }] } }] });
    const RVo = await mkRule(cV, { name: `V ค้าง ${TAG}`, trigger: { event: "crm.activity.overdue" }, actions: [{ type: "ADD_TAG", params: { tag: "v-overdue" } }] });
    const cvw = await rawContact(tidV, crmV, "V รอ");
    const dvw = await rawDeal(cV, cvw, pV);
    await runCrm(ev(tidV, crmV, "crm.deal.created", { dealId: dvw, contactId: cvw }));
    const wBefore = await waitingOf(RVw);
    await setCrm(crmV, { uiVersion: 1 });
    const cv1 = await rawContact(tidV, crmV, "V หนึ่ง");
    const cvo = await rawContact(tidV, crmV, "V ค้าง");
    await P.crmActivity.create({ data: { tenantId: tidV, systemId: crmV, contactId: cvo, type: "TASK", title: `ค้าง ${TAG}`, dueAt: new Date(NOW.getTime() - 3_600_000), ownerUserId: userA } });
    const r1 = await runCrm(ev(tidV, crmV, "crm.contact.created", { contactId: cv1 }));
    await call(ENG.runForEvent, ev(tidV, crmV, "crm.contact.created", { contactId: cv1 }));
    const kept = await P.automationRule.findMany({ where: { id: { in: [RVt, RVw, RVo] } } });
    chk("C2.1-U.1", "uiVersion 1: an enabled CRM rule does nothing for an event of that system (direct and through the engine) — no run row, no tag — and the rule rows are KEPT (still enabled)",
      r1.ok && (r1.v?.runs ?? 0) === 0 && !(await hasTag(cv1, "v")) && (await runsOf(RVt)).length === 0 && kept.length === 3 && kept.every((k: Any) => k.enabled), "nothing · kept",
      `runs=${r1.err || j(r1.v)} tag=${await hasTag(cv1, "v")} rows=${(await runsOf(RVt)).length} kept=${kept.length}`);
    await cron({ now: NOW, tenantId: tidV });
    chk("C2.1-U.2", "uiVersion 1: runCronTriggers skips the system (the overdue activity fires nothing)", !(await hasTag(cvo, "v-overdue")) && (await runsOf(RVo)).length === 0, "skipped", `tag=${await hasTag(cvo, "v-overdue")}`);
    await waits({ now: new Date(NOW.getTime() + 2 * DAY), tenantId: tidV });
    const wMid = (await runsOf(RVw)).find((x) => x.id === wBefore[0]?.id);
    chk("C2.1-U.3", "uiVersion 1: a WAITING step created while the system was at 2 is NOT executed and NOT cancelled by runDueWaits (row kept WAITING)",
      wBefore.length === 1 && wMid?.status === "WAITING" && !(await hasTag(cvw, "v-after")), "kept waiting", `before=${wBefore.length} now=${wMid?.status ?? "-"} tag=${await hasTag(cvw, "v-after")}`);
    const cuV = await mkCustomer(tidV, memV, "สมาชิก V", false, null);
    const jv = await call(JRN.createJourney, mCtx(tidV, memV), owner, jIn("journey V", [{ type: "ADD_TAG", params: { tag: `jv-${rand}` } }]));
    const mv = await call(JRN.runForEvent, mEvt(tidV, cuV.id), { now: NOW, deps: mDeps });
    await P.automationRule.create({ data: { tenantId: tidV, name: `v1 V ${TAG}`, event: "crm.contact.created", enabled: true, actionType: "NOTIFY", actionConfig: { title: `${TAG}-v1v` } } });
    await call(ENG.runForEvent, ev(tidV, crmV, "crm.contact.created", { contactId: cv1 }, `crm.contact.created#${cv1}#v1v`));
    chk("C2.1-U.4", "uiVersion 1: v1 automation of the other modules is unchanged — the tenant-level KANBAN rule on crm.contact.created notifies, the member journey of the same tenant runs (positive control)",
      (await P.appNotification.count({ where: { tenantId: tidV, title: `${TAG}-v1v` } })) === 1 && jv.ok && mv.ok && mv.v?.runs === 1, "v1 1 · journey 1",
      `v1=${await P.appNotification.count({ where: { tenantId: tidV, title: `${TAG}-v1v` } })} journey=${mv.err || j(mv.v)}`);
    const n0 = await P.automationRule.count({ where: { tenantId: tidV } });
    const refused = [
      await call(AUTO.createRule, cV, owner, { name: `V ใหม่ ${TAG}`, trigger: { event: "crm.contact.created" }, actions: [{ type: "ADD_TAG", params: { tag: "x" } }] }),
      await call(AUTO.applyStarterRules, cV, owner),
      await call(AUTO.dryRun, cV, owner, { name: "x", trigger: { event: "crm.contact.created" }, actions: [{ type: "ADD_TAG", params: { tag: "x" } }] }, {}),
      await call(AUTO.toggleRule, cV, owner, RVt, false),
    ];
    const still = await P.automationRule.findFirst({ where: { id: RVt } });
    chk("C2.1-U.5", "uiVersion 1: createRule / applyStarterRules / dryRun / toggleRule are refused with the Thai CRM_V2_DISABLED message and write nothing",
      refused.every(refusedThai) && (await P.automationRule.count({ where: { tenantId: tidV } })) === n0 && still?.enabled === true, "4 refused",
      refused.map((b) => (b.ok ? "ACCEPTED" : cut(b.err, 50))).join(" | "));
    await setCrm(crmV, { uiVersion: 2 });
    await waits({ now: new Date(NOW.getTime() + 2 * DAY + 20 * 60_000), tenantId: tidV });
    const cv2 = await rawContact(tidV, crmV, "V สอง");
    await runCrm(ev(tidV, crmV, "crm.contact.created", { contactId: cv2 }));
    const wEnd = (await runsOf(RVw)).find((x) => x.id === wBefore[0]?.id);
    chk("C2.1-U.6", "flip back to 2: the kept WAITING step resumes (v-after tag, row OK) and a new event runs the kept rule",
      wEnd?.status === "OK" && (await hasTag(cvw, "v-after")) && (await hasTag(cv2, "v")), "resumed", `wait=${wEnd?.status ?? "-"} after=${await hasTag(cvw, "v-after")} new=${await hasTag(cv2, "v")}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X1 — scope: other system / other tenant / foreign refs / rights
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── X1 · scope ──");
  {
    const cAx = await rawContact(tidA, crmA, "เหยื่อข้ามร้าน");
    const cBx = await rawContact(tidB, crmB, "ลูกค้า B");
    const RB1 = await mkRule(cB, { trigger: { event: "crm.contact.created" }, actions: [{ type: "ADD_TAG", params: { tag: "x1-b" } }] });
    const RA1 = await mkRule(cA, { trigger: { event: "crm.contact.created" }, actions: [{ type: "ADD_TAG", params: { tag: "x1-a" } }] });
    await runCrm(ev(tidB, crmB, "crm.contact.created", { contactId: cAx }));
    await runCrm(ev(tidA, crmA, "crm.contact.created", { contactId: cBx }));
    await runCrm(ev(tidA, crmB, "crm.contact.created", { contactId: cAx }));
    chk("C2.1-X1.1", "forged ids: tenant B's event naming tenant A's contact · tenant A's event naming B's contact · A's tenant with B's systemId → no rule runs, no contact touched",
      !(await hasTag(cAx, "x1-b")) && !(await hasTag(cAx, "x1-a")) && !(await hasTag(cBx, "x1-a")) && (await runsOf(RB1)).length === 0 && (await runsOf(RA1)).length === 0, "nothing",
      `A.b=${await hasTag(cAx, "x1-b")} A.a=${await hasTag(cAx, "x1-a")} B.a=${await hasTag(cBx, "x1-a")} runsB=${(await runsOf(RB1)).length} runsA=${(await runsOf(RA1)).length}`);
    const n0 = await P.automationRule.count({ where: { tenantId: tidA } });
    const T = { event: "crm.contact.created" };
    const bad = [
      await call(AUTO.createRule, cA, owner, { name: `ต่าง1 ${TAG}`, trigger: T, actions: [{ type: "MOVE_STAGE", params: { stageId: pX.st[1] } }] }),
      await call(AUTO.createRule, cA, owner, { name: `ต่าง2 ${TAG}`, trigger: T, actions: [{ type: "ASSIGN", params: { userId: userX } }] }),
      await call(AUTO.createRule, cA, owner, { name: `ต่าง3 ${TAG}`, trigger: T, actions: [{ type: "OPEN_KANBAN_CARD", params: { boardId: boardB, title: "x" } }] }),
      await call(AUTO.createRule, cA, owner, { name: `ต่าง4 ${TAG}`, trigger: T, actions: [{ type: "CREATE_DEAL", params: { pipelineId: pX.id, titleTpl: "x" } }] }),
      await call(AUTO.createRule, cA, owner, { name: `ต่าง5 ${TAG}`, trigger: T, pipelineId: pX.id, actions: [{ type: "ADD_TAG", params: { tag: "x" } }] }),
    ];
    chk("C2.1-X1.2", "createRule refuses refs outside the tenant/system (Thai, nothing written): stage of system A2 · a user who is not a member · a board of tenant B · a pipeline of A2 (action and rule.pipelineId)",
      bad.every(refusedThai) && (await P.automationRule.count({ where: { tenantId: tidA } })) === n0, "5 refused", bad.map((b) => (b.ok ? "ACCEPTED" : cut(b.err, 40))).join(" | "));
    const cF = await rawContact(tidA, crmA, "ลูกค้าอ้างอิงแปลก");
    const dF = await rawDeal(cA, cF, pA);
    const RF = await rawRule(cA, { name: `ดิบ ${TAG}`, trigger: { event: "crm.deal.reassigned" }, actions: [{ type: "MOVE_STAGE", params: { stageId: pX.st[2] } }, { type: "ASSIGN", params: { userId: userX } }, { type: "ADD_TAG", params: { tag: "x1-after" } }] });
    await runCrm(ev(tidA, crmA, "crm.deal.reassigned", { dealId: dF }));
    const dRow = await P.crmDeal.findFirst({ where: { id: dF } });
    const cRow = await P.crmContact.findFirst({ where: { id: cF } });
    chk("C2.1-X1.3", "runtime guard (raw row bypassing validation): MOVE_STAGE to a stage of another system and ASSIGN to an outsider do nothing, the next step still runs",
      dRow?.stageId === pA.st[0] && cRow?.ownerUserId === userA && dRow?.ownerUserId !== userX && (await hasTag(cF, "x1-after")) && (await runsOf(RF)).length >= 1, "blocked · next ran",
      `stage=${dRow?.stageId === pA.st[0]} owner=${cRow?.ownerUserId === userA} next=${await hasTag(cF, "x1-after")}`);
    const inp = { name: `staff ${TAG}`, trigger: T, actions: [{ type: "ADD_TAG", params: { tag: "x" } }] };
    const anyRule = RULES[0] ?? NONE;
    const sr = [
      await call(AUTO.createRule, cA, staff, inp), await call(AUTO.listRules, cA, staff), await call(AUTO.dryRun, cA, staff, inp, {}),
      await call(AUTO.toggleRule, cA, staff, anyRule, false), await call(AUTO.deleteRule, cA, staff, anyRule, { confirm: true, reason: "ลองลบกฎ" }),
      await call(AUTO.listRules, { tenantId: tidA, systemId: crmB, actorUserId: userA }, owner),
      await call(AUTO.createRule, { tenantId: tidA, systemId: crmB, actorUserId: userA }, owner, inp),
    ];
    chk("C2.1-X1.4", "rights (C1.7): STAFF without crm.automation.manage is refused create/list/dryRun/toggle/delete · an OWNER passing another tenant's CRM systemId is refused (NOT_FOUND-style Thai) — nothing written",
      sr.every((r) => !r.ok && r.code !== "MISSING_FUNCTION") && sr.slice(5).every(refusedThai) && (await P.automationRule.count({ where: { tenantId: tidA } })) === n0 + 1 && (await P.automationRule.count({ where: { tenantId: tidB } })) === 1,
      "7 refused", sr.map((b) => (b.ok ? "ACCEPTED" : cut(b.err, 36))).join(" | "));
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X3 — loops: a rule re-triggered by its own chain stops (lab tenant, our own pump)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── X3 · loop guard ──");
  {
    const cl1 = await rawContact(tidL, crmL, "วนตัวเอง");
    const RL1 = await mkRule(cL, { name: `วน1 ${TAG}`, trigger: { event: "crm.activity.logged" }, actions: [{ type: "CREATE_ACTIVITY", params: { type: "TASK", title: "ตามต่อ {ชื่อ}" } }] });
    const lg = await call(AC.logActivity, cL, owner, { type: "NOTE", title: `เริ่ม ${TAG}`, contactId: cl1 });
    const p1 = await pump(tidL);
    const n1 = await actsOf(cl1);
    chk("C2.1-X3.2", "self-trigger: rule \"on crm.activity.logged → CREATE_ACTIVITY\" fired through the real consumers stops by itself — our pump goes quiet within 25 rounds and at most 3 activities were generated",
      lg.ok && p1.quiet && n1 >= 2 && n1 <= 4 && (await mainRuns(RL1, ["OK"])).length >= 1, "bounded", `log=${lg.err || "ok"} pump=${j(p1)} activities=${n1} runs=${(await mainRuns(RL1, ["OK"])).length}`);
    const cl2 = await rawContact(tidL, crmL, "ปิงปอง");
    const dl = await rawDeal(cL, cl2, pL);
    const RL2 = await mkRule(cL, { name: `ปิง ${TAG}`, trigger: { event: "crm.deal.stage.changed" }, conditions: { mode: "AND", items: [{ field: "d.stageId", op: "eq", value: pL.st[1] }] }, actions: [{ type: "MOVE_STAGE", params: { stageId: pL.st[2] } }] });
    const RL3 = await mkRule(cL, { name: `ปอง ${TAG}`, trigger: { event: "crm.deal.stage.changed" }, conditions: { mode: "AND", items: [{ field: "d.stageId", op: "eq", value: pL.st[2] }] }, actions: [{ type: "MOVE_STAGE", params: { stageId: pL.st[1] } }] });
    const mv = await call(D.moveDeal, cL, owner, dl, { stageId: pL.st[1] });
    const p2 = await pump(tidL);
    const hist = await P.crmDealStageHistory.count({ where: { dealId: dl } });
    const skipped = [...(await runsOf(RL2)), ...(await runsOf(RL3))].filter((r) => r.status === "SKIPPED" && thai(r.detail));
    chk("C2.1-X3.3", "ping-pong: two rules moving a deal back and forth stop — pump quiet within 25 rounds, ≤ 6 stage-history rows",
      mv.ok && p2.quiet && hist >= 2 && hist <= 6, "bounded", `move=${mv.err || "ok"} pump=${j(p2)} history=${hist}`);
    chk("C2.1-X3.4", "the loop stop leaves a trace: a SKIPPED run of one of the two rules with a Thai reason", skipped.length >= 1, "≥ 1 SKIPPED", `skipped=${skipped.length}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X4 — redelivery: one run per (rule, contact, eventKey) — sequential, 10-way parallel, real consumer path, DB unique
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── X4 · redelivery ──");
  {
    const RX = await mkRule(cA, { name: `X4 ${TAG}`, trigger: { event: "crm.contact.created" }, actions: [{ type: "CREATE_ACTIVITY", params: { type: "TASK", title: "ต้อนรับ {ชื่อ}" } }, { type: "SEND_EMAIL", params: { subject: "ยินดีต้อนรับ", template: "สวัสดี {ชื่อ}" } }] });
    const mkX = async (s: string) => { const e = mailOf(`x4${s}`); const id = await rawContact(tidA, crmA, `X4 ${s}`, { email: e }); await grant(tidA, crmA, id, "EMAIL"); return { id, e }; };
    const x1 = await mkX("a");
    const e1 = ev(tidA, crmA, "crm.contact.created", { contactId: x1.id });
    const s1 = [await runCrm(e1), await runCrm(e1)];
    chk("C2.1-X4.1", "the same event delivered twice in sequence → ONE main run for (rule, contact) · one activity · one e-mail",
      s1.every((x) => x.ok) && (await runsFor(RX, x1.id)).length === 1 && (await actsOf(x1.id)) === 1 && sent("EMAIL", x1.e) === 1, "once",
      `runs=${(await runsFor(RX, x1.id)).length} acts=${await actsOf(x1.id)} mail=${sent("EMAIL", x1.e)}`);
    const rounds: string[] = [];
    let ok2 = true;
    for (const s of ["b", "c"]) {
      const x = await mkX(s);
      const e = ev(tidA, crmA, "crm.contact.created", { contactId: x.id });
      const par = await Promise.all(Array.from({ length: 10 }, () => runCrm(e)));
      const runs = (await runsFor(RX, x.id)).length;
      const acts = await actsOf(x.id);
      const mails = sent("EMAIL", x.e);
      rounds.push(`${runs}/${acts}/${mails}${par.some((p) => !p.ok) ? "!" : ""}`);
      ok2 = ok2 && par.every((p) => p.ok) && runs === 1 && acts === 1 && mails === 1;
    }
    chk("C2.1-X4.2", "10 parallel deliveries of a fresh event (2 rounds, separate connections) → exactly one run, one activity, one e-mail per round", ok2, "1/1/1 ×2", rounds.join(" "));
    const created = await call(CT.createContact, cA, owner, { firstName: pii(`X4 จริง ${TAG}`), phone: phoneOf() });
    const cid = idOf(created.v);
    const row = (await P.outboxEvent.findMany({ where: { tenantId: tidA, type: "crm.contact.created", payload: { path: ["contactId"], equals: cid } } })) as Any[];
    const evt = row[0] ? evtOf(row[0]) : null;
    const deliveries = evt ? [await consume(evt), await consume(evt), ...(await Promise.all(Array.from({ length: 3 }, () => consume(evt))))] : [];
    chk("C2.1-X4.3", "the REAL consumer path (consumers[\"crm.contact.created\"] on the service's outbox row) delivered 2× in sequence + 3× in parallel → ONE run, ONE activity",
      created.ok && !!evt && deliveries.every((d) => d.ok) && (await runsFor(RX, cid)).length === 1 && (await actsOf(cid)) === 1, "once",
      `contact=${created.err || cid} event=${!!evt} runs=${(await runsFor(RX, cid)).length} acts=${await actsOf(cid)} ${deliveries.find((d) => !d.ok)?.err ?? ""}`);
    let dup = "";
    try {
      for (let i = 0; i < 2; i += 1)
        await P.$executeRawUnsafe(`INSERT INTO "AutomationRun" ("id","tenantId","ruleId","status","crmContactId","eventKey","createdAt") VALUES ($1,$2,$3,'SKIPPED',$4,$5,now())`,
          `${TAG}-dup-${i}`, tidA, RX, x1.id, `${TAG}-dupkey`);
      dup = "both inserted";
    // ORACLE-EDIT C2.1-X4.4 (controller · 20 Sep): with the pg driver adapter Prisma raises P2010 and the Postgres code sits in
    //   meta.driverAdapterError.cause.originalCode (meta.code is undefined) — read that plus the message; the DB rejection itself
    //   is unchanged (builder evidence: "Raw query failed. Code: `23505` … unique constraint").
    } catch (e) { dup = `${(e as Any)?.meta?.driverAdapterError?.cause?.originalCode ?? (e as Any)?.meta?.code ?? ""} ${(e as Error).message}`; }
    chk("C2.1-X4.4", "the dedupe lives in the database (C2.0 partial UNIQUE(ruleId, crmContactId, eventKey)): a second raw row with the same triple is rejected (23505)",
      /23505|unique/i.test(dup), "23505", cut(dup, 120));
    const x5 = await mkX("e");
    await runCrm(ev(tidA, crmA, "crm.contact.created", { contactId: x5.id }));
    chk("C2.1-X4.5", "positive control: the same rule still runs for another contact / another event (dedupe is per (rule, contact, eventKey), not per rule)",
      (await runsFor(RX, x5.id)).length === 1 && (await actsOf(x5.id)) === 1, "1", `runs=${(await runsFor(RX, x5.id)).length}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X5 — WAIT_THEN rows: overlapping runDueWaits (CRM + member path) · crash after claim · overlapping cron
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── X5 · leases ──");
  {
    // distinct triggers no other rule of system A listens to (crm.contact.created is shared by several scenarios)
    const RW1 = await mkRule(cA, { name: `X5 1 ${TAG}`, trigger: { event: "crm.contact.assigned" }, actions: [{ type: "WAIT_THEN", params: { days: 1, thenActions: [{ type: "CREATE_ACTIVITY", params: { type: "TASK", title: "หลังรอ 1" } }] } }] });
    const RW2 = await mkRule(cA, { name: `X5 2 ${TAG}`, trigger: { event: "crm.deal.reopened" }, actions: [{ type: "WAIT_THEN", params: { days: 1, thenActions: [{ type: "CREATE_ACTIVITY", params: { type: "TASK", title: "หลังรอ 2" } }] } }] });
    const titled = (contactId: string, title: string) => P.crmActivity.count({ where: { contactId, title } }) as Promise<number>;
    const cw1 = await rawContact(tidA, crmA, "X5 หนึ่ง");
    await runCrm(ev(tidA, crmA, "crm.contact.assigned", { contactId: cw1, toUserId: userA }));
    const T2 = new Date(NOW.getTime() + 2 * DAY);
    const w1 = await waitingOf(RW1);
    const par = await Promise.all([waits({ now: T2, tenantId: tidA }), waits({ now: T2, tenantId: tidA }), call(JRN.runDueWaits, { now: T2, tenantId: tidA, deps: mDeps })]);
    const w1b = (await runsOf(RW1)).find((x) => x.id === w1[0]?.id);
    chk("C2.1-X5.1", "overlapping runDueWaits (CRM ×2 + the member path ×1, same instant) → the CRM waiting step runs exactly once (1 activity, row OK) — the member path never cancels a CRM row",
      w1.length === 1 && par.every((x) => x.ok) && w1b?.status === "OK" && (await titled(cw1, "หลังรอ 1")) === 1, "once", `waiting=${w1.length} row=${w1b?.status ?? "-"} acts=${await titled(cw1, "หลังรอ 1")} ${par.map((x) => x.err).join(" ")}`);
    const cw3 = await rawContact(tidA, crmA, "X5 สาม");
    const dw3 = await rawDeal(cA, cw3, pA);
    await runCrm(ev(tidA, crmA, "crm.deal.reopened", { dealId: dw3 }));
    const w3 = (await waitingOf(RW2))[0];
    const lease = Number(RUN?.WAIT_LEASE_MS ?? 15 * 60_000);
    const claimAt = new Date(NOW.getTime() + 3 * DAY);
    const claimed = w3 ? await P.automationRun.updateMany({ where: { id: w3.id, status: "WAITING" }, data: { scheduledAt: new Date(claimAt.getTime() + lease) } }) : { count: 0 };
    await waits({ now: new Date(claimAt.getTime() + 5 * 60_000), tenantId: tidA });
    const mid = (await runsOf(RW2)).find((x) => x.id === w3?.id);
    const actsMid = await titled(cw3, "หลังรอ 2");
    await waits({ now: new Date(claimAt.getTime() + lease + 60_000), tenantId: tidA });
    await waits({ now: new Date(claimAt.getTime() + lease + 120_000), tenantId: tidA });
    const end = (await runsOf(RW2)).find((x) => x.id === w3?.id);
    chk("C2.1-X5.2", "crash after claim (row leased by a dead worker): 5 min later it is left alone · after the 15-min lease it is picked up and run exactly once",
      claimed.count === 1 && mid?.status === "WAITING" && actsMid === 0 && end?.status === "OK" && (await titled(cw3, "หลังรอ 2")) === 1, "left · then once",
      `claimed=${claimed.count} mid=${mid?.status ?? "-"}/${actsMid} end=${end?.status ?? "-"}/${await titled(cw3, "หลังรอ 2")}`);
    const RC = await mkRule(cA, { name: `X5 cron ${TAG}`, trigger: { event: "crm.deal.close_due", params: { daysBefore: 5 } }, actions: [{ type: "CREATE_ACTIVITY", params: { type: "TASK", title: "ใกล้ปิด" } }] });
    const cc = await rawContact(tidA, crmA, "X5 ใกล้ปิด");
    await rawDeal(cA, cc, pA, { expectedCloseAt: new Date(NOW.getTime() + 5 * DAY) });
    const cp = await Promise.all([cron({ now: NOW, tenantId: tidA }), cron({ now: NOW, tenantId: tidA })]);
    await cron({ now: new Date(NOW.getTime() + 60_000), tenantId: tidA });
    chk("C2.1-X5.3", "two overlapping runCronTriggers + a third the same Thai day → one run and one activity for (rule, deal, day)",
      cp.every((x) => x.ok) && (await runsFor(RC, cc)).length === 1 && (await titled(cc, "ใกล้ปิด")) === 1, "once", `runs=${(await runsFor(RC, cc)).length} acts=${await titled(cc, "ใกล้ปิด")}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X6 — WEBHOOK SSRF guard · template variables substituted once · ids-only webhook body
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── X6 · dangerous input ──");
  {
    const n0 = await P.automationRule.count({ where: { tenantId: tidA } });
    const priv = ["http://127.0.0.1:8080/x", "http://169.254.169.254/latest/meta-data", "http://localhost:3000/hook"];
    const bad = await Promise.all(priv.map((url) => call(AUTO.createRule, cA, owner, { name: `ssrf ${url} ${TAG}`, trigger: { event: "crm.contact.created" }, actions: [{ type: "WEBHOOK", params: { url } }] })));
    chk("C2.1-X6.1", "createRule refuses WEBHOOK to 127.0.0.1 · 169.254.169.254 · localhost (webhookTargetProblem, Thai) — nothing written",
      bad.every(refusedThai) && (await P.automationRule.count({ where: { tenantId: tidA } })) === n0, "3 refused", bad.map((b) => (b.ok ? "ACCEPTED" : cut(b.err, 40))).join(" | "));
    const cs = await rawContact(tidA, crmA, "SSRF");
    const RS = await rawRule(cA, { name: `ssrf ดิบ ${TAG}`, trigger: { event: "crm.contact.created" }, actions: [{ type: "WEBHOOK", params: { url: priv[1] } }, { type: "ADD_TAG", params: { tag: "x6-next" } }] });
    const postsBefore = POSTS.length;
    await runCrm(ev(tidA, crmA, "crm.contact.created", { contactId: cs }));
    const rr = (await mainRuns(RS, ["OK", "FAILED"]))[0];
    chk("C2.1-X6.2", "runtime guard (raw row bypassing validation): the metadata URL is never posted (neither the injected sender nor fetch) · the step records a Thai reason · the next step still runs",
      POSTS.length === postsBefore && !FETCHES.some((u) => u.includes("169.254")) && /[ก-๙]/.test(j(rr)) && (await hasTag(cs, "x6-next")), "blocked",
      `posts=${POSTS.length - postsBefore} fetch=${FETCHES.filter((u) => u.includes("169.254")).length} run=${cut(j(rr?.detail), 100)} next=${await hasTag(cs, "x6-next")}`);
    const weird = pii(`${TAG} {ชื่อ} {ดีล} <b>x</b>`);
    const partyId = await mkParty(tidA, weird);
    const phone = phoneOf();
    const email = mailOf("x6");
    const cw = (await P.crmContact.create({ data: { tenantId: tidA, systemId: crmA, name: weird, firstName: weird, phone, email, partyId, ownerUserId: userA } })).id as string;
    await mkRule(cA, { name: `แม่แบบ ${TAG}`, trigger: { event: "crm.contact.created" }, actions: [{ type: "CREATE_ACTIVITY", params: { type: "TASK", title: "สวัสดี {ชื่อ}" } }, { type: "WEBHOOK", params: { url: "https://hooks.example.com/qc-c21-x6" } }] });
    await runCrm(ev(tidA, crmA, "crm.contact.created", { contactId: cw }));
    const acts = ((await P.crmActivity.findMany({ where: { contactId: cw } })) as Any[]).filter((x) => String(x.title).startsWith("สวัสดี"));
    chk("C2.1-X6.3", "template variables are substituted ONCE: a contact named \"… {ชื่อ} {ดีล} <b>x</b>\" yields the title \"สวัสดี \" + the name verbatim (no recursive expansion)",
      acts.length === 1 && acts[0].title === `สวัสดี ${weird}`, "verbatim", `titles=${cut(j(acts.map((a) => a.title)), 160)}`);
    const body = POSTS.find((p) => p.url === "https://hooks.example.com/qc-c21-x6")?.body;
    const bj = typeof body === "string" ? body : j(body);
    let parsed: Any = null;
    try { parsed = JSON.parse(bj); } catch { parsed = null; }
    chk("C2.1-X6.4", "the WEBHOOK body is a JSON object carrying ids (contactId) and NO name / phone / e-mail of the contact",
      !!parsed && typeof parsed === "object" && bj.includes(cw) && !bj.includes(phone) && !bj.includes(email) && !bj.includes(weird), "ids only", cut(bj, 200));
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X8 — consent at send time · opt-out · no PII in runs / ops
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── X8 · PDPA ──");
  {
    const lineW = `U${TAG.replace(/-/g, "")}x8`;
    const c8 = await rawContact(tidA, crmA, "X8 ถอน", { lineUserId: lineW });
    await grant(tidA, crmA, c8, "LINE");
    const R8 = await mkRule(cA, { name: `X8 ${TAG}`, trigger: { event: "crm.contact.created" }, actions: [{ type: "SEND_LINE", params: { template: "ครั้งแรก" } }, { type: "WAIT_THEN", params: { days: 1, thenActions: [{ type: "SEND_LINE", params: { template: "ครั้งที่สอง" } }] } }] });
    await runCrm(ev(tidA, crmA, "crm.contact.created", { contactId: c8 }));
    const first = sent("LINE", lineW);
    await new Promise((r) => setTimeout(r, 20));
    await grant(tidA, crmA, c8, "LINE", false);
    await waits({ now: new Date(NOW.getTime() + 2 * DAY), tenantId: tidA });
    const w = (await runsOf(R8)).filter((r) => r.stepIndex !== null);
    chk("C2.1-X8.1", "consent withdrawn DURING the wait → the waiting SEND_LINE is not sent (sender not called), the row is finished with a Thai consent reason",
      first === 1 && sent("LINE", lineW) === 1 && w.length === 1 && w[0].status !== "WAITING" && /ยินยอม/.test(j(w[0])), "skipped", `first=${first} total=${sent("LINE", lineW)} row=${cut(j(w[0]?.detail ?? w[0]?.payload), 160)}`);
    const eo = mailOf("x8o");
    const en = mailOf("x8n");
    const co = await rawContact(tidA, crmA, "X8 ขอไม่รับ", { email: eo, marketingOptOut: true });
    await grant(tidA, crmA, co, "EMAIL");
    const cn = await rawContact(tidA, crmA, "X8 ไม่เคยตอบ", { email: en });
    const RO = await mkRule(cA, { name: `X8o ${TAG}`, trigger: { event: "crm.contact.updated" }, actions: [{ type: "SEND_EMAIL", params: { subject: "โปร", template: "ลดราคา" } }] });
    await runCrm(ev(tidA, crmA, "crm.contact.updated", { contactId: co, changedKeys: ["tags"] }));
    await runCrm(ev(tidA, crmA, "crm.contact.updated", { contactId: cn, changedKeys: ["tags"] }));
    const ro = (await runsFor(RO, co, ["OK", "FAILED"]))[0];
    const rn = (await runsFor(RO, cn, ["OK", "FAILED"]))[0];
    chk("C2.1-X8.2", "marketingOptOut contact and a contact who never consented: SEND_EMAIL is not sent (canContact false at send time) — steps skipped with a Thai reason, runs not FAILED",
      sent("EMAIL", eo) === 0 && sent("EMAIL", en) === 0 && ro?.status === "OK" && rn?.status === "OK" && thai(j(ro?.detail)) && thai(j(rn?.detail)), "not sent",
      `optOut=${sent("EMAIL", eo)} none=${sent("EMAIL", en)} runs=${ro?.status ?? "-"}/${rn?.status ?? "-"}`);
    const MY = TENANTS;
    const crmRuleIds = ((await P.automationRule.findMany({ where: { tenantId: { in: MY }, scope: "CRM" }, select: { id: true } })) as Any[]).map((r) => r.id);
    const runs = (await P.automationRun.findMany({ where: { ruleId: { in: crmRuleIds } } })) as Any[];
    const secrets = PII.filter((s) => /@|^0\d{9}$/.test(s));
    const badRuns = runs.filter((r) => secrets.some((s) => j({ d: r.detail, p: r.payload }).includes(s)));
    const ops = (await P.opsEvent.findMany({ where: { tenantId: { in: MY } } })) as Any[];
    const badOps = ops.filter((o) => secrets.some((s) => j({ m: o.message, d: o.detail }).includes(s)));
    chk("C2.1-X8.3", "no phone / e-mail of our fixtures in any CRM-rule AutomationRun (detail, payload) nor in OpsEvent of our tenants",
      runs.length > 0 && badRuns.length === 0 && badOps.length === 0, "none", `runs=${runs.length} bad=${badRuns.length} ops=${ops.length} badOps=${badOps.length}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X9 — audited mutations · delete = danger (confirm + reason ≥ 5) · caps
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── X9 · danger + audit ──");
  {
    const inp = { name: `ตรวจสอบ ${TAG}`, trigger: { event: "crm.contact.created" }, actions: [{ type: "ADD_TAG", params: { tag: "x9" } }] };
    const cr = await call(AUTO.createRule, cA, owner, inp);
    const id = idOf(cr.v);
    const up = await call(AUTO.updateRule, cA, owner, id, { ...inp, name: `ตรวจสอบแก้ ${TAG}` });
    const tg = await call(AUTO.toggleRule, cA, owner, id, false);
    const d1 = await call(AUTO.deleteRule, cA, owner, id, {});
    const d2 = await call(AUTO.deleteRule, cA, owner, id, { confirm: true, reason: "abc" });
    const still = await P.automationRule.findFirst({ where: { id } });
    const d3 = await call(AUTO.deleteRule, cA, owner, id, { confirm: true, reason: "ลบกฎทดสอบของข้อสอบ" });
    const gone = !(await P.automationRule.findFirst({ where: { id } }));
    const audits = (await P.auditLog.findMany({ where: { tenantId: tidA, targetId: id } })) as Any[];
    chk("C2.1-X9.1", "create / update / toggle / delete of a CRM rule each write an audit row (action crm.automation.*, targetId = rule id)",
      cr.ok && up.ok && tg.ok && d3.ok && audits.filter((a) => /^crm\.automation\./.test(a.action)).length >= 4, "≥ 4 audits",
      `create=${cr.err || "ok"} update=${up.err || "ok"} toggle=${tg.err || "ok"} audits=${audits.map((a) => a.action).join(",") || "-"}`);
    chk("C2.1-X9.2", "deleteRule is a danger op: without confirm, or with a reason < 5 chars → refused (Thai), rule kept · with confirm + reason → deleted",
      refusedThai(d1) && refusedThai(d2) && !!still && d3.ok && gone, "refused ×2 · then deleted", `noConfirm=${d1.ok ? "ACCEPTED" : cut(d1.err, 40)} short=${d2.ok ? "ACCEPTED" : cut(d2.err, 40)} kept=${!!still} gone=${gone}`);
    const many = await call(AUTO.updateRule, cA, owner, RULES[0] ?? NONE, { name: `ยาว ${TAG}`, trigger: { event: "crm.contact.created" }, actions: Array.from({ length: 21 }, () => ({ type: "ADD_TAG", params: { tag: "x" } })) });
    chk("C2.1-X9.3", "caps hold on update too: 21 actions refused (Thai) — the stored rule is unchanged", refusedThai(many), "refused", many.ok ? "ACCEPTED" : cut(many.err, 80), "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S8 — UI (static): page guards · nav · inventory/testids · client safety · K2.9 reuse
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S8 · UI (static) ──");
  {
    const page = read(PAGE);
    chk("C2.1-S8.1", `page ${PAGE}: CRM system guard (type "CRM") → requireCrmV2Page → crmCan(… "crm.automation.manage") else notFound()`,
      page.length > 0 && /type:\s*"CRM"/.test(page) && /requireCrmV2Page/.test(page) && /crm\.automation\.manage/.test(page) && /notFound\(/.test(page), "guarded",
      `exists=${page.length > 0} v2=${/requireCrmV2Page/.test(page)} perm=${/crm\.automation\.manage/.test(page)}`);
    const nav = read(NAV_FILE);
    let inv: Any[] = [];
    try { inv = (JSON.parse(read(INVENTORY)).rows ?? []) as Any[]; } catch { inv = []; }
    const rows = inv.filter((r) => r?.wo === "C2.1" && /\/settings\/automation/.test(String(r?.page ?? "")));
    const uiSrc = [page, ...walk(PAGE_DIR).map(read), ...walk(COMP_DIR).map(read)].join("\n");
    const orphan = rows.filter((r) => !uiSrc.includes(String(r.testid ?? "")));
    chk("C2.1-S8.2", "nav: CRM_DEEP_NAV has path /crm/settings/automation (status ready, wo C2.1) · inventory: ≥ 5 rows (page /settings/automation, wo C2.1) whose testid appears in the page/components",
      /path:\s*"\/crm\/settings\/automation"[^}]*status:\s*"ready"[^}]*wo:\s*"C2\.1"/.test(nav) && rows.length >= 5 && orphan.length === 0, "nav + rows",
      `nav=${/\/crm\/settings\/automation/.test(nav)} rows=${rows.length} orphan=${orphan.map((r) => r.testid).join(",") || "-"}`, "MAJOR");
    const files = [...walk(PAGE_DIR), ...walk(COMP_DIR)];
    const clientBad = files.filter((f) => /^\s*["']use client["']/.test(read(f)) && /from\s+["'](@\/lib\/core\/db|@prisma\/client|@\/lib\/modules\/crm(\/(?!.*-shared)[^"']*)?|@\/lib\/modules\/crm\/automation)["']/.test(read(f)));
    const serverFiles = files.filter((f) => /^\s*["']use server["']/.test(read(f)));
    const serverBad = serverFiles.filter((f) => /export\s+(type|interface|const|let|function\s)/.test(read(f)) || !/assertCrmV2|crmUiVersion/.test(read(f)));
    chk("C2.1-S8.3", "client files never import prisma-reaching modules (only *-shared) · \"use server\" files export async functions only and call assertCrmV2",
      files.length > 0 && clientBad.length === 0 && serverFiles.length >= 1 && serverBad.length === 0, "safe",
      `files=${files.length} clientBad=${clientBad.join(",") || "-"} server=${serverFiles.length} serverBad=${serverBad.join(",") || "-"}`, "MAJOR");
    chk("C2.1-S8.4", "the rule builder reuses the K2.9 sentence-builder UI (imports from @/components/kanban/ or a shared automation component) rather than a third builder [static]",
      /from\s+["']@\/components\/(kanban|shared|automation)\//.test(uiSrc), "reuse", String(/from\s+["']@\/components\/(kanban|shared|automation)\//.test(uiSrc)), "MINOR");
  }
} catch (e) {
  chk("C2.1-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — every row of the throwaway tenants (4 passes over every table with tenantId), systems/units/tenants, users.
  // No drainOutbox (not tenant-scoped) — our PENDING events go with the tenant sweep.
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
        const n = Number(r?.[0]?.n ?? 0);
        if (n > 0) left.push(`${t}=${n}`);
      }
      const tenants = await P.tenant.count({ where: { id: { in: ids } } });
      const users = USERS.length ? await P.user.count({ where: { id: { in: USERS } } }) : 0;
      chk("C2.1-CLEAN", "the oracle gives the QC database back exactly as found — every throwaway tenant, every row it owned and the throwaway users are gone",
        left.length === 0 && tenants === 0 && users === 0, "0 rows · 0 tenants · 0 users", `${left.join(" · ") || "-"} · tenants=${tenants} users=${users}`, "MAJOR");
    } catch (e) {
      chk("C2.1-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C2.1: ${passed}/${total} · outbound fetch stubbed ${FETCHES.length}×`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
