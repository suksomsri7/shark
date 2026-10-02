# crm-C5.5-fix8 — independent review

Tree `wip/crm-cf11` @ 3ffb9026 (base 53d88b71) · worktree `/root/projects/shark-crm-c54e` · DB QC3 only · finished 2026-10-01 23:59 UTC.
Review probes: `scripts/pending/cf11/review/probe-cf11-review-mail.mts`, `probe-cf11-review-keys.mts` (checks assert the SAFE behaviour ⇒ ❌ = finding reproduces) · runner summary `scripts/pending/cf11/review/review-rv2.summary`.

## What I ran (iso.sh + gate lock, one at a time)
| run | result |
|---|---|
| builder `probe-cf11-keys` · `probe-cf11-contains` · `probe-cf11-mail` (QC3) | 14/14 · 12/12 · 24/24 |
| `probe-cf11-review-keys` (QC3) | 8/9 — RK.6 red (kanban revoke, known gap) |
| `probe-cf11-review-mail` (QC3) | 7/12 — RA.1 RA.2 RA.3 RB.1 RC.1 red |
| fitness (QC3 env) · fitness (no env) | 42/42 · 42/42 (F15.3/F15.4/F15.5 green) |
| `pnpm typecheck` (5 GB heap) | exit 0 |

## Findings

### RV-1 · HIGH (blocker) · reference lookup loads up to 50 full rows before the rate buckets
- `src/lib/modules/crm/emails.ts:2434-2438`: `findMany({ where: { systemId, messageId: { in: candidates } }, orderBy, take: 50 })` has **no `select`**. It runs for every mail with In-Reply-To/References, before `inboundSenderLimited`/`inboundSystemLimited` (`:2449-2452`). That includes unproven flood mail that is then dropped. Each row carries `bodyHtml` + `bodyText` (each up to 1 000 000 chars; RB.0 shows that an unproven stranger's mail stores 999 007 + 999 000 chars) + `attachments`/`routing` JSON. Base used `findFirst`, so it loaded 1 row.
- The attacker controls the referenced set. They first store up to 50 large mails of their own (unproven mail is accepted up to the system cap of 1 000/h). The candidate list includes the system-scoped form of every ref, so citing their own RFC ids matches those rows. After that, every further mail can cite all 50, and each one costs about 50 × 2 M chars of DB read, transfer and JS heap **even when the bucket drops it**.
- Repro RB.1: a dropped unproven mail citing 50 stored mails loaded ≈21.6 M chars of row JSON in 342 ms. The same mail citing 1 row loaded 0.40 M chars in 40 ms. Only 1 of the 50 rows was full size (to keep QC small); at full size it is ≈100 M chars per request. A few concurrent requests are enough to exhaust a 1–2 GB serverless function.
- Fix: keep `parent` as before (`findFirst`), and make the proof query narrow and selective, e.g. `findFirst({ where: { systemId, messageId: { in: candidates }, direction: "OUT", OR: [{ toAddrs: { has: fromAddr } }, { ccAddrs: { has: fromAddr } }] }, select: { id: true } })`. Alternatively use `findMany(… select: { id, direction, toAddrs, ccAddrs })` and load the full parent by id. Also consider capping `refs` to the newest ~100 ids. Today the candidate list is up to ≈2 × (32 KiB / 3 chars) ≈ 20 k bind params per mail, the same as base for random-From floods — INFO.

### RV-2 · HIGH (blocker) · proven mail is exempt from BOTH buckets with no bound at all
- `emails.ts:2447-2452`: `if (!fromProof && !anyThreadProof) { sender bucket; system bucket }`. Proven mail is neither counted nor capped anywhere.
- **Thread proof**, i.e. From ∈ to/cc of any referenced OUT row. This is bound correctly to the exact address, but it is held by every recipient and CC of any mail the shop sent, and by anyone they forward it to. RA.1: with both buckets already full, 150/150 thread-proven mails were stored. Each one added: a CRM row, an EMAIL activity, a `crm.email.received` outbox event (→ webhooks / automation rules), and a **copy-in outbound send** (150 outbound mails to the shop's copy mailbox through the shop's transport). Attachments are not exercised, but the code path is the same. RA.2: a CC participant (not a contact) got 30/30 stored. At base, each such address was held to 100/h by the per-sender bucket.
- **DMARC proof** (`fromProof`, once `CRM_INBOUND_AUTHSERV_ID` is set). It proves the From is not forged; it does not prove the sender is benign. Any Gmail user or any owner of a DMARC-enabled domain has it. RA.3: one attacker-owned address with both buckets full got 120/120 stored; base (per-sender bucket counted all mail) stored 0. Rotating local parts on a DMARC domain was already unbounded at base for the system bucket (RV2-3 ruling). This card removes the remaining per-address bound.
- "Customer replied" notices are deduped: +1 owner notification for 150 mails (RA.1). That is not a cost bound.
- Suggested bound, which keeps H3-1 fixed: give proven mail **its own** per-sender bucket under a separate key, e.g. `crm.email.in.from.proven.<sys>.<hash>` at ~300/h. Forged unproven mail cannot fill it, so a genuine customer's reply is never dropped by a forger. Optionally add a high system-wide proven bucket (e.g. 10 000/h) that notifies the owner when it trips. This was the hunt's own alternative ("key it on (From, proven?) with a separate high cap for proven mail", hunt-3 H3-1 Fix).

### RV-3 · MED · owner-notice spam: one AppNotification per forged sender that trips its bucket
- `emails.ts:2321-2328` (`inboundSenderLimited` → `notifyOwnersInboundCap`). There is no dedupe across senders. The sender bucket is counted before the system bucket, so trips still happen while the system bucket is full.
- RC.1: 12 forged senders × 101 unproven mails gave +12 owner notices. That is about 1 notice per 101 junk mails per owner, unbounded (e.g. ~990/h per owner at 100 k mails/h). This drowns the one notice that matters, which is the purpose of H3-1's notice.
- Fix: dedupe with a per-system notice bucket (e.g. `checkRateLimitDb("crm.email.in.notice.<sys>", { limit: 1, windowMs: 1h })`). Alternatively, notify only when the tripped address belongs to a known contact or staff member (the impersonation case H3-1 is about) and write only the audit otherwise.

### RV-4 · MED (pre-existing, confirmed, not this card's scope) · kanban key page revokes any key of the shop
- `src/lib/modules/kanban/settings-actions.ts:97-103`. RK.6: the kanban page revoked a CRM-bound key → `{ok:true}`, revoked. A board admin with `api.key.revoke` can kill the owner's CRM, account or member integrations.
- Fixed on `/root/projects/shark-hf` 201d371a (`findFirst({ id, tenantId, systemId })`, "ไม่พบคีย์นี้ในระบบบอร์ดงานนี้ …"). It must ship together with or before this branch's key work. It is not ported here, as the card says.

### RV-5 · LOW · account page: revoke accepts what rotation refuses
- `src/lib/modules/account/connections.ts:391-399`. For unbound keys, `accountManagedKey` excludes only `crm|member|kanban.*`. INFO-RK.4: an unbound key `["account.doc.view","pos.sale.create"]` cannot be rotated from the account page (F3 is correct), but it **is revoked** from there (`{ok:true}`). Revoke should use the same rule (all scopes ∈ ACCOUNT_SCOPE_KEYS, plus whatever Q2 decides for `[]`).

### INFO
- I1 (F2): form-shape variants are all refused (RK.1): upper-case scope, a bundle name passed as a scope, `*`, unknown bundle, `crm.admin` bundle, good+foreign scopes, CRM filter pseudo-scope. Duplicates and whitespace are collapsed to one stored scope (RK.2). `scope` + foreign `bundle` mints only the ticked account scope, because the bundle is ignored when scopes are ticked (`connections-actions.ts:108`) — harmless. The F3 malformed-scopes text and condition are identical to shark-hf `api-keys/service.ts:205-207`.
- I2 (F4): the kanban page is limited to the 3 bundles + `KANBAN_SCOPE_KEYS` (builder K3.1/K3.2 green). The mirror claims for the CRM and member doors were re-run green (builder K4.1).
- I3 (F5): `webhooks.test` returns 422 for registered non-`account.*` events. Clients that used the account REST to fire `crm.*`/`member.*` test events will now get 422, which is intended. `docs/api/ACCOUNT-API.md` is regenerated. The `shark-account-api` skill reference lists the op without an event list (no change needed).
- I4 (item 5): LIKE escaping verified on Postgres (RL.1). Literal `%`, `_`, `\` and a trailing `\` match only themselves. Case-insensitive stays case-insensitive and `likeContains` stays case-sensitive. Thai is fine. The empty term matches everything, identical to raw `contains ""`; whitespace is untouched by `likeEscape`, so behaviour is unchanged. Group-batch keys: an escaped prefix match is a subset of the old wildcard match that still contains the literal key, so legitimate keys behave identically. F15.4 false negatives: dynamic keys (`{ [op]: q }`), helpers outside account/** (e.g. `party/service.ts:260 searchByName`, used by kanban only), and raw SQL `ILIKE`. None of these reach account/** today (grep).
- I5 (item 6 / R2-1): the flag is display-only. All readers (`emailRoutingUnverified`, thread-list SQL, activities, 360, REST summaries) only show the badge; reply effects, sequence stop, lead creation and the event payload do not read `routing`. In environments without `CRM_INBOUND_AUTHSERV_ID` (or whose provider adds no A-R), **every** inbound mail now carries the badge. Contact-matched mail already did at base, so this is no functional regression, but it causes alarm fatigue until P14 is set; recommend setting it before CRM v2 inbound is shown. Byte identity of matched mail: builder M3.1–M3.4 re-run green (24/24). I did not make a separate capture at base.
- I6 (A-R controls, RD.1/RD.2 green): authserv unset ⇒ no proof (fail-closed). Two instances of our id ⇒ no proof, so an attacker-added header bearing our id cannot pass while our MTA adds its own. A case-variant duplicate header is joined ⇒ no proof. A From sub-domain against a parent `header.from` ⇒ no proof, and a lookalike ⇒ no proof (exact-domain alignment). Residual (config, pre-existing): if the inbound provider does not add its own A-R instance, a single attacker-supplied header with our authserv-id is trusted. Since fix8, that also means exemption from both buckets.

## Owner questions
- Q1: agree. Minting the general key (`[]`, unbound) should be OWNER-only (or a dedicated permission), not plain `api.key.create`. Ship hotfix/apiv1-scope and list existing general keys for review.
- Q2: agree that the account page should not manage the general key. Refuse both rotate and revoke of unbound `[]` keys there and manage them on `/app/settings/api` (add rotate there). Fix RV-5 in the same pass so revoke and rotate share one rule.

## Not verified
- Attachment storage and SSRF fetch cost under an exempt flood (code path read, not run). Real serverless memory behaviour (RB measured in-process on a fixed 21.6 MB set; the 100 M-char figure is extrapolated linearly).
- A base-tree run of my review probes (base behaviour for RA.3 is argued from code: the per-sender bucket counted all mail).
- Browser rendering. QC2-pinned cf5 probes and suites (I did not rerun them; the builder reports them green).

VERDICT: NOT MERGEABLE (RV-1 reference lookup loads up to 50 full rows before the buckets; RV-2 proven mail has no rate bound at all — fix both, and RV-3 owner-notice dedupe in the same pass)
