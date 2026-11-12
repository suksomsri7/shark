# T0.3 independent review — wip/trips-t0.3 @ cdfa29102 (strict WO)

Verdict: **FIX FIRST** (1 BLOCKER, 5 MAJOR)

Read-only review. I did not build, typecheck, run tests or touch the database. Line numbers refer to the tree at cdfa29102.

## BLOCKER

**B1. An ARCHIVED product or an inactive option can still get schedules and departures (the new T0.2 requirement is not met).**
- `departures.ts:124-132` `productOption()` never reads `TripOption.active`. An inactive option passes in `createSchedule` (:346), `createDeparture` (:611) and `materializeCore` (:504).
- The product and option are read through `unitDb` **outside** the transaction, with no lock.
- Interleaving with T0.2 `archiveProduct`, which takes `lockProduct` FOR UPDATE and then `isReferenced`:
  1. T1 `createDeparture` runs `productOption` and sees ACTIVE.
  2. T2 `archiveProduct` locks the product. `isReferenced` returns false, so no `confirm`/reason is needed. T2 sets ARCHIVED and commits.
  3. T1 opens its transaction, inserts an OPEN departure and commits.
  - Result: an archived product with a sellable departure, and T0.2's "referenced ⇒ CONFIRM_REQUIRED" guard was bypassed.
  - The same race exists with `setOptionActive(false)`, and with the daily job.
- `updateSchedule` (:375) never checks the product or option. Brief §3.1 says "〃", so PRODUCT_ARCHIVED applies there too.
- Fix:
  - Move the check into each transaction (`createSchedule`, `updateSchedule`, `createDeparture`, and `materializeCore` after the advisory lock).
  - Use `SELECT "status" FROM "TripProduct" WHERE id AND "tenantId" AND "unitId" FOR SHARE`, then `SELECT "active","durationMin","nights" FROM "TripOption" WHERE id AND "productId" AND tenant/unit FOR SHARE`. That is the same product→option order as T0.2 `setOptionActive`, and no departure is locked yet, so lock order holds.
  - ARCHIVED ⇒ PRODUCT_ARCHIVED. Inactive option ⇒ the same code or NOT_FOUND (controller to pick a code; there is no OPTION_INACTIVE).

## MAJOR

**M1. One failing shop stops the whole job.**
- `jobs.ts:31-38` and `:50-58` have no try/catch around each schedule and each unit. `evaluateMinPaxCore` (:896-907) has none around each row either.
- Anything that throws aborts the job, and every later tenant is skipped on that run and on every run while the cause persists. Examples:
  - `settingOf` throws "ค่าตั้ง … ผิดรูป" (:71) on one shop's bad setting;
  - a non-retryable pg/Prisma error (P1001, 23514, …);
  - a failing `ROLLBACK TO SAVEPOINT` in `underSavepoint`.
- Fix: wrap each schedule and each unit (and each row in `evaluateMinPaxCore`) in try/catch, log with tenantId/scheduleId, count failures, continue. Return `{…, failed}`.

**M2. GUARANTEED is reverted to OPEN by a capacity increase (hole in the spec's §4.4 SQL).**
- At `departures.ts:713-714`, FULL→(sold ≥ minPax ? GUARANTEED : OPEN).
- Interleaving:
  1. A departure is GUARANTEED, either by staff with sold 3 < minPax 8, or by the job with sold 8 followed by a refund that drops sold to 6.
  2. T0.4 sets FULL because sold+held+reserved = capacity.
  3. Staff raise capacity. The row becomes OPEN, breaking "GUARANTEED never reverts", and the min-pax job may then emit `below_min` for an already-confirmed trip.
- When minPax is null it always goes back to OPEN.
- Fix:
  - Use `CASE WHEN "guaranteedAt" IS NOT NULL OR ("minPax" IS NOT NULL AND "sold" >= "minPax") THEN 'GUARANTEED' ELSE 'OPEN' END`.
  - `casStatus` (:765) must clear `guaranteedAt` on a staff GUARANTEED→OPEN, so a deliberate revert still works.
  - T0.4 must use the same expression for FULL→X on release.
  - Record this as a controller ruling, because it deviates from the literal §4.4.

**M3. Inactive resources keep being assigned.**
- (a) `materializeCore` (:514, :548) never re-checks resource `active`/existence. `setResourceActive(false)` (resources.ts:375-382) only looks at existing uses, not `TripSchedule.resourceIds`. The daily job then keeps assigning a deactivated boat to every new day.
- (b) Race between `checkResources` (resources.ts:219-227, a plain read) and `setResourceActive`. Interleaving:
  1. T1 `assignResource` locks departure D and reads resource R as active.
  2. T2 `setResourceActive(R,false)` locks R FOR UPDATE. Its busy query cannot see T1's uncommitted use, so it finds none, sets inactive and commits.
  3. T1 inserts the use and commits.
  - Result: an inactive resource is attached to a future departure, and RESOURCE_IN_USE never fired.
- Fix:
  - In `checkResources`, lock the rows: `SELECT … FROM "TripResource" WHERE id = ANY(...) AND tenant/unit ORDER BY id FOR SHARE`. Order becomes departure(1a) → resource → uses, with no cycle, because `setResourceActive` locks no departure.
  - Call it inside `materializeCore` per run. Inactive or missing ⇒ skip the day and report it in `conflicts`, or return RESOURCE_INACTIVE.

**M4. Materialise does a whole horizon in one transaction and can time out every time.**
- `departures.ts:515-564` uses `TX_OPTS.timeout` of 60 s (resources.ts:148).
- Per day it runs about 8 + 6R statements. R = number of resources; there are two `findClash` per resource because the pre-check at :526-532 is repeated inside `assignUseTx`.
- At the default T8 of 90 days with 5 resources (racha) that is about 3,400 round trips. At T8 = 730 (registry max) it is about 28,000.
- On a remote DB this exceeds 60 s. The result is TX_TIMEOUT ⇒ BUSY, the **whole** schedule's batch is lost, and the same thing happens on every daily run, so the schedule never materialises.
- A 23505 in the middle of the batch is fine: the per-day savepoint loses only that day.
- Fix:
  - Commit in chunks, for example 14–31 days per transaction, each taking the advisory lock and recomputing `have`.
  - Drop the duplicate pre-check, or keep it and skip the one in `assignUseTx`.
  - Check `signal` between chunks.

**M5. The seed breaks once T0.2 is merged.**
- (a) Ordering. Both branches insert right after `const tickets = await ensureTickets(...)`. T0.2 creates the TRIPS unit and products there (T0.2 seed :314-318).
  - If the merge places the T0.3 block first, run 1 prints "⏭️ ยังไม่มีหน่วย" and creates nothing, so QC R-1…R-8 fail.
  - Run 2 then writes, which breaks the "seed รอบสอง ไม่มีการเขียน" (second seed run writes nothing) check.
  - The block must sit after `ensureTripProduct`.
  - After the merge, change the `return null` on a missing unit or product into a throw, and use `D.units.trips.id` instead of the hard-coded `TRIPS_SEED_TRIPS_UNIT_ID`.
- (b) Write oscillation.
  - T0.2's fixture declares the phiphi/deep3 options with `durationMin: null`, and its seed diffs `{durationMin: null}` against the current value and calls `updateOption` back to null.
  - T0.3 step 3 then sets 510/480 again.
  - So every run writes twice and the idempotency gate fails.
  - Fix at merge: put 510/480 into T0.2's `TRIPS_SEED_PRODUCTS` options (controller-approved fixture values, §12) and delete T0.3 step 3, or turn it into an assertion.
  - The `updateOption(ctx,{unitId, optionId, durationMin})` signature does exist in T0.2 and matches.

## MINOR

1. `updateSchedule` (:382, :412) reads the schedule outside the transaction and then runs an unconditional `updateMany` with all merged fields. Two concurrent edits lose one; for example, A's capacity change is overwritten by B's rule change. `setPaused` does not take the materialise advisory lock, so a pause that commits during materialise still gets that run's days. Fix: inside the transaction, take `pg_advisory_xact_lock(hashtext('trips-schedule:'||id))`, then `SELECT … FOR UPDATE` the schedule and merge from that; do the same in `setPaused`. `materializeCore` should re-read `pausedAt` after taking the lock.
2. Resource ids are not sorted in `materializeCore` (:514), `createDeparture` (:620) or `createSchedule`. Two concurrent materialisations with [R1,R2] and [R2,R1] can deadlock on the EXCLUDE waits. `inTx` retries once, then returns BUSY and the whole batch is lost. Sort the ids.
3. Min-pax job scale.
   - `runMinPaxCheck` groups over all future OPEN minPax departures every 15 minutes. No index covers `(status, startsAt)`.
   - `evaluateMinPaxCore` resolves settings for every future row of the unit, then opens a transaction and locks the departure row for every below-minimum row on every run until it starts. The outbox dedupes the event, but the lock and two queries repeat and contend with T0.4 sales.
   - Fix: pre-filter on the unlocked read (`sold >= minPax`, or the outbox key already exists ⇒ skip without a transaction), bound the query by a localDate upper limit, and add a partial index on `("startsAt") WHERE status='OPEN' AND "minPax" IS NOT NULL` (index requires a T0.1 follow-up; note it as debt).
4. `evaluateMinPax` run by staff audits OPEN→GUARANTEED with actorType USER, although the spec's §4.1 calls it a SYSTEM transition. Acceptable, but say so in the wo-notes.
5. `materializeCore` drops a day silently when the NND unique (`productId, optionId, startsAt`) collides with a manual departure (`SkipDay(null)`). Report it in `conflicts` with that departureId.
6. In `updateSchedule`, the mismatch check (:426) compares `utcToLocal(startsAt).minutes` with `departTimeMin`. On a DST-gap day the departure was shifted forward, so it is falsely reported as mismatched. Compare `localToUtc(tz, localDate, w.departTimeMin)` with `startsAt` instead.
7. Direct `new Date()` reads (all `updatedAt` metadata):
   - `updatedAt` in `moveUsesTx`/`releaseUsesTx` (resources.ts:263, :279) and `setDepartureCapacity` (:707).
   - No business decision uses them, but pass `now` through for consistency with §2.5.
8. `refreshDeparturePolicy` audit (:852) uses targetType "TripProduct" with `targetId = unitId` when productId is absent. Use "BusinessUnit" in that case.
9. For T0.4 (not a defect here):
   - CLOSED→OPEN and capacity cuts can leave an OPEN row with used = capacity (this WO never sets FULL), so T0.4 must treat available = 0 as unsellable whatever the status.
   - `saleBlockReason` needs `cutoffs` computed by the caller, using `cutoffsFor` with T6 at {unit, product, departure}.
   - `lockDeparture` is exported and gives T0.4 the 1a lock it needs.

## Checked and correct

- **Lock order** is departure (FOR UPDATE) → TripResourceUse (ORDER BY id FOR UPDATE) in `updateDeparture`, `cancelDeparture` and `unassignResource`.
- **Capacity edit** is a single conditional UPDATE under the row lock, so it serialises with T0.4 counter moves. The 0-row path maps correctly to NOT_FOUND / BAD_STATE / CAPACITY_BELOW_USED.
- **Cancel (X9)** is one CAS with the counter checks, NOT EXISTS hold, and NOT EXISTS booking.
- **Status transitions** match §4.1 exactly, including TRANSITIONS_BEFORE_START. FULL and CANCELLED are refused through `setDepartureStatus`.
- **EXCLUDE handling**: 23P01 under a savepoint is re-read into a Thai RESOURCE_CLASH message that names the product, date and time, never a 500. Ten parallel assigns ⇒ one succeeds.
- **Nested savepoints** with the reused name `trips_t03` behave correctly.
- **Materialise idempotency** (advisory lock, `have` set, partial unique index, per-day savepoint) holds.
- **Connections**: no second connection is opened while a transaction is held. `resolveSettings` and `policiesAt` all run before `inTx`; every in-transaction helper takes `tx`.
- **Tenant/unit scoping** is correct on every raw SQL statement and through `tenantDb`. Isolation is X1 NOT_FOUND. The actions overwrite `unitId` from `requireUnit` and check permission before calling the service.
- **No caller-controlled objects** reach `update({data})`.
- **Time**:
  - `localToUtc`/`utcToLocal` are correct for Bangkok and for DST zones (gap ⇒ forward, overlap ⇒ first).
  - Weekdays use `getUTCDay`, and there are no local-time getters.
  - Cut-off and decision times are clamped to `startsAt`.
  - The window is [max(dateFrom, today), min(dateTo+1, today+T8)).
  - The jobs' dateTo pre-filter is a safe superset.
- **Events**: the 4 events are registered in all 3 registries; the payload has exactly 6 keys with no personal data; the keys are as the spec says; each emit and audit runs in the same transaction.
- **Other**: zod `strictObject` everywhere, no `any`, no deletes, and `departures-core` stays pure.

## Builder decisions

The builder did not leave a separate decisions note; the commit message has none. These are the implicit choices I could see:

- **Agree**:
  - latest-channel `cutoffAt`;
  - `needsDecision` computed when read;
  - skip the day on a resource clash;
  - `pausedAt` as the pause flag;
  - `cancelReason`/`cancelledAt` columns;
  - `jobs.ts` as a read-only raw-prisma entry;
  - a locked transaction per row in `evaluateMinPaxCore`.
- **Disagree**:
  - product/option validation outside the transaction (B1);
  - a single transaction per whole window (M4);
  - seed step 3 relying on `updateOption` (M5b).
