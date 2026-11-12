# T0.4 r2 re-review: wip/trips-t0.4 @ 4990c6924 (diff from d4a91465c)

**Verdict: MERGE.** All 5 MAJOR from r1 are closed. No new BLOCKER or MAJOR.

- 6 new MINOR (N1–N6). Fix N1 (cache eviction) and N2 (HMAC fallback) in a small follow-up, or as the first commit of T0.6.
- T0.6 must follow the call-order notes in §D before it is written.

The grep guard on `capacity.ts` is clean. I checked it with the pattern in the file header: no `core/db`, settings, rate-limit, ops, resources or capacity-service imports, and no `prisma.`, `tenantDb(`, `resolveSettings(`, `systemGate(` or `logOps(` calls.

---

## (a) Item 13: how the status sites compute `used`

**T0.4: `used = sold + held` at every counter site** (`capacity.ts:350-431`).

**T0.3: `setDepartureCapacity` (`departures.ts:1006`)** still calls `departureCountersUnchangedSql(${cap})`.
- That helper (`:163-165`) **still returns `used = sold + held + reserved`**, even though the doc comment directly above it (`:157`, `:173`, `:177`) now says reserved is not included.
- It is called with `setFull: false`, so only the `FULL → OPEN/GUARANTEED` branch can fire.
- There is no other status-from-counters site in `departures.ts`. `setDepartureStatus` refuses FULL (`:1044`), and min-pax only does OPEN → GUARANTEED by CAS.

**Can a departure flip FULL/OPEN depending on which code touched it last? No, today.**
- Every T0.4 path keeps the rule "FULL ⇒ reserved = 0":
  - reserve needs `s+h+r+q ≤ cap`, which fails when `s+h = cap`;
  - unhold-to-reserved and return-to-reserved lower `s+h` below cap, so FULL → OPEN.
- So on any FULL row, `s+h+r = s+h`, and T0.3's test `used < newCap` gives the same answer under both definitions.

**The one divergence (harmless).** T0.3 lowers capacity to exactly `s+h` with `r = 0`. The row stays OPEN, whereas T0.4 would call it FULL. The public sees 0 seats either way, and the next convert sets FULL.

**Should change:** `departureCountersUnchangedSql` should return `("sold" + "held")`.
- It gives identical results today.
- It removes the contradiction with its own doc comment.
- It stops a future `setFull: true` caller from inheriting the wrong definition.
- **One line in T0.3's file.** Ask the controller to authorise it, or leave it as a T0.3 debt note.

---

## (b) Status of every r1 finding

| # | Status | Evidence / remainder |
|---|---|---|
| M1 pool | **closed** | `capacity.ts` is in-transaction only. `*InTx` take `CapacityPolicies` (`:865`, `:916`, `:961`, `:1086`); policies are loaded before the transaction in `capacity-service.ts`. Remainder: N3 (`capacityRowsOf` must not be called inside a tx). |
| M2 offer aborts freeing tx | **closed** | `offerNextInTx` (`:717-768`): returns early when there are no policies, the status isn't OPEN/GUARANTEED, the `cutoffAt` column has passed, `blockOf(WEB)` blocks, or `publicLeft ≤ 0`. Each offer runs under a SAVEPOINT; on failure it rolls back to the savepoint and stops. Remainder: N4 (failures inside the savepoint are swallowed unlogged). |
| M3 `reserveInTx(HOLD)` | **closed** | Shares `phase1HoldInTx` with `placeHold`: product/option gate, `blockOf(ctx.channel)` (per-channel cut-off, stop-sell, status), `publicLeft` pre-check, then D.1(1). `qtyAllot > 0` ⇒ FORBIDDEN (`:1036`). Remainder: multi-product baskets, see §D-2. |
| M4 availability | **closed** | `AV_FROM` joins product and option (`service:243-249`). PUBLIC gets NOT_FOUND for non-ACTIVE products; inactive options are filtered out; staff see `saleBlock "STATUS"` for ARCHIVED or inactive. `placeHold`: PUBLIC + DRAFT ⇒ NOT_FOUND; anyone + ARCHIVED ⇒ SLOT_CLOSED (`:546-554`). |
| M5 lock order | **closed** | `placeHold`: BLOCK advisory (`:570`) → product SHARE (`:577`) → departure (`:583`). `moveCoreTx`: product → both departures in id order. `extendCoreTx`: departure → hold. |
| m1 23514 | **closed** | `counterSql` throws a `CapacityAbort` tagged `CHECK_23514`; nothing else runs in the aborted tx. `runTx` logs it after rollback; `reportCapacityIncident` is exported for T0.6. |
| m2 sweeper order | **closed** | Offers (`:1150`) now run before the booking CTE (`:1156`). |
| m3 `used` doc | **partly** | Comment fixed; `departureCountersUnchangedSql` still includes reserved, see (a). |
| m4 `runWaitlistOffers` | **closed** | Actionable filter + `LIMIT 200`; waiters on started departures are expired in every status (`:1290`). Remainder: N5 (starvation). |
| m5 FIFO tie | **closed** | `GREATEST(clock_timestamp(), max(createdAt) + 1 ms)` under the departure lock (`:1239`). |
| m6 waitlist edges | **closed** | 23505 handled under a savepoint and re-read (`:1234-1249`); exit row count checked (`:1278`); unreserve-no-offer documented. |
| m7 PUBLIC | **closed / partly** | Closed: leave, decline, list, offer, return, move and the quota half-functions are staff-only; convert/release/extend need the hold's capKey (`:460-463`); PUBLIC `bookingId`/`basketId` refused (`:623`). Partly: `joinWaitlist` still accepts PUBLIC with any `partyId`. Not exploitable without a public route; W1 must bind `partyId` to the session. |
| m8 idempotency unit | **closed** | Stored key `…@<unitId>` and lookup filters by unit (`:153`, `:456`). |
| m9 HMAC | **closed, with caveat** | See N2. |
| m10 rekey layer 0 | **closed** | Documented "call first"; restricted to public PAYMENT holds of the unit (`:1099-1102`). Remainder: must run before convert, see §D-3. |
| m11 caller constraints | **closed** | Doc comments at `:807-810` and `:958-960`. |
| m12 phase-2 primitive | **closed** | `insertHoldInTx` exported (`:694`). |
| m13 extend | **closed** | Departure lock first; CANCELLED or started ⇒ SLOT_CLOSED (`:886-888`). |
| m14 small items | **closed** | `paxTotal` and replay-consumes-quota are documented. |

---

## (c) New defects from the restructuring

### N1 MINOR: policy cache evicts by `clear()`
**Where:** `capacity.ts:211-221`.

**Safety: yes.**
- Keys are `tenant|unit|departure` and `tenant|unit`; one tenant's entry can never serve another.
- `explicitOf` throws when explicit policies belong to another unit.
- Cut-off is computed from a fresh `now`, while status and stop-sell are read from the locked departure row. A stale entry can only apply an old T5/T6/T9/X2/X10 **rule** for at most 60 s per process.
- Each instance has its own cache, so the only multi-instance effect is that ≤ 60 s staleness, per instance.
- `showLeft`/availability never read the cache; they always load fresh.
- Memory is bounded at about 5,000 + 200 entries.

**Should cut-off/stop-sell come from a 60 s-old policy?** Stop-sell is never cached (it is a column), so only cut-off is in question.
- A ≤ 60 s lag after the owner edits the T6 rule is acceptable. An explicit `loadCapacityPolicies` result is also read before the transaction, so it is already slightly stale.
- The rule should be documented as "settings changes take effect within 60 s".

**Defects:**
1. **Clear-all eviction.** Entries never expire from the Map; it is cleared completely once `size > 5000`.
   - `getAvailability`/`listAvailability` also fill the cache (a 62-day list adds dozens of entries).
   - So under steady multi-tenant traffic the cache is wiped periodically.
   - A basket whose `capacityRowsOf` → `reserveInTx` window spans a wipe fails with non-retryable `VALIDATION POLICIES_REQUIRED`.
   - Rare, but it is a spurious customer-facing failure.
2. **`holdCap` source.** `policiesFor` takes `holdCap` from the *first* departure's resolved X10 (`service:126`), and the unit cache keeps whichever load ran last. A product- or departure-scoped X10 override is applied inconsistently.

**Fix:**
- Evict expired entries, then the oldest by insertion order; never `clear()`.
- Do not fill the cache from availability.
- Resolve X10 at `{unitId}` scope only.
- Better: let `TripReserveIntent` carry `policies`. The intent is already trips-specific (`capKey`), so T0.6 can pass them deterministically through the 4-argument Sellable call, and the cache becomes a fallback only.

### N2 MINOR: HMAC falls back to sha256 silently when `SESSION_SECRET` is absent
**Where:** `capacity.ts:130-133`.

**Problems:**
- Two processes with different secret states (web vs a worker or script), or a secret rotation, produce different `capKeyHash` values for the same capKey. Then:
  - `assertHoldOwner` returns HOLD_NOT_FOUND for the public owner's own convert/release/extend;
  - the cap count resets, allowing extra holds;
  - rekey misses holds.
- Bounded by the hold lifetime, but silent.
- `core/signed-link` fails closed instead (`:43`).

**Fix:** throw when `NODE_ENV === "production"` and the secret is missing; keep the labelled fallback only outside production. Note in the runbook that rotating the secret strands public holds for at most T5.

### N3 MINOR (trap for T0.6): `capacityRowsOf` opens its own connections
**Where:** `service:490-513` (`gateOf`, `readHold`, `depRefs`, `policiesFor`).

It takes no `tx`. If T0.6 calls it inside its basket transaction ("read unlocked, then lock"), M1's pool stall returns. **Fix:** add to the doc comment and the facade: "call before opening the transaction; never inside one".

### N4 MINOR: offer failures inside the savepoint are swallowed
**Where:** `capacity.ts:761`.

The catch-all hides integrity incidents (CHECK, held below holds) and real 40P01s without logging; the offer just stops. **Fix:** capture the error and rethrow anything that is not a `CapacityAbort` without an incident (after rolling back to the savepoint, only "stop offering"). Or return it so the wrapper calls `reportCapacityIncident` after commit.

### N5 MINOR: `runWaitlistOffers` can starve
**Where:** `jobs.ts:216-224`.

**Problem:** the filter selects departures with `publicLeft > 0`, but a departure whose head waiter needs more than `publicLeft` (strict FIFO, no offer) stays selected forever. With more than 200 such departures, `ORDER BY departureId LIMIT 200` reprocesses the same 200 and never reaches the rest.

**Fix:** select only when `publicLeft ≥ qty` of the head WAITING row (`LATERAL` / `MIN` by createdAt), or rotate the cursor.

### N6 MINOR: departureCountersUnchangedSql contradicts its comment
See (a): change it to `sold + held`.

### Checked: no defect
- **Nested transactions.** No path in `capacity-service.ts` opens a transaction while inside one:
  - every wrapper calls `runTx` at top level;
  - `jobs.ts`, `waitlist.ts` and the outbox consumer call wrappers outside any transaction;
  - `capacity.ts` cannot (guard).
  - T0.6 must call only `*InTx` and `insertHoldInTx` inside its transaction, never the wrappers.
- **Savepoints in Prisma interactive transactions.** Raw `SAVEPOINT` / `ROLLBACK TO` / `RELEASE` run on the interactive transaction's single connection.
  - Same pattern as T0.3 `underSavepoint`.
  - They nest correctly inside a caller's own savepoint. The fixed names are unique to their functions, and neither function is re-entrant.
  - A 0-row UPDATE does not abort the transaction. A DB error inside the savepoint is fully recovered by `ROLLBACK TO`.
- **`pg_try_advisory_xact_lock`** (`:526-529`).
  - Same key already held by **this** session (the basket's `acquireHoldCapInTx` earlier in the same transaction): returns true immediately and is re-entrant (the lock count stacks and is released at commit).
  - Held by **another** session: returns false at once, giving `BUSY` (retryable). It never waits, so it cannot form a wait cycle even though it comes after the product SHARE lock.
  - Side effect: two tabs of one basket racing get one BUSY; a 32-bit `hashtext` collision with another basket gives a spurious BUSY (negligible).
  - T0.6 must take layer 0 via `acquireHoldCapInTx(capKey = the same "basket:<h>", add = number of lines)`. The TRY check inside `reserveInTx` counts `+1` per row and cannot see the basket's other not-yet-inserted lines, so the layer-0 check is the real cap.
- **Sweeper batch.**
  - Per unit, per page: at most 200 holds and 200 departures in one transaction, departures locked in id order by a single `ORDER BY id FOR UPDATE`; inside the 60 s transaction timeout.
  - 20,000 due holds = 100 transactions (builder measured 34.6 s; the hunter measured 177 s on r1's per-departure design).
  - If a batch fails, it falls back to one transaction per departure, so one bad departure cannot block the others; `missing` and no-progress departures are skipped.
  - It depends only on the stored `expiresAt`; settings are loaded only for departures with waiters, and invalid settings mean "no offer", not "no expiry". Correct.

---

## (d) T0.6 flow against the exported signatures (lock order advisory → product → departure → hold → booking → promo)

Everything T0.6 needs is exported: `loadCapacityPolicies`, `acquireHoldCapInTx`, `reserveInTx`, `insertHoldInTx`, `rekeyHoldsToContactInTx`, `convertHoldInTx`, `releaseHoldInTx`, `returnSoldInTx`, `moveSoldInTx`, `reportCapacityIncident`. Constraints T0.6 must obey:

1. **Before the transaction:** `quoteTrips`, `buildTripBookingSnapshot`, `capacityRowsOf` and `loadCapacityPolicies` all open their own connections. Call them before the transaction, never inside it (N3).
2. **Hold, multi-product basket.** `reserveInTx` takes each row's product SHARE right before that row's departure. In a basket [P1/D1, P2/D2], P2's SHARE is requested while D1 is held: product-after-departure.
   - With a queued product writer this can produce 40P01. It is detected and retried, so it is not a hang.
   - Fix (in T0.6): after layer 0, call `assertProductSellableInTx` for all distinct products in id order. A later re-request of a SHARE lock this transaction already holds does not wait.
3. **Confirm order: rekey FIRST, then convert.** `rekeyHoldsToContactInTx` only re-keys ACTIVE holds and is a layer-0 lock. If it runs after `convertHoldInTx`, as the prompt's sequence suggests (confirm/convert → promo → rekey), it fails with HOLD_EXPIRED because the holds are CONVERTED. It would also take layer 0 after layers 1a/2a.
   - Correct order: rekey (advisory) → convert each hold in departure-id order → booking (2b) → promo → outbox.
4. **Promo.** `redeemPromoInTx` takes an advisory lock and UPDATEs the `TripPriceRule` row last, which is fine for confirm. But `releasePromoInTx` locks `TripPriceRule FOR UPDATE`. A T0.7 cancel must call `returnSoldInTx` / `releaseHoldInTx` **before** `releasePromoInTx`; otherwise cancel (rule → departure) against confirm (departure → rule) deadlocks.
5. **Public confirm** must pass the basket `capKey` to `convertHoldInTx`; a SYSTEM actor (slip consumer) need not.
   - An expired hold gives HOLD_EXPIRED and the whole confirm rolls back. The D.4.4 re-hold must run in a new transaction: `reserveInTx(HOLD)` → `insertHoldInTx` → `convertHoldInTx`.
6. **`insertHoldInTx`** never touches counters. It must only follow a successful `reserveInTx(HOLD)` for the same departure and qty in the same transaction; otherwise `held ≠ Σ ACTIVE holds`. Document this on the function.
7. **Sellable 4-argument `reserveInTx`** depends on the policy cache; see the N1 fix (carry the policies in the intent).

## Builder decisions (r2)
| Decision | Verdict |
|---|---|
| Split into in-tx `capacity.ts` and wrapper `capacity-service.ts` | Agree |
| Offers under a savepoint | Agree |
| TRY lock in `reserveInTx` | Agree |
| `used = sold + held` | Agree |
| Tenant-wide cap | Agree |
| Policy cache | Agree in principle; fix eviction and the `holdCap` source (N1) |
| HMAC fallback | Acceptable outside production only (N2) |
