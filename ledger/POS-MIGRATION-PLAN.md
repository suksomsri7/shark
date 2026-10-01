# POS ใหม่ — แผน migration (แคตตาล็อกเดียว + ตารางใหม่) · ทำเป็นขั้น ไม่ลบของเก่า

> 1 ต.ค. 2569 · แบบอย่างเดียว · บทเรียนที่บังคับใช้: `reference_shark_migrate_deploy` (เคยทำแชท prod ดับ 2.5 ชม. · เพิ่มคอลัมน์พังทั้งตาราง) · `reference_git_apply_3way_drops_lines` · migration apply อัตโนมัติตอน Vercel build (`vercel-build.sh`) ⇒ **ทุก migration ต้อง additive + backward-compatible กับโค้ดที่ยัง deploy อยู่**
> สถานะข้อมูลจริง: prod มี 1 demo tenant · ไม่มีร้านจริง (RESUME) ⇒ backfill เบา แต่ต้องเขียนให้รันซ้ำได้อยู่ดี

## 0. ของที่มีอยู่และจะไปไหน
| วันนี้ | ปลายทาง | วิธี |
|---|---|---|
| `InvItem` (คลัง · ต้นทุน · onHand · barcode · kind SERVICE) | **คงเป็นต้นฉบับ "ของ"** | ไม่แตะ |
| `AccountProduct.salePrice` (ราคาขายปัจจุบันของ POS) | ย้ายไป `PosProduct.basePriceSatang` · AccountProduct ซิงก์ตาม (เดิมมี sync 2 ทางอยู่แล้ว) | ขั้น 1 backfill |
| `MenuItem` + `MenuCategory` + `MenuOptionGroup/Choice` + `KdsStation` + `stockQty/dailyStockQty/isOutOfStock` | `PosProduct` (kind=MENU) + `PosCategory` + **ใช้ `MenuOptionGroup/Choice` ต่อ (เปลี่ยน FK จาก MenuItem → PosProduct)** + `PosProduct.stationId/dailyStockQty/availability` | ขั้น 1–3 dual-read |
| `ShopProduct` (เว็บร้าน) | `PosProduct` + `PosProductChannelPrice(channel=WEB)` + `PosProduct.channels[]` | ขั้น 1–3 |
| `PosSaleLine.itemId/serviceId` | + `productId` (PosProduct) — itemId คงไว้ (ตัดสต็อก) | additive |
| `RestaurantOrderItem.menuItemId` | + `productId` · dual-write ช่วงเปลี่ยน | additive |
| `ShopOrderLine.productId (ShopProduct)` | + `posProductId` | additive |

## 1. ตารางใหม่ (ทั้งหมด additive)
`PosProduct` · `PosCategory` · `PosVariant` (หรือ PosProduct ลูก `parentId`) · `RecipeLine` · `SalesChannel` · `PosProductChannelPrice` · `ExternalOrder` · `ExternalOrderEvent` · `PosShift` · `PosDevice` · `PosHeldCart` · `PosPaymentIntent` · `PosReceiptToken` · `PosStockCount/Line` · `PosStaffPin` · `PosSale` +คอลัมน์ (`channelId` `commissionSatang` `docType` `refSaleId` `shiftId` `deviceId` `staffUserId` `vatMode/vatRateBp` `tipSatang` `serviceChargeSatang` `offlineRef` `syncedAt` `approvalRequestId`)
- `PosSale` คอลัมน์ใหม่ทุกตัว **nullable หรือมี default** · index เพิ่มทีละตัว ด้วย `CREATE INDEX CONCURRENTLY` (ต้องแยก migration ไม่อยู่ใน tx — Prisma: ใส่ `-- @concurrent` ตามแนวที่บัญชี V2 ใช้ `perf_indexes`)
- `@@unique([unitId, receiptNo])` คงเดิม · `@@unique([tenantId, idempotencyKey])` คงเดิม

## 2. ขั้นตอน (ทำทีละ WO · deploy ได้ทุกขั้น · ย้อนกลับได้)
### ขั้น 1 — สร้าง + backfill (WO P1.1a)
1. migration สร้างตารางใหม่ + คอลัมน์ใหม่ (ไม่มี NOT NULL ที่ไม่มี default)
2. สคริปต์ `scripts/pos-backfill-catalog.mts` (idempotent · รันซ้ำได้ · มี `--dry-run` + รายงานจำนวน): 
   - ทุก `InvItem` ที่ยังไม่มี PosProduct → สร้าง PosProduct (price = AccountProduct.salePrice ถ้ามี ไม่งั้น null = "ยังไม่ตั้งราคา")
   - ทุก `MenuItem` → PosProduct(kind=MENU, invItemId = สร้าง InvItem ใหม่ kind=MENU ถ้าไม่มี) + ย้าย category/station/stock fields + ตั้ง `MenuItem.posProductId`
   - ทุก `ShopProduct` → จับคู่ด้วย `invItemId` ถ้ามี ไม่งั้นสร้าง PosProduct ใหม่ + channel price WEB + ตั้ง `ShopProduct.posProductId`
   - `MenuOptionGroup` ผูก PosProduct ผ่านตาราง link ใหม่ `PosProductOptionGroup` (ของเดิม `MenuItemOptionGroup` คงไว้)
3. ด่าน: oracle `qc-pos-catalog-backfill.mts` — นับ 1:1 ครบ · ราคาเท่าเดิมทุกตัว · รันซ้ำไม่เบิ้ล · rollback = ลบตารางใหม่ ของเก่าไม่กระทบ
### ขั้น 2 — dual-write / read ใหม่ (WO P1.1b)
- หน้าขาย POS ใหม่อ่าน `PosProduct` อย่างเดียว · ร้านอาหารและเว็บร้าน **ยังอ่านตารางเก่า** แต่ทุก write ไปตารางเก่าต้อง write PosProduct ด้วย (service layer ชั้นเดียว `catalog.ts` ที่ทุกโมดูลเรียก)
- ด่าน: แก้ราคาที่หน้าร้านอาหาร → หน้าขาย POS เห็นทันที (และกลับกัน)
### ขั้น 3 — สลับผู้อ่าน (WO P2.4 ร้านอาหาร · P2.8 เว็บร้าน)
- Restaurant `menu.ts` / storefront + Shop อ่านจาก PosProduct · ตารางเก่ากลายเป็น read-only (fitness rule ใหม่ **F15.1**: ห้าม import `menuItem`/`shopProduct` writer นอก catalog.ts)
- ด่าน: `qc-restaurant*.mts` `qc-shop*.mts` ทั้งชุดเดิมต้องเขียวโดยไม่แก้ expectation
### ขั้น 4 — เลิกใช้ (RUN ถัดไป ไม่อยู่ใน RUN นี้)
- ลบคอลัมน์/ตารางเก่า หลัง 30 วันที่ไม่มี write (ตรวจจาก audit)

## 3. migration อื่นที่ต้องระวัง
- **`PosReceiptCounter`** เปลี่ยนจาก `period YYYYMM` → `[unitId, docType, period]` (สเปก §4): สร้างตารางใหม่ `PosDocCounter` แล้วย้ายค่า `seq` ปัจจุบันเข้า docType=SALE · ของเก่าคงไว้จนกว่าโค้ดเก่าหาย (ห้าม rename)
- `PosPayType` enum เพิ่มค่า: Postgres `ALTER TYPE ... ADD VALUE` ไม่ transactional → แยกไฟล์ migration เดี่ยว ๆ (บทเรียนบัญชี V2)
- partial unique "1 กะ OPEN ต่อเครื่อง" ต้องเป็น SQL มือ (เหมือน `one_open_session_per_table`)
- `PosSale.channelId` default STORE: ใส่ default เป็น **คอลัมน์ nullable + backfill + ค่อย set NOT NULL** ใน migration ถัดไป (ห้าม ADD COLUMN NOT NULL DEFAULT บนตารางที่มีข้อมูล… prod เล็กก็ทำให้ติดนิสัย)

## 4. ลำดับ deploy และการตรวจ
1. migration ขั้น 1 ขึ้นก่อน (โค้ดเก่ายังทำงาน) → รัน backfill บน Neon branch ก่อน → prod
2. ทุก WO ที่มี migration: `pnpm typecheck` + `qc:all` บน Neon branch (CI T1 มี migrate+drift อยู่แล้ว) · เช็ก `.mts` ที่ import โมดูลใหม่ (`reference_shark_mts_scripts_typechecked_by_build`)
3. หลัง deploy: `scripts/verify-prod-pos.mts` (อ่านอย่างเดียว) — นับ PosProduct = InvItem+MenuItem+ShopProduct ที่ไม่ซ้ำ · หน้าขาย/ร้านอาหาร/เว็บ โหลดได้ · ไม่มี 500 ใน log 10 นาที
4. seed QC: `seed-pos-qc.mts` ต้องวาง **หลัง** `qc-member-m1.1` (seed สมาชิกล้าง CRM — `reference_shark_qc_member_seed_wipes_crm`) และใช้ร้าน QC แยกจาก CRM
