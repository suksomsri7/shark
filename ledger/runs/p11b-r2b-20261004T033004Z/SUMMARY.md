# suites run p11b-r2b — 20261004T033004Z

| # | step | exit | seconds | summary |
|---|---|---|---|---|
- tree `/root/projects/shark-pos-b` · branch `wip/pos-p1.1b` · head `6668635c`
| 1 | typecheck | 0 | 14 |  |
| 2 | fitness-env | 0 | 9 |  |
| 3 | fitness-noenv | 0 | 11 |  |
| 4 | fitness-pos | 0 | 5 |  |
| 5 | qc-pos-p1.1-forced | 0 | 140 | "total":175,"passed":175,"failed":[] |
| 6 | qc-pos-p1.1-forced | 0 | 137 | "total":175,"passed":175,"failed":[] |
| 7 | qc-pos-p1.1 | 0 | 137 | "total":175,"passed":175,"failed":[] |
| 8 | qc-pos-p1.3-forced | 1 | 104 | "total":128,"passed":127,"failed":["P1.3-S6.1"] |
| 9 | qc-pos-p1.3 | 0 | 93 | "total":127,"passed":127,"failed":[] |
| 10 | qc-pos-products | 0 | 5 |  |
| 11 | qc-pos-p0.2 | 0 | 4 |  |
| 12 | qc-pos-register | 0 | 9 |  |
| 13 | qc-pos-inventory | 0 | 5 |  |
| 14 | qc-pos-account | 0 | 6 |  |
| 15 | qc-pos-closeday | 0 | 4 |  |
| 16 | qc-pos-coupon | 0 | 3 |  |
| 17 | qc-hf-inventory-atomic | 0 | 235 |  |
| 18 | qc-hf-pos-page-authz | 0 | 4 |  |
| 19 | qc-restaurant | 0 | 4 |  |
| 20 | qc-restaurant-money | 0 | 4 |  |
| 21 | qc-restaurant-pay | 0 | 5 |  |
| 22 | qc-restaurant-void | 0 | 7 |  |
| 23 | qc-shop | 0 | 5 |  |
| 24 | qc-shop-refund | 0 | 5 |  |
| 25 | qc-inventory | 0 | 3 |  |
| 26 | qc-inventory-item | 0 | 3 |  |
| 27 | qc-inventory-account | 0 | 5 |  |
| 28 | qc-booking-deposit | 0 | 6 |  |
| 29 | qc-booking-race | 0 | 3 |  |
| 30 | qc-account-cpa | 0 | 12 |  |
| 31 | qc-hotel-money | 0 | 6 |  |
| 32 | qc-ticket-money | 0 | 5 |  |
| 33 | qc-subscription-money | 0 | 5 |  |
| 34 | qc-ai-proposals | 0 | 4 |  |
| 35 | qc-ai-tools | 0 | 5 |  |

### 01-typecheck.log (last 15 lines)
```

> shark-in-th@0.1.0 typecheck /root/projects/shark-pos-b
> tsc --noEmit

```

### 02-fitness-env.log (last 15 lines)
```
── F15: POS (แคตตาล็อก/ราคาผู้เขียนเดียว · สัญญา createSale · ทะเบียนปุ่ม POS · ข้อความ pos.* สองภาษา) ──
  ✅ [F15.1] แคตตาล็อก/ราคามีผู้เขียนที่เดียว (catalog.ts ∪ baseline ต่อจุดเขียน · หนี้เดิม 1 ไฟล์ 2 จุด)
  ✅ [F15.2] สัญญา createSale/voidSale/refundSale ใน src/lib/modules/pos/service.ts เข้ากันได้ย้อนหลังกับ scripts/pos-sale-contract.json (ขาเข้า/ขาออก · ทุก overload)
  ✅ [F15.3a] ปุ่ม POS ที่มี data-testid มีแถวใน scripts/pos-ui-inventory.json ครบ + ไม่มีปุ่มใหม่ที่ไร้ testid (สแกน 45 ไฟล์ · หนี้ไร้ testid 46)
  ✅ [F15.3b] ทุกแถวใน scripts/pos-ui-inventory.json ชี้ testid ที่มีจริง · ไม่ซ้ำ · ฟิลด์ถูกต้อง · baselineDebt ไม่เหลือหนี้ที่ปิดแล้ว (79 แถว)
  ✅ [F15.4] ข้อความ pos.* มีครบทั้ง th/en · ไม่ว่าง · ค่าภาษาไทยมีอักษรไทย (ยกเว้นคำสากลใน UNIVERSAL_TOKENS)
  ✅ [F15.5] ตัวบ่งชี้ผู้เรียกระดับระบบของแคตตาล็อก + backfill ไม่หลุดถึงโค้ดที่รับคำขอ (catalog.ts · สคริปต์ backfill · qc-* · allowlist เท่านั้น) · R4: ห้าม ?? / || / ?: / alias ของตัวบ่งชี้
  ✅ [F15.7] ประตูเดิมของคลัง/บัญชีแตะ POS ได้เฉพาะ pos/catalog-legacy · pos (CatalogError) · pos/catalog (F2.1 เปิดเส้น inventory→pos / account→pos ให้แค่นี้)
  ✅ [F15.6] src/** ห้าม import จาก scripts/** (static · import() · require · import = require · typeof import()) · baseline 0 จุด

===== FITNESS =====
ผ่าน 41/41
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":41,"passed":41,"findings":[]}
```

### 03-fitness-noenv.log (last 15 lines)
```
── F15: POS (แคตตาล็อก/ราคาผู้เขียนเดียว · สัญญา createSale · ทะเบียนปุ่ม POS · ข้อความ pos.* สองภาษา) ──
  ✅ [F15.1] แคตตาล็อก/ราคามีผู้เขียนที่เดียว (catalog.ts ∪ baseline ต่อจุดเขียน · หนี้เดิม 1 ไฟล์ 2 จุด)
  ✅ [F15.2] สัญญา createSale/voidSale/refundSale ใน src/lib/modules/pos/service.ts เข้ากันได้ย้อนหลังกับ scripts/pos-sale-contract.json (ขาเข้า/ขาออก · ทุก overload)
  ✅ [F15.3a] ปุ่ม POS ที่มี data-testid มีแถวใน scripts/pos-ui-inventory.json ครบ + ไม่มีปุ่มใหม่ที่ไร้ testid (สแกน 45 ไฟล์ · หนี้ไร้ testid 46)
  ✅ [F15.3b] ทุกแถวใน scripts/pos-ui-inventory.json ชี้ testid ที่มีจริง · ไม่ซ้ำ · ฟิลด์ถูกต้อง · baselineDebt ไม่เหลือหนี้ที่ปิดแล้ว (79 แถว)
  ✅ [F15.4] ข้อความ pos.* มีครบทั้ง th/en · ไม่ว่าง · ค่าภาษาไทยมีอักษรไทย (ยกเว้นคำสากลใน UNIVERSAL_TOKENS)
  ✅ [F15.5] ตัวบ่งชี้ผู้เรียกระดับระบบของแคตตาล็อก + backfill ไม่หลุดถึงโค้ดที่รับคำขอ (catalog.ts · สคริปต์ backfill · qc-* · allowlist เท่านั้น) · R4: ห้าม ?? / || / ?: / alias ของตัวบ่งชี้
  ✅ [F15.7] ประตูเดิมของคลัง/บัญชีแตะ POS ได้เฉพาะ pos/catalog-legacy · pos (CatalogError) · pos/catalog (F2.1 เปิดเส้น inventory→pos / account→pos ให้แค่นี้)
  ✅ [F15.6] src/** ห้าม import จาก scripts/** (static · import() · require · import = require · typeof import()) · baseline 0 จุด

===== FITNESS =====
ผ่าน 41/41
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":41,"passed":41,"findings":[]}
```

### 04-fitness-pos.log (last 15 lines)
```

── F15: POS (แคตตาล็อก/ราคาผู้เขียนเดียว · สัญญา createSale · ทะเบียนปุ่ม POS · ข้อความ pos.* สองภาษา) ──
  ✅ [F15.1] แคตตาล็อก/ราคามีผู้เขียนที่เดียว (catalog.ts ∪ baseline ต่อจุดเขียน · หนี้เดิม 1 ไฟล์ 2 จุด) — ตรง (3 ไฟล์ 41 จุด)
  ✅ [F15.2] สัญญา createSale/voidSale/refundSale ใน src/lib/modules/pos/service.ts เข้ากันได้ย้อนหลังกับ scripts/pos-sale-contract.json (ขาเข้า/ขาออก · ทุก overload) — ตรง (createSale/voidSale · 34 ฟิลด์ · ผู้เรียก createSale 15 ไฟล์) · ของใหม่ที่เข้ากันได้ 1: CreateSaleInput.lines[].productId? → รัน --update-pos-contract · ผู้เรียก createSale เปลี่ยน (+1 src/lib/modules/pos/register.ts · −0 ) — อัปเดต snapshot ด้วย --update-pos-contract
  ✅ [F15.3a] ปุ่ม POS ที่มี data-testid มีแถวใน scripts/pos-ui-inventory.json ครบ + ไม่มีปุ่มใหม่ที่ไร้ testid (สแกน 45 ไฟล์ · หนี้ไร้ testid 46) — ครบ (testid กดได้ 80 · แถว 79 · ของทะเบียนอื่น 2)
  ✅ [F15.3b] ทุกแถวใน scripts/pos-ui-inventory.json ชี้ testid ที่มีจริง · ไม่ซ้ำ · ฟิลด์ถูกต้อง · baselineDebt ไม่เหลือหนี้ที่ปิดแล้ว (79 แถว) — ตรง
  ✅ [F15.4] ข้อความ pos.* มีครบทั้ง th/en · ไม่ว่าง · ค่าภาษาไทยมีอักษรไทย (ยกเว้นคำสากลใน UNIVERSAL_TOKENS) — ครบ 168 คีย์ (th/pos.json, en/pos.json)
  ✅ [F15.5] ตัวบ่งชี้ผู้เรียกระดับระบบของแคตตาล็อก + backfill ไม่หลุดถึงโค้ดที่รับคำขอ (catalog.ts · สคริปต์ backfill · qc-* · allowlist เท่านั้น) · R4: ห้าม ?? / || / ?: / alias ของตัวบ่งชี้ — สะอาด
  ✅ [F15.7] ประตูเดิมของคลัง/บัญชีแตะ POS ได้เฉพาะ pos/catalog-legacy · pos (CatalogError) · pos/catalog (F2.1 เปิดเส้น inventory→pos / account→pos ให้แค่นี้) — สะอาด
  ✅ [F15.6] src/** ห้าม import จาก scripts/** (static · import() · require · import = require · typeof import()) · baseline 0 จุด — สะอาด (0 จุดตาม baseline)

JSON_SUMMARY {"suite":"fitness-pos","total":8,"passed":8,"findings":[]}
```

### 05-qc-pos-p1.1-forced.log (last 15 lines)
```
  ✅ [P1.1-S2.R2.1] R2 F2 ย้อนทางลงขั้นที่ชนะ: แถวเว็บร้านเอง (C9b) ผูกบริการ InvItem.priceSatang>0 → setPrice เขียน InvItem.priceSatang (ไม่ใช่ ShopProduct.priceSatang) · แก้เว็บร้านครั้งถัดไปราคาคง · --verify แถวนี้ไม่ drift {-}
  ✅ [P1.1-S2.R2.2] R2 F3 พี่น้อง: setPrice บนแถวเว็บร้านของบริการ → แถว InvItem ของบริการเดียวกันใน POS อีกระบบได้ราคาใหม่ในธุรกรรมเดียว {-}
  ✅ [P1.1-S2.R2.3] R2 F4 setPrice(0) ที่ช่องเดิมแสดงไม่ได้ (สินค้า + AP ราคา POS ชนะ) = VALIDATION ข้อความไทย · AP และ PosProduct ไม่เปลี่ยน · คู่บวก ราคา > 0 ไป AccountProduct.salePrice {X4}
  ✅ [P1.1-S2.R2.4] R2 F5 แถวเว็บร้านที่ ShopProduct สองแถวใช้ร่วม: แก้ ShopProduct แถวที่สองไม่เปลี่ยนราคา/ชื่อของแถวแคตตาล็อก (แถวแรกเป็นต้นทาง) · ShopProduct แถวที่สองยังถูกเขียน {-}
  ✅ [P1.1-S2.R2.5] R2 F6 menu.createItem 2 ครั้งพร้อมกัน หมวดใหม่ที่ยังไม่มี PosCategory: สำเร็จทั้งคู่ · PosCategory ชื่อนั้น 1 แถว · ทั้งสองแถว MENU ชี้หมวดเดียวกัน {X6}
  ✅ [P1.1-S2.R2.6] R2 F1 (static) ทุก redirect ?err= ใน inventory/actions · shop/actions · actions/booking · actions/restaurant ไปหน้าที่อ่าน err จาก searchParams แล้วแสดง (InvHub รับ err) {-}
  ✅ [P1.1-X9.1] event outbox ตระกูล pos.* ที่เกิดระหว่างรัน (ถ้ามี) มี consumer ลงทะเบียนครบ {X9}
  ✅ [P1.1-S1.36] rollback ปลายทาง: ลบแถวตารางใหม่ที่รันนี้สร้าง + คืนคอลัมน์เชื่อม + ลบ fixtures → ตารางเดิม (จำนวน + checksum) และตารางใหม่ เท่าก่อนรัน · ร้าน QC กลับสภาพเดิม {X5}
ROWCOUNTS_AFTER {"BusinessUnit":3,"AppSystemUnit":13,"InvItem":9,"InvItemImage":0,"InvLocationStock":3,"InvMovement":3,"AccountProduct":8,"MenuCategory":3,"MenuItem":4,"MenuOptionGroup":0,"MenuOptionChoice":0,"MenuItemOptionGroup":0,"KdsStation":2,"ShopProduct":0,"ShopOrder":0,"ShopOrderLine":0,"RestaurantOrderItem":0,"PosSale":6,"PosSaleLine":12,"PosPayment":6,"PosReceiptCounter":2,"BookingService":0,"Membership":4,"AppSystem":8,"AccountSettings":0,"PosProduct":13,"PosCategory":3,"PosProductOptionGroup":0,"RecipeLine":0,"OutboxEvent":6} · เท่าเดิม
  ✅ [P1.1-R.1] QC4 คืนสภาพ — นับแถว: ทุกตารางที่มี tenantId ของร้าน QC POS ทั้งสอง ก่อน = หลัง · ตารางแคตตาล็อกของร้านอื่น (PosProduct · PosCategory · MenuItem · ShopProduct · InvItem · AccountProduct · BookingService) ก่อน = หลัง {X5}
  ℹ️  [R] นับ 310 รายการ · ลายนิ้วมือ 78 แถว · คืน updatedAt: Membership 1
  ✅ [P1.1-R.2] QC4 คืนสภาพ — ลายนิ้วมือ: แถวที่มีอยู่ก่อนรันของร้าน QC POS (แคตตาล็อก · คลัง · บัญชีสินค้า · เมนู · เว็บร้าน · จอง · ระบบ/สาขา · สมาชิกทีม · ตั้งค่า) ทุกคอลัมน์รวม updatedAt ก่อน = หลัง (แถวที่ค่าคืนครบแต่ updatedAt เด้ง → คืน updatedAt ด้วย SQL ตรงก่อนตรวจ · พิมพ์จำนวน) {X5}

===== qc-pos-p1.1 ===== ผ่าน 175/175
JSON_SUMMARY {"suite":"qc-pos-p1.1","total":175,"passed":175,"failed":[],"skipped":null,"catalogue":177,"tag":"qc-p1.1-b7f8f8","skippedGroups":{},"skippedChecks":{"P1.1-S2.11b":"src/lib/modules/account/service.ts ยังไม่ import แคตตาล็อก (pos/catalog หรือ pos/catalog-legacy) — Part B ทำหลัง CRM merge (brief P1.1b \"Why A / B\")","P1.1-S2.19":"src/lib/modules/account/service.ts ยังไม่ import แคตตาล็อก (pos/catalog หรือ pos/catalog-legacy) — Part B ทำหลัง CRM merge (brief P1.1b \"Why A / B\")"},"force":true,"p11bStarted":true,"partBStarted":false}
```

### 06-qc-pos-p1.1-forced.log (last 15 lines)
```
  ✅ [P1.1-S2.R2.1] R2 F2 ย้อนทางลงขั้นที่ชนะ: แถวเว็บร้านเอง (C9b) ผูกบริการ InvItem.priceSatang>0 → setPrice เขียน InvItem.priceSatang (ไม่ใช่ ShopProduct.priceSatang) · แก้เว็บร้านครั้งถัดไปราคาคง · --verify แถวนี้ไม่ drift {-}
  ✅ [P1.1-S2.R2.2] R2 F3 พี่น้อง: setPrice บนแถวเว็บร้านของบริการ → แถว InvItem ของบริการเดียวกันใน POS อีกระบบได้ราคาใหม่ในธุรกรรมเดียว {-}
  ✅ [P1.1-S2.R2.3] R2 F4 setPrice(0) ที่ช่องเดิมแสดงไม่ได้ (สินค้า + AP ราคา POS ชนะ) = VALIDATION ข้อความไทย · AP และ PosProduct ไม่เปลี่ยน · คู่บวก ราคา > 0 ไป AccountProduct.salePrice {X4}
  ✅ [P1.1-S2.R2.4] R2 F5 แถวเว็บร้านที่ ShopProduct สองแถวใช้ร่วม: แก้ ShopProduct แถวที่สองไม่เปลี่ยนราคา/ชื่อของแถวแคตตาล็อก (แถวแรกเป็นต้นทาง) · ShopProduct แถวที่สองยังถูกเขียน {-}
  ✅ [P1.1-S2.R2.5] R2 F6 menu.createItem 2 ครั้งพร้อมกัน หมวดใหม่ที่ยังไม่มี PosCategory: สำเร็จทั้งคู่ · PosCategory ชื่อนั้น 1 แถว · ทั้งสองแถว MENU ชี้หมวดเดียวกัน {X6}
  ✅ [P1.1-S2.R2.6] R2 F1 (static) ทุก redirect ?err= ใน inventory/actions · shop/actions · actions/booking · actions/restaurant ไปหน้าที่อ่าน err จาก searchParams แล้วแสดง (InvHub รับ err) {-}
  ✅ [P1.1-X9.1] event outbox ตระกูล pos.* ที่เกิดระหว่างรัน (ถ้ามี) มี consumer ลงทะเบียนครบ {X9}
  ✅ [P1.1-S1.36] rollback ปลายทาง: ลบแถวตารางใหม่ที่รันนี้สร้าง + คืนคอลัมน์เชื่อม + ลบ fixtures → ตารางเดิม (จำนวน + checksum) และตารางใหม่ เท่าก่อนรัน · ร้าน QC กลับสภาพเดิม {X5}
ROWCOUNTS_AFTER {"BusinessUnit":3,"AppSystemUnit":13,"InvItem":9,"InvItemImage":0,"InvLocationStock":3,"InvMovement":3,"AccountProduct":8,"MenuCategory":3,"MenuItem":4,"MenuOptionGroup":0,"MenuOptionChoice":0,"MenuItemOptionGroup":0,"KdsStation":2,"ShopProduct":0,"ShopOrder":0,"ShopOrderLine":0,"RestaurantOrderItem":0,"PosSale":6,"PosSaleLine":12,"PosPayment":6,"PosReceiptCounter":2,"BookingService":0,"Membership":4,"AppSystem":8,"AccountSettings":0,"PosProduct":13,"PosCategory":3,"PosProductOptionGroup":0,"RecipeLine":0,"OutboxEvent":6} · เท่าเดิม
  ✅ [P1.1-R.1] QC4 คืนสภาพ — นับแถว: ทุกตารางที่มี tenantId ของร้าน QC POS ทั้งสอง ก่อน = หลัง · ตารางแคตตาล็อกของร้านอื่น (PosProduct · PosCategory · MenuItem · ShopProduct · InvItem · AccountProduct · BookingService) ก่อน = หลัง {X5}
  ℹ️  [R] นับ 310 รายการ · ลายนิ้วมือ 78 แถว · คืน updatedAt: Membership 1
  ✅ [P1.1-R.2] QC4 คืนสภาพ — ลายนิ้วมือ: แถวที่มีอยู่ก่อนรันของร้าน QC POS (แคตตาล็อก · คลัง · บัญชีสินค้า · เมนู · เว็บร้าน · จอง · ระบบ/สาขา · สมาชิกทีม · ตั้งค่า) ทุกคอลัมน์รวม updatedAt ก่อน = หลัง (แถวที่ค่าคืนครบแต่ updatedAt เด้ง → คืน updatedAt ด้วย SQL ตรงก่อนตรวจ · พิมพ์จำนวน) {X5}

===== qc-pos-p1.1 ===== ผ่าน 175/175
JSON_SUMMARY {"suite":"qc-pos-p1.1","total":175,"passed":175,"failed":[],"skipped":null,"catalogue":177,"tag":"qc-p1.1-19f0c6","skippedGroups":{},"skippedChecks":{"P1.1-S2.11b":"src/lib/modules/account/service.ts ยังไม่ import แคตตาล็อก (pos/catalog หรือ pos/catalog-legacy) — Part B ทำหลัง CRM merge (brief P1.1b \"Why A / B\")","P1.1-S2.19":"src/lib/modules/account/service.ts ยังไม่ import แคตตาล็อก (pos/catalog หรือ pos/catalog-legacy) — Part B ทำหลัง CRM merge (brief P1.1b \"Why A / B\")"},"force":true,"p11bStarted":true,"partBStarted":false}
```

### 07-qc-pos-p1.1.log (last 15 lines)
```
  ✅ [P1.1-S2.R2.1] R2 F2 ย้อนทางลงขั้นที่ชนะ: แถวเว็บร้านเอง (C9b) ผูกบริการ InvItem.priceSatang>0 → setPrice เขียน InvItem.priceSatang (ไม่ใช่ ShopProduct.priceSatang) · แก้เว็บร้านครั้งถัดไปราคาคง · --verify แถวนี้ไม่ drift {-}
  ✅ [P1.1-S2.R2.2] R2 F3 พี่น้อง: setPrice บนแถวเว็บร้านของบริการ → แถว InvItem ของบริการเดียวกันใน POS อีกระบบได้ราคาใหม่ในธุรกรรมเดียว {-}
  ✅ [P1.1-S2.R2.3] R2 F4 setPrice(0) ที่ช่องเดิมแสดงไม่ได้ (สินค้า + AP ราคา POS ชนะ) = VALIDATION ข้อความไทย · AP และ PosProduct ไม่เปลี่ยน · คู่บวก ราคา > 0 ไป AccountProduct.salePrice {X4}
  ✅ [P1.1-S2.R2.4] R2 F5 แถวเว็บร้านที่ ShopProduct สองแถวใช้ร่วม: แก้ ShopProduct แถวที่สองไม่เปลี่ยนราคา/ชื่อของแถวแคตตาล็อก (แถวแรกเป็นต้นทาง) · ShopProduct แถวที่สองยังถูกเขียน {-}
  ✅ [P1.1-S2.R2.5] R2 F6 menu.createItem 2 ครั้งพร้อมกัน หมวดใหม่ที่ยังไม่มี PosCategory: สำเร็จทั้งคู่ · PosCategory ชื่อนั้น 1 แถว · ทั้งสองแถว MENU ชี้หมวดเดียวกัน {X6}
  ✅ [P1.1-S2.R2.6] R2 F1 (static) ทุก redirect ?err= ใน inventory/actions · shop/actions · actions/booking · actions/restaurant ไปหน้าที่อ่าน err จาก searchParams แล้วแสดง (InvHub รับ err) {-}
  ✅ [P1.1-X9.1] event outbox ตระกูล pos.* ที่เกิดระหว่างรัน (ถ้ามี) มี consumer ลงทะเบียนครบ {X9}
  ✅ [P1.1-S1.36] rollback ปลายทาง: ลบแถวตารางใหม่ที่รันนี้สร้าง + คืนคอลัมน์เชื่อม + ลบ fixtures → ตารางเดิม (จำนวน + checksum) และตารางใหม่ เท่าก่อนรัน · ร้าน QC กลับสภาพเดิม {X5}
ROWCOUNTS_AFTER {"BusinessUnit":3,"AppSystemUnit":13,"InvItem":9,"InvItemImage":0,"InvLocationStock":3,"InvMovement":3,"AccountProduct":8,"MenuCategory":3,"MenuItem":4,"MenuOptionGroup":0,"MenuOptionChoice":0,"MenuItemOptionGroup":0,"KdsStation":2,"ShopProduct":0,"ShopOrder":0,"ShopOrderLine":0,"RestaurantOrderItem":0,"PosSale":6,"PosSaleLine":12,"PosPayment":6,"PosReceiptCounter":2,"BookingService":0,"Membership":4,"AppSystem":8,"AccountSettings":0,"PosProduct":13,"PosCategory":3,"PosProductOptionGroup":0,"RecipeLine":0,"OutboxEvent":6} · เท่าเดิม
  ✅ [P1.1-R.1] QC4 คืนสภาพ — นับแถว: ทุกตารางที่มี tenantId ของร้าน QC POS ทั้งสอง ก่อน = หลัง · ตารางแคตตาล็อกของร้านอื่น (PosProduct · PosCategory · MenuItem · ShopProduct · InvItem · AccountProduct · BookingService) ก่อน = หลัง {X5}
  ℹ️  [R] นับ 310 รายการ · ลายนิ้วมือ 78 แถว · คืน updatedAt: Membership 1
  ✅ [P1.1-R.2] QC4 คืนสภาพ — ลายนิ้วมือ: แถวที่มีอยู่ก่อนรันของร้าน QC POS (แคตตาล็อก · คลัง · บัญชีสินค้า · เมนู · เว็บร้าน · จอง · ระบบ/สาขา · สมาชิกทีม · ตั้งค่า) ทุกคอลัมน์รวม updatedAt ก่อน = หลัง (แถวที่ค่าคืนครบแต่ updatedAt เด้ง → คืน updatedAt ด้วย SQL ตรงก่อนตรวจ · พิมพ์จำนวน) {X5}

===== qc-pos-p1.1 ===== ผ่าน 175/175
JSON_SUMMARY {"suite":"qc-pos-p1.1","total":175,"passed":175,"failed":[],"skipped":null,"catalogue":177,"tag":"qc-p1.1-0b7b96","skippedGroups":{},"skippedChecks":{"P1.1-S2.11b":"src/lib/modules/account/service.ts ยังไม่ import แคตตาล็อก (pos/catalog หรือ pos/catalog-legacy) — Part B ทำหลัง CRM merge (brief P1.1b \"Why A / B\")","P1.1-S2.19":"src/lib/modules/account/service.ts ยังไม่ import แคตตาล็อก (pos/catalog หรือ pos/catalog-legacy) — Part B ทำหลัง CRM merge (brief P1.1b \"Why A / B\")"},"force":false,"p11bStarted":true,"partBStarted":false}
```

### 08-qc-pos-p1.3-forced.log (last 15 lines)
```

── S4 แถบสถานะ ──
  ✅ [P1.3-S4.1] registerStatus: unit.name · user.name · roleLabel เป็นภาษาคน (ไม่ใช่ OWNER/STAFF ดิบ) · pendingSyncCount = 0 (ออฟไลน์ P3)
  ✅ [P1.3-S4.2] ยังไม่มีกะ (PosShift ของ P1.9 ยังไม่มี/ไม่เปิด) → shift = null ไม่ throw
  ✅ [P1.3-S4.3] pendingStockCount ('รอตัดสต็อก'): บิลวันนี้ (ตัดวันเวลาไทย +07:00) ที่ตัดสต็อกครบ → 0 · บิลที่ยังไม่ตัด (createSale ใน tx ผู้อื่น) → นับ 1
  ✅ [P1.3-S4.4] registerStatus ข้ามร้าน (unit ร้านอาหาร) → NOT_FOUND · แคชเชียร์สาขาอื่น → NOT_FOUND · สาขาตัวเอง → ok (คู่บวก)
  ✅ [P1.3-S4.5] [Q23] registerStatus.user.role = รหัสบทบาท OWNER · MANAGER · STAFF ตาม actor (roleLabel ภาษาคนยังอยู่ · S4.1)
  ✅ [P1.3-S4.6] [Q25] registerVatConfig(ctx) = {mode, rateBp} เดียวกับ vatMode/vatRateBp ของ quote (สาขา sandbox และสาขาสีลม) · mode ∈ INCLUDED|NONE
  ✅ [P1.3-S4.7] [3.2 ข้อ 11] pendingStockCount: บิล PAID วันนี้ที่บรรทัดผูกสต็อกยังไม่มี movement pos-consume-<sale>-<line> → +1 · ตัดด้วยคีย์นั้นแล้ว → กลับเท่าเดิม
  ลบแล้ว: {"outbox":134,"audit":268,"journal":0,"point":0,"coupon":0,"payment":135,"line":335,"sale":133,"product":537,"productBySystem":0,"category":2,"menuGroup":2,"invJournal":86,"invItem":20,"customer":2,"user":2} · สาขา 3 · ระบบ 4
  ✅ [P1.3-S9.1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง · ตัวนับใบเสร็จสาขาจริงไม่ขยับ
  ✅ [P1.3-S9.2] QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · InvItem · AppSystem รวม settings · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter) ทุกคอลัมน์ ก่อน = หลัง

===== qc-pos-p1.3 ===== ผ่าน 127/128 (QC_FORCE)
JSON_SUMMARY {"suite":"qc-pos-p1.3","total":128,"passed":127,"failed":["P1.3-S6.1"],"skipped":false,"forced":true,"skippedChecks":{},"missing":[],"a5":{"drift":[]}}
```

### 09-qc-pos-p1.3.log (last 15 lines)
```

── S4 แถบสถานะ ──
  ✅ [P1.3-S4.1] registerStatus: unit.name · user.name · roleLabel เป็นภาษาคน (ไม่ใช่ OWNER/STAFF ดิบ) · pendingSyncCount = 0 (ออฟไลน์ P3)
  ✅ [P1.3-S4.2] ยังไม่มีกะ (PosShift ของ P1.9 ยังไม่มี/ไม่เปิด) → shift = null ไม่ throw
  ✅ [P1.3-S4.3] pendingStockCount ('รอตัดสต็อก'): บิลวันนี้ (ตัดวันเวลาไทย +07:00) ที่ตัดสต็อกครบ → 0 · บิลที่ยังไม่ตัด (createSale ใน tx ผู้อื่น) → นับ 1
  ✅ [P1.3-S4.4] registerStatus ข้ามร้าน (unit ร้านอาหาร) → NOT_FOUND · แคชเชียร์สาขาอื่น → NOT_FOUND · สาขาตัวเอง → ok (คู่บวก)
  ✅ [P1.3-S4.5] [Q23] registerStatus.user.role = รหัสบทบาท OWNER · MANAGER · STAFF ตาม actor (roleLabel ภาษาคนยังอยู่ · S4.1)
  ✅ [P1.3-S4.6] [Q25] registerVatConfig(ctx) = {mode, rateBp} เดียวกับ vatMode/vatRateBp ของ quote (สาขา sandbox และสาขาสีลม) · mode ∈ INCLUDED|NONE
  ✅ [P1.3-S4.7] [3.2 ข้อ 11] pendingStockCount: บิล PAID วันนี้ที่บรรทัดผูกสต็อกยังไม่มี movement pos-consume-<sale>-<line> → +1 · ตัดด้วยคีย์นั้นแล้ว → กลับเท่าเดิม
  ลบแล้ว: {"outbox":104,"audit":262,"journal":0,"point":0,"coupon":0,"payment":105,"line":305,"sale":103,"product":534,"productBySystem":0,"category":2,"menuGroup":2,"invJournal":53,"invItem":17,"customer":2,"user":2} · สาขา 3 · ระบบ 4
  ✅ [P1.3-S9.1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง · ตัวนับใบเสร็จสาขาจริงไม่ขยับ
  ✅ [P1.3-S9.2] QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · InvItem · AppSystem รวม settings · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter) ทุกคอลัมน์ ก่อน = หลัง

===== qc-pos-p1.3 ===== ผ่าน 127/127 · ข้าม 1 (กลุ่มของใบอื่น)
JSON_SUMMARY {"suite":"qc-pos-p1.3","total":127,"passed":127,"failed":[],"skipped":false,"forced":false,"skippedChecks":{"P1.3-S6.1":"P1.6 — ยังไม่มีโค้ดใน src/ อ่าน settings.pos.stock.oversellPolicy (นโยบาย BLOCK ตรวจใน tx ของบิล)"},"missing":[],"a5":{"drift":[]}}
```

### 10-qc-pos-products.log (last 15 lines)
```
  ✅ [NOACC-4] แก้ราคาสินค้าที่ผูกไว้แล้ว → ok แม้ POS ไม่ผูกบัญชี
  ✅ [NOACC-5] salePrice อัปเดตเป็น 2800

── cross-tenant guard ──
  ✅ [XT-1] ร้าน B ตั้งราคา item ร้าน A → ok:false (ไม่พบ)
  ✅ [XT-2] ราคาสินค้าร้าน A ไม่ถูกร้าน B แก้ (ยัง 1500)
  ✅ [XT-3] listPosProducts ร้าน B ไม่เห็นสินค้าร้าน A

[cleanup] ลบ test tenant เรียบร้อย

===== QC: POS สินค้า/ราคา =====
ผ่าน 24/24
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":24,"passed":24,"findings":[]}
```

### 11-qc-pos-p0.2.log (last 15 lines)
```

── S7 op อ่านยอดขาย (อ่าน DB · เทียบ aggregate อิสระบนวันที่มีบิลจริง) ──
  ✅ [P0.2-S7.2] sales.summary ช่วงวัน = วันไทย 3 วันรวมวันนี้
  ✅ [P0.2-S7.3] sales.summary ไม่ระบุ days = 7
  ✅ [P0.2-S7.4] sales.byDay 5 แถว ใหม่→เก่า เริ่มวันนี้ วันต่อเนื่อง
  ✅ [P0.2-S7.1] sales.summary ระบบจริง 1 วัน = aggregate อิสระ (ยอด 114000 สตางค์ · 6 บิล)
  ✅ [P0.2-S7.5] sales.byDay วัน 2026-10-04 = aggregate อิสระของวันนั้น (114000 สตางค์)
  ✅ [P0.2-S7.6] ระบบ POS อื่นของร้านเดียวกัน (ช่วงเดียวกันที่มียอดจริง > 0) เห็น 0 — ไม่รั่วข้ามระบบ
  ✅ [P0.2-S1.5] ทุก op มี test id ไม่ซ้ำ และมีข้อสอบที่รันจริง + ผ่าน ติดป้าย id นั้น (ไม่นับข้อความในไฟล์)

===== QC: POS P0.2 ทะเบียน op =====
ผ่าน 55/55 · SKIP 1 (P0.2-S6.7)
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":55,"passed":55,"skipped":["P0.2-S6.7"],"findings":[]}
```

### 12-qc-pos-register.log (last 15 lines)
```
── เชื่อมบัญชี: แยกรายได้สินค้า/บริการ ──
  ✅ [AC-1] มี journal entry ของบิลนี้
  ✅ [AC-2] 🔴 ยอดบริการเข้าบัญชี 4030 รายได้ค่าบริการ (สัดส่วน 300/310 ของฐาน)
  ✅ [AC-3] ยอดสินค้าเข้าบัญชี 4000 รายได้ขายสินค้า (ส่วนที่เหลือ)
  ✅ [AC-3b] รายได้ 2 หมวดรวมกัน = ฐานก่อน VAT ของทั้งบิล (ไม่มีเงินหาย/งอก)
  ✅ [AC-4] 🔴 งบยังบาลานซ์ (Dr = Cr) หลังแยกรายได้ 2 หมวด
  ✅ [MX-5] สรุปปิดวันแยกยอดสินค้า/บริการ/อื่น ๆ ได้

[cleanup] ลบ test tenant เรียบร้อย

===== QC Wave1-B: POS หน้าขาย =====
ผ่าน 42/42
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":42,"passed":42,"findings":[]}
```

### 13-qc-pos-inventory.log (last 15 lines)
```
  ✅ [PI-5.3] ไม่มี IN movement เพิ่ม (ยัง 1)
  ✅ [PI-5.4] net 5000 ยัง = 0 (ไม่กลับ COGS เบิ้ล)

── Act 5: ร้านไม่มีคลัง/บัญชี → ขายได้ปกติ ──
  ✅ [PI-6.1] ไม่มีคลัง → ขายผ่าน (PAID) ไม่ error
  ✅ [PI-6.2] ไม่มีคลัง → ไม่มี InvMovement (0)
  ✅ [PI-6.3] ไม่มีบัญชี → ไม่มี GL entry (0)

[cleanup] ลบ test tenant เรียบร้อย

===== QC: POS หน้าขายตัดสต็อก + COGS + void =====
ผ่าน 25/25
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":25,"passed":25,"findings":[]}
```

### 14-qc-pos-account.log (last 15 lines)
```

── Act 5: POS2 ไม่ได้เชื่อมบัญชี → standalone ห้าม post ──
  ✅ [ACC-5.1] POS ที่ไม่เชื่อม ไม่เกิด entry (opt-in เท่านั้น)

── Conservation: รายได้ในบัญชี = ยอดขายที่ไม่ void ──
  ✅ [ACC-6.1] Σ รายได้ 4000 = 200.00 (เหลือแค่บิลโอนที่ไม่ถูก void)
  ✅ [ACC-6.2] ทั้งสมุด Σdr = Σcr

[cleanup] ลบ test tenant เรียบร้อย

===== QC M1: POS→Account =====
ผ่าน 16/16
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":16,"passed":16,"findings":[]}
```

### 15-qc-pos-closeday.log (last 15 lines)
```
── CSV ปิดวัน ──
  ✅ [CSV-1] CSV มี BOM (\uFEFF) นำหน้า
  ✅ [CSV-2] มี header ถูกต้อง
  ✅ [CSV-3] แถวบิลครบ 3 (2 PAID + 1 VOIDED)
  ✅ [CSV-4] มีแถวยอดขายสุทธิในบล็อกสรุป (150.00)
  ✅ [CSV-5] มีแถวเงินสดควรมีในลิ้นชัก (100.00)
  ✅ [CSV-6] มีสถานะ 'ยกเลิก' สำหรับบิล void

[cleanup] ลบ test tenant เรียบร้อย

===== QC: POS ปิดวัน =====
ผ่าน 22/22
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":22,"passed":22,"findings":[]}
```

### 16-qc-pos-coupon.log (last 15 lines)
```

── Act 5: void บิลแรก → สิทธิ์คืน ใช้ได้อีก ──
  ✅ [CPN-5.1] void → release (สิทธิ์ REDEEMED เหลือ 1)
  ✅ [CPN-5.2] ใช้โค้ดได้อีกครั้งหลัง void

── กันถอยหลัง: ขายไม่ใส่คูปองยังปกติ ──
  ✅ [CPN-6.1] ขายปกติไม่กระทบ

[cleanup] เรียบร้อย

===== QC POS×Coupon =====
ผ่าน 8/8
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":8,"passed":8,"findings":[]}
```

### 17-qc-hf-inventory-atomic.log (last 15 lines)
```
  ✅ [AT-24.1] บิลชำระแล้วแต่ตัดสต็อกล้ม ⇒ console.error 1 บรรทัด "[pos] stock cut failed — sale committed without stock movement" + { saleId, itemId, qty, code } เท่านั้น (ได้ 1)
  ✅ [AT-24.2] void บิลแต่คืนสต็อกล้ม ⇒ console.error 1 บรรทัด "[pos] stock restore failed — void committed without stock movement" + { saleId, itemId, qty, code } (ได้ 1)

AT-25 inv-cache-audit: URL prod รูปแบบอื่น ⇒ exit 4 ก่อนต่อฐานข้อมูล · ตรวจ E/F บนร้านทดสอบ
  ✅ [AT-25.1] ด่าน prod ของ audit: ตัวพิมพ์ใหญ่ / percent-encode / host-less + ?host= / PGHOST ⇒ exit 4 ทุกแบบ (ไม่ต่อฐานข้อมูล)
  ✅ [AT-25.2] ร้าน 1 (มี AT-1..AT-24 ที่แข่งกันจริง + ของเสียจงใจ 2 ตัว) ⇒ E 1 · F 1 · A/B/C/D 0 · สินค้าเพี้ยน 2
  ✅ [AT-25.3] ร้าน 2 (ใบปรับต้นทุน · ใบเบิก/คืน · ตัดชุด แข่งกัน) ⇒ ไม่มีสินค้าเพี้ยน (F ไม่เตือนหลอกเมื่อมีใบปรับต้นทุน)
  ✅ [AT-Z] ปิดท้าย: 39 สินค้าทั้งหมด invariant ครบ (ไม่นับ 2 ตัวที่ AT-25 ทำเสียจงใจ)

TIMING per round (wall, 10 parallel): AT-1 1.0/0.8/0.7/0.7/1.2s · AT-2 0.8/0.7/0.7/0.7/0.7s · AT-3 0.8/0.8/0.8/0.8/0.8s · AT-4 1.1/1.1/1.1/1.1/1.1s · AT-5 0.8/0.7/0.7/0.8/0.8s · AT-6 0.3/0.3/0.3/0.3/0.3s · AT-8 0.9/0.9/0.9/0.9/0.8s · AT-9 0.8/0.8/0.8/0.8/0.8s · AT-7 2.7/2.7/2.9/2.8/2.6s · AT-10 0.9/0.9/0.9/0.9/0.9s · AT-12 2.0/2.0/2.0s · AT-13 1.9/1.9/1.8s · AT-14 0.4/0.3/0.3s · AT-15 2.4/2.4/2.4s · AT-16 0.6/0.6/0.6s · AT-17 0.5/0.5/0.4/0.3/0.5/0.5s · AT-19 2.2/2.1/2.9/2.1/2.1s · AT-20 0.4/0.4/0.4s

===== QC HF-INV-1 inventory atomic =====
ผ่าน 143/143
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":143,"passed":143,"findings":[]}
```

### 18-qc-hf-pos-page-authz.log (last 15 lines)
```
  ✅ [R-4] แคชเชียร์ A → เห็นแค่ A · active A
  ✅ [R-5] แคชเชียร์ A ขอ ?unit=B → ปฏิเสธ (ไม่โหลดสมาชิก/สินค้าของ B)
  ✅ [R-6] ผู้จัดการสาขา A ขอ ?unit=B → ปฏิเสธ
  ✅ [R-7] แคชเชียร์ A ?unit=ค่ามั่ว → กลับไป A (พฤติกรรมเดิม)
  ✅ [R-8] ไม่มีสิทธิ์ POS → ปฏิเสธ
  ✅ [R-9] POS ยังไม่ผูกสาขา → OWNER ยังเห็นหน้าชวนเชื่อม (active ว่าง)
  ✅ [R-10] POS ยังไม่ผูกสาขา → คนไม่มีสิทธิ์ ปฏิเสธ

[cleanup] จบ

===== QC: HF-POS-PAGES สิทธิ์หน้าจอ POS ต่อสาขา =====
ผ่าน 56/56
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":56,"passed":56,"findings":[]}
```

### 19-qc-restaurant.log (last 15 lines)
```
- If you want libpq compatibility now, use 'uselibpqcompat=true&sslmode=require'

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.
(Use `node --trace-warnings ...` to show where the warning was created)

===== QC Restaurant P1 (dine-in loop, Neon) =====
  ✅ เมนู: 2 สถานี KDS + หมวด + เมนู "ข้าวกะเพรา" ฿60
  ✅ โต๊ะ: โซน + โต๊ะ A1 (qrToken cmuta3…)
  ✅ เปิดโต๊ะ: session เดียว/โต๊ะ (กันเปิดซ้ำ ✓)
  ✅ สั่งอาหาร: ออเดอร์ #1 ข้าวกะเพรา×2
  ✅ KDS: คิว 1 + advance รายการจนเสร็จ
  ✅ เช็คบิล: ยอด ฿120.00 + ปิดโต๊ะ (fallback ไม่ผูก POS) ✓

🎉 Restaurant dine-in loop ผ่าน

```

### 20-qc-restaurant-money.log (last 15 lines)
```

── เงินถึงสมุดบัญชีไหม (ท่อ M1 อัตโนมัติ) ──
  ✅ [RM-2.1] เช็คบิลโต๊ะ → เกิด journal entry อัตโนมัติ
  ✅ [RM-2.2] Dr เงินสด 1000 = 120.00
  ✅ [RM-2.3] Cr รายได้ 4000 = 112.15 (ฐานหลังถอด VAT 7%)
  ✅ [RM-2.4] Cr ภาษีขาย 2200 = ส่วน VAT
  ✅ [RM-2.5] Σdr = Σcr

[cleanup] เรียบร้อย

===== QC Restaurant Money Chain =====
ผ่าน 6/6
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":6,"passed":6,"findings":[]}
```

### 21-qc-restaurant-pay.log (last 15 lines)
```
── idempotency: กดยืนยันรับเงินซ้ำ → ไม่เกิดบิลซ้ำ ──
  ✅ [RP-5.1] checkout ครั้งที่ 2 ไม่มีรายการค้าง (ok:false)
  ✅ [RP-5.2] posSale ยังคง 1 ใบเดียว (ไม่เก็บเงินซ้ำ)

── cross-tenant: qrToken ร้านอื่น ไม่คืนบิล ──
  ✅ [RP-6.1] guestBill(ร้าน1, qrToken ร้าน2) → ไม่คืน (กันข้ามร้าน)
  ✅ [RP-6.2] notifyPromptpayPayment(ร้าน2, qrToken ร้าน1) → ไม่คืน

[cleanup] เรียบร้อย

===== QC Restaurant Customer-Pay (PromptPay) =====
ผ่าน 19/19
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":19,"passed":19,"findings":[]}
```

### 22-qc-restaurant-void.log (last 15 lines)
```
  ✅ [RV-2.1] void ซ้ำ → ok:false (ไม่มีบิลชำระให้ยกเลิก)
  ✅ [RV-2.2] ไม่กลับบัญชีเบิ้ล: net เงินสดยัง 0 + void outbox ไม่เพิ่ม + posSale ยัง VOIDED

── guard: session ยังไม่จ่าย ──
  ✅ [RV-3.1] void session ยังไม่จ่าย → ok:false + session ยัง OPEN

── cross-tenant ──
  ✅ [RV-4.1] cross-tenant void → ok:false + posSale t1 ยัง PAID (ไม่ถูกกลับ)

[cleanup] เรียบร้อย

===== QC Restaurant Void =====
ผ่าน 11/11
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":11,"passed":11,"findings":[]}
```

### 23-qc-shop.log (last 15 lines)
```
  ✅ [SH-2.4] getOrderByCode ได้ order+lines · code ปลอม → null
  ✅ [SH-3.1] promptpayForOrder: payload EMVCo (000201 + โอนแล้วห้ามแก้ยอด → มียอด 650.00)
  ✅ [SH-4.1] PAID + paidAt + PosSale เกิด (650 บาท PAID) + posSaleId เก็บ
  ✅ [SH-4.2] outbox pos.sale.paid ≥1 (เส้นเงิน C-2 เดิน)
  ✅ [SH-4.3] สต็อกตัดเฉพาะ line ที่ผูก inv: เสื้อ 50→48
  ✅ [SH-4.4] ยืนยันซ้ำ → ok:false + PosSale ไม่ซ้ำ (1 ใบ)
  ✅ [SH-5.1] cancelOrder PENDING→CANCELLED · ยืนยันหลัง cancel → false
  ✅ [SH-5.2] ไม่มีระบบ POS → throw ไทย + order ยัง PENDING_PAYMENT
  ✅ [SH-5.3] ไม่มี PaymentProfile → promptpayForOrder null ไม่ throw
  ✅ [SH-6.1] tenant อื่นไม่เห็นสินค้า (guard)

===== QC E-commerce =====
ผ่าน 15/15
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":15,"passed":15,"findings":[]}
```

### 24-qc-shop-refund.log (last 15 lines)
```
  ✅ [RF-1.2] order → REFUNDED + refundedAt ตั้ง (ไม่ลบ record)
  ✅ [RF-1.3] posSale → VOIDED (กลับเส้นเงิน)
  ✅ [RF-1.4] outbox pos.sale.voided ≥1
  ✅ [RF-1.5] คืนสต็อกกลับ 48→50 (เฉพาะ line ผูกคลัง)
  ✅ [RF-1.6] ต้นทุนถัวเฉลี่ยไม่เพี้ยน (8000)
  ✅ [RF-1.7] movement คืนสต็อก type IN idempotencyKey ผูก order+line (1 รายการ)
  ✅ [RF-2.1] refund ซ้ำ → ok:false (ไม่ทำซ้ำ)
  ✅ [RF-2.2] สต็อกไม่เบิ้ล (ยัง 50) + void outbox ไม่เพิ่ม + IN movement ยัง 1
  ✅ [RF-3.1] refund PENDING_PAYMENT → ok:false + order ยัง PENDING
  ✅ [RF-4.1] cross-tenant refund → ok:false + order t1 ยัง PAID (ไม่ถูกคืน)

===== QC Shop Refund =====
ผ่าน 12/12
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":12,"passed":12,"findings":[]}
```

### 25-qc-inventory.log (last 15 lines)
```
(Use `node --trace-warnings ...` to show where the warning was created)
  ✅ [IV-1.1] สร้าง item onHand 0
  ✅ [IV-2.1] รับเข้า 20 → onHand 20
  ✅ [IV-2.2] movement มี balanceAfter 20
  ✅ [IV-3.1] รับซ้ำ idempotencyKey เดิม → ไม่เพิ่ม (ยัง 20)
  ✅ [IV-4.1] ตัดออก 3 → onHand 17
  ✅ [IV-4.2] onHand() อ่านได้ = 17
  ✅ [IV-5.1] ตัดเกินสต็อก → ยอมติดลบ (-83) ไม่ throw
  ✅ [IV-5.2] movement ติดลบตั้งธง needsReview
  ✅ [IV-6.1] lowStock: ติดลบ ≤ RP → เข้ารายการเตือน

===== QC Inventory =====
ผ่าน 12/12
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":12,"passed":12,"findings":[]}
```

### 26-qc-inventory-item.log (last 15 lines)
```
  ✅ [II-1.1] แก้ชื่อ/บาร์โค้ด/จุดสั่งซื้อ/หมวด สำเร็จ
  ✅ [II-1.2] onHand/costSatang ไม่เปลี่ยน (onHand 20 cost 5000)
  ✅ [II-1.3] แก้ SKU สำเร็จ
  ✅ [II-1.4] name ว่าง → throw · sku ซ้ำ → throw
  ✅ [II-1.5] หลัง throw ข้อมูลเดิมคงอยู่ (sku ยัง SH-99)
  ✅ [II-2.1] archiveItem → ไม่โผล่ listItems
  ✅ [II-2.2] archivedAt ถูกตั้ง
  ✅ [II-2.3] ประวัติ movement คงอยู่ (1 → 1)
  ✅ [II-2.4] unarchive → กลับมาโผล่ listItems
  ✅ [II-3.1] update/archive ข้ามร้าน → throw (ปฏิเสธ)
  ✅ [II-3.2] ของร้านเดิมไม่ถูกแตะ (ชื่อยังไม่ใช่ 'โดนแฮก')

===== QC Inventory Item (CRUD) =====
ผ่าน 11/11
JSON_SUMMARY {"total":11,"passed":11,"findings":[]}
```

### 27-qc-inventory-account.log (last 15 lines)
```
  ✅ [IA-5.2] 1200 สินค้าคงเหลือ net = 600 (A 10×50 + B 4×25)
  ✅ [IA-5.3] 5000 ต้นทุนขาย net = 0 (ขาย 150 แล้ว refund กลับ 150)
  ✅ [IA-5.4] 2100 เจ้าหนี้ net = -500 (เครดิต 500)
  ✅ [IA-5.5] 3000 ทุนเจ้าของ net = -100 (เครดิต 100)
  ✅ [IA-6.1] receive ซ้ำ → คืน movement เดิม + GL entry ยัง 1 (ไม่เบิ้ล)
  ✅ [IA-6.2] consume ซ้ำ → คืน movement เดิม + GL entry ยัง 1 (ไม่เบิ้ล)
  ✅ [IA-6.3] trial balance ไม่เปลี่ยน (ยัง 900/900)
  ✅ [IA-7.1] ไม่มี ACCOUNT → receive/consume ไม่ error + movement ถูกบันทึก (2)
  ✅ [IA-7.2] ไม่มี ACCOUNT → ไม่มี GL entry เลย (0)
  ✅ [IA-8.1] adjust → ไม่โพสต์ GL (out of scope)

===== QC Inventory → Account (perpetual) =====
ผ่าน 23/23
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":23,"passed":23,"findings":[]}
```

### 28-qc-booking-deposit.log (last 15 lines)
```
  ✅ [BD-4.2] Dr 2110 ไม่เบิ้ล (ยัง 50000)
  ✅ [BD-5.1] refundDeposit ok
  ✅ [BD-5.2] posSale → VOIDED + depositPaidAt เคลียร์ (null)
  ✅ [BD-5.3] บัญชี Dr 2110 net=0 (กลับรายการครบ)
  ✅ [BD-5.4] outbox pos.sale.voided ≥1
  ✅ [BD-6.1] refundDeposit ซ้ำ → ok:false (ไม่ทำซ้ำ)
  ✅ [BD-6.2] บิล VOIDED ยัง 1 (ไม่ void ซ้ำ)
  ✅ [BD-7.1] ไม่ผูก POS → recordDeposit ok + depositPaidAt ตั้ง + ไม่มีบิล (saleId ว่าง)
  ✅ [BD-8.1] cross-tenant recordDeposit → ok:false + นัด t1 ยังไม่จ่าย (ไม่ถูกแตะ)
  ✅ [BD-9.1] ทุก journal entry สมดุล Σdr=Σcr

===== QC Booking Deposit =====
ผ่าน 18/18
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":18,"passed":18,"findings":[]}
```

### 29-qc-booking-race.log (last 15 lines)
```

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✅ [R-1.1] race จอง slot เดียวกัน → สำเร็จ 1 ล้มเหลว 1 (ได้ ok=1 fail=1)
  ✅ [R-1.2] หลัง race มีนัดจริงใน DB แค่ 1 (ไม่จองซ้อน) — พบ 1
  ✅ [R-2.1] จองทับเวลาช่างเดิม (sequential) → ok:false
  ✅ [R-3.1] คนละช่าง เวลาเดียวกัน → ได้ทั้งคู่
  ✅ [I-1.1] key เดิม 2 ครั้ง → ok ทั้งคู่ + id เดียวกัน
  ✅ [I-1.2] key เดิม → มีนัดใน DB แค่ 1 (ไม่เบิ้ล) — พบ 1
  ✅ [I-2.1] race key เดิม → ok ทั้งคู่ + id เดียวกัน + DB มี 1 (ok=2 db=1)
  ✅ [I-3.1] ไม่ส่ง key + คนละ slot → ได้ทั้งคู่ (idempotencyKey=null ไม่ชน unique)

===== QC Booking Race + Idempotency =====
ผ่าน 8/8
JSON_SUMMARY {"total":8,"passed":8,"findings":[]}
```

### 30-qc-account-cpa.log (last 15 lines)
```
  2205: 0.00
  2210: 0.00
  4000: -14,500.00
  4030: -2,000.00
  5000: 0.00
  6800: 330.00
  6900: 1,000.00

[cleanup] ลบ test tenant เรียบร้อย

===== QC6 CPA audit (service layer จริง + Neon) =====
ผ่าน 107/107 ข้อตรวจ
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":107,"passed":107,"findings":[]}
```

### 31-qc-hotel-money.log (last 15 lines)
```
- If you want libpq compatibility now, use 'uselibpqcompat=true&sslmode=require'

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✅ [HT-1.1] จองได้ (1 คืน ฿1,070)
  ✅ [HT-1.2] เช็คเอาท์สำเร็จ
  ✅ [HT-2.1] เช็คเอาท์ → เกิด journal entry ค่าห้องอัตโนมัติ
  ✅ [HT-2.2] Cr รายได้ 4000 = ฐานหลังถอด VAT (1000)
  ✅ [HT-2.3] Σdr=Σcr
[cleanup] ok

===== QC Hotel Money =====
ผ่าน 5/5
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":5,"passed":5,"findings":[]}
```

### 32-qc-ticket-money.log (last 15 lines)
```

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✅ [TK-1.1] สร้างออเดอร์ตั๋วได้ (฿107)
  ✅ [TK-2.1] markPaid → เกิด journal entry อัตโนมัติ
  ✅ [TK-2.2] Cr รายได้ 4000 = ฐานหลังถอด VAT (100)
  ✅ [TK-2.3] Cr ภาษีขาย 2200 = 7
  ✅ [TK-2.4] Σdr=Σcr
  ✅ [TK-3.1] markPaid ซ้ำ idempotent (ไม่ post เบิ้ล)
[cleanup] ok

===== QC Ticket Money =====
ผ่าน 6/6
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":6,"passed":6,"findings":[]}
```

### 33-qc-subscription-money.log (last 15 lines)
```
  ✅ [SM-2.5] posSale.memberId = ลูกค้า
  ✅ [SM-2.6] payMethod PROMPTPAY ถูกส่งต่อ
  ✅ [SM-3.1] ยอดค่าสมาชิก → journal entry อัตโนมัติ
  ✅ [SM-3.2] Σdr = Σcr (บัญชีดุล)
  ✅ [SM-4.1] createSale ซ้ำ key เดิม → ไม่เกิดบิลใหม่ (idempotent)
  ✅ [SM-5.1] แพ็กเกจฟรี → subscribe ACTIVE ได้
  ✅ [SM-5.2] แพ็กเกจฟรี → ไม่มี posSale
  ✅ [SM-6.1] ไม่ผูก POS → subscribe สำเร็จ ไม่ error
  ✅ [SM-6.2] ไม่ผูก POS → ไม่มี posSale (ข้ามการเก็บเงิน)
[cleanup] ok

===== QC Subscription Money =====
ผ่าน 14/14
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":14,"passed":14,"findings":[]}
```

### 34-qc-ai-proposals.log (last 15 lines)
```
  ✅ [PZ-2.4] กดซ้ำ → ok:false + สต็อกไม่เพิ่ม
  ✅ [PZ-3.1] STAFF ไม่มีสิทธิ์ → ok:false + PENDING คงเดิม
  ✅ [PZ-4.1] reject PENDING → true + REJECTED
  ✅ [PZ-4.2] reject ซ้ำ → false
  ✅ [PZ-5.1] หมดอายุ → ok:false + EXPIRED
  ✅ [PZ-6.1] อนุมัติใบลาผ่าน proposal → APPROVED
  ✅ [PZ-6.2] สร้างแคมเปญผ่าน proposal → DRAFT เสมอ
  ✅ [PZ-7.1] sku ไม่มีจริง → ok:false + FAILED + note ไทย
  ✅ [PZ-8.1] action-tool สร้าง proposal + ไม่แตะสต็อก
  ✅ [PZ-8.2] registry มี action tools 3 ตัวแรกครบ (จำนวนรวมคุมโดย oracle รุ่นล่าสุด)

===== QC AI Proposals (Phase 3.5) =====
ผ่าน 16/16
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":16,"passed":16,"findings":[]}
```

### 35-qc-ai-tools.log (last 15 lines)
```
  ✅ [TU-2.2] args เพี้ยน → ไม่ throw (error หรือ default)
  ✅ [TU-3.1] loop: tool call → คำตอบจบ
  ✅ [TU-3.2] รอบแรกส่งเฉพาะแกนกลาง + load_skill (ไม่ยัดทั้ง registry)
  ✅ [TU-3.2b] ชุดแรกเล็กกว่าทะเบียนเต็มอย่างมีนัย (< 1 ใน 4)
  ✅ [TU-3.7] สั่ง load_skill แล้วเครื่องมือของสกิลนั้นโผล่ในรอบถัดไป
  ✅ [TU-3.8] โหลดแล้วยังทำงานจบได้จริง (ไม่ใช่แค่โผล่ในลิสต์)
  ✅ [TU-3.9] สกิลที่โหลดแล้วไม่ถูกยื่นให้โหลดซ้ำ (กัน AI วนเรียกเปล่า)
  ✅ [TU-3.3] รอบสองมี tool result (เลข 2 + toolCallId)
  ✅ [TU-3.4] persist เฉพาะ USER+ASSISTANT จบ (2 แถว)
  ✅ [TU-4.1] เพดาน 5 รอบ: จบเอง ok:true + มีข้อความ

===== QC AI Tools (Phase 3 v1) =====
ผ่าน 18/18
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":18,"passed":18,"findings":[]}
```
