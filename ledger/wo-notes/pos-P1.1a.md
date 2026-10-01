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

## A7 — rollback (round 1 · ⚠️ ถูกแทนด้วย SQL ฉบับเต็มใน Round 2 §M6 — ฉบับนี้ไม่ drop FK แยก และยังอ้าง index ที่ round 2 ไม่มีแล้ว)
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

## ข้อที่ผู้คุมงานต้องตัดสิน (round 1 — ข้อ 3/4/7 ถูกแทนด้วยมติ round 2)
1. `qc-prisma.sh` ไม่รู้จัก QC4 → ใช้ `qc4.sh` + `pnpm exec prisma` แทน (ดูบนสุด) — ควรเติม `ep-frosty-lab` ใน qc-prisma.sh หรือรับรองทางนี้
2. QC4 มี `20261103000000_crm_perf_indexes` ใน `_prisma_migrations` ที่ไม่อยู่ใน tree นี้ (สืบทอดจาก parent) — `migrate status` ไม่รายงาน · พบหลัง deploy
3. ShopProduct ที่มี invItemId แต่ InvItem นั้นไม่ได้ขายใน "POS ตัวแรก" → ข้าม (`shopProductInvItemNotInFirstPos`) แทนการสร้างแถวที่สอง (ไม่เกิดใน QC)
4. ShopProduct ที่ `active=false` → แถวของตัวเองที่ปิดขายสาขานั้น (`unavailableUnitIds=[unitId]`) ไม่ใช่เก็บถาวร
5. `RecipeLine.qty` เป็น Int (หน่วยเดียวกับ InvMovement) — P2.3 อาจต้องการทศนิยม
6. `pos/db.ts` (re-export prisma แบบ crm/member/kanban) เพื่อไม่ชน F5.1 ratchet
7. ร้าน QC ของ POS บน QC4 ถูกทิ้งไว้ในสภาพ backfill แล้ว (13/3/4)

## ของค้าง
ไม่มีแถวชั่วคราว · helper ใน `.qc-shots/pos/p1.1a/*.mts` (gitignored ไม่ commit)

# Round 2 (brief `pos-brief-P1.1a-R2.md`) — checkpoint
| # | ขั้น | สถานะ |
|---|---|---|
| R2-0 | fingerprint ก่อน (r2-before) | ✅ ตารางเดิม = fp-before ของ round 1 ทุกตาราง · PosProduct 13 / PosCategory 3 (ร้าน QC) |
| R2-1 | M2 probe (schema Postgres แยก `p11probe` บน QC4 · ลบแล้ว) | ✅ `migrate deploy` รันทีละคำสั่งคนละ tx (txid 4386091 → 4386092) ⇒ `SET LOCAL lock_timeout` ไม่มีผล (อ่านได้ `0`) · `SET lock_timeout = '3s'` (ระดับ session) มีผลทุกคำสั่งถัดไป (อ่านได้ `3s` ทั้งสอง tx) |
| R2-2 | M6 rollback จริงบน QC4 | ✅ `prisma db execute --file rollback-pos_v2_a.sql` → `Script executed successfully.` · ตารางใหม่/enum/คอลัมน์เชื่อม 5 ตัว/แถว `_prisma_migrations` หายหมด · fingerprint ตารางเดิม = ก่อน P1.1a ทุก byte |
| R2-3 | migration ใหม่ deploy + generate | ✅ `Applying migration 20261120000000_pos_v2_a … successfully applied` · generate · drift diff เหลือแค่ 3 index ของ crm_perf_indexes ที่สืบทอดมา (partial unique ใหม่ไม่ถูกนับเป็น drift — เหมือน AccountProduct) |
| R2-4 | โค้ด C1–C13 (catalog.ts เขียนใหม่ · backfill script C13) | ✅ |
| R2-5 | backfill ร้าน QC: dry → จริง → จริงซ้ำ → ถอย → 2 โปรเซสซ้อน | ✅ 13/3/4 → 13/3/4 → 0 ทั้งหมด → A 13/3/4 · B 0 (รอล็อก) · INVARIANTS ไม่ซ้ำ/ไม่กำพร้า · ตารางเดิม = ก่อน P1.1a ทุก byte |
| R2-6 | oracle | ✅ 79/80 · แดงข้อเดียว X3.2 (ขัดกับ C4 — ORACLE-EDIT ข้างล่าง) · สำเนาที่ใส่ hunk ที่ขอ = 80/80 |
| R2-7 | regression 17 ชุด · fitness 2 โหมด | ✅ 17/17 เหมือน round 1 · fitness 38/38 ทั้งคู่ |
| R2-8 | typecheck | ✅ exit 0 (`tsc --noEmit` ไม่มี output · รอบเดียว) |
| R2-9 | notes · commit · push | ✅ |


## Round 2 — รายงานต่อข้อ (ก่อน → หลัง)
oracle: `scripts/qc-pos-p1.1.mts` (round-2 · 108 ข้อ · P1.1a 80 · P1.1b 28) · โค้ด: `src/lib/modules/pos/catalog.ts` (เขียนใหม่ทั้งไฟล์) · `scripts/pos-backfill-catalog.mts`

| ข้อ | round 1 | round 2 (file:line) | check |
|---|---|---|---|
| C1 | `actorUserId: null` = ระบบ | `CATALOG_SYSTEM_ACTOR` unique symbol `catalog.ts:24` · `actorOf :152` null/undefined/""/อื่น = PERMISSION_DENIED · ไม่ใช่สมาชิก = NOT_FOUND | S3.1 ✅ |
| C2 | `trackStock Boolean @default(false)` ตัดสินตอน backfill | `Boolean?` · `effectiveTrackStock :373` (AUTO คิดตอนอ่าน: invItemId + PRODUCT + (movement ∨ onHand≠0)) · view มี `trackStock` + `trackStockMode` · `updateProduct({trackStock:true|false|null})` · true ไม่ผูกคลัง = VALIDATION · backfill/ensure/createProduct = null | S3.2 S3.3 S1.41 S1.3 ✅ |
| C3 | list เห็นของทุกคลังที่ผูก POS | `unitInventory :199` + `warehouseCond :421` ใน list/search/byBarcode (EXISTS InvItem.systemId = คลังของสาขา) · stock[unit] = onHand ของแถวที่มองเห็น | S3.4 S3.5 S1.33 ✅ |
| C4 | ตรวจแค่คีย์สิทธิ์ | `requireScope :171`: unitId null ⇒ ผู้กระทำทุกสาขา (`rbac.canGrantUnitAccess(m,["*"])` = OWNER ∨ unitAccess `*`) ไม่งั้น PERMISSION_DENIED · มีสาขา ⇒ เข้าไม่ได้ = NOT_FOUND · ย้ายสาขาตรวจทั้งต้นทางและปลายทาง · ensure/createCategory ทุกสาขา = ผู้กระทำทุกสาขา · `assertCategory :592` หมวดสาขาอื่น = VALIDATION (ย้ายสาขาแล้วหมวดเดิมไม่เข้า = VALIDATION) | S3.6 S3.7 S3.8 ✅ · X3.2 ❌ (ขัดกัน — ORACLE-EDIT) |
| C5 | `byBarcode → view|null` (ตัวเก่าสุด) | `byBarcode :546 → {items}` ทุกตัว เรียง name,id | S3.9 S1.19 S1.34 X2.2 ✅ |
| C6 | ไม่ส่ง limit = ทั้งหมด · ค้นด้วย pre-query take 2000 | ปริยาย 100 · >500 ตัดเหลือ 500 · `nextCursor` เมื่อเหลือ · ค้นใน SQL คำสั่งเดียว (`listForUnit :508` ชื่อ/ชื่อ EN/บาร์โค้ด + EXISTS SKU/บาร์โค้ด InvItem · keyset name,id · ใช้ index M4) · `toViews :428` จับคู่ด้วย Map ทั้งหมด (S6/S7) | S3.10 S3.11 S1.37 ✅ |
| C7 | posPrice → salePrice → SERVICE → own → null · AP สำรองผ่าน AP.invItemId | `initialPrice :354`: salePrice>0 → posPrice>0 เมื่อ posEnabled → SERVICE>0 → own (0 คงไว้) → sale 0 & ทุน 0 = 0 → null · AP แบบลิ้นชักเท่านั้น `strictAp :397` (InvItem.accountProductId · ไม่เก็บถาวร · สมุดที่ผูก POS ตาม findAccountLinkForPos) · ราคาเดิมผิดรูป = null + นับ · ตัวนับ+ตัวอย่างใน JSON_SUMMARY `counts`/`samples` | S3.12 S3.13 S1.13 S1.14 ✅ |
| C8 | คัดลอก vatRateBp เสมอ | `vatOf` + `bookOfPos :384` คัดลอกเมื่อสมุดที่ผูก POS จด VAT (AccountSettings.vatRegistered ?? true แบบ vatConfigOf) ไม่งั้น null | S3.14 S1.15 ✅ |
| C9 | shop ชี้ InvItem นอก POS แรก = ข้าม | a) ชี้แถวร่วม + นับ diff/inactive (ไม่แก้แถวร่วม) · b) แถวของตัวเองใน POS แรก invItemId ตั้ง unitId สาขาร้าน · c) dangling = แถวของตัวเอง inv null · d) ไม่ผูกคลัง · ทุกแถวถูกผูก · นับ shopBranchNotInFirstPos (`planTenant :949` ขั้น 4) | S3.15 S3.16 S3.17 S1.11 ✅ |
| C10 | ไม่ตรวจชนิด · P2002 หลุดดิบ | MENU/BUNDLE + invItemId · InvItem เก็บถาวร · ชนิดไม่ตรง = VALIDATION · บาร์โค้ดของ InvItem ตัวเองไม่ชน · `writeGuard :106` P2002 → CONFLICT ครอบผู้เขียนทุกตัว | S3.18 ✅ |
| C11 | อ่านค่าเดิมไม่ล็อก · archive คืนเวลาของตัวเอง | `loadProduct(…, forUpdate) :208` SELECT … FOR UPDATE ใน setPrice/updateProduct/archive · audit createdAt = เวลาหลังได้ล็อก · archive คืนค่าที่เก็บจริง | S3.19 ✅ (5/5 สาย · 3/3 archive) |
| C12 | สาขาเก็บถาวรนับ · POS แรกไม่กรอง active ไม่มี tie-break | `loadPosResolution :282`: สาขาเก็บถาวร + ระบบปิดใช้งาน ไม่นับ · POS แรก = active เรียง createdAt,id (`listSystems` ไม่มี id tie-break/ไม่กรอง active — ต่างโดยตั้งใจ แก้ฝั่งนั้นใน P2.1) · `assertPosSystem` ต้อง active · `assertUnit` สาขาเก็บถาวร = NOT_FOUND | S3.20 S1.6 S1.10 ✅ |
| C13 | ไม่ระบุร้าน = ทุกร้านแม้ prod · โหลด movement ทั้งหมด | prod ต้อง `--tenant` หรือ `--all` (script :67) · movement = `groupBy itemId` · ตัวเลือกเมนูจัดกลุ่มด้วย Map · ตัวนับครบ 11 ชื่อ (+ `trackStockAutoOn`) · exit 0 พร้อมตัวนับ | S3.21 ✅ |
| M1 | index บนคอลัมน์เชื่อม 5 ตัว | ไม่มีทั้ง SQL/schema/DB · คอมเมนต์ใน schema "index added in P6.1 …" | S3.22 ✅ |
| M2 | ไม่มี lock_timeout · ADD COLUMN ก่อน | คำสั่งแรก `SET lock_timeout = '3s'` (ระดับ session — ดูผลวัด) · ADD COLUMN 5 ตัวท้ายสุด | S3.23 ✅ |
| M3 | NOT NULL DEFAULT false | `"trackStock" BOOLEAN,` | S3.24 ✅ (รอบแรกแดงเพราะคอมเมนต์หัวไฟล์ของผมมีคำว่า default — แก้คอมเมนต์แล้ว rollback+deploy ใหม่) |
| M4 | (systemId, unitId, archivedAt) | `PosProduct_systemId_archivedAt_name_id_idx` | S3.25 ✅ |
| M5 | ตรวจในโค้ด + advisory lock | raw partial unique `PosCategory_systemId_name_all_branches_key … WHERE "unitId" IS NULL` (แบบ AccountProduct) · `pnpm drift` (migrate diff datasource→schema) ไม่เห็นมันเป็น drift (วัดบน QC4: diff เหลือแค่ 3 index ของ crm_perf_indexes ที่สืบทอดมา) ⇒ ไม่ต้องใช้ทางสำรอง · ล็อก advisory ของ createCategory เอาออก (DB กันแข่งเอง → P2002 → CONFLICT) | S3.26 ✅ |
| M6 | ซ้อม rollback บนกระดาษ | รันจริง 2 ครั้งบน QC4 (ครั้งที่ 2 หลังแก้คอมเมนต์ M3) — ดูด้านล่าง | — |

### M2 — prisma migrate รันไฟล์อย่างไร (วัดจริง)
probe ใน schema Postgres แยก `p11probe` บน QC4 (config ชั่วคราวใน `.qc-shots` · ลบ schema แล้ว): `migrate deploy` ของไฟล์ 3 คำสั่ง → txid 4386091 แล้ว 4386092 = **ทีละคำสั่ง คนละ transaction (autocommit)** · `SET LOCAL lock_timeout='3s'` แล้วอ่าน `current_setting('lock_timeout')` ได้ `0` (ไม่มีผล) · `SET lock_timeout='3s'` (session) อ่านได้ `3s` ในทั้งสอง tx ⇒ ใช้รูป session (มีผลถึงจบการเชื่อมต่อของ schema engine เท่านั้น) · ผลพลอยได้: ไฟล์ migration ไม่ atomic — ถ้าล้มกลางไฟล์ต้องเก็บกวาดด้วยมือ (เหมือนทุก migration ของรีโปนี้)

### M6 — rollback ฉบับเต็ม (รันจริงบน QC4 ด้วย `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec prisma db execute --file …` หลังตรวจ host ep-frosty-lab)
```sql
SET lock_timeout = '3s';
BEGIN;
ALTER TABLE IF EXISTS "PosProductOptionGroup" DROP CONSTRAINT IF EXISTS "PosProductOptionGroup_productId_fkey";
ALTER TABLE IF EXISTS "RecipeLine" DROP CONSTRAINT IF EXISTS "RecipeLine_productId_fkey";
ALTER TABLE IF EXISTS "PosProduct" DROP CONSTRAINT IF EXISTS "PosProduct_categoryId_fkey";
ALTER TABLE IF EXISTS "PosProduct" DROP CONSTRAINT IF EXISTS "PosProduct_parentId_fkey";
DROP TABLE IF EXISTS "PosProductOptionGroup";
DROP TABLE IF EXISTS "RecipeLine";
DROP TABLE IF EXISTS "PosProduct";
DROP TABLE IF EXISTS "PosCategory";          -- partial unique M5 หายพร้อมตาราง
DROP TYPE IF EXISTS "PosProductKind";
ALTER TABLE "MenuItem" DROP COLUMN IF EXISTS "posProductId";
ALTER TABLE "ShopProduct" DROP COLUMN IF EXISTS "posProductId";
ALTER TABLE "ShopOrderLine" DROP COLUMN IF EXISTS "posProductId";
ALTER TABLE "PosSaleLine" DROP COLUMN IF EXISTS "productId";
ALTER TABLE "RestaurantOrderItem" DROP COLUMN IF EXISTS "productId";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261120000000_pos_v2_a';
COMMIT;
```
ลำดับบน prod: revert โค้ด + deploy ก่อน (client ใหม่อ้างคอลัมน์ใหม่) → แล้วค่อยรัน SQL นี้
ผล (ทั้ง 2 ครั้ง): `Script executed successfully.` · ตารางใหม่/enum/คอลัมน์เชื่อม 5 ตัว/แถว migration หายหมด (`LINKCOLS [] ENUM []` · `LOCALONLY ["20261120000000_pos_v2_a"]`) · fingerprint ตารางเดิม (count + md5 รวม updatedAt · ร้าน QC POS และร้านอื่นแยกกัน) = `fp-before` ของ round 1 ทุกตาราง → `migrate deploy` ไฟล์ใหม่ → `Database schema is up to date!`

### A2 (round 2) — ร้าน QC ของ POS
| ขั้น | exit | created | updated |
|---|---|---|---|
| dry-run | 0 | posProduct 13 · posCategory 3 · og 0 · recipe 0 · invItem 0 | menuItem 4 |
| จริง | 0 | 13 · 3 | menuItem 4 |
| จริงซ้ำ | 0 | 0 ทั้งหมด | 0 ทั้งหมด |
| ถอย (unbackfill) → 2 โปรเซสซ้อน | 0/0 | A 13/3 · B 0 (รอล็อกร้าน) | A menuItem 4 · B 0 |
counts ของร้าน QC (dry-run): `{"soldAtCostToday":0,"zeroPriceProduct":2,…,"trackStockAutoOn":3}` (น้ำฟรี + น้ำแข็ง · ครัวซองต์/น้ำดื่ม/โค้ก) · INVARIANTS ไม่ซ้ำ/ไม่กำพร้า · ทั้ง QC4 (dry-run ทุกร้าน): `ร้าน 19 · InvItem 17 · MenuItem 4 · ShopProduct 0` · ข้าม 0 · `soldAtCostToday 6` (ร้านอื่นใน QC4 — ลิ้นชักวันนี้คิดราคาทุน 6 รายการ) · `zeroPriceProduct 2` · `trackStockAutoOn 11` · จะสร้าง 8 (ร้านอื่น — ไม่ได้รันจริง)

### A3 (round 2)
fingerprint หลังทุกขั้น (after-rollback · r2-after-backfill · after-rollback2 · r2-final หลัง 17 ชุด) = `fp-before` (ก่อน P1.1a) ทุกตารางเดิม · PosProduct ของร้านอื่น = 0

### A1 / A4 / A5 (round 2)
- oracle (หลัง backfill ร้าน QC): exit 1 · `===== qc-pos-p1.1 ===== ผ่าน 79/80` · `JSON_SUMMARY {"suite":"qc-pos-p1.1","total":80,"passed":79,"failed":["P1.1-X3.2"],…,"skippedGroups":{"S2":"P1.1b ยังไม่เริ่ม …ข้าม 28 ข้อ"}}` · ROWCOUNTS เท่าเดิม
- สำเนา oracle ที่ใส่ hunk ORACLE-EDIT (`.qc-shots/pos/p1.1a/r2/qc-pos-p1.1-x32edit.mts` — ไม่แตะไฟล์จริง): exit 0 · `ผ่าน 80/80`
- 17 ชุด regression: สรุปตรงกับ round 1 ทุกชุด (17 SAME) · logs `.qc-shots/pos/p1.1a/r2/after/`
- fitness มี env / ไม่มี env: exit 0 · `JSON_SUMMARY {"total":38,"passed":38,"findings":[]}` ทั้งคู่ · F15.1 "หนี้เดิม 9 ไฟล์ 36 จุด" เท่าเดิม · F15.2 ✅ · F5.1 baseline 45 ✅

### ORACLE-EDIT (round 2)
- **P1.1-X3.2** · hunk (`scripts/qc-pos-p1.1.mts:1150`):
  `- const tgt = await attempt(() => C.createProduct(ctxOwner, { name: \`${TAG} perm\`, basePriceSatang: 2000 }));`
  `+ const tgt = await attempt(() => C.createProduct(ctxOwner, { name: \`${TAG} perm\`, basePriceSatang: 2000, unitId: SILOM }));`
  · เหตุ: แคชเชียร์ seed = STAFF `unitAccess ["posqc-coffee-unit-silom"]` · เป้าเดิมเป็นสินค้าทุกสาขา (unitId null) ⇒ ตาม C4 การตั้งราคาสินค้าทุกสาขาต้องเป็นผู้กระทำทุกสาขา = PERMISSION_DENIED — ข้อเดียวกับที่ S3.6 (`setAll`) บังคับให้ปฏิเสธสำหรับผู้กระทำคนเดียวกัน (role MANAGER) · สองข้อนี้ขัดกันบนตัวแสดงเดียวกัน · hunk ทำให้ X3.2 ทดสอบสิ่งที่ตั้งใจ (STAFF + คีย์ `pos.product.setPrice` ตั้งราคาสินค้าของสาขาตัวเองได้) · X3.1/X3.3/X6.3/X6.4 ใช้เป้าเดียวกันและยังเขียวกับ hunk (สำเนาวัดแล้ว 80/80)

### หนี้ (round 2 · brief §C + ที่พบเพิ่ม)
| หนี้ | ใบเจ้าของ |
|---|---|
| catalog.ts อ่านตารางโมดูลอื่นตรง (AppSystemUnit · InvItem · InvMovement · AccountProduct · AccountSystemLink · AccountSettings · Menu*) — facade หรือข้อยกเว้นที่บันทึก (N5) | P1.1b |
| แถวเว็บล้วน/สาขาไม่อยู่ใน POS แรก แก้ไขได้ + ราคาต่อช่องทาง (N2 · M4 hunter · shopBranchNotInFirstPos) | P2.8 |
| ค้นแบบ trigram/index ค้น (N10) · ค้นตอนนี้ ILIKE + EXISTS | P5.3 |
| backfill ถือล็อกร้านชนกับผู้เขียนแคตตาล็อก — รันนอกเวลาขาย + ข้อความลองใหม่ (hunter LOW) | P6.1 runbook |
| index ของคอลัมน์เชื่อม 5 ตัว (CREATE INDEX CONCURRENTLY นอก prisma migrate) — ก่อนใบแรกที่กรองด้วยคอลัมน์เหล่านี้ | P6.1 (หรือ P1.1b/P2.x ใบแรกที่ query) |
| `pos.product.manage` โชว์ในหน้าสิทธิ์ก่อนมีหน้าจอใช้ — ธง `planned` มีอยู่ (`permissions.ts` `planned?: string[]` ต่อโมดูล) แต่ต้องเพิ่มบรรทัด `planned: [...]` ในก้อนโมดูล pos ของไฟล์ร้อน (ไม่ใช่ 1 คำ) | P1.1b |
| `listSystems` (shop checkout) ยังไม่กรอง active/ไม่มี id tie-break — resolver ของแคตตาล็อกกรองแล้ว ⇒ ร้านที่มี POS ปิดใช้งานเก่ากว่า: เช็คเอาท์เว็บกับแคตตาล็อกเลือก POS ต่างกัน | P2.1 |
| migration ของ prisma ไม่ atomic (ทีละคำสั่ง — วัดแล้ว) ถ้าล้มกลางไฟล์บน prod ต้องเก็บกวาดมือ (rollback SQL ข้างบนใช้ได้แบบ IF EXISTS) | P6.1 runbook |
| รูปของแถวที่ผูก InvItem (InvItemImage) ไม่อยู่ใน read model | P1.2/P1.3 |

# Round 3 (brief `pos-brief-P1.1a-R3.md`) — checkpoint
| # | ขั้น | สถานะ |
|---|---|---|
| R3-0 | fingerprint ก่อน (r3-before) + schema snapshot | ✅ |
| R3-1 | probe การรันไฟล์ของ prisma 7.8 (schema แยก p11probe · ลบแล้ว) | ✅ ไม่มี DO = แยกทีละคำสั่งคนละ tx · มี DO $$ = ทั้งไฟล์ tx เดียว (atomic) · P3018→P3009→ลบแถว→deploy ผ่าน |
| R3-2 | migration ใส่ตัวกันรันซ้ำ + RESET · rollback → deploy → รันไฟล์ซ้ำด้วยมือ | ✅ ไม่มี error · โครงสร้างไม่เปลี่ยน (hash ตรงก่อน/หลังรันซ้ำ และตรงกับโครงสร้าง round 2) |
| R3-3 | โค้ด D1 D2 D3 D5 D6 + มติ a/b/c · F15.5 + หลักฐานลบ | ✅ |
| R3-4 | backfill ร้าน QC (dry/real/again/overlap) | ✅ 13/3/4 → 13/3/4 → 0 → ถอย → A 0 (รอล็อก) · B 13/3/4 · INVARIANTS สะอาด · ตารางเดิม = ก่อน P1.1a |
| R3-5 | oracle | ✅ exit 0 · `ผ่าน 93/93` |
| R3-6 | regression 17 ชุด · fitness 2 โหมด (+F15.5) | ✅ 17 SAME · 39/39 ทั้งคู่ |
| R3-7 | typecheck | ✅ exit 0 (`tsc --noEmit` · รอบเดียว · รวม scripts/qc-pos-p1.3.mts round 2) |
| R3-8 | notes · commit · push | ✅ |


## Round 3 — รายงานต่อข้อ
oracle `scripts/qc-pos-p1.1.mts` (round 3 · 121 ข้อ · P1.1a 93 · P1.1b 28) · โค้ด `src/lib/modules/pos/catalog.ts` · `src/lib/modules/pos/index.ts` · `scripts/pos-backfill-catalog.mts` · `scripts/fitness-pos.mts` · migration `20261120000000_pos_v2_a`

| ข้อ | ก่อน (round 2) | หลัง (round 3 · file:line) | check |
|---|---|---|---|
| D1 | แถวทุกสาขา = OWNER/`*` เท่านั้น | `checkCatalogWrite` `catalog.ts:181` (export · facade `catalog.checkCatalogWrite`): แถวของสาขา = เข้าสาขาไม่ได้ NOT_FOUND / ไม่มีคีย์ PERMISSION_DENIED · แถวทุกสาขา = ขอบเขต = สาขาไม่เก็บถาวรของ POS นี้ (แถวผูก InvItem: เฉพาะสาขาที่คลังคือคลังของ InvItem — C3) · ต้อง `evaluate(action, unitId)` ผ่าน **ทุก** สาขาในขอบเขต · ขอบเขตว่าง = OWNER/`*` · ย้ายสาขาตรวจขอบเขตเดิมและใหม่ · ใช้กับ create/update/setPrice/archive/ensure/createCategory (`requireRowWrite :209`) · 🔀 merge item: ต้องตรงกับ `posCanSetTenantPrice` ของ hotfix/pos-page-authz | S3.27 S3.28 S3.6–S3.8 X3.1–X3.3 ✅ |
| D2 | `invMovement.groupBy` ทั้งร้านใน toViews | `toViews :460`: ถามเฉพาะแถว AUTO + PRODUCT + onHand = 0 · `EXISTS (SELECT 1 FROM "InvMovement" m WHERE m."itemId" = i.id AND m."systemId" = <คลังของสาขา> LIMIT 1)` ทีละ InvItem · onHand ≠ 0 ตอบเลย · groupBy เหลือใน backfill (planTenant) เท่านั้น | S3.29 ✅ |
| D3 | — | `apIgnoredButTillPriced` (AP เก็บถาวร/สมุดอื่นที่ลิ้นชักคิด salePrice>0 วันนี้ ⇒ null) · `priceNotSetOther` (null ที่ไม่ถูกนับที่อื่น — InvItem/เมนู/แถวเว็บเอง) · `servicePriceDiffersFromAccountProduct` · ตัวอย่าง ≤20 ต่อร้านต่อชนิดใน `samples` (priceNotSetOther: แถวที่มีร่องรอยราคาเดิม — AP ทางใดก็ได้/ราคาบริการ ≠ 0 — ขึ้นก่อน) · สคริปต์พิมพ์ตัวอย่างทุกชนิด | S3.30 ✅ |
| D4 | ไม่มีตัวกัน · ไม่ RESET | ทุกคำสั่งรันซ้ำได้ (`CREATE TABLE/INDEX IF NOT EXISTS` · `ADD COLUMN IF NOT EXISTS` · enum/FK ใน `DO $$ … EXCEPTION WHEN duplicate_object THEN NULL; END $$`) · `RESET lock_timeout` ท้ายไฟล์ (+ ท้าย rollback) · พิสูจน์บน QC4 ข้างล่าง | S3.31 S3.32 S3.23 ✅ |
| D5 | `export * as catalog` (backfillCatalog + ตัวบ่งชี้หลุดผ่าน facade) | facade เป็นรายการชัด (`index.ts` — 8 ฟังก์ชัน + checkCatalogWrite · ไม่มี backfillCatalog/ตัวบ่งชี้) · สคริปต์ backfill import `@/lib/modules/pos/catalog` ตรง · **F15.5** `fitness-pos.mts:922` + `scanSystemMarker :959` (allowlist ว่าง `SYSTEM_MARKER_ALLOWLIST`) · กติกา: ตัวระบุสองตัวอยู่ได้แค่ catalog.ts · สคริปต์ backfill · `scripts/qc-*.mts` · allowlist และห้ามในไฟล์ `"use server"` / `src/app/**` / `src/lib/actions/**` · `x ?? <ตัวบ่งชี้>` ห้ามทุกที่ (ตรวจด้วย AST — ข้อความ/คอมเมนต์ที่อธิบายกติกา เช่นชื่อข้อสอบ S3.33 ไม่นับ) · ตัวบ่งชี้ต้อง `Symbol(` ไม่ใช่ `Symbol.for(` | S3.33 ✅ · F15.5 ✅ + หลักฐานลบ |
| D6 | — | createProduct: InvItem ที่คลังไม่ได้เสิร์ฟ `unitId` = VALIDATION (`:716` · updateProduct ย้ายสาขาก็ตรวจ `:770`) · trackStock true บนบริการ = VALIDATION (`:722` · `:779`) · ล็อกร้านเฉพาะเมื่อมี invItemId หรือบาร์โค้ด (`:707` · createCategory ไม่ล็อก) · `actorOf :152` acceptedAt null = NOT_FOUND (กติกาบ้าน context.ts:23,50 · push.ts:313-315) · `unitInventory` ไม่กรองคลังปิดใช้งาน (`systemForUnit` ไม่กรอง — system/service.ts:58-68) และ `inventorySystemsOfPos`/resolver ใช้กติกาเดียวกัน (มติ a) · `zeroPriceWeb` นับจากราคาสุดท้ายจริงของแถวเว็บเอง · `byBarcode :586` = UNION (บาร์โค้ดของแถวผ่าน index (systemId, barcode) ∪ บาร์โค้ด InvItem) | S3.34–S3.39 ✅ |

### D4 — การรันไฟล์ของ prisma 7.8 (วัดใหม่ round 3 · แก้ข้อสรุป round 2)
วัดใน schema Postgres แยก `p11probe` บน QC4 (config ชั่วคราวใน `.qc-shots` · ลบ schema ทุกครั้ง) ด้วย `txid_current()` เก็บลงตารางทีละคำสั่ง:
| ไฟล์ทดสอบ | txid ของคำสั่ง 2 และ 3 | `SET LOCAL lock_timeout` | ความหมาย |
|---|---|---|---|
| A: SET LOCAL + CREATE ×2 (ไม่มี DO) | 4404999 · 4405000 | ไม่มีผล (`0`) | prisma แยกไฟล์ทีละคำสั่ง · คนละ transaction |
| B: แบบ A + `DO $$ … $$` ตรงกลาง | 4405007 · 4405007 | มีผล (`3s`) | ทั้งไฟล์ส่งเป็นสคริปต์เดียว = transaction เดียว (implicit) |
| C: แบบ A + `IF NOT EXISTS` (ไม่มี DO) | 4405014 · 4405015 | ไม่มีผล | แยกทีละคำสั่ง (ตัวตัดสินคือ dollar-quote ไม่ใช่ IF NOT EXISTS) |
| ไฟล์มี DO + `SELECT 1/0` กลางไฟล์ | — | — | deploy: `P3018 division by zero` · ไม่มีตารางใดค้าง (ทั้งไฟล์ rollback) · deploy ซ้ำ: `P3009` · ลบแถว `_prisma_migrations` ที่ล้ม + แก้ไฟล์ → deploy ผ่าน (`applied_steps_count 1`) |
⇒ round 2 สรุปว่า "ทีละคำสั่ง" ถูกสำหรับไฟล์ round 2 (ไม่มี DO) · ไฟล์ round 3 มี DO ⇒ **ทั้งไฟล์ atomic** บน prisma 7.8 · `SET lock_timeout` ระดับ session ต้นไฟล์มีผลทั้งสองแบบ · `RESET` ท้ายไฟล์

### D4 — พิสูจน์รันซ้ำบน QC4
1. `rollback-pos_v2_a.sql` (ฉบับเต็ม + RESET) → `Script executed successfully.` · fingerprint ตารางเดิม = ก่อน P1.1a ทุก byte
2. `migrate deploy` → `Applying migration 20261120000000_pos_v2_a` · `All migrations have been successfully applied.`
3. schema snapshot หลัง deploy = `cols 133:fe6c18c9… idx 37:d3adfa30… con 106:b5c79e95… enum [PRODUCT,SERVICE,MENU,BUNDLE]` (= ค่าเดียวกับโครงสร้าง round 2 ก่อน rollback)
4. `prisma db execute --file prisma/migrations/20261120000000_pos_v2_a/migration.sql` ด้วยมือ (รอบสอง) → `Script executed successfully.` (ไม่มี error) · snapshot หลังรันซ้ำ = ค่าเดิมทุกตัว (ไม่เปลี่ยนอะไร) · `migrate status` → `Database schema is up to date!`

### Runbook กู้ P3009 (prod)
1. `prisma migrate deploy` ล้ม (P3018 = SQL error · ไฟล์นี้ atomic ⇒ ไม่มีของค้างครึ่งไฟล์) → deploy ครั้งต่อไปจะได้ `P3009 failed migrations in the target database`
2. รัน rollback SQL ข้างล่าง (IF EXISTS ทุกคำสั่ง — ใช้ได้ทั้งตอนมีของค้างและไม่มี) ⇒ ลบแถว `_prisma_migrations` ที่ล้มด้วย
3. แก้เหตุ (เช่น lock_timeout หมดเพราะตารางเดิมถูกล็อก → รันนอกเวลาขาย) → `prisma migrate deploy` ใหม่
4. (ห้าม `migrate resolve` บนฐานร่วม — ตามกติกา qc-prisma.sh · บน prod ผู้คุมงานตัดสิน)

### rollback ฉบับสุดท้าย (ใช้แทนฉบับ round 1/2)
```sql
SET lock_timeout = '3s';
BEGIN;
ALTER TABLE IF EXISTS "PosProductOptionGroup" DROP CONSTRAINT IF EXISTS "PosProductOptionGroup_productId_fkey";
ALTER TABLE IF EXISTS "RecipeLine" DROP CONSTRAINT IF EXISTS "RecipeLine_productId_fkey";
ALTER TABLE IF EXISTS "PosProduct" DROP CONSTRAINT IF EXISTS "PosProduct_categoryId_fkey";
ALTER TABLE IF EXISTS "PosProduct" DROP CONSTRAINT IF EXISTS "PosProduct_parentId_fkey";
DROP TABLE IF EXISTS "PosProductOptionGroup";
DROP TABLE IF EXISTS "RecipeLine";
DROP TABLE IF EXISTS "PosProduct";
DROP TABLE IF EXISTS "PosCategory";
DROP TYPE IF EXISTS "PosProductKind";
ALTER TABLE "MenuItem" DROP COLUMN IF EXISTS "posProductId";
ALTER TABLE "ShopProduct" DROP COLUMN IF EXISTS "posProductId";
ALTER TABLE "ShopOrderLine" DROP COLUMN IF EXISTS "posProductId";
ALTER TABLE "PosSaleLine" DROP COLUMN IF EXISTS "productId";
ALTER TABLE "RestaurantOrderItem" DROP COLUMN IF EXISTS "productId";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261120000000_pos_v2_a';
COMMIT;
RESET lock_timeout;
```

### F15.5 — หลักฐานลบ (negative proof)
ฝังไฟล์ชั่วคราว 3 ไฟล์ในต้นไม้จริง (ลบทันทีหลังรัน · `git status` สะอาด): `src/app/__f155_probe.ts` (import ตัวบ่งชี้) · `src/lib/actions/__f155_probe.ts` (`"use server"` + backfillCatalog) · `scripts/qc-__f155-probe.mts` (`u ?? C.<ตัวบ่งชี้>` ในไฟล์ที่อนุญาต) → `pnpm fitness` (ไม่มี env) exit 1 · F15.5 ❌ ระบุครบ 3 ไฟล์ (F6.1 ก็จับไฟล์ action ที่ไม่มีการตรวจสิทธิ์ด้วย) · `scanSystemMarker(<root ชั่วคราว>)` ที่ catalog.ts ใช้ `Symbol.for(` → 2 ข้อ ("ต้องสร้างด้วย Symbol(…)" · "ห้าม Symbol.for(") · ลบแล้ว: `JSON_SUMMARY {"total":39,"passed":39,"findings":[]}`

### กติกาสำหรับผู้เรียกใน P1.1b (D6)
P2002 ภายใน **transaction ที่ผู้เรียกส่งมา** (`client` = tx): catalog คืน `CatalogError("CONFLICT")` ได้ แต่ transaction ของผู้เรียก **ถูก Postgres ยกเลิกแล้ว** (คำสั่งถัดไปใน tx นั้นจะ error "current transaction is aborted") ⇒ ผู้เรียกต้องจบ tx นั้น (throw/rollback) ไม่ใช่จับ CONFLICT แล้วเขียนต่อ · ถ้าต้องการ "ลองแล้วไปต่อ" ให้เรียกนอก tx หรือห่อด้วย savepoint ของตัวเอง

### Acceptance (round 3)
- oracle: exit 0 · `===== qc-pos-p1.1 ===== ผ่าน 93/93` · `JSON_SUMMARY {"suite":"qc-pos-p1.1","total":93,"passed":93,"failed":[],…,"skippedGroups":{"S2":"P1.1b ยังไม่เริ่ม … ข้าม 28 ข้อ"}}` · ROWCOUNTS เท่าเดิม
- backfill ร้าน QC: dry 13/3/4 · จริง 13/3/4 · จริงซ้ำ 0/0 · ถอยแล้วซ้อน A 0 · B 13/3/4 · counts ร้าน QC `{"zeroPriceProduct":2,"trackStockAutoOn":3, อื่น ๆ 0}` · INVARIANTS ไม่ซ้ำ/ไม่กำพร้า
- A3: fingerprint ตารางเดิม = ก่อน P1.1a หลัง rollback · หลัง backfill · หลัง 17 ชุด
- regression 17 ชุด: 17 SAME กับ round 1 (logs `.qc-shots/pos/p1.1a/r3/after/`)
- fitness มี env / ไม่มี env: exit 0 · `{"total":39,"passed":39,"findings":[]}` ทั้งคู่ · F15.1 "หนี้เดิม 9 ไฟล์ 36 จุด" · F15.2 ✅ · F15.5 ✅
- typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` → exit 0 · 0 error (รอบเดียว)

### ORACLE-EDIT (round 3)
ไม่มี

### หนี้เพิ่ม (round 3)
| หนี้ | ใบเจ้าของ |
|---|---|
| index บาร์โค้ดของ InvItem (ขา UNION ที่สองของ byBarcode สแกนตาม tenantId) | P6.1 |
| `checkCatalogWrite` ↔ `posCanSetTenantPrice` (hotfix/pos-page-authz) ต้องเป็นกติกาเดียวตอน merge | ผู้คุมงาน (merge) |
| P1.1b ไฟล์ legacy-sync ต้องเพิ่มตัวเองใน `SYSTEM_MARKER_ALLOWLIST` พร้อมเหตุผล | P1.1b |
| resolver/คลัง: คลังปิดใช้งานยังนับ (มติ a — ตามหน้าขายวันนี้) · ถ้าจะกรองต้องแก้ systemForUnit ด้วยพร้อมกัน | P2.1 |

# Round 4 oracle (oracle writer · brief `pos-brief-P1.1a-R4.md` E5 · base 14d86845 + merge ledger ของ session/pos)
oracle `scripts/qc-pos-p1.1.mts` → **127 ข้อ · P1.1a 99 · P1.1b 28** (เดิม 121/93) · id เดิมคงที่ · ข้อใหม่ต่อท้าย S3.40–S3.45 · หลักฐานแดง `ledger/wo-notes/pos-P1.1a-red4.txt`

ราคาลิ้นชักวันนี้ (อ้างให้ builder · E3): PRODUCT `register.ts:137-151` `posCatalog` — AP หาแบบ `InvItem.accountProductId` (`:139-146`, **ไม่กรอง archivedAt/สมุดบัญชี**) แล้ว `priceSatang = sale && sale > 0 ? sale : Math.max(0, i.costSatang)` (`:149`) · ไม่อ่าน posPrice เลย · รายการ = `inventory.listItems` (PRODUCT · ไม่เก็บถาวร · 200 ตัว `inventory/service.ts:793-799`) · SERVICE `register.ts:159-176` `posServices` → `inventory.listServices` (`inventory/service.ts:802-806`) ราคา = `InvItem.priceSatang` ล้วน (`:174`) ไม่อ่าน AccountProduct

| ข้อ | ใหม่/แก้ | ตรวจอะไร | บน 14d86845 |
|---|---|---|---|
| S3.28 | ขยาย (E5) | + ผู้จัดการ A `createProduct({unitId:null, invItemId: X2})` ได้ · `Y2` = PERMISSION_DENIED (ไม่มีแถว) · เจ้าของ `updateProduct` ย้ายแถวผูกคลัง X ไปสาขา B = VALIDATION แถวไม่เปลี่ยน · ไป A ได้ | ✅ (ตรึงพฤติกรรมเดิม) |
| S3.29 | แทนทั้งข้อ (E5 behavioural) | client ที่ดัก SQL ด้วย `log:[{emit:"event",level:"query"}]` + `$on("query")` (พิสูจน์แล้วว่าใช้ได้กับ PrismaPg บน 7.8 — probe อ่านล้วน) ส่งเป็นพารามิเตอร์ `client` ของ listForUnit: คำสั่งที่แตะ InvMovement ≤1 ต่อหน้า · ทุก `FROM "InvMovement"` อยู่ใน `EXISTS (SELECT 1 …)` · มี `"itemId"`+`"systemId"` · ไม่มี GROUP BY/JOIN · movement คลังอื่น ⇒ AUTO false · movement คลังสาขา ⇒ AUTO true · คู่บวกตัวดัก (เห็น SQL ของ PosProduct) | ✅ (ตรึงพฤติกรรม D2 · รอบแรกแดงเพราะหน้าที่เลือกไม่มีแถว AUTO onHand 0 = ความผิดของ fixture → แก้เป็นค้น `${TAG} c7-` แล้วรันใหม่) |
| S3.30 | แก้ (E5 · ตรงเป๊ะ) | ส่วนเพิ่มของตัวนับเทียบ dry-run ฐานก่อนสร้าง fixture (ไม่ผูกสภาพ seed): soldAtCost 2(+1) · apIgnored 2 · invalidLegacy 2(+1) · priceNotSetOther 8 · ผลรวม 15 = แถวราคา null ที่ backfill สร้าง · fixture ราคา null 15 ตัวอยู่ในตัวอย่างของตัวนับเดียวพอดี (r4NegCost เข้า soldAtCost หรือ invalidLegacy ก็ได้ — ลำดับตัดสินเป็นของ builder) · fixture มีราคา 6 ตัวไม่อยู่ในตัวอย่างราคา null · ต้องมี `samples.invalidLegacyPrice` | ❌ ถูกเหตุ: r4SvcArchAp ไปอยู่ apIgnored (ลิ้นชักบริการไม่อ่าน AP) · r4NegCost นับสองตัว (รวม 16 ≠ 15) · ไม่มี samples.invalidLegacyPrice |
| S3.40 | ใหม่ (E1) | `pos.catalog.checkCatalogWrite(null|undefined|ตัวบ่งชี้, …)` = `"PERMISSION_DENIED"` ×6 (แถวสาขา + แถวทุกสาขา) · เจ้าของ `"OK"` ×2 | ❌ ถูกเหตุ: null/undefined = OK · ตัวบ่งชี้ = throw TypeError |
| S3.41 | ใหม่ (E1) | เจ้าของ + unitId ร้านอื่น / POS อื่นของร้าน / สาขาเก็บถาวร / สาขาไม่มี POS / ไม่มีจริง = `"NOT_FOUND"` · สีลม/อารีย์ = `"OK"` | ❌ ถูกเหตุ: ทุกตัว OK |
| S3.42 | ใหม่ (E2) | โฟลเดอร์ `20261120000001_pos_v2_a_links`: `SET lock_timeout` (ไม่ใช่ LOCAL) → ADD COLUMN IF NOT EXISTS ×5 (คู่ตาราง.คอลัมน์ครบ · TEXT) → `RESET lock_timeout` · ไม่มีคำสั่งอื่น · ไม่มี DO / `$$` | ❌ ถูกเหตุ: ไม่มีโฟลเดอร์ |
| S3.43 | ใหม่ (E2) | ไฟล์ `_pos_v2_a` ไม่มี ALTER TABLE บนตารางเดิม 5 ตัว · ไม่มี ADD COLUMN คอลัมน์เชื่อม | ❌ ถูกเหตุ: มีครบ 5 |
| S3.44 | ใหม่ (E3) | `catalogPriceDiffersFromTill` ส่วนเพิ่ม = 4 (r4PosOverCost 3000/2000 · r4SvcLiveAp 12000/0 · p2 4400/0 · svcDiff 12000/15000) · ตัวอย่างมีทั้งสองราคา (`catalogPriceSatang`/`tillPriceSatang` หรือค่าเลขสองตัว) · posPrice/posZero/p8/arch/svcZero/costOnly ไม่อยู่ | ❌ ถูกเหตุ: ไม่มีตัวนับ |
| S3.45 | ใหม่ (E5) | `Object.entries` ของ module `@/lib/modules/pos` + `catalog` ไม่มี symbol/ตัวบ่งชี้ · ไม่มี backfillCatalog (ชื่อหรือฟังก์ชันเดียวกัน) · มี checkCatalogWrite | ✅ (ตรึงพฤติกรรม D5) |
| S3.22/S3.23/S3.31/S3.32 | ORACLE-EDIT (รอรับรอง) | อ่านชุด `_pos_v2_a` + `_pos_v2_a_links` ต่อกันตามลำดับโฟลเดอร์ (ไฟล์เดียว = เหมือนเดิมทุกตัวอักษร) | ✅ |

typecheck (รอบเดียว · 5632 MB): exit 0

ผลบน 14d86845 (QC4 · รันที่สอง tag qc-p1.1-4708f2): `ผ่าน 93/99` · แดง 6 ตามเหตุ S3.30 S3.40 S3.41 S3.42 S3.43 S3.44 · S1.36 ✅ · `ROWCOUNTS_AFTER … เท่าเดิม` (รันแรก qc-p1.1-416abe ก็คืนสภาพครบ — แดง 7 รวม S3.29 จาก fixture ผิดหน้า แก้แล้ว)

fixture รอบ 4: `r4-svc0-arch-ap` (SERVICE 0 + AP เก็บถาวร 2500) · `r4-pos-over-cost` (AP sale 0 · posEnabled posPrice 3000 · ต้นทุน 2000) · `r4-svc0-live-ap` (SERVICE 0 + AP 12000) · `r4-neg-with-cost` (AP −100 · ต้นทุน 800) · `r4-wh-x2`/`r4-wh-y2` · `r4-d2-probe` + InvMovement 2 แถว · **bulk 520 แถวของ S1.37 เปลี่ยนเป็น SERVICE ราคา 100** (เดิม PRODUCT ราคา null → ล้นตัวอย่าง priceNotSetOther ≤20 จน fixture ที่มีชื่อหลุด) · dry-run เพิ่ม 1 ครั้ง (ฐานตัวนับ ก่อน fixture · อ่านล้วน)

### ORACLE-EDIT requests (round 4 · oracle writer)
1. **S3.23 (+ S3.22/S3.31/S3.32)** — E2 ย้าย ADD COLUMN 5 ตัวออกจาก `_pos_v2_a` ⇒ S3.23 อ่านไฟล์เดียวจะแดงเสมอหลัง builder ทำ E2 (`addIdx` ว่าง) ทั้งที่เจตนา M2 (SET ต้น · คอลัมน์เชื่อมท้าย · RESET สุดท้าย) ยังเป็นจริงบนชุดสองไฟล์ · **ใส่แล้ว** แบบชั่วคราวในโค้ด (คอมเมนต์ `ORACLE-EDIT P1.1-S3.22/S3.23/S3.31/S3.32`) — บน 14d86845 ผลเหมือนเดิมทุกตัว · ถ้าไม่รับรอง: ย้อนบรรทัด `const sql = …migSet…` กลับเป็นไฟล์เดียว แล้ว S3.23 ต้องเขียนใหม่ให้ตรวจไฟล์ links แทน
2. ไม่มีข้ออื่น

### ที่กำกวม (ข้อเสนอ ruling ของ oracle writer)
- E1 ตัวบ่งชี้ระบบส่งเข้า checkCatalogWrite: brief บอกแค่ null/undefined — oracle ถือว่า "ไม่ใช่ MembershipCtx" ⇒ `"PERMISSION_DENIED"` (ไม่ throw)
- E1 ผลเป็นค่าที่ **คืน** (`"NOT_FOUND"`/`"PERMISSION_DENIED"`) ไม่ใช่ throw — ตามชนิด `CatalogWriteVerdict` เดิม
- E3 `catalogPriceDiffersFromTill` นับเฉพาะแถวที่มาจาก InvItem (ลิ้นชักมีราคาให้เทียบ) — แถวของเว็บร้าน/เมนูเองไม่นับ (เช่น shop-outside-first-pos ราคา 3333 ผูก itX ซึ่งลิ้นชักของ POS แรกไม่ขาย) ⇒ ส่วนเพิ่ม 4 พอดี
- E3/E5 "ทุก fixture อยู่ในตัวอย่างของตัวนับเดียว" ต้องมี `samples.invalidLegacyPrice` (วันนี้ไม่มี) — oracle บังคับ
- E2 per-statement บน prisma ที่ pin = พิสูจน์ของ builder (txid) — oracle ตรวจได้แค่รูปไฟล์ (ไม่รัน migrate บน QC4 ตามกติกาเลน)
- E4 (F15.5 `||` · ternary · alias) ไม่อยู่ในขอบเขต E5 — ไม่ได้เพิ่มข้อสอบ (builder พิสูจน์ลบเอง)

# Round 4 (builder · brief `pos-brief-P1.1a-R4.md` E1–E4 + มติผู้คุมงานเรื่องข้อเปิดของ oracle writer) — checkpoint
| # | ขั้น | สถานะ |
|---|---|---|
| R4-0 | fingerprint ก่อน (r4-before) + schema snapshot | ✅ ตารางเดิม = r3-final ทุก byte · `cols 133:fe6c18c9… idx 37:d3adfa30… con 106:b5c79e95…` (= round 3) |
| R4-1 | โค้ด E1 E3 E4 | ✅ |
| R4-2 | E2 probe (schema แยก `p11probe4` บน QC4 · ลบแล้ว) | ✅ links = ทีละคำสั่ง (xid ต่างกัน 5 ตัว) · ไฟล์แรก = atomic · lock timeout → P3018 → P3009 → กู้ได้ · `db execute` = tx เดียว |
| R4-3 | QC4: rollback (links → ตาราง) → แยกไฟล์ → deploy → รันซ้ำด้วยมือทั้งสองไฟล์ → status → rollback อีกรอบ → deploy | ✅ โครงสร้างสุดท้าย = round 3 ทุก hash · `Database schema is up to date!` |
| R4-4 | backfill ร้าน QC (dry/real/again/overlap) | ✅ 13/3/4 → 13/3/4 → 0 → ถอย → A 0 · B 13/3/4 · INVARIANTS สะอาด · ตารางเดิม = r3-final |
| R4-5 | oracle | ✅ exit 0 · `ผ่าน 99/99` (P1.1b 28 ข้อข้ามตาม guard) |
| R4-6 | regression 17 ชุด · fitness 2 โหมด (+F15.5 E4 + หลักฐานลบ) | ✅ 17 SAME กับ round 3 · 39/39 ทั้งคู่ · หลักฐานลบครบ 3 รูป |
| R4-7 | typecheck | ✅ exit 0 (`tsc --noEmit` · รอบเดียว) |
| R4-8 | notes · commit · push | ✅ |

## Round 4 — รายงานต่อข้อ
| ข้อ | ก่อน (round 3) | หลัง (round 4 · file:line) | check |
|---|---|---|---|
| E1 | `checkCatalogWrite(actor: MembershipCtx \| null)` · null = OK (ข้ามสิทธิ์) · ตัวบ่งชี้ = TypeError · unitId ไม่ตรวจ | `catalog.ts:198` export (facade `catalog.checkCatalogWrite`) รับ `MembershipCtx` จริงเท่านั้น — `isMembershipCtx :174` (role ∈ OWNER/MANAGER/STAFF · unitAccess สตริง[] · permissions ออบเจกต์) ไม่ผ่าน (null/undefined/ตัวบ่งชี้/อื่น) = `"PERMISSION_DENIED"` (คืนค่า ไม่ throw) · where ต้องเป็น POS เปิดใช้งานของร้าน · `row.unitId` ต้องเป็นสาขาไม่เก็บถาวรที่ผูก where.systemId (AppSystemUnit unique tenant+unit+POS) ไม่ใช่ = `"NOT_FOUND"` · ทางข้ามสิทธิ์ของระบบเหลือที่ `rowWriteVerdict :230` (ไม่ export · actor null มาจาก `actorOf :152` เมื่อเห็นตัวบ่งชี้เท่านั้น) · `requireRowWrite :258` ใช้ทางภายใน (พฤติกรรมผู้เขียนเดิมไม่เปลี่ยน) | S3.40 S3.41 ✅ · S3.27/S3.28/X3.* ✅ |
| E2 | ไฟล์เดียว (DO $$ ⇒ ทั้งไฟล์ tx เดียว ⇒ ล็อก ACCESS EXCLUSIVE ตารางเดิม 5 ตัวถือจนจบไฟล์) | `20261120000000_pos_v2_a` = enum + 4 ตาราง + index + FK (atomic · DO $$ เดิม) — ไม่มี ALTER ตารางเดิม · ใหม่ `20261120000001_pos_v2_a_links` = `SET lock_timeout = '3s';` → ADD COLUMN IF NOT EXISTS ×5 คำสั่งเดี่ยว → `RESET lock_timeout;` ไม่มี DO/dollar-quote (คอมเมนต์ไม่มีคำนั้นด้วย) · วัดผลข้างล่าง | S3.42 S3.43 S3.22/23/31/32 ✅ |
| E3 | ตัดสิน "ลิ้นชัก" จาก salePrice อย่างเดียว · ตัวนับราคา null ซ้อนกัน (invalidLegacy นับคู่ · บริการ+AP เก็บถาวรเข้า apIgnored) | `tillPriceToday catalog.ts:1088` = ราคาที่ลิ้นชักคิดวันนี้ (อ้างบรรทัดข้างล่าง) ใช้ทุกการตัดสิน · partition ราคา null `:1168` · `catalogPriceDiffersFromTill` `:1186` (ตัวอย่าง ≤20/ร้าน: `id · name · catalogPriceSatang · tillPriceSatang`) · `samples.invalidLegacyPrice` (≤20/ร้าน · ขั้นเมนู `:1248` · เว็บร้าน `:1300`) · สคริปต์พิมพ์ตัวอย่างพร้อมสองราคา `pos-backfill-catalog.mts:132` | S3.30 S3.44 S3.12 S3.13 ✅ |
| E4 | F15.5 จับแค่ `x ?? <ตัวบ่งชี้>` | `fitness-pos.mts:963 markerMisuse` (AST): `x ?? M` · `x \|\| M` · `c ? M : y` / `c ? y : M` — **ทุกไฟล์** (อนุญาตหรือไม่) · alias นอก catalog.ts: `const S = M` (รวมค่าที่ถือ M ผ่าน ?? / \|\| / && / ?: / ลูกศร `() => M` — `carriesMarker :946`) · `S = M` · `{ M: S } = …` · `import/export { M as S }` · `M` = ชื่อตรง · `m.M` · `m?.M` · `m["M"]` (`isMarkerRef :936`) · การหลบด้วยคีย์ที่คำนวณตอนรัน (`m[k]`) อยู่นอกขอบเขต · alias ยกเว้นข้อสอบ `scripts/qc-*.mts` (ดู "ตัดสิน" ข้อ 1) | F15.5 ✅ + หลักฐานลบ |

### E3 — ราคาลิ้นชักวันนี้ (ตรวจเองในโค้ด)
- PRODUCT: `register.ts:137` `posCatalog` → `inventory.listItems` (สินค้า · `archivedAt: null` · 200 ตัว `inventory/service.ts:793-799`) · AP หาด้วย `InvItem.accountProductId` `where: { tenantId, id: { in: acctIds } }` (`:142` — ไม่กรองเก็บถาวร/สมุดบัญชี) · `const priceSatang = sale && sale > 0 ? sale : Math.max(0, i.costSatang);` (`:149`) — ไม่อ่าน posPrice
- SERVICE: `register.ts:163` `posServices` → `inventory.listServices` (`archivedAt: null` · `:802-807`) · `priceSatang: r.priceSatang` (`:174`) — ไม่อ่าน AccountProduct
- `tillPriceToday` = null เมื่อ InvItem เก็บถาวร (ลิ้นชักไม่แสดง) · ไม่จำลองเพดาน 200 รายการของหน้าขาย (ข้อจำกัดหน้าจอ ไม่ใช่ราคา)
- **ลำดับตัดสิน partition ราคา null** (ตัวแรกที่จริงชนะ · คอมเมนต์ในโค้ด `:1168`): 1) `soldAtCostToday` (ลิ้นชักคิดราคาทุนจริงวันนี้: สินค้า · sale ≤ 0/ว่าง · ต้นทุน > 0) → 2) `apIgnoredButTillPriced` (ลิ้นชักคิด salePrice > 0 ของ AP ที่ C7 ไม่นับ) → 3) `invalidLegacyPrice` → 4) `priceNotSetOther` ⇒ AP −100 + ต้นทุน 800 = `soldAtCostToday` เท่านั้น · บริการราคา 0 + AP เก็บถาวร = `priceNotSetOther` (ลิ้นชักบริการไม่อ่าน AP) · เมนู/แถวเว็บร้านเอง: มีแค่ 3) / 4)
- ลำดับราคาแคตตาล็อกที่รับรองแล้ว (C7) ไม่เปลี่ยน — ตัวนับใหม่คือสิ่งที่เจ้าของอ่านก่อนสลับ
- `catalogPriceDiffersFromTill` นับเฉพาะแถวที่มาจาก InvItem (ขั้น 1 · PRODUCT/SERVICE ผูก invItemId) — แถวของเมนู/เว็บร้านเองไม่นับ (มติผู้คุมงาน)

### E2 — การวัด (prisma 7.8.0 · `pnpm exec prisma --version`)
วิธี: schema Postgres แยก `p11probe4` บน QC4 (config `.qc-shots/pos/p1.1a/r4b/probe/prisma.config.ts` ต่อ DIRECT_URL ของ qc4.sh + `schema=p11probe4` · ไฟล์ migration ในโฟลเดอร์ probe = สำเนา **ตรงทุก byte** ของสองไฟล์จริง (`cmp`) · ตารางแทน 5 ตัวชื่อเดียวกับตารางเดิม) · คำสั่ง `bash scripts/iso.sh bash scripts/qc4.sh pnpm exec prisma migrate deploy --config <probe>` · อ่าน xid ที่เขียน catalog row (`pg_attribute.xmin` ของคอลัมน์ใหม่ · `pg_class/pg_type/pg_constraint.xmin` ของไฟล์แรก) — วัดไฟล์จริง ไม่ต้องแทรกคำสั่ง txid · ลบ schema แล้ว (`DROPPED []`)
| การทดลอง | ผลดิบ | ความหมาย |
|---|---|---|
| deploy ไฟล์ links | `ShopProduct@4427576 · ShopOrderLine@4427577 · PosSaleLine@4427578 · MenuItem@4427579 · RestaurantOrderItem@4427580` | 5 คำสั่ง = 5 transaction (ทีละคำสั่ง) ⇒ ACCESS EXCLUSIVE ต่อตารางถือแค่คำสั่งเดียว |
| deploy ไฟล์แรก | ตาราง 4 + index 18 ทั้งหมด `@4427551` · enum `@4427552` · FK `@4427553..56` | CREATE TABLE 4 + CREATE INDEX 14 = 18 คำสั่ง xid เดียวกัน = transaction เดียว · enum/FK อยู่ใน `DO … EXCEPTION` = subtransaction (xid ย่อยได้หลังตัวแม่เสมอ ตามที่ PG แจก) — ถ้าทีละคำสั่ง CREATE TABLE แต่ละตัวจะได้ xid ต่างกัน |
| ไฟล์แรก + `SELECT 1/0;` ท้ายไฟล์ (สำเนา probe เท่านั้น) | `P3018 division by zero` · หลังล้ม `MAINFILE objects 0` · แถว migration `done false` | ทั้งไฟล์ rollback = atomic |
| ไฟล์ links ขณะอีก session ถือ `ACCESS SHARE` บน MenuItem (ตัวที่ 4) | `P3018 … canceling statement due to lock timeout` (≈3 วินาทีหลังเริ่ม) · คอลัมน์ที่มี = ShopProduct/ShopOrderLine/PosSaleLine (3 ตัวแรก) | ทีละคำสั่งจริง: 3 ตัวแรก commit แล้ว · lock_timeout ระดับ session มีผล |
| deploy ซ้ำ → ลบแถว `_prisma_migrations` ที่ล้ม → deploy | `P3009` → `FORGOT failed rows 1` → `All migrations have been successfully applied` · คอลัมน์ 5 ตัว (3 ตัวแรก xid เดิม · 2 ตัวหลัง xid ใหม่) | กู้ได้โดยไม่ต้อง rollback (IF NOT EXISTS ข้ามที่มีแล้ว) |
| `prisma db execute` ไฟล์ SET + CREATE TABLE AS txid ×2 | `dbx1 4431922 3s · dbx2 4431922 3s` | db execute ส่งทั้งไฟล์ = transaction เดียว (สำคัญต่อ rollback บน prod) |
logs: `.qc-shots/pos/p1.1a/r4b/probe-*.log`

### E2 — บน QC4 (ลำดับจริง · ด่าน host `ep-frosty-lab`)
1. rollback ของรูป round 3 ด้วยไฟล์ใหม่ (links → ตาราง) → `Script executed successfully.` ×2 · `LOCALONLY [_pos_v2_a, _pos_v2_a_links]` · enum [] · fingerprint ตารางเดิม = r3-after-rollback (= ก่อน P1.1a) ทุก byte
2. แยกไฟล์ → `migrate deploy` → `Applying … 20261120000000_pos_v2_a · 20261120000001_pos_v2_a_links · All migrations have been successfully applied.`
3. snapshot = `cols 133:fe6c18c906a31d3c61ef219c07a6e27f idx 37:d3adfa308d42a24677ba77c65294e84a con 106:b5c79e95e19bd7a8a05c120e20016e7e enum [PRODUCT,SERVICE,MENU,BUNDLE]` = round 3 ทุก hash
4. รันซ้ำด้วยมือ `prisma db execute --file prisma/migrations/<ทั้งสองไฟล์>/migration.sql` → `Script executed successfully.` ×2 · snapshot ไม่เปลี่ยน
5. `migrate status` → `149 migrations found … Database schema is up to date!`
6. พิสูจน์ rollback ใหม่บนรูป round 4: rollback (links → ตาราง) → snapshot `cols 78 … enum []` · fingerprint = ก่อน P1.1a → `migrate deploy` → snapshot = round 3 · status up to date
logs: `.qc-shots/pos/p1.1a/r4b/qc4-*.log` · ไม่ต้อง `prisma generate` (schema ไม่เปลี่ยนใน round 4)

### rollback ฉบับสุดท้าย (round 4 · ใช้แทนฉบับก่อน) — ขั้น 1 links แล้วขั้น 2 ตาราง · ใช้ได้กับทั้งรูป round 3 และ round 4
ลำดับบน prod: revert โค้ด + deploy ก่อน (client ที่ generate ใหม่อ้างคอลัมน์ใหม่) → ขั้น 1 → ขั้น 2
```sql
-- ขั้น 1/2 — rollback-1-pos_v2_a_links.sql · 🔴 บน prod ส่งทีละคำสั่ง (psql -f โหมด autocommit) — `prisma db execute` รวมเป็น tx เดียว (วัดแล้ว)
SET lock_timeout = '3s';
ALTER TABLE "MenuItem" DROP COLUMN IF EXISTS "posProductId";
ALTER TABLE "ShopProduct" DROP COLUMN IF EXISTS "posProductId";
ALTER TABLE "ShopOrderLine" DROP COLUMN IF EXISTS "posProductId";
ALTER TABLE "PosSaleLine" DROP COLUMN IF EXISTS "productId";
ALTER TABLE "RestaurantOrderItem" DROP COLUMN IF EXISTS "productId";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261120000001_pos_v2_a_links';
RESET lock_timeout;
```
```sql
-- ขั้น 2/2 — rollback-2-pos_v2_a.sql (atomic · ไม่แตะตารางเดิม)
SET lock_timeout = '3s';
BEGIN;
ALTER TABLE IF EXISTS "PosProductOptionGroup" DROP CONSTRAINT IF EXISTS "PosProductOptionGroup_productId_fkey";
ALTER TABLE IF EXISTS "RecipeLine" DROP CONSTRAINT IF EXISTS "RecipeLine_productId_fkey";
ALTER TABLE IF EXISTS "PosProduct" DROP CONSTRAINT IF EXISTS "PosProduct_categoryId_fkey";
ALTER TABLE IF EXISTS "PosProduct" DROP CONSTRAINT IF EXISTS "PosProduct_parentId_fkey";
DROP TABLE IF EXISTS "PosProductOptionGroup";
DROP TABLE IF EXISTS "RecipeLine";
DROP TABLE IF EXISTS "PosProduct";
DROP TABLE IF EXISTS "PosCategory";
DROP TYPE IF EXISTS "PosProductKind";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261120000000_pos_v2_a';
COMMIT;
RESET lock_timeout;
```

### Runbook P6.1 (deploy ขั้น schema ของ P1.1a บน prod)
1. **ช่วงเวลา**: นอกเวลาขาย (off-peak) ของร้านส่วนใหญ่ — ไฟล์ links ต้องได้ ACCESS EXCLUSIVE ทีละตารางบน ShopProduct · ShopOrderLine · PosSaleLine · MenuItem · RestaurantOrderItem (ตารางร้อนของการขาย/สั่งอาหาร)
2. **pre-flight** (อ่านล้วน ก่อน deploy ทันที):
   - `pg_stat_activity`: ไม่มี session ที่ `state = 'idle in transaction'` หรือ `xact_start` เก่ากว่า ~1 นาที ที่แตะ 5 ตาราง (join `pg_locks` บน `relation = '"<table>"'::regclass`)
   - `pg_locks` บน 5 ตาราง: ไม่มีล็อกค้าง / คิวรอ (`granted = false`)
   - ไม่มี backfill (`pos-backfill-catalog`) หรือ job ยาวที่เขียนตารางเหล่านี้กำลังรัน
   - ไม่มี autovacuum แบบกัน wraparound บน 5 ตาราง (`pg_stat_activity.query LIKE 'autovacuum:%(to prevent wraparound)%'`) — ตัวนี้ไม่ยอมหลีกให้ ALTER
3. **ผลที่คาดเมื่อรอล็อกเกิน 3 วินาที**: `P3018 … canceling statement due to lock timeout` (วัดแล้วบน QC4) · ไฟล์ links ทีละคำสั่ง ⇒ คอลัมน์ที่ทำไปแล้วคงอยู่ (ไม่อันตราย — nullable ไม่มีใครอ่าน) · ไฟล์แรก atomic ⇒ ไม่เหลืออะไร
   **นโยบายลองใหม่**: หาเหตุจาก pre-flight ข้อ 2 → รอให้ธุรกรรมยาวจบ (ห้าม kill ธุรกรรมขายเอง) → ลองใหม่ได้สูงสุด 3 ครั้ง ห่าง ≥ 1 นาที → ยังไม่ได้ = เลื่อนไปช่วงเงียบถัดไป (ห้ามเพิ่ม lock_timeout เพื่อดันผ่าน — คิวที่รอหลัง ALTER จะหยุดการขายทั้งหมด)
4. **กู้หลังไฟล์ล้ม (ทั้งไฟล์แรกแบบ atomic และไฟล์ links)**: `prisma migrate resolve --rolled-back <ชื่อ migration>` (หรือลบแถว `_prisma_migrations` ที่ล้ม — วิธีที่ซ้อมบน QC4) แล้ว `migrate deploy` ใหม่ (IF NOT EXISTS ข้ามของที่มีแล้ว) — **ไม่ใช่** rollback SQL ฉบับเต็ม: `DROP COLUMN IF EXISTS` ถือ ACCESS EXCLUSIVE แม้คอลัมน์ไม่มี และ rollback **ทำลายข้อมูล** เมื่อ P1.1b เขียนคอลัมน์เชื่อมแล้ว
5. **ตรวจซ้ำกับ prisma รุ่นที่ใช้ deploy prod จริง**: พฤติกรรม "ไฟล์ไม่มี DO = ทีละคำสั่ง · มี DO/dollar-quote = ทั้งไฟล์ tx เดียว" วัดบน prisma **7.8.0** เท่านั้น — ก่อน deploy prod ให้รัน probe เดิม (schema แยก · อ่าน xmin) กับรุ่นที่ pin ใน lockfile ตอนนั้น ถ้าต่าง = หยุดและแจ้งผู้คุมงาน
6. rollback (ถ้าจำเป็นจริง ก่อน P1.1b เขียนลิงก์): revert โค้ด + deploy → ขั้น 1 ทีละคำสั่ง → ขั้น 2 (ข้างบน)

### Backfill รอบ 4 (ร้าน QC ของ POS · `--tenant=posqc-coffee-tenant --tenant=posqc-resto-tenant`)
| ขั้น | exit | created | updated |
|---|---|---|---|
| dry-run | 0 | posProduct 13 · posCategory 3 · og 0 · recipe 0 · invItem 0 | menuItem 4 |
| จริง | 0 | 13 · 3 | menuItem 4 |
| จริงซ้ำ | 0 | 0 ทั้งหมด (มีอยู่แล้ว invItem 9 · menuItem 4) | 0 |
| ถอย (unbackfill `menuLinks 4 … product 13 category 3`) → 2 โปรเซสซ้อน | 0/0 | A 0 (รอล็อกร้าน แล้ววางแผนใหม่) · B 13/3 | B menuItem 4 |
counts ร้าน QC (ทุกขั้น): `{"soldAtCostToday":0,"zeroPriceProduct":2,"invalidLegacyPrice":0,"apIgnoredButTillPriced":0,"priceNotSetOther":0,"servicePriceDiffersFromAccountProduct":0,"catalogPriceDiffersFromTill":0,"trackStockAutoOn":3, อื่น 0}` · INVARIANTS `{"products":13,"categories":3,"dupInv":0,"invWithout":0,"menuUnlinked":0,"menuShared":0,"orphanMenuProducts":0,"dupCat":0}`
ทั้ง QC4 (dry-run ทุกร้าน · อ่านล้วน): `ร้าน 19 · InvItem 17 · MenuItem 4 · ShopProduct 0` · `soldAtCostToday 6 · zeroPriceProduct 2 · trackStockAutoOn 11 · catalogPriceDiffersFromTill 0 · อื่น 0` · จะสร้าง 8 (ร้านอื่น — ไม่ได้รันจริง)
logs `.qc-shots/pos/p1.1a/r4b/a2-*.log`

### A3 (round 4)
fingerprint ตารางเดิม (count + md5 รวม updatedAt · ร้าน QC POS / ร้านอื่น): r4-before = r3-final · หลัง rollback ทั้งสองรอบ = ก่อน P1.1a · หลัง backfill = r3-final · หลัง 17 ชุด (r4-final) = r3-final ทุก byte (16 รายการ)

### F15.5 (E4) — หลักฐานลบ (negative proof)
- ในต้นไม้จริง (ฝังแล้วลบทันที · `git status` สะอาดหลังลบ): `scripts/qc-__f155r4-probe.mts` (ทางที่อนุญาต: `u || C.<ตัวบ่งชี้>` · `f ? C.<ตัวบ่งชี้> : u` · `f ? u : C.<ตัวบ่งชี้>`) + `src/lib/modules/pos/__f155r4_alias_probe.ts` (`const S = <ตัวบ่งชี้>`) → `pnpm fitness` (ไม่มี env) exit 1 · `{"total":39,"passed":38}` · F15.5 ❌ ระบุ `qc-__f155r4-probe.mts:3 || …` · `:4 ? … : …` · `:5 ? … : …` · `__f155r4_alias_probe.ts:3 alias (ตัวแปร)` (+ "นอกไฟล์ที่อนุญาต") — log `.qc-shots/pos/p1.1a/r4b/f155-negative.log`
- root ชั่วคราว (scratchpad · `scanSystemMarker(<root>)`): `scripts/pos-backfill-catalog.mts` (ทางที่อนุญาต · ไม่ใช่ qc) มี alias ทุกรูป → จับครบ 7: `import { M as X }` · `const S = M` · `const S2 = C.M` · `const S3 = C["M"]` · `S4 = M` · `const { M: S5 } = C` · `const S6 = () => M` · ส่วน `{ actorUserId: M }` (ส่งตัวบ่งชี้ด้วยชื่อเดิม — ทางที่ถูก) ไม่ถูกจับ · `scripts/qc-planted.mts`: `||` · `?:` ×2 · `??` ถูกจับ · `const marker = C.M` ในไฟล์ qc ไม่ถูกจับ (ข้อยกเว้น) — log `r4b/f155-tmproot.log`
- หลังลบ: ไม่มี env exit 0 `{"total":39,"passed":39,"findings":[]}` · มี env (`bash scripts/iso.sh bash scripts/qc4.sh pnpm fitness`) exit 0 `{"total":39,"passed":39,"findings":[]}`

### ORACLE-EDIT requests (round 4 · builder)
ไม่มีข้อที่แดง (99/99) — มีเงื่อนไขข้อเดียว: ถ้าผู้คุมงาน **ไม่** รับข้อยกเว้น alias สำหรับ `scripts/qc-*.mts` (ตัดสินข้อ 1) ⇒ ต้องแก้ oracle `scripts/qc-pos-p1.1.mts:1348` `const marker = C.CATALOG_SYSTEM_ACTOR;` (และ `:468` ถ้านับฟังก์ชันลูกศร) เป็นการอ้าง `C.CATALOG_SYSTEM_ACTOR` ตรงทุกที่ — และ `scripts/qc-pos-p1.3.mts:695` ของใบ P1.3 ด้วย

### ข้อที่ผู้คุมงานต้องตัดสิน (round 4)
1. **E4 alias ยกเว้นข้อสอบ `scripts/qc-*.mts`** — brief บอก "ทุกไฟล์ อนุญาตหรือไม่" แต่ oracle ที่ห้ามแก้ (`qc-pos-p1.1.mts:1348`) และ `qc-pos-p1.3.mts:695` ถือตัวบ่งชี้ไว้ในตัวแปรเพื่อทดสอบ (S3.40/S3.45/S3.33) ⇒ ทำตามตัวอักษร = F15.5 แดงถาวร · ทางที่ปลอดภัยที่สุด: `??`/`||`/`?:` ใช้ทุกไฟล์รวม qc-* · alias ใช้ทุกไฟล์ยกเว้น catalog.ts (บ้าน) และ qc-* (ข้อสอบ ไม่ถูก import โดยโค้ดที่รับคำขอ — F15.5 ข้ออื่นยังคุม)
2. `invalidLegacyPrice` เปลี่ยนความหมายเป็นสมาชิก partition ราคา null (ตามมติ) — แถวที่ได้ราคาจากขั้นอื่นแม้มีราคาเดิมผิดรูปบางช่อง (เช่น salePrice −100 แต่ posPrice 3000 เปิดใช้) **ไม่ถูกนับแล้ว** (round 3 นับ) — แถวแบบนี้ราคาแคตตาล็อก ≠ ลิ้นชักจะโผล่ใน `catalogPriceDiffersFromTill` แทน
3. `tillPriceToday` = null เมื่อ InvItem เก็บถาวร (ลิ้นชักไม่แสดง — `listItems/listServices` กรอง archivedAt) ⇒ สินค้าเก็บถาวรต้นทุน > 0 ไม่มีราคา = `priceNotSetOther` (round 3 = soldAtCostToday) และไม่เข้าตัวนับ differs · เพดาน 200 รายการของหน้าขายไม่จำลอง
4. ตัวนับทุกตัวใช้ "ราคาที่ backfill คิดจากของเดิม" ทั้งแถวใหม่และแถวที่มีแล้ว (เหมือน round 3) — หลัง P1.1b มี setPrice/dual-write ราคาที่เก็บจริงอาจต่าง ⇒ ตัวนับ differs ก่อน cut-over ควรเทียบ `PosProduct.basePriceSatang` ที่เก็บจริงของแถวที่มีแล้ว (เสนอเป็นงาน P1.1b/P6.1 — ไม่ทำในใบนี้เพราะเปลี่ยนความหมายของตัวนับเดิม)
5. `checkCatalogWrite` (export) ตรวจเพิ่ม: where = POS เปิดใช้งานของร้าน (ไม่ใช่ = NOT_FOUND) · รูปของ row/action ผิด = NOT_FOUND/PERMISSION_DENIED (ไม่ throw) · ทางภายใน `requireRowWrite` **ไม่** ตรวจสาขาซ้ำ (ผู้เรียกภายในตรวจด้วย `assertUnit` แล้ว) ⇒ แถวของสาขาที่ถูกเก็บถาวรภายหลังยังแก้ราคา/เก็บถาวรได้ตามเดิม (ถ้าใช้ตัว export ภายในด้วยจะกลายเป็น NOT_FOUND — เปลี่ยนพฤติกรรม)
6. rollback ขั้น 1 บน prod ต้องส่งทีละคำสั่ง — `prisma db execute` รวมทั้งไฟล์เป็น transaction เดียว (วัดแล้ว: txid เดียวกัน) · ไฟล์ rollback อยู่ใน `.qc-shots` (ไม่ commit — เนื้อหาเต็มอยู่ใน notes นี้ เหมือน round 3)
7. lock helper ของ probe จบด้วย `UnsupportedNativeDataType` (pg_sleep คืน void) หลังถือล็อกครบ — ไม่กระทบผล (deploy ล้มด้วย lock timeout ระหว่างที่ถือ · process จบ = tx rollback = ปล่อยล็อก)

### Acceptance (round 4)
- oracle `qc-pos-p1.1`: exit 0 · `===== qc-pos-p1.1 ===== ผ่าน 99/99` · `JSON_SUMMARY {"suite":"qc-pos-p1.1","total":99,"passed":99,"failed":[],…,"catalogue":127,"skippedGroups":{"S2":"P1.1b ยังไม่เริ่ม … ข้าม 28 ข้อ"}}` · ROWCOUNTS เท่าเดิม (log `r4b/oracle-1.log`)
- regression 17 ชุด (logs `r4b/after/`): qc-pos-register 42/42 · qc-pos-account 16/16 · qc-pos-products 24/24 · qc-pos-coupon 8/8 · qc-pos-closeday 22/22 · qc-pos-inventory 25/25 · qc-pos-p0.2 55/55 SKIP 1 (P0.2-S6.7) · qc-restaurant-money 6/6 · qc-restaurant-void 11/11 · qc-shop-refund 12/12 · qc-account-cpa 107/107 · qc-restaurant 🎉 · qc-restaurant-pay 19/19 · qc-shop 15/15 · qc-inventory 12/12 · qc-inventory-item 11/11 · qc-inventory-account 23/23 — ทุกตัว exit 0 · **17 SAME** กับ round 3 (เทียบบรรทัดสรุป)
- fitness: มี env / ไม่มี env exit 0 `{"total":39,"passed":39,"findings":[]}` · F15.1 "หนี้เดิม 9 ไฟล์ 36 จุด" เท่าเดิม · F15.5 ✅ + หลักฐานลบ
- typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` → exit 0 · 0 error (รอบเดียว)
- หมายเหตุ: ระหว่างรัน มีเลน HF ของ POS (`shark-hf5`) ใช้ QC4 ผ่าน gate lock เดียวกัน — ไม่มีชุดไหนซ้อนกัน · fingerprint ร้านอื่นไม่เปลี่ยน
