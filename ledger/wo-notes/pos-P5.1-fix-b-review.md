# R1 (money + hunter M-B lens) — P5.1 fix batch B
Tree /root/projects/shark-pos-p11 · branch wip/pos-p5.1-fix-b · head 2eb58214 · product base origin/session/pos 3c26a7ca · reviewed 23 Oct 2026 (UTC), account B · read-only (no tracked file touched · tree clean)

## VERDICT: MERGEABLE-AFTER-FIXES (F1 only; F2–F4 = owner/controller rulings + OP lines, not blocking)

## Findings
### F1 MED — module deposit re-take after a *partial* use + refund records nothing (MA4 class, edge path)
- Where: `src/lib/modules/pos/deposit.ts:613-627` (moduleTakeDeposit). Rounds go to `-r<n>` only when the keyed receipt is not PAID. A receipt whose deposit was partly used and then refunded stays **PAID** (`refundDepositInTx` sets REFUNDED only when refundedSatang ≥ grand, deposit.ts:~545). In the round-0 tx, `sell` returns the dup receipt, `prior` PosDeposit exists, and the code returns `dup` = the old **REFUNDED** deposit.
- Reachable: walk-in/member booking deposits show in the register deposit lookup and can be applied to any bill (or booking DONE with price < deposit), then `booking.refundDeposit` refunds the remainder and clears the flags, then `recordDeposit` again.
- Probe PA (QC4 · temp tenant posqc-p5x-n3yzz7 · cleaned to 0 rows): recordDeposit 50,000 → register-style createSale uses 10,000 (DEPOSIT ref) → refundDeposit ok (CN 40,000 · receipt PAID/refunded 40,000) → recordDeposit again = `{"ok":true,"saleId":R0}` (not noop) · appointment depositPaidAt set, depositSaleId = R0 · linked deposit REFUNDED, remaining 0 · only 1 receipt exists. So the deposit shows as paid but 0 is on the books, and the DONE bill later charges full cash (moduleDepositForBill = null). Control: MA4 in qc-pos-p5.1 (no partial use) → new `-r1` receipt (green).
- Fix (≈3 lines, no schema): in the tx, `prior` select `refundedSatang`/`status`; `if (prior && prior.refundedSatang > 0) return { kind: "stale" }` (and the same check in the pre-tx `st === "PAID"` branch so it moves to the next round). Only a module refund clears the module flags, and it always leaves refundedSatang > 0, so a real retry/race (refunded 0) still dedups. Add an oracle row (MA4b: use part → refund → re-take ⇒ new PAID receipt 50,000 + OPEN deposit).

### F2 LOW-MED (OP/ruling) — hotel/rental: what is left of the deposit after a final bill or a refund has no module-side refund path
- `hotel/service.ts:534-566 refundStay`, `rental/service.ts:284-317 refundRental` void only the final bill; `depositSaleVoided` restores the APPLY ⇒ the deposit is OPEN again. `hotel checkOut`/`rental returnAsset` apply min(remaining, bill) (deposit.ts:683-690), so a deposit larger than the bill keeps the rest OPEN.
- Probe PB: stay 30,000 · deposit 50,000 → final bill `DEPOSIT:30000:ref`, no cash; deposit OPEN with 20,000 left. refundStay → `{"ok":true,"saleVoided":true}`, bill VOIDED, cash given back by the void = 0, deposit OPEN with 50,000 left. The customer gets nothing back until someone refunds the deposit at the register. The money is correct (a liability in 2110, Σ revenue = 30,000, so not lost or counted twice), but the hotel/rental screens report the refund as done.
- Proposed: in refundStay/refundRental (and after checkOut/returnAsset when remaining > 0), call `moduleRefundDeposit` for the remainder, or at least return/show `depositRemainingSatang` and add an OP line for hotel/rental owners. Needs a ruling because the module would gain a refund side effect.

### F3 MED (ruling needed) — a no-show or cancelled-reservation deposit can never become income
- Before P5.1 the deposit was revenue when taken (wrong when the customer shows up, but it "worked" for a no-show). Now it is a POS_DEPOSIT liability with `expiresAt` null, and there is no forfeit/expiry path anywhere (`grep EXPIRED|forfeit|ริบ` finds only the restore CASE at deposit.ts:756). `booking setAppointmentStatus NO_SHOW` (booking/service.ts:755) and `hotel cancelReservation` (hotel/service.ts:495) leave it OPEN. Result: 2110 grows forever and no-show income is never recognised; a walk-in no-show deposit is still redeemable at the register by whoever holds the receipt no.
- Booking deposits exist to protect against no-shows ("WO Wave3-A: กัน no-show", booking/service.ts comment above recordDeposit), so this is a product-level regression.
- Proposed (ruling): a forfeit step on NO_SHOW/cancel-with-forfeit = a bill "มัดจำริบ" paid by `{DEPOSIT, refSaleId}` through the module's existing createSale call site (recognises income, VAT already taken at receipt), or an owner-run "ริบมัดจำ" at the register. Interim: OP line telling owners to sell a "no-show fee" line paid by the deposit at the register.

### F4 LOW — module receipts default to pay type `DEPOSIT` (real money in) while `DEPOSIT` everywhere else means "deposit used"
- deposit.ts:604-608 (default `DEPOSIT`) · account-bridge.ts:216 `depositChannel` books it as TRANSFER/1010 · the day report byMethod (service.ts:1858-1885) sums module receipt rows and final-bill applies under the same "DEPOSIT" label ⇒ that line ≈ 2× the deposit, and it doesn't reconcile with GL 1010. Pinned by p2.9b A6 (CD-P51-O6), so this is a ruling item: have module callers pass `TRANSFER` (or the real method) for receipts. moduleRefundDeposit already falls back to TRANSFER (deposit.ts:~707).

### Checked OK (with evidence)
- Lens 1 Σ revenue = price: qc-pos-p5.1 MA2 green for hotel/rental/booking (200,000 · 4xxx 186,916 · 2200 13,084). Probe PB with deposit > bill: Σ revenue 30,000, no cash row. VAT is released per APPLY with the cap (service.ts:518-539) and the remainder goes out with the refund. Member benefits / service charge: module final bills pass none, same as base (a tier discount on a module bill was already a PAYMENT_MISMATCH before this batch; not new).
- Lens 2 double refund: PC (2 concurrent booking refunds) → 1 CN, second "ถูกคืนไปแล้ว". PD (register refund ∥ module refund on the same deposit) → 1 CN (module won · register DEPOSIT_CLOSED), deposit REFUNDED 50,000. Refund after consumption: refundDepositInTx rechecks remaining under `FOR UPDATE`. Take twice under `-r<n>`: concurrent takes serialise on the createSale key lock → dup (samePayload ignores sourceId).
- Lens 3 MA5/MA7: ticket revert is conditional `WHERE status PAID` and only when no bill exists for the key. Re-reading after createSale covers both orderings of cancelOrder (cancel commits before its bill lookup < our re-read). A double void is tolerated. Shop/clinic bind `WHERE PAID/BILLED` happens in one statement; on 0 rows → void + `{ok:false}`, no event, no stock cut. Hotel revert of CHECKED_OUT → CHECKED_IN + room CLEANING → OCCUPIED. Events fired before the revert stay (same pattern as clinic/rental; dedup key on retry). Info: on a revert, `ticket.order.paid` / `hotel.checked_out` consumers have already run for an unpaid/un-checked-out item (pre-existing pattern).
- Lens 4 MA6: `pg_advisory_xact_lock(tenant:subscription-active:system:customer)` wraps check + plan + create; cancel doesn't need the lock (a cancel-then-subscribe race is benign). Pre-existing: a createSale failure leaves an ACTIVE subscription with no bill (noted by the builder).
- Lens 5 MA1b: quote cap `max(0, r.grand − r.serviceCharge)` = createSale `beforeMember − serviceCharge` (service.ts:1144). r = r1 when the coupon is valid (an invalid coupon fails createSale anyway). The excess comes off the first TIER line in both. Over the cap even after the tier: quote BENEFITS_EXCEED_TOTAL vs createSale VALIDATION (both refuse). The register is INCLUDED/NONE only (register.ts:1409), so no EXCLUDED VAT drift.
- Lens 6 R1 F2: the check is per unit `basePrice + Σ option deltas < 0` (restaurant/order.ts:102-105). A "no cheese −10" option on a ≥ 10 base still works. Precedence matches the existing min/max BAD_OPTIONS early return.
- Lens 7 GL: receipt Dr 1010 / Cr 2110 46,729 / Cr 2200 3,271 (A6, HP-4.3, RP-4.3, BD-3.4). The CN reverses 2110 to 0 (BD-5.3). qc-money-mapping 5/5 · qc-account-cpa 107/107. Legacy deposits (no PosDeposit): moduleDepositForBill = null → full cash; booking refund → old void path; a legacy PAID key → kept as is. No mixed double count, but in-flight legacy reservations keep the old F2 double revenue (documented; INFO).
- Lens 8 ORACLE-EDITs: 46,729/3,271 = 50,000 × 7/107 rounded (VAT 3,271.03). The edits assert POS_DEPOSIT + PosDeposit linkage + JV > 0 + no 4xxx + REFUNDED/CN count, so none passes trivially. HP-4.4/RP-4.4/BD-4.1 go through the depositPaidAt noop (same idempotency as before). Gap: no oracle covers partial use → refund → re-take (F1) or deposit > bill / refundStay remainder (F2).

## Suites (QC4 · iso ISO_MEM=3G · qc4.sh · /tmp/shark-gate-pos.lock · sequential · logs scratchpad/p51-fix-b-r1/logs/)
| suite | result |
|---|---|
| qc-pos-p5.1 | 15/15 (guardHits 0 · pumpErrors 0 · residue 0) |
| qc-pos-p2.9b | 53/53 (forced · residue 0) |
| qc-booking-deposit | 18/18 |
| qc-hotel-public | 15/15 |
| qc-rental-public | 16/16 |
| qc-pos-p1.6 | 48/48 |
| qc-hf-tx | 22/22 |
| qc-money-mapping | 5/5 |
| qc-account-cpa | 107/107 |
| qc-pos-p3.6 | 52/52 |
| probe-r1 (PA PB PC PD) | F1 reproduced · PB/PC/PD as above · cleanup posqc-p5x-n3yzz7 rows left 0, tenant 0 |

## Not verified
- Strict tsc (not run by brief). Booking DONE via `setStatusAction` with deposit > price (needs the Next request harness) — covered by reasoning only (same moduleDepositForBill path as PB).
- UI text of the hotel/rental refund screens (whether staff see that the deposit remainder still needs a register refund).
- Two-process races for moduleTakeDeposit (by reasoning: the createSale key advisory lock serialises them).
- Probe script: scratchpad/p51-fix-b-r1/probe-r1.mts (not in the tree).
