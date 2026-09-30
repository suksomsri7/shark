# CRM C4.4-fix3 (J3) — web visitor → contact binding through the product's own embedded form

Worktree `/root/projects/shark-crm-cj3` (detached at fb7b6b92) · DB QC3 only · builder notes (checkpoint, appended per step).

## Plan (controller ruling option A)

1. `tracking.ts` — sealed **visitor ticket** `k:"vt"` (AES-256-GCM, own key label `crm-visitor-ticket:v1:`; payload tenant ·
   system · siteKey · visitorId · consent version · exp ≤ 15 min · jti) + `readVisitorTicket` + single-use burn in the SAME
   store as the click ticket (`consumeIdentifyTicket`, key `crm:tkt:<sha(jti)>`).
2. `tracking.ts#mintVisitorTicket` + route `POST /t/v` (and `OPTIONS`): same body cap / site lookup / `originAllowed` (https,
   shop domains) / `urlHostAllowed(u)` / visitor-uuid / `cv` checks as `/t/e`, own per-IP bucket + the shared per-site bucket,
   ticket ONLY when the visitor's LATEST session on that site holds the CURRENT consent version and its contact (if any) is not
   opted out. Every refusal = the same empty 204 with NO CORS header (byte-identical: no "does this visitor exist" oracle).
   Success = 200 `{"t":"<ticket>"}` + `Access-Control-Allow-Origin: <that origin>` · no credentials · no-store · never logged.
3. Tracker (`trackerScript`, v2 only — v1/unknown sites keep `NOOP_TRACKER` byte-identical): `message` listener accepts
   `{type:"sd:form-ready"}` only when `event.origin === <app origin the script was served from>` AND `event.source` is the
   `contentWindow` of one of the page's iframes AND the visitor accepted; calls `/t/v`; replies to `event.source` with
   `{type:"sd:visitor-ticket",ticket}` and `targetOrigin = app origin`.
4. `/f/<token>`: page decides server-side whether the hand-over is on (form's target CRM system is uiVersion 2 + web tracking
   enabled with ≥1 domain); only then `PublicForm` (framed only) posts `sd:form-ready` to `window.parent` (retry until a
   ticket arrives), accepts the reply only from `event.source === window.parent`, keeps the ticket in a ref (memory only),
   sends it as field `vt` of the server action. v1 / tracking-off / not framed ⇒ no listener, no message, same payload.
5. Action → `submitPublicFormGuarded(meta.visitorTicket)`: cookie path first (unchanged); only if it yields no session and a
   ticket is present, AFTER the start-token burn: `crm-source.submissionWebSessionFromTicket` → `tracking.redeemVisitorTicket`
   (seal/exp/kind → tenant+system == the form's target system → site still resolves to the same system with the same consent
   version → burn → `latestConsentedSessionId`). Any failure ⇒ submission still stored, no binding, one WARN without ticket.
6. Consent correctness (finding c): `identify()` binds (and writes IDENTIFY on) only sessions holding the system's CURRENT
   consent version (revoked = null, older version = not current) · `latestConsentedSessionId` = the visitor's latest session
   and only if it holds the current version · session inheritance (`lastIdentifiedContact`) ignores IDENTIFY events on
   revoked sessions.
7. Probe `scripts/pending/cj3/probe-j3.mts` (a–m) RED on the untouched tree → GREEN after · browser journey US9 on :3219 ·
   oracle suites · one local WIP commit.

Out of scope (not built): plain links to `/f/<token>` opened in a new tab (no iframe ⇒ no parent to hand over) ·
third-party-cookie approaches · custom-domain forms · `IDENTIFY_BY` "PORTAL"/"LINK" producers.

## Threat model

- **Attacker page embedding our form** (frames `/f/<token>` on its own site): it receives `sd:form-ready` (no secret in it) and
  can post anything back. A forged/altered ticket fails the GCM seal; a real ticket can only be minted by `/t/v`, which in a
  browser only answers the shop's own https origins (CORS: the attacker's page cannot read the 200 body). It cannot learn the
  visitor id (the `/f` page never has it) nor pull a ticket out of the form (the ticket lives in a React ref, never in DOM/URL/
  storage). Its own tracker cannot get tickets for a shop that did not list its domain.
- **Attacker page embedding our tracker (someone else's siteKey)**: `/t/v` refuses its origin (not in that shop's domains) —
  the same 204 as for an unknown visitor. On the shop's real site the listener only answers frames that are really its own
  iframes AND whose origin is the app origin, and replies only to that app origin, so a foreign frame never receives a ticket.
- **Malicious shop**: can only mint tickets for its own siteKey ⇒ tenant/system inside the ticket are its own; the form action
  requires ticket tenant+system == the form's target system, so a shop-A ticket never binds on shop B's forms, nor on another
  CRM system of the same tenant. A shop could already read its own visitors' ids (its own first-party cookie) — no new power.
- **Bearer note (residual, documented)**: a non-browser client that knows a consented visitor's uuid can forge an `Origin`
  header and mint a ticket for that visitor (same power it already has over `/t/e`: it can inject page views into that
  visitor's session). The uuid never travels in any URL (the old `?v=` lane stays closed — C2.6-S9.2) and lives only in the
  shop's first-party cookie, so obtaining it requires the victim's browser (XSS on the shop's site / device access).
  Considered and NOT adopted: pinning the ticket to the session's ipHash — carrier-grade NAT / wifi↔4G changes would make
  binding flaky for mobile visitors and the attacker who mints is also the one who submits, so it adds little.
- **Network observer**: all prod legs are https (shop origin must be https; tracker origin is https in production). The
  ticket rides only in a response body and a server-action body — never in URLs, Referer, cookies, storage or logs.
  Stolen in transit it is single-use, 15 min, and binds only on that system's forms.
- **Timing**: a 200 vs 204 is the only distinguishable outcome and requires the full set of valid inputs; refusals share one
  code path shape (DB reads differ by a few ms — noted, not mitigated).

## Log
- step 1 (RED, run1 · untouched tree fb7b6b92): probe J3 **4/23** — a1 ✅ (premise: framed submit binds nothing) · a2 ❌ (no /t/v) ·
  c3 ❌ identify bound 2 incl. the revoked session · c4 ❌ re-accept re-validated the revoked row · c5 ❌ identity inherited across a revoke ·
  d ❌ same-host cookie bound a stale-version session · every ticket check ❌ (feature absent) · j ✅ m1 ✅ CLEAN ✅. Log /tmp/cj3-logs/RED-run1.log
- step 2 (implementation): tracking.ts (seal/open helpers · visitorTicket/readVisitorTicket · mintVisitorTicket · redeemVisitorTicket ·
  visitorHandoverOn · consent-current identify/latestConsentedSessionId · no reuse of revoked rows · no inheritance across a revoke ·
  tracker message listener) · tracking-shared (visitorTicketPerIp 20/min) · route /t/v · forms crm-source/service · /f action/page/PublicForm.
  typecheck rc=0 (run3). GREEN (run4): probe J3 **23/23**. Log /tmp/cj3-logs/GREEN-run4.log
- step 3 (browser, build #1 on :3219 · run5/run6): journey US9 **8/8** — US9-3 ✅ (formSubmission.webSessionId set · session with 3 page views
  bound to the contact the product's own iframe form created) · US9-4 ✅ real (gated on US9-2/2b positive control) · 0 origin-guard aborts ·
  screenshots 06/07/09 looked at · `--clean` rc=0 (run6c) · server stopped.
- step 4 (suites, run7 · QC3): qc-crm-c2.6 **87/87** · qc-crm-c2.5 **105/105** · qc-crm-c1.8 **81/81** · qc-form **10/10** · qc-forms-notify rc=0 ·
  qc-crm-c3.9 48/49 → C3.9-X6.2 flagged the tracker's new `fetch(EV,…)` (its "browser code" heuristic looks for `credentials:"omit"`
  within 160 chars) ⇒ moved `credentials:"omit"` first in that options object (same behaviour) ⇒ run9: **49/49** · probe re-run **23/23**.
  qc-crm-c1.11 **57/66** — the SAME 9 findings on the base tree (run8: my 8 src files checked out at fb7b6b92, then restored from HEAD) ⇒
  pre-existing: the switch gate needs env `CRM_V2_SWITCH=all` / `CRM_V2_SWITCH_TENANTS` (ui-version.ts:67-73), unset in the QC3 env.
- step 5 (final browser proof, build #2 = final code · run10/run11): journey US9 **8/8** (US9-3 ✅ · US9-4 ✅) · `--clean` rc=0 ·
  qc-crm-c2.6-web **35/35** (browser half of shark.js on the new script) · 3219 server stopped (port free, units inactive). 2 builds used.
- Not verified here: real production topology (https app origin ≠ QC http), Safari/Firefox postMessage behaviour, forms whose iframe
  origin differs from the tracker origin (APP_URL vs publicAppOrigin in prod) — hand-over silently off in that case (form still submits).

## Round 2 (review `crm-C4.4-fix3-review.md` on a300d68d — MERGEABLE AFTER SHOULD-FIX S1, S2)

Plan (controller rulings): S1 · S2 (a+b+c) · N2 · N6 · N8 decision · N12 probe cases · residual-risk list below.
- RED (probe extended to 32 checks, run on the unchanged a300d68d src · /tmp/cj3-logs/RED-r2-run12b.log): **25/32** — red: J3-l (hand-over
  contract now = allowed hosts) · r1 S1 · r2 S2 · r3 N2 · r4 N6 · r6 opt-out after mint (redeem did not re-check it) · r9 N8.
  Already green on a300d68d (kept as guards): r5 parallel double redeem (exactly one binds, WARN REPLAY) · r7 revoke after mint · r8 bump after mint.
  (First RED run12 showed r5 bound=2 — a PROBE bug: in parallel both calls read "the last row"; the helper now matches its row by answer.)
- Changes:
  - S1 `identify()` IDENTIFY dedupe query also requires `s."consentVersion" IS NOT NULL` (same rule as `lastIdentifiedContact`).
  - S2 (b) tracker: form frames that ask before consent are remembered (`waiting`, ≤10, own iframes only) and served right after the accept
    POST lands (`afterAccept(consent("accept"))`; `post`/`consent` now return the fetch promise). (a) form: at submit, no ticket ever ⇒ ask once,
    wait ≤ 1.5 s. (c) a 10–14 min old ticket is refreshed but kept as fallback if the new one does not arrive in time.
  - N2 burn window = TTL + 2 min.
  - N6 `/f` page gets the target system's tracking domains (`visitorHandoverHosts`, [] = off) as the prop; the form takes `sd:visitor-ticket` only
    when `originAllowed(e.origin, hosts)` (https + listed host). Minor: the form page's RSC payload now contains the shop's tracking domains
    (its own website, where the form is embedded anyway).
  - N8 DECISION: re-accept within 30 min of an OLD-version row upgraded that row with its pre-bump page views ⇒ INCONSISTENT with "pre-bump
    anonymous history is never bound" ⇒ FIXED: `recordConsent` reuses a fresh row only if it already holds the CURRENT version and `openSession`
    reuses only a row holding the same version ⇒ accepting a new version always opens a new session (probe J3-r9). Identity inheritance from a
    stale-version (non-revoked) IDENTIFY is unchanged: it binds only NEW post-consent sessions, not pre-bump history.
  - Redeem re-checks opt-out of the session's contact (WARN OPT_OUT) — the reviewer noted it was only checked at mint.
- GREEN: probe **32/32** (/tmp/cj3-logs/GREEN-r2-run14.log) · typecheck rc=0.

## Residual risk (owner-visible)
(copied from the reviewer's list — N3 N4 N8 N9 N10 N14 — and updated for round 2)
1. Anyone who gets hold of a visitor's browser id (script/XSS on the shop's own website, or the device) can attach that visitor's browsing
   history to a fake lead. They cannot read it. Already possible before this card via the form's cookie path (a non-browser client can send
   `Cookie: sd_vid=<id>`; the rule "never take a visitor id from the caller" does not hold against non-browser callers — pre-existing, N3).
2. Someone holding a visitor id learns one fact from `/t/v`: whether that visitor currently accepts cookies and has not asked to stop tracking (N4).
3. "Use the ticket only once" relies on the database; if the DB errors at that exact moment the limiter fails open and a ticket could be used
   twice (same as e-mail click tickets).
4. A hostile website that embeds a shop's form could plant fake page views on whoever fills it in there — closed for the ticket channel in
   round 2 (N6: the form only accepts tickets from the shop's own tracking domains); still possible by other means (forged cookie, N3).
5. Pages a customer viewed before withdrawing consent, if already linked to that customer, stay on the customer's history until retention or
   erase — this card only stops NEW linking (N9, pre-existing).
6. After a shop publishes a new cookie text, earlier anonymous browsing is never linked to a lead any more (stricter than before) — and since
   round 2 (N8) re-accepting the new text always starts a new session.
7. The public form link reveals that the shop uses CRM v2 web tracking and, since round 2, the shop's tracking domains (the tracking script link
   already reveals v2) (N10).
8. If the form is served from a different address than the tracking script (custom domain, misconfigured APP_URL), linking quietly does not
   happen; the form still works (N14).
9. (round 2) A framed v2 form whose visitor never accepts cookies waits up to 1.5 s at submit for a ticket that will not come (bounded, S2a).
- r2 verification (fresh build of r2 code on :3219 · run16/run17): journey US9 **8/8** (US9-3 ✅ webSessionId set · US9-4 ✅) · `--clean` rc=0 ·
  **browser-j3 4/4** (`scripts/pending/cj3/browser-j3.mts` · log + screenshots `.qc-shots/crm/cj3/browser/`): B-A accept > 9 s after the form
  loaded ⇒ bound (the only /t/v fired accept+217 ms = the tracker's afterAccept push) · B-N6 real ticket planted by a non-listed https parent ⇒
  nothing bound · B-N6c same page on the shop's listed host ⇒ bound (positive control) · qc-crm-c2.6-web **35/35** · server stopped.
- r2 suites (run18 · QC3): c2.6 **87/87** · c2.5 **105/105** · c1.8 **81/81** · c3.9 **49/49** · qc-form **10/10** · forms-notify rc=0 ·
  c1.11 **66/66** with `CRM_V2_SWITCH=all` (confirms round 1's 9 reds were only the missing env switch) · typecheck rc=0 (full tree, run15).
- r2 F2.3: the first r2 commit attempt was refused by pre-commit fitness F2.3 — `PublicForm.tsx` imported `@/lib/modules/crm/tracking-shared`
  (only the facade / `crm/ui` may be imported from outside CRM; no exceptions to be added; the facade cannot go into a client bundle) ⇒ the
  form uses its own pure `src/lib/modules/forms/handover-shared.ts#parentOriginAllowed`, and probe J3-r4 pins it to CRM's `originAllowed` on
  14 edge cases. Re-verified on the code as committed: fitness 33/33 (`pnpm fitness`) · probe **32/32** · c2.6 **87/87** · typecheck rc=0 ·
  round-2 build #2 on :3219 (run19/run21): US9 **8/8** · browser-j3 **4/4** (B-A /t/v at accept+243 ms) · c2.6-web **35/35** · clean rc=0 ·
  server stopped. Two builds used in round 2.
