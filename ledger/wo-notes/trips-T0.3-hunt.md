# T0.3 hunt — departures / schedules / resources / jobs (RUN TRIPS)

- Tree: `/root/projects/shark-trips-l1` · branch `wip/trips-t0.3` · commit `cdfa29102`
- DB: lane QC `wo-trips-qc-l1` (host `ep-green-sound-aokclp5k`), reached only through `bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx <probe>`
- Probes (untracked): `scripts/probe-trips-t0.3-{lib,conc,mat,edge,scale}.mts`. All temp tenants, users and ids are prefixed `trips-hunt3-` and were cleaned up in `finally`; every run ended with `[cleanup] Tenant trips-hunt3-* เหลือ 0`.
- Probe runs: 8 in total. conc ×1, mat ×2, edge ×2, scale ×3 (`20`, `0 big`, `0 big skip730`).
- Each finding below was reproduced on the database unless it is marked "not reproduced" or "inferred".

## Verdict: **FIX FIRST**

There are 2 BLOCKERs:
- One shop can stop the cross-tenant jobs for every other shop.
- The min-pax job, `evaluateMinPax` and `refreshDeparturePolicy` crash at the departure volume the order itself plans for.

There are also 4 MAJORs: a materialise race, inactive options, inactive resources reaching departures through schedules, and a transaction timeout on long horizons.

---

## Findings

### B1 BLOCKER — one schedule or shop that throws aborts `runGenerateDepartures` (and `runMinPaxCheck`) for every tenant after it. A shop owner can trigger this through the API.

`jobs.ts` loops over the schedules and units with no try/catch, and the result has no failure field. Inside `materializeCore`, any error that is not `SkipDay` is re-thrown (`departures.ts:558`). `settingOf` throws on a malformed setting (`departures.ts:71`).

**Repro 1 — user input, no raw SQL.** `scripts/probe-trips-t0.3-scale.mts` (any argument; the `ovr` block):
- Shop `0ovr` calls `createSchedule` with `exceptions: [{date:"2027-01-03", action:"OVERRIDE", capacity: 2147483648}]` and gets `ok`. The T0.1 `COUNT` schema has no upper bound.
- `materializeSchedule` then throws the raw Prisma error and no rows are created.
- `runGenerateDepartures(now, {tenantIds:[0ovr, zgood]})` also throws, and the healthy tenant gets 0 departures.

```
[ovr createSchedule] ok materialize THROW PrismaClientKnownRequestError: Invalid `tx.tripDeparture.create()` invocation in …departures.ts:158:22 … rows []
[ovr job] {"THROW":"\nInvalid `tx.tripDeparture.create()` invocation in\n…departures.ts:158:22…"} good tenant rows 0
```

**Repro 2 — corrupt setting row.** `scripts/probe-trips-t0.3-mat.mts`, block 6b:
- A raw `SettingValue` row is written for tenant `0set` (minToDepart `{minPax:"x"}`, horizon `"ไม่ใช่ตัวเลข"`).
- Control: `resolveSettings` returns the broken value unvalidated.
- Control: the same job with that tenant excluded creates 6 rows.
- With the tenant included, the job throws and the healthy tenants `0tz` and `zok` get 0 rows. `runMinPaxCheck` throws the same way.

```
[6b control: job without broken tenant] {"ok":true,"r":{"schedules":4,"created":6}}
[6b runGenerateDepartures] {"THROW":"ค่าตั้ง trips.sell.minToDepart ผิดรูป"} {"rule":0,"dur":0,"set":0,"tz":0,"ok":0}
[6b runMinPaxCheck] {"THROW":"ค่าตั้ง trips.sell.minToDepart ผิดรูป"} ok tenant: []
```

- **Expected:** a broken tenant is skipped and reported; the others are still processed; nothing throws.
- **Actual:** the whole job aborts.
- What already behaves correctly: a schedule whose rule JSON is invalid returns `INVALID_INPUT`, and an option with no duration returns `NO_DURATION`. Neither crashes the loop.
- **Fix direction:**
  - Per-schedule and per-unit try/catch in `jobs.ts`, with a `failed[]` field in the result.
  - Bound the OVERRIDE `capacity`. Because that lives in a T0.1 schema, T0.3 should at least reject `capacity > int4` or `< 1` in `createSchedule`/`updateSchedule`.
  - Map the insert error to INVALID_INPUT.

### B2 BLOCKER — at about 20,000 future OPEN departures in one unit, `runMinPaxCheck`, `evaluateMinPax` and `refreshDeparturePolicy` throw "query parameter limit exceeded".

The cause is `policiesAt` → `resolveSettingsMany` with one `{unitId, productId, departureId}` ref per row (`departures.ts:236/841/891`). That becomes one settings query whose bind list grows with the number of rows.

**Repro:** `scripts/probe-trips-t0.3-scale.mts 0 big skip730`. It inserts 20,000 OPEN rows with `minPax 3` across 10 products in one unit as raw test data.

```
[big runMinPaxCheck 20k OPEN (few due)] {"THROW":"…Invalid `db.settingValue.findMany()` invocation in …settings/service.ts:458:25 … The query parameter limit supported by your database is exceeded.","ms":7587,"queries":3}
[big evaluateMinPax 20k] … THROW PrismaClientKnownRequestError: Invalid `db.settingValue.findMany()` …
[big refreshDeparturePolicy 20k] … THROW PrismaClientKnownRequestError: Invalid `db.settingValue.findMany()` …
[big listDepartures 62 days] {"ms":4838,"queries":7,"result":"{\"r\":\"ok\",\"n\":14790}"}
```

- The order's own scale scenario (300 schedules × 180 days, Mon/Wed/Fri) produces about 23,000 rows. Combined with B1, `trips.minPaxCheck` would stop for all tenants.
- `listDepartures` survived 14,790 rows, so the threshold lies between 14,790 and 20,000 rows. It also returned all 14,790 DTOs in a single 4.8 s call; the 62-day read has no row cap.
- **Fix direction:**
  - Resolve T6/T7 per distinct product, plus the departure-level overrides that actually exist, instead of one ref per departure. Or chunk the refs.
  - In `evaluateMinPaxCore`, filter to rows that are due before resolving per departure.

### M1 MAJOR — materialise reads the schedule and product outside the advisory lock, so a pause, a new SKIP exception, a time change or an archived product made while another materialise holds the lock is ignored.

`materializeCore` loads `s`, `productOption` and `policyAt` before `inTx` and `pg_advisory_xact_lock` (`departures.ts:498–516`), and never re-reads them under the lock. `pauseSchedule` and `updateSchedule` do not take the lock.

**Repro:** `scripts/probe-trips-t0.3-mat.mts`, block a2 (second run). The probe's own connection holds `pg_advisory_xact_lock(hashtext('trips-schedule:'||id))` to simulate a concurrent materialise or job on the same schedule. It then starts `materializeSchedule`, makes the edit, and releases the lock.

```
[a2 pause] {"edit":"ok","materialize":"ok","created":5,"rowsAfter":["2027-03-01@02:00Z",…,"2027-03-05@02:00Z"],"schedNow":{"paused":true,…}}
[a2 pause control (after edit, fresh call)] SCHEDULE_PAUSED(…)
[a2 skipException] {"edit":"ok","mismatched":[],"materialize":"ok","created":5,"rowsAfter":[…,"2027-03-03@02:00Z",…],"schedNow":{…"exceptions":[{"date":"2027-03-03","action":"SKIP"}]…}}
[a2 timeChange] {"edit":"ok","mismatched":[],"materialize":"ok","created":5,"rowsAfter":["2027-03-01@02:00Z",…],"schedNow":{…"departTimeMin":600}}
[a2 archiveProduct] {"edit":"ok","materialize":"ok","created":5,…}   control ⇒ PRODUCT_ARCHIVED
```

What goes wrong in each case:
- Departures are created after the pause has committed.
- A departure is created on a date that already has a SKIP exception.
- After a time change, the departures are created at the old 09:00, and the user was told `mismatched: []`.
- Departures are created for a product that is already archived.

In production the lock holder is the daily job, or a second click, while it works through a long batch (see M4: one schedule can hold the lock for 50–60 s).

**Fix:** re-read the schedule and the product/option under the advisory lock inside the tx. Optionally make pause/update take the same lock.

### M2 MAJOR — an inactive option (`TripOption.active = false`) is not refused anywhere (new requirement).

**Repro:** `scripts/probe-trips-t0.3-mat.mts`, block 7.

```
[7 parents] {"archived":{"createSchedule":"PRODUCT_ARCHIVED…","createDeparture":"PRODUCT_ARCHIVED…","materializeExisting":"PRODUCT_ARCHIVED…"},"optionInactive":{"createSchedule":"ok","createDeparture":"ok",…},"draft":{"createDeparture":"ok"}}
[7 option deactivated after schedule ⇒ materialize] ok 3
```

- **Expected:** a refusal for `createSchedule`, `createDeparture` and materialise (and therefore the job). There is no error code for this yet; maybe NOT_FOUND or a new one.
- **Actual:** all three succeed. 3 departures were created for a deactivated option.
- `productOption()` never selects `active` (`departures.ts:128`).

### M3 MAJOR — a resource deactivated after it was put on a schedule is still assigned by materialise.

- `setResourceActive(false)` only checks future `TripResourceUse` rows, not `TripSchedule.resourceIds`.
- `materializeCore` never calls `checkResources`, so new departures get active uses of an inactive boat.

**Repro:** `scripts/probe-trips-t0.3-conc.mts`, `res` section.

```
[res schedule w/ B5] ok deactivate B5: ok
[res materialize with inactive resource] ok {"created":3,"activeUsesOfInactiveB5":3}
```

- **Expected:** consistent with `createSchedule`, `createDeparture` and `assignResource`, which all return RESOURCE_INACTIVE. Either refuse the deactivation while a schedule still references the resource, or skip/report it in materialise.
- **Actual:** the inactive boat is booked on every future generated departure.

### M4 MAJOR — materialise runs one interactive tx for the whole window. Long horizons, or a moderate horizon with resources, exceed the 60 s tx timeout and return BUSY forever.

Every attempt rolls back everything, and the job counts the schedule as done (`isFail` is ignored).

**Repro:** `scripts/probe-trips-t0.3-scale.mts 0 big`.

```
[big materialize DAILY T8=730 resources=0] {"ms":52963,"queries":5852,"result":"{\"r\":\"ok\",\"created\":730}"}
[big materialize DAILY T8=730 resources=2] {"ms":60259,"queries":6006,"result":"{\"r\":\"BUSY(ระบบกำลังทำรายการเดียวกันอยู่ ลองใหม่อีกครั้ง)\",\"created\":null}"}
[big rows] 0
```

- T8 = 730 is the maximum the setting allows.
- Throughput: `scale 20` gave 1,540 departures in 120 s with 12,541 queries, about 8 queries and 78 ms per departure.

```
[scale runGenerateDepartures (N=20, T8=180)] {"ms":120016,"queries":12541,"result":"{\"schedules\":20,\"created\":1540}"}
[scale runGenerateDepartures again (idempotent)] {"ms":1835,"queries":201,…}
[scale refreshDeparturePolicy (all future rows change)] {"ms":14971,"queries":1548,"result":"\"ok\""}
```

- Cost is linear: about 8 queries per departure on the first run and about 10 per schedule on a re-run. Nothing quadratic was seen.
- **Inferred, not run:**
  - The first run of the order's 300-schedule × 180-day scenario would take about 30 min of job time.
  - `refreshDeparturePolicy` runs one tx with one UPDATE per row (about 10 ms/row). It hits the 60 s limit at about 6,000 changed rows, before B2's limit is reached.
- **Fix direction:** commit materialise in chunks (for example one tx per N days, still under the advisory lock), and batch the refresh UPDATEs.

### m1 MINOR — numeric and date overflow reaches the caller as a raw Prisma/Postgres error (throw) instead of INVALID_INPUT.

Zod `int()` lets anything up to 2^53 through, while the columns are int4 and the timestamps have a finite range.

**Repro:** `scripts/probe-trips-t0.3-edge.mts adv`.

```
⚠ cap 2^31: THROW PrismaClientKnownRequestError: Invalid `tx.tripDeparture.create()` …
⚠ minPax 2^31: THROW PrismaClientKnownRequestError …
⚠ dur 1e12: THROW PrismaClientValidationError …     (endsAt = Invalid Date)
⚠ setCap 2^31: THROW … Raw query failed. Code: `22003`. Message: `value "2147483648" is out of range for type integer`
⚠ update dur 1e13 / update minPax 2^31: THROW …
⚠ resource seats 2^31: THROW … ; ⚠ sched cap 2^31 / sched minPax 2^31: THROW …
```

- **Expected:** INVALID_INPUT. The contract says functions never throw except on a bug.
- **Fix:** add `.max(2147483647)` to the counts, and a sane upper bound on `durationMin`.

### m2 MINOR — materialise silently skips a date whose slot collides (NND) with an existing departure of the same product/option.

The date appears neither in `created` nor in `conflicts`, so the shop sees a hole with no reason given.

**Repro:**
- `mat` block b: a single departure exists on 2027-04-03 at 09:00 and the schedule runs at 09:00. The result is rows `2027-04-01, 04-02, 04-05`, and `conflicts` lists only the resource clash on 04-04.
- `edge` tz: the weekly Sunday 02:30 Berlin schedule skipped 2027-03-28 because a single departure already sat at that UTC instant.

### m3 MINOR — inputs that are accepted but make no business sense.

From `edge adv`:
- `minPax 50` with `capacity 5` returns `ok`. The departure can never reach GUARANTEED.
- `durationMin 2^31` returns `ok`, with `endsAt` around the year 6100.
- `localDate 9999-12-31` at 23:59 with 2 days' duration stores `endsAt +010000-01-02`.
- Option `durationMin 2147483647` returns `ok` for both `createDeparture` and `createSchedule`.
- A `DATES` rule with 20,000 entries (including duplicates) returns `ok` (no length cap).
- A JSON `__proto__` key is accepted with `ok`. It was not checked whether it changed anything; no prototype pollution was seen.

### Observations (no severity)

- **`opts.now` is not validated.** It is internal only; actions don't pass it.
  - An Invalid Date gives `ok`, because the PAST check compares against NaN.
  - A string throws `TypeError: now.getTime is not a function`.
- **`evaluateMinPax` and `runMinPaxCheck` report the same `belowMin` ids on every run.** The outbox event is still emitted only once, as specified.
- **Cancelling a departure that has already started returns `ok`.** Order §4 sets no time condition on cancel, so this matches the order.
- **OVERRIDE `capacity: 0` was not reproduced.** The schema accepts it, but in both attempts the row was either outside the window or rolled back by B1, so it is unclear whether a departure with capacity 0 gets created.

---

## What held

- **1. Concurrency** (`conc mix`, 6 rounds × 30 parallel mixed ops on one departure). The ops were capacity, status, stop-sell, time edits, assign/unassign, min-pax, guarded raw hold/sell/release and reads.
  - After every round: `sold+held+reserved ≤ capacity`, version monotonic, resource-use times equal to the departure's times, `cutoffAt` equal to the latest per-channel cutoff, and 0 overlapping active uses.
  - No raw error text and no throws. All raw counter UPDATEs succeeded.
  - 9 status changes, all legal for their actor, matched by 9 `status_changed` outbox rows.
  - Max latency was 940 ms, with no BUSY and no deadlock.
  - Limitation: lock_timeout was set only on the raw connections, not on Prisma's. "No deadlock" is therefore inferred from the 940 ms maximum latency and the absence of BUSY/40P01.
- **2. Materialisation.**
  - 10 parallel calls plus 2 jobs produced 30 rows for 30 distinct dates.
  - A resource clash on one date did not stop the rest of the batch.
  - A rule time change returned `mismatched` = 3, left existing rows (including one with counters) untouched, and new dates used the new time.
- **3. Time zones.**
  - Pure round-trip `localToUtc` ↔ `utcToLocal` over every minute of the DST transition days ±1 in 9 zones (Bangkok, Berlin, New York, Havana, Lord Howe, Santiago, Chatham, Tehran, Casablanca). Times in the spring-forward gap move forward by the size of the jump (60 min, or 30 at Lord Howe); a repeated time in autumn picks its first occurrence. The only "non-monotonic" flag is the expected step at the end of the gap.
  - On the database, Berlin and New York departures at 00:00, 00:30, 02:30 (gap and fold) and 23:59 all kept their `localDate`. The WEB cutoff "1 day before 18:00" was correct across midnight and DST (e.g. BER 03-29 00:30 gives 2027-03-28T16:00Z; NYC 11-08 00:30 gives 2027-11-07T23:00Z).
  - Changing 23:59 to 00:00 kept `localDate`.
  - `now` equal to `startsAt` gives PAST_DEPARTURE, and 1 ms earlier gives ok. Materialise at 23:59:59.999 versus 00:00 Bangkok gave the correct window.
  - An invalid tz falls back to Bangkok and does not crash.
- **4. Resources.**
  - Clash matrix: overlap, contained, identical, containing and same-product all give RESOURCE_CLASH; touching before or after gives ok.
  - The Thai message names the product title, date and time, and includes `conflict`.
  - An inactive use does not clash. Another unit's or another tenant's resource gives NOT_FOUND. A deactivated resource gives RESOURCE_INACTIVE. Deactivating a resource in use gives RESOURCE_IN_USE.
  - Moving into a clash returns RESOURCE_CLASH with the row byte-identical, minPax change included. Cancelling frees the resource, as the order says.
  - 10 parallel creates on one boat: 1 ok and 9 RESOURCE_CLASH, 1 row. 10 parallel moves into one slot: 1 ok and 9 RESOURCE_CLASH, 0 overlaps, 0 time mismatches.
- **5. State machine.**
  - 220 calls: 4 actors × 5 from-states × 5 target statuses × {future, past}, plus cancel from each state. 0 mismatches against order §4 (FORBIDDEN, FORBIDDEN_TRANSITION, BAD_STATE, PAST_DEPARTURE).
  - 6 parallel `evaluateMinPax` plus 3 `runMinPaxCheck` gave exactly 1 `status_changed` for the departure that reached minimum and 1 `below_min` for the one that didn't. The audit shows `actorType SYSTEM` with `actorId null`.
  - GUARANTEED stays after sold drops to 0. A departure that reaches the minimum later becomes GUARANTEED on the next evaluation.
- **6. Isolation.** All 22 service functions were tried in 7 scenarios: B ctx with A's unit; B's unit with A's ids; A's owner with unit 2 and unit-1 ids; staff limited to unit 2; A's user under tenant B; mixed B departure with A resource; mixed A departure with B resource.
  - Everything addressing A's rows returned `NOT_FOUND(ไม่พบรายการ)`. Lists returned no A rows.
  - A hash of A-unit rows plus outbox/audit counts was unchanged.
  - Cross-tenant `resourceIds` in createSchedule/updateSchedule gave NOT_FOUND.
  - A BOOKING unit gives UNIT_NOT_TRIPS for its own tenant and NOT_FOUND for another tenant.
- **7.** An ARCHIVED product is refused for createSchedule, createDeparture and materialise, but see the M1 race. DRAFT is allowed. An option of another product gives NOT_FOUND.
- **9.** NaN, negative, string, Infinity, extra/constructor keys, bad dates, null/array/string input, an object unitId, a null ctx and bad enums all give INVALID_INPUT or NOT_FOUND. Duration 0 is INVALID_INPUT as input, and an option with duration 0 or 0 nights gives NO_DURATION, not a CHECK error. The 62- vs 63-day list limit is correct.
