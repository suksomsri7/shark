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
