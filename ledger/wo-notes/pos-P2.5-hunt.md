# P2.5 S HUNT (money / stock / table-kitchen state) · tree c @ 6ed2d5ce (code 86392e7d) · read-only
**Verdict: FINDINGS.** 2 Medium (N1, N2) and 2 Low (N3, N4). Paths: `ts.ts`=pos/table-split.ts · `tbl.ts`=pos/table.ts · `ptb.ts`=restaurant/pos-tables.ts · `reg.ts`=pos/register.ts · `rord.ts`=restaurant/order.ts

**N1 Medium · voiding a part of a DONE plan while a newer plan is OPEN wedges the void consumer, and the voided money stays "paid" on the items.**
- Where: `releaseSplitPartInTx` reopens the plan DONE→OPEN (`ts.ts:551`). The partial unique index `PosTableSplit_session_open_key (sessionId) WHERE status='OPEN'` forbids a second OPEN plan, and nothing checks for one first.
- Input: plan 1 (ITEM 2) is paid in full (DONE). A new round is sent and plan 2 (EQUAL 2) is created for the outside items; `openSplitOfSession` only looks for OPEN plans, so this is allowed. The bill of plan 1 part 2 is then voided from the bills drawer.
- What happens: `tableSaleVoided` (`tbl.ts:640-650`) unlinks the items, then the plan update fails with P2002. The whole transaction rolls back and the error is rethrown, so `pos.sale.voided` retries forever.
- End state: the sale is VOIDED and the cash refunded, but part 2's items still carry the voided saleId. The table treats them as paid, and the last part payment can close the session. Lost revenue equals the part total.
- Smallest fix: the void door (`voidSaleByActor` table pre-check) refuses when the part's plan is DONE and another plan is OPEN (`TABLE_SPLIT_OPEN`). The consumer catches the conflict and cancels the newer plan when it has no PAID part; otherwise it writes an audit row and never loops.
- ORACLE-ADD X5: run this sequence. Expect the void refused (or the newer plan cancelled), part 2's items unlinked, and the event DONE.

**N2 Medium · the legacy restaurant checkout and cancel ignore an OPEN plan: shares get charged twice, or the table gets stuck.**
- Where: `checkout` (`rord.ts:562`, reachable from `/restaurant/checkout/[sessionId]` through `checkoutAction`, `src/lib/actions/restaurant.ts:393`) bills every unpaid item at full price. `cancelOrderItem` (`rord.ts:452`, `cancelOrderItemAction` :337) cancels any NEW item. Neither checks `openSplitOfSession` or `itemInOpenSplit`; only the POS doors do (`reg.ts:1706`, `tbl.ts:484`).
- Input (double charge): EQUAL 3 plan on 1,364.00. Part 1 is paid 454.67; shared items stay unlinked until every holder pays (`ts.ts:538`). Staff then bills the whole table on the legacy page. The guests pay 1,364.00 + service a second time, so part 1's 454.67 is collected twice. Parts 2 and 3 then fail the strict check (`TABLE_ITEMS_CHANGED`). The plan is LOCKED (it has a PAID part), so it can be neither replaced nor cancelled, and stays OPEN forever.
- Input (stuck table): a legacy cancel of one plan item after a part is paid. The remaining parts become unpayable, the plan cannot be replaced or cancelled, and whole-table pay returns `TABLE_SPLIT_OPEN`. The only way out is to void the paid parts.
- Smallest fix: guard in the actions layer (module bodies are pinned). `checkoutAction`/`checkoutPromptPayAction` refuse when `openSplitOfSession` is set, and `cancelOrderItemAction` refuses when `itemInOpenSplit` is true. Add an owner line for the legacy page.
- ORACLE-ADD P7: with part 1 paid, legacy `checkout` returns ok:false, no PosSale is created, and the plan is unchanged.

**N3 Low · in EXCLUDED-VAT shops the plan totals have no VAT, so "เหลือ ฿…" understates what the cashier will collect.**
- Where: `allocateTableSplit` gets `vatRateBp` only in INCLUDED mode (`ts.ts:315`). Part totals, `remainingSatang` (`ts.ts:168`) and pre-bill part figures come from the plan, while the part sale adds VAT on top (`reg.ts:1667-1668`).
- Input: a 7% EXCLUDED shop with a 2-part plan of 1,000.00. The cards show 500.00 each, the pay dialog charges 535.00, and the table card says "เหลือ ฿1,000".
- Fix: carry `t_i + vat_i` (EXCLUDED) in `planView`/`splitSummariesOf`. No EXCLUDED fixture exists in the oracle.

**N4 Low · a DONE plan left on a merged-away session reopens as an orphan after a void.**
- Where: `mergeTableSessionsInTx` repoints orders but not `PosTableSplit.sessionId` (`ptb.ts:650-653`).
- Input: table B's plan is DONE, B is merged into A, then a part bill of B's plan is voided.
- End state: the plan is OPEN on a MERGED session, so the part is unpayable (`TABLE_SESSION_CLOSED`). Its items (now under A) are unlinked and payable whole-table on A. `itemInOpenSplit` still refuses to cancel those items forever (`tbl.ts:484`), and the plan never closes.
- Fix: repoint DONE plans on merge, or have `itemInOpenSplit` ignore plans whose session is not OPEN.

## Walked clean
- **Σ parts (INCLUDED/NONE):** `Σt = B − D + S` exactly. Each part sale gets subtotal `b_i`, a fixed `d_i` (negative EQUAL service moved into the discount) and service `s_i`. Whole lines are re-checked against the item snapshot (`reg.ts:1790`). The per-part VAT rounding difference is owner-lined.
- **Stock:** shares cut once, on the stock-owner part only (`reg.ts:1479-1486`). Voiding the owner part restores its cut once, voiding a non-owner part restores nothing, re-paying cuts again, and voiding both gives one restore. Table rounds use the legacy counter cut, not P2.6 `stockTaken`, and merge does not touch counters.
- **No lost or duplicate payment:** two keys on one part serialize on the item locks, and the loser gets `TABLE_SPLIT_PART_PAID` or `TABLE_ITEMS_CHANGED` (C2). Replace or cancel while a part is PAID returns LOCKED. A replace in flight gives `TABLE_SPLIT_NOT_FOUND` (new part ids) or `VERSION_CHANGED`. Plan create against whole-table pay: the first to claim the items wins (C4).
- **Lock order:** part pay is items → part → session → plan. Void is session → advisory → paid items only, which never overlap the unpaid rows a payment claims. Move and merge take session → advisory and no item rows. No cycle.
- **Move/merge races:** merge with an OPEN plan returns `TABLE_SPLIT_OPEN`, checked under the session locks. A plan create that loses the race sees MERGED and returns CLOSED. The KDS label follows the session (P2.6); printed tickets keep the old name (owner).
- **Pre-bill:** reads only, one audit row per call. The part comes from `splitPartForPay` (unit-scoped) and the lines from the current session or plan. A PAID part returns `TABLE_SPLIT_PART_PAID`.
- **Authorization:** plan, cancel and part writes need `pos.sale.create`. Detail and pre-bill need sell or read. Move and merge need `restaurant.session.move|merge`. A plan or part id from another unit or tenant returns NOT_FOUND.
- **Not hunted:** gift-card part pay. P2.9 is not merged; re-hunt the refund path after the merge.
