# POS P2.6 S — builder notes (KDS server half)

Builder · account B · 10 Oct 2026 · tree `/root/projects/shark-pos-c` · branch `wip/pos-p2.6` from `session/pos` **ca5a07b4**.
Binding: `pos-brief-P2.6.md` §9 + §10 · `wo-notes/pos-P2.6-oracle.md` (names table rows 1–22) · `scripts/qc-pos-p2.6.mts` (not edited) · LANE-RULES.

## Step 0 — red-before (done · commit 27cb28fa)
`bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p2.6.mts` (CI unset)
→ **7/51** (ST4 L1 L2 L3 L4 Z1 Z2) · PAR 5/5 · **SKIP-until-export 0** · residue 0 · saved `ledger/wo-notes/P2.6-red.txt`. Matches the expected result, so there is no oracle drift.

## Step 1 — migration + schema + registrations (WIP)
- `prisma/migrations/20261208100000_pos_p26_kds/migration.sql` = the oracle sample statements exactly (lock_timeout 3s · 6 RO columns · 2 partial uniques · autoAcceptMaxOpen · DO-block enum · PosAvailabilityMark table + 2 indexes · RESET).
- Schema: `restaurant.prisma` RestaurantOrder +6 (`posSaleId posOrderId channelCode channelName externalRef String?` · `targetMinutes Int?`) · RestaurantSetting `autoAcceptMaxOpen Int?` · `pos.prisma` enum `PosAvailabilitySource` + model `PosAvailabilityMark` (no @relation, `@@unique([unitId, productId])`, `@@index([tenantId, unitId])`).
- `core/scope.ts` `PosAvailabilityMark: sys()` · `scripts/pos-qc-env.mts` `POS_MODELS.posAvailabilityMark`.
- `pnpm exec prisma validate` ✓ · `pnpm exec prisma generate` ✓ (tree c node_modules).
- **QC4 deploy** `bash scripts/iso.sh bash scripts/qc4.sh pnpm exec prisma migrate deploy` → host ep-frosty-lab · "Applying migration `20261208100000_pos_p26_kds` … All migrations have been successfully applied." (**APPLIED on QC4**).
- Prod `RestaurantOrder` row count: not available to the builder; the controller supplies it (§9 ruling 14).

## ▶️ RESUMED 14 Oct 2026 (account B · controller B) — from ffaee746 (step 1 WIP) · scratch `/tmp/claude-0/-root/5169ed6b-3dd4-5e42-a1eb-90ec4124521e/scratchpad/p26/`
- Tree clean at ffaee746 · `prisma migrate status` up to date (controller) · client already has `posAvailabilityMark` (no regenerate needed).
- Step 1 remainder: `src/lib/modules/pos/kds-shared.ts` (pure · row 11 + DTO types of the P2.6U contract) → `--no-db`: ST1 T1 T2 T3 green (8/13; remaining reds = later steps).

## Design decisions (carried from the pause + refined on resume)
  - restaurant `createKitchenRoundInTx`: advisory lock per sale/order · existing round = `created:false` · non-archived stations only · MENU routing via `MenuItem.posProductId`, non-MENU via `PosProduct.stationId` (or the parent's) · round items carry **price 0** and `saleId` null (money untouched) · floor-at-0 consume through a new catalog-legacy function that emits a STOCK flip event plus a STOCK mark.
  - KDS moves: conditional `updateMany … WHERE kdsStatus IN (…)` in restaurant `*InTx` functions.
  - `kitchenProgressInTx` goes in `pos/order.ts`. `kds.ts` lazy-imports `./order`, and `order.ts` imports `./kds` statically. The p2.8 ST3 check bans any restaurant import in `order*` files, so the restaurant calls go through `kds.ts`.
  - Kitchen pause and backlog use the `pauseRefuses` adapters (WEB/CHAT/API).
  - `setAvailability` writes MenuItem directly in `catalog.ts` (F15.1 writer). Routing it through catalog-legacy would create an import cycle; the MENU write still stays inside the catalog writer pair.
  - **Refined on resume:** (a) the new restaurant writers live in a new file `restaurant/kitchen.ts` (re-exported by `restaurant/index.ts` in a `// POS P2.6 ▸ … ◂` block) so the pinned `restaurant/order.ts`/`kds.ts` (L1 sigs · ST4 hot-path bodies) stay byte-identical; (b) the restaurant writer does **not** touch MenuItem — the floor-at-0 MENU counter consume/restore is a new catalog-legacy function called by `pos/kds.ts` in the same tx (F15.1 writer pair · restaurant module stays free of catalog writes); (c) **no STOCK mark row** — the board's `eightySix` lists marks (KDS/MANUAL, with who/when) plus MENU rows sold out by counter/legacy 86 (source STOCK, `at` = MenuItem.updatedAt), so a counter release never leaves a stale mark; (d) legacy `setItemStock`/`resetDailyStock` flips emit events only (no mark) — the mark is the `setAvailability` record.

## Per-step results
- step 1 ✅ (this commit) — migration/schema/scope/qc-env (ffaee746) + kds-shared.ts.
- step 2 ✅ — `restaurant/kitchen.ts` (new file · client param, no raw prisma import → F5.1 unchanged): `createKitchenRoundInTx` (advisory lock per sale/order + partial unique · EXISTS/NO_STATIONS/NO_KITCHEN_LINES · price 0 · saleId null · option snapshots · returns MENU lines for the counter) · `kitchenMoveInTx` (conditional `updateMany … kdsStatus IN (from)` · recall clears readyAt/servedAt · round COMPLETED/CONFIRMED/CANCELLED settle) · `kitchenRushInTx` · `kitchenCancelInTx` (FOR UPDATE · NEW/COOKING/READY only · returns wasNew) · `kitchenSetAutoAcceptMaxInTx` · readers (stations · setting · rounds of the day · round · item · rounds of PosOrders · sold-out menus). Re-exported in `restaurant/index.ts` `// POS P2.6 ▸ … ◂`. Legacy `order.ts`/`kds.ts` untouched. Scoped tsc clean.
- step 3 ✅ 56080ce4 — `pos/kds.ts`: system `ticketForSale` (PAID · POS · `sourceId` null · after commit · never throws; P2002 retry) · `healMissingTickets` (raw read: PAID POS sales of last 12 h, no round, ≥1 routable line; ≤ 20; also run by `kdsBoard`) · `kitchenBacklog` · user `kdsStart/kdsLineDone/kdsTicketDone/kdsServed/kdsRecall/kdsRush/kdsBoard/kitchenSlipPayload/kitchenProgress/kdsSetAutoAcceptMax` · `roundForOrderInTx` / `autoAcceptBlockedInTx` / `kitchenPausedForUnit` (order.ts) · consumers `onSaleVoidedKitchen` / `onOrderClosedKitchen` / `onAvailabilityEvent`. `register.ts`: two `ticketForSale(` calls each under a `// POS P2.6 ▸` line (regCreate after createSale; intents path after `afterSaleCommitted`) — none on the table path · `regViews` adds `soldOutMark` only on UNAVAILABLE rows that have a mark (CD 8).
- step 4 ✅ ecaef864 — `catalog.ts`: `setAvailability(ctx, actor, input)` (row lock → MENU = MenuItem of the unit · else `unavailableUnitIds` same SQL as updateProduct · mark upsert/delete · audit + `emitAvailabilityFlipInTx` only on effective flip) · `availabilityFor` · `menuAvailableNow` · `canSetAvailability` · `updateProduct({stationId})` (non-MENU only · station of the tenant, non-archived, same unit as the row, unit reachable by the actor). Both on the `catalog` facade. `catalog-legacy.ts`: `consumeMenuStockFloorInTx` / `restoreMenuStockFloorInTx` (FOR UPDATE · floor 0 · auto-86 · STOCK flip events) + MANUAL flip events in `setMenuItemStock` / `resetMenuItemDailyStock` (hot-path `consumeMenuStock/markMenuItemOutOfStock/restoreMenuStock` untouched). `outbox-consumers.ts`: `"pos.product.availability"` + kitchen hunks on `pos.sale.voided` (third main step) / `pos.order.cancelled` / `pos.order.rejected` (`bothMain` = both main, both retried). `kds-actions.ts` ("use server", session → assertCan first layer (F6.1) → kds/catalog). `automation/labels.ts` label for the new event.
- step 5 ✅ ff3ca860 — `pos/order.ts`: `acceptInTx` → `roundForOrderInTx(tx, after, ch)` (every ACCEPTED path, same xid) · `kitchenProgressInTx` (FOR UPDATE · ACCEPTED→PREPARING on first start · →READY via PREPARING when all READY/SERVED · actor null · payload source KDS) on `orders` facade · auto-accept `&& !autoAcceptBlockedInTx` · `pauseRefuses(adapter) && kitchenPausedForUnit` ⇒ CHANNEL_PAUSED in `ingestOrder` and `ingestInTx` (after the replay lookup).
- step 6 ✅ 795abf06 — `kitchen-slip-render.ts` (pure: imports only kds-shared + receipt-render types/`receiptColumns`; no clock) · `parsePrinterConfig` keys only when sent + `kitchenSlipSettings()` reader.
- step 7 ✅ 085cb3d1 — `pos.json` th/en `kds` block (same 69-leaf key set · th Thai · en no Thai) incl. `kds.errors.{ticketNotFound,ticketTooOld,kdsStationNotFound,validation,permissionDenied,productNotFound,productUnavailable,channelPaused,internal,unknown}`; no UI dirs yet (ST7 vacuous); no permission key added.
- step 8 ✅ (this commit) — `POS-OWNER-PENDING.md` 4 lines (restaurant schema · legacy board paid-lock · P2.7 QR/86 event gap · design 04 derived frames) + these notes.

### First DB run (pre-merge, head 085cb3d1 + notes) — `qc-pos-p2.6` forced on QC4 → **50/51** · PAR 5/5 · SKIP-until-export 0 · residue 0 · leaks 0. Only red = **K5** (see CONTROLLER-DECISION 1).

## CONTROLLER-DECISION
1. **ruled 14 Oct (controller): ORACLE-EDIT applied ccf595f4** (line 1575 `newDraft: true` + comment line; nothing else in the oracle). — **K5 = oracle drift vs P2.4 S fix 3 (N1).** The fixture holds the table draft with `holdRegisterCart({cart, tableSessionId: sid})` (oracle line 1575, written at f71f4e30); since P2.4 S fix 3 (ORACLE-EDIT 10 Oct in qc-pos-p2.4 `hold(... mode = { newDraft: true })`) table mode must name the draft (`newDraft: true` or `{heldCartId, expectedVersion}`), so the hold is refused → `heldCartId ""` → `registerSendTableRound` VALIDATION → K5 red, and the follow-on table bill has no lines (CASH 0 → VALIDATION). Red-before also had K5 red. **Positive control** (scratch copy in `scripts/`, deleted after; only change = `, newDraft: true` on that line): **51/51**, K5 green (table bill → no extra round, heal adds none, sent round = TABLE + label A3 + staffName). **Ask:** ORACLE-EDIT line 1575 → `{ cart: { lines: [ln("kaprao", 1)] }, tableSessionId: sid, newDraft: true }`. Builder stopped this check here (oracle not edited).

2. **ruled 14 Oct (controller): accepted on wip, re-run at merge.** p2.8 59/60 — ST6 PAR red = register.ts P2.6 hunks vs merge-base (controller ruling: accepted on wip, re-run at merge). `git diff origin/session/pos -- register.ts` = additions only, 3 marked `// POS P2.6 ▸` hunks (CD 8 `soldOutMark` map + two after-commit `ticketForSale` calls).
3. **OPEN — qc-pos-p1.1 R.1 (row-count restore of the QC seed tenants) vs ruling 6 / A7.** p1.1 179/180: R.1 `OutboxEvent 561→563`. Read-only peek on QC4: the +2 rows are `pos.product.availability` {source MANUAL, available false then true} on `posqc-resto-unit-main`, produced by p1.1 S2.43's legacy `menu.setItemStock({isOutOfStock:true…})` + `({isOutOfStock:false})`. Ruling 6 + P2.6 A7 require exactly these MANUAL flip events from legacy `setItemStock`, so every p1.1 run adds 2 PENDING outbox rows to the seed tenant (S2.42 13/6 and S2.43 "no PosProduct write" stay green). **Ask:** ORACLE-EDIT p1.1 R.1 to tolerate `OutboxEvent` rows of type `pos.product.availability` (or have the S2.43 section delete the events it triggered). Builder did not edit p1.1. The 2 PENDING rows from this gate run remain in the seed tenant; their consumer is a no-op fan-out.

## Deviations (each with the ruling it touches)
1. New restaurant writers in a **new file `restaurant/kitchen.ts`** (not `order.ts`/`kds.ts`) — §7 "builder's choice recorded" · keeps L1 sigs / ST4 hot-path bodies / S2.42 byte-identical.
2. **No STOCK mark row** (R9 / CD6): marks are written only by `setAvailability` (KDS/MANUAL, who/when). `kdsBoard.eightySix` = marks + MENU rows sold out without a mark (counter ≤ 0 ⇒ `STOCK`, legacy 86 ⇒ `MANUAL`, `at` = MenuItem.updatedAt) + non-MENU rows closed for the unit without a mark (`MANUAL`). Reason: a counter release (void restore / daily reset) never leaves a stale mark.
3. Floor-at-0 counter consume/restore live in `catalog-legacy.ts` and are called by `pos/kds.ts` in the round tx (restaurant module writes no MenuItem) — ruling 6 / F15.1. G4c "no outbox in catalog-legacy" gets the P2.6 exception the brief orders (flip events only; hot path untouched; legacy `setItemStock`/`resetDailyStock` +1 read each for the before-state).
4. Build-order grouping (ruling 16): the floor-at-0 helpers (step 4 item) and `kds-actions.ts` (step 3 item, but it must call `setAvailability`) were committed with step 4; `register.ts` `soldOutMark` (step 4 item, CD 8) with step 3 (same file). Intermediate commits are not individually typechecked; gates judge the final head.
5. Round items of register/online rounds: `unitPrice/optionsTotal/lineTotal = 0`, `saleId/settledAt` null (CD2 + "money untouched"); legacy "orders today" pages list these rounds at ฿0 (owner line a).
6. `kitchenPausedForUnit` refuses `pauseRefuses` adapters (WEB/CHAT/API) — ruling 10 "non-MANUAL"; this includes the web-shop system gate (`ingestInTx`) while the kitchen is paused.
7. Online rounds store `guestName = PosOrder.customerName` (legacy pickup pages show a name); slips never print it.
8. KDS-driven READY does **not** call `ORDER_ADAPTERS[*].setReady` (no-op in P2; follow-up for P3 adapters).
9. `kdsSetAutoAcceptMax` writes audit `pos.kds.autoAcceptMax` (not in the brief; harmless).
10. Foreign hunk not named by the brief: `src/lib/automation/labels.ts` (+1 label for `pos.product.availability`, house rule "event = consumer + label").

## Foreign hunks (all marked `POS P2.6 ▸ … ◂`)
`prisma/schema/restaurant.prisma` (RestaurantOrder +6 · RestaurantSetting +1) · `prisma/schema/pos.prisma` (enum + model) · migration dir · `src/lib/core/scope.ts` · `scripts/pos-qc-env.mts` · `src/lib/modules/restaurant/index.ts` (one block) + new `restaurant/kitchen.ts` · `src/lib/outbox-consumers.ts` (helper block · voided third step · cancelled/rejected `bothMain` · availability key) · `src/lib/automation/labels.ts` · `src/messages/{th,en}/pos.json` (`kds` block) · `ledger/POS-OWNER-PENDING.md`.

## P2.6U contract (what the UI reads)
- Types: `src/lib/modules/pos/kds-shared.ts` — `KdsBoard` (`stations[] {id name nameEn openCount}` · `tickets: KdsTicket[]` already in column order NEW→COOKING→READY · `servedToday {count, last {no label source at}|null}` · `pending[] {name qty}` (top 8) · `avgMinutes` · `targetMinutes` (= kdsCriticalMins) · `paused` · `pausedNote` · `eightySix[] {productId name at source}` · `serverNow`), `KdsTicket` (`orderId stationId no source label channelCode? externalRef? isRush state sentAt elapsedSec targetMinutes remainingSec late warn lines doneCount lineCount staffName? queueNo? readyAt?`), `KdsLine {itemId qty name options[] note done cancelled}`, `KdsActionResult {ok, changed}`, `KdsRushResult {ok, rush}`, `KitchenSlip/KitchenSlipResult`, `KitchenProgressResult`, `KdsAutoAcceptResult`, `SetAvailabilityResult {ok, changed, available}`, `KdsRefusal {ok:false, code, message}` + `kdsRefusalMessageKey(code)` → `pos.kds.errors.*`; constants `KDS_POLL_MS` 6000, `KDS_EXPO` "expo", `KDS_WARN_SEC`, `sortColumn`, `ticketTimer` (client re-ticks from `serverNow`).
- Actions (`kds-actions.ts`, args `{systemId, unitId, deviceId?, …}`): `kdsBoardAction({stationId|"expo"})` · `kdsStartAction/kdsTicketDoneAction/kdsServedAction/kdsRecallAction({orderId, stationId})` · `kdsLineDoneAction({itemId})` · `kdsRushAction({orderId, rush})` · `kitchenSlipPayloadAction({orderId, stationId?, copy?, locale?})` · `kitchenProgressAction({posOrderIds})` (09 meter) · `kdsSetAutoAcceptMaxAction({maxOpen: 1..99|null})` · `setAvailabilityAction({productId, available, source "KDS"|"MANUAL", note?, resetCounter?})`.
- Elsewhere: `RegisterProduct.soldOutMark?: {source, at}` (19ฉ "หมด · ครัวแจ้ง HH:MM", KDS/MANUAL only) · `PosPrinterConfig.kitchenSlip?/kitchenStationIds?` + `kitchenSlipSettings(cfg)` (17B form) · `renderKitchenSlipHtml/renderKitchenSlipEscPos` (`kitchen-slip-render.ts`, same raster-slot shape as `encodeEscPos`) · `catalog.updateProduct({stationId})` (06 drawer picker, non-MENU) · messages `pos.kds.*` (th/en).
- Visual states for the controller (`visual-pos p2.6u --states`): empty unit · empty station · mixed board (new/cooking/late/warn/ready/rush) · expo · paused banner · 86 sheet · served recall · refusal toasts · register tile 86 · 09 meter (owner + cook + cashier read · th + en).

## Follow-ups
- P2.6U: screen 04 + small edits listed above (register "⋯" entry, settings devices card, legacy `/restaurant/kds` banner, 17B form, 09 meter + backlog hint, PayDone "คิว N").
- P2.7: move QR ordering off the frozen hot path → emit `pos.product.availability` on QR auto-86/restore (closes owner line c).
- P3.1–3.3: real `setAvailability` / `setReady` pushes (call `setReady` on KDS-driven READY then).
- Controller: prod `RestaurantOrder` row count before deploying the partial uniques (§9 ruling 14); ORACLE-EDIT K5 (CD 1 above).
- post-merge hardening (hunter-facing): `ticketForSale` re-reads the sale status **inside** the round tx under `SELECT … FOR SHARE` — a void that commits first ⇒ no round (`NOT_PAID`); a void that comes later waits for the round tx, then its `pos.sale.voided` consumer cancels the round's unserved items. Closes the read-then-void window of the heal/after-commit path.
- 14 Oct · ORACLE-EDIT K5 applied **ccf595f4** (controller ruling CD 1) · merged `origin/session/pos` 4ff45114 (P2.8U UI/messages/visual-pos/pos-qc-env) — auto-merge, `pos.json` th/en keep `orders` (P2.8U) + `kds` (P2.6), `pos-qc-env` keeps `posAvailabilityMark`. Earlier partial gate run on c7309135 superseded (p2.6 ×3 = 50/51 K5 only · fitness ×3 + fitness-pos ✅ · qc-hf-tx ✅); final gates rerun on the post-merge head below.

## Final gates — tree `/root/projects/shark-pos-c` head **e580cf6b** (code head e580cf6b = ccf595f4 ORACLE-EDIT + merge 4ff45114) · dirty 0 · logs `scratchpad/p26/gates/*.log` (each starts `tree=… head=e580cf6b dirty=0`)
| gate | result |
|---|---|
| typecheck (iso · pos-gate.lock · 5632 MB) | exit 0 |
| fitness no-env / env | 50/50 · 50/50 |
| fitness-pos | 8/8 |
| qc-pos-p2.6 forced #1 / #2 / unforced | **51/51 · 51/51 · 51/51** · PAR 5/5 · SKIP 0 · residue 0 · leaks 0 |
| qc-hf-tx | 18/18 |
| qc-pos-p2.4 | 50/50 (PAR 4/4) |
| qc-pos-p2.8 | 59/60 — ST6 PAR (CD 2 ruled: accepted on wip, re-run at merge) |
| qc-pos-p2.3 | 46/46 |
| qc-pos-p1.10 | 40/40 |
| qc-pos-p1.6 | 48/48 |
| qc-pos-p1.1 | 179/180 — R.1 OutboxEvent +2 (CD 3 open) · S2.42 13/6 ✅ · S2.43 ✅ |
| qc-pos-p1.3 | 128/128 |
| qc-pos-p1.18 | 81/81 |
| qc-restaurant / -money / -pay / -void | 6/6 · 6/6 · 19/19 · 11/11 |
| qc-pos-products | 24/24 |
| qc-hf-pos-page-authz | 71/71 |
