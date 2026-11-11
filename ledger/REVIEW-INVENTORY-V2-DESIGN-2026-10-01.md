# REVIEW — Inventory V2 design vs. code as-built (SURVEY-V2 · Inventory lane · read-only)

> 1 Oct 2026 · worktree `/root/projects/shark-pos-e` · base `28803482` (session/pos) · surveyor: Opus 5.5
> Method: read code only (grep/sed/cat); every fact = `file:line`. **C** = CONFIRMED (traced in code) · **P** = PLAUSIBLE (inferred / needs a DB run).
> Design read: `ledger/DESIGN-INVENTORY-V2.md` (whole) · mockups opened: `03-receive-partial.png`, `06-procurement.png` (2 of 8 allowed).
> Paths: `inv/` = `src/lib/modules/inventory/` · `acc/` = `src/lib/modules/account/`.

Sections: 1 names · 2 data model + writers · 3 quantity/money integrity · 4 tenancy · 5 integrations · 6 conflicts + rulings · 7 oracles · 8 live defects.

---

## 1. Name corrections (design → code today)
Legend: **E** exists as named · **A** exists under another name · **N** new (fine) · **X** contradicts code. All rows **C** unless marked.

### 1.1 Models / enums / fields
| name in design | where | status | code reality |
|---|---|---|---|
| `InvItem` kind "GOODS/SERVICE" | §3 | **X** | enum `InvItemKind{PRODUCT,SERVICE}` `prisma/schema/inventory.prisma:14-17`; `GOODS` is the *AccountProduct* type (`acc/inventory-link.ts:194`) |
| `InvCategory InvSettings InvItemImage InvLocation InvLocationStock InvLot InvMovement` | §3 | E | `inventory.prisma:27,47,63,117,130,145,160` |
| `InvMovement` types IN/OUT/ADJUST/TRANSFER + `needsReview` | §3 | E | `inventory.prisma:4-9,177` |
| "movement COUNT" (V4 confirm) | §4 V4 | **X** | no COUNT type; counts write `ADJUST` via `adjust()` `inv/service.ts:592-640` (note "นับสต็อก" only) |
| `Supplier PurchaseOrder PoLine` | §3 | E | `prisma/schema/procurement.prisma:9,27,45` |
| "PO 3 สถานะ" | §1, §3 | X (minor) | `PoStatus{DRAFT,ORDERED,RECEIVED,CANCELLED}` = 4 `procurement.prisma:2-7` |
| PO statuses DRAFT/PENDING_APPROVAL/SENT/PARTIAL/RECEIVED/CLOSED/CANCELLED | §7 | **X** | needs `ALTER TYPE "PoStatus" ADD VALUE` ×4 (non-transactional) **and** a rename/mapping ORDERED→SENT; "pending approval" today = DRAFT + PENDING `ApprovalRequest` (`inv/procurement.ts:184-197,210-216`) |
| `PurchaseOrder.expectedAt/shipTo/sentVia` | §7 | N | – |
| `PoLine.receivedQty` (needed for partial) | implied I1.4 | N | `PoLine{itemId,qty,costSatang}` only `procurement.prisma:45-55`; `itemId` loose (no FK) |
| `Supplier` + taxId/address/terms/**partyId** | §7 | E (partyId) / N (rest) | `Supplier.partyId` **already exists** `procurement.prisma:21` (set by `party.safeFindOrCreate` `inv/procurement.ts:29-34`); `Supplier.portalToken` (vendor portal) exists `:19` — not mentioned by design |
| `InvUom` `InvItemUom` `InvItemSupplier` `InvReorderRule` `InvCountSession(+Line)` `InvTransfer(+Line)` `InvBom` `InvProductionOrder` `InvSerial` `PurchaseRequest(+Line)` `GoodsReceipt(+Line)` `SupplierBill` | §7 | N | none in `prisma/schema/**` |
| `RecipeLine` "(ใช้ร่วม POS)" | §7 | N / **name clash** | also planned by POS P1.1a as `RecipeLine(productId→PosProduct,…)` `ledger/DESIGN-POS.md:354`, `POS-MASTER-PLAN.md:53` — one table, two owners |
| `InvCountSession` | §7 | N / **name clash** | POS P1.14 plans `PosStockCount/Line` for the same thing `POS-MASTER-PLAN.md:67`, `POS-MIGRATION-PLAN.md:18` |
| `InvMovement` + `uomId/qtyBase/lotId/serialId/costMethod` | §7 | N | today `lotCode String?` (not `lotId`) `inventory.prisma:168`; all qty columns are **Int** (`onHand`, `qtyDelta`, `balanceAfter`, `InvLot.onHand`, `InvLocationStock.onHand`, `PoLine.qty`) `inventory.prisma:98,136,152,169-170`, `procurement.prisma:51` |
| `InvSettings.costMethod` | §7 | N | `InvSettings` = SKU/barcode only `inventory.prisma:47-60` |
| "นโยบายติดลบต่อ item" | §7 | N | global allow-negative + flag, hard-coded `inv/rules.ts:13-15` |
| `unitLabel ข้อความเดียว` | §1 | E | `InvItem.unitLabel String @default("ชิ้น")` `inventory.prisma:85` |
| "จอง (ออเดอร์เปิด)" / "ว่างให้ขาย" | V2, V5 | N | no reservation anywhere; `onHand` is the only quantity |
| kit/ชุด (I2.8) | §8 | **A** | already exists in Accounting: `AccountProduct.type=BUNDLE` + `AccountProductBundleItem{bundleProductId,componentProductId,qty Decimal}` `prisma/schema/account_gl.prisma:217-231`; components consumed by `consumeBundleComponentsInTx` `acc/bundle.ts:41-125` |
| เบิกภายใน/ของเสีย "ลงบัญชีค่าใช้จ่ายตามเหตุผล" · CA ปรับต้นทุน | V3, PEAK note | **A** | Accounting docs `GOODS_ISSUE` / `GOODS_ISSUE_RETURN` / `COST_ADJUSTMENT` `prisma/schema/account.prisma:28-30`; issue → `inventory.consumeInTx` + Dr chosen expense / Cr 1200 (`acc/product.ts:893-912,930-960`); CA writes `InvItem.costSatang` directly `acc/product.ts:1274` |
| ยอดยกมา (opening) | – | E (acc) | `AccountProductOpeningLot` → `inventory.receiveInTx` key `acc-open-<productId>-<seq>` `acc/product.ts:1686-1700` |
| `AccountProduct` "PO ฝั่งบัญชี" (`account/expense.ts PURCHASE_ORDER`) | §1, decision 2 | E | `AccountDocType.PURCHASE_ORDER` `account.prisma:20`; create `acc/expense.ts:1396`, approve via approval-cap `acc/approval-cap.ts:24`, convert → `PURCHASE`/`EXPENSE` `acc/expense.ts:1530-1600` |
| "มูลค่าคงเหลือ = งบดุล **1300**" | §1 "ทำไปแล้วได้อะไร" | **X** | inventory GL account is **1200** `acc/coa.ts:40,104`, `acc/product.ts:714`, `inv/account-bridge.ts:32-42` |

### 1.2 Functions / services
| name in design | status | code reality |
|---|---|---|
| "45 ฟังก์ชัน · 1,150 บรรทัด" | E | `inv/service.ts` 1,156 lines, 42 exported fns (+12 in `procurement.ts` 309 lines) |
| `inv.consume` / `inv.receive` / `inv.adjust` | E | `inv/service.ts:516,435,592`; in-tx variants `consumeInTx :531`, `receiveInTx :450` (no `adjustInTx`) |
| `inv.reverse` (§5 POS row) | **N/A** | no reverse fn; every caller re-implements return as `receive` with its own key (`pos/service.ts:420`, `shop/service.ts:349`, `clinic/service.ts:343`) |
| "`inv.consume` ชุดวัตถุดิบตามสูตร" (batch) | N | one item per call, own tx `inv/service.ts:516-525` |
| `bulkCount` | E | `inv/service.ts:648-668` (loop of `adjust`, random key per line, not atomic) |
| `transfer` "movement คู่ทันที" | E | `inv/service.ts:679-749` |
| `receivePo` "ทั้งใบ · idempotent ต่อ line" | E | `inv/procurement.ts:222-246` (key `po-<lineId>`) |
| `markOrdered` + approval | E | `inv/procurement.ts:167-205`; effect `src/lib/approval-effects.ts:34-45` |
| `sweepExpiringLots` "แจ้ง 30/7/0 วัน" | **X** | one window, 7 days, `SWEEP_WITHIN_DAYS = 7` `inv/service.ts:846`; cron `src/lib/platform/cron.ts:355` |
| "ซิงก์ AccountProduct" | E | `acc/inventory-link.ts:87` (inv→acc: name/sku/unit/buyPrice/qtyOnHand mirror), `:138` (acc→inv: name/sku/unit) |
| "ลง GL หลัง tx" | E | `postMovementGl` `inv/service.ts:390-399` |
| `postMovementGlAfterTx` (for `*InTx` callers) | E but **dead** | `inv/service.ts:406`; **zero callers** in `src/` (grep) |
| reorder engine / forecast / count session / transfer workflow / uom convert / FIFO | N | – |
| `chat` send PO to supplier | N | shape of `pushToContact` differs (see POS review §1.2) |

### 1.3 Events / permissions / cron
| name | status | code reality |
|---|---|---|
| `inventory.lot.expiring` (มี) | E | emit `inv/service.ts:940-955`; consumer = automation only `src/lib/outbox-consumers.ts:699`; label `src/lib/automation/labels.ts:30` |
| `inventory.count.confirmed` "(มีจาก POS)" | **X** | does not exist; POS plan names it `pos.stockcount.confirmed` (POS review §1.3) |
| `inventory.low_stock/out_of_stock/po.sent/po.received/po.overdue/transfer.sent/transfer.received/lot.expired` | N | – (each needs a consumer entry in shared `outbox-consumers.ts`) |
| permission keys | E (16) | `inventory.item.{read,create,update,import}` `.location.create` `.movement.{receive,consume,transfer,adjust}` `.lot.expiring` `.supplier.{create,update}` `.po.{create,order,receive,cancel}` `src/lib/core/permissions.ts:467-486`; **no** keys for count session, transfer approve, PR, GR, bill, settings, report, cost |
| `inventory.item.read` | E but unused by pages | no page calls `assertCan` (§4) |

### 1.4 Files / routes / UI / AI
| name | status | reality |
|---|---|---|
| "7 หน้า" | E | `src/app/app/sys/[id]/inventory/{items,services,movements,count,locations,procurement,settings}/page.tsx` (each ~24 lines → `inv/ui.tsx` 1,181 lines) |
| `StockCount.tsx` `BarcodeSearch.tsx` `ImageEditor.tsx` | E | `inv/*.tsx` |
| `/api/v1/inventory/items` (อ่าน) | E | `src/app/api/v1/inventory/items/route.ts` (first INVENTORY system, ignores key scopes — §8 D6) |
| `/vendor/[token]` portal | E (not in design) | `src/app/(store)/vendor/[token]/page.tsx` → `getVendorPortalView` `inv/procurement.ts:79-104` |
| AI "tool `low_stock` · proposal `inventory_receive`" | X (understated) | tools `low_stock`, `inventory_receive`, `inventory_create_item`, `inventory_adjust`, `inventory_consume` (`src/lib/ai/tools.ts:130,411,614,648,1611`; skill `src/lib/ai/skills.ts:90`); proposals `src/lib/ai/proposals.ts:523,608,630,1155`, access map `:143,148,149,170` |
| AI `inv_on_hand/expiring/forecast/dead_stock`, `inv_draft_po/inv_adjust/inv_set_reorder_point/inv_mark_86` | N / **A** | `inv_adjust` ≡ existing `inventory_adjust`; naming convention today is `inventory_*` — keep it |
| ข้อสอบ "qc-warehouse 15 · qc-lot 13" | X (counts) | `chk(` calls: qc-warehouse 18, qc-lot 15 (§7) |
| `scripts/visual-inventory*` (I1.1) | N | – |
| `docs/modules/19-inventory.md`, `docs/sds/modules/{inventory,procurement}.md`, `docs/BLUEPRINT_CONNECTIONS.md`, `ledger/POS-CONTRACTS.md` | E | present |

---

## 2. As-built data model + writers/readers of quantity/money fields

### 2.1 Core models (schema read · C)
| model | scope (`src/lib/core/scope.ts`) | key fields | uniqueness | FKs |
|---|---|---|---|---|
| `InvItem` | system `:112` | `sku barcode name unitLabel category(text) categoryId kind priceSatang durationMin bufferMin depositSatang bookable description sortOrder costSatang(avg) onHand(cache) reorderPoint accountProductId archivedAt` `inventory.prisma:78-113` | `@@unique([systemId,sku])` · **barcode not unique** | `categoryId`, `accountProductId` loose; relations only to `InvMovement`, `InvItemImage` |
| `InvLocation` | system `:117` | `name isDefault archivedAt` | `@@unique([systemId,name])` | **no `unitId`** ⇒ a "branch" is only a location *named* after a branch |
| `InvLocationStock` | system `:118` | `itemId locationId onHand` | `@@unique([itemId,locationId])` | both loose |
| `InvLot` | system `:119` | `itemId lotCode expiryDate @db.Date onHand` | `@@unique([itemId,lotCode])` | loose; lot not per location (`inventory.prisma:143-144`) |
| `InvMovement` | system `:116` | `itemId type locationId lotCode qtyDelta balanceAfter costSatang sourceModule refType refId idempotencyKey note needsReview` | `@@unique([tenantId,idempotencyKey])` **tenant-wide** | `item` real FK (Cascade) `:165`; rest loose |
| `InvCategory` / `InvSettings` / `InvItemImage` | system | SKU prefix/padding/`nextSeq`, barcode type, default price/unit | `[systemId,name]` / `[systemId]` | image→item real FK |
| `Supplier` | system `:185` | `name phone email note portalToken partyId` `procurement.prisma:9-25` | `portalToken @unique` | `partyId` loose |
| `PurchaseOrder` | system `:186` | `supplierId code status orderedAt receivedAt note` — **no amount, no VAT, no location, no contact** | `@@unique([systemId,code])` | `supplierId` loose |
| `PoLine` | tenant `:187` | `poId itemId qty costSatang` | – | `po` real FK; `itemId` loose |
| `AccountProduct` (stock-relevant) | system (ACCOUNT) | `qtyOnHand Decimal(12,4)` mirror, `invItemId`, `warehouseId`, `buyPrice Int?` `prisma/schema/account_gl.prisma:155,188,191,193` | – | loose |
| `MenuItem.invItemId` / `ShopProduct.invItemId` | unit | loose links `restaurant.prisma:161` (never written), `ecommerce.prisma:18` | – | – |
Unit/qty: every inventory quantity is **Int** (§1.1); accounting quantities are **Decimal(12,4)** (`account.prisma:223`, `account_gl.prisma:188,223,244`).

### 2.2 Writers of `InvItem.onHand` / `InvLocationStock.onHand` / `InvLot.onHand` / `InvItem.costSatang` / `InvMovement`
| writer · file:line | fields | entry points (all C unless marked) |
|---|---|---|
| `receiveInTx` `inv/service.ts:450-499` (via `receive :435`) | onHand, **costSatang (moving avg)**, location, lot, movement IN | manual `receiveAction` `inv/actions.ts:112`; `receivePo` `inv/procurement.ts:233`; AI `inventory_receive` `ai/proposals.ts:533`; POS void restore `pos/service.ts:420`; shop refund `shop/service.ts:349`; clinic refund `clinic/service.ts:343`; acc GOODS_ISSUE_RETURN `acc/product.ts:906`; acc opening `acc/product.ts:1686` |
| `consumeInTx` `inv/service.ts:531-578` (via `consume :516`) | onHand, location, lot, movement OUT (cost = current avg) | manual `consumeAction` `inv/actions.ts:142`; AI `inventory_consume` `ai/proposals.ts:1165`; POS `consumeSaleInventory` `pos/service.ts:335`; shop `confirmOrderPaid` `shop/service.ts:280`; clinic dispense `clinic/service.ts:206`; acc GOODS_ISSUE `acc/product.ts:905`; acc bundle components `acc/bundle.ts:101` (← acc INVOICE/RECEIPT issue `acc/service.ts:2246` and POS→acc `applyExternalSale` `acc/index.ts:228`) |
| `adjust` `inv/service.ts:592-640` | onHand := newQty, location += delta, movement ADJUST | `bulkCountAction` `inv/actions.ts:171` → `bulkCount :648`; AI `inventory_adjust` `ai/proposals.ts:639` |
| `transfer` `inv/service.ts:679-749` | location ±qty, 2 movements TRANSFER (onHand untouched) | `transferAction` `inv/actions.ts:228` |
| `createItem` `inv/service.ts:190-217` | costSatang initial (no stock) | items/services actions, CSV import, AI create, `booking/service.ts:329`, `acc/inventory-link.ts:221` (cost = `buyPrice`, price = `salePrice`) |
| **direct** `tx.invItem.update({costSatang})` `acc/product.ts:1274` | costSatang (no movement row) | acc COST_ADJUSTMENT issue |
| `syncProductToItem` `acc/inventory-link.ts:159,165` | name/sku/unitLabel/accountProductId | account product edit |
| `updateItem` `inv/service.ts:312-357` | priceSatang/meta (never qty/cost) | actions, services page |
`PurchaseOrder.status` writers: `markOrdered` `inv/procurement.ts:200`, `receivePo :223`, `cancelPo :250`, approval effect `src/lib/approval-effects.ts:39`. No raw SQL anywhere in inventory (`grep $queryRaw/$executeRaw` = 0). **C**

### 2.3 Readers that matter for V2
`lowStock` (AI `low_stock` `ai/tools.ts:138`, items page) `inv/service.ts:781` · `listItems` (**take 200 newest**) `:793` used by POS register `pos/register.ts:138,239`, shop catalogue `shop/service.ts:29`, clinic (take 500) `clinic/service.ts:199` · `listServices` booking/POS · `getItemsByIds` CRM deals `crm/deals.ts:471` · `productStockMap` (acc reads stock) `acc/inventory-link.ts:292` · REST `/api/v1/inventory/items` · vendor portal · `stockByLocationMap`/`lotsByItemMap` (UI, unbounded `findMany({})`) `inv/service.ts:762,857`. **C**

### 2.4 Which inventory system is used (per caller)
| caller | resolution | file:line |
|---|---|---|
| POS sale cut / void restore | `systemForUnit(unit,"INVENTORY")` (unit-linked) | `pos/service.ts:329,396` |
| booking | unit-linked, fallback first active | `booking/service.ts:200-204` |
| shop, clinic | `listSystems(tenant,"INVENTORY")[0]` | `shop/service.ts:267,328`, `clinic/service.ts:190,330` |
| accounting link/mirror/opening/issue | `appSystem.findFirst({type:"INVENTORY"})` **no orderBy** | `acc/inventory-link.ts:33-39` |
| inventory → GL | `appSystem.findFirst({type:"ACCOUNT"})` **no orderBy** | `inv/service.ts:392` |
| AI proposals | `resolveSystem(tenant,"INVENTORY")` | `ai/proposals.ts:525,610,632,1157` |
| REST items | first by `createdAt` | `api/v1/inventory/items/route.ts:17` |
⇒ a tenant with 2 INVENTORY systems (or 2 ACCOUNT systems) gets stock/GL split non-deterministically. **C** (code) / whether >1 per tenant is allowed: **P**.

---

## 3. Quantity / money integrity as-built

### 3.1 Counters and caches
| cache / counter | update pattern | file:line | verdict |
|---|---|---|---|
| `InvItem.onHand` | `findFirst` → JS `item.onHand ± qty` → `update({onHand: absolute})` inside a tx, **no row lock, no `increment`** | receive `inv/service.ts:459-475` · consume `:536-552` · adjust `:604-615` | **lost update** under concurrency (two registers / POS + shop / count + sale) — ledger keeps both rows but cache and `balanceAfter` are wrong (§8 D1). **C** code · behaviour under PG READ COMMITTED **P** (no isolation override anywhere: grep `isolationLevel` = 0) |
| `InvItem.costSatang` (moving avg) | same RMW; `movingAvgCost(oldQty,oldCost,inQty,inCost)` `inv/rules.ts:3-7` | `inv/service.ts:470-474` | concurrent receives → wrong avg; **receiving into negative stock** distorts avg (old −5@100 + in 10@200 → (−500+2000)/5 = 300, above both) — §8 D8. **C** (math) |
| `InvLocationStock.onHand` | `findFirst` → `update({onHand: row+delta})` | `applyLocationDelta :64-77` | same lost update; first-touch lazy seed `seedDefaultStockIfNeeded :54-61` = count-then-create (race → P2002 → whole movement tx fails) **P** |
| `InvLot.onHand` | same RMW | `applyLotDelta :81-111` | same |
| `InvSettings.nextSeq` (SKU auto) | read → loop `findFirst` → `updateMany(nextSeq+1)` | `nextSku :1072-1088` | race ⇒ two items get the same SKU → 2nd `createItem` P2002 (LOW) **C** |
| `PurchaseOrder.code` | `count()+1` → create, retry ×6 on P2002 | `inv/procurement.ts:125-158` | safe (unique `[systemId,code]`); numbering is per system, never reset, unrelated to accounting `PO` doc-number settings (`acc/settings-schema.ts:55`) **C** |
| `AccountProduct.qtyOnHand` mirror | written after the inventory tx by `syncItemToAccountProduct` (swallowed errors) | `inv/service.ts:415-417,523,444,638` → `acc/inventory-link.ts:109` | stale-able by design (readers must use `productStockMap`) **C** |
| invariant Σ`InvLocationStock` = `InvItem.onHand` | maintained by applying the same delta to one location | `inv/service.ts:476,553,616` | **broken by `adjust` with a non-default location**: `qtyDelta = newQty − item.onHand(total)` applied to that one location (`:610,616`) — today no caller passes `locationId` to `adjust` (bulkCount/AI omit it) ⇒ latent, but any V2 per-location count that reuses `adjust` corrupts per-location stock **C** |

### 3.2 Idempotency
| path | key | enforcement | gap |
|---|---|---|---|
| all movements | `InvMovement @@unique([tenantId,idempotencyKey])` `inventory.prisma:180` + `findFirst` pre-check | receive/consume pre-check by `tenantId` (`:457,536`); **adjust/transfer pre-check via `tenantDb` ⇒ systemId-filtered** (`:599,691`) | concurrent duplicate → P2002 thrown, not "return original" (same as POS §3.5); adjust/transfer key reused from another inventory system → P2002 **C** |
| manual forms | `manual-in/out/tf-<randomUUID>` | `inv/actions.ts:129,156,243` | double-submit = double movement (LOW) **C** |
| bulk count | `count-<randomUUID>` per line | `inv/service.ts:655` | retry re-applies absolute qty (harmless) but writes a new movement each time **C** |
| PO receive | flip `ORDERED→RECEIVED` (conditional `updateMany`) **then** loop `receive(po-<lineId>)` outside any tx | `inv/procurement.ts:223-243` | a throw mid-loop (item archived→still found; item deleted / SERVICE / bad `locationId`) leaves PO **RECEIVED with part of the stock in** and no way to retry (status ≠ ORDERED) — §8 D4 **C** |
| POS / shop / clinic cut | `pos-consume-<sale>-<line>` · `ecom-<order>-<line>` · `clinic-<visit>-<item>` | `pos/service.ts:341`, `shop/service.ts:283`, `clinic/service.ts:212` | clinic key per (visit,item): 2nd dispense of the same drug in one visit is **not cut** but **is appended to `dispenseJson`** `clinic/service.ts:205-222` — §8 D9 **C** |
| AI | `ai-<proposalId>` | `ai/proposals.ts:539,644,1170` | OK |
| PO approval | `approval-PurchaseOrder-<poId>` | `approval/service.ts:180-182` | one request per PO **ever** — rejected PO can never be re-submitted (§8 D5) **C** |

### 3.3 GL posting of movements (`inv/account-bridge.ts:26-46`, `acc/gl.ts:1069-1131`)
| movement | Dr / Cr | notes |
|---|---|---|
| OUT (any source, incl. manual waste, AI, clinic, acc bundle) | 5000 / 1200 | manual "ของเสีย/ใช้ภายใน" lands in **COGS**, not an expense — the Accounting GOODS_ISSUE path does it right (Dr chosen expense) `acc/product.ts:943-960` |
| IN `procurement` | 1200 / **2100 AP** | AP with no supplier/contact, no document, no VAT input ⇒ unpayable in Accounting; if the shop also books the supplier bill as Accounting `PURCHASE` (Dr **5000** `PURCHASE_DEFAULT` / Cr 2100 `acc/gl.ts:581-600`, `acc/coa.ts:103`) AP and cost are **doubled** — §8 D7 (**P**: needs a tenant using both) |
| IN from POS/ECOM/CLINIC or key contains "refund" | 1200 / 5000 | restore at **current** avg cost, not the cost of the original OUT (`pos/service.ts:407-424`, `shop/service.ts:343-352`, `clinic/service.ts:342-347`) ⇒ COGS reversal ≠ original COGS when avg moved (LOW) |
| IN other (manual, AI) | 1200 / **3000 equity** | "นำสินค้าเข้ากิจการ" — any manual receive of purchased goods is booked as owner capital |
| ADJUST, TRANSFER | **not posted** (`planFor` returns null `:44-45`) | count variance never reaches GL ⇒ 1200 drifts from Σ onHand×cost; design's "ผลต่างนับลงบัญชีเอง" does not exist |
| `consumeInTx`/`receiveInTx` called by Accounting | not posted by inventory; `postMovementGlAfterTx` has **0 callers** | GOODS_ISSUE/RETURN post their own entry (OK); **bundle components consumed on INVOICE/RECEIPT/POS sale post no COGS** `acc/bundle.ts:101-110` — §8 D10 |
| when posting fails | `catch {}` (no log, no outbox, no retry) | `inv/service.ts:390-399`; e.g. closed period / missing 2100 code ⇒ movement without GL forever **C** |
| account system choice | `findFirst({type:"ACCOUNT"})` no orderBy, no link check | `inv/service.ts:392` — inventory posts to the tenant's first ACCOUNT system even if the inventory system is not linked to Accounting (matches brief note) **C** |

### 3.4 Reversal on void / cancel
| event | reversed | not reversed |
|---|---|---|
| POS void | OUT movements of `refType PosSale` restored (`pos/service.ts:395-434`, swallowed errors) | bundle-component OUTs (refType `AccountDocument`) — **no restore path anywhere** (grep `acc-issue`/bundle in void code = 0) **C**; restaurant never cut |
| shop refund / clinic refund | per line / per OUT movement (`shop/service.ts:328-353`, `clinic/service.ts:330-350`) | – |
| Accounting INVOICE/RECEIPT void | – | bundle components not restored **C** (no code) |
| PO cancel | DRAFT/ORDERED only `inv/procurement.ts:249-255` | RECEIVED PO: no return-to-supplier, no reverse receive |
| transfer | – | no undo (two movements, manual counter-transfer only) |

### 3.5 Units, rounding, Thai day
- Decimal → Int truncation (C): Accounting GOODS_ISSUE passes `qty = Number(line.qty)` (Decimal 12,4) `acc/product.ts:890` into `consumeInTx` which does `Math.round(input.qty)` `inv/service.ts:532` ⇒ issue 1.5 → stock −2 while GL cost uses 1.5 (`acc/product.ts:918`); bundle `Math.round(setQty × compQty)` `acc/bundle.ts:95`. §8 D11.
- Money: avg cost `Math.round` (half-up for positives) `inv/rules.ts:6`; GL amount = `|qtyDelta| × costSatang` (integer) `inv/account-bridge.ts:27,70`; PO total = Σ qty×cost (no VAT) `inv/procurement.ts:179`.
- Thai day: lot expiry form `new Date(\`${d}T00:00:00+07:00\`)` `inv/actions.ts:123` into `expiryDate DateTime @db.Date` `inventory.prisma:151` — Prisma writes the **UTC** date ⇒ stored one day earlier than typed (§8 D12, **P** — needs a DB round-trip). `sweepExpiringLots` day key via `Asia/Bangkok` ✓ `inv/service.ts:894-897`; `formatThaiDate` uses TZ ✓ `src/lib/ui/date.ts:12-18`. No raw `getDay/getDate/getHours/setHours` in `inv/**` or inventory pages (grep = 0). **C**

---

## 4. Tenancy / authorization as-built

Primitives: `requireTenant()` → session tenant; `assertCan(m,{module:"inventory",action})` **always without `unitId`** (`inv/actions.ts:33-42`, `inv/procurement-actions.ts:19-28`) ⇒ `canAccessUnit` returns true when `unitId` is omitted (`src/lib/core/rbac.ts:22-25`) ⇒ a unit-limited MANAGER passes every inventory action (`:34-36`); STAFF needs the key or `inventory.*`. Inventory data is **system-scoped**; `InvLocation` has no `unitId`, so "branch" permissions cannot be expressed at all today. `tenantDb({tenantId,systemId})` injects both on every query (`src/lib/core/db.ts:88-118`; scope map `src/lib/core/scope.ts:111-119,185-187`) ⇒ **no cross-tenant read/write found**. **C**

| surface | file:line | tenant | system | unit | actor permission | client-trusted ids |
|---|---|---|---|---|---|---|
| 7 pages `/app/sys/[id]/inventory/*` | `src/app/app/sys/[id]/inventory/*/page.tsx:12-14` (+ `inv/ui.tsx:105,321,353,497,579,826,872,1050`) | session | `appSystem{id,tenantId,type:INVENTORY}` ✔ | – | **none** — `inventory.item.read` exists (`permissions.ts:471`) but no page/section calls `assertCan`; any member of the tenant sees cost, avg cost, suppliers, PO totals, movements | – |
| item/service/category/settings/image actions | `inv/actions.ts:59-446` | session | **client `systemId`, never checked to be an INVENTORY system of the tenant** (tenantDb only adds tenant) ⇒ rows can be created under a POS/ACCOUNT system id (orphans, LOW) | – | key per action, no unit | `itemId` (scoped ✔), `categoryId` (loose, unchecked), `imageId` (scoped ✔); `uploadItemImageAction` uploads the file **before** checking the item exists (`:407-415`) → orphan files (LOW) |
| movement actions receive/consume/count | `inv/actions.ts:112-193` | session | client `systemId` | – | key, no unit | `itemId` ✔ (scoped), `locationId` ✔ (validated `resolveLocationId` `inv/service.ts:114-122`), `lotCode` free text |
| `transferAction` → `transfer` | `inv/actions.ts:228-246` → `inv/service.ts:679-749` | session | client `systemId` | – | `inventory.movement.transfer` | **`fromLocationId`/`toLocationId` NOT validated** (no `resolveLocationId` call; `applyLocationDelta` creates a row for any id `:64-77`) — the exact bug WO 4.1 fixed for receive/consume (`:110-113` comment) is still open here (§8 D3) |
| `createPoAction` → `createPo` | `inv/procurement-actions.ts:86-109` → `inv/procurement.ts:118-159` | session | client `systemId` | – | `inventory.po.create` | **`supplierId` and `lines[].itemId` unchecked** (loose ids; `PoLine` scoped by tenant only) ⇒ PO to a non-existent supplier / item of another system; failure surfaces later in `receivePo` mid-loop (D4) |
| `markOrdered/receivePo/cancelPo` actions | `inv/procurement-actions.ts:116-150` | session | client `systemId` | – | `inventory.po.{order,receive,cancel}` | `poId` ✔ scoped; `locationId` ✔ (via receive) |
| vendor portal enable/disable | `inv/procurement-actions.ts:62-83` | session | client | – | `inventory.supplier.update` | `supplierId` ✔ scoped (`updateMany` count) |
| public `/vendor/[token]` | `src/app/(store)/vendor/[token]/page.tsx` → `inv/procurement.ts:79-104` | from token | from supplier | – | none (bearer link) | token 24 random bytes ✔; no expiry, no rate limit (**P**); exposes PO codes/status/totals only |
| approval effect PO→ORDERED | `src/lib/approval-effects.ts:34-45` | event tenant | – | – | approver's (approval core) | `entityId` from event ✔ |
| AI proposals `inventory_*` | `src/lib/ai/proposals.ts:143-170,523-660,1155-1179` | ctx | `resolveSystem(tenant,"INVENTORY")` (first) | – | access map key, **no unitId** | `sku` resolved in system ✔; qty/cost from AI payload (bounded `>0` only) |
| AI read `low_stock` | `src/lib/ai/tools.ts:127-140` | ctx | first INVENTORY | – | skill-level only (**P**) | – |
| REST `GET /api/v1/inventory/items` | `src/app/api/v1/inventory/items/route.ts:11-37` | API key | first INVENTORY | – | **key `scopes`/`systemId` ignored** (`route-auth.ts:58-65` returns them) — any key of the tenant (e.g. a member-only key) reads SKU/cost/onHand (§8 D6) | `take` ≤200 |
| cron `sweepExpiringLots` | `inv/service.ts:892-967` ← `src/lib/platform/cron.ts:355` | all tenants | – | – | platform | tenants list `take: 50` **without orderBy** (`:907-911`, `take: 50` at `:910`) ⇒ above 50 inventory tenants, the rest may never be swept (§8 D13) |
| engine `receive/consume/adjust/transfer` | `inv/service.ts` | ctx | ctx (trusted) | – | none (callers' job) | `itemId` validated inside system ✔; SERVICE kind rejected ✔ (`:463,542,605,697`) |

---

## 5. Integration points (what exists vs. what the design assumes)

### 5.1 POS V2
| point | as-built | design assumes | gap |
|---|---|---|---|
| catalogue | POS register lists `InvItem` PRODUCT (cap **200 newest**) + `AccountProduct.salePrice` (fallback cost) `pos/register.ts:137-152`, `inv/service.ts:793-799`; `PosProduct` does not exist | `PosProduct ⇄ InvItem 1:1` (§1 decision 1, §5) | depends on POS P1.1a; `MenuItem.invItemId` exists but is never written `restaurant.prisma:161` **C** |
| stock cut on sale | `consumeSaleInventory` after commit, only if `ownsTx`, per line `itemId`, errors swallowed, default location (`pos/service.ts:306-347`, `inv/service.ts:114-122`) | "POS/ร้านอาหาร/เว็บ/โรงแรม/ตั๋ว ตัดผ่าน `inv.consume` เท่านั้น" | **restaurant, hotel, ticket, booking, CRM-won, Accounting INVOICE (plain goods) never cut `InvItem`** (callers of `consume` = POS, shop, clinic, AI, manual, acc GI/bundle only — §2.2); restaurant keeps its own `MenuItem.stockQty` with an **atomic** conditional decrement `restaurant/order.ts:165-178` **C** |
| void/refund | `restoreVoidedInventory` (current avg cost) `pos/service.ts:395-434`; no partial refund | refund per line (POS P1.8) | bundle components never restored (§3.4) |
| stock count from POS | none | POS P1.14 `PosStockCount` | same feature, two table names (§6 #3) |
| 86 / availability | `MenuItem.isOutOfStock` (restaurant only) `restaurant/order.ts:68,177` | `inventory.out_of_stock` → all channels | no inventory event; no link InvItem→MenuItem availability |
| branch stock | one default location per inventory system; `InvLocation` has no `unitId`; POS cuts the default location whatever the unit | "สต็อกต่อสาขา", "สลับสาขา" (V1, V2, V5) | needs `InvLocation.unitId` (or unit→location map) before any per-branch number is real |
| shifts/PIN/commission | n/a to inventory | – | – |

### 5.2 Accounting
| point | as-built (C) |
|---|---|
| link | `AccountProduct.invItemId` ⇄ `InvItem.accountProductId`, canonical split documented `acc/inventory-link.ts:3-11`; sync inv→acc name/sku/unit/buyPrice/qtyOnHand `:87-129`, acc→inv name/sku/unit `:138-172`; **price never flows** (`InvItem.priceSatang` copied once on link-create `:227`) |
| system choice | first INVENTORY / first ACCOUNT of tenant, no `orderBy`, no `AppSystemLink` check (`acc/inventory-link.ts:33-48`, `inv/service.ts:392`) — matches brief note on `inventory.receive` |
| perpetual GL | `inv/account-bridge.ts:26-46` table in §3.3 (1200/5000/2100/3000; ADJUST/TRANSFER skipped) |
| Accounting docs that move stock | `GOODS_ISSUE`/`GOODS_ISSUE_RETURN` (`acc/product.ts:893-912`), opening lots (`:1686`), `COST_ADJUSTMENT` writes `InvItem.costSatang` directly without a movement (`:1274`), bundle components on INVOICE / cash RECEIPT / POS sale (`acc/service.ts:2245-2247`, `acc/index.ts:228`) |
| Accounting PO | full document chain `PURCHASE_ORDER → PURCHASE/EXPENSE → PURCHASE_TAX_INVOICE` (`acc/doc-editor-config.ts:67-68`), approval cap (`acc/approval-cap.ts:24-25`, effect `approval-effects.ts:51-57`), numbering settings `PO` (`acc/settings-schema.ts:55`), contact = `AccountContact`, VAT/WHT, convert `acc/expense.ts:1530-1600`; **`PURCHASE` posts Dr 5000 (periodic), never touches stock** |
| inventory PO | `PurchaseOrder` (no VAT, no contact, no amount column) → receive posts Dr1200/Cr2100 per movement; no bill, no payment, no AP sub-ledger |
| design "ยุบ PO ฝั่งบัญชีเข้าคลัง" | the **richer** chain is Accounting's; collapsing it into `PurchaseOrder` means re-building VAT/WHT/approval-cap/numbering/convert/contact in inventory (§6 #1) |

### 5.3 Approval core
Only `PurchaseOrder` is approvable from inventory: `resolvePolicy({entityType:"PurchaseOrder",systemId,amountSatang})` → `submitForApproval` (`inv/procurement.ts:180-196`); amount = Σ qty×cost **ex-VAT**; no `unitId`; effect only flips DRAFT→ORDERED (`approval-effects.ts:34-45`); rejection = silent, and the one-request-per-entity key blocks re-submission (§8 D5). Design needs PR, count variance, write-off "สูญหาย" approvals → new `entityType`s + effect branches in the shared `approval-effects.ts`. **C**

### 5.4 Member · CRM · Chat · Kanban/Meeting · HR · Party · Reports
| system | as-built (C) | design |
|---|---|---|
| Member | no link (member profile only reads item names `member/profile.ts:422`) | – |
| CRM | deal lines read `InvItem.priceSatang` via `getItemsByIds` `crm/deals.ts:471`, `inv/service.ts:828-832`; no stock read | "สต็อกว่างตอนทำใบเสนอราคา" N |
| Chat | none | send PO via LINE (I3.3) — `pushToContact` shape differs (POS review §1.2); vendor portal `/vendor/[token]` is a ready "send link" target |
| Kanban / Meeting | `inventory.lot.expiring` → `withAutomation` only `outbox-consumers.ts:699`; kanban can link `INV_ITEM` (`kanban/link-resolvers.ts:456-475`) | events low/out-of-stock/po.overdue → cards |
| HR | none (`HrPayAdjustment` exists `scope.ts:181`) | staff issue + deduction (small) |
| Party | `Supplier.partyId` via `party.safeFindOrCreate` `inv/procurement.ts:29-34` | "Supplier เพิ่ม partyId" — already done |
| Reports | generic report "สินค้าคงคลัง" (sku/name/onHand/cost) `reports/service.ts:84-100` | V9 reports |

---

## 6. Design ↔ code conflicts that change a work order (ordered by impact)

| # | conflict (evidence) | WO hit | recommended ruling |
|---|---|---|---|
| 1 | **"One PO, collapsed into inventory" runs against the richer side.** Accounting already has the full chain PO→PURCHASE/EXPENSE→PURCHASE_TAX_INVOICE with contact, VAT/WHT, approval cap, numbering settings and convert (`acc/expense.ts:1396,1530-1600`, `acc/doc-editor-config.ts:67-68`, `acc/approval-cap.ts:24`, `acc/settings-schema.ts:55`); inventory `PurchaseOrder` has no VAT, no contact, no amount (`procurement.prisma:27-55`). Both number as "PO-…". | I1.4 (+I1.3, I1.11, I3.3) | Re-confirm decision 1 with the owner, framed as: **keep one PO = `AccountDocument PURCHASE_ORDER`** (already numbered/approved/VAT'd) and let inventory own only **GR** (`GoodsReceipt` referencing the PO's lines) + stock; legacy `PurchaseOrder` becomes read-only dual-read. If the owner keeps "collapse into inventory", size I1.4 as L and list the 6 features to port (VAT/WHT, contact, approval cap, numbering, convert chain, PDF). Either way: **one** PO table for new documents from day 1. |
| 2 | **Perpetual GL is incomplete and mixes with periodic.** ADJUST/TRANSFER never posted (`inv/account-bridge.ts:44-45`) → count variance never in GL; manual receive → Cr 3000 equity; manual waste → Dr 5000 COGS; procurement receive → Cr 2100 AP with no supplier/bill; Accounting `PURCHASE` → Dr 5000 (`acc/gl.ts:581-600`) ⇒ AP/cost doubled when both used; bundle consumption posts no COGS (`postMovementGlAfterTx` 0 callers); posting failure swallowed with no retry (`inv/service.ts:390-399`). Design promises "รับของ = เจ้าหนี้+ภาษีซื้อ · ผลต่างนับลงบัญชีเอง". | I1.4, I1.6, I1.7 (+POS P1.14) | I1.6 owns a **posting map by movement reason** (receive-from-GR → Dr 1200 / Cr GR-IR clearing, supplier bill clears GR-IR + VAT input + AP; waste/sample → chosen expense like Accounting GI; count variance → `INVENTORY_ADJUST_GAINLOSS` key already in COA mapping → 5310 `acc/coa.ts:106`, used by CA `acc/product.ts:1291-1292`). Linked products' `PURCHASE` lines must post to GR-IR, not 5000. Make GL posting retryable: emit `inventory.movement.recorded` in the movement tx and post in a consumer (idempotent key `InvMovement#id#event` already exists `acc/gl.ts:1084`). |
| 3 | **Non-atomic stock counter.** `onHand`, location, lot and avg cost are read-modify-write with absolute writes, no lock (`inv/service.ts:466-475,546-552,610-616,64-111`). Every V2 feature (count "ขายระหว่างนับบวกกลับ", transfers in transit, multi-register POS, reserve/available) builds on it. | I1.1 (pre-req of all) | Before I1.2: switch the 4 writers to atomic `increment`/`decrement` (`update … returning`) or `SELECT … FOR UPDATE` on the `InvItem` row at tx start; take `balanceAfter` from the returned row. Precedent: restaurant's conditional atomic decrement `restaurant/order.ts:165-178`. Add a concurrency oracle (20 parallel consumes → onHand exact). |
| 4 | **Ownership/name split with the POS RUN.** Owner moved I1.2/I1.7/I1.8/I2.2/I2.3 to POS lane B (design §8/§9 #3), but `POS-MASTER-PLAN.md` has **no UoM WO** (grep "หน่วยนับ/uom" = 0) and names clash: `InvCountSession` vs `PosStockCount` (`POS-MASTER-PLAN.md:67`), `RecipeLine` defined by both (`DESIGN-POS.md:354`), `inventory.count.confirmed` "มีจาก POS" vs POS `pos.stockcount.confirmed`. | I1.2, I1.7, I1.8, I2.2, I2.3 ↔ POS P1.14, P2.3, P2.11 | One table per concept, **owned by the inventory module** (schema `inventory.prisma`, facade in `inventory/index.ts`), POS UI calls the facade: `InvCountSession(+Line)`, `RecipeLine` (keyed by `PosProduct` or `InvItem` — decide once), event `inventory.count.confirmed`. UoM (I1.2) **stays in the Inventory RUN** unless POS plan adds it explicitly. Write this into both plans before either brief. |
| 5 | **Quantities are Int; design needs kg/g/ml and the mockup shows "12.4 กก."** (all inventory qty columns Int §1.1); Accounting sends Decimal(12,4) and inventory silently `Math.round`s (`acc/product.ts:890` → `inv/service.ts:532`; `acc/bundle.ts:95`). | I1.2 (+I2.3 BOM, I2.4) | Keep Int columns; define **base unit = smallest unit** per item (g, ml, ชิ้น), `InvItemUom.factor Int`; UI converts for display (12.4 kg = 12,400 g). Existing items: base = current `unitLabel`, factor 1 (no data migration). Inventory facade must **reject or convert** non-integer base qty instead of rounding; fix the two Accounting callers in the same WO. |
| 6 | **"Branch" has no data model.** `InvLocation` has no `unitId`; POS/shop/clinic always cut the default location (`inv/service.ts:114-122`, `pos/service.ts:335-342`); design V1/V2/V5 show per-branch stock and "สลับสาขา"; mockup 03 shows warehouse "สาขาหัวหิน". | I1.10, I2.1, I2.2 (↔ POS P2.11) | Add nullable `InvLocation.unitId` + "default location of unit" rule used by `consume/receive` when the caller passes `unitId` (POS/shop already know it). Until then, I1 screens show *locations*, not branches. Per-branch reorder rules (`InvReorderRule` "ต่อสาขา") key on location. |
| 7 | **Most selling channels don't cut `InvItem`.** Callers of `consume`: POS register, shop, clinic, AI, manual, Accounting GI/bundle (§2.2). Restaurant (own `MenuItem.stockQty`), hotel, ticket, booking, CRM-won, Accounting INVOICE plain goods: none. Design §5 marks hotel/ticket "✅ contract เดิม". | I1.10 (overview truth), I3.1 (forecast), I2.5 (86) | Correct §5 to ❌ for hotel/ticket/restaurant/acc-invoice. Forecast (I3.1) reads OUT movements by `sourceModule` and states which channels are blind. Restaurant joins via POS P1.1/P2.3 (BOM). Decide explicitly whether Accounting INVOICE cuts goods (risk: double cut when the same sale is a POS bill posted via `applyExternalSale`). |
| 8 | **Approval core limits.** Key `approval-<entityType>-<entityId>` = one request per entity **ever** (`approval/service.ts:180-182`) → a rejected PO can never be re-submitted (D5); no payload, no `unitId`, ex-VAT amount (`inv/procurement.ts:179-196`). Design: PR approval, count-variance approval, write-off approval. | I1.4, I1.7, I1.11 | Each approvable = its own row (`PurchaseRequest`, `InvCountSession`, `InvWriteOff`) as `entityId`; amount incl. VAT for PR/PO. Fix re-submission once in approval core (allow a new request when the last one is REJECTED, e.g. key suffix = attempt n) — shared file, smallest hunk, coordinate with POS P1.15 which hits the same limit. |
| 9 | **Partial receive needs a transactional GR.** `PoLine` has no received qty; `receivePo` flips status then loops receives outside a tx (`inv/procurement.ts:222-246`) (D4). | I1.4 | GR = one tx: create `GoodsReceipt(+Line)`, `receiveInTx` per line, recompute PO status (PARTIAL/RECEIVED) from Σ GR lines; GL after commit via the retryable path (#2). Over/under-receipt per line with reason. |
| 10 | **Counting semantics.** No COUNT type; `adjust` writes an absolute **total** and applies the delta to one location (`inv/service.ts:604-616`) — wrong for per-location counts; `bulkCount` is non-atomic with random keys (`:648-668`). Design: sessions, snapshot, sales during count added back, variance approval. | I1.7 (or POS P1.14) | Keep `InvMovementType.ADJUST` (avoid a non-transactional `ALTER TYPE`) with `refType="InvCountSession"`; variance per (item, location) = counted − (snapshot + net movements since snapshot); new `adjustDelta` facade (delta, not absolute); never reuse `adjust()` for location counts. |
| 11 | **Costing.** Avg cost is RMW and wrong when receiving into negative stock (`inv/rules.ts:3-7`, D8); `COST_ADJUSTMENT` writes `InvItem.costSatang` with no movement (`acc/product.ts:1274`); lots are optional and not per location (`inventory.prisma:143-144`); returns restore at current avg (§3.3). | I2.6 FIFO (+I1.6) | FIFO needs cost layers independent of `InvLot` (lot ≠ cost layer); fix avg rule now (oldQty ≤ 0 ⇒ newCost = inCost); route CA through an inventory facade that writes a zero-qty cost movement so the ledger explains every cost change. |
| 12 | **Authorization is unit-blind and pages are open** (§4): no page gate, `assertCan` without unit, client `systemId` unchecked, transfer locations unchecked (D3), REST ignores key scopes (D6). Design adds per-branch roles and approvals. | I1.11 (+I3.6) | I1.11: `requireInventorySystem(auth, systemId)` helper (type + tenant) in every action; gate pages with `inventory.item.read`; new keys for PR/GR/bill/count/transfer/settings/report; unit check once `InvLocation.unitId` exists. REST: fix scope check now (one guard) or move to the registry in I3.6. |
| 13 | **Two stock sources survive.** Unlinked `AccountProduct.qtyOnHand` is still a live stock for accounting-only shops (`acc/inventory-link.ts:289-323`, `acc/product.ts:873-881`); design "คลังถือของจริงที่เดียว". | I1.10, I1.12 | Overview/reports read through `productStockMap`-equivalent or require linking; decide a one-time "link all GOODS" migration (owner question) — not silent. |
| 14 | **Reorder / alerts.** `reorderPoint` per item only, `lowStock` loads all items then filters in JS (`inv/service.ts:781-788`); lot sweep is one 7-day window, platform cap 50 tenants without order (`:846,907-911`); design 30/7/0 + per-branch rules + "ร่าง PO". | I1.5, I1.9 | I1.5 computes in SQL per location; I1.9 replaces the sweep with per-tenant cursor (no 50 cap) and 3 windows; events `inventory.low_stock`/`lot.expired` each get a consumer (shared `outbox-consumers.ts`, append-only block). |
| 15 | **Scale caps.** `listItems` take 200 (POS, shop catalogue), `stockByLocationMap`/`lotsByItemMap` unbounded `findMany({})` (`inv/service.ts:762-779,857-868`). | I1.10, I1.8 | Overview aggregates in SQL; list screens paginate + server search (`searchItems` exists `:1140`). |
| 16 | **Things the design says are missing but exist** (scope shrink): kit/bundle (`AccountProductBundleItem` + `acc/bundle.ts`), goods issue with expense account + return + cost adjustment docs (`account.prisma:28-30`), `Supplier.partyId`, vendor portal `/vendor/[token]`, AI `inventory_create_item/adjust/consume`. | I2.8, I1.6, I1.3, I3.3, I3.2 | I2.8 = reuse/move the Accounting bundle (and add void-restore + COGS, D10); I1.6 reuses GI/GIR semantics; I1.3 drops partyId; I3.3 extends the vendor portal; I3.2 keeps the `inventory_*` tool prefix. |
| 17 | **Small factual errors in the design**: inventory GL = 1200 not 1300; kind PRODUCT not GOODS; PO has 4 statuses; QC counts; `inventory.count.confirmed` not existing. | doc | Correct DESIGN §1/§3/§5 before briefs. |

---

## 7. Existing oracles / regression suites and gaps

All `scripts/qc-*.mts` run under `pnpm qc:all` (glob, `scripts/qc-all.mts:1-6`); package aliases only for `qc:pos-inventory`, `qc:inventory-item`, `qc:inventory-account` (`package.json:41,68-69`). Check counts = `chk("…")` calls (C).
| suite | checks | covers |
|---|---|---|
| `qc-inventory.mts` | 14 | rules (avg cost, reorder, negative), create/receive/idempotent receive/consume/negative + flag/`lowStock` |
| `qc-inventory-item.mts` | 12 | update/archive/unarchive, SKU dup, cross-tenant update rejected |
| `qc-warehouse.mts` | 18 | default location, lazy seed, receive/consume per location, transfer + idempotency, invariant Σ = onHand |
| `qc-lot.mts` | 15 | lot receive/accumulate/consume/negative, barcode lookup, `expiringLots`, sweep notification |
| `qc-procurement.mts` | 14 | supplier, PO create/code, order, receive (whole PO) idempotent, cancel rules, detail |
| `qc-vendor-portal.mts` | 8 | token, isolation, rotate, disable, public page exists |
| `qc-inventory-account.mts` | 25 | GL per movement type (procurement 1200/2100, consume 5000/1200, refund, manual 3000), trial balance |
| `qc-pos-inventory.mts` | 26 | POS sale cut + COGS, void restore + reversal, trial balance |
| `qc-acc-v2-invitem.mts` | ~23 (own helper) | AccountProduct ↔ InvItem link/sync/mirror (requires acc-v2 seed) |
| accounting stock docs | – | GI/GIR/CA/bundle/opening appear in `qc-acc-v2-adjust`, `qc-acc-v2-products`, `qc-acc-v2-detail`, `qc-account-api-write-*` (by grep of `GOODS_ISSUE`/`BUNDLE`; depth **P**) |
| other callers of `consume/receive` | – | `qc-shop-refund`, `qc-clinic-refund`, `qc-member-m2.6` (gift card via POS) — regression set for any change to the stock engine |

**Gaps (none of these is exercised today, C by grep):**
1. **Concurrency**: no parallel consume/receive/adjust test anywhere (grep `Promise.all` in inventory suites = 0) — D1/D8 are invisible to QC.
2. Transfer with a foreign/archived/non-existent `locationId` (D3); `adjust` with a non-default location (§3.1 invariant).
3. `receivePo` failing mid-loop (D4); PO approval reject → re-submit (D5).
4. ADJUST/count variance → GL (none expected today; V2 must add); GL posting failure path (swallowed).
5. Decimal qty from Accounting GI/bundle into Int stock (D11); bundle COGS + void restore (D10).
6. Lot expiry round-trip through `@db.Date` with `+07:00` input (D12).
7. REST `/api/v1/inventory/items` scope enforcement (D6); page-level permission (no UI/authz oracle for inventory pages; no `visual-inventory`).
8. Multi-INVENTORY / multi-ACCOUNT tenant determinism (§2.4).
9. Sweep beyond 50 tenants (D13).
Recommended I1.1 kit: `inv-qc-env`/seed with 2 locations + 1 linked Accounting system, a concurrency oracle (N parallel consumes ⇒ exact onHand and Σ movements = onHand), and the money regression list above.

---

## 8. Live defects found on the way (not fixed)

| id | sev | where (file:line) | scenario | C/P |
|---|---|---|---|---|
| D1 | **HIGH** (qty + COGS) | `inv/service.ts:459-475` (receive), `:536-552` (consume), `:604-616` (adjust), `:64-77` (location), `:81-111` (lot) | Stock counters are read-modify-write with absolute writes and no row lock. Two consumes of 1 on `onHand=10` running together (two POS terminals, POS + web shop order, sale during a count) both read 10 and both write 9 → final 9 instead of 8; both movements say `balanceAfter 9`; Σ ledger ≠ cache; a concurrent receive can be erased entirely and the avg cost overwritten. | C (code) / P (needs a parallel run to show) |
| D2 | MED (GL) | `inv/service.ts:390-399`; `inv/account-bridge.ts:58` | Perpetual GL post runs after the movement tx inside `catch {}` with no log/outbox/retry, and picks `findFirst({type:"ACCOUNT"})` with no order and no link check. A closed period, a missing ledger code, or a second ACCOUNT system ⇒ stock moves but 1200/5000/2100 never move (or move in the wrong book), silently. | C |
| D3 | MED (qty) | `inv/actions.ts:228-246` → `inv/service.ts:679-749` (no `resolveLocationId`; `applyLocationDelta :64-77` creates rows for any id) | User with `inventory.movement.transfer` posts a form with `fromLocationId` = any string (or an archived location / another system's location) → a phantom `InvLocationStock` row goes to −qty and the real location gains +qty: stock "appears" in a branch without a receive; UI shows "(คลังถูกลบ)". Same class of bug WO 4.1 fixed for receive/consume (`:110-113`). | C |
| D4 | MED (qty) | `inv/procurement.ts:222-246` | `receivePo` flips ORDERED→RECEIVED first, then receives lines one by one outside a tx. Any line that throws (item deleted, item turned SERVICE, `lines[].itemId` from another system — unchecked at `createPo` `:140-148`) aborts the loop: PO is RECEIVED, earlier lines are in stock (and in AP), later lines never arrive, and the PO can't be received again. | C |
| D5 | MED (workflow) | `inv/procurement.ts:184-197` + `approval/service.ts:180-182` + `approval-effects.ts:36-44` | A PO whose approval is rejected stays DRAFT; pressing "สั่งซื้อ" again re-submits with the same key `approval-PurchaseOrder-<poId>` → returns the old REJECTED request → `{pending:true}` forever. The PO can only be cancelled and re-typed. | C |
| D6 | MED (data exposure) | `src/app/api/v1/inventory/items/route.ts:11-37`; `route-auth.ts:58-65` | Any valid API key of the tenant — including one scoped to another module or bound to another system — reads SKU, barcode, **cost**, onHand, reorder points of the first inventory system. Key `scopes`/`systemId` are returned by auth and never checked. (Same pattern as `/api/v1/sales`, POS review D6.) | C |
| D7 | MED-HIGH (GL) | `inv/account-bridge.ts:36-37` + `acc/gl.ts:581-600`, `acc/coa.ts:103` | Shop receives goods with the inventory PO (Dr 1200 / Cr 2100) and books the supplier's bill as an Accounting `PURCHASE` (Dr 5000 / Cr 2100): AP is doubled and the same goods hit COGS once at purchase and again at each sale (Dr 5000 / Cr 1200). No warning on either screen. | P (both paths C; needs a tenant using both) |
| D8 | LOW-MED (cost) | `inv/rules.ts:3-7` ← `inv/service.ts:470` | Receiving into negative stock (allowed by policy): old −5 @ ฿0 (new item sold before first delivery) + receive 10 @ ฿200 → avg = 2000/5 = ฿400. Per-unit cost/margin of the next sales doubles; GL totals still net out, but every cost-based report (valuation, margin, CA documents) is wrong until the item is re-costed. | C (math) |
| D9 | LOW-MED (qty) | `clinic/service.ts:203-222` | Dispensing the same drug twice in one visit: 2nd `consume` hits the key `clinic-<visit>-<item>` and is skipped, but the 2nd dispense is still appended to `dispenseJson` → patient record says 2 dispenses, stock cut once. | C |
| D10 | MED (GL + qty) | `acc/bundle.ts:95-110`; `inv/service.ts:406` (0 callers) | Selling a BUNDLE (Accounting INVOICE / cash RECEIPT `acc/service.ts:2245-2247`, or a POS sale posted via `applyExternalSale` `acc/index.ts:228`) cuts components through `consumeInTx` but **no COGS is posted** (inventory leaves it to `postMovementGlAfterTx`, never called) → 1200 stays overstated; voiding the document/bill never restores the components (no restore path; POS restore only looks at `refType PosSale`). | C |
| D11 | MED (qty vs GL) | `acc/product.ts:890,918` → `inv/service.ts:532`; `acc/bundle.ts:95` | Accounting quantities are Decimal(12,4); inventory rounds. Goods issue of 1.5 kg ⇒ stock −2, GL cost = 1.5 × cost; bundle 3 sets × 0.5 = 1.5 ⇒ −2. Quantity and value drift apart with every fractional document. | C |
| D12 | LOW (date) | `inv/actions.ts:123` → `InvLot.expiryDate @db.Date` `inventory.prisma:151` | Expiry typed "2026-10-05" becomes `2026-10-04T17:00Z`; a `@db.Date` column stores the UTC date ⇒ lot saved/displayed as 4 Oct (alerts one day early). | P (needs a DB round-trip) |
| D13 | LOW (ops) | `inv/service.ts:907-911` | `sweepExpiringLots` takes 50 ACTIVE tenants with no `orderBy`/cursor ⇒ once >50 tenants have an inventory system, some tenants may never get expiry alerts. | C |
| D14 | LOW-MED (authz) | pages `src/app/app/sys/[id]/inventory/*/page.tsx:12-14`; actions `inv/actions.ts:33-42,62-66` | Any tenant member (incl. STAFF without inventory keys, unit-limited managers) can open every inventory page and see average costs, suppliers and PO totals; actions accept any `systemId` of the tenant without checking it is an INVENTORY system (rows can be created under a POS/ACCOUNT system id). | C |

— end of report —
