// QC — CRM v2 WO C2.5: e-mail engine (decision C4) — core `sendEmailRich` · routing (shop × per-user override × verified domain) ·
//      send (consent at SEND time · pixel + link wrapping · List-Unsubscribe one-click · Message-ID/In-Reply-To/References · copy-to ·
//      scheduled send = minute job with LEASE) · inbound `crm+<key>@` before the board handler (6 matching cases · 3-layer threading ·
//      BCC capture · stranger→lead · auto-reply skip · private attachments) · tracking `/t/o/[token].gif` `/t/c/[token]` · unsubscribe
//      `/u/[token]` · Resend webhook (Svix signature) · templates · user settings · rotate inbound key · domain verify · test send ·
//      retention purge · UI (/emails · thread · composer · /settings/email)
// Oracle writer · the C2.5 builder must NOT touch this file · QC database only (.env.qc — loaded by scripts/acc-v2-env.mts)
// Run:  bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c2.5.mts
//       `--force-run` = run every check while C2.5 is absent — C2.5 checks go red for the right reason ("missing"), positive controls
//       (fixtures · consent decider · sanitizer baseline · core sendEmail · member pixel) and CLEAN go green.
//       Without the flag and without src/lib/modules/crm/emails.ts ⇒ SKIPPED (no DB connection opened).
// requires: crm-seed   (house style — this oracle reads NO seeded row; everything lives in throwaway tenants `qc-c25-<rand>-*`)
//
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE: qc-kanban-k3.9 (board mail) · qc-kanban-notify · qc-member-m3.6 · qc-member-fix-s1
//   (OTP mail) · qc-marketing (member campaign pixel `/api/m/track/o/*` untouched) · qc-forms-notify · qc-onboarding-drip · every suite that
//   stubs `sendEmail` (grep) · qc-crm-c2.1 (SEND_EMAIL default transport swapped — R-E.5) · qc-crm-c2.2 (EMAIL step default sender) ·
//   qc-crm-c0.4 (private files) · qc-crm-c0.5 (minute jobs) · qc-crm-v1 · every earlier qc-crm-c1.*/c2.*.
//
// SOURCES: crm-brief-C2.5.md · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-A previousEmails reader = C2.5 · stopFor is C2.2's,
//   C2.5 only CALLS it · purge implemented here, registered by C2.10 · R-C.7 paths `/u/[token]` `/t/o/[token].gif` `/t/c/[token]` ·
//   R-C.8 keys `crm.<type>#<id>#…` · R-D C2.5a→C2.5b one oracle · R-E.5 C2.5 swaps the SEND_EMAIL transport · R-E.11 "transactional" =
//   replies inside a thread the customer started · R-E.14 uiVersion 1) · CRM-RUN §2 "C2.5" (S1 8 · S2 6 · S3 6 · S4 3 · S5 2 · S6 3 ·
//   S7 1 · S8 5 = 34) + §4 PERMANENT RULE (every oracle carries uiVersion-1 cases) · MASTER-PLAN §4 (X1 X2 X3 X4 X5 X6 X7 X8 X9 X10) §6
//   row C2.5 · blueprint §4.5 settings.email · §5.6 · §6.1 keys crm.email.read/send/settings · §7 event table · §11.4 · C2.0 schema
//   (CrmEmailMessage/Event/Template/UserSetting · EmailDomain · CrmContact.trackingOptOut) · mockups 08 (centre) · 15.
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this) ══════════════════════════════════
//   A. CORE `src/lib/core/email.ts`
//      sendEmail(to, subject, text) — UNCHANGED byte for byte (sha256 of the function block is pinned below) · many callers.
//      sendEmailRich(msg: RichEmail, deps?: { fetch?: typeof fetch }) → Promise<{ ok: boolean; providerId?: string; error?: string }>
//        RichEmail = { from?; fromName?; replyTo?; to: string[]; cc?: string[]; bcc?: string[]; subject; html; text?;
//          headers?: Record<string,string>; attachments?: { filename; content: Uint8Array | string(base64); contentType? }[];
//          idempotencyKey? } · NEVER throws · AUDIT-CLASS X6: CR or LF in subject / fromName / from / replyTo / any address / any
//        header name or value ⇒ { ok:false, error:"INVALID_HEADER" } and NO request · empty `to` ⇒ ok:false, no request ·
//        POST https://api.resend.com/emails (Bearer RESEND_API_KEY) JSON { from ("Name <addr>" when fromName), to[], cc?, bcc?,
//        subject, html, text?, reply_to?, headers?, attachments?: [{ filename, content: base64 }] } · providerId = response `id` ·
//        non-2xx / exception ⇒ ok:false (OpsEvent allowed but WITHOUT any address, subject or body — X8) · deps.fetch replaces fetch.
//   B. SHARED `src/lib/modules/crm/emails-shared.ts` (pure — no prisma/next/server-only/env)
//      CRM_EMAIL_BODY_MAX_BYTES = 500 * 1024 · CRM_EMAIL_ATTACH_MAX_BYTES = 10 * 1024 * 1024 · CRM_EMAIL_ATTACH_MAX_COUNT = 20 ·
//      CRM_EMAIL_ATTACH_MIME_ALLOWLIST ⊆ storage ALLOWED_UPLOAD_TYPES, has application/pdf, no svg / html / javascript ·
//      CRM_EMAIL_DEFAULTS = { inboundEnabled: true, fromMode: "SHARK", fromName: null, fromAddr: null, replyToMode: "SHARK",
//        replyToAddr: null, copyToAddr: null, copyMode: "NONE", bccCaptureEnabled: true, strangerToLead: true, trackOpens: true,
//        trackClicks: true, retentionDays: 730, allowUserOverride: true } (blueprint §4.5 + `fromAddr` — PROPOSED ruling 3) ·
//      CRM_TRACK_RATE_LIMITS = { perIp: { limit; windowMs }, perToken: { limit (10…60); windowMs } } ·
//      normalizeSubject(s) — strips any run of RE:/Re:/FW:/Fwd:/ตอบ:/ตอบกลับ:/ส่งต่อ: prefixes + trims + collapses spaces ·
//      isAutoSubmitted(headers: Record<string,string>, from: string) — true for Auto-Submitted ≠ "no", Precedence bulk|junk|list,
//        X-Autoreply / X-Autorespond present, From local part no-reply|noreply|mailer-daemon|postmaster|bounce(s) ·
//      isTrackingBot(ua) — true for bot|spider|crawl|preview|curl/|wget/|python-requests|headless (case-insensitive), false for a
//        normal mail client / browser UA · renderInboundHtml(html, { showImages: boolean }) → string for <iframe sandbox srcDoc>:
//        no <script>, no on*= attribute, no javascript: · showImages=false ⇒ NO element loads a remote URL (no `src="http…"`) ·
//        showImages=true ⇒ https <img> kept as `<img src="https://…">` (attributes other than src/alt/width/height stripped)
//   C. SERVICE `src/lib/modules/crm/emails.ts` (+ `export * as emails from "./emails"` in crm/index.ts)
//      ctx { tenantId, systemId, actorUserId } · actor = MemberActor · system re-resolved (id + tenantId + type CRM) else NOT_FOUND ·
//      assertCrmV2 FIRST on every actor function (uiVersion 1 ⇒ CrmV2DisabledError, nothing read/written/sent) · visibility BEFORE
//      keys (invisible = NOT_FOUND · visible without key = FORBIDDEN, crmForbiddenMessage) · errors carry `.code` ∈ NOT_FOUND |
//      FORBIDDEN | VALIDATION | CONFLICT | CONFIRM_REQUIRED | EMAIL_BLOCKED | NOT_CONFIGURED with a Thai message that never blames the
//      user and never echoes an address/data of another tenant/system · every mutation writes AuditLog: `crm.email.send` (targetId =
//      emailId) · `crm.email.settings` · `crm.email.user_setting` · `crm.email.rotate_key` · `crm.email.attach` · `crm.email.template.*`
//      · `crm.email.domain.*` · `crm.email.test` — audit before/after never holds a body.
//      settings live in AppSystem.settings.crm.email (single-statement jsonb_set writes) · inbound key = settings.crm.email.inboundKey
//        (8 chars [a-z2-7], plain, like board keys) · inbound address `crm+<key>@shark.in.th`
//      resolveRouting(ctx, actor, opts?: { contactId? }) → { fromName; fromAddr; replyTo; copyTo: string[]; copyIn: string[];
//        via: "SHARK" | "DOMAIN" }  (key crm.email.send)
//        from: user override fromAddr (allowUserOverride && its domain VERIFIED in EmailDomain of the tenant) ⇒ it, via DOMAIN ·
//          else shop fromMode "DOMAIN" && settings fromAddr on a VERIFIED domain ⇒ it, via DOMAIN · else `<tenant.slug>@shark.in.th`,
//          via SHARK · fromName: user override fromName (allowUserOverride) ?? (via SHARK ⇒ User.name of the actor) ?? settings
//          fromName ?? User.name
//        replyTo: mode = user row (allowUserOverride) ?? shop · SHARK ⇒ `crm+<key>@shark.in.th` · STAFF|SELF ⇒ actor User.email ·
//          CUSTOM ⇒ replyToAddr (of whichever row decided) · a PENDING/FAILED domain never counts
//        copyTo = OUT copies: shop copyToAddr when shop copyMode ∈ OUT|BOTH + user copyToAddr when user copyMode ∈ OUT|BOTH ·
//        copyIn = same with IN|BOTH (user part only when allowUserOverride)
//      getEmailSettings(ctx, actor) → CRM_EMAIL_DEFAULTS ⊕ settings.crm.email + { inboundAddress } (key crm.email.settings)
//      setEmailSettings(ctx, actor, patch) → same (key crm.email.settings) · VALIDATION: bad mode · bad address · CR/LF anywhere ·
//        retentionDays ∉ 30…3650 · other settings.crm keys survive
//      getUserSetting(ctx, actor, userId?) · setUserSetting(ctx, actor, { userId?, fromName?, fromAddr?, replyToMode?, replyToAddr?,
//        copyToAddr?, copyMode?, signatureHtml? }) — own row with crm.email.send · another user's row needs crm.email.settings (else
//        FORBIDDEN/NOT_FOUND) · CR/LF or bad address ⇒ VALIDATION · upsert on (systemId, userId) · listUserSettings(ctx, actor)
//      rotateInboundKey(ctx, actor, { confirm: true, reason ≥ 5 }) → { key; address } — DANGER (X9) · key crm.email.settings · the
//        old address stops routing immediately
//      sendEmail(ctx, actor, input: SendInput, deps?: EmailDeps) → { emailId; messageId; threadKey; status: "SENT"|"QUEUED"|"FAILED";
//          reused?: boolean }   (key crm.email.send)
//        SendInput = { contactId; dealId?; companyId?; to?: string[] (default [contact.email]); cc?; bcc?; subject?; bodyHtml?;
//          templateId?; vars?: Record<string,string>; attachments?: { filename; contentType; data: Uint8Array }[];
//          scheduledAt?: Date | string; replyToEmailId?; idempotencyKey? }
//        EmailDeps = { transport?: (msg: RichEmail) => Promise<{ ok; providerId?; error? }> (default sendEmailRich);
//          put?; del? (storage UploadDeps/DeleteDeps) }
//        order: v2 → contact visible (contactWhere; deal/company ids must be of this system and visible) → key → validation (subject
//        1…300 no CR/LF · body ≤ CRM_EMAIL_BODY_MAX_BYTES · attachments count/size/mime · addresses) → CONSENT AT SEND TIME:
//        consents.canContact(contact, "EMAIL", { transactional: replyToEmailId's thread was started by an IN message }) false ⇒
//        EMAIL_BLOCKED with NOTHING written (no row, no activity, no event, no upload, no transport call) — optOut / bounced / no
//        consent all land here; bounced blocks transactional too
//        composer HTML sanitized (core sanitizeHtml family) · template: subject/body from CrmEmailTemplate of THIS system (other
//        system ⇒ NOT_FOUND), `{{var}}` values HTML-escaped once · tracking (settings trackOpens/trackClicks) ONLY when the contact
//        has neither trackingOptOut nor emailOptOut: pixel `<img src="<APP_URL>/t/o/<token>.gif" …>` · every <a href="http(s)://…">
//        → `<APP_URL>/t/c/<token>` (mailto:/tel:/the unsubscribe link never wrapped) · EVERY outgoing message carries an unsubscribe
//        link `<APP_URL>/u/<token>` in the body + headers `List-Unsubscribe: <<APP_URL>/u/<token>/one-click>` and
//        `List-Unsubscribe-Post: List-Unsubscribe=One-Click` · tokens ≥ 128 bits (≥ 22 url-safe chars), DB keeps HASHES only
//        (trackTokenHash etc.) — the stored bodyHtml is the composed body WITHOUT pixel/wrapped links/tokens · headers `Message-ID`
//        (generated; stored messageId = the same id without <>) · reply: In-Reply-To = parent id, References = parent refs + parent
//        id, threadKey = parent's · Reply-To header = routing.replyTo, in SHARK mode `crm+<key>+t<short>@shark.in.th` (threading
//        fallback) · copyTo addresses added as BCC of the same provider call · stored CrmEmailMessage OUT (status SENT, providerId,
//        sentById, sentAt, contactId, dealId, companyId, routing json, attachments [{ fileId, name, size, mime }] stored PRIVATE via
//        uploadFile visibility "private") + ONE CrmActivity type EMAIL direction OUT source EMAIL sourceRef = emailId + outbox
//        `crm.email.sent` (ids only) in the same tx · transport failure ⇒ status FAILED, providerError without address, no event ·
//        idempotencyKey: same key + same system ⇒ the same message (10 parallel calls ⇒ ONE row, ONE transport call; others answer ok
//        with the same emailId / reused:true, or CONFLICT) · scheduledAt in the future ⇒ status QUEUED, scheduledAt set, NO transport
//      sendAsSystem(ctx: { tenantId; systemId }, input: SendInput & { senderUserId?: string | null; sequenceStepId?: string }, deps?)
//        → same result — used by sequences (C2.2 EMAIL step default sender) and rules (C2.1 SEND_EMAIL default) — R-E.5 · same consent
//        rule (marketing) · stores sequenceStepId
//      runScheduled(now: Date, opts?: { tenantIds?: string[]; deps?: EmailDeps; deadline?: number; signal?: AbortSignal }) → summary
//        AUDIT-CLASS X5: picks OUT rows status QUEUED, scheduledAt ≤ now, lease free (leaseUntil null or ≤ now) · claims with ONE
//        conditional UPDATE setting leaseUntil = now + 15 min (status STAYS QUEUED while sending — never claim by writing SENT) ·
//        re-checks consent at SEND time (blocked ⇒ status FAILED, providerError "EMAIL_BLOCKED", transport not called) · sends · SENT +
//        leaseUntil null + crm.email.sent · uiVersion-1 systems skipped untouched · `now` is THE clock · minute job
//        registerMinuteJob({ name: "crm.email.scheduled", everyMinutes: 1, cadence "minute", NOT vpsOnly }) on import of emails.ts
//        (or emails-job.ts) · scripts/crm-cron.mts imports it
//      ingestInbound(payload: CrmInboundPayload, deps?: { transport?; put?; del? }) → { ok: boolean; handled: boolean; emailId?;
//          reason? } — NEVER throws · CrmInboundPayload = InboundEmailPayload (kanban-email-in) & { cc?: string[]; headers?:
//          Record<string,string> (lower-case keys: in-reply-to · references · auto-submitted · precedence · reply-to …) }
//        `to` = every recipient the provider reports (envelope, incl. BCC) · recipient `crm+<key>[+t<short>]@shark.in.th`
//        (case-insensitive) picks the system; unknown key / inboundEnabled false / uiVersion 1 ⇒ handled:false, nothing stored ·
//        X4: one row per (system, RFC Message-ID) — replay / 10 parallel ⇒ ONE row, ONE activity, ONE crm.email.received, uploads
//        once · the same Message-ID delivered to TWO systems ⇒ one row in EACH (CrmEmailMessage.messageId is globally unique: the
//        builder stores a system-scoped value that still CONTAINS the RFC id — PROPOSED ruling 1) ·
//        direction: From = a staff member of the tenant (User.email with accepted Membership, or CrmEmailUserSetting.fromAddr) ⇒ OUT
//          (BCC capture, sentById = that user) matched on the first To/Cc address that is a contact; none ⇒ contactId null ·
//          else IN
//        matching (IN): (1) From/Reply-To = CrmContact.email or ∈ previousEmails (case-insensitive, this system) ⇒ contactId,
//          matchedBy "EMAIL" · (2) sender domain = CrmCompany.emailDomain ⇒ companyId, matchedBy "DOMAIN", no contact created ·
//          (3) none + strangerToLead ⇒ ONE new contact (email = sender, name from the display name or local part, leadStatus NEW,
//          source/sourceChannel "EMAIL") through contacts.createContact (crm.contact.created) — parallel mails of the same stranger ⇒
//          ONE contact · (5) isAutoSubmitted ⇒ never a lead, never a reply (no crm.email.replied, no sequence stop) · (6) otherwise
//          contactId null, companyId null, matchedBy "NONE" ⇒ "unmatched" box
//        threading: (a) In-Reply-To/References ∋ a Message-ID of THIS system ⇒ its threadKey (the replied-to OUT gets repliedAt,
//          ONE crm.email.replied) · (b) recipient `+t<short>` of this system ⇒ that thread · (c) normalizeSubject equal + same contact
//          + last message ≤ 30 days ⇒ that thread · else a new threadKey · never a thread of another tenant/system (X1)
//        reply to an OUT (not auto) ⇒ sequences.stopFor(ctx, contactId, "REPLY") exactly once (inline or via the replied consumer)
//        HTML stored sanitized (renderInboundHtml-compatible: no script/on*/javascript:) · attachments ≤ 20, ≤ 10 MB each, mime in
//        CRM_EMAIL_ATTACH_MIME_ALLOWLIST, stored PRIVATE (path t/<tid>/private/…, cdnUrl private://) — others skipped silently ·
//        copyIn addresses get a forwarded copy through the transport · CrmActivity EMAIL IN (sourceRef = emailId) when matched
//      ROUTE `src/app/api/email/inbound/route.ts`: gates unchanged (503 / 401 X-Inbound-Secret / 413) · recipients with local part
//        `crm+…` at shark.in.th ⇒ ingestInbound FIRST (headers + cc passed through, keys lower-cased) · everything else ⇒
//        ingestInboundEmail of the board exactly as today (kanban-email-in.ts byte-identical — hash pinned) · always 200 after gates
//      listThreads(ctx, actor, { contactId?; companyId?; dealId?; unmatched?: boolean; q?; page? }) → { items: { threadKey; subject;
//        lastAt; count; contactId; … }[]; total? } (key crm.email.read · only threads whose contact/company the actor sees) ·
//        unmatched:true needs crm.email.read AND (CONTACT visibility ALL or role MANAGER/OWNER) else FORBIDDEN|NOT_FOUND
//      getThread(ctx, actor, threadKey) → { threadKey; messages: { id; direction; fromAddr; toAddrs; subject; bodyHtml; bodyText;
//        attachments: { fileId; name; size; mime }[]; status; sentAt|receivedAt; openCount; … }[] } — invisible ⇒ NOT_FOUND ·
//        NO cdnUrl / private:// / storage path in any DTO (X10)
//      attachmentUrl(ctx, actor, emailId, fileId) → { url; expiresAt } — privateFileUrl ONLY after the visibility check (X10)
//      attachToContact(ctx, actor, emailId, contactId) → { emailId; contactId } — unmatched-box gate + target contact of THIS system
//        visible · matchedBy "MANUAL" · ONE activity · audit crm.email.attach
//      templates: listTemplates(ctx, actor) (crm.email.read) · saveTemplate(ctx, actor, { id?; name; subject; bodyHtml; category?;
//        active? }) (crm.email.settings · bodyHtml sanitized · duplicate name in the system ⇒ CONFLICT) · deleteTemplate(ctx, actor, id)
//      domains (tenant-scoped EmailDomain · key crm.email.settings): addDomain(ctx, actor, { domain }, deps?: { fetch? }) →
//        EmailDomainDto { id; domain; status: "PENDING"|"VERIFIED"|"FAILED"; records: { type: "TXT"|"MX"|"CNAME"; name; value;
//        priority?; status? }[]; verifiedAt: string|null } (Resend POST /domains) · refreshDomain(ctx, actor, domainId, deps?) (GET
//        /domains/<providerId>; "verified" ⇒ VERIFIED + verifiedAt) · listDomains · bad syntax / scheme / path / shark.in.th ⇒
//        VALIDATION · another tenant's id ⇒ NOT_FOUND
//      sendTest(ctx, actor, deps?) → { ok } — one message to the actor's own User.email through resolveRouting, no CrmEmailMessage row,
//        no pixel (key crm.email.settings)
//      track: trackOpen(token, meta: { ip; ua }) / trackClick(token, meta) → { url | null } (used by the routes) ·
//        trackRateKeys(route: "o"|"c"|"u"|"wh", req: { ip: string; token?: string }) → string[] — the ChatRateBucket keys the route uses
//        (checkRateLimitDb per IP-hash + per token-hash; keys NEVER contain the raw IP or token)
//      unsubscribe(token, meta?) → { ok: true } whatever the token — known ⇒ contact.emailOptOut = true + CrmContactConsent (EMAIL,
//        granted false, source UNSUBSCRIBE) + ONE CrmEmailEvent UNSUBSCRIBE + sequences.stopFor(…, "OPT_OUT") · works on uiVersion 1 too
//      providerWebhook(input: { headers; rawBody }) — used by the webhook route
//      purgeBodies(now: Date, opts?: { tenantIds?; deps?: { del? } }) → { purged } — messages older than settings retentionDays (by
//        sentAt ?? receivedAt ?? createdAt): bodyHtml/bodyText/snippet := null, attachments' FileAssets deleted + attachments := null,
//        purgedAt set; subject/addresses kept · registered as a daily job by C2.10 (R-A)
//   D. PUBLIC ROUTES (X7: checkRateLimitDb per IP-hash + per token-hash · unknown token = the SAME answer · no data returned)
//      `src/app/t/o/[token]/route.ts` GET (param "<token>.gif") → 200 image/gif 1×1, Cache-Control no-store, identical bytes/headers
//        for known/unknown/rate-limited · counts only: known token, not a bot UA, ≥ 2 s after sentAt, contact not trackingOptOut ⇒
//        openCount+1 (atomic), CrmEmailEvent OPEN, firstOpenedAt/lastOpenedAt, status OPENED (from SENT/DELIVERED), crm.email.opened
//      `src/app/t/c/[token]/route.ts` GET → 302 to EXACTLY the URL stored for that token (query params / crafted tokens can never pick
//        another URL) · unknown ⇒ 302 to the APP_URL home "/" · counts like the pixel (clickCount, CLICK event with url,
//        crm.email.clicked) · keeps redirecting when the system is uiVersion 1 (link inside an e-mail already sent)
//      `src/app/u/[token]/page.tsx` — Thai confirmation page (testid crm-unsub-confirm), GET never unsubscribes ·
//        `src/app/u/[token]/one-click/route.ts` POST (RFC 8058) → unsubscribe(token) → 204|200, same status for unknown · GET no write
//      `src/app/api/email/resend/webhook/route.ts` POST — Svix signature (svix-id · svix-timestamp · svix-signature "v1,<b64>",
//        HMAC-SHA256 of `${id}.${ts}.${rawBody}` with base64 key after "whsec_" of env RESEND_WEBHOOK_SECRET, ±5 min) · missing/bad
//        signature or stale timestamp ⇒ 401 and NOTHING written · body > 256 KB ⇒ 413 · valid: email.delivered ⇒ DELIVERED (never
//        downgrade OPENED) · email.bounced (bounce.type Permanent) ⇒ BOUNCED + ONE CrmEmailEvent BOUNCE (providerEventId = svix-id) +
//        contact.emailBouncedAt + ONE crm.email.bounced + stopFor(…, "BOUNCE") · email.complained ⇒ COMPLAINT + emailOptOut + stopFor
//        "OPT_OUT" (PROPOSED ruling 5) · unknown email_id ⇒ same 2xx, nothing written · replay/parallel ⇒ one event
//   E. EVENTS crm.email.sent / received / opened / clicked / replied / bounced — each: consumer in src/lib/outbox-consumers.ts
//      inside `// CRM C2.5 ▸ … ◂` · label declared in EXACTLY one of automation/labels.ts · webhooks/labels.ts · payload ids only
//      { emailId, contactId?, dealId?, companyId?, threadKey, sequenceStepId? } — NO address, name, subject, body, url (PROPOSED
//      ruling 4: url stays in CrmEmailEvent) · key `crm.email.<type>#<emailId>#…` · systemId = the CRM system
//   F. UI (all v2-only: type-CRM guard → requireCrmV2Page → crmCan → notFound)
//      `crm/emails/page.tsx` (crm.email.read) testids crm-emails-inbox · crm-emails-tab-unmatched · crm-emails-thread-row ·
//        crm-emails-search · `crm/emails/[threadKey]/page.tsx` thread view: inbound HTML ONLY inside `<iframe sandbox` (no
//        allow-scripts / allow-same-origin) via srcDoc of renderInboundHtml · crm-email-show-images · crm-email-attachment (download
//        links from attachmentUrl) · composer `src/components/crm/emails/**` ('use client', no prisma-side import) crm-email-composer ·
//        crm-email-to · crm-email-subject · crm-email-body · crm-email-template · crm-email-attach · crm-email-schedule ·
//        crm-email-send · `crm/settings/email/page.tsx` (crm.email.settings · mockup 15) crm-email-settings · crm-email-inbound-address
//        · crm-email-rotate-key · crm-email-from-mode · crm-email-replyto-mode · crm-email-copy-to · crm-email-copy-mode ·
//        crm-email-bcc-capture · crm-email-stranger-lead · crm-email-track-opens · crm-email-track-clicks · crm-email-user-overrides ·
//        crm-email-domain-add · crm-email-domain-records · crm-email-test-send · "use server" `crm/emails-actions.ts` (async exports
//        only, assertCrmV2 + assertCanCrm/crmCan) · nav: "/crm/emails" in CRM_NAV (ready, wo C2.5) + "/crm/settings/email" in
//        CRM_DEEP_NAV · every literal testid has a row (wo "C2.5") in scripts/crm-ui-inventory.json
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// WHAT THIS FILE PROVES: S0 structure · S1–S8 of CRM-RUN (34) · S9 brief extras · U PERMANENT RULE (uiVersion 1) · X1 X2 X3 X4 X5 X6 X7
//   X8 X9 X10 · CLEAN.  S8 ("UI 5") is STATIC here; parity against mockups 08/15 at 1440/390 is the controller's gate D7.
// HOUSE RULES: SKIP guard before any DB connection · throwaway tenants swept in `finally` (every table with tenantId, 4 passes) + users +
//   our rate buckets · no drainOutbox (own pump over OUR tenants) · EVERY outbound fetch stubbed (Resend emails/domains, storage) — no
//   real provider is ever reached · fake secrets set BEFORE the QC env loads · last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash, createHmac, randomBytes } from "node:crypto";

const EMAILS = "src/lib/modules/crm/emails.ts";
const EMAILS_SH = "src/lib/modules/crm/emails-shared.ts";
const EMAILS_ACT = "src/lib/modules/crm/emails-actions.ts";
const CORE_EMAIL = "src/lib/core/email.ts";
const CRM_INDEX = "src/lib/modules/crm/index.ts";
const CONS_FILE = "src/lib/outbox-consumers.ts";
const CRON = "scripts/crm-cron.mts";
const INVENTORY = "scripts/crm-ui-inventory.json";
const NAV = "src/lib/modules/crm/nav.ts";
const CRM_PAGES = "src/app/app/sys/[id]/crm";
const UI_DIR = "src/components/crm/emails";
const ROUTES = {
  inbound: "src/app/api/email/inbound/route.ts",
  open: "src/app/t/o/[token]/route.ts",
  click: "src/app/t/c/[token]/route.ts",
  unsubPage: "src/app/u/[token]/page.tsx",
  oneClick: "src/app/u/[token]/one-click/route.ts",
  webhook: "src/app/api/email/resend/webhook/route.ts",
} as const;
const MEMBER_PIXEL = "src/app/api/m/track/o/[token]/route.ts";
const BOARD_IN = "src/lib/platform/kanban-email-in.ts";
// baselines pinned 19 Sep 2569 on 02ba30bc (identical on shark-crm / shark-crm-c20) — v1 surfaces that C2.5 must NOT change
const SHA_MEMBER_PIXEL = "e9ea7b94fe067a828d9d0c84d8e840baf54cf88b6a145651c2ec9326e89f97aa";
const SHA_BOARD_IN = "e0402e8ff249d94f7eece4d4a2f16d37b925a221160f74c30a7d53967ff71051";
const SHA_CORE_SENDEMAIL_FN = "66316328743f8dd4ad3802be6cd111181f9ff35f8a1dda57d05cc0eea4e5b714";
const SAN_FIXTURES = [
  `<p onclick="x()">สวัสดี <b>ครับ</b><img src="https://t.example/p.gif" onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a><a href="https://ok.example/a?b=1">ok</a></p>`,
  `<div style="color:red"><h1>หัว</h1><iframe src="https://e.example"></iframe><ul><li>1</li></ul></div>`,
  `<table><tr><td>a</td></tr></table><blockquote>q</blockquote><svg onload="x()"><circle/></svg>`,
];
const SAN_BASELINE = [
  `<p>สวัสดี <b>ครับ</b>x</a><a href="https://ok.example/a?b=1" rel="noopener" target="_blank">ok</a></p>`,
  `<h1>หัว</h1><ul><li>1</li></ul>`,
  `a<blockquote>q</blockquote>`,
];
const MB = 1024 * 1024;
const DAY = 86_400_000;

const ARGV = process.argv.slice(2);
const FORCE = ARGV.includes("--force-run");
const read = (p: string) => (p && existsSync(p) ? readFileSync(p, "utf8") : "");
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const walk = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  const o: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) o.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) o.push(p);
  }
  return o.sort();
};

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guard — C2.5 not built ⇒ SKIPPED, no DB connection opened.
// ═══════════════════════════════════════════════════════════════════════════════════
const BUILT = existsSync(EMAILS);
if (!FORCE && !BUILT) {
  console.log(`⚠️  SKIPPED — WO C2.5 not built yet (${EMAILS} missing) (run with --force-run to exercise the fixtures and the cleanup)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

// ─── fake provider secrets BEFORE the QC env file loads (process.loadEnvFile never overrides) — nothing real is ever used ───
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c25-${rand}`;
const WH_KEY_B64 = randomBytes(24).toString("base64");
process.env.RESEND_API_KEY = `re_qc_c25_${randomBytes(8).toString("hex")}`;
process.env.EMAIL_INBOUND_SECRET = `qc-c25-inbound-${randomBytes(12).toString("hex")}`;
process.env.RESEND_WEBHOOK_SECRET = `whsec_${WH_KEY_B64}`;
delete process.env.OPS_ALERT_EMAIL;
const CDN = "https://qc-c25-cdn.invalid";
process.env.SHARK_BUNNY_CDN = CDN;
process.env.SHARK_BUNNY_ZONE = `${TAG}-zone`;
process.env.SHARK_BUNNY_KEY = `qc-c25-key-${randomBytes(8).toString("hex")}`;
delete process.env.BUNNY_ACCOUNT_KEY;

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();

// ─── EVERY fetch stubbed: Resend emails/domains answered locally, everything else 200 {} ───
type Fx = { method: string; url: string; headers: Record<string, string>; body: string };
const FETCHES: Fx[] = [];
let resendFail = false;
let reSeq = 0;
const DOMAIN_RECORDS = (st: string) => [
  { record: "SPF", name: "send", type: "MX", ttl: "Auto", status: st, value: "feedback-smtp.ap-northeast-1.amazonses.com", priority: 10 },
  { record: "SPF", name: "send", type: "TXT", ttl: "Auto", status: st, value: "\"v=spf1 include:amazonses.com ~all\"" },
  { record: "DKIM", name: "resend._domainkey", type: "TXT", ttl: "Auto", status: st, value: "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC" },
];
const DOMAIN_NAMES = new Map<string, string>();
const hdrObj = (h: Any): Record<string, string> => {
  const o: Record<string, string> = {};
  if (!h) return o;
  if (typeof h.forEach === "function" && !Array.isArray(h)) h.forEach((v: string, k: string) => { o[k.toLowerCase()] = v; });
  else if (Array.isArray(h)) for (const [k, v] of h) o[String(k).toLowerCase()] = String(v);
  else for (const [k, v] of Object.entries(h)) o[k.toLowerCase()] = String(v);
  return o;
};
const jsonRes = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  const method = String(init?.method ?? input?.method ?? "GET").toUpperCase();
  const body = typeof init?.body === "string" ? init.body : init?.body ? "<non-string body>" : "";
  FETCHES.push({ method, url, headers: hdrObj(init?.headers), body });
  if (/^https:\/\/api\.resend\.com\/emails\/?$/.test(url) && method === "POST") {
    if (resendFail) return jsonRes({ name: "application_error", message: "qc forced failure" }, 500);
    return jsonRes({ id: `re_qc_${TAG}_${++reSeq}` });
  }
  if (/^https:\/\/api\.resend\.com\/domains\/?$/.test(url) && method === "POST") {
    let name = "";
    try { name = String(JSON.parse(body)?.name ?? ""); } catch { /* */ }
    const id = `dom_qc_${TAG}_${++reSeq}`;
    DOMAIN_NAMES.set(id, name);
    return jsonRes({ id, name, status: "not_started", region: "ap-northeast-1", records: DOMAIN_RECORDS("not_started") });
  }
  const dm = url.match(/^https:\/\/api\.resend\.com\/domains\/([^/?]+)(\/verify)?$/);
  if (dm) return jsonRes({ id: dm[1], name: DOMAIN_NAMES.get(dm[1]) ?? "", status: "verified", region: "ap-northeast-1", records: DOMAIN_RECORDS("verified") });
  return jsonRes({});
}) as typeof fetch;
const resendCalls = () => FETCHES.filter((f) => f.method === "POST" && /api\.resend\.com\/emails/.test(f.url));

// ─── harness ───
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
const bare = (s: unknown) => String(s ?? "").trim().replace(/^<|>$/g, "");
const hdr = (m: Any, name: string): string => {
  const h = m?.headers ?? {};
  for (const [k, v] of Object.entries(h)) if (k.toLowerCase() === name.toLowerCase()) return String(v);
  return "";
};
const addrsOf = (v: unknown): string[] => (Array.isArray(v) ? v : v ? [v] : []).map((x) => String(x).toLowerCase());
const B32 = "abcdefghijklmnopqrstuvwxyz234567";
const key8 = () => Array.from(randomBytes(8)).map((b) => B32[b % 32]).join("");
const INADDR = (k: string) => `crm+${k}@shark.in.th`;

out(`\n═══ QC CRM v2 · C2.5 — e-mail engine (routing · send · inbound · tracking · webhook · UI) ═══`);
out(`[env] DB ${host} · tag ${TAG}${FORCE && !BUILT ? " · --force-run with C2.5 ABSENT (C2.5 checks expected red; positive controls + CLEAN green)" : ""}\n`);

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TENANTS: string[] = [];
const USERS: string[] = [];
const PII: string[] = [];
const pii = <T extends string>(s: T): T => { PII.push(s); return s; };
const OPS_IDS: string[] = [];
const RATE_REQ: { route: "o" | "c" | "u" | "wh"; ip: string; token?: string }[] = [];
let seq = 0;
const nx = () => `${++seq}`;
const mailOf = (s: string) => pii(`${TAG}-${s}@qc-crm.example`);
const NONE = `${TAG}-none`;
const BODY_MARK = `เนื้อความลับ${rand}`; // must never reach outbox / OpsEvent / logs / audit
const SUBJ_MARK = `หัวข้อลับ${rand}`;
const UA_OK = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const RUN_OCTET = randomBytes(1)[0];
let ipSeq = 0;
const ipN = () => { ipSeq += 1; return `10.${RUN_OCTET}.${(ipSeq >> 8) & 255}.${ipSeq & 255}`; };

try {
  // ═════════════════════════════════════════════════════════════════════════════
  // modules (dynamic — they may not exist yet)
  // ═════════════════════════════════════════════════════════════════════════════
  const imp = async (p: string) => (await import(p as string).catch(() => ({}))) as Any;
  const EM = await imp("@/lib/modules/crm/emails");
  const ESH = await imp("@/lib/modules/crm/emails-shared");
  const CORE = await imp("@/lib/core/email");
  const SAN = await imp("@/lib/core/sanitize");
  const CRM = await imp("@/lib/modules/crm");
  const SEQ = (CRM.sequences ?? (await imp("@/lib/modules/crm/sequences"))) as Any;
  const CNS = (CRM.consents ?? (await imp("@/lib/modules/crm/consents"))) as Any;
  const OBX = await imp("@/lib/outbox-consumers");
  const UIV = await imp("@/lib/modules/crm/ui-version");
  const STO = await imp("@/lib/storage/service");
  await imp("@/lib/platform/minute-jobs");
  const R_IN = await imp("@/app/api/email/inbound/route");
  const R_O = await imp("@/app/t/o/[token]/route");
  const R_C = await imp("@/app/t/c/[token]/route");
  const R_U1 = await imp("@/app/u/[token]/one-click/route");
  const R_WH = await imp("@/app/api/email/resend/webhook/route");
  const R_M = await imp("@/app/api/m/track/o/[token]/route");
  const CONS: Any = OBX.consumers ?? {};
  const V1MSG: string = UIV.CRM_V2_DISABLED_MSG ?? "";
  const EVENTS = ["crm.email.sent", "crm.email.received", "crm.email.opened", "crm.email.clicked", "crm.email.replied", "crm.email.bounced"];

  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — structure
  // ═════════════════════════════════════════════════════════════════════════════
  out("── S0 · structure ──");
  const emSrc = read(EMAILS);
  const shSrc = read(EMAILS_SH);
  const consSrc = read(CONS_FILE);
  {
    const need = ["resolveRouting", "getEmailSettings", "setEmailSettings", "getUserSetting", "setUserSetting", "listUserSettings", "rotateInboundKey",
      "sendEmail", "sendAsSystem", "runScheduled", "ingestInbound", "listThreads", "getThread", "attachmentUrl", "attachToContact", "listTemplates",
      "saveTemplate", "deleteTemplate", "addDomain", "refreshDomain", "listDomains", "sendTest", "trackOpen", "trackClick", "trackRateKeys",
      "unsubscribe", "providerWebhook", "purgeBodies"];
    const missing = need.filter((f) => typeof EM?.[f] !== "function");
    chk("C2.5-S0.1", `emails.ts exports the ${need.length} contract functions`, emSrc.length > 0 && missing.length === 0, "all", `exists=${emSrc.length > 0} missing=${missing.join(",") || "-"}`);
  }
  {
    const allowed = Object.keys(STO.ALLOWED_UPLOAD_TYPES ?? {});
    const mimes: string[] = Array.isArray(ESH.CRM_EMAIL_ATTACH_MIME_ALLOWLIST) ? ESH.CRM_EMAIL_ATTACH_MIME_ALLOWLIST : [];
    const d = ESH.CRM_EMAIL_DEFAULTS ?? {};
    const rl = ESH.CRM_TRACK_RATE_LIMITS ?? {};
    const impure = /from\s+["'](@prisma\/client|@\/lib\/core\/db|@\/lib\/env|next\/[^"']+|server-only|\.\/db|\.\/emails)["']/.test(shSrc);
    const defOk = d.inboundEnabled === true && d.fromMode === "SHARK" && d.replyToMode === "SHARK" && d.copyMode === "NONE" && d.bccCaptureEnabled === true &&
      d.strangerToLead === true && d.trackOpens === true && d.trackClicks === true && d.retentionDays === 730 && d.allowUserOverride === true;
    const fns = ["normalizeSubject", "isAutoSubmitted", "isTrackingBot", "renderInboundHtml"].filter((f) => typeof ESH?.[f] !== "function");
    const rlOk = Number(rl?.perToken?.limit) >= 10 && Number(rl?.perToken?.limit) <= 60 && Number(rl?.perToken?.windowMs) > 0 && Number(rl?.perIp?.limit) > 0 && Number(rl?.perIp?.windowMs) > 0;
    chk("C2.5-S0.2", "emails-shared.ts is pure · body 500 KB · attach 10 MB × 20 · mime allowlist ⊆ storage types, has pdf, no svg/html/js · CRM_EMAIL_DEFAULTS = blueprint §4.5 · CRM_TRACK_RATE_LIMITS perToken 10…60 · normalizeSubject/isAutoSubmitted/isTrackingBot/renderInboundHtml",
      shSrc.length > 0 && !impure && ESH.CRM_EMAIL_BODY_MAX_BYTES === 500 * 1024 && ESH.CRM_EMAIL_ATTACH_MAX_BYTES === 10 * MB && ESH.CRM_EMAIL_ATTACH_MAX_COUNT === 20 &&
        mimes.length > 0 && mimes.includes("application/pdf") && mimes.every((m) => allowed.includes(m) && !/svg|html|javascript/.test(m)) && defOk && rlOk && fns.length === 0,
      "constants", `pure=${shSrc.length > 0 && !impure} body=${ESH.CRM_EMAIL_BODY_MAX_BYTES} att=${ESH.CRM_EMAIL_ATTACH_MAX_BYTES}/${ESH.CRM_EMAIL_ATTACH_MAX_COUNT} mimes=[${mimes.join(",")}] defaults=${defOk} rate=${j(rl)} missingFns=${fns.join(",") || "-"}`);
  }
  {
    const missingRoutes = Object.entries(ROUTES).filter(([, f]) => !existsSync(f)).map(([k]) => k);
    chk("C2.5-S0.3", "facade `export * as emails` (same bindings) · core sendEmailRich exported · the 6 public/route files exist (inbound · /t/o · /t/c · /u page · /u one-click · Resend webhook)",
      /export\s+\*\s+as\s+emails\s+from\s+["']\.\/emails["']/.test(read(CRM_INDEX)) && CRM?.emails?.sendEmail === EM.sendEmail && typeof EM.sendEmail === "function" &&
        typeof CORE.sendEmailRich === "function" && missingRoutes.length === 0,
      "exported + routes", `facade=${CRM?.emails?.sendEmail === EM.sendEmail} rich=${typeof CORE.sendEmailRich} missing=${missingRoutes.join(",") || "-"}`);
  }
  {
    const srcAuto = read("src/lib/automation/labels.ts");
    const srcHook = read("src/lib/webhooks/labels.ts");
    const decl = (src: string, t: string) => (src.match(new RegExp(`value:\\s*"${t.replace(/\./g, "\\.")}"`, "g")) ?? []).length;
    const probs = EVENTS.flatMap((t) => [
      ...(typeof CONS[t] === "function" ? [] : [`${t}:consumer`]),
      ...(decl(srcAuto, t) + decl(srcHook, t) === 1 ? [] : [`${t}:declared ${decl(srcAuto, t) + decl(srcHook, t)}×`]),
    ]);
    chk("C2.5-S0.4", "events: a `// CRM C2.5 ▸ … ◂` block in outbox-consumers.ts · each of the 6 crm.email.* events has a consumer and is declared in exactly ONE label registry",
      /CRM C2\.5 ▸/.test(consSrc) && probs.length === 0, "6 wired", `block=${/CRM C2\.5 ▸/.test(consSrc)} ${probs.join(" · ") || "-"}`);
  }
  {
    const src = [emSrc, ...Object.values(ROUTES).map(read), read(CORE_EMAIL)].join("\n");
    const miss = ["X1", "X3", "X4", "X5", "X6", "X7", "X8", "X10"].filter((x) => !new RegExp(`AUDIT-CLASS ${x}\\b`).test(src));
    chk("C2.5-S0.5", "implementation sites marked `// AUDIT-CLASS X1 X3 X4 X5 X6 X7 X8 X10` across emails.ts · routes · core/email.ts [static]", miss.length === 0, "8 markers", miss.join(",") || "-", "MINOR");
  }
  {
    const reg = (globalThis as Any)[Symbol.for("shark.platform.minute-jobs.registry")] as Map<string, Any> | undefined;
    const job = reg?.get("crm.email.scheduled");
    const cron = read(CRON);
    chk("C2.5-S0.6", "minute job `crm.email.scheduled` registered on import (everyMinutes 1 · cadence minute · NOT vpsOnly) and scripts/crm-cron.mts imports the e-mail module",
      !!job && job.everyMinutes === 1 && (job.cadence ?? "minute") === "minute" && !job.vpsOnly && /crm\/emails(-job)?["']/.test(cron),
      "registered", `job=${j(job ? { every: job.everyMinutes, cadence: job.cadence, vpsOnly: job.vpsOnly } : null)} cron=${/crm\/emails(-job)?["']/.test(cron)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — throwaway tenants: A (crmA main · crmA2 strangerToLead off · crmR routing lab) · B (foreign) · V (uiVersion-1 cases)
  // ═════════════════════════════════════════════════════════════════════════════
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const mkUser = async (suffix: string) => {
    const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix || "owner"} ${TAG}` } });
    USERS.push(u.id);
    return { id: u.id as string, email: u.email as string, name: u.name as string };
  };
  const uA = await mkUser("");
  const uM = await mkUser("-mgr");
  const uS = await mkUser("-staff");
  const uR = await mkUser("-noemail");
  const STAFF_PERMS = { "crm.contact.read": true, "crm.email.read": true, "crm.email.send": true, "crm.activity.create": true };
  const mkTenant = async (suffix: string) => {
    const t = await P.tenant.create({ data: { name: `${TAG}-${suffix}`, slug: `${TAG}-${suffix}` } });
    TENANTS.push(t.id);
    const m = (userId: string, role: string, permissions: Record<string, unknown>) =>
      P.membership.create({ data: { userId, tenantId: t.id, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } });
    await m(uA.id, "OWNER", {});
    await m(uM.id, "MANAGER", {});
    await m(uS.id, "STAFF", STAFF_PERMS);
    await m(uR.id, "STAFF", { "crm.contact.read": true });
    return { id: t.id as string, slug: t.slug as string };
  };
  const mk = async (tid: string, label: string) => (await sysSvc.createSystem(tid, "CRM", `${label} ${TAG}`)).id as string;
  const setCrm = (sysId: string, obj: Record<string, unknown>) =>
    P.$executeRawUnsafe(
      `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
        (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
      JSON.stringify(obj), sysId);
  const setMail = (sysId: string, obj: Record<string, unknown>) =>
    P.$executeRawUnsafe(
      `UPDATE "AppSystem" SET "settings" = jsonb_set("settings", '{crm,email}',
        (CASE WHEN jsonb_typeof("settings"->'crm'->'email') = 'object' THEN "settings"->'crm'->'email' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
      JSON.stringify(obj), sysId);
  const crmSettings = async (sysId: string) => ((await P.appSystem.findFirst({ where: { id: sysId } }))?.settings?.crm ?? {}) as Any;
  const owner = { userId: uA.id, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> };
  const manager = { userId: uM.id, role: "MANAGER", unitAccess: ["*"] as string[], permissions: {} as Record<string, unknown> };
  const staff = { userId: uS.id, role: "STAFF", unitAccess: ["*"] as string[], permissions: STAFF_PERMS as Record<string, unknown> };
  const noEmail = { userId: uR.id, role: "STAFF", unitAccess: ["*"] as string[], permissions: { "crm.contact.read": true } as Record<string, unknown> };
  const apiNone = { userId: uA.id, role: "STAFF", unitAccess: ["*"] as string[], permissions: { "crm.contact.read": true } as Record<string, unknown>, apiRole: "READONLY" };
  const apiRead = { userId: uA.id, role: "STAFF", unitAccess: ["*"] as string[], permissions: { "crm.email.read": true, "crm.contact.read": true } as Record<string, unknown>, apiRole: "READONLY" };

  const tA = await mkTenant("a");
  const tB = await mkTenant("b");
  const tV = await mkTenant("v1");
  const tidA = tA.id, tidB = tB.id, tidV = tV.id;
  const crmA = await mk(tidA, "CRM");
  const crmA2 = await mk(tidA, "CRM สอง");
  const crmR = await mk(tidA, "CRM เส้นทาง");
  const crmB = await mk(tidB, "CRM-B");
  const crmV = await mk(tidV, "CRM-V1");
  const KEY: Record<string, string> = { [crmA]: key8(), [crmA2]: key8(), [crmR]: key8(), [crmB]: key8(), [crmV]: key8() };
  for (const s of [crmA, crmA2, crmR, crmB, crmV]) {
    await setCrm(s, { uiVersion: 2, bridgesEnabled: true, qcMarker: TAG });
    await setMail(s, { inboundKey: KEY[s], inboundEnabled: true, strangerToLead: true, trackOpens: true, trackClicks: true, fromMode: "SHARK", replyToMode: "SHARK", copyMode: "NONE", allowUserOverride: true });
  }
  await setMail(crmA2, { strangerToLead: false });
  const cA = { tenantId: tidA, systemId: crmA, actorUserId: uA.id };
  const cA2 = { tenantId: tidA, systemId: crmA2, actorUserId: uA.id };
  const cR = { tenantId: tidA, systemId: crmR, actorUserId: uS.id };
  const cB = { tenantId: tidB, systemId: crmB, actorUserId: uA.id };
  const cV = { tenantId: tidV, systemId: crmV, actorUserId: uA.id };
  const cAs = { ...cA, actorUserId: uS.id };
  const cAm = { ...cA, actorUserId: uM.id };

  type Ct = { id: string; email: string; name: string; partyId: string };
  const rawContact = async (tid: string, sys: string, label: string, ownerUserId: string, extra: Record<string, unknown> = {}): Promise<Ct> => {
    const name = pii(`${label} ${TAG}-${nx()}`);
    const email = mailOf(`c${nx()}`);
    const party = await P.party.create({ data: { tenantId: tid, name, kind: "PERSON", email } }).catch(() => P.party.create({ data: { tenantId: tid, name, kind: "PERSON" } }));
    const base = { tenantId: tid, systemId: sys, name, firstName: name, email, partyId: party.id, ownerUserId };
    // a column of crm_v2_b missing (--force-run on an old schema) ⇒ plain contact; the checks that need it go red, never a crash
    const row = await P.crmContact.create({ data: { ...base, ...extra } }).catch(() => P.crmContact.create({ data: base }));
    return { id: row.id as string, email, name, partyId: party.id as string };
  };
  const grant = (tid: string, sys: string, contactId: string) =>
    P.crmContactConsent.create({ data: { tenantId: tid, systemId: sys, contactId, channel: "EMAIL", granted: true, source: "STAFF" } });
  const consenting = async (tid: string, sys: string, label: string, ownerUserId = uA.id, extra: Record<string, unknown> = {}) => {
    const c = await rawContact(tid, sys, label, ownerUserId, extra);
    await grant(tid, sys, c.id);
    return c;
  };
  const kOk = await consenting(tidA, crmA, "ลูกค้าหลัก");
  const kOpt = await consenting(tidA, crmA, "ขอเลิกรับ", uA.id, { emailOptOut: true });
  const kBounce = await consenting(tidA, crmA, "อีเมลเด้ง", uA.id, { emailBouncedAt: new Date(Date.now() - DAY) });
  const kNoCons = await rawContact(tidA, crmA, "ไม่มีความยินยอม", uA.id);
  const kTrk = await consenting(tidA, crmA, "ไม่ให้ติดตาม", uA.id, { trackingOptOut: true });
  const kStaff = await consenting(tidA, crmA, "ลูกค้าพนักงาน", uS.id);
  const kHidden = await consenting(tidA, crmA, "ลูกค้าผู้จัดการ", uM.id);
  const kUnsub = await consenting(tidA, crmA, "กดเลิกรับ");
  const kSeq = await consenting(tidA, crmA, "ตอบกลับ");
  const kSeqB = await consenting(tidA, crmA, "เด้งกลับ");
  const kAuto = await consenting(tidA, crmA, "ตอบอัตโนมัติ");
  const kComp = await consenting(tidA, crmA, "แจ้งสแปม");
  const oldMail = mailOf("old-address");
  const kPrev = await consenting(tidA, crmA, "เปลี่ยนอีเมล", uA.id, { previousEmails: [oldMail] });
  const kThr = await consenting(tidA, crmA, "เธรด");
  const kA2 = await consenting(tidA, crmA2, "ระบบสอง");
  const kB = await consenting(tidB, crmB, "ลูกค้า-B");
  const kV = await consenting(tidV, crmV, "ลูกค้า-V1");
  const kV2 = await consenting(tidV, crmV, "ลูกค้า-V1-ตั้งเวลา");
  const coParty = await P.party.create({ data: { tenantId: tidA, name: `บริษัททดสอบ ${TAG}`, kind: "COMPANY" } });
  const CO_DOMAIN = `${TAG}-co.example`;
  const coA = await P.crmCompany.create({ data: { tenantId: tidA, systemId: crmA, partyId: coParty.id, name: `บริษัททดสอบ ${TAG}`, emailDomain: CO_DOMAIN, ownerUserId: uA.id } });
  const opt = async <T,>(fn: () => Promise<T>): Promise<T | null> => { try { return await fn(); } catch { return null; } };
  const VER_DOMAIN = `${TAG}-ver.example`;
  const PEND_DOMAIN = `${TAG}-pend.example`;
  await opt(() => P.emailDomain.create({ data: { tenantId: tidA, domain: VER_DOMAIN, status: "VERIFIED", verifiedAt: new Date() } }));
  await opt(() => P.emailDomain.create({ data: { tenantId: tidA, domain: PEND_DOMAIN, status: "PENDING" } }));
  const domB = (await opt(() => P.emailDomain.create({ data: { tenantId: tidB, domain: `${TAG}-b.example`, status: "PENDING" } }))) as Any;

  // sequence fixtures (C2.0 tables) — ACTIVE enrollments to observe stopFor
  const mkEnroll = async (tid: string, sys: string, contactId: string, label: string): Promise<string> => (await opt(async () => {
    const s = await P.crmSequence.create({ data: { tenantId: tid, systemId: sys, name: `${label} ${TAG}-${nx()}`, stopOnReply: true, businessDaysOnly: false } });
    await P.crmSequenceStep.create({ data: { tenantId: tid, sequenceId: s.id, version: 1, index: 0, kind: "WAIT", waitDays: 30 } });
    const e = await P.crmSequenceEnrollment.create({ data: { tenantId: tid, sequenceId: s.id, contactId, enrolledBy: "API", sequenceVersion: 1, stepIndex: 0, nextAt: new Date(Date.now() + 30 * DAY), status: "ACTIVE" } });
    return e.id as string;
  })) ?? NONE;
  const enrollment = async (id: string) => (id === NONE ? null : ((await opt(() => P.crmSequenceEnrollment.findFirst({ where: { id } }))) as Any));

  // storage + transport fakes
  const PUTS: string[] = [];
  const DELS: string[] = [];
  const storeDeps = { put: async (path: string) => { PUTS.push(path); }, del: async (path: string) => { DELS.push(path); return 200; } };
  const SENT: Any[] = [];
  const tp = (delayMs = 0, onSend?: (m: Any) => Promise<void> | void) => async (m: Any) => {
    SENT.push(m);
    if (onSend) await onSend(m);
    if (delayMs) await sleep(delayMs);
    return { ok: true, providerId: `re_qc_tp_${TAG}_${nx()}` };
  };
  const deps = (extra: Record<string, unknown> = {}) => ({ transport: tp(), ...storeDeps, ...extra });
  const sentWith = (needle: string) => SENT.filter((m) => String(m?.subject ?? "").includes(needle));
  const subj = (label: string) => `${label} ${SUBJ_MARK} ${TAG}-${nx()}`;
  const html = (extra = "") => `<p>เรียนลูกค้า ${BODY_MARK}</p><p><a href="https://shop.example/offer?id=7">ดูข้อเสนอ</a> · <a href="mailto:sales@shop.example">อีเมล</a> · <a href="tel:021234567">โทร</a></p>${extra}`;
  const send = (c: Any, who: Any, input: Record<string, unknown>, d: Any = deps()) => call(EM.sendEmail, c, who, { subject: subj("ส่ง"), bodyHtml: html(), ...input }, d);
  const idOf = (r: Res) => (r.ok && typeof r.v?.emailId === "string" ? (r.v.emailId as string) : NONE);
  // C2.0 models absent (--force-run on an old schema) ⇒ an empty stand-in, so checks go red instead of crashing
  const NULL_MODEL = { findFirst: async () => null, findMany: async () => [], count: async () => 0, updateMany: async () => ({ count: 0 }), create: async () => { throw new Error("model absent"); }, upsert: async () => { throw new Error("model absent"); } };
  const M = (name: string): Any => P[name] ?? NULL_MODEL;
  const row = async (id: string) => (id && id !== NONE ? ((await M("crmEmailMessage").findFirst({ where: { id } })) as Any) : null);
  const rowsByMid = async (mid: string) => ((await M("crmEmailMessage").findMany({ where: { messageId: { contains: bare(mid) } } })) as Any[]);
  const actsOf = async (emailId: string) => ((await P.crmActivity.findMany({ where: { sourceRef: emailId } })) as Any[]);
  const evRows = async (emailId: string, kind?: string) => ((await M("crmEmailEvent").findMany({ where: { emailId, ...(kind ? { kind } : {}) } })) as Any[]);
  const outboxOf = async (type: string, emailId?: string) =>
    ((await P.outboxEvent.findMany({ where: { tenantId: { in: TENANTS }, type } })) as Any[]).filter((e) => !emailId || e.payload?.emailId === emailId);
  const pixTok = (h: string) => (String(h ?? "").match(/\/t\/o\/([A-Za-z0-9_.~-]+?)\.gif/) ?? [])[1] ?? "";
  const clickToks = (h: string) => [...String(h ?? "").matchAll(/href="([^"]*\/t\/c\/([^"?#/]+)[^"]*)"/g)].map((m) => ({ href: m[1], tok: decodeURIComponent(m[2]) }));
  const unsubTok = (h: string) => (String(h ?? "").match(/\/u\/([A-Za-z0-9_.~-]+)/) ?? [])[1] ?? "";
  const TOKENS: string[] = [];
  // ORACLE-EDIT (controller · 24 Sep): `$1` deduced as text inside `CASE … ELSE $1` ⇒ Postgres 42P08 on this driver — explicit ::timestamp casts (same semantics)
  const backdate = (id: string, ms: number) => P.$executeRawUnsafe(`UPDATE "CrmEmailMessage" SET "sentAt" = $1::timestamp, "receivedAt" = CASE WHEN "receivedAt" IS NULL THEN NULL ELSE $1::timestamp END, "createdAt" = $1::timestamp WHERE id = $2`, new Date(Date.now() - ms), id);

  // route callers — a missing route answers status -1 (never a crash)
  type Rr = { status: number; ct: string; cache: string; loc: string; hex: string; text: string };
  const viaRoute = async (fn: Any, req: Request, params?: Record<string, string>): Promise<Rr> => {
    if (typeof fn !== "function") return { status: -1, ct: "", cache: "", loc: "", hex: "", text: "missing route" };
    try {
      const res: Response = await fn(req, { params: Promise.resolve(params ?? {}) });
      const buf = Buffer.from(await res.arrayBuffer());
      return { status: res.status, ct: res.headers.get("content-type") ?? "", cache: res.headers.get("cache-control") ?? "", loc: res.headers.get("location") ?? "", hex: buf.toString("hex"), text: buf.toString("utf8") };
    } catch (e) {
      return { status: -2, ct: "", cache: "", loc: "", hex: "", text: cut(e instanceof Error ? e.message : String(e)) };
    }
  };
  const getO = (tok: string, ua = UA_OK, ip = ipN()) => {
    RATE_REQ.push({ route: "o", ip, token: tok });
    return viaRoute(R_O.GET, new Request(`http://localhost/t/o/${tok}.gif`, { headers: { "user-agent": ua, "x-forwarded-for": ip } }), { token: `${tok}.gif` });
  };
  const getC = (tok: string, qs = "", ua = UA_OK, ip = ipN()) => {
    RATE_REQ.push({ route: "c", ip, token: tok });
    return viaRoute(R_C.GET, new Request(`http://localhost/t/c/${encodeURIComponent(tok)}${qs}`, { headers: { "user-agent": ua, "x-forwarded-for": ip } }), { token: tok });
  };
  const postU = (tok: string, method = "POST", ip = ipN()) => {
    RATE_REQ.push({ route: "u", ip, token: tok });
    const fn = method === "POST" ? R_U1.POST : R_U1.GET;
    return viaRoute(fn ?? (method === "GET" ? async () => new Response(null, { status: 405 }) : undefined), new Request(`http://localhost/u/${tok}/one-click`, {
      method, headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip }, ...(method === "POST" ? { body: "List-Unsubscribe=One-Click" } : {}) }), { token: tok });
  };
  const whSign = (id: string, ts: string, body: string) => `v1,${createHmac("sha256", Buffer.from(WH_KEY_B64, "base64")).update(`${id}.${ts}.${body}`).digest("base64")}`;
  const postWh = (payload: unknown, o: { id?: string; ts?: number; sig?: string | null; raw?: string } = {}) => {
    const body = o.raw ?? JSON.stringify(payload);
    const id = o.id ?? `msg_${TAG}_${nx()}`;
    const ts = String(o.ts ?? Math.floor(Date.now() / 1000));
    const ip = ipN();
    RATE_REQ.push({ route: "wh", ip });
    const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": ip };
    if (o.sig !== null) { headers["svix-id"] = id; headers["svix-timestamp"] = ts; headers["svix-signature"] = o.sig ?? whSign(id, ts, body); }
    return viaRoute(R_WH.POST, new Request("http://localhost/api/email/resend/webhook", { method: "POST", headers, body }));
  };
  const postIn = (data: Record<string, unknown>, secret = String(process.env.EMAIL_INBOUND_SECRET)) =>
    viaRoute(R_IN.POST, new Request("http://localhost/api/email/inbound", { method: "POST", headers: { "content-type": "application/json", "x-inbound-secret": secret }, body: JSON.stringify({ type: "email.received", data }) }));
  const mid = () => `<${TAG}-${nx()}@mail.example>`;
  const inMail = (o: { from: string; to: string[]; subject?: string; html?: string; text?: string; messageId?: string; headers?: Record<string, string>; cc?: string[]; attachments?: Any[] }) => ({
    messageId: o.messageId ?? mid(), from: o.from, to: o.to, cc: o.cc ?? [], subject: o.subject ?? subj("ขาเข้า"), text: o.text ?? `ข้อความ ${BODY_MARK}`,
    html: o.html ?? `<p>ข้อความ ${BODY_MARK}</p>`, headers: o.headers ?? {}, attachments: o.attachments ?? [],
  });
  const ingest = (p: Any, d: Any = { transport: tp(), ...storeDeps }) => call(EM.ingestInbound, p, d);
  const evtOf = (r: Any) => ({ id: r.id, tenantId: r.tenantId, type: r.type, payload: r.payload, systemId: r.systemId, unitId: r.unitId, idempotencyKey: r.idempotencyKey });
  const consume = (evt: Any) => call(CONS?.[evt?.type], evt);
  const pump = async (tids: string[] = TENANTS, rounds = 20) => {
    for (let i = 0; i < rounds; i += 1) {
      const rows = (await P.outboxEvent.findMany({ where: { tenantId: { in: tids }, status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 200 })) as Any[];
      if (rows.length === 0) return true;
      for (const r of rows) {
        await consume(evtOf(r));
        await P.outboxEvent.update({ where: { id: r.id }, data: { status: "DONE", processedAt: new Date() } }).catch(() => null);
      }
    }
    return false;
  };
  const pdf = (bytes = 2048) => ({ filename: "ใบเสนอราคา.pdf", contentType: "application/pdf", data: new Uint8Array(bytes).fill(37) });

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — routing: 3 reply-to modes × user override × verified domain × copy-to (lab system crmR · actor = staff)
  // ═════════════════════════════════════════════════════════════════════════════
  out("── S1 · routing ──");
  const rt = async () => call(EM.resolveRouting, cR, staff);
  const userRow = async (data: Record<string, unknown> | null) => {
    await opt(() => P.crmEmailUserSetting.deleteMany({ where: { systemId: crmR, userId: uS.id } }));
    if (data) await opt(() => P.crmEmailUserSetting.create({ data: { tenantId: tidA, systemId: crmR, userId: uS.id, ...data } }));
  };
  const shopR = (o: Record<string, unknown>) => setMail(crmR, { fromMode: "SHARK", fromName: null, fromAddr: null, replyToMode: "SHARK", replyToAddr: null, copyToAddr: null, copyMode: "NONE", allowUserOverride: true, ...o });
  const lc = (s: unknown) => String(s ?? "").toLowerCase();
  const SHARK_FROM = `${tA.slug}@shark.in.th`.toLowerCase();
  const CUSTOM_SHOP = mailOf("replyto-shop");
  const CUSTOM_USER = mailOf("replyto-user");
  {
    await shopR({}); await userRow(null);
    const r = await rt();
    chk("C2.5-S1.1", "defaults (fromMode SHARK · replyTo SHARK · no user row) ⇒ fromAddr `<tenant slug>@shark.in.th` · fromName = the staff's display name · replyTo `crm+<key>@shark.in.th` · via SHARK · copyTo []",
      r.ok && lc(r.v?.fromAddr) === SHARK_FROM && r.v?.fromName === uS.name && lc(r.v?.replyTo) === INADDR(KEY[crmR]) && r.v?.via === "SHARK" && Array.isArray(r.v?.copyTo) && r.v.copyTo.length === 0,
      "shark defaults", `${rd(r)} ${cut(j(r.v), 200)}`);
  }
  {
    await shopR({ replyToMode: "STAFF" });
    const r = await rt();
    chk("C2.5-S1.2", "shop replyToMode STAFF ⇒ replyTo = the sending staff's own User.email (customer answers land in the staff inbox)",
      r.ok && lc(r.v?.replyTo) === lc(uS.email), uS.email, `${rd(r)} replyTo=${r.v?.replyTo}`);
  }
  {
    await shopR({ replyToMode: "CUSTOM", replyToAddr: CUSTOM_SHOP });
    const r = await rt();
    chk("C2.5-S1.3", "shop replyToMode CUSTOM ⇒ replyTo = settings.email.replyToAddr", r.ok && lc(r.v?.replyTo) === lc(CUSTOM_SHOP), CUSTOM_SHOP, `${rd(r)} replyTo=${r.v?.replyTo}`);
  }
  {
    await shopR({ replyToMode: "CUSTOM", replyToAddr: CUSTOM_SHOP });
    await userRow({ replyToMode: "CUSTOM", replyToAddr: CUSTOM_USER, fromName: "ฝ่ายขาย QC" });
    const r1 = await rt();
    await userRow({ replyToMode: "SELF" });
    const r2 = await rt();
    chk("C2.5-S1.4", "per-user override wins (allowUserOverride true): user CUSTOM ⇒ the user's replyToAddr + user fromName · user SELF ⇒ the user's own e-mail — both over a shop CUSTOM address",
      r1.ok && lc(r1.v?.replyTo) === lc(CUSTOM_USER) && r1.v?.fromName === "ฝ่ายขาย QC" && r2.ok && lc(r2.v?.replyTo) === lc(uS.email),
      "user wins", `r1=${rd(r1)} ${r1.v?.replyTo}/${r1.v?.fromName} r2=${rd(r2)} ${r2.v?.replyTo}`);
  }
  {
    await shopR({ replyToMode: "CUSTOM", replyToAddr: CUSTOM_SHOP, allowUserOverride: false });
    await userRow({ replyToMode: "CUSTOM", replyToAddr: CUSTOM_USER, fromName: "ฝ่ายขาย QC" });
    const r = await rt();
    chk("C2.5-S1.5", "allowUserOverride false ⇒ the user row is ignored entirely (replyTo = shop address · fromName = staff display name, not the row's)",
      r.ok && lc(r.v?.replyTo) === lc(CUSTOM_SHOP) && r.v?.fromName === uS.name, "shop wins", `${rd(r)} ${r.v?.replyTo}/${r.v?.fromName}`);
  }
  {
    await userRow(null);
    await shopR({ fromMode: "DOMAIN", fromAddr: `sales@${VER_DOMAIN}`, fromName: "ร้านทดสอบ QC" });
    const r1 = await rt();
    await shopR({ fromMode: "DOMAIN", fromAddr: `sales@${PEND_DOMAIN}`, fromName: "ร้านทดสอบ QC" });
    const r2 = await rt();
    chk("C2.5-S1.6", "fromMode DOMAIN on a VERIFIED EmailDomain ⇒ fromAddr sales@<domain>, via DOMAIN, fromName = shop fromName · the same on a PENDING domain ⇒ falls back to `<slug>@shark.in.th`, via SHARK (PENDING never counts)",
      r1.ok && lc(r1.v?.fromAddr) === `sales@${VER_DOMAIN}` && r1.v?.via === "DOMAIN" && r1.v?.fromName === "ร้านทดสอบ QC" && r2.ok && lc(r2.v?.fromAddr) === SHARK_FROM && r2.v?.via === "SHARK",
      "verified only", `r1=${rd(r1)} ${r1.v?.fromAddr}/${r1.v?.via}/${r1.v?.fromName} r2=${rd(r2)} ${r2.v?.fromAddr}/${r2.v?.via}`);
  }
  {
    await shopR({});
    await userRow({ fromAddr: `nok@${VER_DOMAIN}` });
    const r1 = await rt();
    await userRow({ fromAddr: `nok@${PEND_DOMAIN}` });
    const r2 = await rt();
    chk("C2.5-S1.7", "user fromAddr on a VERIFIED domain ⇒ used (via DOMAIN) · on a PENDING domain ⇒ ignored (shop SHARK address)",
      r1.ok && lc(r1.v?.fromAddr) === `nok@${VER_DOMAIN}` && r1.v?.via === "DOMAIN" && r2.ok && lc(r2.v?.fromAddr) === SHARK_FROM,
      "verified only", `r1=${rd(r1)} ${r1.v?.fromAddr} r2=${rd(r2)} ${r2.v?.fromAddr}`);
  }
  {
    const C1 = mailOf("copy-shop");
    const C2 = mailOf("copy-user");
    await shopR({ copyToAddr: C1, copyMode: "OUT" });
    await userRow({ copyToAddr: C2, copyMode: "BOTH" });
    const r1 = await rt();
    await shopR({ copyToAddr: C1, copyMode: "IN" });
    const r2 = await rt();
    const has = (a: unknown, x: string) => addrsOf(a).includes(x.toLowerCase());
    chk("C2.5-S1.8", "copy-to: shop OUT + user BOTH ⇒ copyTo ∋ both, copyIn = user only · shop IN ⇒ shop address leaves copyTo and enters copyIn",
      r1.ok && has(r1.v?.copyTo, C1) && has(r1.v?.copyTo, C2) && has(r1.v?.copyIn, C2) && !has(r1.v?.copyIn, C1) && r2.ok && !has(r2.v?.copyTo, C1) && has(r2.v?.copyIn, C1) && has(r2.v?.copyTo, C2),
      "per direction", `r1=${rd(r1)} to=${j(r1.v?.copyTo)} in=${j(r1.v?.copyIn)} r2 to=${j(r2.v?.copyTo)} in=${j(r2.v?.copyIn)}`);
    await shopR({}); await userRow(null);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — send: consent · pixel · link wrapping · unsubscribe · scheduled · headers
  // ═════════════════════════════════════════════════════════════════════════════
  out("── S2 · send ──");
  const S_MAIN = subj("หลัก");
  const rMain = await send(cA, owner, { contactId: kOk.id, subject: S_MAIN });
  const eMain = idOf(rMain);
  const mMain = sentWith(S_MAIN)[0] ?? {};
  const rowMain = await row(eMain);
  const tokO = pixTok(mMain.html);
  const ctoks = clickToks(mMain.html);
  const utok = unsubTok(mMain.html);
  TOKENS.push(tokO, ...ctoks.map((c) => c.tok), utok);
  {
    const blocked: Record<string, Res> = {};
    const before = SENT.length;
    for (const [k, c] of [["optOut", kOpt], ["noConsent", kNoCons]] as const) blocked[k] = await send(cA, owner, { contactId: c.id, subject: `บล็อก ${k} ${TAG}` });
    const leaked = await M("crmEmailMessage").count({ where: { tenantId: tidA, subject: { startsWith: "บล็อก " } } });
    const canOk = await call(CNS.canContact, await P.crmContact.findFirst({ where: { id: kOk.id } }), "EMAIL");
    const canNo = await call(CNS.canContact, await P.crmContact.findFirst({ where: { id: kNoCons.id } }), "EMAIL");
    const acts = await actsOf(eMain);
    const sentEv = await outboxOf("crm.email.sent", eMain);
    const audit = await P.auditLog.findMany({ where: { tenantId: tidA, action: "crm.email.send", targetId: eMain } });
    const bOk = Object.values(blocked).every((r) => refused(r, "EMAIL_BLOCKED") && !r.msg.includes(kOpt.email) && !r.msg.includes(kNoCons.email));
    chk("C2.5-S2.4", "consent at SEND time: emailOptOut / no EMAIL consent ⇒ EMAIL_BLOCKED (Thai, no address echoed) with NOTHING written or sent · [positive control: canContact true for the consenting fixture] a consenting contact ⇒ row OUT SENT with providerId + sentById, ONE EMAIL/OUT activity (sourceRef = emailId), ONE crm.email.sent, audit crm.email.send",
      canOk.ok && canOk.v === true && canNo.ok && canNo.v === false && bOk && leaked === 0 && SENT.length === before &&
        rowMain?.direction === "OUT" && rowMain?.status === "SENT" && !!rowMain?.providerId && rowMain?.sentById === uA.id && rowMain?.contactId === kOk.id &&
        acts.length === 1 && acts[0]?.type === "EMAIL" && acts[0]?.direction === "OUT" && sentEv.length === 1 && audit.length === 1,
      "blocked · sent once", `can=${canOk.v}/${canNo.v} blocked=${Object.entries(blocked).map(([k, r]) => `${k}:${rd(r)}`).join(" ")} leaked=${leaked} main=${rd(rMain)} status=${rowMain?.status} acts=${acts.length} ev=${sentEv.length} audit=${audit.length}`);
  }
  {
    const early = await getO(tokO);
    const r0 = await row(eMain);
    await backdate(eMain, 60_000);
    const ok1 = await getO(tokO);
    const r1 = await row(eMain);
    const ev = await evRows(eMain, "OPEN");
    const ob = await outboxOf("crm.email.opened", eMain);
    const stored = String(rowMain?.bodyHtml ?? "");
    chk("C2.5-S2.1", "pixel: trackOpens ⇒ `/t/o/<token>.gif` in the SENT html but NOT in the stored bodyHtml · an open within 2 s of sending is not counted (gif still served) · after that ONE open ⇒ openCount 1, ONE OPEN event, firstOpenedAt, status OPENED, ONE crm.email.opened",
      !!tokO && stored.includes(BODY_MARK) && !stored.includes("/t/o/") && !stored.includes(tokO) && early.status === 200 && /image\/gif/.test(early.ct) && Number(r0?.openCount) === 0 &&
        ok1.status === 200 && Number(r1?.openCount) === 1 && ev.length === 1 && !!r1?.firstOpenedAt && r1?.status === "OPENED" && ob.length === 1,
      "counted once", `tok=${!!tokO} storedClean=${!stored.includes("/t/o/")} early=${early.status}/${r0?.openCount} after=${ok1.status}/${r1?.openCount} ev=${ev.length} status=${r1?.status} ob=${ob.length}`);
  }
  {
    const offer = ctoks.find(() => true);
    const hrefs = String(mMain.html ?? "");
    const c1 = offer ? await getC(offer.tok) : ({ status: -1, loc: "" } as Rr);
    const r1 = await row(eMain);
    const ev = await evRows(eMain, "CLICK");
    const ob = await outboxOf("crm.email.clicked", eMain);
    chk("C2.5-S2.2", "links: the https link is rewritten to `/t/c/<token>` (original host gone from its href) · mailto:/tel: untouched · GET /t/c ⇒ 302 to EXACTLY https://shop.example/offer?id=7 · clickCount 1 · ONE CLICK event · ONE crm.email.clicked",
      ctoks.length === 1 && !/href="https:\/\/shop\.example/.test(hrefs) && hrefs.includes(`href="mailto:sales@shop.example"`) && hrefs.includes(`href="tel:021234567"`) &&
        c1.status === 302 && c1.loc === "https://shop.example/offer?id=7" && Number(r1?.clickCount) === 1 && ev.length === 1 && ob.length === 1,
      "wrapped + exact 302", `wrapped=${ctoks.length} raw=${/href="https:\/\/shop\.example/.test(hrefs)} click=${c1.status} loc=${cut(c1.loc, 80)} count=${r1?.clickCount} ev=${ev.length} ob=${ob.length}`);
  }
  {
    const S = subj("เลิกรับ");
    const r = await send(cA, owner, { contactId: kUnsub.id, subject: S });
    const m = sentWith(S)[0] ?? {};
    const t = unsubTok(m.html);
    TOKENS.push(t, pixTok(m.html));
    const lu = hdr(m, "List-Unsubscribe");
    const lup = hdr(m, "List-Unsubscribe-Post");
    const bodyLinkWrapped = /\/t\/c\/[^"]*"[^>]*>[^<]*(ยกเลิก|เลิกรับ)/.test(String(m.html ?? ""));
    const p1 = await postU(t);
    const p2 = await postU(t);
    const k = await P.crmContact.findFirst({ where: { id: kUnsub.id } });
    const cons = await P.crmContactConsent.findMany({ where: { contactId: kUnsub.id, channel: "EMAIL" }, orderBy: { createdAt: "desc" } });
    const ev = await evRows(idOf(r), "UNSUBSCRIBE");
    const again = await send(cA, owner, { contactId: kUnsub.id, subject: subj("หลังเลิกรับ") });
    chk("C2.5-S2.3", "unsubscribe: body link `/u/<token>` (not wrapped) + `List-Unsubscribe: <…/u/<token>/one-click>` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` · POST one-click ⇒ 2xx, emailOptOut true, latest EMAIL consent granted=false, ONE UNSUBSCRIBE event (replayed POST adds none) · the next send ⇒ EMAIL_BLOCKED",
      r.ok && !!t && t.length >= 22 && lu.includes(`/u/${t}/one-click`) && /^<https?:\/\//.test(lu.trim()) && /List-Unsubscribe=One-Click/.test(lup) && !bodyLinkWrapped &&
        p1.status >= 200 && p1.status < 300 && p2.status === p1.status && k?.emailOptOut === true && cons[0]?.granted === false && ev.length === 1 && refused(again, "EMAIL_BLOCKED"),
      "one-click opt-out", `send=${rd(r)} tok=${t.length} LU=${cut(lu, 80)} LUP=${lup} post=${p1.status}/${p2.status} optOut=${k?.emailOptOut} consent=${cons[0]?.granted} ev=${ev.length} again=${rd(again)}`);
  }
  {
    const kSch = await consenting(tidA, crmA, "ตั้งเวลา");
    const S = subj("ตั้งเวลา");
    const at = new Date(Date.now() + 2 * 60_000);
    const r = await send(cA, owner, { contactId: kSch.id, subject: S, scheduledAt: at.toISOString() });
    const e = idOf(r);
    const q = await row(e);
    const sentBefore = sentWith(S).length;
    const run = await call(EM.runScheduled, new Date(Date.now() + 3 * 60_000), { tenantIds: [tidA], deps: deps() });
    const q2 = await row(e);
    const run2 = await call(EM.runScheduled, new Date(Date.now() + 4 * 60_000), { tenantIds: [tidA], deps: deps() });
    chk("C2.5-S2.5", "scheduled: scheduledAt in the future ⇒ status QUEUED, scheduledAt stored, NO transport call, no crm.email.sent · runScheduled(now ≥ scheduledAt) ⇒ SENT exactly once (a second run sends nothing) + ONE crm.email.sent",
      r.ok && r.v?.status === "QUEUED" && q?.status === "QUEUED" && !!q?.scheduledAt && sentBefore === 0 && run.ok && run2.ok && q2?.status === "SENT" && sentWith(S).length === 1 && (await outboxOf("crm.email.sent", e)).length === 1,
      "queued → sent once", `send=${rd(r)} status=${q?.status} before=${sentBefore} run=${rd(run)} after=${q2?.status} sends=${sentWith(S).length}`);
  }
  {
    const midH = bare(hdr(mMain, "Message-ID"));
    const S = subj("ตอบในเธรด");
    const rr = await send(cA, owner, { contactId: kOk.id, subject: S, replyToEmailId: eMain });
    const m = sentWith(S)[0] ?? {};
    const rrow = await row(idOf(rr));
    const before = resendCalls().length;
    const S3 = subj("ผ่านผู้ให้บริการ");
    const rd3 = await send(cA, owner, { contactId: kOk.id, subject: S3 }, { ...storeDeps });
    const calls = resendCalls().slice(before);
    const row3 = await row(idOf(rd3));
    let body3: Any = {};
    try { body3 = JSON.parse(calls[0]?.body ?? "{}"); } catch { /* */ }
    TOKENS.push(pixTok(m.html), pixTok(body3.html ?? ""));
    chk("C2.5-S2.6", "headers: Message-ID sent = stored messageId · a reply (replyToEmailId) carries In-Reply-To = parent id, References ∋ parent id, same threadKey · without an injected transport the send goes through core sendEmailRich ⇒ ONE Resend POST whose html has the pixel, providerId = the provider's id",
      !!midH && bare(rowMain?.messageId).includes(midH) && rr.ok && bare(hdr(m, "In-Reply-To")) === midH && hdr(m, "References").includes(midH) && rrow?.threadKey === rowMain?.threadKey &&
        rd3.ok && calls.length === 1 && String(body3.html ?? "").includes("/t/o/") && String(row3?.providerId ?? "").startsWith(`re_qc_${TAG}`),
      "threaded + real transport path", `mid=${cut(midH, 60)} stored=${cut(rowMain?.messageId, 60)} irt=${cut(hdr(m, "In-Reply-To"), 60)} thread=${rrow?.threadKey === rowMain?.threadKey} resend=${calls.length} provider=${row3?.providerId}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — inbound matching (6 cases)
  // ═════════════════════════════════════════════════════════════════════════════
  out("── S3 · inbound matching ──");
  const inA = INADDR(KEY[crmA]);
  const contactsByEmail = async (sys: string, email: string) => ((await P.crmContact.findMany({ where: { systemId: sys, email: { equals: email, mode: "insensitive" } } })) as Any[]);
  {
    const m1 = mid();
    const viaR = await postIn({ message_id: m1, from: `"ลูกค้าหลัก" <${kOk.email.toUpperCase()}>`, to: [inA], subject: subj("ถามราคา"), html: `<p>${BODY_MARK}</p>`, text: BODY_MARK, headers: {} });
    const rows1 = await rowsByMid(m1);
    const r2 = await ingest(inMail({ from: oldMail, to: [inA] }));
    const row2 = await row(r2.v?.emailId ?? NONE);
    const acts = rows1[0] ? await actsOf(rows1[0].id) : [];
    const rec = rows1[0] ? await outboxOf("crm.email.received", rows1[0].id) : [];
    chk("C2.5-S3.1", "match by e-mail (through the real /api/email/inbound route, crm+ recipient, From upper-cased) ⇒ ONE row IN in crmA, contactId = the contact, matchedBy EMAIL, ONE EMAIL/IN activity, ONE crm.email.received · From = an address in previousEmails ⇒ that contact (R-A)",
      viaR.status === 200 && rows1.length === 1 && rows1[0]?.systemId === crmA && rows1[0]?.direction === "IN" && rows1[0]?.contactId === kOk.id && rows1[0]?.matchedBy === "EMAIL" &&
        acts.length === 1 && acts[0]?.direction === "IN" && rec.length === 1 && r2.ok && row2?.contactId === kPrev.id,
      "matched", `route=${viaR.status} rows=${rows1.length} sys=${rows1[0]?.systemId === crmA} contact=${rows1[0]?.contactId === kOk.id} by=${rows1[0]?.matchedBy} acts=${acts.length} rec=${rec.length} prev=${rd(r2)}/${row2?.contactId === kPrev.id}`);
  }
  {
    const before = (await P.crmContact.count({ where: { systemId: crmA } })) as number;
    const r = await ingest(inMail({ from: `buyer@${CO_DOMAIN}`, to: [inA] }));
    const rw = await row(r.v?.emailId ?? NONE);
    const after = (await P.crmContact.count({ where: { systemId: crmA } })) as number;
    chk("C2.5-S3.2", "match by company domain (CrmCompany.emailDomain) ⇒ companyId set, contactId null, matchedBy DOMAIN, no contact created (even with strangerToLead on)",
      r.ok && rw?.companyId === coA.id && !rw?.contactId && rw?.matchedBy === "DOMAIN" && after === before, "domain", `${rd(r)} company=${rw?.companyId === coA.id} contact=${rw?.contactId} by=${rw?.matchedBy} contacts ${before}→${after}`);
  }
  const STRANGER = mailOf("stranger");
  {
    const r = await ingest(inMail({ from: `"สมชาย ใจดี" <${STRANGER}>`, to: [inA] }));
    const rw = await row(r.v?.emailId ?? NONE);
    const cs = await contactsByEmail(crmA, STRANGER);
    const ev = cs[0] ? ((await P.outboxEvent.findMany({ where: { tenantId: tidA, type: "crm.contact.created" } })) as Any[]).filter((e) => e.payload?.contactId === cs[0].id) : [];
    chk("C2.5-S3.3", "stranger + strangerToLead ⇒ ONE new contact (email = sender, name from the display name, leadStatus NEW, source/sourceChannel EMAIL) + crm.contact.created · the row points at it",
      r.ok && cs.length === 1 && /สมชาย/.test(String(cs[0]?.name ?? "")) && cs[0]?.leadStatus === "NEW" && (cs[0]?.source === "EMAIL" || cs[0]?.sourceChannel === "EMAIL") && rw?.contactId === cs[0]?.id && ev.length === 1,
      "lead", `${rd(r)} contacts=${cs.length} name=${cut(cs[0]?.name, 40)} src=${cs[0]?.source}/${cs[0]?.sourceChannel} linked=${rw?.contactId === cs[0]?.id} created=${ev.length}`);
  }
  {
    const unknown = mailOf("staff-to-unknown");
    const r1 = await ingest(inMail({ from: `"พนักงาน" <${uS.email}>`, to: [kStaff.email, inA], subject: subj("สำเนา BCC") }));
    const r2 = await ingest(inMail({ from: uS.email, to: [unknown, inA], subject: subj("BCC ไม่รู้จัก") }));
    const w1 = await row(r1.v?.emailId ?? NONE);
    const w2 = await row(r2.v?.emailId ?? NONE);
    const cs = await contactsByEmail(crmA, unknown);
    chk("C2.5-S3.4", "staff BCC capture: From = a staff member of the tenant ⇒ stored as OUT, sentById = that staff, contactId = the To contact · staff to an unknown address ⇒ OUT, contactId null, NO lead created for the recipient",
      r1.ok && w1?.direction === "OUT" && w1?.sentById === uS.id && w1?.contactId === kStaff.id && r2.ok && w2?.direction === "OUT" && !w2?.contactId && cs.length === 0,
      "OUT captured", `r1=${rd(r1)} dir=${w1?.direction} by=${w1?.sentById === uS.id} contact=${w1?.contactId === kStaff.id} r2=${rd(r2)} dir2=${w2?.direction} c2=${w2?.contactId} leads=${cs.length}`);
  }
  {
    const eAuto = await mkEnroll(tidA, crmA, kAuto.id, "ตอบอัตโนมัติ");
    const S = subj("ถึงคนตอบอัตโนมัติ");
    const o = await send(cA, owner, { contactId: kAuto.id, subject: S });
    const oRow = await row(idOf(o));
    const r1 = await ingest(inMail({ from: kAuto.email, to: [inA], subject: `ตอบกลับอัตโนมัติ: ${S}`, headers: { "auto-submitted": "auto-replied", "in-reply-to": `<${bare(oRow?.messageId)}>` } }));
    const noreply = `no-reply@${TAG}-bulk.example`;
    const r2 = await ingest(inMail({ from: noreply, to: [inA], headers: { precedence: "bulk" } }));
    await pump([tidA]);
    const en = await enrollment(eAuto);
    const rep = await outboxOf("crm.email.replied", idOf(o));
    const cs = await contactsByEmail(crmA, noreply);
    const shp = ESH.isAutoSubmitted?.({ "auto-submitted": "auto-replied" }, "a@b.example") === true && ESH.isAutoSubmitted?.({}, "mailer-daemon@b.example") === true && ESH.isAutoSubmitted?.({ "auto-submitted": "no" }, "a@b.example") === false;
    chk("C2.5-S3.5", "auto-reply / bulk: Auto-Submitted reply of a contact ⇒ no crm.email.replied, the contact's ACTIVE enrollment stays ACTIVE · no-reply@ + Precedence bulk stranger ⇒ NO lead · isAutoSubmitted truth table",
      o.ok && r1.ok && r2.ok && en?.status === "ACTIVE" && rep.length === 0 && cs.length === 0 && shp,
      "skipped", `send=${rd(o)} r1=${rd(r1)} r2=${rd(r2)} enroll=${en?.status ?? "none"} replied=${rep.length} leads=${cs.length} fn=${shp}`);
  }
  let eUnmatched = NONE;
  {
    const S = subj("ไม่จับคู่");
    const r = await ingest(inMail({ from: mailOf("nobody"), to: [INADDR(KEY[crmA2])], subject: S }));
    eUnmatched = r.v?.emailId ?? NONE;
    const w = await row(eUnmatched);
    const lst = await call(EM.listThreads, { ...cA2, actorUserId: uM.id }, manager, { unmatched: true });
    const listed = r.ok && lst.ok && (lst.v?.items ?? []).some((i: Any) => i?.threadKey === w?.threadKey);
    const at = await call(EM.attachToContact, cA2, owner, eUnmatched, kA2.id);
    const w2 = await row(eUnmatched);
    const acts = await actsOf(eUnmatched);
    chk("C2.5-S3.6", "no match + strangerToLead false ⇒ contactId/companyId null, matchedBy NONE, listed in the manager's \"unmatched\" box · attachToContact ⇒ contactId set, matchedBy MANUAL, ONE activity",
      r.ok && w?.systemId === crmA2 && !w?.contactId && !w?.companyId && w?.matchedBy === "NONE" && listed && at.ok && w2?.contactId === kA2.id && w2?.matchedBy === "MANUAL" && acts.length === 1,
      "unmatched → manual", `${rd(r)} by=${w?.matchedBy} listed=${listed} attach=${rd(at)} by2=${w2?.matchedBy} acts=${acts.length}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — threading (3 layers)
  // ═════════════════════════════════════════════════════════════════════════════
  out("── S4 · threading ──");
  {
    const eSeq = await mkEnroll(tidA, crmA, kSeq.id, "หยุดเมื่อตอบ");
    const S = subj("ใบเสนอราคา");
    const o = await send(cA, owner, { contactId: kSeq.id, subject: S });
    const oRow = await row(idOf(o));
    const m = inMail({ from: kSeq.email, to: [inA], subject: `แพ็กเกจอื่น ${TAG}`, headers: { "in-reply-to": `<${bare(oRow?.messageId)}>`, references: `<${bare(oRow?.messageId)}>` } });
    const r = await ingest(m);
    const r2 = await ingest(m);
    await pump([tidA]);
    const w = await row(r.v?.emailId ?? NONE);
    const o2 = await row(idOf(o));
    const rep = await outboxOf("crm.email.replied");
    const repMine = rep.filter((e) => [idOf(o), r.v?.emailId].includes(e.payload?.emailId));
    const en = await enrollment(eSeq);
    const fin = ((await P.outboxEvent.findMany({ where: { tenantId: tidA, type: "crm.sequence.finished" } })) as Any[]).filter((e) => e.payload?.enrollmentId === eSeq);
    chk("C2.5-S4.1", "layer 1 In-Reply-To/References ⇒ same threadKey (different subject) · the OUT gets repliedAt · ONE crm.email.replied (replay adds none) · the contact's ACTIVE enrollment STOPPED (REPLY) once through sequences.stopFor",
      r.ok && r2.ok && w?.threadKey === oRow?.threadKey && !!o2?.repliedAt && repMine.length === 1 && en?.status === "STOPPED" && /REPLY/i.test(String(en?.stoppedReason ?? "")) && fin.length === 1,
      "joined + stop", `${rd(r)} thread=${w?.threadKey === oRow?.threadKey} replied=${!!o2?.repliedAt} ev=${repMine.length} enroll=${en?.status}/${en?.stoppedReason} fin=${fin.length}`);
  }
  {
    const S = subj("นัดดูสถานที่");
    const o = await send(cA, owner, { contactId: kThr.id, subject: S });
    const m = sentWith(S)[0] ?? {};
    const replyTo = String(m.replyTo ?? hdr(m, "Reply-To") ?? "");
    const oRow = await row(idOf(o));
    const r = await ingest(inMail({ from: kThr.email, to: [replyTo], subject: `เรื่องใหม่เลย ${TAG}` }));
    const w = await row(r.v?.emailId ?? NONE);
    chk("C2.5-S4.2", "layer 2: SHARK Reply-To is `crm+<key>+t<short>@shark.in.th` · a reply to it WITHOUT In-Reply-To and with another subject joins that thread",
      o.ok && new RegExp(`^crm\\+${KEY[crmA]}\\+t[a-z0-9]+@shark\\.in\\.th$`, "i").test(replyTo) && r.ok && w?.threadKey === oRow?.threadKey,
      "+t joins", `replyTo=${replyTo} ${rd(r)} joined=${w?.threadKey === oRow?.threadKey}`);
  }
  {
    const S1 = `ขอใบเสนอราคาทัวร์ ${TAG}`;
    const o1 = await send(cA, owner, { contactId: kThr.id, subject: S1 });
    const o1Row = await row(idOf(o1));
    const r1 = await ingest(inMail({ from: kThr.email, to: [inA], subject: `RE: ตอบ: ${S1}` }));
    const w1 = await row(r1.v?.emailId ?? NONE);
    const S2 = `ตารางเรือ ${TAG}`;
    const o2 = await send(cA, owner, { contactId: kThr.id, subject: S2 });
    const o2Row = await row(idOf(o2));
    await backdate(idOf(o2), 31 * DAY);
    const r2 = await ingest(inMail({ from: kThr.email, to: [inA], subject: `Re: ${S2}` }));
    const w2 = await row(r2.v?.emailId ?? NONE);
    const ns = ESH.normalizeSubject?.("RE: Fwd: ตอบ:  สวัสดี  ครับ") ?? "";
    chk("C2.5-S4.3", "layer 3: normalized subject (RE:/ตอบ: stripped) + same contact within 30 days ⇒ same thread · the same after 31 days ⇒ a NEW thread · normalizeSubject strips RE:/Fwd:/ตอบ: chains",
      r1.ok && w1?.threadKey === o1Row?.threadKey && r2.ok && !!w2?.threadKey && w2?.threadKey !== o2Row?.threadKey && /^สวัสดี ครับ$/i.test(String(ns).trim()),
      "30-day window", `r1=${rd(r1)} joined=${w1?.threadKey === o1Row?.threadKey} r2=${rd(r2)} new=${w2?.threadKey !== o2Row?.threadKey} norm="${ns}"`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 — bounce webhook
  // ═════════════════════════════════════════════════════════════════════════════
  out("── S5 · bounce webhook ──");
  const eSeqB = await mkEnroll(tidA, crmA, kSeqB.id, "หยุดเมื่อเด้ง");
  const SB = subj("จะเด้ง");
  const oB = await send(cA, owner, { contactId: kSeqB.id, subject: SB });
  const eB = idOf(oB);
  const oBRow = await row(eB);
  const bouncePayload = { type: "email.bounced", created_at: new Date().toISOString(), data: { email_id: oBRow?.providerId ?? "none", to: [kSeqB.email], subject: SB, bounce: { type: "Permanent", subType: "General", message: "mailbox does not exist" } } };
  const WH_B_ID = `msg_${TAG}_bounce`;
  {
    const w = await postWh(bouncePayload, { id: WH_B_ID });
    await pump([tidA]);
    const r = await row(eB);
    const ev = await evRows(eB, "BOUNCE");
    const k = await P.crmContact.findFirst({ where: { id: kSeqB.id } });
    const ob = await outboxOf("crm.email.bounced", eB);
    chk("C2.5-S5.1", "signed email.bounced (Permanent) ⇒ 2xx · row BOUNCED · ONE BOUNCE event with providerEventId = svix-id · contact.emailBouncedAt set · ONE crm.email.bounced",
      oB.ok && w.status >= 200 && w.status < 300 && r?.status === "BOUNCED" && ev.length === 1 && ev[0]?.providerEventId === WH_B_ID && !!k?.emailBouncedAt && ob.length === 1,
      "flagged", `send=${rd(oB)} wh=${w.status} ${cut(w.text, 60)} status=${r?.status} ev=${ev.length}/${ev[0]?.providerEventId} bounced=${!!k?.emailBouncedAt} ob=${ob.length}`);
  }
  {
    const en = await enrollment(eSeqB);
    const again = await send(cA, owner, { contactId: kSeqB.id, subject: subj("หลังเด้ง") });
    chk("C2.5-S5.2", "bounce stops the contact's sequence (STOPPED, reason BOUNCE through stopFor) and blocks the next send (EMAIL_BLOCKED)",
      en?.status === "STOPPED" && /BOUNCE/i.test(String(en?.stoppedReason ?? "")) && refused(again, "EMAIL_BLOCKED"), "stopped + blocked", `enroll=${en?.status ?? "none"}/${en?.stoppedReason} again=${rd(again)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S6 — copy modes (mock provider)
  // ═════════════════════════════════════════════════════════════════════════════
  out("── S6 · copy-to ──");
  {
    const COPY = mailOf("copy-shop-a");
    const runMode = async (mode: string) => {
      await setMail(crmA, { copyToAddr: COPY, copyMode: mode });
      const rec: Any[] = [];
      const t = tp(0, (m) => { rec.push(m); });
      const S = subj(`สำเนา ${mode}`);
      const s = await send(cA, owner, { contactId: kOk.id, subject: S }, { transport: t, ...storeDeps });
      const outMsg = rec.find((m) => String(m.subject ?? "").includes(S));
      const outCopy = !!outMsg && [...addrsOf(outMsg.bcc), ...addrsOf(outMsg.cc), ...addrsOf(outMsg.to)].includes(COPY.toLowerCase());
      const n0 = rec.length;
      const i = await ingest(inMail({ from: kOk.email, to: [inA], subject: subj(`ขาเข้า ${mode}`) }), { transport: t, ...storeDeps });
      const inCopies = rec.slice(n0).filter((m) => addrsOf(m.to).includes(COPY.toLowerCase())).length;
      return { ok: s.ok && i.ok, outCopy, inCopies, bccOnly: !!outMsg && addrsOf(outMsg.bcc).includes(COPY.toLowerCase()), err: `${rd(s)}/${rd(i)}` };
    };
    const o = await runMode("OUT");
    chk("C2.5-S6.1", "copyMode OUT ⇒ the outgoing message carries the copy address as BCC · an inbound mail is NOT forwarded", o.ok && o.outCopy && o.bccOnly && o.inCopies === 0, "out only", j(o));
    const i = await runMode("IN");
    chk("C2.5-S6.2", "copyMode IN ⇒ outgoing message has no copy address · an inbound mail is forwarded ONCE to the copy address", i.ok && !i.outCopy && i.inCopies === 1, "in only", j(i));
    const b = await runMode("BOTH");
    chk("C2.5-S6.3", "copyMode BOTH ⇒ BCC on the outgoing message AND one forwarded copy of the inbound mail", b.ok && b.outCopy && b.bccOnly && b.inCopies === 1, "both", j(b));
    await setMail(crmA, { copyToAddr: null, copyMode: "NONE" });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S7 — domain verification (DNS records shape · status polled) — Resend stubbed
  // ═════════════════════════════════════════════════════════════════════════════
  out("── S7 · domain verify ──");
  const NEW_DOMAIN = `${TAG}-new.example`;
  const dAdd = await call(EM.addDomain, cA, owner, { domain: NEW_DOMAIN.toUpperCase() });
  {
    const d = dAdd.v ?? {};
    const recsOk = Array.isArray(d.records) && d.records.length >= 2 && d.records.every((r: Any) => ["TXT", "MX", "CNAME"].includes(String(r?.type)) && typeof r?.name === "string" && typeof r?.value === "string" && r.value.length > 0);
    const ref = await call(EM.refreshDomain, cA, owner, d.id ?? NONE);
    const dbRow = await M("emailDomain").findFirst({ where: { tenantId: tidA, domain: NEW_DOMAIN } });
    const bad = await Promise.all(["https://x.example/a", "shark.in.th", "not a domain"].map((x) => call(EM.addDomain, cA, owner, { domain: x })));
    chk("C2.5-S7.1", "addDomain ⇒ { id, domain (lower-case), status PENDING, records[{type TXT|MX|CNAME, name, value}] ≥ 2, verifiedAt null } stored in EmailDomain · refreshDomain (provider says verified) ⇒ VERIFIED + verifiedAt · scheme/path, shark.in.th, garbage ⇒ VALIDATION (Thai) · no API key in the stored records",
      dAdd.ok && d.domain === NEW_DOMAIN && d.status === "PENDING" && recsOk && !d.verifiedAt && ref.ok && ref.v?.status === "VERIFIED" && !!ref.v?.verifiedAt && dbRow?.status === "VERIFIED" &&
        bad.every((r) => refused(r, "VALIDATION")) && !j(dbRow).includes(String(process.env.RESEND_API_KEY)),
      "PENDING → VERIFIED", `add=${rd(dAdd)} ${cut(j(d), 160)} refresh=${rd(ref)} ${ref.v?.status} db=${dbRow?.status} bad=${bad.map((r) => r.code || "ok").join(",")}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S8 — UI (static; parity vs mockups 08/15 = controller gate D7)
  // ═════════════════════════════════════════════════════════════════════════════
  out("── S8 · UI (static) ──");
  const P_INBOX = `${CRM_PAGES}/emails/page.tsx`;
  const P_THREAD_DIR = `${CRM_PAGES}/emails`;
  const P_SET = `${CRM_PAGES}/settings/email/page.tsx`;
  const withComps = (f: string) => { const d = f.replace(/\/page\.tsx$/, ""); return [read(f), ...walk(join(d, "_components")).map(read)].join("\n"); };
  const uiAll = [...walk(UI_DIR).map(read), ...walk(P_THREAD_DIR).map(read), ...walk(`${CRM_PAGES}/settings/email`).map(read)].join("\n");
  const tidsMissing = (list: string[], src: string) => list.filter((t) => !src.includes(`"${t}"`) && !src.includes(`'${t}'`));
  const guarded = (f: string, key: string) => { const s = read(f); return s.length > 0 && /type:\s*["']CRM["']/.test(s) && /requireCrmV2Page|pickCrmPage/.test(s) && new RegExp(key.replace(/\./g, "\\.")).test(s) && /notFound\(/.test(s); };
  const threadPage = walk(P_THREAD_DIR).find((f) => /emails\/\[[^\]]+\]\/page\.tsx$/.test(f)) ?? "";
  const badClientImport = (s: string) => /from\s+["'](@\/lib\/core\/db|@prisma\/client|@\/lib\/modules\/crm\/(emails|db|contacts|consents)|@\/lib\/modules\/crm)["']/.test(s);
  {
    const miss = tidsMissing(["crm-emails-inbox", "crm-emails-tab-unmatched", "crm-emails-thread-row", "crm-emails-search"], [withComps(P_INBOX), uiAll].join("\n"));
    chk("C2.5-S8.1", "/emails inbox page: type-CRM guard + requireCrmV2Page + crm.email.read + notFound · testids inbox / unmatched tab / thread row / search",
      guarded(P_INBOX, "crm.email.read") && miss.length === 0, "guarded + testids", `guard=${guarded(P_INBOX, "crm.email.read")} missing=${miss.join(",") || "-"}`);
  }
  {
    const src = [threadPage ? withComps(threadPage) : "", uiAll].join("\n");
    const iframe = /<iframe[\s\S]{0,400}sandbox/.test(src);
    const unsafe = /allow-scripts|allow-same-origin/.test(src);
    const miss = tidsMissing(["crm-email-show-images", "crm-email-attachment"], src);
    chk("C2.5-S8.2", "thread page `emails/[threadKey]`: guarded · inbound HTML only inside <iframe sandbox> (no allow-scripts / allow-same-origin) fed by renderInboundHtml via srcDoc · show-images toggle + attachment download links (attachmentUrl) · no dangerouslySetInnerHTML of a body",
      !!threadPage && guarded(threadPage, "crm.email.read") && iframe && !unsafe && /srcDoc/.test(src) && /renderInboundHtml/.test(src) && /attachmentUrl/.test(src + emSrc + read(EMAILS_ACT)) && miss.length === 0 && !/dangerouslySetInnerHTML=\{\{\s*__html:\s*[^}]*body/i.test(src),
      "sandboxed", `page=${threadPage || "-"} iframe=${iframe} unsafe=${unsafe} srcDoc=${/srcDoc/.test(src)} render=${/renderInboundHtml/.test(src)} missing=${miss.join(",") || "-"}`);
  }
  {
    const comp = walk(UI_DIR).map(read).join("\n");
    const act = read(EMAILS_ACT);
    const clientFiles = walk(UI_DIR).filter((f) => /^\s*["']use client["']/.test(read(f)));
    const bad = clientFiles.filter((f) => badClientImport(read(f)));
    const miss = tidsMissing(["crm-email-composer", "crm-email-to", "crm-email-subject", "crm-email-body", "crm-email-template", "crm-email-attach", "crm-email-schedule", "crm-email-send"], comp);
    const badExports = /export\s+(type|interface|const|let|class|function\s)/.test(act);
    chk("C2.5-S8.3", "composer under src/components/crm/emails ('use client', no prisma-side import) with the 8 composer testids · emails-actions.ts is \"use server\", async exports only, assertCrmV2 + a crm key check",
      comp.length > 0 && clientFiles.length > 0 && bad.length === 0 && miss.length === 0 && /^\s*["']use server["']/.test(act) && !badExports && /assertCrmV2/.test(act) && /assertCanCrm|crmCan/.test(act),
      "client + actions", `files=${walk(UI_DIR).length} client=${clientFiles.length} badImport=${bad.join(",") || "-"} missing=${miss.join(",") || "-"} actions=${act.length > 0} badExports=${badExports}`);
  }
  {
    const miss = tidsMissing(["crm-email-settings", "crm-email-inbound-address", "crm-email-rotate-key", "crm-email-from-mode", "crm-email-replyto-mode", "crm-email-copy-to",
      "crm-email-copy-mode", "crm-email-bcc-capture", "crm-email-stranger-lead", "crm-email-track-opens", "crm-email-track-clicks", "crm-email-user-overrides",
      "crm-email-domain-add", "crm-email-domain-records", "crm-email-test-send"], [withComps(P_SET), uiAll].join("\n"));
    chk("C2.5-S8.4", "/settings/email (mockup 15): guarded by crm.email.settings · the 15 settings testids (inbound address + rotate · from · reply-to · copy · BCC · stranger→lead · tracking · per-user overrides · domain + DNS records · test send)",
      guarded(P_SET, "crm.email.settings") && miss.length === 0, "guarded + testids", `guard=${guarded(P_SET, "crm.email.settings")} missing=${miss.join(",") || "-"}`);
  }
  {
    const nav = read(NAV);
    let inv: Any[] = [];
    try { const raw = JSON.parse(read(INVENTORY) || "[]"); inv = Array.isArray(raw?.rows) ? raw.rows : []; } catch { inv = []; }
    const lits = [...new Set([...uiAll.matchAll(/data-testid=["']([a-z0-9-]+)["']/g), ...withComps(P_INBOX).matchAll(/data-testid=["']([a-z0-9-]+)["']/g), ...withComps(P_SET).matchAll(/data-testid=["']([a-z0-9-]+)["']/g), ...read(ROUTES.unsubPage).matchAll(/data-testid=["']([a-z0-9-]+)["']/g)].map((m) => m[1]))];
    const noRow = lits.filter((t) => !inv.some((r: Any) => (r?.testid ?? r?.testId ?? r?.id) === t && String(r?.wo ?? "") === "C2.5"));
    const unsub = read(ROUTES.unsubPage);
    chk("C2.5-S8.5", "nav: /crm/emails in CRM_NAV (ready, C2.5) + /crm/settings/email in CRM_DEEP_NAV · every literal testid has an inventory row (wo C2.5) · /u/[token] page shows a confirm button (crm-unsub-confirm) through a form/server action — GET never unsubscribes",
      /path:\s*["']\/crm\/emails["']/.test(nav) && /path:\s*["']\/crm\/settings\/email["']/.test(nav) && lits.length > 0 && noRow.length === 0 && /crm-unsub-confirm/.test(unsub) && /<form|action=|"use server"/.test(unsub + read(EMAILS_ACT)),
      "nav + inventory", `nav=${/\/crm\/emails["']/.test(nav)}/${/\/crm\/settings\/email["']/.test(nav)} testids=${lits.length} noRow=${cut(noRow.join(","), 120) || "-"} unsub=${/crm-unsub-confirm/.test(unsub)}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S9 — brief extras: core transport · templates · settings · rotate · test send · R-E.5 wiring · purge · sanitizer baseline
  // ═════════════════════════════════════════════════════════════════════════════
  out("── S9 · brief extras ──");
  {
    const src = read(CORE_EMAIL);
    const i = src.indexOf("export async function sendEmail(");
    const blk = i >= 0 ? src.slice(i, src.indexOf("\n}\n", i) + 2) : "";
    const before = resendCalls().length;
    const TO = mailOf("otp");
    const r = await call(CORE.sendEmail, TO, `รหัส OTP ${TAG}`, "รหัสของคุณคือ 123456");
    const c = resendCalls().slice(before);
    let b: Any = {};
    try { b = JSON.parse(c[0]?.body ?? "{}"); } catch { /* */ }
    chk("C2.5-S9.1", "core sendEmail(to, subject, text) is byte-identical (sha256 of the function block pinned) and still posts exactly { from, to (string), subject, text } — every existing caller (OTP · kanban · member · forms) unchanged",
      sha(blk) === SHA_CORE_SENDEMAIL_FN && r.ok && r.v === undefined && c.length === 1 && Object.keys(b).sort().join(",") === "from,subject,text,to" && b.to === TO,
      "unchanged", `sha=${sha(blk).slice(0, 12)} call=${rd(r)} posts=${c.length} keys=${Object.keys(b).sort().join(",")}`);
  }
  {
    const TO = mailOf("rich-to"), CC = mailOf("rich-cc"), BCC = mailOf("rich-bcc"), RT = mailOf("rich-rt");
    const before = resendCalls().length;
    const msg = { from: `sales@${VER_DOMAIN}`, fromName: "ร้านทดสอบ", replyTo: RT, to: [TO], cc: [CC], bcc: [BCC], subject: `ริช ${TAG}`, html: "<p>สวัสดี</p>", text: "สวัสดี",
      headers: { "X-QC": TAG }, attachments: [{ filename: "a.pdf", content: new Uint8Array([1, 2, 3, 4]), contentType: "application/pdf" }] };
    const r = await call(CORE.sendEmailRich, msg);
    const c = resendCalls().slice(before);
    let b: Any = {};
    try { b = JSON.parse(c[0]?.body ?? "{}"); } catch { /* */ }
    const own: string[] = [];
    const r2 = await call(CORE.sendEmailRich, msg, { fetch: (async (u: Any) => { own.push(String(u)); return jsonRes({ id: "re_own" }); }) as typeof fetch });
    const c2 = resendCalls().length - before - c.length;
    resendFail = true;
    const t0 = new Date();
    const r3 = await call(CORE.sendEmailRich, { ...msg, to: [mailOf("rich-fail")] });
    resendFail = false;
    const ops = (await P.opsEvent.findMany({ where: { createdAt: { gte: t0 } } })) as Any[];
    const opsLeak = ops.filter((o) => j(o).includes("rich-fail"));
    // the forced provider failure may log a tenant-less OpsEvent — ours only (window + e-mail source), removed in finally
    for (const o of ops) if (/email/i.test(String(o.source ?? "")) && !o.tenantId) OPS_IDS.push(String(o.id));
    chk("C2.5-S9.2", "sendEmailRich → Resend body { from \"Name <addr>\", to[], cc, bcc, reply_to, subject, html, text, headers, attachments[{filename, content base64}] } and returns providerId · deps.fetch replaces fetch · provider 500 ⇒ { ok:false } without throwing and no OpsEvent carries the recipient",
      r.ok && r.v?.ok === true && String(r.v?.providerId ?? "").startsWith(`re_qc_${TAG}_`) && c.length === 1 &&
        String(b.from).includes(`sales@${VER_DOMAIN}`) && String(b.from).includes("ร้านทดสอบ") && addrsOf(b.to).includes(TO) && addrsOf(b.cc).includes(CC) && addrsOf(b.bcc).includes(BCC) &&
        addrsOf(b.reply_to).includes(RT) && b.headers?.["X-QC"] === TAG && b.attachments?.[0]?.filename === "a.pdf" && b.attachments?.[0]?.content === Buffer.from([1, 2, 3, 4]).toString("base64") &&
        r2.ok && r2.v?.providerId === "re_own" && own.length === 1 && c2 === 0 && r3.ok && r3.v?.ok === false && opsLeak.length === 0,
      "mapped", `r=${rd(r)} ${j(r.v)} posts=${c.length} from=${cut(b.from, 50)} rt=${j(b.reply_to)} att=${cut(j(b.attachments), 60)} own=${own.length}/${c2} fail=${rd(r3)} ${j(r3.v)} opsLeak=${opsLeak.length}`);
  }
  let tplA = NONE;
  {
    const t1 = await call(EM.saveTemplate, cA, owner, { name: `ติดตาม ${TAG}`, subject: "ติดตามคุณ {{contact.firstName}}", bodyHtml: `<p>เรียน {{contact.firstName}}</p><script>alert(1)</script><p onclick="x()">{{note}}</p>`, category: "FOLLOW_UP" });
    tplA = t1.v?.id ?? NONE;
    const trow = await M("crmEmailTemplate").findFirst({ where: { id: tplA } });
    const dup = await call(EM.saveTemplate, cA, owner, { name: `ติดตาม ${TAG}`, subject: "x", bodyHtml: "<p>x</p>" });
    const S0 = SENT.length;
    const s = await send(cA, owner, { contactId: kOk.id, subject: undefined, bodyHtml: undefined, templateId: tplA, vars: { note: `<img src=x onerror=alert(9)>${TAG}` } });
    const m = SENT.slice(S0)[0] ?? {};
    const other = await send(cA2, owner, { contactId: kA2.id, subject: undefined, bodyHtml: undefined, templateId: tplA });
    chk("C2.5-S9.3", "templates: saveTemplate stores a sanitized body (no <script>/on*) · duplicate name in the system ⇒ CONFLICT · sendEmail(templateId, vars) renders {{…}} with HTML-escaped values (no live onerror) · a template of another system ⇒ NOT_FOUND",
      t1.ok && !!trow && !/<script|onclick/i.test(String(trow?.bodyHtml)) && refused(dup, "CONFLICT") && s.ok && String(m.html ?? "").includes(TAG) && !/<img[^>]*onerror/i.test(String(m.html ?? "")) &&
        String(m.subject ?? "").includes("ติดตามคุณ") && !String(m.subject ?? "").includes("{{") && refused(other, "NOT_FOUND"),
      "sanitized + escaped", `save=${rd(t1)} clean=${!/<script|onclick/i.test(String(trow?.bodyHtml))} dup=${rd(dup)} send=${rd(s)} live=${/<img[^>]*onerror/i.test(String(m.html ?? ""))} subj=${cut(m.subject, 40)} other=${rd(other)}`);
  }
  {
    const g = await call(EM.getEmailSettings, cA2, owner);
    const bad = await Promise.all([{ replyToMode: "WHATEVER" }, { copyToAddr: "not-an-address" }, { fromName: "ร้าน\r\nBcc: x@evil.example" }, { retentionDays: 5 }].map((p) => call(EM.setEmailSettings, cA2, owner, p)));
    const s = await call(EM.setEmailSettings, cA2, owner, { trackClicks: false, fromName: `ร้าน ${TAG}` });
    const after = await crmSettings(crmA2);
    const staffOwn = await call(EM.setUserSetting, cAs, staff, { fromName: `ของฉัน ${TAG}`, copyMode: "OUT", copyToAddr: mailOf("mine") });
    const staffOther = await call(EM.setUserSetting, cAs, staff, { userId: uM.id, fromName: "แอบแก้" });
    const ownerOther = await call(EM.setUserSetting, cA, owner, { userId: uM.id, fromName: `ผู้จัดการ ${TAG}` });
    const staffSettings = await call(EM.getEmailSettings, cAs, staff);
    chk("C2.5-S9.4", "settings: getEmailSettings = defaults + inboundAddress `crm+<key>@shark.in.th` · bad mode / address / CR-LF / retention<30 ⇒ VALIDATION · a valid patch keeps every other settings.crm key (single-statement write) · staff edits OWN override, not another user's (owner can) · staff without crm.email.settings cannot read shop settings",
      g.ok && g.v?.trackOpens === true && String(g.v?.inboundAddress ?? "").toLowerCase() === INADDR(KEY[crmA2]) && bad.every((r) => refused(r, "VALIDATION")) &&
        s.ok && after?.email?.trackClicks === false && after?.qcMarker === TAG && after?.uiVersion === 2 && after?.email?.inboundKey === KEY[crmA2] &&
        staffOwn.ok && refused(staffOther, ["FORBIDDEN", "NOT_FOUND"]) && ownerOther.ok && refused(staffSettings, ["FORBIDDEN", "NOT_FOUND"]),
      "validated + scoped", `get=${rd(g)} addr=${g.v?.inboundAddress} bad=${bad.map((r) => r.code || "ok").join(",")} set=${rd(s)} kept=${after?.qcMarker === TAG}/${after?.uiVersion} own=${rd(staffOwn)} other=${rd(staffOther)} owner=${rd(ownerOther)} staffGet=${rd(staffSettings)}`);
  }
  {
    const oldKey = KEY[crmA2];
    const noConfirm = await call(EM.rotateInboundKey, cA2, owner, { reason: "หลุดไปในอีเมลขยะ" });
    const staffTry = await call(EM.rotateInboundKey, { ...cA2, actorUserId: uS.id }, staff, { confirm: true, reason: "หลุดไปในอีเมลขยะ" });
    const r = await call(EM.rotateInboundKey, cA2, owner, { confirm: true, reason: "หลุดไปในอีเมลขยะ" });
    const nk = String(r.v?.key ?? "");
    const toOld = await ingest(inMail({ from: kA2.email, to: [INADDR(oldKey)], subject: subj("ถึงกุญแจเก่า") }));
    const toNew = await ingest(inMail({ from: kA2.email, to: [INADDR(nk)], subject: subj("ถึงกุญแจใหม่") }));
    const audit = await P.auditLog.count({ where: { tenantId: tidA, action: "crm.email.rotate_key" } });
    if (/^[a-z2-7]{8}$/.test(nk)) KEY[crmA2] = nk;
    chk("C2.5-S9.5", "rotateInboundKey: DANGER — no confirm ⇒ CONFIRM_REQUIRED · staff ⇒ FORBIDDEN · owner ⇒ new 8-char [a-z2-7] key ≠ old + address · mail to the OLD address is no longer stored (handled false) · the new one is · audit crm.email.rotate_key",
      refused(noConfirm, "CONFIRM_REQUIRED") && refused(staffTry, ["FORBIDDEN", "NOT_FOUND"]) && r.ok && /^[a-z2-7]{8}$/.test(nk) && nk !== oldKey && String(r.v?.address ?? "").toLowerCase() === INADDR(nk) &&
        toOld.ok && toOld.v?.handled === false && !toOld.v?.emailId && toNew.ok && toNew.v?.handled === true && !!toNew.v?.emailId && audit === 1,
      "rotated", `noConfirm=${rd(noConfirm)} staff=${rd(staffTry)} rotate=${rd(r)} key=${nk} old=${j(toOld.v)} new=${toNew.v?.handled} audit=${audit}`);
  }
  {
    const n0 = SENT.length;
    const rows0 = await M("crmEmailMessage").count({ where: { tenantId: tidA } });
    const r = await call(EM.sendTest, cA, owner, { transport: tp() });
    const got = SENT.slice(n0);
    const rows1 = await M("crmEmailMessage").count({ where: { tenantId: tidA } });
    chk("C2.5-S9.6", "sendTest ⇒ ONE message to the actor's own e-mail through resolveRouting (from = routing.fromAddr), no pixel, no CrmEmailMessage row · staff without crm.email.settings refused",
      r.ok && got.length === 1 && addrsOf(got[0]?.to).includes(uA.email.toLowerCase()) && String(got[0]?.from ?? "").toLowerCase().includes(`${tA.slug}@shark.in.th`.toLowerCase()) && !/\/t\/o\//.test(String(got[0]?.html ?? "")) && rows1 === rows0 &&
        refused(await call(EM.sendTest, cAs, staff, { transport: tp() }), ["FORBIDDEN", "NOT_FOUND"]),
      "self only", `${rd(r)} sent=${got.length} to=${j(got[0]?.to)} from=${got[0]?.from} rows ${rows0}→${rows1}`);
  }
  {
    const kW = await consenting(tidA, crmA, "sequence-ส่งจริง");
    let stepId = NONE;
    const made = await opt(async () => {
      const s = await P.crmSequence.create({ data: { tenantId: tidA, systemId: crmA, name: `ส่งจริง ${TAG}`, businessDaysOnly: false } });
      const st = await P.crmSequenceStep.create({ data: { tenantId: tidA, sequenceId: s.id, version: 1, index: 0, kind: "EMAIL", subject: `สวัสดี {{contact.firstName}} ${TAG}-seq`, body: `ขอบคุณค่ะ ${BODY_MARK}` } });
      stepId = st.id;
      return P.crmSequenceEnrollment.create({ data: { tenantId: tidA, sequenceId: s.id, contactId: kW.id, enrolledBy: "API", sequenceVersion: 1, stepIndex: 0, nextAt: new Date(Date.now() - 60_000), status: "ACTIVE" } });
    });
    const before = resendCalls().length;
    const r = await call(SEQ.runDue, new Date(), { tenantIds: [tidA] });
    const rows = (await M("crmEmailMessage").findMany({ where: { contactId: kW.id, direction: "OUT" } })) as Any[];
    chk("C2.5-S9.7", "R-E.5: the C2.2 EMAIL step with NO injected sender now goes through emails.sendAsSystem ⇒ ONE CrmEmailMessage OUT (sequenceStepId = the step, status SENT) and ONE Resend request (stubbed) — the pre-C2.5 placeholder is gone",
      !!made && r.ok && rows.length === 1 && rows[0]?.sequenceStepId === stepId && rows[0]?.status === "SENT" && resendCalls().length - before === 1,
      "wired", `fixture=${!!made} run=${rd(r)} rows=${rows.length} step=${rows[0]?.sequenceStepId === stepId} status=${rows[0]?.status} resend=${resendCalls().length - before}`);
  }
  {
    const auto = read("src/lib/modules/crm/automation.ts");
    chk("C2.5-S9.8", "R-E.5: CRM rules SEND_EMAIL default transport = emails.sendAsSystem — the C2.1 placeholder reason \"ส่งอีเมลจากกฎยังไม่เปิด\" is gone from crm/automation.ts [static]",
      auto.length > 0 && !auto.includes("ส่งอีเมลจากกฎยังไม่เปิด") && /sendAsSystem/.test(auto), "wired", `exists=${auto.length > 0} placeholder=${auto.includes("ส่งอีเมลจากกฎยังไม่เปิด")} uses=${/sendAsSystem/.test(auto)}`, "MAJOR");
  }
  {
    await setMail(crmA, { retentionDays: 30 });
    const att = { filename: "สัญญา.pdf", content_type: "application/pdf", contentType: "application/pdf", content: Buffer.from(new Uint8Array(900).fill(5)).toString("base64") };
    const old = await ingest(inMail({ from: kOk.email, to: [inA], subject: subj("เก่า"), attachments: [att] }));
    const fresh = await ingest(inMail({ from: kOk.email, to: [inA], subject: subj("ใหม่") }));
    const oldId = old.v?.emailId ?? NONE;
    const oRow0 = await row(oldId);
    const fileIds = ((oRow0?.attachments ?? []) as Any[]).map((a) => a?.fileId).filter(Boolean);
    await backdate(oldId, 40 * DAY);
    const d0 = DELS.length;
    const r = await call(EM.purgeBodies, new Date(), { tenantIds: [tidA], deps: { del: storeDeps.del } });
    const o1 = await row(oldId);
    const f1 = await row(fresh.v?.emailId ?? NONE);
    const filesLeft = fileIds.length ? await P.fileAsset.count({ where: { id: { in: fileIds } } }) : -1;
    await setMail(crmA, { retentionDays: 730 });
    chk("C2.5-S9.9", "retention purge: a message older than retentionDays ⇒ bodyHtml/bodyText/snippet null, attachment FileAssets deleted (storage del called), purgedAt set, subject + addresses kept · a recent message untouched",
      r.ok && fileIds.length === 1 && o1?.bodyHtml == null && o1?.bodyText == null && o1?.snippet == null && !!o1?.purgedAt && !!o1?.subject && addrsOf(o1?.toAddrs).length > 0 &&
        filesLeft === 0 && DELS.length > d0 && String(f1?.bodyHtml ?? f1?.bodyText ?? "").includes(BODY_MARK) && !f1?.purgedAt,
      "purged", `run=${rd(r)} files=${fileIds.length}→${filesLeft} body=${o1?.bodyHtml == null}/${o1?.bodyText == null} purgedAt=${!!o1?.purgedAt} subject=${!!o1?.subject} dels=${DELS.length - d0} fresh=${!f1?.purgedAt}`);
  }
  {
    const outs = SAN_FIXTURES.map((f) => (typeof SAN.sanitizeHtml === "function" ? SAN.sanitizeHtml(f) : null));
    chk("C2.5-S9.10", "core sanitizeHtml with DEFAULT options returns the pre-C2.5 output byte for byte on 3 hostile fixtures (member policy page · other callers unchanged) — image support, if added for e-mail, is opt-in",
      outs.every((o, i) => o === SAN_BASELINE[i]), "baseline", outs.map((o, i) => (o === SAN_BASELINE[i] ? "=" : `≠ ${cut(o, 60)}`)).join(" | "));
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // U — PERMANENT RULE: uiVersion 1 (CRM-RUN §4 C1.7) — nothing new runs · public links already sent keep working · v1 surfaces unchanged
  // ═════════════════════════════════════════════════════════════════════════════
  out("── U · uiVersion 1 ──");
  {
    const SV1 = subj("ก่อนปิด v2");
    const e1 = await send(cV, owner, { contactId: kV.id, subject: SV1 });
    const m1 = sentWith(SV1)[0] ?? {};
    const vClick = clickToks(m1.html)[0]?.tok ?? "";
    const vUnsub = unsubTok(m1.html);
    TOKENS.push(vClick, vUnsub, pixTok(m1.html));
    const SV2 = subj("ตั้งเวลา v1");
    const e2 = await send(cV, owner, { contactId: kV2.id, subject: SV2, scheduledAt: new Date(Date.now() + 2 * 60_000).toISOString() });
    const e2id = idOf(e2);
    await setCrm(crmV, { uiVersion: 1 });
    const rowsV0 = await M("crmEmailMessage").count({ where: { tenantId: tidV } });
    const u1 = [
      await send(cV, owner, { contactId: kV.id, subject: subj("v1 ส่ง") }),
      await call(EM.listThreads, cV, owner, {}),
      await call(EM.getThread, cV, owner, (await row(idOf(e1)))?.threadKey ?? NONE),
      await call(EM.setEmailSettings, cV, owner, { trackClicks: false }),
      await call(EM.resolveRouting, cV, owner),
    ];
    const rowsV1 = await M("crmEmailMessage").count({ where: { tenantId: tidV } });
    const setAfter = await crmSettings(crmV);
    chk("C2.5-U.1", "uiVersion 1: sendEmail · listThreads · getThread · setEmailSettings · resolveRouting ⇒ CrmV2DisabledError (CRM_V2_DISABLED_MSG) with nothing written or sent",
      e1.ok && u1.every((r) => isV1Refusal(r, V1MSG)) && rowsV1 === rowsV0 && setAfter?.email?.trackClicks !== false,
      "refused", `${u1.map(rd).map((x) => cut(x, 40)).join(" | ")} rows ${rowsV0}→${rowsV1}`);
    const vMail = inMail({ from: kV.email, to: [INADDR(KEY[crmV])], subject: subj("ขาเข้า v1") });
    const in1 = await ingest(vMail);
    const inRows1 = await rowsByMid(vMail.messageId);
    const run1 = await call(EM.runScheduled, new Date(Date.now() + 3 * 60_000), { tenantIds: [tidV], deps: deps() });
    const q1 = await row(e2id);
    chk("C2.5-U.2", "uiVersion 1: inbound to that system's crm+ address ⇒ handled:false, NOTHING stored (PROPOSED ruling 6) · its QUEUED scheduled e-mail is left untouched by runScheduled (QUEUED, no lease, not sent)",
      in1.ok && in1.v?.handled === false && inRows1.length === 0 && run1.ok && q1?.status === "QUEUED" && !q1?.leaseUntil && sentWith(SV2).length === 0,
      "skipped", `in=${j(in1.v)} rows=${inRows1.length} run=${rd(run1)} q=${q1?.status}/${q1?.leaseUntil ? "lease" : "-"} sent=${sentWith(SV2).length}`);
    const c = await getC(vClick);
    const u = await postU(vUnsub);
    const kv = await P.crmContact.findFirst({ where: { id: kV.id } });
    chk("C2.5-U.3", "uiVersion 1: links inside e-mails ALREADY SENT keep working — /t/c ⇒ 302 to the stored URL · one-click unsubscribe ⇒ emailOptOut true (a legal opt-out never depends on the UI switch — PROPOSED ruling 7)",
      c.status === 302 && c.loc === "https://shop.example/offer?id=7" && u.status >= 200 && u.status < 300 && kv?.emailOptOut === true,
      "still works", `click=${c.status} ${cut(c.loc, 60)} unsub=${u.status} optOut=${kv?.emailOptOut}`);
    await setCrm(crmV, { uiVersion: 2 });
    const in2 = await ingest(vMail);
    const inRows2 = await rowsByMid(vMail.messageId);
    const run2 = await call(EM.runScheduled, new Date(Date.now() + 3 * 60_000), { tenantIds: [tidV], deps: deps() });
    const q2 = await row(e2id);
    chk("C2.5-U.4", "[positive control for U.1–U.2] the same system back on 2: the SAME inbound mail is now stored (one row) and the kept scheduled e-mail is sent exactly once",
      in2.ok && inRows2.length === 1 && run2.ok && q2?.status === "SENT" && sentWith(SV2).length === 1, "resumed", `in=${j(in2.v)} rows=${inRows2.length} q=${q2?.status} sent=${sentWith(SV2).length}`);
  }
  {
    const pix = await viaRoute(R_M.GET, new Request(`http://localhost/api/m/track/o/${TAG}-nope.abc.gif`), { token: `${TAG}-nope.abc.gif` });
    const bm = mid();
    const board = await postIn({ message_id: bm, from: kOk.email, to: [`tasks+${key8()}@shark.in.th`], subject: subj("ถึงบอร์ด"), text: "งาน" });
    const bRows = await rowsByMid(bm);
    let bj: Any = {};
    try { bj = JSON.parse(board.text); } catch { /* */ }
    const v1Hits = ["src/lib/modules/crm/ui.tsx", "src/lib/modules/crm/actions.ts", "src/lib/modules/marketing/index.ts"].filter((f) => /crm\/emails|sendEmailRich|emails-shared/.test(read(f)));
    chk("C2.5-U.5", "v1 surfaces unchanged: member campaign pixel route byte-identical (sha pinned) and still answers a gif · kanban-email-in.ts byte-identical · a board-addressed mail through the route keeps the board answer shape { ok, created } and creates no CrmEmailMessage · v1 CRM files / marketing do not reach the new engine",
      sha(read(MEMBER_PIXEL)) === SHA_MEMBER_PIXEL && pix.status === 200 && /image\/gif/.test(pix.ct) && sha(read(BOARD_IN)) === SHA_BOARD_IN && board.status === 200 && "created" in bj && bRows.length === 0 && v1Hits.length === 0,
      "untouched", `pixelSha=${sha(read(MEMBER_PIXEL)).slice(0, 12)} pixel=${pix.status} boardSha=${sha(read(BOARD_IN)).slice(0, 12)} board=${board.status} ${cut(board.text, 60)} rows=${bRows.length} v1Hits=${v1Hits.join(",") || "-"}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X1 — scope · X2 — keys
  // ═════════════════════════════════════════════════════════════════════════════
  out("── X1 · scope ──");
  const threadOf = async (r: Res) => (await row(idOf(r)))?.threadKey ?? NONE;
  const oHidden = await send(cA, owner, { contactId: kHidden.id, subject: subj("ลับของผู้จัดการ") });
  const oStaff = await send(cA, owner, { contactId: kStaff.id, subject: subj("ของพนักงาน") });
  const thHidden = await threadOf(oHidden);
  const thStaff = await threadOf(oStaff);
  const thMain = rowMain?.threadKey ?? NONE;
  {
    const g1 = await call(EM.getThread, cAs, staff, thHidden);
    const g2 = await call(EM.getThread, cAs, staff, thStaff);
    const l = await call(EM.listThreads, cAs, staff, {});
    const keys = ((l.v?.items ?? []) as Any[]).map((i) => i?.threadKey);
    const s = await send(cAs, staff, { contactId: kHidden.id, subject: subj("แอบส่ง") });
    const noKey = await call(EM.listThreads, { ...cA, actorUserId: uR.id }, noEmail, { contactId: kOk.id });
    chk("C2.5-X1.1", "visibility: staff getThread of a contact they cannot see ⇒ NOT_FOUND (own contact's thread OK) · listThreads lists own, never the hidden one · sendEmail to the hidden contact ⇒ NOT_FOUND · a user without crm.email.read ⇒ FORBIDDEN|NOT_FOUND",
      refused(g1, "NOT_FOUND") && g2.ok && (g2.v?.messages ?? []).length >= 1 && l.ok && keys.includes(thStaff) && !keys.includes(thHidden) && refused(s, "NOT_FOUND") && refused(noKey, ["FORBIDDEN", "NOT_FOUND"]),
      "404 not 403", `hidden=${rd(g1)} own=${rd(g2)} list=${keys.includes(thStaff)}/${keys.includes(thHidden)} send=${rd(s)} noKey=${rd(noKey)}`);
  }
  {
    const un2 = await ingest(inMail({ from: mailOf("nobody-2"), to: [INADDR(KEY[crmA2])] }));
    const a = await call(EM.getThread, cB, owner, thMain);
    const b = await call(EM.getThread, cA2, owner, thMain);
    const c = await send(cA, owner, { contactId: kB.id, subject: subj("ข้ามร้าน") });
    const d = await call(EM.attachToContact, cA2, owner, un2.v?.emailId ?? NONE, kOk.id);
    const e = await call(EM.attachToContact, cB, owner, un2.v?.emailId ?? NONE, kB.id);
    const echo = [a, b, c, d, e].some((r) => [kB.email, kOk.email, kOk.name].some((x) => r.msg.includes(x)));
    chk("C2.5-X1.2", "cross tenant / cross system: getThread from tenant B or CRM system 2 ⇒ NOT_FOUND · sendEmail with another tenant's contact ⇒ NOT_FOUND · attachToContact to a contact of another system, or on an e-mail of another tenant ⇒ NOT_FOUND · no foreign data echoed",
      [a, b, c, d, e].every((r) => refused(r, "NOT_FOUND")) && !echo, "isolated", `${[a, b, c, d, e].map(rd).map((x) => cut(x, 30)).join(" | ")} echo=${echo}`);
  }
  {
    const w = await row(eUnmatched === NONE ? NONE : eUnmatched);
    const un3 = await ingest(inMail({ from: mailOf("nobody-3"), to: [INADDR(KEY[crmA2])] }));
    const w3 = await row(un3.v?.emailId ?? NONE);
    const sList = await call(EM.listThreads, { ...cA2, actorUserId: uS.id }, staff, { unmatched: true });
    const sGet = await call(EM.getThread, { ...cA2, actorUserId: uS.id }, staff, w3?.threadKey ?? NONE);
    const mList = await call(EM.listThreads, { ...cA2, actorUserId: uM.id }, manager, { unmatched: true });
    chk("C2.5-X1.3", "\"unmatched\" box: staff (crm.email.read, TEAM visibility) ⇒ refused on the list AND on getThread of an unmatched thread · manager ⇒ sees it",
      !!w && refused(sList, ["FORBIDDEN", "NOT_FOUND"]) && refused(sGet, "NOT_FOUND") && mList.ok && ((mList.v?.items ?? []) as Any[]).some((i) => i?.threadKey === w3?.threadKey),
      "manager+ only", `staffList=${rd(sList)} staffGet=${rd(sGet)} mgr=${rd(mList)}`);
  }
  {
    const ob = await send(cB, owner, { contactId: kB.id, subject: subj("ของร้าน B") });
    const obRow = await row(idOf(ob));
    const r = await ingest(inMail({ from: kOk.email, to: [inA], subject: subj("แอบต่อเธรด"), headers: { "in-reply-to": `<${bare(obRow?.messageId)}>` } }));
    const w = await row(r.v?.emailId ?? NONE);
    const ob2 = await row(idOf(ob));
    chk("C2.5-X1.4", "threading never crosses tenants: In-Reply-To = a Message-ID of tenant B, delivered to tenant A ⇒ stored in A with a thread of A · B's message gets no repliedAt",
      ob.ok && r.ok && w?.systemId === crmA && w?.threadKey !== obRow?.threadKey && !ob2?.repliedAt, "own thread", `${rd(r)} sys=${w?.systemId === crmA} sameThread=${w?.threadKey === obRow?.threadKey} replied=${!!ob2?.repliedAt}`);
  }
  {
    const a = await call(EM.refreshDomain, cA, owner, domB?.id ?? NONE);
    const l = await call(EM.listDomains, cA, owner);
    const staffAdd = await call(EM.addDomain, cAs, staff, { domain: `${TAG}-staff.example` });
    chk("C2.5-X1.5", "domains: another tenant's EmailDomain id ⇒ NOT_FOUND · listDomains shows only this tenant's · staff without crm.email.settings cannot add",
      refused(a, "NOT_FOUND") && l.ok && !j(l.v).includes(`${TAG}-b.example`) && j(l.v).includes(VER_DOMAIN) && refused(staffAdd, ["FORBIDDEN", "NOT_FOUND"]),
      "tenant-scoped", `refresh=${rd(a)} list=${rd(l)} leak=${j(l.v).includes(`${TAG}-b.example`)} staff=${rd(staffAdd)}`);
  }
  out("── X2 · API-key-shaped actors ──");
  {
    const n = await call(EM.listThreads, cA, apiNone, { contactId: kOk.id });
    const ns = await send(cA, apiNone, { contactId: kOk.id, subject: subj("คีย์ไม่มีสิทธิ์") });
    const y = await call(EM.listThreads, cA, apiRead, { contactId: kOk.id });
    const ys = await send(cA, apiRead, { contactId: kOk.id, subject: subj("คีย์อ่านอย่างเดียว") });
    chk("C2.5-X2.1", "API-key actors: a key without crm.email.* scope ⇒ refused on listThreads and sendEmail · a key with only crm.email.read lists (positive control) but cannot send (no implicit send)",
      refused(n, ["FORBIDDEN", "NOT_FOUND"]) && refused(ns, ["FORBIDDEN", "NOT_FOUND"]) && y.ok && refused(ys, ["FORBIDDEN", "NOT_FOUND"]),
      "scoped", `none=${rd(n)}/${rd(ns)} read=${rd(y)}/${rd(ys)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X3 — concurrency (separate connections via parallel calls)
  // ═════════════════════════════════════════════════════════════════════════════
  out("── X3 · concurrency ──");
  {
    const S = subj("กดส่งรัว");
    const IK = `${TAG}-idem-1`;
    const slow = tp(150);
    const rs = await Promise.all(Array.from({ length: 10 }, () => send(cA, owner, { contactId: kOk.id, subject: S, idempotencyKey: IK }, { transport: slow, ...storeDeps })));
    const rows = await M("crmEmailMessage").count({ where: { tenantId: tidA, subject: S } });
    const ids = new Set(rs.filter((r) => r.ok).map((r) => r.v?.emailId));
    chk("C2.5-X3.1", "10 parallel sendEmail with the same idempotencyKey ⇒ ONE row, ONE transport call · every call answers ok with that emailId (or CONFLICT, Thai) — never a 500",
      rows === 1 && sentWith(S).length === 1 && ids.size === 1 && rs.every((r) => r.ok || refused(r, "CONFLICT")), "one", `rows=${rows} sends=${sentWith(S).length} ids=${ids.size} res=${[...new Set(rs.map((r) => (r.ok ? "ok" : r.code)))].join(",")}`);
  }
  {
    const S = subj("เปิดพร้อมกัน");
    const r = await send(cA, owner, { contactId: kOk.id, subject: S });
    const t = pixTok(sentWith(S)[0]?.html ?? "");
    TOKENS.push(t);
    await backdate(idOf(r), 60_000);
    const res = await Promise.all(Array.from({ length: 10 }, () => getO(t)));
    const w = await row(idOf(r));
    chk("C2.5-X3.2", "10 parallel opens (distinct IPs) ⇒ openCount exactly 10 and 10 OPEN events (atomic increment, no lost update)",
      res.every((x) => x.status === 200) && Number(w?.openCount) === 10 && (await evRows(idOf(r), "OPEN")).length === 10, "10", `count=${w?.openCount} events=${(await evRows(idOf(r), "OPEN")).length}`);
  }
  {
    const who = mailOf("stranger-burst");
    const rs = await Promise.all(Array.from({ length: 3 }, (_, i) => ingest(inMail({ from: `"คนแปลกหน้า" <${who}>`, to: [inA], subject: subj(`รัว ${i}`) }))));
    const cs = await contactsByEmail(crmA, who);
    const rows = await Promise.all(rs.map((r) => row(r.v?.emailId ?? NONE)));
    chk("C2.5-X3.3", "3 parallel inbound mails from the same stranger (different Message-IDs) ⇒ exactly ONE lead contact and all 3 rows point at it",
      rs.every((r) => r.ok) && cs.length === 1 && rows.every((w) => w?.contactId === cs[0]?.id), "one lead", `contacts=${cs.length} linked=${rows.filter((w) => w?.contactId === cs[0]?.id).length}/3`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X4 — redelivery / idempotency
  // ═════════════════════════════════════════════════════════════════════════════
  out("── X4 · redelivery ──");
  {
    const att = { filename: "รูปหน้างาน.pdf", content_type: "application/pdf", contentType: "application/pdf", content: Buffer.from(new Uint8Array(1200).fill(9)).toString("base64") };
    const m = inMail({ from: kOk.email, to: [inA], subject: subj("ส่งซ้ำ"), attachments: [att] });
    const p0 = PUTS.length;
    const r1 = await ingest(m);
    const p1 = PUTS.length;
    const r2 = await ingest(m);
    const rows = await rowsByMid(m.messageId);
    const acts = rows[0] ? await actsOf(rows[0].id) : [];
    const rec = rows[0] ? await outboxOf("crm.email.received", rows[0].id) : [];
    chk("C2.5-X4.1", "the same inbound Message-ID delivered twice ⇒ ONE row, ONE activity, ONE crm.email.received, the attachment uploaded ONCE (dedupe BEFORE upload) — both calls ok",
      r1.ok && r2.ok && rows.length === 1 && acts.length === 1 && rec.length === 1 && p1 - p0 === 1 && PUTS.length === p1, "once", `rows=${rows.length} acts=${acts.length} rec=${rec.length} puts=${p1 - p0}+${PUTS.length - p1}`);
  }
  {
    const m = inMail({ from: kOk.email, to: [inA], subject: subj("ส่งซ้ำพร้อมกัน") });
    const rs = await Promise.all(Array.from({ length: 10 }, () => ingest(m)));
    const rows = await rowsByMid(m.messageId);
    const acts = rows[0] ? await actsOf(rows[0].id) : [];
    chk("C2.5-X4.2", "10 parallel deliveries of one Message-ID ⇒ ONE row and ONE activity, every call resolves ok (no unhandled unique violation)",
      rs.every((r) => r.ok) && rows.length === 1 && acts.length === 1, "one", `ok=${rs.filter((r) => r.ok).length}/10 rows=${rows.length} acts=${acts.length}`);
  }
  {
    const w1 = await postWh(bouncePayload, { id: WH_B_ID });
    const ws = await Promise.all(Array.from({ length: 5 }, () => postWh(bouncePayload, { id: WH_B_ID })));
    await pump([tidA]);
    const ev = await evRows(eB, "BOUNCE");
    const ob = await outboxOf("crm.email.bounced", eB);
    const fin = eSeqB === NONE ? [] : ((await P.outboxEvent.findMany({ where: { tenantId: tidA, type: "crm.sequence.finished" } })) as Any[]).filter((e) => e.payload?.enrollmentId === eSeqB);
    chk("C2.5-X4.3", "provider webhook replay: the same svix-id again + 5 in parallel ⇒ still ONE BOUNCE event, ONE crm.email.bounced, ONE sequence stop (crm.sequence.finished) · every replay answers 2xx",
      [w1, ...ws].every((w) => w.status >= 200 && w.status < 300) && ev.length === 1 && ob.length === 1 && fin.length === 1, "one", `status=${[w1, ...ws].map((w) => w.status).join(",")} ev=${ev.length} ob=${ob.length} fin=${fin.length}`);
  }
  {
    const m = inMail({ from: kOk.email, to: [inA], subject: subj("สองระบบ") });
    const rA = await ingest(m);
    const rB = await ingest({ ...m, from: kB.email, to: [INADDR(KEY[crmB])] });
    const rows = await rowsByMid(m.messageId);
    chk("C2.5-X4.4", "the SAME Message-ID delivered to two CRM systems (two shops on one customer mail) ⇒ one row in EACH system (CrmEmailMessage.messageId is globally unique ⇒ system-scoped stored value — PROPOSED ruling 1)",
      rA.ok && rB.ok && rows.length === 2 && new Set(rows.map((w) => w.systemId)).size === 2 && rows.some((w) => w.systemId === crmB), "2 rows", `A=${rd(rA)} B=${rd(rB)} rows=${rows.length} systems=${[...new Set(rows.map((w) => w.systemId))].length}`);
  }
  {
    await pump();
    const probs: string[] = [];
    for (const t of EVENTS) {
      const rs = await outboxOf(t);
      const one = rs[0];
      if (!one) { probs.push(`${t}:none`); continue; }
      const eid = one.payload?.emailId ?? NONE;
      const a0 = (await actsOf(eid)).length;
      const e0 = (await evRows(eid)).length;
      const r1 = await consume(evtOf(one));
      const r2 = await consume(evtOf(one));
      const rp = await Promise.all([consume(evtOf(one)), consume(evtOf(one))]);
      if (![r1, r2, ...rp].every((r) => r.ok)) probs.push(`${t}:${[r1, r2, ...rp].find((r) => !r.ok)?.err}`);
      if ((await actsOf(eid)).length !== a0 || (await evRows(eid)).length !== e0) probs.push(`${t}:side effect repeated`);
    }
    chk("C2.5-X4.5", "every crm.email.* consumer: the same event consumed twice and twice in parallel ⇒ never throws and repeats no side effect (activities / e-mail events unchanged)",
      probs.length === 0, "idempotent", probs.join(" · ") || "-");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X5 — scheduled send: overlap · lease (never a terminal claim) · crash after claim
  // ═════════════════════════════════════════════════════════════════════════════
  out("── X5 · scheduled lease ──");
  {
    const S = subj("ตั้งเวลาชุด");
    const ks = await Promise.all(Array.from({ length: 6 }, (_, i) => consenting(tidA, crmA, `ตั้งเวลา ${i}`)));
    const ids: string[] = [];
    for (const k of ks) ids.push(idOf(await send(cA, owner, { contactId: k.id, subject: `${S} ${k.id}`, scheduledAt: new Date(Date.now() + 2 * 60_000).toISOString() })));
    const seen: Record<string, number> = {};
    const lease: string[] = [];
    const slow = tp(150, async (m) => {
      const mm = bare(hdr(m, "Message-ID"));
      seen[mm] = (seen[mm] ?? 0) + 1;
      const w = (await M("crmEmailMessage").findMany({ where: { messageId: { contains: mm } } }))[0];
      lease.push(`${w?.status}:${w?.leaseUntil ? "L" : "-"}`);
    });
    const now1 = new Date(Date.now() + 3 * 60_000);
    await Promise.all([0, 1].map(() => call(EM.runScheduled, now1, { tenantIds: [tidA], deps: { transport: slow, ...storeDeps } })));
    await Promise.all([0, 1, 2, 3].map(() => call(EM.runScheduled, now1, { tenantIds: [tidA], deps: { transport: slow, ...storeDeps } })));
    const rows = await Promise.all(ids.map(row));
    const counts = Object.values(seen);
    chk("C2.5-X5.1", "overlapping runScheduled (2 then 4 in parallel, slow transport) ⇒ each of 6 due e-mails sent EXACTLY once and SENT with the lease cleared",
      ids.every((x) => x !== NONE) && counts.length === 6 && counts.every((n) => n === 1) && rows.every((w) => w?.status === "SENT" && !w?.leaseUntil),
      "6 × 1", `sends=${j(counts)} status=${rows.map((w) => `${w?.status}${w?.leaseUntil ? "L" : ""}`).join(",")}`);
    chk("C2.5-X5.2", "the claim is a LEASE, never a terminal state: seen from inside the transport, the row being sent is still QUEUED with leaseUntil set (M7/H6 lesson)",
      lease.length === 6 && lease.every((x) => x === "QUEUED:L"), "QUEUED:L ×6", lease.join(","));
  }
  {
    const k = await consenting(tidA, crmA, "ค้างหลังจอง");
    const S = subj("ค้างหลังจอง");
    const at = Date.now() + 60_000;
    const e = idOf(await send(cA, owner, { contactId: k.id, subject: S, scheduledAt: new Date(at).toISOString() }));
    await P.$executeRawUnsafe(`UPDATE "CrmEmailMessage" SET "leaseUntil" = $1 WHERE id = $2`, new Date(at + 15 * 60_000), e).catch(() => 0);
    await call(EM.runScheduled, new Date(at + 60_000), { tenantIds: [tidA], deps: deps() });
    const mid1 = await row(e);
    const n1 = sentWith(S).length;
    await call(EM.runScheduled, new Date(at + 16 * 60_000), { tenantIds: [tidA], deps: deps() });
    await call(EM.runScheduled, new Date(at + 17 * 60_000), { tenantIds: [tidA], deps: deps() });
    const end = await row(e);
    chk("C2.5-X5.3", "crash after claim (row left QUEUED with a lease until now0+15 min): runScheduled at +1 min does NOT send it · at +16 min it is sent exactly once (a later run adds nothing)",
      e !== NONE && mid1?.status === "QUEUED" && n1 === 0 && end?.status === "SENT" && sentWith(S).length === 1, "re-sent once", `mid=${mid1?.status}/${n1} end=${end?.status} sends=${sentWith(S).length}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X6 — hostile input
  // ═════════════════════════════════════════════════════════════════════════════
  out("── X6 · hostile input ──");
  {
    const before = FETCHES.length;
    const base = { to: [mailOf("inj")], subject: "ปกติ", html: "<p>x</p>" };
    const rs = await Promise.all([
      call(CORE.sendEmailRich, { ...base, subject: "สวัสดี\r\nBcc: victim@evil.example" }),
      call(CORE.sendEmailRich, { ...base, fromName: "ร้าน\nX-Injected: 1" }),
      call(CORE.sendEmailRich, { ...base, headers: { "X-QC": "a\r\nBcc: v@evil.example" } }),
      call(CORE.sendEmailRich, { ...base, replyTo: "a@b.example\r\nBcc: v@evil.example" }),
      call(CORE.sendEmailRich, { ...base, to: ["a@b.example\nBcc: v@evil.example"] }),
    ]);
    chk("C2.5-X6.1", "core sendEmailRich: CR/LF in subject · fromName · a header value · replyTo · a recipient ⇒ { ok:false, error INVALID_HEADER } and NO request leaves the process",
      rs.every((r) => r.ok && r.v?.ok === false && /INVALID_HEADER/.test(String(r.v?.error ?? ""))) && FETCHES.length === before, "refused", `${rs.map((r) => (r.ok ? j(r.v) : r.err)).map((x) => cut(x, 40)).join(" | ")} fetches=${FETCHES.length - before}`);
  }
  {
    const n0 = SENT.length;
    const rows0 = await M("crmEmailMessage").count({ where: { tenantId: tidA } });
    const rs = [
      await send(cA, owner, { contactId: kOk.id, subject: "ข่าว\r\nBcc: victim@evil.example" }),
      await send(cA, owner, { contactId: kOk.id, cc: ["x@y.example\r\nBcc: v@evil.example"] }),
      await send(cA, owner, { contactId: kOk.id, bodyHtml: `<p>${"ก".repeat(520 * 1024)}</p>` }),
    ];
    const rows1 = await M("crmEmailMessage").count({ where: { tenantId: tidA } });
    chk("C2.5-X6.2", "service: CR/LF in subject or an address, and a body > 500 KB ⇒ VALIDATION (Thai), nothing stored, nothing sent",
      rs.every((r) => refused(r, "VALIDATION")) && rows1 === rows0 && SENT.length === n0, "refused", `${rs.map(rd).map((x) => cut(x, 40)).join(" | ")} rows ${rows0}→${rows1} sent=${SENT.length - n0}`);
  }
  {
    const evil = `<p>สวัสดี ${BODY_MARK}</p><script>alert(1)</script><img src="https://tracker.example/p.gif" onerror="alert(2)"><a href="javascript:alert(3)">คลิก</a><div onmouseover="x()">y</div><iframe src="https://evil.example"></iframe>`;
    const r = await ingest(inMail({ from: kOk.email, to: [inA], html: evil, subject: subj("html อันตราย") }));
    const w = await row(r.v?.emailId ?? NONE);
    const stored = String(w?.bodyHtml ?? "");
    const off = typeof ESH.renderInboundHtml === "function" ? String(ESH.renderInboundHtml(stored || evil, { showImages: false })) : "";
    const on = typeof ESH.renderInboundHtml === "function" ? String(ESH.renderInboundHtml(evil, { showImages: true })) : "";
    const inert = (s: string) => s.length > 0 && !/<script|\son\w+\s*=|javascript:|<iframe/i.test(s);
    chk("C2.5-X6.3", "inbound HTML: stored body has no <script>/on*=/javascript:/<iframe> but keeps the text · renderInboundHtml(showImages:false) loads NO remote URL · showImages:true keeps `<img src=\"https://tracker.example/p.gif\">` and is still inert",
      r.ok && inert(stored) && stored.includes(BODY_MARK) && inert(off) && !/src\s*=\s*["']?https?:/i.test(off) && inert(on) && /<img[^>]*src="https:\/\/tracker\.example\/p\.gif"/.test(on),
      "inert", `${rd(r)} stored=${cut(stored, 100)} off=${cut(off, 80)} on=${cut(on, 80)}`);
  }
  {
    const S = subj("html จากพนักงาน");
    const r = await send(cA, owner, { contactId: kOk.id, subject: S, bodyHtml: `<p>${BODY_MARK}</p><script>alert(1)</script><p onclick="x()">a</p><a href="javascript:alert(2)">b</a>` });
    const w = await row(idOf(r));
    const sentHtml = String(sentWith(S)[0]?.html ?? "");
    const bad = (s: string) => /<script|\sonclick|javascript:/i.test(s);
    chk("C2.5-X6.4", "composer HTML sanitized: neither the stored bodyHtml nor the html handed to the transport contain <script>/on*=/javascript:",
      r.ok && !!w && !bad(String(w.bodyHtml ?? "")) && sentHtml.length > 0 && !bad(sentHtml) && sentHtml.includes(BODY_MARK), "clean", `${rd(r)} stored=${bad(String(w?.bodyHtml ?? ""))} sent=${bad(sentHtml)}`);
  }
  {
    const n0 = SENT.length;
    const many = Array.from({ length: 21 }, () => pdf(100));
    const rs = [
      await send(cA, owner, { contactId: kOk.id, attachments: many }),
      await send(cA, owner, { contactId: kOk.id, attachments: [pdf(11 * MB)] }),
      await send(cA, owner, { contactId: kOk.id, attachments: [{ filename: "x.svg", contentType: "image/svg+xml", data: new Uint8Array(10) }] }),
      await send(cA, owner, { contactId: kOk.id, attachments: [{ filename: "x.html", contentType: "text/html", data: new Uint8Array(10) }] }),
    ];
    const outRefused = rs.every((r) => refused(r, "VALIDATION")) && SENT.length === n0;
    const S = subj("แนบปกติ");
    const okSend = await send(cA, owner, { contactId: kOk.id, subject: S, attachments: [pdf(4096)] });
    const okMsg = sentWith(S)[0] ?? {};
    const okRow = await row(idOf(okSend));
    const b64 = (n: number, fill = 3) => Buffer.from(new Uint8Array(n).fill(fill)).toString("base64");
    const inAtt = [
      ...Array.from({ length: 21 }, (_, i) => ({ filename: `f${i}.pdf`, content_type: "application/pdf", contentType: "application/pdf", content: b64(64) })),
      { filename: "big.pdf", content_type: "application/pdf", contentType: "application/pdf", content: b64(11 * MB) },
      { filename: "run.exe", content_type: "application/x-msdownload", contentType: "application/x-msdownload", content: b64(64) },
    ];
    const ri = await ingest(inMail({ from: kOk.email, to: [inA], subject: subj("แนบเยอะ"), attachments: inAtt }));
    const wi = await row(ri.v?.emailId ?? NONE);
    const list = (wi?.attachments ?? []) as Any[];
    chk("C2.5-X6.5", "attachments: outbound 21 files / 11 MB / svg / html ⇒ VALIDATION, nothing sent · a 4 KB pdf goes to the transport (base64) and is stored as { fileId, name, size, mime } · inbound 21 + 11 MB + .exe ⇒ exactly 20 stored, the big one and the exe skipped",
      outRefused && okSend.ok && (okMsg.attachments ?? []).length === 1 && ((okRow?.attachments ?? []) as Any[]).length === 1 && !!okRow?.attachments?.[0]?.fileId &&
        ri.ok && list.length === 20 && !list.some((a) => /big\.pdf|run\.exe/.test(String(a?.name ?? ""))),
      "capped", `out=${rs.map((r) => r.code || "ok").join(",")} ok=${rd(okSend)} att=${(okMsg.attachments ?? []).length}/${((okRow?.attachments ?? []) as Any[]).length} in=${rd(ri)} stored=${list.length}`);
  }
  {
    const offer = ctoks[0]?.tok ?? "";
    const probes = await Promise.all([
      getC(offer, "?u=https://evil.example/phish"),
      getC(offer, "?url=https%3A%2F%2Fevil.example&redirect=https://evil.example"),
      getC(`${offer}x`),
      getC(offer.slice(0, -1)),
      getC("https%3A%2F%2Fevil.example"),
      getC(`${offer}/../../evil.example`),
    ]);
    const good = probes[0].status === 302 && probes[0].loc === "https://shop.example/offer?id=7" && probes[1].loc === "https://shop.example/offer?id=7";
    const home = probes.slice(2).every((p) => p.status === 302 && !/evil\.example|shop\.example/.test(p.loc) && (() => { try { return new URL(p.loc, "http://x").pathname === "/"; } catch { return false; } })());
    chk("C2.5-X6.6", "open redirect: /t/c ignores every query parameter (still the stored URL) · a tampered / truncated / URL-shaped / path-traversal token ⇒ 302 to the home page, never to a URL of the attacker's choosing",
      !!offer && good && home, "stored URL only", probes.map((p) => `${p.status}:${cut(p.loc, 40)}`).join(" | "));
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X7 — public endpoints
  // ═════════════════════════════════════════════════════════════════════════════
  out("── X7 · public endpoints ──");
  const evCount = async () => M("crmEmailEvent").count({ where: { tenantId: { in: TENANTS } } });
  {
    const known = await getO(tokO);
    const e0 = await evCount();
    const unknown = await getO(randomBytes(24).toString("base64url"));
    const garbage = await getO("..%2F..%2Fetc");
    const e1 = await evCount();
    const same = (a: Rr, b: Rr) => a.status === b.status && a.ct === b.ct && a.cache === b.cache && a.hex === b.hex;
    chk("C2.5-X7.1", "/t/o: an unknown or garbage token gets the SAME answer as a known one (200 · image/gif · no-store · identical bytes) and writes nothing",
      known.status === 200 && /image\/gif/.test(known.ct) && /no-store/.test(known.cache) && same(known, unknown) && same(known, garbage) && e1 === e0,
      "indistinguishable", `known=${known.status}/${known.ct}/${known.hex.length} unknown=${unknown.status}/${unknown.hex === known.hex} garbage=${garbage.status} events ${e0}→${e1}`);
  }
  {
    const toks = [...new Set(TOKENS.filter((t) => !!t))];
    const tables = ["CrmEmailMessage", "CrmEmailEvent", "CrmTrackedLink", "CrmTrackedClick", "AuditLog", "OutboxEvent", "OpsEvent", "CrmActivity"];
    const leaks: string[] = [];
    for (const t of tables) {
      const rows = (await P.$queryRawUnsafe(`SELECT row_to_json(x)::text AS j FROM "${t}" x WHERE x."tenantId" = ANY($1::text[])`, TENANTS).catch(() => [])) as Any[];
      for (const r of rows) for (const tok of toks) if (String(r.j).includes(tok)) leaks.push(`${t}:${tok.slice(0, 6)}`);
    }
    const short = toks.filter((t) => t.replace(/[^A-Za-z0-9_-]/g, "").length < 22);
    chk("C2.5-X7.2", "tracking / click / unsubscribe tokens are ≥ 128 bits (≥ 22 url-safe chars) and appear in NO database row of our tenants (only hashes are stored — messages, events, links, audit, outbox, ops, activities)",
      toks.length >= 6 && short.length === 0 && leaks.length === 0, "hash only", `tokens=${toks.length} short=${short.length} leaks=${cut([...new Set(leaks)].join(","), 160) || "-"}`);
  }
  {
    const S = subj("ลายเซ็นปลอม");
    const o = await send(cA, owner, { contactId: kComp.id, subject: S });
    const oRow = await row(idOf(o));
    const pl = { type: "email.bounced", created_at: new Date().toISOString(), data: { email_id: oRow?.providerId ?? "none", bounce: { type: "Permanent" } } };
    const noSig = await postWh(pl, { sig: null });
    const badSig = await postWh(pl, { sig: `v1,${randomBytes(32).toString("base64")}` });
    const stale = await postWh(pl, { ts: Math.floor(Date.now() / 1000) - 600 });
    const tamper = await postWh(pl, { raw: JSON.stringify({ ...pl, type: "email.bounced" }).replace("Permanent", "Permanent "), sig: whSign("msg_x", String(Math.floor(Date.now() / 1000)), JSON.stringify(pl)), id: "msg_x" });
    const w = await row(idOf(o));
    const k = await P.crmContact.findFirst({ where: { id: kComp.id } });
    chk("C2.5-X7.3", "Resend webhook: no signature · wrong signature · stale timestamp (10 min) · body changed after signing ⇒ 401 each and NOTHING written (status unchanged, no BOUNCE event, contact not flagged)",
      [noSig, badSig, stale, tamper].every((r) => r.status === 401) && w?.status === "SENT" && (await evRows(idOf(o))).length === 0 && !k?.emailBouncedAt,
      "401 + no write", `${[noSig, badSig, stale, tamper].map((r) => r.status).join(",")} status=${w?.status} bounced=${!!k?.emailBouncedAt}`);
    const cp = { type: "email.complained", created_at: new Date().toISOString(), data: { email_id: oRow?.providerId ?? "none" } };
    const c1 = await postWh(cp);
    await pump([tidA]);
    const k2 = await P.crmContact.findFirst({ where: { id: kComp.id } });
    chk("C2.5-X8.6", "complaint (spam report) webhook ⇒ ONE COMPLAINT event and the contact becomes emailOptOut (PROPOSED ruling 5) — the next send is EMAIL_BLOCKED",
      c1.status >= 200 && c1.status < 300 && (await evRows(idOf(o), "COMPLAINT")).length === 1 && k2?.emailOptOut === true && refused(await send(cA, owner, { contactId: kComp.id }), "EMAIL_BLOCKED"),
      "opted out", `wh=${c1.status} ev=${(await evRows(idOf(o), "COMPLAINT")).length} optOut=${k2?.emailOptOut}`, "MAJOR");
  }
  {
    const lim = Number(ESH.CRM_TRACK_RATE_LIMITS?.perToken?.limit ?? 0);
    const S = subj("ยิงถี่");
    const r = await send(cA, owner, { contactId: kOk.id, subject: S });
    const t = pixTok(sentWith(S)[0]?.html ?? "");
    TOKENS.push(t);
    await backdate(idOf(r), 60_000);
    const n = lim > 0 && lim <= 60 ? lim + 3 : 0;
    const res: Rr[] = [];
    const ips: string[] = [];
    for (let i = 0; i < n; i += 1) { const ip = ipN(); ips.push(ip); res.push(await getO(t, UA_OK, ip)); }
    const w = await row(idOf(r));
    const keys = typeof EM.trackRateKeys === "function" ? (EM.trackRateKeys("o", { ip: ips[0] ?? "", token: t }) as string[]) : [];
    const buckets = keys.length ? ((await P.chatRateBucket.findMany({ where: { key: { in: keys } } })) as Any[]) : [];
    const rawInKey = keys.some((k) => k.includes(ips[0] ?? "§") || k.includes(t));
    chk("C2.5-X7.4", "rate limit (checkRateLimitDb): perToken.limit + 3 opens of one token from distinct IPs ⇒ openCount capped at the limit, every answer still the same gif · the route's bucket keys (trackRateKeys) exist in ChatRateBucket and hold no raw IP or token",
      n > 0 && res.every((x) => x.status === 200 && x.hex === res[0].hex) && Number(w?.openCount) === lim && keys.length >= 2 && buckets.length >= 1 && !rawInKey,
      "capped", `limit=${lim} fired=${n} count=${w?.openCount} keys=${keys.length} buckets=${buckets.length} raw=${rawInKey}`);
  }
  {
    const S = subj("เลิกรับไม่รู้จัก");
    const k = await consenting(tidA, crmA, "ทดสอบ GET");
    await send(cA, owner, { contactId: k.id, subject: S });
    const t = unsubTok(sentWith(S)[0]?.html ?? "");
    TOKENS.push(t);
    const g = await postU(t, "GET");
    const k1 = await P.crmContact.findFirst({ where: { id: k.id } });
    const unknown = await postU(randomBytes(24).toString("base64url"));
    const known = await postU(t);
    chk("C2.5-X7.5", "unsubscribe one-click: GET (link scanners/prefetch) changes nothing · an unknown token answers the SAME status as a known one (no oracle for valid tokens)",
      g.status !== -1 && k1?.emailOptOut === false && unknown.status === known.status && known.status >= 200 && known.status < 300, "no oracle", `get=${g.status} optOut=${k1?.emailOptOut} unknown=${unknown.status} known=${known.status}`);
  }
  {
    const e0 = await evCount();
    const unk = await postWh({ type: "email.bounced", created_at: new Date().toISOString(), data: { email_id: `re_unknown_${TAG}`, bounce: { type: "Permanent" } } });
    const big = await postWh({ type: "email.delivered", data: { email_id: "x", pad: "ก".repeat(300 * 1024) } });
    const e1 = await evCount();
    chk("C2.5-X7.6", "webhook: validly signed event for an unknown email_id ⇒ 2xx and nothing written · body > 256 KB ⇒ 413",
      unk.status >= 200 && unk.status < 300 && big.status === 413 && e1 === e0, "quiet", `unknown=${unk.status} big=${big.status} events ${e0}→${e1}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X8 — PDPA
  // ═════════════════════════════════════════════════════════════════════════════
  out("── X8 · PDPA ──");
  {
    const i1 = await ingest(inMail({ from: kNoCons.email, to: [inA], subject: subj("ลูกค้าเริ่มเอง") }));
    const r1 = await send(cA, owner, { contactId: kNoCons.id, subject: subj("ตอบลูกค้า"), replyToEmailId: i1.v?.emailId ?? NONE });
    const i2 = await ingest(inMail({ from: kBounce.email, to: [inA], subject: subj("ลูกค้าเด้งเริ่มเอง") }));
    const r2 = await send(cA, owner, { contactId: kBounce.id, subject: subj("ตอบคนเด้ง"), replyToEmailId: i2.v?.emailId ?? NONE });
    const r3 = await send(cA, owner, { contactId: kNoCons.id, subject: subj("เริ่มใหม่ไม่มีความยินยอม") });
    chk("C2.5-X8.1", "R-E.11 transactional: replying inside a thread the CUSTOMER started is allowed without marketing consent · a bounced address is blocked even then · a NEW thread to the same no-consent contact is EMAIL_BLOCKED",
      i1.ok && r1.ok && r1.v?.status === "SENT" && i2.ok && refused(r2, "EMAIL_BLOCKED") && refused(r3, "EMAIL_BLOCKED"), "R-E.11", `reply=${rd(r1)} bounced=${rd(r2)} new=${rd(r3)}`);
  }
  {
    const S = subj("ไม่ติดตาม");
    const r = await send(cA, owner, { contactId: kTrk.id, subject: S });
    const h = String(sentWith(S)[0]?.html ?? "");
    const kLate = await consenting(tidA, crmA, "ถอนการติดตามทีหลัง");
    const S2 = subj("ถอนทีหลัง");
    const r2 = await send(cA, owner, { contactId: kLate.id, subject: S2 });
    const t2 = pixTok(sentWith(S2)[0]?.html ?? "");
    TOKENS.push(t2);
    await P.crmContact.update({ where: { id: kLate.id }, data: { trackingOptOut: true } }).catch(() => null);
    await backdate(idOf(r2), 60_000);
    const g = await getO(t2);
    const w2 = await row(idOf(r2));
    chk("C2.5-X8.2", "trackingOptOut: NO pixel and NO wrapped link in the message (the unsubscribe link stays) · a contact who opts out of tracking AFTER the send ⇒ their opens are not recorded (gif still served)",
      r.ok && h.length > 0 && !/\/t\/o\//.test(h) && !/\/t\/c\//.test(h) && /\/u\//.test(h) && h.includes("https://shop.example/offer?id=7") && r2.ok && g.status === 200 && Number(w2?.openCount) === 0,
      "not tracked", `pixel=${/\/t\/o\//.test(h)} wrapped=${/\/t\/c\//.test(h)} unsub=${/\/u\//.test(h)} late=${g.status}/${w2?.openCount}`);
  }
  {
    const k = await consenting(tidA, crmA, "ถอนก่อนเวลาส่ง");
    const S = subj("ถอนก่อนส่ง");
    const at = Date.now() + 60_000;
    const e = idOf(await send(cA, owner, { contactId: k.id, subject: S, scheduledAt: new Date(at).toISOString() }));
    await P.crmContact.update({ where: { id: k.id }, data: { emailOptOut: true } });
    await call(EM.runScheduled, new Date(at + 60_000), { tenantIds: [tidA], deps: deps() });
    const w = await row(e);
    chk("C2.5-X8.5", "consent re-checked at SEND time: a scheduled e-mail whose contact opted out after scheduling is NOT sent (status FAILED, providerError EMAIL_BLOCKED, no crm.email.sent)",
      e !== NONE && sentWith(S).length === 0 && w?.status === "FAILED" && /EMAIL_BLOCKED/.test(String(w?.providerError ?? "")) && (await outboxOf("crm.email.sent", e)).length === 0,
      "blocked at send", `sent=${sentWith(S).length} status=${w?.status} err=${w?.providerError}`);
  }
  await pump();
  {
    const FORBIDDEN_KEYS = new Set(["name", "firstname", "lastname", "fullname", "phone", "email", "from", "to", "cc", "bcc", "address", "subject", "body", "bodyhtml", "bodytext", "html", "text", "snippet", "url", "href"]);
    const keysDeep = (v: Any): string[] => (v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => [k, ...keysDeep(x)]) : []);
    const probs: string[] = [];
    for (const t of EVENTS) {
      const rs = await outboxOf(t);
      if (!rs.length) { probs.push(`${t}:none`); continue; }
      for (const r of rs) {
        const s = j(r.payload);
        const bad = keysDeep(r.payload).filter((k) => FORBIDDEN_KEYS.has(k.toLowerCase()));
        if (bad.length) probs.push(`${t}:key ${bad[0]}`);
        if ([...PII, BODY_MARK, SUBJ_MARK, "http://", "https://"].some((n) => s.includes(n))) probs.push(`${t}:pii`);
        if (!r.payload?.emailId || !String(r.idempotencyKey ?? "").startsWith(`${t}#`)) probs.push(`${t}:shape`);
      }
    }
    chk("C2.5-X8.3", "outbox payloads of the 6 crm.email.* events: ids only (emailId …) — no address, name, subject, body, snippet or URL · key `crm.email.<type>#…`",
      probs.length === 0, "ids only", cut([...new Set(probs)].join(" · "), 300) || "-");
  }
  {
    const all = (await P.outboxEvent.findMany({ where: { tenantId: { in: TENANTS } } })) as Any[];
    const dirty = all.filter((r) => [BODY_MARK, SUBJ_MARK].some((n) => j(r.payload).includes(n)));
    const ops = (await P.opsEvent.findMany({ where: { tenantId: { in: TENANTS } } }).catch(() => [])) as Any[];
    const badOps = ops.filter((o) => [BODY_MARK, SUBJ_MARK, ...PII].some((n) => j(o).includes(n)));
    const badLogs = LOGS.filter((l) => [BODY_MARK, SUBJ_MARK, ...PII].some((n) => l.includes(n)));
    const audits = (await P.auditLog.findMany({ where: { tenantId: { in: TENANTS } } })) as Any[];
    const badAudit = audits.filter((a) => j([a.before, a.after]).includes(BODY_MARK));
    chk("C2.5-X8.4", "no e-mail body/subject in ANY outbox payload of our tenants · no body/subject/address in OpsEvent rows or console lines printed by product code · AuditLog before/after never holds a body",
      dirty.length === 0 && badOps.length === 0 && badLogs.length === 0 && badAudit.length === 0,
      "clean", `outbox=${dirty.map((r) => r.type).join(",") || "-"} ops=${badOps.length} logs=${badLogs.length} ${cut(badLogs[0], 100)} audit=${badAudit.map((a) => a.action).join(",") || "-"}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X9 — audit · X10 — private attachments
  // ═════════════════════════════════════════════════════════════════════════════
  out("── X9 · audit ──");
  {
    const acts = new Set(((await P.auditLog.findMany({ where: { tenantId: tidA }, select: { action: true } })) as Any[]).map((a) => String(a.action)));
    const need = ["crm.email.send", "crm.email.settings", "crm.email.user_setting", "crm.email.rotate_key", "crm.email.attach"];
    const prefixes = ["crm.email.template.", "crm.email.domain."];
    const miss = [...need.filter((a) => !acts.has(a)), ...prefixes.filter((p) => ![...acts].some((a) => a.startsWith(p)))];
    chk("C2.5-X9.1", "every mutation audited: crm.email.send · settings · user_setting · rotate_key · attach · template.* · domain.*", miss.length === 0, "all", `missing=${miss.join(",") || "-"}`, "MAJOR");
  }
  out("── X10 · private attachments ──");
  {
    const S = subj("ไฟล์แนบส่วนตัว");
    const att = { filename: "บัตรประชาชน.pdf", content_type: "application/pdf", contentType: "application/pdf", content: Buffer.from(new Uint8Array(700).fill(1)).toString("base64") };
    const r = await ingest(inMail({ from: kOk.email, to: [inA], subject: S, attachments: [att] }));
    const w = await row(r.v?.emailId ?? NONE);
    const fid = (w?.attachments ?? [])[0]?.fileId ?? NONE;
    const fa = fid !== NONE ? await P.fileAsset.findFirst({ where: { id: fid } }) : null;
    const th = await call(EM.getThread, cA, owner, w?.threadKey ?? NONE);
    const dto = j(th.v);
    const u = await call(EM.attachmentUrl, cA, owner, r.v?.emailId ?? NONE, fid);
    const us = await call(EM.attachmentUrl, cAs, staff, r.v?.emailId ?? NONE, fid);
    const exp = u.ok ? new Date(u.v?.expiresAt).getTime() - Date.now() : -1;
    chk("C2.5-X10.1", "inbound attachment stored PRIVATE (path t/<tenant>/private/…, cdnUrl private://) · getThread DTO has no cdnUrl / private:// / storage path · attachmentUrl ⇒ /api/files/…?exp&sig valid ≤ 15 min, only after visibility (staff who cannot see the contact ⇒ NOT_FOUND)",
      r.ok && !!fa && /\/private\//.test(String(fa?.path ?? "")) && String(fa?.cdnUrl ?? "").startsWith("private://") && th.ok && !/private:\/\/|qc-c25-cdn|\/private\//.test(dto) &&
        u.ok && /\/api\/files\/[^?]+\?exp=\d+&sig=/.test(String(u.v?.url ?? "")) && exp > 0 && exp <= 15 * 60_000 + 5_000 && refused(us, "NOT_FOUND"),
      "private", `${rd(r)} path=${cut(fa?.path, 50)} cdn=${cut(fa?.cdnUrl, 30)} dtoLeak=${/private:\/\/|qc-c25-cdn|\/private\//.test(dto)} url=${cut(u.v?.url, 60)} exp=${exp} staff=${rd(us)}`);
  }
  void manager; void tplA; void thMain;
} catch (e) {
  chk("C2.5-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — every row of the throwaway tenants (4 passes over every table with tenantId), systems, tenants, users, our rate buckets.
  // ═════════════════════════════════════════════════════════════════════════════
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* order/FK — retried next pass */ } };
  try {
    const EMx = (await import("@/lib/modules/crm/emails" as string).catch(() => ({}))) as Any;
    if (typeof EMx.trackRateKeys === "function") {
      const keys = new Set<string>();
      for (const r of RATE_REQ) { try { for (const k of EMx.trackRateKeys(r.route, { ip: r.ip, token: r.token })) keys.add(String(k)); } catch { /* */ } }
      if (keys.size) await del(() => P.chatRateBucket.deleteMany({ where: { key: { in: [...keys] } } }));
    }
  } catch { /* */ }
  if (OPS_IDS.length) await del(() => P.opsEvent.deleteMany({ where: { id: { in: OPS_IDS } } }));
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
      chk("C2.5-CLEAN", "the oracle gives the QC database back exactly as found — every throwaway tenant, every row it owned, the throwaway users and our rate buckets are gone",
        left.length === 0 && tenants === 0 && users === 0, "0 rows · 0 tenants · 0 users", `${left.join(" · ") || "-"} · tenants=${tenants} users=${users}`, "MAJOR");
    } catch (e) {
      chk("C2.5-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
out(`\n${passed === total ? "🟢" : "🔴"} C2.5: ${passed}/${total} · outbound fetch stubbed ${FETCHES.length}× (Resend emails ${resendCalls().length}×)`);
out(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
