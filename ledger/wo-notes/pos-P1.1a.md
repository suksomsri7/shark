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
| R3-4 | backfill ร้าน QC (dry/real/again/overlap) | ⏳ |
