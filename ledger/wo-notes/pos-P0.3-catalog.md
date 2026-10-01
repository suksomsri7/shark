# WO P0.3 · lane 3 — oracle `scripts/qc-pos-p1.1.mts` (single catalogue · P1.1a + P1.1b)

> RUN "POS ใหม่" · worktree `/root/projects/shark-pos-c` · branch `wip/pos-p0.3-catalog` · 1 ต.ค. 2569 · oracle writer: Claude Opus 5.5
> brief: `/root/projects/shark-pos/ledger/pos-briefs/pos-brief-P0.3.md` (Lane 3) + LANE-RULES + COMMON · ไม่แตะ `src/` `prisma/` หรือสคริปต์เดิม

## Controller rulings 1 Oct (survey) — override pos-brief-P1.1a (old) / POS-MIGRATION-PLAN where they differ
Source: controller message + `/root/projects/shark-pos-e/ledger/REVIEW-POS-DESIGN-2026-10-01.md` §2, §6 rows 1/2/3/14 (verified against code by me) + **pos-brief-P1.1a.md rewritten by the controller the same day** (its R1–R8 are now the builder's contract; the oracle follows it).
- **R1 scope**: `PosProduct` = `tenantId` + `systemId` (POS AppSystem) + nullable `unitId` (null = every branch) + nullable `invItemId` (unique per `(systemId, invItemId)` when set). `kind` on PosProduct (PRODUCT/SERVICE/MENU/BUNDLE). No MENU in `InvItemKind`; **no InvItems created for menus**. 1:1 assertions = every InvItem sellable in a POS system → exactly one PosProduct; every MenuItem → exactly one own PosProduct (kind MENU, `posProductId` set, `invItemId` only if `MenuItem.invItemId` already set); every ShopProduct → the PosProduct of its `invItemId`, else its own.
- **R2 price** (never cost): `AccountProduct.posPrice` (>0) → `AccountProduct.salePrice` → `InvItem.priceSatang` (SERVICE, >0) → `MenuItem.basePrice` / `ShopProduct.priceSatang` for their own rows → null. Each rung has its own fixture; cost-only → null.
- **R3 columns**: `posProductId` on MenuItem / ShopProduct / ShopOrderLine; `productId` on PosSaleLine / RestaurantOrderItem (ShopOrderLine.productId is the existing FK to ShopProduct — oracle asserts it stays NOT NULL).
- **R4 indexes**: plain CREATE INDEX; the oracle only checks that indexes exist, never how they were created.
- **R5 P1.1b**: dual-write asserted for every writer the survey found (each verified to exist, file:line below).
- Brief P1.1a (new): no `PosVariant` table, `PosProduct.parentId` instead · ctx = `{tenantId, systemId, actorUserId|null}` · backfill prints `JSON_SUMMARY` + `skippedNoPosSystem` · migration folder `<ts>_pos_v2_a` · audit row per write · listForUnit server-side search + pagination, no 200 cap · facade export.

### What changed in the oracle after the rulings (first draft → final)
| was (first draft, old brief/MIG) | now |
|---|---|
| PosProduct 1:1 InvItem, `invItemId` NOT NULL + unique; backfill creates InvItem for every MenuItem/shop-only product | `invItemId` nullable, unique `(systemId, invItemId)`; backfill must create **0** InvItems (S1.8, S1.25) |
| `ShopOrderLine.productId` new column | `ShopOrderLine.posProductId`; old `productId` must stay NOT NULL (S1.2) |
| price: salePrice → SERVICE priceSatang → menu → shop | posPrice(>0) → salePrice → SERVICE priceSatang(>0) → own menu/shop → null; new fixtures posPrice 4500/5000, posPrice 0, SERVICE 0 (S1.14) |
| PosVariant table or parentId | parentId required, PosVariant forbidden (S1.1) |
| ctx `{tenantId, actor:{role,unitAccess,permissions}}` | ctx `{tenantId, systemId, actorUserId}`; X3.2 grants `pos.product.setPrice` by temporarily editing the cashier's Membership.permissions (restored in finally + verified by snapshot) |
| summary line `BACKFILL_SUMMARY`, `skipped.noPosSystem` | `JSON_SUMMARY` (BACKFILL_SUMMARY still accepted), `skippedNoPosSystem` (old key still accepted) |
| no unit/system resolution | resolution per selling path (see below) + fixture branch without POS (S1.6, S1.10, S1.11) |
| — | new S1.37 (search + pagination, 201 bulk items), S1.38 (AuditLog), S1.26 facade, X2.1 foreign-systemId ctx, S2.20–S2.27 (R5 writers) |

## Checkpoint
| # | step | state |
|---|---|---|
| 1 | read brief/contracts/code | ✅ |
| 2 | write `scripts/qc-pos-p1.1.mts` | ✅ 79 checks (P1.1a 51 · P1.1b 28) |
| 3 | A1 run via qc4 → SKIPPED exit 0 | ✅ |
| 4 | A2 `--list` | ✅ |
| 5 | A3 `QC_FORCE=1` → red for the right reason, no crash | ✅ |
| 6 | A4 typecheck (once, end) | see §A4 |
| 7 | A5 row counts before/after | ✅ |
| 8 | commit + push | see §Commits |

## "Which POS system does a row belong to" (what the oracle expects — traced in today's code)
| source | resolution (code today) | oracle helper | no POS |
|---|---|---|---|
| InvItem | register lists InvItems of the INVENTORY system linked (AppSystemUnit) to a unit of the POS system (`pos/register.ts:125-152` resolvePosLinks → posCatalog) ⇒ POS S sells inventory I iff some unit has both `AppSystemUnit(type INVENTORY)=I` and `(type POS)=S` | `posOfInventory()` | 0 POS **or >1 POS** ⇒ skipped + counted in `skippedNoPosSystem.invItem` (ambiguity is never guessed) |
| MenuItem | restaurant checkout `systemForUnit(tenantId, unitId, "POS")` (`restaurant/order.ts:421`) | `posOfUnit()` | unit without POS link ⇒ skipped, `posProductId` stays null, counted (fixture: temp unit `…-nopos`) |
| ShopProduct | shop checkout `listSystems(tenantId,"POS")[0]` = **first POS of the tenant by createdAt**, regardless of the unit (`shop/service.ts:217`) | `firstPosOfTenant()` | only a tenant with no POS at all is skipped; a shop product in a unit without POS link is **still linked** (code wins over the controller's "unit has no POS ⇒ skip" wording — flagged) |
`unitId` on the product: MenuItem/ShopProduct → their unit; InvItem-derived → null (all branches).

## P1.1b writer paths asserted (R5 — each verified to exist in `src/lib/modules/…` today)
| writer (file:line) | check |
|---|---|
| `restaurant/menu.ts:231` createItem · `:279` updateItem · `:299` setItemOptionGroups · `:314` duplicateItem · `:341` archiveItem · `:347` setItemStock | S2.1–S2.6, S2.18, X6.5 |
| `restaurant/menu.ts:95` createCategory · `:116` archiveCategory · `:137` createOptionGroup (choice priceDelta) · `:178` archiveOptionGroup | S2.26, S2.27 |
| `shop/service.ts:43` createProduct · `:74` updateProduct | S2.7–S2.9 |
| `pos/register.ts:266` setItemSalePrice → `account/service.ts:568` updateAccountProductSalePrice | S2.10, S2.11 |
| `account/product.ts:567` updateProduct (salePrice · vatRateBp · posPrice) | S2.11, S2.25 |
| `inventory/service.ts:190` createItem · `:312` updateItem (InvItem.priceSatang) | S2.12, S2.20 |
| `account/inventory-link.ts:190` linkProductToItem (copies salePrice into a new InvItem) | S2.21 |
| `ai/proposals.ts:455` runKind → `:608` `inventory_create_item` | S2.22 |
| `booking/service.ts:310` importServicesToCatalog · `:224` serviceRoster (re-syncs `BookingService.priceSatang`) | S2.23, S2.24 |
| reverse direction catalog → legacy (AccountProduct / MenuItem / ShopProduct / InvItem+BookingService) | S2.13–S2.16, S2.24 |
| F15.1 ratchet empty (`scripts/fitness-pos.mts` CATALOG_WRITER_BASELINE + scanCatalogWriters) | S2.19 |
Not covered (stock/availability writers, not catalogue): `restaurant/order.ts` menu `stockQty`/86 decrements (survey §2.5 note) and `menu.resetDailyStock` — P1.1b/P2.4 must decide where they live; the F15.1 baseline cannot reach zero while they stay in order.ts.

## Check table (id · what it proves · X-group) — same text as `--list`

| id | what it proves | X |
|---|---|---|
| P1.1-S1.1 | ตารางใหม่มีจริง: PosProduct (+parentId ว่างไว้ให้ P1.2) · PosCategory · PosProductOptionGroup · RecipeLine · ไม่มีตาราง PosVariant | - |
| P1.1-S1.2 | คอลัมน์เชื่อมใหม่ nullable ครบ (R3): MenuItem/ShopProduct/ShopOrderLine.posProductId · PosSaleLine/RestaurantOrderItem.productId | - |
| P1.1-S1.3 | PosProduct มีคอลัมน์สัญญา (tenantId · systemId · unitId? · invItemId? · name · nameEn · kind · categoryId · basePriceSatang? · vatRateBp · stationId · dailyStockQty · images · archivedAt) · unique(systemId, invItemId) · kind ∋ PRODUCT/SERVICE/MENU/BUNDLE · index บนคอลัมน์เชื่อมทุกตัว (ไม่ตรวจโหมดสร้าง) | - |
| P1.1-S1.4 | migration <ts>_pos_v2_a additive ล้วน: ไม่มี DROP/RENAME/SET NOT NULL/ADD COLUMN NOT NULL ไร้ DEFAULT บนตารางเดิม · ALTER TYPE ADD VALUE ไม่ปนไฟล์ DDL อื่น · ไม่แตะ enum InvItemKind | - |
| P1.1-S1.5 | src/lib/core/scope.ts ลงทะเบียนตารางใหม่ทุกตัว (F1 fail-closed) | - |
| P1.1-S1.6 | backfill --dry-run: exit 0 + JSON_SUMMARY นับต่อแหล่ง (invItem · menuItem · shopProduct) ตรง DB + skippedNoPosSystem ตรงกับแหล่งที่หา POS ไม่เจอตามทางขายจริง | - |
| P1.1-S1.7 | backfill --dry-run ไม่เขียนอะไรเลย (ตารางใหม่ · คอลัมน์เชื่อม · ตารางเดิม เท่าเดิมทุก byte) | - |
| P1.1-S1.8 | backfill จริง: exit 0 · created.posProduct = ที่ dry-run ทำนาย = แถวที่เพิ่มจริง · ไม่สร้าง InvItem เลย (R1) | - |
| P1.1-S1.9 | InvItem ที่ขายได้ใน POS (คลังผูกสาขาที่มี POS) → PosProduct เดียว systemId = POS ของสาขานั้น · ไม่มีกำพร้า/ชี้ข้ามร้าน · systemId เป็นระบบ POS ของร้านเดียวกัน | - |
| P1.1-S1.10 | ทุก MenuItem (สาขามี POS) → PosProduct ของตัวเอง 1 แถว: kind MENU · unitId = สาขาเมนู · invItemId = MenuItem.invItemId (null ถ้าไม่เคยผูก) · สาขาไม่มี POS = ไม่ผูก | - |
| P1.1-S1.11 | ทุก ShopProduct → POS ตัวแรกของร้าน (ทางเดียวกับ shop checkout): มี invItemId → ชี้ PosProduct ของ InvItem นั้น · ไม่มี → PosProduct ของตัวเอง (PRODUCT · unitId สาขา · invItemId null) — แม้สาขาไม่ผูก POS | - |
| P1.1-S1.12 | สองแหล่งชี้ InvItem เดียวกัน = PosProduct เดียว: เว็บร้าน→น้ำดื่ม ชี้ตัวของน้ำดื่ม · เมนู→โค้ก ถือ invItemId โค้ก (ไม่มีแถว PRODUCT ซ้ำของโค้ก) | - |
| P1.1-S1.13 | ราคาขั้น 2 (salePrice) ตรงสตางค์ทุกสินค้าใน seed รวมราคา 0 บาท (น้ำฟรี · น้ำแข็ง) | X4 |
| P1.1-S1.14 | ลำดับราคาทีละขั้นด้วย fixture ของตัวเอง: posPrice 4500 ชนะ salePrice 5000 · posPrice 0 ไม่นับ (→ salePrice) · SERVICE 15000 · SERVICE ราคา 0 ไม่มีบัญชี = null · เมนู 9900 · เว็บล้วน 12345 · มีแต่ต้นทุน = null · ทุกแถวตรงสูตร | X4 |
| P1.1-S1.15 | VAT ต่อสินค้า: vatRateBp = AccountProduct.vatRateBp (ไข่ 0 · อื่น 700) · ไม่มีบัญชี = null | X8 |
| P1.1-S1.16 | หมวด: เมนู → PosCategory ชื่อ/ชื่ออังกฤษเดียวกับ MenuCategory · 1 PosCategory ต่อ MenuCategory (สาขามี POS · ไม่ซ้ำ) | - |
| P1.1-S1.17 | ฟิลด์เมนูย้ายครบ: stationId · dailyStockQty · images (ลำดับเดิม) | - |
| P1.1-S1.18 | ตัวเลือก: PosProductOptionGroup (groupId · sortOrder) = MenuItemOptionGroup ของเมนูทุกตัว · MenuOptionGroup ใช้ต่อ ไม่สร้างใหม่ | - |
| P1.1-S1.19 | บาร์โค้ดคงเดิม: byBarcode หา PosProduct เจอทุกบาร์โค้ดใน seed (น้ำดื่ม · โค้ก) | - |
| P1.1-S1.20 | InvItem ที่เก็บถาวร → PosProduct archivedAt ไม่ว่าง และไม่โผล่ใน listForUnit | - |
| P1.1-X1.1 | backfill รอบสอง: created ทุกตัว = 0 · updated ทุกตัว = 0 · ตารางใหม่ checksum เท่าเดิม | X1 |
| P1.1-X6.1 | backfill 2 โปรเซสพร้อมกัน (connection แยก) × 3 รอบ บนแหล่งใหม่ทุกรอบ → ต่อแหล่ง 1 แถว ไม่ซ้ำ · ทั้งคู่ exit 0 | X6 |
| P1.1-S1.21 | จอเดิม: เมนูร้านอาหาร (menu.listItems · orderingMenu · storefront.publicMenu) เหมือนก่อน backfill | - |
| P1.1-S1.22 | จอเดิม: หน้าร้านเว็บ (shop.listProducts activeOnly) เหมือนก่อน backfill | - |
| P1.1-S1.23 | จอเดิม: register.posCatalog เหมือนก่อน backfill ทุกรายการ (ราคา/ชื่อ/บาร์โค้ด · ไม่มีรายการเพิ่ม) | - |
| P1.1-S1.24 | createSale ด้วย id เดิม (itemId=InvItem) ยังขายได้ และ subtotal/discount/vat/grand + บรรทัด เท่าก่อน backfill เป๊ะ | X4 |
| P1.1-S1.25 | rollback ระหว่างทาง: แถวเดิมของตารางเก่า checksum เท่าก่อน backfill (ยกเว้น updatedAt/คอลัมน์เชื่อมใหม่) · ไม่มีแถวเพิ่ม/หายในตารางเก่า | - |
| P1.1-S1.26 | catalog.ts export ครบ 7 ฟังก์ชัน (createProduct · updateProduct · setPrice · archive · listForUnit · byBarcode · ensureForInvItem) และ facade pos/index.ts ส่งต่อครบ | - |
| P1.1-S1.27 | createProduct ถูกต้อง → PosProduct systemId = POS ใน ctx · ราคา/VAT ตรงสตางค์ · invItemId null หรือ InvItem ในคลังที่ผูก POS ของร้านเดียวกัน | X4 |
| P1.1-S1.28 | createProduct ปฏิเสธ: ชื่อว่าง · ราคาติดลบ · ราคาเศษสตางค์ · บาร์โค้ดซ้ำในระบบ POS — และไม่เขียนอะไรเลย | X4 |
| P1.1-S1.29 | updateProduct: ชื่อ/ชื่ออังกฤษ/หมวด เปลี่ยนจริง · listForUnit เห็นค่าใหม่ · จำนวนแถวไม่เพิ่ม | - |
| P1.1-S1.30 | setPrice: ตั้งได้ตรงสตางค์ (รวม 0) · ปฏิเสธติดลบ/เศษสตางค์/NaN/สตริง โดยราคาเดิมไม่เปลี่ยน | X4 |
| P1.1-S1.31 | archive: หายจาก listForUnit · กดซ้ำไม่ error · แถวยังอยู่ (soft) | - |
| P1.1-S1.32 | listForUnit คืนทรง POS-API §1: {id, invItemId, name, nameEn, kind, categoryId, basePriceSatang, images[], optionGroups[], variants[], recipe[], channelPrices[], availability{unitId→bool}, stock{unitId→qty}} · เงินเป็น Int | - |
| P1.1-S1.33 | listForUnit: active ของระบบครบ (unitId null + unitId สาขานี้ · ไม่มีของสาขาอื่น) · stock[unit] = InvItem.onHand · availability[unit] = true · ตัวเลือกเมนูมี choices.priceDelta Int | - |
| P1.1-S1.34 | byBarcode: ตรงตัวในระบบ · บาร์โค้ดไม่มี = null | - |
| P1.1-S1.35 | ensureForInvItem: เรียกซ้ำได้ id เดิม (created=false) · InvItem ใหม่ได้ราคาตามลำดับ R2 | X1 |
| P1.1-S1.37 | listForUnit ค้นฝั่ง server ด้วยชื่อไทย/SKU/บาร์โค้ด + แบ่งหน้า · ไม่มีเพดาน 200 (สินค้า >200 ตัวเดินครบทุกหน้า ไม่ซ้ำ) | - |
| P1.1-S1.38 | ทุกการเขียน (createProduct · setPrice · archive) มีแถว AuditLog targetType PosProduct · targetId · actorId = ผู้กด | - |
| P1.1-X2.1 | ข้ามร้าน: updateProduct/setPrice/archive ด้วย productId ของอีกร้าน · ctx ที่ systemId เป็น POS ของอีกร้าน → ปฏิเสธ และแถวไม่เปลี่ยน | X2 |
| P1.1-X2.2 | ข้ามร้าน: ensureForInvItem(InvItem ร้านอื่น) ปฏิเสธ · byBarcode บาร์โค้ดร้านอื่น = null · listForUnit(สาขาร้านอื่น) ปฏิเสธ/ว่าง · ไม่มี id ร้านอื่นรั่ว | X2 |
| P1.1-X2.3 | ข้ามสาขา: แคชเชียร์ (unitAccess=สีลม) listForUnit/byBarcode สาขาอารีย์ → ปฏิเสธ · สีลมได้ | X2 |
| P1.1-X3.1 | setPrice โดย STAFF ที่ไม่มี pos.product.setPrice → ปฏิเสธ ราคาไม่เปลี่ยน | X3 |
| P1.1-X3.2 | setPrice โดย STAFF ที่ Membership.permissions มี pos.product.setPrice=true → ได้ · OWNER ได้ | X3 |
| P1.1-X3.3 | createProduct/updateProduct/archive โดย STAFF ที่ไม่มี pos.product.manage → ปฏิเสธ ไม่เขียน | X3 |
| P1.1-X6.2 | ensureForInvItem 10 เลนพร้อมกัน (connection แยก) × 3 รอบ → PosProduct 1 แถวต่อ InvItem · ทุกเลนได้ id เดียวกัน | X6 |
| P1.1-X6.3 | setPrice 10 เลนพร้อมกัน → ไม่ error · ราคาสุดท้ายเป็นหนึ่งในค่าที่ส่ง · แถวเดียว | X6 |
| P1.1-X6.4 | setPrice 5 เลน + updateProduct(nameEn) 5 เลนพร้อมกัน → ไม่มี lost update (ราคาและ nameEn เปลี่ยนทั้งคู่) | X6 |
| P1.1-X8.1 | ไม่เชื่อมบัญชี: setPrice สินค้าที่ไม่มี AccountProduct ได้ · ไม่สร้าง AccountProduct · InvItem.accountProductId ยัง null | X8 |
| P1.1-X9.1 | event outbox ตระกูล pos.* ที่เกิดระหว่างรัน (ถ้ามี) มี consumer ลงทะเบียนครบ | X9 |
| P1.1-S2.1 | menu.createItem → PosProduct ใหม่ 1 แถว (MENU · unitId · ราคา · หมวด · ตัวเลือก) + MenuItem.posProductId | - |
| P1.1-S2.2 | menu.updateItem ราคา/ชื่อ → PosProduct ตาม · ไม่เพิ่มแถว | - |
| P1.1-S2.3 | menu.setItemOptionGroups (สลับลำดับ) → PosProductOptionGroup ตาม | - |
| P1.1-S2.4 | menu.duplicateItem → เมนูสำเนาได้ PosProduct ของตัวเอง (ไม่แชร์กับต้นฉบับ) | - |
| P1.1-S2.5 | menu.archiveItem → PosProduct ของเมนูนั้นถูกเก็บถาวร · ต้นฉบับไม่กระทบ | - |
| P1.1-S2.6 | menu.setItemStock dailyStockQty → PosProduct.dailyStockQty ตาม | - |
| P1.1-S2.7 | shop.createProduct (ไม่ผูกคลัง) → PosProduct ใหม่ 1 แถว ราคา = priceSatang + ShopProduct.posProductId | - |
| P1.1-S2.8 | shop.createProduct ผูก InvItem ที่มี PosProduct แล้ว → ชี้ตัวเดิม ไม่สร้างแถวใหม่ | - |
| P1.1-S2.9 | shop.updateProduct ราคา: เว็บล้วน → PosProduct ตาม · แชร์กับ InvItem ที่มีราคาบัญชี → ราคา POS ไม่ถูกเขียนทับ | - |
| P1.1-S2.10 | register.setItemSalePrice (หน้า สินค้า/ราคา เดิม) → PosProduct.basePriceSatang ตาม | - |
| P1.1-S2.11 | account.updateAccountProductSalePrice + account/product.updateProduct (salePrice · vatRateBp) → PosProduct ตาม | - |
| P1.1-S2.12 | inventory.createItem → PosProduct ทันที (PRODUCT ราคา null · SERVICE ราคา = priceSatang) | - |
| P1.1-S2.13 | ย้อนทาง: catalog.setPrice สินค้าผูกบัญชี → AccountProduct ตาม → register.posCatalog เห็นราคาใหม่ | - |
| P1.1-S2.14 | ย้อนทาง: catalog.setPrice เมนู → MenuItem.basePrice ตาม → orderingMenu เห็นราคาใหม่ | - |
| P1.1-S2.15 | ย้อนทาง: catalog.setPrice/updateProduct สินค้าเว็บล้วน → ShopProduct.priceSatang/name ตาม → หน้าร้านเว็บเห็น | - |
| P1.1-S2.16 | ย้อนทาง: catalog.archive เมนู → MenuItem ARCHIVED + หายจาก orderingMenu | - |
| P1.1-S2.17 | ไม่เขียนซ้อน: แก้ผ่านผู้เขียนเดิมด้วยค่าเดิมซ้ำ → จำนวน PosProduct/AccountProduct/InvItem ไม่เพิ่ม | - |
| P1.1-S2.18 | เมนูที่ชี้ InvItem มีราคาบัญชี (เมนู→โค้ก) แก้ basePrice → ราคา POS ไม่ถูกเขียนทับ (ลำดับ R2) | - |
| P1.1-S2.19 | F15.1: CATALOG_WRITER_BASELINE ว่าง และตัวสแกนพบผู้เขียนแคตตาล็อกที่ catalog.ts ที่เดียว | X12 |
| P1.1-S2.20 | inventory.updateItem ราคา SERVICE (InvItem.priceSatang) → PosProduct ตาม | - |
| P1.1-S2.21 | account/inventory-link.linkProductToItem (สร้าง InvItem จากสินค้าบัญชี) → PosProduct ของ InvItem ใหม่ ราคาตาม R2 | - |
| P1.1-S2.22 | AI proposal inventory_create_item (ai/proposals.runKind) → PosProduct ของ InvItem ใหม่ | - |
| P1.1-S2.23 | booking.importServicesToCatalog (BookingService เก่า → InvItem SERVICE) → PosProduct SERVICE ราคา = BookingService.priceSatang | - |
| P1.1-S2.24 | ย้อนทาง: catalog.setPrice บริการ → InvItem.priceSatang ตาม → booking.serviceRoster + BookingService.priceSatang เห็นราคาใหม่ | - |
| P1.1-S2.25 | account/product.updateProduct posPrice → PosProduct = posPrice (ขั้น 1 ของ R2) | - |
| P1.1-S2.26 | menu.createCategory → PosCategory ชื่อเดียวกัน 1 แถว · archiveCategory → PosCategory เก็บถาวร | - |
| P1.1-S2.27 | menu.createOptionGroup + archiveOptionGroup → listForUnit ของเมนูที่ผูก เห็นตัวเลือก priceDelta ตรง แล้วหายเมื่อเก็บถาวร | - |
| P1.1-X6.5 | แข่งกัน: menu.updateItem ราคา ↔ catalog.setPrice เมนูเดียวกัน 10 เลน × 3 รอบ → MenuItem.basePrice = PosProduct.basePriceSatang ทุกรอบ | X6 |
| P1.1-S1.36 | rollback ปลายทาง: ลบแถวตารางใหม่ที่รันนี้สร้าง + คืนคอลัมน์เชื่อม + ลบ fixtures → ตารางเดิม (จำนวน + checksum) และตารางใหม่ เท่าก่อนรัน · ร้าน QC กลับสภาพเดิม | X5 |

Groups: S1.1–S1.38 + X1/X2/X3/X6/X8/X9 = P1.1a (guard: model+table PosProduct, catalog.ts, backfill script). S2.1–S2.27 + X6.5 = P1.1b (own guard: one of the 8 legacy writer files imports `pos/catalog`; until then the group is skipped and listed in `skippedGroups`).

### X-groups that do not apply (one line each)
- **X5 void/refund**: P1.1 creates no money documents; the only "reverse" is the migration rollback story → S1.25 (mid-run) + S1.36 (end of run, tagged X5). Void/refund reversal belongs to P1.8.
- **X7 time**: catalogue has no business-day logic; no check depends on a date (no "day N", timestamps only compared to the run start `t0`). Availability windows of MenuCategory are copy-only in P1.1a (R6) — P2.4 owns them.
- **X10 visual / X11 touch**: no UI in P1.1a/b (brief R8). Old screens are asserted at data level (S1.21–S1.23), pixels are the visual lane's.
- **X12 no env**: F15.1 is a static fitness rule; S2.19 imports `scripts/fitness-pos.mts` and checks the baseline is empty (ratchet) — the no-env run of `pnpm fitness` itself is the builder's A5, not this oracle.
- **X4** applied as integer-satang + exact equality (S1.13/14/24/27/28/30); there is no Σpay/VAT math in a catalogue.

## Names I had to invent (controller must ratify before the builder starts)
| name / shape | where used | why |
|---|---|---|
| `CatalogCtx = {tenantId, systemId, actorUserId: string \| null}`; `null` = system caller (backfill / legacy writers) — permission checks skipped, tenant/system checks still apply | every catalog call | brief gives the ctx keys but not the system-caller convention |
| every catalog function takes an optional **trailing `client`** (PrismaClient or tx) like `createSale(input, client)` | X6.2–X6.5 lanes on separate connections | needed to race on separate connections; house convention (`createSale`, member facade) |
| refusal = **throw** or return **`{ok:false, reason}`** — the oracle accepts both, never inspects the message | all refusal checks | no error-code contract exists for catalog |
| `createProduct(ctx, {name, nameEn?, kind?, categoryId?, basePriceSatang, vatRateBp?, barcode?, unitId?, invItemId?})` → `{id, …}` (or id string) | S1.27–S1.29, X2/X3 | brief names the function only. `invItemId` of the new row may be null **or** an InvItem in a POS-linked inventory system of the same tenant (builder's choice) |
| `updateProduct(ctx, id, patch {name?, nameEn?, categoryId?})` · `setPrice(ctx, id, priceSatang: number)` (Int ≥ 0 only; NaN/float/string/negative refused) · `archive(ctx, id)` (soft, idempotent) | S1.29–S1.31 | |
| `listForUnit(ctx, unitId, opts? {q?, limit?, cursor?})` → array **or** `{items, nextCursor}`; items = POS-API §1 shape | S1.32/33/37 | brief: server search + pagination; opts names invented |
| `byBarcode(ctx, unitId, barcode)` → product view or `null` | S1.19/34, X2 | |
| `ensureForInvItem(ctx, invItemId)` → `{id, created: boolean}` | S1.35, X6.2 | `created` flag invented (needed to prove idempotency) |
| permission keys: price change = `pos.product.setPrice` (exists today); create/update/archive = **`pos.product.manage`** (spec §9 key, not yet in `src/lib/core/permissions.ts`) · `listForUnit`/`byBarcode` need only unit access (cashier must sell) | X2.3, X3.1–X3.3 | |
| AuditLog rows: `targetType = "PosProduct"`, `targetId` = product id, `actorId` = actorUserId, `action` matches `^pos\.product\.` and contains create/price/archive wording | S1.38 | via existing `writeAudit` |
| PosProduct columns: `systemId, unitId, invItemId, name, nameEn, kind (enum ∋ PRODUCT/SERVICE/MENU/BUNDLE), categoryId, basePriceSatang (nullable), vatRateBp (nullable), stationId, dailyStockQty, images, archivedAt, parentId` | S1.3 etc. | `vatRateBp`, `stationId`, `dailyStockQty`, `images` names invented (R6 says "copy menu fields" without names) |
| `PosProductOptionGroup(productId, groupId → MenuOptionGroup, sortOrder)` · `PosCategory(tenantId, [unitId], name, nameEn, archivedAt)` | S1.16/18, S2.26 | |
| read model: `optionGroups[].id` (or `groupId`), `optionGroups[].choices[].priceDelta` (or `priceDeltaSatang`) · `stock[unitId]` = `InvItem.onHand` (system total — no unit-level stock exists) · `availability[unitId]` boolean | S1.33, S2.27 | §1 gives only top-level keys |
| backfill CLI: `--tenant=<id>` (repeatable) limits the run to those tenants; `--dry-run`; last line `JSON_SUMMARY {dryRun, sources:{invItem,menuItem,shopProduct}, perSystem:{…}, skippedNoPosSystem:{invItem,menuItem,shopProduct}, created:{posProduct,posCategory,posProductOptionGroup,…}, updated:{posProduct,menuItem,shopProduct,…}}` — in dry-run `created/updated` = "would" | S1.6–S1.8, X1.1, X6.1 | without `--tenant` the oracle would backfill every tenant of QC4 (forbidden: temp rows only in POS QC tenants) |
| VAT on PosProduct = `AccountProduct.vatRateBp` copied; no AccountProduct → null | S1.15, S2.11 | VAT per product is nowhere in the POS docs |
| precedence detail: `salePrice = 0` is a deliberate zero (null = unset) and is kept; `posPrice = 0` is ignored (rule says >0); SERVICE `priceSatang = 0` with no AccountProduct → null (default 0 cannot be told from "unset") | S1.13/S1.14 | brief R4 asks the oracle to decide and flag |
| MenuItem with `invItemId` (fixture: menu → Coke InvItem): the **MENU row holds the invItemId** and is the single row of that InvItem (no extra PRODUCT row); its price follows R2 (AccountProduct.salePrice 2000 beats basePrice 2500) | S1.12/S1.14, S2.18 | literal reading of R1; two menus pointing at the same InvItem (unique clash) is NOT tested — needs a ruling |
| dual-write precedence: a legacy price write on a row that is not the top price source (shop price of a shared InvItem, basePrice of a menu whose InvItem has an AccountProduct price) does **not** overwrite `basePriceSatang` | S2.9, S2.18 | no doc covers multi-source rows |
| `catalog.setPrice` on an InvItem with AccountProduct writes `AccountProduct.salePrice` (posPrice null) so the old register (`posCatalog` reads salePrice) shows it; on a SERVICE writes `InvItem.priceSatang` (booking roster follows); on a menu writes `MenuItem.basePrice`; on a shop-only row writes `ShopProduct.priceSatang` | S2.13–S2.15, S2.24 | "AccountProduct ซิงก์ตาม" in DESIGN §4 M4 without detail |

## Contradictions found (documents vs real code) — code wins
1. MIG §2 / old brief: "every MenuItem → new InvItem kind=MENU", "PosProduct 1:1 InvItem" — `InvItemKind` has only PRODUCT/SERVICE (`inventory.prisma:14-17`); InvItem is per inventory system, MenuItem/ShopProduct per unit. Resolved by R1.
2. Old brief: nullable `productId` on `ShopOrderLine` — `ShopOrderLine.productId` already exists (`ecommerce.prisma:58-59`). R3.
3. MIG §2 step 3 names the oracle `qc-pos-catalog-backfill.mts`; P0.3/P1.1a briefs say `qc-pos-p1.1.mts` (used).
4. MIG §1 "CREATE INDEX CONCURRENTLY / -- @concurrent" — impossible inside prisma migrate (repo note in `20260731170000_businessunit_slug_index/migration.sql`). R4.
5. "Price = AccountProduct.salePrice" (MIG/old brief) vs today's register: `posCatalog` uses salePrice **if > 0 else `InvItem.costSatang`** (`pos/register.ts:149`) and services use `InvItem.priceSatang` (`:168-178`); `AccountProduct.posPrice` is written by the account UI but never read by POS. The oracle asserts R2 (never cost) — so for a cost-only item the new catalogue says "price not set" while the old register still shows cost (old screen unchanged, S1.23).
6. Old register list is capped at **200 newest PRODUCT items** (`inventory/service.ts:793-799`). S1.37 seeds 201 temp items: while the oracle runs, the coffee shop's old register (and `posCatalog`) temporarily does not show some seed items — this is why the createSale probe now takes seed ids/prices from `pos-expected.json` instead of the register list.
7. Controller wording "a unit with no POS system ⇒ skipped" vs shop checkout code (first POS of the tenant, unit ignored — `shop/service.ts:217`). The new brief says code wins → oracle links such ShopProducts; only MenuItems are skipped per unit.
8. Spec §9 permission `pos.product.manage` does not exist in `src/lib/core/permissions.ts` (only `pos.product.setPrice`, `pos.sale.create`, `pos.sale.void`).
9. `docs/modules/14-pos.md` §4 `PosProduct` (unit-scoped, own `stockQty`, `price Int`) is the July spec, superseded by DESIGN §7 (stock stays in Inventory) — oracle follows DESIGN + rulings.

## Criteria I could not test (and why)
- Tenant with **no POS system / no INVENTORY system / no ACCOUNT link**: both POS QC tenants have all three and the lane rule forbids creating tenants. Only expressed through computed `skippedNoPosSystem` counts; "no-accounting shop" is approximated by an item without AccountProduct (X8.1).
- **Two POS systems** sharing one inventory (ambiguous InvItem) and **two menus pointing at one InvItem**: need a second POS AppSystem in a QC tenant, which would change the old shop checkout ("first POS") for every other lane's tests while running — left as an open ruling, counted only.
- **Production guard** of the backfill (`ALLOW_PROD_BACKFILL=1` + prior dry-run): cannot be exercised without pointing at prod; reviewer reads the code.
- **"rollback = drop new tables"** literally: not executed (destructive on shared QC4). Replaced by S1.25 (old rows' checksums untouched by backfill) + S1.36 (deleting everything new + nulling link columns restores old tables bit-for-bit, `updatedAt` excluded).
- **P1.1b AI proposal path** goes through `runKind` (S2.22) which may write side rows the oracle does not snapshot (e.g. AI audit tables) — cleanup covers AuditLog and every snapshotted table; anything else would show as leftover only by inspection.
- Pixel parity / old pages rendering: data-level only (S1.21–S1.23); pages need a running app (CONTROLLER-RUN).
- Concurrency with **other lanes** writing the same POS QC tenants during a run can make S1.25/S1.36/row-count comparisons flaky (snapshot-based); run the oracle alone on QC4.

## Acceptance
**A1** `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.1.mts` → exit 0
```
⏭️  SKIPPED — P1.1a ยังไม่สร้าง (ขาด: model PosProduct ใน prisma/schema · ตาราง PosProduct ใน DB (migration ลงแล้ว) · src/lib/modules/pos/catalog.ts · scripts/pos-backfill-catalog.mts)
===== qc-pos-p1.1 ===== ผ่าน 0/0 (SKIPPED)
JSON_SUMMARY {"suite":"qc-pos-p1.1","total":0,"passed":0,"failed":[],"skipped":"P1.1a ยังไม่สร้าง (…)","catalogue":79,"p11bStarted":false,"seeded":true,"missing":[4 items]}
```
POS QC seed **is present** on QC4 (`seeded:true` — `resolvePosScope` coffee + resto found); the oracle never seeds.

**A2** `bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p1.1.mts --list` → exit 0, no env/DB touched (exits before `loadPosQcEnv`), 79 lines + `รวม 79 ข้อ · P1.1a 51 · P1.1b 28`.

**A3** `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-pos-p1.1.mts` (note: `QC_FORCE=1` must be inside the iso chain — iso.sh does not forward the caller's env) → exit 1, `ผ่าน 7/79`, no crash, every red names its reason:
- S1.1–S1.5 red: `ขาด: PosProduct,PosCategory,…` / no migration / scope.ts missing models.
- S1.6/S1.7 red: backfill script missing (exit ≠ 0, no JSON_SUMMARY); sections that need the table end with `relation "PosProduct" does not exist` and mark all their ids red.
- S1.26 red `catalog ขาด: createProduct,…`; the catalog section marks its 23 ids red with that reason; S2 group (forced) red with `ไม่มี catalog.ts`.
- Green under force, correctly: S1.21–S1.25 (no backfill happened, so old screens/createSale/old rows are trivially unchanged — they are regression guards), X9.1 (no pos.* events emitted), S1.36 (cleanup restored everything).
- `ROWCOUNTS_BEFORE` = `ROWCOUNTS_AFTER` in the forced run too (all fixtures — 214 InvItems, temp unit, menus, shop products, option groups, AccountProducts — removed).

**A5** QC4 left as found — POS QC tenants row counts identical before/after in every run (SKIPPED and forced):
`{"BusinessUnit":3,"AppSystemUnit":13,"InvItem":9,"InvItemImage":0,"InvLocationStock":3,"InvMovement":3,"AccountProduct":8,"MenuCategory":3,"MenuItem":4,"MenuOptionGroup":0,"MenuOptionChoice":0,"MenuItemOptionGroup":0,"KdsStation":2,"ShopProduct":0,…,"BookingService":0,"Membership":4,"AppSystem":8,"OutboxEvent":0}` (forced run: S1.36 green = legacy + new tables checksum-identical to the pre-run snapshot, cashier Membership.permissions restored).

**A6** this file.

**A4** typecheck — see below.

### A4 typecheck (lane rule 5 command)
- run 1: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` → exit 2 · 1 error, in this oracle only: `scripts/qc-pos-p1.1.mts(737,60): error TS7053` (`after[k]` on a typed object) → fixed by typing `after: Any` (no behaviour change; A1 re-run exit 0 SKIPPED).
- run 2 (allowed because run 1 found errors): same command → **exit 0** (`tsc --noEmit`, no output).

## Temp data left
None. Every run printed identical `ROWCOUNTS_BEFORE`/`ROWCOUNTS_AFTER` for the POS QC tenants; the forced run's S1.36 confirms legacy + new tables are checksum-identical to the pre-run snapshot. Scratch logs only in the session scratchpad (not in the repo).
