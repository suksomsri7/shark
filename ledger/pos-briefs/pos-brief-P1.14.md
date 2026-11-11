# P1.14 S — stock count from the POS (mobile) + receive / transfer / adjust shortcuts (brief DRAFT · oracle writer · cloud run · 4 Oct 2026)

> Status: DRAFT written without DB access, for the controller to ratify. Base: `session/pos` a34eefd5 ("POS: start P1.14 S"). Lane rules + COMMON apply. Re-verify every file:line on the builder's head.
> Plan row (`POS-MASTER-PLAN.md:67`): "ตรวจนับมือถือ + ทางลัดรับของ/โอน/ปรับ · `PosStockCount` · ขายระหว่างนับบวกกลับ · event confirmed · ~30 · mockups 05ค · 16*".
> Design: `DESIGN-POS.md:209` (open a round all/category · scan/type · variance highlighted · sales during the count added back automatically · confirm → movement + variance). `DESIGN-INVENTORY-V2.md:22,53,121` (inventory V2 card I1.7 "count rounds" is planned but not built).
> This card is **S (server) only**. The mobile screen (05ค) and the shortcut screen (16) are a later builder U card.
> Oracle: `scripts/qc-pos-p1.14.mts` (30 checks) · notes `ledger/wo-notes/pos-P1.14-oracle.md`.

## 1. Facts as built (verified on `p114-local` a34eefd5)

**Inventory core** (`src/lib/modules/inventory/service.ts`, contract C-1: it is the only writer of stock):
- Stock = `InvItem.onHand` (total) + `InvLocationStock.onHand` per location, with the invariant Σ locations == item total (`:23-28`). `InvMovement` is append-only, `@@unique([tenantId, idempotencyKey])` (`prisma/schema/inventory.prisma:160-183`). Movements carry `sourceModule/refType/refId/note` but **no actor column**.
- Lazy location seed: an item with no `InvLocationStock` rows is seeded into the default location ("คลังหลัก") with its current `onHand` the first time it is touched (`seedDefaultStockIfNeeded :58`, `getOrCreateDefaultLocation :39`). So "qty at the default location" of an untouched item is `InvItem.onHand`.
- Row locks (HF-INV-1): every stock write locks the `InvItem` row with `SELECT … FOR NO KEY UPDATE` before reading (`lockItemForStock :139`). A tx that touches several items calls `lockItemsInTx(tx, ctx, ids)` first (`:161`, ids sorted `COLLATE "C"`, lock_timeout 15 s, restored after). Wrapper txs retry once on contention and then throw the Thai busy message (`withStockRetry :237`).
- Same idempotency key + different data → `StockKeyConflictError` code `INV_IDEMPOTENCY_CONFLICT` (`:182-192`); same key + same data → returns the old movement.
- `receive/receiveInTx` (`:579/:594`, IN, moving-average cost, optional lot/location, GL post + AccountProduct sync after commit), `consume/consumeInTx` (`:665/:680`, OUT, negative allowed + `needsReview`), `transfer` (`:837`, two TRANSFER rows keyed `<key>-out`/`<key>-in`, `sourceModule "transfer"`, `refType "InvLocation"`, replay returns `{ok:false}`, both locations must be live locations of the system).
- **`adjust`** (`:746`) sets `InvItem.onHand = newQty` (an absolute **total**) and applies `newQty − onHand` to the given location. It opens its own tx (no `adjustInTx`), and `AdjustInput` (`:738`) has **no `sourceModule/refType/refId`**. ADJUST posts no GL (`account-bridge.ts:44`); AccountProduct sync runs after commit (`:802`).
- **Existing back-office count** = `bulkCount` (`:806`): a loop of independent `adjust()` calls, one random key per line, "set onHand = counted", no session, no snapshot, no history, no handling of sales made while counting. UI `StockCount.tsx` (75 lines) → `bulkCountAction` (`actions.ts:200`, permission `inventory.movement.adjust :206`). **There are no count tables anywhere** (`inventory.prisma`, `pos.prisma`).
- Barcode lookup `findItemByBarcode` (`:1055`). Services (`kind SERVICE`) refuse every stock op.
- Permissions (`core/permissions.ts:475-490`): `inventory.movement.receive|consume|transfer|adjust`, `inventory.item.read` … The back-office actions assert them via `assertCan` with **no unitId** (`actions.ts:143,173,206,261`).

**POS side:**
- Unit → inventory: `systemForUnit(tenantId, unitId, "INVENTORY")` (`system/service.ts:58`) = `unitInventory` in `catalog.ts:376`. Several units may share one inventory system (the QC coffee tenant does).
- Sales cut stock **after commit** with `inventory.consume` at the **default location** (`pos/service.ts:718 consumeSaleInventory`, key `pos-consume-<saleId>-<lineId>`, `sourceModule "POS"`, `refType "PosSale"`); units with oversell policy BLOCK cut **inside** the sale tx after `lockItemsInTx` (`:443-452`, `:607-620`). Weighed lines cut **grams**; bundles have no own stock and cut components (`lineConsumption :702`).
- P1.2 weighed products: `PosProduct.soldByWeight` + `scalePlu` (`pos.prisma`), stock counted in grams on the linked `InvItem`. Scale labels: `parseWeighedBarcode` / `weighedBarcodeSettings` (`scan-shared.ts:135-162`, settings at `AppSystem(POS).settings.pos.weighedBarcode`).
- Shape to copy for a POS service: `shift.ts` — `RegisterCtx {tenantId, systemId, unitId}`, `RegisterActor {userId, role, unitAccess, permissions}`, `scopeOf` (`:205`), refusals as data `{ok:false, code, message}` (`ShiftRefusal :76`), optional `client?: Db` last argument (the oracle's race lanes use it).
- Outbox: `emitOutbox(tx, {tenantId, type, idempotencyKey, payload, systemId, unitId})` inside the business tx (`core/outbox.ts`; e.g. `shift.ts:428` `pos.shift.closed` key `PosShift#<id>#CLOSED`). COMMON §4: every new event has a consumer in `outbox-consumers.ts` (shift events: no-op `withAutomation(async () => {})` at `:701-702`) and a label in `automation/labels.ts:31-32`.
- Audit rows in the same tx: `tx.auditLog.create({tenantId, unitId, actorType "USER", actorId, action, targetType, targetId, before, after})` (`held-cart.ts:273`, `shift.ts recountShift`).
- `scope.ts` registers POS tables at the head of `MODULE_SCOPES` (`:51-57`).

**Decision on reuse:** there is no count table to reuse, and `bulkCount` cannot express a session, a snapshot or the add-back rule. P1.14 adds **POS-owned count tables** and **reuses the inventory service for every stock write** (new `adjustInTx`, plus existing `receive`, `transfer`, `lockItemsInTx`). `bulkCount`/`StockCount.tsx` stay unchanged (back-office "set to counted" tool). Inventory V2 I1.7 may later move the tables under inventory; the API below is the seam.

## 2. Contract (proposed rulings R1…R16 — controller; additive only)

R1 **Tables** (new, `prisma/schema/pos.prisma`; ids loose, no FK, like `PosShift`):
- `enum PosStockCountStatus { OPEN CONFIRMED CANCELLED }` · `enum PosStockCountScope { ALL CATEGORY }`
- `PosStockCount`: `id`, `tenantId`, `systemId` (POS), `unitId`, `inventorySystemId`, `locationId`, `countNo Int` (per unit, 1,2,3… — "ตรวจนับ #7" in 05ค), `scope PosStockCountScope`, `categoryIds String[] @default([])` (InvCategory ids), `blind Boolean @default(false)`, `status PosStockCountStatus @default(OPEN)`, `note String?`, `snapshotAt DateTime`, `openedByUserId String`, `openKey String`, `confirmKey String?`, `confirmedByUserId String?`, `confirmedAt DateTime?`, `cancelKey String?`, `cancelledByUserId String?`, `cancelledAt DateTime?`, `cancelReason String?`, `createdAt`, `updatedAt`.
  `@@unique([tenantId, openKey])` · `@@unique([unitId, countNo])` · `@@index([tenantId, unitId, status])` · **hand-written partial unique** `PosStockCount_open_location_key ON ("inventorySystemId","locationId") WHERE status = 'OPEN'` (same pattern as `PosProduct_systemId_scalePlu_active_key`).
- `PosStockCountLine`: `id`, `tenantId`, `countId`, `itemId` (InvItem), `snapshotQty Int`, `countedQty Int?`, `expectedAtCount Int?`, `countedAt DateTime?`, `varianceQty Int?` (written at confirm), `costSatang Int?` (item avg cost at confirm), `movementId String?`, `createdAt`, `updatedAt`. `@@unique([countId, itemId])` · `@@index([tenantId])`.
- `PosStockCountEntry` (one row per scan/typed entry — multi-person audit + idempotency): `id`, `tenantId`, `countId`, `lineId`, `itemId`, `mode String` ("SET"|"ADD"), `qty Int`, `code String?`, `byUserId String`, `idempotencyKey String`, `createdAt`. `@@unique([tenantId, idempotencyKey])` · `@@index([countId])`.
- `scope.ts`: `PosStockCount: sys()`, `PosStockCountLine: tenant`, `PosStockCountEntry: tenant`, next to the P1.9 entries.
- Migration `2026112600000x_pos_p114_stock_count`: CREATE TYPE ×2, CREATE TABLE ×3, indexes, the partial unique. No ALTER of any `Inv*`, `PosSale*`, `PosProduct`, `PosShift*` table; no DROP/RENAME/SET NOT NULL. QC4 only.

R2 **Files.** `src/lib/modules/pos/stock-count.ts` = the only writer of the three tables (server). `src/lib/modules/pos/stock-count-shared.ts` = pure (no prisma/db import): `STOCK_COUNT_REFUSAL_CODES`, `STOCK_COUNT_MESSAGES: Record<code, {th, en}>`, limits, view types. Every function takes `(ctx: RegisterCtx, actor: RegisterActor, input, client?)` and returns `{ok:true,…} | {ok:false, code, message}` (message = Thai text from `STOCK_COUNT_MESSAGES`); it never throws (catch → `INTERNAL`; inventory contention → `STOCK_BUSY`; `INV_IDEMPOTENCY_CONFLICT` → `IDEMPOTENCY_CONFLICT`). Fixed order: scope → permission → validation → key lookup → tx.

R3 **Scope & location.** `ctx` must be a live POS system linked to a live unit (else `NOT_FOUND`). The unit's inventory = `systemForUnit(…, "INVENTORY")`; none → `NO_INVENTORY`. Location = `input.locationId` (must be a live `InvLocation` of that inventory, else `NOT_FOUND`) or the default location (`ensureDefaultLocation`). `locQty(item, loc)` = the `InvLocationStock` row's `onHand`; if the item has **no** location rows and `loc` is the default → `InvItem.onHand`; else 0. A count is visible only from its own unit (`ctx.unitId === count.unitId`, same tenant and POS system), else `NOT_FOUND`.

R4 **Open** `openStockCount(ctx, actor, {scope, categoryIds?, blind?, locationId?, note?, idempotencyKey})` → `{ok, count: StockCountView, duplicated?}`.
- Lines are fixed at open: every `InvItem` of the inventory with `kind PRODUCT` and `archivedAt null` (CATEGORY: `categoryId ∈ categoryIds`). SERVICE and archived items are never lines. Bundles have no InvItem, so they are never lines.
- `snapshotQty = locQty` read in the open tx (no item locks — informational only); `snapshotAt = now()` of that tx.
- `countNo` = max(countNo of the unit)+1 under `pg_advisory_xact_lock(hashtext('PosStockCount:'||unitId))`; `@@unique([unitId, countNo])` is the backstop.
- **One OPEN count per (inventorySystemId, locationId)**: another OPEN → `COUNT_ALREADY_OPEN` with `countId` of the open one. The partial unique decides races (P2002 → re-read → `COUNT_ALREADY_OPEN`, or `duplicated` when it is the same key).
- Same `openKey` + same payload → `duplicated:true` same count; same key + other payload → `IDEMPOTENCY_CONFLICT`.

R5 **Record** `recordStockCount(ctx, actor, {countId, itemId? | code?, qty?, mode: "SET"|"ADD", idempotencyKey})` → `{ok, line: StockCountLineView, entryId, duplicated?}`.
- Exactly one of `itemId`/`code`. Code resolution (first hit wins): (1) a scale label (`parseWeighedBarcode` with the POS system settings) → `PosProduct` of this POS system with that `scalePlu`, `soldByWeight`, not archived → its `invItemId`; the label's **grams** are the qty (`qty` must be absent); a PRICE label converts with `weighedGramsFromPrice`; (2) `InvItem.barcode` in the inventory; (3) `InvItem.sku`. No hit → `UNKNOWN_CODE`. Hit but no line in this count (service, archived, other category, other inventory) → `NOT_IN_COUNT`. `itemId` with no line → `NOT_IN_COUNT`.
- Quantities are integers in the item's stock unit: pieces, or **grams** for weighed items (view `weighed:true`). SET 0…10,000,000; ADD 1…10,000,000.
- Tx order: count row `FOR SHARE` (status must be OPEN, else `COUNT_NOT_OPEN`) → line row `FOR NO KEY UPDATE` → `inventory.lockItemsInTx([itemId])` → read `locQty` → write entry; line `countedQty` = qty (SET) or `(countedQty ?? 0) + qty` (ADD); **`expectedAtCount = locQty` read under the item lock**; `countedAt = now()`.
- Entry key: same key + same payload → `duplicated:true`, nothing changes; same key + other payload → `IDEMPOTENCY_CONFLICT`.

R6 **The add-back rule** (ขายระหว่างนับบวกกลับ). Reference time of a line = its latest entry (`countedAt`). `expectedAtCount` is the system quantity at that instant. Because the item row is locked while it is read, every stock movement of that item commits strictly before or after it:
- invariant: `expectedAtCount == snapshotQty + Σ qtyDelta` of the item's movements at the count location with `snapshotAt < createdAt ≤ countedAt` (excluding the count's own ADJUST rows).
- `varianceQty = countedQty − expectedAtCount` (frozen at confirm).
- Confirm applies the **variance as a delta** to the **current** stock: new location qty = current + variance. So every sale, refund, receive or transfer that lands after the line was counted stays in the books ("added back"), and every movement before it is already in `expectedAtCount`. Example: snapshot 20 · 2 sold · counted 17 (expected 18, variance −1) · 1 more sold · confirm → 16, not 17.
- Known limit: a sale whose after-commit cut lands milliseconds after the shelf was counted is booked "after"; units on BLOCK cut inside the sale tx and have no gap.

R7 **Confirm** `confirmStockCount(ctx, actor, {countId, uncounted?: "SKIP"|"ZERO", idempotencyKey})` → `{ok, count, adjustedLines, varianceValueSatang, duplicated?}`. One tx:
1. count row `FOR UPDATE`; CONFIRMED with `confirmKey === key` → `duplicated:true` (same result); other non-OPEN → `COUNT_NOT_OPEN`.
2. Lines = counted lines (+ uncounted lines when `ZERO`; default `SKIP` leaves them without variance/movement). None → `NOTHING_COUNTED`.
3. `inventory.lockItemsInTx(invCtx, ids)` (sorted) before reading any item; ZERO lines get `countedQty 0`, `expectedAtCount = locQty` now, `countedAt = now()`.
4. Per line: `varianceQty`, `costSatang = item.costSatang`; if `varianceQty ≠ 0` → **`inventory.adjustInTx(tx, invCtx, {itemId, newQty: item.onHand + varianceQty, locationId, idempotencyKey: "pos-count-<countId>-<itemId>", sourceModule: "POS", refType: "PosStockCount", refId: countId, note: "ตรวจนับ #<countNo>"})`** → `movementId`. Variance 0 → no movement.
5. Count → CONFIRMED (`confirmKey`, `confirmedByUserId`, `confirmedAt`); one AuditLog `pos.stockCount.confirm` (targetType `PosStockCount`); `emitOutbox` (R10).
6. After commit: AccountProduct sync of adjusted items (same as `adjust` does today). No GL (ADJUST posts none — R15).
Lock order everywhere: count row → (line row) → items (sorted). Sales take item locks only, so there is no cycle.

R8 **Inventory change (additive).** `inventory/service.ts` exports `adjustInTx(tx, ctx, input: AdjustInput)`; `AdjustInput` gains optional `sourceModule`, `refType`, `refId`; `adjust` becomes the wrapper (`withStockRetry` + tx + `adjustInTx` + sync), behaviour byte-identical for current callers; `bulkCount` unchanged. No direct `invItem/invLocationStock/invMovement/invLot` writes in `pos/stock-count.ts` (C-1).

R9 **Cancel** `cancelStockCount(ctx, actor, {countId, reason (1–200), idempotencyKey})` → CANCELLED, no movement, no event, one AuditLog `pos.stockCount.cancel`. Replay same key → `duplicated`. Non-OPEN → `COUNT_NOT_OPEN`. The location is free for a new count.

R10 **Event** `pos.stockCount.confirmed`, key `PosStockCount#<id>#CONFIRMED`, `systemId` = POS, `unitId`, payload `{countId, countNo, unitId, inventorySystemId, locationId, countedLines, adjustedLines, varianceQtyNet, varianceValueSatang}` (`varianceValueSatang = Σ varianceQty × costSatang`). Consumer: no-op `withAutomation(async () => {})` in `outbox-consumers.ts` + label in `automation/labels.ts` (append-only hunks marked `// POS P1.14 ▸ … ◂`). Replay of confirm never emits twice.

R11 **Reads** `getStockCount(ctx, actor, {countId, filter?: "ALL"|"UNCOUNTED"|"VARIANCE"})` → `{ok, count, lines: StockCountLineView[], summary: {total, counted, withVariance}}` and `listStockCounts(ctx, actor, {status?, limit?})` → `{ok, items}` (unit's counts, newest first).
`StockCountView = {id, countNo, unitId, inventorySystemId, locationId, scope, categoryIds, blind, status, note, snapshotAt, openedByUserId, confirmedAt, confirmedByUserId, cancelledAt, cancelledByUserId, cancelReason}` (ISO dates).
`StockCountLineView = {id, itemId, name, sku, barcode, unitLabel, weighed, snapshotQty, countedQty, expectedAtCount, varianceQty, countedAt}` — `varianceQty` live = counted − expectedAtCount while OPEN. **Blind** (`blind:true`): for an actor without `inventory.movement.adjust`, `snapshotQty`, `expectedAtCount` and `varianceQty` are `null` (still OPEN or not).

R12 **Permissions** (evaluated with `unitId` = ctx unit; OWNER/MANAGER pass via `evaluate`):
- open / record / get / list: **new key `pos.stock.count`** ("ตรวจนับสต็อกจากหน้าขาย", `permissions.ts`, POS group).
- confirm: `inventory.movement.adjust` (module `inventory`) — same as the back-office count.
- cancel: `inventory.movement.adjust`, or the opener holding `pos.stock.count`.
- shortcuts: `inventory.movement.receive` / `inventory.movement.transfer` / `inventory.movement.adjust`.
Missing → `PERMISSION_DENIED` (checked before the key lookup, so a replayed key never bypasses it).

R13 **Shortcuts** (POS actor, POS unit, inventory functions only; client key namespaced into the tenant-wide movement key):
- `posReceiveStock(ctx, actor, {itemId?|code?, qty 1…10,000,000, costSatang?, lotCode?, expiryDate?, note?, idempotencyKey})` → `inventory.receive` with key `pos-recv-<key>`, `sourceModule "POS"`, `refType "PosUnit"`, `refId unitId`, default location; `costSatang` omitted = the item's current average (average unchanged). → `{ok, movementId, duplicated?}`.
- `posTransferStock(ctx, actor, {itemId?|code?, qty, fromLocationId?, toLocationId, note?, idempotencyKey})` → `inventory.transfer` with key `pos-tf-<key>` (rows `pos-tf-<key>-out/-in`); from = default when omitted; from == to → `VALIDATION`; a location outside the unit's inventory → `NOT_FOUND`. → `{ok, movementIds: [out, in], duplicated?}`. Same-inventory locations only (R16).
- `posAdjustStock(ctx, actor, {itemId?|code?, deltaQty ≠ 0 (|…| ≤ 10,000,000), reason 1–200, locationId?, idempotencyKey})` → own tx: `lockItemsInTx` → `adjustInTx({newQty: onHand + deltaQty, key "pos-adj-<key>", sourceModule "POS", refType "PosUnit", refId unitId, note: reason})`. → `{ok, movementId, duplicated?}`.
- A SERVICE or archived item → `NOT_STOCKED`; unknown code → `UNKNOWN_CODE`. Replay of the same key → `duplicated:true`, no second movement. One AuditLog per successful non-duplicate shortcut (`pos.stock.receive|transfer|adjust`, targetType `InvMovement`, targetId = movement id; transfer = the `-out` row) — written after the movement commits (the inventory wrappers own their tx).
- Shortcuts are allowed while a count is OPEN (R6 handles them).

R14 **Validation** (`VALIDATION`, nothing written): unknown input keys; `idempotencyKey` `^[A-Za-z0-9_-]{8,64}$`; integers only; CATEGORY needs 1–50 `categoryIds` that are categories of the unit's inventory; ALL must not send `categoryIds`; `note` ≤ 200; `reason` 1–200 trimmed; `mode` ∈ SET/ADD; `uncounted` ∈ SKIP/ZERO.

R15 **Refusal codes** (`STOCK_COUNT_REFUSAL_CODES`, th + en in `STOCK_COUNT_MESSAGES`, en has no Thai): `VALIDATION`, `NOT_FOUND`, `PERMISSION_DENIED`, `NO_INVENTORY`, `COUNT_ALREADY_OPEN`, `COUNT_NOT_OPEN`, `UNKNOWN_CODE`, `NOT_IN_COUNT`, `NOT_STOCKED`, `NOTHING_COUNTED`, `IDEMPOTENCY_CONFLICT`, `STOCK_BUSY`, `INTERNAL`. UI message keys (`pos.stockCount.*` in `src/messages`) belong to the U card.

R16 **Out of scope:** receiving against a purchase order from the POS (mockup 16 "PO-0012" — use procurement `receivePo`; Q1) · two-phase inter-branch transfer with "in transit / received" and cross-inventory transfers (mockup 16; P2.12) · GL posting of count variance / adjust as expense (mockup 16 "ผลต่างลงบัญชี"; Q2 — the event carries `varianceValueSatang` for a later consumer) · lot-level counting (lines are per item × location; lots untouched) · several counters assigned to zones, approvals of variance (I1.7/I1.11) · offline counting (P3.4) · the screens 05ค / 16 and their messages (U card) · changes to `bulkCount`/`StockCount.tsx`.

## 3. Owner questions (non-blocking; the brief proceeds with the default)
- **Q1** Mockup 16 shows "receive against a PO" from the POS. Default: P1.14 ships free receive only (R13); PO receive stays in Procurement (the U card may link to it).
- **Q2** Mockup 16 says the variance goes to the books as an expense automatically. Default: not in P1.14 (ADJUST posts no GL today); a P3 accounting consumer of `pos.stockCount.confirmed` / adjust can add it.

## 4. Order of work
1. Controller ratifies R1–R16 and the names (oracle notes §Names).
2. Base run of the oracle on the VPS: unforced SKIPPED exit 0 · `QC_FORCE=1` 3/30 green (ST7 · Z1 · Z2), exit 1 · `--no-db` 1/7 (ST7), exit 1. Accept the oracle, merge it into `session/pos`.
3. Builder S: schema + migration (QC4) · scope.ts · `adjustInTx` (inventory) · `stock-count-shared.ts` · `stock-count.ts` (9 functions) · permission key · consumer + label.
4. Reviewer → hunter (R6 races, C-1) → accept. Then card U (05ค, 16).

## 5. Acceptance
`qc-pos-p1.14` 30/30 forced ×2 + unforced with no residue · `qc-pos-inventory`, `qc-pos-p1.2`, `qc-pos-p1.6`, `qc-pos-p1.3`, the inventory oracles (`qc-inventory`, `qc-inventory-item`, `qc-inventory-account`, `qc-lot`, `qc-hf-inventory-atomic`, `qc-hf-inventory-authz` — `adjust` refactor) green · COMMON §7 money set · `pnpm fitness` both modes · typecheck.

## Owner answers (5 Oct 2026)
- Q1: no PO receiving from the POS (free receive only; PO receiving stays in Procurement).
- Q2: count variance is not posted to the ledger in P1.14; the event carries varianceValueSatang for a later accounting step.
