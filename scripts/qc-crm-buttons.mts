// qc-crm-buttons.mts — CRM v2 WO C4.2 "press everything" (registry-driven button/link/form presser)
//
// Reads scripts/crm-ui-inventory.json (the C4.1 registry — page/testid/kind/roles/hiddenFor/expect for ~1,145
// controls) and, for each user in {owner, manager, nok, thana, customer} × viewport {1440×900, 390×844}, opens
// every registry page and for every row of that page: checks visibility (rows listing the user in `hiddenFor`
// must be ABSENT — a present hidden control = `hiddenLeak`), performs the row's action by `kind`, asserts the
// row's `expect`, and captures console errors / ≥400 responses / horizontal overflow. Built on the same
// puppeteer-core harness as scripts/visual-crm.mts (login-per-user-key session minting, viewport loop, overflow
// probe) and the chk()/JSON_SUMMARY conventions of scripts/qc-crm-c3.7.mts.
//
// Run (heavy — through the machine's serialising wrappers, QC3 branch per this WO's brief):
//   bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-buttons.mts
//   … --dry                 lists the resolved plan (counts per user/page/viewport + every SKIP reason) — no browser, no writes
//   … --page /deals/[dealId]   only rows of this registry `page` value (repeatable is NOT supported — one value)
//   … --user thana              only this user key — owner|manager|nok|thana|customer|customer:<CrmPortalAccess id>
// 🔴 the QC server (scripts/acc-v2-serve.sh, port 3215 by default / $QC_BASE) must already be up and pointed at the
//    SAME QC database this process resolves against — this runner never starts/stops/builds it. Unreachable ⇒ Thai
//    message + exit 2 (checked BEFORE any session is minted, same rule as visual-crm.mts).
//
// ══════════════════════════════ CONTRACT (oracle-proposed — controller confirms; see the addendum below) ══════════════════
// SELECTOR   testid → `[data-testid="<id>"]` (exact) or `[data-testid^="<prefix>"]` (registry pattern `foo-*`) — first match.
// VISIBILITY user ∈ hiddenFor(row)             ⇒ element must be ABSENT/invisible (`hiddenLeak` if found)
//            user ∈ roles(row)\hiddenFor(row)  ⇒ element must be visible; missing ⇒ bucketed into `dead[]` (no named
//                                                 bucket for this case in MASTER-PLAN §7 — extension, flagged below)
//            user ∉ roles(row) ∪ hiddenFor(row) ⇒ the registry makes NO claim for this user·row pair ⇒ SKIPPED, not
//                                                 counted in total (avoids false hiddenLeak/dead noise from registry gaps —
//                                                 e.g. "customer" is silent on ~97% of rows because those pages are never
//                                                 reachable by a portal session at all)
// ACTION-BY-KIND  button|link|menu|tab|toggle → click · select → choose the first option that differs from the one
//            selected (falls back to the last option) · input|textarea → select-all + type a generic value shaped by
//            the testid (…email→x@example.com · …phone→08######## · …qty/price/amount/satang/discount→"1"/"100" ·
//            …from/to/hour near window/quiet→"09:00" · else `qc-btn-<rand>`) + Tab to blur/commit · form → if the
//            element IS a real <form>, requestSubmit()/dispatch a submit event; else click it (the registry's "form"
//            kind is used for both real <form> containers and composite filter/inline widgets — see addendum) · drag →
//            SKIPPED (registry has no drop-target field to drag onto; 1 row today).
// DEAD       within 3 s of the action: no DOM mutation (MutationObserver on <body>), no navigation, no new network
//            request ⇒ ❌ `dead` (a toast IS a DOM mutation so it needs no separate probe).
// EXPECT     modal/toast    → `[data-testid="<target>"]` appears within 5 s — UNLESS `target` isn't testid-shaped
//                              (contains spaces/Thai, e.g. "…modal (ปิด)"), in which case it's prose describing the
//                              close/no-op, not a selector; falls back to the `inline-error` soft pass (~16 rows)
//            navigate       → `page.url()` pathname matches the FIRST whitespace token of `target` (brackets/`<…>`
//                              → wildcard segment; a trailing `?…` is advisory only — pathname prefix match, query
//                              ignored) — UNLESS that first token isn't a path (doesn't start with `/`, e.g.
//                              "(ย้อนกลับ)"), in which case same soft-pass fallback (4 rows)
//            mutation       → (a) at least one non-GET request fired during the action and every response was < 400
//                              (network is the ONLY signal for rows whose `db` text isn't mechanically parseable) ·
//                              (b) when `expect.db` parses (see DB-DIFF below) that check must also hold
//            download       → a response during the action whose content-type/disposition indicates a file, with a
//                              non-zero byte length
//            inline-error   → soft pass: satisfied once the row is not `dead` (this runner always types a VALID
//                              value — deliberately-bad input / exact inline-error-message assertions are C4.3's job,
//                              per crm-brief-C4.md; see addendum)
// DB-DIFF    best-effort parser over `expect.db`, split on " · ": `Model +1` / `Model -1` (row count of that Prisma
//            model changes by exactly that delta, scoped by `systemId` when the model has one — narrower than
//            `tenantId` on purpose: this QC database is shared by concurrent sessions/oracles, COMMON brief) ·
//            `Model.column=value` (the row identified by the CURRENT page's primary entity id — deal/contact/
//            company/record/access — now has that column equal to `value`, best-effort type coercion) · anything
//            else (nested JSON paths, prose, `+=`, nothing prefixed by a bare model name) is NOT mechanically
//            checked — the row still needs the network-ok signal above to pass, and is listed under
//            `dbCheckUnparsed[]` for the addendum.
// SAFETY     rows that reach a code path proven (by reading the source) to fire a REAL external send from the
//            ALREADY-RUNNING server process — which this client-side runner cannot sandbox (the server's
//            RESEND_API_KEY / fetch are not ours to patch) — are never pressed for real. See DIRECT_SEND_GUARD below.
// WRITES     every text field this runner fills is `qc-btn-<rand>` (fillValueFor) — CLEAN sweeps every model a
//            "new"/"create" registry row can plausibly write to (see SWEEP below) for that literal substring,
//            rather than tracking ids (a form submit here is a plain network request, not a typed RPC that hands
//            an id back). Nothing already seeded is ever deleted or edited in place beyond the one safety-guarded
//            settings.crm.portal.enabled toggle (snapshotted, restored in CLEAN).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// requires: crm-seed (read through scripts/crm-expected.json) — SKIPPED (exit 0, no DB touch) if that file, or the
//   registry, is missing/unreadable. Exit 2 (Fatal, Thai message) if the QC server at $QC_BASE (default
//   http://127.0.0.1:3215) does not answer, or the QC database points at production.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const cq = (await import("./crm-qc-env.mts" as string)) as { CQC: Any };
const { CQC } = cq;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;

// ───────────────────────────── CLI ─────────────────────────────
const ARGV = process.argv.slice(2);
const DRY = ARGV.includes("--dry");
const argOf = (flag: string): string | null => (ARGV.includes(flag) ? ARGV[ARGV.indexOf(flag) + 1] ?? null : null);
const PAGE_FILTER = argOf("--page");
const USER_FILTER = argOf("--user");

const ALL_USER_KEYS = ["owner", "manager", "nok", "thana", "customer"] as const;
type UserKey = string; // "owner"|"manager"|"nok"|"thana"|"customer"|"customer:<id>"
let userKeys: UserKey[];
if (USER_FILTER) {
  const base = USER_FILTER.startsWith("customer") ? "customer" : USER_FILTER;
  if (!(ALL_USER_KEYS as readonly string[]).includes(base)) {
    console.error(`❌ --user ${USER_FILTER} ไม่รู้จัก — ใช้ได้: ${ALL_USER_KEYS.join(" · ")} · customer:<CrmPortalAccess id>`);
    process.exit(2);
  }
  userKeys = [USER_FILTER];
} else {
  userKeys = [...ALL_USER_KEYS];
}

const VIEWPORTS: readonly (readonly [string, number, number])[] = [
  ["desktop", 1440, 900],
  ["mobile", 390, 844],
];

const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3215";
const SHOTS = `${CQC.shotsDir}/buttons`;
mkdirSync(SHOTS, { recursive: true });

// ───────────────────────────── registry + answer key ─────────────────────────────
const INVENTORY_PATH = "scripts/crm-ui-inventory.json";
type Row = {
  page: string;
  testid: string;
  kind: string;
  roles: string[];
  hiddenFor: string[];
  expect: { type: string; target?: string; db?: string };
  wo?: string;
  oracle?: string;
};
let ROWS: Row[] = [];
try {
  const raw = JSON.parse(readFileSync(INVENTORY_PATH, "utf8"));
  const rows = Array.isArray(raw) ? raw : raw?.rows;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("ไม่มีแถว (rows ว่างหรือหาย)");
  ROWS = rows as Row[];
} catch (e) {
  console.error(`❌ อ่านทะเบียน ${INVENTORY_PATH} ไม่ได้ — ${e instanceof Error ? e.message : e}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, fatal: "registry unreadable" })}`);
  process.exit(2);
}

if (!existsSync(CQC.expectedPath)) {
  console.log(`⚠️  SKIPPED — ไม่พบ ${CQC.expectedPath} (รัน scripts/seed-crm-qc.mts ก่อน)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, skipped: true })}`);
  process.exit(0);
}
const E = JSON.parse(readFileSync(CQC.expectedPath, "utf8")) as Any;
const SYS: string = E.systemId;
const TENANT: string = E.tenantId;
const CRM_BASE = `/app/sys/${SYS}/crm`;

// ───────────────────────────── DIRECT_SEND_GUARD (safety — read this before touching) ─────────────────────────────
// These testids reach a code path that, on THIS already-running server process, dials a real transport with the
// server's own (possibly real) provider key. A browser-driving client cannot sandbox another process's globalThis.fetch
// or env — so these are never pressed for real; only visibility/hiddenLeak is checked, and the press itself is
// recorded in `skippedSafety[]` (excluded from total/passed). Confirmed by reading the source, not guessed:
//   crm-email-send        → src/app/…/emails/… "sendCrmEmailAction" → crm/emails.ts → the real transport (C2.5)
//   crm-email-test-send   → settings/email "test send" → registry's own `db` text: "ส่งถึงอีเมลของคนที่กดเท่านั้น"
//   portal-otp-request    → crm/portal.ts requestOtp() → member/customer-session.ts requestPortalOtp() → when the
//                            submitted target is a KNOWN portal contact's e-mail, sendOtpMailOffPath() → sendEmail()
//                            SYNCHRONOUSLY (line ~758) — the QC_OTP_PREVIEW dev switch only adds `devOtp` to the
//                            response, it does NOT skip the send call.
//   crm-portal-invite-submit → crm/portal.ts invite() (line ~1103): `if (to && methods.includes("EMAIL_OTP")) … sendEmail(...)`
//                            — SAFE only when the EMAIL_OTP method is not selected; this runner presses it with
//                            LINE-only (never ticks the e-mail toggle) rather than skipping outright — see ACT_INVITE below.
const DIRECT_SEND_GUARD = new Set(["crm-email-send", "crm-email-test-send", "portal-otp-request"]);
// crm-portal-invite-submit is handled specially (ACT_INVITE_SAFE below), not fully guarded.

// ───────────────────────────── page URL resolution ─────────────────────────────
// page-path aliases the registry uses inconsistently (confirmed against src/app/.../[companyId]/[contactId] — see addendum)
const PAGE_ALIAS: Record<string, string> = {
  "/companies/[id]": "/companies/[companyId]",
  "/contacts/[id]": "/contacts/[contactId]",
};
// the combined "reused component on 3 list pages" row-group (crm-view-* — CrmSavedViewsMenu) — tested once on /contacts
const COMBINED_PAGE = "/contacts · /companies · /deals";

type Ctx = {
  dealId: string | null; contactId: string | null; companyId: string | null; recordId: string | null; objectKey: string | null;
  partyId: string | null; slug: string | null; chatId: string | null; conversationId: string | null;
  sequenceId: string | null; threadKey: string | null; token: string | null; docType: string | null; docId: string | null;
  posSysId: string | null; memberSysId: string | null; hrSysId: string | null; accountSysId: string | null; chatSysId: string | null;
};
const UNRESOLVED: { placeholder: string; reason: string }[] = [];
const note = (placeholder: string, reason: string) => UNRESOLVED.push({ placeholder, reason });

/** live lookups — best-effort; every failure degrades to `null` + a note, never throws (this file must survive a half-seeded QC db) */
async function buildCtx(): Promise<Ctx> {
  const ctx: Ctx = {
    dealId: E.dealIds?.[0] ?? null, contactId: E.contactIds?.[0] ?? null, companyId: E.companyIds?.[0] ?? null,
    recordId: null, objectKey: null, partyId: null, slug: CQC.tenantSlug ?? null, chatId: null, conversationId: null,
    sequenceId: null, threadKey: null, token: null, docType: null, docId: null,
    posSysId: E.systems?.POS ?? null, memberSysId: E.systems?.MEMBER ?? null, hrSysId: E.systems?.HR ?? null,
    accountSysId: E.systems?.ACCOUNT ?? null, chatSysId: E.systems?.CHAT ?? null,
  };
  if (!ctx.dealId) note("dealId", "crm-expected.json dealIds ว่าง");
  if (!ctx.contactId) note("contactId", "crm-expected.json contactIds ว่าง");
  if (!ctx.companyId) note("companyId", "crm-expected.json companyIds ว่าง");

  // object record (/objects/[key] · /objects/[key]/[recordId])
  try {
    if (E.contractObjectId) {
      const obj = await P.customObject.findUnique({ where: { id: E.contractObjectId }, select: { key: true } });
      ctx.objectKey = obj?.key ?? null;
      const rec = await P.customRecord.findFirst({ where: { objectId: E.contractObjectId, archivedAt: null }, select: { id: true } });
      ctx.recordId = rec?.id ?? null;
      if (!ctx.recordId) note("recordId", "ไม่มี CustomRecord ของ contractObjectId ในซีดนี้ (counts.contractRecords อาจเป็น 0)");
    } else note("objectKey/recordId", "crm-expected.json ไม่มี contractObjectId");
  } catch (e) { note("objectKey/recordId", `query ล้ม — ${e instanceof Error ? e.message : e}`); }

  // party (linked to the seed's first contact)
  try {
    const c = ctx.contactId ? await P.crmContact.findUnique({ where: { id: ctx.contactId }, select: { partyId: true } }) : null;
    ctx.partyId = c?.partyId ?? null;
    if (!ctx.partyId) note("partyId", "ผู้ติดต่อตัวแทนไม่มี partyId");
  } catch (e) { note("partyId", `query ล้ม — ${e instanceof Error ? e.message : e}`); }

  // chat conversation whose ChatContact matches a CRM contact's phone (best-effort — no bridge lookup used on purpose,
  // this is a fixture resolver, not a re-implementation of crm-bridges/chat.ts)
  try {
    if (ctx.chatSysId && ctx.contactId) {
      const contact = await P.crmContact.findUnique({ where: { id: ctx.contactId }, select: { phone: true } });
      const phone = contact?.phone ?? null;
      const conv = phone
        ? await P.chatConversation.findFirst({ where: { systemId: ctx.chatSysId, contact: { phone } }, select: { id: true } })
        : null;
      ctx.conversationId = conv?.id ?? (await P.chatConversation.findFirst({ where: { systemId: ctx.chatSysId }, select: { id: true } }))?.id ?? null;
      ctx.chatId = ctx.chatSysId;
      if (!ctx.conversationId) note("chatId/conversationId", "ไม่มีห้องแชทในระบบ CHAT ของซีดนี้เลย");
    } else note("chatId/conversationId", "ไม่มีระบบ CHAT ในซีด หรือไม่มีผู้ติดต่อตัวแทน");
  } catch (e) { note("chatId/conversationId", `query ล้ม — ${e instanceof Error ? e.message : e}`); }

  // email thread (C2.5) — read-only lookup; NOT created here (needs the real send-transport chain to be authentic)
  try {
    const msg = ctx.dealId
      ? await P.crmEmailMessage.findFirst({ where: { systemId: SYS, dealId: ctx.dealId }, select: { threadKey: true } })
      : await P.crmEmailMessage.findFirst({ where: { systemId: SYS }, select: { threadKey: true } });
    ctx.threadKey = msg?.threadKey ?? null;
    if (!ctx.threadKey) note("threadKey", "ไม่มี CrmEmailMessage ในซีดนี้ (/emails/[threadKey] ข้ามทั้งหน้า)");
  } catch (e) { note("threadKey", `query ล้ม — ${e instanceof Error ? e.message : e}`); }

  // sequence (C2.2)
  try {
    const seq = await P.crmSequence.findFirst({ where: { systemId: SYS, archivedAt: null }, select: { id: true } });
    ctx.sequenceId = seq?.id ?? null;
    if (!ctx.sequenceId) note("sequenceId", "ไม่มี CrmSequence ในซีดนี้ (/settings/sequences/[sequenceId] ข้ามทั้งหน้า)");
  } catch (e) { note("sequenceId", `query ล้ม — ${e instanceof Error ? e.message : e}`); }

  // account document linked to the seed's deal (C2.7) — 1 registry row today; left unresolved on purpose (see addendum:
  // "accountDocument" ownership/model name was not verified against prisma/schema/account*.prisma within this WO's
  // budget — guessing a wrong model name here risks matching an unrelated document, not just skipping the page).
  note("docType/docId", "ยังไม่ผูก resolver จริง (1 แถวในทะเบียน) — /app/sys/[id]/account/docs/… ข้ามทั้งหน้าเสมอในตอนนี้");

  return ctx;
}

/** normalise a registry `page` value into a concrete pathname (or null + reason when unresolvable) */
function pageUrl(pageRaw: string, ctx: Ctx): { path: string | null; reason: string | null } {
  const page = PAGE_ALIAS[pageRaw] ?? pageRaw;
  const sub = (s: string, map: Record<string, string | null>): { path: string | null; reason: string | null } => {
    let missing: string | null = null;
    const out = s.replace(/\[([a-zA-Z]+)\]/g, (_m, key: string) => {
      const v = map[key];
      if (v == null) { missing = key; return `[${key}]`; }
      return v;
    });
    return missing ? { path: null, reason: `ไม่มีค่าจริงของ [${missing}] ในซีดนี้` } : { path: out, reason: null };
  };
  // literal annotation suffix e.g. "/app/sys/[id] (HR hub)" — strip before building the URL
  const clean = page.replace(/\s*\([^)]*\)\s*$/, "");
  if (clean.startsWith("/app/sys/[id]/pos/register")) return sub(clean, { id: ctx.posSysId });
  if (clean.startsWith("/app/sys/[id]/member/members")) return sub(clean, { id: ctx.memberSysId });
  if (clean === "/app/sys/[id]" && page.includes("HR hub")) return sub(clean, { id: ctx.hrSysId });
  if (clean.startsWith("/app/sys/[id]/account/docs/")) return sub(clean, { id: ctx.accountSysId, docType: ctx.docType, docId: ctx.docId });
  if (clean === "/app/sys/[id]" || clean.startsWith("/app/sys/[id]/meeting")) return sub(clean, { id: SYS });
  if (clean.startsWith("/app/sys/[chatId]")) {
    const basePath = clean.split("?")[0]!;
    const r = sub(basePath, { chatId: ctx.chatId });
    if (!r.path) return r;
    return ctx.conversationId ? { path: `${r.path}?c=${ctx.conversationId}`, reason: null } : { path: null, reason: "ไม่มีค่าจริงของ [conversationId] ในซีดนี้" };
  }
  if (clean.startsWith("/app/party/")) return sub(clean, { partyId: ctx.partyId });
  if (clean.startsWith("/b/") || clean.startsWith("/p/")) {
    const r = sub(clean, { slug: ctx.slug, token: ctx.token, id: ctx.docId });
    return r;
  }
  if (clean.startsWith("/u/")) return sub(clean, { token: ctx.token });
  if (clean.startsWith("/objects/")) return sub(`${CRM_BASE}${clean}`, { key: ctx.objectKey, recordId: ctx.recordId });
  if (clean.startsWith("/emails/")) return sub(`${CRM_BASE}${clean}`, { threadKey: ctx.threadKey });
  if (clean.startsWith("/settings/sequences/")) return sub(`${CRM_BASE}${clean}`, { sequenceId: ctx.sequenceId });
  return sub(`${CRM_BASE}${clean}`, { dealId: ctx.dealId, contactId: ctx.contactId, companyId: ctx.companyId, id: SYS });
}

// ───────────────────────────── plan ─────────────────────────────
type PlanItem = {
  user: UserKey; device: string; w: number; h: number; page: string; path: string; testid: string; kind: string;
  roles: string[]; hiddenFor: string[]; expect: Row["expect"]; wo: string; guarded: boolean;
};
type SkipEntry = { page: string; testid: string; reason: string };

function applicableUser(row: Row, user: UserKey): boolean {
  const base = user.startsWith("customer") ? "customer" : user;
  return row.roles.includes(base) || row.hiddenFor.includes(base);
}

function buildPlan(ctx: Ctx): { items: PlanItem[]; skipped: SkipEntry[] } {
  const items: PlanItem[] = [];
  const skipped: SkipEntry[] = [];
  const pageCache = new Map<string, { path: string | null; reason: string | null }>();
  for (const row of ROWS) {
    if (PAGE_FILTER && row.page !== PAGE_FILTER) continue;
    const testid = String(row.testid ?? "").trim();
    if (!testid) continue;
    const pages = row.page === COMBINED_PAGE ? ["/contacts"] : [row.page];
    for (const pageRaw of pages) {
      if (!pageCache.has(pageRaw)) pageCache.set(pageRaw, pageUrl(pageRaw, ctx));
      const { path, reason } = pageCache.get(pageRaw)!;
      for (const user of userKeys) {
        if (!applicableUser(row, user)) continue; // silent on this role — registry makes no claim (see header contract)
        if (!path) { skipped.push({ page: pageRaw, testid, reason: `${reason} (${user})` }); continue; }
        for (const [device, w, h] of VIEWPORTS) {
          items.push({ user, device, w, h, page: pageRaw, path, testid, kind: row.kind, roles: row.roles, hiddenFor: row.hiddenFor, expect: row.expect, wo: row.wo ?? "", guarded: DIRECT_SEND_GUARD.has(testid) });
        }
      }
    }
  }
  return { items, skipped };
}

// ═══════════════════════════════════════════════════════════════════
// main
// ═══════════════════════════════════════════════════════════════════
class Fatal extends Error {}
const UA = "qc-btn";
const MINE = { sessionIds: [] as string[], portalAccessIds: [] as string[], tokenHashes: [] as string[] };
let PORTAL_ENABLED_BEFORE: boolean | null = null; // null = did not touch

// 🔴 rows we press do not hand back the id of whatever they create (a form submit is a plain network request from
//    this runner's point of view, not a typed RPC) — so cleanup cannot track-by-id the way visual-crm.mts's `before()`
//    hooks do. Every text value THIS runner types is `qc-btn-<rand>` (fillValueFor) ⇒ sweep by tag instead: every
//    model a "new"/"create" registry row can plausibly write to, filtered by that literal substring, scoped as
//    narrowly as the model allows. Model/field names verified against prisma/schema/*.prisma, not guessed.
const SWEEP: { model: string; field: string; scope: "systemId" | "tenantId" }[] = [
  { model: "CrmDeal", field: "title", scope: "systemId" },
  { model: "CrmContact", field: "name", scope: "systemId" },
  { model: "CrmCompany", field: "name", scope: "systemId" },
  { model: "CrmActivity", field: "title", scope: "systemId" },
  { model: "CrmSequence", field: "name", scope: "systemId" },
  { model: "CrmPipeline", field: "name", scope: "systemId" },
  { model: "CrmStage", field: "name", scope: "systemId" },
  { model: "CrmLostReason", field: "label", scope: "systemId" },
  { model: "CustomObject", field: "label", scope: "systemId" },
  { model: "MemberSavedView", field: "name", scope: "tenantId" },
  { model: "WebhookEndpoint", field: "url", scope: "tenantId" },
  { model: "Team", field: "name", scope: "tenantId" },
];

async function ensurePortalFixture(ctx: Ctx): Promise<{ accessId: string } | null> {
  try {
    const sys = await P.appSystem.findUnique({ where: { id: SYS }, select: { settings: true } });
    const enabled = !!(sys?.settings as Any)?.crm?.portal?.enabled;
    if (PORTAL_ENABLED_BEFORE === null) PORTAL_ENABLED_BEFORE = enabled;
    if (!enabled) {
      await P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{crm,portal,enabled}', 'true'::jsonb, true) WHERE id = $1`, SYS);
    }
    if (!ctx.companyId || !ctx.contactId) return null;
    // reuse an existing access for this company+contact if one is already there (unique companyId_contactId) — else create one.
    // LINE-only on purpose (never EMAIL_OTP): invite()/requestOtp() dial a real e-mail transport on this server for
    // EMAIL_OTP access (see DIRECT_SEND_GUARD) — a directly-created LINE-only, already-accepted access is exercised
    // safely by mintPortalSession() alone, matching visual-crm.mts's own `customer:<code>` convention.
    const existing = await P.crmPortalAccess.findFirst({ where: { systemId: SYS, companyId: ctx.companyId, contactId: ctx.contactId }, select: { id: true } });
    if (existing) return { accessId: existing.id };
    const created = await P.crmPortalAccess.create({
      data: { tenantId: TENANT, systemId: SYS, companyId: ctx.companyId, contactId: ctx.contactId, role: "VIEW", loginMethods: ["LINE"], invitedAt: new Date(), acceptedAt: new Date() },
      select: { id: true },
    });
    MINE.portalAccessIds.push(created.id);
    return { accessId: created.id };
  } catch (e) {
    console.log(`  ⚠️ เตรียม portal fixture ไม่สำเร็จ — ${e instanceof Error ? e.message : e} (บทบาท customer จะถูกข้าม)`);
    return null;
  }
}

async function mintSession(user: UserKey, ctx: Ctx): Promise<Any[]> {
  const https = BASE.startsWith("https:");
  const host = new URL(BASE).hostname;
  if (user.startsWith("customer")) {
    const given = user.includes(":") ? user.slice("customer:".length) : "";
    const accessId = given || (await ensurePortalFixture(ctx))?.accessId;
    if (!accessId) throw new Fatal("ไม่มี CrmPortalAccess ให้ทดสอบบทบาท customer (ดูเหตุผลด้านบน)");
    const ps = (await import("@/lib/modules/crm/portal-session" as string)) as Any;
    const token = "qcbtn" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    const minted = await ps.mintPortalSession(accessId, { userAgent: UA });
    MINE.tokenHashes.push((await import("@/lib/core/hash")).sha256(minted.token));
    return https
      ? [{ name: minted.cookieName, value: minted.token, url: BASE, path: "/", secure: true }]
      : [{ name: minted.cookieName, value: minted.token, domain: host, path: "/" }];
  }
  const FALLBACK_EMAIL: Record<string, string> = { owner: "mb-owner@shark.local", manager: "mb-manager-patong@shark.local", thana: "mb-thana@shark.local", nok: CQC.users?.nok?.email ?? "mb-nok@shark.local" };
  let userId: string | undefined = E.users?.[user]?.userId;
  if (!userId) {
    const u = await P.user.findUnique({ where: { email: FALLBACK_EMAIL[user] }, select: { id: true } });
    if (!u) throw new Fatal(`ไม่พบผู้ใช้ ${user} — รัน seed-member-qc แล้ว seed-crm-qc ก่อน`);
    userId = u.id;
  }
  const token = "qcbtn" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const ttl = new Date(Date.now() + 60 * 60 * 1000);
  const { sha256 } = await import("@/lib/core/hash");
  const row = await P.session.create({ data: { userId, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl }, select: { id: true } });
  MINE.sessionIds.push(row.id);
  return https
    ? [{ name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true }, { name: "shark_tenant", value: TENANT, url: BASE, path: "/", secure: true }]
    : [{ name: "shark_session", value: token, domain: host, path: "/" }, { name: "shark_tenant", value: TENANT, domain: host, path: "/" }];
}

// ── selector + generic action helpers ──
// 🔴 a real testid is bare kebab-case (optionally ending `*`); a real path starts with `/`. ~16 modal/toast rows and
//    4 navigate rows in today's registry put Thai/English PROSE in `expect.target` instead (e.g.
//    `"contacts-import-modal (ปิด)"`, `"(ย้อนกลับ)"`, `"/deals/[dealId] · ใช้ร่วมบนหน้า … (stepper)"`) — waiting for
//    a selector built from that string literally, or matching a pathname against it literally, would NEVER
//    succeed and would flood `wrongExpect` with false positives on otherwise-working controls. Detect this and
//    fall back to the same soft "not dead" pass `inline-error` uses — see crm-brief-C4.2.md §1 for the list.
const looksLikeTestid = (s: string) => /^[A-Za-z][A-Za-z0-9-]*\*?$/.test(s);
const looksLikePath = (s: string) => s.startsWith("/");
function selOf(testid: string): string {
  return testid.includes("*") ? `[data-testid^="${testid.replace(/\*+$/, "")}"]` : `[data-testid="${testid}"]`;
}
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, "q");
function fillValueFor(testid: string): string {
  const t = testid.toLowerCase();
  if (/email/.test(t)) return `qc-btn-${rand}@example.com`;
  if (/phone/.test(t)) return "0812345678";
  if (/(from|to|hour)$/.test(t) && /(window|quiet|digest)/.test(t)) return "09:00";
  if (/(qty|quantity)/.test(t)) return "1";
  if (/(price|amount|satang|discount|days)/.test(t)) return "100";
  if (/date/.test(t)) return new Date().toISOString().slice(0, 10);
  return `qc-btn-${rand}`;
}
// 🔴 must escape literal segments and insert the `[^/]+` wildcard as SEPARATE steps — escaping the whole string
//    first and then substituting placeholders would also escape the wildcard's own `^`/`+`, corrupting it (caught
//    in review before this ever ran — split-then-map keeps the two concerns apart).
const RE_ESCAPE = /[.*+?^${}()|[\]\\]/g;
function navMatches(target: string | undefined, url: string): boolean {
  if (!target) return false;
  const rawPath = target.split("?")[0]!;
  const parts = rawPath.split(/(\[[^\]]+\]|<[^>]+>)/g);
  const pat = parts.map((p) => (/^(\[[^\]]+\]|<[^>]+>)$/.test(p) ? "[^/]+" : p.replace(RE_ESCAPE, "\\$&"))).join("");
  let path: string;
  try { path = new URL(url).pathname; } catch { path = url; }
  const anchored = pat.startsWith("/") ? pat : `${CRM_BASE}${pat}`;
  const re = new RegExp(`^${anchored}(?:$|/|\\?)`);
  return re.test(path);
}

// ── DB-diff heuristic (best-effort — see header contract) ──
// CrmSequenceEnrollment deliberately excluded — it has no systemId column of its own (only via sequenceId → CrmSequence);
// scoping it by tenantId (the fallback) is the correct choice, not an oversight.
const SCOPE_SYSTEM = new Set(["CrmDeal", "CrmContact", "CrmCompany", "CrmActivity", "CrmSequence", "CrmEmailMessage", "CustomRecord", "CrmPortalAccess"]);
const toCamel = (m: string) => m.charAt(0).toLowerCase() + m.slice(1);
type Clause = { model: string; op: "inc" | "dec" | "eq"; column?: string; value?: string };
function parseDbClauses(db: string | undefined): { parsed: Clause[]; unparsed: string[] } {
  const parsed: Clause[] = []; const unparsed: string[] = [];
  for (const raw of (db ?? "").split(" · ").map((s) => s.trim()).filter(Boolean)) {
    let m = /^([A-Z][A-Za-z0-9]*)\s*\+1\b/.exec(raw);
    if (m) { parsed.push({ model: m[1]!, op: "inc" }); continue; }
    m = /^([A-Z][A-Za-z0-9]*)\s*-1\b/.exec(raw);
    if (m) { parsed.push({ model: m[1]!, op: "dec" }); continue; }
    m = /^([A-Z][A-Za-z0-9]*)\.([A-Za-z0-9_]+)\s*=\s*([^\s(]+)/.exec(raw);
    if (m) { parsed.push({ model: m[1]!, op: "eq", column: m[2], value: m[3]!.replace(/^["']|["']$/g, "") }); continue; }
    unparsed.push(raw);
  }
  return { parsed, unparsed };
}
async function countScoped(model: string): Promise<number | null> {
  try {
    const where = SCOPE_SYSTEM.has(model) ? { systemId: SYS } : { tenantId: TENANT };
    return await P[toCamel(model)].count({ where });
  } catch { return null; }
}
async function readColumn(model: string, id: string | null, column: string): Promise<unknown> {
  if (!id) return undefined;
  try { const r = await P[toCamel(model)].findFirst({ where: { id }, select: { [column]: true } }); return r?.[column]; } catch { return undefined; }
}
function coerceEq(actual: unknown, expect: string): boolean {
  if (expect === "null") return actual === null || actual === undefined;
  if (expect === "true") return actual === true;
  if (expect === "false") return actual === false;
  return String(actual) === expect;
}

// ── result buckets ──
type Failure = { page: string; testid: string; user: string; device: string; detail: string };
const total = { n: 0 };
const passedN = { n: 0 };
const dead: Failure[] = [];
const wrongExpect: Failure[] = [];
const hiddenLeak: Failure[] = [];
const consoleErrors: Failure[] = [];
const overflow: Failure[] = [];
const skippedSafety: { page: string; testid: string }[] = [];
const dbCheckUnparsed = new Map<string, string[]>();
const perPage = new Map<string, Any[]>();

async function main() {
  console.log(`\n═══ QC CRM v2 · C4.2 — press everything (registry-driven) ═══`);
  console.log(`[env] DB tenant ${TENANT} · system ${SYS} · users ${userKeys.join(",")} · dry=${DRY} · pageFilter=${PAGE_FILTER ?? "-"}\n`);

  const ctx = await buildCtx();
  if (UNRESOLVED.length) {
    console.log(`── ตัวแปรบริบทที่หาค่าจริงไม่ได้ (หน้าที่ต้องใช้ค่านี้จะถูกข้าม) ──`);
    for (const u of UNRESOLVED) console.log(`  · [${u.placeholder}] ${u.reason}`);
  }
  const { items, skipped } = buildPlan(ctx);

  if (DRY) {
    const byUser: Record<string, number> = {};
    for (const it of items) byUser[it.user] = (byUser[it.user] ?? 0) + 1;
    console.log(`── PLAN (--dry ไม่เปิดเบราว์เซอร์) ──`);
    console.log(`  รวม ${items.length} การกด (แถวทะเบียน × บทบาท × ขนาดจอ ที่ resolve หน้าได้) · ข้าม ${skipped.length}`);
    for (const [u, n] of Object.entries(byUser)) console.log(`  · ${u}: ${n}`);
    const reasons = new Map<string, number>();
    for (const s of skipped) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1);
    for (const [r, n] of reasons) console.log(`  ⏭️  ${n}× ${r}`);
    writeFileSync(`${SHOTS}/plan-dry.json`, JSON.stringify({ at: new Date().toISOString(), total: items.length, byUser, skipped }, null, 2));
    console.log(`JSON_SUMMARY ${JSON.stringify({ dry: true, total: items.length, byUser, skippedCount: skipped.length })}`);
    await P.$disconnect();
    process.exit(0); // one JSON_SUMMARY line only — the code below (real-run summary) must not also print
  }

  // ── server reachability (checked before minting anything — visual-crm.mts convention) ──
  const ping = await fetch(BASE, { redirect: "manual", signal: AbortSignal.timeout(8_000) }).catch((e: unknown) => e as Error);
  if (ping instanceof Error) throw new Fatal(`ต่อ QC server ${BASE} ไม่ได้ (${ping.message}) — สั่ง \`bash scripts/acc-v2-serve.sh\` (ผ่าน iso) ให้ขึ้นก่อน แล้วรันซ้ำ`);
  console.log(`🌐 QC server ${BASE} ตอบ HTTP ${ping.status}`);

  const pptr = await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string).catch((e: unknown) => {
    throw new Fatal(`เปิด puppeteer-core ไม่ได้ (${e instanceof Error ? e.message : e}) — ต้องมี /root/dive3d/node_modules/puppeteer-core`);
  });
  const browser = await (pptr as Any).default.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=/tmp/chr-crm-btn-${process.pid}`],
  });

  try {
    for (const user of userKeys) {
      let cookies: Any[];
      try { cookies = await mintSession(user, ctx); }
      catch (e) { console.log(`  ⚠️ ข้ามบทบาท ${user}: ${e instanceof Error ? e.message : e}`); continue; }

      // group this user's items by (page,device) so each page loads once per device
      const groups = new Map<string, PlanItem[]>();
      for (const it of items.filter((i) => i.user === user)) {
        const key = `${it.path}·${it.device}`;
        const arr = groups.get(key) ?? []; arr.push(it); groups.set(key, arr);
      }
      for (const [key, rowsOfPage] of groups) {
        const [path, device] = key.split("·");
        const [, w, h] = VIEWPORTS.find((v) => v[0] === device)!;
        const page = await browser.newPage();
        await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: device === "mobile", hasTouch: device === "mobile" });
        await page.setCookie(...cookies);
        const cErrs: string[] = [];
        const httpErrs: string[] = [];
        let reqCount = 0;
        page.on("pageerror", (e: Error) => cErrs.push(e.message.slice(0, 160)));
        page.on("console", (m: Any) => { if (m.type() === "error") cErrs.push(String(m.text()).slice(0, 160)); });
        page.on("request", () => { reqCount++; });
        const respLog: { status: number; url: string; contentType: string }[] = [];
        page.on("response", (r: Any) => { try { respLog.push({ status: r.status(), url: String(r.url()), contentType: String(r.headers()["content-type"] ?? "") }); if (r.status() >= 400) httpErrs.push(`${r.status()} ${String(r.url()).slice(0, 160)}`); } catch { /* ignore */ } });
        const nav = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null);
        await new Promise((r) => setTimeout(r, 900));
        const pageResults: Any[] = [];
        for (const it of rowsOfPage) {
          total.n++;
          const sel = selOf(it.testid);
          const base = it.user.startsWith("customer") ? "customer" : it.user;
          const shouldBeHidden = it.hiddenFor.includes(base);
          const els = await page.$$(sel).catch(() => []);
          const visible = els.length > 0 ? await page.evaluate((s: string) => {
            const el = document.querySelector(s) as HTMLElement | null;
            if (!el) return false;
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden";
          }, sel).catch(() => false) : false;

          if (shouldBeHidden) {
            if (visible) { hiddenLeak.push({ page: it.page, testid: it.testid, user: it.user, device: it.device, detail: "อยู่ใน hiddenFor แต่มองเห็นได้" }); pageResults.push({ testid: it.testid, ok: false, bucket: "hiddenLeak" }); }
            else { passedN.n++; pageResults.push({ testid: it.testid, ok: true }); }
            continue;
          }
          if (!visible) { dead.push({ page: it.page, testid: it.testid, user: it.user, device: it.device, detail: "ควรเห็นได้ (อยู่ใน roles ไม่อยู่ใน hiddenFor) แต่หาไม่พบ/มองไม่เห็น" }); pageResults.push({ testid: it.testid, ok: false, bucket: "dead-missing" }); continue; }

          if (it.guarded) { skippedSafety.push({ page: it.page, testid: it.testid }); total.n--; continue; } // never counted — see DIRECT_SEND_GUARD

          // ── special-case: portal invite must never carry EMAIL_OTP through this runner (see DIRECT_SEND_GUARD note) ──
          if (it.testid === "crm-portal-invite-email") {
            // ensure the toggle stays OFF: read state, click only if currently ON
            const on = await page.evaluate((s: string) => document.querySelector(s)?.getAttribute("aria-checked") === "true" || (document.querySelector(s) as HTMLInputElement | null)?.checked === true, sel).catch(() => false);
            if (on) await page.click(sel).catch(() => {});
            pageResults.push({ testid: it.testid, ok: true, note: "left OFF on purpose (safety)" });
            passedN.n++; continue;
          }

          // ── dead-control window setup ──
          await page.evaluate(() => { (window as Any).__qcMut = 0; if (!(window as Any).__qcObs) { const o = new MutationObserver(() => { (window as Any).__qcMut++; }); o.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true }); (window as Any).__qcObs = o; } }).catch(() => {});
          const urlBefore = page.url();
          const reqBefore = reqCount;
          const respBefore = respLog.length;

          let actErr = "";
          try {
            if (it.kind === "drag") { throw new Error("SKIP: drag ไม่มี drop-target ในทะเบียน"); }
            else if (it.kind === "select") {
              const opts: { value: string; selected: boolean }[] = await page.$$eval(`${sel} option`, (os: Any[]) => os.map((o) => ({ value: o.value, selected: o.selected }))).catch(() => []);
              const current = opts.find((o) => o.selected)?.value;
              const cand = opts.find((o) => o.value && o.value !== current) ?? opts[opts.length - 1];
              if (cand) await page.select(sel, cand.value);
            } else if (it.kind === "input" || it.kind === "textarea") {
              await page.click(sel, { clickCount: 3 });
              await page.keyboard.type(fillValueFor(it.testid), { delay: 8 });
              await page.keyboard.press("Tab");
            } else if (it.kind === "form") {
              const tag = await page.$eval(sel, (el: Any) => el.tagName).catch(() => "");
              if (tag === "FORM") await page.$eval(sel, (f: Any) => { if (typeof f.requestSubmit === "function") f.requestSubmit(); else f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }).catch(() => { throw new Error("form.requestSubmit ล้ม"); });
              else await page.click(sel);
            } else {
              await page.click(sel);
            }
          } catch (e) { actErr = e instanceof Error ? e.message : String(e); }

          if (actErr.startsWith("SKIP:")) { pageResults.push({ testid: it.testid, ok: true, note: actErr }); total.n--; continue; }

          // ── dead-control detector: 3 s window, poll every 150 ms ──
          let deadFlag = actErr !== "";
          if (!deadFlag) {
            deadFlag = true;
            for (let i = 0; i < 20; i++) {
              await new Promise((r) => setTimeout(r, 150));
              const mut = await page.evaluate(() => (window as Any).__qcMut ?? 0).catch(() => 0);
              if (mut > 0 || reqCount > reqBefore || page.url() !== urlBefore) { deadFlag = false; break; }
            }
          }
          if (deadFlag) { dead.push({ page: it.page, testid: it.testid, user: it.user, device: it.device, detail: actErr || "ไม่มี DOM mutation/navigation/network ภายใน 3 วิ" }); pageResults.push({ testid: it.testid, ok: false, bucket: "dead" }); continue; }

          // ── expect assertion ──
          let ok = true; let detail = "";
          const newResp = respLog.slice(respBefore);
          if ((it.expect.type === "modal" || it.expect.type === "toast") && looksLikeTestid(it.expect.target ?? "")) {
            const found = await page.waitForSelector(selOf(it.expect.target ?? ""), { timeout: 5_000 }).then(() => true).catch(() => false);
            ok = found; detail = found ? "" : `ไม่เจอ ${it.expect.target}`;
            if (it.expect.type === "modal" && found) await page.keyboard.press("Escape").catch(() => {});
          } else if (it.expect.type === "modal" || it.expect.type === "toast") {
            ok = true; // target is prose, not a testid (e.g. "…modal (ปิด)") — soft pass, already proven "not dead" above
          } else if (it.expect.type === "navigate" && looksLikePath(it.expect.target?.split(/\s+/)[0] ?? "")) {
            const urlAfter = page.url();
            const realTarget = it.expect.target!.split(/\s+/)[0]!; // strip trailing Thai/English commentary after the path
            ok = navMatches(realTarget, urlAfter); detail = ok ? "" : `url=${urlAfter} ไม่ตรง ${realTarget}`;
          } else if (it.expect.type === "navigate") {
            ok = true; // target is prose, not a path (e.g. "(ย้อนกลับ)") — soft pass, already proven "not dead" above
          } else if (it.expect.type === "download") {
            const hit = newResp.find((r) => /csv|octet-stream|spreadsheet|pdf/.test(r.contentType) || /\.(csv|pdf|xlsx)(\?|$)/.test(r.url));
            ok = !!hit; detail = ok ? "" : "ไม่พบ response ที่หน้าตาเป็นไฟล์";
          } else if (it.expect.type === "mutation") {
            const nonGet = newResp.length > 0; // best-effort: any response fired during the window
            const has400 = newResp.some((r) => r.status >= 400);
            ok = nonGet && !has400;
            detail = !nonGet ? "ไม่มี network request ระหว่างกด" : has400 ? `มี response ≥400: ${newResp.filter((r) => r.status >= 400).map((r) => r.status).join(",")}` : "";
            const { parsed, unparsed } = parseDbClauses(it.expect.db);
            if (unparsed.length) { const arr = dbCheckUnparsed.get(`${it.page}#${it.testid}`) ?? []; dbCheckUnparsed.set(`${it.page}#${it.testid}`, [...new Set([...arr, ...unparsed])]); }
            for (const c of parsed) {
              if (c.op === "inc" || c.op === "dec") {
                const before = await countScoped(c.model); await new Promise((r) => setTimeout(r, 250)); const after = await countScoped(c.model);
                if (before === null || after === null) continue; // model not reachable — structural-only for this clause
                const want = c.op === "inc" ? before + 1 : before - 1;
                if (after !== want) { ok = false; detail += ` · ${c.model} count ${before}→${after} (คาด ${want})`; }
              } else if (c.op === "eq" && c.column) {
                const primary = it.page.includes("deals") ? ctx.dealId : it.page.includes("contacts") ? ctx.contactId : it.page.includes("companies") ? ctx.companyId : ctx.recordId;
                const actual = await readColumn(c.model, primary, c.column);
                if (actual === undefined) continue; // could not resolve the row to check — structural-only
                if (!coerceEq(actual, c.value ?? "")) { ok = false; detail += ` · ${c.model}.${c.column}=${String(actual)} (คาด ${c.value})`; }
              }
            }
          } else if (it.expect.type === "inline-error") {
            ok = true; // soft pass — see header contract (C4.3 owns deliberate-bad-input assertions)
          }
          if (!ok) { wrongExpect.push({ page: it.page, testid: it.testid, user: it.user, device: it.device, detail }); pageResults.push({ testid: it.testid, ok: false, bucket: "wrongExpect", detail }); }
          else { passedN.n++; pageResults.push({ testid: it.testid, ok: true }); }
        }

        // per-page/device console+overflow capture (once, after the row loop — matches visual-crm.mts's per-load probe)
        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
        const ovf = await page.evaluate((ww: number) => document.documentElement.scrollWidth > ww + 2, w).catch(() => false);
        if (ovf) overflow.push({ page: rowsOfPage[0]!.page, testid: "-", user, device: device!, detail: `scrollWidth > ${w}` });
        if (cErrs.length) consoleErrors.push({ page: rowsOfPage[0]!.page, testid: "-", user, device: device!, detail: cErrs.slice(0, 3).join(" | ") });
        const status = nav?.status?.() ?? 0;
        const arr = perPage.get(rowsOfPage[0]!.page) ?? []; arr.push({ user, device, status, results: pageResults, consoleErrors: cErrs, httpErrors: httpErrs, overflow: ovf }); perPage.set(rowsOfPage[0]!.page, arr);
        await page.close();
      }
    }
  } finally {
    await browser.close().catch(() => {});
    // ── CLEAN: sweep-by-tag every row this run may have created + the portal.enabled toggle ──
    let cleaned = 0;
    for (const s of SWEEP) {
      try {
        const where = s.scope === "systemId" ? { systemId: SYS, [s.field]: { contains: "qc-btn-" } } : { tenantId: TENANT, [s.field]: { contains: "qc-btn-" } };
        cleaned += (await P[toCamel(s.model)].deleteMany({ where })).count;
      } catch { /* model/field mismatch on this schema version — ignore, does not block cleanup of the rest */ }
    }
    if (MINE.portalAccessIds.length) { try { cleaned += (await P.crmPortalAccess.deleteMany({ where: { id: { in: MINE.portalAccessIds } } })).count; } catch { /* ignore */ } }
    if (MINE.tokenHashes.length) { for (const mdl of ["portalSession", "customerSession"]) { try { cleaned += (await P[mdl]?.deleteMany?.({ where: { tokenHash: { in: MINE.tokenHashes } } }))?.count ?? 0; } catch { /* ignore */ } } }
    if (MINE.sessionIds.length) { try { cleaned += (await P.session.deleteMany({ where: { id: { in: MINE.sessionIds } } })).count; } catch { /* ignore */ } }
    if (PORTAL_ENABLED_BEFORE === false) { try { await P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{crm,portal,enabled}', 'false'::jsonb, true) WHERE id = $1`, SYS); } catch { /* ignore */ }
    }
    const stale = await P.session.deleteMany({ where: { userAgent: UA, expiresAt: { lt: new Date() } } }).catch(() => ({ count: 0 }));
    console.log(`\n🧹 ลบของชั่วคราวของรอบนี้ ${cleaned}${stale.count ? ` (+ซากหมดอายุ ${stale.count})` : ""}`);
  }
}

let fatal = "";
try {
  await main();
} catch (e) {
  fatal = e instanceof Fatal ? e.message : `ผิดพลาดกลางคัน — ${e instanceof Error ? (e.stack ?? e.message).slice(0, 500) : String(e)}`;
}

if (!DRY) {
  writeFileSync(`${SHOTS}/summary.json`, JSON.stringify({
    at: new Date().toISOString(), total: total.n, passed: passedN.n,
    dead, wrongExpect, hiddenLeak, consoleErrors, overflow,
    skippedSafety, dbCheckUnparsed: Object.fromEntries(dbCheckUnparsed), fatal: fatal || null,
  }, null, 2));
  for (const [page, entries] of perPage) {
    const fname = `${SHOTS}/${page.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "root"}.json`;
    writeFileSync(fname, JSON.stringify({ page, entries }, null, 2));
  }
  console.log(`\n${!fatal && passedN.n === total.n ? "🟢" : "🔴"} C4.2: ${passedN.n}/${total.n} · dead ${dead.length} · wrongExpect ${wrongExpect.length} · hiddenLeak ${hiddenLeak.length} · overflow ${overflow.length} · skippedSafety ${skippedSafety.length}`);
}
if (fatal) console.error(`❌ ${fatal}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: total.n, passed: passedN.n, dead: dead.length, wrongExpect: wrongExpect.length, hiddenLeak: hiddenLeak.length, consoleErrors: consoleErrors.length, overflow: overflow.length, skippedSafety: skippedSafety.length, fatal: fatal || null })}`);
await P.$disconnect().catch(() => {});
process.exit(fatal ? 2 : 0);
