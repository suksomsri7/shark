# T0.5 independent review — wip/trips-t0.5 @ 19e90b6b6

Read-only review. I built nothing, ran nothing and opened no database. Every number below is worked out by hand through the code paths.

**Verdict: FIX FIRST.** There is 1 BLOCKER and 7 MAJOR findings. The pure core and money-math.ts are sound. The defects are in edge paths and in how the snapshot is assembled.

## A. Hand arithmetic (code path → result → reason)

| Case | Path | Result | Correct for the right reason? |
|---|---|---|---|
| Racha 2A+1C+park+camera | `resolveTripPrice`: SEASON MAIN gives 350,000 · CHILD has no row, so `levelPrice` CHILD_PCT gives mulBp(350,000, 7000) = 245,000 · park fee `paxPrices` passThrough gives `extra:…:ADULT` 2×60,000 and `…:CHILD` 1×30,000 · camera PER_BOOKING 50,000 VAT7 · `vatOfInclusive(995,000, 700)` = 65,093.46 → 65,093 | vatable 9,950.00 · VAT 650.93 · base 9,299.07 · pass-through 1,500 · payable 11,450 | Yes. VAT is taken once per document, on the sum. |
| Agency tier B 15% on 7,000 (2A) | commission block: base = Σ mulBp(amount, commissionBp 10000) = 700,000 · C = mulBp(700,000, 1500) = 105,000 · W = mulBp(105,000, 300) = 3,150 · remit = payable − C − Vc + (grossUp ? W : 0) | NONE: 7,150 without WHT, 7,181.50 with WHT · EXCLUSIVE: Vc 7,350, remit 7,108.00 · INCLUSIVE: C = mulDiv(105,000, 10000, 10700) = 98,131, Vc 6,869, W = 2,943.93 → 2,944, remit 7,179.44 | Yes. Note: INCLUSIVE gets WHT only when `continuous = EVERY_PAYMENT`, or when `minPerContractSatang` ≤ 98,131. A threshold of 1,000 THB on C would drop W and give 7,150.00. The fixture has to set this explicitly. |
| Camera at 50% commission | T44 `EQUIPMENT.commissionPct` 50 gives commissionBp 5000, so base adds 25,000 | ✓ | Yes |
| Liveaboard D1 69,400 | TRIP_ONLY: dep1 = mulBp(65,800, 3000) = 19,740 · bal 49,660 (46,060 + pass-through 3,600) · dueAt = `tripLocalToUtcIso(tz, travel−60, 1439)` | ✓, due 23:59 local on 16 Dec | Yes for TRIP_ONLY. ALL_LINES is broken downstream (finding M5). |
| Mock 15 refund | `cancelOf`: 23 days falls in the 50% step · Σ per-line mulBp of the non-pass-through lines = 4,975 · pass-through 1,500 refunded in full · `vatOfInclusive(4,975)` = 325.47 | refund 6,475 · kept 4,975 · VAT 325.47 / base 4,649.53 | Yes. It reads the snapshot only. |
| Mock 16 (31 Dec) | MAIN(0) and NEW_YEAR(10) both cover the date → NEW_YEAR wins → DEPARTURE row 450,000. CHILD at each level is 70%: 245,000 → 273,000 → 315,000. The departure level wins. | adult 4,500 / child 3,150 | Yes. Later levels always win. |

Rounding attacks that held up:
- Order independence (work is sorted, ties broken by id).
- Σ lines = totals, and base + VAT = vatable.
- Per-line VAT and promo allocations sum exactly.
- No floats on money outside money-math; grep is clean.
- No discount goes past its line (`allocateWithin` caps it, and bp is at most 10000).
- Zero-quantity lines are dropped.
- The FREE_LEADER group boundary 10/9/20 gives 1/0/2.
- EARLY_BIRD at exactly N days is accepted (≥).
- GROUP_TIER tiers ascend, enforced by json-schemas.

## B. Findings

**B1 — BLOCKER · pricing-core.ts:651-677 (`unitMinor: inp.pickup.surchargeSatang`) + :514/:941**
On a non-THB quote, the pickup surcharge (stored in satang) is treated as foreign minor units and then converted again.
- Input: USD liveaboard, rateMicros 35,000,000, pickup surcharge 50,000 satang (500 THB).
- Code: line = 50,000 cents = USD 500, amountSatang 1,750,000 (17,500 THB).
- Right: 50,000 satang (500 THB).
- Nothing warns. W05 is skipped and there is no currency check on pickup.
- Fix: when `!thb`, either reject pickup with CURRENCY_NOT_ALLOWED, or give the PICKUP line `amountSatang` = surcharge directly (keep it THB, `amountMinor` null), and do not run `toSatang` on it.

**B2 — MAJOR · pricing-core.ts:799 vs :836-837 (and :809)**
Manual override clears the line's `discountSatang`, but `promo.discountSatang` stays at the pre-override sum. Provider (points/coupon) discounts on that line are wiped the same way.
- Input: promo 10% on ADULT 700,000 + CHILD 245,000, then override `seat:ADULT`.
- Code: `promo.discountSatang` = 94,500.
- Right: 24,500.
- T0.6 would pass the 94,500 into `redeemPromoInTx`, and a provider would burn points for a discount that is no longer there.
- Fix: after step 8, recompute `promo.discountSatang` from the lines' PROMO trace entries with the code's refId. Also expose per-provider applied amounts and drop any provider or promo whose applied amount fell to 0.

**B3 — MAJOR · pricing-core.ts:978-982, pricing.ts:356-362 (builder decision "SHOP_COLLECTS = same formula")**
I disagree with this decision. For SHOP_COLLECTS the shop collects the payable and pays the agent C + Vc − W, so there is no remittance from the agent.
- Code: `collectFromCustomerSatang` = 820,000 and `remitToShopSatang` = 718,150. `Quote.agent.remitToShop` shows 7,181.50.
- Right: the agent collects 0 and remits 0, and the shop owes the agent 1,050 − 31.50 = 1,018.50. A1.3/T0.6 would book a receivable from the agent that does not exist.
- §F.1 also ties gross-up to `collectMode = AGENT`.
- Fix: branch on `terms.collector`. Under SHOP_COLLECTS: collectFromCustomer = 0, remitToShop = 0, add `payToAgentSatang` = C + Vc − W, and apply grossUp only for AGENT_COLLECTS. Make the same change in `commissionOf` in snapshot.ts:351.

**B4 — MAJOR · pricing-core.ts:855 vs snapshot.ts:328**
For COMMISSION_FIXED, the quote counts paid seats as `SEAT && !free && countsCapacity`, but recompute counts `SEAT && !free`. A snapshot line has no `countsCapacity` field.
- Input: FIXED 20,000/seat, with 2 ADULT and 1 INFANT (countsCapacity = false, priced).
- Quote: C 40,000.
- `recomputeFromSnapshot(COMMISSION)` with no cancel: C 60,000, remit is 20,000 lower, and clawback comes out wrong.
- Fix: store the per-line `countsCapacity` (or `paidSeats` in the commission block) in the snapshot and use the same predicate in both places. Also align `seats` in the BELOW_MIN_SELL check (:984), which includes infants.

**B5 — MAJOR · snapshot.ts:280-285 (cancel with partial payment under ALL_LINES)**
Recompute assumes the non-pass-through part is paid first. That only holds for TRIP_ONLY.
- Input: ALL_LINES, 30%, payable 69,400, pass-through 3,600. The deposit is 20,820, of which pass-through is 1,080 (:1031).
- Code: customer cancels at 0% after paying the deposit. Refund = 0, kept = 20,820.
- Right: refund 1,080 (paid pass-through is refunded in full), kept 19,740.
- Fix: split `paid` using the snapshot's `paymentSchedule[].vatableSatang / passThroughSatang` (whole instalments first, then pro-rata within the current one) instead of "non-pass-through first".

**B6 — MAJOR · pricing.ts:394-411 (+ :170)**
The snapshot is not tied to the numbers it records.
- `buildTripBookingSnapshot` takes the caller's `priced` without checking a fingerprint.
- It reloads the input with a new `now`.
- It reads the policy through a second settings read (`snapshotPolicy`), separate from the `resolveSettings` that priced the lines.

If VAT rate, ladder, T13/T15 or T28 changes between quote and booking, `policy.trips.values` disagrees with `lines/totals/cancelLadder/paymentSchedule` in the same snapshot. `cancelOf` then uses the new `vatRate` on old totals. Two snapshots of one booking can disagree.

Fix: call `snapshotPolicy` first, build the resolver's `policy` from `snap.values` (all 35 keys include every PRICING_POLICY_KEY except T11/T12/T5), re-run `resolveTripPrice` inside `buildTripBookingSnapshot`, and refuse (STATE_CONFLICT) if `priceFingerprint` ≠ the one quoted. Set `at` to the quote time.

**B7 — MAJOR · pricing.ts:161-164 (builder debt "unit-level extras not loaded")**
I disagree with this debt. T0.2 creates unit-level extras (`productId = null`, products.ts:1236), including mandatory ones.
- Code: the quote silently omits a mandatory unit-wide extra (for example a 300 THB fuel surcharge), so the customer is undercharged by 300.
- Requesting a unit-level extra returns VALIDATION "ไม่พบรายการเสริม".
- Fix: load `productId IN (product, null)` (product row wins on conflict), or get a controller ruling and have T0.2 forbid `mandatory` on unit-level extras until then.

**B8 — MAJOR · pricing-core.ts:1090 with :1021/:1036**
`priceFingerprint` includes `schedule[].dueAt`, and the DEPOSIT row (or the single BALANCE row) has `dueAt = now`. Every call with the real clock therefore gets a new `quoteId`, which breaks CC §C ("same values = same id"). Tests only pass because they inject `now`.
- Fix: fingerprint the instalment's kind and amount plus the balance due date only. Don't include `now`; use a token such as `"AT_BOOKING"`.

**B9 — MAJOR · promo.ts:50-55**
The replay check finds a RELEASED redemption (unique `(ruleId, bookingId)` ignores status) and returns `ok, replay: true` without bumping `usedCount`. A booking whose code was released and is then reconfirmed or reinstated gets the discount without consuming a use, and the per-contact cap is bypassed. `discountSatang` from the old row is also returned.
- Fix: replay only when `status = 'ACTIVE'`. For RELEASED, run the guarded UPDATE of the counter and then `UPDATE … SET status='ACTIVE', releasedAt=NULL WHERE status='RELEASED'`, after the per-contact check.

**B10 — MINOR · promo.ts:46,69 + json-schemas.ts:26**
`maxUses` and `perContact` are COUNT with no int4 bound, but the SQL casts `::int`. A shop that saves `maxUses: 3000000000` makes every confirm fail with a raw 22003 inside T0.6's transaction (the same class the T0.3 hunter found).
- Fix: bound them at int4 in `savePriceRule` (or in the schema).

**B11 — MINOR · pricing-core.ts:107 / :862-869**
`discountFromCommission.capPct` is PCT with no ≤100 bound. With capPct > 100, `gAfter = gross − agentDisc` goes negative, giving a negative C and Vc and remit > payable. Recompute clamps with `max(0)` (snapshot.ts:330), so quote and recompute disagree.
- Fix: bound capPct at 0–100 and clamp gAfter in the core too.

**B12 — MINOR · sellable-impl.ts:19**
`capacityRowsOf` resolves to `[]`, which looks like success. A generic caller could take "no capacity rows" to mean "nothing to lock". The other members fail closed correctly with KIND_NOT_SUPPORTED, and the shape matches core/sellable.ts.
- Fix: `Promise.reject(new PricingAbort("KIND_NOT_SUPPORTED", "NOT_YET"))`.

**B13 — MINOR · prices.ts:275-280**
`cabinTypeId` is not checked against tenant, unit or product, so a price row can reference another tenant's cabin type. The resolver ignores cabin rows today, but L1.3 will not.
- Fix: verify it, or reject a non-null value until L1.3.

**B14 — MINOR · prices.ts:269-307**
`setPrice` does not map P2002 (the NND unique) to a named error. It is safe today only because of the advisory lock. Seeds, raw SQL and future paths will surface a raw 23505.
- Fix: catch it the way `savePriceRule` does.

**B15 — MINOR · promo.ts:97**
`releasePromoInTx` decrements rule rows in RETURNING order. Two releases touching the same two rules can deadlock.
- Fix: sort by `ruleId` before the UPDATEs. On lock order: redeem/release take the advisory lock and then the `TripPriceRule` row lock, with no product lock. They are usable inside T0.6's transaction after the booking lock, as long as T0.6 always calls them last.

**B16 — MINOR · pricing-core.ts:556-558**
The child fallback takes 70% of a paxType-null "everyone" row. A row meant as one price for all pax types silently becomes a discounted child price. The spec only says "มีแถว ADULT".
- Fix: apply 70% only to an ADULT row. A null row applies at face value.

**B17 — MINOR · pricing-core.ts:683 (builder decision "invalid params skipped silently")**
I disagree with silent skipping. A corrupt early-bird rule vanishes without trace.
- Fix: keep skipping, but add a `RULE_INVALID` warning with `details.ruleId`.

**B18 — MINOR · pricing.ts:329 (builder decision "ladder from line 1")**
A mixed basket shows line 1's ladder for every line.
- Fix: fail with VALIDATION when the lines' ladders differ, or return the ladder per line.

**B19 — MINOR**
- pricing.ts:128 lets `SYSTEM` quote DRAFT products. The brief says staff only.
- The quote does not check departure status (CANCELLED/CLOSED departures can be priced).
- The snapshot's `paymentSchedule` lacks `amountMinor` for FX bookings (CC §F.2).
- `toTripsSnapshot` throws SnapshotKeyMissing unguarded from `buildTripBookingSnapshot`.
- Override approvals match `itemRef + unitMinor` but not `resolvedMinor`, so an approval stays valid after the base price moves.
- Line totals have no int4/payable cap. Values above 2^31 will overflow T0.6's Int columns.

## C. Items checked and found OK

- **Purity:** pricing-core and money-math have no prisma, no settings values and no clock; snapshot.ts imports only money-math and types. No `any`, `console`, `/ 100`, `toFixed`, `Math.round` or business literals.
- **Messages and actions:** messages are in Thai. `"use server"` exports only async functions, and each does `requireUnit` + `assertCan`. `canOverride` is set only after `trips.price.override`, and approvals are never taken from the UI.
- **Override rules:** reason ≥ 10; PASS_THROUGH_LOCKED; REQUIRES_APPROVAL with an equality boundary at exactly the cap; W22 never blocks. The quote writes no audit, so T0.6 must write the override audit.
- **Isolation and mass assignment:** every query has tenantId/unitId. `data` objects are built field by field, so there is no OQ18 exposure. X1 leaks are blocked (seasons are unit-scoped, prices product-scoped, rules unit-scoped).
- **Products and locks:** the helper runs before the advisory price/rule lock and nothing locks the product FOR UPDATE afterwards. The currency lock in products.ts sits under `lockProduct` FOR UPDATE, so it serialises with the helper's FOR SHARE.
- **Seasons:** the overlap check is under a per-unit advisory lock.
- **Promo codes:** CODE_TAKEN is mapped (both the pre-check and the P2002 path).
- **Redemption:** a single guarded UPDATE with a row-count check, an INSERT in the same transaction, and a per-contact advisory lock make parallel same-contact redemptions serialise. Release is idempotent through `status = 'ACTIVE'`. Events carry no code and no contact, and are registered in all 3 places.
- **Recompute (ข):** after the quote, changes to season price, tier %, ladder, park-fee table, child band, VAT or WHT settings do not change recompute output. It reads only the snapshot (VAT through `snapshotValue`, ladder, commission terms). This holds only if the snapshot itself is consistent; see B6.
- **Snapshot:** `v: 1`, and all 35 §N.3 keys come from the registry (defs/trips.ts:481). The 3 extra fields (travel/tz, vatRateBp, per-line commissionBp/gross/discount, schedule split) are justified by the §12 ruling. One more field is needed: countsCapacity (B4).

## D. The builder's decisions

- Agree:
  - season = the highest-priority ACTIVE season with any usable row (matches §3.3 "ไม่มีแถวราคาของสินค้านี้");
  - BLACKOUT also blocks promos on extras;
  - discount-from-commission is deducted before VAT and WHT;
  - agent discount only on a single line;
  - the duplicated time-zone helpers, as temporary debt, to be replaced by departures-core when T0.3 merges (the two copies differ in implementation);
  - the seed's direct 31 Dec departure row. The duck-typed `createDeparture` call with a guessed signature is fragile and should be checked when T0.3 lands.
- Disagree:
  - SHOP_COLLECTS formula (B3);
  - unit-level extras (B7);
  - silent invalid rules (B17);
  - ladder from line 1 (B18).
