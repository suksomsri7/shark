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

---

# Round 3 — re-review of 3123f37e (parent ffe60684)
Scope: `git diff ffe60684 3123f37e` and the builder note "Round 3". Ran on QC3 with iso.sh + gate lock, one job at a time; finished 2026-10-02 03:44 UTC. New probe: `scripts/pending/cf11/review/probe-cf11-review-r3.mts`, which corrects the classifier (it reads which per-class system key `crm.email.in.sys.{v,d,t}.<sys>` / U `crm.email.in.sys.<sys>` moved). Runner summary: `scripts/pending/cf11/review/review-rv4.summary`.

## What I ran
| run | result |
|---|---|
| builder `probe-cf11-keys` · `contains` · `mail` · `r2 --skip=R2` · `r3` | 14/14 · 12/12 · 24/24 · 11/11 · 14/14 |
| `probe-cf11-review-r3` (new) | 8/10. **R3A.1 ❌ · R3B.1 ❌** · R3C.1 ✅ · INFO ×4 |
| `probe-cf11-review-mail` | 12/12 |
| `probe-cf11-review-keys` | 8/9 (RK.6 = RV-4, unchanged) |
| `probe-cf11-review-r2` | 7/8. R2A.1 ✅ |
| fitness (QC3 env) · (no env) | 42/42 · 42/42 |
| `pnpm typecheck` (5 GB heap) | exit 0 |

Obsolete probes of mine:
- `probe-cf11-review-r2` R2C.1 ❌ is **instrumentation only**: it reads the retired `.proven.` key. The same assertions pass in R3C.1 with the corrected classifier.
- R2B.1 is vacuous: it presets a retired key. Builder B.1 and my INFO-R3D cover it.
- `probe-cf11-review-mail` RA.2 passes only because RA.1 filled that OUT mail's T message bucket. The pass is valid, but RA.2 no longer isolates the CC path.

## Round-2 finding RV-6 — closed as specified
- The class is chosen once (`emails.ts:2497`) and each mail touches only its own class's keys (`inboundLimited` `:2336-2390`; R3C.1: T U U V D T, exactly one class each). D/T/U floods cannot touch V (builder F.2; my R2A.1 green: 100/2,000 stored, then the customer's V reply and a T reply were stored).
- The `+tag`/case-normalised sender key works (INFO-R3D).

## New findings

### RV-8 · HIGH (blocker) · class system buckets for V and T can be filled by an attacker who holds k provable pairs of its OWN mailboxes ⇒ every customer's reply in that class is dropped
- **Root cause.** Thread proof means "this From was a To/Cc of one of our OUT mails". An attacker obtains that for its **own** mailboxes simply by getting one mail from the shop per mailbox:
  - a staff reply to an enquiry;
  - a rule `crm.contact.created` → SEND_EMAIL / ENROLL_SEQUENCE on a lead from a public form where the attacker ticked consent (`sendAsSystem` needs granted consent, `consents.ts:371-383`, which a form ticks);
  - a sequence step;
  - being CC'd.
  
  That pair never expires. In my round-2 table I wrote "filling T needs ≥ 10 held mails" as if that were a high bar. It is not, because the attacker can be the recipient. The system-level caps then turn k pairs into a kill switch for every customer.
- **R3B.1 — reachable TODAY, P14 unset.** 10 attacker mailboxes on any domains, no DMARC needed, each holding one OUT mail of ours, sent 100 thread-only replies each: 1,000/1,000 stored, filling T's system bucket (1,000/h). The customer's genuine reply to **our** quote was then dropped (`rate_limited`). With P14 unset every genuine reply is class T, so **all customers' replies are dropped for the rest of the hour**, repeatable hourly with the same 10 pairs. The owner gets one class-T notice per hour; customers get no bounce.
  - Base 53d88b71 had no system bucket for thread-proven mail, so this is a regression, introduced in round 2 (the shared proven bucket) and kept in round 3 (T system bucket).
- **R3A.1 — P14 set.** 20 mailboxes on ONE attacker DMARC domain, each holding one OUT mail, sent 100 V mails each: 2,000/2,000 stored (V has no per-domain bucket), filling V's system bucket. The customer's DMARC+thread reply was then dropped. This class is the one the ruling says must never be starved.
- **Cost to the attacker:**
  - T: 10 answered enquiries or consented form leads, from 10 mailboxes on any domains (free mail works).
  - V: 20 mailboxes that pass DMARC, one own domain is enough. The `+tag` normalisation does not help because they are distinct local parts.
- **Recommended bound (concrete).** A **light-sender lane** for V and T:
  - **Lane rule:** a sender's first **10 mails per hour** (normalised sender key; the count already exists in the sender bucket) are counted in the class system bucket but **never dropped by it**. The system bucket drops only mail from senders already above 10/h.
  - **Unchanged buckets:** sender (100/h), T message (100/h) and the domain bucket still apply as now.
  - **Add** a **V per-domain bucket of 300/h** for non-free-mail domains, mirroring D, as defence in depth.
  - **Effect:** a genuine customer (≤ 10 replies/h) can no longer be starved by anyone. An attacker with k pairs gets at most `system cap + 10·k` mails per hour; k grows only by one shop-sent mail per mailbox, so volume stays tied to the shop's own outbound effort.
  - **Cost:** reuse the `count` returned by the sender bucket; no extra query.
  - Smaller alternative (weaker): do not let OUT mails sent by automation or a sequence (`sequenceStepId`/rule-sent; this needs a marker on rule sends) confer V/T. Staff replies would still be a pair source.
- **Launch gate.** This is **not** P14-only: R3B reproduces with P14 unset. So it blocks merge, not just the setting of `CRM_INBOUND_AUTHSERV_ID`.

### RV-9 · LOW · inbound free-mail list diverges from the module list
- `emails-shared.ts:156` `CRM_INBOUND_FREE_MAIL_DOMAINS` lacks `hotmail.co.th`, `msn.com`, `mac.com`, `aol.com` and `gmx.com`, which are in `companies-shared.ts:315` `FREE_MAIL_DOMAINS` (INFO-R3F). In particular `hotmail.co.th` — common in Thailand — gets a shared 300/h D domain bucket, so three such mailboxes can starve all D mail from Thai Hotmail users for the hour.
- Fix: reuse `FREE_MAIL_DOMAINS` (one list). Consider adding `outlook.co.th`, `live.co.th`, `yahoo.co.uk`, `qq.com`, `163.com`, `naver.com`, `yandex.com` and `mail.ru` there.

### INFO (round 3)
- **(b) Normalisation** (`emails-shared.ts:171`, INFO-R3D/R3D.2):
  - `+tag` and case are merged.
  - **Gmail dot variants are separate buckets** (`j.o.h.n@` vs `john@`, both stored in separate D sender buckets). One Gmail account therefore yields many D senders, and gmail.com has no domain bucket. This can fill D's 1,000/h, which starves only D mail (new authenticated enquiries, not replies); U is already starvable by anyone. Recommend dropping dots in the local part for gmail.com/googlemail.com.
  - `-` sub-addressing (Yahoo) is not merged (these are distinct mailboxes on Yahoo, so this is acceptable).
  - A leading `+` is kept.
  - IDN/punycode: `emailDomainOf` vs A-R `header.from` must match exactly, so a mixed form gives no D proof and no gain.
  - Stripping `+tag` merges `sales+a@corp` and `sales+b@corp`. This is the same mailbox by convention, so the merge is acceptable.
- **(c) T message key** = the lowest proving stored Message-ID. Spreading across subsets of cited ids needs several OUT mails addressed to that same From, and is capped first by the sender bucket (100/h). There is no gain beyond the sender cap.
- **(d) D per-domain 300/h** suits SME corporate customers (new non-reply mail from one company domain above 300/h is implausible). See RV-9 for the list.
- **(e) Count-then-drop.** Sender/domain/message buckets are incremented before a later step drops the mail (INFO-R3E: the victim's T sender bucket 1 → 2 on a dropped forged mail). A pair-holder (the victim, CC co-recipients, anyone forwarded the mail) can lock one customer's T sender bucket for the hour. Base let **anyone** do this via the all-mail sender bucket, so it is narrower now. With P14 set, the customer's own reply is V and unaffected. Accept as residual.
- **(f) Notices:** at most one per hour per system per class for V/D/T (`crm.email.in.notice.class-<c>.<sys>`). U is as in round 2. Audit on each bucket's first trip. No address in keys, audits or texts. Correct.
- The pre-bucket cost is unchanged from round 2: one narrow query plus 2–3 upserts. RB.1 green.
- RV-7 is recorded as C6 debt by the builder (≈ 5,000 mails/h per system at the caps). Accepted as LOW.
- P14 section: the deployment guarantees are as I asked. RV-8's T part applies regardless of P14.

## Round 3 not verified
- Reachability of the automation path end to end: a public form lead with consent → rule SEND_EMAIL → OUT row. I argued it from code (`automation.ts:325`, `emails.ts` `sendAsSystem`, `consents.canContact`). R3A/R3B insert the OUT rows directly, which is the same row shape the proof query reads.
- QC2-pinned cf5 probes and the account REST suites (the builder reports them green in v4).
- probe-hunt3.
- Browser render.

VERDICT: NOT MERGEABLE (RV-8 — V and T class system buckets can be filled by an attacker's own provable mailboxes (10 pairs for T with P14 unset, reproduced: every customer's reply dropped; 20 pairs for V with P14 set) — add the light-sender lane (first 10 mails/h per sender never dropped by the class system bucket) + V per-domain 300/h; RV-9 reuse FREE_MAIL_DOMAINS (LOW, same pass); RV-4 must ship with shark-hf 201d371a)

---

# Round 4 re-review — 3495091e (parent 59f5a400)
Scope: `git diff 59f5a400 3495091e` and the builder note "Round 4". Ran on QC3 with iso.sh + gate lock, one job at a time; finished 2026-10-02 06:30 UTC. New probe: `scripts/pending/cf11/review/probe-cf11-review-r4.mts`. Runner summary: `scripts/pending/cf11/review/review-rv5.summary`.

## What I ran
| run | result |
|---|---|
| `probe-cf11-review-r4` (new: R4A minting · R4B concurrency · R4C audit dedupe · R4D reply-all CC pairs · R4E free-mail V) | 9/9 |
| builder `probe-cf11-r4` | 14/14 |
| `probe-cf11-review-r3` | 10/10. R3B.1 ✅ (1,000 attacker mails, then the customer's reply stored) · R3A.1 ✅ (300/2,000 via the V domain bucket, customer stored) |
| `probe-cf11-review-mail` · `review-keys` | 12/12 · 8/9 (RK.6 = RV-4) |
| fitness (no env) · `pnpm typecheck` (5 GB heap) | 42/42 · exit 0 |

The builder's run of my `review-r2` (7/8; R2C.1 instrumentation only) was not repeated; that probe is superseded by review-r3.

## Probe integrity
- My probes are **unedited**: `git diff 59f5a400 3495091e -- scripts/pending/cf11/review` is empty.
- The builder edited its own `probe-cf11-r3` in three places:
  - F.1 now expects the new `dom.v` key. That is correct.
  - F.2 and H.1 preset the customer's V sender bucket to 10 before asserting that a full V system bucket drops V. This is **not a weakening**: under the ruled semantics only senders above 10/h can be dropped by the system bucket, so the check now exercises the intended case.
  - The light-sender positive side is covered separately (builder L.1/B.1, my R3A.1/R3B.1/R4B.1/R4C.1).
- Cosmetic: my INFO-R3D/R3D.2 labels still say "separate" for Gmail dot variants. The numbers (0 and 2) show they now fold into one key.

## RV-8 — closed
- **Lane (`emails.ts:2342-2380`).** It reuses the `count` returned by the class's sender bucket, the first step. That count comes from the single-statement `INSERT … ON CONFLICT … RETURNING` in `checkRateLimitDb`, so it is atomic. R4B.1: 30 concurrent thread-only mails from one provable sender with T's system bucket full → exactly 10 stored. If the counter fails (`count` undefined), the mail is let through, which matches the limiter's own fail-open.
- **Lane only affects the system step.** Sender, V/D domain and T per-Message-ID buckets still drop. R4D.1: 40 visible-CC pairs on one reply-all OUT mail × 4 → 100/160 stored (the per-Message-ID cap).
- **No minting of light senders without a pair (R4A.1).**
  - Thread proof is exact `bareEmail` equality, while key normalisation only merges.
  - A case variant of a proven address is the same pair and the same key.
  - `+tag` and Gmail-dot variants are not proven (class U), and they share the original's key anyway.
  - `googlemail.com` for a `gmail.com` pair is unproven.
  - Subdomain or lookalike addresses need their own shop-sent mail.
  - So every light sender costs one shop-sent mail to that exact mailbox (or one visible To/Cc slot). The `+10·k` bound holds.
  - A reply-all that copies many attacker addresses yields many pairs. In T those pairs are capped by the message bucket (R4D). In V they are capped by the domain bucket (300/h) on a non-free domain. On free mail they cost real DMARC-passing accounts (R4E: 5 Gmail accounts → 50 = 10·k).
- **Audit dedupe (R4C.1).** A light sender at system count limit+1 is stored and produces no audit. The first real drop is audited exactly once in the window; later drops are not re-audited, which is the same one-line-per-window rule as every other bucket. The owner notice is unchanged (≤ 1/h per class). Nothing a reader needs is hidden.
- **Dot-folding stays in the bucket key.** `inboundSenderBucketAddr` has one caller (`emails.ts:2343`, the bucket hash). Matching, attribution, proof and stored addresses still use `bareEmail`.
- **RV-9 closed.** One list: `CRM_INBOUND_FREE_MAIL_DOMAINS === FREE_MAIL_DOMAINS` (builder F.1). The builder deferred my extra domains because that list also drives company/staff-domain matching. I agree it is a product call (C6 follow-up).

## Residuals — my rating
- **R4-1 · LOW (C6, recommend a cheap follow-up).** The per-Message-ID T bucket has no light lane. One holder of a pair on a given OUT mail can send 100 thread-only mails citing it and drop every other recipient's reply to that mail for the hour. The holder can be the customer's CC'd colleague, a co-recipient in a tender, or anyone the mail was forwarded to. INFO-R4D.2: after co-recipients filled it, the main customer's own reply → `rate_limited`.
  - Why LOW: this needs being a To/Cc of that exact mail (or receiving a forward of it). Base let anyone on the internet block a customer's whole sender bucket with no pair at all (H3-1 MED), so the exposure is strictly smaller. With P14 set, the customer's reply is V, which has no message bucket, and is unaffected.
  - Fix: apply the same light lane to the message step (first 10/h per sender never dropped by the message bucket). The bound becomes message cap + 10·k.
- **R4-2 · LOW (stated).** Count-then-drop on a customer's T sender bucket by a pair-holder. Same reasoning; narrower than base.
- **R4-3 · LOW (stated).** `+10·k` above each V/T class cap. k grows only by one shop-sent mail per mailbox. Volume is in the RV-7 C6 debt.
- **R4-4 · LOW (stated).** D has no lane, so a D flood (≥ 4 attacker DMARC domains × 300, or ≥ 10 real free-mail accounts) drops new authenticated non-reply mail for the hour. It cannot touch V/T/U, and U has always been starvable by anyone.
- **RV-7 · LOW.** C6 debt (byte budget, copy-in quota).
- **RV-4 · MED (out of this card).** The kanban key page revokes any key of the shop. It ships with hotfix/apiv1-scope 201d371a and must not ship after this branch.

None of the residuals of this card's own code is MED+. The P14 launch gate from round 2 stands: do not set `CRM_INBOUND_AUTHSERV_ID` until the provider guarantees in the builder's P14 section are confirmed.

VERDICT: MERGEABLE (conditions: RV-4 ships with or before this branch via shark-hf 201d371a; P14 launch gate as stated; R4-1..R4-4 + RV-7 + free-mail list extension recorded as LOW / C6 debt)
