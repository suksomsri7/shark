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

---

# Round 2 — re-review of 1d118384 (parent 19d13470)
Scope: `git diff 19d13470 1d118384`, builder note "Round 2". Ran on QC3 with iso.sh + gate lock, one job at a time; finished 2026-10-02 01:45 UTC. New probe: `scripts/pending/cf11/review/probe-cf11-review-r2.mts`. Runner summary: `scripts/pending/cf11/review/review-rv3.summary`.

## What I ran
| run | result |
|---|---|
| builder `probe-cf11-keys` · `contains` · `mail` · `r2` | 14/14 · 12/12 · 24/24 · 16/16 |
| `probe-cf11-review-mail` | 11/12. RA.1 ✅ (100/150) · RA.3 ✅ (100/120) · RB.1 ✅ (0.0 M chars before the drop; was 21.6 M) · RC.1 ✅ (+1 notice for 12 senders) · RA.2 ❌ **accepted as by design** (30 mails from one CC participant is under the 100/h proven per-address bound) |
| `probe-cf11-review-keys` | 8/9. RK.6 ❌ = RV-4 (kanban revoke, shark-hf 201d371a) · INFO-RK.4/RK.5 now "not here" (RV-5 / Q2 closed) |
| `probe-cf11-review-r2` (new) | 6/8. **R2A.1 ❌ · R2B.1 ❌** · R2C.1 ✅ |
| fitness (QC3 env) · (no env) | 42/42 · 42/42 |
| `pnpm typecheck` (5 GB heap) | exit 0 |

## Round-1 findings
- **RV-1: closed.** The pre-bucket query is now `findMany({ tenantId, systemId, direction: "OUT", messageId in candidates(≤100 refs) }, select toAddrs/ccAddrs, take 50)` (`emails.ts:2454-2458`). That is ≤ 200 bind params on the unique `messageId` index, with no body columns. The full `parent` is read with the base `findFirst` after both buckets (`:2467-2471`), so it is 1 row per accepted mail, as at base. RB.1 measured 0.0 M chars.
- **RV-2: partly closed.** Every class now has a bound (RA.1/RA.3 green). But the shared proven system bucket brings in **RV-6** below.
- **RV-3: closed.** `ownerNoticeDue` (`emails.ts:2360-2363`) uses a separate 1/h bucket per system per class and is consumed only on a sender's first trip (`count === limit + 1`). It fails open (notifies) on a DB error, which is acceptable. RC.1: 12 senders → 1 notice; audits are still written per sender.
- **RV-5 / Q2: closed.** `accountManagedKey` (`account/connections.ts:395-405`) is used for rotate, revoke and the list (page filter `connections/page.tsx:82` uses the same rule).
  - Malformed scopesJson on an account-bound key: still listed (`listApiKeys` parses it to `[]`, and `[].every` = true), revocable, rotation refused with the shark-hf sentence.
  - Keys that disappear from this page (pre-S1 account-bound keys with mixed scopes, unbound pre-A2 account keys, the general key) are still listed and revocable on `/app/settings/api` (`page.tsx:20` lists every key of the shop). There is no rotate there, so the owner revokes and recreates them (INFO).
  - Messages: shark-hf has no account-page door (`accountManagedKey` is session/crm only), so there is no conflicting text. The malformed-rotation text is identical.
- **RV-4: unchanged.** It ships with shark-hf 201d371a.

## New findings

### RV-6 · HIGH (blocker) · H3-1 reborn at system level: the shared proven system bucket (2,000/h) can be filled by attacker-proven mail and then drops every customer's genuine reply
- `emails.ts:2463-2464` + `inboundSystemLimited(…, proven)` (`:2344`). DMARC-proven mail and thread-proven mail share the key `crm.email.in.sys.proven.<sys>`, and that bucket is the only one any genuine customer reply passes through.
- The per-sender proven key is the raw From (`:2320-2323`, R2B.1). `x+0@` with a full bucket → dropped, while `x+1@` on the same mailbox → stored. So one mailbox gives unlimited distinct proven senders.
- **Repro R2A.1, attacker-only steps, P14 set.** One mailbox on the attacker's own DMARC-passing domain sent 20 plus-variants × 100 = 2,000/2,000 stored in 273 s, filling the proven system bucket. Then the customer's reply to our mail from the address we wrote to, with DMARC pass for her own domain (the strongest evidence the system has), was **dropped** (`rate_limited`). A thread-only reply was dropped too. Owner notifications rose by 1 (the proven-system notice text says "should not normally happen"). The customer gets no bounce; the provider got 200.
  - Meanwhile an unproven stranger's mail was **stored** (INFO-R2A.2): a forger is better off than a verified customer for the rest of the hour.
  - At base 53d88b71 proven mail had no system bucket at all, so this kill switch is new.
- **With P14 unset** (today) only thread proof exists. Pairs an outsider can obtain = every visible To/Cc address on each of our mails they received or were forwarded (BCC does not prove, R2C.1). Filling 2,000/h needs ≥ 20 such addresses at 100/h each: rare from one mail (most CRM mails have 1–3 recipients), but a single past recipient of one mail with ≥ 20 visible recipients, or a holder of several group threads, can do it. **With P14 set** the attack is trivial (any own DMARC domain, or `+tag` variants on a DMARC-passing free-mail domain).
- **Recommendation (concrete).** Split the proven class by strength of evidence, so that a cheaper proof can never drop a stronger one, and normalise the sender key:

  | class | evidence | per sender (key = lower-case mailbox, `+tag` stripped) | extra | per system |
  |---|---|---|---|---|
  | V verified reply | `fromProof ∧ threadProofAny` | 100/h | — | 2,000/h (own key) |
  | D DMARC only | `fromProof ∧ ¬thread` | 100/h | per From-domain 300/h for domains not in `FREE_MAIL_DOMAINS` | 1,000/h |
  | T thread only (forgeable) | `threadProofAny ∧ ¬fromProof` | 100/h | per referenced OUT Message-ID 100/h (all From citing it share it) | 1,000/h |
  | U unproven | neither | 100/h (unchanged key) | — | 1,000/h (unchanged) |

  - With this split, a D/T/U flood cannot touch V. Filling V needs ≥ 20 real DMARC-passing mailboxes that were To/Cc on our mails.
  - With P14 unset (V and D empty), filling T needs ≥ 10 distinct OUT mails held as a visible recipient, because of the per-message bucket. One CC'd mail with 20 addresses gives at most 100/h total.
  - Owner notice per class as now, with V's text "genuine replies are being dropped". Cost: 1–2 extra bucket upserts per mail; the keys stay hashed.
  - Minimum acceptable alternative if the controller wants a smaller change: own key for V + normalised (`+tag`-stripped) sender key. Then D/T floods cannot drop verified replies, and the T-only kill switch stays as today (needs ≥ 20 visible pairs).
- If the controller rules that P14 stays unset until a follow-up card, this can be carried as MED with "do not set `CRM_INBOUND_AUTHSERV_ID` before the split", added to the P14 guarantees in the builder note. As written, the P14 section omits this.

### RV-7 · LOW · cost at the caps is bounded by count, not bytes
- At the caps a system accepts up to 3,000 mails/h (2,000 proven + 1,000 unproven; was 1,000 + unbounded at round 1 and 1,000 + unbounded-at-system at base). Each accepted mail costs:
  - a row of ≤ 1 M + 1 M chars (≈ 2 MB ASCII, up to ≈ 6 MB Thai)
  - one linear sanitise of ≤ 1 MB
  - an EMAIL activity, if a contact matches
  - a `crm.email.received` event (→ webhooks/automation)
  - one copy-in outbound send (when copyMode IN/BOTH)
  - attachments
- Sustained that is ≈ 6 GB/h of stored bodies and 3,000 outbound copies/h per system. This is acceptable as a hard ceiling against unbounded, but consider a per-system daily byte budget and counting copy-in sends against the shop's outbound quota. Not blocking (same class as fix2's accepted 1,000/h).

### INFO (round 2)
- R2C.1 ✅, narrow proof query correctness:
  - "Addressed to this exact From" uses `bareEmail` on both sides. Outgoing `toAddrs`/`ccAddrs` are stored by `cleanAddrList` → `bareEmail` (lower-case, angle form stripped), and the inbound From goes through the same function. So `"Buyer" <BUYER@DOM>` proves.
  - Plus-address variants and BCC recipients do not prove (conservative and correct; `bccAddrs` is not read).
  - `toAddrs`/`ccAddrs` are `String[]`, so there is no JSON-shape issue.
  - Our id as the newest of 150 junk refs proves. Our id placed 2nd-oldest behind a junk In-Reply-To does not (INFO-R2C.2: window = In-Reply-To + newest 99 refs). Real clients put our id in In-Reply-To.
  - The query has no `orderBy`; with `take 50` and `some()` that is harmless, because only ≤ 50 matching OUT rows exist among ≤ 200 candidates in practice.
- Class choice by the attacker:
  - A proven sender can also send unproven forms of the same address (100 + 100/h), which is bounded and harmless.
  - An unproven forger cannot enter the proven class, and forged unproven mail cannot touch the proven buckets (H3-1 per-customer stays fixed; builder R2.1 and hunt S1.x green).
- Probes: probe-hunt3 S1.5 and probe-cf2-review-r2 Q3 are red by design (they assert the pre-H3-1 behaviour). I accept the builder's reasoning; I did not re-run them.

## Round 2 not verified
- I ran no base-tree run of `probe-cf11-review-r2`; the base comparison for R2A is from code (base had no proven system bucket).
- QC2-pinned cf5 probes and the account REST suites: not re-run (the builder reports them green in v3).
- No browser render of the narrowed connections page.
- Attachment and link-fetch cost under a proven flood.

VERDICT: NOT MERGEABLE (RV-6 shared proven system bucket lets attacker-proven mail drop every customer's verified reply — split the proven class by evidence strength and normalise the sender key; RV-4 must ship with shark-hf 201d371a)
