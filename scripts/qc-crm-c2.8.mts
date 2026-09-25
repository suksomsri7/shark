// QC — CRM v2 WO C2.8: lead scoring — `src/lib/modules/crm/scoring.ts` + `scoring-shared.ts` · facade entry `crm.scoring` ·
//      events crm.score.changed / crm.score.threshold (3 registries + consumers) · scoring extras in `src/lib/platform/crm-bridges/scoring.ts`
//      (R-D) · daily job `crm.scoring.decay` · ADJUST_SCORE wiring in automation.ts (C2.1 stub) · FormDef.scoreOnSubmit ·
//      UI `/crm/settings/scoring` + score badge & reasons on the contact 360
// Oracle writer · the C2.8 builder must NOT touch this file · QC database only (.env.qc / .env.qc2 — loaded by scripts/acc-v2-env.mts)
// Run: bash scripts/iso.sh bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c2.8.mts
//      `--force-run` = run every check while `scoring.ts` is absent — C2.8 checks red for the right reason ("module absent"),
//                      fixtures + positive controls + CLEAN green: proves the fixtures, the worker processes and the cleanup
//      `--x3-worker …` = internal worker mode (own PrismaClient = own pool) — see the block below
// requires: crm-seed   (house style — this oracle reads NO seeded row; everything lives in throwaway tenants `qc-c28-<rand>-*`)
//
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE (not re-implemented here): qc-crm-c2.1 (the `crm.score.threshold` trigger + the
//   ADJUST_SCORE step that stops being a stub + S9.1 trigger catalogue) · qc-crm-c1.4 (contacts: score/scoreBand columns, 360) ·
//   qc-crm-c1.8 (events + 3 registries + the compose contract for CRM extras) · qc-crm-c1.11 (uiVersion switch · business templates) ·
//   qc-crm-c0.5 (minute-job dispatcher: one more daily job) · qc-crm-c2.2 / c2.3 (they share the registries and minute-jobs.ts) ·
//   qc-crm-v1 · qc-cron · qc-webhook · qc-form / qc-forms-notify (scoreOnSubmit) · qc-member-m1.9 (30/15/10/5 — untouched).
//
// SOURCES: crm-brief-C2.8.md · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-A settings service · R-B events NOT built ·
//   R-C.6 cron through crm-cron.mts · R-C.8 keys `<type>#<id>#<seq>` · R-D crm-bridges/scoring.ts + default file ownership ·
//   R-E.14 uiVersion 1 ⇒ rules/jobs/bridges skip, rows kept, resume at 2) · CRM-RUN §2 "C2.8" (S1 6 · S2 2 · S3 3 · S4 3 · S5 2 ·
//   S6 2 · S7 2 = 20) · MASTER-PLAN §2 §3 §4 (X1 X3 X4 X5 X8 X9) §6 row C2.8 · blueprint §5.7 (`scoring.ts`: onEvent · decay ·
//   explain · rules.* + seed 8 · recompute) §7.1 (`crm.score.changed` {contactId, from, to, band, ruleId} · `crm.score.threshold`
//   {contactId, band}) §7.5 (job `score-decay` daily + band recalc) §4.5 (`settings.crm.scoring` = { hot 50, warm 20, decayDays 30 }) ·
//   mockup 05 (header badge "🔥 ร้อน 72" + three reason chips "+15 นัดสำเร็จ · 2 วันก่อน" = `explain` last 3) ·
//   prisma/schema/crm.prisma (CrmScoreRule · CrmScoreLog + `eventKey` + the partial UNIQUE (ruleId, eventKey) of migration
//   *_crm_v2_b · CrmContact.score/scoreUpdatedAt/scoreBand · enum CrmScoreBand HOT/WARM/COLD) ·
//   src/lib/modules/crm/templates/business/central.ts (`CENTRAL_SCORE_RULES` = THE 8 seeded rules — data shipped by C1.11) ·
//   src/lib/modules/crm/automation-shared.ts (CRM_CRON_TRIGGERS: `crm.score.threshold` cron:true params ["band"] · CRM_ACTION_TYPES
//   has ADJUST_SCORE) · src/lib/modules/crm/automation.ts:1011 (the ADJUST_SCORE skip stub C2.8 must replace) ·
//   src/lib/platform/minute-jobs.ts (registerMinuteJob · cadence "daily" · lease 15 min) · src/lib/platform/crm-bridges/core.ts
//   (crmGate/bridgeOpen — the gate comes first) · lesson [[reference_atomic_counter_single_statement]] (an in-process test cannot
//   tell a JS mutex from a DB-atomic counter ⇒ worker PROCESSES) · [[reference_outbox_new_event_needs_consumer]].
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this) ══════════════════════════════════
//   A. `src/lib/modules/crm/scoring.ts` (new) — ctx = { tenantId, systemId, actorUserId: string | null } · actor = MemberActor ·
//      the system is re-resolved in the tenant (type CRM) else NOT_FOUND · every read through visibleWhere · every mutation writes an
//      AuditLog `crm.score.*` row and emits its outbox event INSIDE the same transaction · Thai errors that never blame the user ·
//      error class ScoringError with `.code` ∈ VALIDATION | NOT_FOUND | FORBIDDEN | CRM_V2_DISABLED (CrmForbiddenError /
//      CrmV2DisabledError accepted) · permission: `crm.score.manage` for rules/settings/recompute/seed · `crm.contact.read` for explain.
//      types ScoreRuleInput = { name (1..120); event (∈ SCORE_RULE_EVENTS); points (int, −1000..1000, ≠ 0); conditions?: { mode?:
//              "AND"|"OR"; items: { field; op; value? }[] } (same shape/fields as the automation conditions of C2.1);
//              expiresDays?: number | null (1..3650); maxPerDay?: number | null (1..1000); active?: boolean }
//            ScoreRuleDto  = { id, name, event, points, conditions, expiresDays, maxPerDay, active, isSystem, sortOrder, seedKey }
//            ScoreExplainItem = { logId, points, reason, ruleId, refType, refId, at, expiresAt }
//      1. seedSystemRules(ctx, actor) → { created, total } — materialises `CENTRAL_SCORE_RULES` (8, in that order) as CrmScoreRule rows
//         of ctx.systemId: name = the Thai label · event/points/maxPerDay/expiresDays from the data · isSystem true · active true ·
//         sortOrder = index · the stable identity is `conditions.seedKey = <key>` (CrmScoreRule has no `key` column — same trick as
//         `trigger.starter` in C2.1) · idempotent under repeats AND under N parallel calls (advisory lock
//         `crm:score-rules-seed:<systemId>` + a seedKey check inside the same tx) ⇒ a second call creates 0 · audit `crm.score.rule.seed`.
//      2. listRules(ctx, actor) → ScoreRuleDto[] (sortOrder asc, id asc) · createRule(ctx, actor, ScoreRuleInput) → dto ·
//         updateRule(ctx, actor, id, Partial<ScoreRuleInput>) → dto · toggleRule(ctx, actor, id, active) → dto ·
//         deleteRule(ctx, actor, id, { confirm: true, reason ≥ 5 chars }) — DANGER (X9): missing confirm / shorter reason ⇒ VALIDATION,
//         nothing deleted · the rule's CrmScoreLog rows are KEPT as history (ruleId has no FK) · reorderRules(ctx, actor, ids) → dto[]
//         VALIDATION (Thai, nothing written): unknown/blank name · event ∉ SCORE_RULE_EVENTS · points 0 or out of range or not an
//         integer · expiresDays/maxPerDay out of range · unknown condition field/op · a rule of another tenant/system ⇒ NOT_FOUND.
//      3. onEvent(ctx, eventType, payload, opts?: { now?: Date; eventKey?: string | null }) →
//           { logged: number; points: number; score: number | null; band: CrmScoreBand | null; skipped?: string }
//         THE scoring entry (called by the bridge for every event a rule references, by the form bridge and by the oracle):
//         • uiVersion ≠ 2 ⇒ { logged: 0, skipped: "DISABLED" }, nothing read or written (R-E.14)
//         • contact resolution from the payload: `contactId` → else `dealId`/`activityId` → their contact → else nothing to score
//           (logged 0, never throws) · a contact of another system/tenant, archived or merged ⇒ nothing scored (X1)
//         • the ACTIVE rules of ctx.systemId with `event === eventType`, ordered (sortOrder asc, id asc) — EVERY matching rule scores
//           (they are not alternatives) · conditions evaluated against the contact/deal like C2.1's conditions
//         • maxPerDay (per rule, per contact, per THAI day) is enforced by ONE conditional statement (`INSERT … SELECT … WHERE
//           (SELECT count(*) …) < maxPerDay`, AUDIT-CLASS X3) — never count-then-insert
//         • the log row: CrmScoreLog { tenantId, contactId, ruleId, points, reason (the rule name), refType/refId (optional),
//           eventKey = opts.eventKey ?? the source event's idempotencyKey, expiresAt = createdAt + (rule.expiresDays ??
//           settings.crm.scoring.decayDays) days (both null/0 ⇒ never expires), expired false }
//           ⇒ the partial UNIQUE (ruleId, eventKey) makes the same event twice / in parallel land exactly ONE row per rule (X4)
//         • the score moves in ONE statement (`SET "score" = GREATEST(0, "score" + $points) … RETURNING`) — never read-modify-write;
//           score never < 0 · scoreUpdatedAt = now · scoreBand recomputed from the new score in the same transaction
//         • events in the same transaction: `crm.score.changed` { contactId, from, to, band, ruleId } key
//           `crm.score.changed#<contactId>#<logId>` · when the band CHANGES: `crm.score.threshold` { contactId, band } key
//           `crm.score.threshold#<contactId>#<band>#<logId>` (once per crossing — re-processing the source event adds neither row)
//      4. adjust(ctx, actor | null, { contactId, points, reason, refType?, refId?, eventKey?, expiresDays?, now? }) →
//         { logId, score, band } — the manual/engine adjustment (ruleId null, so the partial UNIQUE does not apply; `eventKey` is still
//         stored and, when given, makes the call idempotent through a `WHERE NOT EXISTS` on (contactId, eventKey)) · used by
//         ADJUST_SCORE (C2.1) and by FormDef.scoreOnSubmit (C2.6) · a human actor needs `crm.score.manage`; actorUserId null = engine.
//      5. decay(opts?: { now?: Date; tenantIds?: string[]; systemIds?: string[]; batchSize?: number (default 500); deadline?: number;
//         signal?: AbortSignal }) → { expired: number; contacts: number; cutOff: boolean }
//         the daily job body · ONLY uiVersion-2 systems (filtered in SQL) · `systemIds`/`tenantIds` restrict the sweep (the job passes
//         none; tests always pass them) · claims a batch with ONE statement (`UPDATE … WHERE id IN (SELECT id … expiresAt <= now AND
//         expired = false ORDER BY … LIMIT n FOR UPDATE SKIP LOCKED) RETURNING id, contactId`) ⇒ every log expires EXACTLY once under
//         overlapping runs (X5) · then, per touched contact, ONE statement reconciles the total
//         (`SET "score" = GREATEST(0, COALESCE(Σ points WHERE expired = false, 0))`, band + scoreUpdatedAt) ⇒ a process that died
//         between the claim and the settle is REPAIRED by the next run (no double subtraction) · loops batch after batch until quiet
//         or the deadline/signal says stop · a band move emits `crm.score.threshold` once (same keys as above, `#decay#<ymd>` as the
//         last segment when no log id applies).
//      6. applyInactivity(opts?: same as decay) → { logged, contacts } — the rules whose event is the VIRTUAL `crm.contact.inactive`
//         (no outbox event, no consumer — it is cron-driven): a contact whose lastActivityAt (or createdAt when null) is older than
//         `conditions.days ?? 30` gets the rule's points ONCE per inactivity spell (eventKey
//         `crm.contact.inactive#<contactId>#<anchor ISO>`) · called by the same daily job as `decay`.
//      7. explain(ctx, actor, contactId, opts?: { limit?: number (default SCORE_EXPLAIN_LIMIT = 3) }) →
//         { score, band, items: ScoreExplainItem[] } — the NON-EXPIRED logs, newest first, at most `limit` · a contact the actor
//         cannot see / of another system ⇒ NOT_FOUND (404-not-403, X1) · items keep the reason of a DELETED rule (history).
//      8. recompute(ctx, actor, target: { contactId: string } | { all: true }, opts?: { dryRun?: boolean; confirm?: boolean;
//         reason?: string }) → { contacts, changed, items?: { contactId, from, to, band }[] }
//         one contact = normal · `{ all: true }` = DANGER (X9): confirm === true + reason ≥ 5 chars else VALIDATION with NOTHING
//         written · dryRun ⇒ reports the diff and writes NOTHING (no score, no log, no audit, no outbox, no notification) ·
//         a real run writes ONE audit row `crm.score.recompute` (targetId = contactId, or the systemId for `all`) and touches only
//         ctx.systemId (X1).
//      9. getScoringSettings(ctx, actor) → { hot, warm, decayDays } · setScoringSettings(ctx, actor, patch) → the same shape —
//         stored at `AppSystem.settings.crm.scoring` through the C1.5 settings service with ONE `jsonb_set` statement (every other
//         `settings.crm` key survives) · VALIDATION when hot ≤ warm, warm < 0, decayDays < 0 or not integers · audited.
//     10. onFormSubmission / the `scoreOnSubmit` path may live in the bridge, but the points must arrive through `adjust`.
//   B. `src/lib/modules/crm/scoring-shared.ts` — pure (no prisma / next / server-only / ./db): SCORING_DEFAULTS = { hot: 50, warm: 20,
//      decayDays: 30 } · SCORE_EXPLAIN_LIMIT = 3 · SCORE_POINTS_MIN/MAX = ∓1000 · SCORE_DECAY_BATCH · SCORE_RULE_EVENTS (every
//      AUTOMATION_EVENTS value a rule may reference + the virtual `crm.contact.inactive`, ⊇ the 8 seed events) · SCORE_SEED_KEYS
//      (the 8 keys of CENTRAL_SCORE_RULES) · bandOf(score, { hot, warm }) → "HOT" | "WARM" | "COLD".
//   C. facade `src/lib/modules/crm/index.ts`: `export * as scoring from "./scoring"` inside a `// CRM C2.8 ▸ … ◂` block ⇒
//      `crm.scoring.onEvent/adjust/decay/explain/recompute/…` reachable (the bridge and automation.ts load the facade, never the file).
//   D. events · registries · consumers · job (a new event without a consumer stalls the whole queue):
//      • `crm.score.changed` and `crm.score.threshold` declared EXACTLY ONCE in `src/lib/automation/labels.ts` (AUTOMATION_EVENTS,
//        Thai labels, block `// CRM C2.8 ▸ … ◂`) and NOT re-declared in `src/lib/webhooks/labels.ts` (WEBHOOK_EVENTS spreads them)
//      • a consumer for each in `src/lib/outbox-consumers.ts` (block `// CRM C2.8 ▸ … ◂`, `withAutomation(…)` so C2.1's rules run)
//      • `crm.contact.inactive` stays OUT of AUTOMATION_EVENTS (virtual, cron-driven, no emitter/consumer — R-B style)
//      • `CRM_RULE_TRIGGERS` still lists every value EXACTLY ONCE (the new AUTOMATION_EVENTS entry must not duplicate the cron entry)
//        and `crm.score.threshold` keeps `cron: true` + params ["band"] so qc-crm-c2.1 S9.1 stays green
//      • scoring extras: `src/lib/platform/crm-bridges/scoring.ts` exports `onScoringEvent` (gate FIRST — crmGate + bridgeOpen, so a
//        uiVersion-1 / bridges-off system is never scored), composed into the consumers of every event a rule references
//        (forms.submission.received · chat.message.received · crm.activity.completed · crm.email.opened/clicked/received ·
//        crm.deal.quotation.issued) as an "extra" under the `compose` contract (fails ⇒ WARN, never fails the main consumer)
//      • the daily job is registered in `src/lib/platform/minute-jobs.ts` (block `// CRM C2.8 ▸ … ◂`) as name `crm.scoring.decay`,
//        everyMinutes 1440, cadence "daily", NOT vpsOnly, run = decay + applyInactivity through the facade, honouring
//        ctrl.deadline/ctrl.signal · `scripts/crm-cron.mts` imports it (a `scoring-job.ts` mirror like `sequences-job.ts` is optional).
//   E. ADJUST_SCORE (C2.1): the `case "ADJUST_SCORE":` skip stub of `src/lib/modules/crm/automation.ts` becomes a call to
//      `scoring.adjust` (block `// CRM C2.8 ▸ … ◂`) — points from the action params, reason mentioning the rule, refType
//      "AUTOMATION_RULE", refId = the rule id, eventKey tied to the run ⇒ the same run never scores twice.
//      FormDef.scoreOnSubmit (C2.6): the form bridge calls `adjust` once per submission (eventKey `form#<submissionId>`).
//   F. UI: `/app/sys/[id]/crm/settings/scoring/page.tsx` (guard: `type: "CRM"` → requireCrmV2Page → crmCan(…, "crm.score.manage")
//      else notFound()) · `CRM_DEEP_NAV` entry { path "/crm/settings/scoring", status "ready", wo "C2.8" } · ≥ 8 rows in
//      `scripts/crm-ui-inventory.json` (page "/settings/scoring", wo "C2.8") with the testids crm-score-rule-list ·
//      crm-score-rule-new · crm-score-rule-row-* · crm-score-rule-toggle-* · crm-score-rule-delete-* · crm-score-band-hot ·
//      crm-score-band-warm · crm-score-decay-days · crm-score-seed-btn · crm-score-recompute-btn (dry-run first) ·
//      contact 360 (`/contacts/[contactId]`): the score badge gets `data-testid="contact-score-badge"`, the three newest reasons are
//      rendered as chips `contact-score-reason-*` and `contact-score-explain-btn` opens the full list (mockup 05) ·
//      `"use server"` files export async functions only and call assertCrmV2 · no `'use client'` file reaches prisma.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// CHECK INVENTORY: 54 checks = S0 4 · S1 6 · S2 2 · S3 3 · S4 3 · S5 2 · S6 2 · S7 2 (S1–S7 = the 20 of CRM-RUN §2) · S8 7 (brief
//   extras) · X1 3 · X3 5 (X3.1a = the "did the 4 worker processes really run" positive control) · X4 3 · X5 3 · X8 2 · X9 2 · U 4
//   · CLEAN  (C2.8-FATAL is added only when something throws)
//   n/a: X2 (no REST op / AI tool — C2.11 publishes scoring) · X6 (no free-text sink: rule names are stored text, conditions are
//   enum/keys) · X7 (no public endpoint) · X10 (no file / secret).
// HOUSE RULES: SKIP guard before any DB connection · throwaway tenants `qc-c28-<rand>-*` swept in `finally` (every table with
//   tenantId, 4 passes) + users · no global drainOutbox (our PENDING rows go with the tenant sweep) · every decay/inactivity call is
//   scoped with systemIds + tenantIds · the daily cadence is NOT ticked as a whole (it would run C2.1's cron triggers over the shared
//   QC DB) — the REGISTERED job closure is invoked directly instead · races run in worker PROCESSES (own pool) via `--x3-worker` ·
//   last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

const SC_FILE = "src/lib/modules/crm/scoring.ts";
const SC_SHARED = "src/lib/modules/crm/scoring-shared.ts";
const SC_SPEC = "@/lib/modules/crm/scoring";
const SC_SHARED_SPEC = "@/lib/modules/crm/scoring-shared";
const BR_FILE = "src/lib/platform/crm-bridges/scoring.ts";
const BR_INDEX = "src/lib/platform/crm-bridges/index.ts";
const AUTO_FILE = "src/lib/modules/crm/automation.ts";
const INDEX_FILE = "src/lib/modules/crm/index.ts";
const LABELS_FILE = "src/lib/automation/labels.ts";
const WEBHOOK_LABELS = "src/lib/webhooks/labels.ts";
const CONSUMERS_FILE = "src/lib/outbox-consumers.ts";
const JOBS_FILE = "src/lib/platform/minute-jobs.ts";
const CRON_FILE = "scripts/crm-cron.mts";
const SETTINGS_FILE = "src/lib/modules/crm/settings.ts";
const PAGE_DIR = "src/app/app/sys/[id]/crm/settings/scoring";
const PAGE = `${PAGE_DIR}/page.tsx`;
const COMP_DIR = "src/components/crm/scoring";
const C360_PAGE = "src/app/app/sys/[id]/crm/contacts/[contactId]/page.tsx";
const NAV_FILE = "src/lib/modules/crm/nav.ts";
const INVENTORY = "scripts/crm-ui-inventory.json";
const SCHEMA_DIR = "prisma/schema";
const THIS_FILE = "scripts/qc-crm-c2.8.mts";
const JOB = "crm.scoring.decay";

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
// SKIP guard — the C2.8 service or its prerequisite C2.0 tables are absent ⇒ SKIPPED, no DB connection.
// ═══════════════════════════════════════════════════════════════════════════════════
const scSrc0 = read(SC_FILE);
const BUILT = /export\s+(async\s+)?function\s+onEvent\b/.test(scSrc0) || /export\s+(async\s+)?function\s+decay\b/.test(scSrc0);
const schemaAll = existsSync(SCHEMA_DIR) ? readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".prisma")).map((f) => read(join(SCHEMA_DIR, f))).join("\n") : "";
const C20 = /model\s+CrmScoreRule\s*\{/.test(schemaAll) && /model\s+CrmScoreLog\s*\{/.test(schemaAll)
  && (existsSync("prisma/migrations") ? readdirSync("prisma/migrations").some((d) => /_crm_v2_b$/.test(d)) : false);
if (WORKER_AT < 0 && !FORCE && (!BUILT || !C20)) {
  const why = !BUILT
    ? `WO C2.8 not built yet (${SC_FILE} absent or without onEvent/decay)${C20 ? "" : " — and its prerequisite C2.0 (CrmScoreRule/CrmScoreLog · *_crm_v2_b) is absent too"}`
    : "prerequisite C2.0 absent: CrmScoreRule / CrmScoreLog / prisma/migrations/*_crm_v2_b not in the tree";
  console.log(`⚠️  SKIPPED — ${why} (run with --force-run to exercise the fixtures, the workers and the cleanup)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();

const ownerActor = (userId: string) => ({ userId, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> });
const managerActor = (userId: string) => ({ userId, role: "MANAGER", unitAccess: ["*"] as string[], permissions: {} as Record<string, unknown> });
const staffActor = (userId: string, perms: Record<string, unknown>) => ({ userId, role: "STAFF", unitAccess: ["*"] as string[], permissions: perms });
const fnOf = (mod: Any, ...names: string[]): Any => {
  for (const n of names) {
    let v: Any = mod;
    for (const p of n.split(".")) v = v?.[p];
    if (typeof v === "function") return v;
  }
  return undefined;
};
const codeOf = (e: Any) => String(e?.code ?? "-");

// ═══════════════════════════════════════════════════════════════════════════════════
// WORKER MODE — this file re-invoked as a child process (own PrismaClient = own pool, synchronised start).
//   argv: --x3-worker <mode> <tenantId> <crmSystemId> <userId> <startAtMs> <base64url(JSON arg)>
//     onevent   : { type, payload, keys[] }  → keys.length parallel scoring.onEvent(…, { eventKey }) → "OK:<logged>" | "ERR:…"
//     decayloop : { systemIds[], nowMs, steps } → decay(batchSize 1) in a loop printing `C28STEP <n>` after each batch
//                 (the parent SIGKILLs it after the 3rd line = a process that died in the middle of the sweep)
// ═══════════════════════════════════════════════════════════════════════════════════
if (WORKER_AT >= 0) {
  const [mode, wT, wS, wU, wStart, wArg] = ARGV.slice(WORKER_AT + 1);
  const SW = (await import(SC_SPEC as string).catch(() => ({}))) as Any;
  const PW = ((await import("@/lib/core/db")) as Any).prisma as Any;
  const arg = JSON.parse(Buffer.from(String(wArg), "base64url").toString("utf8"));
  const waitMs = Number(wStart) - Date.now();
  if (waitMs > 0) await new Promise<void>((r) => setTimeout(r, waitMs));
  const err = (e: unknown) => `ERR:${codeOf(e)}:${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`;
  if (mode === "onevent") {
    const oe = fnOf(SW, "onEvent");
    const out = await Promise.all((arg.keys as string[]).map(async (key) => {
      try {
        if (!oe) throw Object.assign(new Error("onEvent missing"), { code: "MISSING_FUNCTION" });
        const r = await oe({ tenantId: wT, systemId: wS, actorUserId: wU }, arg.type, arg.payload, { eventKey: key });
        return `OK:${Number(r?.logged ?? 0)}`;
      } catch (e) { return err(e); }
    }));
    console.log(`X3WORKER ${JSON.stringify(out)}`);
  } else if (mode === "decayloop") {
    const dc = fnOf(SW, "decay");
    for (let i = 1; i <= Number(arg.steps ?? 50); i += 1) {
      try {
        if (!dc) throw Object.assign(new Error("decay missing"), { code: "MISSING_FUNCTION" });
        // ORACLE-EDIT 25 ก.ย. (Fable): contract A.5 = one decay() call loops until quiet ⇒ cap to ONE batch per call (`maxBatches: 1`) and pace
        //   (~200 ms) so the parent's SIGKILL lands in the middle of the sweep — before this, the first call swept all 25 and the kill came too late
        const r = await dc({ now: new Date(Number(arg.nowMs)), tenantIds: [wT], systemIds: arg.systemIds, batchSize: 1, maxBatches: 1 });
        console.log(`C28STEP ${i} ${Number(r?.expired ?? 0)}`);
        await new Promise((res) => setTimeout(res, 200));
        if (Number(r?.expired ?? 0) === 0) break;
      } catch (e) { console.log(`C28STEP ${i} ${err(e)}`); break; }
    }
    console.log("X3WORKER [\"done\"]");
  }
  await PW.$disconnect();
  process.exit(0);
}

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c28-${rand}`;

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
const DAY = 86_400_000;
const thaiYmd = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const ABSENT = BUILT ? "" : " · [scoring.ts ABSENT]";

console.log(`\n═══ QC CRM v2 · C2.8 — lead scoring ═══`);
console.log(`[env] DB ${host} · tag ${TAG}${FORCE && (!BUILT || !C20) ? ` · --force-run with ${!BUILT ? "C2.8 ABSENT" : "C2.0 tables ABSENT"} (C2.8 checks expected red; controls + CLEAN green)` : ""}\n`);

const TENANTS: string[] = [];
const USERS: string[] = [];
const PII: string[] = [];
const pii = <T extends string>(s: T): T => { PII.push(s); return s; };
let seq = 0;
const nx = () => `${++seq}`;
let phoneSeq = 0;
const phoneOf = (): string => pii(`08${String((Math.floor(Math.random() * 9_000_000) + 1_000_000) * 10 + (phoneSeq++ % 10)).padStart(8, "0").slice(-8)}`);
const NONE = `${TAG}-none`;

try {
  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — structure (static + runtime shape)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S0 · structure ──");
  const SC = (await import(SC_SPEC as string).catch(() => ({}))) as Any;
  const SSH = (await import(SC_SHARED_SPEC as string).catch(() => ({}))) as Any;
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => ({}))) as Any;
  const LAB = (await import("@/lib/automation/labels" as string).catch(() => ({}))) as Any;
  const ASH = (await import("@/lib/modules/crm/automation-shared" as string).catch(() => ({}))) as Any;
  const CENTRAL = (await import("@/lib/modules/crm/templates/business/central" as string).catch(() => ({}))) as Any;
  const OBX = (await import("@/lib/outbox-consumers" as string).catch(() => ({}))) as Any;
  const MJ = (await import("@/lib/platform/minute-jobs" as string).catch(() => ({}))) as Any;
  const CONS: Any = OBX.consumers ?? {};
  const scSrc = read(SC_FILE);
  const shSrc = read(SC_SHARED);
  const seedRulesF = fnOf(SC, "seedSystemRules", "rules.seed", "seedRules");
  const listRulesF = fnOf(SC, "listRules", "rules.list");
  const createRuleF = fnOf(SC, "createRule", "rules.create");
  const updateRuleF = fnOf(SC, "updateRule", "rules.update");
  const toggleRuleF = fnOf(SC, "toggleRule", "rules.toggle");
  const deleteRuleF = fnOf(SC, "deleteRule", "rules.remove", "rules.delete");
  const reorderRulesF = fnOf(SC, "reorderRules", "rules.reorder");
  const onEventF = fnOf(SC, "onEvent");
  const adjustF = fnOf(SC, "adjust");
  const decayF = fnOf(SC, "decay");
  const inactiveF = fnOf(SC, "applyInactivity");
  const explainF = fnOf(SC, "explain");
  const recomputeF = fnOf(SC, "recompute");
  const getSetF = fnOf(SC, "getScoringSettings");
  const setSetF = fnOf(SC, "setScoringSettings");
  {
    const need: [string, Any][] = [["seedSystemRules", seedRulesF], ["listRules", listRulesF], ["createRule", createRuleF], ["updateRule", updateRuleF],
      ["toggleRule", toggleRuleF], ["deleteRule", deleteRuleF], ["reorderRules", reorderRulesF], ["onEvent", onEventF], ["adjust", adjustF], ["decay", decayF],
      ["applyInactivity", inactiveF], ["explain", explainF], ["recompute", recomputeF], ["getScoringSettings", getSetF], ["setScoringSettings", setSetF]];
    const missing = need.filter(([, f]) => typeof f !== "function").map(([n]) => n);
    chk("C2.8-S0.1", "scoring.ts exports the 15 contract functions (seedSystemRules · rules CRUD ×6 · onEvent · adjust · decay · applyInactivity · explain · recompute · get/setScoringSettings)",
      missing.length === 0 && scSrc.length > 0, "15 fns", `file=${scSrc.length > 0} missing=${missing.join(",") || "-"}`);
  }
  {
    const shImpure = /from\s+["'](@prisma\/client|@\/lib\/core\/db|next\/[^"']+|server-only|\.\/db|\.\/scoring)["']/.test(shSrc);
    const d = SSH.SCORING_DEFAULTS as Any;
    const evs = Array.isArray(SSH.SCORE_RULE_EVENTS) ? (SSH.SCORE_RULE_EVENTS as Any[]).map((x) => String(x?.value ?? x)) : [];
    const seedEvents = Array.isArray(CENTRAL.CENTRAL_SCORE_RULES) ? (CENTRAL.CENTRAL_SCORE_RULES as Any[]).map((r) => String(r.event)) : [];
    const missEv = seedEvents.filter((e) => !evs.includes(e));
    const bandOf = fnOf(SSH, "bandOf");
    const bandOk = typeof bandOf === "function" && bandOf(60, { hot: 50, warm: 20 }) === "HOT" && bandOf(20, { hot: 50, warm: 20 }) === "WARM" && bandOf(19, { hot: 50, warm: 20 }) === "COLD" && bandOf(0, { hot: 50, warm: 20 }) === "COLD";
    chk("C2.8-S0.2", "scoring-shared.ts is pure (no prisma/next/server-only/./db) and exports SCORING_DEFAULTS { hot 50, warm 20, decayDays 30 } (blueprint §4.5) · SCORE_EXPLAIN_LIMIT 3 · SCORE_RULE_EVENTS ⊇ the 8 events of CENTRAL_SCORE_RULES · bandOf(score, {hot,warm}) = HOT at ≥ hot, WARM at ≥ warm, COLD below (0 ⇒ COLD)",
      shSrc.length > 0 && !shImpure && Number(d?.hot) === 50 && Number(d?.warm) === 20 && Number(d?.decayDays) === 30 && Number(SSH.SCORE_EXPLAIN_LIMIT) === 3 && seedEvents.length === 8 && missEv.length === 0 && bandOk,
      "pure · defaults · 8 events · bandOf", `shared=${shSrc.length > 0} impure=${shImpure} defaults=${j(d)} limit=${String(SSH.SCORE_EXPLAIN_LIMIT)} seedEvents=${seedEvents.length} missing=${missEv.join(",") || "-"} bandOf=${bandOk}${ABSENT}`);
  }
  {
    const idxSrc = read(INDEX_FILE);
    const block = /CRM C2\.8 ▸[\s\S]*export\s+\*\s+as\s+scoring\s+from\s+["']\.\/scoring["'][\s\S]*◂/.test(idxSrc);
    const brSrc = read(BR_FILE);
    const brIdx = read(BR_INDEX);
    const gateFirst = /crmGate|bridgeOpen/.test(brSrc);
    chk("C2.8-S0.3", "facade + bridge: crm/index.ts exports the `scoring` namespace inside a `// CRM C2.8 ▸ … ◂` block and crm.scoring.onEvent/explain/decay are reachable through it · crm-bridges/scoring.ts exists (R-D), asks the GATE first (crmGate/bridgeOpen) and is re-exported from crm-bridges/index.ts [static + runtime]",
      block && typeof CRM?.scoring?.onEvent === "function" && typeof CRM?.scoring?.explain === "function" && typeof CRM?.scoring?.decay === "function" && brSrc.length > 0 && gateFirst && /onScoringEvent/.test(brIdx),
      "facade + gated bridge", `block=${block} onEvent=${typeof CRM?.scoring?.onEvent} bridge=${brSrc.length > 0} gate=${gateFirst} exported=${/onScoringEvent/.test(brIdx)}${ABSENT}`);
  }
  {
    // registries: declared once · consumer present · no duplicate trigger value · the cron trigger of C2.1 survives · virtual event stays out
    const labSrc = read(LABELS_FILE);
    const whSrc = read(WEBHOOK_LABELS);
    const events = ((LAB.AUTOMATION_EVENTS ?? []) as Any[]).map((e) => String(e?.value));
    const declaredTwice = ["crm.score.changed", "crm.score.threshold"].filter((e) => events.filter((x) => x === e).length !== 1);
    const inWebhookFile = ["crm.score.changed", "crm.score.threshold"].filter((e) => new RegExp(`value:\\s*["']${e.replace(/\./g, "\\.")}["']`).test(whSrc));
    const noCons = ["crm.score.changed", "crm.score.threshold"].filter((e) => typeof CONS?.[e] !== "function");
    const trig = ((ASH.CRM_RULE_TRIGGERS ?? []) as Any[]).map((t) => String(t?.value));
    const dupTrig = [...new Set(trig)].filter((v) => trig.filter((x) => x === v).length > 1);
    const thr = ((ASH.CRM_RULE_TRIGGERS ?? []) as Any[]).find((t) => t?.value === "crm.score.threshold");
    const virtualOut = !events.includes("crm.contact.inactive");
    const labBlock = /CRM C2\.8 ▸/.test(labSrc) && /CRM C2\.8 ▸/.test(read(CONSUMERS_FILE));
    chk("C2.8-S0.4", "3 registries (a new event without a consumer stalls the whole queue): crm.score.changed + crm.score.threshold declared EXACTLY ONCE in automation/labels.ts inside a `// CRM C2.8 ▸` block, never re-declared in webhooks/labels.ts (it spreads AUTOMATION_EVENTS), each with a consumer in outbox-consumers.ts · CRM_RULE_TRIGGERS still lists every value ONCE (the new label must not duplicate C2.1's cron entry) and crm.score.threshold keeps cron:true + params [\"band\"] (qc-crm-c2.1 S9.1) · the VIRTUAL crm.contact.inactive stays out of AUTOMATION_EVENTS",
      declaredTwice.length === 0 && inWebhookFile.length === 0 && noCons.length === 0 && dupTrig.length === 0 && thr?.cron === true && j(thr?.params ?? []).includes("band") && virtualOut && labBlock,
      "1 label each · consumers · no dup", `notOnce=${declaredTwice.join(",") || "-"} webhookDup=${inWebhookFile.join(",") || "-"} noConsumer=${noCons.join(",") || "-"} dupTriggers=${dupTrig.join(",") || "-"} threshold=${thr ? `cron=${thr.cron} params=${j(thr.params)}` : "missing"} virtualOut=${virtualOut} blocks=${labBlock}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — throwaway tenants: A (10 CRM systems) · B (foreign) · V (uiVersion 1)
  // ═════════════════════════════════════════════════════════════════════════════
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const teamsSvc = (await import("@/lib/core/teams" as string)) as Any;
  const mkUser = async (suffix: string) => {
    const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix || "owner"} ${TAG}` } });
    USERS.push(u.id);
    return u.id as string;
  };
  const SALES_PERMS = { "crm.contact.read": true, "crm.contact.create": true, "crm.deal.read": true };
  const userA = await mkUser("");
  const userM = await mkUser("-mgr");
  const userS = await mkUser("-staff"); // STAFF with the read keys, NO crm.score.manage
  const userK = await mkUser("-keyed"); // STAFF holding crm.score.manage
  const userTh = await mkUser("-thana"); // STAFF of another team (X1 cross-team)
  const userNk = await mkUser("-nok"); // STAFF of the team that owns the contact (positive control)
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
  const owner = ownerActor(userA);
  const manager = managerActor(userM);
  const staff = staffActor(userS, { "crm.contact.read": true, "crm.deal.read": true });
  const staffKeyed = staffActor(userK, { "crm.contact.read": true, "crm.score.manage": true });
  const thana = staffActor(userTh, SALES_PERMS);
  const nok = staffActor(userNk, SALES_PERMS);

  const tidA = await mkTenant("a");
  await member(tidA, userA, "OWNER");
  await member(tidA, userM, "MANAGER");
  await member(tidA, userS, "STAFF", { "crm.contact.read": true, "crm.deal.read": true });
  await member(tidA, userK, "STAFF", { "crm.contact.read": true, "crm.score.manage": true });
  await member(tidA, userTh, "STAFF", SALES_PERMS);
  await member(tidA, userNk, "STAFF", SALES_PERMS);
  const crmA = await mk(tidA, "CRM", "CRM"); // S1 seed + events · S2 maxPerDay · S5 explain · S8 CRUD
  const crmD = await mk(tidA, "CRM", "CRM หมดอายุ"); // S3 decay · X5
  const crmB4 = await mk(tidA, "CRM", "CRM ระดับคะแนน"); // S4 band + threshold + C2.1 rule
  const crmRc = await mk(tidA, "CRM", "CRM คำนวณใหม่"); // S6 recompute
  const crmX = await mk(tidA, "CRM", "CRM ยิงพร้อมกัน"); // X3 races (worker processes)
  const crmX2 = await mk(tidA, "CRM", "CRM สองกฎ"); // X3.3 two rules on one event
  const crmI = await mk(tidA, "CRM", "CRM เงียบหาย"); // S8.5 inactivity sweep
  const crmG = await mk(tidA, "CRM", "CRM ปิดสะพาน"); // S8.6 bridgesEnabled false
  const crmF = await mk(tidA, "CRM", "CRM ฟอร์ม"); // S8.7 scoreOnSubmit + X4 consumer path
  const crmT = await mk(tidA, "CRM", "CRM ขอบเขต"); // X1 cross-system / cross-team
  const tidB = await mkTenant("b");
  await member(tidB, userA, "OWNER");
  const crmB = await mk(tidB, "CRM", "CRM-B"); // X1 cross-tenant
  const tidV = await mkTenant("v1");
  await member(tidV, userA, "OWNER");
  const crmV = await mk(tidV, "CRM", "CRM-V1"); // U (flipped to 1 after its rules exist)
  const V2 = [crmA, crmD, crmB4, crmRc, crmX, crmX2, crmI, crmF, crmT, crmB, crmV];
  for (const s of V2) await setCrm(s, { uiVersion: 2, bridgesEnabled: true });
  await setCrm(crmG, { uiVersion: 2, bridgesEnabled: false }); // gate closed on purpose (S8.6)
  const ctxOf = (tid: string, sys: string, uid: string | null = userA) => ({ tenantId: tid, systemId: sys, actorUserId: uid });
  const cA = ctxOf(tidA, crmA);
  const cD = ctxOf(tidA, crmD);
  const cB4 = ctxOf(tidA, crmB4);
  const cRc = ctxOf(tidA, crmRc);
  const cX = ctxOf(tidA, crmX);
  const cX2 = ctxOf(tidA, crmX2);
  const cI = ctxOf(tidA, crmI);
  const cG = ctxOf(tidA, crmG);
  const cF = ctxOf(tidA, crmF);
  const cT = ctxOf(tidA, crmT);
  const cB = ctxOf(tidB, crmB);
  const cV = ctxOf(tidV, crmV);

  // teams (X1 cross-team): nok's team owns the contact · thana is in another team
  const mkTeam = async (tid: string, name: string, members: string[]) => {
    const t = await call(teamsSvc.createTeam, { tenantId: tid, actorUserId: userA }, { name: `${name} ${TAG}`, leadUserId: null });
    const id = (t.v?.id as string) ?? (await P.team.create({ data: { tenantId: tid, name: `${name} ${TAG}-raw` } })).id;
    for (const u of members) await P.teamMember.create({ data: { tenantId: tid, teamId: id, userId: u, role: "MEMBER" } }).catch(() => null);
    return id as string;
  };
  const teamNok = await mkTeam(tidA, "ทีมภูเก็ต", [userNk]);
  await mkTeam(tidA, "ทีมกระบี่", [userTh]);

  const mkParty = async (tid: string, name: string, extra: Record<string, Any> = {}) => (await P.party.create({ data: { tenantId: tid, name, kind: "PERSON", ...extra } })).id as string;
  const rawContact = async (tid: string, sys: string, extra: Record<string, Any> = {}) => {
    const name = pii(`ลูกค้า ${TAG}-${nx()}`);
    const partyId = await mkParty(tid, name);
    return (await P.crmContact.create({ data: { tenantId: tid, systemId: sys, name, firstName: name, phone: phoneOf(), partyId, ownerUserId: userA, ...extra } })).id as string;
  };
  const contactRow = async (id: string) => (await P.crmContact.findFirst({ where: { id } })) as Any;
  const scoreOf = async (id: string) => Number((await contactRow(id))?.score ?? -1);
  const bandOf = async (id: string) => String((await contactRow(id))?.scoreBand ?? "null");
  const logsOf = async (id: string) => ((await P.crmScoreLog.findMany({ where: { contactId: id }, orderBy: { createdAt: "asc" } })) as Any[]);
  const sumLive = async (id: string) => (await logsOf(id)).filter((l) => !l.expired).reduce((s, l) => s + Number(l.points), 0);
  const evOf = async (tid: string, type: string, contactId: string) =>
    ((await P.outboxEvent.findMany({ where: { tenantId: tid, type } })) as Any[]).filter((e) => e.payload?.contactId === contactId);

  // rules: service first (the contract), raw insert when the service is absent/refuses — so onEvent stays exercisable
  const RAW_RULES: string[] = [];
  const mkRule = async (c: Any, input: Record<string, Any>): Promise<string> => {
    const r = await call(createRuleF, c, owner, input);
    const id = (r.v?.id ?? r.v?.rule?.id) as string | undefined;
    if (typeof id === "string" && id) return id;
    const n = (await P.crmScoreRule.count({ where: { systemId: c.systemId } })) as number;
    const row = await P.crmScoreRule.create({
      data: {
        tenantId: c.tenantId, systemId: c.systemId, name: String(input.name ?? `กฎคะแนน ${TAG}`), event: String(input.event),
        points: Number(input.points ?? 1), conditions: input.conditions ?? null, expiresDays: input.expiresDays ?? null,
        maxPerDay: input.maxPerDay ?? null, active: input.active ?? true, isSystem: input.isSystem ?? false, sortOrder: n,
      },
    });
    RAW_RULES.push(row.id);
    return row.id as string;
  };
  const resetRules = (sys: string) => P.crmScoreRule.deleteMany({ where: { systemId: sys } });
  const fire = async (c: Any, type: string, payload: Record<string, Any>, opts: Record<string, Any> = {}): Promise<Res> =>
    call(onEventF, { tenantId: c.tenantId, systemId: c.systemId, actorUserId: c.actorUserId }, type, payload, { eventKey: `${TAG}-ev-${nx()}`, ...opts });
  const EV = { FORM: "forms.submission.received", CHAT: "chat.message.received", ACT: "crm.activity.completed", OPEN: "crm.email.opened", CLICK: "crm.email.clicked" };

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — seed of the 8 system rules + onEvent over 5 events → log rows + score
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S1 · seed 8 + onEvent 5 events ──");
  const SEEDS = (Array.isArray(CENTRAL.CENTRAL_SCORE_RULES) ? (CENTRAL.CENTRAL_SCORE_RULES as Any[]) : []).map((r) => ({
    key: String(r.key), label: String(r.label), event: String(r.event), points: Number(r.points),
    maxPerDay: r.maxPerDay === undefined ? null : Number(r.maxPerDay), expiresDays: r.expiresDays === undefined ? null : Number(r.expiresDays),
  }));
  {
    const first = await call(seedRulesF, cA, owner);
    const again = await call(seedRulesF, cA, owner);
    const par = await Promise.all([0, 1, 2, 3, 4].map(() => call(seedRulesF, cA, owner)));
    const rows = ((await P.crmScoreRule.findMany({ where: { systemId: crmA }, orderBy: { sortOrder: "asc" } })) as Any[]);
    const seedKeyOf = (r: Any) => String((r?.conditions as Any)?.seedKey ?? "");
    const shaped = SEEDS.every((s) => {
      const row = rows.find((r) => seedKeyOf(r) === s.key) ?? rows.find((r) => r.event === s.event && Number(r.points) === s.points);
      return !!row && row.event === s.event && Number(row.points) === s.points && row.isSystem === true && row.active === true
        && (row.maxPerDay ?? null) === s.maxPerDay && (s.expiresDays === null || Number(row.expiresDays) === s.expiresDays);
    });
    chk("C2.8-S1.1", "seedSystemRules materialises THE 8 rules of CENTRAL_SCORE_RULES (the data C1.11 shipped) for this system: same events/points/maxPerDay/expiresDays, isSystem true, active true, sortOrder = the data order, identity kept as conditions.seedKey · idempotent: the 2nd call and 5 PARALLEL calls create nothing more (advisory lock + seedKey check), 8 rows in total",
      SEEDS.length === 8 && first.ok && rows.length === 8 && shaped && again.ok && Number(again.v?.created ?? -1) === 0 && par.every((p) => p.ok) && new Set(rows.map(seedKeyOf)).size === 8,
      "8 rows · created 0 again", `seedData=${SEEDS.length} first=${first.ok ? j(first.v) : first.err} rows=${rows.length} shaped=${shaped} again=${again.ok ? j(again.v) : again.err} parallel=${par.filter((p) => p.ok).length}/5${ABSENT}`);
  }
  const ruleIdBySeed = async (sys: string, key: string): Promise<string> => {
    const rows = ((await P.crmScoreRule.findMany({ where: { systemId: sys } })) as Any[]);
    const hit = rows.find((r) => String((r.conditions as Any)?.seedKey ?? "") === key);
    return (hit?.id as string) ?? NONE;
  };
  const cS1 = await rawContact(tidA, crmA);
  {
    const r = await fire(cA, EV.FORM, { contactId: cS1, submissionId: `${TAG}-sub-1` });
    const logs = await logsOf(cS1);
    const one = logs[0];
    const want = SEEDS.find((s) => s.key === "form_submitted");
    chk("C2.8-S1.2", "event 1 `forms.submission.received` (rule \"กรอกฟอร์มบนเว็บ\" +15): ONE CrmScoreLog row for that rule — points 15, reason = the rule name, ruleId = the seeded rule, eventKey = the source event key — and the contact's score becomes 15 with scoreUpdatedAt set",
      r.ok && logs.length === 1 && Number(one?.points) === Number(want?.points ?? 15) && String(one?.reason ?? "").includes("ฟอร์ม") && one?.ruleId === (await ruleIdBySeed(crmA, "form_submitted")) && typeof one?.eventKey === "string" && !!one?.eventKey && (await scoreOf(cS1)) === 15 && !!(await contactRow(cS1))?.scoreUpdatedAt,
      "1 log · +15", `fire=${r.ok ? j(r.v) : r.err} logs=${logs.length} points=${one?.points} reason=${cut(one?.reason, 40)} key=${!!one?.eventKey} score=${await scoreOf(cS1)}${ABSENT}`);
  }
  {
    const r = await fire(cA, EV.ACT, { activityId: `${TAG}-act-x`, contactId: cS1, type: "MEETING" });
    chk("C2.8-S1.3", "event 2 `crm.activity.completed` (\"นัดพบ/โทรคุยเสร็จ\" +10) ⇒ a second log and score 25 (15 + 10) — every matching rule scores, the events accumulate",
      r.ok && (await logsOf(cS1)).length === 2 && (await scoreOf(cS1)) === 25, "2 logs · 25", `fire=${r.ok ? j(r.v) : r.err} logs=${(await logsOf(cS1)).length} score=${await scoreOf(cS1)}${ABSENT}`);
  }
  {
    const r = await fire(cA, EV.CHAT, { contactId: cS1, conversationId: `${TAG}-conv` });
    const rChat = await ruleIdBySeed(crmA, "chat_in");
    const chatLogs = (await logsOf(cS1)).filter((l) => l.ruleId === rChat);
    chk("C2.8-S1.4", "event 3 `chat.message.received` (\"ทักแชทเข้ามา\" +5, maxPerDay 1) ⇒ score 30 and the log carries the chat rule id",
      r.ok && (await scoreOf(cS1)) === 30 && chatLogs.length === 1, "30 · 1 chat log", `fire=${r.ok ? j(r.v) : r.err} score=${await scoreOf(cS1)} chatLogs=${chatLogs.length}${ABSENT}`);
  }
  {
    const o = await fire(cA, EV.OPEN, { contactId: cS1, emailId: `${TAG}-mail-1` });
    const c = await fire(cA, EV.CLICK, { contactId: cS1, emailId: `${TAG}-mail-1`, url: "https://example.invalid/x" });
    const total = 15 + 10 + 5 + 2 + 5;
    chk("C2.8-S1.5", "events 4 and 5 `crm.email.opened` (+2) and `crm.email.clicked` (+5) ⇒ 5 logs in total and the score is the EXACT sum of the five events (15+10+5+2+5 = 37) = Σ of the non-expired logs",
      o.ok && c.ok && (await logsOf(cS1)).length === 5 && (await scoreOf(cS1)) === total && (await sumLive(cS1)) === total,
      `${total}`, `open=${o.ok ? "ok" : o.err} click=${c.ok ? "ok" : c.err} logs=${(await logsOf(cS1)).length} score=${await scoreOf(cS1)} sum=${await sumLive(cS1)}${ABSENT}`);
  }
  {
    // conditions · inactive rule · an event no rule references
    const cCond = await rawContact(tidA, crmA, { lifecycleStage: "PROSPECT", tags: ["vip"] });
    const cPlain = await rawContact(tidA, crmA, { lifecycleStage: "LEAD" });
    const rc = await mkRule(cA, { name: `เฉพาะ vip ${TAG}`, event: EV.ACT, points: 9, conditions: { mode: "AND", items: [{ field: "c.tags", op: "contains", value: "vip" }] } });
    const rOff = await mkRule(cA, { name: `ปิดอยู่ ${TAG}`, event: EV.ACT, points: 50, active: false });
    const hit = await fire(cA, EV.ACT, { contactId: cCond, activityId: `${TAG}-act-1` });
    const miss = await fire(cA, EV.ACT, { contactId: cPlain, activityId: `${TAG}-act-2` });
    const none = await fire(cA, "crm.deal.reopened", { contactId: cCond, dealId: `${TAG}-nodeal` });
    const hitLogs = await logsOf(cCond);
    const missLogs = await logsOf(cPlain);
    chk("C2.8-S1.6", "conditions + switches: the vip-only rule (+9) fires for the tagged contact (10 + 9 = 19) and NOT for the untagged one (10 only) · an INACTIVE rule (+50) never fires for either · an event no rule references writes no log and leaves the score alone",
      hit.ok && miss.ok && none.ok && (await scoreOf(cCond)) === 19 && (await scoreOf(cPlain)) === 10 && hitLogs.every((l) => l.ruleId !== rOff) && missLogs.every((l) => l.ruleId !== rc) && hitLogs.length === 2 && missLogs.length === 1,
      "19 / 10 · no inactive rule", `vip=${await scoreOf(cCond)} plain=${await scoreOf(cPlain)} logs=${hitLogs.length}/${missLogs.length} rc=${hitLogs.some((l) => l.ruleId === rc)} off=${hitLogs.some((l) => l.ruleId === rOff)} none=${none.ok ? "ok" : none.err}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — maxPerDay (per rule, per contact, per Thai day)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2 · maxPerDay ──");
  const NOW0 = new Date("2026-09-10T04:00:00.000Z"); // 11:00 Thai — a synthetic clock in the past
  {
    const cMax = await rawContact(tidA, crmA);
    const rMax = await ruleIdBySeed(crmA, "email_opened"); // +2 · maxPerDay 3
    const seqRes: Res[] = [];
    for (let i = 0; i < 5; i += 1) seqRes.push(await fire(cA, EV.OPEN, { contactId: cMax, emailId: `${TAG}-m-${i}` }, { now: NOW0 }));
    const sameDay = (await logsOf(cMax)).filter((l) => l.ruleId === rMax);
    const score6 = await scoreOf(cMax); // ORACLE-EDIT 25 ก.ย. (Fable): snapshot BEFORE the next-day event — both reads used to happen after it
    const next = await fire(cA, EV.OPEN, { contactId: cMax, emailId: `${TAG}-m-next` }, { now: new Date(NOW0.getTime() + DAY) });
    const afterNext = (await logsOf(cMax)).filter((l) => l.ruleId === rMax);
    chk("C2.8-S2.1", "maxPerDay 3 on \"เปิดอีเมล\" (+2): 5 events on the SAME Thai day ⇒ exactly 3 logs and +6 on the score (the 4th and 5th write nothing and do not fail) · one more event on the NEXT Thai day scores again ⇒ 4 logs, +8",
      seqRes.every((r) => r.ok) && sameDay.length === 3 && score6 === 6 && next.ok && afterNext.length === 4 && (await scoreOf(cMax)) === 8,
      "3 then 4 logs · 6 then 8", `fired=${seqRes.filter((r) => r.ok).length}/5 sameDay=${sameDay.length} score6=${score6} nextDay=${afterNext.length}${ABSENT}`);
  }
  {
    const cOther = await rawContact(tidA, crmA);
    const rOpen = await ruleIdBySeed(crmA, "email_opened");
    const rClick = await ruleIdBySeed(crmA, "email_clicked");
    for (let i = 0; i < 4; i += 1) await fire(cA, EV.OPEN, { contactId: cOther, emailId: `${TAG}-o-${i}` }, { now: NOW0 });
    for (let i = 0; i < 4; i += 1) await fire(cA, EV.CLICK, { contactId: cOther, emailId: `${TAG}-c-${i}` }, { now: NOW0 });
    const mine = await logsOf(cOther);
    const opens = mine.filter((l) => l.ruleId === rOpen).length;
    const clicks = mine.filter((l) => l.ruleId === rClick).length;
    chk("C2.8-S2.2", "the cap is per (rule, contact, Thai day): a SECOND contact has its own quota (3 opens) and a second rule with its own maxPerDay 3 (\"กดลิงก์ในอีเมล\" +5) caps independently ⇒ 3 + 3 logs and score 3×2 + 3×5 = 21",
      opens === 3 && clicks === 3 && (await scoreOf(cOther)) === 21, "3 + 3 · 21", `opens=${opens} clicks=${clicks} score=${await scoreOf(cOther)}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — decay / expiry: score goes down, never below 0, only this system, loops until quiet
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3 · decay · expiry ──");
  {
    await resetRules(crmD);
    const rShort = await mkRule(cD, { name: `หมดอายุ 5 วัน ${TAG}`, event: EV.ACT, points: 10, expiresDays: 5 });
    const rNever = await mkRule(cD, { name: `ไม่หมดอายุ ${TAG}`, event: EV.FORM, points: 7, expiresDays: null });
    const cDec = await rawContact(tidA, crmD);
    await call(setSetF, cD, owner, { hot: 50, warm: 20, decayDays: 0 }); // 0 ⇒ the settings fallback never expires
    const a = await fire(cD, EV.ACT, { contactId: cDec, activityId: `${TAG}-d1` }, { now: NOW0 });
    const b = await fire(cD, EV.FORM, { contactId: cDec, submissionId: `${TAG}-d2` }, { now: NOW0 });
    const logs0 = await logsOf(cDec);
    const shortLog = logs0.find((l) => l.ruleId === rShort);
    const neverLog = logs0.find((l) => l.ruleId === rNever);
    const expAt = shortLog?.expiresAt ? new Date(shortLog.expiresAt).getTime() : 0;
    const wantAt = new Date(shortLog?.createdAt ?? NOW0).getTime() + 5 * DAY;
    // a control contact in ANOTHER system of the same tenant with an expiring log — a scoped sweep must not touch it
    const cCtrl = await rawContact(tidA, crmA);
    await P.crmScoreLog.create({ data: { tenantId: tidA, contactId: cCtrl, ruleId: null, points: 4, reason: `คุมกลุ่ม ${TAG}`, expiresAt: new Date(NOW0.getTime() - DAY) } });
    await P.crmContact.update({ where: { id: cCtrl }, data: { score: 4 } });
    const dec = await call(decayF, { now: new Date(NOW0.getTime() + 6 * DAY), tenantIds: [tidA], systemIds: [crmD] });
    const logs1 = await logsOf(cDec);
    const sh = logs1.find((l) => l.id === shortLog?.id);
    const nv = logs1.find((l) => l.id === neverLog?.id);
    const ctrlLog = (await logsOf(cCtrl))[0];
    chk("C2.8-S3.1", "expiry: a rule with expiresDays 5 stores expiresAt = createdAt + 5 days (a rule with none and decayDays 0 ⇒ expiresAt null = never) · decay at +6 days flips ONLY the expired one, brings the score from 17 down to 7 (= Σ non-expired) and recomputes the band · a log of ANOTHER system of the same tenant is untouched (the sweep honours systemIds)",
      a.ok && b.ok && Math.abs(expAt - wantAt) < 3_600_000 && (neverLog?.expiresAt ?? null) === null && dec.ok && sh?.expired === true && nv?.expired === false && (await scoreOf(cDec)) === 7 && (await sumLive(cDec)) === 7 && ctrlLog?.expired === false && (await scoreOf(cCtrl)) === 4,
      "17 → 7 · control untouched", `expiresAt=${sh?.expiresAt ?? "-"} never=${nv?.expiresAt ?? "null"} decay=${dec.ok ? j(dec.v) : dec.err} score=${await scoreOf(cDec)} ctrl=${ctrlLog?.expired}/${await scoreOf(cCtrl)}${ABSENT}`);
  }
  {
    const cZero = await rawContact(tidA, crmD);
    await P.crmScoreLog.createMany({ data: [
      { tenantId: tidA, contactId: cZero, ruleId: null, points: 12, reason: `หมดอายุ ${TAG}`, expiresAt: new Date(NOW0.getTime() - DAY) },
      { tenantId: tidA, contactId: cZero, ruleId: null, points: -20, reason: `ติดลบ ${TAG}`, expiresAt: null },
    ] });
    await P.crmContact.update({ where: { id: cZero }, data: { score: 12 } });
    const d = await call(decayF, { now: NOW0, tenantIds: [tidA], systemIds: [crmD] });
    const after = await scoreOf(cZero);
    const d2 = await call(decayF, { now: NOW0, tenantIds: [tidA], systemIds: [crmD] });
    chk("C2.8-S3.2", "the score never goes below 0: a contact whose live sum is −20 after the +12 log expires ends at 0 (not −8, not −20), the negative log is KEPT (history) and a second decay run leaves the 0 alone",
      d.ok && after === 0 && (await logsOf(cZero)).length === 2 && d2.ok && (await scoreOf(cZero)) === 0 && (await sumLive(cZero)) === -20,
      "0", `decay=${d.ok ? j(d.v) : d.err} score=${after} logs=${(await logsOf(cZero)).length} sum=${await sumLive(cZero)}${ABSENT}`);
  }
  {
    // loop until quiet + the registered daily job + a band move emitted by decay
    const reg = (globalThis as Any)[Symbol.for("shark.platform.minute-jobs.registry")] as Map<string, Any> | undefined;
    const job = reg?.get(JOB);
    const cronImports = /crm\/scoring(-job)?["']|scoring-job/.test(read(CRON_FILE));
    const cBand = await rawContact(tidA, crmD, { score: 60, scoreBand: "HOT" });
    const rows: Any[] = [];
    for (let i = 0; i < 40; i += 1) rows.push({ tenantId: tidA, contactId: cBand, ruleId: null, points: 1, reason: `ก้อน ${TAG}-${i}`, expiresAt: new Date(NOW0.getTime() - DAY) });
    for (let i = 0; i < 20; i += 1) rows.push({ tenantId: tidA, contactId: cBand, ruleId: null, points: 1, reason: `เหลือ ${TAG}-${i}`, expiresAt: null });
    await P.crmScoreLog.createMany({ data: rows });
    const one = await call(decayF, { now: NOW0, tenantIds: [tidA], systemIds: [crmD], batchSize: 7 });
    const left = (await logsOf(cBand)).filter((l) => !l.expired && l.expiresAt && new Date(l.expiresAt).getTime() <= NOW0.getTime()).length;
    const thr = await evOf(tidA, "crm.score.threshold", cBand);
    chk("C2.8-S3.3", "the daily job: `crm.scoring.decay` is registered in minute-jobs.ts (everyMinutes 1440 · cadence \"daily\" · not vpsOnly) and scripts/crm-cron.mts imports it (R-C.6) · ONE decay call with batchSize 7 finishes all 40 expiring logs of a contact (loops until quiet, 0 left due) and the band is recalculated: 60 → 20 ⇒ WARM with exactly one crm.score.threshold event for the crossing",
      !!job && job.everyMinutes === 1440 && (job.cadence ?? "minute") === "daily" && job.vpsOnly !== true && cronImports && one.ok && left === 0 && (await scoreOf(cBand)) === 20 && (await bandOf(cBand)) === "WARM" && thr.length === 1,
      "registered daily · 0 left · WARM · 1 event", `job=${job ? `${job.everyMinutes}/${job.cadence}/vps=${job.vpsOnly}` : "none"} cron=${cronImports} decay=${one.ok ? j(one.v) : one.err} left=${left} score=${await scoreOf(cBand)} band=${await bandOf(cBand)} threshold=${thr.length}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — band + threshold event (the event C2.1 consumes)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S4 · band · threshold ──");
  {
    await resetRules(crmB4);
    const rBig = await mkRule(cB4, { name: `ก้าวใหญ่ ${TAG}`, event: EV.ACT, points: 15 });
    const cBnd = await rawContact(tidA, crmB4);
    const set = await call(setSetF, cB4, owner, { hot: 40, warm: 15, decayDays: 0 });
    const steps: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      await fire(cB4, EV.ACT, { contactId: cBnd, activityId: `${TAG}-b-${i}` }, { now: NOW0 });
      steps.push(`${await scoreOf(cBnd)}/${await bandOf(cBnd)}`);
    }
    chk("C2.8-S4.1", "the band comes from settings.crm.scoring (hot 40 · warm 15 here, defaults 50/20): 15 ⇒ WARM · 30 ⇒ WARM · 45 ⇒ HOT, cached on CrmContact.scoreBand with scoreUpdatedAt moving each time",
      set.ok && j(steps) === j(["15/WARM", "30/WARM", "45/HOT"]) && !!(await contactRow(cBnd))?.scoreUpdatedAt && rBig !== NONE,
      "15/WARM · 30/WARM · 45/HOT", `settings=${set.ok ? j(set.v) : set.err} steps=${j(steps)}${ABSENT}`);
  }
  {
    const cCross = await rawContact(tidA, crmB4);
    const k1 = `${TAG}-cross-1`;
    await fire(cB4, EV.ACT, { contactId: cCross, activityId: `${TAG}-x1` }, { now: NOW0, eventKey: k1 }); // 15 ⇒ COLD→WARM
    const thr1 = await evOf(tidA, "crm.score.threshold", cCross);
    await fire(cB4, EV.ACT, { contactId: cCross, activityId: `${TAG}-x1` }, { now: NOW0, eventKey: k1 }); // same event again
    const thrSame = await evOf(tidA, "crm.score.threshold", cCross);
    await fire(cB4, EV.ACT, { contactId: cCross, activityId: `${TAG}-x2` }, { now: NOW0, eventKey: `${TAG}-cross-2` }); // 30 ⇒ still WARM
    const thrNoCross = await evOf(tidA, "crm.score.threshold", cCross);
    await fire(cB4, EV.ACT, { contactId: cCross, activityId: `${TAG}-x3` }, { now: NOW0, eventKey: `${TAG}-cross-3` }); // 45 ⇒ WARM→HOT
    const thr2 = await evOf(tidA, "crm.score.threshold", cCross);
    const changed = await evOf(tidA, "crm.score.changed", cCross);
    const bands = thr2.map((e) => String(e.payload?.band)).sort();
    const keys = thr2.map((e) => String(e.idempotencyKey ?? ""));
    const payloadText = j([...thr2, ...changed].map((e) => e.payload));
    chk("C2.8-S4.2", "crm.score.threshold is emitted ONCE PER CROSSING: COLD→WARM (1) · the same source event re-processed adds nothing · a step inside the same band adds nothing · WARM→HOT (2 in total, bands WARM + HOT, keys crm.score.threshold#<contactId>#<band>#… per R-C.8) · crm.score.changed carries { contactId, from, to, band, ruleId } and both payloads are ids only",
      thr1.length === 1 && thrSame.length === 1 && thrNoCross.length === 1 && thr2.length === 2 && j(bands) === j(["HOT", "WARM"]) && keys.every((k) => k.startsWith("crm.score.threshold#")) && changed.length >= 3 && changed.every((e) => typeof e.payload?.to === "number" && typeof e.payload?.from === "number") && !PII.some((p) => payloadText.includes(p)),
      "1 · 1 · 1 · 2 crossings", `crossing1=${thr1.length} again=${thrSame.length} inBand=${thrNoCross.length} total=${thr2.length} bands=${j(bands)} keys=${cut(keys.join(" "), 120)} changed=${changed.length}${ABSENT}`);
  }
  {
    // the event C2.1 consumes: a CRM automation rule on crm.score.threshold{band HOT} + NOTIFY_STAFF
    const AUTO = (await import("@/lib/modules/crm/automation" as string).catch(() => ({}))) as Any;
    const mkAutoRule = async (band: string) => {
      const r = await call(AUTO.createRule, { tenantId: tidA, systemId: crmB4, actorUserId: userA }, owner, {
        name: `ลีดระดับ ${band} ${TAG}`, trigger: { event: "crm.score.threshold", params: { band } },
        actions: [{ type: "NOTIFY_STAFF", params: { userIds: [userA], text: `${TAG}-hot-${band}` } }],
      });
      return (r.v?.id as string) ?? NONE;
    };
    const rHot = await mkAutoRule("HOT");
    const rCold = await mkAutoRule("COLD");
    const cHot = await rawContact(tidA, crmB4);
    await fire(cB4, EV.ACT, { contactId: cHot, activityId: `${TAG}-h1` }, { now: NOW0, eventKey: `${TAG}-h1` });
    await fire(cB4, EV.ACT, { contactId: cHot, activityId: `${TAG}-h2` }, { now: NOW0, eventKey: `${TAG}-h2` });
    await fire(cB4, EV.ACT, { contactId: cHot, activityId: `${TAG}-h3` }, { now: NOW0, eventKey: `${TAG}-h3` }); // 45 ⇒ HOT
    const evs = await evOf(tidA, "crm.score.threshold", cHot);
    const hotEv = evs.find((e) => String(e.payload?.band) === "HOT");
    const deliver = hotEv ? await call(CONS?.["crm.score.threshold"], { id: hotEv.id, tenantId: tidA, type: "crm.score.threshold", payload: hotEv.payload, systemId: hotEv.systemId ?? crmB4, unitId: null }) : MISSING;
    const again = hotEv ? await call(CONS?.["crm.score.threshold"], { id: hotEv.id, tenantId: tidA, type: "crm.score.threshold", payload: hotEv.payload, systemId: hotEv.systemId ?? crmB4, unitId: null }) : MISSING;
    const runsHot = (await P.automationRun.count({ where: { ruleId: rHot } })) as number;
    const runsCold = (await P.automationRun.count({ where: { ruleId: rCold } })) as number;
    const notes = (await P.appNotification.count({ where: { tenantId: tidA, OR: [{ title: { contains: `${TAG}-hot-HOT` } }, { body: { contains: `${TAG}-hot-HOT` } }] } })) as number;
    chk("C2.8-S4.3", "the emitted event is the one C2.1 consumes: delivering crm.score.threshold{band HOT} to its outbox consumer runs the CRM rule whose trigger is crm.score.threshold{band HOT} exactly once (one AutomationRun, one notification) even when delivered twice · the rule set to band COLD does NOT run on a HOT crossing (the engine selects rules by event type only ⇒ the band must be matched by the consumer/engine — see the brief addendum, decision 12)",
      !!hotEv && deliver.ok && again.ok && runsHot === 1 && notes >= 1 && runsCold === 0,
      "1 run HOT · 0 run COLD", `event=${!!hotEv} consumer=${deliver.ok ? "ok" : deliver.err} runsHot=${runsHot} runsCold=${runsCold} notes=${notes}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 — explain (the last 3 reasons — mockup 05 chips)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S5 · explain ──");
  {
    const cEx = await rawContact(tidA, crmA);
    const made: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const at = new Date(NOW0.getTime() + i * 3_600_000);
      const row = await P.crmScoreLog.create({ data: { tenantId: tidA, contactId: cEx, ruleId: null, points: i + 1, reason: `เหตุผล ${i} ${TAG}`, createdAt: at, expiresAt: null } });
      made.push(row.id as string);
    }
    const old = await P.crmScoreLog.create({ data: { tenantId: tidA, contactId: cEx, ruleId: null, points: 99, reason: `หมดอายุแล้ว ${TAG}`, createdAt: new Date(NOW0.getTime() + 5 * 3_600_000), expiresAt: new Date(NOW0.getTime() - DAY), expired: true } });
    await P.crmContact.update({ where: { id: cEx }, data: { score: 10, scoreBand: "COLD" } });
    const ex = await call(explainF, cA, owner, cEx);
    const items = (ex.v?.items ?? ex.v ?? []) as Any[];
    const ids = items.map((x) => String(x?.logId ?? x?.id ?? ""));
    chk("C2.8-S5.1", "explain returns the 3 most recent NON-EXPIRED reasons, newest first (points + reason + at + ruleId), skips the expired one however recent it is, ignores the 4th-oldest, and reports the contact's score/band with them (mockup 05: three chips \"+15 นัดสำเร็จ · 2 วันก่อน\")",
      ex.ok && items.length === 3 && j(ids) === j([made[3], made[2], made[1]]) && !ids.includes(old.id) && Number(ex.v?.score) === 10 && items.every((x) => typeof x?.points === "number" && thai(x?.reason) && !!x?.at),
      "3 items newest-first", `explain=${ex.ok ? cut(j(ex.v), 200) : ex.err} ids=${cut(j(ids), 120)}${ABSENT}`);
  }
  {
    const cEmpty = await rawContact(tidA, crmA);
    const ex0 = await call(explainF, cA, owner, cEmpty);
    const cHist = await rawContact(tidA, crmA);
    const rGone = await mkRule(cA, { name: `กฎที่จะถูกลบ ${TAG}`, event: EV.FORM, points: 6 });
    await fire(cA, EV.FORM, { contactId: cHist, submissionId: `${TAG}-hist` }, { now: NOW0 });
    const del = await call(deleteRuleF, cA, owner, rGone, { confirm: true, reason: `เลิกใช้แล้ว ${TAG}` });
    if (!del.ok) await P.crmScoreRule.deleteMany({ where: { id: rGone } });
    const exH = await call(explainF, cA, owner, cHist);
    // ORACLE-EDIT 25 ก.ย. (Fable): crmA still holds the 8 seeded rules (S1.1) ⇒ `form_submitted` (+15) scores this event too — A.3 "every matching rule
    //   scores" — so the contact has 2 logs / 21; the history item is the one whose ruleId is the deleted rule, not "the only item"
    const itemsAll = (exH.v?.items ?? exH.v ?? []) as Any[];
    const itemsH = itemsAll.filter((it) => String(it?.ruleId ?? "") === rGone);
    chk("C2.8-S5.2", "explain on a contact with no live log ⇒ an empty list with score 0 (never an error) · a log whose RULE has been deleted keeps its reason as history (ruleId has no FK) and still shows up in explain",
      ex0.ok && ((ex0.v?.items ?? []) as Any[]).length === 0 && Number(ex0.v?.score ?? 0) === 0 && exH.ok && itemsAll.length === 2 && itemsH.length === 1 && String(itemsH[0]?.reason ?? "").includes("กฎที่จะถูกลบ") && (await scoreOf(cHist)) === 21,
      "empty · history kept (2 logs / 21 — seeded form_submitted +15 also fires)", `empty=${ex0.ok ? j(ex0.v) : ex0.err} deleted=${del.ok ? "service" : `raw (${cut(del.err, 40)})`} hist=${exH.ok ? cut(j(itemsH), 160) : exH.err}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S6 — recompute + dry-run (all = danger, X9)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S6 · recompute · dry-run ──");
  const footprint = async (tid: string): Promise<string[]> => {
    const n = async (f: () => Promise<number>) => String(await f().catch(() => -1));
    return [
      await n(() => P.auditLog.count({ where: { tenantId: tid } })),
      await n(() => P.outboxEvent.count({ where: { tenantId: tid } })),
      await n(() => P.appNotification.count({ where: { tenantId: tid } })),
      await n(() => P.crmScoreLog.count({ where: { tenantId: tid } })),
    ];
  };
  {
    await resetRules(crmRc);
    const cFix = await rawContact(tidA, crmRc);
    await P.crmScoreLog.createMany({ data: [
      { tenantId: tidA, contactId: cFix, ruleId: null, points: 30, reason: `มีอยู่ ${TAG}`, expiresAt: null },
      { tenantId: tidA, contactId: cFix, ruleId: null, points: 5, reason: `หมดแล้ว ${TAG}`, expiresAt: new Date(NOW0.getTime() - DAY), expired: true },
    ] });
    await P.crmContact.update({ where: { id: cFix }, data: { score: 999, scoreBand: "HOT" } }); // drifted on purpose
    const fp0 = await footprint(tidA);
    const dry = await call(recomputeF, cRc, owner, { contactId: cFix }, { dryRun: true });
    const fp1 = await footprint(tidA);
    const drifted = await scoreOf(cFix);
    const real = await call(recomputeF, cRc, owner, { contactId: cFix }, {});
    chk("C2.8-S6.1", "recompute(one contact, dryRun) reports the drift (999 → 30 = Σ non-expired) and writes NOTHING (score, band, audit, outbox, notification, log rows all unchanged) · the real call then fixes score 30 and band (COLD under the default 50/20)",
      dry.ok && j(fp0) === j(fp1) && drifted === 999 && real.ok && (await scoreOf(cFix)) === 30 && ["COLD", "WARM"].includes(await bandOf(cFix)) && (await sumLive(cFix)) === 30,
      "dry silent · then 30", `dry=${dry.ok ? cut(j(dry.v), 140) : dry.err} footprint=${j(fp0)}→${j(fp1)} beforeReal=${drifted} after=${await scoreOf(cFix)}/${await bandOf(cFix)}${ABSENT}`);
  }
  {
    const cAll = await rawContact(tidA, crmRc);
    await P.crmScoreLog.create({ data: { tenantId: tidA, contactId: cAll, ruleId: null, points: 8, reason: `ทั้งร้าน ${TAG}`, expiresAt: null } });
    await P.crmContact.update({ where: { id: cAll }, data: { score: 500 } });
    const cForeign = await rawContact(tidA, crmA, { score: 777 });
    const fp0 = await footprint(tidA);
    const noConfirm = await call(recomputeF, cRc, owner, { all: true }, {});
    const shortReason = await call(recomputeF, cRc, owner, { all: true }, { confirm: true, reason: "สั้น" });
    const fp1 = await footprint(tidA);
    const stillDrifted = await scoreOf(cAll);
    const ok = await call(recomputeF, cRc, owner, { all: true }, { confirm: true, reason: `คะแนนเพี้ยนหลังนำเข้า ${TAG}` });
    const audits = ((await P.auditLog.findMany({ where: { tenantId: tidA, action: { startsWith: "crm.score." } } })) as Any[]).filter((a) => String(a.action).includes("recompute"));
    chk("C2.8-S6.2", "recompute({ all: true }) is a DANGER op (X9): without confirm, and with a reason shorter than 5 characters, it is refused in Thai without blaming the user and NOTHING is written (score still 500, no audit/outbox row) · with confirm + a real reason it fixes this system's contacts (500 → 8) and writes an audit row `crm.score.recompute` · a contact of ANOTHER CRM system of the same tenant keeps its 777 (X1)",
      refusedAs(noConfirm, ["VALIDATION"]) && refusedAs(shortReason, ["VALIDATION"]) && j(fp0) === j(fp1) && stillDrifted === 500 && ok.ok && (await scoreOf(cAll)) === 8 && audits.length >= 1 && (await scoreOf(cForeign)) === 777,
      "refused ×2 · then 8 · audited", `noConfirm=${noConfirm.ok ? "ACCEPTED" : noConfirm.err} short=${shortReason.ok ? "ACCEPTED" : shortReason.err} footprint=${j(fp0)}→${j(fp1)} after=${await scoreOf(cAll)} audits=${audits.length} foreign=${await scoreOf(cForeign)}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S7 — UI (mockup 05 + the rules page) — static; the pixel parity is gate D7 (the controller opens the shots himself)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S7 · UI static ──");
  const codeOnly = (src: string): string => {
    const out = src.split("");
    let st = "";
    for (let i = 0; i < src.length; i += 1) {
      const c = src[i];
      if (st === "") {
        if (c === "/" && src[i + 1] === "/") { st = "lc"; out[i] = " "; out[i + 1] = " "; i += 1; continue; }
        if (c === "/" && src[i + 1] === "*") { st = "bc"; out[i] = " "; out[i + 1] = " "; i += 1; continue; }
        if (c === '"') st = "dq";
        else if (c === "'") st = "sq";
        continue;
      }
      if (st === "lc") { if (c === "\n") st = ""; else out[i] = " "; continue; }
      if (st === "bc") { if (c === "*" && src[i + 1] === "/") { out[i] = " "; out[i + 1] = " "; st = ""; i += 1; } else if (c !== "\n") out[i] = " "; continue; }
      if (c === "\\") { out[i] = " "; if (i + 1 < src.length) out[i + 1] = " "; i += 1; continue; }
      if ((st === "dq" && c === '"') || (st === "sq" && c === "'")) { st = ""; continue; }
      out[i] = " ";
    }
    return out.join("");
  };
  const mapSpans = (code: string): [number, number][] => {
    const spans: [number, number][] = [];
    const re = /\.map\s*\(/g;
    for (let m = re.exec(code); m; m = re.exec(code)) {
      let depth = 0;
      for (let k = m.index + m[0].length - 1; k < code.length; k += 1) {
        if (code[k] === "(") depth += 1;
        else if (code[k] === ")") { depth -= 1; if (depth === 0) { spans.push([m.index, k]); break; } }
      }
    }
    return spans;
  };
  {
    const page = read(PAGE);
    const nav = read(NAV_FILE);
    let inv: Any[] = [];
    try { inv = (JSON.parse(read(INVENTORY)).rows ?? []) as Any[]; } catch { inv = []; }
    const rows = inv.filter((r) => r?.wo === "C2.8" && /\/settings\/scoring/.test(String(r?.page ?? "")));
    const uiFiles = [...new Set([PAGE, ...walk(PAGE_DIR), ...walk(COMP_DIR)])].filter((f) => read(f).length > 0);
    const needIds = ["crm-score-rule-list", "crm-score-rule-new", "crm-score-band-hot", "crm-score-band-warm", "crm-score-decay-days", "crm-score-recompute-btn"];
    const missIds = needIds.filter((t) => !uiFiles.map(read).join("\n").includes(t));
    const bad: string[] = [];
    for (const r of rows) {
      const idStr = String(r.testid ?? "");
      const isPat = idStr.endsWith("*");
      const base = isPat ? idStr.slice(0, -1) : idStr;
      if (!/^[A-Za-z0-9._-]+$/.test(base)) { bad.push(`${idStr || "(empty)"}:bad-id`); continue; }
      let statics = 0;
      let dyn = 0;
      let inMap = 0;
      for (const f of uiFiles) {
        const src = read(f);
        const spans = mapSpans(codeOnly(src));
        const sRe = new RegExp(`data-testid=\\{?["'\`]${base}["'\`]`, "g");
        for (let m = sRe.exec(src); m; m = sRe.exec(src)) { statics += 1; if (spans.some(([a, b]) => m!.index > a && m!.index < b)) inMap += 1; }
        const dRe = new RegExp("data-testid=\\{`" + base + "\\$\\{", "g");
        for (let m = dRe.exec(src); m; m = dRe.exec(src)) dyn += 1;
      }
      if (isPat) { if (dyn < 1 || statics > 0) bad.push(`${idStr}:indexed pattern but static=${statics} dynamic=${dyn}`); }
      else if (statics !== 1 || inMap > 0) bad.push(`${idStr}:rendered ${statics}×${inMap > 0 ? " inside .map() without an index suffix ⇒ duplicate ids in the DOM" : ""}`);
    }
    chk("C2.8-S7.1", `the rules page ${PAGE} guards like every CRM v2 page (type "CRM" → requireCrmV2Page → crmCan(… "crm.score.manage") → notFound()) · CRM_DEEP_NAV has /crm/settings/scoring (status ready · wo C2.8) · ≥ 8 inventory rows (page /settings/scoring · wo C2.8), each rendered the right NUMBER of times (a static id exactly once and never inside a .map( body; an indexed row as a template literal) · the 6 core testids exist [static]`,
      page.length > 0 && /type:\s*"CRM"/.test(page) && /requireCrmV2Page/.test(page) && /crm\.score\.manage/.test(page) && /notFound\(/.test(page)
      && /path:\s*"\/crm\/settings\/scoring"[^}]*status:\s*"ready"[^}]*wo:\s*"C2\.8"/.test(nav) && rows.length >= 8 && bad.length === 0 && missIds.length === 0,
      "guarded page · nav · ≥ 8 rows · 1 render each", `page=${page.length > 0} v2=${/requireCrmV2Page/.test(page)} perm=${/crm\.score\.manage/.test(page)} nav=${/\/crm\/settings\/scoring/.test(nav)} rows=${rows.length} bad=${cut(bad.join(" | "), 200) || "-"} missing=${missIds.join(",") || "-"}`, "MAJOR");
  }
  {
    // mockup 05: the badge and the three reason chips on the contact 360 + client/server purity
    const c360 = read(C360_PAGE);
    const compFiles = [...walk("src/components/crm"), ...walk(PAGE_DIR), ...walk(COMP_DIR)];
    const all360 = [c360, ...compFiles.filter((f) => /score|contact/i.test(f)).map(read)].join("\n");
    const hasBadge = /data-testid=["']contact-score-badge["']/.test(all360);
    const hasReasons = /data-testid=\{`contact-score-reason-\$\{/.test(all360) || /data-testid=["']contact-score-reason-/.test(all360);
    const hasExplain = /contact-score-explain-btn/.test(all360);
    const usesExplain = /scoring\.explain|explain\(/.test([c360, ...compFiles.map(read)].join("\n"));
    const files = [...walk(PAGE_DIR), ...walk(COMP_DIR)];
    const isClient = (f: string) => /^\s*["']use client["']/.test(read(f));
    const isServerFile = (f: string) => /^\s*["']use server["']/.test(read(f));
    const noComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
    const specsOf = (src: string): string[] => {
      const out: string[] = [];
      const re = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
      for (let m = re.exec(src); m; m = re.exec(src)) out.push(m[1]);
      return out;
    };
    const REACHES_PRISMA = (spec: string) => spec === "@prisma/client" || spec === "@/lib/core/db" || /^@\/lib\/modules\/crm(\/(?!.*-shared$).*)?$/.test(spec);
    const resolveSpec = (fromFile: string, spec: string): string | null => {
      const base = spec.startsWith("@/") ? join("src", spec.slice(2)) : /^\.\.?\//.test(spec) ? join(dirname(fromFile), spec) : "";
      if (!base) return null;
      for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) if (existsSync(c) && statSync(c).isFile()) return c;
      return null;
    };
    const badEdges: string[] = [];
    const seen = new Set<string>();
    const visit = (f: string, depth: number): void => {
      if (seen.has(`${f}#${depth}`)) return;
      seen.add(`${f}#${depth}`);
      const specs = specsOf(noComments(read(f)));
      for (const sp of specs) if (REACHES_PRISMA(sp)) badEdges.push(`${f} → ${sp}`);
      if (depth >= 2) return;
      for (const sp of specs) {
        const t = resolveSpec(f, sp);
        if (!t || isServerFile(t) || /-shared\.tsx?$/.test(t)) continue;
        visit(t, depth + 1);
      }
    };
    for (const f of files.filter(isClient)) visit(f, 0);
    const serverFiles = files.filter(isServerFile);
    const serverBad = serverFiles.filter((f) => /export\s+(type|interface|const|let|function\s)/.test(read(f)) || !/assertCrmV2|crmUiVersion/.test(read(f)));
    chk("C2.8-S7.2", "mockup 05 on the contact 360: the score badge carries data-testid=\"contact-score-badge\", the three newest reasons are rendered as chips (contact-score-reason-* — an indexed testid) fed by `explain`, and contact-score-explain-btn opens the full list · no `'use client'` file of the scoring UI reaches prisma along its real import graph (2 levels; \"use server\" and *-shared are safe boundaries) · every \"use server\" file exports async functions only and calls assertCrmV2 [static]",
      c360.length > 0 && hasBadge && hasReasons && hasExplain && usesExplain && badEdges.length === 0 && serverFiles.length >= 1 && serverBad.length === 0,
      "badge + 3 chips + explain · clean graph", `badge=${hasBadge} chips=${hasReasons} btn=${hasExplain} usesExplain=${usesExplain} badEdges=${cut(badEdges.join(" | "), 160) || "-"} serverFiles=${serverFiles.length} serverBad=${serverBad.join(",") || "-"}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S8 — brief extras: CRUD/validation · permissions · ADJUST_SCORE · settings writer · inactivity · bridge gate · scoreOnSubmit
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S8 · brief extras ──");
  {
    const n0 = (await P.crmScoreRule.count({ where: { systemId: crmA } })) as number;
    const bad = [
      ["blank name", await call(createRuleF, cA, owner, { name: "", event: EV.ACT, points: 5 })],
      ["unknown event", await call(createRuleF, cA, owner, { name: `ผิด ${TAG}`, event: "pos.sale.paid", points: 5 })],
      ["points 0", await call(createRuleF, cA, owner, { name: `ผิด ${TAG}`, event: EV.ACT, points: 0 })],
      ["points 5000", await call(createRuleF, cA, owner, { name: `ผิด ${TAG}`, event: EV.ACT, points: 5000 })],
      ["maxPerDay 0", await call(createRuleF, cA, owner, { name: `ผิด ${TAG}`, event: EV.ACT, points: 5, maxPerDay: 0 })],
      ["expiresDays -1", await call(createRuleF, cA, owner, { name: `ผิด ${TAG}`, event: EV.ACT, points: 5, expiresDays: -1 })],
      ["unknown condition field", await call(createRuleF, cA, owner, { name: `ผิด ${TAG}`, event: EV.ACT, points: 5, conditions: { items: [{ field: "zzz.nope", op: "eq", value: "x" }] } })],
    ] as [string, Res][];
    const accepted = bad.filter(([, r]) => !refusedAs(r, ["VALIDATION"])).map(([k, r]) => `${k}:${r.ok ? "ACCEPTED" : r.err}`);
    const good = await call(createRuleF, cA, owner, { name: `ปกติ ${TAG}`, event: EV.ACT, points: 4, maxPerDay: 2, expiresDays: 30 });
    const upd = good.ok ? await call(updateRuleF, cA, owner, good.v?.id, { points: 6, name: `ปกติแก้แล้ว ${TAG}` }) : MISSING;
    const off = good.ok ? await call(toggleRuleF, cA, owner, good.v?.id, false) : MISSING;
    const list = await call(listRulesF, cA, owner);
    const foreign = await call(updateRuleF, cB, owner, good.v?.id ?? NONE, { points: 1 });
    const n1 = (await P.crmScoreRule.count({ where: { systemId: crmA } })) as number;
    const listed = ((list.v?.items ?? list.v ?? []) as Any[]);
    chk("C2.8-S8.1", "rules CRUD + validation: 7 bad inputs (blank name · non-CRM event · points 0 · points 5000 · maxPerDay 0 · expiresDays −1 · unknown condition field) are each refused with a Thai VALIDATION that does not blame the user and write NOTHING · a good rule is created, updated (points 6), toggled off, and listed in sortOrder · the same rule id through ANOTHER tenant's ctx ⇒ NOT_FOUND",
      accepted.length === 0 && good.ok && upd.ok && Number(upd.v?.points) === 6 && off.ok && off.v?.active === false && list.ok && listed.length === n1 && refusedAs(foreign, ["NOT_FOUND"]) && n1 === n0 + 1,
      "7 refused · CRUD ok", `accepted=${cut(accepted.join(" | "), 200) || "-"} create=${good.ok ? "ok" : good.err} update=${upd.ok ? upd.v?.points : upd.err} toggle=${off.ok ? off.v?.active : off.err} list=${listed.length}/${n1} foreign=${foreign.ok ? "ACCEPTED" : foreign.code} rows ${n0}→${n1}${ABSENT}`);
  }
  {
    const cPerm = await rawContact(tidA, crmA, { ownerUserId: userS }); // ORACLE-EDIT 25 ก.ย. (Fable): "a contact he may open" — STAFF default visibility is TEAM (own ∪ team); a team-less staff cannot see userA's rows (X1.3 asserts exactly that)
    const rules = await call(listRulesF, cA, staff);
    const create = await call(createRuleF, cA, staff, { name: `แอบสร้าง ${TAG}`, event: EV.ACT, points: 3 });
    const setS = await call(setSetF, cA, staff, { hot: 10, warm: 5 });
    const rec = await call(recomputeF, cA, staff, { contactId: cPerm }, {});
    const keyedOk = await call(listRulesF, cA, staffKeyed);
    const explainStaff = await call(explainF, cA, staff, cPerm);
    chk("C2.8-S8.2", "permissions: a STAFF holding only the read keys is refused (Thai, 403/404) on listRules · createRule · setScoringSettings · recompute, while a STAFF holding `crm.score.manage` gets the list · `explain` needs only `crm.contact.read`, so the same read-only STAFF can see the reasons of a contact he may open",
      refusedAs(rules, ["FORBIDDEN", "NOT_FOUND"]) && refusedAs(create, ["FORBIDDEN", "NOT_FOUND"]) && refusedAs(setS, ["FORBIDDEN", "NOT_FOUND"]) && refusedAs(rec, ["FORBIDDEN", "NOT_FOUND"]) && keyedOk.ok && explainStaff.ok,
      "4 refused · keyed ok · explain ok", `list=${rules.ok ? "ACCEPTED" : rules.code} create=${create.ok ? "ACCEPTED" : create.code} settings=${setS.ok ? "ACCEPTED" : setS.code} recompute=${rec.ok ? "ACCEPTED" : rec.code} keyed=${keyedOk.ok ? "ok" : keyedOk.err} explain=${explainStaff.ok ? "ok" : explainStaff.err}${ABSENT}`);
  }
  {
    // ADJUST_SCORE: the C2.1 stub ("ระบบคะแนนผู้ติดต่อยังไม่เปิดใช้") must be gone
    const AUTO = (await import("@/lib/modules/crm/automation" as string).catch(() => ({}))) as Any;
    const cAdj = await rawContact(tidA, crmB4, { lifecycleStage: "LEAD" });
    const rule = await call(AUTO.createRule, { tenantId: tidA, systemId: crmB4, actorUserId: userA }, owner, {
      name: `ปรับคะแนนเอง ${TAG}`, trigger: { event: "crm.contact.updated" },
      actions: [{ type: "ADJUST_SCORE", params: { points: 7, reason: `กฎให้คะแนน ${TAG}` } }],
    });
    const rid = (rule.v?.id as string) ?? NONE;
    const run = await call(AUTO.runForCrmEvent, { tenantId: tidA, type: "crm.contact.updated", payload: { contactId: cAdj, changedKeys: ["tags"] }, id: `${TAG}-adj-1`, systemId: crmB4 });
    const again = await call(AUTO.runForCrmEvent, { tenantId: tidA, type: "crm.contact.updated", payload: { contactId: cAdj, changedKeys: ["tags"] }, id: `${TAG}-adj-1`, systemId: crmB4 });
    const logs = await logsOf(cAdj);
    const runRow = ((await P.automationRun.findMany({ where: { ruleId: rid } })) as Any[])[0];
    const stubText = /ระบบคะแนนผู้ติดต่อยังไม่เปิดใช้/.test(j(runRow ?? {}));
    const src = read(AUTO_FILE);
    chk("C2.8-S8.3", "ADJUST_SCORE really adjusts now (C2.1's skip stub replaced inside a `// CRM C2.8 ▸` block of automation.ts): a rule with ADJUST_SCORE +7 gives the contact 7 points with ONE CrmScoreLog row (ruleId null = not a score rule, reason mentioning the automation rule, refType/refId pointing at it) and the run is OK, not a SKIPPED \"ระบบคะแนนยังไม่เปิดใช้\" · re-running the same event adds nothing",
      rule.ok && run.ok && again.ok && logs.length === 1 && Number(logs[0]?.points) === 7 && (await scoreOf(cAdj)) === 7 && !stubText && /CRM C2\.8 ▸/.test(src),
      "1 log · +7 · no stub", `rule=${rule.ok ? "ok" : rule.err} run=${run.ok ? j(run.v) : run.err} logs=${logs.length} score=${await scoreOf(cAdj)} stub=${stubText} block=${/CRM C2\.8 ▸/.test(src)}${ABSENT}`);
  }
  {
    const before = await call(getSetF, cA, owner);
    const bad = [
      await call(setSetF, cA, owner, { hot: 10, warm: 20 }), // hot ≤ warm
      await call(setSetF, cA, owner, { hot: 50, warm: -5 }),
      await call(setSetF, cA, owner, { hot: 50, warm: 20, decayDays: -1 }),
    ];
    const mid = await call(getSetF, cA, owner);
    const ok = await call(setSetF, cA, owner, { hot: 55, warm: 25, decayDays: 45 });
    const raw = ((await P.appSystem.findFirst({ where: { id: crmA } })) as Any)?.settings?.crm ?? {};
    const audits = ((await P.auditLog.findMany({ where: { tenantId: tidA, action: { startsWith: "crm.score." } } })) as Any[]).length;
    const setSrc = read(SETTINGS_FILE);
    chk("C2.8-S8.4", "scoring settings live at settings.crm.scoring through the C1.5 writer: 3 bad patches (hot ≤ warm · warm < 0 · decayDays < 0) refused in Thai with the stored value unchanged · a good patch stores { hot 55, warm 25, decayDays 45 } with ONE jsonb_set so uiVersion/bridgesEnabled survive, and it is audited",
      bad.every((r) => refusedAs(r, ["VALIDATION"])) && j(mid.v ?? null) === j(before.v ?? null) && ok.ok && Number(raw?.scoring?.hot) === 55 && Number(raw?.scoring?.warm) === 25 && Number(raw?.scoring?.decayDays) === 45 && raw?.uiVersion === 2 && raw?.bridgesEnabled === true && audits >= 1 && /scoring/.test(setSrc),
      "refused ×3 · stored · siblings survive", `bad=${bad.map((b) => (b.ok ? "ACCEPTED" : b.code)).join(",")} value=${j(before.v ?? null)}→${j(mid.v ?? null)} stored=${cut(j(raw), 160)} audits=${audits}${ABSENT}`);
    await call(setSetF, cA, owner, { hot: 50, warm: 20, decayDays: 0 });
  }
  {
    await resetRules(crmI);
    const rIn = await mkRule(cI, { name: `เงียบไป 30 วัน ${TAG}`, event: "crm.contact.inactive", points: -10, expiresDays: 90, conditions: { days: 30 } });
    const cQuiet = await rawContact(tidA, crmI, { score: 40, lastActivityAt: new Date(NOW0.getTime() - 40 * DAY) });
    const cLive = await rawContact(tidA, crmI, { score: 40, lastActivityAt: new Date(NOW0.getTime() - 2 * DAY) });
    const r1 = await call(inactiveF, { now: NOW0, tenantIds: [tidA], systemIds: [crmI] });
    const r2 = await call(inactiveF, { now: NOW0, tenantIds: [tidA], systemIds: [crmI] });
    const r3 = await call(inactiveF, { now: new Date(NOW0.getTime() + 2 * DAY), tenantIds: [tidA], systemIds: [crmI] });
    const qLogs = await logsOf(cQuiet);
    chk("C2.8-S8.5", "the VIRTUAL `crm.contact.inactive` rule (seed 8, −10, expiresDays 90 — no outbox event, no consumer: the daily job decides it): a contact quiet for 40 days loses 10 points ONCE PER SPELL (the same sweep run again, and a run two days later, add nothing) while a contact active 2 days ago is untouched · the log's eventKey pins the spell",
      rIn !== NONE && r1.ok && r2.ok && r3.ok && qLogs.length === 1 && Number(qLogs[0]?.points) === -10 && (await scoreOf(cQuiet)) === 30 && typeof qLogs[0]?.eventKey === "string" && (await logsOf(cLive)).length === 0 && (await scoreOf(cLive)) === 40,
      "1 log · 30 · live untouched", `sweep1=${r1.ok ? j(r1.v) : r1.err} again=${r2.ok ? j(r2.v) : r2.err} later=${r3.ok ? j(r3.v) : r3.err} logs=${qLogs.length} score=${await scoreOf(cQuiet)} live=${(await logsOf(cLive)).length}/${await scoreOf(cLive)}${ABSENT}`);
  }
  {
    // the bridge gate comes first: bridgesEnabled false ⇒ the scoring extra does nothing, although uiVersion is 2
    const BR = (await import("@/lib/platform/crm-bridges" as string).catch(() => ({}))) as Any;
    const onScoring = fnOf(BR, "onScoringEvent");
    await resetRules(crmG);
    await mkRule(cG, { name: `ปิดสะพาน ${TAG}`, event: EV.ACT, points: 11 });
    const cGate = await rawContact(tidA, crmG);
    const act = (await P.crmActivity.create({ data: { tenantId: tidA, systemId: crmG, contactId: cGate, type: "CALL", title: `โทร ${TAG}`, ownerUserId: userA } })) as Any;
    const evt = { id: `${TAG}-gate-1`, tenantId: tidA, type: EV.ACT, payload: { activityId: act.id, contactId: cGate, type: "CALL" }, systemId: crmG, unitId: null };
    const closed = await call(onScoring, evt);
    const closedLogs = await logsOf(cGate);
    const closedScore = await scoreOf(cGate); // ORACLE-EDIT 25 ก.ย. (Fable): snapshot BEFORE the gate reopens
    await setCrm(crmG, { bridgesEnabled: true });
    const open = await call(onScoring, { ...evt, id: `${TAG}-gate-2` });
    const openLogs = await logsOf(cGate);
    await setCrm(crmG, { bridgesEnabled: false });
    chk("C2.8-S8.6", "the gate comes FIRST (crm-bridges/core.ts rule, R-E.14): with bridgesEnabled false the scoring extra writes no log, no event and does not throw although the system is uiVersion 2 · flipping the switch back on, the very same event scores +11 — so the switch is a real kill switch, not a half one",
      typeof onScoring === "function" && closed.ok && closedLogs.length === 0 && closedScore === 0 && open.ok && openLogs.length === 1 && (await scoreOf(cGate)) === 11,
      "0 then 1 log", `bridge=${typeof onScoring} closed=${closed.ok ? "ok" : closed.err} logsClosed=${closedLogs.length} scoreClosed=${closedScore} open=${open.ok ? "ok" : open.err} logsOpen=${openLogs.length} score=${await scoreOf(cGate)}${ABSENT}`);
  }
  {
    // FormDef.scoreOnSubmit (C2.6 column, C2.8 points) — driven through `adjust`, once per submission
    const cForm = await rawContact(tidA, crmF);
    const form = (await P.formDef.create({ data: { tenantId: tidA, name: `ฟอร์มคะแนน ${TAG}`, publicToken: `${TAG}-tok-${nx()}-${Math.random().toString(36).slice(2, 10)}`, crmEnabled: true, crmSystemId: crmF, scoreOnSubmit: 12, fieldsJson: [{ key: "name", type: "TEXT", label: "ชื่อ", required: true }] } })) as Any;
    const sub = (await P.formSubmission.create({ data: { tenantId: tidA, formId: form.id, answersJson: { name: pii(`ผู้กรอก ${TAG}`) }, crmContactId: cForm } })) as Any;
    const key = `form#${sub.id}`;
    const a1 = await call(adjustF, cF, null, { contactId: cForm, points: Number(form.scoreOnSubmit), reason: `คะแนนจากฟอร์ม ${form.name}`, refType: "FORM_SUBMISSION", refId: sub.id, eventKey: key });
    const a2 = await call(adjustF, cF, null, { contactId: cForm, points: Number(form.scoreOnSubmit), reason: `คะแนนจากฟอร์ม ${form.name}`, refType: "FORM_SUBMISSION", refId: sub.id, eventKey: key });
    const logs = await logsOf(cForm);
    chk("C2.8-S8.7", "FormDef.scoreOnSubmit (12 here) arrives through `adjust` with refType/refId pointing at the submission and an eventKey `form#<submissionId>` ⇒ the score is 12 and replaying the same submission adds NO second log (adjust is idempotent when an eventKey is given, although ruleId is null and the partial UNIQUE does not apply)",
      a1.ok && a2.ok && logs.length === 1 && Number(logs[0]?.points) === 12 && (await scoreOf(cForm)) === 12 && String(logs[0]?.refId ?? "") === sub.id,
      "1 log · 12", `first=${a1.ok ? j(a1.v) : a1.err} second=${a2.ok ? j(a2.v) : a2.err} logs=${logs.length} score=${await scoreOf(cForm)}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X1 — scope: cross tenant · cross CRM system of the same tenant · cross team (404 not 403, nothing leaks)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X1 · scope ──");
  {
    const cHome = await rawContact(tidA, crmT, { score: 25 });
    await P.crmScoreLog.create({ data: { tenantId: tidA, contactId: cHome, ruleId: null, points: 25, reason: `ของร้าน A ${TAG}`, expiresAt: null } });
    const foreignExplain = await call(explainF, cB, owner, cHome);
    const foreignRecompute = await call(recomputeF, cB, owner, { contactId: cHome }, {});
    const leak = `${foreignExplain.msg} ${foreignRecompute.msg}`;
    chk("C2.8-X1.1", "cross tenant: explain and recompute of tenant A's contact through tenant B's ctx ⇒ NOT_FOUND (404-not-403, Thai) and the message leaks nothing about the row (no name/phone, no score, no reason text)",
      refusedAs(foreignExplain, ["NOT_FOUND"]) && refusedAs(foreignRecompute, ["NOT_FOUND"]) && !PII.some((p) => leak.includes(p)) && !leak.includes("25") && (await scoreOf(cHome)) === 25,
      "404 ×2 · no leak", `explain=${foreignExplain.ok ? "ACCEPTED" : foreignExplain.code} recompute=${foreignRecompute.ok ? "ACCEPTED" : foreignRecompute.code} leak=${cut(leak, 120)}${ABSENT}`);
  }
  {
    const cOther = await rawContact(tidA, crmA, { score: 9 });
    await resetRules(crmT);
    await mkRule(cT, { name: `ข้ามระบบ ${TAG}`, event: EV.ACT, points: 33 });
    const crossExplain = await call(explainF, cT, owner, cOther); // contact of crmA read through crmT
    const crossFire = await fire(cT, EV.ACT, { contactId: cOther, activityId: `${TAG}-cross` }, { now: NOW0 });
    chk("C2.8-X1.2", "cross CRM system of the SAME tenant: explain through the other system's ctx ⇒ NOT_FOUND · onEvent with a contact that belongs to another CRM system scores NOTHING (logged 0, score untouched at 9) — rules never reach outside their own system",
      refusedAs(crossExplain, ["NOT_FOUND"]) && crossFire.ok && Number(crossFire.v?.logged ?? -1) === 0 && (await scoreOf(cOther)) === 9 && (await logsOf(cOther)).length === 0,
      "404 · logged 0", `explain=${crossExplain.ok ? "ACCEPTED" : crossExplain.code} fire=${crossFire.ok ? j(crossFire.v) : crossFire.err} score=${await scoreOf(cOther)}${ABSENT}`);
  }
  {
    // cross team under a TEAM visibility policy: nok (owner's team) sees the reasons, thana (another team) does not
    const cTeam = await rawContact(tidA, crmT, { ownerUserId: userNk, teamId: teamNok, score: 12 });
    await P.crmScoreLog.create({ data: { tenantId: tidA, contactId: cTeam, ruleId: null, points: 12, reason: `ของทีมภูเก็ต ${TAG}`, expiresAt: null } });
    await P.crmVisibilityPolicy.create({ data: { tenantId: tidA, systemId: crmT, role: "STAFF", teamId: null, pipelineId: null, entity: "CONTACT", visibility: "TEAM" } });
    const mine = await call(explainF, cT, nok, cTeam);
    const theirs = await call(explainF, cT, thana, cTeam);
    await P.crmVisibilityPolicy.deleteMany({ where: { systemId: crmT } });
    chk("C2.8-X1.3", "cross team (visibleWhere, C1.7): under an OWN/TEAM policy for STAFF the teammate of the owner CAN explain the contact, while a STAFF of ANOTHER team gets NOT_FOUND with no reason text in the message (the reasons are customer facts, not shop-wide facts)",
      mine.ok && ((mine.v?.items ?? []) as Any[]).length === 1 && refusedAs(theirs, ["NOT_FOUND"]) && !theirs.msg.includes("ของทีมภูเก็ต"),
      "teammate ok · outsider 404", `teammate=${mine.ok ? "ok" : mine.err} outsider=${theirs.ok ? "ACCEPTED" : theirs.code} msg=${cut(theirs.msg, 100)}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X3 — real concurrency: worker PROCESSES (own pool) — the score is a shared counter
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X3 · concurrency (processes) ──");
  const runWorkers = async (tid: string, sys: string, jobs: [string, Any][]): Promise<{ outs: string[][]; spawned: boolean }> => {
    const startAt = Date.now() + 45_000;
    const outs = await Promise.all(jobs.map(([mode, arg]) => new Promise<string>((resolve) => {
      const enc = Buffer.from(JSON.stringify(arg), "utf8").toString("base64url");
      const ch = spawn("pnpm", ["exec", "tsx", THIS_FILE, "--x3-worker", mode, tid, sys, userA, String(startAt), enc], { env: process.env });
      let out = "";
      const to = setTimeout(() => { try { ch.kill("SIGKILL"); } catch { /* already gone */ } }, 300_000);
      ch.stdout.on("data", (d: Any) => { out += String(d); });
      ch.stderr.on("data", (d: Any) => { out += String(d); });
      ch.on("error", (e: Any) => { clearTimeout(to); resolve(`SPAWN-ERROR ${String(e)}`); });
      ch.on("close", () => { clearTimeout(to); resolve(out); });
    })));
    const parsed = outs.map((o) => { const m = /X3WORKER (\[.*\])/.exec(o); return m ? (JSON.parse(m[1]) as string[]) : ["NO-OUTPUT"]; });
    return { outs: parsed, spawned: parsed.every((p) => !p.includes("NO-OUTPUT")) };
  };
  await resetRules(crmX);
  const rPar = await mkRule(cX, { name: `ยิงพร้อมกัน ${TAG}`, event: EV.ACT, points: 5 });
  const cPar = await rawContact(tidA, crmX);
  {
    const jobs: [string, Any][] = [0, 1, 2, 3].map((w) => ["onevent", { type: EV.ACT, payload: { contactId: cPar, activityId: `${TAG}-p-${w}` }, keys: [0, 1, 2].map((i) => `${TAG}-par-${w}-${i}`) }] as [string, Any]);
    const w = await runWorkers(tidA, crmX, jobs);
    const flat = w.outs.flat();
    chk("C2.8-X3.1a", "[positive control] 4 worker PROCESSES started together and returned 12 onEvent results — if this is red, X3.1 proves nothing about concurrency",
      w.spawned && flat.length === 12 && flat.filter((o) => o.startsWith("OK")).length === 12, "12 OK", `${flat.length} ${cut(flat.filter((o) => !o.startsWith("OK")).slice(0, 2).join(" | "), 200)}${ABSENT}`, "MAJOR");
    chk("C2.8-X3.1", "12 DIFFERENT events for the SAME contact fired from 4 separate processes (4 pools) ⇒ exactly 12 CrmScoreLog rows and score EXACTLY 60 = Σ points (no lost update: the score moves with one statement, never read-modify-write — [[reference_atomic_counter_single_statement]])",
      (await logsOf(cPar)).length === 12 && (await scoreOf(cPar)) === 60 && (await sumLive(cPar)) === 60,
      "12 logs · 60", `logs=${(await logsOf(cPar)).length} score=${await scoreOf(cPar)} sum=${await sumLive(cPar)} rule=${rPar !== NONE}${ABSENT}`);
  }
  {
    // the brief's X3: 50 parallel "email opened" with maxPerDay 3 ⇒ exactly 3 logs and +3 × points
    await resetRules(crmX);
    const rCap = await mkRule(cX, { name: `เปิดอีเมล จำกัดวัน ${TAG}`, event: EV.OPEN, points: 2, maxPerDay: 3 });
    const cCap = await rawContact(tidA, crmX);
    const jobs: [string, Any][] = [0, 1, 2, 3, 4].map((w) => ["onevent", { type: EV.OPEN, payload: { contactId: cCap, emailId: `${TAG}-cap-${w}` }, keys: Array.from({ length: 10 }, (_, i) => `${TAG}-cap-${w}-${i}`) }] as [string, Any]);
    const w = await runWorkers(tidA, crmX, jobs);
    const flat = w.outs.flat();
    const logs = (await logsOf(cCap)).filter((l) => l.ruleId === rCap);
    chk("C2.8-X3.2", "the brief's X3: 50 DIFFERENT \"email opened\" events fired in parallel from 5 processes against a rule with maxPerDay 3 ⇒ EXACTLY 3 logs and +6 on the score (count-then-insert lets dozens through; the cap must be decided by ONE conditional statement) · no call crashed",
      w.spawned && flat.filter((o) => o.startsWith("OK")).length === 50 && logs.length === 3 && (await scoreOf(cCap)) === 6,
      "3 logs · 6", `results=${flat.filter((o) => o.startsWith("OK")).length}/50 logs=${logs.length} score=${await scoreOf(cCap)} errs=${cut(flat.filter((o) => !o.startsWith("OK")).slice(0, 2).join(" | "), 160)}${ABSENT}`);
  }
  {
    // two rules on one event, 10 parallel deliveries (same pool, separate connections) — both rules must score every time
    await resetRules(crmX2);
    const r1 = await mkRule(cX2, { name: `กฎหนึ่ง ${TAG}`, event: EV.ACT, points: 5 });
    const r2 = await mkRule(cX2, { name: `กฎสอง ${TAG}`, event: EV.ACT, points: 3 });
    const cTwo = await rawContact(tidA, crmX2);
    const res = await Promise.all(Array.from({ length: 10 }, (_, i) => fire(cX2, EV.ACT, { contactId: cTwo, activityId: `${TAG}-two-${i}` }, { now: NOW0, eventKey: `${TAG}-two-${i}` })));
    const logs = await logsOf(cTwo);
    chk("C2.8-X3.3", "10 events delivered in parallel on separate connections to a system with TWO active rules for the same event (+5 and +3 — they are not alternatives) ⇒ 20 logs (10 per rule) and score EXACTLY 80",
      res.every((r) => r.ok) && logs.filter((l) => l.ruleId === r1).length === 10 && logs.filter((l) => l.ruleId === r2).length === 10 && (await scoreOf(cTwo)) === 80,
      "10 + 10 · 80", `ok=${res.filter((r) => r.ok).length}/10 r1=${logs.filter((l) => l.ruleId === r1).length} r2=${logs.filter((l) => l.ruleId === r2).length} score=${await scoreOf(cTwo)}${ABSENT}`);
  }
  {
    const src = scSrc;
    const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
    const bump = /score["']?\s*:\s*\{\s*(increment|decrement)/.test(code) || /"score"\s*=\s*GREATEST\([^)]*"score"\s*[+-]/.test(code) || /SET\s+"score"\s*=\s*GREATEST/i.test(code);
    const capOneStatement = /INSERT\s+INTO\s+"CrmScoreLog"/i.test(code) && /count\(/i.test(code);
    const noRmw = !/const\s+\w*[Ss]core\w*\s*=\s*\(?\s*(await\s+)?(prisma|db|tx)\.[\s\S]{0,120}\.score[\s\S]{0,200}update\([\s\S]{0,120}score\s*:/.test(code);
    const markers = ["X3", "X4", "X5"].filter((x) => new RegExp(`AUDIT-CLASS ${x}\\b`).test(src));
    chk("C2.8-X3.4", "[static] the counter is DB-side: the score moves through `increment`/`GREATEST(0, \"score\" + …)` in one statement (no read-in-JS-then-write), the maxPerDay cap is ONE conditional INSERT carrying its own count(…) subquery, and the implementation sites are marked `// AUDIT-CLASS X3 / X4 / X5`",
      src.length > 0 && bump && capOneStatement && noRmw && markers.length === 3,
      "atomic bump · conditional insert · 3 markers", `bump=${bump} conditionalInsert=${capOneStatement} noReadModifyWrite=${noRmw} markers=${markers.join(",") || "-"}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X4 — the same event twice and twice in parallel (the partial UNIQUE (ruleId, eventKey) is the guard)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X4 · redelivery ──");
  {
    await resetRules(crmF);
    const rOnce = await mkRule(cF, { name: `ส่งซ้ำ ${TAG}`, event: EV.ACT, points: 9 });
    const cTwice = await rawContact(tidA, crmF);
    const key = `${TAG}-twice`;
    const a = await fire(cF, EV.ACT, { contactId: cTwice, activityId: `${TAG}-t1` }, { now: NOW0, eventKey: key });
    const b = await fire(cF, EV.ACT, { contactId: cTwice, activityId: `${TAG}-t1` }, { now: NOW0, eventKey: key });
    const logs = (await logsOf(cTwice)).filter((l) => l.ruleId === rOnce);
    const changed = await evOf(tidA, "crm.score.changed", cTwice);
    chk("C2.8-X4.1", "the same source event delivered TWICE in sequence (same eventKey) ⇒ exactly ONE log for that rule, score +9 once, and ONE crm.score.changed event — the second call answers without an error (the partial UNIQUE (ruleId, eventKey) of migration *_crm_v2_b is the guard, not a count)",
      a.ok && b.ok && logs.length === 1 && (await scoreOf(cTwice)) === 9 && changed.length === 1,
      "1 log · 9 · 1 event", `first=${a.ok ? j(a.v) : a.err} second=${b.ok ? j(b.v) : b.err} logs=${logs.length} score=${await scoreOf(cTwice)} changed=${changed.length}${ABSENT}`);
  }
  {
    const cPar4 = await rawContact(tidA, crmF);
    const key = `${TAG}-par4`;
    const res = await Promise.all([0, 1, 2, 3].map(() => fire(cF, EV.ACT, { contactId: cPar4, activityId: `${TAG}-p4` }, { now: NOW0, eventKey: key })));
    const logs = await logsOf(cPar4);
    chk("C2.8-X4.2", "the same event delivered 4× IN PARALLEL (same eventKey, separate connections) ⇒ still exactly ONE log and +9 once · no call ends in a 500/unique-violation escaping to the caller",
      res.every((r) => r.ok) && logs.length === 1 && (await scoreOf(cPar4)) === 9,
      "1 log · 9", `ok=${res.filter((r) => r.ok).length}/4 logs=${logs.length} score=${await scoreOf(cPar4)} errs=${cut(res.filter((r) => !r.ok).map((r) => r.err).join(" | "), 160)}${ABSENT}`);
  }
  {
    // the real consumer chain: the scoring extra composed into an existing consumer, twice and twice in parallel
    const cCons = await rawContact(tidA, crmF);
    const act = (await P.crmActivity.create({ data: { tenantId: tidA, systemId: crmF, contactId: cCons, type: "MEETING", title: `นัด ${TAG}`, ownerUserId: userA, doneAt: new Date(NOW0) } })) as Any;
    const evt = { id: `${TAG}-cons-1`, tenantId: tidA, type: EV.ACT, payload: { activityId: act.id, contactId: cCons, type: "MEETING" }, systemId: crmF, unitId: null };
    const r1 = await call(CONS?.[EV.ACT], evt);
    const r2 = await call(CONS?.[EV.ACT], evt);
    const par = await Promise.all([0, 1, 2].map(() => call(CONS?.[EV.ACT], evt)));
    const logs = await logsOf(cCons);
    chk("C2.8-X4.3", "the wired CONSUMER path (the scoring extra composed into the `crm.activity.completed` consumer under the compose contract of C1.8): delivering the event once, again, and 3× in parallel ⇒ exactly ONE log and +9 once · the main consumer never fails because of the extra",
      r1.ok && r2.ok && par.every((r) => r.ok) && logs.length === 1 && (await scoreOf(cCons)) === 9,
      "1 log · 9", `first=${r1.ok ? "ok" : r1.err} second=${r2.ok ? "ok" : r2.err} parallel=${par.filter((r) => r.ok).length}/3 logs=${logs.length} score=${await scoreOf(cCons)}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X5 — the decay sweep: overlapping runs · a process that died after the claim
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X5 · decay claims ──");
  {
    const cOv = await rawContact(tidA, crmD, { score: 60 });
    const rows = Array.from({ length: 60 }, (_, i) => ({ tenantId: tidA, contactId: cOv, ruleId: null, points: 1, reason: `ซ้อน ${TAG}-${i}`, expiresAt: new Date(NOW0.getTime() - DAY) }));
    await P.crmScoreLog.createMany({ data: rows });
    const par = await Promise.all([0, 1, 2, 3].map(() => call(decayF, { now: NOW0, tenantIds: [tidA], systemIds: [crmD], batchSize: 5 })));
    const mine = await logsOf(cOv);
    const expired = mine.filter((l) => l.expired).length;
    const totalExpired = par.reduce((s, r) => s + Number(r.v?.expired ?? 0), 0);
    chk("C2.8-X5.1", "X5 overlapping runs: 4 decay sweeps started together (batchSize 5) over 60 expiring logs ⇒ every log is expired EXACTLY once (60 expired rows, and the runs report 60 in total — not 4 × 60), the score lands on 0 = Σ non-expired, and no sweep throws",
      par.every((r) => r.ok) && expired === 60 && totalExpired === 60 && (await scoreOf(cOv)) === 0,
      "60 expired once · 0", `ok=${par.filter((r) => r.ok).length}/4 expired=${expired} reported=${totalExpired} score=${await scoreOf(cOv)}${ABSENT}`);
  }
  {
    // died BETWEEN the claim and the settle: the flag is on, the score was never reduced ⇒ the next run must repair, not double-subtract
    const cCrash = await rawContact(tidA, crmD, { score: 30 });
    const made = await Promise.all(Array.from({ length: 3 }, (_, i) => P.crmScoreLog.create({ data: { tenantId: tidA, contactId: cCrash, ruleId: null, points: 10, reason: `ค้าง ${TAG}-${i}`, expiresAt: new Date(NOW0.getTime() - DAY) } })));
    await P.crmScoreLog.updateMany({ where: { id: { in: [made[0].id, made[1].id] } }, data: { expired: true } }); // the dead process got this far
    const fix = await call(decayF, { now: NOW0, tenantIds: [tidA], systemIds: [crmD] });
    const after = await logsOf(cCrash);
    chk("C2.8-X5.2", "X5 a process that died AFTER the claim: two logs already flagged expired while the score still says 30 ⇒ the next sweep expires the third one and RECONCILES the contact to Σ non-expired = 0 (it never subtracts the two claimed logs a second time, which a blind decrement would do and land on −20)",
      fix.ok && after.every((l) => l.expired) && (await scoreOf(cCrash)) === 0 && (await sumLive(cCrash)) === 0,
      "all expired · 0", `decay=${fix.ok ? j(fix.v) : fix.err} expired=${after.filter((l) => l.expired).length}/3 score=${await scoreOf(cCrash)}${ABSENT}`);
  }
  {
    // a real process KILLED in the middle of the sweep, then the parent finishes the job
    const cKill = await rawContact(tidA, crmD, { score: 25 });
    await P.crmScoreLog.createMany({ data: Array.from({ length: 25 }, (_, i) => ({ tenantId: tidA, contactId: cKill, ruleId: null, points: 1, reason: `ถูกฆ่า ${TAG}-${i}`, expiresAt: new Date(NOW0.getTime() - DAY) })) });
    const enc = Buffer.from(JSON.stringify({ systemIds: [crmD], nowMs: NOW0.getTime(), steps: 25 }), "utf8").toString("base64url");
    const killed = await new Promise<{ steps: number; out: string }>((resolve) => {
      // ORACLE-EDIT 25 ก.ย. (Fable · round 2): `pnpm exec` is the child and `tsx` the GRANDCHILD — `ch.kill` reached pnpm only and the worker ran to
      //   completion (steps=25). Spawn detached and kill the whole process group so the SIGKILL really lands mid-sweep.
      const ch = spawn("pnpm", ["exec", "tsx", THIS_FILE, "--x3-worker", "decayloop", tidA, crmD, userA, String(Date.now()), enc], { env: process.env, detached: true });
      const killGroup = () => { try { process.kill(-(ch.pid as number), "SIGKILL"); } catch { try { ch.kill("SIGKILL"); } catch { /* gone */ } } };
      let out = "";
      let steps = 0;
      const to = setTimeout(() => { killGroup(); resolve({ steps, out }); }, 180_000);
      ch.stdout.on("data", (d: Any) => {
        out += String(d);
        steps = (out.match(/C28STEP /g) ?? []).length;
        if (steps >= 3) killGroup();
      });
      ch.stderr.on("data", (d: Any) => { out += String(d); });
      ch.on("close", () => { clearTimeout(to); resolve({ steps, out }); });
    });
    const midExpired = (await logsOf(cKill)).filter((l) => l.expired).length;
    const midScore = await scoreOf(cKill);
    const finish = await call(decayF, { now: NOW0, tenantIds: [tidA], systemIds: [crmD] });
    const left = (await logsOf(cKill)).filter((l) => !l.expired).length;
    chk("C2.8-X5.3", "X5 with a REAL SIGKILL: a worker process sweeping one log per batch is killed after its 3rd batch ⇒ partial work is visible (some logs expired, the rest still due, the score consistent with Σ non-expired), then ONE sweep by the parent finishes every remaining log exactly once and the score ends at 0 — nothing is stuck and nothing is counted twice",
      killed.steps >= 3 && midExpired >= 1 && midExpired < 25 && midScore === 25 - midExpired && finish.ok && left === 0 && (await scoreOf(cKill)) === 0,
      "partial then finished · 0", `steps=${killed.steps} midExpired=${midExpired} midScore=${midScore} finish=${finish.ok ? j(finish.v) : finish.err} left=${left} score=${await scoreOf(cKill)}${cut(killed.out.includes("MISSING_FUNCTION") ? " worker:MISSING_FUNCTION" : "", 40)}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X8 — PDPA: no personal data in payloads / logs / OpsEvent · X9 — audit on every mutation
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X8 · PDPA · X9 · audit ──");
  {
    const outText = j(((await P.outboxEvent.findMany({ where: { tenantId: tidA, type: { startsWith: "crm.score." } } })) as Any[]).map((e) => e.payload));
    const logText = j(((await P.crmScoreLog.findMany({ where: { tenantId: tidA } })) as Any[]).map((l) => [l.reason, l.refType, l.refId]));
    const ops = ((await P.opsEvent.findMany({ where: { tenantId: tidA } }).catch(() => [])) as Any[]);
    const opsText = j(ops.map((o) => [o.message, o.detail]));
    const hits = PII.filter((p) => outText.includes(p) || logText.includes(p) || opsText.includes(p));
    chk("C2.8-X8.1", "X8: neither the crm.score.* payloads (ids + numbers only), nor CrmScoreLog.reason/refType/refId, nor any OpsEvent written during this run contains a customer name, phone or e-mail of this run — the reason is the RULE's name, never the customer's data",
      hits.length === 0, "no PII", `hits=${hits.slice(0, 3).join(",") || "-"} out=${cut(outText, 120)} log=${cut(logText, 120)}${ABSENT}`, "MAJOR");
  }
  {
    const mine = ((await P.outboxEvent.findMany({ where: { tenantId: tidA, type: { startsWith: "crm.score." } } })) as Any[]);
    const badSys = mine.filter((e) => !e.systemId || ![crmA, crmB4, crmD, crmRc, crmX, crmX2, crmI, crmG, crmF, crmT].includes(String(e.systemId)));
    const badKey = mine.filter((e) => !String(e.idempotencyKey ?? "").startsWith(`${e.type}#`));
    chk("C2.8-X8.2", "every crm.score.* event carries the CRM system it happened in (systemId set, one of this run's systems — the webhook/automation layer routes on it) and an idempotency key of the R-C.8 shape `<type>#<id>#…`",
      mine.length > 0 && badSys.length === 0 && badKey.length === 0, "systemId + `<type>#…` keys",
      `events=${mine.length} badSystem=${badSys.length} badKey=${cut(badKey.map((e) => String(e.idempotencyKey)).slice(0, 2).join(" | "), 120) || "-"}${ABSENT}`, "MAJOR");
  }
  {
    const cAud = await rawContact(tidA, crmA);
    const before = (await P.auditLog.count({ where: { tenantId: tidA, action: { startsWith: "crm.score." } } })) as number;
    const r = await call(createRuleF, cA, owner, { name: `ตรวจประวัติ ${TAG}`, event: EV.ACT, points: 3 });
    const id = (r.v?.id as string) ?? NONE;
    await call(updateRuleF, cA, owner, id, { points: 4 });
    await call(toggleRuleF, cA, owner, id, false);
    await call(reorderRulesF, cA, owner, [id]);
    await call(adjustF, cA, owner, { contactId: cAud, points: 3, reason: `ปรับมือ ${TAG}` });
    const noConfirm = await call(deleteRuleF, cA, owner, id, {});
    const short = await call(deleteRuleF, cA, owner, id, { confirm: true, reason: "สั้น" });
    const stillThere = (await P.crmScoreRule.count({ where: { id } })) as number;
    const del = await call(deleteRuleF, cA, owner, id, { confirm: true, reason: `เลิกใช้กฎนี้ ${TAG}` });
    const rows = ((await P.auditLog.findMany({ where: { tenantId: tidA, action: { startsWith: "crm.score." } } })) as Any[]);
    const actions = new Set(rows.map((a) => String(a.action)));
    chk("C2.8-X9.1", "X9: every scoring mutation writes an AuditLog row whose action starts with `crm.score.` — rule create/update/toggle/reorder/delete, a manual adjust and the settings/recompute rows of S6/S8 are all there (≥ 6 new rows, ≥ 5 distinct actions)",
      rows.length >= before + 6 && actions.size >= 5, "≥ 6 new rows · ≥ 5 actions", `rows ${before}→${rows.length} actions=${cut([...actions].join(","), 200)}${ABSENT}`);
    chk("C2.8-X9.2", "X9 danger: deleteRule without `confirm`, and with a reason shorter than 5 characters, is refused in Thai and the rule is still there; with confirm + a real reason it is deleted while its CrmScoreLog rows stay as history · no audit row carries a customer name or phone",
      refusedAs(noConfirm, ["VALIDATION"]) && refusedAs(short, ["VALIDATION"]) && stillThere === 1 && del.ok && (await P.crmScoreRule.count({ where: { id } })) === 0 && !PII.some((p) => j(rows.map((a) => [a.before, a.after])).includes(p)),
      "refused ×2 · then deleted", `noConfirm=${noConfirm.ok ? "ACCEPTED" : noConfirm.code} short=${short.ok ? "ACCEPTED" : short.code} before=${stillThere} delete=${del.ok ? "ok" : del.err}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // U — uiVersion 1 (PERMANENT RULE of C1.7/C1.11): no scoring at all, rows kept, resume at 2
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── U · uiVersion 1 ──");
  {
    const rV = await mkRule(cV, { name: `กฎร้าน v1 ${TAG}`, event: EV.ACT, points: 8 });
    const cVv = await rawContact(tidV, crmV, { score: 5 });
    await P.crmScoreLog.create({ data: { tenantId: tidV, contactId: cVv, ruleId: rV, points: 5, reason: `เก็บไว้ ${TAG}`, eventKey: `${TAG}-v-old`, expiresAt: new Date(NOW0.getTime() - DAY) } });
    await setCrm(crmV, { uiVersion: 1 });
    const fired = await fire(cV, EV.ACT, { contactId: cVv, activityId: `${TAG}-v1` }, { now: NOW0 });
    const logs = await logsOf(cVv);
    chk("C2.8-U.1", "uiVersion 1 (R-E.14): onEvent on a v1 system scores NOTHING although an active rule matches — no new log, the score stays 5, and the answer says so (logged 0 / skipped DISABLED) instead of throwing",
      fired.ok && Number(fired.v?.logged ?? -1) === 0 && logs.length === 1 && (await scoreOf(cVv)) === 5,
      "logged 0 · score 5", `fire=${fired.ok ? j(fired.v) : fired.err} logs=${logs.length} score=${await scoreOf(cVv)}${ABSENT}`);
    const dec = await call(decayF, { now: NOW0, tenantIds: [tidV], systemIds: [crmV] });
    const inact = await call(inactiveF, { now: NOW0, tenantIds: [tidV], systemIds: [crmV] });
    const kept = await logsOf(cVv);
    chk("C2.8-U.2", "the daily job skips a v1 system entirely: decay does not expire its logs (the expired-long-ago row is still `expired: false`) and applyInactivity writes nothing — the rows are KEPT, not cleaned up, so nothing is lost when the shop switches on",
      dec.ok && inact.ok && kept.length === 1 && kept[0]?.expired === false && (await scoreOf(cVv)) === 5,
      "nothing touched", `decay=${dec.ok ? j(dec.v) : dec.err} inactive=${inact.ok ? j(inact.v) : inact.err} expired=${kept[0]?.expired} score=${await scoreOf(cVv)}${ABSENT}`);
    const nR0 = (await P.crmScoreRule.count({ where: { systemId: crmV } })) as number;
    const refused: string[] = [];
    for (const [k, r] of [
      ["seed", await call(seedRulesF, cV, owner)],
      ["list", await call(listRulesF, cV, owner)],
      ["create", await call(createRuleF, cV, owner, { name: `v1 ${TAG}`, event: EV.ACT, points: 3 })],
      ["toggle", await call(toggleRuleF, cV, owner, rV, false)],
      ["settings", await call(setSetF, cV, owner, { hot: 30, warm: 10 })],
      ["recompute", await call(recomputeF, cV, owner, { contactId: cVv }, {})],
      ["explain", await call(explainF, cV, owner, cVv)],
    ] as [string, Res][]) if (!refusedAs(r, ["CRM_V2_DISABLED", "FORBIDDEN", "NOT_FOUND"])) refused.push(`${k}:${r.ok ? "ACCEPTED" : r.err}`);
    const nR1 = (await P.crmScoreRule.count({ where: { systemId: crmV } })) as number;
    chk("C2.8-U.3", "management at uiVersion 1 is refused for all 7 entries (seed · list · create · toggle · settings · recompute · explain ⇒ CRM_V2_DISABLED / FORBIDDEN / NOT_FOUND with a Thai message) and nothing is written — the rule row count does not move",
      refused.length === 0 && nR1 === nR0, "refused ×7 · no write", `${cut(refused.join(" | "), 260) || "-"} rows ${nR0}→${nR1}${ABSENT}`);
    await setCrm(crmV, { uiVersion: 2 });
    const back = await fire(cV, EV.ACT, { contactId: cVv, activityId: `${TAG}-v2` }, { now: NOW0 });
    const decBack = await call(decayF, { now: NOW0, tenantIds: [tidV], systemIds: [crmV] });
    const rows = await logsOf(cVv);
    chk("C2.8-U.4", "back at uiVersion 2 the KEPT rule resumes on the very next event (+8) and the sweep finally expires the old log ⇒ the score is Σ non-expired = 8 (nothing was lost while v1 was on)",
      back.ok && Number(back.v?.logged ?? 0) === 1 && decBack.ok && rows.length === 2 && rows.filter((l) => l.expired).length === 1 && (await scoreOf(cVv)) === 8 && (await sumLive(cVv)) === 8,
      "resumed · 8", `fire=${back.ok ? j(back.v) : back.err} decay=${decBack.ok ? j(decBack.v) : decBack.err} logs=${rows.length} expired=${rows.filter((l) => l.expired).length} score=${await scoreOf(cVv)}${ABSENT}`);
  }
  if (RAW_RULES.length > 0) console.log(`  ℹ️  ${RAW_RULES.length} score rule(s) had to be inserted raw (createRule absent/refused) — the onEvent/decay checks stay meaningful`);
} catch (e) {
  chk("C2.8-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — every row of the throwaway tenants (4 passes over every table with tenantId), systems/tenants, users.
  // No global drainOutbox (not tenant-scoped) — our PENDING events go with the tenant sweep.
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
      chk("C2.8-CLEAN", "the oracle gives the QC database back exactly as found — every throwaway tenant, every row it owned (contacts · score rules · score logs · outbox · audit) and the throwaway users are gone",
        left.length === 0 && tenants === 0 && users === 0, "0 rows · 0 tenants · 0 users", `${left.join(" · ") || "-"} · tenants=${tenants} users=${users}`, "MAJOR");
    } catch (e) {
      chk("C2.8-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C2.8: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
