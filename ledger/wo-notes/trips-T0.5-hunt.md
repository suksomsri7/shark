# T0.5 hunt — price resolver · snapshot · promo codes (lane l2, commit 19e90b6b6)

Hunter run on 12 Nov 2026. I modified no tracked files. All probes are untracked and live under `/root/projects/shark-trips-l2/scripts/`:
`probe-trips-t0.5-{diff,edge,snap,race,lib}.mts`. Each one ran through
`bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx <probe>` against `ep-calm-sun` (wo-trips-qc-l2).

There were 8 runs in total. All temporary tenants used the prefix `trips-hunt5-*`, and every run ended with `[cleanup] Tenant trips-hunt5-* left 0`.
Raw logs are in this folder (`diff1-3.log`, `edge1-2.log`, `snap2.log`, `race1.log`, `diff-examples.json`).
I did not run tsc on the probes (no project typecheck was allowed). They contain no BigInt literals.

## Verdict: **FIX FIRST**
- 1 BLOCKER: the T11 approval can be bypassed.
- 4 MAJOR: snapshot commission is not reproducible, the promo amount is overstated, a raw DB error comes from redeem, and the contract does not replace the tier price.
- The rest are MINOR or need a ruling.

---

## BLOCKER

### B1 — Repeated overrides on one line step the price past the T11 cap with no approval
- **Code:** `pricing-core.ts:817-840`. Overrides are applied one after another. Each one is checked against `w.unitMinor`, but that value has already been changed by the previous override. Nothing rejects a duplicate `itemRef`: `OPTS.overrides` in `pricing.ts:85`, and `pricing-actions.ts:130` passes the screen's array straight through.
- **Reproduction:** `probe-trips-t0.5-edge.mts`, case `F-OVERRIDE-RATCHET`. Setup: adult retail price 3,500, T11 = 10%, STAFF with `canOverride`, no approvals.
  - Three overrides on `seat:ADULT`: 315000 → 283500 → 255150.
  - Output: `{"ok":true,"payable":510300} [255150,2,"MANUAL"]`. That is 27% below the resolved price.
  - The same final price sent as a single override gives `{"ok":false,"code":"REQUIRES_APPROVAL"}`.
- **Expected:** REQUIRES_APPROVAL. The cap should be measured against the price before step 8, or duplicate `itemRef` values should be rejected.
- **Actual:** the quote succeeds at 2,551.50 per adult with no approval.

## MAJOR

### M1 — Snapshot `COMMISSION` recompute does not reproduce the quoted commission (COMMISSION_FIXED with a seat that does not count toward capacity)
- **Cause:**
  - The resolver counts only seats where `countsCapacity` is true: `pricing-core.ts:855`.
  - `snapshot.ts:328` counts every seat line that is not `:free`.
  - The snapshot does not store `countsCapacity`, so recompute has no way to match the quote.
- **Minimal case:** `edge`, case `F-FIXED`.
  - Inputs: 2 adults at 3,500, 1 INFANT priced 1,000, fixed commission 500 per seat.
  - Quote: C = 1,000.00, remit = 7,000.00.
  - `recomputeFromSnapshot(snap,{kind:"COMMISSION"})` on the unchanged snapshot: C = 1,500.00, remit = 6,500.00. The clawback logic would then see C go up.
- **Scale:** in the differential run (seed 777, `diff3.log`, signature `SNAPSHOT COMMISSION recompute`), this happened in 271 of 2,540 agency snapshots. Every one was COMMISSION_FIXED with an INFANT seat. Example: `commissionSatang 800343` (recompute) against `177854` (quoted).
- Which seat count is *correct* is ruling R3. The mismatch itself is a bug either way, because §7 requires recompute to equal what was recorded.

### M2 — `promo.discountSatang` keeps discount that a manual override removed
- **Cause:** step 8 clears the line's `discountSatang` (`pricing-core.ts:837`), but `promo` was fixed at step 7 (`:799`).
- **Minimal case:** `edge`, case `F-PROMO+MANUAL`.
  - Inputs: code SEA10 at 10%, and an override of `seat:ADULT` to 3,400 (a price increase, so no approval needed).
  - Output: `promo {"discountSatang":70000}` while `totals.discountSatang 0`.
- **Also seen in the differential runs:**
  - `diff1.log`: `promo.discountSatang 22798 ≠ Σ line discount 1250`.
  - `diff3.log`: `186096 ≠ 186083`.
  - The override hit only one of several discounted lines in those cases.
- **Impact:** T0.6 will record a redemption and emit `trips.promo.redeemed` for 700 THB that the customer never received.

### M3 — `maxUses` / `perContact` above int4 are accepted, then `redeemPromoInTx` throws a raw DB error
- **Cause:** `json-schemas.ts` defines `COUNT = z.number().int().min(0)` with no upper bound, and `savePriceRule` accepts it. `promo.ts:46,69-70` then casts `("params"->>'maxUses')::int`.
- **Reproduction:** `snap`, cases `7 savePriceRule maxUses 3e9` → `OK`, then `7 redeem on BIGMAX` gives:
  `RAW PrismaClientKnownRequestError P2010 … Code: 22003 … value "3000000000" is out of range for type integer`.
  `perContact` behaves the same way (`BIGPER`).
- **Expected:** a named VALIDATION error at save time. Ruling §13 says every integer must be bounded to int4.

### M4 — A CONTRACT with no per-pax prices does not replace the TIER price
- **Order text:** §3.3 step 6 says "CONTRACT ทับ TIER ทั้งก้อน (mode · อัตรา · ราคา)" — the contract replaces the tier as a whole.
- **Code:** `pricing-core.ts:751-757` applies the tier price first and leaves it in place whenever the contract has none.
- **Reproduction:** `edge`, case `RULING contract (no prices) over tier (ADULT 3,000)`.
  - Seat: `[300000,2,"TIER"]`.
  - Commission: `["CONTRACT",2000,120000]`.
  - So the price comes from the tier net while the 20% rate comes from the contract.
- **Expected under the order's wording:** the seat goes back to retail 3,500 (RETAIL/RULE), with commission at 20% of 7,000 = 1,400.
- If the overseer rules that the two layers merge, downgrade this to "ruling".

## MINOR

1. **Raw `RangeError` from the pure resolver and quote on very large sums.** This breaks the "named errors only" rule.
   - `edge`, `ADV 50×100000 pax at INT4 price`: `RangeError [money-math] a ต้องเป็นจำนวนเต็ม (ได้ 10737418235000000)`.
   - `ADV policy fx rateMicros 2^31-1 × big`: `RangeError … ผลลัพธ์ใหญ่เกิน…`.
   - It is reachable through `quoteTripLine`: 50 pax entries × 100,000 are accepted, so it fires once the database price reaches about 18M THB.
2. **`recomputeFromSnapshot` CANCEL throws a raw `RangeError`** when `paidSatang` or `deductionsSatang` is NaN or 1.5 (`edge`, `ADV-RC …`). The string `"500"` is silently coerced to 500.
3. **Agent discount larger than the commissionable line amounts (COMMISSION_FIXED).**
   - Case `F-AGENTDISC`: fixed commission 10,000 × 2 seats, discount 9,000.
   - Lines can absorb only 7,000 (`agentDiscountSatang 700000`), yet `commission.agentDiscountSatang 900000` and C = 11,000 (gross − 9,000).
   - 2,000 THB is not accounted for, and `remitToShopSatang -1100000`.
4. **The "≥ 10 characters" reason check counts zero-width characters**, because `trim()` does not strip U+200B.
   - `snap`, `7 archiveSeason reason 10 zero-width (referenced)` → `OK … ARCHIVED`.
   - `edge`, `ADV override reason 10 zero-width chars` → `ok`.
   - The same helper is used by `removePrice` and `setPriceRuleActive`.
5. **Wrong reason when a code is deactivated mid-flight.** In `race` P5, 40 parallel redemptions plus `setPriceRuleActive(false)` produced 4 `PROMO_EXHAUSTED` results instead of `PROMO_INACTIVE` (the code had 14 uses left). The counts stayed consistent (usedCount 36 = active rows 36).
6. **`redeemPromoInTx` ignores `validFrom`/`validTo` and the travel/booking windows.**
   - `race` P5b: a code with `validTo 2026-11-01` redeemed `OK`.
   - The quote does check these, but a code that expires during the hold will still be redeemed at confirm. See ruling R5.
7. **Re-redeeming after release returns a stale success.**
   - `race` P5c: redeem → release → redeem on the same booking returns `{replay:true, usedCount:null}`.
   - Afterwards the state is `usedCount 0, activeRows 0`: the redemption reports success but is neither counted nor active.
   - If T0.6 can ever re-confirm a released booking, this bypasses `maxUses`.
8. **NOT_FOUND message is not uniform.** A cross-unit `redeemPromoInTx` returns "ไม่พบโค้ดส่วนลดนี้ในหน่วยที่เลือก" ("discount code not found in the selected unit"). Every other function returns "ไม่พบรายการนี้ในหน่วยที่เลือก" ("item not found in the selected unit"). See `snap`, `6-distinct outcomes`. The order requires a single message.
9. **`setPrice` stores any `cabinTypeId`** without checking that it exists or belongs to the tenant (`7 setPrice cabinTypeId bogus` → OK). The resolver ignores such rows, so the result is dead rows.
10. **An invalid unit `tz` silently falls back to Bangkok** in `pricing-core.ts:359` and `snapshot.ts:235` (`ADV tz bogus 'Mars/Olympus'` → ok).
11. **Hardening only (not reachable through T0.2):** a pax code `constructor` makes the resolver throw `RangeError NaN`, because a plain-object lookup in `paxPrices` / `unitMinorByPaxCode` finds the prototype. T0.2 limits codes to `^[A-Z][A-Z0-9_]{0,23}$`.
12. **Info:**
    - Adding a valid promo code can turn an agent quote into `DISCOUNT_OVER_CAP`, because the promo shrinks C and therefore the cap. This happened 41–56 times per 20k run and is consistent with the order.
    - `tripSellable.capacityRowsOf` returns `[]` rather than failing. It is a stub owned by T0.4.

## Needs a ruling (my reference and the code disagree because the order is ambiguous)

- **R1 — Child 70% from a `paxTypeId = null` row.**
  - The code bases the CHILD fallback on an ADULT row *or* a common row with `paxTypeId = null` (`pricing-core.ts:557`). The order says "มีแถว ADULT" ("has an ADULT row").
  - Example (`edge`, `B-CHILD level has only paxTypeId=null row 500k`): the code gives the child 3,500 (70%). The literal reading gives 5,000 (the common row as-is).
  - This explains about 470 of every 20k random quotes differing from my reference (`ALT-READING childFromCommon`). It also accounts for the follow-on outcome differences: one REQUIRES_APPROVAL against OK, and one DISCOUNT_OVER_CAP against OK.
- **R2 — Season choice when the top season has rows but none for this pax type.**
  - The code picks the season by "any usable row of the product" (`:547`). Case `B-SEASON top season has CHILD row only`: an adult with a lower-priority season priced at 2,000 gets RETAIL 3,500.
  - "Usable" is measured *after* the weekday, window and currency filters. Case `B-SEASON top season row filtered by weekdayMask`: the code skips to the next season and gets 2,000.
  - Both cases could be read either way.
- **R3 — COMMISSION_FIXED "ที่นั่งที่จ่ายเงิน" (paid seats):** count capacity seats only (resolver) or every paid seat line, including an INFANT priced above 0 (snapshot). See M1.
- **R4 — Discount and VAT allocation helper.**
  - The order names `allocateLastRemainder`. The code uses `allocateWithin`, which caps each line and spills the excess to earlier lines.
  - Lines differ by 1–2 satang in about 5 of 60k quotes (`DIFF … discountSatang 41 vs 42`, `agentDiscountSatang 122729 vs 122731`, `vatSatang 0 vs 1`). Totals are identical.
  - The literal helper can push a line's discount above the line amount, so the code's choice is safer.
- **R5 — Should redeem re-check the validity window?** See MINOR 6.
- **R6 — Contract vs tier price merge.** See M4.

## What held (with counts)

### Differential testing (pure resolver vs my own BigInt reference)
Three runs of 20,000 random bookings (seeds 0x5eed05 twice and 777). The generator covers:
- pax mixes including 0 and up to 100,000, and duplicate pax entries
- 0–3 seasons with tied priorities, departure prices, option, weekday and window filters
- all 6 rule kinds, alone and stacked, with appliesTo and blackout
- tier and contract in PCT, FIXED and NET modes, with and without prices
- agent discount, promo by percent and by amount, a points provider
- manual overrides with and without approvals
- pass-through, non-discountable, 50%/0% commissionable extras, paxPrices extras, PER_DAY, PER_PAX_DAY and PER_BOAT_NIGHT
- pickup, USD with FX
- VAT included, excluded, unregistered or unknown; EXEMPT; all three WHT modes; NONE, EXCLUSIVE and INCLUSIVE commission VAT
- deposit TRIP_ONLY and ALL_LINES

Results:
- **Exact match** on items, totals, commission and schedule: 19,454, 19,459 and 19,495 of 20,000. The rest is explained by R1, R4 and M2.
- **Error-outcome match:** about 9,700 per run.
- **Order independence:** 0 differences across about 30k shuffles (pax types, pax, extras, requests, prices, seasons, rules, overrides, approvals).
- **Idempotence:** 0 non-idempotent results.
- **No throws** inside valid ranges.
- **Invariants held** on every successful quote, apart from M2's promo field:
  - every amount is a safe-integer satang
  - Σ amountSatang (+ VAT when excluded) = payable
  - vatBase + VAT = vatable
  - vatBase + VAT + pass-through + exempt = payable
  - pass-through lines carry no discount, commission or VAT
  - no line is negative and no discount exceeds its line
  - Σ instalments = payable, and each instalment's vatable + pass-through = its amount
  - Σ line VAT = document VAT
  - commission base ≤ non-pass-through amount
- **Monotonic:** adding a valid code never raised payable (0 violations in runs 2 and 3).

### Snapshot (pure)
Over 10,248 snapshots built from the random quotes:
- TOTALS and SCHEDULE recompute equal the quote 10,248/10,248, on deep-frozen input.
- COMMISSION recompute equals the quote except in the M1 cases.
- CANCEL invariants (refund + kept = paid, nothing negative, kept VAT ≤ document VAT) held in 9,977 cases. The 271 failures are all M1.

### Boundaries (`edge2.log`)
- **EARLY_BIRD at 30 days:**
  - Bangkok: 23:59:59 counts as 30 days and gets the discount; 00:00 counts as 29 and does not.
  - New York across the DST end (2026-11-01) and DST start (2027-03-14), both checked at local midnight: correct.
- **LAST_MINUTE 24 h:** exactly 24 h gets the discount; 24 h + 1 ms does not; 0 ms does not; 1 ms before departure does.
- **GROUP_TIER** by capacity pax: 4 → none, 5 → 5%, 9 → 5%, 10 → 10%. Infants are not counted.
- **FREE_LEADER (group of 10, 1 free):** 9 → 0, 10 → 1, 11 → 1, 19 → 1, 20 → 2, 21 → 2. Free seats are capped at N. Ten adults with GT and FL together give 9 at 3,150 plus 1 free.
- **Season edges** are inclusive (11-01 / 04-30 / 12-20 / 01-05). On 31 Dec the departure price 4,500 beats the New Year season. Archived seasons are ignored. A priority tie is broken deterministically by the lowest id.
- **Child fallback** at retail, season and departure levels, explicit child row priority, T28 null → PRICE_MISSING, and half-up rounding (1/3/5 satang → 1/2/4).
- **Blackout range edges** (12-10, 12-12) are inclusive and block both the rule and the promo code.
- **Price book and travel windows** are inclusive at both ends. A rule `bookTo` equal to today at Bangkok midnight applies.
- **Instalment due dates:** Bangkok 23:59 local; New York DST start → `03:59Z` next day; DST end → `04:59Z`; due date equal to today → a single BALANCE instalment.

### Snapshot on the real DB (`snap2.log`)
- 200 bookings, 67 of them through an agency and 75 with a promo.
- Every snapshot had 35 policy keys. Snapshot totals equal the quote totals 200/200.
- Then I changed everything live:
  - 6 prices, 1 season moved, 1 season archived, 5 rules edited or disabled
  - 15 settings (VAT rate, VAT inclusion, registration, cancellation ladder, shop-cancel refund, deposit %, deposit base, balance due date, child %, line defaults, park-fee table, hold time, T11, T12, cancellation-fee VAT)
  - extra prices and flags, the child `countsCapacity` flag, the agency port's terms
  - finally, archived the product
- After all that, recompute produced **byte-identical** output for 200/200 bookings across TOTALS, SCHEDULE, COMMISSION, COMMISSION-half, 3×CANCEL and EXTERNAL.
- Fresh quotes changed 40/40, quoteId changed 40/40, and after archiving the quote returns NOT_FOUND.
- Changing one stored field (`lines[0].amountSatang`) changed only the commission and cancel outputs.
- **Mock 15 from the snapshot:** 23 days, 50%. Refund 6,475.00, kept 4,975.00, refunded VAT 325.47, kept VAT 325.46.
- **Mock 03 (liveaboard):** deposit 19,740 and balance 49,660 (46,060 + 3,600 pass-through), due `2026-12-16T16:59Z`.
- Both stayed identical after changing A3's ladder, deposit and VAT inclusion, doubling prices and archiving.

### Promo codes on real parallel connections (`race1.log`)
- 5 uses, 100 parallel redemptions → exactly 5 succeed, 95 `PROMO_EXHAUSTED`. usedCount 5, 5 rows, `exhausted` emitted once, `redeemed` emitted 5 times.
- perContact 1, 20 parallel redemptions by the same contact (case and space variants) → exactly 1.
- The same booking redeemed 10× by the same contact → 1 row, 9 replays, usedCount +1.
- The same booking redeemed 10× by different contacts → 1 row, 9 named `STATE_CONFLICT/DUPLICATE_BOOKING`, usedCount +1.
- Releases (each sent twice) racing 15 new redemptions, over 3 rounds: usedCount always equals the active rows (5), never negative, never above the maximum.
- 10 parallel releases of one booking → released exactly once.
- Creating a code that differs only by case → `CODE_TAKEN`. 12 parallel creates of the same code → 1 OK and 11 `CODE_TAKEN`.
- Re-activating two inactive rules with the same code in parallel → 1 OK and 1 `CODE_TAKEN`. Editing an inactive rule into a duplicate code and then reactivating it → `CODE_TAKEN`.
- No raw 23505 errors anywhere.

### Price and season CRUD races
- 20 parallel `setPrice` calls on one key, once with all dimensions null and once with season, departure, weekday mask, book-from and travel-from all set → each time 1 row, every call returned the same id, and the row amount equals the last audit `after` (last writer is consistent). No raw errors.
- 10 parallel overlapping seasons at equal priority → 1 OK and 9 `SEASON_OVERLAP`. Two parallel edits that each create an overlap → both rejected.
- `updateProduct(currency USD)` raced against `setPrice(THB)` 12 times → 6 times `CURRENCY_LOCKED` with the price OK, 6 times update OK with `CURRENCY_NOT_ALLOWED` on the price. **No price row ever had a currency different from its product.**
- Rule against currency change → `CURRENCY_LOCKED`.

### Isolation
- I called 15 entry points from three contexts: tenant B, unit A2, and tenant B carrying unit A's unitId. The entry points:
  - `listPrices`, `setPrice`, `removePrice`, `saveSeason` (edit), `archiveSeason`
  - `savePriceRule` (edit and on-product), `setPriceRuleActive`, `setPrice` with a season reference
  - `quoteTripLine`, `quoteTrips`, `loadPricingInput`, `buildTripBookingSnapshot`, `tripSellable.quote`
  - `redeemPromoInTx`, `releasePromoInTx`
- Every call returned NOT_FOUND (one message variant, MINOR 8) and unit A's rows were unchanged. Release from another unit releases 0.
- A2's quote (same product slug, same code name HUNT10) uses only A2's price and A2's code. A's code ISOA gives `PROMO_NOT_APPLIED`.

### Sellable
- `tripSellable.quote` equals `quoteTrips` deep-equal on a 2-line basket.
- A third argument passed to `quote` (smuggled overrides) is ignored.
- `availability`, `hold`, `confirm`, `cancel`, `reserveInTx` and `finalizeInTx` all return `KIND_NOT_SUPPORTED`.

### Adversarial input → named VALIDATION or NOT_FOUND
- **Numbers:** NaN, Infinity, −1, 2^31, 2^53, numeric strings, 1.5.
- **Unexpected keys:** extra keys (strict objects), and `__proto__` keys (harmlessly accepted).
- **Sizes:** empty pax, all-zero pax, 51 pax entries, 10,000 extras lines, 5,001 price rows.
- **Policy:** out-of-range values for T28, T11 and VAT bp.
- **Promo codes:** 65 characters rejected; zero-width, full-width, RTL and emoji codes produce `PROMO_NOT_APPLIED`.
- **Dates:** year 1 and year 9999 on `now`; a `now` that is not a Date gives NOT_FOUND.
- **References:** pax types, extras, slots and options belonging to another product.
- **Currency:** `usd` in lower case is rejected; USD on a TOUR gives `CURRENCY_NOT_ALLOWED`.
- **CRUD:** weekday mask 128, priority 2^31, season name of 10k characters, a 2027-02-30 date, code zero-width or 33 characters, `params: null`, `bookFrom > bookTo`, a PUBLIC actor gives FORBIDDEN.
- **Redeem:** NaN discount and a 201-character contact key give a named `PricingAbort` VALIDATION.
