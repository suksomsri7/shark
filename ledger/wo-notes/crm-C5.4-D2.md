# C5.4-D2 — e-mail redelivery follow-ups (review F1–F6 of batch D) · builder · Opus 5.5 · 1 Oct 2026

Worktree `/root/projects/shark-crm-cd2` (detached 288cca97) · QC3 only (`bash scripts/qc3.sh …`) · logs `/tmp/cd2-logs/runN/`.
`scripts/{crm,member}-expected.json` = QC3 seed ids, modified in tree, NEVER commit.

## Design (decided)
- F1: open/click/unsubscribe tokens = `<emailId>~HMAC_SHA256("crm-email-token:v1:" + SESSION_SECRET, "<emailId>|<purpose>|<i>")` base64url[0..32]
  (no fallback key — missing SESSION_SECRET throws like private-links/member-card). Same row ⇒ same tokens every attempt.
  Redelivery re-uses the FIRST attempt's routing (fromAddr/fromName/replyTo) + tracking flags (`routing.trk` written at create) ⇒ byte-identical
  provider request ⇒ Resend replays the original 200 **with its id** (or the stored error). The 409⇒SENT-unconfirmed path and the
  prev-hash juggling are REMOVED: a 409 on a redelivery is now an ordinary transient failure (retry/backoff, counted). Old random tokens
  keep resolving (lookup is by stored hash).
- F2: webhook miss on `providerId` ⇒ fallback by `data.message_id` (RFC Message-ID = our `<rfcId>`; only `@shark.in.th` ids) to an OUT row
  whose providerId IS NULL; providerId back-filled by CAS (`providerId: null`). Delivered via fallback only flips SENT rows. Dedupe = svix-id unique (unchanged).
- F3: falls out of F1 (identical body ⇒ provider answer for that key, never a 409 inference). Probe models a provider that stores errors.
- F4: wait episodes keyed `stats.waits["v<ver>:<idx>:<kind>"] = since` (kind cap|in_flight); first wait of an episode ⇒ one audit
  `crm.sequence.step_wait`. Ceilings: in_flight ≥ 24 h ⇒ normal transient FAILED path (log FAILED, counted, ≤5 ⇒ STOPPED FAILED);
  cap ≥ 72 h (= outage ceiling) ⇒ STOPPED FAILED + log + finished + audit in one tx.
- F5: E3 `noticeEmailOutage` already does it ⇒ probe only.
- F6: R2-N1a redelivery when the stored recipient ≠ current recipient ⇒ no send, failCode RECIPIENT_CHANGED ⇒ step SKIPPED with reason.
  N5 portal actions wake (CRM-only); rest of N5 / N6 / N7 ⇒ C6.1 candidates.

## Progress
- [start] notes read; design above. Next: probe `scripts/pending/cd2/probe-cd2.mts` → RED on untouched tree.
- [run1 RED] src untouched (288cca97): /tmp/cd2-logs/run1/probe-cd2-RED.log 5/19 — red F1a F1b F1c F1e F2a F2b F2c F3a F3b F4a F4b F4c F6a F6b · green pins F1d F1f F2d F5 CLEAN (F5 = E3 proven). Probe fix after RED: F4a/F4b count provider calls by the probe contact's address (RED F4a showed calls=2 from another ACTIVE enrollment in the tenant).
- [code] emails.ts: newToken HMAC (label crm-email-token:v1:) · routing.trk · redelivery reuses first routing/trk, RECIPIENT_CHANGED (no call) · deliver: 409⇒SENT path + Redelivery type removed · webhook fallback outRowWithoutProviderId (message_id) + providerId back-fill + delivered-only-SENT for fallback rows · sequences.ts: waitKind, F4 ceilings + step_wait audit, RECIPIENT_CHANGED ⇒ skipped · index.ts facade `wakeOutbox` (CRM C5.4 block) · app/b actions wake after 4 writes.
- [resumed ~06:50 UTC] previous builder killed by container restart. Found: src edits (emails/sequences/index/app-b actions) + probe on disk, uncommitted; /tmp/cd2-logs/run1 = RED only; run2/typecheck.log = src clean, 2 TS errors only in probe-cd2.mts:465 (`.ok` on `{}`); no GREEN run yet; no cd2 systemd unit running. Next: safety commit → fix probe TS → GREEN run3.
- [run3 GREEN] probe TS fix only (`bad/good: Any`, no check changed) · /tmp/cd2-logs/run3/probe-cd2.log **19/19** (RED run1 5/19 → GREEN 19/19) · CLEAN 0 rows. Next: regression run4 (scripts/pending/cd2/run-regress.sh).
