# POS P2.4 — oracle notes (`scripts/qc-pos-p2.4.mts`)

Oracle writer · VPS (account B) · 9 Oct 2026 · tree `/root/projects/shark-pos-p11` (lane 3) · branch `wip/pos-p2.4-oracle` from `session/pos` **6dbcafe0**.
Contract: `ledger/pos-briefs/pos-brief-P2.4.md` §2 R1–R12, §3, §4, §5 CD1–CD8, **§9 controller rulings (binding)**. U half (mode tab, floor screen 03, cart chip "ซื้อกลับ/ทานที่ร้าน", Thai-literal scan of the new screens, visual-pos p2.4u) is not tested here.

**43 checks** = ST (5: ST1–ST3 static · **ST4 = PAR** invariants · ST5 pure) · T (6) floor/open · D (6) draft/send · B (6) table quote · P (8) pay · V (4) void/refund/close/clear · R (3) reservations · **L (3) PAR** legacy freeze · Z (2).
Modes: `--list` (no DB) · `--no-db` (ST1–ST4 + L2 L3 + ST5; never loads prisma) · DB run SKIPs (exit 0 + reasons) until every P2.4 file/export/column exists · `QC_FORCE=1` runs anyway (red by reason, no crash; every check wrapped) · `QC_ALL=1` prints every reason instead of the first 8.
Fixtures (module functions only): temp tenant `posqc-p24-<rand>` (+ `-t2`), users `posqc-p24-<rand>-{owner,mgr,staff,staff0,staffr,noperm}@qc.invalid` with real Memberships — OWNER `*` · MANAGER [A] · STAFF [A] `pos.sale.create restaurant.session.open restaurant.order.create` · STAFF0 [A] `pos.sale.create` · STAFFR [A] `pos.sale.read` · NOPERM [A] `{}`. Unit **A** = RESTAURANT linked to POS + INVENTORY + MEMBER, POS linked to a VAT book; POS payment settings service charge **10 %** (`updatePosPaymentSettings`), `RestaurantSetting.serviceChargeBps` **1000**. Unit **B** = SHOP linked to the POS, no tables. T2 unit X (RESTAURANT) with table X1 + an OPEN session. Stations ครัว (first) · เครื่องดื่ม · ยำ-<rand>. Menu via `restaurant/menu.createItem` (legacy door ⇒ MENU PosProduct rows): ต้มยำ ฿180 (group เผ็ดกลาง +0 / กุ้งเพิ่ม +฿40, station ยำ) · ข้าวสวย ฿18.05 · ผัดกะเพรา ฿160 `stockQty 2`. น้ำเปล่า = `inventory.createItem` + receive 100 @ ฿4 ⇒ PRODUCT row priced ฿10 (tracked). Member Silver (default tier, DISCOUNT_PCT 10 % cap ฿1,000). Zones ในร้าน (A1–A9) + ระเบียง (C1–C7, L1); A3 INACTIVE. Devices DEV1/DEV2 each with an open shift. Prisma direct only for Tenant/BusinessUnit/User/Membership/AccountSystemLink; raw SQL only for `xmin`, `information_schema`, fingerprint and cleanup; new columns are read through the Prisma delegates (old client ⇒ `undefined` ⇒ red with reason). `finally` wipes both tenants (every table with `tenantId`) + users.

Table usage: A1 main flow (T2 parallel open → D1–D4 → B1/B6 → P1/P2/P5/P7/P8 → T1 NEEDS_CLEARING → V1/V2 → V4 has-unpaid) · A2 free · A3 INACTIVE · A4 REQUEST_BILL (legacy) · A5 partial legacy checkout + READY item + draft + member + CALL_STAFF (T6) · A6 reservation/seat (R1) · A7 parallel pay (P3) → refund ⅓ (V3) → clear (V4) · A8 round between quote and submit (P4) · A9 pay with draft held (P6) · C1 member session (B3) · C2 half-up (B4) · C3 guest QR session (B4 QR_TABLE) · C4 empty / cancelled-only (B5) → close CANCELLED (V4) · C5 legacy parallel open (T2) · C6 stock refusal (D5/D6) · C7 closed-session refusal (D2), reserved override (R2) · L1 legacy PAR (L1).

## CONTROLLER-DECISION (read first — the oracle encodes my proposal for each)
1. **Facade surface (CD1).** Only `createOrderInTx` is pinned (exported from `restaurant/order.ts` and re-exported by `restaurant/index.ts`, which carries a `// POS P2.4 ▸ … ◂` marker). The other tx-taking facade functions are the builder's choice (record them in `pos-P2.4.md`). `src/lib/modules/pos/**` may reach the restaurant module **only** through `import("@/lib/modules/restaurant")` (lazy, index only — no deep path, no static value import; `import type` from the index is fine). At least one file under `modules/pos` uses that import. `outbox-consumers.ts` reaches the table logic through `import("@/lib/modules/restaurant")` or `import("@/lib/modules/pos/table")`. No file in `modules/pos/**` or `outbox-consumers.ts` writes `Restaurant*`/`TableSession` rows directly (Prisma writes or raw `UPDATE/INSERT/DELETE`) — the R7 item claim is a facade function run inside the register tx.
2. **Floor summary + DTO (R2).** `summary.total` = non-archived **ACTIVE** tables · `used` = tables with an OPEN session · `guests` = Σ `guestCount` (null = 0) of OPEN sessions · `unpaidSatang` = Σ of the cards' `unpaidSatang` = Σ unpaid non-cancelled `lineTotal` of OPEN sessions · `avgMinutes` = integer ≥ 0 (floor of the mean seated minutes of OPEN sessions; 0 when none). Every table card has the brief's keys **plus `sessionId`** (the panel needs it). `member` = `{id?, name, tier: string|null}` (tier = tier name, e.g. "Silver") or null · `unsentCount` = `lineCount` of the session's HELD draft (0 when none) · `readyCount` = items with `kdsStatus READY` · `flags` = `{callStaff, billRequested, payNotified}` from PENDING/ACKED requests (ack keeps the flag, done clears it — same rule as `floorPlan`) · `dirtySince` ISO/Date or null · `reservation` = `{id, name, partySize, at, …}` or null.
3. **Hash and refusal order (R6 R7 · P4).** `table.itemsHash = tableItemsHash(table.itemIds)` (pure, order-independent over item ids). Submit checks the hash of the **current** unpaid set against `expectedTableItemsHash` **before** the price check ⇒ a round sent between quote and submit is `TABLE_ITEMS_CHANGED`, not `PRICE_CHANGED`; nothing written. `itemIds` are compared as a set (items created in one tx share `createdAt` ⇒ order ties; the server may order by `createdAt, id`).
4. **Void consumer (CD5 · V2).** On `pos.sale.voided` the consumer unlinks items whose `saleId` = the voided sale and reopens the session **only when it unlinked ≥ 1 item** and the table has no other OPEN session; replay = 0 rows, no session change. Proposal: act only on `sourceModule "POS"` sales — legacy `voidCheckout` (RESTAURANT sales) already unlinks/reopens itself; a consumer racing its second tx could change `itemsReset`/`sessionReopened` and break L1. V2 replays the L1 RESTAURANT void after re-checkout: the CLOSED L1 session must stay CLOSED with its items linked to the new sale.
5. **Reservations (R10 · Q2).** Inputs: `registerCreateReservation(ctx, actor, {tableId?, name, phone?, partySize, at /*ISO string*/, holdFromMinutes?})` → `{ok:true, id}` · `registerSeatReservation(ctx, actor, {reservationId, tableId?})` → `{ok:true, sessionId}` (opens through R3; session `guestCount = partySize`; status SEATED) · `registerCancelReservation(ctx, actor, {reservationId})` → `{ok:true}`. Permission for all three = `restaurant.session.open` (CD8, no new key). Unknown/foreign reservation id ⇒ `TABLE_NOT_FOUND` (no new code). `partySize` < 1 ⇒ `VALIDATION`. Opening a table that holds a BOOKED reservation inside its window ⇒ ok + `reservationOverridden: true`, reservation stays BOOKED. Reservations with `at` in the past are not tested.
6. **Draft API (R4).** `holdRegisterCart(ctx, actor, {cart, tableSessionId, label?, staffToken?})` — `tableSessionId` is a sibling of `cart`; at 6dbcafe0 `holdRegisterCart` silently ignores unknown input keys (drift) ⇒ the builder must accept/validate it. Custom lines keep the normal `pos.sale.priceOverride` rule. `listHeldCarts` hides every row with `tableSessionId` set. Refusal order for a table draft: scope (`TABLE_NOT_FOUND` for a foreign/other-unit session) → shape (`couponCode`/`memberChoices`/`billDiscount` ⇒ `VALIDATION`) → session not OPEN ⇒ `TABLE_SESSION_CLOSED`. Refused holds write nothing.
7. **Permissions (CD8).** `registerTables` = `pos.sale.create` **or** `pos.sale.read` at the unit (STAFFR reads the floor) · open/seat/reservations = `restaurant.session.open` · send = `restaurant.order.create` · close = `restaurant.session.close` (STAFF lacks it ⇒ `PERMISSION_DENIED`) · clear = `restaurant.table.setStatus` · requests = `restaurant.request.ack|done` · cancel item = `restaurant.order.cancelItem`. Paying = normal register rules. Refusal code `PERMISSION_DENIED`; no restaurant permission key is added.
8. **Close of an empty session with a draft (R9 · V4).** Session with no non-cancelled items ⇒ `{ok:true, status:"CANCELLED"}` and its HELD draft becomes `DISCARDED` (audit `pos.heldCart.discard` recommended, not pinned).
9. **One-tx proof (P1).** After a table bill the claimed items, the `TableSession` row (CLOSED) and the bill's `PosSaleLine` rows share one `xmin`. Nothing may update those rows after commit before the oracle reads them (post-commit work = `consumeSaleInventory` + drain only).
10. **P3 outbox delta.** "0 extra rows" = tenant OutboxEvent rows created since the race whose payload does **not** contain the winner's saleId. A consumer emitting follow-on events without the saleId during a floating drain would give a false red — rerun before judging.
11. **Pins that may need ORACLE-EDIT after P2.2/P2.3 S merge.** `pos-sale-contract.json` sha (`eaced8dc…08eed`, same pin as P2.3 ST4) · L3 signature table of `restaurant/{table,order,menu,kds,storefront,scope}.ts` · L2 call-site table. If P2.2/P2.3 S legitimately change any of them, the controller re-pins; the P2.4 builder must not touch them.
12. **Owner-pending lines (ST3).** `ledger/POS-OWNER-PENDING.md` needs lines containing `P2.4` that mention (a) `RestaurantReservation` or `dirtySince` (restaurant-owner schema note), (b) `one_open_session_per_table` (P6.1 CONCURRENTLY after a duplicate count), (c) the legacy `checkout` race (word `checkout` + race/แข่ง/พร้อมกัน/claim/ยึด). Wording otherwise free; the controller may write them.
13. **ST4 is PAR.** Contract sha, BOOKING facts `tableReservationsOnMap/callQueueFromTable = false "P2.4"` (queue strip PLANNED), "use server" async-only and "no new outbox event" are green on 6dbcafe0 and must stay green.

## Drift (brief vs code at 6dbcafe0)
- No `restaurant/index.ts`; fitness F2 has `restaurant→pos` but no `pos→restaurant` (`fitness.mts:238–251`).
- `openSession` (`restaurant/table.ts:166–200`) has no lock; its P2002 fallback cannot fire (no partial unique) ⇒ T2's legacy half may show > 1 OPEN session on base.
- `RestaurantOrderItem.productId` is never written (`order.ts:201–217`) ⇒ D6 red on base.
- `holdRegisterCart` ignores unknown input keys ⇒ on base `tableSessionId` is dropped and a normal held cart is created (D1/D2/D5 show it; refusals do not happen).
- `regParseCart` rejects unknown keys ⇒ on base every quote/submit with `tableSessionId` = `VALIDATION`.
- Items created in one tx share `createdAt`; `billPreview`/`checkout` order by `createdAt` only — oracle compares by name/sets.
- Legacy checkout: service charge = `Math.floor` of `RestaurantSetting.serviceChargeBps` as a sale line "Service charge 10%" (`order.ts:410–412`); `PosSale.channelCode` = STORE, `shiftId`/`soldByUserId` null; key `rest-<sha40>` then `-r1` after void — L1 pins all of it.
- `voidSaleByActor` refuses non-POS sales (`bills.ts:599`) ⇒ a table bill must be `sourceModule "POS"` for V1.
- `refundSale` validates `Σ payMethods` = server refund total; `PAYMENT_MISMATCH` message carries the expected total (`refund.ts:455`) — V3 probes with 0 and reuses the number (probe writes nothing).
- `storefront.resolveTableSession` opens sessions with `openedByUserId` null (QR guest) — B4 uses it for QR_TABLE.
- Legacy `checkout` with a session member whose tier gives a discount fails with `PAYMENT_MISMATCH` (createSale applies the tier discount, checkout pays the undiscounted total) — out of scope (R11 freeze); the A5 fixture links the member **after** its partial legacy checkout. Candidate restaurant-owner line.
- Register quote already returns `channel` (P2.1) for non-display quotes; `RegisterQuoteLine` has no `qty` (oracle uses `grossSatang`).

## Names table (exactly as the oracle calls them — builder S must match)
| # | name | shape / where |
|---|---|---|
| 1 | `PosHeldCart.tableSessionId` | `String?` (no FK required) |
| 2 | `RestaurantTable.dirtySince` | `DateTime?`, no default (null = clean) |
| 3 | `enum RestReservationStatus` | `BOOKED SEATED CANCELLED NO_SHOW` |
| 4 | `model RestaurantReservation` | required: `id String @id · tenantId String · unitId String · tableId String? · name String · phone String? · partySize Int · at DateTime · holdFromMinutes Int @default(15) · status RestReservationStatus @default(BOOKED) · createdAt DateTime @default(now()) · updatedAt DateTime @updatedAt` · extras only optional/defaulted/list (e.g. `sessionId String?`, `createdByUserId String?`, `note String?`) · `@@index([tenantId])` |
| 5 | unchanged models | `TableSession` (extra list relations `PosHeldCart[]`/`RestaurantReservation[]` allowed) · `RestaurantOrderItem` exact |
| 6 | migration | one dir **`20261206100000_pos_p24_tables`**: `SET/RESET lock_timeout` · `ALTER TABLE "PosHeldCart" ADD COLUMN [IF NOT EXISTS] "tableSessionId" TEXT` · `CREATE UNIQUE INDEX [IF NOT EXISTS] "PosHeldCart_tableSessionId_held_key" ON "PosHeldCart"("tableSessionId") WHERE "status" = 'HELD' AND "tableSessionId" IS NOT NULL` · `ALTER TABLE "RestaurantTable" ADD COLUMN [IF NOT EXISTS] "dirtySince" TIMESTAMP(3)` · `CREATE TYPE "RestReservationStatus" AS ENUM (…4…)` (bare or in `DO $$ … EXCEPTION WHEN duplicate_object …`) · `CREATE TABLE [IF NOT EXISTS] "RestaurantReservation" (… "holdFromMinutes" INTEGER NOT NULL DEFAULT 15 · "status" "RestReservationStatus" NOT NULL DEFAULT 'BOOKED' …)` · indexes / `ADD CONSTRAINT` on RestaurantReservation only · nothing else (no `one_open_session_per_table`, DROP, UPDATE, DELETE, INSERT, RENAME, ALTER COLUMN, ADD VALUE, CONCURRENTLY). A sample that passes ST1 is in "Positive controls" below. |
| 7 | registrations | `core/scope.ts` `RestaurantReservation: unit` · `pos-qc-env` `POS_MODELS.restaurantReservation {model: "RestaurantReservation", …}` |
| 8 | refusal codes | `TABLE_NOT_FOUND TABLE_INACTIVE TABLE_SESSION_CLOSED TABLE_EMPTY TABLE_ITEMS_CHANGED TABLE_HAS_UNPAID` in `RegisterRefusalCode` + `REG_MESSAGE` (th) · `refusalMessageKey` → `errors.tableNotFound errors.tableInactive errors.tableSessionClosed errors.tableEmpty errors.tableItemsChanged errors.tableHasUnpaid` · `src/messages/{th,en}/pos.json` `register.errors.<those>` (th Thai, en no Thai) + a non-empty top-level **`tables.*`** block (same key set th/en) |
| 9 | register keys | `REG_QUOTE_KEYS` + `"tableSessionId"` · `REG_SUBMIT_KEYS` + `"expectedTableItemsHash"` (+ `tableSessionId` via quote keys) · with `tableSessionId`, `lines` must be `[]` (else `VALIDATION`) |
| 10 | quote result | normal `RegisterQuoteTotals` + **`table: {sessionId, tableName, itemIds: string[], itemsHash: string}`** · lines from unpaid non-cancelled items: `productId` (item.productId ?? MenuItem.posProductId), `unitPriceSatang = unitPrice + optionsTotal` (snapshot), `grossSatang`, `options[].choiceId/priceDeltaSatang` from `RestaurantOrderItemOption` · member = cart `memberId` ?? `session.memberId` · channel `QR_TABLE` when `openedByUserId` null else `STORE` · service charge = POS settings (half-up) · empty ⇒ `TABLE_EMPTY` · foreign/other unit/unknown ⇒ `TABLE_NOT_FOUND` |
| 11 | submit | `submitRegisterSale(ctx, actor, {lines: [], tableSessionId, expectedTableItemsHash, idempotencyKey, expectedGrandTotalSatang, payMethods, cashReceivedSatang, …})` · key lookup first (replay ⇒ `{ok:true, saleId, duplicated:true}`) · hash mismatch / claim count ≠ n ⇒ `TABLE_ITEMS_CHANGED` (nothing written) · ONE tx: claim (facade) → `regCreateSale(…, tx)` (`sourceModule "POS"`, `sourceId` = session, shift/device/soldBy as today) → if nothing unpaid and no HELD draft: session CLOSED + `dirtySince = now()` · one sale line per RestaurantOrderItem (no merging; PRODUCT lines carry `itemId` when tracked) · after paid: new key ⇒ `TABLE_EMPTY` (or `TABLE_SESSION_CLOSED`/`TABLE_ITEMS_CHANGED`), no sale |
| 12 | `restaurant/order.ts` + `restaurant/index.ts` | `createOrderInTx(tx, input)` — DINE_IN round from the send (lines `{productId, menuItemId?, qty, choiceIds, note, unitPrice, optionsTotal}`); MENU rows keep MenuItem stock/86/station; non-MENU rows `menuItemId null`, `stationId = PosProduct.stationId ?? first station (sortOrder, createdAt)`; legacy `createOrder` = thin wrapper that also writes `productId = MenuItem.posProductId`; `index.ts` carries `// POS P2.4 ▸ … ◂` · `restaurant/table.ts` `openSession` takes `pg_advisory_xact_lock` (Q9) |
| 13 | `pos/table.ts` | `registerTables(ctx, actor)` → `{ok:true, zones:[{id,name,…}], tables: Card[], summary:{used,total,guests,avgMinutes,unpaidSatang}}` · `registerOpenTable(ctx, actor, {tableId, guestCount?, memberId?})` → `{ok:true, sessionId, created, reservationOverridden?}` (session `guestCount` = input, `openedByUserId` = actor.userId) · `registerSendTableRound(ctx, actor, {tableSessionId, heldCartId})` → `{ok:true, orderId, dailyNo, itemIds}` (order DINE_IN **CONFIRMED**, `placedByUserId` = actor.userId; item `note` from the draft line; draft claim HELD→RECALLED one winner; replay `ALREADY_RECALLED`; stock/86 ⇒ `PRODUCT_UNAVAILABLE` + `lineIndex`; bad options ⇒ `OPTIONS_INVALID`) · `registerCloseTable(ctx, actor, {tableSessionId})` → `{ok:true, status:"CLOSED"|"CANCELLED"}` / `TABLE_HAS_UNPAID` · `registerClearTable(ctx, actor, {tableId})` → `{ok:true}` · `registerCreateReservation` / `registerSeatReservation` / `registerCancelReservation` (CD 5) · `registerTableRequests(ctx, actor)` → `{ok:true, requests:[{id, type, sessionId, …}]}` · `registerAckTableRequest(ctx, actor, {requestId})` / `registerDoneTableRequest(ctx, actor, {requestId})` → `{ok:true}` · `registerCancelTableItem(ctx, actor, {itemId, reason})` (export pinned, behaviour = `cancelOrderItem` rules, not exercised) · Card keys: `id name zoneId seats state sessionId guestCount openedAt unpaidSatang unsentCount readyCount member openedByStaff flags dirtySince reservation` |
| 14 | `pos/table-shared.ts` (pure, client-safe: no prisma/db/server modules, no `node:`/`crypto`) | `TABLE_STATES = ["INACTIVE","BILL_REQUESTED","DINING","NEEDS_CLEARING","RESERVED","FREE"]` · `tableStateOf({inactive, billRequested, open, dirty, reserved})` → first true in that order else FREE · `reservationHolds(atMs, holdFromMinutes, nowMs)` → `atMs − hold·60 000 ≤ nowMs ≤ atMs + 30·60 000` · `RESERVATION_HOLD_DEFAULT_MINUTES = 15` · `RESERVATION_LATE_MINUTES = 30` · `tableItemsHash(itemIds)` → non-empty string, order-independent, differs for different sets, no input mutation |
| 15 | `pos/table-actions.ts` | `"use server"` first line · exports only `async function`s · calls every function of row 13 · each action has `catch` (action names free) |
| 16 | held carts | `holdRegisterCart(ctx, actor, {cart, tableSessionId})` (CD 6) · ≤ 1 HELD per session (partial unique) · second hold = same row, `version + 1` · `listHeldCarts` excludes table drafts |
| 17 | void consumer | `outbox-consumers.ts` `"pos.sale.voided"` entry gains one block marked `// POS P2.4 ▸ … ◂` (within ±8 lines) that calls the table logic via `import("@/lib/modules/restaurant")` or `import("@/lib/modules/pos/table")` — never a direct Prisma/SQL write (CD 4) |
| 18 | fitness | exactly one `"pos→restaurant",` line inside `ALLOWED_EDGES`, marked `// POS P2.4 ▸ … ◂` |
| 19 | unchanged | `pos-sale-contract.json` · `createSale` call sites (L2) · restaurant export signatures (L3) · BOOKING facts · no new outbox event type |

## Positive controls (scratch only, not committed)
A copy of the tree with the sample migration below + schema edits (`PosHeldCart.tableSessionId String?`, `RestaurantTable.dirtySince DateTime?`, enum + model as row 4 with extras `sessionId String?`, `createdByUserId String?`, `@@index([unitId, at])`) and a reference `table-shared.ts` turns **ST1 and ST5 green** (`--no-db`), so the static parsers accept a correct build.
```sql
SET lock_timeout = '3s';
ALTER TABLE "PosHeldCart" ADD COLUMN IF NOT EXISTS "tableSessionId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "PosHeldCart_tableSessionId_held_key" ON "PosHeldCart"("tableSessionId") WHERE "status" = 'HELD' AND "tableSessionId" IS NOT NULL;
ALTER TABLE "RestaurantTable" ADD COLUMN IF NOT EXISTS "dirtySince" TIMESTAMP(3);
DO $$ BEGIN CREATE TYPE "RestReservationStatus" AS ENUM ('BOOKED', 'SEATED', 'CANCELLED', 'NO_SHOW'); EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE TABLE IF NOT EXISTS "RestaurantReservation" ("id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "unitId" TEXT NOT NULL, "tableId" TEXT, "name" TEXT NOT NULL, "phone" TEXT, "partySize" INTEGER NOT NULL, "at" TIMESTAMP(3) NOT NULL, "holdFromMinutes" INTEGER NOT NULL DEFAULT 15, "status" "RestReservationStatus" NOT NULL DEFAULT 'BOOKED', "sessionId" TEXT, "createdByUserId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "RestaurantReservation_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "RestaurantReservation_tenantId_idx" ON "RestaurantReservation"("tenantId");
CREATE INDEX IF NOT EXISTS "RestaurantReservation_unitId_at_idx" ON "RestaurantReservation"("unitId", "at");
RESET lock_timeout;
```

## Expected red on 6dbcafe0 (forced run, QC4 `ep-frosty-lab-aoylqlv8-pooler…`, 9 Oct ~23:3xZ)
`QC_FORCE=1` → **6/43 green: ST4 L1 L2 L3 (PAR 4/4) + Z1 Z2**; residue 0 (323 tables, Tenant 0, users 0); no harness crash; exit 1.
- ST1–ST3: columns/enum/model/migration · scope/POS_MODELS · 6 codes · quote/submit keys · `tables.*` + `register.errors.table*` messages · `restaurant/index.ts` · `pos/table*.ts` · fitness edge · advisory lock · consumer marker · owner lines all missing. ST5: `table-shared.ts` missing; `refusalMessageKey(TABLE_*)` = `errors.unknown`.
- T1–T6, V4, R1–R3: `MISSING:registerTables/registerOpenTable/registerClearTable/registerCloseTable/register*Reservation/registerTableRequests…` (T2's legacy half: 10 parallel `openSession` gave 1 session on this run — the race is timing-dependent).
- D1/D2: `tableSessionId` silently dropped ⇒ normal held carts (new id on re-hold, draft listed, coupon/billDiscount/foreign/closed sessions all accepted, 5 extra rows). D3–D5: `MISSING:registerSendTableRound`. D6: legacy `createOrder` writes `productId null`.
- B1–B6, P1–P4, P6: every quote/submit with `tableSessionId` = `VALIDATION` (unknown key). P5 P7 P8 V1 V3: no table bill. V2: no voided event of a table bill (L1 replay part already holds).

## `--list`
```
qc-pos-p2.4 — 43 ข้อ (id · X · หัวข้อ)	
P2.4-ST1	S
P2.4-ST2	S
P2.4-ST3	S
P2.4-ST4	PAR
P2.4-ST5	P
P2.4-T1	-
P2.4-T2	X1
P2.4-T3	X2
P2.4-T4	X5
P2.4-T5	X3
P2.4-T6	-
P2.4-D1	X1
P2.4-D2	X5
P2.4-D3	-
P2.4-D4	X1
P2.4-D5	X5
P2.4-D6	-
P2.4-B1	X4
P2.4-B2	X2
P2.4-B3	X4
P2.4-B4	X4
P2.4-B5	X5
P2.4-B6	-
P2.4-P1	X4
P2.4-P2	X1
P2.4-P3	X1
P2.4-P4	X5
P2.4-P5	X4
P2.4-P6	-
P2.4-P7	X4
P2.4-P8	X4
P2.4-V1	-
P2.4-V2	X1
P2.4-V3	X5
P2.4-V4	X3
P2.4-R1	-
P2.4-R2	-
P2.4-R3	X2
P2.4-L1	PAR
P2.4-L2	PAR
P2.4-L3	PAR
P2.4-Z1	-
P2.4-Z2	-
X-coverage: S=3 PAR=4 P=1 -=11 X1=6 X2=3 X5=6 X3=2 X4=7	
```

## Commands
- `pnpm exec tsx scripts/qc-pos-p2.4.mts --list` · `… --no-db` (7 checks; on base 3/7: ST4 L2 L3 green, exit 1)
- DB: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p2.4.mts` (drop `QC_FORCE=1` after build: the SKIP gate opens when every file/export/column/delegate exists)
- Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` · single-file `tsc -p <scratch>/tsconfig.p24.json` → exit 0
- Runs at commit: `--list` 43 ids · `--no-db` 3/7 · forced QC4 ×2 (second after moving the A5 member link) 6/43, PAR 4/4, residue 0
