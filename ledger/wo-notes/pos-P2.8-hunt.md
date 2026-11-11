# P2.8 S — money-lane hunt (head wip/pos-p2.8 1db73b0c · code 1b84db06 · base fdb8d54c) — read-only

## Part A — R2 verification
**R2: OK.** One nit below; no severity.
- **F1** `order.ts:846` `isPaidWeb` (adapter WEB and PAID). The check sits at `:889` in rejectOrder and at `:981` in cancelOrder, before the state rules and before any tx or outbox row. The ECOM-sale branch `:985` reuses `webPaidRefusal`. The message matches the ruling. `orders.errors.webPaid` is in th/en `pos.json:2975`. The unpaid WEB reject still goes to `posOrderRejected` and then `shop.cancelOrder` (`outbox-consumers.ts:191–196`). W9 control proves this path.
- **F2** `catalog.ts:2955` filters the book to `(WEB,*)` rows and to rules where `channelCodes.includes("WEB")`. `:2967` takes the resolver result only when source is CHANNEL or RULE; otherwise it uses ShopProduct. BRANCH rows cannot win, because level 3 of `winningRow` (`price-shared.ts`) finds no rows. Both storefront `listProducts` and the `createOrder` snapshot call `webPricesForShop` (`shop/service.ts:109`, `:140`), so the two reads cannot drift. The hunk is inside the P2.8 section: banner at `:2871`, section runs to EOF.
- **F3** `order.ts:764–768` and `:780`: parent archived ⇒ `PRODUCT_UNAVAILABLE` + lineIndex. This applies to priced lines too, because the check runs before the `priced` branch.
- **F4** `order.ts:954–963` `voidRefusal` covers every `BillsRefusalCode` (`bills-shared.ts:14`) plus the PIN codes and PENDING_APPROVAL/APPROVAL_REQUIRED, with requestId kept. HAS_REFUNDS gets its own key. UNKNOWN maps to INTERNAL. No raw code reaches the client.
- **F5** `order.ts:1215–1223` sorts desc, takes 2000, then reverses. `since` is clamped to now−7d, and the effective value is returned at `:1245`. The type is in `order-shared.ts:214`.
- **ORACLE-ADDs**: W9 at e827c9a4 and W10 at 8439325a only add lines; nothing is removed or weakened.
  - Red-before is real:
    - `p28-W9-redbefore.log`: head bca735ad, 55/56, W9 red ("reject → OK, REJECTED PAID").
    - `p28-W10-redbefore.log`: head e827c9a4, 55/57, W10 red (15300/13600 vs 20000/16000).
  - Gates at 1b84db06: 57/57 ×3, PAR 4/4, residue 0.
  - Nit: W9 covers reject only. Cancel of a PAID WEB order has no oracle line; the code path is trivially the same guard.
- **Scope**: the round touches 6 files only. register.ts, pos/service.ts, channel.ts, chat and the contract are untouched. Owner lines (F2 + deploy-backfill, dev-7) and the P2.8U additions (hide reject/cancel for PAID WEB, `messageKey`, `since`) are present.

## Part B — Verdict: **FINDINGS** (2 Medium · 3 Low)

**H1 Medium — the F1 guard reads a mirror that reaches PosOrder only through a best-effort outbox extra; paid web money can still be stranded.**
`isPaidWeb` reads `PosOrder.paymentState`. That field is set only by `onShopOrderPaid` (`order.ts:1306–1318`). It runs as the last compose extra of `shop.order.paid` (`outbox-consumers.ts:1086`). `compose` swallows extra errors as a WARN and never rethrows (`:441–449`), so that step is never retried. Separately, `confirmOrderPaid` claims `PENDING_PAYMENT→PAID` (`shop/service.ts:249`) without looking at the PosOrder.
- **Interleaving (a), reject first.** Staff call rejectOrder: v1 NEW UNPAID → REJECTED, outbox `pos.order.rejected`. Before the drain runs it, the web admin calls confirmOrderPaid: claim succeeds, ECOM sale `ecom-<id>` is posted (sale JV via the outbox), stock is cut (`:330`), and `shop.order.paid` is emitted. Then `posOrderRejected` → `shop.cancelOrder` matches PENDING_PAYMENT only ⇒ no-op. Then `onShopOrderPaid` → `touch` writes PAID onto the REJECTED order; `touch` has no status guard.
- **Interleaving (b), paid first.** Confirm commits. Before the extra runs, or after it failed (pool timeout, the same starvation seen in deviation 4), staff call reject. The order is still UNPAID ⇒ allowed ⇒ same end state.
- **End state:** ShopOrder PAID, ECOM sale PAID, revenue booked, stock cut, PosOrder REJECTED. Nothing is cooked, nothing is refunded, nothing is signalled. This is exactly F1's money outcome.
- **Smallest fix:** mirror the payment inside confirmOrderPaid's own txs through the facade, as `createOrder` already does with `ingestInTx`:
  - `orders.webClaimInTx(tx, shopOrderId)`: lock the PosOrder `FOR UPDATE`. If it is REJECTED or CANCELLED, refuse the claim (return ok:false). Otherwise set PAID and bump the version.
  - `orders.webSaleBoundInTx`: bind `saleId` in the posSaleId tx (`:296`).
  - Reject's versioned UPDATE then serialises against it: the loser gets ORDER_STATE_CHANGED, and the fresh card shows PAID.
  - `onShopOrderPaid` stays as a no-op confirmer, but must not write PAID onto closed orders or onto a VOIDED sale; it should log/alert instead. That also closes the reviewer's void-before-paid follow-up, which F1 now makes unrecoverable at POS: a PAID+VOIDED order can no longer be rejected or cancelled.
- **ORACLE-ADD W11** (no drain between steps):
  - createOrder → reject (UNPAID) → confirmOrderPaid ⇒ ok:false, no `ecom-<id>` sale; after drain, ShopOrder is CANCELLED.
  - createOrder → confirmOrderPaid, **before any drain** PosOrder.paymentState = PAID, then reject ⇒ ORDER_STATE_INVALID webPaid.
  - Mark the `shop.order.paid` row DONE without running it ⇒ PosOrder is still PAID.

**H2 Medium — cancelling an accepted, unpaid WEB order leaves the ShopOrder payable (spec gap: brief R10 makes `cancelled` a no-op).**
cancelOrder `order.ts:978–1010` (WEB DIRECT, no sale) moves the PosOrder to CANCELLED. `pos.order.cancelled` is `withAutomation(async()=>{})` (`outbox-consumers.ts:738`); only `rejected` cancels the ShopOrder (`:735`).
- **Interleaving:** WEB NEW → acceptOrder → cancelOrder ("ลูกค้าไม่มารับ") ⇒ ShopOrder stays PENDING_PAYMENT. The customer then pays and the admin confirms. confirmOrderPaid succeeds: ECOM sale, JV, stock cut. `onShopOrderPaid` then sets the CANCELLED order to PAID.
- **End state:** money and stock taken for an order the kitchen cancelled; no refund path is signalled.
- **Fix:** add `"pos.order.cancelled": withAutomation(posOrderRejected)`. It is idempotent: `shop.cancelOrder` matches PENDING_PAYMENT only, and `sourceCancelledInTx` is a no-op on closed orders. It is also safe for the SHOP- and SALE_VOIDED-sourced cancels. H1's claim guard covers the drain window.
- **ORACLE-ADD W12:** createOrder → accept → cancelOrder → drain ⇒ ShopOrder CANCELLED. confirmOrderPaid ⇒ ok:false, no ECOM sale, stock unchanged.

**H3 Low — `onSaleVoided` is also a swallowed extra** (`outbox-consumers.ts:697`). If it fails once, the order keeps PAID/PLATFORM_PAID and stays open after a bills-drawer or approval void. `handOver` is then still allowed (`order.ts:911`) ⇒ goods are handed over against a refunded bill. It is recoverable only by a manual cancelOrder (`:998`, refunded=true).
- **Fix:** on failure, the extra enqueues its own retry event (`pos.order.saleVoided#<saleId>`, base = `onSaleVoided`, idempotent). Also refuse `handOver` when `saleId`'s sale is VOIDED.
- **ORACLE:** withhold the extra (row DONE) then handOver ⇒ refused.

**H4 Low — `sourceCancelledInTx` gives up on a lost race** (`order.ts:817`). Shop cancel tx reads v1 NEW; accept commits v2; the transition gets 0 rows ⇒ `changed:false`. Result: ShopOrder CANCELLED, PosOrder ACCEPTED (kitchen cooks; handOver is blocked by ORDER_UNPAID). There is no money movement, but there is waste.
- **Fix:** re-read and retry inside the same tx on OrderRaced, as `onShopOrderPaid` does.
- **ORACLE:** the W4 variant with accept interleaved.

**H5 Low (reporting, not money) — deviation 8 text is false.** Web mirror lines are always `priceSource "CHANNEL"`, with `priceRuleId`/`listPriceSatang` null (`order.ts:783`; `createOrder` sends priced lines, `shop/service.ts:200`). An explicit WEB rule sale (W10, 16000) is therefore attributed CHANNEL, and promo-usage reports undercount it.
- **Fix:** pass `priceSource`/`ruleId`/`list` from `webPricesForShop` through the source door.
- **ORACLE:** extend W10 to assert the sale line is RULE with a ruleId.

## Walked clean
- **Ingest X1:** locks ref→key→code (`:554–558`); the pre-read is repeated under the lock; a non-order P2002 is retried, an order P2002 means re-read and decide (`:699`). The web door P2002 rolls back the ShopOrder as well.
- **Accept race:** versioned UPDATE `:360–363`; the loser gets OrderRaced and rolls back with no sale. The PLATFORM sale is created in the same tx via `flatTx`, key `posorder-<id>`. Stock is cut once after commit (`:869`, `:1096`); consumeSaleInventory swallows errors, and retryPendingStockCuts covers a crash.
- **MANUAL default-ACCEPTED:** same `acceptInTx` + `afterIngest`. Auto-accept has no actor or shift. The PLATFORM source door never auto-accepts.
- **payOrder:**
  - The total is frozen.
  - PAID is set by `touch` before createSale in one tx.
  - SHIFT_REQUIRED is checked before the tx.
  - A lost race with the same key resolves to `duplicated` via the `paid` event; a different key resolves to ORDER_STATE_INVALID.
  - WEB/PLATFORM are refused.
  - The input cannot set PAID (`order-shared.ts:20`).
- **Cancel with a POS sale:** voids via `voidSaleByActor` with key `posorder-cancel-<id>`. PENDING_APPROVAL leaves the order untouched. A retry after INTERNAL sees `voidedWithKey` ⇒ duplicated. A race with the voided consumer resolves via the CANCELLED re-read (`:1004–1007`).
- **Outbox:** one row per (order,type) via key `pos.order.<type>#<id>`; PREPARING has none.
- **Shop side:**
  - `posOrderRejected` and `shop.cancelOrder` are idempotent.
  - Channel pause throws inside the ShopOrder tx ⇒ nothing persists.
  - `backfillWebPrices`: one tx per tenant with sorted row locks; the second run writes 0; conflicts are counted and not written; dual-write takes the same row lock.
- **Money computed twice:** storefront = snapshot = mirror = ECOM lines (unit × qty, the same `roundHalfUp` in the resolver). The ECOM sale never carries `itemId`, so there is no double stock cut against `inventory.consume` (`shop/service.ts:330`).

## Owner notes
- **บัญชี (accounting):** P2.8 posts no JV of its own outside the outbox. Sale, commission and void JVs go through the `pos.sale.*` consumers. However, `afterSaleCommit → consumeSaleInventory → consumeBatch → postMovementGl` posts the COGS JV directly after commit and swallows errors (`inventory/service.ts:541–547`). The `count()+1` docNo race (O24) can therefore drop a COGS JV for PLATFORM-accept and payOrder sales, as it does at the register. This is not new, but P2.8 adds two more callers; keep O24/P2.9 as a blocker for go-live.
- **คลัง (inventory):** stock cut once per sale (POS) or per ShopOrder line (ECOM). H1/H2 can cut stock for orders that will never be handed over.
- **ร้านอาหาร/เว็บช็อป (restaurant / web shop):** decide that a cancel from POS cancels the unpaid web order (H2), and that the payment claim is refused once the kitchen has rejected or cancelled (H1). The storefront should show the customer that the order was rejected or cancelled.

---
## Controller rulings (account A, 10 Oct 06:1xZ) — fix round 3 before merge (H1/H2 Medium ⇒ mandatory; H3–H5 Low = small, taken too)
- **R2 OK** accepted; W9 gains the cancel-of-PAID-WEB assertion (count unchanged).
- **H1 fix**: payment mirror inside `confirmOrderPaid`'s own txs via the facade — `orders.webClaimInTx(tx, shopOrderId)` (PosOrder `FOR UPDATE`; REJECTED/CANCELLED ⇒ claim refused with a shop-side refusal code of the builder's choice, named in the notes; else PAID + version bump) and `orders.webSaleBoundInTx(tx, shopOrderId, saleId)` in the posSaleId tx; hunks in `shop/service.ts` inside `// POS P2.8 ▸ … ◂` + owner line. `onShopOrderPaid` becomes a no-op confirmer that never writes PAID onto a closed order or a VOIDED sale (log instead). **ORACLE-ADD W11** (3 parts as proposed), red-before.
- **H2 fix**: `"pos.order.cancelled": withAutomation(posOrderRejected)` (idempotent). **ORACLE-ADD W12**, red-before.
- **H3 fix (part)**: `handOver` refuses when the bound sale is VOIDED (`ORDER_STATE_INVALID`, own th/en message); the retry-event for the swallowed `onSaleVoided` extra → follow-up line (P2.11) + owner line. Oracle: extend an existing hand-over check or add W13 (withhold the extra ⇒ handOver refused) — builder's call, red-before if new.
- **H4 fix**: `sourceCancelledInTx` re-reads and retries inside the tx on OrderRaced (like `onShopOrderPaid`); extend W4 with the interleaved accept (assertion added, count unchanged, red-before).
- **H5 fix**: web door carries `priceSource`/`priceRuleId`/`listPriceSatang` from `webPricesForShop`; extend W10 to assert the explicit-WEB-rule sale line is RULE with `priceRuleId` (red-before).
- Count 57 → **59** (+W11, W12; +W13 if added ⇒ 60). Gates: p2.8 ×3 forced + unforced, `--no-db`, p2.1, p2.2, p1.3, p1.6, p1.8, p1.12, p1.16, shop, shop-refund, pos-account, account-cpa, fitness ±env, fitness-pos, typecheck.
- Owner lines (`POS-OWNER-PENDING.md`): บัญชี (O24 docNo race now has two more COGS callers — PLATFORM accept, payOrder; blocker before go-live) · เว็บช็อป (storefront should show rejected/cancelled; payment claim refused after POS reject/cancel) · ร้านอาหาร (POS cancel cancels the unpaid web order).
- Then R3 = same hunter re-verifies H1–H5 (read-only) → merge.

---
## R3 (hunter re-verify, 10 Oct 07:0xZ) — head 0d34fd6d (code c47c5727)
# P2.8 S — R3 re-verify of hunt H1–H5 (head 0d34fd6d · code c47c5727 · diff 1b84db06..c47c5727, 9 files)
**R3: OK.** No findings, two nits with no severity.
(1) **H1** — the claim is atomic.
- `shop/service.ts:256–268`: in one tx, the ShopOrder `updateMany PENDING→PAID` runs, then `orders.webClaimInTx` (`order.ts:844`). The PosOrder is locked `FOR UPDATE` at `:833–838`. REJECTED/CANCELLED (`:848`) throws `PosOrderClosedError`, which rolls the claim back, and returns `{ok:false, code:"POS_ORDER_CLOSED"}` at `:270`. This happens before createSale, `inventory.consume` and `shop.order.paid`, so nothing is posted.
- Otherwise the claim does `touch` to PAID with a version bump. A reject that read v1 earlier then loses its versioned UPDATE and gets ORDER_STATE_CHANGED with a PAID card. A reject that commits first makes the claim wait on the row lock, see REJECTED, and roll back.
- Lock order is ShopOrder→PosOrder in every path (claim, revert, bind, `shop.cancelOrder`), so there is no deadlock.
- `webSaleBoundInTx` runs in the posSaleId tx (`:321`).
- **Revert** (`:283–289` → `order.ts:866`):
  - It runs only when no `ecom-<id>` sale exists (`:309`).
  - It reverts the PosOrder only if the ShopOrder revert hit a row and the PosOrder is PAID with no `saleId`, so it is idempotent; a second call is a no-op.
  - Revert → reject is allowed again. That is correct: no money moved, ShopOrder is back to PENDING_PAYMENT, and the posOrderRejected consumer then cancels it.
  - Reject during the claim→revert window is refused (webPaid). That is the correct, conservative outcome.
- `onShopOrderPaid` (`:1362`) skips closed orders (`:1369`) and VOIDED sales, logging a warning in both cases. W11(c) proves PAID + `saleId` without the consumer.
- Markers: every shop hunk is inside `POS P2.8 ▸ … ◂`, and the catalog `:2969` hunk is marked. `order.ts` is a P2.8-owned file.
(2) **H2** `outbox-consumers.ts:738` `pos.order.cancelled` → `posOrderRejected`. It is idempotent: `shop.cancelOrder` acts on PENDING_PAYMENT only, and `sourceCancelledInTx` is a no-op on closed orders. SHOP- and SALE_VOIDED-sourced cancels are harmless no-ops.
(3) **H3** `order.ts:962–967`: when the bound sale is VOIDED, HANDED is refused with ORDER_STATE_INVALID (`orders.errors.saleVoided` th/en). The swallowed-retry gap is logged as follow-up P2.11 plus an owner line, as ruled.
- *Nit:* the sale read is outside the tx, so a void committing between that read and the transition can still slip through. The window is milliseconds and P2.11 is the real fix.
(4) **H4** `order.ts:815–828`: the retry loop runs inside the caller tx, is bounded at 5, and re-reads each time. OrderRaced ⇒ retry. OrderAbort (now closed) ⇒ `changed:false`. If all 5 attempts fail it throws, the shop tx rolls back, and the consumer retries. W4 shows the race now ends CANCELLED.
(5) **H5** metadata passes through without recomputing money:
- `catalog.ts:2969` → `webLineMeta` (`shop/service.ts:201`, `:370`) → parser (`order-shared.ts:292–327`, source door only, values validated) → `order.ts:785`.
- The sale line takes its price from `ShopOrderLine` (snapshot) and only its source fields from the mirror. `listPriceSatang` is stored only (`pos/service.ts:645`); there is no accounting use.
- W10 now asserts RULE + ruleId + 16000.
(6) **Oracle** (each in its own commit):
- Only D() descriptions and the W4 chk line changed; every other change is an addition. Nothing is removed or weakened.
- W11 (a)(b)(c), W12 and W13 assert what I proposed. W4 adds the accept-race case.
- Red-before is one combined pre-fix run (`p28-W*-redbefore.log` are identical copies): head 99b4a809, dirty=1 (oracle only), 55/60. Each of W4, W10, W11, W12 and W13 fails with the expected pre-fix symptom:
  - W11: `confirm ok:true` plus an ecom sale; reject OK; REJECTED UNPAID.
  - W12: PENDING_PAYMENT, ecom sale, stock 48→47.
  - W13: HANDED.
  - W10: CHANNEL/null.
  - W4: ACCEPTED.
- W9 green-before is acceptable. At 1b84db06, `cancelOrder` already refused PAID WEB orders at `order.ts:981` (`isPaidWeb` before the NEW rule), with the webPaid message the assertion matches.
(7) Owner lines (accounting O24, web shop H1/H2, restaurant H2, shop H3) and the P2.8U `saleVoided` addition are present. `register.ts`, `pos/service.ts`, `channel.ts`, chat and `pos-sale-contract.json` show an empty diff.
- Gates at c47c5727 (dirty=0): p2.8 60/60 ×3, no-db 9/9, all 19 gates exit 0 (`fix3-SUMMARY.txt`).
- *Nit:* `webOrderForUpdate` locks by `shopOrderId` without a tenant predicate and filters the tenant afterwards. This is harmless because cuid ids are unique.
**Merge verdict: MERGEABLE.**

Controller: accepted — **MERGEABLE**; nits (handOver sale read outside tx · webOrderForUpdate tenant filter after lock) → P2.11 lines.
