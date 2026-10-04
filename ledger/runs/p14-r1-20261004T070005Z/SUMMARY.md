# suites run p14-r1 — 20261004T070005Z

| # | step | exit | seconds | summary |
|---|---|---|---|---|
- tree `/root/projects/shark-pos-p11` · branch `wip/pos-p1.4` · head `7ad61a44`
| 1 | install | 0 | 11 |  |
| 2 | typecheck | 0 | 160 |  |
| 3 | fitness-env | 0 | 11 |  |
| 4 | fitness-noenv | 0 | 10 |  |
| 5 | fitness-pos | 0 | 6 |  |
| 6 | qc-pos-p1.4-forced | 0 | 9 | "total":21,"passed":21,"failed":[] |
| 7 | qc-pos-p1.4-forced | 0 | 7 | "total":21,"passed":21,"failed":[] |
| 8 | qc-pos-p1.4 | 0 | 7 | "total":21,"passed":21,"failed":[] |
| 9 | qc-pos-p1.3-forced | 1 | 97 | "total":128,"passed":127,"failed":["P1.3-S6.1"] |
| 10 | qc-pos-p1.3 | 0 | 108 | "total":127,"passed":127,"failed":[] |
| 11 | qc-pos-p1.1 | 0 | 167 | "total":178,"passed":178,"failed":[] |
| 12 | qc-pos-register | 0 | 11 |  |
| 13 | qc-pos-products | 0 | 5 |  |
| 14 | qc-pos-inventory | 0 | 5 |  |
| 15 | qc-pos-p0.2 | 0 | 4 |  |
| 16 | serve-build | 0 | 499 |  |

### 01-install.log (last 15 lines)
```

. postinstall$ prisma generate
. postinstall: Loaded Prisma config from prisma.config.ts.
. postinstall: Prisma schema loaded from prisma/schema.
. postinstall: ✔ Generated Prisma Client (v7.8.0) to ./node_modules/.pnpm/@prisma+client@7.8.0_prisma@7.8.0_@types+react-dom@19.2.3_@types+react@19.2.17__@types+_12a6afd4e8168cdd815b06207f03ccf9/node_modules/@prisma/client in 4.62s
. postinstall: Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)
. postinstall: Done
╭ Warning ─────────────────────────────────────────────────────────────────────╮
│                                                                              │
│   Ignored build scripts: @parcel/watcher@2.5.6, @swc/core@1.15.43.           │
│   Run "pnpm approve-builds" to pick which dependencies should be allowed     │
│   to run scripts.                                                            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
Done in 10.2s using pnpm v10.33.0
```

### 02-typecheck.log (last 15 lines)
```

> shark-in-th@0.1.0 typecheck /root/projects/shark-pos-p11
> tsc --noEmit

```

### 03-fitness-env.log (last 15 lines)
```
── F15: POS (แคตตาล็อก/ราคาผู้เขียนเดียว · สัญญา createSale · ทะเบียนปุ่ม POS · ข้อความ pos.* สองภาษา) ──
  ✅ [F15.1] แคตตาล็อก/ราคามีผู้เขียนที่เดียว (catalog.ts ∪ baseline ต่อจุดเขียน · หนี้เดิม 1 ไฟล์ 2 จุด)
  ✅ [F15.2] สัญญา createSale/voidSale/refundSale ใน src/lib/modules/pos/service.ts เข้ากันได้ย้อนหลังกับ scripts/pos-sale-contract.json (ขาเข้า/ขาออก · ทุก overload)
  ✅ [F15.3a] ปุ่ม POS ที่มี data-testid มีแถวใน scripts/pos-ui-inventory.json ครบ + ไม่มีปุ่มใหม่ที่ไร้ testid (สแกน 48 ไฟล์ · หนี้ไร้ testid 46)
  ✅ [F15.3b] ทุกแถวใน scripts/pos-ui-inventory.json ชี้ testid ที่มีจริง · ไม่ซ้ำ · ฟิลด์ถูกต้อง · baselineDebt ไม่เหลือหนี้ที่ปิดแล้ว (83 แถว)
  ✅ [F15.4] ข้อความ pos.* มีครบทั้ง th/en · ไม่ว่าง · ค่าภาษาไทยมีอักษรไทย (ยกเว้นคำสากลใน UNIVERSAL_TOKENS)
  ✅ [F15.5] ตัวบ่งชี้ผู้เรียกระดับระบบของแคตตาล็อก + backfill ไม่หลุดถึงโค้ดที่รับคำขอ (catalog.ts · สคริปต์ backfill · qc-* · allowlist เท่านั้น) · R4: ห้าม ?? / || / ?: / alias ของตัวบ่งชี้
  ✅ [F15.7] ประตูเดิมของคลัง/บัญชีแตะ POS ได้เฉพาะ pos/catalog-legacy · pos (CatalogError) · pos/catalog (F2.1 เปิดเส้น inventory→pos / account→pos ให้แค่นี้)
  ✅ [F15.6] src/** ห้าม import จาก scripts/** (static · import() · require · import = require · typeof import()) · baseline 0 จุด

===== FITNESS =====
ผ่าน 41/41
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":41,"passed":41,"findings":[]}
```

### 04-fitness-noenv.log (last 15 lines)
```
── F15: POS (แคตตาล็อก/ราคาผู้เขียนเดียว · สัญญา createSale · ทะเบียนปุ่ม POS · ข้อความ pos.* สองภาษา) ──
  ✅ [F15.1] แคตตาล็อก/ราคามีผู้เขียนที่เดียว (catalog.ts ∪ baseline ต่อจุดเขียน · หนี้เดิม 1 ไฟล์ 2 จุด)
  ✅ [F15.2] สัญญา createSale/voidSale/refundSale ใน src/lib/modules/pos/service.ts เข้ากันได้ย้อนหลังกับ scripts/pos-sale-contract.json (ขาเข้า/ขาออก · ทุก overload)
  ✅ [F15.3a] ปุ่ม POS ที่มี data-testid มีแถวใน scripts/pos-ui-inventory.json ครบ + ไม่มีปุ่มใหม่ที่ไร้ testid (สแกน 48 ไฟล์ · หนี้ไร้ testid 46)
  ✅ [F15.3b] ทุกแถวใน scripts/pos-ui-inventory.json ชี้ testid ที่มีจริง · ไม่ซ้ำ · ฟิลด์ถูกต้อง · baselineDebt ไม่เหลือหนี้ที่ปิดแล้ว (83 แถว)
  ✅ [F15.4] ข้อความ pos.* มีครบทั้ง th/en · ไม่ว่าง · ค่าภาษาไทยมีอักษรไทย (ยกเว้นคำสากลใน UNIVERSAL_TOKENS)
  ✅ [F15.5] ตัวบ่งชี้ผู้เรียกระดับระบบของแคตตาล็อก + backfill ไม่หลุดถึงโค้ดที่รับคำขอ (catalog.ts · สคริปต์ backfill · qc-* · allowlist เท่านั้น) · R4: ห้าม ?? / || / ?: / alias ของตัวบ่งชี้
  ✅ [F15.7] ประตูเดิมของคลัง/บัญชีแตะ POS ได้เฉพาะ pos/catalog-legacy · pos (CatalogError) · pos/catalog (F2.1 เปิดเส้น inventory→pos / account→pos ให้แค่นี้)
  ✅ [F15.6] src/** ห้าม import จาก scripts/** (static · import() · require · import = require · typeof import()) · baseline 0 จุด

===== FITNESS =====
ผ่าน 41/41
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":41,"passed":41,"findings":[]}
```

### 05-fitness-pos.log (last 15 lines)
```

── F15: POS (แคตตาล็อก/ราคาผู้เขียนเดียว · สัญญา createSale · ทะเบียนปุ่ม POS · ข้อความ pos.* สองภาษา) ──
  ✅ [F15.1] แคตตาล็อก/ราคามีผู้เขียนที่เดียว (catalog.ts ∪ baseline ต่อจุดเขียน · หนี้เดิม 1 ไฟล์ 2 จุด) — ตรง (3 ไฟล์ 41 จุด)
  ✅ [F15.2] สัญญา createSale/voidSale/refundSale ใน src/lib/modules/pos/service.ts เข้ากันได้ย้อนหลังกับ scripts/pos-sale-contract.json (ขาเข้า/ขาออก · ทุก overload) — ตรง (createSale/voidSale · 34 ฟิลด์ · ผู้เรียก createSale 15 ไฟล์) · ของใหม่ที่เข้ากันได้ 1: CreateSaleInput.lines[].productId? → รัน --update-pos-contract · ผู้เรียก createSale เปลี่ยน (+1 src/lib/modules/pos/register.ts · −0 ) — อัปเดต snapshot ด้วย --update-pos-contract
  ✅ [F15.3a] ปุ่ม POS ที่มี data-testid มีแถวใน scripts/pos-ui-inventory.json ครบ + ไม่มีปุ่มใหม่ที่ไร้ testid (สแกน 48 ไฟล์ · หนี้ไร้ testid 46) — ครบ (testid กดได้ 84 · แถว 83 · ของทะเบียนอื่น 2)
  ✅ [F15.3b] ทุกแถวใน scripts/pos-ui-inventory.json ชี้ testid ที่มีจริง · ไม่ซ้ำ · ฟิลด์ถูกต้อง · baselineDebt ไม่เหลือหนี้ที่ปิดแล้ว (83 แถว) — ตรง
  ✅ [F15.4] ข้อความ pos.* มีครบทั้ง th/en · ไม่ว่าง · ค่าภาษาไทยมีอักษรไทย (ยกเว้นคำสากลใน UNIVERSAL_TOKENS) — ครบ 176 คีย์ (th/pos.json, en/pos.json)
  ✅ [F15.5] ตัวบ่งชี้ผู้เรียกระดับระบบของแคตตาล็อก + backfill ไม่หลุดถึงโค้ดที่รับคำขอ (catalog.ts · สคริปต์ backfill · qc-* · allowlist เท่านั้น) · R4: ห้าม ?? / || / ?: / alias ของตัวบ่งชี้ — สะอาด
  ✅ [F15.7] ประตูเดิมของคลัง/บัญชีแตะ POS ได้เฉพาะ pos/catalog-legacy · pos (CatalogError) · pos/catalog (F2.1 เปิดเส้น inventory→pos / account→pos ให้แค่นี้) — สะอาด
  ✅ [F15.6] src/** ห้าม import จาก scripts/** (static · import() · require · import = require · typeof import()) · baseline 0 จุด — สะอาด (0 จุดตาม baseline)

JSON_SUMMARY {"suite":"fitness-pos","total":8,"passed":8,"findings":[]}
```

### 06-qc-pos-p1.4-forced.log (last 15 lines)
```
  ✅ [P1.4-S5] ข้อความ pos.register.scan.{chooseTitle notFound addAsCustom ignoredWhileDialog cameraTitle cameraDenied cameraNone} มี th+en ไม่ว่าง · en ไม่มีอักษรไทย · ทุกคีย์ถูกใช้ในโค้ดหน้าขาย

── sandbox qc-p1.4-t26kbr (สาขา 2 + ระบบ POS/คลัง ชั่วคราวในร้าน QC กาแฟ · ระบบ POS ชั่วคราว 1 ตัวในร้าน QC อาหาร) ──
  ✅ [P1.4-K1] บาร์โค้ดเฉพาะตัว (InvItem) → one + สินค้านั้น · สแกนซ้ำได้ตัวเดิม · มีช่องว่างหัวท้ายยังเจอ
  ✅ [P1.4-R3] ทางเซิร์ฟเวอร์ของ +1: cartAddProduct ×2 สินค้าเดียวกัน → cartToQuoteInput → quoteRegisterCart = 1 บรรทัด gross 2×ราคา · ยอด 2×ราคา (ไม่ใช่ 2 บรรทัด)
  ✅ [P1.4-K2] บาร์โค้ดเดียว 4 สินค้า (A B ปกติ · C เก็บถาวร · D ผูกสาขา 2): สาขา 1 → choose = {A,B} ครบ ลำดับคงที่สองครั้ง · สาขา 2 → choose = {A,B,D} · C ไม่โผล่เลย
  ✅ [P1.4-K3] บาร์โค้ดที่มีเฉพาะในร้านอื่น (ร้าน QC อาหาร · ระบบ POS sandbox) → none ที่ร้านกาแฟ (แถวของร้านอื่นมีจริง)
  ✅ [P1.4-K4] สินค้าผูกสาขา 2 (unitId) บาร์โค้ดเฉพาะตัว → สาขา 1 none · สาขา 2 one
  ✅ [P1.4-K5] สินค้าเก็บถาวร: บาร์โค้ดของแถว PosProduct เอง และบาร์โค้ดของ InvItem ที่ผูก → none ทั้งคู่
  ลบแล้ว: {"outbox":0,"audit":14,"product":9,"productBySystem":0,"invItem":6} · สาขา 2 · ระบบ 3
  ✅ [P1.4-Z1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง · ผลรวมตัวนับใบเสร็จไม่ขยับ
  ✅ [P1.4-Z2] QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · InvItem · AppSystem · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter) ทุกคอลัมน์ ก่อน = หลัง

===== qc-pos-p1.4 ===== ผ่าน 21/21 (QC_FORCE)
JSON_SUMMARY {"suite":"qc-pos-p1.4","total":21,"passed":21,"failed":[],"skipped":false,"forced":true,"skippedChecks":{},"missing":[],"o22":"yes","a5":{"drift":[]}}
```

### 07-qc-pos-p1.4-forced.log (last 15 lines)
```
  ✅ [P1.4-S5] ข้อความ pos.register.scan.{chooseTitle notFound addAsCustom ignoredWhileDialog cameraTitle cameraDenied cameraNone} มี th+en ไม่ว่าง · en ไม่มีอักษรไทย · ทุกคีย์ถูกใช้ในโค้ดหน้าขาย

── sandbox qc-p1.4-x10kxl (สาขา 2 + ระบบ POS/คลัง ชั่วคราวในร้าน QC กาแฟ · ระบบ POS ชั่วคราว 1 ตัวในร้าน QC อาหาร) ──
  ✅ [P1.4-K1] บาร์โค้ดเฉพาะตัว (InvItem) → one + สินค้านั้น · สแกนซ้ำได้ตัวเดิม · มีช่องว่างหัวท้ายยังเจอ
  ✅ [P1.4-R3] ทางเซิร์ฟเวอร์ของ +1: cartAddProduct ×2 สินค้าเดียวกัน → cartToQuoteInput → quoteRegisterCart = 1 บรรทัด gross 2×ราคา · ยอด 2×ราคา (ไม่ใช่ 2 บรรทัด)
  ✅ [P1.4-K2] บาร์โค้ดเดียว 4 สินค้า (A B ปกติ · C เก็บถาวร · D ผูกสาขา 2): สาขา 1 → choose = {A,B} ครบ ลำดับคงที่สองครั้ง · สาขา 2 → choose = {A,B,D} · C ไม่โผล่เลย
  ✅ [P1.4-K3] บาร์โค้ดที่มีเฉพาะในร้านอื่น (ร้าน QC อาหาร · ระบบ POS sandbox) → none ที่ร้านกาแฟ (แถวของร้านอื่นมีจริง)
  ✅ [P1.4-K4] สินค้าผูกสาขา 2 (unitId) บาร์โค้ดเฉพาะตัว → สาขา 1 none · สาขา 2 one
  ✅ [P1.4-K5] สินค้าเก็บถาวร: บาร์โค้ดของแถว PosProduct เอง และบาร์โค้ดของ InvItem ที่ผูก → none ทั้งคู่
  ลบแล้ว: {"outbox":0,"audit":14,"product":9,"productBySystem":0,"invItem":6} · สาขา 2 · ระบบ 3
  ✅ [P1.4-Z1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง · ผลรวมตัวนับใบเสร็จไม่ขยับ
  ✅ [P1.4-Z2] QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · InvItem · AppSystem · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter) ทุกคอลัมน์ ก่อน = หลัง

===== qc-pos-p1.4 ===== ผ่าน 21/21 (QC_FORCE)
JSON_SUMMARY {"suite":"qc-pos-p1.4","total":21,"passed":21,"failed":[],"skipped":false,"forced":true,"skippedChecks":{},"missing":[],"o22":"yes","a5":{"drift":[]}}
```

### 08-qc-pos-p1.4.log (last 15 lines)
```
  ✅ [P1.4-S5] ข้อความ pos.register.scan.{chooseTitle notFound addAsCustom ignoredWhileDialog cameraTitle cameraDenied cameraNone} มี th+en ไม่ว่าง · en ไม่มีอักษรไทย · ทุกคีย์ถูกใช้ในโค้ดหน้าขาย

── sandbox qc-p1.4-orr1z4 (สาขา 2 + ระบบ POS/คลัง ชั่วคราวในร้าน QC กาแฟ · ระบบ POS ชั่วคราว 1 ตัวในร้าน QC อาหาร) ──
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

### 09-qc-pos-p1.3-forced.log (last 15 lines)
```

── S4 แถบสถานะ ──
  ✅ [P1.3-S4.1] registerStatus: unit.name · user.name · roleLabel เป็นภาษาคน (ไม่ใช่ OWNER/STAFF ดิบ) · pendingSyncCount = 0 (ออฟไลน์ P3)
  ✅ [P1.3-S4.2] ยังไม่มีกะ (PosShift ของ P1.9 ยังไม่มี/ไม่เปิด) → shift = null ไม่ throw
  ✅ [P1.3-S4.3] pendingStockCount ('รอตัดสต็อก'): บิลวันนี้ (ตัดวันเวลาไทย +07:00) ที่ตัดสต็อกครบ → 0 · บิลที่ยังไม่ตัด (createSale ใน tx ผู้อื่น) → นับ 1
  ✅ [P1.3-S4.4] registerStatus ข้ามร้าน (unit ร้านอาหาร) → NOT_FOUND · แคชเชียร์สาขาอื่น → NOT_FOUND · สาขาตัวเอง → ok (คู่บวก)
  ✅ [P1.3-S4.5] [Q23] registerStatus.user.role = รหัสบทบาท OWNER · MANAGER · STAFF ตาม actor (roleLabel ภาษาคนยังอยู่ · S4.1)
  ✅ [P1.3-S4.6] [Q25] registerVatConfig(ctx) = {mode, rateBp} เดียวกับ vatMode/vatRateBp ของ quote (สาขา sandbox และสาขาสีลม) · mode ∈ INCLUDED|NONE
  ✅ [P1.3-S4.7] [3.2 ข้อ 11] pendingStockCount: บิล PAID วันนี้ที่บรรทัดผูกสต็อกยังไม่มี movement pos-consume-<sale>-<line> → +1 · ตัดด้วยคีย์นั้นแล้ว → กลับเท่าเดิม
  ลบแล้ว: {"outbox":134,"audit":268,"journal":0,"point":0,"coupon":0,"payment":135,"line":335,"sale":133,"product":537,"productBySystem":0,"category":2,"menuGroup":2,"invJournal":85,"invItem":20,"customer":2,"user":2} · สาขา 3 · ระบบ 4
  ✅ [P1.3-S9.1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง · ตัวนับใบเสร็จสาขาจริงไม่ขยับ
  ✅ [P1.3-S9.2] QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · InvItem · AppSystem รวม settings · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter) ทุกคอลัมน์ ก่อน = หลัง

===== qc-pos-p1.3 ===== ผ่าน 127/128 (QC_FORCE)
JSON_SUMMARY {"suite":"qc-pos-p1.3","total":128,"passed":127,"failed":["P1.3-S6.1"],"skipped":false,"forced":true,"skippedChecks":{},"missing":[],"a5":{"drift":[]}}
```

### 10-qc-pos-p1.3.log (last 15 lines)
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

### 11-qc-pos-p1.1.log (last 15 lines)
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
  ℹ️  [R] นับ 310 รายการ · ลายนิ้วมือ 78 แถว · คืน updatedAt: Membership 1
  ✅ [P1.1-R.2] QC4 คืนสภาพ — ลายนิ้วมือ: แถวที่มีอยู่ก่อนรันของร้าน QC POS (แคตตาล็อก · คลัง · บัญชีสินค้า · เมนู · เว็บร้าน · จอง · ระบบ/สาขา · สมาชิกทีม · ตั้งค่า) ทุกคอลัมน์รวม updatedAt ก่อน = หลัง (แถวที่ค่าคืนครบแต่ updatedAt เด้ง → คืน updatedAt ด้วย SQL ตรงก่อนตรวจ · พิมพ์จำนวน) {X5}

===== qc-pos-p1.1 ===== ผ่าน 178/178
JSON_SUMMARY {"suite":"qc-pos-p1.1","total":178,"passed":178,"failed":[],"skipped":null,"catalogue":180,"tag":"qc-p1.1-7496cf","skippedGroups":{},"skippedChecks":{"P1.1-S2.11b":"src/lib/modules/account/service.ts ยังไม่ import แคตตาล็อก (pos/catalog หรือ pos/catalog-legacy) — Part B ทำหลัง CRM merge (brief P1.1b \"Why A / B\")","P1.1-S2.19":"src/lib/modules/account/service.ts ยังไม่ import แคตตาล็อก (pos/catalog หรือ pos/catalog-legacy) — Part B ทำหลัง CRM merge (brief P1.1b \"Why A / B\")"},"force":false,"p11bStarted":true,"partBStarted":false}
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

### 13-qc-pos-products.log (last 15 lines)
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

### 14-qc-pos-inventory.log (last 15 lines)
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

### 15-qc-pos-p0.2.log (last 15 lines)
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

### 16-serve-build.log (last 15 lines)
```
├ ƒ /tenant/rename
├ ƒ /tenant/switch
├ ƒ /terms
├ ƒ /u/[token]
├ ƒ /u/[token]/one-click
└ ƒ /vendor/[token]


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

🚀 start ที่ http://127.0.0.1:3226 (log: /root/projects/shark-pos-p11/.qc-shots/acc-v2/server.log)
✅ พร้อมใช้งานที่ http://127.0.0.1:3226 (pid 1042300)
```
