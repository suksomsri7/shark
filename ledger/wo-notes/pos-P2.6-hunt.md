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


---

## Re-check (account B, 14 Oct 13:3xZ) — head 2b781ea0 / code 7d5339c8

# P2.6 S HUNT RE-CHECK (money/stock) · tree c @ 2b781ea0 (code 7d5339c8) · read-only
**Verdict: FINDINGS.** 2 Medium (N1, N2) and 2 Low (N3, N4). The H3 and H6 fixes are clean. H4's fix swaps ghost tickets for lost tickets (N2). H5 is still open through the live P2.4 table-cancel path (N1). Paths: `kit.ts`=restaurant/kitchen.ts · `kds.ts`=pos/kds.ts · `leg.ts`=pos/catalog-legacy.ts · `cat.ts`=pos/catalog.ts · `ptb.ts`=restaurant/pos-tables.ts · `rord.ts`=restaurant/order.ts

| H | status | fix (file:line @7d5339c8) · input that still breaks it |
|---|---|---|
| H1 restore > taken | **closed** (P2.6 paths) | Consume returns `taken` (`leg.ts:232`). It is spread over items in creation order (`kit.ts` kitchenSetStockTakenInTx), and cancel restores only `stockTaken` (`kds.ts:634-635`). One residual is owner-lined (POS-OWNER-PENDING:133): legacy `cancelOrderItem` on a P2.6 round item still restores the full qty. |
| H2 deadlock counter↔MenuItem | **closed** for single-menu rounds | Counted MenuItems are locked sorted before the counter (`kit.ts:117-119`). See N3 for the multi-menu residual. |
| H3 stale allReady | **closed** | The round row is locked first in `kitchenMoveInTx` and `kitchenCancelInTx` (`kit.ts:280`, `kit.ts:336`). Order is round → items → PosOrder. Legacy advanceItem/maybeComplete are autocommit (no multi-lock tx), and P2.4 claim/unlink/cancel lock items only. No new cycle (K11). |
| H4 ghost heal | **closed, but over-corrected** (see N2) | `kds.ts:302-309` routing `updatedAt ≤ sale.createdAt` |
| H5 restore un-86s a mark | **partial** | Void restore and daily reset keep 86 (`leg.ts:261`, `leg.ts:198`). P2.4 table cancel and legacy setItemStock still clear it (N1). |
| H6 double flip | **closed** | MenuItem `FOR UPDATE` after PosProduct (`cat.ts:1029`). The race is kept as a guard. Residual: legacy `setMenuItemStock` without dailyStockQty still reads `was` unlocked. |
| H7 legacy advanceItem overwrite | **open, accepted** | Owner line 133 (pinned file). |

**N1 Medium · a KDS/MANUAL 86 is undone by a P2.4 table-mode cancel (a live register path) and by legacy writers. The mark stays.**
- `cancelTableItemInTx` (`ptb.ts:382-383`, from `pos/table.ts:473`) calls hot-path `restoreMenuStock`, which sets `isOutOfStock:false` unconditionally (`leg.ts:328-329`).
- Legacy `cancelOrderItem` and legacy `setItemStock({isOutOfStock:false})` do the same.

Input: the cook 86s pad thai (KDS mark, counter 5 or 0). A waiter cancels a NEW pad thai on table 3 in register table mode. Result: stock +1 and isOutOfStock false, so pad thai sells again on register, QR and web. `board.eightySix` still shows the KDS mark, and no flip event is emitted, so the channels keep their stale state.
Smallest fix: in `cancelTableItemInTx` (P2.4 file, marked hunk) re-apply `isOutOfStock:true` after the restore when `heldBy86Mark` is true (export it). Have `setMenuItemStock(isOutOfStock:false)` delete the mark, or refuse while a mark exists.
ORACLE-ADD A12: KDS 86, then table-mode cancel of a NEW item → availabilityFor false.

**N2 Medium · the heal guard is blind for any dish touched after the sale, so a paid line can silently never reach the kitchen.** The guard is `m."updatedAt" <= s."createdAt"` and `p."updatedAt" <= s."createdAt"` (`kds.ts:304`, `kds.ts:309`).
- `MenuItem.updatedAt` is `@updatedAt`, so it is bumped by every later floor consume (`leg.ts:233`), every legacy `consumeMenuStock` updateMany, `setAvailability`, and legacy stock/86 edits.
- `PosProduct.updatedAt` is bumped by the availability SQL (`cat.ts` `"updatedAt" = now()`), price and name edits, and sync.

Input: sale S of kaprao, and `ticketForSale` returns ERROR (a transient DB error, a pool timeout, a residual 40P01 from N3, or a crash after createSale commits). Any later kaprao sale or table round then bumps `MenuItem.updatedAt` past `S.createdAt`, so heal never selects S. The customer has paid and no ticket exists. Nothing logs it except the one `console.error`.
Smallest fix: judge routing time, not the row's write time. Either:
- have `ticketForSale` record an evaluated-negative marker (e.g. `PosKitchenSkip{saleId, reason NO_STATIONS|NO_KITCHEN_LINES}`, written by pos) and heal = no round AND no skip row (drop the `updatedAt` terms), or
- add `stationSetAt` columns, written only when stationId changes.

ORACLE-ADD K13: make ticketForSale fail for sale S (delete its round as in K9), sell the same counted dish once more, then read the board → S gets 1 round.

**N3 Low · multi-menu lock-order residual of H2.** Ours locks MenuItems sorted by id (`kit.ts:119`). Legacy `writeOrderTx` locks them in cart order (`rord.ts:225-229`).
Input: a ticket with tracked [A,B] while a table round sends [B,A]. Legacy holds B, ours holds A and waits for B, legacy waits for A: 40P01. Losing the ticket side feeds N2. K10 only exercises one menu.
Fix: sort `byItem` in `writeOrderTx`. Hot-path order is frozen by S2.42, so this needs an owner line or controller ruling. Or accept it once N2 is fixed, since heal then recovers.

**N4 Low · recall re-opens cooking for a voided bill.** After a void, the SERVED items remain and the round is COMPLETED. `kdsRecall` (from SERVED to COOKING, `kds.ts` moveTicket, with no check of the round's cancel cause) puts the voided sale's dish back on the board. The kitchen cooks an unpaid line. Fix: refuse recall when any item of the round has `cancelReason = KDS_CANCEL_REASON_SALE/ORDER` (TICKET_NOT_FOUND).

## Walked clean
- **stockTaken null** means 0 restored (`kds.ts:635`): this covers untracked menus and pre-column rounds (QC only; P2.6 has never been in prod). Legacy table rounds are never on the posSaleId/posOrderId cancel path.
- **No double restore:**
  - Cancel-then-void removes the line from the NEW/COOKING/READY set, so it is not restored again.
  - Order-cancel plus PLATFORM-sale void: the sale has no posSaleId round, so there is no second restore.
  - Replays ×2 cancel nothing.
- **F1 lock vs setAvailability:** PosProduct → MenuItem against MenuItem → counter has no cycle. `emitMenuFlip` reads PosProduct without a lock.
- **F4 NO_STATIONS** returns before the sale read. A unit without stations correctly gets no ticket.
- **No ticket without payment or accept:** a register round needs PAID under FOR SHARE, and an online round is created only in the accept xid. Money on items stays 0 and saleId null, and slips carry no money.


---

## P2.6U merge-time hunt (account B, 14 Oct 16:3xZ) — head f67790a7

# P2.6U MERGE-TIME HUNT (money / stock / order state) · tree c · read-only
Head `wip/pos-p2.6u` f67790a7. The named code head `1df0a6c2` does not exist in this repo, so I hunted the last code commit, **addc79cd** (= f67790a7 minus ledger). Base: 671e6fd2. Scope: `kds.ts`, `kds-actions.ts`, `kds-shared.ts`, `catalog.ts`, `catalog-legacy.ts`, `restaurant/{kitchen,index}.ts`, plus the PayDone print path.

**Verdict: FINDINGS (Low only; not merge-blocking).** No Medium or High finding. The questions asked are walked below.

**N1 Low: a sale whose round is created later by heal never gets an after-sale kitchen slip.**
- Where: `PayDone.tsx:93-104` asks `kdsQueueNoAction` at most 3 times, 1 s apart. If no round exists yet, it stops and never prints. `healMissingTickets` (`kds.ts`, board read) later creates the round but prints nothing.
- Input: a unit whose kitchen runs on printers only (17B after-sale, no KDS screen) and a `ticketForSale` that returns ERROR. Heal creates the round on the next board poll, if any, but no slip ever prints. The customer has paid and the kitchen never sees the order.
- Smallest fix: if no queue number comes back after the 3 polls, show a cashier warning ("ใบครัวไม่ออก — พิมพ์จากจอครัว"). Owner line: print-only kitchens must keep a KDS or expo tab open so heal runs.

**N2 Low: one routing re-link can still hide a failed ticket (the K13 class, narrow).**
- Where: `catalog.ts:1485` stamps `stationSetAt` whenever an un-stationed variant gets a new parent. Heal then needs both the row stamp and the parent stamp to be ≤ the sale time (`kds.ts:319`).
- Input: sale S of variant V (parent A, station X), and `ticketForSale` fails. V is then re-linked to parent B, which also routes to station X. The kitchen route never changed, but the stamp moves past S, so heal skips S. Lost ticket.
- Smallest fix: stamp only when the effective station changes (`coalesce(row.stationId, oldParent.stationId) !== coalesce(row.stationId, newParent.stationId)`). This is the same rule as `catalog.ts:1704` and `catalog-legacy.ts:83`.
- K12b passes as written (no stale ghost tickets). Stamps are written only on a station change (`catalog.ts:1695/1704`, `catalog-legacy.ts:83`) and never by sales, so N2 from the previous re-check (blind heal) stays closed.

## Questions asked, walked clean
- **Leaks across unit or tenant.** Every new reader takes `tenantId` from the session (`kds-actions.ts` sessionScope). `unitId` goes through `canAccessUnit` and the per-need keys.
  - `roundOfSale`/`queueNoForSale` filter tenantId + unitId + posSaleId and return only dailyNo and the round id.
  - `kitchenStateForUnit` reads one unit's setting and backlog.
  - `kdsKitchenProducts` (kscope `availability`) returns MENU rows only through this unit's MenuItems on this unit's stations. Non-MENU rows must have `unitId` null or this unit, a station in this unit's stations, and the matching systemId. Availability and marks are unit-scoped.
  - `kdsStations` returns names only.
  - An OWNER passing another tenant's unitId gets empty or default results, because tenantId is fixed from the session.
- **Recall lock order.** Recall locks in this order: round FOR NO KEY UPDATE (`kitchen.ts:304`), then PosSale FOR SHARE (register rounds only), then a plain PosOrder read (online rounds only), then items, then PosOrder FOR UPDATE. Online rounds never take the PosSale lock. None of the other writers can close a cycle:
  - The void consumer and order-cancel consumer (`kitchenCancelInTx`) lock round → items → MenuItem and never PosSale or PosOrder.
  - `voidSale`, refund and receipt locks take only PosSale.
  - `cancelOrder` locks PosOrder → PosSale, but not on a round that is posSaleId-linked.
  - `ticketForSale` never locks an existing round.
  - Legacy `advanceItem`/`recallItem` run as single autocommit statements.
  - P2.4 claim/unlink/cancel lock session/items, never the round.

  Recall against a void, in either order, ends at TICKET_VOIDED (K14b). The H7 legacy `recallItem` stays owner-lined.
- **After-sale print path.** `kitchenSlipPayloadAction` uses kscope `read` and `ticketOf`, filtered by unit. It reads only and writes no rows. A round that is all CANCELLED gives TICKET_NOT_FOUND, so nothing prints. Slips carry no money keys. Printing once per sale is guarded by a module Set (client side, not an integrity control).
- **Cook-only stock or availability writes.** None are new. `setProductStationAction` needs `pos.product.manage` (re-checked in `updateProduct`), and the new readers write nothing. Pre-existing S note: `setAvailability({available:true, resetCounter:true})` lets a COOK refill a sold-out counter to `dailyStockQty`. Owner may want that behind `restaurant.kitchen.pause` or `pos.product.manage`.
- **MenuItem FOR UPDATE before `heldBy86Mark`** (`catalog-legacy.ts:200`, `catalog-legacy.ts:353`). It takes the same row the update already locked, so the lock order is unchanged (RestaurantOrderItem → MenuItem; PosProduct → MenuItem in setAvailability). Under the lock, the mark read is serialized with setAvailability's mark write (A14).
- **TICKET_VOIDED.** It fires when `status ≠ PAID`, so a full refund refuses recall. A partial refund stays PAID and recall is allowed, which is consistent with V2.
