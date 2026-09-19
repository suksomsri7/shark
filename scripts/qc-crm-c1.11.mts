// QC — CRM v2 WO C1.11: mobile-responsive pass · chat side panel "CRM" · 16 business templates (data + apply + picker) ·
//      import / duplicates / merge UI (contacts + companies) · the v1→v2 switch (decision C23 · R-E.14) · minimal v2 home (R-A) ·
//      CRM block on /app/party/[partyId] (R-A) · regression file scripts/qc-crm-v1.mts (BUILDER's file — this oracle runs it)
// Oracle writer · the C1.11 builder must NOT touch this file · QC database only (.env.qc)
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c1.11.mts
//      (`--force-run` = run every check while the C1.11 artefacts are absent — functional checks red, S0.2/S0.3/CLEAN green: proves
//       the fixtures, the Next request-scope harness, the page renderer and the cleanup)
// requires: crm-seed   (house style — this oracle reads NO seeded row; everything lives in FOUR throwaway tenants `qc-c111-<rand>[-v|-b|-w]`)
//
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE (not re-implemented here): qc-crm-v1 (S5.2 runs it too) · qc-chat-member-autolink ·
//   qc-chat-v2-room · qc-chat-v2-context · qc-nav-functions (every new non-param page linked) · qc-crm · qc-crm-activity · every C1 oracle
//   (qc-crm-c1.1 … qc-crm-c1.10) · scripts/pending/probe-uiversion-gate.mts (its V2_ONLY list must gain contacts/import,
//   contacts/duplicates, companies/duplicates and every other new v2-only page — NOT the switch page, which must open at uiVersion 1) ·
//   qc-member-m1.9 (30/15/10/5). Then the controller closes phase C1 with a full qc:all and walks US2 US3 US6 US8 on the QC server.
//
// SOURCES: crm-brief-C1.11.md · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-A: minimal v2 home + /app/party CRM block are C1.11 ·
//   R-E.14 uiVersion 1 ⇒ ops 409, jobs/sequences/rules/bridges skip, rows kept, resume at 2, legacy form lead + onCrmDealWon + crm_create_lead
//   keep working) · CRM-RUN §2 "C1.11" (S1 6 · S2 3 · S3 3 · S4 3 · S5 3 = 18) + brief S6 (switch both ways keeps data) · MASTER-PLAN
//   §2 §4 (X1 X3 X6 X8 X9) §5 §6 row C1.11 · blueprint §3.17 §3.18 §10 · decision C23 · mockups 13(a) (mobile "my deals") and 17 (part) ·
//   src/lib/modules/crm/ui-version.ts (pickCrmPage · requireCrmV2Page · assertCrmV2) · scripts/pending/probe-uiversion-gate.mts ·
//   C1.8 bridges (src/lib/platform/crm-bridges — crmGates/bridgeOpen · onChatMessage · leadFromBridge kind CHAT) · debts: wo-notes
//   crm-C1.1 §8 (clinic rows on the shared Party ⇒ gated by clinic rights — C1.11 · C2.9) (qc-member-m1.1 S3.1 vs the CRM seed — FLAGGED
//   below, not decided) · crm-C1.2b §8 (uiVersion gate at the custom.record.created consumer — already done in C1.8, not re-tested).
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this) ══════════════════════════════════
//   A. THE SWITCH (C23)
//   · page `src/app/app/sys/[id]/crm/settings/page.tsx` (recommended; `settings/general` or `settings/version` also discovered — the first
//     page.tsx under crm/settings/ that mentions uiVersion and did not exist at 6f37399): CRM system guard (type "CRM", this tenant) →
//     role OWNER only (MANAGER even with crm.settings.manage, STAFF ⇒ notFound()) · MUST NOT call requireCrmV2Page (it has to open at 1)
//     · renders a Thai explanation of CRM ใหม่ and that the shop can switch back any time (text matching /สลับกลับ|กลับไปใช้|เปลี่ยนกลับ/)
//     + the toggle `data-testid="crm-uiversion-toggle"` — at uiVersion 1 AND 2
//   · action `setCrmUiVersionAction(systemId: string, uiVersion: 1 | 2)` (alias setUiVersionAction) in a "use server" file:
//     requireTenant → OWNER only (else FORBIDDEN, nothing written) → system re-resolved in the session tenant, type CRM (else NOT_FOUND)
//     → value ∈ {1,2} (else VALIDATION) → `setCrmSettingsKey(ctx,"uiVersion",v)` (single-statement jsonb_set — other settings.crm keys
//     survive) → audit row action `crm.settings.*` whose before/after mention uiVersion → `{ ok: true, uiVersion }`. No confirm needed.
//   · entry for the OWNER while at 1: a link to the switch page on the v1 hub (CrmHub, OWNER only) OR a drawer entry gated on OWNER
//     (see Q2) · at 2 the module entry `/app/sys/[id]` renders the v2 home (below) instead of CrmHub.
//   · EVERYTHING honours it (PERMANENT RULE): every page.tsx under crm/** except contacts|deals|activities (dual pages via pickCrmPage)
//     and the switch page calls requireCrmV2Page · every "use server" file of the CRM module / CRM pages / CRM components / the chat CRM
//     panel except crm/actions.ts (v1) references assertCrmV2 or crmUiVersion (the switch action is the one exemption and may live in its
//     own file) · every REST op answers 409 crm_v2_disabled at 1 (C1.10) · every crm-bridges on* handler reads the gate (crmGate/crmGates/
//     bridgeOpen/openCrmSystems/uiVersion) · every registered crm.* minute job except crm.heartbeat reads it · rows are never deleted by a
//     switch; at 2 everything resumes (a replayed chat event creates its lead). Sequences and rules arrive in C2.1/C2.2 — their oracles
//     carry the same uiVersion-1 cases.
//   B. MINIMAL v2 HOME (R-A · mockup 13(a) at 390): `/app/sys/[id]` of a uiVersion-2 CRM renders `data-testid="crm-home"` with the CRM menu,
//     "my deals" (`crm-home-my-deals`: OPEN deals whose ownerUserId = the viewer, through dealWhere — cards with title · company ·
//     value · stage chip filter · stale badge /นิ่ง\s*\d+\s*วัน/ when stalledAt is set) and "my tasks" (`crm-home-my-tasks`: the viewer's
//     pending activities, dueAt ≤ end of today). Picker: while `settings.crm.businessTemplate` is unset AND the viewer may manage CRM
//     settings, the home shows `data-testid="crm-template-picker"` listing all 16 template labels; it disappears once a template is applied.
//     uiVersion 1 ⇒ CrmHub exactly as today (+ the OWNER-only switch link if the builder chooses the hub entry).
//   C. BUSINESS TEMPLATES: `src/lib/modules/crm/templates/business/<key>.ts` (16 data files, pure — no prisma/next) + `src/lib/modules/crm/
//     templates.ts` exporting `BUSINESS_TEMPLATES: readonly BusinessTemplate[]` (16, unique keys, one per blueprint §10 row; the dive row
//     key "dive" (label contains ดำน้ำ), the general row key "general") and `applyBusinessTemplate(ctx: {tenantId, systemId, actorUserId},
//     key: string)`. BusinessTemplate = { key; label (Thai); pipelines: { name; kind?: SALES|RENEWAL|SERVICE; stages: { name; kind: OPEN|WON|
//     LOST; probability 0..100; staleDays?: number; requireFields?: string[] }[] }[]; lostReasons: { key; label }[] (≥ 5 — the 5 central
//     reasons unless the row says otherwise); scoreRules: { key; label; … }[] (≥ 1; dive ≥ 8 = the central set — STORED for C2.8);
//     sequences: { key; name; steps: … }[] (≥ 1 — STORED for C2.2); objects: ({ key; label; labelPlural; parentType; titleFieldKey;
//     sections: { key; label; fields: Field[] }[] } | { templateKey: <OBJECT_TEMPLATES key> })[] (general = none, every other row ≥ 1);
//     fields: { contact: Field[]; company: Field[]; deal: Field[] } } with Field = { key; label; type; options? }. requireFields keys ⊆
//     STAGE_REQUIRABLE_SYSTEM_KEYS ∪ the template's deal field keys. OPEN stages carry staleDays. general = DEFAULT_PIPELINE's 5 stages.
//     apply (idempotent — X3: pg advisory lock per system, find-before-create; CrmPipeline has no unique on name): creates the template
//     pipelines (name + stages exactly as the data) · lost reasons by key · contact/company/deal fields + sections through the C1.2a engine
//     (objectKey contact|company|deal) · custom objects + their fields through the C1.2b service (an object key that already exists is
//     KEPT as the shop has it — never overwritten, never duplicated) · `settings.crm.businessTemplate = { key, appliedAt }` via jsonb_set
//     (C2.8/C2.2 read scoreRules/sequences from BUSINESS_TEMPLATES[key] — no table in C1) · audit `crm.template.apply` · touches NOTHING of
//     another system (other CRM system of the tenant, the member system, another tenant). Re-apply = zero new rows.
//     action `applyBusinessTemplateAction(systemId, key)`: requireTenant → crm.settings.manage (crm/access) → ctx from the session tenant →
//     assertCrmV2 → service · unknown key ⇒ { ok:false, code VALIDATION|NOT_FOUND, Thai } · foreign/other-type system ⇒ NOT_FOUND|FORBIDDEN.
//   D. CHAT SIDE PANEL (blueprint §3.18): client component in `src/components/chat/` (name contains Crm, e.g. ChatCrmPanel.tsx) mounted in
//     ONE slot of `src/lib/modules/chat/context-panel.tsx` next to <ChatMemberPanel> · testids `crm-chat-panel` · `crm-panel-open-deal`
//     (link to /app/sys/<crm>/crm/deals/new?contactId=<id>) · `crm-panel-log-activity` · `crm-panel-create-lead` · 'use client' never
//     reaches prisma · server data through a NEW facade call `briefFor` exported from `@/lib/modules/crm` (index.ts) + `"chat→crm"` in
//     ALLOWED_EDGES of scripts/fitness.mts with a reason. Server actions ("use server", anywhere under src/lib/modules/crm|chat or
//     src/components/chat|crm):
//       getChatCrmPanelAction(conversationId) → { ok: true, data: null | { systemId, contact: {id, name, lifecycleStage, …} | null,
//         company: {id, name} | null, openDeals: {id, title, valueSatang, stageName}[], score: null | … } } | { ok: false, error|reason }
//       createLeadFromChatAction(conversationId) → { ok: true, contactId, created: boolean } | { ok: false, … }
//       logActivityFromChatAction(conversationId, { type, title, outcome?, dealId? }) → { ok: true, activityId } | { ok: false, … }
//     Rules: requireTenant + chat read right (chat.conversation.read) + a crm.* read key · conversation looked up by id + session tenant ·
//     target CRM system = the tenant's FIRST CRM system (createdAt asc — same rule as crm-bridges/chat.ts until C2.4) and only when it is
//     uiVersion 2 (else data null, lead/activity refused, nothing written) · Party = ChatContact.partyId (else a person Party from the
//     chat contact's phone/e-mail as the C1.8 bridge does) · contact = briefFor(ctx, actor, { partyId }) THROUGH visibility (a contact the
//     viewer cannot see ⇒ data.contact null, no name/company/deal of it anywhere in the result) · no phone/e-mail in the result ·
//     create lead = contacts.leadFromBridge kind CHAT (existing contact of that Party ⇒ { created:false } and NO new row; works whether
//     settings.crm.chatToLead is on or off — a human clicked it) · the lead is LEAD / sourceKind CHAT / partyId of the room.
//   E. IMPORT / DUPLICATES / MERGE (blueprint §3.17 · built on the C1.3/C1.4 services, X9 = confirm + reason ≥ 5):
//     pages `crm/contacts/import/page.tsx` (column mapping incl. the `company` target — contacts + companies in one file — and the three
//     onDuplicate modes, their Thai labels from contacts-shared) · `crm/contacts/duplicates/page.tsx` · `crm/companies/duplicates/page.tsx`
//     (pairs from findDuplicates through visibility, each pair offering a merge entry that carries both ids) · the merge UI (page or
//     component) with a field-by-field choice (`fieldChoices`), a reason input (testid contains "merge" and "reason") and confirm.
//     Every page: CRM guard + requireCrmV2Page + key check (crm.contact.import · crm.contact.merge · crm.company.merge) else notFound.
//     actions: importContactsAction (C1.4, unchanged caps: 10 MB · inline 5,000 rows — job mode is C2.0/C2.x · service 50,000) ·
//     mergeContactsAction(systemId, { keepId, mergeId, confirm, reason, fieldChoices? }) and mergeCompaniesAction(systemId, { …same })
//     pass fieldChoices through to the C1.3/C1.4 service. The import UI checks CONTACT_IMPORT_MAX_BYTES / CONTACT_IMPORT_INLINE_MAX_ROWS
//     before sending.
//   F. /app/party/[partyId] CRM block (R-A): `data-testid="party-crm"` with the contact / company / open deals of that Party in every
//     uiVersion-2 CRM system of the tenant, through briefFor/visibility (invisible ⇒ nothing of it) · a uiVersion-1 system adds NOTHING ·
//     no clinic data (ClinicVisit/PatientRecord) ever reaches the block or the chat panel (debt crm-C1.1 — health data needs clinic rights).
//   G. RESPONSIVE (390 px): no horizontal overflow on any CRM page — the controller measures it on screenshots (D7). Static proxies here:
//     no unprefixed w-/min-w-[>390px|>24.375rem] or inline width > 390 unless the file wraps it in overflow-x-auto · every file with a
//     <table> has a card alternative (sm|md|lg:hidden + hidden sm|md|lg:block|table) or an overflow-x-auto wrapper, list pages MUST have
//     the card alternative · board = snap-x snap-mandatory with snap-start|center columns · 360 rails: no unprefixed grid-cols-[…px…] ·
//     files new in C1.11: no fixed width > 390 at all.
//   H. NAV + INVENTORY: CRM_DEEP_NAV gains /crm/contacts/import · /crm/contacts/duplicates · /crm/companies/duplicates (status ready) and
//     the drawer lists them after the crmV2 gate · every clickable/typable element in files new in C1.11 has a data-testid with rows in
//     scripts/crm-ui-inventory.json (wo "C1.11").
//   I. scripts/qc-crm-v1.mts (BUILDER): `// requires: crm-seed` · throwaway tenant(s) with a uiVersion-1 CRM · renders the three v1 pages
//     (contacts → ContactsV1Page/CrmContactsSection · deals → DealsV1Page/CrmDealsSection · activities → ActivitiesV1Page/
//     CrmActivitiesSection) + the v1 hub (CrmHub) inside a real Next request scope · calls the SIX v1 actions of crm/actions.ts
//     (createContactAction · createDealAction · moveDealAction · addActivityAction · completeActivityAction · issueQuotationAction) with
//     FormData and proves each wrote what it should (issueQuotation: a quotation document, or the Thai `?notice=` redirect when the shop
//     has no account book — never a crash) · proves data created through the v2 services shows on the v1 pages and data created by the
//     v1 actions shows in the v2 services/pages (after flipping the same system to 2) · leaves nothing behind (CLEAN) · never SKIPs when
//     crm/actions.ts exists · ends with JSON_SUMMARY and exits 0 only when all pass.
//
// WHAT THIS FILE PROVES: S0 structure + harness control · S1 responsive (static proxies + the 13(a) home) · S2 chat panel · S3 templates ·
//   S4 import/duplicates/merge · S5 qc-crm-v1 (static + run + cross-visibility) · S6 the switch both ways keeps data (pages · actions · ops ·
//   bridges · jobs) · S7 uiVersion 1 (PERMANENT RULE) on every C1.11 surface + a positive control · S8 debts (home visibility · party block ·
//   clinic) · S9 testids / inventory / client safety / nav · X1 X3 X6 X8 X9.
//   n/a: X2 (no new op/tool — ops are C1.10's; S6.7 only probes the switch) · X4 (no new consumer) · X5 (no cron job) · X7 (no public
//   endpoint) · X10 (no file/secret route).
// FLAG (not decided here — controller): qc-member-m1.1 S3.1 counts appointments = 40 / members = 7 exactly; the CRM seed adds 2
//   appointments + nok ⇒ red whenever the CRM seed is present. Must be settled before the phase-C1 qc:all (options: m1.1 counts only
//   its own seed rows · or the CRM seed stops adding appointments · or an ORACLE-EDIT with the new numbers).
// HOUSE RULES: SKIP guard (no DB before it) · throwaway tenants swept in `finally` (every table with tenantId, 4 passes) + users + sessions
//   + rate buckets of our keys · no drainOutbox (bridges are called directly) · outbound fetch to storage never happens · seeded QC data
//   never read or written · last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

const THIS_FILE = "scripts/qc-crm-c1.11.mts";
const BASE_COMMIT = "6f37399"; // session/crm HEAD when this oracle was written — "new in C1.11" = absent at this commit
const CRM_DIR = "src/app/app/sys/[id]/crm";
const SYS_PAGE = "src/app/app/sys/[id]/page.tsx";
const PARTY_PAGE = "src/app/app/party/[partyId]/page.tsx";
const CONTACTS_PAGE = `${CRM_DIR}/contacts/page.tsx`;
const COMPANIES_PAGE = `${CRM_DIR}/companies/page.tsx`;
const CO_360 = `${CRM_DIR}/companies/[companyId]/page.tsx`;
const IMPORT_PAGE = `${CRM_DIR}/contacts/import/page.tsx`;
const DUP_C_PAGE = `${CRM_DIR}/contacts/duplicates/page.tsx`;
const DUP_CO_PAGE = `${CRM_DIR}/companies/duplicates/page.tsx`;
const TPL_DIR = "src/lib/modules/crm/templates/business";
const TPL_FILE = "src/lib/modules/crm/templates.ts";
const CTX_PANEL = "src/lib/modules/chat/context-panel.tsx";
const NAV_FILE = "src/lib/modules/crm/nav.ts";
const LAYOUT = "src/app/app/layout.tsx";
const V1_ORACLE = "scripts/qc-crm-v1.mts";
const FITNESS = "scripts/fitness.mts";
const CRM_FACADE = "src/lib/modules/crm/index.ts";
const BR_DIR = "src/lib/platform/crm-bridges";
const API_ROUTE = "src/app/api/v1/crm/[...path]/route.ts";
const V1_ACTIONS_FILE = "src/lib/modules/crm/actions.ts";
const DIVE_STAGES = ["ผู้สนใจ", "คุยความต้องการ", "เสนอราคา", "เจรจา", "มัดจำ", "ชนะ"];

const ARGV = process.argv.slice(2);
const FORCE = ARGV.includes("--force-run");

const read = (p: string) => (p && existsSync(p) ? readFileSync(p, "utf8") : "");
const walkFiles = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkFiles(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out.sort();
};
const gitLs = (() => {
  try { return new Set(execFileSync("git", ["ls-tree", "-r", "--name-only", BASE_COMMIT], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\n").filter(Boolean)); } catch { return new Set<string>(); }
})();
const isNewFile = (f: string) => gitLs.size > 0 && !gitLs.has(f);
const SETTINGS_PAGE = (() => {
  for (const c of [`${CRM_DIR}/settings/page.tsx`, `${CRM_DIR}/settings/general/page.tsx`, `${CRM_DIR}/settings/version/page.tsx`]) if (existsSync(c)) return c;
  return walkFiles(`${CRM_DIR}/settings`).find((f) => f.endsWith("/page.tsx") && isNewFile(f) && /uiVersion/.test(read(f))) ?? "";
})();
const SWITCH_PATH = SETTINGS_PAGE ? SETTINGS_PAGE.slice(CRM_DIR.length).replace(/\/page\.tsx$/, "") || "/settings" : "/settings";
const CHAT_PANEL = walkFiles("src/components/chat").find((f) => f.endsWith(".tsx") && /crm/i.test(f.split("/").pop() ?? ""))
  ?? walkFiles("src/components/crm").find((f) => f.endsWith(".tsx") && /chat/i.test(f.split("/").pop() ?? "")) ?? "";

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guard — nothing of C1.11 exists yet ⇒ SKIPPED, no DB connection opened.
// ═══════════════════════════════════════════════════════════════════════════════════
const ANY_ARTEFACT = [TPL_DIR, TPL_FILE, IMPORT_PAGE, DUP_C_PAGE, DUP_CO_PAGE, V1_ORACLE].some((p) => existsSync(p)) || !!SETTINGS_PAGE || !!CHAT_PANEL;
if (!ANY_ARTEFACT && !FORCE) {
  console.log(`⚠️  SKIPPED — WO C1.11 not built yet (${TPL_DIR}/, ${IMPORT_PAGE}, ${DUP_C_PAGE}, the switch page, the chat CRM panel and ${V1_ORACLE} all missing)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c111-${rand}`;
// object storage / webhooks are never contacted
const FETCHES: string[] = [];
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) return realFetch(input, init);
  FETCHES.push(url);
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

// ═══════════════════════════════════════════════════════════════════════════════════
// A real Next request scope (C0.4 / C1.9 technique) — pages and server actions read the session with cookies()/headers().
// ═══════════════════════════════════════════════════════════════════════════════════
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null)) as Any;
let SCOPE_RUNS = 0;
async function inScope<T>(cookie: string, pathname: string, phase: "render" | "action", fn: () => Promise<T>): Promise<T> {
  if (!nextWork?.workAsyncStorage || !nextWorkUnit?.workUnitAsyncStorage || !nextCookies?.RequestCookies) return fn();
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "qc-c111", "x-forwarded-for": "203.0.113.111" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const workStore = {
    route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false,
    fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [],
  };
  const unit = {
    type: "request", phase, implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar,
    headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" },
  };
  try {
    const out = await nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
    SCOPE_RUNS += 1;
    return out;
  } catch (e) {
    if (/AsyncLocalStorage accessed in runtime/.test(String((e as Error)?.message ?? ""))) return fn();
    throw e;
  }
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
const cut = (v: unknown, n = 220) => { const s = String(v ?? ""); return s.length > n ? `${s.slice(0, n)}…` : s; };
const thai = (s: unknown) => typeof s === "string" && s.trim().length > 0 && /[ก-๙]/.test(s);
const fnOf = (mod: Any, ...names: string[]): Any => {
  for (const n of names) {
    let v: Any = mod;
    for (const p of n.split(".")) v = v?.[p];
    if (typeof v === "function") return v;
  }
  return undefined;
};
const pj = (v: Any): string => {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(v, (k, x) => {
      if (k === "_owner" || k === "_store" || typeof x === "function" || typeof x === "symbol") return undefined;
      if (typeof x === "bigint") return x.toString();
      if (x && typeof x === "object") { if (seen.has(x)) return undefined; seen.add(x); }
      return x;
    }) ?? "";
  } catch { return ""; }
};
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|[^:"'`])\/\/.*$/, "$1")).join("\n");
const isUseServer = (f: string) => /^\s*["']use server["'];?\s*$/m.test(read(f).split("\n").filter((l) => !/^\s*\/\//.test(l)).slice(0, 6).join("\n"));
const isUseClient = (f: string) => /^\s*["']use client["'];?\s*$/m.test(read(f).split("\n").filter((l) => !/^\s*\/\//.test(l)).slice(0, 6).join("\n"));

// ─── server actions: every "use server" file of the CRM module / CRM pages / CRM + chat components / chat module files named *crm* ───
const V1_MOD = (await import(pathToFileURL(resolve(V1_ACTIONS_FILE)).href).catch(() => ({}))) as Any;
const ACTION_FILES = [
  ...walkFiles("src/lib/modules/crm").filter((f) => !f.includes("/templates/")),
  ...walkFiles(CRM_DIR), ...walkFiles("src/components/crm"), ...walkFiles("src/components/chat"),
  ...walkFiles("src/lib/modules/chat").filter((f) => /crm/i.test(f.split("/").pop() ?? "")),
].filter((f) => f !== V1_ACTIONS_FILE && isUseServer(f));
const ACTIONS: Record<string, Any> = {};
const ACTION_IMPORT_ERR: string[] = [];
for (const f of ACTION_FILES) {
  const mod = (await import(pathToFileURL(resolve(f)).href).catch((e: unknown) => { ACTION_IMPORT_ERR.push(`${f}: ${cut(e instanceof Error ? e.message : String(e), 120)}`); return {}; })) as Any;
  for (const [k, v] of Object.entries(mod)) if (typeof v === "function" && !(k in ACTIONS)) ACTIONS[k] = v;
}
const NAMES = {
  setUiVersion: ["setCrmUiVersionAction", "setUiVersionAction"],
  applyTemplate: ["applyBusinessTemplateAction"],
  chatPanel: ["getChatCrmPanelAction"],
  chatLead: ["createLeadFromChatAction"],
  chatActivity: ["logActivityFromChatAction"],
  mergeContacts: ["mergeContactsAction"],
  mergeCompanies: ["mergeCompaniesAction"],
  importContacts: ["importContactsAction"],
  exportContacts: ["exportContactsAction"],
  createCompany: ["createCompanyAction"],
} as const;
type ActName = keyof typeof NAMES;
const actFn = (n: ActName): Any => fnOf(ACTIONS, ...NAMES[n]);

type Who = { userId: string; role: string; unitAccess: string[]; permissions: Record<string, unknown>; cookie: string; tenantId: string };
type AR = { ok: boolean; code: string; msg: string; v: Any; thrown: boolean; missing: boolean };
const run = async (who: Who, fn: Any, label: string, ...args: Any[]): Promise<AR> => {
  if (typeof fn !== "function") return { ok: false, code: "MISSING_FUNCTION", msg: `${label} missing`, v: undefined, thrown: false, missing: true };
  try {
    const v = await inScope(who.cookie, `/app/sys/x/crm`, "action", () => fn(...args));
    if (v && typeof v === "object" && "ok" in v) {
      return { ok: (v as Any).ok === true, code: String((v as Any).code ?? ""), msg: String((v as Any).error ?? (v as Any).reason ?? (v as Any).message ?? ""), v, thrown: false, missing: false };
    }
    return { ok: true, code: "", msg: "", v, thrown: false, missing: false };
  } catch (e) {
    const x = e as Any;
    const digest = String(x?.digest ?? "");
    if (digest.startsWith("NEXT_REDIRECT")) return { ok: true, code: "REDIRECT", msg: digest, v: null, thrown: true, missing: false };
    const m = /NEXT_HTTP_ERROR_FALLBACK;(\d+)/.exec(digest);
    if (m) return { ok: false, code: m[1] === "404" ? "NOT_FOUND" : `HTTP_${m[1]}`, msg: "", v: null, thrown: true, missing: false };
    return { ok: false, code: String(x?.code ?? "THROWN"), msg: e instanceof Error ? e.message : String(e), v: null, thrown: true, missing: false };
  }
};
const act = (who: Who, name: ActName, ...args: Any[]) => run(who, actFn(name), NAMES[name][0], ...args);
const aNF = (r: AR) => !r.ok && r.code === "NOT_FOUND";
const aForb = (r: AR) => !r.ok && r.code === "FORBIDDEN";
const aVal = (r: AR) => !r.ok && (r.code === "VALIDATION" || r.code === "BAD_INPUT" || r.code === "NOT_FOUND");
const aRefused = (r: AR) => !r.ok && !r.missing;
const aDesc = (r: AR) => (r.ok ? `ok${r.code ? `(${r.code})` : ""}` : `${r.code}:${cut(r.msg, 90)}`);
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

// ─── pages: import + call inside a request scope + walk the element tree ───
type PR = { status: number; text: string; els: { name: string; props: Any }[]; err: string };
const PAGE_MODS = new Map<string, Any>();
const typeName = (t: Any): string =>
  typeof t === "string" ? t : typeof t === "function" ? String(t.displayName || t.name || "fn")
    : t && typeof t === "object" ? String(t.displayName || t.render?.displayName || t.render?.name || t.type?.name || "obj") : String(t);
const isEl = (x: Any) => !!x && typeof x === "object" && typeof x.$$typeof === "symbol" && "props" in x;
async function walkNode(n: Any, acc: { text: string[]; els: { name: string; props: Any }[]; seen: Set<object> }, d: number): Promise<void> {
  if (d > 220 || n === null || n === undefined || typeof n === "boolean" || typeof n === "function" || typeof n === "symbol") return;
  if (typeof n === "string" || typeof n === "number" || typeof n === "bigint") { acc.text.push(String(n)); return; }
  if (typeof n !== "object") return;
  if (n instanceof Date) { acc.text.push(n.toISOString()); return; }
  if (acc.seen.has(n)) return;
  acc.seen.add(n);
  if (typeof n.then === "function") { await walkNode(await n, acc, d + 1); return; }
  if (Array.isArray(n)) { for (const x of n) await walkNode(x, acc, d + 1); return; }
  if (isEl(n)) {
    const t = n.type;
    const props = n.props ?? {};
    acc.els.push({ name: typeName(t), props });
    if (typeof t === "function") {
      if (t.constructor?.name === "AsyncFunction") { await walkNode(await t(props), acc, d + 1); return; }
      let out: Any;
      let rendered = false;
      const origErr = console.error;
      console.error = () => undefined; // React logs "Invalid hook call" before throwing — expected for client components
      try { out = t(props); rendered = true; } catch { /* a client component (hooks) — read it through its props */ } finally { console.error = origErr; }
      if (rendered) { await walkNode(out, acc, d + 1); return; }
    }
    for (const [k, v] of Object.entries(props)) if (k !== "key" && k !== "ref") await walkNode(v, acc, d + 1);
    return;
  }
  for (const [k, v] of Object.entries(n)) if (k !== "_owner" && k !== "_store") await walkNode(v, acc, d + 1);
}
const render = async (who: Who, file: string, params: Record<string, string>, sp: Record<string, string> = {}): Promise<PR> => {
  if (!file || !existsSync(file)) return { status: 0, text: "", els: [], err: `page missing (${file || "?"})` };
  let mod = PAGE_MODS.get(file);
  if (!mod) {
    mod = await import(pathToFileURL(resolve(file)).href).catch((e: unknown) => ({ __err: e instanceof Error ? e.message : String(e) }));
    PAGE_MODS.set(file, mod);
  }
  const Page = mod?.default;
  if (typeof Page !== "function") return { status: 0, text: "", els: [], err: `no default export (${cut(mod?.__err, 160)})` };
  const acc = { text: [] as string[], els: [] as { name: string; props: Any }[], seen: new Set<object>() };
  try {
    await inScope(who.cookie, `/app/sys/${params.id ?? params.partyId ?? "x"}/page`, "render", async () => {
      const out = await Page({ params: Promise.resolve(params), searchParams: Promise.resolve(sp) });
      await walkNode(out, acc, 0);
    });
    return { status: 200, text: acc.text.join("\n"), els: acc.els, err: "" };
  } catch (e) {
    const digest = String((e as Any)?.digest ?? "");
    if (/NEXT_HTTP_ERROR_FALLBACK;404/.test(digest)) return { status: 404, text: "", els: [], err: "" };
    if (digest.startsWith("NEXT_REDIRECT")) return { status: 307, text: "", els: [], err: digest };
    return { status: -1, text: acc.text.join("\n"), els: acc.els, err: cut(e instanceof Error ? `${e.name}: ${e.message}` : String(e), 200) };
  }
};
const pDesc = (r: PR) => `${r.status}${r.err ? `(${cut(r.err, 110)})` : ""}`;
const hasTid = (r: PR, tid: string) => r.els.some((e) => String(e.props?.["data-testid"] ?? "") === tid);
const allOf = (r: PR) => `${r.text}\n${pj(r.els.map((e) => e.props))}`;
const hrefs = (r: PR) => r.els.map((e) => String(e.props?.href ?? "")).filter(Boolean);
const hasEl = (r: PR, name: string) => r.els.some((e) => e.name === name);

// ─── client-safety resolver: does a file reach prisma through VALUE imports? ("use server" files are a boundary) ───
const resolveSpec = (from: string, spec: string): string => {
  let base = "";
  if (spec.startsWith("@/")) base = join("src", spec.slice(2));
  else if (spec.startsWith(".")) base = join(dirname(from), spec);
  else return "";
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) if (existsSync(c) && statSync(c).isFile()) return c;
  return "";
};
const valueImports = (src: string): string[] => {
  const out: string[] = [];
  const re = /(?:^|\n)\s*(import|export)\s+(type\s+)?([\s\S]*?)\s*from\s*["']([^"']+)["']/g;
  for (const m of src.matchAll(re)) {
    if (m[2]) continue;
    const clause = m[3] ?? "";
    const braces = /^\{([\s\S]*)\}$/.exec(clause.trim());
    if (braces && braces[1].split(",").map((s) => s.trim()).filter(Boolean).every((s) => s.startsWith("type "))) continue;
    out.push(m[4]);
  }
  for (const m of src.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g)) out.push(m[1]);
  return out;
};
const reachesPrisma = (file: string, depth = 0, seen = new Set<string>()): string => {
  if (depth > 10 || seen.has(file)) return "";
  seen.add(file);
  const src = read(file);
  if (depth > 0 && /^\s*["']use server["']/m.test(src.split("\n").filter((l) => !/^\s*\/\//.test(l)).slice(0, 6).join("\n"))) return "";
  for (const spec of valueImports(src)) {
    if (spec === "@prisma/client" || spec === "@/lib/core/db" || (/(^|\/)db$/.test(spec) && spec.startsWith("."))) return `${file} → ${spec}`;
    const f = resolveSpec(file, spec);
    if (!f) continue;
    const hit = reachesPrisma(f, depth + 1, seen);
    if (hit) return `${file} → ${hit}`;
  }
  return "";
};
/** interactive JSX tags without a data-testid (hidden inputs exempt) — brace-aware scan of each opening tag */
const tagsWithoutTestid = (src: string): string[] => {
  const miss: string[] = [];
  const re = /<(button|input|select|textarea|Link|a|form)(?=[\s/>])/g;
  for (const m of src.matchAll(re)) {
    let i = (m.index ?? 0) + m[0].length;
    let depth = 0;
    let quote = "";
    for (; i < src.length; i += 1) {
      const c = src[i];
      if (quote) { if (c === quote && src[i - 1] !== "\\") quote = ""; continue; }
      if (c === '"' || c === "'" || c === "`") { if (depth > 0 || c !== "`") quote = c; continue; }
      if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      else if (c === ">" && depth === 0) break;
    }
    const tag = src.slice(m.index ?? 0, i + 1);
    if (/type=["']hidden["']/.test(tag)) continue;
    if (!/data-testid/.test(tag)) miss.push(cut(tag.replace(/\s+/g, " "), 70));
  }
  return miss;
};
// ─── responsive static proxies ───
const FIXED_W = /(^|[\s"'`{(])((?:[a-z0-9]+:)*)(min-w|w)-\[(\d+(?:\.\d+)?)(px|rem)\]/g;
const wideUnprefixed = (src: string): string[] => {
  const out: string[] = [];
  for (const m of src.matchAll(FIXED_W)) {
    if (m[2]) continue; // responsive prefix (sm:/md:/lg:/…) ⇒ not applied at 390
    const n = Number(m[4]);
    const px = m[5] === "rem" ? n * 16 : n;
    if (px > 390) out.push(`${m[3]}-[${m[4]}${m[5]}]`);
  }
  for (const m of src.matchAll(/\b(minWidth|width)\s*:\s*["'`]?(\d{3,})(px)?["'`]?/g)) if (Number(m[2]) > 390) out.push(`${m[1]}:${m[2]}`);
  return out;
};
const hasScroller = (src: string) => /overflow-x-(auto|scroll)|\boverflow-auto\b/.test(src);
const classLits = (src: string): string[] => [...src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|'([^']*)')/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
/** a card variant shown below the breakpoint (…:hidden) AND a table wrapper hidden below it (hidden … md:block) */
const hasCardAlt = (src: string) => { const c = classLits(src); return c.some((x) => /(^|\s)(sm|md|lg):hidden(\s|$)/.test(x)) && c.some((x) => /(^|\s)hidden(\s|$)/.test(x) && /(^|\s)(sm|md|lg):(block|table|grid|flex)(\s|$)/.test(x)); };
/** a narrow summary table that drops columns below the breakpoint (hidden sm:table-cell) */
const hidesColumns = (src: string) => classLits(src).some((x) => /(^|\s)hidden(\s|$)/.test(x) && /(^|\s)(sm|md|lg):table-cell(\s|$)/.test(x));

// ─────────────────────────── state ───────────────────────────
const TIDS: string[] = [];
const USERS: string[] = [];
const KEY_IDS: string[] = [];
let phoneSeq = 0;
const phoneOf = (): string => `08${String((Math.floor(Math.random() * 9_000_000) + 1_000_000) * 10 + (phoneSeq++ % 10)).padStart(8, "0").slice(-8)}`;
const STAFF_DEFAULT = [
  "crm.contact.read", "crm.contact.create", "crm.contact.update", "crm.company.read", "crm.company.create", "crm.company.update",
  "crm.deal.read", "crm.deal.create", "crm.deal.update", "crm.deal.move", "crm.deal.lines", "crm.deal.quote",
  "crm.activity.read", "crm.activity.create", "crm.activity.complete", "crm.activity.delete",
  "crm.email.send", "crm.email.read", "crm.sequence.enroll", "crm.record.read", "crm.record.create", "crm.record.update", "crm.report.view",
];
const perms = (keys: readonly string[], extra: Record<string, unknown> = {}) => ({ ...Object.fromEntries(keys.map((k) => [k, true])), ...extra });
const DAY = 86_400_000;

console.log(`\n═══ QC CRM v2 · C1.11 — responsive · chat panel · 16 templates · import/duplicates/merge UI · v1→v2 switch ═══`);
console.log(`[env] DB ${host} · tag ${TAG}${FORCE && !ANY_ARTEFACT ? " · --force-run with the C1.11 artefacts ABSENT (functional checks below are expected red)" : ""}`);
console.log(`[discover] switch page ${SETTINGS_PAGE || "-"} · chat panel ${CHAT_PANEL || "-"} · action files ${ACTION_FILES.length} · actions ${Object.keys(ACTIONS).length}`);
console.log(`[FLAG] qc-member-m1.1 S3.1 (appointments 40 / members 7 exact) is red whenever the CRM seed is present — decide before the phase-C1 qc:all (not asserted here)\n`);

try {
  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — T (CRM S v2 first · S2 S3 S4 S5 v2 · MEMBER M · CHAT C · clinic unit) · TV (CRM v1 + CHAT) · TB (foreign CRM v2) · TW (switch)
  // ═════════════════════════════════════════════════════════════════════════════
  const sysSvc = (await import("@/lib/modules/system/service")) as Any;
  const coreHash = (await import("@/lib/core/hash" as string)) as Any;
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => ({}))) as Any;
  const CT = (await import("@/lib/modules/crm/contacts" as string).catch(() => ({}))) as Any;
  const CSH = (await import("@/lib/modules/crm/contacts-shared" as string).catch(() => ({}))) as Any;
  const DSH = (await import("@/lib/modules/crm/deals-shared" as string).catch(() => ({}))) as Any;
  const RULES = (await import("@/lib/modules/crm/rules" as string).catch(() => ({}))) as Any;
  const UV = (await import("@/lib/modules/crm/ui-version" as string).catch(() => ({}))) as Any;
  const ST = (await import("@/lib/modules/crm/settings" as string).catch(() => ({}))) as Any;
  const OTPL = (await import("@/lib/modules/crm/templates/objects" as string).catch(() => ({}))) as Any;
  const BR = (await import("@/lib/platform/crm-bridges" as string).catch(() => ({}))) as Any;
  const AK = (await import("@/lib/api-keys/service" as string).catch(() => ({}))) as Any;
  const ROUTE = existsSync(API_ROUTE) ? ((await import("@/app/api/v1/crm/[...path]/route" as string).catch(() => null)) as Any) : null;
  let TPL: Any = {};
  for (const spec of ["@/lib/modules/crm/templates", "@/lib/modules/crm/templates/business", "@/lib/modules/crm/templates/business/index"]) {
    const m = (await import(spec as string).catch(() => null)) as Any;
    if (m && (m.BUSINESS_TEMPLATES || m.applyBusinessTemplate)) TPL = { ...m, ...TPL };
  }
  const TEMPLATES: Any[] = Array.isArray(TPL.BUSINESS_TEMPLATES) ? [...TPL.BUSINESS_TEMPLATES] : TPL.BUSINESS_TEMPLATES ? Object.values(TPL.BUSINESS_TEMPLATES) : [];
  const DIVE = TEMPLATES.find((t) => t?.key === "dive") ?? TEMPLATES.find((t) => /ดำน้ำ/.test(String(t?.label ?? "")));
  const applySvc = fnOf(TPL, "applyBusinessTemplate");

  const mkTenant = async (suffix: string) => {
    const t = (await P.tenant.create({ data: { name: `${TAG}${suffix}`, slug: `${TAG}${suffix}` } })).id as string;
    TIDS.push(t);
    return t;
  };
  const T = await mkTenant("");
  const TV = await mkTenant("-v");
  const TB = await mkTenant("-b");
  const TW = await mkTenant("-w");
  const mkWho = async (tid: string, suffix: string, role: string, p: Record<string, unknown>): Promise<Who> => {
    const u = await P.user.create({ data: { email: `${TAG}-${suffix}@qc.invalid`, name: `QC ${suffix} ${TAG}` } });
    USERS.push(u.id);
    await P.membership.create({ data: { userId: u.id, tenantId: tid, role, unitAccess: ["*"], permissions: p, acceptedAt: new Date() } });
    const token = coreHash.randomToken(32) as string;
    await P.session.create({ data: { userId: u.id, tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 30 * DAY), expiresAt: new Date(Date.now() + 90 * DAY) } });
    return { userId: u.id, role, unitAccess: ["*"], permissions: p, tenantId: tid, cookie: `shark_session=${token}; __Host-shark_session=${token}; shark_tenant=${tid}` };
  };
  const CHAT_READ = { "chat.conversation.read": true };
  const owner = await mkWho(T, "owner", "OWNER", {});
  const mgr = await mkWho(T, "mgr", "MANAGER", { "crm.settings.manage": true });
  const thana = await mkWho(T, "thana", "STAFF", perms([...STAFF_DEFAULT, "crm.contact.merge", "crm.contact.import", "crm.company.merge"], CHAT_READ));
  const nok = await mkWho(T, "nok", "STAFF", perms(STAFF_DEFAULT, CHAT_READ));
  const chatOnly = await mkWho(T, "chatonly", "STAFF", { ...CHAT_READ });
  const ownerV = await mkWho(TV, "ownerv", "OWNER", {});
  const mgrV = await mkWho(TV, "mgrv", "MANAGER", { "crm.settings.manage": true });
  const ownerB = await mkWho(TB, "ownerb", "OWNER", {});
  const ownerW = await mkWho(TW, "ownerw", "OWNER", {});
  const mgrW = await mkWho(TW, "mgrw", "MANAGER", { "crm.settings.manage": true });
  const staffW = await mkWho(TW, "staffw", "STAFF", perms(STAFF_DEFAULT));
  const actorOf = (w: Who) => ({ userId: w.userId, role: w.role, unitAccess: w.unitAccess, permissions: w.permissions });

  const mk = async (tid: string, type: string, label: string) => {
    const id = (await sysSvc.createSystem(tid, type, `${label} ${TAG}`)).id as string;
    await new Promise((r) => setTimeout(r, 25)); // createdAt order is meaningful (first CRM system = chat panel target)
    return id;
  };
  const S = await mk(T, "CRM", "CRM");
  const S2 = await mk(T, "CRM", "CRM สอง");
  const S3 = await mk(T, "CRM", "CRM สาม");
  const S4 = await mk(T, "CRM", "CRM สี่");
  const S5 = await mk(T, "CRM", "CRM ห้า");
  const M = await mk(T, "MEMBER", "สมาชิก");
  const C = await mk(T, "CHAT", "แชท");
  const SV = await mk(TV, "CRM", "CRM v1");
  const CV = await mk(TV, "CHAT", "แชท v1");
  const SB = await mk(TB, "CRM", "CRM B");
  const SW = await mk(TW, "CRM", "CRM สลับ");
  const CW = await mk(TW, "CHAT", "แชท สลับ");
  /** throwaway systems only: merge keys into settings.crm with one jsonb statement */
  const setCrm = (sysId: string, obj: Record<string, unknown>) =>
    P.$executeRawUnsafe(
      `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
        (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
      JSON.stringify(obj), sysId);
  for (const id of [S, S2, S3, S4, S5, SB]) await setCrm(id, { uiVersion: 2 });
  await setCrm(SV, { uiVersion: 1 });
  await setCrm(S3, { chatToLead: true }); // S3.3: the template apply must not wipe other settings.crm keys
  const crmOf = async (id: string) => ((await P.appSystem.findUnique({ where: { id } }))?.settings as Any)?.crm ?? {};

  // teams (raw) · phuket: thana · krabi: nok (LEAD)
  const teamP = (await P.team.create({ data: { tenantId: T, name: `ภูเก็ต ${rand}` } })).id as string;
  const teamK = (await P.team.create({ data: { tenantId: T, name: `กระบี่ ${rand}`, leadUserId: nok.userId } })).id as string;
  await P.teamMember.create({ data: { tenantId: T, teamId: teamP, userId: thana.userId, role: "MEMBER" } });
  await P.teamMember.create({ data: { tenantId: T, teamId: teamK, userId: nok.userId, role: "LEAD" } });

  const mkParty = async (tid: string, name: string, kind = "PERSON", extra: Record<string, Any> = {}) => (await P.party.create({ data: { tenantId: tid, name, kind, ...extra } })).id as string;
  const mkCompany = async (tid: string, sid: string, name: string, ownerUserId: string | null, teamId: string | null, extra: Record<string, Any> = {}) =>
    (await P.crmCompany.create({ data: { tenantId: tid, systemId: sid, name, partyId: await mkParty(tid, name, "COMPANY"), ownerUserId, teamId, ...extra } })).id as string;
  const mkContact = async (tid: string, sid: string, name: string, o: { ownerUserId?: string | null; teamId?: string | null; partyId?: string; phone?: string; email?: string | null; company?: { id: string; name: string } | null; jobTitle?: string } = {}) => {
    const phone = o.phone ?? phoneOf();
    const partyId = o.partyId ?? (await mkParty(tid, name, "PERSON", { phone }));
    const row = await P.crmContact.create({
      data: {
        tenantId: tid, systemId: sid, name, firstName: name, phone, email: o.email ?? null, partyId, ownerUserId: o.ownerUserId ?? null, teamId: o.teamId ?? null,
        company: o.company?.name ?? null, companyId: o.company?.id ?? null, jobTitle: o.jobTitle ?? null,
      },
    });
    if (o.company) await P.crmCompanyContact.create({ data: { tenantId: tid, companyId: o.company.id, contactId: row.id, isPrimary: true } });
    return { id: row.id as string, partyId, phone };
  };
  const mkPipe = async (tid: string, sid: string) => {
    const p = (await P.crmPipeline.create({
      data: {
        tenantId: tid, systemId: sid, name: `ขาย ${TAG}`, isDefault: true,
        stages: { create: [
          { tenantId: tid, systemId: sid, sortOrder: 0, name: "ใหม่", kind: "OPEN", probability: 10 },
          { tenantId: tid, systemId: sid, sortOrder: 1, name: "เสนอราคา", kind: "OPEN", probability: 50 },
          { tenantId: tid, systemId: sid, sortOrder: 2, name: "ชนะ", kind: "WON", probability: 100 },
        ] },
      },
      include: { stages: true },
    })) as Any;
    const st = [...(p.stages as Any[])].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.id as string);
    return { id: p.id as string, st };
  };
  const mkDeal = async (tid: string, sid: string, pipe: { id: string; st: string[] }, title: string, contactId: string, o: { ownerUserId?: string | null; teamId?: string | null; companyId?: string | null; won?: boolean; stalledAt?: Date | null; stage?: number } = {}) => {
    const stageId = o.won ? pipe.st[2] : pipe.st[o.stage ?? 0];
    const d = await P.crmDeal.create({ data: {
      tenantId: tid, systemId: sid, pipelineId: pipe.id, stageId, contactId, title, valueSatang: 15_200_000, kind: o.won ? "WON" : "OPEN",
      ownerUserId: o.ownerUserId ?? null, teamId: o.teamId ?? null, companyId: o.companyId ?? null, stalledAt: o.stalledAt ?? null, closedAt: o.won ? new Date() : null,
    } });
    await P.crmDealStageHistory.create({ data: { tenantId: tid, dealId: d.id, toStageId: stageId } });
    return d.id as string;
  };
  const mkChat = async (tid: string, chatSys: string, o: { partyId?: string | null; phone?: string | null; name: string; email?: string | null }) => {
    const cc = await P.chatContact.create({ data: { tenantId: tid, systemId: chatSys, channel: "LINE", externalUserId: `${TAG}-u${randomBytes(4).toString("hex")}`, displayName: o.name, phone: o.phone ?? null, email: o.email ?? null, partyId: o.partyId ?? null } });
    const conv = await P.chatConversation.create({ data: { tenantId: tid, systemId: chatSys, channel: "LINE", contactId: cc.id, lastMessageAt: new Date(), lastMessagePreview: "สวัสดีครับ" } });
    return conv.id as string;
  };

  // ── tenant T / system S fixtures ──
  const coPName = `บริษัทภูเก็ต ${rand}`;
  const coP = await mkCompany(T, S, coPName, thana.userId, teamP);
  const kPName = `คุณภูเก็ต ${rand}`;
  const kPEmail = `phuket.${rand}@qc.invalid`;
  const kP = await mkContact(T, S, kPName, { ownerUserId: thana.userId, teamId: teamP, email: kPEmail, company: { id: coP, name: coPName } });
  const coK = await mkCompany(T, S, `บริษัทกระบี่ลับ ${rand}`, nok.userId, teamK);
  const kKName = `คุณกระบี่ลับ ${rand}`;
  const kK = await mkContact(T, S, kKName, { ownerUserId: nok.userId, teamId: teamK, company: { id: coK, name: `บริษัทกระบี่ลับ ${rand}` } });
  const pipe = await mkPipe(T, S);
  const dP1T = `ดีลภูเก็ตหนึ่ง ${rand}`;
  const dP2T = `ดีลภูเก็ตสอง ${rand}`;
  const dPwT = `ดีลภูเก็ตชนะแล้ว ${rand}`;
  const dKT = `ดีลกระบี่ลับ ${rand}`;
  const dP1 = await mkDeal(T, S, pipe, dP1T, kP.id, { ownerUserId: thana.userId, teamId: teamP, companyId: coP, stalledAt: new Date(Date.now() - 21 * DAY), stage: 1 });
  const dP2 = await mkDeal(T, S, pipe, dP2T, kP.id, { ownerUserId: thana.userId, teamId: teamP, companyId: coP });
  await mkDeal(T, S, pipe, dPwT, kP.id, { ownerUserId: thana.userId, teamId: teamP, companyId: coP, won: true });
  await mkDeal(T, S, pipe, dKT, kK.id, { ownerUserId: nok.userId, teamId: teamK, companyId: coK });
  const aPT = `งานโทรภูเก็ต ${rand}`;
  const aKT = `งานกระบี่ลับ ${rand}`;
  await P.crmActivity.create({ data: { tenantId: T, systemId: S, contactId: kP.id, type: "TASK", title: aPT, dueAt: new Date(), ownerUserId: thana.userId } });
  await P.crmActivity.create({ data: { tenantId: T, systemId: S, contactId: kK.id, type: "TASK", title: aKT, dueAt: new Date(), ownerUserId: nok.userId } });
  // duplicates: phuket pair (thana sees) · krabi pair (thana does not) · company pair (same domain + name core)
  const dupPhone = phoneOf();
  const kD1 = await mkContact(T, S, `คุณซ้ำหนึ่ง ${rand}`, { ownerUserId: thana.userId, teamId: teamP, phone: dupPhone, jobTitle: "ผู้จัดการ" });
  const kD2 = await mkContact(T, S, `คุณซ้ำสอง ${rand}`, { ownerUserId: thana.userId, teamId: teamP, phone: dupPhone, jobTitle: "ผู้อำนวยการฝ่ายขาย" });
  const kPhoneK = phoneOf();
  const kKD1 = await mkContact(T, S, `คุณซ้ำกระบี่ลับหนึ่ง ${rand}`, { ownerUserId: nok.userId, teamId: teamK, phone: kPhoneK });
  const kKD2 = await mkContact(T, S, `คุณซ้ำกระบี่ลับสอง ${rand}`, { ownerUserId: nok.userId, teamId: teamK, phone: kPhoneK });
  const dom = `talesai${rand}.co.th`;
  const coD1 = await mkCompany(T, S, `บริษัท ทะเลใส${rand} จำกัด`, thana.userId, teamP, { emailDomain: dom, industry: "ท่องเที่ยว" });
  const coD2 = await mkCompany(T, S, `ทะเลใส${rand}`, thana.userId, teamP, { emailDomain: dom, industry: "ดำน้ำ" });
  const impDupPhone = phoneOf();
  const kImp = await mkContact(T, S, `คุณเดิมนำเข้า ${rand}`, { ownerUserId: thana.userId, teamId: teamP, phone: impDupPhone });
  // chat rooms of T
  const convP = await mkChat(T, C, { partyId: kP.partyId, name: `แชทภูเก็ต ${rand}` });
  const convK = await mkChat(T, C, { partyId: kK.partyId, name: `แชทกระบี่ ${rand}` });
  const phN = phoneOf();
  const emN = `new.${rand}@qc.invalid`;
  const PN = await mkParty(T, `ลูกค้าใหม่แชท ${rand}`, "PERSON", { phone: phN });
  const convN = await mkChat(T, C, { partyId: PN, name: `ลูกค้าใหม่แชท ${rand}`, phone: phN, email: emN });
  const PN2 = await mkParty(T, `ลูกค้าใหม่พร้อมกัน ${rand}`, "PERSON", { phone: phoneOf() });
  const convN2 = await mkChat(T, C, { partyId: PN2, name: `ลูกค้าใหม่พร้อมกัน ${rand}` });
  // clinic row on the shared Party of kP (debt crm-C1.1: health data needs clinic rights)
  const SYMPTOM = `SYMPTOM-${rand}-ปวดหัวเรื้อรัง`;
  let clinicOk = false;
  try {
    const unit = await P.businessUnit.create({ data: { tenantId: T, type: "CLINIC", name: `คลินิก ${TAG}`, slug: `${TAG}-clinic` } });
    const pat = await P.patientRecord.create({ data: { tenantId: T, unitId: unit.id, name: kPName, phone: kP.phone, partyId: kP.partyId } });
    await P.clinicVisit.create({ data: { tenantId: T, unitId: unit.id, patientId: pat.id, symptom: SYMPTOM, partyId: kP.partyId } });
    clinicOk = true;
  } catch { clinicOk = false; }

  // ── tenant TV (uiVersion 1 forever) ──
  const kV = await mkContact(TV, SV, `คุณวีหนึ่ง ${rand}`, {});
  const PV = await mkParty(TV, `ลูกค้าใหม่วีหนึ่ง ${rand}`, "PERSON", { phone: phoneOf() });
  const convV = await mkChat(TV, CV, { partyId: kV.partyId, name: `แชทวีหนึ่ง ${rand}` });
  const convVN = await mkChat(TV, CV, { partyId: PV, name: `ลูกค้าใหม่วีหนึ่ง ${rand}` });
  const kVD1 = await mkContact(TV, SV, `คุณซ้ำวี ${rand}`, { phone: dupPhone });
  const kVD2 = await mkContact(TV, SV, `คุณซ้ำวีสอง ${rand}`, { phone: dupPhone });
  // ── tenant TB (foreign) ──
  const kBName = `คุณร้านบีลับ ${rand}`;
  const kB = await mkContact(TB, SB, kBName, {});
  const cB = await mkChat(TB, await mk(TB, "CHAT", "แชท B"), { partyId: kB.partyId, name: `แชทบี ${rand}` });
  // ── tenant TW (switch) ──
  const pipeW = await mkPipe(TW, SW);
  const kWseed = await mkContact(TW, SW, `คุณสลับเดิม ${rand}`, { ownerUserId: ownerW.userId });
  await mkDeal(TW, SW, pipeW, `ดีลสลับเดิม ${rand}`, kWseed.id, { ownerUserId: ownerW.userId });
  const mkWChat = async (label: string) => {
    const ph = phoneOf();
    const party = await mkParty(TW, `${label} ${rand}`, "PERSON", { phone: ph });
    return { conv: await mkChat(TW, CW, { partyId: party, name: `${label} ${rand}`, phone: ph }), party };
  };
  const cw1 = await mkWChat("แชทสลับหนึ่ง");
  const cw2 = await mkWChat("แชทสลับสอง");
  const cw3 = await mkWChat("แชทสลับสาม");
  await setCrm(SW, { chatToLead: true }); // uiVersion stays at its default (1)
  const fixturesOk = true;
  console.log(`[setup] T ${T} (S ${S} · S2 ${S2} · S3 ${S3} · S4 ${S4} · S5 ${S5} · M ${M} · C ${C}) · TV ${TV} (SV ${SV} v1) · TB ${TB} · TW ${TW} (SW ${SW}) · clinic ${clinicOk}\n`);

  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — structure · prerequisites · harness positive control
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S0 · structure ──");
  const tplFiles = walkFiles(TPL_DIR).filter((f) => !/\/index\.ts$/.test(f));
  const panelName = /export\s+(?:default\s+)?function\s+(\w+)/.exec(read(CHAT_PANEL))?.[1] ?? "";
  {
    const missA = (Object.keys(NAMES) as ActName[]).filter((n) => typeof actFn(n) !== "function").map((n) => NAMES[n][0]);
    const pages = { import: existsSync(IMPORT_PAGE), dupC: existsSync(DUP_C_PAGE), dupCo: existsSync(DUP_CO_PAGE), switch: !!SETTINGS_PAGE };
    chk("C1.11-S0.1", "C1.11 artefacts exist: pages contacts/import · contacts/duplicates · companies/duplicates · the switch page · 16 template data files + BUSINESS_TEMPLATES (16) + applyBusinessTemplate · the chat CRM panel component · every action of the contract (switch · template · chat panel/lead/activity · merge ×2 · import) · top-level `briefFor` in the crm facade · scripts/qc-crm-v1.mts",
      Object.values(pages).every(Boolean) && tplFiles.length >= 16 && TEMPLATES.length === 16 && typeof applySvc === "function" && !!CHAT_PANEL && !!panelName && missA.length === 0 && ACTION_IMPORT_ERR.length === 0 && typeof CRM.briefFor === "function" && existsSync(V1_ORACLE),
      "all present", `pages=${pj(pages)} tplFiles=${tplFiles.length} templates=${TEMPLATES.length} apply=${typeof applySvc} panel=${CHAT_PANEL || "-"} missing=${missA.join(",") || "-"} importErr=${ACTION_IMPORT_ERR.join(" ; ") || "-"} briefFor=${typeof CRM.briefFor} v1=${existsSync(V1_ORACLE)}`);
  }
  chk("C1.11-S0.2", "[prerequisite] fixtures (4 tenants · 5 CRM systems in T with S first · chat rooms · deals · tasks · duplicate pairs · clinic row) · ui-version gate + settings writer · C1.8 bridges (onChatMessage) · contacts.briefFor/leadFromBridge",
    fixturesOk && clinicOk && typeof UV.assertCrmV2 === "function" && typeof ST.setCrmSettingsKey === "function" && typeof BR.onChatMessage === "function" && typeof CT.briefFor === "function" && typeof CT.leadFromBridge === "function",
    "prerequisites", `clinic=${clinicOk} assertCrmV2=${typeof UV.assertCrmV2} setKey=${typeof ST.setCrmSettingsKey} onChatMessage=${typeof BR.onChatMessage} briefFor=${typeof CT.briefFor} leadFromBridge=${typeof CT.leadFromBridge}`);
  {
    const a = await render(owner, CO_360, { id: S, companyId: coP });
    const b = await render(thana, CO_360, { id: S, companyId: coK });
    const c = await render(thana, CO_360, { id: S, companyId: coP });
    chk("C1.11-S0.3", "[harness control] the request-scope renderer works on the existing C1.3 company 360: owner → 200 with the name · thana → 200 on phuket / 404 on krabi (per-request identity is real, notFound detected)",
      a.status === 200 && a.text.includes(coPName) && c.status === 200 && b.status === 404 && SCOPE_RUNS > 0, "200 · 200 · 404", `owner=${pDesc(a)} thanaP=${pDesc(c)} thanaK=${pDesc(b)} scopes=${SCOPE_RUNS}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — responsive at 390 (CRM-RUN S1 · 6): the controller measures overflow on screenshots — static proxies + the 13(a) home here
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S1 · responsive ──");
  const crmTsx = [...walkFiles(CRM_DIR), ...walkFiles("src/components/crm"), ...(CHAT_PANEL ? [CHAT_PANEL] : [])].filter((f) => f.endsWith(".tsx"));
  const NEW_FILES = [...walkFiles(CRM_DIR), ...walkFiles("src/components/crm"), ...walkFiles("src/components/chat")].filter(isNewFile);
  const NEW_TSX = NEW_FILES.filter((f) => f.endsWith(".tsx"));
  {
    const bad = crmTsx.map((f) => ({ f, w: wideUnprefixed(stripComments(read(f))) })).filter((x) => x.w.length > 0 && !hasScroller(read(x.f)));
    chk("C1.11-S1.1", "no CRM page/component (+ the chat CRM panel) sets an unprefixed width/min-width > 390 px (Tailwind w-/min-w-[…px|rem] or inline width) unless the file wraps it in an overflow-x-auto scroller [static — overflow itself is measured on the controller's 390 screenshots]",
      crmTsx.length > 20 && bad.length === 0, "0 files", `scanned=${crmTsx.length} bad=${bad.map((x) => `${x.f.replace(CRM_DIR, "crm")}:${x.w.join("/")}`).join(" ; ") || "-"}`, "MAJOR");
  }
  {
    const withTable = crmTsx.filter((f) => /<table[\s>]/.test(read(f)));
    const LIST = /(ContactListTools|companies\/page\.tsx|DealTable|duplicates|import|activities\/)/;
    const bad = withTable.filter((f) => { const s = read(f); return LIST.test(f) ? !hasCardAlt(s) : !(hasCardAlt(s) || hasScroller(s) || hidesColumns(s)); });
    chk("C1.11-S1.2", "tables → cards: every CRM file with a <table> offers a card alternative below md (…:hidden + hidden …:block|table) — list pages MUST (contacts · companies · deals table · activities · import preview · duplicates); detail tables at least sit in an overflow-x-auto scroller or drop columns below sm (hidden sm:table-cell) [static]",
      withTable.length >= 4 && bad.length === 0, "all", `tables=${withTable.length} bad=${bad.map((f) => f.replace(CRM_DIR, "crm")).join(" ; ") || "-"}`, "MAJOR");
  }
  {
    const board = walkFiles(`${CRM_DIR}/deals`).find((f) => /Board/.test(f)) ?? "";
    const s = read(board);
    chk("C1.11-S1.3", "board = swipe per stage at 390: the deal board scroller is `snap-x snap-mandatory` (unprefixed) with `snap-start|snap-center` columns and no unprefixed column width > 390 [static]",
      !!board && /(^|[\s"'`])snap-x\b/.test(s) && /(^|[\s"'`])snap-mandatory\b/.test(s) && /\bsnap-(start|center)\b/.test(s) && wideUnprefixed(s).length === 0, "swipe board", `file=${board || "-"} snapX=${/snap-x/.test(s)} cols=${/snap-(start|center)/.test(s)} wide=${wideUnprefixed(s).join(",") || "-"}`, "MAJOR");
  }
  {
    const files = [`${CRM_DIR}/contacts/[contactId]`, `${CRM_DIR}/companies/[companyId]`, `${CRM_DIR}/deals/[dealId]`].flatMap((d) => walkFiles(d));
    const bad: string[] = [];
    for (const f of files) for (const m of stripComments(read(f)).matchAll(/(^|[\s"'`])((?:[a-z0-9]+:)*)grid-cols-\[([^\]]*\d+px[^\]]*)\]/g)) {
      const fixed = [...m[3].matchAll(/(\d+)px/g)].reduce((n, x) => n + Number(x[1]), 0);
      if (!m[2] && fixed >= 240) bad.push(`${f.replace(CRM_DIR, "crm")}:grid-cols-[${m[3]}]`);
    }
    chk("C1.11-S1.4", "360 right rail → stacked/sheet at 390: no unprefixed rail grid with ≥ 240 px of fixed columns (grid-cols-[…px…]) in contact/company/deal 360 files (label/value grids like [110px_1fr] are fine) — the rail column only exists from md:/lg: up [static]",
      files.length >= 3 && bad.length === 0, "0", `files=${files.length} bad=${bad.join(" ; ") || "-"}`, "MAJOR");
  }
  {
    const r = await render(thana, SYS_PAGE, { id: S });
    const md = r.els.find((e) => String(e.props?.["data-testid"] ?? "") === "crm-home-my-deals");
    const mdText = md ? `${pj(md.props)}` : "";
    chk("C1.11-S1.5", "mockup 13(a) \"ดีลของฉัน\" on the v2 home (thana, S): crm-home + crm-home-my-deals with thana's OPEN deals as cards (title · company) · the 21-days-stalled deal carries a stale badge /นิ่ง N วัน/ · a stage chip filter names the pipeline stages · the WON deal is not a \"my deal\"",
      r.status === 200 && hasTid(r, "crm-home") && !!md && mdText.includes(dP1T) && mdText.includes(dP2T) && mdText.includes(coPName) && /นิ่ง\s*\d+\s*วัน/.test(allOf(r)) && allOf(r).includes("เสนอราคา") && !mdText.includes(dPwT),
      "13(a) cards", `home=${pDesc(r)} crm-home=${hasTid(r, "crm-home")} myDeals=${!!md} d1=${mdText.includes(dP1T)} d2=${mdText.includes(dP2T)} co=${mdText.includes(coPName)} stale=${/นิ่ง\s*\d+\s*วัน/.test(allOf(r))} won=${mdText.includes(dPwT)}`, "MAJOR");
  }
  {
    const bad = NEW_TSX.map((f) => ({ f, w: wideUnprefixed(stripComments(read(f))) })).filter((x) => x.w.length > 0);
    chk("C1.11-S1.6", "files NEW in C1.11 (pages, CRM components, the chat CRM panel) carry no unprefixed fixed width > 390 at all (not even inside a scroller) — the D7 pages list is in the report [static]",
      NEW_TSX.length >= 5 && bad.length === 0, "0", `new=${NEW_TSX.length} bad=${bad.map((x) => `${x.f}:${x.w.join("/")}`).join(" ; ") || "-"}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — chat side panel: brief + 3 buttons → lead from the room (CRM-RUN S2 · 3) + structure
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2 · chat panel ──");
  {
    const r = await act(owner, "chatPanel", convP);
    const s = pj(r.v);
    chk("C1.11-S2.1", "getChatCrmPanelAction (owner, room of kP's Party): data of the FIRST CRM system S — contact name · company · the 2 OPEN deals (not the WON one) · score slot · no phone/e-mail of the contact anywhere in the result",
      r.ok && s.includes(kPName) && s.includes(coPName) && s.includes(dP1T) && s.includes(dP2T) && !s.includes(dPwT) && s.includes(S) && /"score"/.test(s) && !s.includes(kP.phone) && !s.includes(kPEmail),
      "brief", `${aDesc(r)} name=${s.includes(kPName)} co=${s.includes(coPName)} open=${s.includes(dP1T)}/${s.includes(dP2T)} won=${s.includes(dPwT)} score=${/"score"/.test(s)} phone=${s.includes(kP.phone)} email=${s.includes(kPEmail)}`);
  }
  let chatActId = "";
  {
    const before = await P.crmActivity.count({ where: { contactId: kP.id } });
    const r = await act(owner, "chatActivity", convP, { type: "NOTE", title: `โน้ตจากแชท ${rand}` });
    const row = (await P.crmActivity.findFirst({ where: { tenantId: T, systemId: S, contactId: kP.id, title: `โน้ตจากแชท ${rand}` } })) as Any;
    chatActId = row?.id ?? "";
    const panelSrc = read(CHAT_PANEL);
    const openDeal = /crm-panel-open-deal/.test(panelSrc) && /\/crm\/deals\/new/.test(panelSrc) && /contactId/.test(panelSrc);
    chk("C1.11-S2.2", "buttons: \"บันทึกกิจกรรม\" (logActivityFromChatAction) writes ONE CrmActivity on the room's contact in S (type NOTE) · \"เปิดดีล\" links to /crm/deals/new?contactId=… (crm-panel-open-deal) [static part]",
      r.ok && !!row && row.type === "NOTE" && (await P.crmActivity.count({ where: { contactId: kP.id } })) === before + 1 && openDeal,
      "activity + link", `${aDesc(r)} row=${!!row} type=${row?.type} openDealLink=${openDeal}`);
  }
  let leadN = "";
  {
    await setCrm(S, { chatToLead: false }); // an explicit human click works with the automatic path OFF
    const r1 = await act(owner, "chatLead", convN);
    const rows = (await P.crmContact.findMany({ where: { tenantId: T, systemId: S, partyId: PN } })) as Any[];
    leadN = rows[0]?.id ?? "";
    const r2 = await act(owner, "chatLead", convN);
    const rows2 = await P.crmContact.count({ where: { tenantId: T, systemId: S, partyId: PN } });
    const r3 = await act(owner, "chatLead", convP);
    const pRows = await P.crmContact.count({ where: { tenantId: T, partyId: kP.partyId } });
    chk("C1.11-S2.3", "\"สร้าง lead จากแชท\" (createLeadFromChatAction, chatToLead OFF): new Party → ONE LEAD in S (sourceKind CHAT · partyId of the room · created:true) · second click → same contactId, created:false, still one row · a room whose Party already has a contact → created:false, no new row",
      r1.ok && rows.length === 1 && rows[0].lifecycleStage === "LEAD" && rows[0].sourceKind === "CHAT" && r1.v?.created === true && r1.v?.contactId === leadN
        && r2.ok && r2.v?.contactId === leadN && r2.v?.created === false && rows2 === 1 && r3.ok && r3.v?.created === false && r3.v?.contactId === kP.id && pRows === 1,
      "one lead", `r1=${aDesc(r1)}/${pj(r1.v)} rows=${rows.length} stage=${rows[0]?.lifecycleStage} src=${rows[0]?.sourceKind} r2=${pj(r2.v)} rows2=${rows2} r3=${pj(r3.v)} pRows=${pRows}`);
  }
  {
    const cp = read(CTX_PANEL);
    const slots = panelName ? (cp.match(new RegExp(`<${panelName}[\\s/>]`, "g")) ?? []).length : 0;
    const imported = panelName ? new RegExp(`import\\s*\\{[^}]*\\b${panelName}\\b[^}]*\\}\\s*from`).test(cp) : false;
    const ps = read(CHAT_PANEL);
    const tids = ["crm-chat-panel", "crm-panel-open-deal", "crm-panel-log-activity", "crm-panel-create-lead"].filter((t) => !ps.includes(t));
    const facade = /export\s+(async\s+function\s+briefFor|\{[^}]*\bbriefFor\b[^}]*\})/.test(stripComments(read(CRM_FACADE)));
    const edge = /["']chat→crm["']/.test(read(FITNESS));
    const client = isUseClient(CHAT_PANEL) && !reachesPrisma(CHAT_PANEL);
    chk("C1.11-S2.4", "structure: the panel is mounted in ONE slot of chat/context-panel.tsx (imported + used once, next to ChatMemberPanel) · testids crm-chat-panel + the 3 buttons · 'use client' without a value path to prisma · `briefFor` exported by the crm facade index.ts · \"chat→crm\" in ALLOWED_EDGES [static]",
      !!panelName && slots === 1 && imported && /ChatMemberPanel/.test(cp) && tids.length === 0 && facade && edge && client, "one slot",
      `panel=${panelName || "-"} slots=${slots} imported=${imported} missingTids=${tids.join(",") || "-"} facade=${facade} edge=${edge} clientSafe=${client}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — 16 business templates: data · dive answer key · apply · idempotent · own system only · picker (CRM-RUN S3 · 3)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3 · business templates ──");
  const REQ_SYS = new Set<string>((DSH.STAGE_REQUIRABLE_SYSTEM_KEYS ?? ["expectedCloseAt", "nextStep", "probabilityOverride", "companyId", "valueSatang", "ownerUserId", "tags"]) as string[]);
  const objTemplates: Any[] = (OTPL.OBJECT_TEMPLATES ?? []) as Any[];
  const objOf = (o: Any): Any => (o?.templateKey && !o?.sections ? { ...(objTemplates.find((t) => t.key === o.templateKey) ?? {}), ...o, key: o.key ?? o.templateKey } : o);
  const objFieldKeys = (o: Any): string[] => { const x = objOf(o); return [...(x?.sections ?? []).flatMap((s: Any) => (s?.fields ?? []).map((f: Any) => String(f?.key))), ...((x?.fields ?? []) as Any[]).map((f) => String(f?.key))]; };
  const fieldsOf = (t: Any, k: "contact" | "company" | "deal"): Any[] => (Array.isArray(t?.fields?.[k]) ? t.fields[k] : []);
  {
    const bad: string[] = [];
    const keys = new Set<string>();
    for (const t of TEMPLATES) {
      const k = String(t?.key ?? "");
      if (!/^[a-z][a-z0-9_]*$/.test(k) || keys.has(k)) bad.push(`key:${k}`);
      keys.add(k);
      if (!thai(t?.label)) bad.push(`${k}:label`);
      const pipes = Array.isArray(t?.pipelines) ? t.pipelines : [];
      if (pipes.length < 1) bad.push(`${k}:pipelines`);
      const dealKeys = new Set(fieldsOf(t, "deal").map((f) => String(f?.key)));
      for (const p of pipes) {
        const st = Array.isArray(p?.stages) ? p.stages : [];
        if (!p?.name || st.length < 2 || !st.some((s: Any) => s?.kind === "WON")) bad.push(`${k}:stages`);
        for (const s of st) {
          if (!["OPEN", "WON", "LOST"].includes(s?.kind) || !(Number.isInteger(s?.probability) && s.probability >= 0 && s.probability <= 100)) bad.push(`${k}:${s?.name}:kind/prob`);
          if (s?.kind === "OPEN" && !(Number(s?.staleDays) > 0)) bad.push(`${k}:${s?.name}:staleDays`);
          for (const rf of (s?.requireFields ?? []) as string[]) if (!REQ_SYS.has(rf) && !dealKeys.has(rf)) bad.push(`${k}:${s?.name}:requireFields:${rf}`);
        }
      }
      if (!((t?.lostReasons ?? []).length >= 5)) bad.push(`${k}:lostReasons`);
      if (!((t?.scoreRules ?? []).length >= 1)) bad.push(`${k}:scoreRules`);
      if (!((t?.sequences ?? []).length >= 1)) bad.push(`${k}:sequences`);
      if (!t?.fields || typeof t.fields !== "object") bad.push(`${k}:fields`);
      const objs = (t?.objects ?? []) as Any[];
      if (k === "general" ? objs.length !== 0 : objs.length < 1) bad.push(`${k}:objects`);
      for (const o of objs) {
        const x = objOf(o);
        if (!/^[a-z][a-z0-9_]{1,30}$/.test(String(x?.key)) || !["CUSTOMER", "CONTACT", "COMPANY", "DEAL", "NONE"].includes(x?.parentType) || !objFieldKeys(o).includes(String(x?.titleFieldKey))) bad.push(`${k}:object:${x?.key}`);
      }
    }
    const gen = TEMPLATES.find((t) => t?.key === "general");
    const defNames = ((RULES.DEFAULT_PIPELINE?.stages ?? []) as Any[]).map((s) => s.name);
    const genNames = ((gen?.pipelines?.[0]?.stages ?? []) as Any[]).map((s) => s.name);
    chk("C1.11-S3.1", "BUSINESS_TEMPLATES = 16 data templates with unique keys + Thai labels, each with the 6 parts (pipeline+stages with probability · staleDays on OPEN · requireFields that resolve to a system key or the template's own deal field · lost reasons ≥ 5 · score rules · default sequence · custom objects (general none, others ≥ 1, valid key/parent/title field) · extra contact/company/deal fields) · \"general\" = DEFAULT_PIPELINE's 5 stages",
      TEMPLATES.length === 16 && bad.length === 0 && !!gen && pj(genNames) === pj(defNames) && defNames.length === 5, "16 valid", `n=${TEMPLATES.length} bad=${cut(bad.join(" "), 400) || "-"} general=${pj(genNames)}`);
  }
  {
    const st = ((DIVE?.pipelines?.[0]?.stages ?? []) as Any[]);
    const nonLost = st.filter((s) => s.kind !== "LOST");
    const probs = nonLost.map((s) => Number(s.probability));
    const objs = ((DIVE?.objects ?? []) as Any[]).map(objOf);
    const trip = objs.find((o) => o?.parentType === "COMPANY" && /ทริป|กรุ๊ป/.test(String(o?.label ?? "")));
    const dl = fieldsOf(DIVE, "deal").map((f) => String(f?.label ?? ""));
    const seqs = pj(DIVE?.sequences ?? []);
    chk("C1.11-S3.2", `dive answer key (blueprint §10 row 1): stages ${DIVE_STAGES.join(" → ")} in order (last WON · probabilities strictly rising · WON 100; a trailing LOST stage allowed) · object ทริป/กรุ๊ป bound to COMPANY · deal fields จำนวนคน · วันที่เดินทาง · ระดับใบรับรอง · lost reasons ≥ 5 · the central score rules (≥ 8) · a sequence for review / next trip`,
      !!DIVE && pj(nonLost.map((s) => s.name)) === pj(DIVE_STAGES) && nonLost[nonLost.length - 1]?.kind === "WON" && probs.every((p, i) => i === 0 || p > probs[i - 1]) && probs[probs.length - 1] === 100
        && !!trip && dl.some((l) => /จำนวน/.test(l)) && dl.some((l) => /วัน.*เดินทาง/.test(l)) && dl.some((l) => /ใบรับรอง/.test(l))
        && (DIVE?.lostReasons ?? []).length >= 5 && (DIVE?.scoreRules ?? []).length >= 8 && /รีวิว|ทริปถัดไป/.test(seqs),
      "answer key", `dive=${!!DIVE} stages=${pj(nonLost.map((s) => s.name))} probs=${pj(probs)} trip=${trip?.key ?? "-"} dealFields=${pj(dl)} lost=${(DIVE?.lostReasons ?? []).length} score=${(DIVE?.scoreRules ?? []).length} seqReview=${/รีวิว|ทริปถัดไป/.test(seqs)}`);
  }
  const sysSnap = async (sid: string) => {
    const pipes = (await P.crmPipeline.findMany({ where: { systemId: sid }, include: { stages: true } })) as Any[];
    return {
      pipes: pipes.map((p) => `${p.name}:${[...p.stages].sort((a: Any, b: Any) => a.sortOrder - b.sortOrder).map((s: Any) => `${s.name}|${s.kind}|${s.probability}|${s.staleDays ?? "-"}|${(s.requireFields ?? []).join("+")}`).join(",")}`).sort(),
      lost: ((await P.crmLostReason.findMany({ where: { systemId: sid }, select: { key: true } })) as Any[]).map((r) => r.key).sort(),
      secs: ((await P.memberSection.findMany({ where: { systemId: sid }, select: { objectKey: true, key: true } })) as Any[]).map((r) => `${r.objectKey}.${r.key}`).sort(),
      flds: ((await P.memberField.findMany({ where: { systemId: sid }, select: { objectKey: true, key: true, type: true } })) as Any[]).map((r) => `${r.objectKey}.${r.key}|${r.type}`).sort(),
      objs: ((await P.customObject.findMany({ where: { systemId: sid }, select: { key: true, parentType: true, label: true } })) as Any[]).map((r) => `${r.key}|${r.parentType}|${r.label}`).sort(),
      contacts: await P.crmContact.count({ where: { systemId: sid } }),
      deals: await P.crmDeal.count({ where: { systemId: sid } }),
    };
  };
  const others0 = pj([await sysSnap(S), await sysSnap(S2), await sysSnap(M), await sysSnap(SB)]);
  const diveKey = String(DIVE?.key ?? "dive");
  const labels = TEMPLATES.map((t) => String(t?.label ?? "")).filter(Boolean);
  const pick0 = await render(owner, SYS_PAGE, { id: S3 });
  const pickThana = await render(thana, SYS_PAGE, { id: S3 });
  {
    const r = await act(owner, "applyTemplate", S3, diveKey);
    const snap = await sysSnap(S3);
    const tp = DIVE?.pipelines?.[0];
    const pipeRow = tp ? ((await P.crmPipeline.findFirst({ where: { systemId: S3, name: tp.name }, include: { stages: true } })) as Any) : null;
    const dbStages = pipeRow ? [...pipeRow.stages].sort((a: Any, b: Any) => a.sortOrder - b.sortOrder) : [];
    const stagesOk = !!tp && dbStages.length === (tp.stages ?? []).length && (tp.stages as Any[]).every((s, i) => dbStages[i]?.name === s.name && dbStages[i]?.kind === s.kind && dbStages[i]?.probability === s.probability && (s.staleDays == null || dbStages[i]?.staleDays === s.staleDays) && pj([...(s.requireFields ?? [])].sort()) === pj([...(dbStages[i]?.requireFields ?? [])].sort()));
    const lostOk = ((DIVE?.lostReasons ?? []) as Any[]).every((l) => snap.lost.includes(l.key));
    const fieldMiss = (["contact", "company", "deal"] as const).flatMap((ok) => fieldsOf(DIVE, ok).filter((f) => !snap.flds.some((x) => x.startsWith(`${ok}.${f.key}|`))).map((f) => `${ok}.${f.key}`));
    const objMiss = ((DIVE?.objects ?? []) as Any[]).flatMap((o) => { const x = objOf(o); const hasObj = snap.objs.some((s) => s.startsWith(`${x.key}|${x.parentType}|`)); return [...(hasObj ? [] : [`obj:${x.key}`]), ...objFieldKeys(o).filter((fk) => !snap.flds.some((s) => s.startsWith(`${x.key}.${fk}|`))).map((fk) => `${x.key}.${fk}`)]; });
    const crm = await crmOf(S3);
    const aud = await P.auditLog.count({ where: { tenantId: T, action: { startsWith: "crm.template" } } });
    chk("C1.11-S3.3", "applyBusinessTemplateAction(S3, dive) by the owner: pipeline + stages exactly as the data (name · kind · probability · staleDays · requireFields) · every lost-reason key · every contact/company/deal field · every custom object + its fields · settings.crm.businessTemplate.key = dive (score rules / sequence stored for C2.8 / C2.2) while chatToLead survives · audit crm.template.*",
      r.ok && !!pipeRow && stagesOk && lostOk && fieldMiss.length === 0 && objMiss.length === 0 && crm?.businessTemplate?.key === diveKey && crm?.chatToLead === true && crm?.uiVersion === 2 && aud >= 1,
      "materialised", `${aDesc(r)} pipe=${!!pipeRow} stages=${stagesOk} lost=${lostOk} fieldMiss=${fieldMiss.join(",") || "-"} objMiss=${objMiss.join(",") || "-"} settings=${pj(crm)} audit=${aud}`);
  }
  const s3a = pj(await sysSnap(S3));
  {
    const r = await act(owner, "applyTemplate", S3, diveKey);
    const r2 = applySvc ? await applySvc({ tenantId: T, systemId: S3, actorUserId: owner.userId }, diveKey).then(() => true, () => false) : false;
    const s3b = pj(await sysSnap(S3));
    // the shop's own object with the template's object key is KEPT (S5)
    const firstObj = objOf(((DIVE?.objects ?? []) as Any[])[0] ?? {});
    let keptOk = false;
    if (firstObj?.key) {
      await P.customObject.create({ data: { tenantId: T, systemId: S5, key: firstObj.key, label: `ของร้านเอง ${rand}`, labelPlural: `ของร้านเอง ${rand}`, parentType: "NONE", titleFieldKey: "x" } });
      const r5 = await act(owner, "applyTemplate", S5, diveKey);
      const rows = (await P.customObject.findMany({ where: { systemId: S5, key: firstObj.key } })) as Any[];
      keptOk = r5.ok && rows.length === 1 && rows[0].label === `ของร้านเอง ${rand}` && rows[0].parentType === "NONE";
    }
    chk("C1.11-S3.4", "idempotent: re-apply through the action AND the service → S3 byte-identical (pipelines/stages · lost reasons · sections · fields · objects) · a system that already has an object with the template's key keeps the shop's object (label/parent untouched, no duplicate) and the apply still succeeds",
      r.ok && r2 && s3a === s3b && keptOk, "no new rows", `action=${aDesc(r)} service=${r2} same=${s3a === s3b} kept=${keptOk}`);
  }
  {
    const pick1 = await render(owner, SYS_PAGE, { id: S3 });
    const labOk = labels.length === 16 && labels.every((l) => allOf(pick0).includes(l));
    const st = await act(thana, "applyTemplate", S4, diveKey);
    const unk = await act(owner, "applyTemplate", S4, `nope${rand}`);
    const s4 = pj(await sysSnap(S4));
    const empty = (await P.crmPipeline.count({ where: { systemId: S4 } })) === (await P.crmPipeline.count({ where: { systemId: S2 } }));
    chk("C1.11-S3.6", "picker on first open: the v2 home of S3 shows crm-template-picker with all 16 labels to the OWNER before any template, not to STAFF thana, and not any more after dive was applied · the action refuses STAFF (FORBIDDEN) and an unknown key (Thai, VALIDATION|NOT_FOUND) without writing",
      pick0.status === 200 && hasTid(pick0, "crm-template-picker") && labOk && !hasTid(pickThana, "crm-template-picker") && pick1.status === 200 && !hasTid(pick1, "crm-template-picker")
        && aForb(st) && aVal(unk) && thai(unk.msg) && empty && !s4.includes(String(DIVE?.pipelines?.[0]?.name ?? "§")),
      "picker", `before=${pDesc(pick0)}/${hasTid(pick0, "crm-template-picker")} labels=${labOk} thana=${hasTid(pickThana, "crm-template-picker")} after=${hasTid(pick1, "crm-template-picker")} staff=${aDesc(st)} unknown=${aDesc(unk)} s4Untouched=${empty}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X3.1 — applyBusinessTemplate ×10 in parallel, twice → exactly one set (S4 equals S3)
  // ═════════════════════════════════════════════════════════════════════════════
  {
    const ctx4 = { tenantId: T, systemId: S4, actorUserId: owner.userId };
    const res: boolean[] = [];
    for (let round = 0; round < 2; round += 1) {
      const out = await Promise.all(Array.from({ length: 10 }, () => (applySvc ? applySvc(ctx4, diveKey).then(() => true, () => false) : Promise.resolve(false))));
      res.push(...out);
    }
    const a = await sysSnap(S3);
    const b = await sysSnap(S4);
    const same = pj({ ...a, contacts: 0, deals: 0 }) === pj({ ...b, contacts: 0, deals: 0 });
    chk("C1.11-X3.1", "applyBusinessTemplate(S4, dive) ×10 in parallel, 2 rounds → every call resolves and S4 holds exactly ONE set — equal to S3 after a single apply (one template pipeline · no duplicate stage/lost reason/section/field/object)",
      typeof applySvc === "function" && res.every(Boolean) && same, "one set", `ok=${res.filter(Boolean).length}/20 same=${same} s3=${cut(pj(a.pipes), 120)} s4=${cut(pj(b.pipes), 120)}`);
  }
  {
    const others1 = pj([await sysSnap(S), await sysSnap(S2), await sysSnap(M), await sysSnap(SB)]);
    const applied = !!DIVE && (await P.crmPipeline.count({ where: { systemId: S3, name: String(DIVE?.pipelines?.[0]?.name ?? "§") } })) === 1;
    chk("C1.11-S3.5", "each apply stays inside its own system: after the applies on S3 · S4 · S5 the other CRM system S2, the fixture system S, the MEMBER system M and tenant B's system are unchanged (pipelines · lost reasons · sections · fields · objects · contacts · deals) — [control] the dive pipeline did land in S3",
      applied && others0 === others1, "unchanged", `applied=${applied} ${others0 === others1 ? "-" : cut(`${others0} ≠ ${others1}`, 400)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — import / duplicates / merge UI (CRM-RUN S4 · 3)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S4 · import · duplicates · merge ──");
  {
    const pg = await render(owner, IMPORT_PAGE, { id: S });
    const txt = allOf(pg);
    const labs = [CSH.IMPORT_TARGET_LABEL?.company, ...Object.values(CSH.IMPORT_DUPLICATE_LABEL ?? {})].filter(Boolean) as string[];
    const coName = `บริษัทนำเข้า ${rand}`;
    const phA = phoneOf();
    const phB = phoneOf();
    const r = await act(owner, "importContacts", S, {
      headers: ["ชื่อ", "เบอร์", "บริษัท"],
      rows: [[`ผู้นำเข้าเอ ${rand}`, phA, coName], [`ผู้นำเข้าบี ${rand}`, phB, coName], [`ผู้นำเข้าซ้ำ ${rand}`, impDupPhone, ""]],
      mapping: { ชื่อ: "firstName", เบอร์: "phone", บริษัท: "company" }, onDuplicate: "update",
    });
    const cos = (await P.crmCompany.findMany({ where: { systemId: S, name: coName } })) as Any[];
    const links = cos[0] ? await P.crmCompanyContact.count({ where: { companyId: cos[0].id } }) : 0;
    const upd = (await P.crmContact.findUnique({ where: { id: kImp.id } })) as Any;
    const dupRows = await P.crmContact.count({ where: { systemId: S, phone: impDupPhone, mergedIntoId: null } });
    chk("C1.11-S4.1", "import page (owner, S): 200 with the column mapping incl. the company target and the 3 onDuplicate modes (Thai labels) · one file of contacts + companies: 2 created + 1 updated (duplicate phone, mode update — still one row with that phone) · ONE company created with both new contacts linked",
      pg.status === 200 && labs.length === 4 && labs.every((l) => txt.includes(l)) && r.ok && Number(r.v?.created) === 2 && Number(r.v?.updated) === 1 && cos.length === 1 && links === 2 && !!upd && dupRows === 1,
      "one file", `page=${pDesc(pg)} labels=${labs.filter((l) => txt.includes(l)).length}/${labs.length} import=${aDesc(r)}/${cut(pj(r.v), 120)} companies=${cos.length} links=${links} dupPhoneRows=${dupRows}`);
  }
  {
    const dc = await render(owner, DUP_C_PAGE, { id: S });
    const dco = await render(owner, DUP_CO_PAGE, { id: S });
    const cAll = allOf(dc);
    const coAll = allOf(dco);
    chk("C1.11-S4.2", "duplicates pages (owner, S): contacts page lists the phone pair (both names) with a merge entry carrying both ids · companies page lists the ทะเลใส pair (both names) with a merge entry carrying both ids",
      dc.status === 200 && cAll.includes(`คุณซ้ำหนึ่ง ${rand}`) && cAll.includes(`คุณซ้ำสอง ${rand}`) && cAll.includes(kD1.id) && cAll.includes(kD2.id)
        && dco.status === 200 && coAll.includes(`ทะเลใส${rand}`) && coAll.includes(coD1) && coAll.includes(coD2),
      "pairs", `contacts=${pDesc(dc)} names=${cAll.includes(`คุณซ้ำหนึ่ง ${rand}`)}/${cAll.includes(`คุณซ้ำสอง ${rand}`)} ids=${cAll.includes(kD1.id)}/${cAll.includes(kD2.id)} companies=${pDesc(dco)} ids=${coAll.includes(coD1)}/${coAll.includes(coD2)}`);
  }
  // X9 first (refusals), then the real merges
  {
    const n1 = await act(owner, "mergeContacts", S, { keepId: kD1.id, mergeId: kD2.id, confirm: false, reason: "รวมรายการซ้ำจากหน้า", fieldChoices: { jobTitle: "merge" } });
    const n2 = await act(owner, "mergeContacts", S, { keepId: kD1.id, mergeId: kD2.id, confirm: true, reason: "สั้น", fieldChoices: { jobTitle: "merge" } });
    const d2 = (await P.crmContact.findUnique({ where: { id: kD2.id } })) as Any;
    chk("C1.11-X9.1", "merge contacts from the UI without confirm, or with a reason shorter than 5 → refused (Thai) and nothing merged",
      aRefused(n1) && aRefused(n2) && thai(n1.msg) && thai(n2.msg) && !d2?.mergedIntoId, "refused", `noConfirm=${aDesc(n1)} short=${aDesc(n2)} merged=${d2?.mergedIntoId ?? null}`);
  }
  {
    const n1 = await act(owner, "mergeCompanies", S, { keepId: coD1, mergeId: coD2, confirm: false, reason: "รวมบริษัทซ้ำจากหน้า", fieldChoices: { industry: "merge" } });
    const n2 = await act(owner, "mergeCompanies", S, { keepId: coD1, mergeId: coD2, confirm: true, reason: "สั้น", fieldChoices: { industry: "merge" } });
    const c2 = (await P.crmCompany.findUnique({ where: { id: coD2 } })) as Any;
    chk("C1.11-X9.2", "merge companies from the UI without confirm, or with a reason shorter than 5 → refused (Thai) and nothing merged",
      aRefused(n1) && aRefused(n2) && thai(n1.msg) && thai(n2.msg) && !c2?.mergedIntoId && !c2?.archivedAt, "refused", `noConfirm=${aDesc(n1)} short=${aDesc(n2)} merged=${c2?.mergedIntoId ?? null}`);
  }
  {
    // X1: thana cannot see / merge the krabi pair
    const dT = await render(thana, DUP_C_PAGE, { id: S });
    const tAll = allOf(dT);
    const mk1 = await act(thana, "mergeContacts", S, { keepId: kKD1.id, mergeId: kKD2.id, confirm: true, reason: "รวมคู่ของทีมอื่น" });
    const kd2 = (await P.crmContact.findUnique({ where: { id: kKD2.id } })) as Any;
    chk("C1.11-X1.4", "visibility on duplicates/merge: thana's duplicates page lists his phuket pair but NOT the krabi pair (names or ids) · merging the krabi pair → NOT_FOUND, nothing merged",
      dT.status === 200 && tAll.includes(`คุณซ้ำหนึ่ง ${rand}`) && !tAll.includes("ซ้ำกระบี่ลับ") && !tAll.includes(kKD1.id) && aNF(mk1) && !kd2?.mergedIntoId,
      "hidden", `page=${pDesc(dT)} own=${tAll.includes(`คุณซ้ำหนึ่ง ${rand}`)} krabi=${tAll.includes("ซ้ำกระบี่ลับ")} merge=${aDesc(mk1)}`);
  }
  {
    const m1 = await act(owner, "mergeContacts", S, { keepId: kD1.id, mergeId: kD2.id, confirm: true, reason: "รวมรายการซ้ำจากหน้า", fieldChoices: { jobTitle: "merge" } });
    const k1 = (await P.crmContact.findUnique({ where: { id: kD1.id } })) as Any;
    const k2 = (await P.crmContact.findUnique({ where: { id: kD2.id } })) as Any;
    const m2 = await act(owner, "mergeCompanies", S, { keepId: coD1, mergeId: coD2, confirm: true, reason: "รวมบริษัทซ้ำจากหน้า", fieldChoices: { industry: "merge" } });
    const c1 = (await P.crmCompany.findUnique({ where: { id: coD1 } })) as Any;
    const c2 = (await P.crmCompany.findUnique({ where: { id: coD2 } })) as Any;
    chk("C1.11-S4.3", "merge with a field-by-field choice: contacts keep kD1 but take kD2's jobTitle (fieldChoices.jobTitle = merge) and kD2 is merged into kD1 · companies keep coD1 but take coD2's industry and coD2 is merged/closed",
      m1.ok && k1?.jobTitle === "ผู้อำนวยการฝ่ายขาย" && k2?.mergedIntoId === kD1.id && m2.ok && c1?.industry === "ดำน้ำ" && (c2?.mergedIntoId === coD1 || !!c2?.archivedAt),
      "field choice honoured", `contacts=${aDesc(m1)} job=${k1?.jobTitle} merged=${k2?.mergedIntoId === kD1.id} companies=${aDesc(m2)} industry=${c1?.industry} merged=${c2?.mergedIntoId ?? c2?.archivedAt ?? null}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X6 — dangerous input on the import UI (10 MB · 50,000 rows · inline 5,000 · formula cells inert)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X6 · import input ──");
  const cntS = () => P.crmContact.count({ where: { systemId: S } }) as Promise<number>;
  {
    const before = await cntS();
    const rows = Array.from({ length: 50_001 }, (_, i) => [`x${i}`]);
    const r = await act(owner, "importContacts", S, { headers: ["ชื่อ"], rows, mapping: { ชื่อ: "firstName" }, onDuplicate: "skip" });
    let svcMsg = "";
    try { await CT.importContacts({ tenantId: T, systemId: S, actorUserId: owner.userId }, actorOf(owner), { rows: rows.map((x) => ({ ชื่อ: x[0] })), mapping: { ชื่อ: "firstName" } }); } catch (e) { svcMsg = e instanceof Error ? e.message : String(e); }
    chk("C1.11-X6.1", "50,001 rows → the UI action refuses politely (Thai, no write) and the service states the 50,000-row ceiling · 0 contacts created",
      aRefused(r) && thai(r.msg) && /50,000|50000|๕๐,๐๐๐/.test(svcMsg) && (await cntS()) === before, "refused", `action=${aDesc(r)} service=${cut(svcMsg, 90)} Δ=${(await cntS()) - before}`);
  }
  {
    const before = await cntS();
    const big = "ก".repeat(3_700_000); // ≈ 11 MB of UTF-8
    const r = await act(owner, "importContacts", S, { headers: ["ชื่อ"], rows: [[big]], mapping: { ชื่อ: "firstName" }, onDuplicate: "skip" });
    chk("C1.11-X6.2", "a file above 10 MB → refused politely (Thai message naming 10 MB), nothing written", aRefused(r) && thai(r.msg) && /10/.test(r.msg) && (await cntS()) === before,
      "refused", `${aDesc(r)} Δ=${(await cntS()) - before}`);
  }
  {
    const before = await cntS();
    const rows = Array.from({ length: 5_001 }, (_, i) => [`อินไลน์ ${rand} ${i}`, phoneOf()]);
    const r = await act(owner, "importContacts", S, { headers: ["ชื่อ", "เบอร์"], rows, mapping: { ชื่อ: "firstName", เบอร์: "phone" }, onDuplicate: "skip" });
    chk("C1.11-X6.3", "5,001 rows → the inline cap (5,000 — job mode is C2.0/C2.x) refuses politely with a Thai message naming 5,000, nothing written",
      aRefused(r) && thai(r.msg) && /5,000|5000|๕,๐๐๐/.test(r.msg) && (await cntS()) === before, "refused", `${aDesc(r)} Δ=${(await cntS()) - before}`);
  }
  {
    const f = [`=CMD${rand}`, `+CMD${rand}`, `@CMD${rand}`, `-CMD${rand}`];
    const r = await act(owner, "importContacts", S, { headers: ["ชื่อ", "เบอร์"], rows: f.map((x) => [x, phoneOf()]), mapping: { ชื่อ: "firstName", เบอร์: "phone" }, onDuplicate: "skip" });
    const rows = (await P.crmContact.findMany({ where: { systemId: S, firstName: { contains: `CMD${rand}` } } })) as Any[];
    const stored = f.every((x) => rows.some((row) => row.firstName === x || row.firstName === `'${x}`));
    const ex = await act(owner, "exportContacts", S, {}, true, "ส่งออกตรวจสูตร");
    const csv = String(ex.v?.csv ?? "");
    const occ = (hay: string, needle: string) => hay.split(needle).length - 1;
    const inert = f.every((x) => occ(csv, `'${x}`) >= 1 && occ(csv, x) === occ(csv, `'${x}`));
    chk("C1.11-X6.4", "formula cells stay inert: =CMD… +CMD… @CMD… -CMD… are stored as typed text (4 rows) and the CSV export prefixes each with ' (csvRow)",
      r.ok && rows.length === 4 && stored && ex.ok && inert, "inert", `import=${aDesc(r)} rows=${rows.length} stored=${stored} export=${aDesc(ex)} inert=${inert}`);
  }
  {
    const ui = [...walkFiles(CRM_DIR), ...walkFiles("src/components/crm")].filter((x) => x.endsWith(".tsx") && /importContactsAction/.test(read(x)));
    const ok = ui.length > 0 && ui.every((x) => { const s = read(x); return /CONTACT_IMPORT_MAX_BYTES/.test(s) && /CONTACT_IMPORT_INLINE_MAX_ROWS/.test(s); });
    chk("C1.11-X6.5", "the import UI measures size and row count BEFORE sending (references CONTACT_IMPORT_MAX_BYTES + CONTACT_IMPORT_INLINE_MAX_ROWS from contacts-shared) [static]",
      ok, "client pre-check", `files=${ui.map((x) => x.split("/").slice(-2).join("/")).join(",") || "-"}`, "MINOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X1 — chat panel / chat lead visibility · foreign ids
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X1 · scope ──");
  {
    const t = await act(thana, "chatPanel", convK);
    const n = await act(nok, "chatPanel", convK);
    const ts = pj(t.v);
    chk("C1.11-X1.1", "chat panel respects visibility: thana opening the room of a krabi contact's Party gets NOTHING of it (no name · company · deal title · contact id) · [positive control] nok (krabi lead) sees the contact and its deal",
      !ts.includes(kKName) && !ts.includes("กระบี่ลับ") && !ts.includes(kK.id) && !ts.includes(dKT) && n.ok && pj(n.v).includes(kKName) && pj(n.v).includes(dKT),
      "hidden", `thana=${aDesc(t)} leak=${ts.includes(kKName) || ts.includes(dKT)} nok=${aDesc(n)} sees=${pj(n.v).includes(kKName)}`);
  }
  {
    const before = await P.crmContact.count({ where: { tenantId: T } });
    const r = await act(thana, "chatLead", convK);
    const s = pj(r.v) + r.msg;
    chk("C1.11-X1.2", "\"create lead\" by thana in the krabi Party's room: no duplicate contact is created and the result leaks neither the krabi contact's id nor its name",
      !r.missing && (await P.crmContact.count({ where: { tenantId: T } })) === before && !s.includes(kK.id) && !s.includes(kKName), "no dup · no leak", `${aDesc(r)} Δ=${(await P.crmContact.count({ where: { tenantId: T } })) - before}`);
  }
  {
    const co = await act(chatOnly, "chatPanel", convP);
    const fo = await act(owner, "chatPanel", cB);
    const fl = await act(owner, "chatLead", cB);
    const bCount = await P.crmContact.count({ where: { tenantId: TB } });
    chk("C1.11-X1.3", "a chat user without any crm.* key gets no CRM data for kP's room · a conversation id of ANOTHER tenant → no data (refused or null) and create-lead writes nothing in either tenant",
      !co.missing && !fo.missing && !fl.missing && !pj(co.v).includes(kPName) && !pj(fo.v).includes(kBName) && !pj(fl.v).includes(kB.id) && !fl.ok && bCount === 1,
      "scoped", `chatOnly=${aDesc(co)} leak=${pj(co.v).includes(kPName)} foreign=${aDesc(fo)} leak=${pj(fo.v).includes(kBName)} lead=${aDesc(fl)} tenantB=${bCount}`);
  }
  {
    const b0 = pj(await sysSnap(SB));
    const i = await act(owner, "importContacts", SB, { headers: ["ชื่อ"], rows: [[`ข้ามร้าน ${rand}`]], mapping: { ชื่อ: "firstName" }, onDuplicate: "skip" });
    const tp = await act(owner, "applyTemplate", SB, diveKey);
    const mg = await act(owner, "mergeContacts", SB, { keepId: kB.id, mergeId: kB.id, confirm: true, reason: "ข้ามร้านทดสอบ" });
    const sw = await act(owner, "setUiVersion", SB, 1);
    chk("C1.11-X1.5", "tenant B's system id from tenant A's session: import · apply template · merge · switch → all refused (NOT_FOUND|FORBIDDEN), tenant B unchanged (uiVersion still 2)",
      aRefused(i) && aRefused(tp) && aRefused(mg) && aRefused(sw) && pj(await sysSnap(SB)) === b0 && (await crmOf(SB))?.uiVersion === 2,
      "refused", `import=${aDesc(i)} template=${aDesc(tp)} merge=${aDesc(mg)} switch=${aDesc(sw)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X3.2 — create lead from chat ×10 in parallel · X3.3 switch race keeps settings.crm intact
  // ═════════════════════════════════════════════════════════════════════════════
  {
    const out = await Promise.all(Array.from({ length: 10 }, () => act(owner, "chatLead", convN2)));
    const rows = (await P.crmContact.findMany({ where: { tenantId: T, partyId: PN2 } })) as Any[];
    const ids = new Set(out.filter((x) => x.ok).map((x) => String(x.v?.contactId)));
    chk("C1.11-X3.2", "createLeadFromChatAction ×10 in parallel for one new Party → exactly ONE contact · every call answers with that id · exactly one says created:true",
      rows.length === 1 && out.every((x) => x.ok) && ids.size === 1 && ids.has(rows[0]?.id) && out.filter((x) => x.v?.created === true).length === 1,
      "one", `rows=${rows.length} ok=${out.filter((x) => x.ok).length} ids=${ids.size} created=${out.filter((x) => x.v?.created === true).length}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S6 — the switch (C23): OWNER-only · Thai · both ways · rows kept · pages/actions/ops/bridges follow it
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S6 · the switch ──");
  {
    const o = await render(ownerW, SETTINGS_PAGE, { id: SW });
    const m = await render(mgrW, SETTINGS_PAGE, { id: SW });
    const s = await render(staffW, SETTINGS_PAGE, { id: SW });
    const f = await render(ownerW, SETTINGS_PAGE, { id: SB });
    const txt = allOf(o);
    chk("C1.11-S6.1", "switch page at uiVersion 1: OWNER → 200 with a Thai explanation, \"switch back any time\" wording and crm-uiversion-toggle · MANAGER (with crm.settings.manage) → 404 · STAFF → 404 · another tenant's system → 404",
      o.status === 200 && thai(o.text) && /สลับกลับ|กลับไปใช้|เปลี่ยนกลับ/.test(txt) && hasTid(o, "crm-uiversion-toggle") && m.status === 404 && s.status === 404 && f.status === 404,
      "owner only", `owner=${pDesc(o)} back=${/สลับกลับ|กลับไปใช้|เปลี่ยนกลับ/.test(txt)} toggle=${hasTid(o, "crm-uiversion-toggle")} mgr=${pDesc(m)} staff=${pDesc(s)} foreign=${pDesc(f)}`);
  }
  {
    const s0 = pj(await crmOf(SW));
    const m = await act(mgrW, "setUiVersion", SW, 2);
    const st = await act(staffW, "setUiVersion", SW, 2);
    const bad = await act(ownerW, "setUiVersion", SW, 3);
    const fr = await act(ownerW, "setUiVersion", SV, 2);
    chk("C1.11-S6.2", "the switch action refuses MANAGER and STAFF (FORBIDDEN|NOT_FOUND), a value other than 1|2 (VALIDATION) and another tenant's system (NOT_FOUND|FORBIDDEN) — settings.crm of SW and of the foreign SV unchanged",
      aRefused(m) && aRefused(st) && aVal(bad) && aRefused(fr) && pj(await crmOf(SW)) === s0 && (await crmOf(SV))?.uiVersion === 1,
      "refused", `mgr=${aDesc(m)} staff=${aDesc(st)} value3=${aDesc(bad)} foreign=${aDesc(fr)}`);
  }
  // data made while at 1 (v1 action) · bridges + ops + v2 action at 1
  const v1Name = `คุณสร้างจากวีหนึ่ง ${rand}`;
  const v1c = await run(ownerW, V1_MOD.createContactAction, "createContactAction(v1)", fd({ systemId: SW, name: v1Name, phone: phoneOf() }));
  const coAt1 = await act(ownerW, "createCompany", SW, { name: `บริษัทก่อนเปิด ${rand}` });
  const bridge = async (conv: string) => (typeof BR.onChatMessage === "function" ? BR.onChatMessage({ id: `${TAG}-ev-${randomBytes(3).toString("hex")}`, tenantId: TW, type: "chat.message.received", payload: { conversationId: conv, channel: "LINE" }, systemId: null, unitId: null }).then(() => true, () => false) : false);
  const leadOf = (party: string) => P.crmContact.count({ where: { tenantId: TW, partyId: party } }) as Promise<number>;
  // REST op probe (C1.10 route) with a key bound to SW
  let keyW = "";
  try {
    const k = await AK.createApiKey({ tenantId: TW }, `${TAG} switch`, { scopes: ["crm.contact.read"], systemId: SW, createdById: ownerW.userId });
    KEY_IDS.push(k.id);
    keyW = String(k.rawKey ?? "");
  } catch { keyW = ""; }
  const op = async (): Promise<{ status: number; code: string }> => {
    const fn = ROUTE?.GET;
    if (typeof fn !== "function" || !keyW) return { status: 0, code: ROUTE ? "NO_KEY" : "NO_ROUTE" };
    try {
      const res: Response = await fn(new Request("http://qc.invalid/api/v1/crm/contacts?take=1", { method: "GET", headers: { authorization: `Bearer ${keyW}` } }), { params: Promise.resolve({ path: ["contacts"] }) });
      let body: Any = null;
      try { body = await res.json(); } catch { body = null; }
      return { status: res.status, code: String(body?.error?.code ?? "").toLowerCase() };
    } catch (e) { return { status: -1, code: cut(e instanceof Error ? e.message : String(e), 60) }; }
  };
  const op1a = await op();
  const b1 = await bridge(cw1.conv);
  const lead1 = await leadOf(cw1.party);
  // 1 → 2
  const up = await act(ownerW, "setUiVersion", SW, 2);
  const crm2 = await crmOf(SW);
  const aud = ((await P.auditLog.findMany({ where: { tenantId: TW, action: { startsWith: "crm.settings" } } })) as Any[]).filter((a) => /uiVersion/.test(pj([a.before, a.after, a.meta])));
  {
    chk("C1.11-S6.3", "OWNER flips 1 → 2: { ok } · settings.crm.uiVersion = 2 written in place (chatToLead set earlier survives) · an audit row crm.settings.* mentioning uiVersion · the v1 action worked while at 1 and the v2 action was refused at 1",
      v1c.ok && coAt1.code === "FORBIDDEN" && up.ok && crm2?.uiVersion === 2 && crm2?.chatToLead === true && aud.length >= 1,
      "flipped", `v1create=${aDesc(v1c)} v2At1=${aDesc(coAt1)} flip=${aDesc(up)} settings=${pj(crm2)} audit=${aud.length}`);
  }
  const cp2 = await render(ownerW, CONTACTS_PAGE, { id: SW });
  const coAt2 = await act(ownerW, "createCompany", SW, { name: `บริษัทวีสอง ${rand}` });
  const coList2 = await render(ownerW, COMPANIES_PAGE, { id: SW });
  const op2 = await op();
  const b2 = await bridge(cw2.conv);
  const lead2 = await leadOf(cw2.party);
  const lead2Name = ((await P.crmContact.findFirst({ where: { tenantId: TW, partyId: cw2.party } })) as Any)?.name ?? "§none§";
  {
    chk("C1.11-S6.4", "at 2: the contacts page renders v2 (no CrmContactsSection) and lists the contact the v1 action created · /crm/companies → 200 · the v2 action createCompanyAction works",
      cp2.status === 200 && !hasEl(cp2, "CrmContactsSection") && allOf(cp2).includes(v1Name) && coAt2.ok && coList2.status === 200 && allOf(coList2).includes(`บริษัทวีสอง ${rand}`),
      "v2", `contacts=${pDesc(cp2)} v1Section=${hasEl(cp2, "CrmContactsSection")} lists=${allOf(cp2).includes(v1Name)} company=${aDesc(coAt2)} list=${pDesc(coList2)}`);
  }
  const snapW = async () => pj({
    contacts: await P.crmContact.count({ where: { systemId: SW } }), companies: await P.crmCompany.count({ where: { systemId: SW } }),
    deals: await P.crmDeal.count({ where: { systemId: SW } }), pipes: await P.crmPipeline.count({ where: { systemId: SW } }),
    acts: await P.crmActivity.count({ where: { systemId: SW } }), chatToLead: (await crmOf(SW))?.chatToLead,
  });
  const atTwo = await snapW();
  // 2 → 1
  const down = await act(ownerW, "setUiVersion", SW, 1);
  const cp1 = await render(ownerW, CONTACTS_PAGE, { id: SW });
  const coList1 = await render(ownerW, COMPANIES_PAGE, { id: SW });
  const coAt1b = await act(ownerW, "createCompany", SW, { name: `บริษัทหลังปิด ${rand}` });
  const op1b = await op();
  const b3 = await bridge(cw3.conv);
  const lead3a = await leadOf(cw3.party);
  const atOne = await snapW();
  {
    chk("C1.11-S6.5", "OWNER flips 2 → 1: the contacts page is v1 again (CrmContactsSection) and lists the contact the v2 bridge created while at 2 · /crm/companies → 404 · the v2 action is FORBIDDEN again · NOTHING deleted (contacts · companies · deals · pipelines · activities · settings keys identical to the moment before the flip)",
      down.ok && (await crmOf(SW))?.uiVersion === 1 && cp1.status === 200 && hasEl(cp1, "CrmContactsSection") && allOf(cp1).includes(lead2Name) && coList1.status === 404 && coAt1b.code === "FORBIDDEN" && atOne === atTwo,
      "rows kept", `flip=${aDesc(down)} contacts=${pDesc(cp1)} v1Section=${hasEl(cp1, "CrmContactsSection")} lists=${allOf(cp1).includes(lead2Name)} companies=${pDesc(coList1)} v2action=${aDesc(coAt1b)} same=${atOne === atTwo}`);
  }
  // 1 → 2 again: resumes
  const up2 = await act(ownerW, "setUiVersion", SW, 2);
  const coList3 = await render(ownerW, COMPANIES_PAGE, { id: SW });
  const setPg2 = await render(ownerW, SETTINGS_PAGE, { id: SW });
  const b4 = await bridge(cw3.conv);
  const lead3b = await leadOf(cw3.party);
  {
    chk("C1.11-S6.6", "1 → 2 again: v2 resumes with the data intact — the company created at 2 is listed again · the switch page still opens (with the way back) at 2",
      up2.ok && coList3.status === 200 && allOf(coList3).includes(`บริษัทวีสอง ${rand}`) && setPg2.status === 200 && hasTid(setPg2, "crm-uiversion-toggle") && /สลับกลับ|กลับไปใช้|เปลี่ยนกลับ/.test(allOf(setPg2)),
      "resumed", `flip=${aDesc(up2)} companies=${pDesc(coList3)} listed=${allOf(coList3).includes(`บริษัทวีสอง ${rand}`)} switchPage=${pDesc(setPg2)}`);
  }
  {
    chk("C1.11-S6.7", "REST ops follow the switch (C1.10 route, key bound to SW): GET /contacts → 409 crm_v2_disabled at 1 · 200 at 2 · 409 again after switching back",
      op1a.status === 409 && op1a.code === "crm_v2_disabled" && op2.status === 200 && op1b.status === 409 && op1b.code === "crm_v2_disabled",
      "409 · 200 · 409", `at1=${op1a.status}/${op1a.code} at2=${op2.status}/${op2.code} back=${op1b.status}/${op1b.code}`);
  }
  {
    chk("C1.11-S6.8", "bridges follow the switch (chatToLead on): chat message at 1 → no lead · at 2 → ONE lead · back at 1 → no lead · the SAME event replayed after switching to 2 again → its lead appears (resume)",
      b1 && b2 && b3 && b4 && lead1 === 0 && lead2 === 1 && lead3a === 0 && lead3b === 1, "skip · run · skip · resume", `ran=${b1}/${b2}/${b3}/${b4} leads=${lead1}/${lead2}/${lead3a}/${lead3b}`);
  }
  {
    await act(ownerW, "setUiVersion", SW, 1);
    const hubO = await render(ownerW, SYS_PAGE, { id: SW });
    const hubM = await render(mgrW, SYS_PAGE, { id: SW });
    const toSwitch = (r: PR) => hrefs(r).some((h) => h.endsWith(`/crm${SWITCH_PATH}`) || h.includes(`/crm${SWITCH_PATH}?`));
    const lay = read(LAYOUT);
    const crmCase = /case "CRM":\s*return \[([\s\S]*?)\n\s{8}\];/.exec(lay)?.[1] ?? "";
    const drawer = crmCase.includes(`/crm${SWITCH_PATH}`) && /OWNER/.test(crmCase);
    await act(ownerW, "setUiVersion", SW, 2);
    const home2 = await render(ownerW, SYS_PAGE, { id: SW });
    chk("C1.11-S6.9", "entry points: at 1 the module entry is the v1 CrmHub (no crm-home) and the OWNER can reach the switch page (hub link, not shown to MANAGER — or an OWNER-gated drawer entry) · at 2 the module entry is the v2 home (crm-home)",
      hubO.status === 200 && hasEl(hubO, "CrmHub") && !hasTid(hubO, "crm-home") && ((toSwitch(hubO) && !toSwitch(hubM)) || drawer) && home2.status === 200 && hasTid(home2, "crm-home"),
      "v1 hub · v2 home", `hub=${pDesc(hubO)} crmHub=${hasEl(hubO, "CrmHub")} ownerLink=${toSwitch(hubO)} mgrLink=${toSwitch(hubM)} drawer=${drawer} home2=${pDesc(home2)}/${hasTid(home2, "crm-home")}`, "MAJOR");
  }
  {
    const DUAL = new Set([`${CRM_DIR}/contacts/page.tsx`, `${CRM_DIR}/deals/page.tsx`, `${CRM_DIR}/activities/page.tsx`, SETTINGS_PAGE]);
    const pagesBad = walkFiles(CRM_DIR).filter((f) => f.endsWith("/page.tsx") && !DUAL.has(f) && !/await\s+requireCrmV2Page\s*\(/.test(stripComments(read(f))));
    const switchFn = actFn("setUiVersion");
    const actBad = ACTION_FILES.filter((f) => { const s = stripComments(read(f)); return !/assertCrmV2|crmUiVersion|requireCrmV2Page|crmGates?\(|bridgeOpen|openCrmSystems/.test(s); })
      .filter((f) => !(switchFn && /(setCrmUiVersionAction|setUiVersionAction)/.test(read(f)) && (read(f).match(/export\s+async\s+function/g) ?? []).length === 1));
    const brSrc = walkFiles(BR_DIR).map((f) => ({ f, s: stripComments(read(f)) }));
    const brBad: string[] = [];
    for (const { f, s } of brSrc) {
      const parts = s.split(/(?=export\s+async\s+function\s+on[A-Z])/).filter((p) => /^export\s+async\s+function\s+on[A-Z]/.test(p));
      for (const p of parts) if (!/crmGates?\(|bridgeOpen|openCrmSystems|uiVersion/.test(p)) brBad.push(`${f.split("/").pop()}:${/function\s+(\w+)/.exec(p)?.[1]}`);
    }
    const jobBad: string[] = [];
    for (const f of walkFiles("src/lib")) {
      const s = read(f);
      for (const m of s.matchAll(/registerMinuteJob\(\s*\{\s*name:\s*["'](crm\.[^"']+)["']/g)) if (m[1] !== "crm.heartbeat" && !/uiVersion|crmUiVersion|crmGates?\(|bridgeOpen|openCrmSystems/.test(s)) jobBad.push(`${m[1]}@${f}`);
    }
    chk("C1.11-S6.10", "PERMANENT RULE, whole surface [static]: every crm page.tsx except the 3 dual pages + the switch page calls requireCrmV2Page · every \"use server\" CRM/chat-CRM file except crm/actions.ts (v1) and a switch-only file reads the gate · every crm-bridges on* handler reads the gate · every registered crm.* minute job except crm.heartbeat reads it",
      !!SETTINGS_PAGE && pagesBad.length === 0 && actBad.length === 0 && brSrc.length >= 3 && brBad.length === 0 && jobBad.length === 0, "all gated",
      `pages=${pagesBad.map((f) => f.replace(CRM_DIR, "crm")).join(",") || "-"} actions=${actBad.join(",") || "-"} bridges=${brBad.join(",") || "-"} jobs=${jobBad.join(",") || "-"}`, "MAJOR");
  }
  {
    // X3.3: 10 parallel switches racing a settings write — the jsonb_set writer keeps settings.crm whole
    const before = await crmOf(SW);
    await Promise.all([
      ...Array.from({ length: 10 }, (_, i) => act(ownerW, "setUiVersion", SW, (i % 2) + 1)),
      ...(typeof ST.setCrmSettingsKey === "function" ? [ST.setCrmSettingsKey({ tenantId: TW, systemId: SW }, "bridgesEnabled", true).catch(() => null)] : []),
    ]);
    const after = await crmOf(SW);
    await act(ownerW, "setUiVersion", SW, 2);
    chk("C1.11-X3.3", "10 parallel switch calls racing a parallel settings write: settings.crm stays one valid object — uiVersion ∈ {1,2}, chatToLead still true, bridgesEnabled true, no other key lost",
      [1, 2].includes(after?.uiVersion) && after?.chatToLead === true && after?.bridgesEnabled === true && Object.keys(before ?? {}).every((k) => k in (after ?? {})),
      "intact", `before=${pj(before)} after=${pj(after)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S7 — uiVersion 1 (PERMANENT RULE) on every C1.11 surface, tenant TV — + a positive control
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S7 · uiVersion 1 ──");
  {
    const a = await render(ownerV, IMPORT_PAGE, { id: SV });
    const b = await render(ownerV, DUP_C_PAGE, { id: SV });
    const c = await render(ownerV, DUP_CO_PAGE, { id: SV });
    const s = await render(ownerV, SETTINGS_PAGE, { id: SV });
    chk("C1.11-S7.1", "a v1 CRM (TV): import · contacts duplicates · companies duplicates → 404 for its OWNER (a real duplicate pair exists) · the switch page is the one C1.11 page that opens (200)",
      [a, b, c].every((r) => r.status === 404) && s.status === 200, "3× 404 + switch 200", [a, b, c, s].map(pDesc).join(" "));
  }
  {
    const snapV = async () => pj([await sysSnap(SV), await P.crmContact.findMany({ where: { tenantId: TV }, orderBy: { id: "asc" }, select: { id: true, mergedIntoId: true, name: true } })]);
    const v0 = await snapV();
    const rs: [string, AR][] = [
      ["applyTemplate", await act(ownerV, "applyTemplate", SV, diveKey)],
      ["importContacts", await act(ownerV, "importContacts", SV, { headers: ["ชื่อ"], rows: [[`วีนำเข้า ${rand}`]], mapping: { ชื่อ: "firstName" }, onDuplicate: "skip" })],
      ["mergeContacts", await act(ownerV, "mergeContacts", SV, { keepId: kVD1.id, mergeId: kVD2.id, confirm: true, reason: "รวมในร้านวีหนึ่ง", fieldChoices: {} })],
    ];
    const bad = rs.filter(([, r]) => !aForb(r) || !thai(r.msg));
    chk("C1.11-S7.2", "C1.11 actions on the v1 CRM (template · import · merge) → FORBIDDEN (CrmV2DisabledError, Thai) and TV's data byte-equal",
      bad.length === 0 && (await snapV()) === v0, "3× FORBIDDEN · no write", `bad=${bad.map(([n, r]) => `${n}=${aDesc(r)}`).join(" ") || "-"} changed=${(await snapV()) !== v0}`);
  }
  {
    const before = await P.crmContact.count({ where: { tenantId: TV } });
    const p = await act(ownerV, "chatPanel", convV);
    const l = await act(ownerV, "chatLead", convVN);
    const a = await act(ownerV, "chatActivity", convV, { type: "NOTE", title: `วีหนึ่งโน้ต ${rand}` });
    chk("C1.11-S7.3", "chat panel on a shop whose (first) CRM is uiVersion 1: no CRM data even for a Party WITH a contact (data null) · create lead and log activity refused (Thai) · 0 contacts, 0 activities written",
      !pj(p.v).includes(`คุณวีหนึ่ง ${rand}`) && (p.v?.data ?? null) === null && aRefused(l) && aRefused(a) && (await P.crmContact.count({ where: { tenantId: TV } })) === before && (await P.crmActivity.count({ where: { tenantId: TV } })) === 0,
      "nothing", `panel=${aDesc(p)}/${cut(pj(p.v?.data ?? null), 60)} lead=${aDesc(l)} activity=${aDesc(a)}`);
  }
  {
    const pv = await render(ownerV, PARTY_PAGE, { partyId: kV.partyId });
    const hv = await render(ownerV, SYS_PAGE, { id: SV });
    chk("C1.11-S7.4", "party page of a v1 shop has no party-crm block (and no v1 contact data added) · the v1 module entry has no crm-home and no template picker",
      pv.status === 200 && !hasTid(pv, "party-crm") && hv.status === 200 && !hasTid(hv, "crm-home") && !hasTid(hv, "crm-template-picker"),
      "unchanged", `party=${pDesc(pv)} block=${hasTid(pv, "party-crm")} hub=${pDesc(hv)} home=${hasTid(hv, "crm-home")} picker=${hasTid(hv, "crm-template-picker")}`);
  }
  {
    await setCrm(SV, { uiVersion: 2 });
    let ip: PR = { status: 0, text: "", els: [], err: "" };
    let pn: AR = { ok: false, code: "", msg: "", v: null, thrown: false, missing: true };
    let pv: PR = { status: 0, text: "", els: [], err: "" };
    try {
      ip = await render(ownerV, IMPORT_PAGE, { id: SV });
      pn = await act(ownerV, "chatPanel", convV);
      pv = await render(ownerV, PARTY_PAGE, { partyId: kV.partyId });
    } finally {
      await setCrm(SV, { uiVersion: 1 });
    }
    chk("C1.11-S7.5", "[positive control for S7.1/S7.3/S7.4] the same TV flipped to 2 → import page 200 · chat panel shows the contact · party page shows party-crm — so the v1 results above are the gate, not broken code (flag restored to 1)",
      ip.status === 200 && pj(pn.v).includes(`คุณวีหนึ่ง ${rand}`) && hasTid(pv, "party-crm"), "works at 2", `import=${pDesc(ip)} panel=${aDesc(pn)} party=${hasTid(pv, "party-crm")}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S8 — debts: v2 home visibility (R-A) · /app/party CRM block (R-A) · clinic rows (crm-C1.1)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S8 · debts ──");
  {
    const t = await render(thana, SYS_PAGE, { id: S });
    const n = await render(nok, SYS_PAGE, { id: S });
    const ta = allOf(t);
    const na = allOf(n);
    chk("C1.11-S8.1", "R-A minimal v2 home: thana's \"my tasks\" (crm-home-my-tasks) lists his pending task, his deals are his only — nok's task/deal/contact never appear · nok's home shows nok's task + deal and none of thana's",
      t.status === 200 && hasTid(t, "crm-home-my-tasks") && ta.includes(aPT) && ta.includes(dP1T) && !ta.includes(aKT) && !ta.includes(dKT) && !ta.includes(kKName)
        && n.status === 200 && na.includes(aKT) && na.includes(dKT) && !na.includes(aPT) && !na.includes(dP1T),
      "own only", `thana=${pDesc(t)} tasks=${hasTid(t, "crm-home-my-tasks")} own=${ta.includes(aPT)}/${ta.includes(dP1T)} leak=${ta.includes(aKT) || ta.includes(dKT)} nok=${pDesc(n)} own=${na.includes(aKT)}/${na.includes(dKT)}`);
  }
  {
    const o = await render(owner, PARTY_PAGE, { partyId: kP.partyId });
    const tk = await render(thana, PARTY_PAGE, { partyId: kK.partyId });
    const tp = await render(thana, PARTY_PAGE, { partyId: kP.partyId });
    const blk = (r: PR) => { const e = r.els.find((x) => String(x.props?.["data-testid"] ?? "") === "party-crm"); return e ? pj(e.props) : ""; };
    chk("C1.11-S8.2", "R-A CRM block on /app/party/[partyId]: owner sees party-crm with kP · its company · its OPEN deals (not the WON one) · thana sees it for his phuket Party · for the krabi Party thana gets no krabi contact/company/deal anywhere on the page",
      o.status === 200 && blk(o).includes(kPName) && blk(o).includes(coPName) && blk(o).includes(dP1T) && !blk(o).includes(dPwT) && tp.status === 200 && blk(tp).includes(kPName)
        && tk.status === 200 && !allOf(tk).includes(dKT) && !allOf(tk).includes("บริษัทกระบี่ลับ") && !blk(tk).includes(kK.id),
      "block", `owner=${pDesc(o)} name=${blk(o).includes(kPName)} co=${blk(o).includes(coPName)} deal=${blk(o).includes(dP1T)} won=${blk(o).includes(dPwT)} thanaP=${blk(tp).includes(kPName)} thanaK=${pDesc(tk)} leak=${allOf(tk).includes(dKT)}`);
  }
  {
    const pg = await render(thana, PARTY_PAGE, { partyId: kP.partyId });
    const pn = await act(thana, "chatPanel", convP);
    const rows = await P.clinicVisit.count({ where: { tenantId: T, partyId: kP.partyId } });
    chk("C1.11-S8.3", "debt crm-C1.1 (health data): a clinic visit on the SAME Party as kP never reaches the CRM surfaces — thana (crm keys, no clinic rights) sees neither its symptom on the party page (whose party-crm block IS rendered) nor in the chat panel (which DOES show kP) · [control] the visit row exists on that Party",
      rows === 1 && pg.status === 200 && hasTid(pg, "party-crm") && pn.ok && pj(pn.v).includes(kPName) && !allOf(pg).includes(SYMPTOM) && !pj(pn.v).includes(SYMPTOM) && !allOf(pg).includes("ปวดหัวเรื้อรัง"),
      "no clinic data", `visit=${rows} party=${pDesc(pg)} block=${hasTid(pg, "party-crm")} panel=${aDesc(pn)} pageLeak=${allOf(pg).includes(SYMPTOM)} panelLeak=${pj(pn.v).includes(SYMPTOM)}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X8 · X9.3 · X9.4
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X8 · X9 ──");
  {
    const p = await act(owner, "chatPanel", convN);
    const s = pj(p.v);
    const evs = (await P.outboxEvent.findMany({ where: { tenantId: { in: TIDS } } })) as Any[];
    const pii = [kP.phone, kPEmail, phN, emN, `ลูกค้าใหม่แชท ${rand}`, kPName];
    const dirty = evs.filter((e) => /^(crm\.|custom\.record\.)/.test(e.type) && pii.some((x) => pj(e.payload).includes(x)));
    const hasLeadEvt = evs.some((e) => e.type === "crm.contact.created" && pj(e.payload).includes(leadN));
    chk("C1.11-X8.1", "PDPA: the panel result for the new lead's room has no phone/e-mail · no crm.* outbox payload of our tenants carries a phone, e-mail or full name · [control] the chat lead's crm.contact.created exists",
      p.ok && !s.includes(phN) && !s.includes(emN) && dirty.length === 0 && hasLeadEvt, "ids only", `panel=${aDesc(p)} phone=${s.includes(phN)} email=${s.includes(emN)} dirty=${dirty.map((e) => e.type).join(",") || "-"} control=${hasLeadEvt}`);
  }
  {
    const ui = [...walkFiles(CRM_DIR), ...walkFiles("src/components/crm")].filter((x) => x.endsWith(".tsx") && /merge(Contacts|Companies)Action/.test(read(x)));
    const bad = ui.filter((x) => { const s = read(x); return !/fieldChoices/.test(s) || !/confirm:\s*true/.test(s) || !/\breason\b/.test(s) || !/data-testid=["'`{][^"'`]*merge[^"'`]*reason|data-testid=["'`{][^"'`]*reason[^"'`]*merge/.test(s); });
    chk("C1.11-X9.3", "merge UI (contacts AND companies): the component that calls the merge action sends fieldChoices + confirm: true + reason and renders a reason input whose testid names merge + reason [static]",
      ui.some((x) => /mergeContactsAction/.test(read(x))) && ui.some((x) => /mergeCompaniesAction/.test(read(x))) && bad.length === 0, "confirm + reason + choices",
      `files=${ui.map((x) => x.split("/").slice(-2).join("/")).join(",") || "-"} bad=${bad.map((x) => x.split("/").pop()).join(",") || "-"}`, "MAJOR");
  }
  {
    const need: [string, Record<string, Any>][] = [
      ["contact merge", { tenantId: T, action: "crm.contact.merge", targetId: kD1.id }],
      ["company merge", { tenantId: T, action: { startsWith: "crm.company.merge" } }],
      ["import", { tenantId: T, action: "crm.contact.import" }],
      ["template apply", { tenantId: T, action: { startsWith: "crm.template" } }],
      ["switch", { tenantId: TW, action: { startsWith: "crm.settings" } }],
      ["chat lead", { tenantId: T, action: "crm.contact.create", targetId: leadN || "§" }],
      ["chat activity", { tenantId: T, action: { startsWith: "crm.activity" }, ...(chatActId ? { targetId: chatActId } : {}) }],
    ];
    const missing: string[] = [];
    for (const [label, where] of need) if ((await P.auditLog.count({ where })) === 0) missing.push(label);
    chk("C1.11-X9.4", "every C1.11 mutation leaves an audit row: contact merge · company merge · import · template apply · switch · chat lead · chat activity",
      missing.length === 0, "7 kinds", `missing=${missing.join(",") || "-"}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S9 — testids · inventory · client safety · nav [static]
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S9 · static ──");
  {
    const miss = NEW_TSX.flatMap((f) => tagsWithoutTestid(read(f)).map((t) => `${f.split("/").slice(-2).join("/")}: ${t}`));
    chk("C1.11-S9.1", "every button/input/select/textarea/link/form in the files NEW in C1.11 (pages · CRM components · the chat CRM panel) has a data-testid [static]",
      NEW_TSX.length >= 5 && miss.length === 0, "all tagged", `files=${NEW_TSX.length} untagged=${miss.length} ${miss.slice(0, 3).join(" ; ")}`, "MAJOR");
  }
  {
    const inv = JSON.parse(read("scripts/crm-ui-inventory.json") || "{}") as Any;
    const rows = ((inv?.rows ?? []) as Any[]).filter((r) => r?.wo === "C1.11");
    const src = NEW_FILES.map(read).join("\n") + read(CHAT_PANEL) + read(SYS_PAGE) + read(PARTY_PAGE) + read(CTX_PANEL);
    const ghost = rows.filter((r) => { const t = String(r?.testid ?? " "); return !src.includes(t.endsWith("*") ? t.slice(0, -1) : t); }).map((r) => r?.testid);
    const by = (re: RegExp) => rows.filter((r) => re.test(String(r?.page ?? ""))).length;
    const panelRows = rows.filter((r) => /^crm-panel-/.test(String(r?.testid ?? ""))).length;
    const toggle = rows.some((r) => r?.testid === "crm-uiversion-toggle");
    chk("C1.11-S9.2", "D8 inventory: rows (wo C1.11) for /contacts/import (≥ 3) · /contacts/duplicates (≥ 1) · /companies/duplicates (≥ 1) · the 3 chat panel buttons · the switch toggle — every testid present in the sources (no ghost row) [static]",
      by(/\/contacts\/import/) >= 3 && by(/\/contacts\/duplicates/) >= 1 && by(/\/companies\/duplicates/) >= 1 && panelRows >= 3 && toggle && ghost.length === 0,
      "rows", `import=${by(/\/contacts\/import/)} dupC=${by(/\/contacts\/duplicates/)} dupCo=${by(/\/companies\/duplicates/)} panel=${panelRows} toggle=${toggle} ghost=${ghost.slice(0, 4).join(",") || "-"}`, "MINOR");
  }
  {
    const client = [...NEW_FILES, ...(CHAT_PANEL ? [CHAT_PANEL] : [])].filter((f) => f.endsWith(".tsx") && isUseClient(f));
    const bad = client.map((f) => reachesPrisma(f)).filter(Boolean);
    const tplImpure = tplFiles.filter((f) => /@\/lib\/core\/db|@prisma\/client|from\s+["']next\//.test(read(f)));
    const ctlBad = reachesPrisma("src/lib/modules/crm/contacts.ts");
    chk("C1.11-S9.3", "'use client' files new in C1.11 (+ the chat panel) never reach prisma through value imports · the 16 template data files are pure (no prisma/next import) — [resolver control] contacts.ts does reach prisma [static]",
      client.length >= 2 && bad.length === 0 && tplFiles.length >= 16 && tplImpure.length === 0 && !!ctlBad, "client-safe", `client=${client.length} bad=${bad.slice(0, 2).join(" ; ") || "-"} tplImpure=${tplImpure.join(",") || "-"}`, "MAJOR");
  }
  {
    const nav = read(NAV_FILE);
    const ready = (p: string) => new RegExp(`["']${p.replace(/\//g, "\\/")}["'][^}]*status:\\s*["']ready["']`).test(nav);
    const paths = ["/crm/contacts/import", "/crm/contacts/duplicates", "/crm/companies/duplicates"];
    const lay = read(LAYOUT);
    const crmCase = /case "CRM":\s*return \[([\s\S]*?)\n\s{8}\];/.exec(lay)?.[1] ?? "";
    const [before, after] = [crmCase.split("...(crmV2.has(slugOrId)")[0] ?? "", crmCase.split("...(crmV2.has(slugOrId)")[1] ?? ""];
    chk("C1.11-S9.4", "nav: CRM_DEEP_NAV lists /crm/contacts/import · /crm/contacts/duplicates · /crm/companies/duplicates as \"ready\" and the drawer lists them only after the crmV2 gate (qc-nav-functions + probe-uiversion-gate V2.3 stay green) [static]",
      paths.every(ready) && paths.every((p) => after.includes(p) && !before.includes(p)), "registered", `ready=${paths.map(ready).join("/")} drawer=${paths.map((p) => after.includes(p)).join("/")} beforeGate=${paths.some((p) => before.includes(p))}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 — scripts/qc-crm-v1.mts (BUILDER's file): static · run · cross-visibility (CRM-RUN S5 · 3)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S5 · qc-crm-v1 ──");
  {
    const s = read(V1_ORACLE);
    const need = ["// requires: crm-seed", "JSON_SUMMARY", "createContactAction", "createDealAction", "moveDealAction", "addActivityAction", "completeActivityAction", "issueQuotationAction", "uiVersion", "CrmHub"];
    const pages = [/ContactsV1Page|CrmContactsSection/, /DealsV1Page|CrmDealsSection/, /ActivitiesV1Page|CrmActivitiesSection/];
    const miss = need.filter((x) => !s.includes(x));
    chk("C1.11-S5.1", "scripts/qc-crm-v1.mts exists with the house shape: `// requires: crm-seed` · JSON_SUMMARY · the three v1 pages (ContactsV1Page/DealsV1Page/ActivitiesV1Page or their sections) + CrmHub · the six v1 actions by name · uiVersion 1 [static]",
      s.length > 0 && miss.length === 0 && pages.every((re) => re.test(s)), "shape", `exists=${s.length > 0} missing=${miss.join(",") || "-"} pages=${pages.map((re) => re.test(s)).join("/")}`, "MAJOR");
  }
  {
    // cross-visibility on the permanent v1 shop: a v2-SERVICE contact shows on the v1 page; a v1-ACTION contact shows in the v2 service
    const svcName = `คุณจากบริการวีสอง ${rand}`;
    let svcOk = false;
    try { await CT.createContact({ tenantId: TV, systemId: SV, actorUserId: ownerV.userId }, actorOf(ownerV), { firstName: svcName, phone: phoneOf() }); svcOk = true; } catch { svcOk = false; }
    const v1Name2 = `คุณจากฟอร์มวีหนึ่ง ${rand}`;
    const v1r = await run(ownerV, V1_MOD.createContactAction, "createContactAction(v1)", fd({ systemId: SV, name: v1Name2, phone: phoneOf() }));
    const page = await render(ownerV, CONTACTS_PAGE, { id: SV });
    let listed = false;
    try { const l = await CT.listContacts({ tenantId: TV, systemId: SV, actorUserId: ownerV.userId }, actorOf(ownerV), { q: v1Name2 }); listed = pj(l).includes(v1Name2); } catch { listed = false; }
    chk("C1.11-S5.3", "data crosses both ways on a uiVersion-1 shop: a contact created through the v2 contacts service is listed by the v1 contacts page (CrmContactsSection) · a contact created by the v1 createContactAction is found by the v2 listContacts",
      svcOk && page.status === 200 && hasEl(page, "CrmContactsSection") && allOf(page).includes(svcName) && v1r.ok && listed, "both ways",
      `svc=${svcOk} page=${pDesc(page)} v1Section=${hasEl(page, "CrmContactsSection")} shows=${allOf(page).includes(svcName)} v1action=${aDesc(v1r)} v2list=${listed}`);
  }
  {
    let res = { code: -2 as number | null, out: "" };
    if (existsSync(V1_ORACLE)) {
      res = await new Promise<{ code: number | null; out: string }>((done) => {
        const ch = spawn("pnpm", ["exec", "tsx", V1_ORACLE], { env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=1536" }, stdio: ["ignore", "pipe", "pipe"] });
        let out = "";
        ch.stdout.on("data", (d) => { out += String(d); });
        ch.stderr.on("data", (d) => { out += String(d); });
        ch.on("close", (code) => done({ code, out }));
        ch.on("error", (e) => done({ code: -1, out: String(e) }));
      });
    }
    const line = res.out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY ")) ?? "";
    let sum: Any = null;
    try { sum = JSON.parse(line.slice("JSON_SUMMARY ".length)); } catch { sum = null; }
    chk("C1.11-S5.2", "running scripts/qc-crm-v1.mts (child process, same gate lock) → exit 0 · JSON_SUMMARY not skipped · total ≥ 12 · passed = total",
      res.code === 0 && !!sum && sum.skipped !== true && Number(sum.total) >= 12 && sum.passed === sum.total, "green", `exit=${res.code} summary=${line ? cut(line, 200) : cut(res.out.slice(-200), 200)}`);
  }
} catch (e) {
  chk("C1.11-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — every row of the four throwaway tenants (4 passes over every table with tenantId), systems/units/tenants, sessions, users,
  // rate buckets of our API keys. No drainOutbox (not tenant-scoped) — our PENDING events go with the tenant sweep.
  // ═════════════════════════════════════════════════════════════════════════════
  const ids = TIDS.filter((x) => /^[a-z0-9]+$/i.test(x));
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* order/FK — retried next pass */ } };
  if (ids.length > 0) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(
      `select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`,
    ).catch(() => [])) as Any[]).map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (const k of KEY_IDS) await del(() => P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${k}%`));
    for (let pass = 0; pass < 4; pass += 1)
      for (const t of tables) await del(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
    for (const id of ids) {
      await del(() => P.appSystemUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.appSystem.deleteMany({ where: { tenantId: id } }));
      await del(() => P.businessUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.tenant.delete({ where: { id } }));
    }
    for (const uid of USERS) await del(() => P.session.deleteMany({ where: { userId: uid } }));
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
      const sessions = USERS.length ? await P.session.count({ where: { userId: { in: USERS } } }) : 0;
      let buckets = 0;
      for (const k of KEY_IDS) buckets += Number((((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${k}%`)) as Any[])[0]?.n) ?? 0);
      chk("C1.11-CLEAN", "the oracle gives the QC database back exactly as found — the four throwaway tenants and every row they owned (contacts, companies, deals, templates, chat rooms, clinic rows, audit, outbox), the throwaway users + sessions + API-key rate buckets are gone",
        left.length === 0 && tenants === 0 && users === 0 && sessions === 0 && buckets === 0, "0 rows · 0 tenants · 0 users · 0 sessions",
        `${left.join(" · ") || "-"} · tenants=${tenants} users=${users} sessions=${sessions} buckets=${buckets}`, "MAJOR");
    } catch (e) {
      chk("C1.11-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

void THIS_FILE;
void FETCHES;
const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C1.11: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
