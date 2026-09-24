# C2.6 — Tracking: links, web script + cookie consent, lead forms
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C2.6". Spec: blueprint §5.7, §11.7, mockups 11, 16, decisions C6, C24.

## Facts
Forms: `FormDef` is TENANT-scoped (`crmEnabled` flag; after C2.0 also `crmSystemId`, `assignRuleId`, `utmCapture`, `scoreOnSubmit`, `createCompanyFromField`, `spamGuard`). Public route `/f/<token>` (`src/app/(store)/f/[token]/page.tsx`, action `submitFormAction`) uses the IN-MEMORY limiter `checkRateLimit("form-submit:ip", 10/min)` and has NO honeypot. Event `forms.submission.received` payload `{formId, submissionId, crmContactId}` with tenantId only. The public-lane pattern to copy: `src/lib/modules/member/api/public-lane.ts` (`publicIpOf`, hashed ip, `checkRateLimitDb`).

## Deliverables
- Tracked links: CRUD, QR, `/l/[code]` → 302 to the STORED url only (validated http/https at creation), click rows, optional visitor/contact binding.
- Web tracking: `GET /t/s/[systemKey].js` (tiny script: consent banner when no decision; `sd('page'|'identify'|'event'|'revoke')`), `POST /t/e` collect (allowed domains only, CORS locked to them, payload ≤ 8 KB, no consent ⇒ 204 and ZERO rows, first-party visitor cookie 180 d, no raw IP — `ipHash` with monthly salt), `POST /t/consent`, `identify(visitorId, contactId, by)` binding past sessions (≤ 180 d) + one WEB activity per day + score hook, `purge` job (hourly/daily via C0.5 or tick), stats, settings UI (mockup 16) + web timeline block on contact 360.
- Forms: consumer uses `FormDef.crmSystemId` (C1.8 placeholder replaced), UTM/pageUrl/referrer/webSessionId captured, `assignRuleId`, `scoreOnSubmit`, company from field, embed code; **spam guard (C24)**: honeypot field + minimum fill time + DB rate limit per ip-hash and per form (replace the in-memory limiter) + optional Turnstile (off by default; verify server-side only when keys are configured).
Events `crm.web.identified`.

## Acceptance (oracle `qc-crm-c2.6` + headless page test `qc-crm-c2.6-web`)
CRM-RUN S1–S8 (30).
X7 `/t/e` from a non-allowed origin ⇒ 204 nothing written; oversize payload ⇒ 413/204 nothing written; flood ⇒ limited by DB limiter; unknown link code ⇒ same response as inactive; no endpoint returns data · X6 link url `javascript:`/`data:` refused; redirect target cannot be influenced by query params · X8 consent declined ⇒ exactly one functional cookie and zero rows; `revoke` stops collection; form values are never collected by the script; retention purge verified · X3 1,000 page-view posts in parallel for one visitor → `pageViews` exact · X5 purge job overlapping runs safe · X4 identify twice → sessions bound once, one WEB activity/day.
Regressions: `qc-form`, `qc-forms-notify`, `qc-public-links`, `qc-pages`, C1.8, C2.5.

## Controller addendum (PROPOSED — written by the C2.6 oracle author, 19 Sep; the controller accepts/edits before spawning the builder)
Oracle: `scripts/qc-crm-c2.6.mts` (**82 checks** · S0 7 · S1–S8 38 = the 30 of CRM-RUN §2 plus 8 extras the brief asks for (S1 5 · S2 5 incl. the C2.5 positive control S2.0 · S3 8 · S4 5 · S5 2 · S6 8 · S7 1 · S8 4) · U 5 uiVersion-1 · X1 4 · X3 5 · X4 2 · X5 1 · X6 3 · X7 10 · X8 3 · X9 2 · FATAL · CLEAN · CONTRACT BLOCK A–G at the top is authoritative for names/shapes). X2 (API keys / AI tools) and X10 (private files) are **N/A for C2.6** per MASTER-PLAN §4 — C2.6 adds no REST op, no AI tool and no file; the tracking op set is C2.11's and gets X2 there. Cookies are still checked: the server-set `sd_u` must be `HttpOnly; Secure; Path=/l/<code>` (`C2.6-S1.2`), and the script-set `sd_vid`/`sd_consent` must be written `Secure` + `SameSite` — never `HttpOnly`, the script has to read them (`C2.6-S3.1`). Companion headless oracle `qc-crm-c2.6-web` is NOT written yet — this file proves the SERVER half of S3 plus static properties of the served script; S3's browser half (real banner clicks, real cookies) stays owed.
1. **Ownership of `/t/o` `/t/c`**: the routes are C2.5's (brief C2.5 §2 · R-D "C2.5a = tracking"). C2.6 edits ONLY `/t/c/[token]/route.ts` to append the identify ticket (`appendIdentifyTicket`, param `sd_ct`) for counted clicks of an e-mail with a contact, and REUSES C2.5's bot filter (re-exported as `tracking-shared.isBotUserAgent` — one engine). S2 drives C2.5 black-box through `emails.sendEmail(ctx, actor, {contactId, to, subject, bodyHtml})` with fetch stubbed; `C2.6-S2.0` is the positive control — if C2.5's real signature differs, ORACLE-EDIT that one call.
2. **siteKey** = `settings.crm.tracking.web.siteKey`, random ≥ 12 chars generated on enable (mockup's `siamdive.js` is illustrative). Public identifier, stored plain (not a secret).
3. **Server-side consent truth** = `CrmWebSession.consentVersion` (null after revoke). decline = zero rows; revoke = null consent on the visitor's sessions; version bump invalidates old consents.
4. **Client `sd('identify')` carries only a signed ticket** — raw e-mail/phone/contactId from the page is never used (anyone could bind any visitor otherwise).
5. **Unique clicks** = request has no `sd_u` cookie; `/l/<code>` sets `sd_u=1; Path=/l/<code>` (no identifier). Controller: accept as non-identifying functional cookie on shark.in.th, or replace.
6. **Links**: explicit `expiresAt` in the past ⇒ same response as inactive (R-E.16 only forbids an expiry JOB). uiVersion 1 ⇒ still redirects (printed QR codes), counts nothing.
7. **Purge runs for uiVersion-1 systems too** (retention is a legal duty) — deviates from R-E.14 (check `C2.6-U.5`, MAJOR). Registration as a daily job stays with C2.10 (R-A).
8. **Spam guard lives in a NEW entry** `submitPublicFormGuarded`; `submitPublicForm` is unchanged so `qc-form`/`qc-forms-notify` stay green. Honeypot ⇒ fake success `{ok:true,id:null}`. Start token HMAC `form-start:v1:`. `FormSubmission.ip` stores `ipHashFor(ip)` on the guarded path (was raw IP).
9. **Score on submit** written by C2.6 (CrmScoreLog + atomic `score += n`, eventKey `crm.form.score#<submissionId>`) since C2.8 comes later; `crm.web.identified` is only emitted (C2.8 consumes).
10. **Iframe embed** needs `src/proxy.ts` to drop `X-Frame-Options: DENY` for `/f/*` only (today every route is DENY) — proxy edit is in C2.6's file list if the embed is an iframe.
11. **Limiter keys** start `crm:` (tracking) / `form:` (forms) and never contain the raw IP — the oracle deletes this run's buckets by prefix + createdAt.
12. Files C2.6 owns (proposed): `crm/tracking.ts` · `crm/tracking-shared.ts` · `crm/tracking-actions.ts` · `forms/spam-guard.ts` + additions in `forms/service.ts`/`forms/index.ts` · `(store)/f/[token]/{actions,page}.tsx` · `crm-bridges/forms.ts` · routes `l/[code]`, `t/s/[script]`, `t/e`, `t/consent` + the ticket hunk in `t/c/[token]` · `src/proxy.ts` (/f only) · pages `settings/tracking`, `settings/forms` · `components/crm/tracking/**` · contact-360 timeline mount · its blocks in nav.ts, crm/index.ts, outbox-consumers.ts, one label registry, crm-ui-inventory.json.
13. **"one WEB activity per day" means per THAI day**: `CrmActivity.sourceRef = web#<contactId>#<Thai YYYY-MM-DD>` and `identify` takes `opts.now` so the clock is injectable. `C2.6-S4.5` identifies the same contact from three visitors two minutes apart across Thai midnight (23:59 → 00:01, the SAME UTC date) and demands TWO activities, then none for a third identify later that Thai day — a UTC-day implementation is off by one for every shop between 00:00 and 07:00.

## Addendum B — the headless companion `scripts/qc-crm-c2.6-web.mts` (written by the C2.6-web oracle author, 23 Sep · **needs the controller's ruling**)
The controller's ruling of 23 Sep owed a browser exam; it exists now (33 checks · ids `C2.6W-*` · CONTRACT block "W1–W8" at the top of
that file is authoritative for the browser-observable half; everything else stays as CONTRACT A–G of `scripts/qc-crm-c2.6.mts`).
It starts a local TLS front door and points chromium at it (`--host-resolver-rules=MAP * 127.0.0.1:<port>` + `--ignore-certificate-errors`),
so the fixture shop pages really are `https://<allowed domain>/…` while `/t/*`, `/f/*` and `/l/*` are reverse-proxied to the QC server
(`bash scripts/acc-v2-serve.sh`, production build, port 3215). Nothing inside the browser is mocked: CORS, cookie flags, mixed content,
`X-Frame-Options` and the 302 of `/l/<code>` are chromium's verdicts. New contract details the builder must satisfy:
1. **`window.sd` is the global API** (`sd("page"|"event"|"identify"|"revoke")`); calling it before a consent decision must not throw.
2. **The banner carries `data-sd="banner" | "accept" | "decline"`** so the exam can click it deterministically (**oracle-proposed naming**;
   the exam falls back to matching the visible text ยอมรับ / ปฏิเสธ, so a text-only banner still passes — but the attributes are cheap
   and make `qc-crm-buttons` (C4.2) possible later).
3. **Decline ⇒ EXACTLY ONE cookie on the shop origin and it is `sd_consent`** — a declined visitor never gets `sd_vid`. (X8 of the brief
   says "exactly one functional cookie"; this fixes WHICH one.)
4. **The tracker picks `sd_ct` up from `location.search` by itself** on a page loaded from an e-mail click (that is the whole point of the
   ticket `/t/c` appends). An explicit `sd("identify")` is accepted as a fallback but then `C2.6W-S4.1` is only MAJOR.
5. **The tracker posts to an ABSOLUTE `https://<app>/t/e`** baked into the served body (a relative `/t/e` would hit the shop's own domain).
6. **The `/f/<token>` page**: the honeypot is really invisible (computed style, zero box or off-screen), out of the tab order,
   `autocomplete` off; the start token is a hidden input; a refusal is shown INLINE in Thai — never `alert()`, never a blank page.
7. Run order for the controller: `bash scripts/acc-v2-serve.sh` → `bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx
   scripts/qc-crm-c2.6-web.mts` → `bash scripts/acc-v2-serve.sh stop`. Prerequisites missing (no server / no chromium / no openssl) ⇒
   SKIPPED with the reason printed, never a silent pass.
