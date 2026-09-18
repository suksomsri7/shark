// QC — CRM v2 WO C1.6: Activities v2 — `src/lib/modules/crm/activities.ts` (+ `activities-shared.ts`) · `files.ts` ·
//      calendar · notes (pin) · internal comments (@mention) · private file attachments · kanban links DEAL/COMPANY/CRM_CONTACT/
//      CUSTOM_RECORD · deal 360 cards · consumer of kanban.card.completed · events crm.activity.logged / crm.activity.completed
// Oracle writer · the C1.6 builder must NOT touch this file · QC database only (.env.qc)
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c1.6.mts
//      (`--force-run` = run every check even while activities.ts is absent — all red, CLEAN green; proves fixtures, workers, cleanup)
// requires: crm-seed   (house style — this oracle reads NO seeded row; everything lives in throwaway tenants `qc-c16-<rand>`)
//
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE (not re-implemented here): qc-crm-activity (v1 addActivity / completeActivity /
//   listActivities of crm/service.ts keep their signatures and behaviour) · qc-kanban-k3.3 (inbound bridges — createCardFromExternal
//   is the one door) · qc-kanban-notify (kanban in-app notifications unaffected by the new mention notifications) · qc-kanban-k1.9 ·
//   qc-kanban-k1.15 · qc-kanban-k3.7 (R-C.13: kanban attachment/link coverage) · qc-crm-c0.4 (private files — C1.6 is its first
//   real consumer) · qc-crm · qc-crm-c1.1 … qc-crm-c1.5 · qc-member-m1.9 (30/15/10/5 — nothing here touches the seeded tenants).
//
// SOURCES: crm-brief-C1.6.md · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-A where.ts · R-C.8 keys · R-C.13 regression names ·
//   R-D NOT parallel C1.6→C1.7 · R-E.2 private files · R-E.14 uiVersion) · CRM-RUN §2 "C1.6" (S1–S6 = 20) + brief S7 notes/pin/mention
//   + S8 file attach/list/remove · MASTER-PLAN §2 §4 (X1–X10) §5 §6 row C1.6 · blueprint §5.5 §3.8 §4.1 (CrmActivity v2 columns)
//   §4.5 (activityOutcomes defaults) · decision C19 (CrmFileLink + pinned NOTE + mentions[]) · C17 (private files) · mockup 08
//   (calendar panel "ปฏิทินสัปดาห์ · ของฉัน/ทีม" and the "บันทึกกิจกรรม" button — panel names only, no screenshot assertion) ·
//   companies.ts header (lock order) · C1.3 debt (CrmCompany.lastActivityAt maintained by nobody).
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this) ══════════════════════════════════
//   import * as A from "@/lib/modules/crm/activities"   · caps in "@/lib/modules/crm/activities-shared" (client-safe; re-export tolerated)
//   import * as F from "@/lib/modules/crm/files"
//   ctx = { tenantId, systemId /* CRM system of that tenant — re-resolved (type CRM), never trusted */, actorUserId } · actor = MemberActor
//   errors: thrown, `.code` ∈ NOT_FOUND | VALIDATION | FORBIDDEN | CONFIRM_REQUIRED | CONFLICT · Thai message that never blames the
//           user · foreign ids ⇒ NOT_FOUND (404-not-403), the message never echoes foreign data
//   caps (activities-shared.ts): ACTIVITY_BODY_MAX = 8000 (X6) · ACTIVITY_TITLE_MAX ≤ 300 · ACTIVITY_REASON_MIN = 5 ·
//        ACTIVITY_OUTCOMES_DEFAULT = blueprint §4.5 { CALL: ["สนใจ","รับสาย","ไม่รับ","ฝากข้อความ","เบอร์ผิด","ไม่สนใจ"],
//        MEETING: ["สำเร็จ","เลื่อน","ยกเลิก","ไม่มา"] } (used while settings.crm.activityOutcomes[type] is absent)
//   caps (files.ts): CRM_FILE_MAX_BYTES (0 < n ≤ 10 MiB) · CRM_FILE_NAME_MAX (≤ 200) · CRM_FILE_ENTITY_TYPES = CONTACT|COMPANY|DEAL|RECORD
//   A.logActivity(ctx, actor, { type /* any of the 12 CrmActivityType */, title, body?, direction?, channel?, contactId?, companyId?,
//        dealId?, customRecordId?, startAt?, endAt?, durationSec?, outcome?, attendees?, location?, dueAt?, remindAt?, done?, priority?,
//        pinned? /* NOTE only */, mentions? /* userIds — NOTE only */, nextTask?: { type, title, dueAt } }) → ActivityDto { id, … }
//        [tolerated: { activity: { id } }] · nextTask id at `.nextTask.id` | `.nextTaskId`
//     · ≥ 1 target (contact/company/deal/record) of the ctx system, else VALIDATION · dealId ⇒ contactId/companyId default to the deal's ·
//       contactId only ⇒ companyId defaults to contact.companyId (primary cache) · a given companyId must be linked to the contact
//     · outcome ∈ settings.crm.activityOutcomes[type] (fallback ACTIVITY_OUTCOMES_DEFAULT[type]); a type without a list takes no outcome
//     · body ≤ ACTIVITY_BODY_MAX · endAt ≥ startAt · durationSec ≥ 0 integer · title required ≤ ACTIVITY_TITLE_MAX
//     · nextTask ⇒ a second CrmActivity (type = nextTask.type, doneAt null, same contact/deal/company/record, owner = actor) IN THE SAME TX;
//       an invalid nextTask (blank title / missing or invalid dueAt) ⇒ VALIDATION and NOTHING is written
//     · lastActivityAt of the contact, the deal AND the company := GREATEST(current, at) where at = min(startAt ?? now, now) — never
//       backwards, never in the future · the deal's stalledAt := null · the company value is written THROUGH companies*.ts (single writer
//       of CrmCompany — C1.3 debt; e.g. an exported `companies.touchLastActivityInTx`) · single-statement SQL (X3: parallel = max)
//     · LOCK ORDER (binding — companies.ts header + C1.5): tree → engine → tax → party → CrmCompany rows (sorted) → CrmContact rows
//       (sorted) → CrmDeal rows (sorted) ⇒ logActivity ∥ deals.moveDeal ∥ companies.setPrimary never deadlocks (40P01)
//     · emits crm.activity.logged INSIDE the tx · key `crm.activity.logged#<activityId>#<seq>` · payload ids only (activityId, type,
//       contactId, dealId, companyId, customRecordId, ownerUserId) — never title/body/outcome text/phone/e-mail/name (X8)
//     · NOTE + mentions ⇒ one in-app `AppNotification { tenantId, recipientUserId }` per mentioned user who CAN SEE the record (visibility
//       through where.ts contactWhere/companyWhere/dealWhere evaluated for THAT user's membership in this tenant); a user who cannot see
//       it (no accepted membership in this tenant) gets nothing, is not echoed in the DTO, and no tenant-wide (recipientUserId null)
//       notification is written · `mentions[]` keeps only the users that were notified · editing the note never re-notifies
//   A.completeActivity(ctx, actor, id, { outcome? }?) · conditional update (doneAt null) ⇒ completed ONCE: doneAt + completedById,
//        one crm.activity.completed (key `crm.activity.completed#<id>#<seq>`, emitted in the tx) · already done ⇒ no-op, no event
//   A.rescheduleActivity(ctx, actor, id, { dueAt?, startAt?, endAt? }) · A.updateActivity(ctx, actor, id, { title?, body?, outcome?,
//        pinned?, mentions? }) (same validation as log) · A.setPinned(ctx, actor, id, pinned) [tolerated pinNote] — NOTE only (else VALIDATION)
//   A.deleteActivity(ctx, actor, id, { confirm, reason ≥ 5 }) — MANAGER+ or the activity's owner (another STAFF ⇒ FORBIDDEN|NOT_FOUND) ·
//        audit row keeps the reason (X9) · A.getActivity(ctx, actor, id) → ActivityDto
//   A.listActivities(ctx, actor, { scope?: "mine"|"team", status?: "pending"|"today"|"week"|"overdue"|"done", type?, contactId?,
//        companyId?, dealId?, customRecordId?, from?, to?, cursor?, pageSize? }) → { items, nextCursor }   (THAI time, +07:00)
//        pending = not done · overdue = not done ∧ dueAt < now · today = not done ∧ dueAt in the Thai calendar day of now ·
//        week = not done ∧ dueAt in [Thai today 00:00, +7 days) · done = doneAt set · mine = ownerUserId = actor
//   A.calendar(ctx, actor, { from, to, mine?, team? }) → { items } | items[] — CRM activities whose (startAt ?? dueAt) ∈ [from, to)
//   A.listNotes(ctx, actor, { contactId? | companyId? | dealId? | customRecordId? }) → NOTE items, pinned first, then newest first
//   A.openTaskCard(ctx, actor, { activityId, boardId, columnId? }) → { cardId, created } [tolerated createTaskCard / openKanbanCard]
//        through kanban `links.createCardFromExternal` ONLY (sourceKey `crm:activity:<activityId>` — twice = same card) · links
//        DEAL / COMPANY / CRM_CONTACT / CUSTOM_RECORD of the activity's records · sets CrmActivity.kanbanCardId · board of this tenant only
//   consumer extra on `kanban.card.completed` (composed, never fails the main consumer): every CrmActivity of that tenant with
//        kanbanCardId = the card and doneAt null ⇒ completed once (X4: twice, 5× parallel, and 6× parallel as the FIRST delivery)
//   kanban link-resolvers: DEAL / COMPANY / CUSTOM_RECORD resolve for real (title, systemId, href `/app/sys/<crm>/crm/deals/<id>` …),
//        in LINK_TYPE_KINDS · smallest edit in the kanban link rendering
//   deals.getDeal360(…) (C1.5 file) lists the deal's kanban cards: `kanbanCards[]` [tolerated `cards` / `taskCards`] with cardId|id
//   F.attachFile(ctx, actor, { entityType, entityId, filename, contentType, data: Uint8Array }, deps?: { put?, del? }) → FileLinkDto
//        { id, name, size, mime, url, createdAt } · storage `uploadFile(…, { visibility: "private" })` ONLY (path t/<tid>/private/…,
//        cdnUrl sentinel private://…) · mime ⊂ storage allowlist minus SVG · size ≤ CRM_FILE_MAX_BYTES · name sanitised (no / \ < > or
//        control chars, no leading dot, ≤ CRM_FILE_NAME_MAX, Thai kept) · refused ⇒ VALIDATION, no FileAsset, no CrmFileLink, no put
//   F.listFiles(ctx, actor, { entityType, entityId }) → FileLinkDto[] | { items } · `url` = privateFileUrl(fileId, { kind: "STAFF",
//        id: actor.userId }) — never a CDN / permanent URL / sentinel / storage path (X10)
//   F.removeFile(ctx, actor, linkId, { confirm?, reason? }?, deps?) — uploader or MANAGER+ (another STAFF ⇒ FORBIDDEN|NOT_FOUND) ·
//        CrmFileLink + FileAsset row + stored object gone (storage.deleteFileAsset) · audit row
//   reads: through where.ts (activityWhere + contact/company/deal wheres; a `fileWhere` for CrmFileLink — R-A) — C1.7 rewrites internals
//   events: crm.activity.logged / crm.activity.completed in outbox-consumers + automation OR webhooks labels (declared once) · idempotent
//   pages: crm/activities/page.tsx (v2) · crm/calendar/page.tsx (day | week | month) · both "ready" in crm/nav.ts · block components
//          under src/components/crm/activity/** and src/components/crm/files/** rendered by the contact / company / deal 360 pages
//
// WHAT THIS FILE PROVES: S0 structure · S1 log every type + outcome registry (5) · S2 nextTask (2) · S3 lastActivityAt/stalledAt (3) ·
//   S4 list status 5 modes (5) · S5 kanban card ↔ deal/activity (3) · S6 pages (2, static) · S7 notes / pin / mention · S8 files
//   attach/list/remove · S9 brief extras (events registry + in-tx + keys · complete/reschedule/update · calendar · mine/team ·
//   4 kanban link types · deal 360 cards · company single writer) · X1 · X3 (in-process + worker PROCESSES: parallel log = max;
//   log ∥ setPrimary; log ∥ deals.moveDeal ∥ setPrimary) · X4 (kanban.card.completed + the 2 new consumers) · X6 · X8 · X9 · X10
//   X2 n/a (no op/tool — C1.10) · X5 n/a (markOverdue/remind crons are not in this WO) · X7 n/a (no public endpoint).
// HOUSE RULES: SKIP guard (no DB before it) · throwaway tenants `qc-c16-<rand>` (+ `-b`) swept in `finally` · no drainOutbox ·
//   object storage is never contacted (fake SHARK_BUNNY_* + injected put/del + fetch stub) · seeded QC data never read or written ·
//   checks that need deals.ts (C1.5) are SKIPPED-for-reason while it is absent · last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const A_FILE = "src/lib/modules/crm/activities.ts";
const SHARED_FILE = "src/lib/modules/crm/activities-shared.ts";
const F_FILE = "src/lib/modules/crm/files.ts";
const D_FILE = "src/lib/modules/crm/deals.ts";
const NAV_FILE = "src/lib/modules/crm/nav.ts";
const CRM_PAGES = "src/app/app/sys/[id]/crm";
const A_SPEC = "@/lib/modules/crm/activities";
const F_SPEC = "@/lib/modules/crm/files";
const D_SPEC = "@/lib/modules/crm/deals";
const CO_SPEC = "@/lib/modules/crm/companies";
const THIS_FILE = "scripts/qc-crm-c1.6.mts";

const ARGV = process.argv.slice(2);
const WORKER_AT = ARGV.indexOf("--x3-worker");
const FORCE = ARGV.includes("--force-run");

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guard — nothing of C1.6 exists yet ⇒ SKIPPED, no DB connection opened.
// ═══════════════════════════════════════════════════════════════════════════════════
if (!existsSync(A_FILE) && WORKER_AT < 0 && !FORCE) {
  console.log(`⚠️  SKIPPED — WO C1.6 not built yet (${A_FILE} missing)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();

// ─── object storage is NEVER contacted: fake identity + fetch stub (a forgotten `deps` injection still cannot reach Bunny) ───
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c16-${rand}`;
const CDN = "https://qc-c16-cdn.invalid";
process.env.SHARK_BUNNY_CDN = CDN;
process.env.SHARK_BUNNY_ZONE = `${TAG}-zone`;
process.env.SHARK_BUNNY_KEY = `qc-c16-key-${randomBytes(8).toString("hex")}`;
delete process.env.BUNNY_ACCOUNT_KEY;
const STORE_REQ: { method: string; url: string }[] = [];
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  const method = String(init?.method ?? input?.method ?? "GET").toUpperCase();
  if (/bunnycdn\.com|bunny\.net|qc-c16-cdn\.invalid/.test(url)) {
    STORE_REQ.push({ method, url });
    return new Response(method === "GET" ? "not found" : "ok", { status: method === "PUT" ? 201 : method === "GET" ? 404 : 200 });
  }
  return realFetch(input, init);
}) as typeof fetch;

const ownerActor = (userId: string) => ({ userId, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> });
const managerActor = (userId: string) => ({ userId, role: "MANAGER", unitAccess: ["*"] as string[], permissions: {} as Record<string, unknown> });
const staffActor = (userId: string, perms: Record<string, unknown> = { "crm.*": true }) => ({ userId, role: "STAFF", unitAccess: ["*"] as string[], permissions: perms });
const fnOf = (mod: Any, ...names: string[]): Any => {
  for (const n of names) {
    let v: Any = mod;
    for (const p of n.split(".")) v = v?.[p];
    if (typeof v === "function") return v;
  }
  return undefined;
};
const codeOf = (e: Any) => String(e?.code ?? "-");

// ═══════════════════════════════════════════════════════════════════════════════════
// X3 WORKER MODE — this same file re-invoked as a child process (own PrismaClient = own pool, synchronised start).
//   argv: --x3-worker <mode> <tenantId> <crmSystemId> <userId> <startAtMs> <base64url(JSON arg)>
//     log     : { dealId?, contactId?, companyId?, times: number[] } → parallel logActivity (CALL, startAt = each time)
//     move    : { dealId, stages[], rounds } → rounds × deals.moveDeal (sequential inside the worker)
//     primary : { companyId, contacts[], rounds } → rounds × companies.setPrimary alternating the contacts
// ═══════════════════════════════════════════════════════════════════════════════════
if (WORKER_AT >= 0) {
  const [mode, wT, wS, wU, wStart, wArg] = ARGV.slice(WORKER_AT + 1);
  const AW = (await import(A_SPEC as string).catch(() => ({}))) as Any;
  const DW = (await import(D_SPEC as string).catch(() => ({}))) as Any;
  const COW = (await import(CO_SPEC as string).catch(() => ({}))) as Any;
  const dbw = (await import("@/lib/core/db")) as Any;
  const ctx = { tenantId: wT, systemId: wS, actorUserId: wU };
  const actor = ownerActor(wU);
  const arg = JSON.parse(Buffer.from(String(wArg), "base64url").toString("utf8"));
  const waitMs = Number(wStart) - Date.now();
  if (waitMs > 0) await new Promise<void>((r) => setTimeout(r, waitMs));
  const run = async (f: () => Promise<unknown>): Promise<string> => {
    try {
      await f();
      return "OK";
    } catch (e) {
      return `ERR:${codeOf(e)}:${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`;
    }
  };
  const need = (fn: Any, name: string) => { if (typeof fn !== "function") throw Object.assign(new Error(`${name} missing`), { code: "MISSING_FUNCTION" }); return fn; };
  const out: string[] = [];
  if (mode === "log") {
    const log = fnOf(AW, "logActivity");
    out.push(...(await Promise.all((arg.times as number[]).map((t, i) => run(() => need(log, "logActivity")(ctx, actor, {
      type: "CALL", title: `แข่งบันทึก ${i}`, startAt: new Date(t),
      ...(arg.dealId ? { dealId: arg.dealId } : {}), ...(arg.contactId ? { contactId: arg.contactId } : {}), ...(arg.companyId ? { companyId: arg.companyId } : {}),
    }))))));
  } else if (mode === "move") {
    const mv = fnOf(DW, "moveDeal");
    for (let r = 0; r < Number(arg.rounds ?? 3); r += 1)
      for (const st of arg.stages as string[]) out.push(await run(() => need(mv, "moveDeal")(ctx, actor, arg.dealId, { stageId: st })));
  } else if (mode === "primary") {
    for (let r = 0; r < Number(arg.rounds ?? 3); r += 1)
      for (const k of arg.contacts as string[]) out.push(await run(() => need(COW.setPrimary, "setPrimary")(ctx, actor, arg.companyId, k)));
  }
  console.log(`X3WORKER ${JSON.stringify(out)}`);
  await dbw.prisma.$disconnect();
  process.exit(0);
}

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;

// ─────────────────────────── harness ───────────────────────────
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const SKIPS: { id: string; why: string }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
/** a check whose prerequisite belongs to another WO (deals.ts of C1.5) — neither green nor red, listed in JSON_SUMMARY */
const skip = (id: string, n: string, why: string) => {
  SKIPS.push({ id, why });
  console.log(`  ⚪ [${id}] ${n} — SKIPPED: ${why}`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const cut = (v: string | undefined | null, n = 260) => { const s = String(v ?? ""); return s.length > n ? `${s.slice(0, n)}…` : s; };
const j = (v: Any): string =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x instanceof Uint8Array ? `<${x.length}b>` : x)) ?? "undefined";
const thai = (s: unknown) => typeof s === "string" && s.trim().length > 0 && /[ก-๙]/.test(s);
type Res = { ok: boolean; v: Any; err: string; code: string; status: number; msg: string };
const call = async (fn: Any, ...args: Any[]): Promise<Res> => {
  if (typeof fn !== "function") return { ok: false, v: undefined, err: "MISSING_FUNCTION", code: "MISSING_FUNCTION", status: 0, msg: "" };
  try {
    return { ok: true, v: await fn(...args), err: "", code: "", status: 0, msg: "" };
  } catch (e) {
    const x = e as Any;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, v: undefined, err: `${x?.name ?? "Error"}(${x?.code ?? "-"}): ${cut(msg, 160)}`, code: String(x?.code ?? ""), status: Number(x?.status ?? 0), msg };
  }
};
const isNotFound = (r: Res) => !r.ok && (r.code === "NOT_FOUND" || r.status === 404);
const isValidation = (r: Res) => !r.ok && (r.code === "VALIDATION" || r.code === "BAD_INPUT" || r.status === 400);
const isRefused = (r: Res) => !r.ok && r.code !== "MISSING_FUNCTION" && ["VALIDATION", "BAD_INPUT", "CONFIRM_REQUIRED", "CONFLICT", "NOT_FOUND", "FORBIDDEN"].includes(r.code);
const isForbidden = (r: Res) => !r.ok && (r.code === "FORBIDDEN" || r.code === "NOT_FOUND" || r.status === 403);
const itemsOf = (r: Any): Any[] => (Array.isArray(r) ? r : (r?.items ?? r?.rows ?? r?.activities ?? r?.files ?? []));
const idsOf = (r: Any): string[] => itemsOf(r).map((x: Any) => String(x?.id ?? x?.activityId ?? ""));
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
/** every string inside a value (DTO walker for X10) */
const strings = (v: Any, out: string[] = []): string[] => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (v && typeof v === "object" && !(v instanceof Date) && !(v instanceof Uint8Array)) for (const x of Object.values(v)) strings(x, out);
  return out;
};

// ─────────────────────────── state ───────────────────────────
const TRIG = `qc_c16_${rand}`;
const NONE = `${TAG}-none`;
const aid = (v: Any): string => {
  const x = typeof v === "string" ? v : (v?.activity?.id ?? v?.activityId ?? v?.id ?? "");
  return typeof x === "string" && x ? x : NONE;
};
const did = (v: Any): string => {
  const x = typeof v === "string" ? v : (v?.deal?.id ?? v?.dealId ?? v?.id ?? "");
  return typeof x === "string" && x ? x : NONE;
};
let phoneSeq = 0;
const phoneOf = (): string => `08${String((Math.floor(Math.random() * 9_000_000) + 1_000_000) * 10 + (phoneSeq++ % 10)).padStart(8, "0").slice(-8)}`;
const mailOf = (s: string) => `${TAG}-${s}@qc-crm.example`;
const SENT_PHONE = phoneOf();
const SENT_EMAIL = mailOf("secret-buyer");
const SENT_NAME = `ผู้ซื้อลับ${rand}`;
const SECRET_NOTE = `ลูกค้าขอส่วนลดพิเศษลับ${rand} โทร ${SENT_PHONE} อีเมล ${SENT_EMAIL}`;
let tidA = "";
let tidB = "";
let TENANTS: string[] = [];
const USERS: string[] = [];
const PUTS: string[] = [];
const DELS: string[] = [];
const storageDeps = {
  put: async (path: string) => { PUTS.push(path); },
  del: async (path: string) => { DELS.push(path); return 200; },
};
const putsTotal = () => PUTS.length + STORE_REQ.filter((r) => r.method === "PUT").length;
const putPaths = () => [...PUTS, ...STORE_REQ.filter((r) => r.method === "PUT").map((r) => r.url)];
const delPaths = () => [...DELS, ...STORE_REQ.filter((r) => r.method === "DELETE").map((r) => r.url)];

type Evidence = { label: string; logs: string[]; ops: Any[] };
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
    const ops = TENANTS.length ? await P.opsEvent.findMany({ where: { tenantId: { in: TENANTS }, createdAt: { gte: t0 } } }).catch(() => []) : [];
    EVIDENCE.push({ label, logs, ops });
  }
}
const dropTriggers = async () => {
  await P.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRIG} ON "OutboxEvent"`).catch(() => 0);
  await P.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${TRIG}_fn()`).catch(() => 0);
};
/** make an OutboxEvent INSERT of tenant A fail when `cond` holds (proves the write sits in ONE transaction with its event) */
const mkTrigger = async (cond: string) => {
  await dropTriggers();
  await P.$executeRawUnsafe(
    `CREATE FUNCTION ${TRIG}_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."tenantId" = '${tidA}' AND ${cond} THEN RAISE EXCEPTION 'qc-c16 forced failure'; END IF; RETURN NEW; END $$`,
  );
  await P.$executeRawUnsafe(`CREATE TRIGGER ${TRIG} AFTER INSERT ON "OutboxEvent" FOR EACH ROW EXECUTE FUNCTION ${TRIG}_fn()`);
};

// Thai time (+07:00) without getDay()/getDate()
const TH_MS = 7 * 3600_000;
const DAY_MS = 86_400_000;
const thaiDayStart = (ms: number) => Math.floor((ms + TH_MS) / DAY_MS) * DAY_MS - TH_MS;
const sec = (ms: number) => Math.floor(ms / 1000) * 1000;

console.log(`\n═══ QC CRM v2 · C1.6 — activities v2 · calendar · notes/files/mentions · kanban links ═══`);
console.log(`[env] DB ${host} · tag ${TAG}${FORCE && !existsSync(A_FILE) ? " · --force-run with activities.ts ABSENT (every functional check below is expected red)" : ""}${existsSync(D_FILE) ? "" : " · deals.ts (C1.5) ABSENT ⇒ its checks are SKIPPED"}\n`);

try {
  {
    const stale = (await P.$queryRawUnsafe(`SELECT tgname FROM pg_trigger WHERE tgname LIKE 'qc_c16_%'`).catch(() => [])) as Any[];
    for (const s of stale) {
      const n = String(s.tgname);
      if (/^qc_c16_[a-z]+$/.test(n)) {
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
  const A = (await import(A_SPEC as string).catch((e: Any) => { importErr = e instanceof Error ? e.message : String(e); return {}; })) as Any;
  const SH = (await import("@/lib/modules/crm/activities-shared" as string).catch(() => null)) as Any;
  const F = (await import(F_SPEC as string).catch(() => ({}))) as Any;
  const D = (await import(D_SPEC as string).catch(() => ({}))) as Any;
  const CO = (await import(CO_SPEC as string).catch(() => ({}))) as Any;
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => null)) as Any;
  const ST = (await import("@/lib/storage/service" as string).catch(() => null)) as Any;
  const KL = (await import("@/lib/modules/kanban/links" as string).catch(() => ({}))) as Any;
  const KR = (await import("@/lib/modules/kanban/link-resolvers" as string).catch(() => ({}))) as Any;
  const KS = (await import("@/lib/modules/kanban/service" as string).catch(() => ({}))) as Any;
  const KT = (await import("@/lib/modules/kanban/my-tasks" as string).catch(() => ({}))) as Any;
  const HAS_DEALS = existsSync(D_FILE) && typeof D?.moveDeal === "function";
  const aSrcAll = existsSync("src/lib/modules/crm")
    ? readdirSync("src/lib/modules/crm").filter((f) => /^activities.*\.tsx?$/.test(f)).map((f) => read(join("src/lib/modules/crm", f))).join("\n")
    : "";
  const aSrc = read(A_FILE);
  const fSrc = read(F_FILE);
  const sharedSrc = read(SHARED_FILE);
  const capOf = (k: string): number => Number(SH?.[k] ?? A?.[k] ?? F?.[k] ?? NaN);
  const fns = {
    log: fnOf(A, "logActivity"),
    complete: fnOf(A, "completeActivity"),
    reschedule: fnOf(A, "rescheduleActivity"),
    update: fnOf(A, "updateActivity"),
    del: fnOf(A, "deleteActivity"),
    get: fnOf(A, "getActivity"),
    list: fnOf(A, "listActivities"),
    cal: fnOf(A, "calendar", "listCalendar"),
    notes: fnOf(A, "listNotes"),
    pin: fnOf(A, "setPinned", "pinNote"),
    card: fnOf(A, "openTaskCard", "createTaskCard", "openKanbanCard"),
    attach: fnOf(F, "attachFile"),
    files: fnOf(F, "listFiles"),
    remove: fnOf(F, "removeFile"),
  };
  chk("C1.6-S0.0", "activities.ts exists and loads (module import does not throw)", existsSync(A_FILE) && !importErr, "loads", importErr ? cut(importErr) : existsSync(A_FILE) ? "-" : "file missing");
  {
    const miss = Object.entries(fns).filter(([k, f]) => !f && !["attach", "files", "remove"].includes(k)).map(([k]) => k);
    chk("C1.6-S0.1", "activities.ts exports the §5.5 surface: logActivity · completeActivity · rescheduleActivity · updateActivity · deleteActivity · getActivity · listActivities · calendar · listNotes · setPinned · openTaskCard",
      miss.length === 0, "all present", miss.join(",") || "-");
  }
  chk("C1.6-S0.2", "files.ts exists with attachFile · listFiles · removeFile (C19)", existsSync(F_FILE) && !!fns.attach && !!fns.files && !!fns.remove, "3 functions",
    `file=${existsSync(F_FILE)} ${["attach", "files", "remove"].filter((k) => !(fns as Any)[k]).join(",") || "-"}`);
  {
    const caps = { body: capOf("ACTIVITY_BODY_MAX"), title: capOf("ACTIVITY_TITLE_MAX"), reason: capOf("ACTIVITY_REASON_MIN"), fmax: Number(F?.CRM_FILE_MAX_BYTES ?? SH?.CRM_FILE_MAX_BYTES), fname: Number(F?.CRM_FILE_NAME_MAX ?? SH?.CRM_FILE_NAME_MAX) };
    const def = (SH?.ACTIVITY_OUTCOMES_DEFAULT ?? A?.ACTIVITY_OUTCOMES_DEFAULT) as Any;
    const defOk = j(def?.CALL) === j(["สนใจ", "รับสาย", "ไม่รับ", "ฝากข้อความ", "เบอร์ผิด", "ไม่สนใจ"]) && j(def?.MEETING) === j(["สำเร็จ", "เลื่อน", "ยกเลิก", "ไม่มา"]);
    chk("C1.6-S0.3", "named caps: ACTIVITY_BODY_MAX = 8000 (X6) · ACTIVITY_TITLE_MAX ≤ 300 · ACTIVITY_REASON_MIN = 5 · CRM_FILE_MAX_BYTES ≤ 10 MiB · CRM_FILE_NAME_MAX ≤ 200 · ACTIVITY_OUTCOMES_DEFAULT = blueprint §4.5 (CALL 6 · MEETING 4)",
      caps.body === 8000 && caps.title > 0 && caps.title <= 300 && caps.reason === 5 && caps.fmax > 0 && caps.fmax <= 10 * 1024 * 1024 && caps.fname > 0 && caps.fname <= 200 && defOk,
      "caps", `${j(caps)} defaults=${defOk}`, "MAJOR");
  }
  chk("C1.6-S0.4", "activities-shared.ts is client-safe (the activity/calendar/notes client components import caps from it): no prisma / core db / server-only import",
    sharedSrc.length > 0 && !/from\s+["'](@prisma\/client|@\/lib\/core\/db|server-only|next\/headers)["']/.test(sharedSrc) && !/from\s+["']\.\/(activities|files)["']/.test(sharedSrc),
    "exists · no server import", sharedSrc ? cut(sharedSrc.match(/from\s+["'][^"']+["']/g)?.join(" ") ?? "-") : "missing", "MINOR");
  {
    const whereSrc = read("src/lib/modules/crm/where.ts");
    const uses = (aSrc.match(/\bactivityWhere\b/g) ?? []).length;
    const fileWhereOk = /export\s+function\s+fileWhere\b/.test(whereSrc) && /\bfileWhere\b/.test(fSrc);
    chk("C1.6-S0.5", "every read goes through where.ts (R-A — C1.7 rewrites its internals): activities.ts uses `activityWhere` ≥ 3× and the entity wheres (contact/company/deal) to resolve targets · where.ts exports `fileWhere`, used by files.ts [static]",
      uses >= 3 && /\b(dealWhere|contactWhere|companyWhere)\b/.test(aSrc) && fileWhereOk, "where.ts everywhere", `activityWhere=${uses} entityWheres=${/\b(dealWhere|contactWhere|companyWhere)\b/.test(aSrc)} fileWhere=${fileWhereOk}`, "MAJOR");
  }
  {
    // C1.3 debt: CrmCompany has ONE writer (companies*.ts). member/fields.ts is the custom-field engine writing ungoverned keys only.
    const off = walk("src")
      .filter((f) => !/\/crm\/companies[^/]*\.ts$/.test(f) && !/\/member\/fields\.ts$/.test(f))
      .filter((f) => { const s = read(f); return /crmCompany\s*\.\s*(update|updateMany|upsert|create|createMany)\s*\(/.test(s) || /UPDATE\s+"CrmCompany"/.test(s); });
    const viaCompanies = /from\s+["']\.\/companies["']/.test(aSrcAll) || /\bcompanies\s*\.\s*\w*[Ll]astActivity/.test(aSrcAll) || /import\(\s*["']\.\/companies["']/.test(aSrcAll);
    chk("C1.6-S0.6", "C1.3 debt · single writer: no CrmCompany write (crmCompany.update/updateMany/upsert/create · UPDATE \"CrmCompany\") outside companies*.ts (member/fields.ts engine excepted) — activities*.ts reaches the company's lastActivityAt THROUGH companies.ts [static]",
      aSrcAll.length > 0 && off.length === 0 && viaCompanies, "companies*.ts only", `off=${off.join(",") || "-"} viaCompanies=${viaCompanies}`);
  }
  {
    const kanbanDirect = /kanbanCard(Link)?\s*\.\s*(create|createMany|upsert|update|updateMany)\s*\(|INSERT\s+INTO\s+"KanbanCard/.test(aSrcAll);
    const usesDoor = /createCardFromExternal/.test(aSrcAll);
    chk("C1.6-S0.7", "kanban cards/links are created only through kanban `createCardFromExternal` (the one door, K3.x) — activities*.ts never writes KanbanCard / KanbanCardLink rows itself [static]",
      usesDoor && !kanbanDirect, "door only", `door=${usesDoor} direct=${kanbanDirect}`, "MAJOR");
  }
  {
    const privateUpload = /visibility\s*:\s*["']private["']/.test(fSrc) && /uploadFile\s*\(/.test(fSrc) && /privateFileUrl\s*\(/.test(fSrc);
    const noCdn = fSrc.length > 0 && !/\b(url|href|link|src|downloadUrl)\s*:\s*[\w.?!]*\bcdnUrl\b/.test(fSrc.replace(/\/\/.*$/gm, ""));
    chk("C1.6-S0.8", "files.ts uploads through storage `uploadFile(…, { visibility: \"private\" })` and builds DTO links with `privateFileUrl(…)` — never copies `cdnUrl` into a DTO [static]",
      privateUpload && noCdn, "private path + privateFileUrl", `private=${privateUpload} noCdnInDto=${noCdn}`);
  }
  chk("C1.6-S0.9", "implementation sites are marked `// AUDIT-CLASS X1` / `X3` / `X4` / `X6` / `X8` / `X9` / `X10` in activities*.ts + files.ts [static]",
    ["X1", "X3", "X4", "X6", "X8", "X9", "X10"].every((x) => new RegExp(`AUDIT-CLASS ${x}\\b`).test(aSrcAll + fSrc)), "7 markers",
    ["X1", "X3", "X4", "X6", "X8", "X9", "X10"].filter((x) => !new RegExp(`AUDIT-CLASS ${x}\\b`).test(aSrcAll + fSrc)).join(",") || "-", "MINOR");
  chk("C1.6-S0.10", "the crm facade exposes `activities.*` and `files.*` (re-export only — C0.2)", typeof CRM?.activities?.logActivity === "function" && typeof CRM?.files?.attachFile === "function",
    "exported", `activities=${typeof CRM?.activities} files=${typeof CRM?.files}`, "MINOR");
  {
    const facadeOnly = aSrcAll.length > 0 && !/["']@\/lib\/modules\/(account|party|member|inventory|approval)\/[^"']+["']/.test(aSrcAll + fSrc);
    chk("C1.6-S0.11", "cross-module calls through facades (party/member/account/approval via @/lib/modules/<m>) · kanban reached through its links door only — no deep import into other modules' internals [static]",
      facadeOnly, "facades", cut((aSrcAll + fSrc).match(/["'][^"']*modules\/(account|party|member|inventory|approval)\/[^"']*["']/g)?.join(" ") ?? "-"), "MINOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — tenant A (crmA · crmA2 · kanbanA) · tenant B (crmB · kanbanB) · users owner/manager/sales/stranger/outsider/nobody/pending
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
  const userMgr = await mkUser("-mgr");
  const userSales = await mkUser("-sales");
  const userSales2 = await mkUser("-sales2");
  const userStranger = await mkUser("-stranger"); // member of tenant B only
  const userNobody = await mkUser("-nobody"); // no membership anywhere
  const userPending = await mkUser("-pending"); // invited to tenant A, never accepted
  const member = (userId: string, tenantId: string, role: string, permissions: Record<string, unknown> = {}, accepted = true) =>
    P.membership.create({ data: { userId, tenantId, role, unitAccess: ["*"], permissions, acceptedAt: accepted ? new Date() : null } });
  await member(userA, tidA, "OWNER");
  await member(userA, tidB, "OWNER");
  await member(userMgr, tidA, "MANAGER");
  await member(userSales, tidA, "STAFF", { "crm.*": true });
  await member(userSales2, tidA, "STAFF", { "crm.*": true });
  await member(userStranger, tidB, "STAFF", { "crm.*": true });
  await member(userPending, tidA, "STAFF", { "crm.*": true }, false);
  const mk = async (tid: string, type: string, label: string) => (await sysSvc.createSystem(tid, type, `${label} ${TAG}`)).id as string;
  const crmA = await mk(tidA, "CRM", "CRM");
  const crmA2 = await mk(tidA, "CRM", "CRM สอง");
  const memA = await mk(tidA, "MEMBER", "สมาชิก");
  const kanA = await mk(tidA, "KANBAN", "บอร์ดงาน");
  const crmB = await mk(tidB, "CRM", "CRM-B");
  const kanB = await mk(tidB, "KANBAN", "บอร์ดงาน-B");
  // v2 on (R-E.14: bridges/consumers skip uiVersion 1) · crmA carries a CUSTOM outcome registry, crmA2 relies on the defaults
  const CUSTOM_CALL = ["นัดสาธิต", "โทรกลับภายหลัง"];
  await P.appSystem.update({ where: { id: crmA }, data: { settings: { crm: { uiVersion: 2, bridgesEnabled: true, activityOutcomes: { CALL: CUSTOM_CALL, MEETING: ["สำเร็จ", "เลื่อน"] } } } } });
  await P.appSystem.update({ where: { id: crmA2 }, data: { settings: { crm: { uiVersion: 2, bridgesEnabled: true } } } });
  await P.appSystem.update({ where: { id: crmB }, data: { settings: { crm: { uiVersion: 2, bridgesEnabled: true } } } });
  const owner = ownerActor(userA);
  const mgr = managerActor(userMgr);
  const sales = staffActor(userSales);
  const sales2 = staffActor(userSales2);
  const cA = { tenantId: tidA, systemId: crmA, actorUserId: userA };
  const cA2 = { tenantId: tidA, systemId: crmA2, actorUserId: userA };
  const cB = { tenantId: tidB, systemId: crmB, actorUserId: userA };
  const cSales = { ...cA, actorUserId: userSales };
  const cSales2 = { ...cA, actorUserId: userSales2 };
  const cMgr = { ...cA, actorUserId: userMgr };

  type StDef = { name: string; kind: string; probability: number };
  const mkPipe = async (tid: string, sys: string, name: string, stages: StDef[]) => {
    const p = (await P.crmPipeline.create({
      data: { tenantId: tid, systemId: sys, name: `${name} ${TAG}`, stages: { create: stages.map((s, i) => ({ tenantId: tid, systemId: sys, sortOrder: i, ...s })) } },
      include: { stages: true },
    })) as Any;
    return { id: p.id as string, st: [...(p.stages as Any[])].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.id as string) };
  };
  const STD: StDef[] = [
    { name: "ผู้สนใจใหม่", kind: "OPEN", probability: 10 }, { name: "เจรจา", kind: "OPEN", probability: 50 }, { name: "ส่งข้อเสนอ", kind: "OPEN", probability: 70 },
    { name: "ชนะ", kind: "WON", probability: 100 }, { name: "แพ้", kind: "LOST", probability: 0 },
  ];
  const pA = await mkPipe(tidA, crmA, "ขาย", STD);
  const pA2 = await mkPipe(tidA, crmA2, "ขายสอง", STD);
  const pB = await mkPipe(tidB, crmB, "ขายร้านอื่น", STD);

  const mkParty = async (tid: string, name: string, kind: string, extra: Record<string, Any> = {}) =>
    (await P.party.create({ data: { tenantId: tid, name, kind, ...extra } })).id as string;
  const rawContact = async (tid: string, sys: string, name: string, extra: Record<string, Any> = {}) => {
    const phone = (extra.phone as string | undefined) ?? phoneOf();
    const partyId = await mkParty(tid, name, "PERSON", { phone });
    return (await P.crmContact.create({ data: { tenantId: tid, systemId: sys, name, firstName: name, phone, partyId, ...extra } })).id as string;
  };
  const fxCompany = async (c: Any, name: string): Promise<string> => {
    const r = await call(CO.createCompany, c, owner, { name });
    const id = String(r.v?.company?.id ?? r.v?.id ?? "");
    if (id && (await P.crmCompany.findFirst({ where: { id } }))) return id;
    const partyId = await mkParty(c.tenantId, name, "COMPANY");
    return (await P.crmCompany.create({ data: { tenantId: c.tenantId, systemId: c.systemId, name, partyId } })).id as string;
  };
  const link = async (c: Any, companyId: string, contactId: string, isPrimary = true) => {
    const r = await call(CO.addContact, c, owner, companyId, { contactId, isPrimary });
    if (!r.ok && !(await P.crmCompanyContact.findFirst({ where: { companyId, contactId, endedAt: null } }))) {
      await P.crmCompanyContact.create({ data: { tenantId: c.tenantId, companyId, contactId, role: "OTHER", isPrimary } });
      if (isPrimary) await P.crmContact.update({ where: { id: contactId }, data: { companyId } });
    }
  };
  /** deal fixture: deals.createDeal when C1.5 exists; raw row + first history row otherwise (a broken create never cascades) */
  const fxDeal = async (c: Any, input: Record<string, Any>): Promise<string> => {
    if (HAS_DEALS) {
      const r = await call(D.createDeal, c, owner, input);
      const id = did(r.v);
      if (id !== NONE && (await P.crmDeal.findFirst({ where: { id } }))) return id;
    }
    const pipe = await P.crmPipeline.findFirst({ where: { id: input.pipelineId }, include: { stages: { orderBy: { sortOrder: "asc" } } } });
    const stageId = pipe?.stages?.find((s: Any) => s.kind === "OPEN")?.id;
    const d = await P.crmDeal.create({ data: {
      tenantId: c.tenantId, systemId: c.systemId, contactId: input.contactId, companyId: input.companyId ?? null, pipelineId: input.pipelineId, stageId,
      title: input.title, valueSatang: input.valueSatang ?? 0, kind: "OPEN", ownerUserId: input.ownerUserId ?? owner.userId,
    } });
    await P.crmDealStageHistory.create({ data: { tenantId: c.tenantId, dealId: d.id, toStageId: stageId } });
    return d.id as string;
  };
  const dealRow = (id: string) => P.crmDeal.findFirst({ where: { id: id || NONE } }) as Promise<Any>;
  const actRow = (id: string) => P.crmActivity.findFirst({ where: { id: id || NONE } }) as Promise<Any>;
  const evOf = async (type: string, id: string) =>
    (await P.outboxEvent.findMany({ where: { tenantId: { in: TENANTS }, type, idempotencyKey: { startsWith: `${type}#${id}` } }, orderBy: { createdAt: "asc" } })) as Any[];
  const evtOf = (row: Any) => ({ id: row.id, tenantId: row.tenantId, type: row.type, payload: row.payload, systemId: row.systemId, unitId: row.unitId });
  const consume = async (row: Any) => call(CONS?.[row.type], evtOf(row));
  const log = (input: Record<string, Any>, c: Any = cA, who: Any = owner) => call(fns.log, c, who, input);
  /** activity fixture that does NOT depend on logActivity (list / calendar / race / X1 fixtures) */
  const rawAct = async (c: Any, data: Record<string, Any>) =>
    (await P.crmActivity.create({ data: { tenantId: c.tenantId, systemId: c.systemId, type: "TASK", ownerUserId: userA, ...data } })).id as string;

  // main graph of crmA: company coMain ← contact kMain (primary, PII) ← deal dMain (owner = sales) · custom record rec
  const coMain = await fxCompany(cA, `บริษัทหลัก ${rand}`);
  const kMain = await rawContact(tidA, crmA, SENT_NAME, { phone: SENT_PHONE, email: SENT_EMAIL });
  await link(cA, coMain, kMain);
  const dMain = await fxDeal(cA, { pipelineId: pA.id, title: `ดีลหลัก ${rand}`, contactId: kMain, companyId: coMain, valueSatang: 100_000, ownerUserId: userSales });
  if ((await dealRow(dMain))?.ownerUserId !== userSales) await P.crmDeal.update({ where: { id: dMain }, data: { ownerUserId: userSales } });
  const obj = await P.customObject.create({ data: { tenantId: tidA, systemId: crmA, key: `car${rand}`, label: "รถ", labelPlural: "รถ", parentType: "CONTACT", titleFieldKey: "plate" } });
  const rec = (await P.customRecord.create({ data: { tenantId: tidA, systemId: crmA, objectId: obj.id, parentType: "CONTACT", parentId: kMain, title: `ทะเบียน กข ${rand}` } })).id as string;
  // foreign graphs: crmA2 (same shop, other CRM system) · crmB (other shop)
  const coA2 = await fxCompany(cA2, `บริษัทระบบสอง ${rand}`);
  const kA2 = await rawContact(tidA, crmA2, `ผู้ติดต่อระบบสอง ${rand}`);
  await link(cA2, coA2, kA2);
  const dA2 = await fxDeal(cA2, { pipelineId: pA2.id, title: `ดีลระบบสอง ${rand}`, contactId: kA2, companyId: coA2 });
  const coB = await fxCompany(cB, `บริษัทร้านอื่น ${rand}`);
  const kB = await rawContact(tidB, crmB, `ผู้ติดต่อร้านอื่น ${rand}`);
  await link(cB, coB, kB);
  const dB = await fxDeal(cB, { pipelineId: pB.id, title: `ดีลร้านอื่นลับ ${rand}`, contactId: kB, companyId: coB });
  const objB = await P.customObject.create({ data: { tenantId: tidB, systemId: crmB, key: `car${rand}`, label: "รถ", labelPlural: "รถ", parentType: "CONTACT", titleFieldKey: "plate" } });
  const recB = (await P.customRecord.create({ data: { tenantId: tidB, systemId: crmB, objectId: objB.id, parentType: "CONTACT", parentId: kB, title: `ทะเบียนร้านอื่น ${rand}` } })).id as string;
  // kanban boards (A: done column set) · B: a foreign board
  const mkBoard = async (tid: string, sys: string, name: string) => {
    let b: Any = null;
    if (typeof KS.createBoard === "function") b = await KS.createBoard({ tenantId: tid, systemId: sys, name: `${name} ${TAG}`, createdById: userA }).catch(() => null);
    if (!b) {
      b = await P.kanbanBoard.create({ data: { tenantId: tid, systemId: sys, name: `${name} ${TAG}`, createdById: userA } });
      for (const [i, n] of ["รอทำ", "กำลังทำ", "เสร็จ"].entries()) await P.kanbanColumn.create({ data: { tenantId: tid, systemId: sys, boardId: b.id, name: n, sortOrder: i, position: `a${i}` } });
    }
    const cols = (await P.kanbanColumn.findMany({ where: { boardId: b.id }, orderBy: { sortOrder: "asc" } })) as Any[];
    await P.kanbanColumn.update({ where: { id: cols[cols.length - 1].id }, data: { isDoneColumn: true } });
    return b.id as string;
  };
  const boardA = await mkBoard(tidA, kanA, "งานขาย");
  const boardB = await mkBoard(tidB, kanB, "งานร้านอื่น");
  const kctxA = { tenantId: tidA, systemId: kanA, actorUserId: null };
  console.log(`[setup] tenant A ${tidA} · tenant B ${tidB} · crmA ${crmA} · crmA2 ${crmA2} · memA ${memA} · kanbanA ${kanA} · deals.ts ${HAS_DEALS ? "present" : "ABSENT"}\n`);

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — log every type · call/meeting fields · outcome registry (5)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S1 · log every type + outcome registry ──");
  const TYPES = ["CALL", "MEETING", "EMAIL", "LINE", "TASK", "NOTE", "CHAT", "SMS", "WHATSAPP", "VISIT", "WEB", "PORTAL"];
  const byType: Record<string, string> = {};
  {
    const res = await watch("log 12 types", async () => {
      const out: Res[] = [];
      for (const t of TYPES) out.push(await log({ type: t, title: `กิจกรรม ${t} ${rand}`, dealId: dMain, ...(t === "TASK" ? { dueAt: new Date(Date.now() + 3 * DAY_MS) } : {}) }));
      return out;
    });
    TYPES.forEach((t, i) => { byType[t] = aid(res[i].v); });
    const rows = (await P.crmActivity.findMany({ where: { id: { in: Object.values(byType) } } })) as Any[];
    const keysOk: string[] = [];
    for (const t of TYPES) {
      const ev = await evOf("crm.activity.logged", byType[t]);
      if (ev.length === 1 && new RegExp(`^crm\\.activity\\.logged#${byType[t]}#[^#\\s]+$`).test(ev[0].idempotencyKey)) keysOk.push(t);
    }
    const good = rows.filter((r) => r.tenantId === tidA && r.systemId === crmA && r.ownerUserId === userA && r.dealId === dMain && r.source === "MANUAL");
    chk("C1.6-S1.1", "logActivity for each of the 12 CrmActivityType values ⇒ 12 rows of this system (owner = actor, source MANUAL, linked to the deal) · each emits exactly ONE crm.activity.logged with key `crm.activity.logged#<id>#<seq>`",
      res.every((r) => r.ok) && good.length === 12 && new Set(rows.map((r) => r.type)).size === 12 && keysOk.length === 12, "12 rows · 12 events",
      `ok=${res.filter((r) => r.ok).length} rows=${good.length} types=${new Set(rows.map((r) => r.type)).size} keys=${keysOk.length} ${res.find((r) => !r.ok)?.err ?? ""}`);
  }
  {
    const start = new Date(sec(Date.now() - 2 * 3600_000));
    const rc = await log({ type: "CALL", title: `โทรคุยราคา ${rand}`, dealId: dMain, direction: "OUT", channel: "phone", startAt: start, durationSec: 272, outcome: "นัดสาธิต", body: "คุยเรื่องแพ็กเกจ 25 คน" });
    const endM = new Date(start.getTime() + 3600_000);
    const rm = await log({ type: "MEETING", title: `ประชุมที่ออฟฟิศ ${rand}`, dealId: dMain, startAt: start, endAt: endM, location: "ภูเก็ต", attendees: { userIds: [userMgr], contactIds: [kMain] }, outcome: "สำเร็จ" });
    const c = await actRow(aid(rc.v));
    const m = await actRow(aid(rm.v));
    chk("C1.6-S1.2", "CALL keeps direction OUT · channel · startAt · durationSec 272 · outcome · body · MEETING keeps startAt/endAt · location · attendees {userIds, contactIds} · outcome",
      rc.ok && rm.ok && c?.direction === "OUT" && c?.channel === "phone" && c?.startAt?.getTime() === start.getTime() && c?.durationSec === 272 && c?.outcome === "นัดสาธิต" &&
        c?.body === "คุยเรื่องแพ็กเกจ 25 คน" && m?.endAt?.getTime() === endM.getTime() && m?.location === "ภูเก็ต" && j(m?.attendees?.userIds) === j([userMgr]) && m?.outcome === "สำเร็จ",
      "fields stored", `${rc.err}${rm.err} call=${cut(j({ d: c?.direction, dur: c?.durationSec, o: c?.outcome }), 120)} meet=${cut(j({ l: m?.location, a: m?.attendees }), 120)}`);
  }
  {
    const before = await P.crmActivity.count({ where: { tenantId: tidA } });
    const wrongType = await log({ type: "CALL", title: `ผลผิดชนิด ${rand}`, dealId: dMain, outcome: "เลื่อน" });
    const unknown = await log({ type: "CALL", title: `ผลไม่รู้จัก ${rand}`, dealId: dMain, outcome: "ไม่มีในรายการ" });
    const noList = await log({ type: "NOTE", title: `โน้ตมีผล ${rand}`, dealId: dMain, outcome: "สนใจ" });
    const after = await P.crmActivity.count({ where: { tenantId: tidA } });
    chk("C1.6-S1.3", "outcome of ANOTHER type (CALL + 'เลื่อน' of MEETING) · an outcome outside the registry · an outcome on a type without a registry (NOTE) ⇒ VALIDATION each with a Thai message · no row",
      isValidation(wrongType) && isValidation(unknown) && isValidation(noList) && thai(wrongType.msg) && after === before, "VALIDATION ×3",
      `${wrongType.err || "accepted"} | ${unknown.err || "accepted"} | ${noList.err || "accepted"} rows+${after - before}`);
  }
  {
    // the registry is READ from settings.crm.activityOutcomes (crmA custom) with blueprint defaults as fallback (crmA2)
    const custom = await log({ type: "CALL", title: `ผลตามตั้งค่า ${rand}`, dealId: dMain, outcome: "โทรกลับภายหลัง" });
    const defaultInCustom = await log({ type: "CALL", title: `ผลค่าเริ่มต้นในระบบที่ตั้งเอง ${rand}`, dealId: dMain, outcome: "สนใจ" });
    const defaultSys = await log({ type: "CALL", title: `ผลค่าเริ่มต้น ${rand}`, dealId: dA2, outcome: "สนใจ" }, cA2);
    chk("C1.6-S1.4", "outcome registry comes from settings.crm.activityOutcomes[type]: crmA's custom CALL list accepts 'โทรกลับภายหลัง' and REFUSES the default 'สนใจ' · crmA2 (no setting) accepts the blueprint default 'สนใจ'",
      custom.ok && isValidation(defaultInCustom) && defaultSys.ok, "settings-driven", `${custom.err || "ok"} | ${defaultInCustom.err || "accepted"} | ${defaultSys.err || "ok"}`);
  }
  {
    const before = await P.crmActivity.count({ where: { tenantId: tidA } });
    const none = await log({ type: "CALL", title: `ไม่มีเป้าหมาย ${rand}` });
    const blank = await log({ type: "CALL", title: "   ", dealId: dMain });
    const mid = await P.crmActivity.count({ where: { tenantId: tidA } });
    const byDeal = await log({ type: "EMAIL", title: `อีเมลจากดีล ${rand}`, dealId: dMain });
    const byContact = await log({ type: "LINE", title: `ไลน์จากผู้ติดต่อ ${rand}`, contactId: kMain });
    const byRec = await log({ type: "VISIT", title: `เยี่ยมตามรายการ ${rand}`, customRecordId: rec });
    const rd = await actRow(aid(byDeal.v));
    const rk = await actRow(aid(byContact.v));
    const rr = await actRow(aid(byRec.v));
    chk("C1.6-S1.5", "targets: none / blank title ⇒ VALIDATION, no row · dealId only ⇒ contactId + companyId filled from the deal · contactId only ⇒ companyId = the contact's primary company · a custom record of this system is a valid target",
      isValidation(none) && isValidation(blank) && mid === before && rd?.contactId === kMain && rd?.companyId === coMain && rk?.companyId === coMain && rr?.customRecordId === rec,
      "validated · defaulted", `${none.err || "accepted"} | ${blank.err || "accepted"} rows+${mid - before} deal→(${rd?.contactId === kMain},${rd?.companyId === coMain}) contact→${rk?.companyId === coMain} rec=${rr?.customRecordId === rec} ${byDeal.err}${byContact.err}${byRec.err}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — nextTask (2)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2 · nextTask ──");
  {
    const due = new Date(sec(Date.now() + 2 * DAY_MS));
    const r = await log({ type: "CALL", title: `โทรแล้วนัดต่อ ${rand}`, dealId: dMain, outcome: "นัดสาธิต", nextTask: { type: "TASK", title: `ส่งใบเสนอราคา ${rand}`, dueAt: due } });
    const main = await actRow(aid(r.v));
    const nextId = String(r.v?.nextTask?.id ?? r.v?.nextTaskId ?? "");
    const nt = nextId ? await actRow(nextId) : await P.crmActivity.findFirst({ where: { tenantId: tidA, title: `ส่งใบเสนอราคา ${rand}` } });
    chk("C1.6-S2.1", "nextTask ⇒ a second activity (type TASK, title, dueAt, doneAt null, owner = actor) linked to the SAME deal/contact/company as the logged one, returned to the caller",
      r.ok && !!main && !!nt && nt.id !== main.id && nt.type === "TASK" && nt.dueAt?.getTime() === due.getTime() && nt.doneAt === null && nt.ownerUserId === userA &&
        nt.dealId === dMain && nt.contactId === kMain && nt.companyId === coMain && !!nextId,
      "linked TASK", `${r.err} next=${nextId || "not returned"} ${cut(j({ t: nt?.type, due: nt?.dueAt, deal: nt?.dealId === dMain, co: nt?.companyId === coMain }), 160)}`);
  }
  {
    const before = await P.crmActivity.count({ where: { tenantId: tidA } });
    const a = await log({ type: "CALL", title: `นัดต่อผิด ${rand}`, dealId: dMain, nextTask: { type: "TASK", title: " ", dueAt: new Date(Date.now() + DAY_MS) } });
    const b = await log({ type: "CALL", title: `นัดต่อไม่มีวัน ${rand}`, dealId: dMain, nextTask: { type: "TASK", title: "โทรตาม" } });
    const c = await log({ type: "CALL", title: `นัดต่อวันเพี้ยน ${rand}`, dealId: dMain, nextTask: { type: "TASK", title: "โทรตาม", dueAt: "ไม่ใช่วันที่" } });
    const after = await P.crmActivity.count({ where: { tenantId: tidA } });
    chk("C1.6-S2.2", "an invalid nextTask (blank title · missing dueAt · unparsable dueAt) ⇒ VALIDATION and NOTHING is written — not even the main activity (one transaction)",
      isValidation(a) && isValidation(b) && isValidation(c) && after === before, "VALIDATION ×3 · 0 rows", `${a.err || "accepted"} | ${b.err || "accepted"} | ${c.err || "accepted"} rows+${after - before}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — lastActivityAt of contact / deal / company · stalledAt (3)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3 · lastActivityAt · stalledAt ──");
  const coL = await fxCompany(cA, `บริษัทเวลา ${rand}`);
  const kL = await rawContact(tidA, crmA, `ผู้ติดต่อเวลา ${rand}`);
  await link(cA, coL, kL);
  const dL = await fxDeal(cA, { pipelineId: pA.id, title: `ดีลเวลา ${rand}`, contactId: kL, companyId: coL });
  const lastOf = async () => ({
    k: ((await P.crmContact.findFirst({ where: { id: kL } })) as Any)?.lastActivityAt?.getTime() ?? null,
    d: ((await dealRow(dL)) as Any)?.lastActivityAt?.getTime() ?? null,
    co: ((await P.crmCompany.findFirst({ where: { id: coL } })) as Any)?.lastActivityAt?.getTime() ?? null,
    stalled: ((await dealRow(dL)) as Any)?.stalledAt ?? null,
  });
  const T1 = sec(Date.now() - 3 * DAY_MS);
  {
    await P.crmDeal.update({ where: { id: dL }, data: { stalledAt: new Date(Date.now() - DAY_MS) } });
    const r = await log({ type: "CALL", title: `โทรเวลา ${rand}`, dealId: dL, startAt: new Date(T1) });
    const s = await lastOf();
    chk("C1.6-S3.1", "logActivity on a deal ⇒ the deal's AND its contact's lastActivityAt = the activity time (startAt) exactly",
      r.ok && s.d === T1 && s.k === T1, "= startAt", `${r.err} deal=${s.d} contact=${s.k} want=${T1}`);
    chk("C1.6-S3.2", "C1.3 debt: the COMPANY's lastActivityAt follows too (deal's company) — and a contact-only activity moves its primary company",
      r.ok && s.co === T1 && await (async () => {
        const T2 = sec(Date.now() - 2 * DAY_MS);
        const r2 = await log({ type: "LINE", title: `ไลน์เวลา ${rand}`, contactId: kL, startAt: new Date(T2) });
        const s2 = await lastOf();
        return r2.ok && s2.co === T2 && s2.k === T2 && s2.d === T1;
      })(), "company follows", `company=${s.co} want=${T1}`);
    const sBefore = await lastOf();
    const older = await log({ type: "CALL", title: `โทรย้อนหลัง ${rand}`, dealId: dL, startAt: new Date(T1 - 5 * DAY_MS) });
    const sOlder = await lastOf();
    const future = await log({ type: "CALL", title: `โทรอนาคต ${rand}`, dealId: dL, startAt: new Date(Date.now() + 5 * DAY_MS) });
    const sFut = await lastOf();
    const now = Date.now();
    chk("C1.6-S3.3", "the deal's stalledAt is cleared · an OLDER activity never moves lastActivityAt backwards (contact/deal/company) · a future startAt never pushes it into the future (clamped to now)",
      s.stalled === null && older.ok && sOlder.d === sBefore.d && sOlder.k === sBefore.k && sOlder.co === sBefore.co && future.ok &&
        sFut.d !== null && sFut.d <= now + 1000 && sFut.co !== null && sFut.co <= now + 1000,
      "cleared · monotone · ≤ now", `stalled=${j(s.stalled)} older(${sOlder.d === sBefore.d},${sOlder.co === sBefore.co}) future deal=${sFut.d} co=${sFut.co} now=${now} ${older.err}${future.err}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — listActivities status 5 modes (Thai time) (5)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S4 · list status modes ──");
  const coS = await fxCompany(cA, `บริษัทรายการ ${rand}`);
  const kS = await rawContact(tidA, crmA, `ผู้ติดต่อรายการ ${rand}`);
  await link(cA, coS, kS);
  const dS = await fxDeal(cA, { pipelineId: pA.id, title: `ดีลรายการ ${rand}`, contactId: kS, companyId: coS });
  const NOW = Date.now();
  const today0 = thaiDayStart(NOW);
  const L = {
    overdue: await rawAct(cA, { dealId: dS, contactId: kS, companyId: coS, title: `เลยกำหนด ${rand}`, dueAt: new Date(NOW - 2 * DAY_MS) }),
    todayEarly: await rawAct(cA, { dealId: dS, contactId: kS, companyId: coS, title: `วันนี้ ${rand}`, dueAt: new Date(today0 + 60_000) }),
    week: await rawAct(cA, { dealId: dS, contactId: kS, companyId: coS, title: `สัปดาห์นี้ ${rand}`, dueAt: new Date(today0 + 3 * DAY_MS + 12 * 3600_000) }),
    far: await rawAct(cA, { dealId: dS, contactId: kS, companyId: coS, title: `อีกนาน ${rand}`, dueAt: new Date(today0 + 20 * DAY_MS) }),
    done: await rawAct(cA, { dealId: dS, contactId: kS, companyId: coS, title: `เสร็จแล้ว ${rand}`, dueAt: new Date(NOW - DAY_MS), doneAt: new Date(NOW - 3600_000), completedById: userA }),
    salesOwn: await rawAct(cA, { dealId: dS, contactId: kS, companyId: coS, title: `ของพนักงาน ${rand}`, dueAt: new Date(today0 + 2 * DAY_MS), ownerUserId: userSales }),
  };
  const ls = async (status: string) => { const r = await call(fns.list, cA, owner, { status, dealId: dS, pageSize: 100 }); return { r, ids: new Set(idsOf(r.v)) }; };
  const has = (s: Set<string>, ...k: (keyof typeof L)[]) => k.every((x) => s.has(L[x]));
  const hasNone = (s: Set<string>, ...k: (keyof typeof L)[]) => k.every((x) => !s.has(L[x]));
  {
    const x = await ls("pending");
    chk("C1.6-S4.1", "status pending ⇒ every not-done activity of the deal (overdue · today · week · far · the STAFF's) and never the done one",
      x.r.ok && has(x.ids, "overdue", "todayEarly", "week", "far", "salesOwn") && hasNone(x.ids, "done"), "5 · no done", `${x.r.err} ${[...x.ids].length} ids`);
  }
  {
    const x = await ls("today");
    chk("C1.6-S4.2", "status today (Thai calendar day of now, +07:00) ⇒ only the item due today 00:01 Thai — not −2 days, not +3/+20 days, not done",
      x.r.ok && has(x.ids, "todayEarly") && hasNone(x.ids, "overdue", "week", "far", "done"), "today only", `${x.r.err} got=${cut(j(Object.entries(L).filter(([, v]) => x.ids.has(v)).map(([k]) => k)))}`);
  }
  {
    const x = await ls("week");
    chk("C1.6-S4.3", "status week ([Thai today 00:00, +7 days)) ⇒ today + day+3 (+ the STAFF's day+2) — not overdue (−2 d), not day+20, not done",
      x.r.ok && has(x.ids, "todayEarly", "week", "salesOwn") && hasNone(x.ids, "overdue", "far", "done"), "week window", `${x.r.err} got=${cut(j(Object.entries(L).filter(([, v]) => x.ids.has(v)).map(([k]) => k)))}`);
  }
  {
    const x = await ls("overdue");
    chk("C1.6-S4.4", "status overdue (dueAt < now, not done) ⇒ −2 days and today 00:01 — not future items, not the done one",
      x.r.ok && has(x.ids, "overdue", "todayEarly") && hasNone(x.ids, "week", "far", "done", "salesOwn"), "overdue", `${x.r.err} got=${cut(j(Object.entries(L).filter(([, v]) => x.ids.has(v)).map(([k]) => k)))}`);
  }
  {
    const x = await ls("done");
    const mine = await call(fns.list, cSales, sales, { scope: "mine", status: "pending", dealId: dS, pageSize: 100 });
    const mineIds = new Set(idsOf(mine.v));
    chk("C1.6-S4.5", "status done ⇒ only the done item · scope mine (as the STAFF) ⇒ only the STAFF's own item",
      x.r.ok && has(x.ids, "done") && x.ids.size === 1 && mine.ok && mineIds.has(L.salesOwn) && mineIds.size === 1, "done · mine",
      `${x.r.err}${mine.err} done=${x.ids.size} mine=${cut(j([...mineIds].map((i) => Object.entries(L).find(([, v]) => v === i)?.[0] ?? i)))}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 — kanban card ↔ deal/activity · completed ⇒ activity done · deal 360 cards (3)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S5 · kanban card ↔ deal ──");
  const taskAct = await rawAct(cA, { dealId: dMain, contactId: kMain, companyId: coMain, title: `งานบอร์ด ${rand}`, dueAt: new Date(NOW + DAY_MS) });
  let cardId = "";
  {
    const r1 = await call(fns.card, cA, owner, { activityId: taskAct, boardId: boardA });
    const r2 = await call(fns.card, cA, owner, { activityId: taskAct, boardId: boardA });
    cardId = String(r1.v?.cardId ?? r1.v?.id ?? "");
    const card = cardId ? await P.kanbanCard.findFirst({ where: { id: cardId } }) : null;
    const links = cardId ? ((await P.kanbanCardLink.findMany({ where: { cardId, removedAt: null } })) as Any[]) : [];
    const act = await actRow(taskAct);
    const lt = (t: string, id: string) => links.some((l) => l.linkType === t && l.linkId === id);
    chk("C1.6-S5.1", "openTaskCard(activity of the deal) ⇒ ONE card on the board (twice = same card, created:false) with links DEAL + CRM_CONTACT + COMPANY · activity.kanbanCardId = the card · sourceKey names the activity",
      r1.ok && r2.ok && !!card && String(r2.v?.cardId ?? r2.v?.id) === cardId && r2.v?.created !== true && card.boardId === boardA && String(card.sourceKey ?? "").includes(taskAct) &&
        lt("DEAL", dMain) && lt("CRM_CONTACT", kMain) && lt("COMPANY", coMain) && act?.kanbanCardId === cardId,
      "1 card · 3 links", `${r1.err}${r2.err} card=${!!card} same=${String(r2.v?.cardId ?? r2.v?.id) === cardId} links=${links.map((l) => l.linkType).join(",")} kanbanCardId=${act?.kanbanCardId === cardId}`);
  }
  let completedEv: Any = null;
  {
    let via = "completeCard";
    const done = await call(KT.completeCard, { tenantId: tidA, systemId: kanA, actorUserId: userA }, cardId || NONE);
    completedEv = cardId ? await P.outboxEvent.findFirst({ where: { tenantId: tidA, type: "kanban.card.completed", idempotencyKey: { startsWith: `kanban.card.completed#${cardId}#` } } }) : null;
    if (!completedEv && cardId) {
      via = `synthetic (${done.err || j(done.v)})`;
      const at = new Date();
      await P.kanbanCard.update({ where: { id: cardId }, data: { completedAt: at } }).catch(() => 0);
      completedEv = { id: `${TAG}-synthetic`, tenantId: tidA, type: "kanban.card.completed", payload: { cardId, boardId: boardA, completedAt: at.toISOString(), actorUserId: userA }, systemId: kanA, unitId: null };
    }
    const r = completedEv ? await consume(completedEv) : ({ ok: false, err: "no card" } as Res);
    const act = await actRow(taskAct);
    const ev = await evOf("crm.activity.completed", taskAct);
    chk("C1.6-S5.2", `the card is completed on the board (${via}) ⇒ the kanban.card.completed consumer completes the linked activity: doneAt set · exactly ONE crm.activity.completed`,
      r.ok && !!act?.doneAt && ev.length === 1, "done · 1 event", `${r.err} doneAt=${j(act?.doneAt)} events=${ev.length}`);
  }
  if (!HAS_DEALS) skip("C1.6-S5.3", "deal 360 lists the deal's kanban cards", "deals.ts (C1.5) not built — getDeal360 lives there");
  else {
    const g = await call(D.getDeal360, cA, owner, dMain);
    const cards = (g.v?.kanbanCards ?? g.v?.cards ?? g.v?.taskCards ?? []) as Any[];
    chk("C1.6-S5.3", "deals.getDeal360 lists the deal's kanban cards (`kanbanCards[]`) — the card opened from its activity is there",
      g.ok && cards.some((c) => String(c?.cardId ?? c?.id) === cardId), "card listed", `${g.err} cards=${cards.length}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S6 — pages (static) (2)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S6 · pages ──");
  {
    const actPage = read(`${CRM_PAGES}/activities/page.tsx`);
    const calPage = read(`${CRM_PAGES}/calendar/page.tsx`);
    const calAll = walk(`${CRM_PAGES}/calendar`).map(read).join("\n") + walk("src/components/crm/activity").map(read).join("\n");
    const nav = read(NAV_FILE);
    const v2 = /from\s+["']@\/lib\/modules\/crm\/activities(-shared)?["']|from\s+["']@\/components\/crm\/activity/.test(actPage);
    const views = ["day", "week", "month"].every((v) => new RegExp(`["'\`]${v}["'\`]`).test(calAll));
    const navOk = /path:\s*["']\/crm\/activities["'][^}]*status:\s*["']ready["']/.test(nav) && /path:\s*["']\/crm\/calendar["'][^}]*status:\s*["']ready["']/.test(nav);
    const guard = /notFound\s*\(/.test(calPage) && /type:\s*["']CRM["']/.test(calPage);
    chk("C1.6-S6.1", "pages: crm/activities/page.tsx is v2 (reads crm/activities or renders components/crm/activity) · crm/calendar/page.tsx exists with the 404 guard (type CRM → notFound) and day | week | month views · both \"ready\" in crm/nav.ts [static]",
      v2 && calPage.length > 0 && views && navOk && guard, "2 pages", `v2=${v2} cal=${calPage.length > 0} views=${views} nav=${navOk} guard=${guard}`, "MAJOR");
  }
  {
    const comp = walk("src/components/crm/activity").concat(walk("src/components/crm/files"));
    const imports = (p: string) => { const s = read(p); return /components\/crm\/files/.test(s) && /components\/crm\/activity/.test(s); };
    const contactP = `${CRM_PAGES}/contacts/[contactId]/page.tsx`;
    const companyP = `${CRM_PAGES}/companies/[companyId]/page.tsx`;
    const dealP = `${CRM_PAGES}/deals/[dealId]/page.tsx`;
    const clientBad = comp.filter((f) => { const s = read(f); return /^\s*["']use client["']/m.test(s) && /from\s+["'](@\/lib\/core\/db|@prisma\/client|@\/lib\/modules\/crm\/(activities|files|companies|contacts|deals)|@\/lib\/storage\/service)["']/.test(s); });
    const noTestid = comp.filter((f) => { const s = read(f); return /<(button|input|select|textarea)\b/.test(s) && !/data-testid/.test(s); });
    const dealOk = HAS_DEALS ? imports(dealP) : true;
    chk("C1.6-S6.2", `block components exist under src/components/crm/{activity,files} · the contact / company${HAS_DEALS ? " / deal" : ""} 360 pages render both blocks · 'use client' blocks import no prisma-reaching module · every interactive element carries data-testid [static]`,
      comp.length >= 2 && imports(contactP) && imports(companyP) && dealOk && clientBad.length === 0 && noTestid.length === 0, "blocks wired",
      `components=${comp.length} contact=${imports(contactP)} company=${imports(companyP)} deal=${HAS_DEALS ? dealOk : "n/a (C1.5 absent)"} clientBad=${clientBad.join(",") || "-"} noTestid=${noTestid.join(",") || "-"}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S7 — notes · pin · mention (C19)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S7 · notes · pin · mention ──");
  const n1 = aid((await log({ type: "NOTE", title: `โน้ตแรก ${rand}`, body: "จดไว้ก่อน", dealId: dMain })).v);
  await new Promise<void>((r) => setTimeout(r, 30));
  const n2 = aid((await log({ type: "NOTE", title: `โน้ตปัก ${rand}`, body: "สำคัญมาก", dealId: dMain, pinned: true })).v);
  await new Promise<void>((r) => setTimeout(r, 30));
  const n3 = aid((await log({ type: "NOTE", title: `โน้ตล่าสุด ${rand}`, body: "ล่าสุด", dealId: dMain })).v);
  {
    const r = await call(fns.notes, cA, owner, { dealId: dMain });
    const ids = idsOf(r.v).filter((x) => [n1, n2, n3].includes(x));
    const types = itemsOf(r.v).map((x: Any) => x?.type).filter(Boolean);
    chk("C1.6-S7.1", "NOTE logged with pinned:true is stored pinned · listNotes(deal) returns NOTEs only, the pinned note FIRST, then newest first (n2 · n3 · n1)",
      r.ok && (await actRow(n2))?.pinned === true && j(ids) === j([n2, n3, n1]) && types.every((t: string) => t === "NOTE"), "n2,n3,n1", `${r.err} order=${ids.map((x) => ({ [n1]: "n1", [n2]: "n2", [n3]: "n3" })[x]).join(",")} types=${[...new Set(types)].join(",")}`);
  }
  {
    const p = await call(fns.pin, cA, owner, n1, true);
    const u = await call(fns.pin, cA, owner, n2, false);
    const r = await call(fns.notes, cA, owner, { dealId: dMain });
    const ids = idsOf(r.v).filter((x) => [n1, n2, n3].includes(x));
    const bad = await call(fns.pin, cA, owner, byType.CALL ?? NONE, true);
    chk("C1.6-S7.2", "setPinned: pin n1 + unpin n2 ⇒ order n1 · n3 · n2 · pinning a non-NOTE activity (CALL) ⇒ VALIDATION, row unchanged",
      p.ok && u.ok && j(ids) === j([n1, n3, n2]) && isValidation(bad) && (await actRow(byType.CALL ?? NONE))?.pinned !== true, "re-ordered · refused",
      `${p.err}${u.err} order=${ids.map((x) => ({ [n1]: "n1", [n2]: "n2", [n3]: "n3" })[x]).join(",")} callPin=${bad.err || "accepted"}`);
  }
  const notifCount = (where: Record<string, Any>) => P.appNotification.count({ where }) as Promise<number>;
  let mentionNote = NONE;
  let mentionRes: Res = { ok: false, v: undefined, err: "not run", code: "", status: 0, msg: "" };
  const INVISIBLE = [userStranger, userNobody, userPending];
  const nb = {
    mgr: await notifCount({ tenantId: tidA, recipientUserId: userMgr }),
    sales: await notifCount({ tenantId: tidA, recipientUserId: userSales }),
    inv: await notifCount({ recipientUserId: { in: INVISIBLE } }),
    broadcastA: await notifCount({ tenantId: tidA, recipientUserId: null }),
    broadcastB: await notifCount({ tenantId: tidB, recipientUserId: null }),
  };
  {
    mentionRes = await watch("mention note", () => log({ type: "NOTE", title: `คอมเมนต์ภายใน ${rand}`, body: `@ผู้จัดการ @พนักงาน ${SECRET_NOTE}`, dealId: dMain, mentions: [userMgr, userSales, ...INVISIBLE] }));
    mentionNote = aid(mentionRes.v);
    const na = {
      mgr: await notifCount({ tenantId: tidA, recipientUserId: userMgr }),
      sales: await notifCount({ tenantId: tidA, recipientUserId: userSales }),
    };
    const rows = (await P.appNotification.findMany({ where: { tenantId: tidA, recipientUserId: { in: [userMgr, userSales] } }, orderBy: { createdAt: "desc" }, take: 2 })) as Any[];
    chk("C1.6-S7.3", "internal comment (NOTE + mentions) ⇒ exactly ONE in-app AppNotification (tenant A, recipientUserId set, Thai title) for each mentioned user who CAN see the deal — the MANAGER and the STAFF who owns the deal",
      mentionRes.ok && na.mgr - nb.mgr === 1 && na.sales - nb.sales === 1 && rows.every((x) => thai(x.title)), "+1 each", `${mentionRes.err} mgr+${na.mgr - nb.mgr} sales+${na.sales - nb.sales}`);
  }
  {
    const row = await actRow(mentionNote);
    const kept = (row?.mentions ?? []) as string[];
    const upd = await call(fns.update, cA, owner, mentionNote, { body: `แก้ข้อความ @ผู้จัดการ ${rand}`, mentions: [userMgr, userSales] });
    const after = { mgr: await notifCount({ tenantId: tidA, recipientUserId: userMgr }), sales: await notifCount({ tenantId: tidA, recipientUserId: userSales }) };
    chk("C1.6-S7.4", "mentions[] keeps only the users that were notified (manager + deal-owner STAFF; the invisible three are dropped) · editing the note with the same mentions never re-notifies",
      sameSet(kept, [userMgr, userSales]) && upd.ok && after.mgr - nb.mgr === 1 && after.sales - nb.sales === 1, "kept 2 · no re-notify",
      `kept=${kept.length}(${kept.filter((x) => INVISIBLE.includes(x)).length} invisible) ${upd.err} mgr+${after.mgr - nb.mgr} sales+${after.sales - nb.sales}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S8 — files attach / list / remove (C19 · private path of C0.4)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S8 · files ──");
  const bytes = (n: number, fill = 0x25) => new Uint8Array(n).fill(fill);
  const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, ...bytes(200)]);
  const ENT: [string, string][] = [["CONTACT", kMain], ["COMPANY", coMain], ["DEAL", dMain], ["RECORD", rec]];
  const attached: Record<string, Any> = {};
  {
    const puts0 = putsTotal();
    const res = await watch("attach 4", async () => {
      const out: Res[] = [];
      for (const [t, id] of ENT) out.push(await call(fns.attach, cA, owner, { entityType: t, entityId: id, filename: `สัญญา ${t}.pdf`, contentType: "application/pdf", data: PDF }, storageDeps));
      return out;
    });
    ENT.forEach(([t], i) => { attached[t] = res[i].v; });
    const links = (await P.crmFileLink.findMany({ where: { tenantId: tidA, systemId: crmA } })) as Any[];
    const assets = (await P.fileAsset.findMany({ where: { tenantId: tidA, id: { in: links.map((l) => l.fileId) } } })) as Any[];
    const privOk = assets.length === 4 && assets.every((a) => new RegExp(`^t/${tidA}/private/[0-9a-f]{32,}\\.pdf$`).test(a.path) && String(a.cdnUrl).startsWith("private://"));
    const linkOk = ENT.every(([t, id]) => links.some((l) => l.entityType === t && l.entityId === id && l.mime === "application/pdf" && l.size === PDF.length && l.uploadedById === userA && l.name === `สัญญา ${t}.pdf`));
    chk("C1.6-S8.1", "attachFile on CONTACT · COMPANY · DEAL · RECORD ⇒ 4 CrmFileLink rows (entity, name kept in Thai, size, mime, uploader) · each FileAsset is PRIVATE (path t/<tenant>/private/<random>.pdf · cdnUrl sentinel private://) · stored once each",
      res.every((r) => r.ok) && links.length === 4 && linkOk && privOk && putsTotal() - puts0 === 4 && putPaths().slice(-4).every((p) => p.includes(`t/${tidA}/private/`)),
      "4 private files", `ok=${res.filter((r) => r.ok).length} links=${links.length} linkOk=${linkOk} private=${privOk} puts=${putsTotal() - puts0} ${res.find((r) => !r.ok)?.err ?? ""}`);
  }
  {
    const lists = await Promise.all(ENT.map(([t, id]) => call(fns.files, cA, owner, { entityType: t, entityId: id })));
    const ok = lists.every((l, i) => {
      const it = itemsOf(l.v);
      return l.ok && it.length === 1 && it[0]?.name === `สัญญา ${ENT[i][0]}.pdf` && Number(it[0]?.size) === PDF.length && it[0]?.mime === "application/pdf" && typeof it[0]?.url === "string" && !!it[0]?.id;
    });
    chk("C1.6-S8.2", "listFiles per entity ⇒ exactly its own file with { id, name, size, mime, url } (no cross-entity bleed)",
      ok, "1 each", lists.map((l, i) => `${ENT[i][0]}=${l.ok ? itemsOf(l.v).length : l.err}`).join(" "));
  }
  {
    const lnk = (await P.crmFileLink.findFirst({ where: { tenantId: tidA, entityType: "DEAL", entityId: dMain } })) as Any;
    const asset = lnk ? ((await P.fileAsset.findFirst({ where: { id: lnk.fileId } })) as Any) : null;
    const dels0 = delPaths().length;
    const r = await call(fns.remove, cA, owner, lnk?.id ?? NONE, { confirm: true, reason: "แนบไฟล์ผิดฉบับ" }, storageDeps);
    const list = await call(fns.files, cA, owner, { entityType: "DEAL", entityId: dMain });
    const goneLink = !(await P.crmFileLink.findFirst({ where: { id: lnk?.id ?? NONE } }));
    const goneAsset = !(await P.fileAsset.findFirst({ where: { id: lnk?.fileId ?? NONE } }));
    const delOk = delPaths().slice(dels0).some((p) => !!asset && p.includes(asset.path));
    chk("C1.6-S8.3", "removeFile ⇒ gone from listFiles · CrmFileLink row gone · FileAsset row gone · the stored object is deleted at its REAL private path (storage.deleteFileAsset)",
      r.ok && list.ok && itemsOf(list.v).length === 0 && goneLink && goneAsset && delOk, "removed everywhere", `${r.err} list=${itemsOf(list.v).length} link=${goneLink} asset=${goneAsset} del=${delOk}`);
  }
  {
    const lnk = (await P.crmFileLink.findFirst({ where: { tenantId: tidA, entityType: "CONTACT", entityId: kMain } })) as Any;
    const st = await call(fns.remove, cSales2, sales2, lnk?.id ?? NONE, { confirm: true, reason: "ลองลบของคนอื่น" }, storageDeps);
    const still = !!(await P.crmFileLink.findFirst({ where: { id: lnk?.id ?? NONE } }));
    const up = await call(fns.attach, cSales2, sales2, { entityType: "CONTACT", entityId: kMain, filename: "บันทึกพนักงาน.pdf", contentType: "application/pdf", data: PDF }, storageDeps);
    const own = String(up.v?.id ?? "");
    const selfDel = await call(fns.remove, cSales2, sales2, own || NONE, { confirm: true, reason: "ลบไฟล์ของตัวเอง" }, storageDeps);
    const mgrDel = await call(fns.remove, cMgr, mgr, lnk?.id ?? NONE, { confirm: true, reason: "ผู้จัดการลบไฟล์ซ้ำ" }, storageDeps);
    chk("C1.6-S8.4", "removeFile rights (X9): another STAFF ⇒ FORBIDDEN|NOT_FOUND, file kept · the uploader STAFF removes their own · a MANAGER removes anyone's",
      isForbidden(st) && still && up.ok && selfDel.ok && mgrDel.ok && !(await P.crmFileLink.findFirst({ where: { id: lnk?.id ?? NONE } })),
      "rights enforced", `${st.err || "allowed"} kept=${still} own=${up.err || "ok"}/${selfDel.err || "ok"} mgr=${mgrDel.err || "ok"}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S9 — brief extras
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S9 · brief extras ──");
  {
    const autoL = read("src/lib/automation/labels.ts");
    const hookL = read("src/lib/webhooks/labels.ts");
    const decl = (t: string) => (autoL.match(new RegExp(`["']${t.replace(/\./g, "\\.")}["']`, "g")) ?? []).length + (hookL.match(new RegExp(`["']${t.replace(/\./g, "\\.")}["']`, "g")) ?? []).length;
    const EV = ["crm.activity.logged", "crm.activity.completed"];
    chk("C1.6-S9.1", "events crm.activity.logged / crm.activity.completed registered in the 3 registries: a consumer in outbox-consumers · declared exactly ONCE across automation/labels.ts + webhooks/labels.ts",
      EV.every((t) => typeof CONS?.[t] === "function" && decl(t) === 1), "3 registries", EV.map((t) => `${t}: consumer=${typeof CONS?.[t]} declared=${decl(t)}`).join(" · "));
  }
  {
    const T = `ในธุรกรรม ${rand}`;
    const before = (await dealRow(dL))?.lastActivityAt?.getTime() ?? null;
    let r: Res;
    try { await mkTrigger(`NEW.type = 'crm.activity.logged'`); r = await log({ type: "CALL", title: T, dealId: dL }); } finally { await dropTriggers(); }
    const row = await P.crmActivity.findFirst({ where: { tenantId: tidA, title: T } });
    const after = (await dealRow(dL))?.lastActivityAt?.getTime() ?? null;
    const tc = await rawAct(cA, { dealId: dL, title: `ปิดในธุรกรรม ${rand}` });
    let c: Res;
    try { await mkTrigger(`NEW.type = 'crm.activity.completed'`); c = await call(fns.complete, cA, owner, tc); } finally { await dropTriggers(); }
    chk("C1.6-S9.2", "events are emitted INSIDE the write transaction: when the OutboxEvent insert fails, logActivity leaves no activity and no lastActivityAt change · completeActivity leaves doneAt null",
      typeof fns.log === "function" && typeof fns.complete === "function" && !r.ok && r.code !== "MISSING_FUNCTION" && !c.ok && c.code !== "MISSING_FUNCTION" &&
        !row && after === before && !c.ok && (await actRow(tc))?.doneAt === null && (await log({ type: "CALL", title: `${T} ควบคุม`, dealId: dL })).ok, "rolled back (control log commits)", `log=${r.ok ? "committed" : "failed"} row=${!!row} last ${before}→${after} complete=${c.ok ? "committed" : "failed"} doneAt=${j((await actRow(tc))?.doneAt)}`);
  }
  {
    const t = await rawAct(cA, { dealId: dMain, title: `ปิดงาน ${rand}`, dueAt: new Date(NOW + DAY_MS) });
    const c1 = await call(fns.complete, cSales, sales, t, { outcome: undefined });
    const row1 = await actRow(t);
    const c2 = await call(fns.complete, cA, owner, t);
    const row2 = await actRow(t);
    const ev = await evOf("crm.activity.completed", t);
    const keyOk = ev.length === 1 && new RegExp(`^crm\\.activity\\.completed#${t}#[^#\\s]+$`).test(ev[0].idempotencyKey);
    chk("C1.6-S9.3", "completeActivity ⇒ doneAt + completedById = the actor · completing again ⇒ no-op (doneAt unchanged) · exactly ONE crm.activity.completed with key `crm.activity.completed#<id>#<seq>`",
      c1.ok && !!row1?.doneAt && row1?.completedById === userSales && (c2.ok || isRefused(c2)) && row2?.doneAt?.getTime() === row1?.doneAt?.getTime() && keyOk,
      "once", `${c1.err} by=${row1?.completedById === userSales} again=${c2.err || "ok"} same=${row2?.doneAt?.getTime() === row1?.doneAt?.getTime()} events=${ev.length} key=${keyOk}`);
  }
  {
    const t = await rawAct(cA, { dealId: dMain, type: "CALL", title: `เลื่อนนัด ${rand}`, dueAt: new Date(NOW + DAY_MS) });
    const nd = new Date(sec(NOW + 4 * DAY_MS));
    const rs = await call(fns.reschedule, cA, owner, t, { dueAt: nd });
    const up = await call(fns.update, cA, owner, t, { title: `เลื่อนนัดแล้ว ${rand}`, outcome: "โทรกลับภายหลัง" });
    const badOut = await call(fns.update, cA, owner, t, { outcome: "เลื่อน" });
    const badBody = await call(fns.update, cA, owner, t, { body: "ก".repeat(8001) });
    const row = await actRow(t);
    chk("C1.6-S9.4", "rescheduleActivity moves dueAt · updateActivity changes title/outcome with the SAME validation as log (MEETING outcome on a CALL ⇒ VALIDATION · body 8,001 ⇒ VALIDATION), row keeps the valid values",
      rs.ok && up.ok && isValidation(badOut) && isValidation(badBody) && row?.dueAt?.getTime() === nd.getTime() && row?.title === `เลื่อนนัดแล้ว ${rand}` && row?.outcome === "โทรกลับภายหลัง" && (row?.body ?? "").length < 8001,
      "updated · validated", `${rs.err}${up.err} out=${badOut.err || "accepted"} body=${badBody.err || "accepted"} due=${row?.dueAt?.getTime() === nd.getTime()}`, "MAJOR");
  }
  {
    const from = new Date(today0 + 10 * DAY_MS);
    const to = new Date(today0 + 17 * DAY_MS);
    const inA = await rawAct(cA, { type: "MEETING", dealId: dS, title: `ปฏิทินใน ${rand}`, startAt: new Date(today0 + 11 * DAY_MS + 10 * 3600_000), endAt: new Date(today0 + 11 * DAY_MS + 11 * 3600_000) });
    const inDue = await rawAct(cA, { type: "TASK", dealId: dS, title: `ปฏิทินกำหนด ${rand}`, dueAt: new Date(today0 + 12 * DAY_MS), ownerUserId: userSales });
    const edge = await rawAct(cA, { type: "CALL", dealId: dS, title: `ปฏิทินขอบ ${rand}`, startAt: to });
    const before = await rawAct(cA, { type: "CALL", dealId: dS, title: `ปฏิทินก่อน ${rand}`, startAt: new Date(from.getTime() - 1000) });
    const foreign = await rawAct(cA2, { type: "CALL", dealId: dA2, title: `ปฏิทินระบบอื่น ${rand}`, startAt: new Date(today0 + 11 * DAY_MS) });
    const all = await call(fns.cal, cA, owner, { from, to });
    const mine = await call(fns.cal, cSales, sales, { from, to, mine: true });
    const ids = new Set(idsOf(all.v));
    const mids = new Set(idsOf(mine.v));
    chk("C1.6-S9.5", "calendar({from,to}) ⇒ activities whose (startAt ?? dueAt) ∈ [from, to): the meeting and the dated task — not the one at `to`, not the one 1 s before `from`, never another system's · mine:true ⇒ only the STAFF's own",
      all.ok && ids.has(inA) && ids.has(inDue) && !ids.has(edge) && !ids.has(before) && !ids.has(foreign) && mine.ok && mids.has(inDue) && !mids.has(inA),
      "window · mine", `${all.err}${mine.err} in=${ids.has(inA)}/${ids.has(inDue)} edge=${ids.has(edge)} before=${ids.has(before)} foreign=${ids.has(foreign)} mine=${mids.has(inDue)}/${mids.has(inA)}`, "MAJOR");
  }
  {
    const kinds = (KR.LINK_TYPE_KINDS ?? []) as string[];
    const c = await call(KL.createCardFromExternal, kctxA, {
      boardId: boardA, title: `การ์ดลิงก์ ${rand}`, sourceType: "MANUAL", sourceKey: `${TAG}:links`,
      links: [
        { linkType: "DEAL", linkId: dMain, role: "RELATED" }, { linkType: "COMPANY", linkId: coMain, role: "RELATED" },
        { linkType: "CRM_CONTACT", linkId: kMain, role: "RELATED" }, { linkType: "CUSTOM_RECORD", linkId: rec, role: "RELATED" },
        { linkType: "DEAL", linkId: dB, role: "RELATED" }, { linkType: "CUSTOM_RECORD", linkId: recB, role: "RELATED" },
      ],
    });
    const cid = String(c.v?.cardId ?? "");
    const links = cid ? ((await P.kanbanCardLink.findMany({ where: { cardId: cid } })) as Any[]) : [];
    const types = links.map((l) => `${l.linkType}:${l.linkId === dMain || l.linkId === coMain || l.linkId === kMain || l.linkId === rec ? "own" : "FOREIGN"}`);
    const resolved = typeof KR.resolveTargets === "function" ? await KR.resolveTargets(kctxA, links.map((l) => ({ linkType: l.linkType, linkId: l.linkId }))).catch(() => new Map()) : new Map();
    const dealT = resolved.get(`DEAL:${dMain}`);
    const href = dealT && typeof KR.LINK_TYPES?.DEAL?.href === "function" ? KR.LINK_TYPES.DEAL.href(dMain, dealT) : null;
    chk("C1.6-S9.6", "kanban `createCardFromExternal` links DEAL · COMPANY · CRM_CONTACT · CUSTOM_RECORD (resolvers real, in LINK_TYPE_KINDS) · another shop's deal/record is NOT linked · the DEAL resolves to its title with href /app/sys/<crm>/crm/deals/<id>",
      c.ok && ["DEAL", "COMPANY", "CUSTOM_RECORD"].every((k) => kinds.includes(k)) && links.length === 4 && !types.some((t) => t.endsWith("FOREIGN")) &&
        ["DEAL", "COMPANY", "CRM_CONTACT", "CUSTOM_RECORD"].every((t) => resolved.has(`${t}:${({ DEAL: dMain, COMPANY: coMain, CRM_CONTACT: kMain, CUSTOM_RECORD: rec } as Record<string, string>)[t]}`)) &&
        dealT?.title === `ดีลหลัก ${rand}` && typeof href === "string" && href.includes(`/app/sys/${crmA}/crm/deals/`) && href.includes(dMain),
      "4 links · resolved", `${c.err} kinds=${["DEAL", "COMPANY", "CUSTOM_RECORD"].filter((k) => kinds.includes(k)).join(",")} links=${types.join(",")} resolved=${resolved.size} title=${dealT?.title ?? "-"} href=${href ?? "-"}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X1 — scope: other shop · other CRM system of the same shop · invisible mention targets
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X1 · scope ──");
  const actA2 = await rawAct(cA2, { dealId: dA2, contactId: kA2, title: `กิจกรรมระบบสอง ${rand}`, dueAt: new Date(NOW + DAY_MS) });
  const actB = await rawAct(cB, { dealId: dB, contactId: kB, title: `กิจกรรมร้านอื่นลับ ${rand}`, dueAt: new Date(NOW + DAY_MS), ownerUserId: userA });
  chk("C1.6-X1.0", "[positive control] the foreign activities / deals exist (crmA2 of tenant A · crmB of tenant B)", !!(await actRow(actA2)) && !!(await actRow(actB)) && !!(await dealRow(dB)), "rows", `${actA2} ${actB}`, "MAJOR");
  {
    const before = await P.crmActivity.count({ where: { tenantId: { in: TENANTS } } });
    const tries = await Promise.all([
      log({ type: "CALL", title: `ข้ามร้าน ${rand}`, dealId: dB }), log({ type: "CALL", title: `ข้ามระบบ ${rand}`, dealId: dA2 }),
      log({ type: "CALL", title: `ข้ามร้านผู้ติดต่อ ${rand}`, contactId: kB }), log({ type: "CALL", title: `ข้ามระบบบริษัท ${rand}`, companyId: coA2 }),
      log({ type: "CALL", title: `ข้ามร้านรายการ ${rand}`, customRecordId: recB }), log({ type: "CALL", title: `บริษัทไม่ใช่ของผู้ติดต่อ ${rand}`, contactId: kMain, companyId: coA2 }),
    ]);
    const after = await P.crmActivity.count({ where: { tenantId: { in: TENANTS } } });
    const leak = tries.some((r) => /ร้านอื่นลับ|ระบบสอง/.test(r.msg));
    chk("C1.6-X1.1", "logActivity on another shop's deal / contact / record or another CRM system's deal / company ⇒ NOT_FOUND (a company not linked to the contact ⇒ NOT_FOUND|VALIDATION) · no row · no foreign text in the error",
      tries.slice(0, 5).every(isNotFound) && (isNotFound(tries[5]) || isValidation(tries[5])) && after === before && !leak, "NOT_FOUND ×6", `${tries.map((r) => r.err || "accepted").map((s) => cut(s, 50)).join(" | ")} rows+${after - before}`);
  }
  {
    const ops = await Promise.all([actA2, actB].flatMap((x) => [
      call(fns.get, cA, owner, x), call(fns.complete, cA, owner, x), call(fns.reschedule, cA, owner, x, { dueAt: new Date(NOW + 9 * DAY_MS) }),
      call(fns.update, cA, owner, x, { title: "ถูกแก้ข้ามร้าน" }), call(fns.del, cA, owner, x, { confirm: true, reason: "ลบข้ามขอบเขต" }), call(fns.card, cA, owner, { activityId: x, boardId: boardA }),
    ]));
    const rows = await Promise.all([actA2, actB].map(actRow));
    chk("C1.6-X1.2", "get / complete / reschedule / update / delete / openTaskCard on an activity of another CRM system or shop ⇒ NOT_FOUND each · both rows untouched",
      ops.every(isNotFound) && rows.every((r) => !!r && r.doneAt === null && !/ถูกแก้/.test(r.title) && !r.kanbanCardId), "NOT_FOUND ×12", `${ops.filter((r) => !isNotFound(r)).map((r) => r.err || "accepted").slice(0, 3).join(" | ") || "-"}`);
  }
  {
    const l1 = await call(fns.list, cA, owner, { status: "pending", pageSize: 200 });
    const l2 = await call(fns.list, cA, owner, { dealId: dB });
    const cal = await call(fns.cal, cA, owner, { from: new Date(NOW - 30 * DAY_MS), to: new Date(NOW + 30 * DAY_MS) });
    const nt = await call(fns.notes, cA, owner, { dealId: dA2 });
    const all = [...idsOf(l1.v), ...idsOf(l2.v), ...idsOf(cal.v), ...idsOf(nt.v)];
    chk("C1.6-X1.3", "listActivities (unfiltered · filtered by another shop's dealId) · calendar · listNotes(another system's deal) never return another system's or shop's activity",
      l1.ok && !all.includes(actA2) && !all.includes(actB) && (l2.ok ? itemsOf(l2.v).length === 0 : isNotFound(l2)) && (nt.ok ? itemsOf(nt.v).length === 0 : isNotFound(nt)),
      "no foreign rows", `${l1.err}${cal.err} foreign=${all.filter((x) => x === actA2 || x === actB).length} l2=${l2.ok ? itemsOf(l2.v).length : l2.err} notes=${nt.ok ? itemsOf(nt.v).length : nt.err}`);
  }
  {
    const assets0 = await P.fileAsset.count({ where: { tenantId: { in: TENANTS } } });
    const puts0 = putsTotal();
    const at = await Promise.all([
      call(fns.attach, cA, owner, { entityType: "DEAL", entityId: dB, filename: "x.pdf", contentType: "application/pdf", data: PDF }, storageDeps),
      call(fns.attach, cA, owner, { entityType: "COMPANY", entityId: coA2, filename: "x.pdf", contentType: "application/pdf", data: PDF }, storageDeps),
      call(fns.attach, cA, owner, { entityType: "RECORD", entityId: recB, filename: "x.pdf", contentType: "application/pdf", data: PDF }, storageDeps),
    ]);
    const lnkA = (await P.crmFileLink.findFirst({ where: { tenantId: tidA, entityType: "COMPANY", entityId: coMain } })) as Any;
    const li = await call(fns.files, cB, owner, { entityType: "COMPANY", entityId: coMain });
    const li2 = await call(fns.files, cA2, owner, { entityType: "COMPANY", entityId: coMain });
    const rm = await call(fns.remove, cB, owner, lnkA?.id ?? NONE, { confirm: true, reason: "ลบข้ามร้าน" }, storageDeps);
    const assets1 = await P.fileAsset.count({ where: { tenantId: { in: TENANTS } } });
    chk("C1.6-X1.4", "files: attach to another shop's deal/record or another system's company ⇒ NOT_FOUND, no FileAsset, nothing stored · listFiles / removeFile of tenant A's company from tenant B or crmA2 ⇒ NOT_FOUND, the link survives",
      at.every(isNotFound) && assets1 === assets0 && putsTotal() === puts0 && isNotFound(li) && isNotFound(li2) && isNotFound(rm) && !!(await P.crmFileLink.findFirst({ where: { id: lnkA?.id ?? NONE } })),
      "NOT_FOUND · 0 writes", `${at.map((r) => r.err || "accepted").map((s) => cut(s, 40)).join(" | ")} assets+${assets1 - assets0} puts+${putsTotal() - puts0} list=${li.err || "returned"} rm=${rm.err || "removed"}`);
  }
  {
    const cBad = await Promise.all([
      log({ type: "CALL", title: `ระบบร้านอื่น ${rand}`, dealId: dMain }, { tenantId: tidA, systemId: crmB, actorUserId: userA }),
      log({ type: "CALL", title: `ระบบสมาชิก ${rand}`, dealId: dMain }, { tenantId: tidA, systemId: memA, actorUserId: userA }),
      call(fns.list, { tenantId: tidA, systemId: memA, actorUserId: userA }, owner, {}),
    ]);
    const rows = await P.crmActivity.count({ where: { title: { in: [`ระบบร้านอื่น ${rand}`, `ระบบสมาชิก ${rand}`] } } });
    chk("C1.6-X1.5", "ctx.systemId is re-resolved against the tenant (type CRM): another shop's CRM system or a MEMBER system in ctx ⇒ refused (log · list), no row",
      cBad.every((r) => isNotFound(r) || isValidation(r)) && rows === 0, "refused ×3", `${cBad.map((r) => r.err || "accepted").map((s) => cut(s, 50)).join(" | ")} rows=${rows}`);
  }
  {
    const na = { inv: await notifCount({ recipientUserId: { in: INVISIBLE } }), bA: await notifCount({ tenantId: tidA, recipientUserId: null }), bB: await notifCount({ tenantId: tidB, recipientUserId: null }) };
    const inbox = await P.kanbanInboxItem.count({ where: { userId: { in: INVISIBLE } } }).catch(() => 0);
    const dto = j(mentionRes.v);
    const leak = [userStranger, userNobody, userPending].some((u) => dto.includes(`${TAG}-${u === userStranger ? "stranger" : u === userNobody ? "nobody" : "pending"}@`) || dto.includes(`QC -${u === userStranger ? "stranger" : u === userNobody ? "nobody" : "pending"}`));
    chk("C1.6-X1.6", "a mention of a user who cannot see the deal — a member of ANOTHER shop · a user with no membership · a never-accepted invite — produces NO notification anywhere (no AppNotification, no inbox item, no tenant-wide broadcast in either shop) and their identity is not echoed back",
      mentionRes.ok && na.inv === nb.inv && na.bA === nb.broadcastA && na.bB === nb.broadcastB && inbox === 0 && !leak, "0 notifications",
      `${mentionRes.err} invisible+${na.inv - nb.inv} broadcastA+${na.bA - nb.broadcastA} broadcastB+${na.bB - nb.broadcastB} inbox=${inbox} echoed=${leak}`);
  }
  {
    const c1 = await call(fns.card, cA, owner, { activityId: taskAct, boardId: boardB });
    const fresh = await rawAct(cA, { dealId: dMain, title: `งานบอร์ดร้านอื่น ${rand}` });
    const c2 = await call(fns.card, cA, owner, { activityId: fresh, boardId: boardB });
    const cardsB = await P.kanbanCard.count({ where: { tenantId: tidB } });
    chk("C1.6-X1.7", "openTaskCard onto another shop's board ⇒ NOT_FOUND (or VALIDATION) · no card appears in that shop",
      (isNotFound(c1) || isValidation(c1) || (c1.ok && String(c1.v?.cardId ?? "") === cardId)) && (isNotFound(c2) || isValidation(c2)) && cardsB === 0, "refused",
      `${c1.err || "ok"} | ${c2.err || "accepted"} cardsB=${cardsB}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X3 — races: parallel log = max (in-process + PROCESSES) · double complete · lock order vs setPrimary / moveDeal
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X3 · races ──");
  const DEAD = /40P01|deadlock|P2034|write conflict/i;
  const runWorkers = async (jobs: [string, Any][]): Promise<{ outs: string[][]; spawned: boolean }> => {
    const startAt = Date.now() + 45_000;
    const outs = await Promise.all(jobs.map(([mode, arg]) => new Promise<string>((resolve) => {
      const enc = Buffer.from(JSON.stringify(arg), "utf8").toString("base64url");
      const ch = spawn("pnpm", ["exec", "tsx", THIS_FILE, "--x3-worker", mode, tidA, crmA, userA, String(startAt), enc], { env: process.env });
      let out = "";
      const to = setTimeout(() => { try { ch.kill("SIGKILL"); } catch { /* already gone */ } }, 300_000);
      ch.stdout.on("data", (d: Any) => { out += String(d); });
      ch.stderr.on("data", (d: Any) => { out += String(d); });
      ch.on("error", (e: Any) => { clearTimeout(to); resolve(`SPAWN-ERROR ${String(e)}`); });
      ch.on("close", () => { clearTimeout(to); resolve(out); });
    })));
    const parsed = outs.map((o) => { const m = /X3WORKER (\[.*\])/.exec(o); return m ? (JSON.parse(m[1]) as string[]) : ["NO-OUTPUT"]; });
    return { outs: parsed, spawned: parsed.every((p) => !p.includes("NO-OUTPUT")) };
  };
  const lastMs = async (model: string, id: string) => ((await P[model].findFirst({ where: { id } })) as Any)?.lastActivityAt?.getTime() ?? null;
  const graph = async (label: string) => {
    const co = await fxCompany(cA, `บริษัทแข่ง${label} ${rand}`);
    const k1 = await rawContact(tidA, crmA, `ผู้ติดต่อแข่ง${label}1 ${rand}`);
    const k2 = await rawContact(tidA, crmA, `ผู้ติดต่อแข่ง${label}2 ${rand}`);
    await link(cA, co, k1, true);
    await link(cA, co, k2, false);
    const d = await fxDeal(cA, { pipelineId: pA.id, title: `ดีลแข่ง${label} ${rand}`, contactId: k1, companyId: co });
    return { co, k1, k2, d };
  };
  const BASE = sec(Date.now() - 20 * DAY_MS);
  {
    const g = await graph("ก");
    const times = Array.from({ length: 10 }, (_x, i) => BASE + ((i * 7) % 10) * 3600_000);
    const res = await Promise.all(times.map((t, i) => log({ type: "CALL", title: `แข่งในโปรเซส ${i} ${rand}`, dealId: g.d, startAt: new Date(t) })));
    const max = Math.max(...times);
    const got = { d: await lastMs("crmDeal", g.d), k: await lastMs("crmContact", g.k1), co: await lastMs("crmCompany", g.co) };
    chk("C1.6-X3.1", "10 parallel logActivity on ONE deal with shuffled startAt ⇒ every call ok · the deal's, contact's and company's lastActivityAt = the MAX exactly (no read-compute-write)",
      res.every((r) => r.ok) && got.d === max && got.k === max && got.co === max, "= max", `ok=${res.filter((r) => r.ok).length} ${j(got)} max=${max} ${res.find((r) => !r.ok)?.err ?? ""}`);
  }
  {
    const t = await rawAct(cA, { dealId: dMain, title: `แข่งปิด ${rand}` });
    const res = await Promise.all(Array.from({ length: 10 }, (_x, i) => call(fns.complete, i % 2 ? cSales : cA, i % 2 ? sales : owner, t)));
    const ev = await evOf("crm.activity.completed", t);
    const row = await actRow(t);
    chk("C1.6-X3.2", "10 parallel completeActivity on ONE activity ⇒ each call ok or a calm refusal · doneAt set once · exactly ONE crm.activity.completed",
      res.every((r) => r.ok || isRefused(r)) && !!row?.doneAt && ev.length === 1, "1 event", `ok=${res.filter((r) => r.ok).length} events=${ev.length} doneAt=${!!row?.doneAt} ${res.find((r) => !r.ok && !isRefused(r))?.err ?? ""}`);
  }
  {
    // worker PROCESSES: 2× log on the deal · log on (k2, company) · setPrimary flipping k1/k2 on the same company
    const g = await graph("ข");
    const tA1 = [0, 1, 2, 3].map((i) => BASE + DAY_MS + i * 97_000);
    const tA2 = [0, 1, 2, 3].map((i) => BASE + DAY_MS + 50_000 + i * 101_000);
    const tK2 = [0, 1, 2, 3].map((i) => BASE + DAY_MS + 20_000 + i * 113_000);
    const w = await runWorkers([
      ["log", { dealId: g.d, times: tA1 }], ["log", { dealId: g.d, times: tA2 }],
      ["log", { contactId: g.k2, companyId: g.co, times: tK2 }], ["primary", { companyId: g.co, contacts: [g.k2, g.k1], rounds: 3 }],
    ]);
    const flat = w.outs.flat();
    const logs = [...w.outs[0], ...w.outs[1], ...w.outs[2]];
    const dMax = Math.max(...tA1, ...tA2);
    const got = { d: await lastMs("crmDeal", g.d), k1: await lastMs("crmContact", g.k1), k2: await lastMs("crmContact", g.k2), co: await lastMs("crmCompany", g.co) };
    chk("C1.6-X3.3a", "[positive control] the 4 worker PROCESSES ran (12 logs + 6 setPrimary = 18 calls) — if red, X3.3 proves nothing", w.spawned && flat.length === 18, "18", `${flat.length} ${cut(flat.filter((o) => o !== "OK").slice(0, 2).join(" | "), 200)}`, "MAJOR");
    chk("C1.6-X3.3", "logActivity from 3 PROCESSES ∥ companies.setPrimary flipping the company's primary contact (4th process) ⇒ no deadlock (40P01/P2034) · every log OK · deal = contact k1 = max of the deal logs · k2 = max of its logs · company = max of ALL logs",
      flat.length === 18 && !flat.some((o) => DEAD.test(o)) && logs.every((o) => o === "OK") && w.outs[3].every((o) => o === "OK" || o.startsWith("ERR:CONFLICT")) &&
        got.d === dMax && got.k1 === dMax && got.k2 === Math.max(...tK2) && got.co === Math.max(dMax, ...tK2),
      "0 deadlocks · = max", `dead=${flat.filter((o) => DEAD.test(o)).length} logsBad=${cut(logs.filter((o) => o !== "OK").slice(0, 2).join(" | "), 160)} ${j(got)} dMax=${dMax} k2Max=${Math.max(...tK2)}`);
  }
  if (!HAS_DEALS) skip("C1.6-X3.4", "logActivity ∥ deals.moveDeal ∥ companies.setPrimary across PROCESSES (binding lock order) ⇒ no 40P01", "deals.ts (C1.5) not built — moveDeal does not exist yet");
  else {
    const g = await graph("ค");
    const [, s1, s2] = pA.st;
    const t1 = [0, 1, 2, 3, 4].map((i) => BASE + 2 * DAY_MS + i * 89_000);
    const t2 = [0, 1, 2, 3, 4].map((i) => BASE + 2 * DAY_MS + 40_000 + i * 83_000);
    const w = await runWorkers([
      ["log", { dealId: g.d, times: t1 }], ["move", { dealId: g.d, stages: [s1, s2, pA.st[0]], rounds: 3 }],
      ["primary", { companyId: g.co, contacts: [g.k2, g.k1], rounds: 3 }], ["log", { dealId: g.d, times: t2 }],
    ]);
    const flat = w.outs.flat();
    const logs = [...w.outs[0], ...w.outs[3]];
    const max = Math.max(...t1, ...t2);
    const got = { d: await lastMs("crmDeal", g.d), co: await lastMs("crmCompany", g.co) };
    chk("C1.6-X3.4a", "[positive control] the 4 lock-order worker PROCESSES ran (10 logs + 9 moves + 6 setPrimary = 25 calls)", w.spawned && flat.length === 25, "25", `${flat.length}`, "MAJOR");
    chk("C1.6-X3.4", "LOCK ORDER (company → contact → deal): logActivity on a deal ∥ deals.moveDeal (C1.5) on that deal ∥ companies.setPrimary (C1.3) on its company, 4 PROCESSES ⇒ no 40P01/P2034 · logs OK · moves/setPrimary OK or CONFLICT · deal/company lastActivityAt = max",
      flat.length === 25 && !flat.some((o) => DEAD.test(o)) && logs.every((o) => o === "OK") && [...w.outs[1], ...w.outs[2]].every((o) => o === "OK" || o.startsWith("ERR:CONFLICT")) && got.d === max && got.co === max,
      "0 deadlocks", `dead=${flat.filter((o) => DEAD.test(o)).length} bad=${cut(flat.filter((o) => o !== "OK").slice(0, 3).join(" | "), 200)} ${j(got)} max=${max}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X4 — redelivery: kanban.card.completed (the CRM extra) · crm.activity.logged / completed consumers
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
  const redeliver = async (ev: Any, alreadyOnce: boolean) => {
    const first = !ev ? ({ ok: false, err: "no event" } as Res) : alreadyOnce ? ({ ok: true, err: "" } as Res) : await consume(ev);
    const fp1 = await footprint();
    const again = ev ? [await consume(ev), ...(await Promise.all(Array.from({ length: 5 }, () => consume(ev))))] : [];
    const fp2 = await footprint();
    const diff = fp1.split(";").filter((x, n) => x !== fp2.split(";")[n]);
    return { ok: !!ev && first.ok && again.every((r) => r.ok) && diff.length === 0, info: `${first.err}${again.find((r) => !r.ok)?.err ?? ""} diff=${cut(diff.join(" "), 160)}` };
  };
  {
    const doneAt0 = (await actRow(taskAct))?.doneAt?.getTime();
    const x = await redeliver(completedEv, true);
    const ev = await evOf("crm.activity.completed", taskAct);
    chk("C1.6-X4.1", "kanban.card.completed of the S5 card delivered again, then 5× in parallel ⇒ every delivery resolves · the activity's doneAt unchanged · still exactly ONE crm.activity.completed · no tenant table changes",
      x.ok && (await actRow(taskAct))?.doneAt?.getTime() === doneAt0 && ev.length === 1, "once", `${x.info} events=${ev.length}`);
  }
  {
    // the FIRST delivery itself arrives 6× in parallel (retry storm right after the card is closed)
    const t = await rawAct(cA, { dealId: dMain, contactId: kMain, companyId: coMain, title: `งานบอร์ดพร้อมกัน ${rand}` });
    const c = await call(fns.card, cA, owner, { activityId: t, boardId: boardA });
    const cid = String(c.v?.cardId ?? "");
    const at = new Date();
    if (cid) await P.kanbanCard.update({ where: { id: cid }, data: { completedAt: at } }).catch(() => 0);
    const ev = { id: `${TAG}-storm`, tenantId: tidA, type: "kanban.card.completed", payload: { cardId: cid || NONE, boardId: boardA, completedAt: at.toISOString(), actorUserId: null }, systemId: kanA, unitId: null };
    const res = await Promise.all(Array.from({ length: 6 }, () => consume(ev)));
    const out = await evOf("crm.activity.completed", t);
    chk("C1.6-X4.2", "kanban.card.completed delivered 6× IN PARALLEL as the very first delivery ⇒ the linked activity is completed once: doneAt set · exactly ONE crm.activity.completed (flag first, then act — H5)",
      c.ok && res.every((r) => r.ok) && !!(await actRow(t))?.doneAt && out.length === 1, "once", `${c.err} ok=${res.filter((r) => r.ok).length} events=${out.length} ${res.find((r) => !r.ok)?.err ?? ""}`);
  }
  {
    const lg = (await P.outboxEvent.findFirst({ where: { tenantId: tidA, type: "crm.activity.logged" }, orderBy: { createdAt: "asc" } })) as Any;
    const cp = (await P.outboxEvent.findFirst({ where: { tenantId: tidA, type: "crm.activity.completed" }, orderBy: { createdAt: "asc" } })) as Any;
    const x1 = await redeliver(lg, false);
    const x2 = await redeliver(cp, false);
    chk("C1.6-X4.3", "crm.activity.logged consumer: once, again, then 5× in parallel ⇒ every delivery resolves and no tenant table changes after the first", x1.ok, "idempotent", x1.info, "MAJOR");
    chk("C1.6-X4.4", "crm.activity.completed consumer: once, again, then 5× in parallel ⇒ every delivery resolves and no tenant table changes after the first", x2.ok, "idempotent", x2.info, "MAJOR");
  }
  {
    const types = ((await P.outboxEvent.findMany({ where: { tenantId: { in: TENANTS } }, select: { type: true }, distinct: ["type"] })) as Any[]).map((x) => x.type as string);
    const orphan = types.filter((t) => typeof CONS?.[t] !== "function");
    chk("C1.6-X4.5", "every event type emitted by this run has a consumer (no queue-stalling orphan)", types.includes("crm.activity.logged") && orphan.length === 0, "0 orphans", `types=${types.length} orphans=${orphan.join(",") || "-"}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X6 — dangerous input: body ≤ 8,000 · times · file mime/size allowlist · filename sanitised
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X6 · dangerous input ──");
  {
    const ok8k = await log({ type: "NOTE", title: `ยาวพอดี ${rand}`, body: "ข".repeat(8000), dealId: dMain });
    const over = await log({ type: "NOTE", title: `ยาวเกิน ${rand}`, body: "ข".repeat(8001), dealId: dMain });
    const longTitle = await log({ type: "NOTE", title: "ค".repeat(1000), dealId: dMain });
    const endBefore = await log({ type: "MEETING", title: `เวลากลับด้าน ${rand}`, dealId: dMain, startAt: new Date(NOW), endAt: new Date(NOW - 3600_000) });
    const negDur = await log({ type: "CALL", title: `ระยะติดลบ ${rand}`, dealId: dMain, durationSec: -5 });
    const badType = await log({ type: "FAX", title: `ชนิดแปลก ${rand}`, dealId: dMain });
    const rows = await P.crmActivity.count({ where: { tenantId: tidA, title: { in: [`ยาวเกิน ${rand}`, `เวลากลับด้าน ${rand}`, `ระยะติดลบ ${rand}`, `ชนิดแปลก ${rand}`] } } });
    const lt = await P.crmActivity.findFirst({ where: { tenantId: tidA, title: { startsWith: "คคคค" } } });
    chk("C1.6-X6.1", "body of exactly 8,000 accepted · 8,001 ⇒ VALIDATION (Thai) · endAt < startAt · negative durationSec · unknown type ⇒ VALIDATION · a 1,000-char title is refused or never stored beyond ACTIVITY_TITLE_MAX · no refused row",
      ok8k.ok && isValidation(over) && thai(over.msg) && isValidation(endBefore) && isValidation(negDur) && isValidation(badType) && rows === 0 &&
        (isValidation(longTitle) || (!!lt && lt.title.length <= (capOf("ACTIVITY_TITLE_MAX") || 300))),
      "bounded", `${ok8k.err || "8000 ok"} | ${over.err || "accepted"} | ${endBefore.err || "accepted"} | ${negDur.err || "accepted"} | ${badType.err || "accepted"} | title=${longTitle.err || lt?.title?.length} rows=${rows}`);
  }
  {
    const assets0 = await P.fileAsset.count({ where: { tenantId: tidA } });
    const links0 = await P.crmFileLink.count({ where: { tenantId: tidA } });
    const puts0 = putsTotal();
    const max = Number(F?.CRM_FILE_MAX_BYTES ?? SH?.CRM_FILE_MAX_BYTES ?? 10 * 1024 * 1024);
    const tries = await Promise.all([
      call(fns.attach, cA, owner, { entityType: "DEAL", entityId: dMain, filename: "page.html", contentType: "text/html", data: bytes(64) }, storageDeps),
      call(fns.attach, cA, owner, { entityType: "DEAL", entityId: dMain, filename: "setup.exe", contentType: "application/x-msdownload", data: bytes(64) }, storageDeps),
      call(fns.attach, cA, owner, { entityType: "DEAL", entityId: dMain, filename: "x.js", contentType: "application/javascript", data: bytes(64) }, storageDeps),
      call(fns.attach, cA, owner, { entityType: "DEAL", entityId: dMain, filename: "big.pdf", contentType: "application/pdf", data: bytes((Number.isFinite(max) ? max : 10 * 1024 * 1024) + 1) }, storageDeps),
      call(fns.attach, cA, owner, { entityType: "INVOICE", entityId: dMain, filename: "x.pdf", contentType: "application/pdf", data: PDF }, storageDeps),
    ]);
    chk("C1.6-X6.2", "file allowlist: text/html · application/x-msdownload · application/javascript · CRM_FILE_MAX_BYTES + 1 · an unknown entityType ⇒ VALIDATION each (Thai) · no FileAsset, no CrmFileLink, nothing stored",
      tries.every(isValidation) && tries.every((r) => thai(r.msg)) && (await P.fileAsset.count({ where: { tenantId: tidA } })) === assets0 && (await P.crmFileLink.count({ where: { tenantId: tidA } })) === links0 && putsTotal() === puts0,
      "VALIDATION ×5 · 0 writes", `${tries.map((r) => r.err || "accepted").map((s) => cut(s, 40)).join(" | ")} puts+${putsTotal() - puts0}`);
  }
  {
    const nameMax = Number(F?.CRM_FILE_NAME_MAX ?? SH?.CRM_FILE_NAME_MAX ?? 200);
    const evil = await call(fns.attach, cA, owner, { entityType: "DEAL", entityId: dMain, filename: "../..\\etc/pa<ss>wd\u0000\r\nX-Evil: 1\t.pdf", contentType: "application/pdf", data: PDF }, storageDeps);
    const dot = await call(fns.attach, cA, owner, { entityType: "DEAL", entityId: dMain, filename: ".htaccess.pdf", contentType: "application/pdf", data: PDF }, storageDeps);
    const long = await call(fns.attach, cA, owner, { entityType: "DEAL", entityId: dMain, filename: `${"ย".repeat(600)}.pdf`, contentType: "application/pdf", data: PDF }, storageDeps);
    const names: string[] = (await P.crmFileLink.findMany({ where: { tenantId: tidA, id: { in: [evil.v?.id, dot.v?.id, long.v?.id].filter(Boolean) } } })).map((x: Any) => String(x.name));
    const clean = (s: string) => !/[/\\<>\u0000-\u001f\u007f]/.test(s) && !s.startsWith(".") && s.length > 0 && s.length <= nameMax;
    chk("C1.6-X6.3", "filename sanitised: path separators, < >, NUL / CR / LF / TAB removed, no leading dot, ≤ CRM_FILE_NAME_MAX — the stored name and the DTO name both clean (Thai kept in S8.1)",
      evil.ok && dot.ok && long.ok && names.length === 3 && names.every(clean) && [evil.v?.name, dot.v?.name, long.v?.name].every((n) => typeof n === "string" && clean(n)),
      "clean names", `${evil.err}${dot.err}${long.err} stored=${cut(j(names.map((n) => n.slice(0, 40))), 200)}`);
  }
  {
    const svg = await call(fns.attach, cA, owner, { entityType: "DEAL", entityId: dMain, filename: "logo.svg", contentType: "image/svg+xml", data: new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>") }, storageDeps);
    chk("C1.6-X6.4", "CRM attachments refuse image/svg+xml (active content inside a private file route) even though the storage table accepts it for logos ⇒ VALIDATION",
      isValidation(svg), "VALIDATION", svg.err || "accepted", "MINOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X8 — PDPA: ids-only payloads · note bodies never in outbox / OpsEvent / logs
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X8 · PDPA ──");
  {
    const leakNote = await watch("log PII note", () => log({ type: "NOTE", title: `โน้ตลับ ${SENT_NAME}`, body: SECRET_NOTE, contactId: kMain }));
    const leakCall = await watch("log PII call + complete", async () => {
      const r = await log({ type: "CALL", title: `โทรหา ${SENT_NAME} ${SENT_PHONE}`, body: SECRET_NOTE, dealId: dMain, outcome: "นัดสาธิต" });
      await call(fns.complete, cA, owner, aid(r.v));
      return r;
    });
    const ours = (await P.outboxEvent.findMany({ where: { tenantId: tidA, type: { in: ["crm.activity.logged", "crm.activity.completed"] } } })) as Any[];
    const mine = ours.filter((o) => [aid(leakNote.v), aid(leakCall.v), mentionNote].some((id) => String(o.idempotencyKey).includes(id)));
    chk("C1.6-X8.0", "[positive control] crm.activity.logged exists for the PII note, the PII call and the mention note (+ completed for the call)",
      mine.filter((o) => o.type === "crm.activity.logged").length >= 3 && mine.some((o) => o.type === "crm.activity.completed"), "≥ 4 events", `${mine.length}`, "MAJOR");
    const digits = SENT_PHONE.replace(/\D/g, "");
    const pii = ours.filter((o) => { const s = j(o.payload); return s.includes(digits) || s.includes(SENT_PHONE.slice(1)) || s.includes(SENT_EMAIL) || s.includes(SENT_NAME) || s.includes(`ส่วนลดพิเศษลับ${rand}`); });
    chk("C1.6-X8.1", "no crm.activity.* payload carries the contact's phone, e-mail, name or ANY part of a note/call body", ours.length > 0 && pii.length === 0, "0 PII", cut(pii.map((o) => j(o.payload)).join(" | "), 200));
    const prose = ours.filter((o) => strings(o.payload).some((s) => /\s|[ก-๙]|@/.test(s)));
    chk("C1.6-X8.2", "payloads are ids/keys only: no string with spaces, Thai text or '@' (titles, bodies, outcomes and mentions' names never travel)",
      ours.length > 0 && prose.length === 0, "ids only", cut(prose.slice(0, 3).map((o) => j(o.payload)).join(" | "), 200), "MAJOR");
    const ev = EVIDENCE.filter((e) => /PII|mention|attach/.test(e.label));
    const hits = ev.flatMap((e) => [...e.logs, ...e.ops.map((o: Any) => j(o))].filter((s) => s.includes(`ส่วนลดพิเศษลับ${rand}`) || s.includes(digits) || s.includes(SENT_EMAIL)).map((s) => `${e.label}: ${cut(s, 80)}`));
    const opsAll = (await P.opsEvent.findMany({ where: { tenantId: { in: TENANTS } } })) as Any[];
    const opsHit = opsAll.filter((o) => j(o).includes(`ส่วนลดพิเศษลับ${rand}`));
    chk("C1.6-X8.3", "no OpsEvent and no console line produced while logging / completing / mentioning / attaching contains the note body, the phone or the e-mail",
      leakNote.ok && leakCall.ok && mentionRes.ok && ev.length >= 3 && hits.length === 0 && opsHit.length === 0, "0 hits (actions ran)", cut([...hits, ...opsHit.map((o) => j(o))].slice(0, 3).join(" | "), 240));
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X9 — delete: MANAGER+ or the activity's owner · confirm + reason ≥ 5 · audit
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X9 · danger ops ──");
  const delReason = "บันทึกผิดลูกค้าทั้งรายการ";
  {
    const t = await rawAct(cA, { dealId: dMain, title: `จะลบ ${rand}`, ownerUserId: userSales });
    const a1 = await call(fns.del, cA, owner, t, {});
    const a2 = await call(fns.del, cA, owner, t, { confirm: true, reason: "ลบ" });
    const a3 = await call(fns.del, cA, owner, t, { reason: delReason });
    const other = await call(fns.del, cSales2, sales2, t, { confirm: true, reason: delReason });
    const live = !!(await actRow(t));
    const ok = await call(fns.del, cSales, sales, t, { confirm: true, reason: delReason });
    const gone = !(await actRow(t));
    const g = await call(fns.get, cA, owner, t);
    const t2 = await rawAct(cA, { dealId: dMain, title: `ผู้จัดการลบ ${rand}`, ownerUserId: userSales2 });
    const m = await call(fns.del, cMgr, mgr, t2, { confirm: true, reason: delReason });
    const aud = (await P.auditLog.findMany({ where: { tenantId: tidA, targetId: { in: [t, t2] } } })) as Any[];
    chk("C1.6-X9.1", "deleteActivity: no confirm / reason < 5 / reason without confirm ⇒ refused ×3 · ANOTHER STAFF ⇒ FORBIDDEN|NOT_FOUND · still there · the activity's owner (STAFF) with confirm + reason ⇒ gone (get ⇒ NOT_FOUND) · a MANAGER deletes anyone's · audit rows keep the reason",
      isRefused(a1) && isRefused(a2) && isRefused(a3) && isForbidden(other) && live && ok.ok && gone && isNotFound(g) && m.ok && !(await actRow(t2)) &&
        aud.filter((x) => j({ b: x.before, a: x.after }).includes(delReason)).length >= 2,
      "rights · confirm · audit", `${a1.err || "ok"} | ${a2.err || "ok"} | ${a3.err || "ok"} | other=${other.err || "allowed"} owner=${ok.err || "ok"} mgr=${m.err || "ok"} audit=${aud.length}`);
  }
  {
    const audLog = (await P.auditLog.findMany({ where: { tenantId: tidA, targetId: byType.CALL ?? NONE } })) as Any[];
    const fl = (await P.crmFileLink.findMany({ where: { tenantId: tidA } })) as Any[];
    const audFile = (await P.auditLog.findMany({ where: { tenantId: tidA, OR: [{ targetId: { in: fl.map((x) => x.id) } }, { targetId: { in: fl.map((x) => x.fileId) } }] } })) as Any[];
    const audRemoved = (await P.auditLog.findMany({ where: { tenantId: tidA, action: { contains: "file" } } })) as Any[];
    chk("C1.6-X9.2", "every mutation leaves an AuditLog row with the actor: the logged CALL (≥ 1, actorId set) · file attach (≥ 1 per surviving link) · file removal (an audit row whose action names the file)",
      audLog.length >= 1 && audLog.every((x) => !!x.actorId) && audFile.length >= 1 && audRemoved.some((x) => /remov|delet|ลบ/i.test(`${x.action} ${j(x.after)} ${j(x.before)}`)),
      "audit rows", `log=${audLog.length} file=${audFile.length} removed=${audRemoved.length}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X10 — private files: no permanent URL in any DTO · the link is bound to its viewer
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X10 · private files ──");
  {
    const l = await call(fns.files, cA, owner, { entityType: "COMPANY", entityId: coMain });
    const a = attached.RECORD;
    const all = [...strings(l.v), ...strings(a)];
    const bad = all.filter((s) => /^https?:\/\//i.test(s) || s.includes(CDN) || s.startsWith("private://") || /t\/[a-z0-9]+\/private\//i.test(s) || /bunnycdn/i.test(s));
    const item = itemsOf(l.v)[0];
    const urlOk = typeof item?.url === "string" && /^\/api\/files\/[a-z0-9]{16,40}\?exp=\d+&sig=[0-9a-f]{64}$/.test(item.url);
    const exp = Number(/exp=(\d+)/.exec(String(item?.url ?? ""))?.[1] ?? 0);
    const nowS = Math.floor(Date.now() / 1000);
    chk("C1.6-X10.1", "file DTOs (attach result + listFiles) hold NO permanent URL: no http(s), no CDN host, no private:// sentinel, no storage path — `url` = /api/files/<id>?exp=…&sig=<64 hex> expiring within 15 minutes",
      l.ok && all.length > 0 && bad.length === 0 && urlOk && exp > nowS && exp - nowS <= 900, "signed route link only", `${l.err} bad=${cut(bad.slice(0, 3).join(" | "), 160)} url=${cut(item?.url, 100)} ttl=${exp - nowS}`);
    const u = String(item?.url ?? "");
    const fid = decodeURIComponent(/\/api\/files\/([^?]+)/.exec(u)?.[1] ?? "");
    const sig = /sig=([0-9a-f]+)/.exec(u)?.[1] ?? null;
    const expS = /exp=(\d+)/.exec(u)?.[1] ?? null;
    const okFn = ST?.privateFileSignatureOk;
    const lk = (await P.crmFileLink.findFirst({ where: { tenantId: tidA, entityType: "COMPANY", entityId: coMain } })) as Any;
    const mineOk = typeof okFn === "function" && okFn(fid, expS, sig, { kind: "STAFF", id: userA });
    const others = typeof okFn === "function" && [
      okFn(fid, expS, sig, { kind: "STAFF", id: userMgr }), okFn(fid, expS, sig, { kind: "STAFF", id: userStranger }), okFn(fid, expS, sig, { kind: "CUSTOMER", id: userA }),
    ].some(Boolean);
    const salesList = await call(fns.files, cSales, sales, { entityType: "COMPANY", entityId: coMain });
    const su = String(itemsOf(salesList.v)[0]?.url ?? "");
    const sOk = typeof okFn === "function" && okFn(decodeURIComponent(/\/api\/files\/([^?]+)/.exec(su)?.[1] ?? ""), /exp=(\d+)/.exec(su)?.[1] ?? null, /sig=([0-9a-f]+)/.exec(su)?.[1] ?? null, { kind: "STAFF", id: userSales });
    chk("C1.6-X10.2", "the link is minted for THIS viewer: it names the FileAsset of the link · verifies for the owner who listed it · fails for another staff member, another shop's user and a customer · the STAFF's own listing gets a link valid for the STAFF",
      !!lk && fid === lk.fileId && mineOk === true && others === false && salesList.ok && sOk === true, "viewer-bound",
      `file=${fid === lk?.fileId} mine=${mineOk} others=${others} staff=${sOk} ${salesList.err}`);
    const fa = lk ? ((await P.fileAsset.findFirst({ where: { id: lk.fileId } })) as Any) : null;
    chk("C1.6-X10.3", "the upload went through the PRIVATE path of C0.4: FileAsset.path t/<tenant>/private/<≥128-bit random>.<ext> · cdnUrl = private://<path> (no usable URL stored) · kind ATTACHMENT",
      !!fa && new RegExp(`^t/${tidA}/private/[0-9a-f]{32,}\\.[a-z0-9]+$`).test(fa.path) && fa.cdnUrl === `private://${fa.path}` && fa.kind === "ATTACHMENT",
      "private row", `${fa?.path ?? "-"} ${fa?.cdnUrl ?? "-"} ${fa?.kind ?? "-"}`);
  }
} catch (e) {
  chk("C1.6-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — trigger first, then every row of the two throwaway tenants (4 passes), systems/units/tenants, users.
  // No drainOutbox (not tenant-scoped) — our PENDING events go with the tenant sweep. No stored object exists (storage stubbed).
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
      const notes = USERS.length ? await P.appNotification.count({ where: { recipientUserId: { in: USERS } } }) : 0;
      const trig = ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = '${TRIG}'`).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0;
      const realStore = STORE_REQ.filter((r) => !r.url.includes(`${TAG}-zone`) && !r.url.includes("qc-c16-cdn.invalid"));
      chk("C1.6-CLEAN", "the oracle gives the QC database back exactly as found — the two throwaway tenants, every row they owned, the throwaway users (+ their notifications) and the test trigger are gone · no request ever reached a real storage zone",
        left.length === 0 && tenants === 0 && users === 0 && notes === 0 && Number(trig) === 0 && realStore.length === 0, "0 rows · 0 tenants · 0 users · 0 triggers · 0 real storage calls",
        `${left.join(" · ") || "-"} · tenants=${tenants} users=${users} notifications=${notes} trig=${trig} realStore=${realStore.length}`, "MAJOR");
    } catch (e) {
      chk("C1.6-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C1.6: ${passed}/${total}${SKIPS.length ? ` · ⚪ ${SKIPS.length} skipped (${SKIPS.map((s) => s.id).join(", ")})` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings, skippedChecks: SKIPS })}`);
process.exit(passed === total ? 0 : 1);
