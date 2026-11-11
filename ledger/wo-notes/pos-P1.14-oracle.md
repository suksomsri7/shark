# POS P1.14 S — oracle notes (stock count from the POS + receive / transfer / adjust shortcuts)

Oracle writer · cloud run · 4 Oct 2026 · base `p114-local` = `origin/session/pos` a34eefd5 · pushed to `wip/pos-p1.14-oracle`.
No DB here, so no DB run was done. The controller runs the base run on the VPS (QC4).
Brief: `ledger/pos-briefs/pos-brief-P1.14.md` (rulings R1–R16). Oracle: `scripts/qc-pos-p1.14.mts` (30 checks).

## Checks
| id | X | what |
|---|---|---|
| ST1 | - | schema: 3 models (columns, 4 uniques, nullability) + 2 enums |
| ST2 | - | migration: CREATE TABLE ×3 · partial unique `("inventorySystemId","locationId") WHERE status = 'OPEN'` · no ALTER of Inv*/PosSale*/PosProduct/PosShift* · no DROP/RENAME/SET NOT NULL |
| ST3 | - | `scope.ts` real lines for the 3 models |
| ST4 | - | inventory: `adjustInTx` exported · `AdjustInput` has sourceModule/refType/refId · `adjust` calls `adjustInTx` · `bulkCount` kept |
| ST5 | - | `pos/stock-count.ts`: 9 exports · confirm uses lockItemsInTx + adjustInTx + emitOutbox + auditLog · record locks items · shortcuts call receive / transfer / adjustInTx · no direct Inv* writes (C-1) |
| ST6 | - | `stock-count-shared.ts` pure · 13 codes with th (Thai) + en (no Thai) · `pos.stock.count` in permissions.ts · consumer + label for `pos.stockCount.confirmed` |
| ST7 | - | **base-green guard**: InvMovement / InvLocationStock columns unchanged · `bulkCountAction` still asserts `inventory.movement.adjust` · the 16 `inventory.*` permission keys unchanged |
| OC1 | - | open ALL: lines = live PRODUCT items of the unit's inventory (no service, no archived), snapshot = location qty, row fields |
| OC2 | - | open CATEGORY (catA → A,B,N) · 6 bad inputs → VALIDATION with no row |
| OC3 | X1 X6 | one OPEN per location (ALREADY_OPEN + countId) · same key → duplicated · second location OK with countNo+1 · 6-lane open race → 1 OK / 5 ALREADY_OPEN |
| RE1 | - | SET 9 → ADD 1 → SET 8 · expectedAtCount 10 · 3 entries |
| RE2 | - | barcode and SKU resolve · UNKNOWN_CODE · NOT_IN_COUNT for service / archived / another tenant's item · refusals write no entry |
| RE3 | X4 | weighed: scale label (prefix 21, WEIGHT) 1,250 g + typed 3,000 g = 4,250 · `weighed:true` · label + qty → VALIDATION |
| RE4 | X1 | entry replay duplicated · same key other qty → IDEMPOTENCY_CONFLICT · 10 bad inputs → VALIDATION, nothing written |
| RE5 | X6 | 8 lanes ADD 1 on one line → 8, 8 entries |
| AB1 | X4 | real `createSale` during the count: snapshot 20 · sold 2 · counted 17 → expected 18 · sold 1 more |
| AB2 | X4 | receive +5 and transfer −2 during the count → expected 8, variance 0 · invariant expected = snapshot + Σ movements in (snapshotAt, countedAt] for every counted line |
| CF1 | X4 X6 | confirm racing 5 concurrent consumes: 4 ADJUST rows (A −1, B −2, W −750, N +8), keys `pos-count-<count>-<item>`, POS/PosStockCount, movementId on lines · final A = 11 (17 − 5 − 1), B 8, C 10, W 4250, N 8, U 7 untouched · Σ locations = onHand |
| CF2 | - | NOTHING_COUNTED · out-of-category → NOT_IN_COUNT · `uncounted:"ZERO"` sets B and N to 0, A to 10 |
| CF3 | X1 | 1 event (key, payload countId/countedLines 5/adjustedLines 4/varianceValueSatang) · 1 audit · replay → duplicated with nothing added |
| CF4 | - | confirmed count: confirm (new key) / record / cancel → COUNT_NOT_OPEN, row unchanged |
| CF5 | X6 | 6-lane confirm race → 1 OK / 5 COUNT_NOT_OPEN, one ADJUST, one event |
| CA1 | X1 | cancel (blank reason → VALIDATION) · CANCELLED, no movement/event, 1 audit · replay duplicated · record/confirm → COUNT_NOT_OPEN · location reopens |
| PM1 | X2 X3 | sell-only → DENIED (open, record) · counter counts but cannot confirm / cancel others' count · STAFF of another unit → DENIED · unit without inventory → NO_INVENTORY · other unit / other tenant → NOT_FOUND · blind hides numbers from the counter only |
| SH1 | X1 X3 | `posReceiveStock`: IN `pos-recv-<k>`, POS/PosUnit/unitId, average cost unchanged · barcode · dup · NOT_STOCKED · VALIDATION · DENIED · 1 audit |
| SH2 | X1 X2 X3 | `posTransferStock`: `pos-tf-<k>-out/-in` · total unchanged · dup · from = to → VALIDATION · other tenant's location → NOT_FOUND · DENIED |
| SH3 | X1 X3 | `posAdjustStock`: ADJUST deltaQty, `pos-adj-<k>`, note = reason · dup · 3× VALIDATION · counter → DENIED |
| RF1 | - | all refusals are data, codes within the list, the 11 provokable codes all seen, messages non-empty |
| Z1 | - | row counts of both QC tenants before = after (23 tables incl. Inv*, PosStockCount*, AccountProduct, AppNotification) |
| Z2 | - | fingerprints of the pre-existing QC rows (11 tables) |

Sandbox (coffee QC tenant): units u1 + u2, one POS system (settings: weighed labels on, prefix 21 WEIGHT), one INVENTORY system linked to **u1 only** (u2 = NO_INVENTORY), categories A/B, 8 items (A 20, B 10, N 0, X archived, C 5, U 7, W 5,000 g, S service), a second location. `createItem` may create the PosProduct rows itself (catalog `ensureForInvItem`); the oracle then only sets `soldByWeight`/`scalePlu` on W's row (fixture-only direct write). Sales use `createSale` with sourceModule HOTEL (no shift needed); if that ever stops cutting stock, the oracle falls back to `inventory.consume` and says so in AB1. Everything is deleted in `finally`.

## Names I had to invent (controller to ratify)
- enums `PosStockCountStatus {OPEN CONFIRMED CANCELLED}`, `PosStockCountScope {ALL CATEGORY}`
- tables `PosStockCount` (`countNo`, `inventorySystemId`, `locationId`, `scope`, `categoryIds`, `blind`, `snapshotAt`, `openKey`, `confirmKey`, `cancelKey`, `cancelReason`, …), `PosStockCountLine` (`snapshotQty`, `countedQty`, `expectedAtCount`, `countedAt`, `varianceQty`, `costSatang`, `movementId`), `PosStockCountEntry` (`mode`, `qty`, `code`, `byUserId`, `idempotencyKey`); partial unique `PosStockCount_open_location_key`
- files `src/lib/modules/pos/stock-count.ts`, `src/lib/modules/pos/stock-count-shared.ts`
- functions `openStockCount`, `recordStockCount`, `getStockCount`, `listStockCounts`, `confirmStockCount`, `cancelStockCount`, `posReceiveStock`, `posTransferStock`, `posAdjustStock` — all `(ctx: RegisterCtx, actor: RegisterActor, input, client?)`
- result fields: `count` (StockCountView), `line` (StockCountLineView incl. `weighed`), `lines`, `entryId`, `duplicated`, `countId` on COUNT_ALREADY_OPEN, `adjustedLines`, `varianceValueSatang`, `movementId`, `movementIds`
- input fields: `scope`, `categoryIds`, `blind`, `locationId`, `note`, `itemId`, `code`, `qty`, `mode` SET/ADD, `uncounted` SKIP/ZERO, `reason`, `costSatang`, `fromLocationId`, `toLocationId`, `deltaQty`, `idempotencyKey`
- `inventory.adjustInTx` + `AdjustInput.sourceModule/refType/refId`
- codes (13): VALIDATION, NOT_FOUND, PERMISSION_DENIED, NO_INVENTORY, COUNT_ALREADY_OPEN, COUNT_NOT_OPEN, UNKNOWN_CODE, NOT_IN_COUNT, NOT_STOCKED, NOTHING_COUNTED, IDEMPOTENCY_CONFLICT, STOCK_BUSY, INTERNAL; `STOCK_COUNT_REFUSAL_CODES`, `STOCK_COUNT_MESSAGES {th,en}`
- permission key `pos.stock.count`
- event `pos.stockCount.confirmed` (key `PosStockCount#<id>#CONFIRMED`); audit actions `pos.stockCount.confirm`, `pos.stockCount.cancel`, `pos.stock.receive|transfer|adjust`
- movement keys `pos-count-<countId>-<itemId>`, `pos-recv-<k>`, `pos-tf-<k>(-out|-in)`, `pos-adj-<k>`; `refType "PosStockCount"` / `"PosUnit"`

## Expected base run (a34eefd5 · nothing of P1.14 built)
| Run | Expected result | Notes |
|---|---|---|
| `--list` | 30 ids, exit 0 | **ran here** |
| `--no-db` | 1/7, exit 1 | **ran here**. ST7 green; ST1–ST6 red for the right reasons (no models/enums, no migration, no scope lines, no `adjustInTx`, no `stock-count.ts`, no shared file / permission / consumer / label). |
| unforced | **SKIPPED, exit 0** | reasons: no `stock-count.ts`, no `posStockCount*` delegates, missing columns |
| `QC_FORCE=1` | **3/30 green: ST7 · Z1 · Z2**, exit 1 | ST1–ST6 as above. All DB checks red because every call returns `MISSING:<fn>`; the fixture still builds (createItem, receive, transfer, createSale, archiveItem, createLocation all exist). RF1 red: MISSING codes count as "other" and the 11 codes are never seen. Z1/Z2 green because cleanup removes units, systems, items, movements, location rows, PosProducts, sales, outbox and audit rows. |

typecheck (`NODE_OPTIONS=--max-old-space-size=5632 pnpm typecheck`): exit 0 here. esbuild syntax check: OK.

## Drift and risks found
- **No count tables exist** anywhere; the back-office count (`bulkCount`, `StockCount.tsx`) is a loop of absolute `adjust()` calls with random keys — it erases sales made while counting. P1.14 does not change it (R16); the owner may later want it routed through the new rule (I1.7).
- **`adjust` is absolute-total and has no InTx/ref fields** (`inventory/service.ts:738-805`). Counting one location with "set total = counted" is wrong whenever an item sits in two locations; the brief therefore applies the **variance as a delta** (`newQty = locked onHand + variance`) through a new `adjustInTx`. The refactor touches a shared inventory function — the inventory oracles are in the acceptance list.
- **Sales cut stock after commit at the default location** (`pos/service.ts:718`). The add-back rule keys on movement time, so a sale whose cut lands just after a shelf was counted is booked "after" (documented limit, R6). Units on BLOCK have no gap. Counting a non-default location never sees sales.
- **Two units can share one inventory** (QC coffee does). The OPEN-count lock is per inventory × location, not per unit, so two branches on one inventory cannot count the same location at once (COUNT_ALREADY_OPEN tells them which count is open).
- **Transfer keeps `sourceModule "transfer"` / `refType "InvLocation"`** (the function hard-codes them); the POS origin is visible only in the `pos-tf-` key and the audit row. Extending `TransferInput` was left out to keep the inventory change minimal.
- **Shortcut audit rows are written after the inventory wrapper commits** (no single tx); a crash in between loses only the audit row, never stock. Replays do not duplicate it.
- Mockup 16 shows PO receiving, a two-phase branch transfer and automatic expense posting of variance — all out of scope here (owner Q1/Q2, P2.12).
- Movement `createdAt` comes from Prisma at insert time; the invariant in AB2 relies on sequential calls in the oracle (true here).
