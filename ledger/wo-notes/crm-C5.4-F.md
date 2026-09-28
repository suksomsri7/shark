# C5.4-F — FB-PUBLIC (L4) + C4.4 infra I1/I2 · builder Opus 5.5 · 28 Sep 2026

Worktree `shark-crm-c54f` detached @ dd201a8d (committed HEAD; main's working tree also has uncommitted batch A + C4.3-fix2) · not committed.

## Items (status)
- [x] L4-M1 inbound From spoof — `emails.ts` `authResultPass`: trusts ONLY the first `Authentication-Results` instance whose authserv-id = env `CRM_INBOUND_AUTHSERV_ID` (unset ⇒ nothing trusted, fail-closed); `X-Authentication-Results` ignored; instances split on `,`/newline after unfolding, comments `( )` stripped and quoted strings respected (so a comment/quote cannot forge an instance); dkim→header.d/i · spf→smtp.mailfrom · dmarc→header.from, all aligned to the From domain. Verified-domain shortcut REMOVED. No evidence + staff/verified-domain From ⇒ IN, `routing.unverifiedShopFrom=true` (kept when attachments update routing), and a staff-claimed From never becomes a stranger lead.
- [x] L4-M3 objective part — `tracking.resolveLinkHit`: tenant status read in the same query; SUSPENDED / CLOSED / PENDING_DELETE ⇒ null (= unknown-code fallback, nothing counted). TODO hook `linkDestinationAllowed()` (returns true) for owner Q15 destination policy / Safe Browsing.
- [x] L4-m1 `/t/c` Thai path — shared `headerSafeLocation` (tracking-shared, re-exported by `tracking`) used by `/l` and `/t/c`; non-ASCII ⇒ `new URL().href` (no double-encoding of existing `%xx`), fallback encodeURI.
- [x] L4-m2 one-click at full bucket — route always calls `unsubscribe(token, {rateLimited: !allowed})`; valid token flips at any bucket level; rate-limited + already opted out ⇒ no writes; audit only when flipped (ruling 4).
- [x] L4-m3 `trackGate` — `checkRateLimitDbMany(..., { chain: true })`: token bucket touched only when the IP bucket passed.
- [x] I2 `trackerOrigin()` — APP_ENV=production ⇒ unchanged (`publicAppOrigin`); otherwise origin of the env's own APP_URL (never shark.in.th).
- [x] I1 `sendEmailRich` — after header validation, `!deps.fetch && !emailEnabled` ⇒ console log + `{ok:true, providerId:"dev_<uuid>"}` (same discriminator as `sendEmail`). Prod has a key ⇒ unchanged.

Also: `.env.example` documents `CRM_INBOUND_AUTHSERV_ID` (empty ⇒ every staff BCC copy is stored IN). **Deploy item:** set it in Vercel prod to the real inbound MTA's authserv-id, else BCC capture never yields OUT.
A-R parser probed standalone (19 cases incl. comment/quote smuggling, appended foreign instance, 2nd trusted instance, prefix trick, `reason="… header.d=…"`, folding, unset env) — all as intended; probe deleted.

## ORACLE-EDIT (proposed, applied in this diff — controller approves at merge)
- `scripts/qc-crm-c2.5.mts`: sets `process.env.CRM_INBOUND_AUTHSERV_ID="mx.shark.in.th"` (the authserv-id S3.4/S10.7 fixtures already write); S10.7 text drops "or a From on a VERIFIED EmailDomain"; S10.8 per C5.3 ruling 4 (`kU1.emailOptOut === true`).
- NOT edited, will break: `scripts/qc-crm-c2.6-web.mts` (browser) — on a QC server with APP_ENV≠production the served tracker now posts to `http://127.0.0.1:3215/t/e` (I2) instead of https://shark.in.th ⇒ S0.4 ("absolute https") red and the posts bypass its TLS proxy (`EXCLUDE 127.0.0.1`) ⇒ proxy-log checks red. Needs a harness edit (route APP_URL origin through the proxy / accept APP_URL origin outside prod).

## Proof (QC2 · gate lock · systemd units)
- `qc-crm-c5.3 --only=L4`: 7/8 — L4-M1 · m1 · m2 · m3 · M3 green, K.1 + CLEAN green; L4-M2 red = batch A (webhooks) not in committed HEAD.
- `qc-crm-c5.3` full: base (HEAD, src reverted) 2/54 → after 7/54; the only verdict changes are the 5 L4 checks; every other ACTUAL line identical (random tags / timing only).
- c2.5 105/105 (with the ORACLE-EDIT above) · c2.6 87/87 · c2.9 52/52 · c3.5 67/67 (all run on QC2).
- typecheck: only the 4 pre-existing errors of committed `scripts/pending/hunt-54a/*` (reference batch A's `pinnedFetch`/`outboundFetch`, uncommitted) — none from this diff · fitness 33/33 with QC2 env and without env.

### Controller rulings (28 Sep ~11:00 UTC)
- c2.5 ORACLE-EDITs (S3.4/S10.7/S10.8 + CRM_INBOUND_AUTHSERV_ID fixture) ✅ approved (rulings 4 + L4-M1).
- qc-crm-c2.6-web.mts: update the harness to expect the ENVIRONMENT's tracker origin (I2) — S0.4 = "absolute URL of this environment's origin" (https in production), and route the proxy checks accordingly; mark ORACLE-EDIT (C5.4-F · I2). Do it in round 2.
- I1 keeps the `!emailEnabled` test (same as sendEmail) — accepted; preview/staging with a real key sending is by design.
- Prod env CRM_INBOUND_AUTHSERV_ID → owner item P14 (fail-closed until set).
- Suspended tenant's old /t/c links + UI badge for unverifiedShopFrom → later (batch E list).

## Review round 1 → round 2 (controller: MERGEABLE AFTER SHOULD-FIX)
- SF2 `emails.ts` IN branch: Reply-To is not used for contact matching when `staffClaim && !fromAuthenticated` (shop-domain form mails from non-staff addresses still match by Reply-To) — pinned by ORACLE-ADD C5.3-L4-M1b (c).
- SF1 `.env.example`: the env may be set only after a live forged-twin test and only if the inbound path strips/renames incoming A-R with our id (or always prepends its own and delivers all instances top-to-bottom); Resend inbound webhook may carry no headers (= IN always).
- N3 L4-M3: ALLOWLIST `ACTIVE | PENDING` (anything else, incl. unknown/new status, ⇒ no redirect).
- N9 ORACLE-ADD `C5.3-L4-M1b` in `scripts/qc-crm-c5.3.mts`: (a) genuine FAIL first + forged PASS with our id after (`\n` and `, `) ⇒ IN, controls genuine PASS ⇒ OUT (also with a forged FAIL after) · (b) env unset + A-R with our id ⇒ IN (asserted); env set ⇒ recorded only (dependency on MTA stripping) · (c) SF2.
- c2.6-web harness (controller ruling: tracker origin = this environment): S0.4 = absolute URL of the server's own origin (https when the env is https; never shark.in.th from another server); a plain-http forward proxy sharing the front-door handler + `--proxy-server=http=… --proxy-bypass-list=<-loopback>` so posts to http://127.0.0.1:<port> are still logged and leave the browser for real.
- c2.6-web needs a server running THIS code: built the worktree (hunt-54a probes parked outside during the build only — they need batch A) and served on :3229 with .env.qc2 + APP_URL=http://127.0.0.1:3229 (unit c54f-serve).
- Round-2 proof (units c54f-r2 · QC2 · gate lock): c5.3 `--only=L4` 8/9 (M1 · M1b · m1 · m2 · m3 · M3 · K.1 · CLEAN; M2 = batch A) · M1b red-before with SF2 reverted: `(c) forgedStaff+ReplyTo contact=CUSTOMER` → after: contact null · c2.5 105/105 · c2.6 87/87 · c2.9 52/52 · c3.5 67/67 · c2.6-web 35/35 (server :3229 = this build, now stopped) · fitness 33/33 ×2 · typecheck only the 4 pre-existing hunt-54a errors.

## Hunt round 3 (controller: fix all before P14)
- A-R proof = ONLY `dmarc=pass header.from=<From domain exactly>` in the single instance headed by CRM_INBOUND_AUTHSERV_ID; distrust if our id heads >1 instance, the instance has >1 dmarc or >1 spf resinfo, or a comment/quote is unbalanced or swallows a header boundary (`,`/newline); dkim/spf alone never count (header.i moot). Folding: a whitespace-led line that looks like a new instance head (`id [ver];`, no `=`) is a boundary, not a fold.
- Key collisions (`Authentication-Results` + `authentication-results`): joined with `\n` in insertion order in `lowerHeaders` AND `api/email/inbound/route.ts` crmExtras (then our-id-twice ⇒ distrust).
- Reply-To matching only when the From is on a VERIFIED shop domain and not a staff address. Stranger lead also needs `!unverifiedShopFrom` and `!mimicsStaff` (+tag of a staff address · staff's non-public domain · display name carrying a staff address / equal to a staff name).
- INFO: trackerOrigin guards origin "null"/non-http ⇒ http://localhost:3000; one-click at full bucket reads emailOptOut first (no tx when already out).
- ORACLE-ADD `C5.3-L4-M1c` (A1 fold · A2/A2' unescaped `)` dkim/dmarc · A3/A3' unquoted HELO · A4 · A7 key collision · A12 header.i · A13 outsider Reply-To · A14/A15/A16 leads + controls). M1b control changed: genuine-PASS + forged-FAIL with our id twice ⇒ IN (ruling). c2.5 S3.4 fixture + `dmarc=pass header.from`. `.env.example` P14 text: HELO/MAIL FROM injection twins + MTA must emit exactly one dmarc.
- Proof: L4 before (round-2 src) M1b/M1c red (every injection OUT, leads 1/1/1, outsider→CUSTOMER) → after 9/10 (only M2 = batch A) · hunter probe before/after: A1/A2/A3/A7/A12 OUT→IN, A13 CUSTOMER→not customer, A14/A15/A16 lead→none; controls genuine=OUT, A10 upper-case id=OUT, env unset=IN · c2.5 105/105 · c2.6 87/87 · c2.9 52/52 · fitness 33/33 ×2 · typecheck = only the 4 pre-existing hunt-54a errors.
