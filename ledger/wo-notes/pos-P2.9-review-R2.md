# P2.9 S review R2 (fix round 1): head affd5640 (gates at 2612ee53) · read-only · 14 Oct
**VERDICT: MERGEABLE-AFTER-FIXES.** All nine rulings are implemented and the oracle is credible. The H4 fix introduced one new money hole (G1). It needs a one-condition change plus one more oracle sub-check. I reviewed only the fix hunks (08cb294c..2612ee53, non-ledger, 7 files). The merge of bffa77e2 is ledger-only.

## Findings
- **G1 Medium · Voiding a bill on a gift card that is past its expiry date but still ACTIVE strands the card's remaining balance.**
  - Code: giftcard/service.ts:1423 treats `expiresAt ≤ now` as expired even when the status is still ACTIVE, i.e. the nightly sweep has not run yet. It then refunds X, expires only X, and sets the status to EXPIRED.
  - Input: card balance B > 0, `expiresAt` passed earlier today, `expireDue` not yet run, and a bill that used X on this card is voided.
  - Wrong state:
    - The card ends EXPIRED with balance B.
    - No EXPIRE txn and no 4900 JV are written for B.
    - `expireDue` only picks ACTIVE cards, so it never sweeps B.
    - B stays in 2110 forever, and the customer cannot spend it.
  - C5 only covers the case where `expireDue` already ran (status already EXPIRED).
  - Smallest fix: do the immediate refund-then-expire only when `upd.status === "EXPIRED"`. A card that is only past its date stays ACTIVE, and the next `expireDue` (HF-GC2 locked read) expires B + X with one JV. Alternative: expire the whole `upd.balanceSatang` at that point.
  - Add sub-check C5b: card past its date, not yet swept, bill voided ⇒ balance B + X; then `expireDue` ⇒ EXPIRE B + X and 2110 net 0.
- **G2 Info · V5's title figure changed from 225 to 208.**
  - It sits under the dated V4/V6/V7 ORACLE-EDIT marker (line 45 of the qc-pos-p2.9.mts diff).
  - The new figure follows arithmetically from the V4 edit, and V5's assertion code is unchanged.
  - Acceptable.
- **G3 Info · Cash refunds are capped, not forced pro-rata.**
  - refund.ts:379–399 caps cash-like refund rows at cash-like paid − tip − cash already refunded.
  - So a 225 refund could legally be 0 to the card + 225 cash, with later refunds pushed to the card.
  - Total cash out can never exceed cash paid, which is the literal wording of ruling 2.
  - The 117/108 and 208/192 figures are the oracle's choice; V6 lands exactly on the cap (192 = 300 − 108).

## Verified OK
1. **F1 · lock order**
   - `prepareSaleTenders` no longer locks anything.
   - `createSaleOnce` locks the sorted card rows at pos/service.ts:722, right after the receipt-counter upsert at :715. Stock locks come before the counter.
   - Every other path already locks in that order:
     - legacy `member.applyOnSale` runs at :793, after the counter;
     - `reload` calls `createSale(callerTx)` at giftcard/service.ts:794 before its card `updateMany` at :803.
   - No cycle remains. ST5 pins the order; C1–C4 are unchanged and green.
2. **H2 · wrong-PIN counter**
   - A wrong PIN is now one SQL statement (giftcard/service.ts:267): `UPDATE … +1` with the lock set in a `CASE`, `WHERE` the card is not locked, `RETURNING` the row.
   - Zero rows ⇒ LOCKED. The lock decision uses the returned row. A correct PIN only resets the counter if the card is not locked.
   - `preverifyGiftPins` (pos/service.ts:330, called at :575 when `createSale` owns the tx and the key has no bill yet) checks PINs before any transaction opens.
   - A wrong PIN therefore leaves no bill, no decrement and no receipt number used. The PIN counter goes up by exactly one per attempt: G9 shows 20 parallel attempts ⇒ 5 + LOCKED (red-before hit a P2028 timeout).
   - Inside the transaction, `prepareGiftTender` re-reads kind, status and balance before the lock. After the lock, `useTender`'s guarded `updateMany` (status ACTIVE, balance ≥ amount, :1375) refuses a card suspended or drained in between: GIFT_CARD_CHANGED with full rollback. A card's kind never changes.
3. **H1 · cash cap on refunds**
   - It only applies to bills that have GIFT_CARD/STORE_CREDIT rows (refund.ts:379–399).
   - Cash above the cap is allowed only when all of these hold:
     - it covers the unrefunded share of an unusable card;
     - the bill is a walk-in bill;
     - the refunder holds `pos.sale.refund` or goes through the approval path;
     - a reason is given (`REASON_REQUIRED` at :396).
   - The audit records `cardShareToCash` and the reason.
   - A member bill gets `REFUND_METHOD_INVALID` and must refund to store credit instead.
   - The V4/V6/V7 edits are exactly 117/108 and 208/192 with the dated marker. RC1 covers the 100%-card, member and walk-in cases.
4. **H3/H4 · store credit after a merge, and voids onto expired cards**
   - `mergeTargetOf` (:1444) follows the MERGE adjustment to the keeper's card, up to 5 hops.
   - `refundTenderUse` locks both card rows in sorted order and puts the refund on the keeper; `refundToCard` does the same.
   - `issueStoreCredit` re-reads the MERGED status under the card lock (:1526).
   - Walk of C4 + void with the card already EXPIRED:
     - the void reversal credits 2110 by 40;
     - REFUND 40, then EXPIRE 40 (key `giftcard-refund-expire-<USE>`);
     - `postRestoreExpire` posts Dr 2110 40 / Cr 4900 40, and is retried idempotently on replay;
     - 2110 nets to 0 and the balance is 0.
   - The past-date-but-ACTIVE case is G1.
5. **H5 · tip ledger**
   - `createSale` re-checks `tipLedgerOk` inside the transaction (pos/service.ts:620) ⇒ VALIDATION, no bill.
   - The account/coa.ts guard is 8 marked lines (:284, :299–303, :315). It does a read-only count of POS settings that point at the ledger, and refuses both archiving and a type change away from LIABILITY.
   - T6 is green and `qc-account-cpa` is 107/107.
6. **F4 · store-credit numbers vs gift-card operations**
   - `loadByNumber` refuses kind STORE_CREDIT as NOT_FOUND (:214). That covers reload, suspend, unsuspend, transfer and the legacy use path.
   - Sell-replay looks up by its own key, so it is unaffected.
   - The gift-card list and all three KPI totals filter kind GIFT (:1149 onward).
   - `listForCustomer` now returns `kind`, and store-credit numbers are masked as `SC-••••`. S5 covers this.
7. **H6 · replay without a PIN**
   - The register parser accepts a gift-card row with no PIN (register.ts:1956–1962).
   - `submitRegisterSale` returns the existing bill first (:2242). Otherwise it refuses with VALIDATION ("ใส่ PIN…", i.e. enter the PIN) at :2244, before any write.
   - `createSale`'s own row validation still refuses an empty PIN as a second guard.
   - G10 is green, and the P2.9U contract line about stripping the PIN is in place.
8. **Oracle**
   - The diff is exactly the 9 adds (ST5 T6 S5 G9 G10 RC1 MG1 MG2 C5) and the V4/V6/V7 edits, all with dated `ผู้คุม 14 ต.ค. (fix 1)` markers.
   - Plus self-fix 2e850b08, which restores the store-credit card in S5 so G8/R1 do not fail in a cascade on the base.
   - Red block 3 is 49/57, with exactly ST5 T6 S5 G9 G10 RC1 MG2 C5 red. MG1 passing before the fix is credible, because the merge fold already summed the balances.
9. **Gates** (notes, head=2612ee53 dirty=0), all as requested. I checked them against the notes only; the raw logs are outside my read scope.

   | Gate | Result |
   |---|---|
   | typecheck | 0 |
   | fitness ±env | 50/50 |
   | fitness-pos | 8 |
   | qc-pos-p2.9 | 57 ×3, residue 0 |
   | hf-tx | 22 |
   | p1.6 / p1.8 / p1.12 | 48 / 49 / 72 |
   | p1.3 / p1.1 | 128 / 180 |
   | account / cpa | 16 / 107 |
   | p1.7 / authz | 33 / 81 |
   | p2.8 | 59/61 (ST6 + L2 fail only on the wip branch; both accept the merge-base, so they pass after merge) |

10. **Status of every R1 and hunter finding**

    | Finding | Status |
    |---|---|
    | R1 F1 (lock order) | Closed (item 1). |
    | R1 F2 / H4 (void onto expired card) | Closed for cards already EXPIRED; the past-date-but-ACTIVE case is reopened as G1. |
    | R1 F3 / H3 (merged store credit) | Closed. |
    | R1 F4 (store-credit numbers) | Closed. |
    | R1 F5 / H2 (PIN counter) | Closed: atomic counter, PINs checked before the tx, owner line for the second connection. |
    | H1 (cash-out of card share) | Closed: cap, store credit, manager cash path. |
    | H5 (tip ledger) | Closed on both sides. |
    | H6 (PIN-less replay) | Server part closed; the UI part (strip the PIN in `savePending`) is in the P2.9U contract. |

Report saved at `/tmp/claude-0/-root/5169ed6b-3dd4-5e42-a1eb-90ec4124521e/scratchpad/p29-r/REPORT-R2.md`.
