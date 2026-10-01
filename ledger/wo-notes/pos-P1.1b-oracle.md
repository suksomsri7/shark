# WO P1.1b — oracle writer (ขั้น 1 ของ "Order of work") · กลุ่ม S2 ของ `scripts/qc-pos-p1.1.mts`

> worktree `/root/projects/shark-pos-b` · branch `wip/pos-p1.1b` (ฐาน `a0f5e11e`) · 1 ต.ค. 2569 · QC4 เท่านั้น
> สัญญา: `ledger/pos-briefs/pos-brief-P1.1b.md` G1–G13 + Addendum · LANE-RULES · COMMON
> แตะไฟล์: `scripts/qc-pos-p1.1.mts` (ข้อสอบ) + ไฟล์นี้ เท่านั้น · ไม่มีไฟล์ช่วยแยก (helper อยู่ในข้อสอบ) · ไม่แตะโค้ดผลิตภัณฑ์/fitness/ชุดอื่น

## 0. สรุป
- ทะเบียน: **171 ข้อ = P1.1a 113 (ไม่แตะ expectation) + คืนสภาพ QC4 2 (R.1 · R.2 ใหม่ — รันทุกครั้ง) + P1.1b 56** (S2.1–S2.27 + X6.5 เดิม 28 ข้อ เขียนใหม่ตาม API สุดท้าย · ใหม่ 28 ข้อ: S2.10b · S2.11b · S2.19a · S2.28–S2.52) · PART-B 2 ข้อ (S2.11b · S2.19)
- guard S2: ผู้เขียนเดิม 10 ไฟล์ (+ `restaurant/order.ts` · `pos/register.ts`) import `pos/catalog` **หรือ `pos/catalog-legacy`** (เดิมจับแค่ `pos/catalog"` — `catalog-legacy` จะไม่ทำให้ S2 เริ่ม)
- guard PART-B: `src/lib/modules/account/service.ts` import แคตตาล็อก — ไม่ถึง = ข้าม S2.11b · S2.19 พร้อมพิมพ์เหตุ + `JSON_SUMMARY.skippedChecks`
- โครงใหม่ของ S2: static (ไม่แตะ DB) → **prelude** (แถว "ข้อมูลเดิม" สร้างตรง + `pos-backfill-catalog` หนึ่งรอบ ⇒ ข้อแก้/ทางย้อนมีลิงก์บนฐานแล้ว ไม่แดงตามข้อสร้าง) → section ต่อกลุ่ม (ทุกการเรียกประตูผ่าน `attempt` ⇒ ไม่มี throw หลุด = ไม่มีข้อแดงเพราะ crash) → G13 ผู้อ่าน → G3 แฝด (backfill รอบสอง) ปิดท้าย
- ตัวดัก SQL (G4c · G8): ห่อ `pg.Client.prototype.query` ของโมดูล `pg` ตัวเดียวกับที่ PrismaPg ใช้ (realpath เดียวกัน `.pnpm/pg@8.22.0`) — มีคู่บวก (เห็นคำสั่ง `"InvItem"` ของ findFirst) ก่อนใช้
- คืนสภาพ QC4: R.1 นับแถวทุกตารางที่มี `tenantId` ของร้าน QC ทั้งสอง (310 รายการ) + ตารางแคตตาล็อกของร้านอื่น · R.2 ลายนิ้วมือทุกคอลัมน์ (รวม updatedAt) ของแถวเดิม 24 ตาราง · แถวที่ค่าคืนครบแต่ `updatedAt` เด้ง (Membership ของแคชเชียร์ที่ข้อสอบสลับสิทธิ์แล้วคืน) คืน `updatedAt` ด้วย SQL ตรง + พิมพ์จำนวน · ตารางข้างเคียงที่ประตูสร้างเอง (`InvSettings` จาก nextSku ฯลฯ) ลบแถวใหม่ท้ายรัน (พบจาก R.1 รอบแรก)

## 1. ตารางข้อ (id · พิสูจน์อะไร · สถานะบนฐาน a0f5e11e)
แดง = แดงเพราะความสามารถยังไม่มี (เหตุในวงเล็บคือค่า actual ที่รันจริง) · ข้าม = guard · เขียว = ตัวกันถอย (ตั้งใจ)

| id | พิสูจน์ | บนฐาน (QC_FORCE) |
|---|---|---|
| S2.1 | menu.createItem → แถว MENU ใหม่ (ระบบ/สาขา/inv null/ราคา/หมวด/ตัวเลือก) + ลิงก์ | แดง: ไม่มีลิงก์ ไม่มีแถว (+0) |
| S2.2 | menu.updateItem ราคา/ชื่อ/ชื่อ EN → ตาม ไม่เพิ่มแถว | แดง: 7300 ชื่อเดิม nameEn null |
| S2.3 | setItemOptionGroups สลับลำดับ → PosProductOptionGroup ตาม | แดง: g1:0 |
| S2.4 | duplicateItem → แถวของตัวเอง ราคาต้นฉบับ | แดง: สำเนาไม่มีลิงก์ |
| S2.5 | archiveItem → แถวเมนูนั้นเก็บถาวร อื่นไม่กระทบ | แดง: mB ไม่เก็บ |
| S2.6 | setItemStock dailyStockQty → ตาม | แดง: null |
| S2.7 | shop.createProduct ไม่ผูกคลัง → แถวใหม่ POS แรก สาขาร้าน | แดง: ไม่มีลิงก์ |
| S2.8 | shop.createProduct ผูก InvItem ที่มีแถว → ชี้ตัวเดิม | แดง: ไม่มีลิงก์ |
| S2.9 | G5 เว็บล้วนตาม · แถวร่วมไม่ถูกทับ แต่ ShopProduct ของตัวเองเขียน | แดง: เว็บล้วน 4100 (ส่วนแถวร่วม/ช่องตัวเองเขียวอยู่แล้ว) |
| S2.10 | setItemSalePrice สินค้ายังไม่ผูกบัญชี → PosProduct ตาม | แดง: null |
| S2.10b | setItemSalePrice สินค้าผูกบัญชีแล้ว → AP + PosProduct ตาม | แดง: AP 3950 · PosProduct 3000 (ดูคำถาม 1) |
| S2.11 | account/product.updateProduct salePrice+VAT → ตาม | แดง: 4100/700 |
| S2.11b | PART-B updateAccountProductSalePrice → ตาม | **ข้าม** (account/service.ts ยังไม่ import) |
| S2.12 | inventory.createItem → แถวทันที PRODUCT null / SERVICE ราคา | แดง: ไม่มีทั้งคู่ |
| S2.13 | G4b setPrice PRODUCT+AP → AP.salePrice ช่องเดียว · InvItem ไม่แตะ · ไม่มี AP ใหม่ · หน้าขายเดิมเห็น | แดง: AP 4000 · reg 4000 |
| S2.14 | G4b setPrice/updateProduct เมนู → basePrice/name/nameEn ช่องเดียว → orderingMenu | แดง: 7500 · om 7500 |
| S2.15 | G4b setPrice/updateProduct เว็บล้วน → ShopProduct ราคา/ชื่อ ช่องเดียว → หน้าร้าน | แดง: 4200 ชื่อเดิม |
| S2.16 | G6 archive เมนู → MenuItem ARCHIVED + หายจาก orderingMenu | แดง: ACTIVE ยังอยู่ |
| S2.17 | G4c ซิงก์ครั้งแรก (คู่บวก) แล้วบันทึกซ้ำ 2 รอบ แถวไม่เพิ่ม | แดง: คู่บวกไม่ซิงก์ (แถวคงเขียวอยู่แล้ว) |
| S2.18 | เมนู→โค้ก แก้ราคา: MENU ตาม · PRODUCT คง · RecipeLine 1 | แดง: MENU 2500 |
| S2.19 | PART-B baseline ว่าง · ผู้เขียน = 2 ไฟล์ | **ข้าม** |
| S2.19a | G1 baseline = {account/service.ts: price 2} พอดี · ชุดผู้เขียน = catalog.ts + catalog-legacy.ts · ตัวสแกนตรง baseline | แดง: baseline 9 ไฟล์ · ชุดผู้เขียน = catalog.ts |
| S2.20 | inventory.updateItem ราคา SERVICE → ตาม | แดง: 8800 |
| S2.21 | linkProductToItem({createItem}) → แถวของ InvItem ใหม่ ราคา AP 2700 | แดง: ไม่มีแถว |
| S2.22 | G10 AI inventory_create_item → แถว 1 · proposals.ts ไม่ import แคตตาล็อก | แดง: prod 0 (ส่วน static เขียว) |
| S2.23 | G9 importServicesToCatalog → SERVICE 6600 | แดง: ไม่มีแถว |
| S2.24 | G9 setPrice บริการ → InvItem → roster + BookingService | แดง: inv 9000 · bs 9000 |
| S2.25 | [C7] posPrice ไม่ชนะ salePrice · salePrice ว่าง → posPrice | แดง: 4100 · 4100 |
| S2.26 | menu.createCategory → PosCategory (ระบบ/สาขา/EN) · archiveCategory → เก็บถาวร | แดง: 0 แถว |
| S2.27 | createOptionGroup + setItemOptionGroups + archive → listForUnit เห็น/หาย | แดง: ไม่เห็น |
| X6.5 | G7 10 เลน (connection แยก) × 3 รอบ updateItem ↔ setPrice: ทุกเลนสำเร็จ · เท่ากันทุกรอบ · ไม่มี error deadlock · `pg_stat_database.deadlocks` +0 (อ่านหลังรอ 12 วิ — สถิติส่งช้า) | แดง: menu ≠ pos ทุกรอบ (deadlock +0 เขียว) |
| S2.28 | G3 แฝด 6 ชนิด backfill-แล้วแก้ ≡ แก้-แล้ว backfill (แถว + ตัวเลือก + สูตร ทุกช่อง · archivedAt เทียบเป็น bool · id/เวลาไม่นับ) | แดง: ต่าง 6/6 (ชื่อ/ราคา/daily/ตัวเลือก · ราคาเว็บ · unavailableUnitIds · ราคา/VAT · ราคาบริการ · archivedAt) |
| S2.29 | G3 static: ฟังก์ชันร่วม (backfillCatalog เรียกถึง ∩ catalog-legacy เรียก) ที่ไปถึง initialPrice (call graph ใน pos/catalog*.ts) | แดง: ไม่มี catalog-legacy.ts |
| S2.30 | G4a static กักเขต (ไฟล์ · allowlist + เหตุผล · ตัวบ่งชี้แค่ 2 ไฟล์ · ผู้เขียนเดิม 5 ไฟล์ import · facade ไม่ส่งต่อ) | แดง: ไม่มีไฟล์ · ไม่อยู่ใน allowlist · 0/5 import |
| S2.31 | G4a fitness F15.5 behavioural (root ชั่วคราวใน tmpdir · ลบใน finally): import catalog-legacy จาก src/app · src/lib/actions · "use server" (static/namespace/import()) ถูกจับครบ · restaurant/menu.ts ไม่ถูกจับ | แดง: จับได้ 0/3 |
| S2.32 | G4a static: ทุก export ของ catalog-legacy รับ tx (บังคับ · ไม่มีค่าปริยาย · ไม่รับ PrismaClient/CatalogClient) · ไม่ import prisma ตัวหลัก | แดง: ไม่มีไฟล์ |
| S2.33 | G4c static: pos/catalog*.ts ไม่ import ประตูเดิม | แดง: ไม่มี catalog-legacy.ts (ส่วน catalog.ts สะอาด) |
| S2.34 | G4c ดัก SQL: ประตูเดิม 4 ทาง = UPDATE ตารางเดิม 1 + PosProduct 1 · setPrice 4 ชนิด = PosProduct 1 + ตารางเดิมช่องเดียว 1 | แดง: ทุกกรณีอีกฝั่ง = 0 |
| S2.35 | G4b PRODUCT ไม่มี AP: setPrice → PosProduct เท่านั้น ไม่สร้าง AP InvItem ไม่ขยับ | **เขียว — ตัวกันถอย** (พฤติกรรมวันนี้ถูกอยู่แล้ว · X8.1) |
| S2.36 | G5 ตารางลำดับ: เว็บร้าน/InvItem.priceSatang ของ PRODUCT เขียนช่องตัวเองแต่ไม่ทับ · salePrice ย้ายราคา (คู่บวก) | แดง: salePrice ไม่ย้าย 4000 |
| S2.37 | G6 inventory.archiveItem → เก็บถาวร · unarchiveItem → restore | แดง: archive ไม่ตาม |
| S2.38 | G6 restore เมนูที่เก็บถาวรทั้งสองฝั่ง → MenuItem กลับ + orderingMenu | แดง: ARCHIVED ยังอยู่ |
| S2.39 | G6/N1 อีก connection ย้ายแถว A→ทุกสาขา ค้างล็อก · ผู้จัดการ A กด restore (connection แยก · ตรวจว่ารอล็อกจริงจาก pg_stat_activity) → หลังปล่อย PERMISSION_DENIED แถวยังเก็บ | แดง: restore รับ (ตรวจสิทธิ์บนแถวก่อนล็อก) |
| S2.40 | G7/G11 ล็อกร้านถูกถือ: createItem throw ข้อความ BUSY ไทย + rollback · linkProductToItem {ok:false, reason BUSY} + rollback · คู่บวก ensure BUSY | แดง: createItem/link สำเร็จไม่รอล็อก |
| S2.41 | G8 static: order.ts import catalog-legacy · ไม่มีจุดเขียนใน restaurant/order.ts + menu.ts | แดง: menu.ts×17 order.ts×3 |
| S2.42 | G8 ดัก SQL ทางร้อน: createOrder (ทางหมดพอดี) 13 · cancelOrderItem 6 = ฐาน · คงที่สองรอบ · ไม่แตะ PosProduct | **เขียว — ตัวกันถอย** (ค่าฐานวัดบน a0f5e11e) |
| S2.43 | G8 setItemStock(86/stockQty) + resetDailyStock ไม่เขียน PosProduct · availability เมนูใน listForUnit ตาม MenuItem (86 false · ปลด true) | แดง: availability ยัง true ตอน 86 (ส่วนไม่ mirror เขียว) — ดูคำถาม 3 |
| S2.44 | G11 static: try รอบการเรียก catalog-legacy/catalog มี catch ที่ throw/return | แดง: ไม่มี catalog-legacy · 0/8 import |
| S2.45 | G11 static: server action ที่เรียกประตูไร้ช่องปฏิเสธ (inventory create/update/archive · shop create/update · menu.archiveItem/setItemStock) อยู่ใน try ที่ catch คืนค่า/redirect | แดง: 10/10 จุดไม่มี |
| S2.46 | G12 F15.5 holdsMarker: ค่าปริยายพารามิเตอร์/แยกค่าเป็นออบเจกต์ที่ถือตัวบ่งชี้ถูกจับ (root ชั่วคราว) · คู่บวก `x = ตัวบ่งชี้` | แดง: บรรทัด 2/3 ไม่ถูกจับ (คู่บวกบรรทัด 4 ✓) |
| S2.47 | G12 createCategory ผ่าน ownFields (prototype unitId ไม่ลงสาขา · คีย์แปลก/null/[] VALIDATION) | แดง: ลงสีลม · คีย์แปลกรับ |
| S2.48 | G12 createProduct ล็อกหลังตรวจสิทธิ์: แคชเชียร์ไร้ manage = PERMISSION_DENIED < 2 วิ ขณะล็อกถูกถือ · คู่บวกเจ้าของ BUSY | แดง: แคชเชียร์ BUSY 3527 ms |
| S2.49 | G13 ซิงก์จริง (คู่บวก) · แถวเดิมที่ประตูเขียน = ค่าที่ส่ง คอลัมน์อื่นคง · ผู้อ่านเดิม 7 ตัวเห็นแถว seed เหมือนก่อนกลุ่ม | แดง: คู่บวกไม่ซิงก์ (ส่วนตรึง 4 ข้อย่อยเขียว) |
| S2.50 | แยกร้าน: 8 ประตูรับ id ร้านอื่น → ไม่มี PosProduct ใดเปลี่ยน/เพิ่ม (ยกเว้นแถวของเว็บร้านเองที่ไม่ผูก InvItem ร้านอื่น) · แถวเดิมคง · คู่บวกร้านตัวเองซิงก์ | แดง: คู่บวกไม่ซิงก์ (ส่วนแยกร้านเขียว) |
| S2.51 | แยกสาขา: shop สาขาอื่น · menu สาขาปลอม → ไม่เปลี่ยน · คู่บวกสาขาถูก | แดง: คู่บวกไม่ซิงก์ |
| S2.52 | G4b ย้อนทางใต้กติกาแคตตาล็อก: แคชเชียร์ไร้ setPrice DENIED ทั้งสองฝั่งคง · เจ้าของตั้งได้ ShopProduct ตาม | แดง: ShopProduct หลังเจ้าของ 4400 |
| R.1 | QC4 นับแถว (ร้าน QC ทุกตารางที่มี tenantId + แคตตาล็อกร้านอื่น) ก่อน = หลัง | เขียว (ทั้งสองโหมด) |
| R.2 | QC4 ลายนิ้วมือแถวเดิม 24 ตาราง ทุกคอลัมน์ ก่อน = หลัง | เขียว (คืน updatedAt Membership 1 แถว) |

ตัวกันถอยที่เขียวบนฐานโดยตั้งใจ: **S2.35 · S2.42** (2 ข้อ) · ข้ออื่นทุกข้อที่มี "ส่วนที่เขียวอยู่แล้ว" ผูกคู่บวกที่แดงไว้ในข้อเดียวกัน (S2.9 S2.17 S2.36 S2.43 S2.49 S2.50 S2.51 S2.52) ⇒ ข้อทั้งข้อแดงด้วยเหตุ "ยังไม่ซิงก์" ไม่ใช่เขียวลอย

## 2. ยอด + คำสั่ง (บรรทัดสรุปจริง)
| โหมด | เขียว | แดง | ข้าม |
|---|---|---|---|
| ปกติ | 115 (P1.1a 113 + R.1 R.2) | 0 | S2 ทั้งกลุ่ม 56 (guard) |
| QC_FORCE | 117 (P1.1a 113 + R.1 R.2 + ตัวกันถอย S2.35 S2.42) | 52 (S2 ทั้งหมด — ตาม §1) | 2 (PART-B S2.11b S2.19) |

แดงจัดตามมติ: G1 S2.19a · G2 ประตูเดิม→แคตตาล็อก S2.1–S2.8 S2.10 S2.10b S2.11 S2.12 S2.18 S2.20 S2.21 S2.25–S2.27 · G3 S2.28 S2.29 · G4a S2.30 S2.31 S2.32 · G4b S2.13 S2.14 S2.15 S2.52 · G4c S2.17 S2.33 S2.34 · G5 S2.9 S2.36 · G6 S2.5 S2.16 S2.37 S2.38 S2.39 · G7 X6.5 S2.40 · G8 S2.41 S2.43 · G9 S2.23 S2.24 · G10 S2.22 · G11 S2.44 S2.45 (+S2.40) · G12 S2.46 S2.47 S2.48 · G13 S2.49 · แยกร้าน/สาขา S2.50 S2.51

คำสั่ง (ทั้งหมดใน `/root/projects/shark-pos-b`):
- `pnpm exec tsx scripts/qc-pos-p1.1.mts --list` → `รวม 171 ข้อ · P1.1a 113 · คืนสภาพ QC4 2 · P1.1b 56 (PART-B 2: P1.1-S2.11b,P1.1-S2.19)`
- ปกติ `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.1.mts` → exit 0 · `===== qc-pos-p1.1 ===== ผ่าน 115/115` · `skippedGroups.S2 = "P1.1b ยังไม่เริ่ม (ผู้เขียนเดิม 10 ไฟล์ยังไม่ import pos/catalog หรือ pos/catalog-legacy) — ข้าม 56 ข้อ (PART-B 2 ข้อในนั้น)"` (tag qc-p1.1-1b9af7 · รันแรก qc-p1.1-0e0993 ก็ 115/115)
- QC_FORCE `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-pos-p1.1.mts` → exit 1 · `ผ่าน 117/169` · `skippedChecks {S2.11b, S2.19}` · ไม่มีบรรทัด "ส่วน … ล้ม" (ไม่มี crash) · P1.1a แดง 0 · `ℹ️ [R] นับ 310 รายการ · ลายนิ้วมือ 76 แถว · คืน updatedAt: Membership 1` (tag qc-p1.1-883caa รอบแรก: R.1 แดง `InvSettings 0→1` = nextSku ของประตูเดิมสร้างแถวตั้งค่าคลัง → เพิ่มการลบแถวใหม่ของตารางข้างเคียง · S2.24 roster ไม่พบบริการเพราะหน้าต่าง 200 → ตั้ง sortOrder · รอบสองตามตาราง)
- `bash scripts/iso.sh pnpm fitness` → exit 0 · `JSON_SUMMARY {"total":40,"passed":40,"findings":[]}`
- typecheck `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` → exit 0 · `> tsc --noEmit` ไม่มี error (รอบเดียว)

## 3. รายละเอียดที่ builder ต้องรู้
- fixture ของ S2 ทุกตัวขึ้นต้น `${TAG} s2-` · prelude สร้างตรงด้วย Prisma (ไม่ผ่านประตู = "ข้อมูลเดิม") แล้ว backfill ⇒ บนโค้ด builder ก็ใช้ได้เหมือนกัน
- S2.21/S2.22: `inventorySystemId()`/`resolveSystem()` เลือกคลังแบบ findFirst ไม่เรียง — ข้อสอบตัดสิน POS จากคลังจริงของ InvItem ใหม่ (`posOfInventory`) ไม่ผูกคลัง seed
- S2.24: บริการ fixture ตั้ง `sortOrder -1000000` ให้ขึ้นหัว `listServices` (take 200) — 520 แถว bulk ของ S1.37 ไม่ดันหลุด roster
- S2.42 ค่าฐาน: createOrder ทาง "ตัวแรกหักจนเหลือ 0 (86) + ตัวที่สองหมดพอดี → OUT_OF_STOCK → ROLLBACK" ครอบคำสั่ง `:168` `:177` ครบโดยไม่ทิ้งของ (ไม่วัดทางสำเร็จ — ตัวนับเลขออเดอร์รายวันจะค้าง) · cancelOrderItem ครอบ `:280` ด้วยออเดอร์ fixture ที่ลบใน finally ของ section
- S2.39 ใช้ `lane(8)` ถือล็อกแถว (UPDATE ค้างใน tx) · restore บน `lane(9)` · รอจนเห็น backend รอ Lock ใน `pg_stat_activity` (สูงสุด 20 วิ) แล้วจึงปล่อย — ตัดสินจากผล ไม่ใช่เวลา
- S2.40/S2.48 ถือ `pg_advisory_xact_lock(hashtext('pos-catalog:'||tenant))` (คีย์เดียวกับ S3.55) 12/9 วิ บน `lane(7)` · ข้อความ BUSY ที่คาด = ข้อความที่ `ensureForInvItem` คืนจริงในช่วงเดียวกัน (ไม่ฮาร์ดโค้ด)
- S2.31/S2.46 สร้าง root ชั่วคราวใน `os.tmpdir()` (`qc-p11b-fit-*`) ลบด้วย `rmSync` เฉพาะโฟลเดอร์นั้นใน finally · อ่านทั้ง `scanSystemMarker(root)` และรายละเอียด F15.5 ของ `runPosFitness(…, root)`

## 4. คำถามถึงผู้คุมงาน (เลือกการอ่านที่เข้มกว่าไว้แล้ว — แก้ด้วย ORACLE-EDIT ได้จุดเดียวต่อข้อ)
1. **S2.10b** `setItemSalePrice` ของสินค้าที่ผูกบัญชีแล้วเขียนผ่าน `account.updateAccountProductSalePrice` (ไฟล์ Part B) — ข้อสอบถือเป็น Part A (register.ts แก้ได้ "ภายใน setItemSalePrice" ⇒ ส่งราคาผ่าน catalog-legacy แทนได้) · ถ้าผู้คุมงานตัดสินเป็น Part B: ย้าย id เข้า `PART_B` (บรรทัดเดียว) · **แนะนำ: Part A** (หน้า "สินค้า/ราคา" เดิมเป็นผู้เขียนราคาหลักของหน้าขาย)
2. **S2.19a baseline พอดี** — วันนี้ F15.1 นับ `platform/pdpa.ts {dynamic:1}` · `booking/service.ts {BookingService.price:3}` · `account/inventory-link.ts {AccountProduct.price:2, InvItem.price:2}` (fail-closed) ซึ่ง G1 ไม่ได้กล่าวถึง · ข้อสอบบังคับตามตัวอักษร G1 ⇒ builder ต้องตัด BookingService ออกจาก PRICE_MODELS (G9: ไม่ใช่ตารางแคตตาล็อก) และยกเว้น pdpa (ลบทั้งร้าน) ด้วยรายการที่มีเหตุผล · **แนะนำ: รับรองทั้งสองทางนี้ในมติ** ไม่งั้น S2.19a เป็นไปไม่ได้
3. **S2.43 availability ของเมนูใน listForUnit** — วันนี้อ่าน `PosProduct.isOutOfStock` (สำเนาตอน backfill ไม่เคยอัปเดต) · G8 บอก live ไม่ mirror และ "แคตตาล็อกอ่านจาก MenuItem" แต่ addendum บอกไม่เปลี่ยน semantics ของ listForUnit · ข้อสอบเลือก: 86 ของเมนูต้องเห็นใน listForUnit (ไม่งั้นหน้าขายใหม่ขายเมนูที่ครัว 86 แล้ว) · ตรวจเฉพาะ `isOutOfStock` (ไม่บังคับ `stockQty<=0`) · **แนะนำ: รับรอง** (เงื่อนไข availability เพิ่มเฉพาะแถว MENU)
4. **G6 ย้อนทางของแถว InvItem / เว็บร้าน** — `catalog.archive` แถวผูก InvItem ควรเก็บ InvItem ด้วยไหม (เก็บที่หน้าขายโดยของยังอยู่ในคลัง — R5 F1 ตั้งใจให้ทำได้) · เว็บร้านไม่มี archivedAt (มีแค่ `active`) ⇒ ข้อสอบตรวจย้อนทาง archive/restore เฉพาะเมนู (S2.16 · S2.38) และขาเดิม→แคตตาล็อกของ InvItem (S2.37) · **แนะนำ: แถว InvItem = แคตตาล็อกอย่างเดียว · เว็บร้าน = `active`** แล้วเพิ่มข้อสอบรอบ reviewer
5. **เว็บร้าน `active=false`** — backfill (P1.1a ข้อ 4) = `unavailableUnitIds=[สาขา]` ไม่ใช่เก็บถาวร แต่ G6 นับ ShopProduct ใน "un-archive → restore" · ข้อสอบไม่ตัดสินรูปแบบ — S2.28 (แฝด `off`) บังคับแค่ "ซิงก์ = backfill" (G3 ตัวแปลงเดียวชนะ) · **แนะนำ: คงกติกา backfill**
6. MenuItem ไม่มีประตู "ปลดเก็บถาวร" ในโค้ดวันนี้ (`updateItem` รับ `status` แต่ไม่ล้าง `archivedAt`) — ไม่มีข้อสอบขาเดิม→แคตตาล็อกของ un-archive เมนู · หมวด/กลุ่มตัวเลือกก็ไม่มีประตู un-archive
7. **S2.45 รูปแบบ static** — บังคับ try/catch ในตัว action เองที่ catch มี `return <ค่า>` หรือ `redirect(` · ถ้า builder ใช้ตัวห่อกลาง (เช่น `asResult(() => createItem(…))`) ต้อง ORACLE-EDIT ให้รู้จักตัวห่อ (ชื่อเดียว) · ไม่รวมประตูที่คืน `{ok:false}` ได้อยู่แล้ว (menu.createItem/duplicateItem · account/product · inventory-link · setItemSalePrice)
8. **S2.32 "ทุก export รับ tx"** — ฟังก์ชันบริสุทธิ์ที่ export จาก catalog-legacy (เช่นตัวแปลง G3) จะแดง · **แนะนำ: ตัวแปลงอยู่ catalog.ts** (บ้านของ backfill · ไม่มีวง import)
9. **S2.34 "ฝั่งละ 1 คำสั่ง"** วัดเฉพาะการแก้ราคาอย่างเดียว · ถ้า builder เขียน PosProduct สองคำสั่ง (ราคา + ชื่อ) ในการแก้ราคาอย่างเดียวจะแดง — ตั้งใจ (G4c "writes both sides once")
10. **S2.42 ค่าฐานฮาร์ดโค้ด** (13 · 6) วัดบน a0f5e11e — ถ้าใบอื่นเปลี่ยน `getSetting`/`resolveLines` จำนวนจะเปลี่ยนโดยชอบ ⇒ ต้องวัดใหม่ (บรรทัด `ℹ️ [S2.42]` พิมพ์รายการคำสั่งทุกครั้ง)
11. SERVICE ที่มี AP salePrice > 0 (ลำดับ C7 ให้ salePrice ชนะ แต่ G4b บอกย้อนทางบริการ → `InvItem.priceSatang`) — ขัดกันในตัว: ตั้งราคาแล้วเขียน InvItem แต่ราคาที่ derive ยังมาจาก AP · ข้อสอบทดสอบเฉพาะบริการไม่มี AP · **ต้องมีมติ** (แนะนำ: บริการ → เขียนช่องที่ชนะตามลำดับ)
12. `catalog.updateProduct` ชื่อของแถวผูก InvItem → `InvItem.name`? (`AccountProduct.name` ตามด้วย sync เดิม) — ไม่ทดสอบ (กำกวม) · ทดสอบแค่เมนู + เว็บล้วน
13. `account/product.archiveProduct` (AP เก็บถาวร ⇒ C7 ไม่นับ AP ⇒ ราคาที่ derive เปลี่ยน) — ไม่อยู่ในรายการประตูของ G2 · ไม่มีข้อสอบ · ถามว่าเป็นประตูไหม
14. R.1/R.2 รันในโหมดปกติด้วย ⇒ ยอดโหมดปกติ = 115/115 (113 + 2) ไม่ใช่ 113/113
