# C5.2 HUNTER — lens L3: QUEUES, CRON, REDELIVERY & RACES (read-only hunt · 27–28 ก.ย. 2569 · Opus 5.5)

Tree: main `/root/projects/shark-crm` @ 1576edcb · no source edits.
Probe: `scripts/pending/hunt-l3/probe-l3-queues.mts`, log `scripts/pending/hunt-l3/probe-l3-queues.log`.
- Ran on **QC2** in the throwaway tenant `qc-hunt-l3-qqqqq…-a`. Run: `bash scripts/qc2.sh pnpm exec tsx scripts/pending/hunt-l3/probe-l3-queues.mts`.
- **The probe never drains the outbox and never runs a real cron job.**
  - `sequences.runDue` is scoped with `tenantIds:[mine]`.
  - The minute-job test clears the in-process registry and registers two fake jobs, `qc-hunt-l3-<rand>-*`.
- Cleanup finished with 0 tenants, users, outbox rows, enrollments, job-state rows and OpsEvents left.
- Verdicts: L3-A, L3-B, L3-C and L3-D = BUG-REPRODUCED.

Not re-reported: the C4.3 lost-reason race, the C3.9-fix items, and the L2 money findings.

**Counts: BLOCKER 0 · MAJOR 4 · MINOR 4**

---

## MAJOR

### M1 — CRM never wakes the outbox, and sequences have no WON/LOST check at send time ⇒ follow-up e-mails keep going to customers who already bought or declined · CONFIRMED + reproduced (L3-B, L3-C)

**No drain after CRM writes.**
- `grep scheduleDrain|drainAll` over `src/lib/modules/crm/**`, `src/lib/platform/crm-bridges/**`, `src/app/api/v1/crm/**` and `src/lib/api/**` finds only a comment (`crm-bridges/index.ts:4`).
- CRM emits 48 outbox events inside its transactions but never schedules a drain.
- Something only drains when:
  - an unrelated module does (chat, POS, kanban, forms, booking — `scheduleDrain` callers), or
  - the **daily** 03:00 tick runs (`platform/cron.ts:336`).
- `/api/cron/hourly` does not drain, and nothing calls `/api/cron/outbox` (C0.5 addendum). The kernel comment at `core/outbox.ts:160` ("cron รายชั่วโมงเก็บตก") is false.
- Backoff retries (2–32 min) depend on the same incidental drains.
- Everything a `crm.*` consumer does waits up to about 24 h in a quiet period:
  - stop sequences, auto-invoice on WON, team-room post
  - commission approval submission (`crmFirst`)
  - CRM rules, webhooks, member timeline, scoring
  - PDPA post-erase work (`crm.contact.erased`)

**No send-time guard.**
- `sequences.ts` `runClaimed` (:1340-1447) re-checks contact gone and opt-out at step time (:1397). It never looks at `e.dealId`'s `kind`.
- Stop-on-WON/LOST exists **only** in the consumer `crm-bridges/sequences.ts:40-55` (`onDealWonStopSequences` / `onDealLostStopSequences`).
- That consumer is also gated by `bridgeOpen` (uiVersion 2 **and** `bridgesEnabled`). A shop that turns off "links to other modules" (`api/ops/settings.ts:33`) therefore silently disables the CRM-internal `stopOnWon` / `stopOnLost` for good.

**Scenario (probe L3-B).**
- Setup: sequence `stopOnWon=true` with 2 EMAIL steps, enrolled with `dealId`.
- `deals.moveDeal(→WON)` succeeds. The `crm.deal.won` event stays **PENDING**.
- The next `sequences.runDue` (5-minute job) sends **both** e-mails to the WON deal's contact. The enrollment ends `DONE` with `stoppedReason null`.

**Scenario (probe L3-C).** Same setup with `bridgesEnabled=false`. The `crm.deal.won` consumer (`onDealWonStopSequences`) is called directly first and returns without stopping anything. Both e-mails are still sent.

**Why the oracles miss it.**
- Every qc-crm suite calls `drainAll()` or the consumer directly. ORACLE-EDIT C1.8 added `drainAll()` to form suites for exactly this reason.
- c2.2 proves stop-on-WON by consuming the event (`qc-crm-c2.2.mts:1537`). It never checks the window between the move and the drain, and never combines `bridgesEnabled=false` with `stopOnWon`.

**Minimal fix.**
- (a) In `runClaimed`, before any SEND or TASK step: if `e.dealId` and the deal is WON/LOST (or archived/gone), and `seq.stopOnWon` / `stopOnLost` is set, stop with `WON` / `LOST`.
  - Use the same conditional update, event and audit as the opt-out block.
  - Do not gate this on `bridgesEnabled`: sequences are CRM-internal.
- (b) Wake the queue after CRM writes:
  - `scheduleDrain()` in the CRM server-action layer and after `crmApi.dispatch` writes, or at least
  - `await drainAll()` at the start of `scripts/crm-cron.mts minute`.
- (c) Correct the outbox.ts comment.

### M2 — A sequence step whose send fails is logged "will retry next round" but is skipped for good · CONFIRMED + reproduced (L3-A)

**Where.**
- `sequences.ts:1162`: on `sendAsSystem(...).status === "FAILED"`, `defaultSender` returns `{ ok:false, error:"ส่งอีเมลไม่สำเร็จ — ระบบจะลองขั้นนี้อีกครั้งในรอบถัดไป" }`.
  - This happens on Resend 429/5xx/timeout or a key or domain problem; `core/email.ts` has no retry.
- The runner turns that into outcome `FAILED` (`action-runner.ts:229`).
- `runClaimed` then calls `advance()` **regardless of outcome** (`sequences.ts:1443`). `advance` sets `stepIndex+1` and `nextAt = now` (:1287-1291), so the next step runs in the same round.

**Probe.**
- 2-step sequence with a sender that answers `{ok:false}`.
- Run 1: both steps are logged `FAILED` with "will retry" and the enrollment is `DONE`.
- Run 2, 16 minutes later with a healthy sender: claimed 0, nothing sent.

**Why the oracles miss it.** C2.2-X9.5 "route B" (`qc-crm-c2.2.mts:1608`) uses a sender error that contains a **NUL** character.
- The NUL makes the jsonb log write throw, which takes the exception → `failAttempt` path.
- A plain `ok:false` is never asserted.

**Minimal fix.** For SEND kinds with outcome FAILED and not skipped, do **not** advance:
- keep `stepIndex`, clear the lease, set `nextAt = now + backoff`, and count through `failAttempt` (MAX_STEP_ATTEMPTS → STOPPED FAILED + audit).
- Or, if skipping is intended, change the message. The current text promises a retry that never happens.

### M3 — Outbox lease is computed from the round-start clock, so later claims in a round are born expired ⇒ handlers run twice across drainers · CONFIRMED by trace (arithmetic) · trigger PLAUSIBLE · not reproduced (a drain is global and would touch other tenants on QC2)

**Where.**
- `core/outbox.ts:219`: `const now = new Date()` is taken once per `drainOnce`.
- `:231-236` (write at :235) claims each event with `availableAt = now + 60 s`.
- The 20 s `TIME_BUDGET_MS` is checked **only between rounds** (:180). One round handles up to 50 events serially.
- Any event claimed more than 60 s after the round started gets a lease that is already in the past. Another drainer takes it at once: an `after()` drain in another Vercel lambda (triggered by any chat message or POS sale in any shop) or the tick.

**What is not idempotent under a double run.**
- Webhooks: `webhooksAlreadyDispatched` tests `attempts > 0`, so both runs at attempts 0 dispatch (`outbox-consumers.ts:378-397`).
  - The body `{type,payload,sentAt}` carries **no event id** (`webhooks/service.ts:300`), so receivers cannot dedupe.
- v1 automation NOTIFY/WEBHOOK rules on `crm.*` events have no key (`automation/engine.ts:62-94`).
- The loser's completion or failure write is unconditional (`outbox.ts:268-289`). A duplicate that throws after the other run finished flips `DONE` back to `PENDING` (attempts+1), which causes a third run.
- The same happens when a lambda dies mid-drain: the lease lapses with attempts still 0 and everything re-runs.

**Concrete scenario.**
- A shop has one webhook endpoint subscribed to all events (empty filter) that times out (5 s + 1.5 s DNS guard).
- It imports 200 contacts, producing 200 × `crm.contact.created`, about 6.5 s each.
- From about the 10th event of a round, the claim is already expired. The next chat message anywhere re-drains those events, and the endpoint receives duplicates.
- The CRM dynamic-import graph on a cold lambda adds seconds per round as well.

**Why the oracles miss it.** Every oracle drains serially in one process with fast handlers. No test uses two drainers plus a slow handler.

**Minimal fix.**
- Claim with `availableAt = new Date(Date.now() + LEASE_MS)` (and `where availableAt <= new Date()`).
- Stop the round when elapsed time exceeds the budget.
- Complete and fail conditionally on the lease you wrote: `where {id, status:"PENDING", availableAt: myLease}`.
- Add `id: evt.id` to the webhook body and an `X-Shark-Delivery` header.
- Optionally key v1 rules on the event id.

### M4 — The minute-job dispatcher shares ONE 20 s budget across all jobs of a cadence, and the hourly/daily crontab lines fire once per window ⇒ tail jobs (PDPA purges, retention) are skipped, possibly every day · CONFIRMED + reproduced (L3-D)

**Where.**
- `platform/minute-jobs.ts` `runMinuteJobs` sets one `deadline = Date.now() + 20 000` and runs every due job of the cadence in sequence.
- A job with too little budget left is `no-budget` and **not recorded**. For the minute cadence the next tick (60 s later) picks it up.
- For `hourly` and `daily` there is **no next tick in that window**: `crm-cron.mts` has one crontab line each (`7 * * * *`, `40 20 * * *`), and the route only runs the minute cadence.
- A job that was `cut-off` **is** recorded as run (`recordFinish(..., false)`), so it is not due again until the next window.

**Daily registration order:**
`automation.cron` → `scoring.decay` → `deals.stale` → `companies.cache` → `purge.web` → `purge.email` → `reports.scheduled` → `teamroom.stale` → `purge.exports` → `retention.leads`

- The legal retention and purge jobs come last.
- Once the earlier jobs need 20 s or more in total, the tail never runs on any day.

**Hourly order:**
`automation.waits` → `money.reconcile` → `notify.fanout` → `activities.overdue` → `reports.sweep` → `portal.sessions.sweep` → `teamroom.stale.sweep`

- `portal.sessions.sweep` only acts in the 03:xx slot, so one skipped hour loses the whole day.
- `reports.sweep` was added as the safety net for `reports.scheduled` (review S1), but it sits 5th in the same shared budget.

**Probe.** Fake daily jobs [slow 20.6 s, tail]:
- Run 1 gives `slow=cut-off`, `tail=no-budget`, and tail ran 0 times. The status shows slow `lastRunAt` set and `lastOkAt` null.
- A hypothetical second run the same day (the crontab has none) gives `slow=not-due`, `tail=ok`.

**Why the oracles miss it.** qc-crm-c0.5 S3 (`:21-24`) asserts that the jobs "behind them must run exactly once across **this tick and the next**". That holds only for the minute cadence.

**Minimal fix (any one):**
- In `crm-cron.mts hourly|daily`, loop `runMinuteJobs` until every job is ok or not-due, up to about 90 s, below the 120 s self-kill.
- Give each hourly or daily job its own budget.
- Let the minute tick also pick up due hourly and daily jobs (they are window-aligned and idempotent).

Also consider not recording `cut-off` as run for the hourly and daily cadences.

---

## MINOR

### m1 — REST idempotency rows can stick "in progress" for 24 h, and transient failures are replayed for 24 h · CONFIRMED by trace
- `api/idempotency.ts:139-219`:
  - The claim inserts `status NULL`. If the lambda dies or times out before `updateMany` (:216), every retry with the same key gets `409 idempotency_in_progress` until `expiresAt` (24 h).
  - There is no claimedAt or lease takeover.
- Results are stored "both success and failure" (:212). A transient 5xx, pool timeout or 409 lock conflict is therefore replayed as final for 24 h, and a correct client retry never succeeds.
- Fix: add `claimedAt` and treat a NULL-status row older than about 2 min as abandoned (take it over with CAS). Do not persist 5xx/429; delete the row so a retry re-runs.

### m2 — Resend bounce/complaint: side effects after commit are lost on replay · consent-history write swallowed · CONFIRMED (swallow) / PLAUSIBLE (crash window)
- `crm/emails.ts:2548-2612` (consents.set …catch at :2594-2601): the transaction records `providerEventId` (unique) and the flag.
- Outside the transaction:
  - `stopSequencesFor(...)` (bounce and complaint)
  - `consents.set(... granted:false, source:"UNSUBSCRIBE")` with `.catch(() => null)`
  - `writeAudit`
- A crash or DB error there means Svix retries hit the unique key → `200 "replay"`, and those steps never run.
- For a complaint only `emailOptOut` is set. With the stop lost, LINE/SMS steps of running sequences continue, and the PDPA consent ledger has no withdrawal row.
- Even without a crash, a transient error in `consents.set` loses the row permanently.
- Fix: move the consent write and the stop into the same transaction (or emit an outbox event and do them in a consumer with retry). On replay, re-run the idempotent after-steps instead of returning early.

### m3 — Crash-window duplicate customer e-mails from sequences and CRM WAIT_THEN · PLAUSIBLE
- `sequences.ts:1151` `sendAsSystem` creates a **new** `CrmEmailMessage` per attempt. The Resend `Idempotency-Key` is that row's `messageId`, so each retry gets a new key.
- If the send succeeds and then the `advance()` transaction throws (DB blip), `runClaimed` throws → `failAttempt` keeps the lease → the step re-runs after 15 min → the customer gets the same step e-mail twice.
- Same shape in `automation.ts` `finishCrmWait`: `runSteps` then `closeWait`.
- Fix: a deterministic key per step (`seq:<enrollmentId>:v<ver>:<index>` → stable `messageId`, or look up an existing row by `sequenceStepId` + enrollment before sending).

### m4 — `withAutomation` re-runs automation and journeys on every retry of a failed main handler; the v1 engine is not keyed · CONFIRMED by trace
- `outbox-consumers.ts:197-223` runs `runForEvent` even when the main handler threw, then rethrows, so the queue retries up to 5×.
- The CRM rule engine is keyed (rule, contact, eventKey), but v1 NOTIFY/WEBHOOK rules (which can subscribe to `crm.*` events, `automation/labels.ts:143-179`) are not.
- CRM case: `crm.quota.reached` (main = `quotas.onReached`, `:1212`, which throws on a transient DB or notify error) → a v1 NOTIFY rule makes up to 5 AppNotifications or 5 webhook POSTs.
- Fix: key the v1 `automationRun` on (ruleId, event id) with a partial unique, or skip automation when `attempts > 0` (the same trick webhooks use).

---

## Checked and found sound
- **Consumer registry**: every `crm.*` / `custom.record.*` label in automation and webhook labels has a consumer. Scripted cross-check: 0 missing.
  - `crm.deal.stale` / `crm.activity.overdue` are declared once (the C2.11 note about duplicate keys is correct).
- **Emit atomicity**: no `emitOutboxOutsideTx` or `emitOutbox(prisma, …)` in CRM or crm-bridges. All emits are in the same transaction as the write.
- **Redelivery idempotency of CRM handlers**, which do survive a double run:
  - scoring: partial unique (ruleId, eventKey)
  - CRM rules: unique (rule, contact, eventKey) + advisory lock when there is no contact
  - auto-invoice: advisory lock + `invoiceDocId` / `invoiceConvertedFrom`
  - portal activity: advisory lock
  - commission bridges: status guards + row locks
  - quota notify: per-day dedupe; team room: flag
  - sequences stop: conditional update
- **crmFirst ordering**: if first fails, rest is not run; webhooks fire on attempt 0 only.
- **Round-robin**: the cursor moves in one `UPDATE … RETURNING`; cap / LEAST_OPEN take an advisory lock.
- **Contact merge**: field advisory lock then sorted row locks. I found no lock-order inversion with update paths.
- **Inbound e-mail**:
  - replay: scoped `messageId` pre-check + unique; stranger→lead under the leadFromBridge lock.
  - Svix: signature, unique `providerEventId`, 500 on DB error.
- **Scheduled e-mail**: conditional lease claim, Resend `Idempotency-Key = messageId`, and a reaper for stuck immediate sends.
- **Minute dispatcher**: single-statement lease claim, CAS release, and refusal of a future `now`.
- **Time zone**: cron keys and windows use Thai midnight (`thaiYmd`, `WINDOW_OFFSET_MS`); `close_due` / `field_due` catch up 7 days on item-date keys.
- **REST idempotency**: single-INSERT claim, body-hash conflict → 409, one-time secrets scrubbed before storage.
- **Deal 360 edits**: per-field saves, so there is no whole-form lost update between two tabs.
- **invoiceCore**: account calls inside the advisory-lock transaction are themselves idempotent (lookups by convertedFrom and refType/refId).
