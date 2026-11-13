# Second-round review: RUN TRIPS T0.6 (booking core), fix round r1

Worktree `/root/projects/shark-trips-l1` · branch `wip/trips-t0.6` · HEAD `baebccfe1` · fix diff `711c9c75a..baebccfe1`.
This was a read-only review: I used only Read, grep and git. I ran no tsx, build or DB commands.

## Verdict: **FIX FIRST (one small fix)**

Rulings R1–R14 are implemented faithfully. All six round-1 MAJORs and all five hunter defects are closed. I found no new lock inversion. The R9 change does not regress the T0.4 sweeper.

The one thing I would fix before merge is **N1**. R9 closed `releaseHold` on booking-bound holds, but the sibling `convertHold` is still open. That path is reachable today through the staff server action `convertHoldAction`, and it leaks a sold seat for good. It is the same class of defect as hunter #4 and has the same small fix. Everything else is MINOR or NIT.

---

## 1. Status of round-1 and hunter findings

### Round-1 MAJORs

| # | Status | Evidence |
|---|---|---|
| M1 approvals unbound | **closed with caveats** (N2, N3, N4) | `booking.ts:244-258` checks status, entityType, entityId and unit through `requestBindings` (`approval/service.ts:488-498`). `entityId` = `tpo1_`+sha256(JSON array [label, unitId, departureId, itemRef, unitMinor, resolvedMinor]) at `booking.ts:124-126`, so the fields are delimited unambiguously. Single use is enforced by `consumeApprovalsInTx` at `:406-414`, called in-tx at `:896` (confirm/bookNow/K1.1) and `:1549` (change). The audit row with `approvalIds` is written in the same tx at `:982-984` and `:1579`. |
| M2 change keeps old policy | **closed** | `booking.ts:1489-1491` carries over only the three ladder fields. `recomputeFromSnapshot` CANCEL reads `snap.cancelLadder` / `shopCancelRefundBpByReason` (`snapshot.ts:291-294`) and reads VAT from `policy` (`:268`), so the snapshot is now consistent. The old snapshot sha256 is in the audit `before` (`:1514`, `:1577`). Caveat (NIT): `refundForm`, `nameChangeFree` and `changeDateFee` (from `trips.cancel.*`) now come from the new policy, and `policy.trips.values` carries the new `trips.cancel.*` keys next to the old ladder. Nothing computes from them today. |
| M3 change drops promo | **closed** (option b) | `:1472-1474` returns PROMO_ON_CHANGE unless `dropPromo`. `:1570` calls `releasePromoInTx` after the booking UPDATE, items and passengers, so the rule rows are locked last. `dropPromo` is part of `bodyHash`. |
| M4 forged `prepared` | **closed** | `seal()` = `deepFreeze(structuredClone(P))` plus WeakSet (`:520-532`). `finalizeTripsInTx` rejects anything not in the set, or with a tenant/unit/actorKind/actorId/basketId mismatch (`:856-860`). Columns are re-derived from the snapshot (`:907`). Nothing mutates `P` afterwards: every sort is on a copy (`:772`, `:873`, `:900`, `:971`), and `booking-core` helpers are pure. `CapacityPolicies` is plain data, and I found no writes to it in capacity code. |
| M5 approve ⇒ HOLD when nothing due | **closed** | `:1388-1407`: if due-now is 0, it converts the hold and transitions PENDING→CONFIRMED (allowed for STAFF/SYSTEM by `state.ts:42`), then emits `trips.booking.confirmed`. |
| M6 oldSeats from current paxType | **closed** | `:1495` uses `seatsOfSnapshot(old)`. |

### Round-1 MINORs

| # | Status | file:line |
|---|---|---|
| m1 rekey before 1a | **not closed (documented)** | `booking.ts:761-764` carries a ⚠️ note for T0.7. Hunter S1 found 0 deadlocks in 600 races. The controller should still rule. |
| m2 SellCounter order | **closed** | `:898-902` sorts by (prefix, period). series = prefix (`numbering.ts:48`). |
| m3 promo across basket | **closed** | `:969-973` sorts by (ruleId, bookingId) across the basket. |
| m4 cancel replay ignores body | **closed** | `:1325-1334`. `bodyHash` = canonical hash of {reason, reasonKind}. The replay is re-checked in-tx after STATE_CONFLICT (`:1342-1346`). |
| m5 basket keys not unit-scoped | **closed** | `nsKey` appends `@unitId` (`:207`). The seed accepts both forms (`seed-trips-qc.mts:582-583`). |
| m6 change ignores idem key | **closed** | `:1453-1463` pre-check. A per-booking advisory lock then an in-tx re-check (`:1518-1523`). |
| m7 passengers > seats on change | **closed** | `:1498-1505`. The read is outside the tx (TOCTOU only against T0.8 passenger edits). |
| m8 party failure silent | **closed** | `:619-628` returns BUSY BOOKER_UNAVAILABLE. |
| m9 accepted-and-dropped fields | **closed** | Strict schemas in `booking-core.ts:61-139`. See N6 for the contract drift this creates. |
| m10 expiry consumer drops failures | **closed** | `outbox-consumers.ts:1563-1564`. See N5. |
| m11 guessable dev token | **closed for the booking token** | `booking.ts:107-121`: no fallback, null ⇒ BUSY SERVER_KEY_MISSING. Entry points check `tokenSecret()` first (`:437`, `:667`, `:1051`). Caveat: T0.4 `holdCapKeyHash` (`capacity.ts:135-138`) still has the unkeyed sha256 fallback outside production. It is unreachable from T0.6 paths, which now require the secret up front, but still reachable from bare T0.4 `holdCapacity`. "No unkeyed fallback anywhere" is therefore true only for T0.6. |
| m12 bad YMD crash | **closed** | `booking-core.ts:24-28`. |
| m13 providers not consumed | **closed** | `:573`, `:1488` return VALIDATION PROVIDERS_NOT_WIRED. |
| m14 change on paid | **closed** | `:1465`. |
| m15 PUBLIC REHOLD ignored | **closed** | `:666`. |
| m16 stale clock | **not addressed** (not in R1–R14) | Unchanged. Still the T0.4 convention. |

### Hunter defects

| # | Status | Evidence |
|---|---|---|
| 1 counter deadlock | **closed** | Same as m2. |
| 2 approvals | **closed with caveats** | Same as M1. |
| 3 option TOCTOU | **closed** | `productRefsOf` (`:293-305`) reads the departure's `optionId`. `lockProductsInTx` passes `optionId` (`:371`). Used on hold (`:474`), confirm FAIL and REHOLD (`:766`, `:770`), bookNow (`:1104`), approve (`:1391`) and change (`:1524`). |
| 4 releaseHold frees a booking-bound hold | **closed for release; sibling open (N1)** | `capacity.ts:886-887` checks `h0`, and `:895-896` re-checks under the departure lock. `forBookingId` must equal the hold's actual `bookingId` (strict equality). Only `cancelUnpaidInTx` passes it (`booking.ts:1268`), with the `bookingId` it selected the holds by. |
| 5 NUL bytes | **closed** | `NO_CTL` on every free-text field and ID (`booking-core.ts:14-18`). `safely` maps any raw error to BUSY UNEXPECTED (`booking.ts:134-143`). |
| MINOR M1 hold retry after checkout | **accepted, documented** | `:420`. |
| MINOR M2 promo on change | **closed** | — |
| MINOR M3 change idempotency | **closed** | The advisory lock serialises same-booking changes, so 5 parallel identical changes should now give 1 ok + 4 replays. Not re-run. |
| MINOR M4 bookNow key = hold key | **closed** | `replayByKey` returns IDEMPOTENCY_CONFLICT for an OPEN basket (`:644-647`). |
| MINOR M5 forged prepared | **closed** | — |
| MINOR M6 token / missing secret | **closed** | — |
| PC note: 23505 masks duplicate codes | **closed** | `runBooking` maps by constraint name (`:147-196`). |

---

## 2. New findings

### MAJOR

#### N1. `convertHold` (T0.4) still acts on booking-bound holds and leaks a sold seat. This is the sibling R9 left open.

- **Where:**
  - `capacity.ts:822-844` (`convertCoreTx`) has no `bookingId` guard.
  - It is reachable through `capacity-actions.ts:49-50` (`convertHoldAction`, staff with SELL) and the facade `convertHold` (`capacity-service.ts:468-476`).
- **Scenario A (PENDING booking):**
  1. A PUBLIC customer books under SHOP_CONFIRMS. The booking is PENDING and its hold is ACTIVE with purpose SHOP_CONFIRM.
  2. A staff member opens the T0.4 hold screen and converts that hold (by mistake, or to "lock the seat in"). Result: `sold += n`, hold CONVERTED, booking still PENDING.
  3. The shop rejects the request. `cancelUnpaidInTx` selects only ACTIVE holds (`booking.ts:1265-1266`), so it releases nothing and moves the booking to CANCELLED. The seat stays sold forever.
  4. Approving instead fails with STATE_CONFLICT, because the hold UPDATE needs `status='ACTIVE' AND purpose='SHOP_CONFIRM'`.
- **Scenario B (HOLD booking):**
  1. Converting the PAYMENT hold of a HOLD (unpaid) booking makes the sweeper skip it (it only CASes ACTIVE holds), so the booking never expires.
  2. A later cancel releases nothing, so the seat leaks again.
- **Invariants broken:** I2 (sold = Σ seat items of sold bookings) and I5.
- **PUBLIC:** the facade `convertHold` also accepts a PUBLIC ctx with `capKey = contact:<key>` after rekey, the same path as hunter 4(b). No public route exists yet, so that part is latent.
- **Exact fix (needs a controller ruling like R9, because it touches capacity.ts):**
  - Mirror R9 in `convertCoreTx`: add an optional `forBookingId` parameter. Throw `STATE_CONFLICT {reason:"HOLD_HAS_BOOKING"}` when `h0.bookingId !== null && h0.bookingId !== forBookingId`. Re-check under the departure lock, as `releaseCoreTx` does.
  - Add `internal?: {forBookingId}` to `convertHoldInTx`.
  - booking.ts must pass it on all three paths that bind before converting:
    - finalize `:884` → `l.bookingId`
    - change `addOn` `:1530` → `b.id`
    - approve `:1401` → `b.id`
  - Optionally apply the same guard to `extendCoreTx` (`capacity.ts:922-936`). Staff or a PUBLIC capKey holder can currently push a PENDING booking's SHOP_CONFIRM window out without limit. That may be intended for staff; it needs a ruling.
- **Oracle:** add a check: `convertHold` on a PENDING booking's hold ⇒ STATE_CONFLICT HOLD_HAS_BOOKING, counters unchanged.

### MINOR

#### N2. Approval single use depends on an audit row that is only written for STAFF/SYSTEM actors.
- **Where:** `consumeApprovalsInTx` looks for `trips.booking.price_override` audit rows (`booking.ts:409-411`). `auditBooking` returns early for any actor other than STAFF or SYSTEM (`:830`).
- **Why it holds today:** only `booking-actions.ts` sets `canOverride`, and only for a STAFF ctx.
- **Failure scenario:** K1.1 or an AGENT/PUBLIC path that ever forwards `opts.canOverride`. That caller consumes nothing, so the same approval can be reused without limit.
- **Fix (either):**
  - `overrideGate` returns FORBIDDEN unless `c.actor.kind === "STAFF"`; or
  - write the consumption row directly with `tx.auditLog.create`, independent of actor.

#### N3. One approval covers any quantity and every line on the departure.
- **What happens:** `entityId` binds unit, departure, itemRef (`seat:ADULT`), unitMinor and resolvedMinor, but not quantity. Pricing applies the override to every line whose itemRef matches (`pricing-core.ts:900`, per line).
- **Failure scenario:** an approval granted for "1 adult at 1,000" authorises a 20-adult booking, or several lines of the same departure in one basket. All of it consumes the approval only once.
- **What the oracle does today:** `amountSatang` is fetched by `requestBindings` but never compared.
- **Fix (pick one, controller decides):**
  - add `seats` (Σ qty for that itemRef across the request) to the `entityId` tuple; or
  - require `x.amountSatang === (resolvedMinor − unitMinor) × qty`.
- Also put `entityId` (or its inputs, including `departureId` and `unitId`) in the REQUIRES_APPROVAL `details`. Today the approval UI has to recompute it, and nothing in `src` submits a `trips.price_override` request yet.

#### N4. The single-use and idempotency lookups scan AuditLog by `action` across all tenants, inside the tx.
- **Where:** `consumeApprovalsInTx` (`:409-411`) and `idemAudits` (`:1288-1291`).
- **Why it is slow:** AuditLog has only `@@index([tenantId, createdAt])` and `@@index([action])` (`core.prisma:235-236`). Every check therefore reads every tenant's `trips.booking.price_override`, `.cancel` or `.change` rows, plus a JSON extract or `string_to_array` per row.
- **Why it matters:** in finalize this runs while departure FOR UPDATE and hold locks are held. In change it runs under the per-booking advisory lock. Cost grows linearly with platform history.
- **Spoofing:** it is not spoofable. It filters by `tenantId`, the action can only be written by code, and `string_to_array(...,',')` with `= ANY` matches whole elements, not substrings. cuid ids contain no commas.
- **Fix:** add an index on `AuditLog(tenantId, action, targetId)`, then write the consumption row with `targetType 'ApprovalRequest'`, `targetId = approvalId` so the lookup is an exact equality. Better still, use a dedicated unique row (a schema change for the controller). For idempotency, `targetId` = bookingId is already present, so the index alone fixes `idemAudits`.

#### N5. `safely` turns programmer errors into retryable BUSY.
- **Where:** `:134-143`.
- **What it does:** it is outside every tx, so it never prevents a rollback. CapacityAbort and PricingAbort are still mapped by name. `runTx` has already converted in-tx aborts.
- **Downsides:**
  - A TypeError or a contract bug now looks like transient BUSY to callers and oracles. It is visible only in ops logs.
  - The expiry consumer rethrows on `retryable` (`outbox-consumers.ts:1564`), so a deterministic bug in `onTripBookingExpired` becomes a poison message that retries until the outbox gives up.
- **Fix:** return `BUSY {reason:"UNEXPECTED"}` with `retryable: false`, or have the consumer rethrow only when `r.code === "BUSY" && r.details?.reason !== "UNEXPECTED"`. In QC, consider rethrowing when `NODE_ENV === "test"`.

#### N6. Strict R14 schemas reject fields that the core `Sellable` contract advertises.
- **What the contract has:** `core/sellable.ts:85-104` declares `HoldRequest.basketId?`, `holdMinutes?`, `Booker.marketingConsent?`, `ConfirmRequest.note?`, `pay.tender?`, and `CancelRequest.choice?` / `moveToSlotId?`.
- **What trips does now:** `tripSellable` rejects all of them with VALIDATION.
- **Impact today:** none. `booking-actions.ts` and `platform/basket.ts` pass the body through unchanged, and no caller sets these fields (grep).
- **Impact later:** a K1.1 or W1.x caller written against the core types will fail.
- **Fix:** record this as a ruling in `sellable-impl.ts`, or strip or reject these fields there with a reason code (for example `VALIDATION {reason:"FIELD_NOT_SUPPORTED_YET", fields}`) so the failure is explicit.

### NIT
- **N7.** `pg_advisory_xact_lock(hashtext(...))` (`:408`, `:1518`) uses the one-argument bigint key space that every module shares. A 32-bit collision with another module's advisory key only serialises unrelated work, or at worst causes a 40P01 that is then retried. Prefer the two-argument form `(classid, hashtext(id))`.
- **N8.** `approvalsGate` accepts `x.unitId === null` (`:253`). This is harmless, because `entityId` already embeds `unitId`. Requiring `x.unitId === c.unitId` would make the binding explicit, since trips submissions will always set it.
- **N9.** `APPROVAL_SINGLE_DEPARTURE` (`:248`) rejects any multi-departure basket that carries any approval, including one where only one line needs it. This is a UX limitation; document it for T1.3.
- **N10.** `oldSha` (`:1514`) hashes the jsonb-normalised re-serialisation, not the original bytes. It is stable but cannot be reproduced from the original snapshot object. Document it.

---

## 3. Targeted checks (task items a–h)

### a. R1 approvals
- **Race:** the advisory lock is taken before the audit read and held until commit (xact lock). The audit row is written in the same tx (`:982-984` / `:1579`). Isolation is the Prisma default, READ COMMITTED (`capacity-service.ts:245-250`, no `isolationLevel`), so a waiter's next statement sees the committed row. No race. Also, both bookings must be on the same departure (`entityId`), so they already serialise on the 1a FOR UPDATE.
- **Lock order:**
  - confirm: …1a → 2a bind/convert → **approval advisory** → SellCounter → booking → promo.
  - change: change-advisory → products → 1a → seat ops → **approval advisory** → booking.
  - No path takes an approval lock after counters or bookings. No inversion.
- **Scaling:** see N4.
- **Spoofing:** not possible (N4).
- **One approval for several lines or seats:** N3.
- **`entityId` delimiting:** OK.
- **`unitId` null:** N8.
- **`safely`:** outside the tx, maps aborts by name, has no rollback impact. Downsides in N5.

### b. R4
- Frozen `prepared` is never mutated.
- The WeakSet identity survives the awaits within one process. Cross-process use is impossible by design, which matches K1.1's single-request model.
- REHOLD reuses the same sealed `P`.
- bookNow seals its own `P` (`:1079`).
- No path rebuilds `prepared` outside `seal()`. The replay paths return `refsOfBasket` and never touch `prepared`.

### c. R5
- **Lock order:** products → 1a → hold UPDATE → `convertHoldInTx` (re-locks the same departure) → booking CAS → outbox/audit. Consistent with the sweeper (departure → hold → booking).
- **Promo:** the promo was already redeemed when the PENDING booking was created (`finalizeCoreInTx` redeems regardless of status), so approve correctly does nothing with it. A later expiry or reject releases it.
- **Numbering:** the code was already allocated at creation.
- **Double approve:** the second hold UPDATE matches 0 rows (purpose no longer SHOP_CONFIRM) ⇒ STATE_CONFLICT; the outer status/version check catches it first.
- **Owner check:** skipped for STAFF/SYSTEM (`assertHoldOwner` `capacity.ts:493-496`).

### d. R9
- `forBookingId` is compared to the hold's actual `bookingId`, both before and after the departure lock.
- **The T0.4 sweeper is unaffected:** `sweepDeparturesTx` (`capacity.ts:1183-1246`) CASes holds to EXPIRED with its own SQL and never calls `releaseCoreTx`. HOLD and PENDING bookings still expire.
- The waitlist `exitWaitlistTx` uses `releaseLockedHold` (unguarded) on offer holds. Those holds have no `bookingId`, because finalize binds only holds whose `basketId` matches.
- STAFF REHOLD releases only holds unbound by the rolled-back FAIL tx.
- **No regression.** The sibling gap is N1.

### e. R11
- Every caller of `bookingPublicToken` handles null: finalize (`:910-911`, abort ⇒ rollback) and `refsOfBasket` (`:1029-1030`).
- Replay goes through `refsOfBasket`.
- The token never reaches events, audit or ops logs. `logUnexpected` logs only `where` and `name`.

### f. R12
- **Body hash:** `canonical()` sorts keys and drops `undefined` (`capacity.ts:140-155`). zod output omits absent optional keys, so missing and undefined hash the same. `false` and absent hash differently (for example `dropPromo:false`), which is acceptable.
- **Lock order:** the per-booking change advisory lock sits at layer 0, before products. No other path takes it.
- **Constraint names:**
  - Verified in the migration: `SellBasket_tenantId_idempotencyKey_key` (`migration.sql:742`), `SellBasket_publicTokenHash_key` (`:745`), `TripHold_tenantId_idempotencyKey_key` (`:820`).
  - Every idempotency-key write that can throw is raw SQL (the basket CHECKED_OUT UPDATE), so the PG message carries the quoted constraint name. The basket and hold INSERTs use ON CONFLICT DO NOTHING, and the outbox uses `skipDuplicates`.
  - The `tenantId,idempotencyKey` field-list alternative could only mis-map a Prisma-client insert into another table with those fields. None happens inside these transactions.

### g. R14 strict schemas
- The server actions and `sellable-impl` pass input through unchanged, and no in-repo caller sends a removed field.
- `quoteId` is now `^[0-9a-f]{64}$`. That matches `pricing.ts:416` (sha256 hex).
- Contract drift: N6.

### h. `requestBindings`
- It is an additive export that mirrors `requestStatuses` (same `tenantDb(ctx)` scoping, which hunter H4 showed rejects other tenants' ids).
- No existing function changed.
- It selects no PII.

---

## 4. Lock order, rechecked on every path

| Path | Order | Verdict |
|---|---|---|
| hold | basket INSERT → cap advisory → products(id, opt) → 1a → hold INSERT | OK |
| confirm FAIL | basket FOR UPDATE → (PUBLIC) contact advisory + **hold UPDATE (rekey)** → products → 1a → hold bind/convert → approval advisory → SellCounter (sorted) → booking/items/pax → promo (ruleId) → outbox/audit → basket CAS | m1 inversion is still documented: PUBLIC confirm on an expiring hold ∥ `runExpireHolds` on its departure (rekey row-locks the hold, then waits for the departure; the sweeper holds the departure, then waits for the hold) ⇒ 40P01, retried. Everything else is OK. |
| confirm REHOLD | basket → products → 1a → release / reserve / insert → same tail | OK |
| bookNow | basket INSERT → products → 1a (via reserve, sorted) → same tail | OK |
| cancel / reject | readHold → 1a → hold → booking CAS → promo rules | OK |
| approve | products → 1a → hold → (convert) → booking CAS | OK |
| change | change advisory → products → 1a (sorted) → seat ops → approval advisory → booking → items → pax → promo rules | OK |
| sweeper | 1a (sorted) → holds → bookings (sorted) | OK, apart from m1 |
| expiry consumer | promo rules | OK |

No new inversion was introduced.

---

## 5. ORACLE-EDITs in baebccfe1

- **t0.4 S-12 → `"FORBIDDEN"` only:** justified and tight. This is the tightening round 1 asked for.
- **t0.6 S-14:** justified, but **loose**.
  - It removes `capacity.ts` from the protected list entirely, not just the R9 hunk. Any further T0.6 edit to capacity.ts (including the N1 fix, which is wanted, or an unwanted one) now passes silently.
  - It also drops `qc-trips-t0.1/t0.3/t0.4.mts` from protection.
  - Tighter alternatives:
    - pin `capacity.ts` to an allowed `git diff BASE_SHA` numstat or hash (+N/−M), updated per ruling;
    - pin the three oracle files to their blob hashes at the controller's commit.
- **t0.6 S-15 (pricing.ts may delete ≤ 1 line):** justified, since it is the one-line OPTS edit that removes the shadowing. It is slightly loose: any single deleted line anywhere in `pricing.ts` passes. Pin it by also asserting that the `-` line is the old `overrideApprovals:` line.
- **t0.6 CF-23:** justified, and the reuse ⇒ APPROVAL_USED check is a good addition. However, the expected `entityId` is computed by calling the implementation's own `tripPriceOverrideEntityId`, so the oracle cannot detect a weak binding. For example, a function that ignored `departureId` or `unitMinor` would still pass.

---

## 6. Oracle gaps
- **N1:** no check that `convertHold` / `convertHoldAction` refuses a booking-bound hold.
- **R1 negatives:** add these cases:
  - an APPROVED approval with another `entityType`;
  - the right `entityType` but `entityId` built for another departure, another unitMinor, another resolvedMinor or another unit;
  - an approval from another tenant;
  - two concurrent bookNow calls with the same approval ⇒ exactly one ok.
  - Use a hard-coded expected `entityId` formula in the oracle, not `fn("tripPriceOverrideEntityId")`.
- **N2:** no check that a non-STAFF ctx with `canOverride` is refused.
- **N3:** no qty or multi-line approval case.
- **R5:** check that the existing due-now = 0 approve case also asserts `sold` +n and `held` −n, and that a `trips.booking.confirmed` event is emitted.
- **R9:** the sweeper on an expired HOLD booking after the fix (regression guard). It works by reading the code, but nothing pins it.
- **R12:** concurrent identical change ×5 ⇒ all ok with the same version; cancel with the same key but a different reason ⇒ IDEMPOTENCY_CONFLICT.
- **R7:** a deterministic opposite-period two-line basket pair ⇒ 0 deadlocks (`pg_stat_database` delta). The probe exists in `scripts/probe-trips-t0.6-deadlock.mts` but is not in the oracle.

## 7. Checked and fine
- All writes to bookings, holds, baskets and counters stay inside one tx. No second connection is opened inside a tx: `requestBindings`, party, settings, policies and `productRefsOf` all run before it.
- `forBookingId` is used only by `cancelUnpaidInTx`, and with the matching `bookingId`.
- The sweeper, waitlist exit and REHOLD all still release or expire correctly.
- `seal` / WeakSet. Nothing mutates the frozen object.
- Sorted numbering (R7) and basket-wide promo order (R13).
- R8 option check on every path, including approve and change.
- R6 `oldSeats` from the snapshot. R2 snapshot consistency for VAT and the ladder.
- R3 release placed last.
- R12 canonical hash and constraint-name mapping.
- Change per-booking advisory and in-tx replay.
- Cancel in-tx replay after STATE_CONFLICT.
- R11 null handling and no token leakage.
- R10 `NO_CTL` covers every free-text field and ID. Party failure ⇒ BUSY.
- `approval/service.ts` and `index.ts` changes are additive and tenant-scoped.
- The outbox consumer rethrows only on retryable failures (see N5).
- The `quoteId` regex matches the pricing output.

## 8. What I did not check
- I ran nothing: no oracle, typecheck, fitness or probes. The probe scripts added in baebccfe1 were not run against HEAD by me.
- `redeemPromosInTx` / `releasePromoInTx` internals (the advisory key per contact or rule). I relied on round 1 and the hunter.
- `tenantDb` scoping of `approvalRequest` beyond the analogy with `requestStatuses` and hunter H4.
- Whether Prisma's driver adapter reports P2002 `fields` quoted or unquoted. This only matters for Prisma-client inserts, and none touches idempotency keys.
- The approval module's own rules (self-approval, policy routing) for `trips.price_override` requests. Nothing submits them yet.
- `products.ts` `assertProductSellableInTx` with `optionId: null`. I assumed the T0.4/T0.5 contract.
- Whether `extendHold` on SHOP_CONFIRM holds of PENDING bookings is intended (N1 note).
