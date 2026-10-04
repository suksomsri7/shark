# suites run p117-r3 — 20261004T225504Z

| # | step | exit | seconds | summary |
|---|---|---|---|---|
- tree `/root/projects/shark-pos-p11` · branch `wip/pos-p1.17-r3` · head `12813b8a`
| 1 | install | 0 | 7 |  |
| 2 | typecheck | 0 | 29 |  |
| 3 | fitness-env | 0 | 10 |  |
| 4 | fitness-noenv | 0 | 11 |  |
| 5 | fitness-pos | 0 | 7 |  |
| 6 | qc-pos-p1.3-forced | 0 | 115 | "total":128,"passed":128,"failed":[] |
| 7 | qc-pos-p1.17 | 0 | 8 | "total":35,"passed":35,"failed":[] |
| 8 | qc-pos-p1.6 | 0 | 42 | "total":48,"passed":48,"failed":[] |
| 9 | serve-build | 0 | 472 |  |

### 01-install.log (last 15 lines)
```

. postinstall$ prisma generate
. postinstall: Loaded Prisma config from prisma.config.ts.
. postinstall: Prisma schema loaded from prisma/schema.
. postinstall: ✔ Generated Prisma Client (v7.8.0) to ./node_modules/.pnpm/@prisma+client@7.8.0_prisma@7.8.0_@types+react-dom@19.2.3_@types+react@19.2.17__@types+_12a6afd4e8168cdd815b06207f03ccf9/node_modules/@prisma/client in 3.21s
. postinstall: Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)
. postinstall: Done
╭ Warning ─────────────────────────────────────────────────────────────────────╮
│                                                                              │
│   Ignored build scripts: @parcel/watcher@2.5.6, @swc/core@1.15.43.           │
│   Run "pnpm approve-builds" to pick which dependencies should be allowed     │
│   to run scripts.                                                            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
Done in 6.7s using pnpm v10.33.0
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
  ✅ [F15.3a] ปุ่ม POS ที่มี data-testid มีแถวใน scripts/pos-ui-inventory.json ครบ + ไม่มีปุ่มใหม่ที่ไร้ testid (สแกน 60 ไฟล์ · หนี้ไร้ testid 47)
  ✅ [F15.3b] ทุกแถวใน scripts/pos-ui-inventory.json ชี้ testid ที่มีจริง · ไม่ซ้ำ · ฟิลด์ถูกต้อง · baselineDebt ไม่เหลือหนี้ที่ปิดแล้ว (112 แถว)
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
  ✅ [F15.3a] ปุ่ม POS ที่มี data-testid มีแถวใน scripts/pos-ui-inventory.json ครบ + ไม่มีปุ่มใหม่ที่ไร้ testid (สแกน 60 ไฟล์ · หนี้ไร้ testid 47)
  ✅ [F15.3b] ทุกแถวใน scripts/pos-ui-inventory.json ชี้ testid ที่มีจริง · ไม่ซ้ำ · ฟิลด์ถูกต้อง · baselineDebt ไม่เหลือหนี้ที่ปิดแล้ว (112 แถว)
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
  ✅ [F15.1] แคตตาล็อก/ราคามีผู้เขียนที่เดียว (catalog.ts ∪ baseline ต่อจุดเขียน · หนี้เดิม 1 ไฟล์ 2 จุด) — ตรง (3 ไฟล์ 45 จุด)
  ✅ [F15.2] สัญญา createSale/voidSale/refundSale ใน src/lib/modules/pos/service.ts เข้ากันได้ย้อนหลังกับ scripts/pos-sale-contract.json (ขาเข้า/ขาออก · ทุก overload) — ตรง (createSale/voidSale · 42 ฟิลด์ · ผู้เรียก createSale 15 ไฟล์) · ของใหม่ที่เข้ากันได้ 5: CreateSaleInput.lines[].options?, CreateSaleInput.lines[].components?, CreateSaleInput.lines[].weightGrams?, CreateSaleInput.shiftId?, CreateSaleInput.soldByUserId? → รัน --update-pos-contract
  ✅ [F15.3a] ปุ่ม POS ที่มี data-testid มีแถวใน scripts/pos-ui-inventory.json ครบ + ไม่มีปุ่มใหม่ที่ไร้ testid (สแกน 60 ไฟล์ · หนี้ไร้ testid 47) — ครบ (testid กดได้ 113 · แถว 112 · ของทะเบียนอื่น 2)
  ✅ [F15.3b] ทุกแถวใน scripts/pos-ui-inventory.json ชี้ testid ที่มีจริง · ไม่ซ้ำ · ฟิลด์ถูกต้อง · baselineDebt ไม่เหลือหนี้ที่ปิดแล้ว (112 แถว) — ตรง
  ✅ [F15.4] ข้อความ pos.* มีครบทั้ง th/en · ไม่ว่าง · ค่าภาษาไทยมีอักษรไทย (ยกเว้นคำสากลใน UNIVERSAL_TOKENS) — ครบ 300 คีย์ (th/pos.json, en/pos.json)
  ✅ [F15.5] ตัวบ่งชี้ผู้เรียกระดับระบบของแคตตาล็อก + backfill ไม่หลุดถึงโค้ดที่รับคำขอ (catalog.ts · สคริปต์ backfill · qc-* · allowlist เท่านั้น) · R4: ห้าม ?? / || / ?: / alias ของตัวบ่งชี้ — สะอาด
  ✅ [F15.7] ประตูเดิมของคลัง/บัญชีแตะ POS ได้เฉพาะ pos/catalog-legacy · pos (CatalogError) · pos/catalog (F2.1 เปิดเส้น inventory→pos / account→pos ให้แค่นี้) — สะอาด
  ✅ [F15.6] src/** ห้าม import จาก scripts/** (static · import() · require · import = require · typeof import()) · baseline 0 จุด — สะอาด (0 จุดตาม baseline)

JSON_SUMMARY {"suite":"fitness-pos","total":8,"passed":8,"findings":[]}
```

### 06-qc-pos-p1.3-forced.log (last 15 lines)
```

── S4 แถบสถานะ ──
  ✅ [P1.3-S4.1] registerStatus: unit.name · user.name · roleLabel เป็นภาษาคน (ไม่ใช่ OWNER/STAFF ดิบ) · pendingSyncCount = 0 (ออฟไลน์ P3)
  ✅ [P1.3-S4.2] ยังไม่มีกะ (PosShift ของ P1.9 ยังไม่มี/ไม่เปิด) → shift = null ไม่ throw
  ✅ [P1.3-S4.3] pendingStockCount ('รอตัดสต็อก'): บิลวันนี้ (ตัดวันเวลาไทย +07:00) ที่ตัดสต็อกครบ → 0 · บิลที่ยังไม่ตัด (createSale ใน tx ผู้อื่น) → นับ 1
  ✅ [P1.3-S4.4] registerStatus ข้ามร้าน (unit ร้านอาหาร) → NOT_FOUND · แคชเชียร์สาขาอื่น → NOT_FOUND · สาขาตัวเอง → ok (คู่บวก)
  ✅ [P1.3-S4.5] [Q23] registerStatus.user.role = รหัสบทบาท OWNER · MANAGER · STAFF ตาม actor (roleLabel ภาษาคนยังอยู่ · S4.1)
  ✅ [P1.3-S4.6] [Q25] registerVatConfig(ctx) = {mode, rateBp} เดียวกับ vatMode/vatRateBp ของ quote (สาขา sandbox และสาขาสีลม) · mode ∈ INCLUDED|NONE
  ✅ [P1.3-S4.7] [3.2 ข้อ 11] pendingStockCount: บิล PAID วันนี้ที่บรรทัดผูกสต็อกยังไม่มี movement pos-consume-<sale>-<line> → +1 · ตัดด้วยคีย์นั้นแล้ว → กลับเท่าเดิม
  ลบแล้ว: {"outbox":109,"audit":268,"journal":0,"point":0,"coupon":0,"payment":110,"line":310,"sale":108,"product":537,"productBySystem":0,"category":2,"menuGroup":2,"invJournal":59,"invItem":20,"customer":2,"user":2} · สาขา 3 · ระบบ 4
  ✅ [P1.3-S9.1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง · ตัวนับใบเสร็จสาขาจริงไม่ขยับ
  ✅ [P1.3-S9.2] QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · InvItem · AppSystem รวม settings · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter) ทุกคอลัมน์ ก่อน = หลัง

===== qc-pos-p1.3 ===== ผ่าน 128/128 (QC_FORCE)
JSON_SUMMARY {"suite":"qc-pos-p1.3","total":128,"passed":128,"failed":[],"skipped":false,"forced":true,"skippedChecks":{},"missing":[],"a5":{"drift":[]}}
```

### 07-qc-pos-p1.17.log (last 15 lines)
```
  ✅ [P1.17-V1] ตรวจช่วงวัน: from > to · 2026-9-14 · 2026-02-30 · ตัวเลข · ไม่ส่ง · 93 วัน → VALIDATION (ทุกรายงาน + CSV) · 92 วัน ok · CSV kind ไม่รู้จัก → VALIDATION
  ✅ [P1.17-A1] สิทธิ์: STAFF มีแค่ pos.sale.create → PERMISSION_DENIED ทั้ง 7 รายงาน + CSV (การ์ด ok) · STAFF ไม่มีสิทธิ์ POS → การ์ด PERMISSION_DENIED
  ✅ [P1.17-A2] สาขาจำกัด: STAFF pos.report.view unitAccess [u1] ไม่ส่ง unitId → เห็นแค่ u1 (D1 52,450/3 · D2 4,500/1) · ส่ง unitId u2 → NOT_FOUND · การ์ดเห็น u1 (4,500/1 · กะเปิด 0)
  ✅ [P1.17-I1] ข้ามระบบ: บิลของ POS อีกตัว (u3) ไม่อยู่ในรายงานของ POS นี้ และกลับกัน · systemId ที่เป็นระบบคลัง / ไม่มีจริง / unitId ร้านอื่น → NOT_FOUND
  ✅ [P1.17-I2] ข้ามร้าน: เจ้าของร้าน QC อาหาร (ctx ร้านตัวเอง) กับ systemId ร้านกาแฟ → NOT_FOUND ทั้งรายวัน/ภาษี/CSV/การ์ด
  ✅ [P1.17-SH1] กะในช่วง (วันเปิดกะเวลาไทย): กะปิดของ B = ค่าจาก Z แช่แข็ง (3 บิล 43,450 ทิป 1,000) + คอลัมน์ (ควรมี 72,450 นับ 72,000 ขาด −450 Z#1) · กะเปิดของ A คำนวณสด (0 บิล ควรมี 100,000 นับ null) · กะ 09-16 ไม่อยู่ · รวม ขาด −450 shortCount 1 openCount 1
  ✅ [P1.17-SB1] ทางเขียนผู้ขาย: createSale({…, soldByUserId}) → แถว PosSale.soldByUserId ตรง · ไม่ส่ง = null (ผู้เรียกเดิมไม่กระทบ)
  ✅ [P1.17-SH2] Z แช่แข็งในรายงาน: เปลี่ยนบิล 06:30 ในกะที่ปิดแล้วเป็น VOIDED ใน DB → แถวกะเดิมไม่เปลี่ยน (3/43,450) แต่รายวัน D2 เหลือ 1 บิล 4,500
  ✅ [P1.17-R1] คำปฏิเสธของ reports.ts (VALIDATION · NOT_FOUND · PERMISSION_DENIED) ≥ 12 รายการ = คืน {ok:false, code, message} ไม่ throw
  ลบแล้ว: {"outbox":2,"audit":0,"movementBySale":5,"payment":14,"line":14,"sale":12,"movement":0,"item":2,"shift":3} · บิล 12 · กะ 3 · สาขา 3 · ระบบ 3
  ✅ [P1.17-Z1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ · รวม InvItem/InvMovement/PosShift) ก่อน = หลัง · ผลรวมตัวนับใบเสร็จไม่ขยับ
  ✅ [P1.17-Z2] QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · AppSystem · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter · PosShift · InvItem) ทุกคอลัมน์ ก่อน = หลัง

===== qc-pos-p1.17 ===== ผ่าน 35/35
JSON_SUMMARY {"suite":"qc-pos-p1.17","total":35,"passed":35,"failed":[],"skipped":false,"forced":false,"skippedChecks":{},"missing":[],"a5":{"drift":[]}}
```

### 08-qc-pos-p1.6.log (last 15 lines)
```

── B oversellPolicy ──
  ✅ [P1.6-B1] BLOCK: เหลือ 2 ขาย 3 → STOCK_INSUFFICIENT ไม่มีบิล สต็อก 2 ไม่มี OUT ตัวนับไม่ขยับ · ขาย 2 → PAID สต็อก 0 OUT 1 แถว (ไม่ตัดซ้ำหลัง commit) · สินค้าไม่นับสต็อกยังขายได้
  ✅ [P1.6-B2] BLOCK ผ่าน createSale รูปแบบเดิม (บรรทัดมี itemId): เหลือ 1 ขาย 2 → STOCK_INSUFFICIENT ไม่มีบิล สต็อก 1
  ✅ [P1.6-B3] BLOCK ชิ้นสุดท้าย 10 connection × 3 รอบ → PAID 1 · STOCK_INSUFFICIENT 9 · สต็อก 0 ไม่ติดลบ · ไม่มีรหัสอื่น (deadlock/BUSY/INTERNAL/THROW)
  ✅ [P1.6-B4] BLOCK สองสินค้าสลับลำดับบรรทัด ([X,Y]/[Y,X]) 10 connection × 3 รอบ (เหลืออย่างละ 5) → PAID 5 · STOCK_INSUFFICIENT 5 · สต็อก 0/0 · ไม่มี deadlock
  ✅ [P1.6-B5] ไม่ตั้งนโยบาย / ALLOW_NEGATIVE → ขายเกินได้เหมือนวันนี้ (PAID · สต็อก −1)
  ✅ [P1.6-R1] คำปฏิเสธใหม่ของหน้าขาย/ตั้งค่า (SPLIT_INVALID · STOCK_INSUFFICIENT · PAYMENT_MISMATCH เงินรับ · VALIDATION หมายเหตุ/ทิป · TIP_ACCOUNT_REQUIRED) = คืน {ok:false, code, message} ไม่ throw
  (ลบ accountLedger ไม่ได้: update or delete on table "AccountLedger" violates RESTRICT setting of foreign key constraint "Accou)
  ลบแล้ว: {"outbox":49,"audit":27,"journal":0,"point":0,"coupon":0,"restaurantOrderItem":1,"restaurantOrder":1,"tableSession":1,"restaurantTable":1,"restaurantZone":1,"kdsStation":1,"restaurantSetting":1,"payment":69,"line":85,"sale":59,"product":14,"productBySystem":0,"invJournal":45,"invItem":13,"counter":5,"accLink":2,"accJournal":0,"accDoc":0,"accSettings":2} · สาขา 6 · ระบบ 6
  ✅ [P1.6-Z1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง · ผลรวมตัวนับใบเสร็จไม่ขยับ
  ✅ [P1.6-Z2] QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · InvItem · AppSystem รวม settings · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter · AccountSettings · AccountSystemLink) ทุกคอลัมน์ ก่อน = หลัง

===== qc-pos-p1.6 ===== ผ่าน 48/48
JSON_SUMMARY {"suite":"qc-pos-p1.6","total":48,"passed":48,"failed":[],"skipped":false,"forced":false,"skippedChecks":{},"missing":[],"a5":{"drift":[]}}
```

### 09-serve-build.log (last 15 lines)
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
✅ พร้อมใช้งานที่ http://127.0.0.1:3226 (pid 1887003)
```
