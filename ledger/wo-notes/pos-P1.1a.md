# WO P1.1a — แคตตาล็อกเดียว: ตาราง + backfill (ไม่มี UI · จอเดิมไม่เปลี่ยนพฤติกรรม)

> RUN "POS ใหม่" · worktree `/root/projects/shark-pos-p11` · branch `wip/pos-p1.1a` (base `origin/main` 04d2ade9 + P0.3 oracle commits) · 1 ต.ค. 2569 · builder: Claude Opus 5.5
> สัญญา: `ledger/pos-briefs/pos-brief-P1.1a.md` (R1–R8 + addendum 12:20 UTC) · `ledger/wo-notes/pos-P0.3-catalog.md` "Ratified names" · LANE-RULES
> ข้อสอบ: `scripts/qc-pos-p1.1.mts` (82 ข้อ · P1.1a 54 · P1.1b 28) — read-only
> ฐาน QC: **QC4 เท่านั้น** (`ep-frosty-lab`)

## 0. Checkpoint (อัปเดตทุกขั้น — ผู้รับช่วงเริ่มจากตรงนี้)
| # | ขั้น | สถานะ |
|---|---|---|
| 0 | git clean · `migrate status` QC4 (read-only) | ✅ 147 migrations · "Database schema is up to date!" · log `.qc-shots/pos/p1.1a/migrate-status-before.log` |
| 1 | A4 regression ก่อนแก้ (17 ชุด) | ✅ เขียวทั้งหมด · logs `.qc-shots/pos/p1.1a/before/` |
| 2 | schema + migration SQL → QC4 → generate | ✅ `20261120000000_pos_v2_a` deploy QC4 · generate |
| 3 | catalog.ts + facade + permission + scope | ✅ |
| 4 | backfill script | ✅ |
| 5 | oracle P1.1a เขียว | ✅ run1 exit 0 · ผ่าน 54/54 · S2 ข้าม 28 (guard) · log `.qc-shots/pos/p1.1a/oracle-run1.log` |
| 6 | A2/A3/A4-after/A5/A7 | ✅ (ดู §A2–§A7) |
| 7 | typecheck | ✅ exit 0 (`tsc --noEmit` ไม่มี output · รอบเดียว · รอคิว ~15 นาที) |
| 8 | notes · commit · push | ✅ |

### เบี่ยงจากคำสั่ง (ต้องให้ผู้คุมงานรับทราบ)
- `scripts/qc-prisma.sh` ด่าน host รับเฉพาะ QC1–3 (`ep-plain-art|ep-cool-shadow|ep-weathered-river`) → กับ `.env.qc` (=QC4) ได้ `exit 4 "URL ไม่ใช่ branch QC"`. ไฟล์นี้ไม่อยู่ในรายการที่ใบนี้เป็นเจ้าของ ⇒ ไม่แก้ · ใช้ `bash scripts/iso.sh bash scripts/qc4.sh pnpm exec prisma <cmd>` แทน (qc4.sh ตั้ง DIRECT_URL/DATABASE_URL จาก `.env.qc4` + ด่าน host `ep-frosty-lab` + กัน prod/QC1-3 — กลไกเดียวกับ qc-prisma; ไม่มี `.env` ในเวิร์กทรีนี้ ⇒ prisma.config.ts ไม่โหลด prod) · ใช้เฉพาะ `migrate status` / `migrate diff --script` / `migrate deploy` / `generate` (ไม่ใช้ dev/reset/db push/resolve)

## A4 ก่อนแก้ (QC4 · `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<s>.mts`)
| ชุด | exit · สรุป |
|---|---|
| qc-pos-register | 0 · ผ่าน 42/42 |
| qc-pos-account | 0 · ผ่าน 16/16 |
| qc-pos-products | 0 · ผ่าน 24/24 |
| qc-pos-coupon | 0 · ผ่าน 8/8 |
| qc-pos-closeday | 0 · ผ่าน 22/22 |
| qc-pos-inventory | 0 · ผ่าน 25/25 |
| qc-pos-p0.2 | 0 · ผ่าน 55/55 · SKIP 1 (P0.2-S6.7) |
| qc-restaurant-money | 0 · ผ่าน 6/6 |
| qc-restaurant-void | 0 · ผ่าน 11/11 |
| qc-shop-refund | 0 · ผ่าน 12/12 |
| qc-account-cpa | 0 · ผ่าน 107/107 |
| qc-restaurant | 0 · 🎉 Restaurant dine-in loop ผ่าน |
| qc-restaurant-pay | 0 · ผ่าน 19/19 |
| qc-shop | 0 · ผ่าน 15/15 |
| qc-inventory | 0 · ผ่าน 12/12 |
| qc-inventory-item | 0 · ผ่าน 11/11 |
| qc-inventory-account | 0 · ผ่าน 23/23 |

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `prisma/schema/pos.prisma` | แก้ (ต่อท้าย + 2 บรรทัดใน PosSaleLine) | enum `PosProductKind` · `PosCategory` · `PosProduct` (+`parentId` self-relation ว่างไว้ให้ P1.2 · `trackStock` default false · `unavailableUnitIds` · ฟิลด์เมนู copy-only) · `PosProductOptionGroup` · `RecipeLine` · `PosSaleLine.productId` + index |
| `prisma/schema/restaurant.prisma` | แก้ 2 ก้อนเล็ก | `MenuItem.posProductId` + index · `RestaurantOrderItem.productId` + index |
| `prisma/schema/ecommerce.prisma` | แก้ 2 ก้อนเล็ก | `ShopProduct.posProductId` + index · `ShopOrderLine.posProductId` + index (`productId` เดิม → ShopProduct ไม่แตะ) |
| `prisma/migrations/20261120000000_pos_v2_a/migration.sql` | ใหม่ | SQL จาก `migrate diff --from-schema <HEAD schema> --to-schema prisma/schema --script` + หัวไฟล์อธิบาย |
| `src/lib/modules/pos/catalog.ts` | ใหม่ | ผู้เขียน/ผู้อ่านเดียว: createProduct · updateProduct · setPrice · archive · listForUnit · byBarcode · ensureForInvItem · createCategory · resolver R2 (`loadPosResolution`+`resolvePosSystem`) · ราคา R4 (`initialPriceSatang`) · `backfillCatalog` |
| `src/lib/modules/pos/db.ts` | ใหม่ | re-export `prisma` (แบบ member/kanban/crm `db.ts` — F5.1 ratchet 45/45) |
| `src/lib/modules/pos/index.ts` | แก้ (ต่อท้าย · มี marker) | `export * as catalog` + types + `CatalogError` |
| `src/lib/core/scope.ts` | แก้ 5 บรรทัด | PosProduct/PosCategory = sys() · PosProductOptionGroup/RecipeLine = tenant |
| `src/lib/core/permissions.ts` | แก้ 1 บรรทัด (hot file · marker `// POS P1.1a ▸ … ◂`) | `pos.product.manage` + ป้ายไทย |
| `scripts/pos-backfill-catalog.mts` | ใหม่ | CLI: ด่าน env/prod · `--tenant=<id|slug>` ซ้ำได้ · `--dry-run` · `JSON_SUMMARY` |
| `scripts/pos-qc-env.mts` | แก้ | ย้าย 4 ตารางจาก `POS_FUTURE_MODELS` → `POS_MODELS` |
| `scripts/fitness-pos.mts` | ไม่แตะ | `CATALOG_WRITER = src/lib/modules/pos/catalog.ts` อนุญาตตาม path อยู่แล้ว |

## 2. migration
- ชื่อ `20261120000000_pos_v2_a` — หลัง migration ล่าสุดบน origin ทุกสาขา (`main` 20261102000000_crm_v2_c · `session/crm` และ `wip/crm-*` 20261103000000_crm_perf_indexes · `wip/crm-c54c-r8` 20261104000000_account_journal_no_sequence — ตรวจด้วย `git ls-tree` ทุก remote branch) + เผื่อ ~16 วัน · ผู้คุมงานเปลี่ยนชื่อได้ตอน merge
- สร้างด้วย `migrate diff --from-schema` (schema ของ HEAD ที่ `git archive` ลง scratchpad) → ไม่พึ่ง DB ⇒ ไม่ดึง drift เดิม (partial unique ของ AccountProduct) เข้ามา
- อ่านครบทุกบรรทัด: CREATE TYPE 1 · ALTER TABLE ADD COLUMN nullable ไม่มี default 5 (ShopProduct · ShopOrderLine · PosSaleLine · MenuItem · RestaurantOrderItem — ไม่ rewrite ตาราง) · CREATE TABLE 4 · CREATE INDEX ธรรมดา 18 (unique 4: PosCategory(systemId,unitId,name) · PosProduct(systemId,invItemId) · PosProductOptionGroup(productId,groupId) · RecipeLine(productId,invItemId) — ทุกตัวอยู่บนตารางใหม่ที่ว่าง) · FK 4 (ใหม่→ใหม่ล้วน: PosProduct.parentId→PosProduct SET NULL · PosProduct.categoryId→PosCategory SET NULL · PosProductOptionGroup.productId / RecipeLine.productId → PosProduct CASCADE) · ไม่มี DROP/RENAME/SET NOT NULL/ALTER TYPE · ไม่แตะ InvItemKind
- `unique(systemId, invItemId)`: Postgres ถือ NULL ไม่เท่ากัน ⇒ แถว invItemId null (เมนู/เว็บล้วน) หลายแถวได้ = ตรงเจตนา R1 (ยืนยันจาก backfill จริง: 4 MENU invItemId null อยู่ในระบบเดียวกัน)
- `unavailableUnitIds TEXT[] DEFAULT ARRAY[]` เป็น nullable ตามพฤติกรรม Prisma กับ scalar list (เหมือน `PosSale.voucherUseIds`) — โค้ด coalesce เอง
- Deploy QC4: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec prisma migrate deploy` → `Applying migration 20261120000000_pos_v2_a … All migrations have been successfully applied.` · status หลัง deploy: `148 migrations found … Database schema is up to date!` · `prisma generate` (node_modules ของเวิร์กทรีนี้เอง)
- 🔴 ข้อค้นพบหลัง deploy: `_prisma_migrations` ของ QC4 มี `20261103000000_crm_perf_indexes` (apply 27 ก.ย. — สืบทอดจาก parent `wo-acc-v2-qc` ก่อนแตก QC4 · index-only ของ CRM · อยู่บน `origin/session/crm`) ซึ่ง**ไม่อยู่ในเวิร์กทรีนี้** — `migrate status` ของ Prisma 7 ไม่รายงานแถวที่มีแต่ใน DB ("up to date") ⇒ ขั้น 0 ผ่านตามตัวอักษรของคำสั่ง แต่ข้อเท็จจริงคือมีประวัติที่ไม่อยู่ใน tree · ไม่กระทบใบนี้ (migration ของใบนี้เรียงหลังมัน · ไม่แตะตาราง CRM · มันจะมาถึง main พร้อม CRM) — ผู้คุมงานรับทราบ

## R2 — ตัวตัดสินระบบ POS (`catalog.ts` `resolvePosSystem` + `loadPosResolution`)
| แหล่ง | กติกา | หลักฐานในโค้ดวันนี้ |
|---|---|---|
| InvItem | คลัง I ขายใน POS S เมื่อมีสาขา (ไม่ ARCHIVED) ที่ผูกทั้ง INVENTORY=I และ POS=S · ได้ S ตัวเดียว = S · 0 = `NO_POS` · >1 = `AMBIGUOUS_POS` (ข้าม ไม่เดา) | `app/app/sys/[id]/pos/register/page.tsx:53-55` (resolvePosLinks → posCatalog) · `pos/register.ts:125-133` (systemForUnit INVENTORY) · `:137` posCatalog · `:101-112` posUnits กรอง ARCHIVED `:108` |
| MenuItem | POS ของสาขาเมนู (`AppSystemUnit` type POS) · ไม่มี = `NO_POS` | `restaurant/order.ts:421` `systemForUnit(tenantId, unitId, "POS")` |
| ShopProduct | POS ตัวแรกของร้าน (createdAt เก่าสุด) ไม่ดูสาขา · ร้านไม่มี POS = `NO_POS` · มี invItemId แต่ InvItem ไม่ได้ขายใน POS ตัวแรก = ข้าม `shopProductInvItemNotInFirstPos` | `shop/service.ts:217-218` `listSystems(ctx.tenantId,"POS")[0]` (`system/service.ts:85-90` orderBy type,createdAt) |
- ต่างจากที่ oracle writer เขียนไว้ 1 จุดเล็ก: กรองสาขา ARCHIVED ออกจากทาง InvItem (โค้ด `posUnits` ทำ) — oracle `posOfInventory()` ไม่กรอง · ข้อมูล QC ไม่มีสาขา ARCHIVED ⇒ ผลตรงกัน (S1.6/S1.9 เขียว) · ไม่ยื่น ORACLE-EDIT (ไม่มีข้อไหนแดง) แต่บันทึกไว้

## R4 — ราคา (`initialPriceSatang`) · VAT · trackStock
posPrice >0 → salePrice ≠ null (0 คงไว้) → SERVICE priceSatang >0 → ราคาแถวตัวเอง (MenuItem.basePrice / ShopProduct.priceSatang) → null · VAT = AccountProduct.vatRateBp (ไม่มี AP = null) · AP ของ InvItem = ผ่าน `InvItem.accountProductId` ก่อน ไม่งั้น `AccountProduct.invItemId` (เก่าสุด) · trackStock = invItemId && kind≠MENU && (มี InvMovement || onHand≠0)
- "0 ตั้งใจ vs ยังไม่ตั้ง": AccountProduct.salePrice nullable ⇒ แยกได้ (0 คงไว้: PQC-CF-FREE · PQC-RS-ICE) · InvItem.priceSatang default 0 ⇒ แยกไม่ได้ ⇒ 0 ไม่นับ (ตาม addendum) · MenuItem.basePrice บังคับกรอก / ShopProduct.priceSatang default 0 ⇒ ใช้ค่าตรง ๆ (เว็บล้วนราคา 0 จะได้ 0 — แยกไม่ได้เช่นกัน · ตาม oracle `expectPrice`) — flag ให้ผู้คุมงาน

## Backfill — ตัวเลขบน QC4
- dry-run ทั้ง QC4 (ไม่ใส่ --tenant): `ร้าน 19 · แหล่ง InvItem 17 · MenuItem 4 · ShopProduct 0` · ต่อระบบ POS: cmt18s57k… InvItem 6 · cmuk7wtxf… InvItem 2 · posqc-coffee-sys-pos InvItem 7 · posqc-resto-sys-pos InvItem 2 + MenuItem 4 · ข้ามทุกเหตุ = 0 · จะสร้าง `{"posProduct":21,"posCategory":3,"posProductOptionGroup":0,"recipeLine":0,"invItem":0}` · จะผูก MenuItem 4 · log `a2-dry-all.log`
- รันจริงเฉพาะร้าน QC ของ POS (`--tenant=posqc-coffee-tenant --tenant=posqc-resto-tenant`) — ร้านอื่นใน QC4 ไม่ถูกเขียน (ตั้งใจ: QC4 ส่วนตัวของ POS แต่ไม่อยากให้สภาพต่างจากของจริงโดยไม่จำเป็น)

## A2
| ขั้น | exit | created | updated |
|---|---|---|---|
| dry-run | 0 | posProduct 13 · posCategory 3 · og 0 · recipe 0 · invItem 0 | menuItem 4 · shopProduct 0 |
| จริง | 0 | posProduct 13 · posCategory 3 · invItem 0 | menuItem 4 |
| จริงซ้ำ | 0 | ทุกตัว 0 | ทุกตัว 0 |
| ถอยแถวของร้าน QC (unbackfill helper) แล้ว 2 โปรเซสจริงซ้อนกัน (ใน gate lock เดียว) | A=0 · B=0 | A: 0 ทั้งหมด (รอล็อกร้าน แล้ววางแผนใหม่) · B: 13/3 | B: menuItem 4 |
หลังซ้อน: `INVARIANTS {"products":13,"categories":3,"dupInv":0,"invWithout":0,"menuUnlinked":0,"menuShared":0,"orphanMenuProducts":0,"dupCat":0}` · oracle X6.1 (3 รอบ บนแหล่งใหม่) เขียว
สภาพท้ายใบ: ร้าน QC ของ POS **backfill แล้ว** (PosProduct 13 · PosCategory 3 · MenuItem.posProductId 4) — เป็นผลลัพธ์ที่ตั้งใจ ไม่ใช่ของค้าง

## A3 — ตารางเดิมไม่ถูกแตะ (helper `.qc-shots/pos/p1.1a/fingerprint.mts` — count + md5 ของ `to_jsonb(row)` ลบเฉพาะคอลัมน์เชื่อมใหม่ · **รวม updatedAt** · แยก ร้าน QC POS / ร้านอื่น)
ตาราง: InvItem · MenuItem · ShopProduct · AccountProduct · MenuOptionGroup · MenuOptionChoice · MenuCategory · MenuItemOptionGroup · KdsStation · ShopOrderLine · PosSaleLine · RestaurantOrderItem
- before (หลัง migrate ก่อน backfill) = after-real = after-unbackfill (ทั้งไฟล์รวมตารางใหม่) = after-overlap = final (หลัง A4-after 17 ชุด) สำหรับตารางเดิมทุกตัว · ร้านอื่น (`others`) เท่าเดิมทุกตัว · PosProduct ของร้านอื่น = 0
- ตัวอย่าง: `InvItem others 8:904b1380… posQc 9:3ce81d40…` · `MenuItem posQc 4:fb431f8f…` · `AccountProduct others 13:7a8e219d… posQc 8:455e1f6f…` · `PosSaleLine others 148:7267beea…`
- เหตุที่ updatedAt ไม่เด้ง: คอลัมน์เชื่อมตั้งด้วย `UPDATE … FROM unnest(...)` คำสั่งเดียว (ไม่ผ่าน Prisma @updatedAt)

## A4 หลังแก้ — 17/17 สรุปเหมือนก่อนแก้ทุกตัว (logs `.qc-shots/pos/p1.1a/after/`)
qc-pos-register 42/42 · qc-pos-account 16/16 · qc-pos-products 24/24 · qc-pos-coupon 8/8 · qc-pos-closeday 22/22 · qc-pos-inventory 25/25 · qc-pos-p0.2 55/55 SKIP 1 (P0.2-S6.7 — เหมือนก่อน) · qc-restaurant-money 6/6 · qc-restaurant-void 11/11 · qc-shop-refund 12/12 · qc-account-cpa 107/107 · qc-restaurant "🎉 Restaurant dine-in loop ผ่าน" · qc-restaurant-pay 19/19 · qc-shop 15/15 · qc-inventory 12/12 · qc-inventory-item 11/11 · qc-inventory-account 23/23 — ทุกตัว exit 0 · ไม่มีชุดไหน SKIP เพราะ fixture ขาด

## A1 — oracle `qc-pos-p1.1` บน QC4
- run1 (ก่อน backfill ร้าน QC): exit 0 · `===== qc-pos-p1.1 ===== ผ่าน 54/54` · `JSON_SUMMARY {"suite":"qc-pos-p1.1","total":54,"passed":54,"failed":[],"skipped":null,"catalogue":82,…,"skippedGroups":{"S2":"P1.1b ยังไม่เริ่ม (ผู้เขียนเดิม 8 ไฟล์ยังไม่ import pos/catalog) — ข้าม 28 ข้อ"},"force":false,"p11bStarted":false}` · ROWCOUNTS before = after
- run2 (หลัง backfill ร้าน QC): exit 0 · ผ่าน 54/54 · ROWCOUNTS เท่าเดิม

## A5 — fitness
- มี env (`bash scripts/iso.sh bash scripts/qc4.sh pnpm fitness`): exit 0 · `FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0` · `JSON_SUMMARY {"total":38,"passed":38,"findings":[]}`
- ไม่มี env (`bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm fitness`): exit 0 · เหมือนกัน 38/38
- F15.1 "หนี้เดิม 9 ไฟล์ 36 จุด" เท่าเดิม · F15.2 เขียว (ไม่แตะ createSale) · F5.1 baseline 45 (ผ่าน `pos/db.ts`) · F1.1 316 model ลงทะเบียนครบ

## A7 — rollback (ซ้อมบนกระดาษ · ไม่รันแบบทำลาย)
ลำดับ: revert โค้ด (client ที่ generate ใหม่อ้างคอลัมน์ใหม่) → deploy → แล้วค่อยรัน SQL:
```sql
BEGIN;
DROP TABLE IF EXISTS "PosProductOptionGroup", "RecipeLine";
DROP TABLE IF EXISTS "PosProduct";
DROP TABLE IF EXISTS "PosCategory";
DROP TYPE IF EXISTS "PosProductKind";
DROP INDEX IF EXISTS "MenuItem_posProductId_idx", "ShopProduct_posProductId_idx", "ShopOrderLine_posProductId_idx", "PosSaleLine_productId_idx", "RestaurantOrderItem_productId_idx";
ALTER TABLE "MenuItem" DROP COLUMN IF EXISTS "posProductId";
ALTER TABLE "ShopProduct" DROP COLUMN IF EXISTS "posProductId";
ALTER TABLE "ShopOrderLine" DROP COLUMN IF EXISTS "posProductId";
ALTER TABLE "PosSaleLine" DROP COLUMN IF EXISTS "productId";
ALTER TABLE "RestaurantOrderItem" DROP COLUMN IF EXISTS "productId";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261120000000_pos_v2_a';
COMMIT;
```
ทางถอยที่ไม่แตะ schema (ถ้าแค่อยากล้าง backfill): `UPDATE "MenuItem"/"ShopProduct" SET "posProductId" = NULL …` + `DELETE` 4 ตารางใหม่ (ลูกก่อนแม่) — **ซ้อมจริงแล้วบน QC4 เฉพาะร้าน QC** (helper `unbackfill.mts`): `UNBACKFILL menuLinks 4 shopLinks 0 og 0 recipe 0 product 13 category 3` แล้ว fingerprint = before ทุก byte
เหตุผลว่าตารางเดิมไม่พึ่งของใหม่: FK ที่แตะตารางใหม่บน QC4 มีแค่ 4 ตัว ใหม่→ใหม่ล้วน (`FKS [PosProductOptionGroup_productId_fkey, PosProduct_categoryId_fkey, PosProduct_parentId_fkey, RecipeLine_productId_fkey]`) · คอลัมน์เชื่อมบนตารางเดิมเป็น id หลวม (ไม่มี FK) · โค้ดเดิมไม่อ่านคอลัมน์/ตารางใหม่ (`grep -rl "posProductId|PosProduct|recipeLine" src` = catalog.ts · pos/index.ts · scope.ts เท่านั้น — นอกนั้นคือ `AccountProduct.posCategory` เดิมที่ชื่อคล้าย) · A3/A4 ยืนยันว่าจอเดิม/ข้อสอบเดิมไม่เปลี่ยน

## 4. X-groups
| กลุ่ม | ใบนี้ | ที่ทำ (`// AUDIT-CLASS X<n>` ใน catalog.ts) / check ids |
|---|---|---|
| X1 idempotency | ใช้ | ensureForInvItem ON CONFLICT + ล็อก (`catalog.ts:695`) · backfill รอบสอง 0/0 (`:1006`) · S1.35 · X1.1 |
| X2 ข้ามร้าน/สาขา | ใช้ | `assertPosSystem :115` · `assertUnit :142` · `loadProduct :157` · `listForUnit :417` · X2.1–X2.3 |
| X3 สิทธิ์ | ใช้ | `requirePerm :136` (`pos.product.setPrice` / `pos.product.manage`) · X3.1–X3.3 |
| X4 เงิน | ใช้ | `initialPriceSatang :279` · `setPrice :668` สตางค์ Int · S1.13/14/27/28/30 |
| X5 ย้อนกลับ | ใช้ (rollback story) | S1.25 · S1.36 · §A7 |
| X6 race | ใช้ | `lockTenant :181` · createProduct `:554` · updateProduct คอลัมน์เดียว `:635` · setPrice `:670` · ensure `:695` · backfill `:1006` · X6.1–X6.4 |
| X7 เวลา | N-A | แคตตาล็อกไม่มีตรรกะวัน · ช่วงเวลาขายเป็น copy-only |
| X8 ไม่เชื่อม | ใช้ | ไม่มีบัญชี = vat null · setPrice ไม่สร้าง AccountProduct · S1.15 · X8.1 |
| X9 outbox | N-A (ไม่ยิง event ใหม่) | X9.1 เขียว (ไม่มี pos.* ใหม่) |
| X10/X11 | N-A | ไม่มี UI (R8) |
| X12 ไม่มี env | ใช้ | fitness ไม่มี env 38/38 |

## หนี้ / DEFERRED
- P1.1b: dual-write ทุกผู้เขียนเดิม + เขียนกลับ (setPrice → AccountProduct/MenuItem/ShopProduct/InvItem) — ใบนี้ไม่ทำตาม R8
- images ของแถวที่ผูก InvItem: ไม่คัดลอก `InvItemImage` (P1.1a เก็บ [] · read model ยังไม่รวมรูปคลัง) — ตัดสินใน P1.2/P1.3
- `stock[unit]` = InvItem.onHand รวมทั้งระบบคลัง (ยังไม่มีสต็อกระดับสาขา) · เมนูไม่ส่ง stock (stockQty เป็น copy-only)
- backfill ไม่เขียน AuditLog รายแถว (เป็นงาน migration ข้อมูล · JSON_SUMMARY คือบันทึก) — ฟังก์ชัน API ทุกตัวเขียน audit
- `listForUnit` ไม่ส่ง limit = คืนครบทุกแถว (oracle S1.33 ต้องการ) — หน้าจอ P1.3 ควรส่ง limit เสมอ

## A6 — typecheck
`env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` → exit 0 (`> tsc --noEmit` ไม่มี error) · รอบเดียว

## ORACLE-EDIT requests
ไม่มี (54/54 เขียว · ข้อสังเกตเรื่องสาขา ARCHIVED ดู §R2)

## ข้อที่ผู้คุมงานต้องตัดสิน
1. `qc-prisma.sh` ไม่รู้จัก QC4 → ใช้ `qc4.sh` + `pnpm exec prisma` แทน (ดูบนสุด) — ควรเติม `ep-frosty-lab` ใน qc-prisma.sh หรือรับรองทางนี้
2. QC4 มี `20261103000000_crm_perf_indexes` ใน `_prisma_migrations` ที่ไม่อยู่ใน tree นี้ (สืบทอดจาก parent) — `migrate status` ไม่รายงาน · พบหลัง deploy
3. ShopProduct ที่มี invItemId แต่ InvItem นั้นไม่ได้ขายใน "POS ตัวแรก" → ข้าม (`shopProductInvItemNotInFirstPos`) แทนการสร้างแถวที่สอง (ไม่เกิดใน QC)
4. ShopProduct ที่ `active=false` → แถวของตัวเองที่ปิดขายสาขานั้น (`unavailableUnitIds=[unitId]`) ไม่ใช่เก็บถาวร
5. `RecipeLine.qty` เป็น Int (หน่วยเดียวกับ InvMovement) — P2.3 อาจต้องการทศนิยม
6. `pos/db.ts` (re-export prisma แบบ crm/member/kanban) เพื่อไม่ชน F5.1 ratchet
7. ร้าน QC ของ POS บน QC4 ถูกทิ้งไว้ในสภาพ backfill แล้ว (13/3/4)

## ของค้าง
ไม่มีแถวชั่วคราว · helper ใน `.qc-shots/pos/p1.1a/*.mts` (gitignored ไม่ commit)
