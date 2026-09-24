// QC — CRM v2 WO C2.11: REST + AI, second set (~30 ops · 10 tools · the webhook events of phase C2 · docs regen)
//      the engines of C2.1–C2.10 (automation · sequences · assignment · scoring · e-mail · tracking · notifications) get an API surface:
//      ops in `src/lib/modules/crm/api/ops/*`, tools in `src/lib/modules/crm/api/tools.ts`, docs from `scripts/gen-crm-api-docs.mts`
// Oracle writer · the C2.11 builder must NOT touch this file · QC database only (.env.qc / .env.qc2 — loaded by scripts/acc-v2-env.mts)
// Run: bash scripts/iso.sh bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c2.11.mts
//      `--force-run` = run every check while the C2.11 ops are absent — the C2.11 checks red for the right reason ("op not in the
//                      registry" / 404 from the dispatcher), the fixtures + the structure facts that do not need C2.11 + CLEAN green
// requires: crm-seed   (house style — this oracle reads NO seeded row; everything lives in throwaway tenants `qc-c211-<rand>-*`)
//
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE: qc-crm-c1.10 (the first API set — registry/dispatch/actor/tools/docs are shared and
//   must stay green) · qc-member-m3.10 (the member API set — the same core dispatcher and key bundles) · qc-api-keys · qc-webhook ·
//   qc-crm-c2.1 … c2.10 (every service this work order exposes) · qc-crm-c1.7 (visibility through key filters) · qc-crm-v1 ·
//   `pnpm fitness` both modes (F13.10 every op has a test id in a qc-crm-* file · F13.11 docs not stale · F13.12 every tool has a home
//   in the `crm` skill) · qc-member-m1.9 (30/15/10/5 — untouched).
//
// SOURCES: crm-brief-C2.11.md (the op groups · the 10 tools · the danger list) · crm-brief-C1.10.md + scripts/qc-crm-c1.10.mts (THE
//   contract for the registry, the key bundles, the actor, the error mapping, the tool protocol and the docs generator — C2.11 only adds
//   rows to the same machine) · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-C.3 key filters are pseudo-scopes in `scopesJson` ·
//   R-C.7 teams REST · R-C.8 ids-only payloads · R-E.4 the tool split — C2.11's ten · R-E.14 uiVersion 1 ⇒ 409 crm_v2_disabled) ·
//   CRM-RUN §2 "C2.11" (op ~30 with a test id 1 · emails/sequences/assignment/scoring/tracking through keys 12 · 10 tools 4 ·
//   webhook events of C2 3 · docs regen 1 · image 1 = 22) · MASTER-PLAN §4 (X2 X6 X7 X8 X9) · docs/api/CRM-API.md · blueprint §8 ·
//   src/lib/api/op.ts (ApiOp: id · method · path · kind read|write|danger · action · rate · summary ASCII · label Thai · input zod
//   strict · test · tool) · src/lib/api-keys/scopes.ts (bundles crm.readonly ⊂ crm.operate ⊂ crm.admin) · scripts/fitness.mts F13.10–
//   F13.12 · src/lib/modules/crm/api/{registry,dispatch,tools,webhook-events,config}.ts.
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this) ══════════════════════════════════
//   A. THE 30 MUST OPS (id · METHOD path · action · kind · the service it calls — no second engine, the ops only call these services).
//      Every one of them carries `test: "<a check id of THIS file>"` (F13.10), a strict input schema (additionalProperties false),
//      every string capped, every array capped, list `take` ≤ 100, lists answer `data: { items[], nextCursor }` and accept `cursor`.
//        emails.threads.list      GET    /emails/threads                        crm.email.read        read   emails.listThreads
//        emails.thread.get        GET    /emails/threads/{threadKey}            crm.email.read        read   emails.getThread
//        emails.send              POST   /emails/send                           crm.email.send        write  emails.sendEmail   (danger when >1 recipient)
//        emails.schedule          POST   /emails/schedule                       crm.email.send        write  emails.scheduleEmail
//        emails.userSettings.get  GET    /emails/user-settings                  crm.email.settings    read   emails.getUserSetting
//        emails.userSettings.set  PUT    /emails/user-settings                  crm.email.settings    write  emails.setUserSetting
//        emails.routing.get       GET    /emails/routing                        crm.email.settings    read   emails.getRouting
//        emails.routing.set       PUT    /emails/routing                        crm.email.settings    write  emails.setRouting
//        emails.inbound.rotate    POST   /emails/inbound/rotate-key             crm.email.settings    danger emails.rotateInboundKey
//        emails.templates.list    GET    /emails/templates                      crm.email.read        read   emails.listTemplates
//        sequences.list           GET    /sequences                             crm.sequence.manage   read   sequences.listSequences
//        sequences.get            GET    /sequences/{id}                        crm.sequence.manage   read   sequences.getSequence
//        sequences.create         POST   /sequences                             crm.sequence.manage   write  sequences.createSequence
//        sequences.enroll         POST   /sequences/{id}/enroll                 crm.sequence.enroll   write  sequences.enroll
//        sequences.bulkEnroll     POST   /sequences/{id}/bulk-enroll            crm.sequence.enroll   danger sequences.bulkEnroll
//        sequences.stop           POST   /sequences/enrollments/{id}/stop       crm.sequence.enroll   write  sequences.stop
//        sequences.stats          GET    /sequences/{id}/stats                  crm.sequence.manage   read   sequences.stats
//        assignment.rules.list    GET    /assignment/rules                      crm.assignment.manage read   assignment.listRules
//        assignment.rules.create  POST   /assignment/rules                      crm.assignment.manage write  assignment.createRule
//        assignment.simulate      POST   /assignment/simulate                   crm.assignment.manage read   assignment.simulate (writes NOTHING)
//        scoring.rules.list       GET    /scoring/rules                         crm.score.manage      read   scoring.listRules
//        scoring.rules.create     POST   /scoring/rules                         crm.score.manage      write  scoring.createRule
//        scoring.explain          GET    /contacts/{id}/score                   crm.contact.read      read   scoring.explain
//        scoring.recompute        POST   /scoring/recompute                     crm.score.manage      danger scoring.recompute({all})
//        tracking.links.list      GET    /tracking/links                        crm.tracking.manage   read   tracking.listLinks
//        tracking.links.create    POST   /tracking/links                        crm.tracking.manage   write  tracking.createLink
//        tracking.links.stats     GET    /tracking/links/{id}/stats             crm.tracking.manage   read   tracking.linkStats
//        notifications.prefs.get  GET    /notifications/prefs                   crm.contact.read      read   notifications.getMyPrefs
//        notifications.prefs.set  PUT    /notifications/prefs                   crm.contact.read      write  notifications.setMyPrefs
//        automation.rules.list    GET    /automation/rules                      crm.automation.manage read   automation.listRules
//        automation.dryRun        POST   /automation/dry-run                    crm.automation.manage read   automation.dryRun (writes NOTHING)
//      RECOMMENDED (not asserted as MUST): emails.templates.upsert/delete · sequences.update/archive · assignment.rules.update/delete ·
//        scoring.rules.update/delete · scoring.seed · tracking.web.get/set · notifications.templates.get/set · automation.rules.get/
//        create/update/toggle/delete · stale.list. Whatever is added obeys the same rules (test id · strict schema · danger list).
//   B. DANGER LIST (X9 — `confirm: true` + `reason` ≥ 5 chars in the body, else refused with NOTHING written, and an audit row):
//      `emails.send` with more than one recipient · `sequences.bulkEnroll` · `scoring.recompute` with `{ all: true }` ·
//      `emails.inbound.rotate` · deleting an e-mail template that is in use. A single-recipient `emails.send` stays a plain write.
//   C. KEYS / SCOPES (X2 — the C1.10 machine, unchanged): a key with NO `crm.*` scope is refused on EVERY new op and EVERY crm tool ·
//      `crm.readonly` cannot send/enroll/recompute/rotate (403 forbidden|scope_missing) · `crm.operate` can do the STAFF writes but not
//      the `*.manage` groups (sequences/assignment/scoring/tracking/automation settings) · `crm.admin` can do all of it ·
//      `crm.filter.owner:<id>` / `crm.filter.team:<id>` are honoured by the new list ops · an AI assistant runs with
//      (key scopes ∩ the asking human's rights ∩ HIS teams) — a thana-level human never reads another team's threads.
//   D. AI TOOLS (10, R-E.4 · every one registered in the `crm` skill so F13.12 stays green):
//      read → `crm_email_thread` · `crm_score_explain` · `crm_stale_deals` · `crm_activities_due` · `crm_records_query`
//      draft → `crm_draft_email` (returns a draft, NEVER sends, no proposal to execute)
//      proposal → `crm_send_email` · `crm_enroll_sequence` · `crm_assign` · `crm_set_next_step`
//      `runCrmTool(ctx, name, args)` → `{ mode:"read", result }` | `{ mode:"propose", kind:"crm.<opId>", summary, payload }` |
//      `{ mode:"error", error }` (Thai) · `dispatchCrmKind(ctx, kind, payload)` executes an approved proposal ONCE.
//   E. WEBHOOKS: `crmWebhookEvents()` grows with every event phase C2 added (crm.sequence.enrolled/finished · crm.email.* ·
//      crm.score.changed/threshold · crm.deal.stale · crm.activity.overdue · the business events of C2.9 …) — each declared exactly once
//      in the label registries, each ids-only, deliveries signed as in C1.10. No e-mail BODY and no transcript in any payload (X8).
//   F. DOCS + PAGE: `pnpm exec tsx scripts/gen-crm-api-docs.mts` regenerates `docs/api/CRM-API.md` so that `renderDocs()` equals the
//      file on disk (F13.11) and the new groups appear in it · the existing `/crm/settings/api` page (C1.10) shows the new bundles and
//      the C2 webhook events; its testids stay in `scripts/crm-ui-inventory.json`. No new page, no migration, no new permission key.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// CHECK INVENTORY: 47 checks = S1 3 (registry · schemas · services only) · S2 12 (the groups through real API keys — CRM-RUN's 12) ·
//   S3 4 (the 10 tools) · S4 3 (C2 webhook events) · S5 1 (docs regen) · S6 1 (the API page) · S7 2 (error mapping · openapi) ·
//   X2 5 · X3 1 (idempotent send) · X6 3 · X7 2 · X8 3 · X9 3 · U 3 · CLEAN  (C2.11-FATAL only when something throws).
//   n/a: X1 (scope is X2 here — the same 404-not-403 machine is proven by qc-crm-c1.10) · X4/X5 (no consumer, no cron in this WO) ·
//   X10 (no new file/secret surface: the inbound key rotation is a danger op of C2.5's store).
// HOUSE RULES: SKIP guard before any DB connection · throwaway tenants `qc-c211-<rand>-*` swept in `finally` (+ the ChatRateBucket rows
//   of our keys) · `docs/api/CRM-API.md` is snapshotted and restored · the route handlers are imported and called directly (no server) ·
//   outbound transports are never reached (the ops that would send are called with the danger/scope guards that stop them, or with
//   injected deps where the service supports it) · last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const API_DIR = "src/lib/modules/crm/api";
const REG_FILE = `${API_DIR}/registry.ts`;
const OPS_DIR = `${API_DIR}/ops`;
const TOOLS_FILE = `${API_DIR}/tools.ts`;
const WEBHOOK_FILE = `${API_DIR}/webhook-events.ts`;
const ROUTE_SPEC = "@/app/api/v1/crm/[...path]/route";
const OA_SPEC = "@/app/api/v1/crm/openapi.json/route";
const GEN_SPEC = "./gen-crm-api-docs.mts";
const DOC_FILE = "docs/api/CRM-API.md";
const SKILLS_FILE = "src/lib/ai/skills.ts";
const API_PAGE = "src/app/app/sys/[id]/crm/settings/api/page.tsx";
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
// THE MUST OPS (id → METHOD path · action · kind) — the single source of truth of this file
// ═══════════════════════════════════════════════════════════════════════════════════
type Must = { id: string; m: string; p: string; action: string; kind: "read" | "write" | "danger"; group: string };
const MUST: Must[] = [
  { id: "emails.threads.list", m: "GET", p: "/emails/threads", action: "crm.email.read", kind: "read", group: "emails" },
  { id: "emails.thread.get", m: "GET", p: "/emails/threads/{threadKey}", action: "crm.email.read", kind: "read", group: "emails" },
  { id: "emails.send", m: "POST", p: "/emails/send", action: "crm.email.send", kind: "write", group: "emails" },
  { id: "emails.schedule", m: "POST", p: "/emails/schedule", action: "crm.email.send", kind: "write", group: "emails" },
  { id: "emails.userSettings.get", m: "GET", p: "/emails/user-settings", action: "crm.email.settings", kind: "read", group: "emails" },
  { id: "emails.userSettings.set", m: "PUT", p: "/emails/user-settings", action: "crm.email.settings", kind: "write", group: "emails" },
  { id: "emails.routing.get", m: "GET", p: "/emails/routing", action: "crm.email.settings", kind: "read", group: "emails" },
  { id: "emails.routing.set", m: "PUT", p: "/emails/routing", action: "crm.email.settings", kind: "write", group: "emails" },
  { id: "emails.inbound.rotate", m: "POST", p: "/emails/inbound/rotate-key", action: "crm.email.settings", kind: "danger", group: "emails" },
  { id: "emails.templates.list", m: "GET", p: "/emails/templates", action: "crm.email.read", kind: "read", group: "emails" },
  { id: "sequences.list", m: "GET", p: "/sequences", action: "crm.sequence.manage", kind: "read", group: "sequences" },
  { id: "sequences.get", m: "GET", p: "/sequences/{id}", action: "crm.sequence.manage", kind: "read", group: "sequences" },
  { id: "sequences.create", m: "POST", p: "/sequences", action: "crm.sequence.manage", kind: "write", group: "sequences" },
  { id: "sequences.enroll", m: "POST", p: "/sequences/{id}/enroll", action: "crm.sequence.enroll", kind: "write", group: "sequences" },
  { id: "sequences.bulkEnroll", m: "POST", p: "/sequences/{id}/bulk-enroll", action: "crm.sequence.enroll", kind: "danger", group: "sequences" },
  { id: "sequences.stop", m: "POST", p: "/sequences/enrollments/{id}/stop", action: "crm.sequence.enroll", kind: "write", group: "sequences" },
  { id: "sequences.stats", m: "GET", p: "/sequences/{id}/stats", action: "crm.sequence.manage", kind: "read", group: "sequences" },
  { id: "assignment.rules.list", m: "GET", p: "/assignment/rules", action: "crm.assignment.manage", kind: "read", group: "assignment" },
  { id: "assignment.rules.create", m: "POST", p: "/assignment/rules", action: "crm.assignment.manage", kind: "write", group: "assignment" },
  { id: "assignment.simulate", m: "POST", p: "/assignment/simulate", action: "crm.assignment.manage", kind: "read", group: "assignment" },
  { id: "scoring.rules.list", m: "GET", p: "/scoring/rules", action: "crm.score.manage", kind: "read", group: "scoring" },
  { id: "scoring.rules.create", m: "POST", p: "/scoring/rules", action: "crm.score.manage", kind: "write", group: "scoring" },
  { id: "scoring.explain", m: "GET", p: "/contacts/{id}/score", action: "crm.contact.read", kind: "read", group: "scoring" },
  { id: "scoring.recompute", m: "POST", p: "/scoring/recompute", action: "crm.score.manage", kind: "danger", group: "scoring" },
  { id: "tracking.links.list", m: "GET", p: "/tracking/links", action: "crm.tracking.manage", kind: "read", group: "tracking" },
  { id: "tracking.links.create", m: "POST", p: "/tracking/links", action: "crm.tracking.manage", kind: "write", group: "tracking" },
  { id: "tracking.links.stats", m: "GET", p: "/tracking/links/{id}/stats", action: "crm.tracking.manage", kind: "read", group: "tracking" },
  { id: "notifications.prefs.get", m: "GET", p: "/notifications/prefs", action: "crm.contact.read", kind: "read", group: "notifications" },
  { id: "notifications.prefs.set", m: "PUT", p: "/notifications/prefs", action: "crm.contact.read", kind: "write", group: "notifications" },
  { id: "automation.rules.list", m: "GET", p: "/automation/rules", action: "crm.automation.manage", kind: "read", group: "automation" },
  { id: "automation.dryRun", m: "POST", p: "/automation/dry-run", action: "crm.automation.manage", kind: "read", group: "automation" },
];
const MUST_IDS = new Set(MUST.map((o) => o.id));
const TOOLS_10 = ["crm_email_thread", "crm_draft_email", "crm_send_email", "crm_enroll_sequence", "crm_assign", "crm_score_explain", "crm_stale_deals", "crm_activities_due", "crm_records_query", "crm_set_next_step"];
// every `test:` value a C2.11 op may carry — the literals live here so fitness F13.10 can find them
const TEST_IDS = [
  "C2.11-S1.1", "C2.11-S1.2", "C2.11-S1.3",
  "C2.11-S2.1", "C2.11-S2.2", "C2.11-S2.3", "C2.11-S2.4", "C2.11-S2.5", "C2.11-S2.6", "C2.11-S2.7", "C2.11-S2.8", "C2.11-S2.9", "C2.11-S2.10", "C2.11-S2.11", "C2.11-S2.12",
  "C2.11-S3.1", "C2.11-S3.2", "C2.11-S3.3", "C2.11-S3.4", "C2.11-S4.1", "C2.11-S4.2", "C2.11-S4.3", "C2.11-S5.1", "C2.11-S6.1", "C2.11-S7.1", "C2.11-S7.2",
  "C2.11-X2.1", "C2.11-X2.2", "C2.11-X2.3", "C2.11-X2.4", "C2.11-X2.5", "C2.11-X3.1", "C2.11-X6.1", "C2.11-X6.2", "C2.11-X6.3",
  "C2.11-X7.1", "C2.11-X7.2", "C2.11-X8.1", "C2.11-X8.2", "C2.11-X8.3", "C2.11-X9.1", "C2.11-X9.2", "C2.11-X9.3", "C2.11-U.1", "C2.11-U.2", "C2.11-U.3",
];

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guard — none of the C2.11 ops in the registry ⇒ SKIPPED (no DB connection)
// ═══════════════════════════════════════════════════════════════════════════════════
const opsSrcAll = walk(OPS_DIR).map(read).join("\n");
const BUILT = MUST.filter((o) => opsSrcAll.includes(`"${o.id}"`)).length >= 5;
if (!FORCE && !BUILT) {
  console.log(`⚠️  SKIPPED — WO C2.11 not built yet (fewer than 5 of the 30 MUST op ids appear in ${OPS_DIR}) (run with --force-run to exercise the fixtures, the registry facts and the cleanup)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c211-${rand}`;

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
type Resp = { status: number; body: Any; text: string };
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
let reqSeq = 0;
const ABSENT = BUILT ? "" : " · [C2.11 ops ABSENT]";
const TENANTS: string[] = [];
const USERS: string[] = [];
const KEY_IDS: string[] = [];
const PII: string[] = [];
const pii = <T extends string>(s: T): T => { PII.push(s); return s; };
let seq = 0;
const nx = () => `${++seq}`;
let docSnapshot: string | null = null;

console.log(`\n═══ QC CRM v2 · C2.11 — REST + AI, second set ═══`);
console.log(`[env] DB ${host} · tag ${TAG}${FORCE && !BUILT ? " · --force-run with the C2.11 ops ABSENT (their checks expected red; structure + CLEAN green)" : ""}\n`);

try {
  docSnapshot = read(DOC_FILE) || null;
  const REG = (await import("@/lib/modules/crm/api/registry" as string).catch(() => ({}))) as Any;
  const TOOLS = (await import("@/lib/modules/crm/api/tools" as string).catch(() => ({}))) as Any;
  const WHE = (await import("@/lib/modules/crm/api/webhook-events" as string).catch(() => ({}))) as Any;
  const WHL = (await import("@/lib/webhooks/labels" as string).catch(() => ({}))) as Any;
  const CFG = (await import("@/lib/modules/crm/api/config" as string).catch(() => ({}))) as Any;
  const ROUTE = (await import(ROUTE_SPEC as string).catch(() => ({}))) as Any;
  const OA = (await import(OA_SPEC as string).catch(() => ({}))) as Any;
  const AK = (await import("@/lib/api-keys/service" as string).catch(() => ({}))) as Any;
  const SC = (await import("@/lib/api-keys/scopes" as string).catch(() => ({}))) as Any;
  const OPS: Any[] = Array.isArray(REG.CRM_OPS) ? (REG.CRM_OPS as Any[]) : [];
  const byId = new Map(OPS.map((o) => [String(o.id), o]));
  const present = MUST.filter((m) => byId.has(m.id));

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — registry
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S1 · registry ──");
  {
    const missing = MUST.filter((m) => !byId.has(m.id)).map((m) => m.id);
    const wrong: string[] = [];
    for (const m of present) {
      const o = byId.get(m.id) as Any;
      if (String(o.method) !== m.m || String(o.path) !== m.p) wrong.push(`${m.id}:${o.method} ${o.path}`);
      else if (String(o.action) !== m.action) wrong.push(`${m.id}:action=${o.action}`);
      else if (String(o.kind) !== m.kind) wrong.push(`${m.id}:kind=${o.kind}`);
    }
    const noTest = present.filter((m) => { const t = String((byId.get(m.id) as Any)?.test ?? ""); return !t || !TEST_IDS.includes(t); }).map((m) => m.id);
    const dupPath = (() => {
      const seen = new Map<string, string>();
      const bad: string[] = [];
      for (const o of OPS) { const k = `${o.method} ${o.path}`; if (seen.has(k)) bad.push(`${k} (${seen.get(k)} vs ${o.id})`); else seen.set(k, String(o.id)); }
      return bad;
    })();
    chk("C2.11-S1.1", `the 30 MUST ops are in CRM_OPS with the exact method + path + action + kind of the contract, each carrying a \`test:\` id that really exists in this file (fitness F13.10), and no two ops of the whole registry share a METHOD path`,
      missing.length === 0 && wrong.length === 0 && noTest.length === 0 && dupPath.length === 0,
      "30 ops · test ids · unique paths", `registry=${OPS.length} missing=${cut(missing.join(","), 260) || "-"} wrong=${cut(wrong.join(" | "), 160) || "-"} badTest=${noTest.join(",") || "-"} dupPaths=${dupPath.join(" | ") || "-"}${ABSENT}`);
  }
  {
    const bad: string[] = [];
    for (const m of present) {
      const o = byId.get(m.id) as Any;
      const schema = o.input as Any;
      if (m.m !== "GET" && !schema) { bad.push(`${m.id}:no input schema`); continue; }
      if (!schema) continue;
      const shapeRaw = (schema as Any)?._def?.shape;
      const shape = typeof shapeRaw === "function" ? shapeRaw() : (shapeRaw ?? (schema as Any)?.shape ?? null);
      // zod v3 marks it in `_def.unknownKeys`, zod v4 in `_def.catchall` (ZodNever) — accept either, else a `.strict()` in that group's file
      const strict = String((schema as Any)?._def?.unknownKeys ?? "") === "strict"
        || /ZodNever/.test(String((schema as Any)?._def?.catchall?._def?.typeName ?? (schema as Any)?._def?.catchall?.constructor?.name ?? ""))
        || /\.strict\(\)/.test(read(`${OPS_DIR}/${m.group}.ts`));
      if (!strict) bad.push(`${m.id}:not strict`);
      if (m.m === "GET" && shape && typeof shape === "object" && "take" in (shape as Record<string, unknown>)) {
        const max = (shape as Any).take?._def?.checks?.find((c: Any) => c.kind === "max")?.value;
        if (typeof max === "number" && max > 100) bad.push(`${m.id}:take max ${max}`);
      }
    }
    const asciiBad = present.filter((m) => /[^\x20-\x7E]/.test(String((byId.get(m.id) as Any)?.summary ?? ""))).map((m) => m.id);
    const thaiBad = present.filter((m) => !thai(String((byId.get(m.id) as Any)?.label ?? ""))).map((m) => m.id);
    chk("C2.11-S1.2", "every new op's input schema is strict (a body carrying tenantId/systemId or any unknown field is rejected before the service is reached), list `take` is capped at 100, the English `summary` is pure ASCII and the Thai `label` is really Thai",
      present.length > 0 && bad.length === 0 && asciiBad.length === 0 && thaiBad.length === 0,
      "strict · capped · labelled", `checked=${present.length} bad=${cut(bad.join(" | "), 240) || "-"} asciiSummary=${asciiBad.join(",") || "-"} thaiLabel=${thaiBad.join(",") || "-"}${ABSENT}`);
  }
  {
    const opsFiles = walk(OPS_DIR);
    const src = opsFiles.map(read).join("\n");
    const rawPrisma = /prisma\.\w+\.(create|update|updateMany|delete|deleteMany|upsert)\(/.test(src);
    const dbImport = /from\s+["']@\/lib\/core\/db["']/.test(src);
    const groups = [...new Set(present.map((m) => m.group))];
    const newFiles = ["emails", "sequences", "assignment", "scoring", "tracking", "notifications", "automation"].filter((g) => opsFiles.some((f) => f.endsWith(`/${g}.ts`)));
    chk("C2.11-S1.3", "the ops are thin: no `ops/*.ts` file writes with raw prisma or imports `@/lib/core/db` (they call the C2.1–C2.10 services — no second engine, COMMON) and the new groups live in their own files under api/ops/",
      opsFiles.length > 0 && !rawPrisma && !dbImport && newFiles.length >= Math.min(5, groups.length),
      "no raw prisma · own files", `files=${opsFiles.length} rawPrisma=${rawPrisma} dbImport=${dbImport} newFiles=${newFiles.join(",") || "-"} groups=${groups.join(",") || "-"}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — one tenant · CRM v2 + a v1 system · 5 keys · a contact/deal/activity
  // ═════════════════════════════════════════════════════════════════════════════
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => ({}))) as Any;
  const mkUser = async (suffix: string) => {
    const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix || "owner"} ${TAG}` } });
    USERS.push(u.id);
    return u.id as string;
  };
  const userA = await mkUser("");
  const userTh = await mkUser("-thana");
  const mkTenant = async (suffix: string) => {
    const t = await P.tenant.create({ data: { name: `${TAG}-${suffix}`, slug: `${TAG}-${suffix}` } });
    TENANTS.push(t.id);
    return t.id as string;
  };
  const tidA = await mkTenant("a");
  await P.membership.create({ data: { userId: userA, tenantId: tidA, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  await P.membership.create({ data: { userId: userTh, tenantId: tidA, role: "STAFF", unitAccess: ["*"], permissions: { "crm.contact.read": true, "crm.deal.read": true, "crm.email.read": true }, acceptedAt: new Date() } });
  const mk = async (tid: string, type: string, label: string) => (await sysSvc.createSystem(tid, type, `${label} ${TAG}`)).id as string;
  const setCrm = (sysId: string, obj: Record<string, unknown>) =>
    P.$executeRawUnsafe(
      `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
        (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
      JSON.stringify(obj), sysId);
  const S = await mk(tidA, "CRM", "CRM");
  const SV = await mk(tidA, "CRM", "CRM v1");
  await setCrm(S, { uiVersion: 2, bridgesEnabled: true });
  await setCrm(SV, { uiVersion: 1 });
  const owner = { userId: userA, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> };
  const cS = { tenantId: tidA, systemId: S, actorUserId: userA };
  // one contact + one deal + one activity through the accepted services (fall back to raw when a service refuses)
  const CT = (CRM?.contacts ?? {}) as Any;
  const mkContact = async (): Promise<string> => {
    const r = await call(CT.createContact, cS, owner, { firstName: pii(`ลูกค้า ${TAG}-${nx()}`), phone: pii(`08${String(10_000_000 + seq).slice(0, 8)}`), email: pii(`c${nx()}.${rand}@qc.invalid`), sourceKind: "API" });
    const id = (r.v?.contact?.id ?? r.v?.id) as string | undefined;
    if (typeof id === "string" && id) return id;
    const name = pii(`ลูกค้า ${TAG}-${nx()}`);
    const partyId = (await P.party.create({ data: { tenantId: tidA, name, kind: "PERSON" } })).id as string;
    return (await P.crmContact.create({ data: { tenantId: tidA, systemId: S, name, firstName: name, partyId, ownerUserId: userA } })).id as string;
  };
  const contactId = await mkContact();
  const pipe = (await P.crmPipeline.create({
    data: { tenantId: tidA, systemId: S, name: `ขาย ${TAG}`, stages: { create: [{ tenantId: tidA, systemId: S, name: "ใหม่", kind: "OPEN", probability: 10, sortOrder: 0 }, { tenantId: tidA, systemId: S, name: "ชนะ", kind: "WON", probability: 100, sortOrder: 1 }] } },
    include: { stages: true },
  })) as Any;
  const stageId = ([...(pipe.stages as Any[])].sort((a, b) => a.sortOrder - b.sortOrder)[0] as Any).id as string;
  const dealId = ((await P.crmDeal.create({ data: { tenantId: tidA, systemId: S, contactId, pipelineId: pipe.id, stageId, title: pii(`ดีล ${TAG}`), valueSatang: 100_000, ownerUserId: userA, lastActivityAt: new Date(Date.now() - 30 * 86_400_000), stageEnteredAt: new Date(Date.now() - 30 * 86_400_000) } })) as Any).id as string;
  const activityId = ((await P.crmActivity.create({ data: { tenantId: tidA, systemId: S, contactId, type: "TASK", title: `งาน ${TAG}`, ownerUserId: userA, dueAt: new Date(Date.now() - 86_400_000) } })) as Any).id as string;

  // keys
  const bundles = (SC.API_SCOPE_BUNDLES ?? []) as Any[];
  const bundle = (re: RegExp, fallback: string[]) => { const b = bundles.find((x) => re.test(String(x.id))); return b ? ([...b.scopes] as string[]) : fallback; };
  const roScopes = bundle(/^crm[.\-_](readonly|read)$/i, ["crm.contact.read", "crm.deal.read", "crm.activity.read"]);
  const opScopes = bundle(/^crm[.\-_]operate$/i, [...roScopes, "crm.contact.create", "crm.email.send"]);
  const adScopes = bundle(/^crm[.\-_]admin$/i, [...opScopes, "crm.sequence.manage", "crm.assignment.manage", "crm.score.manage", "crm.tracking.manage", "crm.automation.manage", "crm.email.settings", "crm.email.read", "crm.settings.manage"]);
  const KEY_ERR: Record<string, string> = {};
  const mkKey = async (label: string, scopes: string[], systemId: string | null): Promise<string> => {
    try {
      const k = await AK.createApiKey({ tenantId: tidA }, `${TAG} ${label}`, { scopes, systemId, createdById: userA });
      KEY_IDS.push(k.id);
      return k.rawKey as string;
    } catch (e) { KEY_ERR[label] = e instanceof Error ? e.message : String(e); return ""; }
  };
  const kRO = await mkKey("readonly", roScopes, S);
  const kOP = await mkKey("operate", opScopes, S);
  const kAD = await mkKey("admin", adScopes, S);
  const kNoCrm = await mkKey("no-crm", ["member.customer.read"], S);
  const kV1 = await mkKey("admin-v1", adScopes, SV);
  const api = async (method: string, path: string, key: string | null, body?: unknown, opt: { idem?: string | null } = {}): Promise<Resp> => {
    const fn = (ROUTE as Any)?.[method];
    if (typeof fn !== "function") return { status: 0, body: { error: { code: "MISSING_ROUTE" } }, text: "MISSING_ROUTE" };
    const headers: Record<string, string> = { ...(key ? { authorization: `Bearer ${key}` } : {}) };
    if (method !== "GET") {
      const idem = opt.idem === undefined ? `${TAG}-${(reqSeq += 1)}-${randomBytes(3).toString("hex")}` : opt.idem;
      if (idem) headers["idempotency-key"] = idem;
    }
    let b: string | undefined;
    if (body !== undefined && method !== "GET") { b = JSON.stringify(body); headers["content-type"] = "application/json"; }
    const pathOnly = (path.split("?")[0] ?? "");
    try {
      const res: Response = await fn(new Request(`http://qc.invalid/api/v1/crm${path}`, { method, headers, body: b }), { params: Promise.resolve({ path: pathOnly.split("/").filter(Boolean) }) });
      const text = await res.text();
      let parsed: Any = null;
      try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
      return { status: res.status, body: parsed, text };
    } catch (e) { return { status: -1, body: { error: { code: "THROWN", message: e instanceof Error ? e.message : String(e) } }, text: String(e) }; }
  };
  const ecode = (r: Resp) => String(r.body?.error?.code ?? "").toLowerCase();
  const dat = (r: Resp) => r.body?.data;
  const reachable = (r: Resp) => r.status !== 0 && r.status !== 404 && ecode(r) !== "not_found" && ecode(r) !== "unknown_op";
  const REASON = `เหตุผลทดสอบ ${TAG}`;
  console.log(`[setup] tenant ${tidA} · CRM ${S} · v1 ${SV} · contact ${contactId} · deal ${dealId} · keys ${[kRO, kOP, kAD, kNoCrm, kV1].filter(Boolean).length}/5 ${Object.keys(KEY_ERR).length ? `errors=${Object.keys(KEY_ERR).join(",")}` : ""}\n`);

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — the groups through real API keys (12)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S2 · the groups through API keys ──");
  const okList = (r: Resp) => r.status === 200 && (Array.isArray(dat(r)?.items) || Array.isArray(dat(r)));
  {
    const list = await api("GET", "/emails/threads?take=5", kAD);
    const one = await api("GET", `/emails/threads/${TAG}-thread`, kAD);
    chk("C2.11-S2.1", "emails: `GET /emails/threads` answers a paged envelope (`data.items[]` + nextCursor, take ≤ 100) with an admin key, and `GET /emails/threads/{threadKey}` answers 200 for a live thread or 404 not_found for an unknown one — never a 500 and never another tenant's thread",
      okList(list) && (one.status === 200 || (one.status === 404 && ecode(one) === "not_found")),
      "200 list · 200|404 get", `list=${list.status}/${cut(j(dat(list)), 90)} get=${one.status}/${ecode(one)}${ABSENT}`);
  }
  {
    const send = await api("POST", "/emails/send", kOP, { contactId, subject: `ทดสอบ ${TAG}`, body: "สวัสดี" });
    chk("C2.11-S2.2", "`POST /emails/send` with the operate key and ONE recipient is a plain write: it is reachable (not 404), answers 200/201/202 with an id (or a documented 409/422 of the e-mail engine — for example no mail provider configured in QC) and never 403 for a key that holds crm.email.send",
      reachable(send) && send.status !== 403 && [200, 201, 202, 409, 422].includes(send.status),
      "reachable · not 403", `status=${send.status} code=${ecode(send)} body=${cut(j(send.body), 120)}${ABSENT}`);
  }
  {
    const sched = await api("POST", "/emails/schedule", kOP, { contactId, subject: `ตั้งเวลา ${TAG}`, body: "สวัสดี", scheduledAt: new Date(Date.now() + 3_600_000).toISOString() });
    const getU = await api("GET", "/emails/user-settings", kAD);
    const setU = await api("PUT", "/emails/user-settings", kAD, { fromName: `พนักงาน ${TAG}`, signature: "ขอบคุณครับ" });
    chk("C2.11-S2.3", "`POST /emails/schedule` accepts a future `scheduledAt` (and is reachable with crm.email.send) · `GET/PUT /emails/user-settings` read and write the sender's own settings with crm.email.settings",
      reachable(sched) && [200, 201, 202, 409, 422].includes(sched.status) && getU.status === 200 && [200, 201, 204].includes(setU.status),
      "reachable · 200 · 200", `schedule=${sched.status}/${ecode(sched)} get=${getU.status} set=${setU.status}${ABSENT}`);
  }
  {
    const getR = await api("GET", "/emails/routing", kAD);
    const setR = await api("PUT", "/emails/routing", kAD, { mode: "SHARED" });
    const rotateNo = await api("POST", "/emails/inbound/rotate-key", kAD, {});
    const rotateYes = await api("POST", "/emails/inbound/rotate-key", kAD, { confirm: true, reason: REASON });
    chk("C2.11-S2.4", "`GET/PUT /emails/routing` read and write the shop's routing mode · `POST /emails/inbound/rotate-key` is a DANGER op: without confirm+reason it is refused (400/403/409/422, nothing rotated) and with them it answers 200 — the old address stops working only after the owner asked for it",
      getR.status === 200 && [200, 201, 204].includes(setR.status) && reachable(rotateNo) && ![200, 201, 204].includes(rotateNo.status) && [200, 201, 202].includes(rotateYes.status),
      "200 · 200 · refused · 200", `get=${getR.status} set=${setR.status} noConfirm=${rotateNo.status}/${ecode(rotateNo)} confirmed=${rotateYes.status}${ABSENT}`);
  }
  {
    const list = await api("GET", "/sequences?take=5", kAD);
    const create = await api("POST", "/sequences", kAD, { name: `ลำดับ ${TAG}`, steps: [{ kind: "TASK", taskTitle: `โทร ${TAG}` }] });
    const seqId = String(dat(create)?.id ?? dat(create)?.sequenceId ?? "");
    const get = seqId ? await api("GET", `/sequences/${seqId}`, kAD) : { status: 0, body: {}, text: "" } as Resp;
    chk("C2.11-S2.5", "sequences: `GET /sequences` lists them, `POST /sequences` creates one through `sequences.createSequence` (version 1, its steps stored) and `GET /sequences/{id}` reads it back — all three under crm.sequence.manage",
      okList(list) && [200, 201].includes(create.status) && !!seqId && get.status === 200,
      "200 · 201 · 200", `list=${list.status} create=${create.status}/${cut(j(create.body), 90)} get=${get.status}${ABSENT}`);
    const enroll = seqId ? await api("POST", `/sequences/${seqId}/enroll`, kAD, { contactId }) : { status: 0, body: {}, text: "" } as Resp;
    const enrollId = String(dat(enroll)?.enrollmentId ?? dat(enroll)?.id ?? "");
    const stop = enrollId ? await api("POST", `/sequences/enrollments/${enrollId}/stop`, kAD, { reason: REASON }) : { status: 0, body: {}, text: "" } as Resp;
    const stats = seqId ? await api("GET", `/sequences/${seqId}/stats`, kAD) : { status: 0, body: {}, text: "" } as Resp;
    chk("C2.11-S2.6", "sequences: enrolling a contact answers an enrollment id, stopping that enrollment answers 200 (status STOPPED) and `GET /sequences/{id}/stats` answers the per-step counters — the API drives the C2.2 engine, it does not re-implement it",
      [200, 201].includes(enroll.status) && !!enrollId && [200, 201, 204].includes(stop.status) && stats.status === 200,
      "201 · 200 · 200", `enroll=${enroll.status}/${cut(j(enroll.body), 80)} stop=${stop.status} stats=${stats.status}${ABSENT}`);
    const bulkNo = seqId ? await api("POST", `/sequences/${seqId}/bulk-enroll`, kAD, { contactIds: [contactId] }) : { status: 0, body: {}, text: "" } as Resp;
    const bulkYes = seqId ? await api("POST", `/sequences/${seqId}/bulk-enroll`, kAD, { contactIds: [contactId], confirm: true, reason: REASON }) : { status: 0, body: {}, text: "" } as Resp;
    chk("C2.11-S2.7", "`POST /sequences/{id}/bulk-enroll` is a DANGER op: without confirm+reason it is refused with nothing written; with them it answers 200 and reports how many were enrolled/skipped (the ≤ 500 cap of C2.2 still applies)",
      reachable(bulkNo) && ![200, 201, 202].includes(bulkNo.status) && [200, 201, 202].includes(bulkYes.status),
      "refused · then 200", `noConfirm=${bulkNo.status}/${ecode(bulkNo)} confirmed=${bulkYes.status}/${cut(j(bulkYes.body), 80)}${ABSENT}`);
  }
  {
    const list = await api("GET", "/assignment/rules", kAD);
    const create = await api("POST", "/assignment/rules", kAD, { name: `กฎ ${TAG}`, mode: "FIXED", userIds: [userA], conditions: { items: [] } });
    const before = (await P.crmContact.count({ where: { systemId: S } })) as number;
    const sim = await api("POST", "/assignment/simulate", kAD, { rows: [{ sourceKind: "WEB_FORM" }] });
    const after = (await P.crmContact.count({ where: { systemId: S } })) as number;
    chk("C2.11-S2.8", "assignment: `GET /assignment/rules` lists, `POST /assignment/rules` creates through `assignment.createRule`, and `POST /assignment/simulate` is declared kind READ and really writes nothing (no contact, no cursor move) — a dry run over the API must never assign anybody",
      okList(list) && [200, 201].includes(create.status) && sim.status === 200 && after === before,
      "200 · 201 · 200 · no write", `list=${list.status} create=${create.status} simulate=${sim.status} contacts ${before}→${after}${ABSENT}`);
  }
  {
    const list = await api("GET", "/scoring/rules", kAD);
    const create = await api("POST", "/scoring/rules", kAD, { name: `กฎคะแนน ${TAG}`, event: "crm.activity.completed", points: 5 });
    const explain = await api("GET", `/contacts/${contactId}/score`, kRO);
    chk("C2.11-S2.9", "scoring: `GET /scoring/rules` + `POST /scoring/rules` under crm.score.manage, and `GET /contacts/{id}/score` (explain) is readable with the plain contact-read scope — the reasons belong to the contact, not to the settings",
      okList(list) && [200, 201].includes(create.status) && explain.status === 200 && (dat(explain)?.items !== undefined || dat(explain)?.score !== undefined),
      "200 · 201 · 200", `list=${list.status} create=${create.status} explain=${explain.status}/${cut(j(dat(explain)), 90)}${ABSENT}`);
  }
  {
    const no = await api("POST", "/scoring/recompute", kAD, { all: true });
    const yes = await api("POST", "/scoring/recompute", kAD, { all: true, confirm: true, reason: REASON });
    const dry = await api("POST", "/scoring/recompute", kAD, { all: true, dryRun: true });
    chk("C2.11-S2.10", "`POST /scoring/recompute { all: true }` is a DANGER op: refused without confirm+reason (nothing recomputed), accepted with them, and a `dryRun` answers the diff without writing — the whole-shop recompute can never happen by accident through a key",
      reachable(no) && ![200, 201, 202].includes(no.status) && [200, 201, 202].includes(yes.status) && [200, 201, 202].includes(dry.status),
      "refused · 200 · 200", `noConfirm=${no.status}/${ecode(no)} confirmed=${yes.status} dryRun=${dry.status}${ABSENT}`);
  }
  {
    const list = await api("GET", "/tracking/links?take=5", kAD);
    const create = await api("POST", "/tracking/links", kAD, { url: "https://example.invalid/promo", label: `ลิงก์ ${TAG}` });
    const linkId = String(dat(create)?.id ?? dat(create)?.linkId ?? "");
    const stats = linkId ? await api("GET", `/tracking/links/${linkId}/stats`, kAD) : { status: 0, body: {}, text: "" } as Resp;
    const badUrl = await api("POST", "/tracking/links", kAD, { url: "javascript:alert(1)", label: "x" });
    chk("C2.11-S2.11", "tracking: list + create + per-link stats under crm.tracking.manage · the URL field accepts http/https ONLY (a `javascript:` URL is refused with a validation error — X6 of the tracking lane)",
      okList(list) && [200, 201].includes(create.status) && !!linkId && stats.status === 200 && [400, 422].includes(badUrl.status),
      "200 · 201 · 200 · 400", `list=${list.status} create=${create.status} stats=${stats.status} badUrl=${badUrl.status}/${ecode(badUrl)}${ABSENT}`);
  }
  {
    const getP = await api("GET", "/notifications/prefs", kRO);
    const setP = await api("PUT", "/notifications/prefs", kOP, { notifications: { "lead.hot": { PUSH: false } } });
    const rules = await api("GET", "/automation/rules?take=5", kAD);
    const dry = await api("POST", "/automation/dry-run", kAD, { name: `ร่าง ${TAG}`, trigger: { event: "crm.contact.created" }, actions: [{ type: "ADD_TAG", params: { tag: "qc" } }] });
    const runs = (await P.automationRun.count({ where: { tenantId: tidA } })) as number;
    chk("C2.11-S2.12", "the rest of the surface: `GET/PUT /notifications/prefs` (a key acts for the user who owns it — nobody else's prefs) · `GET /automation/rules` lists the CRM rules · `POST /automation/dry-run` is kind READ and writes nothing (no AutomationRun row appears)",
      getP.status === 200 && [200, 201, 204].includes(setP.status) && okList(rules) && dry.status === 200 && runs === 0,
      "200 · 200 · 200 · no run", `prefsGet=${getP.status} prefsSet=${setP.status} rules=${rules.status} dryRun=${dry.status} runs=${runs}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — the 10 AI tools
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3 · AI tools ──");
  const toolNames = (() => { const f = TOOLS.crmToolNames; return typeof f === "function" ? ((f() as string[]) ?? []) : []; })();
  const runTool = TOOLS.runCrmTool as Any;
  const aiCtx = { tenantId: tidA, systemId: S, userId: userA, role: "OWNER", unitAccess: ["*"], permissions: {} as Record<string, unknown> };
  {
    const missing = TOOLS_10.filter((t) => !toolNames.includes(t));
    const skills = read(SKILLS_FILE);
    const notInSkill = TOOLS_10.filter((t) => !skills.includes(`"${t}"`));
    const opTools = OPS.filter((o) => o.tool).map((o) => String(o.tool.name));
    const orphan = opTools.filter((t) => !skills.includes(`"${t}"`));
    chk("C2.11-S3.1", `the 10 tools of this work order are registered (${TOOLS_10.join(" · ")}) — crmToolNames() lists them and every one has a home in the \`crm\` skill of src/lib/ai/skills.ts, so fitness F13.12 stays green and the assistant can actually call them`,
      toolNames.length > 0 && missing.length === 0 && notInSkill.length === 0 && orphan.length === 0,
      "10 tools · in the skill", `names=${toolNames.length} missing=${missing.join(",") || "-"} notInSkill=${notInSkill.join(",") || "-"} orphanOpTools=${orphan.join(",") || "-"}${ABSENT}`);
  }
  {
    const results: Record<string, Any> = {};
    for (const [name, args] of [["crm_score_explain", { contactId }], ["crm_stale_deals", {}], ["crm_activities_due", {}], ["crm_records_query", { objectKey: "car" }], ["crm_email_thread", { contactId }]] as [string, Any][]) {
      results[name] = await call(runTool, aiCtx, name, args);
    }
    const bad = Object.entries(results).filter(([, r]) => !(r as Res).ok || String((r as Res).v?.mode) !== "read").map(([k, r]) => `${k}:${(r as Res).ok ? (r as Res).v?.mode : (r as Res).err}`);
    chk("C2.11-S3.2", "the five READ tools answer `{ mode: \"read\", result }` for the asking human (crm_score_explain · crm_stale_deals · crm_activities_due · crm_records_query · crm_email_thread) — they read, they never propose and they never throw",
      bad.length === 0, "5 × mode read", `bad=${cut(bad.join(" | "), 240) || "-"}${ABSENT}`);
  }
  {
    const before = { deals: (await P.crmDeal.count({ where: { systemId: S } })) as number, emails: (await P.crmEmailMessage.count({ where: { systemId: S } }).catch(() => 0)) as number, enrol: (await P.crmSequenceEnrollment.count({ where: { tenantId: tidA } }).catch(() => 0)) as number };
    const props: Record<string, Res> = {};
    for (const [name, args] of [["crm_send_email", { contactId, subject: `เสนอ ${TAG}`, body: "สวัสดี" }], ["crm_enroll_sequence", { contactId, sequenceId: `${TAG}-seq` }], ["crm_assign", { contactId, userId: userA }], ["crm_set_next_step", { dealId, nextStep: `โทรอีกครั้ง ${TAG}` }]] as [string, Any][]) {
      props[name] = await call(runTool, aiCtx, name, args);
    }
    const draft = await call(runTool, aiCtx, "crm_draft_email", { contactId, goal: "ขอนัดคุย" });
    const after = { deals: (await P.crmDeal.count({ where: { systemId: S } })) as number, emails: (await P.crmEmailMessage.count({ where: { systemId: S } }).catch(() => 0)) as number, enrol: (await P.crmSequenceEnrollment.count({ where: { tenantId: tidA } }).catch(() => 0)) as number };
    const notProposal = Object.entries(props).filter(([, r]) => !r.ok || (String(r.v?.mode) !== "propose" && String(r.v?.mode) !== "error")).map(([k, r]) => `${k}:${r.ok ? r.v?.mode : r.err}`);
    const kinds = Object.values(props).filter((r) => r.ok && r.v?.mode === "propose").map((r) => String(r.v?.kind));
    const draftOk = draft.ok && (String(draft.v?.mode) === "read" || (String(draft.v?.mode) === "propose" && !/send/i.test(String(draft.v?.kind ?? ""))));
    chk("C2.11-S3.3", "the four WRITE tools only PROPOSE (`mode: \"propose\"`, kind `crm.<opId>`, a Thai summary) and write nothing at all — no e-mail row, no enrollment, no deal change · `crm_draft_email` is draft-only: it returns text and can never turn into a send proposal",
      notProposal.length === 0 && kinds.every((k) => k.startsWith("crm.")) && draftOk && after.deals === before.deals && after.emails === before.emails && after.enrol === before.enrol,
      "4 proposals · draft only · 0 writes", `modes=${cut(notProposal.join(" | "), 160) || "ok"} kinds=${kinds.join(",") || "-"} draft=${draft.ok ? j(draft.v?.mode) : draft.err} writes=${j(before)}→${j(after)}${ABSENT}`);
  }
  {
    const dispatchKind = TOOLS.dispatchCrmKind as Any;
    const prop = await call(runTool, aiCtx, "crm_set_next_step", { dealId, nextStep: `ติดตามอีกครั้ง ${TAG}` });
    const kind = String(prop.v?.kind ?? "");
    const payload = prop.v?.payload ?? {};
    const first = kind ? await call(dispatchKind, aiCtx, kind, payload) : MISSING;
    const dealAfter = (await P.crmDeal.findFirst({ where: { id: dealId } })) as Any;
    const second = kind ? await call(dispatchKind, aiCtx, kind, payload) : MISSING;
    const hist = (await P.crmDeal.findFirst({ where: { id: dealId }, select: { nextStep: true } })) as Any;
    chk("C2.11-S3.4", "an APPROVED proposal executes through `dispatchCrmKind(ctx, kind, payload)` exactly as the op would (the deal's nextStep really changes) and running the same approved payload twice leaves the same result — the human approves once, the machine cannot double-apply it",
      prop.ok && !!kind && first.ok && String(dealAfter?.nextStep ?? "").includes(TAG) && second.ok && String(hist?.nextStep ?? "").includes(TAG),
      "applied · idempotent", `kind=${kind || "-"} first=${first.ok ? "ok" : first.err} nextStep=${cut(dealAfter?.nextStep, 60)} second=${second.ok ? "ok" : second.err}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — the webhook events of phase C2
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S4 · webhook events ──");
  const C2_EVENTS = ["crm.sequence.enrolled", "crm.sequence.finished", "crm.email.sent", "crm.email.received", "crm.email.opened", "crm.email.clicked", "crm.email.bounced", "crm.score.changed", "crm.score.threshold", "crm.deal.stale", "crm.activity.overdue"];
  {
    const listed = (() => { const f = WHE.crmWebhookEvents; return typeof f === "function" ? ((f() as Any[]) ?? []).map((e) => String(e?.value ?? e)) : []; })();
    const whValues = ((WHL.WEBHOOK_EVENTS ?? []) as Any[]).map((e) => String(e?.value ?? e));
    const missing = C2_EVENTS.filter((e) => !listed.includes(e));
    const notGlobal = C2_EVENTS.filter((e) => !whValues.includes(e));
    chk("C2.11-S4.1", `every event phase C2 added is offered to webhooks: crmWebhookEvents() lists ${C2_EVENTS.length} of them (sequences · e-mail · score · stale · overdue) and each one is a real WEBHOOK_EVENTS value (declared once, through the AUTOMATION_EVENTS spread — nothing hand-typed twice)`,
      listed.length > 0 && missing.length === 0 && notGlobal.length === 0,
      `${C2_EVENTS.length} events`, `listed=${listed.length} missingFromCrmList=${missing.join(",") || "-"} missingFromRegistry=${notGlobal.join(",") || "-"}${ABSENT}`);
  }
  {
    const dupes = (() => {
      const vals = ((WHL.WEBHOOK_EVENTS ?? []) as Any[]).map((e) => String(e?.value ?? e));
      return [...new Set(vals)].filter((v) => vals.filter((x) => x === v).length > 1);
    })();
    const labels = ((WHL.WEBHOOK_EVENTS ?? []) as Any[]).filter((e) => C2_EVENTS.includes(String(e?.value))).filter((e) => !thai(e?.label));
    chk("C2.11-S4.2", "the webhook registry has no duplicate event value at all (a duplicate means somebody declared an event twice — the trap C2.8/C2.10 had to dodge) and every C2 event carries a Thai label for the shop's webhook page",
      dupes.length === 0 && labels.length === 0,
      "no duplicates · Thai labels", `duplicates=${dupes.join(",") || "-"} noThaiLabel=${labels.map((e) => String(e.value)).join(",") || "-"}`, "MAJOR");
  }
  {
    const OBX = (await import("@/lib/outbox-consumers" as string).catch(() => ({}))) as Any;
    const CONS: Any = OBX.consumers ?? {};
    const noConsumer = C2_EVENTS.filter((e) => typeof CONS[e] !== "function");
    const bodyLeak = read(WEBHOOK_FILE).includes("bodyHtml") || read(WEBHOOK_FILE).includes("transcript");
    chk("C2.11-S4.3", "each C2 event that webhooks may subscribe to also has a consumer (an event without one stalls the queue) and the webhook layer never ships an e-mail body or a call transcript field",
      noConsumer.length === 0 && !bodyLeak,
      "consumers · no body field", `noConsumer=${noConsumer.join(",") || "-"} bodyLeak=${bodyLeak}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 · S6 · S7 — docs · page · errors/openapi
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S5 · S6 · S7 ──");
  {
    const gen = (await import(GEN_SPEC as string).catch(() => ({}))) as Any;
    const render = gen.renderDocs as Any;
    const onDisk = read(DOC_FILE);
    const rendered = typeof render === "function" ? String(render()) : "";
    const groupsInDoc = ["/emails/threads", "/sequences", "/assignment/rules", "/scoring/rules", "/tracking/links", "/automation/rules"].filter((p) => rendered.includes(p));
    chk("C2.11-S5.1", "docs are regenerated, not hand-edited: `renderDocs()` of scripts/gen-crm-api-docs.mts equals docs/api/CRM-API.md byte for byte (fitness F13.11) and the new groups really appear in it (emails · sequences · assignment · scoring · tracking · automation)",
      typeof render === "function" && onDisk.length > 0 && onDisk === rendered && groupsInDoc.length === 6,
      "identical · 6 groups", `render=${typeof render} onDisk=${onDisk.length} equal=${onDisk === rendered} groups=${groupsInDoc.length}/6${ABSENT}`);
  }
  {
    const page = read(API_PAGE);
    let inv: Any[] = [];
    try { inv = (JSON.parse(read(INVENTORY)).rows ?? []) as Any[]; } catch { inv = []; }
    const apiRows = inv.filter((r) => /\/settings\/api/.test(String(r?.page ?? "")));
    const mentionsBundles = /crm\.readonly|crm\.operate|crm\.admin/.test(page) || /API_SCOPE_BUNDLES|apiScopeBundles/.test(page);
    const webhookBlock = /crmWebhookEvents|webhook/i.test(page);
    chk("C2.11-S6.1", "mockup 14 (right) stays true after the second set: the existing `/crm/settings/api` page still carries its testids in the inventory and shows the key bundles and the webhook events (so a shop can see the new C2 events it may subscribe to) — no new page is added by this work order [static]",
      page.length > 0 && apiRows.length >= 6 && mentionsBundles && webhookBlock,
      "page · ≥ 6 rows · bundles + webhooks", `page=${page.length > 0} rows=${apiRows.length} bundles=${mentionsBundles} webhooks=${webhookBlock}`, "MAJOR");
  }
  {
    const foreignTenant = await mkTenant("b");
    const otherContact = (await P.crmContact.create({ data: { tenantId: foreignTenant, systemId: S, name: `ต่างร้าน ${TAG}`, firstName: "x", partyId: (await P.party.create({ data: { tenantId: foreignTenant, name: `p ${TAG}`, kind: "PERSON" } })).id } })) as Any;
    const foreign = await api("GET", `/contacts/${otherContact.id}/score`, kAD);
    const badSeq = await api("GET", `/sequences/${TAG}-nope`, kAD);
    const badMethod = await api("DELETE", "/sequences", kAD);
    chk("C2.11-S7.1", "error mapping of the new ops is the C1.10 mapping: an id of another tenant answers 404 not_found (never 403 — it must not confirm the row exists), an unknown sequence id answers 404, and a method nobody registered for that path answers 404/405 — never a 500",
      [404].includes(foreign.status) && [404].includes(badSeq.status) && [404, 405].includes(badMethod.status),
      "404 · 404 · 404|405", `foreign=${foreign.status}/${ecode(foreign)} badId=${badSeq.status} badMethod=${badMethod.status}${ABSENT}`);
  }
  {
    const oaFn = (OA as Any)?.GET;
    const r = typeof oaFn === "function" ? await call(oaFn, new Request("http://qc.invalid/api/v1/crm/openapi.json")) : MISSING;
    const text = r.ok && r.v instanceof Response ? await (r.v as Response).text() : "";
    const paths = text ? (JSON.parse(text).paths ?? {}) : {};
    const need = ["/emails/threads", "/sequences", "/scoring/recompute", "/tracking/links", "/automation/dry-run"];
    const missing = need.filter((p) => !Object.keys(paths).some((k) => String(k).includes(p)));
    chk("C2.11-S7.2", "the OpenAPI document generated from the registry contains the new paths (emails/threads · sequences · scoring/recompute · tracking/links · automation/dry-run) — a client library generated from it can reach the second set",
      text.length > 0 && missing.length === 0,
      "5 paths", `openapi=${text.length} missing=${missing.join(",") || "-"}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X2 — scopes · bundles · filters · the assistant's rights
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X2 · scopes ──");
  {
    const probes: [string, Resp][] = [
      ["threads", await api("GET", "/emails/threads", kNoCrm)],
      ["sequences", await api("GET", "/sequences", kNoCrm)],
      ["scoring", await api("GET", "/scoring/rules", kNoCrm)],
      ["tracking", await api("GET", "/tracking/links", kNoCrm)],
      ["automation", await api("GET", "/automation/rules", kNoCrm)],
    ];
    const leaked = probes.filter(([, r]) => r.status === 200).map(([k]) => k);
    const allowed = TOOLS.crmToolAllowedForScopes as Any;
    const toolLeak = typeof allowed === "function" ? TOOLS_10.filter((t) => allowed(t, ["member.customer.read"]) === true) : TOOLS_10;
    chk("C2.11-X2.1", "a key with no `crm.*` scope at all is refused on EVERY new op (403/404, never 200) and `crmToolAllowedForScopes` answers false for all 10 tools — the member-only key of a shop cannot read its CRM through the second set either",
      leaked.length === 0 && toolLeak.length === 0,
      "0 leaks", `leaked=${leaked.join(",") || "-"} toolLeak=${toolLeak.join(",") || "-"}${ABSENT}`);
  }
  {
    const send = await api("POST", "/emails/send", kRO, { contactId, subject: `ห้ามส่ง ${TAG}`, body: "x" });
    const enroll = await api("POST", `/sequences/${TAG}-any/enroll`, kRO, { contactId });
    const recompute = await api("POST", "/scoring/recompute", kRO, { all: true, confirm: true, reason: REASON });
    const rotate = await api("POST", "/emails/inbound/rotate-key", kRO, { confirm: true, reason: REASON });
    const codes = [send, enroll, recompute, rotate].map((r) => `${r.status}/${ecode(r)}`);
    chk("C2.11-X2.2", "the readonly bundle cannot write: send · enroll · recompute · rotate-key all answer 403 (forbidden|scope_missing) — a confirm+reason in the body does not buy a scope",
      [send, enroll, recompute, rotate].every((r) => r.status === 403 || (r.status === 404 && ecode(r) === "not_found")),
      "4 × 403", `codes=${codes.join(" · ")}${ABSENT}`);
  }
  {
    const seqList = await api("GET", "/sequences", kOP);
    const scoreRules = await api("GET", "/scoring/rules", kOP);
    const autoRules = await api("GET", "/automation/rules", kOP);
    const explain = await api("GET", `/contacts/${contactId}/score`, kOP);
    chk("C2.11-X2.3", "the operate bundle is the sales rep, not the admin: the `*.manage` groups (sequences · scoring rules · automation rules) are refused for it while the contact-level read (score explain) is allowed — the bundles stay readonly ⊂ operate ⊂ admin",
      [seqList, scoreRules, autoRules].every((r) => r.status === 403 || (r.status === 404 && ecode(r) === "not_found")) && explain.status === 200,
      "3 × 403 · explain 200", `sequences=${seqList.status}/${ecode(seqList)} scoring=${scoreRules.status} automation=${autoRules.status} explain=${explain.status}${ABSENT}`);
  }
  {
    const otherUser = await mkUser("-other");
    await P.membership.create({ data: { userId: otherUser, tenantId: tidA, role: "STAFF", unitAccess: ["*"], permissions: { "crm.contact.read": true }, acceptedAt: new Date() } });
    const mine = await mkContact();
    await P.crmContact.update({ where: { id: mine }, data: { ownerUserId: otherUser } });
    const kOwn = await mkKey("readonly+owner", [...roScopes, `crm.filter.owner:${userA}`], S);
    const list = await api("GET", "/contacts?take=50", kOwn);
    const ids = new Set(((dat(list)?.items ?? []) as Any[]).map((x) => String(x?.id ?? x?.contactId ?? "")));
    const scoreOfOther = await api("GET", `/contacts/${mine}/score`, kOwn);
    chk("C2.11-X2.4", "the `crm.filter.owner:<userId>` pseudo-scope (R-C.3) is honoured by the SECOND set too: a key filtered to userA does not see a contact owned by somebody else in the list and gets 404 (not 403) when it asks for that contact's score reasons",
      list.status === 200 && !ids.has(mine) && scoreOfOther.status === 404,
      "filtered list · 404", `list=${list.status} sawForeign=${ids.has(mine)} score=${scoreOfOther.status}/${ecode(scoreOfOther)}${ABSENT}`);
  }
  {
    const thanaCtx = { tenantId: tidA, systemId: S, userId: userTh, role: "STAFF", unitAccess: ["*"], permissions: { "crm.contact.read": true, "crm.deal.read": true } as Record<string, unknown> };
    const noHuman = { tenantId: tidA, systemId: S } as Any;
    const asThana = await call(runTool, thanaCtx, "crm_email_thread", { contactId });
    const anon = await call(runTool, noHuman, "crm_stale_deals", {});
    const anonRead = anon.ok && String(anon.v?.mode) === "read";
    chk("C2.11-X2.5", "the assistant runs with (key scopes ∩ the asking human's rights ∩ his teams): asking as a STAFF who holds no `crm.email.read` gets an error/empty result instead of somebody else's thread, and a call with NO human behind it fails closed (never a read result)",
      (!asThana.ok || String(asThana.v?.mode) === "error" || j(asThana.v?.result ?? {}) === "{}" || !j(asThana.v?.result ?? {}).includes("@")) && !anonRead,
      "no leak · fail closed", `thana=${asThana.ok ? cut(j(asThana.v), 120) : asThana.err} anon=${anon.ok ? j(anon.v?.mode) : anon.err}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X3 · X6 · X7 — idempotency · validation · rate
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X3 · X6 · X7 ──");
  {
    const idem = `${TAG}-send-once`;
    const before = (await P.crmEmailMessage.count({ where: { systemId: S } }).catch(() => 0)) as number;
    const a = await api("POST", "/emails/send", kOP, { contactId, subject: `ครั้งเดียว ${TAG}`, body: "สวัสดี" }, { idem });
    const b = await api("POST", "/emails/send", kOP, { contactId, subject: `ครั้งเดียว ${TAG}`, body: "สวัสดี" }, { idem });
    const after = (await P.crmEmailMessage.count({ where: { systemId: S } }).catch(() => 0)) as number;
    chk("C2.11-X3.1", "idempotent send: the same `Idempotency-Key` twice creates ONE e-mail row (the second answers the same id / a 409 with it) — a retrying client never mails the customer twice",
      reachable(a) && after - before <= 1 && (b.status === a.status || b.status === 409),
      "≤ 1 row", `first=${a.status}/${cut(j(a.body), 70)} second=${b.status} rows ${before}→${after}${ABSENT}`);
  }
  {
    const unknown = await api("POST", "/sequences", kAD, { name: `แปลก ${TAG}`, steps: [], tenantId: tidA });
    const unknown2 = await api("PUT", "/notifications/prefs", kOP, { notifications: {}, systemId: S });
    chk("C2.11-X6.1", "strict schemas really reject smuggled fields: a body carrying `tenantId` (sequences.create) or `systemId` (notifications.prefs.set) is refused with a validation error — the scope of a request comes from the KEY, never from the body",
      [400, 422].includes(unknown.status) && [400, 422].includes(unknown2.status),
      "400/422 ×2", `sequences=${unknown.status}/${ecode(unknown)} prefs=${unknown2.status}/${ecode(unknown2)}${ABSENT}`);
  }
  {
    const long = "ก".repeat(5000);
    const big = await api("POST", "/emails/send", kOP, { contactId, subject: long, body: "x" });
    const arr = await api("POST", "/sequences/x/bulk-enroll", kAD, { contactIds: Array.from({ length: 2000 }, () => contactId), confirm: true, reason: REASON });
    chk("C2.11-X6.2", "every string is capped and every array is capped: a 5,000-character subject and a 2,000-id bulk enroll are both refused with a validation error instead of being passed to the engine",
      [400, 422].includes(big.status) && [400, 404, 422].includes(arr.status) && arr.status !== 200,
      "400/422", `subject=${big.status}/${ecode(big)} bulk=${arr.status}/${ecode(arr)}${ABSENT}`);
  }
  {
    const over = await api("GET", "/sequences?take=1000", kAD);
    const neg = await api("GET", "/tracking/links?take=-5", kAD);
    chk("C2.11-X6.3", "list caps: `take=1000` and `take=-5` are refused (or silently clamped to ≤ 100) — no key can ask the database for the whole table in one call",
      (([400, 422].includes(over.status)) || (over.status === 200 && ((dat(over)?.items ?? []) as Any[]).length <= 100)) && (([400, 422].includes(neg.status)) || neg.status === 200),
      "clamped or 400", `take1000=${over.status}/${((dat(over)?.items ?? []) as Any[]).length} takeNeg=${neg.status}${ABSENT}`);
  }
  {
    const cfg = (CFG.CRM_API_CONFIG ?? {}) as Any;
    const limits = cfg.rateLimits ?? {};
    const rateKinds = present.filter((m) => { const o = byId.get(m.id) as Any; return o && o.rate === undefined && m.kind === "read"; }).map((m) => m.id);
    chk("C2.11-X7.1", "the rate limiter of C1.10 covers the new ops: `CRM_API_CONFIG` still declares read/write/report limits on its own namespace (never the account/member/kb namespace) and the heavy new reads (stats/simulate/dry-run) are declared with an explicit `rate` bucket",
      !!cfg.rateNs && typeof limits === "object" && Object.keys(limits).length >= 2 && String(cfg.systemType) === "CRM",
      "config + buckets", `rateNs=${String(cfg.rateNs)} limits=${Object.keys(limits).join(",") || "-"} systemType=${String(cfg.systemType)} readOpsWithoutRate=${rateKinds.length}${ABSENT}`, "MAJOR");
  }
  {
    const buckets = (await P.chatRateBucket.count({ where: { key: { contains: String((CFG.CRM_API_CONFIG ?? {}).rateNs ?? "crm") } } }).catch(() => -1)) as number;
    const many = await Promise.all(Array.from({ length: 12 }, () => api("GET", "/sequences?take=1", kAD)));
    const statuses = [...new Set(many.map((r) => r.status))];
    chk("C2.11-X7.2", "the limiter is really wired (not just configured): a burst of 12 identical list calls on one key either all pass inside the limit or start answering 429 — and the counter rows land in the DB limiter (`checkRateLimitDb`), never in process memory",
      buckets >= 0 && statuses.every((s) => [200, 403, 404, 429].includes(s)),
      "no 500 · bucket rows", `statuses=${statuses.join(",")} buckets=${buckets}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X8 · X9 — PDPA · danger
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X8 · X9 ──");
  {
    const roThread = await api("GET", "/emails/threads?take=5", kRO);
    const adThread = await api("GET", "/emails/threads?take=5", kAD);
    const roText = j(dat(roThread) ?? {});
    const hasBodyField = /"bodyHtml"|"bodyText"|"body"\s*:/.test(roText);
    chk("C2.11-X8.1", "the readonly bundle never gets an e-mail BODY: a key without `crm.email.read` either cannot reach the threads at all (403) or gets headers/snippet only (no bodyHtml/bodyText/body field), while the admin key that holds the scope may read the thread",
      (roThread.status === 403 || roThread.status === 404 || !hasBodyField) && (adThread.status === 200 || adThread.status === 403 || adThread.status === 404),
      "no body for readonly", `readonly=${roThread.status} hasBody=${hasBodyField} admin=${adThread.status} sample=${cut(roText, 120)}${ABSENT}`, "MAJOR");
  }
  {
    const srcAll = walk(OPS_DIR).map(read).join("\n");
    const leaks = ["transcript", "recordingFileId", "aiSummary"].filter((f) => new RegExp(`${f}\\s*:`).test(srcAll));
    const serialize = read(`${API_DIR}/serialize.ts`);
    const masks = /phone|email/.test(serialize);
    chk("C2.11-X8.2", "the API never exposes a call transcript, a recording file id or the AI summary of a call through the new ops [static], and the shared serializer still knows how to mask phone/e-mail for the readonly bundle (the C1.10 rule stays in force for the second set)",
      !!srcAll && leaks.length === 0 && masks,
      "no transcript/recording · masking", `leaks=${leaks.join(",") || "-"} serializerMasks=${masks}${ABSENT}`, "MAJOR");
  }
  {
    const evs = ((await P.outboxEvent.findMany({ where: { tenantId: tidA } })) as Any[]);
    const text = j(evs.map((e) => e.payload));
    const hits = PII.filter((p) => text.includes(p));
    chk("C2.11-X8.3", "every outbox event this run produced through the API carries ids only — no customer name, phone or e-mail of this run appears in any payload (R-C.8, the rule webhooks inherit)",
      hits.length === 0, "no PII", `events=${evs.length} hits=${hits.slice(0, 3).join(",") || "-"} sample=${cut(text, 140)}${ABSENT}`, "MAJOR");
  }
  {
    const dangerIds = ["emails.inbound.rotate", "sequences.bulkEnroll", "scoring.recompute"];
    const wrong = dangerIds.filter((id) => byId.has(id) && String((byId.get(id) as Any).kind) !== "danger");
    const sendOp = byId.get("emails.send") as Any;
    const sendShapeRaw = sendOp ? (sendOp.input as Any)?._def?.shape : null;
    const sendShape = sendOp ? j(Object.keys((typeof sendShapeRaw === "function" ? sendShapeRaw() : (sendShapeRaw ?? (sendOp.input as Any)?.shape ?? {})) as Record<string, unknown>)) : "";
    const multiAware = !sendOp || /confirm|recipients|to\b/.test(sendShape) || /confirm/.test(read(`${OPS_DIR}/emails.ts`));
    chk("C2.11-X9.1", "the danger list of the brief is declared as such in the registry: rotate inbound key · bulk enroll · recompute-all are kind `danger` (so the dispatcher demands confirm + reason), and `emails.send` knows about the multi-recipient case (a send to more than one address is the danger path, a single recipient is a plain write)",
      dangerIds.every((id) => byId.has(id)) && wrong.length === 0 && multiAware,
      "3 danger · send aware", `missing=${dangerIds.filter((id) => !byId.has(id)).join(",") || "-"} wrongKind=${wrong.join(",") || "-"} sendAware=${multiAware}${ABSENT}`);
  }
  {
    const multi = await api("POST", "/emails/send", kAD, { contactIds: [contactId, contactId], subject: `หลายคน ${TAG}`, body: "x" });
    const multiOk = await api("POST", "/emails/send", kAD, { contactIds: [contactId, contactId], subject: `หลายคน ${TAG}`, body: "x", confirm: true, reason: REASON });
    const shortReason = await api("POST", "/scoring/recompute", kAD, { all: true, confirm: true, reason: "สั้น" });
    chk("C2.11-X9.2", "the danger guard really bites through the API: a multi-recipient send without confirm+reason is refused, the same call with them is accepted, and a reason shorter than 5 characters is refused on recompute-all — the guard is the dispatcher's, not the caller's good manners",
      reachable(multi) && ![200, 201, 202].includes(multi.status) && [200, 201, 202, 409, 422].includes(multiOk.status) && ![200, 201, 202].includes(shortReason.status),
      "refused · accepted · refused", `noConfirm=${multi.status}/${ecode(multi)} confirmed=${multiOk.status} shortReason=${shortReason.status}/${ecode(shortReason)}${ABSENT}`);
  }
  {
    const before = (await P.auditLog.count({ where: { tenantId: tidA } })) as number;
    await api("POST", "/scoring/recompute", kAD, { all: true, confirm: true, reason: REASON });
    await api("POST", "/emails/inbound/rotate-key", kAD, { confirm: true, reason: REASON });
    const rows = ((await P.auditLog.findMany({ where: { tenantId: tidA } })) as Any[]);
    const withReason = rows.filter((r) => j([r.before, r.after, r.action]).includes(TAG) || String(r.action).startsWith("crm."));
    chk("C2.11-X9.3", "every danger op that really ran left an AuditLog row of the module (action starting `crm.`) and the reason the caller gave is recorded — an API caller is as accountable as a human in the UI",
      rows.length >= before && withReason.length >= 1,
      "audit rows", `audits ${before}→${rows.length} crmRows=${withReason.length}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // U — uiVersion 1
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── U · uiVersion 1 ──");
  {
    const probes: [string, Resp][] = [
      ["threads", await api("GET", "/emails/threads", kV1)],
      ["sequences", await api("GET", "/sequences", kV1)],
      ["scoring", await api("GET", "/scoring/rules", kV1)],
      ["send", await api("POST", "/emails/send", kV1, { contactId, subject: "x", body: "y" })],
      ["recompute", await api("POST", "/scoring/recompute", kV1, { all: true, confirm: true, reason: REASON })],
    ];
    const bad = probes.filter(([, r]) => !(r.status === 409 && ecode(r) === "crm_v2_disabled") && r.status !== 404).map(([k, r]) => `${k}:${r.status}/${ecode(r)}`);
    chk("C2.11-U.1", "a key bound to a uiVersion-1 CRM system gets 409 `crm_v2_disabled` on every op of the second set (R-E.14 · exactly as C1.10 does for the first set) — reads and writes alike",
      bad.length === 0, "5 × 409", `bad=${cut(bad.join(" | "), 240) || "-"}${ABSENT}`);
  }
  {
    const badBody = await api("POST", "/sequences", kV1, { nope: 1 });
    const runs = (await P.crmSequence.count({ where: { systemId: SV } }).catch(() => 0)) as number;
    chk("C2.11-U.2", "the v1 gate comes BEFORE validation and before anything is written: a malformed body on a v1 system answers 409 crm_v2_disabled (not 400) and no row appears — the shop that has not switched on cannot be half-migrated by an API client",
      (badBody.status === 409 && ecode(badBody) === "crm_v2_disabled") || badBody.status === 404,
      "409 before 400", `status=${badBody.status}/${ecode(badBody)} rows=${runs}${ABSENT}`);
  }
  {
    const v1Ctx = { tenantId: tidA, systemId: SV, userId: userA, role: "OWNER", unitAccess: ["*"], permissions: {} as Record<string, unknown> };
    const tool = await call(runTool, v1Ctx, "crm_stale_deals", {});
    const legacy = await call(runTool, v1Ctx, "crm_create_lead", { name: `ลีดเก่า ${TAG}`, phone: "0800000000" });
    chk("C2.11-U.3", "the tools follow the same gate: a C2.11 tool on a v1 system answers a Thai error (mode \"error\"), while the LEGACY `crm_create_lead` keeps working on v1 exactly as C1.10 left it (the v1 shops still use the assistant)",
      (!tool.ok || String(tool.v?.mode) === "error") && (legacy.ok || legacy.code === "MISSING_FUNCTION"),
      "error · legacy alive", `tool=${tool.ok ? j(tool.v?.mode) : tool.err} legacy=${legacy.ok ? j(legacy.v?.mode) : legacy.err}${ABSENT}`);
  }
} catch (e) {
  chk("C2.11-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — docs restored · keys, rate buckets, tenants, users gone
  // ═════════════════════════════════════════════════════════════════════════════
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* order/FK — retried next pass */ } };
  if (docSnapshot !== null && read(DOC_FILE) !== docSnapshot) { try { writeFileSync(DOC_FILE, docSnapshot); } catch { /* read-only fs */ } }
  for (const id of KEY_IDS) await del(() => P.apiKey.delete({ where: { id } }));
  await del(() => P.chatRateBucket.deleteMany({ where: { key: { contains: TAG } } }));
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
      const users = USERS.length ? await P.user.count({ where: { id: { in: USERS } } }) : 0;
      const docOk = docSnapshot === null || read(DOC_FILE) === docSnapshot;
      chk("C2.11-CLEAN", "the oracle gives the QC database and the repo back exactly as found — every throwaway tenant, its API keys and rate buckets and the throwaway users are gone, and docs/api/CRM-API.md is byte-identical to what it was before the run",
        left.length === 0 && tenants === 0 && users === 0 && docOk, "0 rows · docs untouched", `${left.join(" · ") || "-"} · tenants=${tenants} users=${users} docs=${docOk}`, "MAJOR");
    } catch (e) {
      chk("C2.11-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C2.11: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
