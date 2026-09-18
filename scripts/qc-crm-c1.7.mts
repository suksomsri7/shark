// QC — CRM v2 WO C1.7: permissions (the §6.1 key list + PERMISSION_PARAMS + role defaults + implicit read) · visibility OWN/TEAM/ALL
//      (`src/lib/modules/crm/visibility.ts` + `access.ts`) replacing the internals of `where.ts` · cross-team reassign + approval
//      `crm.reassign` · Teams UI `/app/settings/teams` · `/crm/settings/visibility`
// Oracle writer · the C1.7 builder must NOT touch this file · QC database only (.env.qc)
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c1.7.mts
//      (`--force-run` = run every check even while visibility.ts is absent — all red, CLEAN green; proves fixtures, workers, cleanup)
// requires: crm-seed   (house style — this oracle reads NO seeded row; everything lives in ONE throwaway tenant `qc-c17-<rand>`)
//
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE (not re-implemented here): every C1 oracle so far — qc-crm-c1.1 · c1.2a · c1.2b ·
//   c1.3 · c1.4 · c1.5 · c1.6 (+ qc-crm · qc-crm-activity) — they must still pass THROUGH visibility (their OWNER fixtures stay ALL;
//   see QUESTION Q1 about their STAFF actors that sit in no team) · qc-member-m1.5 (saved views, scope TEAM) · qc-acc-v2-permissions
//   (the permission registry / updateStaffAccess validation) · qc-nav-functions (the two new pages are linked — no orphan) ·
//   scripts/pending/probe-uiversion-gate.mts (its V2_ONLY list gains settings/visibility/page.tsx) · qc-member-m1.9 (30/15/10/5).
//
// SOURCES: crm-brief-C1.7.md · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-A where.ts · R-C.3 API-key filter pseudo-scopes ·
//   R-C.10 `crm.reassign` · R-D C1.6 → C1.7 not parallel · R-E.14 uiVersion) · CRM-RUN §2 "C1.7" (S1 6 · S2 4 · S3 3 · S4 3 · S5 2 ·
//   S6 2 · S7 6 = 26) · MASTER-PLAN §2 §4 (X1–X10) §5 §6 row C1.7 (X1 full matrix · no stale team cache) · blueprint §5.9 (visibility.ts)
//   §6.1 keys/params/role defaults · §6.2 C9 table · §6.3 reassign row · §6.4 404-not-403 · §11.6 ("โอนดีลก่อนไหม") · §4.5 settings
//   `visibility: { STAFF: "TEAM", MANAGER: "ALL" }` · decision C9 · mockup 10 LEFT (panels "ทีม" list · lead · members · units ·
//   รับลีด toggle — names only, no screenshot assertion) · member lesson "authorization must never come from a cached answer".
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this) ══════════════════════════════════
//   PERMISSIONS (src/lib/core/permissions.ts, crm block only)
//   · every key of blueprint §6.1 is registered under module "crm" with a Thai label (the list has 51 names although the work order
//     is titled "40 keys" — see Q2); the 6 existing keys (crm.contact.create · crm.deal.create · crm.deal.move · crm.deal.quote ·
//     crm.activity.create · crm.activity.complete) keep their exact strings · `crm.*` wildcard keeps working (rbac.evaluate unchanged)
//   · PERMISSION_PARAMS gains 3 crm params (module "crm", Thai label, isPermissionParamKey true): `crm._maxDealDiscountBp` (default
//     1000 — `default: 1000` on the def, and DEAL_DISCOUNT_CAP_BP_DEFAULT stays 1000) · `crm._maxCommissionApproveSatang` ·
//     `crm._maxReassignPerDay`
//   · role defaults exported as `CRM_ROLE_DEFAULTS` (permissions.ts or crm/access.ts): { STAFF: string[], MANAGER: string[] } —
//     STAFF = exactly the §6.1 STAFF list (contact/company/deal read+create+update · deal.move · deal.lines · deal.quote · activity.* ·
//     email.send · email.read · sequence.enroll · record.read/create/update · report.view) · MANAGER = every key EXCEPT
//     crm.settings.manage · crm.api.manage · crm.object.manage · crm.visibility.manage · crm.team.manage (commission.approve is kept,
//     bounded by crm._maxCommissionApproveSatang) · OWNER = everything
//   ACCESS (src/lib/modules/crm/access.ts) — the one key check the services call:
//   · OWNER ⇒ every key · MANAGER ⇒ every key except the 5 above unless granted explicitly · STAFF ⇒ `permissions[key] === true` or
//     `permissions["crm.*"] === true` · IMPLICIT READ: a HUMAN member (no `apiRole`) holding ANY `crm.*` key (true) also has
//     crm.contact.read + crm.deal.read + crm.activity.read · an API-key actor (`apiRole` set) NEVER gets implicit read: its
//     `permissions` are its scopes and nothing else
//   · order inside every service call: re-resolve the CRM system → visibility (invisible ⇒ NOT_FOUND, message never echoes foreign
//     data) → key (visible but no key ⇒ thrown `.code = "FORBIDDEN"` with a Thai message that does not blame the user)
//   · an actor without the read key of an entity gets NOTHING from its lists (FORBIDDEN, or an empty page) and NOT_FOUND|FORBIDDEN on get
//   VISIBILITY (src/lib/modules/crm/visibility.ts)   import * as V from "@/lib/modules/crm/visibility"
//   · entity ∈ "CONTACT" | "COMPANY" | "DEAL" | "ACTIVITY" | "REPORT" (CrmVisibilityPolicy.entity) · files and custom records follow
//     their parent (CrmFileLink → its entity · CustomRecord with parentType CONTACT/COMPANY/DEAL → that parent; other parents → unit
//     scope only)
//   · V.resolve(ctx, actor, entity, { pipelineId? }?) → "OWN" | "TEAM" | "ALL" (a string; `{ visibility }` tolerated) — precedence:
//     OWNER ⇒ ALL always (even when a policy row names role OWNER) · API-key actor ⇒ ALL narrowed by its filter pseudo-scopes ·
//     else the first match of: policy (pipelineId + teamId of one of my teams) → policy (teamId, pipelineId null) → policy (role,
//     teamId null, pipelineId null) → `settings.crm.visibility[role]` (blueprint §4.5 shape `{ STAFF: "TEAM", MANAGER: "ALL" }`, one
//     value per role for every entity) → default C9: STAFF CONTACT/COMPANY/DEAL = TEAM, ACTIVITY = OWN · LEAD of any team (TeamMember
//     role LEAD) = TEAM for every entity · MANAGER = ALL (see Q5) · policies of ANOTHER CRM system never apply
//   · V.visibleWhere(ctx, actor, entity, { pipelineId? }?) → Prisma where (sync or async) · always tenant + system scoped ·
//     OWN = ownerUserId = me OR me ∈ collaboratorUserIds (deals) · TEAM = OWN OR teamId ∈ my teams OR ownerUserId ∈ members of the
//     teams I belong to / lead · ALL = the actor's unit scope: OWNER/MANAGER with unitAccess "*" see every row; a unit-restricted
//     MANAGER sees rows with teamId null, or whose team has no unitIds, or whose team has a unit in unitAccess (see Q6) ·
//     API-key filters (R-C.3, stored as scopes → permissions keys): `crm.filter.team:<teamId>` ⇒ teamId = that team ·
//     `crm.filter.owner:<userId>` ⇒ ownerUserId = that user · a pipeline-level policy applies to the rows of that pipeline only
//   · V.canSee(ctx, actor, entity, id) → Promise<boolean>
//   · V.policies.list(ctx, actor) · V.policies.set(ctx, actor, { role?, teamId?, pipelineId?, entity, visibility }) → { id } (one row per
//     (system, role, team, pipeline, entity) — NULL-safe find-then-write under a lock: parallel sets never duplicate) ·
//     V.policies.remove(ctx, actor, id) [tolerated upsert / delete] — needs `crm.visibility.manage` (OWNER, or explicitly granted;
//     MANAGER by default ⇒ FORBIDDEN) · teamId / pipelineId must belong to this tenant / this CRM system, else NOT_FOUND|VALIDATION ·
//     every change writes AuditLog action `crm.visibility.*` (actorId, before/after) (X9)
//   · NO cache of team membership, policies or settings across calls (not in a module-level Map, not in unstable_cache): removing a
//     user from a team — through core teams.removeMember OR a raw DB delete — changes the very next call in the same process
//   WHERE.TS — companyWhere · contactWhere · dealWhere · activityWhere · fileWhere · recordWhere keep their names (they may become async)
//     and delegate to visibleWhere; every C1.2b–C1.6 read goes through them: companies (listCompanies · getCompany360 · exportCompanies ·
//     companyOptions) · contacts (listContacts · getContact360 · contactOptions · exportContacts) · deals (listDeals · getDeal360 ·
//     getBoard · forecast · exportDeals) · activities (listActivities · calendar · listNotes · getActivity) · files (listFiles; attachFile
//     on an invisible record ⇒ NOT_FOUND, nothing stored) · objects (records.list · records.get · timelineFor · tabsFor) · mutations on
//     an invisible row ⇒ NOT_FOUND, row unchanged
//   C1.6 SURFACES — kanban `listCardLinks(kctx, viewer, cardId)`: a DEAL / COMPANY / CRM_CONTACT / CUSTOM_RECORD link whose record the
//     VIEWER cannot see renders canView false · no title of the record · href null · mention notifications (logActivity NOTE +
//     mentions) go only to users who can see the record under THIS visibility (a same-shop STAFF of another team gets nothing)
//   REASSIGN — deals.reassignDeal(ctx, actor, id, { ownerUserId, teamId? }) (and bulkReassign): cross-team = the target team
//     (teamId given, else the new owner's team) differs from the deal's teamId ⇒ needs `crm.deal.reassign` (else FORBIDDEN Thai, row
//     unchanged) · per actor per Thai day, cross-team reassigns ≥ permissionValue(actor, "crm._maxReassignPerDay") (unset = unlimited;
//     OWNER never capped) ⇒ approval.submitForApproval(entityType "crm.reassign", entityId `<dealId>:<seq>`): policy present ⇒
//     `{ status: "APPROVAL_REQUIRED", approvalRequestId }` (or thrown `.code` APPROVAL_REQUIRED) and the deal UNCHANGED · no policy ⇒
//     applied · the daily counter is exact under parallel calls (X3) · the reassign sets deal.teamId when teamId is given
//     (the approval's EFFECT is owned by C3.2 per approval-effects.ts — not tested here, see Q7)
//   PAGES — `/app/settings/teams` (src/app/app/settings/teams/**): requireTenant · gate OWNER or `crm.team.manage` ⇒ else notFound() ·
//     list / create / rename / archive teams · lead · members · units · acceptingLeads toggle — every write through core
//     `@/lib/core/teams` (createTeam · updateTeam · archiveTeam · addMember · removeMember · setLead · setAcceptingLeads) from a
//     "use server" file that re-checks the key · the remove-member flow warns "โอนดีลก่อนไหม" (§11.6) · linked from the settings drawer ·
//     `/app/sys/[id]/crm/settings/visibility`: CRM system guard + requireCrmV2Page + `crm.visibility.manage` ⇒ notFound · role × entity
//     matrix + per-team / per-pipeline override list (V.policies) · in CRM_DEEP_NAV "ready" · both pages: data-testid on every control +
//     rows in scripts/crm-ui-inventory.json · client components under src/components/crm/settings/** never import prisma-reaching modules
//
// WHAT THIS FILE PROVES: S0 structure · S1–S7 (CRM-RUN, 26) · X1 full matrix (each function family, invisible-row mutations, kanban
//   resolver, mentions, cross-system, canSee/visibleWhere, NO CACHE) · X2 API-key actors · X3 parallel policy writes + the reassign
//   counter (worker PROCESSES, own pools) · X9 audit of policy / team changes + gates. X4 n/a (no new consumer — team.updated stays a
//   no-op because nothing is cached) · X5 n/a (no cron) · X6 n/a (no new input format; exports are C1.3–C1.5's, re-checked for scope
//   only) · X7 n/a (no public endpoint) · X8 n/a (no new event/payload; crm.deal.reassigned is C1.5's) · X10 n/a (no file/secret).
// HOUSE RULES: SKIP guard (no DB before it) · throwaway tenant `qc-c17-<rand>` swept in `finally` · no drainOutbox · object storage is
//   never contacted (fake SHARK_BUNNY_* + injected put/del + fetch stub) · seeded QC data never read or written · last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const V_FILE = "src/lib/modules/crm/visibility.ts";
const ACC_FILE = "src/lib/modules/crm/access.ts";
const WHERE_FILE = "src/lib/modules/crm/where.ts";
const NAV_FILE = "src/lib/modules/crm/nav.ts";
const CRM_PAGES = "src/app/app/sys/[id]/crm";
const TEAMS_DIR = "src/app/app/settings/teams";
const VIS_DIR = `${CRM_PAGES}/settings/visibility`;
const COMP_DIR = "src/components/crm/settings";
const V_SPEC = "@/lib/modules/crm/visibility";
const D_SPEC = "@/lib/modules/crm/deals";
const THIS_FILE = "scripts/qc-crm-c1.7.mts";

const ARGV = process.argv.slice(2);
const WORKER_AT = ARGV.indexOf("--x3-worker");
const FORCE = ARGV.includes("--force-run");

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guard — nothing of C1.7 exists yet ⇒ SKIPPED, no DB connection opened.
// ═══════════════════════════════════════════════════════════════════════════════════
if (!existsSync(V_FILE) && WORKER_AT < 0 && !FORCE) {
  console.log(`⚠️  SKIPPED — WO C1.7 not built yet (${V_FILE} missing)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();

// ─── object storage is NEVER contacted: fake identity + fetch stub ───
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c17-${rand}`;
const CDN = "https://qc-c17-cdn.invalid";
process.env.SHARK_BUNNY_CDN = CDN;
process.env.SHARK_BUNNY_ZONE = `${TAG}-zone`;
process.env.SHARK_BUNNY_KEY = `qc-c17-key-${randomBytes(8).toString("hex")}`;
delete process.env.BUNNY_ACCOUNT_KEY;
const STORE_REQ: { method: string; url: string }[] = [];
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  const method = String(init?.method ?? input?.method ?? "GET").toUpperCase();
  if (/bunnycdn\.com|bunny\.net|qc-c17-cdn\.invalid/.test(url)) {
    STORE_REQ.push({ method, url });
    return new Response(method === "GET" ? "not found" : "ok", { status: method === "PUT" ? 201 : method === "GET" ? 404 : 200 });
  }
  return realFetch(input, init);
}) as typeof fetch;

const fnOf = (mod: Any, ...names: string[]): Any => {
  for (const n of names) {
    let v: Any = mod;
    for (const p of n.split(".")) v = v?.[p];
    if (typeof v === "function") return v;
  }
  return undefined;
};
const codeOf = (e: Any) => String(e?.code ?? "-");
const isApproval = (v: Any) => v?.status === "APPROVAL_REQUIRED" || !!v?.approvalRequestId;

// ═══════════════════════════════════════════════════════════════════════════════════
// X3 WORKER MODE — this same file re-invoked as a child process (own PrismaClient = own pool, synchronised start).
//   argv: --x3-worker <mode> <tenantId> <crmSystemId> <userId> <startAtMs> <base64url(JSON arg)>
//     policy   : { actor, n, input } → n parallel V.policies.set (visibility alternates TEAM/OWN)
//     reassign : { actor, dealIds[], ownerUserId, teamId } → parallel deals.reassignDeal, one per deal
// ═══════════════════════════════════════════════════════════════════════════════════
if (WORKER_AT >= 0) {
  const [mode, wT, wS, wU, wStart, wArg] = ARGV.slice(WORKER_AT + 1);
  const VW = (await import(V_SPEC as string).catch(() => ({}))) as Any;
  const DW = (await import(D_SPEC as string).catch(() => ({}))) as Any;
  const dbw = (await import("@/lib/core/db")) as Any;
  const ctx = { tenantId: wT, systemId: wS, actorUserId: wU };
  const arg = JSON.parse(Buffer.from(String(wArg), "base64url").toString("utf8"));
  const actor = arg.actor;
  const waitMs = Number(wStart) - Date.now();
  if (waitMs > 0) await new Promise<void>((r) => setTimeout(r, waitMs));
  const run = async (f: () => Promise<unknown>): Promise<string> => {
    try {
      const v = await f();
      return isApproval(v) ? "APPROVAL" : "OK";
    } catch (e) {
      if (codeOf(e) === "APPROVAL_REQUIRED" || (e as Any)?.approvalRequestId) return "APPROVAL";
      return `ERR:${codeOf(e)}:${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`;
    }
  };
  const need = (fn: Any, name: string) => { if (typeof fn !== "function") throw Object.assign(new Error(`${name} missing`), { code: "MISSING_FUNCTION" }); return fn; };
  const out: string[] = [];
  if (mode === "policy") {
    const set = fnOf(VW, "policies.set", "policies.upsert", "setPolicy");
    out.push(...(await Promise.all(Array.from({ length: Number(arg.n ?? 4) }, (_x, i) =>
      run(() => need(set, "policies.set")(ctx, actor, { ...arg.input, visibility: i % 2 === 0 ? "TEAM" : "OWN" }))))));
  } else if (mode === "reassign") {
    const re = fnOf(DW, "reassignDeal");
    out.push(...(await Promise.all((arg.dealIds as string[]).map((id) =>
      run(() => need(re, "reassignDeal")(ctx, actor, id, { ownerUserId: arg.ownerUserId, teamId: arg.teamId }))))));
  }
  console.log(`X3WORKER ${JSON.stringify(out)}`);
  await dbw.prisma.$disconnect();
  process.exit(0);
}

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;

// ─────────────────────────── harness ───────────────────────────
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const cut = (v: string | undefined | null, n = 260) => { const s = String(v ?? ""); return s.length > n ? `${s.slice(0, n)}…` : s; };
const j = (v: Any): string =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x instanceof Uint8Array ? `<${x.length}b>` : x)) ?? "undefined";
const thai = (s: unknown) => typeof s === "string" && s.trim().length > 0 && /[ก-๙]/.test(s);
type Res = { ok: boolean; v: Any; err: string; code: string; status: number; msg: string; extra: Any };
const call = async (fn: Any, ...args: Any[]): Promise<Res> => {
  if (typeof fn !== "function") return { ok: false, v: undefined, err: "MISSING_FUNCTION", code: "MISSING_FUNCTION", status: 0, msg: "", extra: null };
  try {
    return { ok: true, v: await fn(...args), err: "", code: "", status: 0, msg: "", extra: null };
  } catch (e) {
    const x = e as Any;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, v: undefined, err: `${x?.name ?? "Error"}(${x?.code ?? "-"}): ${cut(msg, 160)}`, code: String(x?.code ?? ""), status: Number(x?.status ?? 0), msg, extra: x };
  }
};
const isNotFound = (r: Res) => !r.ok && (r.code === "NOT_FOUND" || r.status === 404);
const isForbidden = (r: Res) => !r.ok && (r.code === "FORBIDDEN" || r.status === 403);
const isValidation = (r: Res) => !r.ok && (r.code === "VALIDATION" || r.code === "BAD_INPUT" || r.status === 400);
/** "gets nothing": refused with NOT_FOUND/FORBIDDEN (never MISSING_FUNCTION / a crash) */
const isDenied = (r: Res) => isNotFound(r) || isForbidden(r);
const itemsOf = (r: Any): Any[] => (Array.isArray(r) ? r : (r?.items ?? r?.rows ?? r?.activities ?? r?.files ?? r?.deals ?? r?.records ?? []));
const idsOf = (r: Any): Set<string> => new Set(itemsOf(r).map((x: Any) => String(x?.id ?? x?.activityId ?? x?.dealId ?? "")));
const boardIds = (r: Any): Set<string> => new Set(((r?.columns ?? []) as Any[]).flatMap((c: Any) => ((c?.cards ?? []) as Any[]).map((x: Any) => String(x?.id ?? ""))));
const hasAll = (s: Set<string>, ids: string[]) => ids.every((i) => s.has(i));
const hasNone = (s: Set<string>, ids: string[]) => ids.every((i) => !s.has(i));
/** a list call that must give NOTHING of `ids`: refused (NOT_FOUND/FORBIDDEN) or ok without any of them */
const nothingOf = (r: Res, ids: string[]) => (r.ok ? hasNone(idsOf(r.v), ids) : isDenied(r));
const walk = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
};
const DAY_MS = 86_400_000;

// ─────────────────────────── §6.1 key list ───────────────────────────
const KEYS_61 = [
  "crm.contact.read", "crm.contact.create", "crm.contact.update", "crm.contact.delete", "crm.contact.convert", "crm.contact.import", "crm.contact.export", "crm.contact.merge",
  "crm.company.read", "crm.company.create", "crm.company.update", "crm.company.delete", "crm.company.merge",
  "crm.deal.read", "crm.deal.create", "crm.deal.update", "crm.deal.move", "crm.deal.delete", "crm.deal.quote", "crm.deal.reassign", "crm.deal.lines", "crm.deal.forecast",
  "crm.activity.read", "crm.activity.create", "crm.activity.complete", "crm.activity.delete",
  "crm.email.read", "crm.email.send", "crm.email.settings",
  "crm.sequence.manage", "crm.sequence.enroll", "crm.automation.manage", "crm.score.manage", "crm.assignment.manage",
  "crm.object.manage", "crm.record.read", "crm.record.create", "crm.record.update", "crm.record.delete",
  "crm.team.manage", "crm.visibility.manage", "crm.quota.manage", "crm.commission.view", "crm.commission.approve",
  "crm.report.view", "crm.report.team", "crm.report.all",
  "crm.tracking.manage", "crm.portal.manage", "crm.settings.manage", "crm.api.manage",
] as const;
const LEGACY_6 = ["crm.contact.create", "crm.deal.create", "crm.deal.move", "crm.deal.quote", "crm.activity.create", "crm.activity.complete"];
const STAFF_DEFAULT = [
  "crm.contact.read", "crm.contact.create", "crm.contact.update", "crm.company.read", "crm.company.create", "crm.company.update",
  "crm.deal.read", "crm.deal.create", "crm.deal.update", "crm.deal.move", "crm.deal.lines", "crm.deal.quote",
  "crm.activity.read", "crm.activity.create", "crm.activity.complete", "crm.activity.delete",
  "crm.email.send", "crm.email.read", "crm.sequence.enroll", "crm.record.read", "crm.record.create", "crm.record.update", "crm.report.view",
];
const MANAGER_EXCLUDED = ["crm.settings.manage", "crm.api.manage", "crm.object.manage", "crm.visibility.manage", "crm.team.manage"];
const PARAMS_61 = ["crm._maxDealDiscountBp", "crm._maxCommissionApproveSatang", "crm._maxReassignPerDay"];
const perms = (keys: readonly string[], extra: Record<string, unknown> = {}) => ({ ...Object.fromEntries(keys.map((k) => [k, true])), ...extra });

// ─────────────────────────── state ───────────────────────────
const NONE = `${TAG}-none`;
let T = "";
const USERS: string[] = [];
const PUTS: string[] = [];
const storageDeps = { put: async (path: string) => { PUTS.push(path); }, del: async () => 200 };
let phoneSeq = 0;
const phoneOf = (): string => `08${String((Math.floor(Math.random() * 9_000_000) + 1_000_000) * 10 + (phoneSeq++ % 10)).padStart(8, "0").slice(-8)}`;
const SECRET_K = `กระบี่ลับ${rand}`; // every krabi-side title carries it ⇒ an error / DTO / CSV leak is detectable

console.log(`\n═══ QC CRM v2 · C1.7 — permissions · visibility OWN/TEAM/ALL · teams UI ═══`);
console.log(`[env] DB ${host} · tag ${TAG}${FORCE && !existsSync(V_FILE) ? " · --force-run with visibility.ts ABSENT (every functional check below is expected red)" : ""}\n`);

try {
  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — structure (static + registries)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S0 · structure ──");
  let importErr = "";
  const V = (await import(V_SPEC as string).catch((e: Any) => { importErr = e instanceof Error ? e.message : String(e); return {}; })) as Any;
  const ACC = (await import("@/lib/modules/crm/access" as string).catch(() => ({}))) as Any;
  const PM = (await import("@/lib/core/permissions" as string)) as Any;
  const RB = (await import("@/lib/core/rbac" as string)) as Any;
  const TM = (await import("@/lib/core/teams" as string)) as Any;
  const D = (await import(D_SPEC as string).catch(() => ({}))) as Any;
  const DS = (await import("@/lib/modules/crm/deals-shared" as string).catch(() => ({}))) as Any;
  const CT = (await import("@/lib/modules/crm/contacts" as string).catch(() => ({}))) as Any;
  const CO = (await import("@/lib/modules/crm/companies" as string).catch(() => ({}))) as Any;
  const OB = (await import("@/lib/modules/crm/objects" as string).catch(() => ({}))) as Any;
  const A = (await import("@/lib/modules/crm/activities" as string).catch(() => ({}))) as Any;
  const F = (await import("@/lib/modules/crm/files" as string).catch(() => ({}))) as Any;
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => null)) as Any;
  const KL = (await import("@/lib/modules/kanban/links" as string).catch(() => ({}))) as Any;
  const KR = (await import("@/lib/modules/kanban/link-resolvers" as string).catch(() => ({}))) as Any;
  const APR = (await import("@/lib/modules/approval/service" as string).catch(() => null)) as Any;
  const HAS_C16 = existsSync("src/lib/modules/crm/activities.ts") && existsSync("src/lib/modules/crm/files.ts");
  const vSrc = read(V_FILE);
  const accSrc = read(ACC_FILE);
  const whereSrc = read(WHERE_FILE);
  const pol = {
    set: fnOf(V, "policies.set", "policies.upsert", "setPolicy"),
    list: fnOf(V, "policies.list", "listPolicies"),
    remove: fnOf(V, "policies.remove", "policies.delete", "removePolicy"),
  };
  {
    const miss = [["resolve", V.resolve], ["visibleWhere", V.visibleWhere], ["canSee", V.canSee], ["policies.set", pol.set], ["policies.list", pol.list], ["policies.remove", pol.remove]]
      .filter(([, f]) => typeof f !== "function").map(([n]) => n);
    chk("C1.7-S0.1", "visibility.ts loads and exports resolve · visibleWhere · canSee · policies.{list,set,remove} · access.ts exists (the one key check of the services)",
      existsSync(V_FILE) && !importErr && miss.length === 0 && accSrc.length > 0, "surface", `${importErr ? cut(importErr) : existsSync(V_FILE) ? "" : "visibility.ts missing"} miss=${miss.join(",") || "-"} access.ts=${accSrc.length > 0}`);
  }
  {
    const defs = ((PM.PERMISSIONS ?? []) as Any[]).filter((p) => String(p?.key ?? "").startsWith("crm."));
    const byKey = new Map(defs.map((p) => [String(p.key), p]));
    const missing = KEYS_61.filter((k) => !byKey.has(k));
    const badLabel = KEYS_61.filter((k) => byKey.has(k) && (!thai(byKey.get(k)?.label) || byKey.get(k)?.module !== "crm"));
    const notKey = KEYS_61.filter((k) => typeof PM.isPermissionKey === "function" && !PM.isPermissionKey(k));
    chk("C1.7-S0.2", `permissions.ts crm block registers every §6.1 key (${KEYS_61.length} names — the WO says "40", see Q2) under module "crm" with a Thai label · isPermissionKey true for each (updateStaffAccess accepts them) · ≥ 40 crm keys`,
      missing.length === 0 && badLabel.length === 0 && notKey.length === 0 && defs.length >= 40, "all registered", `crm=${defs.length} missing=${missing.join(",") || "-"} badLabel=${badLabel.join(",") || "-"} notKey=${notKey.slice(0, 5).join(",") || "-"}`);
  }
  {
    const params = PARAMS_61.map((k) => (typeof PM.permissionParam === "function" ? PM.permissionParam(k) : undefined) as Any);
    const okDefs = params.every((d, i) => !!d && d.module === "crm" && thai(d.label) && typeof PM.isPermissionParamKey === "function" && PM.isPermissionParamKey(PARAMS_61[i]));
    const disc = params[0];
    chk("C1.7-S0.3", "PERMISSION_PARAMS has crm._maxDealDiscountBp (default 1000 on the def · DEAL_DISCOUNT_CAP_BP_DEFAULT still 1000) · crm._maxCommissionApproveSatang · crm._maxReassignPerDay — module crm, Thai label, isPermissionParamKey",
      okDefs && Number(disc?.default) === 1000 && Number(DS?.DEAL_DISCOUNT_CAP_BP_DEFAULT) === 1000, "3 params", `defs=${j(params.map((d) => (d ? { m: d.module, l: d.label, def: d.default } : null)))} cap=${DS?.DEAL_DISCOUNT_CAP_BP_DEFAULT}`, "MAJOR");
  }
  {
    const RD = (PM.CRM_ROLE_DEFAULTS ?? ACC.CRM_ROLE_DEFAULTS) as Any;
    const setOf = (x: Any) => new Set(Array.isArray(x) ? (x as string[]) : []);
    const staff = setOf(RD?.STAFF);
    const mgr = setOf(RD?.MANAGER);
    const expMgr = KEYS_61.filter((k) => !MANAGER_EXCLUDED.includes(k));
    const staffOk = staff.size === STAFF_DEFAULT.length && STAFF_DEFAULT.every((k) => staff.has(k));
    const mgrOk = expMgr.every((k) => mgr.has(k)) && MANAGER_EXCLUDED.every((k) => !mgr.has(k));
    chk("C1.7-S0.4", "role defaults §6.1 exported as CRM_ROLE_DEFAULTS: STAFF = exactly the §6.1 STAFF list (23 keys) · MANAGER = every key except settings/api/object.manage/visibility.manage/team.manage",
      staffOk && mgrOk, "exact sets", `staff=${staff.size} extra=${[...staff].filter((k) => !STAFF_DEFAULT.includes(k)).join(",") || "-"} missing=${STAFF_DEFAULT.filter((k) => !staff.has(k)).join(",") || "-"} mgrMissing=${expMgr.filter((k) => !mgr.has(k)).length} mgrExtra=${MANAGER_EXCLUDED.filter((k) => mgr.has(k)).join(",") || "-"}`, "MAJOR");
  }
  {
    const helpers = ["companyWhere", "contactWhere", "dealWhere", "activityWhere", "fileWhere", "recordWhere"];
    const missing = helpers.filter((h) => !new RegExp(`export\\s+(async\\s+)?function\\s+${h}\\b`).test(whereSrc));
    const stripped = whereSrc.replace(/\/\/.*$/gm, "");
    chk("C1.7-S0.5", "where.ts keeps its 6 helpers (companyWhere · contactWhere · dealWhere · activityWhere · fileWhere · recordWhere) and their internals delegate to visibleWhere (imported from ./visibility) — no local `{ tenantId, systemId }`-only scope left [static]",
      missing.length === 0 && /from\s+["']\.\/visibility["']/.test(whereSrc) && (stripped.match(/\bvisibleWhere\b/g) ?? []).length >= 3 && !/return\s*\{\s*tenantId:\s*ctx\.tenantId,\s*systemId:\s*ctx\.systemId\s*\}/.test(stripped),
      "delegates", `missing=${missing.join(",") || "-"} import=${/from\s+["']\.\/visibility["']/.test(whereSrc)} uses=${(stripped.match(/\bvisibleWhere\b/g) ?? []).length}`, "MAJOR");
  }
  {
    const code = vSrc.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const topLevelCache = /^(export\s+)?(const|let|var)\s+\w+\s*(:[^=]+)?=\s*new\s+(Map|WeakMap|LRU\w*)\b/m.test(code) || /unstable_cache|lru-cache|memoize/i.test(code);
    chk("C1.7-S0.6", "no stale authorization: visibility.ts keeps no module-level Map/LRU/unstable_cache of teams, policies or settings (the behavioural proof is X1.12) [static]",
      vSrc.length > 0 && !topLevelCache, "no cache", `src=${vSrc.length > 0} cache=${topLevelCache}`, "MAJOR");
  }
  chk("C1.7-S0.7", "implementation sites marked `// AUDIT-CLASS X1` · `X2` · `X3` · `X9` in visibility.ts + access.ts [static]",
    ["X1", "X2", "X3", "X9"].every((x) => new RegExp(`AUDIT-CLASS ${x}\\b`).test(vSrc + accSrc)), "4 markers",
    ["X1", "X2", "X3", "X9"].filter((x) => !new RegExp(`AUDIT-CLASS ${x}\\b`).test(vSrc + accSrc)).join(",") || "-", "MINOR");
  chk("C1.7-S0.8", "the crm facade exposes `visibility.*` (re-export only — C0.2)", typeof CRM?.visibility?.visibleWhere === "function" && typeof CRM?.visibility?.resolve === "function",
    "exported", `visibility=${typeof CRM?.visibility}`, "MINOR");
  chk("C1.7-S0.9", "C1.6 is merged before C1.7 (R-D: not parallel) — activities.ts + files.ts present, so the matrix below covers them", HAS_C16, "present", `activities/files=${HAS_C16}`);

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — ONE throwaway tenant: units P/K · teams phuket/krabi · CRM systems S (+ S2 same shop) · kanban · users · data
  // ═════════════════════════════════════════════════════════════════════════════
  const sysSvc = (await import("@/lib/modules/system/service")) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  const unitP = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `สาขาภูเก็ต ${rand}`, slug: `${TAG}-up` } })).id as string;
  const unitK = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `สาขากระบี่ ${rand}`, slug: `${TAG}-uk` } })).id as string;
  const mkUser = async (suffix: string) => {
    const u = await P.user.create({ data: { email: `${TAG}-${suffix}@qc.invalid`, name: `QC ${suffix} ${TAG}` } });
    USERS.push(u.id);
    return u.id as string;
  };
  type Who = { userId: string; role: string; unitAccess: string[]; permissions: Record<string, unknown>; apiRole?: string; keyId?: string };
  const mkMember = async (suffix: string, role: string, unitAccess: string[], p: Record<string, unknown>): Promise<Who> => {
    const userId = await mkUser(suffix);
    await P.membership.create({ data: { userId, tenantId: T, role, unitAccess, permissions: p, acceptedAt: new Date() } });
    return { userId, role, unitAccess, permissions: p };
  };
  const owner = await mkMember("owner", "OWNER", [], {});
  const mgr = await mkMember("mgr", "MANAGER", ["*"], {});
  const mgrP = await mkMember("mgrp", "MANAGER", [unitP], {});
  const thana = await mkMember("thana", "STAFF", ["*"], perms(STAFF_DEFAULT, { "kanban.*": true }));
  const dao = await mkMember("dao", "STAFF", ["*"], perms(STAFF_DEFAULT));
  const nok = await mkMember("nok", "STAFF", ["*"], perms([...STAFF_DEFAULT, "crm.deal.reassign"], { "crm._maxReassignPerDay": 1 }));
  const kai = await mkMember("kai", "STAFF", ["*"], perms([...STAFF_DEFAULT, "crm.deal.reassign"], { "crm._maxReassignPerDay": 2 }));
  const reader = await mkMember("reader", "STAFF", ["*"], perms(["crm.deal.read", "crm.contact.read", "crm.company.read"]));
  const implicitU = await mkMember("implicit", "STAFF", ["*"], perms(["crm.activity.create"]));
  const noneU = await mkMember("nocrm", "STAFF", ["*"], perms(["member.customer.read"]));
  const legacy = await mkMember("legacy", "STAFF", ["*"], perms(LEGACY_6));
  const mk = async (type: string, label: string) => (await sysSvc.createSystem(T, type, `${label} ${TAG}`)).id as string;
  const S = await mk("CRM", "CRM");
  const S2 = await mk("CRM", "CRM สอง");
  const KAN = await mk("KANBAN", "บอร์ดงาน");
  const baseSettings = { uiVersion: 2, bridgesEnabled: true };
  await P.appSystem.update({ where: { id: S }, data: { settings: { crm: baseSettings } } });
  await P.appSystem.update({ where: { id: S2 }, data: { settings: { crm: baseSettings } } });
  const cx = (w: Who, sys = S) => ({ tenantId: T, systemId: sys, actorUserId: w.userId || null });
  // teams (raw — the fixture must not depend on the code under test) · phuket: thana, dao, reader, implicit, nocrm, legacy · krabi: nok (LEAD), kai
  const teamP = (await P.team.create({ data: { tenantId: T, name: `ภูเก็ต ${rand}`, unitIds: [unitP] } })).id as string;
  const teamK = (await P.team.create({ data: { tenantId: T, name: `กระบี่ ${rand}`, unitIds: [unitK], leadUserId: nok.userId } })).id as string;
  for (const w of [thana, dao, reader, implicitU, noneU, legacy]) await P.teamMember.create({ data: { tenantId: T, teamId: teamP, userId: w.userId, role: "MEMBER" } });
  await P.teamMember.create({ data: { tenantId: T, teamId: teamK, userId: nok.userId, role: "LEAD" } });
  await P.teamMember.create({ data: { tenantId: T, teamId: teamK, userId: kai.userId, role: "MEMBER" } });

  type StDef = { name: string; kind: string; probability: number };
  const STD: StDef[] = [
    { name: "ผู้สนใจใหม่", kind: "OPEN", probability: 10 }, { name: "เจรจา", kind: "OPEN", probability: 50 },
    { name: "ชนะ", kind: "WON", probability: 100 }, { name: "แพ้", kind: "LOST", probability: 0 },
  ];
  const mkPipe = async (sys: string, name: string) => {
    const p = (await P.crmPipeline.create({
      data: { tenantId: T, systemId: sys, name: `${name} ${TAG}`, stages: { create: STD.map((s, i) => ({ tenantId: T, systemId: sys, sortOrder: i, ...s })) } },
      include: { stages: true },
    })) as Any;
    return { id: p.id as string, st: [...(p.stages as Any[])].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.id as string) };
  };
  const pMain = await mkPipe(S, "ขาย");
  const pEnt = await mkPipe(S, "ลูกค้าองค์กร");
  const pS2 = await mkPipe(S2, "ขายระบบสอง");
  const mkParty = async (name: string, kind: string, extra: Record<string, Any> = {}) => (await P.party.create({ data: { tenantId: T, name, kind, ...extra } })).id as string;
  const mkCompany = async (name: string, ownerUserId: string | null, teamId: string | null, sys = S) =>
    (await P.crmCompany.create({ data: { tenantId: T, systemId: sys, name, partyId: await mkParty(name, "COMPANY"), ownerUserId, teamId } })).id as string;
  const mkContact = async (name: string, ownerUserId: string | null, teamId: string | null, companyId: string | null = null, sys = S) => {
    const phone = phoneOf();
    const id = (await P.crmContact.create({ data: { tenantId: T, systemId: sys, name, firstName: name, phone, partyId: await mkParty(name, "PERSON", { phone }), ownerUserId, teamId, companyId } })).id as string;
    if (companyId) await P.crmCompanyContact.create({ data: { tenantId: T, companyId, contactId: id, role: "OTHER", isPrimary: true } });
    return id;
  };
  const mkDeal = async (d: { title: string; contactId: string; ownerUserId: string | null; teamId: string | null; pipe?: { id: string; st: string[] }; valueSatang?: number; companyId?: string | null; collaboratorUserIds?: string[]; sys?: string }) => {
    const pipe = d.pipe ?? pMain;
    const row = await P.crmDeal.create({ data: {
      tenantId: T, systemId: d.sys ?? S, pipelineId: pipe.id, stageId: pipe.st[0], contactId: d.contactId, companyId: d.companyId ?? null, title: d.title,
      valueSatang: d.valueSatang ?? 0, kind: "OPEN", ownerUserId: d.ownerUserId, teamId: d.teamId, collaboratorUserIds: d.collaboratorUserIds ?? [],
    } });
    await P.crmDealStageHistory.create({ data: { tenantId: T, dealId: row.id, toStageId: pipe.st[0] } });
    return row.id as string;
  };
  // companies · contacts
  const coP = await mkCompany(`บริษัทภูเก็ต ${rand}`, thana.userId, teamP);
  const coK = await mkCompany(`บริษัท${SECRET_K}`, nok.userId, teamK);
  const coKt = await mkCompany(`บริษัทไม่มีทีม${SECRET_K}`, kai.userId, null);
  const coN = await mkCompany(`บริษัทเจ้าของ ${rand}`, owner.userId, null);
  const kP = await mkContact(`คุณภูเก็ต ${rand}`, thana.userId, teamP, coP);
  const kP2 = await mkContact(`คุณดาว ${rand}`, dao.userId, null);
  const kK = await mkContact(`คุณ${SECRET_K}`, nok.userId, teamK, coK);
  const kK2 = await mkContact(`คุณไก่${SECRET_K}`, kai.userId, teamK);
  const kN = await mkContact(`คุณไม่มีเจ้าของ ${rand}`, null, null);
  // deals of pMain (values chosen so a leaked krabi value is visible in any sum)
  const dP1 = await mkDeal({ title: `ดีลภูเก็ตหนึ่ง ${rand}`, contactId: kP, companyId: coP, ownerUserId: thana.userId, teamId: teamP, valueSatang: 100_000 });
  const dP2 = await mkDeal({ title: `ดีลของดาว ${rand}`, contactId: kP2, ownerUserId: dao.userId, teamId: teamP, valueSatang: 200_000 });
  const dPt = await mkDeal({ title: `ดีลดาวไม่มีทีม ${rand}`, contactId: kP2, ownerUserId: dao.userId, teamId: null, valueSatang: 300_000 });
  const dKc = await mkDeal({ title: `ดีลร่วมกระบี่ ${rand}`, contactId: kP, ownerUserId: kai.userId, teamId: teamK, valueSatang: 400_000, collaboratorUserIds: [thana.userId] });
  const dK1 = await mkDeal({ title: `ดีล${SECRET_K}`, contactId: kK, companyId: coK, ownerUserId: nok.userId, teamId: teamK, valueSatang: 7_000_000 });
  const dK2 = await mkDeal({ title: `ดีลไก่สอง${SECRET_K}`, contactId: kK2, ownerUserId: kai.userId, teamId: teamK, valueSatang: 8_000_000 });
  const dK3 = await mkDeal({ title: `ดีลไก่สาม${SECRET_K}`, contactId: kK2, ownerUserId: kai.userId, teamId: teamK, valueSatang: 9_000_000 });
  const dKt = await mkDeal({ title: `ดีลไก่ไม่มีทีม${SECRET_K}`, contactId: kK2, ownerUserId: kai.userId, teamId: null, valueSatang: 11_000_000 });
  const dN = await mkDeal({ title: `ดีลเจ้าของร้าน ${rand}`, contactId: kN, ownerUserId: owner.userId, teamId: null, valueSatang: 13_000_000 });
  const dKE = await mkDeal({ title: `ดีลองค์กร${SECRET_K}`, contactId: kK2, ownerUserId: kai.userId, teamId: teamK, pipe: pEnt, valueSatang: 17_000_000 });
  const dR: string[] = [];
  for (let i = 0; i < 6; i += 1) dR.push(await mkDeal({ title: `ดีลแข่งโอน${i}${SECRET_K}`, contactId: kK2, ownerUserId: kai.userId, teamId: teamK, pipe: pEnt, valueSatang: 1_000 }));
  const kS2 = await mkContact(`คุณระบบสอง ${rand}`, thana.userId, teamP, null, S2);
  const dS2 = await mkDeal({ title: `ดีลระบบสอง ${rand}`, contactId: kS2, ownerUserId: thana.userId, teamId: teamP, pipe: pS2, sys: S2 });
  const THANA_VISIBLE = [dP1, dP2, dPt, dKc];
  const KRABI = [dK1, dK2, dK3, dKt, dKE, ...dR];
  // activities (window for calendar = Thai day +10 … +17) · notes
  const now = Date.now();
  const w0 = now + 10 * DAY_MS;
  const rawAct = async (data: Record<string, Any>) => (await P.crmActivity.create({ data: { tenantId: T, systemId: S, type: "CALL", startAt: new Date(w0 + DAY_MS), ...data } })).id as string;
  const aP = await rawAct({ title: `โทรภูเก็ต ${rand}`, ownerUserId: thana.userId, dealId: dP1, contactId: kP });
  const aDao = await rawAct({ title: `โทรของดาว ${rand}`, ownerUserId: dao.userId, dealId: dP2, contactId: kP2 });
  const aK = await rawAct({ title: `โทร${SECRET_K}`, ownerUserId: nok.userId, dealId: dK1, contactId: kK });
  const aKai = await rawAct({ title: `โทรไก่${SECRET_K}`, ownerUserId: kai.userId, dealId: dK3, contactId: kK2 });
  const nP = await rawAct({ type: "NOTE", title: `โน้ตภูเก็ต ${rand}`, ownerUserId: thana.userId, dealId: dP1, startAt: null });
  const nK = await rawAct({ type: "NOTE", title: `โน้ต${SECRET_K}`, ownerUserId: nok.userId, dealId: dK1, startAt: null });
  // files (raw FileAsset + CrmFileLink — private path shape of C0.4)
  const mkFile = async (entityId: string, name: string) => {
    const path = `t/${T}/private/${randomBytes(20).toString("hex")}.pdf`;
    const fa = await P.fileAsset.create({ data: { tenantId: T, kind: "ATTACHMENT", path, cdnUrl: `private://${path}`, contentType: "application/pdf", bytes: 12 } });
    return (await P.crmFileLink.create({ data: { tenantId: T, systemId: S, entityType: "DEAL", entityId, fileId: fa.id, name, size: 12, mime: "application/pdf", uploadedById: owner.userId } })).id as string;
  };
  const fP = await mkFile(dP1, `ใบเสนอภูเก็ต-${rand}.pdf`);
  const fK = await mkFile(dK1, `ใบเสนอ${SECRET_K}.pdf`);
  // custom records (object "car", parent CONTACT)
  const objKey = `car${rand}`;
  const obj = await P.customObject.create({ data: { tenantId: T, systemId: S, key: objKey, label: "รถ", labelPlural: "รถ", parentType: "CONTACT", titleFieldKey: "plate" } });
  const recP = (await P.customRecord.create({ data: { tenantId: T, systemId: S, objectId: obj.id, parentType: "CONTACT", parentId: kP, title: `ทะเบียนภูเก็ต ${rand}` } })).id as string;
  const recK = (await P.customRecord.create({ data: { tenantId: T, systemId: S, objectId: obj.id, parentType: "CONTACT", parentId: kK, title: `ทะเบียน${SECRET_K}` } })).id as string;
  // approval policy for crm.reassign (S2.4 · X3.2)
  const reassignPolicy = APR?.createPolicy
    ? await call(APR.createPolicy, { tenantId: T }, { name: `โอนดีลข้ามทีมเกินโควตา ${TAG}`, entityType: "crm.reassign", steps: [{ order: 1, approverRole: "OWNER" }] })
    : ({ ok: false, err: "approval service missing" } as Res);
  const dealRow = (id: string) => P.crmDeal.findFirst({ where: { id: id || NONE } }) as Promise<Any>;
  const actOwner = owner as Any;
  console.log(`[setup] tenant ${T} · S ${S} · S2 ${S2} · kanban ${KAN} · teams P ${teamP} / K ${teamK} · approval policy ${reassignPolicy.ok ? "ok" : reassignPolicy.err}\n`);

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — thana (STAFF, phuket) sees only phuket · krabi GET ⇒ 404 · visible-but-no-key ⇒ 403
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S1 · thana (STAFF ภูเก็ต) ──");
  const cT = cx(thana);
  {
    const r = await call(D.listDeals, cT, thana, { pageSize: 200 });
    const ids = idsOf(r.v);
    chk("C1.7-S1.1", "thana listDeals ⇒ phuket deals (own dP1 · team dP2 · teamless dPt owned by phuket member dao · dKc where he is a collaborator) and NO krabi deal (team krabi, teamless of krabi member kai, enterprise) and not the owner's teamless dN",
      r.ok && hasAll(ids, THANA_VISIBLE) && hasNone(ids, [...KRABI, dN]), "phuket only", `${r.err} seen=${THANA_VISIBLE.filter((x) => ids.has(x)).length}/4 leaked=${[...KRABI, dN].filter((x) => ids.has(x)).length}`);
  }
  {
    const bad = await call(D.getDeal360, cT, thana, dK1);
    const good = await call(D.getDeal360, cT, thana, dP2);
    chk("C1.7-S1.2", "thana getDeal360(krabi deal) ⇒ NOT_FOUND (404-not-403) with a Thai message that echoes nothing of it · getDeal360(phuket colleague's deal) works",
      isNotFound(bad) && thai(bad.msg) && !bad.msg.includes(SECRET_K) && !bad.msg.includes(dK1) && good.ok, "404 · ok", `${bad.err || "accepted"} | ${good.err || "ok"}`);
  }
  {
    const b = await call(D.getBoard, cT, thana, { pipelineId: pMain.id });
    const f = await call(D.forecast, cT, thana, { pipelineId: pMain.id, groupBy: "owner" });
    const bids = boardIds(b.v);
    const rows = ((f.v?.rows ?? f.v ?? []) as Any[]);
    const fCount = rows.reduce((s, x) => s + Number(x?.count ?? 0), 0);
    const fVal = rows.reduce((s, x) => s + Number(x?.valueSatang ?? 0), 0);
    const bSum = ((b.v?.columns ?? []) as Any[]).reduce((s, c) => s + Number(c?.sumSatang ?? 0), 0);
    chk("C1.7-S1.3", "thana getBoard(pMain) cards = exactly his 4 visible deals and the column sums = ฿10,000 (no krabi value) · forecast(pMain) Σcount = 4 · Σvalue = 1,000,000 satang",
      b.ok && f.ok && bids.size === 4 && hasAll(bids, THANA_VISIBLE) && bSum === 1_000_000 && fCount === 4 && fVal === 1_000_000,
      "4 · 1,000,000", `${b.err}${f.err} cards=${bids.size} boardSum=${bSum} fCount=${fCount} fVal=${fVal}`);
  }
  {
    const lc = await call(CT.listContacts, cT, thana, { pageSize: 200 });
    const lco = await call(CO.listCompanies, cT, thana, { pageSize: 200 });
    const gk = await call(CT.getContact360, cT, thana, kK);
    const gc = await call(CO.getCompany360, cT, thana, coK);
    const cIds = idsOf(lc.v);
    const coIds = idsOf(lco.v);
    chk("C1.7-S1.4", "thana listContacts ⇒ kP + kP2 (owned by phuket member) · no krabi contact, no unowned kN · listCompanies ⇒ coP · no krabi company (team or teamless of kai), no owner's coN · getContact360 / getCompany360 of krabi ⇒ NOT_FOUND",
      lc.ok && lco.ok && hasAll(cIds, [kP, kP2]) && hasNone(cIds, [kK, kK2, kN]) && coIds.has(coP) && hasNone(coIds, [coK, coKt, coN]) && isNotFound(gk) && isNotFound(gc) && !`${gk.msg}${gc.msg}`.includes(SECRET_K),
      "phuket only · 404", `${lc.err}${lco.err} contacts=${hasAll(cIds, [kP, kP2])}/${[kK, kK2, kN].filter((x) => cIds.has(x)).length} companies=${coIds.has(coP)}/${[coK, coKt, coN].filter((x) => coIds.has(x)).length} get=${gk.err || "ok"}|${gc.err || "ok"}`);
  }
  {
    const ga = await call(A.getActivity, cT, thana, aK);
    const la = await call(A.listActivities, cT, thana, { pageSize: 200 });
    const lf = await call(F.listFiles, cT, thana, { entityType: "DEAL", entityId: dK1 });
    const gr = await call(OB.records?.get, cT, thana, objKey, recK);
    chk("C1.7-S1.5", "thana: getActivity(krabi) ⇒ NOT_FOUND · listActivities has none of the krabi activities · listFiles(krabi deal) gives nothing · records.get(krabi record) ⇒ NOT_FOUND",
      isNotFound(ga) && la.ok && hasNone(idsOf(la.v), [aK, aKai, nK]) && nothingOf(lf, [fK]) && isNotFound(gr),
      "404 · nothing", `${ga.err || "accepted"} | list=${la.err || [aK, aKai, nK].filter((x) => idsOf(la.v).has(x)).length} | files=${lf.err || idsOf(lf.v).size} | rec=${gr.err || "accepted"}`);
  }
  {
    const before = await dealRow(dP1);
    const up = await call(D.updateDeal, cx(reader), reader, dP1, { title: `แก้โดยผู้อ่าน ${rand}` });
    const upK = await call(D.updateDeal, cx(reader), reader, dK1, { title: `แก้กระบี่ ${rand}` });
    const after = await dealRow(dP1);
    chk("C1.7-S1.6", "visible-but-no-key: a phuket STAFF holding only read keys updates a phuket deal ⇒ FORBIDDEN (403) with a Thai message, row unchanged · the same call on a krabi deal ⇒ NOT_FOUND (404 wins over 403)",
      isForbidden(up) && thai(up.msg) && after?.title === before?.title && isNotFound(upK), "403 · 404", `${up.err || "accepted"} | ${upK.err || "accepted"} title=${after?.title === before?.title ? "same" : "changed"}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X1 — the full matrix (every read family of C1.2b–C1.6 · invisible mutations · kanban · mentions · cross-system · canSee)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X1 · matrix ──");
  {
    const ex = await call(CO.exportCompanies, cT, thana, { confirm: true, reason: "ตรวจการมองเห็น" });
    const opt = await call(CO.companyOptions, cT, thana, { q: "" });
    const g = await call(CO.getCompany360, cT, thana, coP);
    const optIds = new Set(itemsOf(opt.v).map((x: Any) => String(x?.id)));
    const exOk = ex.ok ? !String(ex.v).includes(SECRET_K) && String(ex.v).includes(`บริษัทภูเก็ต ${rand}`) : isForbidden(ex);
    const gDeals = new Set(((g.v?.deals ?? []) as Any[]).map((x: Any) => String(x?.id ?? x?.dealId)));
    chk("C1.7-X1.1", "companies: exportCompanies (refused for lack of key, or a CSV with coP and no krabi text) · companyOptions picker without coK/coKt · getCompany360(coP) works and lists no krabi deal",
      exOk && opt.ok && hasNone(optIds, [coK, coKt]) && g.ok && hasNone(gDeals, KRABI), "no krabi", `export=${ex.err || (String(ex.v).includes(SECRET_K) ? "LEAK" : "clean")} opt=${opt.err || [coK, coKt].filter((x) => optIds.has(x)).length} 360=${g.err || [...gDeals].filter((x) => KRABI.includes(x)).length}`);
  }
  {
    const ex = await call(CT.exportContacts, cT, thana, { confirm: true, reason: "ตรวจการมองเห็น" });
    const opt = await call(CT.contactOptions, cT, thana, { q: "" });
    const g = await call(CT.getContact360, cT, thana, kP);
    const optIds = new Set(itemsOf(opt.v).map((x: Any) => String(x?.id)));
    const exOk = ex.ok ? !String(ex.v).includes(SECRET_K) && String(ex.v).includes(`คุณภูเก็ต ${rand}`) : isForbidden(ex);
    chk("C1.7-X1.2", "contacts: exportContacts (refused, or no krabi row) · contactOptions picker without kK/kK2 · getContact360(kP) works",
      exOk && opt.ok && hasNone(optIds, [kK, kK2]) && g.ok, "no krabi", `export=${ex.err || (String(ex.v).includes(SECRET_K) ? "LEAK" : "clean")} opt=${opt.err || [kK, kK2].filter((x) => optIds.has(x)).length} 360=${g.err || "ok"}`);
  }
  {
    const ex = await call(D.exportDeals, cT, thana, {});
    const exOwner = await call(D.exportDeals, cx(owner), owner, {});
    const ref = await call(D.companyRef, cT, thana, coK);
    const exOk = ex.ok ? !String(ex.v).includes(SECRET_K) && String(ex.v).includes(`ดีลภูเก็ตหนึ่ง ${rand}`) : isForbidden(ex);
    chk("C1.7-X1.3", "deals: exportDeals of thana (refused, or a CSV with dP1 and no krabi title) · [positive control] the owner's export does contain the krabi title · companyRef(krabi company) ⇒ null or NOT_FOUND",
      exOk && exOwner.ok && String(exOwner.v).includes(SECRET_K) && ((ref.ok && !ref.v) || isNotFound(ref)), "no krabi",
      `thana=${ex.err || (String(ex.v).includes(SECRET_K) ? "LEAK" : "clean")} owner=${exOwner.err || String(exOwner.v).includes(SECRET_K)} ref=${ref.err || j(ref.v)}`);
  }
  {
    const from = new Date(w0);
    const to = new Date(w0 + 7 * DAY_MS);
    const cal = await call(A.calendar, cT, thana, { from, to });
    const notesK = await call(A.listNotes, cT, thana, { dealId: dK1 });
    const notesP = await call(A.listNotes, cT, thana, { dealId: dP1 });
    const calIds = idsOf(cal.v);
    chk("C1.7-X1.4", "activities: calendar window has his own CALL and no krabi one · listNotes(krabi deal) gives nothing · listNotes(dP1) has his note",
      cal.ok && calIds.has(aP) && hasNone(calIds, [aK, aKai]) && nothingOf(notesK, [nK]) && notesP.ok && idsOf(notesP.v).has(nP),
      "scoped", `cal=${cal.err || `${calIds.has(aP)}/${[aK, aKai].filter((x) => calIds.has(x)).length}`} notesK=${notesK.err || idsOf(notesK.v).size} notesP=${notesP.err || idsOf(notesP.v).has(nP)}`);
  }
  {
    const lp = await call(F.listFiles, cT, thana, { entityType: "DEAL", entityId: dP1 });
    const fa0 = await P.fileAsset.count({ where: { tenantId: T } });
    const fl0 = await P.crmFileLink.count({ where: { tenantId: T } });
    const puts0 = PUTS.length + STORE_REQ.filter((r) => r.method === "PUT").length;
    const at = await call(F.attachFile, cT, thana, { entityType: "DEAL", entityId: dK1, filename: "ลับ.pdf", contentType: "application/pdf", data: new Uint8Array([37, 80, 68, 70, 45, 49]) }, storageDeps);
    const fa1 = await P.fileAsset.count({ where: { tenantId: T } });
    const fl1 = await P.crmFileLink.count({ where: { tenantId: T } });
    const puts1 = PUTS.length + STORE_REQ.filter((r) => r.method === "PUT").length;
    chk("C1.7-X1.5", "files: listFiles(dP1) has fP · attachFile onto a krabi deal ⇒ NOT_FOUND and nothing stored (no FileAsset, no CrmFileLink, no upload)",
      lp.ok && idsOf(lp.v).has(fP) && isNotFound(at) && fa1 === fa0 && fl1 === fl0 && puts1 === puts0, "404 · nothing",
      `list=${lp.err || idsOf(lp.v).has(fP)} attach=${at.err || "accepted"} assets+${fa1 - fa0} links+${fl1 - fl0} puts+${puts1 - puts0}`);
  }
  {
    const lr = await call(OB.records?.list, cT, thana, objKey, { pageSize: 200 });
    const tl = await call(OB.timelineFor, cT, thana, recK);
    const tb = await call(OB.tabsFor, cT, thana, "CONTACT", kK);
    const rIds = idsOf(lr.v);
    chk("C1.7-X1.6", "records follow their parent: records.list has recP and not recK · timelineFor(recK) ⇒ NOT_FOUND · tabsFor(CONTACT, krabi contact) ⇒ NOT_FOUND",
      lr.ok && rIds.has(recP) && !rIds.has(recK) && isNotFound(tl) && isNotFound(tb), "parent visibility",
      `list=${lr.err || `${rIds.has(recP)}/${rIds.has(recK)}`} timeline=${tl.err || "accepted"} tabs=${tb.err || "accepted"}`);
  }
  {
    const before = { d: await dealRow(dK1), k: await P.crmContact.findFirst({ where: { id: kK } }), c: await P.crmCompany.findFirst({ where: { id: coK } }) };
    const acts0 = await P.crmActivity.count({ where: { tenantId: T, dealId: dK1 } });
    const r = [
      await call(D.updateDeal, cT, thana, dK1, { title: `ยึดดีล ${rand}` }),
      await call(D.moveDeal, cT, thana, dK1, { stageId: pMain.st[1] }),
      await call(CT.updateContact, cT, thana, kK, { firstName: `ยึดผู้ติดต่อ ${rand}` }),
      await call(CO.updateCompany, cT, thana, coK, { name: `ยึดบริษัท ${rand}` }),
      await call(A.logActivity, cT, thana, { type: "CALL", title: `แอบบันทึก ${rand}`, dealId: dK1 }),
    ];
    const after = { d: await dealRow(dK1), k: await P.crmContact.findFirst({ where: { id: kK } }), c: await P.crmCompany.findFirst({ where: { id: coK } }) };
    const acts1 = await P.crmActivity.count({ where: { tenantId: T, dealId: dK1 } });
    chk("C1.7-X1.7", "mutations on invisible rows (updateDeal · moveDeal · updateContact · updateCompany · logActivity on a krabi deal) ⇒ NOT_FOUND each, no message echoes krabi data, rows unchanged, no activity added",
      r.every(isNotFound) && r.every((x) => !x.msg.includes(SECRET_K)) && after.d?.title === before.d?.title && after.d?.stageId === before.d?.stageId && after.k?.firstName === before.k?.firstName && after.c?.name === before.c?.name && acts1 === acts0,
      "5 × 404", `${r.map((x) => x.code || "accepted").join(",")} activities+${acts1 - acts0}`);
  }
  {
    // kanban board (raw) where thana is EDITOR · card linked to a krabi deal and a phuket deal (created as the owner, through the one door)
    const board = await P.kanbanBoard.create({ data: { tenantId: T, systemId: KAN, name: `งานขาย ${TAG}`, createdById: owner.userId } });
    for (const [i, n] of ["รอทำ", "กำลังทำ", "เสร็จ"].entries()) await P.kanbanColumn.create({ data: { tenantId: T, systemId: KAN, boardId: board.id, name: n, sortOrder: i, position: `a${i}` } });
    await P.kanbanBoardMember.create({ data: { tenantId: T, boardId: board.id, userId: thana.userId, role: "EDITOR" } });
    const kOwner = { tenantId: T, systemId: KAN, actorUserId: owner.userId };
    const c = await call(KL.createCardFromExternal, kOwner, {
      boardId: board.id, title: `การ์ดลิงก์ ${rand}`, sourceType: "MANUAL", sourceKey: `${TAG}:vis`,
      links: [{ linkType: "DEAL", linkId: dK1, role: "RELATED" }, { linkType: "DEAL", linkId: dP1, role: "RELATED" }],
    });
    const cardId = String(c.v?.cardId ?? c.v?.id ?? "");
    const kThana = { tenantId: T, systemId: KAN, actorUserId: thana.userId };
    const kActor = { userId: thana.userId, role: "STAFF", unitAccess: ["*"], permissions: thana.permissions };
    const l = cardId ? await call(KR.listCardLinks, kThana, kActor, cardId) : ({ ok: false, err: `card not created: ${c.err}` } as Res);
    const links = (l.ok ? (l.v as Any[]) : []) ?? [];
    const kL = links.find((x) => x?.linkId === dK1);
    const pL = links.find((x) => x?.linkId === dP1);
    chk("C1.7-X1.8", "kanban link resolver respects visibility (C1.6 surface): for thana the krabi DEAL link shows canView false · no deal title · href null — the phuket DEAL link shows its title and href",
      l.ok && !!kL && kL.canView === false && !String(kL.title ?? "").includes(SECRET_K) && !j(kL).includes(SECRET_K) && kL.href == null && !!pL && pL.canView === true && String(pL.title) === `ดีลภูเก็ตหนึ่ง ${rand}` && !!pL.href,
      "hidden · shown", `${l.err || "ok"} krabi=${kL ? `${kL.canView}/${cut(kL.title, 40)}/${kL.href}` : "-"} phuket=${pL ? `${pL.canView}/${cut(pL.title, 40)}` : "-"}`);
  }
  {
    const n = (userId: string) => P.appNotification.count({ where: { tenantId: T, recipientUserId: userId } }) as Promise<number>;
    const b = { thana: await n(thana.userId), nok: await n(nok.userId), mgr: await n(mgr.userId) };
    const r = await call(A.logActivity, cx(owner), owner, { type: "NOTE", title: `คอมเมนต์${SECRET_K}`, body: "@ธนา @นก @ผู้จัดการ", dealId: dK1, mentions: [thana.userId, nok.userId, mgr.userId] });
    const a = { thana: await n(thana.userId), nok: await n(nok.userId), mgr: await n(mgr.userId) };
    const id = String(r.v?.id ?? r.v?.activity?.id ?? "");
    const row = id ? await P.crmActivity.findFirst({ where: { id } }) : null;
    const kept = (row?.mentions ?? []) as string[];
    chk("C1.7-X1.9", "mention notifications follow THIS visibility: a NOTE on a krabi deal mentioning thana · nok · manager ⇒ +1 for nok (LEAD krabi) and the manager, +0 for thana (same shop, other team) · mentions[] keeps nok + manager only",
      r.ok && a.nok - b.nok === 1 && a.mgr - b.mgr === 1 && a.thana === b.thana && kept.includes(nok.userId) && kept.includes(mgr.userId) && !kept.includes(thana.userId),
      "nok+1 mgr+1 thana+0", `${r.err || "ok"} nok+${a.nok - b.nok} mgr+${a.mgr - b.mgr} thana+${a.thana - b.thana} kept=${kept.length}`);
  }
  {
    const g = await call(D.getDeal360, cx(thana, S2), thana, dP1);
    const lS2 = await call(D.listDeals, cx(thana, S2), thana, { pageSize: 200 });
    const polS2 = await call(pol.set, cx(owner, S2), owner, { role: "STAFF", entity: "DEAL", visibility: "ALL" });
    const inS = await call(D.listDeals, cT, thana, { pageSize: 200 });
    const rv = await call(V.resolve, cT, thana, "DEAL", { pipelineId: pMain.id });
    const badPipe = await call(pol.set, cx(owner), owner, { teamId: teamP, pipelineId: pS2.id, entity: "DEAL", visibility: "ALL" });
    const badTeam = await call(pol.set, cx(owner), owner, { teamId: `${TAG}-foreign-team`, entity: "DEAL", visibility: "ALL" });
    const rows = await P.crmVisibilityPolicy.count({ where: { tenantId: T, systemId: S } });
    await P.crmVisibilityPolicy.deleteMany({ where: { tenantId: T } });
    const vS = String(rv.v?.visibility ?? rv.v ?? "");
    chk("C1.7-X1.10", "cross-system (same shop): a deal of S read through ctx S2 ⇒ NOT_FOUND · S2's list has its own deal only · a policy on S2 (STAFF DEAL ALL) changes nothing in S (resolve TEAM · still no krabi) · a policy naming S2's pipeline or an unknown team ⇒ refused, no row in S",
      isNotFound(g) && lS2.ok && idsOf(lS2.v).has(dS2) && !idsOf(lS2.v).has(dP1) && polS2.ok && inS.ok && hasNone(idsOf(inS.v), KRABI) && vS === "TEAM" &&
        (isNotFound(badPipe) || isValidation(badPipe)) && (isNotFound(badTeam) || isValidation(badTeam)) && rows === 0,
      "isolated", `get=${g.err || "accepted"} s2=${lS2.err || idsOf(lS2.v).has(dS2)} polS2=${polS2.err || "ok"} leakInS=${KRABI.filter((x) => idsOf(inS.v).has(x)).length} resolve=${vS || rv.err} badPipe=${badPipe.err || "accepted"} badTeam=${badTeam.err || "accepted"} rowsS=${rows}`);
  }
  {
    const sK = await call(V.canSee, cT, thana, "DEAL", dK1);
    const sP = await call(V.canSee, cT, thana, "DEAL", dP2);
    const w = await call(V.visibleWhere, cT, thana, "DEAL");
    const n = w.ok && w.v ? await P.crmDeal.count({ where: { AND: [w.v, { tenantId: T }] } }).catch(() => -1) : -1;
    const nk = w.ok && w.v ? await P.crmDeal.count({ where: { AND: [w.v, { id: { in: KRABI } }] } }).catch(() => -1) : -1;
    chk("C1.7-X1.11", "canSee(thana, DEAL, krabi) = false · canSee(thana, DEAL, dP2) = true · visibleWhere(thana, DEAL) used as a raw Prisma where counts exactly his 4 deals of S (0 krabi)",
      sK.ok && sK.v === false && sP.ok && sP.v === true && n === 4 && nk === 0, "false · true · 4", `${sK.err || sK.v} ${sP.err || sP.v} count=${n} krabi=${nk} ${w.err}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — OWNER = ALL · MANAGER unit scope
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S4 · OWNER / MANAGER ──");
  const ALL_S = [...THANA_VISIBLE, ...KRABI, dN];
  {
    await P.crmVisibilityPolicy.create({ data: { tenantId: T, systemId: S, role: "OWNER", entity: "DEAL", visibility: "OWN" } });
    const r = await call(D.listDeals, cx(owner), owner, { pageSize: 200 });
    const rv = await Promise.all(["CONTACT", "COMPANY", "DEAL", "ACTIVITY", "REPORT"].map((e) => call(V.resolve, cx(owner), owner, e, {})));
    await P.crmVisibilityPolicy.deleteMany({ where: { tenantId: T } });
    const vals = rv.map((x) => String(x.v?.visibility ?? x.v ?? x.err));
    chk("C1.7-S4.1", "OWNER = ALL always: resolve = ALL for all 5 entities even while a policy row says role OWNER → OWN · listDeals has every deal of S (both teams, teamless, other pipeline)",
      vals.every((v) => v === "ALL") && r.ok && hasAll(idsOf(r.v), ALL_S), "ALL", `${vals.join(",")} list=${r.err || `${ALL_S.filter((x) => idsOf(r.v).has(x)).length}/${ALL_S.length}`}`);
  }
  {
    const r = await call(D.listDeals, cx(mgr), mgr, { pageSize: 200 });
    const rc = await call(CT.listContacts, cx(mgr), mgr, { pageSize: 200 });
    const rv = await call(V.resolve, cx(mgr), mgr, "DEAL", {});
    chk("C1.7-S4.2", "MANAGER (unitAccess *) = ALL: resolve DEAL = ALL · listDeals has every deal · listContacts has contacts of both teams and the unowned one",
      String(rv.v?.visibility ?? rv.v) === "ALL" && r.ok && hasAll(idsOf(r.v), ALL_S) && rc.ok && hasAll(idsOf(rc.v), [kP, kP2, kK, kK2, kN]), "ALL",
      `resolve=${rv.err || j(rv.v)} deals=${r.err || ALL_S.filter((x) => idsOf(r.v).has(x)).length} contacts=${rc.err || [kP, kP2, kK, kK2, kN].filter((x) => idsOf(rc.v).has(x)).length}`);
  }
  {
    const r = await call(D.listDeals, cx(mgrP), mgrP, { pageSize: 200 });
    const g = await call(D.getDeal360, cx(mgrP), mgrP, dK1);
    const ids = idsOf(r.v);
    chk("C1.7-S4.3", "MANAGER restricted to the phuket unit: ALL within unit scope ⇒ phuket-team deals + teamless deals (dN) · no deal of the krabi team (unit krabi) · getDeal360(krabi) ⇒ NOT_FOUND",
      r.ok && hasAll(ids, [dP1, dP2, dN]) && hasNone(ids, [dK1, dK2, dK3, dKE]) && isNotFound(g), "unit scope", `${r.err} in=${[dP1, dP2, dN].filter((x) => ids.has(x)).length}/3 krabi=${[dK1, dK2, dK3, dKE].filter((x) => ids.has(x)).length} get=${g.err || "accepted"}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 — implicit read (humans only) · S6 — the 6 legacy keys
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S5 · implicit read ── S6 · legacy keys ──");
  {
    const cI = cx(implicitU);
    const d = await call(D.listDeals, cI, implicitU, { pageSize: 200 });
    const c = await call(CT.listContacts, cI, implicitU, { pageSize: 200 });
    const a = await call(A.listActivities, cI, implicitU, { pageSize: 200 });
    chk("C1.7-S5.1", "implicit read: a phuket STAFF holding ONLY crm.activity.create reads deals (dP1) · contacts (kP) · activities (list ok) — any crm.* key ⇒ contact/deal/activity read · still nothing of krabi",
      d.ok && idsOf(d.v).has(dP1) && hasNone(idsOf(d.v), KRABI) && c.ok && idsOf(c.v).has(kP) && a.ok, "reads", `${d.err || idsOf(d.v).has(dP1)} ${c.err || idsOf(c.v).has(kP)} ${a.err || "ok"}`);
  }
  {
    const cN = cx(noneU);
    const d = await call(D.listDeals, cN, noneU, { pageSize: 200 });
    const g = await call(D.getDeal360, cN, noneU, dP1);
    const c = await call(CT.listContacts, cN, noneU, { pageSize: 200 });
    chk("C1.7-S5.2", "no crm.* key at all (a phuket STAFF with member.customer.read only) ⇒ gets nothing: listDeals / listContacts refused or empty · getDeal360(dP1) ⇒ NOT_FOUND|FORBIDDEN",
      nothingOf(d, [dP1, dP2]) && isDenied(g) && nothingOf(c, [kP, kP2]), "nothing", `${d.err || idsOf(d.v).size} ${g.err || "accepted"} ${c.err || idsOf(c.v).size}`);
  }
  {
    const defs = new Map(((PM.PERMISSIONS ?? []) as Any[]).map((p) => [String(p.key), p]));
    const regOk = LEGACY_6.every((k) => defs.get(k)?.module === "crm" && thai(defs.get(k)?.label) && PM.isPermissionKey?.(k) === true) && PM.isPermissionKey?.("crm.*") === true;
    const ev = typeof RB.evaluate === "function"
      && RB.evaluate({ role: "STAFF", unitAccess: ["*"], permissions: { "crm.deal.move": true } }, { module: "crm", action: "crm.deal.move" }) === true
      && RB.evaluate({ role: "STAFF", unitAccess: ["*"], permissions: { "crm.*": true } }, { module: "crm", action: "crm.deal.reassign" }) === true
      && RB.evaluate({ role: "STAFF", unitAccess: ["*"], permissions: { "crm.deal.move": true } }, { module: "crm", action: "crm.deal.delete" }) === false;
    chk("C1.7-S6.1", "the 6 existing keys keep their exact strings, module crm, Thai labels · `crm.*` stays a valid wildcard · rbac.evaluate unchanged (crm.deal.move ⇒ move · crm.* ⇒ any crm action · move ⇏ delete)",
      regOk && ev, "unchanged", `registry=${regOk} evaluate=${ev}`, "MAJOR");
  }
  {
    const cL = cx(legacy);
    const cr = await call(D.createDeal, cL, legacy, { pipelineId: pMain.id, title: `ดีลคีย์เดิม ${rand}`, contactId: kP });
    const id = String(cr.v?.id ?? cr.v?.deal?.id ?? "");
    const mv = id ? await call(D.moveDeal, cL, legacy, id, { stageId: pMain.st[1] }) : ({ ok: false, err: "no deal" } as Res);
    const row = id ? await dealRow(id) : null;
    chk("C1.7-S6.2", "a phuket STAFF holding only the 6 legacy keys still works: createDeal (contact kP, phuket) ⇒ ok · moveDeal to stage 2 ⇒ ok (implicit read + crm.deal.move)",
      cr.ok && mv.ok && row?.stageId === pMain.st[1], "create + move", `${cr.err || "ok"} | ${mv.err || "ok"} stage=${row?.stageId === pMain.st[1]}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X2 — API-key actors (no implicit read · read scope cannot mutate · filter pseudo-scopes R-C.3)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X2 · API-key actors ──");
  const keyActor = (scopes: string[], apiRole: string): Who => ({ userId: "", role: apiRole === "ADMIN" ? "MANAGER" : "STAFF", unitAccess: ["*"], permissions: perms(scopes), apiRole, keyId: `${TAG}-key-${apiRole}` });
  const cKey = { tenantId: T, systemId: S, actorUserId: null };
  {
    const k = keyActor(["member.customer.read"], "READONLY");
    const d = await call(D.listDeals, cKey, k, { pageSize: 200 });
    const c = await call(CT.listContacts, cKey, k, { pageSize: 200 });
    const co = await call(CO.listCompanies, cKey, k, { pageSize: 200 });
    const g = await call(D.getDeal360, cKey, k, dP1);
    chk("C1.7-X2.1", "a key with no crm.* scope gets NOTHING: listDeals / listContacts / listCompanies refused or empty · getDeal360 ⇒ NOT_FOUND|FORBIDDEN",
      nothingOf(d, [...THANA_VISIBLE, ...KRABI]) && nothingOf(c, [kP, kK]) && nothingOf(co, [coP, coK]) && isDenied(g), "nothing",
      `${d.err || idsOf(d.v).size} ${c.err || idsOf(c.v).size} ${co.err || idsOf(co.v).size} ${g.err || "accepted"}`);
  }
  {
    const k = keyActor(["crm.activity.create"], "OPERATE");
    const d = await call(D.listDeals, cKey, k, { pageSize: 200 });
    const c = await call(CT.listContacts, cKey, k, { pageSize: 200 });
    chk("C1.7-X2.2", "NO implicit read for keys: a key holding crm.activity.create (a human with the same key reads — S5.1) gets nothing from listDeals / listContacts",
      nothingOf(d, [...THANA_VISIBLE, ...KRABI]) && nothingOf(c, [kP, kK]), "nothing", `${d.err || idsOf(d.v).size} ${c.err || idsOf(c.v).size}`);
  }
  {
    const k = keyActor(["crm.deal.read", "crm.contact.read"], "READONLY");
    const d = await call(D.listDeals, cKey, k, { pageSize: 200 });
    const before = await dealRow(dP1);
    const up = await call(D.updateDeal, cKey, k, dP1, { title: `คีย์แก้ ${rand}` });
    const n0 = await P.crmContact.count({ where: { tenantId: T } });
    const cr = await call(CT.createContact, cKey, k, { firstName: `คีย์สร้าง ${rand}`, phone: phoneOf() });
    const n1 = await P.crmContact.count({ where: { tenantId: T } });
    const after = await dealRow(dP1);
    chk("C1.7-X2.3", "a read-scope key sees the shop (ALL: dP1 and dK1) but cannot mutate: updateDeal ⇒ FORBIDDEN (row unchanged) · createContact ⇒ FORBIDDEN (no row)",
      d.ok && hasAll(idsOf(d.v), [dP1, dK1]) && isForbidden(up) && after?.title === before?.title && isForbidden(cr) && n1 === n0, "read only",
      `list=${d.err || `${idsOf(d.v).has(dP1)}/${idsOf(d.v).has(dK1)}`} update=${up.err || "accepted"} create=${cr.err || "accepted"} contacts+${n1 - n0}`);
  }
  {
    const kt = keyActor(["crm.deal.read", `crm.filter.team:${teamK}`], "READONLY");
    const ko = keyActor(["crm.deal.read", `crm.filter.owner:${dao.userId}`], "READONLY");
    const t = await call(D.listDeals, cKey, kt, { pageSize: 200 });
    const o = await call(D.listDeals, cKey, ko, { pageSize: 200 });
    const tIds = idsOf(t.v);
    const oIds = idsOf(o.v);
    chk("C1.7-X2.4", "R-C.3 key filters honoured inside visibleWhere: `crm.filter.team:<krabi>` ⇒ only teamId-krabi deals (dK1 yes · dP1 / dKt no) · `crm.filter.owner:<dao>` ⇒ only dao's deals (dP2 · dPt)",
      t.ok && tIds.has(dK1) && !tIds.has(dP1) && !tIds.has(dKt) && o.ok && oIds.size === 2 && hasAll(oIds, [dP2, dPt]), "filtered",
      `team=${t.err || `${tIds.has(dK1)}/${tIds.has(dP1)}/${tIds.has(dKt)}`} owner=${o.err || [...oIds].length}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — policies: pipeline+team > team > role > settings > default C9
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3 · policies ──");
  const vis = async (w: Who, e: string, pipelineId?: string) => {
    const r = await call(V.resolve, cx(w), w, e, pipelineId ? { pipelineId } : {});
    return r.ok ? String(r.v?.visibility ?? r.v) : `ERR:${r.code || r.err}`;
  };
  const cO = cx(owner);
  const polIdOf = (r: Res) => String(r.v?.id ?? r.v?.policy?.id ?? "");
  const AUDIT_POL: string[] = [];
  {
    const p1 = await call(pol.set, cO, owner, { role: "STAFF", teamId: teamP, pipelineId: pEnt.id, entity: "DEAL", visibility: "ALL" });
    AUDIT_POL.push(polIdOf(p1));
    const vEnt = await vis(thana, "DEAL", pEnt.id);
    const vMain = await vis(thana, "DEAL", pMain.id);
    const l = await call(D.listDeals, cT, thana, { pageSize: 200 });
    const g = await call(D.getDeal360, cT, thana, dKE);
    const ids = idsOf(l.v);
    chk("C1.7-S3.1", "policy (role STAFF · team phuket · pipeline ลูกค้าองค์กร · DEAL · ALL) overrides the default for that pipeline only: resolve(thana, pEnt) = ALL · resolve(thana, pMain) = TEAM · listDeals now has the krabi enterprise deal dKE (+ race deals of pEnt) but still not dK1 · getDeal360(dKE) works",
      p1.ok && vEnt === "ALL" && vMain === "TEAM" && l.ok && ids.has(dKE) && !ids.has(dK1) && !ids.has(dK2) && g.ok, "pipeline override",
      `${p1.err || "set"} ent=${vEnt} main=${vMain} list=${l.err || `${ids.has(dKE)}/${ids.has(dK1)}`} get=${g.err || "ok"}`);
  }
  {
    const p2 = await call(pol.set, cO, owner, { teamId: teamP, entity: "DEAL", visibility: "OWN" });
    AUDIT_POL.push(polIdOf(p2));
    const vMain = await vis(thana, "DEAL", pMain.id);
    const vEnt = await vis(thana, "DEAL", pEnt.id);
    const l = await call(D.listDeals, cT, thana, { pageSize: 200 });
    const ids = idsOf(l.v);
    const rm = await call(pol.remove, cO, owner, polIdOf(p2));
    const vBack = await vis(thana, "DEAL", pMain.id);
    const l2 = await call(D.listDeals, cT, thana, { pageSize: 200 });
    chk("C1.7-S3.2", "team policy (phuket · DEAL · OWN) beats the role default: resolve(thana, pMain) = OWN ⇒ dP1 (own) + dKc (collaborator) only, dao's dP2 gone · pipeline+team still wins for pEnt (ALL) · removing it ⇒ TEAM again, dP2 back",
      p2.ok && vMain === "OWN" && vEnt === "ALL" && l.ok && ids.has(dP1) && ids.has(dKc) && !ids.has(dP2) && !ids.has(dPt) && rm.ok && vBack === "TEAM" && l2.ok && idsOf(l2.v).has(dP2),
      "team > role", `${p2.err || "set"} main=${vMain} ent=${vEnt} own=${ids.has(dP1)}/${ids.has(dKc)} dao=${ids.has(dP2)} remove=${rm.err || "ok"} back=${vBack}/${idsOf(l2.v).has(dP2)}`);
  }
  {
    await P.appSystem.update({ where: { id: S }, data: { settings: { crm: { ...baseSettings, visibility: { STAFF: "OWN", MANAGER: "ALL" } } } } });
    const vSettings = await vis(thana, "CONTACT");
    const p3 = await call(pol.set, cO, owner, { role: "STAFF", entity: "CONTACT", visibility: "TEAM" });
    AUDIT_POL.push(polIdOf(p3));
    const vRole = await vis(thana, "CONTACT");
    const again = await call(pol.set, cO, owner, { role: "STAFF", entity: "CONTACT", visibility: "TEAM" });
    const dup = await P.crmVisibilityPolicy.count({ where: { tenantId: T, systemId: S, role: "STAFF", teamId: null, pipelineId: null, entity: "CONTACT" } });
    await call(pol.remove, cO, owner, polIdOf(p3));
    await P.appSystem.update({ where: { id: S }, data: { settings: { crm: baseSettings } } });
    const vDefault = await vis(thana, "CONTACT");
    const vActThana = await vis(thana, "ACTIVITY");
    const vActNok = await vis(nok, "ACTIVITY");
    const la = await call(A.listActivities, cT, thana, { pageSize: 200 });
    const ln = await call(A.listActivities, cx(nok), nok, { pageSize: 200 });
    chk("C1.7-S3.3", "chain role > settings > default: settings.crm.visibility.STAFF = OWN ⇒ CONTACT OWN · a role policy (STAFF · CONTACT · TEAM) beats settings ⇒ TEAM (set twice = 1 row) · both removed ⇒ default C9 TEAM · ACTIVITY default: STAFF thana OWN (no dao activity) · LEAD nok TEAM (sees kai's)",
      vSettings === "OWN" && p3.ok && vRole === "TEAM" && again.ok && dup === 1 && vDefault === "TEAM" && vActThana === "OWN" && vActNok === "TEAM" &&
        la.ok && idsOf(la.v).has(aP) && !idsOf(la.v).has(aDao) && ln.ok && hasAll(idsOf(ln.v), [aK, aKai]) && !idsOf(ln.v).has(aP),
      "chain", `settings=${vSettings} role=${vRole} dup=${dup} default=${vDefault} act=${vActThana}/${vActNok} thanaActs=${la.err || `${idsOf(la.v).has(aP)}/${idsOf(la.v).has(aDao)}`} nokActs=${ln.err || `${idsOf(ln.v).has(aK)}/${idsOf(ln.v).has(aKai)}`}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X9 — policy changes gated + audited · team changes audited
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X9 · audit + gates ──");
  {
    const n0 = await P.crmVisibilityPolicy.count({ where: { tenantId: T } });
    const m = await call(pol.set, cx(mgr), mgr, { role: "STAFF", entity: "COMPANY", visibility: "ALL" });
    const s = await call(pol.set, cT, thana, { role: "STAFF", entity: "COMPANY", visibility: "ALL" });
    const n1 = await P.crmVisibilityPolicy.count({ where: { tenantId: T } });
    const aud = (await P.auditLog.findMany({ where: { tenantId: T, action: { startsWith: "crm.visibility" } } })) as Any[];
    const setAud = aud.filter((x) => x.actorId === owner.userId && AUDIT_POL.includes(String(x.targetId)));
    const rmAud = aud.filter((x) => /remove|delete|ลบ/i.test(String(x.action)));
    chk("C1.7-X9.1", "policies need crm.visibility.manage: MANAGER (not granted) and STAFF ⇒ FORBIDDEN (Thai), no row · every set/remove by the owner left AuditLog `crm.visibility.*` (actorId, targetId = the policy) incl. the removals",
      isForbidden(m) && thai(m.msg) && isForbidden(s) && n1 === n0 && setAud.length >= 3 && rmAud.length >= 2, "gated · audited",
      `mgr=${m.err || "accepted"} staff=${s.err || "accepted"} rows+${n1 - n0} audit=${aud.length} set=${setAud.length} removed=${rmAud.length}`, "MAJOR");
  }
  await P.crmVisibilityPolicy.deleteMany({ where: { tenantId: T } });

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — nok (LEAD krabi) · reassign out of the team · cross-team key + daily cap → approval crm.reassign
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2 · nok (LEAD กระบี่) ──");
  const cN = cx(nok);
  {
    const r = await call(D.listDeals, cN, nok, { pageSize: 200 });
    const ids = idsOf(r.v);
    chk("C1.7-S2.1", "nok (LEAD krabi) listDeals ⇒ every krabi-team deal + kai's teamless dKt · none of phuket's (dP1 · dP2 · dPt) nor the owner's dN",
      r.ok && hasAll(ids, [dK1, dK2, dK3, dKt, dKE, dKc]) && hasNone(ids, [dP1, dP2, dPt, dN]), "krabi only", `${r.err} in=${[dK1, dK2, dK3, dKt, dKE, dKc].filter((x) => ids.has(x)).length}/6 phuket=${[dP1, dP2, dPt, dN].filter((x) => ids.has(x)).length}`);
  }
  {
    const cA = await call(CT.listContacts, cN, nok, { pageSize: 200 });
    const la = await call(A.listActivities, cN, nok, { pageSize: 200 });
    chk("C1.7-S2.2", "nok sees her team's contacts (kK · kK2) and her member kai's activities (LEAD ⇒ ACTIVITY TEAM) · nothing of phuket (kP · aP · aDao)",
      cA.ok && hasAll(idsOf(cA.v), [kK, kK2]) && !idsOf(cA.v).has(kP) && la.ok && hasAll(idsOf(la.v), [aK, aKai]) && hasNone(idsOf(la.v), [aP, aDao]), "team",
      `${cA.err || `${hasAll(idsOf(cA.v), [kK, kK2])}/${idsOf(cA.v).has(kP)}`} ${la.err || `${hasAll(idsOf(la.v), [aK, aKai])}/${[aP, aDao].filter((x) => idsOf(la.v).has(x)).length}`}`);
  }
  {
    const re = await call(D.reassignDeal, cN, nok, dK2, { ownerUserId: thana.userId, teamId: teamP });
    const row = await dealRow(dK2);
    const g = await call(D.getDeal360, cN, nok, dK2);
    const l = await call(D.listDeals, cN, nok, { pageSize: 200 });
    const t = await call(D.getDeal360, cT, thana, dK2);
    const ev = await P.outboxEvent.count({ where: { tenantId: T, type: "crm.deal.reassigned", idempotencyKey: { startsWith: `crm.deal.reassigned#${dK2}` } } });
    chk("C1.7-S2.3", "nok reassigns dK2 out of krabi (→ thana · team phuket, under her cap of 1) ⇒ applied (owner thana, teamId phuket, crm.deal.reassigned) · on her next call getDeal360(dK2) ⇒ NOT_FOUND and listDeals no longer has it · thana now opens it",
      re.ok && !isApproval(re.v) && row?.ownerUserId === thana.userId && row?.teamId === teamP && ev === 1 && isNotFound(g) && l.ok && !idsOf(l.v).has(dK2) && t.ok,
      "gone for nok", `${re.err || (isApproval(re.v) ? "APPROVAL" : "ok")} owner=${row?.ownerUserId === thana.userId} team=${row?.teamId === teamP} ev=${ev} nokGet=${g.err || "accepted"} nokList=${idsOf(l.v).has(dK2)} thana=${t.err || "ok"}`);
  }
  {
    const b1 = await dealRow(dP1);
    const noKey = await call(D.reassignDeal, cT, thana, dP1, { ownerUserId: nok.userId, teamId: teamK });
    const a1 = await dealRow(dP1);
    const b3 = await dealRow(dK3);
    const over = await call(D.reassignDeal, cN, nok, dK3, { ownerUserId: thana.userId, teamId: teamP });
    const a3 = await dealRow(dK3);
    const req = (await P.approvalRequest.findMany({ where: { tenantId: T, entityType: "crm.reassign" } })) as Any[];
    const mine = req.filter((x) => String(x.entityId).startsWith(dK3));
    const flagged = (over.ok && isApproval(over.v)) || over.code === "APPROVAL_REQUIRED" || !!over.extra?.approvalRequestId;
    chk("C1.7-S2.4", "cross-team reassign needs crm.deal.reassign: thana (no key) moving dP1 to krabi ⇒ FORBIDDEN (Thai), unchanged · nok's 2nd cross-team reassign of the day (cap crm._maxReassignPerDay = 1, policy crm.reassign present) ⇒ APPROVAL_REQUIRED + ApprovalRequest(crm.reassign, PENDING, entityId <dK3>…) and dK3 unchanged",
      reassignPolicy.ok && isForbidden(noKey) && thai(noKey.msg) && a1?.ownerUserId === b1?.ownerUserId && a1?.teamId === b1?.teamId &&
        flagged && mine.length === 1 && mine[0]?.status === "PENDING" && a3?.ownerUserId === b3?.ownerUserId && a3?.teamId === b3?.teamId,
      "403 · approval", `policy=${reassignPolicy.ok} thana=${noKey.err || "accepted"} over=${over.err || j(over.v)?.slice(0, 80)} requests=${mine.length}/${mine[0]?.status ?? "-"} dK3=${a3?.ownerUserId === b3?.ownerUserId ? "unchanged" : "CHANGED"}`);
  }
  {
    const aud = (await P.auditLog.findMany({ where: { tenantId: T, targetId: dK2, action: { contains: "reassign" } } })) as Any[];
    chk("C1.7-X9.2", "the applied reassign is audited (AuditLog crm.deal.reassign on dK2 with actor nok, before/after owner)", aud.some((x) => x.actorId === nok.userId), "audit row", `rows=${aud.length} actors=${aud.map((x) => x.actorId === nok.userId ? "nok" : x.actorId).join(",")}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X3 — races on separate connections (worker PROCESSES): policy upsert · the daily reassign counter
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X3 · races (worker processes) ──");
  const runWorkers = async (jobs: [string, string, Any][]): Promise<{ outs: string[][]; spawned: boolean }> => {
    const startAt = Date.now() + 45_000;
    const outs = await Promise.all(jobs.map(([mode, userId, arg]) => new Promise<string>((resolve) => {
      const enc = Buffer.from(JSON.stringify(arg), "utf8").toString("base64url");
      const ch = spawn("pnpm", ["exec", "tsx", THIS_FILE, "--x3-worker", mode, T, S, userId, String(startAt), enc], { env: process.env });
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
  {
    const input = { role: "STAFF", entity: "COMPANY" };
    const w = await runWorkers([0, 1, 2].map(() => ["policy", owner.userId, { actor: actOwner, n: 4, input }] as [string, string, Any]));
    const flat = w.outs.flat();
    const rows = await P.crmVisibilityPolicy.count({ where: { tenantId: T, systemId: S, role: "STAFF", teamId: null, pipelineId: null, entity: "COMPANY" } });
    const bad = flat.filter((x) => x !== "OK" && !/^ERR:CONFLICT/.test(x));
    chk("C1.7-X3.1", "12 parallel policies.set of the same NULL-bearing key (role STAFF · no team · no pipeline · COMPANY) from 3 processes ⇒ exactly ONE CrmVisibilityPolicy row (the unique index cannot stop NULL duplicates — the service must) · every call ok or CONFLICT, none crashes",
      w.spawned && flat.length === 12 && rows === 1 && bad.length === 0, "1 row", `spawned=${w.spawned} calls=${flat.length} rows=${rows} bad=${cut(bad.slice(0, 2).join(" | "), 200)}`);
    await P.crmVisibilityPolicy.deleteMany({ where: { tenantId: T } });
  }
  {
    const jobs: [string, string, Any][] = [dR.slice(0, 2), dR.slice(2, 4), dR.slice(4, 6)].map((ids) => ["reassign", kai.userId, { actor: kai, dealIds: ids, ownerUserId: thana.userId, teamId: teamP }]);
    const w = await runWorkers(jobs);
    const flat = w.outs.flat();
    const rows = (await P.crmDeal.findMany({ where: { id: { in: dR } } })) as Any[];
    const applied = rows.filter((r) => r.ownerUserId === thana.userId && r.teamId === teamP).length;
    const untouched = rows.filter((r) => r.ownerUserId === kai.userId && r.teamId === teamK).length;
    const reqs = ((await P.approvalRequest.findMany({ where: { tenantId: T, entityType: "crm.reassign" } })) as Any[]).filter((x) => dR.some((d) => String(x.entityId).startsWith(d)));
    chk("C1.7-X3.2", "the daily cross-team counter is exact under races: kai (cap 2) fires 6 cross-team reassigns from 3 processes at once ⇒ exactly 2 applied · 4 APPROVAL_REQUIRED with 4 PENDING crm.reassign requests · the other 4 deals untouched (no half-applied row)",
      w.spawned && applied === 2 && untouched === 4 && reqs.length === 4 && reqs.every((x) => x.status === "PENDING") && flat.filter((x) => x === "OK").length === 2 && flat.filter((x) => x === "APPROVAL").length === 4,
      "2 + 4", `spawned=${w.spawned} applied=${applied} untouched=${untouched} requests=${reqs.length} outs=${cut(flat.join(","), 200)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X1.12 — NO CACHE: membership changes (service AND raw DB) apply on the very next call in the same process
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X1 · no stale team cache ──");
  {
    const l0 = await call(D.listDeals, cT, thana, { pageSize: 200 });
    const rm = await call(TM.removeMember, { tenantId: T, actorUserId: owner.userId }, teamP, thana.userId);
    const l1 = await call(D.listDeals, cT, thana, { pageSize: 200 });
    await P.teamMember.create({ data: { tenantId: T, teamId: teamP, userId: thana.userId, role: "MEMBER" } });
    const l2 = await call(D.listDeals, cT, thana, { pageSize: 200 });
    await P.teamMember.deleteMany({ where: { teamId: teamP, userId: thana.userId } });
    const l3 = await call(D.listDeals, cT, thana, { pageSize: 200 });
    await P.teamMember.create({ data: { tenantId: T, teamId: teamP, userId: thana.userId, role: "MEMBER" } });
    const s = (r: Res) => (r.ok ? `${idsOf(r.v).has(dP1) ? "P1" : "-"}${idsOf(r.v).has(dP2) ? "P2" : "-"}${idsOf(r.v).has(dPt) ? "Pt" : "-"}` : r.code || r.err);
    chk("C1.7-X1.12", "team membership is never cached (same process): before = dP1+dP2+dPt · teams.removeMember(thana, phuket) ⇒ next call only his own dP1 · raw DB re-insert ⇒ next call dP2+dPt back · raw DB delete ⇒ next call gone again",
      rm.ok && s(l0) === "P1P2Pt" && s(l1) === "P1--" && s(l2) === "P1P2Pt" && s(l3) === "P1--", "P1P2Pt → P1-- → P1P2Pt → P1--",
      `${s(l0)} → ${rm.err || "removed"} ${s(l1)} → ${s(l2)} → ${s(l3)}`);
    const aud = (await P.auditLog.findMany({ where: { tenantId: T, targetId: teamP, action: "team.member.remove" } })) as Any[];
    const ev = await P.outboxEvent.count({ where: { tenantId: T, type: "team.updated", idempotencyKey: { startsWith: `team.updated#${teamP}` } } });
    chk("C1.7-X9.3", "team changes stay audited (core teams: AuditLog team.member.remove with the actor) and announced (team.updated)", aud.some((x) => x.actorId === owner.userId) && ev >= 1, "audit + event", `audit=${aud.length} events=${ev}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S7 — Teams UI + visibility settings page (static; parity screenshots are the controller's D7)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S7 · pages ──");
  const teamsFiles = walk(TEAMS_DIR);
  const compFiles = walk(COMP_DIR);
  const teamsSrc = [...teamsFiles, ...compFiles].map(read).join("\n");
  const teamsPage = read(join(TEAMS_DIR, "page.tsx"));
  const visFiles = walk(VIS_DIR);
  const visPage = read(join(VIS_DIR, "page.tsx"));
  const visSrc = [...visFiles, ...compFiles].map(read).join("\n");
  {
    chk("C1.7-S7.1", "/app/settings/teams/page.tsx: requireTenant · gate OWNER or crm.team.manage ⇒ notFound() (404-not-403) · reads through core teams (listTeams / membersOf) — no prisma query of Team in the page",
      teamsPage.length > 0 && /requireTenant\s*\(/.test(teamsPage) && /\bnotFound\s*\(/.test(teamsPage) && /crm\.team\.manage/.test(teamsSrc) && /listTeams|membersOf|teamsOf/.test(teamsSrc) && !/prisma\.team(Member)?\./.test(teamsPage),
      "guarded page", `page=${teamsPage.length > 0} tenant=${/requireTenant\s*\(/.test(teamsPage)} notFound=${/\bnotFound\s*\(/.test(teamsPage)} key=${/crm\.team\.manage/.test(teamsSrc)}`, "MAJOR");
  }
  {
    const actionFiles = teamsFiles.filter((f) => /^\s*["']use server["']/m.test(read(f)));
    const aSrc = actionFiles.map(read).join("\n");
    const fns = ["createTeam", "updateTeam", "archiveTeam", "addMember", "removeMember", "setLead", "setAcceptingLeads"];
    const missing = fns.filter((f) => !new RegExp(`\\b${f}\\s*\\(`).test(aSrc));
    const direct = /\.(team|teamMember)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/.test(teamsSrc);
    chk("C1.7-S7.2", "teams writes: a \"use server\" file under settings/teams calls core @/lib/core/teams createTeam · updateTeam · archiveTeam · addMember · removeMember · setLead · setAcceptingLeads, re-checks crm.team.manage, and no Team/TeamMember row is written directly by the UI code",
      actionFiles.length > 0 && /@\/lib\/core\/teams/.test(aSrc) && missing.length === 0 && /crm\.team\.manage/.test(aSrc) && !direct, "through core teams",
      `actions=${actionFiles.length} missing=${missing.join(",") || "-"} key=${/crm\.team\.manage/.test(aSrc)} direct=${direct}`, "MAJOR");
  }
  {
    const tids = [...teamsSrc.matchAll(/data-testid=\{?[`"']([^`"']+)[`"']/g)].map((m) => m[1]);
    const need = [/lead/i, /member/i, /unit/i, /accept/i, /create|new|add/i, /archive/i];
    const miss = need.filter((re) => !tids.some((t) => /^teams?-/.test(t) && re.test(t))).map(String);
    chk("C1.7-S7.3", "mockup 10 LEFT panels exist with testids `team(s)-*`: lead · members · units · accepting-leads toggle (รับลีด) · create · archive — and the remove-member flow warns \"โอนดีลก่อนไหม\" (§11.6) [static]",
      miss.length === 0 && /โอนดีล/.test(teamsSrc) && /acceptingLeads|setAcceptingLeads/.test(teamsSrc), "panels + warning", `missingTestids=${miss.join(" ") || "-"} warning=${/โอนดีล/.test(teamsSrc)} testids=${tids.length}`, "MAJOR");
  }
  {
    const nav = read(NAV_FILE);
    const entities = ["CONTACT", "COMPANY", "DEAL", "ACTIVITY"].every((e) => visSrc.includes(e));
    const navReady = /["']\/crm\/settings\/visibility["'][^}]*status:\s*["']ready["']/.test(nav);
    chk("C1.7-S7.4", "/crm/settings/visibility: CRM system guard (type CRM) · requireCrmV2Page (uiVersion gate) · crm.visibility.manage ⇒ notFound · role × entity matrix (CONTACT · COMPANY · DEAL · ACTIVITY) + per-team / per-pipeline overrides through visibility policies · listed \"ready\" in crm/nav.ts",
      visPage.length > 0 && /type:\s*["']CRM["']/.test(visPage) && /await\s+requireCrmV2Page\s*\(/.test(visPage) && /crm\.visibility\.manage/.test(visPage) && /\bnotFound\s*\(/.test(visPage) && entities && /policies|listPolicies/.test(visSrc) && /pipeline/i.test(visSrc) && /team/i.test(visSrc) && navReady,
      "guarded matrix", `page=${visPage.length > 0} v2gate=${/requireCrmV2Page/.test(visPage)} key=${/crm\.visibility\.manage/.test(visPage)} entities=${entities} nav=${navReady}`, "MAJOR");
  }
  {
    const drawer = [read("src/components/app-shell/NavDrawer.tsx"), read("src/app/app/layout.tsx")].join("\n");
    const clientFiles = [...compFiles, ...teamsFiles, ...visFiles].filter((f) => /^\s*["']use client["']/m.test(read(f)));
    const badClient = clientFiles.filter((f) => /from\s+["'](@\/lib\/core\/db|@\/lib\/core\/teams|@\/lib\/modules\/crm\/visibility|@\/lib\/modules\/crm\/deals|@\/lib\/modules\/crm\/access|@prisma\/client)["']/.test(read(f)));
    chk("C1.7-S7.5", "no orphan page: /app/settings/teams is linked from the settings drawer · 'use client' components of both pages import no prisma-reaching module (db · core teams · visibility · access · deals · @prisma/client) [static]",
      /["']\/app\/settings\/teams["']/.test(drawer) && clientFiles.length > 0 && badClient.length === 0, "linked · client-safe", `drawer=${/["']\/app\/settings\/teams["']/.test(drawer)} client=${clientFiles.length} bad=${badClient.join(",") || "-"}`, "MAJOR");
  }
  {
    const inv = JSON.parse(read("scripts/crm-ui-inventory.json") || "{}") as Any;
    const rows = ((inv?.rows ?? []) as Any[]);
    const tRows = rows.filter((r) => /settings\/teams/.test(String(r?.page ?? "")));
    const vRows = rows.filter((r) => /settings\/visibility/.test(String(r?.page ?? "")));
    const ghost = [...tRows.map((r) => [r, teamsSrc] as const), ...vRows.map((r) => [r, visSrc] as const)].filter(([r, src]) => !src.includes(String(r?.testid ?? " "))).map(([r]) => r?.testid);
    chk("C1.7-S7.6", "D8: scripts/crm-ui-inventory.json has rows for /app/settings/teams (≥ 5) and /settings/visibility (≥ 3), each testid present in that page's source (no ghost row)",
      tRows.length >= 5 && vRows.length >= 3 && ghost.length === 0, "inventory", `teams=${tRows.length} visibility=${vRows.length} ghost=${ghost.slice(0, 4).join(",") || "-"}`, "MINOR");
  }
} catch (e) {
  chk("C1.7-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — every row of the throwaway tenant (4 passes over every table with tenantId), systems/units/tenant, users.
  // No drainOutbox (not tenant-scoped) — our PENDING events go with the tenant sweep. No stored object exists (storage stubbed).
  // ═════════════════════════════════════════════════════════════════════════════
  const ids = [T].filter((x) => /^[a-z0-9]+$/i.test(x));
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* order/FK — retried next pass */ } };
  if (ids.length > 0) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(
      `select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`,
    ).catch(() => [])) as Any[]).map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
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
        const rows = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[];
        const n = Number(rows?.[0]?.n ?? 0);
        if (n > 0) left.push(`${t}=${n}`);
      }
      const tenants = await P.tenant.count({ where: { id: { in: ids } } });
      const users = USERS.length ? await P.user.count({ where: { id: { in: USERS } } }) : 0;
      const notes = USERS.length ? await P.appNotification.count({ where: { recipientUserId: { in: USERS } } }) : 0;
      const realStore = STORE_REQ.filter((r) => !r.url.includes(`${TAG}-zone`) && !r.url.includes("qc-c17-cdn.invalid"));
      chk("C1.7-CLEAN", "the oracle gives the QC database back exactly as found — the throwaway tenant, every row it owned (teams, policies, approvals, audit, outbox, kanban), the throwaway users (+ their notifications) are gone · no request ever reached a real storage zone",
        left.length === 0 && tenants === 0 && users === 0 && notes === 0 && realStore.length === 0, "0 rows · 0 tenants · 0 users · 0 real storage calls",
        `${left.join(" · ") || "-"} · tenants=${tenants} users=${users} notifications=${notes} realStore=${realStore.length}`, "MAJOR");
    } catch (e) {
      chk("C1.7-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C1.7: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
