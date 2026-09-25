// QC — CRM v2 WO C2.6: tracking (decision C6 + C24) — tracked links `/l/{code}` (create · 302 to the STORED url · counters · QR) ·
//      e-mail pixel/click integration (`/t/o` `/t/c` are C2.5's routes — C2.6 adds the identify ticket + bot filter reuse) ·
//      `shark.js` served at `/t/s/{siteKey}.js` + consent banner · `POST /t/e` collect · `POST /t/consent` · CrmWebSession/CrmWebEvent ·
//      identify (form / e-mail click / portal) binding past sessions ≤ 180 d + one WEB activity per day + `crm.web.identified` ·
//      purge (retention) · forms: FormDef.crmSystemId / utm / pageUrl / referrer / webSessionId / assignRuleId / scoreOnSubmit /
//      createCompanyFromField / embed code · SPAM GUARD (C24): honeypot + minimum fill time + DB rate limit per ip-hash and per form +
//      optional Turnstile · settings UI (mockup 16) + /settings/forms + web timeline on contact 360.
// Oracle writer · the C2.6 builder must NOT touch this file · QC database only (.env.qc — loaded by scripts/acc-v2-env.mts)
// Run:  bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c2.6.mts
//       `--force-run` = run every check while the C2.6 artefacts are absent — C2.6 checks go red for the right reason ("missing"),
//       the positive controls and CLEAN go green: proves the fixtures, the worker processes and the cleanup.
//       Without the flag and without src/lib/modules/crm/tracking.ts (or without the C2.0 tables) ⇒ SKIPPED (no DB connection opened).
// requires: crm-seed   (house style — this oracle reads NO seeded row; everything lives in throwaway tenants `qc-c26-<rand>-*`)
// Companion (NOT this file): `scripts/qc-crm-c2.6-web.mts` — headless chromium on a real HTML page (cookies set/not set, banner
//   clicks, real POSTs). This file proves the SERVER half of S3 plus static properties of the served script.
//
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE (not re-implemented here): qc-form · qc-forms-notify · qc-public-links · qc-pages ·
//   qc-crm-c1.8 (form bridge v1/v2 lead path) · qc-crm-c2.3 (pick with ruleId) · qc-crm-c2.5 (/t/o /t/c open-redirect, unknown token,
//   bot filter — owned there) · qc-marketing + qc-member-m3.2 (member pixel `/api/m/track/o/*` must stay untouched) · qc-crm-v1.
//
// SOURCES: crm-brief-C2.6.md · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-A /settings/forms = C2.6 · R-A purge implemented by
//   C2.6, REGISTERED by C2.10 · R-B web events direct batched insert, not outbox · R-C.7 paths · R-C.8 `#` idempotency keys · R-D
//   crm-bridges/forms.ts C1.8 → C2.6 · R-E.3 resolveFormCrmSystem · R-E.14 uiVersion 1 · R-E.16 links keep redirecting after 1 year) ·
//   CRM-RUN §2 "C2.6" (S1 4 · S2 4 · S3 6 · S4 4 · S5 2 · S6 5 · S7 1 · S8 4 = 30) + §4 PERMANENT RULE (C1.7: uiVersion-1 cases) +
//   §4 C0.4 ruling (domain-separated HMAC keys for every token route) · MASTER-PLAN §4 X1 X3 X4 X5 X6 X7 X8 X9 · §6 row C2.6 ·
//   blueprint §0.1 C6 · §4.3 (Tracked*/Web*) · §4.5 settings.crm.tracking · §5.7 tracking.ts · §7.1 crm.web.identified · §11.4 bot
//   filter · §11.7 · §11.9 (links 1,000) · §15 C24 · mockups 11 + 16 · C2.0 migration 20261101000000_crm_v2_b (read-only).
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this) ══════════════════════════════════
//   A. SERVICE `src/lib/modules/crm/tracking.ts` (+ `export * as tracking from "./tracking"` in crm/index.ts inside `// CRM C2.6 ▸ … ◂`)
//      STAFF functions — ctx { tenantId, systemId, actorUserId } · actor = MemberActor · system re-resolved (id + tenantId + type CRM)
//      else NOT_FOUND · assertCrmV2 FIRST (uiVersion 1 ⇒ CrmV2DisabledError, nothing written) · key `crm.tracking.manage` for every
//      function below except webTimeline (visibility contactWhere ⇒ invisible = NOT_FOUND) · errors carry `.code` ∈ NOT_FOUND |
//      FORBIDDEN | VALIDATION | CONFIRM_REQUIRED with a Thai message that never blames the user · every mutation writes AuditLog
//      `crm.tracking.*` (link.create · link.update · link.delete · web.settings · form.target)
//        createLink(ctx, actor, { url; name?; channel?; code? }) → LinkDto { id; code; url; name; channel; active; clicks; uniqueClicks;
//          shortUrl (= `<origin>/l/<code>`); createdAt }   url: http/https ONLY (after trim, case-insensitive scheme), host required,
//          ≤ 2048 chars, no `//host` protocol-relative, no backslash tricks ⇒ else VALIDATION, nothing written · code: optional custom
//          matching LINK_CODE_RE (unique across ALL tenants — taken ⇒ VALIDATION) else random ≥ 8 chars from crypto · ≤ 1,000 links/system
//        updateLink(ctx, actor, id, { name?; url?; channel?; active? }) → LinkDto (code immutable; same url rules)
//        deleteLink(ctx, actor, id, { confirm: true; reason ≥ 5 chars }) → { ok: true } (X9: no confirm ⇒ CONFIRM_REQUIRED)
//        listLinks(ctx, actor) → LinkDto[] · linkStats(ctx, actor, id, { days? }) → { clicks; uniqueClicks; byDay: { date; clicks }[] }
//        linkQrSvg(ctx, actor, id) → string (an `<svg …>` encoding shortUrl — no <script>, no on*= attributes)
//        getWebSettings(ctx, actor) → WebSettingsDto { enabled; domains: string[]; consentText; consentVersion; retentionDays; siteKey:
//          string | null; scriptUrl; embedCode }   (defaults: enabled false · domains [] · consentVersion 1 · retentionDays 180)
//        saveWebSettings(ctx, actor, { enabled?; domains?; consentText?; retentionDays?; bumpConsentVersion?: boolean }) → WebSettingsDto
//          stored at AppSystem.settings.crm.tracking.web with ONE jsonb_set statement (other crm keys survive) · domains = bare
//          lowercase hostnames (no scheme/path/port/wildcard/IP), ≤ 20 · retentionDays 30..730 · consentText 1..2000 · enabling with no
//          siteKey generates one (crypto, ≥ 12 chars [A-Za-z0-9_-], unique) · bumpConsentVersion ⇒ consentVersion + 1
//        webStats(ctx, actor, { days? = 30 }) → { sessions; consented; identified; webLeads } (numbers of THIS system only)
//        webTimeline(ctx, actor, contactId) → { sessions: { id; startedAt; lastSeenAt; pageViews; firstUrl; utm; identifiedBy;
//          events: { kind; url; title; at; durationSec }[] }[] }
//        listFormTargets(ctx, actor) → { formId; name; crmSystemId; assignRuleId; scoreOnSubmit; utmCapture; createCompanyFromField;
//          spamGuard; embedCode }[] (forms of ctx.tenantId) · saveFormTarget(ctx, actor, formId, patch) — formId of another tenant ⇒
//          NOT_FOUND · crmSystemId not a CRM system of ctx.tenantId ⇒ VALIDATION · assignRuleId not a rule of that system ⇒ VALIDATION ·
//          writes FormDef through the forms facade (edge crm→forms exists)
//      PUBLIC / INTERNAL functions (no actor)
//        resolveSite(siteKey) → { tenantId; systemId; domains; consentVersion; consentText } | null — null when unknown, tracking
//          disabled, or the system is uiVersion 1
//        collect(body: unknown, meta: { origin: string | null; ip: string; userAgent: string; bytes: number }, deps?: { limiter?:
//          (key: string, spec: { limit: number; windowMs: number }) => Promise<{ ok: boolean }>; now?: Date }) → Promise<void>
//        recordConsent(body: unknown, meta (same), deps? (same)) → Promise<void>
//          (the routes call these WITHOUT deps; deps exist for X3 only)
//        identify(ctx: { tenantId; systemId }, { visitorId; contactId; by: "FORM" | "EMAIL_CLICK" | "PORTAL" | "LINK" }, opts?: { now? })
//          → { bound: number; activityId: string | null; skipped?: "V1" | "OPT_OUT" | "NOT_FOUND" | "NO_SESSIONS" }
//          binds every session of (systemId, visitorId) with contactId null and startedAt ≥ now − 180 d · NEVER re-binds a session
//          bound to another contact (shared device) · later NEW sessions of that visitor inherit the most recently identified contact
//          · contact with trackingOptOut ⇒ nothing (skipped OPT_OUT) · when bound > 0: identifiedBy := by on those sessions, ONE
//          CrmActivity type WEB source WEB per (contact, Thai day) (sourceRef `web#<contactId>#<YYYY-MM-DD>`, doneAt set, Thai title
//          without PII) and ONE outbox `crm.web.identified` (idempotencyKey starts `crm.web.identified#`, payload ids/numbers only:
//          contactId, systemId, sessionCount, pageViews, firstUrl?, by) in the SAME transaction · per-visitor advisory lock (X4)
//        purgeWeb(now: Date, opts?: { tenantIds?: string[] }) → { sessionsDeleted; sessionsSummarised; eventsDeleted } — per system
//          retentionDays (default 180), cutoff on lastSeenAt: unidentified sessions DELETED (events cascade) · identified sessions:
//          events deleted, session kept with contactId/pageViews/startedAt/lastSeenAt/firstUrl, ipHash := null, userAgent := null,
//          purgedAt := now · WEB activities kept · idempotent, two overlapping runs safe (X5) · runs for uiVersion-1 systems too
//          (PROPOSED — retention is a legal duty, not a feature) · registered as a job by C2.10 (R-A), not here
//        ipHashFor(ip: string, now: Date) → string — hex HMAC-SHA256 with a MONTHLY salt derived from a domain-separated key
//          (`crm-ip:v1:${SESSION_SECRET}` + Thai YYYY-MM) · never equal to sha256(ip)
//        emailClickTicket({ tenantId; systemId; emailId; contactId }, now?) → string · appendIdentifyTicket(url, ticket, domains) → url
//          (adds `sd_ct=<ticket>` ONLY when the url host is an allowed domain; otherwise returns url unchanged) — the ticket is opaque
//          (no contactId / emailId / e-mail token in clear or base64url-decoded), HMAC with key `crm-identify:v1:${SESSION_SECRET}`,
//          compared timing-safe, valid IDENTIFY_TICKET_TTL_MS (1 h), bound to its systemId (another system's site ⇒ ignored)
//   B. SHARED `src/lib/modules/crm/tracking-shared.ts` (pure — no prisma/next/server-only): TRACKING_PAYLOAD_MAX_BYTES = 8192 ·
//      VISITOR_COOKIE = "sd_vid" · CONSENT_COOKIE = "sd_consent" · VISITOR_COOKIE_MAX_AGE_SEC = 15552000 (180 d) · WEB_SESSION_IDLE_MS =
//      1800000 · IDENTIFY_LOOKBACK_DAYS = 180 · IDENTIFY_TICKET_TTL_MS = 3600000 · LINK_CODE_RE · LINK_FALLBACK_URL =
//      "https://shark.in.th/" · TRACKING_RATE_LIMITS = { collectPerIp; collectPerSite; consentPerIp; linkPerIp } each { limit; windowMs }
//      (collectPerIp.limit 10..1000 · collectPerSite.limit ≥ 1000 per minute-equivalent) · isBotUserAgent(ua) (the SAME filter C2.5 uses
//      — one engine; if C2.5 put it elsewhere, re-export it here) · cleanTrackedUrl(url) → string | null (http/https only, keeps ONLY
//      utm_* query params, drops the fragment, ≤ 2048) · normalizeDomain(input) → string | null · originAllowed(origin, domains) →
//      boolean (https only; host === domain or a subdomain of it; lookalikes refused)
//   C. PUBLIC ROUTES (read cookies from `req.headers.get("cookie")` — NEVER next/headers — so they run with a plain Request)
//      `src/app/l/[code]/route.ts` GET(req, { params: Promise<{ code }> }):
//        known + active + (expiresAt null or future) ⇒ 302 Location = the STORED url (byte-exact; query params of the request NEVER
//          influence it) · Cache-Control contains no-store · empty body · Set-Cookie `sd_u=1; Path=/l/<code>; Max-Age=31536000; HttpOnly;
//          Secure; SameSite=Lax` (no identifier) · counted (v2 system, not a bot, DB limiter linkPerIp ok): ONE CrmTrackedClick
//          (tenantId, linkId, userAgent ≤ 200) + clicks + 1 + (no `sd_u` cookie on the request ⇒ uniqueClicks + 1) in single atomic
//          SQL increments (X3) · bot or rate-limited ⇒ same 302, nothing counted · uiVersion-1 system ⇒ same 302, nothing counted
//        unknown / inactive / expired ⇒ IDENTICAL response: 302 Location LINK_FALLBACK_URL, same Cache-Control, no Set-Cookie, empty body,
//          nothing written
//      `src/app/t/s/[script]/route.ts` GET — param `script` = "<siteKey>.js": 200 · Content-Type application/javascript or
//        text/javascript (charset utf-8) · X-Content-Type-Options nosniff · Cache-Control max-age ≤ 3600 or no-store · body = the
//        tracker with the siteKey, consentVersion and consentText baked in as JSON-escaped literals (no raw `</script`, U+2028 escaped),
//        banner built with textContent (never innerHTML/eval/document.write), buttons ยอมรับ / ปฏิเสธ, API `sd('page'|'identify'|'event'|
//        'revoke')`, cookies sd_vid / sd_consent with Max-Age 15552000, posts to `/t/e` and `/t/consent`, NEVER reads form values
//        (no FormData, no `.value`, no input/change/submit/key listeners) · unknown key / disabled / uiVersion 1 ⇒ IDENTICAL no-op script
//        (same status + headers, body contains no siteKey, still valid JS)
//      `src/app/t/e/route.ts` POST + OPTIONS · `src/app/t/consent/route.ts` POST + OPTIONS — EVERY response is 204 with an EMPTY body
//        (except 413 allowed for an oversize payload), Cache-Control no-store · CORS: Origin allowed for that site ⇒
//        Access-Control-Allow-Origin = that exact origin + Vary: Origin, never `*`, never Allow-Credentials true · otherwise no ACAO ·
//        body JSON (content-type application/json or text/plain) read with a hard cap of TRACKING_PAYLOAD_MAX_BYTES:
//          /t/e       { k: siteKey; v: visitorId (uuid); cv: consentVersion; t: "page" | "event" | "identify"; u: pageUrl; ti?: title;
//                       r?: referrer; d?: durationSec; n?: eventName; ct?: identify ticket }
//          /t/consent { k; v; cv; d: "accept" | "decline" | "revoke"; u?; r? }
//        writes happen ONLY when: site resolves · Origin allowed · u host allowed · v valid · DB limiter ok (collectPerIp keyed by the
//          ip hash + collectPerSite) · for /t/e: cv === current consentVersion AND a session of (system, visitor) holds consentVersion
//          === current (not revoked) AND the visitor is not bound to a trackingOptOut contact
//        accept (cv current) ⇒ session (reuse the visitor's latest non-idle one or create) with consentVersion, consentAt, firstUrl
//          (cleanTrackedUrl), referrer (no query/fragment), utm { source, medium, campaign, term, content } from u, userAgent ≤ 200,
//          ipHash = ipHashFor(ip, now) + ONE CONSENT event · decline ⇒ ZERO rows (and if the visitor had sessions: same as revoke) ·
//          revoke ⇒ consentVersion := null on every session of that visitor in that system, no new rows
//        t "page" ⇒ PAGEVIEW event (url cleaned, title ≤ 300) + pageViews + 1 (atomic) + lastSeenAt · idle > WEB_SESSION_IDLE_MS ⇒ NEW
//          session inheriting consent + contact · t "event" ⇒ CLICK event meta { name } · t "identify" with a valid ct ticket of THIS
//          system ⇒ identify(…, by "EMAIL_CLICK") · raw e-mail/phone in the body is NEVER used to identify nor stored
//        raw IP is never stored anywhere (sessions, events, clicks, form submissions)
//      `/t/c/[token]` (C2.5's route, edited by C2.6 — controller addendum): for a counted click of an e-mail with a contact, Location =
//        appendIdentifyTicket(storedUrl, emailClickTicket(…), web domains of the e-mail's system) · every other behaviour stays C2.5's
//   D. FORMS (module forms — the facade `src/lib/modules/forms/index.ts` exports the new names)
//      `src/lib/modules/forms/spam-guard.ts`: FORM_HONEYPOT_FIELD (string) · FORM_SPAM_GUARD_DEFAULTS = { honeypot: true, minSeconds: 3,
//        perIpPerMin: 10, perFormPerMin: 120, turnstile: false } · parseSpamGuard(json) · issueFormStartToken(formId, now?) → string
//        (HMAC, key `form-start:v1:${SESSION_SECRET}`) · DB limiter keys start with `form:`
//      `submitPublicFormGuarded(token, input: { answers; hp?; st?; turnstileToken? }, meta: { ip; userAgent?; pageUrl?; referrer?;
//        utm?; visitorId? }, deps?: { turnstileVerify?: (token: string, ip: string) => Promise<boolean>; now?: Date })` →
//        { ok: true; id: string | null } | { ok: false; reason: "CLOSED" | "TOO_FAST" | "RATE_LIMITED" | "TURNSTILE" | "VALIDATION";
//        message (Thai) } — order: form active → honeypot filled ⇒ { ok: true, id: null } and NOTHING written (looks like success) →
//        st missing/forged/other form/younger than minSeconds ⇒ TOO_FAST → DB limiter per ip-hash (perIpPerMin) and per form
//        (perFormPerMin) ⇒ RATE_LIMITED → Turnstile only when spamGuard.turnstile AND env TURNSTILE_SECRET_KEY is set (read at call
//        time; deps.turnstileVerify replaces the network call) ⇒ TURNSTILE → the existing submitPublicForm path (one tx: submission +
//        event + notification) with FormSubmission.ip = ipHashFor(ip) (never raw), pageUrl = cleanTrackedUrl, referrer without query,
//        utm (only when utmCapture), webSessionId = the visitor's latest CONSENTED session in the form's CRM system (else null) ·
//        refusals write nothing (no submission, no outbox, no notification) · `submitPublicForm` itself keeps its signature/behaviour
//      `src/app/(store)/f/[token]/actions.ts` uses submitPublicFormGuarded (no in-memory checkRateLimit) · the page renders the st +
//        honeypot hidden fields · `formEmbedCode({ publicToken }, origin)` (forms facade) → snippet containing `<origin>/f/<publicToken>`;
//        when it is an iframe, `src/proxy.ts` must not send X-Frame-Options DENY for `/f/*` (still DENY elsewhere)
//   E. BRIDGE `src/lib/platform/crm-bridges/forms.ts` (C2.6 owner): target system = resolveFormCrmSystem (crmSystemId of the SAME tenant,
//      else first CRM) · leadFromBridge gets ruleId = FormDef.assignRuleId (C2.3 pick) · after the lead (v2 only): company from
//      createCompanyFromField · scoreOnSubmit ⇒ contact.score += n ONCE per submission (one CrmScoreLog refType "FormSubmission",
//      refId = submissionId, eventKey `crm.form.score#<submissionId>`) · webSessionId ⇒ identify(visitor of that session, contact,
//      "FORM") · redelivery / parallel ⇒ everything once (X4) · uiVersion 1 ⇒ the C1.8 v1 path unchanged (no score, no identify)
//   F. OUTBOX `crm.web.identified`: consumer in src/lib/outbox-consumers.ts inside `// CRM C2.6 ▸ … ◂` + label in EXACTLY ONE of
//      src/lib/automation/labels.ts / src/lib/webhooks/labels.ts
//   G. UI (v2-only; uiVersion 1 ⇒ notFound): `/crm/settings/tracking` (mockup 16 + links of mockup 11) and `/crm/settings/forms`
//      (page guard: CRM type → requireCrmV2Page → crmCan crm.tracking.manage else notFound) · nav entries in CRM_DEEP_NAV keys
//      "settings-tracking" / "settings-forms" wo "C2.6" · `src/components/crm/tracking/CrmWebTimeline.tsx` rendered on contact 360 ·
//      `src/lib/modules/crm/tracking-actions.ts` ("use server", async exports only, assertCrmV2 + crm key check) · testids (rows wo
//      "C2.6" in scripts/crm-ui-inventory.json): crm-track-web-enabled · crm-track-domain-input · crm-track-domain-add ·
//      crm-track-embed-code · crm-track-consent-text · crm-track-consent-version-bump · crm-track-retention · crm-track-save ·
//      crm-track-preview · crm-track-stats · crm-link-url · crm-link-name · crm-link-create · crm-link-row-* · crm-link-qr-* ·
//      crm-link-toggle-* · crm-link-delete-* · crm-forms-row-* · crm-forms-system-* · crm-forms-assign-* · crm-forms-score-* ·
//      crm-forms-spam-* · crm-forms-embed-* · crm-web-timeline · Thai labels: โดเมนที่อนุญาต · โค้ดฝัง · cookie consent · เวอร์ชัน ·
//      ไม่เก็บ IP เต็ม · ลิงก์ติดตาม
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// WHAT THIS FILE PROVES: S0 structure · S1–S8 of CRM-RUN (30; S3 server half + static script, S8 static) · U PERMANENT RULE (uiVersion
//   1) · X1 X3 (in-process + worker PROCESSES) X4 X5 X6 X7 X8 X9 · S9 the six holes of the controller's RULING ROUND 2 (24 Sep: B1
//   reserved field names `_sd_hp`/`_sd_st` · S1 unsigned `?v=` on the /f lane · S2 identify-ticket replay + 15-min TTL · S3 body read
//   before the size cap · S4 start-token replay + a free honeypot · N7/N10/N12) · CLEAN.
//   N/A: X2 (REST ops / AI tools of tracking are C2.11) · X10 (no private file; the identify ticket is covered under X7).
// INVENTORY (a clean run prints 87): S0 7 · S1 5 · S2 5 · S3 8 · S4 5 · S5 2 · S6 8 · S7 1 · S8 4 · S9 6 · U 5 · X1 4 · X3 5 · X4 2 ·
//   X5 1 · X6 3 · X7 10 · X8 3 · X9 2 · CLEAN 1.   `C2.6-FATAL` is printed only when the oracle itself throws.
// HOUSE RULES: SKIP guard before any DB connection · throwaway tenants swept in `finally` (every table with tenantId, 4 passes) + users
//   + ChatRateBucket rows with keys `crm:`/`form:` created during the run · no drainOutbox (own pump of OUR tenants) · EVERY outbound
//   fetch stubbed · worker processes re-invoke THIS file with `--x3-worker` · last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

const TRACK = "src/lib/modules/crm/tracking.ts";
const TRACK_SH = "src/lib/modules/crm/tracking-shared.ts";
const TRACK_ACT = "src/lib/modules/crm/tracking-actions.ts";
const CRM_INDEX = "src/lib/modules/crm/index.ts";
const SPAM = "src/lib/modules/forms/spam-guard.ts";
const FORMS_SVC = "src/lib/modules/forms/service.ts";
const FORMS_INDEX = "src/lib/modules/forms/index.ts";
const FORM_ACTION = "src/app/(store)/f/[token]/actions.ts";
const BR_FORMS = "src/lib/platform/crm-bridges/forms.ts";
const CONS_FILE = "src/lib/outbox-consumers.ts";
const LABELS = ["src/lib/automation/labels.ts", "src/lib/webhooks/labels.ts"];
const R_LINK = "src/app/l/[code]/route.ts";
const R_SCRIPT = "src/app/t/s/[script]/route.ts";
const R_E = "src/app/t/e/route.ts";
const R_CONSENT = "src/app/t/consent/route.ts";
const R_O = "src/app/t/o/[token]/route.ts";
const R_C = "src/app/t/c/[token]/route.ts";
const MEMBER_PIXEL = "src/app/api/m/track/o/[token]/route.ts";
const NAV = "src/lib/modules/crm/nav.ts";
const INVENTORY = "scripts/crm-ui-inventory.json";
const CRM_PAGES = "src/app/app/sys/[id]/crm";
const P_TRACK = `${CRM_PAGES}/settings/tracking/page.tsx`;
const P_FORMS = `${CRM_PAGES}/settings/forms/page.tsx`;
const UI_DIR = "src/components/crm/tracking";
const TIMELINE = `${UI_DIR}/CrmWebTimeline.tsx`;
const SCHEMA_DIR = "prisma/schema";
const THIS_FILE = "scripts/qc-crm-c2.6.mts";
const BASE = "https://shark.in.th";
const DAY = 86_400_000;

const ARGV = process.argv.slice(2);
const WORKER_AT = ARGV.indexOf("--x3-worker");
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
// SKIP guard — C2.6 not built or C2.0 tables absent ⇒ SKIPPED, no DB connection opened.
// ═══════════════════════════════════════════════════════════════════════════════════
const BUILT = existsSync(TRACK);
const schemaAll = existsSync(SCHEMA_DIR) ? readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".prisma")).map((f) => read(join(SCHEMA_DIR, f))).join("\n") : "";
const C20 = /model\s+CrmWebSession\s*\{/.test(schemaAll) && (existsSync("prisma/migrations") ? readdirSync("prisma/migrations").some((d) => /_crm_v2_b$/.test(d)) : false);
if (WORKER_AT < 0 && !FORCE && (!BUILT || !C20)) {
  const why = !BUILT ? `WO C2.6 not built yet (${TRACK} missing)` : "prerequisite C2.0 absent: model CrmWebSession / prisma/migrations/*_crm_v2_b not in the tree";
  console.log(`⚠️  SKIPPED — ${why} (run with --force-run to exercise the fixtures, the workers and the cleanup)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

// 🔴 Next's `app-render/async-local-storage.js` captures `globalThis.AsyncLocalStorage` **at module load time** and
//    otherwise installs a fake store that can never hold a request scope. It must be installed HERE — before the first
//    import that pulls a Next internal in — or `headers()`/`cookies()` inside a server action are unreachable (S9.2).
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();

// ─── nothing reaches the network (set AFTER loadQcEnv so the fakes win) ───
process.env.RESEND_API_KEY = "re_qc_c26_fake";
delete process.env.TURNSTILE_SECRET_KEY;
for (const k of Object.keys(process.env)) if (/^(OPENROUTER|OPENAI|ANTHROPIC|SHARK_AI_KEY|AI_API_KEY)/.test(k)) delete process.env[k];
const FETCHES: { url: string; body: string }[] = [];
let resendSeq = 0;
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  const body = typeof init?.body === "string" ? init.body : "";
  FETCHES.push({ url, body });
  if (/resend\.com/.test(url)) return new Response(JSON.stringify({ id: `re_qc_c26_${++resendSeq}` }), { status: 200, headers: { "content-type": "application/json" } });
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

/** route params: every plausible param name gets the same segment (the contract names are code / script / token) */
const params = (seg: string) => ({ params: Promise.resolve({ code: seg, script: seg, token: seg, file: seg }) });
const uaHuman = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

// ═══════════════════════════════════════════════════════════════════════════════════
// X3 WORKER MODE — this file re-invoked as a child process (own PrismaClient = own pool, synchronised start).
//   argv: --x3-worker <mode> <startAtMs> <base64url(JSON arg)>
//     click : { code, n, ipBase }                 → n parallel GET /l/<code> without cookie (distinct IPs) → statuses
//     page  : { siteKey, visitorId, cv, origin, url, n, ipBase } → n parallel tracking.collect(page, meta, { limiter: always ok })
// ═══════════════════════════════════════════════════════════════════════════════════
if (WORKER_AT >= 0) {
  const [mode, wStart, wArg] = ARGV.slice(WORKER_AT + 1);
  const arg = JSON.parse(Buffer.from(String(wArg), "base64url").toString("utf8"));
  const PW = ((await import("@/lib/core/db")) as Any).prisma as Any;
  const waitMs = Number(wStart) - Date.now();
  if (waitMs > 0) await new Promise<void>((r) => setTimeout(r, waitMs));
  const out: string[] = [];
  const err = (e: unknown) => `ERR:${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`;
  if (mode === "click") {
    const RL = (await import("@/app/l/[code]/route" as string).catch(() => ({}))) as Any;
    out.push(...(await Promise.all(Array.from({ length: Number(arg.n) }, async (_x, i) => {
      try {
        if (typeof RL.GET !== "function") return "ERR:GET missing";
        const r: Response = await RL.GET(new Request(`${BASE}/l/${arg.code}`, { headers: { "user-agent": uaHuman, "x-forwarded-for": `${arg.ipBase}.${i + 1}` } }), params(arg.code));
        return String(r.status);
      } catch (e) { return err(e); }
    }))));
  } else if (mode === "page") {
    const TW = (await import("@/lib/modules/crm/tracking" as string).catch(() => ({}))) as Any;
    out.push(...(await Promise.all(Array.from({ length: Number(arg.n) }, async (_x, i) => {
      try {
        if (typeof TW.collect !== "function") return "ERR:collect missing";
        await TW.collect({ k: arg.siteKey, v: arg.visitorId, cv: arg.cv, t: "page", u: `${arg.url}?p=${i}`, ti: `หน้า ${i}` },
          { origin: arg.origin, ip: `${arg.ipBase}.${(i % 250) + 1}`, userAgent: uaHuman, bytes: 200 }, { limiter: async () => ({ ok: true }) });
        return "OK";
      } catch (e) { return err(e); }
    }))));
  }
  console.log(`X3WORKER ${JSON.stringify(out)}`);
  await PW.$disconnect();
  process.exit(0);
}

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
const j = (v: Any): string => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x)) ?? "undefined";
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
const isV1Refusal = (r: Res, msg: string) => !r.ok && r.code !== "MISSING_FUNCTION" && (r.name === "CrmV2DisabledError" || r.code === "CRM_V2_DISABLED" || (!!msg && r.msg === msg));
const rd = (r: Res) => (r.ok ? "ok" : r.err);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const thaiYmd = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const b64dec = (s: string) => { try { return Buffer.from(s.replace(/[^A-Za-z0-9_-]/g, ""), "base64url").toString("latin1"); } catch { return ""; } };

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c26-${rand}`;
const RUN_START = new Date(Date.now() - 5_000);
out(`\n═══ QC CRM v2 · C2.6 — tracking (links · shark.js + consent · identify · purge · forms spam guard) ═══`);
out(`[env] DB ${host} · tag ${TAG}${FORCE && (!BUILT || !C20) ? ` · --force-run with ${!BUILT ? "C2.6 ABSENT" : "C2.0 tables ABSENT"} (C2.6 checks expected red; controls + CLEAN green)` : ""}\n`);

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TENANTS: string[] = [];
const USERS: string[] = [];
const PII: string[] = [];
const pii = <T extends string>(s: T): T => { PII.push(s); return s; };
let seq = 0;
const nx = () => `${++seq}`;
let ipSeq = 0;
/** a fresh fake client IP per call (keeps DB limiter buckets of different checks apart) */
const ipNew = () => { ipSeq += 1; return `10.${26 + (ipSeq >> 16)}.${(ipSeq >> 8) & 255}.${ipSeq & 255}`; };
const RAW_IPS: string[] = [];
const ipTracked = () => { const ip = ipNew(); RAW_IPS.push(ip); return ip; };
const phoneOf = (): string => pii(`08${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`);
const mailOf = (s: string) => pii(`${TAG}-${s}@qc-crm.example`);
const DOM_A = `shop-${rand}.example.com`;
const DOM_A2 = `b2b-${rand}.example.com`;
const DOM_B = `other-${rand}.example.com`;
const DOM_V = `v1-${rand}.example.com`;
const OR_A = `https://${DOM_A}`;
const OR_A2 = `https://${DOM_A2}`;
const OR_B = `https://${DOM_B}`;
const OR_V = `https://${DOM_V}`;

try {
  // ═════════════════════════════════════════════════════════════════════════════
  // modules (dynamic — they may not exist yet)
  // ═════════════════════════════════════════════════════════════════════════════
  const TR = (await import("@/lib/modules/crm/tracking" as string).catch(() => ({}))) as Any;
  const TSH = (await import("@/lib/modules/crm/tracking-shared" as string).catch(() => ({}))) as Any;
  const SG = (await import("@/lib/modules/forms/spam-guard" as string).catch(() => ({}))) as Any;
  const FORMS = (await import("@/lib/modules/forms/service" as string).catch(() => ({}))) as Any;
  const FORMS_F = (await import("@/lib/modules/forms" as string).catch(() => ({}))) as Any;
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => ({}))) as Any;
  const EM = (CRM.emails ?? (await import("@/lib/modules/crm/emails" as string).catch(() => ({})))) as Any;
  const OBX = (await import("@/lib/outbox-consumers" as string).catch(() => ({}))) as Any;
  const UIV = (await import("@/lib/modules/crm/ui-version" as string).catch(() => ({}))) as Any;
  const RL = (await import("@/app/l/[code]/route" as string).catch(() => ({}))) as Any;
  const RS = (await import("@/app/t/s/[script]/route" as string).catch(() => ({}))) as Any;
  const RE = (await import("@/app/t/e/route" as string).catch(() => ({}))) as Any;
  const RC = (await import("@/app/t/consent/route" as string).catch(() => ({}))) as Any;
  const RO = (await import("@/app/t/o/[token]/route" as string).catch(() => ({}))) as Any;
  const RCL = (await import("@/app/t/c/[token]/route" as string).catch(() => ({}))) as Any;
  const PROXY = (await import("@/proxy" as string).catch(() => ({}))) as Any;
  const NEXT_SERVER = (await import("next/server" as string).catch(() => ({}))) as Any;
  const CONS: Any = OBX.consumers ?? {};
  const V1MSG: string = UIV.CRM_V2_DISABLED_MSG ?? "";
  const LIM: Any = TSH.TRACKING_RATE_LIMITS ?? {};
  const MAXB: number = Number(TSH.TRACKING_PAYLOAD_MAX_BYTES ?? 8192);
  const FALLBACK: string = String(TSH.LINK_FALLBACK_URL ?? "https://shark.in.th/");
  const HP: string = String(SG.FORM_HONEYPOT_FIELD ?? "website");

  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — structure
  // ═════════════════════════════════════════════════════════════════════════════
  out("── S0 · structure ──");
  const trSrc = read(TRACK);
  const shSrc = read(TRACK_SH);
  const consSrc = read(CONS_FILE);
  const brSrc = read(BR_FORMS);
  const spamSrc = read(SPAM);
  const routeSrc = [R_LINK, R_SCRIPT, R_E, R_CONSENT].map(read);
  {
    const need = ["createLink", "updateLink", "deleteLink", "listLinks", "linkStats", "linkQrSvg", "getWebSettings", "saveWebSettings", "webStats",
      "webTimeline", "listFormTargets", "saveFormTarget", "resolveSite", "collect", "recordConsent", "identify", "purgeWeb", "ipHashFor",
      "emailClickTicket", "appendIdentifyTicket"];
    const missing = need.filter((f) => typeof TR?.[f] !== "function");
    chk("C2.6-S0.1", `tracking.ts exports the ${need.length} contract functions · crm/index.ts \`export * as tracking\` (same bindings)`,
      trSrc.length > 0 && missing.length === 0 && /export\s+\*\s+as\s+tracking\s+from\s+["']\.\/tracking["']/.test(read(CRM_INDEX)) && CRM?.tracking?.collect === TR.collect,
      "all + facade", `exists=${trSrc.length > 0} missing=${missing.join(",") || "-"} facade=${CRM?.tracking?.collect === TR.collect}`);
  }
  {
    const impure = /from\s+["'](@prisma\/client|@\/lib\/core\/db|next\/[^"']+|server-only|\.\/db|\.\/tracking)["']/.test(shSrc);
    const limOk = ["collectPerIp", "collectPerSite", "consentPerIp", "linkPerIp"].every((k) => Number(LIM?.[k]?.limit) > 0 && Number(LIM?.[k]?.windowMs) > 0);
    const perMin = (x: Any) => (Number(x?.limit) * 60_000) / Math.max(1, Number(x?.windowMs));
    const ok = shSrc.length > 0 && !impure && TSH.TRACKING_PAYLOAD_MAX_BYTES === 8192 && TSH.VISITOR_COOKIE === "sd_vid" && TSH.CONSENT_COOKIE === "sd_consent" &&
      TSH.VISITOR_COOKIE_MAX_AGE_SEC === 15_552_000 && TSH.WEB_SESSION_IDLE_MS === 1_800_000 && TSH.IDENTIFY_LOOKBACK_DAYS === 180 &&
      TSH.IDENTIFY_TICKET_TTL_MS === 3_600_000 && TSH.LINK_CODE_RE instanceof RegExp && TSH.LINK_FALLBACK_URL === "https://shark.in.th/" && limOk &&
      Number(LIM.collectPerIp.limit) >= 10 && Number(LIM.collectPerIp.limit) <= 1000 && perMin(LIM.collectPerSite) >= 1000 &&
      ["isBotUserAgent", "cleanTrackedUrl", "normalizeDomain", "originAllowed"].every((f) => typeof TSH[f] === "function");
    chk("C2.6-S0.2", "tracking-shared.ts is pure and exports the constants (8192 · sd_vid/sd_consent · 180 d · 30 min idle · 1 h ticket · fallback) + TRACKING_RATE_LIMITS (per-IP 10..1000 · per-site ≥ 1000/min) + 4 helpers",
      ok, "constants", `exists=${shSrc.length > 0} pure=${!impure} lim=${j(LIM)} max=${TSH.TRACKING_PAYLOAD_MAX_BYTES} idle=${TSH.WEB_SESSION_IDLE_MS}`);
  }
  {
    const has = (src: string, m: string) => new RegExp(`export\\s+(async\\s+)?(function|const)\\s+${m}\\b`).test(src);
    const ok = has(routeSrc[0], "GET") && has(routeSrc[1], "GET") && has(routeSrc[2], "POST") && has(routeSrc[2], "OPTIONS") && has(routeSrc[3], "POST") && has(routeSrc[3], "OPTIONS") &&
      routeSrc.every((s) => /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/.test(s)) && !routeSrc.some((s) => /from\s+["']next\/headers["']/.test(s)) &&
      typeof RL.GET === "function" && typeof RS.GET === "function" && typeof RE.POST === "function" && typeof RC.POST === "function";
    chk("C2.6-S0.3", "public routes /l/[code] GET · /t/s/[script] GET · /t/e POST+OPTIONS · /t/consent POST+OPTIONS exist, force-dynamic, never import next/headers (cookies from the Request) [static+import]",
      ok, "4 routes", routeSrc.map((s, i) => `${[R_LINK, R_SCRIPT, R_E, R_CONSENT][i]}:${s.length > 0}`).join(" "));
  }
  {
    const inBlock = /CRM C2\.6 ▸[\s\S]*?"crm\.web\.identified"[\s\S]*?◂/.test(consSrc) && typeof CONS["crm.web.identified"] === "function";
    const decl = LABELS.filter((f) => /["']crm\.web\.identified["']/.test(read(f)));
    chk("C2.6-S0.4", "outbox: crm.web.identified has a consumer inside `// CRM C2.6 ▸ … ◂` and a label in EXACTLY ONE registry",
      inBlock && decl.length === 1, "consumer + 1 label", `consumer=${inBlock} labels=${decl.join(",") || "-"}`);
  }
  {
    const src = [trSrc, shSrc, brSrc, spamSrc, ...routeSrc].join("\n");
    const miss = ["X1", "X3", "X4", "X5", "X6", "X7", "X8", "X9"].filter((x) => !new RegExp(`AUDIT-CLASS ${x}\\b`).test(src));
    chk("C2.6-S0.5", "implementation sites marked `// AUDIT-CLASS X1 X3 X4 X5 X6 X7 X8 X9` across tracking*.ts · forms bridge · spam-guard · routes [static]", miss.length === 0, "8 markers", miss.join(",") || "-", "MINOR");
  }
  {
    const act = read(FORM_ACTION);
    const memberPixelSame = /\/api\/m\/track\/o|trackOpen/.test(read(MEMBER_PIXEL)) && !/crm\/tracking/.test(read(MEMBER_PIXEL));
    chk("C2.6-S0.6", "form action uses submitPublicFormGuarded (no in-memory checkRateLimit left) · submitPublicForm still exported · member campaign pixel /api/m/track/o untouched (no CRM tracking import) [static]",
      /submitPublicFormGuarded/.test(act) && !/checkRateLimit\s*\(/.test(act) && typeof FORMS.submitPublicForm === "function" && typeof FORMS.submitPublicFormGuarded === "function" && memberPixelSame,
      "guarded action", `guarded=${/submitPublicFormGuarded/.test(act)} inMemory=${/checkRateLimit\s*\(/.test(act)} fn=${typeof FORMS.submitPublicFormGuarded} memberPixel=${memberPixelSame}`);
  }
  chk("C2.6-S0.7", "ticket/HMAC compares are timing-safe (timingSafeEqual / safeEqualHex) and keys are domain-separated (`crm-identify:v1:` · `crm-ip:v1:` · `form-start:v1:`) [static]",
    /timingSafeEqual|safeEqualHex/.test(trSrc + spamSrc) && /crm-identify:v1:/.test(trSrc) && /crm-ip:v1:/.test(trSrc) && /form-start:v1:/.test(spamSrc),
    "timing-safe + labels", `ts=${/timingSafeEqual|safeEqualHex/.test(trSrc + spamSrc)} id=${/crm-identify:v1:/.test(trSrc)} ip=${/crm-ip:v1:/.test(trSrc)} st=${/form-start:v1:/.test(spamSrc)}`, "MAJOR");

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — throwaway tenants: A (crmA web+links · crmA2 forms target, retention 30) · B (foreign) · V (uiVersion 1)
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
  const STAFF_PERMS = { "crm.contact.read": true, "crm.contact.create": true, "crm.activity.read": true };
  const mkTenant = async (suffix: string) => {
    const t = await P.tenant.create({ data: { name: `${TAG}-${suffix}`, slug: `${TAG}-${suffix}` } });
    TENANTS.push(t.id);
    const m = (userId: string, role: string, permissions: Record<string, unknown>) =>
      P.membership.create({ data: { userId, tenantId: t.id, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } });
    await m(userA, "OWNER", {});
    await m(userM, "MANAGER", {});
    await m(userS, "STAFF", STAFF_PERMS);
    return t.id as string;
  };
  const mk = async (tid: string, type: string, label: string) => (await sysSvc.createSystem(tid, type, `${label} ${TAG}`)).id as string;
  const setCrm = (sysId: string, obj: Record<string, unknown>) =>
    P.$executeRawUnsafe(
      `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
        (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
      JSON.stringify(obj), sysId);
  const crmSettings = async (sysId: string) => ((await P.appSystem.findFirst({ where: { id: sysId } }))?.settings?.crm ?? {}) as Any;
  const owner = { userId: userA, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> };
  const manager = { userId: userM, role: "MANAGER", unitAccess: ["*"] as string[], permissions: {} as Record<string, unknown> };
  const staff = { userId: userS, role: "STAFF", unitAccess: ["*"] as string[], permissions: STAFF_PERMS as Record<string, unknown> };

  const tidA = await mkTenant("a");
  const crmA = await mk(tidA, "CRM", "CRM");
  const crmA2 = await mk(tidA, "CRM", "CRM B2B");
  const tidB = await mkTenant("b");
  const crmB = await mk(tidB, "CRM", "CRM-B");
  const tidV = await mkTenant("v1");
  const crmV = await mk(tidV, "CRM", "CRM-V1");
  {
    const a = await P.appSystem.findFirst({ where: { id: crmA } });
    await P.appSystem.update({ where: { id: crmA2 }, data: { createdAt: new Date(new Date(a.createdAt).getTime() + 1000) } });
  }
  for (const s of [crmA, crmA2, crmB]) await setCrm(s, { uiVersion: 2, bridgesEnabled: true });
  await setCrm(crmV, { uiVersion: 1, bridgesEnabled: true });
  const cA = { tenantId: tidA, systemId: crmA, actorUserId: userA };
  const cA2 = { tenantId: tidA, systemId: crmA2, actorUserId: userA };
  const cB = { tenantId: tidB, systemId: crmB, actorUserId: userA };
  const cV = { tenantId: tidV, systemId: crmV, actorUserId: userA };

  // web settings through the service (fallback: raw settings so the fixtures still exist in --force-run)
  const CONSENT_TXT = `เว็บไซต์นี้ใช้คุกกี้เพื่อจดจำการเข้าชม ${TAG}`;
  const SITE: Record<string, string> = {};
  const FIXTURE_NOTES: string[] = [];
  const enableWeb = async (c: Any, sysId: string, domains: string[], retentionDays: number) => {
    const r = await call(TR.saveWebSettings, c, owner, { enabled: true, domains, consentText: CONSENT_TXT, retentionDays });
    let key = String(r.v?.siteKey ?? "");
    if (!r.ok || !key) {
      key = `${TAG}-${sysId.slice(-6)}`;
      await setCrm(sysId, { tracking: { web: { enabled: true, domains, consentText: CONSENT_TXT, consentVersion: 1, retentionDays, siteKey: key } } });
      FIXTURE_NOTES.push(`saveWebSettings(${sysId}) ${rd(r)} → raw settings`);
    }
    SITE[sysId] = key;
    return r;
  };
  const wsA = await enableWeb(cA, crmA, [DOM_A], 180);
  await enableWeb(cA2, crmA2, [DOM_A2], 30);
  await enableWeb(cB, crmB, [DOM_B], 180);
  const KEY_V = `${TAG}-v1key`;
  await setCrm(crmV, { tracking: { web: { enabled: true, domains: [DOM_V], consentText: CONSENT_TXT, consentVersion: 1, retentionDays: 180, siteKey: KEY_V } } });
  SITE[crmV] = KEY_V;
  if (FIXTURE_NOTES.length) out(`  ℹ️  ${FIXTURE_NOTES.join(" · ")}`);

  // ─── contacts / parties ───
  type Ct = { id: string; partyId: string; email: string; name: string };
  const mkParty = async (tid: string, name: string) => (await P.party.create({ data: { tenantId: tid, name, kind: "PERSON" } })).id as string;
  const rawContact = async (tid: string, sys: string, label: string, ownerUserId: string, extra: Record<string, unknown> = {}): Promise<Ct> => {
    const name = pii(`${label} ${TAG}-${nx()}`);
    const email = mailOf(`c${nx()}`);
    const pid = await mkParty(tid, name);
    const row = await P.crmContact.create({ data: { tenantId: tid, systemId: sys, name, firstName: name, phone: phoneOf(), email, partyId: pid, ownerUserId, ...extra } });
    return { id: row.id as string, partyId: pid, email, name };
  };

  // ─── HTTP helpers (route handlers invoked with plain Requests — no server) ───
  type HttpRes = { status: number; h: Headers; text: string };
  const toRes = async (r: Any): Promise<HttpRes> => {
    if (!r || typeof r.status !== "number") return { status: -1, h: new Headers(), text: `NO_RESPONSE ${cut(String(r))}` };
    let text = "";
    try { text = await r.text(); } catch { text = ""; }
    return { status: r.status, h: r.headers as Headers, text };
  };
  const httpErr = (e: unknown): HttpRes => ({ status: -2, h: new Headers(), text: `THROW ${e instanceof Error ? e.message : String(e)}` });
  const hdrs = (o: { origin?: string | null; ip?: string; ua?: string; cookie?: string; ctype?: string }) => {
    const h = new Headers({ "user-agent": o.ua ?? uaHuman, "x-forwarded-for": o.ip ?? ipNew() });
    if (o.origin) h.set("origin", o.origin);
    if (o.cookie) h.set("cookie", o.cookie);
    if (o.ctype !== undefined) h.set("content-type", o.ctype);
    return h;
  };
  const postTo = async (mod: Any, path: string, body: unknown, o: { origin?: string | null; ip?: string; ua?: string; raw?: string; ctype?: string } = {}): Promise<HttpRes> => {
    try {
      if (typeof mod?.POST !== "function") return { status: -1, h: new Headers(), text: "POST missing" };
      const raw = o.raw ?? JSON.stringify(body);
      return await toRes(await mod.POST(new Request(`${BASE}${path}`, { method: "POST", headers: hdrs({ ...o, ctype: o.ctype ?? "text/plain;charset=UTF-8" }), body: raw })));
    } catch (e) { return httpErr(e); }
  };
  const postE = (body: unknown, o: Parameters<typeof postTo>[3] = {}) => postTo(RE, "/t/e", body, o);
  const postC = (body: unknown, o: Parameters<typeof postTo>[3] = {}) => postTo(RC, "/t/consent", body, o);
  const options = async (mod: Any, path: string, origin: string): Promise<HttpRes> => {
    try {
      if (typeof mod?.OPTIONS !== "function") return { status: -1, h: new Headers(), text: "OPTIONS missing" };
      const h = hdrs({ origin });
      h.set("access-control-request-method", "POST");
      h.set("access-control-request-headers", "content-type");
      return await toRes(await mod.OPTIONS(new Request(`${BASE}${path}`, { method: "OPTIONS", headers: h })));
    } catch (e) { return httpErr(e); }
  };
  const getLink = async (code: string, o: { cookie?: string; ip?: string; ua?: string; query?: string } = {}): Promise<HttpRes> => {
    try {
      if (typeof RL?.GET !== "function") return { status: -1, h: new Headers(), text: "GET missing" };
      return await toRes(await RL.GET(new Request(`${BASE}/l/${encodeURIComponent(code)}${o.query ?? ""}`, { headers: hdrs(o) }), params(code)));
    } catch (e) { return httpErr(e); }
  };
  const getScript = async (key: string): Promise<HttpRes> => {
    try {
      if (typeof RS?.GET !== "function") return { status: -1, h: new Headers(), text: "GET missing" };
      const seg = `${key}.js`;
      return await toRes(await RS.GET(new Request(`${BASE}/t/s/${encodeURIComponent(seg)}`, { headers: hdrs({}) }), params(seg)));
    } catch (e) { return httpErr(e); }
  };
  const loc = (r: HttpRes) => r.h.get("location") ?? "";
  // ORACLE-EDIT (controller · 24 Sep): a Location header is a ByteString — a stored URL with Thai characters must be sent percent-encoded (RFC 3986;
  //   `new Response(…, {headers:{location: URL1}})` throws for char > 0xFF). The stored url stays byte-exact (S1.1); the header may equal encodeURI(url).
  const locEq = (r: HttpRes, url: string) => { const l = loc(r); return l === url || l === encodeURI(url); };
  const acao = (r: HttpRes) => r.h.get("access-control-allow-origin");
  const is204Empty = (r: HttpRes) => r.status === 204 && r.text === "";

  // ─── DB readers (Any — the C2.0 models may be absent from this Prisma client in --force-run) ───
  const safeMany = async (model: string, args: Any): Promise<Any[]> => { try { return (await P[model]?.findMany?.(args)) ?? []; } catch { return []; } };
  const sessionsOf = (tid: string, visitorId: string) => safeMany("crmWebSession", { where: { tenantId: tid, visitorId }, orderBy: [{ startedAt: "asc" }, { id: "asc" }] });
  const eventsOfSessions = async (ids: string[]) => (ids.length ? safeMany("crmWebEvent", { where: { sessionId: { in: ids } } }) : []);
  const visitorRows = async (tid: string, visitorId: string) => {
    const s = await sessionsOf(tid, visitorId);
    const e = await eventsOfSessions(s.map((x) => x.id));
    return { s, e, pv: e.filter((x) => x.kind === "PAGEVIEW").length, pageViews: s.reduce((n, x) => n + Number(x.pageViews ?? 0), 0) };
  };
  const vid = () => randomUUID();
  const CV: Record<string, number> = {};
  const pageBody = (sys: string, v: string, u: string, extra: Record<string, unknown> = {}) => ({ k: SITE[sys], v, cv: CV[sys] ?? 1, t: "page", u, ti: `หน้า ${TAG}`, ...extra });
  const consentBody = (sys: string, v: string, d: string, u: string, cv?: number) => ({ k: SITE[sys], v, cv: cv ?? CV[sys] ?? 1, d, u });
  /** accept consent then N page views from an allowed origin (returns the responses) */
  const acceptAndBrowse = async (sys: string, origin: string, v: string, pages: string[], ip?: string) => {
    const rs: HttpRes[] = [await postC(consentBody(sys, v, "accept", `${origin}/`), { origin, ip })];
    for (const u of pages) rs.push(await postE(pageBody(sys, v, u), { origin, ip }));
    return rs;
  };
  const evtOf = (row: Any) => ({ id: row.id, tenantId: row.tenantId, type: row.type, payload: row.payload, systemId: row.systemId, unitId: row.unitId, idempotencyKey: row.idempotencyKey });
  const consume = (evt: Any) => call(CONS?.[evt?.type], evt);
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
  const identifiedEvents = async (tid: string, contactId: string) =>
    ((await P.outboxEvent.findMany({ where: { tenantId: tid, type: "crm.web.identified" } })) as Any[]).filter((e) => j(e.payload).includes(contactId));
  const webActivities = async (contactId: string) => (await P.crmActivity.findMany({ where: { contactId, type: "WEB" } })) as Any[];

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — tracked links: create · 302 · counters · QR
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── S1 · tracked links ──");
  const linkRow = async (id: string) => { try { return (await P.crmTrackedLink?.findFirst?.({ where: { id } })) ?? null; } catch { return null; } };
  const clickRows = (linkId: string) => safeMany("crmTrackedClick", { where: { linkId } });
  const URL1 = `https://${DOM_A}/promo/ดำน้ำ?x=1&utm_source=line`;
  const cl1 = await call(TR.createLink, cA, owner, { url: URL1, name: `ลิงก์ทดสอบ ${TAG}`, channel: "LINE" });
  const L1: Any = cl1.v ?? {};
  const L1row: Any = L1.id ? await linkRow(L1.id) : null;
  {
    const auditN = L1.id ? await P.auditLog.count({ where: { tenantId: tidA, action: "crm.tracking.link.create", targetId: L1.id } }) : 0;
    chk("C2.6-S1.1", "createLink → LinkDto { id, code (≥ 8 chars, LINK_CODE_RE), url stored byte-exact, shortUrl …/l/<code>, clicks 0 } · row in THIS system/tenant · audit crm.tracking.link.create",
      cl1.ok && typeof L1.code === "string" && L1.code.length >= 8 && (!(TSH.LINK_CODE_RE instanceof RegExp) || TSH.LINK_CODE_RE.test(L1.code)) &&
        String(L1.shortUrl ?? "").endsWith(`/l/${L1.code}`) && L1row?.url === URL1 && L1row?.systemId === crmA && L1row?.tenantId === tidA && L1row?.clicks === 0 && auditN === 1,
      "created", `${rd(cl1)} dto=${cut(j(L1), 200)} row=${cut(j(L1row), 160)} audit=${auditN}`);
  }
  const code1: string = String(L1.code ?? `${TAG}-missing`);
  const ipL = ipTracked();
  const g1 = await getLink(code1, { ip: ipL });
  const afterG1: Any = L1.id ? await linkRow(L1.id) : null;
  {
    const sc = g1.h.get("set-cookie") ?? "";
    chk("C2.6-S1.2", "GET /l/<code> → 302 Location = the stored url (byte-exact) · Cache-Control no-store · empty body · Set-Cookie sd_u=1 Path=/l/<code> HttpOnly Secure · ONE click row · clicks 1 · uniqueClicks 1",
      g1.status === 302 && locEq(g1, URL1) && /no-store/.test(g1.h.get("cache-control") ?? "") && g1.text === "" &&
        /sd_u=1/.test(sc) && new RegExp(`Path=/l/${code1}`, "i").test(sc) && /HttpOnly/i.test(sc) && /Secure/i.test(sc) &&
        afterG1?.clicks === 1 && afterG1?.uniqueClicks === 1 && (await clickRows(L1.id ?? "-")).length === 1,
      "302 + counted", `status=${g1.status} loc=${cut(loc(g1), 120)} cc=${g1.h.get("cache-control")} cookie=${cut(sc, 120)} row=${afterG1?.clicks}/${afterG1?.uniqueClicks} body=${cut(g1.text, 60)}`);
  }
  const g2 = await getLink(code1, { ip: ipNew(), cookie: "sd_u=1" });
  const gBot = await getLink(code1, { ip: ipNew(), ua: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)" });
  const afterG2: Any = L1.id ? await linkRow(L1.id) : null;
  const st1 = await call(TR.linkStats, cA, owner, L1.id ?? "-", { days: 7 });
  {
    const today = thaiYmd(new Date());
    const byDay = Array.isArray(st1.v?.byDay) ? st1.v.byDay : [];
    const todayN = Number(byDay.find((d: Any) => String(d?.date ?? "").slice(0, 10) === today)?.clicks ?? -1);
    chk("C2.6-S1.3", "repeat click WITH the sd_u cookie ⇒ clicks 2, uniqueClicks stays 1 · bot UA ⇒ same 302 to the stored url, nothing counted · linkStats { clicks 2, uniqueClicks 1, byDay today 2 }",
      g2.status === 302 && locEq(g2, URL1) && gBot.status === 302 && locEq(gBot, URL1) && afterG2?.clicks === 2 && afterG2?.uniqueClicks === 1 &&
        st1.ok && st1.v?.clicks === 2 && st1.v?.uniqueClicks === 1 && todayN === 2,
      "2/1", `g2=${g2.status} bot=${gBot.status}/${cut(loc(gBot), 60)} row=${afterG2?.clicks}/${afterG2?.uniqueClicks} stats=${cut(j(st1.v ?? st1.err), 160)}`);
  }
  {
    const qr = await call(TR.linkQrSvg, cA, owner, L1.id ?? "-");
    const svg = String(qr.v ?? "");
    chk("C2.6-S1.4", "linkQrSvg → an <svg> (with drawing elements) and no <script> / on*= handlers",
      qr.ok && /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/.test(svg) && /<(path|rect)\b/.test(svg) && !/<script/i.test(svg) && !/\son[a-z]+\s*=/i.test(svg),
      "svg", `${rd(qr)} ${cut(svg, 100)}`, "MAJOR");
  }
  const customCode = `promo-${rand}`;
  const clCustom = await call(TR.createLink, cA, owner, { url: `https://${DOM_A}/c`, name: "custom", code: customCode });
  const clTaken = await call(TR.createLink, cB, owner, { url: `https://${DOM_B}/c`, name: "taken", code: customCode });
  chk("C2.6-S1.5", "custom code (mockup 11 `/l/b2b-sep`) accepted as given · the SAME code in another tenant ⇒ VALIDATION Thai (codes are globally unique), nothing written",
    clCustom.ok && clCustom.v?.code === customCode && refused(clTaken, "VALIDATION") && (await safeMany("crmTrackedLink", { where: { tenantId: tidB } })).length === 0,
    "unique", `custom=${rd(clCustom)} taken=${rd(clTaken)}`, "MAJOR");

  // ═════════════════════════════════════════════════════════════════════════════
  // X6 — dangerous link input · redirect never influenced by the request
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── X6 · link url / redirect ──");
  {
    const bad = ["javascript:alert(1)", " JavaScript:alert(1)", "java\tscript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)",
      "//evil.test/x", "http:/\\evil.test", "https:///nohost", "ftp://files.test/x", `https://${DOM_A}/${"x".repeat(2100)}`, "mailto:a@b.test", ""];
    const before = (await safeMany("crmTrackedLink", { where: { tenantId: tidA } })).length;
    const rs = [] as Res[];
    for (const url of bad) rs.push(await call(TR.createLink, cA, owner, { url, name: "bad" }));
    const upd = await call(TR.updateLink, cA, owner, L1.id ?? "-", { url: "javascript:alert(document.cookie)" });
    const after = (await safeMany("crmTrackedLink", { where: { tenantId: tidA } })).length;
    const okHttp = await call(TR.createLink, cA, owner, { url: "http://plain.example.com/x", name: "http ok" });
    const L1now: Any = L1.id ? await linkRow(L1.id) : null;
    chk("C2.6-X6.1", `createLink/updateLink refuse ${bad.length} non-http(s)/malformed/over-long urls (javascript: with case/whitespace tricks, data:, vbscript:, //host, http:/\\, no host, ftp:, > 2048, mailto:, empty) with VALIDATION Thai, nothing written · plain http accepted (positive control)`,
      rs.every((r) => refused(r, "VALIDATION")) && refused(upd, "VALIDATION") && after === before && L1now?.url === URL1 && okHttp.ok,
      "all refused", `${rs.map((r, i) => (refused(r, "VALIDATION") ? "" : `#${i}:${rd(r)}`)).filter(Boolean).join(" ") || "all-refused"} upd=${rd(upd)} rows ${before}→${after} http=${rd(okHttp)}`);
  }
  {
    const qs = [`?url=https://evil.test/`, `?to=https%3A%2F%2Fevil.test`, `?redirect=//evil.test&next=https://evil.test`, `?u=javascript:alert(1)`];
    const rs: HttpRes[] = [];
    for (const q of qs) rs.push(await getLink(code1, { ip: ipNew(), cookie: "sd_u=1", query: q }));
    chk("C2.6-X6.2", "open redirect: /l/<code> with ?url= / ?to= / ?redirect= / ?next= / ?u= always redirects to the STORED url (byte-exact)",
      rs.every((r) => r.status === 302 && locEq(r, URL1)), URL1, rs.map((r) => `${r.status}:${cut(loc(r), 50)}`).join(" | "));
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X7 (links) — unknown ≡ inactive ≡ expired · no data returned
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── X7 · link public endpoint ──");
  {
    const inact = await call(TR.createLink, cA, owner, { url: `https://${DOM_A}/inactive`, name: "inactive" });
    const iid = String(inact.v?.id ?? "");
    if (iid) await call(TR.updateLink, cA, owner, iid, { active: false });
    const exp = await call(TR.createLink, cA, owner, { url: `https://${DOM_A}/expired`, name: "expired" });
    const eid = String(exp.v?.id ?? "");
    if (eid) await P.crmTrackedLink?.update?.({ where: { id: eid }, data: { expiresAt: new Date(Date.now() - DAY) } }).catch(() => null);
    const rUnknown = await getLink(`zz${rand}nope${rand}`, { ip: ipNew() });
    const rInact = await getLink(String(inact.v?.code ?? "-"), { ip: ipNew() });
    const rExp = await getLink(String(exp.v?.code ?? "-"), { ip: ipNew() });
    const sig = (r: HttpRes) => j({ s: r.status, l: loc(r), cc: r.h.get("cache-control"), sc: r.h.get("set-cookie"), b: r.text, ct: r.h.get("content-type") });
    const clicksIn = (await safeMany("crmTrackedClick", { where: { linkId: { in: [iid, eid].filter(Boolean) } } })).length;
    const rowsIE = [iid ? await linkRow(iid) : null, eid ? await linkRow(eid) : null];
    chk("C2.6-X7.1", "unknown code ≡ inactive link ≡ expired link: IDENTICAL response (302 → LINK_FALLBACK_URL, same headers, no Set-Cookie, empty body) and nothing counted",
      inact.ok && exp.ok && rUnknown.status === 302 && loc(rUnknown) === FALLBACK && sig(rUnknown) === sig(rInact) && sig(rUnknown) === sig(rExp) &&
        !rUnknown.h.get("set-cookie") && clicksIn === 0 && rowsIE.every((r: Any) => r && r.clicks === 0),
      "same fallback", `unknown=${sig(rUnknown)} inactive=${sig(rInact)} expired=${sig(rExp)} clicks=${clicksIn}`);
  }
  {
    const lim = Number(LIM?.linkPerIp?.limit ?? 0);
    const flood = await call(TR.createLink, cA, owner, { url: `https://${DOM_A}/flood`, name: "flood" });
    const fcode = String(flood.v?.code ?? "-");
    const ip = ipTracked();
    const n = lim > 0 && lim <= 500 ? lim + 4 : 0;
    const rs = n ? await Promise.all(Array.from({ length: n }, () => getLink(fcode, { ip }))) : [];
    const row: Any = flood.v?.id ? await linkRow(flood.v.id) : null;
    chk("C2.6-X7.2", `link flood from ONE ip (linkPerIp.limit + 4 = ${n} parallel): every answer is the same 302 to the stored url, but exactly linkPerIp.limit clicks are counted (DB limiter, keys \`crm:…\`)`,
      n > 0 && rs.every((r) => r.status === 302 && loc(r) === `https://${DOM_A}/flood`) && row?.clicks === lim,
      `${lim} counted`, `limit=${lim} statuses=${[...new Set(rs.map((r) => r.status))].join(",")} clicks=${row?.clicks}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — shark.js (served script, static) + consent + collect (server half; the headless half is qc-crm-c2.6-web)
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── S3 · shark.js · consent · collect ──");
  const scA = await getScript(SITE[crmA]);
  {
    const b = scA.text;
    let compiles = false;
    try { new Function(b); compiles = true; } catch { compiles = false; }
    const ct = scA.h.get("content-type") ?? "";
    const cc = scA.h.get("cache-control") ?? "";
    const maxAge = Number(/max-age=(\d+)/.exec(cc)?.[1] ?? "0");
    chk("C2.6-S3.1", "GET /t/s/<siteKey>.js → 200 JS (content-type javascript · nosniff · max-age ≤ 3600 or no-store) · valid JS · siteKey + consent text baked in · banner ยอมรับ/ปฏิเสธ · sd_vid/sd_consent with Max-Age 180 d, written `Secure` + `SameSite=Lax` (first-party, readable by the script ⇒ never HttpOnly) · posts to /t/e and /t/consent · page/identify/event/revoke commands",
      scA.status === 200 && /javascript/.test(ct) && /nosniff/i.test(scA.h.get("x-content-type-options") ?? "") && (/no-store/.test(cc) || (maxAge > 0 && maxAge <= 3600)) &&
        compiles && b.includes(SITE[crmA]) && b.includes(TAG) && /ยอมรับ/.test(b) && /ปฏิเสธ/.test(b) && /sd_vid/.test(b) && /sd_consent/.test(b) &&
        /15552000|180\s*\*\s*24\s*\*\s*(60\s*\*\s*60|3600)|86400\s*\*\s*180|180\s*\*\s*86400/.test(b) && /secure/i.test(b) && /samesite/i.test(b) && /\/t\/e\b/.test(b) && /\/t\/consent\b/.test(b) &&
        ["page", "identify", "event", "revoke"].every((c) => new RegExp(`["']${c}["']`).test(b)),
      "tracker", `status=${scA.status} ct=${ct} cc=${cc} compiles=${compiles} len=${b.length} key=${b.includes(SITE[crmA])} secure=${/secure/i.test(b)}/${/samesite/i.test(b)}`);
  }
  {
    const b = scA.text;
    const readsForms = /FormData|\.value\b|addEventListener\(\s*["'](input|change|submit|keydown|keyup|keypress)["']|\.elements\b/.test(b);
    const unsafeDom = /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new\s+Function/.test(b);
    chk("C2.6-S3.2", "X8 the served script NEVER reads form values (no FormData / .value / .elements / input-change-submit-key listeners) and builds the banner without innerHTML / document.write / eval [static on the served body]",
      scA.status === 200 && !readsForms && !unsafeDom, "clean", `readsForms=${readsForms} unsafeDom=${unsafeDom}`);
  }
  {
    const rUnknown = await getScript(`nokey${rand}zz`);
    const rV1 = await getScript(KEY_V);
    const off = await call(TR.saveWebSettings, cB, owner, { enabled: false });
    const rOff = await getScript(SITE[crmB]);
    await call(TR.saveWebSettings, cB, owner, { enabled: true });
    const sig = (r: HttpRes) => j({ s: r.status, ct: r.h.get("content-type"), cc: r.h.get("cache-control"), b: r.text });
    let compiles = false;
    try { new Function(rUnknown.text); compiles = true; } catch { compiles = false; }
    chk("C2.6-S3.3", "unknown siteKey ≡ tracking disabled ≡ uiVersion-1 system: IDENTICAL no-op script (same status/headers/body, valid JS, no siteKey inside)",
      rUnknown.status === 200 && compiles && sig(rUnknown) === sig(rV1) && sig(rUnknown) === sig(rOff) && !rV1.text.includes(KEY_V) && !rOff.text.includes(SITE[crmB]) && off.ok,
      "same no-op", `unknown=${cut(sig(rUnknown), 120)} v1=${cut(sig(rV1), 80)} off=${cut(sig(rOff), 80)} save=${rd(off)}`);
  }
  // no consent ⇒ zero rows
  const vNo = vid();
  {
    const rs = [await postE(pageBody(crmA, vNo, `${OR_A}/a`), { origin: OR_A }), await postE(pageBody(crmA, vNo, `${OR_A}/b`), { origin: OR_A }),
      await postE({ ...pageBody(crmA, vNo, `${OR_A}/c`), t: "event", n: "cta" }, { origin: OR_A })];
    const rows = await visitorRows(tidA, vNo);
    chk("C2.6-S3.4", "no consent decision ⇒ /t/e answers 204 empty and writes ZERO sessions/events for that visitor",
      rs.every(is204Empty) && rows.s.length === 0 && rows.e.length === 0, "0 rows", `statuses=${rs.map((r) => r.status).join(",")} sessions=${rows.s.length} events=${rows.e.length}`);
  }
  // accept ⇒ 3 page views + consent version
  const vAcc = vid();
  const ipAcc = ipTracked();
  const accRs = await acceptAndBrowse(crmA, OR_A, vAcc, [`${OR_A}/courses?utm_source=facebook&utm_medium=cpc&utm_campaign=q4&email=${encodeURIComponent(mailOf("leak"))}#frag`, `${OR_A}/team?utm_source=facebook`, `${OR_A}/contact`], ipAcc);
  const accRows = await visitorRows(tidA, vAcc);
  {
    const s: Any = accRows.s[0] ?? {};
    const consentEv = accRows.e.filter((e) => e.kind === "CONSENT").length;
    chk("C2.6-S3.5", "accept (cv 1) ⇒ ONE session: consentVersion 1 · consentAt · ipHash · systemId crmA · ONE CONSENT event · then 3 page posts ⇒ pageViews 3 + 3 PAGEVIEW events · every answer 204 empty",
      accRs.every(is204Empty) && accRows.s.length === 1 && s.consentVersion === 1 && !!s.consentAt && typeof s.ipHash === "string" && s.ipHash.length >= 32 &&
        s.systemId === crmA && consentEv === 1 && accRows.pv === 3 && s.pageViews === 3,
      "1 session · 3 pv", `statuses=${accRs.map((r) => r.status).join(",")} sessions=${accRows.s.length} cv=${s.consentVersion} pv=${accRows.pv}/${s.pageViews} consentEv=${consentEv}`);
  }
  {
    const s: Any = accRows.s[0] ?? {};
    const pvUrls = accRows.e.filter((e) => e.kind === "PAGEVIEW").map((e) => String(e.url ?? ""));
    const first = pvUrls.find((u) => u.includes("/courses")) ?? "";
    const utm = s.utm ?? {};
    chk("C2.6-S3.6", "X8 stored urls keep ONLY utm_* params (email= and #fragment dropped) · session.utm { source facebook, medium cpc, campaign q4 } from the first page · firstUrl cleaned",
      first !== "" && /utm_source=facebook/.test(first) && !/email=|%40|@|#frag/.test(first) && utm.source === "facebook" && utm.medium === "cpc" && utm.campaign === "q4" &&
        !/email=|@|#/.test(String(s.firstUrl ?? "")),
      "clean", `first=${cut(first, 120)} utm=${j(utm)} firstUrl=${cut(s.firstUrl, 100)}`);
  }
  // decline ⇒ zero rows
  const vDec = vid();
  {
    const r1 = await postC(consentBody(crmA, vDec, "decline", `${OR_A}/`), { origin: OR_A });
    const r2 = await postE(pageBody(crmA, vDec, `${OR_A}/after-decline`), { origin: OR_A });
    const rows = await visitorRows(tidA, vDec);
    chk("C2.6-S3.7", "decline ⇒ 204 and ZERO rows for that visitor (no session, no CONSENT event) · a later page post from that visitor ⇒ still zero rows",
      is204Empty(r1) && is204Empty(r2) && rows.s.length === 0 && rows.e.length === 0, "0 rows", `${r1.status}/${r2.status} sessions=${rows.s.length} events=${rows.e.length}`);
  }
  // revoke + version bump
  {
    const vRev = vid();
    await acceptAndBrowse(crmA, OR_A, vRev, [`${OR_A}/r1`]);
    const before = await visitorRows(tidA, vRev);
    const rr = await postC(consentBody(crmA, vRev, "revoke", `${OR_A}/`), { origin: OR_A });
    await postE(pageBody(crmA, vRev, `${OR_A}/r2`), { origin: OR_A });
    const afterRev = await visitorRows(tidA, vRev);
    // version bump: an old (v1) consent no longer collects; re-consent at v2 collects again (positive control)
    const vOld = vid();
    await acceptAndBrowse(crmA, OR_A, vOld, [`${OR_A}/o1`]);
    const bump = await call(TR.saveWebSettings, cA, owner, { bumpConsentVersion: true });
    const cvNow = Number(bump.v?.consentVersion ?? 0);
    await postE(pageBody(crmA, vOld, `${OR_A}/o2`), { origin: OR_A });
    await postE({ ...pageBody(crmA, vOld, `${OR_A}/o3`), cv: cvNow }, { origin: OR_A });
    const oldAfter = await visitorRows(tidA, vOld);
    await postC(consentBody(crmA, vOld, "accept", `${OR_A}/`, cvNow), { origin: OR_A });
    await postE({ ...pageBody(crmA, vOld, `${OR_A}/o4`), cv: cvNow }, { origin: OR_A });
    const oldRe = await visitorRows(tidA, vOld);
    const scNow = await getScript(SITE[crmA]);
    chk("C2.6-S3.8", "revoke ⇒ consentVersion null on the visitor's sessions and no new rows · consent version bump (1→2) ⇒ a v1-consented visitor collects NOTHING (even claiming cv 2) until it accepts v2 · then it collects again · the served script carries the new version",
      is204Empty(rr) && before.pv === 1 && afterRev.pv === 1 && afterRev.s.every((s) => s.consentVersion === null) && bump.ok && cvNow === 2 &&
        oldAfter.pv === 1 && oldRe.pv === 2 && oldRe.s.some((s) => s.consentVersion === 2) && /\b2\b/.test(scNow.text),
      "stops + resumes", `rev ${before.pv}→${afterRev.pv} cv=${afterRev.s.map((s) => s.consentVersion).join(",")} bump=${rd(bump)}:${cvNow} old ${oldAfter.pv}→${oldRe.pv}`);
    // keep the rest of the run on the new version
    CV[crmA] = cvNow || 1;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S7 + X7 — /t/e /t/consent: origins, CORS, size cap, flood, malformed input, no data returned, no raw IP
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── S7 / X7 · collect endpoints ──");
  {
    const v = vid();
    const bad = [`https://evil-${rand}.test`, `https://${DOM_A}.evil.test`, `https://evil${DOM_A}`, `http://${DOM_A}`, `https://${DOM_B}`];
    const rs: HttpRes[] = [];
    for (const o of bad) rs.push(await postC(consentBody(crmA, v, "accept", `${o}/`), { origin: o }));
    for (const o of bad) rs.push(await postE(pageBody(crmA, v, `${o}/x`), { origin: o }));
    const noOrigin = await postC(consentBody(crmA, v, "accept", `${OR_A}/`), { origin: null });
    const urlElsewhere = await postC(consentBody(crmA, v, "accept", `https://evil-${rand}.test/`), { origin: OR_A });
    const rows = await visitorRows(tidA, v);
    chk("C2.6-S7.1", "domain not allowed (foreign · lookalike suffix/prefix · http scheme · another shop's domain · missing Origin · allowed Origin but page url elsewhere) ⇒ 204 empty, no ACAO, ZERO rows",
      [...rs, noOrigin, urlElsewhere].every((r) => is204Empty(r) && !acao(r)) && rows.s.length === 0 && rows.e.length === 0,
      "204 + 0 rows", `${[...rs, noOrigin, urlElsewhere].map((r) => `${r.status}${acao(r) ? `!${acao(r)}` : ""}`).join(",")} sessions=${rows.s.length}`);
  }
  {
    const v = vid();
    const ok = await postC(consentBody(crmA, v, "accept", `${OR_A}/`), { origin: OR_A });
    const sub = await postE(pageBody(crmA, v, `https://www.${DOM_A}/sub`), { origin: `https://www.${DOM_A}` });
    const pre = await options(RE, "/t/e", OR_A);
    const preBad = await options(RE, "/t/e", `https://evil-${rand}.test`);
    const preC = await options(RC, "/t/consent", OR_A);
    const rows = await visitorRows(tidA, v);
    const credBad = [ok, sub, pre, preC].some((r) => (r.h.get("access-control-allow-credentials") ?? "").toLowerCase() === "true");
    chk("C2.6-X7.3", "CORS locked: allowed origin ⇒ ACAO = that exact origin (never *) + Vary: Origin, no Allow-Credentials · subdomain of an allowed domain accepted · OPTIONS preflight ok for allowed (Allow-Methods POST) and without ACAO for a foreign origin",
      is204Empty(ok) && acao(ok) === OR_A && /origin/i.test(ok.h.get("vary") ?? "") && acao(sub) === `https://www.${DOM_A}` && rows.pv === 1 &&
        [200, 204].includes(pre.status) && acao(pre) === OR_A && /POST/i.test(pre.h.get("access-control-allow-methods") ?? "") && acao(preC) === OR_A &&
        [200, 204].includes(preBad.status) && !acao(preBad) && !credBad,
      "exact origin", `ok=${acao(ok)} vary=${ok.h.get("vary")} sub=${acao(sub)} pv=${rows.pv} pre=${pre.status}/${acao(pre)}/${pre.h.get("access-control-allow-methods")} preBad=${preBad.status}/${acao(preBad)} cred=${credBad}`);
  }
  {
    const v = vid();
    await postC(consentBody(crmA, v, "accept", `${OR_A}/`), { origin: OR_A });
    const base = pageBody(crmA, v, `${OR_A}/big`);
    const pad = (n: number) => JSON.stringify({ ...base, ti: "x".repeat(Math.max(0, n - JSON.stringify({ ...base, ti: "" }).length)) });
    const over = pad(MAXB + 1);
    const near = pad(MAXB - 400);
    const rOver = await postE(null, { origin: OR_A, raw: over });
    const rOverJson = await postE(null, { origin: OR_A, raw: pad(MAXB * 4), ctype: "application/json" });
    const afterOver = await visitorRows(tidA, v);
    const rNear = await postE(null, { origin: OR_A, raw: near });
    const afterNear = await visitorRows(tidA, v);
    chk("C2.6-X7.4", `payload cap ${MAXB} B: ${Buffer.byteLength(over)} B and ${MAXB * 4} B bodies ⇒ 413 or 204 (empty body) and ZERO rows · a ${Buffer.byteLength(near)} B body is stored (positive control)`,
      [rOver, rOverJson].every((r) => (r.status === 413 || r.status === 204) && r.text.length < 200 && !/\{/.test(r.text)) && afterOver.pv === 0 && is204Empty(rNear) && afterNear.pv === 1,
      "capped", `over=${rOver.status} x4=${rOverJson.status} pv ${afterOver.pv}→${afterNear.pv} near=${rNear.status}`);
  }
  {
    const lim = Number(LIM?.collectPerIp?.limit ?? 0);
    const v = vid();
    const ip = ipTracked();
    await postC(consentBody(crmA, v, "accept", `${OR_A}/`), { origin: OR_A, ip: ipNew() });
    const n = lim > 0 && lim <= 1000 ? lim + 5 : 0;
    const rs = n ? await Promise.all(Array.from({ length: n }, (_x, i) => postE(pageBody(crmA, v, `${OR_A}/f${i}`), { origin: OR_A, ip }))) : [];
    const rows = await visitorRows(tidA, v);
    const buckets = ((await P.chatRateBucket.findMany({ where: { createdAt: { gte: RUN_START } } })) as Any[]).map((b) => String(b.key));
    const rawIpInKey = buckets.some((k) => RAW_IPS.some((x) => k.includes(x)));
    chk("C2.6-X7.5", `flood from ONE ip (collectPerIp.limit + 5 = ${n} parallel): all answers identical 204 empty, exactly collectPerIp.limit PAGEVIEWs stored (DB limiter — keys start \`crm:\`, no raw IP in any key)`,
      n > 0 && rs.every(is204Empty) && rows.pv === lim && buckets.some((k) => k.startsWith("crm:")) && !rawIpInKey,
      `${lim} stored`, `limit=${lim} statuses=${[...new Set(rs.map((r) => r.status))].join(",")} pv=${rows.pv} crmKeys=${buckets.filter((k) => k.startsWith("crm:")).length} rawIp=${rawIpInKey}`);
  }
  {
    const v = vid();
    await postC(consentBody(crmA, v, "accept", `${OR_A}/`), { origin: OR_A });
    const junk = ["{not json", "null", "[]", JSON.stringify({ k: SITE[crmA], v: "not-a-uuid", cv: CV[crmA] ?? 1, t: "page", u: `${OR_A}/x` }),
      JSON.stringify({ k: `nokey${rand}`, v, cv: 1, t: "page", u: `${OR_A}/x` }), JSON.stringify({ ...pageBody(crmA, v, `${OR_A}/x`), t: "drop_table" }),
      JSON.stringify({ ...pageBody(crmA, v, "javascript:alert(1)") }), JSON.stringify({ ...pageBody(crmA, v, `${OR_A}/x`), k: { $ne: 1 } }), ""];
    const rs: HttpRes[] = [];
    for (const raw of junk) rs.push(await postE(null, { origin: OR_A, raw }));
    const rows = await visitorRows(tidA, v);
    chk("C2.6-X7.6", "malformed JSON / wrong types / invalid visitorId / unknown siteKey / unknown command / javascript: page url / object-injection ⇒ 204 empty (never 4xx/5xx with data), ZERO page rows",
      rs.every(is204Empty) && rows.pv === 0, "204 + 0", `statuses=${rs.map((r) => r.status).join(",")} pv=${rows.pv}`);
  }
  {
    const tables = [["crmWebSession", { tenantId: { in: TENANTS } }], ["crmWebEvent", { tenantId: { in: TENANTS } }], ["crmTrackedClick", { tenantId: { in: TENANTS } }]] as const;
    let blob = "";
    for (const [m, w] of tables) blob += j(await safeMany(m, { where: w }));
    const leaked = RAW_IPS.filter((ip) => new RegExp(`(^|[^0-9.])${ip.replace(/\./g, "\\.")}([^0-9.]|$)`).test(blob));
    const s: Any = accRows.s[0] ?? {};
    const hNow = TR.ipHashFor ? String(TR.ipHashFor(ipAcc, new Date())) : "";
    chk("C2.6-X7.7", "X8 no raw IP in any session / event / click row of this run · session.ipHash === ipHashFor(ip, now) and ≠ sha256(ip)",
      leaked.length === 0 && hNow !== "" && s.ipHash === hNow && hNow !== sha(ipAcc), "hashed only", `leaked=${leaked.slice(0, 3).join(",") || "-"} ipHash=${cut(s.ipHash, 20)} fn=${cut(hNow, 20)}`);
  }
  {
    const f = TR.ipHashFor;
    const h = (d: string) => (typeof f === "function" ? String(f("203.0.113.9", new Date(d))) : "");
    // Thai month boundary: 2026-09-30T17:00Z = 1 Oct 00:00 (+07:00)
    chk("C2.6-X7.8", "monthly salt (Thai month): same hash inside a month, different across months (30 Sep 23:59 ≠ 1 Oct 00:00 +07:00) · hash ≥ 32 hex",
      h("2026-09-02T00:00:00Z") !== "" && h("2026-09-02T00:00:00Z") === h("2026-09-30T16:59:00Z") && h("2026-09-30T16:59:00Z") !== h("2026-09-30T17:00:00Z") && /^[0-9a-f]{32,}$/.test(h("2026-09-02T00:00:00Z")),
      "monthly", `sep=${cut(h("2026-09-02T00:00:00Z"), 12)} sepEnd=${cut(h("2026-09-30T16:59:00Z"), 12)} oct=${cut(h("2026-09-30T17:00:00Z"), 12)}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X6 — settings input (consent text in the script · domains) · X8 client-side identify with raw PII refused
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── X6 / X8 · settings input · client identify ──");
  {
    const evil = `คุกกี้ ${TAG} </script><img src=x onerror=alert(1)> "';alert(2)// ปิด</SCRIPT >`;
    const sv = await call(TR.saveWebSettings, cB, owner, { consentText: evil });
    const sc = await getScript(SITE[crmB]);
    let compiles = false;
    try { new Function(sc.text); compiles = true; } catch { compiles = false; }
    const badDomains = [["javascript:alert(1)"], ["*"], ["*.evil.test"], [`${DOM_B}/path`], [`https://${DOM_B}`], [`${DOM_B}:8080`], ["127.0.0.1"], [""]];
    const rs: Res[] = [];
    for (const d of badDomains) rs.push(await call(TR.saveWebSettings, cB, owner, { domains: d }));
    const gs = await call(TR.getWebSettings, cB, owner);
    await call(TR.saveWebSettings, cB, owner, { consentText: CONSENT_TXT });
    chk("C2.6-X6.3", "consent text with </script>, quotes, U+2028 and an onerror payload ⇒ served script still compiles and contains no raw `</script` · domains must be bare hostnames: javascript:, *, wildcards, paths, schemes, ports, IPs, empty ⇒ VALIDATION, stored domains unchanged",
      sv.ok && sc.status === 200 && compiles && !/<\/script/i.test(sc.text) && sc.text.includes(TAG) && rs.every((r) => refused(r, "VALIDATION")) && j(gs.v?.domains) === j([DOM_B]),
      "escaped + refused", `save=${rd(sv)} compiles=${compiles} rawClose=${/<\/script/i.test(sc.text)} domains=${rs.map((r) => (refused(r, "VALIDATION") ? "✓" : rd(r))).join(",")} stored=${j(gs.v?.domains)}`);
  }
  {
    const v = vid();
    await acceptAndBrowse(crmA, OR_A, v, [`${OR_A}/pii`]);
    const victim = await rawContact(tidA, crmA, "เหยื่อระบุตัว", userA);
    const r = await postE({ ...pageBody(crmA, v, `${OR_A}/pii`), t: "identify", email: victim.email, phone: "0812345678", contactId: victim.id }, { origin: OR_A });
    const rows = await visitorRows(tidA, v);
    const blob = j(rows.s) + j(rows.e);
    chk("C2.6-X8.1", "client-side identify with a raw e-mail/phone/contactId (no ticket) ⇒ 204, NO binding, and the e-mail never lands in any session/event",
      is204Empty(r) && rows.s.every((s) => s.contactId === null) && !blob.includes(victim.email) && !blob.includes(victim.id), "no bind", `status=${r.status} bound=${rows.s.map((s) => s.contactId).join(",")} leak=${blob.includes(victim.email)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X7 (identify ticket — C2.6's own token) · direct, independent of C2.5
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── X7 · identify ticket ──");
  const rawEmail = async (tid: string, sys: string, contactId: string) =>
    (await P.crmEmailMessage?.create?.({ data: { tenantId: tid, systemId: sys, contactId, direction: "OUT", messageId: `<${TAG}-${nx()}@qc.invalid>`, threadKey: `${TAG}-t${nx()}`,
      fromAddr: `shop@${DOM_A}`, subject: `เรื่อง ${TAG}`, status: "SENT", sentAt: new Date(Date.now() - 3_600_000), trackTokenHash: sha(`${TAG}-tok-${nx()}`) } }).catch(() => null)) as Any;
  {
    const ctT = await rawContact(tidA, crmA, "ลูกค้าตั๋ว", userA);
    const em: Any = await rawEmail(tidA, crmA, ctT.id);
    const base = { tenantId: tidA, systemId: crmA, emailId: String(em?.id ?? `${TAG}-noemail`), contactId: ctT.id };
    const tk = await call(TR.emailClickTicket, base);
    const ticket = String(tk.v ?? "");
    const tkOld = await call(TR.emailClickTicket, base, new Date(Date.now() - 2 * 3_600_000));
    const tampered = ticket ? `${ticket.slice(0, -2)}${ticket.slice(-2) === "AA" ? "BB" : "AA"}` : "x";
    const vs = [vid(), vid(), vid(), vid()];
    for (const v of vs.slice(0, 3)) await acceptAndBrowse(crmA, OR_A, v, [`${OR_A}/t`]);
    await acceptAndBrowse(crmA2, OR_A2, vs[3], [`${OR_A2}/t`]);
    const idf = (sys: string, v: string, ct: string, origin: string) => postE({ ...pageBody(sys, v, `${origin}/t`), t: "identify", ct }, { origin });
    await idf(crmA, vs[0], tampered, OR_A);
    await idf(crmA, vs[1], String(tkOld.v ?? "x"), OR_A);
    await idf(crmA2, vs[3], ticket, OR_A2);
    await idf(crmA, vs[2], ticket, OR_A);
    const bound = async (v: string) => (await sessionsOf(tidA, v)).map((s) => `${s.contactId ?? "-"}:${s.identifiedBy ?? "-"}`);
    const [b0, b1, b2, b3] = [await bound(vs[0]), await bound(vs[1]), await bound(vs[2]), await bound(vs[3])];
    const decoded = b64dec(ticket.split(".")[0] ?? "") + b64dec(ticket);
    const opaque = ticket.length >= 22 && ![ctT.id, base.emailId, ctT.email].some((x) => ticket.includes(x) || decoded.includes(x));
    chk("C2.6-X7.9", "identify ticket: opaque (no contactId/emailId/e-mail, also after base64url decode) · tampered ⇒ no bind · issued 2 h ago (TTL 1 h) ⇒ no bind · minted for crmA, posted on crmA2's site ⇒ no bind · valid on crmA ⇒ bound EMAIL_CLICK (positive control)",
      tk.ok && opaque && b0.every((x) => x.startsWith("-:")) && b1.every((x) => x.startsWith("-:")) && b3.every((x) => x.startsWith("-:")) &&
        b2.length > 0 && b2.every((x) => x === `${ctT.id}:EMAIL_CLICK`),
      "only the valid one binds", `${rd(tk)} opaque=${opaque} tampered=${b0} old=${b1} crossSys=${b3} valid=${b2}`);
    const app = TR.appendIdentifyTicket;
    const u1 = typeof app === "function" ? String(app(`https://${DOM_A}/offer?utm_source=email`, ticket, [DOM_A])) : "";
    const u2 = typeof app === "function" ? String(app(`https://elsewhere-${rand}.example.org/doc`, ticket, [DOM_A])) : "";
    chk("C2.6-X7.10", "appendIdentifyTicket adds sd_ct ONLY for an allowed host (url otherwise byte-identical; foreign host unchanged — no ticket leaks to third parties)",
      u1.startsWith(`https://${DOM_A}/offer?utm_source=email`) && new URL(u1 || "https://x.invalid").searchParams.get("sd_ct") === ticket && u2 === `https://elsewhere-${rand}.example.org/doc`,
      "allowed only", `u1=${cut(u1, 120)} u2=${cut(u2, 80)}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — e-mail pixel / click (C2.5 routes) → events + bot filter + identify ticket (black-box through C2.5's emails.sendEmail)
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── S2 · e-mail pixel/click ──");
  {
    const ctE = await rawContact(tidA, crmA, "ลูกค้าอีเมล", userA);
    // ORACLE-EDIT (controller · 24 Sep): C2.5 sendEmail decides consent at send time — a non-member contact needs a granted EMAIL consent row
    //   (same fixture as qc-crm-c2.5.mts:623); without it S2.0–S2.4 measured EMAIL_BLOCKED and proved nothing
    await P.crmContactConsent.create({ data: { tenantId: tidA, systemId: crmA, contactId: ctE.id, channel: "EMAIL", granted: true, source: "STAFF" } });
    const OFFER = `https://${DOM_A}/offer?utm_source=email`;
    const DOC = `https://elsewhere-${rand}.example.org/doc`;
    const f0 = FETCHES.length;
    const sent = await call(EM.sendEmail, cA, owner, { contactId: ctE.id, to: [ctE.email], subject: `ข้อเสนอ ${TAG}`,
      bodyHtml: `<p>สวัสดีค่ะ ดู <a href="${OFFER}">ข้อเสนอ</a> และ <a href="${DOC}">เอกสาร</a></p>` });
    const bodies = FETCHES.slice(f0).filter((x) => /resend\.com/.test(x.url)).map((x) => { try { return String(JSON.parse(x.body)?.html ?? x.body); } catch { return x.body; } }).join("\n")
      .replace(/&amp;/g, "&");
    const pix = /\/t\/o\/([^"'\s<>?]+?\.gif)/.exec(bodies)?.[1] ?? "";
    const clicks = [...bodies.matchAll(/https?:\/\/[^"'\s<>]*\/t\/c\/[^"'\s<>]+/g)].map((m) => m[0]);
    const msg: Any = (await safeMany("crmEmailMessage", { where: { tenantId: tidA, contactId: ctE.id } }))[0] ?? null;
    const tokenPlain = pix.replace(/\.gif$/, "");
    chk("C2.6-S2.0", "[positive control] C2.5 emails.sendEmail (fetch stubbed) produced HTML with a /t/o pixel and 2 wrapped /t/c links, and stored the message with trackTokenHash ≠ the plaintext token — if red, S2.1–S2.4 prove nothing (ORACLE-EDIT: adapt to C2.5's real send signature)",
      sent.ok && !!pix && clicks.length >= 2 && !!msg && msg.trackTokenHash !== tokenPlain && !j(msg).includes(tokenPlain), "fixture",
      `${rd(sent)} pix=${cut(pix, 40)} clicks=${clicks.length} msg=${!!msg}`, "MAJOR");
    const openRow = async () => (msg ? (await P.crmEmailMessage.findFirst({ where: { id: msg.id } })) : null) as Any;
    const getO = async (ua: string) => {
      try { return await toRes(await RO.GET(new Request(`${BASE}/t/o/${pix}`, { headers: hdrs({ ua }) }), params(pix))); } catch (e) { return httpErr(e); }
    };
    const getC = async (url: string, ua = uaHuman, extraQ = "") => {
      const u = new URL(url);
      const seg = decodeURIComponent(u.pathname.split("/").pop() ?? "");
      try { return await toRes(await RCL.GET(new Request(`${BASE}${u.pathname}${u.search}${extraQ ? (u.search ? "&" : "?") + extraQ : ""}`, { headers: hdrs({ ua }) }), params(seg))); } catch (e) { return httpErr(e); }
    };
    if (msg) await P.crmEmailMessage.update({ where: { id: msg.id }, data: { sentAt: new Date() } });
    const oFast = await getO(uaHuman);
    const o0 = Number((await openRow())?.openCount ?? -1);
    if (msg) await P.crmEmailMessage.update({ where: { id: msg.id }, data: { sentAt: new Date(Date.now() - 10 * 60_000) } });
    const oBot = await getO("python-requests/2.31.0");
    const o1 = Number((await openRow())?.openCount ?? -1);
    const oHuman = await getO(uaHuman);
    const o2 = Number((await openRow())?.openCount ?? -1);
    const gifOk = (r: HttpRes) => r.status === 200 && /image\/gif/.test(r.h.get("content-type") ?? "");
    const openEv = msg ? await P.crmEmailEvent.count({ where: { emailId: msg.id, kind: "OPEN" } }) : -1;
    chk("C2.6-S2.1", "/t/o: open within 2 s of send ⇒ gif, NOT counted · human open 10 min later ⇒ openCount 1 + ONE OPEN event",
      gifOk(oFast) && gifOk(oHuman) && o0 === 0 && o2 === 1 && openEv === 1, "0 → 1", `fast=${oFast.status} counts ${o0}/${o1}/${o2} events=${openEv}`);
    chk("C2.6-S2.2", "bot filter (one engine, isBotUserAgent): python-requests / bingbot opens ⇒ gif but not counted · isBotUserAgent flags crawlers and not Safari/Chrome",
      gifOk(oBot) && o1 === 0 && TSH.isBotUserAgent?.("python-requests/2.31.0") === true && TSH.isBotUserAgent?.("Mozilla/5.0 (compatible; bingbot/2.0)") === true &&
        TSH.isBotUserAgent?.(uaHuman) === false, "filtered", `bot=${oBot.status} count=${o1} fn=${typeof TSH.isBotUserAgent}`);
    const cOffer = clicks.find((c) => !c.includes("elsewhere")) ?? clicks[0] ?? `${BASE}/t/c/none`;
    const cDoc = clicks.find((c) => c !== cOffer) ?? `${BASE}/t/c/none2`;
    const cBot = await getC(cOffer, "Mozilla/5.0 (compatible; Googlebot/2.1)");
    const k0 = Number((await openRow())?.clickCount ?? -1);
    const r1 = await getC(cOffer, uaHuman, "u=https://evil.test/&url=https://evil.test/");
    const r2 = await getC(cDoc);
    const k1 = Number((await openRow())?.clickCount ?? -1);
    const l1 = loc(r1);
    const ticket = (() => { try { return new URL(l1).searchParams.get("sd_ct") ?? ""; } catch { return ""; } })();
    const stripped = (() => { try { const u = new URL(l1); u.searchParams.delete("sd_ct"); return u.href; } catch { return ""; } })();
    chk("C2.6-S2.3", "/t/c: bot click ⇒ still 302 but not counted · human click on an allowed-domain link ⇒ 302 to the stored url + sd_ct ticket (request ?u=/?url= ignored) · link to a foreign host ⇒ 302 byte-exact stored url (no ticket) · clickCount 0 → 2",
      cBot.status === 302 && k0 === 0 && r1.status === 302 && stripped === new URL(OFFER).href && ticket.length >= 22 && r2.status === 302 && loc(r2) === DOC && k1 === 2,
      "ticket only for allowed", `bot=${cBot.status} k=${k0}→${k1} l1=${cut(l1, 140)} l2=${cut(loc(r2), 80)}`);
    const v = vid();
    await acceptAndBrowse(crmA, OR_A, v, [`${OR_A}/offer?utm_source=email`]);
    await postE({ ...pageBody(crmA, v, `${OR_A}/offer`), t: "identify", ct: ticket }, { origin: OR_A });
    const ss = await sessionsOf(tidA, v);
    chk("C2.6-S2.4", "the landing page posts the ticket (sd('identify')) ⇒ the visitor's sessions are bound to the e-mail's contact with identifiedBy EMAIL_CLICK",
      !!ticket && ss.length > 0 && ss.every((s) => s.contactId === ctE.id && s.identifiedBy === "EMAIL_CLICK"), "bound", `sessions=${ss.map((s) => `${s.contactId}:${s.identifiedBy}`).join(",")}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S6 + S4 — forms (target system · utm · spam guard · assign rule · score · company) and identify from the form
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── S6 / S4 · forms → lead → identify ──");
  const FIELDS = [{ key: "name", label: "ชื่อ", type: "text", required: true }, { key: "phone", label: "โทร", type: "phone", required: false },
    { key: "email", label: "อีเมล", type: "email", required: false }, { key: "company", label: "บริษัท", type: "text", required: false }];
  const mkRule = async (sys: string, name: string, userId: string, sortOrder: number) =>
    (await P.crmAssignmentRule?.create?.({ data: { tenantId: tidA, systemId: sys, name: `${name} ${TAG}`, conditions: { items: [] }, mode: "FIXED", userIds: [userId], sortOrder, active: true } }).catch(() => null)) as Any;
  const ruleS = await mkRule(crmA2, "กฎพนักงาน", userS, 0);
  const ruleM = await mkRule(crmA2, "กฎผู้จัดการ", userM, 1);
  const mkForm = async (tid: string, label: string, extra: Record<string, unknown> = {}) =>
    (await P.formDef.create({ data: { tenantId: tid, name: `${label} ${TAG}`, publicToken: `${TAG}-${label}-${nx()}`.replace(/[^A-Za-z0-9_-]/g, "x"), crmEnabled: true, fieldsJson: FIELDS, ...extra } })) as Any;
  const fMain = await mkForm(tidA, "main", { crmSystemId: crmA2, assignRuleId: ruleM?.id ?? null, scoreOnSubmit: 15, createCompanyFromField: "company" });
  const stTok = (formId: string, ageSec = 10) => (typeof SG.issueFormStartToken === "function" ? String(SG.issueFormStartToken(formId, new Date(Date.now() - ageSec * 1000))) : "");
  const submitG = (form: Any, answers: Record<string, unknown>, meta: Record<string, unknown>, o: { hp?: string; st?: string; ageSec?: number; turnstileToken?: string } = {}, deps?: Any) =>
    call(FORMS.submitPublicFormGuarded, form.publicToken, { answers, hp: o.hp ?? "", st: o.st ?? stTok(form.id, o.ageSec ?? 10), turnstileToken: o.turnstileToken }, { ip: ipNew(), userAgent: uaHuman, ...meta }, deps);
  const subsOf = async (formId: string) => (await P.formSubmission.findMany({ where: { formId }, orderBy: { createdAt: "asc" } })) as Any[];
  const obxOf = async (formId: string) => ((await P.outboxEvent.findMany({ where: { tenantId: { in: TENANTS }, type: "forms.submission.received" } })) as Any[]).filter((e) => e?.payload?.formId === formId);

  // visitor VF browses the B2B site (crmA2): 2 recent sessions + 1 session 200 days old
  const VF = vid();
  const ipF = ipTracked();
  await acceptAndBrowse(crmA2, OR_A2, VF, [`${OR_A2}/b2b`, `${OR_A2}/team-building`], ipF);
  for (const s of await sessionsOf(tidA, VF)) await P.crmWebSession.update({ where: { id: s.id }, data: { lastSeenAt: new Date(Date.now() - 2 * 3_600_000), startedAt: new Date(Date.now() - 3 * 3_600_000) } }).catch(() => null);
  await postE(pageBody(crmA2, VF, `${OR_A2}/contact`), { origin: OR_A2, ip: ipF });
  const oldSess: Any = await P.crmWebSession?.create?.({ data: { tenantId: tidA, systemId: crmA2, visitorId: VF, consentVersion: 1, consentAt: new Date(Date.now() - 200 * DAY),
    startedAt: new Date(Date.now() - 200 * DAY), lastSeenAt: new Date(Date.now() - 200 * DAY), pageViews: 4, firstUrl: `${OR_A2}/old` } }).catch(() => null);
  const recentF = (await sessionsOf(tidA, VF)).filter((s) => s.id !== oldSess?.id);
  const latestF = [...recentF].sort((a, b) => +new Date(b.lastSeenAt) - +new Date(a.lastSeenAt))[0];
  const COMPANY = pii(`บริษัทฟอร์ม ${TAG}`);
  const leadMail = mailOf("lead");
  const ipSub = ipTracked();
  const subMain = await call(FORMS.submitPublicFormGuarded, fMain.publicToken,
    { answers: { name: pii(`คุณลีดเว็บ ${TAG}`), phone: phoneOf(), email: leadMail, company: COMPANY }, hp: "", st: stTok(fMain.id) },
    { ip: ipSub, userAgent: uaHuman, visitorId: VF, pageUrl: `${OR_A2}/contact?utm_source=google&token=secret${rand}#top`, referrer: `https://www.google.com/search?q=${encodeURIComponent(leadMail)}`,
      utm: { source: "google", medium: "cpc", campaign: "b2b" } });
  const sub1: Any = (await subsOf(fMain.id))[0] ?? null;
  {
    const hNow = TR.ipHashFor ? String(TR.ipHashFor(ipSub, new Date())) : "?";
    chk("C2.6-S6.2", "guarded submit stores utm { source, medium, campaign } · pageUrl without non-utm query/fragment · referrer without query · FormSubmission.ip = ipHashFor (never the raw IP) · webSessionId = the visitor's latest consented session in the form's CRM system",
      subMain.ok && subMain.v?.ok === true && !!sub1 && sub1.utm?.source === "google" && sub1.utm?.campaign === "b2b" && /utm_source=google/.test(String(sub1.pageUrl ?? "")) &&
        !/token=|#top/.test(String(sub1.pageUrl ?? "")) && !/\?/.test(String(sub1.referrer ?? "")) && sub1.ip === hNow && sub1.ip !== ipSub && sub1.webSessionId === latestF?.id,
      "captured", `${rd(subMain)} ${cut(j(subMain.v), 80)} row=${cut(j({ utm: sub1?.utm, pageUrl: sub1?.pageUrl, referrer: sub1?.referrer, ip: sub1?.ip === ipSub ? "RAW" : cut(sub1?.ip, 12), ws: sub1?.webSessionId, latest: latestF?.id }), 260)}`);
  }
  await pump([tidA]);
  const sub1b: Any = sub1 ? await P.formSubmission.findFirst({ where: { id: sub1.id } }) : null;
  const lead: Any = sub1b?.crmContactId ? await P.crmContact.findFirst({ where: { id: sub1b.crmContactId } }) : null;
  chk("C2.6-S6.1", "FormDef.crmSystemId wins over \"first CRM of the tenant\": the lead lands in crmA2 (the SECOND system)",
    !!lead && lead.systemId === crmA2 && lead.tenantId === tidA, "crmA2", `contact=${lead?.id ?? "-"} system=${lead?.systemId === crmA ? "crmA(first)" : lead?.systemId === crmA2 ? "crmA2" : lead?.systemId}`);
  chk("C2.6-S6.5", "FormDef.assignRuleId decides the owner (rule → manager) even though another ACTIVE rule sorts first (→ staff)",
    !!ruleM && !!lead && lead.ownerUserId === userM, "manager", `owner=${lead?.ownerUserId === userM ? "manager" : lead?.ownerUserId === userS ? "staff(first rule)" : lead?.ownerUserId}`);
  {
    const links = lead ? ((await safeMany("crmCompanyContact", { where: { contactId: lead.id } })) as Any[]) : [];
    const comps = links.length ? await safeMany("crmCompany", { where: { id: { in: links.map((l) => l.companyId) } } }) : [];
    chk("C2.6-S6.6", "createCompanyFromField: the lead is linked to a company named by the `company` answer, in the same CRM system",
      comps.some((c) => c.name === COMPANY && c.systemId === crmA2), "company linked", `companies=${comps.map((c) => `${cut(c.name, 30)}@${c.systemId === crmA2 ? "A2" : c.systemId}`).join(",") || "-"}`, "MAJOR");
  }
  {
    const ss = await sessionsOf(tidA, VF);
    const recent = ss.filter((s) => s.id !== oldSess?.id);
    const old = ss.find((s) => s.id === oldSess?.id);
    chk("C2.6-S4.1", "identify from the form: BOTH recent sessions of the visitor (before and after the 30-min idle split) bound to the lead with identifiedBy FORM · the 200-day-old session NOT bound (180-day lookback)",
      !!lead && recent.length === 2 && recent.every((s) => s.contactId === lead.id && s.identifiedBy === "FORM") && !!old && old.contactId === null,
      "2 bound · old not", `recent=${recent.map((s) => `${s.contactId === lead?.id ? "LEAD" : s.contactId ?? "-"}:${s.identifiedBy ?? "-"}`).join(",")} old=${old?.contactId ?? "-"}`);
  }
  {
    const acts = lead ? await webActivities(lead.id) : [];
    const evs = lead ? await identifiedEvents(tidA, lead.id) : [];
    const pl = evs[0]?.payload ?? {};
    const keys = Object.keys(pl);
    const allowed = ["contactId", "systemId", "sessionCount", "pageViews", "firstUrl", "by", "visitorId"];
    const piiLeak = PII.some((x) => j(pl).includes(x)) || /@/.test(j(pl));
    chk("C2.6-S4.2", "ONE WEB activity (type WEB, source WEB, done, Thai title) for the lead today · ONE crm.web.identified (key `crm.web.identified#…`, payload ids/numbers only: sessionCount 2, pageViews 3, no PII)",
      acts.length === 1 && acts[0].source === "WEB" && !!acts[0].doneAt && thai(acts[0].title) && !PII.some((x) => String(acts[0].title).includes(x)) &&
        evs.length === 1 && String(evs[0].idempotencyKey).startsWith("crm.web.identified#") && keys.every((k) => allowed.includes(k)) && pl.contactId === lead?.id &&
        Number(pl.sessionCount) === 2 && Number(pl.pageViews) === 3 && !piiLeak,
      "1 + 1", `acts=${acts.length}:${cut(acts[0]?.title, 40)} evs=${evs.length} key=${cut(evs[0]?.idempotencyKey, 60)} payload=${cut(j(pl), 160)}`);
  }
  {
    const c2: Any = lead ? await P.crmContact.findFirst({ where: { id: lead.id } }) : null;
    const logs = lead ? await safeMany("crmScoreLog", { where: { contactId: lead.id } }) : [];
    chk("C2.6-S4.3", "scoreOnSubmit 15 ⇒ contact.score 15 exactly and ONE CrmScoreLog (points 15, refType FormSubmission, refId = submission id)",
      c2?.score === 15 && logs.length === 1 && logs[0].points === 15 && logs[0].refType === "FormSubmission" && logs[0].refId === sub1?.id,
      "15 once", `score=${c2?.score} logs=${j(logs.map((l) => ({ p: l.points, t: l.refType, r: l.refId === sub1?.id })))}`);
  }
  {
    const evs = await obxOf(fMain.id);
    const e = evs[0];
    if (e) {
      await consume(evtOf(e));
      await consume(evtOf(e));
      await Promise.all([consume(evtOf(e)), consume(evtOf(e)), consume(evtOf(e))]);
    }
    const contacts = await P.crmContact.count({ where: { tenantId: tidA, email: leadMail } });
    const c2: Any = lead ? await P.crmContact.findFirst({ where: { id: lead.id } }) : null;
    const logs = lead ? await safeMany("crmScoreLog", { where: { contactId: lead.id } }) : [];
    const acts = lead ? await webActivities(lead.id) : [];
    const idEv = lead ? await identifiedEvents(tidA, lead.id) : [];
    chk("C2.6-X4.1", "forms.submission.received redelivered twice + 3× in parallel ⇒ still ONE contact · score 15 · ONE score log · ONE WEB activity · ONE crm.web.identified",
      !!e && contacts === 1 && c2?.score === 15 && logs.length === 1 && acts.length === 1 && idEv.length === 1,
      "once", `event=${!!e} contacts=${contacts} score=${c2?.score} logs=${logs.length} acts=${acts.length} idEv=${idEv.length}`);
  }

  // ─── spam guard (C24) ───
  {
    const fS = await mkForm(tidA, "spam");
    const fOther = await mkForm(tidA, "other");
    const ans = () => ({ name: pii(`สแปม ${TAG}-${nx()}`), phone: phoneOf() });
    const hp = await submitG(fS, ans(), {}, { hp: "https://spam.test" });
    const fast = await submitG(fS, ans(), {}, { ageSec: 1 });
    const forged = await submitG(fS, ans(), {}, { st: `${Date.now() - 60_000}.deadbeef` });
    const otherSt = await submitG(fS, ans(), {}, { st: stTok(fOther.id) });
    const noSt = await call(FORMS.submitPublicFormGuarded, fS.publicToken, { answers: ans(), hp: "" }, { ip: ipNew(), userAgent: uaHuman });
    const afterBad = { subs: (await subsOf(fS.id)).length, obx: (await obxOf(fS.id)).length, notif: await P.appNotification.count({ where: { tenantId: tidA, body: { contains: fS.name } } }) };
    const good = await submitG(fS, ans(), {});
    const afterGood = (await subsOf(fS.id)).length;
    const tooFast = (r: Res) => r.ok && r.v?.ok === false && r.v?.reason === "TOO_FAST" && thai(r.v?.message) && !blames(r.v?.message);
    chk("C2.6-S6.3", `spam guard: honeypot (${HP}) filled ⇒ looks like success { ok: true, id: null } but NOTHING written · fill time 1 s / forged start token / another form's token / no token ⇒ TOO_FAST Thai, nothing written (no submission, no outbox, no notification) · a normal submit is accepted (positive control)`,
      hp.ok && hp.v?.ok === true && hp.v?.id === null && [fast, forged, otherSt, noSt].every(tooFast) && afterBad.subs === 0 && afterBad.obx === 0 && afterBad.notif === 0 &&
        good.ok && good.v?.ok === true && typeof good.v?.id === "string" && afterGood === 1,
      "guarded", `hp=${cut(j(hp.v ?? hp.err), 60)} fast=${cut(j(fast.v ?? fast.err), 60)} forged=${fast.v?.reason}/${forged.v?.reason}/${otherSt.v?.reason}/${noSt.v?.reason} bad=${j(afterBad)} good=${cut(j(good.v ?? good.err), 60)} rows=${afterGood}`);
  }
  {
    const fIp = await mkForm(tidA, "perip", { spamGuard: { perIpPerMin: 3 } });
    const fPer = await mkForm(tidA, "perform", { spamGuard: { perFormPerMin: 4 } });
    const oneIp = ipTracked();
    const rIp = await Promise.all(Array.from({ length: 5 }, () => submitG(fIp, { name: pii(`ไอพี ${TAG}-${nx()}`) }, { ip: oneIp })));
    const rF = await Promise.all(Array.from({ length: 6 }, () => submitG(fPer, { name: pii(`ฟอร์ม ${TAG}-${nx()}`) }, { ip: ipNew() })));
    const nIp = (await subsOf(fIp.id)).length;
    const nF = (await subsOf(fPer.id)).length;
    const limited = (rs: Res[]) => rs.filter((r) => r.ok && r.v?.ok === false && r.v?.reason === "RATE_LIMITED" && thai(r.v?.message)).length;
    const keys = ((await P.chatRateBucket.findMany({ where: { createdAt: { gte: RUN_START } } })) as Any[]).map((b) => String(b.key));
    chk("C2.6-S6.4", "DB rate limit (replaces the in-memory limiter): 5 parallel from ONE ip with perIpPerMin 3 ⇒ exactly 3 rows + 2 RATE_LIMITED · 6 parallel from distinct ips with perFormPerMin 4 ⇒ exactly 4 rows + 2 RATE_LIMITED · keys start `form:`, no raw IP",
      nIp === 3 && limited(rIp) === 2 && nF === 4 && limited(rF) === 2 && keys.some((k) => k.startsWith("form:")) && !keys.some((k) => k.includes(oneIp)),
      "3 · 4", `perIp rows=${nIp} limited=${limited(rIp)} perForm rows=${nF} limited=${limited(rF)} formKeys=${keys.filter((k) => k.startsWith("form:")).length}`);
  }
  {
    const fT = await mkForm(tidA, "turnstile", { spamGuard: { turnstile: true } });
    const calls: string[] = [];
    const verify = (ans: boolean) => async (tok: string) => { calls.push(tok); return ans; };
    const offKeys = await submitG(fT, { name: pii(`เทิร์น ${TAG}-${nx()}`) }, {}, { turnstileToken: "t0" }, { turnstileVerify: verify(false) });
    const callsOff = calls.length;
    process.env.TURNSTILE_SECRET_KEY = "qc-c26-fake-turnstile";
    const bad = await submitG(fT, { name: pii(`เทิร์น ${TAG}-${nx()}`) }, {}, { turnstileToken: "t-bad" }, { turnstileVerify: verify(false) });
    const good = await submitG(fT, { name: pii(`เทิร์น ${TAG}-${nx()}`) }, {}, { turnstileToken: "t-good" }, { turnstileVerify: verify(true) });
    delete process.env.TURNSTILE_SECRET_KEY;
    const rows = (await subsOf(fT.id)).length;
    const cfFetch = FETCHES.some((f) => /challenges\.cloudflare\.com/.test(f.url));
    chk("C2.6-S6.7", "Turnstile: spamGuard.turnstile on but no TURNSTILE_SECRET_KEY ⇒ not enforced (verify never called) · key set ⇒ verified server-side: false ⇒ TURNSTILE Thai + nothing written · true ⇒ accepted",
      offKeys.ok && offKeys.v?.ok === true && callsOff === 0 && bad.ok && bad.v?.ok === false && bad.v?.reason === "TURNSTILE" && thai(bad.v?.message) &&
        good.ok && good.v?.ok === true && calls.includes("t-bad") && calls.includes("t-good") && rows === 2 && !cfFetch,
      "optional", `off=${cut(j(offKeys.v ?? offKeys.err), 50)} calls=${calls.join(",")} bad=${bad.v?.reason} good=${good.v?.ok} rows=${rows}`, "MAJOR");
  }
  {
    const fU = await mkForm(tidA, "noutm", { utmCapture: false });
    const r = await submitG(fU, { name: pii(`ไม่เก็บยูทีเอ็ม ${TAG}`) }, { utm: { source: "fb" }, pageUrl: `${OR_A}/x?utm_source=fb` });
    const row: Any = (await subsOf(fU.id))[0] ?? null;
    const embed = typeof FORMS_F.formEmbedCode === "function" ? String(FORMS_F.formEmbedCode({ publicToken: fU.publicToken }, BASE)) : "";
    let frameOk = true;
    let frameInfo = "no iframe";
    if (/<iframe/i.test(embed)) {
      try {
        const NR = NEXT_SERVER.NextRequest;
        const pf = PROXY.proxy(new NR(`${BASE}/f/${fU.publicToken}`));
        const pa = PROXY.proxy(new NR(`${BASE}/app/x`));
        frameOk = (pf.headers.get("x-frame-options") ?? "").toUpperCase() !== "DENY" && (pa.headers.get("x-frame-options") ?? "").toUpperCase() === "DENY";
        frameInfo = `f=${pf.headers.get("x-frame-options")} app=${pa.headers.get("x-frame-options")}`;
      } catch (e) { frameOk = false; frameInfo = `THROW ${cut(String(e), 80)}`; }
    }
    chk("C2.6-S6.8", "utmCapture false ⇒ FormSubmission.utm null · formEmbedCode contains <origin>/f/<publicToken> · an iframe embed is not blocked by X-Frame-Options DENY on /f/* (still DENY on /app)",
      r.ok && r.v?.ok === true && !!row && row.utm === null && embed.includes(`${BASE}/f/${fU.publicToken}`) && frameOk,
      "ok", `${rd(r)} utm=${j(row?.utm)} embed=${cut(embed, 80)} frame=${frameInfo}`, "MAJOR");
  }
  {
    const crossForm = await mkForm(tidA, "cross", { crmSystemId: crmB });
    const r = await submitG(crossForm, { name: pii(`ข้ามร้าน ${TAG}`), email: mailOf("cross") }, {});
    await pump([tidA, tidB]);
    const row: Any = (await subsOf(crossForm.id))[0] ?? null;
    const c: Any = row?.crmContactId ? await P.crmContact.findFirst({ where: { id: row.crmContactId } }) : null;
    const inB = await P.crmContact.count({ where: { tenantId: tidB } });
    const sfOther = await call(TR.saveFormTarget, cB, owner, fMain.id, { scoreOnSubmit: 99 });
    const sfBadSys = await call(TR.saveFormTarget, cA, owner, fMain.id, { crmSystemId: crmB });
    const sfBadRule = await call(TR.saveFormTarget, cA, owner, fMain.id, { crmSystemId: crmA, assignRuleId: ruleM?.id ?? "x" });
    const fNow: Any = await P.formDef.findFirst({ where: { id: fMain.id } });
    chk("C2.6-X1.1", "X1 forms: crmSystemId pointing at ANOTHER tenant's CRM ⇒ lead lands in the form tenant's first CRM (crmA), tenant B untouched · saveFormTarget on another tenant's form ⇒ NOT_FOUND · crmSystemId of another tenant / assignRuleId of another system ⇒ VALIDATION · FormDef unchanged",
      r.ok && c?.tenantId === tidA && c?.systemId === crmA && inB === 0 && refused(sfOther, "NOT_FOUND") && refused(sfBadSys, "VALIDATION") && refused(sfBadRule, "VALIDATION") &&
        fNow?.scoreOnSubmit === 15 && fNow?.crmSystemId === crmA2,
      "isolated", `lead=${c?.systemId === crmA ? "crmA" : c?.systemId} inB=${inB} other=${rd(sfOther)} badSys=${rd(sfBadSys)} badRule=${rd(sfBadRule)} form=${fNow?.scoreOnSubmit}/${fNow?.crmSystemId === crmA2}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4.4 shared device · X4 identify twice / parallel · X8 opt-out
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── S4.4 / X4 / X8 · identify ──");
  {
    const V = vid();
    const ctP = await rawContact(tidA, crmA, "คนแรก", userA);
    const ctQ = await rawContact(tidA, crmA, "คนที่สอง", userA);
    await acceptAndBrowse(crmA, OR_A, V, [`${OR_A}/s1`]);
    const i1 = await call(TR.identify, { tenantId: tidA, systemId: crmA }, { visitorId: V, contactId: ctP.id, by: "PORTAL" });
    const i2 = await call(TR.identify, { tenantId: tidA, systemId: crmA }, { visitorId: V, contactId: ctQ.id, by: "FORM" });
    const mid = await sessionsOf(tidA, V);
    for (const s of mid) await P.crmWebSession.update({ where: { id: s.id }, data: { lastSeenAt: new Date(Date.now() - 3_600_000) } });
    await postE(pageBody(crmA, V, `${OR_A}/s2`), { origin: OR_A });
    const fin = await sessionsOf(tidA, V);
    const newer = fin.filter((s) => !mid.some((m) => m.id === s.id));
    chk("C2.6-S4.4", "shared device: visitor identified as P (PORTAL) · identify as Q later ⇒ P's session stays P (never re-bound) · the NEXT session (after 30-min idle) belongs to Q",
      i1.ok && Number(i1.v?.bound) === 1 && i2.ok && Number(i2.v?.bound) === 0 && mid.every((s) => s.contactId === ctP.id && s.identifiedBy === "PORTAL") &&
        newer.length === 1 && newer[0].contactId === ctQ.id,
      "P then Q", `i1=${cut(j(i1.v ?? i1.err), 60)} i2=${cut(j(i2.v ?? i2.err), 60)} mid=${mid.map((s) => (s.contactId === ctP.id ? "P" : s.contactId)).join(",")} new=${newer.map((s) => (s.contactId === ctQ.id ? "Q" : s.contactId === ctP.id ? "P" : s.contactId)).join(",")}`);
  }
  {
    // "one WEB activity per Thai day" — the boundary is Thai midnight (+07:00), never UTC midnight (lesson: UTC date arithmetic is off by one).
    // The three instants are derived from the clock at run time (never hard-coded — an oracle with a fixed date rots).
    // Three DIFFERENT visitors identify the SAME contact, so every call really binds a session (a new session of an already
    // identified visitor inherits the contact by itself and would bind 0 — contract A `identify`).
    const THAI = 7 * 3_600_000;
    const thaiDay = (t: number) => new Date(t + THAI).toISOString().slice(0, 10);
    const midnight = (() => { const d = new Date(Date.now() + THAI); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - THAI; })();
    const t1 = new Date(midnight - 60_000);            // 23:59 Thai, day D
    const t2 = new Date(midnight + 60_000);            // 00:01 Thai, day D+1 — two minutes later, same UTC date when D+1 starts after 17:00Z
    const t3 = new Date(midnight + 10 * 3_600_000);    // 10:00 Thai, still day D+1
    const ct = await rawContact(tidA, crmA, "ข้ามเที่ยงคืนไทย", userA);
    const idf = async (now: Date) => {
      const V = vid();
      await acceptAndBrowse(crmA, OR_A, V, [`${OR_A}/day${now.getTime()}`]);
      return call(TR.identify, { tenantId: tidA, systemId: crmA }, { visitorId: V, contactId: ct.id, by: "FORM" }, { now });
    };
    const r1 = await idf(t1);
    const r2 = await idf(t2);
    const r3 = await idf(t3);
    const acts = await webActivities(ct.id);
    const refs = [...new Set(acts.map((a) => String(a.sourceRef ?? "")))].sort();
    const want = [`web#${ct.id}#${thaiDay(+t1)}`, `web#${ct.id}#${thaiDay(+t2)}`].sort();
    chk("C2.6-S4.5", "one WEB activity per THAI day: two identifies two minutes apart that straddle Thai midnight (same UTC date) ⇒ TWO activities, sourceRef `web#<contactId>#<Thai YYYY-MM-DD>` · a third identify later on that same Thai day adds none",
      [r1, r2, r3].every((r) => r.ok) && [r1, r2, r3].every((r) => Number(r.v?.bound ?? 0) >= 1) &&
        acts.length === 2 && refs.length === 2 && refs[0] === want[0] && refs[1] === want[1] && thaiDay(+t1) !== thaiDay(+t2),
      `2 · ${want.join(" + ")}`, `bound=${[r1, r2, r3].map((r) => (r.ok ? String(r.v?.bound ?? "?") : `ERR ${cut(r.err, 30)}`)).join(",")} acts=${acts.length} refs=${cut(refs.join(" + "), 180)}`);
  }
  {
    const results: string[] = [];
    let ok = true;
    for (let round = 0; round < 2; round += 1) {
      const V = vid();
      const ct = await rawContact(tidA, crmA, `ขนาน${round}`, userA);
      await acceptAndBrowse(crmA, OR_A, V, [`${OR_A}/x1`, `${OR_A}/x2`]);
      for (const s of await sessionsOf(tidA, V)) await P.crmWebSession.update({ where: { id: s.id }, data: { lastSeenAt: new Date(Date.now() - 3_600_000) } });
      await postE(pageBody(crmA, V, `${OR_A}/x3`), { origin: OR_A });
      const seqFirst = round === 0 ? await call(TR.identify, { tenantId: tidA, systemId: crmA }, { visitorId: V, contactId: ct.id, by: "FORM" }) : null;
      const rs = await Promise.all(Array.from({ length: 10 }, () => call(TR.identify, { tenantId: tidA, systemId: crmA }, { visitorId: V, contactId: ct.id, by: "FORM" })));
      const boundSum = rs.reduce((n, r) => n + Number(r.v?.bound ?? 0), 0) + Number(seqFirst?.v?.bound ?? 0);
      const ss = await sessionsOf(tidA, V);
      const acts = await webActivities(ct.id);
      const evs = await identifiedEvents(tidA, ct.id);
      const good = rs.every((r) => r.ok) && boundSum === 2 && ss.length === 2 && ss.every((s) => s.contactId === ct.id) && acts.length === 1 && evs.length === 1;
      ok = ok && good;
      results.push(`r${round}: bound=${boundSum} sessions=${ss.length} acts=${acts.length} evs=${evs.length}${rs.some((r) => !r.ok) ? ` err=${rs.find((r) => !r.ok)?.err}` : ""}`);
    }
    chk("C2.6-X4.2", "identify twice (sequential then 10 in parallel, 2 rounds) ⇒ the 2 sessions bound once (Σ bound = 2) · ONE WEB activity for the day · ONE crm.web.identified",
      ok, "once", results.join(" | "));
  }
  {
    const V = vid();
    const ctO = await rawContact(tidA, crmA, "ไม่ให้ติดตาม", userA, { trackingOptOut: true });
    await acceptAndBrowse(crmA, OR_A, V, [`${OR_A}/o1`]);
    const r = await call(TR.identify, { tenantId: tidA, systemId: crmA }, { visitorId: V, contactId: ctO.id, by: "FORM" });
    const ss = await sessionsOf(tidA, V);
    const acts = await webActivities(ctO.id);
    const evs = await identifiedEvents(tidA, ctO.id);
    // a visitor already bound to a contact that LATER opts out stops being collected
    const V2 = vid();
    const ctL = await rawContact(tidA, crmA, "ถอนทีหลัง", userA);
    await acceptAndBrowse(crmA, OR_A, V2, [`${OR_A}/l1`]);
    await call(TR.identify, { tenantId: tidA, systemId: crmA }, { visitorId: V2, contactId: ctL.id, by: "FORM" });
    await P.crmContact.update({ where: { id: ctL.id }, data: { trackingOptOut: true } }).catch(() => null);
    const before = (await visitorRows(tidA, V2)).pv;
    await postE(pageBody(crmA, V2, `${OR_A}/l2`), { origin: OR_A });
    const after = (await visitorRows(tidA, V2)).pv;
    chk("C2.6-X8.2", "trackingOptOut: identify ⇒ skipped OPT_OUT (no binding, no WEB activity, no event) · a visitor bound to a contact that later opts out ⇒ page posts store nothing more",
      r.ok && Number(r.v?.bound ?? -1) === 0 && r.v?.skipped === "OPT_OUT" && ss.every((s) => s.contactId === null) && acts.length === 0 && evs.length === 0 && before === 1 && after === 1,
      "no tracking", `r=${cut(j(r.v ?? r.err), 80)} bound=${ss.map((s) => s.contactId ?? "-").join(",")} acts=${acts.length} evs=${evs.length} pv ${before}→${after}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X3 — concurrency: link counters (in-process + worker PROCESSES) · 1,000 page views for one visitor (+ PROCESSES)
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── X3 · concurrency ──");
  const runWorkers = async (jobs: [string, Any][]): Promise<{ outs: string[][]; spawned: boolean }> => {
    const startAt = Date.now() + 45_000;
    const outs = await Promise.all(jobs.map(([mode, arg]) => new Promise<string>((resolve) => {
      const enc = Buffer.from(JSON.stringify(arg), "utf8").toString("base64url");
      const ch = spawn("pnpm", ["exec", "tsx", THIS_FILE, "--x3-worker", mode, String(startAt), enc], { env: process.env });
      let o = "";
      const to = setTimeout(() => { try { ch.kill("SIGKILL"); } catch { /* gone */ } }, 300_000);
      ch.stdout.on("data", (d: Any) => { o += String(d); });
      ch.stderr.on("data", (d: Any) => { o += String(d); });
      ch.on("error", (e: Any) => { clearTimeout(to); resolve(`SPAWN-ERROR ${String(e)}`); });
      ch.on("close", () => { clearTimeout(to); resolve(o); });
    })));
    const parsed = outs.map((o) => { const m = /X3WORKER (\[.*\])/.exec(o); return m ? (JSON.parse(m[1]) as string[]) : ["NO-OUTPUT"]; });
    return { outs: parsed, spawned: parsed.every((p) => !p.includes("NO-OUTPUT")) };
  };
  {
    const L = await call(TR.createLink, cA, owner, { url: `https://${DOM_A}/race`, name: "race" });
    const code = String(L.v?.code ?? "-");
    const rs = await Promise.all([
      ...Array.from({ length: 12 }, () => getLink(code, { ip: ipNew() })),
      ...Array.from({ length: 12 }, () => getLink(code, { ip: ipNew(), cookie: "sd_u=1" })),
    ]);
    const row: Any = L.v?.id ? await linkRow(L.v.id) : null;
    const nClicks = L.v?.id ? (await clickRows(L.v.id)).length : -1;
    chk("C2.6-X3.1", "24 parallel clicks (12 without, 12 with the sd_u cookie) ⇒ clicks 24 · uniqueClicks 12 · 24 click rows (single-statement increments)",
      rs.every((r) => r.status === 302) && row?.clicks === 24 && row?.uniqueClicks === 12 && nClicks === 24, "24/12/24", `row=${row?.clicks}/${row?.uniqueClicks} rows=${nClicks}`);
  }
  {
    const L = await call(TR.createLink, cA, owner, { url: `https://${DOM_A}/race-proc`, name: "race-proc" });
    const code = String(L.v?.code ?? "-");
    const w = await runWorkers([["click", { code, n: 10, ipBase: "10.99.1" }], ["click", { code, n: 10, ipBase: "10.99.2" }]]);
    const flat = w.outs.flat();
    chk("C2.6-X3.2a", "[positive control] 2 worker PROCESSES ran and returned 20 click answers — if red, X3.2 proves nothing", w.spawned && flat.length === 20, "20", `${flat.length} ${cut(flat.filter((x) => x !== "302").slice(0, 2).join(" | "), 160)}`, "MAJOR");
    const row: Any = L.v?.id ? await linkRow(L.v.id) : null;
    chk("C2.6-X3.2", "2 PROCESSES × 10 parallel clicks (own pools) ⇒ clicks 20 · uniqueClicks 20 · all 302",
      w.spawned && flat.every((x) => x === "302") && row?.clicks === 20 && row?.uniqueClicks === 20, "20/20", `row=${row?.clicks}/${row?.uniqueClicks}`);
  }
  {
    const V = vid();
    await postC(consentBody(crmA, V, "accept", `${OR_A}/`), { origin: OR_A });
    const t0 = Date.now();
    const rs = await Promise.all(Array.from({ length: 1000 }, (_x, i) => call(TR.collect, pageBody(crmA, V, `${OR_A}/p${i}`),
      { origin: OR_A, ip: `10.77.${i >> 8}.${i & 255}`, userAgent: uaHuman, bytes: 200 }, { limiter: async () => ({ ok: true }) })));
    const rows = await visitorRows(tidA, V);
    chk("C2.6-X3.3", "1,000 page-view posts IN PARALLEL for one consented visitor ⇒ exactly ONE session · pageViews 1000 · 1000 PAGEVIEW rows",
      rs.every((r) => r.ok) && rows.s.length === 1 && rows.s[0]?.pageViews === 1000 && rows.pv === 1000,
      "1 / 1000 / 1000", `errors=${rs.filter((r) => !r.ok).length}${rs.find((r) => !r.ok) ? ` (${rs.find((r) => !r.ok)?.err})` : ""} sessions=${rows.s.length} pageViews=${rows.s.map((s) => s.pageViews).join(",")} pv=${rows.pv} ${Date.now() - t0} ms`);
  }
  {
    const V = vid();
    await postC(consentBody(crmA, V, "accept", `${OR_A}/`), { origin: OR_A });
    const arg = (b: string) => ({ siteKey: SITE[crmA], visitorId: V, cv: CV[crmA] ?? 1, origin: OR_A, url: `${OR_A}/w`, n: 40, ipBase: b });
    const [w, local] = await Promise.all([
      runWorkers([["page", arg("10.98.1")], ["page", arg("10.98.2")]]),
      (async () => { await sleep(45_000); return Promise.all(Array.from({ length: 40 }, (_x, i) => call(TR.collect, pageBody(crmA, V, `${OR_A}/l${i}`), { origin: OR_A, ip: `10.98.3.${i + 1}`, userAgent: uaHuman, bytes: 200 }, { limiter: async () => ({ ok: true }) }))); })(),
    ]);
    const rows = await visitorRows(tidA, V);
    chk("C2.6-X3.4", "2 PROCESSES × 40 + 40 in-process page posts at the same instant for one visitor ⇒ ONE session · pageViews 120 · 120 PAGEVIEW rows",
      w.spawned && w.outs.flat().every((x) => x === "OK") && local.every((r) => r.ok) && rows.s.length === 1 && rows.s[0]?.pageViews === 120 && rows.pv === 120,
      "1 / 120", `spawned=${w.spawned} workerErr=${cut(w.outs.flat().filter((x) => x !== "OK").slice(0, 2).join(" | "), 120)} sessions=${rows.s.length} pageViews=${rows.s.map((s) => s.pageViews).join(",")} pv=${rows.pv}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 + X5 — purge (retention)
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── S5 / X5 · purge ──");
  const oldSession = async (tid: string, sys: string, days: number, contactId: string | null = null) => {
    const s: Any = await P.crmWebSession?.create?.({ data: { tenantId: tid, systemId: sys, visitorId: vid(), contactId, consentVersion: 1, consentAt: new Date(Date.now() - days * DAY),
      startedAt: new Date(Date.now() - days * DAY), lastSeenAt: new Date(Date.now() - days * DAY), pageViews: 2, firstUrl: `https://${DOM_A2}/old`, ipHash: sha(`${TAG}${nx()}`),
      userAgent: uaHuman, identifiedBy: contactId ? "FORM" : null } }).catch(() => null);
    if (s) for (let i = 0; i < 2; i += 1) await P.crmWebEvent.create({ data: { tenantId: tid, sessionId: s.id, kind: "PAGEVIEW", url: `https://${DOM_A2}/old${i}`, at: new Date(Date.now() - days * DAY) } }).catch(() => null);
    return s;
  };
  const ctPurge = await rawContact(tidA, crmA2, "ลูกค้าเก่า", userA);
  const sUn = await oldSession(tidA, crmA2, 40);
  const sId = await oldSession(tidA, crmA2, 40, ctPurge.id);
  const sKeepA = await oldSession(tidA, crmA, 40);
  const sRecent = await oldSession(tidA, crmA2, 5);
  const sV1 = await oldSession(tidV, crmV, 200);
  const pr = await call(TR.purgeWeb, new Date(), { tenantIds: [tidA, tidV] });
  const byId = async (id: string | undefined) => (id ? ((await P.crmWebSession?.findFirst?.({ where: { id } }).catch(() => null)) ?? null) : null) as Any;
  const evN = async (id: string | undefined) => (id ? (await eventsOfSessions([id])).length : -1);
  {
    const [un, keepA, recent] = [await byId(sUn?.id), await byId(sKeepA?.id), await byId(sRecent?.id)];
    chk("C2.6-S5.1", "purgeWeb: crmA2 (retention 30 d) unidentified session 40 d old ⇒ DELETED with its events · 5-day-old session kept · crmA (retention 180 d) 40-day-old session kept (per-system retention)",
      pr.ok && !!sUn && un === null && (await evN(sUn?.id)) === 0 && !!recent && (await evN(sRecent?.id)) === 2 && !!keepA && (await evN(sKeepA?.id)) === 2,
      "per retention", `${rd(pr)} ${cut(j(pr.v), 100)} un=${un ? "kept" : "gone"} recent=${recent ? "kept" : "gone"} keepA=${keepA ? "kept" : "gone"}`);
  }
  {
    const s: Any = await byId(sId?.id);
    chk("C2.6-S5.2", "identified session past retention ⇒ events deleted, session kept as a summary (contactId, pageViews 2, firstUrl) with ipHash null, userAgent null, purgedAt set",
      !!s && s.contactId === ctPurge.id && s.pageViews === 2 && !!s.firstUrl && s.ipHash === null && s.userAgent === null && !!s.purgedAt && (await evN(sId?.id)) === 0,
      "summarised", cut(j(s && { contactId: s.contactId === ctPurge.id, pv: s.pageViews, ip: s.ipHash, ua: s.userAgent, purgedAt: s.purgedAt, ev: await evN(sId?.id) }), 200));
  }
  chk("C2.6-U.5", "PROPOSED: purge also covers uiVersion-1 systems (retention is a legal duty) — a 200-day-old session of the v1 system is deleted",
    !!sV1 && (await byId(sV1.id)) === null, "deleted", `v1=${sV1 ? ((await byId(sV1.id)) ? "kept" : "gone") : "fixture-missing"}`, "MAJOR");
  {
    const batch = [] as Any[];
    for (let i = 0; i < 6; i += 1) batch.push(await oldSession(tidA, crmA2, 50));
    const [a, b] = await Promise.all([call(TR.purgeWeb, new Date(), { tenantIds: [tidA] }), call(TR.purgeWeb, new Date(), { tenantIds: [tidA] })]);
    const left = (await Promise.all(batch.map((s) => byId(s?.id)))).filter(Boolean).length;
    const sum = Number(a.v?.sessionsDeleted ?? 0) + Number(b.v?.sessionsDeleted ?? 0);
    const c = await call(TR.purgeWeb, new Date(), { tenantIds: [tidA] });
    chk("C2.6-X5.1", "two OVERLAPPING purge runs over 6 expired sessions ⇒ both succeed, Σ sessionsDeleted = 6 (not 12), none left · a third run deletes 0 (idempotent)",
      a.ok && b.ok && batch.every(Boolean) && sum === 6 && left === 0 && c.ok && Number(c.v?.sessionsDeleted ?? -1) === 0,
      "6 once", `a=${cut(j(a.v ?? a.err), 80)} b=${cut(j(b.v ?? b.err), 80)} left=${left} third=${cut(j(c.v ?? c.err), 60)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X1 — isolation (tenant · system in the same tenant · visibility)
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── X1 · isolation ──");
  {
    const st2 = await call(TR.linkStats, cA2, owner, L1.id ?? "-", {});
    const stB = await call(TR.linkStats, cB, owner, L1.id ?? "-", {});
    const upB = await call(TR.updateLink, cB, owner, L1.id ?? "-", { url: "https://evil.test/" });
    const delA2 = await call(TR.deleteLink, cA2, owner, L1.id ?? "-", { confirm: true, reason: "ลบข้ามระบบ" });
    const listA2 = await call(TR.listLinks, cA2, owner);
    const row: Any = L1.id ? await linkRow(L1.id) : null;
    const same = (a: Res, b: Res) => a.msg === b.msg;
    chk("C2.6-X1.2", "a link of crmA is invisible from crmA2 (same tenant) and from tenant B: stats/update/delete ⇒ NOT_FOUND with the same message as a missing id · listLinks(crmA2) excludes it · row unchanged",
      [st2, stB, upB, delA2].every((r) => refused(r, "NOT_FOUND")) && same(st2, await call(TR.linkStats, cA2, owner, `${TAG}-nope`, {})) &&
        listA2.ok && Array.isArray(listA2.v) && !listA2.v.some((l: Any) => l.id === L1.id) && row?.url === URL1 && row?.active === true,
      "404", `${[st2, stB, upB, delA2].map(rd).join(" | ")} list=${Array.isArray(listA2.v) ? listA2.v.length : rd(listA2)}`);
  }
  {
    const V = vid();
    const ctA = await rawContact(tidA, crmA, "ข้ามร้าน-A", userA);
    const ctA2 = await rawContact(tidA, crmA2, "ข้ามระบบ-A2", userA);
    await acceptAndBrowse(crmA, OR_A, V, [`${OR_A}/i1`]);
    await acceptAndBrowse(crmB, OR_B, V, [`${OR_B}/i1`]);
    await acceptAndBrowse(crmA2, OR_A2, V, [`${OR_A2}/i1`]);
    const wrongSys = await call(TR.identify, { tenantId: tidA, systemId: crmA }, { visitorId: V, contactId: ctA2.id, by: "FORM" });
    const wrongTen = await call(TR.identify, { tenantId: tidB, systemId: crmB }, { visitorId: V, contactId: ctA.id, by: "FORM" });
    const good = await call(TR.identify, { tenantId: tidA, systemId: crmA }, { visitorId: V, contactId: ctA.id, by: "FORM" });
    const sA = (await sessionsOf(tidA, V)).filter((s) => s.systemId === crmA);
    const sA2 = (await sessionsOf(tidA, V)).filter((s) => s.systemId === crmA2);
    const sB = await sessionsOf(tidB, V);
    chk("C2.6-X1.3", "the SAME visitorId on three sites (crmA · crmA2 · tenant B) ⇒ three separate sessions · identify with a contact of another system/tenant ⇒ nothing bound · identify in crmA binds ONLY crmA's session",
      sA.length === 1 && sA2.length === 1 && sB.length === 1 && sB[0].tenantId === tidB && Number(wrongSys.v?.bound ?? 0) === 0 && Number(wrongTen.v?.bound ?? 0) === 0 &&
        good.ok && Number(good.v?.bound) === 1 && sA[0].contactId === ctA.id && sA2[0].contactId === null && sB[0].contactId === null,
      "isolated", `A=${sA.map((s) => s.contactId ?? "-")} A2=${sA2.map((s) => s.contactId ?? "-")} B=${sB.map((s) => s.contactId ?? "-")} wrongSys=${cut(j(wrongSys.v ?? wrongSys.err), 60)} wrongTen=${cut(j(wrongTen.v ?? wrongTen.err), 60)}`);
  }
  {
    const tlOwner = await call(TR.webTimeline, cA2, owner, lead?.id ?? "-");
    const tlStaff = await call(TR.webTimeline, { ...cA2, actorUserId: userS }, staff, lead?.id ?? "-");
    const tlCross = await call(TR.webTimeline, cA, owner, lead?.id ?? "-");
    const tlB = await call(TR.webTimeline, cB, owner, lead?.id ?? "-");
    const sess = Array.isArray(tlOwner.v?.sessions) ? tlOwner.v.sessions : [];
    const leak = /ipHash|userAgent/.test(j(tlOwner.v)) || RAW_IPS.some((x) => j(tlOwner.v).includes(x));
    const stats = await call(TR.webStats, cA2, owner, { days: 30 });
    const dbSessions = (await safeMany("crmWebSession", { where: { systemId: crmA2, startedAt: { gte: new Date(Date.now() - 30 * DAY) } } })).length;
    chk("C2.6-X1.4", "webTimeline: owner sees the lead's 2 sessions with events (no ipHash/userAgent in the DTO) · STAFF who cannot see the contact / crmA ctx / tenant B ⇒ NOT_FOUND · webStats(crmA2).sessions = the DB count of crmA2 only",
      tlOwner.ok && sess.length === 2 && sess.every((s: Any) => Array.isArray(s.events) && s.events.length > 0) && !leak &&
        [tlStaff, tlCross, tlB].every((r) => refused(r, "NOT_FOUND")) && stats.ok && Number(stats.v?.sessions) === dbSessions,
      "visibility", `owner=${rd(tlOwner)}:${sess.length} leak=${leak} staff=${rd(tlStaff)} cross=${rd(tlCross)} B=${rd(tlB)} stats=${cut(j(stats.v ?? stats.err), 80)} db=${dbSessions}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // U — PERMANENT RULE: uiVersion-1 system
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── U · uiVersion 1 ──");
  {
    const before = { links: (await safeMany("crmTrackedLink", { where: { tenantId: tidV } })).length, set: j(await crmSettings(crmV)) };
    const r1 = await call(TR.createLink, cV, owner, { url: `https://${DOM_V}/x`, name: "v1" });
    const r2 = await call(TR.saveWebSettings, cV, owner, { domains: ["evil.test"] });
    const r3 = await call(TR.listFormTargets, cV, owner);
    const r4 = await call(TR.identify, { tenantId: tidV, systemId: crmV }, { visitorId: vid(), contactId: `${TAG}-x`, by: "FORM" });
    const after = { links: (await safeMany("crmTrackedLink", { where: { tenantId: tidV } })).length, set: j(await crmSettings(crmV)) };
    chk("C2.6-U.1", "uiVersion 1: createLink / saveWebSettings / listFormTargets refused with CrmV2DisabledError (nothing written, settings byte-identical) · identify ⇒ skipped V1",
      [r1, r2, r3].every((r) => isV1Refusal(r, V1MSG)) && r4.ok && r4.v?.skipped === "V1" && Number(r4.v?.bound ?? 0) === 0 && before.links === after.links && before.set === after.set,
      "refused", `${[r1, r2, r3].map(rd).join(" | ")} identify=${cut(j(r4.v ?? r4.err), 60)}`);
  }
  {
    const V = vid();
    const rs = [await postC({ k: KEY_V, v: V, cv: 1, d: "accept", u: `${OR_V}/` }, { origin: OR_V }), await postE({ k: KEY_V, v: V, cv: 1, t: "page", u: `${OR_V}/p` }, { origin: OR_V })];
    const rows = await visitorRows(tidV, V);
    chk("C2.6-U.2", "uiVersion 1 with tracking settings present: /t/consent + /t/e ⇒ 204 empty and ZERO rows (resolveSite returns null)",
      rs.every(is204Empty) && rows.s.length === 0 && (await call(TR.resolveSite, KEY_V)).v == null, "0 rows", `${rs.map((r) => r.status)} sessions=${rows.s.length}`);
  }
  {
    const code = `v1${rand}link`;
    const l: Any = await P.crmTrackedLink?.create?.({ data: { tenantId: tidV, systemId: crmV, code, url: `https://${DOM_V}/printed-qr` } }).catch(() => null);
    const r = await getLink(code, { ip: ipNew() });
    const row: Any = l ? await linkRow(l.id) : null;
    chk("C2.6-U.3", "uiVersion 1: an existing printed link still redirects to its stored url (302) but nothing is counted (clicks 0, no click row)",
      !!l && r.status === 302 && loc(r) === `https://${DOM_V}/printed-qr` && row?.clicks === 0 && (await clickRows(l.id)).length === 0,
      "302, dormant", `status=${r.status} loc=${cut(loc(r), 60)} clicks=${row?.clicks}`);
  }
  {
    const fV = await mkForm(tidV, "v1form", { crmSystemId: crmV, scoreOnSubmit: 20 });
    const V = vid();
    const hp = await submitG(fV, { name: pii(`บอท ${TAG}`) }, {}, { hp: "spam" });
    const r = await submitG(fV, { name: pii(`ลีดวีหนึ่ง ${TAG}`), email: mailOf("v1") }, { visitorId: V });
    await pump([tidV]);
    const subs = await subsOf(fV.id);
    const c: Any = subs[0]?.crmContactId ? await P.crmContact.findFirst({ where: { id: subs[0].crmContactId } }) : null;
    const acts = c ? await webActivities(c.id) : [];
    const logs = c ? await safeMany("crmScoreLog", { where: { contactId: c.id } }) : [];
    chk("C2.6-U.4", "form → uiVersion-1 CRM: honeypot still drops (spam guard is the forms module's) · the C1.8 v1 lead path is unchanged (contact in crmV) with NO score, NO score log, NO WEB activity",
      hp.ok && hp.v?.id === null && r.ok && r.v?.ok === true && subs.length === 1 && c?.systemId === crmV && Number(c?.score ?? 0) === 0 && logs.length === 0 && acts.length === 0,
      "v1 unchanged", `hp=${cut(j(hp.v ?? hp.err), 50)} subs=${subs.length} contact=${c?.systemId === crmV} score=${c?.score} logs=${logs.length} acts=${acts.length}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X9 — keys · confirm · audit
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── X9 · keys / confirm / audit ──");
  {
    const n0 = (await safeMany("crmTrackedLink", { where: { systemId: crmA } })).length;
    const sStaff = await call(TR.createLink, { ...cA, actorUserId: userS }, staff, { url: `https://${DOM_A}/s`, name: "staff" });
    const sStaffW = await call(TR.saveWebSettings, { ...cA, actorUserId: userS }, staff, { domains: ["evil.test"] });
    const sMgr = await call(TR.createLink, { ...cA, actorUserId: userM }, manager, { url: `https://${DOM_A}/m`, name: "manager" });
    const n1 = (await safeMany("crmTrackedLink", { where: { systemId: crmA } })).length;
    chk("C2.6-X9.1", "STAFF without crm.tracking.manage ⇒ FORBIDDEN Thai on createLink/saveWebSettings, nothing written · MANAGER (default keys) may create (positive control)",
      refused(sStaff, "FORBIDDEN") && refused(sStaffW, "FORBIDDEN") && sMgr.ok && n1 === n0 + 1 && j((await crmSettings(crmA))?.tracking?.web?.domains) === j([DOM_A]),
      "403 + mgr ok", `staff=${rd(sStaff)} staffW=${rd(sStaffW)} mgr=${rd(sMgr)} rows ${n0}→${n1}`);
  }
  {
    const L = await call(TR.createLink, cA, owner, { url: `https://${DOM_A}/del`, name: "del" });
    const id = String(L.v?.id ?? "-");
    const d0 = await call(TR.deleteLink, cA, owner, id, {});
    const d1 = await call(TR.deleteLink, cA, owner, id, { confirm: true, reason: "ลบ" });
    const kept = !!(await linkRow(id));
    const d2 = await call(TR.deleteLink, cA, owner, id, { confirm: true, reason: "แคมเปญจบแล้ว" });
    const gone = !(await linkRow(id));
    const acts = ((await P.auditLog.findMany({ where: { tenantId: tidA, action: { startsWith: "crm.tracking." } } })) as Any[]).map((a) => String(a.action));
    const need = ["crm.tracking.link.create", "crm.tracking.link.update", "crm.tracking.link.delete", "crm.tracking.web.settings"];
    const auditTxt = j(await P.auditLog.findMany({ where: { tenantId: { in: TENANTS }, action: { startsWith: "crm.tracking." } } }));
    chk("C2.6-X9.2", "deleteLink is DANGER: no confirm ⇒ CONFIRM_REQUIRED · reason < 5 chars ⇒ VALIDATION (row kept) · confirmed ⇒ deleted · audit rows exist for link.create/update/delete + web.settings, none carrying PII of this run",
      refused(d0, "CONFIRM_REQUIRED") && refused(d1, "VALIDATION") && kept && d2.ok && gone && need.every((a) => acts.includes(a)) && !PII.some((x) => auditTxt.includes(x)),
      "confirm + audit", `d0=${rd(d0)} d1=${rd(d1)} kept=${kept} d2=${rd(d2)} gone=${gone} missing=${need.filter((a) => !acts.includes(a)).join(",") || "-"}`);
  }
  {
    const obx = j(await P.outboxEvent.findMany({ where: { tenantId: { in: TENANTS }, type: { startsWith: "crm.web." } } }));
    const ops = j(await P.opsEvent?.findMany?.({ where: { createdAt: { gte: RUN_START } } }).catch(() => []) ?? []);
    const logs = LOGS.join("\n");
    const hits = PII.filter((x) => obx.includes(x) || ops.includes(x) || logs.includes(x));
    const ipHits = RAW_IPS.filter((x) => new RegExp(`(^|[^0-9.])${x.replace(/\./g, "\\.")}([^0-9.]|$)`).test(obx + ops));
    chk("C2.6-X8.3", "no PII of this run (names/phones/e-mails) in crm.web.* outbox payloads, OpsEvent rows since start or captured logs · no raw IP in outbox/OpsEvent",
      hits.length === 0 && ipHits.length === 0, "clean", `pii=${hits.slice(0, 3).join(",") || "-"} ip=${ipHits.slice(0, 3).join(",") || "-"}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S8 — UI (static; the PARITY verdict against mockups 11 + 16 at 1440/390 is the controller's gate D7, incl. a uiVersion-1 probe)
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── S8 · UI (static) ──");
  const pTrack = read(P_TRACK);
  const pForms = read(P_FORMS);
  const uiAll = [pTrack, pForms, ...walk(`${CRM_PAGES}/settings/tracking`).map(read), ...walk(`${CRM_PAGES}/settings/forms`).map(read), ...walk(UI_DIR).map(read)].join("\n");
  const guarded = (s: string) => /type:\s*["']CRM["']/.test(s) && /requireCrmV2Page/.test(s) && /crmCan\([^)]*crm\.tracking\.manage/.test(s) && /notFound\(\)/.test(s);
  {
    const nav = read(NAV);
    const navOk = /key:\s*["']settings-tracking["'][^}]*path:\s*["']\/crm\/settings\/tracking["'][^}]*wo:\s*["']C2\.6["']/.test(nav) &&
      /key:\s*["']settings-forms["'][^}]*path:\s*["']\/crm\/settings\/forms["'][^}]*wo:\s*["']C2\.6["']/.test(nav);
    chk("C2.6-S8.1", "pages /crm/settings/tracking and /crm/settings/forms exist, guarded (CRM type → requireCrmV2Page → crm.tracking.manage → notFound) and registered in nav.ts (settings-tracking / settings-forms, wo C2.6)",
      guarded(pTrack) && guarded(pForms) && navOk, "2 guarded pages", `track=${pTrack.length > 0}/${guarded(pTrack)} forms=${pForms.length > 0}/${guarded(pForms)} nav=${navOk}`);
  }
  const TIDS = ["crm-track-web-enabled", "crm-track-domain-input", "crm-track-domain-add", "crm-track-embed-code", "crm-track-consent-text", "crm-track-consent-version-bump",
    "crm-track-retention", "crm-track-save", "crm-track-preview", "crm-track-stats", "crm-link-url", "crm-link-name", "crm-link-create", "crm-link-row-", "crm-link-qr-",
    "crm-link-toggle-", "crm-link-delete-", "crm-forms-row-", "crm-forms-system-", "crm-forms-assign-", "crm-forms-score-", "crm-forms-spam-", "crm-forms-embed-"];
  {
    const miss = TIDS.filter((t) => !uiAll.includes(t));
    const labels = ["โดเมนที่อนุญาต", "โค้ดฝัง", "cookie consent", "เวอร์ชัน", "ไม่เก็บ IP เต็ม", "ลิงก์ติดตาม"].filter((l) => !uiAll.includes(l));
    chk("C2.6-S8.2", `settings UI carries the ${TIDS.length} testids of mockups 16 + 11 and the Thai labels (โดเมนที่อนุญาต · โค้ดฝัง · cookie consent · เวอร์ชัน · ไม่เก็บ IP เต็ม · ลิงก์ติดตาม)`,
      miss.length === 0 && labels.length === 0, "all", `missing=${miss.join(",") || "-"} labels=${labels.join(",") || "-"}`);
  }
  {
    const tl = read(TIMELINE);
    const users = walk(`${CRM_PAGES}/contacts`).filter((f) => /CrmWebTimeline/.test(read(f)));
    const clientBad = /^\s*["']use client["']/.test(tl) && /from\s+["'](@\/lib\/core\/db|@prisma\/client|@\/lib\/modules\/crm\/tracking["']|@\/lib\/modules\/crm["'])/.test(tl);
    const act = read(TRACK_ACT);
    const actOk = /^\s*["']use server["']/.test(act) && !/export\s+(type|interface|const|let|class|function\s)/.test(act) && /assertCrmV2/.test(act) && /assertCanCrm|crmCan/.test(act);
    chk("C2.6-S8.3", "contact 360 renders CrmWebTimeline (testid crm-web-timeline, no prisma-side import when client) · tracking-actions.ts is \"use server\" with async exports only, assertCrmV2 + crm key check",
      tl.length > 0 && /crm-web-timeline/.test(tl) && users.length > 0 && !clientBad && actOk, "timeline + actions", `tl=${tl.length > 0} users=${users.join(",") || "-"} clientBad=${clientBad} actions=${actOk}`);
  }
  {
    let rows: Any[] = [];
    try { rows = JSON.parse(read(INVENTORY) || "{}").rows ?? []; } catch { rows = []; }
    const mine = rows.filter((r) => r?.wo === "C2.6").map((r) => String(r.testid));
    const all = [...TIDS, "crm-web-timeline"];
    const miss = all.filter((t) => !mine.some((m) => m === t || m.startsWith(t) || (t.endsWith("-") && m.startsWith(t.slice(0, -1)))));
    const orphan = mine.filter((m) => !uiAll.includes(m.replace(/\*$|\[.*\]$/, "").replace(/-$/, "")));
    chk("C2.6-S8.4", "scripts/crm-ui-inventory.json has a wo \"C2.6\" row for every new testid, none orphaned", miss.length === 0 && orphan.length === 0 && mine.length >= all.length,
      "complete", `rows=${mine.length} missing=${miss.join(",") || "-"} orphan=${orphan.join(",") || "-"}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S9 — the controller's ruling ROUND 2 (24 Sep, after the independent reviewer): the six holes that were
  //   confirmed as real. Each check is written so that it can only go green when the hole is actually shut:
  //     B1  reserved field names — `website` / `st` are names a shop really uses, so the old guard swallowed
  //         every real lead of such a form (fake success, no notification, no log)
  //     S1  the `/f` lane accepted an UNSIGNED visitor uuid (`?v=` / `visitorId`) ⇒ anybody could staple
  //         someone else's 180-day browsing history onto a lead of their own
  //     S2  the identify ticket was replayable for a whole hour  ⇒ jti + 15-minute TTL
  //     S3  the public collectors read the whole body BEFORE the 8 KB cap ⇒ content-length first + capped reader
  //     S4  the start token was replayable for 24 h and a honeypot hit cost the bot nothing
  //     N7/N10/N12  consent-version bump in ONE statement · identify bound to the tenant · five canonical utm
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── S9 · ruling round 2 (B1 · S1–S4 · N7/N10/N12) ──");
  const ST_FIELD = String(SG.FORM_START_FIELD ?? "st");
  {
    // B1 — a shop form whose OWN fields are keyed `website` and `st`
    const CLASH = [
      { key: "name", label: "ชื่อ", type: "text", required: true },
      { key: "website", label: "เว็บไซต์ของบริษัท", type: "text", required: false },
      { key: "st", label: "รัฐ/จังหวัด", type: "text", required: false },
    ];
    const fC = await mkForm(tidA, "clash", { fieldsJson: CLASH, crmSystemId: crmA });
    const WEB_ANS = `https://www.${rand}-customer.example.com`;
    const ST_ANS = "ภูเก็ต";
    const okSub = await submitG(fC, { name: pii(`ลูกค้าช่องชน ${TAG}`), website: WEB_ANS, st: ST_ANS }, {});
    const row1: Any = (await subsOf(fC.id))[0] ?? null;
    const ans: Any = row1?.answersJson ?? {};
    // …and the honeypot still fires for that very form, on the RESERVED name only
    const hpSub = await submitG(fC, { name: pii(`บอทช่องชน ${TAG}`), website: WEB_ANS, st: ST_ANS }, {}, { hp: "https://bot.test" });
    const nAfterHp = (await subsOf(fC.id)).length;
    const withReserved = (k: string) => [...CLASH, { key: k, label: "ช่องของระบบ", type: "text", required: false }];
    const cfHp = await call(FORMS.createForm, { tenantId: tidA }, { name: `สงวน-hp ${TAG}`, fields: withReserved(HP) });
    const cfSt = await call(FORMS.createForm, { tenantId: tidA }, { name: `สงวน-st ${TAG}`, fields: withReserved(ST_FIELD.toUpperCase()) });
    const ufHp = await call(FORMS.updateForm, { tenantId: tidA }, fC.id, { fields: withReserved(HP) });
    const sft = await call(TR.saveFormTarget, cA, owner, fC.id, { createCompanyFromField: HP });
    const leftover = await P.formDef.count({ where: { tenantId: tidA, name: { contains: "สงวน-" } } });
    const fNow: Any = await P.formDef.findFirst({ where: { id: fC.id } });
    const fieldsNow = j(fNow?.fieldsJson ?? []);
    const namespaced = /^_sd_/.test(HP) && /^_sd_/.test(ST_FIELD) && HP !== "website" && ST_FIELD !== "st";
    const thaiRefusal = (r: Res) => !r.ok && r.code !== "MISSING_FUNCTION" && thai(r.msg) && !blames(r.msg);
    chk("C2.6-S9.1", `B1: the spam-guard field names are namespaced (${HP} / ${ST_FIELD}) — a shop form with its OWN fields keyed \`website\` + \`st\` STORES both answers on a normal submission (a real lead is never swallowed) · honeypot/token semantics apply to the reserved names only (honeypot on that same form ⇒ fake success, nothing written) · validateFields (createForm + updateForm, case-insensitive) and saveFormTarget refuse reserved keys (saveFormTarget with \`.code\` VALIDATION — CONTRACT A: every tracking error carries a code, so the settings page can point at the field) in Thai without blaming the user, and write nothing`,
      namespaced && okSub.ok && okSub.v?.ok === true && typeof okSub.v?.id === "string" && !!row1 && ans.website === WEB_ANS && ans.st === ST_ANS &&
        hpSub.ok && hpSub.v?.ok === true && hpSub.v?.id === null && nAfterHp === 1 &&
        thaiRefusal(cfHp) && thaiRefusal(cfSt) && thaiRefusal(ufHp) && refused(sft, "VALIDATION") && leftover === 0 &&
        fieldsNow.includes("website") && !fieldsNow.includes(HP),
      "stored + refused",
      `hp=${HP} st=${ST_FIELD} sub=${cut(j(okSub.v ?? okSub.err), 60)} answers=${cut(j(ans), 140)} honeypot=${cut(j(hpSub.v ?? hpSub.err), 50)}/rows=${nAfterHp} create=${rd(cfHp)}|${rd(cfSt)} update=${rd(ufHp)} target=${rd(sft)} leftoverForms=${leftover} fields=${cut(fieldsNow, 80)}`);
  }
  {
    // S1 — the `/f` lane: the visitor may come from the first-party cookie (server-read) or from the signed
    //   e-mail ticket, NEVER from an unsigned value the caller hands in. Driven through the real server action
    //   inside a Next request scope, so the cookie is read exactly the way production reads it.
    const ACT = (await import("@/app/(store)/f/[token]/actions" as string).catch(() => ({}))) as Any;
    const nw = (await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null)) as Any;
    const nwu = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null)) as Any;
    const nck = (await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null)) as Any;
    let scopeOk = false;
    const inScope = async (req: Request, fn: () => Promise<Res>): Promise<Res> => {
      if (!nw?.workAsyncStorage || !nwu?.workUnitAsyncStorage || !nck?.RequestCookies) return fn();
      const jar = new nck.RequestCookies(req.headers);
      const store = { route: "/f/[token]", forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null };
      const unit = {
        type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar,
        headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname: new URL(req.url).pathname, search: "" },
      };
      try {
        const r = await nw.workAsyncStorage.run(store, () => nwu.workUnitAsyncStorage.run(unit, fn));
        scopeOk = true;
        return r;
      } catch (e) {
        if (/AsyncLocalStorage accessed in runtime/.test(String((e as Error)?.message ?? ""))) return fn();
        throw e;
      }
    };
    const viaPage = (form: Any, answers: Record<string, unknown>, o: { cookie?: string; visitorId?: string } = {}) => {
      const req = new Request(`${BASE}/f/${form.publicToken}`, { method: "POST", headers: hdrs({ cookie: o.cookie, ip: ipNew() }) });
      return inScope(req, () =>
        call(ACT.submitFormAction, form.publicToken, {
          answers, hp: "", st: stTok(form.id),
          ...(o.visitorId ? { visitorId: o.visitorId, v: o.visitorId } : {}),
        }));
    };
    const VO = vid();
    await acceptAndBrowse(crmA, OR_A, VO, [`${OR_A}/mine`]);
    const sessVO = await sessionsOf(tidA, VO);
    const latestVO = sessVO[sessVO.length - 1]?.id ?? "-";
    const fL = await mkForm(tidA, "lane", { crmSystemId: crmA });
    const rSpoof = await viaPage(fL, { name: pii(`ปลอมตัว ${TAG}`), email: mailOf("spoof") }, { visitorId: VO });
    const subSpoof: Any = (await subsOf(fL.id))[0] ?? null;
    await pump([tidA]);
    const afterSpoof = await sessionsOf(tidA, VO);
    const rReal = await viaPage(fL, { name: pii(`เจ้าของเครื่อง ${TAG}`), email: mailOf("owner") }, { cookie: `sd_vid=${VO}` });
    const subReal: Any = (await subsOf(fL.id))[1] ?? null;
    await pump([tidA]);
    const afterReal = await sessionsOf(tidA, VO);
    // comments are stripped first: a comment that DOCUMENTS the removed `?v=` lane must not read as the lane itself
    const noComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
    const actSrc = noComments(read(FORM_ACTION));
    const pageSrc = noComments([read("src/app/(store)/f/[token]/PublicForm.tsx"), read("src/app/(store)/f/[token]/page.tsx")].join("\n"));
    const staticOk = /sd_vid|VISITOR_COOKIE/.test(actSrc) && !/visitorId\s*:\s*[^,\n]*input/.test(actSrc) && !/[?&]v=|get\(\s*["']v["']\s*\)/.test(pageSrc);
    const behaveOk = !scopeOk || (
      rSpoof.ok && !!subSpoof && subSpoof.webSessionId === null && afterSpoof.every((s) => s.contactId === null) &&
      rReal.ok && !!subReal && subReal.webSessionId === latestVO && afterReal.some((s) => s.contactId !== null));
    chk("C2.6-S9.2", "S1: the `/f` lane takes the visitor from the first-party cookie ONLY — a bare visitor uuid of ANOTHER consented visitor handed to the page/action (`visitorId` / `?v=`) binds nothing (webSessionId null, that visitor's 180-day history untouched, no session bound) · the SAME request carrying the sd_vid cookie binds (positive control) · the action never forwards a caller-supplied visitorId and the page never reads one from the URL [behaviour in a Next request scope + static]",
      staticOk && behaveOk, "cookie only",
      `scope=${scopeOk} static=${staticOk} spoof=${rd(rSpoof)} ws=${subSpoof ? subSpoof.webSessionId ?? "null" : "no-row"} bound=${afterSpoof.map((s) => s.contactId ?? "-").join(",")} · cookie=${rd(rReal)} ws=${subReal ? (subReal.webSessionId === latestVO ? "latest" : subReal.webSessionId ?? "null") : "no-row"} bound=${afterReal.map((s) => (s.contactId ? "CT" : "-")).join(",")}`,
      "MAJOR");
  }
  {
    // S2 — identify ticket: one jti, one use, 15 minutes
    const ctK = await rawContact(tidA, crmA, "ลูกค้าตั๋วครั้งเดียว", userA);
    const emK: Any = await rawEmail(tidA, crmA, ctK.id);
    const base = { tenantId: tidA, systemId: crmA, emailId: String(emK?.id ?? `${TAG}-notk`), contactId: ctK.id };
    const tkR = await call(TR.emailClickTicket, base);
    const ticket = String(tkR.v ?? "");
    const stale = String((await call(TR.emailClickTicket, base, new Date(Date.now() - 20 * 60_000))).v ?? "x");
    const [v1, v2, v3] = [vid(), vid(), vid()];
    for (const v of [v1, v2, v3]) await acceptAndBrowse(crmA, OR_A, v, [`${OR_A}/tk`]);
    const idf = (v: string, ct: string) => postE({ ...pageBody(crmA, v, `${OR_A}/tk`), t: "identify", ct }, { origin: OR_A });
    const r1 = await idf(v1, ticket);
    const r2 = await idf(v2, ticket);
    const r3 = await idf(v3, stale);
    const b1 = await sessionsOf(tidA, v1);
    const b2 = await sessionsOf(tidA, v2);
    const b3 = await sessionsOf(tidA, v3);
    const acts = await webActivities(ctK.id);
    const evs = await identifiedEvents(tidA, ctK.id);
    const ttl = Number(TSH.IDENTIFY_TICKET_MAX_AGE_MS ?? TSH.IDENTIFY_TICKET_TTL_MS ?? 0);
    chk("C2.6-S9.3", "S2: the identify ticket is single-use and short-lived — the first use binds the visitor (EMAIL_CLICK · positive control), the SAME ticket replayed for a SECOND visitor binds NOTHING (no session bound, no second WEB activity, no second crm.web.identified) · a ticket issued 20 min ago is refused (the ruled TTL is 15 min, not 1 h) · every answer stays 204 empty",
      tkR.ok && ttl > 0 && ttl <= 900_000 &&
        b1.length > 0 && b1.every((s) => s.contactId === ctK.id && s.identifiedBy === "EMAIL_CLICK") &&
        b2.length > 0 && b2.every((s) => s.contactId === null) && b3.length > 0 && b3.every((s) => s.contactId === null) &&
        acts.length === 1 && evs.length === 1 && [r1, r2, r3].every(is204Empty),
      "binds once",
      `${rd(tkR)} ttl=${ttl} first=${b1.map((s) => `${s.contactId === ctK.id ? "CT" : s.contactId ?? "-"}:${s.identifiedBy ?? "-"}`).join(",")} replay=${b2.map((s) => s.contactId ?? "-").join(",")} stale=${b3.map((s) => s.contactId ?? "-").join(",")} acts=${acts.length} evs=${evs.length} status=${[r1, r2, r3].map((r) => r.status).join("/")}`,
      "MAJOR");
  }
  {
    // S3 — the cap is decided BEFORE the body is touched (a public collector must not let anybody make the
    //   server buffer megabytes just by claiming a size). The body is a stream that counts its own reads.
    const vCap = vid();
    await acceptAndBrowse(crmA, OR_A, vCap, [`${OR_A}/cap`]);
    const before = await visitorRows(tidA, vCap);
    const smallE = JSON.stringify(pageBody(crmA, vCap, `${OR_A}/cap-lied`));
    const smallC = JSON.stringify(consentBody(crmA, vCap, "accept", `${OR_A}/cap-lied`));
    const bigE = JSON.stringify({ ...pageBody(crmA, vCap, `${OR_A}/cap-big`), pad: "p".repeat(MAXB + 1000) });
    const bigC = JSON.stringify({ ...consentBody(crmA, vCap, "accept", `${OR_A}/cap-big`), pad: "p".repeat(MAXB + 1000) });
    const shot = async (mod: Any, path: string, payload: string, contentLength: string | null): Promise<{ r: HttpRes; reads: number; used: boolean }> => {
      const ctr = { n: 0 };
      const h = hdrs({ origin: OR_A, ctype: "text/plain;charset=UTF-8" });
      if (contentLength) h.set("content-length", contentLength);
      // `pull` + highWaterMark 0 ⇒ the source is touched ONLY when somebody actually reads the body. (With the default
      //   strategy the stream pre-fills its queue by itself in a microtask and every request would look "read".)
      const body = new ReadableStream({ pull(c: Any) { ctr.n += 1; c.enqueue(new TextEncoder().encode(payload)); c.close(); } }, { highWaterMark: 0 }) as Any;
      let req: Request | null = null;
      try {
        if (typeof mod?.POST !== "function") return { r: { status: -1, h: new Headers(), text: "POST missing" }, reads: ctr.n, used: false };
        req = new Request(`${BASE}${path}`, { method: "POST", headers: h, body, duplex: "half" } as Any);
        const r = await toRes(await mod.POST(req));
        return { r, reads: ctr.n, used: req.bodyUsed };
      } catch (e) {
        return { r: httpErr(e), reads: ctr.n, used: !!req?.bodyUsed };
      }
    };
    const eLie = await shot(RE, "/t/e", smallE, "9000");
    const cLie = await shot(RC, "/t/consent", smallC, "9000");
    const eBig = await shot(RE, "/t/e", bigE, null);
    const cBig = await shot(RC, "/t/consent", bigC, null);
    const after = await visitorRows(tidA, vCap);
    chk("C2.6-S9.4", `S3: /t/e and /t/consent refuse an oversize payload BEFORE touching the body — \`content-length: 9000\` (> ${MAXB}) ⇒ 413 empty and the request body stream is NEVER read (0 reads) · a ${Buffer.byteLength(bigE)} B body with NO content-length ⇒ 413 from a capped reader (it must never buffer the whole thing) · nothing written either way`,
      eLie.r.status === 413 && eLie.reads === 0 && !eLie.used && cLie.r.status === 413 && cLie.reads === 0 && !cLie.used &&
        eBig.r.status === 413 && cBig.r.status === 413 && eLie.r.text === "" && cLie.r.text === "" && eBig.r.text === "" &&
        after.s.length === before.s.length && after.pv === before.pv,
      "413 · body unread",
      `declared e=${eLie.r.status}/reads=${eLie.reads}/used=${eLie.used} c=${cLie.r.status}/reads=${cLie.reads}/used=${cLie.used} · streamed e=${eBig.r.status} c=${cBig.r.status} · rows ${before.s.length}/${before.pv}→${after.s.length}/${after.pv} body=${cut(eLie.r.text, 40)}`,
      "MAJOR");
  }
  {
    // S4 — start token: one nonce, one submission, 2 h · a honeypot hit must cost the bot a slot
    const fN = await mkForm(tidA, "nonce");
    const answer = (label: string) => ({ name: pii(`${label} ${TAG}-${nx()}`) });
    const send = (form: Any, answers: Record<string, unknown>, st: string) =>
      call(FORMS.submitPublicFormGuarded, form.publicToken, { answers, hp: "", st }, { ip: ipNew(), userAgent: uaHuman });
    const oneTok = stTok(fN.id);
    const n1 = await send(fN, answer("ตั๋วแรก"), oneTok);
    const n2 = await send(fN, answer("ตั๋วซ้ำ"), oneTok);
    const rowsN = (await subsOf(fN.id)).length;
    const stale = await send(fN, answer("ตั๋วเก่า"), stTok(fN.id, 3 * 3600));
    const rowsN2 = (await subsOf(fN.id)).length;
    const maxAge = Number(SG.FORM_START_MAX_AGE_MS ?? 0);
    const fH = await mkForm(tidA, "hpbucket");
    const perIp = Number((typeof SG.parseSpamGuard === "function" ? SG.parseSpamGuard(null) : { perIpPerMin: 10 })?.perIpPerMin ?? 10);
    const ipH = ipNew();
    const SHOTS = 30;
    for (let i = 0; i < SHOTS; i += 1) await submitG(fH, answer("ช่องหลอก"), { ip: ipH }, { hp: `https://bot-${i}.test` });
    const rowsH = (await subsOf(fH.id)).length;
    const bKey = typeof SG.formIpLimitKey === "function" && typeof TR.ipHashFor === "function"
      ? String(SG.formIpLimitKey(String(TR.ipHashFor(ipH, new Date())))) : "";
    const bucket: Any = bKey ? await P.chatRateBucket.findFirst({ where: { key: bKey } }) : null;
    const real = await submitG(fH, answer("คนจริง"), { ip: ipH });
    const rowsH2 = (await subsOf(fH.id)).length;
    const refusedNow = real.ok && real.v?.ok === false && real.v?.reason === "RATE_LIMITED" && thai(real.v?.message) && !blames(real.v?.message);
    const replayRefused = (r: Res) => r.ok && r.v?.ok === false && (r.v?.reason === "TOO_FAST" || r.v?.reason === "RATE_LIMITED") && thai(r.v?.message) && !blames(r.v?.message);
    chk("C2.6-S9.5", `S4: the start token is single-use (the SAME token twice ⇒ the second is refused in Thai, ONE row) and expires (3 h old ⇒ refused · FORM_START_MAX_AGE_MS ≤ 2 h) · ${SHOTS} honeypot submissions from ONE ip (limit ${perIp}/min) consume the limiter bucket (count ${SHOTS}, key \`form:\`, no raw ip) so a REAL submission from that ip is then RATE_LIMITED — filling the honeypot is no longer free`,
      n1.ok && n1.v?.ok === true && typeof n1.v?.id === "string" && replayRefused(n2) && rowsN === 1 &&
        replayRefused(stale) && rowsN2 === 1 && maxAge > 0 && maxAge <= 2 * 3_600_000 &&
        rowsH === 0 && !!bucket && Number(bucket.count) === SHOTS && bKey.startsWith("form:") && !bKey.includes(ipH) &&
        perIp < SHOTS && refusedNow && rowsH2 === 0,
      `1 row · bucket ${SHOTS} · then refused`,
      `first=${cut(j(n1.v ?? n1.err), 50)} replay=${cut(j(n2.v ?? n2.err), 70)} rows=${rowsN}/${rowsN2} stale=${stale.v?.reason ?? rd(stale)} maxAge=${maxAge} hpRows=${rowsH} bucket=${bucket?.count ?? "-"}@${cut(bKey, 26)} real=${cut(j(real.v ?? real.err), 70)}`,
      "MAJOR");
  }
  {
    // N7 · N10 · N12 — the three NOTEs the controller ordered fixed
    const crmZ = await mk(tidA, "CRM", "CRM ธงยินยอม");
    await setCrm(crmZ, { uiVersion: 2, bridgesEnabled: true });
    const cZ = { tenantId: tidA, systemId: crmZ, actorUserId: userA };
    await enableWeb(cZ, crmZ, [DOM_A], 180);
    const cv0 = Number((await call(TR.getWebSettings, cZ, owner)).v?.consentVersion ?? 0);
    const bumps = await Promise.all(Array.from({ length: 10 }, () => call(TR.saveWebSettings, cZ, owner, { bumpConsentVersion: true })));
    const cv1 = Number((await call(TR.getWebSettings, cZ, owner)).v?.consentVersion ?? 0);
    const VX = vid();
    await acceptAndBrowse(crmA, OR_A, VX, [`${OR_A}/n10`]);
    // a row that carries ANOTHER tenantId on the same systemId (the shape an `updateMany` without tenantId would hit)
    const foreign: Any = await P.crmWebSession?.create?.({ data: { tenantId: tidB, systemId: crmA, visitorId: VX, consentVersion: 1, consentAt: new Date(),
      startedAt: new Date(), lastSeenAt: new Date(), pageViews: 1, firstUrl: `${OR_A}/n10-foreign` } }).catch(() => null);
    const ctN = await rawContact(tidA, crmA, "ลูกค้าเทนแนนต์", userA);
    const idN = await call(TR.identify, { tenantId: tidA, systemId: crmA }, { visitorId: VX, contactId: ctN.id, by: "PORTAL" });
    const mineN = await sessionsOf(tidA, VX);
    const frN: Any = foreign?.id ? await P.crmWebSession.findFirst({ where: { id: foreign.id } }) : null;
    const scN = await getScript(SITE[crmA]);
    const codeOnly = scN.text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
    const FIVE = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
    const toks = [...codeOnly.matchAll(/utm_[a-z]*/g)].map((m) => m[0]);
    const utmOk = FIVE.every((f) => toks.includes(f)) && toks.every((t) => FIVE.includes(t));
    chk("C2.6-S9.6", "N7 bumpConsentVersion ×10 IN PARALLEL ⇒ exactly +10 (the new number is computed inside the one UPDATE, never from a value read before it) · N10 identify's updateMany is tenant-bound: a session row of ANOTHER tenant on the same systemId is never bound · N12 the served script keeps only the five canonical utm_ params (a bare `utm_` prefix filter would leak `utm_userid=<e-mail>` off the customer's device)",
      cv1 === cv0 + 10 && bumps.every((r) => r.ok) &&
        idN.ok && Number(idN.v?.bound) === 1 && mineN.length > 0 && mineN.every((s) => s.contactId === ctN.id) &&
        !!frN && frN.contactId === null && utmOk,
      "+10 · tenant-bound · 5 utm",
      `cv ${cv0}→${cv1} bumps=${bumps.filter((r) => r.ok).length}/10 ${bumps.find((r) => !r.ok) ? rd(bumps.find((r) => !r.ok) as Res) : ""} identify=${cut(j(idN.v ?? idN.err), 70)} foreign=${frN ? frN.contactId ?? "null" : "no-row"} utm=${toks.join(",") || "-"}`,
      "MINOR");
  }
  if (!wsA.ok) out(`  ℹ️  saveWebSettings(crmA) at setup: ${rd(wsA)}`);
} catch (e) {
  chk("C2.6-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — every row of the throwaway tenants (4 passes over every table with tenantId), systems/tenants, users, and the
  // DB-limiter buckets this run created (ChatRateBucket has no tenantId: keys `crm:` / `form:` created since RUN_START — DB oracles are
  // serialised by with-gate-lock, so nobody else writes such keys meanwhile). No drainOutbox.
  // ═════════════════════════════════════════════════════════════════════════════
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* order/FK — retried next pass */ } };
  await del(() => P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE ("key" LIKE 'crm:%' OR "key" LIKE 'form:%') AND "createdAt" >= $1`, RUN_START));
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
      const buckets = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE ("key" LIKE 'crm:%' OR "key" LIKE 'form:%') AND "createdAt" >= $1`, RUN_START).catch(() => [{ n: 0 }])) as Any[])?.[0]?.n ?? 0);
      chk("C2.6-CLEAN", "the oracle gives the QC database back exactly as found — every throwaway tenant, every row it owned, the throwaway users and this run's limiter buckets are gone",
        left.length === 0 && tenants === 0 && users === 0 && buckets === 0, "0 rows · 0 tenants · 0 users · 0 buckets", `${left.join(" · ") || "-"} · tenants=${tenants} users=${users} buckets=${buckets}`, "MAJOR");
    } catch (e) {
      chk("C2.6-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
out(`\n${passed === total ? "🟢" : "🔴"} C2.6: ${passed}/${total}`);
out(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
