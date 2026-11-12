# T0.4 capacity engine — hunter report (wip/trips-t0.4 @ d4a91465c)

Lane DB: wo-trips-qc-l1 (host ep-green-sound-aokclp5k), every run through
`bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<probe>`.
Probes (untracked, temp tenants `trips-hunt4-*`, cleanup in `finally`, every run ended "Tenant trips-hunt4-* เหลือ 0"):
`scripts/probe-trips-t0.4-{lib,storm,races,hunt,waitlist,scale}.mts`. 8 probe runs in total (1 storm run crashed in setup on my own settings typo, 1 races run crashed on my mkDep unique-key collision; both fixed and rerun).

## Verdict: **FIX FIRST**

There was no overselling, no counter corruption, and no database deadlock in any experiment. The blocker is a connection-pool stall in four `*InTx` functions. It is deterministic once 10 or more callers run in parallel. It stops the whole process from using the database for the full transaction timeout, and the callers get raw Prisma P2028 errors.

---

## Findings

### B-1 BLOCKER — `*InTx` functions open a second connection inside the caller's transaction, so ≥10 parallel callers stall the whole pool
- **Affected:** `releaseHoldInTx`, `returnSoldInTx` (unless `toReserved`), `moveSoldInTx`, `rekeyHoldsToContactInTx`.
- **Cause:** they call `policyFor` / `policiesFor` / `resolveSettings`, which run on the global `prisma` client, from inside the caller's tx.
  - `capacity.ts` :926-932 (releaseCore), :976-980 (returnCore), :1062 (movePolicies with `db` used only for the reads), :1190 (rekey).
  - The `gateOfTx` doc comment at :176-178 itself forbids this.
- **Pool:** PrismaPg uses the default pg pool, max 10 connections, and waits forever for a free one. When 10 transactions each hold a connection and each wait for an 11th, nothing moves until the Prisma transaction timeout ends them (30 s default from db.ts).
- **Reproduction:** `probe-trips-t0.4-scale.mts`, section `starvation`. Each caller runs `tenantDb().$transaction(tx => fn(tx, …), {})`, the way T0.6 will call it.

  | fn (in caller tx) | P | ok | wall | errors |
  |---|---|---|---|---|
  | convertHoldInTx (control: no second connection) | 30 | 30/30 | 1.1 s | — |
  | releaseHoldInTx | 5 | 5/5 | 0.33 s | — |
  | releaseHoldInTx | 9 | 9/9 | 0.44 s | — |
  | releaseHoldInTx | **10** | **0/10** | **30.2 s** | 10× `P2028 … A query cannot be executed on an expired transaction` |
  | releaseHoldInTx | 12 | 0/12 | 30.1 s | 10× expired tx + 2× `P2028 Unable to start a transaction in the given time` |
  | releaseHoldInTx | 30 | 0/30 | 30.1 s | 10 + 20 (same two errors) |
  | returnSoldInTx | 12 | 0/12 | 30.1 s | same |
  | rekeyHoldsToContactInTx | 12 | 0/12 | 30.1 s | same |

  - DB client connections peaked at 12 (10 Prisma + probe) and `idle in transaction` peaked at exactly 10.
  - After the timeouts the pool recovered: a normal `placeHold` then took about 130 ms.
- **Seen in two more places:**
  - `probe-trips-t0.4-hunt.mts`, section `moves`: 30 `moveSoldInTx` ran alongside 30 `moveSold`. All 30 InTx calls threw P2028 (10 expired tx at 60 s, 20 could not start). The whole moves block took 63 s.
  - `probe-trips-t0.4-races.mts`: 20 parallel `rekeyHoldsToContactInTx` into one contact gave 0 successes, all P2028 after 60 s. The cap test itself could not be judged because of this.
- **Expected vs actual:**
  - Expected: `*InTx` functions use only the caller's tx; refusals come back as `CapacityAbort`; no raw database text reaches the caller.
  - Actual: the whole process is stalled for the tx timeout, and every caller gets raw `PrismaClientKnownRequestError P2028` text.
- **Fix direction:** pass the policy in from outside the tx, or read settings via `tx`. `convertHoldInTx` already shows the pattern that works.
- **Not reproduced:** the effect on Vercel-style per-instance concurrency. Severity depends on how many concurrent confirm/cancel requests one Node process serves. The limit is the pool size, not a load threshold.

### M-1 MAJOR — getAvailability / listAvailability report ARCHIVED products and inactive options as sellable
- **Reproduction:** `probe-trips-t0.4-storm.mts`, `productStates`.

  | product state | availability | public hold | staff hold |
  |---|---|---|---|
  | ARCHIVED | `publicLeft 10, saleBlock null` | `SLOT_CLOSED` | `SLOT_CLOSED` |
  | ACTIVE with option `active=false` | `publicLeft 10, saleBlock null` | `SLOT_CLOSED` | `SLOT_CLOSED` |

- **Expected:** availability agrees with what `placeHold` will accept (`saleBlock "STATUS"` / `publicLeft 0`), or the departures are omitted.
- **Actual:** the shop front can show "10 left" for seats that can never be held. `availabilityOf` never consults product or option state.
- **Severity:** rated MAJOR because the brief's own R2 truth table is the public seat display.
- **Related:** DRAFT products are the reverse case. `placeHold` succeeds for PUBLIC, because `assertProductSellableInTx` accepts DRAFT. See m-1.

### m-1 MINOR — PUBLIC can hold seats on a DRAFT (unpublished) product's departure
- **Reproduction:** storm probe, `product DRAFT` gives `placePublic: ok`.
- **Note:** this may be intended (T0.2 lets DRAFT carry departures/prices). The controller should decide whether PUBLIC should be refused.

### m-2 MINOR — idempotency and cap keys are tenant-wide, not unit-wide (X1 says cross-unit = NOT_FOUND)
- **Reproduction:** `probe-trips-t0.4-races.mts`, `isolation`.
- **Same staff user and same key, unit A2 context with unit A's departureId:** returns `ok … duplicated:true` with A's `holdId`, `status`, `expiresAt` and `publicLeft:0`, instead of `NOT_FOUND`. Cause: `readHoldByKey` filters on `tenantId` only (:431).
- **Same key in A2 on A2's own departure:** `IDEMPOTENCY_CONFLICT`. This is a false conflict.
- **Hold cap:** a basket that holds its cap of 5 in unit A gets `HOLD_LIMIT` in unit A2 of the same tenant (`cap cross-unit/tenant`). Other tenants are unaffected.
- **Reading:** this matches the unique key `(tenantId, idempotencyKey)` and the per-tenant `countCap` query. For the cap it may be intended (a basket or contact spans the shop). For idempotency it leaks another unit's hold metadata to the same actor and misreports conflicts.

### m-3 MINOR — a corrupt stored setting turns into raw throws and permanently stuck seats
- **Reproduction:** `probe-trips-t0.4-scale.mts`.
- **Setup:** a raw `SettingValue` row with `trips.sell.holdMinutes = "สิบห้า"` at UNIT scope.
- **Raw throws:** `placeHold` and `getAvailability` throw `Error: ค่าตั้ง trips.sell.holdMinutes ผิดรูป` instead of returning a SellResult.
- **Sweeper:** it fails every departure of that tenant (700 `failed[]` entries, code `"Error"`), so 7,000 expired holds and seats stay held indefinitely. `expireDepartureHolds` needs the policy only for the waitlist offer, but reads it before doing anything.
- **Severity:** only reachable by bypassing `setSettings` validation (or by a later schema tightening), hence MINOR.

### m-4 MINOR — rekeyHoldsToContactInTx edge cases
- **Reproduction:** races probe, `cap rekey edge`.
- **STAFF holds:** a STAFF hold can be re-keyed into a contact, after which it counts toward the public cap. There is no purpose/actor filter.
- **Other unit's hold:** asking unit A to re-key unit A2's hold returns `HOLD_EXPIRED`, not `HOLD_NOT_FOUND`.
- **Cap reset (design note, not a bug per §D.6):** after its holds are re-keyed, the basket's count drops to 0, so the same browser can place 5 more holds. Measured: `additionalHoldsAllowed: 5`.

### Notes (inferences or by design, not counted as findings)
- **Queue-jump window (by the §12 ruling):** a capacity increase is not offered to the waitlist immediately. A STAFF hold took the freed seat while 9 parties were WAITING (waitlist probe step 4a). Strict FIFO also lets a public hold take a seat the head (who needs 2) cannot use (step 10).
- **Contract gap (not reproduced):** `offerNextInTx` does not take the waiter's capKey advisory lock that CC §D.6 :502 mentions. Taking it there would also violate the lock order (layer 0 after 1a), so it needs a ruling rather than a fix.
- **Retry path never exercised:** across about 7,000 hunt and race operations there were 0 Postgres deadlocks (`pg_stat_database.deadlocks` delta 0) and 0 BUSY. The 40P01/55P03 retry → BUSY branch was never hit, so it is untested by me.
- **Sweeper throughput:** 12,990 holds on 1,299 departures took 177 s, about 9,450 DB transactions (≈7 per departure, about 136 ms per departure). With a 1-minute cadence a large backlog means overlapping runs. Overlap is safe (see the two-sweepers result).

---

## What held (counts)

### 1. Mixed storm — `probe-trips-t0.4-storm.mts`
- **Scale:** 5 rounds × 300 ops × 40 parallel workers.
  - Seeds 11, 22, 33 plain.
  - Seeds 44R, 55R with `reserved` = 6 preset, plus `reserveSeatsInTx` / `unreserveSeatsInTx`.
  - 1,500 ops in total, about 920 snapshot samples.
- **Op mix:**
  - `placeHold` STAFF/PUBLIC, PAYMENT/SHOP_CONFIRM, sizes 1–6.
  - Replays (the final storm run had 50 exact replays, all with the same holdId and `duplicated:true`) and 25 conflicting replays (all `IDEMPOTENCY_CONFLICT`).
  - `extendHold`, `releaseHold`, `convertHoldInTx` in a caller tx, `returnSold`.
  - Sweeper on an advancing injected clock.
  - T0.3 capacity edits (±), close/reopen/guarantee, stop-sell toggles.
- **Result:** 0 invariant violations, both from the per-round check and the concurrent single-statement sampler. Checked:
  - counters ≥ 0 and s+h+r ≤ c;
  - held = Σ ACTIVE holds;
  - no FULL with free seats;
  - `guaranteedAt` set ⇒ status not OPEN;
  - version monotonic.
- After a final sweep, held = 0, `sold` = initial + Σ convert − Σ return exactly, and CONVERTED rows = convert successes in every round.
- 0 raw or unnamed errors.

### 2. Targeted races — `probe-trips-t0.4-races.mts`, each 200 iterations, exactly one outcome every time

| race | outcomes |
|---|---|
| convert vs sweeper (just-expired) | 165 CONVERTED, 35 EXPIRED |
| convert vs release | 186 / 14 |
| convert ×2 | always exactly 1 ok + STATE_CONFLICT |
| release ×2 | always ok + ok-duplicated |
| extend vs sweeper (SHOP_CONFIRM) | 197 extended-ACTIVE, 3 EXPIRED |
| same idempotency key ×10 (STAFF/PUBLIC alternating, 2,000 calls) | 200 rows, held 400 |
| cancelDeparture vs placeHold | 65 cancelled, 135 held, never both |
| release vs cancel vs convert (3-way) | 4 interleavings, all consistent |
| capacity → exactly s+h vs hold 1 | always exactly one; only "capacity wins" observed, so the opposite interleaving was not exercised |
| last seat ×50 (20 rounds, 1,000 calls) | always 1 ok, 49 SOLD_OUT with `details.publicLeft`, status FULL |

`sold` = Σ CONVERTED on every race departure.

### 3. Moves — `probe-trips-t0.4-hunt.mts`
- **Parallel A↔B:** 30 `moveSold` plus 20 holds and 7 converts. Σsold conserved (45 = 30 + 15 converted). No negatives, 0 deadlocks; the lock monitor saw at most 9 waiters and a 2.0 s longest wait.
- **Refusals:** moves into FULL, CLOSED and reserved-full departures were refused (SOLD_OUT / SLOT_CLOSED / SOLD_OUT) with the source unchanged.
- **3-cycle:** A→B, B→C, C→A ×10 in parallel gave 30/30 ok in 1.7 s, Σsold 60, 0 deadlocks.
- (The 30 `moveSoldInTx` calls are covered under B-1.)

### 4. Cross-WO deadlock hunt — 60 s, 24 workers, 5,375 ops
- **Ops mixed:** materializeSchedule; runMinPaxCheck; sweeper; runWaitlistOffers; place/convert/release; updateDeparture time change on resource-bound departures; archiveProduct + restoreProduct (118 cycles) on a product with holds; setOptionActive true/false (367); capacity; status.
- **Deadlocks:** 0 Postgres deadlocks, 0 deadlock text to callers, 0 BUSY, 0 throws.
- **Waits:** at most 9 waiters on locks; longest lock wait 1.0 s. Worst call latency was 2.5 s (sweeper); materialize 1.4 s, archive 1.2 s.
- **End state:** 29 departures all invariant-clean; held = 0 after the final sweep.

### 5. Hold cap
- 20 parallel holds on one basket with cap 5 gave exactly 5 ok + 15 HOLD_LIMIT, in 10 of 10 rounds.
- Expired-but-unswept holds were not counted: the 6th hold was `HOLD_LIMIT` at T and `ok` at T+16 min.
- Another tenant is independent. STAFF holds bypass the cap (20 of 20 ok).
- Cross-unit behaviour is in m-2; the parallel re-key test was blocked by B-1.

### 6. Waitlist — `probe-trips-t0.4-waitlist.mts`
- **Joins:** 12 parties joined in parallel (4 of them twice), giving 12 rows and 4 `duplicated`. List order = (createdAt, id) and stayed stable across reads.
- **Offers:** each of these gave exactly one offer, to the head, in strict order:
  - sweeper releasing a hold (offer in the same tx);
  - returnSold;
  - capacity +1 followed by `onWaitlistTrigger` ×5;
  - releaseHold;
  - two parallel releases (positions 1 and 2).
- **Lapses:** a lapsed offer went to the next party in the same tx (2 expired → 2 new offers, positions 5 and 6).
- **Convert vs lapse at the same instant:** 3 ACCEPTED, 1 EXPIRED, never both.
- **Leave vs convert of the same offer:** exactly one wins.
- **Decline:** the next party is offered.
- **Cut-off and cancellation:** no offer after the web cut-off; the job moved WAITING → EXPIRED. A cancelled departure got no offer (WAITING → EXPIRED).
- **Global checks:** after all offers lapsed, held = 0. At every step: never two WAITING/OFFERED rows per party, never two offer holds per waitlist row, OFFERED ⇔ ACTIVE offer hold, and ACCEPTED ⇔ CONVERTED.

### 7. Sweeper at scale — `probe-trips-t0.4-scale.mts`
- **Setup:** 20,000 expired holds on 2,000 departures across 3 tenants.
- **Healthy tenant:** fully swept (0 ACTIVE, held 0).
- **Tenant with one corrupted departure** (held forced to 0): only that departure fails (`STATE_CONFLICT`); the other 599 are swept.
- **Tenant with the broken setting:** fails as described in m-3.
- **Two sweepers at once** on 2,000 holds: 2,000 expired in total, exact counters, 0 violations.

### 8. Availability truth
- Checked after every storm round, mid-round and after the final sweep.
- **Combinations:** 5 rounds × 2 points × 2 times (open / after web cut-off) × 6 actor-channel combinations (STAFF WEB/LIFF/COUNTER, PUBLIC WEB/EMBED).
- **Results:** `getAvailability` == `listAvailability` row, and `publicLeft` = c − s − h − r with the expected `saleBlock` (STATUS / CUTOFF / STOP_SELL). 0 mismatches.
- The only mismatches found are product/option state (M-1).

### 9. Isolation and adversarial input
- **Coverage:** 22 exported functions × 4 foreign contexts (tenant B, unit A2, tenantB+unitA, PUBLIC B).
  - Every result was `NOT_FOUND` / `HOLD_NOT_FOUND` / empty, with one identical NOT_FOUND message.
  - A's rows were byte-identical before and after.
  - Exceptions: m-2 and m-4 (rekey of a foreign hold returns HOLD_EXPIRED; no change, no leak).
- **Adversarial values:** all returned VALIDATION, with no throw:
  - qty 0, −1, 2^31, NaN, 1.5, "3", 51 and ∞ on placeHold, returnSold and reserveSeatsInTx;
  - unicode, 10 KB and null-byte idempotency keys;
  - a 10 KB departureId;
  - capKey `contact:`, short, 129-char and unicode baskets;
  - wrong purpose for the actor; PUBLIC on COUNTER; Invalid Date `now`; extra field.
- AGENT gets FORBIDDEN. An SQL-ish id gets NOT_FOUND.

### 10. Pool starvation
- See B-1.
