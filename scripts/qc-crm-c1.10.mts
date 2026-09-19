// QC — CRM v2 WO C1.10: REST + AI, first set (~50 ops · 14 tools) + webhooks + docs generator + settings/api page
// Oracle writer · the C1.10 builder must NOT touch this file · QC database only (.env.qc)
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c1.10.mts
//      (`--force-run` = run every check even while crm/api/registry.ts is absent — functional checks red, fixtures + CLEAN green)
// requires: crm-seed   (house style — this oracle reads NO seeded row; everything lives in throwaway tenants `qc-c110-<rand>-a|b`)
//
// SOURCES: crm-brief-C1.10.md · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-C.3 key filters = pseudo-scopes · R-C.7 teams REST
//   `/api/v1/teams/*` · R-C.8 ids-only payloads · R-E.4 the 14 tools · R-E.14 uiVersion 1 ⇒ 409 CRM_V2_DISABLED) · CRM-RUN §2 "C1.10"
//   (S1 1 · S2 6 · S3 2 · S4 4 · S5 3 · S6 4 · S7 2 · S8 1 · S9 1 = 24) · MASTER-PLAN §2 §4 (X1 X2 X3 X6 X7 X8 X9) · docs/api/CRM-API.md ·
//   blueprint §8 · mockup 14 (right) · debts carried to C1.10 (wo-notes C1.2a · C1.2b · C1.3 · C1.4 · C1.5 · C1.7).
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this) ══════════════════════════════════
//   FILES  src/lib/modules/crm/api/{op,registry,dispatch,actor,config,tools,openapi,webhook-events}.ts (+ rate/serialize/http-errors as
//          needed) · ops/{contacts,companies,deals,activities,objects,teams,settings}.ts · route src/app/api/v1/crm/[...path]/route.ts
//          (GET/POST/PATCH/PUT/DELETE → core `@/lib/api/dispatch`) · src/app/api/v1/crm/openapi.json/route.ts · teams REST at
//          src/app/api/v1/teams/[...path]/route.ts (R-C.7 — same CRM registry/dispatch; see Q1) · src/lib/ai/tools-crm.ts
//          (`crmTools()`) · scripts/gen-crm-api-docs.mts (exports `renderDocs()`, main guarded by an invokedDirectly check) ·
//          docs/api/CRM-API.md regenerated (implemented ops + a clearly marked "Planned" section) · fitness F13.10/F13.11/F13.12 ·
//          page src/app/app/sys/[id]/crm/settings/api/page.tsx (CRM system guard · requireCrmV2Page · crmCan(actor,"crm.api.manage")
//          else notFound · testids crm-api-page crm-api-keys crm-api-new crm-api-curl crm-api-webhooks crm-api-deliveries).
//   REGISTRY  `CRM_OPS: ApiOp[]` (registry.ts) · every op: id unique · method+path unique · kind read|write|danger · action = a crm.*
//          permission key (isApiScope) · summary ASCII EN · label Thai · `test: "C1.10-S…"|"C1.10-X…"` naming a check id of this file ·
//          input object schemas strict (additionalProperties false) · every string capped (maxLength|enum|format) · arrays capped ·
//          list `take` ≤ 100 · lists answer `data: { items[], nextCursor }` and accept `cursor`.
//   OPS (MUST — id · METHOD path · action · kind · service fn it calls; NO second engine: ops call these services only)
//     ping                     GET    /ping                                  crm.contact.read      read    — ({ok, systemId, keyName})
//     contacts.list            GET    /contacts                              crm.contact.read      read    contacts.listContacts
//     contacts.search          GET    /contacts/search?q                     crm.contact.read      read    contacts.listContacts/contactOptions
//     contacts.get             GET    /contacts/{id}                         crm.contact.read      read    contacts.getContact360
//     contacts.brief           GET    /contacts/brief?ids=                   crm.contact.read      read    contacts.briefFor
//     contacts.byParty         GET    /contacts/by-party/{partyId}           crm.contact.read      read    contacts.briefFor({partyId})
//     contacts.create          POST   /contacts                              crm.contact.create    write   contacts.createContact → {contactId,…}
//     contacts.update          PATCH  /contacts/{id}                         crm.contact.update    write   contacts.updateContact
//     contacts.setLeadStatus   PUT    /contacts/{id}/lead-status {leadStatus} crm.contact.update   write   contacts.setLeadStatus
//     contacts.assign          PUT    /contacts/{id}/owner {userId}          crm.contact.update    write   contacts.assignContact
//     contacts.setTags         PUT    /contacts/{id}/tags {add[],remove[]}   crm.contact.update    write   contacts.setTags
//     contacts.setOptOut       PUT    /contacts/{id}/opt-out {optOut}        crm.contact.update    write   contacts.setOptOut
//     contacts.archive         POST   /contacts/{id}/archive                 crm.contact.delete    danger  contacts.archiveContact
//     contacts.convert         POST   /contacts/{id}/convert                 crm.contact.convert   write   contacts.convertContact (idempotencyKey = Idempotency-Key)
//     contacts.duplicates.list GET    /contacts/duplicates                   crm.contact.merge     read    contacts.findDuplicates
//     contacts.merge           POST   /contacts/{id}/merge {mergeId}         crm.contact.merge     danger  contacts.mergeContacts
//     contacts.import.start    POST   /contacts/import {rows,mapping}        crm.contact.import    write   contacts.importContacts
//     contacts.export          POST   /contacts/export → {csv}               crm.contact.export    danger  contacts.exportContacts
//     companies.list           GET    /companies                             crm.company.read      read    companies.listCompanies
//     companies.get            GET    /companies/{id}                        crm.company.read      read    companies.getCompany360
//     companies.create         POST   /companies {name,…}                    crm.company.create    write   companies.createCompany
//     companies.update         PATCH  /companies/{id}                        crm.company.update    write   companies.updateCompany
//     companies.archive        POST   /companies/{id}/archive                crm.company.delete    danger  companies.archiveCompany
//     companies.setOwner       PUT    /companies/{id}/owner {userId}         crm.company.update    write   companies.setOwner
//     companies.contacts.add   POST   /companies/{id}/contacts {contactId}   crm.company.update    write   companies.addContact
//     companies.duplicates.list GET   /companies/duplicates                  crm.company.merge     read    companies.findDuplicates
//     companies.merge          POST   /companies/{id}/merge {mergeId}        crm.company.merge     danger  companies.mergeCompanies
//     deals.list               GET    /deals                                 crm.deal.read         read    deals.listDeals
//     deals.board              GET    /deals/board?pipelineId                crm.deal.read         read    deals.getBoard
//     deals.get                GET    /deals/{id}                            crm.deal.read         read    deals.getDeal360
//     deals.create             POST   /deals {pipelineId,title,contactId,…}  crm.deal.create       write   deals.createDeal → {dealId}
//     deals.update             PATCH  /deals/{id}                            crm.deal.update       write   deals.updateDeal
//     deals.move               PUT    /deals/{id}/stage {stageId,…}          crm.deal.move         write   deals.moveDeal
//     deals.reassign           PUT    /deals/{id}/owner {ownerUserId,teamId?} crm.deal.reassign    write   deals.reassignDeal
//     deals.lines.set          PUT    /deals/{id}/lines {lines[],discountBp?} crm.deal.lines       write   deals.setLines
//     deals.quote              POST   /deals/{id}/quotation                  crm.deal.quote        write   deals.issueQuotation
//     deals.forecast           GET    /deals/forecast   (rate "report")      crm.report.view       read    deals.forecast
//     deals.delete             DELETE /deals/{id}                            crm.deal.delete       danger  deals.deleteDeal
//     pipelines.list           GET    /pipelines                             crm.deal.read         read    pipelines.listPipelines
//     activities.list          GET    /activities                            crm.activity.read     read    activities.listActivities
//     activities.get           GET    /activities/{id}                       crm.activity.read     read    activities.getActivity
//     activities.log           POST   /activities {type,title,…}             crm.activity.create   write   activities.logActivity → {activityId}
//     activities.complete      POST   /activities/{id}/complete              crm.activity.complete write   activities.completeActivity
//     activities.delete        DELETE /activities/{id}                       crm.activity.delete   danger  activities.deleteActivity
//     calendar.list            GET    /calendar?from&to                      crm.activity.read     read    activities.calendar
//     objects.list             GET    /objects                               crm.record.read       read    objects.list
//     records.list             GET    /objects/{key}/records                 crm.record.read       read    objects.records.list
//     records.get              GET    /objects/{key}/records/{id}            crm.record.read       read    objects.records.get
//     records.create           POST   /objects/{key}/records {parentId,values} crm.record.create   write   objects.records.create
//     records.update           PATCH  /objects/{key}/records/{id} {values}   crm.record.update     write   objects.records.update
//     records.archive          POST   /objects/{key}/records/{id}/archive    crm.record.delete     write|danger objects.records.archive
//     records.export           POST   /objects/{key}/records/export → {csv}  crm.record.read       danger  objects.records.export
//     teams.list               GET    /teams                                 crm.*                 read    core teams.listTeams
//     teams.create             POST   /teams {name}                          crm.team.manage       write   core teams.createTeam
//     teams.members.set        PUT    /teams/{id}/members {members[]}        crm.team.manage       write   core teams.addMember/removeMember/setLead/setAcceptingLeads
//     settings.get             GET    /settings                              crm.settings.manage   read    settings.getCrmSettings
//     settings.set             PUT    /settings {chatToLead?,bridgesEnabled?} crm.settings.manage  write   settings.setCrmSettingsKey (jsonb_set)
//   RECOMMENDED (not asserted as MUST): contacts.setLifecycle · contacts.import.status · companies.setParent · companies.contacts.remove/
//     setPrimary/setRole · companies.importFromAccount · deals.reopen · deals.setForecast · deals.setNextStep · deals.setCollaborators ·
//     deals.invoice · lostReasons.list · activities.update/reschedule · activities.outcomes · objects.get · records.move/import/timeline ·
//     teams.get/update/archive · visibility.policies.list/set. `crm.object.manage` design ops are NOT callable with API keys (C1.2b).
//   KEYS / ACTOR  bundles in src/lib/api-keys/scopes.ts ids crm.readonly|crm.operate|crm.admin (`crm-read`/`crm-operate`/`crm-admin`
//     tolerated) readonly ⊂ operate ⊂ admin · readonly = read/view keys only · operate adds the STAFF writes, no *.manage, no
//     merge/delete · admin = every crm key · actor via a `memberActorForKey`-style `crmActorForKey` with apiRole READONLY|OPERATE|ADMIN,
//     unitAccess ["*"], permissions = scopes (NO implicit read — C1.7) · filters = pseudo-scopes `crm.filter.team:<teamId>` /
//     `crm.filter.owner:<userId>` accepted by createApiKey and honoured by visibleWhere · readonly responses mask phone/e-mail.
//   ERRORS  NOT_FOUND→404 not_found (ids of another tenant/system/team) · FORBIDDEN→403 (forbidden|scope_missing) · VALIDATION→400|422
//     code validation (Q2) · CONFLICT/DUPLICATE→409 · STAGE_REQUIREMENTS→409|422 code stage_requirements + missing (details or
//     error.missing) · APPROVAL_REQUIRED→202 {status,approvalRequestId} or 409 code approval_required + approvalRequestId ·
//     uiVersion-1 system ⇒ EVERY op (ping tolerated) 409 code crm_v2_disabled BEFORE validation/scope-body checks, nothing written.
//   CONFIG  `CRM_API_CONFIG` (config.ts): systemType CRM · rateNs unique (not acct/kb/mbr) · rateLimits read/write/report via checkRateLimitDb.
//   AI  src/lib/modules/crm/api/tools.ts: crmToolInfos() · crmToolNames() · crmToolAllowedForScopes(name, scopes) (no crm.* scope ⇒ false
//     for EVERY crm tool incl. crm_create_lead · wired into skills.toolAllowedForApiKey) · runCrmTool(ctx, name, args) with
//     ctx {tenantId, systemId?, userId?, role?, unitAccess?, permissions?} → {mode:"read",result}|{mode:"propose",kind:"crm.<opId>",summary,
//     payload}|{mode:"error",error(Thai)} (read = scopes ∩ the asking human's rights + HIS teams/units; no human ⇒ fail closed) ·
//     dispatchCrmKind(ctx, kind, payload) · the 14 tools of R-E.4 (read: crm_search crm_contact_360 crm_company_360 crm_deal_360
//     crm_pipeline_summary crm_forecast crm_records_query · write: crm_create_lead crm_create_company crm_create_deal crm_move_deal
//     crm_update_deal crm_log_activity crm_convert) · skill `crm` lists all 14 · proposals.ts ProposalKind += `crm.${string}` ·
//     crm_create_lead on a uiVersion-1 system keeps the legacy path (contact created) · legacy kind `crm_create_lead` still executes.
//   WEBHOOKS  webhook-events.ts `crmWebhookEvents()` = the WEBHOOK_EVENTS entries with prefix crm. / custom.record. / team. · deliveries
//     signed (X-Shark-Signature + V2) · `crm.deal.won` payload ids only.
//
// SKILL FOLDER NOTE: `.claude/skills/shark-crm-api` is gitignored (not in the worktree) — this oracle never asserts on it and never runs
//   `gen-crm-api-docs --check` (which would read it); S8 compares `renderDocs()` with docs/api/CRM-API.md instead.
// HOUSE RULES: SKIP guard (no DB before it) · throwaway tenants `qc-c110-<rand>-a|b` swept in `finally` (+ ChatRateBucket rows of our keys)
//   · no drainOutbox (our outbox rows are deferred, consumed directly, then deleted with the tenant) · outbound webhook fetch stubbed ·
//   docs/api/CRM-API.md snapshotted and restored if an import ever rewrote it · the :3215 QC server is only probed (never started) ·
//   last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";

/** Thai 13-digit tax id: 12 given digits + mod-11 check digit (ORACLE-EDIT C1.10-S4.3) */
function validTaxId(d12: string): string { const d = d12.slice(0, 12).padEnd(12, "0"); let sum = 0; for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i); return d + String((11 - (sum % 11)) % 10); }
const API_DIR = "src/lib/modules/crm/api";
const REG_FILE = `${API_DIR}/registry.ts`;
const ROUTE_FILE = "src/app/api/v1/crm/[...path]/route.ts";
const OA_FILE = "src/app/api/v1/crm/openapi.json/route.ts";
const TEAMS_ROUTE_FILE = "src/app/api/v1/teams/[...path]/route.ts";
const TOOLS_FILE = `${API_DIR}/tools.ts`;
const AI_TOOLS_FILE = "src/lib/ai/tools-crm.ts";
const GEN_FILE = "scripts/gen-crm-api-docs.mts";
const DOC_FILE = "docs/api/CRM-API.md";
const PAGE_DIR = "src/app/app/sys/[id]/crm/settings/api";
const THIS_FILE = "scripts/qc-crm-c1.10.mts";

const ARGV = process.argv.slice(2);
const WORKER_AT = ARGV.indexOf("--x3-worker");
const FORCE = ARGV.includes("--force-run");

// ═══ SKIP guard — nothing of C1.10 exists yet ⇒ SKIPPED, no DB connection opened ═══
if (!existsSync(REG_FILE) && WORKER_AT < 0 && !FORCE) {
  console.log(`⚠️  SKIPPED — WO C1.10 not built yet (${REG_FILE} missing)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();

const ROUTE_SPEC = "@/app/api/v1/crm/[...path]/route";

// ═══ X3 WORKER MODE — argv: --x3-worker <rawKey> <idemKey> <startAtMs> <n> <base64url(JSON body)> <path> ═══
if (WORKER_AT >= 0) {
  const [wKey, wIdem, wStart, wN, wBody, wPath] = ARGV.slice(WORKER_AT + 1);
  const route = (await import(ROUTE_SPEC as string).catch(() => ({}))) as Any;
  const body = Buffer.from(String(wBody), "base64url").toString("utf8");
  const waitMs = Number(wStart) - Date.now();
  if (waitMs > 0) await new Promise<void>((r) => setTimeout(r, waitMs));
  const one = async (): Promise<string> => {
    try {
      const res: Response = await route.POST(
        new Request(`http://qc.invalid/api/v1/crm${wPath}`, { method: "POST", headers: { authorization: `Bearer ${wKey}`, "idempotency-key": String(wIdem), "content-type": "application/json" }, body }),
        { params: Promise.resolve({ path: String(wPath).split("/").filter(Boolean) }) },
      );
      const t = await res.text();
      let b: Any = null;
      try { b = JSON.parse(t.replace(/^﻿/, "")); } catch { b = null; }
      const d = b?.data ?? {};
      const id = d.contactId ?? d.contact?.id ?? d.dealId ?? d.id ?? "";
      return `${res.status}|${String(b?.error?.code ?? "")}|${id}|${res.headers.get("idempotent-replayed") ?? ""}`;
    } catch (e) {
      return `ERR|${(e instanceof Error ? e.message : String(e)).slice(0, 120)}||`;
    }
  };
  const out = await Promise.all(Array.from({ length: Number(wN) }, () => one()));
  console.log(`X3WORKER ${JSON.stringify(out)}`);
  const dbw = (await import("@/lib/core/db")) as Any;
  await dbw.prisma.$disconnect();
  process.exit(0);
}

// ─── outbound webhook fetch stub (only our hook host is intercepted; everything else passes through) ───
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c110-${rand}`;
const HOOK_HOST = `${TAG}-hook.invalid`;
const HOOKS: { url: string; headers: Record<string, string>; body: string }[] = [];
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  if (url.includes(HOOK_HOST)) {
    const h: Record<string, string> = {};
    const hs = init?.headers ?? {};
    if (hs instanceof Headers) hs.forEach((v, k) => { h[k.toLowerCase()] = v; });
    else for (const [k, v] of Object.entries(hs as Record<string, string>)) h[k.toLowerCase()] = String(v);
    HOOKS.push({ url, headers: h, body: String(init?.body ?? "") });
    return new Response("ok", { status: 200 });
  }
  if (/bunnycdn\.com|bunny\.net/.test(url)) return new Response("ok", { status: 200 });
  return realFetch(input, init);
}) as typeof fetch;

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
const cut = (v: unknown, n = 260) => { const s = String(v ?? ""); return s.length > n ? `${s.slice(0, n)}…` : s; };
const j = (v: Any): string =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x)) ?? "undefined";
const thai = (s: unknown) => typeof s === "string" && s.trim().length > 0 && /[ก-๙]/.test(s);
const walk = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|mts)$/.test(name)) out.push(p);
  }
  return out;
};
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
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
/** run one section; an unexpected crash is recorded as a failed check (other sections still run) */
const section = async (name: string, fn: () => Promise<void>) => {
  console.log(`\n── ${name} ──`);
  try {
    await fn();
  } catch (e) {
    chk(`C1.10-${name.split(" ")[0]}.CRASH`, `section ${name} ran to the end`, false, "no exception", cut(e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e), 500));
  }
};

// ─── REST helper (route handlers in-process) ───
type Resp = { status: number; body: Any; headers: Headers | null; text: string };
let reqSeq = 0;
const callRoute = async (mod: Any, base: string, method: string, path: string, key: string | null, body?: unknown, opt: { idem?: string | null; headers?: Record<string, string> } = {}): Promise<Resp> => {
  const fn = mod?.[method];
  if (typeof fn !== "function") return { status: 0, body: { error: { code: "MISSING_ROUTE" } }, headers: null, text: "MISSING_ROUTE" };
  const headers: Record<string, string> = { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(opt.headers ?? {}) };
  if (method !== "GET") {
    const idem = opt.idem === undefined ? `${TAG}-${(reqSeq += 1)}-${randomBytes(4).toString("hex")}` : opt.idem;
    if (idem) headers["idempotency-key"] = idem;
  }
  let b: string | undefined;
  if (body !== undefined && method !== "GET") { b = JSON.stringify(body); headers["content-type"] = "application/json"; }
  const pathOnly = path.split("?")[0] ?? "";
  try {
    const res: Response = await fn(new Request(`http://qc.invalid/api/v1/${base}${path}`, { method, headers, body: b }), { params: Promise.resolve({ path: pathOnly.split("/").filter(Boolean) }) });
    const buf = new Uint8Array(await res.arrayBuffer());
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(buf).replace(/^﻿/, "");
    let parsed: Any = null;
    try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
    return { status: res.status, body: parsed, headers: res.headers, text };
  } catch (e) {
    return { status: -1, body: { error: { code: "THROWN", message: e instanceof Error ? e.message : String(e) } }, headers: null, text: String(e) };
  }
};
const ecode = (r: Resp) => String(r.body?.error?.code ?? "").toLowerCase();
const dat = (r: Resp) => r.body?.data;
const itemsOf = (d: Any): Any[] => (Array.isArray(d) ? d : (d?.items ?? d?.rows ?? d?.deals ?? d?.records ?? []));
const idsIn = (d: Any): Set<string> => new Set(itemsOf(d).map((x: Any) => String(x?.id ?? x?.contactId ?? x?.dealId ?? "")));
const idOf = (d: Any, ...keys: string[]): string => {
  for (const k of keys) { const v = k.split(".").reduce((o: Any, p) => o?.[p], d); if (typeof v === "string" && v) return v; }
  return typeof d?.id === "string" ? d.id : "";
};
const is404 = (r: Resp) => r.status === 404;
const is403 = (r: Resp) => r.status === 403 && ["forbidden", "scope_missing"].includes(ecode(r));
const isVal = (r: Resp) => (r.status === 400 || r.status === 422) && ["validation"].includes(ecode(r));
const sr = (r: Resp) => `${r.status}/${ecode(r) || "-"}`;
const DAY_MS = 86_400_000;

// ─── §6.1 keys (C1.7) + fallbacks used ONLY to mint keys while scopes.ts has no crm bundles yet (--force-run) ───
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
];
const STAFF_DEFAULT = [
  "crm.contact.read", "crm.contact.create", "crm.contact.update", "crm.company.read", "crm.company.create", "crm.company.update",
  "crm.deal.read", "crm.deal.create", "crm.deal.update", "crm.deal.move", "crm.deal.lines", "crm.deal.quote",
  "crm.activity.read", "crm.activity.create", "crm.activity.complete", "crm.activity.delete",
  "crm.email.send", "crm.email.read", "crm.sequence.enroll", "crm.record.read", "crm.record.create", "crm.record.update", "crm.report.view",
];
const FALLBACK_RO = ["crm.contact.read", "crm.company.read", "crm.deal.read", "crm.activity.read", "crm.record.read", "crm.report.view"];
const WRITE_VERBS = /\.(create|update|delete|convert|import|merge|move|quote|reassign|lines|complete|send|enroll|manage|approve|export)$/;
const perms = (keys: readonly string[], extra: Record<string, unknown> = {}) => ({ ...Object.fromEntries(keys.map((k) => [k, true])), ...extra });

// ─── contract table (MUST) ───
type C = { id: string; m: string; p: string; a: string | null; k: string };
const MUST: C[] = [
  { id: "ping", m: "GET", p: "/ping", a: "crm.contact.read", k: "read" },
  { id: "contacts.list", m: "GET", p: "/contacts", a: "crm.contact.read", k: "read" },
  { id: "contacts.search", m: "GET", p: "/contacts/search", a: "crm.contact.read", k: "read" },
  { id: "contacts.get", m: "GET", p: "/contacts/{}", a: "crm.contact.read", k: "read" },
  { id: "contacts.brief", m: "GET", p: "/contacts/brief", a: "crm.contact.read", k: "read" },
  { id: "contacts.byParty", m: "GET", p: "/contacts/by-party/{}", a: "crm.contact.read", k: "read" },
  { id: "contacts.create", m: "POST", p: "/contacts", a: "crm.contact.create", k: "write" },
  { id: "contacts.update", m: "PATCH", p: "/contacts/{}", a: "crm.contact.update", k: "write" },
  { id: "contacts.setLeadStatus", m: "PUT", p: "/contacts/{}/lead-status", a: "crm.contact.update", k: "write" },
  { id: "contacts.assign", m: "PUT", p: "/contacts/{}/owner", a: "crm.contact.update", k: "write" },
  { id: "contacts.setTags", m: "PUT", p: "/contacts/{}/tags", a: "crm.contact.update", k: "write" },
  { id: "contacts.setOptOut", m: "PUT", p: "/contacts/{}/opt-out", a: "crm.contact.update", k: "write" },
  { id: "contacts.archive", m: "POST", p: "/contacts/{}/archive", a: "crm.contact.delete", k: "danger" },
  { id: "contacts.convert", m: "POST", p: "/contacts/{}/convert", a: "crm.contact.convert", k: "write" },
  { id: "contacts.duplicates.list", m: "GET", p: "/contacts/duplicates", a: "crm.contact.merge", k: "read" },
  { id: "contacts.merge", m: "POST", p: "/contacts/{}/merge", a: "crm.contact.merge", k: "danger" },
  { id: "contacts.import.start", m: "POST", p: "/contacts/import", a: "crm.contact.import", k: "write" },
  { id: "contacts.export", m: "POST", p: "/contacts/export", a: "crm.contact.export", k: "danger" },
  { id: "companies.list", m: "GET", p: "/companies", a: "crm.company.read", k: "read" },
  { id: "companies.get", m: "GET", p: "/companies/{}", a: "crm.company.read", k: "read" },
  { id: "companies.create", m: "POST", p: "/companies", a: "crm.company.create", k: "write" },
  { id: "companies.update", m: "PATCH", p: "/companies/{}", a: "crm.company.update", k: "write" },
  { id: "companies.archive", m: "POST", p: "/companies/{}/archive", a: "crm.company.delete", k: "danger" },
  { id: "companies.setOwner", m: "PUT", p: "/companies/{}/owner", a: "crm.company.update", k: "write" },
  { id: "companies.contacts.add", m: "POST", p: "/companies/{}/contacts", a: "crm.company.update", k: "write" },
  { id: "companies.duplicates.list", m: "GET", p: "/companies/duplicates", a: "crm.company.merge", k: "read" },
  { id: "companies.merge", m: "POST", p: "/companies/{}/merge", a: "crm.company.merge", k: "danger" },
  { id: "deals.list", m: "GET", p: "/deals", a: "crm.deal.read", k: "read" },
  { id: "deals.board", m: "GET", p: "/deals/board", a: "crm.deal.read", k: "read" },
  { id: "deals.get", m: "GET", p: "/deals/{}", a: "crm.deal.read", k: "read" },
  { id: "deals.create", m: "POST", p: "/deals", a: "crm.deal.create", k: "write" },
  { id: "deals.update", m: "PATCH", p: "/deals/{}", a: "crm.deal.update", k: "write" },
  { id: "deals.move", m: "PUT", p: "/deals/{}/stage", a: "crm.deal.move", k: "write" },
  { id: "deals.reassign", m: "PUT", p: "/deals/{}/owner", a: "crm.deal.reassign", k: "write" },
  { id: "deals.lines.set", m: "PUT", p: "/deals/{}/lines", a: "crm.deal.lines", k: "write" },
  { id: "deals.quote", m: "POST", p: "/deals/{}/quotation", a: "crm.deal.quote", k: "write" },
  { id: "deals.forecast", m: "GET", p: "/deals/forecast", a: "crm.report.view", k: "read" },
  { id: "deals.delete", m: "DELETE", p: "/deals/{}", a: "crm.deal.delete", k: "danger" },
  { id: "pipelines.list", m: "GET", p: "/pipelines", a: "crm.deal.read", k: "read" },
  { id: "activities.list", m: "GET", p: "/activities", a: "crm.activity.read", k: "read" },
  { id: "activities.get", m: "GET", p: "/activities/{}", a: "crm.activity.read", k: "read" },
  { id: "activities.log", m: "POST", p: "/activities", a: "crm.activity.create", k: "write" },
  { id: "activities.complete", m: "POST", p: "/activities/{}/complete", a: "crm.activity.complete", k: "write" },
  { id: "activities.delete", m: "DELETE", p: "/activities/{}", a: "crm.activity.delete", k: "danger" },
  { id: "calendar.list", m: "GET", p: "/calendar", a: "crm.activity.read", k: "read" },
  { id: "objects.list", m: "GET", p: "/objects", a: "crm.record.read", k: "read" },
  { id: "records.list", m: "GET", p: "/objects/{}/records", a: "crm.record.read", k: "read" },
  { id: "records.get", m: "GET", p: "/objects/{}/records/{}", a: "crm.record.read", k: "read" },
  { id: "records.create", m: "POST", p: "/objects/{}/records", a: "crm.record.create", k: "write" },
  { id: "records.update", m: "PATCH", p: "/objects/{}/records/{}", a: "crm.record.update", k: "write" },
  { id: "records.archive", m: "POST", p: "/objects/{}/records/{}/archive", a: "crm.record.delete", k: "write|danger" },
  { id: "records.export", m: "POST", p: "/objects/{}/records/export", a: "crm.record.read", k: "danger" },
  { id: "teams.list", m: "GET", p: "/teams", a: null, k: "read" },
  { id: "teams.create", m: "POST", p: "/teams", a: "crm.team.manage", k: "write" },
  { id: "teams.members.set", m: "PUT", p: "/teams/{}/members", a: "crm.team.manage", k: "write" },
  { id: "settings.get", m: "GET", p: "/settings", a: "crm.settings.manage", k: "read" },
  { id: "settings.set", m: "PUT", p: "/settings", a: "crm.settings.manage", k: "write" },
];
const LIST_OPS = ["contacts.list", "companies.list", "deals.list", "activities.list", "records.list"];
const TOOLS_14: Record<string, { op: string | null; write: boolean }> = {
  crm_search: { op: null, write: false }, crm_contact_360: { op: "contacts.get", write: false }, crm_company_360: { op: "companies.get", write: false },
  crm_deal_360: { op: "deals.get", write: false }, crm_pipeline_summary: { op: "deals.board", write: false }, crm_forecast: { op: "deals.forecast", write: false },
  crm_records_query: { op: "records.list", write: false }, crm_create_lead: { op: "contacts.create", write: true }, crm_create_company: { op: "companies.create", write: true },
  crm_create_deal: { op: "deals.create", write: true }, crm_move_deal: { op: "deals.move", write: true }, crm_update_deal: { op: "deals.update", write: true },
  crm_log_activity: { op: "activities.log", write: true }, crm_convert: { op: "contacts.convert", write: true },
};
const normPath = (p: string) => p.replace(/\{[^}]*\}/g, "{}").replace(/\?.*$/, "");

// ─────────────────────────── state (cleanup needs it even after a crash) ───────────────────────────
const TENANTS: string[] = [];
const USERS: string[] = [];
const KEY_IDS: string[] = [];
const KEY_ERR: Record<string, string> = {};
const DOC_BEFORE = read(DOC_FILE);
const NONE = `${TAG}-none`;
let phoneSeq = 0;
const phoneOf = (): string => `09${String(Math.floor(Math.random() * 90_000_000) + 10_000_000 + (phoneSeq++ % 7)).slice(-8)}`;
const SECRET_K = `กระบี่ลับ${rand}`; // krabi-team rows (visibility leak detector)
const SECRET_F = `ต่างระบบ${rand}`; // rows of the other CRM system / other tenant (X1 leak detector)
const SECRET_S = `ข้อมูลอ่อนไหว${rand}`; // sensitive contact field value (X8)

console.log(`\n═══ QC CRM v2 · C1.10 — REST + AI first set · webhooks · docs · settings/api ═══`);
console.log(`[env] DB ${host} · tag ${TAG}${FORCE && !existsSync(REG_FILE) ? " · --force-run with registry ABSENT (functional checks below are expected red)" : ""}\n`);

try {
  // ═════════════════════════════════════════════════════════════════════════════
  // modules (dynamic — the builder's files may not exist yet)
  // ═════════════════════════════════════════════════════════════════════════════
  let regErr = "";
  const REG = (await import("@/lib/modules/crm/api/registry" as string).catch((e: Any) => { regErr = e instanceof Error ? e.message : String(e); return {}; })) as Any;
  const OPS: Any[] = Array.isArray(REG.CRM_OPS) ? REG.CRM_OPS : [];
  const CFG = (await import("@/lib/modules/crm/api/config" as string).catch(() => ({}))) as Any;
  const ACT = (await import("@/lib/modules/crm/api/actor" as string).catch(() => ({}))) as Any;
  const TL = (await import("@/lib/modules/crm/api/tools" as string).catch(() => ({}))) as Any;
  const WE = (await import("@/lib/modules/crm/api/webhook-events" as string).catch(() => ({}))) as Any;
  const ROUTE = (await import(ROUTE_SPEC as string).catch(() => ({}))) as Any;
  const OAR = (await import("@/app/api/v1/crm/openapi.json/route" as string).catch(() => ({}))) as Any;
  const TROUTE = existsSync(TEAMS_ROUTE_FILE) ? ((await import("@/app/api/v1/teams/[...path]/route" as string).catch(() => null)) as Any) : null;
  const AIR = (await import("@/app/api/v1/ai/tools/[name]/route" as string).catch(() => ({}))) as Any;
  const SKL = (await import("@/lib/ai/skills" as string).catch(() => ({}))) as Any;
  const PROP = (await import("@/lib/ai/proposals" as string).catch(() => ({}))) as Any;
  const TCRM = (await import("@/lib/ai/tools-crm" as string).catch(() => ({}))) as Any;
  const OBC = (await import("@/lib/outbox-consumers" as string).catch(() => ({}))) as Any;
  const WH = (await import("@/lib/webhooks/service" as string)) as Any;
  const WL = (await import("@/lib/webhooks/labels" as string)) as Any;
  const AK = (await import("@/lib/api-keys/service" as string)) as Any;
  const SC = (await import("@/lib/api-keys/scopes" as string)) as Any;
  const OA = (await import("@/lib/api/openapi" as string)) as Any;
  const OB = (await import("@/lib/modules/crm/objects" as string).catch(() => ({}))) as Any;
  const CT = (await import("@/lib/modules/crm/contacts" as string).catch(() => ({}))) as Any;
  const CO = (await import("@/lib/modules/crm/companies" as string).catch(() => ({}))) as Any;
  const MEM = (await import("@/lib/modules/member" as string).catch(() => null)) as Any;
  const F = (MEM?.fields ?? null) as Any;
  const APR = (await import("@/lib/modules/approval/service" as string).catch(() => null)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const opById = (id: string) => OPS.find((o) => o.id === id);

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — tenant A (T): units P/K · teams phuket/krabi · CRM S (v2) + S2 (v2, same shop) + MEMBER system · tenant B (TB): CRM SB (uiVersion 1)
  //   fixture rows are written RAW (the fixture must not depend on the code under test) except custom objects/fields/values,
  //   which go through the C1.2a/C1.2b/C1.4 services (already accepted work orders)
  // ═════════════════════════════════════════════════════════════════════════════
  const T = (await P.tenant.create({ data: { name: `${TAG}-a`, slug: `${TAG}-a` } })).id as string;
  TENANTS.push(T);
  const TB = (await P.tenant.create({ data: { name: `${TAG}-b`, slug: `${TAG}-b` } })).id as string;
  TENANTS.push(TB);
  const unitP = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `สาขาภูเก็ต ${rand}`, slug: `${TAG}-up` } })).id as string;
  const unitK = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `สาขากระบี่ ${rand}`, slug: `${TAG}-uk` } })).id as string;
  type Who = { userId: string; role: string; unitAccess: string[]; permissions: Record<string, unknown> };
  const mkMember = async (tid: string, suffix: string, role: string, unitAccess: string[], p: Record<string, unknown>): Promise<Who> => {
    const u = await P.user.create({ data: { email: `${TAG}-${suffix}@qc.invalid`, name: `QC ${suffix} ${TAG}` } });
    USERS.push(u.id);
    await P.membership.create({ data: { userId: u.id, tenantId: tid, role, unitAccess, permissions: p, acceptedAt: new Date() } });
    return { userId: u.id as string, role, unitAccess, permissions: p };
  };
  const owner = await mkMember(T, "owner", "OWNER", [], {});
  const thana = await mkMember(T, "thana", "STAFF", ["*"], perms(STAFF_DEFAULT));
  const nok = await mkMember(T, "nok", "STAFF", ["*"], perms(STAFF_DEFAULT));
  const kai = await mkMember(T, "kai", "STAFF", ["*"], perms(STAFF_DEFAULT));
  const narrow = await mkMember(T, "narrow", "STAFF", ["*"], perms(["crm.activity.create"]));
  const reader = await mkMember(T, "reader", "STAFF", ["*"], perms(["crm.contact.read"]));
  const mgrP = await mkMember(T, "mgrp", "MANAGER", [unitP], {});
  const ownerB = await mkMember(TB, "ownerb", "OWNER", [], {});
  const mkSys = async (tid: string, type: string, label: string) => (await sysSvc.createSystem(tid, type, `${label} ${TAG}`)).id as string;
  const S = await mkSys(T, "CRM", "CRM");
  const S2 = await mkSys(T, "CRM", "CRM สอง");
  const MEMSYS = await mkSys(T, "MEMBER", "สมาชิก");
  const SB = await mkSys(TB, "CRM", "CRM ร้านบี");
  await P.appSystem.update({ where: { id: S }, data: { settings: { crm: { uiVersion: 2, bridgesEnabled: true } } } });
  await P.appSystem.update({ where: { id: S2 }, data: { settings: { crm: { uiVersion: 2, bridgesEnabled: true } } } });
  await P.appSystem.update({ where: { id: SB }, data: { settings: { crm: { uiVersion: 1, bridgesEnabled: true } } } });
  const teamP = (await P.team.create({ data: { tenantId: T, name: `ภูเก็ต ${rand}`, unitIds: [unitP] } })).id as string;
  const teamK = (await P.team.create({ data: { tenantId: T, name: `กระบี่ ${rand}`, unitIds: [unitK], leadUserId: nok.userId } })).id as string;
  const teamB = (await P.team.create({ data: { tenantId: TB, name: `ทีม${SECRET_F}` } })).id as string;
  for (const w of [thana, narrow, reader]) await P.teamMember.create({ data: { tenantId: T, teamId: teamP, userId: w.userId, role: "MEMBER" } });
  await P.teamMember.create({ data: { tenantId: T, teamId: teamK, userId: nok.userId, role: "LEAD" } });
  await P.teamMember.create({ data: { tenantId: T, teamId: teamK, userId: kai.userId, role: "MEMBER" } });
  const STD = [
    { name: "ผู้สนใจใหม่", kind: "OPEN", probability: 10 }, { name: "เจรจา", kind: "OPEN", probability: 50 },
    { name: "ชนะ", kind: "WON", probability: 100 }, { name: "แพ้", kind: "LOST", probability: 0 },
  ];
  const mkPipe = async (tid: string, sys: string, name: string) => {
    const p = (await P.crmPipeline.create({
      data: { tenantId: tid, systemId: sys, name: `${name} ${TAG}`, isDefault: true, stages: { create: STD.map((s, i) => ({ tenantId: tid, systemId: sys, sortOrder: i, ...s })) } },
      include: { stages: true },
    })) as Any;
    return { id: p.id as string, st: [...(p.stages as Any[])].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.id as string) };
  };
  const pMain = await mkPipe(T, S, "ขาย");
  const pS2 = await mkPipe(T, S2, "ขายระบบสอง");
  const pB = await mkPipe(TB, SB, "ขายร้านบี");
  const mkParty = async (tid: string, name: string, kind: string, extra: Record<string, Any> = {}) => (await P.party.create({ data: { tenantId: tid, name, kind, ...extra } })).id as string;
  const mkCompany = async (name: string, ownerUserId: string | null, teamId: string | null, o: { sys?: string; tid?: string; taxId?: string | null } = {}) =>
    (await P.crmCompany.create({ data: { tenantId: o.tid ?? T, systemId: o.sys ?? S, name, partyId: await mkParty(o.tid ?? T, name, "COMPANY"), ownerUserId, teamId, taxId: o.taxId ?? null } })).id as string;
  const CONTACT_PII: string[] = [];
  const mkContact = async (name: string, ownerUserId: string | null, teamId: string | null, o: { companyId?: string | null; sys?: string; tid?: string; email?: string } = {}) => {
    const phone = phoneOf();
    const email = o.email ?? `${TAG}-${phoneSeq}@mail.invalid`;
    CONTACT_PII.push(phone, email);
    const tid = o.tid ?? T;
    const partyId = await mkParty(tid, name, "PERSON", { phone });
    const id = (await P.crmContact.create({ data: { tenantId: tid, systemId: o.sys ?? S, name, firstName: name, phone, email, partyId, ownerUserId, teamId, companyId: o.companyId ?? null } })).id as string;
    if (o.companyId) await P.crmCompanyContact.create({ data: { tenantId: tid, companyId: o.companyId, contactId: id, role: "OTHER", isPrimary: true } });
    return { id, phone, email, partyId };
  };
  const mkDeal = async (d: { title: string; contactId: string; ownerUserId: string | null; teamId: string | null; pipe?: { id: string; st: string[] }; valueSatang?: number; companyId?: string | null; sys?: string; tid?: string }) => {
    const pipe = d.pipe ?? pMain;
    const tid = d.tid ?? T;
    const row = await P.crmDeal.create({ data: {
      tenantId: tid, systemId: d.sys ?? S, pipelineId: pipe.id, stageId: pipe.st[0], contactId: d.contactId, companyId: d.companyId ?? null, title: d.title,
      valueSatang: d.valueSatang ?? 0, kind: "OPEN", ownerUserId: d.ownerUserId, teamId: d.teamId, collaboratorUserIds: [],
    } });
    await P.crmDealStageHistory.create({ data: { tenantId: tid, dealId: row.id, toStageId: pipe.st[0] } });
    return row.id as string;
  };
  const rawAct = async (data: Record<string, Any>, tid = T, sys = S) =>
    (await P.crmActivity.create({ data: { tenantId: tid, systemId: sys, type: "CALL", startAt: new Date(Date.now() + 3 * DAY_MS), ...data } })).id as string;

  const coP = await mkCompany(`บริษัทภูเก็ต ${rand}`, thana.userId, teamP, { taxId: validTaxId(`01055${String(Date.now()).slice(-7)}`) /* ORACLE-EDIT C1.10-S4.3: mod-11 valid, else VALIDATION masks the duplicate check */ });
  const coTax = (await P.crmCompany.findUnique({ where: { id: coP } })).taxId as string;
  const coK = await mkCompany(`บริษัท${SECRET_K}`, nok.userId, teamK);
  const coN = await mkCompany(`บริษัทเจ้าของ ${rand}`, owner.userId, null);
  const coMA = await mkCompany(`บริษัทรวมเก็บ ${rand}`, owner.userId, null);
  const coMB = await mkCompany(`บริษัทรวมทิ้ง ${rand}`, owner.userId, null);
  const coX1 = await mkCompany(`บริษัทอันตรายหนึ่ง ${rand}`, owner.userId, null);
  const coX2 = await mkCompany(`บริษัทอันตรายสอง ${rand}`, owner.userId, null);
  const kP = await mkContact(`คุณภูเก็ต ${rand}`, thana.userId, teamP, { companyId: coP });
  const kP2 = await mkContact(`คุณสอง ${rand}`, thana.userId, teamP);
  const kK = await mkContact(`คุณ${SECRET_K}`, nok.userId, teamK, { companyId: coK });
  const kK2 = await mkContact(`คุณไก่${SECRET_K}`, kai.userId, teamK);
  const kMA = await mkContact(`คุณรวมเก็บ ${rand}`, owner.userId, null);
  const kMB = await mkContact(`คุณรวมทิ้ง ${rand}`, owner.userId, null);
  const kConv = await mkContact(`คุณแปลง ${rand}`, owner.userId, null);
  const kX1 = await mkContact(`คุณอันตรายหนึ่ง ${rand}`, owner.userId, null);
  const kX2 = await mkContact(`คุณอันตรายสอง ${rand}`, owner.userId, null);
  const FORMULA = `=HYPERLINK("http://evil.invalid","${rand}")`;
  const kF = await mkContact(FORMULA, owner.userId, null);
  const dP1 = await mkDeal({ title: `ดีลภูเก็ตหนึ่ง ${rand}`, contactId: kP.id, companyId: coP, ownerUserId: thana.userId, teamId: teamP, valueSatang: 100_000 });
  const dP2 = await mkDeal({ title: `ดีลภูเก็ตสอง ${rand}`, contactId: kP2.id, ownerUserId: thana.userId, teamId: teamP, valueSatang: 200_000 });
  const dK1 = await mkDeal({ title: `ดีล${SECRET_K}`, contactId: kK.id, companyId: coK, ownerUserId: nok.userId, teamId: teamK, valueSatang: 7_000_000 });
  const dK2 = await mkDeal({ title: `ดีลไก่${SECRET_K}`, contactId: kK2.id, ownerUserId: kai.userId, teamId: teamK, valueSatang: 8_000_000 });
  const dWon = await mkDeal({ title: `ดีลปิดชนะ ${rand}`, contactId: kP2.id, ownerUserId: owner.userId, teamId: null, valueSatang: 50_000 });
  const dLines = await mkDeal({ title: `ดีลส่วนลด ${rand}`, contactId: kP2.id, ownerUserId: owner.userId, teamId: null, valueSatang: 0 });
  const dDel = await mkDeal({ title: `ดีลลบได้ ${rand}`, contactId: kX1.id, ownerUserId: owner.userId, teamId: null });
  const aP = await rawAct({ title: `โทรภูเก็ต ${rand}`, ownerUserId: thana.userId, dealId: dP1, contactId: kP.id });
  const aK = await rawAct({ title: `โทร${SECRET_K}`, ownerUserId: nok.userId, dealId: dK1, contactId: kK.id });
  const aDel = await rawAct({ title: `โทรลบได้ ${rand}`, ownerUserId: owner.userId, contactId: kX1.id });
  // other CRM system of the same shop (S2) + tenant B (SB, uiVersion 1)
  const coS2 = await mkCompany(`บริษัท${SECRET_F}`, owner.userId, null, { sys: S2 });
  const kS2 = await mkContact(`คุณ${SECRET_F}`, owner.userId, null, { sys: S2 });
  const dS2 = await mkDeal({ title: `ดีล${SECRET_F}`, contactId: kS2.id, ownerUserId: owner.userId, teamId: null, pipe: pS2, sys: S2 });
  const aS2 = await rawAct({ title: `โทร${SECRET_F}`, ownerUserId: owner.userId, contactId: kS2.id }, T, S2);
  const coB = await mkCompany(`บริษัทบี${SECRET_F}`, ownerB.userId, null, { sys: SB, tid: TB });
  const kB = await mkContact(`คุณบี${SECRET_F}`, ownerB.userId, null, { sys: SB, tid: TB });
  const dB = await mkDeal({ title: `ดีลบี${SECRET_F}`, contactId: kB.id, ownerUserId: ownerB.userId, teamId: null, pipe: pB, sys: SB, tid: TB });
  const aB = await rawAct({ title: `โทรบี${SECRET_F}`, ownerUserId: ownerB.userId, contactId: kB.id }, TB, SB);
  // approval policy for crm.discount (S4.2)
  const discPolicy = APR?.createPolicy ? await call(APR.createPolicy, { tenantId: T }, { name: `ส่วนลดเกินเพดาน ${TAG}`, entityType: "crm.discount", steps: [{ order: 1, approverRole: "OWNER" }] }) : ({ ok: false, err: "approval service missing" } as Res);

  // custom objects / fields through the accepted engines (C1.2a · C1.2b)
  const ownerActor = { userId: owner.userId, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const cS = { tenantId: T, systemId: S, actorUserId: owner.userId };
  const cS2 = { tenantId: T, systemId: S2, actorUserId: owner.userId };
  const cB = { tenantId: TB, systemId: SB, actorUserId: ownerB.userId };
  const ownerBActor = { userId: ownerB.userId, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const setupErr: string[] = [];
  const need = (r: Res, what: string) => { if (!r.ok) setupErr.push(`${what}: ${r.err}`); return r; };
  const fctx = (c: Any, objectKey: string, actor: Any = ownerActor) => ({ ...c, objectKey, actor });
  const addFields = async (c: Any, objectKey: string, sectionKey: string, defs: Any[], opts: { sensitive?: boolean; actor?: Any } = {}) => {
    const sec = need(await call(F?.createSection, fctx(c, objectKey, opts.actor), { key: sectionKey, label: `ส่วน ${sectionKey}`, ...(opts.sensitive ? { sensitive: true } : {}) }), `section ${objectKey}.${sectionKey}`);
    const out: Record<string, string> = {};
    for (const d of defs) {
      const r = need(await call(F?.createField, fctx(c, objectKey, opts.actor), { sectionId: sec.v?.id, ...d, ...(opts.sensitive ? { sensitive: true } : {}) }), `field ${objectKey}.${d.key}`);
      if (r.ok) out[d.key] = r.v?.id;
    }
    return out;
  };
  need(await call(OB.create, cS, ownerActor, { key: "car", label: "รถ", labelPlural: "รถ", parentType: "CONTACT", titleFieldKey: "plate", showAsTab: true }), "object car");
  await addFields(cS, "car", "carInfo", [{ key: "plate", label: "ทะเบียน", type: "TEXT" }, { key: "model", label: "รุ่น", type: "TEXT" }]);
  need(await call(OB.create, cS, ownerActor, { key: "contract", label: "สัญญา", labelPlural: "สัญญา", parentType: "COMPANY", titleFieldKey: "no", showAsTab: true }), "object contract");
  await addFields(cS, "contract", "cInfo", [{ key: "no", label: "เลขที่", type: "TEXT" }]);
  need(await call(OB.create, cS2, ownerActor, { key: "car", label: "รถ", labelPlural: "รถ", parentType: "CONTACT", titleFieldKey: "plate" }), "object car S2");
  await addFields(cS2, "car", "carInfo", [{ key: "plate", label: "ทะเบียน", type: "TEXT" }]);
  need(await call(OB.create, cS2, ownerActor, { key: "onlys2", label: "เฉพาะระบบสอง", labelPlural: "เฉพาะระบบสอง", parentType: "CONTACT", titleFieldKey: "name" }), "object onlys2");
  need(await call(OB.create, cB, ownerBActor, { key: "car", label: "รถ", labelPlural: "รถ", parentType: "CONTACT", titleFieldKey: "plate" }), "object car B");
  await addFields(cB, "car", "carInfo", [{ key: "plate", label: "ทะเบียน", type: "TEXT" }], { actor: ownerBActor });
  const R = OB.records ?? {};
  const PLATE_P = `กข-${rand}-1`;
  const recP = need(await call(R.create, cS, ownerActor, "car", { parentId: kP.id, values: { plate: PLATE_P, model: "วีออส" } }), "record recP").v?.id as string;
  const recK = need(await call(R.create, cS, ownerActor, "car", { parentId: kK.id, values: { plate: `${SECRET_K}-2` } }), "record recK").v?.id as string;
  const recS2 = need(await call(R.create, cS2, ownerActor, "car", { parentId: kS2.id, values: { plate: `${SECRET_F}-3` } }), "record recS2").v?.id as string;
  const recB = need(await call(R.create, cB, ownerBActor, "car", { parentId: kB.id, values: { plate: `${SECRET_F}-4` } }), "record recB").v?.id as string;
  // contact/company custom fields (plain + sensitive) — values through the C1.3/C1.4 services
  const cf = await addFields(cS, "contact", "qcExtra", [{ key: "qcRegion", label: "ภูมิภาค", type: "TEXT" }]);
  const cfS = await addFields(cS, "contact", "qcSecret", [{ key: "qcSecretNote", label: "บันทึกลับ", type: "TEXT" }], { sensitive: true });
  const cof = await addFields(cS, "company", "qcCoExtra", [{ key: "qcCoTier", label: "ระดับบริษัท", type: "TEXT" }]);
  const REGION_B = `ภาคเหนือ${rand}`;
  const TIER_B = `ทองคำ${rand}`;
  need(await call(CT.updateContact, cS, ownerActor, kMB.id, { fields: { qcRegion: REGION_B } }), "contact field value kMB");
  need(await call(CT.updateContact, cS, ownerActor, kP.id, { fields: { qcSecretNote: SECRET_S } }), "sensitive value kP");
  need(await call(CO.updateCompany, cS, ownerActor, coMB, { fields: { qcCoTier: TIER_B } }), "company field value coMB");
  chk("C1.10-SETUP.1", "[prerequisite C1.2a–C1.4] fixtures: objects car/contract (+ S2/B), records, contact/company custom fields (plain + sensitive) and their values were created through the accepted services — if red, checks relying on them are red for that reason",
    setupErr.length === 0 && !!recP && !!recK && !!cf.qcRegion && !!cfS.qcSecretNote && !!cof.qcCoTier && discPolicy.ok, "all ok", cut(`${setupErr.join(" · ")} policy=${discPolicy.err}`, 500), "MAJOR");

  // ─── keys ───
  const bundles = (SC.API_SCOPE_BUNDLES ?? []) as Any[];
  const bRO = bundles.find((b) => /^crm[.\-_](readonly|read|read-only)$/i.test(String(b.id)));
  const bOP = bundles.find((b) => /^crm[.\-_]operate$/i.test(String(b.id)));
  const bAD = bundles.find((b) => /^crm[.\-_]admin$/i.test(String(b.id)));
  const roScopes: string[] = bRO ? [...bRO.scopes] : FALLBACK_RO;
  const opScopes: string[] = bOP ? [...bOP.scopes] : STAFF_DEFAULT;
  const adScopes: string[] = bAD ? [...bAD.scopes] : KEYS_61;
  const memBundle = bundles.find((b) => b.id === "member-admin");
  const mkKey = async (label: string, scopes: string[], systemId: string | null, tid = T, createdById: string | null = owner.userId): Promise<{ raw: string; id: string }> => {
    try {
      const k = await AK.createApiKey({ tenantId: tid }, `${TAG} ${label}`, { scopes, systemId, createdById });
      KEY_IDS.push(k.id);
      return { raw: k.rawKey as string, id: k.id as string };
    } catch (e) {
      KEY_ERR[label] = e instanceof Error ? e.message : String(e);
      return { raw: "", id: "" };
    }
  };
  const kRO = await mkKey("readonly", roScopes, S);
  const kOP = await mkKey("operate", opScopes, S);
  const kAD = await mkKey("admin", adScopes, S);
  const kTeamP = await mkKey("operate+team", [...opScopes, `crm.filter.team:${teamP}`], S);
  const kOwnKai = await mkKey("readonly+owner", [...roScopes, `crm.filter.owner:${kai.userId}`], S);
  const kWriteOnly = await mkKey("write-only", ["crm.contact.create"], S);
  const kMem = await mkKey("member-admin", memBundle ? [...memBundle.scopes] : ["member.customer.read"], MEMSYS);
  const kMemUnbound = await mkKey("member-unbound", memBundle ? [...memBundle.scopes] : ["member.customer.read"], null);
  const kLegacy = await mkKey("legacy-empty", [], null);
  const kBv1 = await mkKey("b-admin-v1", adScopes, SB, TB, ownerB.userId);
  const kBUnbound = await mkKey("b-admin-unbound", adScopes, null, TB, ownerB.userId);
  const kTeamBad = await mkKey("filter-foreign-team", [...opScopes, `crm.filter.team:${teamB}`], S);
  const api = (method: string, path: string, key: string | null, body?: unknown, opt: { idem?: string | null; headers?: Record<string, string> } = {}) => callRoute(ROUTE, "crm", method, path, key, body, opt);
  const teamsApi = (method: string, path: string, key: string | null, body?: unknown) =>
    TROUTE ? callRoute(TROUTE, "teams", method, path.replace(/^\/teams/, "") || "/", key, body) : api(method, path, key, body);
  console.log(`[setup] A ${T} · S ${S} · S2 ${S2} · MEM ${MEMSYS} · B ${TB} · SB(v1) ${SB} · teams P ${teamP} / K ${teamK} · bundles ro=${bRO?.id ?? "-"} op=${bOP?.id ?? "-"} ad=${bAD?.id ?? "-"} · keyErrors ${Object.keys(KEY_ERR).join(",") || "-"}`);

  /** defer our pending outbox rows so no foreign drain picks them up (we consume selected ones directly) */
  const deferOutbox = async () => P.outboxEvent.updateMany({ where: { tenantId: { in: TENANTS }, status: "PENDING" }, data: { availableAt: new Date(Date.now() + DAY_MS) } });
  await deferOutbox();

  // sample request per MUST op (own ids by default · the X1 probe passes foreign ids)
  type Ids = { contact: string; contact2: string; company: string; company2: string; deal: string; activity: string; objKey: string; record: string; team: string; party: string; pipe: { id: string; st: string[] }; user: string };
  const OWN: Ids = { contact: kX1.id, contact2: kX2.id, company: coX1, company2: coX2, deal: dDel, activity: aDel, objKey: "car", record: recP, team: teamP, party: kP.partyId, pipe: pMain, user: owner.userId };
  const REASON = (id: string) => `เหตุผลทดสอบ ${id} ${rand}`;
  const sample = (id: string, I: Ids): { m: string; p: string; b?: Any } | null => {
    const now = Date.now();
    switch (id) {
      case "ping": return { m: "GET", p: "/ping" };
      case "contacts.list": return { m: "GET", p: "/contacts?take=5" };
      case "contacts.search": return { m: "GET", p: `/contacts/search?q=${encodeURIComponent("คุณ")}` };
      case "contacts.get": return { m: "GET", p: `/contacts/${I.contact}` };
      case "contacts.brief": return { m: "GET", p: `/contacts/brief?ids=${I.contact}` };
      case "contacts.byParty": return { m: "GET", p: `/contacts/by-party/${I.party}` };
      case "contacts.create": return { m: "POST", p: "/contacts", b: { firstName: `ผู้ติดต่อ API ${rand}`, sourceKind: "API" } };
      case "contacts.update": return { m: "PATCH", p: `/contacts/${I.contact}`, b: { jobTitle: "ผู้จัดการ" } };
      case "contacts.setLeadStatus": return { m: "PUT", p: `/contacts/${I.contact}/lead-status`, b: { leadStatus: "CONTACTED" } };
      case "contacts.assign": return { m: "PUT", p: `/contacts/${I.contact}/owner`, b: { userId: I.user } };
      case "contacts.setTags": return { m: "PUT", p: `/contacts/${I.contact}/tags`, b: { add: ["qc"], remove: [] } };
      case "contacts.setOptOut": return { m: "PUT", p: `/contacts/${I.contact}/opt-out`, b: { optOut: true } };
      case "contacts.archive": return { m: "POST", p: `/contacts/${I.contact}/archive`, b: {} };
      case "contacts.convert": return { m: "POST", p: `/contacts/${I.contact}/convert`, b: { company: { new: { name: `บริษัทแปลง ${rand}` } } } };
      case "contacts.duplicates.list": return { m: "GET", p: "/contacts/duplicates" };
      case "contacts.merge": return { m: "POST", p: `/contacts/${I.contact}/merge`, b: { mergeId: I.contact2 } };
      case "contacts.import.start": return { m: "POST", p: "/contacts/import", b: { rows: [{ ชื่อ: `นำเข้า ${rand}` }], mapping: { ชื่อ: "firstName" } } };
      case "contacts.export": return { m: "POST", p: "/contacts/export", b: {} };
      case "companies.list": return { m: "GET", p: "/companies?take=5" };
      case "companies.get": return { m: "GET", p: `/companies/${I.company}` };
      case "companies.create": return { m: "POST", p: "/companies", b: { name: `บริษัท API ${rand}` } };
      case "companies.update": return { m: "PATCH", p: `/companies/${I.company}`, b: { industry: "ท่องเที่ยว" } };
      case "companies.archive": return { m: "POST", p: `/companies/${I.company}/archive`, b: {} };
      case "companies.setOwner": return { m: "PUT", p: `/companies/${I.company}/owner`, b: { userId: I.user } };
      case "companies.contacts.add": return { m: "POST", p: `/companies/${I.company}/contacts`, b: { contactId: I.contact } };
      case "companies.duplicates.list": return { m: "GET", p: "/companies/duplicates" };
      case "companies.merge": return { m: "POST", p: `/companies/${I.company}/merge`, b: { mergeId: I.company2 } };
      case "deals.list": return { m: "GET", p: "/deals?take=5" };
      case "deals.board": return { m: "GET", p: `/deals/board?pipelineId=${I.pipe.id}` };
      case "deals.get": return { m: "GET", p: `/deals/${I.deal}` };
      case "deals.create": return { m: "POST", p: "/deals", b: { pipelineId: I.pipe.id, title: `ดีล API ${rand}`, contactId: I.contact } };
      case "deals.update": return { m: "PATCH", p: `/deals/${I.deal}`, b: { title: `ดีลแก้ ${rand}` } };
      case "deals.move": return { m: "PUT", p: `/deals/${I.deal}/stage`, b: { stageId: I.pipe.st[1] } };
      case "deals.reassign": return { m: "PUT", p: `/deals/${I.deal}/owner`, b: { ownerUserId: I.user } };
      case "deals.lines.set": return { m: "PUT", p: `/deals/${I.deal}/lines`, b: { lines: [{ name: "คอร์ส", qty: 1, unitPriceSatang: 100_000 }] } };
      case "deals.quote": return { m: "POST", p: `/deals/${I.deal}/quotation`, b: {} };
      case "deals.forecast": return { m: "GET", p: "/deals/forecast" };
      case "deals.delete": return { m: "DELETE", p: `/deals/${I.deal}`, b: {} };
      case "pipelines.list": return { m: "GET", p: "/pipelines" };
      case "activities.list": return { m: "GET", p: "/activities?take=5" };
      case "activities.get": return { m: "GET", p: `/activities/${I.activity}` };
      case "activities.log": return { m: "POST", p: "/activities", b: { type: "CALL", title: `โทร API ${rand}`, contactId: I.contact } };
      case "activities.complete": return { m: "POST", p: `/activities/${I.activity}/complete`, b: {} };
      case "activities.delete": return { m: "DELETE", p: `/activities/${I.activity}`, b: {} };
      case "calendar.list": return { m: "GET", p: `/calendar?from=${new Date(now - 7 * DAY_MS).toISOString()}&to=${new Date(now + 14 * DAY_MS).toISOString()}` };
      case "objects.list": return { m: "GET", p: "/objects" };
      case "records.list": return { m: "GET", p: `/objects/${I.objKey}/records?take=5` };
      case "records.get": return { m: "GET", p: `/objects/${I.objKey}/records/${I.record}` };
      case "records.create": return { m: "POST", p: `/objects/${I.objKey}/records`, b: { parentId: I.contact, values: { plate: `API-${rand}` } } };
      case "records.update": return { m: "PATCH", p: `/objects/${I.objKey}/records/${I.record}`, b: { values: { model: "แก้แล้ว" } } };
      case "records.archive": return { m: "POST", p: `/objects/${I.objKey}/records/${I.record}/archive`, b: {} };
      case "records.export": return { m: "POST", p: `/objects/${I.objKey}/records/export`, b: {} };
      case "teams.list": return { m: "GET", p: "/teams" };
      case "teams.create": return { m: "POST", p: "/teams", b: { name: `ทีม API ${rand}` } };
      case "teams.members.set": return { m: "PUT", p: `/teams/${I.team}/members`, b: { members: [{ userId: I.user, role: "MEMBER", acceptingLeads: true }] } };
      case "settings.get": return { m: "GET", p: "/settings" };
      case "settings.set": return { m: "PUT", p: "/settings", b: { chatToLead: true } };
      default: return null;
    }
  };
  /** sample for any registry op (MUST table, else a generic call built from the op's own path with `{}` bodies) */
  const reqFor = (op: Any, I: Ids, withConfirm = true): { m: string; p: string; b?: Any } => {
    const s = sample(op.id, I);
    const base = s ?? { m: op.method, p: String(op.path).replace(/\{[^}]*\}/g, (x: string) => (x === "{key}" ? I.objKey : I.contact)), b: op.method === "GET" ? undefined : {} };
    if (op.kind === "danger" && withConfirm && base.m !== "GET") base.b = { ...(base.b ?? {}), confirm: true, reason: REASON(op.id) };
    return base;
  };
  const isTeamsOp = (o: Any) => String(o?.path ?? "").startsWith("/teams");
  const callOp = (op: Any, key: string, I: Ids, withConfirm = true) => {
    const r = reqFor(op, I, withConfirm);
    return isTeamsOp(op) ? teamsApi(r.m, r.p, key, r.b) : api(r.m, r.p, key, r.b);
  };

  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — structure (static + registry shape)
  // ═════════════════════════════════════════════════════════════════════════════
  await section("S0 structure", async () => {
    const need0 = ["op.ts", "registry.ts", "dispatch.ts", "actor.ts", "config.ts", "tools.ts", "openapi.ts", "webhook-events.ts",
      "ops/contacts.ts", "ops/companies.ts", "ops/deals.ts", "ops/activities.ts", "ops/objects.ts", "ops/teams.ts", "ops/settings.ts"].map((f) => `${API_DIR}/${f}`);
    const missing = need0.filter((f) => !existsSync(f));
    const routeSrc = stripComments(read(ROUTE_FILE));
    const methodsMissing = ["GET", "POST", "PATCH", "PUT", "DELETE"].filter((m) => !new RegExp(`export\\s+(const|async\\s+function|function)\\s+${m}\\b`).test(routeSrc));
    chk("C1.10-S0.1", "crm/api files exist (op · registry · dispatch · actor · config · tools · openapi · webhook-events · ops/{contacts,companies,deals,activities,objects,teams,settings}) · registry loads CRM_OPS · route [...path] exports GET/POST/PATCH/PUT/DELETE through the dispatcher · openapi.json route exists",
      missing.length === 0 && !regErr && OPS.length > 0 && methodsMissing.length === 0 && /dispatch/.test(routeSrc) && existsSync(OA_FILE),
      "all present", `missing=${missing.join(",") || "-"} regErr=${cut(regErr, 120) || "-"} ops=${OPS.length} methodsMissing=${methodsMissing.join(",") || "-"} oa=${existsSync(OA_FILE)}`);
    const ids = OPS.map((o) => String(o.id));
    const mp = OPS.map((o) => `${o.method} ${normPath(String(o.path))}`);
    const bad: string[] = [];
    for (const o of OPS) {
      if (!["read", "write", "danger"].includes(o.kind)) bad.push(`${o.id}:kind`);
      if (typeof o.action !== "string" || !o.action.startsWith("crm.") || (typeof SC.isApiScope === "function" && !SC.isApiScope(o.action))) bad.push(`${o.id}:action=${o.action}`);
      if (typeof o.summary !== "string" || !o.summary.trim() || /[^\x20-\x7e]/.test(o.summary)) bad.push(`${o.id}:summary`);
      if (!thai(o.label)) bad.push(`${o.id}:label`);
      if (!/^C1\.10-(S|X)\d+(\.\d+)?$/.test(String(o.test ?? ""))) bad.push(`${o.id}:test=${o.test}`);
      if (o.input && typeof OA.jsonSchemaOf === "function") {
        try { const js = OA.jsonSchemaOf(o.input, "input"); if (js?.type === "object" && js.additionalProperties !== false) bad.push(`${o.id}:not-strict`); } catch { bad.push(`${o.id}:schema`); }
      }
    }
    chk("C1.10-S0.2", "registry shape: ≥ 45 ops · ids unique · method+path unique · kind read/write/danger · action = a crm.* API scope · summary ASCII EN · label Thai · test `C1.10-S…/X…` · object inputs strict (no tenantId/systemId smuggling)",
      OPS.length >= 45 && new Set(ids).size === ids.length && new Set(mp).size === mp.length && bad.length === 0,
      "clean", `ops=${OPS.length} dupIds=${ids.length - new Set(ids).size} dupPaths=${mp.length - new Set(mp).size} bad=${cut(bad.slice(0, 12).join(" "), 400)}`);
    const wrong: string[] = [];
    for (const c of MUST) {
      const o = opById(c.id);
      if (!o) { wrong.push(`${c.id}:MISSING`); continue; }
      if (o.method !== c.m || normPath(o.path) !== c.p) wrong.push(`${c.id}:${o.method} ${o.path}`);
      if (!c.k.split("|").includes(o.kind)) wrong.push(`${c.id}:kind=${o.kind}`);
      if (c.a && o.action !== c.a) wrong.push(`${c.id}:action=${o.action}`);
      if (!c.a && !String(o.action ?? "").startsWith("crm.")) wrong.push(`${c.id}:action=${o.action}`);
    }
    chk("C1.10-S0.3", `the ${MUST.length} MUST ops of the contract exist with the contract method · path · kind · action (deals.forecast rate "report")`,
      wrong.length === 0 && opById("deals.forecast")?.rate === "report", "all match", `${cut(wrong.join(" "), 600) || "-"} forecastRate=${opById("deals.forecast")?.rate}`);
    const tSrc = stripComments(read(TEAMS_ROUTE_FILE));
    chk("C1.10-S0.4", "R-C.7: teams REST lives at /api/v1/teams/* (src/app/api/v1/teams/[...path]/route.ts) and dispatches the SAME CRM registry/config (no second dispatcher) — see Q1",
      !!TROUTE && /crm\/api|crmApi\.dispatchTeams/.test(tSrc) && /dispatch/.test(tSrc) /* ORACLE-EDIT C1.10-S0.4: fitness F2.3 forces the facade (crmApi) — same registry */, "route delegating to crm/api", `exists=${existsSync(TEAMS_ROUTE_FILE)} src=${cut(tSrc.replace(/\s+/g, " "), 160)}`, "MAJOR");
    const opsSrc = walk(`${API_DIR}/ops`).map((f) => [f, stripComments(read(f))] as const);
    const engine = opsSrc.filter(([, s]) => /from\s+["']@\/lib\/core\/db["']|\bprisma\.|tenantDb\(|\.crm(Contact|Company|Deal|Activity)\.(create|update|delete|upsert)|\.customRecord\.(create|update)/.test(s)).map(([f]) => f);
    const svcImports = opsSrc.filter(([, s]) => /from\s+["'](\.\.\/\.\.\/|@\/lib\/modules\/crm\/)(contacts|companies|deals|activities|objects|pipelines|settings|visibility|lost-reasons)|from\s+["']@\/lib\/modules\/crm["']|from\s+["']@\/lib\/core\/teams["']/.test(s)).length;
    const dispSrc = stripComments(read(`${API_DIR}/dispatch.ts`));
    chk("C1.10-S0.5", "no second engine: ops/*.ts touch no prisma/tenantDb and write no CRM table themselves — they call the C1.2b–C1.8 services (+ core teams); dispatch.ts wraps core `@/lib/api/dispatch` [static]",
      opsSrc.length >= 7 && engine.length === 0 && svcImports >= 6 && /@\/lib\/api\/dispatch/.test(dispSrc), "services only", `files=${opsSrc.length} engine=${engine.join(",") || "-"} svcImports=${svcImports} coreDispatch=${/@\/lib\/api\/dispatch/.test(dispSrc)}`, "MAJOR");
    const allApi = walk(API_DIR).map(read).join("\n");
    const marks = ["X1", "X2", "X6", "X9"].filter((x) => !new RegExp(`AUDIT-CLASS ${x}\\b`).test(allApi));
    chk("C1.10-S0.6", "implementation sites marked `// AUDIT-CLASS X1 · X2 · X6 · X9` inside crm/api/** [static]", marks.length === 0, "4 markers", `missing=${marks.join(",") || "-"}`, "MINOR");
    const mk = typeof ACT.crmActorForKey === "function" ? ACT.crmActorForKey : Object.values(ACT).find((v: Any) => typeof v === "function" && /ActorForKey/.test(String((v as Any).name)));
    const aR = mk ? await call(mk, { keyId: "k1", scopes: roScopes, createdById: owner.userId }) : ({ ok: false, err: "no *ActorForKey export" } as Res);
    const aO = mk ? await call(mk, { keyId: "k2", scopes: opScopes }) : aR;
    const aA = mk ? await call(mk, { keyId: "k3", scopes: [...adScopes, `crm.filter.team:${teamP}`] }) : aR;
    const role = (r: Res) => String(r.v?.apiRole ?? "").toUpperCase();
    chk("C1.10-S0.7", "C1.2a/C1.4 debt: API actor built by a memberActorForKey-style `crmActorForKey({keyId,scopes,createdById})` → apiRole READONLY/OPERATE/ADMIN per bundle · unitAccess ['*'] · permissions = the scopes (filters kept as pseudo-scopes) · no implicit read",
      aR.ok && role(aR) === "READONLY" && role(aO) === "OPERATE" && role(aA) === "ADMIN" && Array.isArray(aR.v?.unitAccess) && aR.v.unitAccess.includes("*") && aA.v?.permissions?.[`crm.filter.team:${teamP}`] === true && aR.v?.permissions?.["crm.contact.create"] !== true,
      "READONLY/OPERATE/ADMIN", `${aR.err} ${role(aR)}/${role(aO)}/${role(aA)} ua=${j(aR.v?.unitAccess)}`, "MAJOR");
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — every op carries a real test id (F13.10) + fitness F13.10–12 present
  // ═════════════════════════════════════════════════════════════════════════════
  await section("S1 test ids + fitness", async () => {
    const qcSrc = walk("scripts").filter((f) => /qc-crm-.*\.mts$/.test(f)).map(read).join("\n");
    const untested = OPS.filter((o) => !o.test || !qcSrc.includes(`"${o.test}"`));
    const fit = read("scripts/fitness.mts");
    const skillsSrc = read("src/lib/ai/skills.ts");
    const orphan = OPS.filter((o) => o.tool && !skillsSrc.includes(`"${o.tool.name}"`));
    chk("C1.10-S1.1", "F13.10: every CRM op's `test` id appears in scripts/qc-crm-*.mts · fitness.mts has F13.10 (test ids) · F13.11 (CRM-API.md = generator, via renderDocs import) · F13.12 (every op tool has a home in skills.ts) · F13.12 holds now",
      OPS.length > 0 && untested.length === 0 && /F13\.10/.test(fit) && /F13\.11/.test(fit) && /F13\.12/.test(fit) && /CRM_OPS/.test(fit) && /CRM-API\.md/.test(fit) && /gen-crm-api-docs/.test(fit) && orphan.length === 0,
      "all covered", `ops=${OPS.length} untested=${cut(untested.map((o) => `${o.id}(${o.test ?? "-"})`).join(","), 200) || "-"} F13.10/11/12=${/F13\.10/.test(fit)}/${/F13\.11/.test(fit)}/${/F13\.12/.test(fit)} orphanTools=${orphan.map((o) => o.tool.name).join(",") || "-"}`);
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — auth · bundles · visibility through keys (6)
  // ═════════════════════════════════════════════════════════════════════════════
  await section("S2 keys", async () => {
    const ping = await api("GET", "/ping", kRO.raw);
    const noKey = await api("GET", "/ping", null);
    const badKey = await api("GET", "/ping", "shark_bad_key_qc");
    const mism = await api("GET", "/ping", kBUnbound.raw, undefined, { headers: { "x-shark-system": S } });
    chk("C1.10-S2.1", "GET /ping (readonly) → 200 {ok, systemId S} + requestId + X-RateLimit-Limit/Remaining · no key / bad key → 401 · tenant-B key pointing at tenant A's system (X-Shark-System) → 403 system_mismatch",
      ping.status === 200 && dat(ping)?.ok === true && dat(ping)?.systemId === S && typeof ping.body?.requestId === "string" && !!ping.headers?.get("x-ratelimit-remaining") && !!ping.headers?.get("x-ratelimit-limit") &&
        noKey.status === 401 && badKey.status === 401 && mism.status === 403 && ecode(mism) === "system_mismatch",
      "200/401/401/403", `${sr(ping)} ${sr(noKey)} ${sr(badKey)} ${sr(mism)} ${cut(ping.text, 120)}`);
    const valid = (s: string) => typeof SC.isApiScope === "function" && SC.isApiScope(s);
    const ro = new Set<string>(bRO?.scopes ?? []); const op = new Set<string>(bOP?.scopes ?? []); const ad = new Set<string>(bAD?.scopes ?? []);
    const roBad = [...ro].filter((s) => WRITE_VERBS.test(s) || !s.startsWith("crm.") || s === "crm.commission.view");
    const opBad = [...op].filter((s) => /\.manage$|\.merge$|\.delete$|commission\.approve|crm\.contact\.export/.test(s) && s !== "crm.activity.delete");
    const adMissing = KEYS_61.filter((k) => !ad.has(k));
    chk("C1.10-S2.2", "3 bundles in scopes.ts (crm.readonly · crm.operate · crm.admin): readonly ⊂ operate ⊂ admin · readonly = read/view keys only (contact/company/deal/activity/record read + report.view, no commission.view) · operate adds the STAFF writes, no *.manage / merge / delete (activity.delete tolerated) / export · admin = every §6.1 key · every scope isApiScope",
      !!bRO && !!bOP && !!bAD && ["crm.contact.read", "crm.company.read", "crm.deal.read", "crm.activity.read", "crm.record.read", "crm.report.view"].every((s) => ro.has(s)) && roBad.length === 0 &&
        [...ro].every((s) => op.has(s)) && ["crm.contact.create", "crm.deal.create", "crm.deal.move", "crm.activity.create", "crm.record.create"].every((s) => op.has(s)) && opBad.length === 0 &&
        [...op].every((s) => ad.has(s)) && adMissing.length === 0 && [...ad].every(valid),
      "3 nested bundles", `ids=${bRO?.id}/${bOP?.id}/${bAD?.id} roBad=${roBad.join(",") || "-"} opBad=${opBad.join(",") || "-"} adMissing=${adMissing.slice(0, 5).join(",") || "-"}`);
    // readonly: every MUST write/danger op → 403 · nothing changes
    const snap = async () => j(await Promise.all([
      P.crmContact.count({ where: { tenantId: T } }), P.crmDeal.count({ where: { tenantId: T } }), P.crmCompany.count({ where: { tenantId: T } }),
      P.crmActivity.count({ where: { tenantId: T } }), P.customRecord.count({ where: { tenantId: T } }), P.team.count({ where: { tenantId: T } }),
      P.crmContact.findUnique({ where: { id: kX1.id }, select: { jobTitle: true, leadStatus: true, tags: true, archivedAt: true, ownerUserId: true } }),
      P.crmDeal.findUnique({ where: { id: dDel }, select: { title: true, stageId: true } }),
    ]));
    const before = await snap();
    const roRes: string[] = [];
    for (const c of MUST.filter((x) => x.k !== "read")) {
      const o = opById(c.id);
      if (!o) { roRes.push(`${c.id}:MISSING`); continue; }
      const r = await callOp(o, kRO.raw, OWN);
      if (!is403(r)) roRes.push(`${c.id}:${sr(r)}`);
    }
    const after = await snap();
    const roGet = await api("GET", `/contacts/${kP.id}`, kRO.raw);
    chk("C1.10-S2.3", "🔴 readonly key: every MUST write/danger op → 403 (scope_missing|forbidden · Thai message) and NOTHING changes in the database · reads work (GET /contacts/{id} 200)",
      OPS.length > 0 && roRes.length === 0 && before === after && roGet.status === 200, "all 403 · unchanged", `bad=${cut(roRes.join(" "), 300) || "-"} changed=${before !== after} get=${sr(roGet)}`);
    const cName = `คุณโอเปอเรต ${rand}`;
    const cC = await api("POST", "/contacts", kOP.raw, { firstName: cName, phone: phoneOf(), sourceKind: "API" });
    const cId = idOf(dat(cC), "contactId", "contact.id");
    const cD = await api("POST", "/deals", kOP.raw, { pipelineId: pMain.id, title: `ดีลโอเปอเรต ${rand}`, contactId: cId || kP2.id });
    const dId = idOf(dat(cD), "dealId", "deal.id");
    const cA = await api("POST", "/activities", kOP.raw, { type: "CALL", title: `โทรโอเปอเรต ${rand}`, contactId: cId || kP2.id });
    const denied: string[] = [];
    for (const id of ["contacts.merge", "companies.merge", "deals.delete", "settings.set", "teams.create"]) {
      const o = opById(id);
      if (!o) { denied.push(`${id}:MISSING`); continue; }
      const r = await callOp(o, kOP.raw, OWN);
      if (!is403(r)) denied.push(`${id}:${sr(r)}`);
    }
    const auditOp = await P.auditLog.count({ where: { tenantId: T, actorType: "API_KEY" } });
    chk("C1.10-S2.4", "operate key: POST /contacts · /deals · /activities → 200 with ids (rows in system S) and API_KEY audit rows · merge / deal delete / settings.set / teams.create → 403",
      cC.status === 200 && !!cId && cD.status === 200 && !!dId && cA.status === 200 && !!(await P.crmContact.findFirst({ where: { id: cId || NONE, systemId: S } })) &&
        !!(await P.crmDeal.findFirst({ where: { id: dId || NONE, systemId: S } })) && denied.length === 0 && auditOp >= 3,
      "3×200 · 5×403", `${sr(cC)} ${sr(cD)} ${sr(cA)} denied=${denied.join(" ") || "ok"} audit=${auditOp} ${cut(cC.text, 120)}`);
    const sg = await api("GET", "/settings", kAD.raw);
    const ss = await api("PUT", "/settings", kAD.raw, { chatToLead: true });
    const sysRow = (await P.appSystem.findUnique({ where: { id: S } })) as Any;
    const tc = await teamsApi("POST", "/teams", kAD.raw, { name: `ทีม API ${rand}` });
    const newTeam = idOf(dat(tc), "teamId", "team.id");
    const tm = newTeam ? await teamsApi("PUT", `/teams/${newTeam}/members`, kAD.raw, { members: [{ userId: kai.userId, role: "MEMBER", acceptingLeads: true }] }) : ({ status: 0, body: null, headers: null, text: "no team" } as Resp);
    const tl = await teamsApi("GET", "/teams", kRO.raw);
    const tNames = j(dat(tl));
    chk("C1.10-S2.5", "admin key: GET /settings → uiVersion 2 · PUT /settings {chatToLead:true} persisted (settings.crm.chatToLead, uiVersion kept 2) · POST /teams → Team row in tenant A · PUT /teams/{id}/members → TeamMember rows · GET /teams (readonly) lists both teams and nothing of tenant B",
      sg.status === 200 && Number(dat(sg)?.uiVersion) === 2 && ss.status === 200 && sysRow?.settings?.crm?.chatToLead === true && sysRow?.settings?.crm?.uiVersion === 2 &&
        tc.status === 200 && !!(await P.team.findFirst({ where: { id: newTeam || NONE, tenantId: T } })) && tm.status === 200 &&
        (await P.teamMember.count({ where: { teamId: newTeam || NONE, userId: kai.userId } })) === 1 && tl.status === 200 && tNames.includes(`ภูเก็ต ${rand}`) && !tNames.includes(SECRET_F),
      "all ok", `${sr(sg)} ${sr(ss)} crm=${j(sysRow?.settings?.crm)} ${sr(tc)} ${sr(tm)} ${sr(tl)}`);
    const fl = await api("GET", "/deals?take=100", kTeamP.raw);
    const fIds = idsIn(dat(fl));
    const fGetK = await api("GET", `/deals/${dK1}`, kTeamP.raw);
    const fNewK = await api("POST", "/deals", kTeamP.raw, { pipelineId: pMain.id, title: `แอบสร้าง ${rand}`, contactId: kK.id });
    const ol = await api("GET", "/deals?take=100", kOwnKai.raw);
    const oIds = idsIn(dat(ol));
    const badTeamKey = !kTeamBad.raw;
    chk("C1.10-S2.6", "🔴 key filters (R-C.3 pseudo-scopes in scopesJson): `crm.filter.team:<phuket>` → GET /deals lists phuket deals only (dP1, dP2 · no krabi) · GET krabi deal 404 · POST deal on a krabi contact 404 · `crm.filter.owner:<kai>` → only kai's deal · a filter naming a team of ANOTHER tenant is refused at key creation",
      fl.status === 200 && fIds.has(dP1) && fIds.has(dP2) && !fIds.has(dK1) && !fIds.has(dK2) && !fl.text.includes(SECRET_K) && is404(fGetK) && is404(fNewK) &&
        ol.status === 200 && oIds.has(dK2) && !oIds.has(dK1) && !oIds.has(dP1) && badTeamKey,
      "team/owner narrowed", `keys=${KEY_ERR["operate+team"] ?? "ok"}/${KEY_ERR["readonly+owner"] ?? "ok"} team=${sr(fl)} [${[...fIds].length}] getK=${sr(fGetK)} newK=${sr(fNewK)} owner=${sr(ol)} [${[...oIds].length}] foreignFilterRefused=${badTeamKey}`);
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — Idempotency-Key (2)
  // ═════════════════════════════════════════════════════════════════════════════
  await section("S3 idempotency", async () => {
    const idem = `${TAG}-idem-1`;
    const name = `คุณกันซ้ำ ${rand}`;
    const b = { firstName: name, sourceKind: "API" };
    const r1 = await api("POST", "/contacts", kOP.raw, b, { idem });
    const r2 = await api("POST", "/contacts", kOP.raw, b, { idem });
    const noIdem = await api("POST", "/contacts", kOP.raw, { firstName: `ไม่มีคีย์ ${rand}` }, { idem: null });
    const rows = await P.crmContact.count({ where: { tenantId: T, firstName: name } });
    chk("C1.10-S3.1", "same Idempotency-Key + same body twice → second answer = first (same contactId) with `Idempotent-Replayed: true` · ONE row · POST without Idempotency-Key → 400 idempotency_required (nothing written)",
      r1.status === 200 && r2.status === 200 && idOf(dat(r1), "contactId", "contact.id") === idOf(dat(r2), "contactId", "contact.id") && !!idOf(dat(r1), "contactId", "contact.id") &&
        r2.headers?.get("idempotent-replayed") === "true" && rows === 1 && noIdem.status === 400 && ecode(noIdem) === "idempotency_required" &&
        (await P.crmContact.count({ where: { tenantId: T, firstName: `ไม่มีคีย์ ${rand}` } })) === 0,
      "replayed · 1 row · 400", `${sr(r1)} ${sr(r2)} replay=${r2.headers?.get("idempotent-replayed")} rows=${rows} noIdem=${sr(noIdem)}`);
    const r3 = await api("POST", "/contacts", kOP.raw, { firstName: `${name} ต่าง` }, { idem });
    chk("C1.10-S3.2", "same Idempotency-Key with a DIFFERENT body → 409 idempotency_conflict · no second row",
      r3.status === 409 && ecode(r3) === "idempotency_conflict" && (await P.crmContact.count({ where: { tenantId: T, firstName: `${name} ต่าง` } })) === 0, "409", sr(r3));
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — STAGE_REQUIREMENTS · APPROVAL_REQUIRED · CONFLICT · the error mapping table (4)
  // ═════════════════════════════════════════════════════════════════════════════
  await section("S4 error shapes", async () => {
    await P.crmStage.update({ where: { id: pMain.st[1] }, data: { requireLines: true } });
    const mv = await api("PUT", `/deals/${dP2}/stage`, kAD.raw, { stageId: pMain.st[1] });
    const dRow = (await P.crmDeal.findUnique({ where: { id: dP2 } })) as Any;
    const missTxt = j({ d: mv.body?.error?.details, m: mv.body?.error?.missing, x: mv.body?.error });
    chk("C1.10-S4.1", "PUT /deals/{id}/stage into a stage with requireLines and no lines → 409|422 code stage_requirements · the missing list names LINES (error.details[] or error.missing) · Thai message · deal stays in its stage",
      (mv.status === 409 || mv.status === 422) && ecode(mv) === "stage_requirements" && /LINES/.test(missTxt) && thai(mv.body?.error?.message_th) && dRow?.stageId === pMain.st[0],
      "stage_requirements + LINES", `${sr(mv)} ${cut(missTxt, 200)} stage=${dRow?.stageId === pMain.st[0] ? "unchanged" : "MOVED"}`);
    await P.crmStage.update({ where: { id: pMain.st[1] }, data: { requireLines: false } });
    const ln = await api("PUT", `/deals/${dLines}/lines`, kOP.raw, { lines: [{ name: "คอร์สกลุ่ม", qty: 1, unitPriceSatang: 1_000_000, discountBp: 5000 }], discountBp: 5000 });
    const apId = String(dat(ln)?.approvalRequestId ?? ln.body?.error?.approvalRequestId ?? (/(c[a-z0-9]{20,})/.exec(j(ln.body?.error ?? {}))?.[1] ?? ""));
    const apRow = apId ? ((await P.approvalRequest.findFirst({ where: { id: apId, tenantId: T } })) as Any) : null;
    const lines = await P.crmDealLine.count({ where: { dealId: dLines } });
    const ok202 = ln.status === 202 && String(dat(ln)?.status ?? "").toUpperCase() === "APPROVAL_REQUIRED";
    const ok409 = ln.status === 409 && ecode(ln) === "approval_required";
    chk("C1.10-S4.2", "PUT /deals/{id}/lines above the discount cap (policy crm.discount present) → 202 {status APPROVAL_REQUIRED, approvalRequestId} or 409 approval_required carrying approvalRequestId · the ApprovalRequest row exists (entityType crm.discount) · deal lines NOT applied",
      (ok202 || ok409) && !!apRow && apRow.entityType === "crm.discount" && lines === 0, "approval pending", `${sr(ln)} ap=${apId || "-"} row=${apRow?.entityType ?? "-"} lines=${lines} ${cut(ln.text, 160)}`);
    const dupTax = await api("PATCH", `/companies/${coN}`, kAD.raw, { taxId: coTax });
    const coNRow = (await P.crmCompany.findUnique({ where: { id: coN } })) as Any;
    chk("C1.10-S4.3", "CONFLICT: PATCH /companies/{id} with the taxId of another company → 409 (duplicate|state_conflict|conflict) Thai message that does not echo the other company's name · taxId unchanged",
      dupTax.status === 409 && ["duplicate", "state_conflict", "conflict"].includes(ecode(dupTax)) && thai(dupTax.body?.error?.message_th) && !dupTax.text.includes(`บริษัทภูเก็ต ${rand}`) && coNRow?.taxId === null,
      "409", `${sr(dupTax)} taxId=${coNRow?.taxId} ${cut(dupTax.text, 140)}`);
    const nf = await api("GET", `/deals/${NONE}`, kAD.raw);
    const reas = await api("PUT", `/deals/${dK1}/owner`, kOP.raw, { ownerUserId: thana.userId, teamId: teamP });
    const dK1Row = (await P.crmDeal.findUnique({ where: { id: dK1 } })) as Any;
    const svcVal = await api("POST", "/deals", kAD.raw, { pipelineId: pMain.id, title: `ดีลเกินเพดาน ${rand}`, contactId: kP2.id, valueSatang: 2_100_000_000 });
    const schemaVal = await api("POST", "/deals", kAD.raw, { pipelineId: pMain.id, title: 42 });
    const designOps = OPS.filter((o) => o.action === "crm.object.manage");
    const design: string[] = [];
    for (const o of designOps) { const r = await callOp(o, kAD.raw, OWN); if (r.status !== 403) design.push(`${o.id}:${sr(r)}`); }
    chk("C1.10-S4.4", "error mapping (C1.3 debt FORBIDDEN→403): unknown id → 404 not_found · operate key cross-team reassign (no crm.deal.reassign) → 403, deal unchanged · service VALIDATION (value > ฿20M) → 400|422 code validation (not `unprocessable`) Thai · schema error → 400|422 validation + details[] · every `crm.object.manage` op with an ADMIN key → 403 (never 422)",
      is404(nf) && ecode(nf) === "not_found" && is403(reas) && thai(reas.body?.error?.message_th) && dK1Row?.ownerUserId === nok.userId &&
        isVal(svcVal) && thai(svcVal.body?.error?.message_th) && isVal(schemaVal) && Array.isArray(schemaVal.body?.error?.details) && design.length === 0,
      "404/403/validation/validation/403", `nf=${sr(nf)} reassign=${sr(reas)} owner=${dK1Row?.ownerUserId === nok.userId ? "kept" : "CHANGED"} svc=${sr(svcVal)} schema=${sr(schemaVal)} design=${design.join(",") || `ok(${designOps.length})`}`);
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 — dynamic objects `/objects/{key}/records` (3)
  // ═════════════════════════════════════════════════════════════════════════════
  let newRec = "";
  await section("S5 objects", async () => {
    const rl = await api("GET", "/objects/car/records?take=100", kRO.raw);
    const rIds = idsIn(dat(rl));
    const unknown = await api("GET", "/objects/nope/records", kRO.raw);
    const ol = await api("GET", "/objects", kRO.raw);
    const oKeys = itemsOf(dat(ol)).map((o: Any) => String(o?.key ?? ""));
    chk("C1.10-S5.1", "GET /objects/car/records (readonly) → this system's car records (recP, recK) and not S2's · the key resolves at dispatch: /objects/nope/records → 404 · GET /objects lists car + contract, not S2's `onlys2`",
      rl.status === 200 && rIds.has(recP) && rIds.has(recK) && !rIds.has(recS2) && !rl.text.includes(SECRET_F) && is404(unknown) && ol.status === 200 && oKeys.includes("car") && oKeys.includes("contract") && !oKeys.includes("onlys2"),
      "scoped list · 404", `${sr(rl)} [${[...rIds].length}] unknown=${sr(unknown)} objects=${sr(ol)} ${oKeys.join(",")}`);
    const plate = `API-${rand}-5`;
    const cr = await api("POST", "/objects/car/records", kOP.raw, { parentId: kP2.id, values: { plate, model: "ยาริส" } });
    newRec = idOf(dat(cr), "recordId", "record.id");
    const up = newRec ? await api("PATCH", `/objects/car/records/${newRec}`, kOP.raw, { values: { model: "แก้แล้ว" } }) : cr;
    const gt = newRec ? await api("GET", `/objects/car/records/${newRec}`, kRO.raw) : cr;
    const roW = await api("POST", "/objects/car/records", kRO.raw, { parentId: kP2.id, values: { plate: `RO-${rand}` } });
    const row = newRec ? ((await P.customRecord.findUnique({ where: { id: newRec } })) as Any) : null;
    chk("C1.10-S5.2", "POST /objects/car/records (operate) → record in system S under kP2 · title from titleFieldKey (plate) · PATCH values → GET returns the new value · readonly key POST → 403 and no row (C1.2b: records writes need OPERATE/ADMIN)",
      cr.status === 200 && !!row && row.systemId === S && row.parentId === kP2.id && row.title === plate && up.status === 200 && gt.status === 200 && j(dat(gt)).includes("แก้แล้ว") &&
        is403(roW) && (await P.customRecord.count({ where: { tenantId: T, title: `RO-${rand}` } })) === 0,
      "created · updated · 403", `${sr(cr)} ${sr(up)} ${sr(gt)} ro=${sr(roW)} row=${j(row ? { s: row.systemId === S, p: row.parentId, t: row.title } : null)}`);
    const wrongKey = await api("GET", `/objects/contract/records/${recP}`, kRO.raw);
    const ar = newRec ? await api("POST", `/objects/car/records/${newRec}/archive`, kAD.raw /* ORACLE-EDIT C1.10-S5.3: archive = crm.record.delete, not in the operate bundle (S2.2) */, opById("records.archive")?.kind === "danger" ? { confirm: true, reason: REASON("records.archive") } : {}) : cr;
    const arRow = newRec ? ((await P.customRecord.findUnique({ where: { id: newRec } })) as Any) : null;
    const ex = await api("POST", "/objects/car/records/export", kAD.raw, { confirm: true, reason: REASON("records.export") });
    const csv = String(dat(ex)?.csv ?? (typeof dat(ex) === "string" ? dat(ex) : ""));
    chk("C1.10-S5.3", "a record addressed through the WRONG object key (/objects/contract/records/<car record>) → 404 · POST …/{id}/archive → archivedAt set · POST /objects/car/records/export (danger, confirm+reason) → {csv} containing plate values of this system only",
      is404(wrongKey) && ar.status === 200 && !!arRow?.archivedAt && ex.status === 200 && csv.includes(PLATE_P) && !csv.includes(SECRET_F),
      "404 · archived · csv", `wrong=${sr(wrongKey)} archive=${sr(ar)} at=${!!arRow?.archivedAt} export=${sr(ex)} csv=${csv.length}b`);
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // S6 — AI tools: skill `crm` (14) · read immediately · write = proposal (4)
  // ═════════════════════════════════════════════════════════════════════════════
  const viewer = (w: Who, sys = S, tid = T) => ({ tenantId: tid, systemId: sys, userId: w.userId, role: w.role, unitAccess: w.unitAccess, permissions: w.permissions });
  const membershipOf = (w: Who) => ({ role: w.role, unitAccess: w.unitAccess, permissions: w.permissions });
  const infos = (): Any[] => { try { return typeof TL.crmToolInfos === "function" ? (TL.crmToolInfos() as Any[]) : []; } catch { return []; } };
  /** args for a tool: fill the first required `*Id`-ish property with `id` (tool arg names derive from the op path — see Q5) */
  const argsFor = (name: string, id: string | null, extra: Record<string, unknown> = {}) => {
    const info = infos().find((i) => i.name === name);
    const props = Object.keys(info?.parameters?.properties ?? {});
    const req: string[] = Array.isArray(info?.parameters?.required) ? info.parameters.required : [];
    // extra keys the tool schema does not declare are dropped (schemas are strict) — e.g. crm_create_lead takes firstName, not name
    const out: Record<string, unknown> = Object.fromEntries(Object.entries(extra).filter(([k]) => props.length === 0 || props.includes(k)));
    if (id) {
      const k = req.find((r) => /id$/i.test(r) && !(r in extra)) ?? props.find((p) => /id$/i.test(p) && !(p in extra) && p !== "pipelineId");
      if (k) out[k] = id;
    }
    return out;
  };
  const tool = async (ctx: Any, name: string, args: Any) => {
    const r = await call(TL.runCrmTool, ctx, name, args);
    return r.ok ? (r.v as Any) : { mode: "thrown", error: r.err };
  };
  const conv = async (tid: string) => (await P.aiConversation.create({ data: { tenantId: tid, title: `${TAG} conv` } })).id as string;
  await section("S6 AI tools", async () => {
    const names = new Set<string>(infos().map((i) => String(i.name)));
    const crmOpsWithTool = OPS.filter((o) => o.tool && /^crm_/.test(String(o.tool.name)));
    const wrong: string[] = [];
    for (const [n, spec] of Object.entries(TOOLS_14)) {
      const o = crmOpsWithTool.find((x) => x.tool.name === n);
      if (!o) { wrong.push(`${n}:no-op`); continue; }
      if (spec.op && o.id !== spec.op) wrong.push(`${n}:op=${o.id}`);
      if (spec.write !== (o.kind !== "read")) wrong.push(`${n}:kind=${o.kind}`);
    }
    const skill = ((SKL.SKILLS ?? []) as Any[]).find((s) => s.id === "crm");
    const reg = await call(SKL.assertSkillRegistryComplete);
    const tk = read(AI_TOOLS_FILE);
    const propSrc = read("src/lib/ai/proposals.ts");
    const crmT = typeof TCRM.crmTools === "function" ? (await call(TCRM.crmTools)).v ?? [] : [];
    chk("C1.10-S6.1", "the 14 tools of R-E.4 come from CRM_OPS `tool` (one op each · read tools on read ops, write tools on write/danger ops · op per the contract map) · crmToolInfos() lists them · skill `crm` holds all 14 · assertSkillRegistryComplete passes · tools-crm.ts builds crmTools() from the registry with createProposal + pendingConfirmation · ProposalKind has `crm.${string}`",
      Object.keys(TOOLS_14).every((n) => names.has(n)) && wrong.length === 0 && !!skill && Object.keys(TOOLS_14).every((n) => skill.tools.includes(n)) && reg.ok &&
        /createProposal/.test(tk) && /pendingConfirmation/.test(tk) && Array.isArray(crmT) && crmT.length >= 14 && /`crm\.\$\{string\}`/.test(propSrc),
      "14 wired", `missing=${Object.keys(TOOLS_14).filter((n) => !names.has(n)).join(",") || "-"} wrong=${wrong.join(",") || "-"} skill=${!!skill} registry=${reg.ok ? "ok" : cut(reg.err, 200)} crmTools=${Array.isArray(crmT) ? crmT.length : "-"}`);
    const vO = viewer(owner);
    const d360 = await tool(vO, "crm_deal_360", argsFor("crm_deal_360", dP1));
    const srch = await tool(vO, "crm_search", argsFor("crm_search", null, { q: `ภูเก็ต ${rand}` }));
    const ghost = await tool(vO, "crm_deal_360", argsFor("crm_deal_360", NONE));
    chk("C1.10-S6.2", "read tools run immediately: crm_deal_360 (owner viewer) → mode read with the deal · crm_search finds the phuket contact · unknown id → mode error in Thai (never throws)",
      d360?.mode === "read" && j(d360.result).includes(`ดีลภูเก็ตหนึ่ง ${rand}`) && srch?.mode === "read" && j(srch.result).includes(`คุณภูเก็ต ${rand}`) && ghost?.mode === "error" && thai(ghost.error),
      "read · read · error", `${d360?.mode}:${cut(d360?.error, 80)} ${srch?.mode} ${ghost?.mode}:${cut(ghost?.error, 60)}`);
    const title = `ดีลจากผู้ช่วย ${rand}`;
    const pr = await tool(vO, "crm_create_deal", argsFor("crm_create_deal", null, { pipelineId: pMain.id, title, contactId: kP2.id }));
    const noRow = (await P.crmDeal.count({ where: { tenantId: T, title } })) === 0;
    const cId = await conv(T);
    const execTool = (crmT as Any[]).find((t) => t?.def?.name === "crm_create_deal");
    const ex = execTool ? await call(() => execTool.execute({ tenantId: T, systemId: S, conversationId: cId }, { pipelineId: pMain.id, title, contactId: kP2.id })) : ({ ok: false, err: "no crm_create_deal AiTool" } as Res);
    const pid = String(((): Any => { try { return JSON.parse(String(ex.v ?? "{}")); } catch { return {}; } })().proposalId ?? "");
    const prow = pid ? ((await P.aiProposal.findFirst({ where: { id: pid, tenantId: T } })) as Any) : null;
    const denied = pid ? await call(PROP.executeProposal, membershipOf(reader), { tenantId: T }, pid, { userId: reader.userId }) : ({ ok: false } as Res);
    const stillPending = pid ? ((await P.aiProposal.findUnique({ where: { id: pid } })) as Any)?.status === "PENDING" : false;
    const done = pid ? await call(PROP.executeProposal, membershipOf(owner), { tenantId: T }, pid, { userId: owner.userId }) : ({ ok: false } as Res);
    const made = (await P.crmDeal.findFirst({ where: { tenantId: T, systemId: S, title } })) as Any;
    const aud = made ? await P.auditLog.count({ where: { tenantId: T, actorId: owner.userId, createdAt: { gte: new Date(Date.now() - 600_000) } } }) : 0;
    chk("C1.10-S6.3", "🔴 write tool crm_create_deal → mode propose {kind crm.<opId>, Thai summary} and NO row · crmTools().execute in a conversation → AiProposal PENDING kind crm.* · executeProposal by a STAFF without crm.deal.create → refused, stays PENDING · by the OWNER → the deal exists in system S + audit row of the owner",
      pr?.mode === "propose" && /^crm\./.test(String(pr.kind)) && thai(pr.summary) && noRow && !!prow && /^crm\./.test(prow.kind) && denied.ok && denied.v?.ok === false && stillPending &&
        done.ok && done.v?.ok === true && !!made && aud > 0,
      "propose → confirm", `${pr?.mode}/${pr?.kind} noRow=${noRow} proposal=${prow?.kind ?? cut(ex.err || ex.v, 80)} denied=${j(denied.v)} pending=${stillPending} done=${cut(j(done.v ?? done.err), 120)} deal=${!!made}`);
    const leadName = `ลีดจากผู้ช่วย ${rand}`;
    const lead = await tool(vO, "crm_create_lead", argsFor("crm_create_lead", null, { firstName: leadName, name: leadName }));
    let leadOk = false;
    if (lead?.mode === "propose") {
      const r = await call(TL.dispatchCrmKind, { ...viewer(owner), proposalId: `${TAG}-lead` }, lead.kind, lead.payload);
      leadOk = r.ok && (await P.crmContact.count({ where: { tenantId: T, systemId: S, OR: [{ firstName: leadName }, { name: leadName }] } })) === 1;
    }
    chk("C1.10-S6.4", "crm_create_lead on a uiVersion-2 system → proposal · dispatchCrmKind with the owner → exactly one contact in system S (the name kept by the v2 op)",
      lead?.mode === "propose" && leadOk, "contact created", `${lead?.mode}:${cut(lead?.error ?? lead?.kind, 100)} created=${leadOk}`);
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // S7 — webhooks: event filter + signed delivery (2)
  // ═════════════════════════════════════════════════════════════════════════════
  const hookPayloads: Any[] = [];
  await section("S7 webhooks", async () => {
    const all = ((WL.WEBHOOK_EVENTS ?? []) as Any[]).map((e) => String(e.value));
    const ev: string[] = typeof WE.crmWebhookEvents === "function" ? (WE.crmWebhookEvents() as string[]) : [];
    const expected = [...new Set(all.filter((e) => /^(crm\.|custom\.record\.|team\.)/.test(e)))];
    const MUST_EV = ["crm.contact.created", "crm.contact.updated", "crm.contact.assigned", "crm.contact.converted", "crm.contact.merged", "crm.company.created", "crm.company.updated", "crm.company.merged",
      "crm.deal.created", "crm.deal.stage.changed", "crm.deal.won", "crm.deal.lost", "crm.deal.reopened", "crm.deal.reassigned", "crm.deal.updated", "crm.activity.logged", "crm.activity.completed",
      "custom.record.created", "custom.record.updated", "custom.record.archived", "team.updated"];
    const isEp = typeof WE.isCrmWebhookEndpoint === "function" ? WE.isCrmWebhookEndpoint : null;
    chk("C1.10-S7.1", "crmWebhookEvents() = exactly the WEBHOOK_EVENTS entries prefixed crm. / custom.record. / team. (no duplicates, no member./account.) and covers the 21 phase-C1 events · isCrmWebhookEndpoint(['crm.deal.won']) true · ([]) false · (['crm.deal.won','member.created']) false",
      ev.length > 0 && new Set(ev).size === ev.length && ev.length === expected.length && expected.every((e) => ev.includes(e)) && MUST_EV.every((e) => ev.includes(e)) &&
        !!isEp && isEp(["crm.deal.won"]) === true && isEp([]) === false && isEp(["crm.deal.won", "member.created"]) === false,
      "exact filter", `ev=${ev.length}/${expected.length} missing=${MUST_EV.filter((e) => !ev.includes(e)).join(",") || "-"} isEp=${!!isEp}`);
    const ep = await call(WH.createEndpoint, { tenantId: T }, { url: `https://${HOOK_HOST}/crm`, events: ["crm.deal.won", "crm.contact.created"] });
    const t0 = new Date(Date.now() - 1000);
    const wName = `คุณเว็บฮุค ${rand}`;
    const wPhone = phoneOf();
    const wEmail = `${TAG}-hook@mail.invalid`;
    CONTACT_PII.push(wPhone, wEmail);
    const c = await api("POST", "/contacts", kOP.raw, { firstName: wName, phone: wPhone, email: wEmail, sourceKind: "API" });
    const mv = await api("PUT", `/deals/${dWon}/stage`, kAD.raw, { stageId: pMain.st[2] });
    await deferOutbox();
    const evts = (await P.outboxEvent.findMany({ where: { tenantId: T, type: { in: ["crm.deal.won", "crm.contact.created"] }, createdAt: { gte: t0 } }, orderBy: { createdAt: "asc" } })) as Any[];
    const cons = (OBC.consumers ?? {}) as Record<string, Any>;
    const before = HOOKS.length;
    for (const e of evts) await call(cons[e.type], e);
    await P.outboxEvent.updateMany({ where: { id: { in: evts.map((e) => e.id) } }, data: { status: "DONE", processedAt: new Date() } });
    const mine = HOOKS.slice(before);
    const secret = String(ep.v?.secret ?? "");
    const sigOk = mine.length > 0 && mine.every((h) => h.headers["x-shark-signature"] === createHmac("sha256", secret).update(h.body).digest("hex") &&
      h.headers["x-shark-signature-v2"] === createHmac("sha256", secret).update(`${h.headers["x-shark-timestamp"]}.${h.body}`).digest("hex"));
    const types = mine.map((h) => { try { const b = JSON.parse(h.body); hookPayloads.push(b); return String(b.type); } catch { return "?"; } });
    const won = hookPayloads.find((b) => b?.type === "crm.deal.won");
    const deliveries = ep.ok ? await P.webhookDelivery.count({ where: { tenantId: T, endpointId: ep.v.id, status: "OK" } }) : 0;
    chk("C1.10-S7.2", "a webhook endpoint subscribed to crm.deal.won + crm.contact.created receives both after POST /contacts and PUT /deals/{id}/stage→WON (consumers run on OUR outbox rows) · X-Shark-Signature = HMAC(secret, body) · V2 = HMAC(secret, `ts.body`) · WebhookDelivery OK rows · crm.deal.won payload carries the dealId",
      ep.ok && c.status === 200 && mv.status === 200 && evts.length >= 2 && types.includes("crm.deal.won") && types.includes("crm.contact.created") && sigOk && deliveries >= 2 && j(won?.payload).includes(dWon),
      "2 signed deliveries", `ep=${ep.err || "ok"} contact=${sr(c)} move=${sr(mv)} events=${evts.map((e) => e.type).join(",")} hooks=${types.join(",")} sig=${sigOk} ok=${deliveries}`);
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // S8 — docs = generator (1)
  // ═════════════════════════════════════════════════════════════════════════════
  await section("S8 docs", async () => {
    const genSrc = read(GEN_FILE);
    const guarded = /import\.meta\.url/.test(genSrc) && /process\.argv\[1\]/.test(genSrc);
    let rendered = "";
    let gErr = "";
    if (guarded) {
      const G = (await import("./gen-crm-api-docs.mts" as string).catch((e: Any) => { gErr = e instanceof Error ? e.message : String(e); return {}; })) as Any;
      const r = await call(G.renderDocs);
      rendered = r.ok ? String(r.v) : "";
      if (!r.ok) gErr = gErr || r.err;
    }
    const md = read(DOC_FILE);
    const missingPaths = OPS.filter((o) => !md.includes(String(o.path)));
    chk("C1.10-S8.1", "docs/api/CRM-API.md === renderDocs() of scripts/gen-crm-api-docs.mts (main guarded by invokedDirectly · no --check run: the skill folder is gitignored) · no longer the hand draft ('draft สำหรับสั่งทำ' gone) · every registry path documented · keeps a clearly marked Planned section · mentions Idempotency-Key, confirm, the 3 bundles, crm.deal.won, AI tools",
      guarded && !!rendered && md === rendered && !/draft สำหรับสั่งทำ/.test(md) && missingPaths.length === 0 && /planned/i.test(md) && /Idempotency-Key/.test(md) && /confirm/.test(md) &&
        /crm[.\-]readonly|crm[.\-]read\b/.test(md) && /crm[.\-]admin/.test(md) && /crm\.deal\.won/.test(md) && /crm_create_deal/.test(md),
      "regenerated", `guard=${guarded} gen=${gErr ? cut(gErr, 120) : rendered.length} same=${md === rendered} draft=${/draft สำหรับสั่งทำ/.test(md)} missingPaths=${missingPaths.length}`);
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // S9 — settings/api page (mockup 14 right) — static; screenshots are the controller's (visual-crm.mts "1.10")
  // ═════════════════════════════════════════════════════════════════════════════
  await section("S9 page", async () => {
    const pageSrc = read(`${PAGE_DIR}/page.tsx`);
    const pageAll = walk(PAGE_DIR).map(read).join("\n");
    const compAll = walk("src/components/crm").map(read).join("\n");
    const ui = pageAll + compAll;
    const TESTIDS = ["crm-api-page", "crm-api-keys", "crm-api-new", "crm-api-curl", "crm-api-webhooks", "crm-api-deliveries"];
    const inv = ((): Any[] => { try { return JSON.parse(read("scripts/crm-ui-inventory.json")).rows ?? []; } catch { return []; } })();
    const invRows = inv.filter((r) => String(r.page ?? "").startsWith("/settings/api"));
    const clientBad = walk(PAGE_DIR).concat(walk("src/components/crm")).filter((f) => /['"]use client['"]/.test(read(f)) && /api\/(settings|keys)|ApiKey/i.test(f + read(f)))
      .filter((f) => /from\s+["']@\/lib\/core\/db["']|from\s+["']@\/lib\/modules\/crm["']|from\s+["']@\/lib\/api-keys\/service["']/.test(read(f)));
    const nav = read("src/lib/modules/crm/nav.ts");
    const vis = read("scripts/visual-crm.mts");
    chk("C1.10-S9.1", "page /crm/settings/api: CRM system guard (type CRM) + requireCrmV2Page + crmCan(…,'crm.api.manage') else notFound · 3 bundles · curl sample · skill manifest/tool list from CRM_OPS · webhooks + delivery log (reusing webhook service / member components) · testids crm-api-page/keys/new/curl/webhooks/deliveries · rows in crm-ui-inventory.json · registered in nav.ts · client files import no prisma-reaching module · visual-crm.mts has a \"1.10\" spec for it",
      /type:\s*["']CRM["']/.test(pageSrc) && /requireCrmV2Page/.test(pageSrc) && /crm\.api\.manage/.test(pageSrc) && /notFound\(\)/.test(pageSrc) && /CRM_OPS|crmToolInfos/.test(pageAll) &&
        /listDeliveries|Deliveries/.test(ui) && /curl /.test(ui) && TESTIDS.every((t) => ui.includes(t)) && invRows.length >= 4 && /settings\/api/.test(nav) && clientBad.length === 0 && /"1\.10"/.test(vis) && /settings\/api/.test(vis),
      "page per contract", `page=${pageSrc.length > 0} v2gate=${/requireCrmV2Page/.test(pageSrc)} key=${/crm\.api\.manage/.test(pageSrc)} testids=${TESTIDS.filter((t) => !ui.includes(t)).join(",") || "ok"} inv=${invRows.length} nav=${/settings\/api/.test(nav)} clientBad=${clientBad.join(",") || "-"} visual=${/"1\.10"/.test(vis)}`, "MAJOR");
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // S10 — uiVersion 1 (R-E.14 · PERMANENT RULE): every op 409 CRM_V2_DISABLED · legacy crm_create_lead keeps working
  // ═════════════════════════════════════════════════════════════════════════════
  const IDS_B: Ids = { contact: kB.id, contact2: kB.id, company: coB, company2: coB, deal: dB, activity: aB, objKey: "car", record: recB, team: teamB, party: kB.partyId, pipe: pB, user: ownerB.userId };
  await section("S10 uiVersion-1", async () => {
    const snapB = async () => j(await Promise.all([
      P.crmContact.count({ where: { tenantId: TB } }), P.crmDeal.count({ where: { tenantId: TB } }), P.crmCompany.count({ where: { tenantId: TB } }),
      P.crmActivity.count({ where: { tenantId: TB } }), P.customRecord.count({ where: { tenantId: TB } }), P.team.count({ where: { tenantId: TB } }),
      P.crmDeal.findUnique({ where: { id: dB }, select: { title: true, stageId: true, ownerUserId: true } }), (await P.appSystem.findUnique({ where: { id: SB } }))?.settings,
    ]));
    const before = await snapB();
    const bad: string[] = [];
    let n = 0;
    for (const o of OPS) {
      if (o.id === "ping") continue;
      n += 1;
      const r = await callOp(o, kBv1.raw, IDS_B);
      if (!(r.status === 409 && ecode(r) === "crm_v2_disabled" && thai(r.body?.error?.message_th))) bad.push(`${o.id}:${sr(r)}`);
      const r2 = o.method === "GET" ? r : await (isTeamsOp(o) ? teamsApi(o.method, reqFor(o, IDS_B).p, kBv1.raw, {}) : api(o.method, reqFor(o, IDS_B).p, kBv1.raw, {}));
      if (!(r2.status === 409 && ecode(r2) === "crm_v2_disabled")) bad.push(`${o.id}(empty body):${sr(r2)}`);
    }
    const after = await snapB();
    const auditB = await P.auditLog.count({ where: { tenantId: TB, actorType: "API_KEY" } });
    chk("C1.10-S10.1", `🔴 R-E.14: a key of a uiVersion-1 CRM system gets 409 code crm_v2_disabled (Thai message) from EVERY registry op but ping (${OPS.length ? OPS.length - 1 : 0}) — with a valid body AND with an empty body (the gate precedes validation) — and nothing of tenant B changes, no API audit row`,
      OPS.length > 0 && n > 0 && bad.length === 0 && before === after && auditB === 0, "all 409 crm_v2_disabled", `ops=${n} bad=${cut(bad.slice(0, 10).join(" "), 400) || "-"} changed=${before !== after} audit=${auditB}`);
    const vB = viewer(ownerB, SB, TB);
    const rd = await tool(vB, "crm_search", argsFor("crm_search", null, { q: "คุณ" }));
    const wr = await tool(vB, "crm_create_deal", argsFor("crm_create_deal", null, { pipelineId: pB.id, title: `ดีลวีหนึ่ง ${rand}`, contactId: kB.id }));
    let wrOk = wr?.mode === "error" && thai(wr.error);
    if (wr?.mode === "propose") {
      const d = await call(TL.dispatchCrmKind, { ...vB, proposalId: `${TAG}-v1deal` }, wr.kind, wr.payload);
      wrOk = !d.ok && thai(d.msg) && (await P.crmDeal.count({ where: { tenantId: TB, title: `ดีลวีหนึ่ง ${rand}` } })) === 0;
    }
    // legacy crm_create_lead on the v1 shop: through the registered AiTool + executeProposal (the path every shop uses today)
    const leadName = `ลีดวีหนึ่ง ${rand}`;
    const allTools = ((await import("@/lib/ai/tools" as string)) as Any).toolRegistry?.() as Any[] | undefined;
    const lt = (allTools ?? []).find((t) => t?.def?.name === "crm_create_lead");
    const cB2 = await conv(TB);
    const props = Object.keys(lt?.def?.parameters?.properties ?? {});
    const args = props.includes("firstName") ? { firstName: leadName } : { name: leadName };
    const lx = lt ? await call(() => lt.execute({ tenantId: TB, systemId: SB, conversationId: cB2 }, args)) : ({ ok: false, err: "no crm_create_lead tool" } as Res);
    const pid = String(((): Any => { try { return JSON.parse(String(lx.v ?? "{}")); } catch { return {}; } })().proposalId ?? "");
    const lr = pid ? await call(PROP.executeProposal, membershipOf(ownerB), { tenantId: TB }, pid, { userId: ownerB.userId }) : ({ ok: false } as Res);
    const leadRows = await P.crmContact.count({ where: { tenantId: TB, systemId: SB, OR: [{ name: leadName }, { firstName: leadName }] } });
    // a pending proposal of the OLD kind (created before C1.10) still executes
    const oldName = `ลีดข้อเสนอเก่า ${rand}`;
    const old = await call(PROP.createProposal, { tenantId: TB }, { conversationId: cB2, kind: "crm_create_lead", summary: `บันทึก ${oldName}`, payload: { name: oldName } });
    const oldR = old.ok ? await call(PROP.executeProposal, membershipOf(ownerB), { tenantId: TB }, old.v.id, { userId: ownerB.userId }) : old;
    const oldRows = await P.crmContact.count({ where: { tenantId: TB, systemId: SB, OR: [{ name: oldName }, { firstName: oldName }] } });
    chk("C1.10-S10.2", "AI on the uiVersion-1 shop: crm_search → mode error (Thai) · crm_create_deal → error at proposal time (or a proposal whose dispatch refuses, nothing written) · the legacy crm_create_lead keeps working end-to-end (tool → proposal → executeProposal → contact in SB) · a pending proposal of the old kind `crm_create_lead` still executes",
      rd?.mode === "error" && thai(rd.error) && wrOk && lr.ok && lr.v?.ok === true && leadRows === 1 && oldR.ok && oldR.v?.ok === true && oldRows === 1,
      "v1 refused · legacy works", `search=${rd?.mode} deal=${wr?.mode}/${wrOk} lead=${cut(lx.err || lx.v, 80)} exec=${j(lr.v ?? lr.err)} rows=${leadRows} old=${j(oldR.v ?? oldR.err)} oldRows=${oldRows}`);
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // S11 — debts carried to C1.10 (C1.2b · C1.3 · C1.4 · C1.5 · C1.7)
  // ═════════════════════════════════════════════════════════════════════════════
  await section("S11 debts", async () => {
    // S11.1 C1.2b op layer — design ops never reachable with API keys
    const po = await api("POST", "/objects", kAD.raw, { key: `hack${rand}`, label: "แฮก", parentType: "CONTACT", titleFieldKey: "name" });
    const pa = await api("POST", "/objects/car/archive", kAD.raw, { confirm: true, reason: REASON("objects.archive") });
    const carRow = (await P.customObject.findFirst({ where: { systemId: S, key: "car" } })) as Any;
    chk("C1.10-S11.1", "C1.2b debt: `crm.objects.*` design ops are not exposed to API keys — POST /objects and POST /objects/car/archive with an ADMIN key → 403|404|405, no object created, car not archived",
      [403, 404, 405].includes(po.status) && [403, 404, 405].includes(pa.status) && (await P.customObject.count({ where: { tenantId: T, key: `hack${rand}` } })) === 0 && !carRow?.archivedAt,
      "refused", `${sr(po)} ${sr(pa)} carArchived=${!!carRow?.archivedAt}`, "MAJOR");
    // S11.2 export → import round trip keeps title · parent · values · unit · owner
    const ao = await call(OB.create, cS, ownerActor, { key: "asset", label: "ทรัพย์สิน", labelPlural: "ทรัพย์สิน", parentType: "CONTACT", titleFieldKey: "sn" });
    await addFields(cS, "asset", "aInfo", [{ key: "sn", label: "S/N", type: "TEXT" }, { key: "note", label: "หมายเหตุ", type: "TEXT" }]);
    const origIn = [
      { parentId: kP.id, values: { sn: `SN1-${rand}`, note: `โน้ตหนึ่ง${rand}` }, unitId: unitP, ownerUserId: thana.userId },
      { parentId: kP2.id, values: { sn: `SN2-${rand}`, note: `โน้ตสอง${rand}` }, unitId: unitK, ownerUserId: kai.userId },
    ];
    const orig: string[] = [];
    for (const x of origIn) { const r = await call(R.create, cS, ownerActor, "asset", x); if (r.ok) orig.push(r.v.id); }
    const csv = await call(R.export, cS, ownerActor, "asset");
    const imp = csv.ok ? await call(R.import, cS, ownerActor, "asset", { csv: csv.v }) : csv;
    const rows = (await P.customRecord.findMany({ where: { tenantId: T, systemId: S, object: { key: "asset" } } })) as Any[];
    const vals = (await P.customRecordValue.findMany({ where: { tenantId: T, recordId: { in: rows.map((r) => r.id) } }, include: { field: { select: { key: true } } } })) as Any[];
    const valOf = (rid: string, k: string) => vals.find((v) => v.recordId === rid && v.field?.key === k)?.valueText ?? null;
    const rt = origIn.every((x) => {
      const copies = rows.filter((r) => !orig.includes(r.id) && valOf(r.id, "sn") === x.values.sn);
      return copies.length === 1 && copies[0].parentId === x.parentId && copies[0].unitId === x.unitId && copies[0].ownerUserId === x.ownerUserId && copies[0].title === x.values.sn && valOf(copies[0].id, "note") === x.values.note;
    });
    chk("C1.10-S11.2", "C1.2b debt: records export → import round-trips title · parentId · every value · unitId · ownerUserId (import of the exported file recreates identical records)",
      ao.ok && orig.length === 2 && csv.ok && imp.ok && rt, "identical copies", `obj=${ao.err || "ok"} orig=${orig.length} export=${csv.err || `${String(csv.v).split("\n")[0]}`} import=${imp.err || j(imp.v)} rows=${rows.length}`, "MAJOR");
    // S11.3 field keys `title` / `parentId` no longer clash with the special CSV columns
    const clash: string[] = [];
    for (const k of ["title", "parentId"]) {
      const r = await call(F?.createField, fctx(cS, "asset"), { sectionId: ((await P.memberSection.findFirst({ where: { systemId: S, objectKey: "asset" } })) as Any)?.id, key: k, label: `ฟิลด์ ${k}`, type: "TEXT" });
      if (!r.ok) { if (!thai(r.msg)) clash.push(`${k}:refused-not-thai`); continue; }
      const rec = await call(R.create, cS, ownerActor, "asset", { parentId: kP.id, values: { sn: `SNC-${k}-${rand}`, [k]: `ค่า-${k}-${rand}` } });
      const ex = await call(R.export, cS, ownerActor, "asset");
      const im = ex.ok ? await call(R.import, cS, ownerActor, "asset", { csv: ex.v }) : ex;
      const copies = ((await P.customRecordValue.findMany({ where: { tenantId: T, valueText: `SNC-${k}-${rand}` } })) as Any[]).map((v) => v.recordId).filter((id) => id !== rec.v?.id);
      const cp = copies[0] ? ((await P.customRecord.findUnique({ where: { id: copies[0] } })) as Any) : null;
      const v = copies[0] ? ((await P.customRecordValue.findFirst({ where: { recordId: copies[0], field: { key: k, objectKey: "asset", systemId: S } } })) as Any)?.valueText : null;
      if (!(rec.ok && im.ok && cp && v === `ค่า-${k}-${rand}` && cp.parentId === kP.id && cp.title === `SNC-${k}-${rand}`)) clash.push(`${k}:roundtrip(${rec.err || im.err || `v=${v} parent=${cp?.parentId === kP.id} title=${cp?.title}`})`);
    }
    chk("C1.10-S11.3", "C1.2b debt: a custom field keyed `title` or `parentId` is either refused at creation with a Thai reason, or survives export→import without clobbering the record title/parent",
      clash.length === 0, "no clash", clash.join(" · ") || "-", "MAJOR");
    // S11.4 titleFieldKey change recomputes existing titles
    const ut = await call(OB.update, cS, ownerActor, "asset", { titleFieldKey: "note" });
    const o1 = orig[0] ? ((await P.customRecord.findUnique({ where: { id: orig[0] } })) as Any) : null;
    chk("C1.10-S11.4", "C1.2b debt: changing titleFieldKey (sn → note) recomputes the title of existing records",
      ut.ok && o1?.title === origIn[0]!.values.note, "title = note", `${ut.err} title=${o1?.title}`, "MAJOR");
    // S11.5 key rename rewrites LOOKUP options.objectKey
    await call(OB.create, cS, ownerActor, { key: "pet", label: "สัตว์เลี้ยง", labelPlural: "สัตว์เลี้ยง", parentType: "CONTACT", titleFieldKey: "pname" });
    await addFields(cS, "pet", "pInfo", [{ key: "pname", label: "ชื่อ", type: "TEXT" }]);
    await call(OB.create, cS, ownerActor, { key: "vet", label: "สัตวแพทย์", labelPlural: "สัตวแพทย์", parentType: "CONTACT", titleFieldKey: "vname" });
    await addFields(cS, "vet", "vInfo", [{ key: "vname", label: "ชื่อ", type: "TEXT" }, { key: "petRef", label: "สัตว์", type: "LOOKUP", options: { target: "CUSTOM", objectKey: "pet" } }]);
    const rn = await call(OB.update, cS, ownerActor, "pet", { key: "petx" });
    const lk = (await P.memberField.findFirst({ where: { tenantId: T, systemId: S, objectKey: "vet", key: "petRef" } })) as Any;
    chk("C1.10-S11.5", "C1.2b debt: renaming an object key (0 records) that a LOOKUP points at succeeds and rewrites the LOOKUP's options.objectKey to the new key",
      rn.ok && !!(await P.customObject.findFirst({ where: { systemId: S, key: "petx" } })) && lk?.options?.objectKey === "petx", "rewritten", `${rn.err} lookup=${j(lk?.options)}`, "MAJOR");
    // S11.6 merge moves custom values (C1.3 companies · C1.4 contacts)
    const mc = await api("POST", `/contacts/${kMA.id}/merge`, kAD.raw, { mergeId: kMB.id, confirm: true, reason: REASON("contacts.merge") });
    const mco = await api("POST", `/companies/${coMA}/merge`, kAD.raw, { mergeId: coMB, confirm: true, reason: REASON("companies.merge") });
    const cv = (await P.customRecordValue.findFirst({ where: { tenantId: T, recordType: "CONTACT", recordId: kMA.id, fieldId: cf.qcRegion ?? NONE } })) as Any;
    const cov = (await P.customRecordValue.findFirst({ where: { tenantId: T, recordType: "COMPANY", recordId: coMA, fieldId: cof.qcCoTier ?? NONE } })) as Any;
    chk("C1.10-S11.6", "C1.3/C1.4 debt: merging (REST, danger) moves the merged record's custom values onto the kept one when the kept has none — contact qcRegion and company qcCoTier",
      mc.status === 200 && mco.status === 200 && cv?.valueText === REGION_B && cov?.valueText === TIER_B, "values moved", `${sr(mc)} ${sr(mco)} contact=${cv?.valueText ?? "-"} company=${cov?.valueText ?? "-"}`, "MAJOR");
    const af = read("src/app/app/settings/staff/[membershipId]/AccessForm.tsx");
    chk("C1.10-S11.7", "C1.7 debt: AccessForm no longer claims managers can do everything without the CRM exception (names CRM / the settings keys a manager needs to be granted) [static]",
      af.length > 0 && (!/ผู้จัดการทำได้ทุกอย่าง/.test(af) || /CRM/.test(af)), "qualified text", cut((/.{0,60}ผู้จัดการ.{0,80}/.exec(af) ?? [""])[0], 160), "MINOR");
    const sp = read("src/app/app/sys/[id]/crm/settings/page.tsx");
    chk("C1.10-S11.8", "C1.5 debt (R-A): the general /crm/settings page exists and links the settings cards including /settings/api [static · see Q4]",
      // ORACLE-EDIT C1.10-S11.8 (controller · C1.11, 19 Sep): C1.11 makes /crm/settings also the v1↔v2 switch page, so it may not
      //   call requireCrmV2Page (a v1 OWNER must reach the switch). Accept the page's own branch instead: uiVersion !== 2 ⇒
      //   notFound() unless the switch card is allowed (C1.11 S6.10 + probe-c111-review N-2 cover the behaviour).
      sp.length > 0 && /settings\/api/.test(sp) && (/requireCrmV2Page/.test(sp) || (/uiVersion !== 2/.test(sp) && /notFound\(\)/.test(sp))), "page with api card", `exists=${sp.length > 0} api=${/settings\/api/.test(sp)}`, "MINOR");
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // X1 — ids of another CRM system / another tenant → 404 on every op · no leak
  // ═════════════════════════════════════════════════════════════════════════════
  await section("X1 scope", async () => {
    const IDS_S2: Ids = { contact: kS2.id, contact2: kS2.id, company: coS2, company2: coS2, deal: dS2, activity: aS2, objKey: "car", record: recS2, team: teamB, party: kS2.partyId, pipe: pS2, user: owner.userId };
    const snapF = async () => j(await Promise.all([
      P.crmContact.findMany({ where: { id: { in: [kS2.id, kB.id] } }, select: { id: true, name: true, jobTitle: true, tags: true, leadStatus: true, ownerUserId: true, archivedAt: true, mergedIntoId: true } }),
      P.crmDeal.findMany({ where: { id: { in: [dS2, dB] } }, select: { id: true, title: true, stageId: true, ownerUserId: true } }),
      P.crmCompany.findMany({ where: { id: { in: [coS2, coB] } }, select: { id: true, name: true, archivedAt: true, ownerUserId: true } }),
      P.crmActivity.findMany({ where: { id: { in: [aS2, aB] } }, select: { id: true, doneAt: true } }),
      P.customRecord.findMany({ where: { id: { in: [recS2, recB] } }, select: { id: true, title: true, archivedAt: true } }),
      P.teamMember.count({ where: { teamId: teamB } }),
    ]));
    const before = await snapF();
    for (const [label, I, cid] of [["other system (same shop)", IDS_S2, "C1.10-X1.1"], ["other tenant", IDS_B, "C1.10-X1.2"]] as const) {
      const bad: string[] = [];
      let n = 0;
      // ORACLE-EDIT C1.10-X1.1/X1.2: ops whose only path param is {key} (object key, e.g. `car` exists in system S) carry no foreign id
      for (const o of OPS.filter((x) => /\{(?!key\})/.test(String(x.path)))) {
        if (isTeamsOp(o) && label.startsWith("other system")) continue; // teams are shop-wide — covered by the other-tenant pass
        n += 1;
        const r = await callOp(o, kAD.raw, I);
        const okByParty = o.id === "contacts.byParty" && r.status === 200 && !dat(r)?.contact && !dat(r)?.id;
        if (!(is404(r) || okByParty) || r.text.includes(SECRET_F)) bad.push(`${o.id}:${sr(r)}${r.text.includes(SECRET_F) ? ":LEAK" : ""}`);
      }
      chk(cid, `🔴 every registry op with a path id, called by an ADMIN key of system S with ids of the ${label} → 404 (never 403/200) and no foreign name in the body`,
        OPS.length > 0 && n > 0 && bad.length === 0, "all 404", `ops=${n} bad=${cut(bad.join(" "), 400) || "-"}`);
    }
    const b1 = await api("POST", "/deals", kAD.raw, { pipelineId: pMain.id, title: `ดีลข้ามระบบ ${rand}`, contactId: kS2.id });
    const b2 = await api("POST", "/activities", kAD.raw, { type: "CALL", title: `โทรข้ามระบบ ${rand}`, dealId: dS2 });
    const b3 = await api("POST", `/companies/${coP}/contacts`, kAD.raw, { contactId: kB.id });
    const b4 = await api("PUT", `/contacts/${kP2.id}/owner`, kAD.raw, { userId: ownerB.userId });
    const b5 = await api("POST", "/objects/car/records", kAD.raw, { parentId: kS2.id, values: { plate: `ข้าม-${rand}` } });
    const b6 = await api("GET", `/deals?contactId=${kS2.id}`, kAD.raw);
    const b7 = await api("POST", "/deals", kAD.raw, { pipelineId: pS2.id, title: `ดีลท่อข้าม ${rand}`, contactId: kP2.id });
    const refused = (r: Resp) => [400, 404, 422].includes(r.status) && !r.text.includes(SECRET_F);
    const created = (await P.crmDeal.count({ where: { tenantId: T, title: { in: [`ดีลข้ามระบบ ${rand}`, `ดีลท่อข้าม ${rand}`] } } })) + (await P.crmActivity.count({ where: { tenantId: T, title: `โทรข้ามระบบ ${rand}` } })) +
      (await P.customRecord.count({ where: { tenantId: T, title: `ข้าม-${rand}` } })) + (await P.crmCompanyContact.count({ where: { contactId: kB.id } }));
    const kP2Row = (await P.crmContact.findUnique({ where: { id: kP2.id } })) as Any;
    const after = await snapF();
    chk("C1.10-X1.3", "foreign ids inside BODIES / filters: deal on another system's contact · activity on another system's deal · add tenant-B contact to a company · owner = tenant-B user · record under another system's contact · deal into another system's pipeline → 400|404|422, nothing written · GET /deals?contactId=<foreign> → 200 empty or 404 · every foreign row (S2 + tenant B) byte-identical afterwards",
      [b1, b2, b3, b4, b5, b7].every(refused) && ((b6.status === 200 && itemsOf(dat(b6)).length === 0) || is404(b6)) && created === 0 && kP2Row?.ownerUserId === thana.userId && before === after,
      "refused · unchanged", `${[b1, b2, b3, b4, b5, b6, b7].map(sr).join(" ")} created=${created} owner=${kP2Row?.ownerUserId === thana.userId ? "kept" : "CHANGED"} foreignChanged=${before !== after}`);
    const t1 = await tool(viewer(owner), "crm_deal_360", argsFor("crm_deal_360", dS2));
    const t2 = await tool(viewer(owner), "crm_contact_360", argsFor("crm_contact_360", kB.id));
    chk("C1.10-X1.4", "AI tools with foreign ids (crm_deal_360 of S2 · crm_contact_360 of tenant B) → mode error, no foreign data",
      t1?.mode === "error" && t2?.mode === "error" && !j(t1).includes(SECRET_F) && !j(t2).includes(SECRET_F), "error", `${t1?.mode} ${t2?.mode}`);
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // X2 — keys and the assistant (H1 · H3 · C1.7 no implicit read)
  // ═════════════════════════════════════════════════════════════════════════════
  await section("X2 keys+assistant", async () => {
    const bad: string[] = [];
    for (const o of OPS) {
      const a = await callOp(o, kMem.raw, OWN);
      const b = await (isTeamsOp(o) ? teamsApi(reqFor(o, OWN).m, reqFor(o, OWN).p, kMemUnbound.raw, reqFor(o, OWN).b) : api(reqFor(o, OWN).m, reqFor(o, OWN).p, kMemUnbound.raw, reqFor(o, OWN).b, { headers: { "x-shark-system": S } }));
      const c = await (isTeamsOp(o) ? teamsApi(reqFor(o, OWN).m, reqFor(o, OWN).p, kLegacy.raw, reqFor(o, OWN).b) : api(reqFor(o, OWN).m, reqFor(o, OWN).p, kLegacy.raw, reqFor(o, OWN).b, { headers: { "x-shark-system": S } }));
      for (const [lbl, r] of [["member-bound", a], ["member-unbound", b], ["no-scope", c]] as const) if (r.status !== 403) bad.push(`${o.id}/${lbl}:${sr(r)}`);
    }
    chk("C1.10-X2.1", "🔴 H1: a key of another module (member bundle, bound to the member system or unbound + X-Shark-System S) and a key with NO scopes → 403 on EVERY CRM op (incl. ping and teams)",
      OPS.length > 0 && bad.length === 0, "all 403", `bad=${cut(bad.slice(0, 10).join(" "), 400) || "-"}`);
    const allow = typeof SKL.toolAllowedForApiKey === "function" ? SKL.toolAllowedForApiKey : null;
    const memScopes = memBundle ? [...memBundle.scopes] : ["member.customer.read"];
    const leaks = allow ? Object.keys(TOOLS_14).filter((n) => allow(n, memScopes) || allow(n, [])) : ["no toolAllowedForApiKey"];
    const roAllowed = allow ? ["crm_search", "crm_deal_360"].every((n) => allow(n, roScopes)) && !allow("crm_create_deal", roScopes) : false;
    const aiRoute = typeof AIR.POST === "function" ? await (async () => {
      const res: Response = await AIR.POST(new Request("http://qc.invalid/api/v1/ai/tools/crm_create_lead", { method: "POST", headers: { authorization: `Bearer ${kMemUnbound.raw}`, "content-type": "application/json" }, body: JSON.stringify({ args: { name: `ลีดแอบ ${rand}` } }) }), { params: Promise.resolve({ name: "crm_create_lead" }) });
      return res.status;
    })().catch(() => -1) : 0;
    chk("C1.10-X2.2", "🔴 H1 for tools: toolAllowedForApiKey denies ALL 14 crm tools — legacy crm_create_lead included — to a member-scoped key and to a no-scope key · readonly bundle may call read tools, not crm_create_deal · POST /api/v1/ai/tools/crm_create_lead with a member key → 403, no proposal",
      leaks.length === 0 && roAllowed && aiRoute === 403 && (await P.aiProposal.count({ where: { tenantId: T, summary: { contains: `ลีดแอบ ${rand}` } } })) === 0,
      "denied", `leaks=${leaks.join(",") || "-"} roAllowed=${roAllowed} route=${aiRoute}`);
    const w1 = await api("GET", "/contacts", kWriteOnly.raw);
    const w2 = await api("GET", `/contacts/${kP.id}`, kWriteOnly.raw);
    chk("C1.10-X2.3", "C1.7: an API key holding only crm.contact.create gets NO implicit read — GET /contacts and GET /contacts/{id} → 403",
      is403(w1) && is403(w2) && !w2.text.includes(`คุณภูเก็ต ${rand}`), "403", `${sr(w1)} ${sr(w2)}`);
    const vT = viewer(thana);
    const ps = await tool(vT, "crm_pipeline_summary", argsFor("crm_pipeline_summary", null, { pipelineId: pMain.id }));
    const sK = await tool(vT, "crm_search", argsFor("crm_search", null, { q: SECRET_K }));
    const dK = await tool(vT, "crm_deal_360", argsFor("crm_deal_360", dK1));
    chk("C1.10-X2.4", "🔴 H3: assistant asked by thana (STAFF, team phuket) — crm_pipeline_summary shows phuket deals and nothing of krabi · crm_search for the krabi secret finds nothing · crm_deal_360 of a krabi deal → error",
      ps?.mode === "read" && j(ps.result).includes(`ดีลภูเก็ตหนึ่ง ${rand}`) && !j(ps.result).includes(SECRET_K) && (sK?.mode === "read" ? !j(sK.result).includes(SECRET_K) : sK?.mode === "error") && dK?.mode === "error" && !j(dK).includes(SECRET_K),
      "phuket only", `${ps?.mode}:${cut(ps?.error, 60)} search=${sK?.mode}:${j(sK).includes(SECRET_K) ? "LEAK" : "clean"} deal=${dK?.mode}`);
    const fc = await tool(viewer(narrow), "crm_forecast", argsFor("crm_forecast", null, { pipelineId: pMain.id }));
    const fcOwner = await tool(viewer(owner), "crm_forecast", argsFor("crm_forecast", null, { pipelineId: pMain.id }));
    chk("C1.10-X2.5", "H3: assistant asked by a STAFF whose only key is crm.activity.create cannot read reports — crm_forecast → error (Thai) · the owner gets it (positive control)",
      fc?.mode === "error" && thai(fc.error) && fcOwner?.mode === "read", "error vs read", `${fc?.mode} owner=${fcOwner?.mode}:${cut(fcOwner?.error, 60)}`);
    const um = await tool(viewer(mgrP), "crm_pipeline_summary", argsFor("crm_pipeline_summary", null, { pipelineId: pMain.id }));
    const crmT = typeof TCRM.crmTools === "function" ? (((await call(TCRM.crmTools)).v ?? []) as Any[]) : [];
    const anon = crmT.find((t) => t?.def?.name === "crm_pipeline_summary");
    const an = anon ? await call(() => anon.execute({ tenantId: T, systemId: S }, { pipelineId: pMain.id })) : ({ ok: false, err: "no tool" } as Res);
    chk("C1.10-X2.6", "H3: the assistant uses the asker's UNITS (never unitAccess []) — a MANAGER limited to the phuket unit sees no krabi deal · with no identifiable human (crmTools().execute outside a session) the read fails closed: no krabi/owner data",
      um?.mode === "read" && !j(um.result).includes(SECRET_K) && j(um.result).includes(`ดีลภูเก็ตหนึ่ง ${rand}`) && an.ok && !String(an.v).includes(SECRET_K),
      "unit-scoped · fail closed", `mgrP=${um?.mode}:${j(um).includes(SECRET_K) ? "LEAK" : "clean"} anon=${an.ok ? (String(an.v).includes(SECRET_K) ? "LEAK" : cut(an.v, 80)) : an.err}`);
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // X3 — same Idempotency-Key in parallel (worker processes = own pools + in-process)
  // ═════════════════════════════════════════════════════════════════════════════
  await section("X3 races", async () => {
    const name = `คุณแข่งกันซ้ำ ${rand}`;
    const body = { firstName: name, sourceKind: "API" };
    const idem = `${TAG}-race-1`;
    const startAt = Date.now() + 40_000;
    const enc = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
    const workers = [0, 1].map(() => new Promise<string>((resolve) => {
      const ch = spawn("pnpm", ["exec", "tsx", THIS_FILE, "--x3-worker", kOP.raw || "none", idem, String(startAt), "6", enc, "/contacts"], { env: process.env });
      let out = "";
      const to = setTimeout(() => { try { ch.kill("SIGKILL"); } catch { /* gone */ } }, 240_000);
      ch.stdout.on("data", (d: Any) => { out += String(d); });
      ch.stderr.on("data", (d: Any) => { out += String(d); });
      ch.on("error", (e: Any) => { clearTimeout(to); resolve(`SPAWN-ERROR ${String(e)}`); });
      ch.on("close", () => { clearTimeout(to); resolve(out); });
    }));
    const wait = startAt - Date.now();
    if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));
    const local = await Promise.all(Array.from({ length: 6 }, () => api("POST", "/contacts", kOP.raw, body, { idem })));
    const outs = (await Promise.all(workers)).map((o) => { const m = /X3WORKER (\[.*\])/.exec(o); return m ? (JSON.parse(m[1]!) as string[]) : ["NO-OUTPUT"]; });
    const all = [...outs.flat(), ...local.map((r) => `${r.status}|${ecode(r)}|${idOf(dat(r), "contactId", "contact.id")}|${r.headers?.get("idempotent-replayed") ?? ""}`)];
    const oks = all.filter((s) => s.startsWith("200|"));
    const ids = new Set(oks.map((s) => s.split("|")[2]));
    const others = all.filter((s) => !s.startsWith("200|") && !/^409\|idempotency_in_progress/.test(s));
    const rows = await P.crmContact.count({ where: { tenantId: T, firstName: name } });
    const replay = await api("POST", "/contacts", kOP.raw, body, { idem });
    chk("C1.10-X3.1", "🔴 18 POST /contacts with ONE Idempotency-Key + body at the same instant (2 worker processes × 6 + 6 in-process) → exactly ONE row · every 200 carries the same contactId · the rest only 409 idempotency_in_progress · a later retry replays the same contactId",
      !outs.some((o) => o.includes("NO-OUTPUT")) && all.length === 18 && rows === 1 && oks.length >= 1 && ids.size === 1 && others.length === 0 && replay.status === 200 && ids.has(idOf(dat(replay), "contactId", "contact.id")),
      "1 row", `calls=${all.length} rows=${rows} ok=${oks.length} ids=${ids.size} others=${cut(others.slice(0, 3).join(" "), 160)} replay=${sr(replay)}`);
    const cIdem = `${TAG}-conv-1`;
    const cBody = { company: { new: { name: `บริษัทแปลงแข่ง ${rand}` } }, deal: { pipelineId: pMain.id, title: `ดีลแปลงแข่ง ${rand}` } };
    const conv10 = await Promise.all(Array.from({ length: 10 }, () => api("POST", `/contacts/${kConv.id}/convert`, kAD.raw, cBody, { idem: cIdem })));
    const deals = await P.crmDeal.count({ where: { tenantId: T, title: `ดีลแปลงแข่ง ${rand}` } });
    const cos = await P.crmCompany.count({ where: { tenantId: T, name: `บริษัทแปลงแข่ง ${rand}` } });
    const convIds = new Set(conv10.filter((r) => r.status === 200).map((r) => String(dat(r)?.dealId ?? "")));
    chk("C1.10-X3.2", "10 parallel POST /contacts/{id}/convert with one Idempotency-Key (the service idempotencyKey) → ONE deal + ONE company · all 200 answers name the same dealId",
      deals === 1 && cos === 1 && convIds.size === 1 && conv10.every((r) => r.status === 200 || (r.status === 409 && ecode(r) === "idempotency_in_progress")), "1 deal", `deals=${deals} companies=${cos} statuses=${conv10.map(sr).join(",")}`);
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // X6 — CSV neutralised · page-size caps + cursor paging · string caps · URL fields
  // ═════════════════════════════════════════════════════════════════════════════
  await section("X6 inputs", async () => {
    const ex = await api("POST", "/contacts/export", kAD.raw, { confirm: true, reason: REASON("contacts.export") });
    const csv = String(dat(ex)?.csv ?? "");
    chk("C1.10-X6.1", "POST /contacts/export → {csv} through csvRow: the contact named `=HYPERLINK(…)` appears only neutralised ('=…), never as a live formula cell",
      ex.status === 200 && csv.includes(`'=HYPERLINK`) && !/(^|,)"?=HYPERLINK/m.test(csv), "neutralised", `${sr(ex)} len=${csv.length} live=${/(^|,)"?=HYPERLINK/m.test(csv)}`);
    const caps: string[] = [];
    for (const id of LIST_OPS) {
      const base = id === "records.list" ? "/objects/car/records" : `/${id.split(".")[0]}`;
      const big = await api("GET", `${base}?take=101`, kAD.raw);
      const okk = await api("GET", `${base}?take=100`, kAD.raw);
      if (!isVal(big) || okk.status !== 200 || !("nextCursor" in (dat(okk) ?? {}))) caps.push(`${id}:${sr(big)}/${sr(okk)}/nextCursor=${"nextCursor" in (dat(okk) ?? {})}`);
    }
    const pageAll = async (path: string) => {
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < 60; i += 1) {
        const r = await api("GET", `${path}?take=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, kAD.raw);
        if (r.status !== 200) return { seen, err: sr(r) };
        seen.push(...itemsOf(dat(r)).map((x: Any) => String(x.id)));
        cursor = dat(r)?.nextCursor ?? null;
        if (!cursor) break;
      }
      return { seen, err: "" };
    };
    const pc = await pageAll("/contacts");
    const dbC = await P.crmContact.count({ where: { tenantId: T, systemId: S, archivedAt: null, mergedIntoId: null } });
    const pd = await pageAll("/deals");
    const dbD = await P.crmDeal.count({ where: { tenantId: T, systemId: S } });
    chk("C1.10-X6.2", "page-size cap: take=101 → 400|422 validation on every list op (contacts · companies · deals · activities · records), take=100 → 200 {items, nextCursor} · cursor paging (take=2) walks every contact / deal exactly once",
      caps.length === 0 && !pc.err && new Set(pc.seen).size === pc.seen.length && pc.seen.length === dbC && !pd.err && new Set(pd.seen).size === pd.seen.length && pd.seen.length === dbD,
      "capped · complete", `caps=${cut(caps.join(" "), 200) || "-"} contacts=${pc.seen.length}/${dbC}${pc.err} deals=${pd.seen.length}/${dbD}${pd.err}`);
    const uncapped: string[] = [];
    const walkS = (s: Any, at: string, op: string) => {
      if (!s || typeof s !== "object") return;
      if (s.type === "string" && s.maxLength === undefined && !s.enum && !s.const && !s.format && !s.pattern) uncapped.push(`${op}:${at}`);
      if (s.type === "array" && s.maxItems === undefined) uncapped.push(`${op}:${at}[]`);
      for (const [k, v] of Object.entries(s.properties ?? {})) walkS(v, `${at}.${k}`, op);
      if (s.items) walkS(s.items, `${at}[]`, op);
      for (const alt of [...(s.anyOf ?? []), ...(s.oneOf ?? []), ...(s.allOf ?? [])]) walkS(alt, at, op);
      if (s.additionalProperties && typeof s.additionalProperties === "object") walkS(s.additionalProperties, `${at}.*`, op);
    };
    for (const o of OPS) if (o.input) { try { walkS(OA.jsonSchemaOf(o.input, "input"), "", o.id); } catch { uncapped.push(`${o.id}:schema-error`); } }
    chk("C1.10-X6.3", "every string in every op input schema is capped (maxLength · enum · format · pattern) and every array has maxItems [schema walk over CRM_OPS]",
      OPS.length > 0 && uncapped.length === 0, "all capped", `${uncapped.length} uncapped: ${cut(uncapped.slice(0, 15).join(" "), 400)}`, "MAJOR");
    const u = await api("POST", "/companies", kAD.raw, { name: `บริษัทลิงก์ ${rand}`, website: "javascript:alert(1)" });
    chk("C1.10-X6.4", "URL fields accept http/https only — POST /companies with website javascript:… → 400|422, no company",
      [400, 422].includes(u.status) && (await P.crmCompany.count({ where: { tenantId: T, name: `บริษัทลิงก์ ${rand}` } })) === 0, "refused", sr(u), "MINOR");
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // X7 — rate limits per key and per bucket (read / write / report) from the DB limiter
  // ═════════════════════════════════════════════════════════════════════════════
  await section("X7 rate", async () => {
    const cfg = CFG.CRM_API_CONFIG ?? {};
    const ns = String(cfg.rateNs ?? "");
    const lim = cfg.rateLimits ?? {};
    chk("C1.10-X7.1", "CRM_API_CONFIG: systemType CRM · scopePrefix crm. · its own rateNs (not acct/kb/mbr) · rateLimits read/write/report defined (report ≤ read)",
      cfg.systemType === "CRM" && cfg.scopePrefix === "crm." && !!ns && !["acct", "kb", "mbr"].includes(ns) && ["read", "write", "report"].every((k) => Number(lim[k]?.limit) > 0) && Number(lim.report?.limit) <= Number(lim.read?.limit),
      "own buckets", `type=${cfg.systemType} ns=${ns || "-"} lim=${j(lim)}`, "MAJOR");
    const k1 = await mkKey("rate-read", roScopes, S);
    const k2 = await mkKey("rate-report", roScopes, S);
    const k3 = await mkKey("rate-write", opScopes, S);
    const fill = async (kind: string, keyId: string) => {
      if (!ns || !keyId) return;
      await P.$executeRawUnsafe(`INSERT INTO "ChatRateBucket" ("id","key","count","windowStart","createdAt","updatedAt") VALUES (gen_random_uuid()::text, $1, $2, NOW(), NOW(), NOW())
        ON CONFLICT ("key") DO UPDATE SET "count" = $2, "windowStart" = NOW()`, `${ns}:api:${kind}:${keyId}`, Number(lim[kind]?.limit ?? 0));
    };
    await fill("read", k1.id);
    const r1 = await api("GET", "/contacts", k1.raw);
    const r1f = await api("GET", "/deals/forecast", k1.raw);
    await fill("report", k2.id);
    const r2 = await api("GET", "/deals/forecast", k2.raw);
    const r2c = await api("GET", "/contacts", k2.raw);
    await fill("write", k3.id);
    const r3 = await api("POST", "/contacts", k3.raw, { firstName: `เกินเพดาน ${rand}` });
    const r3r = await api("GET", "/contacts", k3.raw);
    chk("C1.10-X7.2", "a full read bucket → GET /contacts 429 rate_limited + Retry-After while the report bucket still serves /deals/forecast · a full report bucket → forecast 429 while reads pass · a full write bucket → POST 429 (nothing written) while reads pass",
      r1.status === 429 && ecode(r1) === "rate_limited" && !!r1.headers?.get("retry-after") && r1f.status === 200 && r2.status === 429 && r2c.status === 200 && r3.status === 429 && r3r.status === 200 &&
        (await P.crmContact.count({ where: { tenantId: T, firstName: `เกินเพดาน ${rand}` } })) === 0,
      "per-bucket 429", `${sr(r1)} ${sr(r1f)} ${sr(r2)} ${sr(r2c)} ${sr(r3)} ${sr(r3r)}`);
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // X8 — PDPA: ids-only payloads · masked PII for readonly · sensitive values never leave through API/AI
  // ═════════════════════════════════════════════════════════════════════════════
  await section("X8 PDPA", async () => {
    const PII = CONTACT_PII.filter((s) => s && s.length > 5);
    const evs = (await P.outboxEvent.findMany({ where: { tenantId: { in: TENANTS }, type: { startsWith: "crm." } } })) as Any[];
    const leakEv = evs.filter((e) => PII.some((s) => j(e.payload).includes(s)) || /คุณ|ดีล/.test(j(e.payload)));
    const leakHook = hookPayloads.filter((b) => PII.some((s) => j(b?.payload).includes(s)) || /คุณ|ดีล/.test(j(b?.payload)));
    chk("C1.10-X8.1", "outbox rows of our tenants created through the API and every webhook body carry ids only — no phone, e-mail, person name or deal title (R-C.8 · crm.deal.won ids only)",
      evs.length > 0 && leakEv.length === 0 && hookPayloads.length > 0 && leakHook.length === 0, "ids only", `events=${evs.length} leakEv=${leakEv.map((e) => e.type).join(",") || "-"} hooks=${hookPayloads.length} leakHook=${leakHook.length}`);
    const g = await api("GET", `/contacts/${kP.id}`, kRO.raw);
    const l = await api("GET", "/contacts?take=100", kRO.raw);
    const s = await api("GET", `/contacts/search?q=${encodeURIComponent(`ภูเก็ต ${rand}`)}`, kRO.raw);
    const fullIn = [g, l, s].filter((r) => r.text.includes(kP.phone) || r.text.includes(kP.email));
    chk("C1.10-X8.2", "readonly key: contact get / list / search show phone and e-mail MASKED (the full values of kP appear nowhere) — CRM-API §3 ContactBrief",
      g.status === 200 && l.status === 200 && s.status === 200 && fullIn.length === 0, "masked", `${sr(g)} ${sr(l)} ${sr(s)} full=${fullIn.length}`, "MAJOR");
    const gO = await api("GET", `/contacts/${kP.id}`, kOP.raw);
    const aiC = await tool(viewer(owner), "crm_contact_360", argsFor("crm_contact_360", kP.id));
    const aiS = await tool(viewer(owner), "crm_search", argsFor("crm_search", null, { q: `ภูเก็ต ${rand}` }));
    chk("C1.10-X8.3", "the sensitive contact value (sensitive section) never leaves through readonly/operate REST nor through ANY assistant output (even when the owner asks)",
      g.status === 200 && gO.status === 200 && !g.text.includes(SECRET_S) && !gO.text.includes(SECRET_S) && aiC?.mode === "read" && !j(aiC).includes(SECRET_S) && !j(aiS).includes(SECRET_S),
      "never", `ro=${g.text.includes(SECRET_S)} op=${gO.text.includes(SECRET_S)} ai=${aiC?.mode}:${j(aiC).includes(SECRET_S)}`, "MAJOR");
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // X9 — danger ops: confirm + reason, audited with the reason
  // ═════════════════════════════════════════════════════════════════════════════
  await section("X9 danger", async () => {
    const dangers = OPS.filter((o) => o.kind === "danger");
    const expected = MUST.filter((c) => c.k === "danger").map((c) => c.id);
    const bad: string[] = [];
    const snap = async () => j(await Promise.all([
      P.crmContact.findMany({ where: { id: { in: [kX1.id, kX2.id] } }, select: { id: true, archivedAt: true, mergedIntoId: true } }),
      P.crmCompany.findMany({ where: { id: { in: [coX1, coX2] } }, select: { id: true, archivedAt: true, mergedIntoId: true } }),
      P.crmDeal.count({ where: { id: dDel } }), P.crmActivity.count({ where: { id: aDel } }),
    ]));
    const before = await snap();
    for (const o of dangers) {
      const r0 = reqFor(o, OWN, false);
      const noConfirm = await api(r0.m, r0.p, kAD.raw, { ...(r0.b ?? {}) });
      const shortReason = await api(r0.m, r0.p, kAD.raw, { ...(r0.b ?? {}), confirm: true, reason: "สั้น" });
      const strConfirm = await api(r0.m, r0.p, kAD.raw, { ...(r0.b ?? {}), confirm: "true", reason: REASON(o.id) });
      if (!(noConfirm.status === 409 && ecode(noConfirm) === "confirm_required")) bad.push(`${o.id}:noConfirm=${sr(noConfirm)}`);
      if (!isVal(shortReason)) bad.push(`${o.id}:short=${sr(shortReason)}`);
      if (!(strConfirm.status === 409 && ecode(strConfirm) === "confirm_required")) bad.push(`${o.id}:strConfirm=${sr(strConfirm)}`);
    }
    const after = await snap();
    chk("C1.10-X9.1", "every danger op (MUST: contacts.archive/merge/export · companies.archive/merge · deals.delete · activities.delete · records.export) refuses without confirm:true (409 confirm_required, also for the string \"true\") and with a reason < 5 chars (400|422) — nothing changes",
      expected.every((id) => dangers.some((o) => o.id === id)) && bad.length === 0 && before === after, "refused", `danger=${dangers.map((o) => o.id).join(",")} bad=${cut(bad.join(" "), 300) || "-"} changed=${before !== after}`);
    const t0 = new Date();
    const done: [string, Resp][] = [];
    for (const id of ["contacts.merge", "contacts.archive", "deals.delete", "activities.delete", "companies.archive"]) {
      const o = opById(id);
      if (o) done.push([id, await callOp(o, kAD.raw, OWN)]);
    }
    const audits = (await P.auditLog.findMany({ where: { tenantId: T, createdAt: { gte: t0 } } })) as Any[];
    const missingAudit = done.filter(([id]) => !audits.some((a) => j(a.after).includes(REASON(id))));
    const effects = [
      !!((await P.crmContact.findUnique({ where: { id: kX1.id } })) as Any)?.archivedAt || !!((await P.crmContact.findUnique({ where: { id: kX1.id } })) as Any)?.mergedIntoId,
      (await P.crmDeal.count({ where: { id: dDel } })) === 0,
      (await P.crmActivity.count({ where: { id: aDel } })) === 0 || !!((await P.crmActivity.findUnique({ where: { id: aDel } })) as Any)?.deletedAt,
      !!((await P.crmCompany.findUnique({ where: { id: coX1 } })) as Any)?.archivedAt,
    ];
    const bulk = OPS.filter((o) => /bulk/i.test(String(o.id)));
    const bulkBad: string[] = [];
    for (const o of bulk) {
      const r = await api(o.method, String(o.path), kAD.raw, { ids: Array.from({ length: 501 }, (_x, i) => `${NONE}-${i}`), stageId: pMain.st[1], ownerUserId: owner.userId, tag: "x", confirm: true, reason: REASON(o.id) });
      if (!isVal(r)) bulkBad.push(`${o.id}:${sr(r)}`);
    }
    chk("C1.10-X9.2", "with confirm + reason the danger ops run (contact archived · deal deleted · activity deleted · company archived · merge) and EACH writes an AuditLog row carrying its reason · bulk ops (if any) refuse 501 ids (400|422)",
      done.length === 5 && done.every(([, r]) => r.status === 200) && missingAudit.length === 0 && effects.every(Boolean) && bulkBad.length === 0,
      "done + audited", `${done.map(([id, r]) => `${id}:${sr(r)}`).join(" ")} missingAudit=${missingAudit.map(([id]) => id).join(",") || "-"} effects=${effects.join(",")} bulk=${bulk.length}:${bulkBad.join(",") || "ok"}`);
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // H — optional HTTP probe of the QC server :3215 (never started here · SKIPPED with a reason when absent/stale)
  // ═════════════════════════════════════════════════════════════════════════════
  await section("H http", async () => {
    const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3215";
    let oa: Response | null = null;
    let why = "";
    try { oa = await realFetch(`${BASE}/api/v1/crm/openapi.json`, { signal: AbortSignal.timeout(3000) }); } catch (e) { why = `server down (${cut(e instanceof Error ? e.message : String(e), 60)})`; }
    if (oa && oa.status === 404) why = "server build predates C1.10 (openapi.json 404)";
    if (!oa || why) { console.log(`  ⏭️  [C1.10-H] SKIPPED — ${why || "no answer"} · the controller re-runs this oracle after build`); return; }
    const spec = (await oa.json().catch(() => ({}))) as Any;
    const nOps = Object.values(spec?.paths ?? {}).reduce((s: number, p: Any) => s + Object.keys(p ?? {}).length, 0);
    const ping = await realFetch(`${BASE}/api/v1/crm/ping`, { headers: { authorization: `Bearer ${kRO.raw}` } });
    const noKey = await realFetch(`${BASE}/api/v1/crm/ping`);
    chk("C1.10-H.1", "HTTP on :3215: /api/v1/crm/openapi.json (no key) lists every registry op · GET /api/v1/crm/ping with the readonly key → 200 · without a key → 401",
      oa.status === 200 && nOps === OPS.length && ping.status === 200 && noKey.status === 401, "200/200/401", `oa=${oa.status} ops=${nOps}/${OPS.length} ping=${ping.status} noKey=${noKey.status}`, "MAJOR");
  });
} catch (e) {
  chk("C1.10-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — every row of the throwaway tenants (4 passes) · systems/units/tenants · users · rate buckets of our keys · docs restore
  // ═════════════════════════════════════════════════════════════════════════════
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* order/FK — retried next pass */ } };
  if (read(DOC_FILE) !== DOC_BEFORE && DOC_BEFORE) {
    writeFileSync(DOC_FILE, DOC_BEFORE, "utf8");
    console.log("  ⚠️  docs/api/CRM-API.md was rewritten during the run (generator main not guarded?) — restored");
  }
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  const keyIds = KEY_IDS.filter((x) => /^[a-z0-9]+$/i.test(x));
  for (const k of keyIds) await del(() => P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%:${k}`));
  if (ids.length > 0) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[])
      .map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await del(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
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
        if (Number(r?.[0]?.n ?? 0) > 0) left.push(`${t}=${r[0].n}`);
      }
      const tenants = await P.tenant.count({ where: { id: { in: ids } } });
      const users = USERS.length ? await P.user.count({ where: { id: { in: USERS } } }) : 0;
      let buckets = 0;
      for (const k of keyIds) buckets += Number((((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%:${k}`)) as Any[])[0]?.n) ?? 0);
      chk("C1.10-CLEAN", "the oracle gives the QC database back exactly as found — both throwaway tenants and every row they owned, the throwaway users, the rate buckets of our keys; docs file unchanged",
        left.length === 0 && tenants === 0 && users === 0 && buckets === 0 && read(DOC_FILE) === DOC_BEFORE, "0 rows", `${left.join(" · ") || "-"} · tenants=${tenants} users=${users} buckets=${buckets}`, "MAJOR");
    } catch (e) {
      chk("C1.10-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C1.10: ${passed}/${total} · webhook fetch stubbed ${HOOKS.length}× · keyErrors ${Object.entries(KEY_ERR).map(([k, v]) => `${k}=${cut(v, 60)}`).join(" | ") || "-"}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
