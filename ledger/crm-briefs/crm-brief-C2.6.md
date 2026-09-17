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
