# C5.4-D FB-QUEUE — independent review (read-only · Opus 5.5 · 30 Sep 2026)

Scope: `git diff 6f6ea780 d7109718` (worktree `/root/projects/shark-crm-c54d`). Method: code reading, the builder's logs in `/tmp/c54d-logs/run2..4`, and file mtimes. I ran no suites, no DB and no typecheck.

## VERDICT: MERGEABLE AFTER SHOULD-FIX (S1, S2, S3, S4)

- No blockers.
- The four fixes do what the pinned C5.3-L3 checks ask.
- v1 behaviour is unchanged on every reachable path I checked.
- The logs match the handback.
- The SHOULD-FIX items are:
  - S1, S2: send-time guard semantics.
  - S3: redundant drains per action.
  - S4: concurrent replay writes two withdrawal rows.

---

## SHOULD-FIX

### S1 — The guard stops enrollments made AFTER the deal was already closed · verified in code
**Where**
- `src/lib/modules/crm/sequences.ts:1399-1401` stops whenever `deal.kind` is WON/LOST and the flag is set.
- The flags default to true: `stopOnWon` and `stopOnLost` are `@default(true)` at `prisma/schema/crm.prisma:810-811` and `sequences.ts:431`.
- `enroll()` accepts any visible deal whatever its kind (`sequences.ts:682-686`).

**Failure scenario**
- Staff enrol a customer in an after-sale or onboarding sequence and link the WON deal. With the default flags, the first non-WAIT step is STOPPED "WON" and nothing is sent.
- Before this change the stop existed only as the reaction to the `crm.deal.won` *transition* event, so a post-win enrollment ran.
- The built-in template `deal-lost-winback` (`automation-shared.ts:266-270`: LOST → wait 90 d → ENROLL "win-back") will stop itself the day `ENROLL_SEQUENCE` stops being a stub (`automation.ts:1055`), if the rule passes the deal id.

**Change wanted**
- Stop only when the deal closed at or after enrollment.
- Select `closedAt` and require `deal.closedAt == null || deal.closedAt >= e.createdAt`.
  - `closedAt` is set on every close and cleared on reopen: `dealStateForStage` at `deals.ts:702/850`, reset at `deals.ts:960`.
- This keeps the pinned C5.3-L3-M1 check green, because that deal is won after enrollment.
- Add a probe twin: enrol on an already-WON deal with `stopOnWon=true` ⇒ it sends.
- Alternative: the controller rules that the new semantics are intended. Then `enroll()` must refuse or warn when linking a closed deal to a sequence that would stop at once.

### S2 — A LOST deal deleted before the next step loses `stopOnLost` · verified in code (builder REPORTED it, did not fix)
**Where**
- The guard treats a missing deal as "continue" (`sequences.ts:1400`).
- `CrmSequenceEnrollment.dealId` is a bare `String?` with no FK (`crm.prisma:859`).
- `deleteDeal` refuses only WON deals (`deals.ts:1505`) and does not touch enrollments (`deals.ts:1499-1530`).
- The consumer `onDealLostStopSequences` → `dealOf()` returns null once the deal is gone (`crm-bridges/sequences.ts:22-26`).

**Failure scenario**
- A shop has `bridgesEnabled=false`, so the guard is now the only stop. A sequence runs WAIT 3 d → EMAIL.
- The deal is marked LOST on day 1 and then deleted, which is normal clean-up. The EMAIL is still sent on day 3.
- The same happens with bridges on if the drain fails before the delete.
- M1's text explicitly says "(or archived/gone)".

**Change wanted**
- In `deleteDeal`, after the transaction, when `out.kind === "LOST"`: `await sequences.stopFor({tenantId, systemId}, "", "LOST", { dealId: out.id })`.
  - This respects `stopOnLost` and needs no new stop code.
- Deleting an OPEN deal, or archiving one, keeps "continue". That needs a one-line controller ruling in the notes.
  - Archive has no writer today: I grepped for `CrmDeal.archivedAt` writers and found none. Revisit when one appears.

### S3 — Several wakes per action ⇒ several serial global drains in one lambda · verified in code
**Where**
- `activities/_components/actions.ts:57-61` calls `revalidateAndWake` 5×. `tracking-actions.ts:47-49` calls it 2×. `privacy-actions.ts:53-54` calls it 2×.
- Each call registers its own `after(drainNow)`.
- `drainOutbox` chains in-process drains serially (`core/outbox.ts:140-148` `drainChain`). Each `drainUntilQuiet` may run up to 20 s plus the last round (`core/outbox.ts:153,183`).

**Cost**
- The queue is global (all tenants, all modules). With a quiet queue the cost is 4 wasted candidate queries plus dynamic imports.
- With a busy queue one click can hold the lambda about 100 s after the response.
- If the page's maxDuration kills it mid-drain, leases lapse and handlers re-run elsewhere (the L3-M3 double-delivery class).

**Change wanted**
- Wake once per action: the helpers call `revalidatePath` N times and then `wakeOutbox()` once.
- Or coalesce inside `outbox-wake.ts`: a module flag set when an `after()` drain is registered and cleared when it starts.

### S4 — Complaint replay is "check-then-insert", not DB-idempotent · verified in code; P6 tests sequential replays only
**Where**
- `complaintAfterSteps` (`emails.ts` ≈2800-2830) reads `consents.current()` and then calls `consents.set()`.
- `consents.set` takes `FOR UPDATE` on the contact but does not re-check the latest state before its INSERT (`consents.ts:161-180`).

**Failure scenario**
- Svix times out a slow first delivery (15 s) and retries while the first is still running. The same happens with two overlapping retries.
- Both see EMAIL still granted and both insert. Result: 2 withdrawal rows, 2 `crm.contact.updated` events and 2 audits.
- This is harmless in direction (withdrawn twice) but contradicts the code comment "idempotent". The PDPA ledger gets a duplicate.

**Change wanted**
- Add an option to `consents.set` (e.g. `ifChanged: true`) that re-reads the latest channel row inside the locked transaction and skips when it already has the requested value. Call it from both complaint paths.
- A member-linked contact goes through the member facade; check that `setConsent` is idempotent there too.
- Probe: fire two replays with `Promise.all` ⇒ 1 row.

---

## NOTES (no change required for merge unless the controller says so)

### N1 — M2 widens hunter L3-m3 (duplicate mails) · verified in code
- A retry is a new `sendAsSystem` call: a new `CrmEmailMessage` row, a new `messageId`, and therefore a new Resend `Idempotency-Key` (`emails.ts:1184-1187, 1337-1352`).
- `TRANSPORT_ERROR` (network error after Resend may already have accepted; `core/email.ts:160-168`, and there is no fetch timeout) used to mean "skip and lose the mail". It now means "retry, possibly a duplicate".
- LINE has no retry key.
- Permanent `PROVIDER_4xx` other than 429 (403 domain, 422 recipient) is retried 5× over ≈3 h 45 m.
  - Each attempt leaves a FAILED `CrmEmailMessage` row plus a `crm.email.send` audit on the contact timeline.
- Addresses that are syntactically invalid, blocked or bounced are skipped at once (VALIDATION/EMAIL_BLOCKED at `sequences.ts:1169`). A hard bounce is accepted by Resend and later stops the sequence through the webhook.
- Suggest: map `PROVIDER_4xx≠429` to `skipped`, and carry m3's deterministic per-step key to a later batch.

### N2 — Complaint replay after a re-grant (builder's question) · verified in code + P4 actual `STOPPED/OPT_OUT`
Not writing the withdrawal is right:
- The customer's later explicit act wins.
- C20 "strictest wins" is about merge (`consents.ts:220`), not time.
- The COMPLAINT `CrmEmailEvent` row remains as evidence.

A fresh consent cannot be wrongly withdrawn, for two reasons:
- `eventAt` is the event row's DB `now()` (`crm.prisma:943`). Consent rows use the app clock (`consents.ts:178`), so skew is only in milliseconds.
- `eventAt` is null only if the unique hit came from another constraint.

Still stopping sequences while `emailOptOut` is set is acceptable in effect: e-mail is blocked anyway, and it follows controller ruling 5.
- But the stop is over-broad: `stopFor(contact, OPT_OUT)` also stops enrollments created *after* the complaint (for example after staff re-enrolled the customer).
- Suggest: when the consent changed after `eventAt`, restrict the replay stop to enrollments with `createdAt <= eventAt`.

### N3 — `consents.current` in the replay path is outside the permanent-error catch · suspected
- Location: `emails.ts` ≈2806.
- A coded NOT_FOUND/FORBIDDEN thrown there gives 500 on every Svix retry until Svix gives up (about 1–2 days).
- The endpoint itself is not disabled unless every message fails for days.
- Suggest wrapping it like `consents.set`.

### N4 — Two import actions wake inside `catch` · verified in code
- Locations: `companies-actions.ts:261`, `contacts-actions.ts:247`.
- They wake even on `CrmV2DisabledError`, which contradicts the `outbox-wake.ts` header claim "v1 never reaches this".
- v1 UI cannot reach these actions, so there is no practical impact.
- Suggest: no wake when `e instanceof CrmV2DisabledError`.

### N5 — CRM write paths that still do not wake · verified by grep
- chat CRM panel (`chat/crm-panel-actions.ts:109,140`)
- mobile POST routes (`api/mobile/crm/tasks/[id]/complete`, `call-log`, `scan-card/[proposalId]/accept`)
- portal `/b/[slug]/actions.ts`
- public `/t/*`, `/l/[code]`, `/u/[token]/*`
- `/api/email/inbound`

None of them moves a deal to WON/LOST, so M1's headline is covered.
- They are picked up within ≤ 1 min by the crm-cron minute drain once C6.1 installs the crontab, otherwise hourly (batch A).
- List them for C6.1.

### N6 — crm-cron minute becomes a platform-wide outbox drainer on the VPS · verified in code (`scripts/crm-cron.mts:93-104`)
- Once C6.1 installs the crontab, it drains every tenant and every module from the VPS.
- C6.1 must check two things:
  - The VPS checkout is at the deployed commit. Otherwise consumers of a different code version process prod events.
  - The VPS `.env` matches prod for the consumer secrets (Resend, LINE, Ably, Blob).
- Minute runs can now reach about 110 s. With `flock -n`, some minute ticks are skipped under load.

### N7 — M4 timing and ordering · verified in code
**Vercel `maxDuration` does not apply to this change**
- Only `scripts/crm-cron.mts:86` runs the hourly/daily cadences.
- Neither `/api/cron/hourly` nor `/api/cron/tick` calls `runMinuteJobs`. There is no `/api/cron/daily`; `vercel.json` schedules `tick` and `hourly`.
- `/api/cron/outbox` (`maxDuration 60`) runs the minute cadence only, and that path is unchanged.

**The minute cadence is semantically identical**
- `perJob=false` ⇒ same deadline, same list, same order (`minute-jobs.ts:595-613`). c0.5 is 50/50.

**Wall clock**
- Worst case is 80 s of jobs plus settle ≤ `110 s − elapsed`, with a 5 s floor (`crm-cron.mts:116`). That stays under the 120 s self-kill unless a DB stall pushes `runMinuteJobs` past about 105 s.
- A self-kill leaves the lease for 15 min. Cut-off is still recorded as "run" (`minute-jobs.ts:680`), so a killed daily job loses its window. The hunter's "don't record cut-off for hourly/daily" was not taken; the controller may want it.

**Overlap and ordering**
- Same-job overlap is impossible: the lease is held until the late promise settles (`minute-jobs.ts:681-688`).
- Up to 4 *different* cut-off jobs may now run concurrently in the background (before: ≤ 1).
- Least-recently-run ordering: ties fall back to registration order, so the first job is the same on normal days.
  - After a starved or busy day, `crm.teamroom.stale` can run before `crm.deals.stale` and skip silently. The hourly `.sweep` twin (`minute-jobs.ts:411-420`) covers this.
- With more than 4 slow daily jobs, the starved ones rotate to the front the next day. They are not guaranteed "every window".

### N8 — Guard concurrency and races · verified in code
**Double stop / double event**
- Guard vs `crm.deal.won` consumer: both use a conditional `updateMany` on `status IN (ACTIVE, PAUSED)`.
  - The guard also checks lease + stepIndex (`sequences.ts:1404-1406`); the consumer's is at `:218-226`.
  - Under READ COMMITTED the second updater re-evaluates and gets 0 rows.
- The finished event and the audit are written only on `count=1`. The event key `crm.sequence.finished#<id>#1` (`sequences.ts:209`) also dedups.
- Result: exactly one `crm.sequence.finished` and one audit.

**Other races (acceptable)**
- Remaining window: a WON commit between the guard's read and the send lets one step out; `advance` then fails.
- Reopened deal: the guard reads the live kind and continues. The consumer still stops by transition regardless of the current kind — pre-existing behaviour.

### N9 — `after()` usage · verified against `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` (Next 16.2.11)
**Correct**
- `after()` runs after the response, including on thrown errors and `redirect()`, and is bounded by the route's maxDuration.
- `wakeOutbox` awaits the drain inside `after` and swallows its errors. Registration is inside try/catch, so a failing drain cannot reach the user or the response.

**Outside a request**
- Scripts and tests fall back to an un-awaited drain. QC suites that call v2 actions directly now start global drains on shared QC DBs; C5.3 has its outbox shim, other suites do not. `scheduleDrain` behaves the same way.

**Side finding (pre-existing, platform)**
- `scheduleDrain` (`outbox-consumers.ts:1273-1275`) does `void drainAll()` *inside* `after`, which is not awaited, so waitUntil does not cover it. This is the same class as the 1 Sep incident.
- `wakeOutbox` does it right. Flag it to the platform lane.

### N10 — Probe quality (`scripts/pending/c54d/probe-c54d.mts`)
- P1–P5, P7 and P8 can fail and have controls (P2 is the flag-off control).
- **P6** is sequential only (see S4).
- **P9** has no positive control. It also passes if the consumer throws, because the row stays PENDING with `attempts+1`. Assert `attempts===0`, or add a v2 twin that flips the marker to DONE.
- No probe covers the guard-vs-consumer race (sound by code, N8) or enrollment on an already-closed deal (S1).

### N11 — Comment accuracy
- The "hourly pickup" statements in `core/outbox.ts:151,196` and `outbox-consumers.ts:1261` are now true: `/api/cron/hourly` awaits `drainAll()` (batch A).
- The `defaultSender` text "will retry next round" (`sequences.ts:1163`) is now true, after a 15 min backoff.
- The `outbox-wake.ts` v1 claim is true except for N4.

### N12 — Minor points in the M2 path
- The M2 failure path appends its log entry even when `n.count=0` (lease lost). This mirrors the OPT_OUT block; harmless.
- If the stop transaction inside `failAttempt` throws after the counter was written, the `runDue` catch counts again (n=6 ⇒ stop). This is an edge case.

---

## Item-by-item answers

### 1. Send-time guard
- Concurrency is correct, with one event and one audit (N8).
- Reopen after WON is handled (N8).
- Another pipeline is fine: same `systemId` filter, pipeline irrelevant.
- Another system ⇒ the deal is not found ⇒ continue.
- Hard-deleted or archived deals: archived is moot today; LOST→delete is **not acceptable** against M1's "(or archived/gone)" (S2). The pinned check does not cover it.
- New finding: S1.

### 2. wakeOutbox
- `after()` is used correctly (N9).
- A failing drain cannot surface.
- No renamed site is reachable by a uiVersion-1 shop: all 25 files gate through `session()` → `assertCrmV2` before writing. I spot-checked portal, privacy, tracking, ai, activities, companies, contacts, plus the counts of the rest, and verified the total of 97 calls. The exception is the two catch-block wakes in N4.
- REST returns ≥ 400 for v1 ⇒ no wake (P9 got 409).
- Missed paths: N5.
- Multi-wake cost: S3.

### 3. Step retry
- Bounded: 5 attempts at 15/30/60/120/120 min (P3 trail `+15m,+30m,+60m,+120m` then STOPPED FAILED, 1 audit).
- The xmin rule holds: the stop transaction is last, and c2.2 is 73/73.
- WAIT is unaffected; TASK is unchanged (still advances on failure).
- Double send: N1.
- A permanently invalid recipient is skipped at once when the address is invalid, blocked or bounced. It takes 5 attempts only for provider 4xx (N1).

### 4. Cadence budget
See N7. The per-job cap was not tested by the builder in a real 80 s run. It is sound by reading.

### 5. Webhook replay
- Replay idempotency is check-then-insert (S4).
- The PDPA rule is sound (N2).
- The 500 answer is bounded by Svix's retry schedule; the permanent-error set covers `consents.set` but not `consents.current` (N3).
- The complaint replay stop after a re-grant is acceptable but over-broad (N2).

### 6. Outside the four items
- The only other change is the `crm-cron` minute drain (N6).
- Comments: N11.
- Probe: N10.

### 7. Logs — every claim confirmed (verified)
**run2 (untouched HEAD 6f6ea780)**
- C5.3 L3 is 6/11, red on M1, M1b, M2, M4, m2.

**run3**
- typecheck exit 2: the `createdAt` bug.
- C5.3 L3 is 10/11. m2 is red with ACTUAL `500 after_steps_failed` from that bug.
- Suites: c2.2 73/73 · c2.1 84/84 · c0.5 50/50 · c2.5 105/105 · c2.6 87/87 · c2.10 41/41 · c2.11 47/47 · c1.8 81/81 · c3.9 49/49 · m1.9 26/26 · fitness 33/33 ×2. There are 0 ❌ in every suite log.

**run4**
- typecheck exit 0 (log written 11:59:23, after the probe mtime of 11:57:26).
- C5.3 L3 11/11, probe 10/10, fitness 33/33 ×2.

**Timing**
- Timing matches the claims: the last src mtime is `emails.ts` at 11:37:19 UTC, and run3 c2.2 started at 11:39:12.
- All other src mtimes are ≤ 11:30:03.
- The commit contains no later src edit. Only the ledger note changed, at 12:04:45.

**Temp-copy diff**
- `/tmp/c54d-logs/c53-qc3-copy.diff` is one hunk at line 57, the host guard `ep-cool-shadow` → `ep-weathered-river`. Nothing else.
- The copy itself is deleted, so I checked only the logged diff (mtime 11:22).

**Worktree**
- `scripts/crm-expected.json` and `scripts/member-expected.json` are modified in the worktree and not committed, as stated.

---

## Round 2 — re-review of `git diff d7109718 54e3a942` (read-only · 30 Sep 2026)

### VERDICT: MERGEABLE AFTER SHOULD-FIX (R2-S1, R2-S2, R2-S3)

- Round-1 S1–S4 and N2, N3, N4, N9, N12 are all implemented as the controller ruled, and the logs back them up.
- Three problems are left:
  - One hole in the S1 time rule (verified).
  - One suspected provider-semantics defect in the new redelivery path.
  - A permanent-error list that turns shop-side sending outages into silently skipped e-mails (suspected, needs a controller re-ruling).
- R2-S2 and R2-S3 both depend on Resend behaviour I could not check offline. The controller can accept R2-S2 as a documented residual if Resend's docs say otherwise.

### Rulings checked (verified in code)

| Item | Where | Status |
|---|---|---|
| S1 guard | `sequences.ts:1420-1427` | Stops only if the close time (`closedAt ?? stageEnteredAt`) is ≥ `e.createdAt`. |
| S1 consumer | `crm-bridges/sequences.ts:22-40` | `enrolledAtOrBefore: deal.closedAt`. A null `closedAt` (reopened) keeps the old behaviour. |
| S1 `stopFor` | `sequences.ts:842` | Date filter on `createdAt`. |
| S2 | `deals.ts:1521-1535` | After the delete tx, a LOST deal gets `stopFor(…, kind, {dealId, enrolledAtOrBefore})`. Not gated on bridgesEnabled. A failure is WARN only. Deleting an OPEN deal continues. |
| S3 | `outbox-wake.ts:31-49` | Per-process pending flag, cleared when the task starts, stale after 6 min. |
| S4 | `consents.ts:156-227` | `ifChanged` re-reads under the `CrmContact FOR UPDATE` lock. On the member path, `getConsents` and `setConsent` run on the same tx; the audit is written after the tx. |
| N1a | `emails.ts:1017-1030`, `sequences.ts:1172-1178, 1256-1262, 1514` | Permanent failures advance the step; transient ones retry. |
| N1b | `sequences.ts:1169-1170`, `emails.ts:1271-1297` | Key `seq:<enr>:v<ver>:<idx>`. Redelivery does a FAILED→QUEUED compare-and-set on the same row. |
| N2 | `emails.ts` | Replays use `enrolledAtOrBefore = eventAt` for both complaint and bounce. |
| N3 | `emails.ts` | `consents.current` is inside the permanent-error catch. |
| N4 | `companies-actions.ts:262`, `contacts-actions.ts:248` | No wake on `CrmV2DisabledError`. |
| N12 | `sequences.ts:1523-1535` | No log entry when the lease was lost; a counter failure is caught. |
| N9 | `outbox-consumers.ts:1277`, `outbox-wake.ts:38-41` | The `after()` tasks now return the drain promise. |

### SHOULD-FIX

#### R2-S1 — WON→WON and LOST→LOST stage moves re-stamp `closedAt`, so the guard stops after-close enrollments again · verified in code

**Where**
- `moveCore` writes `closedAt: state.closedAt` and `stageEnteredAt: now` on every move (`deals.ts:850-859`).
- `dealStateForStage` returns `now` for any closed kind (`rules.ts:24-25`), including moves between two WON stages. Those moves are explicitly supported and fire no `crm.deal.won` (`deals.ts:829-830`).
- The same timestamp feeds the send-time guard (`sequences.ts:1424-1427`) and `deleteDeal` (`deals.ts:1527`).

**Scenario**
- The deal is WON at T1 in "ชนะ".
- At T2, staff enrol an after-sale sequence with `stopOnWon` (the default). S1 now lets it run.
- At T3 the deal moves to a second WON stage, e.g. "ส่งมอบแล้ว". `closedAt` becomes T3, which is ≥ T2.
- The next non-WAIT step is STOPPED "WON". No event fires, so only the guard does this.
- The same happens with LOST→LOST, and with `deleteDeal` of a LOST deal that moved between lost stages.

**Wanted (either)**
- (a) In `moveCore`, keep `closedAt` (and use it as the close time) when the deal is already of the target closed kind: `closedAt: deal.kind === target.kind && target.kind !== "OPEN" ? (deal.closedAt ?? now) : state.closedAt`.
  - This also stops a WON→WON move from shifting the deal's win date in reports that read `closedAt`. The controller should confirm, because report periods could move.
- (b) Guard-local: take the close time from the latest `CrmDealStageHistory` row whose from-stage kind differs from the current kind.
- Either way, add a probe twin: enrol after WON, move WON→WON, the step still sends.

#### R2-S2 — Redelivery sends a *different* body under the same Idempotency-Key · suspected (Resend semantics not verifiable offline)

**Where**
- The redelivery branch re-composes the mail (`emails.ts:1283`, `composeOutgoing`).
- `newToken` is random (`emails.ts:328-330`), so the click/open/unsubscribe tokens in the HTML and the `List-Unsubscribe` header (`deliver`, `emails.ts:1321-1325`) differ on every attempt. The Message-ID, and therefore the `Idempotency-Key`, stays the same.

**Why it matters**
- My understanding of Resend (please verify in their docs): a key reused within 24 h with a different payload returns **409** `invalid_idempotent_request` rather than the original result.
- N1b exists for exactly this case: attempt 1 was accepted by Resend but the answer was lost (`TRANSPORT_ERROR`, or a 5xx after processing).
- In that case every redelivery gets 409. `isPermanentSendFailure` treats 409 as transient, so the step retries 5× and then the enrollment is STOPPED FAILED.
- Result: the customer did get step 1, the timeline says FAILED, and **every later step of the sequence is never sent**.
- The N1b probe stub (`probe-c54d-r2.mts:28-37`) does not compare bodies, so it cannot see this.

**Wanted (either)**
- (a) Make redelivery byte-identical: derive the open/click/unsubscribe tokens deterministically from `emailId` (e.g. HMAC(server secret, `emailId|purpose|i`)). Then re-composing gives the same HTML and headers, and Resend returns the original 200.
- (b) On a redelivery only, map `PROVIDER_409` to "the provider already holds this message": mark the row SENT (unconfirmed), audit it with `redelivery:true, providerConflict:true`, and advance.
- Extend the N1b stub to fail on a same-key/different-body request.

#### R2-S3 — The N1a "permanent" list includes shop-side sending outages · suspected (provider semantics) · needs a controller re-ruling

**Where:** `emails.ts:1017-1030`. Every `PROVIDER_4xx` except 408/409/425/429 is treated as permanent.

**Which Resend 4xx are really transient (as I understand their error codes)**
- 401/403: API key missing, revoked or being rotated; sending domain not verified or DNS lapsed; testing-mode restriction.
- 422 `invalid_from_address`.
- These describe the *sender*, not the message. They hit every e-mail of the shop equally and are fixed by the owner or the platform.

**What happens during such an outage**
- Every running enrollment advances past **every** e-mail step, each logged FAILED. LINE and TASK steps still run, and the sequences end DONE.
- Once the domain is fixed, nothing is resent.

**What staff see**
- Only the step log line ("ผู้ให้บริการอีเมลไม่รับจดหมายฉบับนี้ … ระบบจึงไปขั้นถัดไป") and FAILED mail rows on each contact.
- The only alert is a platform ops WARN (`email.rich`). No shop-facing notice.

**Related, carried over from round 1**
- 429 daily/monthly quota is "transient", so on a quota day every enrollment that tries to send is STOPPED FAILED after about 3 h 45 m.

**Wanted**
- Permanent = message-specific codes only: 400, 404, 405, 422 other than the from-address case. Since only the status is available, 422 as a whole is acceptable.
- 401/403 → transient with backoff, and notify the shop owner once per outage.
- Optionally: quota 429 defers without counting toward `MAX_STEP_ATTEMPTS`.

### NOTES

#### R2-N1 — What a redelivery re-enforces · verified in code
**Enforced**
- Consent, opt-out and bounce are re-checked on attempt 2 (`canContact`, `emails.ts:1203`, before the insert). A contact who opts out between attempts gets `EMAIL_BLOCKED`, which means skipped. ✓
- Threading: same Message-ID, `threadKey`, `inReplyTo` and references. ✓
- Attachments are excluded (`!prior.attachments`). ✓
- `deliver` rewrites `trackTokenHash`, `routing.links` and `routing.unsub` on SENT (`emails.ts:1398-1410`), so tracking and unsubscribe tokens still resolve. ✓
- Concurrency: the FAILED→QUEUED compare-and-set plus the enrollment lease give exactly one delivery. ✓
- After success: one row SENT, one activity, one `crm.email.sent`. After a second failure: the row goes back to FAILED with an audit `redelivery:true`. ✓

**Not enforced**
- The recipient is the stored `prior.toAddrs`, not the contact's *current* e-mail. If staff changed the address between attempts, the old address still receives the mail. Suggest skipping redelivery (as permanent) when `prior.toAddrs` is not among the contact's current addresses.
- The daily cap: a `CrmLimitError` also routes into redelivery (`emails.ts:1269`), so an already-counted row can be re-sent while the cap is full. This is bounded to one row per step.

#### R2-N2 — Who can reach `redeliverFailed` · verified in code
- Only `sequences.defaultSender` sets it (`sequences.ts:1169`). REST (`api/ops/emails.ts:143,212`), UI (`emails-actions.ts:80`) and bulk (`emails.ts:1519`) build their inputs field by field.
- But the key namespace is shared. A REST `Idempotency-Key` header goes raw into the same hash (`emails.ts:1185`, `sha256(systemId:idem)`).
- So a key holder who sends `Idempotency-Key: seq:<enrollmentId>:v1:0` (enrollment ids are readable over REST) pre-occupies a step's Message-ID.
  - The step then returns "reused SENT" with the caller's content.
  - Or, if that row is FAILED for the same contact, the step redelivers the caller's row.
- Fix: namespace system keys, e.g. hash `sys:` + key vs `api:` + key into `rfcId`.

#### R2-N3 — A stuck QUEUED row is treated as sent · suspected (crash-window edge)
- If a previous process died mid-send, the prior row is QUEUED with an active lease. The unique hit returns "reused QUEUED".
- `defaultSender` treats anything but FAILED as ok, so the step advances. The stuck-send reaper later marks the row FAILED, and the step is lost silently.
- Suggest: treat QUEUED as transient (retry).

#### R2-N4 — S3 flag · verified by reasoning
**The ordering is sound**
- Every waker calls `wakeOutbox` after its write commits.
- A waker that sees the flag set knows a drain task has been registered and has not started. That drain's candidate query necessarily runs later, so it sees the waker's row.
- The case "B commits after A's drain started" is covered too: the flag is cleared at start, so B registers its own drain.
- The case "A's drain runs before B's tx commits" cannot happen: B only calls wake after commit.

**Contexts**
- Outside a request, `after()` throws and the task runs immediately, which clears the flag. No coalescing, correct.
- Without Fluid (one request per instance) the flag only coalesces within a request.

**Residual**
- If a registered `after()` task never starts (the invocation is killed or times out before `after` runs, but the instance survives), every wake in that instance is skipped for ≤ 6 min. Events wait for other drains or the hourly cron.

#### R2-N5 — S4 member path (not exercised by the probe) · verified in code / suspected where marked
**Lock order**
- `CrmContact FOR UPDATE`, then the member facade on the same tx: `loadMemberRow`, the MemberConsent write, `emitOutbox` (`member/privacy.ts:650-740`).
- I found no `Customer FOR UPDATE` in that path, and no member-module code that writes `CrmContact`.
- So I see no lock-order inversion. It is the same pattern as `revokeOnMember`.
- Any deadlock would be detected by Postgres (40P01), and the webhook would retry through a 500.

**Audit after the tx**
- A crash between commit and `writeAudit` loses the audit.
- A replay then sees "unchanged" and never writes it. So the audit is lost, but never duplicated.
- Suggest writing it inside the tx.

**Race (suspected, rare)**
- If the contact becomes member-linked between `loadContact` and the tx, `sysId` is null and a coded CONFLICT is thrown.
- CONFLICT is in `PERMANENT_AFTER_STEP`, so the complaint's withdrawal is **skipped with only a WARN**.
- Suggest throwing an uncoded (retryable) error when `pre.memberCustomerId !== contact.memberCustomerId`.

#### R2-N6 — N9 consequences · verified against `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` + code
**What does not change**
- `after` callbacks run after the response, so the latency users see is unchanged.
- Both wrappers are rejection-proof (`then(()=>undefined, ()=>undefined)`; `drainNow` catches). No unhandled rejection, no error page, no failed action.
- No caller runs on the edge runtime, and `proxy.ts` does not drain.
- Webhook routes (LINE/Meta through `chat/service.ts`, Resend) answer before `after` runs, so provider timeouts are unaffected.

**What changes, prod-wide for every module**
- The function lifetime is now the drain time.
- `drainOutbox` serialises drains in-process (`core/outbox.ts:140-148`). Under a burst in one Fluid instance, each invocation's waitUntil therefore waits for every drain queued ahead of it.
- With a busy global queue, lifetimes stack (about 20 s × N) up to the platform maxDuration. No route sets it except `/api/cron/outbox` (60 s).
- That means kills mid-drain. The claim-time leases from batch A (L3-M3) make this safe for correctness, but not for cost or DB connections.

**Suggest**
- Coalesce `scheduleDrain` with the same pending flag as `wakeOutbox` (one shared flag).
- Watch function duration and DB connections after deploy.

#### R2-N7 — N2 applies on every replay
- `enrolledAtOrBefore = eventAt` is applied on every replay, not only after a re-grant.
- Enrollments created between the event and a late replay are not stopped. That is acceptable: e-mail is blocked by the flag anyway.

#### R2-N8 — Probe quality (`probe-c54d-r2.mts`)
**Can fail**
- S4 is really concurrent: `Promise.all` of 2 webhooks × 10 contacts. Run7's RED-before showed 2/2/2 rows/events/audits for every contact.
- S1, S2a, N1a, N1b, S4, N2, N3, S3 and N9a were red before the fix and green after.

**Proves nothing about the race**
- N10 is green both before and after. It does not show that the race was actually interleaved; it only shows the outcome is right.

**Missing**
- Member-linked S4.
- WON→WON after an after-close enrollment (R2-S1).
- Same-key/different-body at the provider (R2-S2).
- Opt-out between two attempts (R2-N1).
- S3 across two requests.

#### R2-N9 — Logs · verified
**run9**
- Summary: probe-r2 13/13 · probe 10/10 · C5.3 L3 11/11 · c2.2 73/73 · c2.1 84/84 · c0.5 50/50 · c2.5 105/105 · c2.6 87/87 · c2.10 41/41 · c2.11 47/47 · c1.4 110/110 · c1.5 103/103 · c1.8 81/81 · c3.9 49/49 · forms-notify 9/9 (`QC Forms Notify: 9/9 ผ่าน`; the log has no JSON_SUMMARY line) · m1.9 26/26 · typecheck exit 0 · fitness 33/33 ×2.
- 0 ❌ in every run9 log.
- The C5.3 copy is regenerated by `sed` from the committed suite. `run9/c53-copy.diff` is the single host-guard line 57.

**RED-before (source at d7109718)**
- run6 and run7: probe-r2 4/13, red on S1, S2a, N1a, N1b, S4, N2, N3, S3, N9a.
- run8: typecheck exit 2, the probe-only TS2339.

**mtimes**
- The last source edit was at 12:33:07 (`companies-actions.ts`, `contacts-actions.ts`).
- probe-r2 was edited at 12:36:47.
- The run9 directory was created at 12:37:05.
- The commit holds no source edit made after run9 started.
- `scripts/{crm,member}-expected.json` are modified in the worktree and not committed.

---

## Round 3 — re-review of `git diff 54e3a942 1d5d1603` (read-only · 30 Sep 2026)

### VERDICT: MERGEABLE AFTER SHOULD-FIX (R3-S1)

- R3-S1 is a one-constant change in the only prod-exposed piece: `core/after-drain.ts`.
- Everything else is v2-only. No prod shop is on v2, and the `crm-cron` crontab is not installed until C6.1.
- The v2-only items are listed as **follow-ups F1–F6**. They can go to a follow-up card, as long as that card is done **before any shop runs v2 sequences with the crontab (C6.1 gate)**.

### Rulings checked (verified in code)

**R2-S1**
- `deals.ts:851-857` sets `keepCloseDate = !legacy && fromClosed && deal.kind === target.kind && !!deal.closedAt`. WON↔LOST, open→closed and reopen behave as before; v1 `legacy` is untouched.
- The `closedAt` reader list in the builder's notes is complete. I grepped `closedAt` over `src/`; the account, restaurant and referrals hits are other models, and `member/fields.ts:544` is a column list.
- Every CRM reader now gets the date of the first close, which is the more correct answer:
  - reports won/lost per period: `reports.ts:382-384, 418, 429, 508-512, 589`
  - commission reconcile window and `closedAt >= rule.createdAt`: `commissions.ts:1510-1514`
  - member timeline `at`: `member-bridges.ts:687`
  - AI purchase history
  - DTOs and exports
- No data migration: rows already re-stamped keep their dates.

**R2-S2**
- Each redelivery claim writes its own hashes (`emails.ts` ≈1296-1310) and keeps the previous attempt's hashes in `redo`.
- In `deliver` (≈1426-1460), a 409 is read as "sent" **only when `args.redelivery` is set**. A plain send's 409 still ends FAILED.
- On that path: row SENT, `providerId` null, `providerError = DELIVERY_UNCONFIRMED`, `routing.deliveryUnconfirmed`, previous hashes restored.
- The three-attempt case the probe covers (503 → accepted-lost → 409) is correct:
  - The 503 attempt writes H1 and leaves it.
  - The accepted-lost attempt claims H2; its FAILED write keeps H2.
  - The 409 attempt restores `prev = prior.trackTokenHash = H2`, which belongs to the accepted body.
- Superseded attempts' tokens stop resolving, because their hashes are overwritten. That is the right direction, apart from F1.
- Activity and `crm.email.sent` are written once, in the SENT transaction.
- A late webhook cannot double-write, because it cannot find the row at all (see F2).

**R2-S3**
- Permanent = 400/404/405/422 + INVALID_HEADER + NO_RECIPIENT; outage = 401/403/429 (`emails.ts` ≈1024-1036).
- Outage retries use their own `stats.outages` counter for backoff and never call `failAttempt`.
- The 72 h ceiling is measured from `stats.firstFail[v:idx]` and stops the enrollment in the same transaction as the log, finished event and audit (`sequences.ts` ≈1575-1605).
- Counters are keyed by version and step index, so a success or permanent advance moves to a fresh key. That makes a reset unnecessary.
- Mixed runs (outage → transient → outage) work: transient failures count toward 5; outage failures do not count but share `firstFail`, and stop at 72 h after the first failure of any kind.
- There is no infinite loop on the outage path.

**R2-N1b**
- A full daily cap on the system path throws `CrmLimitError` unless an already-sent row exists (`emails.ts` ≈1284).
- `defaultSender` then waits until `nextThaiDayStart`, with no log and no count.
- `nextThaiDayStart` (`sequences.ts` ≈1155-1158) is `Date.UTC(thY, thM, thD+1) − 7 h`, computed on a +7 h shifted instant with `getUTC*`, so it avoids the local-time trap.
  - 16:59Z (23:59 Thai) → 17:00Z same day.
  - 17:00Z (00:00 Thai) → next day's 17:00Z. That is correct: the new Thai day has already started and its cap is full.
  - Month and year rollover are handled by `Date.UTC`.

**R2-N2**
- The Message-ID prefix is `ik-` when an actor is present and `sk-` for the system path. REST and UI keys hash byte-identically to before, so they still dedupe across the deploy.
- Sequence keys have only ever existed in unmerged WIP commits, so no pre-deploy `ik-` sequence rows exist on prod.
- The only other system sender, the automation `SEND_EMAIL` rule (`automation.ts:1161`), passes no key, so the change does not affect it.

**R2-N3**
- A prior QUEUED row returns `inFlightUntil`, and the step waits until `lease + 2 min`.
- The stuck-send reaper is inside `runScheduled` (`emails.ts` ≈1658-1666, immediate QUEUED rows past their lease). Its job `crm.email.scheduled` is in the same minute dispatcher as `crm.sequences` (`minute-jobs.ts:196`), so it runs wherever sequences run.
- On prod neither runs today: v2-only, no crontab.
- If the reaper fails persistently, the wait repeats every minute with no ceiling (F4).

**R2-N5**
- `consents.ts:177-182`: when the member link changed mid-call, the code throws an uncoded `Error`. The complaint path treats it as transient ⇒ 500 ⇒ the provider retries.
- A member that is genuinely missing is still CONFLICT.

**R2-N6 (call-site invariant)**
- I read all 14 `scheduleDrain` call sites in 10 files. The builder said 11 sites.
  - booking.ts:156
  - branding/service.ts:317
  - pos/service.ts:382
  - chat/service.ts:769, 1707, 1980, 2131, 2238
  - forms/service.ts:276
  - kanban/notify.ts:209
  - kanban/reminders.ts:131, 215
  - kanban/checklists.ts:242
  - kanban/comments.ts:165
- Every one runs after its own `prisma.$transaction` has returned. None is inside a transaction callback.
- `notifyCardAssigned` commits its event in its own top-level transaction before waking.
- In a request, `after()` only runs after the response, so callers' awaited transactions have committed.
- Layering: `core/after-drain.ts` imports only `next/server`. `outbox-consumers` → core, with no cycle; fitness is 33/33.
- Scripts and cron: `after()` throws ⇒ the drain runs immediately and the flag is cleared at start, so there is no coalescing outside a request.

### SHOULD-FIX

#### R3-S1 — The 6-min stale window turns cross-request coalescing into a platform-wide drain stall · verified by reasoning (prod-exposed)

**Where:** `src/lib/core/after-drain.ts`, `PENDING_STALE_MS = 6 * 60_000`.

**How it fails**
- Since r3, one "registered-but-not-started" drain covers **every module's** drain requests in the Fluid instance: chat, POS→accounting, booking, forms, kanban, branding, CRM.
- The registered task only starts when the registering request's response has finished.
- So B's events wait for A's response to finish (for example, POS `voidSale` keeps working after `scheduleDrain`, and a server action streams its RSC payload).
- Worse: if A's `after()` task never starts, every drain in that instance is suppressed for up to **6 minutes**. That happens if the invocation hits maxDuration or is killed while the instance keeps serving.
- Those 6 minutes cover automation, webhooks, member stamps and journeys, POS→accounting and chat-side consumers. This is the same symptom class as the 1 Sep incident (≈ 557–600 s delays).
- Before r3, each request drained on its own after its own response.

**Wanted**
- Shorten the window to about **10–15 s**.
- Registering an extra drain when a pending one is older than that is harmless: drains are serialised in-process and leases guard every claim. At most one extra drain per window per instance.
- The worst-case added delay then becomes about 15 s instead of 6 min.
- Update the file's comment: the window should be short, not "> maxDuration".

### FOLLOW-UPS (v2-only / not prod-exposed today — safe for a follow-up card, gate: before C6.1 enables sequences)

#### F1 — R2-S2 restores the wrong hashes when a failure that never reached the key check lies between the accepted attempt and the 409 · verified by trace
**Scenario**
- Attempt k is accepted but its answer is lost.
- Attempt k+1 fails before Resend's idempotency check: a network error that never reached Resend, or an early 5xx/429/401. Its claim overwrote the row's hashes with H(k+1).
- Attempt k+2 gets 409 and restores `prev = H(k+1)`.
- The mail the customer actually holds (H(k)) then has open, click **and unsubscribe links (including List-Unsubscribe one-click) that do not resolve**.

**Why the probe misses it:** the stub (`probe-c54d-r3.mts:28-33`) always answers 409 once a key is stored, so it cannot express "a later attempt that never reached Resend".

**Fix:** derive tokens deterministically, e.g. HMAC(server secret, `emailId|purpose|i`), so every attempt is byte-identical.
- Resend then replays the original 200 **with its id**.
- The 409/unconfirmed path and the hash juggling become unnecessary.
- This also fixes F2.

#### F2 — Unconfirmed rows are invisible to later webhooks · verified in code
- `providerId` is null, and the webhook resolves rows by `providerId` (`emails.ts` ≈2873). A delivered, bounced or complained event for that mail therefore answers `unknown_email` 200 and is dropped.
- So a **spam complaint about that mail does not opt the contact out**, and a hard bounce does not stop sequences.
- F1's deterministic tokens fix this.

#### F3 (suspected, provider semantics) — A 409 after an attempt that genuinely failed
- If Resend stores *error* answers against an idempotency key, then a 409 after a genuinely failed attempt means nothing was ever delivered, yet the row is marked SENT (unconfirmed) and the step advances.
- F1 removes this dependency.

#### F4 — Wait paths (R2-N3 in-flight, R2-N1b full cap) have no ceiling and no log line
- If the reaper job keeps failing, the step re-checks every minute forever.
- Staff see no reason why a step stalls.
- Suggest one log entry per wait episode, plus a ceiling (e.g. 24 h in-flight ⇒ the normal FAILED path).

#### F5 — The R2-S3 owner notice is deferred to the UX batch (builder note)
- Today an outage is visible only as step log lines and the platform `email.rich` WARN. Keep it tracked.

#### F6 — Carried items
- R2-N1a: a redelivery goes to the stored `toAddrs`, not the contact's current address.
- For C6.1: round-1 N5 (write paths that don't wake), N6 (VPS drainer env and commit parity), N7 (cadence notes).

### Probe quality (`probe-c54d-r3.mts`)

**What the stub models**
- It is Resend-like: same key + same body ⇒ replay; different body ⇒ 409; errors are not stored.
- "lost" means accepted with the answer thrown away. That models R2S2a/b/c faithfully, but it cannot express F1 (see above).

**R2N8a/b really force the race**
- R2N8a parks the guard at its deal read (a patched `crmDeal.findFirst` keyed on the guard's `select`) until the consumers have stopped the rows. It then asserts `runDue.failed === held`, i.e. the guard attempted its conditional stop and lost.
- R2N8b parks every consumer after it has read ACTIVE rows, runs the guard, then releases. It asserts that consumers saw every row ACTIVE and that the guard finished all of them.
- Both still require exactly 1 finished event and 1 audit per enrollment, and 0 sends. These now prove the race, unlike r2's N10.

**RED-before (source at 54e3a942)**
- run10 and run11: probe-r3 7/19. Red: R2S1a, R2S1b, R2S2a, R2S2b, R2S2c, R2S3a, R2S3b, R2N2, R2N3, R2N6, R2N5b, R2N1b.
- Green as pins: R2S3c, R2N8a–d, R2N5a, CLEAN.

### Logs — verified

**run15 (SUMMARY)**
- probe-r3 19/19 · probe-r2 13/13 · probe 10/10 · C5.3 L3 11/11
- c2.2 73 · c2.1 84 · c0.5 50 · c2.5 105 · c2.6 87 · c2.10 41 · c2.11 47
- c1.4 110 · c1.5 103 · c1.8 81
- c3.1 56 · c3.2 47 · c3.3 90 · c3.9 49
- forms-notify 9/9 (from its text line) · m1.9 26
- typecheck exit 0 (clean `tsc --noEmit`) · fitness 33/33 ×2
- 0 ❌ in every run15 log.
- `run15/c53-copy.diff` is the host-guard line 57 only.

**Earlier runs**
- run12: typecheck exit 2, the TS2322 the builder reported. run13: exit 0.

**mtimes**
- Last source edit: `emails.ts` at 13:43:18. probe-r3 was edited at 13:35:14.
- run14 (probe-r3 19/19) finished at 13:45:29; run15's first log was written at 13:47:15.
- So no source edit happened after run15 started.
- The worktree holds only `scripts/{crm,member}-expected.json` changes, which are uncommitted as stated.
