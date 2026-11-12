# T0.1 re-review r2: `git diff 26b601500 fd5eeb297 -- prisma src`

Read-only. Nothing was run (no build, typecheck, tests or database). Line numbers refer to the files at fd5eeb297.

## Verdict: **MERGE**

- All 4 MAJOR findings are closed.
- 11 of my 14 MINOR findings are closed.
- The builder's two refusals and the remaining debts are acceptable.
- I found no regression in the existing domains. The only change they see in normal use is the row order of `settingsDiff` output (R2-1 below).
- The new MINOR findings below can be fixed in this lane before merge, or carried as notes. None of them is a migration hazard.

---

## 1. Status of my r1 findings

| # | Finding | Status | Where |
|---|---|---|---|
| MAJOR-1 | TripPrice NND key | **Closed** | migration.sql: `TripPrice_dims_key` now adds `weekdayMask, bookFrom, travelFrom` (NULLS NOT DISTINCT). A null mask still means one "all days" row. `bookTo`/`travelTo` are left out on purpose. trips.prisma documents it. |
| MAJOR-2 | Hot-path indexes | **Closed** | Partial index `TripHold_capKeyHash_active_idx`; `@@unique` on `TripPaymentDue.payTokenHash` and `SellBasket.publicTokenHash` (default NULLS DISTINCT, so many NULLs are allowed, as intended); `TripUnit(holdId)`; `TripMoneyEvent(postingStatus,nextAttemptAt)`; `TripDocument(passengerId)`; `TripRefundRequest(bookingId)`. |
| MAJOR-3 | Idempotency columns | **Closed** | `TripRefundRequest.idempotencyKey`/`requestHash` with `@@unique([tenantId, idempotencyKey])` (NULL rows exempt, correct for refunds created outside cancel-EXECUTE). `SellBasket.requestHash`. Both are nullable, so T0.6 must always fill them on its paths. |
| MAJOR-4 | `entitiesOfUnit` loading every departure | **Closed** | service.ts `tripEntitiesWithRows`: starts from SettingValue rows of PRODUCT/DEPARTURE, then confirms tenant, unit and product in batches of 5,000. `settingRowsForPairs` splits the OR into batches of 2,000. It is wired into the form (`deeperPairs` PRODUCT + deep rows), `settingsDiff`, RESET_ALL and `checkBatch` extra rows. |
| m1 | Sanity CHECKs | **Closed** | `TripDeparture_times_check`, `TripResourceUse_times_check`, `TripSeason_dates_check`, `TripSchedule_dates_check`, `departTimeMin` 0–1439, `weekdayMask` 0–127, plus extra `>= 0` checks. |
| m2 | Prisma drift note | **Closed** | trips.prisma header: `migrate diff` always proposes DROP for the 3 NND uniques, and those lines must be removed. Partial/EXCLUDE/CHECK were verified on 12 Nov. |
| m3 | W26/W29 runtime, variants, W45 | **Closed** | th-tour-2569.ts: SETTINGS rules also accept `{hit, vars, variant}`, using `TOUR_RULE_VARIANTS` (W26, W28, W29 ×3, W33, W45 LA). An unknown variant gives `INVALID_INPUT_WARN`. |
| m4 | Clock-dependent registry check | **Closed** | `skipTimeDependent` is passed only from registry.ts:218. The service passes `{ now }`. |
| m5 | Single `legalCode` | **Refused, accepted** | See §4. |
| m6 | HIGHEST acknowledgement only in the client | Open, acceptable | W22 is RUNTIME-only, so it never reaches this form. Revisit in T1.x. |
| m7 | PHASE_2 / credit writable | **Closed** | `draftOne` refuses `hiddenUntil === "PHASE_2"` (`NOT_YET_AVAILABLE`). The `cancel` GroupRule gives `CREDIT_NOT_YET_AVAILABLE` for T22 `CREDIT` and for T23 `CUSTOMER_CHOOSES_MONEY_OR_CREDIT`. |
| m8 | Money keys under edit permission | **Closed** | Per-row `sensitivity: "MONEY"` on `autoApproveUpTo`, `manualEditApprovalSatang` and `fx.rates`. |
| m9 | json-schemas gaps | **Closed** | Exactly one of bp or minor is required; BLACKOUT `from <= to`; PROMO `validFrom <= validTo`; exception dates must be unique; exception `minPax >= 1`. |
| m10 | `{…}` placeholders | **Closed** | `fill` replaces any missing var with "—". |
| m11 | Lock queue on AccountDocument | **Closed** | `SET lock_timeout = '5s'` before the ALTER, `RESET` after. See R2-2 for a refinement. |
| m12 | TripPassenger CHECKs | **Closed (recorded)** | trips.prisma notes that zod validates them at app level in T0.8. |
| m13 | `unitTypes` only filters the form | Debt, accepted | See §4. |
| m14 | Duplicated domain list | **Refused, accepted** | See §4. |

---

## 2. Migration: every changed line

- **Still add-only.** No DROP, RENAME, ALTER COLUMN, UPDATE, DELETE or FK. The only existing table touched is still `AccountDocument`: one ADD COLUMN with DEFAULT 0, metadata-only, no backfill.
- **Lock timeout.** `SET lock_timeout` is applied only around that ALTER and then RESET. Correct.
- **New columns and tables.**
  - `TripPromoRedemption` is registered in scope.ts as `unit` (34 models in total).
  - New CHECKs: `TripWaitlist.channel` against `SELL_CHANNELS`; `TripPromoRedemption.status`; `usedCount >= 0`.
- **Capacity CHECK `sold + held + reserved <= capacity`.** This is compatible with every writer in the orders:
  - Every CC §D.1 statement guards either `… + n <= capacity` or a `>= n` condition on the counter it decrements. The paired moves are single statements: (2) held+n / reserved−n, and (5b) sold−n / reserved+n.
  - T0.4 `moveSold` and `reserveSeatsInTx` guard the destination with `<= capacity`.
  - T0.3 `setDepartureCapacity` (T0.3.md:114) has `"sold"+"held"+"reserved" <= $c` in its WHERE, so a capacity cut below what is used gives 0 rows (`CAPACITY_BELOW_USED`), not a 23514 error.
  - Departures are created with all counters at 0.
- **`endsAt > startsAt`.** Valid for T0.3 as long as the duration is above 0. See R2-3 for the one gap.
- **`weekdayMask` 0–127.** Matches T0.5 (bit 0 = Sunday … bit 6 = Saturday).
- **Partial uniques.**
  - `TripWaitlist(departureId, partyId) WHERE status IN ('WAITING','OFFERED')`: NULL `partyId` rows are not constrained. That is fine because T0.4 `joinWaitlist` requires `partyId`.
  - `TripPriceRule(unitId, lower(code)) WHERE code IS NOT NULL AND active`: the code becomes reusable once the rule is deactivated, which matches T0.5. The app must keep the `code` column in sync with `params.code`.
- **Prisma-declared uniques with NULLs** (`payTokenHash`, `publicTokenHash`, `TripRefundRequest(tenantId, idempotencyKey)`, `TripPromoRedemption(ruleId, bookingId)`) use PG's default NULLS DISTINCT, which is the intended behaviour.

## 3. Settings engine: existing domains

- **`entitiesOfUnit`.** For a HOTEL, DORM or BOOKING unit, the trips part now runs one `settingValue` query (tenant + `scope IN (PRODUCT, DEPARTURE)`). Any ids it finds are checked against `tripProduct`/`tripDeparture` with `unitId = <this unit>`, which returns nothing for these units. The returned list is therefore identical to before.
- **`settingRowsForPairs`.** Same `where`, same `select`, same result set. Empty pair lists never reach it: callers always include UNIT or check the length first. A unit with more than 2,000 pairs now runs several queries, but the result set is the same.
- **`settingsDiff` order changed.** The DB `orderBy` was replaced by a JavaScript sort, which compares UTF-16 code units, not the database collation. This is R2-1.
- **RESET_ALL.** Same rows, same filters. Its `lockAll` and `appendChanges` order was never defined by an `orderBy`, so nothing changes there.
- **Form.** The deeper-rows count is unchanged.
- **`effectiveFrom` validation (shared).** Dates in years 1–9999 behave exactly as before. Years below 1 or above 9999 now return `INVALID_EFFECTIVE_FROM` (VALIDATION) instead of a raw database error. Only trips, agency and ticket get the narrower 2000–2100 range, and 1970 (the EPOCH sentinel) is always allowed. This is a behaviour change only on inputs that used to crash, which is acceptable.
- **PHASE_2 refusal.** Matches `=== "PHASE_2"` only. `PHASE_H` and `RETIRED` behave as before.
- **W03 cross-level check.**
  - The new `deepClauses` loop and the before/after dependent check only run when `isTourLegalDomain(d.domain)`. The rental dependent path is unchanged.
  - Side effect: the extra deep rows feed the shared `deepCtx`. See R2-4.
- **`skipTimeDependent`.** Only the registry passes it, and only W29 reads it.

---

## New MINOR findings (r2)

- **R2-1 · `settingsDiff` row order is no longer the database order** (service.ts, `settingsDiff`).
  - The JavaScript `<` comparison on `key` and `scope` can order camelCase keys and `.`/`_` differently from a non-C collation. The result set is identical. QC r0.3 X-5 uses `find` and does not depend on order.
  - Fix, to keep the output byte-identical for existing domains: pass `orderBy` into each batch query and only merge-sort when there is more than one batch.
- **R2-2 · Migration lock hold and failure recovery.** If Prisma applies the file inside one transaction, the ACCESS EXCLUSIVE lock on `AccountDocument` is held until the whole file commits. That is short, because every other statement works on new empty tables.
  - Optional: move the ALTER (with its SET/RESET) to the end of the file.
  - Add to the deploy runbook: if the 5-second timeout fires, the migration is recorded as failed and needs `prisma migrate resolve --rolled-back 20270201000100_trips` before a retry.
- **R2-3 · Zero-duration departure turns into a raw CHECK error in T0.3** (cross-order note).
  - T0.2 allows an option with `nights: 0` and `durationMin: null`.
  - T0.3.md:112 computes the duration as `durationMin ?? nights×1440`, which gives 0, and its `NO_DURATION` check only fires when both are null. The insert then fails `TripDeparture_times_check` with a raw 23514 error.
  - Fix in the T0.3 order: treat a duration ≤ 0 as `NO_DURATION`. Alternatively, T0.2 should reject that option.
- **R2-4 · Tour-dependent deep contexts can leak into rental group-rule checks.** The new tour-dependent `deepClauses` put trips PRODUCT/DEPARTURE contexts into the shared `deepCtx`.
  - When a single batch changes a TENANT-scope rooms or booking key (one with group rules) **and** a trips source key such as `trips.pay.depositPct`, step 5 also evaluates the rental group rules at those trips contexts (`k.TENANT === tenantId`).
  - The values resolve to tenant or fallback values, so a new failure is very unlikely. It is still not byte-identical for that mixed case.
  - Fix: keep the tour-dependent contexts in a separate map, used only by the dependent loop.
- **R2-5 · `PARK_SCHEMA` reads the clock.** `confirmedAt` now refines against `bkkTodayYmd()` (`Date.now()` in a "pure" defs file). It works, because stored dates only get older. Two side effects: the zod schema is now time-dependent, and the W29 `FUTURE_DATE` variant can no longer be reached from the settings path. Acceptable; it could also be left to W29 alone.
- **R2-6 · EXCLUDE without `tenantId`** (builder debt). `resourceId` is a cuid, and T0.3 rejects resources outside the unit (`NOT_FOUND`), so it cannot collide across tenants unless application code writes a foreign `resourceId`. Adding `"tenantId" WITH =` would cost nothing as defence in depth. Optional.

## 4. Builder refusals and debts

- **Single `legalCode`: agree.** The full code list is still returned in the issues, and the audit and approval `codes` record all of them.
- **Duplicated domain list in settings-shared.ts: agree.** If the two lists drift, the form errs on the safe side and asks for a reason.
- **`unitTypes` filtered only in the form: accepted debt.** Yes, a user with `trips.settings.edit` on a HOTEL unit can write a `trips.*` UNIT row through the API.
  - No code reads trips keys for non-TRIPS units, so the row is inert.
  - PRODUCT and DEPARTURE scopes still need a trip entity in that unit, so they fail with `NOT_FOUND`.
  - Same pre-existing behaviour as HOTEL/DORM keys. Enforce it in `checkShape` later if wanted.
- **EXCLUDE keyed on `resourceId` without `tenantId`: accepted.** See R2-6.
