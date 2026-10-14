# P2.9 S money hunt — `wip/pos-p2.9` b9e562c3 (code 0e9e3144) · tree b · read-only
**Verdict: FINDINGS** (0 critical · 4 medium · 2 low). Paths below are in `/root/projects/shark-pos-b` at 0e9e3144.

**H1 MEDIUM — gift-card / store-credit share can be refunded as cash (cash-out; ruling 10 says pro-rata to the card).** `src/lib/modules/pos/refund.ts:367-399` caps only the GIFT_CARD rows (≤ card paid − already returned). Nothing caps the CASH/TRANSFER/PROMPTPAY/CARD rows (`:531` checks only Σ = grand).
Input: walk-in bill ฿500 paid 100% GC-A (or member X's STORE_CREDIT) → `refundSale` with lines = all and `payMethods [{CASH, 50000}]` → ok. The drawer pays out ฿500 cash for value that came from 2110, and the card's ฿500 becomes cash. A stolen card plus its PIN can be laundered this way, and X's store credit can be drained by attaching X to a bill and refunding it (approval path too).
Fix: in `planRefundTenders`, cap cash-like refund rows at (cash-like paid − cash-like already refunded). Allow cash for the card share only when `giftCardRefundable` = false (V8's "เลือกเงินสดหรือเครดิตร้าน" case). Or get a controller ruling plus an owner line.
Missing check: "bill 100% GC → refund CASH ⇒ REFUND_METHOD_INVALID; with the card SUSPENDED ⇒ CASH allowed". V4 even uses a non-pro-rata split (card 100 + cash 125 on a 117/108 bill).

**H2 MEDIUM — the PIN lockout can be bypassed with parallel wrong PINs.** `giftcard/service.ts:243-270` `verifyPin` writes `pinFailedCount: card.pinFailedCount + 1` from the row read in `prepareGiftTender` (`:1304-1311`), not as an atomic increment. The lock check also uses that stale row.
Input: a cashier with `pos.sale.create` gets the card's balance from `registerGiftCardLookup` (tenant-wide numbers), then sends N parallel `submitRegisterSale` calls with N different PINs (fresh keys). Each wave raises the counter by only about 1, so ~4·N guesses fit in each 15-min window instead of 4. With N=100, a 4-digit PIN falls in about 6 h, and the winning guess pays a bill from the card. This was latent in legacy `use()`/`transfer()`; it is now reachable at scale from the register.
Fix: one SQL statement `UPDATE "GiftCard" SET "pinFailedCount"="pinFailedCount"+1, "pinLockedUntil"=CASE WHEN "pinFailedCount"+1>=5 THEN now()+'15 min' END WHERE id=$1 AND ("pinLockedUntil" IS NULL OR "pinLockedUntil"<=now()) RETURNING …`. Zero rows returned ⇒ LOCKED.
Missing check: 20 parallel wrong-PIN submits on one card ⇒ `pinFailedCount ≥ 5` and `GIFT_CARD_LOCKED` (G4 is serial only).

**H3 MEDIUM — store credit is restored into a merged-away card, so the value is orphaned.** `foldStoreCreditOnMerge` (`service.ts:1487-1501`) leaves the old SC card at balance 0, DEPLETED, `ownerCustomerId null`. The void step `tenderSaleVoided` (`pos/tender.ts:105`) → `refundTenderUse` (`service.ts:1381-1398`) credits by card id with no owner check.
Input: X pays ฿300 with STORE_CREDIT → X is merged into Z → the bill is voided → the ownerless SC card returns to ACTIVE with ฿300. Nobody can spend it: `prepareStoreCreditTender` needs an owner, and `tenderLookup` hides SC. Z gets ฿0, and 2110 keeps ฿300 forever.
A related race: `issueStoreCredit` (`:1453-1459`) running during a merge can INSERT a new SC card for the MERGED customer X after the fold commits. The MERGED check sits in `planRefundTenders:394` before the write.
Fix: in `refundTenderUse` (and `refundToCard`), when kind=STORE_CREDIT and the owner is null, follow the `MERGE` ADJUST txn (`refId` = keep card) and credit that card. In `issueStoreCredit`, re-read customer status ≠ MERGED under the card lock.
Missing check: "credit spend → merge → void ⇒ keep member's credit +300, orphan card 0".

**H4 LOW — a void restores value into an EXPIRED card, so the value is stuck.** `refundTenderUse` keeps status EXPIRED (`service.ts:1392-1393`). `expireDue` only touches ACTIVE cards, so it never fires again.
Input: C4 case (use ฿40, then expireDue EXPIRE ฿60 Dr 2110/Cr 4900) → void the bill → card EXPIRED with balance ฿40. The JV reversal returns Cr 2110 ฿40, which can never be released, and the customer cannot use it. Same as legacy `refundUse`.
Fix: if the card is EXPIRED or past `expiresAt` at restore, write REFUND then EXPIRE for the same satang (post `postGiftCardExpire` when `accountingDocId` is set), or refuse and record an owner line.
Missing check: C4 + void ⇒ card balance 0 and 2110 net 0.

**H5 MEDIUM — after the tip ledger is archived or retyped, every tipped bill's sale JV is dead-lettered.** `account/index.ts:217-221` throws when `liabilityLedgerOf` = null. `pos/account-bridge.ts:122,184` reads the ledger at drain time. `createSale` (`pos/service.ts:600`) checks only `tip.enabled`. `account/coa.ts:298-313` `archiveLedger` (and the type edit at `:290`) does not check POS tip settings.
Input: enable tips with 2190 LIABILITY → owner archives 2190 (allowed even with movements) → cash bill ฿6,500 + tip ฿500. The bill is PAID, cash sits in the drawer, `pos.sale.paid` throws 5× (`core/outbox.ts:17`) and goes DEAD. The GL has no revenue, VAT or cash for that bill, and it is the same for every later tipped bill.
Fix: in createSale/submit, re-run `tipLedgerOk` when `tipSatang > 0` (VALIDATION, no bill), and block archiving or retyping a ledger that a POS tip setting references.
Missing check: T-case with 2190 archived after enable ⇒ tipped submit refused, and 0 DEAD `pos.sale.paid`.

**H6 LOW (forward, owner line for P2.9U) — the customer PIN would be stored in the register's sessionStorage, and replay breaks.** `RegisterScreen.tsx:700-707` `savePending` stores the full submit and strips only `managerPin`. Today `register-shared.ts:777` `cartToSubmitInput` drops `giftCard`, so U must add it. If U does not strip `giftCard.pin`, the customer PIN lands in sessionStorage. If U strips it, a reload-replay is refused VALIDATION at `register.ts:1958` (the PIN regex runs before the createSale duplicate lookup at `service.ts:573`). The cashier then sees "unpaid" for a bill that was already PAID, re-charges it under a new key, and the card is spent twice.
Fix (U): strip the PIN in `savePending` and let `regParseSubmit` accept a PIN-less GIFT_CARD row only when the key already has a sale (duplicate lookup first).
Missing check: a U visual/unit test "pending store has no `pin`; PIN-less replay of a committed key ⇒ same bill".

**Probed and clean** (code + oracle):
- Two registers on one card: lock card→counter, conditional `gte` decrement (C1).
- The same card twice in one bill (trim+upper normalisation in `validateTenderRows`/`regParseSubmit`; number is unique per tenant).
- The decrement, PosPayment, USE and outbox are all in the sale tx, and callerTx callers re-throw ⇒ full rollback.
- A wrong PIN leaves no bill and no decrement.
- The void step runs even when earlier steps fail, is idempotent (key + lock + unique), and `refundUsesForSale` ignores `refType PosPayment` (V3).
- Void vs refund is serialised (`updateMany status PAID refundedSatang 0` vs `FOR UPDATE`).
- The per-card refund cap uses prior docs read after the sale lock (V9).
- JVs balance with tip (Dr Σ rows = grand + tip, Cr base + VAT + tip), STORED_VALUE→2110 on both the sale and refund sides, and store-credit issue is Cr 2110 via the CN.
- Shift and X/Z count CASH only.
- Lookup requires `pos.sale.create` and is tenant-scoped. `registerPayTenders` (scope only) returns booleans only. `payOrder` and API ops refuse GIFT_CARD/STORE_CREDIT. DEPOSIT/ROOM_CHARGE are not in `REGISTER_PAY_TYPES`.
- On the server the PIN is never stored, logged or echoed (payment rows map explicit fields, outbox payload is `{saleId}`, errors carry no PIN).


---

## Re-check after fix round 1 (account B, 14 Oct 19:2xZ) — head affd5640

# P2.9 S money re-check after fix round 1 — `wip/pos-p2.9` affd5640 (code 2612ee53) · read-only
**Verdict: FINDINGS** (H2 partial · 1 new medium · 3 new low). Paths are in `/root/projects/shark-pos-b` at 2612ee53.

| # | Status | Where / what still breaks |
|---|---|---|
| H1 refund cash-out | CLOSED | `pos/refund.ts:274-295`. The cap is cash-like paid − tip − cash-like already refunded, at bill level; prior docs are read after the sale lock. Two cards + cash + a prior partial refund: Σ cash ≤ cash paid and per-card ≤ card share. Approval commit re-plans. No rounding: the cashier picks the amounts and the cap is aggregate. Functional note, not money: STAFF + manager PIN on a walk-in with an unusable card is refused at the plan step (`managerOk` = `s.canRefund`, `:563` vs `:283`); only users with `pos.sale.refund` can cash out. |
| H2 PIN lockout | **PARTIAL** | `giftcard/service.ts:251-260`. The success path trusts the stale row: when `pinFailedCount` = 0 and the row is unlocked, it neither writes nor re-checks the current lock. N parallel guesses that read the row before the 5th wrong increment all get their hash evaluated, and the right one returns OK from `preverifyGiftPins` (`pos/service.ts:383-393`) even after the card is locked. Then either it pays (if it beats the lock), or it fails `GIFT_CARD_LOCKED` in the tx re-check. That failure comes visibly later than the wrong guesses, which fail in preverify, so latency reveals the PIN. Window 1 therefore evaluates N PINs, not 5. The counter itself is now atomic (OK). |
| H3 merge orphan | CLOSED, low race | `service.ts:1404-1429`, `:1482-1484`, `:1524-1525`; chain ≤ 5 hops. Residual: `mergeTargetOf` is resolved **before** the `FOR UPDATE` (`:1413`). Order void starts → fold commits → void locks the old card ⇒ the old card is credited while ownerless. Fix: re-resolve the target after taking the lock. |
| H4 expired restore | **PARTIAL → N1** | `service.ts:1431-1437`. 2110 nets to 0 for an EXPIRED card. When `accountingDocId` is null there is no JV, and nothing is stranded because the sale JV reversal mirrors the tender Dr. |
| H5 tip ledger | CLOSED, low residual | Fixed in `createSale` `pos/service.ts:619-622`, and `coa.ts` `updateLedger`/`archiveLedger` (retype to ASSET refused; the JSON path `pos.tip.ledgerAccountId` matches `payment-settings.ts:65-69`). Residual: `coa.ts:618-644` `setLedgerActive(false)` is not guarded. It archives a tip ledger with 0 journal lines, so bills committed but not yet drained ⇒ `pos.sale.paid` DEAD. Fix: add the same `usedAsPosTipLedger` line there. |
| H6 PIN-less replay | CLOSED (S) | `register.ts:1956-1962`, `:2244-2245`. Replay with a different amount ⇒ IDEMPOTENCY_CONFLICT (`regSameSubmission` type:amount). Different card, same amount ⇒ the same bill and no decrement. A PIN-less new key ⇒ VALIDATION before any write. The U contract line (strip the PIN in `savePending`) is pending in P2.9U. |

**N1 MEDIUM — the restore onto a card that is past its date but not yet swept marks it EXPIRED and strands its existing balance.** `giftcard/service.ts:1431-1437`.
Input: card balance B = ฿200 with `expiresAt` = yesterday, and the daily `expireDue` has not run yet (status ACTIVE). Void a bill that used ฿100 → REFUND 100 → EXPIRE 100 → `status: "EXPIRED"`, balance ฿200. `expireDue` only selects ACTIVE (`:1057-1058`), so the ฿200 never gets an EXPIRE txn or the Dr 2110 / Cr 4900 JV. 2110 is overstated by ฿200 forever, and the card is unusable.
Fix: in that branch, expire the whole locked balance (B + X) with one EXPIRE txn and one JV, as `expireDue` does. Or keep the status as is when it was ACTIVE and expire only X.
Missing check: card past date and ACTIVE with balance 200 → void a ฿100 tender ⇒ balance 0, EXPIRE Σ 300, 2110 net 0.

**N2 LOW — an STORE_CREDIT-paid bill of a member who was later merged cannot be partially refunded.** `pos/refund.ts:~423`.
Input: X pays ฿300 by STORE_CREDIT → X is merged into Z (`member/profile.ts:1841` does not repoint `PosSale.memberId`) → refund one line. The STORE_CREDIT method is refused because the customer is MERGED; CASH is refused because the cap applies and `sale.memberId` is set (`:289`); GIFT_CARD has no card on the bill. The only remaining route is a full void.
Fix: in `planRefundTenders`, resolve `Customer.mergedIntoId` (bounded chain) to the keeper and issue the credit there.
Missing check: "credit bill → merge → partial refund STORE_CREDIT ⇒ keeper credit +x".

**N3 LOW — PIN guesses are evaluated by hash before the lock is consulted** (the mechanism behind H2).
Fix: reserve before verifying. Run `UPDATE … SET "pinFailedCount" = "pinFailedCount" + 1 WHERE id = $1 AND unlocked AND "pinFailedCount" < 5 RETURNING` first (0 rows ⇒ LOCKED, and no hash compare), then compare. On a match, reset the counter to 0 with a conditional write. This caps hash evaluations at 5 per window regardless of parallelism.
Missing check: 50 parallel submits on a count-0 card, one of them with the right PIN ⇒ ≤ 5 hash evaluations (wrong-count + successes ≤ 5) and, once the lock is set, every response is LOCKED with flat latency. The current ORACLE-ADD covers wrong PINs only.

**Clean on re-probe:**
- **PIN pre-check outside the tx:** inside the tx, `prepareSaleTenders` re-reads the card and re-runs status, balance and PIN, so a suspend, drain or transfer in between ⇒ refusal and no bill. `useTender` keeps its `gte` guard after the counter (F1 lock order: stock → counter → card).
- **Lock window and expiry:** count ≥ 5 after the lock expires ⇒ the next wrong PIN re-locks at once.
- **Keeper chain:** follows the latest `MERGE` ADJUST; the keeper card always exists, because the fold requires it.
- **Kind filters:** `loadByNumber` refuses SC (reload, suspend, transfer and legacy `use`/wallet ⇒ NOT_FOUND); list/KPI filter GIFT; `balance()` still reads SC by number, which is read-only and owner-checked.


---

## Final re-check after fix round 2 (account B, 14 Oct 21:0xZ) — head 318ef7aa

# P2.9 S final money re-check, fix round 2 — `wip/pos-p2.9` 318ef7aa (code 1d6d3abb) · read-only
**Verdict: FINDINGS** (2 low only; no open medium or high money path). Paths are in `/root/projects/shark-pos-b` at 1d6d3abb.

| Item | Status | Evidence / remaining input |
|---|---|---|
| N1 past-date ACTIVE restore | CLOSED | `giftcard/service.ts:~1424`: `expired = status === "EXPIRED"` only. The past-date ACTIVE card keeps B+X, and `expireDue`'s locked read then does one EXPIRE and one JV (C5b). |
| N2 merged-member credit refund | CLOSED | `pos/refund.ts:424-432`: follows `mergedIntoId` ≤ 5 hops. `issueStoreCredit` re-checks the keeper under its lock. No double credit with the void path: void needs `refundedSatang = 0`, and refund needs PAID under the sale lock. |
| N3 / H2 PIN | CLOSED | `service.ts:245-277` reserves before verify (≤ 5 hash compares per lock window, 0 rows ⇒ LOCKED and no compare). The correct PIN resets only if the row is not locked or the count equals its own slot. A correct PIN at slot 5 still resets. The slot is released on a correct PIN even when the sale later fails (reset inside the committed short tx), so a customer is not locked out after N failed sales. |
| H3 residual | **PARTIAL → N5** | `service.ts:1415-1417`: the old card is locked first and then resolved, but the keeper is not re-resolved after it is locked. |
| H5 residual | CLOSED | `account/coa.ts:636`: `setLedgerActive(false)` is guarded. |
| H1 manager PIN | CLOSED | `refund.ts:571`: the plan step defers. Commit needs `canRefund`, or `auditActorId` set by `verifyManagerPin` plus `pos.sale.refund` on the approver (`:283-288`), or the approval consumer. The amount is capped by `stuck` (card share − card refunds). Two racing approvals both re-plan under the sale `FOR UPDATE`, and Σ cash ≤ bill lines, so no over-refund. |

**New code (08ef0359 short PIN tx), probed and clean:**
- **Replay of a committed key:** returns `"dup"` before any reserve (`pos/service.ts:272-274`), so no slot is consumed. A PIN-less register replay never reaches `createSale`.
- **Card suspended, drained or expired between the pre-check and the sale tx:** `recheckGiftTender` (`service.ts:1330-1338`) re-reads status, balance and lock in the tx, and `useTender` keeps its `gte`/ACTIVE guard after the counter.
- **PIN changed in between:** not possible; `pinHash` is only written at sell (`:512`), and transfer keeps it.
- **A wrong PIN:** the slot persists (the short tx commits, then the failure is rethrown). `validateSaleInput` throws inside the tx, so it rolls back with no slot consumed.
- **callerTx paths (`pinsVerified = false`):** still compare in the tx, with a reserve through `prisma`.
- **Two voids along one keeper chain:** they lock in chain direction (old → keeper), so there is no cycle and no deadlock with the fold, which never re-locks an ownerless card.

**N4 LOW — a same-key submit with a different card is served the first bill (pre-existing idempotency semantics, now with a PIN verified for card Y).** `pos/service.ts:338-362` `samePayload` and `register.ts` `regSameSubmission` compare only `type:amount`.
Input: request A (key K, GC-X ฿325 + cash 300) commits. Request B (same K, same lines, GC-Y ฿325, correct PIN) gets `"dup"` and the duplicate result with A's bill: "paid", while Y is never charged. This needs a reused client key (a bug or a malicious client), so it is low.
Fix: put the normalised card number (or `giftCardId`) into both bags for GIFT_CARD rows, so B ⇒ IDEMPOTENCY_CONFLICT.
Missing check: same key, different card ⇒ CONFLICT, and card Y's balance and counter are unchanged.

**N5 LOW — the keeper can be merged again while a void waits on it, so the credit lands on an ownerless card.** `giftcard/service.ts:1415-1417` and `refundToCard` `:1491-1492` resolve the target once.
Input: void of a bill paid with old card G starts: it locks G and resolves the keeper K (owned at that moment). A concurrent fold of K into W commits: K is ownerless with balance 0 and W receives K's balance. The void then locks K and credits K ⇒ the ฿x is orphaned on K. This needs a second merge racing the void.
Fix: after locking the target, re-run `mergeTargetOf` and loop until it stops changing (≤ 5).
Missing check: hold a lock on K while the fold K→W commits, then drain the void ⇒ W +x and K 0.
