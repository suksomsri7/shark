// QC — CRM v2 WO C2.4: activity capture — call-log modal (click-to-call `tel:` · outcome · duration · direction · note · next task ·
//      recording ≤ 25 MB through the PRIVATE file path of C0.4) · `CrmTranscriber` adapter + AI summary/next step as a PROPOSAL (never
//      auto-written · AI credit · refused without credit/consent) · business-card scan (vision) → proposal `crm_create_lead` ·
//      chat RESOLVED → ONE CHAT activity per conversation (+ optional AI summary) · chat message → sequence stop + lastActivityAt ·
//      calendar merges read-only appointments of the same Party (booking · clinic · school facades `appointmentsByParty`) ·
//      activity reminders (minute job) · `CrmCallProvider` interface + webhook shape (stub) · "book via the booking system" link (R-A) ·
//      recording purge (R-A)
// Oracle writer · the C2.4 builder must NOT touch this file · QC database only (.env.qc — loaded by scripts/acc-v2-env.mts)
// Run:  bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c2.4.mts
//       `--force-run` = run every check while the C2.4 artefacts are absent — C2.4 checks go red for the right reason ("missing"),
//       the positive controls (storage signature, fixtures, C1.6 logActivity) and CLEAN go green: proves the fixtures and the cleanup.
//       Without the flag and without src/lib/modules/crm/calls.ts ⇒ SKIPPED (no DB connection opened).
// requires: crm-seed   (house style — this oracle reads NO seeded row; everything lives in throwaway tenants `qc-c24-<rand>-*`)
//
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE (not re-implemented here): qc-chat-core-v2 · qc-chat-v2-context · qc-ai-vision ·
//   qc-ai-credit · qc-ai-proposals · qc-crm-c1.6 (calendar() gains `appointments`; everything else unchanged) · qc-crm-c1.8 (onChatMessage
//   keeps its lead behaviour) · qc-crm-c2.2 (stopFor is C2.2's) · qc-crm-c0.4 (private files) · qc-crm-c0.5 (dispatcher) · qc-crm-v1 ·
//   every earlier qc-crm-c1.* · qc-member-m1.9 (30/15/10/5).
//
// SOURCES: crm-brief-C2.4.md · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-A "book via the booking system" button = C2.4 · R-A
//   stopFor is C2.2's, C2.4 only CALLS it · R-A purge of recordings implemented by C2.4, registered by C2.10 · R-B no STT provider ·
//   R-D crm-bridges/chat.ts C1.8 → C2.4 · R-E.2 private files (path + private:// sentinel, route streams bytes) · R-E.4
//   crm_transcribe_call not counted · R-E.14 uiVersion 1 ⇒ nothing runs, rows kept · R-E.15 settings.crm.ai.callTranscribe default false)
//   · CRM-RUN §2 "C2.4" (S1 3 · S2 4 · S3 3 · S4 4 · S5 2 · S6 2 · S7 6 = 24) + §4 PERMANENT RULE (C1.7: every oracle carries
//   uiVersion-1 cases) · MASTER-PLAN §2 §4 (X1 X2 X3 X4 X5 X6 X8 X9 X10) §6 row C2.4 · blueprint §3.8 · §5.5 (logActivity recordingFileId
//   · remind cron 5 min · fromChat · callProvider.webhook) · decision C5 · mockup 08 (left: call modal · right: calendar) · 13 ·
//   src/app/api/files/[id]/route.ts header ("the ISSUER decides access — run canSee BEFORE privateFileUrl") · src/lib/ai/credit.ts
//   (canSpend · chargeUsage) · src/lib/ai/proposals.ts (AiProposal PENDING/EXECUTED claim pattern) · C2.2 contract (stopFor) ·
//   C0.5 minute-job registry.
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this) ══════════════════════════════════
//   A. SERVICE `src/lib/modules/crm/calls.ts` (+ `export * as calls from "./calls"` in crm/index.ts) — ctx { tenantId, systemId,
//      actorUserId } · actor = MemberActor · system re-resolved (id + tenantId + type CRM) else NOT_FOUND · assertCrmV2 FIRST on every
//      function (uiVersion 1 ⇒ CrmV2DisabledError, nothing read/written/called) · visibility (activityWhere/contactWhere/dealWhere) BEFORE
//      keys ⇒ invisible = NOT_FOUND, visible but no key = FORBIDDEN (Thai, crmForbiddenMessage) · errors carry `.code` ∈ NOT_FOUND |
//      FORBIDDEN | VALIDATION | CONFLICT | CONFIRM_REQUIRED | NO_CREDIT | AI_DISABLED | NOT_CONFIGURED with a Thai message that never
//      blames the user and never echoes data of another tenant/system · every mutation writes AuditLog `crm.activity.*` (targetId =
//      activity id): `crm.activity.log` (existing) · `crm.activity.recording_attach` · `crm.activity.recording_remove` ·
//      `crm.activity.ai_request` · `crm.activity.ai_accept` · `crm.activity.ai_reject` — audit before/after never holds transcript text
//      logCall(ctx, actor, input: LogCallInput, deps?: { put?, del? }) → { activity: ActivityDto; nextTaskId: string | null;
//          recording: RecordingDto | null }                                                     (key crm.activity.create)
//        LogCallInput = { contactId?; dealId?; companyId?; direction: "IN" | "OUT"; outcome: string (CALL registry of C1.6 —
//          settings.crm.activityOutcomes.CALL ?? ACTIVITY_OUTCOMES_DEFAULT.CALL); durationSec?; startAt?; title?; body?;
//          nextTask?: { type?; title; dueAt }; remindAt?; recording?: { filename; contentType; data: Uint8Array } | null }
//        built on activities.logActivity (type CALL · lastActivityAt · nextTask TASK · crm.activity.logged) · the recording is validated
//        BEFORE anything is written (bad recording ⇒ no activity, no put, no FileAsset)
//      attachRecording(ctx, actor, activityId, { filename, contentType, data }, deps?) → RecordingDto   (CALL only · one per activity)
//        uploadFile(…, { visibility: "private", maxBytes: CRM_RECORDING_MAX_BYTES }) ⇒ FileAsset.path `t/<tid>/private/…`, cdnUrl
//        `private://…` · CrmActivity.recordingFileId = FileAsset.id · mime ∈ CRM_RECORDING_MIME_ALLOWLIST after normalizeUploadType
//        (`audio/webm;codecs=opus` ok) · size ≤ 25 MB · file name sanitized like files.ts (no / \ CR LF bidi) · key crm.activity.create
//      getRecording(ctx, actor, activityId) → RecordingDto | null                                 (visibility of the activity; read)
//        RecordingDto = { activityId; name; size; mime; url; expiresAt } (+ durationSec?/createdAt? allowed) — url = privateFileUrl(fileId,
//        { kind: "STAFF", id: actor.userId }) issued ONLY after the visibility check; NO cdnUrl / path / private:// anywhere
//      removeRecording(ctx, actor, activityId, { confirm: true, reason ≥ 5 chars }, deps?) → { ok: true } — DANGER (X9): no confirm ⇒
//        CONFIRM_REQUIRED, short reason ⇒ VALIDATION · deletes the FileAsset through deleteFileAsset (deps.del), recordingFileId := null
//      callAiStatus(ctx, actor, deps?: { transcriber? }) → { state: "OFF" | "NO_PROVIDER" | "NO_CREDIT" | "READY"; message: string (Thai) }
//        OFF = settings.crm.ai.callTranscribe !== true · NO_PROVIDER = no deps.transcriber and getCrmTranscriber() null — message
//        contains "ยังไม่ได้เชื่อมบริการถอดเสียง" (calm, no error wording) · NO_CREDIT = !canSpend(tenantId) · READY otherwise
//      transcribeCall(ctx, actor, activityId, deps?: { transcriber?: CrmTranscriber; ai?: AiProvider }) → { proposalId; reused: boolean }
//        key crm.activity.create · order: v2 → visibility → key → CALL with a recording (else VALIDATION) → settings.crm.ai.callTranscribe
//        (else AI_DISABLED) → transcriber (deps ?? registry, else NOT_CONFIGURED) → canSpend (else NO_CREDIT) — every refusal calls
//        NOTHING (no transcriber, no AI, no proposal, no charge) · then transcriber.transcribe({ tenantId, activityId, fileId, mime,
//        open: () => bytes }) → AI (deps.ai ?? resolveProvider()) with a prompt asking for JSON { "summary": string, "nextStep": string }
//        whose text has phone numbers and e-mail addresses REDACTED (X8) → chargeUsage once (source CRM_ASSIST — controller ruling R2 (C2.0 adds the enum value) · no enum
//        migration in C2.4 · note EXACTLY `crm.call.transcribe#<activityId>` — ids only) → createProposal kind "crm.activity.ai_fill",
//        payload { activityId, systemId, transcript, aiSummary, aiNextStep } (conversationId sentinel `crm:activity:<activityId>`) ·
//        the activity's transcript/aiSummary/aiNextStep are NOT written · while a PENDING ai_fill proposal exists for the activity the
//        call returns it (reused: true) — X3: 10 parallel calls ⇒ ONE proposal, ONE charge, ONE transcriber call (advisory lock per activity)
//      pendingCallAiProposal(ctx, actor, activityId) → { proposalId; transcript; aiSummary; aiNextStep } | null
//      acceptCallAiProposal(ctx, actor, proposalId, edits?: { transcript?; aiSummary?; aiNextStep? }) → ActivityDto (shape free)
//        claim PENDING→EXECUTED atomically (updateMany … status PENDING) — loser/second call ⇒ CONFLICT · writes the 3 fields (edits win)
//        · proposal of another tenant/system ⇒ NOT_FOUND · rejectCallAiProposal(ctx, actor, proposalId) → REJECTED, fields untouched
//      scanBusinessCard(ctx, actor, { filename, contentType, data }, deps?: { ai? }) → { proposalId; draft: { name; phone; email; company;
//        jobTitle } } — key crm.contact.create · image ∈ CRM_CARD_MIME_ALLOWLIST (jpeg/png/webp/heic), ≤ CRM_CARD_MAX_BYTES (5 MB) else
//        VALIDATION · the image reaches the vision model ONLY as a `data:<mime>;base64,` URL (never a CDN/http URL — X10) · canSpend else
//        NO_CREDIT · one charge (note starts `crm.card.scan`) · AiProposal kind "crm_create_lead" PENDING, payload { systemId, name, phone,
//        email, company, jobTitle } · the image is not stored
//      acceptLeadProposal(ctx, actor, proposalId) → { contactId } — creates the contact through contacts.createContact of ctx.systemId
//        (payload.systemId ≠ ctx.systemId ⇒ NOT_FOUND) · PENDING→EXECUTED claim (second ⇒ CONFLICT)
//      bookingLinkFor(ctx, actor, { contactId }) → { href } | null — null when the tenant has no ACTIVE BusinessUnit of type BOOKING ·
//        href = `/app/u/<unitSlug>/booking?…partyId=<partyId>…` — never phone / e-mail / name in the URL
//      purgeRecordings(now: Date, opts?: { tenantIds?: string[]; deps?: { del? } }) → { purged: number } — CALL activities whose
//        (startAt ?? createdAt) < now − settings.crm.retention.recordingDays (default 730) days: FileAsset deleted, recordingFileId := null,
//        transcript := null (the activity itself is kept) · uiVersion-1 systems skipped
//   B. SHARED `src/lib/modules/crm/calls-shared.ts` (pure — no prisma/next/server-only): CRM_RECORDING_MAX_BYTES = 25 * 1024 * 1024 ·
//      CRM_RECORDING_MIME_ALLOWLIST (every entry `audio/*` and a key of storage ALLOWED_UPLOAD_TYPES) · CRM_CARD_MAX_BYTES = 5 * 1024 * 1024
//      · CRM_CARD_MIME_ALLOWLIST · types LogCallInput/RecordingDto/CallAiState · settings: `settings.crm.ai = { callTranscribe: false,
//      chatSummary: false }` defaults surfaced by parseCrmSettings(raw).ai (R-E.15) · `settings.crm.retention.recordingDays` (730)
//   C. ADAPTERS (stubs — R-B: no STT/VoIP provider in this run)
//      `src/lib/modules/crm/transcriber.ts`: `export interface CrmTranscriber { key: string; transcribe(input: { tenantId; activityId;
//        fileId; mime; open: () => Promise<Uint8Array | null> }): Promise<{ text: string; language?: string; model?: string }> }` ·
//        registerCrmTranscriber(t | null) · getCrmTranscriber() → null by default
//      `src/lib/modules/crm/call-provider.ts`: `export interface CrmCallProvider { key; parseWebhook(input: { headers; body }):
//        CallWebhookEvent | null; placeCall?(…) }` · CallWebhookEvent = { provider; providerCallId; direction: "IN" | "OUT"; from; to;
//        startedAt (ISO); endedAt?; durationSec?; status: "ANSWERED" | "MISSED" | "BUSY" | "FAILED"; recordingUrl? } ·
//        parseCallWebhook(body: unknown) → CallWebhookEvent | null (pure validator: missing id / bad direction / non-ISO date / negative
//        duration ⇒ null) · callWebhookToActivityInput(evt) → { type: "CALL"; direction; startAt; durationSec; outcome ∈ CALL defaults;
//        title (Thai, NO phone number); … } (never copies recordingUrl or from/to into title/body) · getCrmCallProvider(ctx) → null ·
//        NO HTTP route for call webhooks in C2.4 (a public endpoint would need X7 — PROPOSED)
//   D. CHAT (`src/lib/platform/crm-bridges/chat.ts`, exported from crm-bridges/index.ts)
//      onChatConversationStatus(evt, deps?: { ai?: AiProvider }) — payload.status "RESOLVED" only · conversation by id + evt.tenantId ·
//        its ChatContact.partyId · target = the FIRST open CRM system (crmGates order, bridgeOpen) holding a contact of that Party ·
//        ONE CrmActivity per conversation: type CHAT, source CHAT, sourceRef = conversationId, contactId, doneAt set, title Thai with no
//        name/phone/e-mail · dedupe flag-first (advisory lock on conversationId + existence by sourceRef) — redelivery / parallel / a
//        reopen→resolve cycle never makes a second one · emits crm.activity.logged (ids only) in the same tx · optional AI summary when
//        settings.crm.ai.chatSummary === true (PROPOSED key, default false) AND canSpend: messages → AI (phone/e-mail redacted) →
//        aiSummary of that activity (system-authored field) + ONE charge (note `crm.chat.summary#<conversationId>`) — only when the
//        activity is created; AI failure/no credit ⇒ activity still created without summary · no Party / no contact ⇒ nothing
//      onChatMessage (C1.8, extended): contact(s) of the Party in open CRM systems ⇒ lastActivityAt := now (no activity, no event) and
//        `sequences.stopFor({ tenantId, systemId }, contactId, "REPLY")` (C2.2) · uiVersion 1 / bridge closed ⇒ nothing
//      wired in src/lib/outbox-consumers.ts inside `// CRM C2.4 ▸ … ◂`: "chat.conversation.status" = withAutomation(compose(async () => {},
//        crmBridge("onChatConversationStatus"))) (CrmBridgeName gains it)
//   E. CALENDAR `activities.calendar(ctx, actor, { from, to, mine?, team? })` → { items (unchanged); appointments: CalendarAppointment[] }
//      CalendarAppointment = { key; source: "BOOKING" | "CLINIC" | "SCHOOL"; id (= Appointment.id | ClinicVisit.id | SchoolEnrollment.id); startAt (ISO); endAt | null; title; status; contactId;
//        contactName | null; readOnly: true; href: string | null } — appointments whose partyId is the Party of a contact the actor can
//        see (contactWhere), inside [from, to), unit ∈ actor unit scope (OWNER / "*" / [] = all), `mine` ⇒ contacts owned by the actor ·
//        read through NEW facades (read only, tenant-scoped) `src/lib/modules/{booking,clinic,school}/index.ts` →
//        appointmentsByParty(tenantId: string, partyIds: string[], range: { from: Date; to: Date }, opts?: { unitIds?: string[] | "*" })
//        → PartyAppointment[] { source; id; partyId; unitId; startAt; endAt | null; title; status } · BOOKING = Appointment (not
//        CANCELLED, title = service name) · CLINIC = ClinicVisit (not CANCELLED, startAt = visitDate, title WITHOUT symptom/diagnosis/
//        fee) · SCHOOL = SchoolEnrollment ENROLLED|PAID → class.startDate, title = course + class name · NO customerName/customerPhone/
//        studentPhone/symptom/diagnosis/note in any DTO · edges "crm→booking" "crm→clinic" "crm→school" in ALLOWED_EDGES (fitness.mts)
//   F. REMINDERS `src/lib/modules/crm/reminders.ts`: remindDue(now: Date, opts?: { tenantIds?: string[]; deps?: { push?: (req: {
//        tenantId; userId; activityId; title; body }) => Promise<unknown> }; deadline?; signal? }) → summary · activities with remindAt ≤
//        now, doneAt null, ownerUserId set, system uiVersion 2 ⇒ ONE in-app AppNotification (recipientUserId = owner, title/body contain
//        the activity title) + one push, per (activityId, remindAt) — two overlapping runs / later runs / a push that throws never make a
//        second one nor lose it (flag-first; recommended: outbox flag key `crm.activity.reminder#<id>#<remindAtMs>` + consumer) ·
//        registerMinuteJob({ name: "crm.activity.remind", everyMinutes: 5, cadence "minute", NOT vpsOnly }) on import ·
//        scripts/crm-cron.mts imports the module
//   G. UI (all v2-only — uiVersion 1 shows nothing new)
//      `src/components/crm/call/CrmCallLogModal.tsx` ('use client') testids: crm-call-log-modal · crm-call-outcome · crm-call-duration ·
//        crm-call-direction · crm-call-note · crm-call-next-task · crm-call-recording-input · crm-call-recording-player (<audio>) ·
//        crm-call-ai-transcribe · crm-call-ai-unavailable (text "ยังไม่ได้เชื่อมบริการถอดเสียง") · crm-call-ai-card ·
//        crm-call-ai-transcript · crm-call-ai-summary · crm-call-ai-next-step · crm-call-ai-accept · crm-call-save · crm-call-cancel ·
//        Thai section labels of mockup 08: ผลสาย · ระยะเวลา · ทิศทาง · โน้ต · งานถัดไป · ไฟล์เสียง · ถอดเสียง · สรุป
//      `src/components/crm/call/CrmClickToCall.tsx` ('use client'): `<a href={`tel:…`} data-testid="crm-call-tel">` that also opens the
//        modal · rendered on contact 360 and deal 360 (v2 pages)
//      `src/lib/modules/crm/calls-actions.ts` ("use server" — async exports only, each: requireTenant → assertCrmV2 → assertCanCrm/crmCan →
//        calls.*): logCallAction · transcribeCallAction · acceptCallAiAction · rejectCallAiAction · removeRecordingAction ·
//        scanBusinessCardAction · acceptLeadProposalAction
//      calendar `_components/CalendarViews.tsx` renders appointments with data-testid="crm-calendar-appointment" marked read-only
//        ("อ่านอย่างเดียว" or aria-readonly) · business-card entry `crm-card-scan` · booking button `crm-book-via-booking`
//      every literal testid has a row (wo "C2.4") in scripts/crm-ui-inventory.json
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// WHAT THIS FILE PROVES: S0 structure · S1–S7 of CRM-RUN (24) · S8 brief extras · U PERMANENT RULE (uiVersion 1) · X1 X2 X3 X4 X5 X6 X8
//   X9 X10 · CLEAN.   N/A: X7 — no public endpoint in C2.4 (the call-webhook route is deliberately not built; files go through the C0.4
//   route which qc-crm-c0.4 covers).
// S7 ("ภาพ" 6) is proven here STATICALLY (testids · Thai section labels · responsive classes · read-only calendar markers); the PARITY
//   verdict against mockup 08 at 1440/390 is the controller's gate D7 (screenshots), not this file.
// HOUSE RULES: SKIP guard before any DB connection · throwaway tenants swept in `finally` (every table with tenantId, 4 passes) + users ·
//   no drainOutbox (our own pump only touches PENDING events of OUR tenants) · EVERY outbound fetch stubbed (object storage, OpenRouter,
//   push — nothing reaches the network) · AI keys removed from this process · AI + transcriber are fakes injected through deps ·
//   storage put/del injected · last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const CALLS = "src/lib/modules/crm/calls.ts";
const CALLS_SH = "src/lib/modules/crm/calls-shared.ts";
const CALLS_ACT = "src/lib/modules/crm/calls-actions.ts";
const TRANSCRIBER = "src/lib/modules/crm/transcriber.ts";
const CALLPROV = "src/lib/modules/crm/call-provider.ts";
const REMIND = "src/lib/modules/crm/reminders.ts";
const CRM_INDEX = "src/lib/modules/crm/index.ts";
const BR_CHAT = "src/lib/platform/crm-bridges/chat.ts";
const BR_INDEX = "src/lib/platform/crm-bridges/index.ts";
const CONS_FILE = "src/lib/outbox-consumers.ts";
const FITNESS = "scripts/fitness.mts";
const CRON = "scripts/crm-cron.mts";
const INVENTORY = "scripts/crm-ui-inventory.json";
const CALL_UI_DIR = "src/components/crm/call";
const MODAL = `${CALL_UI_DIR}/CrmCallLogModal.tsx`;
const TEL = `${CALL_UI_DIR}/CrmClickToCall.tsx`;
const CRM_PAGES = "src/app/app/sys/[id]/crm";
const CAL_DIR = `${CRM_PAGES}/calendar`;
const FACADES = { BOOKING: "src/lib/modules/booking/index.ts", CLINIC: "src/lib/modules/clinic/index.ts", SCHOOL: "src/lib/modules/school/index.ts" } as const;
const V1_FILES = ["src/lib/modules/crm/ui.tsx", "src/lib/modules/crm/actions.ts", `${CRM_PAGES}/activities/_components/ActivitiesV1Page.tsx`];
const MB = 1024 * 1024;

const ARGV = process.argv.slice(2);
const FORCE = ARGV.includes("--force-run");
const read = (p: string) => (p && existsSync(p) ? readFileSync(p, "utf8") : "");
const walk = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out.sort();
};

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guard — C2.4 not built ⇒ SKIPPED, no DB connection opened.
// ═══════════════════════════════════════════════════════════════════════════════════
const BUILT = existsSync(CALLS);
if (!FORCE && !BUILT) {
  console.log(`⚠️  SKIPPED — WO C2.4 not built yet (${CALLS} missing) (run with --force-run to exercise the fixtures and the cleanup)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();

// ─── nothing reaches the network: fake storage identity + AI keys removed + EVERY fetch stubbed ───
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c24-${rand}`;
const CDN = "https://qc-c24-cdn.invalid";
process.env.SHARK_BUNNY_CDN = CDN;
process.env.SHARK_BUNNY_ZONE = `${TAG}-zone`;
process.env.SHARK_BUNNY_KEY = `qc-c24-key-${randomBytes(8).toString("hex")}`;
delete process.env.BUNNY_ACCOUNT_KEY;
for (const k of Object.keys(process.env)) if (/^(OPENROUTER|OPENAI|ANTHROPIC|SHARK_AI_KEY|AI_API_KEY)/.test(k)) delete process.env[k];
const FETCHES: string[] = [];
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  FETCHES.push(`${String(init?.method ?? "GET").toUpperCase()} ${url}`);
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

// ─── harness (chk writes through process.stdout so the console capture below only sees product logs) ───
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const out = (s: string) => process.stdout.write(`${s}\n`);
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  out(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const LOGS: string[] = [];
{
  const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };
  const j0 = (x: unknown) => { try { return typeof x === "string" ? x : x instanceof Error ? `${x.name}: ${x.message}` : JSON.stringify(x); } catch { return String(x); } };
  for (const k of Object.keys(orig) as (keyof typeof orig)[]) {
    console[k] = ((...a: unknown[]) => { LOGS.push(a.map(j0).join(" ")); orig[k](...a); }) as Any;
  }
}
const cut = (v: unknown, n = 240) => { const s = String(v ?? ""); return s.length > n ? `${s.slice(0, n)}…` : s; };
const j = (v: Any): string =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x instanceof Uint8Array ? `<${x.length} bytes>` : x)) ?? "undefined";
const thai = (s: unknown) => /[ก-๙]/.test(String(s ?? ""));
const blames = (s: unknown) => /คุณ(ทำ|ใส่|กรอก|เลือก)[^\s]*ผิด|ความผิดของคุณ|ผู้ใช้ผิด/.test(String(s ?? ""));
type Res = { ok: boolean; v: Any; err: string; code: string; msg: string; name: string };
const call = async (fn: Any, ...args: Any[]): Promise<Res> => {
  if (typeof fn !== "function") return { ok: false, v: undefined, err: "MISSING_FUNCTION", code: "MISSING_FUNCTION", msg: "", name: "" };
  try {
    return { ok: true, v: await fn(...args), err: "", code: "", msg: "", name: "" };
  } catch (e) {
    const x = e as Any;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, v: undefined, err: `${x?.name ?? "Error"}(${x?.code ?? "-"}): ${cut(msg, 160)}`, code: String(x?.code ?? ""), msg, name: String(x?.name ?? "") };
  }
};
const refused = (r: Res, code?: string | string[]) =>
  !r.ok && r.code !== "MISSING_FUNCTION" && thai(r.msg) && !blames(r.msg) && (!code || (Array.isArray(code) ? code.includes(r.code) : r.code === code));
const isV1Refusal = (r: Res, msg: string) => !r.ok && r.code !== "MISSING_FUNCTION" && (r.name === "CrmV2DisabledError" || (!!msg && r.msg === msg));
const rd = (r: Res) => (r.ok ? "ok" : r.err);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
const DAY = 86_400_000;

out(`\n═══ QC CRM v2 · C2.4 — activity capture (calls · AI proposals · chat → activity · merged calendar · reminders) ═══`);
out(`[env] DB ${host} · tag ${TAG}${FORCE && !BUILT ? " · --force-run with C2.4 ABSENT (C2.4 checks expected red; positive controls + CLEAN green)" : ""}\n`);

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TENANTS: string[] = [];
const USERS: string[] = [];
const PII: string[] = [];
const pii = <T extends string>(s: T): T => { PII.push(s); return s; };
let seq = 0;
const nx = () => `${++seq}`;
let phoneSeq = 0;
const phoneOf = (): string => pii(`08${String((Math.floor(Math.random() * 9_000_000) + 1_000_000) * 10 + (phoneSeq++ % 10)).padStart(8, "0").slice(-8)}`);
const fmtPhone = (p: string) => pii(`${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`);
const mailOf = (s: string) => pii(`${TAG}-${s}@qc-crm.example`);
const NONE = `${TAG}-none`;
const MARK_T = `ถอดเสียงลับ${rand}`; // transcript marker (must never reach outbox/OpsEvent/logs/audit)
const MARK_S = `สรุปเอไอ${rand}`; // AI summary marker
const MARK_N = `ขั้นถัดไป${rand}`; // AI next-step marker
const MARK_C = `ข้อความแชทลับ${rand}`; // chat message marker
const MARK_CS = `สรุปแชท${rand}`; // chat summary marker
const SYMPTOM = `อาการลับ${rand}`;
const DIAG = `วินิจฉัยลับ${rand}`;

try {
  // ═════════════════════════════════════════════════════════════════════════════
  // modules (dynamic — they may not exist yet)
  // ═════════════════════════════════════════════════════════════════════════════
  const CL = (await import("@/lib/modules/crm/calls" as string).catch(() => ({}))) as Any;
  const CSH = (await import("@/lib/modules/crm/calls-shared" as string).catch(() => ({}))) as Any;
  const TR = (await import("@/lib/modules/crm/transcriber" as string).catch(() => ({}))) as Any;
  const CP = (await import("@/lib/modules/crm/call-provider" as string).catch(() => ({}))) as Any;
  const RM = (await import("@/lib/modules/crm/reminders" as string).catch(() => ({}))) as Any;
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => ({}))) as Any;
  const ACT = (CRM.activities ?? (await import("@/lib/modules/crm/activities" as string).catch(() => ({})))) as Any;
  const SEQ = (CRM.sequences ?? (await import("@/lib/modules/crm/sequences" as string).catch(() => ({})))) as Any;
  const BR = (await import("@/lib/platform/crm-bridges" as string).catch(() => ({}))) as Any;
  const OBX = (await import("@/lib/outbox-consumers" as string).catch(() => ({}))) as Any;
  const STO = (await import("@/lib/storage/service" as string)) as Any;
  const UIV = (await import("@/lib/modules/crm/ui-version" as string).catch(() => ({}))) as Any;
  const SET = (await import("@/lib/modules/crm/settings" as string).catch(() => ({}))) as Any;
  const FAC: Record<string, Any> = {};
  for (const [k, f] of Object.entries(FACADES)) FAC[k] = (await import(`@/${f.slice(4).replace(/\.ts$/, "")}` as string).catch(() => ({}))) as Any;
  const CONS: Any = OBX.consumers ?? {};
  const V1MSG: string = UIV.CRM_V2_DISABLED_MSG ?? "";

  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — structure
  // ═════════════════════════════════════════════════════════════════════════════
  out("── S0 · structure ──");
  const callsSrc = read(CALLS);
  const shSrc = read(CALLS_SH);
  const consSrc = read(CONS_FILE);
  const brSrc = read(BR_CHAT);
  const remSrc = read(REMIND);
  {
    const need = ["logCall", "attachRecording", "getRecording", "removeRecording", "callAiStatus", "transcribeCall", "pendingCallAiProposal",
      "acceptCallAiProposal", "rejectCallAiProposal", "scanBusinessCard", "acceptLeadProposal", "bookingLinkFor", "purgeRecordings"];
    const missing = need.filter((f) => typeof CL?.[f] !== "function");
    chk("C2.4-S0.1", `calls.ts exports the ${need.length} contract functions`, callsSrc.length > 0 && missing.length === 0, "all", `exists=${callsSrc.length > 0} missing=${missing.join(",") || "-"}`);
  }
  {
    const allowed = Object.keys(STO.ALLOWED_UPLOAD_TYPES ?? {});
    const rec: string[] = Array.isArray(CSH.CRM_RECORDING_MIME_ALLOWLIST) ? CSH.CRM_RECORDING_MIME_ALLOWLIST : [];
    const card: string[] = Array.isArray(CSH.CRM_CARD_MIME_ALLOWLIST) ? CSH.CRM_CARD_MIME_ALLOWLIST : [];
    const impure = /from\s+["'](@prisma\/client|@\/lib\/core\/db|next\/[^"']+|server-only|\.\/db|\.\/calls)["']/.test(shSrc);
    chk("C2.4-S0.2", "calls-shared.ts is pure · CRM_RECORDING_MAX_BYTES = 25 MB · CRM_RECORDING_MIME_ALLOWLIST ⊆ audio/* ∩ storage ALLOWED_UPLOAD_TYPES (non-empty, has audio/webm + audio/mp4) · CRM_CARD_MAX_BYTES = 5 MB · CRM_CARD_MIME_ALLOWLIST ⊆ image/* (no svg)",
      shSrc.length > 0 && !impure && CSH.CRM_RECORDING_MAX_BYTES === 25 * MB && rec.length > 0 && rec.every((m) => m.startsWith("audio/") && allowed.includes(m)) &&
        rec.includes("audio/webm") && rec.includes("audio/mp4") && CSH.CRM_CARD_MAX_BYTES === 5 * MB && card.length > 0 && card.every((m) => m.startsWith("image/") && !/svg/.test(m)),
      "constants", `pure=${shSrc.length > 0 && !impure} rec=${CSH.CRM_RECORDING_MAX_BYTES} [${rec.join(",")}] card=${CSH.CRM_CARD_MAX_BYTES} [${card.join(",")}]`);
  }
  chk("C2.4-S0.3", "facades: crm/index.ts `export * as calls` (same bindings as calls.ts) · crm-bridges/index.ts exports onChatConversationStatus",
    /export\s+\*\s+as\s+calls\s+from\s+["']\.\/calls["']/.test(read(CRM_INDEX)) && typeof CRM?.calls?.logCall === "function" && CRM.calls.logCall === CL.logCall && typeof BR?.onChatConversationStatus === "function" && /onChatConversationStatus/.test(read(BR_INDEX)),
    "exported", `crm.calls=${typeof CRM?.calls?.logCall} same=${CRM?.calls?.logCall === CL.logCall} bridge=${typeof BR?.onChatConversationStatus}`);
  chk("C2.4-S0.4", "outbox-consumers.ts: a `// CRM C2.4 ▸ … ◂` block wires \"chat.conversation.status\" through compose(…, crmBridge(\"onChatConversationStatus\")) and the consumer map still has it [static]",
    /CRM C2\.4 ▸/.test(consSrc) && /"chat\.conversation\.status"\s*:\s*withAutomation\(\s*compose\([\s\S]{0,200}crmBridge\(\s*"onChatConversationStatus"\s*\)/.test(consSrc) && typeof CONS["chat.conversation.status"] === "function",
    "wired", `block=${/CRM C2\.4 ▸/.test(consSrc)} compose=${/crmBridge\(\s*"onChatConversationStatus"\s*\)/.test(consSrc)}`);
  {
    const s0 = SET.parseCrmSettings?.({}) ?? CRM.parseCrmSettings?.({});
    const s1 = SET.parseCrmSettings?.({ crm: { ai: { callTranscribe: true, chatSummary: true } } });
    chk("C2.4-S0.5", "R-E.15: parseCrmSettings surfaces ai.callTranscribe = false and ai.chatSummary = false by default · true when set",
      s0?.ai?.callTranscribe === false && s0?.ai?.chatSummary === false && s1?.ai?.callTranscribe === true && s1?.ai?.chatSummary === true,
      "false/false → true/true", `default=${j(s0?.ai)} set=${j(s1?.ai)}`);
  }
  {
    const src = [callsSrc, brSrc, remSrc].join("\n");
    const miss = ["X1", "X2", "X3", "X4", "X5", "X6", "X8", "X9", "X10"].filter((x) => !new RegExp(`AUDIT-CLASS ${x}\\b`).test(src));
    chk("C2.4-S0.6", "implementation sites marked `// AUDIT-CLASS X1 X2 X3 X4 X5 X6 X8 X9 X10` across calls.ts · crm-bridges/chat.ts · reminders.ts [static]", miss.length === 0, "9 markers", miss.join(",") || "-", "MINOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — call-log modal · tel: (static)
  // ═════════════════════════════════════════════════════════════════════════════
  out("── S1 · call-log modal (static) ──");
  const modalSrc = read(MODAL);
  const telSrc = read(TEL);
  const callUi = walk(CALL_UI_DIR).map(read).join("\n");
  const MODAL_TIDS = ["crm-call-log-modal", "crm-call-outcome", "crm-call-duration", "crm-call-direction", "crm-call-note", "crm-call-next-task",
    "crm-call-recording-input", "crm-call-ai-transcribe", "crm-call-save", "crm-call-cancel"];
  const badClientImport = (s: string) => /from\s+["'](@\/lib\/core\/db|@prisma\/client|@\/lib\/modules\/crm\/(calls|activities|files|transcriber|reminders|call-provider|db)|@\/lib\/modules\/crm|@\/lib\/ai\/[a-z-]+)["']/.test(s);
  {
    const miss = MODAL_TIDS.filter((t) => !callUi.includes(`"${t}"`) && !callUi.includes(`'${t}'`));
    chk("C2.4-S1.1", `CrmCallLogModal.tsx is 'use client', reaches no prisma-side module (only *-shared / *-actions), and carries the ${MODAL_TIDS.length} modal testids`,
      /^\s*["']use client["']/.test(modalSrc) && !badClientImport(modalSrc) && miss.length === 0, "client + testids",
      `exists=${modalSrc.length > 0} client=${/^\s*["']use client["']/.test(modalSrc)} badImport=${badClientImport(modalSrc)} missing=${miss.join(",") || "-"}`);
  }
  {
    const users = [...walk(`${CRM_PAGES}/contacts`), ...walk(`${CRM_PAGES}/deals`), ...walk("src/components/crm")].filter((f) => !f.startsWith(CALL_UI_DIR) && /CrmClickToCall/.test(read(f)));
    const contactUse = users.some((f) => /contacts|contact/i.test(f));
    const dealUse = users.some((f) => /deals|deal/i.test(f));
    chk("C2.4-S1.2", "click-to-call: CrmClickToCall.tsx ('use client') renders an <a href={`tel:…`} data-testid=\"crm-call-tel\"> that also opens CrmCallLogModal · used on contact 360 AND deal 360",
      /^\s*["']use client["']/.test(telSrc) && /tel:/.test(telSrc) && /crm-call-tel/.test(telSrc) && /CrmCallLogModal/.test(telSrc) && contactUse && dealUse, "tel + modal on both 360s",
      `exists=${telSrc.length > 0} tel=${/tel:/.test(telSrc)} opensModal=${/CrmCallLogModal/.test(telSrc)} users=${users.join(",") || "-"}`);
  }
  {
    const act = read(CALLS_ACT);
    const names = ["logCallAction", "transcribeCallAction", "acceptCallAiAction", "rejectCallAiAction", "removeRecordingAction", "scanBusinessCardAction", "acceptLeadProposalAction"];
    const missing = names.filter((n) => !new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(act));
    const badExports = /export\s+(type|interface|const|let|class|function\s)/.test(act);
    const outcomes = /outcomeOptions|outcomesOf|ACTIVITY_OUTCOMES_DEFAULT/.test(callUi + act);
    chk("C2.4-S1.3", "calls-actions.ts is \"use server\", exports only async functions (7 names), calls assertCrmV2 + a crm key check; outcome chips come from the C1.6 outcome registry (outcomeOptions/outcomesOf), not a hard-coded list",
      /^\s*["']use server["']/.test(act) && missing.length === 0 && !badExports && /assertCrmV2/.test(act) && /assertCanCrm|crmCan/.test(act) && outcomes, "actions ok",
      `exists=${act.length > 0} missing=${missing.join(",") || "-"} badExports=${badExports} v2=${/assertCrmV2/.test(act)} outcomes=${outcomes}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — throwaway tenants: A (2 CRM + chat + booking/clinic/school units, credit) · B (foreign) · N (no credit) · V (uiVersion 1)
  // ═════════════════════════════════════════════════════════════════════════════
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const mkUser = async (suffix: string) => {
    const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix || "owner"} ${TAG}` } });
    USERS.push(u.id);
    return u.id as string;
  };
  const userA = await mkUser("");
  const userM = await mkUser("-mgr");
  const userS = await mkUser("-staff");
  const userR = await mkUser("-nocreate");
  const userX = await mkUser("-outsider");
  const STAFF_PERMS = { "crm.contact.read": true, "crm.deal.read": true, "crm.activity.read": true, "crm.activity.create": true, "crm.contact.create": true };
  const mkTenant = async (suffix: string) => {
    const t = await P.tenant.create({ data: { name: `${TAG}-${suffix}`, slug: `${TAG}-${suffix}` } });
    TENANTS.push(t.id);
    const m = (userId: string, role: string, permissions: Record<string, unknown>) =>
      P.membership.create({ data: { userId, tenantId: t.id, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } });
    await m(userA, "OWNER", {});
    await m(userM, "MANAGER", {});
    await m(userS, "STAFF", STAFF_PERMS);
    await m(userR, "STAFF", { "crm.contact.read": true });
    await m(userX, "STAFF", { "crm.contact.read": true, "crm.activity.read": true, "crm.activity.create": true });
    return t.id as string;
  };
  const mk = async (tid: string, type: string, label: string) => (await sysSvc.createSystem(tid, type, `${label} ${TAG}`)).id as string;
  const setCrm = (sysId: string, obj: Record<string, unknown>) =>
    P.$executeRawUnsafe(
      `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
        (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
      JSON.stringify(obj), sysId);
  const owner = { userId: userA, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> };
  const manager = { userId: userM, role: "MANAGER", unitAccess: ["*"] as string[], permissions: {} as Record<string, unknown> };
  const staff = { userId: userS, role: "STAFF", unitAccess: ["*"] as string[], permissions: STAFF_PERMS as Record<string, unknown> };
  const noCreate = { userId: userR, role: "STAFF", unitAccess: ["*"] as string[], permissions: { "crm.contact.read": true } as Record<string, unknown> };
  const outsider = { userId: userX, role: "STAFF", unitAccess: ["*"] as string[], permissions: { "crm.contact.read": true, "crm.activity.read": true, "crm.activity.create": true } as Record<string, unknown> };
  const apiRead = { userId: userA, role: "STAFF", unitAccess: ["*"] as string[], permissions: { "crm.contact.read": true, "crm.activity.read": true } as Record<string, unknown>, apiRole: "READONLY" };
  const apiNone = { userId: userA, role: "STAFF", unitAccess: ["*"] as string[], permissions: { "member.read": true } as Record<string, unknown>, apiRole: "READONLY" };

  const tidA = await mkTenant("a");
  const crmA = await mk(tidA, "CRM", "CRM");
  const crmA2 = await mk(tidA, "CRM", "CRM สอง");
  const chatA = await mk(tidA, "CHAT", "แชท");
  const tidB = await mkTenant("b");
  const crmB = await mk(tidB, "CRM", "CRM-B");
  const tidN = await mkTenant("n");
  const crmN = await mk(tidN, "CRM", "CRM-N");
  const tidV = await mkTenant("v1");
  const crmV = await mk(tidV, "CRM", "CRM-V1");
  const chatV = await mk(tidV, "CHAT", "แชท-V1");
  // crmA must be the FIRST CRM system of tenant A (crmGates order: createdAt asc, id asc)
  {
    const a = await P.appSystem.findFirst({ where: { id: crmA } });
    await P.appSystem.update({ where: { id: crmA2 }, data: { createdAt: new Date(new Date(a.createdAt).getTime() + 1000) } });
  }
  for (const s of [crmA, crmA2, crmB, crmN, crmV]) await setCrm(s, { uiVersion: 2, bridgesEnabled: true });
  await setCrm(crmA, { ai: { callTranscribe: true, chatSummary: false } });
  await setCrm(crmA2, { ai: { callTranscribe: false, chatSummary: false } });
  await setCrm(crmN, { ai: { callTranscribe: true, chatSummary: true } });
  await setCrm(crmV, { ai: { callTranscribe: true, chatSummary: false } });
  const cA = { tenantId: tidA, systemId: crmA, actorUserId: userA };
  const cA2 = { tenantId: tidA, systemId: crmA2, actorUserId: userA };
  const cB = { tenantId: tidB, systemId: crmB, actorUserId: userA };
  const cN = { tenantId: tidN, systemId: crmN, actorUserId: userA };
  const cV = { tenantId: tidV, systemId: crmV, actorUserId: userA };
  const cAs = { ...cA, actorUserId: userS };
  const wallet = (tid: string, micro: number) =>
    P.aiCreditWallet.upsert({ where: { tenantId: tid }, create: { tenantId: tid, balanceMicro: micro, grantedAt: new Date() }, update: { balanceMicro: micro, grantedAt: new Date() } });
  await wallet(tidA, 5_000_000);
  await wallet(tidB, 5_000_000);
  await wallet(tidN, 0);
  await wallet(tidV, 5_000_000);

  const mkUnit = async (tid: string, type: string, label: string) =>
    (await P.businessUnit.create({ data: { tenantId: tid, type, name: `${label} ${TAG}`, slug: `${TAG}-${type.toLowerCase()}-${nx()}` } })) as Any;
  const uBook = await mkUnit(tidA, "BOOKING", "จองคิว");
  const uClinic = await mkUnit(tidA, "CLINIC", "คลินิก");
  const uSchool = await mkUnit(tidA, "SCHOOL", "โรงเรียน");
  const uBookB = await mkUnit(tidB, "BOOKING", "จองคิว-B");
  const uBookV = await mkUnit(tidV, "BOOKING", "จองคิว-V");

  const mkParty = async (tid: string, name: string) => (await P.party.create({ data: { tenantId: tid, name, kind: "PERSON" } })).id as string;
  type Ct = { id: string; partyId: string; phone: string; email: string; name: string };
  const rawContact = async (tid: string, sys: string, label: string, ownerUserId: string, partyId?: string): Promise<Ct> => {
    const name = pii(`${label} ${TAG}-${nx()}`);
    const phone = phoneOf();
    const email = mailOf(`c${nx()}`);
    const pid = partyId ?? (await mkParty(tid, name));
    const row = await P.crmContact.create({ data: { tenantId: tid, systemId: sys, name, firstName: name, phone, email, partyId: pid, ownerUserId } });
    return { id: row.id as string, partyId: pid, phone, email, name };
  };
  const ctMain = await rawContact(tidA, crmA, "ลูกค้าโทร", userA);
  const ctStaff = await rawContact(tidA, crmA, "ลูกค้าพนักงาน", userS);
  const ctOther = await rawContact(tidA, crmA, "ลูกค้าผู้จัดการ", userM);
  const ctR = await rawContact(tidA, crmA, "ลูกค้าไม่มีคีย์", userR);
  const ctChat = await rawContact(tidA, crmA, "ลูกค้าแชท", userA);
  const ctChat2 = await rawContact(tidA, crmA, "ลูกค้าแชทสรุป", userA);
  const pBoth = await mkParty(tidA, pii(`สองระบบ ${TAG}`));
  const ctBoth1 = await rawContact(tidA, crmA, "สองระบบ-1", userA, pBoth);
  const ctBoth2 = await rawContact(tidA, crmA2, "สองระบบ-2", userA, pBoth);
  const ctOnly2 = await rawContact(tidA, crmA2, "ระบบสองเท่านั้น", userA);
  const ctA2call = await rawContact(tidA, crmA2, "ระบบสองโทร", userA);
  const ctB = await rawContact(tidB, crmB, "ลูกค้า-B", userA);
  const ctN = await rawContact(tidN, crmN, "ลูกค้า-N", userA);
  const ctV = await rawContact(tidV, crmV, "ลูกค้า-V1", userA);
  const pNoContact = await mkParty(tidA, pii(`ไม่มีผู้ติดต่อ ${TAG}`));
  void ctBoth1; void ctBoth2;

  // storage fakes
  const PUTS: string[] = [];
  const DELS: string[] = [];
  const storeDeps = { put: async (path: string) => { PUTS.push(path); }, del: async (path: string) => { DELS.push(path); return 200; } };
  const audio = (bytes: number) => new Uint8Array(bytes).fill(7);
  const rec = (bytes = 64 * 1024, contentType = "audio/mp4", filename = "call-0912.m4a") => ({ filename, contentType, data: audio(bytes) });
  // AI + transcriber fakes (every call recorded)
  type AiCall = { tag: string; text: string; images: string[] };
  const AI_CALLS: AiCall[] = [];
  const fakeAi = (tag: string, reply: string) => ({
    chat: async (messages: Any[]) => {
      AI_CALLS.push({ tag, text: j(messages), images: (messages ?? []).flatMap((m: Any) => (Array.isArray(m?.imageUrls) ? m.imageUrls : [])) });
      return { text: reply, tokensIn: 1200, tokensOut: 300, model: "anthropic/claude-haiku-4.5" };
    },
  });
  const TR_CALLS: string[] = [];
  const PHONE_T = phoneOf();
  const EMAIL_T = mailOf("transcript");
  const TRANSCRIPT = `ลูกค้า${MARK_T} สนใจแพ็กเกจ 25 คน โทรกลับ ${fmtPhone(PHONE_T)} หรือ ${PHONE_T} อีเมล ${EMAIL_T}`;
  const fakeTr = (delayMs = 0, text = TRANSCRIPT) => ({
    key: "qc-fake",
    transcribe: async (input: Any) => { TR_CALLS.push(String(input?.activityId ?? "")); if (delayMs) await sleep(delayMs); return { text, language: "th" }; },
  });
  const AI_JSON = JSON.stringify({ summary: MARK_S, nextStep: MARK_N });
  const trDeps = (delay = 0) => ({ transcriber: fakeTr(delay), ai: fakeAi("transcribe", AI_JSON) });

  const idOf = (v: Any): string => {
    const x = typeof v === "string" ? v : (v?.activity?.id ?? v?.id ?? v?.activityId ?? "");
    return typeof x === "string" && x ? x : NONE;
  };
  const actRow = async (id: string) => (id && id !== NONE ? ((await P.crmActivity.findFirst({ where: { id } })) as Any) : null);
  const logCall = (c: Any, who: Any, input: Record<string, Any>) => call(CL.logCall, c, who, input, storeDeps);
  /** a CALL with a recording through the service (S-checks judge the service; fixture only needs the id) */
  const mkCall = async (c: Any, contactId: string, withRecording = true, who: Any = owner) => {
    const r = await logCall(c, who, { contactId, direction: "OUT", outcome: "สนใจ", durationSec: 272, body: `โน้ต ${TAG}`, ...(withRecording ? { recording: rec() } : {}) });
    return { r, id: idOf(r.v) };
  };
  const proposalsOf = async (tid: string, activityId: string) =>
    ((await P.aiProposal.findMany({ where: { tenantId: tid, kind: "crm.activity.ai_fill" } })) as Any[]).filter((p) => p?.payload?.activityId === activityId);
  const usageFor = async (tid: string, note: string) => ((await P.aiCreditTxn.findMany({ where: { tenantId: tid, kind: "USAGE" } })) as Any[]).filter((t) => String(t.note ?? "") === note || String(t.note ?? "").startsWith(note));
  const balance = async (tid: string) => Number((await P.aiCreditWallet.findFirst({ where: { tenantId: tid } }))?.balanceMicro ?? 0);
  const evtOf = (row: Any) => ({ id: row.id, tenantId: row.tenantId, type: row.type, payload: row.payload, systemId: row.systemId, unitId: row.unitId, idempotencyKey: row.idempotencyKey });
  const consume = (evt: Any) => call(CONS?.[evt?.type], evt);
  /** our own drain of OUR tenants only: PENDING rows → consumer → DONE */
  const pump = async (tids: string[], rounds = 20) => {
    for (let i = 0; i < rounds; i += 1) {
      const rows = (await P.outboxEvent.findMany({ where: { tenantId: { in: tids }, status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 200 })) as Any[];
      if (rows.length === 0) return true;
      for (const row of rows) {
        await consume(evtOf(row));
        await P.outboxEvent.update({ where: { id: row.id }, data: { status: "DONE", processedAt: new Date() } }).catch(() => null);
      }
    }
    return false;
  };
  const chatEvt = (tid: string, chatSys: string, type: string, payload: Record<string, unknown>, key?: string) => {
    const n = nx();
    return { id: `${TAG}-ev-${n}`, tenantId: tid, type, payload, systemId: chatSys, unitId: null, idempotencyKey: key ?? `${type}#${TAG}#${n}` };
  };
  const mkConv = async (tid: string, chatSys: string, partyId: string | null) => {
    const phone = phoneOf();
    const email = mailOf(`chat${nx()}`);
    const cc = await P.chatContact.create({ data: { tenantId: tid, systemId: chatSys, channel: "LINE", externalUserId: `${TAG}-x-${nx()}`, displayName: pii(`ลูกค้าแชท ${TAG}-${nx()}`), partyId, phone, email } });
    const conv = await P.chatConversation.create({ data: { tenantId: tid, systemId: chatSys, channel: "LINE", contactId: cc.id, status: "OPEN", firstCustomerMessageAt: new Date(Date.now() - 30 * 60_000) } });
    await P.chatMessage.create({ data: { tenantId: tid, systemId: chatSys, conversationId: conv.id, direction: "IN", body: `สวัสดีค่ะ ${MARK_C} โทร ${fmtPhone(phone)} อีเมล ${email}` } });
    await P.chatMessage.create({ data: { tenantId: tid, systemId: chatSys, conversationId: conv.id, direction: "OUT", body: "ได้เลยค่ะ เดี๋ยวส่งรายละเอียดให้" } });
    return { id: conv.id as string, phone, email };
  };
  const resolveConv = (id: string) => P.chatConversation.update({ where: { id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
  const statusEvt = (tid: string, chatSys: string, convId: string, status: string) => chatEvt(tid, chatSys, "chat.conversation.status", { conversationId: convId, status, externalUserId: `${TAG}-ext` }, `chat.status.${TAG}-${nx()}`);
  const chatActs = async (convId: string) => (await P.crmActivity.findMany({ where: { sourceRef: convId } })) as Any[];
  const loggedEvents = async (tid: string, activityId: string) =>
    ((await P.outboxEvent.findMany({ where: { tenantId: tid, type: "crm.activity.logged" } })) as Any[]).filter((e) => j(e.payload).includes(activityId));

  // ═════════════════════════════════════════════════════════════════════════════
  // S8.1/S8.2 — logCall round trip (fixture for S2 / X10 as well)
  // ═════════════════════════════════════════════════════════════════════════════
  out("── S8 · call logging ──");
  const t0 = Date.now();
  const due = new Date(Date.now() + 3 * DAY);
  const r1 = await logCall(cA, owner, {
    contactId: ctMain.id, direction: "OUT", outcome: "สนใจ", durationSec: 272, startAt: new Date(t0 - 10 * 60_000), body: `สนใจแพ็กเกจกรุ๊ป ${TAG}`,
    nextTask: { title: `ส่งใบเสนอราคา ${TAG}`, dueAt: due }, recording: rec(64 * 1024, "audio/mp4", "call-0912-0942.m4a"),
  });
  const callId = idOf(r1.v);
  const callRow = await actRow(callId);
  const nextTaskId = String(r1.v?.nextTaskId ?? "");
  const nextRow = nextTaskId ? await actRow(nextTaskId) : null;
  const recDto = r1.v?.recording ?? null;
  const ctMainRow = await P.crmContact.findFirst({ where: { id: ctMain.id } });
  chk("C2.4-S8.1", "logCall: ONE CALL activity (direction OUT · outcome สนใจ · durationSec 272 · body · startAt · owner = actor) + recordingFileId set + next TASK linked to the same contact (dueAt) + recording DTO returned + contact.lastActivityAt = the call time",
    r1.ok && !!callRow && callRow.type === "CALL" && callRow.direction === "OUT" && callRow.outcome === "สนใจ" && callRow.durationSec === 272 && !!callRow.recordingFileId &&
      callRow.ownerUserId === userA && !!nextRow && nextRow.type === "TASK" && nextRow.contactId === ctMain.id && Math.abs(new Date(nextRow.dueAt).getTime() - due.getTime()) < 1000 &&
      !!recDto && !!ctMainRow?.lastActivityAt && Math.abs(new Date(ctMainRow.lastActivityAt).getTime() - (t0 - 10 * 60_000)) < 2000,
    "call + recording + task", `r=${rd(r1)} row=${cut(j(callRow && { type: callRow.type, dir: callRow.direction, out: callRow.outcome, dur: callRow.durationSec, rec: !!callRow.recordingFileId }), 160)} next=${nextRow?.type ?? "-"} dto=${!!recDto}`);
  {
    const before = await P.crmActivity.count({ where: { tenantId: tidA } });
    const puts0 = PUTS.length;
    const bad1 = await logCall(cA, owner, { contactId: ctMain.id, direction: "OUT", outcome: "เลื่อน" }); // MEETING outcome
    const bad2 = await logCall(cA, owner, { contactId: ctMain.id, direction: "SIDEWAYS", outcome: "สนใจ" });
    const bad3 = await logCall(cA, owner, { contactId: ctMain.id, direction: "OUT", outcome: "สนใจ", recording: rec(1024, "image/png", "x.png") });
    const after = await P.crmActivity.count({ where: { tenantId: tidA } });
    chk("C2.4-S8.2", "logCall validation: an outcome outside the CALL registry · an unknown direction · a non-audio recording ⇒ VALIDATION (Thai, not blaming) each — no activity, no put",
      refused(bad1, "VALIDATION") && refused(bad2, "VALIDATION") && refused(bad3, "VALIDATION") && after === before && PUTS.length === puts0,
      "3 × VALIDATION, nothing written", `${rd(bad1)} | ${rd(bad2)} | ${rd(bad3)} rows+${after - before} puts+${PUTS.length - puts0}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — transcription → proposal (fake transcriber + fake AI · credit)
  // ═════════════════════════════════════════════════════════════════════════════
  out("── S2 · transcription → proposal ──");
  const bal0 = await balance(tidA);
  const tr1 = await call(CL.transcribeCall, cA, owner, callId, trDeps());
  const props1 = await proposalsOf(tidA, callId);
  const pend = await call(CL.pendingCallAiProposal, cA, owner, callId);
  const rowAfterTr = await actRow(callId);
  const propId = String(tr1.v?.proposalId ?? props1[0]?.id ?? NONE);
  chk("C2.4-S2.1", "transcribeCall ⇒ ONE PENDING AiProposal kind crm.activity.ai_fill whose payload = { activityId, systemId, transcript (fake STT text), aiSummary, aiNextStep (fake AI JSON) } · pendingCallAiProposal returns the same 3 values · the activity's transcript/aiSummary/aiNextStep are STILL NULL (never auto-written)",
    tr1.ok && props1.length === 1 && props1[0].status === "PENDING" && props1[0].payload?.systemId === crmA && props1[0].payload?.transcript === TRANSCRIPT &&
      props1[0].payload?.aiSummary === MARK_S && props1[0].payload?.aiNextStep === MARK_N && pend.ok && pend.v?.aiSummary === MARK_S && pend.v?.aiNextStep === MARK_N &&
      pend.v?.transcript === TRANSCRIPT && !!rowAfterTr && rowAfterTr.transcript === null && rowAfterTr.aiSummary === null && rowAfterTr.aiNextStep === null,
    "1 PENDING proposal · fields untouched", `tr=${rd(tr1)} props=${props1.length} status=${props1[0]?.status ?? "-"} pend=${rd(pend)} row=${cut(j(rowAfterTr && [rowAfterTr.transcript, rowAfterTr.aiSummary, rowAfterTr.aiNextStep]), 120)}`);
  const acc1 = await call(CL.acceptCallAiProposal, cA, owner, propId);
  const rowAcc = await actRow(callId);
  const propAfter = await P.aiProposal.findFirst({ where: { id: propId } });
  const audAcc = (await P.auditLog.findMany({ where: { tenantId: tidA, targetId: callId } })) as Any[];
  chk("C2.4-S2.2", "acceptCallAiProposal ⇒ the activity now holds transcript/aiSummary/aiNextStep = the proposal · proposal EXECUTED · audit crm.activity.ai_accept (targetId = activity)",
    acc1.ok && rowAcc?.transcript === TRANSCRIPT && rowAcc?.aiSummary === MARK_S && rowAcc?.aiNextStep === MARK_N && propAfter?.status === "EXECUTED" && audAcc.some((a) => a.action === "crm.activity.ai_accept"),
    "fields filled · EXECUTED · audited", `acc=${rd(acc1)} fields=${cut(j(rowAcc && [rowAcc.aiSummary, rowAcc.aiNextStep]), 80)} status=${propAfter?.status ?? "-"} audits=${audAcc.map((a) => a.action).join(",") || "-"}`);
  {
    const txns = await usageFor(tidA, `crm.call.transcribe#${callId}`);
    const bal1 = await balance(tidA);
    const noPii = txns.every((t) => !PII.some((p) => j(t).includes(p)));
    // ORACLE-EDIT C2.4-S2.3 (controller · 24 Sep): ruling R2 REPLACED — CRM AI is charged under source `CRM_ASSIST` (added by C2.0),
    //   not MEMBER_ASSIST; the oracle must assert the source, otherwise a charge under any source passes.
    const srcOk = txns.every((t) => String(t.source ?? "") === "CRM_ASSIST");
    chk("C2.4-S2.3", "AI credit: exactly ONE AiCreditTxn USAGE with note `crm.call.transcribe#<activityId>` (amount < 0, ids only) · source = CRM_ASSIST (controller ruling R2, C2.0 enum) · and the wallet went down by that amount",
      txns.length === 1 && Number(txns[0].amountMicro) < 0 && bal0 - bal1 === -Number(txns[0].amountMicro) && noPii && srcOk, "1 charge · source CRM_ASSIST",
      `txns=${txns.length} amount=${txns[0]?.amountMicro ?? "-"} source=${txns[0]?.source ?? "-"} Δwallet=${bal0 - bal1} noPii=${noPii}`);
  }
  // refusal fixtures: N (no credit, setting on) · A2 (setting off) · A with no transcriber
  const callN = await mkCall(cN, ctN.id);
  const callA2 = await mkCall(cA2, ctA2call.id);
  const callNoTr = await mkCall(cA, ctMain.id);
  {
    const tr0 = TR_CALLS.length;
    const ai0 = AI_CALLS.length;
    const nN = await call(CL.transcribeCall, cN, owner, callN.id, trDeps());
    const nOff = await call(CL.transcribeCall, cA2, owner, callA2.id, trDeps());
    const nCfg = await call(CL.transcribeCall, cA, owner, callNoTr.id, { ai: fakeAi("transcribe", AI_JSON) });
    const props = [...(await proposalsOf(tidN, callN.id)), ...(await proposalsOf(tidA, callA2.id)), ...(await proposalsOf(tidA, callNoTr.id))];
    const charges = [...(await usageFor(tidN, "crm.call")), ...(await usageFor(tidA, `crm.call.transcribe#${callA2.id}`)), ...(await usageFor(tidA, `crm.call.transcribe#${callNoTr.id}`))];
    chk("C2.4-S2.4", "refusals call NOTHING: tenant without credit ⇒ NO_CREDIT · settings.crm.ai.callTranscribe off ⇒ AI_DISABLED · no transcriber configured ⇒ NOT_CONFIGURED with \"ยังไม่ได้เชื่อมบริการถอดเสียง\" — transcriber and AI never called, no proposal, no charge (positive control = S2.1)",
      refused(nN, "NO_CREDIT") && refused(nOff, "AI_DISABLED") && refused(nCfg, "NOT_CONFIGURED") && /ยังไม่ได้เชื่อมบริการถอดเสียง/.test(nCfg.msg) &&
        TR_CALLS.length === tr0 && AI_CALLS.length === ai0 && props.length === 0 && charges.length === 0,
      "3 refusals · 0 calls", `noCredit=${rd(nN)} | off=${rd(nOff)} | cfg=${rd(nCfg)} | tr+${TR_CALLS.length - tr0} ai+${AI_CALLS.length - ai0} props=${props.length} charges=${charges.length}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S8.3–S8.5 — transcription edges · status · reject/edit
  // ═════════════════════════════════════════════════════════════════════════════
  {
    const noRec = await mkCall(cA, ctMain.id, false);
    const note = await call(ACT.logActivity, cA, owner, { type: "NOTE", title: `โน้ต ${TAG}`, contactId: ctMain.id });
    const noteId = idOf(note.v);
    const a = await call(CL.transcribeCall, cA, owner, noRec.id, trDeps());
    const b = await call(CL.transcribeCall, cA, owner, noteId, trDeps());
    chk("C2.4-S8.3", "transcribeCall on a CALL without a recording, or on a non-CALL activity ⇒ VALIDATION (Thai) — nothing called",
      refused(a, "VALIDATION") && refused(b, "VALIDATION") && (await proposalsOf(tidA, noRec.id)).length === 0, "2 × VALIDATION", `${rd(a)} | ${rd(b)}`, "MAJOR");
  }
  {
    const off = await call(CL.callAiStatus, cA2, owner, {});
    const noProv = await call(CL.callAiStatus, cA, owner, {});
    const noCred = await call(CL.callAiStatus, cN, owner, { transcriber: fakeTr() });
    const ready = await call(CL.callAiStatus, cA, owner, { transcriber: fakeTr() });
    chk("C2.4-S8.4", "callAiStatus: OFF (setting off) · NO_PROVIDER with the calm Thai \"ยังไม่ได้เชื่อมบริการถอดเสียง\" · NO_CREDIT · READY — each with a Thai message",
      off.v?.state === "OFF" && noProv.v?.state === "NO_PROVIDER" && /ยังไม่ได้เชื่อมบริการถอดเสียง/.test(String(noProv.v?.message ?? "")) && noCred.v?.state === "NO_CREDIT" &&
        ready.v?.state === "READY" && [off, noProv, noCred, ready].every((r) => thai(r.v?.message)),
      "OFF/NO_PROVIDER/NO_CREDIT/READY", `${off.v?.state ?? rd(off)} ${noProv.v?.state ?? rd(noProv)} ${noCred.v?.state ?? rd(noCred)} ${ready.v?.state ?? rd(ready)}`, "MAJOR");
  }
  {
    const cR1 = await mkCall(cA, ctMain.id);
    await call(CL.transcribeCall, cA, owner, cR1.id, trDeps());
    const pR = (await proposalsOf(tidA, cR1.id))[0];
    const rej = await call(CL.rejectCallAiProposal, cA, owner, pR?.id ?? NONE);
    const rowR = await actRow(cR1.id);
    const pR2 = pR ? await P.aiProposal.findFirst({ where: { id: pR.id } }) : null;
    const cE1 = await mkCall(cA, ctMain.id);
    await call(CL.transcribeCall, cA, owner, cE1.id, trDeps());
    const pE = (await proposalsOf(tidA, cE1.id))[0];
    const accE = await call(CL.acceptCallAiProposal, cA, owner, pE?.id ?? NONE, { aiNextStep: `แก้โดยพนักงาน ${TAG}` });
    const rowE = await actRow(cE1.id);
    chk("C2.4-S8.5", "rejectCallAiProposal ⇒ REJECTED and the activity fields stay NULL · accept with edits ⇒ the edited aiNextStep wins, the other two come from the proposal",
      rej.ok && pR2?.status === "REJECTED" && rowR?.aiSummary === null && rowR?.transcript === null && accE.ok && rowE?.aiNextStep === `แก้โดยพนักงาน ${TAG}` && rowE?.aiSummary === MARK_S,
      "reject + edit", `rej=${rd(rej)} status=${pR2?.status ?? "-"} acc=${rd(accE)} next=${cut(rowE?.aiNextStep, 40)}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — chat RESOLVED → one CHAT activity per conversation
  // ═════════════════════════════════════════════════════════════════════════════
  out("── S3 · chat RESOLVED → activity ──");
  const conv1 = await mkConv(tidA, chatA, ctChat.partyId);
  await resolveConv(conv1.id);
  const e1 = statusEvt(tidA, chatA, conv1.id, "RESOLVED");
  const s31 = await consume(e1);
  const acts1 = await chatActs(conv1.id);
  const a1 = acts1[0] ?? null;
  chk("C2.4-S3.1", "chat.conversation.status RESOLVED through the consumer map ⇒ exactly ONE CrmActivity in the first CRM system: type CHAT · source CHAT · sourceRef = conversationId · contactId = the Party's contact · doneAt set",
    s31.ok && acts1.length === 1 && a1.systemId === crmA && a1.type === "CHAT" && a1.source === "CHAT" && a1.contactId === ctChat.id && !!a1.doneAt,
    "1 CHAT activity", `consumer=${rd(s31)} n=${acts1.length} ${cut(j(a1 && { sys: a1.systemId === crmA, type: a1.type, src: a1.source, contact: a1.contactId === ctChat.id, done: !!a1.doneAt }), 140)}`);
  {
    const conv2 = await mkConv(tidA, chatA, ctChat.partyId);
    const o = await consume(statusEvt(tidA, chatA, conv2.id, "OPEN"));
    const p = await consume(statusEvt(tidA, chatA, conv2.id, "PENDING"));
    const conv3 = await mkConv(tidA, chatA, pNoContact);
    await resolveConv(conv3.id);
    const n0 = await P.crmContact.count({ where: { tenantId: tidA } });
    const q = await consume(statusEvt(tidA, chatA, conv3.id, "RESOLVED"));
    const conv4 = await mkConv(tidA, chatA, null);
    await resolveConv(conv4.id);
    const w = await consume(statusEvt(tidA, chatA, conv4.id, "RESOLVED"));
    const n1 = await P.crmContact.count({ where: { tenantId: tidA } });
    chk("C2.4-S3.2", "no activity for status OPEN / PENDING · none for a RESOLVED room whose Party has no contact, nor for a room without a Party — and no lead is created (chatToLead off) · consumers never fail",
      o.ok && p.ok && q.ok && w.ok && (await chatActs(conv2.id)).length === 0 && (await chatActs(conv3.id)).length === 0 && (await chatActs(conv4.id)).length === 0 && n1 === n0,
      "0 activities · 0 contacts", `ok=${[o, p, q, w].map((r) => (r.ok ? "y" : r.err)).join("/")} acts=${(await chatActs(conv2.id)).length}/${(await chatActs(conv3.id)).length}/${(await chatActs(conv4.id)).length} contacts+${n1 - n0}`);
  }
  {
    const evs = a1 ? await loggedEvents(tidA, a1.id) : [];
    const leak = evs.some((e) => PII.some((p) => j(e.payload).includes(p)) || j(e.payload).includes(MARK_C));
    const titleLeak = !!a1 && [conv1.phone, conv1.email, ctChat.name, ctChat.phone].some((p) => String(a1.title ?? "").includes(p));
    chk("C2.4-S3.3", "the CHAT activity has a Thai title without name/phone/e-mail/message text · exactly ONE crm.activity.logged for it, payload ids only",
      !!a1 && thai(a1.title) && !titleLeak && !String(a1.title ?? "").includes(MARK_C) && evs.length === 1 && !leak, "clean title · 1 event",
      `title=${cut(a1?.title, 60)} leak=${titleLeak} events=${evs.length} payloadLeak=${leak}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S8.6–S8.9 — chat message (lastActivityAt · sequence stop) · chat AI summary
  // ═════════════════════════════════════════════════════════════════════════════
  const convMsg = await mkConv(tidA, chatA, ctChat.partyId);
  {
    await P.crmContact.update({ where: { id: ctChat.id }, data: { lastActivityAt: new Date(Date.now() - 5 * DAY) } });
    const actsBefore = await P.crmActivity.count({ where: { contactId: ctChat.id } });
    const t1 = Date.now();
    const m = await consume(chatEvt(tidA, chatA, "chat.message.received", { conversationId: convMsg.id, channel: "LINE" }));
    const ct = await P.crmContact.findFirst({ where: { id: ctChat.id } });
    const actsAfter = await P.crmActivity.count({ where: { contactId: ctChat.id } });
    chk("C2.4-S8.6", "chat.message.received ⇒ the contact's lastActivityAt moves to ~now · NO activity per message",
      m.ok && !!ct?.lastActivityAt && new Date(ct.lastActivityAt).getTime() >= t1 - 2000 && actsAfter === actsBefore, "bumped · 0 activities",
      `consumer=${rd(m)} last=${ct?.lastActivityAt ? new Date(ct.lastActivityAt).toISOString() : "-"} acts+${actsAfter - actsBefore}`, "MAJOR");
  }
  let enrStop = NONE;
  {
    const hasSeq = typeof SEQ?.createSequence === "function" && typeof SEQ?.enroll === "function";
    let stopped = false;
    let kept = false;
    let why = hasSeq ? "" : "C2.2 sequences module absent";
    if (hasSeq) {
      const mkSeq = async (stopOnReply: boolean) => idOf((await call(SEQ.createSequence, cA, owner, { name: `ลำดับ ${TAG}-${nx()}`, stopOnReply, steps: [{ kind: "WAIT", waitDays: 30 }, { kind: "TASK", taskTitle: `งาน ${TAG}` }] })).v);
      const sOn = await mkSeq(true);
      const sOff = await mkSeq(false);
      const en1 = await call(SEQ.enroll, cA, owner, { sequenceId: sOn, contactId: ctChat.id });
      const en2 = await call(SEQ.enroll, cA, owner, { sequenceId: sOff, contactId: ctChat.id });
      enrStop = String(en1.v?.enrollmentId ?? en1.v?.id ?? NONE);
      const enrKeep = String(en2.v?.enrollmentId ?? en2.v?.id ?? NONE);
      await consume(chatEvt(tidA, chatA, "chat.message.received", { conversationId: convMsg.id, channel: "LINE" }));
      const r1s = await (P.crmSequenceEnrollment?.findFirst?.({ where: { id: enrStop } }) ?? Promise.resolve(null)).catch(() => null);
      const r2s = await (P.crmSequenceEnrollment?.findFirst?.({ where: { id: enrKeep } }) ?? Promise.resolve(null)).catch(() => null);
      stopped = r1s?.status === "STOPPED";
      kept = r2s?.status === "ACTIVE";
      why = `enroll=${rd(en1)}/${rd(en2)} on=${r1s?.status ?? "-"} off=${r2s?.status ?? "-"}`;
    }
    chk("C2.4-S8.7", "a customer reply (chat.message.received) calls C2.2 sequences.stopFor(…, \"REPLY\"): the enrollment of a stopOnReply sequence is STOPPED · a stopOnReply=false one stays ACTIVE",
      hasSeq && stopped && kept, "STOPPED / ACTIVE", why);
  }
  const conv5 = await mkConv(tidA, chatA, ctChat2.partyId);
  {
    await setCrm(crmA, { ai: { callTranscribe: true, chatSummary: true } });
    await resolveConv(conv5.id);
    const ai0 = AI_CALLS.length;
    const r = await call(BR.onChatConversationStatus, statusEvt(tidA, chatA, conv5.id, "RESOLVED"), { ai: fakeAi("chat", JSON.stringify({ summary: MARK_CS })) });
    const acts = await chatActs(conv5.id);
    const charges = await usageFor(tidA, `crm.chat.summary#${conv5.id}`);
    const prompt = AI_CALLS.slice(ai0).map((c) => c.text).join("\n");
    chk("C2.4-S8.8", "settings.crm.ai.chatSummary on + credit ⇒ the ONE CHAT activity gets aiSummary from the AI (system-authored) · ONE charge note `crm.chat.summary#<conversationId>` · the prompt carried the message text (positive control for X8.3)",
      r.ok && acts.length === 1 && String(acts[0]?.aiSummary ?? "").includes(MARK_CS) && charges.length === 1 && prompt.includes(MARK_C), "summary + 1 charge",
      `r=${rd(r)} acts=${acts.length} summary=${cut(acts[0]?.aiSummary, 60)} charges=${charges.length} promptHasText=${prompt.includes(MARK_C)}`, "MAJOR");
  }
  {
    const convN = await mkConv(tidN, await mk(tidN, "CHAT", "แชท-N"), ctN.partyId);
    await resolveConv(convN.id);
    const ai0 = AI_CALLS.length;
    const r = await call(BR.onChatConversationStatus, statusEvt(tidN, NONE, convN.id, "RESOLVED"), { ai: fakeAi("chat", JSON.stringify({ summary: MARK_CS })) });
    const actsN = await chatActs(convN.id);
    await setCrm(crmA, { ai: { callTranscribe: true, chatSummary: false } });
    const conv6 = await mkConv(tidA, chatA, ctChat2.partyId);
    await resolveConv(conv6.id);
    const r6 = await call(BR.onChatConversationStatus, statusEvt(tidA, chatA, conv6.id, "RESOLVED"), { ai: fakeAi("chat", JSON.stringify({ summary: MARK_CS })) });
    const acts6 = await chatActs(conv6.id);
    chk("C2.4-S8.9", "no credit (tenant N, chatSummary on) or chatSummary off (A) ⇒ the CHAT activity is still created, WITHOUT aiSummary · the AI is never called · no charge",
      r.ok && r6.ok && actsN.length === 1 && !actsN[0].aiSummary && acts6.length === 1 && !acts6[0].aiSummary && AI_CALLS.length === ai0 && (await usageFor(tidN, "crm.chat")).length === 0,
      "activity w/o summary · 0 AI", `N=${rd(r)} acts=${actsN.length}/${actsN[0]?.aiSummary ? "summary!" : "-"} A-off=${rd(r6)} acts=${acts6.length} ai+${AI_CALLS.length - ai0}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S8.10–S8.13 — business card scan (vision) · booking link
  // ═════════════════════════════════════════════════════════════════════════════
  out("── S8 · card scan · booking link ──");
  const CARD_PHONE = phoneOf();
  const CARD_EMAIL = mailOf("card");
  const CARD_NAME = pii(`คุณการ์ด ${TAG}`);
  const CARD_JSON = JSON.stringify({ name: CARD_NAME, phone: CARD_PHONE, email: CARD_EMAIL, company: `บริษัทการ์ด ${TAG}`, jobTitle: "ผู้จัดการ" });
  const img = (bytes = 32 * 1024, contentType = "image/png") => ({ filename: "card.png", contentType, data: new Uint8Array(bytes).fill(9) });
  const tScan = new Date(Date.now() - 1000);
  const ai0scan = AI_CALLS.length;
  const scan = await call(CL.scanBusinessCard, cA, owner, img(), { ai: fakeAi("card", CARD_JSON) });
  const scanCalls = AI_CALLS.slice(ai0scan);
  const leadProps = ((await P.aiProposal.findMany({ where: { tenantId: tidA, kind: "crm_create_lead", createdAt: { gte: tScan } } })) as Any[]);
  const leadProp = leadProps[0] ?? null;
  chk("C2.4-S8.10", "scanBusinessCard ⇒ ONE PENDING AiProposal kind crm_create_lead, payload { systemId: this CRM, name, phone, email, company, jobTitle } = the vision output · draft returned · the image reached the model ONLY as a data:image/… URL · ONE charge note `crm.card.scan…`",
    scan.ok && leadProps.length === 1 && leadProp.status === "PENDING" && leadProp.payload?.systemId === crmA && leadProp.payload?.phone === CARD_PHONE && leadProp.payload?.email === CARD_EMAIL &&
      scan.v?.draft?.name === CARD_NAME && scanCalls.length === 1 && scanCalls[0].images.length >= 1 && scanCalls[0].images.every((u) => /^data:image\/[a-z+.-]+;base64,/.test(u)) &&
      (await usageFor(tidA, "crm.card.scan")).length === 1,
    "proposal + data: URL + 1 charge", `scan=${rd(scan)} props=${leadProps.length} sys=${leadProp?.payload?.systemId === crmA} images=${scanCalls[0]?.images.map((u) => u.slice(0, 22)).join(",") || "-"} charges=${(await usageFor(tidA, "crm.card.scan")).length}`, "MAJOR");
  {
    const wrongSys = await call(CL.acceptLeadProposal, cA2, owner, leadProp?.id ?? NONE);
    const accL = await call(CL.acceptLeadProposal, cA, owner, leadProp?.id ?? NONE);
    const again = await call(CL.acceptLeadProposal, cA, owner, leadProp?.id ?? NONE);
    const made = await P.crmContact.findMany({ where: { tenantId: tidA, phone: CARD_PHONE } });
    chk("C2.4-S8.11", "acceptLeadProposal: from another CRM system ⇒ NOT_FOUND · from this system ⇒ ONE contact in THIS system with the card's phone · second accept ⇒ CONFLICT",
      refused(wrongSys, "NOT_FOUND") && accL.ok && made.length === 1 && made[0].systemId === crmA && refused(again, "CONFLICT"),
      "NF · 1 contact · CONFLICT", `wrongSys=${rd(wrongSys)} acc=${rd(accL)} contacts=${made.length}@${made[0]?.systemId === crmA ? "crmA" : made[0]?.systemId ?? "-"} again=${rd(again)}`, "MAJOR");
  }
  {
    const ai0 = AI_CALLS.length;
    const nc = await call(CL.scanBusinessCard, cN, owner, img(), { ai: fakeAi("card", CARD_JSON) });
    const pdf = await call(CL.scanBusinessCard, cA, owner, img(1024, "application/pdf"), { ai: fakeAi("card", CARD_JSON) });
    const big = await call(CL.scanBusinessCard, cA, owner, img(5 * MB + 1, "image/jpeg"), { ai: fakeAi("card", CARD_JSON) });
    const svg = await call(CL.scanBusinessCard, cA, owner, img(512, "image/svg+xml"), { ai: fakeAi("card", CARD_JSON) });
    chk("C2.4-S8.12", "scanBusinessCard refusals call no AI: no credit ⇒ NO_CREDIT · application/pdf / image/svg+xml ⇒ VALIDATION · > 5 MB ⇒ VALIDATION",
      refused(nc, "NO_CREDIT") && refused(pdf, "VALIDATION") && refused(svg, "VALIDATION") && refused(big, "VALIDATION") && AI_CALLS.length === ai0 &&
        (await P.aiProposal.count({ where: { tenantId: tidN, kind: "crm_create_lead" } })) === 0,
      "refused · 0 AI", `${rd(nc)} | ${rd(pdf)} | ${rd(svg)} | ${rd(big)} ai+${AI_CALLS.length - ai0}`, "MAJOR");
  }
  {
    const lA = await call(CL.bookingLinkFor, cA, owner, { contactId: ctMain.id });
    const lN = await call(CL.bookingLinkFor, cN, owner, { contactId: ctN.id });
    const lX = await call(CL.bookingLinkFor, cA, outsider, { contactId: ctMain.id });
    const href = String(lA.v?.href ?? "");
    chk("C2.4-S8.13", "R-A \"book via the booking system\": bookingLinkFor ⇒ { href } under /app/u/<booking unit slug>/booking carrying partyId and NO phone/e-mail/name · a tenant without a BOOKING unit ⇒ null · an invisible contact ⇒ NOT_FOUND",
      lA.ok && href.startsWith(`/app/u/${uBook.slug}/booking`) && href.includes(ctMain.partyId) && ![ctMain.phone, ctMain.email, encodeURIComponent(ctMain.name)].some((p) => href.includes(p)) &&
        lN.ok && lN.v === null && refused(lX, "NOT_FOUND"),
      "href · null · NF", `A=${rd(lA)} ${cut(href, 90)} N=${lN.ok ? j(lN.v) : lN.err} X=${rd(lX)}`, "MINOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — calendar merges read-only appointments (booking · clinic · school)
  // ═════════════════════════════════════════════════════════════════════════════
  out("── S4 · merged calendar ──");
  const at = (d: number, h = 3) => new Date(Math.floor(Date.now() / DAY) * DAY + d * DAY + h * 3_600_000);
  const svc = await P.bookingService.create({ data: { tenantId: tidA, unitId: uBook.id, name: `ดำน้ำตื้น ${TAG}`, durationMin: 60 } });
  const bst = await P.bookingStaff.create({ data: { tenantId: tidA, unitId: uBook.id, name: `ครูสอน ${TAG}` } });
  const mkAppt = async (tid: string, unitId: string, serviceId: string, staffId: string, partyId: string, start: Date, status = "CONFIRMED") =>
    (await P.appointment.create({ data: { tenantId: tid, unitId, serviceId, staffId, partyId, startAt: start, endAt: new Date(start.getTime() + 3_600_000), status, customerName: pii(`ลูกค้าจอง ${TAG}-${nx()}`), customerPhone: phoneOf() } })).id as string;
  const apStaff = await mkAppt(tidA, uBook.id, svc.id, bst.id, ctStaff.partyId, at(2));
  const apOther = await mkAppt(tidA, uBook.id, svc.id, bst.id, ctOther.partyId, at(2, 5));
  const apCancel = await mkAppt(tidA, uBook.id, svc.id, bst.id, ctStaff.partyId, at(3), "CANCELLED");
  const apFar = await mkAppt(tidA, uBook.id, svc.id, bst.id, ctStaff.partyId, at(40));
  const apNoContact = await mkAppt(tidA, uBook.id, svc.id, bst.id, pNoContact, at(2, 6));
  const svcB = await P.bookingService.create({ data: { tenantId: tidB, unitId: uBookB.id, name: `บริการ-B ${TAG}`, durationMin: 60 } });
  const bstB = await P.bookingStaff.create({ data: { tenantId: tidB, unitId: uBookB.id, name: `พนักงาน-B ${TAG}` } });
  const apForeign = await mkAppt(tidB, uBookB.id, svcB.id, bstB.id, ctStaff.partyId, at(2, 7)); // corrupt row: tenant B pointing at A's Party
  const patient = await P.patientRecord.create({ data: { tenantId: tidA, unitId: uClinic.id, name: pii(`คนไข้ ${TAG}`), phone: phoneOf(), partyId: ctStaff.partyId } });
  const visit = await P.clinicVisit.create({ data: { tenantId: tidA, unitId: uClinic.id, patientId: patient.id, visitDate: at(2, 8), symptom: SYMPTOM, diagnosis: DIAG, feeSatang: 123_400, partyId: ctStaff.partyId } });
  const course = await P.schoolCourse.create({ data: { tenantId: tidA, unitId: uSchool.id, name: `คอร์สดำน้ำ ${TAG}` } });
  const klass = await P.schoolClass.create({ data: { tenantId: tidA, unitId: uSchool.id, courseId: course.id, name: `รอบเช้า ${TAG}`, startDate: at(2, 0) } });
  const enr = await P.schoolEnrollment.create({ data: { tenantId: tidA, unitId: uSchool.id, classId: klass.id, studentName: pii(`ผู้เรียน ${TAG}`), studentPhone: phoneOf(), status: "PAID", partyId: ctStaff.partyId } });
  const range = { from: new Date(Date.now() - DAY), to: new Date(Date.now() + 7 * DAY) };
  const apIds = (r: Res) => ((r.v?.appointments ?? []) as Any[]).map((x) => String(x?.id ?? ""));
  {
    const edges = read(FITNESS);
    const miss = Object.entries(FACADES).filter(([k, f]) => !existsSync(f) || typeof FAC[k]?.appointmentsByParty !== "function").map(([k]) => k);
    const edgeMiss = ["crm→booking", "crm→clinic", "crm→school"].filter((e) => !edges.includes(`"${e}"`));
    chk("C2.4-S4.1", "facades booking/clinic/school index.ts export appointmentsByParty · ALLOWED_EDGES has \"crm→booking\" \"crm→clinic\" \"crm→school\"",
      miss.length === 0 && edgeMiss.length === 0, "3 facades + 3 edges", `missing=${miss.join(",") || "-"} edges=${edgeMiss.join(",") || "-"}`);
  }
  const calOwner = await call(ACT.calendar, cA, owner, range);
  {
    const ids = apIds(calOwner);
    const apps = (calOwner.v?.appointments ?? []) as Any[];
    const bk = apps.find((x) => x.id === apStaff);
    const want = [apStaff, apOther, visit.id, enr.id];
    chk("C2.4-S4.2", "calendar(owner) ⇒ `appointments` holds the booking appointments of both visible contacts' Parties, the clinic visit and the school enrolment (by id), each readOnly: true with source BOOKING|CLINIC|SCHOOL, contactId and startAt of the source row · `items` still there",
      calOwner.ok && Array.isArray(calOwner.v?.items) && want.every((w) => ids.includes(w)) && apps.every((x) => x.readOnly === true && ["BOOKING", "CLINIC", "SCHOOL"].includes(x.source)) &&
        !!bk && bk.contactId === ctStaff.id && Math.abs(new Date(bk.startAt).getTime() - at(2).getTime()) < 1000,
      "4 merged · read-only", `cal=${rd(calOwner)} ids=${want.map((w) => (ids.includes(w) ? "y" : "n")).join("")} n=${apps.length} bk=${cut(j(bk && { c: bk.contactId === ctStaff.id, s: bk.source, ro: bk.readOnly }), 80)}`);
  }
  {
    const snap = async () => j([await P.appointment.findMany({ where: { tenantId: tidA }, orderBy: { id: "asc" } }), await P.clinicVisit.findMany({ where: { tenantId: tidA }, orderBy: { id: "asc" } }), await P.schoolEnrollment.findMany({ where: { tenantId: tidA }, orderBy: { id: "asc" } })]);
    const before = await snap();
    const direct = await Promise.all(Object.keys(FACADES).map((k) => call(FAC[k]?.appointmentsByParty, tidA, [ctStaff.partyId, ctOther.partyId], range)));
    await call(ACT.calendar, cA, owner, range);
    const after = await snap();
    const blob = j([calOwner.v?.appointments, direct.map((d) => d.v)]);
    const leaks = [SYMPTOM, DIAG, "123400", ...PII.filter((p) => /^0\d{9}$/.test(p) || /ลูกค้าจอง|ผู้เรียน|คนไข้/.test(p))].filter((p) => blob.includes(p));
    chk("C2.4-S4.3", "read-only + no private data: the facades and calendar write nothing (booking/clinic/school rows byte-identical) · no DTO carries customerName/customerPhone/studentPhone/symptom/diagnosis/fee",
      direct.every((d) => d.ok) && before === after && leaks.length === 0, "unchanged · clean", `direct=${direct.map(rd).join("/")} same=${before === after} leaks=${leaks.map((l) => cut(l, 20)).join(",") || "-"}`);
  }
  {
    const ids = apIds(calOwner);
    const mine = await call(ACT.calendar, cA, owner, { ...range, mine: true });
    const mineIds = apIds(mine);
    chk("C2.4-S4.4", "range and filters: an appointment outside [from, to) · a CANCELLED one · one of a Party without a visible contact are absent · mine=true keeps only appointments of contacts the actor owns (owner owns neither ⇒ none of them)",
      calOwner.ok && ![apFar, apCancel, apNoContact].some((x) => ids.includes(x)) && mine.ok && ![apStaff, apOther, visit.id, enr.id].some((x) => mineIds.includes(x)),
      "excluded", `far=${ids.includes(apFar)} cancel=${ids.includes(apCancel)} noContact=${ids.includes(apNoContact)} mine=${rd(mine)} mineN=${mineIds.length}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 — reminders (minute job)
  // ═════════════════════════════════════════════════════════════════════════════
  out("── S5 · reminders ──");
  {
    const reg = (globalThis as Any)[Symbol.for("shark.platform.minute-jobs.registry")] as Map<string, Any> | undefined;
    const job = reg?.get?.("crm.activity.remind");
    chk("C2.4-S5.1", "importing crm/reminders registers the minute job crm.activity.remind (everyMinutes 5 · cadence minute · not vpsOnly) and scripts/crm-cron.mts imports it",
      typeof RM?.remindDue === "function" && !!job && job.everyMinutes === 5 && (job.cadence ?? "minute") === "minute" && job.vpsOnly !== true && /crm\/reminders/.test(read(CRON)),
      "registered", `remindDue=${typeof RM?.remindDue} job=${job ? `${job.everyMinutes}/${job.cadence}/${job.vpsOnly}` : "-"} cron=${/crm\/reminders/.test(read(CRON))}`);
  }
  const PUSHES: Any[] = [];
  const pushDeps = { push: async (req: Any) => { PUSHES.push(req); return { ok: true }; } };
  const mkTask = async (c: Any, title: string, remindAt: Date | null, extra: Record<string, Any> = {}) =>
    (await P.crmActivity.create({ data: { tenantId: c.tenantId, systemId: c.systemId, contactId: extra.contactId ?? null, type: "TASK", title, ownerUserId: userA, dueAt: new Date(Date.now() + DAY), remindAt, ...extra } })).id as string;
  const notesWith = async (tid: string, needle: string) =>
    ((await P.appNotification.findMany({ where: { tenantId: tid } })) as Any[]).filter((n) => `${n.title} ${n.body}`.includes(needle));
  {
    const NOW = new Date();
    const mDue = `เตือนงาน${rand}A`;
    const mDone = `เตือนงาน${rand}B`;
    const mFuture = `เตือนงาน${rand}C`;
    const idDue = await mkTask(cA, mDue, new Date(NOW.getTime() - 60_000), { contactId: ctMain.id });
    await mkTask(cA, mDone, new Date(NOW.getTime() - 60_000), { doneAt: new Date() });
    await mkTask(cA, mFuture, new Date(NOW.getTime() + 3 * 3_600_000));
    const [ra, rb] = await Promise.all([call(RM.remindDue, NOW, { tenantIds: [tidA], deps: pushDeps }), call(RM.remindDue, NOW, { tenantIds: [tidA], deps: pushDeps })]);
    await pump([tidA]);
    const rc = await call(RM.remindDue, new Date(NOW.getTime() + 10 * 60_000), { tenantIds: [tidA], deps: pushDeps });
    await pump([tidA]);
    const nDue = await notesWith(tidA, mDue);
    const nDone = await notesWith(tidA, mDone);
    const nFuture = await notesWith(tidA, mFuture);
    const pushes = PUSHES.filter((p) => j(p).includes(idDue) || j(p).includes(mDue)).length;
    chk("C2.4-S5.2", "remindDue: a due reminder ⇒ exactly ONE in-app notification for the owner (recipientUserId) after two overlapping runs + a later run (+ our pump) and at most one push · a done task / a future reminder ⇒ none",
      ra.ok && rb.ok && rc.ok && nDue.length === 1 && nDue[0].recipientUserId === userA && nDone.length === 0 && nFuture.length === 0 && pushes <= 1,
      "1 · 0 · 0", `runs=${[ra, rb, rc].map((r) => (r.ok ? "ok" : r.err)).join("/")} due=${nDue.length} rcpt=${nDue[0]?.recipientUserId === userA} done=${nDone.length} future=${nFuture.length} pushes=${pushes}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S6 — CrmCallProvider interface + webhook shape (stub) · CrmTranscriber adapter
  // ═════════════════════════════════════════════════════════════════════════════
  out("── S6 · adapters ──");
  {
    const cpSrc = read(CALLPROV);
    const trSrc = read(TRANSCRIBER);
    const prov = await call(CP.getCrmCallProvider, cA);
    const trNow = typeof TR.getCrmTranscriber === "function" ? TR.getCrmTranscriber() : "missing";
    const routes = walk("src/app/api").filter((f) => /call/i.test(f) && /webhook|provider|voip|pbx/i.test(f));
    chk("C2.4-S6.1", "adapters: call-provider.ts declares `interface CrmCallProvider` + parseCallWebhook + callWebhookToActivityInput + getCrmCallProvider (→ null) · transcriber.ts declares `interface CrmTranscriber` + registerCrmTranscriber + getCrmTranscriber (→ null by default, R-B) · NO call-webhook HTTP route yet",
      /interface\s+CrmCallProvider\b/.test(cpSrc) && ["parseCallWebhook", "callWebhookToActivityInput", "getCrmCallProvider"].every((f) => typeof CP?.[f] === "function") && prov.ok && prov.v === null &&
        /interface\s+CrmTranscriber\b/.test(trSrc) && typeof TR?.registerCrmTranscriber === "function" && trNow === null && routes.length === 0,
      "stubs", `cp=${/interface\s+CrmCallProvider\b/.test(cpSrc)} prov=${prov.ok ? j(prov.v) : prov.err} tr=${/interface\s+CrmTranscriber\b/.test(trSrc)} trNow=${trNow === null ? "null" : String(trNow)} routes=${routes.join(",") || "-"}`);
  }
  {
    const from = phoneOf();
    const to = phoneOf();
    const good = { provider: "qc", providerCallId: `${TAG}-call-1`, direction: "IN", from, to, startedAt: "2026-09-19T03:00:00.000Z", endedAt: "2026-09-19T03:04:32.000Z", durationSec: 272, status: "ANSWERED", recordingUrl: "https://pbx.example/rec/1.mp3" };
    const g = CP.parseCallWebhook?.(good) ?? null;
    const bads = [{ ...good, providerCallId: "" }, { ...good, direction: "UP" }, { ...good, startedAt: "เมื่อวาน" }, { ...good, durationSec: -5 }, null, "x"].map((b) => { try { return CP.parseCallWebhook?.(b); } catch { return "THREW"; } });
    let mapped: Any = null;
    try { mapped = g ? CP.callWebhookToActivityInput?.(g) : null; } catch (e) { mapped = { threw: String(e) }; }
    const defaults = ((await import("@/lib/modules/crm/activities-shared" as string).catch(() => ({}))) as Any).ACTIVITY_OUTCOMES_DEFAULT?.CALL ?? [];
    const mj = j(mapped);
    chk("C2.4-S6.2", "webhook shape: parseCallWebhook accepts the neutral CallWebhookEvent and returns null (never throws) for missing id / bad direction / non-ISO date / negative duration / non-objects · callWebhookToActivityInput ⇒ { type CALL, direction IN, durationSec 272, startAt = startedAt, outcome ∈ CALL defaults, Thai title } with NO phone number and NO recordingUrl copied",
      !!g && g.providerCallId === good.providerCallId && bads.every((b) => b === null) && mapped?.type === "CALL" && mapped?.direction === "IN" && mapped?.durationSec === 272 &&
        new Date(mapped?.startAt).getTime() === Date.parse(good.startedAt) && defaults.includes(mapped?.outcome) && thai(mapped?.title) && !mj.includes(from) && !mj.includes(to) && !mj.includes("pbx.example"),
      "parsed · mapped clean", `good=${!!g} bads=${bads.map((b) => (b === null ? "null" : typeof b)).join(",")} mapped=${cut(mj, 160)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S7 — mockup 08 (static proxy; the PARITY verdict is the controller's D7)
  // ═════════════════════════════════════════════════════════════════════════════
  out("── S7 · UI vs mockup 08 (static) ──");
  {
    const labels = ["ผลสาย", "ระยะเวลา", "ทิศทาง", "โน้ต", "งานถัดไป", "ไฟล์เสียง", "ถอดเสียง", "สรุป"];
    const miss = labels.filter((l) => !callUi.includes(l));
    chk("C2.4-S7.1", "call modal sections match mockup 08 (left): Thai labels ผลสาย · ระยะเวลา · ทิศทาง · โน้ต · งานถัดไป · ไฟล์เสียง · ถอดเสียง · สรุป", miss.length === 0, "8 labels", miss.join(",") || "-", "MAJOR");
  }
  {
    const tids = ["crm-call-ai-card", "crm-call-ai-transcript", "crm-call-ai-summary", "crm-call-ai-next-step", "crm-call-ai-accept"];
    const miss = tids.filter((t) => !callUi.includes(t));
    chk("C2.4-S7.2", "AI card of mockup 08: transcript · summary · next step · accept (a PROPOSAL card — the fields are written only on accept)", miss.length === 0 && /acceptCallAiAction/.test(callUi), "5 testids + accept action", `missing=${miss.join(",") || "-"} accept=${/acceptCallAiAction/.test(callUi)}`, "MAJOR");
  }
  chk("C2.4-S7.3", "calm \"no transcription service\" state: testid crm-call-ai-unavailable with the text ยังไม่ได้เชื่อมบริการถอดเสียง (and no alert())",
    /crm-call-ai-unavailable/.test(callUi) && /ยังไม่ได้เชื่อมบริการถอดเสียง/.test(callUi) && !/\balert\(/.test(callUi), "calm state", `tid=${/crm-call-ai-unavailable/.test(callUi)} text=${/ยังไม่ได้เชื่อมบริการถอดเสียง/.test(callUi)} alert=${/\balert\(/.test(callUi)}`, "MAJOR");
  {
    const cal = walk(CAL_DIR).map(read).join("\n");
    chk("C2.4-S7.4", "calendar (mockup 08 right): appointments rendered with data-testid crm-calendar-appointment, marked read-only (อ่านอย่างเดียว / aria-readonly) and labelled by source (จอง · คลินิก · โรงเรียน)",
      /crm-calendar-appointment/.test(cal) && /อ่านอย่างเดียว|aria-readonly/.test(cal) && ["จอง", "คลินิก", "โรงเรียน"].every((w) => cal.includes(w)), "read-only chips",
      `tid=${/crm-calendar-appointment/.test(cal)} ro=${/อ่านอย่างเดียว|aria-readonly/.test(cal)}`, "MAJOR");
  }
  {
    const fixedWide = /(?<![a-z]:)\b(w|min-w)-\[(3[9-9]\d|[4-9]\d\d|\d{4,})px\]/.test(modalSrc);
    chk("C2.4-S7.5", "390 px: the modal is full-width on phones (w-full + a sm:/md: max-width) and has no un-prefixed fixed width ≥ 390 px",
      /\bw-full\b/.test(modalSrc) && /\b(sm|md):max-w-/.test(modalSrc) && !fixedWide, "responsive", `wfull=${/\bw-full\b/.test(modalSrc)} bp=${/\b(sm|md):max-w-/.test(modalSrc)} fixed=${fixedWide}`, "MINOR");
  }
  {
    let inv: Any[] = [];
    try { inv = (JSON.parse(read(INVENTORY)).rows ?? []) as Any[]; } catch { inv = []; }
    const rows = inv.filter((r) => r?.wo === "C2.4");
    const uiSrc = [callUi, ...walk(CAL_DIR).map(read), ...walk(`${CRM_PAGES}/contacts`).map(read), ...walk("src/components/crm").map(read)].join("\n");
    const orphan = rows.filter((r) => !uiSrc.includes(String(r.testid ?? "")));
    const need = [...MODAL_TIDS, "crm-call-tel", "crm-call-recording-player", "crm-calendar-appointment", "crm-card-scan", "crm-book-via-booking"];
    const noRow = need.filter((t) => !rows.some((r) => r.testid === t));
    chk("C2.4-S7.6", "recording player is an <audio> fed by the DTO url (crm-call-recording-player) · inventory rows (wo C2.4) for every new testid incl. crm-card-scan and crm-book-via-booking, none orphaned",
      /<audio\b/.test(callUi) && /crm-call-recording-player/.test(callUi) && noRow.length === 0 && orphan.length === 0, "rows + player",
      `audio=${/<audio\b/.test(callUi)} rows=${rows.length} noRow=${noRow.join(",") || "-"} orphan=${orphan.map((r) => r.testid).join(",") || "-"}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X1 — scope (tenant · system · team · unit) — 404 not 403, nothing written
  // ═════════════════════════════════════════════════════════════════════════════
  out("── X1 · scope ──");
  {
    const n0 = await P.crmActivity.count({ where: { tenantId: { in: [tidA, tidB] } } });
    const f1 = await logCall(cA, owner, { contactId: ctB.id, direction: "OUT", outcome: "สนใจ" });
    const f2 = await logCall(cA, owner, { contactId: ctOnly2.id, direction: "OUT", outcome: "สนใจ" });
    const f3 = await logCall({ ...cA, systemId: crmB }, owner, { contactId: ctB.id, direction: "OUT", outcome: "สนใจ" });
    const n1 = await P.crmActivity.count({ where: { tenantId: { in: [tidA, tidB] } } });
    const leak = [f1, f2, f3].some((r) => [ctB.name, ctOnly2.name].some((p) => r.msg.includes(p)));
    chk("C2.4-X1.1", "logCall with a contact of another tenant · of another CRM system of the same tenant · a foreign systemId in ctx ⇒ NOT_FOUND (Thai, nothing of theirs echoed) — no row",
      refused(f1, "NOT_FOUND") && refused(f2, "NOT_FOUND") && refused(f3, "NOT_FOUND") && n1 === n0 && !leak, "3 × NF", `${rd(f1)} | ${rd(f2)} | ${rd(f3)} rows+${n1 - n0}`);
  }
  {
    const cPend = await mkCall(cA, ctMain.id);
    await call(CL.transcribeCall, cA, owner, cPend.id, trDeps());
    const pP = (await proposalsOf(tidA, cPend.id))[0];
    const tr0 = TR_CALLS.length;
    const g1 = await call(CL.getRecording, cB, owner, cPend.id);
    const g2 = await call(CL.getRecording, cA2, owner, cPend.id);
    const t1 = await call(CL.transcribeCall, cB, owner, cPend.id, trDeps());
    const p1 = await call(CL.pendingCallAiProposal, cA2, owner, cPend.id);
    const a1x = await call(CL.acceptCallAiProposal, cB, owner, pP?.id ?? NONE);
    const a2x = await call(CL.acceptCallAiProposal, cA2, owner, pP?.id ?? NONE);
    const still = pP ? await P.aiProposal.findFirst({ where: { id: pP.id } }) : null;
    chk("C2.4-X1.2", "getRecording / transcribeCall / pendingCallAiProposal / acceptCallAiProposal from another tenant or another CRM system ⇒ NOT_FOUND · the proposal stays PENDING · no transcriber call",
      [g1, g2, t1, p1, a1x, a2x].every((r) => refused(r, "NOT_FOUND")) && still?.status === "PENDING" && TR_CALLS.length === tr0,
      "6 × NF", `${[g1, g2, t1, p1, a1x, a2x].map((r) => (r.ok ? "OK!" : r.code)).join(",")} status=${still?.status ?? "-"} tr+${TR_CALLS.length - tr0}`);
  }
  {
    const convX = await mkConv(tidA, chatA, ctMain.partyId);
    await resolveConv(convX.id);
    const x1 = await consume(statusEvt(tidB, NONE, convX.id, "RESOLVED")); // tenant B event carrying A's conversation
    const actsX = await chatActs(convX.id);
    const convBoth = await mkConv(tidA, chatA, pBoth);
    await resolveConv(convBoth.id);
    await consume(statusEvt(tidA, chatA, convBoth.id, "RESOLVED"));
    const actsBoth = await chatActs(convBoth.id);
    const convOnly2 = await mkConv(tidA, chatA, ctOnly2.partyId);
    await resolveConv(convOnly2.id);
    await consume(statusEvt(tidA, chatA, convOnly2.id, "RESOLVED"));
    const actsOnly2 = await chatActs(convOnly2.id);
    chk("C2.4-X1.3", "chat: a tenant-B event carrying tenant A's conversationId ⇒ nothing anywhere · a Party with contacts in BOTH CRM systems ⇒ exactly one activity, in the first system · a Party only in the second system ⇒ one activity there",
      x1.ok && actsX.length === 0 && actsBoth.length === 1 && actsBoth[0].systemId === crmA && actsOnly2.length === 1 && actsOnly2[0].systemId === crmA2,
      "0 · 1@first · 1@second", `foreign=${actsX.length} both=${actsBoth.length}@${actsBoth[0]?.systemId === crmA ? "A" : actsBoth[0]?.systemId ?? "-"} only2=${actsOnly2.length}@${actsOnly2[0]?.systemId === crmA2 ? "A2" : actsOnly2[0]?.systemId ?? "-"}`);
  }
  {
    const cs = await call(ACT.calendar, cAs, staff, range);
    const ids = apIds(cs);
    const ownerIds = apIds(calOwner);
    chk("C2.4-X1.4", "calendar visibility: STAFF (sees only own contacts) gets the appointments of ITS contact's Party and NOT those of the manager's contact · owner gets both (positive control)",
      cs.ok && ids.includes(apStaff) && !ids.includes(apOther) && ownerIds.includes(apOther), "staff ⊂ owner", `staff=${rd(cs)} own=${ids.includes(apStaff)} other=${ids.includes(apOther)} ownerOther=${ownerIds.includes(apOther)}`);
  }
  {
    const direct = await call(FAC.BOOKING?.appointmentsByParty, tidA, [ctStaff.partyId], range);
    const dIds = ((direct.v ?? []) as Any[]).map((x) => String(x?.id ?? ""));
    const unitStaff = { ...staff, unitAccess: [uBook.id] };
    const cu = await call(ACT.calendar, cAs, unitStaff, range);
    const uIds = apIds(cu);
    chk("C2.4-X1.5", "facade + unit scope: booking.appointmentsByParty(tenant A, [Party]) never returns tenant B's row pointing at that Party · a STAFF whose unitAccess = [booking unit] sees the booking appointment but NOT the clinic visit / school class of other units",
      direct.ok && dIds.includes(apStaff) && !dIds.includes(apForeign) && cu.ok && uIds.includes(apStaff) && !uIds.includes(visit.id) && !uIds.includes(enr.id),
      "tenant + unit scoped", `direct=${rd(direct)} own=${dIds.includes(apStaff)} foreign=${dIds.includes(apForeign)} unit=${rd(cu)} clinic=${uIds.includes(visit.id)} school=${uIds.includes(enr.id)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X2 — keys: 404 invisible / 403 no key · API-key actors
  // ═════════════════════════════════════════════════════════════════════════════
  out("── X2 · keys ──");
  {
    const n0 = await P.crmActivity.count({ where: { tenantId: tidA } });
    const f = await logCall({ ...cA, actorUserId: userR }, noCreate, { contactId: ctR.id, direction: "OUT", outcome: "สนใจ" });
    const nf = await logCall({ ...cA, actorUserId: userX }, outsider, { contactId: ctMain.id, direction: "OUT", outcome: "สนใจ" });
    const n1 = await P.crmActivity.count({ where: { tenantId: tidA } });
    const ok = await logCall(cAs, staff, { contactId: ctStaff.id, direction: "IN", outcome: "รับสาย" });
    chk("C2.4-X2.1", "people: STAFF who sees the contact but lacks crm.activity.create ⇒ FORBIDDEN (Thai) · STAFF who cannot see the contact ⇒ NOT_FOUND · nothing written · positive control: STAFF with the key on its own contact ⇒ logged",
      refused(f, "FORBIDDEN") && refused(nf, "NOT_FOUND") && n1 === n0 && ok.ok, "403 · 404 · ok", `noKey=${rd(f)} invisible=${rd(nf)} rows+${n1 - n0} staff=${rd(ok)}`);
  }
  {
    const tr0 = TR_CALLS.length;
    const l = await logCall(cA, apiRead, { contactId: ctMain.id, direction: "OUT", outcome: "สนใจ" });
    const t = await call(CL.transcribeCall, cA, apiRead, callNoTr.id, trDeps());
    const g = await call(CL.getRecording, cA, apiRead, callId);
    chk("C2.4-X2.2", "API key with read scopes only: logCall and transcribeCall ⇒ FORBIDDEN, transcriber never called · getRecording (read) allowed",
      refused(l, "FORBIDDEN") && refused(t, "FORBIDDEN") && TR_CALLS.length === tr0 && g.ok && !!g.v?.url, "403 · 403 · read ok", `log=${rd(l)} tr=${rd(t)} get=${rd(g)}`, "MAJOR");
  }
  {
    const g = await call(CL.getRecording, cA, apiNone, callId);
    const c = await call(ACT.calendar, cA, apiNone, range);
    const leaked = c.ok && ((c.v?.appointments ?? []) as Any[]).length > 0;
    chk("C2.4-X2.3", "API key without any crm.* scope: getRecording ⇒ NOT_FOUND (no link issued) · calendar returns no appointment (or is refused)",
      refused(g, "NOT_FOUND") && !g.v && !leaked, "nothing", `get=${rd(g)} cal=${c.ok ? `${((c.v?.appointments ?? []) as Any[]).length} appts` : c.err}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X3 — concurrency (separate pool connections, 10-way)
  // ═════════════════════════════════════════════════════════════════════════════
  out("── X3 · races ──");
  {
    const race = await mkCall(cA, ctMain.id);
    const tr0 = TR_CALLS.length;
    const deps = { transcriber: fakeTr(150), ai: fakeAi("transcribe", AI_JSON) };
    const rs = await Promise.all(Array.from({ length: 10 }, () => call(CL.transcribeCall, cA, owner, race.id, deps)));
    const props = await proposalsOf(tidA, race.id);
    const charges = await usageFor(tidA, `crm.call.transcribe#${race.id}`);
    const ids = new Set(rs.filter((r) => r.ok).map((r) => String(r.v?.proposalId ?? "")));
    const clean = rs.every((r) => r.ok || refused(r, "CONFLICT"));
    const trN = TR_CALLS.slice(tr0).filter((a) => a === race.id).length;
    chk("C2.4-X3.1", "10 parallel transcribeCall on one activity ⇒ ONE proposal · ONE charge · every caller gets that proposal id or CONFLICT (never a 500) · the transcriber ran once",
      props.length === 1 && charges.length === 1 && clean && ids.size <= 1 && trN === 1, "1 · 1 · 1",
      `props=${props.length} charges=${charges.length} ids=${ids.size} errors=${rs.filter((r) => !r.ok).map((r) => r.code).join(",") || "-"} transcriber=${trN}`);
  }
  {
    const race = await mkCall(cA, ctMain.id);
    await call(CL.transcribeCall, cA, owner, race.id, trDeps());
    const pp = (await proposalsOf(tidA, race.id))[0];
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => call(CL.acceptCallAiProposal, cA, owner, pp?.id ?? NONE, { aiNextStep: `ผู้ชนะ ${i}` })));
    const wins = rs.filter((r) => r.ok).length;
    const confl = rs.filter((r) => refused(r, "CONFLICT")).length;
    const audits = ((await P.auditLog.findMany({ where: { tenantId: tidA, targetId: race.id, action: "crm.activity.ai_accept" } })) as Any[]).length;
    chk("C2.4-X3.2", "10 parallel acceptCallAiProposal ⇒ exactly 1 succeeds, 9 CONFLICT (Thai) · one ai_accept audit row", wins === 1 && confl === 9 && audits === 1, "1 / 9 / 1",
      `wins=${wins} conflicts=${confl} audits=${audits}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X4 — redelivery / parallel consumers
  // ═════════════════════════════════════════════════════════════════════════════
  out("── X4 · redelivery ──");
  {
    const convR = await mkConv(tidA, chatA, ctMain.partyId);
    await resolveConv(convR.id);
    const e = statusEvt(tidA, chatA, convR.id, "RESOLVED");
    await consume(e);
    await consume(e);
    await Promise.all(Array.from({ length: 10 }, () => consume(e)));
    await Promise.all(Array.from({ length: 5 }, () => consume(statusEvt(tidA, chatA, convR.id, "RESOLVED")))); // reopen/resolve cycles = new keys
    const acts = await chatActs(convR.id);
    const evs = acts[0] ? await loggedEvents(tidA, acts[0].id) : [];
    chk("C2.4-X4.1", "RESOLVED delivered twice, then 10× in parallel, then 5 distinct RESOLVED events in parallel ⇒ still ONE CHAT activity and ONE crm.activity.logged", acts.length === 1 && evs.length === 1,
      "1 · 1", `acts=${acts.length} events=${evs.length}`);
  }
  {
    await setCrm(crmA, { ai: { callTranscribe: true, chatSummary: true } });
    const convS = await mkConv(tidA, chatA, ctMain.partyId);
    await resolveConv(convS.id);
    const ai0 = AI_CALLS.length;
    const deps = { ai: fakeAi("chat", JSON.stringify({ summary: MARK_CS })) };
    const e = statusEvt(tidA, chatA, convS.id, "RESOLVED");
    await call(BR.onChatConversationStatus, e, deps);
    await Promise.all(Array.from({ length: 5 }, () => call(BR.onChatConversationStatus, e, deps)));
    await setCrm(crmA, { ai: { callTranscribe: true, chatSummary: false } });
    const aiN = AI_CALLS.slice(ai0).filter((c) => c.tag === "chat").length;
    const charges = await usageFor(tidA, `crm.chat.summary#${convS.id}`);
    chk("C2.4-X4.2", "chat summary under redelivery (1 + 5 parallel) ⇒ the AI ran once and ONE charge", aiN === 1 && charges.length === 1 && (await chatActs(convS.id)).length === 1, "1 AI · 1 charge",
      `ai=${aiN} charges=${charges.length}`, "MAJOR");
  }
  {
    let why = "C2.2 sequences module absent";
    let ok = false;
    if (typeof SEQ?.createSequence === "function" && enrStop !== NONE) {
      const e = chatEvt(tidA, chatA, "chat.message.received", { conversationId: convMsg.id, channel: "LINE" });
      await consume(e);
      await Promise.all(Array.from({ length: 5 }, () => consume(e)));
      const fin = ((await P.outboxEvent.findMany({ where: { tenantId: tidA, type: "crm.sequence.finished" } })) as Any[]).filter((x) => j(x.payload).includes(enrStop));
      const acts = await P.crmActivity.count({ where: { contactId: ctChat.id, type: "CHAT", sourceRef: convMsg.id } });
      ok = fin.length === 1 && acts === 0;
      why = `finished=${fin.length} chatActs=${acts}`;
    }
    chk("C2.4-X4.3", "chat.message.received redelivered (1 + 5 parallel, after S8.7) ⇒ the reply stop happened ONCE (one crm.sequence.finished for that enrollment) · still no activity for messages", ok, "1 · 0", why, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X5 — reminder whose push throws: never lost, never doubled
  // ═════════════════════════════════════════════════════════════════════════════
  {
    const NOW = new Date();
    const m = `เตือนล้ม${rand}`;
    await mkTask(cA, m, new Date(NOW.getTime() - 60_000));
    const boom = { push: async () => { throw new Error("push down (qc)"); } };
    const r1x = await call(RM.remindDue, NOW, { tenantIds: [tidA], deps: boom });
    await pump([tidA]);
    const r2x = await call(RM.remindDue, new Date(NOW.getTime() + 5 * 60_000), { tenantIds: [tidA], deps: pushDeps });
    await pump([tidA]);
    const n = await notesWith(tidA, m);
    chk("C2.4-X5.1", "a reminder whose push throws on the first run: remindDue never throws, and after the next run the owner has exactly ONE in-app notification (not lost, not doubled)",
      r1x.ok && r2x.ok && n.length === 1, "1", `run1=${rd(r1x)} run2=${rd(r2x)} notes=${n.length}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X6 — dangerous input: size · mime · name
  // ═════════════════════════════════════════════════════════════════════════════
  out("── X6 · input ──");
  {
    const n0 = await P.crmActivity.count({ where: { tenantId: tidA } });
    const f0 = await P.fileAsset.count({ where: { tenantId: tidA } });
    const puts0 = PUTS.length;
    const big = await logCall(cA, owner, { contactId: ctMain.id, direction: "OUT", outcome: "สนใจ", recording: rec(25 * MB + 1) });
    const n1 = await P.crmActivity.count({ where: { tenantId: tidA } });
    const f1 = await P.fileAsset.count({ where: { tenantId: tidA } });
    const puts1 = PUTS.length;
    const six = await logCall(cA, owner, { contactId: ctMain.id, direction: "OUT", outcome: "สนใจ", recording: rec(6 * MB, "audio/mpeg", "long.mp3") });
    chk("C2.4-X6.1", "recording 25 MB + 1 byte ⇒ VALIDATION (Thai, mentions 25) and NOTHING written (no activity, no FileAsset, no put) · positive control: a 6 MB mp3 (above the storage default of 5 MB) is accepted",
      refused(big, "VALIDATION") && /25/.test(big.msg) && n1 === n0 && f1 === f0 && puts1 === puts0 && six.ok && !!six.v?.recording, "refused · accepted",
      `big=${rd(big)} rows+${n1 - n0} files+${f1 - f0} puts+${puts1 - puts0} six=${rd(six)}`);
  }
  {
    const c = await mkCall(cA, ctMain.id, false);
    const bad = await Promise.all(["image/png", "text/html", "application/octet-stream", "audio/x-evil", "image/svg+xml"].map((m) => call(CL.attachRecording, cA, owner, c.id, rec(2048, m, "x.bin"), storeDeps)));
    const opus = await call(CL.attachRecording, cA, owner, c.id, rec(2048, "audio/webm;codecs=opus", "voice.webm"), storeDeps);
    chk("C2.4-X6.2", "mime allowlist: image/png · text/html · application/octet-stream · audio/x-evil · image/svg+xml ⇒ VALIDATION · `audio/webm;codecs=opus` (MediaRecorder) accepted",
      bad.every((r) => refused(r, "VALIDATION")) && opus.ok, "5 refused · opus ok", `${bad.map((r) => (r.ok ? "OK!" : r.code)).join(",")} opus=${rd(opus)}`);
  }
  {
    const c = await mkCall(cA, ctMain.id, false);
    const nasty = "../..\\‮evil\r\n<script>.m4a";
    const r = await call(CL.attachRecording, cA, owner, c.id, rec(2048, "audio/mp4", nasty), storeDeps);
    const name = String(r.v?.name ?? "");
    chk("C2.4-X6.3", "recording file name sanitized: no / \\ < > CR LF or bidi characters, not starting with a dot, extension kept",
      r.ok && name.length > 0 && !/[/\\<>\r\n‪-‮]/.test(name) && !name.startsWith(".") && /\.m4a$/.test(name), "clean", `r=${rd(r)} name=${j(name)}`, "MAJOR");
  }
  {
    const c = await mkCall(cA, ctMain.id);
    const second = await call(CL.attachRecording, cA, owner, c.id, rec(), storeDeps);
    const noteAct = idOf((await call(ACT.logActivity, cA, owner, { type: "NOTE", title: `โน้ต ${TAG}`, contactId: ctMain.id })).v);
    const onNote = await call(CL.attachRecording, cA, owner, noteAct, rec(), storeDeps);
    chk("C2.4-X6.4", "one recording per CALL: a second attach ⇒ CONFLICT · a recording on a non-CALL activity ⇒ VALIDATION", refused(second, "CONFLICT") && refused(onNote, "VALIDATION"),
      "CONFLICT · VALIDATION", `second=${rd(second)} note=${rd(onNote)}`, "MINOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X10 — recording DTO = viewer-bound expiring link only
  // ═════════════════════════════════════════════════════════════════════════════
  out("── X10 · private recording ──");
  const g0 = await call(CL.getRecording, cA, owner, callId);
  const url = String(g0.v?.url ?? recDto?.url ?? "");
  const m0 = /^\/api\/files\/([A-Za-z0-9]+)\?exp=(\d+)&sig=([0-9a-f]{64})$/.exec(url);
  const fileRow = callRow?.recordingFileId ? await P.fileAsset.findFirst({ where: { id: callRow.recordingFileId } }) : null;
  {
    const blob = j([g0.v, recDto]);
    const bad = ["private://", `t/${tidA}/private`, CDN, "qc-c24-cdn", fileRow?.path ?? "@@none@@"].filter((s) => blob.includes(s));
    const keys = Object.keys(g0.v ?? {});
    const extra = keys.filter((k) => !["activityId", "name", "size", "mime", "url", "expiresAt", "durationSec", "createdAt"].includes(k));
    const exp = m0 ? Number(m0[2]) : 0;
    chk("C2.4-X10.1", "RecordingDto = { activityId, name, size, mime, url, expiresAt } only · url = /api/files/<id>?exp&sig with exp ≤ now + 15 min · the stored FileAsset is private (path t/<tid>/private/…, cdnUrl private://) and neither the path, the sentinel nor any CDN host appears in the DTO",
      g0.ok && !!m0 && exp - Date.now() / 1000 <= 900 && exp > Date.now() / 1000 && extra.length === 0 && bad.length === 0 && !!fileRow && String(fileRow.path).includes(`t/${tidA}/private/`) && String(fileRow.cdnUrl).startsWith("private://"),
      "expiring private link", `get=${rd(g0)} url=${cut(url, 70)} extraKeys=${extra.join(",") || "-"} leaks=${bad.join(",") || "-"} path=${cut(fileRow?.path, 50)}`);
  }
  {
    const fileId = m0?.[1] ?? "";
    const okOwner = !!m0 && STO.privateFileSignatureOk?.(fileId, m0[2], m0[3], { kind: "STAFF", id: userA }) === true;
    const okStaff = !!m0 && STO.privateFileSignatureOk?.(fileId, m0[2], m0[3], { kind: "STAFF", id: userS }) === true;
    const okExpired = !!m0 && STO.privateFileSignatureOk?.(fileId, m0[2], m0[3], { kind: "STAFF", id: userA }, Number(m0[2]) + 1) === true;
    const gs = await call(CL.getRecording, cAs, staff, callId);
    const gb = await call(CL.getRecording, cB, owner, callId);
    chk("C2.4-X10.2", "the link is bound to its viewer and expires: valid for the owner who got it (positive control) · invalid for another staff member · invalid after exp · a STAFF who cannot see the activity and another tenant ⇒ NOT_FOUND (no link issued)",
      okOwner && !okStaff && !okExpired && refused(gs, "NOT_FOUND") && !gs.v && refused(gb, "NOT_FOUND"), "bound + expiring + 404",
      `owner=${okOwner} staff=${okStaff} expired=${okExpired} staffGet=${rd(gs)} foreign=${rd(gb)}`);
  }
  {
    const ga = await call(ACT.getActivity, cA, owner, callId);
    const la = await call(ACT.listActivities, cA, owner, { contactId: ctMain.id, pageSize: 200 });
    const item = ((la.v?.items ?? []) as Any[]).find((x) => x.id === callId);
    const blob = j([ga.v, item]);
    const bad = ["private://", `t/${tidA}/private`, CDN, "qc-c24-cdn"].filter((s) => blob.includes(s));
    chk("C2.4-X10.3", "activity DTOs (getActivity · listActivities) expose `hasRecording: true` and never the private path / sentinel / CDN URL",
      ga.ok && !!item && ga.v?.hasRecording === true && item.hasRecording === true && bad.length === 0, "flag only", `get=${rd(ga)} has=${ga.v?.hasRecording}/${item?.hasRecording} leaks=${bad.join(",") || "-"}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X9 — danger + audit
  // ═════════════════════════════════════════════════════════════════════════════
  out("── X9 · danger + audit ──");
  {
    const c = await mkCall(cA, ctMain.id);
    const row = await actRow(c.id);
    const fid = row?.recordingFileId ?? NONE;
    const asset = await P.fileAsset.findFirst({ where: { id: fid } });
    const d1 = await call(CL.removeRecording, cA, owner, c.id, {}, storeDeps);
    const d2 = await call(CL.removeRecording, cA, owner, c.id, { confirm: true, reason: "abc" }, storeDeps);
    const kept = await actRow(c.id);
    const d3 = await call(CL.removeRecording, cA, owner, c.id, { confirm: true, reason: "ลูกค้าขอลบเสียงสนทนา" }, storeDeps);
    const after = await actRow(c.id);
    const gone = !(await P.fileAsset.findFirst({ where: { id: fid } }));
    const g = await call(CL.getRecording, cA, owner, c.id);
    chk("C2.4-X9.1", "removeRecording is a danger op: no confirm ⇒ CONFIRM_REQUIRED · reason < 5 chars ⇒ VALIDATION (recording kept) · confirm + reason ⇒ FileAsset deleted through storage del (private path), recordingFileId null, getRecording ⇒ null",
      refused(d1, ["CONFIRM_REQUIRED", "VALIDATION"]) && refused(d2, "VALIDATION") && kept?.recordingFileId === fid && d3.ok && after?.recordingFileId === null && gone &&
        DELS.some((p) => !!asset && p.includes(String(asset.path))) && g.ok && g.v === null,
      "refused ×2 · removed", `d1=${rd(d1)} d2=${rd(d2)} kept=${kept?.recordingFileId === fid} d3=${rd(d3)} null=${after?.recordingFileId === null} gone=${gone} get=${g.ok ? j(g.v) : g.err}`);
  }
  {
    const audits = ((await P.auditLog.findMany({ where: { tenantId: tidA } })) as Any[]).filter((a) => /^crm\.activity\./.test(a.action));
    const acts = new Set(audits.map((a) => a.action as string));
    const need = ["crm.activity.log", "crm.activity.recording_attach", "crm.activity.recording_remove", "crm.activity.ai_request", "crm.activity.ai_accept", "crm.activity.ai_reject"];
    const miss = need.filter((n) => !acts.has(n));
    chk("C2.4-X9.2", "every C2.4 mutation is audited: crm.activity.log · recording_attach · recording_remove · ai_request · ai_accept · ai_reject (targetId = activity id)",
      miss.length === 0 && audits.filter((a) => a.action !== "crm.activity.log").every((a) => !!a.targetId), "6 actions", `missing=${miss.join(",") || "-"}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S8.14 — recording purge (R-A)
  // ═════════════════════════════════════════════════════════════════════════════
  {
    await setCrm(crmA, { retention: { recordingDays: 30 } });
    const old = await mkCall(cA, ctMain.id);
    const recent = await mkCall(cA, ctMain.id);
    const oldRow = await actRow(old.id);
    const past = new Date(Date.now() - 40 * DAY);
    if (oldRow) await P.crmActivity.update({ where: { id: old.id }, data: { startAt: past, createdAt: past, transcript: `${MARK_T}-เก่า` } });
    const recentRow = await actRow(recent.id);
    const pr = await call(CL.purgeRecordings, new Date(), { tenantIds: [tidA], deps: storeDeps });
    const o2 = await actRow(old.id);
    const r2 = await actRow(recent.id);
    const oldGone = !!oldRow?.recordingFileId && !(await P.fileAsset.findFirst({ where: { id: oldRow.recordingFileId } }));
    chk("C2.4-S8.14", "purgeRecordings (retention.recordingDays = 30): a 40-day-old CALL loses its recording (FileAsset deleted, recordingFileId null, transcript null) but the activity is kept · a recent one is untouched",
      pr.ok && !!o2 && o2.recordingFileId === null && o2.transcript === null && oldGone && !!r2 && r2.recordingFileId === recentRow?.recordingFileId && !!r2.recordingFileId,
      "old purged · recent kept", `purge=${rd(pr)} old=${o2 ? `${o2.recordingFileId}/${o2.transcript === null}` : "-"} gone=${oldGone} recent=${!!r2?.recordingFileId}`, "MAJOR");
    await setCrm(crmA, { retention: { recordingDays: 730 } });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // U — PERMANENT RULE: uiVersion 1 ⇒ no new UI, no behaviour change, rows kept, resume at 2
  // ═════════════════════════════════════════════════════════════════════════════
  out("── U · uiVersion 1 ──");
  {
    const vCall = await mkCall(cV, ctV.id); // created while at 2
    const vConv = await mkConv(tidV, chatV, ctV.partyId);
    const vSvc = await P.bookingService.create({ data: { tenantId: tidV, unitId: uBookV.id, name: `บริการ-V ${TAG}`, durationMin: 60 } });
    const vStaff = await P.bookingStaff.create({ data: { tenantId: tidV, unitId: uBookV.id, name: `พนักงาน-V ${TAG}` } });
    const vAppt = await mkAppt(tidV, uBookV.id, vSvc.id, vStaff.id, ctV.partyId, at(2));
    const vRemindMark = `เตือนวีหนึ่ง${rand}`;
    const vTask = await mkTask(cV, vRemindMark, new Date(Date.now() - 60_000));
    await setCrm(crmV, { uiVersion: 1 });
    const n0 = await P.crmActivity.count({ where: { tenantId: tidV } });
    const tr0 = TR_CALLS.length;
    const ai0 = AI_CALLS.length;
    const u1 = await logCall(cV, owner, { contactId: ctV.id, direction: "OUT", outcome: "สนใจ", recording: rec() });
    const u2 = await call(CL.attachRecording, cV, owner, vCall.id, rec(), storeDeps);
    const u3 = await call(CL.transcribeCall, cV, owner, vCall.id, trDeps());
    const u4 = await call(CL.scanBusinessCard, cV, owner, img(), { ai: fakeAi("card", CARD_JSON) });
    const cal = await call(ACT.calendar, cV, owner, range);
    const calLeak = cal.ok && apIds(cal).includes(vAppt);
    const n1 = await P.crmActivity.count({ where: { tenantId: tidV } });
    chk("C2.4-U.1", "uiVersion 1: logCall · attachRecording · transcribeCall · scanBusinessCard ⇒ refused with the CRM_V2_DISABLED Thai message (CrmV2DisabledError) · nothing written · transcriber/AI never called · calendar shows no merged appointment",
      [u1, u2, u3, u4].every((r) => isV1Refusal(r, V1MSG)) && n1 === n0 && TR_CALLS.length === tr0 && AI_CALLS.length === ai0 && !calLeak && (await P.aiProposal.count({ where: { tenantId: tidV } })) === 0,
      "4 refusals · 0 effects", `${[u1, u2, u3, u4].map((r) => (r.ok ? "OK!" : r.name || r.code)).join(",")} rows+${n1 - n0} tr+${TR_CALLS.length - tr0} ai+${AI_CALLS.length - ai0} calLeak=${calLeak}`);
    await resolveConv(vConv.id);
    const beforeCt = await P.crmContact.findFirst({ where: { id: ctV.id } });
    const s1 = await consume(statusEvt(tidV, chatV, vConv.id, "RESOLVED"));
    const s2 = await consume(chatEvt(tidV, chatV, "chat.message.received", { conversationId: vConv.id, channel: "LINE" }));
    const afterCt = await P.crmContact.findFirst({ where: { id: ctV.id } });
    chk("C2.4-U.2", "uiVersion 1: chat RESOLVED ⇒ no CHAT activity · chat message ⇒ lastActivityAt untouched · consumers still succeed (the v1 chat flow is unchanged)",
      s1.ok && s2.ok && (await chatActs(vConv.id)).length === 0 && j(beforeCt?.lastActivityAt) === j(afterCt?.lastActivityAt), "no effect",
      `status=${rd(s1)} msg=${rd(s2)} acts=${(await chatActs(vConv.id)).length} last=${j(beforeCt?.lastActivityAt)}→${j(afterCt?.lastActivityAt)}`);
    const rv = await call(RM.remindDue, new Date(), { tenantIds: [tidV], deps: pushDeps });
    await pump([tidV]);
    const nv = await notesWith(tidV, vRemindMark);
    const taskKept = await actRow(vTask);
    chk("C2.4-U.3", "uiVersion 1: remindDue skips the system (no notification, no push) and keeps the row (remindAt unchanged)",
      rv.ok && nv.length === 0 && !!taskKept?.remindAt && !PUSHES.some((p) => j(p).includes(vTask)), "skipped · kept", `run=${rd(rv)} notes=${nv.length} kept=${!!taskKept?.remindAt}`);
    {
      const v1Hits = V1_FILES.filter((f) => /CrmCallLogModal|CrmClickToCall|crm-call-|transcribeCall|calls-actions/.test(read(f)));
      const pages = walk(CRM_PAGES).filter((f) => f.endsWith("page.tsx"));
      const usesCall = (f: string) => {
        const dir = f.replace(/\/page\.tsx$/, "");
        return [read(f), ...walk(join(dir, "_components")).map(read)].some((s) => /CrmCallLogModal|CrmClickToCall/.test(s));
      };
      const ungated = pages.filter((f) => usesCall(f) && !/requireCrmV2Page|pickCrmPage/.test(read(f)));
      chk("C2.4-U.4", "uiVersion 1 sees no new UI: the v1 files (crm/ui.tsx · crm/actions.ts · ActivitiesV1Page) reference nothing of the call modal · every page that renders the modal / click-to-call is gated by requireCrmV2Page or pickCrmPage [static]",
        v1Hits.length === 0 && ungated.length === 0, "gated", `v1Hits=${v1Hits.join(",") || "-"} ungated=${ungated.join(",") || "-"}`);
    }
    await setCrm(crmV, { uiVersion: 2 });
    const back = await consume(statusEvt(tidV, chatV, vConv.id, "RESOLVED"));
    const rv2 = await call(RM.remindDue, new Date(), { tenantIds: [tidV], deps: pushDeps });
    await pump([tidV]);
    const nv2 = await notesWith(tidV, vRemindMark);
    chk("C2.4-U.5", "[positive control for U.1–U.3] the same system flipped back to 2: a replayed RESOLVED creates its ONE activity and the kept reminder is delivered once — so the v1 results above are the gate, not broken code",
      back.ok && (await chatActs(vConv.id)).length === 1 && rv2.ok && nv2.length === 1, "resumed", `acts=${(await chatActs(vConv.id)).length} notes=${nv2.length}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X8 — PDPA: outbox · OpsEvent · logs · audit · AI prompts
  // ═════════════════════════════════════════════════════════════════════════════
  out("── X8 · PDPA ──");
  await pump(TENANTS);
  {
    const rows = (await P.outboxEvent.findMany({ where: { tenantId: { in: TENANTS } } })) as Any[];
    const needles = [...PII, MARK_T, MARK_S, MARK_N, MARK_C, MARK_CS, "private://", "/api/files/", "/private/"];
    const bad = rows.filter((r) => needles.some((n) => j(r.payload).includes(n)));
    chk("C2.4-X8.1", "outbox payloads of our tenants (all events of this run) carry no phone / e-mail / name / transcript / summary / chat text / recording link or path",
      rows.length > 0 && bad.length === 0, "0 dirty", `rows=${rows.length} dirty=${bad.map((r) => r.type).join(",") || "-"}`);
  }
  {
    const ops = (await P.opsEvent.findMany({ where: { tenantId: { in: TENANTS } } })) as Any[];
    const needles = [...PII, MARK_T, MARK_S, MARK_N, MARK_C, MARK_CS];
    const badOps = ops.filter((o) => needles.some((n) => `${o.message} ${o.detail ?? ""}`.includes(n)));
    const badLogs = LOGS.filter((l) => [MARK_T, MARK_S, MARK_N, MARK_C, MARK_CS, ...PII].some((n) => l.includes(n)));
    chk("C2.4-X8.2", "OpsEvent rows of our tenants and every console line printed by product code during this run contain no transcript / summary / chat text / phone / e-mail",
      badOps.length === 0 && badLogs.length === 0, "clean", `ops=${ops.length} badOps=${badOps.length} logs=${LOGS.length} badLogs=${badLogs.length} ${cut(badLogs[0], 120)}`);
  }
  {
    const tx = AI_CALLS.filter((c) => c.tag === "transcribe");
    const ch = AI_CALLS.filter((c) => c.tag === "chat");
    const piiIn = (c: AiCall) => [PHONE_T, fmtPhone(PHONE_T), EMAIL_T, ...PII.filter((p) => /@|^0\d{9}$|^0\d\d-\d{3}-\d{4}$/.test(p))].some((p) => c.text.includes(p));
    chk("C2.4-X8.3", "AI prompts (call summary · chat summary) contain NO phone number / e-mail (redacted) while still carrying the transcript / message text (positive control: MARK present)",
      tx.length > 0 && ch.length > 0 && tx.every((c) => !piiIn(c) && c.text.includes(MARK_T)) && ch.every((c) => !piiIn(c) && c.text.includes(MARK_C)),
      "redacted", `transcribe=${tx.length} (pii=${tx.filter(piiIn).length}, text=${tx.filter((c) => c.text.includes(MARK_T)).length}) chat=${ch.length} (pii=${ch.filter(piiIn).length})`);
  }
  {
    const audits = (await P.auditLog.findMany({ where: { tenantId: { in: TENANTS } } })) as Any[];
    const bad = audits.filter((a) => [MARK_T, "private://", `/private/`].some((n) => j([a.before, a.after]).includes(n)));
    const txns = (await P.aiCreditTxn.findMany({ where: { tenantId: { in: TENANTS } } })) as Any[];
    const badTx = txns.filter((t) => PII.some((p) => String(t.note ?? "").includes(p)) || String(t.note ?? "").includes(MARK_T));
    chk("C2.4-X8.4", "AuditLog before/after never holds transcript text or a private file path · AiCreditTxn notes carry ids only", audits.length > 0 && bad.length === 0 && badTx.length === 0,
      "clean", `audits=${audits.length} bad=${bad.map((a) => a.action).join(",") || "-"} txBad=${badTx.length}`, "MAJOR");
  }
  {
    const net = FETCHES.filter((f) => !/qc-c24-cdn\.invalid|bunnycdn|bunny\.net|storage\.bunny/.test(f));
    const ai = FETCHES.filter((f) => /openrouter|anthropic|openai/i.test(f));
    chk("C2.4-X8.5", "no real external API was reached: zero requests to an AI provider (OpenRouter/Anthropic/OpenAI) — every AI/STT call went through the injected fakes (all fetch is stubbed; non-storage fetches listed)",
      ai.length === 0, "0 AI requests", `ai=${ai.length} other=${cut(net.join(" | "), 200) || "-"}`);
  }
  void manager; void apCancel;
} catch (e) {
  chk("C2.4-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — every row of the throwaway tenants (4 passes over every table with tenantId), systems/units/tenants, users.
  // No drainOutbox (not tenant-scoped) — our PENDING events go with the tenant sweep.
  // ═════════════════════════════════════════════════════════════════════════════
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* order/FK — retried next pass */ } };
  if (ids.length > 0) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[])
      .map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
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
      chk("C2.4-CLEAN", "the oracle gives the QC database back exactly as found — every throwaway tenant, every row it owned and the throwaway users are gone",
        left.length === 0 && tenants === 0 && users === 0, "0 rows · 0 tenants · 0 users", `${left.join(" · ") || "-"} · tenants=${tenants} users=${users}`, "MAJOR");
    } catch (e) {
      chk("C2.4-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
out(`\n${passed === total ? "🟢" : "🔴"} C2.4: ${passed}/${total} · outbound fetch stubbed ${FETCHES.length}×`);
out(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
