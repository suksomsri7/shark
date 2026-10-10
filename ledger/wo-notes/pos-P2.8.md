# POS P2.8 S — ออเดอร์ทุกช่องทาง (orders + adapters) · builder notes

Builder · account B · 10 Oct 2026 · tree `/root/projects/shark-pos-b` · branch `wip/pos-p2.8` from `session/pos` **160299e4** (gates63-b SUMMARY = DONE at start → waited **0 min** · tree clean, detached 09e2ca11).
Contract: `ledger/pos-briefs/pos-brief-P2.8.md` (§9 rulings 1–16) · `ledger/wo-notes/pos-P2.8-oracle.md` (names table · CD 1–24) · prompt rulings 24–27.
Merges of `origin/session/pos`: **eba43a32** (a45ab6d9 = P2.2U, clean, no conflicts). P2.4 S had not landed on `session/pos` at any merge point (fetched before step 3/5 and before final gates) ⇒ `qc-pos-p2.4` run as `--no-db` PAR.

## Progress
- [x] step 1 — migration + schema + order-shared + scope/env (`47532d29`)
- [x] steps 2–3 — `pos/order.ts` ingest + lifecycle + settings + sale/pay/void linkers + readers (`4f15c42f`)
- [x] step 4 — adapters + WEB mirror hunks + storefront dual-read + `backfillWebPrices` + dual-write (`075fbedd`)
- [x] step 5 — permissions + `order-actions.ts` (`70fc1693`)
- [x] step 6 — messages/facts/owner lines (`cb6a3149`) · ORACLE-ADD I9 (`11e6906e`) · ORACLE-EDITs p1.6 (`ce12d4ff`) · p1.18:317 (`83fd6554`) · p1.18:338 (`64fd53b8`) · rule alignment fix (`bb885d2e`)
- gates: see "Gates" (scratch run dir `runs/gates-20261010T040512Z`)

## Migration (QC4) — `prisma/migrations/20261207100000_pos_p28_orders/migration.sql`
Generated with `prisma migrate diff --from-schema <schema @160299e4> --to-schema prisma/schema --script` (no DB diff), then hand-edited: `CREATE TYPE` wrapped in `DO … EXCEPTION WHEN duplicate_object`, `IF NOT EXISTS` on tables/indexes, `SET lock_timeout = '3s'` … `RESET lock_timeout`. 3 enums · 3 tables (no FK) · 2 uniques · 1 index · nothing else (ST1 green).
```sql
SET lock_timeout = '3s';
DO $$ BEGIN CREATE TYPE "PosOrderStatus" AS ENUM ('NEW', 'ACCEPTED', 'PREPARING', 'READY', 'HANDED', 'REJECTED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PosOrderPaymentState" AS ENUM ('UNPAID', 'PAY_ON_PICKUP', 'PLATFORM_PAID', 'PAID', 'REFUNDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PosOrderFulfilment" AS ENUM ('PICKUP', 'DELIVERY', 'DINE_IN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS "PosOrder" ( "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "systemId" TEXT NOT NULL, "unitId" TEXT NOT NULL, "channelId" TEXT NOT NULL,
  "channelCode" TEXT NOT NULL, "adapter" "SalesChannelAdapter" NOT NULL, "externalRef" TEXT, "code" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL,
  "status" "PosOrderStatus" NOT NULL, "paymentState" "PosOrderPaymentState" NOT NULL, "fulfilment" "PosOrderFulfilment" NOT NULL, "customerName" TEXT NOT NULL,
  "customerPhone" TEXT, "memberId" TEXT, "partyId" TEXT, "address" TEXT, "note" TEXT, "chatConversationId" TEXT, "shopOrderId" TEXT, "totalSatang" INTEGER NOT NULL,
  "prepMinutes" INTEGER, "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "acceptedAt" TIMESTAMP(3), "readyAt" TIMESTAMP(3), "handedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3), "rejectReason" TEXT, "saleId" TEXT, "acceptedByUserId" TEXT, "createdByUserId" TEXT, "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PosOrder_pkey" PRIMARY KEY ("id") );
CREATE TABLE IF NOT EXISTS "PosOrderLine" ( "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "systemId" TEXT, "orderId" TEXT NOT NULL, "productId" TEXT, "name" TEXT NOT NULL,
  "qty" INTEGER NOT NULL, "unitPriceSatang" INTEGER NOT NULL, "listPriceSatang" INTEGER, "priceSource" "PosPriceSource", "priceRuleId" TEXT,
  "options" JSONB NOT NULL DEFAULT '[]', "note" TEXT, "lineTotalSatang" INTEGER NOT NULL, "sortOrder" INTEGER NOT NULL DEFAULT 0, CONSTRAINT "PosOrderLine_pkey" PRIMARY KEY ("id") );
CREATE TABLE IF NOT EXISTS "PosOrderEvent" ( "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "systemId" TEXT, "orderId" TEXT NOT NULL, "type" TEXT NOT NULL,
  "fromStatus" "PosOrderStatus", "toStatus" "PosOrderStatus" NOT NULL, "actorUserId" TEXT, "payload" JSONB, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PosOrderEvent_pkey" PRIMARY KEY ("id") );
CREATE INDEX IF NOT EXISTS "PosOrder_tenantId_unitId_status_receivedAt_idx" ON "PosOrder"("tenantId", "unitId", "status", "receivedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "PosOrder_tenantId_channelId_externalRef_key" ON "PosOrder"("tenantId", "channelId", "externalRef");
CREATE UNIQUE INDEX IF NOT EXISTS "PosOrder_tenantId_idempotencyKey_key" ON "PosOrder"("tenantId", "idempotencyKey");
RESET lock_timeout;
```
(Committed file = one column per line, Prisma layout.) Schema in its own file `prisma/schema/pos_order.prisma` (P2.4 S edits `pos.prisma` in parallel — fewer merge conflicts).
**Deploy** (`bash scripts/iso.sh bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec prisma migrate deploy`, 03:13Z, head 160299e4 + step-1 files) → host `ep-frosty-lab` · "167 migrations found" · "Applying migration `20261207100000_pos_p28_orders`" · "All migrations have been successfully applied." · **exit 0**. P2.4's `20261206100000_pos_p24_tables` was not yet applied on QC4 at that time (nothing to note/resolve). `pnpm exec prisma generate` in tree b (own node_modules) ok. QC5 not touched.

## What was built (names as the oracle calls them)
- `pos/order-shared.ts` (pure): `ORDER_STATUSES ORDER_PAYMENT_STATES ORDER_FULFILMENTS ORDER_REJECT_REASONS canTransition ORDER_ACCEPT_WINDOW_SEC acceptRemainingSec orderLateMinutes maskPhone parseIngestInput` + `parseChannelOrderSettings`, `orderLinesFingerprint`, `orderColumnOf`, `orderCode`, all result/card types, `OrderRefusalCode` (= `RegisterRefusalCode` + 5 new codes — see deviation 1).
- `pos/order.ts` (single writer of `PosOrder*`; writer of the 4 P2.8 columns of `SalesChannel`): the 14 functions of CD 1 + `afterCommit`, `onShopOrderPaid`, `onSaleVoided`, `webLineSources`; one `createSale(` inside `orderCreateSale`.
  - ingest: parse → channel (this unit · active · not archived; staff door refuses STORE/QR_TABLE/WEB builtins) → priced lines refused on the staff door → custom lines need `pos.sale.priceOverride` (+lineIndex) → replay check (`(channel, ref)` or key: same lines = `duplicated:true`, different = `IDEMPOTENCY_CONFLICT`, nothing written) → pause (WEB/CHAT/API only) → member/party/chat-conversation ids tenant-local → **prices/options/86/variants/not-sold via `quoteRegisterCart` on the order's channel** (same rules as the register — PRODUCT_UNAVAILABLE / CHANNEL_NOT_SOLD / OPTIONS_INVALID with lineIndex) → one tx: advisory locks ref → key → unit code counter, insert order (`OD-NNNN` per unit/day) + lines + `received` event + `pos.order.received`, then start-ACCEPTED (MANUAL default) or channel auto-accept (non-MANUAL, actor null) → accept in the same tx.
  - accept: `UPDATE … WHERE status=NEW AND version=v` → event + `pos.order.accepted` → PLATFORM payout ⇒ `createSale` in the same tx (PLATFORM single row = total, `posorder-<id>`, `channelRef = externalRef ?? code`, shift = accepting device's open shift else null, soldBy = accepter / null for auto, lines carry productId/options/priceSource/priceRuleId/listPrice + itemId (tracked PRODUCT, C2) + `components` = `expandRecipe` of the **current** recipe) → saleId written in the same tx (A2 xmin proof green). Sale refusal (e.g. BLOCK `STOCK_INSUFFICIENT`) ⇒ tx rolled back, order stays NEW with the same version. After commit: `consumeSaleInventory` + `scheduleDrain` (same post-commit pair as register.ts).
  - reject (NEW only, reason code + note) · markPreparing · markReady · handOver (DIRECT unpaid ⇒ `ORDER_UNPAID`) · setPrepMinutes · cancelOrder (ACCEPTED|PREPARING|READY; PAID POS sale ⇒ needs `pos.sale.void` and voids through `voidSaleByActor` — P1.15 approval rules apply, `PENDING_APPROVAL` returned with requestId and the order is not cancelled yet) · payOrder (DIRECT, ACCEPTED..READY, tenders = register types minus PLATFORM, Σ = total, CASH needs device + open shift, key stored in the `paid` event; same key = same sale `duplicated:true`, other key after payment = `ORDER_STATE_INVALID`).
  - readers: `listOrders` (today's orders by BKK day start or `since`, plus still-open orders of earlier days; counts/summary over that whole set; cards filtered by status/channelId; phone masked) · `getOrder` (card + lines/options/notes + `channelCommission` preview + history by phone → member → party at the unit + event log).
- `pos/order-adapters.ts`: `ORDER_ADAPTERS {MANUAL, WEB, CHAT}` no-op `{accept, reject, setReady, syncMenu, setAvailability, setStoreStatus}`.
- `pos/order-actions.ts` ("use server"): 12 actions, session → ctx/actor, `assertCan` gate per task (fitness F6.1), order.ts re-checks everything.
- `pos/index.ts`: `export const orders = {…14 + afterCommit, onShopOrderPaid, onSaleVoided, webLineSources}` · `catalog.webPricesForShop` · `export type * from "./order-shared"` · `ORDER_ADAPTERS`.
- `pos/catalog.ts` (marked block at the end): `syncWebPriceRow` (dual-write writer of `(WEB, null)` rows) · `webPricesForShop` (storefront dual-read) · `backfillWebPrices` (idempotent, conflicts counted) — not on the facade (F15.5 style).

## Foreign-module hunks (all marked `// POS P2.8 ▸ … ◂`)
- `src/lib/modules/shop/service.ts` (owner = web shop; owner line written): import `{ catalog as posCatalog, orders }` from `@/lib/modules/pos` · `listProducts(ctx, {activeOnly, storefront})` → storefront = effective web price · `createOrder`: snapshot = effective web price, `ShopOrderLine.posProductId` written, tx switched from `tenantDb(ctx).$transaction` to `prisma.$transaction` (the two existing writes already set tenantId/unitId explicitly; tenantDb would throw on the system-scoped POS tables) + `orders.ingestInTx` mirror (WEB channel of the shop unit, ref = SO code, key `web-<shopOrderId>`, UNPAID, PICKUP) — `CHANNEL_PAUSED` ⇒ throw "ร้านปิดรับออเดอร์ออนไลน์ชั่วคราว" (nothing written · ruling 12/prompt 12) · `PRODUCT_UNAVAILABLE` ⇒ throw "สินค้าบางรายการหมดชั่วคราว — เอาออกแล้วสั่งใหม่" · other pre-write refusals ⇒ log + shop order still created (ShopOrder is the source of truth, CD1) · `orders.afterCommit()` after commit · `confirmOrderPaid`: lines + `productId` (= posProductId) + `priceSource`/`priceRuleId`/`listPriceSatang` from the mirror lines (`orders.webLineSources`; no mirror = CHANNEL), **never itemId** · `cancelOrder`: one tx (`updateMany` with tenantId+unitId as tenantDb did) + `orders.sourceCancelledInTx`, `afterCommit` when changed.
- `src/app/(store)/s/[tenantSlug]/[unitSlug]/shop/page.tsx`: `listProducts(…, {activeOnly: true, storefront: true})` (one line).
- `src/lib/modules/pos/catalog-legacy.ts`: `createShopProduct`/`updateShopProduct` call `C.syncWebPriceRow` (dual-write) inside the existing tx.
- `src/lib/outbox-consumers.ts`: `pos.order.received|accepted|ready|completed|cancelled` = `withAutomation(async () => {})` · `pos.order.rejected` = `withAutomation(posOrderRejected)` → `shop/service.cancelOrder` at the composition root (WEB orders) · `shop.order.paid` + `pos.sale.voided` get `orders.onShopOrderPaid` / `orders.onSaleVoided` appended as compose extras (dynamic import of the POS facade).
- `src/lib/automation/labels.ts` (6 events) · `src/lib/core/permissions.ts` (2 keys) · `src/lib/core/scope.ts` (3× `sys()`) · `scripts/pos-qc-env.mts` · `src/lib/pos-integrations.ts` (`chatOrders` true) · `settings-overview.ts` (`onlineOrders` → `pos.order.accept`) · `src/messages/{th,en}/pos.json` (`orders.*` block, 5 `register.errors.*`, CHAT fact label) · `register-shared.ts` (5 REFUSAL_KEY entries only) · ledger wording `ExternalOrder` → `PosOrder` (POS-CONTRACTS rule 1 + C-7, DESIGN-POS:353, ruling 1).
- Untouched (ST6 PAR green): `register.ts`, `service.ts`, `channel.ts`, `pos-sale-contract.json`, `chat/**`.

## Deviations (numbered)
1. **`RegisterRefusalCode` not extended** — the 5 codes live in `OrderRefusalCode` (`order-shared.ts`) and `refusalMessageKey`/messages cover them. Reason: `register.ts:503 REG_MESSAGE: Record<RegisterRefusalCode, string>` is exhaustive ⇒ adding the codes to the union breaks `pnpm typecheck` unless `register.ts` is edited, which ruling 3 forbids (ST6 PAR). **⇒ ST2 red by this single item. ORACLE-EDIT proposal (controller rules):** ST2 accepts the 5 codes in `OrderRefusalCode` of `pos/order-shared.ts` (alternative: allow a marked 5-line `REG_MESSAGE` hunk in register.ts and relax ST6 for marked lines).
2. **I3 vs CD2** — I3's setup ingest `LM-48300` (no `startStatus`, MANUAL LINEMAN) is ACCEPTED by default (CD2 / brief R4, binding) and therefore creates a PLATFORM sale; I3's `before.sale !== after.sale` spans that setup ⇒ red "บิล 3→4". **ORACLE-EDIT proposal:** give the setup line `startStatus: "NEW"` (or compare bills mid→after). Code keeps the ruled default.
3. **Accounting timing in S2/V3 (not P2.8 logic).** Both checks read JVs of a sale created by the immediately preceding ingest. (a) `account/gl.ts nextJournalNo` numbers JVs with `count()+1` ⇒ a background drain posting PAID/COMMISSION while the next request posts a COGS/void JV collides on `AccountJournalEntry_systemId_docNo_key` (P2002, captured with a consumer wrapper in a scratch diagnostic run: `runs/diag3.log`); the outbox retries later (backoff) so the JV is late, not lost; re-running the same bridge directly succeeds (`runs/diag2.log`). (b) V3 voids the order's sale right after creating it; if its `pos.sale.paid` has not been processed yet, `posSalePaid`/`postSaleCommission` skip a VOIDED sale by design ⇒ no "original COMMISSION" to reverse. S2 passed in 2 of 4 runs, V3 failed every run. **ORACLE-EDIT proposal:** `await drain()` after I1 and after creating `v2` (precondition "the sale's pos.sale.paid is processed"); **HF proposal for the accounting owner:** allocate JV numbers atomically (advisory lock per (systemId, book, period) or retry on docNo P2002 in `postJournal`) — the same race can drop a COGS JV posted by `consumeBatch` after commit (it is not retried).
4. **Prisma 7 nested transactions** — the interactive-tx client exposes `$transaction` (deny list = `$connect $disconnect $on $use $extends`), so `createSale(input, tx)` believes it owns the tx: it opens a nested (savepoint) tx, cuts stock and schedules a drain *before* the caller commits (the cut reads the sale through the global client ⇒ not visible ⇒ silently skipped), and its rows get the savepoint xid. `orderCreateSale` passes `flatTx(tx)` (a Proxy hiding `$transaction`) so createSale runs in the order's tx per its documented "caller's tx" contract; post-commit work is done by order.ts. Without it, 10 parallel ingests starved the pg pool (I2 timeouts) and A2's xmin proof failed. **Follow-up (controller):** `register.ts regSubmitWithIntents` (P1.7 pi_ path) and `giftcard` pass a tx to createSale the same way — likely affected (stock cut skipped / early drain).
5. No `memberId` on order sales — createSale auto-applies tier discounts for members ⇒ the total would no longer equal the PLATFORM/agreed total (PAYMENT_MISMATCH). Orders keep `memberId` on the order; points/benefits for order sales = follow-up (P2.12/P3.7).
6. `PosOrderLine.systemId` / `PosOrderEvent.systemId` added as nullable columns (always written) so the `sys()` registration of ruling 14 matches a real column; the names table pins required fields only. Extra `PosOrderLine.sortOrder` (line order).
7. Staff ingest refuses STORE/QR_TABLE/WEB builtins (`CHANNEL_INVALID`) — WEB orders come only from ShopOrder (`ingestInTx`), QR rounds are P2.7 (ruling 6). Source door (`ingestInTx`): channel by code (builtin first) may be inactive (same as the ECOM sale's default WEB channel); PLATFORM channels via this door never auto-accept/start ACCEPTED (the caller would have to cut stock after its own commit — P3 follow-up).
8. Web-line `priceSource`: mirror lines snapshot the storefront resolver (`CHANNEL`/`RULE`/…; ShopProduct fallback = `BASE` when equal to the row base, else `CHANNEL`); confirm lines copy it from the mirror (no mirror = `CHANNEL`). Storefront dual-read uses the WEB tier only when the resolver's source is not `BASE` (no WEB row/rule ⇒ `ShopProduct.priceSatang` as today, so pre-backfill data never changes price); `CHANNEL_NOT_SOLD`/weighed ⇒ ShopProduct price (hiding products from the web = follow-up).
9. `webPriceConflict` products: dual-write writes nothing once ShopProducts disagree (an earlier single-shop row may remain; storefronts ignore it for conflicts); backfill skips them and reports `conflicts[]`.
10. Order code prefix fixed `OD` (`OD-NNNN` per unit/BKK day under an advisory lock; no unique — ruling 14 allows exactly two).
11. `cancelOrder` on a WEB order with a PAID ECOM sale ⇒ `ORDER_STATE_INVALID` "cancel/refund on the web shop" (POS cannot void ECOM sales — `voidSaleByActor` is POS-only).

## ORACLE-EDIT / ORACLE-ADD log
- ORACLE-ADD **I9** (`11e6906e`, controller ruling 25): 86 at ingest — `ingestOrder` PRODUCT_UNAVAILABLE lineIndex 1; web door: product of SHOP unit B (linked) disabled at B ⇒ `shop.createOrder` throws, nothing written; positive control after re-enable (both doors). **Red-before:** mutation run with the `rowAvailable` guard of `ingestInTx` disabled (uncommitted, reverted) ⇒ I9 ❌ "createOrder ของเว็บที่ปิดขายผ่าน (SO-0001)" (`runs/p28-I9-redbefore-mutation.log`, 50/55). Count 54 → 55.
- ORACLE-EDIT (pre-ruled CD9/ruling 3/5, own commits): `qc-pos-p1.6` CALL_SITES + `pos/order.ts: 1` · `qc-pos-p1.18:317` `["chatOrders", true, null]` · `:338` `["onlineOrders", "pos.order.accept", null]`. No other p1.6 registry change was needed.
- **Proposals awaiting the controller:** ST2 (deviation 1) · I3 (deviation 2) · I1/V2 drain pacing (deviation 3) ·
  **qc-pos-p2.2 ST1** (41/42): its migration filter matches any SQL containing `"listPriceSatang"`/`"PosPriceSource"` — `PosOrderLine.listPriceSatang` + `priceSource PosPriceSource?` are mandated by the P2.8 names table ⇒ proposal: restrict the filter to migrations creating/altering `PosProductChannelPrice`/`PosPriceRule`/`PosSaleLine` (or exclude `20261207100000_pos_p28_orders`) ·
  **qc-pos-p2.4 L2** (`--no-db`): its copy of the createSale registry has no `pos/order.ts: 1` (P2.4 oracle predates ruling 3) ⇒ proposal: same `CALL_SITES_ALLOWED_LATER {"src/lib/modules/pos/order.ts": 1}` as `qc-pos-p2.6` (P2.4 lane's oracle — not edited here).

## P2.8U contract (screen 09 inputs — derived from mockup 09 + brief §6)
- Route `/app/sys/[id]/pos/orders` + register mode tab "ออเดอร์ออนไลน์" (badge = `counts.byColumn.new`); no new `POS_NAV_KEYS` (ruling 7).
- Data: `listOrdersAction({systemId, unitId, deviceId?, status?, channelId?, since?})` → `{orders: OrderCard[], counts: {byColumn: {new, preparing, ready, done}, byChannel: {channelId: n}}, summary: {count, totalSatang, rejectedCancelled, avgAcceptSeconds, onTime: {n, m}}, at}`; poll 10 s; header "ออเดอร์วันนี้ {count} · ยอดรวม {totalSatang}" / "อัปเดต {at}".
- Left rail: channels from `listChannelsAction` + `counts.byChannel`; "รับอัตโนมัติ" switches + "เวลาเตรียมมาตรฐาน" + "ปิดรับชั่วคราว 15/30/60 นาที / จนกว่าจะเปิดเอง" → `setChannelOrderSettingsAction({input: {channelId, autoAccept?, prepMinutes?, pausedUntil?}})` (pos.order.accept); "พักรับอัตโนมัติเมื่อครัวค้าง" = PLANNED chip (P2.6); "หน้าร้าน QR" = PLANNED (P2.7).
- Columns: `orderColumnOf(status)` · card = `OrderCard` (`ref`, `channel{code,name,payout}`, `itemCount`, `totalSatang`, `customerName`, `phoneMasked`, `note`, `acceptRemainingSec` (red < 60, client ticks from `acceptBy`), `prepDueAt`/`lateMinutes`, `paymentState` note for chat "รอยืนยันชำระ"); kitchen meter "ครัวกำลังทำ" = PLANNED (P2.6); rider rows/"พิมพ์ใบปะหน้า" = PLANNED (P3); done list + footer = `summary`.
- Detail panel: `getOrderAction({id})` → `OrderDetail` (lines/options/notes, `commission` {commissionSatang, commissionVatSatang, netSatang} → reuse P2.1U `pos-bill-commission` block, `history` {count, avgSatang}, member flag via `memberId`, `events`); "เมื่อกดรับออเดอร์ ระบบจะ" bullets: sale+channel (PLATFORM only), stock by recipe, kitchen (PLANNED P2.6), platform notify (P3).
- Actions: accept (+ "แก้เวลา" → `prepMinutes`), reject sheet (`ORDER_REJECT_REASONS` + note), เริ่มเตรียม / พร้อมแล้ว / ส่งมอบแล้ว, รับเงิน (DIRECT → existing register pay dialog bound to `payOrderAction` with a fresh key per dialog open), ยกเลิกออเดอร์ (reason sheet; `PENDING_APPROVAL` toast), ดูบิล (`saleId`/`receiptNo` → bills drawer). Refusals → `refusalMessageKey(code)` → `pos.register.errors.*`; `ORDER_STATE_CHANGED` carries the fresh `order` card to replace in place.
- Manual sheet "+ คีย์ออเดอร์" (**not in mockup 09 — owner line**): proposal = right sheet 420 px: channel (MANUAL/CHAT/CUSTOM, not STORE/QR/WEB) → platform ref → customer name/phone → fulfilment/address → register catalogue + option picker (channel prices) → "ยอดตามแพลตฟอร์ม" field with mismatch warning (`orders.manual.totalMismatch`, never a refusal) → start status (MANUAL default "รับแล้ว") → `ingestOrderAction({input})` with an `idempotencyKey` generated per sheet open (ruling 12).
- Sound/badge: client-side per device (localStorage) on new `NEW` ids between polls. Strings: `pos.orders.*` (th/en, same key set).

## Follow-ups (for the controller / later WOs)
- HF accounting: atomic JV numbering (deviation 3) · Prisma 7 nested-tx semantics for other createSale-in-tx callers (deviation 4).
- P6.1: indexes on `PosOrderLine(orderId)` / `PosOrderEvent(orderId)` (CONCURRENTLY) — ruling 14 allowed one index only.
- P3.1–3.3: API adapters (webhook signature, raw payload in `PosOrderEvent.payload` — `ingestInTx` already accepts `payload`), PLATFORM orders through the source door, `adapterConfig` secrets after encryption.
- P2.6: kitchen auto-pause, kitchen progress meter, kitchen tickets on accept · P2.7: QR table rounds in 09, pay links for chat orders · P3.7: chat status bot.
- Member benefits/points on order sales (deviation 5) · web "not sold" hiding (deviation 8) · per-unit web prices for conflicts (owner line).

## Owner lines (`ledger/POS-OWNER-PENDING.md`, section "เพิ่มจาก P2.8 S")
(a) web-shop owner — `shop/service.ts` hunks, `ShopOrderLine.posProductId`, storefront price dual-read, pause/86 messages · (b) 09 has no manual-order sheet — design call (proposal above) · (c) `webPriceConflict`.

## Red-before (base 160299e4, forced, QC4)
`qc-pos-p2.8` forced → **6/54 · PAR 4/4** (ST6 L1 L2 L3 Z1 Z2 green; every other check red by reason "ยังไม่มี … facade orders / โมเดล PosOrder") · residue 0 · exit 1 (`runs/p28-redbefore-forced.log`).

## Gates (head `d9de03a3` = code at `bb885d2e` + rename fix; scratch `runs/gates-20261010T040512Z/`, QC4 `ep-frosty-lab`, lock `/tmp/shark-gate-pos.lock`)
| gate | result | exit |
|---|---|---|
| qc-pos-p2.8 forced #1 | 51/55 (ST2 I3 S2 V3) · PAR 4/4 · residue 0 | 1 |
| qc-pos-p2.8 forced #2 | 52/55 (ST2 I3 V3) · PAR 4/4 · residue 0 | 1 |
| qc-pos-p2.8 unforced | 51/55 (ST2 I3 S2 V3) · PAR 4/4 · residue 0 | 1 |
| qc-pos-p2.1 | 55/55 | 0 |
| qc-pos-p2.2 | 41/42 (ST1 — proposal) | 1 |
| qc-pos-p2.3 | 46/46 · PAR 2/2 | 0 |
| qc-pos-p2.4 `--no-db` (P2.4 S not on base) | 2/7 — L3 green, L2 red (proposal), ST1–ST3 ST5 fail-before (P2.4 unbuilt) | 1 |
| qc-pos-p1.3 | 128/128 | 0 |
| qc-pos-p1.6 (after ORACLE-EDIT) | 48/48 | 0 |
| qc-pos-p1.12 | 72/72 | 0 |
| qc-pos-p1.16 | 28/28 | 0 |
| qc-pos-p1.18 (after ORACLE-EDITs) | 80/81 in the batch (ST6: `OrderAdapterCode` union scanned as refusal codes) → fixed (`OrderAdapterKind`) → **81/81** rerun (`runs/p118-rerun.log`) | 0 |
| qc-shop | 15/15 (money/stock identical: 65000 · 50→48 · refund 50) | 0 |
| qc-shop-refund | 12/12 | 0 |
| qc-pos-account | 16/16 | 0 |
| qc-account-cpa | 107/107 | 0 |
| qc-pos-p2.6 `--no-db` | 4/13 — ST4 L1 L3 L4 green; the rest fail-before (P2.6 unbuilt). Its P2.8 export dependency (`ingestOrder acceptOrder cancelOrder setChannelOrderSettings` + table `PosOrder`) is now satisfied ⇒ in DB mode K7/O1–O4/A5/A6 leave "SKIP-until-export(P2.8)" (they still wait for P2.4 S / P2.6 itself) | 1 |
| pnpm fitness with env / without env | ✅ / ✅ | 0 / 0 |
| scripts/fitness-pos.mts | ✅ | 0 |
| pnpm typecheck (iso, flock /tmp/pos-gate.lock) | clean | 0 |
Pre-commit fitness passed on every commit.

## Fix round 1 (controller rulings `pos-prompt-accountB-P2.8-S-fix.md`, 10 Oct 04:3xZ)
ORACLE-EDIT log (one commit each):
- `47e5383d` ST2 (ruling 1) — the 5 codes are checked in `OrderRefusalCode` (order-shared.ts, must include `RegisterRefusalCode`) + th/en messages (unchanged) + `refusalMessageKey` (ST7); register.ts untouched · 55 checks.
- `d98f3583` I3 (ruling 2) — setup ingest LM-48300 gets `startStatus: "NEW"`; the bill/order/outbox counts still span the whole check · 55 checks.
- `88f8d58d` S2/V3 (ruling 3) — `await drain()` after I1 and after creating V2's order · 55 checks.
- `6d51b1ff` qc-pos-p2.2 ST1 (ruling 4) — migration filter = P2.2 names **and** a CREATE/ALTER TABLE of `PosProductChannelPrice`/`PosPriceRule`/`PosSaleLine` (no filename exclusion) · 42 checks.
- qc-pos-p2.4 L2 not edited (P2.4 lane, ruling 5).
Code/ledger (`488fa30a`): HF-TX marker on `flatTx` (ruling 6, deviation 4 kept as built) · owner lines: account JV numbering race (O24 / P2.9 account owner: `nextJournalNo` count+1 ⇒ P2002 on `AccountJournalEntry_systemId_docNo_key`; stock-cost JV posted after a stock cut is not retried) + deviation 5 (no memberId on order sales; follow-up P2.12/P3.7). Deviations 5–11 accepted as built (ruling 7).

Gates (scratch `runs/gates-fix1-20261010T043458Z/`, code head `488fa30a`):
| gate | result | exit |
|---|---|---|
| qc-pos-p2.8 forced #1 / #2 | **55/55** · PAR 4/4 · residue 0 / **55/55** · PAR 4/4 · residue 0 | 0 / 0 |
| qc-pos-p2.8 unforced | **55/55** · PAR 4/4 · residue 0 · leaks [] | 0 |
| qc-pos-p2.2 | 42/42 | 0 |
| qc-pos-p1.6 | 48/48 | 0 |
| qc-pos-p1.18 | 81/81 | 0 |
| pnpm fitness with env / without env · fitness-pos | ✅ ✅ ✅ | 0 0 0 |
| pnpm typecheck | clean | 0 |
Follow-ups (add): O24 / P2.9 account owner — atomic JV numbering (sequence or single-statement counter).
