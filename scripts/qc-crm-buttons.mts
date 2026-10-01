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
//            it "dirty" (clicked anything that is not a pure text/select fill / an opener that passed — a ticked checkbox/
//            radio/switch IS dirty: it adds/removes later fields), the URL differs from
//            the row's page, or the row needs a different opener chain than the one currently open. (Pilot run 1 kept
//            ONE load per page: the first link that navigated made every later row on that page "missing".)
// OPENER     row.opener (string | string[] chain, registry testids, patterns allowed; "<testid>=<value>" = choose that
//            option/type that value — builders reveal fields per chosen value; on one of the 4 CSV-import file inputs
//            the value is a fixture file name in .qc-shots/c42/fixtures, e.g. "contacts-import-file=qc-btn-import.csv"
//            → uploaded, which reveals the column mapping + enables submit; "=*" = any real choice — first option ≠
//            current and ≠ "" of a select (ids differ per seed) or a typed qc-btn- value; "=on"/"=off" on a checkbox =
//            make sure it is (un)ticked — for selections that ENABLE a control that is always visible, e.g. the deal
//            table's bulk bar: a plain opener is skipped when the row is already visible; "=click" = press this button
//            unconditionally, e.g. "crm-auto-add-condition=click" twice for the AND/OR selector) = controls to press FIRST so the
//            row's control exists (sheet/dialog/menu/tab/row-selection). Each opener is pressed only when neither it
//            nor anything later in the chain/the row itself is already visible (the same row is often inline on
//            desktop but behind a sheet on 390 px). A missing opener ⇒ dead (or skippedNeeds when the row has `needs`).
// VIEWPORT   row.viewport ("desktop"|"mobile") = the control exists in one layout only ⇒ the other viewport is not planned.
// NEEDS      row.needs (text) = data precondition the standard seed may not satisfy (e.g. "ผู้ติดต่อที่มีลำดับติดตาม").
//            Control present ⇒ pressed and asserted as usual; absent — or present but disabled / a select with no other
//            option AND the press did nothing — ⇒ `skippedNeeds[]` (NOT dead, not in total).
// SELECTOR   exact testid → first VISIBLE match (desktop/mobile twins share a testid; when several are visible and the first
//            is ACTIVE — aria-pressed/selected/current — or disabled, the first active-able twin: team-card · the ☆ of a
//            non-primary contact, company-contact-primary-btn) · `*` pattern → first visible match
//            that is actually clickable (button/a[href]/input/select/textarea/[role=button|link|menuitem|tab|switch|
//            checkbox|option]) and not in `not` · `only` expands one row into one item per exact testid.
// ACTION     button|link|menu|tab|toggle → element click (falls back to DOM .click() when the pointer hit-test fails) ·
//            select → first option ≠ current · input|textarea → type a value shaped by the testid + the input's type
//            (date/time/number/datetime-local/color/range set through the native setter + input/change events) ·
//            input[type=file] → CSV fixture for import rows, otherwise skippedSafety (upload = external storage/AI) ·
//            form|filter → requestSubmit() · drag → mouse drag onto the FIRST `expect.dropTarget` match that is not the card’s own column (next stage) ·
//            *-backdrop → click a corner (close handlers check e.target === e.currentTarget).
// PREFILL    before a `mutation`/`download` row / `form` row: every fill row of the same page (any order, any chain) whose control
//            sits inside the same <form>/dialog as this control is filled if still empty (unchecked toggles ticked) —
//            submit buttons are disabled/refused on an empty form, and the fill rows usually ran before a reload.
// DEAD       click-like rows: within 3 s no DOM mutation, no navigation, no new request, no new tab ⇒ dead.
//            fill rows (input/textarea/select/toggle-as-checkbox): dead ⇔ the value/checked state did not change.
// EXPECT     ui/selected → no dead check (idempotent selector); the target must expose aria-selected|pressed|checked=true
//            or aria-current after the press · modal/toast → target (or anyOf) becomes VISIBLE within 6 s · navigate → URL (this tab or a new tab)
//            matches target/anyOf within 8 s (history:back / mailto:* soft) · ui → appears / disappears (3 s) /
//            changes (polled 4 s — debounced search) · download → a file-looking response or new tab · mutation → a
//            non-GET request fired, none ≥400, network settled, parsed `db` count deltas (`Model +1/-1`, counted
//            BEFORE vs AFTER) and literal `Model.col=value` on detail pages hold, `resultTarget` appears, and no NEW
//            role=alert / *-error text appeared (a server action answering { ok:false } is a refusal, not a write —
//            exempt when the row's db text says the refusal is the point: ปฏิเสธ / ข้อความไทย) ·
//            inline-error → soft (C4.3 owns bad-input assertions).
// SAFETY     DIRECT_SEND_GUARD rows (real e-mail/OTP) are never pressed · crm-portal-invite-email is kept OFF (unticked
//            before EVERY click on a page that shows it — SAFETY_UNTICK) ·
//            CROSS_MODULE_GUARD rows (running document numbers / payroll / POS sale / real AI or storage) are never
//            pressed · all are listed in skippedSafety[] with the reason.
// WRITES     SNAPSHOT/RESTORE: before the first press the runner snapshots every row of SNAP_MODELS for this tenant;
//            after every page×viewport group that sent a non-GET request it restores the snapshot exactly (rows created
//            since are deleted, changed rows are written back, deleted rows are re-created); right after every
//            DESTRUCTIVE row (archive/delete/merge/erase/convert/…) it REPAIRS seeded rows only (keepNew) so the next
//            row sees the seed again while data created earlier in the group survives for the `needs` rows (which
//            run last in their group). Typed values are `qc-btn-<rand>`; the old
//            tag sweep stays as a second net. The DB is serialised by scripts/with-gate-lock.sh for the whole run.
// SAFETY-DB  snapshot/restore reads THROW on any error (a model missing from the client is skipped, never restored) —
//            no read failure can look like an empty table · restore refuses to delete a row created before the snapshot
//            that the snapshot lacks · every snapshot/restore/purge (and the whole non-dry run) refuses to start unless
//            an ancestor process is scripts/with-gate-lock.sh's `flock /tmp/shark-gate*.lock` · controls in wo-notes §12.
// FIXTURES   (ruling §9/§11) set BEFORE the snapshot, reverted in CLEAN, originals in .qc-shots/c42/fixture-originals.json
//            (a crashed run is healed by the next start): portal enabled (level-by-level JSON merge) · the representative
//            company's tax id → 0105599000001 (valid check digit) · AUDIT-STATE rows (state read back from AuditLog, which is
//            never deleted): contact-privacy-erase / -reason / -confirm / -submit / -cancel run on a runner-owned throwaway
//            contact per user×viewport (deleted in CLEAN). Known residual: crm.deal.reassign audit rows feed a daily
//            cross-team reassign cap (deal-owner-select · deal-bulk-reassign · crm-home-unowned-submit).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// requires: crm-seed (answer key via CRM_EXPECTED_PATH or scripts/crm-expected.json) — SKIPPED (exit 0, no DB touch)
//   if missing. Exit 2 (Fatal, Thai message) if the QC server at $QC_BASE (default http://127.0.0.1:3215) does not answer.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

const accEnv = (await import(`${process.cwd()}/scripts/acc-v2-env.mts` as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const cq = (await import(`${process.cwd()}/scripts/crm-qc-env.mts` as string)) as { CQC: Any };
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
const SHOTS = process.env.QC_BTN_SHOTS || `${CQC.shotsDir}/buttons`; // c42b: debug runs beside a frozen pass write elsewhere
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DL_DIR = resolvePath(".qc-shots/c42/dl");
let RUN_OBJECT_KEY = ""; // ctx.objectKey — set in main (fillValueFor has no ctx)
const DOWNLOADS: { name: string; bytes: number; state: string }[] = [];

// ───────────────────────────── registry + answer key ─────────────────────────────
const INVENTORY_PATH = process.env.QC_BTN_REGISTRY || "scripts/crm-ui-inventory.json"; // c42b: staged registry for debug runs
type Row = {
  page: string;
  testid: string;
  kind: string;
  roles: string[];
  hiddenFor: string[];
  expect: {
    type: string; target?: string; db?: string;
    anyOf?: string[]; resultTarget?: string; state?: "appears" | "disappears" | "changes" | "selected"; dropTarget?: string; note?: string;
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
  ["crm-home-ai-draft", "ปุ่ม disabled ตามแบบ (AI หน้าแรกยังไม่เปิดใช้ — ปิดไว้ถาวรใน HomeAside) · ตรวจแค่มองเห็น/hiddenLeak"],
  ["crm-home-ai-summary", "ปุ่ม disabled ตามแบบ (AI หน้าแรกยังไม่เปิดใช้ — ปิดไว้ถาวรใน HomeAside) · ตรวจแค่มองเห็น/hiddenLeak"],
  // emails.ts addDomain() POSTs the domain to the real Resend account (providerId) — the snapshot removes the EmailDomain
  // row but not the domain registered at the provider
  ["crm-email-domain-add", "ลงทะเบียนโดเมนผู้ส่งกับ Resend จริง (คืนค่าฝั่งผู้ให้บริการไม่ได้)"],
  // 🔴 it2 incident (27 Sep 19:07): the PDPA erase flag is an AuditLog row (erased.ts — crm.contact.erase), and the runner
  //    does not (and must not) delete audit history ⇒ the snapshot cannot undo an erase; the seed's representative contact
  //    stayed "erased" on QC1 (every write to it refused). Never press it again.
  ["contact-privacy-erase-submit", "ลบข้อมูลส่วนบุคคล PDPA จริง — ธงถูกลบอยู่ใน AuditLog (crm.contact.erase) ซึ่ง snapshot คืนไม่ได้ (เหตุการณ์ it2 27 ก.ย.)"],
  // portal writes into the ACCOUNT ledger, which SNAP_MODELS does not cover
  ["portal-quote-confirm-submit", "ตอบรับ/ปฏิเสธใบเสนอราคาในระบบบัญชี (AccountDocument.status — snapshot ไม่ครอบตารางบัญชี)"],
  ["portal-pay-promptpay", "ออกคำขอชำระเงิน PromptPay ในระบบบัญชี (AccountPaymentRequest — snapshot ไม่ครอบตารางบัญชี)"],
]);
// AI_GUARD — paid LLM calls (runAssist → resolveProvider). Pressed ONLY when the QC server runs SHARK_AI_MOCK=1, read from
// the controller's BUILD-STATE ("READY … ai=mock"); otherwise skippedSafety. Phase 1 found the 7 CrmAiPanel buttons unguarded
// while .env.qc carries the real SHARK_AI_KEY; Phase 2 (27 Sep, build ce728fd8) runs ai=mock ⇒ all 10 are pressed.
const AI_GUARD = new Map<string, string>([
  ["crm-home-ai-risk", "ลิงก์ไปแผง AI ดีลเสี่ยง"], ["crm-ai-home-at-risk", "เรียก AI"], ["crm-ai-deal-next-step", "เรียก AI"],
  ["crm-ai-contact-why-hot", "เรียก AI"], ["crm-ai-contact-closing", "เรียก AI"], ["crm-ai-company-summary", "เรียก AI"],
  ["crm-ai-company-upsell", "เรียก AI"], ["crm-ai-deal-summary", "เรียก AI"], ["crm-ai-deal-risk", "เรียก AI"], ["crm-ai-deal-draft-email", "เรียก AI"],
]);
const BUILD_STATE_PATH = process.env.QC_BUILD_STATE ?? "/root/projects/shark-crm/.qc-shots/crm/BUILD-STATE";
const AI_MOCK = (() => { try { return /^READY\b.*\bai=mock\b/m.test(readFileSync(BUILD_STATE_PATH, "utf8")); } catch { return false; } })();
if (!AI_MOCK) for (const [k, v] of AI_GUARD) CROSS_MODULE_GUARD.set(k, `${v} จริง (เครดิต AI — เซิร์ฟเวอร์ QC ไม่ได้รัน SHARK_AI_MOCK=1 ตาม ${BUILD_STATE_PATH})`);
// DESTRUCTIVE — rows after which the snapshot is restored IMMEDIATELY (the next row must not see an archived/merged/
// deleted/erased/converted entity or a switched UI version). Everything else is restored at the end of its page group.
const DESTRUCTIVE_RE = /(archive|delete|merge|erase|remove|revoke|convert|lost-confirm|reopen-submit|uiversion|template-apply|template-none|bulk|unowned-submit|restore|deal-card-|recompute|rotate|approve|reject|change-pipeline|stage-step)/;
// c42b FULL_REPAIR — destructive rows whose NEW rows change what the seed entity IS for every later row (convert creates a
// Customer/Party link ⇒ the seed contact reads as member-linked: run2 owner 390 consent/opt-out rows wrote to the member
// side) ⇒ the repair after them is a FULL restore (new rows deleted too), not keepNew
//   it4-A: + teams-create-form/-submit — the new team becomes the SELECTED team of /app/settings/teams (newest first) and
//   has no members ⇒ run2 owner team-member-remove-cancel "opener missing" · team-member-add-* refused (TeamsManager.tsx)
const FULL_REPAIR_RE = /(convert-(submit|done)|^teams-create-(form|submit))$/;
// it4-A OWNERSHIP rows — hand the OPEN entity to someone else; a persona whose visibility is TEAM-scoped loses the page
//   (run2 manager /deals/[dealId]: deal-owner-select picked the first other owner ⇒ every later row on that page 404,
//   33 "dead"; dealWhere is correct to hide it) ⇒ repaired right after (keepNew: the entity's own row is written back)
const OWNERSHIP_RE = /^(deal-owner-select|company-owner-submit)$/;
/** rows after which the seed is repaired: DESTRUCTIVE ones + FULL_REPAIR / OWNERSHIP ones that are not destructive by name */
// it4-A (C5.4-E): a confirmed lifecycle correction turns the fixture company CUSTOMER → PROSPECT, which removes the button
// the next row (`company-lifecycle-correct-cancel`) opens with (page.tsx:175) ⇒ repair right after it like an ownership change
const STATE_FLIP_RE = /^company-lifecycle-correct-confirm$/;
const repairsAfter = (tid: string): boolean => DESTRUCTIVE_RE.test(tid) || FULL_REPAIR_RE.test(tid) || OWNERSHIP_RE.test(tid) || STATE_FLIP_RE.test(tid);
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
  partyId: string | null; slug: string | null; pageSlug: string | null; conversationId: string | null; unitId: string | null;
  perUser: Record<string, { dealId: string | null; contactId: string | null; companyId: string | null; partyId: string | null; recordId?: string | null; linesDealId?: string | null; threadKey?: string | null; conversationId?: string | null }>;
  linesDealId: string | null; // c42b: oracle-owned OPEN deal WITH lines (rows whose query has tab=lines open it)
  sequenceId: string | null; threadKey: string | null; token: string | null; docType: string | null; docId: string | null;
  unlinkedConversationId: string | null; // it4-A: a chat room whose ChatContact party has NO CRM contact (crm-panel-create-lead)
  lifecycleCompanyId: string | null; // it4-A (C5.4-E rows): runner-owned live CUSTOMER company with NO won deal (LIFECYCLE_ROW_RE rows open it)
  posSysId: string | null; memberSysId: string | null; hrSysId: string | null; accountSysId: string | null; chatSysId: string | null;
};
const UNRESOLVED: { placeholder: string; reason: string }[] = [];
const note = (placeholder: string, reason: string) => UNRESOLVED.push({ placeholder, reason });
/** c42b vacuity proof — which record each persona opens and why the product lets it see that record */
const PICKS: { user: string; entity: string; id: string | null; why: string }[] = [];
const userKeyOf = (uid: string | null | undefined): string => (uid ? Object.entries(E.users ?? {}).find(([, v]) => (v as Any)?.userId === uid)?.[0] ?? uid.slice(-6) : "-");
/** the persona's REAL actor (QC1 Membership → the product's toMemberActor) — same object every page builds per request */
async function actorOf(u: string): Promise<{ uid: string; actor: Any } | null> {
  const uid: string | undefined = (E.users?.[u] as Any)?.userId;
  if (!uid) return null;
  const m = await P.membership.findFirst({ where: { userId: uid, tenantId: TENANT }, select: { role: true, unitAccess: true, permissions: true } });
  if (!m) return null;
  const { toMemberActor } = (await import("@/lib/modules/member/access" as string)) as Any;
  return { uid, actor: toMemberActor(uid, m) };
}

/** live lookups — best-effort; every failure degrades to `null` + a note, never throws (this file must survive a half-seeded QC db) */
async function buildCtx(): Promise<Ctx> {
  const ctx: Ctx = {
    dealId: E.dealIds?.[0] ?? null, contactId: E.contactIds?.[0] ?? null, companyId: E.companyIds?.[0] ?? null,
    recordId: null, objectKey: null, partyId: null, slug: CQC.tenantSlug ?? null, pageSlug: null, perUser: {}, conversationId: null, linesDealId: null,
    unitId: E.units?.patong ?? E.units?.kata ?? null,
    sequenceId: null, threadKey: null, token: null, docType: null, docId: null, unlinkedConversationId: null, lifecycleCompanyId: null,
    posSysId: E.systems?.POS ?? null, memberSysId: E.systems?.MEMBER ?? null, hrSysId: E.systems?.HR ?? null,
    accountSysId: E.systems?.ACCOUNT ?? null, chatSysId: E.systems?.CHAT ?? null,
  };
  // the deal 360 page must show an OPEN deal: the seed's dealIds[0] is WON on QC1 (reseed 27 Sep) ⇒ no lost button, lines
  // and value read-only, no delete — it1 counted 58 "dead" on /deals/[dealId] for that alone
  try {
    const open = await P.crmDeal.findFirst({ where: { id: { in: (E.dealIds ?? []) as string[] }, kind: "OPEN", archivedAt: null }, select: { id: true }, orderBy: { createdAt: "asc" } });
    if (open?.id) ctx.dealId = open.id; else note("dealId", "ไม่มีดีลเปิด (kind OPEN) ใน dealIds ของซีด — หน้าดีล 360 จะเป็นดีลปิด");
  } catch (e) { note("dealId", `query ล้ม — ${e instanceof Error ? e.message : e}`); }
  // /p/[slug] is a PAGE slug (Page.slug, global), not the tenant slug — it3: /p/<tenant slug> answered 404 for every row
  try {
    const pw = await P.pageWidget.findFirst({ where: { tenantId: TENANT, widgetKey: { contains: "crm" } }, select: { page: { select: { slug: true, active: true } } } });
    ctx.pageSlug = pw?.page?.active ? pw.page.slug : null;
    if (!ctx.pageSlug) note("slug (/p)", "ไม่มี Page ที่เปิดอยู่และวาง widget CRM ในร้านนี้ (/p/[slug] ข้ามทั้งหน้า)");
  } catch (e) { note("slug (/p)", `query ล้ม — ${e instanceof Error ? e.message : e}`); }
  // PER-USER entities: nok/thana only see records they own (visibility policy) — it3 opened thana's records for nok ⇒ every
  // /deals/[dealId] · /contacts/[contactId] row answered 404 (86 + 94 "dead"). Owner/manager keep the shared picks.
  // records inherit their PARENT's visibility (it3: manager 404 on CT-2569-012 — owned by manager, parent company in nok's
  // team) ⇒ every role opens a record whose parent company is in one of its own teams
  for (const u of ["manager", "nok", "thana"]) {
    const uid: string | undefined = (E.users?.[u] as Any)?.userId;
    if (!uid || !E.contractObjectId) continue;
    try {
      const teams = (await P.teamMember.findMany({ where: { userId: uid }, select: { teamId: true } })).map((t: Any) => t.teamId);
      const cos = (await P.crmCompany.findMany({ where: { id: { in: (E.companyIds ?? []) as string[] }, OR: [{ ownerUserId: uid }, { teamId: { in: teams } }] }, select: { id: true } })).map((c: Any) => c.id);
      const rec = cos.length ? await P.customRecord.findFirst({ where: { objectId: E.contractObjectId, archivedAt: null, parentId: { in: cos } }, select: { id: true }, orderBy: { createdAt: "asc" } }) : null;
      ctx.perUser[u] = { ...(ctx.perUser[u] ?? { dealId: null, contactId: null, companyId: null, partyId: null }), recordId: rec?.id ?? null };
    } catch (e) { note(`${u} record`, `query ล้ม — ${e instanceof Error ? e.message : e}`); }
  }
  // c42b (it4 · no vacuous checks): EVERY staff persona's deal/contact/company is chosen THROUGH THE PRODUCT'S OWN
  // visibility filter (where.ts dealWhere/contactWhere/companyWhere with the persona's real membership → toMemberActor) —
  // owner/manager keep the shared pick when it is visible to them, nok/thana take their OWN record (TEAM policy), and the
  // proof (who owns it · which filter admitted it) is printed + written to summary.picks. A persona without the read key
  // (nok/thana have no crm.company.read) gets its OWN record (policy-visible, key-blocked): the page must 404 by the key,
  // which is exactly what the registry's hiddenFor claims — and the vacuity guard in runUser checks the status.
  for (const u of ["owner", "manager", "nok", "thana"]) {
    const who = await actorOf(u);
    if (!who) continue;
    try {
      const W = (await import("@/lib/modules/crm/where" as string)) as Any;
      const sctx = { tenantId: TENANT, systemId: SYS, actorUserId: who.uid };
      const shared = u === "owner" || u === "manager";
      const pick = async (model: string, whereFn: string, sharedId: string | null, extra: Any, label: string, readKey: string): Promise<Any | null> => {
        const vis = await W[whereFn](sctx, who.actor);
        const ids = (E[`${label}Ids`] ?? []) as string[];
        const sel = { id: true, ownerUserId: true, teamId: true, ...(model === "crmContact" ? { partyId: true } : {}) };
        const tries: [string, Any][] = [
          ...(shared && sharedId ? [["ของกลาง (shared pick)", { id: sharedId }] as [string, Any]] : []),
          ["ของตัวเอง (ownerUserId = ผู้ใช้)", { id: { in: ids }, ownerUserId: who.uid }],
          ["มองเห็นตามนโยบาย", { id: { in: ids } }],
        ];
        for (const [why, w] of tries) {
          const r = await P[model].findFirst({ where: { AND: [vis, { ...extra, ...w }] }, select: sel, orderBy: { createdAt: "asc" } });
          if (r) { PICKS.push({ user: u, entity: label, id: r.id, why: `${why} · ผ่าน ${whereFn}() ของ product · owner=${userKeyOf(r.ownerUserId)} team=${r.teamId ?? "-"}` }); return r; }
        }
        // no read key ⇒ the filter admits nothing: take the persona's OWN record — its page must 404 BY THE KEY
        const own = await P[model].findFirst({ where: { ...extra, id: { in: ids }, ownerUserId: who.uid }, select: sel, orderBy: { createdAt: "asc" } });
        PICKS.push({ user: u, entity: label, id: own?.id ?? null, why: own ? `ไม่มีคีย์ ${readKey} (${whereFn} ว่าง) ⇒ ใช้ของตัวเอง owner=${u} — หน้าต้อง 404 ตามคีย์ (registry hiddenFor)` : `ไม่มีระเบียนที่มองเห็นได้/ของตัวเอง` });
        return own;
      };
      const d = await pick("crmDeal", "dealWhere", ctx.dealId, { kind: "OPEN", archivedAt: null }, "deal", "crm.deal.read");
      const c = await pick("crmContact", "contactWhere", ctx.contactId, { archivedAt: null, mergedIntoId: null }, "contact", "crm.contact.read");
      const co = await pick("crmCompany", "companyWhere", ctx.companyId, { archivedAt: null, mergedIntoId: null }, "company", "crm.company.read");
      ctx.perUser[u] = { ...(ctx.perUser[u] ?? {}), dealId: d?.id ?? null, contactId: c?.id ?? null, companyId: co?.id ?? null, partyId: c?.partyId ?? null };
      if (!d || !c || !co) note(`${u} entities`, `ไม่มีดีลเปิด/ผู้ติดต่อ/บริษัทที่ ${u} มองเห็นได้ครบทุกชนิด (ใช้ของกลางแทนตัวที่ขาด)`);
    } catch (e) { note(`${u} entities`, `query ล้ม — ${e instanceof Error ? e.message : e}`); }
  }
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
      // it4-A: the CRM panel links a room to a CRM contact by PARTY (crm-panel-actions.ts getChatCrmPanelAction: briefFor
      //   {partyId: ChatContact.partyId}) — not by phone. QC1 has 0 linked rooms ⇒ the "linked" rows open a runner-owned room
      //   per persona (createExtraFixtures); crm-panel-create-lead needs a room whose party has NO CRM contact:
      for (const cv of await P.chatConversation.findMany({ where: { systemId: ctx.chatSysId }, select: { id: true, contact: { select: { partyId: true } } }, orderBy: { createdAt: "asc" }, take: 50 })) {
        const pid = cv.contact?.partyId ?? null;
        if (pid && await P.crmContact.count({ where: { systemId: SYS, partyId: pid } })) continue;
        ctx.unlinkedConversationId = cv.id; break;
      }
      if (!ctx.unlinkedConversationId) note("unlinkedConversationId", "ไม่มีห้องแชทที่ยังไม่ผูกผู้ติดต่อ CRM");
    } else note("chatId/conversationId", "ไม่มีระบบ CHAT ในซีด หรือไม่มีผู้ติดต่อตัวแทน");
  } catch (e) { note("chatId/conversationId", `query ล้ม — ${e instanceof Error ? e.message : e}`); }

  // email thread (C2.5) — read-only lookup; NOT created here (needs the real send-transport chain to be authentic)
  try {
    // c42b: QC1's only thread (3 messages, 28 Sep) belongs to a contact that no longer exists ⇒ 404 for everyone (correct).
    //   The runner seeds its OWN thread per persona contact (THREADS fixture, below) — this lookup is only the fallback.
    const msg = ctx.dealId ? await P.crmEmailMessage.findFirst({ where: { systemId: SYS, dealId: ctx.dealId }, select: { threadKey: true } }) : null;
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
    // c42b: the lines tab opens the persona's oracle-owned deal WITH lines (QC1 seeds none — see LINES_DEALS)
    id: sysR.id, dealId: /(^|&)tab=lines(&|$)/.test(row.query ?? "") ? (ctx.linesDealId ?? (DRY ? "dry-lines-deal" : null)) : ctx.dealId, contactId: ctx.contactId,
    // it4-A (C5.4-E): the lifecycle-correction rows open the runner-owned CUSTOMER company without a won deal (see createExtraFixtures)
    companyId: LIFECYCLE_ROW_RE.test(row.testid) ? (ctx.lifecycleCompanyId ?? (DRY ? "dry-lifecycle-company" : null)) : ctx.companyId,
    recordId: ctx.recordId, key: ctx.objectKey, partyId: ctx.partyId, slug: row.page.startsWith("/p/") ? ctx.pageSlug : ctx.slug,
    token: ctx.token, docType: ctx.docType, docId: ctx.docId, conversationId: ctx.conversationId,
    unitId: ctx.unitId, sequenceId: ctx.sequenceId, threadKey: ctx.threadKey, unlinkedConversationId: ctx.unlinkedConversationId,
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

/** a `*` row never presses an element another registry row owns: every exact testid (incl. `only` members) and every
 *  pattern that this pattern also matches is excluded (deal-card-* ≠ deal-card-link-* · contact-menu-* ≠ contact-menu-btn ·
 *  contact-*-submit ≠ contact-convert-submit) — iteration 1: the first visible match was often the sibling row's control */
const ALL_NAMES: string[] = [...new Set(ROWS.flatMap((r) => [String(r.testid ?? "").trim(), ...(r.only ?? [])]).filter(Boolean))];
function ownedElsewhere(pattern: string): string[] {
  if (!pattern.includes("*")) return [];
  const re = new RegExp(`^${pattern.split("*").map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
  return ALL_NAMES.filter((n) => n !== pattern && re.test(n));
}
// AUDIT-STATE rows (controller ruling §11b, 27 Sep): their effect is read back from AuditLog / append-only history, which
// the snapshot never restores (audit rows are never deleted) — e.g. contact-privacy-erase-submit: the "erased" flag IS the
// crm.contact.erase audit row, so erasing a seed contact poisons every later writer on it (it2: call-save refused on the
// seed contact after the erase row). These rows run on a runner-owned throwaway contact ("qc-btn-throwaway-…", created
// before the snapshot, one per user×viewport, deleted in CLEAN; its audit rows stay as harmless history).
// Known residual (not a fixture yet): crm.deal.reassign audit rows count toward a per-actor daily cross-team cap.
const AUDIT_STATE_ROWS = new Set(["contact-privacy-erase", "contact-privacy-erase-reason", "contact-privacy-erase-confirm", "contact-privacy-erase-submit", "contact-privacy-erase-cancel"]);
const THROWAWAY = new Map<string, string>(); // `${user}|${device}` → CrmContact id
async function createThrowaways(): Promise<void> {
  const owner = (E.users?.owner?.userId as string | undefined) ?? null;
  for (const u of userKeys) for (const [d] of VIEWPORTS) {
    const c = await P.crmContact.create({ data: { tenantId: TENANT, systemId: SYS, name: `qc-btn-throwaway-${rand}-${u.replace(/[^a-z]/g, "")}-${d}`, ownerUserId: owner }, select: { id: true } });
    THROWAWAY.set(`${u}|${d}`, c.id);
  }
  console.log(`🧩 throwaway contacts (AUDIT-STATE rows): ${THROWAWAY.size}`);
}
// c42b DEAL-WITH-LINES fixture: QC1 has 0 CrmDealLine rows ⇒ the `deal-line-*` rows (inputs for crm.deal.lines holders,
// read-only text for everyone else — Deal360Actions.tsx ~:398) were never exercised. Before the snapshot the runner clones
// each persona's picked OPEN deal (same owner/team/pipeline/stage/contact ⇒ same visibility) as "qc-btn-lines-…" with two
// lines; rows whose `query` contains tab=lines open that deal. One clone per distinct picked deal (owner/manager/thana
// share thana's · nok its own). Deleted (lines cascade) in CLEAN and when the snapshot fails.
const LINES_DEALS = new Map<string, string>(); // source deal id → clone id
async function createLinesDeals(ctx: Ctx): Promise<void> {
  for (const u of userKeys) {
    if (u.startsWith("customer")) continue;
    const src = ctxForUser(ctx, u).dealId;
    if (!src) continue;
    if (!LINES_DEALS.has(src)) {
      const row = await P.crmDeal.findUnique({ where: { id: src } });
      if (!row) continue;
      const data = toData("CrmDeal", row);
      for (const k of ["id", "createdAt", "updatedAt", "quotationDocId", "invoiceDocId", "kanbanCardId", "pendingLines", "pendingApprovalRequestId", "lostReasonId", "lostReason", "closedAt", "wonValueSatang"]) delete data[k];
      const clone = await P.crmDeal.create({ data: { ...data, title: `qc-btn-lines-${rand}-${userKeyOf(row.ownerUserId)}`, kind: "OPEN", valueSatang: 25_000, paidSatang: BigInt(0) }, select: { id: true } });
      await P.crmDealLine.createMany({ data: [
        { tenantId: TENANT, dealId: clone.id, name: `qc-btn-line-a-${rand}`, qty: 2, unitPriceSatang: 10_000, discountBp: 0, sortOrder: 0, note: "qc-btn line note" },
        { tenantId: TENANT, dealId: clone.id, name: `qc-btn-line-b-${rand}`, qty: 1, unitPriceSatang: 5_000, discountBp: 1_000, vatRateBp: 700, sortOrder: 1 },
      ] });
      LINES_DEALS.set(src, clone.id);
    }
    const id = LINES_DEALS.get(src)!;
    ctx.perUser[u] = { ...(ctx.perUser[u] ?? { dealId: null, contactId: null, companyId: null, partyId: null }), linesDealId: id };
    // proof: the clone is admitted by the product's dealWhere for this persona (same owner/team as the source pick)
    let ok = false;
    try { const who = await actorOf(u); if (who) { const W = (await import("@/lib/modules/crm/where" as string)) as Any; ok = !!(await P.crmDeal.findFirst({ where: { AND: [await W.dealWhere({ tenantId: TENANT, systemId: SYS, actorUserId: who.uid }, who.actor), { id }] }, select: { id: true } })); } } catch { ok = false; }
    PICKS.push({ user: u, entity: "linesDeal", id, why: `โคลนของดีล ${src} + 2 บรรทัด (qc-btn-) · dealWhere ของ product ${ok ? "ยอมรับ" : "❌ ไม่ยอมรับ"}` });
  }
  console.log(`🧩 deal-with-lines fixtures: ${LINES_DEALS.size}`);
}
async function deleteLinesDeals(): Promise<void> {
  if (!LINES_DEALS.size) return;
  try { const d = await P.crmDeal.deleteMany({ where: { id: { in: [...LINES_DEALS.values()] }, tenantId: TENANT } }); console.log(`🧩 ลบดีลมีบรรทัด ${d.count}`); }
  catch (e) { console.log(`  ⚠️ ลบดีลมีบรรทัดไม่สำเร็จ — ${e instanceof Error ? e.message : e}`); }
}
// c42b E-MAIL THREAD fixture: one inbound message (RECEIVED, qc-btn- subject, @example.com sender) per persona's picked
// contact ⇒ /emails/[threadKey] renders for crm.email.read holders (owner/manager) and must 404 BY THE KEY for nok/thana on
// a thread of a contact they CAN see. Created before the snapshot, deleted in CLEAN. Sending stays DIRECT_SEND_GUARDed.
const THREADS = new Map<string, { threadKey: string; id: string }>(); // contactId → fixture message
async function createThreadFixtures(ctx: Ctx): Promise<void> {
  const { randomBytes } = await import("node:crypto");
  for (const u of userKeys) {
    if (u.startsWith("customer")) continue;
    const cid = ctxForUser(ctx, u).contactId;
    if (!cid) continue;
    if (!THREADS.has(cid)) {
      const c = await P.crmContact.findUnique({ where: { id: cid }, select: { email: true, name: true } });
      const threadKey = randomBytes(16).toString("hex");
      const tag = `${rand}${THREADS.size}`;
      const m = await P.crmEmailMessage.create({ data: {
        tenantId: TENANT, systemId: SYS, contactId: cid, direction: "IN", messageId: `<qc-btn-${tag}@example.com>`, threadKey,
        fromAddr: `qc-btn-${tag}@example.com`, fromName: c?.name ?? "qc-btn", toAddrs: ["sales@example.com"], subject: `qc-btn-thread ${tag}`,
        bodyText: "qc-btn fixture thread (C4.2 runner)", snippet: "qc-btn fixture thread", status: "RECEIVED", receivedAt: new Date(),
        trackTokenHash: randomBytes(32).toString("hex"),
      }, select: { id: true } });
      THREADS.set(cid, { threadKey, id: m.id });
    }
    const t = THREADS.get(cid)!;
    ctx.perUser[u] = { ...(ctx.perUser[u] ?? { dealId: null, contactId: null, companyId: null, partyId: null }), threadKey: t.threadKey };
    PICKS.push({ user: u, entity: "emailThread", id: t.threadKey, why: `ข้อความเข้า 1 ฉบับของตัวกด (qc-btn-) ผูกผู้ติดต่อ ${cid} ที่ ${u} มองเห็น — ไม่มีคีย์ crm.email.read ⇒ หน้าต้อง 404 ตามคีย์` });
  }
  console.log(`🧩 e-mail thread fixtures: ${THREADS.size}`);
}
async function deleteThreadFixtures(): Promise<void> {
  if (!THREADS.size) return;
  try { const d = await P.crmEmailMessage.deleteMany({ where: { id: { in: [...THREADS.values()].map((t) => t.id) }, tenantId: TENANT } }); console.log(`🧩 ลบเธรดอีเมลของตัวกด ${d.count}`); }
  catch (e) { console.log(`  ⚠️ ลบเธรดอีเมลของตัวกดไม่สำเร็จ — ${e instanceof Error ? e.message : e}`); }
}
/** the entities a given user can open (chosen through the product's visibility filter — see buildCtx PER-USER) */
// it4-A EXTRA FIXTURES (run2 owner triage, 1 Oct) — runner-owned rows the seed lacks, created BEFORE the snapshot and only
// when a selected row needs them (so other chunks see the seed unchanged), deleted in CLEAN + the safety net. `*` rows
// whose matches include a fixture id press the fixture (PREFER_IDS in findVisible) — never a seed entity.
//   · empty pipeline + an empty OPEN stage in the default pipeline: QC1's 2 pipelines hold 40/15 open deals and every
//     default-pipeline stage holds deals ⇒ archivePipeline/deleteStage refuse BY DESIGN (pipelines.ts archivePipeline
//     "ยังมีดีลที่เปิดอยู่" · deleteStage "ขั้นนี้มีดีลอยู่") — pl-archive-submit / st-delete-* need an empty one.
//   · sequence with 2 versions: QC1 has NO seed sequence (the only one is a journey leftover "qc-jrn-us5…", 28 Sep) and
//     the stats-version select lists versions 1..seq.version (sequences.ts stats()) ⇒ one option = nothing to choose.
//   · a lead created NOW: the home "lead sources" box counts contacts created in the CURRENT period (home-data.ts
//     leadSourcesOf, default period = this month) — the seed's contacts are from September ⇒ empty from 1 Oct (time-rot).
//   · one deal saved view per owner/manager persona (MemberSavedView objectKey=deal, PRIVATE): seed has 0 ⇒ the home chip
//     opens "ยังไม่มีมุมมอง" and crm-home-saved-view-item-* can never appear.
//   · one chat room per persona LINKED to the persona's CRM contact by party (ChatContact.partyId = CrmContact.partyId):
//     the panel's contact/log-activity controls exist only for a linked room (crm-panel-actions.ts logActivity: !!brief.contact).
//   · (C5.4-E) a live CUSTOMER company with NO won deal: `company-lifecycle-correct*` render only for a live CUSTOMER company
//     to OWNER/MANAGER (companies/[companyId]/page.tsx:175 `live && canUpdate && … && c.lifecycleStage === "CUSTOMER"`) and
//     setCompanyLifecycle refuses while the company holds a WON deal (companies.ts COMPANY_HAS_WON_DEAL_MSG) — every QC1
//     CUSTOMER company holds exactly one WON deal (facts8.mts) ⇒ the confirm row could only ever see the refusal.
const LIFECYCLE_ROW_RE = /^company-lifecycle-correct(-|$)/;
const XFIX: { model: string; id: string }[] = [];
const PREFER_IDS: string[] = [];
const selRow = (re: RegExp) => ROWS.some((r) => re.test(r.testid) && pageSelected(r.page));
async function createExtraFixtures(ctx: Ctx): Promise<void> {
  const ownerUid = (E.users?.owner?.userId as string | undefined) ?? null;
  if (selRow(/^(pl-archive-submit|st-delete-\*)$/)) {
    const pipe = await P.crmPipeline.create({ data: { tenantId: TENANT, systemId: SYS, name: `qc-btn-empty-${rand}`, isDefault: false, sortOrder: 90,
      stages: { create: [{ tenantId: TENANT, systemId: SYS, name: `qc-btn-empty-${rand}`, kind: "OPEN", sortOrder: 0, probability: 10 }] } }, select: { id: true } });
    XFIX.push({ model: "crmPipeline", id: pipe.id }); PREFER_IDS.push(pipe.id);
    const def = await P.crmPipeline.findFirst({ where: { systemId: SYS, isDefault: true, archivedAt: null }, select: { id: true, stages: { select: { sortOrder: true } } } });
    if (def) {
      const st = await P.crmStage.create({ data: { tenantId: TENANT, systemId: SYS, pipelineId: def.id, name: `qc-btn-empty-stage-${rand}`, kind: "OPEN", probability: 10,
        sortOrder: def.stages.reduce((m: number, x: Any) => Math.max(m, x.sortOrder), -1) + 1 }, select: { id: true } });
      XFIX.push({ model: "crmStage", id: st.id }); PREFER_IDS.push(st.id);
    }
    PICKS.push({ user: "*", entity: "emptyPipeline/Stage", id: pipe.id, why: "pipeline ว่าง + ขั้นว่างใน pipeline หลักของตัวกด (qc-btn-empty-) — แถว pl-archive-* / st-* กดตัวนี้" });
  }
  if (ROWS.some((r) => r.page.includes("[sequenceId]") && pageSelected(r.page))) {
    const seq = await P.crmSequence.create({ data: { tenantId: TENANT, systemId: SYS, name: `qc-btn-seq-${rand}`, version: 2, createdById: ownerUid,
      steps: { create: [
        { tenantId: TENANT, version: 1, index: 0, kind: "EMAIL", subject: "qc-btn v1 {{contact.firstName}}", body: "qc-btn v1" },
        { tenantId: TENANT, version: 2, index: 0, kind: "EMAIL", subject: "qc-btn v2 {{contact.firstName}}", body: "qc-btn v2" },
        { tenantId: TENANT, version: 2, index: 1, kind: "WAIT", waitDays: 3 },
      ] } }, select: { id: true } });
    XFIX.push({ model: "crmSequence", id: seq.id });
    ctx.sequenceId = seq.id;
    PICKS.push({ user: "*", entity: "sequence", id: seq.id, why: "ลำดับของตัวกด 2 เวอร์ชัน (qc-btn-seq-) — ซีดไม่มีลำดับ · ตัวเลือกเวอร์ชันมี 2 ค่า" });
  }
  if (selRow(/^crm-home-source-row-/)) {
    const c = await P.crmContact.create({ data: { tenantId: TENANT, systemId: SYS, name: `qc-btn-lead-${rand}`, ownerUserId: ownerUid }, select: { id: true } });
    XFIX.push({ model: "crmContact", id: c.id });
    PICKS.push({ user: "*", entity: "leadNow", id: c.id, why: "ผู้ติดต่อที่สร้างตอนนี้ (qc-btn-lead-) — กล่องที่มา lead นับเฉพาะงวดปัจจุบัน" });
  }
  if (selRow(/^crm-home-saved-view$/)) {
    for (const u of userKeys) {
      if (!["owner", "manager"].includes(u)) continue;
      const uid = (E.users?.[u]?.userId as string | undefined) ?? null;
      if (!uid) continue;
      const v = await P.memberSavedView.create({ data: { tenantId: TENANT, systemId: SYS, ownerUserId: uid, scope: "PRIVATE", objectKey: "deal", name: `qc-btn-view-${rand}-${u}`, filters: {} }, select: { id: true } });
      XFIX.push({ model: "memberSavedView", id: v.id });
      PICKS.push({ user: u, entity: "dealView", id: v.id, why: "มุมมองดีลส่วนตัวของบทบาทนี้ (qc-btn-view-) — ซีดมี 0" });
    }
  }
  if (ctx.chatSysId && ROWS.some((r) => /\[conversationId\]/.test(r.query ?? "") && pageSelected(r.page))) {
    const byParty = new Map<string, string>();
    for (const u of userKeys) {
      if (u.startsWith("customer")) continue;
      const cid = ctxForUser(ctx, u).contactId;
      const c = cid ? await P.crmContact.findUnique({ where: { id: cid }, select: { partyId: true, name: true } }) : null;
      if (!c?.partyId) { note(`${u} conversationId`, `ผู้ติดต่อ ${cid ?? "-"} ไม่มี partyId — ใช้ห้องที่ไม่ผูก CRM`); continue; }
      if (!byParty.has(c.partyId)) {
        const cc = await P.chatContact.create({ data: { tenantId: TENANT, systemId: ctx.chatSysId, channel: "WEBCHAT", externalUserId: `qc-btn-${rand}-${byParty.size}`, displayName: `qc-btn-chat-${c.name ?? rand}`, partyId: c.partyId }, select: { id: true } });
        const cv = await P.chatConversation.create({ data: { tenantId: TENANT, systemId: ctx.chatSysId, channel: "WEBCHAT", contactId: cc.id }, select: { id: true } });
        XFIX.push({ model: "chatConversation", id: cv.id }, { model: "chatContact", id: cc.id });
        byParty.set(c.partyId, cv.id);
      }
      const conv = byParty.get(c.partyId)!;
      ctx.perUser[u] = { ...(ctx.perUser[u] ?? { dealId: null, contactId: null, companyId: null, partyId: null }), conversationId: conv };
      PICKS.push({ user: u, entity: "chatRoom", id: conv, why: `ห้องแชทของตัวกด ผูกปาร์ตี้ของผู้ติดต่อ ${cid} (briefFor ของ product เห็นผู้ติดต่อตามสิทธิ์ของบทบาท)` });
    }
  }
  if (selRow(LIFECYCLE_ROW_RE)) {
    // same owner/team as the shared company pick ⇒ same visibility for owner/manager (proved below through companyWhere)
    const srcId = ctxForUser(ctx, "owner").companyId ?? ctx.companyId;
    const src = srcId ? await P.crmCompany.findUnique({ where: { id: srcId }, select: { ownerUserId: true, teamId: true } }) : null;
    const name = `qc-btn-lifecycle-${rand}`;
    const party = await P.party.create({ data: { tenantId: TENANT, kind: "COMPANY", name }, select: { id: true } });
    const co = await P.crmCompany.create({ data: { tenantId: TENANT, systemId: SYS, partyId: party.id, name, lifecycleStage: "CUSTOMER",
      ownerUserId: src?.ownerUserId ?? ownerUid, teamId: src?.teamId ?? null }, select: { id: true } });
    XFIX.push({ model: "crmCompany", id: co.id }, { model: "party", id: party.id });
    ctx.lifecycleCompanyId = co.id;
    for (const u of ["owner", "manager"]) {
      if (!userKeys.includes(u)) continue;
      let ok = false;
      try { const who = await actorOf(u); if (who) { const W = (await import("@/lib/modules/crm/where" as string)) as Any; ok = !!(await P.crmCompany.findFirst({ where: { AND: [await W.companyWhere({ tenantId: TENANT, systemId: SYS, actorUserId: who.uid }, who.actor), { id: co.id }] }, select: { id: true } })); } } catch { ok = false; }
      PICKS.push({ user: u, entity: "lifecycleCompany", id: co.id, why: `บริษัท CUSTOMER ไม่มีดีลชนะของตัวกด (qc-btn-lifecycle-) owner/team = ${srcId} · companyWhere ของ product ${ok ? "ยอมรับ" : "❌ ไม่ยอมรับ"}` });
    }
  }
  if (XFIX.length) console.log(`🧩 extra fixtures (it4-A): ${XFIX.length} — ${[...new Set(XFIX.map((x) => x.model))].join(" · ")}`);
}
async function deleteExtraFixtures(): Promise<void> {
  if (!XFIX.length) return;
  let n = 0;
  for (const x of XFIX) { // creation order: conversation before its chat contact · stage/pipeline independent (stage FK cascades from pipeline)
    try { n += (await P[x.model].deleteMany({ where: { id: x.id } })).count; }
    catch (e) { console.log(`  ⚠️ ลบ fixture ${x.model} ${x.id} ไม่สำเร็จ — ${e instanceof Error ? e.message : e}`); }
  }
  console.log(`🧩 ลบ extra fixtures ${n}/${XFIX.length}`);
}
async function extraFixturesLeft(): Promise<number> {
  let n = 0;
  for (const x of XFIX) n += await P[x.model].count({ where: { id: x.id } }).catch(() => 0);
  return n;
}
function ctxForUser(ctx: Ctx, user: UserKey): Ctx {
  const o = ctx.perUser?.[user];
  if (!o) return ctx;
  return { ...ctx, dealId: o.dealId ?? ctx.dealId, contactId: o.contactId ?? ctx.contactId, companyId: o.companyId ?? ctx.companyId, partyId: o.partyId ?? ctx.partyId, recordId: o.recordId ?? ctx.recordId, linesDealId: o.linesDealId ?? ctx.linesDealId, threadKey: o.threadKey ?? ctx.threadKey, conversationId: o.conversationId ?? ctx.conversationId };
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
    const notList = row.only && row.only.length ? [] : [...(row.not ?? []), ...ownedElsewhere(rawTestid)];
    for (const testid of testids) {
      for (const user of userKeys) {
        const ctxU = ctxForUser(ctx, user);
        const cacheKey = `${row.page}|${row.system ?? ""}|${row.query ?? ""}|${user}|${LIFECYCLE_ROW_RE.test(row.testid) ? "lc" : ""}`;
        if (!pageCache.has(cacheKey)) pageCache.set(cacheKey, pageUrl(row, ctxU));
        const { path, reason } = pageCache.get(cacheKey)!;
        if (!applicableUser(row, user)) continue; // silent on this role — registry makes no claim
        if (!path) { skipped.push({ page: row.page, testid, reason: `${reason} (${user})` }); continue; }
        for (const [device, w, h] of VIEWPORTS) {
          if (row.viewport && row.viewport !== device) continue; // layout-specific control — no claim for the other layout
          // AUDIT-STATE rows act on a runner-owned throwaway entity (one per user×viewport), never on a seed row
          let itemPath = path;
          const base0 = user.startsWith("customer") ? "customer" : user;
          if (AUDIT_STATE_ROWS.has(testid) && row.roles.includes(base0)) {
            const tid = THROWAWAY.get(`${user}|${device}`) ?? "dry-throwaway";
            const p2 = pageUrl(row, { ...ctxU, contactId: tid });
            if (p2.path) itemPath = p2.path;
          }
          items.push({
            user, device, w, h, page: row.page, path: itemPath, testid, kind: row.kind, roles: row.roles, hiddenFor: row.hiddenFor,
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
    for (const pg of [r.page, ...(r.alsoOn ?? [])]) { // alsoOn = the same component renders the same testid there too
      const arr = namesOnPage.get(pg) ?? [];
      arr.push(r.testid, ...(r.only ?? []));
      namesOnPage.set(pg, arr);
    }
  }
  const KNOWN_PH = new Set(["id", "dealId", "contactId", "companyId", "recordId", "key", "partyId", "slug", "token", "docType", "docId", "conversationId", "unitId", "sequenceId", "threadKey", "unlinkedConversationId"]);
  for (const r of ROWS) {
    if (r.needs !== undefined && (typeof r.needs !== "string" || !r.needs.trim())) problems.push(`${r.page}#${r.testid}: needs ต้องเป็นข้อความ`);
    // c42b: query = "k=v&k2=[placeholder]" — no leading ?, every pair k=v, every placeholder resolvable by pageUrl()
    if (r.query !== undefined) {
      if (typeof r.query !== "string" || !r.query.trim() || r.query.startsWith("?")) problems.push(`${r.page}#${r.testid}: query ต้องเป็นสตริง k=v ไม่ขึ้นต้นด้วย ?`);
      else {
        for (const pair of r.query.split("&")) if (!/^[A-Za-z0-9_.-]+=[^&]*$/.test(pair)) problems.push(`${r.page}#${r.testid}: query "${r.query}" มีคู่ที่ไม่ใช่ k=v (${pair})`);
        for (const m of r.query.matchAll(/\[([a-zA-Z]+)\]/g)) if (!KNOWN_PH.has(m[1]!)) problems.push(`${r.page}#${r.testid}: query ใช้ [${m[1]}] ที่ตัวกดไม่รู้จัก`);
        if (/(^|&)tab=lines(&|$)/.test(r.query) && r.page !== "/deals/[dealId]") problems.push(`${r.page}#${r.testid}: tab=lines ใช้ได้เฉพาะ /deals/[dealId] (ดีลที่มีบรรทัดของตัวกด)`);
      }
    }
    for (const pg of [r.page]) for (const m of pg.matchAll(/\[([a-zA-Z]+)\]/g)) if (!KNOWN_PH.has(m[1]!)) problems.push(`${r.page}#${r.testid}: page ใช้ [${m[1]}] ที่ตัวกดไม่รู้จัก`);
    if (r.viewport !== undefined && r.viewport !== "desktop" && r.viewport !== "mobile") problems.push(`${r.page}#${r.testid}: viewport ต้องเป็น desktop|mobile`);
    for (const o0 of openerOf(r)) {
      if (typeof o0 !== "string" || !o0.trim()) { problems.push(`${r.page}#${r.testid}: opener ว่าง/ไม่ใช่สตริง`); continue; }
      const o = o0.includes("=") ? o0.slice(0, o0.indexOf("=")) : o0;
      // c42b: "<self>=click" = arm a two-step button first (object-record-archive-btn: 1st press arms, 2nd press writes)
      if (o === r.testid && o0 !== `${r.testid}=click`) { problems.push(`${r.page}#${r.testid}: opener ชี้ตัวเอง`); continue; }
      if (o === r.testid) continue;
      const names = namesOnPage.get(r.page) ?? [];
      // exact name · an exact opener covered by a pattern row · a pattern opener equal to a pattern row or matching
      // ≥1 exact registry name on the page (e.g. "contacts-*-select" = the row checkbox on 1440 / the card checkbox on 390)
      const hit = names.some((n) => n === o || (n.includes("*") && globRe(n).test(o)) || (o.includes("*") && (n === o || (!n.includes("*") && globRe(o).test(n)))));
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

// 🔴 SAFETY (controller review, 27 Sep): a read that fails must NEVER look like "the table is empty". Before this fix
//    readAll() caught every error and returned [] ⇒ a failed SNAPSHOT read made every existing row of that table look
//    "created since the snapshot" ⇒ the restore would delete the whole table for the tenant. Now: a model the client does
//    not have is skipped (null — never snapshotted, never restored); ANY other read error throws RestoreAbort, which
//    stops the run before a single delete. Control: QC_BTN_FAIL_READ=<Model> injects a read failure (see §12 wo-notes).
class RestoreAbort extends Error {}
async function readAll(model: string): Promise<Any[] | null> {
  const delegate = P[toCamel(model)];
  if (!delegate || typeof delegate.findMany !== "function") return null; // model not in this client — not snapshotted
  if (process.env.QC_BTN_FAIL_READ === model) throw new RestoreAbort(`อ่านตาราง ${model} ไม่ได้ (จำลองด้วย QC_BTN_FAIL_READ) — หยุดก่อนลบอะไร`);
  try { return await delegate.findMany({ where: { tenantId: TENANT } }); }
  catch (e) { throw new RestoreAbort(`อ่านตาราง ${model} ไม่ได้ — ${e instanceof Error ? e.message.split("\n").slice(-1)[0]!.slice(0, 160) : e} · หยุดก่อนลบอะไร`); }
}
async function readAllModels(): Promise<Map<string, Any[]>> {
  const out = new Map<string, Any[]>();
  const models = [...SNAP_MODELS];
  for (let i = 0; i < models.length; i += 6) {
    const chunk = models.slice(i, i + 6);
    const res = await Promise.all(chunk.map((m) => readAll(m)));
    chunk.forEach((m, j) => { if (res[j] !== null) out.set(m, res[j]!); });
  }
  return out;
}
let SNAP_AT = 0; // ms — rows created BEFORE this can never be "new since the snapshot"
async function takeSnapshot(): Promise<void> {
  assertGateLockHeld("snapshot");
  SNAP_AT = Date.now();
  const all = await readAllModels();
  SNAP = new Map();
  for (const [m, rows] of all) SNAP.set(m, new Map(rows.map((r) => [r.id as string, r])));
  const n = [...SNAP.values()].reduce((a, m) => a + m.size, 0);
  console.log(`📸 snapshot ${SNAP.size} ตาราง · ${n} แถว (tenant ${TENANT})`);
}
/** the DB writes of this runner (snapshot/restore/purge) are only legal while scripts/with-gate-lock.sh holds the QC lock:
 *  walk this process's ancestors for the `flock … /tmp/shark-gate*.lock` that with-gate-lock execs */
function gateLockHeld(): boolean {
  try {
    let pid = process.pid;
    for (let i = 0; i < 12 && pid > 1; i++) {
      const cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").join(" ");
      if (/\bflock\b.*\/tmp\/shark-gate[^ ]*\.lock/.test(cmd)) return true;
      pid = Number(readFileSync(`/proc/${pid}/stat`, "utf8").replace(/^.*\) /, "").split(" ")[1]);
    }
  } catch { /* no /proc — treat as not held */ }
  return false;
}
function assertGateLockHeld(what: string): void {
  if (process.env.QC_BTN_ALLOW_NO_LOCK === "1") return; // negative control only (§12) — never in a real run
  if (!gateLockHeld()) throw new RestoreAbort(`ปฏิเสธ ${what}: ไม่ได้รันภายใต้ scripts/with-gate-lock.sh (ไม่พบ flock /tmp/shark-gate*.lock ในสายโปรเซสแม่)`);
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
/** c42b OUTBOX SETTLE: asynchronous consumers (outbox drained by the server process) write AFTER the action returned —
 *  dbg1 (1 Oct 04:08): contact-convert-submit → repair deleted the new Customer → 2 s later the member.created consumer
 *  linked the seed contact to that deleted Customer (crm.contact.member.link) ⇒ every later consent row: "ผูกกับสมาชิกที่ไม่พบ".
 *  Before any restore: wait ≤ 15 s until no PENDING OutboxEvent of this tenant created since the snapshot is due. */
async function outboxSettle(label: string): Promise<void> {
  const since = new Date(SNAP_AT - 5_000);
  for (let i = 0; i < 30; i++) {
    const n = await P.outboxEvent.count({ where: { tenantId: TENANT, status: "PENDING", createdAt: { gte: since }, availableAt: { lte: new Date(Date.now() + 1_000) } } }).catch(() => 0);
    if (!n) { if (i) console.log(`  ⏳ outbox ว่างแล้ว ก่อนคืนฐาน (${label}) · รอ ${(i * 0.5).toFixed(1)} วิ`); return; }
    await sleep(500);
  }
  console.log(`  ⚠️ outbox ยังมีงานค้างหลังรอ 15 วิ ก่อนคืนฐาน (${label}) — คืนฐานต่อ (อาจมีผลข้างเคียงมาทีหลัง)`);
}
/** put every SNAP_MODELS row of this tenant back to the snapshot — returns what it had to do (logged in summary) */
async function restoreSnapshot(label: string, opts: { keepNew?: boolean } = {}): Promise<{ deleted: number; updated: number; recreated: number; failed: string[] }> {
  const st = { deleted: 0, updated: 0, recreated: 0, failed: [] as string[] };
  if (!SNAP) return st;
  assertGateLockHeld(`คืนฐาน (${label})`);
  await outboxSettle(label);
  const errs = new Map<string, string>();
  for (let pass = 0; pass < 4; pass++) {
    const cur = await readAllModels();
    let pending = 0;
    // 1) rows that did not exist at snapshot time — children first (mid-group repairs keep them: data an earlier
    //    row created on purpose — a rule, a view, a sequence — is what the page's later `needs` rows press)
    for (const m of opts.keepNew ? [] : [...SNAP_MODELS].reverse()) {
      const snapM = SNAP.get(m); if (!snapM) continue;
      const curM = cur.get(m);
      if (!curM) throw new RestoreAbort(`อ่านตาราง ${m} ตอนคืนฐานไม่ได้ — หยุดก่อนลบ`);
      const cand = curM.filter((r) => !snapM.has(r.id) && !PROTECT.has(r.id));
      // second net: a row created BEFORE the snapshot that the snapshot does not have = the snapshot is incomplete ⇒ never delete
      const old = cand.filter((r) => r.createdAt instanceof Date && r.createdAt.getTime() < SNAP_AT - 2_000);
      if (old.length) throw new RestoreAbort(`ตาราง ${m}: ${old.length} แถวเกิดก่อน snapshot แต่ไม่อยู่ใน snapshot (snapshot ไม่ครบ) — หยุด ไม่ลบ`);
      const extra = cand.map((r) => r.id as string);
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

// ── run fixtures (ruling §9) ──
// 1. the seed's tax ids (01055000000NN) fail the Thai check digit ⇒ the company edit form refuses the company's own value
//    and company-edit-submit can never save. The representative company gets a VALID id for the run: 0105599000001
//    (check digit computed — not used by any seed row); company-new-duplicate-link types the same value.
// 2. the QC1 seed has the customer portal OFF ⇒ invites are refused and the customer role cannot log in — enabled for the run.
const FIXTURE_FILE = ".qc-shots/c42/fixture-originals.json";
const FIX_TAX_ID = "0105599000001";
async function applyFixtures(ctx: Ctx): Promise<void> {
  try {
    const sys = await P.appSystem.findUnique({ where: { id: SYS }, select: { settings: true } });
    const portalOn = !!(sys?.settings as Any)?.crm?.portal?.enabled;
    const co = ctx.companyId ? await P.crmCompany.findUnique({ where: { id: ctx.companyId }, select: { id: true, taxId: true, partyId: true } }) : null;
    const party = co?.partyId ? await P.party.findUnique({ where: { id: co.partyId }, select: { taxId: true } }).catch(() => null) : null;
    const origPortal = (sys?.settings as Any)?.crm?.portal ?? null; // exact original object (null = key absent)
    const orig = { systemId: SYS, portalEnabled: portalOn, portal: origPortal, companyId: co?.id ?? null, taxId: co?.taxId ?? null, partyId: co?.partyId ?? null, partyTaxId: party?.taxId ?? null };
    writeFileSync(FIXTURE_FILE, JSON.stringify(orig, null, 1));
    // 🔴 it2 (27 Sep): jsonb_set(…, '{crm,portal,enabled}', …, true) is a NO-OP when settings.crm.portal does not exist yet
    //    (create_missing only adds the LAST key) — the portal stayed off. Merge the object level by level instead.
    if (!portalOn) await P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{crm}', coalesce(settings->'crm','{}'::jsonb) || jsonb_build_object('portal', coalesce(settings->'crm'->'portal','{}'::jsonb) || '{"enabled":true}'::jsonb), true) WHERE id = $1`, SYS);
    const check = await P.appSystem.findUnique({ where: { id: SYS }, select: { settings: true } });
    if ((check?.settings as Any)?.crm?.portal?.enabled !== true) console.log("  ⚠️ fixture: เปิดพอร์ทัลไม่สำเร็จ (settings.crm.portal.enabled ไม่เป็น true)");
    if (co && co.taxId !== FIX_TAX_ID) {
      await P.crmCompany.update({ where: { id: co.id }, data: { taxId: FIX_TAX_ID } });
      if (co.partyId && party) await P.party.update({ where: { id: co.partyId }, data: { taxId: FIX_TAX_ID } }).catch(() => {});
    }
    console.log(`🧩 fixtures: portal ${portalOn ? "เปิดอยู่แล้ว" : "เปิดชั่วคราว"} · เลขภาษีบริษัทตัวแทน ${co?.taxId ?? "-"} → ${FIX_TAX_ID} (คืนตอนจบ)`);
  } catch (e) { console.log(`  ⚠️ ตั้ง fixture ไม่สำเร็จ — ${e instanceof Error ? e.message : e}`); }
}
async function healFixtures(): Promise<void> {
  if (!existsSync(FIXTURE_FILE)) return;
  try {
    const o = JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as { systemId: string; portalEnabled: boolean; portal?: unknown; companyId: string | null; taxId: string | null; partyId: string | null; partyTaxId: string | null };
    if (o.systemId !== SYS) { console.log(`  ⚠️ ${FIXTURE_FILE} เป็นของระบบอื่น (${o.systemId}) — ไม่แตะ`); return; }
    if (o.portal === null || o.portal === undefined) await P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = settings #- '{crm,portal}' WHERE id = $1`, SYS);
    else await P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{crm,portal}', $2::jsonb, true) WHERE id = $1`, SYS, JSON.stringify(o.portal));
    if (o.companyId) await P.crmCompany.update({ where: { id: o.companyId }, data: { taxId: o.taxId } }).catch(() => {});
    if (o.partyId) await P.party.update({ where: { id: o.partyId }, data: { taxId: o.partyTaxId } }).catch(() => {});
    (await import("node:fs")).rmSync(FIXTURE_FILE, { force: true });
    console.log(`🧩 fixtures คืนค่าเดิมแล้ว (portal ${o.portalEnabled} · เลขภาษี ${o.taxId ?? "null"})`);
  } catch (e) { console.log(`  ⚠️ คืน fixture ไม่สำเร็จ — ${e instanceof Error ? e.message : e} (ไฟล์ ${FIXTURE_FILE} ยังอยู่ — รอบหน้าจะลองใหม่)`); }
}
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
  // multi-* patterns ("st-req-*-*"): prefix before the FIRST *, suffix after the LAST * (it3: the suffix was the literal
  // "-*" ⇒ nothing ever matched); findVisible re-checks the full glob
  const prefix = testid.slice(0, testid.indexOf("*"));
  const suffix = testid.slice(testid.lastIndexOf("*") + 1);
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
    const h = await page.evaluateHandle((pSel: string, nots: string[], pattern: boolean, pSelGlob: string, prefer: string[]) => {
      const TAGS = ["button", "input", "select", "textarea"];
      const ROLES = ["button", "link", "menuitem", "tab", "switch", "checkbox", "option", "radio"];
      const vis = (el: Element) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const cs = getComputedStyle(el as HTMLElement);
        return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden";
      };
      let fallback: Element | null = null;
      let idleFirst: Element | null = null;
      // exact testid shared by a group (team-card × n): the first visible one is often the ACTIVE item, and pressing the
      // active item is a no-op ⇒ prefer the first visible twin that is not marked active (aria-pressed/selected/current)
      if (!pattern) {
        const vis0 = Array.from(document.querySelectorAll(pSel)).filter((e) => !nots.includes(e.getAttribute("data-testid") ?? "") && vis(e));
        const active = (e: Element) => ["aria-pressed", "aria-selected"].some((a) => e.getAttribute(a) === "true") || (e.hasAttribute("aria-current") && e.getAttribute("aria-current") !== "false");
        const off = (e: Element) => (e as HTMLButtonElement).disabled === true || e.getAttribute("aria-disabled") === "true";
        if (vis0.length > 1 && (active(vis0[0]!) || off(vis0[0]!))) return vis0.find((e) => !active(e) && !off(e)) ?? vis0[0]!;
      }
      // it4-A: a pattern whose visible matches include a runner-owned fixture id presses the fixture (PREFER_IDS)
      const all = Array.from(document.querySelectorAll(pSel));
      if (pattern && prefer.length) all.sort((a, b) => Number(prefer.some((id) => (b.getAttribute("data-testid") ?? "").endsWith(id))) - Number(prefer.some((id) => (a.getAttribute("data-testid") ?? "").endsWith(id))));
      for (const el of all) {
        const t = el.getAttribute("data-testid") ?? "";
        if (pattern && !new RegExp(`^${pSelGlob.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`).test(t)) continue;
        if (nots.some((n) => (n.includes("*") ? new RegExp(`^${n.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`).test(t) : n === t))) continue;
        if (!vis(el)) continue;
        if (!pattern) return el;
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("role") ?? "";
        if (TAGS.includes(tag) || (tag === "a" && el.hasAttribute("href")) || ROLES.includes(role) || tag === "summary") {
          // the current step/tab (aria-current/pressed/selected) or a disabled twin is a no-op press — prefer the next one
          const idle = ["aria-pressed", "aria-selected"].some((a) => el.getAttribute(a) === "true") || (el.hasAttribute("aria-current") && el.getAttribute("aria-current") !== "false") || (el as HTMLButtonElement).disabled === true
            || (tag === "input" && el.getAttribute("type") === "radio" && (el as HTMLInputElement).checked); // the default radio of a group
          if (!idle) return el;
          idleFirst ??= el;
          continue;
        }
        fallback ??= el;
      }
      return idleFirst ?? fallback;
    }, sel, notList, isPattern, testid, PREFER_IDS).catch(() => null);
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
// checkboxes that must be OFF before ANY click on the page (default ON in the product): crm-portal-invite-email ticked
// ⇒ invite() calls sendEmail() for real (portal.ts) — the invite submit is pressed as a row AND as an opener
// (crm-portal-invite-link), and a checkbox fill reloads the page (dirty) ⇒ the row-level "leave it OFF" is not enough.
const SAFETY_UNTICK = ["crm-portal-invite-email"];
async function safetyUntick(page: Any): Promise<void> {
  const n: number = await page.evaluate((ids: string[]) => {
    let k = 0;
    for (const id of ids) for (const e of Array.from(document.querySelectorAll(`[data-testid="${id}"]`)) as HTMLInputElement[]) {
      if (e.checked || e.getAttribute("aria-checked") === "true") { e.click(); k++; }
    }
    return k;
  }, SAFETY_UNTICK).catch(() => 0);
  if (n) await sleep(200);
}
async function clickEl(page: Any, el: Any, testid: string): Promise<void> {
  if (!SAFETY_UNTICK.includes(testid)) await safetyUntick(page);
  if (testid.endsWith("-backdrop")) {
    const box = await el.boundingBox();
    if (!box) throw new Error(`backdrop ${testid} ไม่มีกรอบ`);
    await page.mouse.click(box.x + 6, box.y + 6); // close handlers check e.target === e.currentTarget (C4.1 §7.3)
    return;
  }
  // tel:/mailto:/sms: anchors — headless chromium opens an external-protocol prompt that steals focus (every later
  // keyboard fill types into nothing) and blocks the next tel: click (it1 27 Sep: the whole call-log modal "dead").
  // The app's own onClick still runs; only the browser's default navigation is cancelled.
  await el.evaluate((e: HTMLElement) => {
    const a = e.closest("a");
    if (a && /^(tel|mailto|sms):/i.test(a.getAttribute("href") ?? "")) a.addEventListener("click", (ev) => ev.preventDefault(), { once: true });
  }).catch(() => {});
  // c42b: centre the control first and hit-test it — on 390 a control scrolled to the top edge sits under the sticky
  // app header, and a pointer click lands on the header (run2/dbg1: owner 390 deal-title-save "dead", enabled, no request)
  const covered: boolean = await el.evaluate((e: HTMLElement) => {
    e.scrollIntoView({ block: "center", inline: "center" });
    const r = e.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && hit !== e && !e.contains(hit) && !(hit as HTMLElement).contains?.(e);
  }).catch(() => false);
  if (covered) { await el.evaluate((e: HTMLElement) => e.click()); return; }
  try { await el.click({ delay: 20 }); }
  catch { await el.evaluate((e: HTMLElement) => e.click()); }
}
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, "q");
const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
/** a valid, random Thai tax id (0105599 + 5 random + check digit) — never collides with the seed's 01055000000NN */
function thaiTaxId(): string {
  const d = `0105599${String(Math.floor(Math.random() * 1e5)).padStart(5, "0")}`.split("").map(Number);
  const sum = d.reduce((a, x, i) => a + x * (13 - i), 0);
  return d.join("") + String((11 - (sum % 11)) % 10);
}
let fillSeq = 0; // every typed free-text value is UNIQUE (it3: a renamed seed lost reason and the "new reason" row typed the
                 // same qc-btn-<run> text ⇒ "มีเหตุผลนี้อยู่แล้ว"; object keys collided the same way)
function fillValueFor(testid: string, inputType: string): string {
  const t = testid.toLowerCase();
  const u = `${rand}${(++fillSeq).toString(36)}`;
  if (inputType === "email" || /(email|addr|copy-to)$/.test(t)) return `qc-btn-${u}@example.com`;
  if (inputType === "tel" || /phone/.test(t)) return `08${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`; // random — a fixed number made the 2nd create a "duplicate"
  if (/taxid$/.test(t)) return thaiTaxId(); // 13 digits + mod-11 check digit (companies-shared.ts taxIdProblem)
  if (/branchcode$/.test(t)) return "00000";
  if (inputType === "url" || /(url|website|domain)$/.test(t) || /domain-input$/.test(t)) return /domain/.test(t) ? `qc-btn-${u}.example.com` : `https://qc-btn-${u}.example.com`;
  if (/digest-hour$/.test(t)) return "8";
  if (/lower-text$/.test(t)) return "ลดอายุเก็บ"; // the retention "type this word to confirm lowering" box
  // it4-A: export file lifetime is 1–90 days (PrivacySettings.tsx client check) — "days" → 100 was refused client-side
  if (/export-days$/.test(t)) return "30";
  if (/archive-confirm-key$/.test(t)) return RUN_OBJECT_KEY; // "type the object's key to confirm"
  if (/(^|-)key$/.test(t)) return `qc_btn_${u}`.slice(0, 31); // object keys: a–z 0–9 _ , 2–31 chars (objectKeyProblem) // an hour number 0–23, not a clock time
  if (inputType === "time" || (/(from|to|hour)$/.test(t) && /(window|quiet|digest)/.test(t))) return "09:00";
  if (inputType === "date") return today();
  if (inputType === "datetime-local") return `${today()}T10:00`;
  if (inputType === "month") return today().slice(0, 7);
  if (inputType === "color") return "#123456";
  if (/target-q$|attach-contact-q$/.test(t)) return "QC"; // record pickers: the seed's deal titles are "ดีล QC NN — …"
  if (/(reason|note)/.test(t)) return `qc-btn-${u} เหตุผลทดสอบ`;
  // integers / percents: commission pct · stage prob · quota deal count · split (it3: typed "qc-btn-…" into them)
  if (/(-pct|pct-|-prob|prob-|probability|percent|rate|split)/.test(t)) return "10";
  if (/(qty|quantity|duration|max-open|score|points|priority|quota-deals|-deals-|delay|stale)/.test(t) || inputType === "number" || inputType === "range") return "5";
  if (/(price|amount|satang|discount|days|value|target|months)/.test(t)) return "100";
  if (/date|due|at$/.test(t)) return today();
  return `qc-btn-${u}`;
}
/** the value to type must CHANGE the field — PREFILL (before an earlier submit-like row) may already have typed the very
 *  same deterministic value, which made the row itself look "dead" (smoke5: call-log note/duration/next-task-due) */
function differ(v: string, current: string, type: string): string {
  if (v !== current) return v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const d = new Date(`${v}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return v.replace(/T(\d{2})/, (_m, h) => `T${String((Number(h) + 1) % 24).padStart(2, "0")}`);
  if (/^\d{2}:\d{2}$/.test(v)) return v === "09:00" ? "10:00" : "09:00";
  if (/^-?\d+(\.\d+)?$/.test(v)) return String(Number(v) + 1);
  if (type === "email" || v.includes("@")) return v.replace("@", "2@");
  return `${v}2`;
}
/** set a field the way a user would; returns the before/after value so "dead" can be judged by the value itself */
async function fillEl(page: Any, el: Any, testid: string): Promise<{ before: string; after: string; skipped?: string }> {
  const meta: { tag: string; type: string; value: string; checked: boolean; role: string; ariaChecked: string | null; ro: boolean; rdonly: boolean; tid: string; inputmode: string } = await el.evaluate((e: Any) => ({
    tid: e.getAttribute("data-testid") ?? "", tag: e.tagName.toLowerCase(), type: (e.getAttribute("type") ?? "").toLowerCase(), value: String(e.value ?? ""), checked: !!e.checked, inputmode: (e.getAttribute("inputmode") ?? "").toLowerCase(),
    role: e.getAttribute("role") ?? "", ariaChecked: e.getAttribute("aria-checked") ?? e.getAttribute("aria-pressed"), ro: !!(e.disabled || e.readOnly), rdonly: !!e.readOnly && !e.disabled,
  }));
  if (meta.rdonly && meta.tag !== "select" && meta.value.trim() !== "" && !["checkbox", "radio"].includes(meta.type)) {
    return { before: "ro", after: `ro:${meta.value.slice(0, 40)}` }; // read-only value to copy — nothing to type, not dead
  }
  const snap = async () => el.evaluate((e: Any) => `${e.value ?? ""}|${e.checked ?? ""}|${e.getAttribute("aria-checked") ?? e.getAttribute("aria-pressed") ?? ""}|${e.getAttribute("data-state") ?? ""}`).catch(() => "detached");
  const before = await snap();
  if (meta.tag === "select") {
    // server-backed pickers (ServerPicker/ContactPicker) fill their options ~250 ms + a round trip AFTER mount ⇒ wait ≤ 4 s
    let opts: { value: string; selected: boolean; disabled: boolean }[] = [];
    for (let i = 0; i < 20; i++) {
      opts = await el.evaluate((s: HTMLSelectElement) => Array.from(s.options).map((o) => ({ value: o.value, selected: o.selected, disabled: o.disabled })));
      if (opts.some((o) => !o.selected && !o.disabled && o.value !== "")) break;
      await sleep(200);
    }
    const cand = opts.find((o) => !o.selected && !o.disabled && o.value !== "") ?? opts.find((o) => !o.selected && !o.disabled);
    if (cand) await el.select(cand.value);
  } else if (meta.tag === "input" && meta.type === "file") {
    if (!IMPORT_FILE_INPUTS.has(testid)) return { before, after: before, skipped: "file" };
    await el.uploadFile(resolvePath(".qc-shots/c42/fixtures/qc-btn-import.csv"));
    await el.evaluate((e: Any) => e.dispatchEvent(new Event("change", { bubbles: true })));
  } else if (meta.tag === "input" && ["checkbox", "radio"].includes(meta.type)) {
    await clickEl(page, el, testid);
  } else if (meta.tag === "input" && ["date", "time", "datetime-local", "month", "color", "range", "number", "week"].includes(meta.type)) {
    const v = differ(fillValueFor(meta.tid || testid, meta.type), meta.value, meta.type);
    await el.evaluate((e: HTMLInputElement, val: string) => {
      // number/range: keep the value inside the field's own min/max (a retention of 5 days under min 30 is refused)
      let x = val;
      if ((e.type === "number" || e.type === "range") && x !== "") {
        let n = Number(x); const lo = e.min !== "" ? Number(e.min) : -Infinity; const hi = e.max !== "" ? Number(e.max) : Infinity;
        if (String(n) === String(Number(e.value))) n = n + 1; // must CHANGE the value
        n = Math.min(Math.max(n, lo), hi); if (String(n) === String(e.value)) n = n > lo ? n - 1 : n + 1;
        x = String(n);
      }
      e.focus(); // onBlur-autosave fields (retention · form score) only save on a real focus → blur
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(e, x);
      e.dispatchEvent(new Event("input", { bubbles: true }));
      e.dispatchEvent(new Event("change", { bubbles: true }));
    }, v);
    await el.evaluate((e: HTMLElement) => e.blur()).catch(() => {});
  } else if (meta.tag === "textarea" && /import-text$/.test(meta.tid)) {
    // CSV paste box: the placeholder IS the header the importer expects — header + one qc-btn- row (value set natively:
    // typing a newline through the keyboard would submit/blur)
    await el.evaluate((e: HTMLTextAreaElement, tag: string) => {
      const header = (e.getAttribute("placeholder") ?? "name").split("\n")[0]!.trim();
      const row = header.split(",").map((h, i) => (i === 0 ? `qc-btn-${tag}` : /date|วัน/i.test(h) ? "2026-12-31" : /value|amount|price|มูลค่า/i.test(h) ? "100" : `qc-btn-${tag}`)).join(",");
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(e, `${header}\n${row}`);
      e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true }));
    }, rand);
  } else if (meta.tag === "input" || meta.tag === "textarea") {
    await el.click({ clickCount: 3 }).catch(async () => { await el.evaluate((e: HTMLElement) => e.focus()); });
    await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
    // c42b: a text box with inputmode decimal/numeric wants a number (run2 owner crm-commission-rule-min: typed "qc-btn-…"
    //   ⇒ "มูลค่าดีลขั้นต่ำต้องเป็น 0 บาทขึ้นไป") — the testid-based table still wins (price/discount/qty/…)
    const effType = meta.type || (/^(decimal|numeric)$/.test(meta.inputmode) ? "number" : "");
    await page.keyboard.type(differ(fillValueFor(meta.tid || testid, effType), meta.value, effType), { delay: 5 });
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
  // in-page anchor ("#crm-ai-at-risk"): the URL's hash (it3: path-only compare never matched)
  if (target.startsWith("#")) { try { return new URL(url).hash === target; } catch { return false; } }
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
    // + a bare lowercase word is a NAME for a value ("mergedIntoId=keep" = the kept company), not a literal — only
    //   null/true/false, numbers, UPPER_CASE enums and quoted strings are compared
    if (m && !/[<|>]/.test(m[3]!) && !/^(now|Σ)/.test(m[3]!) && /^(null|true|false|-?\d+(\.\d+)?|[A-Z][A-Z0-9_]*|["'].*["'])$/.test(m[3]!)) { parsed.push({ model: m[1]!, op: "eq", column: m[2], value: m[3]!.replace(/^["']|["']$/g, "") }); continue; }
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
function primaryIdOf(page: string, ctx: Ctx, query?: string, testid?: string): string | null {
  if (page === "/companies/[companyId]" && LIFECYCLE_ROW_RE.test(testid ?? "")) return ctx.lifecycleCompanyId;
  if (page === "/deals/[dealId]") return /(^|&)tab=lines(&|$)/.test(query ?? "") ? ctx.linesDealId : ctx.dealId;
  if (page === "/contacts/[contactId]") return ctx.contactId;
  if (page === "/companies/[companyId]") return ctx.companyId;
  if (page === "/objects/[key]/[recordId]") return ctx.recordId;
  return null;
}

// ── result buckets ──
type Failure = { page: string; testid: string; user: string; device: string; detail: string; shot?: string };
const total = { n: 0 };
const passedN = { n: 0 };
const dead: Failure[] = [];
const wrongExpect: Failure[] = [];
const hiddenLeak: Failure[] = [];
const vacuous: Failure[] = []; // c42b — hiddenFor checks on a page that did not render for the persona (see VACUITY GUARD)
const consoleErrors: Failure[] = [];
const overflow: Failure[] = [];
const skippedSafety: { page: string; testid: string; user: string; device: string; reason: string }[] = [];
const skippedNeeds: { page: string; testid: string; user: string; device: string; needs: string; detail: string; shot?: string }[] = [];
const dbCheckUnparsed = new Map<string, string[]>();
const perPage = new Map<string, Any[]>();
const PAGE_STATUS: { page: string; path: string; user: string; device: string; status: number; rows: number; hiddenRows: number }[] = [];

// ═══════════════════════════════════════════════════════════════════
// per-row machinery
// ═══════════════════════════════════════════════════════════════════
type PageState = { openChain: string[]; dirty: boolean };
const FIELD_TAGS = new Set(["input", "textarea", "select"]);
const isPrefix = (a: string[], b: string[]) => a.length <= b.length && a.every((x, i) => x === b[i]);
const globRe = (p: string) => new RegExp(`^${p.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);

/** opener step "<testid>=<value>" = choose that option / type that value (the builder reveals fields per chosen value) */
const splitOpener = (o: string): { tid: string; val: string | null } => { const i = o.indexOf("="); return i < 0 ? { tid: o, val: null } : { tid: o.slice(0, i), val: o.slice(i + 1) }; };
/** screenshot of the page as the runner left it after a failed row → .qc-shots/crm/buttons/fail/… (path in the summary) */
async function failShot(page: Any, it: PlanItem, user: string, device: string): Promise<string> {
  const dir = process.env.QC_FAIL_DIR || `${SHOTS}/fail`;
  const f = `${dir}/${`${it.page}~${it.testid}~${user}~${device}`.replace(/[^A-Za-z0-9ก-๙~_-]+/g, "_").slice(0, 150)}.png`;
  try { mkdirSync(dir, { recursive: true }); await page.screenshot({ path: f, fullPage: false }); return f; } catch { return ""; }
}
/** visible error texts right now (role=alert · data-testid$=-error) — used to see a server action's refusal */
async function alertsNow(page: Any): Promise<string[]> {
  return page.evaluate(() => Array.from(document.querySelectorAll('[role="alert"],[data-testid$="-error"]:not([role="status"])'))
    .filter((e) => (e as HTMLElement).offsetParent !== null && (e.textContent ?? "").trim())
    .map((e) => `${e.getAttribute("data-testid") ?? "alert"}: ${(e.textContent ?? "").trim().slice(0, 140)}`)).catch(() => []);
}
/** diagnostics: visible inline errors / alerts (a submit that "did nothing" usually refused with a Thai message) */
async function pageSays(page: Any): Promise<string> {
  return page.evaluate(() => Array.from(document.querySelectorAll('[role="alert"],[data-testid$="-error"],[data-testid$="-msg"],[aria-invalid="true"]'))
    .filter((e) => (e as HTMLElement).offsetParent !== null && ((e.textContent ?? "").trim() || e.getAttribute("aria-invalid") === "true"))
    .map((e) => `${e.getAttribute("data-testid") ?? e.tagName.toLowerCase()}: ${((e.textContent ?? "").trim() || "aria-invalid").slice(0, 120)}`).slice(0, 4).join(" | ")).catch(() => "");
}
/** press the row's opener chain (only the links that are still needed) and find the row's control */
async function reveal(page: Any, path: string, it: PlanItem, state: PageState, hidden: boolean): Promise<{ el: Any | null; reason: string }> {
  const chain = it.opener;
  // "=value" steps (select this · tick that · type this) change the STATE the row acts on — they must run even when the
  // row's control is already visible (deal bulk bar: always shown, only enabled by a ticked row)
  const pendingValueStep = chain.slice(state.openChain.length).some((o) => splitOpener(o).val !== null);
  let el = await findVisible(page, it.testid, it.notList, 0);
  if (el && !pendingValueStep) return { el, reason: "" };
  // c42b: once a "=value" step ran in this reveal, the plain steps after it ACT on that value (pick the search hit · save
  // the typed view · submit the typed form) — they are pressed even when the row is already visible (run2 owner
  // /activities: activity-log-target-option was skipped because the submit button is always visible ⇒ "เลือกผู้ติดต่อ…ก่อน")
  let valueRan = false;
  for (let i = state.openChain.length; i < chain.length; i++) {
    const { tid, val } = splitOpener(chain[i]!);
    let laterVisible = false;
    if (val === null && !valueRan) { // a "select this value" step is always applied — the fields it reveals depend on the value
      for (const t of chain.slice(i + 1)) if (await findVisible(page, splitOpener(t).tid, [], 0)) { laterVisible = true; break; }
      if (!laterVisible && (await findVisible(page, it.testid, it.notList, 0))) laterVisible = true;
    }
    if (laterVisible) { state.openChain.push(chain[i]!); continue; }
    // row already visible (only here for its "=value" steps): a value step whose control is not on screen is skipped —
    // the row itself is reachable, the chain was only needed to CREATE it (object-view-link after an earlier save)
    const op = await findVisible(page, tid, [], valueRan && val === null ? 4000 : el ? 600 : hidden ? 1500 : 3500);
    if (!op && el && !(valueRan && val === null) && !(val === "on" || val === "off" || val === "click" || val === "*")) { state.openChain.push(chain[i]!); continue; }
    if (!op) return { el: null, reason: `ตัวเปิด ${chain[i]} หาไม่พบ/มองไม่เห็น (ลำดับ ${chain.join(" → ")})` };
    if (val !== null) {
      valueRan = true;
      const opTag: string = await op.evaluate((e: Element) => (e.tagName === "INPUT" ? `input:${(e.getAttribute("type") ?? "").toLowerCase()}` : e.tagName.toLowerCase())).catch(() => "");
      const isSelect = opTag === "select";
      if (opTag === "input:file") { // "<file-input>=<fixture>" — upload a repo fixture (CSV import rows reveal the mapping/submit)
        if (!IMPORT_FILE_INPUTS.has(tid)) return { el: null, reason: `ตัวเปิด ${chain[i]} เป็นช่องอัปโหลดที่ไม่ใช่ CSV นำเข้า (ความปลอดภัย)` };
        await op.uploadFile(resolvePath(`.qc-shots/c42/fixtures/${val.replace(/[^A-Za-z0-9._-]/g, "")}`)).catch(() => {});
        await op.evaluate((e: Element) => e.dispatchEvent(new Event("change", { bubbles: true }))).catch(() => {});
      } else if (opTag === "input:checkbox" || opTag === "input:radio" || ((val === "on" || val === "off") && /^(radio|checkbox|switch|tab)$/.test(await op.evaluate((e: Element) => e.getAttribute("role") ?? "").catch(() => "")))) {
        // "=on"/"=off" = make sure it is (un)ticked/selected (input or role=radio|checkbox|switch|tab button)
        const on: boolean = await op.evaluate((e: HTMLInputElement) => (e.tagName === "INPUT" ? e.checked : e.getAttribute("aria-checked") === "true" || e.getAttribute("aria-selected") === "true")).catch(() => false);
        if (on !== (val !== "off")) await clickEl(page, op, tid).catch(() => {});
      } else if (val === "click") await clickEl(page, op, tid).catch(() => {}); // "=click" = press even though it is visible (add-condition twice)
      else if (val === "*") await fillEl(page, op, tid).catch(() => {}); // "=*" = any real choice (ids differ per seed)
      else if (isSelect) await op.select(val).catch(() => {});
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
  if (el) return { el, reason: "" };
  // diagnostics: what the page SAYS (inline errors / alerts) — an opener that submits often fails with a Thai message
  const said = await pageSays(page);
  return { el: null, reason: `${chain.length ? `กด ${chain.join(" → ")} แล้วยังไม่เห็น ${it.testid}` : "ควรเห็นได้ (อยู่ใน roles ไม่อยู่ใน hiddenFor) แต่หาไม่พบ/มองไม่เห็น"}${said ? ` · หน้าแสดง: ${said}` : ""}` };
}

/** PREFILL (contract): fill earlier fill-rows of the same form/dialog that are still empty before submitting */
async function prefill(page: Any, it: PlanItem, group: PlanItem[], el: Any, base: string): Promise<string[]> {
  const done: string[] = [];
  // the form/dialog — or, for div-based panels (SavedViewControls · automation builder), the nearest testid'd container
  const container = await el.evaluateHandle((e: Element) => (e.tagName === "FORM" ? e : e.closest('form, [role="dialog"], dialog, [aria-modal="true"], [data-testid$="-form"], [data-testid$="-modal"], [data-testid$="-panel"], [data-testid$="-editor"], [data-testid$="-builder"], [data-testid$="-sheet"], [data-testid$="-box"], [data-testid$="-bar"]') ?? e.closest("section, fieldset, .card"))).catch(() => null);
  if (!container?.asElement?.()) return done;
  // it4-A: + fill rows of OTHER pages whose component also renders here (`alsoOn` ∋ this page) — e.g. StepFields (the first
  //   step of a new sequence on /settings/sequences, rows on /settings/sequences/[sequenceId]): run2 crm-seq-new-submit
  //   was refused client-side ("crm-seq-step-subject-new: aria-invalid") because nothing filled the step
  const also = ROWS.filter((r) => (r.alsoOn ?? []).includes(it.page) && r.page !== it.page)
    .map((r) => ({ testid: r.testid, kind: r.kind, expect: r.expect, hiddenFor: r.hiddenFor ?? [], guard: null as string | null, notList: r.not ?? [] }));
  const sibs = [...group, ...also].filter((s) => ["input", "textarea", "select", "toggle"].includes(s.kind) && s.expect.type !== "navigate" && s.expect.type !== "ui"
    && !PREFILL_NEVER.has(s.testid) && !s.guard && !s.hiddenFor.includes(base) && s.testid !== it.testid);
  const seen = new Set<string>();
  for (const s of sibs) {
    if (seen.has(s.testid)) continue; seen.add(s.testid);
    const se = await findVisible(page, s.testid, s.notList, 0);
    if (!se) continue;
    const inside = await container.evaluate((c: Element, x: Element) => c.contains(x), se).catch(() => false);
    if (!inside) continue;
    const empty = await se.evaluate((x: Any) => {
      const tag = x.tagName.toLowerCase(); const type = (x.getAttribute("type") ?? "").toLowerCase();
      if (tag === "input" && type === "radio") return false; // a radio group already has its default — ticking another CHANGES the choice (merge keep-this → keep-other)
      if (tag === "input" && type === "checkbox") return !x.checked;
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
  const el = await findVisible(page, testid, ownedElsewhere(testid), 0) ?? (await page.$(selOf(testid)).catch(() => null));
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
      const eb = cErrs.length; const hb = httpErrs.length;
      const resp = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 45_000 }).catch(() => null);
      navStatus = resp?.status?.() ?? navStatus;
      await sleep(250);
      state.openChain = []; state.dirty = false;
      // a console "Failed to load resource: 404" alone does not say WHICH resource — attach the ≥400 responses of this load
      // (it3: manager saw 404s on pages it may open; nok's came from the page itself = a role-forbidden page, by design)
      const hs = httpErrs.slice(hb);
      for (const e of cErrs.slice(eb)) loadErrs.add(/Failed to load resource/.test(e) && hs.length ? `${e} ← ${hs.slice(0, 3).join(", ")}` : e);
    };
    const pageResults: Any[] = [];
    const ovfSeen = new Set<string>();
    let wroteInGroup = false;

    let pendingChainRepair: boolean | "full" = false;
    for (const it of rowsOfPage) {
      total.n++;
      const shouldBeHidden = it.hiddenFor.includes(base);
      if (state.dirty || urlKey(page.url()) !== urlKey(`${BASE}${path}`) || !isPrefix(state.openChain, it.opener)) await load();
      const rec = (bucket: string, ok: boolean, detail = "", extra: Any = {}) => pageResults.push({ testid: it.testid, ok, bucket, detail, ...extra });
      const errsBefore = cErrs.length;

      // R1 (it3): an opener chain that WROTE through a destructive control (MAKE_LOST: deal-lost-confirm as an opener for the
      // reopen rows) left the deal LOST for every later row of the group (deal-lost-btn/lines/value "dead") — repair the
      // seed right after such a row, like after a destructive row
      if (pendingChainRepair) { const full = pendingChainRepair === "full"; pendingChainRepair = false; await restoreSnapshot(`${it.page} (ซ่อมหลังตัวเปิดที่เขียน${full ? " · เต็ม" : ""})`, { keepNew: !full }); state.dirty = true; await load(); }
      const ngReveal = nonGetCount;
      const rv = await reveal(page, path, it, state, shouldBeHidden);
      if (nonGetCount > ngReveal && it.opener.some((o) => repairsAfter(splitOpener(o).tid))) pendingChainRepair = it.opener.some((o) => FULL_REPAIR_RE.test(splitOpener(o).tid)) ? "full" : true;
      if (shouldBeHidden) {
        if (rv.el) { hiddenLeak.push({ page: it.page, testid: it.testid, user, device, detail: "อยู่ใน hiddenFor แต่มองเห็นได้" }); rec("hiddenLeak", false); }
        else { passedN.n++; rec("passed", true, "absent (hiddenFor)", { hiddenPass: true }); }
        continue;
      }
      if (!rv.el) {
        const why = `${rv.reason}${navStatus >= 400 ? ` · หน้าตอบ HTTP ${navStatus}` : ""}`;
        const shot = it.needs && !it.opener.length ? "" : await failShot(page, it, user, device);
        if (it.needs) { total.n--; skippedNeeds.push({ page: it.page, testid: it.testid, user, device, needs: it.needs, detail: why, shot }); rec("skippedNeeds", true, why); }
        else { dead.push({ page: it.page, testid: it.testid, user, device, detail: why, shot }); rec("dead-missing", false, why); }
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
      if (it.expect.type === "mutation" || it.expect.type === "download" || it.kind === "form") { // export dialogs need reason + confirm too
        prefilled = await prefill(page, it, rowsOfPage, el, base);
        if (prefilled.length) el = (await findVisible(page, it.testid, it.notList, 1500)) ?? el;
      }
      const tagName: string = await el.evaluate((e: Element) => e.tagName.toLowerCase()).catch(() => "");
      const isField = FIELD_TAGS.has(tagName);
      // a ticked/unticked checkbox, radio or switch changes WHICH later fields exist (convert modal: unticking "เปิดดีล"
      // removes the pipeline/stage/title fields) ⇒ the next row starts from a fresh load + its own opener chain
      const checkLike: boolean = await el.evaluate((e: Element) => {
        const t = (e.getAttribute("type") ?? "").toLowerCase(); const r = e.getAttribute("role") ?? "";
        return (e.tagName === "INPUT" && (t === "checkbox" || t === "radio")) || r === "switch" || r === "checkbox" || r === "radio";
      }).catch(() => false);

      // ── pre-action probes ──
      await page.evaluate(() => { (window as Any).__qcMut = 0; if (!(window as Any).__qcObs) { const o = new MutationObserver(() => { (window as Any).__qcMut++; }); o.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true }); (window as Any).__qcObs = o; } else { (window as Any).__qcMut = 0; } }).catch(() => {});
      const urlBefore = page.url();
      const reqBefore = reqCount; const nonGetBefore = nonGetCount; const respBefore = respLog.length; const tabsBefore = newTabs.length; const dlBefore = DOWNLOADS.length;
      const alertsBefore = new Set(it.expect.type === "mutation" ? await alertsNow(page) : []);
      // a pattern ui target ("deal-column-*") means THE one the pressed control lives in — resolve it to that exact testid
      let uiTarget = it.expect.target ?? "";
      if (uiTarget.includes("*")) {
        const own: string = await el.evaluate((e: Element, sel: string) => e.parentElement?.closest(sel)?.getAttribute("data-testid") ?? "", selOf(uiTarget)).catch(() => "");
        if (own) uiTarget = own;
      }
      const uiBefore = it.expect.type === "ui" && it.expect.state === "changes" && it.expect.target ? await uiSnapshot(page, uiTarget) : null;
      const { parsed, unparsed } = it.expect.type === "mutation" ? parseDbClauses(it.expect.db) : { parsed: [], unparsed: [] };
      const countsBefore = new Map<string, number | null>();
      for (const c of parsed) if (c.op !== "eq" && !countsBefore.has(c.model)) countsBefore.set(c.model, await countScoped(c.model));

      // ── act ──
      let actErr = ""; let valueChanged = false; let fileSkipped = false;
      try {
        if (it.kind === "drag") {
          // drop target = the first match (excluding other rows' controls: deal-column-add-/-collapse-/-more-) that does NOT
          // contain the dragged card — the next stage. (it1: "last match" = the LOST column ⇒ a lost-reason dialog, no write.)
          const dt = it.expect.dropTarget ?? "";
          const owned = ownedElsewhere(dt);
          const drops: Any[] = [];
          for (const d of await page.$$(selOf(dt))) {
            const ok2: boolean = await d.evaluate((x: Element, src: Element, nots: string[]) => {
              const t = x.getAttribute("data-testid") ?? "";
              const re = (n: string) => new RegExp(`^${n.split("*").map((y) => y.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
              const r = (x as HTMLElement).getBoundingClientRect();
              return r.width > 0 && r.height > 0 && !x.contains(src) && !nots.some((n) => (n.includes("*") ? re(n).test(t) : n === t));
            }, el, owned).catch(() => false);
            if (ok2) drops.push(d);
          }
          const to = drops[0] ?? null;
          if (!to) throw new Error(`ไม่พบปลายทางลาก ${it.expect.dropTarget}`);
          const a = (await el.boundingBox())!, b = (await to.boundingBox())!;
          // c42b: on 390 the next column of the snap scroller is mostly off-screen and the board hit-tests columns by their
          // rect (usePointerBoardDrag targetAt) — drop on the VISIBLE part of the target (run2: owner 390 deal-card-* no write)
          const vw = w;
          const visL = Math.max(b.x, 0), visR = Math.min(b.x + b.width, vw - 1);
          const sx = a.x + a.width / 2, sy = a.y + a.height / 2, tx = visR > visL + 8 ? (visL + visR) / 2 : b.x + b.width / 2, ty = b.y + 12;
          await page.mouse.move(sx, sy); await page.mouse.down(); await sleep(300);
          for (let i = 1; i <= 14; i++) { await page.mouse.move(sx + ((tx - sx) * i) / 14, sy + ((ty - sy) * i) / 14); await sleep(30); }
          await page.mouse.up();
        } else if ((it.kind === "form" || it.kind === "filter") && tagName === "form") {
          await safetyUntick(page);
          await el.evaluate((f: Any) => { if (typeof f.requestSubmit === "function") f.requestSubmit(); else f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
        } else if (isField || it.kind === "toggle" || it.kind === "select" || it.kind === "input" || it.kind === "textarea") {
          const r = await fillEl(page, el, it.testid);
          if (r.skipped === "file") fileSkipped = true;
          valueChanged = r.before !== r.after;
        } else {
          const proto: string = await el.evaluate((e: HTMLElement) => { const h = e.closest("a")?.getAttribute("href") ?? ""; return /^(tel|mailto|sms):/i.test(h) ? h : ""; }).catch(() => "");
          await clickEl(page, el, it.testid);
          // a protocol link whose href is well-formed IS alive even when the app adds no handler (contact-email-link)
          if (proto && /^(tel:[+0-9]{6,}|mailto:[^@\s]+@[^@\s]+|sms:[+0-9]{6,})/i.test(proto)) valueChanged = true;
        }
      } catch (e) { actErr = e instanceof Error ? e.message.slice(0, 160) : String(e); }

      if (fileSkipped) {
        total.n--; skippedSafety.push({ page: it.page, testid: it.testid, user, device, reason: "input[type=file] — อัปโหลดขึ้นที่เก็บไฟล์จริง (ไม่กด)" }); rec("skippedSafety", true, "file upload");
        state.dirty = true; continue;
      }

      // ── dead-control detector (3 s) ──
      let deadFlag = actErr !== "";
      // ui/selected = an idempotent selector (the only tab of a single-tab bar, the active view) — "nothing changed" is the
      // correct behaviour, so the dead detector does not apply; the expect below asserts the selected state instead
      if (!deadFlag && it.expect.type === "ui" && it.expect.state === "selected") { /* skip dead detection */ }
      else if (!deadFlag) {
        deadFlag = true;
        for (let i = 0; i < 20; i++) {
          const mut = isField ? 0 : await page.evaluate(() => (window as Any).__qcMut ?? 0).catch(() => 1);
          if (valueChanged || mut > 0 || reqCount > reqBefore || page.url() !== urlBefore || newTabs.length > tabsBefore || DOWNLOADS.length > dlBefore) { deadFlag = false; break; }
          await sleep(150);
        }
      }
      // a `*` row whose first match is the ALREADY-ACTIVE item of a group (first stage tab on 390 — active by style only,
      // no aria) is idempotent: try the next visible match once before calling the row dead
      if (deadFlag && !actErr && !isField && it.testid.includes("*")) {
        const second = await page.evaluateHandle((pSel: string, nots: string[]) => {
          const vis = (e: Element) => { const r = (e as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
          const re = (n: string) => new RegExp(`^${n.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
          const all = Array.from(document.querySelectorAll(pSel)).filter((e) => vis(e) && !nots.some((n) => (n.includes("*") ? re(n).test(e.getAttribute("data-testid") ?? "") : n === e.getAttribute("data-testid"))));
          const clickable = all.filter((e) => ["BUTTON", "A", "INPUT", "SELECT", "SUMMARY"].includes(e.tagName) || /^(button|link|tab|menuitem)$/.test(e.getAttribute("role") ?? ""));
          return clickable[1] ?? null;
        }, selOf(it.testid), it.notList).catch(() => null);
        const el2 = second?.asElement?.() ?? null;
        if (el2) {
          await page.evaluate(() => { (window as Any).__qcMut = 0; }).catch(() => {});
          const r0 = reqCount; const u0 = page.url();
          await clickEl(page, el2, it.testid).catch(() => {});
          for (let i = 0; i < 20 && deadFlag; i++) {
            const mut = await page.evaluate(() => (window as Any).__qcMut ?? 0).catch(() => 1);
            if (mut > 0 || reqCount > r0 || page.url() !== u0) deadFlag = false; else await sleep(150);
          }
          if (!deadFlag) el = el2;
        }
      }
      if (nonGetCount > nonGetBefore) wroteInGroup = true;
      // a `needs` row whose control is present but CANNOT act for lack of that data (disabled · a select with no other
      // option) is the same precondition as "absent" ⇒ skippedNeeds, not dead
      if (deadFlag && it.needs) {
        const blocked: string = await el.evaluate((e: Any) => (e.disabled ? "disabled" : e.tagName === "SELECT" && !Array.from(e.options as ArrayLike<Any>).some((o: Any) => !o.selected && !o.disabled && o.value !== "") ? "ไม่มีตัวเลือกอื่น" : "")).catch(() => "");
        if (blocked) { total.n--; skippedNeeds.push({ page: it.page, testid: it.testid, user, device, needs: it.needs, detail: `คอนโทรลมีแต่ใช้ไม่ได้ (${blocked})` }); rec("skippedNeeds", true, blocked); state.dirty = true; continue; }
      }
      if (deadFlag) {
        const wasDisabled: boolean = await el.evaluate((e: Any) => !!e.disabled || e.getAttribute("aria-disabled") === "true").catch(() => false);
        const d = actErr || (isField ? "ค่าในช่องไม่เปลี่ยน (ถูกปิด/อ่านอย่างเดียว?) และไม่มี request" : `ไม่มี DOM mutation/navigation/network ภายใน 3 วิ${wasDisabled ? " · คอนโทรล disabled ตอนกด" : ""}${prefilled.length ? ` · prefill ${prefilled.join(",")}` : ""}`);
        dead.push({ page: it.page, testid: it.testid, user, device, detail: d, shot: await failShot(page, it, user, device) }); rec("dead", false, d, { prefilled });
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
        } else if (it.expect.state === "selected") {
          const sel = await findVisible(page, target, [], 3000);
          const on: boolean = sel ? await sel.evaluate((e: Element) => ["aria-selected", "aria-pressed", "aria-checked"].some((a) => e.getAttribute(a) === "true") || (e.hasAttribute("aria-current") && e.getAttribute("aria-current") !== "false")).catch(() => false) : false;
          ok = on; detail = on ? "" : sel ? `${target} ไม่ประกาศสถานะเลือกอยู่ (ไม่มี aria-selected/aria-pressed/aria-current ที่เป็นจริง)` : `ไม่เห็น ${target}`;
        } else if (it.expect.state === "changes") {
          let after: string | null = null;
          for (let i = 0; i < 20; i++) { after = await uiSnapshot(page, uiTarget); if (after !== null && after !== uiBefore) break; await sleep(200); }
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
        let dl = DOWNLOADS.slice(dlBefore);
        for (let i = 0; i < 20 && dl.length && !dl.some((d) => d.bytes > 0); i++) { await sleep(200); dl = DOWNLOADS.slice(dlBefore); }
        const want = (it.expect.target ?? "").match(/file:([a-z|]+)/)?.[1]?.split("|") ?? [];
        const goodDl = dl.find((d) => d.bytes > 0 && (want.length === 0 || want.some((x) => d.name.toLowerCase().endsWith(`.${x}`))));
        ok = !!hit || tabs.length > 0 || !!goodDl;
        detail = ok ? "" : dl.length ? `ดาวน์โหลดเริ่มแต่ไม่ผ่าน: ${dl.map((d) => `${d.name} ${d.bytes}B ${d.state}`).join(",")} (ต้องการ ${want.join("|") || "ไฟล์"} ที่มีเนื้อหา)` : "ไม่พบ response ที่เป็นไฟล์/แท็บดาวน์โหลด/การดาวน์โหลดของเบราว์เซอร์";
      } else if (type === "mutation") {
        await settle(page, 8000);
        const newResp = respLog.slice(respBefore);
        const nonGet = nonGetCount > nonGetBefore;
        const bad = newResp.filter((r) => r.status >= 400);
        ok = nonGet && bad.length === 0;
        // a server action that answers { ok:false } still "fires a POST with 200" — the refusal is only visible as a new
        // role=alert / *-error text (portal invite on a shop without the portal · a 400-style Thai message). Rows whose
        // stated effect IS the refusal (db mentions ปฏิเสธ / ข้อความไทย) are exempt.
        // a FIELD whose value is saved by its form's own save button (call-log outcome/note · convert fields): changing the
        // value is the whole action — the write is asserted on the submit row. Autosave fields (outside any form/dialog/
        // panel) still need their write.
        let fieldDeferred = false;
        if (isField && !nonGet && valueChanged) {
          const inForm: boolean = await el.evaluate((e: Element) => {
            if (e.closest('form, [role="dialog"], dialog, [aria-modal="true"], [data-testid$="-modal"], [data-testid$="-form"], [data-testid$="-panel"], [data-testid$="-editor"], [data-testid$="-builder"], [data-testid$="-sheet"], [data-testid$="-bar"]')) return true;
            // a plain section with its own visible save/submit button (notification quiet hours) — saved by that button
            const sec = e.closest("section, fieldset, .card");
            return !!sec && Array.from(sec.querySelectorAll('[data-testid$="-save"],[data-testid$="-submit"]')).some((b) => (b as HTMLElement).offsetParent !== null);
          }).catch(() => false);
          if (inForm) { ok = true; fieldDeferred = true; }
        }
        const refusalExpected = /ปฏิเสธ|ข้อความไทย|inline/i.test(it.expect.db ?? "");
        const newAlerts = ok && !refusalExpected ? (await alertsNow(page)).filter((x) => !alertsBefore.has(x)) : [];
        detail = !nonGet ? `ไม่มี request เขียน (POST/server action) ระหว่างกด${await pageSays(page).then((x) => (x ? ` · หน้าแสดง: ${x}` : ""))}` : bad.length ? `มี response ≥400: ${bad.map((r) => `${r.status} ${urlKey(r.url).slice(0, 60)}`).join(",")}` : "";
        if (fieldDeferred) detail = "";
        if (newAlerts.length) { ok = false; detail = `server action ตอบปฏิเสธ (มีข้อความผิดพลาดใหม่): ${newAlerts.slice(0, 2).join(" | ")}`; }
        if (unparsed.length) { const k = `${it.page}#${it.testid}`; dbCheckUnparsed.set(k, [...new Set([...(dbCheckUnparsed.get(k) ?? []), ...unparsed])]); }
        if (ok && !fieldDeferred) {
          for (const c of parsed) {
            if (c.op === "inc" || c.op === "dec") {
              const before = countsBefore.get(c.model) ?? null;
              if (before === null) continue;
              const want = c.op === "inc" ? before + 1 : before - 1;
              let after = await countScoped(c.model);
              for (let i = 0; i < 10 && after !== want; i++) { await sleep(400); after = await countScoped(c.model); }
              if (after !== null && after !== want) { ok = false; detail += ` · ${c.model} ${before}→${after} (คาด ${want})`; }
            } else if (c.op === "eq" && c.column) {
              const id = primaryIdOf(it.page, ctxForUser(ctx, it.user), it.path.split("?")[1], it.testid);
              if (!id || !c.model.startsWith(it.page.includes("deals") ? "CrmDeal" : it.page.includes("contacts") ? "CrmContact" : it.page.includes("companies") ? "CrmCompany" : "CustomRecord")) continue;
              const actual = await readColumn(c.model, id, c.column);
              if (actual === undefined) continue;
              if (!coerceEq(actual, c.value ?? "")) { ok = false; detail += ` · ${c.model}.${c.column}=${String(actual)} (คาด ${c.value})`; }
            }
          }
        }
        if (ok && !fieldDeferred && it.expect.resultTarget) {
          const found = await findVisible(page, it.expect.resultTarget, [], 6000);
          if (!found) { ok = false; detail += ` · ไม่เห็น resultTarget ${it.expect.resultTarget}`; }
        }
      } else if (type === "inline-error") {
        ok = true; // soft — C4.3 owns deliberate bad-input assertions (see CONTRACT)
      }
      // c42b: a `*` row whose FIRST match is the already-active item of a group (the current stage tab on 390 — active by
      // inline style only, no aria) presses a no-op that still mutates the DOM ⇒ "changes" fails. Same rule as the dead
      // fallback above: try the second visible match once before reporting.
      if (!ok && type === "ui" && it.expect.state === "changes" && it.testid.includes("*") && !actErr) {
        const second = await page.evaluateHandle((pSel: string, nots: string[]) => {
          const vis = (e: Element) => { const r = (e as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
          const re = (n: string) => new RegExp(`^${n.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
          const all = Array.from(document.querySelectorAll(pSel)).filter((e) => vis(e) && !nots.some((n) => (n.includes("*") ? re(n).test(e.getAttribute("data-testid") ?? "") : n === e.getAttribute("data-testid"))));
          return all.filter((e) => ["BUTTON", "A", "INPUT", "SELECT", "SUMMARY"].includes(e.tagName) || /^(button|link|tab|menuitem)$/.test(e.getAttribute("role") ?? ""))[1] ?? null;
        }, selOf(it.testid), it.notList).catch(() => null);
        const el2 = second?.asElement?.() ?? null;
        if (el2) {
          const before2 = await uiSnapshot(page, uiTarget);
          await clickEl(page, el2, it.testid).catch(() => {});
          let after2: string | null = null;
          for (let i = 0; i < 20; i++) { after2 = await uiSnapshot(page, uiTarget); if (after2 !== null && after2 !== before2) break; await sleep(200); }
          if (after2 !== null && after2 !== before2) { ok = true; detail = ""; }
        }
      }
      if (!ok) { wrongExpect.push({ page: it.page, testid: it.testid, user, device, detail: detail.replace(/^ · /, ""), shot: await failShot(page, it, user, device) }); rec("wrongExpect", false, detail.replace(/^ · /, ""), { prefilled }); }
      else { passedN.n++; rec("passed", true, "", prefilled.length ? { prefilled } : {}); }

      // ── console errors + overflow attributed to this row ──
      if (cErrs.length > errsBefore) consoleErrors.push({ page: it.page, testid: it.testid, user, device, detail: cErrs.slice(errsBefore, errsBefore + 3).join(" | ") });
      // about:blank (history:back on a fresh tab) has the 980 px default layout width — not the app (it3 manager/m deal-new-cancel)
      const ovf = /^about:/.test(page.url()) ? 0 : await page.evaluate((ww: number) => document.documentElement.scrollWidth > ww + 2 ? document.documentElement.scrollWidth : 0, w).catch(() => 0);
      if (ovf && !ovfSeen.has(urlKey(page.url()))) { ovfSeen.add(urlKey(page.url())); overflow.push({ page: it.page, testid: it.testid, user, device, detail: `scrollWidth ${ovf} > ${w} หลังกด ${it.testid} (url ${urlKey(page.url())})` }); }

      // ── close stray tabs · next state ──
      for (const t of newTabs.splice(tabsBefore)) { try { const p = await t.page(); await p?.close(); } catch { /* */ } }
      const urlChanged = urlKey(page.url()) !== urlKey(urlBefore);
      if (urlChanged) state.dirty = true;
      else if (checkLike) state.dirty = true;
      else if (isField && (type === "ui" || type === "navigate")) state.dirty = true; // search box / filter field — not form data
      else if (isField || ((it.kind === "toggle") && type !== "mutation")) { /* field fills keep the page state (PREFILL builds on it) */ }
      else if (ok && (type === "modal" || (type === "ui" && (it.expect.state ?? "appears") === "appears"))) state.openChain.push(it.testid);
      else state.dirty = true;
      // R6 (it3 customer #13): a logout row revokes the runner's own session — the session row is PROTECTed (created after the
      // snapshot) so no restore brings it back and every later page of the pass showed the login screen (24 "dead").
      // Mint a fresh session and continue with it.
      if (/(^|-)logout(-|$)/.test(it.testid)) {
        try { cookies = await mintSession(user, ctx); await page.setCookie(...cookies); state.dirty = true; }
        catch (e) { console.log(`  ⚠️ ออก session ใหม่หลัง ${it.testid} ไม่ได้ — ${e instanceof Error ? e.message : e}`); }
      }
      if (repairsAfter(it.testid) && nonGetCount > nonGetBefore) { const full = FULL_REPAIR_RE.test(it.testid); await restoreSnapshot(`${it.page}#${it.testid} ${device} (ซ่อมข้อมูลซีด${full ? " · เต็ม" : ""})`, { keepNew: !full }); state.dirty = true; }
    }

    // c42b VACUITY GUARD: a "hidden" row passes only on a page that actually rendered for this persona — when the page
    // answered ≥400 although the same group expects ≥1 control VISIBLE for this persona (the record is not theirs / the
    // fixture is wrong), every hiddenFor "pass" of the group proves nothing ⇒ reclassified `vacuous` (not passed). A page
    // where EVERY row is hiddenFor for the persona and it answers 404 = the key gate itself (expected, stays passed).
    const expectsVisible = rowsOfPage.some((r) => !r.hiddenFor.includes(base));
    if (navStatus >= 400 && expectsVisible) {
      for (const r of pageResults) if (r.hiddenPass && r.ok) {
        r.ok = false; r.bucket = "vacuous"; r.detail = `หน้าตอบ HTTP ${navStatus} ทั้งที่กลุ่มนี้คาดว่ามีคอนโทรลที่ ${user} ต้องเห็น — การตรวจ "ซ่อน" ไม่ได้พิสูจน์อะไร`;
        passedN.n--; vacuous.push({ page: r.page ?? rowsOfPage[0]!.page, testid: r.testid, user, device, detail: r.detail });
      }
    }
    // initial-load console errors (before any row) + group-level http errors
    const status = navStatus;
    const arr = perPage.get(rowsOfPage[0]!.page) ?? [];
    arr.push({ user, device, path, status, results: pageResults, consoleErrors: cErrs, httpErrors: httpErrs, ms: Date.now() - t0 });
    PAGE_STATUS.push({ page: rowsOfPage[0]!.page, path, user, device, status, rows: rowsOfPage.length, hiddenRows: rowsOfPage.filter((r) => r.hiddenFor.includes(base)).length });
    perPage.set(rowsOfPage[0]!.page, arr);
    // the page ITSELF answered 404/403 and every row is hiddenFor this role ⇒ the role is correctly locked out — not a console fault
    const lockedOut = navStatus >= 400 && rowsOfPage.every((r) => r.hiddenFor.includes(base));
    if (loadErrs.size && !lockedOut) consoleErrors.push({ page: rowsOfPage[0]!.page, testid: "(page load)", user, device, detail: [...loadErrs].slice(0, 3).join(" | ") });
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
  RUN_OBJECT_KEY = ctx.objectKey ?? "";
  // throwaways must exist before the plan (their ids are in the page paths) and before the snapshot (restores keep them)
  if (!DRY) assertGateLockHeld("รอบที่เขียนฐาน"); // before ANY write (throwaways · fixtures · snapshot/restore)
  if (!DRY && !DISCOVER && [...ROWS].some((r) => AUDIT_STATE_ROWS.has(r.testid) && pageSelected(r.page))) await createThrowaways();
  if (!DRY && !DISCOVER && [...ROWS].some((r) => /(^|&)tab=lines(&|$)/.test(r.query ?? "") && pageSelected(r.page))) await createLinesDeals(ctx);
  if (!DRY && !DISCOVER && [...ROWS].some((r) => r.page.includes("[threadKey]") && pageSelected(r.page))) await createThreadFixtures(ctx);
  if (!DRY && !DISCOVER) await createExtraFixtures(ctx);
  else if (DRY) for (const u of userKeys) if (!u.startsWith("customer")) ctx.perUser[u] = { ...(ctx.perUser[u] ?? { dealId: null, contactId: null, companyId: null, partyId: null }), threadKey: ctx.threadKey ?? "dry-thread" };
  if (PICKS.length) {
    console.log(`── บันทึกที่แต่ละบทบาทเปิด (เลือกผ่านตัวกรองการมองเห็นของ product) ──`);
    for (const p of PICKS) console.log(`  · ${p.user} ${p.entity} ${p.id ?? "-"} — ${p.why}`);
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
  // FIXTURES (controller ruling §9, 27 Sep) — applied BEFORE the snapshot so every mid-run restore keeps them, reverted
  // explicitly in CLEAN; the originals are written to FIXTURE_FILE first so a crashed run is healed by the next start.
  await healFixtures();
  await applyFixtures(ctx);
  // portal access fixture for the customer role (the portal itself is enabled by applyFixtures for every role)
  if (userKeys.some((u) => u === "customer")) await ensurePortalFixture(ctx);
  try { await takeSnapshot(); }
  catch (e) { // no snapshot ⇒ no restore/purge ever runs; undo this run's own fixtures and stop
    await healFixtures();
    if (THROWAWAY.size) await P.crmContact.deleteMany({ where: { id: { in: [...THROWAWAY.values()] }, tenantId: TENANT } }).catch(() => {});
    await deleteLinesDeals();
    await deleteThreadFixtures();
    await deleteExtraFixtures();
    throw new Fatal(`snapshot ล้ม — ${e instanceof Error ? e.message : e}`);
  }
  const udd = `/tmp/chr-crm-btn-${process.pid}`;
  const browser = await (pptr as Any).default.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${udd}`],
  });
  // downloads: most CRM exports build a Blob client-side (server action → text → <a download>) — no HTTP response to see.
  // Watch the browser's own download events instead (DOWNLOADS[] — name + bytes), files land in the repo (snap /tmp is private)
  try {
    mkdirSync(DL_DIR, { recursive: true });
    const bcdp = await browser.target().createCDPSession();
    await bcdp.send("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: DL_DIR, eventsEnabled: true });
    const byGuid = new Map<string, { name: string; bytes: number; state: string }>();
    bcdp.on("Browser.downloadWillBegin", (e: Any) => { const d = { name: String(e.suggestedFilename ?? ""), bytes: 0, state: "begin" }; byGuid.set(e.guid, d); DOWNLOADS.push(d); });
    bcdp.on("Browser.downloadProgress", (e: Any) => { const d = byGuid.get(e.guid); if (d) { d.bytes = Math.max(d.bytes, Number(e.receivedBytes ?? 0), Number(e.totalBytes ?? 0)); d.state = String(e.state ?? d.state); } });
  } catch (e) { console.log(`  ⚠️ ตั้งตัวดักดาวน์โหลดไม่ได้ (${e instanceof Error ? e.message : e}) — แถว download ตัดสินจาก response อย่างเดียว`); }
  try {
    if (DISCOVER) await discover(browser, ctx, items);
    else for (const user of userKeys) await runUser(browser, user, ctx, items);
  } finally {
    await browser.close().catch(() => {});
    // snap chromium sees its own private /tmp ⇒ the profile really lives under /tmp/snap-private-tmp/snap.chromium (4 GB/day leak before)
    for (const d of [udd, `/tmp/snap-private-tmp/snap.chromium${udd}`]) { try { (await import("node:fs")).rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
    try { (await import("node:fs")).rmSync(DL_DIR, { recursive: true, force: true }); } catch { /* downloaded exports hold customer data — never keep */ }
    // ── CLEAN: exact restore, then the tag sweep, then this run's own fixtures/sessions ──
    PROTECT.clear();
    const fin = await restoreSnapshot("CLEAN (จบรอบ)");
    await deleteLinesDeals(); // before the tag sweep (which would also catch the qc-btn- titles) — reported by count
    await deleteThreadFixtures();
    await deleteExtraFixtures();
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
    await healFixtures();
    if (THROWAWAY.size) { try { const d = await P.crmContact.deleteMany({ where: { id: { in: [...THROWAWAY.values()] }, tenantId: TENANT } }); console.log(`🧩 ลบ throwaway ${d.count}`); } catch (e) { console.log(`  ⚠️ ลบ throwaway ไม่สำเร็จ — ${e instanceof Error ? e.message : e}`); } }
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
// c42b safety net: fixtures created before main's try/finally (throwaway contacts · deal-with-lines clones) must not outlive a
// run that threw earlier (server ping · puppeteer import) — idempotent (already-deleted ids = 0 rows)
if (!DRY && (THROWAWAY.size || LINES_DEALS.size || THREADS.size || XFIX.length)) {
  const left = await P.crmDeal.count({ where: { id: { in: [...LINES_DEALS.values()] } } }).catch(() => 0) + await P.crmContact.count({ where: { id: { in: [...THROWAWAY.values()] } } }).catch(() => 0)
    + await P.crmEmailMessage.count({ where: { id: { in: [...THREADS.values()].map((t) => t.id) } } }).catch(() => 0) + await extraFixturesLeft();
  if (left) {
    await deleteLinesDeals();
    await deleteThreadFixtures();
    await deleteExtraFixtures();
    await P.crmContact.deleteMany({ where: { id: { in: [...THROWAWAY.values()] }, tenantId: TENANT } }).catch(() => {});
    console.log(`🧩 safety net: ลบ fixture ที่ค้าง ${left}`);
  }
}

if (!DRY && !DISCOVER) {
  writeFileSync(`${SHOTS}/summary.json`, JSON.stringify({
    at: new Date().toISOString(), users: userKeys, devices: VIEWPORTS.map((v) => v[0]), pageFilter: PAGE_FILTER,
    total: total.n, passed: passedN.n,
    dead, wrongExpect, hiddenLeak, vacuous, consoleErrors, overflow, picks: PICKS, pageStatus: PAGE_STATUS,
    skippedNeeds, skippedSafety, restores: restoreLog, dbCheckUnparsed: Object.fromEntries(dbCheckUnparsed), fatal: fatal || null,
  }, null, 2));
  for (const [page, entries] of perPage) {
    const fname = `${SHOTS}/${page.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "root"}.json`;
    writeFileSync(fname, JSON.stringify({ page, entries }, null, 2));
  }
  console.log(`\n${!fatal && passedN.n === total.n ? "🟢" : "🔴"} C4.2: ${passedN.n}/${total.n} · dead ${dead.length} · wrongExpect ${wrongExpect.length} · hiddenLeak ${hiddenLeak.length} · vacuous ${vacuous.length} · overflow ${overflow.length} · skippedNeeds ${skippedNeeds.length} · skippedSafety ${skippedSafety.length}`);
}
if (fatal) console.error(`❌ ${fatal}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: total.n, passed: passedN.n, dead: dead.length, wrongExpect: wrongExpect.length, hiddenLeak: hiddenLeak.length, vacuous: vacuous.length, consoleErrors: consoleErrors.length, overflow: overflow.length, skippedNeeds: skippedNeeds.length, skippedSafety: skippedSafety.length, restoreFailures: restoreLog.reduce((a, r) => a + r.failed.length, 0), fatal: fatal || null })}`);
await P.$disconnect().catch(() => {});
process.exit(fatal ? 2 : 0);
