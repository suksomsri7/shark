# T0.1 independent review — commit 26b601500 (prisma + src only)

Read-only review. I ran no build, typecheck, tests or database commands. Everything below comes from reading the code and the spec documents. Line numbers refer to the files in the tree at 26b601500.

## Verdict: **FIX FIRST** (0 BLOCKER · 4 MAJOR · 14 MINOR)

- The shared settings engine is safe. I found nothing that changes how the dormitory, hotel or booking domains behave.
- Before production, the migration should also carry several columns and indexes. The later T0.x orders cannot add them: brief §8 allows no migration outside T0.1/A1.1/K1.1/L1.1. These are MAJOR-2 and MAJOR-3. MAJOR-1 is a design limit that comes from the contract itself and needs a controller ruling now.

---

## MAJOR

**MAJOR-1 · `TripPrice_dims_key` blocks weekday/weekend prices and booking/travel windows**
- Where: migration.sql:978, trips.prisma:255.
- Why: the NULLS NOT DISTINCT key is `(productId, optionId, paxTypeId, cabinTypeId, seasonId, departureId, currency)`. CC §F.1 step 2 resolves by season plus `weekdayMask` plus booking/travel ranges. With this key, two rows for the same product, option, pax type and season cannot differ only by `weekdayMask` (weekday vs weekend price) or by `bookFrom`/`travelFrom` (early-booking price windows). The insert fails with a unique violation. This matches the contract's column list exactly, but T0.5 cannot fix it because no later migration is allowed.
- Fix (controller ruling): add `"weekdayMask", "bookFrom", "travelFrom"` to the NND key. That is the same idea the contract already uses for `AgentRate(… bookFrom, travelFrom)`. The other option is to state explicitly that weekday pricing is not supported in phase 1.

**MAJOR-2 · Hot-path lookups have no index or unique, and T0.4/T0.7/W1.x cannot add one later**
1. `TripHold.capKeyHash` (trips.prisma:313). The hold-cap count in CC §D.6 runs under an advisory lock on every public or agent hold: `WHERE capKeyHash=$ AND status='ACTIVE' AND expiresAt>now()`. Hold rows are never deleted, so this becomes a sequential scan that grows over time. Fix: `CREATE INDEX "TripHold_capKeyHash_active_idx" ON "TripHold"("tenantId","capKeyHash") WHERE "status"='ACTIVE'`, or a Prisma `@@index([tenantId, capKeyHash, status])`.
2. `TripPaymentDue.payTokenHash` (trips.prisma:463). A public pay-link lookup with no index and no uniqueness. Fix: `@@unique([payTokenHash])`. A nullable unique column is fine.
3. `SellBasket.publicTokenHash` (sellable.prisma:16). Same problem on the public basket route. Fix: `@@unique([publicTokenHash])`.
4. `TripUnit.holdId`. CC §D.1 (3c) locks `WHERE "holdId"=$hold` without `departureId`, and nothing indexes it. Fix: `@@index([holdId])`, or partial `WHERE "holdId" IS NOT NULL`.
5. Lower priority, but in the same "now or never" situation:
   - `TripMoneyEvent`: the cross-tenant retry job needs `(postingStatus, nextAttemptAt)`.
   - `TripDocument(passengerId)`: listing a passenger's documents.
   - `TripRefundRequest(bookingId)`.

**MAJOR-3 · Idempotency storage that CC §C rule 3 requires is missing**
- CC §C.3 says `cancel(EXECUTE)` stores its key at `TripRefundRequest` as `cancel:<bookingId>:<key>` "paired with `requestHash`", and that the basket stores `idempotencyKey` paired with `requestHash`.
- `TripRefundRequest` (trips.prisma:501) has neither `idempotencyKey` nor `requestHash`, and has no unique. `SellBasket` has no `requestHash`. B.1 omits them as well, so the contract contradicts itself. With no later migration allowed, T0.6/T0.7 cannot implement "same key + different hash = `IDEMPOTENCY_CONFLICT`" for cancel and basket confirm.
- Fix:
  - `TripRefundRequest.idempotencyKey String`, `requestHash String`, `@@unique([tenantId, idempotencyKey])`.
  - `SellBasket.requestHash String`.

**MAJOR-4 · `entitiesOfUnit` / `deeperPairs` load every product and departure of a unit, then send them as one giant `OR`**
- Where: service.ts:327-340, form.ts:115-125.
- How it is used: `entitiesOfUnit` runs on every UNIT or TENANT settings-form load (form.ts:112/115), in `settingsDiff` (service.ts:482) and in `applyTemplate` RESET_ALL (service.ts:1161). The resulting pairs go into `settingValue.findMany({ OR: pairs })`.
- Why it breaks: a TRIPS unit with daily departures (for example 5 products × 3 times × 365 days ≈ 5.5k departures per year) produces OR lists of several thousand terms. That is slow at first and later exceeds Postgres's 32,767 bind-parameter limit. At that point the unit's settings page and RESET_ALL fail outright.
- Scope: existing domains only pay two extra queries that return nothing. This is not a regression, but it is a time bomb for TRIPS units that will go off once T0.3 materialises departures.
- I disagree with the builder's debt note.
- Fix: for PRODUCT and DEPARTURE, start from the override rows instead of the entities.
  1. `settingValue.findMany({ where: { tenantId, scope: { in: ["PRODUCT","DEPARTURE"] } }, select: { scope, scopeId } })`.
  2. Keep only ids whose `tripProduct`/`tripDeparture` row has `unitId = $unit` (`id: { in: thoseIds }`).
  3. Do the same for `deeperPairs(PRODUCT)`.

  The cost is then bounded by the number of overrides, not the number of departures.

---

## MINOR

1. **Missing sanity CHECKs.**
   - `TripResourceUse` and `TripDeparture` have no `CHECK ("endsAt" > "startsAt")`. With `startsAt > endsAt`, `tsrange` raises a raw error on insert. With `startsAt = endsAt`, the range is empty, so it never overlaps anything and silently bypasses the EXCLUDE.
   - Also missing: `TripSeason` `"dateEnd" >= "dateStart"` (hotel has the equivalent), `TripSchedule` `"dateTo" IS NULL OR "dateTo" >= "dateFrom"`, `departTimeMin` 0–1439, and `weekdayMask` 0–127.
2. **The Prisma drift hazard is not documented the way hotel.prisma:205-209 does it.** trips.prisma:6-7 says "do not add @@unique". It does not record that `migrate diff` was run and proposed no DROP for the 3 NND indexes, the 2 partial uniques, the partial index, the EXCLUDE and the ~100 CHECKs, and it has no "re-check on the next migration" note. Fix: add that note, and attach the §2.5 `migrate diff` output to the WO (I could not run it).
3. **W26 and W29 are SETTINGS-only, but TRIPS-DEFAULTS also defines runtime conditions for them.** W26 covers "an actual group over the ratio". W29 covers "e-ticket mismatch" and "more than 5 days in one park". Callers (L1.10, T0.7) cannot raise these through `evaluateTourRule`: a `{hit}` input returns `INVALID_INPUT_WARN`. Also missing: W29 messages 2 and 3, and the W45 Liveaboard addendum ("ทริปเรือค้างคืนยังไม่มีแนวทาง…"). Fix: let SETTINGS rules also accept the `{hit, vars, messageTh?}` runtime shape, or add the alternative messages as parameters.
4. **Registry load can be time-dependent** (registry.ts:216-220). The default check runs `evaluateTourRule("W29", …)` against the real clock. Today the default `confirmedAt` is null, so this is safe. If any template ever ships a date, then 180 days later `defineSettings` throws during module import, and every settings domain (hotel, dorm, booking) goes down. Fix: pass a fixed `opts.now`, or skip the age condition in the registry check.
5. **`legalCode` keeps only the first code** (service.ts:1011). When W01 and W03 both fire, W03 is lost from `SettingChange`. This is acceptable as ruled. A cheap improvement would be to store the joined codes (`"W01,W03"`) so the audit trail is complete.
6. **HIGHEST per-item acknowledgement is enforced only in the client** (SettingsForm `highestAcked`). The server accepts a single `ackLegalWarn`. Today this is fine because W22 is the only HIGHEST rule and it is RUNTIME-only, so it never reaches this form. Note it for T1.x.
7. **Owner ruling "refund money-only until the credit path exists" is not enforced on write.**
   - T22's schema still accepts `"CREDIT"` (defs/trips.ts:330).
   - T23 still accepts `CUSTOMER_CHOOSES_MONEY_OR_CREDIT` (defs/trips.ts:333).
   - `hiddenUntil: "PHASE_2"` (X14, X15, T42) only hides keys in the form (form.ts:168). `setSettings` and the API can still write them.

   Fix: follow the A5 precedent (VALIDATION). Drop the credit values from the zod enums, or add a refine, until X.2.
8. **Some money keys only need `trips.settings.edit`.** `trips.cancel.autoApproveUpTo`, `trips.cancel.manualEditApprovalSatang` and `trips.fx.rates` (X5) control refunds and FX. Because sensitivity is decided per group, they fall under the plain edit permission. Suggest a per-row `sensitivity: "MONEY"` override (controller call).
9. **json-schemas.ts gaps.**
   - EARLY_BIRD, LAST_MINUTE and PROMO_CODE accept rules with neither `discountBp` nor `discountMinor` (or with both).
   - BLACKOUT `ranges.from > to` passes.
   - Exceptions allow duplicate dates and `minPax: 0`.
10. **Missing `vars` leave `{…}` placeholders in shown messages** (W21, W24, W31, W36, W40, W46; `fill`, th-tour-2569.ts:157). Either strip unreplaced placeholders or require the vars for those rules.
11. **Lock queue on the one existing table.** `AccountDocument ADD COLUMN … NOT NULL DEFAULT 0` is metadata-only on PG ≥ 11, and I confirmed there is no UPDATE or backfill. It still takes ACCESS EXCLUSIVE, though, so a long transaction on AccountDocument would queue every reader behind the migration. Suggest `SET lock_timeout = '5s';` at the top of the file, and deploy off-peak.
12. **TripPassenger `sex`/`docType`/`certLevel` have no CHECK** (builder debt). I agree they can't be derived from CC. But since no later migration is allowed, either add them now (certLevel = T50's `OW…INSTRUCTOR`; docType and sex from T29) or record "app-level validation only" in the ledger.
13. **TRIPS units only is enforced in the form, not on write.** `unitTypes: ["TRIPS"]` filters only the form (form.ts:169). `setSettings` will write a `trips.*` key on a HOTEL unit. That matches existing behaviour for HOTEL/DORM keys, so it is not a regression. Mentioned because the brief says TRIPS units only.
14. **Two hard-coded domain lists.** `legalAckNeedsReason` (settings-shared.ts:112) duplicates `TOUR_LEGAL_DOMAINS` (legal/index.ts:37). Drift fails safe (the client would demand a reason), but deriving both from one constant would be cleaner. `legal/index.ts` is pure, so the client could import it.

---

## Verified OK (no finding)

- **Migration.**
  - Add-only: no DROP, RENAME, ALTER COLUMN, UPDATE, DELETE, REFERENCES or FK.
  - The only existing table touched is `AccountDocument` (one column).
  - The 4 ADD VALUE statements are alone in `_trips_enum`, and `_trips` never uses a new enum value.
  - All 33 tables have `tenantId` (31 of them also `unitId`).
  - Money is `Int` with `>= 0`, except `manualDeltaSatang`/`varianceSatang`.
  - Status CHECK value sets match CC §B.1, §N.1, §G.1 and §G.3 and brief §4.1, including `SELL_CHANNELS` on every `channel` column.
  - `TripExtra_passThrough_check` and the THB-unless-LIVEABOARD check are correct.
  - The NND and partial indexes match the brief, and the `scheduleId,localDate` partial unique matches what T0.3 needs.
  - `TripHold("expiresAt") WHERE ACTIVE` serves the sweeper.
  - EXCLUDE uses `tsrange` on `timestamp(3)`, which is immutable. `btree_gist` comes from svc_r0 (`CREATE EXTENSION IF NOT EXISTS`, migration 20261221000000_svc_r0:247), which is already on main.
  - NND needs PG ≥ 15, which prod already runs for svc_h.
  - No path relies on cascade.
- **Counters.**
  - Every CC §D.1 statement (1)–(9) runs as a single statement against `capacity/sold/held/reserved/version` keyed by the primary key.
  - The `>= 0` CHECKs never forbid a legitimate transition, because each statement guards with `>= n`.
  - There is no sum CHECK, per ruling 16.
- **SellCounter §K.** The `INSERT … ON CONFLICT ("tenantId","series","period") DO UPDATE … RETURNING seq` statement is implementable: the unique exists, `createdAt`/`updatedAt` have database defaults, and `$id` is supplied. It is concurrency-safe, and a rollback returns the number.
- **T0.2 and T0.3 column needs are present:**
  - TripExtra: name, note, active, sortOrder, paxPrices
  - TripPaxType: active, sortOrder
  - TripProduct: publishedAt
  - TripSchedule: pausedAt; dateTo nullable
  - TripDeparture: cancelReason, cancelledAt
  - T45 `shopRates`
- **Shared settings engine, line by line.** Every relaxation is gated by `isTourLegalDomain(def.domain)`, and `def.domain` comes from the registry, not from the caller.
  - The rental path is byte-equivalent: BLOCK still blocks, `LEGAL_INPUT_ERROR` still blocks, the ≥10-character reason is still required (`!w.tour && …`), owner approval still comes from `needsOwnerApproval`, and `applyLegalOverrideApproval` is unchanged for rental.
  - Registry: a rental domain that references a W-rule throws, and a tour domain that references a rental rule throws. Unknown domains fall to the rental path, which fails closed.
  - `SCOPE_KINDS` is appended at the end. The existing scope order, `chainProblem`, REF_FIELD for old scopes and snapshot policy are unchanged.
  - The UI: an issue with an unknown key or domain still requires a reason.
- **Tour rules can never block.**
  - `TourVerdict.level` is typed `"OK"|"WARN"` and `maxLevel` is the literal `"WARN"`.
  - `evaluate` and `evaluateTourRule` are both wrapped in try/catch. An unknown id, malformed input, NaN, a non-integer, a huge value or a throwing getter all return `INVALID_INPUT_WARN`.
  - A throw inside `legalInput` is caught in the service and turned into `INVALID_INPUT_WARN`.
  - The service tour branch has no route into `blocks`.
- **Rule details.** Severity, `pendingReview` and every W-message match TRIPS-DEFAULTS §4, apart from MINOR-3. The W01 ladder breakpoint evaluation is correct. W29 computes the Bangkok date from epoch arithmetic (no `getDay`). The W38 term list is a superset of the brief's.
- **Defaults.** All 104 keys are present. Checked against TRIPS-DEFAULTS:
  - scope chains, `unitTypes ["TRIPS"]`, `percentScale`, `effectiveDated`, `hiddenUntil`
  - 8 ACCOUNTANT + 8 AUTHORITY hints, exactly where the documents put them
  - PRIVACY means ownerOnly; LEGAL means owner-only via `isOwnerOnly`
  - snapshot = the 35 keys of CC §N.3
  - T23 = MONEY; T22 has no CREDIT by default; T4 = BOT_REF (so no W20 on default); license fields are optional
  - all satang values are ×100 correct

  Every template default and `_fallback` evaluates to OK.
- **Tenant isolation.**
  - All 33 models are registered in scope.ts (2 tenant, 31 unit).
  - The PRODUCT/DEPARTURE `locateMany` filters by `tenantId`. A non-existent id or another shop's id gives `NOT_FOUND`, and `canAccessUnit` is applied to the row's own `unitId`.
  - VESSEL, AGENT_TIER and AGENT stay `SCOPE_UNSUPPORTED`.
- **Code quality.**
  - No `any`.
  - zod v4 APIs (`z.partialRecord`, `z.strictObject`).
  - `core/sellable.ts` imports nothing, and `RequestHash` is a type only.
  - The facade uses explicit exports.
  - Messages are in Thai.
  - Business numbers live only in defs and the rule constants.

## Builder decisions

| Decision | Reviewer |
|---|---|
| First-code-wins `legalCode` | Agree (MINOR-5: optionally join codes) |
| `INVALID_INPUT_WARN` | Agree. This is what makes "never BLOCK" hold structurally |
| HIGHEST needs per-item acknowledgement | Agree for the UI. Server-side enforcement is deferred (MINOR-6) |
| `entitiesOfUnit` loads all departures | **Disagree** (MAJOR-4) |
| No CHECK on TripPassenger sex/certLevel/docType | Acceptable only if it is recorded as app-level validation. Otherwise add now, since no later migration is allowed (MINOR-12) |
| VESSEL resolved through the product's `vesselId` (departure's own first) | Agree |
