# POS P2.4 S — โหมดโต๊ะใน POS (floor · open/seat/send/close/clear · table bill through register quote/submit) · builder notes

Builder S · VPS (account B) · 10 Oct 2026 · tree `/root/projects/shark-pos-c` · branch `wip/pos-p2.4` from `session/pos` **160299e4** (P2.3 S merged).
Merged `origin/session/pos` **a45ab6d9** (P2.2U merged · ledger) after steps 1–6 were committed and before the final gates — no conflicts (`pos.json` auto-merged; see deviation 1).
Contract: `ledger/pos-briefs/pos-brief-P2.4.md` §2 R1–R12 · §3 · §9 (Q1–Q10, CD1–CD8, build order) · prompt `pos-prompt-accountB-P2.4-S.md` rulings 1–16 · oracle `scripts/qc-pos-p2.4.mts` (43 checks · **not edited** — two ORACLE-EDIT proposals below for the controller).
Red-before (base 160299e4, forced, QC4): **6/43** (ST4 L1 L2 L3 Z1 Z2 · PAR 4/4) · residue 0 · exit 1 — same as the oracle notes (`runs/red-before-forced.log`).

## Migration (QC4 only · ruling 15)
`prisma/migrations/20261206100000_pos_p24_tables/migration.sql` — hand-written exactly per names-table row 6 (checked against `prisma migrate diff --from-schema <160299e4 prisma/schema> --to-schema prisma/schema --script`: same columns/enum/table/indexes + the hand-written partial unique):
```sql
SET lock_timeout = '3s';
ALTER TABLE "PosHeldCart" ADD COLUMN IF NOT EXISTS "tableSessionId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "PosHeldCart_tableSessionId_held_key" ON "PosHeldCart"("tableSessionId") WHERE "status" = 'HELD' AND "tableSessionId" IS NOT NULL;
ALTER TABLE "RestaurantTable" ADD COLUMN IF NOT EXISTS "dirtySince" TIMESTAMP(3);
DO $$ BEGIN CREATE TYPE "RestReservationStatus" AS ENUM ('BOOKED', 'SEATED', 'CANCELLED', 'NO_SHOW'); EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE TABLE IF NOT EXISTS "RestaurantReservation" ("id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "unitId" TEXT NOT NULL, "tableId" TEXT, "name" TEXT NOT NULL,
  "phone" TEXT, "partySize" INTEGER NOT NULL, "at" TIMESTAMP(3) NOT NULL, "holdFromMinutes" INTEGER NOT NULL DEFAULT 15,
  "status" "RestReservationStatus" NOT NULL DEFAULT 'BOOKED', "sessionId" TEXT, "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "RestaurantReservation_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "RestaurantReservation_tenantId_idx" ON "RestaurantReservation"("tenantId");
CREATE INDEX IF NOT EXISTS "RestaurantReservation_unitId_at_idx" ON "RestaurantReservation"("unitId", "at");
RESET lock_timeout;
```
No `one_open_session_per_table`, no FK, no backfill (dirtySince null = clean). Deploy (`bash scripts/iso.sh bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec prisma migrate deploy`, 10 Oct 03:30Z · `runs/migrate-deploy.log`):
```
Datasource "db": PostgreSQL database "neondb", schema "public" at "ep-frosty-lab-aoylqlv8.c-2.ap-southeast-1.aws.neon.tech"
167 migrations found in prisma/migrations
Applying migration `20261206100000_pos_p24_tables`
All migrations have been successfully applied.   (exit 0)
```
No unknown applied migration was reported (P2.8's `20261207100000_pos_p28_orders` was not on QC4 yet at 03:30Z). QC5 not touched. `pnpm exec prisma generate` in tree c (own node_modules).

## Steps (commit per step · explicit paths)
Steps (1)–(6) were implemented in one pass against the oracle, then committed grouped by step (intermediate commits are not independently buildable — only the head is gated).
| step | commit | content | oracle |
|---|---|---|---|
| red-before | 160299e4 | — | forced 6/43 (PAR 4/4) · exit 1 |
| 1 | f2e264b2 | schema (`PosHeldCart.tableSessionId` · `RestaurantTable.dirtySince` · enum + `RestaurantReservation`) · migration · `core/scope.ts` + `restaurant/scope.ts` · `POS_MODELS.restaurantReservation` · fitness edge `pos→restaurant` · `pos/table-shared.ts` · facade `restaurant/index.ts` + `restaurant/pos-tables.ts` + `restaurant/reservation.ts` · `restaurant/order.ts` (`writeOrderTx` shared writer · `createOrderInTx` · legacy `createOrder` writes `productId`) · `restaurant/table.ts` (`openSession` advisory lock · `openTableSessionInTx`) | `--no-db` 6/7 (ST3 = oracle parser, see ORACLE-EDIT 1) |
| 2–5 | 3313ff32 | `pos/table.ts` (floor/detail · open/link member · send round · close/clear/cancel item · reservations · requests · `tableSaleVoided`) · `held-cart.ts` table drafts · `register.ts` quote/submit `tableSessionId` + claim tx · `register-shared.ts` 6 codes/types · `register-member.ts registerMemberBriefs` · `outbox-consumers.ts` void step | forced 40/43 → 41/43 after the one-xid fix (deviation 3) |
| 6 | 4d68a023 | `table-actions.ts` · `pos.tables.*` + `register.errors.table*` th/en · `POS-OWNER-PENDING.md` P2.4 lines | 41/43 |
| merge | b49c9856 | `origin/session/pos` a45ab6d9 | — |
| 6b | d55c9eba | P2.4U inputs: `registerTables.serviceCharge {posBp, restaurantBp, differs}` (Q3 warning) · `registerTableMode` + `registerTableModeAction` (Q5) | 41/43 (+ scratch positive control 43/43) |

## ORACLE-EDIT proposals (controller rules · oracle NOT edited · `runs/p24-oracle-edit-forced-{1,2}.log`)
Both checks are red on this head **only** because of oracle bugs that are also present on the base; a scratch copy of the oracle with exactly these two edits (plus an absolute import path for `pos-qc-env` so the copy runs from the scratchpad) gives **43/43, PAR 4/4, residue 0, exit 0** on the implementation.
1. **ST3 — `"pos→restaurant"` "not in ALLOWED_EDGES".** `constBody(stripComments(fit), "const ALLOWED_EDGES")` returns `""`: `stripComments` treats the string literal `"/*"` inside fitness F1.3 (`!l.trim().startsWith("/*")`, line ~200 of `scripts/fitness.mts`, base content) as a block-comment opener and swallows everything up to the next `*/` (≈ line 645) — `const ALLOWED_EDGES` disappears. Measured: base file → `""`; current file → `""`. Proposal: strip line comments only for this sub-check — `constBody(fit.replace(/(^|[^:"'\`\\])\/\/.*$/gm, "$1"), "const ALLOWED_EDGES")` (current tree → contains the edge = true; base → false = negative control). The other ST3 sub-checks (single marked line, marker) already pass.
2. **V3 — refund probe.** The probe `refundSale(…, payMethods: [{CASH, 0}])` is refused at parse (`refund.ts:158` — amount < 1 ⇒ `VALIDATION "ยอดคืนต้องเป็นจำนวนเต็มสตางค์มากกว่า 0"`, unchanged since P1.8/P2.1, before 6dbcafe0), so it never reaches the Σ check whose `PAYMENT_MISMATCH` message carries the expected total (`refund.ts:455`) ⇒ `amt = NaN` ⇒ red. Proposal: probe with 1 satang (`input(1)`) — the real refund then runs and V3 checks what it was written for (table data unchanged after a ⅓ refund) — green.

## Facade surface (`restaurant/index.ts` · ruling 1)
Pinned: `createOrderInTx(tx, {tenantId, unitId, sessionId, placedByUserId, lines:[{productId, menuItemId?, name, qty, choiceIds, options?, note?, unitPrice, optionsTotal, stationId?}]}) → {ok, id, dailyNo, itemIds}` — throws `OrderInTxError {err: OrderError, lineIndex}` (caller's tx must roll back — stock already decremented for earlier lines). Builder's choice (all re-exported inside `// POS P2.4 ▸ … ◂`): `openTableSessionInTx` (table.ts · same advisory lock as `openSession`) · `pos-tables.ts`: `tableFloorForPos`, `tableSessionForPos`, `tableUnpaidItemsForPos`, `tableItemIdsOfSale`, `tableDetailForPos`, `claimTableItemsInTx` (SELECT … FOR UPDATE OF item), `settleTableItemsInTx`, `unlinkTableSaleInTx`, `closeTableSessionInTx` (session row FOR UPDATE), `clearTableForPos`, `setTableSessionMemberForPos`, `tableRequestsForPos`, `setTableRequestStatusForPos`, `tableItemExistsForPos`, `tableCountForPos` · `reservation.ts`: `createReservationForPos`, `reservationForPos` (forUpdate), `markReservationSeatedInTx`, `cancelReservationForPos`, `bookedReservationsOfTable` · plus `cancelOrderItem` (legacy, unchanged). `modules/pos/**` reaches them only via `import("@/lib/modules/restaurant")` (register.ts · held-cart.ts · table.ts); `outbox-consumers.ts` via `import("@/lib/modules/pos/table")`.

## Deviations / decisions (numbered)
1. **One-pass build, step-grouped commits; merge after the code commits.** Ruling 16 asks for `git merge origin/session/pos` before step 3; at that point `origin/session/pos` had only ledger prompts (0506d25a). The real upstream change (P2.2U, a45ab6d9) landed later and was merged after the step commits and **before all final gates** — no conflicts, no register/held-cart/restaurant file touched upstream.
2. **No ORACLE-EDIT applied** — ST3 + V3 are red for the two oracle bugs above (proposals + positive control). Final unmodified oracle: **41/43** forced ×2 + unforced, PAR 4/4, residue 0.
3. **One-xid table bill (CONTROLLER-DECISION 9) needed `regCallerTx`.** Prisma 7 interactive-tx clients expose `$transaction` (nested = SAVEPOINT) ⇒ `createSale(input, tx)` takes its "owns the tx" path: sale rows are written under a savepoint (sub-xid ≠ items/session xid — first run: items/session xmin 5357728, sale lines 5357729) and its post-commit work (`consumeSaleInventory`, `scheduleDrain`) runs **before the outer commit**. `regSubmitTable` passes `createSale` a proxy of `tx` that hides `$transaction` ⇒ createSale runs directly in the caller's tx as `service.ts` intends ("ถูกเรียกใน tx ผู้อื่น") and the post-commit work runs once after commit in `regSubmitTable`. Same latent behaviour exists on the P1.7 intents path (`regSubmitWithIntents`) — harmless today (early consume sees no committed lines) but **not changed here** (follow-up F1).
4. **Claim = lock first.** `claimTableItemsInTx` locks the quoted items `FOR UPDATE` before `createSale`; a parallel payer blocks, re-evaluates (`saleId` now set) and gets fewer rows ⇒ `TABLE_ITEMS_CHANGED` + rollback before any sale/receipt number/event is written (P3: Δ PosSale/PosPayment/seq = +1). Settle then writes `saleId/settledAt`, and closes the session + sets `dirtySince` only if nothing unpaid remains **and** no HELD draft exists (P6).
5. **Hash/order (CONTROLLER-DECISION 3).** `tableItemsHash` = two 32-bit FNV-style hashes over sorted unique ids + count (pure, no `crypto` — client-safe). Submit: session lookup (TABLE_NOT_FOUND) → effective member (cart ?? session) + table channel → ① key replay → token/device/shift/pay settings → session OPEN (TABLE_SESSION_CLOSED) → unpaid items (TABLE_EMPTY) → hash ≠ expected (TABLE_ITEMS_CHANGED) → price → PRICE_CHANGED/PAYMENT_MISMATCH → tx. Replay compares the hash of the items linked to the stored sale with `expectedTableItemsHash` (+ sourceId = session) instead of `regLinesEqual` (P2 `duplicated:true`).
6. **Table bill lines.** One sale line per RestaurantOrderItem; price = snapshot `unitPrice + optionsTotal` (never re-priced · CD3); no `priceSource` on table lines (layer unknown at bill time — key omitted on quote line and sale line, createSale stores null); options copied when the choice still has a group (deleted choices are appended to the line name; price already in the unit price); `itemId`/`components` from the **current** PosProduct with the register's rules (C2 track-stock · P2.3 recipe + chosen options). A product no longer visible at the unit bills **without** stock cut instead of refusing (the food was already served) — recorded as follow-up F3. No availability/variant/option checks at bill time. > 200 unpaid items ⇒ TOO_MANY_LINES (split bill = P2.5).
7. **Draft (held cart) shape (CONTROLLER-DECISION 6).** `tableSessionId` is a sibling of `cart`; refusal order scope (TABLE_NOT_FOUND) → shape → TABLE_SESSION_CLOSED. Besides couponCode/memberChoices/billDiscount the draft also refuses `memberId`, `channelId`, line `discount`, weighed lines (VALIDATION — member/discounts belong to the bill; channel comes from the table). Line notes **are kept** (they go to the kitchen); the stored cart is the canonical cart + notes. Approx total is quoted on the table's channel. Re-hold = same row (`version + 1`, P2002 race ⇒ update the winner). Table drafts are excluded from the drawer list **and** from the drawer's lazy expiry. Other unknown input keys of `holdRegisterCart` are still ignored (P1.5 drift, unchanged). `tableSessionId` inside `cart` ⇒ VALIDATION (`registerCanonicalCart`).
8. **Send round.** Priced with the register resolver on the table's channel (`registerPriceTableRound` — same parse/price path as quote, PRODUCT_NOT_FOUND for recipe ingredients missing at the unit per ruling 14) outside the tx; then one tx: claim draft HELD→RECALLED **conditioned on the version that was priced** (a concurrent re-hold ⇒ re-read + re-price, ≤ 3 attempts) + `createOrderInTx`. MENU rows = MenuItem rules (86/options/stock/station/name/option snapshots from DB) with the POS price; other rows = `menuItemId null`, station = `PosProduct.stationId` if it is an active station of the unit else first station (`sortOrder, createdAt`; none ⇒ defaults created in the same tx like `ensureDefaultStations`).
9. **Legacy `createOrder`** = thin wrapper over the shared `writeOrderTx` (same statements in the same order; `productId = MenuItem.posProductId` rides the same INSERT — qc-pos-p1.1 S2.42 green). `resolveLines` takes a loader (legacy passes the same `tenantDb` query).
10. **Advisory lock** key `hashtext('restaurant-table:' || tableId)` in `openSession` and `openTableSessionInTx`; creating a session clears `dirtySince`. The QR door `storefront.resolveTableSession` does **not** take it (R11 freeze) — owner line (P6.1 unique index covers all doors).
11. **Void consumer (CONTROLLER-DECISION 4).** Acts only on `sourceModule "POS"` sales with a `sourceId` whose status is VOIDED; unlinks items of that sale in that session; reopens only if ≥ 1 item was unlinked, the session is CLOSED and the table has no other OPEN session; also clears `dirtySince`. Wired as a second **main** step next to the accounting bridge (both always run; either failing ⇒ event retry — both idempotent), not as a WARN-only extra.
12. **Close (CONTROLLER-DECISION 8).** Session row locked FOR UPDATE (a concurrent round insert waits); CLOSED (all paid) also sets `dirtySince`; CANCELLED (no live items) does not; HELD drafts ⇒ DISCARDED + audit `pos.heldCart.discard` (`via: "table_closed"`) in the same tx.
13. **Permissions (CONTROLLER-DECISION 7).** Base = register scope with `pos.sale.create` **or** `pos.sale.read` (`regScope` got an optional `perms` list — default unchanged) + the restaurant key of the action; send round requires `pos.sale.create` (it prices through the register). Member names on the floor use a read-only delegate (`registerMemberBriefs`, member.customer.read) so `pos.sale.read` users see them.
14. **Reservations.** Seat = lock reservation row → open through R3 (`guestCount = partySize`) → SEATED + sessionId in one tx; SEATED replay = same session; CANCELLED/NO_SHOW ⇒ VALIDATION; cancel of a CANCELLED one = ok. Override flag only when the open **created** the session and a BOOKED reservation holds now. Floor considers BOOKED reservations with `at ∈ [now−30 min, now+240 min]` then `reservationHolds`.
15. **F5.1 / F6.1 fitness.** New POS files import prisma via `pos/db.ts` (sanctioned pattern); `table-actions.ts` gate uses `assertCan` (create → read fallback).
16. **Facade read of `PosHeldCart`** from register.ts (draft count in the bill tx) and table.ts (via held-cart helpers) — writes stay in `held-cart.ts`.

## Foreign-module hunks (all marked `POS P2.4 ▸ … ◂`)
- `restaurant/order.ts`: `ResolvedLine.productId/menuItemId?` · `MENU_INCLUDE` + loader-based `resolveLines` (+ index) · `writeOrderTx` (shared) · `createOrderInTx` + `OrderInTxError` + types. Exports/signatures of 6dbcafe0 unchanged (L3 green).
- `restaurant/table.ts`: `openSession` lock + `openSessionCore` + `openTableSessionInTx` (signature unchanged).
- `restaurant/scope.ts` + `core/scope.ts`: `RestaurantReservation: unit`.
- New restaurant files: `index.ts`, `pos-tables.ts`, `reservation.ts`.
- `src/lib/outbox-consumers.ts`: one block on `"pos.sale.voided"` (lazy `import("@/lib/modules/pos/table")`).
- `scripts/fitness.mts`: one line `"pos→restaurant"` in ALLOWED_EDGES. `scripts/pos-qc-env.mts`: `POS_MODELS.restaurantReservation`.
- `src/messages/{th,en}/pos.json`: `register.errors.table*` (6) + top-level `tables.*` block (101 keys, same set th/en). `pos/register-member.ts`: `registerMemberBriefs`.
- Not touched: `pos/index.ts`, `pos-sale-contract.json`, createSale call sites (L2 18/15), BOOKING facts, P2.6 oracle.

## P2.4U contract (screen 03 · no JSX in S)
Actions (`src/lib/modules/pos/table-actions.ts`, all `{systemId, unitId, deviceId?}` + input; refusals = `{ok:false, code, message}` → `refusalMessageKey(code)` → `pos.register.errors.*`):
- **Tab (Q5):** `registerTableModeAction` → `{visible, tableCount, canCreateTables}` — "โต๊ะ" tab live when `visible`; page `/app/sys/[id]/pos/tables`.
- **Floor:** `registerTablesAction` → `zones[{id,name,sortOrder,tableCount}]` (zone tabs "ในร้าน (12)") · `tables: TableCard[]` (`table-shared.ts`) · `summary {used,total,guests,avgMinutes,unpaidSatang}` (strip "ใช้อยู่ 12 จาก 18 โต๊ะ · ลูกค้าในร้าน 35 คน · นั่งเฉลี่ย 48 นาที · ยอดบนโต๊ะตอนนี้ ฿…") · `reservationsToday` (pill) · `canCreateTables` (empty state CTA) · `serviceCharge {posBp, restaurantBp, differs}` (warning `tables.panel.serviceChargeDiffers`) · `serverTime`. Card: `state` ∈ `TABLE_STATES` (label `tables.state.*`, precedence INACTIVE > BILL_REQUESTED > DINING > NEEDS_CLEARING > RESERVED > FREE) · `guestCount` · `openedAt` (minutes) · `unpaidSatang` · `unsentCount` ("ยังไม่ส่งครัว N รายการ" + warning icon) · `readyCount` ("อาหารพร้อมเสิร์ฟ N") · `member {id,name,tier}` · `openedByStaff` (false = "ขอผ่าน QR") · `flags {callStaff, billRequested, payNotified}` · `dirtySince` ("ยังไม่เก็บ · N นาที" + "เก็บแล้ว") · `reservation {id,name,partySize,at,holdFromMinutes,phone}` ("จอง 19:00 · คุณอรทัย 6 คน · กันโต๊ะ 18:45"). Queue strip = PLANNED (`tables.queue.*`, facts stay false). Drag move/merge, split bill, print list = PLANNED buttons (P2.5/P2.6).
- **Panel:** `registerTableDetailAction({tableSessionId})` → `session` (status, tableName, guestCount, openedAt, openedByStaff/openedByUserId, member) · `rounds[{orderId, dailyNo, createdAt, byStaff, items[{name, qty, unitPriceSatang, optionsSatang, lineTotalSatang, options, note, kdsStatus, paid, productId}]}]` (KDS chip `tables.panel.kds.*`) · `draft {heldCartId, version, lineCount, approxTotalSatang, cart}` (draft → "มีรายการยังไม่ส่งครัว" warning on checkout) · `unpaidSatang`, `unpaidItemIds`, `itemsHash`.
- **Open / seat:** `registerOpenTableAction({tableId, guestCount?, memberId?})` → `{sessionId, created, reservationOverridden}` (toast `tables.reservation.overridden`). `registerLinkTableMemberAction({tableSessionId, memberId|null})` ("⋯ ผูกสมาชิก").
- **Order more / draft:** register catalogue bound to the table; save with `holdTableDraftAction({tableSessionId, cart:{lines}})` (full replace · lines = product/custom + `note`; no discounts/member/coupon/channel/weighed) → `heldCart.id`. Do **not** use the drawer's recall for table drafts (it would RECALL the draft) — edit from `detail.draft.cart` and re-hold.
- **Send:** `registerSendTableRoundAction({tableSessionId, heldCartId})` → `{orderId, dailyNo, itemIds}` · `PRODUCT_UNAVAILABLE`/`OPTIONS_INVALID` + `lineIndex` (draft stays HELD) · `ALREADY_RECALLED` (other device sent it).
- **Checkout:** existing `quoteRegisterCartAction({cart:{lines: [], tableSessionId, billDiscount?, memberId?, couponCode?, memberChoices?}})` → normal totals + `table {sessionId, tableName, itemIds, itemsHash}` (channel QR_TABLE/STORE from the table; service charge = POS settings) → existing pay dialog → `submitRegisterSaleAction({sale:{lines: [], tableSessionId, expectedTableItemsHash: quote.table.itemsHash, idempotencyKey, expectedGrandTotalSatang, payMethods, cashReceivedSatang, tipSatang?, note?, taxInvoice?, staffToken?, managerPin?/managerUserId?}})`. `TABLE_ITEMS_CHANGED` ⇒ re-quote (new round or another device paid) · `TABLE_EMPTY` · `TABLE_SESSION_CLOSED`. `heldCartId` and `channelId` are refused with a table. Discount over cap: manager PIN only (no approval hold for table bills).
- **Close / clear / cancel item:** `registerCloseTableAction` → `{status:"CLOSED"|"CANCELLED"}` · `TABLE_HAS_UNPAID` · `registerClearTableAction({tableId})` · `registerCancelTableItemAction({itemId, reason})` (legacy rules; message = Thai reason).
- **Reservations:** `registerCreateReservationAction({tableId?, name, phone?, partySize, at (ISO), holdFromMinutes?})` · `registerSeatReservationAction({reservationId, tableId?})` → `{sessionId}` · `registerCancelReservationAction`.
- **Alerts:** `registerTableRequestsAction` → `requests[{id, type, status, sessionId, tableId, tableName, note, createdAt, ackedAt}]` · `registerAckTableRequestAction` (flag stays) · `registerDoneTableRequestAction` (flag clears) · PAY_PROMPTPAY "ยืนยันรับเงิน" ⇒ checkout with PROMPTPAY.
- **X/Z + close-day info line (Q10):** `registerTablesAction().summary.used` + `.unpaidSatang` → `tables.summary.openTablesInfo` ("โต๊ะยังไม่ปิด N · ฿") — display only, never blocks.
- **Bill-type chip:** `tables.billType.*` ("บิลใหม่ · ซื้อกลับ ▾" → ทานที่ร้าน = pick table ⇒ cart becomes that table's draft via `holdTableDraftAction`).
- Messages: `pos.tables.*` (th/en, same 101 keys) + `pos.register.errors.table*`.

## Follow-ups
- F1 Prisma 7 nested-transaction behaviour of `createSale(…, tx)` on the P1.7 intents path (savepoint + early post-commit work) — apply `regCallerTx` there too (or detect tx clients in `service.ts`) in a separate WO with its own oracle.
- F2 Orphan table drafts: a session closed by the legacy checkout keeps its HELD draft (hidden, not expired). Sweep in P2.5 or when the legacy page is removed (P2.14).
- F3 Table bill line of a product no longer visible at the unit = billed without stock cut (deviation 6) — U could badge it; P2.5 may refuse instead.
- F4 `RestaurantOrderItem` has no price layer — table sale lines carry `priceSource null`; reports group them as unknown.
- F5 Floor member names need the member system on the unit; sessions with a member from another system show `name ""`.
- F6 qc-pos-p2.6 K5 is now unblocked (see gates).

## Gates (final · head d55c9eba · logs `scratchpad/p24/runs/gate-B-*.log`, each with `tree=… head=…` header)
| gate | result | exit |
|---|---|---|
| qc-pos-p2.4 forced #1 / #2 / unforced | 41/43 ×3 · PAR 4/4 · residue 0 · leaks 0 · red = ST3 + V3 (oracle bugs, ORACLE-EDIT 1–2) | 1 / 1 / 1 |
| qc-pos-p2.4 scratch copy with ORACLE-EDIT 1–2 only (positive control · `runs/p24-oracle-edit-forced-2.log`, head d55c9eba) | 43/43 · PAR 4/4 · residue 0 | 0 |
| qc-pos-p2.4 red-before (base 160299e4, forced) | 6/43 · PAR 4/4 | 1 |
| qc-pos-p2.4 --no-db | 6/7 (ST3) | 1 |
| qc-pos-p2.3 | 46/46 · PAR 2/2 | 0 |
| qc-pos-p2.2 | 42/42 | 0 |
| qc-pos-p2.1 | 55/55 | 0 |
| qc-pos-p1.3 | 128/128 | 0 |
| qc-pos-p1.5 | 21/21 | 0 |
| qc-pos-p1.6 (call-site registry unchanged) | 48/48 | 0 |
| qc-pos-p1.9 | 53/53 | 0 |
| qc-pos-p1.12 | 72/72 | 0 |
| qc-pos-p1.16 | 28/28 | 0 |
| qc-pos-p1.1 (extra: S2.41–S2.43 · createOrder statements 13/6 = base) | 178/178 | 0 |
| qc-restaurant · -money · -pay · -void | pass · 6/6 · 19/19 · 11/11 | 0 · 0 · 0 · 0 |
| qc-pos-account | 16/16 | 0 |
| qc-account-cpa | 107/107 | 0 |
| pnpm fitness (no env · QC4 env via qc4.sh) | 41/41 · 41/41 | 0 · 0 |
| scripts/fitness-pos.mts | pass | 0 |
| qc-pos-p2.6 --no-db | 4/13 — ST4 L1 L3 L4 green (unchanged; rest = P2.6 S not built) · `depP24: []` (was "restaurant/index.ts ยังไม่ export createOrderInTx") | 1 |
| qc-pos-p2.6 forced (DB) | 7/51 · PAR 5/5 · residue 0 — **K5 now runs and is red by reason** (P2.6 columns/PosAvailabilityMark/ticket board missing), no longer dependency-skipped | 1 |
| pnpm typecheck (iso · flock /tmp/pos-gate.lock) | 0 errors | 0 |
Batch A (head b49c9856, before the P2.4U-inputs commit) had identical results for every DB suite (`gate-A-*.log`).
