# P2.6 S HUNT: stock, order state and tickets · tree c @ 2e6328db (code e580cf6b) · read-only
**Verdict: FINDINGS.** 5 Medium (H1–H5) and 2 Low (H6–H7). Under the quality-first ruling, a fix round is needed before merge. Paths: `kds.ts`=src/lib/modules/pos/kds.ts · `kit.ts`=src/lib/modules/restaurant/kitchen.ts · `leg.ts`=pos/catalog-legacy.ts · `cat.ts`=pos/catalog.ts · `rord.ts`=restaurant/order.ts · `ord.ts`=pos/order.ts

**H1 Medium · the floor-at-0 consume forgets how much it clipped, but the restore gives back the full qty (phantom stock).** Consume `leg.ts:229` `left = max(stock-qty,0)`. Restore `leg.ts:250` `stock + qty`. The restore qty comes from the item rows (`kds.ts:621`).
Interleaving: croissant stockQty 1. Register sale ×3 → ticketForSale consumes 1 (stock 0, auto-86). The sale is voided while the item is still NEW → onSaleVoidedKitchen restores +3.
End state: stockQty 3 and isOutOfStock false, but only 1 was ever taken. A STOCK flip available:true is fanned out to the channels, so online/QR/table can oversell 2. Two tickets each qty 2 on stock 2 (2→0, then 0→0) plus a void of the second gives the same result: +2 phantom. Legacy `cancelOrderItem` on a P2.6 round item (`rord.ts` restoreMenuStock) inflates the same way.
Fix: store the qty actually taken per item (e.g. a `stockTaken` column, or return `{menuItemId, taken}` and keep it on the round item), and restore only that.
ORACLE-ADD **V3**: stock 1, sale ×3, void while NEW, drain → stockQty 1 (red today: 3).

**H2 Medium · deadlock between a P2.6 round and a P2.4 table round / legacy createOrder (opposite lock order).** Legacy `writeOrderTx`: MenuItem row lock first (`rord.ts:227-229` conditional decrement), then the RestaurantDailyCounter (`rord.ts:241`). New code: the counter upsert (`kit.ts:117-121`), then MenuItem `FOR UPDATE` (`kds.ts:262`/`kds.ts:338` → `leg.ts:226`). The new FOR UPDATE runs even when stockQty is null.
Interleaving: T1 = registerSendTableRound (`table.ts:357` → createOrderInTx) locks MenuItem M (tracked). T2 = ticketForSale or acceptInTx in the same unit locks counter(U, today), then waits for M. T1 then waits for the counter. Result: 40P01.
End state: if T2 is acceptInTx (auto-accept inside ingest, or the web-shop gate `ingestInTx`), the whole accept/ingest rolls back and the order is not accepted or ingested. If T1 loses, the table round send fails. If ticketForSale loses, it gets reason ERROR and heal recovers it.
Fix: in `createKitchenRoundInTx`, call `consumeMenuStockFloorInTx` before `restaurantDailyCounter.upsert`. Restaurant must not write MenuItem, so return the menu lines first via a two-phase API, or have pos/kds lock the MenuItems sorted before calling. Lock order: MenuItem → counter, the same as legacy.
ORACLE-ADD **K10**: run 10 rounds of `Promise.all([registerSendTableRound(M), ticketForSale(sale with M)])` → 0 rejections and 20 rounds.

**H3 Medium · concurrent "last" moves on one online round leave the PosOrder stuck in PREPARING and pos.order.ready is never emitted.** `onlineProgressInTx` reads the items (`kds.ts:374-379`) BEFORE `kitchenProgressInTx` takes the PosOrder `FOR UPDATE` (`ord.ts:392`). The two updateManys touch different item rows (`kit.ts:284`), so nothing serializes them.
Interleaving: stations A and B are the last two COOKING. T1 kdsTicketDone(A) and T2 kdsTicketDone(B) both update. T1 reads (B still COOKING) → allReady false. T2 reads (A still COOKING, T1 uncommitted) → allReady false. They then serialize on the PosOrder lock, each holding a stale false. Two kdsLineDone calls on lines of one station hit the same race.
End state: every item READY, but the PosOrder stays PREPARING. There is no `pos.order.ready` and the 09 card does not move until someone taps served/ready by hand. `settleRoundStatus` (`kit.ts:293-302`) has the same race on two concurrent kdsServed, so a round with every item SERVED stays CONFIRMED.
Fix: lock the round (`SELECT … FROM "RestaurantOrder" WHERE id=… FOR UPDATE`) at the top of `kitchenMoveInTx`, and also in `kitchenCancelInTx` BEFORE its item `FOR UPDATE` (`kit.ts:324`), so the order is round → items and the fix adds no new deadlock. All reads after the lock are then fresh.
ORACLE-ADD **O5**: two-station LINEMAN round, `Promise.all` kdsTicketDone on A and B → PosOrder READY and 1 pos.order.ready (loop ×5).

**H4 Medium · heal creates late tickets (and cuts counters) for already-served sales when routing changes.** The heal query (`kds.ts:287-301`) asks "routable NOW, no round, PAID, < 12 h". It cannot tell a sale that failed apart from one that had no kitchen lines when it was sold (NO_STATIONS / NO_KITCHEN_LINES, `kit.ts:99,115`).
Interleaving: a café sells 150 lattes from 08:00 with no station on them. At 14:00 the owner sets `updateProduct({stationId: bar})` (`cat.ts` stationId hunk), or creates the unit's first KdsStation. The next kdsBoard poll heals 20 of these sales, and every 6 s poll heals 20 more until all 12 h are ticketed.
End state: about 150 ghost latte tickets on the bar board. For MENU lines (first station added or un-archived), `consumeMenuStockFloorInTx` also cuts the counters for food that was already sold. That causes false auto-86 and sends STOCK events to the channels.
Fix: heal only sales whose kitchen attempt failed. Record a marker on ERROR, or require `s.createdAt >= now() - few min` together with a ticketForSale attempt log. At minimum, require `s.createdAt > KdsStation.createdAt` and the product's routing time.
ORACLE-ADD **K11**: sell a non-routed product, then set its stationId, then read the board → 0 rounds and an unchanged counter.

**H5 Medium · a kitchen 86 taken while the counter is at 0 is undone by a void restore. The mark stays, so the board says 86 while the item sells.** `setAvailability(false)` on a MENU row already auto-86'd writes nothing to MenuItem (`cat.ts:1032`) and only upserts the KDS mark. `restoreMenuStockFloorInTx` clears isOutOfStock whenever `was.stockQty <= 0` (`leg.ts:250`) and never looks at `PosAvailabilityMark`.
Interleaving: the counter hits 0 (STOCK 86). The cook taps 86 (KDS, out of the ingredient). A NEW-ticket sale is voided → restore stock +n, isOutOfStock false, event available:true.
End state: the menu sells on the register, QR and channels, while `board.eightySix` still lists the KDS mark (`kds.ts:457-462`). The legacy daily reset (`leg.ts` resetMenuItemDailyStock) leaves the same stale mark. That contradicts builder notes deviation (c).
Fix: in restore (and in the reset), keep isOutOfStock true when a mark exists for (unit, posProductId). Or have setAvailability(false) on a counter-0 row set an explicit flag that only `setAvailability(true)` clears.
ORACLE-ADD **A10**: counter 0, 86 KDS, then void a NEW ticket → availabilityFor false and the mark still exists.

**H6 Low · two flip events for one flip.** `setAvailability` locks PosProduct (`cat.ts:1023`) but reads MenuItem without a lock (`cat.ts:1028`). The ticket consume and restore lock only MenuItem.
Interleaving: T1 86 reads stock 1 (before=true). T2 ticket consumes 1→0 and emits STOCK false. T1 then writes isOutOfStock and emits KDS false.
End state: 2 events and 2 adapter calls for one flip (a no-op in P2, a double push in P3). Legacy `setItemStock` without dailyStockQty (no PosProduct lock) racing setAvailability gives the same result.
Fix: `SELECT … "MenuItem" … FOR UPDATE` before the read, keeping the documented order PosProduct → MenuItem.
ORACLE-ADD **A11**: `Promise.all(setAvailability false, ticketForSale for the last unit)` → exactly 1 outbox row.

**H7 Low · legacy writers on P2.6 rounds.** Legacy `advanceItem` reads, then does an unconditional `update` by id (`restaurant/kds.ts:44-58`). If the void consumer cancels the item in between (`kit.ts:329`), the item is overwritten CANCELLED→COOKING/READY. The ticket of a voided sale comes back, and its counter has already been restored (double use).
Separately, legacy advance on an online round never calls `kitchenProgressInTx`, so the PosOrder does not track the legacy board.
Fix: legacy file pinned (L1/ST4), so record it as an owner line for the P2.6U legacy banner. Alternatively make the legacy write `updateMany … WHERE kdsStatus = it.kdsStatus` in a sanctioned edit.

## Walked clean
- ticketForSale ×N, heal ×10 and the P2002 retry: the advisory lock (`kit.ts:94`) plus the partial unique give exactly 1 round. The PosSale `FOR SHARE` (`kds.ts:245`) conflicts with voidSale's `updateMany` status flip, so whichever commits first decides and there is no orphan ticket. VOIDED is never healed. Sales with a sourceId (table/PLATFORM) are skipped, so there is no double counter cut.
- The accept round runs in the same xid on every ACCEPTED path (`ord.ts:510`). Accepting again or replaying the ingest key hits `existingOrder` first, so there is no second round. The cap/pause check runs after the replay lookup in both ingest gates.
- autoAccept cap: ingests serialize on the `posorder-code:<unit>` advisory lock, so the backlog read is fresh and the cap is not overshot by concurrent ingests.
- kitchenProgressInTx vs 09 markPreparing/markReady/handOver: `FOR UPDATE` plus a version CAS give one winner and one event each. A closed order is a no-op, and recall never goes backwards.
- KDS moves vs each other: the conditional updateMany makes each move take effect once (B5). Cancel `FOR UPDATE` re-checks the row, so wasNew reflects the state after a concurrent kdsStart (NEW-only restore is correct). A COOKING item at void keeps its counter cut, which is intentional per R12.
- Replay ×2 of pos.sale.voided, pos.order.cancelled and pos.order.rejected: no rows are left to cancel, so nothing is restored again. `bothMain` runs both steps and retries both, and both are idempotent.
- setAvailability 10-way race: the PosProduct lock gives 1 event and 1 mark (A9). The adapter fan-out writes no rows and catches errors per channel, so there is no retry loop (and no retry in P3 either, see notes).
- Money: round items have price 0 and saleId null. KdsTicket and KitchenSlip carry no money keys. HF-TX: no new `$transaction` nesting, ticketForSale runs after commit on a PrismaClient (RegDb), and there is no createSale in kds*/kitchen*.
- The `kdsSetAutoAcceptMax` writer is restaurant `*InTx` (upsert one column) and is audited after commit.

## Owner notes
- ร้านอาหาร: an order held at NEW by pause or the backlog cap is never auto-accepted after unpause or when the backlog drains. Staff must accept it on 09, and there is no sweeper. Consider a "held by kitchen" badge or sweeper in P2.6U.
- คลัง: H1 and H5 change sellable counts that online channels read. Fix them before channels go live.
- P2.7: QR and legacy hot-path auto-86 still emit no event. H2's lock order must be kept when QR moves off the hot path. Adapter errors are swallowed with no retry, so P3 needs a per-channel retry/outbox.
