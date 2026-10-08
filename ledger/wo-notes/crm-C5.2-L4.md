# C5.2 HUNTER — lens L4: PUBLIC SURFACE (read-only hunt · 27 Sep 2026 · Opus 5.5)

Scope: everything reachable without a staff session — `/t/o` `/t/c` `/t/e` `/t/consent` `/t/s` · `/l/<code>` · `/u/<token>` (+ `/one-click`) ·
public forms `/f/<token>` · portal `/b/<slug>/*` + REST lane `/api/v1/crm/portal/*` · `/api/email/inbound` · `/api/email/resend/webhook` ·
REST `/api/v1/crm/*` (+ `openapi.json`, `manifest.json`) · outgoing webhooks (SSRF guard) · `/api/files/<id>`.
HEAD = `1576edcb`. Method: traced route → facade → service → SQL; two probes (see end). No file outside this note and
`scripts/pending/hunt-l4/` was touched; probes ran on QC2 with a throwaway tenant `qc-hunt-l4-*` (cleanup verified: 0 tenants, 0 users left).

**Counts: BLOCKER 0 · MAJOR 3 · MINOR 6.** Not repeated: L2, L5, C3.9-fix, C5.1 F5.

---

## MAJOR

### L4-M1 · Inbound "staff BCC capture" accepts a forged From — a stranger can post mail "sent by staff X" into any customer's timeline · CONFIRMED (probe)
- **Where:** `src/lib/modules/crm/emails.ts:1853-1857` (`fromAuthenticated`) and `authResultPass` at `:1765-1780`.
- **Two separate holes:**
  - **(a) A verified sending domain is used as proof of inbound authenticity.** `verifiedDomains(tenantId).has(domain(From))` means only "Resend may send *as* this domain". It says nothing about who sent this inbound message. So for every shop that verified its domain (the recommended setup), a bare `From: owner@shop.co.th` with no headers at all is enough.
  - **(b) `Authentication-Results` is trusted from any author.** The code never checks the authserv-id, accepts `X-Authentication-Results` as well, and joins every instance of the header. The sender writes these headers. RFC 8601 only requires the MTA to strip headers that carry *its own* authserv-id, so a header like `attacker.example; dkim=pass header.d=<staff domain>` reaches us. How the provider/Worker serialises the header map decides whether the MTA's own header even wins.
- **Attack:**
  1. The inbound key is public to every customer: it is in the Reply-To `crm+<key>+t<short>@shark.in.th` of any mail the shop sent (SHARK reply mode).
  2. Send a mail to `crm+<key>@shark.in.th` with `To: victim-customer@x` in the header, `From: owner@<verified domain>` (or any member's e-mail plus a forged A-R header), and a body like "ยืนยันส่วนลด 50%".
  3. Result, when `bccCaptureEnabled`: direction OUT, `sentById` = that staff member, `contactId` = the victim contact, an EMAIL activity on the timeline, and a `crm.email.*` event that can feed automation.
- **Probe `l4-inbound-staff-spoof.mts`:**
  - (A) verified domain, no headers → `dir=OUT sentById=OWNER contact=victim`.
  - (B) forged `authentication-results` with authserv-id `attacker.example` → OUT, sentById = STAFF2.
  - (C) forged `x-authentication-results` → OUT.
  - Control: no evidence and domain not verified → IN.
- **Why the oracles miss it:**
  - C2.5-S3.4 and S10.7 build the A-R fixture with an arbitrary authserv-id string (`mx.shark.in.th`). They only test the "no header ⇒ IN" twin.
  - Nothing tests an attacker-authored header, and nothing tests a spoof on a VERIFIED domain; the verified branch is only asserted positively.
- **Minimal fix:**
  - Drop the VERIFIED-domain shortcut.
  - Honour only the *first* `Authentication-Results` whose authserv-id equals a configured value (e.g. `CRM_INBOUND_AUTHSERV_ID` of the real inbound MTA). Never honour `X-Authentication-Results`.
  - Require `dmarc=pass header.from=<From domain>`; SPF `smtp.mailfrom` is not aligned with From.
  - Better still: let the inbound Worker compute auth itself and send it as a field covered by the inbound secret.
  - ORACLE-ADD: forged A-R twin, X-A-R twin, verified-domain spoof twin ⇒ all IN.

### L4-M2 · Outgoing-webhook SSRF guard is bypassable (IPv4-mapped IPv6, redirects, slow DNS, rebinding) · CONFIRMED (probe) for IPv6 + redirect, CONFIRMED by code for DNS fail-open
- **Where:** `src/lib/webhooks/service.ts`
  - `isPrivateAddress` `:55-87`
  - `webhookTargetProblem` `:108-125`
  - `deliver` `:224-250`, with the fetch at `:238`
- **Who uses the guard:**
  - CRM events via `outbox-consumers.ts:396 dispatchWebhooks`
  - endpoints created from `/crm/settings/api`
  - CRM automation WEBHOOK (`automation.ts:993`)
  - inbound linked attachments (`emails.ts:1726`)
- **Four bypasses:**
  1. **IPv4-mapped literals.** WHATWG URL rewrites `http://[::ffff:127.0.0.1]/` to hostname `[::ffff:7f00:1]`. `isPrivateAddress` only strips `::ffff:` and then needs a dotted quad, so the hex form passes as "public".
     - Probe results: `[::ffff:7f00:1]`, `[::ffff:a9fe:a9fe]` (=169.254.169.254), `[::ffff:a00:1]`, `[::7f00:1]`, `[64:ff9b::7f00:1]` and `[fec0::1]` all → ALLOWED.
     - `fetch("http://[::ffff:7f00:1]:<port>/probe")` reached a 127.0.0.1 listener (200).
  2. **Redirects are followed.** `deliver()` calls fetch without `redirect: "manual"`. Probe: a POST to a public-looking target that answers 302 to `127.0.0.1` gets followed (200, `redirected=true`).
     - Automation and inbound attachments do use `manual`; the webhook sender, which is the main path, does not.
  3. **DNS that fails or answers late is treated as allowed.** `addrs === null ⇒ allowed` when no injected lookup (`:123`), and the lookup race times out at 1.5 s. An attacker nameserver that answers slowly the first time and fast (127.0.0.1, TTL 0) for fetch's own lookup passes.
  4. **Check and use resolve separately** (classic rebinding window).
- **Impact:** a shop owner or manager (self-serve tenant) can set an endpoint or an automation URL that reaches loopback or internal addresses.
  - On Vercel it is a blind POST to e.g. the Lambda runtime API on 127.0.0.1:9001, plus a status/port oracle through the "test" button (`lastError = "ปลายทางตอบรหัส N"` versus network error).
  - On any VPS deployment it is full internal reach (the QC servers here listen on 127.0.0.1).
- **Why the oracles miss it:** the M1/X6 checks use `127.0.0.1`, `169.254.169.254`, `[::1]` and an injected `lookup`. No hex-mapped IPv6, no redirecting target, no slow or failed DNS with a real resolver.
- **Minimal fix:**
  - Normalise every address with `net.BlockList` (or convert `::ffff:a.b.c.d` / `::ffff:XXXX:YYYY` / `::a.b.c.d` / `64:ff9b::/96` to IPv4). Also block `fec0::/10`, `2002::/16` (6to4) and `::/96`.
  - Fail closed on lookup null/timeout in production.
  - Pin the resolved, validated IP for the connection: an undici `Agent({ connect: { lookup } })` that re-validates at connect time.
  - Add `redirect: "manual"` in `deliver` and treat 3xx as a failure.

### L4-M3 · `/l/<code>` is an open redirector on `shark.in.th` for any self-serve tenant · PLAUSIBLE (policy)
- **Where:**
  - `src/lib/modules/crm/tracking.ts:310-327` (`cleanLinkUrl` accepts any http/https host)
  - `:344` (`createLink`, custom codes 6–32 chars, global and case-sensitive)
  - `src/app/l/[code]/route.ts`
- **Attack:** sign up (`/onboarding` → `createTenantForUser`), switch CRM to v2, then create `/l/Shark-Login` → `https://phish.example/…`, or `/l/<random>` → a malware URL. The links carry SHARK's domain reputation, get a QR code from `linkQrSvg`, and cost nothing. `/t/c` behaves the same way through a template or REST send to yourself.
- **Why it matters beyond phishing:** `shark.in.th` is also the host of every shop's `/t/c`, `/t/o` and `/u` links inside CRM mail. One Safe-Browsing or Spamhaus-DBL listing caused by one abusive tenant lands every tenant's CRM mail in spam, and puts a red interstitial on the whole app.
- **Mitigations present:** http/https only, no control characters or quotes, the destination comes only from the DB row, and deactivation is possible. There is no destination policy, no reputation check and no abuse path.
- **Why the oracles miss it:** X6 tests scheme and parser tricks only; "who may point `shark.in.th` anywhere" is not a tested property.
- **Minimal fix (owner decision):**
  - Serve tracked links from a separate short domain, so reputation damage stays isolated.
  - Or restrict destinations to the tenant's declared or verified domains until the tenant is verified or paid, and use an interstitial for other hosts.
  - Add a Safe Browsing lookup at create/update, and a staff kill-switch.

---

## MINOR

### L4-m1 · `/t/c` sends a customer to the SHARK homepage when the stored destination has non-Latin-1 characters (Thai path) · CONFIRMED (runtime) / trigger PLAUSIBLE
- **Where:** `src/app/t/c/[token]/route.ts:36`, which does `new Response(null, { headers: { Location: target } })`.
- **What happens:** `target` is the raw href captured by `composeOutgoing` (`emails.ts` regex plus `decodeAttr`; `sanitizeHtml` does not encode). A ByteString violation throws. Probe: `Cannot convert argument to a ByteString … value 3626`. The `catch` then sends the customer to `home()`, i.e. `https://shark.in.th/`, after the click was already counted.
- **Contrast:** `/l` already fixed exactly this (`headerSafe` at `src/app/l/[code]/route.ts:17`); `/t/c` did not.
- **When it triggers:** templates, REST `bodyHtml`, sequences and automation mail with a link like `https://shop.co.th/สินค้า/…`. The UI composer produces no `<a>` at all, which is probably why nobody saw it.
- **Fix:** reuse `headerSafe` (or `new URL(url).href`) before setting Location.
- **Why the oracles miss it:** C2.5 click fixtures are ASCII URLs.

### L4-m2 · RFC 8058 one-click unsubscribe is silently dropped when the per-IP bucket is full · CONFIRMED (code) / trigger PLAUSIBLE
- **Where:** `src/app/u/[token]/one-click/route.ts:32`: `if (clean && allowed) unsubscribe(...)`, otherwise the same "ยกเลิกรับอีเมลแล้ว" page is returned.
- **Why the per-IP bucket fills:** it is 60/min per IP, shared by **all tenants**. Gmail and Yahoo perform the one-click POST **server-side**, from a small pool of provider IPs. A large campaign across tenants can push one Google IP over 60/min.
- **Effect:** the provider sees 200 and the button disappears, but the contact is not opted out and nothing records the request. This is a legal and deliverability problem, and the Gmail bulk-sender rules require honouring these requests.
- **Fix:** rate-limit only *unknown* tokens. A token that verifies is idempotent (`markEmailOptOutInTx` returns `flipped`; the event is deduped by `providerEventId unsub:<id>`), so apply it always and write the audit only when `flipped`. This refines ruling F8; it does not reverse it.
- **Why the oracles miss it:** C2.5-S10.8 asserts the *current* behaviour (full bucket = no write) with a synthetic IP.

### L4-m3 · The rate gate itself writes an unbounded number of rows: the token bucket is written even when the IP is already over the limit · CONFIRMED (code)
- **Where:** `emails.ts:2334-2336`, `trackGate`. `checkRateLimitDb(tokKey)` runs unconditionally after the IP check.
- **Attack:** every `/t/o/<random>.gif`, `/t/c/<random>` or `/u/<random>/one-click` request with a fresh token INSERTs a new `ChatRateBucket` row, even after its IP is blocked. Rows only disappear in the daily sweep. The per-IP limit therefore limits counting but not DB writes; one client at N req/s creates N rows/s.
- **Fix:** `if (!ipOk.ok) return false;` before touching the token bucket.
- **Why the oracles miss it:** S10.8 measures the verdicts, not the row count.

### L4-m4 · Per-IP buckets are keyed by the full IPv6 address, so rotating within a /64 defeats them · PLAUSIBLE
- **Which buckets:** every public per-IP bucket (`crm:te:`, `crm:tc:`, `crm:l:`, `crm.email.t.*`, `files:private:ip:`, `portal-invite:`, `crm:portal:line:`).
- **Where it bites hardest:** `/t/e` and `/t/consent` share **one** per-site bucket, `crm:ts:<siteKey>` at 5,000/min (`tracking.ts:736`), and the siteKey is public in the shop's page. About 84 rotated IPv6 addresses × 60/min starve a shop's real page-view **and consent/revoke** recording for as long as the attack runs.
- **Mitigations present:** real traffic is only lost for the minutes of the attack; the client still honours the decline/revoke cookie locally.
- **Fix:** bucket IPv6 by /64 (or /56). Give consent its own per-site bucket, and never drop `decline`/`revoke` because of a full site bucket.

### L4-m5 · Form → web-session link can never fire in production · PLAUSIBLE (functional)
- **Where:** `src/app/(store)/f/[token]/actions.ts:18-23` reads `sd_vid` from the request cookie on `shark.in.th`. `shark.js` sets `sd_vid` on the **shop's** domain (`put()`, with no Domain attribute).
- **Why it never fires:** the form, iframed or linked, is on shark.in.th and never sees that cookie, so `webSessionId` stays null.
- **Security note:** the "read from the cookie only" hardening (review round 2, S1) is not a boundary. A raw HTTP client sets `Cookie: sd_vid=<any uuid>`. The real protection is that the visitor uuid cannot be guessed.
- **Fix:** have shark.js pass the visitor id to the iframe via `postMessage` and a short signed ticket issued by `/t/e`, or accept the loss and drop the code.
- **Oracle:** C2.6 presumably injects the Cookie header directly (not re-checked).

### L4-m6 · The portal exposes every file attached to a portal-visible record, with no per-file share flag · PLAUSIBLE (design gap)
- **Where:** `src/lib/modules/crm/portal.ts:759-780` (`filesOf`). It lists all `CrmFileLink` rows (`entityType RECORD`) of the record.
- **Gap:** fields are filtered by `portalVisible && !sensitive` (`:798-805`), but files are not. DESIGN-CRM:118 says "ไฟล์ที่พนักงานแชร์", i.e. an explicit share. An internal file a staff member attaches to a shared contract record (cost sheet, ID scan) is downloadable by every portal user of that company.
- **Not verified:** whether FILE-type field uploads also create a `CrmFileLink`. If they do, `sensitive` FILE fields leak too.
- **Fix:** a `portalShared` flag on `CrmFileLink` (or a file field that is itself `portalVisible && !sensitive`), filtered in `filesOf`.

---

## Checked and found sound
- **`/t/o`**
  - Byte-identical 43 B gif, `no-store`, for known, unknown, rate-limited and error cases.
  - Token = `<emailId>~192-bit`; only purpose-separated sha256 is stored; open lookup is by `trackTokenHash`.
  - Bot UA and <2 s opens are not counted; `trackingOptOut` is honoured; counter, event and outbox are in one transaction.
- **`/t/c`**
  - The destination comes only from the row matching the token's link hash; `?url=` and friends are ignored; a tampered token → home.
  - Rate-limited = still redirected but not counted.
  - The identify ticket is AES-256-GCM (opaque), expires in 15 min, is bound to tenant+system, is burned *after* validation, and is only appended for shop-declared domains.
- **`/l`**
  - Code is globally `@unique`; unknown, inactive and expired codes get an identical 302 to the fallback.
  - URL scheme/whitespace/backslash/`///` checks at create and update; `headerSafe`.
  - The `sd_u` cookie carries no identity, is path-scoped, `HttpOnly; Secure; Lax`; v1 shops redirect without counting.
- **`/u`**
  - GET renders a static page with no DB access and no PII; the token is only in an encoded form action.
  - Unsubscribe is POST-only; `/one-click` GET = 405.
  - `List-Unsubscribe` + `-Post` headers are set (`emails.ts:1305`); the page carries XFO DENY.
- **`/t/e` and `/t/consent`**
  - The body cap (8 KB) is enforced before and during the read, chunked bodies included.
  - Constant 204/413. CORS: exact https origins of the site referenced in the payload, never `*`, no credentials.
  - Origin and URL host are checked; a uuid visitor id is required.
  - Identify requires a server-issued ticket; raw email/phone/contactId are ignored. Decline writes zero rows.
- **`/t/s`**
  - An unknown, disabled or v1 siteKey gets the identical NOOP script.
  - Values go in via `jsLiteral`; the banner uses `textContent`; `nosniff`.
- **Resend webhook**
  - 413 before the read; Svix HMAC is compared timing-safe; ±5 min skew.
  - Secret unset ⇒ 401; the rate gate runs only after the signature check.
  - Replay is deduped via unique `providerEventId` (svix-id); DB error ⇒ 500 so Svix retries.
- **Inbound route**
  - Secret unset ⇒ 503; hashed timing-safe compare; content-length cap.
  - The CRM module is loaded only for CRM recipients; the threading short-tag is compared for equality; HTML is sanitised before it is stored.
  - Note: a chunked body without content-length is fully buffered before the 10 MB check (`route.ts:143`). This is bounded by Vercel's 4.5 MB limit.
- **Portal**
  - Invite token is 256-bit, stored as a hash, 7 days, claimed once by a conditional `updateMany`; the per-IP invite bucket uses an HMAC'd IP.
  - Opening the invite page does not consume it.
  - OTP has a uniform response through the member engine, and mail goes off-path.
  - LINE login checks: JSON content type + same-origin + an HMAC nonce cookie bound to the slug with 10-min expiry + LINE `verify` with `aud`/`iss`.
  - Sessions are bound to tenant+system on every page. Identity changes revoke sessions (`portal-identity.ts`).
  - Cookie is `__Host-` + httpOnly + lax; `/b/*` has XFO DENY.
  - Portal tokens on shop ops ⇒ 403; shop keys on `/portal/*` ⇒ 401; per-access rate buckets.
  - Slip upload: MIME is sniffed and must equal the declared type; 5 MB cap; stored as a private file.
- **REST `/api/v1/crm`**
  - Body cap before auth (1 MB; 10 MB for import).
  - Key → `tenantDb` scoping; a foreign `X-Shark-System` ⇒ 403 `system_mismatch`; v1 gate ⇒ 409.
  - Errors are Thai-safe or generic (no Prisma text).
  - `openapi.json` is `private, no-store` when keyed and `public` + `Vary: Authorization` when not; `manifest.json` is registry-only.
- **`/api/files/<id>`**
  - IP bucket before the DB, viewer bucket before the signature check; path-like ids ⇒ 404.
  - The signature is bound to the viewer (STAFF/CUSTOMER/PORTAL session), and the 15-min cap is re-checked; cross-tenant ⇒ 404.
  - MIME comes from the registry; `nosniff`; `attachment` except png/jpeg/audio; `private, no-store` on every status.
- **Template rendering:** variables are HTML-escaped (`emails.ts:1080-1082`); the subject goes through `cleanSubject` (no CR/LF), so a public-form name cannot inject HTML or headers into shop mail.
- **Automation WEBHOOK** uses `redirect: "manual"` (`automation.ts:1067`) and its body is ids only. It still inherits bypasses 1, 3 and 4 of M2.
- **X-Forwarded-For:**
  - On Vercel (vercel.json, region sin1) the edge overwrites XFF, so taking the first hop is sound there.
  - It would be spoofable behind any other proxy, and every public route re-implements `ipOf`. A single helper would be good hygiene.
- **Clickjacking:** `src/proxy.ts` sends XFO DENY everywhere except `/f/*`. `/f` is intentionally framable; the public form carries no privileged action.

## Probes (kept in `scripts/pending/hunt-l4/`)
- `l4-ssrf-guard.mts`: no DB writes. IPv6-literal verdicts, fetch to loopback through `[::ffff:7f00:1]`, default-fetch redirect follow.
- `l4-inbound-staff-spoof.mts`: QC2 throwaway tenant. Cases A/B/C + control as described in M1; cleanup verified with 0 left.
- Run with `bash scripts/qc2.sh pnpm exec tsx scripts/pending/hunt-l4/<probe>.mts`.
