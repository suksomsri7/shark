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

---

## Round 2 — re-review of `git diff a300d68d 8f41f9ae`

Same rules as round 1: read-only, no DB/suites/build/server. I executed only a pure parity replica: `/tmp/cj3-r2-parity.mjs` extracts both functions verbatim from the committed files.

### Verdict: **MERGEABLE**

Every round-1 ruling is implemented as ruled and is correct. No BLOCKER and no SHOULD-FIX. The notes below are optional.

### Rulings checked

- **S1 (verified).** `tracking.ts:1183`: the IDENTIFY dedup query now has `AND s."consentVersion" IS NOT NULL`, the same predicate as `lastIdentifiedContact` (`:752`). Probe J3-r1 was red on the old source (`s3=null`) and is green now: a new IDENTIFY lands on the post-consent session and the next session inherits.
- **S2 (verified, code + real browser).**
  - Tracker: `waiting` (`tracking.ts:1722-1748`) holds at most 10 WindowProxies, deduplicated. It is served by `afterAccept` (`:1736`) from `yes.onclick` (`:1701`) once the accept POST settles. `post`/`consent` now return the fetch promise (`:1675`).
  - Form: `currentTicket` (`PublicForm.tsx:156-160`) asks once when no ticket ever arrived, and on refresh keeps the old ticket for up to 14 min (`:53`).
  - `browser-j3` B-A (run21): the form loaded, 10.5 s passed with the banner still up, then accept. `/t/v` fired only at accept+243 ms (0 before), `webSessionId` is non-null and the session is bound. That proves the push path, not the submit-time ask.
- **N2 (verified).** `tracking.ts:222`: the burn window is TTL + 120 s (J3-r3). Burn rows are still swept at 24 h.
- **N6 (verified).** The page passes the target system's tracking domains (`page.tsx:73`, `visitorHandoverHosts`). The form drops any `sd:visitor-ticket` unless `parentOriginAllowed(e.origin, hosts)` (`PublicForm.tsx:109`).
  - Parity: `handover-shared.ts` is algorithmically identical to `originAllowed`. The probe's 14 cases plus my 18 extra cases gave 0 mismatches: trailing-dot FQDN, `:443`, userinfo, IPv4/IPv6, unicode vs punycode host, `%2e` in host, NUL, `.evil` suffix, `wss:`, whitespace, path/query. Both reject a trailing-dot origin (a consistent false negative). A browser's `e.origin` is always ASCII-serialized, so IDN reduces to the punycode comparison, and domains are stored ASCII-only by `normalizeDomain`.
  - Real browser (B-N6 / B-N6c): a real, valid ticket planted every 250 ms by a non-listed https parent is ignored. The same page served from the listed host binds (positive control).
- **N8 (verified).** `recordConsent` reuses a fresh row only if it already holds the current version (`tracking.ts:1017`). `openSession` reuses only a row with the same version (`:772`). Redeem re-checks opt-out after `latestConsentedSessionId` (`:1108-1109`, WARN OPT_OUT, J3-r6).

### Attack points

1. **`waiting` list (verified by code; frame semantics per the HTML spec).**
   - A frame is enqueued only after `e.origin===AO` and `ownFrame(src)`. A hostile frame of any other origin never reaches the list, and only `/f/*` is framable on the app origin, so the 10 slots can only be taken by SHARK form frames the shop itself placed.
   - Serve time re-checks `ownFrame` (`:1738`) plus `accepted()` and the cookie inside `serve`. A removed iframe has a null `contentWindow`, so it is not served.
   - A navigated iframe keeps the same WindowProxy, so it still passes `ownFrame`. But the reply uses targetOrigin `AO`, so a non-app document receives nothing. Another app-origin `/f` page would receive it and then drop it (N6 host check) or get MISMATCH at redeem. This is the same as round 1's async reply.
   - A page with more than 10 form frames: the extras are only linked through the submit-time ask. Harmless.
2. **Accept ordering (verified).**
   - `/t/consent` awaits `recordConsent` (including the `openSession` transaction) before it responds (`src/app/t/consent/route.ts`, POST body). So `afterAccept` can only mint after the accept row has committed, and `/t/v`'s "latest session holds the current version" check sees it.
   - Network failure: `.catch` resolves, then `serve` mints nothing (204).
   - A double click is impossible because `closeBanner()` runs first.
   - Narrow window: a first ping that lands between the cookie write and the POST landing gets a 204 and is not enqueued. It is covered by the submit-time ask.
3. **Submit-time ask (verified).**
   - v1 gets no prop (`page.tsx:73`), so `handoverOn` is false. An unframed form fails `isFramed()`. Both return null immediately (`PublicForm.tsx:156`) with no wait.
   - Double submit is still blocked by the synchronous `sending` flag.
   - A parent that never answers, or that answers from a non-listed origin (dropped before the waiter fires), just runs out the 1.5 s timer.
4. **Fallback ticket (verified).**
   - A kept ticket that has expired server-side comes back INVALID. The redeem returns null, `service.ts:386-388` continues, the submission is stored, and one WARN is written.
   - After a version bump the old ticket is STALE server-side (`:1097-1098`, J3-r8). The fallback only chooses which ticket to send, so it cannot bring a stale one back.
   - A ticket reused after an error that happened post-burn comes back REPLAY and the form is stored unbound. Same as round 1.
5. **Domains in the public RSC payload (agree: low).** They are the shop's own websites, where the form is embedded anyway, capped at `TRACKING_MAX_DOMAINS`. The new exposure is only for hosts a shop lists but does not publish (staging, not-yet-launched, a partner's site): anyone holding the form link can now read them. Owner-visible (residual 7). Optional: send sha256 of the domains and compare the hashed suffixes of `e.origin`'s host on the client. v1 props are unchanged from the base (no prop at all).
6. **N8 analytics (acceptable).** The only continuity change is when a visitor re-accepts within 30 min after a version bump (or after a revoke, as in round 1): it now counts as a new session, so `webStats.sessions` goes up by one in those rare moments. Normal browsing is unchanged: the collect path only calls `openSession` after idle, and concurrent opens at the same version still reuse under the lock. `qc-crm-c2.6` does not pin this rule: C2.6-S3.8 (the bump + re-accept case) sums page views across rows (`oldRe.pv===2`) and passes either way. Its spec line 117 ("reuse the latest non-idle one or create") only narrows.
7. **Browser proof + journey (verified from logs).**
   - `run21-browser.log`: 4/4 (B-A timing above; B-N6 `webSessionId=null` and unbound; B-N6c bound; clean).
   - `run21-us9.log`: 8/8, US9-3 `webSessionId = cmuofxsbh00021bkzdov7c06l`, US9-4 zero rows.
   - Suites: c2.6-web 35/35 · run18 c2.6 87/87, c2.5 105/105, c1.8 81/81, c3.9 49/49, qc-form 10/10, c1.11 66/66 with `CRM_V2_SWITCH=all` (settles round 1's env question) · run19 probe 32/32, c2.6 87/87.
8. **RED baseline (verified by content, which is stronger than mtimes; historic source mtimes cannot be recovered).** `RED-r2-run12b.log` 25/32 prints old-source values: J3-r3 `windowMs:900000`, J3-l `hand v1=false v2=true` (the old boolean API), J3-r1 `s3=null`, J3-r9 upgraded row `old=4:3:CT`. It ran at 17:27–17:28, before run13/14 (17:30). The r5 helper fix (match the row by its own answer instead of "last row") is legitimate: run12 showed `bound=2` only because both parallel calls read the same row. r5 is green on the old source, consistent with round 1 N2 (the burn is atomic).
9. **Other new code: nothing wrong.** `send()` ignores `post()`'s new return value. C3.9-X6.2 still passes (keepalive within 160 chars). `redeemVisitorTicket` burns before the OPT_OUT refusal, which is fine because it is single-use either way.

### NOTE (round 2, optional)

- **R2-N1 · The 1.5 s submit wait hits every non-consenting visitor on a framed v2 form (and every visitor when the shop page has no tracker).** `PublicForm.tsx:158` combined with the tracker enqueueing instead of answering (`tracking.ts:1748`). Optional: when the visitor has not accepted, the tracker replies right away with a `{type:"sd:visitor-ticket-none"}` (no secret; the parent knows its own consent state) and the form's waiter resolves on it. This does not help pages without a tracker. Bounded; owner-visible as residual 9.
- **R2-N2 · Hashed hosts for the RSC prop** (see point 5), if the owner considers unpublished tracking domains sensitive.

### Residual risk, round-2 update (plain words)

Items 1, 2, 3, 5, 6 and 8 of the round-1 list are unchanged. Changes:

- 4. **Closed for the ticket channel:** the form now takes tickets only from the shop's own tracking domains. Still possible by other means (a forged cookie, item 1).
- 6. Additionally, re-accepting a new cookie text always starts a new visit, so visit counts rise by one in that moment.
- 7. The public form link now also reveals the shop's tracking domains, including any the shop lists but does not publish.
- 9. **New:** on a shop page, a form whose visitor has not accepted cookies (or a page without the tracking script) waits up to 1.5 s when "send" is pressed before it goes out.
