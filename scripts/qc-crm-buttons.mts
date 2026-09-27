// qc-crm-buttons.mts — CRM v2 WO C4.2 "press everything" (registry-driven button/link/form presser)
//
// Reads scripts/crm-ui-inventory.json (the C4.1 registry — page/testid/kind/roles/hiddenFor/expect/system/query/only/not
// + C4.2's `opener`/`needs`) and, for each user in {owner, manager, nok, thana, customer} × viewport {1440×900, 390×844},
// opens every registry page and for every row of that page: checks visibility (rows listing the user in `hiddenFor`
// must be ABSENT — a present hidden control = `hiddenLeak`), performs the row's action by `kind`, asserts the row's
// `expect`, and captures console errors / ≥400 responses / horizontal overflow.
//
// Run (heavy — one at a time through the machine lock; the QC server must already be up, this runner never builds):
//   env CRM_EXPECTED_PATH=<answer key of the DB the SERVER uses> bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-buttons.mts
//   … --dry                  resolved plan (counts + every SKIP reason + registry opener/needs validation) — no browser, no writes
//   … --page <page>          only rows of this registry `page` value · `--page re:<regex>` = every page matching the regex
//   … --user <key>           owner|manager|nok|thana|customer|customer:<CrmPortalAccess id>
//   … --device desktop|mobile  only this viewport
//   … --discover             OPENER DISCOVERY (C4.2 iteration 1): per page, press every visible "opener-like" row
//                            (modal/ui/menu/tab/toggle — never mutation/navigate/download) on a fresh load, depth ≤ 2, and
//                            record which testids each press reveals → .qc-shots/crm/buttons/discover-<user>.json. Read-only
//                            by construction; the result is merged into the registry's `opener` by hand/script, not live.
// 🔴 CRM_EXPECTED_PATH: the QC server of the MAIN tree reads QC1 — a worktree's own scripts/crm-expected.json may belong
//    to another QC branch. Point it at the answer key of the DB the SERVER reads (same rule as visual-crm.mts --inventory).
//
// ══════════════════════════════ CONTRACT (C4.2 — see ledger/wo-notes/crm-C4.2.md §3) ══════════════════════════════
// STATE      EVERY row starts from a known state: the page is (re)loaded (networkidle2) whenever the previous row left
//            it "dirty" (clicked anything that is not a pure field fill / an opener that passed), the URL differs from
//            the row's page, or the row needs a different opener chain than the one currently open. (Pilot run 1 kept
//            ONE load per page: the first link that navigated made every later row on that page "missing".)
// OPENER     row.opener (string | string[] chain, registry testids, patterns allowed; "<testid>=<value>" = choose that
//            option/type that value — builders reveal fields per chosen value) = controls to press FIRST so the
//            row's control exists (sheet/dialog/menu/tab/row-selection). Each opener is pressed only when neither it
//            nor anything later in the chain/the row itself is already visible (the same row is often inline on
//            desktop but behind a sheet on 390 px). A missing opener ⇒ dead (or skippedNeeds when the row has `needs`).
// VIEWPORT   row.viewport ("desktop"|"mobile") = the control exists in one layout only ⇒ the other viewport is not planned.
// NEEDS      row.needs (text) = data precondition the standard seed may not satisfy (e.g. "ผู้ติดต่อที่มีลำดับติดตาม").
//            Control present ⇒ pressed and asserted as usual; absent ⇒ `skippedNeeds[]` (NOT dead, not in total).
// SELECTOR   exact testid → first VISIBLE match (desktop/mobile twins share a testid) · `*` pattern → first visible match
//            that is actually clickable (button/a[href]/input/select/textarea/[role=button|link|menuitem|tab|switch|
//            checkbox|option]) and not in `not` · `only` expands one row into one item per exact testid.
// ACTION     button|link|menu|tab|toggle → element click (falls back to DOM .click() when the pointer hit-test fails) ·
//            select → first option ≠ current · input|textarea → type a value shaped by the testid + the input's type
//            (date/time/number/datetime-local/color/range set through the native setter + input/change events) ·
//            input[type=file] → CSV fixture for import rows, otherwise skippedSafety (upload = external storage/AI) ·
//            form|filter → requestSubmit() · drag → mouse drag onto the LAST `expect.dropTarget` match ·
//            *-backdrop → click a corner (close handlers check e.target === e.currentTarget).
// PREFILL    before a `mutation` row / `form` row: every EARLIER fill row of the same page + opener chain whose control
//            sits inside the same <form>/dialog as this control is filled if still empty (unchecked toggles ticked) —
//            submit buttons are disabled/refused on an empty form, and the fill rows usually ran before a reload.
// DEAD       click-like rows: within 3 s no DOM mutation, no navigation, no new request, no new tab ⇒ dead.
//            fill rows (input/textarea/select/toggle-as-checkbox): dead ⇔ the value/checked state did not change.
// EXPECT     modal/toast → target (or anyOf) becomes VISIBLE within 6 s · navigate → URL (this tab or a new tab)
//            matches target/anyOf within 8 s (history:back / mailto:* soft) · ui → appears / disappears (3 s) /
//            changes (polled 4 s — debounced search) · download → a file-looking response or new tab · mutation → a
//            non-GET request fired, none ≥400, network settled, parsed `db` count deltas (`Model +1/-1`, counted
//            BEFORE vs AFTER) and literal `Model.col=value` on detail pages hold, `resultTarget` appears ·
//            inline-error → soft (C4.3 owns bad-input assertions).
// SAFETY     DIRECT_SEND_GUARD rows (real e-mail/OTP) are never pressed · crm-portal-invite-email is kept OFF ·
//            CROSS_MODULE_GUARD rows (running document numbers / payroll / POS sale / real AI or storage) are never
//            pressed · all are listed in skippedSafety[] with the reason.
// WRITES     SNAPSHOT/RESTORE: before the first press the runner snapshots every row of SNAP_MODELS for this tenant;
//            after every page×viewport group that sent a non-GET request it restores the snapshot exactly (rows created
//            since are deleted, changed rows are written back, deleted rows are re-created); right after every
//            DESTRUCTIVE row (archive/delete/merge/erase/convert/…) it REPAIRS seeded rows only (keepNew) so the next
//            row sees the seed again while data created earlier in the group survives for the `needs` rows (which
//            run last in their group). Typed values are `qc-btn-<rand>`; the old
//            tag sweep stays as a second net. The DB is serialised by scripts/with-gate-lock.sh for the whole run.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// requires: crm-seed (answer key via CRM_EXPECTED_PATH or scripts/crm-expected.json) — SKIPPED (exit 0, no DB touch)
//   if missing. Exit 2 (Fatal, Thai message) if the QC server at $QC_BASE (default http://127.0.0.1:3215) does not answer.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const cq = (await import("./crm-qc-env.mts" as string)) as { CQC: Any };
const { CQC } = cq;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const { Prisma } = (await import("@prisma/client")) as Any;

// ───────────────────────────── CLI ─────────────────────────────
const ARGV = process.argv.slice(2);
const DRY = ARGV.includes("--dry");
const DISCOVER = ARGV.includes("--discover");
const argOf = (flag: string): string | null => (ARGV.includes(flag) ? ARGV[ARGV.indexOf(flag) + 1] ?? null : null);
const PAGE_FILTER = argOf("--page");
const USER_FILTER = argOf("--user");
const DEVICE_FILTER = argOf("--device");
const pageSelected = (page: string): boolean => {
  if (!PAGE_FILTER) return true;
  if (PAGE_FILTER.startsWith("re:")) return new RegExp(PAGE_FILTER.slice(3)).test(page);
  return page === PAGE_FILTER;
};

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

const VIEWPORTS: readonly (readonly [string, number, number])[] = ([
  ["desktop", 1440, 900],
  ["mobile", 390, 844],
] as const).filter((v) => !DEVICE_FILTER || v[0] === DEVICE_FILTER);

const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3215";
const SHOTS = `${CQC.shotsDir}/buttons`;
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────────── registry + answer key ─────────────────────────────
const INVENTORY_PATH = "scripts/crm-ui-inventory.json";
type Row = {
  page: string;
  testid: string;
  kind: string;
  roles: string[];
  hiddenFor: string[];
  expect: {
    type: string; target?: string; db?: string;
    anyOf?: string[]; resultTarget?: string; state?: "appears" | "disappears" | "changes"; dropTarget?: string; note?: string;
  };
  wo?: string;
  oracle?: string;
  system?: string;
  query?: string;
  alsoOn?: string[];
  only?: string[];
  not?: string[];
  opener?: string | string[]; // C4.2 — control(s) to press first (chain, in order)
  needs?: string; // C4.2 — data precondition the standard seed may not satisfy
  viewport?: "desktop" | "mobile"; // C4.2 — the control exists in ONE layout only (md:hidden cards · sm:hidden stage tabs)
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
const openerOf = (r: Row): string[] => (r.opener == null ? [] : Array.isArray(r.opener) ? r.opener : [r.opener]);

const EXPECTED_PATH = process.env.CRM_EXPECTED_PATH || CQC.expectedPath;
if (!existsSync(EXPECTED_PATH)) {
  console.log(`⚠️  SKIPPED — ไม่พบ ${EXPECTED_PATH} (รัน scripts/seed-crm-qc.mts ก่อน)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, skipped: true })}`);
  process.exit(0);
}
const E = JSON.parse(readFileSync(EXPECTED_PATH, "utf8")) as Any;
const SYS: string = E.systemId;
const TENANT: string = E.tenantId;
const CRM_BASE = `/app/sys/${SYS}/crm`;

// ───────────────────────────── SAFETY guards (read before touching) ─────────────────────────────
// DIRECT_SEND_GUARD — these reach a REAL transport on the already-running server process (its own provider key); a
// browser-driving client cannot sandbox that ⇒ never pressed, visibility/hiddenLeak only (source-verified, C4.2 §4):
//   crm-email-send → sendCrmEmailAction → crm/emails.ts transport · crm-email-test-send → "ส่งถึงอีเมลของคนที่กด" ·
//   portal-otp-request → requestOtp() → requestPortalOtp() → sendEmail() synchronously (QC_OTP_PREVIEW only previews).
const DIRECT_SEND_GUARD = new Map<string, string>([
  ["crm-email-send", "ส่งอีเมลจริง (sendCrmEmailAction)"],
  ["crm-email-test-send", "ส่งอีเมลทดสอบจริงถึงผู้กด"],
  ["portal-otp-request", "ส่ง OTP ทางอีเมลจริง (requestPortalOtp → sendEmail)"],
]);
// CROSS_MODULE_GUARD — writes into another module's ledger that the snapshot cannot put back faithfully (running
// document numbers, payroll, POS sales) or that call a paid external service (LLM / speech / OCR) or upload to the
// real storage bucket. Never pressed; listed in skippedSafety[] with the reason.
const CROSS_MODULE_GUARD = new Map<string, string>([
  ["deal-quote-btn", "ออกใบเสนอราคาในระบบบัญชี (เลขเอกสารรันต่อเนื่อง — คืนค่าไม่ได้)"],
  ["deal-invoice-btn", "ออกใบแจ้งหนี้ในระบบบัญชี (เลขเอกสารรันต่อเนื่อง — คืนค่าไม่ได้)"],
  ["crm-commission-send-payroll", "ส่งค่าคอมเข้าเงินเดือน HR (HrPayAdjustment)"],
  ["pos-deal-select", "ผูกบิล POS กับดีล (registerSaleAction — ต้องมีบิลขายจริง)"],
  ["crm-card-scan", "อัปโหลดรูปนามบัตร → AI อ่านจริง (เครดิต AI + ที่เก็บไฟล์จริง)"],
  ["crm-call-recording-input", "อัปโหลดไฟล์เสียงขึ้นที่เก็บไฟล์จริง"],
  ["crm-call-ai-transcribe", "ถอดเสียงด้วย AI จริง (เครดิต AI)"],
  ["crm-files-input", "อัปโหลดไฟล์ขึ้นที่เก็บไฟล์จริง (Bunny)"],
  ["portal-slip-upload", "อัปโหลดสลิปขึ้นที่เก็บไฟล์จริง"],
  ["crm-home-ai-risk", "เรียก AI จริง (เครดิต AI)"],
  ["crm-home-ai-draft", "เรียก AI จริง (เครดิต AI)"],
  ["crm-home-ai-summary", "เรียก AI จริง (เครดิต AI)"],
  ["crm-ai-home-at-risk", "เรียก AI จริง (เครดิต AI)"],
  ["crm-ai-deal-next-step", "เรียก AI จริง (เครดิต AI)"],
]);
// DESTRUCTIVE — rows after which the snapshot is restored IMMEDIATELY (the next row must not see an archived/merged/
// deleted/erased/converted entity or a switched UI version). Everything else is restored at the end of its page group.
const DESTRUCTIVE_RE = /(archive|delete|merge|erase|remove|revoke|convert|lost-confirm|reopen-submit|uiversion|template-apply|template-none|bulk|unowned-submit|restore|deal-card-|recompute|rotate|approve|reject|change-pipeline|stage-step)/;
// CSV fixture for the four import file inputs (CSV parsed server-side, no storage upload) — one qc-btn- tagged row
const IMPORT_FILE_INPUTS = new Set(["companies-import-file", "contacts-import-file", "crm-import-file", "object-import-file"]);
// never auto-ticked by PREFILL (safety — see crm-portal-invite-email special case)
const PREFILL_NEVER = new Set(["crm-portal-invite-email"]);
// ───────────────────────────── page URL resolution ─────────────────────────────
// CRM C4.1 (27 Sep 2569) rewrote the registry onto real route params (`[companyId]`/`[contactId]` everywhere, no
// more `[id]` aliasing) and replaced the old combined-page string with a per-row `alsoOn` (informational-only —
// tested once, on `page`) — PAGE_ALIAS/COMBINED_PAGE are gone, nothing to alias anymore.

type Ctx = {
  dealId: string | null; contactId: string | null; companyId: string | null; recordId: string | null; objectKey: string | null;
  partyId: string | null; slug: string | null; conversationId: string | null; unitId: string | null;
  sequenceId: string | null; threadKey: string | null; token: string | null; docType: string | null; docId: string | null;
  posSysId: string | null; memberSysId: string | null; hrSysId: string | null; accountSysId: string | null; chatSysId: string | null;
};
const UNRESOLVED: { placeholder: string; reason: string }[] = [];
const note = (placeholder: string, reason: string) => UNRESOLVED.push({ placeholder, reason });

/** live lookups — best-effort; every failure degrades to `null` + a note, never throws (this file must survive a half-seeded QC db) */
async function buildCtx(): Promise<Ctx> {
  const ctx: Ctx = {
    dealId: E.dealIds?.[0] ?? null, contactId: E.contactIds?.[0] ?? null, companyId: E.companyIds?.[0] ?? null,
    recordId: null, objectKey: null, partyId: null, slug: CQC.tenantSlug ?? null, conversationId: null,
    unitId: E.units?.patong ?? E.units?.kata ?? null,
    sequenceId: null, threadKey: null, token: null, docType: null, docId: null,
    posSysId: E.systems?.POS ?? null, memberSysId: E.systems?.MEMBER ?? null, hrSysId: E.systems?.HR ?? null,
    accountSysId: E.systems?.ACCOUNT ?? null, chatSysId: E.systems?.CHAT ?? null,
  };
  if (!ctx.unitId) note("unitId", "crm-expected.json units ว่าง (ใช้กับ system:POS query unit=[unitId])");
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
      if (!ctx.conversationId) note("conversationId", "ไม่มีห้องแชทในระบบ CHAT ของซีดนี้เลย");
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

/** substitute every `[placeholder]` in `s` from `map` — null/absent value ⇒ report the FIRST one missing (never throws) */
function subPlaceholders(s: string, map: Record<string, string | null>): { out: string | null; missing: string | null } {
  let missing: string | null = null;
  const out = s.replace(/\[([a-zA-Z]+)\]/g, (_m, key: string) => {
    const v = map[key];
    if (v == null) { missing = key; return `[${key}]`; }
    return v;
  });
  return missing ? { out: null, missing } : { out, missing: null };
}

/** CRM C4.1 `system` field (§6 item 1) — resolves the `[id]` segment of an absolute `page`; undefined/"CRM" = this CRM system */
function resolveSystemId(system: string | undefined, ctx: Ctx): { id: string | null; reason: string | null } {
  switch (system) {
    case undefined: case "CRM": return { id: SYS, reason: null };
    case "HR": return { id: ctx.hrSysId, reason: ctx.hrSysId ? null : "ไม่มีระบบ HR ในซีดนี้" };
    case "POS": return { id: ctx.posSysId, reason: ctx.posSysId ? null : "ไม่มีระบบ POS ในซีดนี้" };
    case "MEMBER": return { id: ctx.memberSysId, reason: ctx.memberSysId ? null : "ไม่มีระบบ MEMBER ในซีดนี้" };
    case "ACCOUNT": return { id: ctx.accountSysId, reason: ctx.accountSysId ? null : "ไม่มีระบบ ACCOUNT ในซีดนี้" };
    case "CHAT": return { id: ctx.chatSysId, reason: ctx.chatSysId ? null : "ไม่มีระบบ CHAT ในซีดนี้" };
    case "MEETING": return { id: null, reason: "ไม่มีระบบ MEETING ในซีดนี้ (ไม่ได้ seed)" };
    default: return { id: null, reason: `system "${system}" ไม่รู้จัก (ทะเบียนใช้ค่าใหม่ที่ตัวกดยังไม่รู้จัก)` };
  }
}

/**
 * normalise a registry row's `page`+`system`+`query` into a concrete pathname (or null + reason when unresolvable).
 * CRM C4.1 (27 Sep 2569): `page` is now always the real route param name (no more `[id]` aliasing needed) and
 * absolute for anything outside `${CRM_BASE}` — `system` says which system's id fills `[id]` in an absolute page,
 * `query` (may itself contain placeholders, e.g. "c=[conversationId]") is appended so the control is even reachable.
 */
function pageUrl(row: Row, ctx: Ctx): { path: string | null; reason: string | null } {
  const sysR = resolveSystemId(row.system, ctx);
  if (!sysR.id) return { path: null, reason: sysR.reason };
  const map: Record<string, string | null> = {
    id: sysR.id, dealId: ctx.dealId, contactId: ctx.contactId, companyId: ctx.companyId,
    recordId: ctx.recordId, key: ctx.objectKey, partyId: ctx.partyId, slug: ctx.slug,
    token: ctx.token, docType: ctx.docType, docId: ctx.docId, conversationId: ctx.conversationId,
    unitId: ctx.unitId, sequenceId: ctx.sequenceId, threadKey: ctx.threadKey,
  };
  // any page already rooted outside the CRM module (/app/… /b/… /p/… /u/…) is absolute as-is; everything else is
  // the shortened CRM-relative form ("/deals", "/objects/[key]", …) and needs the CRM_BASE prefix.
  const isAbsolute = /^\/(app|b|p|u)\//.test(row.page);
  const base = isAbsolute ? row.page : `${CRM_BASE}${row.page}`;
  const p = subPlaceholders(base, map);
  if (!p.out) return { path: null, reason: `ไม่มีค่าจริงของ [${p.missing}] ในซีดนี้` };
  if (!row.query) return { path: p.out, reason: null };
  const q = subPlaceholders(row.query, map);
  if (!q.out) return { path: null, reason: `ไม่มีค่าจริงของ [${q.missing}] ในซีดนี้ (query "${row.query}")` };
  return { path: `${p.out}?${q.out}`, reason: null };
}

// ───────────────────────────── plan ─────────────────────────────
type PlanItem = {
  user: UserKey; device: string; w: number; h: number; page: string; path: string; testid: string; kind: string;
  roles: string[]; hiddenFor: string[]; expect: Row["expect"]; wo: string; guard: string | null;
  notList: string[]; // exact testids to exclude when `testid` is a `*`-pattern (row.only expands away)
  opener: string[]; // C4.2 — chain to press first
  needs: string | null; // C4.2 — data precondition
  idx: number; // registry order (fill rows before their submit — PREFILL relies on it)
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
  ROWS.forEach((row, idx) => {
    if (!pageSelected(row.page)) return;
    const rawTestid = String(row.testid ?? "").trim();
    if (!rawTestid) return;
    const testids = row.only && row.only.length ? row.only : [rawTestid];
    const notList = row.only && row.only.length ? [] : (row.not ?? []);
    const cacheKey = `${row.page}|${row.system ?? ""}|${row.query ?? ""}`;
    if (!pageCache.has(cacheKey)) pageCache.set(cacheKey, pageUrl(row, ctx));
    const { path, reason } = pageCache.get(cacheKey)!;
    for (const testid of testids) {
      for (const user of userKeys) {
        if (!applicableUser(row, user)) continue; // silent on this role — registry makes no claim
        if (!path) { skipped.push({ page: row.page, testid, reason: `${reason} (${user})` }); continue; }
        for (const [device, w, h] of VIEWPORTS) {
          if (row.viewport && row.viewport !== device) continue; // layout-specific control — no claim for the other layout
          items.push({
            user, device, w, h, page: row.page, path, testid, kind: row.kind, roles: row.roles, hiddenFor: row.hiddenFor,
            expect: row.expect, wo: row.wo ?? "", guard: DIRECT_SEND_GUARD.get(testid) ?? CROSS_MODULE_GUARD.get(testid) ?? null,
            notList, opener: openerOf(row), needs: row.needs ?? null, idx,
          });
        }
      }
    }
  });
  return { items, skipped };
}

/** --dry registry validation for C4.2's fields: every opener must name a registry testid (exact, `only` member or
 *  pattern match) on the SAME page (or be the page's own control via alsoOn) · `needs` must be non-empty text */
function validateOpeners(): string[] {
  const problems: string[] = [];
  const globRe = (p: string) => new RegExp(`^${p.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
  const namesOnPage = new Map<string, string[]>();
  for (const r of ROWS) {
    const arr = namesOnPage.get(r.page) ?? [];
    arr.push(r.testid, ...(r.only ?? []));
    namesOnPage.set(r.page, arr);
  }
  for (const r of ROWS) {
    if (r.needs !== undefined && (typeof r.needs !== "string" || !r.needs.trim())) problems.push(`${r.page}#${r.testid}: needs ต้องเป็นข้อความ`);
    if (r.viewport !== undefined && r.viewport !== "desktop" && r.viewport !== "mobile") problems.push(`${r.page}#${r.testid}: viewport ต้องเป็น desktop|mobile`);
    for (const o0 of openerOf(r)) {
      if (typeof o0 !== "string" || !o0.trim()) { problems.push(`${r.page}#${r.testid}: opener ว่าง/ไม่ใช่สตริง`); continue; }
      const o = o0.includes("=") ? o0.slice(0, o0.indexOf("=")) : o0;
      if (o === r.testid) { problems.push(`${r.page}#${r.testid}: opener ชี้ตัวเอง`); continue; }
      const names = namesOnPage.get(r.page) ?? [];
      const hit = names.some((n) => n === o || (n.includes("*") && globRe(n).test(o)) || (o.includes("*") && n === o));
      if (!hit) problems.push(`${r.page}#${r.testid}: opener "${o}" ไม่มีแถวบนหน้าเดียวกัน`);
    }
  }
  return problems;
}

// ═══════════════════════════════════════════════════════════════════
// SNAPSHOT / RESTORE (C4.2 — every write this run makes is put back; see WRITES in the contract)
// ═══════════════════════════════════════════════════════════════════
// Parents first (creates run in this order, deletes in reverse). Every model here has a single `id` and a `tenantId`
// (verified through Prisma DMMF on QC1, 27 Sep 2569 — ledger/wo-notes/crm-C4.2.md §3). Log-only tables (AuditLog,
// OutboxEvent, AppNotification) are deliberately NOT restored: they are append-only history, never read back as state.
const SNAP_MODELS = [
  "AppSystem", "Team", "TeamMember", "Party", "Customer", "MemberConsent", "MemberField",
  "CrmPipeline", "CrmStage", "CrmLostReason", "CrmCompany", "CrmContact", "CrmCompanyContact",
  "CrmDeal", "CrmDealContact", "CrmDealLine", "CrmDealStageHistory", "CrmDealPayment", "CrmActivity",
  "CrmVisibilityPolicy", "FileAsset", "CrmFileLink", "CrmContactConsent",
  "CustomObject", "CustomRecord", "CustomRecordValue", "CustomRecordValueHistory",
  "CrmScoreRule", "CrmScoreLog", "CrmAssignmentRule", "CrmSequence", "CrmSequenceStep", "CrmSequenceEnrollment",
  "CrmEmailTemplate", "CrmEmailUserSetting", "CrmMailProvider", "EmailDomain", "CrmEmailMessage", "CrmEmailEvent",
  "CrmTrackedLink", "CrmTrackedClick", "CrmWebSession", "CrmWebEvent", "CrmUserPref", "CrmImportJob", "CrmQuota",
  "CrmCommissionRule", "CrmCommission", "CrmPortalAccess", "CrmPortalRequest", "PortalSession",
  "MemberSavedView", "ApiKey", "WebhookEndpoint", "AutomationRule", "AutomationRun", "FormDef", "KanbanCard", "AiProposal",
] as const;
const toCamel = (m: string) => m.charAt(0).toLowerCase() + m.slice(1);
const DMMF_MODELS = (Prisma?.dmmf?.datamodel?.models ?? []) as { name: string; fields: { name: string; kind: string; type: string }[] }[];
const FIELD_INFO = new Map<string, { scalars: string[]; json: Set<string> }>();
for (const m of SNAP_MODELS) {
  const dm = DMMF_MODELS.find((x) => x.name === m);
  if (!dm) continue;
  FIELD_INFO.set(m, {
    scalars: dm.fields.filter((f) => f.kind === "scalar" || f.kind === "enum").map((f) => f.name),
    json: new Set(dm.fields.filter((f) => f.type === "Json").map((f) => f.name)),
  });
}
const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `${x}n` : x && typeof x === "object" && typeof (x as Any).toFixed === "function" && (x as Any).constructor?.name === "Decimal" ? `D${String(x)}` : x));
type Snap = Map<string, Map<string, Any>>;
let SNAP: Snap | null = null;
const PROTECT = new Set<string>(); // rows this run created ON PURPOSE (portal fixture/session) — never deleted by a mid-run restore
const restoreLog: { label: string; deleted: number; updated: number; recreated: number; failed: string[] }[] = [];

async function readAll(model: string): Promise<Any[]> {
  try { return await P[toCamel(model)].findMany({ where: { tenantId: TENANT } }); } catch { return []; }
}
async function readAllModels(): Promise<Map<string, Any[]>> {
  const out = new Map<string, Any[]>();
  const models = [...SNAP_MODELS];
  for (let i = 0; i < models.length; i += 6) {
    const chunk = models.slice(i, i + 6);
    const res = await Promise.all(chunk.map((m) => readAll(m)));
    chunk.forEach((m, j) => out.set(m, res[j]!));
  }
  return out;
}
async function takeSnapshot(): Promise<void> {
  const all = await readAllModels();
  SNAP = new Map();
  for (const [m, rows] of all) SNAP.set(m, new Map(rows.map((r) => [r.id as string, r])));
  const n = [...SNAP.values()].reduce((a, m) => a + m.size, 0);
  console.log(`📸 snapshot ${SNAP.size} ตาราง · ${n} แถว (tenant ${TENANT})`);
}
function toData(model: string, row: Any): Any {
  const info = FIELD_INFO.get(model);
  const data: Any = {};
  for (const f of info?.scalars ?? Object.keys(row)) {
    if (!(f in row)) continue;
    const v = row[f];
    data[f] = v === null && info?.json.has(f) ? Prisma.DbNull : v;
  }
  return data;
}
/** put every SNAP_MODELS row of this tenant back to the snapshot — returns what it had to do (logged in summary) */
async function restoreSnapshot(label: string, opts: { keepNew?: boolean } = {}): Promise<{ deleted: number; updated: number; recreated: number; failed: string[] }> {
  const st = { deleted: 0, updated: 0, recreated: 0, failed: [] as string[] };
  if (!SNAP) return st;
  const errs = new Map<string, string>();
  for (let pass = 0; pass < 4; pass++) {
    const cur = await readAllModels();
    let pending = 0;
    // 1) rows that did not exist at snapshot time — children first (mid-group repairs keep them: data an earlier
    //    row created on purpose — a rule, a view, a sequence — is what the page's later `needs` rows press)
    for (const m of opts.keepNew ? [] : [...SNAP_MODELS].reverse()) {
      const snapM = SNAP.get(m); if (!snapM) continue;
      const extra = (cur.get(m) ?? []).filter((r) => !snapM.has(r.id) && !PROTECT.has(r.id)).map((r) => r.id as string);
      if (!extra.length) continue;
      try { st.deleted += (await P[toCamel(m)].deleteMany({ where: { id: { in: extra } } })).count; }
      catch {
        for (const id of extra) {
          try { await P[toCamel(m)].delete({ where: { id } }); st.deleted++; }
          catch (e) { pending++; errs.set(`${m}#${id}`, `ลบไม่ได้: ${e instanceof Error ? e.message.split("\n").slice(-1)[0]!.slice(0, 140) : e}`); }
        }
      }
    }
    // 2) changed / missing snapshot rows — parents first
    for (const m of SNAP_MODELS) {
      const snapM = SNAP.get(m); if (!snapM) continue;
      const now = new Map((cur.get(m) ?? []).map((r) => [r.id as string, r]));
      for (const [id, row] of snapM) {
        const n = now.get(id);
        if (n && stable(n) === stable(row)) continue;
        try {
          if (!n) { await P[toCamel(m)].create({ data: toData(m, row) }); st.recreated++; }
          else { const d = toData(m, row); delete d.id; await P[toCamel(m)].update({ where: { id }, data: d }); st.updated++; }
          errs.delete(`${m}#${id}`);
        } catch (e) { pending++; errs.set(`${m}#${id}`, `${n ? "คืนค่า" : "สร้างคืน"}ไม่ได้: ${e instanceof Error ? e.message.split("\n").slice(-1)[0]!.slice(0, 140) : e}`); }
      }
    }
    if (pending === 0) { errs.clear(); break; }
  }
  st.failed = [...errs].map(([k, v]) => `${k} ${v}`);
  if (st.deleted || st.updated || st.recreated || st.failed.length) {
    restoreLog.push({ label, ...st });
    console.log(`  ♻️  คืนฐาน (${label}): ลบแถวใหม่ ${st.deleted} · คืนค่า ${st.updated} · สร้างคืน ${st.recreated}${st.failed.length ? ` · ❌ ค้าง ${st.failed.length}: ${st.failed.slice(0, 3).join(" | ")}` : ""}`);
  }
  return st;
}

// ═══════════════════════════════════════════════════════════════════
// sessions + portal fixture
// ═══════════════════════════════════════════════════════════════════
class Fatal extends Error {}
const UA = "qc-btn";
const MINE = { sessionIds: [] as string[], portalAccessIds: [] as string[], tokenHashes: [] as string[] };
let PORTAL_ENABLED_BEFORE: boolean | null = null; // null = did not touch
// second net under SNAPSHOT/RESTORE: the literal tag every typed value carries
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
    const existing = await P.crmPortalAccess.findFirst({ where: { systemId: SYS, companyId: ctx.companyId, contactId: ctx.contactId }, select: { id: true } });
    if (existing) return { accessId: existing.id };
    const created = await P.crmPortalAccess.create({
      data: { tenantId: TENANT, systemId: SYS, companyId: ctx.companyId, contactId: ctx.contactId, role: "VIEW", loginMethods: ["LINE"], invitedAt: new Date(), acceptedAt: new Date() },
      select: { id: true },
    });
    MINE.portalAccessIds.push(created.id);
    PROTECT.add(created.id);
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
    const minted = await ps.mintPortalSession(accessId, { userAgent: UA });
    const hash = (await import("@/lib/core/hash")).sha256(minted.token);
    MINE.tokenHashes.push(hash);
    try { for (const s of await P.portalSession.findMany({ where: { tokenHash: hash }, select: { id: true } })) PROTECT.add(s.id); } catch { /* model shape differs — restore may log it */ }
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
  const ttl = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const { sha256 } = await import("@/lib/core/hash");
  const row = await P.session.create({ data: { userId, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl }, select: { id: true } });
  MINE.sessionIds.push(row.id);
  return https
    ? [{ name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true }, { name: "shark_tenant", value: TENANT, url: BASE, path: "/", secure: true }]
    : [{ name: "shark_session", value: token, domain: host, path: "/" }, { name: "shark_tenant", value: TENANT, domain: host, path: "/" }];
}

// ═══════════════════════════════════════════════════════════════════
// selector + page helpers
// ═══════════════════════════════════════════════════════════════════
const looksLikeTestid = (s: string) => /^[A-Za-z][A-Za-z0-9*-]*$/.test(s);
/** testid → CSS selector; one `*` anywhere (prefix/suffix attribute selectors) */
function selOf(testid: string): string {
  if (!testid.includes("*")) return `[data-testid="${testid}"]`;
  const i = testid.indexOf("*");
  const prefix = testid.slice(0, i);
  const suffix = testid.slice(i + 1);
  const parts: string[] = [];
  if (prefix) parts.push(`[data-testid^="${prefix}"]`);
  if (suffix) parts.push(`[data-testid$="${suffix}"]`);
  return parts.length ? parts.join("") : "[data-testid]";
}
/**
 * First VISIBLE element for a testid (C4.2 §3): exact testids can have desktop/mobile twins (one hidden by CSS) —
 * the old "document.querySelector = first match" picked the hidden twin and reported it missing. Patterns: first
 * visible match that is actually clickable and not in `notList` (C4.1 §7 rule), else the first visible match.
 * `waitMs` > 0 polls every 200 ms.
 */
async function findVisible(page: Any, testid: string, notList: string[] = [], waitMs = 0): Promise<Any | null> {
  const sel = selOf(testid);
  const isPattern = testid.includes("*");
  const deadline = Date.now() + waitMs;
  for (;;) {
    const h = await page.evaluateHandle((pSel: string, nots: string[], pattern: boolean) => {
      const TAGS = ["button", "input", "select", "textarea"];
      const ROLES = ["button", "link", "menuitem", "tab", "switch", "checkbox", "option", "radio"];
      const vis = (el: Element) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const cs = getComputedStyle(el as HTMLElement);
        return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden";
      };
      let fallback: Element | null = null;
      for (const el of Array.from(document.querySelectorAll(pSel))) {
        const t = el.getAttribute("data-testid") ?? "";
        if (nots.includes(t)) continue;
        if (!vis(el)) continue;
        if (!pattern) return el;
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("role") ?? "";
        if (TAGS.includes(tag) || (tag === "a" && el.hasAttribute("href")) || ROLES.includes(role) || tag === "summary") return el;
        fallback ??= el;
      }
      return fallback;
    }, sel, notList, isPattern).catch(() => null);
    const el = h?.asElement?.() ?? null;
    if (el) return el;
    await h?.dispose?.().catch(() => {});
    if (Date.now() >= deadline) return null;
    await sleep(200);
  }
}
// 🔴 tsx/esbuild (keepNames) wraps every named inner function of code passed to page.evaluate*() in `__name(fn, "x")` —
//    the browser has no `__name` ⇒ ReferenceError swallowed by .catch() ⇒ findVisible() "found nothing" for EVERY row
//    (smoke run 1, 27 Sep 13:14: /companies 0/23, all dead-missing on a 200 page). Shim it on every document.
const NAME_SHIM = "globalThis.__name = globalThis.__name || function (f) { return f; };";
/** every visible data-testid on the page right now (discover mode + diagnostics) */
async function visibleTestids(page: Any): Promise<string[]> {
  return page.evaluate(() => {
    const out = new Set<string>();
    for (const el of Array.from(document.querySelectorAll("[data-testid]"))) {
      const r = (el as HTMLElement).getBoundingClientRect();
      const cs = getComputedStyle(el as HTMLElement);
      if (r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden") out.add(el.getAttribute("data-testid")!);
    }
    return [...out];
  }).catch(() => []);
}
async function settle(page: Any, maxMs = 4000): Promise<void> {
  await page.waitForNetworkIdle({ idleTime: 350, timeout: maxMs }).catch(() => {});
}
/** click through the pointer (real hit-test) — falls back to DOM click() when the element is covered/animating */
async function clickEl(page: Any, el: Any, testid: string): Promise<void> {
  if (testid.endsWith("-backdrop")) {
    const box = await el.boundingBox();
    if (!box) throw new Error(`backdrop ${testid} ไม่มีกรอบ`);
    await page.mouse.click(box.x + 6, box.y + 6); // close handlers check e.target === e.currentTarget (C4.1 §7.3)
    return;
  }
  try { await el.click({ delay: 20 }); }
  catch { await el.evaluate((e: HTMLElement) => e.click()); }
}
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, "q");
const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
function fillValueFor(testid: string, inputType: string): string {
  const t = testid.toLowerCase();
  if (inputType === "email" || /(email|addr|copy-to)$/.test(t)) return `qc-btn-${rand}@example.com`;
  if (inputType === "tel" || /phone/.test(t)) return "0812345678";
  if (inputType === "url" || /(url|website|domain)$/.test(t)) return /domain/.test(t) ? `qc-btn-${rand}.example.com` : `https://qc-btn-${rand}.example.com`;
  if (inputType === "time" || (/(from|to|hour)$/.test(t) && /(window|quiet|digest)/.test(t))) return "09:00";
  if (inputType === "date") return today();
  if (inputType === "datetime-local") return `${today()}T10:00`;
  if (inputType === "month") return today().slice(0, 7);
  if (inputType === "color") return "#123456";
  if (/(reason|note)/.test(t)) return `qc-btn-${rand} เหตุผลทดสอบ`;
  if (/(qty|quantity|duration|max-open|probability|percent|rate|score|points|priority)/.test(t) || inputType === "number" || inputType === "range") return /percent|rate|probability/.test(t) ? "10" : "5";
  if (/(price|amount|satang|discount|days|value|target|months)/.test(t)) return "100";
  if (/date|due|at$/.test(t)) return today();
  return `qc-btn-${rand}`;
}
/** set a field the way a user would; returns the before/after value so "dead" can be judged by the value itself */
async function fillEl(page: Any, el: Any, testid: string): Promise<{ before: string; after: string; skipped?: string }> {
  const meta: { tag: string; type: string; value: string; checked: boolean; role: string; ariaChecked: string | null; ro: boolean } = await el.evaluate((e: Any) => ({
    tag: e.tagName.toLowerCase(), type: (e.getAttribute("type") ?? "").toLowerCase(), value: String(e.value ?? ""), checked: !!e.checked,
    role: e.getAttribute("role") ?? "", ariaChecked: e.getAttribute("aria-checked") ?? e.getAttribute("aria-pressed"), ro: !!(e.disabled || e.readOnly),
  }));
  const snap = async () => el.evaluate((e: Any) => `${e.value ?? ""}|${e.checked ?? ""}|${e.getAttribute("aria-checked") ?? e.getAttribute("aria-pressed") ?? ""}|${e.getAttribute("data-state") ?? ""}`).catch(() => "detached");
  const before = await snap();
  if (meta.tag === "select") {
    const opts: { value: string; selected: boolean; disabled: boolean }[] = await el.evaluate((s: HTMLSelectElement) => Array.from(s.options).map((o) => ({ value: o.value, selected: o.selected, disabled: o.disabled })));
    const cand = opts.find((o) => !o.selected && !o.disabled && o.value !== "") ?? opts.find((o) => !o.selected && !o.disabled);
    if (cand) await el.select(cand.value);
  } else if (meta.tag === "input" && meta.type === "file") {
    if (!IMPORT_FILE_INPUTS.has(testid)) return { before, after: before, skipped: "file" };
    await el.uploadFile(resolvePath(".qc-shots/c42/fixtures/qc-btn-import.csv"));
    await el.evaluate((e: Any) => e.dispatchEvent(new Event("change", { bubbles: true })));
  } else if (meta.tag === "input" && ["checkbox", "radio"].includes(meta.type)) {
    await clickEl(page, el, testid);
  } else if (meta.tag === "input" && ["date", "time", "datetime-local", "month", "color", "range", "number", "week"].includes(meta.type)) {
    const v = fillValueFor(testid, meta.type);
    await el.evaluate((e: HTMLInputElement, val: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(e, val);
      e.dispatchEvent(new Event("input", { bubbles: true }));
      e.dispatchEvent(new Event("change", { bubbles: true }));
    }, v);
    await el.evaluate((e: HTMLElement) => e.blur()).catch(() => {});
  } else if (meta.tag === "input" || meta.tag === "textarea") {
    await el.click({ clickCount: 3 }).catch(async () => { await el.evaluate((e: HTMLElement) => e.focus()); });
    await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
    await page.keyboard.type(fillValueFor(testid, meta.type), { delay: 5 });
    await page.keyboard.press("Tab");
  } else {
    await clickEl(page, el, testid); // toggle rendered as a button/switch
  }
  await sleep(150);
  return { before, after: await snap() };
}
// ── URL matching ──
const RE_ESCAPE = /[.*+?^${}()|[\]\\]/g;
const WILDCARD_TOKEN = /(\[[^\]]+\]|<[^>]+>|\*)/g;
function navMatches(target: string | undefined, url: string): boolean {
  if (!target) return false;
  const rawPath = target.split("?")[0]!;
  const parts = rawPath.split(WILDCARD_TOKEN);
  const pat = parts.map((p) => (/^(\[[^\]]+\]|<[^>]+>|\*)$/.test(p) ? "[^/]+" : p.replace(RE_ESCAPE, "\\$&"))).join("");
  let path: string;
  try { path = new URL(url).pathname; } catch { path = url; }
  const anchored = pat.startsWith("/") ? pat : `${CRM_BASE}${pat}`;
  return new RegExp(`^${anchored}(?:$|/|\\?)`).test(path);
}
const urlKey = (u: string) => { try { const x = new URL(u); return `${x.pathname}${x.search}`; } catch { return u; } };

// ── DB-diff heuristic (best-effort — see CONTRACT) ──
const SCOPE_SYSTEM = new Set(["CrmDeal", "CrmContact", "CrmCompany", "CrmActivity", "CrmSequence", "CrmEmailMessage", "CustomRecord", "CrmPortalAccess"]);
type Clause = { model: string; op: "inc" | "dec" | "eq"; column?: string; value?: string };
function parseDbClauses(db: string | undefined): { parsed: Clause[]; unparsed: string[] } {
  const parsed: Clause[] = []; const unparsed: string[] = [];
  for (const raw of (db ?? "").split(" · ").map((s) => s.trim()).filter(Boolean)) {
    let m = /^([A-Z][A-Za-z0-9]*)\s*\(?\s*\+1\b/.exec(raw);
    if (m) { parsed.push({ model: m[1]!, op: "inc" }); continue; }
    m = /^([A-Z][A-Za-z0-9]*)\s*[-−]1\b/.exec(raw);
    if (m) { parsed.push({ model: m[1]!, op: "dec" }); continue; }
    m = /^([A-Z][A-Za-z0-9]*)\.([A-Za-z0-9_]+)\s*=\s*([^\s(·]+)/.exec(raw);
    // literal values only — "<ขั้น>" / "A|B" / "<ไม่ว่าง>" are prose placeholders, not something a query can compare
    if (m && !/[<|>]/.test(m[3]!) && !/^(now|Σ)/.test(m[3]!)) { parsed.push({ model: m[1]!, op: "eq", column: m[2], value: m[3]!.replace(/^["']|["']$/g, "") }); continue; }
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
/** entity id of a DETAIL page (literal `Model.col=value` checks only make sense there) */
function primaryIdOf(page: string, ctx: Ctx): string | null {
  if (page === "/deals/[dealId]") return ctx.dealId;
  if (page === "/contacts/[contactId]") return ctx.contactId;
  if (page === "/companies/[companyId]") return ctx.companyId;
  if (page === "/objects/[key]/[recordId]") return ctx.recordId;
  return null;
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
const skippedSafety: { page: string; testid: string; user: string; device: string; reason: string }[] = [];
const skippedNeeds: { page: string; testid: string; user: string; device: string; needs: string; detail: string }[] = [];
const dbCheckUnparsed = new Map<string, string[]>();
const perPage = new Map<string, Any[]>();

// ═══════════════════════════════════════════════════════════════════
// per-row machinery
// ═══════════════════════════════════════════════════════════════════
type PageState = { openChain: string[]; dirty: boolean };
const FIELD_TAGS = new Set(["input", "textarea", "select"]);
const isPrefix = (a: string[], b: string[]) => a.length <= b.length && a.every((x, i) => x === b[i]);
const sameChain = (a: string[], b: string[]) => a.length === b.length && isPrefix(a, b);
const globRe = (p: string) => new RegExp(`^${p.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);

/** opener step "<testid>=<value>" = choose that option / type that value (the builder reveals fields per chosen value) */
const splitOpener = (o: string): { tid: string; val: string | null } => { const i = o.indexOf("="); return i < 0 ? { tid: o, val: null } : { tid: o.slice(0, i), val: o.slice(i + 1) }; };
/** press the row's opener chain (only the links that are still needed) and find the row's control */
async function reveal(page: Any, path: string, it: PlanItem, state: PageState, hidden: boolean): Promise<{ el: Any | null; reason: string }> {
  let el = await findVisible(page, it.testid, it.notList, 0);
  if (el) return { el, reason: "" };
  const chain = it.opener;
  for (let i = state.openChain.length; i < chain.length; i++) {
    const { tid, val } = splitOpener(chain[i]!);
    let laterVisible = false;
    if (val === null) { // a "select this value" step is always applied — the fields it reveals depend on the value
      for (const t of chain.slice(i + 1)) if (await findVisible(page, splitOpener(t).tid, [], 0)) { laterVisible = true; break; }
      if (!laterVisible && (await findVisible(page, it.testid, it.notList, 0))) laterVisible = true;
    }
    if (laterVisible) { state.openChain.push(chain[i]!); continue; }
    const op = await findVisible(page, tid, [], hidden ? 1500 : 3500);
    if (!op) return { el: null, reason: `ตัวเปิด ${chain[i]} หาไม่พบ/มองไม่เห็น (ลำดับ ${chain.join(" → ")})` };
    if (val !== null) {
      const isSelect = await op.evaluate((e: Element) => e.tagName === "SELECT").catch(() => false);
      if (isSelect) await op.select(val).catch(() => {});
      else await op.evaluate((e: HTMLInputElement, v: string) => {
        const setter = Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!;
        setter.call(e, v); e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true }));
      }, val).catch(() => {});
    } else await clickEl(page, op, tid).catch(() => {});
    await settle(page, 3000);
    await sleep(250);
    state.openChain.push(chain[i]!);
    if (urlKey(page.url()) !== urlKey(`${BASE}${path}`)) state.dirty = true; // an opener that navigates (query tab) — next row reloads
  }
  el = await findVisible(page, it.testid, it.notList, hidden ? 800 : chain.length ? 4000 : 2500);
  return el ? { el, reason: "" } : { el: null, reason: chain.length ? `กด ${chain.join(" → ")} แล้วยังไม่เห็น ${it.testid}` : "ควรเห็นได้ (อยู่ใน roles ไม่อยู่ใน hiddenFor) แต่หาไม่พบ/มองไม่เห็น" };
}

/** PREFILL (contract): fill earlier fill-rows of the same form/dialog that are still empty before submitting */
async function prefill(page: Any, it: PlanItem, group: PlanItem[], el: Any, base: string): Promise<string[]> {
  const done: string[] = [];
  const container = await el.evaluateHandle((e: Element) => (e.tagName === "FORM" ? e : e.closest("form, [role=\"dialog\"], dialog, [aria-modal=\"true\"]"))).catch(() => null);
  if (!container?.asElement?.()) return done;
  const sibs = group.filter((s) => s.idx < it.idx && ["input", "textarea", "select", "toggle"].includes(s.kind) && s.expect.type !== "navigate"
    && sameChain(s.opener, it.opener) && !PREFILL_NEVER.has(s.testid) && !s.guard && !s.hiddenFor.includes(base) && s.testid !== it.testid);
  const seen = new Set<string>();
  for (const s of sibs) {
    if (seen.has(s.testid)) continue; seen.add(s.testid);
    const se = await findVisible(page, s.testid, s.notList, 0);
    if (!se) continue;
    const inside = await container.evaluate((c: Element, x: Element) => c.contains(x), se).catch(() => false);
    if (!inside) continue;
    const empty = await se.evaluate((x: Any) => {
      const tag = x.tagName.toLowerCase(); const type = (x.getAttribute("type") ?? "").toLowerCase();
      if (tag === "input" && (type === "checkbox" || type === "radio")) return !x.checked;
      if (tag === "input" && type === "file") return false;
      if (tag === "input" || tag === "textarea" || tag === "select") return String(x.value ?? "") === "";
      return x.getAttribute("aria-checked") === "false" || x.getAttribute("aria-pressed") === "false";
    }).catch(() => false);
    if (!empty) continue;
    await fillEl(page, se, s.testid).catch(() => {});
    done.push(s.testid);
  }
  if (done.length) await settle(page, 2500);
  return done;
}

/** what "changed" means for ui/changes: markup + live form state of the element and its descendants */
async function uiSnapshot(page: Any, testid: string): Promise<string | null> {
  const el = await findVisible(page, testid, [], 0) ?? (await page.$(selOf(testid)).catch(() => null));
  if (!el) return null;
  return el.evaluate((e: Any) => e.outerHTML + "|" + [e, ...Array.from(e.querySelectorAll("input,select,textarea"))].map((x: Any) => `${x.value ?? ""}:${x.checked ?? ""}`).join(",")).catch(() => null);
}

async function runUser(browser: Any, user: UserKey, ctx: Ctx, items: PlanItem[]): Promise<void> {
  let cookies: Any[];
  try { cookies = await mintSession(user, ctx); }
  catch (e) { console.log(`  ⚠️ ข้ามบทบาท ${user}: ${e instanceof Error ? e.message : e}`); return; }
  const base = user.startsWith("customer") ? "customer" : user;

  const groups = new Map<string, PlanItem[]>();
  for (const it of items.filter((i) => i.user === user)) {
    const key = `${it.path}·${it.device}`;
    const arr = groups.get(key) ?? []; arr.push(it); groups.set(key, arr);
  }
  let gi = 0;
  for (const [key, rowsOfPageRaw] of groups) {
    gi++;
    // registry order, except rows with `needs` go last: an earlier row of the same page may create what they need
    const rowsOfPage = [...rowsOfPageRaw].sort((a, b) => (a.needs ? 1 : 0) - (b.needs ? 1 : 0) || a.idx - b.idx);
    const [path, device] = key.split("·") as [string, string];
    const [, w, h] = VIEWPORTS.find((v) => v[0] === device)!;
    const t0 = Date.now();
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: device === "mobile", hasTouch: device === "mobile" });
    await page.setCookie(...cookies);
    await page.evaluateOnNewDocument(NAME_SHIM);
    page.on("dialog", (d: Any) => d.accept().catch(() => {})); // window.confirm() guards — accept (the row IS the press)
    const cErrs: string[] = [];
    const httpErrs: string[] = [];
    let reqCount = 0; let nonGetCount = 0;
    page.on("pageerror", (e: Error) => cErrs.push(e.message.slice(0, 200)));
    page.on("console", (m: Any) => { if (m.type() === "error") cErrs.push(String(m.text()).slice(0, 200)); });
    page.on("request", (r: Any) => { reqCount++; if (r.method() !== "GET" && r.method() !== "HEAD" && r.method() !== "OPTIONS") nonGetCount++; });
    const respLog: { status: number; url: string; contentType: string; disposition: string; method: string }[] = [];
    page.on("response", (r: Any) => {
      try {
        const hd = r.headers();
        respLog.push({ status: r.status(), url: String(r.url()), contentType: String(hd["content-type"] ?? ""), disposition: String(hd["content-disposition"] ?? ""), method: r.request().method() });
        if (r.status() >= 400) httpErrs.push(`${r.status()} ${String(r.url()).slice(0, 160)}`);
      } catch { /* ignore */ }
    });
    const newTabs: Any[] = [];
    const onTarget = (t: Any) => { try { if (t.opener() === page.target()) newTabs.push(t); } catch { /* ignore */ } };
    browser.on("targetcreated", onTarget);

    const state: PageState = { openChain: [], dirty: true };
    let navStatus = 0;
    const loadErrs = new Set<string>();
    const load = async () => {
      const eb = cErrs.length;
      const resp = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 45_000 }).catch(() => null);
      navStatus = resp?.status?.() ?? navStatus;
      await sleep(250);
      state.openChain = []; state.dirty = false;
      for (const e of cErrs.slice(eb)) loadErrs.add(e);
    };
    const pageResults: Any[] = [];
    const ovfSeen = new Set<string>();
    let wroteInGroup = false;

    for (const it of rowsOfPage) {
      total.n++;
      const shouldBeHidden = it.hiddenFor.includes(base);
      if (state.dirty || urlKey(page.url()) !== urlKey(`${BASE}${path}`) || !isPrefix(state.openChain, it.opener)) await load();
      const rec = (bucket: string, ok: boolean, detail = "", extra: Any = {}) => pageResults.push({ testid: it.testid, ok, bucket, detail, ...extra });
      const errsBefore = cErrs.length;

      const rv = await reveal(page, path, it, state, shouldBeHidden);
      if (shouldBeHidden) {
        if (rv.el) { hiddenLeak.push({ page: it.page, testid: it.testid, user, device, detail: "อยู่ใน hiddenFor แต่มองเห็นได้" }); rec("hiddenLeak", false); }
        else { passedN.n++; rec("passed", true, "absent (hiddenFor)"); }
        continue;
      }
      if (!rv.el) {
        const why = `${rv.reason}${navStatus >= 400 ? ` · หน้าตอบ HTTP ${navStatus}` : ""}`;
        if (it.needs) { total.n--; skippedNeeds.push({ page: it.page, testid: it.testid, user, device, needs: it.needs, detail: why }); rec("skippedNeeds", true, why); }
        else { dead.push({ page: it.page, testid: it.testid, user, device, detail: why }); rec("dead-missing", false, why); }
        continue;
      }
      if (it.guard) { total.n--; skippedSafety.push({ page: it.page, testid: it.testid, user, device, reason: it.guard }); rec("skippedSafety", true, it.guard); continue; }
      if (it.testid === "crm-portal-invite-email") {
        const on = await rv.el.evaluate((e: Any) => e.getAttribute("aria-checked") === "true" || e.checked === true).catch(() => false);
        if (on) await clickEl(page, rv.el, it.testid).catch(() => {});
        passedN.n++; rec("passed", true, "left OFF on purpose (safety)"); continue;
      }

      let el = rv.el;
      let prefilled: string[] = [];
      if (it.expect.type === "mutation" || it.kind === "form") {
        prefilled = await prefill(page, it, rowsOfPage, el, base);
        if (prefilled.length) el = (await findVisible(page, it.testid, it.notList, 1500)) ?? el;
      }
      const tagName: string = await el.evaluate((e: Element) => e.tagName.toLowerCase()).catch(() => "");
      const isField = FIELD_TAGS.has(tagName);

      // ── pre-action probes ──
      await page.evaluate(() => { (window as Any).__qcMut = 0; if (!(window as Any).__qcObs) { const o = new MutationObserver(() => { (window as Any).__qcMut++; }); o.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true }); (window as Any).__qcObs = o; } else { (window as Any).__qcMut = 0; } }).catch(() => {});
      const urlBefore = page.url();
      const reqBefore = reqCount; const nonGetBefore = nonGetCount; const respBefore = respLog.length; const tabsBefore = newTabs.length;
      const uiBefore = it.expect.type === "ui" && it.expect.state === "changes" && it.expect.target ? await uiSnapshot(page, it.expect.target) : null;
      const { parsed, unparsed } = it.expect.type === "mutation" ? parseDbClauses(it.expect.db) : { parsed: [], unparsed: [] };
      const countsBefore = new Map<string, number | null>();
      for (const c of parsed) if (c.op !== "eq" && !countsBefore.has(c.model)) countsBefore.set(c.model, await countScoped(c.model));

      // ── act ──
      let actErr = ""; let valueChanged = false; let fileSkipped = false;
      try {
        if (it.kind === "drag") {
          const drops = await page.$$(selOf(it.expect.dropTarget ?? ""));
          const to = drops[drops.length - 1] ?? null;
          if (!to) throw new Error(`ไม่พบปลายทางลาก ${it.expect.dropTarget}`);
          const a = (await el.boundingBox())!, b = (await to.boundingBox())!;
          const sx = a.x + a.width / 2, sy = a.y + a.height / 2, tx = b.x + b.width / 2, ty = b.y + 12;
          await page.mouse.move(sx, sy); await page.mouse.down(); await sleep(300);
          for (let i = 1; i <= 14; i++) { await page.mouse.move(sx + ((tx - sx) * i) / 14, sy + ((ty - sy) * i) / 14); await sleep(30); }
          await page.mouse.up();
        } else if ((it.kind === "form" || it.kind === "filter") && tagName === "form") {
          await el.evaluate((f: Any) => { if (typeof f.requestSubmit === "function") f.requestSubmit(); else f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
        } else if (isField || it.kind === "toggle" || it.kind === "select" || it.kind === "input" || it.kind === "textarea") {
          const r = await fillEl(page, el, it.testid);
          if (r.skipped === "file") fileSkipped = true;
          valueChanged = r.before !== r.after;
        } else {
          await clickEl(page, el, it.testid);
        }
      } catch (e) { actErr = e instanceof Error ? e.message.slice(0, 160) : String(e); }

      if (fileSkipped) {
        total.n--; skippedSafety.push({ page: it.page, testid: it.testid, user, device, reason: "input[type=file] — อัปโหลดขึ้นที่เก็บไฟล์จริง (ไม่กด)" }); rec("skippedSafety", true, "file upload");
        state.dirty = true; continue;
      }

      // ── dead-control detector (3 s) ──
      let deadFlag = actErr !== "";
      if (!deadFlag) {
        deadFlag = true;
        for (let i = 0; i < 20; i++) {
          const mut = isField ? 0 : await page.evaluate(() => (window as Any).__qcMut ?? 0).catch(() => 1);
          if (valueChanged || mut > 0 || reqCount > reqBefore || page.url() !== urlBefore || newTabs.length > tabsBefore) { deadFlag = false; break; }
          await sleep(150);
        }
      }
      if (nonGetCount > nonGetBefore) wroteInGroup = true;
      if (deadFlag) {
        const d = actErr || (isField ? "ค่าในช่องไม่เปลี่ยน (ถูกปิด/อ่านอย่างเดียว?) และไม่มี request" : "ไม่มี DOM mutation/navigation/network ภายใน 3 วิ");
        dead.push({ page: it.page, testid: it.testid, user, device, detail: d }); rec("dead", false, d, { prefilled });
        state.dirty = true; continue;
      }

      // ── expect ──
      let ok = true; let detail = "";
      const cands = [it.expect.target, ...(it.expect.anyOf ?? [])].filter((x): x is string => !!x);
      const tabUrls = async () => { const out: string[] = []; for (const t of newTabs.slice(tabsBefore)) { try { out.push(t.url()); } catch { /* */ } } return out; };
      const type = it.expect.type;
      if (type === "modal" || type === "toast") {
        let found = false;
        const deadline = Date.now() + 6000;
        while (!found && Date.now() < deadline) {
          for (const t of cands) { if (looksLikeTestid(t) && (await findVisible(page, t, [], 0))) { found = true; break; } }
          if (!found) await sleep(200);
        }
        ok = found; detail = found ? "" : `ไม่เห็น ${cands.join(" | ")} ภายใน 6 วิ`;
      } else if (type === "navigate") {
        if (cands.some((t) => t === "history:back" || t.startsWith("mailto:"))) ok = true;
        else {
          ok = false;
          for (let i = 0; i < 40 && !ok; i++) {
            const urls = [page.url(), ...(await tabUrls())];
            ok = urls.some((u) => cands.some((t) => navMatches(t, u)));
            if (!ok) await sleep(200);
          }
          if (!ok) detail = `url=${urlKey(page.url())}${newTabs.length > tabsBefore ? ` · แท็บใหม่=${(await tabUrls()).map(urlKey).join(",")}` : ""} ไม่ตรงกับ ${cands.join(" | ")}`;
        }
      } else if (type === "ui") {
        const target = it.expect.target ?? "";
        if (it.expect.state === "disappears") {
          let gone = false;
          for (let i = 0; i < 20 && !gone; i++) { gone = !(await findVisible(page, target, [], 0)); if (!gone) await sleep(150); }
          ok = gone; detail = gone ? "" : `${target} ยังมองเห็นได้`;
        } else if (it.expect.state === "changes") {
          let after: string | null = null;
          for (let i = 0; i < 20; i++) { after = await uiSnapshot(page, target); if (after !== null && after !== uiBefore) break; await sleep(200); }
          ok = after !== null && after !== uiBefore;
          detail = ok ? "" : `${target} ไม่เปลี่ยนภายใน 4 วิ (ก่อน=${uiBefore === null ? "ไม่มีอยู่" : "มีอยู่"} · หลัง=${after === null ? "ไม่มีอยู่" : "มีอยู่"})`;
        } else {
          const found = await findVisible(page, target, [], 5000);
          ok = !!found; detail = found ? "" : `ไม่เห็น ${target}`;
        }
      } else if (type === "download") {
        await settle(page, 6000);
        const newResp = respLog.slice(respBefore);
        const hit = newResp.find((r) => /attachment/i.test(r.disposition) || /csv|octet-stream|spreadsheet|pdf|json/.test(r.contentType) && !/text\/x-component/.test(r.contentType) || /\.(csv|pdf|xlsx|json)(\?|$)/.test(r.url));
        const tabs = await tabUrls();
        ok = !!hit || tabs.length > 0; detail = ok ? "" : "ไม่พบ response ที่เป็นไฟล์/แท็บดาวน์โหลด";
      } else if (type === "mutation") {
        await settle(page, 8000);
        const newResp = respLog.slice(respBefore);
        const nonGet = nonGetCount > nonGetBefore;
        const bad = newResp.filter((r) => r.status >= 400);
        ok = nonGet && bad.length === 0;
        detail = !nonGet ? "ไม่มี request เขียน (POST/server action) ระหว่างกด" : bad.length ? `มี response ≥400: ${bad.map((r) => `${r.status} ${urlKey(r.url).slice(0, 60)}`).join(",")}` : "";
        if (unparsed.length) { const k = `${it.page}#${it.testid}`; dbCheckUnparsed.set(k, [...new Set([...(dbCheckUnparsed.get(k) ?? []), ...unparsed])]); }
        if (ok) {
          for (const c of parsed) {
            if (c.op === "inc" || c.op === "dec") {
              const before = countsBefore.get(c.model) ?? null;
              if (before === null) continue;
              const want = c.op === "inc" ? before + 1 : before - 1;
              let after = await countScoped(c.model);
              for (let i = 0; i < 10 && after !== want; i++) { await sleep(400); after = await countScoped(c.model); }
              if (after !== null && after !== want) { ok = false; detail += ` · ${c.model} ${before}→${after} (คาด ${want})`; }
            } else if (c.op === "eq" && c.column) {
              const id = primaryIdOf(it.page, ctx);
              if (!id || !c.model.startsWith(it.page.includes("deals") ? "CrmDeal" : it.page.includes("contacts") ? "CrmContact" : it.page.includes("companies") ? "CrmCompany" : "CustomRecord")) continue;
              const actual = await readColumn(c.model, id, c.column);
              if (actual === undefined) continue;
              if (!coerceEq(actual, c.value ?? "")) { ok = false; detail += ` · ${c.model}.${c.column}=${String(actual)} (คาด ${c.value})`; }
            }
          }
        }
        if (ok && it.expect.resultTarget) {
          const found = await findVisible(page, it.expect.resultTarget, [], 6000);
          if (!found) { ok = false; detail += ` · ไม่เห็น resultTarget ${it.expect.resultTarget}`; }
        }
      } else if (type === "inline-error") {
        ok = true; // soft — C4.3 owns deliberate bad-input assertions (see CONTRACT)
      }
      if (!ok) { wrongExpect.push({ page: it.page, testid: it.testid, user, device, detail: detail.replace(/^ · /, "") }); rec("wrongExpect", false, detail.replace(/^ · /, ""), { prefilled }); }
      else { passedN.n++; rec("passed", true, "", prefilled.length ? { prefilled } : {}); }

      // ── console errors + overflow attributed to this row ──
      if (cErrs.length > errsBefore) consoleErrors.push({ page: it.page, testid: it.testid, user, device, detail: cErrs.slice(errsBefore, errsBefore + 3).join(" | ") });
      const ovf = await page.evaluate((ww: number) => document.documentElement.scrollWidth > ww + 2 ? document.documentElement.scrollWidth : 0, w).catch(() => 0);
      if (ovf && !ovfSeen.has(urlKey(page.url()))) { ovfSeen.add(urlKey(page.url())); overflow.push({ page: it.page, testid: it.testid, user, device, detail: `scrollWidth ${ovf} > ${w} หลังกด ${it.testid} (url ${urlKey(page.url())})` }); }

      // ── close stray tabs · next state ──
      for (const t of newTabs.splice(tabsBefore)) { try { const p = await t.page(); await p?.close(); } catch { /* */ } }
      const urlChanged = urlKey(page.url()) !== urlKey(urlBefore);
      if (urlChanged) state.dirty = true;
      else if (isField || ((it.kind === "toggle") && type !== "mutation")) { /* field fills keep the page state (PREFILL builds on it) */ }
      else if (ok && (type === "modal" || (type === "ui" && (it.expect.state ?? "appears") === "appears"))) state.openChain.push(it.testid);
      else state.dirty = true;
      if (DESTRUCTIVE_RE.test(it.testid) && nonGetCount > nonGetBefore) { await restoreSnapshot(`${it.page}#${it.testid} ${device} (ซ่อมข้อมูลซีด)`, { keepNew: true }); state.dirty = true; }
    }

    // initial-load console errors (before any row) + group-level http errors
    const status = navStatus;
    const arr = perPage.get(rowsOfPage[0]!.page) ?? [];
    arr.push({ user, device, path, status, results: pageResults, consoleErrors: cErrs, httpErrors: httpErrs, ms: Date.now() - t0 });
    perPage.set(rowsOfPage[0]!.page, arr);
    if (loadErrs.size) consoleErrors.push({ page: rowsOfPage[0]!.page, testid: "(page load)", user, device, detail: [...loadErrs].slice(0, 3).join(" | ") });
    browser.off("targetcreated", onTarget);
    await page.close().catch(() => {});
    if (wroteInGroup) await restoreSnapshot(`${rowsOfPage[0]!.page} ${device}`);
    const passedHere = pageResults.filter((r) => r.ok).length;
    console.log(`  [${gi}/${groups.size}] ${user} ${device} ${rowsOfPage[0]!.page} — ${passedHere}/${pageResults.length} ok · ${((Date.now() - t0) / 1000).toFixed(0)} วิ`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// --discover (opener discovery — read-only presses, depth ≤ 2)
// ═══════════════════════════════════════════════════════════════════
const DISCOVER_KINDS = new Set(["button", "menu", "tab", "toggle", "link"]);
function isOpenerCandidate(it: PlanItem): boolean {
  if (!DISCOVER_KINDS.has(it.kind) || it.guard) return false;
  if (["mutation", "navigate", "download"].includes(it.expect.type)) return false;
  if (it.expect.type === "ui" && it.expect.state === "disappears") return false;
  if (/(cancel|close|backdrop|dismiss|clear|reset|-no)$/.test(it.testid)) return false;
  return true;
}
const matchesTestid = (pattern: string, t: string) => (pattern.includes("*") ? globRe(pattern).test(t) : pattern === t);

async function discover(browser: Any, ctx: Ctx, items: PlanItem[]): Promise<void> {
  for (const user of userKeys) {
    let cookies: Any[];
    try { cookies = await mintSession(user, ctx); } catch (e) { console.log(`  ⚠️ ข้าม ${user}: ${e instanceof Error ? e.message : e}`); continue; }
    const out: Any[] = [];
    const groups = new Map<string, PlanItem[]>();
    for (const it of items.filter((i) => i.user === user && !i.hiddenFor.includes(user.startsWith("customer") ? "customer" : user))) {
      const k = `${it.path}·${it.device}`; const a = groups.get(k) ?? []; a.push(it); groups.set(k, a);
    }
    let gi = 0;
    for (const [key, its] of groups) {
      gi++;
      const [path, device] = key.split("·") as [string, string];
      const [, w, h] = VIEWPORTS.find((v) => v[0] === device)!;
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: device === "mobile", hasTouch: device === "mobile" });
      await page.setCookie(...cookies);
      await page.evaluateOnNewDocument(NAME_SHIM);
      page.on("dialog", (d: Any) => d.dismiss().catch(() => {}));
      let nonGet = 0;
      page.on("request", (r: Any) => { if (!["GET", "HEAD", "OPTIONS"].includes(r.method())) nonGet++; });
      const load = async () => { await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 45_000 }).catch(() => null); await sleep(250); };
      await load();
      const V0 = new Set(await visibleTestids(page));
      const uniq = new Map<string, PlanItem>(); for (const it of its) if (!uniq.has(it.testid)) uniq.set(it.testid, it);
      const cands = [...uniq.values()].filter(isOpenerCandidate);
      const entries: Any[] = [];
      const tried = new Set<string>();
      let frontier: string[][] = cands.filter((c) => [...V0].some((t) => matchesTestid(c.testid, t) && !c.notList.includes(t))).map((c) => [c.testid]);
      for (let depth = 1; depth <= 2 && frontier.length; depth++) {
        const next: string[][] = [];
        for (const chain of frontier) {
          const k = chain.join(" > "); if (tried.has(k)) continue; tried.add(k);
          await load();
          const ng = nonGet;
          let err = "";
          for (const t of chain) {
            const el = await findVisible(page, t, uniq.get(t)?.notList ?? [], 2500);
            if (!el) { err = `ไม่เห็น ${t}`; break; }
            await clickEl(page, el, t).catch((e: unknown) => { err = String(e).slice(0, 80); });
            await settle(page, 2500); await sleep(300);
          }
          const V1 = await visibleTestids(page);
          const revealed = V1.filter((t) => !V0.has(t));
          entries.push({ chain, revealed, url: urlKey(page.url()), err: err || undefined, wrote: nonGet > ng || undefined });
          if (depth < 2 && !err) for (const c of cands) if (!chain.includes(c.testid) && revealed.some((t) => matchesTestid(c.testid, t))) next.push([...chain, c.testid]);
        }
        frontier = next;
      }
      out.push({ page: its[0]!.page, path, device, V0: [...V0], entries });
      await page.close().catch(() => {});
      console.log(`  [${gi}/${groups.size}] discover ${user} ${device} ${its[0]!.page} — ${entries.length} การกด`);
      writeFileSync(`${SHOTS}/discover-${user.replace(/[^a-z0-9]/gi, "_")}.json`, JSON.stringify({ at: new Date().toISOString(), user, groups: out }, null, 1));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// main
// ═══════════════════════════════════════════════════════════════════
async function main() {
  console.log(`\n═══ QC CRM v2 · C4.2 — press everything (registry-driven) ═══`);
  console.log(`[env] DB tenant ${TENANT} · system ${SYS} · answer key ${EXPECTED_PATH} · users ${userKeys.join(",")} · devices ${VIEWPORTS.map((v) => v[0]).join(",")} · dry=${DRY} · discover=${DISCOVER} · pageFilter=${PAGE_FILTER ?? "-"}\n`);

  const ctx = await buildCtx();
  if (UNRESOLVED.length) {
    console.log(`── ตัวแปรบริบทที่หาค่าจริงไม่ได้ (หน้าที่ต้องใช้ค่านี้จะถูกข้าม) ──`);
    for (const u of UNRESOLVED) console.log(`  · [${u.placeholder}] ${u.reason}`);
  }
  const { items, skipped } = buildPlan(ctx);

  if (DRY) {
    const byUser: Record<string, number> = {};
    for (const it of items) byUser[it.user] = (byUser[it.user] ?? 0) + 1;
    const withOpener = new Set(ROWS.filter((r) => openerOf(r).length).map((r) => r.testid)).size;
    const withNeeds = ROWS.filter((r) => r.needs).length;
    const problems = validateOpeners();
    console.log(`── PLAN (--dry ไม่เปิดเบราว์เซอร์) ──`);
    console.log(`  รวม ${items.length} การกด · ข้าม ${skipped.length} · แถวมี opener ${withOpener} · แถวมี needs ${withNeeds} · ปัญหา opener/needs ${problems.length}`);
    for (const p of problems.slice(0, 30)) console.log(`  ❌ ${p}`);
    for (const [u, n] of Object.entries(byUser)) console.log(`  · ${u}: ${n}`);
    const reasons = new Map<string, number>();
    for (const s of skipped) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1);
    for (const [r, n] of reasons) console.log(`  ⏭️  ${n}× ${r}`);
    writeFileSync(`${SHOTS}/plan-dry.json`, JSON.stringify({ at: new Date().toISOString(), total: items.length, byUser, skipped, openerProblems: problems }, null, 2));
    console.log(`JSON_SUMMARY ${JSON.stringify({ dry: true, total: items.length, byUser, skippedCount: skipped.length, openerProblems: problems.length })}`);
    await P.$disconnect();
    process.exit(problems.length ? 1 : 0);
  }

  const ping = await fetch(BASE, { redirect: "manual", signal: AbortSignal.timeout(8_000) }).catch((e: unknown) => e as Error);
  if (ping instanceof Error) throw new Fatal(`ต่อ QC server ${BASE} ไม่ได้ (${ping.message}) — สั่ง \`bash scripts/acc-v2-serve.sh start\` ให้ขึ้นก่อน แล้วรันซ้ำ`);
  console.log(`🌐 QC server ${BASE} ตอบ HTTP ${ping.status}`);

  const pptr = await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string).catch((e: unknown) => {
    throw new Fatal(`เปิด puppeteer-core ไม่ได้ (${e instanceof Error ? e.message : e}) — ต้องมี /root/dive3d/node_modules/puppeteer-core`);
  });
  // CSV fixture for the import rows (inside the repo — snap chromium cannot read the host /tmp)
  mkdirSync(".qc-shots/c42/fixtures", { recursive: true });
  writeFileSync(".qc-shots/c42/fixtures/qc-btn-import.csv", `name,phone,email,company\nqc-btn-${rand}-import,0899999999,qc-btn-${rand}-import@example.com,qc-btn-${rand}-co\n`);
  // portal fixture BEFORE the snapshot, so the mid-run restores keep it (removed explicitly in CLEAN)
  if (userKeys.some((u) => u === "customer")) await ensurePortalFixture(ctx);
  await takeSnapshot();
  const udd = `/tmp/chr-crm-btn-${process.pid}`;
  const browser = await (pptr as Any).default.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${udd}`],
  });
  try {
    if (DISCOVER) await discover(browser, ctx, items);
    else for (const user of userKeys) await runUser(browser, user, ctx, items);
  } finally {
    await browser.close().catch(() => {});
    try { (await import("node:fs")).rmSync(udd, { recursive: true, force: true }); } catch { /* snap private tmp — best effort */ }
    // ── CLEAN: exact restore, then the tag sweep, then this run's own fixtures/sessions ──
    PROTECT.clear();
    const fin = await restoreSnapshot("CLEAN (จบรอบ)");
    let cleaned = 0;
    for (const s of SWEEP) {
      try {
        const where = s.scope === "systemId" ? { systemId: SYS, [s.field]: { contains: "qc-btn-" } } : { tenantId: TENANT, [s.field]: { contains: "qc-btn-" } };
        cleaned += (await P[toCamel(s.model)].deleteMany({ where })).count;
      } catch { /* model/field mismatch — ignore */ }
    }
    if (MINE.portalAccessIds.length) { try { cleaned += (await P.crmPortalAccess.deleteMany({ where: { id: { in: MINE.portalAccessIds } } })).count; } catch { /* ignore */ } }
    if (MINE.tokenHashes.length) { for (const mdl of ["portalSession", "customerSession"]) { try { cleaned += (await P[mdl]?.deleteMany?.({ where: { tokenHash: { in: MINE.tokenHashes } } }))?.count ?? 0; } catch { /* ignore */ } } }
    if (MINE.sessionIds.length) { try { cleaned += (await P.session.deleteMany({ where: { id: { in: MINE.sessionIds } } })).count; } catch { /* ignore */ } }
    if (PORTAL_ENABLED_BEFORE === false) { try { await P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{crm,portal,enabled}', 'false'::jsonb, true) WHERE id = $1`, SYS); } catch { /* ignore */ } }
    const stale = await P.session.deleteMany({ where: { userAgent: UA, expiresAt: { lt: new Date() } } }).catch(() => ({ count: 0 }));
    console.log(`\n🧹 คืนฐานครั้งสุดท้าย: ลบ ${fin.deleted} · คืนค่า ${fin.updated} · สร้างคืน ${fin.recreated} · ค้าง ${fin.failed.length} · กวาดแท็ก/session ${cleaned}${stale.count ? ` (+ซากหมดอายุ ${stale.count})` : ""}`);
    if (fin.failed.length) for (const f of fin.failed.slice(0, 10)) console.log(`   ❌ ${f}`);
  }
}

let fatal = "";
try {
  await main();
} catch (e) {
  fatal = e instanceof Fatal ? e.message : `ผิดพลาดกลางคัน — ${e instanceof Error ? (e.stack ?? e.message).slice(0, 500) : String(e)}`;
}

if (!DRY && !DISCOVER) {
  writeFileSync(`${SHOTS}/summary.json`, JSON.stringify({
    at: new Date().toISOString(), users: userKeys, devices: VIEWPORTS.map((v) => v[0]), pageFilter: PAGE_FILTER,
    total: total.n, passed: passedN.n,
    dead, wrongExpect, hiddenLeak, consoleErrors, overflow,
    skippedNeeds, skippedSafety, restores: restoreLog, dbCheckUnparsed: Object.fromEntries(dbCheckUnparsed), fatal: fatal || null,
  }, null, 2));
  for (const [page, entries] of perPage) {
    const fname = `${SHOTS}/${page.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "root"}.json`;
    writeFileSync(fname, JSON.stringify({ page, entries }, null, 2));
  }
  console.log(`\n${!fatal && passedN.n === total.n ? "🟢" : "🔴"} C4.2: ${passedN.n}/${total.n} · dead ${dead.length} · wrongExpect ${wrongExpect.length} · hiddenLeak ${hiddenLeak.length} · overflow ${overflow.length} · skippedNeeds ${skippedNeeds.length} · skippedSafety ${skippedSafety.length}`);
}
if (fatal) console.error(`❌ ${fatal}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: total.n, passed: passedN.n, dead: dead.length, wrongExpect: wrongExpect.length, hiddenLeak: hiddenLeak.length, consoleErrors: consoleErrors.length, overflow: overflow.length, skippedNeeds: skippedNeeds.length, skippedSafety: skippedSafety.length, restoreFailures: restoreLog.reduce((a, r) => a + r.failed.length, 0), fatal: fatal || null })}`);
await P.$disconnect().catch(() => {});
process.exit(fatal ? 2 : 0);
