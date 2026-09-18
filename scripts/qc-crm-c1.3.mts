// QC — CRM v2 WO C1.3: Companies — `src/lib/modules/crm/companies.ts` (+ `companies-shared.ts` · `where.ts`
//      `companyWhere`) · company list / 360 / new pages · events crm.company.created/updated/merged
// Oracle writer · the C1.3 builder must NOT touch this file · QC database only (.env.qc)
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c1.3.mts
//      (`--force-run` = run every check even while companies.ts is absent — all red, CLEAN green; used by the oracle
//       writer to prove fixtures + cleanup; never needed by the builder)
// requires: crm-seed   (house style — this oracle reads NO seeded row; everything lives in throwaway tenants)
//
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE (not re-implemented here): qc-acc-v2-party · qc-acc-v2-contacts ·
//   qc-acc-v2-contact-merge (account contact/party behaviour must be unchanged) · qc-crm-c1.1 · qc-crm-c1.2a ·
//   qc-crm-c1.2b · qc-member-m1.9 (30/15/10/5 — this file never wins a deal, never emits crm.deal.* and never
//   creates a member: deals are raw fixture rows, no business event is fired).
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// SOURCES: crm-brief-C1.3.md · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-A where.ts, R-C.8 keys, R-E.7/8) ·
//          CRM-RUN §2 "C1.3" (S1–S7 = 26) · blueprint docs/modules/20-crm-v2.md §5.3 §3.4 §7.1 §11.1 §11.9 ·
//          mockup ledger/design-crm/04-company-360.png (panel names only) · CRM-RUN §4 notes on C0.3
//          (`ensureAccountContact` takes no tx — never call it inside a transaction) and C1.1 (both parents of a
//          link row must live in the SAME CRM system).
//
// THE CONTRACT THIS FILE ASSUMES (the builder implements exactly this; tolerated variants in brackets)
//   import * as CO from "@/lib/modules/crm/companies"
//   ctx   = { tenantId, systemId /* a CRM system of that tenant — re-resolved, never trusted */, actorUserId }
//   actor = { userId, role, unitAccess, permissions }   (MemberActor-compatible; OWNER here)
//   errors: thrown, carry `.code` ∈ "NOT_FOUND" | "VALIDATION" | "DUPLICATE" | "CONFIRM_REQUIRED" and a Thai message
//           that never blames the user; foreign ids ⇒ NOT_FOUND (404-not-403) and the message never echoes foreign data.
//   CO.createCompany(ctx, actor, { name, taxId?, branchCode?, emailDomain?, industry?, size?, website?, phone?, email?,
//                                  ownerUserId?, teamId?, parentCompanyId?, fields?: Record<fieldKey, unknown> })
//       → { company: CompanyDto, created: boolean, duplicateOf: string | null,
//           candidates: { companyId: string, reason: "TAX_ID" | "DOMAIN" | "NAME", score?: number }[] }
//       · taxId normalised to 13 digits (dashes/spaces stripped) · malformed ⇒ VALIDATION
//       · same normalised taxId already a live company of THIS system ⇒ created:false, duplicateOf = that id, nothing written
//         [tolerated: throw code DUPLICATE carrying `.duplicateOf`/`.companyId`]
//       · Party COMPANY through party.findOrCreate (tax id → …) — a tax id already on a Party REUSES that Party; if that
//         Party already has an AccountContact in the linked ACCOUNT system ⇒ `accountContactId` set at create
//       · no tax id + similar name / same e-mail domain ⇒ created:true + `candidates`
//       · `fields` = custom fields through the C1.2a engine (`@/lib/modules/member` → `fields`, FieldCtx.objectKey="company");
//         GOVERNED columns (name · taxId · ownerUserId · parentCompanyId · caches) are written by THIS service only —
//         a governed key smuggled through `fields` is either refused or routed through the governed path (Party in sync)
//   CO.updateCompany(ctx, actor, id, patch) → CompanyDto   (name/taxId ⇒ Party kept in sync, taxId normalised)
//   CO.archiveCompany(ctx, actor, id, { confirm: true, reason /* ≥ 5 chars */ }) → CompanyDto   (danger — X9)
//   CO.setOwner(ctx, actor, id, userId | null)            (userId must be a member of the tenant ⇒ else VALIDATION)
//   CO.setParent(ctx, actor, id, parentId | null)         (same system; self/cycle ⇒ VALIDATION)
//   CO.getCompany360(ctx, actor, id) → {
//       company: CompanyDto,
//       kpis: { openDealCount, wonDealCount, wonValueSatang, outstandingSatang, lastActivityAt },   // the 5 numbers (mockup 04)
//       contacts: { contactId, role, jobTitle, isPrimary }[]   (current links only — endedAt null) [tolerated: `id` / `contact.id`],
//       deals: { id, … }[]  (every deal of the company),  documents: { id, … }[]  (account facade listDocsByParty),
//       timeline: unknown[],  parent: { id } | null,  subsidiaries: { id }[] }
//       · outstandingSatang is LIVE from the account facade (`outstandingByContacts`), money = satang as JS numbers
//   CO.listCompanies(ctx, actor, { q?, owner?, industry?, size?, hasOpenDeals?, f?: Record<fieldKey,string>,
//                                  includeArchived?, sort?, page?, pageSize? }) → { items, total }   [tolerated: array]
//   CO.addContact(ctx, actor, companyId, { contactId, role?, jobTitle?, isPrimary? })
//   CO.removeContact(ctx, actor, companyId, contactId)    (link row kept with endedAt set)
//   CO.setPrimary(ctx, actor, companyId, contactId)       (exactly ONE current primary contact per company)
//   CO.setRole(ctx, actor, companyId, contactId, role /* CrmContactRole */)
//   CO.findDuplicates(ctx, actor, opts?) → items each naming two company ids + a reason (TAX_ID | DOMAIN | NAME)
//   CO.mergeCompanies(ctx, actor, { keepId, mergeId, confirm: true, reason /* ≥ 5 */, fieldChoices? })
//       · moves contact links (role clash ⇒ keep's row wins) · deals · account documents (account facade `mergeContacts`)
//       · merged row kept: mergedIntoId = keep, archivedAt set · Party merged into keep's Party · caches of keep recomputed
//   CO.importCompanies(ctx, actor, { csv }) → { created, skipped, errors }   (header row: name,taxId,website,industry,…)
//   CO.importFromAccount(ctx, actor, { accountContactIds }) → unknown   (legalType COMPANY of the LINKED account system only;
//       idempotent; CrmCompany.accountContactId = that contact; CrmCompany.partyId === AccountContact.partyId afterwards)
//   CO.recomputeCaches(ctx, companyId) → unknown   (openDealCount = OPEN deals · wonValueSatang = Σ deal.wonValueSatang of WON
//       deals · outstandingSatang = account outstanding) — exact under concurrency: recompute UNDER A LOCK or deltas, never
//       "read → compute in JS → write"
//   CO.exportCompanies(ctx, actor, opts?) → string   (every line through `csvRow` of @/lib/core/csv)
//   companyWhere(ctx, actor) — the ONE read-scope helper (R-A: `src/lib/modules/crm/where.ts`; companies.ts tolerated)
//   companies-shared.ts (client-safe): COMPANY_IMPORT_MAX_ROWS (≤ 50,000) · COMPANY_IMPORT_MAX_BYTES (≤ 20 MB)
//       [tolerated: exported from companies.ts]
//   ACCOUNT system of a CRM system = AccountSystemLink{ linkedKind: "CRM", linkedId: crmSystemId, enabled, !archived }
//   events (outbox, emitted INSIDE the write tx, key `crm.company.<type>#<companyId>#<seq>`, ids only):
//       crm.company.created {companyId, partyId, …} · crm.company.updated {companyId, changedKeys?} ·
//       crm.company.merged {keptId, mergedId}; consumer of created ⇒ `ensureAccountContact` (ONE AccountContact even when
//       delivered twice / in parallel) + ONE timeline row (CrmActivity.companyId with source ≠ MANUAL, or MemberActivity.crmCompanyId)
//   CrmContact.companyId (cache) is written only by companies.ts. Checked where unambiguous: a contact whose only
//       company link is primary ⇒ that company; a contact with no current link ⇒ null; never the merged company.
//   pages: src/app/app/sys/[id]/crm/companies/{page.tsx, [companyId]/page.tsx, new/page.tsx} · nav `src/lib/modules/crm/nav.ts`
//
// WHAT THIS FILE PROVES
//   S0  structure — files · companyWhere single helper · cache/governed-column writers · csvRow · facades · export surface
//   S1  create: duplicate tax id ⇒ duplicate (same Party) · Party reuse + account link · similar name ⇒ candidate (5)
//   S2  contacts add / idempotent / primary / setPrimary / setRole / remove + CrmContact.companyId cache (6)
//   S3  360: the 5 numbers (outstanding live from the account book) · contacts+roles · deals+documents · parent/children (4)
//   S4  merge moves contacts / deals / documents · merged row + Party (4)
//   S5  importFromAccount: 3 account companies ⇒ 3 CrmCompany linked · idempotent · foreign/PERSON ignored (2)
//   S6  pages list / 360 / new exist + nav + 404 guard (3)    [screenshots owner/thana are the controller's job — D7]
//   S7  events created / updated (2)
//   S8  brief extras: registries · Party sync on update · governed keys via `fields` · list filters + f.{key} · findDuplicates ·
//       setOwner/setParent · recomputeCaches · merged event · importCompanies · events inside the write tx
//   X1  other tenant · OTHER CRM SYSTEM ⇒ NOT_FOUND on get/update/addContact/merge (both ids)/setParent/… · ctx re-resolved
//   X3  caches exact after 12 parallel deal events (3 rounds) and across 4 PROCESSES · parallel setPrimary ⇒ one primary
//       (in-process + 4 processes) · 10 parallel creates of the same tax id ⇒ one company, one Party
//   X4  crm.company.created consumer twice / twice-in-parallel ⇒ one AccountContact + one timeline row · extra never throws
//   X6  website http(s) only · tax id refused when malformed · import caps · import row errors · CSV via csvRow · export scope
//   X8  payloads carry ids only (no phone / e-mail / name / website) · console + OpsEvent clean
//   X9  archive + merge need confirm + reason ≥ 5 · audit rows
//   X2/X5/X7/X10 — n/a: no API key/AI tool (C1.10), no cron pick-up (recomputeCaches is called, not scheduled — C2.10),
//   no public endpoint, no files/secrets in this work order.
//
// HOUSE RULES: SKIP guard (no DB connection before it) · chk(id, title, ok, expected, actual, sev) · two THROWAWAY tenants
// `qc-c13-<rand>` (+ `-b`) swept in `finally` (every table with a tenantId column, 4 FK-safe passes) + the throwaway users ·
// no drainOutbox (not tenant-scoped) · the shared member/CRM QC data is never read or written · last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const CO_FILE = "src/lib/modules/crm/companies.ts";
const SHARED_FILE = "src/lib/modules/crm/companies-shared.ts";
const WHERE_FILE = "src/lib/modules/crm/where.ts";
const NAV_FILE = "src/lib/modules/crm/nav.ts";
const PAGE_DIR = "src/app/app/sys/[id]/crm/companies";
const CO_SPEC = "@/lib/modules/crm/companies";
const SHARED_SPEC = "@/lib/modules/crm/companies-shared";
const WHERE_SPEC = "@/lib/modules/crm/where";
const THIS_FILE = "scripts/qc-crm-c1.3.mts";

const ARGV = process.argv.slice(2);
const WORKER_AT = ARGV.indexOf("--x3-worker");
const FORCE = ARGV.includes("--force-run");

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guard — nothing of C1.3 exists yet ⇒ SKIPPED, no DB connection opened.
// ═══════════════════════════════════════════════════════════════════════════════════
if (!existsSync(CO_FILE) && WORKER_AT < 0 && !FORCE) {
  console.log(`⚠️  SKIPPED — WO C1.3 not built yet (${CO_FILE} missing)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();

const ownerActor = (userId: string) => ({ userId, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> });

// ═══════════════════════════════════════════════════════════════════════════════════
// X3 WORKER MODE — this same file re-invoked as a child process (C1.3-X3.2 / X3.4).
//   argv: --x3-worker <caches|primary> <tenantId> <crmSystemId> <userId> <companyId> <startAtMs> <arg>
//     caches : arg = "<wonStageId>|<dealId,dealId,…>" → per deal (in parallel): flip OPEN→WON in its own statement,
//              then CO.recomputeCaches(ctx, companyId)   (= "a deal event, then the cache refresh it triggers")
//     primary: arg = "<contactId,contactId,…>"          → parallel CO.setPrimary(ctx, actor, companyId, contactId)
//   Own process = own PrismaClient = own pool; all workers wait for the same wall-clock instant.
// ═══════════════════════════════════════════════════════════════════════════════════
if (WORKER_AT >= 0) {
  const [mode, wT, wS, wU, wCo, wStart, wArg] = ARGV.slice(WORKER_AT + 1);
  const COW = (await import(CO_SPEC as string).catch(() => ({}))) as Any;
  const dbw = (await import("@/lib/core/db")) as Any;
  const PW = dbw.prisma as Any;
  const ctx = { tenantId: wT, systemId: wS, actorUserId: wU };
  const actor = ownerActor(wU);
  const waitMs = Number(wStart) - Date.now();
  if (waitMs > 0) await new Promise<void>((r) => setTimeout(r, waitMs));
  const err = (e: Any) => `ERR:${e instanceof Error ? e.message : String(e)}`;
  let out: string[] = [];
  if (mode === "caches") {
    const [wonStage, list] = String(wArg).split("|");
    const ids = String(list ?? "").split(",").filter(Boolean);
    out = await Promise.all(
      ids.map(async (id) => {
        try {
          await PW.$executeRawUnsafe(
            `UPDATE "CrmDeal" SET "kind" = 'WON', "stageId" = $2, "wonValueSatang" = "valueSatang", "closedAt" = now() WHERE "id" = $1`,
            id,
            wonStage,
          );
          if (typeof COW.recomputeCaches !== "function") return "ERR:MISSING_FUNCTION recomputeCaches";
          await COW.recomputeCaches(ctx, wCo);
          return "OK";
        } catch (e) {
          return err(e);
        }
      }),
    );
  } else {
    const ids = String(wArg).split(",").filter(Boolean);
    out = await Promise.all(
      ids.map((id) =>
        typeof COW.setPrimary === "function"
          ? Promise.resolve(COW.setPrimary(ctx, actor, wCo, id)).then(() => "OK").catch(err)
          : Promise.resolve("ERR:MISSING_FUNCTION setPrimary"),
      ),
    );
  }
  console.log(`X3WORKER ${JSON.stringify(out)}`);
  await PW.$disconnect();
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
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const thai = (s: unknown) => typeof s === "string" && s.trim().length > 0 && /[ก-๙]/.test(s);
type Res = { ok: boolean; v: Any; err: string; code: string; status: number; msg: string; e: Any };
/** call anything without letting a missing/throwing function abort the whole file */
const call = async (fn: Any, ...args: Any[]): Promise<Res> => {
  if (typeof fn !== "function") return { ok: false, v: undefined, err: "MISSING_FUNCTION", code: "MISSING_FUNCTION", status: 0, msg: "", e: null };
  try {
    return { ok: true, v: await fn(...args), err: "", code: "", status: 0, msg: "", e: null };
  } catch (e) {
    const x = e as Any;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, v: undefined, err: `${x?.name ?? "Error"}(${x?.code ?? "-"}): ${cut(msg, 160)}`, code: String(x?.code ?? ""), status: Number(x?.status ?? 0), msg, e: x };
  }
};
const isNotFound = (r: Res) => !r.ok && (r.code === "NOT_FOUND" || r.status === 404);
const isValidation = (r: Res) => !r.ok && (r.code === "VALIDATION" || r.code === "BAD_INPUT" || r.status === 400);
const isRefused = (r: Res) => !r.ok && r.code !== "MISSING_FUNCTION" && ["VALIDATION", "BAD_INPUT", "CONFIRM_REQUIRED", "DUPLICATE", "CONFLICT"].includes(r.code);
const itemsOf = (r: Any): Any[] => (Array.isArray(r) ? r : (r?.items ?? r?.rows ?? r?.companies ?? []));
const num = (v: Any): number => (v === null || v === undefined ? NaN : Number(v));
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

// ─────────────────────────── state ───────────────────────────
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c13-${rand}`;
const TRIG = `qc_c13_${rand}`;
const NONE = `${TAG}-none`;
/** company id of a create/update result — never `undefined` (a `where: {id: undefined}` matches an arbitrary row) */
const cid = (v: Any): string => {
  const x = typeof v === "string" ? v : (v?.company?.id ?? v?.id ?? "");
  return typeof x === "string" && x ? x : NONE;
};
const dupOf = (r: Res): string | null =>
  r.ok ? (r.v?.duplicateOf ?? r.v?.duplicate?.companyId ?? r.v?.duplicate?.id ?? null) : (r.e?.duplicateOf ?? r.e?.companyId ?? null);
/** a valid Thai 13-digit tax id (mod-11 check digit) — so a builder that validates the checksum still accepts it */
const taxOf = (): string => {
  const d = Array.from({ length: 12 }, (_x, i) => (i === 0 ? 1 + Math.floor(Math.random() * 8) : Math.floor(Math.random() * 10)));
  const s = d.reduce((a, v, i) => a + v * (13 - i), 0);
  return `${d.join("")}${(11 - (s % 11)) % 10}`;
};
const dashed = (t: string) => `${t[0]}-${t.slice(1, 5)}-${t.slice(5, 10)}-${t.slice(10, 12)}-${t[12]}`;
const spaced = (t: string) => ` ${t.slice(0, 4)} ${t.slice(4, 8)} ${t.slice(8)} `;
// PDPA sentinels (X8) — must never show up in an outbox payload / OpsEvent / console line
const SENT_PHONE = `08${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;
const SENT_EMAIL = `${TAG}-billing@qc-sentinel.example`;
const SENT_NAME = `บริษัท ความลับลูกค้า ${rand} จำกัด`;
const SENT_WEB = `https://${rand}-secret.example/path`;
const FOREIGN_NAME = `ความลับร้านอื่น-${rand}`;
let tidA = "";
let tidB = "";
let TENANTS: string[] = [];
const USERS: string[] = [];

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
/** every .ts/.tsx file under a directory (static checks) */
const walk = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
};

console.log(`\n═══ QC CRM v2 · C1.3 — companies ═══`);
console.log(`[env] DB ${host} · tag ${TAG}${FORCE && !existsSync(CO_FILE) ? " · --force-run with companies.ts ABSENT (every check below is expected red)" : ""}\n`);

try {
  // stale triggers from a run that was killed mid-way (they only ever fired for a deleted tenant — harmless, but tidy up)
  {
    const stale = (await P.$queryRawUnsafe(`SELECT tgname FROM pg_trigger WHERE tgname LIKE 'qc_c13_%'`).catch(() => [])) as Any[];
    for (const s of stale) {
      const n = String(s.tgname);
      if (/^qc_c13_[a-z]+$/.test(n)) {
        await P.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${n} ON "OutboxEvent"`).catch(() => 0);
        await P.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${n}_fn()`).catch(() => 0);
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — structure (static)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S0 · structure ──");
  let importErr = "";
  const CO = (await import(CO_SPEC as string).catch((e: Any) => {
    importErr = e instanceof Error ? e.message : String(e);
    return {};
  })) as Any;
  const SH = (await import(SHARED_SPEC as string).catch(() => null)) as Any;
  const WH = (await import(WHERE_SPEC as string).catch(() => null)) as Any;
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => null)) as Any;
  const MEM = (await import("@/lib/modules/member" as string).catch(() => null)) as Any;
  const F = (MEM?.fields ?? null) as Any;
  const coSrc = read(CO_FILE);
  const allCoSrc = [coSrc, ...(existsSync("src/lib/modules/crm") ? readdirSync("src/lib/modules/crm").filter((f) => /^companies.*\.tsx?$/.test(f) && f !== "companies.ts").map((f) => read(join("src/lib/modules/crm", f))) : [])].join("\n");
  const sharedSrc = read(SHARED_FILE);
  const whereSrc = read(WHERE_FILE);
  chk("C1.3-S0.0", "companies.ts exists and loads (module import does not throw)", existsSync(CO_FILE) && !importErr, "loads", importErr ? cut(importErr) : existsSync(CO_FILE) ? "-" : "file missing");
  {
    const want = ["createCompany", "updateCompany", "archiveCompany", "setOwner", "setParent", "getCompany360", "listCompanies", "addContact", "removeContact",
      "setPrimary", "setRole", "findDuplicates", "mergeCompanies", "importCompanies", "importFromAccount", "recomputeCaches", "exportCompanies"];
    const miss = want.filter((k) => typeof CO?.[k] !== "function");
    chk("C1.3-S0.1", "companies.ts exports the §5.3 surface: create/update/archive/setOwner/setParent · getCompany360 · listCompanies · addContact/removeContact/setPrimary/setRole · findDuplicates/mergeCompanies · importCompanies/importFromAccount · recomputeCaches · exportCompanies",
      miss.length === 0, "all present", miss.join(",") || "-");
  }
  const companyWhere = (WH?.companyWhere ?? CO?.companyWhere) as Any;
  {
    const refs = (coSrc.match(/\bcompanyWhere\b/g) ?? []).length;
    const defs = (whereSrc + allCoSrc).match(/export\s+(async\s+)?function\s+companyWhere\b|export\s+const\s+companyWhere\b/g) ?? [];
    chk("C1.3-S0.2", "ONE read-scope helper `companyWhere(ctx, actor)` is exported (R-A: crm/where.ts — the file C1.7 rewrites; companies.ts tolerated) and companies.ts reads through it (≥ 3 uses) [static]",
      typeof companyWhere === "function" && defs.length === 1 && refs >= 3, "exported once · ≥3 uses", `fn=${typeof companyWhere} defs=${defs.length} usesInCompanies=${refs}`, "MAJOR");
  }
  {
    // no scattered where-clauses: outside companies*.ts / where.ts nothing in the CRM module, its pages or components reads CrmCompany directly
    // (objects*.ts of C1.2b predates companyWhere and is not C1.3's file — excluded here, reported to the controller; C1.7 folds it)
    const files = [...walk("src/lib/modules/crm"), ...walk("src/app/app/sys/[id]/crm"), ...walk("src/components/crm")]
      .filter((f) => !/\/crm\/companies[^/]*\.tsx?$/.test(f) && !/\/crm\/where\.ts$/.test(f) && !/\/crm\/objects[^/]*\.ts$/.test(f));
    const off = files.filter((f) => /\bcrmCompany\s*\.\s*(findFirst|findMany|findUnique|findFirstOrThrow|findUniqueOrThrow|count|aggregate|groupBy)\s*\(/.test(read(f)) || /FROM\s+"CrmCompany"/.test(read(f)));
    chk("C1.3-S0.3", "no scattered company reads: outside companies*.ts and where.ts, no file of the CRM module / CRM pages / CRM components queries CrmCompany directly (pages go through the service, the service through companyWhere) [static]",
      existsSync(CO_FILE) && off.length === 0, "0 files", off.join(", ") || (existsSync(CO_FILE) ? "-" : "companies.ts missing"), "MAJOR");
  }
  {
    // CrmContact.companyId cache — only companies.ts writes it (positive control: companies.ts DOES write it)
    const writesCompanyId = (src: string) => {
      const hits: string[] = [];
      const re = /crmContact\s*\.\s*(update|updateMany|create|createMany|upsert)\s*\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) if (/\bcompanyId\s*[:,}]/.test(src.slice(m.index, m.index + 700))) hits.push(m[1]);
      if (/UPDATE\s+"CrmContact"[\s\S]{0,400}?"companyId"\s*=/.test(src)) hits.push("raw");
      return hits;
    };
    const off = walk("src").filter((f) => !/\/crm\/companies[^/]*\.ts$/.test(f) && writesCompanyId(read(f)).length > 0);
    const own = writesCompanyId(allCoSrc).length;
    chk("C1.3-S0.4", "the CrmContact.companyId cache is written ONLY by companies*.ts (no other file in src/ writes it) and companies*.ts does write it [static]",
      own > 0 && off.length === 0, "companies only", `companies writes=${own} others=${off.join(", ") || "-"}`, "MAJOR");
  }
  {
    // governed CrmCompany columns — written only by the company service (the field engine's generic column writer excluded:
    // that is exactly why the service must route governed keys itself — see S8.3)
    const GOV = ["name", "taxId", "ownerUserId", "parentCompanyId", "openDealCount", "wonValueSatang", "outstandingSatang"];
    const writes = (src: string) => {
      const re = /crmCompany\s*\.\s*(update|updateMany|create|createMany|upsert)\s*\(/g;
      let m: RegExpExecArray | null;
      const hits: string[] = [];
      while ((m = re.exec(src))) {
        const seg = src.slice(m.index, m.index + 900);
        for (const g of GOV) if (new RegExp(`\\b${g}\\s*:`).test(seg)) hits.push(g);
      }
      if (/UPDATE\s+"CrmCompany"/.test(src)) hits.push("raw");
      return hits;
    };
    const off = walk("src")
      .filter((f) => !/\/crm\/companies[^/]*\.ts$/.test(f) && !/\/member\/fields\.ts$/.test(f))
      .map((f) => ({ f, w: writes(read(f)) }))
      .filter((x) => x.w.length > 0);
    chk("C1.3-S0.5", "governed CrmCompany columns (name · taxId · ownerUserId · parentCompanyId · openDealCount · wonValueSatang · outstandingSatang) are written only by companies*.ts [static]",
      existsSync(CO_FILE) && off.length === 0, "companies only", off.map((x) => `${x.f}:${[...new Set(x.w)].join("/")}`).join(", ") || (existsSync(CO_FILE) ? "-" : "companies.ts missing"), "MINOR");
  }
  chk("C1.3-S0.6", "CSV export is built with the shared `csvRow` of @/lib/core/csv (no second CSV engine — MASTER-PLAN §2.8) [static]",
    /import\s*\{[^}]*\bcsvRow\b[^}]*\}\s*from\s*["']@\/lib\/core\/csv["']/.test(allCoSrc), "import { csvRow } from core/csv", "-", "MAJOR");
  chk("C1.3-S0.7", "cross-module calls only through facades: account via `@/lib/modules/account`, party via `@/lib/modules/party`, fields via `@/lib/modules/member` — no deep import into another module [static]",
    /from\s+["']@\/lib\/modules\/account["']/.test(allCoSrc) && /from\s+["']@\/lib\/modules\/party["']/.test(allCoSrc) &&
      !/from\s+["']@\/lib\/modules\/(account|party|member)\/[^"']+["']/.test(allCoSrc) && !/from\s+["']\.\.\/(account|party|member)\//.test(allCoSrc),
    "facades only", cut(allCoSrc.match(/from\s+["'][^"']*modules\/(account|party|member)[^"']*["']/g)?.join(" ") ?? "-"), "MAJOR");
  chk("C1.3-S0.8", "companies-shared.ts exists and is client-safe (the new-company page / import dialog import the caps from 'use client' files): no prisma / core db / server-only import",
    sharedSrc.length > 0 && !/from\s+["'](@prisma\/client|@\/lib\/core\/db|server-only|next\/headers)["']/.test(sharedSrc) && !/from\s+["']\.\/companies["']/.test(sharedSrc),
    "exists · no server import", sharedSrc ? cut(sharedSrc.match(/from\s+["'][^"']+["']/g)?.join(" ") ?? "-") : "missing", "MINOR");
  chk("C1.3-S0.9", "the crm facade (`@/lib/modules/crm` index.ts) exposes the company service (as `companies.*` or top-level createCompany/getCompany360)",
    typeof CRM?.companies?.createCompany === "function" || typeof CRM?.createCompany === "function", "exported", `companies=${typeof CRM?.companies}`, "MINOR");
  chk("C1.3-S0.10", "implementation sites are marked `// AUDIT-CLASS X1` / `X3` / `X6` / `X9` in companies*.ts (COMMON code rules) [static]",
    ["X1", "X3", "X6", "X9"].every((x) => new RegExp(`AUDIT-CLASS ${x}\\b`).test(allCoSrc + whereSrc)), "4 markers", ["X1", "X3", "X6", "X9"].filter((x) => !new RegExp(`AUDIT-CLASS ${x}\\b`).test(allCoSrc + whereSrc)).join(",") || "-", "MINOR");

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — tenant A (crmA ↔ accSys linked · crmA2 not linked · memA) · tenant B (foreign: crmB · accSysB)
  // ═════════════════════════════════════════════════════════════════════════════
  const sysSvc = (await import("@/lib/modules/system/service")) as Any;
  const OBX = (await import("@/lib/outbox-consumers" as string)) as Any;
  const CONS: Any = OBX.consumers;
  const tA = await P.tenant.create({ data: { name: TAG, slug: TAG } });
  tidA = tA.id;
  const tB = await P.tenant.create({ data: { name: `${TAG}-b`, slug: `${TAG}-b` } });
  tidB = tB.id;
  TENANTS = [tidA, tidB];
  const u = await P.user.create({ data: { email: `${TAG}@qc.invalid`, name: `QC ${TAG}` } });
  const userA = u.id as string;
  USERS.push(userA);
  const u2 = await P.user.create({ data: { email: `${TAG}-sales@qc.invalid`, name: `QC sales ${TAG}` } });
  const userSales = u2.id as string;
  USERS.push(userSales);
  const ux = await P.user.create({ data: { email: `${TAG}-stranger@qc.invalid`, name: `QC stranger ${TAG}` } });
  const userStranger = ux.id as string;
  USERS.push(userStranger);
  await P.membership.create({ data: { userId: userA, tenantId: tidA, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  await P.membership.create({ data: { userId: userA, tenantId: tidB, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  await P.membership.create({ data: { userId: userSales, tenantId: tidA, role: "STAFF", unitAccess: ["*"], acceptedAt: new Date() } });
  await P.membership.create({ data: { userId: userStranger, tenantId: tidB, role: "STAFF", unitAccess: ["*"], acceptedAt: new Date() } });
  const mk = async (tid: string, type: string, label: string) => (await sysSvc.createSystem(tid, type, `${label} ${TAG}`)).id as string;
  const crmA = await mk(tidA, "CRM", "CRM");
  const crmA2 = await mk(tidA, "CRM", "CRM สอง");
  const memA = await mk(tidA, "MEMBER", "สมาชิก");
  const accSys = await mk(tidA, "ACCOUNT", "บัญชี");
  const crmB = await mk(tidB, "CRM", "CRM-B");
  const accSysB = await mk(tidB, "ACCOUNT", "บัญชี-B");
  await P.accountSystemLink.create({ data: { tenantId: tidA, systemId: accSys, linkedKind: "CRM", linkedId: crmA } });
  await P.accountSystemLink.create({ data: { tenantId: tidB, systemId: accSysB, linkedKind: "CRM", linkedId: crmB } });
  const actor = ownerActor(userA);
  const cA = { tenantId: tidA, systemId: crmA, actorUserId: userA };
  const cA2 = { tenantId: tidA, systemId: crmA2, actorUserId: userA };
  const cB = { tenantId: tidB, systemId: crmB, actorUserId: userA };

  const mkParty = async (tid: string, name: string, kind = "PERSON", extra: Record<string, Any> = {}) =>
    (await P.party.create({ data: { tenantId: tid, name, kind, ...extra } })).id as string;
  const mkContact = async (tid: string, sys: string, name: string) => {
    const partyId = await mkParty(tid, name);
    const row = await P.crmContact.create({ data: { tenantId: tid, systemId: sys, name, partyId } });
    return row.id as string;
  };
  const mkAccContact = async (tid: string, sys: string, name: string, extra: Record<string, Any> = {}) =>
    (await P.accountContact.create({ data: { tenantId: tid, systemId: sys, kind: "CUSTOMER", legalType: "COMPANY", name, ...extra } })).id as string;
  const mkDoc = async (contactId: string, docType: string, status: string, grand: number, paid: number, docNo: string) =>
    (await P.accountDocument.create({ data: { tenantId: tidA, systemId: accSys, docType, status, direction: "OUT", contactId, grandTotal: grand, subTotal: grand, paidTotal: paid, docNo: `${TAG}-${docNo}` } })).id as string;
  const pipe = await P.crmPipeline.create({
    data: {
      tenantId: tidA, systemId: crmA, name: `ขายหลัก ${TAG}`, isDefault: true,
      stages: { create: [
        { tenantId: tidA, systemId: crmA, name: "เจรจา", kind: "OPEN", probability: 50, sortOrder: 0 },
        { tenantId: tidA, systemId: crmA, name: "ชนะ", kind: "WON", probability: 100, sortOrder: 1 },
        { tenantId: tidA, systemId: crmA, name: "แพ้", kind: "LOST", probability: 0, sortOrder: 2 },
      ] },
    },
    include: { stages: true },
  });
  const stageOf = (k: string) => (pipe.stages as Any[]).find((s) => s.kind === k)?.id as string;
  const stOpen = stageOf("OPEN");
  const stWon = stageOf("WON");
  const stLost = stageOf("LOST");
  const cDealOwner = await mkContact(tidA, crmA, `ผู้ติดต่อของดีล ${TAG}`);
  /** raw fixture deal — no service, no event (qc-member-m1.9 stays untouched: nothing is "won" through the business path) */
  const mkDeal = async (companyId: string, kind: "OPEN" | "WON" | "LOST", value: number, title = `ดีล ${TAG}`) =>
    (await P.crmDeal.create({
      data: {
        tenantId: tidA, systemId: crmA, contactId: cDealOwner, pipelineId: pipe.id, stageId: kind === "OPEN" ? stOpen : kind === "WON" ? stWon : stLost,
        title, valueSatang: value, kind, companyId, ...(kind === "WON" ? { wonValueSatang: BigInt(value), closedAt: new Date() } : kind === "LOST" ? { closedAt: new Date() } : {}),
      },
    })).id as string;
  const truth = async (companyId: string) => {
    const rows = (await P.$queryRawUnsafe(
      `SELECT count(*) FILTER (WHERE "kind" = 'OPEN')::int AS open, count(*) FILTER (WHERE "kind" = 'WON')::int AS won,
              COALESCE(sum("wonValueSatang") FILTER (WHERE "kind" = 'WON'), 0)::bigint AS wonv
         FROM "CrmDeal" WHERE "companyId" = $1 AND "systemId" = $2`,
      companyId,
      crmA,
    )) as Any[];
    return { open: Number(rows[0]?.open ?? 0), won: Number(rows[0]?.won ?? 0), wonv: Number(rows[0]?.wonv ?? 0) };
  };
  const coRow = (id: string) => P.crmCompany.findFirst({ where: { id } }) as Promise<Any>;
  const partyRow = (id: string | null | undefined) => P.party.findFirst({ where: { id: id || NONE } }) as Promise<Any>;
  const links = (companyId: string) => P.crmCompanyContact.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  const primaries = async (companyId: string) => (await links(companyId)).filter((l) => l.isPrimary && !l.endedAt);
  const evOf = async (type: string, id: string) =>
    (await P.outboxEvent.findMany({ where: { tenantId: tidA, type, idempotencyKey: { startsWith: `${type}#${id}#` } }, orderBy: { createdAt: "asc" } })) as Any[];
  const evtOf = (row: Any) => ({ id: row.id, tenantId: row.tenantId, type: row.type, payload: row.payload, systemId: row.systemId, unitId: row.unitId });
  const consume = async (row: Any) => call(CONS?.[row.type], evtOf(row));
  const create = (c: Any, input: Record<string, Any>) => call(CO.createCompany, c, actor, input);
  /** fixture helper: make sure a company has an AccountContact link — consumer first, raw fallback (so S3/S4 test only their own subject) */
  const ensureAC = async (companyId: string): Promise<string> => {
    let row = await coRow(companyId);
    if (!row) return NONE;
    if (!row.accountContactId) {
      const ev = (await evOf("crm.company.created", companyId))[0];
      if (ev) await consume(ev);
      row = await coRow(companyId);
    }
    if (!row?.accountContactId) {
      const ac = await mkAccContact(tidA, accSys, row.name, { partyId: row.partyId });
      await P.crmCompany.update({ where: { id: companyId }, data: { accountContactId: ac } });
      return ac;
    }
    return row.accountContactId as string;
  };
  /** fixture company for groups whose SUBJECT is not createCompany: the service first; if it fails, a raw row (Party COMPANY +
   *  CrmCompany) so the group still tests its own subject and a missing create never cascades into a crash */
  const fx = async (c: Any, input: Record<string, Any>): Promise<string> => {
    const r = await create(c, input);
    const id = cid(r.v);
    if (id !== NONE && (await coRow(id))) return id;
    const partyId = await mkParty(c.tenantId, String(input.name), "COMPANY");
    return (await P.crmCompany.create({ data: { tenantId: c.tenantId, systemId: c.systemId, name: String(input.name), partyId } })).id as string;
  };
  console.log(`[setup] tenant A ${tidA} · tenant B ${tidB} · crmA ${crmA} · crmA2 ${crmA2} · accSys ${accSys}\n`);

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — create: duplicate by tax id · Party reuse · candidates
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S1 · create ──");
  const TAX1 = taxOf();
  const r1 = await watch("createCompany S1.1", () => create(cA, { name: `ไทยทัวร์เอเชีย ${rand}`, taxId: dashed(TAX1), industry: "ท่องเที่ยว", size: "MEDIUM", emailDomain: `thaitour-${rand}.co.th`, website: "https://thaitour.example" }));
  const co1 = cid(r1.v);
  const co1Row = await coRow(co1);
  const co1Party = await partyRow(co1Row?.partyId);
  chk("C1.3-S1.1", "createCompany stores the tax id NORMALISED (\"0-1055-…\" ⇒ 13 digits) on CrmCompany and on its Party, the Party is kind COMPANY, created:true",
    r1.ok && r1.v?.created === true && co1Row?.systemId === crmA && co1Row?.taxId === TAX1 && co1Party?.kind === "COMPANY" && co1Party?.taxId === TAX1,
    `taxId ${TAX1} · Party COMPANY`, `${r1.err} created=${r1.v?.created} row.taxId=${co1Row?.taxId} party=${j(co1Party ? { k: co1Party.kind, t: co1Party.taxId } : null)}`);
  {
    const before = await P.crmCompany.count({ where: { systemId: crmA } });
    const partiesBefore = await P.party.count({ where: { tenantId: tidA, taxId: TAX1 } });
    const r = await create(cA, { name: `บริษัท ไทยทัวร์ ชื่ออื่น ${rand}`, taxId: spaced(TAX1) });
    const after = await P.crmCompany.count({ where: { systemId: crmA } });
    const partiesAfter = await P.party.count({ where: { tenantId: tidA, taxId: TAX1 } });
    chk("C1.3-S1.2", "the SAME tax id typed differently (spaces) ⇒ duplicate: created:false · duplicateOf = the existing company (its Party) · no second CrmCompany, no second Party",
      dupOf(r) === co1 && (r.ok ? r.v?.created === false : r.code === "DUPLICATE") && after === before && partiesAfter === partiesBefore,
      `duplicateOf ${co1} · +0 rows`, `${r.err} dup=${dupOf(r)} created=${r.v?.created} rows ${before}→${after} parties ${partiesBefore}→${partiesAfter}`);
  }
  {
    // a Party that already exists (from accounting) with an AccountContact in the LINKED account system
    const TAX3 = taxOf();
    const p3 = await mkParty(tidA, `บจก. บัญชีมาก่อน ${rand}`, "COMPANY", { taxId: TAX3 });
    const ac3 = await mkAccContact(tidA, accSys, `บจก. บัญชีมาก่อน ${rand}`, { taxId: TAX3, partyId: p3 });
    const r = await create(cA, { name: `บัญชีมาก่อน ${rand}`, taxId: dashed(TAX3) });
    const row = await coRow(cid(r.v));
    chk("C1.3-S1.3", "a tax id already on a Party REUSES that Party (party.findOrCreate order tax id → …) and, because the Party already has an AccountContact in the linked ACCOUNT system, accountContactId is set at create",
      r.ok && row?.partyId === p3 && row?.accountContactId === ac3, `partyId ${p3} · accountContactId ${ac3}`, `${r.err} partyId=${row?.partyId} ac=${row?.accountContactId}`);
  }
  {
    const r = await create(cA, { name: `ไทยทัวร์เอเชีย ${rand} จำกัด` });
    const row = await coRow(cid(r.v));
    const cands = (r.v?.candidates ?? []) as Any[];
    const hit = cands.find((c) => (c?.companyId ?? c?.id) === co1);
    chk("C1.3-S1.4", "no tax id + a very similar name ⇒ the company IS created (own Party, created:true) and `candidates` names the existing company with reason NAME — never merged silently",
      r.ok && r.v?.created === true && !!row && row.partyId !== co1Row?.partyId && !!hit && String(hit?.reason ?? "").toUpperCase() === "NAME",
      `created · candidate ${co1}/NAME`, `${r.err} created=${r.v?.created} ownParty=${!!row && row.partyId !== co1Row?.partyId} cands=${cut(j(cands), 160)}`);
  }
  {
    const r = await create(cA2, { name: `ไทยทัวร์เอเชีย ${rand}`, taxId: TAX1 });
    const row = await coRow(cid(r.v));
    chk("C1.3-S1.5", "another CRM system of the same shop: the same tax id ⇒ a NEW row of that system sharing the SAME Party (§11.1 \"cross-system = separate row, one Party\") — not a duplicate of the other system's company",
      r.ok && r.v?.created === true && row?.systemId === crmA2 && row?.partyId === co1Row?.partyId && dupOf(r) === null,
      `new crmA2 row · party ${co1Row?.partyId}`, `${r.err} sys=${row?.systemId === crmA2} party=${row?.partyId} dup=${dupOf(r)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — contacts: add / idempotent / primary / setPrimary / setRole / remove + cache
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2 · contacts ──");
  const co2 = await fx(cA, { name: `บจก. ผู้ติดต่อหลายคน ${rand}` });
  const k1 = await mkContact(tidA, crmA, `คุณวรรณา ${rand}`);
  const k2 = await mkContact(tidA, crmA, `คุณสมพงษ์ ${rand}`);
  const ctRow = (id: string) => P.crmContact.findFirst({ where: { id } }) as Promise<Any>;
  {
    const r = await call(CO.addContact, cA, actor, co2, { contactId: k1, role: "DECISION_MAKER", jobTitle: "ผู้จัดการฝ่ายกิจกรรม", isPrimary: true });
    const l = (await links(co2)).find((x) => x.contactId === k1);
    const c = await ctRow(k1);
    chk("C1.3-S2.1", "addContact(existing contact, role, jobTitle, isPrimary) ⇒ one CrmCompanyContact row with those values (tenantId set) and the contact's companyId cache = this company",
      r.ok && l?.role === "DECISION_MAKER" && l?.jobTitle === "ผู้จัดการฝ่ายกิจกรรม" && l?.isPrimary === true && !l?.endedAt && l?.tenantId === tidA && c?.companyId === co2,
      "row + cache", `${r.err} link=${j(l ? { r: l.role, p: l.isPrimary, t: l.tenantId === tidA } : null)} cache=${c?.companyId}`);
  }
  {
    const r = await call(CO.addContact, cA, actor, co2, { contactId: k1, role: "OTHER" });
    const rows = (await links(co2)).filter((x) => x.contactId === k1);
    chk("C1.3-S2.2", "adding the same contact again never makes a second link row and never leaks a raw P2002 (accepted idempotently, or refused DUPLICATE/VALIDATION in Thai)",
      rows.length === 1 && (r.ok || (isRefused(r) && thai(r.msg))), "1 row", `${r.err || "accepted"} rows=${rows.length}`);
  }
  {
    const r = await call(CO.addContact, cA, actor, co2, { contactId: k2, role: "INFLUENCER", jobTitle: "ฝ่ายจัดซื้อ", isPrimary: true });
    const pr = await primaries(co2);
    const c2 = await ctRow(k2);
    chk("C1.3-S2.3", "a second contact added as primary ⇒ it becomes THE primary, the first is demoted (exactly one primary), and its companyId cache = this company",
      r.ok && pr.length === 1 && pr[0].contactId === k2 && c2?.companyId === co2, "1 primary = k2", `${r.err} primaries=${pr.map((x) => x.contactId === k2 ? "k2" : x.contactId === k1 ? "k1" : "?").join(",")} cache=${c2?.companyId}`);
  }
  {
    const r = await call(CO.setPrimary, cA, actor, co2, k1);
    const pr = await primaries(co2);
    chk("C1.3-S2.4", "setPrimary(k1) ⇒ k1 is the only primary", r.ok && pr.length === 1 && pr[0].contactId === k1, "1 primary = k1", `${r.err} primaries=${pr.length}:${pr.map((x) => (x.contactId === k1 ? "k1" : "k2")).join(",")}`);
  }
  {
    const r = await call(CO.setRole, cA, actor, co2, k2, "BILLING");
    const bad = await call(CO.setRole, cA, actor, co2, k2, "HACKER");
    const l = (await links(co2)).find((x) => x.contactId === k2);
    chk("C1.3-S2.5", "setRole(k2, BILLING) updates the role · an unknown role is VALIDATION (Thai) and leaves BILLING in place",
      r.ok && isValidation(bad) && thai(bad.msg) && l?.role === "BILLING", "BILLING · refused", `${r.err} | ${bad.err || "accepted"} role=${l?.role}`);
  }
  {
    const r = await call(CO.removeContact, cA, actor, co2, k1);
    const l = (await links(co2)).find((x) => x.contactId === k1);
    const c = await ctRow(k1);
    const pr = await primaries(co2);
    chk("C1.3-S2.6", "removeContact(k1 — the primary) keeps the row with endedAt set (history), k1 is no longer a current primary, and k1's companyId cache is cleared (no other company)",
      r.ok && !!l && !!l.endedAt && !pr.some((x) => x.contactId === k1) && c?.companyId === null, "endedAt · cache null", `${r.err} endedAt=${l?.endedAt ?? "-"} stillPrimary=${pr.some((x) => x.contactId === k1)} cache=${c?.companyId}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — 360 DTO: the 5 numbers · contacts · deals + documents · parent / subsidiaries
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3 · company 360 ──");
  const co3 = await fx(cA, { name: `ไทยทัวร์ 360 ${rand}`, taxId: taxOf(), industry: "ท่องเที่ยว" });
  const ac3 = await ensureAC(co3);
  const acOther = await mkAccContact(tidA, accSys, `ลูกค้าอื่น ${rand}`, { partyId: await mkParty(tidA, `ลูกค้าอื่น ${rand}`, "COMPANY") });
  const docs3 = [
    await mkDoc(ac3, "INVOICE", "AWAITING_PAYMENT", 18_000_000, 0, "INV1"),
    await mkDoc(ac3, "INVOICE", "PARTIAL", 5_000_000, 2_000_000, "INV2"),
    await mkDoc(ac3, "RECEIPT", "PAID", 22_800_000, 22_800_000, "RC1"),
    await mkDoc(ac3, "QUOTATION", "AWAITING_ACCEPT", 36_000_000, 0, "QT1"),
  ];
  const docOther = await mkDoc(acOther, "INVOICE", "AWAITING_PAYMENT", 99_900, 0, "INV-OTHER");
  const OUT3 = 18_000_000 + 3_000_000;
  const deals3 = [
    await mkDeal(co3, "OPEN", 36_000_000), await mkDeal(co3, "OPEN", 22_800_000),
    await mkDeal(co3, "WON", 18_000_000), await mkDeal(co3, "WON", 4_800_000), await mkDeal(co3, "WON", 18_000_000),
    await mkDeal(co3, "LOST", 1_000_000),
  ];
  const WON3 = 18_000_000 + 4_800_000 + 18_000_000;
  const dealOther = await mkDeal(await fx(cA, { name: `บริษัทอื่น 360 ${rand}` }), "OPEN", 777_700);
  const k3a = await mkContact(tidA, crmA, `คุณกิตติ ${rand}`);
  const k3b = await mkContact(tidA, crmA, `คุณนภา ${rand}`);
  const k3gone = await mkContact(tidA, crmA, `คุณลาออก ${rand}`);
  await call(CO.addContact, cA, actor, co3, { contactId: k3a, role: "DECISION_MAKER", jobTitle: "กรรมการผู้จัดการ", isPrimary: true });
  await call(CO.addContact, cA, actor, co3, { contactId: k3b, role: "BILLING", jobTitle: "ฝ่ายบัญชี" });
  await call(CO.addContact, cA, actor, co3, { contactId: k3gone, role: "OTHER" });
  await call(CO.removeContact, cA, actor, co3, k3gone);
  const ACT_AT = new Date(Date.now() - 2 * 86_400_000);
  await P.crmActivity.create({ data: { tenantId: tidA, systemId: crmA, companyId: co3, type: "CALL", title: `โทรคุยสัญญา ${TAG}`, startAt: ACT_AT, doneAt: ACT_AT, createdAt: ACT_AT } });
  await P.crmCompany.updateMany({ where: { id: co3 }, data: { lastActivityAt: ACT_AT } });
  await call(CO.recomputeCaches, cA, co3);
  const v3 = await call(CO.getCompany360, cA, actor, co3);
  const d3 = v3.v ?? {};
  {
    const k = d3.kpis ?? {};
    const la = k.lastActivityAt ? new Date(k.lastActivityAt).getTime() : NaN;
    const ok = v3.ok && num(k.openDealCount) === 2 && num(k.wonDealCount) === 3 && num(k.wonValueSatang) === WON3 && num(k.outstandingSatang) === OUT3 && Math.abs(la - ACT_AT.getTime()) < 60_000;
    chk("C1.3-S3.1", "360 kpis = the 5 numbers of mockup 04: open deals 2 · won deals 3 · won value ฿408,000 · outstanding ฿210,000 LIVE from the account book (awaiting + partial remainder; paid receipt / quotation / other customer excluded) · last activity 2 days ago",
      ok, `2 · 3 · ${WON3} · ${OUT3} · ${ACT_AT.toISOString()}`, `${v3.err} ${cut(j(k), 220)}`);
  }
  {
    const cs = (d3.contacts ?? []) as Any[];
    const idOfC = (c: Any) => c?.contactId ?? c?.contact?.id ?? c?.id;
    const a = cs.find((c) => idOfC(c) === k3a);
    const b = cs.find((c) => idOfC(c) === k3b);
    chk("C1.3-S3.2", "360 contacts = the CURRENT links with role, job title and the primary flag (k3a primary DECISION_MAKER · k3b BILLING) — a removed contact is not listed",
      v3.ok && cs.length === 2 && a?.isPrimary === true && a?.role === "DECISION_MAKER" && b?.role === "BILLING" && b?.isPrimary !== true && !cs.some((c) => idOfC(c) === k3gone),
      "2 contacts", `${v3.err} n=${cs.length} ${cut(j(cs.map((c) => ({ id: idOfC(c) === k3a ? "a" : idOfC(c) === k3b ? "b" : idOfC(c) === k3gone ? "GONE" : "?", r: c?.role, p: c?.isPrimary }))), 200)}`);
  }
  {
    const ds = ((d3.deals ?? []) as Any[]).map((x) => x?.id ?? x?.dealId);
    const docs = ((d3.documents ?? d3.docs ?? []) as Any[]).map((x) => x?.id ?? x?.documentId);
    chk("C1.3-S3.3", "360 deals = every deal of the company (open, won, lost — 6) and none of another company · documents = the 4 account documents of its AccountContact (account facade) and none of another customer",
      v3.ok && sameSet(ds, deals3) && !ds.includes(dealOther) && sameSet(docs, docs3) && !docs.includes(docOther),
      "6 deals · 4 docs", `${v3.err} deals=${ds.length}${ds.includes(dealOther) ? "+FOREIGN" : ""} docs=${docs.length}${docs.includes(docOther) ? "+FOREIGN" : ""}`);
  }
  {
    const chId = await fx(cA, { name: `ไทยทัวร์ (สาขาเชียงใหม่) ${rand}` });
    const sp = await call(CO.setParent, cA, actor, chId, co3);
    const vp = await call(CO.getCompany360, cA, actor, co3);
    const vc = await call(CO.getCompany360, cA, actor, chId);
    const subs = ((vp.v?.subsidiaries ?? vp.v?.children ?? []) as Any[]).map((x) => x?.id ?? x?.companyId);
    const par = vc.v?.parent?.id ?? vc.v?.parent?.companyId ?? vc.v?.company?.parentCompanyId;
    chk("C1.3-S3.4", "setParent(child → co3) ⇒ co3's 360 lists the child under subsidiaries and the child's 360 names co3 as parent (บริษัทในเครือ)",
      sp.ok && subs.includes(chId) && par === co3, "linked both ways", `${sp.err}${vp.err}${vc.err} subs=${subs.length} parent=${par === co3}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — merge moves contacts / deals / documents
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S4 · merge ──");
  const coK = await fx(cA, { name: `บริษัทหลัก ${rand}`, taxId: taxOf() });
  const coM = await fx(cA, { name: `บริษัทหลัก (ซ้ำ) ${rand}` });
  const acK = await ensureAC(coK);
  const acM = await ensureAC(coM);
  const docM = await mkDoc(acM, "INVOICE", "AWAITING_PAYMENT", 1_000_000, 0, "INV-M");
  const km1 = await mkContact(tidA, crmA, `คุณเฉพาะบริษัทซ้ำ ${rand}`);
  const km2 = await mkContact(tidA, crmA, `คุณอยู่ทั้งสอง ${rand}`);
  await call(CO.addContact, cA, actor, coM, { contactId: km1, role: "COORDINATOR", isPrimary: true });
  await call(CO.addContact, cA, actor, coK, { contactId: km2, role: "BILLING" });
  await call(CO.addContact, cA, actor, coM, { contactId: km2, role: "TECHNICAL" });
  const dealM = await mkDeal(coM, "OPEN", 2_500_000);
  const dealK = await mkDeal(coK, "OPEN", 1_500_000);
  const mRowBefore = await coRow(coM);
  const mergeReason = "จดทะเบียนซ้ำ บริษัทเดียวกัน";
  // X9 refusals FIRST (nothing may change), then the real merge
  const mNoConfirm = await call(CO.mergeCompanies, cA, actor, { keepId: coK, mergeId: coM, reason: mergeReason });
  const mShort = await call(CO.mergeCompanies, cA, actor, { keepId: coK, mergeId: coM, confirm: true, reason: "ซ้ำ" });
  const mStateAfterRefusals = { m: await coRow(coM), deal: await P.crmDeal.findFirst({ where: { id: dealM } }) };
  const mg = await watch("mergeCompanies", () => call(CO.mergeCompanies, cA, actor, { keepId: coK, mergeId: coM, confirm: true, reason: mergeReason }));
  {
    const kl = (await links(coK)).filter((l) => !l.endedAt);
    const ml = (await links(coM)).filter((l) => !l.endedAt);
    const km2Rows = kl.filter((l) => l.contactId === km2);
    const c1 = await ctRow(km1);
    chk("C1.3-S4.1", "merge moves the contact links to the kept company (km1 now on K · km2 ONE row on K keeping K's role BILLING) · the merged company has no current link · no contact's companyId cache points at the merged company",
      mg.ok && kl.some((l) => l.contactId === km1) && km2Rows.length === 1 && km2Rows[0].role === "BILLING" && ml.length === 0 && c1?.companyId !== coM && (await P.crmContact.count({ where: { companyId: coM } })) === 0,
      "moved", `${mg.err} K=${kl.length} km2Rows=${km2Rows.map((l) => l.role).join(",")} M=${ml.length} km1.cache=${c1?.companyId === coK ? "K" : c1?.companyId === coM ? "M" : c1?.companyId}`);
  }
  {
    const d = await P.crmDeal.findFirst({ where: { id: dealM } });
    const kRow = await coRow(coK);
    const t = await truth(coK);
    chk("C1.3-S4.2", "merge re-points the merged company's deals to the kept company and the kept company's openDealCount cache is exact afterwards (2)",
      mg.ok && d?.companyId === coK && t.open === 2 && kRow?.openDealCount === 2, "deal on K · cache 2", `${mg.err} deal.companyId=${d?.companyId === coK ? "K" : d?.companyId} truth=${t.open} cache=${kRow?.openDealCount}`);
  }
  {
    const doc = await P.accountDocument.findFirst({ where: { id: docM } });
    const acMRow = await P.accountContact.findFirst({ where: { id: acM } });
    const vk = await call(CO.getCompany360, cA, actor, coK);
    const docs = ((vk.v?.documents ?? vk.v?.docs ?? []) as Any[]).map((x) => x?.id ?? x?.documentId);
    chk("C1.3-S4.3", "merge moves the account documents through the account facade `mergeContacts`: the merged company's invoice now belongs to the kept AccountContact (acM.mergedIntoId = acK) and shows in K's 360 (documents + outstanding)",
      mg.ok && doc?.contactId === acK && acMRow?.mergedIntoId === acK && docs.includes(docM) && num(vk.v?.kpis?.outstandingSatang) === 1_000_000,
      "doc on acK · in 360", `${mg.err} doc.contactId=${doc?.contactId === acK ? "acK" : doc?.contactId === acM ? "acM" : doc?.contactId} acM.merged=${acMRow?.mergedIntoId === acK} in360=${docs.includes(docM)} out=${vk.v?.kpis?.outstandingSatang}`);
  }
  {
    const mRow = await coRow(coM);
    const kRow = await coRow(coK);
    const mp = await partyRow(mRow?.partyId);
    const list = await call(CO.listCompanies, cA, actor, { q: `บริษัทหลัก`, pageSize: 200 });
    const ids = itemsOf(list.v).map((x) => cid(x));
    chk("C1.3-S4.4", "the merged row is KEPT (mergedIntoId = keep, archivedAt set), its Party is merged into the kept company's Party, and the list no longer shows it",
      mg.ok && mRow?.mergedIntoId === coK && !!mRow?.archivedAt && mp?.mergedIntoId === kRow?.partyId && ids.includes(coK) && !ids.includes(coM),
      "kept · party merged · hidden", `${mg.err} mergedInto=${mRow?.mergedIntoId === coK} archived=${!!mRow?.archivedAt} party=${mp?.mergedIntoId === kRow?.partyId} list=${ids.includes(coK)}/${ids.includes(coM)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 — importFromAccount
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S5 · import from account ──");
  const accIds = [
    await mkAccContact(tidA, accSys, `บจก. จากบัญชี หนึ่ง ${rand}`, { taxId: taxOf() }),
    await mkAccContact(tidA, accSys, `บจก. จากบัญชี สอง ${rand}`, { taxId: taxOf() }),
    await mkAccContact(tidA, accSys, `หจก. จากบัญชี สาม ${rand}`, { partyId: await mkParty(tidA, `หจก. จากบัญชี สาม ${rand}`, "COMPANY") }),
  ];
  const accPerson = await mkAccContact(tidA, accSys, `นายบุคคล ${rand}`, { legalType: "PERSON" });
  const accForeign = await mkAccContact(tidB, accSysB, FOREIGN_NAME, { taxId: taxOf() });
  const imp = await call(CO.importFromAccount, cA, actor, { accountContactIds: accIds });
  {
    const rows = (await P.crmCompany.findMany({ where: { systemId: crmA, accountContactId: { in: accIds } } })) as Any[];
    const acs = (await P.accountContact.findMany({ where: { id: { in: accIds } } })) as Any[];
    const acBy = new Map(acs.map((a) => [a.id as string, a]));
    const parties = (await P.party.findMany({ where: { id: { in: rows.map((r) => r.partyId) } } })) as Any[];
    const consistent = rows.every((r) => acBy.get(r.accountContactId)?.partyId === r.partyId && !!r.partyId);
    chk("C1.3-S5.1", "importFromAccount(3 account companies) ⇒ exactly 3 CrmCompany rows in this CRM system, each linked by accountContactId, each with a COMPANY Party that is ALSO the AccountContact's partyId (one identity on both sides)",
      imp.ok && rows.length === 3 && new Set(rows.map((r) => r.accountContactId)).size === 3 && consistent && parties.length === 3 && parties.every((p) => p.kind === "COMPANY"),
      "3 linked", `${imp.err} rows=${rows.length} consistent=${consistent} parties=${parties.map((p) => p.kind).join(",")}`);
  }
  {
    const again = await call(CO.importFromAccount, cA, actor, { accountContactIds: [...accIds, accPerson, accForeign] });
    const rows = await P.crmCompany.count({ where: { systemId: crmA, accountContactId: { in: accIds } } });
    const extra = await P.crmCompany.count({ where: { accountContactId: { in: [accPerson, accForeign] } } });
    const foreignNamed = await P.crmCompany.count({ where: { tenantId: tidA, name: FOREIGN_NAME } });
    chk("C1.3-S5.2", "importing again is idempotent (still 3) and a PERSON account contact or another shop's account contact is never imported (skipped or NOT_FOUND — no row)",
      (again.ok || isNotFound(again) || isValidation(again)) && rows === 3 && extra === 0 && foreignNamed === 0, "3 · 0 extra", `${again.err || "ok"} rows=${rows} extra=${extra} foreign=${foreignNamed}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S6 — pages (static; screenshots owner/thana 1440/390 are the controller's gate D7)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S6 · pages ──");
  {
    const p = join(PAGE_DIR, "page.tsx");
    const nav = read(NAV_FILE);
    chk("C1.3-S6.1", "company list page exists (`/crm/companies/page.tsx`) and crm/nav.ts (created by C1.3) registers the companies path",
      existsSync(p) && /\/crm\/companies\b|["']\/companies["']/.test(nav), "page + nav", `page=${existsSync(p)} nav=${existsSync(NAV_FILE)}`, "MAJOR");
  }
  {
    const p = join(PAGE_DIR, "[companyId]", "page.tsx");
    const src = read(p);
    chk("C1.3-S6.2", "company 360 page exists (`/crm/companies/[companyId]/page.tsx`) and follows the 404-not-403 guard (notFound() — COMMON page guard pattern)",
      existsSync(p) && /\bnotFound\s*\(/.test(src), "page + notFound()", `page=${existsSync(p)} notFound=${/\bnotFound\s*\(/.test(src)}`, "MAJOR");
  }
  {
    const p = join(PAGE_DIR, "new", "page.tsx");
    chk("C1.3-S6.3", "new-company page exists (`/crm/companies/new/page.tsx`)", existsSync(p), "page", `page=${existsSync(p)}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S7 — events created / updated
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S7 · events ──");
  {
    const ev = await evOf("crm.company.created", co1);
    const keyRe = new RegExp(`^crm\\.company\\.created#${co1}#[^#\\s]+$`);
    chk("C1.3-S7.1", "createCompany emits exactly ONE crm.company.created — key `crm.company.created#<companyId>#<seq>` (R-C.8), systemId = the CRM system, payload.companyId + payload.partyId",
      ev.length === 1 && keyRe.test(ev[0].idempotencyKey) && ev[0].systemId === crmA && ev[0].payload?.companyId === co1 && ev[0].payload?.partyId === co1Row?.partyId,
      "1 event", `n=${ev.length} ${cut(j(ev[0] ? { k: ev[0].idempotencyKey, s: ev[0].systemId === crmA, p: ev[0].payload } : null), 200)}`);
  }
  {
    const a = await call(CO.updateCompany, cA, actor, co1, { industry: "ท่องเที่ยวและกิจกรรม" });
    const b = await call(CO.updateCompany, cA, actor, co1, { size: "LARGE" });
    const ev = await evOf("crm.company.updated", co1);
    chk("C1.3-S7.2", "two separate updates emit TWO crm.company.updated events (distinct `#<seq>` — a key of only the id would swallow every update after the first), payload.companyId set",
      a.ok && b.ok && ev.length >= 2 && new Set(ev.map((e) => e.idempotencyKey)).size === ev.length && ev.every((e) => e.payload?.companyId === co1),
      "≥2 distinct", `${a.err}${b.err} n=${ev.length} ${ev.map((e) => e.idempotencyKey).join(" ")}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S8 — brief extras
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S8 · brief extras ──");
  const EVTS = ["crm.company.created", "crm.company.updated", "crm.company.merged"];
  {
    const autoL = (await import("@/lib/automation/labels")) as Any;
    const hookL = (await import("@/lib/webhooks/labels")) as Any;
    const auto = new Set(((autoL.AUTOMATION_EVENTS ?? []) as Any[]).map((e) => e.value));
    const hook = new Set(((hookL.WEBHOOK_EVENTS ?? []) as Any[]).map((e) => e.value));
    const missing = EVTS.filter((t) => typeof CONS?.[t] !== "function" || !hook.has(t));
    const srcA = read("src/lib/automation/labels.ts");
    const srcW = read("src/lib/webhooks/labels.ts");
    const decl = (src: string, t: string) => (src.match(new RegExp(`value:\\s*"${t.replace(/\./g, "\\.")}"`, "g")) ?? []).length;
    const dupDecl = EVTS.filter((t) => decl(srcA, t) + decl(srcW, t) !== 1);
    chk("C1.3-S8.1", "the 3 events are in all 3 registries — a consumer in outbox-consumers.ts and a label reachable from WEBHOOK_EVENTS (declared exactly once: automation/labels.ts OR webhooks/labels.ts)",
      missing.length === 0 && dupDecl.length === 0, "3 × 3 · 1 declaration each", `missing=${missing.join(",") || "-"} declCount≠1=${dupDecl.join(",") || "-"} (automation has ${EVTS.filter((t) => auto.has(t)).length})`);
  }
  {
    const NEWTAX = taxOf();
    const up = await call(CO.updateCompany, cA, actor, co1, { name: `ไทยทัวร์เอเชีย (ใหม่) ${rand}`, taxId: dashed(NEWTAX) });
    const row = await coRow(co1);
    const p = await partyRow(row?.partyId);
    chk("C1.3-S8.2", "updateCompany(name, tax id) keeps the linked Party in sync: CrmCompany AND Party carry the new name and the NORMALISED new tax id",
      up.ok && row?.name === `ไทยทัวร์เอเชีย (ใหม่) ${rand}` && row?.taxId === NEWTAX && p?.name === row?.name && p?.taxId === NEWTAX,
      "both updated", `${up.err} row=${j({ n: row?.name, t: row?.taxId })} party=${j({ n: p?.name, t: p?.taxId })}`);
  }
  {
    // a governed key smuggled through `fields` (the engine treats system fields as raw column pointers) — refused or routed
    const before = await coRow(co1);
    const sm = await call(CO.updateCompany, cA, actor, co1, { fields: { name: `ชื่อลักลอบ ${rand}` } });
    const row = await coRow(co1);
    const p = await partyRow(row?.partyId);
    const refused = isRefused(sm) && row?.name === before?.name && p?.name === before?.name;
    const routed = sm.ok && (row?.name === before?.name || p?.name === row?.name);
    chk("C1.3-S8.3", "a governed column (name) sent through `fields` never desyncs the Party: either refused (row unchanged) or routed through the governed path (Party.name = CrmCompany.name)",
      refused || routed, "Party in sync", `${sm.err || "accepted"} row=${row?.name} party=${p?.name}`);
  }
  // custom fields for company through the C1.2a engine (objectKey "company")
  const fctx = { ...cA, objectKey: "company", actor };
  const sec = await call(F?.createSection, fctx, { key: "qcExtra", label: "ข้อมูลเพิ่ม" });
  const fTier = await call(F?.createField, fctx, { sectionId: sec.v?.id, key: "qcTier", label: "ระดับลูกค้า", type: "SELECT", filterable: true, options: { choices: [{ value: "gold", label: "ทอง" }, { value: "silver", label: "เงิน" }] } });
  const fRegion = await call(F?.createField, fctx, { sectionId: sec.v?.id, key: "qcRegion", label: "ภูมิภาค", type: "TEXT", filterable: true });
  chk("C1.3-S8.4a", "[prerequisite C1.2a] the member facade's field engine accepts objectKey \"company\" on a CRM system (if red, S8.5 is red for C1.2a's reason)",
    sec.ok && fTier.ok && fRegion.ok, "section + 2 fields", `${sec.err}${fTier.err}${fRegion.err}`, "MAJOR");
  const fg1 = await create(cA, { name: `กรอง ทอง ใต้ ${rand}`, industry: "โรงแรม", size: "SMALL", fields: { qcTier: "gold", qcRegion: "ภาคใต้" } });
  const fg2 = await create(cA, { name: `กรอง เงิน เหนือ ${rand}`, industry: "โรงแรม", size: "LARGE", fields: { qcTier: "silver", qcRegion: "ภาคเหนือ" } });
  const fg3 = await create(cA, { name: `กรอง ทอง เหนือ ${rand}`, industry: "ขนส่ง", size: "SMALL", ownerUserId: userSales, fields: { qcTier: "gold", qcRegion: "ภาคเหนือ" } });
  const [g1, g2, g3] = [fg1, fg2, fg3].map((x) => cid(x.v));
  await mkDeal(g2, "OPEN", 10_000);
  await call(CO.recomputeCaches, cA, g2);
  const lst = async (flt: Record<string, Any>) => {
    const r = await call(CO.listCompanies, cA, actor, { q: `กรอง`, pageSize: 200, ...flt });
    return { r, ids: itemsOf(r.v).map((x) => cid(x)).filter((x) => [g1, g2, g3].includes(x)).sort() };
  };
  {
    const all = await lst({});
    const ind = await lst({ industry: "โรงแรม" });
    const siz = await lst({ size: "SMALL" });
    const own = await lst({ owner: userSales });
    const open = await lst({ hasOpenDeals: true });
    const exp = (xs: string[]) => [...xs].sort().join(",");
    chk("C1.3-S8.4", "listCompanies system filters: q · industry · size · owner · hasOpenDeals each return exactly the matching companies",
      fg1.ok && fg2.ok && fg3.ok && all.ids.join(",") === exp([g1, g2, g3]) && ind.ids.join(",") === exp([g1, g2]) && siz.ids.join(",") === exp([g1, g3]) && own.ids.join(",") === exp([g3]) && open.ids.join(",") === exp([g2]),
      "3 · 2 · 2 · 1 · 1", `${fg1.err}${all.r.err} q=${all.ids.length} industry=${ind.ids.length} size=${siz.ids.length} owner=${own.ids.length} open=${open.ids.length}`);
  }
  {
    const vals = await P.customRecordValue.count({ where: { tenantId: tidA, recordType: "COMPANY", recordId: { in: [g1, g2, g3] } } });
    const tier = await lst({ f: { qcTier: "gold" } });
    const both = await lst({ f: { qcTier: "gold", qcRegion: "ภาคเหนือ" } });
    chk("C1.3-S8.5", "createCompany({fields}) writes custom values through the engine (CustomRecordValue recordType COMPANY) and listCompanies `f.{key}` filters on them (SELECT gold → 2 · AND TEXT → 1)",
      vals >= 6 && tier.ids.join(",") === [g1, g3].sort().join(",") && both.ids.join(",") === g3, "6 values · 2 · 1", `values=${vals} ${tier.r.err} gold=${tier.ids.length} gold+north=${both.ids.length}`);
  }
  {
    const TAXD = taxOf();
    const d1 = await fx(cA, { name: `ซ้ำโดเมน ก ${rand}`, emailDomain: `dup-${rand}.co.th` });
    const d2 = await fx(cA, { name: `ชื่อไม่เหมือนเลย ${rand}`, emailDomain: `dup-${rand}.co.th` });
    const t1 = await fx(cA, { name: `ซ้ำภาษี ${rand}`, taxId: TAXD });
    const n1 = await fx(cA, { name: `ดำน้ำสยามทัวร์ ${rand}` });
    const n2 = await fx(cA, { name: `ดำน้ำสยามทัวร์ ${rand} จำกัด` });
    // a tax-id twin can only exist when written outside the create gate (legacy rows / import) — insert it raw
    const t2party = await mkParty(tidA, `ซ้ำภาษี (เก่า) ${rand}`, "COMPANY");
    const t2 = (await P.crmCompany.create({ data: { tenantId: tidA, systemId: crmA, name: `ซ้ำภาษี (เก่า) ${rand}`, partyId: t2party, taxId: TAXD } })).id as string;
    const fd = await call(CO.findDuplicates, cA, actor, {});
    const items = (Array.isArray(fd.v) ? fd.v : (fd.v?.items ?? fd.v?.pairs ?? [])) as Any[];
    const has = (a: string, b: string, why: string) => items.some((it) => { const s = j(it); return s.includes(a) && s.includes(b) && s.toUpperCase().includes(why); });
    chk("C1.3-S8.6", "findDuplicates reports the tax-id twin (reason TAX_ID), the e-mail-domain pair (DOMAIN) and a near-identical name pair (NAME)",
      fd.ok && has(t1, t2, "TAX") && has(d1, d2, "DOMAIN") && has(n1, n2, "NAME"), "3 kinds", `${fd.err} n=${items.length} tax=${has(t1, t2, "TAX")} domain=${has(d1, d2, "DOMAIN")} name=${has(n1, n2, "NAME")}`, "MAJOR");
  }
  {
    const okOwner = await call(CO.setOwner, cA, actor, co2, userSales);
    const badOwner = await call(CO.setOwner, cA, actor, co2, userStranger);
    const row = await coRow(co2);
    const self = await call(CO.setParent, cA, actor, co3, co3);
    const kids = await P.crmCompany.findFirst({ where: { parentCompanyId: co3, systemId: crmA } });
    const cyc = kids ? await call(CO.setParent, cA, actor, co3, kids.id) : ({ ok: true, err: "no child from S3.4" } as Res);
    const co3Row = await coRow(co3);
    chk("C1.3-S8.7", "setOwner accepts a member of the shop and refuses (VALIDATION) a user of another shop · setParent refuses itself and a cycle (child as parent) — nothing written",
      okOwner.ok && isValidation(badOwner) && row?.ownerUserId === userSales && isValidation(self) && isValidation(cyc) && !co3Row?.parentCompanyId,
      "ok · refused ×3", `${okOwner.err} | ${badOwner.err || "accepted"} | self ${self.err || "accepted"} | cycle ${cyc.err || "accepted"} owner=${row?.ownerUserId === userSales} parent=${co3Row?.parentCompanyId ?? "-"}`);
  }
  {
    // caches repaired by recomputeCaches after raw drift
    await P.crmCompany.updateMany({ where: { id: co3 }, data: { openDealCount: 99, wonValueSatang: BigInt(1), outstandingSatang: BigInt(5) } });
    const rc = await call(CO.recomputeCaches, cA, co3);
    const row = await coRow(co3);
    const t = await truth(co3);
    chk("C1.3-S8.8", "recomputeCaches(ctx, id) sets openDealCount / wonValueSatang to the deal truth and outstandingSatang to the account outstanding (2 · ฿408,000 · ฿210,000)",
      rc.ok && row?.openDealCount === t.open && Number(row?.wonValueSatang) === t.wonv && Number(row?.outstandingSatang) === OUT3 && t.open === 2 && t.wonv === WON3,
      `${t.open} · ${t.wonv} · ${OUT3}`, `${rc.err} ${row?.openDealCount} · ${row?.wonValueSatang} · ${row?.outstandingSatang}`);
  }
  {
    const ev = await evOf("crm.company.merged", coM);
    const evK = (await P.outboxEvent.findMany({ where: { tenantId: tidA, type: "crm.company.merged" } })) as Any[];
    const mine = evK.filter((e) => e.payload?.mergedId === coM && e.payload?.keptId === coK);
    chk("C1.3-S8.9", "the merge emits exactly ONE crm.company.merged {keptId, mergedId} (key crm.company.merged#<id>#<seq>) — and the refused attempts emitted none",
      mine.length === 1 && (ev.length === 1 || evK.some((e) => String(e.idempotencyKey).startsWith(`crm.company.merged#${coK}#`))), "1", `mine=${mine.length} keyed=${ev.length} total=${evK.length}`, "MAJOR");
  }
  {
    const T1 = taxOf();
    const csv = ["name,taxId,website,industry", `นำเข้า หนึ่ง ${rand},${dashed(T1)},https://one.example,ค้าปลีก`, `นำเข้า สอง ${rand},,https://two.example,ค้าปลีก`,
      `นำเข้า หนึ่งซ้ำ ${rand},${T1},,ค้าปลีก`].join("\n");
    const r = await call(CO.importCompanies, cA, actor, { csv });
    const rows = (await P.crmCompany.findMany({ where: { systemId: crmA, name: { startsWith: "นำเข้า " } } })) as Any[];
    chk("C1.3-S8.10", "importCompanies of a 3-row CSV: 2 created (tax id normalised), the in-file tax-id twin skipped as duplicate — created 2 · skipped 1",
      r.ok && Number(r.v?.created) === 2 && Number(r.v?.skipped) === 1 && rows.length === 2 && rows.some((x) => x.taxId === T1), "2 · 1", `${r.err} ${cut(j(r.v), 120)} rows=${rows.length}`, "MAJOR");
  }
  {
    // events are part of the write transaction: make the EVENT insert fail ⇒ the write must be rolled back with it
    const mkTrigger = async (cond: string) => {
      await dropTrigger();
      await P.$executeRawUnsafe(
        `CREATE FUNCTION ${TRIG}_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."tenantId" = '${tidA}' AND ${cond} THEN RAISE EXCEPTION 'qc-c13 forced outbox failure'; END IF; RETURN NEW; END $$`,
      );
      await P.$executeRawUnsafe(`CREATE TRIGGER ${TRIG} AFTER INSERT ON "OutboxEvent" FOR EACH ROW EXECUTE FUNCTION ${TRIG}_fn()`);
    };
    const ROLL = `ย้อนกลับ ${rand}`;
    let cr: Res;
    try {
      await mkTrigger(`NEW.type = 'crm.company.created'`);
      cr = await call(CO.createCompany, cA, actor, { name: ROLL });
    } finally {
      await dropTrigger();
    }
    const left = await P.crmCompany.count({ where: { tenantId: tidA, name: ROLL } });
    chk("C1.3-S8.11", "create: when crm.company.created cannot be written the whole create rolls back — no CrmCompany row (the event is emitted INSIDE the write transaction)",
      !cr.ok && cr.code !== "MISSING_FUNCTION" && left === 0, "refused · 0 rows", `call=${cr.ok ? "succeeded" : "failed"} rows=${left}`);
    const before = await coRow(co2);
    const pBefore = await partyRow(before?.partyId);
    let up: Res;
    try {
      await mkTrigger(`NEW."idempotencyKey" LIKE 'crm.company.updated#${co2}#%'`);
      up = await call(CO.updateCompany, cA, actor, co2, { name: `${ROLL} ใหม่` });
    } finally {
      await dropTrigger();
    }
    const after = await coRow(co2);
    const pAfter = await partyRow(after?.partyId);
    chk("C1.3-S8.12", "update: a failed crm.company.updated write leaves the company name AND the Party name untouched (Party sync is inside the same transaction)",
      !up.ok && up.code !== "MISSING_FUNCTION" && after?.name === before?.name && pAfter?.name === pBefore?.name, "unchanged", `call=${up.ok ? "succeeded" : "failed"} name ${before?.name}→${after?.name} party ${pBefore?.name}→${pAfter?.name}`, "MAJOR");
  }
  {
    const tl = ((d3.timeline ?? []) as Any[]);
    chk("C1.3-S8.13", "the 360 timeline includes the company's own activity (the CALL logged 2 days ago) — union timeline of company + its contacts",
      v3.ok && j(tl).includes(`โทรคุยสัญญา ${TAG}`), "present", `${v3.err} items=${tl.length}`, "MINOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X1 — scope: other tenant · OTHER CRM SYSTEM of the same tenant · ctx.systemId re-resolved
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X1 · scope ──");
  const idA2 = await fx(cA2, { name: `${FOREIGN_NAME} A2`, taxId: taxOf() });
  const idB = await fx(cB, { name: `${FOREIGN_NAME} B`, taxId: taxOf() });
  const kA2 = await mkContact(tidA, crmA2, `ผู้ติดต่อระบบสอง ${rand}`);
  const kB = await mkContact(tidB, crmB, `ผู้ติดต่อร้าน B ${rand}`);
  const kOwn = await mkContact(tidA, crmA, `ผู้ติดต่อของเรา ${rand}`);
  const snap = async () => j([await coRow(idA2), await coRow(idB)]);
  const snap0 = await snap();
  chk("C1.3-X1.0", "[positive control] the foreign companies exist (crmA2 of tenant A · crmB of tenant B)", !!(await coRow(idA2)) && !!(await coRow(idB)), "2 rows", `${idA2} ${idB}`, "MAJOR");
  {
    const g1x = await call(CO.getCompany360, cA, actor, idA2);
    const g2x = await call(CO.getCompany360, cA, actor, idB);
    const leak = [g1x, g2x].some((r) => r.msg.includes(FOREIGN_NAME));
    chk("C1.3-X1.1", "getCompany360 of another CRM system's company and of another shop's company ⇒ NOT_FOUND, and the error never echoes their data",
      isNotFound(g1x) && isNotFound(g2x) && !leak, "404 · 404", `${g1x.err || "returned"} | ${g2x.err || "returned"} leak=${leak}`);
  }
  {
    const u1 = await call(CO.updateCompany, cA, actor, idA2, { name: `ยึด ${rand}` });
    const u2 = await call(CO.updateCompany, cA, actor, idB, { name: `ยึด ${rand}` });
    chk("C1.3-X1.2", "updateCompany of a foreign company (other system / other shop) ⇒ NOT_FOUND and both rows untouched", isNotFound(u1) && isNotFound(u2) && (await snap()) === snap0,
      "404 · unchanged", `${u1.err || "accepted"} | ${u2.err || "accepted"}`);
  }
  {
    const a1 = await call(CO.addContact, cA, actor, idA2, { contactId: kOwn });
    const a2 = await call(CO.addContact, cA, actor, idB, { contactId: kOwn });
    const a3 = await call(CO.addContact, cA, actor, co3, { contactId: kA2 });
    const a4 = await call(CO.addContact, cA, actor, co3, { contactId: kB });
    const made = await P.crmCompanyContact.count({ where: { OR: [{ companyId: { in: [idA2, idB] } }, { contactId: { in: [kA2, kB] } }] } });
    chk("C1.3-X1.3", "addContact: a foreign company ⇒ NOT_FOUND · a contact of another CRM system / another shop into our company ⇒ NOT_FOUND (both parents must be in the SAME system — CRM-RUN §4 C1.1 note) · no link row created",
      isNotFound(a1) && isNotFound(a2) && (isNotFound(a3) || isValidation(a3)) && (isNotFound(a4) || isValidation(a4)) && made === 0,
      "4 refusals · 0 rows", `${a1.err || "ok"} | ${a2.err || "ok"} | ${a3.err || "ok"} | ${a4.err || "ok"} rows=${made}`);
  }
  {
    const own = await fx(cA, { name: `เป้ารวม ${rand}` });
    const m1 = await call(CO.mergeCompanies, cA, actor, { keepId: own, mergeId: idA2, confirm: true, reason: "ทดสอบข้ามระบบ" });
    const m2 = await call(CO.mergeCompanies, cA, actor, { keepId: idA2, mergeId: own, confirm: true, reason: "ทดสอบข้ามระบบ" });
    const m3 = await call(CO.mergeCompanies, cA, actor, { keepId: own, mergeId: idB, confirm: true, reason: "ทดสอบข้ามร้าน" });
    const ownRow = await coRow(own);
    chk("C1.3-X1.4", "mergeCompanies checks BOTH ids: foreign merge id, foreign keep id, other shop's id ⇒ NOT_FOUND each · nothing merged on either side",
      isNotFound(m1) && isNotFound(m2) && isNotFound(m3) && !ownRow?.mergedIntoId && !ownRow?.archivedAt && (await snap()) === snap0,
      "404 ×3", `${m1.err || "ok"} | ${m2.err || "ok"} | ${m3.err || "ok"} own.merged=${ownRow?.mergedIntoId ?? "-"}`);
  }
  {
    const l = await call(CO.listCompanies, cA, actor, { q: FOREIGN_NAME, pageSize: 200 });
    const all = await call(CO.listCompanies, cA, actor, { pageSize: 200 });
    const ids = [...itemsOf(l.v), ...itemsOf(all.v)].map((x) => cid(x));
    chk("C1.3-X1.5", "listCompanies (with and without a search for the foreign name) never returns another system's or another shop's company",
      l.ok && all.ok && !ids.includes(idA2) && !ids.includes(idB) && itemsOf(all.v).length > 0, "0 foreign", `${l.err}${all.err} foreign=${ids.filter((x) => x === idA2 || x === idB).length} all=${itemsOf(all.v).length}`);
  }
  {
    const x1 = await call(CO.createCompany, { tenantId: tidA, systemId: crmB, actorUserId: userA }, actor, { name: `ข้ามร้านผ่าน ctx ${rand}` });
    const x2 = await call(CO.createCompany, { tenantId: tidA, systemId: memA, actorUserId: userA }, actor, { name: `ระบบผิดชนิด ${rand}` });
    const rowsB = await P.crmCompany.count({ where: { systemId: { in: [crmB, memA] }, name: { in: [`ข้ามร้านผ่าน ctx ${rand}`, `ระบบผิดชนิด ${rand}`] } } });
    chk("C1.3-X1.6", "ctx.systemId is re-resolved against the tenant (type CRM): another shop's CRM system or a MEMBER system in ctx ⇒ refused (NOT_FOUND/VALIDATION), no row written",
      (isNotFound(x1) || isValidation(x1)) && (isNotFound(x2) || isValidation(x2)) && rowsB === 0, "refused ×2 · 0 rows", `${x1.err || "accepted"} | ${x2.err || "accepted"} rows=${rowsB}`);
  }
  {
    const s1 = await call(CO.setParent, cA, actor, co2, idA2);
    const s2 = await call(CO.setParent, cA, actor, idA2, co2);
    const s3 = await call(CO.setPrimary, cA, actor, idA2, kA2);
    const s4 = await call(CO.removeContact, cA, actor, idB, kB);
    const s5 = await call(CO.archiveCompany, cA, actor, idA2, { confirm: true, reason: "ทดสอบข้ามระบบ" });
    const s6 = await call(CO.setOwner, cA, actor, idB, userA);
    const co2Row = await coRow(co2);
    chk("C1.3-X1.7", "setParent (foreign parent or foreign child) · setPrimary · removeContact · archiveCompany · setOwner on a foreign company ⇒ NOT_FOUND (a foreign parent may be VALIDATION) · nothing written",
      (isNotFound(s1) || isValidation(s1)) && isNotFound(s2) && isNotFound(s3) && isNotFound(s4) && isNotFound(s5) && isNotFound(s6) && !co2Row?.parentCompanyId && (await snap()) === snap0,
      "refused ×6", [s1, s2, s3, s4, s5, s6].map((r) => r.err || "accepted").join(" | "));
  }
  {
    await P.crmCompany.updateMany({ where: { id: idA2 }, data: { openDealCount: 41 } });
    const rc = await call(CO.recomputeCaches, cA, idA2);
    const row = await coRow(idA2);
    chk("C1.3-X1.8", "recomputeCaches(ctx of crmA, a crmA2 company id) never writes the other system's row (NOT_FOUND or a no-op)",
      row?.openDealCount === 41 && (rc.ok || isNotFound(rc)), "untouched", `${rc.err || "ok"} cache=${row?.openDealCount}`, "MAJOR");
    await P.crmCompany.updateMany({ where: { id: idA2 }, data: { openDealCount: 0 } });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X3 — races: caches · setPrimary · same tax id — in-process AND across 4 processes
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X3 · races ──");
  const raceCo = await fx(cA, { name: `แข่งแคช ${rand}` });
  const cacheOk = async () => {
    const t = await truth(raceCo);
    const row = await coRow(raceCo);
    return { ok: !!row && row.openDealCount === t.open && Number(row.wonValueSatang) === t.wonv, t, row: { o: row?.openDealCount, w: Number(row?.wonValueSatang) } };
  };
  {
    const rounds: string[] = [];
    let allOk = true;
    // round 1: 12 OPEN deals flipped to WON at once, each followed by its own recompute
    const r1ids = await Promise.all(Array.from({ length: 12 }, (_x, i) => mkDeal(raceCo, "OPEN", 10_000 * (i + 1))));
    await call(CO.recomputeCaches, cA, raceCo);
    const flip = async (id: string, kind: "WON" | "LOST") => {
      await P.$executeRawUnsafe(
        kind === "WON"
          ? `UPDATE "CrmDeal" SET "kind" = 'WON', "stageId" = $2, "wonValueSatang" = "valueSatang", "closedAt" = now() WHERE "id" = $1`
          : `UPDATE "CrmDeal" SET "kind" = 'LOST', "stageId" = $2, "wonValueSatang" = NULL, "closedAt" = now() WHERE "id" = $1`,
        id,
        kind === "WON" ? stWon : stLost,
      );
      return call(CO.recomputeCaches, cA, raceCo);
    };
    let res = await Promise.all(r1ids.map((id) => flip(id, "WON")));
    let c = await cacheOk();
    allOk &&= c.ok && res.every((x) => x.ok);
    rounds.push(`r1 ${c.row.o}/${c.t.open} ${c.row.w}/${c.t.wonv}`);
    // round 2: 12 new OPEN deals created at once, each followed by a recompute
    res = await Promise.all(Array.from({ length: 12 }, async (_x, i) => { await mkDeal(raceCo, "OPEN", 5_000 + i); return call(CO.recomputeCaches, cA, raceCo); }));
    c = await cacheOk();
    allOk &&= c.ok && res.every((x) => x.ok);
    rounds.push(`r2 ${c.row.o}/${c.t.open} ${c.row.w}/${c.t.wonv}`);
    // round 3: 6 WON → LOST and 6 OPEN → WON at once
    const open3 = ((await P.crmDeal.findMany({ where: { companyId: raceCo, kind: "OPEN" }, select: { id: true }, take: 6 })) as Any[]).map((x) => x.id as string);
    const won3 = r1ids.slice(0, 6);
    res = await Promise.all([...won3.map((id) => flip(id, "LOST")), ...open3.map((id) => flip(id, "WON"))]);
    c = await cacheOk();
    allOk &&= c.ok && res.every((x) => x.ok);
    rounds.push(`r3 ${c.row.o}/${c.t.open} ${c.row.w}/${c.t.wonv}`);
    chk("C1.3-X3.1", "openDealCount / wonValueSatang exact after 12 PARALLEL deal events each followed by recomputeCaches — 3 rounds (flip to WON · new deals · WON↔LOST mix): recompute under a lock (or deltas), never read→compute→write",
      allOk, "cache = truth ×3", `${rounds.join(" · ")} ${res.find((x) => !x.ok)?.err ?? ""}`);
  }
  // across 4 separate processes
  const runWorkers = async (mode: string, companyId: string, args: string[]): Promise<{ outs: string[]; spawned: boolean }> => {
    const startAt = Date.now() + 45_000;
    const outs = await Promise.all(
      args.map(
        (arg) =>
          new Promise<string>((resolve) => {
            const ch = spawn("pnpm", ["exec", "tsx", THIS_FILE, "--x3-worker", mode, tidA, crmA, userA, companyId, String(startAt), arg], { env: process.env });
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
  {
    const ids = await Promise.all(Array.from({ length: 12 }, (_x, i) => mkDeal(raceCo, "OPEN", 70_000 + i)));
    await call(CO.recomputeCaches, cA, raceCo);
    const w = await runWorkers("caches", raceCo, [0, 1, 2, 3].map((i) => `${stWon}|${ids.slice(i * 3, i * 3 + 3).join(",")}`));
    const c = await cacheOk();
    chk("C1.3-X3.2a", "[positive control] the 4 worker PROCESSES really ran and answered (12 deal events) — if red, X3.2 proves nothing",
      w.spawned && w.outs.length === 12, "12", `${w.outs.length} ${cut(w.outs.filter((x) => x !== "OK").join(" | "), 200)}`, "MAJOR");
    chk("C1.3-X3.2", "12 deal events + recomputes across 4 SEPARATE PROCESSES (own PrismaClients, synchronised start) ⇒ caches exact (an in-process mutex would pass X3.1 and fail here)",
      w.outs.every((x) => x === "OK") && c.ok, `${c.t.open} · ${c.t.wonv}`, `cache ${c.row.o} · ${c.row.w}`);
  }
  const primCo = await fx(cA, { name: `แข่งผู้ติดต่อหลัก ${rand}` });
  const primContacts = await Promise.all(Array.from({ length: 12 }, (_x, i) => mkContact(tidA, crmA, `แข่งหลัก ${i} ${rand}`)));
  for (const k of primContacts) await call(CO.addContact, cA, actor, primCo, { contactId: k, role: "OTHER" });
  {
    const rounds: string[] = [];
    let ok = true;
    for (let round = 0; round < 3; round += 1) {
      const res = await Promise.all(primContacts.slice(0, 10).map((k) => call(CO.setPrimary, cA, actor, primCo, k)));
      const pr = await primaries(primCo);
      ok &&= pr.length === 1 && res.some((x) => x.ok);
      rounds.push(`r${round + 1}:${pr.length}`);
    }
    chk("C1.3-X3.3", "10 parallel setPrimary on the same company (different contacts) ⇒ exactly ONE current primary — 3 rounds", ok, "1 ×3", rounds.join(" · "));
  }
  {
    const w = await runWorkers("primary", primCo, [0, 1, 2, 3].map((i) => primContacts.slice(i * 3, i * 3 + 3).join(",")));
    const pr = await primaries(primCo);
    chk("C1.3-X3.4", "12 setPrimary across 4 SEPARATE PROCESSES ⇒ exactly ONE current primary (a lock inside one process is not enough)",
      w.spawned && w.outs.length === 12 && w.outs.some((x) => x === "OK") && pr.length === 1, "1", `outs=${w.outs.length} ok=${w.outs.filter((x) => x === "OK").length} primaries=${pr.length} ${cut(w.outs.filter((x) => x !== "OK").join(" | "), 160)}`);
  }
  {
    const TX = taxOf();
    const res = await Promise.all(Array.from({ length: 10 }, (_x, i) => create(cA, { name: `พร้อมกัน ${i} ${rand}`, taxId: TX })));
    const rows = await P.crmCompany.count({ where: { systemId: crmA, taxId: TX } });
    const parties = await P.party.count({ where: { tenantId: tidA, taxId: TX, mergedIntoId: null } });
    const winners = res.filter((r) => r.ok && r.v?.created === true).length;
    const cleanLosers = res.every((r) => (r.ok && (r.v?.created === true || dupOf(r))) || (r.code === "DUPLICATE" && thai(r.msg)));
    chk("C1.3-X3.5", "10 createCompany with the SAME new tax id at once ⇒ ONE company, ONE Party with that tax id; every loser is told duplicate (duplicateOf / DUPLICATE in Thai — never a raw P2002)",
      rows === 1 && parties === 1 && winners === 1 && cleanLosers, "1 · 1 · 1 winner", `rows=${rows} parties=${parties} winners=${winners} losers=${cut(res.filter((r) => !r.ok).map((r) => r.err).slice(0, 2).join(" | "), 160)}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X4 — crm.company.created consumer: twice / twice in parallel ⇒ one AccountContact + one timeline row
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X4 · redelivery ──");
  const timelineRows = async (companyId: string) =>
    (await P.crmActivity.count({ where: { tenantId: tidA, companyId, source: { not: "MANUAL" } } })) +
    (await P.memberActivity.count({ where: { tenantId: tidA, crmCompanyId: companyId } }));
  const acCount = async (partyId: string) => P.accountContact.count({ where: { tenantId: tidA, systemId: accSys, partyId: partyId || NONE } });
  {
    const rx = await watch("createCompany X4/X8 (PII company)", () =>
      create(cA, { name: SENT_NAME, phone: SENT_PHONE, email: SENT_EMAIL, website: SENT_WEB, taxId: taxOf() }));
    const id = cid(rx.v);
    const ev = (await evOf("crm.company.created", id))[0];
    chk("C1.3-X4.0", "[positive control] the created event exists for a fresh company whose Party has no AccountContact yet", !!ev && (await coRow(id))?.accountContactId == null, "1 event · no link yet",
      `${rx.err} ev=${!!ev} link=${(await coRow(id))?.accountContactId ?? "-"}`, "MAJOR");
    const a = ev ? await watch("consumer created #1", () => consume(ev)) : ({ ok: false, err: "no event" } as Res);
    const b = ev ? await watch("consumer created #2", () => consume(ev)) : ({ ok: false, err: "no event" } as Res);
    const row = await coRow(id);
    const n = await acCount(row?.partyId);
    const acRow = await P.accountContact.findFirst({ where: { tenantId: tidA, systemId: accSys, partyId: row?.partyId || NONE } });
    chk("C1.3-X4.1", "the crm.company.created consumer run TWICE ⇒ exactly ONE AccountContact for the company's Party in the linked ACCOUNT system, and CrmCompany.accountContactId points at it",
      a.ok && b.ok && n === 1 && !!acRow && row?.accountContactId === acRow.id, "1 · linked", `${a.err}${b.err} accountContacts=${n} linked=${row?.accountContactId === acRow?.id}`);
    const tl = await timelineRows(id);
    chk("C1.3-X4.3", "…and exactly ONE timeline row for the company (CrmActivity.companyId non-MANUAL or MemberActivity.crmCompanyId) after both deliveries", tl === 1, "1", `rows=${tl}`, "MAJOR");
  }
  {
    const id = cid((await create(cA, { name: `ส่งซ้ำพร้อมกัน ${rand}`, taxId: taxOf() })).v);
    const ev = (await evOf("crm.company.created", id))[0];
    const res = ev ? await Promise.all([consume(ev), consume(ev)]) : [];
    const res2 = ev ? await Promise.all(Array.from({ length: 5 }, () => consume(ev))) : [];
    const row = await coRow(id);
    const n = await acCount(row?.partyId);
    const tl = await timelineRows(id);
    chk("C1.3-X4.2", "the same event delivered twice AT ONCE (then 5× at once) ⇒ still ONE AccountContact, linked, and ONE timeline row (flag first — advisory lock + marker — then act)",
      !!ev && [...res, ...res2].every((r) => r.ok) && n === 1 && !!row?.accountContactId && tl === 1, "1 · 1", `ev=${!!ev} accountContacts=${n} linked=${!!row?.accountContactId} timeline=${tl}`);
  }
  {
    const id = cid((await create(cA2, { name: `ไม่มีบัญชีเชื่อม ${rand}` })).v);
    const ev = (await P.outboxEvent.findMany({ where: { tenantId: tidA, type: "crm.company.created", idempotencyKey: { startsWith: `crm.company.created#${id}#` } } }))[0];
    const r = ev ? await consume(ev) : ({ ok: false, err: "no event" } as Res);
    const row = await coRow(id);
    const n = await P.accountContact.count({ where: { tenantId: tidA, partyId: row?.partyId || NONE } });
    chk("C1.3-X4.4", "a company of a CRM system with NO linked account system: the consumer resolves (a CRM extra never fails the queue) and creates no AccountContact anywhere",
      !!ev && r.ok && n === 0 && !row?.accountContactId, "ok · 0", `${r.err} accountContacts=${n}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X6 — dangerous input: website schemes · tax id · import caps · CSV export
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X6 · input / export ──");
  {
    const bad = ["javascript:alert(1)", "JavaScript:alert(1)", "  javascript:alert(1)", "java\tscript:alert(1)", "data:text/html;base64,PHNjcmlwdD4=", "vbscript:msgbox(1)", "ftp://files.example.com", "//evil.example.com"];
    const got = await Promise.all(bad.map((w, i) => create(cA, { name: `เว็บอันตราย ${i} ${rand}`, website: w })));
    const rows = await P.crmCompany.count({ where: { tenantId: tidA, name: { startsWith: "เว็บอันตราย " } } });
    const good = await create(cA, { name: `เว็บดี ${rand}`, website: "HTTPS://Example.COM/เกี่ยวกับเรา" });
    const good2 = await create(cA, { name: `เว็บดี http ${rand}`, website: "http://example.com" });
    chk("C1.3-X6.1", "website accepts http(s) only: javascript: (any case, leading space, tab inside), data:, vbscript:, ftp:, protocol-relative ⇒ VALIDATION in Thai, no row · HTTPS:// and http:// accepted",
      got.every((r) => isValidation(r) && thai(r.msg)) && rows === 0 && good.ok && good2.ok, "8 refused · 2 ok",
      `${got.map((r, i) => (isValidation(r) ? "" : `${i}:${r.err || "accepted"}`)).filter(Boolean).join(" ")} rows=${rows} ${good.err}${good2.err}`);
    const up = await call(CO.updateCompany, cA, actor, cid(good.v), { website: "javascript:alert(document.cookie)" });
    const row = await coRow(cid(good.v));
    chk("C1.3-X6.2", "updateCompany with a javascript: website ⇒ VALIDATION and the stored website is unchanged", isValidation(up) && !/javascript/i.test(String(row?.website ?? "")) && !!row?.website,
      "refused · unchanged", `${up.err || "accepted"} website=${row?.website}`);
  }
  {
    const bads = ["0105563", "01055630123456", "0105563ABC345"];
    const got = await Promise.all(bads.map((t, i) => create(cA, { name: `ภาษีผิด ${i} ${rand}`, taxId: t })));
    const rows = await P.crmCompany.count({ where: { tenantId: tidA, name: { startsWith: "ภาษีผิด " } } });
    chk("C1.3-X6.3", "a malformed tax id (too short · too long · letters inside) ⇒ VALIDATION in Thai, nothing written (never silently dropped)",
      got.every((r) => isValidation(r) && thai(r.msg)) && rows === 0, "3 refused", `${got.map((r) => r.err || "accepted").join(" | ")} rows=${rows}`, "MAJOR");
  }
  const MAX_ROWS = Number(SH?.COMPANY_IMPORT_MAX_ROWS ?? CO?.COMPANY_IMPORT_MAX_ROWS ?? NaN);
  const MAX_BYTES = Number(SH?.COMPANY_IMPORT_MAX_BYTES ?? CO?.COMPANY_IMPORT_MAX_BYTES ?? NaN);
  {
    const okConst = Number.isFinite(MAX_ROWS) && MAX_ROWS > 0 && MAX_ROWS <= 50_000 && Number.isFinite(MAX_BYTES) && MAX_BYTES > 0 && MAX_BYTES <= 20 * 1024 * 1024;
    chk("C1.3-X6.4", "the import caps are named constants (COMPANY_IMPORT_MAX_ROWS ≤ 50,000 · COMPANY_IMPORT_MAX_BYTES ≤ 20 MB) in companies-shared so the UI can say them",
      okConst, "both set", `rows=${MAX_ROWS} bytes=${MAX_BYTES}`, "MAJOR");
    const n0 = await P.crmCompany.count({ where: { systemId: crmA } });
    if (okConst) {
      const lines = ["name,taxId,website,industry"];
      for (let i = 0; i <= MAX_ROWS; i += 1) lines.push(`ล้น ${i},,,`);
      const tooMany = await call(CO.importCompanies, cA, actor, { csv: lines.join("\n") });
      const n1 = await P.crmCompany.count({ where: { systemId: crmA } });
      chk("C1.3-X6.5", "an import of COMPANY_IMPORT_MAX_ROWS + 1 rows is refused as a whole (VALIDATION, Thai) and creates NOTHING", isValidation(tooMany) && thai(tooMany.msg) && n1 === n0,
        "refused · 0 rows", `${tooMany.err || `accepted ${cut(j(tooMany.v), 80)}`} rows ${n0}→${n1}`);
      const big = `name,taxId,website,industry\nใหญ่ ${rand},,,${"ก".repeat(Math.ceil(MAX_BYTES / 3) + 16)}`;
      const tooBig = await call(CO.importCompanies, cA, actor, { csv: big });
      const n2 = await P.crmCompany.count({ where: { systemId: crmA } });
      chk("C1.3-X6.6", "an import larger than COMPANY_IMPORT_MAX_BYTES (UTF-8 bytes — Thai is 3 bytes/char) is refused and creates nothing", isValidation(tooBig) && n2 === n0,
        "refused · 0 rows", `${tooBig.err || "accepted"} bytes=${Buffer.byteLength(big)} rows ${n0}→${n2}`);
    } else {
      chk("C1.3-X6.5", "an import of COMPANY_IMPORT_MAX_ROWS + 1 rows is refused as a whole", false, "caps exported", "no caps — not testable");
      chk("C1.3-X6.6", "an import larger than COMPANY_IMPORT_MAX_BYTES is refused", false, "caps exported", "no caps — not testable");
    }
  }
  {
    const csv = ["name,taxId,website,industry", `นำเข้าเว็บดี ${rand},,https://ok.example,`, `นำเข้าเว็บร้าย ${rand},,javascript:alert(1),`, `นำเข้าภาษีผิด ${rand},123,,`].join("\n");
    const r = await call(CO.importCompanies, cA, actor, { csv });
    const okRow = await P.crmCompany.count({ where: { tenantId: tidA, name: `นำเข้าเว็บดี ${rand}` } });
    const badRows = await P.crmCompany.count({ where: { tenantId: tidA, name: { in: [`นำเข้าเว็บร้าย ${rand}`, `นำเข้าภาษีผิด ${rand}`] } } });
    const errs = (r.v?.errors ?? []) as Any[];
    chk("C1.3-X6.7", "import applies the same rules per row: the javascript: website row and the malformed tax id row are reported in `errors` (Thai reason) and NOT created; the good row is",
      r.ok && okRow === 1 && badRows === 0 && errs.length === 2 && errs.every((e) => thai(e?.reason ?? e?.message)), "1 created · 2 errors", `${r.err} ok=${okRow} bad=${badRows} errors=${cut(j(errs), 160)}`, "MAJOR");
  }
  {
    const csvLib = (await import("@/lib/core/csv")) as Any;
    const evil = ["=HYPERLINK(\"http://evil.test\",\"x\")", "+SUM(1;2)", "-2+3cmd", "@evilcmd"];
    for (const e of evil) await create(cA, { name: `${e} ${rand}` });
    await create(cA, { name: `=cmd|' /C calc'!A0 ${rand}` });
    const ex = await call(CO.exportCompanies, cA, actor, {});
    const text = typeof ex.v === "string" ? ex.v : String(ex.v?.csv ?? ex.v?.text ?? "");
    const table = csvLib.parseCsv(text) as { headers: string[]; rows: string[][] };
    const cells = [...(table.headers ?? []), ...(table.rows ?? []).flat()];
    const dangerous = cells.filter((c) => /^[\t\r\n ]*[=+\-@]/.test(c) && !/^-?\d+(\.\d+)?$/.test(c));
    const neutral = evil.every((e) => cells.includes(`'${e} ${rand}`));
    chk("C1.3-X6.8", "exportCompanies returns CSV in which NO cell starts with = + - @ (neutralised to '… by csvRow) — formulas typed as company NAMES (=HYPERLINK · +SUM · -2+3 · @ · `=cmd|' /C calc'!A0`)",
      ex.ok && text.length > 0 && dangerous.length === 0 && neutral && cells.includes(`'=cmd|' /C calc'!A0 ${rand}`), "0 dangerous · 5 neutralised",
      `${ex.err} dangerous=${cut(dangerous.join(" | "), 160)} neutral=${neutral}`);
    chk("C1.3-X6.9", "the export is scoped to the ctx system: no company of another CRM system / another shop appears",
      ex.ok && !text.includes(FOREIGN_NAME) && text.includes(`ไทยทัวร์ 360 ${rand}`), "own only", `${ex.err} foreign=${text.includes(FOREIGN_NAME)} own=${text.includes(`ไทยทัวร์ 360 ${rand}`)}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X9 — danger ops: archive + merge need confirm + reason; audit rows
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X9 · danger ops ──");
  {
    const mNow = mStateAfterRefusals.m;
    const dealNow = mStateAfterRefusals.deal;
    chk("C1.3-X9.1", "mergeCompanies without confirm, or with confirm but a reason < 5 chars ⇒ refused (CONFIRM_REQUIRED/VALIDATION, Thai) and NOTHING merged (checked before the real merge)",
      isRefused(mNoConfirm) && isRefused(mShort) && thai(mNoConfirm.msg) && !mNow?.mergedIntoId && !mNow?.archivedAt && dealNow?.companyId === coM && j(mNow) === j(mRowBefore),
      "refused ×2 · unchanged", `${mNoConfirm.err || "accepted"} | ${mShort.err || "accepted"} merged=${mNow?.mergedIntoId ?? "-"}`);
  }
  const arcCo = await fx(cA, { name: `ปิดบริษัท ${rand}` });
  {
    const a1 = await call(CO.archiveCompany, cA, actor, arcCo, {});
    const a2 = await call(CO.archiveCompany, cA, actor, arcCo, { confirm: true, reason: "ปิด" });
    const a3 = await call(CO.archiveCompany, cA, actor, arcCo, { reason: "เลิกกิจการแล้ว" });
    const row = await coRow(arcCo);
    chk("C1.3-X9.2", "archiveCompany without confirm / with a reason < 5 chars / reason without confirm ⇒ refused and the company stays live",
      isRefused(a1) && isRefused(a2) && isRefused(a3) && !row?.archivedAt, "refused ×3", `${a1.err || "accepted"} | ${a2.err || "accepted"} | ${a3.err || "accepted"} archivedAt=${row?.archivedAt ?? "-"}`);
  }
  const arcReason = "ลูกค้าเลิกกิจการตามหนังสือแจ้ง";
  {
    const a = await call(CO.archiveCompany, cA, actor, arcCo, { confirm: true, reason: arcReason });
    const row = await coRow(arcCo);
    const def = await call(CO.listCompanies, cA, actor, { q: `ปิดบริษัท ${rand}`, pageSize: 200 });
    const inc = await call(CO.listCompanies, cA, actor, { q: `ปิดบริษัท ${rand}`, includeArchived: true, pageSize: 200 });
    chk("C1.3-X9.3", "with confirm + reason the archive runs (archivedAt set, row kept) · hidden from the default list · shown with includeArchived",
      a.ok && !!row?.archivedAt && !itemsOf(def.v).some((x) => cid(x) === arcCo) && itemsOf(inc.v).some((x) => cid(x) === arcCo), "archived · hidden · shown",
      `${a.err}${def.err}${inc.err} archivedAt=${!!row?.archivedAt} default=${itemsOf(def.v).length} include=${itemsOf(inc.v).length}`, "MAJOR");
  }
  {
    const auditOf = async (targetId: string) => (await P.auditLog.findMany({ where: { tenantId: tidA, targetId } })) as Any[];
    const a1 = await auditOf(co1);
    const a2 = await auditOf(co2);
    const aArc = await auditOf(arcCo);
    const aMerge = [...(await auditOf(coM)), ...(await auditOf(coK))];
    const reasonKept = (rows: Any[], reason: string) => rows.some((x) => j({ b: x.before, a: x.after }).includes(reason));
    chk("C1.3-X9.4", "every mutation leaves an AuditLog row with the actor: create + update (co1 ≥ 3) · contact add/primary/role/remove (co2 ≥ 5) · archive keeps the typed reason · merge keeps the typed reason",
      a1.length >= 3 && a2.length >= 5 && reasonKept(aArc, arcReason) && reasonKept(aMerge, mergeReason) && [...a1, ...a2].every((x) => x.actorId === userA),
      "audit rows", `co1=${a1.length} co2=${a2.length} archiveReason=${reasonKept(aArc, arcReason)} mergeReason=${reasonKept(aMerge, mergeReason)}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X8 — PDPA: ids only in payloads · nothing personal in OpsEvent / console
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X8 · PDPA ──");
  {
    const ours = (await P.outboxEvent.findMany({ where: { tenantId: { in: TENANTS }, type: { in: EVTS } } })) as Any[];
    const sentinels = [SENT_PHONE, SENT_EMAIL, SENT_NAME, SENT_WEB, `ไทยทัวร์เอเชีย`];
    const offenders = ours.filter((o) => sentinels.some((s) => j(o.payload).includes(s))).map((o) => o.type);
    chk("C1.3-X8.0", "[positive control] events of all 3 types were produced by this run (otherwise X8.1/X8.2 are vacuous)",
      EVTS.every((t) => ours.some((o) => o.type === t)), "3 types", [...new Set(ours.map((o) => o.type))].join(",") || "-", "MAJOR");
    chk("C1.3-X8.1", "no crm.company.* payload carries the company's phone / e-mail / name / website",
      ours.length > 0 && offenders.length === 0, "none", `events=${ours.length} ${offenders.length} offenders ${offenders.slice(0, 3).join(",")}`);
    const strings = (v: Any): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === "object" ? Object.values(v).flatMap(strings) : []);
    const prose = ours.flatMap((o) => strings(o.payload).filter((s) => /\s|[ก-๙@]/.test(s) || s.length > 64).map((s) => `${o.type}:${cut(s, 30)}`));
    chk("C1.3-X8.2", "payloads are ids/keys only: no string value with spaces, Thai text or '@' anywhere (catches any label/name/e-mail leak, not just the sentinels)",
      ours.length > 0 && prose.length === 0, "ids only", `events=${ours.length} ${cut(prose.slice(0, 4).join(" | "), 200)}`, "MAJOR");
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
    chk("C1.3-X8.3", "no OpsEvent and no console line produced by the service/consumer contains the company's phone, e-mail or name",
      typeof CO.createCompany === "function" && EVIDENCE.length > 0 && offenders.length === 0, "none", offenders.join(" · ") || (typeof CO.createCompany === "function" ? "-" : "service missing"));
  }
} catch (e) {
  chk("C1.3-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 400));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — trigger first, then every row of the two throwaway tenants (4 FK-safe passes), the systems/units/tenants,
  // and the throwaway users. The shared QC tenant was never touched. No drainOutbox (not tenant-scoped) — our PENDING
  // events are deleted with the tenant sweep.
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
      const trig = ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = '${TRIG}'`).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0;
      chk("C1.3-CLEAN", "the oracle gives the QC database back exactly as found — the two throwaway tenants, every row they owned, the throwaway users and the test trigger are gone",
        left.length === 0 && tenants === 0 && users === 0 && Number(trig) === 0, "0 rows · 0 tenants · 0 users · 0 triggers", `${left.join(" · ") || "-"} · tenants=${tenants} users=${users} trig=${trig}`, "MAJOR");
    } catch (e) {
      chk("C1.3-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C1.3: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
