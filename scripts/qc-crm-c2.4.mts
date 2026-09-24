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
//      transcribeCall(ctx, actor, activityId, deps?: { transcriber?: CrmTranscriber; ai?: AiProvider }) → { proposalId; reused: boolean;
//        working?: boolean } (addendum H3/H4: a job of the same activity already in flight ⇒ that same job back, 15-minute lease)
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
//        fileId; mime; open: () => Promise<Uint8Array | null> }): Promise<{ text: string; language?: string; model?: string;
//        costMicroUsd?: number (addendum H13 — when present the ONE charge includes it) }> }` ·
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
//        scanBusinessCardAction · acceptLeadProposalAction · getRecordingAction (addendum H6 — mints the expiring link per click)
//      calendar `_components/CalendarViews.tsx` renders appointments with data-testid="crm-calendar-appointment" marked read-only
//        ("อ่านอย่างเดียว" or aria-readonly) · business-card entry `crm-card-scan` · booking button `crm-book-via-booking`
//      every literal testid has a row (wo "C2.4") in scripts/crm-ui-inventory.json
//   H. ORACLE-EDIT ADDENDUM (ผู้คุมงาน · 24 ก.ย. 2569 · ruling round 2 after the independent review — S9.*, X8.6, N16 and F7 judge
//      exactly this and nothing more)
//      H1 remindDue delivers EVERY due activity of the window: 205 due rows in ONE system ⇒ at most three runs, each activity notified
//         exactly once (a fixed page that never advances starves the rest for ever) · done / future ⇒ none
//      H2 the reminder's AppNotification.title and the push payload carry NO phone number out of the activity title (a notification
//         title leaves the product through the digest e-mail) — the owner still gets exactly ONE notification per (activityId, remindAt)
//      H3 transcribeCall while a job of the SAME activity is in flight ⇒ that same job back (`reused: true`, or `working: true` with no
//         usable proposal yet), never a second transcriber call · accepting that activity's card meanwhile ⇒ CONFLICT (calm Thai) · the
//         transcript/aiSummary/aiNextStep a human ACCEPTED earlier are never nulled to make room for the new job · when the job ends:
//         exactly ONE more charge and its own text inside the new PENDING proposal
//      H4 a claim left behind by a dead process is leased for 15 minutes: after that the next transcribeCall RETRIES (the transcriber
//         runs again) and hands back a usable card instead of a "still working" card that never clears · ≤ 1 PENDING ai_fill per activity
//      H5 a month cell shows three rows plus a "+<n> รายการ" counter for everything it did not show (4 activities + 0 appointments ⇒
//         three chips and "+1 รายการ"); nothing is dropped with nothing on screen to say so
//      H6 the recording is reachable where the human stands: contact 360 AND deal 360 carry "ฟังไฟล์เสียง" (server action
//         `getRecordingAction` → calls.getRecording — the link is minted per click, never stored) and "ลบไฟล์เสียง" (danger: confirm +
//         reason ≥ 5 → `removeRecordingAction`), testids `crm-call-recording-play|listen` and `crm-call-recording-delete|remove`, with
//         inventory rows (wo C2.4) for `/contacts/[contactId]` AND `/deals/[dealId]` ⇒ CONTRACT G gains `getRecordingAction`
//      H7 calendar() puts no silent cap on the Parties it asks the facades about: 1,050 visible contacts each with one in-window
//         appointment ⇒ all 1,050 rows come back
//      H8 an API-key actor gets `appointments: []` (those rows belong to booking/clinic/school — an integration asks those modules
//         directly) while a human with unit access gets them
//      H9 acceptLeadProposal that fails for something that is not the caller's fault leaves the proposal PENDING and the retry creates
//         the contact exactly once (a validation failure is still refused)
//      H10 the chat bridge scans EVERY open CRM system of the tenant (never `gates[0]`): a shop whose OLDEST CRM system is still
//         uiVersion 1 still gets the v2 contact's lastActivityAt bumped and its waiting sequence stopped
//      H11 a RESOLVED that arrives before the Party has any contact writes nothing and is not lost: once the contact exists the next
//         RESOLVED writes exactly ONE CHAT activity for that conversation
//      H12 callAiStatus creates no AiCreditWallet and no GRANT transaction (reading a state never enrols the shop in the credit system)
//      H13 the CrmTranscriber result MAY carry `costMicroUsd?: number` — when it does, the ONE charge of that transcription includes it
//         (F7 · MINOR: the field is optional, the charge must not silently drop a cost the provider reported)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// WHAT THIS FILE PROVES: S0 structure · S1–S7 of CRM-RUN (24) · S8 brief extras · S9 the reviewer's findings (ORACLE-EDIT below) ·
//   U PERMANENT RULE (uiVersion 1) · X1 X2 X3 X4 X5 X6 X8 X9 X10 · CLEAN.   N/A: X7 — no public endpoint in C2.4 (the call-webhook
//   route is deliberately not built; files go through the C0.4 route which qc-crm-c0.4 covers).
// CHECK INVENTORY: 91 checks = the original 78 + 13 added by the ORACLE-EDIT of ผู้คุมงาน (24 ก.ย. 2569) after the independent review:
//   S9.1 reminders never starve (205 due rows) · S9.2 the in-flight transcription card (fields kept · B refused · one extra charge) ·
//   S9.3 a stale 15-minute claim is released and retried · S9.4 the month view never swallows the 4th row · S9.5 ฟัง/ลบไฟล์เสียง
//   reachable from contact 360 AND deal 360 · S9.6 the calendar is not capped at the oldest 1,000 contacts · S9.7 an API key gets no
//   merged appointments · S9.8 a failed lead acceptance leaves the proposal PENDING (retry works) · S9.9 the chat gate reads every open
//   CRM system (not gates[0]) · S9.10 a RESOLVED that arrives before the contact still yields exactly one CHAT activity ·
//   X8.6 no customer phone from the activity title in the reminder push/notification · N16 callAiStatus creates no wallet/GRANT ·
//   F7 the charge includes the transcriber's reported cost (MINOR — depends on `costMicroUsd?` entering the CONTRACT).
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
    // the whole v2 page tree (calendar · contacts · deals · …) + the CRM components: a row for a testid that lives on the deal 360
    //   (S9.5 asks for the recording controls there) must NOT be called an orphan
    const uiSrc = [callUi, ...walk(CRM_PAGES).map(read), ...walk("src/components/crm").map(read)].join("\n");
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
  // ═════════════════════════════════════════════════════════════════════════════
  // S9 — ORACLE-EDIT (ผู้คุมงาน · 24 ก.ย. 2569 · หลังผู้ตรวจอิสระ): ช่องที่ผู้ตรวจเจอ — เขียนตาม "พฤติกรรมที่เคาะแล้ว"
  //   S9.1 reminders starvation (205 ใบในหน้าต่างเดียว) · S9.2/S9.3 การ์ด AI ที่กำลังทำงาน + claim ค้าง 15 นาที ·
  //   S9.4 มุมมองเดือนซ่อนรายการที่ 4 · S9.5 ปุ่มฟัง/ลบไฟล์เสียงต้องกดได้จริง · S9.6 เพดานปฏิทิน 1,000 ผู้ติดต่อ ·
  //   S9.7 คีย์ API กับปฏิทิน · S9.8 ลองใหม่ได้เมื่อรับข้อเสนอลีดล้ม · S9.9 ประตูแชทเมื่อระบบแรกเป็น v1 · S9.10 RESOLVED มาก่อนผู้ติดต่อ
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── S9 · reviewer findings (ORACLE-EDIT) ──");
  {
    // S9.1 — 205 due reminders in ONE system: every single one must be delivered exactly once (no page-size starvation)
    //   the notification is located the same way S5.2 locates it: by the activity TITLE the reminder carries (or by the activity id,
    //   whichever the builder puts in title/body — AppNotification has no data/link column) · the marker is DELIMITED (`#001#`) so the
    //   row of activity 1 can never be counted as a hit of activity 10.
    const MANY = 205;
    const NOWM = new Date();
    const pad = (i: number) => String(i).padStart(3, "0");
    const manyIds = Array.from({ length: MANY }, (_x, i) => `${TAG}-many-${pad(i)}`);
    const manyMark = (i: number) => `เตือนจำนวนมาก${rand}#${pad(i)}#`;
    const markDone = `เตือนเสร็จแล้ว${rand}#`;
    const markFuture = `เตือนอนาคต${rand}#`;
    await P.crmActivity.createMany({
      data: manyIds.map((id, i) => ({
        id, tenantId: tidA, systemId: crmA, contactId: ctMain.id, type: "TASK", title: manyMark(i),
        ownerUserId: userA, dueAt: new Date(NOWM.getTime() + DAY), remindAt: new Date(NOWM.getTime() - 60_000 - i * 1_000),
      })),
    });
    const idDone = `${TAG}-many-done`;
    const idFuture = `${TAG}-many-future`;
    await P.crmActivity.createMany({
      data: [
        { id: idDone, tenantId: tidA, systemId: crmA, type: "TASK", title: markDone, ownerUserId: userA, dueAt: new Date(NOWM.getTime() + DAY), remindAt: new Date(NOWM.getTime() - 60_000), doneAt: new Date() },
        { id: idFuture, tenantId: tidA, systemId: crmA, type: "TASK", title: markFuture, ownerUserId: userA, dueAt: new Date(NOWM.getTime() + 2 * DAY), remindAt: new Date(NOWM.getTime() + 6 * 3_600_000) },
      ],
    });
    const runs: Res[] = [];
    for (let i = 0; i < 3; i += 1) {
      runs.push(await call(RM.remindDue, new Date(NOWM.getTime() + i * 60_000), { tenantIds: [tidA], deps: pushDeps }));
      await pump([tidA]);
    }
    const notes = ((await P.appNotification.findMany({ where: { tenantId: tidA, recipientUserId: userA } })) as Any[]).map((n) => `${n.title} ${n.body}`);
    const per = manyIds.map((id, i) => notes.filter((t) => t.includes(manyMark(i)) || t.includes(id)).length);
    const missing = per.filter((k) => k === 0).length;
    const dupes = per.filter((k) => k > 1).length;
    const controls = [markDone, markFuture].map((m, i) => notes.filter((t) => t.includes(m) || t.includes([idDone, idFuture][i])).length);
    chk("C2.4-S9.1", `reminders never starve: ${MANY} open activities whose remindAt is already past in ONE system ⇒ after at most three remindDue runs (+ our pump) EVERY one has exactly ONE notification for its owner — none missing (a 100/200-row page that never advances loses the rest for ever) and none doubled · [positive controls] a DONE task and a reminder 6 hours in the future get none`,
      runs.every((r) => r.ok) && missing === 0 && dupes === 0 && controls.every((k) => k === 0),
      `${MANY} × exactly 1`, `runs=${runs.map(rd).join("/")} missing=${missing} duplicated=${dupes} delivered=${per.filter((k) => k === 1).length}/${MANY} controls=${controls.join(",")}`);
  }
  // ─── S9.2 / S9.3 · the in-flight transcription card ───
  const zCall = await mkCall(cA, ctMain.id);
  {
    let releaseA: () => void = () => {};
    const gate = new Promise<void>((res) => { releaseA = res; });
    const slowTr = { key: "qc-slow", transcribe: async (input: Any) => { TR_CALLS.push(String(input?.activityId ?? "")); await gate; return { text: TRANSCRIPT, language: "th" }; } };
    // round 1: a normal transcribe + accept ⇒ the activity really holds an accepted transcript/summary/next step
    const p1 = await call(CL.transcribeCall, cA, owner, zCall.id, trDeps(0));
    const acc1 = p1.ok ? await call(CL.acceptCallAiProposal, cA, owner, String(p1.v?.proposalId ?? NONE)) : p1;
    const beforeRow = await actRow(zCall.id);
    const note = `crm.call.transcribe#${zCall.id}`;
    const chargesBefore = (await usageFor(tidA, note)).length;
    // round 2: A starts a SLOW transcription, B arrives while it runs
    const trBefore = TR_CALLS.length;
    const pA = call(CL.transcribeCall, cA, owner, zCall.id, { transcriber: slowTr, ai: fakeAi("transcribe", AI_JSON) });
    for (let i = 0; i < 60 && TR_CALLS.length === trBefore; i += 1) await sleep(100);
    const started = TR_CALLS.length > trBefore;
    const b = await call(CL.transcribeCall, cA, owner, zCall.id, trDeps(0));
    const bSaysWorking = b.ok && (b.v?.working === true || b.v?.reused === true);
    const noSecondRun = TR_CALLS.length === trBefore + 1;
    const midRow = await actRow(zCall.id);
    const bAccept = await call(CL.acceptCallAiProposal, cA, owner, String(b.v?.proposalId ?? p1.v?.proposalId ?? NONE));
    releaseA();
    const aDone = await pA;
    const chargesAfter = (await usageFor(tidA, note)).length;
    const props = await proposalsOf(tidA, zCall.id);
    const fresh = props.find((x) => String(x.status) === "PENDING");
    const kept = !!midRow && String(midRow.transcript ?? "").includes(MARK_T) && String(midRow.aiSummary ?? "").includes(MARK_S) && String(midRow.aiNextStep ?? "").includes(MARK_N);
    chk("C2.4-S9.2", "the in-flight card: while connection A is still transcribing, connection B gets `working: true` (or the same job reused) instead of a second transcriber run, B's accept is refused with CONFLICT in a calm Thai message (the job is still running — the wording is the builder's), and the transcript/summary/next step the shop ACCEPTED earlier are still there (never nulled to make room for the new job) · when A finishes it charges exactly once more and its own text is in the new proposal",
      p1.ok && acc1.ok && !!beforeRow && started && bSaysWorking && noSecondRun && kept && refused(bAccept, "CONFLICT") && aDone.ok && chargesAfter - chargesBefore === 1 && !!fresh && String(fresh?.payload?.transcript ?? "").includes(MARK_T),
      "working · fields kept · 1 charge",
      `round1=${rd(p1)}/${rd(acc1)} started=${started} b=${b.ok ? j(b.v) : b.err} secondRun=${!noSecondRun} fieldsKept=${kept} bAccept=${b.ok ? bAccept.code || rd(bAccept) : "-"} msg=${cut(bAccept.msg, 60) || "-"} a=${rd(aDone)} charges+${chargesAfter - chargesBefore} freshProposal=${!!fresh}`);
  }
  {
    // S9.3 — a claim that was left behind (process died mid-job) must be released after 15 minutes, not block the card for ever
    const wCall = await mkCall(cA, ctMain.id);
    let releaseW: () => void = () => {};
    const stuck = new Promise<void>((res) => { releaseW = res; });
    const hangTr = { key: "qc-hang", transcribe: async (input: Any) => { TR_CALLS.push(String(input?.activityId ?? "")); await stuck; return { text: TRANSCRIPT, language: "th" }; } };
    const trBefore = TR_CALLS.length;
    const hanging = call(CL.transcribeCall, cA, owner, wCall.id, { transcriber: hangTr, ai: fakeAi("transcribe", AI_JSON) });
    for (let i = 0; i < 60 && TR_CALLS.length === trBefore; i += 1) await sleep(100);
    // Age the claim of that dead job by 20 minutes — whatever the builder stamps the lease with, shape-agnostic:
    //   the columns it may lease on (createdAt · updatedAt · a `claimedAt` it added — a column that does not exist just fails and is
    //   ignored) AND every timestamp the claim row carries in its own bookkeeping note (epoch-ms or ISO). `expiresAt` is left alone on
    //   purpose: the card must be STALE, not expired — that is the case a human is stuck in front of.
    const AGE = 20 * 60_000;
    for (const col of ["createdAt", "updatedAt", "claimedAt"])
      await P.$executeRawUnsafe(`UPDATE "AiProposal" SET "${col}" = now() - interval '20 minutes' WHERE "tenantId" = $1 AND "conversationId" = $2`, tidA, `crm:activity:${wCall.id}`).catch(() => 0);
    for (const row of (await P.aiProposal.findMany({ where: { tenantId: tidA, conversationId: `crm:activity:${wCall.id}` } })) as Any[]) {
      const note = typeof row?.resultNote === "string" ? (row.resultNote as string) : "";
      const aged = note
        .replace(/\d{13}/g, (m) => String(Number(m) - AGE))
        .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, (m) => new Date(Date.parse(m) - AGE).toISOString());
      if (aged && aged !== note) await P.aiProposal.update({ where: { id: row.id }, data: { resultNote: aged } }).catch(() => null);
    }
    const trAfterBackdate = TR_CALLS.length;
    const retry = await call(CL.transcribeCall, cA, owner, wCall.id, trDeps(0));
    const retried = TR_CALLS.length > trAfterBackdate;
    const usable = retry.ok && typeof retry.v?.proposalId === "string" && String(retry.v?.proposalId ?? "") !== "" && retry.v?.working !== true;
    releaseW();
    await hanging.catch(() => null);
    const props = await proposalsOf(tidA, wCall.id);
    const pending = props.filter((x) => String(x.status) === "PENDING").length;
    chk("C2.4-S9.3", "a STALE claim is released: with the claim of a dead job backdated 20 minutes (over the 15-minute lease), the next transcribeCall RETRIES the job (the transcriber runs again) and hands back a usable proposal instead of an empty \"still working\" card that would never clear · at most one PENDING proposal remains for that activity",
      retried && usable && pending <= 1, "retried · usable card", `retried=${retried} retry=${retry.ok ? j(retry.v) : retry.err} pendingProposals=${pending}`);
  }
  {
    // S9.4 — month view: 4 activities on one day, 0 appointments ⇒ 3 chips + "+1 รายการ"
    const CV = (await import("@/app/app/sys/[id]/crm/calendar/_components/CalendarViews" as string).catch(() => ({}))) as Any;
    const body = typeof CV?.CalendarBody === "function" ? CV.CalendarBody : null;
    const day = at(2, 9);
    const items = Array.from({ length: 4 }, (_x, i) => ({
      id: `${TAG}-mv-${i}`, type: "TASK", title: `งานเดือน ${TAG}-${i}`, startAt: new Date(day.getTime() + i * 60_000).toISOString(), dueAt: null, doneAt: null,
      createdAt: new Date(day.getTime()).toISOString(), contactId: ctMain.id, companyId: null, dealId: null, ownerUserId: userA, direction: null, channel: null,
      outcome: null, durationSec: null, body: null, pinned: false, priority: "NORMAL", hasRecording: false, contactName: null, companyName: null, dealTitle: null, ownerName: null,
    })) as Any[];
    // We do NOT render (a chip is a next/link that wants a router): we walk the element tree the server component returned.
    //   Every activity that reached a chip shows up in that chip's own props (`item`) ⇒ how many rows the day really shows, whatever
    //   the chip component is called; every literal string/number child is text a human reads ⇒ the counter.
    let text = "";
    const shown = new Set<string>();
    let ran = false;
    if (body) {
      try {
        const tree = body({ systemId: crmA, view: "month", anchorMs: day.getTime(), items, appointments: [] });
        ran = true;
        const scan = (v: Any, depth: number): void => { // props of a node (never `children`, never React's internals)
          if (v === null || v === undefined || depth > 6) return;
          if (typeof v === "string") { for (const it of items) if (v.includes(String(it.id))) shown.add(String(it.id)); return; }
          if (Array.isArray(v)) { for (const x of v) scan(x, depth + 1); return; }
          if (typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, Any>)) { if (k === "children" || k.startsWith("_")) continue; scan(x, depth + 1); }
        };
        const walkEl = (node: Any, depth: number): void => {
          if (node === null || node === undefined || typeof node === "boolean" || depth > 40) return;
          if (Array.isArray(node)) { for (const n of node) walkEl(n, depth + 1); return; }
          if (typeof node === "string") { text += node; return; }
          if (typeof node === "number") { text += String(node); return; }
          if (typeof node !== "object") return;
          const props = ((node as Any).props ?? {}) as Record<string, Any>;
          scan(Object.fromEntries(Object.entries(props).filter(([k]) => k !== "children")), 0);
          walkEl(props.children, depth + 1);
        };
        walkEl(tree, 0);
      } catch { ran = false; }
    }
    const chips = shown.size;
    const counter = text.replace(/\s+/g, " ");
    const counterOk = /\+\s*1\s*รายการ/.test(counter);
    const src = read(`${CAL_DIR}/_components/CalendarViews.tsx`);
    const monthAt = src.indexOf('view === "month"');
    const monthBody = monthAt < 0 ? "" : src.slice(monthAt, monthAt + 2200);
    const gatedOnFive = /length\s*\+\s*appts\.length\s*>\s*5/.test(monthBody) || />\s*5\s*&&/.test(monthBody);
    const staticOk = monthAt >= 0 && !gatedOnFive && /รายการ/.test(monthBody);
    chk("C2.4-S9.4", `month view never swallows a row: a day holding FOUR activities and no appointments shows exactly three of them AND a "+1 รายการ" counter ${ran ? "(RUNTIME: the server component was called and its element tree walked — the chips are counted by the activities that actually reached one)" : "(STATIC: the month branch must not gate the counter on a literal \"> 5\" — it counts what it actually rendered)"} — with the old rule (> 5) the fourth row disappeared with nothing on screen to say so`,
      ran ? chips === 3 && counterOk : staticOk,
      ran ? "3 chips + +1 รายการ" : "counter not gated on > 5", `mode=${ran ? "runtime" : "static"} chips=${chips}/4 counter=${counterOk} text=${cut(counter.replace(/[^0-9+ ก-๙]/g, ""), 80) || "-"} gatedOnFive=${gatedOnFive}`, "MAJOR");
  }
  {
    // S9.5 — the recording must be reachable AND removable from the timeline / activity detail
    const compAll = [...walk("src/components/crm"), ...walk(`${CRM_PAGES}/contacts`), ...walk(`${CRM_PAGES}/deals`)].map(read).join("\n");
    const playTid = /crm-call-recording-(?:play|listen)(?![a-z])/.test(compAll); // NOT crm-call-recording-player (that is the modal's <audio>)
    const delTid = /crm-call-recording-(delete|remove)/.test(compAll);
    const labels = /ฟังไฟล์เสียง/.test(compAll) && /ลบไฟล์เสียง/.test(compAll);
    const wiredGet = /getRecording(Action)?\s*\(/.test(compAll);
    const wiredDel = /removeRecording(Action)?\s*\(/.test(compAll);
    const reason = /crm-call-recording-reason|เหตุผล/.test(compAll);
    const actSrc = read(CALLS_ACT); // the link is minted server-side: CONTRACT G gains getRecordingAction (ORACLE-EDIT · addendum H)
    const action = /getRecordingAction/.test(actSrc) && /removeRecordingAction/.test(actSrc);
    let inv: Any[] = [];
    try { inv = (JSON.parse(read(INVENTORY)).rows ?? []) as Any[]; } catch { inv = []; }
    const rowsFor = (page: string) => // the modal's `crm-call-recording-player` row does not count — these are the two controls of the 360 page
      inv.filter((r) => r?.wo === "C2.4" && String(r?.page ?? "") === page && /recording-(?:play|listen|delete|remove)(?![a-z])/.test(String(r?.testid ?? "")));
    const pages = ["/contacts/[contactId]", "/deals/[dealId]"];
    const noRows = pages.filter((pg) => rowsFor(pg).length < 2);
    chk("C2.4-S9.5", "a recording is reachable and removable from the places a human actually stands: the contact 360 and the deal 360 carry a \"ฟังไฟล์เสียง\" control that mints the expiring link through the server action (getRecording — never a stored URL) and a \"ลบไฟล์เสียง\" DANGER control wired to removeRecording (confirm + reason), and both testids have inventory rows (wo C2.4) for `/contacts/[contactId]` AND `/deals/[dealId]`",
      playTid && delTid && labels && wiredGet && wiredDel && action && reason && noRows.length === 0,
      "2 controls · rows on both pages", `play=${playTid} delete=${delTid} labels=${labels} getRecording=${wiredGet} removeRecording=${wiredDel} actions=${action} reason=${reason} pagesMissingRows=${noRows.join(",") || "-"}`, "MAJOR");
  }
  {
    // S9.6 — 1,050 visible contacts, each with one in-window booking appointment
    const BIG = 1050;
    const parties = Array.from({ length: BIG }, (_x, i) => ({ id: `${TAG}-bp-${i}`, tenantId: tidA, name: `ปาร์ตี้จำนวนมาก ${TAG}-${i}`, kind: "PERSON" }));
    await P.party.createMany({ data: parties });
    await P.crmContact.createMany({
      data: parties.map((pt, i) => ({ id: `${TAG}-bc-${i}`, tenantId: tidA, systemId: crmA, name: `ผู้ติดต่อจำนวนมาก ${TAG}-${i}`, firstName: `ผู้ติดต่อจำนวนมาก ${TAG}-${i}`, partyId: pt.id, ownerUserId: userA })),
    });
    const start = at(3, 4);
    await P.appointment.createMany({
      data: parties.map((pt, i) => ({
        id: `${TAG}-ba-${i}`, tenantId: tidA, unitId: uBook.id, serviceId: svc.id, staffId: bst.id, partyId: pt.id,
        startAt: new Date(start.getTime() + i * 1_000), endAt: new Date(start.getTime() + i * 1_000 + 1_800_000), status: "CONFIRMED",
        customerName: `ลูกค้าจำนวนมาก ${TAG}-${i}`, customerPhone: "0800000000",
      })),
    });
    const big = await call(ACT.calendar, cA, owner, { from: new Date(start.getTime() - DAY), to: new Date(start.getTime() + DAY) });
    const apps = (big.v?.appointments ?? []) as Any[];
    const mine = apps.filter((a) => String(a?.id ?? "").startsWith(`${TAG}-ba-`)).length;
    const truncated = big.v?.appointmentsTruncated === true || typeof big.v?.appointmentsCap === "number";
    chk("C2.4-S9.6", `the calendar does not stop at the oldest 1,000 contacts (ruling round 2): with ${BIG} visible contacts each holding ONE booking appointment inside the window, EVERY in-window appointment comes back — a 1,000-Party page hides tomorrow's appointments from a shop with a long customer list, and a flag that admits the cut is not a fix (the week must be complete)`,
      big.ok && mine >= BIG, `${BIG} rows`, `cal=${rd(big)} mine=${mine}/${BIG} total=${apps.length} truncatedFlag=${truncated}`, "MAJOR");
  }
  {
    // S9.7 — an API key never gets the merged appointments (ruling); a human with unit access does
    const keyCal = await call(ACT.calendar, cA, apiRead, range);
    const humanCal = await call(ACT.calendar, cA, owner, range);
    const keyApps = (keyCal.v?.appointments ?? []) as Any[];
    const humanApps = (humanCal.v?.appointments ?? []) as Any[];
    chk("C2.4-S9.7", "the merged appointments are for people, not for keys (ruling): an API-key actor holding only `crm.activity.read` gets `appointments: []` (the booking/clinic/school rows belong to those modules' own scopes and an integration must ask them directly) while the human OWNER on the same range gets the rows",
      keyCal.ok && keyApps.length === 0 && humanCal.ok && humanApps.length > 0,
      "[] for the key · rows for the human", `key=${rd(keyCal)} keyApps=${keyApps.length} human=${rd(humanCal)} humanApps=${humanApps.length}`, "MAJOR");
  }
  {
    // S9.8 — a failed acceptance must leave the proposal usable
    const scan = await call(CL.scanBusinessCard, cA, owner, { filename: "card-retry.jpg", contentType: "image/jpeg", data: audio(2048) }, { ai: fakeAi("card", JSON.stringify({ name: `นามบัตรลองใหม่ ${TAG}`, phone: phoneOf(), email: mailOf("retry"), company: `บริษัท ${TAG}`, jobTitle: "ผู้จัดการ" })) });
    const pid = String(scan.v?.proposalId ?? NONE);
    const statusOf = async () => String(((await P.aiProposal.findFirst({ where: { id: pid } })) as Any)?.status ?? "-");
    await setCrm(crmA, { uiVersion: 1 });
    const failed = await call(CL.acceptLeadProposal, cA, owner, pid);
    const afterFail = await statusOf();
    await setCrm(crmA, { uiVersion: 2 });
    const retry = await call(CL.acceptLeadProposal, cA, owner, pid);
    const afterRetry = await statusOf();
    const contactId = String(retry.v?.contactId ?? "");
    const created = contactId ? await P.crmContact.count({ where: { id: contactId } }) : 0;
    const bogus = await call(CL.acceptLeadProposal, cA, owner, `${TAG}-no-such-proposal`);
    const src = read(CALLS);
    const at0 = src.search(/(export\s+)?(async\s+)?function\s+acceptLeadProposal\b|acceptLeadProposal\s*=\s*async/); // the DEFINITION, not the header comment
    const fnBody = at0 < 0 ? "" : src.slice(at0, at0 + 2600);
    const releases = /\$transaction/.test(fnBody) || /status:\s*"PENDING"/.test(fnBody) || /catch/.test(fnBody);
    chk("C2.4-S9.8", "a failed acceptance does not burn the proposal: an attempt that fails for a reason that is NOT the caller's fault (here the shop's CRM v2 gate closing between the scan and the accept — the only non-validation failure an oracle can inject from outside) leaves the proposal PENDING, and the retry afterwards creates the contact exactly once · a proposal id that does not exist is still refused · [static] the PENDING→EXECUTED claim sits in the same transaction as the contact creation, or the claim is released in a catch",
      scan.ok && !failed.ok && afterFail === "PENDING" && retry.ok && !!contactId && created === 1 && afterRetry === "EXECUTED" && !bogus.ok && releases,
      "PENDING after the failure · retry works", `scan=${rd(scan)} failed=${failed.ok ? "ACCEPTED" : failed.code || failed.err} afterFail=${afterFail} retry=${rd(retry)} created=${created} afterRetry=${afterRetry} bogus=${bogus.ok ? "ACCEPTED" : bogus.code} claimSafe=${releases}`, "MAJOR");
  }
  {
    // S9.9 — the chat gate must look at every open CRM system, not only the oldest one
    const tidG = await mkTenant("gate");
    const chatG = await mk(tidG, "CHAT", "แชท-เกต");
    const crmOld = await mk(tidG, "CRM", "CRM เก่า v1");
    const crmNew = await mk(tidG, "CRM", "CRM ใหม่ v2");
    {
      const a = await P.appSystem.findFirst({ where: { id: crmOld } });
      await P.appSystem.update({ where: { id: crmNew }, data: { createdAt: new Date(new Date(a.createdAt).getTime() + 1000) } });
    }
    await setCrm(crmOld, { uiVersion: 1, bridgesEnabled: true });
    await setCrm(crmNew, { uiVersion: 2, bridgesEnabled: true });
    await wallet(tidG, 5_000_000);
    const pG = await mkParty(tidG, pii(`สองระบบเกต ${TAG}`));
    const ctOld = await rawContact(tidG, crmOld, "ในระบบเก่า", userA, pG);
    const ctNew = await rawContact(tidG, crmNew, "ในระบบใหม่", userA, pG);
    const cG = { tenantId: tidG, systemId: crmNew, actorUserId: userA };
    const convG = await mkConv(tidG, chatG, pG);
    const before = await P.crmContact.findFirst({ where: { id: ctNew.id } });
    let stopped = "-";
    if (typeof SEQ?.createSequence === "function" && typeof SEQ?.enroll === "function") {
      const sG = idOf((await call(SEQ.createSequence, cG, owner, { name: `ลำดับเกต ${TAG}`, stopOnReply: true, steps: [{ kind: "WAIT", waitDays: 30 }, { kind: "TASK", taskTitle: `งาน ${TAG}` }] })).v);
      const enG = await call(SEQ.enroll, cG, owner, { sequenceId: sG, contactId: ctNew.id });
      const enId = String(enG.v?.enrollmentId ?? enG.v?.id ?? NONE);
      await consume(chatEvt(tidG, chatG, "chat.message.received", { conversationId: convG.id, channel: "LINE" }));
      stopped = String(((await P.crmSequenceEnrollment.findFirst({ where: { id: enId } })) as Any)?.status ?? "-");
    } else {
      await consume(chatEvt(tidG, chatG, "chat.message.received", { conversationId: convG.id, channel: "LINE" }));
    }
    const after = await P.crmContact.findFirst({ where: { id: ctNew.id } });
    const oldRow = await P.crmContact.findFirst({ where: { id: ctOld.id } });
    const moved = !!after?.lastActivityAt && (!before?.lastActivityAt || new Date(after.lastActivityAt).getTime() > new Date(before.lastActivityAt).getTime());
    chk("C2.4-S9.9", "the chat bridge asks EVERY open CRM system, not just the oldest: a shop whose FIRST CRM system is still uiVersion 1 and whose second is on 2 (both holding a contact of the same Party) still gets the v2 contact's lastActivityAt bumped and its waiting sequence stopped by a customer reply — a `gates[0]`-style shortcut silences the whole pilot shop · the v1 system's own contact is left alone",
      moved && (stopped === "STOPPED" || stopped === "-") && !oldRow?.lastActivityAt,
      "v2 contact touched · v1 untouched", `moved=${moved} enrollment=${stopped} v1LastActivity=${oldRow?.lastActivityAt ? "TOUCHED" : "untouched"}`, "MAJOR");
  }
  {
    // S9.10 — RESOLVED arrives before the contact exists
    const convE = await mkConv(tidA, chatA, pNoContact);
    await resolveConv(convE.id);
    const first = await call(BR.onChatConversationStatus, statusEvt(tidA, chatA, convE.id, "RESOLVED"), { ai: fakeAi("chat", JSON.stringify({ summary: MARK_CS })) });
    const none = await chatActs(convE.id);
    // the contact for that Party appears only now (the shop links the chat, or the next message creates the lead)
    const ctLate = await rawContact(tidA, crmA, "ผู้ติดต่อมาช้า", userA, pNoContact);
    await consume(chatEvt(tidA, chatA, "chat.message.received", { conversationId: convE.id, channel: "LINE" }));
    const again = await call(BR.onChatConversationStatus, statusEvt(tidA, chatA, convE.id, "RESOLVED"), { ai: fakeAi("chat", JSON.stringify({ summary: MARK_CS })) });
    const acts = await chatActs(convE.id);
    chk("C2.4-S9.10", "a room resolved BEFORE anybody was a contact is not lost: the first RESOLVED writes nothing (no Party contact yet) and once the contact exists the caught-up RESOLVED writes EXACTLY ONE CHAT activity for that conversation — never zero (the visit vanishes) and never two (one per delivery)",
      first.ok && none.length === 0 && again.ok && acts.length === 1 && String(acts[0]?.contactId ?? "") === ctLate.id,
      "0 then exactly 1", `first=${rd(first)} before=${none.length} again=${rd(again)} after=${acts.length} onContact=${String(acts[0]?.contactId ?? "-") === ctLate.id}`, "MAJOR");
  }
  {
    // X8.6 — a reminder must not carry the customer's phone number out of the activity title
    const phone = phoneOf();
    const idPii = `${TAG}-pii-remind`;
    await P.crmActivity.create({ data: { id: idPii, tenantId: tidA, systemId: crmA, contactId: ctMain.id, type: "TASK", title: `โทรกลับ ${fmtPhone(phone)} ${phone}`, ownerUserId: userA, dueAt: new Date(Date.now() + DAY), remindAt: new Date(Date.now() - 60_000) } });
    const pushBefore = PUSHES.length;
    // AppNotification has no id/link column ⇒ the notification of THIS activity is the row that did not exist before the run
    //   (every other reminder of tenant A was delivered by the runs above), so the positive control never depends on the wording.
    const before = new Set(((await P.appNotification.findMany({ where: { tenantId: tidA } })) as Any[]).map((n) => String(n.id)));
    const rr = await call(RM.remindDue, new Date(), { tenantIds: [tidA], deps: pushDeps });
    await pump([tidA]);
    const notes = ((await P.appNotification.findMany({ where: { tenantId: tidA } })) as Any[]).filter((n) => !before.has(String(n.id)));
    const pushes = PUSHES.slice(pushBefore);
    const has = (s: unknown) => String(s ?? "").includes(phone) || String(s ?? "").includes(fmtPhone(phone));
    const inTitle = notes.some((n) => has(n.title));
    const inBody = notes.some((n) => has(n.body));
    const inPush = pushes.some((p) => has(j(p)));
    chk("C2.4-X8.6", "X8 for reminders: the activity title is the shop's free text and may hold a customer's phone number, and the title of a notification leaves the product (notification lists · the hourly e-mail digest of AppNotification.emailedAt) ⇒ neither the push payload nor AppNotification.title may copy that phone number — the reminder still reaches the owner (positive control: exactly ONE new notification for this activity, its recipient is the owner)",
      rr.ok && notes.length === 1 && String(notes[0]?.recipientUserId ?? "") === userA && !inTitle && !inPush,
      "1 notification · no phone in the title or the push", `run=${rd(rr)} notes=${notes.length} rcpt=${String(notes[0]?.recipientUserId ?? "-") === userA} phoneInTitle=${inTitle} phoneInPush=${inPush} pushes=${pushes.length} [fyi phoneInBody=${inBody}]`, "MAJOR");
  }
  {
    // N16 — callAiStatus must not create a wallet (a read must never grant credit)
    const tidW = await mkTenant("nowallet");
    const crmW = await mk(tidW, "CRM", "CRM ไม่มีกระเป๋า");
    await setCrm(crmW, { uiVersion: 2, bridgesEnabled: true, ai: { callTranscribe: true, chatSummary: false } });
    const ctW = await rawContact(tidW, crmW, "ลูกค้าไม่มีกระเป๋า", userA);
    const cW = { tenantId: tidW, systemId: crmW, actorUserId: userA };
    const wallets0 = await P.aiCreditWallet.count({ where: { tenantId: tidW } });
    const st = await call(CL.callAiStatus, cW, owner, trDeps(0));
    const wallets1 = await P.aiCreditWallet.count({ where: { tenantId: tidW } });
    const grants = await P.aiCreditTxn.count({ where: { tenantId: tidW } });
    void ctW;
    chk("C2.4-N16", "reading the AI state never spends or grants anything: `callAiStatus` on a shop that has no AI wallet at all answers a state (NO_CREDIT or READY per the credit service) and creates NO AiCreditWallet row and NO GRANT transaction — a status read must not quietly enrol the shop in the credit system",
      st.ok && wallets0 === 0 && wallets1 === 0 && grants === 0,
      "no wallet · no txn", `status=${st.ok ? j(st.v?.state ?? st.v) : st.err} wallets=${wallets0}→${wallets1} txns=${grants}`, "MAJOR");
  }
  {
    // F7 — the transcriber may report what the STT cost; the single charge must include it (depends on the CONTRACT gaining costMicroUsd?)
    const fCall = await mkCall(cA, ctMain.id);
    const COST = 4321;
    const costTr = { key: "qc-cost", transcribe: async (input: Any) => { TR_CALLS.push(String(input?.activityId ?? "")); return { text: TRANSCRIPT, language: "th", costMicroUsd: COST }; } };
    const note = `crm.call.transcribe#${fCall.id}`;
    const before = await balance(tidA);
    const r = await call(CL.transcribeCall, cA, owner, fCall.id, { transcriber: costTr, ai: fakeAi("transcribe", AI_JSON) });
    const txns = await usageFor(tidA, note);
    const after = await balance(tidA);
    const amount = Number(txns[0]?.amountMicro ?? txns[0]?.amount ?? 0);
    chk("C2.4-F7", "the speech-to-text bill is not free: when the transcriber reports `costMicroUsd` the ONE usage charge of that transcription includes it (charge ≥ the reported cost, balance down by the same) — DEPENDS ON THE BUILDER'S SHAPE: this check only bites once `costMicroUsd?` is part of the CrmTranscriber result in the CONTRACT; while the field is ignored the charge is only the AI cost and this stays red as a reminder to rule on it",
      r.ok && txns.length === 1 && Math.abs(amount) >= COST && before - after >= COST,
      `charge ≥ ${COST}`, `transcribe=${rd(r)} txns=${txns.length} amount=${amount} balance ${before}→${after}`, "MINOR");
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
