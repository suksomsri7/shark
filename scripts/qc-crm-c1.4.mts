// QC — CRM v2 WO C1.4: Contacts v2 — `src/lib/modules/crm/contacts.ts` (+ `contacts-shared.ts`) · `consents.ts` ·
//      contact list / 360 / new pages · convert (member + company + deal in ONE transaction) · consent (C20)
//      events crm.contact.created/updated/assigned/converted/merged
// Oracle writer · the C1.4 builder must NOT touch this file · QC database only (.env.qc)
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c1.4.mts
//      (`--force-run` = run every check even while contacts.ts is absent — all red, CLEAN green; used by the oracle
//       writer to prove fixtures, workers and cleanup; never needed by the builder)
// requires: crm-seed   (house style — this oracle reads NO seeded row; everything lives in throwaway tenants)
//
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE (not re-implemented here): qc-form + qc-ai-tools (both reach the v1
//   `createContact(ctx, input)` of crm/service.ts through the crm facade — its signature must keep working) · qc-crm ·
//   qc-member-m1.4 · qc-member-m1.6 · qc-member-m1.7 · qc-crm-c1.1 · qc-crm-c1.2a · qc-crm-c1.2b · qc-crm-c1.3 ·
//   qc-member-m1.9 (30/15/10/5 — every convert of this file goes into a THROWAWAY tenant with its own MEMBER system;
//   nothing is ever converted into, won in, or emitted for the seeded QC tenants).
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// SOURCES: crm-brief-C1.4.md · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-A previousEmails, R-C.8 keys, R-E.11 consent
//          on convert) · CRM-RUN §2 "C1.4" (S1–S7 = 30) + brief S8 (consent) · MASTER-PLAN §6 row C1.4 (idempotencyKey ·
//          csvRow · import 50,000 rows / 10 MB) · blueprint §5.2 §3.5 §3.17 §11.1, decisions C1 · C20 · mockup
//          ledger/design-crm/05-contact-360-convert.png (panel names only — no screenshot assertion) · C1.3 header of
//          companies.ts (lock order: engine advisory → CrmCompany rows → CrmContact rows) · C1.2a review debt S3
//          (CRM rows `page = crm.<objectKey>` must not show in the member privacy log `listAccessLog`).
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this) ══════════════════════════════════
//   import * as CT from "@/lib/modules/crm/contacts"      import * as CS from "@/lib/modules/crm/consents"
//   ctx   = { tenantId, systemId /* CRM system of that tenant — re-resolved (type CRM), never trusted */, actorUserId }
//   actor = MemberActor { userId, role, unitAccess, permissions }  (OWNER / STAFF here)
//   errors: thrown, `.code` ∈ "NOT_FOUND" | "VALIDATION" | "DUPLICATE" | "CONFIRM_REQUIRED" | "CONFLICT" | "FORBIDDEN",
//           Thai message that never blames the user; foreign ids ⇒ NOT_FOUND (404-not-403), message never echoes foreign data.
//   caps (contacts-shared.ts, client-safe; contacts.ts re-export tolerated):
//     CONTACT_IMPORT_MAX_ROWS = 50_000 · CONTACT_IMPORT_MAX_BYTES = 10 * 1024 * 1024 (UTF-8 bytes of JSON.stringify(rows)) ·
//     CONTACT_BULK_MAX = 500 · CONTACT_REASON_MIN = 5 · CONTACT_TAGS_MAX (≤ 50) · CONTACT_TAG_MAX (chars, ≤ 64) ·
//     CONTACT_NAME_MAX = 200 (firstName / lastName each)
//   CT.createContact(ctx, actor, { firstName, lastName?, phone?, email?, companyId?, jobTitle?, sourceKind? /* MemberSource */,
//        sourceChannel?, sourceDetail? /* {utm{source,medium,campaign,term,content}, formId?, pageUrl?, referrer?, …} */,
//        fields? /* custom, objectKey "contact" engine */, tags?, ownerUserId?, lineUserId?, force? })
//     → { contact: ContactDto /* has id */, created: boolean, duplicates: { contactId, reason: "PHONE" | "EMAIL" }[] }
//     · live contact of the SAME system with the same normalised phone or case-insensitive e-mail ⇒ created:false,
//       duplicates names it, NOTHING written [tolerated: throw DUPLICATE carrying `.duplicates`] · force:true ⇒ created as candidate
//     · Party PERSON through the party facade (partyId set) · another CRM system of the same shop ⇒ own row, SAME Party
//     · legacy `name` = "first last" · no ownerUserId ⇒ `assignment.pick` stub (C2.3 later) ⇒ the creator; assignedAt set
//     · emits crm.contact.created (payload ids only)
//   CT.updateContact(ctx, actor, id, patch{firstName?,lastName?,phone?,email?,jobTitle?,companyId?,fields?}) → ContactDto
//     · phone/e-mail/name ⇒ Party synced via `party.updateContactInfo` IN THE SAME tx · old e-mail appended to previousEmails (R-A)
//     · companyId ⇒ primary company through the companies service (lock order: CrmCompany before CrmContact — no 40P01)
//     · governed keys (GOVERNED_CRM_SYSTEM_KEYS.contact) via `fields` ⇒ refused or routed through the governed path
//     · marketingOptOut is NOT patchable here (only setOptOut, which appends a consent row)
//     · emits crm.contact.updated key `crm.contact.updated#<id>#<seq>` (one per call)
//   CT.getContact360(ctx, actor, id) → { contact, member: {customerId,…}|null, company|null, deals[], fields /*layout+values*/,
//        timeline[], consent /* consents.current */ }   [tolerated: member/company/deals under `connections`]
//   CT.listContacts(ctx, actor, { q?, stage?, leadStatus?, owner?, team?, scoreBand?, source? /*sourceKind*/, companyId?,
//        f?: Record<fieldKey,string>, savedViewId? /* MemberSavedView objectKey "contact" of this system; filters = same keys */,
//        includeArchived?, sort?, cursor?, pageSize? }) → { items, nextCursor: string | null }
//   CT.convertContact(ctx, actor, id, { idempotencyKey /* required */, member?: { systemId }, company?: { id } | { new: { name } },
//        deal?: { pipelineId, stageId?, title, valueSatang? } })
//     → { contactId, customerId: string|null, companyId: string|null, dealId: string|null }
//     · ONE transaction: member via `member.createMember` (source "CRM"; needs a `tx` param on the member facade — see questions),
//       company (+ primary link), deal (first OPEN stage by sortOrder when stageId absent) · contact.memberCustomerId /
//       companyId / convertedAt / lifecycle PROSPECT|CUSTOMER · latest CrmContactConsent state copied ONCE into MemberConsent (R-E.11)
//     · anything fails ⇒ NOTHING persists (no Customer, CrmCompany, link, CrmDeal, event; contact unchanged)
//     · same idempotencyKey again (also in parallel / other process) ⇒ the SAME ids, one set
//     · contact already converted under ANOTHER key ⇒ CONFLICT (Thai, calm) · contact already a member ⇒ member reused
//     · foreign member system / CRM system as member / other-system company / other-system pipeline ⇒ NOT_FOUND|VALIDATION
//     · emits crm.contact.converted (ids only). MUST NOT emit an event type that has no consumer (crm.deal.created is C1.5's).
//   CT.assignContact(ctx, actor, id, { userId }) (userId must be a member of the shop ⇒ else VALIDATION) · emits crm.contact.assigned
//   CT.bulkAssign(ctx, actor, { ids ≤ 500, userId, confirm: true, reason ≥ 5 })          (danger — X9)
//   CT.setLeadStatus(ctx, actor, id, status) · CT.setLifecycle(ctx, actor, id, stage) (rules.canAdvanceLifecycle + CHURNED:
//        CUSTOMER→CHURNED ok · LEAD→CHURNED refused · CUSTOMER→LEAD refused) · CT.setTags(ctx, actor, id, tags[])
//   CT.setOptOut(ctx, actor, id, { optOut: boolean, source?: string }) · every change APPENDS ≥ 1 CrmContactConsent row (never updates)
//   CT.archiveContact(ctx, actor, id, { confirm: true, reason ≥ 5 })                      (danger — X9) [`archive` tolerated]
//   CT.findDuplicates(ctx, actor, opts?) → { items: { a, b, reason }[] } (any shape naming both ids + PHONE|EMAIL|NAME)
//   CT.mergeContacts(ctx, actor, { keepId, mergeId, fieldChoices?: Record<field, "keep"|"merge">, confirm, reason ≥ 5 })
//     · moves CrmDeal.contactId · CrmActivity.contactId · CrmDealContact · CrmCompanyContact (clash ⇒ keep's row wins) ·
//       CrmFileLink(entityType CONTACT) · CustomRecord(parentType CONTACT) · merged row: mergedIntoId = keep, archivedAt set ·
//       Party merged into keep's Party · both linked to DIFFERENT members ⇒ refused (member merge is the member module's job)
//     · emits crm.contact.merged {keptId, mergedId}
//   CT.importContacts(ctx, actor, { rows: Record<string,string>[], mapping: Record<header, "firstName"|"lastName"|"phone"|"email"|
//        "jobTitle"|"tags"|"company"|"f.<key>"|"">, options: { onDuplicate: "update"|"skip"|"candidate", source? } })
//     → async job: { jobId } then CT.getImportJob(ctx, actor, jobId) → { status: "PENDING"|"RUNNING"|"DONE"|"FAILED", result }
//       driven by CT.runImportJobs(now) (also registered as a minute job) [tolerated: result returned inline]
//       result = { created, updated, skipped, candidates, failed, errors: { row, message }[] }
//     · caps checked synchronously BEFORE any job/row · bad rows reported, never thrown · formula cells stored verbatim as text
//   CT.exportContacts(ctx, actor, { …list filters, confirm: true, reason ≥ 5 }) → string CSV — every line through `csvRow` ·
//     sensitive values (contact custom fields / linked member fields) only per D8, with MemberAccessLog rows (page "crm.…")
//   CT.briefFor(ctx, { contactId } | { partyId }) → { contactId, … } | null   (facade for chat/member/account)
//   CS.set(ctx, actor, contactId, { channel, granted, source }) — append-only CrmContactConsent; member-linked contact ⇒
//        written through the member facade `setConsent` (MemberConsent) and NO CrmContactConsent row
//   CS.current(ctx, actor, contactId) → { channel, granted: boolean|null }[] [tolerated: {channels:[…]} / map]
//   CS.history(ctx, actor, contactId, channel?) → rows newest first
//   CS.canContact(contact /* CrmContact row */, channel, { transactional? }) → boolean | { ok } (async allowed):
//        marketing needs a granted consent (member-linked ⇒ MemberConsent) and no marketingOptOut; transactional ignores
//        consent/opt-out; EMAIL with emailBouncedAt ⇒ false always
//   member privacy log: `listAccessLog` (member/privacy.ts) excludes rows whose page starts with "crm." (C1.2a review debt S3)
//   events: registered in outbox-consumers + automation OR webhooks labels (once) · emitted INSIDE the write tx ·
//           key `crm.contact.<type>#<id>#<seq>` · payload ids only · consumers idempotent (twice / in parallel)
//   pages: src/app/app/sys/[id]/crm/contacts/{page.tsx (uses the v2 service), [contactId]/page.tsx (notFound()), new/page.tsx} ·
//          crm/nav.ts lists /crm/contacts/new
//
// WHAT THIS FILE PROVES
//   S0 structure · S1 create/duplicate/party/utm (6) · S2 convert 3 ticks + rollback (5) · S3 lifecycle (2) · S4 list filters +
//   f.{key} + saved view (6) · S5 merge moves every FK (4) · S6 import mapping + onDuplicate ×3 (4) · S7 pages + events (3) ·
//   S8 consent set/current/history · opt-out append-only · canContact · member-linked single source · S9 brief extras
//   X1 other tenant / other CRM system / convert targets · X3 convert idempotency (10 in-process + 4 processes) · two users ⇒
//   CONFLICT · setPrimary ∥ updateContact across processes ⇒ no 40P01 · parallel duplicate create · parallel opt-out ·
//   X4 5 consumers twice / 5× parallel · X6 import caps / formulas / bad rows / tag+length caps / CSV · X8 ids-only payloads,
//   console/OpsEvent clean, export D8 + access log, privacy-log filter · X9 merge/archive/bulkAssign/export confirm+reason+audit
//   X2 n/a (no op/tool — C1.10) · X5 n/a (the import job is exercised, the cron claim/lease belongs to C0.5's dispatcher) ·
//   X7 n/a (no public endpoint) · X10 n/a (no files/secrets).
//
// HOUSE RULES: SKIP guard (no DB before it) · chk(id, title, ok, expected, actual, sev) · throwaway tenants `qc-c14-<rand>`
// (+ `-b`) swept in `finally` (every tenantId table, 4 passes) + throwaway users + test triggers · no drainOutbox ·
// seeded QC data never read or written · last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const CT_FILE = "src/lib/modules/crm/contacts.ts";
const SHARED_FILE = "src/lib/modules/crm/contacts-shared.ts";
const CS_FILE = "src/lib/modules/crm/consents.ts";
const SERVICE_FILE = "src/lib/modules/crm/service.ts";
const NAV_FILE = "src/lib/modules/crm/nav.ts";
const PAGE_DIR = "src/app/app/sys/[id]/crm/contacts";
const CT_SPEC = "@/lib/modules/crm/contacts";
const CS_SPEC = "@/lib/modules/crm/consents";
const SHARED_SPEC = "@/lib/modules/crm/contacts-shared";
const CO_SPEC = "@/lib/modules/crm/companies";
const THIS_FILE = "scripts/qc-crm-c1.4.mts";

const ARGV = process.argv.slice(2);
const WORKER_AT = ARGV.indexOf("--x3-worker");
const FORCE = ARGV.includes("--force-run");

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guard — nothing of C1.4 exists yet ⇒ SKIPPED, no DB connection opened.
// ═══════════════════════════════════════════════════════════════════════════════════
if (!existsSync(CT_FILE) && WORKER_AT < 0 && !FORCE) {
  console.log(`⚠️  SKIPPED — WO C1.4 not built yet (${CT_FILE} missing)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();

const ownerActor = (userId: string) => ({ userId, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> });
const staffActor = (userId: string) => ({ userId, role: "STAFF", unitAccess: ["*"] as string[], permissions: {} as Record<string, unknown> });
const fnOf = (mod: Any, ...names: string[]): Any => {
  for (const n of names) if (typeof mod?.[n] === "function") return mod[n];
  return undefined;
};

// ═══════════════════════════════════════════════════════════════════════════════════
// X3 WORKER MODE — this same file re-invoked as a child process (own PrismaClient = own pool, synchronised start).
//   argv: --x3-worker <convert|lock> <tenantId> <crmSystemId> <userId> <contactId> <startAtMs> <arg>
//     convert: arg = base64url(JSON convert input) → 3 parallel CT.convertContact(ctx, actor, contactId, input) (same key)
//     lock   : arg = "<primary|update>|<coX>,<coY>" → 3 rounds × 3 parallel calls:
//              primary ⇒ CO.setPrimary(ctx, actor, co, contactId) alternating coX/coY
//              update  ⇒ CT.updateContact(ctx, actor, contactId, { companyId: coX|coY, jobTitle })
// ═══════════════════════════════════════════════════════════════════════════════════
if (WORKER_AT >= 0) {
  const [mode, wT, wS, wU, wK, wStart, wArg] = ARGV.slice(WORKER_AT + 1);
  const CTW = (await import(CT_SPEC as string).catch(() => ({}))) as Any;
  const COW = (await import(CO_SPEC as string).catch(() => ({}))) as Any;
  const dbw = (await import("@/lib/core/db")) as Any;
  const PW = dbw.prisma as Any;
  const ctx = { tenantId: wT, systemId: wS, actorUserId: wU };
  const actor = ownerActor(wU);
  const waitMs = Number(wStart) - Date.now();
  if (waitMs > 0) await new Promise<void>((r) => setTimeout(r, waitMs));
  const err = (e: Any) => `ERR:${String(e?.code ?? "-")}:${e instanceof Error ? e.message : String(e)}`;
  let out: Any[] = [];
  if (mode === "convert") {
    const input = JSON.parse(Buffer.from(String(wArg), "base64url").toString("utf8"));
    const conv = fnOf(CTW, "convertContact");
    out = await Promise.all(
      [0, 1, 2].map(async () => {
        if (!conv) return { ok: false, code: "MISSING_FUNCTION" };
        try {
          const v = await conv(ctx, actor, wK, input);
          return { ok: true, customerId: v?.customerId ?? null, companyId: v?.companyId ?? null, dealId: v?.dealId ?? null };
        } catch (e) {
          return { ok: false, code: String((e as Any)?.code ?? ""), msg: String((e as Error)?.message ?? e).slice(0, 160) };
        }
      }),
    );
  } else {
    const [role, cos] = String(wArg).split("|");
    const [coX, coY] = String(cos ?? "").split(",");
    for (let round = 0; round < 3; round += 1) {
      const res = await Promise.all(
        [0, 1, 2].map(async (i) => {
          const co = (round + i) % 2 === 0 ? coX : coY;
          try {
            if (role === "primary") {
              if (typeof COW.setPrimary !== "function") return "ERR:MISSING_FUNCTION:setPrimary";
              await COW.setPrimary(ctx, actor, co, wK);
            } else {
              const up = fnOf(CTW, "updateContact");
              if (!up) return "ERR:MISSING_FUNCTION:updateContact";
              await up(ctx, actor, wK, { companyId: co, jobTitle: `งาน ${round}-${i}` });
            }
            return "OK";
          } catch (e) {
            return err(e);
          }
        }),
      );
      out.push(...res);
    }
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
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
type Res = { ok: boolean; v: Any; err: string; code: string; status: number; msg: string; e: Any };
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
const isRefused = (r: Res) => !r.ok && r.code !== "MISSING_FUNCTION" && ["VALIDATION", "BAD_INPUT", "CONFIRM_REQUIRED", "DUPLICATE", "CONFLICT", "NOT_FOUND", "FORBIDDEN"].includes(r.code);
const isScopeRefusal = (r: Res) => isNotFound(r) || isValidation(r);
const itemsOf = (r: Any): Any[] => (Array.isArray(r) ? r : (r?.items ?? r?.rows ?? r?.contacts ?? []));
const num = (v: Any): number => (v === null || v === undefined ? NaN : Number(v));
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
const boolOf = (v: Any): boolean => (typeof v === "boolean" ? v : !!(v?.ok ?? v?.allowed ?? v?.can ?? false));

// ─────────────────────────── state ───────────────────────────
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c14-${rand}`;
const TRIG = `qc_c14_${rand}`;
const TRIG_DEAL = `qc_c14_${rand}_deal`;
const NONE = `${TAG}-none`;
const kid = (v: Any): string => {
  const x = typeof v === "string" ? v : (v?.contact?.id ?? v?.contactId ?? v?.id ?? "");
  return typeof x === "string" && x ? x : NONE;
};
const dupsOf = (r: Res): Any[] => {
  const src = r.ok ? (r.v?.duplicates ?? (r.v?.duplicate ? [r.v.duplicate] : [])) : (r.e?.duplicates ?? []);
  return Array.isArray(src) ? src : [];
};
const dupIds = (r: Res): string[] => dupsOf(r).map((d) => String(d?.contactId ?? d?.id ?? d?.contact?.id ?? ""));
let phoneSeq = 0;
const phoneOf = (): string => `08${String((Math.floor(Math.random() * 9_000_000) + 1_000_000) * 10 + (phoneSeq++ % 10)).padStart(8, "0").slice(-8)}`;
const dashed = (p: string) => `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
const mailOf = (s: string) => `${TAG}-${s}@qc-crm.example`;
// PDPA sentinels (X8)
const SENT_PHONE = phoneOf();
const SENT_EMAIL = mailOf("secret-person");
const SENT_FIRST = `ลับสุดยอด${rand}`;
const SENT_LAST = `นามสกุลลับ${rand}`;
const SENT_LINE = `U${rand}lineidsecret`;
const SENT_CONTACT_SECRET = `โรคประจำตัวลับ-${rand}`;
const SENT_MEMBER_SECRET = `แพ้ยาลับ-${rand}`;
const FOREIGN_NAME = `ความลับร้านอื่น${rand}`;
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
const dropTriggers = async () => {
  await P.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRIG} ON "OutboxEvent"`).catch(() => 0);
  await P.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${TRIG}_fn()`).catch(() => 0);
  await P.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRIG_DEAL} ON "CrmDeal"`).catch(() => 0);
  await P.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${TRIG_DEAL}_fn()`).catch(() => 0);
};
/** make an INSERT on `table` fail for tenant A when `cond` holds (proves the write is inside ONE transaction) */
const mkTrigger = async (name: string, table: string, cond: string) => {
  await P.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON "${table}"`).catch(() => 0);
  await P.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${name}_fn()`).catch(() => 0);
  await P.$executeRawUnsafe(
    `CREATE FUNCTION ${name}_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."tenantId" = '${tidA}' AND ${cond} THEN RAISE EXCEPTION 'qc-c14 forced failure'; END IF; RETURN NEW; END $$`,
  );
  await P.$executeRawUnsafe(`CREATE TRIGGER ${name} AFTER INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION ${name}_fn()`);
};
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

console.log(`\n═══ QC CRM v2 · C1.4 — contacts v2 ═══`);
console.log(`[env] DB ${host} · tag ${TAG}${FORCE && !existsSync(CT_FILE) ? " · --force-run with contacts.ts ABSENT (every check below is expected red)" : ""}\n`);

try {
  // stale triggers of a killed run (they only ever fired for a deleted tenant) — tidy up
  {
    const stale = (await P.$queryRawUnsafe(`SELECT tgname, tgrelid::regclass::text AS tbl FROM pg_trigger WHERE tgname LIKE 'qc_c14_%'`).catch(() => [])) as Any[];
    for (const s of stale) {
      const n = String(s.tgname);
      if (/^qc_c14_[a-z]+(_deal)?$/.test(n)) {
        await P.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${n} ON ${String(s.tbl)}`).catch(() => 0);
        await P.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${n}_fn()`).catch(() => 0);
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — structure (static)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S0 · structure ──");
  let importErr = "";
  const CT = (await import(CT_SPEC as string).catch((e: Any) => {
    importErr = e instanceof Error ? e.message : String(e);
    return {};
  })) as Any;
  const CSmod = (await import(CS_SPEC as string).catch(() => null)) as Any;
  const CS = (CSmod ?? CT?.consents ?? {}) as Any;
  const SH = (await import(SHARED_SPEC as string).catch(() => null)) as Any;
  const CO = (await import(CO_SPEC as string).catch(() => ({}))) as Any;
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => null)) as Any;
  const MEM = (await import("@/lib/modules/member" as string).catch(() => null)) as Any;
  const PRIV = (await import("@/lib/modules/member/privacy" as string).catch(() => null)) as Any;
  const RULES = (await import("@/lib/modules/crm/rules" as string).catch(() => null)) as Any;
  const SVC = (await import("@/lib/modules/crm/service" as string).catch(() => null)) as Any;
  const MJ = (await import("@/lib/platform/minute-jobs" as string).catch(() => null)) as Any;
  const F = (MEM?.fields ?? null) as Any;
  const ctSrcAll = [
    ...(existsSync("src/lib/modules/crm") ? readdirSync("src/lib/modules/crm").filter((f) => /^contacts.*\.tsx?$/.test(f)).map((f) => read(join("src/lib/modules/crm", f))) : []),
    read(CS_FILE),
  ].join("\n");
  const ctSrc = read(CT_FILE);
  const sharedSrc = read(SHARED_FILE);
  const capOf = (k: string): number => num(SH?.[k] ?? CT?.[k]);
  const fns = {
    create: fnOf(CT, "createContact"),
    update: fnOf(CT, "updateContact"),
    get360: fnOf(CT, "getContact360"),
    list: fnOf(CT, "listContacts"),
    convert: fnOf(CT, "convertContact"),
    assign: fnOf(CT, "assignContact"),
    bulkAssign: fnOf(CT, "bulkAssign", "bulkAssignContacts"),
    setLeadStatus: fnOf(CT, "setLeadStatus"),
    setLifecycle: fnOf(CT, "setLifecycle"),
    setTags: fnOf(CT, "setTags"),
    setOptOut: fnOf(CT, "setOptOut"),
    archive: fnOf(CT, "archiveContact", "archive"),
    findDup: fnOf(CT, "findDuplicates"),
    merge: fnOf(CT, "mergeContacts"),
    imp: fnOf(CT, "importContacts"),
    impStatus: fnOf(CT, "getImportJob", "importStatus"),
    impRun: fnOf(CT, "runImportJobs"),
    exp: fnOf(CT, "exportContacts"),
    brief: fnOf(CT, "briefFor"),
    csSet: fnOf(CS, "set", "setConsent"),
    csCur: fnOf(CS, "current"),
    csHist: fnOf(CS, "history"),
    can: fnOf(CS, "canContact") ?? fnOf(CT, "canContact"),
  };
  chk("C1.4-S0.0", "contacts.ts exists and loads (module import does not throw)", existsSync(CT_FILE) && !importErr, "loads", importErr ? cut(importErr) : existsSync(CT_FILE) ? "-" : "file missing");
  {
    const want = ["createContact", "updateContact", "getContact360", "listContacts", "convertContact", "assignContact", "bulkAssign", "setLeadStatus",
      "setLifecycle", "setTags", "setOptOut", "archiveContact", "findDuplicates", "mergeContacts", "importContacts", "getImportJob", "exportContacts", "briefFor"];
    const alias: Record<string, string[]> = { archiveContact: ["archive"], getImportJob: ["importStatus"] };
    const miss = want.filter((k) => !fnOf(CT, k, ...(alias[k] ?? [])));
    chk("C1.4-S0.1", "contacts.ts exports the §5.2 surface: create/update/getContact360/list/convert · assign/bulkAssign · setLeadStatus/setLifecycle/setTags/setOptOut/archive · findDuplicates/merge · import (+ job status)/export · briefFor",
      miss.length === 0, "all present", miss.join(",") || "-");
  }
  {
    const miss = ["set", "current", "history", "canContact"].filter((k) => (k === "canContact" ? !fns.can : !fnOf(CS, k, ...(k === "set" ? ["setConsent"] : []))));
    chk("C1.4-S0.2", "consents.ts (C20) exports set · current · history · canContact (canContact may live in contacts.ts)",
      existsSync(CS_FILE) && miss.length === 0, "file + 4 functions", `file=${existsSync(CS_FILE)} missing=${miss.join(",") || "-"}`);
  }
  {
    const caps = { rows: capOf("CONTACT_IMPORT_MAX_ROWS"), bytes: capOf("CONTACT_IMPORT_MAX_BYTES"), bulk: capOf("CONTACT_BULK_MAX"), reason: capOf("CONTACT_REASON_MIN"),
      tags: capOf("CONTACT_TAGS_MAX"), tag: capOf("CONTACT_TAG_MAX"), name: capOf("CONTACT_NAME_MAX") };
    chk("C1.4-S0.3", "named caps (contacts-shared.ts): import 50,000 rows / 10 MB · bulk ≤ 500 · reason ≥ 5 · tags ≤ 50 (each ≤ 64 chars) · name ≤ 200",
      caps.rows === 50_000 && caps.bytes === 10 * 1024 * 1024 && caps.bulk > 0 && caps.bulk <= 500 && caps.reason === 5 && caps.tags > 0 && caps.tags <= 50 && caps.tag > 0 && caps.tag <= 64 && caps.name > 0 && caps.name <= 200,
      "caps", j(caps), "MAJOR");
  }
  chk("C1.4-S0.4", "contacts-shared.ts is client-safe (the new-contact page / import dialog import caps from 'use client' files): no prisma / core db / server-only import",
    sharedSrc.length > 0 && !/from\s+["'](@prisma\/client|@\/lib\/core\/db|server-only|next\/headers)["']/.test(sharedSrc) && !/from\s+["']\.\/contacts["']/.test(sharedSrc),
    "exists · no server import", sharedSrc ? cut(sharedSrc.match(/from\s+["'][^"']+["']/g)?.join(" ") ?? "-") : "missing", "MINOR");
  chk("C1.4-S0.5", "CSV export is built with the shared `csvRow` of @/lib/core/csv (no second CSV engine) [static]",
    /import\s*\{[^}]*\bcsvRow\b[^}]*\}\s*from\s*["']@\/lib\/core\/csv["']/.test(ctSrcAll), "import { csvRow } from core/csv", "-", "MAJOR");
  chk("C1.4-S0.6", "cross-module calls only through facades (party via @/lib/modules/party incl. `updateContactInfo`, member via @/lib/modules/member) — no deep import into another module [static]",
    /["']@\/lib\/modules\/party["']/.test(ctSrcAll) && /\bupdateContactInfo\b/.test(ctSrcAll) && /["']@\/lib\/modules\/member["']/.test(ctSrcAll) &&
      !/["']@\/lib\/modules\/(account|party|member|chat)\/[^"']+["']/.test(ctSrcAll) && !/from\s+["']\.\.\/(account|party|member)\//.test(ctSrcAll),
    "facades only", cut(ctSrcAll.match(/["'][^"']*modules\/(account|party|member|chat)[^"']*["']/g)?.join(" ") ?? "-"), "MAJOR");
  {
    const m = /export\s+async\s+function\s+createContact\s*\([\s\S]*?\n\}/.exec(read(SERVICE_FILE));
    const body = m?.[0] ?? "";
    chk("C1.4-S0.7", "v1 `createContact(ctx, input)` in service.ts keeps its signature and is a thin wrapper around contacts.createContact (no own crmContact.create) [static]",
      /createContact\s*\(\s*ctx\s*:\s*Ctx\s*,\s*input\s*:\s*CreateContactInput\s*\)/.test(body) && !/crmContact\s*\.\s*create\s*\(/.test(body) && /contacts/.test(body + read(SERVICE_FILE).slice(0, 3000)),
      "wrapper", cut(body.slice(0, 200)), "MAJOR");
  }
  {
    // governed CrmContact columns — written only by the contact services (legacy writers excluded: v1 service.ts, member-bridges' link,
    // the engine's generic writer, companies*.ts for the companyId cache)
    const GOV = ["phone", "email", "marketingOptOut", "emailOptOut", "leadStatus", "ownerUserId", "tags", "previousEmails", "lineUserId", "convertedAt"];
    const writes = (src: string) => {
      const re = /crmContact\s*\.\s*(update|updateMany|create|createMany|upsert)\s*\(/g;
      let m: RegExpExecArray | null;
      const hits: string[] = [];
      while ((m = re.exec(src))) {
        const seg = src.slice(m.index, m.index + 900);
        for (const g of GOV) if (new RegExp(`\\b${g}\\s*:`).test(seg)) hits.push(g);
      }
      if (/UPDATE\s+"CrmContact"[\s\S]{0,400}?"(phone|email|marketingOptOut|leadStatus|ownerUserId|tags)"\s*=/.test(src)) hits.push("raw");
      return hits;
    };
    const off = walk("src")
      .filter((f) => !/\/crm\/(contacts[^/]*|consents|companies[^/]*|service)\.ts$/.test(f) && !/\/member\/fields\.ts$/.test(f) && !/\/member-bridges\.ts$/.test(f))
      .map((f) => ({ f, w: writes(read(f)) }))
      .filter((x) => x.w.length > 0);
    chk("C1.4-S0.8", "governed CrmContact columns (phone · email · opt-outs · leadStatus · ownerUserId · tags · previousEmails · lineUserId · convertedAt) are written only by contacts*.ts / consents.ts [static]",
      existsSync(CT_FILE) && off.length === 0, "contacts only", off.map((x) => `${x.f}:${[...new Set(x.w)].join("/")}`).join(", ") || (existsSync(CT_FILE) ? "-" : "contacts.ts missing"), "MAJOR");
  }
  chk("C1.4-S0.9", "assignment goes through a stub `assignment.pick` (C2.3 replaces it) — contacts*.ts calls pick() of an assignment helper [static]",
    /assignment\s*\.\s*pick\s*\(|\bpick\s*\(/.test(ctSrcAll) && (/from\s+["']\.\/assignment["']/.test(ctSrcAll) || /\bassignment\s*=\s*\{|const\s+assignment\b|namespace\s+assignment/.test(ctSrcAll)),
    "assignment.pick", "-", "MINOR");
  chk("C1.4-S0.10", "the crm facade (`@/lib/modules/crm`) exposes the contact service (as `contacts.*`) and the consent helpers (`consents.*` or canContact)",
    typeof CRM?.contacts?.createContact === "function" && (typeof CRM?.consents?.canContact === "function" || typeof CRM?.canContact === "function" || typeof CRM?.contacts?.canContact === "function"),
    "exported", `contacts=${typeof CRM?.contacts} consents=${typeof CRM?.consents}`, "MINOR");
  chk("C1.4-S0.11", "implementation sites are marked `// AUDIT-CLASS X1` / `X3` / `X6` / `X8` / `X9` in contacts*.ts / consents.ts [static]",
    ["X1", "X3", "X6", "X8", "X9"].every((x) => new RegExp(`AUDIT-CLASS ${x}\\b`).test(ctSrcAll)), "5 markers",
    ["X1", "X3", "X6", "X8", "X9"].filter((x) => !new RegExp(`AUDIT-CLASS ${x}\\b`).test(ctSrcAll)).join(",") || "-", "MINOR");
  chk("C1.4-S0.12", "no scattered contact reads: where.ts exports `contactWhere(ctx, actor)` (R-A — the file C1.7 rewrites) and contacts.ts reads through it (≥ 3 uses) [static]",
    /export\s+(async\s+)?function\s+contactWhere\b|export\s+const\s+contactWhere\b/.test(read("src/lib/modules/crm/where.ts")) && (ctSrc.match(/\bcontactWhere\b/g) ?? []).length >= 3,
    "contactWhere", `uses=${(ctSrc.match(/\bcontactWhere\b/g) ?? []).length}`, "MAJOR");

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — tenant A (crmA · crmA2 · memA) · tenant B (foreign: crmB · memB) · users owner/owner2/sales (A), stranger (B)
  // ═════════════════════════════════════════════════════════════════════════════
  const sysSvc = (await import("@/lib/modules/system/service")) as Any;
  const OBX = (await import("@/lib/outbox-consumers" as string)) as Any;
  const CONS: Any = OBX.consumers;
  const tA = await P.tenant.create({ data: { name: TAG, slug: TAG } });
  tidA = tA.id;
  const tB = await P.tenant.create({ data: { name: `${TAG}-b`, slug: `${TAG}-b` } });
  tidB = tB.id;
  TENANTS = [tidA, tidB];
  const mkUser = async (suffix: string) => {
    const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix || "owner"} ${TAG}` } });
    USERS.push(u.id);
    return u.id as string;
  };
  const userA = await mkUser("");
  const userA2 = await mkUser("-owner2");
  const userSales = await mkUser("-sales");
  const userStranger = await mkUser("-stranger");
  const member = (userId: string, tenantId: string, role: string) =>
    P.membership.create({ data: { userId, tenantId, role, unitAccess: ["*"], acceptedAt: new Date() } });
  await member(userA, tidA, "OWNER");
  await member(userA, tidB, "OWNER");
  await member(userA2, tidA, "OWNER");
  await member(userSales, tidA, "STAFF");
  await member(userStranger, tidB, "STAFF");
  const mk = async (tid: string, type: string, label: string) => (await sysSvc.createSystem(tid, type, `${label} ${TAG}`)).id as string;
  const crmA = await mk(tidA, "CRM", "CRM");
  const crmA2 = await mk(tidA, "CRM", "CRM สอง");
  const memA = await mk(tidA, "MEMBER", "สมาชิก");
  const crmB = await mk(tidB, "CRM", "CRM-B");
  const memB = await mk(tidB, "MEMBER", "สมาชิก-B");
  const actor = ownerActor(userA);
  const actor2 = ownerActor(userA2);
  const sales = staffActor(userSales);
  const cA = { tenantId: tidA, systemId: crmA, actorUserId: userA };
  const cA2 = { tenantId: tidA, systemId: crmA2, actorUserId: userA };
  const cB = { tenantId: tidB, systemId: crmB, actorUserId: userA };
  const mA = { tenantId: tidA, systemId: memA, actorUserId: userA };

  const mkPipe = async (tid: string, sys: string, name: string) =>
    P.crmPipeline.create({
      data: {
        tenantId: tid, systemId: sys, name: `${name} ${TAG}`, isDefault: true,
        stages: { create: [
          { tenantId: tid, systemId: sys, name: "ผู้สนใจใหม่", kind: "OPEN", probability: 10, sortOrder: 0 },
          { tenantId: tid, systemId: sys, name: "เจรจา", kind: "OPEN", probability: 50, sortOrder: 1 },
          { tenantId: tid, systemId: sys, name: "ชนะ", kind: "WON", probability: 100, sortOrder: 2 },
          { tenantId: tid, systemId: sys, name: "แพ้", kind: "LOST", probability: 0, sortOrder: 3 },
        ] },
      },
      include: { stages: true },
    }) as Promise<Any>;
  const pA = await mkPipe(tidA, crmA, "ขาย B2B");
  const pA2 = await mkPipe(tidA, crmA2, "ขายสอง");
  const pB = await mkPipe(tidB, crmB, "ขายร้านอื่น");
  const stFirst = (pA.stages as Any[]).find((s) => s.sortOrder === 0)?.id as string;
  const stSecond = (pA.stages as Any[]).find((s) => s.sortOrder === 1)?.id as string;

  const mkParty = async (tid: string, name: string, extra: Record<string, Any> = {}) =>
    (await P.party.create({ data: { tenantId: tid, name, kind: "PERSON", ...extra } })).id as string;
  /** raw contact — for groups whose SUBJECT is not createContact (no event, no service) */
  const rawContact = async (tid: string, sys: string, first: string, extra: Record<string, Any> = {}) => {
    const phone = (extra.phone as string | undefined) ?? phoneOf();
    const partyId = await mkParty(tid, first, { phone });
    return (await P.crmContact.create({ data: { tenantId: tid, systemId: sys, name: first, firstName: first, phone, partyId, ...extra } })).id as string;
  };
  const ctRow = (id: string) => P.crmContact.findFirst({ where: { id: id || NONE } }) as Promise<Any>;
  const partyRow = (id: string | null | undefined) => P.party.findFirst({ where: { id: id || NONE } }) as Promise<Any>;
  const create = (c: Any, input: Record<string, Any>, who: Any = actor) => call(fns.create, c, who, input);
  /** service first; raw fallback so a missing create never cascades into other groups */
  const fx = async (c: Any, input: Record<string, Any>): Promise<string> => {
    const r = await create(c, input);
    const id = kid(r.v);
    if (id !== NONE && (await ctRow(id))) return id;
    return rawContact(c.tenantId, c.systemId, String(input.firstName ?? "ผู้ติดต่อ"), {
      ...(input.phone ? { phone: input.phone } : {}), ...(input.email ? { email: input.email } : {}),
      ...(input.lastName ? { lastName: input.lastName } : {}), ...(input.ownerUserId ? { ownerUserId: input.ownerUserId } : {}),
      ...(input.sourceKind ? { sourceKind: input.sourceKind } : {}), ...(input.companyId ? { companyId: input.companyId } : {}),
    });
  };
  const fxCompany = async (c: Any, name: string): Promise<string> => {
    const r = await call(CO.createCompany, c, actor, { name });
    const id = String(r.v?.company?.id ?? r.v?.id ?? "");
    if (id && (await P.crmCompany.findFirst({ where: { id } }))) return id;
    const partyId = (await P.party.create({ data: { tenantId: c.tenantId, name, kind: "COMPANY" } })).id;
    return (await P.crmCompany.create({ data: { tenantId: c.tenantId, systemId: c.systemId, name, partyId } })).id as string;
  };
  const linkCompany = async (companyId: string, contactId: string, role = "OTHER") => {
    const r = await call(CO.addContact, cA, actor, companyId, { contactId, role });
    if (!r.ok && !(await P.crmCompanyContact.findFirst({ where: { companyId, contactId } })))
      await P.crmCompanyContact.create({ data: { tenantId: tidA, companyId, contactId, role } });
  };
  const evOf = async (type: string, id: string) =>
    (await P.outboxEvent.findMany({ where: { tenantId: { in: TENANTS }, type, idempotencyKey: { startsWith: `${type}#${id}#` } }, orderBy: { createdAt: "asc" } })) as Any[];
  const evtOf = (row: Any) => ({ id: row.id, tenantId: row.tenantId, type: row.type, payload: row.payload, systemId: row.systemId, unitId: row.unitId });
  const consume = async (row: Any) => call(CONS?.[row.type], evtOf(row));
  const lst = async (flt: Record<string, Any>, c: Any = cA, who: Any = actor) => {
    const r = await call(fns.list, c, who, { pageSize: 200, ...flt });
    return { r, ids: itemsOf(r.v).map((x) => kid(x)) };
  };
  const customersOf = async (contactId: string, sys = memA) => {
    const c = await ctRow(contactId);
    const ors: Any[] = [];
    if (c?.partyId) ors.push({ partyId: c.partyId });
    if (c?.phone) ors.push({ phone: c.phone });
    if (c?.email) ors.push({ email: c.email });
    return ors.length ? ((await P.customer.findMany({ where: { memberSystemId: sys, OR: ors } })) as Any[]) : [];
  };
  const convInput = (key: string, extra: Record<string, Any> = {}) => ({
    idempotencyKey: key,
    member: { systemId: memA },
    company: { new: { name: `บริษัทแปลง ${key}` } },
    deal: { pipelineId: pA.id, title: `ดีลแปลง ${key}`, valueSatang: 11_000_000 },
    ...extra,
  });
  const convSet = async (contactId: string, key: string) => ({
    customers: (await customersOf(contactId)).length,
    companies: await P.crmCompany.count({ where: { tenantId: tidA, name: `บริษัทแปลง ${key}` } }),
    deals: await P.crmDeal.count({ where: { contactId } }),
    converted: (await evOf("crm.contact.converted", contactId)).length,
  });

  // custom fields of objectKey "contact" (C1.2a engine) + a sensitive contact section + a sensitive MEMBER field (X8)
  const fctx = { ...cA, objectKey: "contact", actor };
  const sec = await call(F?.createSection, fctx, { key: "qcExtra", label: "ข้อมูลเพิ่ม" });
  const fTier = await call(F?.createField, fctx, { sectionId: sec.v?.id, key: "qcTier", label: "ระดับลูกค้า", type: "SELECT", filterable: true, options: { choices: [{ value: "gold", label: "ทอง" }, { value: "silver", label: "เงิน" }] } });
  const fRegion = await call(F?.createField, fctx, { sectionId: sec.v?.id, key: "qcRegion", label: "ภูมิภาค", type: "TEXT", filterable: true });
  const secS = await call(F?.createSection, fctx, { key: "qcSecret", label: "ข้อมูลลับ", sensitive: true });
  const fSecret = await call(F?.createField, fctx, { sectionId: secS.v?.id, key: "qcSecretNote", label: "บันทึกลับ", type: "TEXT", sensitive: true });
  const msec = await call(F?.createSection, { ...mA }, { key: "qcHealth", label: "สุขภาพ", sensitive: true });
  const mfld = await call(F?.createField, { ...mA }, { sectionId: msec.v?.id, key: "qcAllergy", label: "แพ้ยา", type: "TEXT", sensitive: true });
  chk("C1.4-SETUP.1", "[prerequisite C1.2a] field engine accepts objectKey \"contact\" (2 plain + 1 sensitive field) and a sensitive member field on the member system — if red, S4.5/X8 are red for C1.2a's reason",
    sec.ok && fTier.ok && fRegion.ok && secS.ok && fSecret.ok && msec.ok && mfld.ok, "ok", `${sec.err}${fTier.err}${fRegion.err}${secS.err}${fSecret.err}${msec.err}${mfld.err}`, "MAJOR");
  console.log(`[setup] tenant A ${tidA} · tenant B ${tidB} · crmA ${crmA} · crmA2 ${crmA2} · memA ${memA}\n`);

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — create: duplicate by phone / e-mail · Party · utm
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S1 · create ──");
  let c1Forced = NONE;
  const P1 = phoneOf();
  const E1 = mailOf("somchai");
  const r1 = await watch("createContact S1.1", () => create(cA, { firstName: "สมชาย", lastName: `ธนพร ${rand}`, phone: P1, email: E1, jobTitle: "ผู้จัดการฝ่ายจัดซื้อ" }));
  const c1 = kid(r1.v);
  const c1Row = await ctRow(c1);
  const c1Party = await partyRow(c1Row?.partyId);
  chk("C1.4-S1.1", "createContact stores firstName/lastName (+ legacy name \"first last\"), phone, e-mail in the ctx system, created:true, and links a Party PERSON carrying the same phone",
    r1.ok && r1.v?.created === true && c1Row?.systemId === crmA && c1Row?.firstName === "สมชาย" && c1Row?.lastName === `ธนพร ${rand}` &&
      c1Row?.name === `สมชาย ธนพร ${rand}` && !!c1Row?.partyId && c1Party?.kind === "PERSON" && String(c1Party?.phoneNorm ?? c1Party?.phone ?? "").replace(/\D/g, "").endsWith(P1.slice(1)),
    "row + Party", `${r1.err} created=${r1.v?.created} row=${cut(j(c1Row ? { f: c1Row.firstName, l: c1Row.lastName, n: c1Row.name, p: c1Row.partyId } : null), 140)} party=${c1Party?.kind}/${c1Party?.phone}`);
  {
    const before = await P.crmContact.count({ where: { systemId: crmA } });
    const r = await create(cA, { firstName: "สมชาย ซ้ำเบอร์", phone: dashed(P1) });
    const after = await P.crmContact.count({ where: { systemId: crmA } });
    const reason = String(dupsOf(r).find((d) => (d?.contactId ?? d?.id) === c1)?.reason ?? "").toUpperCase();
    chk("C1.4-S1.2", "the SAME phone typed differently (\"081-234-5678\") ⇒ duplicate: created:false · duplicates names the existing contact (reason PHONE) · no row written",
      dupIds(r).includes(c1) && (r.ok ? r.v?.created === false : r.code === "DUPLICATE") && after === before && reason.includes("PHONE"),
      `dup ${c1}/PHONE · +0`, `${r.err} dups=${cut(j(dupsOf(r)), 120)} created=${r.v?.created} rows ${before}→${after}`);
  }
  {
    const before = await P.crmContact.count({ where: { systemId: crmA } });
    const r = await create(cA, { firstName: "คนละคนแต่อีเมลเดียวกัน", email: E1.toUpperCase() });
    const after = await P.crmContact.count({ where: { systemId: crmA } });
    chk("C1.4-S1.3", "the same e-mail in another case ⇒ duplicate (reason EMAIL) · no row written",
      dupIds(r).includes(c1) && after === before && JSON.stringify(dupsOf(r)).toUpperCase().includes("EMAIL"), "dup EMAIL · +0", `${r.err} dups=${cut(j(dupsOf(r)), 120)} rows ${before}→${after}`);
  }
  {
    const r = await create(cA, { firstName: "สมชาย (ยืนยันสร้าง)", phone: P1, force: true });
    const row = await ctRow(kid(r.v));
    c1Forced = kid(r.v);
    chk("C1.4-S1.4", "force:true (the user chose \"create anyway\") ⇒ created:true as a candidate — own row, and the result still names the existing contact",
      r.ok && r.v?.created === true && !!row && row.id !== c1 && dupIds(r).includes(c1), "created + candidate", `${r.err} created=${r.v?.created} dups=${dupIds(r).join(",")}`, "MAJOR");
  }
  {
    const sd = { utm: { source: "facebook", medium: "cpc", campaign: `songkran-${rand}`, term: "ดำน้ำ", content: "banner-a" }, formId: `form-${rand}`, pageUrl: "https://shop.example/p?x=1", referrer: "https://google.com/" };
    const r = await create(cA, { firstName: "ลูกค้าโฆษณา", phone: phoneOf(), sourceKind: "WEB_FORM", sourceChannel: "LINE", sourceDetail: sd });
    const row = await ctRow(kid(r.v));
    const got = row?.sourceDetail ?? {};
    chk("C1.4-S1.5", "sourceDetail is stored complete: the 5 utm keys + formId + pageUrl + referrer, sourceKind WEB_FORM",
      r.ok && row?.sourceKind === "WEB_FORM" && j(got?.utm) === j(sd.utm) && got?.formId === sd.formId && got?.pageUrl === sd.pageUrl && got?.referrer === sd.referrer,
      "utm ×5 + form/page/referrer", `${r.err} kind=${row?.sourceKind} detail=${cut(j(got), 200)}`);
  }
  {
    const r = await create(cA2, { firstName: "สมชาย", lastName: `ธนพร ${rand}`, phone: P1 });
    const row = await ctRow(kid(r.v));
    chk("C1.4-S1.6", "another CRM system of the same shop: the same phone ⇒ a NEW row of that system sharing the SAME Party (§11.1) — not a duplicate",
      r.ok && r.v?.created === true && row?.systemId === crmA2 && row?.partyId === c1Row?.partyId && !dupIds(r).includes(c1),
      `crmA2 row · party ${c1Row?.partyId}`, `${r.err} sys=${row?.systemId === crmA2} party=${row?.partyId} dups=${dupIds(r).join(",")}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — lifecycle (canAdvanceLifecycle + CHURNED)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3 · lifecycle ──");
  {
    const k = await fx(cA, { firstName: `วงจร ${rand}`, phone: phoneOf() });
    const a = await call(fns.setLifecycle, cA, actor, k, "PROSPECT");
    const b = await call(fns.setLifecycle, cA, actor, k, "CUSTOMER");
    const back = await call(fns.setLifecycle, cA, actor, k, "LEAD");
    const row = await ctRow(k);
    chk("C1.4-S3.1", "LEAD → PROSPECT → CUSTOMER is allowed; CUSTOMER → LEAD is refused (VALIDATION, Thai) and the stage stays CUSTOMER",
      a.ok && b.ok && isValidation(back) && thai(back.msg) && row?.lifecycleStage === "CUSTOMER", "ok ok refused", `${a.err}${b.err} back=${back.err || "accepted"} stage=${row?.lifecycleStage}`);
    const churn = await call(fns.setLifecycle, cA, actor, k, "CHURNED");
    const k2 = await fx(cA, { firstName: `วงจรสอง ${rand}`, phone: phoneOf() });
    const leadChurn = await call(fns.setLifecycle, cA, actor, k2, "CHURNED");
    const cal = RULES?.canAdvanceLifecycle;
    const pure = typeof cal === "function" && cal("CUSTOMER", "CHURNED") === true && cal("LEAD", "CHURNED") === false && cal("PROSPECT", "CHURNED") === false && cal("CUSTOMER", "LEAD") === false;
    chk("C1.4-S3.2", "CHURNED (C1.4 owns the rule): rules.canAdvanceLifecycle CUSTOMER→CHURNED true · LEAD/PROSPECT→CHURNED false; the service lets CUSTOMER churn and refuses LEAD→CHURNED",
      pure && churn.ok && (await ctRow(k))?.lifecycleStage === "CHURNED" && isValidation(leadChurn) && (await ctRow(k2))?.lifecycleStage === "LEAD",
      "rules + service", `pure=${pure} churn=${churn.err || "ok"} leadChurn=${leadChurn.err || "accepted"}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — list: every filter · f.{key} · saved view
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S4 · list ──");
  const coF = await fxCompany(cA, `บริษัทตัวกรอง ${rand}`);
  const FP = { f1: phoneOf(), f2: phoneOf(), f3: phoneOf(), f4: phoneOf() };
  const FE3 = mailOf("filter3");
  const f1 = await fx(cA, { firstName: `กรอง ก ${rand}`, phone: FP.f1, ownerUserId: userSales, sourceKind: "WEB_FORM", companyId: coF, fields: { qcTier: "gold", qcRegion: "ภาคใต้" } });
  const f2 = await fx(cA, { firstName: `กรอง ข ${rand}`, phone: FP.f2, ownerUserId: userA, sourceKind: "CHAT", fields: { qcTier: "silver", qcRegion: "ภาคเหนือ" } });
  const f3 = await fx(cA, { firstName: `กรอง ค ${rand}`, phone: FP.f3, email: FE3, ownerUserId: userA, sourceKind: "WEB_FORM", companyId: coF, fields: { qcTier: "gold", qcRegion: "ภาคเหนือ" } });
  const f4 = await fx(cA, { firstName: `กรอง ง ${rand}`, phone: FP.f4, ownerUserId: userSales, sourceKind: "IMPORT", fields: { qcTier: "silver", qcRegion: "ภาคใต้" } });
  const FX = [f1, f2, f3, f4];
  await call(fns.setLeadStatus, cA, actor, f1, "QUALIFIED");
  await call(fns.setLeadStatus, cA, actor, f3, "QUALIFIED");
  await call(fns.setLeadStatus, cA, actor, f4, "CONTACTED");
  await call(fns.setLifecycle, cA, actor, f1, "PROSPECT");
  await call(fns.setLifecycle, cA, actor, f4, "CUSTOMER");
  // team / score band have no writer before C1.7 / C2.8 — fixture columns written raw
  const T1 = `${TAG}-team1`;
  const T2 = `${TAG}-team2`;
  await P.crmContact.update({ where: { id: f1 }, data: { teamId: T1, scoreBand: "HOT" } }).catch(() => 0);
  await P.crmContact.update({ where: { id: f2 }, data: { teamId: T2, scoreBand: "WARM" } }).catch(() => 0);
  await P.crmContact.update({ where: { id: f3 }, data: { teamId: T1, scoreBand: "COLD" } }).catch(() => 0);
  await P.crmContact.update({ where: { id: f4 }, data: { teamId: T2, scoreBand: "HOT" } }).catch(() => 0);
  const q = `กรอง`;
  const fl = async (flt: Record<string, Any>) => (await lst({ q, ...flt })).ids.filter((x) => FX.includes(x)).sort().join(",");
  const exp = (xs: string[]) => [...xs].sort().join(",");
  {
    const all = await fl({});
    const byPhone = (await lst({ q: FP.f2 })).ids;
    const byMail = (await lst({ q: FE3 })).ids;
    chk("C1.4-S4.1", "q searches name, phone and e-mail: \"กรอง\" ⇒ the 4 fixtures · f2's phone ⇒ only f2 · f3's e-mail ⇒ only f3",
      all === exp(FX) && sameSet(byPhone.filter((x) => FX.includes(x)), [f2]) && sameSet(byMail.filter((x) => FX.includes(x)), [f3]), "4 · f2 · f3", `all=${all.split(",").filter(Boolean).length} phone=${byPhone.length} mail=${byMail.length}`);
  }
  {
    const st = await fl({ stage: "PROSPECT" });
    const ls = await fl({ leadStatus: "QUALIFIED" });
    chk("C1.4-S4.2", "stage PROSPECT ⇒ f1 · leadStatus QUALIFIED ⇒ f1,f3", st === exp([f1]) && ls === exp([f1, f3]), "1 · 2", `stage=${st} lead=${ls}`);
  }
  {
    const ow = await fl({ owner: userSales });
    const so = await fl({ source: "WEB_FORM" });
    const co = await fl({ companyId: coF });
    chk("C1.4-S4.3", "owner ⇒ f1,f4 · source WEB_FORM ⇒ f1,f3 · companyId ⇒ f1,f3", ow === exp([f1, f4]) && so === exp([f1, f3]) && co === exp([f1, f3]), "2 · 2 · 2", `owner=${ow} source=${so} company=${co}`);
  }
  {
    const tm = await fl({ team: T1 });
    const sb = await fl({ scoreBand: "HOT" });
    chk("C1.4-S4.4", "team ⇒ f1,f3 · scoreBand HOT ⇒ f1,f4", tm === exp([f1, f3]) && sb === exp([f1, f4]), "2 · 2", `team=${tm} band=${sb}`);
  }
  {
    const vals = await P.customRecordValue.count({ where: { tenantId: tidA, recordType: "CONTACT", recordId: { in: FX } } });
    const g = await fl({ f: { qcTier: "gold" } });
    const gn = await fl({ f: { qcTier: "gold", qcRegion: "ภาคเหนือ" } });
    chk("C1.4-S4.5", "createContact({fields}) writes CustomRecordValue(recordType CONTACT) through the engine and `f.{key}` filters on them (gold ⇒ f1,f3 · gold AND ภาคเหนือ ⇒ f3)",
      vals >= 8 && g === exp([f1, f3]) && gn === exp([f3]), "8 values · 2 · 1", `values=${vals} gold=${g} gold+north=${gn}`);
  }
  {
    const view = await P.memberSavedView.create({ data: { tenantId: tidA, systemId: crmA, ownerUserId: userA, scope: "PRIVATE", name: `มุมมอง ${TAG}`, objectKey: "contact", filters: { leadStatus: "QUALIFIED", f: { qcRegion: "ภาคใต้" } } } });
    const wrong = await P.memberSavedView.create({ data: { tenantId: tidA, systemId: crmA2, ownerUserId: userA, scope: "PRIVATE", name: `มุมมองระบบอื่น ${TAG}`, objectKey: "contact", filters: { leadStatus: "NEW" } } });
    const v = await lst({ q, savedViewId: view.id });
    const w = await lst({ q, savedViewId: wrong.id });
    const vi = v.ids.filter((x) => FX.includes(x));
    const wi = w.ids.filter((x) => FX.includes(x));
    chk("C1.4-S4.6", "savedViewId (MemberSavedView objectKey \"contact\" of this system) applies its filters ⇒ f1 only · a view of ANOTHER CRM system is refused (or yields nothing) — never an unfiltered list",
      v.r.ok && sameSet(vi, [f1]) && (isScopeRefusal(w.r) || (w.r.ok && wi.length === 0)), "f1 · refused", `${v.r.err} view=${vi.length} wrong=${w.r.err || `ok:${wi.length}`}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S8 — consent (C20): append-only · current · history · opt-out · canContact
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S8 · consent ──");
  const consentRows = (contactId: string) => P.crmContactConsent.findMany({ where: { contactId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }) as Promise<Any[]>;
  const curOf = (v: Any, ch: string): Any => {
    const arr = Array.isArray(v) ? v : Array.isArray(v?.channels) ? v.channels : null;
    if (arr) return arr.find((x: Any) => x?.channel === ch)?.granted ?? null;
    const m = v?.channels ?? v;
    const x = m?.[ch];
    return typeof x === "boolean" ? x : (x?.granted ?? null);
  };
  const s8 = await fx(cA, { firstName: `ยินยอม ${rand}`, phone: phoneOf(), email: mailOf("consent") });
  {
    const a = await call(fns.csSet, cA, actor, s8, { channel: "EMAIL", granted: true, source: "STAFF" });
    const b = await call(fns.csSet, cA, actor, s8, { channel: "EMAIL", granted: false, source: "STAFF" });
    const c = await call(fns.csSet, cA, actor, s8, { channel: "LINE", granted: true, source: "STAFF" });
    const rows = await consentRows(s8);
    const cur = await call(fns.csCur, cA, actor, s8);
    const hist = await call(fns.csHist, cA, actor, s8, "EMAIL");
    const h = itemsOf(hist.v);
    chk("C1.4-S8.1", "consents.set appends (EMAIL yes → EMAIL no → LINE yes = 3 CrmContactConsent rows) · current = EMAIL false / LINE true · history(EMAIL) = 2 rows, newest (false) first",
      a.ok && b.ok && c.ok && rows.length === 3 && rows.every((r) => r.tenantId === tidA && r.systemId === crmA) && curOf(cur.v, "EMAIL") === false && curOf(cur.v, "LINE") === true &&
        h.length === 2 && h[0]?.granted === false && h[1]?.granted === true,
      "3 rows · current · history", `${a.err}${b.err}${c.err}${cur.err}${hist.err} rows=${rows.length} cur=${cut(j(cur.v), 120)} hist=${h.map((x) => x?.granted).join(",")}`);
  }
  {
    const before = await consentRows(s8);
    const snap = j(before);
    const o1 = await call(fns.setOptOut, cA, actor, s8, { optOut: true, source: "STAFF" });
    const r1x = await ctRow(s8);
    const mid = await consentRows(s8);
    const o2 = await call(fns.setOptOut, cA, actor, s8, { optOut: false, source: "STAFF" });
    const r2x = await ctRow(s8);
    const after = await consentRows(s8);
    chk("C1.4-S8.2", "setOptOut true → false: marketingOptOut follows, every change APPENDS consent rows and the earlier rows are byte-identical (never updated)",
      o1.ok && o2.ok && r1x?.marketingOptOut === true && r2x?.marketingOptOut === false && mid.length > before.length && after.length > mid.length &&
        j(after.slice(0, before.length)) === snap && j(after.slice(0, mid.length)) === j(mid),
      "append ×2 · unchanged history", `${o1.err}${o2.err} rows ${before.length}→${mid.length}→${after.length} opt=${r1x?.marketingOptOut}/${r2x?.marketingOptOut}`);
  }
  {
    const k = await fx(cA, { firstName: `ส่งได้ไหม ${rand}`, phone: phoneOf(), email: mailOf("can") });
    const row = async () => ctRow(k);
    const can = async (ch: string, o: Any = {}) => { const r = await call(fns.can, await row(), ch, o); return r.ok ? boolOf(r.v) : null; };
    const none = await can("EMAIL");
    await call(fns.csSet, cA, actor, k, { channel: "EMAIL", granted: true, source: "STAFF" });
    const granted = await can("EMAIL");
    await call(fns.setOptOut, cA, actor, k, { optOut: true, source: "STAFF" });
    const optedOut = await can("EMAIL");
    const trans = await can("EMAIL", { transactional: true });
    await P.crmContact.update({ where: { id: k }, data: { emailBouncedAt: new Date() } }).catch(() => 0);
    const bounced = await can("EMAIL", { transactional: true });
    chk("C1.4-S8.3", "canContact(contact, channel, {transactional?}): no consent ⇒ false · granted ⇒ true · marketingOptOut ⇒ false · transactional ignores opt-out ⇒ true · EMAIL bounced ⇒ false even transactional",
      none === false && granted === true && optedOut === false && trans === true && bounced === false, "F T F T F", `${none} ${granted} ${optedOut} ${trans} ${bounced}`);
  }
  {
    const k = await fx(cA, { firstName: `ช่องแปลก ${rand}`, phone: phoneOf() });
    const a = await call(fns.csSet, cA, actor, k, { channel: "PIGEON", granted: true, source: "STAFF" });
    const b = await call(fns.csSet, cA, actor, k, { channel: "WEBCHAT", granted: true, source: "STAFF" });
    chk("C1.4-S8.6", "an unknown channel and a channel that cannot hold consent (WEBCHAT — core/channels canConsent:false) ⇒ VALIDATION (Thai) · no row",
      isValidation(a) && isValidation(b) && thai(a.msg) && (await consentRows(k)).length === 0, "refused ×2", `${a.err || "accepted"} | ${b.err || "accepted"}`, "MAJOR");
  }
  {
    const k = await fx(cA, { firstName: `แอบถอน ${rand}`, phone: phoneOf() });
    await call(fns.setOptOut, cA, actor, k, { optOut: true, source: "STAFF" });
    const n0 = (await consentRows(k)).length;
    const up = await call(fns.update, cA, actor, k, { marketingOptOut: false });
    const row = await ctRow(k);
    const n1 = (await consentRows(k)).length;
    chk("C1.4-S8.7", "updateContact({marketingOptOut:false}) can never silently lift an opt-out: refused/ignored (still true) — or, if lifted, a consent row is appended",
      row?.marketingOptOut === true || n1 > n0, "no silent lift", `${up.err || "accepted"} optOut=${row?.marketingOptOut} rows ${n0}→${n1}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — convert: 3 ticks in ONE transaction · rollback
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2 · convert ──");
  const cv1 = await fx(cA, { firstName: "แปลง", lastName: `หนึ่ง ${rand}`, phone: phoneOf(), email: mailOf("cv1") });
  await call(fns.csSet, cA, actor, cv1, { channel: "EMAIL", granted: true, source: "STAFF" });
  await call(fns.csSet, cA, actor, cv1, { channel: "LINE", granted: false, source: "STAFF" });
  const K1 = `${TAG}-cv1`;
  const cvR = await watch("convertContact S2", () => call(fns.convert, cA, actor, cv1, convInput(K1)));
  const cv1Row = await ctRow(cv1);
  const cust = cvR.ok && cvR.v?.customerId ? await P.customer.findFirst({ where: { id: cvR.v.customerId } }) : null;
  chk("C1.4-S2.1", "convert (3 ticks) ⇒ a member in the chosen MEMBER system (source CRM, same Party) · contact.memberCustomerId = it · convertedAt set · lifecycle PROSPECT/CUSTOMER",
    cvR.ok && !!cust && cust.memberSystemId === memA && cust.source === "CRM" && cust.partyId === cv1Row?.partyId && cv1Row?.memberCustomerId === cust.id &&
      !!cv1Row?.convertedAt && ["PROSPECT", "CUSTOMER"].includes(String(cv1Row?.lifecycleStage)),
    "member linked", `${cvR.err} cust=${cut(j(cust ? { s: cust.memberSystemId === memA, src: cust.source, p: cust.partyId === cv1Row?.partyId } : null), 100)} row=${cut(j({ m: cv1Row?.memberCustomerId, at: !!cv1Row?.convertedAt, st: cv1Row?.lifecycleStage }), 120)}`);
  {
    const co = cvR.v?.companyId ? await P.crmCompany.findFirst({ where: { id: cvR.v.companyId } }) : null;
    const link = co ? await P.crmCompanyContact.findFirst({ where: { companyId: co.id, contactId: cv1 } }) : null;
    chk("C1.4-S2.2", "…the company tick (new) ⇒ a CrmCompany of the SAME CRM system + a current PRIMARY link row + contact.companyId cache",
      !!co && co.systemId === crmA && co.name === `บริษัทแปลง ${K1}` && !!link && link.isPrimary && !link.endedAt && cv1Row?.companyId === co.id,
      "company + primary link", `company=${!!co} link=${cut(j(link ? { p: link.isPrimary, e: link.endedAt } : null), 60)} cache=${cv1Row?.companyId === co?.id}`);
  }
  {
    const d = cvR.v?.dealId ? await P.crmDeal.findFirst({ where: { id: cvR.v.dealId } }) : null;
    const ev = await evOf("crm.contact.converted", cv1);
    chk("C1.4-S2.3", "…the deal tick ⇒ a CrmDeal in the chosen pipeline at its FIRST open stage (no stageId sent), contact + company set, value 110,000 ฿, kind OPEN · exactly one crm.contact.converted",
      !!d && d.systemId === crmA && d.pipelineId === pA.id && d.stageId === stFirst && d.contactId === cv1 && d.companyId === cvR.v?.companyId && d.valueSatang === 11_000_000 && d.kind === "OPEN" && ev.length === 1,
      "deal + 1 event", `deal=${cut(j(d ? { p: d.pipelineId === pA.id, st: d.stageId === stFirst, c: d.contactId === cv1, v: d.valueSatang, k: d.kind } : null), 140)} events=${ev.length}`);
  }
  const rollbackCase = async (label: string, trigName: string, table: string, cond: (id: string) => string) => {
    const k = await fx(cA, { firstName: `ย้อน ${label} ${rand}`, phone: phoneOf(), email: mailOf(`rb-${label}`) });
    const key = `${TAG}-rb-${label}`;
    const before = j(await ctRow(k));
    let r: Res;
    try {
      await mkTrigger(trigName, table, cond(k));
      r = await call(fns.convert, cA, actor, k, convInput(key));
    } finally {
      await dropTriggers();
    }
    const s = await convSet(k, key);
    const links = await P.crmCompanyContact.count({ where: { contactId: k } });
    const mcons = await P.memberConsent.count({ where: { tenantId: tidA, customer: { memberSystemId: memA, partyId: (await ctRow(k))?.partyId ?? NONE } } }).catch(() => -1);
    return { r, ok: !r.ok && r.code !== "MISSING_FUNCTION" && s.customers === 0 && s.companies === 0 && s.deals === 0 && s.converted === 0 && links === 0 && mcons <= 0 && j(await ctRow(k)) === before,
      info: `call=${r.ok ? "succeeded" : r.err} set=${j(s)} links=${links} contactSame=${j(await ctRow(k)) === before}` };
  };
  {
    const x = await rollbackCase("deal", TRIG_DEAL, "CrmDeal", () => "true");
    chk("C1.4-S2.4", "failure midway (the CrmDeal insert fails AFTER member + company were written) ⇒ NOTHING persists: no Customer, no CrmCompany, no link, no deal, no event, contact byte-identical — the member is created INSIDE the same transaction",
      x.ok, "all rolled back", x.info);
  }
  {
    const x = await rollbackCase("event", TRIG, "OutboxEvent", (id) => `NEW."idempotencyKey" LIKE 'crm.contact.converted#${id}#%'`);
    chk("C1.4-S2.5", "failure at the very end (crm.contact.converted cannot be written) ⇒ the whole convert rolls back (event emitted INSIDE the write transaction)",
      x.ok, "all rolled back", x.info);
  }
  {
    const mc = cvR.v?.customerId ? ((await P.memberConsent.findMany({ where: { customerId: cvR.v.customerId } })) as Any[]) : [];
    const em = mc.find((r) => r.channel === "EMAIL");
    const ln = mc.find((r) => r.channel === "LINE");
    chk("C1.4-S8.4", "R-E.11: convert copies the latest CrmContactConsent state into MemberConsent once (EMAIL granted · LINE refused)",
      cvR.ok && em?.granted === true && ln?.granted === false, "EMAIL true · LINE false", `rows=${cut(j(mc.map((r) => [r.channel, r.granted])), 120)}`, "MAJOR");
  }
  {
    // member-linked contact: one source of truth (MemberConsent through the member facade)
    const custId = String(cvR.v?.customerId ?? NONE);
    const n0 = (await consentRows(cv1)).length;
    const a = await call(fns.csSet, cA, actor, cv1, { channel: "SMS", granted: true, source: "STAFF" });
    const n1 = (await consentRows(cv1)).length;
    const sms = await P.memberConsent.findFirst({ where: { customerId: custId, channel: "SMS" } });
    const m = await call(MEM?.setConsent, mA, actor, custId, { channel: "EMAIL", granted: false, source: "STAFF" });
    const cur = await call(fns.csCur, cA, actor, cv1);
    const can = await call(fns.can, await ctRow(cv1), "EMAIL", {});
    chk("C1.4-S8.5", "member-linked contact: consents.set writes MemberConsent (SMS) and NO CrmContactConsent row · a change made on the member side (EMAIL → no) is what current() and canContact() report — one source of truth",
      a.ok && n1 === n0 && sms?.granted === true && m.ok && cur.ok && curOf(cur.v, "EMAIL") === false && curOf(cur.v, "SMS") === true && can.ok && boolOf(can.v) === false,
      "member side only", `${a.err}${m.err}${cur.err}${can.err} crmRows ${n0}→${n1} sms=${sms?.granted} cur=${cut(j(cur.v), 100)} can=${j(can.v)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 — merge moves every FK (X9 refusals first)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S5 · merge ──");
  const PK = phoneOf();
  const PM = phoneOf();
  const kK = await fx(cA, { firstName: `เก็บไว้ ${rand}`, phone: PK, email: mailOf("keep") });
  const kM = await fx(cA, { firstName: `รวมเข้า ${rand}`, phone: PM, email: mailOf("merge") });
  const coM1 = await fxCompany(cA, `บริษัทรวม หนึ่ง ${rand}`);
  const coM2 = await fxCompany(cA, `บริษัทรวม สอง ${rand}`);
  await linkCompany(coM1, kK, "DECISION_MAKER");
  await linkCompany(coM1, kM, "BILLING");
  await linkCompany(coM2, kM, "TECHNICAL");
  const mkDeal = async (contactId: string, title: string) =>
    (await P.crmDeal.create({ data: { tenantId: tidA, systemId: crmA, contactId, pipelineId: pA.id, stageId: stSecond, title, valueSatang: 1_000, kind: "OPEN" } })).id as string;
  const dM1 = await mkDeal(kM, `ดีลของคนรวม 1 ${rand}`);
  const dM2 = await mkDeal(kM, `ดีลของคนรวม 2 ${rand}`);
  const dK = await mkDeal(kK, `ดีลของคนเก็บ ${rand}`);
  await P.crmDealContact.create({ data: { tenantId: tidA, dealId: dK, contactId: kM, role: "INFLUENCER" } });
  await P.crmActivity.createMany({ data: [0, 1].map((i) => ({ tenantId: tidA, systemId: crmA, contactId: kM, type: "NOTE", title: `โน้ต ${i} ${rand}` })) });
  await P.crmFileLink.create({ data: { tenantId: tidA, systemId: crmA, entityType: "CONTACT", entityId: kM, fileId: `${TAG}-file`, name: "a.pdf", size: 10, mime: "application/pdf" } });
  const obj = await P.customObject.create({ data: { tenantId: tidA, systemId: crmA, key: `qccar${rand}`, label: "รถ", labelPlural: "รถ", parentType: "CONTACT", titleFieldKey: "title" } });
  const rec = await P.customRecord.create({ data: { tenantId: tidA, systemId: crmA, objectId: obj.id, parentType: "CONTACT", parentId: kM, title: "รถกระบะ" } });
  const mergeReason = "ลูกค้าคนเดียวกันกรอกฟอร์มสองครั้ง";
  const mNoConfirm = await call(fns.merge, cA, actor, { keepId: kK, mergeId: kM, reason: mergeReason });
  const mShort = await call(fns.merge, cA, actor, { keepId: kK, mergeId: kM, confirm: true, reason: "ซ้ำ" });
  const mStateAfterRefusals = { m: await ctRow(kM), deals: await P.crmDeal.count({ where: { contactId: kM } }) };
  const kMpartyBefore = (await ctRow(kM))?.partyId as string | undefined;
  const kKpartyBefore = (await ctRow(kK))?.partyId as string | undefined;
  const mr = await watch("mergeContacts", () => call(fns.merge, cA, actor, { keepId: kK, mergeId: kM, confirm: true, reason: mergeReason, fieldChoices: { phone: "merge" } }));
  {
    const m = await ctRow(kM);
    const k = await ctRow(kK);
    const ev = await P.outboxEvent.findMany({ where: { tenantId: tidA, type: "crm.contact.merged" } });
    const hit = (ev as Any[]).filter((e) => e.payload?.keptId === kK && e.payload?.mergedId === kM);
    chk("C1.4-S5.1", "mergeContacts: merged row KEPT with mergedIntoId = keep + archivedAt · keep stays live · one crm.contact.merged {keptId, mergedId}",
      mr.ok && m?.mergedIntoId === kK && !!m?.archivedAt && !k?.archivedAt && !k?.mergedIntoId && hit.length === 1, "merged · 1 event", `${mr.err} merged=${m?.mergedIntoId === kK}/${!!m?.archivedAt} events=${hit.length}`);
  }
  {
    const deals = await P.crmDeal.findMany({ where: { id: { in: [dM1, dM2] } } });
    const acts = await P.crmActivity.count({ where: { contactId: kM } });
    const actsK = await P.crmActivity.count({ where: { contactId: kK, title: { startsWith: "โน้ต" } } });
    const dc = await P.crmDealContact.findMany({ where: { dealId: dK } });
    chk("C1.4-S5.2", "deals · activities · deal-contact links move to keep (0 left on the merged contact; a deal-contact row of keep's own deal pointing at the merged contact is re-pointed or dropped, never duplicated)",
      (deals as Any[]).every((d) => d.contactId === kK) && acts === 0 && actsK === 2 && !(dc as Any[]).some((x) => x.contactId === kM),
      "moved", `deals=${(deals as Any[]).map((d) => d.contactId === kK).join(",")} actsLeft=${acts} actsKeep=${actsK} dealContacts=${(dc as Any[]).map((x) => x.contactId === kM ? "M" : "K").join(",")}`);
  }
  {
    const l1 = (await P.crmCompanyContact.findMany({ where: { companyId: coM1 } })) as Any[];
    const l2 = (await P.crmCompanyContact.findMany({ where: { companyId: coM2 } })) as Any[];
    const files = await P.crmFileLink.count({ where: { entityType: "CONTACT", entityId: kM } });
    const r = await P.customRecord.findFirst({ where: { id: rec.id } });
    chk("C1.4-S5.3", "company roles move (clash in company 1 ⇒ keep's DECISION_MAKER row wins, one row) · company 2 link now keep's · file links and custom records (parent CONTACT) re-pointed to keep",
      l1.length === 1 && l1[0].contactId === kK && l1[0].role === "DECISION_MAKER" && l2.length === 1 && l2[0].contactId === kK && files === 0 && r?.parentId === kK,
      "moved", `c1=${j(l1.map((x) => [x.contactId === kK ? "K" : "M", x.role]))} c2=${j(l2.map((x) => x.contactId === kK ? "K" : "M"))} filesLeft=${files} record=${r?.parentId === kK}`);
  }
  {
    const k = await ctRow(kK);
    const pm = await partyRow(kMpartyBefore);
    const pk = await partyRow(k?.partyId);
    chk("C1.4-S5.4", "Party merge (merged Party.mergedIntoId = keep's Party) · fieldChoices {phone:\"merge\"} ⇒ keep carries the merged phone and keep's Party phone is in sync",
      mr.ok && pm?.mergedIntoId === kKpartyBefore && k?.phone === PM && String(pk?.phoneNorm ?? pk?.phone ?? "").replace(/\D/g, "").endsWith(PM.slice(1)),
      "party merged · phone", `mergedParty→${pm?.mergedIntoId === kKpartyBefore} keepPhone=${k?.phone === PM} partyPhone=${pk?.phone}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S6 — import: mapping · onDuplicate update | skip | candidate (async job)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S6 · import ──");
  const impRes = (v: Any) => {
    const x = v?.result ?? v;
    return { created: num(x?.created), updated: num(x?.updated), skipped: num(x?.skipped), candidates: num(x?.candidates), failed: num(x?.failed), errors: (Array.isArray(x?.errors) ? x.errors : []) as Any[] };
  };
  let sawJobId = false;
  const runImport = async (input: Any, who: Any = actor, c: Any = cA) => {
    const r = await call(fns.imp, c, who, input);
    if (!r.ok) return { r, res: null as ReturnType<typeof impRes> | null };
    let v = r.v;
    const jobId = typeof v?.jobId === "string" ? v.jobId : null;
    if (jobId) sawJobId = true;
    if (jobId && !v?.result && !(v && "created" in v)) {
      for (let i = 0; i < 40; i += 1) {
        if (fns.impRun) await call(fns.impRun, new Date());
        else await call(MJ?.runMinuteJobs, new Date());
        const s = await call(fns.impStatus, c, who, jobId);
        const st = String(s.v?.status ?? "").toUpperCase();
        if (s.ok && (st === "DONE" || st === "COMPLETED" || st === "FAILED")) { v = s.v; break; }
        await sleep(750);
      }
    }
    return { r, res: impRes(v) };
  };
  const MAP = { "ชื่อจริง": "firstName", "นามสกุล": "lastName", "มือถือ": "phone", "อีเมล": "email", "ระดับ": "f.qcTier", "บริษัท": "company", "แท็ก": "tags", "ตำแหน่ง": "jobTitle" };
  const IP = [phoneOf(), phoneOf(), phoneOf()];
  const IMPCO = `บริษัทจากไฟล์ ${rand}`;
  {
    const rows = [
      { "ชื่อจริง": `นำเข้า หนึ่ง ${rand}`, "นามสกุล": "ใจดี", "มือถือ": IP[0], "อีเมล": mailOf("imp1"), "ระดับ": "gold", "บริษัท": IMPCO, "แท็ก": "vip;งานแฟร์", "ตำแหน่ง": "" },
      { "ชื่อจริง": `นำเข้า สอง ${rand}`, "นามสกุล": "", "มือถือ": IP[1], "อีเมล": "", "ระดับ": "silver", "บริษัท": IMPCO, "แท็ก": "", "ตำแหน่ง": "" },
      { "ชื่อจริง": `นำเข้า สาม ${rand}`, "นามสกุล": "", "มือถือ": IP[2], "อีเมล": "", "ระดับ": "", "บริษัท": "", "แท็ก": "", "ตำแหน่ง": "" },
    ];
    const { r, res } = await runImport({ rows, mapping: MAP, options: { onDuplicate: "skip", source: "IMPORT" } });
    const k1 = await P.crmContact.findFirst({ where: { systemId: crmA, firstName: `นำเข้า หนึ่ง ${rand}` } });
    const val = k1 ? await P.customRecordValue.count({ where: { recordType: "CONTACT", recordId: k1.id } }) : 0;
    const co = await P.crmCompany.findFirst({ where: { systemId: crmA, name: IMPCO } });
    const links = co ? await P.crmCompanyContact.count({ where: { companyId: co.id } }) : 0;
    chk("C1.4-S6.1", "importContacts with a header mapping (ชื่อจริง→firstName · มือถือ→phone · ระดับ→f.qcTier · บริษัท→company · แท็ก→tags): 3 created · mapped values + custom value · company created once and both its rows linked",
      r.ok && res?.created === 3 && k1?.lastName === "ใจดี" && k1?.email === mailOf("imp1") && val >= 1 && (k1?.tags ?? []).includes("vip") && !!co && links === 2,
      "3 · mapped · company ×1 · 2 links", `${r.err} res=${cut(j(res), 120)} k1=${cut(j(k1 ? { l: k1.lastName, t: k1.tags } : null), 80)} vals=${val} company=${!!co} links=${links}`);
  }
  {
    const { r, res } = await runImport({ rows: [{ "ชื่อจริง": `นำเข้า หนึ่ง ${rand}`, "มือถือ": dashed(IP[0]), "ตำแหน่ง": "ผู้จัดการ" }], mapping: MAP, options: { onDuplicate: "update" } });
    const rows = (await P.crmContact.findMany({ where: { systemId: crmA, phone: { in: [IP[0], dashed(IP[0])] }, mergedIntoId: null } })) as Any[];
    chk("C1.4-S6.2", "onDuplicate \"update\": a row whose phone matches ⇒ updated 1 · created 0 · jobTitle written · still ONE contact with that phone",
      r.ok && res?.updated === 1 && res?.created === 0 && rows.length === 1 && rows[0].jobTitle === "ผู้จัดการ", "updated 1", `${r.err} res=${cut(j(res), 120)} rows=${rows.length} job=${rows[0]?.jobTitle}`);
  }
  {
    const { r, res } = await runImport({ rows: [{ "ชื่อจริง": `นำเข้า หนึ่ง ${rand}`, "มือถือ": IP[0], "ตำแหน่ง": "ห้ามทับ" }], mapping: MAP, options: { onDuplicate: "skip" } });
    const row = await P.crmContact.findFirst({ where: { systemId: crmA, phone: IP[0] } });
    chk("C1.4-S6.3", "onDuplicate \"skip\": the same row ⇒ skipped 1 · nothing written (jobTitle unchanged)",
      r.ok && res?.skipped === 1 && res?.created === 0 && res?.updated === 0 && row?.jobTitle === "ผู้จัดการ", "skipped 1", `${r.err} res=${cut(j(res), 120)} job=${row?.jobTitle}`);
  }
  {
    const { r, res } = await runImport({ rows: [{ "ชื่อจริง": `นำเข้า หนึ่ง (อีกคน) ${rand}`, "มือถือ": IP[1] }], mapping: MAP, options: { onDuplicate: "candidate" } });
    const n = await P.crmContact.count({ where: { systemId: crmA, phone: IP[1] } });
    chk("C1.4-S6.4", "onDuplicate \"candidate\": a matching row is created as a NEW contact and reported as a candidate (created 1 · candidates 1) — never merged silently",
      r.ok && res?.created === 1 && res?.candidates === 1 && n === 2, "created 1 · candidate 1", `${r.err} res=${cut(j(res), 120)} rowsWithPhone=${n}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S7 — pages (static) + events
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S7 · pages + events ──");
  {
    const list = read(join(PAGE_DIR, "page.tsx"));
    const p360 = join(PAGE_DIR, "[contactId]", "page.tsx");
    const pNew = join(PAGE_DIR, "new", "page.tsx");
    const nav = read(NAV_FILE);
    chk("C1.4-S7.1", "pages: /contacts (list uses the v2 service — listContacts / crm contacts), /contacts/[contactId] (notFound() guard — 404-not-403), /contacts/new · nav lists /crm/contacts/new [static; screenshots = controller D7]",
      /listContacts|contacts-actions|contacts["']/.test(list) && existsSync(p360) && /\bnotFound\s*\(/.test(read(p360)) && existsSync(pNew) && /\/crm\/contacts\/new/.test(nav),
      "3 pages + nav", `listV2=${/listContacts|contacts-actions|contacts["']/.test(list)} 360=${existsSync(p360)} notFound=${/\bnotFound\s*\(/.test(read(p360))} new=${existsSync(pNew)} nav=${/\/crm\/contacts\/new/.test(nav)}`, "MAJOR");
  }
  {
    const ev = await evOf("crm.contact.created", c1);
    const keyRe = new RegExp(`^crm\\.contact\\.created#${c1}#[^#\\s]+$`);
    chk("C1.4-S7.2", "createContact emits exactly ONE crm.contact.created — key `crm.contact.created#<contactId>#<seq>` (R-C.8), systemId = the CRM system, payload.contactId + partyId",
      ev.length === 1 && keyRe.test(ev[0].idempotencyKey) && ev[0].systemId === crmA && ev[0].payload?.contactId === c1 && ev[0].payload?.partyId === c1Row?.partyId,
      "1 event", `n=${ev.length} ${cut(j(ev[0] ? { k: ev[0].idempotencyKey, s: ev[0].systemId === crmA, p: ev[0].payload } : null), 200)}`);
  }
  {
    const a = await call(fns.update, cA, actor, c1, { jobTitle: "ผู้อำนวยการฝ่ายจัดซื้อ" });
    const b = await call(fns.update, cA, actor, c1, { lastName: `ธนพรใหม่ ${rand}` });
    const ev = await evOf("crm.contact.updated", c1);
    const asg = await call(fns.assign, cA, actor, c1, { userId: userSales });
    const ea = await evOf("crm.contact.assigned", c1);
    chk("C1.4-S7.3", "two updates ⇒ two crm.contact.updated (distinct #<seq>) · assignContact ⇒ crm.contact.assigned (payload contactId + ownerUserId ids)",
      a.ok && b.ok && ev.length >= 2 && new Set(ev.map((e) => e.idempotencyKey)).size === ev.length && asg.ok && ea.length >= 1 && ea.at(-1)?.payload?.contactId === c1,
      "≥2 distinct · assigned", `${a.err}${b.err}${asg.err} updated=${ev.length} assigned=${ea.length}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S9 — brief extras
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S9 · brief extras ──");
  const EVTS = ["crm.contact.created", "crm.contact.updated", "crm.contact.assigned", "crm.contact.converted", "crm.contact.merged"];
  {
    const autoL = (await import("@/lib/automation/labels")) as Any;
    const hookL = (await import("@/lib/webhooks/labels")) as Any;
    const hook = new Set(((hookL.WEBHOOK_EVENTS ?? []) as Any[]).map((e) => e.value));
    const auto = new Set(((autoL.AUTOMATION_EVENTS ?? []) as Any[]).map((e) => e.value));
    const missing = EVTS.filter((t) => typeof CONS?.[t] !== "function" || !hook.has(t));
    const srcA = read("src/lib/automation/labels.ts");
    const srcW = read("src/lib/webhooks/labels.ts");
    const decl = (src: string, t: string) => (src.match(new RegExp(`value:\\s*"${t.replace(/\./g, "\\.")}"`, "g")) ?? []).length;
    const dupDecl = EVTS.filter((t) => decl(srcA, t) + decl(srcW, t) !== 1);
    chk("C1.4-S9.1", "the 5 events are in all 3 registries — consumer in outbox-consumers.ts + label reachable from WEBHOOK_EVENTS, declared exactly once (automation OR webhooks labels)",
      missing.length === 0 && dupDecl.length === 0, "5 × 3", `missing=${missing.join(",") || "-"} declCount≠1=${dupDecl.join(",") || "-"} (automation has ${EVTS.filter((t) => auto.has(t)).length})`);
  }
  {
    const k = await fx(cA, { firstName: `เปลี่ยนเมล ${rand}`, phone: phoneOf(), email: mailOf("old1") });
    const NP = phoneOf();
    const a = await call(fns.update, cA, actor, k, { email: mailOf("new1"), phone: NP });
    const b = await call(fns.update, cA, actor, k, { email: mailOf("new2") });
    const row = await ctRow(k);
    const p = await partyRow(row?.partyId);
    const prev = (row?.previousEmails ?? []) as string[];
    chk("C1.4-S9.2", "updateContact(phone, e-mail) keeps the Party in sync (party.updateContactInfo) and keeps every old e-mail in previousEmails (R-A: old1 + new1, no duplicates, current not listed)",
      a.ok && b.ok && row?.email === mailOf("new2") && p?.email === mailOf("new2") && String(p?.phoneNorm ?? p?.phone ?? "").replace(/\D/g, "").endsWith(NP.slice(1)) &&
        prev.includes(mailOf("old1")) && prev.includes(mailOf("new1")) && !prev.includes(mailOf("new2")) && new Set(prev).size === prev.length,
      "Party synced · previousEmails", `${a.err}${b.err} row=${row?.email} party=${p?.email}/${p?.phone} prev=${j(prev)}`);
  }
  {
    const before = await ctRow(c1);
    const sm = await call(fns.update, cA, actor, c1, { fields: { email: mailOf("smuggled"), marketingOptOut: true } });
    const row = await ctRow(c1);
    const p = await partyRow(row?.partyId);
    const refused = isRefused(sm) && row?.email === before?.email && row?.marketingOptOut === before?.marketingOptOut;
    const routed = sm.ok && p?.email === row?.email && (row?.marketingOptOut === before?.marketingOptOut || (await consentRows(c1)).length > 0);
    chk("C1.4-S9.3", "governed keys smuggled through `fields` (email · marketingOptOut) never desync the Party nor lift/set an opt-out without a consent row: refused (row unchanged) or routed through the governed path",
      refused || routed, "refused/routed", `${sm.err || "accepted"} email=${row?.email} party=${p?.email} opt=${row?.marketingOptOut}`);
  }
  {
    const k = await fx(cA, { firstName: `แท็ก ${rand}`, phone: phoneOf() });
    const ls = await call(fns.setLeadStatus, cA, actor, k, "NURTURE");
    const bad = await call(fns.setLeadStatus, cA, actor, k, "HOTTEST");
    const tg = await call(fns.setTags, cA, actor, k, [" vip ", "vip", "งานแฟร์", ""]);
    const row = await ctRow(k);
    chk("C1.4-S9.4", "setLeadStatus NURTURE ok · unknown status ⇒ VALIDATION · setTags trims, drops empties and de-duplicates ([\" vip \",\"vip\",\"งานแฟร์\",\"\"] ⇒ vip, งานแฟร์)",
      ls.ok && isValidation(bad) && row?.leadStatus === "NURTURE" && tg.ok && sameSet(row?.tags ?? [], ["vip", "งานแฟร์"]), "ok", `${ls.err}${tg.err} bad=${bad.err || "accepted"} status=${row?.leadStatus} tags=${j(row?.tags)}`, "MAJOR");
  }
  {
    const k = await fx(cA, { firstName: `มอบหมาย ${rand}`, phone: phoneOf() });
    const ok1 = await call(fns.assign, cA, actor, k, { userId: userSales });
    const row = await ctRow(k);
    const bad = await call(fns.assign, cA, actor, k, { userId: userStranger });
    const row2 = await ctRow(k);
    chk("C1.4-S9.5", "assignContact: ownerUserId + assignedAt + assignedBy (\"USER:<actor>\") written · a user of another shop ⇒ VALIDATION and the owner is unchanged",
      ok1.ok && row?.ownerUserId === userSales && !!row?.assignedAt && String(row?.assignedBy ?? "").includes(userA) && isValidation(bad) && row2?.ownerUserId === userSales,
      "assigned · refused", `${ok1.err} owner=${row?.ownerUserId === userSales} at=${!!row?.assignedAt} by=${row?.assignedBy} bad=${bad.err || "accepted"}`, "MAJOR");
  }
  {
    const r = await create(cA, { firstName: `ไม่มีผู้ดูแล ${rand}`, phone: phoneOf() }, actor2);
    const row = await ctRow(kid(r.v));
    chk("C1.4-S9.6", "no ownerUserId ⇒ the assignment stub (assignment.pick) gives the contact to its creator (C2.3 replaces the rule) · assignedAt set",
      r.ok && row?.ownerUserId === userA2 && !!row?.assignedAt, "creator", `${r.err} owner=${row?.ownerUserId === userA2 ? "creator" : row?.ownerUserId} at=${!!row?.assignedAt}`, "MAJOR");
  }
  {
    await call(F?.setFieldValues, fctx, cv1, { qcTier: "gold" }, { via: "STAFF" });
    const v = await call(fns.get360, cA, actor, cv1);
    const d = v.v ?? {};
    const memberPart = d.member ?? d.connections?.member ?? null;
    const companyPart = d.company ?? d.connections?.company ?? null;
    const dealsPart = (d.deals ?? d.connections?.deals ?? []) as Any[];
    const fieldsTxt = j(d.fields ?? d.sections ?? d.layout ?? null);
    chk("C1.4-S9.7", "getContact360 DTO (mockup 05 panels): contact header · member link (the converted customer) · company · open deals · custom fields of objectKey contact (qcTier) · timeline[] · consent",
      v.ok && kid(d.contact ?? d) === cv1 && j(memberPart).includes(String(cvR.v?.customerId ?? NONE)) && j(companyPart).includes(String(cvR.v?.companyId ?? NONE)) &&
        dealsPart.some((x) => (x?.id ?? x?.dealId) === cvR.v?.dealId) && fieldsTxt.includes("qcTier") && Array.isArray(d.timeline) && !!(d.consent ?? d.consents),
      "6 panels", `${v.err} member=${!!memberPart} company=${!!companyPart} deals=${dealsPart.length} fields=${fieldsTxt.includes("qcTier")} timeline=${Array.isArray(d.timeline)} consent=${!!(d.consent ?? d.consents)}`, "MAJOR");
  }
  {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    let err = "";
    do {
      const r = await call(fns.list, cA, actor, { q: `กรอง`, pageSize: 2, ...(cursor ? { cursor } : {}) });
      if (!r.ok) { err = r.err; break; }
      seen.push(...itemsOf(r.v).map((x) => kid(x)));
      cursor = (r.v?.nextCursor ?? null) as string | null;
      pages += 1;
    } while (cursor && pages < 10);
    chk("C1.4-S9.8", "cursor pagination: pageSize 2 + nextCursor walks all 4 fixtures in 2 pages, no duplicates, ends with nextCursor null",
      !err && sameSet(seen.filter((x) => FX.includes(x)), FX) && new Set(seen).size === seen.length && pages >= 2 && cursor === null, "4 · 2 pages", `${err} seen=${seen.length} pages=${pages}`, "MAJOR");
  }
  {
    const fd = await call(fns.findDup, cA, actor, {});
    const items = (Array.isArray(fd.v) ? fd.v : (fd.v?.items ?? fd.v?.pairs ?? [])) as Any[];
    const hasPair = items.some((it) => { const t = j(it); return t.includes(c1) && t.includes(c1Forced) && t.toUpperCase().includes("PHONE"); });
    chk("C1.4-S9.9", "findDuplicates reports the phone pair created by force:true in S1.4 (reason PHONE)", fd.ok && hasPair, "pair", `${fd.err} n=${items.length}`, "MAJOR");
  }
  {
    const b1 = await call(fns.brief, cA, { contactId: c1 });
    const b2 = await call(fns.brief, cA, { partyId: c1Row?.partyId });
    const bx = await call(fns.brief, cB, { partyId: c1Row?.partyId });
    chk("C1.4-S9.10", "briefFor({contactId}) and ({partyId}) return the contact; the same Party asked from another shop's CRM ⇒ null",
      b1.ok && kid(b1.v) === c1 && b2.ok && kid(b2.v) === c1 && (bx.ok ? bx.v == null || kid(bx.v) === NONE : isScopeRefusal(bx)), "brief · null", `${b1.err}${b2.err} b1=${kid(b1.v)} b2=${kid(b2.v)} foreign=${bx.err || j(bx.v)}`, "MAJOR");
  }
  {
    const k = await fx(cA, { firstName: `แปลงเฉพาะสมาชิก ${rand}`, phone: phoneOf() });
    const a = await call(fns.convert, cA, actor, k, { idempotencyKey: `${TAG}-memonly`, member: { systemId: memA } });
    const deals = await P.crmDeal.count({ where: { contactId: k } });
    const cos = await P.crmCompanyContact.count({ where: { contactId: k } });
    const again = await call(fns.convert, cA, actor, k, { idempotencyKey: `${TAG}-memonly-2`, member: { systemId: memA }, deal: { pipelineId: pA.id, title: `ดีลเพิ่ม ${rand}` } });
    const custs = await customersOf(k);
    const nokey = await call(fns.convert, cA, actor, await fx(cA, { firstName: `ไม่มีคีย์ ${rand}`, phone: phoneOf() }), { member: { systemId: memA } });
    chk("C1.4-S9.11", "partial ticks: member only ⇒ member, no company, no deal · the contact is then a member ⇒ a later convert never creates a second member (reused, or CONFLICT) · no idempotencyKey ⇒ VALIDATION",
      a.ok && !!a.v?.customerId && !a.v?.companyId && !a.v?.dealId && deals <= (again.ok ? 1 : 0) && cos === 0 && custs.length === 1 && isValidation(nokey),
      "member only · 1 member · key required", `${a.err} ids=${cut(j(a.v), 100)} deals=${deals} links=${cos} again=${again.err || "ok"} members=${custs.length} nokey=${nokey.err || "accepted"}`, "MAJOR");
  }
  {
    const ROLL = `ย้อนสร้าง${rand}`;
    let cr: Res;
    try {
      await mkTrigger(TRIG, "OutboxEvent", `NEW.type = 'crm.contact.created'`);
      cr = await call(fns.create, cA, actor, { firstName: ROLL, phone: phoneOf() });
    } finally {
      await dropTriggers();
    }
    const left = await P.crmContact.count({ where: { tenantId: tidA, firstName: ROLL } });
    const before = await ctRow(c1);
    const pB0 = await partyRow(before?.partyId);
    let up: Res;
    try {
      await mkTrigger(TRIG, "OutboxEvent", `NEW."idempotencyKey" LIKE 'crm.contact.updated#${c1}#%'`);
      up = await call(fns.update, cA, actor, c1, { firstName: `${ROLL}ใหม่`, email: mailOf("rollback") });
    } finally {
      await dropTriggers();
    }
    const after = await ctRow(c1);
    const pA0 = await partyRow(after?.partyId);
    chk("C1.4-S9.12", "events are INSIDE the write transaction: a failing crm.contact.created ⇒ no contact row · a failing crm.contact.updated ⇒ contact AND Party (name/e-mail) untouched",
      !cr.ok && cr.code !== "MISSING_FUNCTION" && left === 0 && !up.ok && up.code !== "MISSING_FUNCTION" && after?.firstName === before?.firstName && after?.email === before?.email && pA0?.email === pB0?.email && pA0?.name === pB0?.name,
      "both rolled back", `create=${cr.ok ? "succeeded" : "failed"} rows=${left} update=${up.ok ? "succeeded" : "failed"} name ${before?.firstName}→${after?.firstName} partyMail ${pB0?.email}→${pA0?.email}`);
  }
  {
    const vp = phoneOf();
    const r = await call(SVC?.createContact, { tenantId: tidA, systemId: crmA }, { name: `ฟอร์มเว็บ รุ่นเก่า ${rand}`, phone: vp, email: mailOf("v1"), company: "ร้านเก่า", source: "ฟอร์มเว็บ", ownerUserId: null });
    const row = await ctRow(String(r.v?.id ?? ""));
    const ev = row ? await evOf("crm.contact.created", row.id) : [];
    chk("C1.4-S9.13", "v1 facade `createContact(ctx, {name, phone, email, company, source, ownerUserId})` (forms + AI tool crm_create_lead) still returns {id} of a live contact of that system: name split into first/last, partyId set, crm.contact.created emitted",
      r.ok && typeof r.v?.id === "string" && row?.systemId === crmA && row?.firstName === "ฟอร์มเว็บ" && !!row?.lastName && !!row?.partyId && ev.length === 1,
      "{id} · v2 row", `${r.err} row=${cut(j(row ? { f: row.firstName, l: row.lastName, p: !!row.partyId } : null), 100)} events=${ev.length}`);
  }
  chk("C1.4-S9.14", "importContacts is an async job (returned a jobId whose status/result was read through getImportJob)", sawJobId, "jobId", `sawJobId=${sawJobId}`, "MINOR");
  {
    const pa = phoneOf();
    const pb = phoneOf();
    const ma = await call(MEM?.createMember, mA, actor, { firstName: `สมาชิกก ${rand}`, phone: pa, source: "WALK_IN" });
    const mb = await call(MEM?.createMember, mA, actor, { firstName: `สมาชิกข ${rand}`, phone: pb, source: "WALK_IN" });
    const ka = await fx(cA, { firstName: `สองสมาชิก ก ${rand}`, phone: phoneOf() });
    const kb = await fx(cA, { firstName: `สองสมาชิก ข ${rand}`, phone: phoneOf() });
    await P.crmContact.update({ where: { id: ka }, data: { memberCustomerId: ma.v?.customerId ?? null } });
    await P.crmContact.update({ where: { id: kb }, data: { memberCustomerId: mb.v?.customerId ?? null } });
    const snap = j([await ctRow(ka), await ctRow(kb)]);
    const r = await call(fns.merge, cA, actor, { keepId: ka, mergeId: kb, confirm: true, reason: "ลองรวมสองสมาชิก" });
    chk("C1.4-S9.15", "§11.1: two contacts linked to DIFFERENT members are not merged automatically ⇒ refused (Thai, points to member merge) · both rows unchanged",
      ma.ok && mb.ok && isRefused(r) && thai(r.msg) && j([await ctRow(ka), await ctRow(kb)]) === snap, "refused", `${ma.err}${mb.err} merge=${r.err || "accepted"}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X1 — scope: other tenant · OTHER CRM system · convert targets · ctx re-resolved
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X1 · scope ──");
  const idA2 = await rawContact(tidA, crmA2, `${FOREIGN_NAME} ระบบสอง`, { email: mailOf("foreign-a2") });
  const idB = await rawContact(tidB, crmB, `${FOREIGN_NAME} ร้านบี`, { email: mailOf("foreign-b") });
  const snapF = async () => j([await ctRow(idA2), await ctRow(idB)]);
  const snapF0 = await snapF();
  chk("C1.4-X1.0", "[positive control] the foreign contacts exist (crmA2 of tenant A · crmB of tenant B)", !!(await ctRow(idA2)) && !!(await ctRow(idB)), "2 rows", `${idA2} ${idB}`, "MAJOR");
  {
    const a = await call(fns.get360, cA, actor, idA2);
    const b = await call(fns.get360, cA, actor, idB);
    chk("C1.4-X1.1", "getContact360 of another CRM system's / another shop's contact ⇒ NOT_FOUND and the error never echoes their data",
      isNotFound(a) && isNotFound(b) && !a.msg.includes(FOREIGN_NAME) && !b.msg.includes(FOREIGN_NAME), "404 ×2", `${a.err || "returned"} | ${b.err || "returned"}`);
  }
  {
    const u1 = await call(fns.update, cA, actor, idA2, { jobTitle: "ข้ามระบบ" });
    const u2 = await call(fns.update, cA, actor, idB, { jobTitle: "ข้ามร้าน" });
    const a1 = await call(fns.assign, cA, actor, idA2, { userId: userSales });
    const s1 = await call(fns.setLeadStatus, cA, actor, idB, "QUALIFIED");
    const o1 = await call(fns.setOptOut, cA, actor, idA2, { optOut: true });
    const t1 = await call(fns.setTags, cA, actor, idB, ["x"]);
    const ar = await call(fns.archive, cA, actor, idA2, { confirm: true, reason: "ข้ามระบบนะ" });
    chk("C1.4-X1.2", "update / assign / setLeadStatus / setOptOut / setTags / archive on a foreign contact ⇒ NOT_FOUND each · both rows untouched",
      [u1, u2, a1, s1, o1, t1, ar].every(isNotFound) && (await snapF()) === snapF0, "404 ×7", [u1, u2, a1, s1, o1, t1, ar].map((r) => r.code || "ok").join(","));
  }
  {
    const all = await lst({});
    const q1 = await lst({ q: FOREIGN_NAME });
    chk("C1.4-X1.3", "listContacts (with and without a search for the foreign name) never returns another system's or another shop's contact",
      all.r.ok && !all.ids.includes(idA2) && !all.ids.includes(idB) && q1.r.ok && q1.ids.length === 0, "none", `${all.r.err}${q1.r.err} all=${all.ids.length} q=${q1.ids.length}`);
  }
  {
    const m1 = await call(fns.merge, cA, actor, { keepId: kK, mergeId: idA2, confirm: true, reason: "ข้ามระบบนะ" });
    const m2 = await call(fns.merge, cA, actor, { keepId: idB, mergeId: kK, confirm: true, reason: "ข้ามร้านนะ" });
    chk("C1.4-X1.4", "mergeContacts checks BOTH ids: a foreign merge id or keep id ⇒ NOT_FOUND · nothing merged",
      isNotFound(m1) && isNotFound(m2) && (await snapF()) === snapF0 && !(await ctRow(kK))?.mergedIntoId, "404 ×2", `${m1.err || "ok"} | ${m2.err || "ok"}`);
  }
  {
    const s1 = await call(fns.csSet, cA, actor, idA2, { channel: "EMAIL", granted: true, source: "STAFF" });
    const c1x = await call(fns.csCur, cA, actor, idB);
    const h1 = await call(fns.csHist, cA, actor, idB);
    chk("C1.4-X1.5", "consents.set / current / history on a foreign contact ⇒ NOT_FOUND · no consent row written",
      isNotFound(s1) && isNotFound(c1x) && isNotFound(h1) && (await consentRows(idA2)).length === 0, "404 ×3", `${s1.code || "ok"},${c1x.code || "ok"},${h1.code || "ok"}`);
  }
  {
    const r1x = await create({ tenantId: tidA, systemId: crmB, actorUserId: userA }, { firstName: `ctx ร้านอื่น ${rand}`, phone: phoneOf() });
    const r2x = await create({ tenantId: tidA, systemId: memA, actorUserId: userA }, { firstName: `ctx ระบบสมาชิก ${rand}`, phone: phoneOf() });
    const left = await P.crmContact.count({ where: { OR: [{ firstName: `ctx ร้านอื่น ${rand}` }, { firstName: `ctx ระบบสมาชิก ${rand}` }] } });
    chk("C1.4-X1.6", "ctx.systemId is re-resolved against the tenant (type CRM): another shop's CRM system or a MEMBER system in ctx ⇒ refused (NOT_FOUND/VALIDATION), no row written",
      isScopeRefusal(r1x) && isScopeRefusal(r2x) && left === 0, "refused ×2", `${r1x.err || "accepted"} | ${r2x.err || "accepted"} rows=${left}`);
  }
  {
    const coA2 = await fxCompany(cA2, `บริษัทระบบสอง ${rand}`);
    const cases: [string, Any][] = [
      ["member system of another shop", { member: { systemId: memB } }],
      ["a CRM system as member system", { member: { systemId: crmA2 } }],
      ["company of another CRM system", { company: { id: coA2 } }],
      ["pipeline of another CRM system", { deal: { pipelineId: pA2.id, title: "ข้ามระบบ" } }],
      ["pipeline of another shop", { deal: { pipelineId: pB.id, title: "ข้ามร้าน" } }],
      ["stage of another pipeline", { deal: { pipelineId: pA.id, stageId: (pA2.stages as Any[])[0].id, title: "ขั้นผิด" } }],
    ];
    const out: string[] = [];
    let allOk = true;
    for (const [label, part] of cases) {
      const k = await fx(cA, { firstName: `แปลงข้าม ${label} ${rand}`, phone: phoneOf() });
      const before = j(await ctRow(k));
      const key = `${TAG}-x1-${out.length}`;
      const r = await call(fns.convert, cA, actor, k, { idempotencyKey: key, ...part });
      const s = await convSet(k, key);
      const custB = await P.customer.count({ where: { memberSystemId: { in: [memB, crmA2] } } });
      const ok = isScopeRefusal(r) && s.customers === 0 && s.deals === 0 && s.converted === 0 && custB === 0 && (await P.crmCompanyContact.count({ where: { contactId: k } })) === 0 && j(await ctRow(k)) === before;
      allOk &&= ok;
      out.push(`${label}:${ok ? "refused" : r.err || "ACCEPTED"}`);
    }
    chk("C1.4-X1.7", "convert into another shop's member system · a CRM system posing as member system · another CRM system's company · another system's / shop's pipeline · a stage of another pipeline ⇒ NOT_FOUND/VALIDATION each, nothing created, contact unchanged",
      allOk, "refused ×6", cut(out.join(" · "), 400));
  }
  {
    const r = await call(fns.convert, cA, actor, idA2, { idempotencyKey: `${TAG}-x1-foreign`, member: { systemId: memA } });
    const rb = await call(fns.bulkAssign, cA, actor, { ids: [idA2, idB], userId: userSales, confirm: true, reason: "ข้ามระบบนะ" });
    chk("C1.4-X1.8", "convertContact of a foreign contact ⇒ NOT_FOUND · bulkAssign containing foreign ids ⇒ refused (NOT_FOUND/VALIDATION) and no foreign row touched",
      isNotFound(r) && isScopeRefusal(rb) && (await snapF()) === snapF0, "refused", `${r.err || "ok"} | ${rb.err || "ok"}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X3 — races: convert idempotency (in-process + 4 processes) · two users ⇒ CONFLICT · lock order · duplicate create · opt-out
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X3 · races ──");
  const runWorkers = async (mode: string, contactId: string, args: string[]): Promise<{ outs: Any[]; spawned: boolean }> => {
    const startAt = Date.now() + 45_000;
    const outs = await Promise.all(
      args.map(
        (arg) =>
          new Promise<string>((resolve) => {
            const ch = spawn("pnpm", ["exec", "tsx", THIS_FILE, "--x3-worker", mode, tidA, crmA, userA, contactId, String(startAt), arg], { env: process.env });
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
      return m ? (JSON.parse(m[1]) as Any[]) : ["NO-OUTPUT"];
    });
    return { outs: parsed, spawned: !parsed.includes("NO-OUTPUT") };
  };
  const idsOf = (v: Any) => `${v?.customerId ?? "-"}|${v?.companyId ?? "-"}|${v?.dealId ?? "-"}`;
  {
    const rounds: string[] = [];
    let ok = true;
    for (let round = 0; round < 2; round += 1) {
      const k = await fx(cA, { firstName: `แปลงรัว ${round} ${rand}`, phone: phoneOf(), email: mailOf(`rush${round}`) });
      const key = `${TAG}-rush-${round}`;
      const res = await Promise.all(Array.from({ length: 10 }, () => call(fns.convert, cA, actor, k, convInput(key))));
      const s = await convSet(k, key);
      const ids = new Set(res.filter((r) => r.ok).map((r) => idsOf(r.v)));
      const good = res.every((r) => r.ok) && ids.size === 1 && s.customers === 1 && s.companies === 1 && s.deals === 1 && s.converted === 1;
      ok &&= good;
      rounds.push(`r${round + 1}: ok=${res.filter((r) => r.ok).length} ids=${ids.size} ${j(s)} ${res.find((r) => !r.ok)?.err ?? ""}`);
    }
    chk("C1.4-X3.1", "double-click: 10 parallel convertContact with the SAME idempotencyKey ⇒ every call answers the SAME ids and exactly ONE member · ONE company · ONE deal · ONE converted event (2 rounds)",
      ok, "1 set ×2", cut(rounds.join(" · "), 400));
  }
  {
    const k = await fx(cA, { firstName: `แปลงหลายโปรเซส ${rand}`, phone: phoneOf(), email: mailOf("procs") });
    const key = `${TAG}-procs`;
    const arg = Buffer.from(JSON.stringify(convInput(key)), "utf8").toString("base64url");
    const w = await runWorkers("convert", k, [arg, arg, arg, arg]);
    const s = await convSet(k, key);
    const ids = new Set(w.outs.filter((o) => o?.ok).map((o) => idsOf(o)));
    chk("C1.4-X3.2a", "[positive control] the 4 worker PROCESSES really ran and answered (12 convert calls) — if red, X3.2 proves nothing",
      w.spawned && w.outs.length === 12, "12", `${w.outs.length} ${cut(j(w.outs.filter((o) => !o?.ok).slice(0, 2)), 200)}`, "MAJOR");
    chk("C1.4-X3.2", "the same idempotencyKey from 4 SEPARATE PROCESSES (own PrismaClients, synchronised start) ⇒ all 12 answer the same ids · one member / company / deal / event (an in-process mutex would pass X3.1 and fail here)",
      w.outs.length === 12 && w.outs.every((o) => o?.ok) && ids.size === 1 && s.customers === 1 && s.companies === 1 && s.deals === 1 && s.converted === 1,
      "1 set", `ok=${w.outs.filter((o) => o?.ok).length} ids=${ids.size} ${j(s)}`);
  }
  {
    const rounds: string[] = [];
    let ok = true;
    let msgOk = true;
    for (const n of [2, 10]) {
      const k = await fx(cA, { firstName: `สองคนแปลง ${n} ${rand}`, phone: phoneOf(), email: mailOf(`two${n}`) });
      const res = await Promise.all(Array.from({ length: n }, (_x, i) => call(fns.convert, cA, i % 2 === 0 ? actor : actor2, k,
        convInput(`${TAG}-two-${n}-${i}`, { company: { new: { name: `บริษัทสองคน ${n} ${rand}` } } }))));
      const oks = res.filter((r) => r.ok);
      const conf = res.filter((r) => !r.ok && r.code === "CONFLICT");
      const custs = (await customersOf(k)).length;
      const cos = await P.crmCompany.count({ where: { tenantId: tidA, name: `บริษัทสองคน ${n} ${rand}` } });
      const deals = await P.crmDeal.count({ where: { contactId: k } });
      const good = oks.length === 1 && conf.length === n - 1 && custs === 1 && cos === 1 && deals === 1;
      msgOk &&= conf.every((r) => thai(r.msg) && !/คุณทำผิด|ผิดพลาดของคุณ/.test(r.msg));
      ok &&= good;
      rounds.push(`${n}: ok=${oks.length} conflict=${conf.length} members=${custs} companies=${cos} deals=${deals} ${res.find((r) => !r.ok && r.code !== "CONFLICT")?.err ?? ""}`);
    }
    chk("C1.4-X3.3", "two users converting the same contact at once (different keys) ⇒ exactly ONE succeeds, the other gets `.code === \"CONFLICT\"` with a calm Thai message · one member / company / deal (rounds of 2 and 10 callers)",
      ok && msgOk, "1 ok · n-1 CONFLICT", cut(rounds.join(" · "), 400));
  }
  {
    // lock order: companies.setPrimary (CrmCompany → CrmContact) in parallel with updateContact({companyId}) from other processes
    const coX = await fxCompany(cA, `บริษัทล็อก X ${rand}`);
    const coY = await fxCompany(cA, `บริษัทล็อก Y ${rand}`);
    const kL = await fx(cA, { firstName: `ล็อก ${rand}`, phone: phoneOf() });
    await linkCompany(coX, kL);
    await linkCompany(coY, kL);
    const w = await runWorkers("lock", kL, [`primary|${coX},${coY}`, `update|${coX},${coY}`, `primary|${coY},${coX}`, `update|${coY},${coX}`]);
    const flat = w.outs.map((o) => String(o));
    const dead = flat.filter((o) => /40P01|deadlock|P2034|write conflict/i.test(o));
    const row = await ctRow(kL);
    const prim = (await P.crmCompanyContact.findMany({ where: { contactId: kL, isPrimary: true, endedAt: null } })) as Any[];
    const perCo = await Promise.all([coX, coY].map((c) => P.crmCompanyContact.count({ where: { companyId: c, isPrimary: true, endedAt: null } })));
    chk("C1.4-X3.4a", "[positive control] the 4 lock-order worker processes ran (36 calls: setPrimary ∥ updateContact)", w.spawned && flat.length === 36, "36", `${flat.length}`, "MAJOR");
    chk("C1.4-X3.4", "setPrimary on the company ∥ updateContact(companyId) on the same contact across 4 PROCESSES ⇒ no deadlock (40P01 / P2034) · ≥ 30 of 36 calls OK · the contact's companyId cache names a company where it is the current primary",
      flat.length === 36 && dead.length === 0 && flat.filter((o) => o === "OK").length >= 30 && prim.some((p) => p.companyId === row?.companyId) && perCo.every((n) => n <= 1),
      "0 deadlocks · consistent", `deadlocks=${dead.length} ok=${flat.filter((o) => o === "OK").length} cache=${row?.companyId === coX ? "X" : row?.companyId === coY ? "Y" : row?.companyId} primaries=${prim.length} ${cut(flat.filter((o) => o !== "OK").slice(0, 3).join(" | "), 200)}`);
  }
  {
    const PH = phoneOf();
    const res = await Promise.all(Array.from({ length: 10 }, (_x, i) => create(cA, { firstName: `พร้อมกัน ${i} ${rand}`, phone: PH })));
    const n = await P.crmContact.count({ where: { systemId: crmA, phone: PH } });
    chk("C1.4-X3.5", "10 parallel createContact with the same phone ⇒ ONE contact; the other 9 answer duplicate (detection is race-safe — lock on the normalised phone)",
      n === 1 && res.filter((r) => r.ok && r.v?.created === true).length === 1, "1 row", `rows=${n} created=${res.filter((r) => r.ok && r.v?.created === true).length}`, "MAJOR");
  }
  {
    const k = await fx(cA, { firstName: `ถอนรัว ${rand}`, phone: phoneOf() });
    const n0 = (await consentRows(k)).length;
    const res = await Promise.all(Array.from({ length: 10 }, (_x, i) => call(fns.setOptOut, cA, actor, k, { optOut: i % 2 === 0, source: "STAFF" })));
    const rows = await consentRows(k);
    const row = await ctRow(k);
    const last = rows.at(-1);
    chk("C1.4-X3.6", "10 parallel setOptOut toggles ⇒ no lost consent row (rows appended ≥ number of state changes that returned ok) and marketingOptOut equals the state of the LAST appended row (column and history never disagree)",
      res.every((r) => r.ok) && rows.length > n0 && !!last && row?.marketingOptOut === (last.granted === false), "consistent", `rows ${n0}→${rows.length} optOut=${row?.marketingOptOut} lastGranted=${last?.granted}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X4 — the 5 consumers: twice · 5× in parallel ⇒ no extra effect
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X4 · redelivery ──");
  const tenantTables = ((await P.$queryRawUnsafe(
    `select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`,
  ).catch(() => [])) as Any[]).map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
  const IGNORE = new Set(["OutboxEvent", "OpsEvent", "AuditLog"]);
  const footprint = async () => {
    const parts: string[] = [];
    for (const t of tenantTables) {
      if (IGNORE.has(t)) continue;
      const rows = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tidA).catch(() => [{ n: 0 }])) as Any[];
      parts.push(`${t}=${rows?.[0]?.n ?? 0}`);
    }
    return parts.join(";");
  };
  {
    const ours = (await P.outboxEvent.findMany({ where: { tenantId: tidA, type: { in: EVTS } }, orderBy: { createdAt: "asc" } })) as Any[];
    const pick = EVTS.map((t) => ours.find((o) => o.type === t) ?? null);
    chk("C1.4-X4.0", "[positive control] this run produced an event of each of the 5 types", pick.every(Boolean), "5 types", EVTS.filter((_t, i) => !pick[i]).join(",") || "-", "MAJOR");
    for (let i = 0; i < EVTS.length; i += 1) {
      const ev = pick[i];
      const first = ev ? await consume(ev) : ({ ok: false, err: "no event" } as Res);
      const fp1 = await footprint();
      const again = ev ? [await consume(ev), ...(await Promise.all(Array.from({ length: 5 }, () => consume(ev))))] : [];
      const fp2 = await footprint();
      const diff = fp1.split(";").filter((x, n) => x !== fp2.split(";")[n]);
      chk(`C1.4-X4.${i + 1}`, `${EVTS[i]} consumer: delivered once, then again, then 5× in parallel ⇒ every delivery resolves and no tenant table changes after the first delivery (idempotent — flag first, then act)`,
        !!ev && first.ok && again.every((r) => r.ok) && diff.length === 0, "0 extra rows", `${first.err}${again.find((r) => !r.ok)?.err ?? ""} diff=${cut(diff.join(" "), 160)}`, i === 0 ? "CRITICAL" : "MAJOR");
    }
  }
  {
    const types = ((await P.outboxEvent.findMany({ where: { tenantId: { in: TENANTS } }, select: { type: true }, distinct: ["type"] })) as Any[]).map((x) => x.type as string);
    const orphan = types.filter((t) => typeof CONS?.[t] !== "function");
    chk("C1.4-X4.6", "every event type emitted by this run has a consumer (no queue-stalling orphan — e.g. crm.deal.created is C1.5's and must not be emitted yet)",
      types.includes("crm.contact.created") && types.includes("crm.contact.converted") && orphan.length === 0, "0 orphans (contact events present)", `types=${types.length} orphans=${orphan.join(",") || "-"}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X6 — dangerous input: import caps · formulas · bad rows · tag/length caps · CSV export
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X6 · dangerous input ──");
  const MAXR = Number.isFinite(capOf("CONTACT_IMPORT_MAX_ROWS")) ? capOf("CONTACT_IMPORT_MAX_ROWS") : 50_000;
  {
    const big = Array.from({ length: MAXR + 1 }, (_x, i) => ({ "ชื่อจริง": `ล้น${rand}${i}` }));
    const t0 = Date.now();
    const r = await call(fns.imp, cA, actor, { rows: big, mapping: MAP, options: { onDuplicate: "skip" } });
    await sleep(500);
    const n = await P.crmContact.count({ where: { systemId: crmA, firstName: { startsWith: `ล้น${rand}` } } });
    chk("C1.4-X6.1", `import of ${MAXR + 1} rows (cap + 1) ⇒ refused synchronously (VALIDATION, Thai) before any job/row — 0 contacts`,
      isValidation(r) && thai(r.msg) && n === 0, "refused · 0", `${r.err || "accepted"} rows=${n} ${Date.now() - t0}ms`);
  }
  {
    const chunk = "ก".repeat(350_000);
    const rows = Array.from({ length: 11 }, (_x, i) => ({ "ชื่อจริง": `ใหญ่${rand}${i}`, "นามสกุล": chunk }));
    const r = await call(fns.imp, cA, actor, { rows, mapping: MAP, options: { onDuplicate: "skip" } });
    const n = await P.crmContact.count({ where: { systemId: crmA, firstName: { startsWith: `ใหญ่${rand}` } } });
    chk("C1.4-X6.2", `import payload > 10 MB (${Math.round(Buffer.byteLength(JSON.stringify(rows)) / 1048576)} MB) ⇒ refused (VALIDATION) · 0 contacts`, isValidation(r) && n === 0, "refused", `${r.err || "accepted"} rows=${n}`);
  }
  const EVIL = ["=HYPERLINK(\"http://evil.test\",\"x\")", "+SUM(1;2)", "@cmd"];
  {
    const rows = [{ "ชื่อจริง": `${EVIL[0]}${rand}`, "นามสกุล": EVIL[1], "มือถือ": phoneOf(), "ตำแหน่ง": EVIL[2] }];
    const { r, res } = await runImport({ rows, mapping: MAP, options: { onDuplicate: "skip" } });
    const row = await P.crmContact.findFirst({ where: { systemId: crmA, firstName: { in: [`${EVIL[0]}${rand}`, `'${EVIL[0]}${rand}`] } } });
    const same = (a: Any, b: string) => a === b || a === `'${b}`;
    chk("C1.4-X6.3", "formula cells are imported as TEXT (stored verbatim — or with a leading ' — never evaluated, never dropped): =HYPERLINK · +SUM · @cmd",
      r.ok && res?.created === 1 && !!row && same(row.lastName, EVIL[1]) && same(row.jobTitle, EVIL[2]), "stored as text", `${r.err} res=${cut(j(res), 80)} row=${cut(j(row ? [row.firstName, row.lastName, row.jobTitle] : null), 120)}`);
  }
  {
    const rows = [
      { "ชื่อจริง": `ดีแถว ${rand}`, "มือถือ": phoneOf() },
      { "ชื่อจริง": `อีเมลเสีย ${rand}`, "อีเมล": "not-an-email" },
      { "ชื่อจริง": `เบอร์สั้น ${rand}`, "มือถือ": "12" },
      { "ชื่อจริง": "", "นามสกุล": "", "มือถือ": "", "อีเมล": "" },
      { "ชื่อจริง": "ย".repeat(201) },
    ];
    const { r, res } = await runImport({ rows, mapping: MAP, options: { onDuplicate: "skip" } });
    const good = await P.crmContact.count({ where: { systemId: crmA, firstName: `ดีแถว ${rand}` } });
    const bad = await P.crmContact.count({ where: { systemId: crmA, firstName: { in: [`อีเมลเสีย ${rand}`, `เบอร์สั้น ${rand}`, "ย".repeat(201)] } } });
    const errs = res?.errors ?? [];
    chk("C1.4-X6.4", "bad rows (bad e-mail · 2-digit phone · empty row · 201-char name) are REPORTED with their row numbers (Thai), never thrown — the good row is imported, the bad ones are not",
      r.ok && good === 1 && bad === 0 && errs.length >= 4 && errs.every((e) => Number.isFinite(Number(e?.row)) && thai(e?.message)), "1 ok · 4 reported", `${r.err} good=${good} bad=${bad} errors=${cut(j(errs), 200)}`);
  }
  {
    const TM = Number.isFinite(capOf("CONTACT_TAGS_MAX")) ? capOf("CONTACT_TAGS_MAX") : 20;
    const TL = Number.isFinite(capOf("CONTACT_TAG_MAX")) ? capOf("CONTACT_TAG_MAX") : 40;
    const NM = Number.isFinite(capOf("CONTACT_NAME_MAX")) ? capOf("CONTACT_NAME_MAX") : 200;
    const k = await fx(cA, { firstName: `แท็กเยอะ ${rand}`, phone: phoneOf() });
    const many = await call(fns.setTags, cA, actor, k, Array.from({ length: TM + 5 }, (_x, i) => `t${i}`));
    const long = await call(fns.setTags, cA, actor, k, ["ย".repeat(TL + 10)]);
    const row = await ctRow(k);
    const tagsOk = ((row?.tags ?? []) as string[]).length <= TM && ((row?.tags ?? []) as string[]).every((t) => t.length <= TL);
    const nm = await create(cA, { firstName: "ช".repeat(NM + 1), phone: phoneOf() });
    const jt = await call(fns.update, cA, actor, k, { jobTitle: "ต".repeat(5_000) });
    const row2 = await ctRow(k);
    chk("C1.4-X6.5", "tags and lengths are capped: > CONTACT_TAGS_MAX tags / a tag > CONTACT_TAG_MAX chars ⇒ refused or trimmed (stored tags always within caps) · firstName > CONTACT_NAME_MAX ⇒ VALIDATION · a 5,000-char jobTitle never stored",
      (isValidation(many) || many.ok) && (isValidation(long) || long.ok) && tagsOk && isValidation(nm) && String(row2?.jobTitle ?? "").length <= 500,
      "capped", `many=${many.err || "ok"} long=${long.err || "ok"} tags=${((row?.tags ?? []) as string[]).length} name=${nm.err || "accepted"} job=${String(row2?.jobTitle ?? "").length}`, "MAJOR");
  }
  let exportText = "";
  {
    const csvLib = (await import("@/lib/core/csv")) as Any;
    await fx(cA, { firstName: `=cmd|' /C calc'!A0 ${rand}`, phone: phoneOf() });
    const ex = await call(fns.exp, cA, actor, { confirm: true, reason: "ส่งออกไปทำรายงาน" });
    exportText = typeof ex.v === "string" ? ex.v : String(ex.v?.csv ?? ex.v?.text ?? "");
    const table = csvLib.parseCsv(exportText) as { headers: string[]; rows: string[][] };
    const cells = [...(table.headers ?? []), ...(table.rows ?? []).flat()];
    const dangerous = cells.filter((c) => /^[\t\r\n ]*[=+\-@]/.test(c) && !/^-?\d+(\.\d+)?$/.test(c));
    chk("C1.4-X6.6", "exportContacts CSV: NO cell starts with = + - @ (neutralised by csvRow) — the imported =HYPERLINK / +SUM / @cmd and a `=cmd|' /C calc'!A0` name come out as '…",
      ex.ok && exportText.length > 0 && dangerous.length === 0 && cells.includes(`'=cmd|' /C calc'!A0 ${rand}`), "0 dangerous", `${ex.err} dangerous=${cut(dangerous.join(" | "), 160)}`);
    chk("C1.4-X6.7", "the export is scoped to the ctx system: no contact of another CRM system / another shop appears, own contacts do",
      ex.ok && !exportText.includes(FOREIGN_NAME) && exportText.includes(`กรอง ก ${rand}`), "own only", `${ex.err} foreign=${exportText.includes(FOREIGN_NAME)}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X8 — PDPA: ids-only payloads · console/OpsEvent clean · export D8 + access log · privacy-log filter
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X8 · PDPA ──");
  const kPii = kid((await watch("createContact X8 (PII)", () => create(cA, { firstName: SENT_FIRST, lastName: SENT_LAST, phone: SENT_PHONE, email: SENT_EMAIL, lineUserId: SENT_LINE }))).v);
  await watch("updateContact X8 (PII)", () => call(fns.update, cA, actor, kPii, { jobTitle: "ผู้จัดการ" }));
  {
    const ours = (await P.outboxEvent.findMany({ where: { tenantId: { in: TENANTS }, type: { in: EVTS } } })) as Any[];
    const sentinels = [SENT_PHONE, SENT_EMAIL, SENT_FIRST, SENT_LAST, SENT_LINE, SENT_PHONE.slice(1)];
    const offenders = ours.filter((o) => sentinels.some((s) => j(o.payload).includes(s))).map((o) => o.type);
    chk("C1.4-X8.0", "[positive control] a crm.contact.created event exists for the PII contact", ours.some((o) => o.type === "crm.contact.created" && o.payload?.contactId === kPii), "1", `events=${ours.length}`, "MAJOR");
    chk("C1.4-X8.1", "no crm.contact.* payload carries a phone (any form) / e-mail / first or last name / LINE id",
      ours.length > 0 && offenders.length === 0, "none", `events=${ours.length} offenders=${offenders.slice(0, 4).join(",")}`);
    const strings = (v: Any): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === "object" ? Object.values(v).flatMap(strings) : []);
    const prose = ours.flatMap((o) => strings(o.payload).filter((s) => /\s|[ก-๙@]/.test(s) || s.length > 64).map((s) => `${o.type}:${cut(s, 30)}`));
    chk("C1.4-X8.2", "payloads are ids/keys only: no string value with spaces, Thai text or '@' (catches any label/name/e-mail leak)",
      ours.length > 0 && prose.length === 0, "ids only", cut(prose.slice(0, 4).join(" | "), 200), "MAJOR");
  }
  {
    const offenders: string[] = [];
    for (const ev of EVIDENCE) {
      for (const o of ev.ops) if ([SENT_PHONE, SENT_EMAIL, SENT_FIRST].some((s) => j({ m: o.message, d: o.detail }).includes(s))) offenders.push(`${ev.label} → OpsEvent`);
      if (ev.logs.some((l) => [SENT_PHONE, SENT_EMAIL, SENT_FIRST].some((s) => l.includes(s)))) offenders.push(`${ev.label} → console`);
    }
    chk("C1.4-X8.3", "no OpsEvent and no console line produced by create/update/convert/merge contains the contact's phone, e-mail or name",
      !!fns.create && EVIDENCE.length > 0 && offenders.length === 0, "none", offenders.join(" · ") || (fns.create ? "-" : "service missing"));
  }
  {
    // sensitive values: a contact custom field (objectKey contact, sensitive section) + the linked member's sensitive field
    const kS = await fx(cA, { firstName: `ข้อมูลลับ ${rand}`, phone: phoneOf(), email: mailOf("sens") });
    await call(F?.setFieldValues, fctx, kS, { qcSecretNote: SENT_CONTACT_SECRET }, { via: "STAFF" });
    const mem = await call(MEM?.createMember, mA, actor, { firstName: `สมาชิกลับ ${rand}`, phone: phoneOf(), source: "WALK_IN" });
    const custId = String(mem.v?.customerId ?? NONE);
    await call(F?.setFieldValues, mA, custId, { qcAllergy: SENT_MEMBER_SECRET }, { via: "STAFF" });
    await P.crmContact.update({ where: { id: kS }, data: { memberCustomerId: mem.v?.customerId ?? null } });
    const t0 = new Date(Date.now() - 1000);
    const sx = await call(fns.exp, { ...cA, actorUserId: userSales }, sales, { q: `ข้อมูลลับ ${rand}`, confirm: true, reason: "ส่งออกไปทำรายงาน" });
    const sText = typeof sx.v === "string" ? sx.v : String(sx.v?.csv ?? "");
    const staffLogs = await P.memberAccessLog.count({ where: { tenantId: tidA, userId: userSales, createdAt: { gte: t0 } } });
    chk("C1.4-X8.4", "a STAFF export (default D8 policy: OWNER/MANAGER only) never contains the contact's sensitive custom value nor the linked member's sensitive value (refused export is fine) · no access-log row",
      (!sx.ok || (!sText.includes(SENT_CONTACT_SECRET) && !sText.includes(SENT_MEMBER_SECRET))) && staffLogs === 0 && (sx.ok || sx.code !== "MISSING_FUNCTION"),
      "no leak", `${sx.err || "ok"} contactSecret=${sText.includes(SENT_CONTACT_SECRET)} memberSecret=${sText.includes(SENT_MEMBER_SECRET)} logs=${staffLogs}`);
    const t1 = new Date(Date.now() - 1000);
    const ox = await call(fns.exp, cA, actor, { q: `ข้อมูลลับ ${rand}`, confirm: true, reason: "ส่งออกไปทำรายงาน" });
    const oText = typeof ox.v === "string" ? ox.v : String(ox.v?.csv ?? "");
    const logs = (await P.memberAccessLog.findMany({ where: { tenantId: tidA, userId: userA, createdAt: { gte: t1 } } })) as Any[];
    const shown = oText.includes(SENT_CONTACT_SECRET) || oText.includes(SENT_MEMBER_SECRET);
    chk("C1.4-X8.5", "OWNER export: whenever a sensitive value IS included, MemberAccessLog rows are written for it (page starting \"crm.\" for the contact value) — included without a log = leak",
      ox.ok && oText.includes(`ข้อมูลลับ ${rand}`) && (!shown || (logs.length > 0 && (!oText.includes(SENT_CONTACT_SECRET) || logs.some((l) => String(l.page ?? "").startsWith("crm."))))),
      "logged when shown", `${ox.err} shown=${shown} logs=${j(logs.map((l) => l.page))}`);
  }
  {
    const realCust = await P.customer.findFirst({ where: { tenantId: tidA, memberSystemId: memA } });
    const crmLog = await P.memberAccessLog.create({ data: { tenantId: tidA, customerId: c1, userId: userA, targetType: "FIELD", targetId: `${TAG}-crmfield`, page: "crm.contact" } });
    const memLog = realCust ? await P.memberAccessLog.create({ data: { tenantId: tidA, customerId: realCust.id, userId: userA, targetType: "FIELD", targetId: `${TAG}-memfield`, page: "member.360" } }) : null;
    const r = await call(PRIV?.listAccessLog, mA, actor, { take: 200 });
    const ids = itemsOf(r.v).map((x) => x?.id);
    chk("C1.4-X8.6", "C1.2a review debt S3: the member privacy log `listAccessLog` no longer lists CRM rows (page \"crm.*\" — shown as \"(สมาชิกที่ถูกลบ)\" before) but still lists member rows",
      r.ok && !!memLog && ids.includes(memLog.id) && !ids.includes(crmLog.id), "member only", `${r.err} member=${memLog ? ids.includes(memLog.id) : "no fixture"} crm=${ids.includes(crmLog.id)}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X9 — danger ops: merge / archive / bulkAssign / export need confirm + reason ≥ 5 · bulk ≤ 500 · audit
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X9 · danger ops ──");
  chk("C1.4-X9.1", "mergeContacts without confirm, or with a reason < 5 chars ⇒ refused (Thai) and NOTHING merged (checked before the real merge)",
    isRefused(mNoConfirm) && isRefused(mShort) && thai(mNoConfirm.msg) && !mStateAfterRefusals.m?.mergedIntoId && mStateAfterRefusals.deals === 2,
    "refused ×2", `${mNoConfirm.err || "accepted"} | ${mShort.err || "accepted"} merged=${mStateAfterRefusals.m?.mergedIntoId ?? "-"} deals=${mStateAfterRefusals.deals}`);
  const arcReason = "ลูกค้าขอให้ลบออกจากรายชื่อ";
  const arc = await fx(cA, { firstName: `เก็บถาวร ${rand}`, phone: phoneOf() });
  {
    const a1 = await call(fns.archive, cA, actor, arc, {});
    const a2 = await call(fns.archive, cA, actor, arc, { confirm: true, reason: "ลบ" });
    const a3 = await call(fns.archive, cA, actor, arc, { reason: arcReason });
    const live = !(await ctRow(arc))?.archivedAt;
    const ok = await call(fns.archive, cA, actor, arc, { confirm: true, reason: arcReason });
    const def = await lst({ q: `เก็บถาวร ${rand}` });
    const inc = await lst({ q: `เก็บถาวร ${rand}`, includeArchived: true });
    chk("C1.4-X9.2", "archiveContact without confirm / reason < 5 / reason without confirm ⇒ refused ×3 (still live) · with both ⇒ archivedAt set, row kept · hidden by default, shown with includeArchived",
      isRefused(a1) && isRefused(a2) && isRefused(a3) && live && ok.ok && !!(await ctRow(arc))?.archivedAt && !def.ids.includes(arc) && inc.ids.includes(arc),
      "refused ×3 · archived", `${a1.err || "ok"} | ${a2.err || "ok"} | ${a3.err || "ok"} | ${ok.err} default=${def.ids.includes(arc)} include=${inc.ids.includes(arc)}`);
  }
  const bulkReason = "โอนลูกค้าให้พนักงานเขตใต้";
  {
    const ids = await Promise.all([0, 1, 2].map((i) => fx(cA, { firstName: `โอนกลุ่ม ${i} ${rand}`, phone: phoneOf() })));
    const BM = Number.isFinite(capOf("CONTACT_BULK_MAX")) ? capOf("CONTACT_BULK_MAX") : 500;
    const b1 = await call(fns.bulkAssign, cA, actor, { ids, userId: userSales });
    const b2 = await call(fns.bulkAssign, cA, actor, { ids, userId: userSales, confirm: true, reason: "โอน" });
    const over = await call(fns.bulkAssign, cA, actor, { ids: [...ids, ...Array.from({ length: BM - 2 }, (_x, i) => `${TAG}-fake-${i}`)], userId: userSales, confirm: true, reason: bulkReason });
    const untouched = (await Promise.all(ids.map(ctRow))).every((r) => r?.ownerUserId !== userSales);
    const ok = await call(fns.bulkAssign, cA, actor, { ids, userId: userSales, confirm: true, reason: bulkReason });
    const rows = await Promise.all(ids.map(ctRow));
    const ev = (await Promise.all(ids.map((id) => evOf("crm.contact.assigned", id)))).map((x) => x.length);
    chk("C1.4-X9.3", `bulkAssign: no confirm / reason < 5 ⇒ refused · ${BM + 1} ids (cap + 1) ⇒ refused before any write · 3 ids with confirm + reason ⇒ all 3 reassigned + one crm.contact.assigned each`,
      isRefused(b1) && isRefused(b2) && isValidation(over) && untouched && ok.ok && rows.every((r) => r?.ownerUserId === userSales) && ev.every((n) => n >= 1),
      "refused ×3 · 3 assigned", `${b1.err || "ok"} | ${b2.err || "ok"} | over=${over.err || "accepted"} untouched=${untouched} ok=${ok.err || "ok"} events=${ev.join(",")}`);
  }
  {
    const e1 = await call(fns.exp, cA, actor, {});
    const e2 = await call(fns.exp, cA, actor, { confirm: true, reason: "ดู" });
    chk("C1.4-X9.4", "exportContacts without confirm / with a reason < 5 ⇒ refused and no CSV returned", isRefused(e1) && isRefused(e2), "refused ×2", `${e1.err || "returned"} | ${e2.err || "returned"}`, "MAJOR");
  }
  {
    const auditOf = async (targetId: string) => (await P.auditLog.findMany({ where: { tenantId: tidA, targetId } })) as Any[];
    const kept = (rows: Any[], reason: string) => rows.some((x) => j({ b: x.before, a: x.after }).includes(reason));
    const aC1 = await auditOf(c1);
    const aArc = await auditOf(arc);
    const aMerge = [...(await auditOf(kK)), ...(await auditOf(kM))];
    const aCv = await auditOf(cv1);
    const all = (await P.auditLog.findMany({ where: { tenantId: tidA } })) as Any[];
    const expAudit = all.filter((x) => /export/i.test(String(x.action)) && j({ b: x.before, a: x.after }).includes("ส่งออกไปทำรายงาน"));
    const bulkAudit = all.filter((x) => j({ b: x.before, a: x.after }).includes(bulkReason));
    chk("C1.4-X9.5", "AuditLog rows with the actor: create + updates + assign of c1 (≥ 4) · convert · archive keeps its reason · merge keeps its reason · bulkAssign keeps its reason · export keeps its reason",
      aC1.length >= 4 && aCv.length >= 1 && kept(aArc, arcReason) && kept(aMerge, mergeReason) && bulkAudit.length >= 1 && expAudit.length >= 1 && aC1.every((x) => x.actorId === userA),
      "audit rows", `c1=${aC1.length} convert=${aCv.length} archive=${kept(aArc, arcReason)} merge=${kept(aMerge, mergeReason)} bulk=${bulkAudit.length} export=${expAudit.length}`, "MAJOR");
  }
} catch (e) {
  chk("C1.4-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — triggers first, then every row of the two throwaway tenants (4 passes), systems/units/tenants, users.
  // No drainOutbox (not tenant-scoped) — our PENDING events go with the tenant sweep.
  // ═════════════════════════════════════════════════════════════════════════════
  await dropTriggers();
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
      const trig = ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname IN ('${TRIG}', '${TRIG_DEAL}')`).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0;
      chk("C1.4-CLEAN", "the oracle gives the QC database back exactly as found — the two throwaway tenants, every row they owned, the throwaway users and the test triggers are gone",
        left.length === 0 && tenants === 0 && users === 0 && Number(trig) === 0, "0 rows · 0 tenants · 0 users · 0 triggers", `${left.join(" · ") || "-"} · tenants=${tenants} users=${users} trig=${trig}`, "MAJOR");
    } catch (e) {
      chk("C1.4-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C1.4: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
