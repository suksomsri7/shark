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
