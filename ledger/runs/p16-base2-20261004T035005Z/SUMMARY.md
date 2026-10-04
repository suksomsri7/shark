# suites run p16-base2 — 20261004T035005Z

| # | step | exit | seconds | summary |
|---|---|---|---|---|
- tree `/root/projects/shark-pos-p11` · branch `wip/pos-p1.6-oracle` · head `e39c8d02`
| 1 | install | 0 | 8 |  |
| 2 | qc-pos-p1.6 | 0 | 3 | "total":0,"passed":0,"failed":[] |
| 3 | qc-pos-p1.6-forced | 1 | 34 | "total":48,"passed":8,"failed":["P1.6-V1","P1.6-V2","P1.6-U4","P1.6-R2","P1.6-R3","P1.6-V3","P1.6-V5","P1.6-T2","P1.6-T3","P1.6-T4","P1.6-T5","P1.6-T6","P1.6-T7 |

### 01-install.log (last 15 lines)
```

. postinstall$ prisma generate
. postinstall: Loaded Prisma config from prisma.config.ts.
. postinstall: Prisma schema loaded from prisma/schema.
. postinstall: ✔ Generated Prisma Client (v7.8.0) to ./node_modules/.pnpm/@prisma+client@7.8.0_prisma@7.8.0_@types+react-dom@19.2.3_@types+react@19.2.17__@types+_12a6afd4e8168cdd815b06207f03ccf9/node_modules/@prisma/client in 3.52s
. postinstall: Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)
. postinstall: Done
╭ Warning ─────────────────────────────────────────────────────────────────────╮
│                                                                              │
│   Ignored build scripts: @parcel/watcher@2.5.6, @swc/core@1.15.43.           │
│   Run "pnpm approve-builds" to pick which dependencies should be allowed     │
│   to run scripts.                                                            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
Done in 7.6s using pnpm v10.33.0
```

### 02-qc-pos-p1.6.log (last 15 lines)
```
   • src/lib/money/vat.ts ยังไม่มี export splitIncludedVat (R1)
   • คอลัมน์ PosSale.note ยังไม่มี (client ✗ · DB ✗)
   • คอลัมน์ PosSale.serviceChargeSatang ยังไม่มี (client ✗ · DB ✗)
   • คอลัมน์ PosSale.tipSatang ยังไม่มี (client ✗ · DB ✗)
   • คอลัมน์ PosSaleLine.note ยังไม่มี (client ✗ · DB ✗)
   • คอลัมน์ PosPayment.tenderedSatang ยังไม่มี (client ✗ · DB ✗) (R3 · มติ §8 ข้อ 2)
   • คอลัมน์ PosPayment.changeSatang ยังไม่มี (client ✗ · DB ✗) (R3 · มติ §8 ข้อ 2)
   • enum PosPayType ยังไม่มี CARD (client ✗ · DB ✗)
   • REGISTER_PAY_TYPES ยังไม่รวม TRANSFER/CARD (R2)
   • service.ts ยังไม่มีการ์ด UNIT_SYSTEM_MISMATCH (R7)
   • ยังไม่มีโค้ดใน src/ อ่าน settings.pos.stock.oversellPolicy (R8)
   • src/lib/modules/pos/payment-settings.ts ยังไม่มี export updatePosPaymentSettings/posPaymentSettings (O19/O20)
   ข้อมูล: seed ร้านกาแฟ มี · seed ร้านอาหาร มี · ข้อสอบ 48 ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล)
   A5 (อ่านอย่างเดียว) จำนวนแถวร้าน QC POS: {"posqc-coffee-tenant.posSale":6,"posqc-coffee-tenant.posSaleLine":12,"posqc-coffee-tenant.posPayment":6,"posqc-coffee-tenant.posReceiptCounter":2,"posqc-coffee-tenant.outboxEvent":6,"posqc-coffee-tenant.invItem":7,"posqc-coffee-tenant.invMovement":2,"posqc-coffee-tenant.invLocationStock":2,"posqc-coffee-tenant.appSystem":5,"posqc-coffee-tenant.appSystemUnit":10,"posqc-coffee-tenant.businessUnit":2,"posqc-coffee-tenant.auditLog":0,"posqc-coffee-tenant.accountJournalEntry":8,"posqc-coffee-tenant.pointLedger":0,"posqc-coffee-tenant.customer":1,"posqc-coffee-tenant.couponRedemption":0,"posqc-coffee-tenant.posProduct":7,"posqc-coffee-tenant.posCategory":0,"posqc-coffee-tenant.recipeLine":0,"posqc-coffee-tenant.accountSettings":0,"posqc-coffee-tenant.accountSystemLink":1,"posqc-coffee-tenant.accountDocument":6,"posqc-coffee-tenant.restaurantSetting":0,"posqc-coffee-tenant.restaurantZone":0,"posqc-coffee-tenant.restaurantTable":0,"posqc-coffee-tenant.tableSession":0,"posqc-coffee-tenant.restaurantOrder":0,"posqc-coffee-tenant.restaurantOrderItem":0,"posqc-coffee-tenant.kdsStation":0,"posqc-coffee-tenant.receiptSeqSum":7,"posqc-resto-tenant.posSale":0,"posqc-resto-tenant.posSaleLine":0,"posqc-resto-tenant.posPayment":0,"posqc-resto-tenant.posReceiptCounter":0,"posqc-resto-tenant.outboxEvent":0,"posqc-resto-tenant.invItem":2,"posqc-resto-tenant.invMovement":1,"posqc-resto-tenant.invLocationStock":1,"posqc-resto-tenant.appSystem":3,"posqc-resto-tenant.appSystemUnit":3,"posqc-resto-tenant.businessUnit":1,"posqc-resto-tenant.auditLog":0,"posqc-resto-tenant.accountJournalEntry":1,"posqc-resto-tenant.pointLedger":0,"posqc-resto-tenant.customer":0,"posqc-resto-tenant.couponRedemption":0,"posqc-resto-tenant.posProduct":6,"posqc-resto-tenant.posCategory":3,"posqc-resto-tenant.recipeLine":0,"posqc-resto-tenant.accountSettings":0,"posqc-resto-tenant.accountSystemLink":1,"posqc-resto-tenant.accountDocument":0,"posqc-resto-tenant.restaurantSetting":1,"posqc-resto-tenant.restaurantZone":0,"posqc-resto-tenant.restaurantTable":0,"posqc-resto-tenant.tableSession":0,"posqc-resto-tenant.restaurantOrder":0,"posqc-resto-tenant.restaurantOrderItem":0,"posqc-resto-tenant.kdsStation":2,"posqc-resto-tenant.receiptSeqSum":0}
JSON_SUMMARY {"suite":"qc-pos-p1.6","total":0,"passed":0,"failed":[],"skipped":true,"reason":["src/lib/money/vat.ts ยังไม่มี export splitIncludedVat (R1)","คอลัมน์ PosSale.note ยังไม่มี (client ✗ · DB ✗)","คอลัมน์ PosSale.serviceChargeSatang ยังไม่มี (client ✗ · DB ✗)","คอลัมน์ PosSale.tipSatang ยังไม่มี (client ✗ · DB ✗)","คอลัมน์ PosSaleLine.note ยังไม่มี (client ✗ · DB ✗)","คอลัมน์ PosPayment.tenderedSatang ยังไม่มี (client ✗ · DB ✗) (R3 · มติ §8 ข้อ 2)","คอลัมน์ PosPayment.changeSatang ยังไม่มี (client ✗ · DB ✗) (R3 · มติ §8 ข้อ 2)","enum PosPayType ยังไม่มี CARD (client ✗ · DB ✗)","REGISTER_PAY_TYPES ยังไม่รวม TRANSFER/CARD (R2)","service.ts ยังไม่มีการ์ด UNIT_SYSTEM_MISMATCH (R7)","ยังไม่มีโค้ดใน src/ อ่าน settings.pos.stock.oversellPolicy (R8)","src/lib/modules/pos/payment-settings.ts ยังไม่มี export updatePosPaymentSettings/posPaymentSettings (O19/O20)"],"registered":48,"seed":{"coffee":true,"resto":true},"a5":{"posqc-coffee-tenant.posSale":6,"posqc-coffee-tenant.posSaleLine":12,"posqc-coffee-tenant.posPayment":6,"posqc-coffee-tenant.posReceiptCounter":2,"posqc-coffee-tenant.outboxEvent":6,"posqc-coffee-tenant.invItem":7,"posqc-coffee-tenant.invMovement":2,"posqc-coffee-tenant.invLocationStock":2,"posqc-coffee-tenant.appSystem":5,"posqc-coffee-tenant.appSystemUnit":10,"posqc-coffee-tenant.businessUnit":2,"posqc-coffee-tenant.auditLog":0,"posqc-coffee-tenant.accountJournalEntry":8,"posqc-coffee-tenant.pointLedger":0,"posqc-coffee-tenant.customer":1,"posqc-coffee-tenant.couponRedemption":0,"posqc-coffee-tenant.posProduct":7,"posqc-coffee-tenant.posCategory":0,"posqc-coffee-tenant.recipeLine":0,"posqc-coffee-tenant.accountSettings":0,"posqc-coffee-tenant.accountSystemLink":1,"posqc-coffee-tenant.accountDocument":6,"posqc-coffee-tenant.restaurantSetting":0,"posqc-coffee-tenant.restaurantZone":0,"posqc-coffee-tenant.restaurantTable":0,"posqc-coffee-tenant.tableSession":0,"posqc-coffee-tenant.restaurantOrder":0,"posqc-coffee-tenant.restaurantOrderItem":0,"posqc-coffee-tenant.kdsStation":0,"posqc-coffee-tenant.receiptSeqSum":7,"posqc-resto-tenant.posSale":0,"posqc-resto-tenant.posSaleLine":0,"posqc-resto-tenant.posPayment":0,"posqc-resto-tenant.posReceiptCounter":0,"posqc-resto-tenant.outboxEvent":0,"posqc-resto-tenant.invItem":2,"posqc-resto-tenant.invMovement":1,"posqc-resto-tenant.invLocationStock":1,"posqc-resto-tenant.appSystem":3,"posqc-resto-tenant.appSystemUnit":3,"posqc-resto-tenant.businessUnit":1,"posqc-resto-tenant.auditLog":0,"posqc-resto-tenant.accountJournalEntry":1,"posqc-resto-tenant.pointLedger":0,"posqc-resto-tenant.customer":0,"posqc-resto-tenant.couponRedemption":0,"posqc-resto-tenant.posProduct":6,"posqc-resto-tenant.posCategory":3,"posqc-resto-tenant.recipeLine":0,"posqc-resto-tenant.accountSettings":0,"posqc-resto-tenant.accountSystemLink":1,"posqc-resto-tenant.accountDocument":0,"posqc-resto-tenant.restaurantSetting":1,"posqc-resto-tenant.restaurantZone":0,"posqc-resto-tenant.restaurantTable":0,"posqc-resto-tenant.tableSession":0,"posqc-resto-tenant.restaurantOrder":0,"posqc-resto-tenant.restaurantOrderItem":0,"posqc-resto-tenant.kdsStation":2,"posqc-resto-tenant.receiptSeqSum":0}}
```

### 03-qc-pos-p1.6-forced.log (last 15 lines)
```

── B oversellPolicy ──
  ❌ [P1.6-B1] BLOCK: เหลือ 2 ขาย 3 → STOCK_INSUFFICIENT ไม่มีบิล สต็อก 2 ไม่มี OUT ตัวนับไม่ขยับ · ขาย 2 → PAID สต็อก 0 OUT 1 แถว (ไม่ตัดซ้ำหลัง commit) · สินค้าไม่นับสต็อกยังขายได้ — expected ขาย 3 STOCK_INSUFFICIENT (สต็อก 2 · OUT 0 · ตัวนับเดิม) · ขาย 2 PAID สต็อก 0 OUT 1 · ไม่นับสต็อก PAID | actual OK oh -1 out 1 ตัวนับ 17→18 · OK oh -3 out 1 · untracked OK
  ❌ [P1.6-B2] BLOCK ผ่าน createSale รูปแบบเดิม (บรรทัดมี itemId): เหลือ 1 ขาย 2 → STOCK_INSUFFICIENT ไม่มีบิล สต็อก 1 — expected STOCK_INSUFFICIENT · ไม่มีบิล · สต็อก 1 | actual OK oh -1
  ❌ [P1.6-B3] BLOCK ชิ้นสุดท้าย 10 connection × 3 รอบ → PAID 1 · STOCK_INSUFFICIENT 9 · สต็อก 0 ไม่ติดลบ · ไม่มีรหัสอื่น (deadlock/BUSY/INTERNAL/THROW) — expected ทุกรอบ PAID 1 · SI 9 · สต็อก 0 · บิล 1 · ไม่มีรหัสอื่น | actual r0: PAID 10 SI 0 oh -9 บิล 10 ; r1: PAID 10 SI 0 oh -9 บิล 10 ; r2: PAID 10 SI 0 oh -9 บิล 10
  ❌ [P1.6-B4] BLOCK สองสินค้าสลับลำดับบรรทัด ([X,Y]/[Y,X]) 10 connection × 3 รอบ (เหลืออย่างละ 5) → PAID 5 · STOCK_INSUFFICIENT 5 · สต็อก 0/0 · ไม่มี deadlock — expected ทุกรอบ PAID 5 · SI 5 · สต็อก 0/0 · ไม่มี deadlock | actual r0: PAID 10 SI 0 oh -5/-5 ; r1: PAID 10 SI 0 oh -5/-5 ; r2: PAID 10 SI 0 oh -5/-5
  ✅ [P1.6-B5] ไม่ตั้งนโยบาย / ALLOW_NEGATIVE → ขายเกินได้เหมือนวันนี้ (PAID · สต็อก −1)
  ❌ [P1.6-R1] คำปฏิเสธใหม่ของหน้าขาย/ตั้งค่า (SPLIT_INVALID · STOCK_INSUFFICIENT · PAYMENT_MISMATCH เงินรับ · VALIDATION หมายเหตุ/ทิป · TIP_ACCOUNT_REQUIRED) = คืน {ok:false, code, message} ไม่ throw — expected 8 คำปฏิเสธ = {ok:false, code, message} ไม่ throw | actual T3 11 รายการ:VALIDATION · K4 เปิดทิปไม่มีบัญชี:MISSING:updatePosPaymentSettings · K4 บัญชีสมุดอื่น:MISSING:updatePosPaymentSettings · K9 POS ไม่ผูกสมุด:MISSING:updatePosPaymentSettings · B1 BLOCK:OK
  (ลบ accountLedger ไม่ได้: update or delete on table "AccountLedger" violates RESTRICT setting of foreign key constraint "Accou)
  ลบแล้ว: {"outbox":88,"audit":27,"journal":0,"point":0,"coupon":0,"restaurantOrderItem":1,"restaurantOrder":1,"tableSession":1,"restaurantTable":1,"restaurantZone":1,"kdsStation":1,"restaurantSetting":1,"payment":96,"line":139,"sale":98,"product":14,"productBySystem":0,"invJournal":90,"invItem":13,"counter":6,"accLink":2,"accJournal":0,"accDoc":0,"accSettings":2} · สาขา 6 · ระบบ 6
  ✅ [P1.6-Z1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง · ผลรวมตัวนับใบเสร็จไม่ขยับ
  ✅ [P1.6-Z2] QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · InvItem · AppSystem รวม settings · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter · AccountSettings · AccountSystemLink) ทุกคอลัมน์ ก่อน = หลัง

===== qc-pos-p1.6 ===== ผ่าน 8/48 (QC_FORCE)
JSON_SUMMARY {"suite":"qc-pos-p1.6","total":48,"passed":8,"failed":["P1.6-V1","P1.6-V2","P1.6-U4","P1.6-R2","P1.6-R3","P1.6-V3","P1.6-V5","P1.6-T2","P1.6-T3","P1.6-T4","P1.6-T5","P1.6-T6","P1.6-T7","P1.6-C1","P1.6-C2","P1.6-C3","P1.6-K1","P1.6-K2","P1.6-K3","P1.6-K4","P1.6-K9","P1.6-K5","P1.6-K6","P1.6-K7","P1.6-K8","P1.6-N1","P1.6-N2","P1.6-I1","P1.6-I2","P1.6-I3","P1.6-I4","P1.6-I6","P1.6-I7","P1.6-U1","P1.6-U2","P1.6-B1","P1.6-B2","P1.6-B3","P1.6-B4","P1.6-R1"],"skipped":false,"forced":true,"skippedChecks":{},"missing":["src/lib/money/vat.ts ยังไม่มี export splitIncludedVat (R1)","คอลัมน์ PosSale.note ยังไม่มี (client ✗ · DB ✗)","คอลัมน์ PosSale.serviceChargeSatang ยังไม่มี (client ✗ · DB ✗)","คอลัมน์ PosSale.tipSatang ยังไม่มี (client ✗ · DB ✗)","คอลัมน์ PosSaleLine.note ยังไม่มี (client ✗ · DB ✗)","คอลัมน์ PosPayment.tenderedSatang ยังไม่มี (client ✗ · DB ✗) (R3 · มติ §8 ข้อ 2)","คอลัมน์ PosPayment.changeSatang ยังไม่มี (client ✗ · DB ✗) (R3 · มติ §8 ข้อ 2)","enum PosPayType ยังไม่มี CARD (client ✗ · DB ✗)","REGISTER_PAY_TYPES ยังไม่รวม TRANSFER/CARD (R2)","service.ts ยังไม่มีการ์ด UNIT_SYSTEM_MISMATCH (R7)","ยังไม่มีโค้ดใน src/ อ่าน settings.pos.stock.oversellPolicy (R8)","src/lib/modules/pos/payment-settings.ts ยังไม่มี export updatePosPaymentSettings/posPaymentSettings (O19/O20)"],"a5":{"drift":[]}}
```
