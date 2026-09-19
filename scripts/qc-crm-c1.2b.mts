// QC — CRM v2 WO C1.2b: the custom objects service (`src/lib/modules/crm/objects.ts` + `objects-shared.ts`
//      + `templates/objects/*`) — objects CRUD · records CRUD · tabsFor · timelineFor · 8 object templates ·
//      events custom.record.created/updated/archived
// Oracle writer (written ONE WORK ORDER AHEAD — C1.2a, the engine this depends on, is built in parallel)
// Builders must NOT touch this file · QC database only (.env.qc)
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c1.2b.mts
// requires: crm-seed
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// SOURCES: crm-brief-C1.2b.md (+ Controller addendum 2026-09-18) · crm-brief-C1.2a.md (+ addendum: FieldCtx.objectKey,
//          non-customer fields are rows of the CRM system) · CRM-RUN §2 "C1.2" objects half · blueprint
//          docs/modules/20-crm-v2.md §5.8 §10 §11.2 · decision C8 · RESOLUTIONS R-A (starter rule = data in C1.2b),
//          R-C.8 (idempotency keys `custom.record.<type>#<recordId>#<seq>`), R-C.12 (the 8 templates), R-E.1.
//
// THE CONTRACT THIS FILE ASSUMES (the builder implements exactly this; tolerated variants are listed in the report)
//   import * as OBJ from "@/lib/modules/crm/objects"
//   ctx   = { tenantId, systemId /* a CRM system of that tenant — re-resolved, never trusted */, actorUserId }
//   actor = { userId, role, unitAccess, permissions }   (MemberActor-compatible; OWNER here)
//   OBJ.create(ctx, actor, { key, label, labelPlural, icon?, parentType, titleFieldKey, showAsTab?, portalVisible?, templateKey?, unitScoped? }) → ObjectDto
//   OBJ.update(ctx, actor, objectKey, patch{ key?, label?, labelPlural?, parentType?, titleFieldKey?, showAsTab?, … }) → ObjectDto
//   OBJ.archive(ctx, actor, objectKey, { confirmKey?, reason? }) → ObjectDto   (records > 0 ⇒ confirmKey === key AND reason ≥ 5 chars)
//   OBJ.restore(ctx, actor, objectKey) → ObjectDto
//   OBJ.reorder(ctx, actor, objectKeys[]) → unknown
//   OBJ.list(ctx, actor, { includeArchived? }?) → ObjectDto[]      OBJ.get(ctx, actor, objectKey) → ObjectDto
//   OBJ.records.create(ctx, actor, objectKey, { parentId?, title?, values?, unitId?, ownerUserId? }) → RecordDto
//   OBJ.records.update(ctx, actor, objectKey, recordId, { title?, values? }) → RecordDto
//   OBJ.records.archive(ctx, actor, objectKey, recordId) → RecordDto
//   OBJ.records.get(ctx, actor, objectKey, recordId) → RecordDto   (values keyed by field key)
//   OBJ.records.list(ctx, actor, objectKey, { parentId?, q?, f?: Record<fieldKey,string>, sort?, page?, pageSize?, includeArchived? }) → { items, total }
//   OBJ.records.move(ctx, actor, objectKey, recordId, newParentId) → RecordDto
//   OBJ.records.bulk(ctx, actor, objectKey, { action: "archive", ids, confirm?, reason? }) → { count }
//   OBJ.records.import(ctx, actor, objectKey, { csv }) → { created, skipped, errors }   (header row = field keys)
//   OBJ.records.export(ctx, actor, objectKey, opts?) → string (CSV, every line built with csvRow)
//   OBJ.tabsFor(ctx, actor, parentType, parentId) → { objectKey, label, labelPlural?, count }[]
//   OBJ.timelineFor(ctx, actor, recordId) → unknown[] | { items }
//   errors carry `.code` ∈ "NOT_FOUND" | "VALIDATION" | "DUPLICATE" | "CONFIRM_REQUIRED" (Thai message, never blames the user)
//   objects-shared.ts (pure, no prisma): OBJECT_TEMPLATES (8) · OBJECT_IMPORT_MAX_ROWS · OBJECT_IMPORT_MAX_BYTES ·
//     OBJECT_BULK_MAX · OBJECT_WARN_AT (30) · RECORD_WARN_AT (200_000)
//   template = { key, label, labelPlural, parentType, titleFieldKey, sections:[{ key, label, fields:[{ key, label, type, … }] }],
//                starterRule: { kind: "DATE_DUE", fieldKey /* a DATE field of the template */, enabled: false, … } }
//   fields of an object are created through the C1.2a engine: member facade `fields.createSection/createField/listLayout`
//     with `{ ...ctx, objectKey }` (R-E.1) — this file uses it exactly like a C1.9 UI would.
//
// WHAT THIS FILE PROVES
//   S0  structure — files exist · shared file is client-safe · engine reached only through the member facade · crm facade exports
//   S1  object "รถ" (parent CONTACT) + 6 field types → layout is exactly those fields, isolated per object/system (CRM-RUN S1)
//   S2  records CRUD · title from titleFieldKey · wrong/missing/foreign parent → VALIDATION · move (CRM-RUN S2)
//   S3  `f.{key}` filters on records: TEXT · NUMBER · DATE · SELECT · LOOKUP · BOOLEAN (CRM-RUN S3, records half)
//   S5  tabsFor(CONTACT/COMPANY, id) — showAsTab objects of that parent type with live counts (CRM-RUN S5)
//   S6  archive object with records ⇒ must type the key · restore brings everything back (CRM-RUN S6)
//   S8  no hard cap: 35 objects → no error, OpsEvent WARN past 30 (CRM-RUN S8)
//   S9  immutability: key / parentType frozen once records exist · reserved/duplicate keys (brief + §11.2)
//   S10 partyId inherited from the parent (CONTACT/COMPANY/CUSTOMER/NONE) · recordCount cache (brief)
//   S11 the 8 templates as data + one disabled "date field due" starter rule each; create-from-template materialises fields (brief + R-A)
//   S12 events: 3 registries · emitted INSIDE the write tx (a rolled-back write leaves no event and vice versa) · keys per R-C.8
//   X1  another tenant · ANOTHER CRM SYSTEM of the same tenant ⇒ not found · foreign/wrong-type parent ⇒ validation · ctx.systemId re-resolved
//   X3  recordCount exact after ≥10 parallel creates + 5 parallel archives (+ 5× the SAME archive) — in-process AND across 4 processes · key race
//   X4  record-created consumer run twice and twice-in-parallel ⇒ ONE parent timeline row · compose "extra" never throws
//   X6  import caps (rows · bytes) · CSV export through csvRow (cells starting = + - @ neutralised) · export scoped to the system
//   X8  outbox payloads carry ids only (no phone / e-mail / name / record title / values) · OpsEvent + console clean
//   X9  archive-with-records and bulk need confirm + reason (≥5) at the service layer · bulk cap · audit rows
//   X2/X5/X7/X10 — n/a: no API key/AI tool (C1.10/C3.4), no cron pick-up, no public endpoint, no files/secrets in this work order.
//
// HOUSE RULES: SKIP guard (no DB connection before it) · chk(id, title, ok, expected, actual, sev) · two THROWAWAY tenants
// `qc-c12b-<rand>` (+ `-b`) swept in `finally` (every table with a tenantId column, 4 FK-safe passes) + the throwaway user ·
// the shared member/CRM QC data is never read or written · last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guard — nothing of C1.2b exists yet ⇒ SKIPPED, no DB connection opened.
// ═══════════════════════════════════════════════════════════════════════════════════
const OBJ_FILE = "src/lib/modules/crm/objects.ts";
const SHARED_FILE = "src/lib/modules/crm/objects-shared.ts";
const TPL_DIR = "src/lib/modules/crm/templates/objects";
if (!existsSync(OBJ_FILE)) {
  console.log(`⚠️  SKIPPED — WO C1.2b not built yet (${OBJ_FILE} missing)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();

const OBJ_SPEC = "@/lib/modules/crm/objects";
const SHARED_SPEC = "@/lib/modules/crm/objects-shared";
const ownerActor = (userId: string) => ({ userId, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> });
const idOf = (r: Any): string =>
  typeof r === "string" ? r : (r?.id ?? r?.record?.id ?? r?.object?.id ?? `?${JSON.stringify(r ?? null).slice(0, 80)}`);

// ═══════════════════════════════════════════════════════════════════════════════════
// X3 WORKER MODE — this same file re-invoked as a child process (C1.2b-X3.4/X3.5).
//   argv: --x3-worker <create|archive> <tenantId> <crmSystemId> <userId> <objectKey> <startAtMs> <arg>
//     create : arg = "<parentId>|<n>|<tag>"   → n parallel records.create
//     archive: arg = "<id1,id2,…>"            → parallel records.archive of every id
//   Own process = own PrismaClient = own pool; all workers wait for the same wall-clock instant.
// ═══════════════════════════════════════════════════════════════════════════════════
const ARGV = process.argv.slice(2);
const WORKER_AT = ARGV.indexOf("--x3-worker");
if (WORKER_AT >= 0) {
  const [mode, wTenant, wSystem, wUser, wKey, wStart, wArg] = ARGV.slice(WORKER_AT + 1);
  const OBJW = (await import(OBJ_SPEC as string)) as Any;
  const ctx = { tenantId: wTenant, systemId: wSystem, actorUserId: wUser };
  const actor = ownerActor(wUser);
  const waitMs = Number(wStart) - Date.now();
  if (waitMs > 0) await new Promise<void>((r) => setTimeout(r, waitMs));
  let out: string[] = [];
  const err = (e: Any) => `ERR:${e instanceof Error ? e.message : String(e)}`;
  if (mode === "create") {
    const [parentId, n, tag] = String(wArg).split("|");
    out = await Promise.all(
      Array.from({ length: Number(n) }, (_x, i) =>
        OBJW.records
          .create(ctx, actor, wKey, { parentId, values: { plate: `${tag}-${process.pid}-${i}` } })
          .then((r: Any) => idOf(r))
          .catch(err),
      ),
    );
  } else {
    const ids = String(wArg).split(",").filter(Boolean);
    out = await Promise.all(ids.map((id) => OBJW.records.archive(ctx, actor, wKey, id).then(() => "OK").catch(err)));
  }
  console.log(`X3WORKER ${JSON.stringify(out)}`);
  const dbw = (await import("@/lib/core/db")) as Any;
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
const cut = (s: string, n = 260) => (s.length > n ? `${s.slice(0, n)}…` : s);
const j = (v: Any): string =>
  JSON.stringify(v, (_k, x) =>
    typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x?.toFixed && x?.s !== undefined ? x.toString() : x,
  );
const thai = (s: unknown) => typeof s === "string" && s.trim().length > 0 && /[ก-๙]/.test(s);
type Res = { ok: boolean; v: Any; err: string; code: string; status: number; msg: string };
/** call anything without letting a missing/throwing function abort the whole file */
const call = async (fn: Any, ...args: Any[]): Promise<Res> => {
  if (typeof fn !== "function") return { ok: false, v: undefined, err: "MISSING_FUNCTION", code: "MISSING_FUNCTION", status: 0, msg: "" };
  try {
    return { ok: true, v: await fn(...args), err: "", code: "", status: 0, msg: "" };
  } catch (e) {
    const x = e as Any;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, v: undefined, err: `${x?.name ?? "Error"}(${x?.code ?? "-"}): ${msg}`, code: String(x?.code ?? ""), status: Number(x?.status ?? 0), msg };
  }
};
const isNotFound = (r: Res) => !r.ok && (r.code === "NOT_FOUND" || r.status === 404);
const isValidation = (r: Res) => !r.ok && (r.code === "VALIDATION" || r.code === "BAD_INPUT" || r.status === 400);
const isRefused = (r: Res) => !r.ok && r.code !== "MISSING_FUNCTION" && ["VALIDATION", "BAD_INPUT", "CONFIRM_REQUIRED", "DUPLICATE", "CONFLICT"].includes(r.code);
const itemsOf = (r: Any): Any[] => (Array.isArray(r) ? r : (r?.items ?? r?.rows ?? r?.records ?? []));
const keyOfObj = (o: Any): string => String(o?.objectKey ?? o?.key ?? "");
/** Bangkok calendar date of a DATE value, whatever shape the DTO uses */
const ymd = (v: Any): string => {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = v instanceof Date ? v : typeof v === "string" ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return `?${String(v)}`;
  return new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
};
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

// ─────────────────────────── state ───────────────────────────
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c12b-${rand}`;
const TRIG = `qc_c12b_${rand}`;
// PDPA sentinels (X8) — must never show up in an outbox payload / OpsEvent / console line
const SENT_PHONE = `08${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;
const SENT_EMAIL = `${TAG}-contact@qc.local`;
const SENT_NAME = `นางสาวทดสอบ ${rand}ชื่อจริง`;
const SENT_TITLE = `ด.ญ.ผู้เรียน${rand}`;
const FOREIGN_TITLE = `ความลับร้านอื่น-${rand}`;
const T0 = new Date(Date.now() - 1000);
let tidA = "";
let tidB = "";
let userA = "";
let TENANTS: string[] = [];

// evidence recorder (X8): console + OpsEvent + outbox rows of our tenants produced during a watched call
type Evidence = { label: string; logs: string[]; ops: Any[]; outbox: Any[] };
const EVIDENCE: Evidence[] = [];
async function watch<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = new Date(Date.now() - 200);
  const logs: string[] = [];
  const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  const cap = (k: keyof typeof orig) => (...a: Any[]) => {
    logs.push(a.map((x) => (typeof x === "string" ? x : j(x))).join(" "));
    orig[k](...a);
  };
  console.log = cap("log"); console.warn = cap("warn"); console.error = cap("error"); console.info = cap("info");
  try {
    return await fn();
  } finally {
    console.log = orig.log; console.warn = orig.warn; console.error = orig.error; console.info = orig.info;
    const where = { tenantId: { in: TENANTS }, createdAt: { gte: t0 } };
    const ops = TENANTS.length ? await P.opsEvent.findMany({ where }).catch(() => []) : [];
    const outbox = TENANTS.length ? await P.outboxEvent.findMany({ where }).catch(() => []) : [];
    EVIDENCE.push({ label, logs, ops, outbox });
  }
}

const dropTrigger = async () => {
  await P.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRIG} ON "OutboxEvent"`).catch(() => 0);
  await P.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${TRIG}_fn()`).catch(() => 0);
};

console.log(`\n═══ QC CRM v2 · C1.2b — custom objects service ═══`);
console.log(`[env] DB ${host} · tag ${TAG}\n`);

try {
  // stale triggers from a run that was killed mid-way (they only ever fired for a deleted tenant — harmless, but tidy up)
  {
    const stale = (await P.$queryRawUnsafe(`SELECT tgname FROM pg_trigger WHERE tgname LIKE 'qc_c12b_%'`).catch(() => [])) as Any[];
    for (const s of stale) {
      const n = String(s.tgname);
      if (/^qc_c12b_[a-z]+$/.test(n)) {
        await P.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${n} ON "OutboxEvent"`).catch(() => 0);
        await P.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${n}_fn()`).catch(() => 0);
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — structure
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S0 · structure ──");
  const objSrc = read(OBJ_FILE);
  const sharedSrc = read(SHARED_FILE);
  const tplFiles = existsSync(TPL_DIR) ? readdirSync(TPL_DIR).filter((f) => /\.(ts|json)$/.test(f)) : [];
  chk("C1.2b-S0.1", "the deliverable files exist: objects.ts · objects-shared.ts · templates/objects/* (template data lives in its own folder, not inline in the service)",
    existsSync(SHARED_FILE) && tplFiles.length > 0, "3 locations", `shared=${existsSync(SHARED_FILE)} templates=${tplFiles.length}`, "MAJOR");
  chk("C1.2b-S0.2", "objects-shared.ts is client-safe (C1.9 UI imports it from 'use client' files): no prisma / core db / server-only import",
    sharedSrc.length > 0 && !/from\s+["'](@prisma\/client|@\/lib\/core\/db|server-only|next\/headers)["']/.test(sharedSrc) && !/from\s+["']\.\/objects["']/.test(sharedSrc),
    "no server import", cut(sharedSrc.match(/from\s+["'][^"']+["']/g)?.join(" ") ?? "-"), "MAJOR");
  chk("C1.2b-S0.3", "the service reaches the field engine ONLY through the member facade (`@/lib/modules/member` → `fields` namespace), never `member/fields` directly — no second engine, no deep import (addendum)",
    /from\s+["']@\/lib\/modules\/member["']/.test(objSrc) && !/@\/lib\/modules\/member\/(fields|field-types)["']/.test(objSrc) && !/from\s+["']\.\.\/member\//.test(objSrc),
    "facade import only", cut(objSrc.match(/from\s+["'][^"']*member[^"']*["']/g)?.join(" ") ?? "-"), "MAJOR");
  chk("C1.2b-S0.4", "CSV export is built with the shared `csvRow` of @/lib/core/csv (no second CSV engine — MASTER-PLAN §2.8) [static]",
    /import\s*\{[^}]*\bcsvRow\b[^}]*\}\s*from\s*["']@\/lib\/core\/csv["']/.test(objSrc), "import { csvRow } from core/csv", "-", "MAJOR");
  chk("C1.2b-S0.5", "recordCount is only ever changed with a single-statement increment/decrement (addendum · X3) [static]",
    /recordCount\s*:\s*\{\s*(increment|decrement)/.test(objSrc) || /"recordCount"\s*=\s*"recordCount"\s*[+-]/.test(objSrc),
    "increment/decrement", "-", "MINOR");

  const OBJ = (await import(OBJ_SPEC as string)) as Any;
  const SH = (await import(SHARED_SPEC as string).catch(() => null)) as Any;
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => null)) as Any;
  const MEM = (await import("@/lib/modules/member" as string)) as Any;
  const F = (MEM?.fields ?? null) as Any;
  const R = (OBJ?.records ?? {}) as Any;
  {
    const want = ["create", "update", "archive", "restore", "reorder", "list", "get", "tabsFor", "timelineFor"];
    const wantR = ["create", "update", "archive", "get", "list", "move", "bulk", "import", "export"];
    const miss = [...want.filter((k) => typeof OBJ?.[k] !== "function"), ...wantR.filter((k) => typeof R?.[k] !== "function").map((k) => `records.${k}`)];
    chk("C1.2b-S0.6", "objects.ts exports the §5.8 surface: create/update/archive/restore/reorder/list/get · records.{create,update,archive,get,list,move,bulk,import,export} · tabsFor · timelineFor",
      miss.length === 0, "all present", miss.join(",") || "-");
    const facadeOk = typeof CRM?.objects?.records?.create === "function" && typeof CRM?.objects?.tabsFor === "function";
    chk("C1.2b-S0.7", "the crm facade (`@/lib/modules/crm` index.ts) exposes the service as `objects` (C1.3/C1.4/C1.9 reach it through the facade)",
      facadeOk, "CRM.objects.records.create + CRM.objects.tabsFor", `objects=${typeof CRM?.objects}`, "MAJOR");
    chk("C1.2b-S0.8", "[prerequisite C1.2a] the member facade exposes the field engine as a `fields` namespace (createSection/createField/listLayout) — without it every S1/S3 check below is red for C1.2a's reason, not C1.2b's",
      typeof F?.createField === "function" && typeof F?.createSection === "function" && typeof F?.listLayout === "function",
      "fields namespace", `fields=${typeof F}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — tenant A (subject: CRM systems crmA · crmA2 · crmA3 · crmTpl + MEMBER memA) · tenant B (foreign)
  // ═════════════════════════════════════════════════════════════════════════════
  const sysSvc = (await import("@/lib/modules/system/service")) as Any;
  const tA = await P.tenant.create({ data: { name: TAG, slug: TAG } });
  tidA = tA.id;
  const tB = await P.tenant.create({ data: { name: `${TAG}-b`, slug: `${TAG}-b` } });
  tidB = tB.id;
  TENANTS = [tidA, tidB];
  const u = await P.user.create({ data: { email: `${TAG}@qc.invalid`, name: `QC ${TAG}` } });
  userA = u.id;
  await P.membership.create({ data: { userId: userA, tenantId: tidA, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  await P.membership.create({ data: { userId: userA, tenantId: tidB, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const unit1 = await P.businessUnit.create({ data: { tenantId: tidA, type: "SHOP", name: "สาขา 1", slug: `${TAG}-u1` } });
  const unit2 = await P.businessUnit.create({ data: { tenantId: tidA, type: "SHOP", name: "สาขา 2", slug: `${TAG}-u2` } });
  const mk = async (tid: string, type: string, label: string) => (await sysSvc.createSystem(tid, type, `${label} ${TAG}`)).id as string;
  const crmA = await mk(tidA, "CRM", "CRM");
  // ORACLE-EDIT C1.2b-X4.x (controller · C1.8): the custom.record.created timeline extra runs only for uiVersion-2 systems (C1.2b ruling 7)
  await P.appSystem.update({ where: { id: crmA }, data: { settings: { crm: { uiVersion: 2, bridgesEnabled: true } } } });
  const crmA2 = await mk(tidA, "CRM", "CRM สอง");
  const crmA3 = await mk(tidA, "CRM", "CRM สาม");
  const crmTpl = await mk(tidA, "CRM", "CRM เทมเพลต");
  const memA = await mk(tidA, "MEMBER", "สมาชิก");
  const crmB = await mk(tidB, "CRM", "CRM-B");
  const actor = ownerActor(userA);
  const cA = { tenantId: tidA, systemId: crmA, actorUserId: userA };
  const cA2 = { tenantId: tidA, systemId: crmA2, actorUserId: userA };
  const cA3 = { tenantId: tidA, systemId: crmA3, actorUserId: userA };
  const cTpl = { tenantId: tidA, systemId: crmTpl, actorUserId: userA };
  const cB = { tenantId: tidB, systemId: crmB, actorUserId: userA };
  const fctx = (c: Any, objectKey: string) => ({ ...c, objectKey });

  const mkParty = async (tid: string, name: string, kind = "PERSON", extra: Record<string, Any> = {}) =>
    (await P.party.create({ data: { tenantId: tid, name, kind, ...extra } })).id as string;
  const mkContact = async (tid: string, sys: string, name: string, extra: Record<string, Any> = {}) => {
    const partyId = await mkParty(tid, name, "PERSON", extra.phone ? { phone: extra.phone, email: extra.email ?? null } : {});
    const row = await P.crmContact.create({ data: { tenantId: tid, systemId: sys, name, partyId, ...extra } });
    return { id: row.id as string, partyId };
  };
  const mkCompany = async (tid: string, sys: string, name: string) => {
    const partyId = await mkParty(tid, name, "COMPANY");
    const row = await P.crmCompany.create({ data: { tenantId: tid, systemId: sys, name, partyId } });
    return { id: row.id as string, partyId };
  };
  const custParty = await mkParty(tidA, `สมาชิก ${TAG}`);
  const cust = await P.customer.create({ data: { tenantId: tidA, memberSystemId: memA, name: `สมาชิก ${TAG}`, partyId: custParty } });
  const c1 = await mkContact(tidA, crmA, `ผู้ติดต่อหนึ่ง ${TAG}`);
  const c2 = await mkContact(tidA, crmA, `ผู้ติดต่อสอง ${TAG}`);
  const cF = await mkContact(tidA, crmA, `ผู้ติดต่อกรอง ${TAG}`);
  const cT = await mkContact(tidA, crmA, `ผู้ติดต่อแท็บ ${TAG}`);
  const cX = await mkContact(tidA, crmA, `ผู้ติดต่อแข่ง ${TAG}`);
  const cPii = await mkContact(tidA, crmA, SENT_NAME, { phone: SENT_PHONE, email: SENT_EMAIL, memberCustomerId: cust.id });
  const cNoMem = await mkContact(tidA, crmA, `ผู้ติดต่อไม่เป็นสมาชิก ${TAG}`);
  const co1 = await mkCompany(tidA, crmA, `บจก. ทดสอบวัตถุ ${TAG}`);
  const cA2c = await mkContact(tidA, crmA2, `ผู้ติดต่อระบบสอง ${TAG}`);
  const cBc = await mkContact(tidB, crmB, `ผู้ติดต่อร้าน B ${TAG}`);
  console.log(`[setup] tenant A ${tidA} · tenant B ${tidB} · crmA ${crmA} · crmA2 ${crmA2}\n`);

  /** create a section + the listed fields for an object through the C1.2a engine (skips keys the object already has) */
  const ensureFields = async (c: Any, objectKey: string, sectionKey: string, defs: Any[]): Promise<{ created: number; errors: string[] }> => {
    const errors: string[] = [];
    let created = 0;
    const lay = await call(F?.listLayout, fctx(c, objectKey), { includeArchived: false });
    const have = new Map<string, Any>();
    for (const s of lay.v?.sections ?? []) for (const f of s.fields ?? []) have.set(f.key, f);
    let sectionId = (lay.v?.sections ?? [])[0]?.id as string | undefined;
    const sec = await call(F?.createSection, fctx(c, objectKey), { key: sectionKey, label: `ข้อมูล ${objectKey}` });
    if (sec.ok) sectionId = sec.v.id;
    else if (!sectionId) errors.push(`section: ${sec.err}`);
    for (const d of defs) {
      const ex = have.get(d.key);
      if (ex) {
        if (d.filterable && !ex.filterable) {
          const up = await call(F?.updateField, fctx(c, objectKey), ex.id, { filterable: true });
          if (!up.ok) errors.push(`${d.key}: ${up.err}`);
        }
        continue;
      }
      const r = await call(F?.createField, fctx(c, objectKey), { sectionId, ...d });
      if (r.ok) created += 1;
      else errors.push(`${d.key}: ${r.err}`);
    }
    return { created, errors };
  };
  const layoutKeys = async (c: Any, objectKey: string): Promise<Map<string, string>> => {
    const lay = await call(F?.listLayout, fctx(c, objectKey), { includeArchived: false });
    const m = new Map<string, string>();
    for (const s of lay.v?.sections ?? []) for (const f of s.fields ?? []) m.set(f.key, f.type);
    return m;
  };
  const objRow = (sys: string, key: string) => P.customObject.findFirst({ where: { systemId: sys, key } });
  const recRow = (id: string) => P.customRecord.findUnique({ where: { id } });
  const liveCount = async (objectId: string) => P.customRecord.count({ where: { objectId, archivedAt: null } });

  const CAR_FIELDS = [
    { key: "plate", label: "ทะเบียนรถ", type: "TEXT", filterable: true },
    { key: "mileage", label: "เลขไมล์", type: "NUMBER", filterable: true, trackHistory: true },
    { key: "nextService", label: "เช็กระยะครั้งถัดไป", type: "DATE", filterable: true },
    { key: "fuel", label: "เชื้อเพลิง", type: "SELECT", filterable: true, options: { choices: [{ value: "diesel", label: "ดีเซล" }, { value: "petrol", label: "เบนซิน" }] } },
    { key: "insured", label: "มีประกัน", type: "BOOLEAN", filterable: true },
    { key: "branch", label: "สาขาที่ดูแล", type: "LOOKUP", filterable: true, options: { target: "UNIT" } },
  ];
  const CAR_KEYS = CAR_FIELDS.map((f) => f.key);

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — object "รถ" parent CONTACT + 6 field types → layout
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S1 · object + layout ──");
  const carIn = { key: "car", label: "รถ", labelPlural: "รถของลูกค้า", icon: "car", parentType: "CONTACT", titleFieldKey: "plate", showAsTab: true };
  const carC = await watch("objects.create car", () => call(OBJ.create, cA, actor, carIn));
  const car = await objRow(crmA, "car");
  chk("C1.2b-S1.1", "objects.create('รถ', parent CONTACT, titleFieldKey plate) writes ONE CustomObject in THIS CRM system — tenant/system/parentType/titleFieldKey as given, recordCount 0, not archived",
    carC.ok && car && car.tenantId === tidA && car.parentType === "CONTACT" && car.titleFieldKey === "plate" && car.recordCount === 0 && car.archivedAt === null && idOf(carC.v) === car.id,
    "row as given", `${carC.err} ${j(car ? { t: car.tenantId === tidA, p: car.parentType, tf: car.titleFieldKey, rc: car.recordCount } : null)}`);
  const carF = await ensureFields(cA, "car", "carInfo", CAR_FIELDS);
  const carFieldRows = (await P.memberField.findMany({ where: { tenantId: tidA, objectKey: "car" } })) as Any[];
  const byKey = new Map(carFieldRows.map((f) => [f.key, f]));
  chk("C1.2b-S1.2", "six fields of six DIFFERENT types (TEXT·NUMBER·DATE·SELECT·BOOLEAN·LOOKUP) are created for object 'car' through the engine and land as MemberField rows owned by the CRM system (systemId = crmA · objectKey = 'car') — not by the member system",
    carF.errors.length === 0 && CAR_FIELDS.every((d) => byKey.get(d.key)?.type === d.type && byKey.get(d.key)?.systemId === crmA),
    "6 rows · systemId crmA", `${carF.errors.join(" · ") || "-"} · rows=${carFieldRows.map((f) => `${f.key}:${f.type}@${f.systemId === crmA ? "crmA" : f.systemId}`).join(",")}`);
  {
    const lay = await layoutKeys(cA, "car");
    chk("C1.2b-S1.3", "listLayout({objectKey:'car'}) returns exactly those 6 fields with their types (nothing from other objects, nothing missing)",
      sameSet([...lay.keys()], CAR_KEYS) && CAR_FIELDS.every((d) => lay.get(d.key) === d.type), CAR_KEYS.join(","), [...lay.entries()].map(([k, t]) => `${k}:${t}`).join(","));
  }
  // other objects/systems for isolation (+ used by S2/S5/S10/X1)
  await call(OBJ.create, cA, actor, { key: "contract", label: "สัญญา", labelPlural: "สัญญา", parentType: "COMPANY", titleFieldKey: "contractNo", showAsTab: true });
  await ensureFields(cA, "contract", "contractInfo", [{ key: "contractNo", label: "เลขที่สัญญา", type: "TEXT" }, { key: "endDate", label: "วันสิ้นสุด", type: "DATE" }]);
  await call(OBJ.create, cA2, actor, carIn);
  await ensureFields(cA2, "car", "carInfo", [CAR_FIELDS[0]]);
  await call(OBJ.create, cA2, actor, { key: "onlya2", label: "เฉพาะระบบสอง", labelPlural: "เฉพาะระบบสอง", parentType: "CONTACT", titleFieldKey: "name" });
  await ensureFields(cA2, "onlya2", "main", [{ key: "name", label: "ชื่อ", type: "TEXT" }]);
  await call(OBJ.create, cB, actor, carIn);
  await ensureFields(cB, "car", "carInfo", [CAR_FIELDS[0]]);
  {
    const memLay = await call(F?.listLayout, { tenantId: tidA, systemId: memA, actorUserId: userA }, {});
    const memKeys = new Set<string>();
    for (const s of memLay.v?.sections ?? []) for (const f of s.fields ?? []) memKeys.add(f.key);
    const contractKeys = await layoutKeys(cA, "contract");
    const a2Keys = await layoutKeys(cA2, "car");
    const leakMem = CAR_KEYS.filter((k) => memKeys.has(k));
    const leakContract = CAR_KEYS.filter((k) => contractKeys.has(k));
    const leakA2 = CAR_KEYS.filter((k) => k !== "plate" && a2Keys.has(k));
    chk("C1.2b-S1.4", "layouts are isolated: the member (customer) layout, the 'contract' object layout and the SAME key 'car' in another CRM system of the same tenant show none of crmA car's fields",
      memLay.ok && leakMem.length === 0 && leakContract.length === 0 && leakA2.length === 0 && contractKeys.has("contractNo"),
      "no leak", `member=${leakMem.join(",") || "-"} contract=${leakContract.join(",") || "-"}(${[...contractKeys.keys()].join(",")}) crmA2.car=${leakA2.join(",") || "-"} ${memLay.err}`);
  }
  {
    const l = await call(OBJ.list, cA, actor);
    const it = itemsOf(l.v).find((o: Any) => keyOfObj(o) === "car");
    const g = await call(OBJ.get, cA, actor, "car");
    chk("C1.2b-S1.5", "objects.list / objects.get return the object with label, parentType, titleFieldKey and recordCount 0 — and list shows only this system's objects (crmA2's 'onlya2' is absent)",
      l.ok && it && it.label === "รถ" && it.parentType === "CONTACT" && it.titleFieldKey === "plate" && Number(it.recordCount) === 0 && g.ok && keyOfObj(g.v) === "car" &&
        !itemsOf(l.v).some((o: Any) => keyOfObj(o) === "onlya2"),
      "car in list · get ok", `${l.err} ${g.err} list=${itemsOf(l.v).map(keyOfObj).join(",")}`);
  }
  {
    const r = await call(OBJ.reorder, cA, actor, ["contract", "car"]);
    const l = await call(OBJ.list, cA, actor);
    const keys = itemsOf(l.v).map(keyOfObj);
    chk("C1.2b-S1.6", "objects.reorder(['contract','car']) changes the list order", r.ok && keys.indexOf("contract") >= 0 && keys.indexOf("contract") < keys.indexOf("car"),
      "contract before car", `${r.err} ${keys.join(",")}`, "MINOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — records CRUD · title from titleFieldKey · parent validation · move
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2 · records ──");
  const PLATE1 = `กข-1234-${rand}`;
  const vals1 = { plate: PLATE1, mileage: 12000, nextService: "2026-10-01", fuel: "diesel", insured: true, branch: unit1.id };
  const r1c = await watch("records.create r1", () => call(R.create, cA, actor, "car", { parentId: c1.id, values: vals1 }));
  const r1 = idOf(r1c.v);
  {
    const row = r1c.ok ? await recRow(r1) : null;
    const vrows = r1c.ok ? await P.customRecordValue.count({ where: { recordId: r1, recordType: "CUSTOM" } }) : -1;
    chk("C1.2b-S2.1", "records.create without a title → title = the value of titleFieldKey ('plate'); the row sits in this system/object under the contact (parentType CONTACT) and the 6 values are stored in CustomRecordValue (recordType CUSTOM)",
      r1c.ok && row && row.title === PLATE1 && row.systemId === crmA && row.tenantId === tidA && row.objectId === car?.id && row.parentType === "CONTACT" && row.parentId === c1.id && vrows === 6,
      `title=${PLATE1} · 6 values`, `${r1c.err} ${j(row ? { title: row.title, sys: row.systemId === crmA, pt: row.parentType, pid: row.parentId === c1.id } : null)} values=${vrows}`);
  }
  {
    const g = await call(R.get, cA, actor, "car", r1);
    const v = g.v?.values ?? {};
    const ok = g.ok && v.plate === PLATE1 && Number(v.mileage) === 12000 && ymd(v.nextService) === "2026-10-01" &&
      (v.fuel === "diesel" || (Array.isArray(v.fuel) && v.fuel[0] === "diesel")) && v.insured === true && v.branch === unit1.id && g.v?.title === PLATE1;
    chk("C1.2b-S2.2", "records.get round-trips every value (TEXT · NUMBER · DATE · SELECT · BOOLEAN · LOOKUP) keyed by field key, plus the title", ok, j(vals1), `${g.err} ${j(v)}`);
  }
  {
    const PLATE1B = `กข-9999-${rand}`;
    const u1 = await watch("records.update r1 plate", () => call(R.update, cA, actor, "car", r1, { values: { plate: PLATE1B } }));
    const t1 = (await recRow(r1))?.title;
    const u2 = await watch("records.update r1 mileage", () => call(R.update, cA, actor, "car", r1, { values: { mileage: 13000 } }));
    const t2 = (await recRow(r1))?.title;
    const ex = await call(R.create, cA, actor, "car", { parentId: c1.id, title: `รถคันโปรด ${rand}`, values: { plate: `ขค-5555-${rand}` } });
    const exRow = ex.ok ? await recRow(idOf(ex.v)) : null;
    chk("C1.2b-S2.3", "title follows titleFieldKey on update (plate changed → title changed; another field changed → title kept) and an explicit title on create wins over titleFieldKey",
      u1.ok && u2.ok && t1 === PLATE1B && t2 === PLATE1B && ex.ok && exRow?.title === `รถคันโปรด ${rand}`,
      `${PLATE1B} · ${PLATE1B} · explicit`, `${u1.err}${u2.err}${ex.err} t1=${t1} t2=${t2} ex=${exRow?.title}`);
  }
  const r2c = await call(R.create, cA, actor, "car", { parentId: c1.id, values: { plate: `ฮฮ-2222-${rand}` } });
  const r2 = idOf(r2c.v);
  {
    const l = await call(R.list, cA, actor, "car", { parentId: c1.id });
    const ids = itemsOf(l.v).map(idOf);
    const q = await call(R.list, cA, actor, "car", { q: `ฮฮ-2222-${rand}` });
    const qids = itemsOf(q.v).map(idOf);
    chk("C1.2b-S2.4", "records.list({parentId}) returns the parent's records (3 created under c1) and `q` searches the title",
      l.ok && ids.includes(r1) && ids.includes(r2) && ids.length === 3 && q.ok && qids.length === 1 && qids[0] === r2,
      "3 under c1 · q finds r2", `${l.err}${q.err} list=${ids.length} q=${qids.length}`);
  }
  {
    const a = await watch("records.archive r2", () => call(R.archive, cA, actor, "car", r2));
    const row = await recRow(r2);
    const l = await call(R.list, cA, actor, "car", { parentId: c1.id });
    const ids = itemsOf(l.v).map(idOf);
    chk("C1.2b-S2.5", "records.archive sets archivedAt (the row is kept) and the default list hides it",
      a.ok && row?.archivedAt instanceof Date && !ids.includes(r2) && ids.includes(r1), "archived + hidden", `${a.err} archivedAt=${row?.archivedAt} inList=${ids.includes(r2)}`);
  }
  {
    const before = await P.customRecord.count({ where: { objectId: car?.id } });
    const wrongType = await call(R.create, cA, actor, "car", { parentId: co1.id, values: { plate: `ผิด-1-${rand}` } });
    const wrongCust = await call(R.create, cA, actor, "car", { parentId: cust.id, values: { plate: `ผิด-2-${rand}` } });
    const noSuch = await call(R.create, cA, actor, "car", { parentId: `${TAG}-no-such`, values: { plate: `ผิด-3-${rand}` } });
    const noParent = await call(R.create, cA, actor, "car", { values: { plate: `ผิด-4-${rand}` } });
    const after = await P.customRecord.count({ where: { objectId: car?.id } });
    chk("C1.2b-S2.6", "a parent of the WRONG TYPE (a company / a member for a CONTACT object), an unknown parent id, and a missing parent for a CONTACT object are all VALIDATION (Thai message) and create nothing",
      isValidation(wrongType) && isValidation(wrongCust) && isValidation(noSuch) && isValidation(noParent) && thai(wrongType.msg) && after === before,
      "4× VALIDATION · 0 rows", `${wrongType.err} | ${wrongCust.err} | ${noSuch.err} | ${noParent.err} | rows ${before}→${after}`);
  }
  {
    const m = await watch("records.move r1", () => call(R.move, cA, actor, "car", r1, c2.id));
    const row = await recRow(r1);
    const bad = await call(R.move, cA, actor, "car", r1, co1.id);
    const row2 = await recRow(r1);
    chk("C1.2b-S2.7", "records.move re-parents the record (parentId = the new contact AND partyId re-inherited from it); moving to a parent of the wrong type is VALIDATION and changes nothing",
      m.ok && row?.parentId === c2.id && row?.partyId === c2.partyId && isValidation(bad) && row2?.parentId === c2.id && row2?.partyId === c2.partyId,
      "moved · partyId c2 · bad move refused", `${m.err} | ${bad.err} | parent=${row2?.parentId === c2.id} party=${row2?.partyId === c2.partyId}`);
  }
  {
    const t = await call(OBJ.timelineFor, cA, actor, r1);
    chk("C1.2b-S2.8", "timelineFor(recordId) answers for a record of this system (array or {items}) — it is the data source of the record page",
      t.ok && (Array.isArray(t.v) || Array.isArray(t.v?.items)), "array", t.err || typeof t.v, "MINOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — f.{key} filters on records (records half of CRM-RUN S3)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3 · filters on records ──");
  const F1 = await call(R.create, cA, actor, "car", { parentId: cF.id, values: { plate: `AAA-111-${rand}`, mileage: 5000, nextService: "2026-10-01", fuel: "diesel", insured: true, branch: unit1.id } });
  const F2 = await call(R.create, cA, actor, "car", { parentId: cF.id, values: { plate: `BBB-222-${rand}`, mileage: 15000, nextService: "2026-12-15", fuel: "petrol", insured: false, branch: unit2.id } });
  const F3 = await call(R.create, cA, actor, "car", { parentId: cF.id, values: { plate: `AAB-333-${rand}`, mileage: 25000, nextService: "2027-01-20", fuel: "diesel", insured: true, branch: unit2.id } });
  const [f1, f2, f3] = [F1, F2, F3].map((x) => idOf(x.v));
  const flt = async (f: Record<string, string>) => {
    const r = await call(R.list, cA, actor, "car", { parentId: cF.id, f });
    return { r, ids: itemsOf(r.v).map(idOf).sort() };
  };
  const expect = (ids: string[]) => [...ids].sort().join(",");
  const setupOk = F1.ok && F2.ok && F3.ok;
  {
    const a = await flt({ plate: "AA" });
    const b = await flt({ plate: `=BBB-222-${rand}` });
    chk("C1.2b-S3.1", "TEXT filter: 'contains' (AA → 2 records) and '=exact' (→ 1 record)", setupOk && a.ids.join(",") === expect([f1, f3]) && b.ids.join(",") === expect([f2]),
      "2 · 1", `${F1.err}${a.r.err}${b.r.err} ${a.ids.length}·${b.ids.length}`);
  }
  {
    const a = await flt({ mileage: "10000..30000" });
    const b = await flt({ mileage: "=5000" });
    chk("C1.2b-S3.2", "NUMBER filter: range 10000..30000 (→ 2) and =5000 (→ 1)", setupOk && a.ids.join(",") === expect([f2, f3]) && b.ids.join(",") === expect([f1]), "2 · 1", `${a.r.err}${b.r.err} ${a.ids.length}·${b.ids.length}`);
  }
  {
    const a = await flt({ nextService: "2026-12-01..2026-12-31" });
    const b = await flt({ nextService: "2026-11-01.." });
    chk("C1.2b-S3.3", "DATE filter: closed range (→ 1) and open-ended range (→ 2) on Bangkok calendar days", setupOk && a.ids.join(",") === expect([f2]) && b.ids.join(",") === expect([f2, f3]),
      "1 · 2", `${a.r.err}${b.r.err} ${a.ids.length}·${b.ids.length}`);
  }
  {
    const a = await flt({ fuel: "diesel" });
    chk("C1.2b-S3.4", "SELECT filter: fuel=diesel (→ 2)", setupOk && a.ids.join(",") === expect([f1, f3]), "2", `${a.r.err} ${a.ids.length}`);
  }
  {
    const a = await flt({ branch: unit2.id });
    chk("C1.2b-S3.5", "LOOKUP filter: branch = unit 2 (→ 2)", setupOk && a.ids.join(",") === expect([f2, f3]), "2", `${a.r.err} ${a.ids.length}`);
  }
  {
    const a = await flt({ insured: "true" });
    const b = await flt({ fuel: "diesel", mileage: "20000.." });
    chk("C1.2b-S3.6", "BOOLEAN filter (insured=true → 2) and two filters AND-ed (diesel AND mileage ≥ 20000 → 1)", setupOk && a.ids.join(",") === expect([f1, f3]) && b.ids.join(",") === expect([f3]),
      "2 · 1", `${a.r.err}${b.r.err} ${a.ids.length}·${b.ids.length}`);
  }
  {
    const a = await flt({ nosuchfield: "x" });
    chk("C1.2b-S3.7", "a filter on a field the object does not have is VALIDATION (never silently ignored — an ignored filter shows the whole list)", isValidation(a.r), "VALIDATION", a.r.err || `ok ${a.ids.length}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 — tabsFor
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S5 · tabsFor ──");
  await call(OBJ.create, cA, actor, { key: "hiddentab", label: "ไม่โชว์แท็บ", labelPlural: "ไม่โชว์แท็บ", parentType: "CONTACT", titleFieldKey: "name", showAsTab: false });
  await ensureFields(cA, "hiddentab", "main", [{ key: "name", label: "ชื่อ", type: "TEXT" }]);
  await call(OBJ.create, cA, actor, { key: "oldtab", label: "แท็บเก่า", labelPlural: "แท็บเก่า", parentType: "CONTACT", titleFieldKey: "name", showAsTab: true });
  await ensureFields(cA, "oldtab", "main", [{ key: "name", label: "ชื่อ", type: "TEXT" }]);
  const oldArch = await call(OBJ.archive, cA, actor, "oldtab", {});
  const t1c = await call(R.create, cA, actor, "car", { parentId: cT.id, values: { plate: `T1-${rand}` } });
  const t2c = await call(R.create, cA, actor, "car", { parentId: cT.id, values: { plate: `T2-${rand}` } });
  const t3c = await call(R.create, cA, actor, "car", { parentId: cT.id, values: { plate: `T3-${rand}` } });
  await call(R.archive, cA, actor, "car", idOf(t3c.v));
  await call(R.create, cA, actor, "hiddentab", { parentId: cT.id, values: { name: `ซ่อน ${rand}` } });
  const k1 = await call(R.create, cA, actor, "contract", { parentId: co1.id, values: { contractNo: `CT-${rand}`, endDate: "2027-03-31" } });
  {
    const tb = await call(OBJ.tabsFor, cA, actor, "CONTACT", cT.id);
    const carTab = itemsOf(tb.v).find((t: Any) => keyOfObj(t) === "car");
    chk("C1.2b-S5.1", "tabsFor(CONTACT, id) lists 'car' with count = LIVE records of THIS parent (2 — the archived third one is not counted)",
      tb.ok && t1c.ok && t2c.ok && carTab && Number(carTab.count) === 2 && thai(carTab.label), "car · 2", `${tb.err} ${j(itemsOf(tb.v))}`);
    const keys = itemsOf(tb.v).map(keyOfObj);
    chk("C1.2b-S5.2", "…and omits an object with showAsTab=false, an archived object and an object of another parent type (COMPANY)",
      tb.ok && oldArch.ok && !keys.includes("hiddentab") && !keys.includes("oldtab") && !keys.includes("contract"), "only car", `${oldArch.err} keys=${keys.join(",")}`);
    const tc = await call(OBJ.tabsFor, cA, actor, "COMPANY", co1.id);
    const ck = itemsOf(tc.v);
    chk("C1.2b-S5.3", "tabsFor(COMPANY, id) lists 'contract' with count 1 and no CONTACT object",
      tc.ok && k1.ok && ck.some((t: Any) => keyOfObj(t) === "contract" && Number(t.count) === 1) && !ck.some((t: Any) => keyOfObj(t) === "car"),
      "contract · 1", `${tc.err}${k1.err} ${j(ck)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S6 — archive an object that has records ⇒ must type the key · restore
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S6 · archive / restore ──");
  await call(OBJ.create, cA, actor, { key: "car6", label: "รถ ๖", labelPlural: "รถ ๖", parentType: "CONTACT", titleFieldKey: "plate" });
  await ensureFields(cA, "car6", "main", [{ key: "plate", label: "ทะเบียน", type: "TEXT" }]);
  const s6r = await call(R.create, cA, actor, "car6", { parentId: c1.id, values: { plate: `S6-${rand}` } });
  const REASON = "เลิกใช้วัตถุนี้แล้วตามที่ประชุม";
  {
    const noConfirm = await call(OBJ.archive, cA, actor, "car6", {});
    const wrongKey = await call(OBJ.archive, cA, actor, "car6", { confirmKey: "car", reason: REASON });
    const row = await objRow(crmA, "car6");
    chk("C1.2b-S6.1", "archiving an object that HAS records without typing its key — or typing the wrong key — is refused with a Thai message and the object stays active",
      s6r.ok && isRefused(noConfirm) && isRefused(wrongKey) && thai(noConfirm.msg) && row?.archivedAt === null, "2× refused · active", `${noConfirm.err} | ${wrongKey.err} | archivedAt=${row?.archivedAt}`);
  }
  {
    const ok = await watch("objects.archive car6", () => call(OBJ.archive, cA, actor, "car6", { confirmKey: "car6", reason: REASON }));
    const row = await objRow(crmA, "car6");
    const l = await call(OBJ.list, cA, actor);
    const newRec = await call(R.create, cA, actor, "car6", { parentId: c1.id, values: { plate: `S6b-${rand}` } });
    const tb = await call(OBJ.tabsFor, cA, actor, "CONTACT", c1.id);
    const kept = await P.customRecord.count({ where: { objectId: row?.id } });
    chk("C1.2b-S6.2", "with the key typed (+ reason) the object is archived: gone from list and tabs, no new record can be added, and its records are KEPT (archive ≠ delete)",
      ok.ok && row?.archivedAt instanceof Date && !itemsOf(l.v).some((o: Any) => keyOfObj(o) === "car6") && !newRec.ok && !itemsOf(tb.v).some((t: Any) => keyOfObj(t) === "car6") && kept === 1,
      "archived · hidden · 1 record kept", `${ok.err} | newRec=${newRec.ok} | kept=${kept}`);
  }
  {
    const rs = await call(OBJ.restore, cA, actor, "car6");
    const row = await objRow(crmA, "car6");
    const l = await call(R.list, cA, actor, "car6", {});
    chk("C1.2b-S6.3", "restore brings it back: archivedAt null, its record listed again, recordCount unchanged (1)",
      rs.ok && row?.archivedAt === null && itemsOf(l.v).map(idOf).includes(idOf(s6r.v)) && row?.recordCount === 1, "restored · 1", `${rs.err} ${l.err} rc=${row?.recordCount}`);
  }
  chk("C1.2b-S6.4", "an EMPTY object is archived without typing the key (the confirmation guards data, not the click)", oldArch.ok, "ok", oldArch.err, "MAJOR");

  // ═════════════════════════════════════════════════════════════════════════════
  // S8 — no hard cap on objects: 35 → no error, OpsEvent WARN past 30
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S8 · no hard cap ──");
  {
    const errs: string[] = [];
    let warnAt29 = -1;
    const tS8 = new Date(Date.now() - 500);
    for (let i = 1; i <= 35; i += 1) {
      const r = await call(OBJ.create, cA3, actor, { key: `obj${i}`, label: `วัตถุ ${i}`, labelPlural: `วัตถุ ${i}`, parentType: "NONE", titleFieldKey: "name" });
      if (!r.ok) errs.push(`#${i}: ${r.err}`);
      if (i === 29) warnAt29 = await P.opsEvent.count({ where: { tenantId: tidA, level: "WARN", createdAt: { gte: tS8 } } });
    }
    const rows = await P.customObject.count({ where: { systemId: crmA3 } });
    chk("C1.2b-S8.1", "35 objects in one CRM system are all created — there is NO hard cap (decision C8)", errs.length === 0 && rows === 35, "35 · 0 errors", `${rows} · ${errs.slice(0, 2).join(" | ") || "-"}`);
    const warns = (await P.opsEvent.findMany({ where: { tenantId: tidA, level: "WARN", createdAt: { gte: tS8 } } })) as Any[];
    chk("C1.2b-S8.2", "…but past 30 objects an OpsEvent WARN (tenant-tagged, Thai) is written — none while the system still had ≤ 29",
      warnAt29 === 0 && warns.length >= 1 && warns.some((w) => thai(w.message)), "0 at 29 · ≥1 after 35", `at29=${warnAt29} after=${warns.length} ${cut(warns.map((w) => w.message).join(" | "), 160)}`);
  }
  {
    // > 200,000 records/object: the cache says so (seeded directly — nobody creates 200k rows in an oracle)
    await call(OBJ.create, cA3, actor, { key: "huge", label: "วัตถุใหญ่", labelPlural: "วัตถุใหญ่", parentType: "NONE", titleFieldKey: "name" });
    await ensureFields(cA3, "huge", "main", [{ key: "name", label: "ชื่อ", type: "TEXT" }]);
    await P.customObject.updateMany({ where: { systemId: crmA3, key: "huge" }, data: { recordCount: 200_000 } });
    const tH = new Date(Date.now() - 500);
    const hr = await call(R.create, cA3, actor, "huge", { values: { name: `แถวที่สองแสน ${rand}` } });
    const warns = await P.opsEvent.count({ where: { tenantId: tidA, level: "WARN", createdAt: { gte: tH } } });
    chk("C1.2b-S8.3", "an object past 200,000 records still accepts a new record and an OpsEvent WARN is written (no hard cap on records either)", hr.ok && warns >= 1, "ok · WARN", `${hr.err} warns=${warns}`, "MINOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S9 — immutability of key / parentType once records exist · reserved & duplicate keys
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S9 · immutability ──");
  {
    await call(OBJ.create, cA, actor, { key: "tmpkey", label: "ชั่วคราว", labelPlural: "ชั่วคราว", parentType: "CONTACT", titleFieldKey: "name" });
    await ensureFields(cA, "tmpkey", "main", [{ key: "name", label: "ชื่อ", type: "TEXT" }, { key: "size", label: "ขนาด", type: "NUMBER" }]);
    const rn = await call(OBJ.update, cA, actor, "tmpkey", { key: "renamed" });
    const lay = await layoutKeys(cA, "renamed");
    const orphan = await P.memberField.count({ where: { systemId: crmA, objectKey: "tmpkey" } });
    chk("C1.2b-S9.1", "while an object has NO records its key may change — and its fields follow (layout under the new key has them, no MemberField left on the old key)",
      rn.ok && lay.has("name") && lay.has("size") && orphan === 0 && !!(await objRow(crmA, "renamed")), "renamed · fields follow", `${rn.err} layout=${[...lay.keys()].join(",")} orphans=${orphan}`, "MAJOR");
    const pt = await call(OBJ.update, cA, actor, "renamed", { parentType: "COMPANY" });
    const ptRow = await objRow(crmA, "renamed");
    chk("C1.2b-S9.2", "while it has no records its parentType may change too", pt.ok && ptRow?.parentType === "COMPANY", "COMPANY", `${pt.err} ${ptRow?.parentType}`, "MAJOR");
  }
  {
    const k = await call(OBJ.update, cA, actor, "car", { key: "vehicle" });
    const p = await call(OBJ.update, cA, actor, "car", { parentType: "COMPANY" });
    const row = await objRow(crmA, "car");
    const lbl = await call(OBJ.update, cA, actor, "car", { label: "รถลูกค้า" });
    const row2 = await objRow(crmA, "car");
    chk("C1.2b-S9.3", "once records exist, changing the key OR the parentType is VALIDATION and nothing moves (records would point at a parent of the wrong kind / URLs and filters would break) — other attributes (label) still change",
      isValidation(k) && isValidation(p) && row?.key === "car" && row?.parentType === "CONTACT" && lbl.ok && row2?.label === "รถลูกค้า",
      "key/parentType refused · label ok", `${k.err} | ${p.err} | key=${row?.key} pt=${row?.parentType} label=${row2?.label} ${lbl.err}`);
  }
  {
    const dup = await call(OBJ.create, cA, actor, { key: "car", label: "ซ้ำ", labelPlural: "ซ้ำ", parentType: "CONTACT", titleFieldKey: "plate" });
    const n = await P.customObject.count({ where: { systemId: crmA, key: "car" } });
    chk("C1.2b-S9.4", "a key that already exists in the same CRM system is refused (DUPLICATE/VALIDATION, Thai) — the same key in ANOTHER CRM system is fine (crmA2 already has 'car')",
      isRefused(dup) && thai(dup.msg) && n === 1 && !!(await objRow(crmA2, "car")), "refused · 1 row", `${dup.err} rows=${n}`);
  }
  {
    const bad: string[] = [];
    for (const key of ["customer", "contact", "company", "deal", "Car", "รถ", "1car", "car key"]) {
      const r = await call(OBJ.create, cA, actor, { key, label: "สงวน", labelPlural: "สงวน", parentType: "NONE", titleFieldKey: "name" });
      if (!isValidation(r)) bad.push(`${key}:${r.ok ? "accepted" : r.err}`);
    }
    const leaked = await P.customObject.count({ where: { systemId: crmA, key: { in: ["customer", "contact", "company", "deal"] } } });
    chk("C1.2b-S9.5", "reserved keys (customer/contact/company/deal — the engine's own objectKeys; an object named 'contact' would share the contacts' fields) and malformed keys are VALIDATION",
      bad.length === 0 && leaked === 0, "8× VALIDATION", `${bad.join(" · ") || "-"} leaked=${leaked}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S10 — partyId inherited · recordCount cache
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S10 · partyId + recordCount ──");
  {
    const rc = await recRow(r2);
    const kc = k1.ok ? await recRow(idOf(k1.v)) : null;
    chk("C1.2b-S10.1", "partyId is inherited from the parent: CONTACT → the contact's partyId · COMPANY → the company's partyId",
      rc?.partyId === c1.partyId && kc?.partyId === co1.partyId, "contact/company party", `contact=${rc?.partyId === c1.partyId} company=${kc?.partyId === co1.partyId}`);
  }
  await call(OBJ.create, cA, actor, { key: "petc", label: "สัตว์เลี้ยงสมาชิก", labelPlural: "สัตว์เลี้ยงสมาชิก", parentType: "CUSTOMER", titleFieldKey: "petName" });
  await ensureFields(cA, "petc", "main", [{ key: "petName", label: "ชื่อสัตว์", type: "TEXT" }]);
  await call(OBJ.create, cA, actor, { key: "project", label: "โครงการ", labelPlural: "โครงการ", parentType: "NONE", titleFieldKey: "projName" });
  await ensureFields(cA, "project", "main", [{ key: "projName", label: "ชื่อโครงการ", type: "TEXT" }, { key: "budget", label: "งบ", type: "NUMBER" }, { key: "note", label: "หมายเหตุ", type: "TEXT" }]);
  {
    const pc = await call(R.create, cA, actor, "petc", { parentId: cust.id, values: { petName: `น้องหมา ${rand}` } });
    const pr = await call(R.create, cA, actor, "project", { values: { projName: `โครงการ ${rand}` } });
    const prWithParent = await call(R.create, cA, actor, "project", { parentId: c1.id, values: { projName: `โครงการผิด ${rand}` } });
    const pcRow = pc.ok ? await recRow(idOf(pc.v)) : null;
    const prRow = pr.ok ? await recRow(idOf(pr.v)) : null;
    chk("C1.2b-S10.2", "CUSTOMER parent → partyId = the member's partyId · NONE → no parent, partyId null · a parentId for a NONE object is VALIDATION",
      pcRow?.partyId === custParty && pcRow?.parentType === "CUSTOMER" && prRow && prRow.parentId === null && prRow.partyId === null && prRow.parentType === "NONE" && isValidation(prWithParent),
      "member party · null · refused", `${pc.err}${pr.err} cust=${pcRow?.partyId === custParty} none=${j(prRow ? { p: prRow.parentId, party: prRow.partyId } : null)} withParent=${prWithParent.err || "accepted"}`);
  }
  {
    await call(OBJ.create, cA, actor, { key: "cnt", label: "นับ", labelPlural: "นับ", parentType: "CONTACT", titleFieldKey: "name" });
    await ensureFields(cA, "cnt", "main", [{ key: "name", label: "ชื่อ", type: "TEXT" }]);
    const made = [];
    for (let i = 0; i < 3; i += 1) made.push(await call(R.create, cA, actor, "cnt", { parentId: c1.id, values: { name: `นับ ${i}` } }));
    const rc3 = (await objRow(crmA, "cnt"))?.recordCount;
    const a1 = await call(R.archive, cA, actor, "cnt", idOf(made[0].v));
    const a2 = await call(R.archive, cA, actor, "cnt", idOf(made[0].v));
    const rc2 = (await objRow(crmA, "cnt"))?.recordCount;
    const failed = await call(R.create, cA, actor, "cnt", { parentId: co1.id, values: { name: "ผิดชนิด" } });
    const rcF = (await objRow(crmA, "cnt"))?.recordCount;
    chk("C1.2b-S10.3", "recordCount cache: 3 creates → 3 · archive → 2 · archiving the SAME record again → still 2 (no double decrement) · a refused create → still 2",
      made.every((m) => m.ok) && a1.ok && rc3 === 3 && rc2 === 2 && !failed.ok && rcF === 2, "3 · 2 · 2 · 2", `rc3=${rc3} rc2=${rc2} rcF=${rcF} secondArchive=${a2.ok ? "ok" : a2.err}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S11 — 8 object templates (data) + disabled "date field due" starter rule each
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S11 · templates ──");
  {
    const TPL: Any[] = (SH?.OBJECT_TEMPLATES ?? OBJ?.OBJECT_TEMPLATES ?? []) as Any[];
    const WANT = ["สัตว์เลี้ยง", "รถ", "ทรัพย์สิน", "สัญญา", "กรมธรรม์", "อสังหา", "โครงการ", "ผู้เรียน"];
    const matched = WANT.map((w) => TPL.filter((t) => typeof t?.label === "string" && t.label.startsWith(w)).length);
    const keys = TPL.map((t) => t?.key);
    chk("C1.2b-S11.1", "OBJECT_TEMPLATES (objects-shared) holds exactly the 8 templates of blueprint §10 / R-C.12 — สัตว์เลี้ยง · รถ · ทรัพย์สิน/เครื่องจักร · สัญญา · กรมธรรม์ · อสังหาฯ · โครงการ · ผู้เรียน — each once, with unique well-formed keys",
      TPL.length === 8 && matched.every((n) => n === 1) && new Set(keys).size === 8 && keys.every((k) => typeof k === "string" && /^[a-z][a-zA-Z0-9_]*$/.test(k)),
      "8 · one each", `n=${TPL.length} ${WANT.map((w, i) => `${w}:${matched[i]}`).join(" ")} keys=${keys.join(",")}`);
    const fieldsOf = (t: Any): Any[] => (t?.sections ?? []).flatMap((s: Any) => s?.fields ?? []);
    const badShape = TPL.filter((t) => {
      const fs = fieldsOf(t);
      const title = fs.find((f: Any) => f.key === t.titleFieldKey);
      return !(fs.length >= 5 && fs.length <= 8 && title && title.type === "TEXT" && ["CUSTOMER", "CONTACT", "COMPANY", "DEAL", "NONE"].includes(t.parentType) && thai(t.label));
    }).map((t) => t?.key);
    chk("C1.2b-S11.2", "every template has 5–8 fields, a titleFieldKey that is one of its own TEXT fields, and a recommended parentType from the enum", TPL.length === 8 && badShape.length === 0,
      "all well-formed", badShape.join(",") || "-");
    const rulesOf = (t: Any): Any[] => (Array.isArray(t?.starterRules) ? t.starterRules : t?.starterRule ? [t.starterRule] : []);
    const badRule = TPL.filter((t) => {
      const rs = rulesOf(t);
      if (rs.length !== 1) return true;
      const r = rs[0];
      const f = fieldsOf(t).find((x: Any) => x.key === r.fieldKey);
      return !(r.enabled === false && f && (f.type === "DATE" || f.type === "DATETIME") && /DATE_DUE|DUE/i.test(String(r.kind ?? r.type ?? "")));
    }).map((t) => t?.key);
    chk("C1.2b-S11.3", "every template carries exactly ONE starter-rule spec: kind 'date field due', pointing at one of its own DATE fields, enabled === false (C2.1 materialises it; nothing may fire on its own)",
      TPL.length === 8 && badRule.length === 0, "8× one disabled DATE_DUE", badRule.join(",") || "-");
    const t0 = new Date(Date.now() - 500);
    const bad: string[] = [];
    for (const t of TPL) {
      const r = await call(OBJ.create, cTpl, actor, { key: t.key, label: t.label, labelPlural: t.labelPlural ?? t.label, parentType: t.parentType, titleFieldKey: t.titleFieldKey, templateKey: t.key });
      const row = await objRow(crmTpl, t.key);
      const lay = await layoutKeys(cTpl, t.key);
      const want = fieldsOf(t).map((f: Any) => f.key as string);
      if (!r.ok || row?.templateKey !== t.key || !sameSet([...lay.keys()], want)) bad.push(`${t.key}:${r.ok ? "" : r.err}${row?.templateKey ?? "-"}/${[...lay.keys()].length}vs${want.length}`);
    }
    chk("C1.2b-S11.4", "objects.create({templateKey}) materialises exactly the template's fields through the engine (layout = template field keys) and records templateKey on the object — for all 8",
      TPL.length === 8 && bad.length === 0, "8 materialised", bad.join(" · ") || "-");
    const rules = await P.automationRule.count({ where: { tenantId: tidA, createdAt: { gte: t0 } } }).catch(() => -1);
    chk("C1.2b-S11.5", "no automation rule is created by applying a template in C1.2b (the starter rule is DATA; C2.1 materialises it disabled)", rules === 0, "0", String(rules), "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S12 — events custom.record.created/updated/archived
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S12 · events ──");
  const EVTS = ["custom.record.created", "custom.record.updated", "custom.record.archived"];
  const OBX = (await import("@/lib/outbox-consumers" as string)) as Any;
  const CONS: Any = OBX.consumers;
  {
    const autoL = (await import("@/lib/automation/labels")) as Any;
    const hookL = (await import("@/lib/webhooks/labels")) as Any;
    const auto = new Set(((autoL.AUTOMATION_EVENTS ?? []) as Any[]).map((e) => e.value));
    const hook = new Set(((hookL.WEBHOOK_EVENTS ?? []) as Any[]).map((e) => e.value));
    const missing = EVTS.filter((t) => typeof CONS?.[t] !== "function" || !auto.has(t) || !hook.has(t));
    const srcA = read("src/lib/automation/labels.ts");
    const srcW = read("src/lib/webhooks/labels.ts");
    const decl = (src: string, t: string) => (src.match(new RegExp(`value:\\s*"${t.replace(/\./g, "\\.")}"`, "g")) ?? []).length;
    const dupDecl = EVTS.filter((t) => decl(srcA, t) + decl(srcW, t) !== 1);
    chk("C1.2b-S12.1", "the 3 events are registered in all 3 registries — a consumer in outbox-consumers.ts, AUTOMATION_EVENTS (they are rule triggers, §5.8) and WEBHOOK_EVENTS (via the spread) — and each label is declared exactly once",
      missing.length === 0 && dupDecl.length === 0, "3 × 3 · 1 declaration each", `missing=${missing.join(",") || "-"} declCount≠1=${dupDecl.join(",") || "-"}`);
  }
  const evOf = async (type: string, recordId: string) =>
    (await P.outboxEvent.findMany({ where: { tenantId: tidA, type, idempotencyKey: { startsWith: `${type}#${recordId}#` } }, orderBy: { createdAt: "asc" } })) as Any[];
  {
    const created = await evOf("custom.record.created", r1);
    const ev = created[0];
    const keyRe = new RegExp(`^custom\\.record\\.created#${r1}#[^#\\s]+$`);
    chk("C1.2b-S12.2", "records.create emits exactly ONE custom.record.created — key `custom.record.created#<recordId>#<seq>` (R-C.8), systemId = the CRM system, payload.recordId/objectId set",
      created.length === 1 && keyRe.test(ev.idempotencyKey) && ev.systemId === crmA && ev.payload?.recordId === r1 && ev.payload?.objectId === car?.id,
      "1 event", `n=${created.length} ${j(ev ? { k: ev.idempotencyKey, sys: ev.systemId === crmA, p: ev.payload } : null)}`);
    const upd = await evOf("custom.record.updated", r1);
    chk("C1.2b-S12.3", "two separate updates of the same record emit TWO custom.record.updated events (the #<seq> part differs — a key of only the recordId would swallow every update after the first)",
      upd.length >= 2 && new Set(upd.map((e) => e.idempotencyKey)).size === upd.length, "≥2 distinct", `n=${upd.length} ${upd.map((e) => e.idempotencyKey).join(" ")}`);
    const arc = await evOf("custom.record.archived", r2);
    chk("C1.2b-S12.4", "records.archive emits custom.record.archived (one)", arc.length === 1 && arc[0].payload?.recordId === r2, "1", `n=${arc.length}`);
  }
  {
    // 🔴 "emitted INSIDE the write transaction": make the EVENT insert fail (tenant-scoped trigger on OutboxEvent)
    //    ⇒ the record write must be rolled back with it. An emit after commit (or emitOutboxOutsideTx) leaves the write behind.
    const mkTrigger = async (cond: string) => {
      await dropTrigger();
      await P.$executeRawUnsafe(
        `CREATE FUNCTION ${TRIG}_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."tenantId" = '${tidA}' AND ${cond} THEN RAISE EXCEPTION 'qc-c12b forced outbox failure'; END IF; RETURN NEW; END $$`,
      );
      await P.$executeRawUnsafe(`CREATE TRIGGER ${TRIG} AFTER INSERT ON "OutboxEvent" FOR EACH ROW EXECUTE FUNCTION ${TRIG}_fn()`);
    };
    const objCar = await objRow(crmA, "car");
    const rcBefore = objCar?.recordCount;
    const ROLL = `ROLLBACK-${rand}`;
    let cr: Res, up: Res, ar: Res;
    try {
      await mkTrigger(`NEW.type = 'custom.record.created'`);
      cr = await call(R.create, cA, actor, "car", { parentId: c1.id, values: { plate: ROLL } });
    } finally {
      await dropTrigger();
    }
    const leftRows = await P.customRecord.count({ where: { objectId: objCar?.id, title: ROLL } });
    const leftVals = await P.customRecordValue.count({ where: { tenantId: tidA, valueText: ROLL } });
    const rcAfter = (await objRow(crmA, "car"))?.recordCount;
    chk("C1.2b-S12.5", "create: when the event cannot be written the whole create rolls back — no CustomRecord, no value row, recordCount unchanged (the event is part of the write transaction)",
      !cr.ok && leftRows === 0 && leftVals === 0 && rcAfter === rcBefore, "refused · 0 rows", `call=${cr.ok ? "succeeded" : "failed"} rows=${leftRows} values=${leftVals} rc ${rcBefore}→${rcAfter}`);
    const before = await recRow(r1);
    const beforeVal = await P.customRecordValue.findFirst({ where: { recordId: r1, field: { key: "plate", objectKey: "car", systemId: crmA } } });
    try {
      await mkTrigger(`NEW."idempotencyKey" LIKE 'custom.record.updated#${r1}#%'`);
      up = await call(R.update, cA, actor, "car", r1, { values: { plate: `${ROLL}-U` } });
    } finally {
      await dropTrigger();
    }
    const after = await recRow(r1);
    const afterVal = await P.customRecordValue.findFirst({ where: { recordId: r1, field: { key: "plate", objectKey: "car", systemId: crmA } } });
    chk("C1.2b-S12.6", "update: a failed event write leaves title AND value untouched", !up.ok && after?.title === before?.title && afterVal?.valueText === beforeVal?.valueText,
      "unchanged", `call=${up.ok ? "succeeded" : "failed"} title ${before?.title}→${after?.title} value ${beforeVal?.valueText}→${afterVal?.valueText}`);
    const rcA0 = (await objRow(crmA, "car"))?.recordCount;
    try {
      await mkTrigger(`NEW."idempotencyKey" LIKE 'custom.record.archived#${r1}#%'`);
      ar = await call(R.archive, cA, actor, "car", r1);
    } finally {
      await dropTrigger();
    }
    const ra = await recRow(r1);
    const rcA1 = (await objRow(crmA, "car"))?.recordCount;
    chk("C1.2b-S12.7", "archive: a failed event write leaves the record live and recordCount unchanged", !ar.ok && ra?.archivedAt === null && rcA1 === rcA0,
      "live · same count", `call=${ar.ok ? "succeeded" : "failed"} archivedAt=${ra?.archivedAt} rc ${rcA0}→${rcA1}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X1 — scope: other tenant · OTHER CRM SYSTEM of the same tenant · foreign parent · ctx.systemId re-resolved
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X1 · scope ──");
  const recA2 = await call(R.create, cA2, actor, "car", { parentId: cA2c.id, values: { plate: FOREIGN_TITLE } });
  const recB = await call(R.create, cB, actor, "car", { parentId: cBc.id, values: { plate: FOREIGN_TITLE } });
  const idA2 = idOf(recA2.v);
  const idB = idOf(recB.v);
  {
    const g1 = await call(R.get, cA, actor, "car", idB);
    const g2 = await call(R.get, cA, actor, "car", idA2);
    const noLeak = ![g1, g2].some((g) => g.msg.includes(FOREIGN_TITLE));
    chk("C1.2b-X1.1", "records.get of a record of ANOTHER TENANT and of ANOTHER CRM SYSTEM of the same tenant (same object key 'car' in both) → NOT_FOUND, and the error does not echo the foreign title",
      recA2.ok && recB.ok && isNotFound(g1) && isNotFound(g2) && noLeak, "2× NOT_FOUND", `${recA2.err}${recB.err} | ${g1.err || "returned"} | ${g2.err || "returned"}`);
  }
  {
    const u1 = await call(R.update, cA, actor, "car", idA2, { values: { plate: "ถูกแก้ข้ามระบบ" } });
    const a1 = await call(R.archive, cA, actor, "car", idA2);
    const m1 = await call(R.move, cA, actor, "car", idA2, c1.id);
    const u2 = await call(R.update, cA, actor, "car", idB, { values: { plate: "ถูกแก้ข้ามร้าน" } });
    const a2 = await call(R.archive, cA, actor, "car", idB);
    const rowA2 = await recRow(idA2);
    const rowB = await recRow(idB);
    chk("C1.2b-X1.2", "update / archive / move of a foreign record (other CRM system · other tenant) → NOT_FOUND and the foreign row is untouched",
      [u1, a1, m1, u2, a2].every(isNotFound) && rowA2?.title === FOREIGN_TITLE && rowA2?.archivedAt === null && rowA2?.parentId === cA2c.id && rowB?.title === FOREIGN_TITLE && rowB?.archivedAt === null,
      "5× NOT_FOUND · untouched", `${[u1, a1, m1, u2, a2].map((r) => r.code || (r.ok ? "OK" : r.err)).join(",")} a2row=${j({ t: rowA2?.title, a: rowA2?.archivedAt })}`);
  }
  {
    const g = await call(OBJ.get, cA, actor, "onlya2");
    const u = await call(OBJ.update, cA, actor, "onlya2", { label: "แอบแก้" });
    const ar = await call(OBJ.archive, cA, actor, "onlya2", { confirmKey: "onlya2", reason: "แอบเก็บถาวรข้ามระบบ" });
    const rc = await call(R.create, cA, actor, "onlya2", { parentId: c1.id, values: { name: "แอบสร้าง" } });
    const row = await objRow(crmA2, "onlya2");
    chk("C1.2b-X1.3", "an object that exists only in another CRM system of the same tenant: get / update / archive / records.create → NOT_FOUND, the object untouched",
      [g, u, ar, rc].every(isNotFound) && row?.label === "เฉพาะระบบสอง" && row?.archivedAt === null, "4× NOT_FOUND", `${[g, u, ar, rc].map((r) => r.code || (r.ok ? "OK" : r.err)).join(",")}`);
  }
  {
    const l = await call(R.list, cA, actor, "car", {});
    const ids = itemsOf(l.v).map(idOf);
    const tb = await call(OBJ.tabsFor, cA, actor, "CONTACT", cA2c.id);
    const tabLeak = itemsOf(tb.v).some((t: Any) => Number(t.count) > 0);
    const tl = await call(OBJ.timelineFor, cA, actor, idA2);
    chk("C1.2b-X1.4", "records.list of crmA never contains crmA2's / tenant B's records of the same key · tabsFor(contact of crmA2) through crmA counts nothing (or NOT_FOUND) · timelineFor(foreign record) → NOT_FOUND",
      l.ok && !ids.includes(idA2) && !ids.includes(idB) && (isNotFound(tb) || (tb.ok && !tabLeak)) && isNotFound(tl),
      "no foreign rows", `list=${l.err} hasA2=${ids.includes(idA2)} hasB=${ids.includes(idB)} tabs=${tb.err || j(itemsOf(tb.v))} timeline=${tl.err || "returned"}`);
  }
  {
    const before = await P.customRecord.count({ where: { objectId: car?.id } });
    const p1 = await call(R.create, cA, actor, "car", { parentId: cA2c.id, values: { plate: `ข้ามระบบ-${rand}` } });
    const p2 = await call(R.create, cA, actor, "car", { parentId: cBc.id, values: { plate: `ข้ามร้าน-${rand}` } });
    const p3 = await call(R.move, cA, actor, "car", idOf(F1.v), cA2c.id);
    const after = await P.customRecord.count({ where: { objectId: car?.id } });
    const f1row = await recRow(idOf(F1.v));
    chk("C1.2b-X1.5", "a parent that belongs to ANOTHER CRM SYSTEM of the same tenant or to another tenant is VALIDATION on create and on move — the DB has no FK, the service must assert it (C1.1 review)",
      isValidation(p1) && isValidation(p2) && isValidation(p3) && after === before && f1row?.parentId === cF.id, "3× VALIDATION · nothing written", `${p1.err} | ${p2.err} | ${p3.err} | rows ${before}→${after}`);
  }
  {
    const a = await call(OBJ.list, { tenantId: tidA, systemId: crmB, actorUserId: userA }, actor);
    const b = await call(OBJ.create, { tenantId: tidA, systemId: crmB, actorUserId: userA }, actor, { key: "sneak", label: "แอบ", labelPlural: "แอบ", parentType: "NONE", titleFieldKey: "name" });
    const c = await call(OBJ.create, { tenantId: tidA, systemId: memA, actorUserId: userA }, actor, { key: "sneak", label: "แอบ", labelPlural: "แอบ", parentType: "NONE", titleFieldKey: "name" });
    const d = await call(R.get, { tenantId: tidA, systemId: crmB, actorUserId: userA }, actor, "car", idB);
    const leaked = await P.customObject.count({ where: { key: "sneak", systemId: { in: [crmB, memA] } } });
    chk("C1.2b-X1.6", "ctx.systemId is re-resolved against the tenant with type CRM: another tenant's CRM system or a MEMBER system id → NOT_FOUND (list/create/get), nothing written",
      (isNotFound(a) || (a.ok && itemsOf(a.v).length === 0)) && isNotFound(b) && (isNotFound(c) || isValidation(c)) && isNotFound(d) && leaked === 0,
      "refused", `${a.err || `list=${itemsOf(a.v).length}`} | ${b.err || "created"} | ${c.err || "created"} | ${d.err || "returned"} | leaked=${leaked}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X3 — recordCount under real concurrency (in-process + separate processes) · key race
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X3 · concurrency ──");
  await call(OBJ.create, cA, actor, { key: "race", label: "แข่ง", labelPlural: "แข่ง", parentType: "CONTACT", titleFieldKey: "plate" });
  await ensureFields(cA, "race", "main", [{ key: "plate", label: "ทะเบียน", type: "TEXT" }]);
  const raceObj = await objRow(crmA, "race");
  {
    const rounds: string[] = [];
    let ok = true;
    let allOk = true;
    for (let r = 0; r < 2; r += 1) {
      const got = await Promise.all(Array.from({ length: 12 }, (_x, i) => call(R.create, cA, actor, "race", { parentId: cX.id, values: { plate: `R${r}-${i}-${rand}` } })));
      if (!got.every((g) => g.ok)) allOk = false;
      const rc = (await objRow(crmA, "race"))?.recordCount;
      const live = await liveCount(raceObj?.id);
      if (rc !== live || live !== 12 * (r + 1)) ok = false;
      rounds.push(`รอบ${r + 1}: rc=${rc} live=${live}`);
    }
    chk("C1.2b-X3.1", "12 records.create fired at once (2 rounds, one module pool ⇒ several real connections) leave recordCount EXACTLY equal to the live rows (24) — 'read, add in JS, write' loses increments",
      ok && allOk, "24 = 24", rounds.join(" · "));
  }
  {
    const live = (await P.customRecord.findMany({ where: { objectId: raceObj?.id, archivedAt: null }, select: { id: true }, orderBy: { createdAt: "asc" }, take: 6 })) as Any[];
    const five = live.slice(0, 5).map((x) => x.id as string);
    const same = live[5]?.id as string;
    const a = await Promise.all(five.map((id) => call(R.archive, cA, actor, "race", id)));
    const rcA = (await objRow(crmA, "race"))?.recordCount;
    const lcA = await liveCount(raceObj?.id);
    chk("C1.2b-X3.2", "5 different records archived at once → recordCount −5 exactly (= live rows 19)", a.every((x) => x.ok) && lcA === 19 && rcA === 19,
      "19 · 19", `rc=${rcA} live=${lcA} archives ok=${a.filter((x) => x.ok).length}`);
    const b = await Promise.all(Array.from({ length: 5 }, () => call(R.archive, cA, actor, "race", same)));
    const rc = (await objRow(crmA, "race"))?.recordCount;
    const lc = await liveCount(raceObj?.id);
    chk("C1.2b-X3.3", "the SAME record archived 5× at once decrements recordCount ONCE (conditional update on archivedAt IS NULL) — rc = live = 18",
      b.some((x) => x.ok) && rc === 18 && lc === 18, "18 · 18", `rc=${rc} live=${lc} sameArchive ok=${b.filter((x) => x.ok).length}`);
  }
  {
    // across 4 separate processes (qc-crm-c0.3 X3.3 technique)
    const runWorkers = async (mode: string, args: string[]): Promise<{ outs: string[]; spawned: boolean }> => {
      const startAt = Date.now() + 45_000;
      const outs = await Promise.all(
        args.map(
          (arg) =>
            new Promise<string>((resolve) => {
              const ch = spawn("pnpm", ["exec", "tsx", "scripts/qc-crm-c1.2b.mts", "--x3-worker", mode, tidA, crmA, userA, "race", String(startAt), arg], { env: process.env });
              let out = "";
              const to = setTimeout(() => { try { ch.kill("SIGKILL"); } catch { /* already gone */ } }, 300_000);
              ch.stdout.on("data", (d: Any) => { out += String(d); });
              ch.stderr.on("data", (d: Any) => { out += String(d); });
              ch.on("error", (e: Any) => { clearTimeout(to); resolve(`SPAWN-ERROR ${String(e)}`); });
              ch.on("close", () => { clearTimeout(to); resolve(out); });
            }),
        ),
      );
      const parsed = outs.flatMap((o) => {
        const m = /X3WORKER (\[.*\])/.exec(o);
        return m ? (JSON.parse(m[1]) as string[]) : ["NO-OUTPUT"];
      });
      return { outs: parsed, spawned: !parsed.includes("NO-OUTPUT") };
    };
    const beforeLive = await liveCount(raceObj?.id);
    const cr = await runWorkers("create", Array.from({ length: 4 }, (_x, i) => `${cX.id}|3|W${i}-${rand}`));
    const rc1 = (await objRow(crmA, "race"))?.recordCount;
    const live1 = await liveCount(raceObj?.id);
    const victims = ((await P.customRecord.findMany({ where: { objectId: raceObj?.id, archivedAt: null }, select: { id: true }, take: 3 })) as Any[]).map((x) => x.id as string);
    const ar = await runWorkers("archive", Array.from({ length: 4 }, () => victims.join(",")));
    const rc2 = (await objRow(crmA, "race"))?.recordCount;
    const live2 = await liveCount(raceObj?.id);
    chk("C1.2b-X3.4a", "[positive control] the 4 worker PROCESSES really ran and answered (12 creates · 12 archive calls) — if red, X3.4/X3.5 prove nothing",
      cr.spawned && cr.outs.length === 12 && ar.spawned && ar.outs.length === 12, "12 · 12", `create=${cr.outs.length} archive=${ar.outs.length} ${cut(cr.outs.concat(ar.outs).filter((x) => x.startsWith("ERR") || x === "NO-OUTPUT").join(" | "), 200)}`, "MAJOR");
    chk("C1.2b-X3.4", "12 creates across 4 SEPARATE PROCESSES (own PrismaClients, synchronised start) → recordCount = live rows = before + 12 (an in-process mutex would pass X3.1 and fail here)",
      cr.outs.every((x) => !x.startsWith("ERR")) && live1 === beforeLive + 12 && rc1 === live1, `${beforeLive + 12}`, `rc=${rc1} live=${live1}`);
    chk("C1.2b-X3.5", "the same 3 records archived by 4 processes at once → recordCount drops by exactly 3 (= live rows)", live2 === live1 - 3 && rc2 === live2, `${live1 - 3}`, `rc=${rc2} live=${live2}`);
  }
  {
    const got = await Promise.all(Array.from({ length: 10 }, () => call(OBJ.create, cA, actor, { key: "samekey", label: "คีย์เดียวกัน", labelPlural: "คีย์เดียวกัน", parentType: "NONE", titleFieldKey: "name" })));
    const rows = await P.customObject.count({ where: { systemId: crmA, key: "samekey" } });
    const wins = got.filter((g) => g.ok).length;
    const cleanLosers = got.filter((g) => !g.ok).every((g) => isRefused(g) && thai(g.msg));
    chk("C1.2b-X3.6", "10 objects.create with the SAME key at once → exactly one object; every loser gets a Thai DUPLICATE/VALIDATION error (not a raw P2002 / 500)",
      rows === 1 && wins === 1 && cleanLosers, "1 row · 1 win", `rows=${rows} wins=${wins} losers=${got.filter((g) => !g.ok).map((g) => g.code || g.err).slice(0, 3).join(",")}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X4 — the record-created consumer: twice / twice in parallel ⇒ ONE parent timeline row
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X4 · redelivery ──");
  const evtOf = (row: Any) => ({ id: row.id, tenantId: row.tenantId, type: row.type, payload: row.payload, systemId: row.systemId, unitId: row.unitId });
  const consume = async (row: Any) => call(CONS?.[row.type], evtOf(row));
  const timelineRows = (customerId: string, recordId: string) => P.memberActivity.count({ where: { tenantId: tidA, customerId, refId: recordId } });
  {
    const rx = await watch("records.create X8/X4 (PII parent)", () => call(R.create, cA, actor, "car", { parentId: cPii.id, values: { plate: SENT_TITLE, mileage: 777 } }));
    const rid = idOf(rx.v);
    const ev = (await evOf("custom.record.created", rid))[0];
    chk("C1.2b-X4.0", "[positive control] the created event exists for a record whose parent contact is linked to a member", !!ev, "1 event", `${rx.err} ev=${!!ev}`, "MAJOR");
    const a = ev ? await watch("consumer created #1", () => consume(ev)) : ({ ok: false, err: "no event" } as Res);
    const b = ev ? await watch("consumer created #2", () => consume(ev)) : ({ ok: false, err: "no event" } as Res);
    const n = await timelineRows(cust.id, rid);
    chk("C1.2b-X4.1", "the custom.record.created consumer run TWICE writes exactly ONE MemberActivity row on the parent's timeline (customer linked to the contact · refId = recordId)",
      a.ok && b.ok && n === 1, "1 row", `${a.err}${b.err} rows=${n}`);
  }
  {
    const rounds: string[] = [];
    let ok = true;
    for (let r = 0; r < 3; r += 1) {
      const rx = await call(R.create, cA, actor, "car", { parentId: cPii.id, values: { plate: `คู่ขนาน-${r}-${rand}` } });
      const rid = idOf(rx.v);
      const ev = (await evOf("custom.record.created", rid))[0];
      const res = ev ? await Promise.all([consume(ev), consume(ev)]) : [];
      const n = await timelineRows(cust.id, rid);
      if (!ev || n !== 1 || !res.every((x) => x.ok)) ok = false;
      rounds.push(`รอบ${r + 1}: rows=${n} ok=${res.filter((x) => x.ok).length}/2`);
    }
    chk("C1.2b-X4.2", "…and run twice IN PARALLEL (3 rounds, fresh record each) still ONE row — flag/lock first, then write (lesson H5)", ok, "1 row every round", rounds.join(" · "));
  }
  {
    const rx = await call(R.create, cA, actor, "car", { parentId: cNoMem.id, values: { plate: `ไม่มีสมาชิก-${rand}` } });
    const rid = idOf(rx.v);
    const ev = (await evOf("custom.record.created", rid))[0];
    const a = ev ? await consume(ev) : ({ ok: false, err: "no event" } as Res);
    const n = await P.memberActivity.count({ where: { tenantId: tidA, refId: rid } });
    chk("C1.2b-X4.3", "a parent contact with NO member: the consumer resolves (a CRM 'extra' never fails the queue) and writes no timeline row",
      !!ev && a.ok && n === 0, "resolves · 0 rows", `${a.err} rows=${n}`, "MAJOR");
  }
  {
    const rx = await call(R.create, cA, actor, "petc", { parentId: cust.id, values: { petName: `น้องแมว ${rand}` } });
    const rid = idOf(rx.v);
    const ev = (await evOf("custom.record.created", rid))[0];
    const res = ev ? await Promise.all([consume(ev), consume(ev)]) : [];
    const n = await timelineRows(cust.id, rid);
    chk("C1.2b-X4.4", "an object whose parent IS a member (CUSTOMER): the consumer writes ONE row on that member's timeline, even when delivered twice at once",
      !!ev && res.every((x) => x.ok) && n === 1, "1 row", `${rx.err} rows=${n}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X6 — import caps · CSV export through csvRow
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X6 · import / export ──");
  const MAX_ROWS = Number(SH?.OBJECT_IMPORT_MAX_ROWS ?? OBJ?.OBJECT_IMPORT_MAX_ROWS ?? NaN);
  const MAX_BYTES = Number(SH?.OBJECT_IMPORT_MAX_BYTES ?? OBJ?.OBJECT_IMPORT_MAX_BYTES ?? NaN);
  const projObj = await objRow(crmA, "project");
  {
    const csv = ["projName,budget,note", `นำเข้า-1-${rand},1000,หนึ่ง`, `นำเข้า-2-${rand},2000,สอง`, `นำเข้า-3-${rand},3000,สาม`].join("\n");
    const rc0 = (await objRow(crmA, "project"))?.recordCount ?? 0;
    const r = await call(R.import, cA, actor, "project", { csv });
    const rows = (await P.customRecord.findMany({ where: { objectId: projObj?.id, title: { startsWith: "นำเข้า-" } } })) as Any[];
    const rc1 = (await objRow(crmA, "project"))?.recordCount ?? 0;
    chk("C1.2b-X6.1", "records.import of a 3-row CSV (header = field keys) creates 3 records, titles from titleFieldKey, recordCount +3",
      r.ok && Number(r.v?.created) === 3 && rows.length === 3 && rc1 - rc0 === 3, "3", `${r.err} created=${r.v?.created} rows=${rows.length} rc ${rc0}→${rc1}`);
  }
  {
    const okConst = Number.isFinite(MAX_ROWS) && MAX_ROWS > 0 && MAX_ROWS <= 50_000 && Number.isFinite(MAX_BYTES) && MAX_BYTES > 0 && MAX_BYTES <= 20 * 1024 * 1024;
    chk("C1.2b-X6.2", "the import caps are named constants in objects-shared (OBJECT_IMPORT_MAX_ROWS ≤ 50,000 · OBJECT_IMPORT_MAX_BYTES ≤ 20 MB) so the UI can say them",
      okConst, "both set", `rows=${MAX_ROWS} bytes=${MAX_BYTES}`, "MAJOR");
    if (okConst) {
      const n0 = await P.customRecord.count({ where: { objectId: projObj?.id } });
      const lines = ["projName,budget,note"];
      for (let i = 0; i <= MAX_ROWS; i += 1) lines.push(`ล้น-${i},1,x`);
      const tooMany = await call(R.import, cA, actor, "project", { csv: lines.join("\n") });
      const n1 = await P.customRecord.count({ where: { objectId: projObj?.id } });
      chk("C1.2b-X6.3", `an import of OBJECT_IMPORT_MAX_ROWS + 1 rows is refused as a whole (VALIDATION, Thai) and creates NOTHING`, isValidation(tooMany) && thai(tooMany.msg) && n1 === n0,
        "refused · 0 rows", `${tooMany.err || `accepted ${j(tooMany.v)}`} rows ${n0}→${n1}`);
      const big = `projName,budget,note\nใหญ่-${rand},1,${"ก".repeat(Math.ceil(MAX_BYTES / 3) + 16)}`;
      const tooBig = await call(R.import, cA, actor, "project", { csv: big });
      const n2 = await P.customRecord.count({ where: { objectId: projObj?.id } });
      chk("C1.2b-X6.4", "an import larger than OBJECT_IMPORT_MAX_BYTES (measured in UTF-8 bytes — Thai is 3 bytes/char) is refused and creates nothing", isValidation(tooBig) && n2 === n0,
        "refused · 0 rows", `${tooBig.err || "accepted"} bytes=${Buffer.byteLength(big)} rows ${n0}→${n2}`);
    }
  }
  {
    const csvLib = (await import("@/lib/core/csv")) as Any;
    const evil = ["=HYPERLINK(\"http://evil.test\",\"x\")", "+SUM(1;2)", "-2+3cmd", "@evilcmd"];
    for (const [i, e] of evil.entries()) await call(R.create, cA, actor, "project", { values: { projName: `ส่งออก-${i}-${rand}`, note: e } });
    await call(R.create, cA, actor, "project", { values: { projName: `=cmd|' /C calc'!A0-${rand}` } });
    const ex = await call(R.export, cA, actor, "project", {});
    const text = typeof ex.v === "string" ? ex.v : String(ex.v?.csv ?? ex.v?.text ?? "");
    const table = csvLib.parseCsv(text) as { headers: string[]; rows: string[][] };
    const cells = [...(table.headers ?? []), ...(table.rows ?? []).flat()];
    const dangerous = cells.filter((c) => /^[\t\r\n ]*[=+\-@]/.test(c) && !/^-?\d+(\.\d+)?$/.test(c));
    const neutral = evil.every((e) => cells.includes(`'${e}`));
    chk("C1.2b-X6.5", "records.export returns CSV in which NO cell starts with = + - @ (every one is neutralised to '…' by csvRow) — including a formula typed into the TITLE field",
      ex.ok && text.length > 0 && dangerous.length === 0 && neutral && cells.includes(`'=cmd|' /C calc'!A0-${rand}`), "0 dangerous · 5 neutralised",
      `${ex.err} dangerous=${cut(dangerous.join(" | "), 160)} neutral=${neutral}`);
    const exCar = await call(R.export, cA, actor, "car", {});
    const carText = typeof exCar.v === "string" ? exCar.v : String(exCar.v?.csv ?? "");
    chk("C1.2b-X6.6", "export is scoped to the system: crmA's 'car' export does not contain the records of 'car' in crmA2 or tenant B", exCar.ok && carText.includes(`AAA-111-${rand}`) && !carText.includes(FOREIGN_TITLE),
      "no foreign rows", `${exCar.err} foreign=${carText.includes(FOREIGN_TITLE)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X9 — confirm + reason on archive-with-records and bulk · bulk cap · audit
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X9 · dangerous actions ──");
  await call(OBJ.create, cA, actor, { key: "car9", label: "รถ ๙", labelPlural: "รถ ๙", parentType: "CONTACT", titleFieldKey: "plate" });
  await ensureFields(cA, "car9", "main", [{ key: "plate", label: "ทะเบียน", type: "TEXT" }]);
  const c9 = await Promise.all(Array.from({ length: 4 }, (_x, i) => call(R.create, cA, actor, "car9", { parentId: c1.id, values: { plate: `X9-${i}-${rand}` } })));
  const ids9 = c9.map((x) => idOf(x.v));
  const obj9 = await objRow(crmA, "car9");
  let bulkRan = false;
  {
    const noReason = await call(OBJ.archive, cA, actor, "car9", { confirmKey: "car9" });
    const shortReason = await call(OBJ.archive, cA, actor, "car9", { confirmKey: "car9", reason: "ok" });
    const still = (await objRow(crmA, "car9"))?.archivedAt;
    chk("C1.2b-X9.1", "archive of an object WITH records needs a reason too: typed key but no reason / a reason < 5 chars → refused, object active",
      isRefused(noReason) && isRefused(shortReason) && still === null, "2× refused", `${noReason.err || "accepted"} | ${shortReason.err || "accepted"}`);
  }
  {
    const noConfirm = await call(R.bulk, cA, actor, "car9", { action: "archive", ids: ids9.slice(0, 2), reason: "ล้างรถที่ขายไปแล้ว" });
    const shortR = await call(R.bulk, cA, actor, "car9", { action: "archive", ids: ids9.slice(0, 2), confirm: true, reason: "ok" });
    const live = await liveCount(obj9?.id);
    chk("C1.2b-X9.2", "bulk archive without confirm, or with confirm but a reason < 5 chars → refused and NOTHING archived", isRefused(noConfirm) && isRefused(shortR) && live === 4,
      "refused · 4 live", `${noConfirm.err || "accepted"} | ${shortR.err || "accepted"} | live=${live}`);
  }
  {
    const b = await watch("records.bulk archive", () => call(R.bulk, cA, actor, "car9", { action: "archive", ids: [...ids9.slice(0, 2), idA2], confirm: true, reason: "ล้างรถที่ขายไปแล้ว" }));
    const live = await liveCount(obj9?.id);
    const rc = (await objRow(crmA, "car9"))?.recordCount;
    const foreign = await recRow(idA2);
    chk("C1.2b-X9.3", "with confirm + reason the bulk archive runs: the 2 own records archived, recordCount −2 exactly, and a foreign id smuggled into `ids` (crmA2) is NOT touched (whole call refused NOT_FOUND, or the foreign id skipped)",
      foreign?.archivedAt === null && ((b.ok && live === 2 && rc === 2) || (isNotFound(b) && live === 4 && rc === 4)),
      "own 2 archived · foreign untouched", `${b.err || j(b.v)} live=${live} rc=${rc} foreignArchived=${foreign?.archivedAt !== null}`);
    bulkRan = b.ok;
  }
  {
    const MAXB = Number(SH?.OBJECT_BULK_MAX ?? OBJ?.OBJECT_BULK_MAX ?? NaN);
    const over = Number.isFinite(MAXB) && MAXB > 0 && MAXB <= 5000
      ? await call(R.bulk, cA, actor, "car9", { action: "archive", ids: Array.from({ length: MAXB + 1 }, (_x, i) => `${TAG}-fake-${i}`), confirm: true, reason: "ทดสอบเพดานงานกลุ่ม" })
      : ({ ok: false, err: "no OBJECT_BULK_MAX", code: "", status: 0, msg: "", v: undefined } as Res);
    chk("C1.2b-X9.4", "bulk has a named cap (OBJECT_BULK_MAX ≤ 5,000) and ids beyond it are VALIDATION before anything is touched", isValidation(over), "VALIDATION", `max=${MAXB} ${over.err || "accepted"}`, "MAJOR");
  }
  {
    const reason = "เลิกใช้วัตถุ ๙ ตามมติที่ประชุม";
    const ar = await call(OBJ.archive, cA, actor, "car9", { confirmKey: "car9", reason });
    const objAudits = (await P.auditLog.findMany({ where: { tenantId: tidA, targetId: obj9?.id } })) as Any[];
    const recAudits = await P.auditLog.count({ where: { tenantId: tidA, targetId: { in: [r1, r2] } } });
    const bulkAudits = await P.auditLog.count({ where: { tenantId: tidA, targetId: { in: ids9.slice(0, 2) } } });
    const reasonKept = objAudits.some((a) => j({ before: a.before, after: a.after }).includes(reason));
    chk("C1.2b-X9.5", "every mutation leaves an AuditLog row: object create + archive (the archive row keeps the typed reason) · record create/update/archive · each record of a bulk archive (or one bulk row naming them)",
      ar.ok && objAudits.length >= 2 && reasonKept && recAudits >= 3 && (!bulkRan || bulkAudits >= 2 || (await P.auditLog.count({ where: { tenantId: tidA, action: { contains: "bulk" } } })) >= 1),
      "audit rows", `${ar.err} obj=${objAudits.length} reason=${reasonKept} rec=${recAudits} bulk=${bulkAudits}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X8 — PDPA: ids only in payloads · nothing personal in OpsEvent / console
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X8 · PDPA ──");
  {
    const ours = (await P.outboxEvent.findMany({ where: { tenantId: { in: TENANTS }, type: { in: EVTS } } })) as Any[];
    const sentinels = [SENT_PHONE, SENT_EMAIL, SENT_NAME, SENT_TITLE, PLATE1, `กข-9999-${rand}`, FOREIGN_TITLE];
    const offenders = ours.filter((o) => sentinels.some((s) => j(o.payload).includes(s))).map((o) => o.type);
    chk("C1.2b-X8.0", "[positive control] events of all 3 types were produced by this run (otherwise X8.1/X8.2 are vacuous)",
      EVTS.every((t) => ours.some((o) => o.type === t)), "3 types", [...new Set(ours.map((o) => o.type))].join(","), "MAJOR");
    chk("C1.2b-X8.1", "no custom.record.* payload carries the parent's phone / e-mail / name, the record title or a field value (the PII-parent record's title is a child's name)",
      offenders.length === 0, "none", `${offenders.length} offenders ${offenders.slice(0, 3).join(",")}`);
    const strings = (v: Any): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === "object" ? Object.values(v).flatMap(strings) : []);
    const prose = ours.flatMap((o) => strings(o.payload).filter((s) => /\s|[ก-๙]/.test(s) || s.length > 64).map((s) => `${o.type}:${cut(s, 30)}`));
    chk("C1.2b-X8.2", "payloads are ids/keys only: no string value with spaces or Thai text anywhere in the payload (catches any label/title/value leak, not just the sentinels)",
      prose.length === 0, "ids only", cut(prose.slice(0, 4).join(" | "), 200), "MAJOR");
  }
  {
    const offenders: string[] = [];
    for (const ev of EVIDENCE) {
      for (const o of ev.ops) {
        const blob = j({ message: o.message, detail: o.detail });
        if ([SENT_PHONE, SENT_EMAIL, SENT_NAME].some((s) => blob.includes(s))) offenders.push(`${ev.label} → OpsEvent`);
      }
      if (ev.logs.some((l) => [SENT_PHONE, SENT_EMAIL, SENT_NAME].some((s) => l.includes(s)))) offenders.push(`${ev.label} → console`);
    }
    chk("C1.2b-X8.3", "no OpsEvent and no console line produced by the service/consumer contains the parent's phone, e-mail or name", offenders.length === 0, "none", offenders.join(" · ") || "-");
  }
} catch (e) {
  chk("C1.2b-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 400));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — trigger first, then every row of the two throwaway tenants (4 FK-safe passes), the systems/units/tenants,
  // and the throwaway user. The shared QC tenant was never touched. No drainOutbox (not tenant-scoped) — our
  // PENDING events are deleted with the tenant sweep.
  // ═════════════════════════════════════════════════════════════════════════════
  await dropTrigger();
  const ids = [tidA, tidB].filter((x) => /^[a-z0-9]+$/i.test(x));
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
    if (userA) await del(() => P.user.delete({ where: { id: userA } }));
    try {
      const left: string[] = [];
      for (const t of tables) {
        const rows = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[];
        const n = Number(rows?.[0]?.n ?? 0);
        if (n > 0) left.push(`${t}=${n}`);
      }
      const tenants = await P.tenant.count({ where: { id: { in: ids } } });
      const users = userA ? await P.user.count({ where: { id: userA } }) : 0;
      const trig = ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = '${TRIG}'`).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0;
      chk("C1.2b-CLEAN", "the oracle gives the QC database back exactly as found — the two throwaway tenants, every row they owned, the throwaway user and the test trigger are gone",
        left.length === 0 && tenants === 0 && users === 0 && Number(trig) === 0, "0 rows · 0 tenants · 0 users · 0 triggers", `${left.join(" · ") || "-"} · tenants=${tenants} users=${users} trig=${trig}`, "MAJOR");
    } catch (e) {
      chk("C1.2b-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C1.2b: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
