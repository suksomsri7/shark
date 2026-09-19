// QC — CRM v2 WO C1.9: custom objects UI — `/crm/settings/objects` (list · add-object form · 8 templates · field designer with an
//      "object:" switcher) · `/crm/objects/[key]` (table · FilterBar `f.{key}` · saved views · import) · `/crm/objects/[key]/[recordId]`
//      (layout · timeline · files · notes) · object tabs in contact / company / deal 360 AND member 360 · archive/restore with key confirmation
// Oracle writer · the C1.9 builder must NOT touch this file · QC database only (.env.qc)
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c1.9.mts
//      (`--force-run` = run every check while the pages are absent — functional checks red, S0.2/S0.3/CLEAN green: proves the fixtures,
//       the Next request-scope harness, the page renderer and the cleanup)
// requires: crm-seed   (house style — this oracle reads NO seeded row; everything lives in THREE throwaway tenants `qc-c19-<rand>[-v|-b]`)
//
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE (not re-implemented here):
//   qc-member-m1.3 (the member field designer — the FieldDesigner must behave byte-identical when the object prop is absent) ·
//   qc-member-m1.2 (field engine on the member side) · qc-member-m3.9 (templates panel inside the FieldDesigner) · qc-member-m1.5
//   (member 360 — the new object-tab slot) · qc-crm-c1.2a · qc-crm-c1.2b (engine + objects service) · qc-crm-c1.3/c1.4/c1.5 (the three
//   CRM 360 pages gain a tab slot) · qc-crm-c1.7 (visibility of records) · qc-nav-functions (the new non-param page is linked) ·
//   scripts/pending/probe-uiversion-gate.mts (its V2_ONLY list must gain settings/objects/page.tsx + objects/[key]/page.tsx +
//   objects/[key]/[recordId]/page.tsx) · qc-member-m1.9 (30/15/10/5).
//
// SOURCES: crm-brief-C1.9.md · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-E.1 objectKey on the field ctx · R-E.14 uiVersion) ·
//   CRM-RUN §2 "C1.9" (S1 5 · S2 3 · S3 2 · S4 4 · S5 4 = 18) · MASTER-PLAN §2 §4 (X1–X10) §5 §7 (inventory) · blueprint §3.6 (row 3.6)
//   §11.2 · C1.2b brief + controller rulings (archived object = NOT FOUND · archive-with-records = key + reason ≥ 5 · rename blocked by
//   records and by LOOKUP refs · title of a sensitive field is refused/falls back) · C1.7 rulings (MANAGER lacks crm.object.manage unless
//   granted · records follow their PARENT's visibility) · src/lib/modules/crm/ui-version.ts (v2 pages `requireCrmV2Page`, v2 actions
//   `assertCrmV2`) · mockup ledger/design-crm/06-custom-objects.png — used ONLY to name panels (left: "วัตถุที่มีอยู่" list with
//   ผูกกับ · N รายการ · N ฟิลด์ / "เพิ่มวัตถุ" form: singular · plural · parent chips ×5 · relation 1–n · title field · show-as-tab toggle ·
//   portal toggle · cancel/create / "เทมเพลตกิจการ" 8 chips · centre: "วัตถุ: <x>" switcher + field designer · right: member 360 with a
//   "รถ (2)" tab and "วัตถุอื่นที่ผูกกับสมาชิกคนนี้") — no screenshot assertion anywhere in this file.
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this) ══════════════════════════════════
//   PAGES (App Router, all under src/app/app/sys/[id]/crm/):
//   · settings/objects/page.tsx — CRM system guard (type "CRM") → `await requireCrmV2Page({ tenantId, systemId: id })` → actor →
//     `crm.object.manage` through crm/access (OWNER; MANAGER only when granted explicitly; STAFF never) — anything else `notFound()`.
//     Renders: the object list (label · ผูกกับ <OBJECT_PARENT_LABEL> · recordCount · field count · archived ones with restore) ·
//     the add-object form (singular label · plural label · key · parent type ×5 · title field · showAsTab · portalVisible) · the template
//     picker listing all 8 OBJECT_TEMPLATES · the field designer: `?object=<key>` selects the object (contact | company | deal | any
//     custom key); the page renders the member `<FieldDesigner>` with an object-switcher prop that lists contact · company · deal ·
//     every non-archived custom object, and the sections/fields of the selected object (engine `listLayout` with `objectKey`)
//   · objects/[key]/page.tsx (the dynamic folder name is free — this file discovers it) — CRM guard → requireCrmV2Page →
//     `crm.record.read` (else notFound) → object of THIS system, not archived (else notFound) → table of `records.list` with
//     `?q=` · `?f.<fieldKey>=<engine filter syntax>` (e.g. `?f.qty=10..30`) · `?view=<MemberSavedView id>` (objectKey = <key>, this
//     system; its `filters.f` / `filters.q` are applied; a view of another object/system is NOT "no filter" — it yields an inline
//     message and no rows) · an unknown `f.` key = inline Thai message and NO rows (never "everything") · import entry point
//   · objects/[key]/[recordId]/page.tsx — same guards + `records.get` (invisible / foreign / archived object ⇒ notFound — never a
//     crash) → title · every section with field labels + values (sensitive values stripped by the service) · timeline
//     (`timelineFor`) · files block `<CrmFilesBlock entityType="RECORD" entityId={recordId}>` · notes/activities
//     `<CrmActivityBlock target={{ customRecordId: recordId }}>`
//   · TAB SLOTS — contacts/[contactId] · companies/[companyId] · deals/[dealId] (CRM) and member/members/[memberId] (MEMBER system):
//     one tab per `tabsFor(parentType, parentId)` entry, link `?tab=obj-<objectKey>` (or a testid ending `obj-<objectKey>`) showing
//     label/labelPlural + count · `?tab=obj-<key>` lists the parent's records (titles) each linking to `/crm/objects/<key>/<recordId>`.
//     Member 360 takes the CUSTOMER-bound objects of the tenant's CRM systems whose uiVersion is 2 — a v1 CRM contributes NOTHING.
//   SERVER ACTIONS — "use server" files anywhere under crm/settings/objects/** · crm/objects/** · src/components/crm/objects/**
//     (or src/lib/modules/crm/objects-actions.ts); every action: `requireTenant` → key check (crm/access) → ctx from the session tenant
//     → `await assertCrmV2(ctx)` → the C1.2b service (never prisma on CustomObject/CustomRecord directly). Result
//     `{ ok: true, … } | { ok: false, error|reason: <Thai>, code }` with code ∈ NOT_FOUND · VALIDATION · DUPLICATE · CONFIRM_REQUIRED ·
//     FORBIDDEN (a v1 system ⇒ FORBIDDEN via CrmV2DisabledError). Names (first match wins):
//       createObjectAction(systemId, { key, label, labelPlural, parentType, titleFieldKey, showAsTab?, portalVisible?, templateKey? })
//       updateObjectAction(systemId, objectKey, patch)          archiveObjectAction(systemId, objectKey, { confirmKey, reason })
//       restoreObjectAction(systemId, objectKey)
//       createObjectSectionAction({ systemId, objectKey, key, label })
//       createObjectFieldAction({ systemId, objectKey, sectionId, key, label, type, options?, filterable?, sensitive?, … })
//         (= the member fields-actions payloads + `objectKey`, same `{ ok, data } | { ok:false, reason }` family, so the FieldDesigner
//          can swap action sets) + update/archive/restore/reorder field and update/delete/reorder section equivalents
//       createRecordAction(systemId, objectKey, { parentId?, title?, values? })
//       updateRecordAction(systemId, objectKey, recordId, { title?, values? })     archiveRecordAction(systemId, objectKey, recordId)
//       importRecordsAction(systemId, objectKey, { csv })       (caps = OBJECT_IMPORT_MAX_ROWS / OBJECT_IMPORT_MAX_BYTES — service)
//       saveObjectViewAction(systemId, objectKey, { name, filters: { f?, q? }, scope? })  → MemberSavedView{ systemId, objectKey }
//     Key format checked by the action (brief X6): `^[a-z][a-z0-9_]{1,30}$` + reserved customer|contact|company|deal (see Q1).
//   FIELD DESIGNER — src/components/member/FieldDesigner.tsx gains ONE optional prop (name matching /object/i); prop absent ⇒ every member
//     action call and every member-visible element unchanged (≤ 15 baseline lines removed vs cb37204). The member fields page keeps its
//     MEMBER guard + listLayout + the three baseline props; on a tenant without a v2 CRM it passes exactly those three props.
//   NAV + INVENTORY — CRM_DEEP_NAV gets `/crm/settings/objects` status "ready" · the drawer (src/app/app/layout.tsx) lists it after the
//     `crmV2.has(...)` gate · every clickable/typable element in the owned files has a `data-testid` with rows in
//     scripts/crm-ui-inventory.json (pages "/settings/objects", "/objects/[key]", "/objects/[key]/[recordId]") · 'use client' files never
//     reach prisma (types/constants from objects-shared.ts).
//
// WHAT THIS FILE PROVES: S0 structure + a harness positive control · S1–S5 (CRM-RUN, 18) · S6 uiVersion 1 (PERMANENT RULE: v1 shops see no
//   objects pages and unchanged member pages — with a positive control that flips the system to 2) · S7 brief extras (contact/deal tab
//   slots · rename rules through the UI · FieldDesigner smallest edit) · X1 (foreign tenant · other CRM system · thana/nok parent
//   visibility on lists, record pages, actions and import · permission gates) · X3 (10 parallel record creates · 10 parallel same-key
//   object creates) · X6 (key format · reserved keys · import caps) · X8 (sensitive values never reach a STAFF page · sensitive title
//   refused) · X9 (archive-with-records = typed key + reason ≥ 5 · audit rows).
//   n/a: X2 (no API key / AI tool — REST is C1.10; UI actions run on a human session) · X4 (no new consumer) · X5 (no cron) · X7 (no
//   public endpoint) · X10 (no new file route — the files block is C1.6's, only mounted here).
// HOW PAGES ARE TESTED: each page module is imported and its default export is called INSIDE a real Next request scope
//   (workAsyncStorage + workUnitAsyncStorage, the C0.4 technique) with a real session cookie of a throwaway user; the returned element
//   tree is walked: async server components are awaited, sync components are tried (client components throw on hooks and are then read
//   through their props), every string/number is collected. notFound() ⇒ 404. Server actions are called the same way (phase "action").
// HOUSE RULES: SKIP guard (no DB before it) · throwaway tenants swept in `finally` (every table with tenantId, 4 passes) + users + sessions ·
//   no drainOutbox · object storage never contacted (fake SHARK_BUNNY_* + fetch stub) · seeded QC data never read or written ·
//   last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

const THIS_FILE = "scripts/qc-crm-c1.9.mts";
const CRM_DIR = "src/app/app/sys/[id]/crm";
const SET_DIR = `${CRM_DIR}/settings/objects`;
const SET_PAGE = `${SET_DIR}/page.tsx`;
const OBJ_DIR = `${CRM_DIR}/objects`;
const COMP_DIR = "src/components/crm/objects";
const LIB_ACTIONS = "src/lib/modules/crm/objects-actions.ts";
const FD_FILE = "src/components/member/FieldDesigner.tsx";
const MEM_FIELDS_PAGE = "src/app/app/sys/[id]/member/settings/fields/page.tsx";
const MEM_360_PAGE = "src/app/app/sys/[id]/member/members/[memberId]/page.tsx";
const CO_360 = `${CRM_DIR}/companies/[companyId]/page.tsx`;
const CT_360 = `${CRM_DIR}/contacts/[contactId]/page.tsx`;
const DL_360 = `${CRM_DIR}/deals/[dealId]/page.tsx`;
const NAV_FILE = "src/lib/modules/crm/nav.ts";
const BASE_COMMIT = "cb37204"; // session/crm HEAD when this oracle was written (C1.7 deploy evidence) — FieldDesigner baseline
const MEMBER_FD_ACTIONS = [
  "applyTemplateAction", "archiveFieldAction", "createFieldAction", "createSectionAction", "deleteSectionAction", "previewTemplateAction",
  "reorderFieldsAction", "reorderSectionsAction", "restoreFieldAction", "updateFieldAction", "updateSectionAction",
];

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
  return out;
};
const dynDirs = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).filter((n) => /^\[[^\].]+\]$/.test(n) && statSync(join(dir, n)).isDirectory()) : [];
const LIST_SEG = dynDirs(OBJ_DIR).find((d) => existsSync(`${OBJ_DIR}/${d}/page.tsx`)) ?? "";
const LIST_PAGE = LIST_SEG ? `${OBJ_DIR}/${LIST_SEG}/page.tsx` : "";
const REC_SEG = LIST_SEG ? (dynDirs(`${OBJ_DIR}/${LIST_SEG}`).find((d) => existsSync(`${OBJ_DIR}/${LIST_SEG}/${d}/page.tsx`)) ?? "") : "";
const REC_PAGE = REC_SEG ? `${OBJ_DIR}/${LIST_SEG}/${REC_SEG}/page.tsx` : "";
const P_KEY = LIST_SEG ? LIST_SEG.slice(1, -1) : "key";
const P_REC = REC_SEG ? REC_SEG.slice(1, -1) : "recordId";

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guard — no C1.9 page exists yet ⇒ SKIPPED, no DB connection opened.
// ═══════════════════════════════════════════════════════════════════════════════════
if (!existsSync(SET_PAGE) && !LIST_PAGE && !FORCE) {
  console.log(`⚠️  SKIPPED — WO C1.9 not built yet (${SET_PAGE} and ${OBJ_DIR}/[key]/page.tsx missing)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();

// ─── object storage is NEVER contacted: fake identity + fetch stub ───
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c19-${rand}`;
const CDN = "https://qc-c19-cdn.invalid";
process.env.SHARK_BUNNY_CDN = CDN;
process.env.SHARK_BUNNY_ZONE = `${TAG}-zone`;
process.env.SHARK_BUNNY_KEY = `qc-c19-key-${randomBytes(8).toString("hex")}`;
delete process.env.BUNNY_ACCOUNT_KEY;
const STORE_REQ: { method: string; url: string }[] = [];
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  const method = String(init?.method ?? input?.method ?? "GET").toUpperCase();
  if (/bunnycdn\.com|bunny\.net|qc-c19-cdn\.invalid/.test(url)) {
    STORE_REQ.push({ method, url });
    return new Response(method === "GET" ? "not found" : "ok", { status: method === "PUT" ? 201 : method === "GET" ? 404 : 200 });
  }
  return realFetch(input, init);
}) as typeof fetch;

// ═══════════════════════════════════════════════════════════════════════════════════
// A real Next request scope (C0.4 technique) — pages and server actions read the session with cookies()/headers().
// ═══════════════════════════════════════════════════════════════════════════════════
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null)) as Any;
let SCOPE_RUNS = 0;
async function inScope<T>(cookie: string, pathname: string, phase: "render" | "action", fn: () => Promise<T>): Promise<T> {
  if (!nextWork?.workAsyncStorage || !nextWorkUnit?.workUnitAsyncStorage || !nextCookies?.RequestCookies) return fn();
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "qc-c19", "x-forwarded-for": "203.0.113.19" } });
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
const cut = (v: string | undefined | null, n = 220) => { const s = String(v ?? ""); return s.length > n ? `${s.slice(0, n)}…` : s; };
const thai = (s: unknown) => typeof s === "string" && s.trim().length > 0 && /[ก-๙]/.test(s);
const fnOf = (mod: Any, ...names: string[]): Any => {
  for (const n of names) {
    let v: Any = mod;
    for (const p of n.split(".")) v = v?.[p];
    if (typeof v === "function") return v;
  }
  return undefined;
};
const git = (spec: string): string => { try { return execFileSync("git", ["show", spec], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }); } catch { return ""; } };
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

// ─── server actions: discover every "use server" file of the owned folders, merge their exports ───
const ACTION_FILES = [...walkFiles(SET_DIR), ...walkFiles(OBJ_DIR), ...walkFiles(COMP_DIR), LIB_ACTIONS]
  .filter((f) => existsSync(f) && /^\s*["']use server["'];?\s*$/m.test(read(f).split("\n").filter((l) => !/^\s*\/\//.test(l)).slice(0, 6).join("\n")));
const ACTIONS: Record<string, Any> = {};
const ACTION_IMPORT_ERR: string[] = [];
for (const f of ACTION_FILES) {
  const mod = (await import(pathToFileURL(resolve(f)).href).catch((e: unknown) => { ACTION_IMPORT_ERR.push(`${f}: ${cut(e instanceof Error ? e.message : String(e), 120)}`); return {}; })) as Any;
  for (const [k, v] of Object.entries(mod)) if (typeof v === "function" && !(k in ACTIONS)) ACTIONS[k] = v;
}
const NAMES = {
  createObject: ["createObjectAction", "createCustomObjectAction"],
  updateObject: ["updateObjectAction", "updateCustomObjectAction"],
  archiveObject: ["archiveObjectAction", "archiveCustomObjectAction"],
  restoreObject: ["restoreObjectAction", "restoreCustomObjectAction"],
  createSection: ["createObjectSectionAction", "createCrmSectionAction"],
  createField: ["createObjectFieldAction", "createCrmFieldAction"],
  createRecord: ["createRecordAction", "createObjectRecordAction"],
  updateRecord: ["updateRecordAction", "updateObjectRecordAction"],
  archiveRecord: ["archiveRecordAction", "archiveObjectRecordAction"],
  importRecords: ["importRecordsAction", "importObjectRecordsAction"],
  saveView: ["saveObjectViewAction", "saveViewAction", "createSavedViewAction", "createObjectViewAction"],
} as const;
type ActName = keyof typeof NAMES;
const actFn = (n: ActName): Any => fnOf(ACTIONS, ...NAMES[n]);
const DESIGN_EXTRA = [/^update\w*Field\w*Action$/, /^archive\w*Field\w*Action$/, /^restore\w*Field\w*Action$/, /^reorder\w*Fields\w*Action$/,
  /^update\w*Section\w*Action$/, /^delete\w*Section\w*Action$/, /^reorder\w*Sections\w*Action$/];

type Who = { userId: string; role: string; unitAccess: string[]; permissions: Record<string, unknown>; cookie: string; tenantId: string };
type AR = { ok: boolean; code: string; msg: string; v: Any; thrown: boolean; missing: boolean };
const act = async (who: Who, name: ActName, ...args: Any[]): Promise<AR> => {
  const fn = actFn(name);
  if (typeof fn !== "function") return { ok: false, code: "MISSING_FUNCTION", msg: `${NAMES[name][0]} missing`, v: undefined, thrown: false, missing: true };
  try {
    const v = await inScope(who.cookie, `/app/sys/x/crm/objects`, "action", () => fn(...args));
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
const aNF = (r: AR) => !r.ok && r.code === "NOT_FOUND";
const aForb = (r: AR) => !r.ok && r.code === "FORBIDDEN";
const aVal = (r: AR) => !r.ok && (r.code === "VALIDATION" || r.code === "BAD_INPUT");
const aDesc = (r: AR) => (r.ok ? `ok${r.code ? `(${r.code})` : ""}` : `${r.code}:${cut(r.msg, 90)}`);

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
      if (t.constructor?.name === "AsyncFunction") { await walkNode(await t(props), acc, d + 1); return; } // server component
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
    await inScope(who.cookie, `/app/sys/${params.id ?? "x"}/page`, "render", async () => {
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
const elText = (n: Any, d = 0, seen = new WeakSet<object>()): string => {
  if (n === null || n === undefined || typeof n === "boolean" || typeof n === "function" || typeof n === "symbol" || d > 40) return "";
  if (typeof n === "string" || typeof n === "number" || typeof n === "bigint") return String(n);
  if (typeof n !== "object") return "";
  if (seen.has(n)) return "";
  seen.add(n);
  if (Array.isArray(n)) return n.map((x) => elText(x, d + 1, seen)).join(" ");
  if (isEl(n)) return elText(n.props, d + 1, seen);
  return Object.entries(n).filter(([k]) => k !== "_owner" && k !== "_store").map(([, v]) => elText(v, d + 1, seen)).join(" ");
};
const hasAll = (text: string, xs: string[]) => xs.every((x) => text.includes(x));
const hasNone = (text: string, xs: string[]) => xs.every((x) => !text.includes(x));
/** the tab link of an object in a 360 page: href `?tab=obj-<key>` or a testid ending `obj-<key>` */
const tabEl = (r: PR, key: string) => r.els.find((e) => {
  const h = String(e.props?.href ?? "");
  const tid = String(e.props?.["data-testid"] ?? "");
  return new RegExp(`[?&]tab=obj-${key}(&|$)`).test(h) || new RegExp(`obj-${key}$`).test(tid);
});
const tabShows = (r: PR, key: string, label: string, count: number) => {
  const e = tabEl(r, key);
  const t = e ? elText(e.props) : "";
  return !!e && t.includes(label) && new RegExp(`(^|\\D)${count}(\\D|$)`).test(t);
};
const linksTo = (r: PR, frag: string) => r.els.some((e) => String(e.props?.href ?? "").includes(frag));

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
    if (spec === "@prisma/client" || spec === "@/lib/core/db" || /(^|\/)db$/.test(spec) && spec.startsWith(".")) return `${file} → ${spec}`;
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

// ─────────────────────────── state ───────────────────────────
const SECRET_K = `กระบี่ลับ${rand}`;
const SECRET_B = `ร้านบีลับ${rand}`;
const SECRET_S2 = `ระบบสองลับ${rand}`;
const SENS = `SENS-${rand}-9931`;
const TIDS: string[] = [];
const USERS: string[] = [];
let phoneSeq = 0;
const phoneOf = (): string => `08${String((Math.floor(Math.random() * 9_000_000) + 1_000_000) * 10 + (phoneSeq++ % 10)).padStart(8, "0").slice(-8)}`;
const STAFF_DEFAULT = [
  "crm.contact.read", "crm.contact.create", "crm.contact.update", "crm.company.read", "crm.company.create", "crm.company.update",
  "crm.deal.read", "crm.deal.create", "crm.deal.update", "crm.deal.move", "crm.deal.lines", "crm.deal.quote",
  "crm.activity.read", "crm.activity.create", "crm.activity.complete", "crm.activity.delete",
  "crm.email.send", "crm.email.read", "crm.sequence.enroll", "crm.record.read", "crm.record.create", "crm.record.update", "crm.report.view",
];
const perms = (keys: readonly string[], extra: Record<string, unknown> = {}) => ({ ...Object.fromEntries(keys.map((k) => [k, true])), ...extra });

console.log(`\n═══ QC CRM v2 · C1.9 — custom objects UI ═══`);
console.log(`[env] DB ${host} · tag ${TAG}${FORCE && !existsSync(SET_PAGE) ? " · --force-run with the C1.9 pages ABSENT (functional checks below are expected red)" : ""}`);
console.log(`[discover] list page ${LIST_PAGE || "-"} · record page ${REC_PAGE || "-"} · action files ${ACTION_FILES.length} · actions ${Object.keys(ACTIONS).length}\n`);

try {
  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — tenant T (CRM S v2 + CRM S2 v2 + MEMBER M) · tenant TV (CRM v1 + MEMBER) · tenant TB (foreign CRM v2)
  // ═════════════════════════════════════════════════════════════════════════════
  const sysSvc = (await import("@/lib/modules/system/service")) as Any;
  const coreHash = (await import("@/lib/core/hash" as string)) as Any;
  const OBJ = (await import("@/lib/modules/crm/objects" as string).catch(() => ({}))) as Any;
  const OSH = (await import("@/lib/modules/crm/objects-shared" as string).catch(() => ({}))) as Any;
  const MEM = (await import("@/lib/modules/member" as string)) as Any;
  const VIS = (await import("@/lib/modules/crm/visibility" as string).catch(() => ({}))) as Any;
  const UV = (await import("@/lib/modules/crm/ui-version" as string).catch(() => ({}))) as Any;
  const FLD = MEM?.fields ?? {};
  const TEMPLATES = ((OSH.OBJECT_TEMPLATES ?? []) as Any[]);
  const MAX_ROWS = Number(OSH.OBJECT_IMPORT_MAX_ROWS ?? 5_000);
  const MAX_BYTES = Number(OSH.OBJECT_IMPORT_MAX_BYTES ?? 5 * 1024 * 1024);
  const PARENT_LABEL = (OSH.OBJECT_PARENT_LABEL ?? { COMPANY: "บริษัท", CONTACT: "ผู้ติดต่อ", DEAL: "ดีล", CUSTOMER: "สมาชิก", NONE: "ไม่ผูกกับใคร" }) as Record<string, string>;

  const mkTenant = async (suffix: string) => {
    const t = (await P.tenant.create({ data: { name: `${TAG}${suffix}`, slug: `${TAG}${suffix}` } })).id as string;
    TIDS.push(t);
    return t;
  };
  const T = await mkTenant("");
  const TV = await mkTenant("-v");
  const TB = await mkTenant("-b");
  const mkWho = async (tid: string, suffix: string, role: string, p: Record<string, unknown>): Promise<Who> => {
    const u = await P.user.create({ data: { email: `${TAG}-${suffix}@qc.invalid`, name: `QC ${suffix} ${TAG}` } });
    USERS.push(u.id);
    await P.membership.create({ data: { userId: u.id, tenantId: tid, role, unitAccess: ["*"], permissions: p, acceptedAt: new Date() } });
    const token = coreHash.randomToken(32) as string;
    await P.session.create({ data: { userId: u.id, tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 30 * 864e5), expiresAt: new Date(Date.now() + 90 * 864e5) } });
    return { userId: u.id, role, unitAccess: ["*"], permissions: p, tenantId: tid, cookie: `shark_session=${token}; __Host-shark_session=${token}; shark_tenant=${tid}` };
  };
  const owner = await mkWho(T, "owner", "OWNER", {});
  const mgr = await mkWho(T, "mgr", "MANAGER", {});
  const mgrG = await mkWho(T, "mgrg", "MANAGER", { "crm.object.manage": true });
  const thana = await mkWho(T, "thana", "STAFF", perms(STAFF_DEFAULT));
  const nok = await mkWho(T, "nok", "STAFF", perms(STAFF_DEFAULT));
  const reader = await mkWho(T, "reader", "STAFF", perms(["crm.contact.read", "crm.company.read"]));
  const ownerV = await mkWho(TV, "ownerv", "OWNER", {});
  const ownerB = await mkWho(TB, "ownerb", "OWNER", {});
  const actorOf = (w: Who) => ({ userId: w.userId, role: w.role, unitAccess: w.unitAccess, permissions: w.permissions });

  const S = (await sysSvc.createSystem(T, "CRM", `CRM ${TAG}`)).id as string;
  const S2 = (await sysSvc.createSystem(T, "CRM", `CRM สอง ${TAG}`)).id as string;
  const M = (await sysSvc.createSystem(T, "MEMBER", `สมาชิก ${TAG}`)).id as string;
  const SV = (await sysSvc.createSystem(TV, "CRM", `CRM v1 ${TAG}`)).id as string;
  const MV = (await sysSvc.createSystem(TV, "MEMBER", `สมาชิก v1 ${TAG}`)).id as string;
  const SB = (await sysSvc.createSystem(TB, "CRM", `CRM B ${TAG}`)).id as string;
  for (const id of [S, S2, SB]) await P.appSystem.update({ where: { id }, data: { settings: { crm: { uiVersion: 2 } } } });
  await P.appSystem.update({ where: { id: SV }, data: { settings: { crm: { uiVersion: 1 } } } });
  const cS = { tenantId: T, systemId: S, actorUserId: owner.userId };
  const cS2 = { tenantId: T, systemId: S2, actorUserId: owner.userId };
  const cSB = { tenantId: TB, systemId: SB, actorUserId: ownerB.userId };
  const oA = actorOf(owner);

  // teams (raw) · phuket: thana · krabi: nok (LEAD)
  const teamP = (await P.team.create({ data: { tenantId: T, name: `ภูเก็ต ${rand}` } })).id as string;
  const teamK = (await P.team.create({ data: { tenantId: T, name: `กระบี่ ${rand}`, leadUserId: nok.userId } })).id as string;
  await P.teamMember.create({ data: { tenantId: T, teamId: teamP, userId: thana.userId, role: "MEMBER" } });
  await P.teamMember.create({ data: { tenantId: T, teamId: teamK, userId: nok.userId, role: "LEAD" } });

  const mkParty = async (tid: string, name: string, kind: string, extra: Record<string, Any> = {}) => (await P.party.create({ data: { tenantId: tid, name, kind, ...extra } })).id as string;
  const mkCompany = async (name: string, ownerUserId: string | null, teamId: string | null) =>
    (await P.crmCompany.create({ data: { tenantId: T, systemId: S, name, partyId: await mkParty(T, name, "COMPANY"), ownerUserId, teamId } })).id as string;
  const mkContact = async (name: string, ownerUserId: string | null, teamId: string | null) => {
    const phone = phoneOf();
    return (await P.crmContact.create({ data: { tenantId: T, systemId: S, name, firstName: name, phone, partyId: await mkParty(T, name, "PERSON", { phone }), ownerUserId, teamId } })).id as string;
  };
  const coP = await mkCompany(`บริษัทภูเก็ต ${rand}`, thana.userId, teamP);
  const coK = await mkCompany(`บริษัท${SECRET_K}`, nok.userId, teamK);
  const kP = await mkContact(`คุณภูเก็ต ${rand}`, thana.userId, teamP);
  const pipe = (await P.crmPipeline.create({
    data: { tenantId: T, systemId: S, name: `ขาย ${TAG}`, stages: { create: [{ tenantId: T, systemId: S, sortOrder: 0, name: "ใหม่", kind: "OPEN", probability: 10 }, { tenantId: T, systemId: S, sortOrder: 1, name: "ชนะ", kind: "WON", probability: 100 }] } },
    include: { stages: true },
  })) as Any;
  const st0 = [...(pipe.stages as Any[])].sort((a, b) => a.sortOrder - b.sortOrder)[0].id as string;
  const dP = (await P.crmDeal.create({ data: { tenantId: T, systemId: S, pipelineId: pipe.id, stageId: st0, contactId: kP, title: `ดีลภูเก็ต ${rand}`, valueSatang: 100_000, kind: "OPEN", ownerUserId: thana.userId, teamId: teamP } })).id as string;
  await P.crmDealStageHistory.create({ data: { tenantId: T, dealId: dP, toStageId: st0 } });
  const custParty = await mkParty(T, `สมาชิก ${TAG}`, "PERSON");
  const cust = (await P.customer.create({ data: { tenantId: T, memberSystemId: M, name: `สมาชิก ${TAG}`, partyId: custParty } })).id as string;
  const custVParty = await mkParty(TV, `สมาชิกวีหนึ่ง ${TAG}`, "PERSON");
  const custV = (await P.customer.create({ data: { tenantId: TV, memberSystemId: MV, name: `สมาชิกวีหนึ่ง ${TAG}`, partyId: custVParty } })).id as string;

  // fixture objects through the C1.2b service + the C1.2a engine (NOT through the code under test)
  const mkObject = async (c: Any, key: string, label: string, parentType: string, titleFieldKey: string, fields: Any[]) => {
    await OBJ.create(c, oA, { key, label, labelPlural: label, parentType, titleFieldKey, showAsTab: true });
    const sec = await FLD.createSection({ ...c, objectKey: key }, { key: `${key}Info`, label: `ข้อมูล${label}` });
    for (const f of fields) await FLD.createField({ ...c, objectKey: key }, { sectionId: sec.id, ...f });
  };
  const mkRec = async (c: Any, actor: Any, key: string, input: Any) => (await OBJ.records.create(c, actor, key, input)).id as string;
  let fixturesOk = false;
  let fixtureErr = "";
  const F: Record<string, string> = {};
  try {
    await mkObject(cS, "gear", "อุปกรณ์", "COMPANY", "code", [
      { key: "code", label: "รหัสอุปกรณ์", type: "TEXT", filterable: true, showInList: true },
      { key: "qty", label: "จำนวนชิ้น", type: "NUMBER", filterable: true, showInList: true },
      { key: "due", label: "ครบกำหนดตรวจ", type: "DATE", filterable: true },
      { key: "serial", label: "เลขประจำเครื่อง", type: "TEXT", sensitive: true },
    ]);
    F.gA = await mkRec(cS, oA, "gear", { parentId: coP, values: { code: `ALPHA-${rand}`, qty: 5, due: "2026-10-01", serial: SENS } });
    F.gB = await mkRec(cS, oA, "gear", { parentId: coP, values: { code: `ALPINE-${rand}`, qty: 15, due: "2026-12-15" } });
    F.gC = await mkRec(cS, oA, "gear", { parentId: coP, values: { code: `BRAVO-${rand}`, qty: 25, due: "2027-01-20" } });
    F.gK = await mkRec(cS, oA, "gear", { parentId: coK, values: { code: `KRB${SECRET_K}`, qty: 99, due: "2025-01-01" } });
    await mkObject(cS, "visit", "การเยี่ยม", "CONTACT", "vname", [{ key: "vname", label: "หัวข้อเยี่ยม", type: "TEXT" }]);
    F.visit = await mkRec(cS, oA, "visit", { parentId: kP, values: { vname: `VISIT-${rand}` } });
    await mkObject(cS, "dealdoc", "เอกสารดีล", "DEAL", "dname", [{ key: "dname", label: "ชื่อเอกสาร", type: "TEXT" }]);
    F.dealdoc = await mkRec(cS, oA, "dealdoc", { parentId: dP, values: { dname: `DDOC-${rand}` } });
    await mkObject(cS, "vehicle", "รถสมาชิก", "CUSTOMER", "vplate", [{ key: "vplate", label: "ทะเบียน", type: "TEXT" }]);
    F.v1 = await mkRec(cS, oA, "vehicle", { parentId: cust, values: { vplate: `VEH1-${rand}` } });
    F.v2 = await mkRec(cS, oA, "vehicle", { parentId: cust, values: { vplate: `VEH2-${rand}` } });
    await mkObject(cS, "lktarget", "ปลายทางลิงก์", "NONE", "lname", [{ key: "lname", label: "ชื่อ", type: "TEXT" }]);
    const gearLay = await FLD.listLayout({ ...cS, objectKey: "gear" }, { includeArchived: false });
    await FLD.createField({ ...cS, objectKey: "gear" }, { sectionId: gearLay.sections[0].id, key: "linkTo", label: "เชื่อมไปยัง", type: "LOOKUP", options: { target: "CUSTOM", objectKey: "lktarget" } });
    await mkObject(cS2, "otherobj", "ของระบบสอง", "NONE", "oname", [{ key: "oname", label: "ชื่อ", type: "TEXT" }]);
    F.s2 = await mkRec(cS2, oA, "otherobj", { values: { oname: `S2-${SECRET_S2}` } });
    await mkObject(cSB, "tbobj", "ของร้านบี", "NONE", "bname", [{ key: "bname", label: "ชื่อ", type: "TEXT" }]);
    F.tb = await mkRec(cSB, actorOf(ownerB), "tbobj", { values: { bname: `TB-${SECRET_B}` } });
    fixturesOk = true;
  } catch (e) {
    fixtureErr = cut(e instanceof Error ? `${e.name}: ${e.message}` : String(e), 300);
  }
  // tenant TV (uiVersion 1): a CUSTOMER-bound object with one record — raw rows (the service is not what S6 tests)
  const objV = (await P.customObject.create({ data: { tenantId: TV, systemId: SV, key: "pets", label: "สัตว์เลี้ยง", labelPlural: "สัตว์เลี้ยง", parentType: "CUSTOMER", titleFieldKey: "pname", showAsTab: true, recordCount: 1 } })).id as string;
  const recV = (await P.customRecord.create({ data: { tenantId: TV, systemId: SV, objectId: objV, parentType: "CUSTOMER", parentId: custV, partyId: custVParty, title: `PET-${rand}` } })).id as string;
  console.log(`[setup] T ${T} (S ${S} · S2 ${S2} · M ${M}) · TV ${TV} (SV ${SV} v1) · TB ${TB} (SB ${SB}) · fixtures ${fixturesOk ? "ok" : `FAILED ${fixtureErr}`}\n`);

  const pp = (sys: string, key: string, recordId?: string): Record<string, string> =>
    ({ id: sys, [P_KEY]: key, key, objectKey: key, ...(recordId ? { [P_REC]: recordId, recordId } : {}) });
  const titles = { A: `ALPHA-${rand}`, B: `ALPINE-${rand}`, C: `BRAVO-${rand}`, K: `KRB${SECRET_K}` };

  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — structure · prerequisites · harness positive control
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S0 · structure ──");
  {
    const missA = (Object.keys(NAMES) as ActName[]).filter((n) => typeof actFn(n) !== "function").map((n) => NAMES[n][0]);
    const missD = DESIGN_EXTRA.filter((re) => !Object.keys(ACTIONS).some((k) => re.test(k))).map(String);
    chk("C1.9-S0.1", "pages exist (settings/objects · objects/[key] · objects/[key]/[recordId]) and the \"use server\" files of the owned folders export every action of the contract (objects · sections/fields with objectKey · records · import · saved view) + the 7 remaining designer actions",
      existsSync(SET_PAGE) && !!LIST_PAGE && !!REC_PAGE && ACTION_IMPORT_ERR.length === 0 && missA.length === 0 && missD.length === 0, "3 pages · all actions",
      `settings=${existsSync(SET_PAGE)} list=${!!LIST_PAGE} record=${!!REC_PAGE} importErr=${ACTION_IMPORT_ERR.join(" ; ") || "-"} missing=${[...missA, ...missD].join(",") || "-"}`);
  }
  chk("C1.9-S0.2", "[prerequisite] fixtures built through the C1.2b service + C1.2a engine (objects gear/visit/dealdoc/vehicle/lktarget/otherobj/tbobj + records) · C1.7 recordVisibleWhere present · ui-version gate present",
    fixturesOk && typeof OBJ.tabsFor === "function" && typeof VIS.recordVisibleWhere === "function" && typeof UV.assertCrmV2 === "function", "prerequisites",
    `fixtures=${fixturesOk || fixtureErr} tabsFor=${typeof OBJ.tabsFor} recordVisibleWhere=${typeof VIS.recordVisibleWhere} assertCrmV2=${typeof UV.assertCrmV2}`);
  {
    // positive + negative control of the page harness on a page that ALREADY exists (C1.3): owner sees the company, thana gets 404 on krabi
    const a = await render(owner, CO_360, { id: S, companyId: coP });
    const b = await render(thana, CO_360, { id: S, companyId: coK });
    const c = await render(thana, CO_360, { id: S, companyId: coP });
    chk("C1.9-S0.3", "[harness control] the Next request-scope renderer works on the existing C1.3 company 360: owner → 200 with the company name · thana → 200 on phuket / 404 on krabi (per-request identity is real, notFound is detected)",
      a.status === 200 && a.text.includes(`บริษัทภูเก็ต ${rand}`) && c.status === 200 && b.status === 404 && SCOPE_RUNS > 0, "200 · 200 · 404",
      `owner=${pDesc(a)} thanaP=${pDesc(c)} thanaK=${pDesc(b)} scopes=${SCOPE_RUNS}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — create an object from the UI → 5 fields → 2 records → the tab appears in company 360 (CRM-RUN S1 · 5)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S1 · object → fields → records → tab ──");
  let carRecs: string[] = [];
  {
    const r = await act(owner, "createObject", S, { key: "car", label: "รถ", labelPlural: "รถ", parentType: "COMPANY", titleFieldKey: "plate", showAsTab: true, portalVisible: false });
    const row = await P.customObject.findFirst({ where: { tenantId: T, systemId: S, key: "car" } });
    const aud = row ? await P.auditLog.count({ where: { tenantId: T, action: "crm.object.create", targetId: row.id } }) : 0;
    const tpl = TEMPLATES[0] ?? { key: "pet", titleFieldKey: "petName", parentType: "CONTACT", label: "สัตว์เลี้ยง" };
    const rt = await act(owner, "createObject", S, { key: String(tpl.key), label: String(tpl.label), labelPlural: String(tpl.labelPlural ?? tpl.label), parentType: String(tpl.parentType), titleFieldKey: String(tpl.titleFieldKey), templateKey: String(tpl.key) });
    const tplFields = await P.memberField.count({ where: { tenantId: T, systemId: S, objectKey: String(tpl.key) } });
    chk("C1.9-S1.1", "createObjectAction (owner): object \"car\" (parent COMPANY · title plate · showAsTab · portal off) lands in THIS CRM system with an audit row · the template picker path (templateKey = first of the 8) materialises the template's fields",
      r.ok && !!row && row.parentType === "COMPANY" && row.titleFieldKey === "plate" && row.showAsTab === true && row.portalVisible === false && aud === 1 && rt.ok && tplFields >= 3,
      "car + template", `car=${aDesc(r)} row=${!!row} audit=${aud} template=${aDesc(rt)} tplFields=${tplFields}`);
  }
  {
    const memBefore = await P.memberField.count({ where: { tenantId: T, systemId: M } });
    const sr = await act(owner, "createSection", { systemId: S, objectKey: "car", key: "carInfo", label: "ข้อมูลรถ" });
    const sec = await P.memberSection.findFirst({ where: { tenantId: T, systemId: S, objectKey: "car", key: "carInfo" } });
    const defs = [
      { key: "plate", label: "ทะเบียนรถ", type: "TEXT", filterable: true, showInList: true },
      { key: "mileage", label: "เลขไมล์", type: "NUMBER", filterable: true },
      { key: "nextService", label: "เช็กระยะครั้งถัดไป", type: "DATE", filterable: true },
      { key: "fuel", label: "เชื้อเพลิง", type: "SELECT", filterable: true, options: { choices: [{ value: "diesel", label: "ดีเซล" }, { value: "petrol", label: "เบนซิน" }] } },
      { key: "insured", label: "มีประกัน", type: "BOOLEAN" },
    ];
    const res: AR[] = [];
    for (const d of defs) res.push(await act(owner, "createField", { systemId: S, objectKey: "car", sectionId: sec?.id ?? "none", ...d }));
    const rows = (await P.memberField.findMany({ where: { tenantId: T, objectKey: "car" }, select: { key: true, type: true, systemId: true } })) as Any[];
    const memAfter = await P.memberField.count({ where: { tenantId: T, systemId: M } });
    chk("C1.9-S1.2", "the field designer with objectKey \"car\" (section + 5 fields TEXT/NUMBER/DATE/SELECT/BOOLEAN through the CRM field actions) writes exactly 5 MemberField rows objectKey car of the CRM system — none in the member system, whose customer fields are untouched",
      sr.ok && res.every((x) => x.ok) && rows.length === 5 && rows.every((x) => x.systemId === S) && defs.every((d) => rows.some((x) => x.key === d.key && x.type === d.type)) && memAfter === memBefore,
      "5 rows in S", `section=${aDesc(sr)} fields=${res.map(aDesc).join("|")} rows=${rows.length} memberFields ${memBefore}→${memAfter}`);
  }
  {
    const r1 = await act(owner, "createRecord", S, "car", { parentId: coP, values: { plate: `กข-${rand}-1`, mileage: 48200, nextService: "2026-09-28", fuel: "diesel", insured: true } });
    const r2 = await act(owner, "createRecord", S, "car", { parentId: coP, values: { plate: `ฮอ-${rand}-2`, mileage: 22050, nextService: "2026-11-14", fuel: "petrol", insured: false } });
    const rows = (await P.customRecord.findMany({ where: { tenantId: T, systemId: S, object: { key: "car" } }, orderBy: { createdAt: "asc" } })) as Any[];
    carRecs = rows.map((x) => x.id as string);
    const obj = await P.customObject.findFirst({ where: { tenantId: T, systemId: S, key: "car" } });
    chk("C1.9-S1.3", "createRecordAction ×2 on company phuket: 2 CustomRecord rows whose title = the plate value (titleFieldKey) · parent COMPANY coP · recordCount cache = 2",
      r1.ok && r2.ok && rows.length === 2 && rows.map((x) => x.title).sort().join(",") === [`กข-${rand}-1`, `ฮอ-${rand}-2`].sort().join(",") && rows.every((x) => x.parentType === "COMPANY" && x.parentId === coP) && obj?.recordCount === 2,
      "2 rows · count 2", `r1=${aDesc(r1)} r2=${aDesc(r2)} rows=${rows.map((x) => x.title).join(",")} count=${obj?.recordCount}`);
  }
  {
    const pg = await render(owner, CO_360, { id: S, companyId: coP });
    chk("C1.9-S1.4", "company 360 (owner, default tab) shows a tab `?tab=obj-car` labelled \"รถ\" with count 2 (next to obj-gear 3)",
      pg.status === 200 && tabShows(pg, "car", "รถ", 2) && tabShows(pg, "gear", "อุปกรณ์", 3), "tab รถ (2)",
      `${pDesc(pg)} car=${tabEl(pg, "car") ? cut(elText(tabEl(pg, "car")!.props), 60) : "none"} gear=${tabEl(pg, "gear") ? cut(elText(tabEl(pg, "gear")!.props), 60) : "none"}`);
  }
  {
    const pg = await render(owner, CO_360, { id: S, companyId: coP }, { tab: "obj-car" });
    chk("C1.9-S1.5", "company 360 `?tab=obj-car` lists both record titles, each linking to /crm/objects/car/<recordId>",
      pg.status === 200 && hasAll(pg.text, [`กข-${rand}-1`, `ฮอ-${rand}-2`]) && carRecs.length === 2 && carRecs.every((id) => linksTo(pg, `/crm/objects/car/${id}`)),
      "2 titles + links", `${pDesc(pg)} titles=${hasAll(pg.text, [`กข-${rand}-1`, `ฮอ-${rand}-2`])} links=${carRecs.filter((id) => linksTo(pg, `/crm/objects/car/${id}`)).length}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — `f.{key}` filters + saved views on the object list page (CRM-RUN S2 · 3)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2 · list filters ──");
  {
    const all = await render(owner, LIST_PAGE, pp(S, "gear"));
    const a = await render(owner, LIST_PAGE, pp(S, "gear"), { "f.code": "ALP" });
    chk("C1.9-S2.1", "/objects/gear (owner): no filter → all 4 titles · `?f.code=ALP` (TEXT contains) → ALPHA + ALPINE only",
      all.status === 200 && hasAll(all.text, Object.values(titles)) && a.status === 200 && hasAll(a.text, [titles.A, titles.B]) && hasNone(a.text, [titles.C, titles.K]),
      "4 · 2", `all=${pDesc(all)}:${Object.values(titles).filter((t) => all.text.includes(t)).length} f=${pDesc(a)}:${Object.values(titles).filter((t) => a.text.includes(t)).length}`);
  }
  {
    const a = await render(owner, LIST_PAGE, pp(S, "gear"), { "f.qty": "10..30" });
    const b = await render(owner, LIST_PAGE, pp(S, "gear"), { "f.due": "2026-11-01.." });
    const c = await render(owner, LIST_PAGE, pp(S, "gear"), { "f.nope": "1" });
    chk("C1.9-S2.2", "NUMBER range `f.qty=10..30` → ALPINE + BRAVO · DATE open range `f.due=2026-11-01..` → ALPINE + BRAVO · unknown `f.nope` → page still 200 with an inline message and NO rows (never \"everything\")",
      a.status === 200 && hasAll(a.text, [titles.B, titles.C]) && hasNone(a.text, [titles.A, titles.K]) && b.status === 200 && hasAll(b.text, [titles.B, titles.C]) && hasNone(b.text, [titles.A, titles.K]) && c.status === 200 && hasNone(c.text, Object.values(titles)),
      "2 · 2 · 0", `qty=${pDesc(a)}:${Object.values(titles).filter((t) => a.text.includes(t)).length} due=${pDesc(b)}:${Object.values(titles).filter((t) => b.text.includes(t)).length} nope=${pDesc(c)}:${Object.values(titles).filter((t) => c.text.includes(t)).length}`);
  }
  {
    const sv = await act(owner, "saveView", S, "gear", { name: `ALP ${rand}`, filters: { f: { code: "ALP" } }, scope: "PRIVATE" });
    const view = await P.memberSavedView.findFirst({ where: { tenantId: T, systemId: S, objectKey: "gear" }, orderBy: { createdAt: "desc" } });
    const a = view ? await render(owner, LIST_PAGE, pp(S, "gear"), { view: view.id }) : null;
    const foreign = (await P.memberSavedView.create({ data: { tenantId: T, systemId: S, ownerUserId: owner.userId, name: `contact view ${rand}`, objectKey: "contact", filters: {} } })).id as string;
    const b = await render(owner, LIST_PAGE, pp(S, "gear"), { view: foreign });
    chk("C1.9-S2.3", "saveObjectViewAction writes MemberSavedView{ systemId S, objectKey gear } · `?view=<id>` applies it (ALPHA + ALPINE only) · a view of objectKey \"contact\" used on gear → no rows (inline message or 404), never all",
      sv.ok && !!view && !!a && a.status === 200 && hasAll(a.text, [titles.A, titles.B]) && hasNone(a.text, [titles.C, titles.K]) && (b.status === 404 || (b.status === 200 && hasNone(b.text, Object.values(titles)))),
      "saved + applied + foreign refused", `save=${aDesc(sv)} row=${!!view} apply=${a ? `${pDesc(a)}:${Object.values(titles).filter((t) => a.text.includes(t)).length}` : "-"} foreign=${pDesc(b)}:${Object.values(titles).filter((t) => b.text.includes(t)).length}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S7.1 — the other tab slots: contact 360 + deal 360 (brief: "tab in contact/company/deal 360 AND member 360")
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S7 · brief extras (tab slots) ──");
  {
    const c0 = await render(owner, CT_360, { id: S, contactId: kP });
    const c1 = await render(owner, CT_360, { id: S, contactId: kP }, { tab: "obj-visit" });
    const d0 = await render(owner, DL_360, { id: S, dealId: dP });
    const d1 = await render(owner, DL_360, { id: S, dealId: dP }, { tab: "obj-dealdoc" });
    chk("C1.9-S7.1", "contact 360 shows tab obj-visit (การเยี่ยม · 1) and `?tab=obj-visit` lists VISIT linking to its record page · deal 360 shows tab obj-dealdoc (เอกสารดีล · 1) and `?tab=obj-dealdoc` lists DDOC",
      tabShows(c0, "visit", "การเยี่ยม", 1) && c1.status === 200 && c1.text.includes(`VISIT-${rand}`) && linksTo(c1, `/crm/objects/visit/${F.visit}`) &&
      tabShows(d0, "dealdoc", "เอกสารดีล", 1) && d1.status === 200 && d1.text.includes(`DDOC-${rand}`) && linksTo(d1, `/crm/objects/dealdoc/${F.dealdoc}`),
      "2 slots", `contactTab=${!!tabEl(c0, "visit")} ${pDesc(c1)} visit=${c1.text.includes(`VISIT-${rand}`)} · dealTab=${!!tabEl(d0, "dealdoc")} ${pDesc(d1)} ddoc=${d1.text.includes(`DDOC-${rand}`)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — mockup 06 panels (names only) · member 360 tab · record page (CRM-RUN S4 · 4)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S4 · pages (mockup 06 panels) ──");
  const ownedSrc = [...walkFiles(SET_DIR), ...walkFiles(OBJ_DIR), ...walkFiles(COMP_DIR)].map(read).join("\n");
  const tids = [...ownedSrc.matchAll(/data-testid=\{?[`"']([^`"']+)[`"']/g)].map((m) => m[1]);
  {
    const pg = await render(owner, SET_PAGE, { id: S });
    const tplLabels = TEMPLATES.map((t) => String(t.label));
    const need: [string, RegExp][] = [["singular", /object.*(singular|label)/i], ["plural", /plural/i], ["parent", /parent/i], ["title-field", /title/i],
      ["show-as-tab", /tab/i], ["portal", /portal/i], ["create", /object.*(create|submit|save)/i], ["template", /template/i], ["archive", /archive/i], ["restore", /restore/i]];
    const missT = need.filter(([, re]) => !tids.some((t) => re.test(t))).map(([n]) => n);
    chk("C1.9-S4.1", "/settings/objects (owner) 200 — left column of mockup 06: object list (car · gear · labels + ผูกกับ <parent label>) · all 8 template labels · add-object form + template picker + archive/restore controls carry testids (singular · plural · parent · title field · show-as-tab · portal · create · template · archive · restore)",
      pg.status === 200 && tplLabels.length === 8 && hasAll(pg.text, [...tplLabels, "รถ", "อุปกรณ์", PARENT_LABEL.COMPANY]) && missT.length === 0,
      "panels", `${pDesc(pg)} templates=${tplLabels.filter((l) => pg.text.includes(l)).length}/${tplLabels.length} labels=${["รถ", "อุปกรณ์"].filter((l) => pg.text.includes(l)).join(",")} missingTestids=${missT.join(",") || "-"}`, "MAJOR");
  }
  {
    const car = await render(owner, SET_PAGE, { id: S }, { object: "car" });
    const con = await render(owner, SET_PAGE, { id: S }, { object: "contact" });
    const fdCar = car.els.find((e) => e.name === "FieldDesigner");
    const fdCon = con.els.find((e) => e.name === "FieldDesigner");
    const jc = fdCar ? pj(fdCar.props) : "";
    const objProp = fdCar ? Object.keys(fdCar.props).find((k) => /object/i.test(k)) : undefined;
    const optJ = fdCar && objProp ? pj(fdCar.props[objProp]) : "";
    chk("C1.9-S4.2", "centre of mockup 06: `?object=car` renders the member <FieldDesigner> with the object-switcher prop (options contact · company · deal · car · gear) and the car sections/fields (plate · mileage) · `?object=contact` renders it for the contact built-in",
      car.status === 200 && !!fdCar && !!objProp && ["\"contact\"", "\"company\"", "\"deal\"", "\"car\"", "\"gear\""].every((k) => optJ.includes(k)) && jc.includes("plate") && jc.includes("mileage") && con.status === 200 && !!fdCon,
      "designer + switcher", `car=${pDesc(car)} fd=${!!fdCar} prop=${objProp ?? "-"} opts=${["contact", "company", "deal", "car", "gear"].filter((k) => optJ.includes(`"${k}"`)).join(",")} fields=${jc.includes("plate")}/${jc.includes("mileage")} contact=${pDesc(con)} fd=${!!fdCon}`, "MAJOR");
  }
  {
    const m0 = await render(owner, MEM_360_PAGE, { id: M, memberId: cust });
    const m1 = await render(owner, MEM_360_PAGE, { id: M, memberId: cust }, { tab: "obj-vehicle" });
    chk("C1.9-S4.3", "right of mockup 06: member 360 (tenant with a v2 CRM) shows the CUSTOMER-bound tab obj-vehicle (รถสมาชิก · 2) and `?tab=obj-vehicle` lists VEH1 + VEH2 linking to their record pages",
      m0.status === 200 && tabShows(m0, "vehicle", "รถสมาชิก", 2) && m1.status === 200 && hasAll(m1.text, [`VEH1-${rand}`, `VEH2-${rand}`]) && linksTo(m1, `/crm/objects/vehicle/${F.v1}`),
      "member tab (2)", `${pDesc(m0)} tab=${tabEl(m0, "vehicle") ? cut(elText(tabEl(m0, "vehicle")!.props), 60) : "none"} list=${pDesc(m1)}:${[`VEH1-${rand}`, `VEH2-${rand}`].filter((t) => m1.text.includes(t)).length}`, "MAJOR");
  }
  {
    const up = await act(owner, "updateRecord", S, "gear", F.gA, { values: { qty: 6 } });
    const pg = await render(owner, REC_PAGE, pp(S, "gear", F.gA));
    const files = pg.els.some((e) => e.props?.entityType === "RECORD" && e.props?.entityId === F.gA);
    const notes = pg.els.some((e) => e.props?.target?.customRecordId === F.gA || e.props?.customRecordId === F.gA);
    chk("C1.9-S4.4", "record page /objects/gear/<ALPHA> (owner) 200: title · field labels + values (จำนวนชิ้น 6 after updateRecordAction) · timeline (สร้างอุปกรณ์ + แก้ไขข้อมูล) · files block entityType RECORD · notes/activities target customRecordId",
      up.ok && pg.status === 200 && hasAll(pg.text, [titles.A, "รหัสอุปกรณ์", "จำนวนชิ้น", "สร้างอุปกรณ์", "แก้ไขข้อมูล"]) && /(^|\D)6(\D|$)/.test(pg.text) && files && notes,
      "layout + timeline + files + notes", `update=${aDesc(up)} ${pDesc(pg)} title=${pg.text.includes(titles.A)} labels=${pg.text.includes("จำนวนชิ้น")} timeline=${pg.text.includes("สร้างอุปกรณ์")}/${pg.text.includes("แก้ไขข้อมูล")} files=${files} notes=${notes}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X1 — scope: foreign tenant · other CRM system · parent visibility · permission gates
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X1 · scope ──");
  {
    const a = await render(owner, LIST_PAGE, pp(SB, "tbobj"));
    const b = await render(owner, REC_PAGE, pp(SB, "tbobj", F.tb));
    const c = await render(owner, SET_PAGE, { id: SB });
    const d = await render(owner, LIST_PAGE, pp(S, "tbobj"));
    const e = await render(owner, REC_PAGE, pp(S, "gear", F.tb));
    chk("C1.9-X1.1", "foreign tenant through the pages (owner of T): TB's system id → list / record / settings 404 · TB's object key or record id under T's system → 404 (never a crash, never TB data)",
      [a, b, c, d, e].every((r) => r.status === 404), "5× 404", [a, b, c, d, e].map(pDesc).join(" "));
  }
  {
    const before = await P.customRecord.findUnique({ where: { id: F.tb ?? "none" } });
    const r1 = await act(owner, "createRecord", SB, "tbobj", { values: { bname: "x" } });
    const r2 = await act(owner, "updateRecord", S, "gear", F.tb, { values: { code: "x" } });
    const r3 = await act(owner, "archiveObject", SB, "tbobj", { confirmKey: "tbobj", reason: "ทดสอบข้ามร้าน" });
    const r4 = await act(owner, "archiveRecord", S, "tbobj", F.tb);
    const after = await P.customRecord.findUnique({ where: { id: F.tb ?? "none" } });
    const obj = await P.customObject.findFirst({ where: { tenantId: TB, key: "tbobj" } });
    const n = await P.customRecord.count({ where: { tenantId: TB } });
    const leak = [r1, r2, r3, r4].some((r) => r.msg.includes(SECRET_B));
    chk("C1.9-X1.2", "foreign tenant through the actions: create/update/archive-object/archive-record with TB ids → NOT_FOUND · TB rows unchanged (1 record, title same, object not archived) · no message echoes TB data",
      [r1, r2, r3, r4].every(aNF) && !!before && after?.title === before.title && after?.archivedAt === null && !obj?.archivedAt && n === 1 && !leak,
      "4× NOT_FOUND", `${[r1, r2, r3, r4].map(aDesc).join(" | ")} tbRecords=${n} archived=${!!obj?.archivedAt} leak=${leak}`);
  }
  {
    const pos = await render(owner, LIST_PAGE, pp(S2, "otherobj"));
    const a = await render(owner, LIST_PAGE, pp(S, "otherobj"));
    const b = await render(owner, REC_PAGE, pp(S, "otherobj", F.s2));
    const c = await act(owner, "updateRecord", S, "otherobj", F.s2, { values: { oname: "x" } });
    const d = await act(owner, "createSection", { systemId: S, objectKey: "otherobj", key: "hijack", label: "ยึด" });
    const secs = await P.memberSection.count({ where: { tenantId: T, key: "hijack" } });
    chk("C1.9-X1.3", "another CRM system of the SAME tenant: S2's object/record under S → list 404 · record 404 · updateRecordAction NOT_FOUND · createObjectSectionAction NOT_FOUND (no row) — [positive control] the same object renders 200 under S2",
      pos.status === 200 && pos.text.includes(`S2-${SECRET_S2}`) && a.status === 404 && b.status === 404 && aNF(c) && aNF(d) && secs === 0,
      "404 · 404 · NF · NF", `pos=${pDesc(pos)} list=${pDesc(a)} rec=${pDesc(b)} upd=${aDesc(c)} sec=${aDesc(d)} rows=${secs}`);
  }
  {
    const t = await render(thana, LIST_PAGE, pp(S, "gear"));
    const n = await render(nok, LIST_PAGE, pp(S, "gear"));
    chk("C1.9-X1.4", "records follow their PARENT: thana (phuket) /objects/gear → ALPHA · ALPINE · BRAVO and nothing of krabi (no KRB title, no krabi secret anywhere) · nok (krabi lead) → KRB only",
      t.status === 200 && hasAll(t.text, [titles.A, titles.B, titles.C]) && !t.text.includes(SECRET_K) && n.status === 200 && n.text.includes(titles.K) && hasNone(n.text, [titles.A, titles.B, titles.C]),
      "phuket 3 · krabi 1", `thana=${pDesc(t)}:${Object.values(titles).filter((x) => t.text.includes(x)).length} secret=${t.text.includes(SECRET_K)} nok=${pDesc(n)}:${Object.values(titles).filter((x) => n.text.includes(x)).length}`);
  }
  {
    const pos = await render(thana, REC_PAGE, pp(S, "gear", F.gA));
    const a = await render(thana, REC_PAGE, pp(S, "gear", F.gK));
    const before = await P.customRecord.findUnique({ where: { id: F.gK ?? "none" } });
    const u = await act(thana, "updateRecord", S, "gear", F.gK, { values: { qty: 1 } });
    const ar = await act(thana, "archiveRecord", S, "gear", F.gK);
    const cntBefore = await P.customRecord.count({ where: { tenantId: T, parentId: coK } });
    const cr = await act(thana, "createRecord", S, "gear", { parentId: coK, values: { code: `HIJACK-${rand}` } });
    const cntAfter = await P.customRecord.count({ where: { tenantId: T, parentId: coK } });
    const after = await P.customRecord.findUnique({ where: { id: F.gK ?? "none" } });
    const leak = [u, ar, cr].some((r) => r.msg.includes(SECRET_K));
    chk("C1.9-X1.5", "thana on a krabi record: record page 404 (phuket record 200 — positive control) · updateRecordAction / archiveRecordAction → NOT_FOUND, row unchanged · createRecordAction under the krabi company → VALIDATION|NOT_FOUND, nothing created · no message echoes krabi data",
      pos.status === 200 && a.status === 404 && aNF(u) && aNF(ar) && (aVal(cr) || aNF(cr)) && cntAfter === cntBefore && !!before && after?.updatedAt?.getTime() === before.updatedAt?.getTime() && after?.archivedAt === null && !leak,
      "404 · NF · NF · refused", `pos=${pDesc(pos)} page=${pDesc(a)} upd=${aDesc(u)} arch=${aDesc(ar)} create=${aDesc(cr)} krabiRows ${cntBefore}→${cntAfter} leak=${leak}`);
  }
  {
    const before = await P.customRecord.count({ where: { tenantId: T, parentId: coK } });
    const csv = `code,qty,parentId\nTHIMP1-${rand},1,${coP}\nTHIMP2-${rand},2,${coK}\n`;
    const r = await act(thana, "importRecords", S, "gear", { csv });
    const after = await P.customRecord.count({ where: { tenantId: T, parentId: coK } });
    const mine = await P.customRecord.count({ where: { tenantId: T, parentId: coP, title: `THIMP1-${rand}` } });
    chk("C1.9-X1.6", "importRecordsAction by thana with one phuket row and one krabi-parent row: the phuket row is created, the krabi row is skipped (nothing lands under the krabi company) · no krabi data in the result",
      r.ok && mine === 1 && after === before && !pj(r.v).includes(SECRET_K), "1 created · krabi skipped", `r=${aDesc(r)} phuket=${mine} krabi ${before}→${after}`);
  }
  {
    const m1 = await render(mgr, SET_PAGE, { id: S });
    const m2 = await act(mgr, "createObject", S, { key: "mgrobj", label: "ผู้จัดการ", labelPlural: "ผู้จัดการ", parentType: "NONE", titleFieldKey: "name" });
    const g1 = await render(mgrG, SET_PAGE, { id: S });
    const g2 = await act(mgrG, "createObject", S, { key: "grantobj", label: "ได้สิทธิ์", labelPlural: "ได้สิทธิ์", parentType: "NONE", titleFieldKey: "name" });
    const t1 = await render(thana, SET_PAGE, { id: S });
    const t2 = await act(thana, "createObject", S, { key: "staffobj", label: "พนักงาน", labelPlural: "พนักงาน", parentType: "NONE", titleFieldKey: "name" });
    const r1 = await render(reader, LIST_PAGE, pp(S, "gear"));
    const r2 = await act(reader, "createRecord", S, "gear", { parentId: coP, values: { code: `READER-${rand}` } });
    const rows = (await P.customObject.findMany({ where: { tenantId: T, key: { in: ["mgrobj", "grantobj", "staffobj"] } }, select: { key: true } })).map((x: Any) => x.key);
    const readerRows = await P.customRecord.count({ where: { tenantId: T, title: `READER-${rand}` } });
    chk("C1.9-X1.7", "gates: MANAGER without grant → settings 404 + createObject FORBIDDEN · MANAGER granted crm.object.manage → 200 + created · STAFF thana → settings 404 + FORBIDDEN · reader without crm.record.read → /objects/gear 404 (or empty) + createRecord FORBIDDEN · only \"grantobj\" exists",
      m1.status === 404 && aForb(m2) && g1.status === 200 && g2.ok && t1.status === 404 && aForb(t2) && (r1.status === 404 || (r1.status === 200 && hasNone(r1.text, Object.values(titles)))) && aForb(r2) &&
      rows.join(",") === "grantobj" && readerRows === 0,
      "gated", `mgr=${pDesc(m1)}/${aDesc(m2)} granted=${pDesc(g1)}/${aDesc(g2)} thana=${pDesc(t1)}/${aDesc(t2)} reader=${pDesc(r1)}/${aDesc(r2)} rows=${rows.join(",") || "-"}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X8 — sensitive values · sensitive title
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X8 · PDPA (D8) ──");
  {
    const svc = await OBJ.records?.get?.(cS, oA, "gear", F.gA).catch(() => null);
    const pos = pj(svc?.values ?? {}).includes(SENS);
    const a = await render(thana, REC_PAGE, pp(S, "gear", F.gA));
    const b = await render(thana, LIST_PAGE, pp(S, "gear"));
    chk("C1.9-X8.1", "a sensitive field value never reaches a STAFF page: thana's record page and list page of gear contain no serial value — [positive control] the service returns it to the OWNER",
      pos && a.status === 200 && b.status === 200 && !a.text.includes(SENS) && !b.text.includes(SENS) && !a.els.some((e) => pj(e.props).includes(SENS)),
      "hidden from STAFF", `ownerSvc=${pos} rec=${pDesc(a)} leakRec=${a.text.includes(SENS)} list=${pDesc(b)} leakList=${b.text.includes(SENS)}`);
  }
  {
    const r = await act(owner, "updateObject", S, "gear", { titleFieldKey: "serial" });
    const row = await P.customObject.findFirst({ where: { tenantId: T, systemId: S, key: "gear" } });
    chk("C1.9-X8.2", "updateObjectAction titleFieldKey → a sensitive field is refused (VALIDATION, Thai) — the title field stays \"code\"",
      aVal(r) && thai(r.msg) && row?.titleFieldKey === "code", "VALIDATION", `${aDesc(r)} title=${row?.titleFieldKey}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X6 — dangerous input: key format · reserved keys · import caps
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X6 · input ──");
  const tryKey = async (key: string) => {
    const r = await act(owner, "createObject", S, { key, label: `คีย์ ${key.slice(0, 10)}`, labelPlural: `คีย์ ${key.slice(0, 10)}`, parentType: "NONE", titleFieldKey: "name" });
    const n = key ? await P.customObject.count({ where: { tenantId: T, systemId: S, key } }) : 0;
    return { key, r, n };
  };
  {
    const bad = await Promise.all(["Car", "1car", "car-x", "car x", "รถ", ""].map(tryKey));
    const reserved = [] as { key: string; r: AR; n: number }[];
    for (const k of ["customer", "contact", "company", "deal"]) reserved.push(await tryKey(k));
    chk("C1.9-X6.1", "createObjectAction refuses malformed keys (Car · 1car · car-x · \"car x\" · รถ · empty) with VALIDATION and the reserved keys customer · contact · company · deal (VALIDATION|DUPLICATE) — Thai message, no row",
      bad.every((x) => aVal(x.r) && thai(x.r.msg) && x.n === 0) && reserved.every((x) => !x.r.ok && (aVal(x.r) || x.r.code === "DUPLICATE") && x.n === 0),
      "all refused", [...bad, ...reserved].filter((x) => x.r.ok || x.n > 0 || !(aVal(x.r) || x.r.code === "DUPLICATE")).map((x) => `${x.key || "∅"}=${aDesc(x.r)}/${x.n}`).join(" ") || "-");
  }
  {
    const strict = [] as { key: string; r: AR; n: number }[];
    for (const k of ["carPlate", "a", `k${"x".repeat(31)}`]) strict.push(await tryKey(k));
    const okKey = await tryKey(`ok_key_${rand}`);
    chk("C1.9-X6.2", "brief X6 key format `^[a-z][a-z0-9_]{1,30}$` is enforced by the UI action (stricter than the service's /^[a-z][a-zA-Z0-9_]*$/ ≤ 40): carPlate · a · 32 chars → VALIDATION, no row · `ok_key_<rand>` accepted (see Q1)",
      strict.every((x) => aVal(x.r) && x.n === 0) && okKey.r.ok && okKey.n === 1, "strict", `${strict.map((x) => `${x.key.slice(0, 8)}=${aDesc(x.r)}/${x.n}`).join(" ")} ok=${aDesc(okKey.r)}/${okKey.n}`, "MAJOR");
  }
  {
    const count = async () => P.customRecord.count({ where: { tenantId: T, systemId: S, object: { key: "gear" } } });
    const c0 = await count();
    const rowsCsv = `code,qty,parentId\n${Array.from({ length: MAX_ROWS + 1 }, (_x, i) => `CAP${i}-${rand},1,${coP}`).join("\n")}\n`;
    const r1 = await act(owner, "importRecords", S, "gear", { csv: rowsCsv });
    const c1 = await count();
    const r2 = await act(owner, "importRecords", S, "gear", { csv: `code,qty,parentId\n${"x".repeat(MAX_BYTES)},1,${coP}\n` });
    const c2 = await count();
    const r3 = await act(owner, "importRecords", S, "gear", { csv: `code,nope,parentId\nUNK-${rand},1,${coP}\n` });
    const c3 = await count();
    const r4 = await act(owner, "importRecords", S, "gear", { csv: `code,qty,parentId\nIMP1-${rand},1,${coP}\nIMP2-${rand},2,${coP}\n` });
    const c4 = await count();
    chk("C1.9-X6.3", `importRecordsAction respects the C1.2b caps: ${MAX_ROWS + 1} rows → refused whole file (0 created) · > ${MAX_BYTES} bytes → refused · unknown column → refused · [positive control] 2 valid rows → 2 created`,
      !r1.ok && c1 === c0 && !r2.ok && c2 === c0 && !r3.ok && c3 === c0 && thai(r1.msg) && thai(r2.msg) && r4.ok && c4 === c0 + 2,
      "caps", `rows=${aDesc(r1)} Δ${c1 - c0} bytes=${aDesc(r2)} Δ${c2 - c0} unknown=${aDesc(r3)} Δ${c3 - c0} valid=${aDesc(r4)} Δ${c4 - c0}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X3 — parallel writes through the UI actions (independent request scopes · prisma pool connections)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X3 · races ──");
  {
    const o0 = await P.customObject.findFirst({ where: { tenantId: T, systemId: S, key: "gear" } });
    const n0 = await P.customRecord.count({ where: { tenantId: T, systemId: S, objectId: o0?.id ?? "none" } });
    const rs = await Promise.all(Array.from({ length: 10 }, (_x, i) => act(owner, "createRecord", S, "gear", { parentId: coP, values: { code: `PAR${i}-${rand}`, qty: i } })));
    const o1 = await P.customObject.findFirst({ where: { tenantId: T, systemId: S, key: "gear" } });
    const n1 = await P.customRecord.count({ where: { tenantId: T, systemId: S, objectId: o0?.id ?? "none" } });
    const live = await P.customRecord.count({ where: { tenantId: T, systemId: S, objectId: o0?.id ?? "none", archivedAt: null } });
    chk("C1.9-X3.1", "10 parallel createRecordAction → 10 rows and recordCount = live rows exactly (single-statement counter under the UI path)",
      rs.every((r) => r.ok) && n1 === n0 + 10 && o1?.recordCount === live, "+10 · exact", `ok=${rs.filter((r) => r.ok).length}/10 rows ${n0}→${n1} count=${o1?.recordCount} live=${live} ${rs.find((r) => !r.ok) ? aDesc(rs.find((r) => !r.ok)!) : ""}`);
  }
  {
    const key = `race_${rand}`;
    const rs = await Promise.all(Array.from({ length: 10 }, () => act(owner, "createObject", S, { key, label: "แข่ง", labelPlural: "แข่ง", parentType: "NONE", titleFieldKey: "name" })));
    const n = await P.customObject.count({ where: { tenantId: T, systemId: S, key } });
    const losers = rs.filter((r) => !r.ok);
    chk("C1.9-X3.2", "10 parallel createObjectAction with the same key → exactly 1 object · 9 losers get DUPLICATE with a Thai message (never a raw P2002)",
      n === 1 && rs.filter((r) => r.ok).length === 1 && losers.length === 9 && losers.every((r) => r.code === "DUPLICATE" && thai(r.msg)), "1 row · 9 DUPLICATE",
      `rows=${n} ok=${rs.filter((r) => r.ok).length} losers=${[...new Set(losers.map((r) => r.code))].join(",")} ${losers[0] ? cut(losers[0].msg, 80) : ""}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S7.2 — rename rules through the UI (C1.2b rulings: blocked by records · blocked by LOOKUP refs)
  // ═════════════════════════════════════════════════════════════════════════════
  {
    const a = await act(owner, "updateObject", S, "gear", { key: "gear2" });
    const b = await act(owner, "updateObject", S, "lktarget", { key: "lktarget2" });
    const keys = (await P.customObject.findMany({ where: { tenantId: T, systemId: S, key: { in: ["gear", "gear2", "lktarget", "lktarget2"] } }, select: { key: true } })).map((x: Any) => x.key).sort();
    const race = `race_${rand}`;
    const c = await act(owner, "updateObject", S, race, { key: `raced_${rand}` });
    const cRow = await P.customObject.count({ where: { tenantId: T, systemId: S, key: `raced_${rand}` } });
    chk("C1.9-S7.2", "updateObjectAction rename: an object with records (gear) → VALIDATION · an object referenced by a LOOKUP field (lktarget ← gear.linkTo) → VALIDATION · keys unchanged · [positive control] an empty, unreferenced object renames fine",
      aVal(a) && thai(a.msg) && aVal(b) && thai(b.msg) && keys.join(",") === "gear,lktarget" && c.ok && cRow === 1,
      "2 refused · 1 renamed", `gear=${aDesc(a)} lookup=${aDesc(b)} keys=${keys.join(",")} empty=${aDesc(c)}/${cRow}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 + X9 — archive / restore (typed key + reason) (CRM-RUN S3 · 2)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3 · archive / restore ──");
  const isArchived = async (key: string) => !!(await P.customObject.findFirst({ where: { tenantId: T, systemId: S, key } }))?.archivedAt;
  let s31 = false;
  {
    const r0 = await act(owner, "archiveObject", S, "car", {});
    const a0 = await isArchived("car");
    const r1 = await act(owner, "archiveObject", S, "car", { confirmKey: "cars", reason: "เลิกใช้วัตถุรถชั่วคราว" });
    const a1 = await isArchived("car");
    const r2 = await act(owner, "archiveObject", S, "car", { confirmKey: "car", reason: "สั้น" });
    const a2 = await isArchived("car");
    const r3 = await act(owner, "archiveObject", S, "car", { confirmKey: "car", reason: "เลิกใช้วัตถุรถชั่วคราว" });
    const a3 = await isArchived("car");
    const list = await render(owner, LIST_PAGE, pp(S, "car"));
    const rec = await render(owner, REC_PAGE, pp(S, "car", carRecs[0] ?? "none"));
    const co = await render(owner, CO_360, { id: S, companyId: coP });
    const cr = await act(owner, "createRecord", S, "car", { parentId: coP, values: { plate: `NEW-${rand}` } });
    const liveRecs = await P.customRecord.count({ where: { tenantId: T, systemId: S, object: { key: "car" }, archivedAt: null } });
    s31 = r3.ok && a3;
    chk("C1.9-S3.1", "archiveObjectAction on \"car\" (2 records): no confirmation → CONFIRM_REQUIRED · wrong key → refused · reason < 5 chars → refused · key + reason → archived ⇒ /objects/car 404 · record page 404 · company 360 has no obj-car tab (obj-gear still there) · createRecordAction NOT_FOUND · the 2 records are kept (not archived)",
      r0.code === "CONFIRM_REQUIRED" && !a0 && !r1.ok && !a1 && !r2.ok && !a2 && r3.ok && a3 && list.status === 404 && rec.status === 404 && co.status === 200 && !tabEl(co, "car") && !!tabEl(co, "gear") && aNF(cr) && liveRecs === 2,
      "guarded archive", `none=${aDesc(r0)} wrongKey=${aDesc(r1)} short=${aDesc(r2)} ok=${aDesc(r3)} list=${pDesc(list)} rec=${pDesc(rec)} tab=${!!tabEl(co, "car")} create=${aDesc(cr)} live=${liveRecs}`);
  }
  {
    const r = await act(owner, "restoreObject", S, "car");
    const a = await isArchived("car");
    const co = await render(owner, CO_360, { id: S, companyId: coP });
    const list = await render(owner, LIST_PAGE, pp(S, "car"));
    const o = await P.customObject.findFirst({ where: { tenantId: T, systemId: S, key: "car" } });
    chk("C1.9-S3.2", "restoreObjectAction brings everything back: object active · company 360 tab obj-car (2) · /objects/car 200 with both titles · recordCount 2",
      s31 && r.ok && !a && tabShows(co, "car", "รถ", 2) && list.status === 200 && hasAll(list.text, [`กข-${rand}-1`, `ฮอ-${rand}-2`]) && o?.recordCount === 2,
      "restored", `archivedBefore=${s31} restore=${aDesc(r)} archived=${a} tab=${!!tabEl(co, "car")} list=${pDesc(list)} count=${o?.recordCount}`);
  }
  const raceObj = (await P.customObject.findFirst({ where: { tenantId: T, systemId: S, key: { in: [`raced_${rand}`, `race_${rand}`] } } })) as Any;
  {
    const e = raceObj ? await act(owner, "archiveObject", S, String(raceObj.key), {}) : null;
    const ea = raceObj ? await isArchived(String(raceObj.key)) : false;
    const carId = (await P.customObject.findFirst({ where: { tenantId: T, systemId: S, key: "car" } }))?.id ?? "none";
    const arch = await P.auditLog.findFirst({ where: { tenantId: T, action: "crm.object.archive", targetId: carId } });
    const reasonOk = pj(arch?.after ?? {}).includes("เลิกใช้วัตถุรถชั่วคราว");
    chk("C1.9-X9.1", "X9: an EMPTY object (the X3 race object, 0 records) archives without confirmation · the archive of \"car\" (with records) wrote an audit row crm.object.archive carrying the typed reason",
      !!e?.ok && ea && !!arch && reasonOk, "empty free · audit+reason", `empty=${e ? aDesc(e) : "no race object"}/${ea} audit=${!!arch} reason=${reasonOk}`, "MAJOR");
  }
  {
    const par = await P.customRecord.findFirst({ where: { tenantId: T, systemId: S, title: `PAR0-${rand}` } });
    const ar = par ? await act(owner, "archiveRecord", S, "gear", par.id) : null;
    const carId = (await P.customObject.findFirst({ where: { tenantId: T, systemId: S, key: "car" } }))?.id ?? "none";
    const want: [string, string][] = [
      ["crm.object.create", carId], ["crm.object.archive", carId], ["crm.object.restore", carId], ["crm.object.update", String(raceObj?.id ?? "none")],
      ["crm.record.create", carRecs[0] ?? "none"], ["crm.record.update", F.gA ?? "none"], ["crm.record.archive", String(par?.id ?? "none")],
    ];
    const missing: string[] = [];
    for (const [action, targetId] of want) {
      const n = await P.auditLog.count({ where: { tenantId: T, action, targetId, actorId: owner.userId } });
      if (n === 0) missing.push(action);
    }
    chk("C1.9-X9.2", "every UI mutation leaves an audit row whose actor is the session user, on the row the UI touched: car create · archive · restore · race rename (update) · car record create · ALPHA record update · PAR0 record archive",
      !!ar?.ok && missing.length === 0, "7 audit rows", `archiveRecord=${ar ? aDesc(ar) : "-"} missing=${missing.join(",") || "-"}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S6 — uiVersion 1 (PERMANENT RULE): no objects pages, no actions, member pages unchanged — + a positive control
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S6 · uiVersion 1 ──");
  {
    const a = await render(ownerV, SET_PAGE, { id: SV });
    const b = await render(ownerV, LIST_PAGE, pp(SV, "pets"));
    const c = await render(ownerV, REC_PAGE, pp(SV, "pets", recV));
    chk("C1.9-S6.1", "a v1 CRM (settings.crm.uiVersion 1): /settings/objects · /objects/pets · /objects/pets/<id> → 404 for its OWNER (the object and record exist)",
      [a, b, c].every((r) => r.status === 404), "3× 404", [a, b, c].map(pDesc).join(" "));
  }
  {
    const snap = async () => ({
      objs: await P.customObject.count({ where: { tenantId: TV } }),
      recs: await P.customRecord.count({ where: { tenantId: TV } }),
      secs: await P.memberSection.count({ where: { tenantId: TV, systemId: SV } }),
      flds: await P.memberField.count({ where: { tenantId: TV, systemId: SV } }),
      views: await P.memberSavedView.count({ where: { tenantId: TV } }),
      rec: pj(await P.customRecord.findUnique({ where: { id: recV } })),
      obj: pj(await P.customObject.findUnique({ where: { id: objV } })),
    });
    const s0 = await snap();
    const rs: [string, AR][] = [
      ["createObject", await act(ownerV, "createObject", SV, { key: "vobj", label: "วี", labelPlural: "วี", parentType: "NONE", titleFieldKey: "name" })],
      ["updateObject", await act(ownerV, "updateObject", SV, "pets", { label: "เปลี่ยน" })],
      ["createSection", await act(ownerV, "createSection", { systemId: SV, objectKey: "pets", key: "vsec", label: "ส่วน" })],
      ["createField", await act(ownerV, "createField", { systemId: SV, objectKey: "pets", sectionId: "none", key: "vf", label: "ฟิลด์", type: "TEXT" })],
      ["createRecord", await act(ownerV, "createRecord", SV, "pets", { parentId: custV, values: { pname: "x" } })],
      ["updateRecord", await act(ownerV, "updateRecord", SV, "pets", recV, { title: "เปลี่ยน" })],
      ["archiveRecord", await act(ownerV, "archiveRecord", SV, "pets", recV)],
      ["importRecords", await act(ownerV, "importRecords", SV, "pets", { csv: `pname,parentId\nX,${custV}\n` })],
      ["saveView", await act(ownerV, "saveView", SV, "pets", { name: "วี", filters: {} })],
      ["archiveObject", await act(ownerV, "archiveObject", SV, "pets", { confirmKey: "pets", reason: "ทดสอบรุ่นหนึ่ง" })],
      ["restoreObject", await act(ownerV, "restoreObject", SV, "pets")],
    ];
    const s1 = await snap();
    const bad = rs.filter(([, r]) => !aForb(r) || !thai(r.msg));
    chk("C1.9-S6.2", "every C1.9 action on a v1 CRM → FORBIDDEN (CrmV2DisabledError, Thai) and the database is unchanged (objects · records · sections · fields · saved views · the record and object rows byte-equal)",
      bad.length === 0 && pj(s0) === pj(s1), "11× FORBIDDEN · no write", `bad=${bad.map(([n, r]) => `${n}=${aDesc(r)}`).join(" ") || "-"} changed=${pj(s0) !== pj(s1)}`);
  }
  {
    const m = await render(ownerV, MEM_360_PAGE, { id: MV, memberId: custV });
    const mf = await render(ownerV, MEM_FIELDS_PAGE, { id: MV });
    const fd = mf.els.find((e) => e.name === "FieldDesigner");
    const keys = fd ? Object.keys(fd.props).filter((k) => fd.props[k] !== undefined).sort().join(",") : "";
    chk("C1.9-S6.3", "member pages unchanged on a v1 tenant: member 360 has no obj- tab and no record title (although a CUSTOMER object with showAsTab + a record exists) · the member field page passes exactly the baseline FieldDesigner props (initialSections,systemId,templates)",
      m.status === 200 && !tabEl(m, "pets") && !m.text.includes(`PET-${rand}`) && !m.els.some((e) => /[?&]tab=obj-/.test(String(e.props?.href ?? ""))) && mf.status === 200 && keys === "initialSections,systemId,templates",
      "unchanged", `360=${pDesc(m)} tab=${!!tabEl(m, "pets")} title=${m.text.includes(`PET-${rand}`)} fields=${pDesc(mf)} props=${keys || "-"}`);
  }
  {
    await P.appSystem.update({ where: { id: SV }, data: { settings: { crm: { uiVersion: 2 } } } });
    let m: PR = { status: 0, text: "", els: [], err: "" };
    let l: PR = { status: 0, text: "", els: [], err: "" };
    try {
      m = await render(ownerV, MEM_360_PAGE, { id: MV, memberId: custV });
      l = await render(ownerV, LIST_PAGE, pp(SV, "pets"));
    } finally {
      await P.appSystem.update({ where: { id: SV }, data: { settings: { crm: { uiVersion: 1 } } } });
    }
    chk("C1.9-S6.4", "[positive control for S6.1/S6.3] the same tenant flipped to uiVersion 2 → member 360 shows tab obj-pets (1) and /objects/pets is 200 with PET — so the v1 404s and the missing tab are the gate, not a broken page (flag restored to 1)",
      tabShows(m, "pets", "สัตว์เลี้ยง", 1) && l.status === 200 && l.text.includes(`PET-${rand}`), "tab + 200", `360=${pDesc(m)} tab=${!!tabEl(m, "pets")} list=${pDesc(l)}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 — testids · inventory · client safety · gates (CRM-RUN S5 · 4) [static]
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S5 · static ──");
  const ownedTsx = [...walkFiles(SET_DIR), ...walkFiles(OBJ_DIR), ...walkFiles(COMP_DIR)].filter((f) => f.endsWith(".tsx"));
  const fdSrc = read(FD_FILE);
  {
    const miss = ownedTsx.flatMap((f) => tagsWithoutTestid(read(f)).map((t) => `${f.split("/").slice(-2).join("/")}: ${t}`));
    const fdBase = git(`${BASE_COMMIT}:${FD_FILE}`);
    const newFdTids = [...fdSrc.matchAll(/data-testid=\{?[`"']([^`"']+)[`"']/g)].map((m) => m[1]).filter((t) => !fdBase.includes(t));
    chk("C1.9-S5.1", "every button/input/select/textarea/link/form in the owned C1.9 files has a data-testid · the FieldDesigner's new object switcher has one too (a new testid containing \"object\") [static]",
      ownedTsx.length >= 3 && miss.length === 0 && newFdTids.some((t) => /object/i.test(t)), "all tagged",
      `files=${ownedTsx.length} untagged=${miss.length} ${miss.slice(0, 3).join(" ; ")} fdNew=${newFdTids.join(",") || "-"}`, "MAJOR");
  }
  {
    const inv = JSON.parse(read("scripts/crm-ui-inventory.json") || "{}") as Any;
    const rows = ((inv?.rows ?? []) as Any[]);
    const setRows = rows.filter((r) => /^\/settings\/objects/.test(String(r?.page ?? "")));
    const listRows = rows.filter((r) => /^\/objects\/\[[^\]]+\]$/.test(String(r?.page ?? "")));
    const recRows = rows.filter((r) => /^\/objects\/\[[^\]]+\]\/\[[^\]]+\]$/.test(String(r?.page ?? "")));
    const src = ownedSrc + fdSrc;
    const ghost = [...setRows, ...listRows, ...recRows].filter((r) => { const t = String(r?.testid ?? " "); return !src.includes(t.endsWith("*") ? t.slice(0, -1) : t); }).map((r) => r?.testid);
    const woOk = [...setRows, ...listRows, ...recRows].every((r) => r?.wo === "C1.9");
    chk("C1.9-S5.2", "D8 inventory: scripts/crm-ui-inventory.json has rows (wo C1.9) for /settings/objects (≥ 10) · /objects/[key] (≥ 4) · /objects/[key]/[recordId] (≥ 2), each testid present in the owned sources (no ghost row) [static]",
      setRows.length >= 10 && listRows.length >= 4 && recRows.length >= 2 && ghost.length === 0 && woOk, "rows", `settings=${setRows.length} list=${listRows.length} record=${recRows.length} ghost=${ghost.slice(0, 4).join(",") || "-"} wo=${woOk}`, "MINOR");
  }
  {
    const clientFiles = [...walkFiles(SET_DIR), ...walkFiles(OBJ_DIR), ...walkFiles(COMP_DIR), FD_FILE]
      .filter((f) => /^\s*["']use client["']/m.test(read(f).split("\n").filter((l) => !/^\s*\/\//.test(l)).slice(0, 6).join("\n")));
    const bad = clientFiles.map((f) => reachesPrisma(f)).filter(Boolean);
    const ctlBad = reachesPrisma("src/lib/modules/crm/objects.ts");
    const ctlGood = reachesPrisma("src/lib/modules/crm/objects-shared.ts");
    chk("C1.9-S5.3", "'use client' files of C1.9 (+ FieldDesigner.tsx) never reach prisma through value imports (\"use server\" files are the boundary) — [resolver control] objects.ts reaches it, objects-shared.ts does not [static]",
      clientFiles.length >= 2 && bad.length === 0 && !!ctlBad && !ctlGood, "client-safe", `client=${clientFiles.length} bad=${bad.slice(0, 2).join(" ; ") || "-"} control=${!!ctlBad}/${!ctlGood}`, "MAJOR");
  }
  {
    const setSrc = read(SET_PAGE);
    const listSrc = read(LIST_PAGE);
    const recSrc = read(REC_PAGE);
    const gate = (s: string, key: RegExp) => /type:\s*["']CRM["']/.test(s) && /await\s+requireCrmV2Page\s*\(/.test(s) && key.test(s) && /\bnotFound\s*\(/.test(s);
    const actBad = ACTION_FILES.filter((f) => { const s = read(f); return !/await\s+assertCrmV2\s*\(/.test(s) || !/CrmV2DisabledError/.test(s) || !/requireTenant\s*\(/.test(s); });
    const nav = read(NAV_FILE);
    const navReady = /["']\/crm\/settings\/objects["'][^}]*status:\s*["']ready["']/.test(nav);
    const lay = read("src/app/app/layout.tsx");
    const crmCase = /case "CRM":\s*return \[([\s\S]*?)\n\s{8}\];/.exec(lay)?.[1] ?? "";
    const after = crmCase.split("...(crmV2.has(slugOrId)")[1] ?? "";
    const before = crmCase.split("...(crmV2.has(slugOrId)")[0] ?? "";
    const direct = ACTION_FILES.some((f) => /\.(customObject|customRecord|customRecordValue)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/.test(read(f)));
    chk("C1.9-S5.4", "gates [static]: settings page = CRM guard + requireCrmV2Page + crm.object.manage + notFound · list/record pages = CRM guard + requireCrmV2Page + crm.record.read + notFound · every action file: requireTenant + await assertCrmV2 + CrmV2DisabledError mapping, no direct CustomObject/CustomRecord writes · CRM_DEEP_NAV lists /crm/settings/objects \"ready\" · the drawer lists it only after the crmV2 gate",
      gate(setSrc, /crm\.object\.manage/) && gate(listSrc, /crm\.record\.read/) && gate(recSrc, /crm\.record\.read/) && ACTION_FILES.length > 0 && actBad.length === 0 && !direct && navReady && after.includes("/crm/settings/objects") && !before.includes("/crm/settings/objects"),
      "gated + linked", `settings=${gate(setSrc, /crm\.object\.manage/)} list=${gate(listSrc, /crm\.record\.read/)} record=${gate(recSrc, /crm\.record\.read/)} actionsBad=${actBad.join(",") || "-"} direct=${direct} nav=${navReady} drawer=${after.includes("/crm/settings/objects")}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S7.3 — FieldDesigner smallest edit · member page untouched in behaviour [static]
  // ═════════════════════════════════════════════════════════════════════════════
  {
    const base = git(`${BASE_COMMIT}:${FD_FILE}`);
    const cur = fdSrc;
    const curLines = new Map<string, number>();
    for (const l of cur.split("\n")) curLines.set(l, (curLines.get(l) ?? 0) + 1);
    let removed = 0;
    for (const l of base.split("\n")) { const n = curLines.get(l) ?? 0; if (n > 0) curLines.set(l, n - 1); else removed += 1; }
    const imp = /import\s*\{([\s\S]*?)\}\s*from\s*["']@\/lib\/modules\/member\/fields-actions["']/.exec(cur)?.[1] ?? "";
    const allImported = MEMBER_FD_ACTIONS.every((a) => new RegExp(`\\b${a}\\b`).test(imp));
    const calls = MEMBER_FD_ACTIONS.filter((a) => a !== "previewTemplateAction").every((a) => new RegExp(`\\b${a}\\s*\\(\\s*\\{\\s*systemId`).test(cur) || new RegExp(`\\b${a}\\b`).test(cur));
    const optProp = /\bobject\w*\??\s*\?\s*:/i.test(cur) || /\bobject\w*\s*\?:/i.test(cur);
    const mp = read(MEM_FIELDS_PAGE);
    const mpOk = /type:\s*["']MEMBER["']/.test(mp) && /listLayout\s*\(/.test(mp) && /<FieldDesigner[\s\S]*systemId=\{id\}[\s\S]*initialSections=\{sections\}[\s\S]*templates=\{templates\}/.test(mp);
    chk("C1.9-S7.3", `FieldDesigner smallest edit vs ${BASE_COMMIT}: ≤ 15 baseline lines removed · the 11 member actions still imported from member fields-actions and used · the object prop is optional · the member fields page keeps its MEMBER guard + listLayout + the 3 baseline props (regressions: qc-member-m1.3 · m1.2 · m3.9) [static]`,
      base.length > 0 && removed <= 15 && allImported && calls && optProp && mpOk, "smallest edit", `baseline=${base.length > 0} removed=${removed} imported=${allImported} used=${calls} optionalProp=${optProp} memberPage=${mpOk}`, "MAJOR");
  }
} catch (e) {
  chk("C1.9-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — every row of the three throwaway tenants (4 passes over every table with tenantId), systems/units/tenants, sessions, users.
  // No drainOutbox (not tenant-scoped) — our PENDING events go with the tenant sweep. No stored object exists (storage stubbed).
  // ═════════════════════════════════════════════════════════════════════════════
  const ids = TIDS.filter((x) => /^[a-z0-9]+$/i.test(x));
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
      const realStore = STORE_REQ.filter((r) => !r.url.includes(`${TAG}-zone`) && !r.url.includes("qc-c19-cdn.invalid"));
      chk("C1.9-CLEAN", "the oracle gives the QC database back exactly as found — the three throwaway tenants and every row they owned (objects, records, values, fields, saved views, audit, outbox), the throwaway users + sessions are gone · no request ever reached a real storage zone",
        left.length === 0 && tenants === 0 && users === 0 && sessions === 0 && realStore.length === 0, "0 rows · 0 tenants · 0 users · 0 sessions",
        `${left.join(" · ") || "-"} · tenants=${tenants} users=${users} sessions=${sessions} realStore=${realStore.length}`, "MAJOR");
    } catch (e) {
      chk("C1.9-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

void THIS_FILE;
const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C1.9: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
