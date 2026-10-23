# P5.1 HUNTER M-A "the bill" — tree p11 @ db716da0 (read-only · 23 Oct 2026)
Method: read code end to end (action → module → db). No DB writes and no node runs (brief §8), so every repro is "by reasoning + proposed oracle check". Two read-only sub-lanes: A (tenders/offline) gave F3 F12 F13 F14 · B (outbox, splits, non-POS callers) gave F2 F4–F7. I re-checked F2 and F3 in code myself; F4–F7 are B's tracing only.

## Findings
- **F1 HIGH — member benefits can eat the service charge, so a refund pays out more than the bill took.** `register.ts:1699-1700` refuses only grand < 0; `service.ts:1126` has no guard; the wallet cart has no bill discount (`service.ts:1100`, wallet `remaining` = cart subtotal). Then `refund-math lineNets` gives a negative net when D > Σ lines, `refundServiceCharge(full)` returns the whole service charge, and `refund.ts:590-594` never caps at grand − refunded (tender caps apply only to gift-card/store-credit bills, `refund-shared.ts:26`).
  Scenario: line 100,000 · bill discount 10,000 · service charge 9,000 · tier 10,000 + voucher 85,000 ⇒ grand 4,000 cash. Full refund = 0 + 9,000 ⇒ **9,000 paid out vs 4,000 received (expected ≤ 4,000)**.
  Fix: REFUND_EXCEEDS when `grand > sale.grandTotal − refunded` (after `refund.ts:591`) · lineNets puts any discount above Σ lines onto the service charge · cap memberDiscount ≤ beforeMember − service charge. **MA1**.
- **F2 HIGH — a booking or hotel deposit is counted as revenue twice.** The deposit is sold as an ordinary bill (`booking/service.ts:819-829`, `hotel/service.ts:714-723`, rental `:436`). The final bill then charges the full price in CASH without deducting it (`actions/booking.ts:141-155`, `hotel/service.ts:452-465`, rental `:249`).
  Price 200,000 + deposit 50,000 ⇒ expected revenue 200,000 / VAT 13,084; actual revenue 250,000 / VAT 16,355, and the drawer expects 50,000 too much.
  Fix: the final bill pays the deposit as a DEPOSIT row + the rest in cash, and the deposit receipt goes through POS_DEPOSIT (Cr 2110). **MA2**: deposit + final bill ⇒ Σ revenue = price.
- **F3 MED — the legacy action `actions/pos.ts:358 registerSaleAction`** checks only pos.sale.create (:68). It has no V2-on refusal and trusts the client's `unitPriceSatang` (:86) and bill discount (:112). It takes PROMPTPAY as a plain row (:389) with no intent and no manager confirm. It has no discount cap, no priceOverride right and no revoked-device check.
  Scenario: STAFF sells a 12,000 item at 100 ⇒ PAID bill for 100.
  Fix: refuse when V2 is on + call `assertLegacySaleAllowed` (`pos/api/tools.ts:439`) + the manual-confirm check. **MA3**.
- **F4 MED — re-taking a booking deposit after a refund records nothing.** `booking/service.ts:810-835`: record → refund (`:860` voids the bill) → record again. The same key `booking-deposit-<id>` returns the VOIDED bill and `depositPaidAt` is set ⇒ deposit shown as paid, 0 on the books. Fix: if the bill is not PAID, use a new key `-r<n>` (like `restaurant/order.ts:640-660`). **MA4**.
- **F5 MED — ticket and hotel lose the bill when createSale fails.** `ticket/service.ts:339-375` markPaid and `hotel/service.ts:416-470` checkOut commit the status first, then call createSale. If it throws (e.g. SHIFT_REQUIRED, `service.ts:667-671`), nothing is reverted and a retry hits BAD_STATUS ⇒ the item is never billed. Fix: the clinic revert (`clinic/service.ts:303-307`). **MA5**.
- **F6 MED — two quick subscribe submits create two subscriptions.** `member/subscription.ts:84-127` checks for an ACTIVE subscription, then creates one, with no lock and no partial unique. The key comes from the new row's id ⇒ two parallel calls = 2 ACTIVE + 2 PAID (2× price). Fix: advisory lock per customer, or a unique index WHERE status='ACTIVE'. **MA6**.
- **F7 LOW-MED — a refund racing mark-paid leaves a PAID bill on a refunded order.** `ticket:422-430`, `shop:417-420`, `clinic:347`: a refund between the PAID claim and createSale finds no bill ⇒ the bill lands PAID on a REFUNDED order. Fix: after createSale, re-read the order status and void the bill if it is no longer PAID. **MA7**.
- **F8 LOW — the core has no invariants.** `validateSaleInput` (`service.ts:253-301`) checks pay rows only for integer (:292). Nothing requires qty ≥ 1, price ≥ 0, line discount ≤ gross, bill discount ≤ subtotal, grand ≥ 0, or non-tender rows ≥ 0 (a direct caller can write `CASH −100` + `TRANSFER 200`). Fix: add these to validateSaleInput. **MA8**.
- **F9 LOW — partial-refund VAT uses today's POS rate and is not capped** at sale VAT − prior refund VAT (`refund.ts:627`). Σ refund VAT can exceed the bill's VAT. Fix: `min(split at the sale's rate, remaining)`. **MA9**.
- **F10 LOW — tip fallback cuts the wrong row.** With no tip ledger at drain time, `withoutTip` takes the tip from the last pay row whatever its type (`account-bridge.ts:102-111`, :139). With [CASH incl. tip, GIFT_CARD] ⇒ Dr 2110 is short by the tip. Fix: cut only from cash-like rows; snapshot the ledger id on the bill. **MA10**.
- **F11 LOW (follow-up F11) — duplicate-key error on the sale JV fails the whole event.** P2002 from `postExternalSale` on a normal bill fails the whole `pos.sale.paid` event ⇒ backoff retry (`outbox.ts:290-297`). The extra steps rerun but are keyed, so no double money; the cost is delay, and repeated collisions can end in FAILED. Fix: treat P2002 on the JV key as "already posted", or retry-once for all bills (`account-bridge.ts:398`). **MA11**.
- **F12 LOW (sub-lane A) — offline sale on an older price snapshot.** Any snapshot from the last 48 h is accepted (`offline-sync.ts:368`, `register.ts:2693-2707`), so a sale after a price change can go through at the old price. Fix: refuse or send to the manager queue when a newer snapshot exists. **MA12**.
- **F13 LOW (sub-lane A) — offline item can reuse an online bill's key.** It gets the online bill back as a duplicate and is marked SYNCED to it (`register.ts:2610`, `offline-sync.ts:520`). Fix: offlineRef ≠ ref ⇒ IDEMPOTENCY_CONFLICT. **MA13**.
- **F14 INFO**
  - The slip stores the client's amount without comparing it (`payment-slip.ts:163/:223`) — compare before slip-verify (F15).
  - The duplicate-key compare `samePayload` ignores bill discount/coupon/memberChoices (`service.ts:549`).
  - The books convert the ABB before POS claims the bill (`tax-invoice.ts:151` vs :164) — already an ops WARN (N2).

## Verified OK
- **Duplicate keys / numbering:** per-key advisory lock + unique + payload compare (`service.ts:855`). Receipt counter upsert inside the bill's tx, no gaps (:989); month-start P2002 retried when createSale owns the tx (:846) and by callers (`register.ts:2937`, `deposit.ts`, `giftcard:560/:822`). Unique (unitId, receiptNo). CN counter uses ON CONFLICT (`refund.ts:632`, `deposit.ts:475`).
- **Refund vs refund / void:** bill locked FOR UPDATE + remaining qty checked (`refund.ts:531/:572`). Void: conditional flip (:1565), credit-invoice lock (:1555), closed-shift check (:1561), re-read after a pending stock cut (:1335), deposit restore keyed (`deposit.ts:577-596`).
- **VAT / service charge / tip:** VAT once per bill, half-up, same formula as the bridge (`service.ts:1001/1136`, `:627`). Service charge is in the VAT base; tip sits outside grand. Table split Σ largest-remainder (`table-split-shared.ts:208-242`); paying a part locks + checks version (`register.ts:3095-3123`).
- **Outbox:** atomic claim with lease (`outbox.ts:244/:281/:293`); every step of pos.sale.paid/voided/refunded is keyed (JV `gl.ts:1756` · commission `:65` · points `member-bridges:100` · CRM · chat dedupe `:101`).
- **Tenders (sub-lane A):** gift card / store credit conditional update + unique; deposit id-order lock + CHECK; ON_ACCOUNT advisory lock; PromptPay intent FOR UPDATE + consumed by count; PLATFORM single full row. The AI sale is guarded (`ai/proposals.ts:796-806`).

## Coverage
| surface | status |
|---|---|
| createSale core | F8 · dup/lock covered by p1.6, hf-tx |
| callers | legacy action **F3** · booking/hotel/rental **F2 F4** · ticket/hotel **F5** · subscription **F6** · ticket/shop/clinic **F7** · AI/REST OK |
| tenders | p1.7 p2.4 p2.8 p2.9 p2.9b p3.6 p2.1 · OK · not covered: two keys spending one card at once |
| void | p1.8 / p1.16 · OK |
| refund | p1.8 p2.9 p3.6 · **F1** · F9 |
| ABB/TI/CN numbers | p1.13 · OK · F14 |
| JV + P2002 | money-mapping, account-cpa · F10 F11 |
| outbox replay ×2 | OK (keyed) |
| tip / service charge / VAT | p1.6 · F1 F10 · OK |
| split Σ | p2.5 · OK |
| offline | p3.4 · F12 F13 |
| slips vs intents | F14 |
| credit dueDate | p3.6 · OK |
