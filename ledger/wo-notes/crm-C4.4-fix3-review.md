# CRM C4.4-fix3 (J3) — independent security + privacy review

Reviewer: read-only, 30 Sep 2026. Scope is `git diff fb7b6b92 a300d68d`. I ran no DB, suite, build or server. The only thing I executed was a pure-crypto replica in /tmp (`/tmp/cj3-review-crypto.mjs`).

## Verdict: **MERGEABLE AFTER SHOULD-FIX (S1, S2)**

There is no BLOCKER. Crypto, the gates, cross-tenant/system checks, v1 inertness and the consent filters on the new paths hold up. S1 is a small consent-filter inconsistency in `identify()`. S2 is a functional gap (not a security issue) that stops the feature from working in its main case.

---

## SHOULD-FIX

**S1 · identify() dedup of IDENTIFY ignores consent. The inheritance chain breaks after revoke → re-consent (verified, code reading)**
- `src/lib/modules/crm/tracking.ts:1170-1175`: the "latest IDENTIFY for this visitor" dedup query has no consent filter. `lastIdentifiedContact` (`:746-751`, changed in this card) does filter, with `s."consentVersion" IS NOT NULL`.
- Scenario:
  1. Visitor V is identified as contact C (IDENTIFY on session S1).
  2. V revokes, so S1.cv becomes null.
  3. V re-accepts, which opens S2 with no inheritance (correct).
  4. V submits a form as C again. `identify()` binds S2, but the dedup query finds the old IDENTIFY on revoked S1 with the same C, so no new IDENTIFY is written.
  5. The next session after the 30-min idle (S3) finds nothing through `lastIdentifiedContact` and stays anonymous. C's timeline then has gaps, and web identity silently stops following the visitor.
- This fails the privacy-safe way, but the two queries now disagree, and probe J3-c5 only covers the "different/no re-identify" case.
- Change wanted: add `AND s."consentVersion" IS NOT NULL` to the query at `:1172`, the same predicate as `:750`. Add a probe case: revoke → re-accept → re-identify as the same contact → next session inherits.

**S2 · Hand-over misses the main lead case: consent given after the form loaded, and a still-valid ticket dropped on refresh (functional, verified by code reading, not exercised by US9)**
- `PublicForm.tsx:45`: the form pings only at 0 / 0.8 / 2 / 4.5 / 9 s. `PublicForm.tsx:126`: `currentTicket()` returns null right away if no ticket ever arrived. The tracker's accept button (`tracking.ts:1688`) does not notify frames.
- Consequence: a first-time visitor who lands on the contact page, fills the form, and clicks "ยอมรับ" more than 9 s after load (or never before submitting) is never bound, even though they consented. US9 accepted on p1 before reaching the contact page, so it could not catch this.
- `PublicForm.tsx:128` also nulls a ticket that is 10–15 min old (still valid) before asking for a new one. If the refresh is slower than 1.5 s, the submit goes out without a ticket even though the old one would have bound.
- Change wanted:
  - On submit with no ticket (or a stale one), ping once and wait ≤ 1.5 s. Alternatively, have the tracker post the ticket to its app-origin iframes after `/t/consent` accept succeeds, or have the form re-ping on `focus`/`visibilitychange`.
  - Keep the previous ticket as a fallback while it is < ~14 min old.
  - Add a journey/probe step: accept after the form has loaded, then submit, and check that it binds.

## NOTE (no change required for merge; some are cheap hardening)

- **N1 · Ticket crypto: sound (verified).**
  - Separate AES-256-GCM keys, `crm-identify:v1:` (`tracking.ts:136-138`) vs `crm-visitor-ticket:v1:` (`:250-252`), with a random 96-bit IV per ticket (`:175`).
  - The replica run shows a click ticket does not open under the vt key, a vt ticket does not open under the identify key, a 1-bit tamper fails, and both positive controls open. Type confusion is impossible.
  - There is no AAD. That is fine given the key separation plus the `k:"vt"` check (`:277`).
  - The tenant/system compare is `safeEqualHex` (`:1096`). The other compares act on already-authenticated plaintext.
  - Expiry is checked on both sides, with a +60 s skew cap (`:279`).
- **N2 · Burn: atomic, fail-closed on the ordering, fail-open on DB errors (verified by code reading, concurrency not tested by the probe).**
  - `consumeIdentifyTicket` (`:217-222`) is one `INSERT … ON CONFLICT DO UPDATE … RETURNING` with limit 1 (`src/lib/core/rate-limit-db.ts:60-69`). Two concurrent submits with the same ticket (each needs its own start token) give exactly one bind; `qc-chat-security` M9 proves the primitive.
  - The burn happens after the MISMATCH/STALE checks (`:1096-1099`), so a ticket submitted on the wrong form is not burned. It happens before `writeSubmission` (`forms/service.ts:386-395`). A crash in between loses the binding (and the start token is burned too, so the user must reopen the form). That is not a replay window.
  - `checkRateLimitDb` returns `ok:true` on any DB error (`rate-limit-db.ts:78-84`), so single use is not guaranteed during a DB fault. This is pre-existing and the same for e-mail click tickets.
  - Theoretical: the burn window equals the TTL (15 min) while tickets are accepted up to now+16 min. With clock skew between instances, a ticket burned in its first δ seconds could be replayed in its last δ seconds. Cheap fix: `windowMs: IDENTIFY_TICKET_MAX_AGE_MS + 120_000` at `:220`.
  - Store growth is bounded: `crm:tkt:*` rows are swept after 24 h (`src/lib/platform/cron.ts:414-416`) and hold only sha256(jti).
  - Logs carry a reason code and systemId only (`:1086-1088`, `:1067`). No ticket and no visitor id anywhere (probe J3-f checks the ops rows).
- **N3 · The stolen-visitor-id attack is not new (verified).**
  - The pre-existing same-host path reads `sd_vid` from the caller's Cookie header (`f/[token]/actions.ts:19-24`, `:55`). A non-browser client that knows a victim's uuid could already submit a form with `Cookie: sd_vid=<victim>` and bind the victim's current-consent history to a lead of its choice (and dedup onto an existing contact by e-mail via `leadFromBridge`). That path has no Origin gate and no /t/v bucket.
  - The ticket path needs strictly more (forged Origin + a valid siteKey + a 20/min/IP bucket). The attacker gains write only: nothing in the diff lets a contact or outsider read web history. `crm.web.identified` carries ids and counts, no URLs (`tracking.ts:1210-1216`); the timeline is staff-only (`:1316-1320`).
  - The builder's "bearer note" understates this: the S1/C2.6-S9.2 rule "never take a visitor id from the caller" does not hold against non-browser callers, because of the Cookie header. That is pre-existing and outside this card; the owner should know.
- **N4 · /t/v refusals are indistinguishable except for the one bit the ticket itself carries (verified).**
  - Every refusal is `empty(204)` with identical `Cache-Control` + `Vary: Origin` and no ACAO (`src/app/t/v/route.ts:16-18`). Oversized bodies get 413 (size only). J3-e1 compares header signatures, with a positive control.
  - Timing classes: a bad site or bad origin costs 1 query. A gated request costs 2 bucket upserts + 1 read, plus 1 more when the session has a contact. That only separates cases for someone who already holds a valid uuid, and that person gets 200 vs 204 anyway ("consents now and is not opted out"). This consent-status bit is new versus /t/e, which was always silent.
  - `ipOf` trusts the first `x-forwarded-for` value (`route.ts:14`, same as /t/e). That is fine on Vercel, but the per-IP bucket is spoofable behind a proxy that appends.
  - /t/v spends the shared per-site bucket `crm:ts:<siteKey>` (`tracking.ts:1060`). Starving a shop's page-view budget is already possible via /t/e with fewer IPs, so nothing new.
  - OPTIONS reflects only an https origin that some enabled v2 shop declared (`:698-723`, same as /t/e). The tracker uses `text/plain`, so there is no preflight.
- **N5 · postMessage, tracker side: correct (verified).**
  - Exact `e.origin!==AO` (`tracking.ts:1709`).
  - `contentWindow===src` against the top document's iframes only (`:1712-1714`), so nested frames, removed frames and `window.open` popups are rejected.
  - The reply goes to `src` with targetOrigin `AO`, never `*` (`:1719`).
  - Only `/f/*` is framable on the app origin (`src/proxy.ts:32`, `:49`). No public route uses `dangerouslySetInnerHTML` (grep of `src/app` outside the staff app returned nothing). So the only app-origin document that can sit in an iframe and receive a ticket is a `/f` form page, and a foreign shop's form gets MISMATCH at redeem without a burn (J3-g).
  - Iframes inside shadow DOM are not found (functional only).
- **N6 · postMessage, form side has no origin check on the reply (`PublicForm.tsx:98` checks only `e.source === window.parent`).**
  - A hostile site framing a shop's form can plant a ticket it minted for its own consented uuid (forged Origin). Whoever then fills the form on that site gets the attacker's fake page views bound to their new contact, and the attacker's later forged page views flow onto that contact's timeline and score rules.
  - Same power as N3 (forged cookie + the victim's e-mail), so this is not a merge issue.
  - Cheap hardening: the page passes the shop's tracking domains as a prop, and the form accepts `sd:visitor-ticket` only when `new URL(e.origin).hostname` matches them.
  - The ticket lives in a ref and in the server-action request body only: not in the DOM, URL, storage or props (J3-s2).
- **N7 · Cross-tenant/system (verified, probe J3-g/J3-l).**
  - Shop A's ticket on shop B's form: MISMATCH, no burn.
  - Another CRM system of the same tenant: MISMATCH.
  - Form target changed after mint: MISMATCH (`crm-source.ts:778` re-resolves at redeem).
  - Rotated siteKey, tracking off, flipped to v1, or consent version bumped: `resolveSite` returns null or the version differs, so STALE (`tracking.ts:1097-1098`).
  - Form with CRM disabled: no system, no redeem, no burn.
- **N8 · Consent paths after this card (verified by code reading).**
  - Binding writers are `identify()` (form cookie, form ticket, e-mail click; `:1161`, `:1166` require the current version) and `openSession` inheritance. The latter is only reached with the current version (`:943`, `:1016`) and inherits from any non-revoked IDENTIFY, including stale-version ones.
  - Nothing else writes `CrmWebSession.contactId` (grep).
  - Opt-out between mint and redeem is not re-checked at redeem. `identify()` re-checks the target contact only. This is the same as the cookie path and was pre-existing.
  - Revoke between redeem and the async bridge: `identify()` finds no current-version rows, so NO_SESSIONS. Correct.
  - Behaviour change: after a consent-version bump, pre-bump anonymous sessions are never bound again (privacy-positive; the owner should know).
  - Inconsistency: `recordConsent` re-accept within 30 min of a still-non-null old-version row upgrades that row, pre-bump page views included (`:1012-1030`).
  - No regression for a legitimate e-mail click. `/t/e` identify requires the latest session to hold the current version (`:941`), so `identify()` always finds ≥1 row.
  - Erase (C3.9) still deletes sessions, events and clicks by contact (`privacy.ts:718-723`). Tickets are stateless and the burn rows hold only a hash, so there is nothing to erase.
- **N9 · Pre-revoke data already bound stays visible (pre-existing, not introduced here).** Revoke only nulls `consentVersion` (`:1004`). `webTimeline` (`:1321`) and the privacy export show sessions bound before the revoke. This card only stops new binding.
- **N10 · v1 / inert (verified).**
  - `/t/s` is untouched and returns `NOOP_TRACKER` for unknown, disabled or v1 sites (`src/app/t/s/[script]/route.ts:26-31`).
  - `/f` spreads `visitorHandover` only when it is true (`page.tsx:72`), so v1 props are identical.
  - Not framed: `isFramed()` is false, so no listener, no message and no `vt`.
  - `/t/v` alone cannot separate v1 from v2 without first creating a consented session. `/t/s/<siteKey>.js` already reveals v2 publicly.
  - New minor leak: `/f/<token>` now tells anyone with the form link that its CRM is v2 with tracking on (the RSC prop, and `sd:form-ready` posted to `*`).
- **N11 · Availability (verified).**
  - The submit waits at most 1.5 s and only for a ticket older than 10 min.
  - A hostile parent cannot stall it longer; the timer always resolves.
  - `sending` is set synchronously before any await (`PublicForm.tsx:148-149`), so there is no double submit.
  - Listener errors are swallowed on both sides.
- **N12 · Probe quality.**
  - It drives the real route modules (`/t/e`, `/t/consent`, `/t/v`) with plain Requests and the real server action inside a Next request scope (`probe-j3.mts:163-229`).
  - Every negative check has a positive control. RED 4/23 → GREEN 23/23.
  - Consent bumped between mint and redeem is covered by J3-d (a ticket sealed at the old cv).
  - Missing:
    - parallel double-redeem of one ticket
    - opt-out between mint and redeem
    - revoke between mint and redeem
    - the S1 scenario
    - accept-after-form-load (S2)
    - a browser test of an app-origin iframe that is not the shop's (static check only; J3-s1)
- **N13 · Journey / suites (verified from the logs).**
  - `run11-us9.log`: 8/8. US9-3 ✅ with `webSessionId = cmuod1vc80002hbkzw4b4agf3` (non-null). US9-4 ✅ with zero sessions/events. The screenshot 07-06 shows the in-iframe thank-you.
  - c2.6 87/87 · c2.5 105/105 · c1.8 81/81 · qc-form 10/10 · forms-notify 9/9 · c2.6-web 35/35 · probe run9 23/23.
  - c3.9: 48/49 → 49/49. X6.2's heuristic treats `fetch(` followed within 160 chars by `credentials:"omit"` as browser code (`scripts/qc-crm-c3.9.mts:907`). The flagged `fetch(EV,…)` really is browser code inside the shark.js template, with EV a server-built constant, so moving `credentials:"omit"` first is a fair fix, not a dodge.
  - c1.11 57/66 is identical on the base files (run8, `run8-basecheck.txt` empty = clean checkout/restore). All 9 failures are the switch-page gate. `.env.qc3` has no `CRM_V2_SWITCH*` line (I counted, never printed a value), which matches `ui-version.ts:67-73`. Plausible.
- **N14 · Production topology.** The tracker's `AO` is `publicAppOrigin(APP_URL)`, while the form embed origin is `appUrl()` (`tracking.ts:1376`). These are equal for an https APP_URL. Forms served on tenant custom domains, or a non-https APP_URL, silently disable the hand-over; the form still submits.

## Residual risk accepted by design (plain words for the owner)

1. Anyone who gets hold of a visitor's browser id (through a script or XSS on the shop's own website, or the device itself) can attach that visitor's browsing history to a fake lead. They cannot read the history. This was already possible before this card through the form's cookie path; the new ticket path does not make it easier.
2. Someone holding a visitor id can learn one fact from `/t/v`: whether that visitor currently accepts cookies and has not asked to stop tracking.
3. "Use the ticket only once" relies on the database. If the database has a hiccup at that exact moment, a ticket could be used twice (same as the e-mail click tickets).
4. A hostile website that embeds a shop's form can make the lead of whoever fills it in there show fake page views. The same thing is possible today by other means.
5. Pages a customer viewed before withdrawing consent, if they were already linked to that customer, stay on the customer's history until retention or erase. This card only stops new linking.
6. After a shop publishes a new cookie text, earlier anonymous browsing is never linked to a lead any more (stricter than before).
7. The public form link reveals that the shop uses CRM v2 web tracking. The tracking script link already reveals this.
8. If the form is served from a different address than the tracking script (custom domain, misconfigured APP_URL), linking quietly does not happen. The form still works.
