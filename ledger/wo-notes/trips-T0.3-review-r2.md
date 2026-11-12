# T0.3 review, round 2: wip/trips-t0.3 @ 413e66e70 (diff against cdfa29102)

Verdict: **FIX FIRST**. One small MAJOR: the shared status expression is unsafe for T0.4. Everything else is closed or MINOR.

Read-only review. I did not build, typecheck, run tests or touch the database. Line numbers refer to the tree at 413e66e70.

## Status of round-1 findings

| # | Status | Evidence |
|---|---|---|
| B1 archived product / inactive option | **closed** | `sellableOptionInTx` (departures.ts:248) wraps T0.2's `assertProductSellableInTx`, which takes the product FOR SHARE and checks the option's active flag. It runs inside the transaction of `createSchedule`, `updateSchedule`, `createDeparture` and every materialisation chunk. The option row is not locked, but T0.2's `setOptionActive` and `archiveProduct` take the product FOR UPDATE first, so they serialise against our FOR SHARE. The `optionId === ""` → NOT_FOUND line is correct. |
| M1 one shop stops the jobs | **closed** | `jobs.ts` has try/catch per schedule and per unit, `evaluateMinPaxCore` has one per departure, and failures are collected in `failed[]` and logged once. |
| M2 GUARANTEED reverts on a capacity increase | **closed for T0.3** | The FULL branch keeps GUARANTEED when `guaranteedAt` is set. `casStatus` sets `guaranteedAt` on →GUARANTEED and clears it on staff →OPEN. My r1 interleaving now ends in GUARANTEED. See N1 for T0.4 reuse and N3 for CLOSED→OPEN. |
| M3 inactive resources | **closed** | `checkResources` and `lockResourcesShared` take FOR SHARE in id order. A chunk re-reads resources under lock and reports RESOURCE_INACTIVE per day. `setResourceActive(false)` refuses while unpaused, unfinished schedules still reference the resource. |
| M4 one transaction per whole window | **closed** | 31-day chunks, one committed transaction each, the schedule re-read under its lock, and `signal` checked between chunks. |
| M5 seed after the merge | **closed** | The block now runs after `ensureTripProduct` and uses `D.units.trips.id`. A missing product throws. The 510/480-minute durations are in T0.2's fixture, and the `updateOption` step is gone. |
| r1 MINOR 1 (lost update, pause race) | closed | `lockSchedule` (advisory lock + FOR UPDATE) in `updateSchedule` and `setPaused`, and the chunk re-checks `pausedAt`. |
| r1 MINOR 2 (unsorted ids) | closed | `sortedIds` is used everywhere. |
| r1 MINOR 3 (min-pax scale) | closed | Bounded window, per-product settings, below-minimum rows already emitted skip the transaction. Correctness of the window is checked below. |
| r1 MINOR 4, 6, 7, 8 | closed | Staff-run evaluation audited as SYSTEM with `requestedBy`; DST-gap compare uses `localToUtc`; `opts.now` used everywhere; audit target is BusinessUnit when there is no productId. |
| r1 MINOR 5 (duplicates not reported) | closed | Reported as DUPLICATE_DEPARTURE with the `departureId` it collided with. |

## New findings

**N1 MAJOR — the shared status expression is not safe for T0.4 with `setFull: true` (departures.ts:160-170).**
- The expression hard-codes `"sold" + "held" + "reserved"` and `"sold"`, and the docstring says these are the values before the UPDATE.
- In Postgres every SET expression sees the **old** row. T0.4 writes something like `UPDATE … SET "held" = "held" + $n, "status" = <expr>`.
- Example, using the expression as it stands:
  - Capacity 24, used 22, hold 2. The old used value of 22 is less than 24, so the status stays OPEN at 24/24 and FULL is never set.
  - Release from FULL 24/24 down to 20: the old used value of 24 is not less than 24, so the row stays FULL with 4 seats free.
- With `setFull: false` and unchanged counters, which is all T0.3 does, the expression is correct.
- Fix (about 10 lines):
  - Parameterise the expression: `departureStatusAfterCountersSql({ capacity, used, sold }, { setFull })`, where `used` and `sold` are the post-update expressions (for example `"held" + ${n} + "sold" + "reserved"`). Do the same in `departureGuaranteedAtAfterCountersSql`.
  - T0.3 passes the columns unchanged.
  - Add a pure unit table for (old, delta) → status.
  - Otherwise record "T0.4 must not reuse this as-is" in the wo-notes and the T0.4 brief.
- Side note, which follows the spec literally (the CAP-3 test) and is acceptable: FULL→GUARANTEED on `sold ≥ minPax` can guarantee a departure before its decision time. After that it never reverts, even if later refunds drop sold below the minimum. Record this as a ruling.

**N2 MINOR — `refreshDeparturePolicy` writes its audit row outside the transaction of the change (departures.ts:1129-1141).** The batched UPDATEs run on the pool connection, and the audit is written in a separate transaction afterwards. A crash in between leaves the change without an audit row. The impact is small because the UPDATE is an idempotent recalculation. Fix: run each batch and its audit row in one `inTx`.

**N3 MINOR (controller ruling) — CLOSED→OPEN clears `guaranteedAt` (casStatus :1036).**
- Sequence: the shop confirms a departure (GUARANTEED), closes bookings (CLOSED), then reopens. The reopen must go to OPEN, because CLOSED→GUARANTEED is forbidden, and the guarantee is lost.
- After the decision time this means `below_min` fires for a trip the shop had confirmed (sold < minPax), or a silent re-guarantee happens.
- Options:
  - (a) Clear `guaranteedAt` only on GUARANTEED→OPEN, and let the min-pax job immediately CAS OPEN→GUARANTEED when `guaranteedAt` is set.
  - (b) Allow CLOSED→GUARANTEED when `guaranteedAt` is set.
- This is a spec question, not a bug.

**N4 MINOR — `resumeSchedule` does not check the schedule's resources.** A schedule paused so that a resource could be deactivated (allowed by F) can be resumed. Every day then becomes a RESOURCE_INACTIVE conflict, and it is reported only in the job's or action's `conflicts`, never at resume time. Fix: run `checkResources` in `setPaused` when resuming, and return RESOURCE_INACTIVE.

**N5 MINOR — `materializeCore` reads `dateFrom`/`dateTo` once, outside the lock (:690, :707).** If `updateSchedule` extends `dateTo` during a run, this run stops at the old end; the next daily run catches up. Each chunk expands from the locked shape, so nothing wrong is created. Accept.

## Questions asked

- **Deadlocks between chunks, pause, `updateSchedule`, `createDeparture`, `setResourceActive`, `archiveProduct` and both jobs:** none found.
  - Every path takes locks in a subset of this order: product FOR SHARE → schedule advisory lock + FOR UPDATE → (departure FOR UPDATE) → resources FOR SHARE (id order) → resource uses.
  - `setPaused` skips the product step; `setResourceActive` locks only the resource and reads the rest without locks; `archiveProduct` and `setOptionActive` take the product FOR UPDATE first and only read below it; the min-pax job locks only the departure row.
  - Nothing locks the product after the schedule, and nothing upgrades its FOR SHARE.
  - The remaining cycle is the same as r1: EXCLUDE waits between a chunk inserting a resource use and `updateDeparture` moving one, mostly with multi-day ranges. Postgres detects it (40P01), `inTx` retries once, and a chunk that still fails is reported `incomplete`/`failed` with no partial writes.
- **Lost progress or duplicates when a chunk fails midway:** none.
  - A chunk is all-or-nothing, and earlier chunks stay committed.
  - The next run skips existing days via `have` and the unique `(scheduleId, localDate)` index.
  - A first-chunk failure returns a Fail; a later one returns `complete: false` with `stoppedBy`.
  - Accounting: `schedules` = complete; `incomplete` counts mid-run stops, and only non-benign reasons go into `failed` (ABORTED, HORIZON_OFF and PRODUCT_ARCHIVED are not failures); `skipped` = a benign Fail on the first chunk.
  - The read-only "chunk already complete" shortcut only applies after the first chunk. It ignores days skipped for inactive resources, so those chunks keep opening a transaction; that is wasteful but correct.
- **Min-pax window `localDate ∈ [today−1, today + decideDaysBefore + 1]`:** sound. Every quantity is in the shop's own zone.
  - `decisionAt = min(localToUtc(localDate − dDB, atMin), startsAt)`. When `decisionAt ≤ now`, the decision's local date is on or before today, so `localDate ≤ today + dDB`.
  - The +1 covers the DST and minute slack.
  - Lower bound: `startsAt > now` together with `startsAt` inside `localDate`'s day (moving a departure to another day is impossible) gives `localDate ≥ today − 1`.
  - Per-departure T7 overrides are picked up by the tenant-wide scan of DEPARTURE-scope SettingValue rows. The T7 chain is UNIT/PRODUCT/DEPARTURE and is fully covered by `productPolicies` plus that scan.
  - Liveaboards (dDB = 30) work.
  - A future-dated override (`effectiveFrom`) only adds candidates, never drops them.
- **Settings read before each chunk's transaction (deviation E):** acceptable. Values can be at most one chunk stale, and reading them inside the transaction would need a second pool connection. Write it down as debt: settings need a tx-aware resolve.
- **Debts the builder listed:**
  - Direct read of `SettingValue` through `tenantDb` (departures.ts:126-134, :1203). Tolerated, since dorm/policy.ts already does the same, but it couples the module to the settings table's internals (`scope`, `scopeId`, and it ignores `effectiveFrom`). It should become a settings facade function, for example `scopeIdsWithOverrides(tenantId, keys, scope, ids?)`. Record it as platform debt, not a T0.3 blocker.
  - `listDepartures` has no row cap. It is bounded at 62 days per unit, so it is fine for now; T1.2 should add a cap or pagination.
  - First materialisation of 730 days with resources takes about 135 s. That is fine for the job, but `materializeScheduleAction` runs it inside one server-action request, which risks a request timeout. Suggest capping the action to one or two chunks and returning `complete: false`, leaving the rest to the daily job.
