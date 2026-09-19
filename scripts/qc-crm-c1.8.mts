// QC — CRM v2 WO C1.8: events (phase-C1 set) · consumers · bridges — `src/lib/platform/crm-bridges/` (R-D folder: index · core ·
//      forms · chat) · `src/lib/platform/crm-outbound.ts` · crm entries of `src/lib/outbox-consumers.ts` · label registries ·
//      `src/lib/member-bridges.ts#onCrmDealWon` (payload change only) · `src/lib/modules/forms/service.ts` (direct createContact removed)
// Oracle writer · the C1.8 builder must NOT touch this file · QC database only (.env.qc)
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c1.8.mts
//      (`--force-run` = run every check even while crm-bridges is absent — bridge checks red, positive controls + CLEAN green;
//       proves fixtures and cleanup)
// requires: crm-seed   (house style — this oracle reads NO seeded row; everything lives in throwaway tenants `qc-c18-<rand>-*`)
//
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE (not re-implemented here): qc-member-m2.8 · qc-member-fix-s2 · qc-member-m3.7
//   (onCrmDealWon keeps working from ids: DEAL_WON row, member source CRM, legacy key `crm.deal.won#<dealId>` once per deal, v2 key
//   `crm.deal.won#<dealId>#<histId>`) · qc-form · qc-forms-notify (lead now arrives through the consumer — see question Q2) ·
//   qc-chat-member-autolink · qc-chat-core-v2 · qc-automation · qc-webhook · qc-account-api-webhooks · qc-kanban-k3.3 ·
//   qc-approval-wiring · qc-crm · qc-crm-activity · qc-crm-c0.2 … qc-crm-c1.7 (every earlier CRM oracle) · qc-member-m1.9 (30/15/10/5 —
//   nothing here touches the seeded tenants).
//
// SOURCES: crm-brief-C1.8.md · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-A account.contact.merged/created · R-C.8 keys ·
//   R-C.9 S1 = phase-C1 events only · R-D crm-bridges FOLDER · R-E.3 resolveFormCrmSystem · R-E.14 uiVersion 1 ⇒ bridges skip ·
//   R-E.17 X8 scope) · CRM-RUN §2 "C1.8" (S1–S7 = 28) · MASTER-PLAN §2 §4 (X1 X3 X4 X8) §5 §6 row C1.8 · blueprint §7.1 §7.2 §9 ·
//   decisions C11 C12 C23 · C1.2b ruling 7 (uiVersion gate of the custom.record.created consumer) · C1.4 debt (briefFor needs an actor ·
//   member.merged re-points memberCustomerId) · C1.5 ruling 1 (crm.deal.won payload cleanup is C1.8's) · C1.7 addendum 7 (reassign
//   approval effect = C3.2).
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this) ══════════════════════════════════
//   FILES  src/lib/platform/crm-bridges/{index,core,forms,chat}.ts (R-D; index re-exports) · src/lib/platform/crm-outbound.ts (in-app
//          notification placeholder only — imports no e-mail / LINE / push transport) · crm blocks `// CRM C1.8 ▸ … ◂` in
//          outbox-consumers.ts + the label registries · emit sites in crm services · member-bridges.ts#onCrmDealWon · forms/service.ts
//   import { resolveFormCrmSystem } from "@/lib/platform/crm-bridges"
//     resolveFormCrmSystem(form: { id: string; tenantId: string }) → Promise<string | null>  — THE one place the forms bridge picks a
//     CRM system (C2.6 swaps it): the form's own CRM-system setting when that column exists (C2.0) else the FIRST CRM system of the
//     form's tenant (createdAt asc — R-E.3) · never a system of another tenant · tenant without CRM ⇒ null
//   forms/service.ts: no import of "@/lib/modules/crm", no createContact call; still emits `forms.submission.received` in the same tx
//     (payload ids only: { formId, submissionId }) · the CONSUMER writes FormSubmission.crmContactId
//   Every inbound bridge below is a CRM "extra" under `compose` (extra throws ⇒ WARN OpsEvent, event NOT failed, base result intact;
//     base throws ⇒ the extra still ran) · honours `settings.crm.bridgesEnabled` (false ⇒ no-op) and `settings.crm.uiVersion`
//     (R-E.14: only uiVersion 2 systems — EXCEPT the two legacy paths: the v1 form lead and the member bridge onCrmDealWon) ·
//     events whose ids belong to another tenant are ignored (X1) · flag first under an advisory lock, then write (X4/H5)
//   consumer `forms.submission.received` (form.crmEnabled, system = resolveFormCrmSystem(form)):
//     uiVersion 2 ⇒ match a live contact of that system by e-mail (case-insensitive) or phone; none ⇒ create a LEAD through the
//       contacts service (sourceKind WEB_FORM, v1 `source` "FORM", sourceDetail { formId, submissionId, utm? } — utm from answers keys
//       utm_source/utm_medium/utm_campaign/utm_term/utm_content ⇒ sourceDetail.utm.{source,medium,campaign,term,content}) ·
//       then exactly ONE CrmActivity per submission on that contact · FormSubmission.crmContactId := contact.id ·
//       member-linked contact ⇒ ONE MemberActivity row (member facade recordOnce; crmContactId set)
//     uiVersion 1 ⇒ v1 behaviour kept: one contact per submission (name/phone/email, source "FORM") + crmContactId (question Q1)
//   consumer `chat.message.received` extra: conversation (same tenant) → ChatContact → Party (ChatContact.partyId, else
//     party.safeFindOrCreate from phone/email and write ChatContact.partyId) → target CRM system (tenant's CRM system; C2.4 refines) ·
//     a contact with that partyId exists ⇒ nothing new · none and settings.crm.chatToLead === true ⇒ ONE LEAD (sourceKind CHAT,
//     partyId) · chatToLead false ⇒ nothing · never one CrmActivity per message
//   consumer `account.quotation.responded` { documentId, accepted }: OPEN deals of the tenant with quotationDocId = documentId ⇒
//     move to pipeline.stageOnQuoteAcceptedId / stageOnQuoteRejectedId (unset ⇒ no move) through the deals service (history row +
//     crm.deal.stage.changed) — once per (document, answer)
//   consumer `account.document.issued` { documentId }: document (account facade, same tenant) whose sourceDocId = a deal's
//     quotationDocId ⇒ deal.invoiceDocId := documentId
//   consumer `account.contact.merged` { keepId, mergedId }: CrmCompany.accountContactId mergedId → keepId (tenant-scoped) ·
//     `account.contact.created` ⇒ no-op (R-A)
//   consumer `member.created` { customerId, partyId }: live contacts of the tenant's uiVersion-2 CRM systems with that partyId and
//     memberCustomerId null ⇒ memberCustomerId := customerId (an existing link is never overwritten)
//   consumer `member.merged` { keepId, mergedId }: contacts with memberCustomerId = mergedId ⇒ keepId (C1.4 debt) — so
//     consents.canContact reads the SURVIVING member's MemberConsent
//   `approval.request.approved|rejected` entityType `crm.discount` ⇒ deals.applyDiscountDecision as a compose EXTRA (runs even when
//     the notification step throws; its own failure = WARN) · `crm.reassign` ⇒ resolves (effect = C3.2, C1.7 addendum 7)
//   CRM events (uiVersion 2) `crm.deal.created` · `crm.deal.stage.changed` · `crm.activity.logged` (+ the other §7.1 rows marked
//     MemberActivity) ⇒ ONE MemberActivity row PER EVENT for a member-linked contact (crmContactId, dealId) through member recordOnce ·
//     contact without member ⇒ nothing, no throw · `custom.record.created` consumer skips uiVersion-1 systems (C1.2b ruling 7)
//   `crm.deal.won` payload ids only: { dealId, contactId, companyId?, partyId?, valueSatang, ownerUserId? } — no name/phone/e-mail/
//     title · keys unchanged: legacy `crm.deal.won#<dealId>` (once per deal) · v2 `crm.deal.won#<dealId>#<histId>` · onCrmDealWon
//     loads everything it needs by id
//   contacts.briefFor(ctx, actor, key) — actor REQUIRED (C1.4 debt); no actor ⇒ null / refused
//   registries: every phase-C1 event type has a consumer and is declared exactly ONCE across AUTOMATION_EVENTS / WEBHOOK_EVENTS
//
// WHAT THIS FILE PROVES: S0 structure (static) · S1 the 21 phase-C1 event types (13 groups: emitted by their services in this run,
//   systemId, key `<type>#<id>#<seq>`, ids-only payload, consumer, declared once) · S2 forms (4) · S3 chat (3) · S4 quotation (2) ·
//   S5 deal.won → member (2) · S6 MemberActivity per event (3) · S7 drain until quiet (1) · S8 brief/debt extras · X1 · X3 · X4 (every
//   consumer: twice in sequence + twice-or-more in parallel as the FIRST delivery + footprint after the first; compose both
//   directions) · X8 payload/OpsEvent scan. X2 n/a (no op/tool) · X5 n/a (no cron job) · X6 n/a (no new input surface) · X7 n/a
//   (public form endpoint unchanged) · X9 n/a (no new danger op) · X10 n/a (no files/secrets).
// HOUSE RULES: SKIP guard (no DB before it) · throwaway tenants `qc-c18-<rand>-*` swept in `finally` · every event consumed here is
//   either a real row of our tenants or a synthetic event with our tag · one drainAll at the end (S7, COMMON "drain before
//   cleanup") · test triggers scoped to the lab tenant, dropped in `finally` (stale ones dropped at start) · outbound fetch stubbed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BR_DIR = "src/lib/platform/crm-bridges";
const BR_FILE = "src/lib/platform/crm-bridges.ts";
const OUT_FILE = "src/lib/platform/crm-outbound.ts";
const FORMS_SVC = "src/lib/modules/forms/service.ts";
const CONS_FILE = "src/lib/outbox-consumers.ts";
const BR_SPEC = "@/lib/platform/crm-bridges";

const ARGV = process.argv.slice(2);
const FORCE = ARGV.includes("--force-run");

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guard — nothing of C1.8 exists yet ⇒ SKIPPED, no DB connection opened.
// ═══════════════════════════════════════════════════════════════════════════════════
if (!existsSync(BR_DIR) && !existsSync(BR_FILE) && !FORCE) {
  console.log(`⚠️  SKIPPED — WO C1.8 not built yet (${BR_DIR}/ missing)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c18-${rand}`;
// outbound HTTP never leaves the box (webhooks / notifications of our throwaway tenants have no target anyway)
const FETCHES: string[] = [];
globalThis.fetch = (async (input: Any): Promise<Response> => {
  FETCHES.push(typeof input === "string" ? input : String(input?.url ?? input));
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
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
const strings = (v: Any): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === "object" ? Object.values(v).flatMap(strings) : []);
const keysDeep = (v: Any): string[] =>
  Array.isArray(v) ? v.flatMap(keysDeep) : v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => [k, ...keysDeep(x)]) : [];

// ─────────────────────────── state ───────────────────────────
const TRIG = `qc_c18_${rand}`;
const NONE = `${TAG}-none`;
let seq = 0;
const nx = () => `${++seq}`;
let phoneSeq = 0;
const phoneOf = (): string => `08${String((Math.floor(Math.random() * 9_000_000) + 1_000_000) * 10 + (phoneSeq++ % 10)).padStart(8, "0").slice(-8)}`;
const mailOf = (s: string) => `${TAG}-${s}@qc-crm.example`;
/** every personal value this run writes — none may travel in a crm.* payload or an OpsEvent (X8) */
const PII: string[] = [];
const pii = <T extends string>(s: T): T => { PII.push(s); return s; };
const TENANTS: string[] = [];
const USERS: string[] = [];
const TRIG_TABLES = new Set<string>();

const dropTriggers = async () => {
  for (const t of TRIG_TABLES) await P.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRIG}_${t.toLowerCase()} ON "${t}"`).catch(() => 0);
  TRIG_TABLES.clear();
  await P.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${TRIG}_fn() CASCADE`).catch(() => 0);
};
/** every INSERT (or UPDATE) of `table` for the LAB tenant raises — proves the compose contract without touching product code */
const failWrites = async (labTenant: string, table: string, op: "INSERT" | "UPDATE" | "INSERT OR UPDATE" = "INSERT") => {
  await P.$executeRawUnsafe(
    `CREATE OR REPLACE FUNCTION ${TRIG}_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."tenantId" = '${labTenant}' THEN RAISE EXCEPTION 'qc-c18 forced failure'; END IF; RETURN NEW; END $$`,
  );
  await P.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRIG}_${table.toLowerCase()} ON "${table}"`).catch(() => 0);
  await P.$executeRawUnsafe(`CREATE TRIGGER ${TRIG}_${table.toLowerCase()} BEFORE ${op} ON "${table}" FOR EACH ROW EXECUTE FUNCTION ${TRIG}_fn()`);
  TRIG_TABLES.add(table);
};

console.log(`\n═══ QC CRM v2 · C1.8 — events · consumers · bridges ═══`);
console.log(`[env] DB ${host} · tag ${TAG}${FORCE && !existsSync(BR_DIR) ? " · --force-run with crm-bridges ABSENT (bridge checks below are expected red; positive controls + CLEAN green)" : ""}\n`);

try {
  {
    // stale triggers of a killed earlier run (only our own naming pattern)
    const stale = (await P.$queryRawUnsafe(
      `SELECT t.tgname, c.relname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE t.tgname LIKE 'qc_c18_%'`,
    ).catch(() => [])) as Any[];
    for (const s of stale) {
      const n = String(s.tgname);
      const rel = String(s.relname);
      if (/^qc_c18_[a-z]+_[a-z]+$/.test(n) && /^[A-Za-z]+$/.test(rel)) await P.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${n} ON "${rel}"`).catch(() => 0);
    }
    const fns = (await P.$queryRawUnsafe(`SELECT proname FROM pg_proc WHERE proname LIKE 'qc_c18_%_fn'`).catch(() => [])) as Any[];
    for (const f of fns) if (/^qc_c18_[a-z]+_fn$/.test(String(f.proname))) await P.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${f.proname}() CASCADE`).catch(() => 0);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — structure (static)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S0 · structure ──");
  let brErr = "";
  const BR = (await import(BR_SPEC as string).catch((e: Any) => { brErr = e instanceof Error ? e.message : String(e); return {}; })) as Any;
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => ({}))) as Any;
  const SVC = (await import("@/lib/modules/crm/service" as string).catch(() => ({}))) as Any;
  const TEAMS = (await import("@/lib/core/teams" as string).catch(() => ({}))) as Any;
  const FM = (await import("@/lib/modules/forms/service" as string).catch(() => ({}))) as Any;
  const OBX = (await import("@/lib/outbox-consumers" as string)) as Any;
  const CONS: Any = OBX.consumers;
  const CT = CRM.contacts ?? {};
  const CO = CRM.companies ?? {};
  const D = CRM.deals ?? {};
  const AC = CRM.activities ?? {};
  const OBJ = CRM.objects ?? {};
  const brSrc = walk(BR_DIR).map(read).join("\n") + read(BR_FILE);
  const formsSrc = read(FORMS_SVC);
  const consSrc = read(CONS_FILE);
  const outSrc = read(OUT_FILE);
  {
    const files = ["index.ts", "core.ts", "forms.ts", "chat.ts"].filter((f) => !existsSync(join(BR_DIR, f)));
    chk("C1.8-S0.1", "R-D: `src/lib/platform/crm-bridges/` is a FOLDER with index.ts · core.ts · forms.ts · chat.ts and `@/lib/platform/crm-bridges` loads",
      existsSync(BR_DIR) && files.length === 0 && !brErr, "4 files · loads", `dir=${existsSync(BR_DIR)} missing=${files.join(",") || "-"} ${cut(brErr, 120)}`, "MAJOR");
  }
  chk("C1.8-S0.2", "`resolveFormCrmSystem` is exported by the bridges index (the ONE resolver C2.6 swaps) and defined in forms.ts",
    typeof BR?.resolveFormCrmSystem === "function" && /resolveFormCrmSystem/.test(read(join(BR_DIR, "forms.ts"))), "exported", `type=${typeof BR?.resolveFormCrmSystem}`);
  chk("C1.8-S0.3", "forms/service.ts no longer calls CRM directly: no import from \"@/lib/modules/crm\" and no createContact( — it still emits forms.submission.received in a transaction [static]",
    formsSrc.length > 0 && !/@\/lib\/modules\/crm/.test(formsSrc) && !/\bcreateContact\s*\(/.test(formsSrc) && /forms\.submission\.received/.test(formsSrc) && /emitOutbox\s*\(/.test(formsSrc),
    "no crm import · emit kept", `crmImport=${/@\/lib\/modules\/crm/.test(formsSrc)} createContact=${/\bcreateContact\s*\(/.test(formsSrc)}`);
  chk("C1.8-S0.4", "crm-outbound.ts exists as the in-app placeholder: no e-mail / LINE / push transport import (core/email · chat send · push) [static]",
    outSrc.length > 0 && !/@\/lib\/(core\/email|modules\/chat|push|core\/push|platform\/push)/.test(outSrc) && !/\bsendEmail\b|\bsendLine\b|\bsendPush\b/.test(outSrc),
    "exists · in-app only", outSrc ? cut(outSrc.match(/from\s+["'][^"']+["']/g)?.join(" ") ?? "-") : "missing", "MINOR");
  {
    const deep = (brSrc.match(/["']@\/lib\/modules\/[a-z-]+\/[^"']+["']/g) ?? []).filter((s) => !/-shared["']$/.test(s));
    const rawMember = /(prisma|tx|db)\.(memberActivity|customer)\.(create|update|upsert|updateMany|createMany)\b/.test(brSrc);
    chk("C1.8-S0.5", "bridges reach other modules through their facades only (no deep `@/lib/modules/<m>/<file>` import except *-shared) and never write MemberActivity / Customer with prisma (member facade recordOnce only) [static]",
      brSrc.length > 0 && deep.length === 0 && !rawMember, "facades", `deep=${cut(deep.join(" "), 160) || "-"} rawMemberWrite=${rawMember}`, "MAJOR");
  }
  chk("C1.8-S0.6", "implementation sites are marked `// AUDIT-CLASS X1` / `X3` / `X4` / `X8` in crm-bridges [static]",
    ["X1", "X3", "X4", "X8"].every((x) => new RegExp(`AUDIT-CLASS ${x}\\b`).test(brSrc)), "4 markers",
    ["X1", "X3", "X4", "X8"].filter((x) => !new RegExp(`AUDIT-CLASS ${x}\\b`).test(brSrc)).join(",") || "-", "MINOR");
  chk("C1.8-S0.7", "outbox-consumers.ts wires the bridges inside a `// CRM C1.8 ▸ … ◂` block and loads them with a dynamic import (import cycle — same reason as kanbanBridge) [static]",
    /CRM C1\.8 ▸/.test(consSrc) && /import\(\s*["']@\/lib\/platform\/crm-bridges["']\s*\)/.test(consSrc), "block + dynamic import",
    `block=${/CRM C1\.8 ▸/.test(consSrc)} dyn=${/import\(\s*["']@\/lib\/platform\/crm-bridges["']\s*\)/.test(consSrc)}`, "MINOR");

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — tB is created FIRST (its CRM system is the oldest ⇒ a "first CRM system" bug lands there) ·
  //   tA main (2 CRM systems, member, account) · tC chat · tV1 uiVersion 1 · tOff bridgesEnabled false · tL compose lab
  // ═════════════════════════════════════════════════════════════════════════════
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const mkUser = async (suffix: string) => {
    const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix || "owner"} ${TAG}` } });
    USERS.push(u.id);
    return u.id as string;
  };
  const userA = await mkUser("");
  const userMgr = await mkUser("-mgr");
  const mkTenant = async (suffix: string) => {
    const t = await P.tenant.create({ data: { name: `${TAG}-${suffix}`, slug: `${TAG}-${suffix}` } });
    TENANTS.push(t.id);
    await P.membership.create({ data: { userId: userA, tenantId: t.id, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    await P.membership.create({ data: { userId: userMgr, tenantId: t.id, role: "MANAGER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    return t.id as string;
  };
  const mk = async (tid: string, type: string, label: string) => (await sysSvc.createSystem(tid, type, `${label} ${TAG}`)).id as string;
  /** throwaway systems only: merge keys into settings.crm with one jsonb statement */
  const setCrm = (sysId: string, obj: Record<string, unknown>) =>
    P.$executeRawUnsafe(
      `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
        (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
      JSON.stringify(obj), sysId);

  const tidB = await mkTenant("b");
  const crmB = await mk(tidB, "CRM", "CRM-B");
  await new Promise((r) => setTimeout(r, 30));
  const tidA = await mkTenant("a");
  const crmA = await mk(tidA, "CRM", "CRM");
  await new Promise((r) => setTimeout(r, 30));
  const crmA2 = await mk(tidA, "CRM", "CRM สอง");
  const memA = await mk(tidA, "MEMBER", "สมาชิก");
  const accA = await mk(tidA, "ACCOUNT", "บัญชี");
  const memB = await mk(tidB, "MEMBER", "สมาชิก-B");
  const chatB = await mk(tidB, "CHAT", "แชท-B");
  const accB = await mk(tidB, "ACCOUNT", "บัญชี-B");
  const tidC = await mkTenant("c");
  const crmC = await mk(tidC, "CRM", "CRM-C");
  const chatC = await mk(tidC, "CHAT", "แชท-C");
  const tidV = await mkTenant("v1");
  const crmV = await mk(tidV, "CRM", "CRM-V1");
  const memV = await mk(tidV, "MEMBER", "สมาชิก-V1");
  const chatV = await mk(tidV, "CHAT", "แชท-V1");
  const accV = await mk(tidV, "ACCOUNT", "บัญชี-V1");
  const tidO = await mkTenant("off");
  const crmO = await mk(tidO, "CRM", "CRM-OFF");
  const memO = await mk(tidO, "MEMBER", "สมาชิก-OFF");
  const chatO = await mk(tidO, "CHAT", "แชท-OFF");
  const accO = await mk(tidO, "ACCOUNT", "บัญชี-OFF");
  const tidL = await mkTenant("lab");
  const crmL = await mk(tidL, "CRM", "CRM-LAB");
  const accL = await mk(tidL, "ACCOUNT", "บัญชี-LAB");
  await setCrm(crmA, { uiVersion: 2, bridgesEnabled: true, chatToLead: true });
  await setCrm(crmA2, { uiVersion: 2, bridgesEnabled: true, chatToLead: true });
  await setCrm(crmB, { uiVersion: 2, bridgesEnabled: true, chatToLead: true });
  await setCrm(crmC, { uiVersion: 2, bridgesEnabled: true, chatToLead: true });
  await setCrm(crmV, { uiVersion: 1, bridgesEnabled: true, chatToLead: true });
  await setCrm(crmO, { uiVersion: 2, bridgesEnabled: false, chatToLead: true });
  await setCrm(crmL, { uiVersion: 2, bridgesEnabled: true, chatToLead: true });
  const owner = { userId: userA, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> };
  const cA = { tenantId: tidA, systemId: crmA, actorUserId: userA };
  const cB = { tenantId: tidB, systemId: crmB, actorUserId: userA };
  const cV = { tenantId: tidV, systemId: crmV, actorUserId: userA };
  const cO = { tenantId: tidO, systemId: crmO, actorUserId: userA };
  const cL = { tenantId: tidL, systemId: crmL, actorUserId: userA };

  type StDef = { name: string; kind: string; probability: number };
  const STD: StDef[] = [
    { name: "ผู้สนใจใหม่", kind: "OPEN", probability: 10 }, { name: "ต่อรอง", kind: "OPEN", probability: 40 }, { name: "ตอบรับใบเสนอราคา", kind: "OPEN", probability: 80 },
    { name: "ชนะ", kind: "WON", probability: 100 }, { name: "แพ้", kind: "LOST", probability: 0 },
  ];
  const mkPipe = async (tid: string, sys: string, name: string, quote?: { acc: number; rej: number }) => {
    const p = (await P.crmPipeline.create({
      data: { tenantId: tid, systemId: sys, name: `${name} ${TAG}`, stages: { create: STD.map((s, i) => ({ tenantId: tid, systemId: sys, sortOrder: i, ...s })) } },
      include: { stages: true },
    })) as Any;
    const st = [...(p.stages as Any[])].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.id as string);
    if (quote) await P.crmPipeline.update({ where: { id: p.id }, data: { stageOnQuoteAcceptedId: st[quote.acc], stageOnQuoteRejectedId: st[quote.rej] } });
    return { id: p.id as string, st };
  };
  const mkParty = async (tid: string, name: string, kind: string, extra: Record<string, Any> = {}) =>
    (await P.party.create({ data: { tenantId: tid, name, kind, ...extra } })).id as string;
  const rawContact = async (tid: string, sys: string, name: string, extra: Record<string, Any> = {}) => {
    const phone = (extra.phone as string | undefined) ?? phoneOf();
    pii(name); pii(phone);
    if (typeof extra.email === "string") pii(extra.email);
    const partyId = (extra.partyId as string | undefined) ?? (await mkParty(tid, name, "PERSON", { phone }));
    return (await P.crmContact.create({ data: { tenantId: tid, systemId: sys, name, firstName: name, phone, ...extra, partyId } })).id as string;
  };
  const mkCustomer = async (tid: string, memSys: string, name: string, extra: Record<string, Any> = {}) =>
    (await P.customer.create({ data: { tenantId: tid, memberSystemId: memSys, name: pii(name), memberCode: `${TAG}-m${nx()}`, ...extra } })).id as string;
  const lr = async (tid: string, sys: string) => (await P.crmLostReason.create({ data: { tenantId: tid, systemId: sys, key: `price-${nx()}-${rand}`, label: "ราคาสูงไป" } })).id as string;
  const idOf = (v: Any): string => {
    const x = typeof v === "string" ? v : (v?.contact?.id ?? v?.company?.id ?? v?.deal?.id ?? v?.id ?? "");
    return typeof x === "string" && x ? x : NONE;
  };
  /** deal fixture: through deals.createDeal (history row + crm.deal.created) — raw row when the service refuses (fixture only) */
  const fxDeal = async (c: Any, contactId: string, pipe: { id: string; st: string[] }, extra: Record<string, Any> = {}, stageIdx = 0) => {
    const title = pii(`ดีลลับ ${nx()} ${rand}`);
    const r = await call(D.createDeal, c, owner, { pipelineId: pipe.id, stageId: pipe.st[stageIdx], title, contactId, valueSatang: 100_000 });
    let id = idOf(r.v);
    if (id === NONE || !(await P.crmDeal.findFirst({ where: { id } }))) {
      id = (await P.crmDeal.create({ data: { tenantId: c.tenantId, systemId: c.systemId, contactId, pipelineId: pipe.id, stageId: pipe.st[stageIdx], title, valueSatang: 100_000 } })).id;
    }
    if (Object.keys(extra).length) await P.crmDeal.update({ where: { id }, data: extra });
    return id as string;
  };
  const mkDoc = async (tid: string, sys: string, docType: string, extra: Record<string, Any> = {}) =>
    (await P.accountDocument.create({ data: { tenantId: tid, systemId: sys, docType, docNo: `${TAG}-${docType}-${nx()}`, status: docType === "QUOTATION" ? "AWAITING_ACCEPT" : "AWAITING_PAYMENT", ...extra } })).id as string;
  const FORM_FIELDS = [
    { key: "name", label: "ชื่อ", type: "text", required: true },
    { key: "email", label: "อีเมล", type: "email", required: false },
    { key: "phone", label: "เบอร์", type: "phone", required: false },
    { key: "utm_source", label: "utm_source", type: "text", required: false },
    { key: "utm_medium", label: "utm_medium", type: "text", required: false },
    { key: "utm_campaign", label: "utm_campaign", type: "text", required: false },
  ];
  const mkForm = async (tid: string, crmEnabled = true) =>
    (await P.formDef.create({ data: { tenantId: tid, name: `ฟอร์ม ${TAG}`, publicToken: `${TAG}-tok-${nx()}-${Math.random().toString(36).slice(2, 12)}`, crmEnabled, fieldsJson: FORM_FIELDS } })) as Any;
  const mkSub = async (tid: string, formId: string, answers: Record<string, string>) => {
    for (const k of ["name", "email", "phone"]) if (answers[k]) pii(answers[k]);
    return (await P.formSubmission.create({ data: { tenantId: tid, formId, answersJson: answers } })).id as string;
  };
  const evtOf = (row: Any) => ({ id: row.id, tenantId: row.tenantId, type: row.type, payload: row.payload, systemId: row.systemId, unitId: row.unitId });
  const synth = (tid: string, type: string, payload: Record<string, unknown>) => ({ id: `${TAG}-ev-${nx()}`, tenantId: tid, type, payload, systemId: null, unitId: null });
  const formEvt = (tid: string, formId: string, submissionId: string) => synth(tid, "forms.submission.received", { formId, submissionId });
  const consume = async (evt: Any) => call(CONS?.[evt?.type], evt);
  const par = (evt: Any, n = 4) => Promise.all(Array.from({ length: n }, () => consume(evt)));
  const rows = async (tids: string[], type: string) => (await P.outboxEvent.findMany({ where: { tenantId: { in: tids }, type }, orderBy: { createdAt: "asc" } })) as Any[];
  const contactsBy = (where: Record<string, Any>) => P.crmContact.findMany({ where }) as Promise<Any[]>;
  const actCount = (contactId: string) => P.crmActivity.count({ where: { contactId } }) as Promise<number>;
  const maCount = (where: Record<string, Any>) => P.memberActivity.count({ where }) as Promise<number>;
  const subRow = (id: string) => P.formSubmission.findFirst({ where: { id } }) as Promise<Any>;
  const dealRow = (id: string) => P.crmDeal.findFirst({ where: { id } }) as Promise<Any>;
  const tenantTables = ((await P.$queryRawUnsafe(
    `select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`,
  ).catch(() => [])) as Any[]).map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
  const IGNORE = new Set(["OutboxEvent", "OpsEvent", "AuditLog"]);
  const footprint = async (tid: string, extraIgnore: string[] = []) => {
    const parts: string[] = [];
    for (const t of tenantTables) {
      if (IGNORE.has(t) || extraIgnore.includes(t)) continue;
      const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid).catch(() => [{ n: 0 }])) as Any[];
      parts.push(`${t}=${r?.[0]?.n ?? 0}`);
    }
    return parts;
  };
  const fpDiff = (a: string[], b: string[]) => a.filter((x, i) => x !== b[i]);
  /** X4 sequence: first delivery · footprint · again twice in sequence + 3 in parallel · footprint ⇒ no tenant table changed */
  const redeliver = async (evt: Any, tid: string, extraIgnore: string[] = []) => {
    const first = await consume(evt);
    const fp1 = await footprint(tid, extraIgnore);
    const again = [await consume(evt), await consume(evt), ...(await par(evt, 3))];
    const fp2 = await footprint(tid, extraIgnore);
    const diff = fpDiff(fp1, fp2);
    return { ok: first.ok && again.every((r) => r.ok) && diff.length === 0, first, info: `${first.err}${again.find((r) => !r.ok)?.err ?? ""} diff=${cut(diff.join(" "), 160)}` };
  };
  const opsSince = async (tid: string, since: Date, level = "WARN") => (await P.opsEvent.findMany({ where: { tenantId: tid, level, createdAt: { gte: since } } })) as Any[];

  const pA = await mkPipe(tidA, crmA, "ขาย", { acc: 2, rej: 1 });
  const pAN = await mkPipe(tidA, crmA, "ไม่ตั้งขั้นตอบรับ");
  const pB = await mkPipe(tidB, crmB, "ขาย-B", { acc: 2, rej: 1 });
  const pV = await mkPipe(tidV, crmV, "ขาย-V1", { acc: 2, rej: 1 });
  const pO = await mkPipe(tidO, crmO, "ขาย-OFF", { acc: 2, rej: 1 });
  const pL = await mkPipe(tidL, crmL, "ขาย-LAB", { acc: 2, rej: 1 });
  const lrA = await lr(tidA, crmA);

  // ═════════════════════════════════════════════════════════════════════════════
  // FLOW A — drive every phase-C1 service of tA once (S1 evidence · X8 material)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── flow · phase-C1 services of tA ──");
  const SENT_FIRST = pii(`ลูกค้าลับ${rand}`);
  const SENT_LAST = pii(`นามสกุลลับ${rand}`);
  const SENT_PHONE = pii(phoneOf());
  const SENT_EMAIL = pii(mailOf("secret-buyer"));
  const SENT_NOTE = pii(`ลูกค้าขอราคาพิเศษ โทร ${SENT_PHONE} อีเมล ${SENT_EMAIL}`);
  const FLOW: Record<string, Res> = {};
  const co1 = await call(CO.createCompany, cA, owner, { name: pii(`บริษัทหนึ่ง ${rand}`) });
  FLOW.companyCreate = co1;
  FLOW.companyUpdate = await call(CO.updateCompany, cA, owner, idOf(co1.v), { website: "https://one.example", phone: pii(phoneOf()) });
  const co2 = await call(CO.createCompany, cA, owner, { name: pii(`บริษัทสอง ${rand}`) });
  FLOW.companyMerge = await call(CO.mergeCompanies, cA, owner, { keepId: idOf(co1.v), mergeId: idOf(co2.v), confirm: true, reason: "รวมบริษัทซ้ำ" });
  const k1r = await call(CT.createContact, cA, owner, { firstName: SENT_FIRST, lastName: SENT_LAST, phone: SENT_PHONE, email: SENT_EMAIL, ownerUserId: userA });
  FLOW.contactCreate = k1r;
  const k1 = idOf(k1r.v);
  FLOW.contactUpdate = await call(CT.updateContact, cA, owner, k1, { jobTitle: "ผู้จัดการฝ่ายขาย" });
  FLOW.contactAssign = await call(CT.assignContact, cA, owner, k1, { userId: userMgr });
  const k2r = await call(CT.createContact, cA, owner, { firstName: pii(`ซ้ำ${rand}`), phone: pii(phoneOf()), email: pii(mailOf("dup")) });
  FLOW.contactMerge = await call(CT.mergeContacts, cA, owner, { keepId: k1, mergeId: idOf(k2r.v), confirm: true, reason: "รวมผู้ติดต่อซ้ำ" });
  const k3r = await call(CT.createContact, cA, owner, { firstName: pii(`แปลง${rand}`), phone: pii(phoneOf()), email: pii(mailOf("convert")) });
  FLOW.contactConvert = await call(CT.convertContact, cA, owner, idOf(k3r.v), { idempotencyKey: `${TAG}-convert`, member: { systemId: memA } });
  const d1r = await call(D.createDeal, cA, owner, { pipelineId: pA.id, stageId: pA.st[0], title: pii(`ดีลลับของ ${SENT_FIRST}`), contactId: k1, valueSatang: 50_000 });
  FLOW.dealCreate = d1r;
  const d1 = idOf(d1r.v);
  FLOW.dealMove = await call(D.moveDeal, cA, owner, d1, { stageId: pA.st[1] });
  FLOW.dealWon = await call(D.moveDeal, cA, owner, d1, { stageId: pA.st[3] });
  FLOW.dealReopen = await call(D.reopenDeal, cA, owner, d1, { confirm: true, reason: "ลูกค้าขอเปิดใหม่", stageId: pA.st[0] });
  FLOW.dealLost = await call(D.moveDeal, cA, owner, d1, { stageId: pA.st[4], lostReasonId: lrA, lostNote: `โทรหา ${SENT_PHONE} ไม่ติด` });
  const d2r = await call(D.createDeal, cA, owner, { pipelineId: pAN.id, stageId: pAN.st[0], title: pii(`ดีลสอง ${rand}`), contactId: k1, valueSatang: 10_000 });
  FLOW.dealReassign = await call(D.reassignDeal, cA, owner, idOf(d2r.v), { ownerUserId: userMgr });
  FLOW.dealUpdate = await call(D.updateDeal, cA, owner, idOf(d2r.v), { title: pii(`ชื่อใหม่ของ ${SENT_FIRST}`) });
  const a1 = await call(AC.logActivity, cA, owner, { type: "CALL", title: pii(`โทรหา ${SENT_FIRST}`), body: SENT_NOTE, contactId: k1 });
  FLOW.activityLog = a1;
  FLOW.activityComplete = await call(AC.completeActivity, cA, owner, idOf(a1.v));
  FLOW.objectCreate = await call(OBJ.create, cA, owner, { key: "car", label: "รถ", labelPlural: "รถของลูกค้า", parentType: "CONTACT", titleFieldKey: "plate", showAsTab: true });
  const rec1 = await call(OBJ.records?.create, cA, owner, "car", { parentId: k1, title: pii(`ทะเบียนรถของ ${SENT_FIRST}`) });
  FLOW.recordCreate = rec1;
  FLOW.recordUpdate = await call(OBJ.records?.update, cA, owner, "car", idOf(rec1.v), { title: pii(`ทะเบียนใหม่ ${rand}`) });
  FLOW.recordArchive = await call(OBJ.records?.archive, cA, owner, "car", idOf(rec1.v));
  const tm = await call(TEAMS.createTeam, { tenantId: tidA, actorUserId: userA }, { name: `ทีมขาย ${rand}` });
  FLOW.teamCreate = tm;
  FLOW.teamUpdate = await call(TEAMS.updateTeam, { tenantId: tidA, actorUserId: userA }, idOf(tm.v), { name: `ทีมขายใหม่ ${rand}` });
  FLOW.teamMember = await call(TEAMS.addMember, { tenantId: tidA, actorUserId: userA }, idOf(tm.v), { userId: userMgr });
  {
    const bad = Object.entries(FLOW).filter(([, r]) => !r.ok).map(([k, r]) => `${k}:${cut(r.err, 90)}`);
    chk("C1.8-S1.0", "[positive control] every phase-C1 service call of the flow succeeded (contacts · companies · deals · activities · objects · teams)",
      bad.length === 0, "all ok", bad.join(" · ") || "-", "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 — crm.deal.won → member (source CRM) · ids-only payload · both keys
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S5 · deal.won → member ──");
  const LEGACY_WON_KEYS = new Set<string>();
  {
    const kW = await rawContact(tidA, crmA, pii(`ผู้ชนะ${rand}`), { email: pii(mailOf("winner")) });
    const dW = await fxDeal(cA, kW, pA);
    const mv = await call(D.moveDeal, cA, owner, dW, { stageId: pA.st[3] });
    const hist = (await P.crmDealStageHistory.findFirst({ where: { dealId: dW, toStageId: pA.st[3] }, orderBy: { enteredAt: "desc" } })) as Any;
    const ev = (await rows([tidA], "crm.deal.won")).filter((r) => r.payload?.dealId === dW);
    const res = ev[0] ? await consume(evtOf(ev[0])) : ({ ok: false, err: "no event" } as Res);
    const k = (await P.crmContact.findFirst({ where: { id: kW } })) as Any;
    const cust = k?.memberCustomerId ? ((await P.customer.findFirst({ where: { id: k.memberCustomerId } })) as Any) : null;
    const won = cust ? await maCount({ customerId: cust.id, type: "DEAL_WON", refId: dW }) : 0;
    const p = ev[0]?.payload ?? {};
    const idsOnly = !["name", "phone", "email", "title"].some((x) => x in p) && !PII.some((s) => j(p).includes(s));
    chk("C1.8-S5.1", "v2 moveDeal → WON: ONE crm.deal.won with key `crm.deal.won#<dealId>#<histId>` and an ids-only payload (dealId/contactId/valueSatang … — no name/phone/e-mail/title) · consumed ⇒ member created with source CRM (sourceDetail.crmContactId), contact.memberCustomerId linked, ONE DEAL_WON row",
      mv.ok && ev.length === 1 && ev[0].idempotencyKey === `crm.deal.won#${dW}#${hist?.id}` && p.dealId === dW && p.contactId === kW && idsOnly && res.ok &&
        cust?.source === "CRM" && cust?.sourceDetail?.crmContactId === kW && won === 1,
      "ids-only · member CRM · 1 row", `${mv.err} events=${ev.length} key=${ev[0]?.idempotencyKey ?? "-"} keys=${Object.keys(p).join(",")} idsOnly=${idsOnly} ${res.err} src=${cust?.source ?? "-"} won=${won}`);
  }
  {
    const cL0 = await mkCustomer(tidA, memA, `สมาชิกเดิม${rand}`);
    const kL = await rawContact(tidA, crmA, pii(`ผู้ชนะเก่า${rand}`), { email: pii(mailOf("legacy-winner")), memberCustomerId: cL0 });
    const dL = await fxDeal(cA, kL, pA);
    const mv1 = await call(SVC.moveDeal, { tenantId: tidA, systemId: crmA }, dL, pA.st[3]);
    const ev = (await rows([tidA], "crm.deal.won")).filter((r) => r.payload?.dealId === dL);
    for (const r of ev) LEGACY_WON_KEYS.add(r.idempotencyKey);
    const res = ev[0] ? await consume(evtOf(ev[0])) : ({ ok: false, err: "no event" } as Res);
    const p = ev[0]?.payload ?? {};
    const idsOnly = !["name", "phone", "email", "title"].some((x) => x in p) && !PII.some((s) => j(p).includes(s));
    const custs = await P.customer.count({ where: { tenantId: tidA, sourceDetail: { path: ["crmContactId"], equals: kL } } });
    const won = await maCount({ customerId: cL0, type: "DEAL_WON", refId: dL });
    chk("C1.8-S5.2", "legacy path (crm/service.moveDeal) → WON keeps the once-per-deal key `crm.deal.won#<dealId>` with the SAME ids-only payload · consumed ⇒ the already-linked member gets ONE DEAL_WON row and no new member is created",
      mv1.ok && ev.length === 1 && ev[0].idempotencyKey === `crm.deal.won#${dL}` && idsOnly && res.ok && custs === 0 && won === 1,
      "legacy key · ids-only · 1 row", `${mv1.err} events=${ev.length} key=${ev[0]?.idempotencyKey ?? "-"} keys=${Object.keys(p).join(",")} ${res.err} newMembers=${custs} won=${won}`);
    // X4 — the member bridge on a fresh won event delivered 4× in parallel as the FIRST delivery
    const kP = await rawContact(tidA, crmA, pii(`ผู้ชนะพร้อมกัน${rand}`), { email: pii(mailOf("par-winner")) });
    const dP = await fxDeal(cA, kP, pA);
    await call(D.moveDeal, cA, owner, dP, { stageId: pA.st[3] });
    const evP = (await rows([tidA], "crm.deal.won")).filter((r) => r.payload?.dealId === dP);
    const resP = evP[0] ? await par(evtOf(evP[0]), 4) : [];
    const kPr = (await P.crmContact.findFirst({ where: { id: kP } })) as Any;
    const membersP = await P.customer.count({ where: { tenantId: tidA, sourceDetail: { path: ["crmContactId"], equals: kP } } });
    const wonP = kPr?.memberCustomerId ? await maCount({ customerId: kPr.memberCustomerId, type: "DEAL_WON", refId: dP }) : 0;
    chk("C1.8-X4.1", "crm.deal.won (member bridge, from ids) delivered 4× in parallel as the first delivery ⇒ ONE member · ONE DEAL_WON row · every delivery resolves",
      evP.length === 1 && resP.length === 4 && resP.every((r) => r.ok) && membersP === 1 && wonP === 1, "once", `events=${evP.length} ok=${resP.filter((r) => r.ok).length} members=${membersP} won=${wonP}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S6 — ONE MemberActivity row per CRM event (member-linked contact)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S6 · MemberActivity per event ──");
  const cM = await mkCustomer(tidA, memA, `สมาชิกไทม์ไลน์${rand}`);
  const kM = await rawContact(tidA, crmA, pii(`ไทม์ไลน์${rand}`), { email: pii(mailOf("timeline")), memberCustomerId: cM });
  const kNoMem = await rawContact(tidA, crmA, pii(`ไม่มีสมาชิก${rand}`));
  {
    const base = await maCount({ customerId: cM });
    const dM = await fxDeal(cA, kM, pAN);
    const ev = (await rows([tidA], "crm.deal.created")).filter((r) => r.payload?.dealId === dM);
    const x = ev[0] ? await redeliver(evtOf(ev[0]), tidA) : { ok: false, info: "no crm.deal.created event", first: { ok: false } as Res };
    const n = await maCount({ customerId: cM, dealId: dM });
    const all = await maCount({ customerId: cM });
    chk("C1.8-S6.1", "crm.deal.created of a member-linked contact ⇒ exactly ONE MemberActivity (customerId = contact.memberCustomerId · dealId · crmContactId) — redelivered twice in sequence + 3× in parallel: still one, no tenant table changes",
      ev.length === 1 && x.ok && n === 1 && all === base + 1, "1 row", `events=${ev.length} rows(deal)=${n} delta=${all - base} ${x.info}`);
    const baseS = await maCount({ customerId: cM });
    await call(D.moveDeal, cA, owner, dM, { stageId: pAN.st[1] });
    await call(D.moveDeal, cA, owner, dM, { stageId: pAN.st[2] });
    const evS = (await rows([tidA], "crm.deal.stage.changed")).filter((r) => r.payload?.dealId === dM);
    const rs: Res[] = [];
    for (const e of evS) { rs.push(await consume(evtOf(e))); rs.push(await consume(evtOf(e))); rs.push(...(await par(evtOf(e), 2))); }
    const afterS = await maCount({ customerId: cM });
    const withIds = await maCount({ customerId: cM, dealId: dM, crmContactId: kM });
    chk("C1.8-S6.2", "two stage moves ⇒ two crm.deal.stage.changed ⇒ exactly TWO new MemberActivity rows (one per event, dealId + crmContactId set), however often each is delivered",
      evS.length === 2 && rs.every((r) => r.ok) && afterS === baseS + 2 && withIds >= 3, "+2", `events=${evS.length} delta=${afterS - baseS} withIds=${withIds} ${rs.find((r) => !r.ok)?.err ?? ""}`);
    const baseL = await maCount({ customerId: cM });
    const la = await call(AC.logActivity, cA, owner, { type: "MEETING", title: pii(`นัดพบ ${rand}`), contactId: kM });
    const evL = (await rows([tidA], "crm.activity.logged")).filter((r) => r.payload?.activityId === idOf(la.v));
    const xl = evL[0] ? await redeliver(evtOf(evL[0]), tidA) : { ok: false, info: "no crm.activity.logged event" };
    const afterL = await maCount({ customerId: cM });
    const withC = await maCount({ customerId: cM, crmContactId: kM });
    const la2 = await call(AC.logActivity, cA, owner, { type: "CALL", title: pii(`โทร ${rand}`), contactId: kNoMem });
    const evN = (await rows([tidA], "crm.activity.logged")).filter((r) => r.payload?.activityId === idOf(la2.v));
    const rn = evN[0] ? await consume(evtOf(evN[0])) : ({ ok: false, err: "no event" } as Res);
    chk("C1.8-S6.3", "crm.activity.logged ⇒ ONE MemberActivity row with crmContactId for the member-linked contact (redelivery: still one) · a contact WITHOUT a member ⇒ no row and the consumer still resolves",
      la.ok && evL.length === 1 && xl.ok && afterL === baseL + 1 && withC >= 1 && la2.ok && evN.length === 1 && rn.ok,
      "+1 · no-member ok", `${la.err} events=${evL.length} delta=${afterL - baseL} ${xl.info} noMember=${rn.err || "ok"}`);
    // X4 — the timeline extra, 4× in parallel as the first delivery
    const dM2 = await fxDeal(cA, kM, pAN);
    const ev2 = (await rows([tidA], "crm.deal.created")).filter((r) => r.payload?.dealId === dM2);
    const r2 = ev2[0] ? await par(evtOf(ev2[0]), 4) : [];
    const n2 = await maCount({ customerId: cM, dealId: dM2 });
    chk("C1.8-X4.2", "timeline extra: a fresh crm.deal.created delivered 4× in parallel as the first delivery ⇒ ONE MemberActivity row (flag first — H5)",
      ev2.length === 1 && r2.length === 4 && r2.every((r) => r.ok) && n2 === 1, "1 row", `events=${ev2.length} ok=${r2.filter((r) => r.ok).length} rows=${n2}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — forms → lead (synthetic events of real FormSubmission rows; the end-to-end submit is S2.1 at the end)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2 · forms → lead ──");
  const fA = await mkForm(tidA);
  const fB = await mkForm(tidB);
  {
    const email = pii(mailOf("utm-lead"));
    const s = await mkSub(tidA, fA.id, { name: pii(`ลีดยูทีเอ็ม${rand}`), email, phone: pii(phoneOf()), utm_source: "facebook", utm_medium: "cpc", utm_campaign: `camp-${rand}` });
    const r = await consume(formEvt(tidA, fA.id, s));
    const ks = await contactsBy({ tenantId: tidA, email });
    const k = ks[0] ?? null;
    const sd = (k?.sourceDetail ?? {}) as Any;
    const utm = sd.utm ?? { source: sd.utm_source, medium: sd.utm_medium, campaign: sd.utm_campaign };
    const sub = await subRow(s);
    chk("C1.8-S2.2", "a submission carrying utm_source/utm_medium/utm_campaign ⇒ ONE LEAD in the resolved system (crmA) with sourceKind WEB_FORM · sourceDetail { formId, submissionId, utm{source,medium,campaign} } · FormSubmission.crmContactId = that contact (written by the consumer)",
      r.ok && ks.length === 1 && k?.systemId === crmA && k?.sourceKind === "WEB_FORM" && k?.lifecycleStage === "LEAD" && sd.formId === fA.id && sd.submissionId === s &&
        utm?.source === "facebook" && utm?.medium === "cpc" && utm?.campaign === `camp-${rand}` && sub?.crmContactId === k?.id,
      "lead + utm + crmContactId", `${r.err} contacts=${ks.length} sys=${k?.systemId === crmA ? "crmA" : k?.systemId} kind=${k?.sourceKind} sd=${cut(j(sd), 140)} sub.crm=${sub?.crmContactId ?? "-"}`);
  }
  {
    const email = pii(mailOf("exists"));
    const kE = await rawContact(tidA, crmA, pii(`มีอยู่แล้ว${rand}`), { email });
    const before = await P.crmContact.count({ where: { tenantId: tidA } });
    const a0 = await actCount(kE);
    const s = await mkSub(tidA, fA.id, { name: pii(`ชื่ออื่น${rand}`), email: email.toUpperCase() });
    const r = await consume(formEvt(tidA, fA.id, s));
    const after = await P.crmContact.count({ where: { tenantId: tidA } });
    const sub = await subRow(s);
    chk("C1.8-S2.3", "a submission whose e-mail (case-insensitive) matches a live contact of that system ⇒ NO new contact · ONE new CrmActivity on the existing contact · crmContactId = existing contact",
      r.ok && after === before && (await actCount(kE)) === a0 + 1 && sub?.crmContactId === kE, "reuse + 1 activity", `${r.err} contacts ${before}→${after} activities ${a0}→${await actCount(kE)} sub.crm=${sub?.crmContactId === kE ? "kE" : sub?.crmContactId}`);
  }
  {
    const fO = await mkForm(tidO);
    const email = pii(mailOf("off-form"));
    const s = await mkSub(tidO, fO.id, { name: pii(`ปิดสะพาน${rand}`), email });
    const r = await consume(formEvt(tidO, fO.id, s));
    const n = await P.crmContact.count({ where: { tenantId: tidO } });
    const acts = await P.crmActivity.count({ where: { tenantId: tidO } });
    const sub = await subRow(s);
    chk("C1.8-S2.4", "settings.crm.bridgesEnabled = false on the resolved system ⇒ the forms consumer is a no-op: no contact, no activity, crmContactId stays null — and the event still resolves",
      r.ok && n === 0 && acts === 0 && sub?.crmContactId === null, "no-op", `${r.err} contacts=${n} activities=${acts} sub.crm=${sub?.crmContactId}`);
  }
  // X4 forms
  {
    const email = pii(mailOf("x4-seq"));
    const s = await mkSub(tidA, fA.id, { name: pii(`ซ้ำลำดับ${rand}`), email });
    const x = await redeliver(formEvt(tidA, fA.id, s), tidA);
    const ks = await contactsBy({ tenantId: tidA, email });
    const acts = ks[0] ? await actCount(ks[0].id) : 0;
    chk("C1.8-X4.3", "forms consumer: same event delivered, then twice in sequence + 3× in parallel ⇒ ONE lead · ONE activity · crmContactId set · no tenant table changes after the first delivery",
      x.ok && ks.length === 1 && acts === 1 && (await subRow(s))?.crmContactId === ks[0]?.id, "once", `${x.info} contacts=${ks.length} activities=${acts}`);
    const email2 = pii(mailOf("x4-par"));
    const s2 = await mkSub(tidA, fA.id, { name: pii(`ซ้ำพร้อมกัน${rand}`), email: email2 });
    const rp = await par(formEvt(tidA, fA.id, s2), 4);
    const ks2 = await contactsBy({ tenantId: tidA, email: email2 });
    const acts2 = ks2[0] ? await actCount(ks2[0].id) : 0;
    chk("C1.8-X4.4", "forms consumer: a fresh event delivered 4× in parallel as the FIRST delivery ⇒ ONE lead · ONE activity (flag first under an advisory lock, then write)",
      rp.every((r) => r.ok) && ks2.length === 1 && acts2 === 1, "once", `ok=${rp.filter((r) => r.ok).length} contacts=${ks2.length} activities=${acts2} ${rp.find((r) => !r.ok)?.err ?? ""}`);
    const cF = await mkCustomer(tidA, memA, `สมาชิกฟอร์ม${rand}`);
    const emailM = pii(mailOf("member-form"));
    const kF = await rawContact(tidA, crmA, pii(`ผู้ติดต่อสมาชิก${rand}`), { email: emailM, memberCustomerId: cF });
    const s3 = await mkSub(tidA, fA.id, { name: pii(`สมาชิกกรอก${rand}`), email: emailM });
    const e3 = formEvt(tidA, fA.id, s3);
    const r3 = [await consume(e3), await consume(e3), ...(await par(e3, 2))];
    const acts3 = await actCount(kF);
    const tl = await maCount({ customerId: cF, crmContactId: kF });
    chk("C1.8-X4.5", "forms consumer on a MEMBER-LINKED existing contact: delivered twice + twice in parallel ⇒ ONE activity and ONE MemberActivity row (crmContactId) through the member facade",
      r3.every((r) => r.ok) && acts3 === 1 && tl === 1, "1 + 1", `activities=${acts3} timeline=${tl} ${r3.find((r) => !r.ok)?.err ?? ""}`, "MAJOR");
  }
  // X3 forms
  {
    const email = pii(mailOf("x3-two"));
    const ans = { name: pii(`คู่แฝด${rand}`), email, phone: pii(phoneOf()) };
    const s1 = await mkSub(tidA, fA.id, ans);
    const s2 = await mkSub(tidA, fA.id, ans);
    const rr = await Promise.all([consume(formEvt(tidA, fA.id, s1)), consume(formEvt(tidA, fA.id, s2))]);
    const ks = await contactsBy({ tenantId: tidA, email });
    const acts = ks[0] ? await actCount(ks[0].id) : 0;
    const u1 = await subRow(s1);
    const u2 = await subRow(s2);
    chk("C1.8-X3.1", "two IDENTICAL submissions (same e-mail) consumed in parallel ⇒ ONE contact · TWO activities · both submissions point at that contact",
      rr.every((r) => r.ok) && ks.length === 1 && acts === 2 && u1?.crmContactId === ks[0]?.id && u2?.crmContactId === ks[0]?.id, "1 + 2",
      `contacts=${ks.length} activities=${acts} ${rr.find((r) => !r.ok)?.err ?? ""}`);
    const email10 = pii(mailOf("x3-ten"));
    const subs: string[] = [];
    for (let i = 0; i < 10; i += 1) subs.push(await mkSub(tidA, fA.id, { name: pii(`สิบคน${i}${rand}`), email: email10 }));
    const r10 = await Promise.all(subs.map((s) => consume(formEvt(tidA, fA.id, s))));
    const ks10 = await contactsBy({ tenantId: tidA, email: email10 });
    const acts10 = ks10[0] ? await actCount(ks10[0].id) : 0;
    chk("C1.8-X3.2", "10 submissions with the same e-mail consumed in parallel (separate pool connections) ⇒ ONE contact · TEN activities",
      r10.every((r) => r.ok) && ks10.length === 1 && acts10 === 10, "1 + 10", `contacts=${ks10.length} activities=${acts10} ${r10.find((r) => !r.ok)?.err ?? ""}`);
  }
  // X1 forms
  {
    const bBefore = await P.crmContact.count({ where: { tenantId: tidB } });
    const sB = await mkSub(tidB, fB.id, { name: pii(`ร้านบี${rand}`), email: pii(mailOf("shop-b")) });
    const forged = await consume(formEvt(tidA, fB.id, sB));
    const forged2 = await consume(synth(tidA, "forms.submission.received", { formId: fA.id, submissionId: sB }));
    const bAfter = await P.crmContact.count({ where: { tenantId: tidB } });
    const aForged = await P.crmContact.count({ where: { tenantId: tidA, sourceDetail: { path: ["submissionId"], equals: sB } } });
    chk("C1.8-X1.1", "forged forms.submission.received of tenant A carrying tenant B's submission/form ids ⇒ nothing anywhere: no contact in B or A, B's submission keeps crmContactId null (event resolves)",
      forged.ok && forged2.ok && bAfter === bBefore && aForged === 0 && (await subRow(sB))?.crmContactId === null, "ignored",
      `${forged.err}${forged2.err} B ${bBefore}→${bAfter} A=${aForged} sub=${(await subRow(sB))?.crmContactId}`);
    const a2 = await P.crmContact.count({ where: { systemId: crmA2 } });
    const bNow = await P.crmContact.count({ where: { tenantId: tidB } });
    chk("C1.8-X1.2", "every form lead of tenant A landed in ITS resolved system: 0 contacts in tenant A's second CRM system and 0 in tenant B (whose CRM system is the OLDEST in the database)",
      a2 === 0 && bNow === 0, "0 · 0", `crmA2=${a2} tenantB=${bNow}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — chat → Party → contact / lead
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3 · chat → lead ──");
  const mkChat = async (tid: string, chatSys: string, opts: { partyId?: string | null; phone?: string | null; name?: string } = {}) => {
    const displayName = pii(opts.name ?? `แชท${nx()}${rand}`);
    const cc = await P.chatContact.create({
      data: { tenantId: tid, systemId: chatSys, channel: "LINE", externalUserId: `${TAG}-u${nx()}`, displayName, phone: opts.phone ? pii(opts.phone) : null, partyId: opts.partyId ?? null },
    });
    const conv = await P.chatConversation.create({ data: { tenantId: tid, systemId: chatSys, channel: "LINE", contactId: cc.id, lastMessageAt: new Date(), lastMessagePreview: "สวัสดีครับ สนใจแพ็กเกจ" } });
    return { contactId: cc.id as string, convId: conv.id as string };
  };
  const chatEvt = (tid: string, convId: string) => synth(tid, "chat.message.received", { conversationId: convId, channel: "LINE" });
  {
    const P1 = await mkParty(tidC, pii(`ลูกค้าเก่าแชท${rand}`), "PERSON", { phone: pii(phoneOf()) });
    const kC1 = await rawContact(tidC, crmC, pii(`ผู้ติดต่อเดิม${rand}`), { partyId: P1 });
    const ch = await mkChat(tidC, chatC, { partyId: P1 });
    const before = await P.crmContact.count({ where: { tenantId: tidC } });
    const r = await consume(chatEvt(tidC, ch.convId));
    const after = await P.crmContact.count({ where: { tenantId: tidC } });
    chk("C1.8-S3.1", "chat message from a Party that already has a CRM contact ⇒ no new contact (the existing one is the match) · no CrmActivity per message",
      r.ok && after === before && (await actCount(kC1)) === 0 && !!kC1, "no duplicate", `${r.err} contacts ${before}→${after}`);
  }
  {
    const P2 = await mkParty(tidC, pii(`ลูกค้าใหม่แชท${rand}`), "PERSON", { phone: pii(phoneOf()) });
    const ch = await mkChat(tidC, chatC, { partyId: P2 });
    const r = await consume(chatEvt(tidC, ch.convId));
    const ks = await contactsBy({ tenantId: tidC, partyId: P2 });
    chk("C1.8-S3.2", "chat message from a Party without a contact while settings.crm.chatToLead = true ⇒ ONE LEAD in the tenant's CRM system: partyId = the chat contact's Party · sourceKind CHAT · no activity per message",
      r.ok && ks.length === 1 && ks[0].systemId === crmC && ks[0].lifecycleStage === "LEAD" && ks[0].sourceKind === "CHAT" && (await actCount(ks[0].id)) === 0,
      "1 lead", `${r.err} leads=${ks.length} kind=${ks[0]?.sourceKind ?? "-"} stage=${ks[0]?.lifecycleStage ?? "-"}`);
  }
  {
    await setCrm(crmC, { chatToLead: false });
    const P3 = await mkParty(tidC, pii(`ไม่เปิดลีด${rand}`), "PERSON", { phone: pii(phoneOf()) });
    const ch = await mkChat(tidC, chatC, { partyId: P3 });
    const r = await consume(chatEvt(tidC, ch.convId));
    await setCrm(crmC, { chatToLead: true });
    const ks = await contactsBy({ tenantId: tidC, partyId: P3 });
    chk("C1.8-S3.3", "chatToLead = false ⇒ no lead from a Party without a contact (event resolves)", r.ok && ks.length === 0, "0", `${r.err} leads=${ks.length}`);
  }
  {
    const ph = phoneOf();
    const ch = await mkChat(tidC, chatC, { phone: ph });
    const r = await consume(chatEvt(tidC, ch.convId));
    const cc = (await P.chatContact.findFirst({ where: { id: ch.contactId } })) as Any;
    const ks = cc?.partyId ? await contactsBy({ tenantId: tidC, partyId: cc.partyId }) : [];
    chk("C1.8-S8.13", "chat contact WITHOUT a Party but with a phone ⇒ Party resolved through the party facade, ChatContact.partyId written, lead carries that partyId",
      r.ok && !!cc?.partyId && ks.length === 1, "party + lead", `${r.err} partyId=${cc?.partyId ?? "-"} leads=${ks.length}`, "MAJOR");
  }
  {
    const P4 = await mkParty(tidC, pii(`ลำดับแชท${rand}`), "PERSON", { phone: pii(phoneOf()) });
    const ch = await mkChat(tidC, chatC, { partyId: P4 });
    const x = await redeliver(chatEvt(tidC, ch.convId), tidC);
    const n4 = (await contactsBy({ tenantId: tidC, partyId: P4 })).length;
    chk("C1.8-X4.6", "chat consumer: delivered, then twice in sequence + 3× in parallel ⇒ ONE lead · no tenant table changes after the first", x.ok && n4 === 1, "once", `${x.info} leads=${n4}`);
    const P5 = await mkParty(tidC, pii(`พร้อมกันแชท${rand}`), "PERSON", { phone: pii(phoneOf()) });
    const ch5 = await mkChat(tidC, chatC, { partyId: P5 });
    const r5 = await par(chatEvt(tidC, ch5.convId), 4);
    const n5 = (await contactsBy({ tenantId: tidC, partyId: P5 })).length;
    chk("C1.8-X4.7", "chat consumer: a fresh event 4× in parallel as the first delivery ⇒ ONE lead", r5.every((r) => r.ok) && n5 === 1, "once", `ok=${r5.filter((r) => r.ok).length} leads=${n5}`);
    const P6 = await mkParty(tidC, pii(`สิบข้อความ${rand}`), "PERSON", { phone: pii(phoneOf()) });
    const ch6 = await mkChat(tidC, chatC, { partyId: P6 });
    const r6 = await Promise.all(Array.from({ length: 10 }, () => consume(chatEvt(tidC, ch6.convId))));
    const n6 = (await contactsBy({ tenantId: tidC, partyId: P6 })).length;
    chk("C1.8-X3.3", "10 DIFFERENT message events of the same new chat contact consumed in parallel ⇒ ONE lead (lock keyed by system + Party)",
      r6.every((r) => r.ok) && n6 === 1, "1", `ok=${r6.filter((r) => r.ok).length} leads=${n6}`);
  }
  {
    const PB = await mkParty(tidB, pii(`ลูกค้าร้านบีแชท${rand}`), "PERSON", { phone: pii(phoneOf()) });
    const chB = await mkChat(tidB, chatB, { partyId: PB });
    const r = await consume(chatEvt(tidC, chB.convId));
    const inB = await P.crmContact.count({ where: { tenantId: tidB, partyId: PB } });
    const inC = await P.crmContact.count({ where: { tenantId: tidC, partyId: PB } });
    chk("C1.8-X1.3", "chat.message.received of tenant C naming tenant B's conversation ⇒ ignored: no lead in B, none in C (event resolves)", r.ok && inB === 0 && inC === 0, "0 · 0", `${r.err} B=${inB} C=${inC}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — account.quotation.responded → stage per pipeline setting
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S4 · quotation.responded ──");
  const kQ = await rawContact(tidA, crmA, pii(`ลูกค้าใบเสนอราคา${rand}`));
  const quoteDeal = async (c: Any, tid: string, accSys: string, pipe: { id: string; st: string[] }, contactId: string) => {
    const qt = await mkDoc(tid, accSys, "QUOTATION");
    const d = await fxDeal(c, contactId, pipe, { quotationDocId: qt });
    return { qt, d };
  };
  const qEvt = (tid: string, documentId: string, accepted: boolean) => synth(tid, "account.quotation.responded", { documentId, docNo: `${TAG}-Q`, accepted });
  const histInto = (dealId: string, stageId: string) => P.crmDealStageHistory.count({ where: { dealId, toStageId: stageId } }) as Promise<number>;
  const stEvents = async (dealId: string) => (await rows([tidA, tidB, tidV, tidO, tidL], "crm.deal.stage.changed")).filter((r) => r.payload?.dealId === dealId).length;
  {
    const a = await quoteDeal(cA, tidA, accA, pA, kQ);
    const rj = await quoteDeal(cA, tidA, accA, pA, kQ);
    const ra = await consume(qEvt(tidA, a.qt, true));
    const rr = await consume(qEvt(tidA, rj.qt, false));
    const da = await dealRow(a.d);
    const dr = await dealRow(rj.d);
    chk("C1.8-S4.1", "quotation ACCEPTED ⇒ the deal whose quotationDocId matches moves to pipeline.stageOnQuoteAcceptedId (one history row, one crm.deal.stage.changed) · REJECTED ⇒ stageOnQuoteRejectedId",
      ra.ok && rr.ok && da?.stageId === pA.st[2] && dr?.stageId === pA.st[1] && (await histInto(a.d, pA.st[2])) === 1 && (await stEvents(a.d)) === 1 && (await stEvents(rj.d)) === 1,
      "accepted→st2 · rejected→st1", `${ra.err}${rr.err} acc=${da?.stageId === pA.st[2]} rej=${dr?.stageId === pA.st[1]} hist=${await histInto(a.d, pA.st[2])} ev=${await stEvents(a.d)}/${await stEvents(rj.d)}`);
  }
  {
    const n = await quoteDeal(cA, tidA, accA, pAN, kQ);
    const orphanQt = await mkDoc(tidA, accA, "QUOTATION");
    const r1 = await consume(qEvt(tidA, n.qt, true));
    const r2 = await consume(qEvt(tidA, orphanQt, true));
    const dn = await dealRow(n.d);
    chk("C1.8-S4.2", "pipeline WITHOUT stageOnQuote* set ⇒ no move · a quotation linked to no deal ⇒ nothing (both events resolve)",
      r1.ok && r2.ok && dn?.stageId === pAN.st[0] && (await stEvents(n.d)) === 0, "no move", `${r1.err}${r2.err} stage0=${dn?.stageId === pAN.st[0]} ev=${await stEvents(n.d)}`);
  }
  {
    const q = await quoteDeal(cA, tidA, accA, pA, kQ);
    const x = await redeliver(qEvt(tidA, q.qt, true), tidA);
    chk("C1.8-X4.8", "quotation consumer: delivered, then twice in sequence + 3× in parallel ⇒ ONE stage move (1 history row into the accepted stage · 1 crm.deal.stage.changed) · no tenant table changes after the first",
      x.ok && (await histInto(q.d, pA.st[2])) === 1 && (await stEvents(q.d)) === 1, "once", `${x.info} hist=${await histInto(q.d, pA.st[2])} ev=${await stEvents(q.d)}`);
    const q2 = await quoteDeal(cA, tidA, accA, pA, kQ);
    const rp = await par(qEvt(tidA, q2.qt, true), 4);
    chk("C1.8-X4.9", "quotation consumer: a fresh event 4× in parallel as the first delivery ⇒ ONE stage move", rp.every((r) => r.ok) && (await histInto(q2.d, pA.st[2])) === 1 && (await stEvents(q2.d)) === 1,
      "once", `ok=${rp.filter((r) => r.ok).length} hist=${await histInto(q2.d, pA.st[2])} ev=${await stEvents(q2.d)}`);
  }
  {
    const kB = await rawContact(tidB, crmB, pii(`ลูกค้าบีใบเสนอ${rand}`));
    const qB = await quoteDeal(cB, tidB, accB, pB, kB);
    const r = await consume(qEvt(tidA, qB.qt, true));
    chk("C1.8-X1.4", "quotation.responded of tenant A carrying tenant B's document id ⇒ B's deal does not move", r.ok && (await dealRow(qB.d))?.stageId === pB.st[0] && (await stEvents(qB.d)) === 0,
      "unchanged", `${r.err} stage0=${(await dealRow(qB.d))?.stageId === pB.st[0]}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S8 — account.document.issued · account.contact.merged/created
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S8 · account bridges ──");
  const invEvt = (tid: string, documentId: string) => synth(tid, "account.document.issued", { documentId, type: "INVOICE", docNo: `${TAG}-I`, status: "AWAITING_PAYMENT", contactId: null, grandTotalSatang: 100_000, issueDate: "2026-09-19", source: "MANUAL" });
  {
    const q = await quoteDeal(cA, tidA, accA, pAN, kQ);
    const inv = await mkDoc(tidA, accA, "INVOICE", { sourceDocId: q.qt });
    const x = await redeliver(invEvt(tidA, inv), tidA);
    const stray = await mkDoc(tidA, accA, "INVOICE", { sourceDocId: `${TAG}-nothing` });
    const rs = await consume(invEvt(tidA, stray));
    const q2 = await quoteDeal(cA, tidA, accA, pAN, kQ);
    const inv2 = await mkDoc(tidA, accA, "INVOICE", { sourceDocId: q2.qt });
    const rp = await par(invEvt(tidA, inv2), 4);
    chk("C1.8-S8.6", "account.document.issued of an invoice whose sourceDocId is a deal's quotation ⇒ deal.invoiceDocId = that invoice (redelivery + parallel first delivery idempotent) · an invoice sourced from nothing ⇒ no change",
      x.ok && (await dealRow(q.d))?.invoiceDocId === inv && rs.ok && rp.every((r) => r.ok) && (await dealRow(q2.d))?.invoiceDocId === inv2, "invoiceDocId",
      `${x.info} d1=${(await dealRow(q.d))?.invoiceDocId === inv} d2=${(await dealRow(q2.d))?.invoiceDocId === inv2} ${rs.err}`);
    const kB = await rawContact(tidB, crmB, pii(`ลูกค้าบีบิล${rand}`));
    const qB = await quoteDeal(cB, tidB, accB, pB, kB);
    const invB = await mkDoc(tidB, accB, "INVOICE", { sourceDocId: qB.qt });
    const rx = await consume(invEvt(tidA, invB));
    chk("C1.8-X1.5", "document.issued of tenant A naming tenant B's invoice ⇒ B's deal keeps invoiceDocId null", rx.ok && (await dealRow(qB.d))?.invoiceDocId === null, "unchanged", `${rx.err} inv=${(await dealRow(qB.d))?.invoiceDocId}`);
  }
  {
    const mkAc = async (tid: string, sys: string) => (await P.accountContact.create({ data: { tenantId: tid, systemId: sys, name: pii(`ผู้ติดต่อบัญชี ${nx()} ${rand}`) } })).id as string;
    const acK = await mkAc(tidA, accA);
    const acM = await mkAc(tidA, accA);
    const coPid = await mkParty(tidA, `บริษัทบัญชี ${rand}`, "COMPANY");
    const coM = (await P.crmCompany.create({ data: { tenantId: tidA, systemId: crmA, name: `บริษัทบัญชี ${rand}`, partyId: coPid, accountContactId: acM } })).id as string;
    const x = await redeliver(synth(tidA, "account.contact.merged", { keepId: acK, mergedId: acM, moved: {} }), tidA);
    const coRow = (await P.crmCompany.findFirst({ where: { id: coM } })) as Any;
    const acB = await mkAc(tidB, accB);
    const coBPid = await mkParty(tidB, `บริษัทบี ${rand}`, "COMPANY");
    const coB = (await P.crmCompany.create({ data: { tenantId: tidB, systemId: crmB, name: `บริษัทบี ${rand}`, partyId: coBPid, accountContactId: acB } })).id as string;
    const rx = await consume(synth(tidA, "account.contact.merged", { keepId: acK, mergedId: acB, moved: {} }));
    const fp0 = await footprint(tidA);
    const rc = await consume(synth(tidA, "account.contact.created", { contactId: acK }));
    const fp1 = await footprint(tidA);
    chk("C1.8-S8.7", "account.contact.merged ⇒ CrmCompany.accountContactId re-pointed merged → kept (redelivery idempotent) · the same event naming tenant B's contact leaves B's company alone · account.contact.created is a no-op (no tenant table changes)",
      x.ok && coRow?.accountContactId === acK && rx.ok && ((await P.crmCompany.findFirst({ where: { id: coB } })) as Any)?.accountContactId === acB && rc.ok && fpDiff(fp0, fp1).length === 0,
      "re-pointed · B intact · created no-op", `${x.info} co=${coRow?.accountContactId === acK ? "kept" : coRow?.accountContactId} ${rx.err} created=${rc.err || "ok"} diff=${cut(fpDiff(fp0, fp1).join(" "), 80)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S8 — member.created / member.merged
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S8 · member bridges ──");
  const mCreated = (tid: string, customerId: string, partyId: string | null) => synth(tid, "member.created", { customerId, partyId, source: "WALK_IN", referrerId: null });
  {
    const Pm = await mkParty(tidA, pii(`สมาชิกใหม่${rand}`), "PERSON", { phone: pii(phoneOf()) });
    const kMC = await rawContact(tidA, crmA, pii(`จะเป็นสมาชิก${rand}`), { partyId: Pm });
    const cOther = await mkCustomer(tidA, memA, `สมาชิกอื่น${rand}`);
    const kLinked = await rawContact(tidA, crmA, pii(`ผูกแล้ว${rand}`), { partyId: Pm, memberCustomerId: cOther });
    const cNew = await mkCustomer(tidA, memA, `สมาชิกผูก${rand}`, { partyId: Pm });
    // MemberNotification ignored here: the WELCOME notification is the BASE consumer's (member module), not a CRM effect —
    //   its redelivery behaviour is reported to the controller separately (not C1.8's)
    const x = await redeliver(mCreated(tidA, cNew, Pm), tidA, ["MemberNotification"]);
    const a = (await P.crmContact.findFirst({ where: { id: kMC } })) as Any;
    const b = (await P.crmContact.findFirst({ where: { id: kLinked } })) as Any;
    chk("C1.8-S8.8", "member.created ⇒ the contact with the same Party gets memberCustomerId (redelivery idempotent) · a contact already linked to another member is NOT overwritten",
      x.ok && a?.memberCustomerId === cNew && b?.memberCustomerId === cOther, "linked · no overwrite", `${x.info} a=${a?.memberCustomerId === cNew} b=${b?.memberCustomerId === cOther}`);
    const Pp = await mkParty(tidA, pii(`สมาชิกพร้อมกัน${rand}`), "PERSON", { phone: pii(phoneOf()) });
    const kP = await rawContact(tidA, crmA, pii(`รอผูกพร้อมกัน${rand}`), { partyId: Pp });
    const cP = await mkCustomer(tidA, memA, `สมาชิกพร้อมกัน${rand}`, { partyId: Pp });
    const rp = await par(mCreated(tidA, cP, Pp), 4);
    chk("C1.8-X4.10", "member.created 4× in parallel as the first delivery ⇒ linked once, every delivery resolves", rp.every((r) => r.ok) && ((await P.crmContact.findFirst({ where: { id: kP } })) as Any)?.memberCustomerId === cP,
      "linked", `ok=${rp.filter((r) => r.ok).length}`);
    const PBm = await mkParty(tidB, pii(`สมาชิกร้านบี${rand}`), "PERSON", { phone: pii(phoneOf()) });
    const kBm = await rawContact(tidB, crmB, pii(`ผู้ติดต่อร้านบี${rand}`), { partyId: PBm });
    const cBm = await mkCustomer(tidB, memB, `สมาชิกบี${rand}`, { partyId: PBm });
    const rx = await consume(mCreated(tidA, cBm, PBm));
    chk("C1.8-X1.6", "member.created of tenant A naming tenant B's member + Party ⇒ B's contact stays unlinked", rx.ok && ((await P.crmContact.findFirst({ where: { id: kBm } })) as Any)?.memberCustomerId === null,
      "unlinked", `${rx.err}`);
  }
  {
    const CS = CRM.consents ?? {};
    const canContact = CRM.canContact ?? CS.canContact;
    const cKeep = await mkCustomer(tidA, memA, `สมาชิกที่เก็บ${rand}`);
    const cGone = await mkCustomer(tidA, memA, `สมาชิกที่ถูกรวม${rand}`, { status: "MERGED", mergedIntoId: cKeep });
    await P.memberConsent.create({ data: { tenantId: tidA, customerId: cKeep, channel: "EMAIL", granted: true, source: "STAFF", grantedAt: new Date() } });
    await P.memberConsent.create({ data: { tenantId: tidA, customerId: cGone, channel: "EMAIL", granted: false, source: "STAFF", revokedAt: new Date() } });
    const kMg = await rawContact(tidA, crmA, pii(`ผู้ติดต่อรวมสมาชิก${rand}`), { email: pii(mailOf("merged-member")), memberCustomerId: cGone });
    const before = await call(canContact, (await P.crmContact.findFirst({ where: { id: kMg } })) as Any, "EMAIL");
    const x = await redeliver(synth(tidA, "member.merged", { keepId: cKeep, mergedId: cGone }), tidA);
    const row = (await P.crmContact.findFirst({ where: { id: kMg } })) as Any;
    const after = await call(canContact, row, "EMAIL");
    chk("C1.8-S8.9", "member.merged ⇒ contacts pointing at the merged member are re-pointed to the KEPT member (redelivery idempotent) · consents.canContact then reads the surviving member's consent (EMAIL granted ⇒ true)",
      x.ok && row?.memberCustomerId === cKeep && after.ok && after.v === true, "re-pointed · true", `${x.info} member=${row?.memberCustomerId === cKeep ? "keep" : row?.memberCustomerId} before=${before.ok ? before.v : before.err} after=${after.ok ? after.v : after.err}`);
    const cK2 = await mkCustomer(tidB, memB, `บีเก็บ${rand}`);
    const cG2 = await mkCustomer(tidB, memB, `บีรวม${rand}`, { status: "MERGED", mergedIntoId: cK2 });
    const kB2 = await rawContact(tidB, crmB, pii(`บีรวมสมาชิก${rand}`), { memberCustomerId: cG2 });
    const rx = await consume(synth(tidA, "member.merged", { keepId: cK2, mergedId: cG2 }));
    chk("C1.8-X1.7", "member.merged of tenant A naming tenant B's members ⇒ B's contact is not re-pointed", rx.ok && ((await P.crmContact.findFirst({ where: { id: kB2 } })) as Any)?.memberCustomerId === cG2, "unchanged", `${rx.err}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S8 — approvals: crm.discount (C1.5 applyDiscountDecision) · crm.reassign
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S8 · approvals ──");
  const PENDING = { lines: [{ name: "แพ็กเกจดำน้ำ", qty: 2, unitPriceSatang: 10_000, discountBp: 3000 }], discountBp: 0 };
  const pendingDeal = async (c: Any, pipe: { id: string; st: string[] }, contactId: string) => {
    const req = `${TAG}-req-${nx()}`;
    const d = await fxDeal(c, contactId, pipe, { pendingLines: PENDING, pendingApprovalRequestId: req });
    return { d, req };
  };
  const apEvt = (tid: string, type: string, entityType: string, entityId: string, requestId: string) => synth(tid, type, { entityType, entityId, requestId });
  const lineCount = (dealId: string) => P.crmDealLine.count({ where: { dealId } }) as Promise<number>;
  {
    const a = await pendingDeal(cA, pAN, kQ);
    const x = await redeliver(apEvt(tidA, "approval.request.approved", "crm.discount", `${a.d}:s1`, a.req), tidA);
    const da = await dealRow(a.d);
    const rj = await pendingDeal(cA, pAN, kQ);
    const rr = await consume(apEvt(tidA, "approval.request.rejected", "crm.discount", `${rj.d}:s1`, rj.req));
    const dr = await dealRow(rj.d);
    chk("C1.8-S8.10", "approval.request.approved crm.discount ⇒ the parked lines are applied ONCE (1 line · value 14,000 satang · pending cleared) under redelivery · rejected ⇒ parked lines cleared, no line written",
      x.ok && (await lineCount(a.d)) === 1 && da?.valueSatang === 14_000 && da?.pendingApprovalRequestId === null && rr.ok && (await lineCount(rj.d)) === 0 && dr?.pendingApprovalRequestId === null,
      "applied once · cleared", `${x.info} lines=${await lineCount(a.d)} value=${da?.valueSatang} pending=${da?.pendingApprovalRequestId ?? "null"} rej=${rr.err || "ok"} rejLines=${await lineCount(rj.d)}`);
    const p = await pendingDeal(cA, pAN, kQ);
    const rp = await par(apEvt(tidA, "approval.request.approved", "crm.discount", `${p.d}:s1`, p.req), 4);
    chk("C1.8-X4.11", "crm.discount approval 4× in parallel as the first delivery ⇒ lines applied once (1 line)", rp.every((r) => r.ok) && (await lineCount(p.d)) === 1, "1 line", `ok=${rp.filter((r) => r.ok).length} lines=${await lineCount(p.d)}`);
    const ra = await consume(apEvt(tidA, "approval.request.approved", "crm.reassign", `${p.d}`, `${TAG}-req-reassign`));
    chk("C1.8-S8.11", "approval.request.approved with entityType crm.reassign resolves without failing the event (the effect itself belongs to C3.2 — C1.7 addendum 7)", ra.ok, "resolves", ra.err, "MINOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S8 — gates: uiVersion 1 (R-E.14) · bridgesEnabled false · legacy paths kept
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S8 · gates ──");
  {
    const fV = await mkForm(tidV);
    const s = await mkSub(tidV, fV.id, { name: pii(`ฟอร์มรุ่นเก่า${rand}`), email: pii(mailOf("v1-form")), phone: pii(phoneOf()) });
    const e = formEvt(tidV, fV.id, s);
    const r = [await consume(e), await consume(e)];
    const sub = await subRow(s);
    const k = sub?.crmContactId ? ((await P.crmContact.findFirst({ where: { id: sub.crmContactId } })) as Any) : null;
    const n = await P.crmContact.count({ where: { tenantId: tidV } });
    chk("C1.8-S8.1", "uiVersion 1 system: the form lead of v1 is KEPT through the consumer (question Q1) — one contact in that system with source \"FORM\" and the submission's name, crmContactId set, redelivery adds nothing",
      r.every((x) => x.ok) && !!k && k.systemId === crmV && k.source === "FORM" && n === 1, "v1 lead kept", `${r.find((x) => !x.ok)?.err ?? ""} contact=${!!k} src=${k?.source ?? "-"} count=${n}`, "MAJOR");
  }
  const gateProbe = async (tid: string, c: Any, crm: string, mem: string, chat: string, acc: string, pipe: { id: string; st: string[] }) => {
    const Pc = await mkParty(tid, pii(`ประตูแชท${rand}`), "PERSON", { phone: pii(phoneOf()) });
    const ch = await mkChat(tid, chat, { partyId: Pc });
    const rChat = await consume(chatEvt(tid, ch.convId));
    const chatLeads = await P.crmContact.count({ where: { tenantId: tid, partyId: Pc } });
    const k = await rawContact(tid, crm, pii(`ประตูใบเสนอ${rand}`));
    const qt = await mkDoc(tid, acc, "QUOTATION");
    const d = await fxDeal(c, k, pipe, { quotationDocId: qt });
    const rQ = await consume(qEvt(tid, qt, true));
    const moved = (await dealRow(d))?.stageId !== pipe.st[0];
    const Pm = await mkParty(tid, pii(`ประตูสมาชิก${rand}`), "PERSON", { phone: pii(phoneOf()) });
    const km = await rawContact(tid, crm, pii(`ประตูผูก${rand}`), { partyId: Pm });
    const cm = await mkCustomer(tid, mem, `ประตูสมาชิก${rand}`, { partyId: Pm });
    const rM = await consume(mCreated(tid, cm, Pm));
    const linked = ((await P.crmContact.findFirst({ where: { id: km } })) as Any)?.memberCustomerId === cm;
    const ct = await mkCustomer(tid, mem, `ประตูไทม์ไลน์${rand}`);
    const kt = await rawContact(tid, crm, pii(`ประตูไทม์ไลน์${rand}`), { memberCustomerId: ct });
    const dt = await fxDeal(c, kt, pipe);
    const evT = (await rows([tid], "crm.deal.created")).filter((r) => r.payload?.dealId === dt);
    const rT = evT[0] ? await consume(evtOf(evT[0])) : ({ ok: false, err: "no crm.deal.created event (fixture)" } as Res);
    const tl = await maCount({ customerId: ct, dealId: dt });
    const ok = [rChat, rQ, rM, rT].every((r) => r.ok) && chatLeads === 0 && !moved && !linked && tl === 0;
    return { ok, info: `chatLead=${chatLeads} moved=${moved} linked=${linked} timeline=${tl} ${[rChat, rQ, rM, rT].find((r) => !r.ok)?.err ?? ""}` };
  };
  {
    const g = await gateProbe(tidV, cV, crmV, memV, chatV, accV, pV);
    chk("C1.8-S8.2", "uiVersion 1 system (R-E.14): chat (chatToLead on) · quotation.responded · member.created · the timeline extra of crm.deal.created are all skipped — no lead, no move, no link, no MemberActivity — and every event resolves",
      g.ok, "all skipped", g.info);
    const o = await gateProbe(tidO, cO, crmO, memO, chatO, accO, pO);
    chk("C1.8-S8.3", "settings.crm.bridgesEnabled = false (uiVersion 2): the same four consumers are no-ops and resolve", o.ok, "all no-op", o.info);
  }
  {
    // C1.2b ruling 7: the custom.record.created consumer gates on uiVersion too (positive control in tA)
    const probe = async (c: Any, tid: string, crm: string, mem: string) => {
      const cu = await mkCustomer(tid, mem, `วัตถุ${rand}`);
      const k = await rawContact(tid, crm, pii(`เจ้าของรถ${rand}`), { memberCustomerId: cu });
      const o = await call(OBJ.create, c, owner, { key: "pet", label: "สัตว์เลี้ยง", labelPlural: "สัตว์เลี้ยง", parentType: "CONTACT", titleFieldKey: "petname", showAsTab: true });
      const r = await call(OBJ.records?.create, c, owner, "pet", { parentId: k, title: pii(`น้องหมา ${rand}`) });
      const ev = (await rows([tid], "custom.record.created")).filter((x) => x.payload?.recordId === idOf(r.v));
      const res = ev[0] ? await consume(evtOf(ev[0])) : ({ ok: false, err: "no custom.record.created event (fixture)" } as Res);
      return { rows: await maCount({ customerId: cu }), ok: res.ok && ev.length === 1, info: `${o.err}${r.err}${res.err} events=${ev.length}` };
    };
    const v2 = await probe(cA, tidA, crmA, memA);
    const v1 = await probe(cV, tidV, crmV, memV);
    chk("C1.8-S8.4", "custom.record.created consumer (C1.2b ruling 7): uiVersion 2 ⇒ ONE MemberActivity row for the member-linked parent (positive control) · uiVersion 1 ⇒ none, event resolves",
      v2.ok && v2.rows === 1 && v1.ok && v1.rows === 0, "1 · 0", `v2 rows=${v2.rows} ${v2.info} | v1 rows=${v1.rows} ${v1.info}`, "MAJOR");
  }
  {
    // legacy member bridge is NOT gated: DEAL_WON still arrives for a uiVersion-1 system (qc-member regressions)
    const kw = await rawContact(tidV, crmV, pii(`ชนะรุ่นเก่า${rand}`), { email: pii(mailOf("v1-won")) });
    const dw = await fxDeal(cV, kw, pV);
    const mv = await call(SVC.moveDeal, { tenantId: tidV, systemId: crmV }, dw, pV.st[3]);
    const ev = (await rows([tidV], "crm.deal.won")).filter((r) => r.payload?.dealId === dw);
    for (const r of ev) LEGACY_WON_KEYS.add(r.idempotencyKey);
    const res = ev[0] ? await consume(evtOf(ev[0])) : ({ ok: false, err: "no event" } as Res);
    const k = (await P.crmContact.findFirst({ where: { id: kw } })) as Any;
    const won = k?.memberCustomerId ? await maCount({ customerId: k.memberCustomerId, type: "DEAL_WON", refId: dw }) : 0;
    chk("C1.8-S8.5", "uiVersion 1 system: the legacy member bridge (onCrmDealWon) still turns a won deal into a member + ONE DEAL_WON row — gates never apply to it",
      mv.ok && ev.length === 1 && res.ok && won === 1, "DEAL_WON", `${mv.err} events=${ev.length} ${res.err} won=${won}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S8 — briefFor needs an actor (C1.4 debt) · resolver direct
  // ═════════════════════════════════════════════════════════════════════════════
  {
    const withActor = await call(CT.briefFor, cA, owner, { contactId: kM });
    const noActor = await call(CT.briefFor, cA, null, { contactId: kM });
    const arity = typeof CT.briefFor === "function" ? CT.briefFor.length : -1;
    chk("C1.8-S8.12", "contacts.briefFor(ctx, actor, key) — the actor is REQUIRED (C1.4 debt): with the owner ⇒ the brief of that contact · with no actor ⇒ null or refused",
      arity >= 3 && withActor.ok && withActor.v?.contactId === kM && (!noActor.ok || noActor.v === null), "actor required",
      `arity=${arity} owner=${withActor.ok ? (withActor.v?.contactId === kM ? "brief" : j(withActor.v)?.slice(0, 40)) : withActor.err} none=${noActor.ok ? (noActor.v === null ? "null" : "BRIEF") : "refused"}`, "MAJOR");
  }
  {
    const tNo = await mkTenant("nocrm");
    const fNo = await mkForm(tNo);
    const rA = await call(BR?.resolveFormCrmSystem, { id: fA.id, tenantId: tidA });
    const rB = await call(BR?.resolveFormCrmSystem, { id: fB.id, tenantId: tidB });
    const rN = await call(BR?.resolveFormCrmSystem, { id: fNo.id, tenantId: tNo });
    chk("C1.8-S8.14", "resolveFormCrmSystem: tenant A's form ⇒ tenant A's FIRST CRM system (crmA, R-E.3) · tenant B's form ⇒ crmB · a tenant without CRM ⇒ null",
      rA.ok && rA.v === crmA && rB.ok && rB.v === crmB && rN.ok && rN.v === null, "crmA · crmB · null", `${rA.ok ? (rA.v === crmA ? "crmA" : rA.v) : rA.err} · ${rB.ok ? (rB.v === crmB ? "crmB" : rB.v) : rB.err} · ${rN.ok ? rN.v : rN.err}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X4 — compose contract (lab tenant; triggers scoped to it, dropped right after)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X4 · compose contract ──");
  const kLab = await rawContact(tidL, crmL, pii(`ห้องทดลอง${rand}`));
  {
    const fL = await mkForm(tidL);
    const s = await mkSub(tidL, fL.id, { name: pii(`ฟอร์มพัง${rand}`), email: pii(mailOf("lab-form")) });
    const t0 = new Date(Date.now() - 500);
    let r: Res = { ok: false, v: undefined, err: "not run", code: "", msg: "" };
    try { await failWrites(tidL, "CrmContact"); r = await consume(formEvt(tidL, fL.id, s)); } finally { await dropTriggers(); }
    const warns = await opsSince(tidL, t0);
    // ORACLE-EDIT C1.8-X4.12 (controller · addendum ruling 2, 19 Sep): the lead step is a RETRYING first step (a lost lead is
    //   a production regression for v1 shops) ⇒ a transient failure FAILS the event with nothing half-written, and a
    //   redelivery (trigger gone) creates exactly ONE contact — the compose-extra "WARN only" contract moved to the timeline extra
    const noneYet = (await P.crmContact.count({ where: { tenantId: tidL, email: mailOf("lab-form") } })) === 0 && (await subRow(s))?.crmContactId === null;
    const r2 = await consume(formEvt(tidL, fL.id, s));
    const after = await P.crmContact.count({ where: { tenantId: tidL, email: mailOf("lab-form") } });
    chk("C1.8-X4.12", "forms lead step THROWS (CrmContact insert forced to fail) ⇒ the event FAILS for retry · nothing half-written · redelivery creates exactly one contact + crmContactId",
      !r.ok && noneYet && r2.ok && after === 1 && !!(await subRow(s))?.crmContactId,
      "fails · retry ⇒ 1", `${r.ok ? "resolved (lead lost!)" : "failed"} noneYet=${noneYet} retry=${r2.ok ? "ok" : r2.err} contacts=${after} warns=${warns.length}`);
  }
  {
    const qt = await mkDoc(tidL, accL, "QUOTATION");
    const d = await fxDeal(cL, kLab, pL, { quotationDocId: qt });
    const t0 = new Date(Date.now() - 500);
    let r: Res = { ok: false, v: undefined, err: "not run", code: "", msg: "" };
    try { await failWrites(tidL, "CrmDealStageHistory"); r = await consume(qEvt(tidL, qt, true)); } finally { await dropTriggers(); }
    const warns = await opsSince(tidL, t0);
    chk("C1.8-X4.13", "compose — the quotation extra THROWS (history insert forced to fail) ⇒ the event is NOT failed · WARN · the deal did not move (its transaction rolled back)",
      r.ok && warns.length >= 1 && (await dealRow(d))?.stageId === pL.st[0], "resolves + WARN", `${r.err || "resolved"} warns=${warns.length} stage0=${(await dealRow(d))?.stageId === pL.st[0]}`);
  }
  {
    const a = await pendingDeal(cL, pL, kLab);
    let r: Res = { ok: false, v: undefined, err: "not run", code: "", msg: "" };
    try { await failWrites(tidL, "AppNotification"); r = await consume(apEvt(tidL, "approval.request.approved", "crm.discount", `${a.d}:s1`, a.req)); } finally { await dropTriggers(); }
    chk("C1.8-X4.14", "compose — the BASE throws (the approval notification insert forced to fail) ⇒ the event still fails for retry (base error surfaces) BUT the CRM extra ran: the parked discount lines are applied",
      !r.ok && (await lineCount(a.d)) === 1 && (await dealRow(a.d))?.pendingApprovalRequestId === null, "failed + extra ran", `${r.ok ? "resolved (base error swallowed)" : "failed"} lines=${await lineCount(a.d)}`);
  }
  {
    const a = await pendingDeal(cL, pL, kLab);
    const n0 = await P.appNotification.count({ where: { tenantId: tidL } });
    const t0 = new Date(Date.now() - 500);
    let r: Res = { ok: false, v: undefined, err: "not run", code: "", msg: "" };
    try { await failWrites(tidL, "CrmDealLine"); r = await consume(apEvt(tidL, "approval.request.approved", "crm.discount", `${a.d}:s1`, a.req)); } finally { await dropTriggers(); }
    const n1 = await P.appNotification.count({ where: { tenantId: tidL } });
    const warns = await opsSince(tidL, t0);
    // ORACLE-EDIT C1.8-X4.15 (controller · addendum ruling 6, 19 Sep): the discount effect is a RETRYING first step (an approved
    //   discount must never be lost) ⇒ failure fails the event BEFORE the notification · redelivery applies once + one notification
    const pendingStill = (await dealRow(a.d))?.pendingApprovalRequestId === a.req;
    const r2 = await consume(apEvt(tidL, "approval.request.approved", "crm.discount", `${a.d}:s1`, a.req));
    const n2 = await P.appNotification.count({ where: { tenantId: tidL } });
    chk("C1.8-X4.15", "discount step THROWS (deal-line insert forced to fail) ⇒ the event FAILS for retry · no notification yet · still pending · redelivery applies the lines once + exactly one notification",
      !r.ok && n1 === n0 && pendingStill && r2.ok && (await lineCount(a.d)) === 1 && (await dealRow(a.d))?.pendingApprovalRequestId === null && n2 === n0 + 1,
      "fails · retry ⇒ applied once", `${r.ok ? "resolved" : "failed"} notifications ${n0}→${n1}→${n2} pending=${pendingStill} retry=${r2.ok ? "ok" : r2.err} lines=${await lineCount(a.d)} warns=${warns.length}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S2.1 — end-to-end submit (real outbox) · S7 drain until quiet
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2.1 · S7 · end-to-end + drain ──");
  const e2eEmail = pii(mailOf("e2e"));
  const e2e = await call(FM.submitPublicForm, fA.publicToken, { name: pii(`ปลายทางจริง${rand}`), email: e2eEmail, phone: pii(phoneOf()) }, { ip: "203.0.113.9" });
  const quiet = async () => {
    for (let i = 0; i < 8; i += 1) {
      await OBX.drainAll();
      const left = await P.outboxEvent.count({ where: { tenantId: { in: [tidA, tidB, tidC, tidV, tidO] }, status: "PENDING", availableAt: { lte: new Date() } } });
      if (left === 0) return i + 1;
    }
    return -1;
  };
  const rounds = await quiet();
  {
    const sid = String(e2e.v?.id ?? "");
    const sub = sid ? await subRow(sid) : null;
    const k = sub?.crmContactId ? ((await P.crmContact.findFirst({ where: { id: sub.crmContactId } })) as Any) : null;
    const resolved = await call(BR?.resolveFormCrmSystem, { id: fA.id, tenantId: tidA });
    chk("C1.8-S2.1", "end-to-end: submitPublicForm on a tenant with TWO CRM systems, then the queue drains ⇒ the lead lives in resolveFormCrmSystem(form) (crmA) and nowhere else · FormSubmission.crmContactId written by the consumer",
      e2e.ok && !!k && resolved.ok && k.systemId === resolved.v && k.systemId === crmA && k.email === e2eEmail && (await P.crmContact.count({ where: { systemId: crmA2 } })) === 0,
      "lead in crmA", `${e2e.err} contact=${!!k} sys=${k?.systemId === crmA ? "crmA" : k?.systemId ?? "-"} resolver=${resolved.ok ? resolved.v === crmA : resolved.err}`);
    const stuck = (await P.outboxEvent.findMany({ where: { tenantId: { in: [tidA, tidB, tidC, tidV, tidO] }, status: { not: "DONE" } }, select: { type: true, status: true, attempts: true, lastError: true } })) as Any[];
    chk("C1.8-S7.1", "drain until quiet: after the whole run every outbox event of our tenants (incl. those the bridges emitted while consuming) is DONE — none PENDING, none FAILED, none backed off",
      rounds > 0 && stuck.length === 0, "all DONE", `rounds=${rounds} stuck=${stuck.length} ${cut(stuck.slice(0, 4).map((s) => `${s.type}:${s.status}:${s.attempts}:${cut(s.lastError, 60)}`).join(" | "), 240)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — the phase-C1 event set (R-C.9): emitted by its service · systemId · key · ids-only · consumer · declared once
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S1 · phase-C1 events ──");
  const srcA = read("src/lib/automation/labels.ts");
  const srcW = read("src/lib/webhooks/labels.ts");
  const decl = (src: string, t: string) => (src.match(new RegExp(`value:\\s*"${t.replace(/\./g, "\\.")}"`, "g")) ?? []).length;
  const autoL = (await import("@/lib/automation/labels" as string)) as Any;
  const hookL = (await import("@/lib/webhooks/labels" as string)) as Any;
  const hookSet = new Set(((hookL.WEBHOOK_EVENTS ?? []) as Any[]).map((e) => e.value as string));
  const autoSet = new Set(((autoL.AUTOMATION_EVENTS ?? []) as Any[]).map((e) => e.value as string));
  const FORBIDDEN_KEYS = new Set(["name", "firstname", "lastname", "fullname", "phone", "mobile", "email", "title", "note", "notes", "body", "lostnote", "summary", "displayname", "answers", "text", "message", "subject", "transcript", "address"]);
  const payloadProblems = (p: Any): string[] => {
    const out: string[] = [];
    const s = j(p);
    for (const x of PII) if (x && s.includes(x)) out.push(`pii:${cut(x, 18)}`);
    for (const k of keysDeep(p)) if (FORBIDDEN_KEYS.has(k.toLowerCase())) out.push(`key:${k}`);
    for (const v of strings(p)) if (/\s|[ก-๙@]/.test(v) || v.length > 64) out.push(`prose:${cut(v, 20)}`);
    return out;
  };
  const GROUPS: { id: string; label: string; types: string[] }[] = [
    { id: "S1.1", label: "crm.contact.created", types: ["crm.contact.created"] },
    { id: "S1.2", label: "crm.contact.updated", types: ["crm.contact.updated"] },
    { id: "S1.3", label: "crm.contact.assigned", types: ["crm.contact.assigned"] },
    { id: "S1.4", label: "crm.contact.converted", types: ["crm.contact.converted"] },
    { id: "S1.5", label: "crm.contact.merged · crm.company.merged", types: ["crm.contact.merged", "crm.company.merged"] },
    { id: "S1.6", label: "crm.company.created · crm.company.updated", types: ["crm.company.created", "crm.company.updated"] },
    { id: "S1.7", label: "crm.deal.created", types: ["crm.deal.created"] },
    { id: "S1.8", label: "crm.deal.stage.changed", types: ["crm.deal.stage.changed"] },
    { id: "S1.9", label: "crm.deal.won (ids only — C1.5 ruling 1 debt)", types: ["crm.deal.won"] },
    { id: "S1.10", label: "crm.deal.lost · crm.deal.reopened", types: ["crm.deal.lost", "crm.deal.reopened"] },
    { id: "S1.11", label: "crm.deal.reassigned · crm.deal.updated", types: ["crm.deal.reassigned", "crm.deal.updated"] },
    { id: "S1.12", label: "crm.activity.logged · crm.activity.completed", types: ["crm.activity.logged", "crm.activity.completed"] },
    { id: "S1.13", label: "custom.record.created/updated/archived · team.updated", types: ["custom.record.created", "custom.record.updated", "custom.record.archived", "team.updated"] },
  ];
  const C1_TYPES = GROUPS.flatMap((g) => g.types);
  const MY = [tidA, tidB, tidC, tidV, tidO, tidL];
  for (const g of GROUPS) {
    const probs: string[] = [];
    for (const t of g.types) {
      const rs = await rows([tidA], t);
      if (rs.length === 0) { probs.push(`${t}:not emitted`); continue; }
      if (typeof CONS?.[t] !== "function") probs.push(`${t}:no consumer`);
      if (decl(srcA, t) + decl(srcW, t) !== 1 || !(hookSet.has(t) || autoSet.has(t))) probs.push(`${t}:declared ${decl(srcA, t) + decl(srcW, t)}×`);
      const mySys = new Set([crmA, crmA2]);
      const badSys = rs.filter((r) => t !== "team.updated" && !mySys.has(r.systemId));
      if (badSys.length) probs.push(`${t}:systemId×${badSys.length}`);
      const badKey = rs.filter((r) => !(String(r.idempotencyKey).startsWith(`${t}#`) && String(r.idempotencyKey).split("#").length >= 3) && !LEGACY_WON_KEYS.has(r.idempotencyKey));
      if (badKey.length) probs.push(`${t}:key ${cut(badKey[0].idempotencyKey, 50)}`);
      const pp = rs.flatMap((r) => payloadProblems(r.payload));
      if (pp.length) probs.push(`${t}:payload ${cut([...new Set(pp)].slice(0, 5).join(","), 120)}`);
      const res = await consume(evtOf(rs[rs.length - 1]));
      if (!res.ok) probs.push(`${t}:consume ${cut(res.err, 80)}`);
    }
    chk(`C1.8-${g.id}`, `${g.label}: emitted by its service in this run · systemId = the CRM system (team.updated: core) · key \`<type>#<id>#<seq>\` (R-C.8) · payload ids only · consumer resolves · declared exactly once across AUTOMATION/WEBHOOK`,
      probs.length === 0, "all six", probs.join(" · ") || "-");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X4 — orphans · X8 — payload / OpsEvent scan
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X4 · registries · X8 · PDPA ──");
  {
    const types = ((await P.outboxEvent.findMany({ where: { tenantId: { in: MY } }, select: { type: true }, distinct: ["type"] })) as Any[]).map((x) => x.type as string);
    const orphan = types.filter((t) => typeof CONS?.[t] !== "function");
    const declared = [...new Set([...autoSet, ...hookSet])].filter((t) => /^(crm\.|custom\.record\.|team\.)/.test(t));
    const phaseLater = new Set(["crm.deal.stale", "crm.activity.overdue"]);
    const noConsumer = declared.filter((t) => typeof CONS?.[t] !== "function");
    const consumedUndeclared = Object.keys(CONS ?? {}).filter((t) => /^(crm\.|custom\.record\.|team\.)/.test(t) && !(autoSet.has(t) || hookSet.has(t)));
    const missingC1 = C1_TYPES.filter((t) => typeof CONS?.[t] !== "function");
    chk("C1.8-X4.16", "no orphan event types: every type our tenants emitted has a consumer · every declared crm.*/custom.record.*/team.* label has a consumer and every such consumer key is declared (no label-less or consumer-less type)",
      orphan.length === 0 && noConsumer.length === 0 && consumedUndeclared.length === 0 && missingC1.length === 0, "0 orphans",
      `orphans=${orphan.join(",") || "-"} labelNoConsumer=${noConsumer.filter((t) => !phaseLater.has(t)).join(",") || "-"} consumerNoLabel=${consumedUndeclared.join(",") || "-"}`);
  }
  {
    const all = (await P.outboxEvent.findMany({ where: { tenantId: { in: MY } } })) as Any[];
    const ours = all.filter((o) => /^(crm\.|custom\.record\.)/.test(o.type) || o.type === "team.updated" || o.type === "forms.submission.received");
    const wonV2 = ours.some((o) => o.type === "crm.deal.won" && !LEGACY_WON_KEYS.has(o.idempotencyKey));
    const wonLegacy = ours.some((o) => o.type === "crm.deal.won" && LEGACY_WON_KEYS.has(o.idempotencyKey));
    chk("C1.8-X8.0", "[positive control] the scan has material: crm.contact.created of the PII contact · crm.deal.won from BOTH paths · forms.submission.received · crm events emitted by the bridges",
      ours.some((o) => o.type === "crm.contact.created" && o.payload?.contactId === k1) && wonV2 && wonLegacy && ours.some((o) => o.type === "forms.submission.received"),
      "material", `rows=${ours.length} wonV2=${wonV2} wonLegacy=${wonLegacy}`, "MAJOR");
    const offenders = ours.filter((o) => PII.some((s) => s && j(o.payload).includes(s))).map((o) => o.type);
    chk("C1.8-X8.1", "PDPA: NO crm.* / custom.record.* / team.updated / forms.submission.received payload written during the run carries a phone, e-mail, name, deal title, record title, form answer or note text of our fixtures",
      ours.length > 0 && offenders.length === 0, "none", `rows=${ours.length} offenders=${[...new Set(offenders)].join(",") || "-"}`);
    const shape = ours.flatMap((o) => payloadProblems(o.payload).filter((p) => !p.startsWith("pii:")).map((p) => `${o.type}:${p}`));
    chk("C1.8-X8.2", "payloads are ids/keys only: no PII-named key (name/phone/email/title/note/body/summary/…) and no prose value (spaces · Thai · '@' · > 64 chars)",
      ours.length > 0 && shape.length === 0, "ids only", cut([...new Set(shape)].slice(0, 6).join(" | "), 240), "MAJOR");
    const ops = (await P.opsEvent.findMany({ where: { tenantId: { in: MY } } })) as Any[];
    const opsBad = ops.filter((o) => PII.some((s) => s && j({ m: o.message, d: o.detail }).includes(s)));
    chk("C1.8-X8.3", "no OpsEvent of our tenants (incl. the compose WARNs) contains a phone, e-mail or name of our fixtures", opsBad.length === 0, "none", `ops=${ops.length} bad=${opsBad.length} ${cut(opsBad[0]?.message, 80)}`, "MAJOR");
  }
} catch (e) {
  chk("C1.8-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — triggers first, then every row of the throwaway tenants (4 passes), systems/units/tenants, users.
  // ═════════════════════════════════════════════════════════════════════════════
  await dropTriggers();
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
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
        const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[];
        const n = Number(r?.[0]?.n ?? 0);
        if (n > 0) left.push(`${t}=${n}`);
      }
      const tenants = await P.tenant.count({ where: { id: { in: ids } } });
      const users = USERS.length ? await P.user.count({ where: { id: { in: USERS } } }) : 0;
      const trig = ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname LIKE '${TRIG}%'`).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0;
      const fn = ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_proc WHERE proname = '${TRIG}_fn'`).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0;
      chk("C1.8-CLEAN", "the oracle gives the QC database back exactly as found — every throwaway tenant and every row it owned, the throwaway users and the test triggers/function are gone",
        left.length === 0 && tenants === 0 && users === 0 && Number(trig) === 0 && Number(fn) === 0, "0 rows · 0 tenants · 0 users · 0 triggers",
        `${left.join(" · ") || "-"} · tenants=${tenants} users=${users} trig=${trig} fn=${fn}`, "MAJOR");
    } catch (e) {
      chk("C1.8-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C1.8: ${passed}/${total} · outbound fetch stubbed ${FETCHES.length}×`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
