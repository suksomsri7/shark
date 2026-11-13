# T0.7a second-round review: fix round r1 (V1–V9)

- Worktree `/root/projects/shark-trips-l1`, branch `wip/trips-t0.7`, HEAD `d220338cb`.
- Diff reviewed: `3d4c00aae..d220338cb -- src` plus the oracle edits.
- Read-only: no tsx, build, oracle or database commands were run.

## Verdict: **FIX FIRST**

There is one MAJOR, and it is small to fix. The V4 re-quote recomputes the refund ladder at the **execute** date, not the date the customer asked for the refund. A customer whose request was approved at D−20 can drop to 0 % if anything trips the re-quote near departure.

Everything else in r1 is closed or closed with a caveat:
- The lock order still has no cycle.
- No transaction opens a second connection.
- V1, V2, V3, V5, V6 and V7 are correct.

The remaining items are MINOR.

---

## 1. Round-1 findings: status

| # | Finding | Status | Where / caveat |
|---|---|---|---|
| R M-1 | Dues job scans and locks every open due; upcoming dues starve | **Closed with caveat** | `jobs.ts:286–352`. There are now two keyset queues. Overdue = OPEN/PARTLY_PAID with `dueAt+grace ≤ now`. Rows leave the queue once flipped, so the permanent OVERDUE head is gone. Reminders run with no transaction. Caveat: rows that keep failing stay at the head of the overdue queue, and both cursors restart every tick (see N-5). |
| R M-2 | Cancel on a sold booking skips the refund permission | **Closed** | `booking-actions.ts:150–160` and `booking.ts:1427–1435`. FORBIDDEN without `trips.refund.request`. A non-CUSTOMER reason needs `trips.refund.approve` (`refund.ts:357`). The key exists at `core/permissions.ts:887`. No other exported action or route reaches `requestTripRefund` or `cancelTripBooking` without opts. `tripSellable.cancel` (`sellable-impl.ts:27`) is the only opts-less path, and `platform/sellables.ts#sellableFor` has **no callers** today. Future basket or chat callers must pass opts. |
| R M-3 | Phantom OPEN draft dues after a refund | **Closed** | `refund.ts:762–766` now cancels only OPEN/PARTLY_PAID/OVERDUE. `money.ts:316–349`: drafts appear only when the booking has no due rows at all, and outstanding is 0 when the booking no longer owes money. Residual display issue on EXPIRED holds: N-6. |
| R M-4 | APPROVED request stranded when the version changes | **Closed with caveat** | `refund.ts:696–702` checks facts instead of the version. `:814–836` re-quotes. `:986` allows APPROVED→WITHDRAWN with approve rights. Caveats: N-1 (MAJOR), N-2, N-3, N-4, N-7. |
| R m1 | Statutory floor found by probing W01 | **Closed** | `th-tour-2569.ts:63–67` reads the same `REFUND_FLOOR` with the same `find(d ≥ from)` as W01 (`:150`). ≥30 days = 100, 15–29 = 50, <15 = 0, d<0 or non-integer = null. This matches T-TOUR-03 [V] in the shark-thai-law test-rules (notice 2563, clauses 4–5). |
| R m2 | Retained-VAT row dropped | **Closed with caveat** | `money-core.ts:262,267`. A full non-pass-through refund gets the receipt's whole VAT. A **partial** refund still uses the current snapshot's `vatCtx` (drift is possible after a paid move-date re-snapshots a shop whose VAT registration changed). The `amount 0 ∧ VAT>0` retained branch is now unreachable, because amount 0 ⇒ np = vatable ⇒ refunded VAT = all of it. Suggest `mulDivHalfUp(r.vat, np, r.vatable)` in T0.7b. |
| R m3 | Retiming leaves the due OVERDUE | **Closed** | `money.ts:453–472` reopens the due under the new snapshot's grace, with CAS on status and paid. Row-count not checked, same as before, and safe under the booking UPDATE lock. |
| R m4 | Reminders and overdue run during an open refund | **Half closed** | Suppressed in SQL (`jobs.ts LIVE_BOOKING_SQL`) and under the lock (`money.ts:815`). Multi-`d` on first sight is **not fixed**: `money.ts:790` still fires d=7 and d=1 together for a due first seen inside 24 h. It was not ruled on. |
| R m5 | Audit clock | **Closed** | DB default (`money.ts:419–431`). Lookup uses `LEAST(created, now()) − 24h` (`refund.ts:164–166`). An injected future clock gives a now()-bound, and a past clock gives a created-bound. Audit rows are always ≥ both, so they are found. The T0.6 `booking.ts:1386` `idemAudits` still uses a JS-side `since` (out of scope; it fails only with a future test clock more than 24 h ahead). |
| R m6 | Id-order comment overclaims | **Closed** | `money.ts:396–401`. |
| R m7 | 64 point queries; no slice cap | **Closed** | `money.ts:526–546` uses `= ANY`. `:479` returns TOO_MANY_DUES. **Unreachable**: a schedule is deposit + balance (≤2 live dues; X-settings have no instalment count), so a payment has ≤2 slices. |
| R m8 | Pass-through evidence read only at request time | **Closed** | `facts.passThroughPaidOut` is compared at execute, then re-quoted. |
| R m9 | `tripCashDay` unbounded | **Not closed** | No ledger item was added. Still T1.3 debt. |
| R m10 | `overdue++` / second audit row on re-overdue | **Not closed** | Cosmetic. A second `autoRelease` call returns false because the key exists. |
| R m11 | Slip due not checked as open | **Not closed** | Note it for T0.7b. |
| H M-1 | QR issued on an expired hold | **Closed** | `money.ts:632–637` uses the same rule as the convert CAS (`expiresAt > now`, all ACTIVE). |
| H M-2 | = R M-4 | Closed with caveat | See above. |
| H M-3 | AUTO_RELEASE race after the OVERDUE flip | **Closed** | Filed in the same transaction as the flip, under the booking lock (`money.ts:852`, `refund.ts:840–852`). The due is re-read under the lock, and paid dues are skipped (`:836`). |
| H info | Approval with a NULL unit | **Closed per ruling** | `refund.ts:511` requires an exact match. This is inconsistent with T0.6 `booking.ts:301` (accepts NULL). `approval/service.ts:179` leaves `unitId` optional. Any future UI that submits the approval must pass `unitId`. |
| H info | Purged bookings / reminders during refund / F4 | Closed or by design | The key is per due, per brief §13 :235 (`sy:trips.paymentDue:<dueId>`), so a second auto-request for **another** due after a withdraw is per brief. "At most one OPEN per booking" is enforced only by `openRefundOf` under the booking lock (2b). Both INSERT sites (`requestCore`, `autoReleaseOverdueInTx`) hold 2b, and there is no partial unique index. |

---

## 2. New findings (ranked)

### N-1 MAJOR: the re-quote moves the cancellation date to the execute time
`refund.ts:823`: `tripRefundQuote(tx, g, b, c.clock.iso, …)`, with `quotedAt: c.clock.iso` at `:825`.

The brief says the quote is computed at `{at: ctx.now}` of the **request** (§8.1 :164). The ladder and the statutory floor depend on days-before. The re-quote re-evaluates both at the executor's clock.

**Scenario (DN-1 fixture numbers):**
- The booking has 1,145,000 paid, of which PARK pass-through is 150,000.
- The customer asks at D−20, which is 50 %. The quote is 497,500 + 150,000 = 647,500. Staff approve it.
- At D−2 the operator files departure-level park-fee evidence. That is the realistic trigger in this lane, because `passThroughPaidOut` is the only fact that can change while a request is open.
- Staff execute, and facts have changed, so the request is re-quoted at D−2. The ladder there is 0 %, and pass-through is 0 (paid out). The new quote is **0**.
- The correct re-quote, still at D−20, would be **497,500**. The customer loses 497,500 satang (฿4,975) through the shop's own delay.
- `REFUND_BELOW_STATUTORY_MINIMUM` also disappears, because the floor at D−2 is 0.

AUTO_RELEASE requests get the same shift.

**Fix:**
- Use `tripRefundQuote(tx, g, b, comp.quotedAt, …)` and keep `quotedAt: comp.quotedAt`.
- Add `requotedAt: c.clock.iso`.
- Pass the requested deductions `Σ r.deductions[].amountSatang`, not `comp.deductionsSatang`. That field is `deductionsUsed`, already capped (`money-core.ts:198,230`). Today this is neutral, but it is wrong once the cap moves.
- Oracle: approve at D−20, add departure evidence, execute at D−2 ⇒ QUOTE_REFRESHED with amount 497,500, then re-approve and execute DONE.

### N-2 MINOR: re-approval after a re-quote emits no `trips.refund.approved`, and the re-quote itself emits nothing
- `emitMoney` keys are `type:<requestId>` with `skipDuplicates` (`money.ts:175`; `refundEvt` key `r.id`, `refund.ts:191–195`).
- The second approve of the same request is deduped silently.
- Consumers keep the first approved amount (647,500 in N-1) and never learn about the re-quote or the new approval.
- **Fix:**
  - Key the approved, requested and requote events by `${r.id}:${generation}`. Keep a `computed.generation` counter and bump it on each re-quote.
  - Emit `trips.refund.requoted` (ids and amounts only) and register it like the other 8.

### N-3 MINOR: the re-quote neither re-checks facts nor takes the request's advisory lock, so a stale re-quote can clear a fresh approval
- `requoteApproved` reads the request, takes 2b, and runs CAS APPROVED→QUOTED **without** re-checking that the facts still differ from the request's current `comp.facts`. It also does not take `lockMoneyKey("refund", id)`.
- **Sequence:**
  1. Executors A and B both fail on FACTS_CHANGED. B waited on the advisory lock, then saw the old facts.
  2. A re-quotes.
  3. A staff member re-approves. If this was a manual override, it consumes an approval.
  4. B's re-quote transaction now starts. It sees APPROVED and re-quotes again, clearing a valid approval and burning the consumed approval.
- The window is narrow (the human approval must fit between B's rollback and B's second transaction, but pool waits widen it). The CAS row-count check does stop double writes.
- **Fix:** in `requoteApproved`, first `lockMoneyKey(tx,"refund",id)`. After the 2b lock, return STATE_CONFLICT (no write) when `comp.facts && sameFacts(comp.facts, quoteFactsOf(tx,…)) && paid matches`.

### N-4 MINOR: the facts have no snapshot fingerprint, and the version is no longer checked at execute
- Inside this lane, everything that can change the correct refund is covered while a request is open:
  - Change and move-date are refused under lock (`booking.ts:1695`).
  - Pay is refused.
  - New or reversed money rows show up in `moneyEventIds`.
  - Departure-level evidence is captured.
  - The promo is released only in execute.
- The only `policySnapshot` writer is `changeImpl` (`booking.ts:1689`).
- The version used to be the catch-all for future lanes. Now an APPROVED request survives any future snapshot rewrite (T0.8 or later) undetected.
- **Fix:** add `snapshotSha: sha256(JSON(policySnapshot))`, or the payable plus dues shape, to `QuoteFacts`.
- Requests without `facts` (only paid and departure are checked) exist only in QC databases: `TripRefundRequest` is not on `main` (`git show main:prisma/schema.prisma` has 0 matches). So the facts-less path is not a production concern.

### N-5 MINOR: AUTO_RELEASE failure rolls back the OVERDUE flip, and failing rows sit at the head of a queue that restarts every tick
- `money.ts:852`: `autoRelease` runs inside the flip transaction. If `tripRefundQuote` fails (snapshot cancel ladder invalid, SETTINGS_INVALID), the whole transaction rolls back.
- The due stays OPEN with no `trips.payment.overdue` event. The shop is never told, and the job retries it every tick.
- The cursors are local (`jobs.ts:307–310`), and the overdue page runs first. So K persistently failing rows cost K booking-lock transactions at the head of every tick before reminders get a turn.
- At about 25–50 ms each, that is roughly 1,000–2,000 failing rows to fill a 50 s deadline. That is unlikely, but the "one queue cannot starve the other" claim does not hold in that case.
- **Fix:**
  - Run `autoRelease` under a SAVEPOINT. On failure, keep the flip and count the failure.
  - Retry from a second queue: OVERDUE + AUTO_RELEASE + no request with key `due_<id>`.
  - Run the reminder page first in each loop iteration.

### N-6 MINOR: dues of EXPIRED or cancelled-unpaid HOLD bookings show as `status OPEN` with outstanding 0, and they accumulate in the job's index scan
- Dues are created at finalize for HOLD (`booking.ts:1059`), and nothing cancels them on expiry or cancel-unpaid. Those are T0.6 paths with no TripPaymentDue writes.
- `duesView` (`money.ts:316–349`) zeroes outstanding but returns `status: r.status` = OPEN. The job's queries match these rows on `status,dueAt` and discard them only through the join (`b.status IN (CONFIRMED, PART_PAID)`). Every tick re-scans all historic expired-hold dues.
- **Fix:**
  - In the view, map OPEN/PARTLY_PAID/OVERDUE to `CANCELLED` when `!owes`.
  - Later, with a controller allowance, cancel open dues in the sweeper and cancel-unpaid paths, or add a partial index.
- Also: a CONFIRMED booking that was changed and then refunded unpaid shows both CANCELLED due sets (history duplicates). Cosmetic.

### N-7 MINOR: the exported G.3 table no longer matches the code
- `TRIP_REFUND_TRANSITIONS` (`money-core.ts:32–41`, exported from `index.ts:344`) lacks APPROVED→WITHDRAWN (`refund.ts:986`) and APPROVED→QUOTED (`:826`).
- Any UI or fitness check that relies on `canTransitionRefund` will disagree with the code.
- **Fix:** add both pairs, citing the r1 V4 ruling.

### N-8 INFO
- **Dead code:** `autoAllowed` (`refund.ts:358`) is always true once the line `:357` gate has passed, so "auto-approve suppressed" never triggers. A request-only user's CUSTOMER request can still auto-approve under X12, which is the least generous reason, so this is acceptable.
- **Lost decision history:** the re-quote overwrites `computed` wholesale. The previous `decisionReason`, `manualReason`, facts and quote are gone from the row. Its audit `before` holds only `{status, amountSatang}`, not `decidedById`, `manualDeltaSatang` or `approvalId`. The earlier approve audit row still exists, so the trail can be reconstructed. Suggestion: add those three plus the names of the changed facts to the re-quote audit `before`.
- **Reminder writes:** each tick re-attempts `INSERT … skipDuplicates` for every due inside a reminder window (`money.ts:790–793`). This predates r1. It is a write per due per tick, and could be filtered.

---

## 3. Specific questions

**a. V4**
- **Race between rollback and re-quote:** the re-quote is a CAS from APPROVED with a row-count check, under the booking lock (2b) only. A withdraw or another re-quote in between gives STATE_CONFLICT, which is safe. A decide in between cannot happen (decide needs QUOTED), except the N-3 sequence.
- **Facts completeness:** complete for this lane; N-4 covers future lanes.
- **Requests without facts:** QC only.
- **Loops:** none. Facts can change only through a one-way evidence flip while a request is open, because pay, change and new dues are blocked. So there is at most one re-quote per flip.
- **Audit trail:** see N-2 and N-8.
- **Ladder date:** wrong, see N-1.

**b. V1**
- **Keyset:** the cursor `(dueAt, id)` only moves forward, so a row cannot be returned twice in one run. A row that changes status between pages is either already behind the cursor or drops out of the predicate. A row retimed behind the cursor is caught on the next tick.
- **`GRACE_SQL`:** reads the same path as `snapshotValue` (`snapshot.ts:153–157`). X11 is `INT(0,720)` (`defs/trips.ts:519`), so `::int` cannot overflow. Malformed, missing or negative values become 0: the row is selected, and the in-transaction `graceHoursOf` returns SNAPSHOT_INVALID. That is a per-row failure and goes to N-5.
- **Time:** `iso::timestamp` against a naive UTC `dueAt`, the same as r0.
- **Alternation:** see N-5.
- **Lock order:**
  - Job: 2b → 2d → 2b′, with no advisory lock and no 1a.
  - Payment: adv `pay:` → (1a) → 2b → 2d.
  - Execute: adv `refund:` → 1a → 2b.
  - The job never waits on an advisory lock or on 1a while holding 2b, so there is no cycle.
- **F4:** by design, per brief §13.

**c. V2:** the gate is complete for every current entry point; see R M-2 above. The permission key is correct.

**d. V3, by booking state:**
- HOLD: real rows, owing. ✓
- CONFIRMED and PART_PAID ✓
- PAID: outstanding 0 ✓
- CANCELLED after refund: PAID rows are kept, open rows hidden, and CANCELLED rows show only when all rows are cancelled ✓
- CANCELLED unpaid HOLD and EXPIRED: status OPEN with 0 outstanding (N-6)
- Bookings from before T0.7: drafts, shown as CANCELLED when not owing ✓

**e. V7:** fine; see R m5. No T0.7 lookup uses a JS clock.

**f. V8:** see R m7 (64 cannot be reached) and R m2 (retained-VAT semantics: no amount-0 RETAINED rows can now occur).

**g. V5:** see R m1.

## 4. Lock order and connections (re-checked)
- **New paths:**
  - re-quote: 2b
  - withdraw APPROVED: 2b → 2b′
  - job: 2b → 2d → 2b′ (via `fileRefundRequestInTx`)
  - QR HOLD check: no lock, outside any transaction
- None of these adds an edge that reverses the r0 order.
- No second connection inside a transaction: `autoReleaseOverdueInTx` and `fileRefundRequestInTx` use only `tx` plus pure functions. X12 is read outside the transaction (`jobs.ts:320–324`). `quoteFactsOf` and `tripRefundQuote` take `tx`.

## 5. Oracle edits (d220338cb)
- **S-15 allow-list:** justified, but loose. It exempts whole files. Tighten it by asserting that the `th-tour-2569.ts` diff against `session/trips` has no `-` lines (additive only), and that the `booking-actions.ts` diff touches only `cancelTripBookingAction`.
- **DN-1 `[["PAID"]]`:** correct per §8.4 and V3. It still does not assert the **view** (`listTripDues` / `tripMoneySummary.dues` after DONE), which was the round-1 gap.
- **JB-2 pays the deposit first:** justified by V1 (no reminders while a refund is open). It now tests reminders only on PART_PAID bookings.
- **Gaps that matter:** there is no oracle check for any r1 ruling. The hunter probes are not part of the oracle. Missing:
  - V4: re-quote, including the D−20 → D−2 case from N-1; APPROVED→WITHDRAWN with and without approve rights.
  - V2: `REASON_REQUIRES_APPROVER` (testable at service level by passing opts).
  - V6: `HOLD_EXPIRED` on QR.
  - V3: the view after DONE.
  - V5: `tourRefundFloorPctAt` boundaries 30/29/15/14/0/−1 and 1.5 (pure).
  - V8: retime reopening an OVERDUE due.
  - M-1: 200+ OVERDUE plus one upcoming due under a short deadline.

## 6. Not checked
- Nothing was run: no typecheck, oracle, probes or database.
- I did not verify the "not yet run" status of the ORACLE-EDITs.
- I did not check whether the `runPaymentDue` return-type change (`more`) suits `minute-jobs.ts:801`; it ignores the value.
- I did not re-audit T0.6 internals (`returnSoldInTx`, `releasePromoInTx`, sweeper).
- I did not check whether Prisma fills `@default(now())` on the client or on the database. Either way the time is real, and the LEAST bound covers both.
