# T0.4 independent review: wip/trips-t0.4 @ d4a91465c

**Verdict: FIX FIRST.** 0 BLOCKER · 5 MAJOR · 14 MINOR

**Oversell.** I found no path that oversells. All 10 counter statements in `capacity.ts` (328–410) are single `UPDATE … WHERE … RETURNING` statements. Each WHERE carries its complete guard and `"tenantId"` + `"unitId"`, and each result goes through `expectRows` or `holdFailure`. No path uses Prisma `update` or read-then-write on `sold`, `held` or `reserved`. The convert, release and sweeper paths take `q` from the CAS'd hold row's `RETURNING`, not from the caller. The DB CHECK `sold+held+reserved <= capacity` backs this up.

**Status guards.** All are correct:
- hold and hold-from-reserved require OPEN/GUARANTEED and an unpassed cutoff.
- convert has no status or cutoff guard. It works on a FULL departure and after cutoff. The service blocks only CANCELLED, which returns SLOT_CLOSED.
- release, the sweeper and return have no status guard, so they work in every status.

**AFTER values.** Every statement passes AFTER values correctly. `used` is sold+held: hold `+n` · convert unchanged (sold `+q`) · release / unhold `−q` · return / return-to-reserved `sold−n` · move-in `+n` · reserve / unreserve unchanged.

**GUARANTEED.** The CASE only rewrites FULL or sets FULL, so GUARANTEED never reverts on a counter path. FULL→free goes back to GUARANTEED through `guaranteedAt`, and T0.3 `setDepartureStatus` and the seed set `guaranteedAt`.

**Hold lifecycle.** Each hold leaves ACTIVE exactly once:
- **convert vs sweeper.** Both take the 1a lock, then CAS `status='ACTIVE'`. Exactly one wins and the counters move once.
- **Convert 1 ms after expiry, sweeper not yet run.** The CAS has `expiresAt > $now`, so the result is HOLD_EXPIRED with the counters untouched. The sweeper frees the seats later.
- **Two sweepers.** The second CAS returns 0 rows, so nothing happens.

---

## MAJOR

### M1. `*InTx` functions open a second pool connection while the caller's transaction is open (pool self-deadlock)
**Where:** `capacity.ts:926-932` (`releaseHoldInTx` → `policyFor`), `:976-980` (`returnSoldInTx`, when `toReserved` is false), `:1062` → `:1036-1041` (`moveSoldInTx` → `policiesFor`), `:1190` (`rekeyHoldsToContactInTx` → `resolveSettings`). `core/settings/service.ts` reads through the global `prisma`.

**Pool size.** `core/db.ts:23` builds `PrismaPg` with no `max`, so it uses pg's default of **10 connections per process**.

**Interleaving.** T0.6 confirm calls `rekeyHoldsToContactInTx` on every public confirm (D.6 contact re-check). With 10 confirms in flight on one process:
- each holds 1 connection inside its transaction and waits for an 11th to read X10;
- nothing can ever free one;
- every transaction hits its timeout (`TX_OPTS` 60 s, global 30 s), so all fail as BUSY;
- **every other request on that process stalls for the same time.**

Fewer than 10 concurrent confirms still eat into headroom. Cancel and move (`releaseHoldInTx`, `returnSoldInTx`, `moveSoldInTx`) have the same problem at lower concurrency.

**Fix now (it is the T0.6 interface):**
- Export a pre-transaction loader, e.g. `loadCapacityPolicies(ctx, departureIds) → Map<depId, Policy>`.
- Make every `*InTx` take `policy` (and `holdCap` for rekey) as a required input. Throw if it is missing; never resolve settings inside the transaction.
- `acquireHoldCapInTx` already follows this pattern (the caller passes `limit`).
- Add a QC probe: `connection_limit` = N, with N+2 concurrent `*InTx` calls, finishes with no P2028.

### M2. The waitlist offer can abort the transaction that frees the seats, so seats stay held for good
**Where:** `offerNextInTx` (`capacity.ts:575-619`) calls `holdSeatsSql` (`:590`). On 0 rows, `holdSeatsSql` throws (`:334`). Callers are the sweeper (`:1254`), release (`:940`), return (`:984`), move (`:1032`) and decline/leave (`waitlist.ts:137`).

**Problem.** The offer gate is `blockOf(WEB)`, computed from the *current* T6 setting. The SQL guard uses the stored `"cutoffAt"` column. That column is only recomputed when someone runs `refreshDeparturePolicy` by hand (`departures.ts:1156`).

**Interleaving.**
1. The owner moves the WEB cutoff later (e.g. 1 day → 2 h) and does not run refresh.
2. On day D−1 a hold expires and there is a waiter.
3. `blockOf(WEB)` returns null, but the SQL `"cutoffAt" > now` is false.
4. CUTOFF_PASSED is thrown and the sweeper transaction for that departure rolls back. This repeats every minute, and the job skips the departure.
5. Result: `held` never drops, HOLD/PENDING bookings never expire, and `releaseHold` / `returnSold` / decline on that departure all fail with CUTOFF_PASSED.

**Fix:**
- Offering must never fail the freeing action. In `offerNextInTx`, also stop when `d.cutoffAt <= now`.
- Catch a `CapacityAbort` from `holdSeatsSql` and `break`. A 0-row UPDATE does not abort the pg transaction, so catching is safe.
- Add a test: stale `cutoffAt` + expired hold + waiter → the hold expires, `held` drops, no offer is made.

### M3. `reserveInTx(op HOLD)` is weaker than `placeHold`, and its allotment branch is unusable
**Where:** `capacity.ts:1145-1152`.

**Missing checks.** It relies only on the SQL guard: status plus the `cutoffAt` column, which holds the **latest** channel cutoff (`departures-core.ts:279`). It does not check:
- per-channel cutoff
- `stopSell`
- product/option sellability
- the FULL → SOLD_OUT details

Example: a WEB basket going through `platform/basket` → `reserveInTx` holds after the WEB cutoff, as long as COUNTER is still open. Stop-sell is ignored on the basket path, which T0.6/T1 will use.

**Allotment branch.** `qtyAllot > 0` is accepted (`:1150` runs `holdFromReservedSql`) for STAFF, SYSTEM and PUBLIC, with no `AgentAllotment` row. That moves seats `reserved → held` and breaks Σallotment = reserved. The resulting hold then cannot be converted or released (`:854`, `:925` reject `qtyAllot > 0`), so it is stuck until the sweeper takes it.

**Fix:**
- For HOLD, run `blockOf(d, policy, tz, ctx.channel, now, false)` under the lock. The policy comes in from the caller, as in M1.
- Reject `qtyAllot > 0` with `FORBIDDEN AGENCY_NOT_ENABLED` until A1.4.
- State in the doc comment that the caller calls `assertProductSellableInTx` before phase 1.

### M4. Availability ignores product and option status
**Where:** `getAvailability` and `listAvailability` (`capacity.ts:650-689`) read only `TripDeparture`.

**Problem.** For a DRAFT or ARCHIVED product, or an inactive option, `publicLeft > 0` comes back with `saleBlock: null`. That leaks unpublished products' schedules to PUBLIC/CHAT_AI callers through `tripSellable.availability`. `placeHold` then answers SLOT_CLOSED (`TripProductNotSellableError`), so the number shown is not the real number.

**Fix:**
- JOIN `TripProduct` (+ option) in both queries.
- Product not ACTIVE or option inactive → `saleBlock "STATUS"`, `publicLeft 0`.
- For PUBLIC/AGENT on a non-ACTIVE product, return NOT_FOUND or an empty list (same message as X1).

### M5. Lock order: `placeHold` takes the product lock before the layer-0 advisory lock
**Where:** `capacity.ts:770-772` takes product FOR SHARE, then `lockCap`. The header (`:7`) states the same order.

**Conflict with the contract.** CC §D.5 puts layer 0 (SellBasket FOR UPDATE + advisory) first. T0.6's basket will do layer 0 first, then `assertProductSellableInTx`, which is the reverse.

**Interleaving.**
1. A (`placeHold`) holds product SHARE and waits for advisory K.
2. W (product edit/archive) queues for the product row. It now holds the tuple lock.
3. B (basket) holds K and requests product SHARE. It queues behind W.
4. Cycle A → K(B) → tuple(W) → A gives 40P01. The D.5 X tests require no 40P01.

**Fix:**
- Swap `:770` and `:772`: `lockCap` first (PUBLIC), then `assertProductSellableInTx`.
- Write the canonical order in the facade doc: **0 (basket, then advisory) → product SHARE → 1a (id order) → 2a → 2a′ → 2b → 2h**.

---

## MINOR

### m1. `counterSql` turns 23514 into "0 rows" (`capacity.ts:300-307`)
All WHERE guards already make 23514 unreachable, so if it ever fires it means invariant corruption. Today it is reported as SOLD_OUT, STATE_CONFLICT or INSUFFICIENT_ALLOTMENT with no `logOps`. The error also leaves the pg transaction aborted. In `holdSeatsSql`, `holdFailure` then runs another query, which raises a raw **25P02** that `runTx` rethrows unmapped. That violates §13's "no raw error" rule.

**Fix:** drop the catch. `runTx` already maps 23514 → STATE_CONFLICT (`:545`). Add `logOps` ERROR for 23514 and for the STATE_CONFLICT non-negativity guards (CC D.0.2). In `*InTx`, rethrow it as `CapacityAbort("STATE_CONFLICT")`.

### m2. Sweeper takes 2a/2a′ after 2b (`capacity.ts:1237-1254`)
It expires bookings (2b, FOR UPDATE) and *then* `offerNextInTx` inserts a TripHold and updates TripWaitlist. There is no real cycle because every waitlist/offer writer holds the departure lock first, but it breaks the D.5 rule. **Fix:** call `offerNextInTx` before the booking CTE.

### m3. Status expression: two definitions of `used`
- The builder's reading, `used = sold + held`, is correct. Brief §4 point 3 says it word for word. It is needed so an agency can still `holdFromReserved` (that statement requires OPEN/GUARANTEED). It also implies FULL ⇒ reserved = 0, and every T0.4 path keeps that (reserve on FULL fails the capacity guard; unhold/return-to-reserved drop sold+held below capacity, so FULL → OPEN).
- With reserved > 0 and sold+held+reserved = capacity, the system is consistent:
  - status is OPEN;
  - `getAvailability` gives `publicLeft 0`, `saleBlock null`, `showLeft false`;
  - `placeHold` gives SOLD_OUT `{publicLeft:0}`;
  - `joinWaitlist` is allowed;
  - the offer step makes no offer (qty > 0).
  
  So the UI must show "full" from `publicLeft`, not from `status`.
- **Fix:** correct the T0.3 doc comment (`departures.ts:157,173,177` says `used` includes reserved). T0.3 `setDepartureCapacity` (setFull false, used = s+h+r) cutting capacity to exactly s+h with r = 0 leaves OPEN instead of FULL. Either accept that or pass `setFull: true` with `used = s+h` there.

### m4. `runWaitlistOffers` is unbounded and unfiltered (`jobs.ts:175`)
It takes every departure with WAITING rows, with no `LIMIT` and no `publicLeft > 0` filter (brief §6). Every 5 min it resolves settings and takes a FOR UPDATE on every *full* departure that has waiters, contending with holds.

CLOSED departures past their start never expire WAITING rows. `saleBlockReason` returns `STATUS` before `STARTED` (`departures-core.ts:324`), so `offerCore` (`waitlist.ts:178`) keeps rescanning them forever.

**Fix:**
- Raw filter: `(capacity−sold−held−reserved > 0 OR startsAt <= now OR status IN ('CANCELLED','CLOSED'))`, paged with a LIMIT.
- In `offerCore`, expire WAITING when `now >= startsAt`, whatever the status.

### m5. FIFO tie (`waitlist.ts:101`, `capacity.ts:584`)
`createdAt` is `TIMESTAMP(3)` from `clock_timestamp()`. Two joins in the same millisecond are ordered by a random UUID `id`, so strict FIFO breaks. **Fix:** under the departure lock, insert `GREATEST(clock_timestamp(), max(createdAt) + 1 ms)` of that departure, or use a sequence column.

### m6. Waitlist edge cases
- Join does not map 23505 from the partial unique (`waitlist.ts:99`); `runTx` rethrows it raw. It is unreachable under the departure lock, but the brief requires a named error. **Fix:** catch 23505, re-read the row, return `duplicated`.
- `unreserveSeatsInTx` frees public seats but does not offer; only the job backstops it. Acceptable, but note it for A1.4.
- `exitCore`'s final UPDATE (`:133`) has no row-count check. It is benign.

### m7. Fail closed for PUBLIC now
The services accept `actor PUBLIC` in leave, decline, offer, list, convert, extend, release, `returnSold` and `moveSold`, with no ownership check.
- **Not exploitable today:** only staff actions exist and the services are server-only.
- **Exploitable once W1 wires them:** `listWaitlist` returns the ids that `leaveWaitlist` accepts.
- Separately, PUBLIC `placeHold` accepts caller `bookingId` and `basketId`. The sweeper then expires whatever booking that `bookingId` points to (`:1240`).

**Fix:** return PUBLIC ⇒ FORBIDDEN in those services until the ownership token exists (T1/W1). Reject `bookingId`/`basketId` from PUBLIC, or verify that the booking belongs to the basket.

I agree the missing leave/decline ownership is debt; I only disagree on leaving the services open in the meantime.

### m8. `readHoldByKey` has no unitId (`capacity.ts:432`)
The same STAFF user with the same key in two units of one tenant gets the other unit's hold (`holdId`, `expiresAt`) as `duplicated`, or IDEMPOTENCY_CONFLICT. **Fix:** add `"unitId"`; a match from another unit ⇒ IDEMPOTENCY_CONFLICT.

### m9. `holdCapKeyHash` is plain `sha256("trips-holdcap:"+capKey)` (`:123`)
For `contact:<phone>`, a phone number can be recovered by enumeration (X8). **Fix:** HMAC with a server secret. That is platform debt if no helper exists; `core/hash.ts` has none.

The cap is counted tenant-wide (filter `"tenantId"` at `:564`), so no cross-tenant leak. One basket key can block another shop's unit only inside the same tenant, which is by design. The advisory-lock key is a global 32-bit `hashtext`; collisions only serialise, they do not leak.

### m10. Contact re-check takes layer 0 late
`rekeyHoldsToContactInTx` takes the layer-0 advisory lock after T0.6 has already taken 1a/2a. No cycle exists today, because only rekey takes `contact:` keys. **For T0.6:** call it first in the confirm transaction.

### m11. Caller constraints for `moveSoldInTx` and `convertHoldInTx`
- `moveSoldInTx` calls `assertProductSellableInTx` and locks both departures itself. The caller must hold **no** departure lock beforehand; otherwise product-after-departure and D2-before-D1 are possible.
- `convertHoldInTx` must run before T0.6 locks the booking (2b).

**Fix:** put both constraints in the doc comments.

### m12. No reusable phase-2 primitive for T0.6
`insertHold` and the policy loader are private. T0.6 `finalizeInTx` would have to re-implement the TripHold INSERT (capKeyHash, requestHash, idemKey, `expiresAt`), which goes against M-3 "single source". **Fix:** export `insertHoldInTx(tx, ctx, {departureId, qty, purpose, capKey, idempotencyKey, policy, …})`.

### m13. `extendHold` (`:818-847`) checks neither departure CANCELLED nor started
A SHOP_CONFIRM or SUPPLIER hold on a cancelled or past departure can be extended indefinitely. **Fix:** check the departure, return SLOT_CLOSED.

### m14. Small items
- `listAvailability` accepts `paxTotal` and ignores it.
- The PUBLIC rate limit is consumed by idempotent replays (`:744` runs before the `prior` lookup). Acceptable; document it.
- `Date.now()` for the job budget is fine (wall clock).
- `clock_timestamp()` for ordering is fine apart from m5.

---

## Checked and OK
- **capacity-core.ts:** pure (type-only imports).
- **Code rules:** no `any`; zod strict on inputs; QTY 1–50; cap inputs bounded to int4.
- **Messages:** Thai; X1 uses the same NOT_FOUND text throughout.
- **"use server":** exports only async functions; every action does `requireUnit` + rbac; no `now` parameter.
- **Events:** 4 events, registered in automation and outbox; webhooks pick them up through the spread. Payloads are ids, qty, channel and satang only.
- **No deletes**, and no caller-controlled objects in Prisma `data`.
- **Idempotency:** replay returns the same hold; a different `requestHash` returns IDEMPOTENCY_CONFLICT; an insert race goes through ON CONFLICT → `IdemRace` → re-read.
- **Hold cap:** counted and inserted under one advisory lock; only `expiresAt > $now` counts.
- **Rate limit:** runs before the departure lookup; unknown or foreign ids get the same NOT_FOUND.
- **Purpose timers:** SHOP_CONFIRM and SUPPLIER_REQUEST holds get their own `expiresAt`, so the payment timer does not sweep them. The sweeper expires bookings only in HOLD/PENDING, via CAS in id order.
- **Jobs:** per-departure try/catch + `failed[]`; `signal` and `deadline` respected; termination guaranteed by the `skip` set.
- **Waitlist:**
  - strict FIFO (`break` when the head does not fit);
  - offer in the same transaction for release, sweeper, return and decline;
  - the offer's expiry passes to the next waiter in the same transaction;
  - no offer after the WEB cutoff;
  - X4: a duplicate event gives one offer (`wl:<id>` + WAITING CAS under the departure lock).
- **Skipped advisory lock in the offer:** I agree with the builder. The offer `capKey` is `waitlist:<id>`, which is unique, so it serialises nothing, and taking it after 1a would itself break layer order.
- **Deadlock trace:** place, extend, release, convert, return, move (canonical id order in both directions), sweeper, waitlist, T0.3 capacity edit / cancel / min-pax / materialisation. No cycle among T0.4 + T0.3 paths, apart from M5 (against the T0.6 basket) and m10/m11 (caller-dependent).
- **Sellable:**
  - `sellable-impl.ts` matches `core/sellable.ts`: `availability` → `listAvailability`, `capacityRowsOf`, `reserveInTx`.
  - `quote`, `hold`, `confirm`, `cancel` and `finalizeInTx` return KIND_NOT_SUPPORTED (fail closed).
  - `platform/sellables.ts`: TRIP lazily loads the facade; any other kind gets KIND_NOT_SUPPORTED. `requestHash` delegates to `holdRequestHash`.
  - **Merge with T0.5:** keep T0.4's members, take T0.5's `quote` line, and keep the `notYet` helper for hold/confirm/cancel/finalizeInTx.

## Builder decisions
| Decision | Verdict |
|---|---|
| `used = sold + held` | Agree (brief §4 point 3); fix the T0.3 comment (m3) |
| Skip the advisory lock in the offer | Agree |
| Public leave/decline without an ownership token is debt | Agree it is debt, but fail closed now (m7) |
| Cap counted tenant-wide by `capKeyHash` | Agree; HMAC for contact keys (m9) |
| `*InTx` reading settings on a second connection is acceptable | **Disagree**: fix now (M1) |
