# suites run p16-before — 20261004T092504Z

| # | step | exit | seconds | summary |
|---|---|---|---|---|
- tree `/root/projects/shark-pos-b` · branch `wip/pos-p1.5` · head `880ef560`
| 1 | qc-pos-p1.6-forced | 1 | 37 | "total":48,"passed":8,"failed":["P1.6-V1","P1.6-V2","P1.6-U4","P1.6-R2","P1.6-R3","P1.6-V3","P1.6-V5","P1.6-T2","P1.6-T3","P1.6-T4","P1.6-T5","P1.6-T6","P1.6-T7 |
| 2 | qc-pos-p1.3-forced | 1 | 107 | "total":128,"passed":127,"failed":["P1.3-S6.1"] |
| 3 | qc-pos-p1.1 | 0 | 164 | "total":178,"passed":178,"failed":[] |
| 4 | qc-pos-p1.4 | 0 | 8 | "total":21,"passed":21,"failed":[] |
| 5 | qc-pos-p1.5 | 0 | 10 | "total":21,"passed":21,"failed":[] |
| 6 | qc-pos-register | 0 | 10 |  |
| 7 | qc-pos-products | 0 | 4 |  |
| 8 | qc-pos-inventory | 0 | 5 |  |
| 9 | qc-pos-account | 0 | 5 |  |
| 10 | qc-pos-closeday | 0 | 4 |  |
| 11 | qc-pos-coupon | 0 | 4 |  |
| 12 | qc-pos-p0.2 | 0 | 4 |  |
| 13 | qc-hf-inventory-atomic | 0 | 232 |  |
| 14 | qc-hf-pos-page-authz | 0 | 5 |  |
| 15 | qc-account-cpa | 0 | 14 |  |
| 16 | qc-money-mapping | 0 | 7 |  |
| 17 | qc-restaurant | 0 | 3 |  |
| 18 | qc-restaurant-money | 0 | 5 |  |
| 19 | qc-restaurant-pay | 0 | 5 |  |
| 20 | qc-restaurant-void | 0 | 6 |  |
| 21 | qc-shop | 0 | 5 |  |
| 22 | qc-shop-refund | 0 | 6 |  |
| 23 | qc-hotel-money | 0 | 5 |  |
| 24 | qc-hotel-refund | 0 | 5 |  |
| 25 | qc-ticket-money | 0 | 5 |  |
| 26 | qc-ticket-cancel | 0 | 6 |  |
| 27 | qc-subscription | 0 | 3 |  |
| 28 | qc-subscription-money | 0 | 4 |  |
| 29 | qc-booking-deposit | 0 | 6 |  |
| 30 | qc-booking-race | 0 | 3 |  |
| 31 | qc-booking-edit-schedule | 0 | 4 |  |
| 32 | qc-clinic | 0 | 4 |  |
| 33 | qc-clinic-refund | 0 | 6 |  |
| 34 | qc-school | 0 | 4 |  |
| 35 | qc-school-refund | 0 | 6 |  |
| 36 | qc-rental | 0 | 3 |  |
| 37 | qc-rental-race | 0 | 3 |  |
| 38 | qc-rental-refund | 0 | 5 |  |
| 39 | qc-member-fix-s2 | 1 | 3 |  |
| 40 | qc-member-m1.7 | 1 | 3 |  |
| 41 | qc-member-m2.6 | 1 | 2 |  |
| 42 | qc-ai-phase-a | 0 | 4 |  |
| 43 | qc-ai-phase-b1 | 0 | 5 |  |
| 44 | qc-crm-c2.7 | 0 | 361 |  |
| 45 | qc-crm-c2.9 | 0 | 43 |  |

### 01-qc-pos-p1.6-forced.log (last 15 lines)
```
  ✅ [P1.6-U3] ร้านมี POS ตัวเดียว (ร้าน QC อาหาร) · สาขาไม่ผูก POS → ขายได้เหมือนวันนี้ (ผู้เรียกแบบ 'POS ตัวแรก') · คู่ที่ผูกถูก (sandbox) → PAID

── B oversellPolicy ──
  ❌ [P1.6-B1] BLOCK: เหลือ 2 ขาย 3 → STOCK_INSUFFICIENT ไม่มีบิล สต็อก 2 ไม่มี OUT ตัวนับไม่ขยับ · ขาย 2 → PAID สต็อก 0 OUT 1 แถว (ไม่ตัดซ้ำหลัง commit) · สินค้าไม่นับสต็อกยังขายได้ — expected ขาย 3 STOCK_INSUFFICIENT (สต็อก 2 · OUT 0 · ตัวนับเดิม) · ขาย 2 PAID สต็อก 0 OUT 1 · ไม่นับสต็อก PAID | actual OK oh -1 out 1 ตัวนับ 17→18 · OK oh -3 out 1 · untracked OK
  ❌ [P1.6-B2] BLOCK ผ่าน createSale รูปแบบเดิม (บรรทัดมี itemId): เหลือ 1 ขาย 2 → STOCK_INSUFFICIENT ไม่มีบิล สต็อก 1 — expected STOCK_INSUFFICIENT · ไม่มีบิล · สต็อก 1 | actual OK oh -1
  ❌ [P1.6-B3] BLOCK ชิ้นสุดท้าย 10 connection × 3 รอบ → PAID 1 · STOCK_INSUFFICIENT 9 · สต็อก 0 ไม่ติดลบ · ไม่มีรหัสอื่น (deadlock/BUSY/INTERNAL/THROW) — expected ทุกรอบ PAID 1 · SI 9 · สต็อก 0 · บิล 1 · ไม่มีรหัสอื่น | actual r0: PAID 10 SI 0 oh -9 บิล 10 ; r1: PAID 10 SI 0 oh -9 บิล 10 ; r2: PAID 10 SI 0 oh -9 บิล 10
  ❌ [P1.6-B4] BLOCK สองสินค้าสลับลำดับบรรทัด ([X,Y]/[Y,X]) 10 connection × 3 รอบ (เหลืออย่างละ 5) → PAID 5 · STOCK_INSUFFICIENT 5 · สต็อก 0/0 · ไม่มี deadlock — expected ทุกรอบ PAID 5 · SI 5 · สต็อก 0/0 · ไม่มี deadlock | actual r0: PAID 10 SI 0 oh -5/-5 ; r1: PAID 10 SI 0 oh -5/-5 ; r2: PAID 10 SI 0 oh -5/-5
  ✅ [P1.6-B5] ไม่ตั้งนโยบาย / ALLOW_NEGATIVE → ขายเกินได้เหมือนวันนี้ (PAID · สต็อก −1)
  ❌ [P1.6-R1] คำปฏิเสธใหม่ของหน้าขาย/ตั้งค่า (SPLIT_INVALID · STOCK_INSUFFICIENT · PAYMENT_MISMATCH เงินรับ · VALIDATION หมายเหตุ/ทิป · TIP_ACCOUNT_REQUIRED) = คืน {ok:false, code, message} ไม่ throw — expected 8 คำปฏิเสธ = {ok:false, code, message} ไม่ throw | actual T3 11 รายการ:VALIDATION · K4 เปิดทิปไม่มีบัญชี:MISSING:updatePosPaymentSettings · K4 บัญชีสมุดอื่น:MISSING:updatePosPaymentSettings · K9 POS ไม่ผูกสมุด:MISSING:updatePosPaymentSettings · B1 BLOCK:OK
  ลบแล้ว: {"outbox":88,"audit":27,"journal":0,"point":0,"coupon":0,"restaurantOrderItem":1,"restaurantOrder":1,"tableSession":1,"restaurantTable":1,"restaurantZone":1,"kdsStation":1,"restaurantSetting":1,"payment":96,"line":139,"sale":98,"product":14,"productBySystem":0,"invJournal":89,"invItem":13,"counter":6,"accLink":2,"accJournal":0,"accDoc":0,"accSettings":2} · สาขา 6 · ระบบ 6
  ✅ [P1.6-Z1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง · ผลรวมตัวนับใบเสร็จไม่ขยับ
  ✅ [P1.6-Z2] QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · InvItem · AppSystem รวม settings · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter · AccountSettings · AccountSystemLink) ทุกคอลัมน์ ก่อน = หลัง

===== qc-pos-p1.6 ===== ผ่าน 8/48 (QC_FORCE)
JSON_SUMMARY {"suite":"qc-pos-p1.6","total":48,"passed":8,"failed":["P1.6-V1","P1.6-V2","P1.6-U4","P1.6-R2","P1.6-R3","P1.6-V3","P1.6-V5","P1.6-T2","P1.6-T3","P1.6-T4","P1.6-T5","P1.6-T6","P1.6-T7","P1.6-C1","P1.6-C2","P1.6-C3","P1.6-K1","P1.6-K2","P1.6-K3","P1.6-K4","P1.6-K9","P1.6-K5","P1.6-K6","P1.6-K7","P1.6-K8","P1.6-N1","P1.6-N2","P1.6-I1","P1.6-I2","P1.6-I3","P1.6-I4","P1.6-I6","P1.6-I7","P1.6-U1","P1.6-U2","P1.6-B1","P1.6-B2","P1.6-B3","P1.6-B4","P1.6-R1"],"skipped":false,"forced":true,"skippedChecks":{},"missing":["src/lib/money/vat.ts ยังไม่มี export splitIncludedVat (R1)","คอลัมน์ PosSale.note ยังไม่มี (client ✗ · DB ✗)","คอลัมน์ PosSale.serviceChargeSatang ยังไม่มี (client ✗ · DB ✗)","คอลัมน์ PosSale.tipSatang ยังไม่มี (client ✗ · DB ✗)","คอลัมน์ PosSaleLine.note ยังไม่มี (client ✗ · DB ✗)","คอลัมน์ PosPayment.tenderedSatang ยังไม่มี (client ✗ · DB ✗) (R3 · มติ §8 ข้อ 2)","คอลัมน์ PosPayment.changeSatang ยังไม่มี (client ✗ · DB ✗) (R3 · มติ §8 ข้อ 2)","enum PosPayType ยังไม่มี CARD (client ✗ · DB ✗)","REGISTER_PAY_TYPES ยังไม่รวม TRANSFER/CARD (R2)","service.ts ยังไม่มีการ์ด UNIT_SYSTEM_MISMATCH (R7)","ยังไม่มีโค้ดใน src/ อ่าน settings.pos.stock.oversellPolicy (R8)","src/lib/modules/pos/payment-settings.ts ยังไม่มี export updatePosPaymentSettings/posPaymentSettings (O19/O20)"],"a5":{"drift":[]}}
```

### 02-qc-pos-p1.3-forced.log (last 15 lines)
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

### 03-qc-pos-p1.1.log (last 15 lines)
```
  ✅ [P1.1-S2.R2.4] R2 F5 แถวเว็บร้านที่ ShopProduct สองแถวใช้ร่วม: แก้ ShopProduct แถวที่สองไม่เปลี่ยนราคา/ชื่อของแถวแคตตาล็อก (แถวแรกเป็นต้นทาง) · ShopProduct แถวที่สองยังถูกเขียน {-}
  ✅ [P1.1-S2.R2.5] R2 F6 menu.createItem 2 ครั้งพร้อมกัน หมวดใหม่ที่ยังไม่มี PosCategory: สำเร็จทั้งคู่ · PosCategory ชื่อนั้น 1 แถว · ทั้งสองแถว MENU ชี้หมวดเดียวกัน {X6}
  ✅ [P1.1-S2.R2.6] R2 F1 (static) ทุก redirect ?err= ใน inventory/actions · shop/actions · actions/booking · actions/restaurant ไปหน้าที่อ่าน err จาก searchParams แล้วแสดง (InvHub รับ err) {-}
  ✅ [P1.1-S2.R3.1] R3 H1 (2 connection) conn1 UPDATE AccountProduct.salePrice ค้างไม่ commit · conn2 inventory.linkAccountProduct(Y→A) เบื้องหลัง · conn1 commit → แถวของ Y = ราคาใหม่ · verifyCatalog ไม่มี drift ของแถว Y {X6}
  ✅ [P1.1-S2.R3.2] R3 H1 (2 connection) conn1 UPDATE AccountProduct.salePrice ค้างไม่ commit · conn2 shop.createProduct({invItemId: Y ผูก A · C9b}) เบื้องหลัง · conn1 commit → แถวใหม่ = ราคาใหม่ · verifyCatalog ไม่มี drift {X6}
  ✅ [P1.1-S2.R3.3] R3 H2 3 เลน (setPrice แถว P · link Y→A · account.updateProduct(A)) × 5 รอบ → ทุกเลนสำเร็จ · ไม่มี deadlock (error + pg_stat_database.deadlocks ส่วนเพิ่ม 0) · ทุกแถวของ A ราคาเท่ากัน = AP.salePrice · verify ไม่ drift {X6}
  ✅ [P1.1-X9.1] event outbox ตระกูล pos.* ที่เกิดระหว่างรัน (ถ้ามี) มี consumer ลงทะเบียนครบ {X9}
  ✅ [P1.1-S1.36] rollback ปลายทาง: ลบแถวตารางใหม่ที่รันนี้สร้าง + คืนคอลัมน์เชื่อม + ลบ fixtures → ตารางเดิม (จำนวน + checksum) และตารางใหม่ เท่าก่อนรัน · ร้าน QC กลับสภาพเดิม {X5}
ROWCOUNTS_AFTER {"BusinessUnit":3,"AppSystemUnit":13,"InvItem":9,"InvItemImage":0,"InvLocationStock":3,"InvMovement":3,"AccountProduct":8,"MenuCategory":3,"MenuItem":4,"MenuOptionGroup":0,"MenuOptionChoice":0,"MenuItemOptionGroup":0,"KdsStation":2,"ShopProduct":0,"ShopOrder":0,"ShopOrderLine":0,"RestaurantOrderItem":0,"PosSale":6,"PosSaleLine":12,"PosPayment":6,"PosReceiptCounter":2,"BookingService":0,"Membership":4,"AppSystem":8,"AccountSettings":0,"PosProduct":13,"PosCategory":3,"PosProductOptionGroup":0,"RecipeLine":0,"OutboxEvent":6} · เท่าเดิม
  ✅ [P1.1-R.1] QC4 คืนสภาพ — นับแถว: ทุกตารางที่มี tenantId ของร้าน QC POS ทั้งสอง ก่อน = หลัง · ตารางแคตตาล็อกของร้านอื่น (PosProduct · PosCategory · MenuItem · ShopProduct · InvItem · AccountProduct · BookingService) ก่อน = หลัง {X5}
  ℹ️  [R] นับ 311 รายการ · ลายนิ้วมือ 78 แถว · คืน updatedAt: Membership 1
  ✅ [P1.1-R.2] QC4 คืนสภาพ — ลายนิ้วมือ: แถวที่มีอยู่ก่อนรันของร้าน QC POS (แคตตาล็อก · คลัง · บัญชีสินค้า · เมนู · เว็บร้าน · จอง · ระบบ/สาขา · สมาชิกทีม · ตั้งค่า) ทุกคอลัมน์รวม updatedAt ก่อน = หลัง (แถวที่ค่าคืนครบแต่ updatedAt เด้ง → คืน updatedAt ด้วย SQL ตรงก่อนตรวจ · พิมพ์จำนวน) {X5}

===== qc-pos-p1.1 ===== ผ่าน 178/178
JSON_SUMMARY {"suite":"qc-pos-p1.1","total":178,"passed":178,"failed":[],"skipped":null,"catalogue":180,"tag":"qc-p1.1-363733","skippedGroups":{},"skippedChecks":{"P1.1-S2.11b":"src/lib/modules/account/service.ts ยังไม่ import แคตตาล็อก (pos/catalog หรือ pos/catalog-legacy) — Part B ทำหลัง CRM merge (brief P1.1b \"Why A / B\")","P1.1-S2.19":"src/lib/modules/account/service.ts ยังไม่ import แคตตาล็อก (pos/catalog หรือ pos/catalog-legacy) — Part B ทำหลัง CRM merge (brief P1.1b \"Why A / B\")"},"force":false,"p11bStarted":true,"partBStarted":false}
```

### 04-qc-pos-p1.4.log (last 15 lines)
```
  ✅ [P1.4-S5] ข้อความ pos.register.scan.{chooseTitle notFound addAsCustom ignoredWhileDialog cameraTitle cameraDenied cameraNone} มี th+en ไม่ว่าง · en ไม่มีอักษรไทย · ทุกคีย์ถูกใช้ในโค้ดหน้าขาย

── sandbox qc-p1.4-8ffkoh (สาขา 2 + ระบบ POS/คลัง ชั่วคราวในร้าน QC กาแฟ · ระบบ POS ชั่วคราว 1 ตัวในร้าน QC อาหาร) ──
  ✅ [P1.4-K1] บาร์โค้ดเฉพาะตัว (InvItem) → one + สินค้านั้น · สแกนซ้ำได้ตัวเดิม · มีช่องว่างหัวท้ายยังเจอ
  ✅ [P1.4-R3] ทางเซิร์ฟเวอร์ของ +1: cartAddProduct ×2 สินค้าเดียวกัน → cartToQuoteInput → quoteRegisterCart = 1 บรรทัด gross 2×ราคา · ยอด 2×ราคา (ไม่ใช่ 2 บรรทัด)
  ✅ [P1.4-K2] บาร์โค้ดเดียว 4 สินค้า (A B ปกติ · C เก็บถาวร · D ผูกสาขา 2): สาขา 1 → choose = {A,B} ครบ ลำดับคงที่สองครั้ง · สาขา 2 → choose = {A,B,D} · C ไม่โผล่เลย
  ✅ [P1.4-K3] บาร์โค้ดที่มีเฉพาะในร้านอื่น (ร้าน QC อาหาร · ระบบ POS sandbox) → none ที่ร้านกาแฟ (แถวของร้านอื่นมีจริง)
  ✅ [P1.4-K4] สินค้าผูกสาขา 2 (unitId) บาร์โค้ดเฉพาะตัว → สาขา 1 none · สาขา 2 one
  ✅ [P1.4-K5] สินค้าเก็บถาวร: บาร์โค้ดของแถว PosProduct เอง และบาร์โค้ดของ InvItem ที่ผูก → none ทั้งคู่
  ลบแล้ว: {"outbox":0,"audit":14,"product":9,"productBySystem":0,"invItem":6} · สาขา 2 · ระบบ 3
  ✅ [P1.4-Z1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง · ผลรวมตัวนับใบเสร็จไม่ขยับ
  ✅ [P1.4-Z2] QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · InvItem · AppSystem · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter) ทุกคอลัมน์ ก่อน = หลัง

===== qc-pos-p1.4 ===== ผ่าน 21/21
JSON_SUMMARY {"suite":"qc-pos-p1.4","total":21,"passed":21,"failed":[],"skipped":false,"forced":false,"skippedChecks":{},"missing":[],"o22":"yes","a5":{"drift":[]}}
```

### 05-qc-pos-p1.5.log (last 15 lines)
```
  ✅ [P1.5-H6] ราคาในบิลพักไม่ถูกเชื่อ: พักพร้อม unitPriceSatang 1 ของสินค้าแคตตาล็อก → ปฏิเสธ หรือยอดพัก = ราคาจริง 6,000 · แก้ cartJson ใน DB ให้ทุกช่องราคา/ยอด = 1 → เรียกคืนแล้ว quote ราคา 6,000 ยอด 6,000 · บรรทัดที่คืนไม่กลายเป็นราคาเปิด
  ✅ [P1.5-H7] ราคาใหม่ตอนเรียกคืน (H3): พักตอน ฿50 แล้วเปลี่ยนเป็น ฿60 → quote บรรทัด 6,000 ยอด 9,000 (รวมสินค้าที่ราคาไม่เปลี่ยน 3,000) · notices มี PRICE_CHANGED lineIndex 0 ราคาเดิม 5,000 → 6,000 หนึ่งรายการ · บรรทัดที่ราคาไม่เปลี่ยนไม่มี notice
  ✅ [P1.5-H8] สินค้าเก็บถาวร / ปิดขายที่สาขา ระหว่างพัก → เรียกคืน ok แถว RECALLED · cart คง 3 บรรทัด · notices PRODUCT_NOT_FOUND@0 + PRODUCT_UNAVAILABLE@1 · quote ไม่ ok (ไม่คิดยอดด้วยราคาเก่าเงียบ ๆ)
  ✅ [P1.5-H9] เรียกคืนพร้อมกัน 10 connection × 3 รอบ (H2): ทุกรอบ ok 1 · ALREADY_RECALLED 9 · ไม่มีรหัสอื่น · แถว RECALLED โดยเจ้าของ
  ✅ [P1.5-H10] ข้ามสาขา: พักที่สาขา 1 · สาขา 2 (POS เดียวกัน) list ไม่เห็น · recall/discard ด้วย id → NOT_FOUND · แถวยัง HELD
  ✅ [P1.5-H11] ข้ามร้าน: ร้าน QC อาหาร (เจ้าของร้านนั้น · POS/สาขาจริงของร้านนั้น) recall/discard ด้วย id ของร้านกาแฟ → NOT_FOUND · list ไม่เห็น · แถวยัง HELD
  ✅ [P1.5-H12] สิทธิ์: STAFF ไม่มี pos.sale.create → PERMISSION_DENIED ทั้ง 4 ฟังก์ชัน ไม่มีแถว · แคชเชียร์จริง (unitAccess สีลม) ที่สาขา sandbox → NOT_FOUND · แคชเชียร์ที่มีสิทธิ์สาขานี้ ทิ้งและเรียกคืนบิลที่เจ้าของพักได้
  ✅ [P1.5-H13] หมดอายุแบบขี้เกียจ (H4): ปริยาย 2 วัน — อายุ 1 วันยังอยู่ · อายุ 3 วันหายจากรายการและกลายเป็น DISCARDED · เรียกคืนบิลอายุ 3 วัน (ก่อน list) → NOT_FOUND · ตั้ง settings.pos.heldCart.expireDays = 5 → อายุ 3 วันยังอยู่
  ✅ [P1.5-R1] คำปฏิเสธของพัก/รายการ/เรียกคืน/ทิ้ง (ALREADY_RECALLED · NOT_FOUND · PERMISSION_DENIED · VALIDATION) = คืน {ok:false, code, message} ไม่ throw
  ลบแล้ว: {"outbox":0,"audit":12,"held":19,"product":7,"productBySystem":0} · บิลพัก 19 · สาขา 2 · ระบบ 1
  ✅ [P1.5-Z1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ · รวม PosHeldCart) ก่อน = หลัง · ผลรวมตัวนับใบเสร็จไม่ขยับ
  ✅ [P1.5-Z2] QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · AppSystem · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter · PosHeldCart) ทุกคอลัมน์ ก่อน = หลัง

===== qc-pos-p1.5 ===== ผ่าน 21/21
JSON_SUMMARY {"suite":"qc-pos-p1.5","total":21,"passed":21,"failed":[],"skipped":false,"forced":false,"skippedChecks":{},"missing":[],"a5":{"drift":[]}}
```

### 06-qc-pos-register.log (last 15 lines)
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

### 07-qc-pos-products.log (last 15 lines)
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

### 08-qc-pos-inventory.log (last 15 lines)
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

### 09-qc-pos-account.log (last 15 lines)
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

### 10-qc-pos-closeday.log (last 15 lines)
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

### 11-qc-pos-coupon.log (last 15 lines)
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

### 12-qc-pos-p0.2.log (last 15 lines)
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

### 13-qc-hf-inventory-atomic.log (last 15 lines)
```
  ✅ [AT-24.1] บิลชำระแล้วแต่ตัดสต็อกล้ม ⇒ console.error 1 บรรทัด "[pos] stock cut failed — sale committed without stock movement" + { saleId, itemId, qty, code } เท่านั้น (ได้ 1)
  ✅ [AT-24.2] void บิลแต่คืนสต็อกล้ม ⇒ console.error 1 บรรทัด "[pos] stock restore failed — void committed without stock movement" + { saleId, itemId, qty, code } (ได้ 1)

AT-25 inv-cache-audit: URL prod รูปแบบอื่น ⇒ exit 4 ก่อนต่อฐานข้อมูล · ตรวจ E/F บนร้านทดสอบ
  ✅ [AT-25.1] ด่าน prod ของ audit: ตัวพิมพ์ใหญ่ / percent-encode / host-less + ?host= / PGHOST ⇒ exit 4 ทุกแบบ (ไม่ต่อฐานข้อมูล)
  ✅ [AT-25.2] ร้าน 1 (มี AT-1..AT-24 ที่แข่งกันจริง + ของเสียจงใจ 2 ตัว) ⇒ E 1 · F 1 · A/B/C/D 0 · สินค้าเพี้ยน 2
  ✅ [AT-25.3] ร้าน 2 (ใบปรับต้นทุน · ใบเบิก/คืน · ตัดชุด แข่งกัน) ⇒ ไม่มีสินค้าเพี้ยน (F ไม่เตือนหลอกเมื่อมีใบปรับต้นทุน)
  ✅ [AT-Z] ปิดท้าย: 39 สินค้าทั้งหมด invariant ครบ (ไม่นับ 2 ตัวที่ AT-25 ทำเสียจงใจ)

TIMING per round (wall, 10 parallel): AT-1 1.0/0.7/0.7/0.7/0.7s · AT-2 0.8/0.8/0.7/0.7/0.8s · AT-3 0.8/0.8/0.8/0.8/0.8s · AT-4 1.0/1.0/1.0/1.0/1.0s · AT-5 0.8/0.7/0.7/0.7/0.7s · AT-6 0.3/0.3/0.3/0.3/0.3s · AT-8 0.9/0.8/0.8/0.8/0.8s · AT-9 0.8/0.8/0.8/0.8/0.8s · AT-7 2.7/2.7/2.6/2.7/2.7s · AT-10 0.9/0.8/0.9/0.8/0.9s · AT-12 2.9/2.0/2.0s · AT-13 1.8/1.8/1.8s · AT-14 0.4/0.3/0.3s · AT-15 2.4/2.5/2.5s · AT-16 0.6/0.6/0.6s · AT-17 0.5/0.5/0.3/0.3/0.5/0.5s · AT-19 2.1/2.1/2.1/2.1/2.1s · AT-20 0.4/0.4/0.4s

===== QC HF-INV-1 inventory atomic =====
ผ่าน 143/143
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":143,"passed":143,"findings":[]}
```

### 14-qc-hf-pos-page-authz.log (last 15 lines)
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

### 15-qc-account-cpa.log (last 15 lines)
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

### 16-qc-money-mapping.log (last 15 lines)
```
- If you want the current behavior, explicitly use 'sslmode=verify-full'
- If you want libpq compatibility now, use 'uselibpqcompat=true&sslmode=require'

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✅ [MM-1.1] DEPOSIT 107 → Dr เงินมัดจำรับ 2110 = 107 (ไม่เข้า 1010)
  ✅ [MM-1.2] entry สมดุล + Cr รายได้ 4000 = 100 (ฐานหลังถอด VAT) + Cr VAT 2200 = 7
  ✅ [MM-2.1] ROOM_CHARGE 214 → Dr ลูกหนี้ 1100 = 214 (ไม่เข้า 1010) + สมดุล
  ✅ [MM-3.1] CASH 107 → Dr เงินสด 1000 = 107 (พฤติกรรมเดิมไม่เพี้ยน)
  ✅ [MM-4.1] จ่ายผสม CASH 50 + DEPOSIT 57 → Dr 1000=50 · Dr 2110=57 · สมดุล

===== QC Money Mapping =====
ผ่าน 5/5
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":5,"passed":5,"findings":[]}
```

### 17-qc-restaurant.log (last 15 lines)
```
- If you want libpq compatibility now, use 'uselibpqcompat=true&sslmode=require'

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.
(Use `node --trace-warnings ...` to show where the warning was created)

===== QC Restaurant P1 (dine-in loop, Neon) =====
  ✅ เมนู: 2 สถานี KDS + หมวด + เมนู "ข้าวกะเพรา" ฿60
  ✅ โต๊ะ: โซน + โต๊ะ A1 (qrToken cmutml…)
  ✅ เปิดโต๊ะ: session เดียว/โต๊ะ (กันเปิดซ้ำ ✓)
  ✅ สั่งอาหาร: ออเดอร์ #1 ข้าวกะเพรา×2
  ✅ KDS: คิว 1 + advance รายการจนเสร็จ
  ✅ เช็คบิล: ยอด ฿120.00 + ปิดโต๊ะ (fallback ไม่ผูก POS) ✓

🎉 Restaurant dine-in loop ผ่าน

```

### 18-qc-restaurant-money.log (last 15 lines)
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

### 19-qc-restaurant-pay.log (last 15 lines)
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

### 20-qc-restaurant-void.log (last 15 lines)
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

### 21-qc-shop.log (last 15 lines)
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

### 22-qc-shop-refund.log (last 15 lines)
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

### 23-qc-hotel-money.log (last 15 lines)
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

### 24-qc-hotel-refund.log (last 15 lines)
```
  ✅ [RF-3.2] posSale → VOIDED
  ✅ [RF-3.3] reservation → REFUNDED + refundedAt
  ✅ [RF-3.4] หลัง refund บัญชีรายได้ 4000 net=0 (คืนครบ)
  ✅ [RF-3.5] Σdr=Σcr ตลอด (บัญชีสมดุล)
  ✅ [RF-4.1] refund ซ้ำ → ok:false (idempotent)
  ✅ [RF-4.2] refund ซ้ำ → ไม่เกิด journal ใหม่ (net ยัง 0)
  ✅ [RF-4.3] refund ซ้ำ → posSale VOIDED ยังมีใบเดียว
  ✅ [RF-5.1] refund การจองที่ยังไม่เช็คเอาท์ → ok:false
  ✅ [RF-5.2] การจอง CHECKED_IN ไม่ถูกเปลี่ยนเป็น REFUNDED
[cleanup] ok

===== QC Hotel Refund =====
ผ่าน 15/15
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":15,"passed":15,"findings":[]}
```

### 25-qc-ticket-money.log (last 15 lines)
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

### 26-qc-ticket-cancel.log (last 15 lines)
```
  ✅ [TC-1.0] ก่อนยกเลิก: posSale PAID + sold=2 + รายได้ลงบัญชี (net cr>0)
  ✅ [TC-1.1] order → CANCELLED + cancelledAt
  ✅ [TC-1.2] posSale → VOIDED (กลับเส้นเงิน)
  ✅ [TC-1.3] ตั๋วทุกใบ VOID (2/2)
  ✅ [TC-1.4] คืนโควตา sold 2→0
  ✅ [TC-1.5] outbox pos.sale.voided ≥1
  ✅ [TC-1.6] บัญชี net=0 (รายได้ 4000 + VAT 2200 กลับหมด)
  ✅ [TC-2.1] cancel ซ้ำ → posSale ยัง VOIDED + sold ยัง 0 + void outbox ไม่เพิ่ม + net ยัง 0
  ✅ [TC-3.1] PENDING cancel: ไม่ error + CANCELLED + sold คืน (1→0) + ไม่มี posSale
  ✅ [TC-4.1] cross-tenant → order t1 ยัง PAID + posSale ยัง PAID (ไม่ถูกยกเลิก)

===== QC Ticket Cancel =====
ผ่าน 10/10
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":10,"passed":10,"findings":[]}
```

### 27-qc-subscription.log (last 15 lines)
```
  ✅ [SB-1.2] periodDays 0 → throw ไทย
  ✅ [SB-2.1] subscribe → ACTIVE + endAt = start+30 วัน
  ✅ [SB-2.2] สมัครซ้อนตอนยัง ACTIVE → throw ไทย
  ✅ [SB-2.3] isActive ณ กลางช่วง = true
  ✅ [SB-2.4] isActive หลังหมดอายุ = false
  ✅ [SB-3.1] expireDue → 1 + สถานะ EXPIRED
  ✅ [SB-3.2] expireDue ซ้ำ → 0 (idempotent)
  ✅ [SB-4.1] หมดอายุแล้วสมัครใหม่ได้
  ✅ [SB-4.2] cancel → CANCELLED + cancelledAt
  ✅ [SB-4.3] cancel ซ้ำ → false

===== QC Subscription =====
ผ่าน 11/11
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":11,"passed":11,"findings":[]}
```

### 28-qc-subscription-money.log (last 15 lines)
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

### 29-qc-booking-deposit.log (last 15 lines)
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

### 30-qc-booking-race.log (last 15 lines)
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

### 31-qc-booking-edit-schedule.log (last 15 lines)
```
  ✅ [SC-3] ตั้ง จ-ศ เต็มวัน + ส-อา ครึ่งวัน ได้
  ✅ [SC-4] อ่านกลับได้ครบ: จันทร์ 09:00-18:00 · เสาร์ 09:00-13:00
  ✅ [SC-5] เข้า 09:10 (ผ่อนผัน 15 นาที) = ตรงเวลา
  ✅ [SC-6] เข้า 09:30 = สาย
  ✅ [SC-7] ตั้งวันหยุดประจำได้ + วันที่ไม่ส่งมาถูกล้าง (กลับเป็นยังไม่ตั้ง)
  ✅ [SC-8] วันหยุดประจำ = ไม่นับสาย
  ✅ [SC-9] เวลาออกก่อนเวลาเข้า → ปฏิเสธ

[cleanup] ลบ test tenant เรียบร้อย

===== QC: แก้ไขบริการ / วันหยุด / พนักงาน / ตารางงาน =====
ผ่าน 26/26
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":26,"passed":26,"findings":[]}
```

### 32-qc-clinic.log (last 15 lines)
```
See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✅ [CL-1.1] สร้างผู้ป่วย + ผูก Customer (มีระบบสมาชิก)
  ✅ [CL-1.2] searchPatients ด้วยเบอร์บางส่วน เจอ
  ✅ [CL-2.1] เปิด visit + symptom ว่าง throw
  ✅ [CL-2.2] จ่ายยา 10 เม็ด 2 ครั้ง → สต็อก 80 (ครั้งที่สองคือการจ่ายจริงครั้งที่สอง — ตัดสต็อกและบันทึกลง dispenseJson · HF-INV-1 R3.5(b))
  ✅ [CL-2.3] movement sourceModule CLINIC + dispenseJson บันทึก
  ✅ [CL-3.1] เก็บเงิน 500 → BILLED + PosSale PAID + posSaleId
  ✅ [CL-3.2] เก็บซ้ำ ok:false + บิลไม่ซ้ำ
  ✅ [CL-3.3] fee 0 → BILLED โดยไม่มีบิล (posSaleId null)

===== QC Clinic =====
ผ่าน 8/8
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":8,"passed":8,"findings":[]}
```

### 33-qc-clinic-refund.log (last 15 lines)
```
  ✅ [RF-1.2] visit → REFUNDED + refundedAt ตั้ง (ไม่ลบ record)
  ✅ [RF-1.3] posSale → VOIDED (กลับเส้นเงิน)
  ✅ [RF-1.4] outbox pos.sale.voided ≥1
  ✅ [RF-1.5] คืนยาเข้าคลัง 90→100 (คืนเท่าที่ตัด)
  ✅ [RF-1.6] ต้นทุนถัวเฉลี่ยไม่เพี้ยน (200)
  ✅ [RF-1.7] movement คืนยา type IN idempotencyKey ผูก visit+item (1 รายการ)
  ✅ [RF-1.8] GL รายได้ 4000 net=0 (คืนครบ)
  ✅ [RF-2.1] refund ซ้ำ → ok:false (ไม่ทำซ้ำ)
  ✅ [RF-2.2] สต็อกยาไม่เบิ้ล (ยัง 100) + void ไม่เพิ่ม + IN movement ยัง 1
  ✅ [RF-4.1] cross-tenant refund → ok:false + visit t1 ยัง BILLED (ไม่ถูกคืน)

===== QC Clinic Refund =====
ผ่าน 13/13
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":13,"passed":13,"findings":[]}
```

### 34-qc-school.log (last 15 lines)
```

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✅ [SC-1.1] สมัคร → snapshot ราคา 2500 + ผูก Customer (มีระบบสมาชิก)
  ✅ [SC-1.2] capacity 2 เต็ม → คนที่ 3 throw ไทย
  ✅ [SC-2.1] ชำระ → PAID + PosSale 2500 PAID + paidAt
  ✅ [SC-2.2] outbox pos.sale.paid ≥1 + ชำระซ้ำ ok:false ไม่สร้างบิลซ้ำ
  ✅ [SC-3.1] เช็คชื่อซ้ำวันเดิม → อัปเดต present ไม่งอกแถว (1 แถว present=false)
  ✅ [SC-3.2] attendanceSheet: น้องเอ present=false · น้องบียังไม่เช็ค (null)
  ✅ [SC-4.1] ยกเลิก ENROLLED → true · ชำระหลังยกเลิก → ok:false

===== QC School =====
ผ่าน 7/7
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":7,"passed":7,"findings":[]}
```

### 35-qc-school-refund.log (last 15 lines)
```
  ✅ [RF-1.1] refund ok:true
  ✅ [RF-1.2] enrollment → REFUNDED + refundedAt ตั้ง (ไม่ลบ record)
  ✅ [RF-1.3] posSale → VOIDED (กลับเส้นเงิน)
  ✅ [RF-1.4] outbox pos.sale.voided ≥1
  ✅ [RF-1.5] GL รายได้ 4000 net=0 (คืนครบ) + Σdr=Σcr
  ✅ [RF-1.6] ที่นั่งคืน: หลัง refund สมัครคนใหม่ในรอบเดิมได้ (capacity ว่าง 1)
  ✅ [RF-2.1] refund ซ้ำ → ok:false (ไม่ทำซ้ำ)
  ✅ [RF-2.2] void outbox ไม่เพิ่ม + GL รายได้ยัง net=0 (ไม่กลับบัญชีเบิ้ล)
  ✅ [RF-3.1] refund ENROLLED → ok:false + enrollment ยัง ENROLLED
  ✅ [RF-4.1] cross-tenant refund → ok:false + enrollment t1 ยัง PAID (ไม่ถูกคืน)

===== QC School Refund =====
ผ่าน 11/11
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":11,"passed":11,"findings":[]}
```

### 36-qc-rental.log (last 15 lines)
```
  ✅ [RT-2.1] จอง 1-4 ส.ค. → 3 วัน quote 900 บาท + ถือมัดจำ 1000
  ✅ [RT-2.2] ช่วงชน (2-3 ส.ค.) → isAvailable false + จองซ้อน throw
  ✅ [RT-2.3] ช่วงว่าง (4-6 ส.ค. — endDate exclusive) → true
  ✅ [RT-2.4] endDate ≤ startDate → throw
  ✅ [RT-3.1] pickUp: BOOKED→PICKED_UP · ซ้ำ false
  ✅ [RT-3.2] คืน + ค่าปรับ 50 → total 950 บาท + PosSale PAID + RETURNED
  ✅ [RT-3.3] outbox pos.sale.paid ≥1 (เส้นเงินเดิน)
  ✅ [RT-3.4] คืนซ้ำ → ok:false + PosSale ไม่ซ้ำ
  ✅ [RT-4.1] cancel: BOOKED→CANCELLED · pickUp หลัง cancel → false
  ✅ [RT-4.2] ช่วงของ booking ที่ cancel → ว่าง (จองได้)

===== QC Rental =====
ผ่าน 11/11
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":11,"passed":11,"findings":[]}
```

### 37-qc-rental-race.log (last 15 lines)
```
- If you want the current behavior, explicitly use 'sslmode=verify-full'
- If you want libpq compatibility now, use 'uselibpqcompat=true&sslmode=require'

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✅ [R-1.1] race asset เดียวช่วงทับ → สำเร็จ 1 ล้มเหลว 1 (ok=1 fail=1)
  ✅ [R-1.2] หลัง race มี booking active จริงใน DB แค่ 1 (ไม่จองซ้อน) — พบ 1
  ✅ [R-2.1] จองทับช่วงเดิม (sequential) → throw ไทย
  ✅ [R-2.2] sequential overlap ไม่เพิ่ม booking (ยังคง 1) — พบ 1
  ✅ [R-3.1] คนละ asset ช่วงเดียวกัน → ได้ทั้งคู่
  ✅ [R-4.1] ช่วงต่อท้ายแบบไม่ทับ (endDate exclusive) → จองได้

===== QC Rental Race =====
ผ่าน 6/6
JSON_SUMMARY {"total":6,"passed":6,"findings":[]}
```

### 38-qc-rental-refund.log (last 15 lines)
```
  ✅ [RF-1.0] ก่อน refund: RETURNED + posSale PAID (950) + รายได้ net>0
  ✅ [RF-1.1] refund ok:true
  ✅ [RF-1.2] booking → REFUNDED + refundedAt ตั้ง (ไม่ลบ record)
  ✅ [RF-1.3] posSale → VOIDED (กลับเส้นเงิน)
  ✅ [RF-1.4] outbox pos.sale.voided ≥1
  ✅ [RF-1.5] GL รายได้ 4000 net=0 (คืนครบ) + Σdr=Σcr
  ✅ [RF-1.6] asset ปล่อยว่าง: ช่วงเดิม (1-4 ส.ค.) จองได้อีก
  ✅ [RF-2.1] refund ซ้ำ → ok:false (ไม่ทำซ้ำ)
  ✅ [RF-2.2] void outbox ไม่เพิ่ม + GL รายได้ยัง net=0 (ไม่กลับบัญชีเบิ้ล)
  ✅ [RF-4.1] cross-tenant refund → ok:false + booking t1 ยัง RETURNED (ไม่ถูกคืน)

===== QC Rental Refund =====
ผ่าน 11/11
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":11,"passed":11,"findings":[]}
```

### 39-qc-member-fix-s2.log (last 15 lines)
```
To prepare for this change:
- If you want the current behavior, explicitly use 'sslmode=verify-full'
- If you want libpq compatibility now, use 'uselibpqcompat=true&sslmode=require'

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.
(Use `node --trace-warnings ...` to show where the warning was created)
💥 TypeError: Cannot read properties of null (reading 'role')
    at <anonymous> (/root/projects/shark-pos-b/scripts/qc-member-fix-s2.mts:97:36)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async <anonymous> (/root/projects/shark-pos-b/scripts/qc-member-fix-s2.mts:94:17)
  ❌ [S2-ERR] ข้อสอบรันจนจบ — exp จบ | act Cannot read properties of null (reading 'role')
  ✅ [S2-CLEAN] ข้อสอบคืนฐานข้อมูล QC ให้เหมือนเดิม (ไม่เหลือสมาชิก/บิล/ระบบ/คิว/บัตรตรา/log ที่สร้างระหว่างเทส)

🔴 FIX-S2: 1/2
JSON_SUMMARY {"total":2,"passed":1,"findings":[{"id":"S2-ERR","sev":"CRITICAL"}]}
```

### 40-qc-member-m1.7.log (last 15 lines)
```

To prepare for this change:
- If you want the current behavior, explicitly use 'sslmode=verify-full'
- If you want libpq compatibility now, use 'uselibpqcompat=true&sslmode=require'

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.
(Use `node --trace-warnings ...` to show where the warning was created)
💥 TypeError: Cannot read properties of null (reading 'role')
    at actorOf (/root/projects/shark-pos-b/scripts/qc-member-m1.7.mts:56:160)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async <anonymous> (/root/projects/shark-pos-b/scripts/qc-member-m1.7.mts:58:17)
  ❌ [M1.7-ERR] ข้อสอบรันจนจบ — exp จบ | act Cannot read properties of null (reading 'role')

🔴 M1.7: 0/1
JSON_SUMMARY {"total":1,"passed":0,"findings":[{"id":"M1.7-ERR","sev":"CRITICAL"}]}
```

### 41-qc-member-m2.6.log (last 15 lines)
```

To prepare for this change:
- If you want the current behavior, explicitly use 'sslmode=verify-full'
- If you want libpq compatibility now, use 'uselibpqcompat=true&sslmode=require'

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.
(Use `node --trace-warnings ...` to show where the warning was created)
💥 TypeError: Cannot read properties of null (reading 'role')
    at actorOf (/root/projects/shark-pos-b/scripts/qc-member-m2.6.mts:70:160)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async <anonymous> (/root/projects/shark-pos-b/scripts/qc-member-m2.6.mts:71:17)
  ❌ [M2.6-ERR] ข้อสอบรันจนจบ — exp จบ | act Cannot read properties of null (reading 'role')

🔴 M2.6: 0/1
JSON_SUMMARY {"total":1,"passed":0,"findings":[{"id":"M2.6-ERR","sev":"CRITICAL"}]}
```

### 42-qc-ai-phase-a.log (last 15 lines)
```
(Use `node --trace-warnings ...` to show where the warning was created)
  ✅ [PA-1.1] tool ask_clarify ลงทะเบียน (ถามกลับแบบ choice)
  ✅ [PA-2.1] proposal ลบการ์ด → risk=DESTRUCTIVE อัตโนมัติ
  ✅ [PA-2.2] ยืนยันชั้นเดียว → ยังไม่ลบ + needsSecondConfirm
  ✅ [PA-2.3] ยืนยันชั้นสอง (confirm2x) → ลบจริง (archivedAt set)
  ✅ [PA-2.4] NORMAL risk + ทำชั้นเดียวได้ทันที (ไม่ต้อง 2 ชั้น)
  ✅ [PA-2.5] tool void_sale ลงทะเบียน (ยกเลิกบิล — destructive)
  ✅ [PA-2.6] void_sale ชั้นเดียว → บิลยัง PAID + needsSecondConfirm
  ✅ [PA-2.7] void_sale ชั้นสอง → บิล VOIDED จริง
  ✅ [PA-3.1] ปรับสต็อกติดลบ → คืน error (มี suggestion) + ไม่สร้าง proposal

===== QC AI Phase A =====
ผ่าน 9/9
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":9,"passed":9,"findings":[]}
```

### 43-qc-ai-phase-b1.log (last 15 lines)
```
(Use `node --trace-warnings ...` to show where the warning was created)
  ✅ [B1-0] tools ใหม่ครบ 8 ตัว
  ✅ [B1-1.1] pos_create_sale → PosSale PAID 150 บาทเกิดจริง + idempotencyKey ai-<proposalId>
  ✅ [B1-1.2] ขาย qty 0 → error+ไม่สร้าง proposal (validate-explain)
  ✅ [B1-2.1] booking_create_appointment → นัดเกิดจริง (resolve service จากชื่อบางส่วน + ช่างคนแรก)
  ✅ [B1-3.1] hotel_create_reservation → ใบจองเกิด (มี code)
  ✅ [B1-3.2] ประเภทห้องไม่มีห้องจริง → ok:false บอกให้เพิ่มห้องก่อน + ไม่แอบสร้างห้อง
  ✅ [B1-4.1] queue_issue_ticket → บัตรคิวเกิดจริง
  ✅ [B1-5.1] shop_confirm_order → ออเดอร์ PAID + เส้นเงินเดิน (PosSale ecom)
  ✅ [B1-6.1] read tools ตอบ JSON ไทยไม่ error

===== QC AI Phase B1 =====
ผ่าน 9/9
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":9,"passed":9,"findings":[]}
```

### 44-qc-crm-c2.7.log (last 15 lines)
```
  ✅ [C2.7-X6.1] hostile money payloads (negative · fractional satang · MAX_SAFE_INTEGER · empty paymentId) are refused without writing anything and never move paidSatang; a well-formed payment of the same invoice is still counted (positive control)
  ✅ [C2.7-X8.1] no name, phone or e-mail of this run appears in any crm.* outbox payload, OpsEvent row (including every WARN the money path writes — ambiguous document, billing note, a failed link after a paid bill) or log line: ids and satang only
  ✅ [C2.7-X8.2] every crm.* event the money path emitted uses the `crm.<type>#<id>#<seq>` key shape (R-C.8) and no key was written twice
  ✅ [C2.7-X9.1] every money mutation leaves an audit row: the automatic payment path audits the deal (actorType SYSTEM) and `linkSaleToDeal` writes `crm.deal.pos.link` for the cashier who pressed it
  ✅ [C2.7-X9.2] the automatic transitions are attributable: auto-WON (paid ≥ value) and auto-invoice write an audit row whose actor is the SYSTEM, never a random user

── U · uiVersion 1 ──
  ✅ [C2.7-U.1] uiVersion 1: a real payment of a v1 shop's invoice leaves the CRM side untouched (no CrmDealPayment, paidSatang 0, lifecycle unchanged) while accounting completes normally and the queue still drains
  ✅ [C2.7-U.3] uiVersion 1: a POS bill of that shop is sold, posted and drained exactly as before C2.7 — and CRM wrote nothing for it (the pilot switch is the only thing that turns the money bridge on)
  ✅ [C2.7-U.2] uiVersion 1: linkSaleToDeal is refused with CrmV2DisabledError and nothing is written · openDealsForParty answers [] · dealForDoc answers null (no v2 surface leaks into a v1 shop)
  ✅ [C2.7-U.4] [positive control] the same shop switched to uiVersion 2 counts the NEXT payment immediately (the gate is read live, not cached) — so U.1's silence is the gate, not a broken fixture. The payment that arrived while the shop was on v1 is NOT counted retroactively (documented semantics — controller decision in the report)
  ✅ [C2.7-CLEAN] the oracle gives the QC database back exactly as found — every throwaway tenant, every row it owned, the throwaway users and the lab triggers are gone

🟢 C2.7: 79/79
JSON_SUMMARY {"total":79,"passed":79,"findings":[]}
```

### 45-qc-crm-c2.9.log (last 15 lines)
```
  ✅ [C2.9-COMPOSE.1] the compose contract of C1.8 on the two EXTENDED consumers: `booking.completed` still resolves with the CRM extra appended (the member-side effects of M2.3/M3.x are untouched — no MemberActivity row disappears) and an event whose ids resolve to nothing at all (ghost appointment) still resolves instead of failing the queue — a failing extra is a WARN, never the main consumer's death

── X8 · PDPA ──
  ✅ [C2.9-X8.1] the SIX new payloads are ids only: no name/phone/e-mail value of this run appears in any of them and no key looks like personal data (`*name*`, `*phone*`, `*email*`, `*address*`) — `shop.order.paid` keeps its own customerName/customerPhone as the shop module's documented debt (R-E.17) and is excluded here
  ✅ [C2.9-X8.2] the clinic event says "a visit happened" and nothing more: no symptom/diagnosis/allergy/drug/fee key in the payload, the symptom text of this run appears nowhere in it, and the CRM activity it creates carries neither the symptom nor any body text (health data must not leak into a sales timeline)
  ✅ [C2.9-X8.3] the CRM side reads by ID only: `crm-bridges/business.ts` never touches `customerName`/`customerPhone` of `shop.order.paid` (nor any other module's name/phone field — it resolves the Party from the row) and no OpsEvent written during this run carries a name/phone/e-mail [static + runtime]

── U · uiVersion 1 · bridgesEnabled ──
  ✅ [C2.9-U.1] uiVersion 1 (R-E.14 · gate first): the business module still works exactly as before — the order is PAID and the event IS emitted (the module does not know about CRM) — but the CRM extra writes nothing: 0 activities, the contact keeps its LEAD stage, and the event resolves (it is not left PENDING)
  ✅ [C2.9-U.2] the kill switch is real: uiVersion 2 with `bridgesEnabled: false` ⇒ the same event still writes nothing (0 activities) and still resolves — the gate is asked before anything is read, so flipping the switch takes effect immediately (no cached answer)
  ✅ [C2.9-U.3] back at uiVersion 2 with the bridges on, the SAME kept event finally writes its one activity and promotes the contact to CUSTOMER — nothing was lost while the shop was on v1 (the rows were kept, R-E.14)
  ✅ [C2.9-CLEAN] the oracle gives the QC database back exactly as found — the fault-injector trigger and function are dropped, every throwaway tenant (8 business transactions, their Parties, CRM rows, outbox events) and the throwaway users are gone

🟢 C2.9: 52/52
JSON_SUMMARY {"total":52,"passed":52,"findings":[]}
```
