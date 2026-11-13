# T0.6 booking core: bug hunt report

- Tree: `/root/projects/shark-trips-l1`, branch `wip/trips-t0.6`, HEAD `711c9c75a`. Product code was not modified and nothing was committed.
- QC DB: `ep-green-sound` (qc-trips). Every probe ran its own temporary tenants (`trips-t06h-*`) and cleaned them up afterwards (`Tenant trips-t06h-* left 0` after every run). The global sweeper was only run as `runExpireHolds(now, { tenantIds: [own] })`.
- Probes (untracked, new files only):
  - `scripts/probe-trips-t0.6-lib.mts`: harness, the I1–I5 checkers, positive controls, connection/deadlock sampler.
  - `scripts/probe-trips-t0.6-storm.mts`: workloads PC, A, B, C, D, F, G, G2, P (`--only=… --rounds=N`).
  - `scripts/probe-trips-t0.6-edges.mts`: workloads E, H, I, K, T (TOCTOU), X (PENDING/idempotency/cap), J.
  - `scripts/probe-trips-t0.6-deadlock.mts`: minimal reproduction of the counter-lock deadlock, plus the rekey∥sweeper race (`--only=RK`).
- Run: `bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-trips-t0.6-<name>.mts [flags]`
- Logs: `run-*.log` in this folder.

## Verdict: **FIX FIRST**

The core seat, money and numbering invariants held across about 3,900 operations. No I1–I3 violation was found, I4 held apart from the documented consumer gap, and every observed I5 breach traces to defect 4. Five defects were reproduced deterministically:

| # | severity | defect |
|---|---|---|
| 1 | **MAJOR (borderline BLOCKER)** | Booking-code counter rows are locked in basket line order. Baskets that span two travel months in opposite order deadlock; under 40 callers, 70–78 % get `BUSY` and the rest wait about 130 s. |
| 2 | **MAJOR** | A price-override approval is bound to nothing except `status = APPROVED`. Any approved request in the tenant (even `hr.leave`, another unit, amount 1) authorises any price, any number of times. |
| 3 | **MAJOR** | Option TOCTOU: the in-tx sellability check omits `optionId`, so a booking commits on an option disabled after prepare. The product-archive control is correctly rejected. |
| 4 | **MAJOR** | The T0.4 `releaseHold` releases a hold that is bound to a HOLD-status booking. The booking stays `HOLD` with no seats (I5). A PUBLIC actor can do this too, using `capKey = "contact:tel:<phone>"`. |
| 5 | **MINOR→MAJOR** | A NUL byte in a passenger name makes `confirmTrips`/`bookTripsNow` throw a raw `DriverAdapterError` (PUBLIC can trigger it). A NUL in the booker name silently creates a booking with `bookerPartyId = null`. |

There are also six MINOR findings; see the MINOR section below.

---

## Reproduced defects

### 1. Counter-row deadlock from unsorted numbering — MAJOR (I6/I7)
- **Where:** `booking.ts:777-778`. `for (const l of P.lines) { nextBookingCodeInTx(...) }` locks `SellCounter(tenant, prefix, period)` rows in **line order**. Departures are sorted, but the counter rows (one per travel month) are not. Basket X = [May, Apr] and basket Y = [Apr, May] on disjoint departures lock the two counter rows in opposite order.
- **Reproduction:** `probe-trips-t0.6-deadlock.mts --n=40 --pairs=20`. Prices and quotes are prepared outside the timed window; every request is a STAFF `bookTripsNow` with 2 lines.

| wave | result | DB deadlocks Δ | wall / p50 |
|---|---|---|---|
| 40 × same order [Apr,May] (control) | ok 40 | 0 | 7.5 s / 5.6 s |
| 40 × mixed order | **BUSY 31 · ok 9** | **141** | 145.7 s / 130.2 s |
| 40 × same order [May,Apr] (control) | ok 40 | 0 | 7.3 s / 5.3 s |
| 40 × mixed order (again) | **BUSY 28 · ok 12** | **140** | 144.9 s / 133.0 s |
| 20 trials × 2 callers, opposite order | ok (retry hides it) | **18 / 20 trials** | |
| 20 trials × 2 callers, same order | ok | 0 / 20 | |

- The storm probe's G2 group (40 mixed-order two-line baskets per round, hold+confirm and bookNow mixed) reproduced it in 3/3 rounds: BUSY 22/40, 26/40, 21/40; deadlocks 119/127/115; max latency 122–130 s.
- **Observed vs expected:** expected 40/40 ok in about 7 s, as in the control. Observed: 40P01 retried `LOCK_RETRIES = 3` times, then `BUSY`, and each deadlock costs `deadlock_timeout`. The deadlocks are mapped to a named code (`BUSY`), so I7 is technically met, but I6 (no ~30 s stall) is violated.
- **Caveat:** the deadlock counter is DB-wide (`pg_stat_database`), so other lanes could add noise. The same-order controls between the mixed waves read exactly 0, so the delta is attributable.
- **Fix idea:** allocate codes in sorted `(prefix, period)` order before the inserts. For example, collect the distinct periods, sort them, call `nextSeqInTx` once per booking in that order, then map the codes back to their lines.

### 2. Override approval not bound to entity, line, amount or unit; reusable without limit — MAJOR
- **Where:** `booking.ts:190-195` (`approvalsGate` only checks `requestStatuses(...)[id] === "APPROVED"`) and `pricing-core.ts:905-909` (matches only on caller-supplied `itemRef`/`unitMinor`/`resolvedMinor`). `ApprovalRequest` has `entityType`, `entityId`, `unitId` and `amountSatang`, but none of them is read.
- **Reproduction:** `probe-trips-t0.6-edges.mts --only=H`. STAFF with `canOverride: true`, override `seat:ADULT`, list price 350,000. Seen in 2 runs with identical results.

| case | result |
|---|---|
| H0 proper `trips.price_override` APPROVED at 200,000 | ok, gross 260,000 (control) |
| H1 same approval id reused on a 2nd booking | **ok** |
| H2 same approval id, different amount 100,000 | **ok**, gross 160,000 |
| H3 APPROVED `entityType: "hr.leave"`, `unitId` = another unit, `amountSatang: 1`, used for a 1,000-satang seat | **ok**, gross 61,000 |
| H4 another tenant's approval id | FORBIDDEN/APPROVAL_NOT_APPROVED ✓ |
| H5 missing `resolvedMinor` | VALIDATION/APPROVAL_RESOLVED_REQUIRED ✓ |
| H6 wrong `resolvedMinor` | REQUIRES_APPROVAL ✓ |
| H7 PENDING / H8 REJECTED | FORBIDDEN ✓ |
| H10 override without `canOverride` | FORBIDDEN ✓ |
| H9 PUBLIC hold sending `overrideApprovals` only | ok (ignored, but it still queries approval status) |

- **Expected:** an approval authorises one `trips.price_override` request, for this unit, at the approved amount and line (and ideally only once).
- **Observed:** a user holding `trips.price.override` can bypass the "requires approval" ceiling by citing any approved request id in the tenant.
- **Note:** brief §5.2 item 6 only asks for the status check, so this is a spec gap. It still defeats the control, so the controller should rule on it.

### 3. Option disabled between prepare and tx still books — MAJOR
- **Where:** `booking.ts:287-297`. `lockProductsInTx` calls `assertProductSellableInTx(tx, { tenantId, unitId, productId })` **without `optionId`**, although that function checks `TripOption.active` when given one (`products.ts:1424-1432`). The option is only checked by `quoteTrips`, outside the tx.
- **Reproduction:** `probe-trips-t0.6-edges.mts --only=T`, deterministic, 2 runs × {PUBLIC, STAFF} = 4/4.
  1. The probe takes `SELECT … FROM "SellBasket" WHERE id = $basket FOR UPDATE` on its own connection.
  2. It starts `confirmTrips`, which finishes prepare and blocks at layer 0.
  3. `setOptionActive(opt, false)` commits (it locks the product FOR UPDATE, which is free at that moment).
  4. The probe releases its lock, and the confirm returns **ok**.
- **Control (same harness):** `archiveProduct` instead of disabling the option is correctly rejected (PUBLIC `NOT_FOUND`, STAFF `SLOT_CLOSED`).
- **Expected:** NOT_FOUND / SLOT_CLOSED (T0.4 ruling 2: PUBLIC holds and sells only ACTIVE products with an open option). Observed: a booking on a disabled option.
- **Fix idea:** pass `optionId` from each line into `assertProductSellableInTx`, deduplicated per (product, option) and keeping the sort by product id. The same applies in `bookTripsNow` and `changeTripBooking`.

### 4. T0.4 `releaseHold` frees the seats of a HOLD/PENDING booking — MAJOR (I5)
- **Where:** `capacity.ts:882-903` (`releaseCoreTx`) has no `bookingId IS NULL` guard. T0.6 binds holds to bookings in KEEP / SHOP_CONFIRM modes but does not protect them from the T0.4 wrapper.
- **Reproduction:** `probe-trips-t0.6-edges.mts --only=I`, 2 runs, 2/2 each.
  - (a) STAFF `releaseHold({ holdId })` on the hold of a PUBLIC PAY_NOW booking (status `HOLD`): ok. The booking stays **HOLD** with no ACTIVE hold, and the checker reports `I5-unpaid-nohold`.
  - (b) An unrelated PUBLIC actor (new `clientKey`) calls `releaseHold({ holdId, capKey: "contact:tel:+66812345678" })`. After rekey, ownership is just the contact key, which can be derived from the victim's phone. Result: ok, and the victim's booking is left HOLD with no seats.
  - The attacker needs the hold id, which is random and not public, so this is not trivially exploitable.
- **Expected:** STATE_CONFLICT for holds that have a `bookingId` (booking-bound holds should only change through cancel, approve or reject, or the T0.7 payment path).
- **Impact:** seats are re-sold while the booking still shows HOLD. In T0.7, a payment on that booking would convert nothing.

### 5. NUL byte in names — MINOR→MAJOR
- **Reproduction:** `probe-trips-t0.6-edges.mts --only=K`, 2 runs, deterministic.
- **Passenger name `"x\u0000y"`:** `bookTripsNow` (STAFF) and `confirmTrips` (PUBLIC) **throw** `DriverAdapterError: invalid byte sequence for encoding "UTF8": 0x00` from the `tripPassenger.createMany` in the tx. The tx rolls back, so nothing is written, but the caller gets an unhandled error instead of a `SellResult` (a 500 from the action). Fix: reject `\u0000` in the zod schemas (`booking-core.ts:51-59`).
- **Booker name `"a\u0000b"` (STAFF and PUBLIC):** returns **ok**. `safeFindOrCreate` fails (it logs `[party] safeFindOrCreate ล้มเหลว`) and `prepareCore` silently continues with `bookerPartyId = null` (`booking.ts:524`). The result is a booking with no booker: no name, no phone, nothing to contact. The same silent fallback applies to any party error, not just NUL.

---

## MINOR findings

- **M1. Identical hold retry after checkout** (`run-storm-full`, 1/1 per actor). STAFF gets `IDEMPOTENCY_CONFLICT` and PUBLIC gets `VALIDATION/BASKET_TOKEN_USED` instead of the original Hold. Nothing is written. Cause: checkout overwrites `SellBasket.idempotencyKey` with the confirm key, so the hold key is lost.
- **M2. Change drops the promo but keeps the redemption.** `booking.ts:1266` rejects `promoCode` on change, and the new snapshot has no promo. On a 2-adult booking with a 10 % code, the discount went from 70,000 to 0 while the redemption stayed ACTIVE and `usedCount` stayed 1 (2/2 runs). The customer silently loses the discount but still consumes the promo and per-contact quota. `usedCount = ACTIVE redemptions` still holds, but the redemption points at a booking with no discount.
- **M3. Change `idempotencyKey` accepted but ignored.** An identical retry after success returns STATE_CONFLICT. Five parallel identical changes give ok 1 and **IDEMPOTENCY_CONFLICT 4** (the add-on hold key `cg_<ver>_<id>` collides before the booking CAS runs). The code is misleading but nothing is double-written.
- **M4. `bookTripsNow` key equal to an earlier `holdTrips` key** returns `STATE_CONFLICT/BASKET_CHECKED_OUT`, although the basket is OPEN. The reason is misleading.
- **M5. `finalizeTripsInTx` trusts a caller-built `prepared` wholesale.** It is exported on the facade and through `tripSellable.finalizeInTx`. A forged `{status: "CONFIRMED", holdMode: "KEEP", grossSatang: 1}` was accepted: CONFIRMED booking `TR-7004-0001` at 1 satang, items sum 410,000, seat only held (I2-sold, I5, M2 checks fire). No caller in `src/` today (grep), so this is a K1.1 trust-boundary note rather than an exploitable bug.
- **M6. Public token and missing secret.**
  - With `NODE_ENV ≠ production` and no `SESSION_SECRET` (e.g. `test`, or a preview deployment), the token is `sha256("trips.booking.token.v1:dev:" + bookingId)`, an unkeyed formula anyone can compute.
  - In production without the secret, `bookTripsNow` **throws** a raw Error (`[trips/capacity] … SESSION_SECRET`, from `holdCapKeyHash`) instead of a SellResult. This is fail-closed as ruled, and nothing is written.
  - Same booking ⇒ same token ✓. Different bookings ⇒ different tokens ✓. Rotating the secret changes the token ✓. Production short secret (<32) throws ✓. Stored hash = sha256(token) ✓. Replay returns the same token ✓. The DTO has no token or hash ✓.

---

## Invariant checkers and positive controls (`--only=PC`, 2 runs)

The probe broke its own tenant's data on purpose, ran the checkers, then restored it.

| checker | corruption applied | result |
|---|---|---|
| I1 | `reserved = capacity + 1` | **prevented by DB CHECK** `TripDeparture_counters_capacity_check`, so I1 is DB-enforced |
| I2-sold | `sold + 1` | fires |
| I2-held | `held + 1` | fires |
| I3-gap | `SellCounter.seq + 1` | fires |
| I3-dup | copy another booking's code | **prevented by unique** `TripBooking_tenantId_code` |
| I4 | `usedCount + 1` | fires |
| I5 (no seat) | deactivate SEAT items | fires |
| I5 (basket CHECKED_OUT without bookings) | insert such a basket | fires |
| after restore | | clean |

Because of the unique index, a code collision would surface as 23505. `runBooking` maps every 23505 to `IDEMPOTENCY_CONFLICT`, so a real duplicate-code bug would be masked as an idempotency conflict (`booking.ts:145`). None was observed.

- **I4-orphan (expected):** after the T0.4 sweeper expires a promo booking, the redemption stays ACTIVE until `onTripBookingExpired` runs. Calling it released 1, and a second call released 0 (idempotent ✓). The consumer is wired in `src/lib/outbox-consumers.ts:1563`. During that window `usedCount` counts an EXPIRED booking (by design, §11 item 6).

## Workloads, operations and results

Operation counts are service calls (quote calls not included unless noted). Invariants were checked after every round. "Clean" means 0 violations apart from carry-over from deliberate I/T tests in the same tenant.

| workload | ops | key result |
|---|---|---|
| **A** last-seat storm (8 rounds rework + 6 rounds v1): cap 12, sold 2, 4 PUBLIC HOLD bookings cancelled mid-storm, 2 open baskets released mid-storm, 40 mixed buyers per round | 527 + 282 | sold = 12 = capacity every round; I1–I5 clean 14/14; 32 cancels and 16 releases all ok; no THROW or BUSY |
| **B** double submit ×2/5/10/20 (STAFF and PUBLIC), mixed bodies ×10, hold replay ×8, key reuse | 139 (×2 runs) | exactly 1 booking and 1 token each time; same key with a different body gives IDEMPOTENCY_CONFLICT; another key gives STATE_CONFLICT/BASKET_CHECKED_OUT; mixed bodies give 1 ok and 9 IDEMPOTENCY_CONFLICT with 1 booking; M1 found |
| **C** [P1,P2] vs [P2,P1] baskets ×30 per round with archive/restore/publish/option toggles (6 rounds) | 438 | 0 deadlocks; failures are NOT_FOUND from quotes while archived; I1–I5 clean |
| **D** confirm at expiry −1s/0/+1s ∥ tenant-scoped sweeper (14 rounds), KEEP+promo+sweep, REHOLD into full, REHOLD×2 for last seat | 139 + 181 | ok/HOLD_EXPIRED split, never both; REHOLD into full gives SOLD_OUT with 0 bookings; I1–I5 clean |
| **E** move A→B (1 seat left) ∥ bookNow ∥ cancel ∥ double change with the same version; A→B ∥ B→A swaps; grow ×10 for the last seat; move to another product's departure | 111 + ~70 | never two winners with the same version; grow gives exactly 1 ok; cross-product move gives NOT_FOUND; swaps had no deadlock or BUSY; M2 found |
| **F** promo `maxUses` 1/2/3 × 20 parallel confirms (9 rounds); PRICE_CHANGED injection | 364 | ok = maxUses every round; `usedCount` = ACTIVE redemptions; failures are PRICE_CHANGED/PROMO_EXHAUSTED with the hold still ACTIVE and 0 bookings; price edit gives PRICE_CHANGED with a new quote, nothing written, seqΔ 0 |
| **G** 50 parallel per round, two units, travel months Apr/May, `ctx.now` 16:59:59Z vs 17:00:01Z (3 rounds) | 225 | 150/150 ok; no duplicate codes; no gaps (counter seq = count per period) |
| **G2** two-line baskets in opposite period order ×40 (3 rounds) | 180 | **defect 1** |
| **P** pool: 80 parallel (40 PUBLIC hold+confirm, 40 bookNow) on 8 departures (3 rounds) | 360 | 240/240 ok; p50 5.8 s, p95 6.6 s, max 6.9 s; no P2028 or BUSY |
| **deadlock probe** | 240 bookNow (+ 240 quotes) | defect 1 reproduction |
| **RK** PUBLIC confirm (rekey UPDATEs TripHold before 1a) ∥ sweeper, 12 holds × 30 rounds + STAFF control | 600 confirms | 0 deadlocks (see S1) |
| **H** approvals | 21 × 2 | defect 2 |
| **I** isolation (tenant B, tenant B ctx with unit A, unit 2 × confirm/cancel/approve/get/change/list; PUBLIC mixed hold ids / other basket / no token; forged prepared) | 43 × 2 | all cross-tenant/unit attempts give NOT_FOUND / HOLD_NOT_FOUND / FORBIDDEN; list does not leak; defect 4; M5 |
| **K** inputs (int4+1, int4max, 0, −1, 1.5, 51, infant-only, duplicate pax entries, extras int4max, 200/21/20 lines, foreign option/slot/paxType/unit, NUL, lone surrogate, 201-char name, 39-digit phone, 2 passengers per seat, 110 KB passenger fields, PUBLIC no contact / WALLET / PAY_LATER, past `quoteExpiresAt`, invalid ctx, null input, SYSTEM/AGENT) | 42 × 2 | all rejected with named codes except defect 5; a 20-line basket gives 20 bookings correctly |
| **T** TOCTOU | 18 × 2 | defect 3; archive is correctly rejected; price edit mid-confirm books at the pre-edit price (by design: fingerprint checked outside the tx, ruling 6) |
| **X** approve ∥ reject ∥ cancel per PENDING booking (6 × 3 rounds); approve after expiry ∥ sweeper; cancel same key ×10; change replay; 8 baskets with the same phone | 139 | exactly 1 winner per booking (18/18); approve after expiry gives STATE_CONFLICT and the booking ends EXPIRED; cancel ×10 gives 10 ok and 1 event; per-contact cap gives ok 3, HOLD_LIMIT 5, 3 active holds; M3 found |
| **J** token | 12 × 2 | M6 |

- **Total:** about 3,900 service calls plus about 2,600 quote calls.
- **I6 measurements:** max client connections 12 (pooler view), max idle-in-transaction 10, no P2028 anywhere. The only stalls came from defect 1.
- **I7:** apart from the G2 waves (≈ 500 deadlocks over 5 waves, all mapped to retry or BUSY), the DB-wide deadlock delta was 0 in every workload.

## Suspicions not reproduced

- **S1. rekey vs sweeper lock order.** `rekeyHoldsToContactInTx` UPDATEs `TripHold` rows (row locks) **before** the 1a departure lock, while the sweeper locks departures and then UPDATEs the same hold rows. That is a theoretical inversion. 240 + 360 timed races (PUBLIC confirm at expiry −1 s ∥ `runExpireHolds` at +1 s with staggered start; results mixed ok/HOLD_EXPIRED, so the races did overlap) produced **0** deadlocks. Treat it as a review item; it is not a reproduced defect.
- **S2. Confirm on a departure set to CLOSED after the hold.** Not exercised. The KEEP path never re-reads the departure status. This is probably intended, since the hold already reserved the seat.

## Not tested

- The real server actions (`booking-actions.ts`: `requireUnit`/`assertCan`), which need a Next request context. Only the services were driven.
- The outbox worker invoking `onTripBookingExpired` on its own; the consumer was called directly.
- The global sweeper with far-future clocks (forbidden).
- AGENT flows, which are disabled (`AGENCY_NOT_ENABLED` confirmed).
- REHOLD for PUBLIC, which is STAFF-only by design.
- Real production Prisma pool sizing: the Neon pooler masks backend counts.
- Cross-kind (TRIP+TICKET) baskets, which belong to K1.1.
