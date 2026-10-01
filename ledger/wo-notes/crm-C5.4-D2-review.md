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
