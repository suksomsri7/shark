# T0.6 booking core: re-hunt r2 (after baebccfe1)

- Tree: `/root/projects/shark-trips-l1`, `wip/trips-t0.6`, HEAD `baebccfe1`. No product edits, no commits.
- New probe: `scripts/probe-trips-t0.6-r2.mts`, with groups PC, SW, Z and CH.
- Updated probes (still untracked changes on top of the committed versions):
  - `-storm`: B now varies the booker instead of `note`.
  - `-edges`: H rewritten for bound approvals; prepared tests and J rewritten; new cancel/change idempotency tests; K extended.
  - `-r2`: the CH advisory blocker is now transaction-level (pgbouncer).
- QC DB: `ep-green-sound` (qc-trips). Each run used its own `trips-t06h-*` tenants, and every run ended with `Tenant trips-t06h-* left 0`. The sweeper was only ever called as `runExpireHolds(<real now>, { tenantIds: [own] })`.
- Logs: `r2-run-*.log` in this folder.

## Verdict: **MERGE**

- All five earlier defects are fixed and verified.
- No new BLOCKER or MAJOR was found. New and residual MINORs are listed below.
- The most important regression check (SW) passes: unpaid bookings expire for real, their seats come back, and the promo is released by the consumer.

## Earlier defects: before → after

| # | earlier finding (r1) | r1 evidence | r2 result | status |
|---|---|---|---|---|
| 1 | Counter-row deadlock (unsorted numbering), MAJOR | 40 mixed-order callers: BUSY 31/40 and 28/40, 140 deadlocks per wave, p50 about 130 s; pairs 18/20 deadlocked | same probe: mixed 40/40 ok ×2, **0 deadlocks**, p50 5.7–6.0 s (controls 5.9–7.8 s); pairs 0/20; storm G2 3 rounds × 40 all ok, max 6.4 s, 0 deadlocks | **FIXED** |
| 2 | Approval not bound and reusable, MAJOR | hr.leave from another unit at amount 1 accepted; one id used 3 times | bound positive ok; reuse gives APPROVAL_USED; wrong amount, hr.leave, other unit, other departure, other tenant, PENDING and REJECTED all give APPROVAL_NOT_APPROVED; 20-way race gives exactly 1 ok + 19 APPROVAL_USED, 1 audit row, 0 deadlocks (see H) | **FIXED** (MINOR N1 below) |
| 3 | Option disabled mid-confirm still books, MAJOR | 4/4 ok | PUBLIC NOT_FOUND, STAFF SLOT_CLOSED, 2/2 each; also mid-change: SLOT_CLOSED; approve after option disabled: SLOT_CLOSED | **FIXED** (internal-API caveat N2) |
| 4 | T0.4 `releaseHold` frees seats of a HOLD booking, MAJOR | staff and a public attacker both ok; booking left HOLD with no seats | staff and attacker both `STATE_CONFLICT/HOLD_HAS_BOOKING`; booking keeps its hold; `extendHold` on a bound hold gives `PURPOSE_NOT_EXTENDABLE`; cancel/reject still release (forBookingId) | **FIXED** |
| 5 | NUL gives a raw driver error; booker without Party, MINOR→MAJOR | THROW DriverAdapterError; `bookerPartyId` null | NUL, TAB and DEL in booker name, passenger name or phone all give VALIDATION, and no service threw (0 THROW in all r2 runs); `bookerPartyId` null now returns BUSY BOOKER_UNAVAILABLE (code read; I could not force a Party failure now that NUL is rejected) | **FIXED** (MINOR N3: C1 and bidi characters pass) |
| M1 | Identical hold retry after checkout gives IDEMPOTENCY_CONFLICT / BASKET_TOKEN_USED | | unchanged, now documented in code (R12, no column for the pair) | accepted / unchanged |
| M2 | Change drops the promo but keeps the redemption | 70,000 discount gone, redemption ACTIVE | no flag or `dropPromo:false` gives `VALIDATION/PROMO_ON_CHANGE`; `dropPromo:true` releases the redemption (`usedCount` 1→0) and the code can be used again | **FIXED** |
| M3 | Change `idempotencyKey` ignored | retry gave STATE_CONFLICT | same key, same body: replay ok, ×5 parallel 5/5 ok, 2 audit rows in total; same key, different body: IDEMPOTENCY_CONFLICT | **FIXED** (residual N4) |
| M4 | bookNow key = earlier hold key gives BASKET_CHECKED_OUT | | IDEMPOTENCY_CONFLICT | **FIXED** |
| M5 | Forged `prepared` accepted by `finalizeTripsInTx` | CONFIRMED booking at 1 satang | plain forgery, unmodified `structuredClone`, other staff user, other tenant, wrong basketId and another PUBLIC client all give `VALIDATION/PREPARED_REQUIRED`; mutating a sealed prepared throws TypeError; same sealed prepared twice in parallel gives ok + HOLD_EXPIRED (1 booking); after commit gives HOLD_EXPIRED | **FIXED** (N2) |
| M6 | Unkeyed dev token; raw throw in production | | token is `null` without a secret (or with one under 32 chars) in development, test and production; every entry point (bookNow, hold, confirm, replay) returns `BUSY/SERVER_KEY_MISSING`, 0 bookings written, counter seq Δ 0; 32-char secret works; same booking ⇒ same token; different bookings ⇒ different tokens; rotating the secret changes the token; stored hash = sha256(token); the DTO has no token | **FIXED** |

## New attacks (from the controller's list)

### a/b. Approvals (`edges --only=H`)

- **Positive path.** The bound approval (entityId from `tripPriceOverrideEntityId`) gives ok: gross 260,000, seat `unitPriceMinor` 200,000, `priceSource` MANUAL, and an audit `trips.booking.price_override` row with `approvalIds` = that id.
- **Race.** 20 parallel callers (10 `bookTripsNow` and 10 hold→confirm) on one departure, all citing one approval. Result: ok 1, `FORBIDDEN/APPROVAL_USED` 19, 1 audit row, 0 deadlocks, max 2.6 s.
- **Hold then confirm.** Two holds citing the same approval both succeed (a hold does not consume it). Confirming both in parallel gives one ok and one APPROVAL_USED.
- **Override inside the cap that still names an approval (340,000).** The booking is ok and the approval **is consumed**; reusing it gives APPROVAL_USED. This is conservative, and noted here only.
- **Approval `unitId` NULL** is accepted, i.e. a tenant-wide approval; the code treats that as allowed.
- **Approval `amountSatang` = 1 with an entityId for 200,000** is accepted. The binding is entirely in entityId; the `amountSatang` column is ignored (observation).
- **Lines on two departures** give `VALIDATION/APPROVAL_SINGLE_DEPARTURE`.
- **Approved ADULT override plus an unapproved CHILD override below the cap** gives REQUIRES_APPROVAL for `seat:CHILD` (correct).
- **N1, multi-line (MINOR, reproduced 1/1).** One approval and two lines on the same departure, each with 3 adults and the `seat:ADULT` override at 200,000. Result: ok, **2 bookings, 6 seats** priced at 200,000, and **two** audit rows with the same approvalId. "Single use" therefore means one request, and one approval covers every line and seat with that `itemRef` on the departure. The entityId does not bind a quantity. Decide whether that is intended.

### c. Sweeper / expiry regression, the most important check (`r2 --only=SW`)

- **Setup.** `trips.sell.holdMinutes = 1` on my unit (real clock), with SHOP_CONFIRMS on product P2. Bookings created:
  - 2 PUBLIC HOLD bookings (one with a promo, 2 pax), 1 STAFF PAY_NOW HOLD booking.
  - 1 open (unconfirmed) basket.
  - 1 PUBLIC PENDING booking on P2; its SHOP_CONFIRM hold was moved to now+50 s in SQL, in my own tenant.
  - Before expiry: held 5 on d and 2 on d2; `bookTripsNow` of 2 more seats gave SOLD_OUT.
- **After real expiry, before the sweep.** A confirm of the lapsed open basket gives HOLD_EXPIRED.
- **`runExpireHolds(new Date(), { tenantIds: [own] })`** expired 5 holds on 2 departures; a second sweep expired 0.
  - All 4 bookings are **EXPIRED**, all holds are **EXPIRED**, and **held = 0** on both departures (sold 0).
  - 4 `trips.booking.expired` events were emitted. The consumer (`onTripBookingExpired`, event shape) returned ok ×4, and the promo went `usedCount` 1→**0**, ACTIVE redemptions 0.
  - Seats are sellable again: `bookTripsNow` of all 6 seats gives ok on both departures.
  - I1–I5 clean.
- **Verdict: no regression.** HOLD_HAS_BOOKING does not affect the sweeper, which uses its own path.

### d. Approve with nothing due (`r2 --only=Z`)

- **Setup.** Product with `depositPct 0` + `balanceDueDaysBefore 3` + SHOP_CONFIRMS. The snapshot schedule is DEPOSIT 0 (`dueAtBooking: true`) plus BALANCE 750,000. A PUBLIC PAY_NOW booking with promo gave PENDING.
- **APPROVE** gives **CONFIRMED** (version 1). The hold is CONVERTED; the departure goes from sold 0 / held 2 to sold **2** / held 0. One `trips.booking.confirmed` event; one ACTIVE redemption.
- **Duplicates and races.**
  - A second approve gives STATE_CONFLICT.
  - 5 parallel APPROVE calls on each of 6 bookings: exactly 1 winner each (6/6).
  - approve ∥ reject ∥ cancel on 6 bookings: exactly 1 winner each.
  - After all races, redemption rows show no duplicates per booking, rule `usedCount` 8 = ACTIVE 8, and departure sold 9 = 2 + 6 + 1.
- **Approve after the option is disabled** gives SLOT_CLOSED; reject is still possible (ok). I1–I5 clean.

### e. Change (`r2 --only=CH`, `edges --only=E,X`)

- **Idempotency.** Same key ×5 parallel: 5/5 ok and 1 effective change (2 audits counting the first). Same key with a different body gives IDEMPOTENCY_CONFLICT.
- **dropPromo.** See M2.
- **Target option disabled mid-change.** I held a transaction-level advisory lock on `trips-booking-change:<id>`, disabled the target option, and released the lock. Result: SLOT_CLOSED, booking unchanged.
  - The first attempt used a session-level advisory lock, which leaks through the Neon pooler (pgbouncer transaction mode). It left the change waiting 600 s. That was a test artifact and is not reported as a defect.
- **Too many passengers.** Shrinking from 2 to 1 adult with 2 passengers, or swapping the pax type, gives `VALIDATION/TOO_MANY_PASSENGERS`.
- **Refused states.** PART_PAID and PAID give `STATE_CONFLICT/NOT_SUPPORTED`; HOLD gives CHANGE_BEFORE_CONFIRM.
- **50 random moves** among 3 departures (capacity 14 each), random 1–3 pax, waves of 10 concurrent, run twice: ok 15/15, STATE_CONFLICT 23–24, IDEMPOTENCY_CONFLICT 10–12, SOLD_OUT 0–1. I1/I2 were clean after every wave, with 0 deadlocks.
- **E races (3 rounds).** Move A→B ∥ bookNow ∥ cancel ∥ two changes at the same version: never two winners. Swaps had no BUSY. Grow ×10 for the last seat gives exactly 1 ok. A move onto another product's departure gives NOT_FOUND.
- **N4 (MINOR, residual of M3, reproduced 22/100 moves).** A concurrent change at a **stale** version returns IDEMPOTENCY_CONFLICT instead of STATE_CONFLICT. The add-on hold key `cg_<expectedVersion>_<bookingId>` collides with the winner's add-on before the version CAS runs. No data effect, but the code is misleading.

### f. Prepared (`edges --only=I`): see M5.

- **N2 (MINOR, reproduced 1/1).** A *genuine* sealed `prepared` passed straight to `finalizeTripsInTx` after the option was disabled gives **ok**. The R8 re-check (`lockProductsInTx`) lives in `confirmTx`/`bookTripsNow`, not in finalize, so a future K1.1 caller has to lock products/options and departures itself. No caller exists in `src/` today; document it or move the check into finalize.

### g. Cancel (`edges --only=X`)

- Same key with a different reason gives IDEMPOTENCY_CONFLICT.
- Same key ×10 parallel: 10/10 ok, 1 event.
- **10 parallel cancels with different keys** on a 2-seat HOLD booking: ok 1, STATE_CONFLICT 9. held 2→0 (returned once), 1 `trips.booking.cancelled` event, 1 audit row.

### h. Pool and multi-product (`storm`)

- **P:** 80 parallel callers (40 PUBLIC hold+confirm, 40 bookNow), 3 rounds: 240/240 ok, p50 5.6–6.0 s, p95 6.3–6.8 s, max 6.9 s. No BUSY, no P2028.
- **C:** opposite-order [P1,P2]/[P2,P1] × 30 per round with archive/restore/publish/option toggles, 6 rounds: 0 deadlocks; failures are only NOT_FOUND/SLOT_CLOSED from quote or lock during archive; I1–I5 clean.
- **Connections:** max client connections 12, max idle-in-transaction 10; DB-wide deadlock Δ 0 over the whole storm run.

### Inputs (`edges --only=K`)

- All previously accepted junk still gets named codes.
- Newly rejected fields (`note`, `marketingConsent`, `tender`, `passengers[].fields`) give VALIDATION.
- **N3 (MINOR).** The control-character filter covers U+0000–001F and U+007F only. **C1 control U+0085** and **bidi override U+202E** in a booker name are accepted (ok), as is a lone surrogate. U+202E can visually spoof names on staff screens. Suggest rejecting `\p{Cc}` plus bidi controls (U+202A–202E, U+2066–2069).

## Positive controls (PC, run 3 times: storm, r2, plus the deadlock baseline)

| checker | result |
|---|---|
| I2-sold | fires |
| I2-held | fires |
| I3-gap | fires |
| I4-used | fires |
| I5-noseat | fires |
| I5-basket | fires |
| I1-over | blocked by DB CHECK |
| I3-dup | blocked by unique index |
| after restore | clean |

The only invariant noise was `I4-orphan` on the PC booking. It is expected: the D sweep expires that promo booking and the probe did not run the consumer for it. D's own check shows the consumer releasing it.

## Operations

| run | workloads and service calls |
|---|---|
| storm | A 393, B 139, C 436, D 139, F 364, G 225, G2 180, P 360 |
| edges | E 113, H 71, I 54, K 42, T 18, J 20, X 155 |
| r2 | SW 23, Z 82, CH 136 ×2 |
| deadlock | 240 bookNow |

Total about 3,350 service calls plus about 1,700 quotes, with 0 THROW results across all runs.

## Not tested

- Real server actions (`requireUnit`/`assertCan` need a Next request context); the outbox worker delivering `trips.booking.expired` by itself (the consumer was called with the event shape).
- Forcing a Party failure (BOOKER_UNAVAILABLE path). The code was read; it could not be triggered now that NUL is rejected.
- PART_PAID/PAID reached through real payments (status was set in SQL, in my own tenant).
- AGENT flows (disabled).
- The rekey-before-1a theoretical inversion. It is now documented in code; r1 saw 0/600 deadlocks and it was not re-run.
- Production pool sizing (the Neon pooler hides backend counts).
