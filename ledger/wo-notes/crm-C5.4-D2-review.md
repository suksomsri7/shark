# C5.4-D2 review — independent security + correctness (read-only on src) · Opus 5.5 · 1 Oct 2026

VERDICT: MERGEABLE AFTER D2-S1, D2-S2, D2-S3. All three are small and v2-only. None is prod-exposed today: no prod shop is on v2 and the crm-cron crontab is not installed. The alternative is to merge now and gate C6.1 on them.

Scope: `git diff 288cca97 81209310 -- src` (emails.ts · sequences.ts · crm/index.ts · app/b/[slug]/actions.ts) · probe `scripts/pending/cd2/probe-cd2.mts`.
Reviewer probe: `scripts/pending/cd2/review/probe-cd2-review.mts`. Every check asserts the correct behaviour, so RED means the finding is proven.
- Run on QC3: **2/7** (5 RED = 5 proven findings; RV-X informational; CLEAN 0 rows).
- Log: `/tmp/cd2-review-logs/probe-cd2-review.log`.

## Reruns (QC3 · CRM_V2_SWITCH=all · gate lock · logs /tmp/cd2-review-logs/)
- probe-cd2: **19/19**
- probe-c54d-r2: **13/13**
- probe-c54d-r3: **18/19**
  - R2S2a is red by design. ACTUAL: `row=SENT/null/<accepted id> accepted=1 calls=["lost","replay-200"]`, and the held mail's links resolve (see ORACLE-EDIT).
- qc-crm-c2.2: **73/73** · qc-crm-c2.5: **105/105** (0 ❌)

## SHOULD-FIX (new in this card)

### D2-S1 — "Byte-identical redelivery" is not guaranteed
**Where:** `emails.ts` 1360-1386.

When the request is not identical, the claim overwrites the row's token hashes, and a 409 now ends the step FAILED. The result: the customer's held mail has dead links, or a delivered mail is recorded FAILED and the sequence stops.

**Fields of a redelivery that are NOT taken from the first attempt:**
- **The HMAC key.**
  - `tokenKey()` reads `SESSION_SECRET` at call time. A rotation, or a different value on the VPS (`scripts/crm-cron.mts` loads `.env`) than on Vercel (`/api/cron/outbox`), changes html and headers. Both hosts run `crm.sequences` through `runMinuteJobs`.
  - **RV-T1 RED.** ACTUAL `calls=["lost","409"] bodyFieldsDiffer=["html","headers"] row=FAILED/PROVIDER_409`. The held mail's List-Unsubscribe one-click no longer opts the contact out (`heldMailUnsubWorks=false`).
  - Cause: the claim (1372-1381) wrote non-reproducible `trackTokenHash`/`routing.links`/`unsub`. The FAILED path never restores them. Open, click and unsubscribe of the mail the customer holds are dead, which is a compliance issue. The 409 is then counted ×5, so the step stops with STOPPED FAILED although the mail was delivered.
- **Reply-To.**
  - `replyToHeader(firstRouting, inboundKey /*CURRENT*/, threadKey)` at `emails.ts` ≈1003-1007 and 1383-1386.
  - After `rotateInboundKey` (an owner action, `emails.ts:561`), the stored plain address no longer equals the current one. The header loses its `+t<short>` and points at the dead key.
  - **RV-T2 RED.** ACTUAL `fieldsDiffer=["reply_to"] calls=["lost","409"] row=FAILED/PROVIDER_409`, which leads to the 5× path and STOPPED FAILED while the mail was delivered.
- **APP_URL change** (tracking and unsubscribe base URL in the html and List-Unsubscribe).
- **A deploy that changes any byte of the composed body** between attempts: `composeOutgoing` footer/pixel, `htmlToText`, `sendEmailRich` JSON shape. Deploys are frequent in this project.

**Before this card:** R2-S2 read such a 409 as "accepted earlier" and restored the previous hashes. Removing it is right for the reproducible case, but it regresses these cases.

**Cheap fix, all three parts:**
- (a) The redelivery claim sets only `status/providerError/leaseUntil`. Hashes and routing links/unsub are written only in `deliver`'s SENT tx, which already does this via `sentHashes`. A failed attempt then never touches the hashes of the mail the customer may hold.
- (b) Store the Reply-To header actually sent in the first attempt (e.g. `routing.rt`) and reuse it verbatim.
- (c) Optional: if `again.openHash !== prior.trackTokenHash` (key changed), do not redeliver under the old key. Return a distinct failCode (e.g. `NOT_REPRODUCIBLE`) and let the step skip or stop with a reason, plus an ops WARN.

**C6.1 gate:** `SESSION_SECRET` and `APP_URL` must be byte-identical on every host that runs `crm.sequences` or `crm.email.scheduled`. Add this to the N6 drainer env parity check.

### D2-S2 — F4 wait episodes are never reset
**Where:** `sequences.ts` ≈1588-1635.

- `stats.waits["v:idx:kind"]` is only ever COALESCE-written. "Since" is therefore the first wait ever at that step, not the start of the current episode.
- Any later wait at the same step (after pause/resume, after a transient or outage interlude, or after a cap→send→fail sequence) measures from the old timestamp.
- **RV-F4 RED.** Cap full on day 0 (one wait), then pause and resume, then cap full for ONE day a week later.
  - ACTUAL `final=STOPPED/FAILED log=["0:FAILED"]`.
  - The log reason says the cap was full "for more than 3 days". It wasn't.
- Same mechanism for `in_flight`: after an old in-flight wait, every later in-flight wait goes straight to the FAILED path (counted), which leads to STOPPED after 5.
- The "one audit line per episode" claim is really "one per (version, step, kind) per enrollment lifetime". A second real episode writes no `step_wait` line.

**Fix:**
- Delete `stats.waits` keys `v<ver>:<idx>:*` whenever the step takes a non-wait outcome (sent / failed / skipped / advance), in the same tx, and on `resume`.
- Or store `{since, last}` and start a new episode when `now - last` exceeds the expected re-check gap (cap ≈ 26 h, in_flight ≈ lease + 5 min).

### D2-S3 — Webhook Message-ID fallback hardening
**Where:** `emails.ts` 3024-3034 and 3064-3071.
- **(a) Back-fill happens before the type filter.** Any Svix-signed event type with a `message_id` back-fills `providerId`.
  - **RV-W1 RED.** An `email.received`-shaped event (inbound mail whose sender copied our Message-ID) answers `ignored_type`, but `providerId` is now the inbound id. The genuine `email.complained` that follows is `unknown_email`, so the opt-out is lost.
  - This only matters if the Resend account's webhook also delivers receiving events to this route. That is operator config and unknown.
  - Fix: run the fallback and back-fill only for `email.sent|delivered|bounced|complained`.
- **(b) The fallback matches ANY `direction='OUT'` row without providerId**, including BCC-capture rows written by `ingestInbound` (`emails.ts` ≈2162, 2263-2287: OUT, providerId NULL, routing NULL, messageId `<otherSystem>:<our rfc>`).
  - **RV-W2 RED.** Shop B holds a capture row of shop A's mail (same human, two shops), and A's row is gone (erasure or system deletion). A complaint about A's mail opts out **B's contact** (cross-tenant consent write).
  - The same capture rows also cause the 2-hit ambiguity that silently disables F2 for A.
  - Fix: add `AND "routing" ? 'fromAddr'` (only rows written by `sendCore`) to `outRowWithoutProviderId`.

## NOTES
- **N1 · pre-existing class · duplicate mail after Resend's 24 h key retention** (documented: "kept for 24 hours").
  - Any redelivery more than 24 h after an accepted-but-lost attempt sends a second copy: outage path up to 72 h, cap wait up to 72 h, in_flight 24 h+.
  - Cheap mitigation enabled by F2: Resend fires `email.sent` on acceptance, so the fallback back-fills `providerId` on the FAILED row. In the redelivery path, `prior.providerId != null` should mean "accepted": finalize SENT with that id and make no provider call.
  - Alternatively, refuse redelivery under a key older than about 23 h (`prior.createdAt`) and skip with a reason.
- **N2 · pre-existing · indexes.** `providerId` has no index (`prisma/schema/crm.prisma` CrmEmailMessage). Every webhook is a seq scan, and the F2 `lower(right("messageId", n))` fallback is a second one.
  - QC3 holds only 4 CrmEmailMessage rows: seq scan, 0.05 ms (RV-X). That is not representative.
  - Extrapolation: linear in table size. On the order of 0.1–1 s per webhook at around 1M rows, with heap pages carrying inline bodyHtml.
  - The fallback runs only on misses whose id ends `@shark.in.th`. Svix-signed, so not attacker-triggerable, and no DoS beyond the pre-existing lookup.
  - Add `@@index([providerId])` in C6.1 (needs a migration, so not in this card).
- **N3 · new.** A redelivery re-uses the first `fromAddr` even if that domain has since been unverified. Resend then answers 403, which is classified as a shop-wide outage: an owner notice and 72 h of retries. Low.
- **N4 · new · acceptable.** Deterministic tokens: anyone holding `SESSION_SECRET` plus an emailId can mint open/click/unsubscribe tokens. Previously only a DB-hash reader could check them, and nobody could mint them.
  - This is the same trust class as `private-file:v1:`, `member-card:`, `portal-ip:v1:`, `crm-ip:v1:` and `portal-line-nonce:v1:`. All are labelled HMACs over `SESSION_SECRET`, and the house pattern is followed.
  - Token audit, all fine:
    - `emailId` and index are inside the MAC, so the token cannot be moved to another mail or tenant. F1d proves this, with a positive control.
    - The click URL comes from stored `routing.links`, so there is no open redirect.
    - Only hashes are stored, and tokens are not logged (rate-limit keys hash them).
    - Comparisons are equality on the sha256 of the input (DB / `===`), so there is no useful timing oracle.
    - An unsubscribe token is per message and opts out only that row's contact.
- **N5 · residual 5 (SESSION_SECRET missing).** No production path is affected.
  - `@/lib/env` (zod `SESSION_SECRET: min(32)`) is parsed by `@/lib/core/email` before any real send. A process without it already could not send.
  - Only harnesses with an injected transport hit the new throw (probe-c54d, which needs `with-qc3-secret.sh`).
  - What users see:
    - Staff UI: `failOf` shows the Thai message naming SESSION_SECRET.
    - Sequence: step FAILED ×5, then STOPPED FAILED.
    - Automation SEND_EMAIL: consumer error.
- **N6 · assumption.** The Resend webhook payload documents a `data.message_id` field (bounced example). That it equals our custom `Message-ID` header is assumed, not documented. If Resend rewrote it, F2 would be inert but harmless. Inbound threading already relies on the same assumption.
- **N7 · probe-cd2 quality.** No check is vacuous. F1a/F1b really force accepted-lost → pre-key failure → redelivery and compare the bodies byte for byte.
  - Gaps: the stub has no 24 h key expiry, no `concurrent_idempotent_requests`, and no non-reproducible bodies (D2-S1). There is no negative for unhandled types or capture rows (D2-S3), and no episode reset (D2-S2).
  - F3a models a provider that stores error answers. Resend docs do not say error answers are stored, so this is modelled both ways, which is fine.
- **F6 checks out in code, and F6b covers the portal wake.**
  - RECIPIENT_CHANGED: both sides go through `bareEmail` (trim + lowercase, idempotent), so case and whitespace are handled. IDN is not normalised, but both sides use the same function and the address regex is ASCII.
  - The row stays FAILED with its old providerError. Cosmetic.
  - Portal `wakeOutbox` runs only after the awaited write returns; refused or throttled writes throw first.
    - It needs a valid portal session.
    - Writes are DB-rate-limited (`portal.ts:467`).
    - It coalesces per instance (15 s, `core/after-drain.ts`).
    - It is no new DoS vector.
- **Item 7.**
  - v1: `sendCore` asserts v2 first (F1f), and F2 touches only CrmEmailMessage rows, which only v2 writes.
  - No schema change: `git diff 288cca97 81209310 -- prisma` is empty.
  - The facade export `wakeOutbox` sits in the CRM C5.4 block and adds no new import cycle (outbox-consumers is lazy).
  - `CRM_EMAIL_DELIVERY_UNCONFIRMED` is kept only for legacy rows. Those exist only in WIP builds, never on prod.

## ORACLE-EDIT (supported) — `scripts/pending/c54d/probe-c54d-r3.mts` R2S2a
The check pinned an implementation marker of the removed R2-S2 path. Its intent (one mail, row SENT, the held mail's links resolve) is kept and made stronger.

Line 198, the description becomes:
`"attempt 1 accepted but its answer lost, byte-identical redelivery ⇒ provider replays its first answer ⇒ exactly ONE mail accepted, row SENT with THAT mail's provider id (no 'unconfirmed' marker), and the open/click/unsubscribe links of THAT mail resolve"`

Line 199: replace `/UNCONFIRMED/i.test(String(row?.providerError ?? ""))` with `!row?.providerError && row?.providerId === accepted[0]?.id`.

Add above it: `// ORACLE-EDIT C5.4-D2 (review · R2-S2 409 path removed by F1): SENT with the replayed provider id replaces the DELIVERY_UNCONFIRMED marker`

## Progress (checkpoints)
- [ckpt 1] notes, diff, code read · reruns started.
- [ckpt 2] review probe 2/7 (5 RED proven) · r2 13/13 · r3 18/19 (R2S2a by design) · cd2 19/19.
- [ckpt 3 · done] suites c2.2 73/73 · c2.5 105/105. Review probe logs are copied next to the other run logs in /tmp/cd2-review-logs/ (not committed).

---

## Round 2 — re-review of `git diff ac51650d 1d9229fc` (read-only · 1 Oct 2026)

VERDICT: MERGEABLE. D2-S1, D2-S2 and D2-S3 are closed, and N1 and N3 are addressed. R2-N1 through R2-N4 below are NOTES; none blocks.

### Reruns (QC3 · logs `/tmp/cd2-review-logs/r2/`)
- Review probe: **8/8**. That is the 7 original checks, all green (RED 2/7 in round 1), plus new **RV-W3**.
- probe-cd2: **28/28**
- probe-c54d-r3: **19/19**. The ORACLE-EDIT in the commit matches my round-1 text byte for byte: description, assertion and the `// ORACLE-EDIT C5.4-D2 …` comment.
- qc-crm-c2.2: **73/73** · qc-crm-c2.5: **105/105**

### Checks
**S1 (a) — claim race with the webhook: no lost providerId.**
- The claim does **not** write `providerId: null`. It *requires* it: `where {id, status: FAILED, providerId: null}`, and the data is status, providerError and lease only.
- Webhook back-fills between the `prior` read and the claim: the claim CAS fails, sendCore returns the old FAILED/reused result, and that is counted once. The next run takes the N1 branch (`prior.providerId` is set), which goes to `finalizeSent` with no call.
- Webhook back-fills after the claim (row QUEUED): it sets `providerId IS NULL → id1`. The redelivery within 24 h replays id1 and finalizes with the same id. If the redelivery fails, the row is FAILED with id1, and the next run takes the N1 path.
- Hashes are written only by `finalizeSent` with `hashes` from a provider 200. The N1 path passes `null`, so hashes are untouched.
- RV-T1 green: the held mail's unsubscribe link works.

**S1 (b)/(c) — fingerprint stability.**
- `requestFingerprint` is sha256 of `JSON.stringify` over the `outgoingRequest` literal. It has a fixed key order and no dates, random values or MIME boundary; those are built by Resend.
- The first send and the redelivery build it from identical stored values: to/cc/bcc/subject/messageId from the row, plus `rt`, `base`, `trk`, `fromAddr`/`fromName` and `bodyHtml`. F1a, R2S2a and RV-T2 replay 200, which proves equality within one build.
- Across deploys, the fp changes only if the code changes `composeOutgoing`, `htmlToText`, `outgoingRequest` or the `RichEmail` fields. In that case the provider body really would differ (409), so the refusal is correct and not a false positive.
- Residual gap (R2-N1): the fp covers the *inputs* of `sendEmailRich`, not its serialized JSON body.

**S2 — closed.** `clearWaits` runs in the advance tx, in the failure tx (except the in-flight ceiling, which is still the same stuck mail) and in `resume`. RV-F4 green.

**S3 — closed.**
- The fallback runs only for sent/delivered/bounced/complained events (RV-W1 green), requires `jsonb_exists(routing,'fromAddr')`, matches exactly one row, and requires event `from` to equal the row sender.
- **RV-W3 (new, green):** both shops use the same sender and the event `from` is equal. B's BCC-capture row is still never matched (`unknown_email`).
  - The tenant separation comes from the routing filter, not from `from`.
  - Only `sendCore` (`emails.ts:1405`) and `ingestInbound` (`:2448`) create CrmEmailMessage rows, and ingest never writes `routing.fromAddr`.
- **Can shop B create a row whose Message-ID equals A's? No.**
  - Send-path rfcIds are either `ik-`/`sk-` + sha256(`<own systemId>:<key>`)[:40] (bound to B's systemId) or random 96-bit hex.
  - The `messageId` column is `<systemId>:<rfc>`, and capture rows are excluded.
  - Shops without a verified domain also do not share one sender: the platform sender is `<tenant slug>@shark.in.th`.

**N1 — the 24 h refusal applies only to `amb` rows. Classification is sound and conservative.**
- `amb` covers TRANSPORT_ERROR (any fetch throw, including client abort or timeout after acceptance), 5xx, 409 (both `invalid_idempotent_request` and `concurrent_idempotent_requests`), and sweeper-closed QUEUED rows. The last case covers a function killed mid-request.
- The flag is sticky and never cleared. The window is measured from `prior.createdAt` (first attempt), which is ≤ the real key age, so it is conservative.
- 400/401/403/404/405/422/429 are rejections. For 429, Resend's rate/quota errors are answered before sending; I found no doc saying a 429 request may be sent, but "never accepted" is the standard reading and not explicitly documented.
- Pre-network codes (NO_RECIPIENT, INVALID_HEADER) are marked `amb` although they never reached Resend. This is harmless: the sequence treats them as permanent and advances.
- **Clock gap (R2-N2).** `sendCore` uses wall-clock time, and probes simulate time through `runDue(at)`.
  - The builder's R2-N1b/N1c backdate `createdAt`, so they test the real rule.
  - c54d-r3 R2S3a/b use definite codes only, so they now pass for the right reason.
  - **Not covered anywhere:** the mixed real-clock path, where an outage contains one 5xx. Once a 5xx makes the row `amb`, an outage running past 24 h ends in REDELIVERY_EXPIRED (step SKIPPED) instead of the 72 h STOP. That is the intended trade (the mail may have been accepted), but no probe exercises it.
  - F5, the outage notice once per Thai day, keys on wall-clock time and passes because everything runs within one real day. This was already so before the card.

**N3** — `FROM_DOMAIN_UNVERIFIED`: no call and no outage notice (R2-N3 green). It is checked after the N1 and expiry branches, so a webhook-confirmed mail still finalizes SENT.

### NOTES (round 2)
- **R2-N1 · new · low.** Fingerprint the serialized provider body, or the `sendEmailRich` output, instead of its input object. A deploy that changes `sendEmailRich` serialization alone would otherwise pass the fp check and get a 409. That 409 is marked `amb`, so it ends counted and STOPPED, never duplicated.
- **R2-N2 · new.** The mixed outage + 5xx real-clock path is unprobed (see N1 above).
- **R2-N3 · new · owner-visible.** `crmEmailFailText` has no text for NOT_REPRODUCIBLE / REDELIVERY_EXPIRED / FROM_DOMAIN_UNVERIFIED. The email thread shows the generic "send failed — press send again" for mails that *may already have reached the customer*, which invites the manual duplicate N1 avoids.
  - The shop is told only through the enrollment step log (SKIPPED with a Thai reason) and the audit line. The ops WARN (NOT_REPRODUCIBLE only) is visible to platform admins only.
  - Add three texts, e.g. "อาจถึงลูกค้าแล้ว — ตรวจกับลูกค้าก่อนส่งใหม่". This can go to the C6.1 UX batch.
- **R2-N4 · C6.1 list unchanged and confirmed.**
  - SESSION_SECRET parity across Vercel and the VPS. A mismatch now degrades safely: NOT_REPRODUCIBLE, step skipped, no duplicate, no dead links.
  - APP_URL is now stored per row (`routing.base`).
  - The `providerId` index and a stored, indexed rfc column (needs a migration).
  - Verify the Resend `data.message_id`/`data.from` assumption with one real send.

- [r2 ckpt] reviewed, reruns green, RV-W3 added (`scripts/pending/cd2/review/probe-cd2-review.mts`).
