# HUNT — T0.1 (RUN TRIPS) · lane `/root/projects/shark-trips-l1` · commit 26b601500 · 12 Nov 2026

The only DB used was lane QC `ep-green-sound-aokclp5k` (qc-trips), always through `iso.sh → qc-trips.sh → with-gate-lock.sh`. All writes went to temp tenants `trips-hunt-*`, which were cleaned up in `finally`. Each run ended with "Tenant trips-hunt-* left 0". I made 9 probe runs in total (two of them failed early on bugs in my probes and were fixed and re-run). No tracked file was modified.

Probes (untracked, in `scripts/`):
`probe-trips-t0.1-lib.mts` (helpers) · `-pure.mts` (tour rules, registry, defaults; no DB writes) · `-settings.mts` (write path on the real DB) · `-db.mts` (tenantDb on 33 models, CHECK/unique/EXCLUDE, SellCounter) · `-scale.mts`, `-scale2.mts` (many departures)

---

## Findings

### MAJOR-1 — The unit settings page, settingsDiff and "reset to template (RESET_ALL)" crash once a unit has more than about 16,380 products + departures
- **Cause:** T0.1 adds `tripProduct` and `tripDeparture` (**every status, past ones included**) to `entitiesOfUnit`. Callers pass every entity as an `OR: [{scope, scopeId}, …]` (2 bind parameters each), so the query goes over Postgres's 32,767-parameter limit. Departures grow without bound over time; for example, 10 options × 4 rounds a day × 365 days = 14,600 a year.
- **Callsites that break:** `settingsDiff` (service.ts:485), `loadSettingsForm` at the UNIT level (form.ts:184 via `deeperPairs`), `loadSettingsForm` at the PRODUCT level (when one product has about 16k departures), and `applyTemplate` RESET_ALL (service.ts:1167, inside the tx). `setSettings` is not affected (67–128 ms).
- **Repro:** `probe-trips-t0.1-scale.mts`, `probe-trips-t0.1-scale2.mts`
  ```
  [N=16300 settingsDiff] 1851ms ok len 0
  [N=16300 form UNIT] 1884ms ok
  [N=16450 settingsDiff] 1435ms THROW … → 485 prisma.settingValue.findMany( The query parameter limit supported by your database is exceeded.
  [N=16450 form UNIT] 1668ms THROW … → 184 ? prisma.settingValue.findMany( The query parameter limit supported by your database is exceeded.
  [R1 applyTemplate RESET_ALL] 2581ms · THROW Invalid `tx.settingValue.findMany()` … service.ts:1167
  [R1 SettingValue left after RESET_ALL] 52      ← reset did not happen
  [R2 entitiesOfUnit] 137ms · len 40001 · settingsDiff 4035ms THROW · form PRODUCT 5194ms THROW
  ```
- **Expected:** the settings page and reset keep working for a long-lived unit. **Actual:** they throw at about 16.4k entities, and latency is already about 2 s at 16k.
- **Possible fix direction (for whoever fixes it):** do not enumerate departures as pairs. Read SettingValue by `scope='DEPARTURE'` and filter by unit with a subquery or join, or only include departures that still have rows. Also consider excluding closed or past departures.

### MINOR-2 — W03 is not re-checked at deeper levels when the deposit changes at UNIT
- **Repro:** in `probe-trips-t0.1-settings.mts` (F), product pF has the ladder `[30→50, 0→0]` saved with ack while the UNIT deposit is 0. Changing `trips.pay.depositPct` at UNIT from 0 to 30 then **saves with no warning**, even though pF now meets W03 (W01 condition + deposit > 0).
  ```
  [F0 ladder bad @PRODUCT (deposit 0)] NEEDS_APPROVAL trips.cancel.ladder:W01/HIGH
  [F1 deposit UNIT 0→30 (no ack) — W03 for pF?] ok
  [F1b deposit PRODUCT pF 30 (no ack)] NEEDS_APPROVAL trips.pay.depositPct:W01/HIGH,trips.pay.depositPct:W03/NORMAL
  ```
- F1b also shows noise: changing the deposit at PRODUCT re-raises **W01**, attached to the key `depositPct`, which is not the key that warning is about.
- This is the same pattern as rental "fix 6": dependents are only checked in the context of the change itself. The pattern predates T0.1, but this is the first time it matters for a tour rule.

### MINOR-3 — W38 (waiver liability exclusion) can be bypassed with invisible or fullwidth characters
- **Repro:** `-pure.mts` [3-W38] and `-settings.mts` C7.
  ```
  [3-W38] control=WARN · ZWSP=OK · ZWJ=OK · soft-hyphen-en=OK · fullwidth-en=OK · en-dash-nbsp=WARN · thai-sara-am-decomposed=WARN · mai-ek-order=WARN · synonym=OK
  [C7 waiver ZWSP (no warn?)] ok
  ```
- `normalizeText` only strips `\s` and lowercases; it does not remove U+200B/200D/00AD and does not apply NFKC. Expected: WARN. Actual: OK, and the value saves with no warning. W38 is advisory only.

### MINOR-4 — W29 can be silenced permanently by putting `confirmedAt` in the future
- **Repro:** `-settings.mts` C6: `parkFee.table` with `confirmedAt: "2099-01-01"` gives `ok` with no warning. The stale-after-180-days warning will then never fire. Expected: refuse or WARN when `confirmedAt` is after today.

### MINOR-5 — Schemas accept values whose meaning is inverted or ambiguous, with no group rule and no warning
- **Repro:** `-settings.mts` (real save path):
  ```
  [C3 childAgeBand inverted] ok        {infantBelow:20, childFrom:4, childTo:2}
  [C4 minorConsent inverted] ok        {parentOnlyAtOrBelow:25, minorBelow:5}   (PDPA consent logic inverted)
  [C5 fx.rates duplicate USD] ok       [{USD,1},{USD,99000000}]
  ```
- `-pure.mts` [5-edge] also shows that `parkFee.ageBands` with inverted values passes the schema; it is only caught as W30.

### MINOR-6 — `effectiveFrom` outside Postgres's range throws a raw DB error instead of VALIDATION (engine bug that predates T0.1)
- **Repro:** `-settings.mts` C2 on `trips.fx.rates`, which is effectiveDated:
  ```
  [C2 effectiveFrom min-date] THROW time zone displacement out of range: "-271821-04-20 00:00:00"
  [C2 effectiveFrom year0] THROW date/time field value out of range: "0000-01-01 00:00:00"
  [C2 effectiveFrom bc] THROW time zone displacement out of range: "-5012-08-18 00:00:00"
  ```
- `draftOne` only checks for NaN. This was not changed in T0.1, but it is now reachable through 6 new effectiveDated keys (T35 T45 T46 T49 T51 X5). It would surface as a 500 instead of a VALIDATION message.

### MINOR-7 — `tenantDb` does not filter `tenantId`/`unitId` out of `update` data, so a row can be moved into another tenant (core/db.ts behaviour that predates T0.1, now on all 33 new models)
- **Repro:** `-db.mts` 1c: a `tenantDb({tenantId:B, unitId:uB})` client updated its own TripPdpaRequest with `data:{tenantId:A, unitId:uA}`:
  ```
  [1c B updates own row data.tenantId=A] no error [{"now_in_a":true}]
  ```
- `create` is safe: the filter overrides it (`[1b …] is_b:true is_ub:true`). `update`/`updateMany`/`upsert.update` are not. Any later trips callsite that spreads user input into `data` gets a cross-tenant write.

### MINOR-8 — DB constraints the brief does not require, but which leave room for bad data
- **Repro:** `-db.mts` [3a] [3c] [2a]:
  ```
  [3a EXCLUDE] {"base":"ok","overlap":"23P01","touching":"ok","contained":"23P01","emptyRangeInside":"ok","inverted":"22000","otherTenantSameResource":"23P01"}
  [3c TripDeparture] {"endsBeforeStart":"ok","soldGtCapacity":"ok"(by ruling §7.16),"localDateMismatch":"ok",…}
  [2a int cols without >=0 CHECK] TripBooking.fxRateMicros, TripResource.seats, TripSchedule.minPax, TripDeparture.minPax, TripPassenger.diveCount, TripPaxType.ageMin/ageMax, TripOption.durationMin/nights, TripPickupZone.pickupOffsetMin, … (sortOrder/priority/weekdayMask)
  ```
- **Zero-length range:** a TripResourceUse with `[s,s)` always passes the EXCLUDE constraint.
- **Inverted range:** gives error 22000, not 23514.
- **Cross-tenant collision:** EXCLUDE is keyed on `resourceId` only, without tenantId, so the same `resourceId` in another tenant collides. With loose ids and no FK (§7.21), a later WO must check that the resource belongs to the tenant, or one tenant could block another tenant's resource.
- **TripDeparture:** `endsAt < startsAt` is accepted, and so is a `localDate` unrelated to `startsAt`.
- None of these is required by the brief; these are notes for the reviewer and for T0.3/L1.x.

### MINOR-9 — An extra partial unique index that is not in brief §2.3 or CC §B.0
- `TripDeparture_scheduleId_localDate_key ("scheduleId","localDate") WHERE scheduleId IS NOT NULL` is in the migration (the prisma comment says "1 departure per day · T0.3"). The contract does not list it.
- **Behaviour** (`-db.mts` 3c): `schedSameDay1: ok · schedSameDay2_otherTime: 23505`. One schedule cannot have two departures on the same day, even at different times.
- Today a schedule has a single `departTimeMin`, so this may well be intended. The controller should confirm it, because it is a deviation from the list in §2.3.

### Question for the controller (not a defect) — a MANAGER's mixed rooms + trips batch goes to owner approval together
- **Repro:** `-settings.mts` B4/B5:
  ```
  [B4 MGR mix ret+ladder ack (policy)] NEEDS_APPROVAL rooms.deposit.returnDays:DEPOSIT_RETURN_DAYS,trips.cancel.ladder:W01/HIGH,trips.cancel.ladder:W03/NORMAL approval=…
  [B4b MGR ladder only ack] ok
  [B5 after owner approve] [{rooms… WARN DEPOSIT_RETURN_DAYS},{trips.cancel.ladder WARN W01 reason null}]
  ```
- The tour change waits for the owner only because it shares an atomic batch with a rental warning. Saved on its own, it goes through immediately.
- Brief §6 says "no owner-approval chain for tour warnings". The controller should rule whether this case counts.

### Observations (not reproduced as defects)
- **`resolveSetting` trusts the refs it is given.** If a departure moves to another product and the caller passes stale `{productId:p1, departureId:d1}`, it gets p1's value (`[D3b] 40/PRODUCT`, while `refsFor` gives 20 correctly). T1.x callers must use `refsFor` or snapshot by entity.
- **A departure can point at a product in another unit of the same tenant, because there is no FK.** Resolving then takes the product value from the other unit (`[D4] value 33`), and STAFF of the departure's unit can write DEPARTURE-level values for it (`[D4b] ok`). This is a data-integrity question for later WOs.

---

## What held (tried, nothing found)
- **Rental regression on the real DB:**
  - STRICT ret=60 → LEGAL_BLOCK; threat template → LEGAL_BLOCK in both STRICT and WARN.
  - WARN mode: no ack → NEEDS_APPROVAL; ack without a reason or with a short reason → REASON_REQUIRED; owner ack + reason of 10+ characters → ok (WARN · code · reason).
  - MANAGER with no policy → NEEDS_APPROVAL + OWNER_MUST_APPROVE (A1–A8).
- **Leak direction:** a mixed batch does not relax rental rules.
  - B1: only the rooms key gets REASON_REQUIRED.
  - B2: threat + ladder → LEGAL_BLOCK for the whole batch.
  - B3: STRICT + ladder → LEGAL_BLOCK.
  - The registry refuses a domain that does not match the key prefix, rental rules in trips/agency, a tour rule in rooms, and an unknown rule id (with a zero-width suffix) ([6-registry]). Domain and scope cannot be forged from setSettings.
- **"Never BLOCK":**
  - Fuzzing 2,650 calls (46 rules + unknown ids × adversarial inputs: NaN/Inf/1e15/symbol/bigint/Proxy that throws/5,000-deep nesting/`__proto__`) gave no throw and only OK or WARN.
  - 154 adversarial values × 14 legal keys through the real `setSettings` all gave `VALIDATION INVALID_VALUE`: no THROW, no LEGAL_BLOCK, nothing saved.
  - `__proto__` in `perChannel` is dropped (`{}`), so there is no prototype pollution.
- **W01 against an independent reference formula:** 20,000 random ladders, 0 differences.
- **Template defaults:** 104 keys × {DIVE_SHOP, DAY_TOUR, LIVEABOARD, ATTRACTION, _fallback}. Every value passes its own schema, and every group rule passes. **No warning fires at the defaults** (including W03 via depositPct). Age bands are in order.
- **Scope:**
  - A key whose chain does not include the scope → SCOPE_NOT_ALLOWED (fx.rateSource@PRODUCT, cabinSharing@PRODUCT, BAL@TENANT).
  - VESSEL/AGENT → SCOPE_UNSUPPORTED or NOT_ALLOWED.
  - A missing id, a departure id passed as a product, or another tenant's product → NOT_FOUND.
  - Another tenant's product can neither be reset nor read.
  - A tenant-A departure that references a tenant-B product resolves to FALLBACK, so there is no leak.
  - Reset at each level works.
  - A departure whose product changed resolves correctly through `refsFor`.
- **20 parallel saves of the same key and scope:** 20/20 ok, 1 row, final value 120, 20 SettingChange rows forming a single before→after chain with no fork and no lost update.
- **tenantDb on all 33 models:**
  - Through tenant B and through tenant A's other unit: count, findMany, findFirst, findUnique (including `select id`), aggregate, updateMany, deleteMany, update, delete and upsert neither leak nor change the row.
  - A unit-scoped model called without `unitId` throws.
  - `create` forces the client's tenantId and unitId.
- **Constraints:**
  - Ranges: overlap/contained → 23P01; touching `[)` → ok; activating an inactive row that overlaps → 23P01.
  - NULLS NOT DISTINCT unique: all-null dims on TripPrice, NULL linkId on TripLinkStat, NULL optionId on TripDeparture → 23505; different options at the same time → ok.
  - Values: capacity 0 and price 0 → ok; capacity/price/seq < 0 → 23514; bad channel → 23514.
- **SellCounter:** 200 parallel inserts (2 tenants × 3 series × 2 periods, with the new period's first row racing) completed in 1,385 ms with 0 failures, 0 gaps and 0 duplicates per key, row seq equal to the count, and correct tenant isolation. Negative seq → 23514; going past int4 → 22003.

## Verdict: **FIX FIRST** (MAJOR-1)
MAJOR-1 is a scaling defect introduced by this WO: `entitiesOfUnit` now enumerates every departure without bound. It will break the settings page and reset for a long-lived unit, and is small to fix. If the controller would rather merge and log it as a mandatory fix before T0.3 starts generating departures, it should at least be recorded as a blocking item for T0.3.

MINOR-2 to MINOR-9 can be tracked. MINOR-6 and MINOR-7 come from engine code that predates T0.1.
