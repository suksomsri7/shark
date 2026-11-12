# T0.5 r2 re-review — wip/trips-t0.5 @ 41468fa5a (diff from 19e90b6b6)

This was a read-only review: no build, no tests, no database. The hunter's probes were ignored.

**Verdict: FIX FIRST.** All 19 r1 findings are closed or closed by design, apart from B6, where the snapshot comparison was implemented but is broken (N1). The r2 work also introduces 1 new BLOCKER (N1) and 1 new MAJOR (N2), plus 5 MINOR. All of these are small fixes.

## (a) Status of the r1 findings

| r1 | Status | Evidence |
|---|---|---|
| B1 pickup on a foreign-currency quote | **closed** | `pricing-core.ts` pickup: `unitMinor = satangToMinor(sat)` and `thbUnitSatang = sat`. `amountSatangOf` returns `thbUnitSatang×qty`, so the amount is converted once. Agent discount excludes these lines. Promo does not apply because the quote is not THB. New gap: N4. |
| B2 promo total wrong after an override | **closed** | `promoBy` is tracked per source. Step 8 clears it. `promo` and `providers` are recomputed from the final lines, and zero entries are dropped. A duplicate `itemRef` is now rejected, which fixes the hunter's override-ratchet. T11 is measured against the resolved price. |
| B3 SHOP_COLLECTS formula | **closed** | Branches on `collectMode`. `payToAgent = C + Vc − W`. `remit = 0`. Gross-up only applies to AGENT_COLLECTS, including in the quote's `whtGrossUp`. `commissionOf` mirrors this. `collectedBy` is stored in the snapshot. A negative result is rejected. |
| B4 FIXED seat count | **closed** | `commissionSeatQty` and `usesCapacity` are stored per line, and `paidSeats` is stored in the block. Recompute uses `min(commissionSeatQty, remaining)`. BELOW_MIN_SELL uses `paidSeats`. |
| B5 cancel under ALL_LINES | **closed** | `cancelOf` walks the recorded instalments in `seq` order. A fully paid instalment contributes its recorded pass-through amount. A partially paid instalment contributes pass-through pro rata. |
| B6 snapshot from one resolution | **implemented, but broken** | See N1. |
| B7 unit-level extras | **closed per ruling 7, with a new defect** | Query is `OR [{productId}, {productId:null}]` scoped to the unit, so there is no cross-unit leak. See N2 and N3. |
| B8 quote id depended on the clock | **closed for the quote id** | `v: 2`. A due time equal to `now` is written as `"AT_BOOKING"`. FX contributes only `rateMicros`. The same token breaks the snapshot comparison (N1). |
| B9 RELEASED replay | **closed** | Only an ACTIVE row is replayed. A RELEASED row goes through the active / validity / per-contact checks and the guarded UPDATE, then is reopened with `WHERE status='RELEASED'`. A retry after rollback re-runs everything. A second call in the same tx replays. No double count. |
| B10 int4 bounds on params | **closed** | `intsWithin` at save time. SQL uses `::bigint` and `LEAST(…, int4)`. |
| B11 capPct | **closed** | Bounded 0–100. Agent discount is rejected if it exceeds the room or the commission. The core no longer goes negative. |
| B12 capacityRowsOf | **closed** | Rejects with `PricingAbort KIND_NOT_SUPPORTED`. |
| B13 cabinTypeId | **closed** | `CABIN_NOT_AVAILABLE`. |
| B14 setPrice P2002 | **closed** | Returns `STATE_CONFLICT PRICE_CONFLICT`. |
| B15 release lock order | **closed** | Rule rows are locked `ORDER BY id FOR UPDATE` before the decrements. |
| B16 child 70% from a common row | **closed** | Takes only the ADULT row. A common row applies at face value. Seasons resolve per pax type with fall-through. |
| B17 invalid rule | **closed** | `RULE_INVALID` warning (HIGH) plus `logOps`. The `logOps` call writes a row: N5. |
| B18 ladder from line 1 | **closed** | Per-line `cancelLadder` and `paymentSchedule`. The quote-level ladder is empty and a `LADDER_PER_LINE` warning is added when lines differ. |
| B19 small items | **mostly closed** | Schedule `amountMinor` added. SnapshotKeyMissing is caught. Approval `resolvedMinor` added, but it is optional, so an approval without it still floats. Payable and line int4 caps added. SYSTEM quoting DRAFT and the departure-status check are documented as owned by T0.4/T0.6 (accepted). |

## (b) Hand arithmetic on the changed paths

| Case | Path and result | Result |
|---|---|---|
| Racha 11,450 | No unit-level extras in the seed or fixture, so the lines are unchanged. Vatable 995,000. `vatOfInclusive` = 65,093. Base 929,907. Pass-through 150,000. Per-line VAT is now `allocateWithin` (sum is exact). | ✓ |
| Agent collects, 2 adults | C 105,000 · NONE: remit 715,000 (no WHT) / 718,150 · EXCLUSIVE: 820,000 − 105,000 − 7,350 + 3,150 = 710,800 · INCLUSIVE: C 98,131, Vc 6,869, W 2,944 → 717,944. The fixture now states the `EVERY_PAYMENT` precondition. | ✓ 7,150 / 7,181.50 / 7,108.00 / 7,179.44 |
| Shop collects | `shopCollects` 820,000. `payToAgent`: NONE 105,000 − 3,150 = **101,850**. EXCLUSIVE 105,000 + 7,350 − 3,150 = **109,200**. INCLUSIVE 98,131 + 6,869 − 2,944 = **102,056**. Remit 0. Recompute gives the same values. | ✓ 1,018.50 · 1,092.00 · 1,020.56 |
| Liveaboard TRIP_ONLY | Deposit = mulBp(6,580,000, 3000) = 1,974,000, pass-through 0. Balance 4,966,000 with pass-through 360,000. Due 23:59 local, travel minus 60 days. | ✓ 19,740 / 49,660 |
| Mock 15 | One BALANCE row of 1,145,000 with pass-through 150,000. Paid in full gives paidPt 150,000 and non-pass-through 995,000. At 50%: refund 497,500 + 150,000 = **647,500**. Kept **497,500**. VAT refund = `vatOfInclusive(497,500)` = **32,547**. | ✓ |
| ALL_LINES deposit | Deposit = mulBp(6,940,000, 3000) = 2,082,000. Its pass-through = mulDiv(360,000, 2,082,000, 6,940,000) = **108,000**. Paying the deposit gives paidPt 108,000 and non-pass-through 1,974,000. At 0%, refund **1,080**, keep **19,740**. | ✓ |
| Mock 16 | Per-pax season resolution gives the same result as r1 for Racha. | ✓ 4,500 / 3,150 |

## (c) New defects

**N1 — BLOCKER · `pricing.ts` `buildTripBookingSnapshot` together with `priceFingerprint` (`pricing-core.ts` "AT_BOOKING")**

Two problems in the same function.

1. **Normal use always returns PRICE_CHANGED.**
   - `quoted = priceFingerprint(input, priced)` uses the *fresh* `input.now` (t1).
   - The quoted `priced.paymentSchedule` has `dueAt = t0`, the quote's now. That is the DEPOSIT row, or the single BALANCE row, which exists in every booking.
   - Because t0 ≠ t1, the quoted fingerprint writes the literal `t0`, while the re-price writes `"AT_BOOKING"`.
   - So any call with the real clock (`ctx.now` unset, or set to booking time) fails with PRICE_CHANGED for 100% of bookings.
   - It only passes if T0.6 sets `ctx.now` to the quote time (`TripQuoteLine.policyAt`). That is undocumented.
2. **The comparison never sees what the customer was shown.** The function needs a full `PricedQuote`, but `Sellable.quote` returns a `Quote` that carries only a hashed per-line `fingerprint`. T0.6 has two choices, and both fail:
   - (a) Call `quoteTripLine` again at booking time. It then compares a fresh re-price with a fresh re-price, so the guard is a no-op.
   - (b) Keep the full PricedQuote server-side between quote and book. Nothing provides this today.

**Fix:**
- Mark booking-time instalments structurally (`ScheduleRow.dueAtBooking: true`, or `dueAt: null` in the fingerprint) instead of comparing against `input.now`.
- Change the signature to `buildTripBookingSnapshot(ctx, line, { quotedFingerprint: string /* TripQuoteLine.fingerprint */, policyAt: string }, opts)`.
- Re-price at **booking time** (ctx.now) and compare the hashes.
- Document: legitimate changes across midnight raise PRICE_CHANGED and are correct. These include an early-bird or booking window closing, the due date collapsing to a single instalment, and promo validity. FX date crossing midnight does not trigger it, because only the rate is fingerprinted.
- Alternatively, if the rule is "pin to quote time", T0.6 must check `now ≤ quote.expiresAt`. Write that into the JSDoc and the T0.6 brief.

**Connection use:** the function runs `tenantDb`, `snapshotPolicy` and `logOps` on the global client. It must be called **before** T0.6 opens its tx (L-5). Inside an interactive tx it takes extra pool connections and does not see the tx's own writes. Add an explicit "never inside a tx" note.

**N2 — MAJOR · `pricing-core.ts:686` with unit-level extras**
- A **mandatory** unit-level extra (unit currency, normally THB) is checked with `e.currency !== currency`, which returns `CURRENCY_NOT_ALLOWED` for the whole quote.
- Input: a unit with a mandatory THB "fuel surcharge" at unit level, plus a USD liveaboard. Every USD quote of that unit fails.
- The reverse also happens: a unit-level USD extra breaks every THB tour.
- **Fix:** for unit-level extras, treat them like pickup. Charge them in THB, converted once at the booking rate on a foreign-currency quote. Alternatively, skip unit-level extras whose currency differs and add a warning. This needs a one-line ruling.

**N3 — MINOR / needs a ruling · same place.** When a unit-level extra and a product extra of the same `kind` are both mandatory, both are charged (for example, two fuel surcharges). There is no de-duplication. A unit-level mandatory extra is also added to every product type (tours, attractions, liveaboards). Suggested ruling: a product extra of the same `kind` replaces the unit-level one.

**N4 — MINOR · pickup on a foreign-currency quote plus a manual override.**
- `amountSatangOf` returns `thbUnitSatang×qty` and ignores the overridden `unitMinor`.
- Result: the override succeeds and is traced, but the money does not change. `amountMinor` changes while `amountSatang` does not.
- **Fix:** reject an override of a `thbUnitSatang` line (`PASS_THROUGH_LOCKED`-style), or apply the override to `thbUnitSatang`.

**N5 — MINOR · `pricing.ts noteInvalidRules`.** `logOps` INSERTs `opsEvent` on the quote path. The brief (§5.1) says the quote writes nothing. It is once per rule per process and errors are swallowed. Either move it out of the quote path (to the action or a cron) or get the controller to accept it.

**N6 — MINOR · int4 caps.**
- `totals.grossSatang` (`TripBooking.grossSatang Int`) is not capped. Only payable and each line's `grossMinor` are.
- Many lines with large discounts can push the total gross over int4 while payable stays under it.
- **Fix:** add `grossSatang` and `vatSatang` to the `AMOUNT_TOO_LARGE` check.

**Cap level:** int4 satang (21,474,836.47 THB per line and per total) matches the `Int` columns. It covers the fixture full-boat charter (753,600 THB) about 28 times over, and a realistic 2-week whole-boat charter of 10M THB. A USD charter of about 600k USD at 35 THB/USD comes to roughly 2.1e9 satang, close to the limit. Keep the int4 cap. Raising it needs a schema ruling (BigInt columns), so I do not recommend changing it now.

**N7 — MINOR · `redeemPromoInTx` lock order when one booking has several codes.** Each call takes the rule's row lock through its UPDATE and holds it until commit. Two bookings redeeming codes A and B in opposite orders can deadlock. T0.6 must call redeem sorted by `ruleId`. Document this, or add a `redeemPromosInTx(list)` that sorts.

**Checked, no defect:**
- **SUPERSEDED_BY_CONTRACT** is a trace entry only. It is not part of the fingerprint, and nothing sums trace entries. `priceSource` and `unitMinor` come from the contract. If the contract has no price for that pax code, the tier price is also skipped, which is the wholesale replacement in ruling 9.
- **Promo re-count:** the per-contact check and the guarded UPDATE run in the same transaction under the per-(rule, contact) advisory lock. The validity check uses `ctx.now` in the unit's time zone, with the same tz source as the loader.
- **Per-line fingerprint vs quote id:** `quoteId = sha256(join(prints))` and line `fingerprint = sha256(print)`. They are consistent. Any line change changes both.

## (d) What T0.6 would have to guess (should be written into the T0.6 brief or as JSDoc)

1. Which clock `buildTripBookingSnapshot` re-prices at, and what it compares against (N1). Also whether to call it outside the tx (it must be) and before or after hold.
2. Expiry: whether to reject a booking after `quote.expiresAt` before building the snapshot.
3. The redeem amount must be `snapshot`'s `promo.discountSatang` and `providers[]`, not the quote's. On `PROMO_EXHAUSTED`, `PROMO_EXPIRED` or `PROMO_INACTIVE` at redeem, T0.6 needs to know whether to abort the booking or re-quote without the code.
4. What `contactKey` is (normalised email, phone, member id, or partyId). It feeds the per-contact cap and must be stable across channels.
5. Lock order inside the tx: product → departure (T0.4) → booking → promo rules (sorted by `ruleId`) → redemptions. Provider `redeemInTx` and `releaseInTx` go after the code redemptions.
6. On a multi-line basket, one snapshot per line with one fingerprint each. Which snapshot T0.6 writes per `TripBooking`, and how the basket-level ladder (empty plus `LADDER_PER_LINE`) is shown.
