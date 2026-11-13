# Independent review: RUN TRIPS T0.6 (booking core)

Worktree `/root/projects/shark-trips-l1` · branch `wip/trips-t0.6` · HEAD `711c9c75a` · diff `c3791d1c0..711c9c75a`
This was a read-only review. I ran no tsx, build or DB commands.

## Verdict: **FIX FIRST**

I found no BLOCKER. Seats, counters, numbering and promo-once all hold under the concurrency the oracle exercises, and I found no second connection opened inside a transaction. The six MAJORs below are about money controls and snapshot integrity. Most of them have a small fix. M1 (approvals not bound to anything) bypasses the second-approver control on manual prices completely, and nothing in the oracle can catch it. M2 and M5 can lose or mis-price real bookings.

---

## MAJOR

### M1. An approval for anything authorises any manual price (§16.3 / Q6)
- **Where:** `booking.ts:190-195` (`approvalsGate`), `pricing-core.ts:905-918`, `approval/service.ts:480-485`.
- **What it checks:** only `requestStatuses({tenantId}, ids)[id] === "APPROVED"`. The match in pricing-core (`itemRef`, `unitMinor`, `resolvedMinor`) uses values the requester supplies in the same request. So the approval row's `entityType`, `entityId`, `unitId`, `amountSatang` and `requestedById` are never read, and nothing marks an approval as used.
- **Failure scenario:**
  1. A staff member who holds `trips.price.override` overrides an adult seat from 350,000 to 1,000 (below the T11 cap).
  2. They cite any `ApprovalRequest` in the tenant with status APPROVED. That can be a POS discount, a CRM deal, an HR request, one from another unit, or one already used on another booking.
  3. They pass `resolvedMinor` = the `details.resolvedMinor` from the REQUIRES_APPROVAL response.
  4. The booking is created as CONFIRMED with `priceSource MANUAL`.
- **Why this is the normal case today:** nothing in `src` submits an approval with `entityType: "trips.price_override"`. The only approvals that exist in production are ones from other modules. The second-approver control is therefore decorative.
- **Fix:**
  - Add a read to the approval facade (controller ORACLE-EDIT/fitness, outside T0.6 ownership), for example `requestsForBinding(ctx, ids) → {id, status, entityType, entityId, unitId, amountSatang, requestedById}`.
  - Outside the tx, require all of:
    - `entityType === "trips.price_override"`;
    - `unitId === c.unitId`;
    - `entityId === sha256(departureId | itemRef | unitMinor | resolvedMinor)` (the canonical key the approval UI must use when it submits; put it in the REQUIRES_APPROVAL details so the client can submit it);
    - optionally `amountSatang === resolvedMinor − unitMinor`.
  - Make each approval single-use. Either add an approval-module "consume" CAS, or inside the tx take `pg_advisory_xact_lock(hashtext('trips-approval:'||id))` and reject if an audit `trips.booking.price_override` already references that `approvalId`. The audit currently stores no `approvalId`; add it to `after`.

### M2. Change/move keeps the old `policy` block with new totals, so the snapshot contradicts itself (Q11)
- **Where:** `booking.ts:1292-1294`.
- **What it does:** when `useCurrentPolicy` is not set, the builder replaces `policy`, `cancelLadder`, `cancelMinimumLadder` and `shopCancelRefundBpByReason` with the old values. `lines`, `totals`, `tax.vatRateBp` and `paymentSchedule` stay from the new pricing.
- **What the contract says:** CC :667 says only "ตารางยกเลิก … = ของ snapshot เดิม". Brief §5.6 added `policy` to the list, so this is a defect in the brief that the builder followed.
- **Why it matters:** `snapshot.ts:268` and `:384` read the VAT rate through `snapshotValue(snap,"trips","trips.tax.vatRate")`, which reads `policy.trips.values`, not `tax`.
- **Failure scenario:**
  1. The shop changes VAT registration, VAT rate, deposit or schedule keys after a booking is made.
  2. Staff move the booking to another date.
  3. The new snapshot has totals and VAT computed with the new rate, while `policy.trips.values` still has the old rate and old `trips.cancel.*` and `trips.tax.*` keys.
  4. T0.7 refunds, cancel-fee VAT and invoices recompute from the snapshot with the old rate on the new amounts. `recomputeFromSnapshot(CANCEL)` mixes the two.
- **Fix:**
  - Keep `built.value.policy`.
  - Carry over only the cancel ladder fields (`cancelLadder`, `cancelMinimumLadder`, `shopCancelRefundBpByReason`). If needed, also merge the old `trips.cancel.*` values into `policy.trips.values`, keeping everything else.
  - Ask the controller to amend brief §5.6.
  - Also store the old snapshot, or at least its sha256 and `quote.fingerprint`, in the `trips.booking.change` audit `before`. CC :667 says "เก็บของเดิมใน audit". Today the old snapshot is overwritten and lost.

### M3. Change silently drops the booking's promo discount and leaves the redemption ACTIVE (Q7 / Q11)
- **Where:** `booking.ts:1266` rejects `line.promoCode`. Nothing touches `TripPromoRedemption`.
- **Failure scenario:**
  1. A booking was confirmed with a 10% code (redemption ACTIVE, `usedCount` 1).
  2. Staff move it to another date.
  3. The new snapshot is priced without the code, so `discountSatang` is 0 and the customer now owes the full price.
  4. The redemption stays ACTIVE with the old discount, and the code's `usedCount` still counts it.
  5. Invariant §13.3 still holds by count, but the booking and the redemption now disagree about money.
- **Fix (either):**
  - (a) Allow `promoCode` on change. In the tx, after the seat moves and before the CAS, call `releasePromoInTx` and then `redeemPromosInTx` with the new `snapshot.promo`. This follows the rule: seats, then release, then redeem in `ruleId` order.
  - (b) Reject the change with `VALIDATION PROMO_ON_BOOKING` when the old snapshot has a promo, unless `dropPromo: true` is sent, in which case call `releasePromoInTx` in the tx.

### M4. `finalizeTripsInTx` trusts the caller's `prepared` object for every money field (Q14)
- **Where:** `booking.ts:739-745`, and its use of `l.columns`, `l.items`, `l.snapshot`, `l.status`, `l.holdMode`, `l.promo`, `P.payMethod`, `P.bookerPartyId`, `P.basketKey` and `P.requestHash` at `:781-858`.
- **What it checks:** `isPrepared` checks only shape plus tenant and unit. `prepared` does not record the actor that prepared it.
- **Failure scenario:** K1.1's `basketConfirm` (or any route) builds `req` by spreading the client body. A caller can then set `grossSatang: 1`, `status: "CONFIRMED"`, `holdMode: "CONVERT"` and an arbitrary `promo.ruleId`, or replay a STAFF PAY_LATER `prepared` under a PUBLIC ctx. The result is a CONFIRMED booking with no payment and an arbitrary price. This is exposed through `tripSellable.finalizeInTx` (`sellable-impl.ts:24`).
- **Fix:**
  - Mint `prepared` only in `prepareCore` and `bookTripsNow`, and record it in a module-level `WeakSet<PreparedConfirm>` (or HMAC-seal it with a server key).
  - Make `finalizeTripsInTx` reject anything not in the set.
  - Add `actorKind`/`actorId` to `PreparedConfirm` and require them to equal `ctx.actor`.
  - Defence in depth: re-derive `columns` and `items` from `snapshot` with `bookingColumnsFromSnapshot` and compare.

### M5. Approving a PENDING booking always moves it to HOLD, even when nothing is due (Q14)
- **Where:** `booking.ts:1223-1239`.
- **What happens:**
  1. `initialBookingStatus` sends every non-staff booking under SHOP_CONFIRMS to PENDING, whatever is due.
  2. Approval moves it PENDING→HOLD with a PAYMENT hold that expires at now + T5.
  3. When `dueNowOfSnapshot === 0` (for example a liveaboard deposit due D-N, not at booking), no money will arrive. T0.7 only moves HOLD→CONFIRMED on payment.
  4. So the sweeper expires the approved booking after T5 (15 minutes), and the customer loses seats the shop just approved.
- **Inconsistency:** without SHOP_CONFIRMS, the same booking would have gone straight to CONFIRMED/CONVERT (`state.ts` rule 4). CC :691 allows PENDING→CONFIRMED. Brief §5.6 only names →HOLD, so this is a brief gap.
- **Fix:**
  - On APPROVE, compute `dueNowOfSnapshot(b.policySnapshot)`.
  - If it is greater than 0, keep the current behaviour.
  - If it is 0: lock the departure, set the hold's `purpose` to PAYMENT, call `convertHoldInTx` (with `capKey contact:<key>` for a PUBLIC hold, or let STAFF skip the owner check), CAS PENDING→CONFIRMED, and emit `trips.booking.confirmed`.

### M6. Change computes old seats from the current `countsCapacity` instead of the snapshot
- **Where:** `booking.ts:1299-1302` (it joins the current `TripPaxType.countsCapacity`).
- **Failure scenario:**
  1. A booking was sold with 1 infant while infants had `countsCapacity=false`, so sold +2 for 2 adults.
  2. The shop later sets infants to `countsCapacity=true`.
  3. A change to the same booking computes `oldSeats` = 3 against the 2 seats actually sold.
  4. The delta is wrong by one: `giveBack` or `addOn` returns or adds one seat too many. `sold` drifts away from Σ seat items, breaking invariant §13.1.
- **Fix:** take `oldSeats = seatsOfSnapshot(old)`, which uses the snapshot lines' `usesCapacity`. That is the same basis `newSeats` uses.

---

## MINOR

| # | file:line | Issue | Fix |
|---|---|---|---|
| m1 | `booking.ts:649` (via `capacity.ts:1162`) | **Lock inversion: holds before departures.** PUBLIC `rekeyHoldsToContactInTx` UPDATEs `TripHold` rows (row locks) before products and 1a departures. The sweeper (`capacity.ts:1182-1193`) takes the departure FOR UPDATE and then the hold rows. Pair: a PUBLIC `confirmTrips` with stale `ctx.now` (captured before quote, snapshot, settings and party — hundreds of ms) on a hold that is just expiring ∥ `runExpireHolds` on that departure. Postgres raises 40P01 and `runTx` retries, so this is not corruption, but it can cost latency or end in BUSY. LT-1 uses STAFF holds, so it never exercises this. This order is spec'd ("ชั้น 0"). | Have the controller rule. Options: run rekey after `lockDeparturesInTx` (advisory `contact:` keys are taken only by rekey, so moving it later creates no new cycle), or have rekey `SELECT … FOR UPDATE` only after 1a. |
| m2 | `booking.ts:777-779` | **SellCounter rows are locked in line order, not sorted.** Basket A = [Nov trip on dep1, Dec trip on dep2] ∥ basket B = [Dec trip on dep3, Nov trip on dep4] with the same prefix. The departures don't overlap, so nothing serialises them: A locks `(TR,6911)` and waits on `(TR,6912)`, B the reverse. The result is 40P01 and a retry. BK-5 uses the same month and doesn't catch it. | Allocate codes in `(prefix, period)` order first, then assign them to lines. |
| m3 | `booking.ts:837-841` | **Promo rules are locked in bookingId order, not ruleId order, across a basket.** A two-line basket with codes R2/R1 ∥ another with R1/R2 deadlocks on `TripPriceRule` rows when the SellCounter rows differ. The brief's rule ("เรียง id การจอง · ภายในเรียง ruleId") only orders within one booking. | Collect `(ruleId, bookingId)` for the whole basket, sort by ruleId, and redeem in that order. |
| m4 | `booking.ts:1177-1183` | **Cancel replay ignores the body.** The key hash covers bookingId and namespaced key only, so the same key with a different `reason` or `reasonKind` returns success. | Add `holdRequestHash({reason, reasonKind})` to the audit `after` and compare it on replay. |
| m5 | `booking.ts:158`, `:248-251` | **Basket keys are not unit-scoped.** `st:<user>:<key>` has no `@unit`, unlike T0.4 holds. The same staff member using the same key in two units gets IDEMPOTENCY_CONFLICT or BASKET_CHECKED_OUT instead of two independent results. There is no data leak: `refsOfBasket` filters by unit and the hash includes unitId. | Add `@${unitId}` to `basketKey`. Needs a fixture/oracle check for the seed key. |
| m6 | `booking.ts:1257-1366` | **`changeTripBooking` accepts `idempotencyKey` and ignores it.** A retried successful change returns STATE_CONFLICT, so the caller can't tell it succeeded. | Store a key hash in the change audit and replay it, as cancel does. |
| m7 | `booking.ts:1345-1353` | **Change can leave more passengers than seats.** Reducing 4→2 seats, or removing a pax type, leaves extra passengers or ones pointing at inactive items. There is no TOO_MANY_PASSENGERS check. | Count passengers per pax type against the new seats and reject. |
| m8 | `booking.ts:524` | **Booker contact can be silently lost.** `safeFindOrCreate` returns `null` on error, and there is no booker column, so a PUBLIC booking can be created with no name, phone or email anywhere. A PUBLIC caller giving an existing phone with a new name attaches to the existing Party, and the name they gave is dropped. | Fail with `BUSY` (retryable) for PUBLIC when the party is null. Document the find-by-phone behaviour. |
| m9 | `booking-core.ts:59,83,127-128` | **Accepted fields silently dropped.** Passenger `fields`, `note`, cancel `choice` / `moveToSlotId` and booker `marketingConsent` are accepted and never stored. | Reject them (strict) until T0.8 / T0.7, or store them. |
| m10 | `outbox-consumers.ts:1561-1564` | **Expiry consumer drops failures.** It ignores a failed `SellResult` from `onTripBookingExpired` (for example BUSY), so the event is acked and the promo is never released. Idempotency itself is fine: `releasePromoInTx` re-checks `status='ACTIVE'` under the rule row lock, so a double or concurrent delivery releases only once. | Throw when `!r.ok && r.retryable` (or when the code is not NOT_FOUND) so the outbox retries. |
| m11 | `booking.ts:109-114` | **Guessable tokens outside production.** Without a secret, the token is `sha256("trips.booking.token.v1:dev:"+bookingId)`. bookingId appears in event and webhook payloads, so on any non-production deploy without `SESSION_SECRET` tokens can be derived. Production correctly throws, though only inside the confirm tx, after the hold already succeeded. | Also fail closed when `VERCEL_ENV`/`APP_ENV` is staging. Optionally check the key in `holdTrips` too. |
| m12 | `booking.ts:1073` | **Bad dates crash the list.** `dateOfYmd("2026-13-01")` gives Invalid Date and Prisma throws (500). | Refine YMD to a real date. |
| m13 | `booking.ts:860` (`finalize`) | **Points/coupon providers are never redeemed.** `snapshot.providers` discounts would be applied but not consumed, and not released on cancel. This is latent today because `quoteOptsOf` never passes `partyId`. | Throw `VALIDATION PROVIDERS_NOT_WIRED` if `snapshot.providers.length > 0` until X.2. |
| m14 | `booking.ts:1292-1366` | **Change can push payable below what was paid.** A change on PART_PAID/PAID can make payable smaller than `paidSatang`, and it replaces `paymentSchedule` wholesale (paid dues included). There is no reconciliation. | Note for T0.7, or reject when `newPayable < paidSatang`. |
| m15 | `booking.ts:332,544,903` | **Unsupported options ignored silently.** REHOLD is honoured for STAFF only, and a PUBLIC `onExpired:"REHOLD"` is ignored without telling the caller (it is still part of the request hash). | Return VALIDATION for PUBLIC REHOLD. |
| m16 | `booking.ts:329, 683` | **Stale clock decides expiry.** Expiry decisions use the clock captured at the start of the request, before slow out-of-tx work. A hold that has truly expired can still be converted within that window. This follows the T0.4 convention, and `ctx.now` is caller-supplied for `tripSellable`. | Take `now` immediately before opening the tx, or use DB `now()` in the 2a CAS. |

---

## Answers to the 14 questions

**1. Transactions and pool.** Every transaction callback, and what runs inside it:

| Transaction | What runs inside |
|---|---|
| `holdTrips` :373 | `insertBasket`, `basketByKey(tx)`, `acquireHoldCapInTx`, `assertProductSellableInTx`, `reserveInTx(HOLD)` (`phase1HoldInTx`: `gateOfTx`, `readDepartureTx`, product gate, `countCap`, `lockDeparture`, `holdSeatsSql`), `insertHoldInTx` (`gateOfTx`, `insertHoldRow`, `emitOutboxMany(tx)`, `auditLog.create` on tx) |
| `confirmTx` :642 (FAIL / REHOLD) | `basketById FOR UPDATE`, rekey, products, `reserveInTx(CONVERT)`; REHOLD adds `releaseHoldInTx` (`offerNextInTx` on tx) and `reserveInTx(HOLD)` / `insertHoldInTx`; then `finalizeTripsInTx` (hold CAS, `convertHoldInTx`, `nextBookingCodeInTx`, `tx.tripBooking.create`, `createMany`, `redeemPromosInTx` → `emitOutbox(t)`, audit, `emitOutboxMany`, basket CAS) |
| `bookTripsNow` :958 | Same as `holdTrips` without rekey, then `finalizeTripsInTx` |
| `cancelTripBooking` :1187 | `cancelUnpaidInTx` (`releaseHoldInTx`, `casStatus`, `releasePromoInTx`), `tx.auditLog.findMany`, `emitBooking`, audit |
| Approve :1226 | `reserveInTx(CONVERT)`, hold UPDATE, `transitionBookingInTx` |
| Reject :1242 | `cancelUnpaidInTx` |
| Change :1309 | products, departures, `reserveInTx` / `insertHoldInTx` / `convertHoldInTx` / `returnSoldInTx` / `moveSoldInTx`, raw UPDATEs |
| `onTripBookingExpired` :1382 | `releasePromoInTx` |

Everything that opens its own connection runs before the transaction opens: `quoteTrips`, `buildTripBookingSnapshot`, `capacityRowsOf`, `loadCapacityPolicies`, `resolveSettings`, `safeFindOrCreate`, `party.findFirst`, `requestStatuses`, `seatsOfLines`, `basketByKey(unitDb)`, `readBooking`, and the out-of-tx audit read in cancel. `promoFailure` and `refsOfBasket` run after commit. I found no second connection inside any transaction.

**2. Lock order.**
- Hold: basket INSERT → advisory (basket cap) → products (sorted) → departures (sorted) → hold INSERT. OK.
- Confirm (FAIL): basket FOR UPDATE → advisory `contact:` → **hold UPDATE (rekey)** → products → departures → hold CAS → SellCounter (line order) → booking INSERT → promo advisory and rules (bookingId order) → redemption → outbox → basket. Inversions are m1, m2 and m3.
- `bookTripsNow`: basket → products → departures one by one in sorted order → holds → SellCounter → bookings → promo. Has m2 and m3.
- Change: products → departures (sorted) → holds → booking CAS. OK. MV-8 covers the cross-direction case.
- Cancel and reject: departure (via `releaseHold`) → hold → booking → promo rules. OK.
- Approve: departure → hold → booking. OK.
- Expire consumer: rule rows only. OK.
- The sweeper is consistent with everything except m1.

**3. CAS.** Every booking status change goes through `casStatus` or the change UPDATE, with `status` + `version` + tenant + unit and a row-count check. Holds use CAS (bind, SHOP_CONFIRM, approve, plus the T0.4 helpers). The basket CAS checks row count. Counters, `seq` and `usedCount` are each changed by a single guarded statement. The only read-then-write is change's `oldSeats` (read outside the tx). It is protected by the version CAS, which runs after the seat moves and rolls back if stale, but the read uses the wrong source (M6).

**4. Idempotency.**
- Hold replay works until checkout. After checkout, STAFF gets IDEMPOTENCY_CONFLICT (inside the tx, the old hold's key collides and the seat counter change rolls back) and PUBLIC gets BASKET_TOKEN_USED. That is acceptable but not "same result".
- Confirm replay is correct, including 6 concurrent confirms: FOR UPDATE on the basket, then the key/hash comparison.
- Swapping the key and hash on OPEN→CHECKED_OUT is safe. A confirm key that equals another basket's key gives 23505, mapped to IDEMPOTENCY_CONFLICT.
- Same key with a different body: rejected for hold, confirm and bookNow. **Accepted for cancel (m4).**
- Two different users cannot collide: keys are namespaced `pub:<tokenHash>` / `st:<userId>`.
- Keys are scoped by tenant but not by unit (m5).
- Change has no idempotency (m6).

**5. Price integrity.**
- `quoteId` is recomputed with the same opts, and the snapshot is built from the fresh quote's per-line fingerprint. Columns and redemption amounts come only from the snapshot.
- int4 bounds are checked in `bookingColumnsFromSnapshot`.
- PRICE_CHANGED returns a fresh quote and writes nothing.
- The `OPTS_T06` shadowing works: `loadAll` parses with the extended schema, `overrideGrant.approvals` carries `resolvedMinor`, and `pricing-core.ts:907` enforces `a.resolvedMinor === resolved` when it is present. `overrideGate` makes `resolvedMinor` mandatory for every T0.6 entry point (hold, confirm, bookNow, change). Other callers of `quoteTrips` may still omit it, which the ruling allows.
- The exported type `QuoteLineOpts` still names the old schema. That is cosmetic.

**6. Approvals.** See M1. Today an approval for anything — another booking, another module, another unit, a smaller amount — is accepted, and can be reused any number of times. Binding needs `entityType`, `unitId`, a canonical `entityId` covering departure, itemRef, unitMinor and resolvedMinor, the amount, and single-use consumption. **Rating: MAJOR. Must be fixed before any approval UI or the T1.3 counter screen ships.**

**7. Promo.**
- Redeemed exactly once per booking: unique `(ruleId, bookingId)`, and replay returns the existing row.
- Nothing is redeemed when confirm fails: rollback (PR-5).
- Released on expiry via the consumer. Double delivery is idempotent. Failures are dropped (m10).
- `usedCount` stays consistent, except after a change (M3).

**8. Public token.**
- Derivation is HMAC-SHA256 with key `"trips.booking.token.v1:"+SESSION_SECRET` and message bookingId, base64url, 256 bits. The domain label sits in the key, which gives distinct domain separation from `trips-holdcap:v1:`.
- Only `sha256(token)` is stored.
- In production without a secret (or with one shorter than 32 characters) it throws: fail-closed.
- Nothing in T0.6 verifies a token yet, so there is no comparison to make timing-safe (W1.3 must use a hash lookup or `timingSafeEqual`).
- The token never appears in events, audit or errors.
- Non-production fallback: m11.

**9. Isolation and permissions.**
- Every action uses `requireUnit` (unit from the page slug), then `assertCan(trips.booking.*, unitId)`, then a STAFF/COUNTER ctx. `canOverride` is set only after `assertCan(trips.price.override)`.
- Every id from the client is checked against tenant + unit: lines through `linesGate` and pricing/capacity, holdIds by basket + unit, bookingId by `readBooking` with tenant + unit, `partyId` by tenant (Party is tenant-level).
- Approvals are checked by tenant only (M1).
- Actor rules: PUBLIC can hold and confirm; cancel and change are FORBIDDEN. AGENT is FORBIDDEN in `parseCtx`. SYSTEM is FORBIDDEN on hold, confirm and bookNow, and allowed for cancel, approve and reads. These match the transition table.

**10. Prisma data, zod, deletes, events.**
- Every Prisma `data` field is picked explicitly. `policySnapshot` is server-built.
- Every input schema is `strictObject`. `expiredEventSchema` is a loose `z.object`, which is fine for an internal event.
- No DELETE anywhere.
- Event payloads are exactly `{bookingId, unitId, departureId, status, channel, amountSatang}`, keyed `<type>:<bookingId>` (changed: `:<bookingId>:<version>`), with no PII and no booking code.
- Audit `after` holds ids, status and amounts only.

**11. Change / move date.**
- Seat ordering: departures sorted; same departure uses `reserve(HOLD)` → `insertHold` → `convert` or `returnSold`; a move uses `moveSold` with the difference added or returned. Correct.
- The snapshot is rebuilt whole, but the old `policy` is grafted on (M2). The contract says only the cancel ladder should carry over.
- The old snapshot is not kept in audit.
- Holds are created and converted inside the same tx.
- Promo is mishandled (M3), passengers can exceed seats (m7), and `oldSeats` uses the wrong source (M6).

**12. Seed.**
- Goes through `bookTripsNow` (STAFF, PAY_LATER, so CONFIRMED/CONVERT), so `sold` = Σ seat items holds: R-2's 6 = 3 + 2 + 1.
- Idempotent: it skips when the basket for `st:<owner>:seed-tr-NNNN` is CHECKED_OUT, and `bookTripsNow` would replay anyway.
- No raw inserts. It creates no holds and no HOLD bookings.
- If m5 is fixed (unit in the key), the seed's `findFirst` key string must change with it.

**13. ORACLE-EDITs.**
- t0.1 S-8: tight. It allows only the bare facade imports `@/lib/modules/party` and `@/lib/modules/approval`, not deep paths. Justified by §16.4.
- t0.3 R-2: tight. Only racha 2026-11-14 may have `sold = 6`; `held` and `reserved` must still be 0. Justified.
- t0.4 S-12: justified, but broader than needed. It now accepts `KIND_NOT_SUPPORTED | FORBIDDEN | VALIDATION`, so it would still pass if `hold` were reverted to the stub. A SYSTEM ctx always returns FORBIDDEN now, so tighten it to `["FORBIDDEN"]`.

**14. Builder decisions.**
- REHOLD staff-only: OK, but reject it for PUBLIC instead of ignoring it (m15).
- SYSTEM FORBIDDEN on hold/confirm/bookNow: OK; matches NEW→* actors.
- Booking id `tb<20hex><2-digit index>` and reliance on sort order: OK. The id is server-generated, ≤20 lines, and REHOLD keeps the same ids. It is fragile but correct. It causes m3, because cross-basket promo order follows random ids.
- Approve ⇒ HOLD when nothing is due: wrong (M5).
- Hold-key replay after checkout returning BASKET_TOKEN_USED (or IDEMPOTENCY_CONFLICT for STAFF): acceptable, and fail-safe because the counters roll back. Document it.
- `finalizeTripsInTx` trusting `prepared`: yes, it can be forged (M4).

---

## Oracle checks too weak to catch these
- **M1:** CF-22/CF-23 only create approvals with `entityType: trips.price_override` and `unitId uA`. There is no negative case for another entityType, another unit, an amount mismatch or reuse.
- **M2:** MV-2 compares only `cancelLadder`. Nothing checks that `policy.trips.values` matches `tax`, `totals` and `paymentSchedule` after a change, or that settings other than the ladder were refreshed.
- **M3:** no change test on a booking that has a code.
- **M4:** no test calls `finalizeTripsInTx` / `tripSellable.finalizeInTx` with a hand-built or foreign `prepared`, or with a different actor.
- **M5:** CF-16 approves a DS booking where due-now > 0. There is no case with due-now = 0.
- **M6:** MV-6 never edits `countsCapacity` between booking and change.
- **m1/m2/m3:** LT-1 uses STAFF holds (no rekey). BK-5 uses same-month lines (shared SellCounter row) and single codes. Because `runTx` retries 40P01, "no BUSY" checks would rarely see these anyway. A deterministic test would need a held lock (`pg_sleep` in a control tx) to force the interleaving.
- **m4:** CN-6 replays with an identical body only.
- **t0.4 S-12:** its edit now tolerates the old stub.
- **S-12 (T0.6):** checks the consumer wiring statically only, not that failures are retried.

## Checked and fine
- No second connection inside any transaction. Party, approvals and settings are all read before the tx.
- Seat counters change only through T0.4 `*InTx`. `insertHoldInTx` always follows `reserveInTx(HOLD)` for the same departure and qty (hold, bookNow, REHOLD, change `addOn`).
- `nextSeqInTx` is the exact single CC §K statement. A rollback returns the number. Codes are unique per tenant.
- The basket key/hash swap and concurrent replay (FOR UPDATE then compare). Concurrent `insertBasket` uses ON CONFLICT DO NOTHING plus a re-read. A token on a second basket gives BASKET_TOKEN_USED.
- Rekey runs before convert, and `convertHoldInTx` gets `contact:<key>` for PUBLIC (§16.7).
- PRICE_CHANGED and QUOTE_EXPIRED write nothing. A promo failure returns PRICE_CHANGED with a fresh quote without the code. Hold expiry rolls back the whole basket.
- Cancel and reject order: seats, then booking CAS, then `releasePromoInTx` (r2 §d item 4).
- `transitionBookingInTx` actor rules and CAS.
- The event and audit payloads carry no PII.
- `state.ts` and `booking-core.ts` are pure. Snapshot and pricing changes are additive only. `basket.ts` checks product kinds before touching the DB.
- Server actions take the unit from the slug, call `assertCan` on every action, and gate override separately.

## What I did not check
- I did not run the oracle, typecheck, fitness or any DB test; all of this is static reading. Builder reports 126/126.
- I did not trace `assertProductSellableInTx`, `offerNextInTx`, `emitOutboxMany` or the `tenantDb` transaction client for hidden extra queries. I relied on the T0.4/T0.5 reviews for those.
- `party.findOrCreateInner` normalisation and merge behaviour, and whether `requireUnit` enforces `unitAccess`.
- The TripPassenger, TripHold and SellBasket column types and CHECK constraints beyond the unique indexes I read.
- How the outbox runner delivers `evt` (shape of tenantId/unitId/payload) and how `withAutomation` handles a result.
- `recomputeFromSnapshot` internals beyond the VAT lookup.
- The pricing fingerprint contents (whether overrides and approvals are in `priceFingerprint`).
- Agency, provider and FX paths (not reachable in T0.6).
