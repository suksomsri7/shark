# P2.9 S review R3 (fix round 2): head 318ef7aa (gates at 1d6d3abb) · read-only · 14 Oct
**VERDICT: MERGEABLE.**
- All seven fix-round-2 rulings are in place.
- The builder's deviation in 08ef0359 (PIN pre-check in its own short transaction) is sound and I accept it.
- I found no new money or locking defect.

Scope was 2612ee53..1d6d3abb outside the ledger (8 files). The upstream merge 08ef0359..1d6d3abb changes nothing outside the ledger.

## Findings (Info only)
- **G1 Info · rare race when a keeper is merged again during a void.** In `refundTenderUse` (giftcard/service.ts:1418), the keeper card is looked up before its row is locked.
  - Sequence: a void on old card G finds keeper K. Meanwhile a second merge K→L commits. The void then locks K and credits it, but K now has no owner.
  - Needs a void at the same moment as a re-merge of the keeper, so very unlikely.
  - Smallest fix: after locking K, look up the keeper again and loop. An owner line is fine.
- **G2 Info · G11 guards against regression but does not prove the new fix.** G11 already passed before the fix, because fix round 1's atomic +1 already kept the counter at 5 or below. It now pins "counter ≤ 5, no bill after the lock" for the reserve design. Acceptable.

## Verified OK
1. **R2 G1 (void onto a past-date ACTIVE card):**
   - giftcard/service.ts:1429 now expires immediately only when the locked row's status is EXPIRED.
   - A card past its date but still ACTIVE keeps B + X, and the next `expireDue` sweep expires the whole amount.
   - C5b asserts ACTIVE 300 with no EXPIRE yet, then `expireDue` ⇒ EXPIRE 300 and 2110 nets to 0. It was red before the fix and is green now.
2. **Reserve-before-verify** (giftcard/service.ts:251–279):
   - One UPDATE takes a slot (+1) only if the card is unlocked with fewer than 5 tries, or its lock has expired (:259). The 5th slot sets the lock in the same statement.
   - No row updated ⇒ LOCKED, and the PIN hash is never compared.
   - On a correct PIN, the counter resets only if the card is unlocked or still holds this request's slot (:266); otherwise LOCKED.
   - Worst case, a correct-PIN reset can wipe one parallel wrong attempt. Only someone who knows the PIN can cause that, so I accept it.
3. **Deviation 08ef0359 (PIN pre-check in its own short transaction):**
   - `preverifyGiftPins` (pos/service.ts:335) takes the same per-key advisory lock and checks for an existing bill. It then reserves a slot and compares the PIN in its own transaction, so each request uses one connection.
   - A failed check is returned rather than thrown, so the slot is saved before the error is rethrown.
   - The sale transaction calls `recheckGiftTender` (:1330). It does not compare the PIN again, but it re-reads kind, PIN lock, status, expiry and balance.
   - After the receipt counter, `useTender` runs its guarded update (ACTIVE, balance ≥ amount) under the card lock. A card suspended, drained or expired in between is refused with GIFT_CARD_CHANGED and everything rolls back.
   - A transfer only changes the owner, and there is no PIN-change operation (`pinHash` is written only at sell, :512, and on store-credit creation). So there is no window where an old PIN is accepted.
   - **Replays:**
     - A key that already has a bill returns "dup" and takes no slot.
     - A same-key request that lands between another request's pre-check and its sale transaction does take a slot. A correct PIN resets it to 0.
     - If the pre-check transaction times out, the slot rolls back and no compare was made.
   - C2 (10 same-key submits) is still a true idempotency test: advisory lock plus the duplicate check give 1 bill and 1 card deduction.
4. **H3 (lock order on merged store credit):**
   - `refundTenderUse` (:1417–1419) and `refundToCard` lock the old card first, then look up the keeper inside the transaction, then lock the keeper.
   - The merge fold locks both cards in one sorted statement (:1566).
   - If a void holds G while a merge is still running, the merge record is not visible yet. The void credits G without touching K, and the merge then moves G's balance, including the restored amount. The money is correct.
   - If the merge has already committed, its locks are gone.
   - Two voids on the same old card queue on G and both lock K second, so no cycle is possible.
   - The only leftover is G1 above.
5. **H5 (tip ledger):** `setLedgerActive` now has the same guard (coa.ts:636, one marked line). T6 is extended and green, and `qc-account-cpa` is 107/107.
6. **N2 (refund to store credit after a merge):**
   - `planRefundTenders` follows `mergedIntoId` up to 5 hops for store-credit refunds (refund.ts:424–432).
   - It refuses only when the chain does not end at an active member with a member system.
   - `issueStoreCredit`'s re-check for MERGED then applies to the keeper.
   - RC2 (keeper +100) went from red to green.
7. **H1 (walk-in cash-out of a card share):**
   - Approval is allowed if the user holds the refund permission, or there is a manager PIN or approval, or the refund is only being planned (refund.ts:571). In plan mode the decision is deferred to the commit.
   - A manager PIN records the manager as approver (:288). The approval flow records the decider (:485).
   - The audit row stores the approver as actor (:713), plus the cash-out amount and the reason. A missing reason gives REASON_REQUIRED.
   - STAFF without refund permission and without a PIN is still refused (NO_PERMISSION, :272). RC1(d) is green.
8. **Oracle:**
   - The diff is exactly G11, RC2, C5b, RC1(d) and the T6 `setLedgerActive` extension. All carry the dated fix-2 marker, and the count goes from 57 to 60.
   - Red block 4 is 57/60 with only RC1, C5b and RC2 red. G11 passing beforehand is explained in G2. Credible.
9. **Gates** (notes, head=1d6d3abb dirty=0) all match the request:

   | Gate | Result |
   |---|---|
   | typecheck | 0 |
   | fitness ±env | 50/50 |
   | fitness-pos | 8 |
   | qc-pos-p2.9 | 60 ×3, residue 0 |
   | hf-tx | 22 |
   | p1.6 / p1.8 / p1.12 | 48 / 49 / 72 |
   | p1.3 / p1.1 | 128 / 180 |
   | account / cpa | 16 / 107 |
   | p1.7 / authz | 33 / 81 |
   | p2.8 | 59/61; the 2 misses fail only on the wip branch and pass once merged |

   I checked these against the notes only; the raw logs are outside my read scope.
10. **Status:**

    | Item | Status |
    |---|---|
    | R2 G1 | Closed (item 1). |
    | H2 | Closed: atomic reserve, no compare without a slot. |
    | H3 | Closed except the two-level merge race (G1 Info). |
    | H5 | Closed: archive, retype and deactivate are all guarded. |
    | N2 | Closed (RC2). |
    | N3 | Closed: reserve-before-verify, guarded by G11. |

Report saved at `/tmp/claude-0/-root/5169ed6b-3dd4-5e42-a1eb-90ec4124521e/scratchpad/p29-r/REPORT-R3.md`. The earlier reports are in the same folder: `REPORT.md` (R1) and `REPORT-R2.md` (R2).
