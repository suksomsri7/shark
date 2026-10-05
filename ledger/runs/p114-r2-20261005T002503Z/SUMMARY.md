# suites run p114-r2 — 20261005T002503Z

| # | step | exit | seconds | summary |
|---|---|---|---|---|
- tree `/root/projects/shark-pos-p11` · branch `wip/pos-p1.14-r2` · head `9a260116`
| 1 | install | 0 | 7 |  |
| 2 | typecheck | 0 | 28 |  |
| 3 | fitness-env | 0 | 10 |  |
| 4 | fitness-noenv | 0 | 10 |  |
| 5 | fitness-pos | 0 | 7 |  |
| 6 | qc-pos-p1.14-forced | 0 | 23 | "total":30,"passed":30,"failed":[] |
| 7 | qc-pos-p1.14 | 0 | 21 | "total":30,"passed":30,"failed":[] |
| 8 | qc-inventory | 0 | 3 |  |
| 9 | qc-hf-inventory-atomic | 0 | 242 |  |
| 10 | qc-pos-p1.3-forced | 0 | 117 | "total":128,"passed":128,"failed":[] |
| 11 | serve-build | 0 | 506 |  |

### 01-install.log (last 15 lines)
```

. postinstall$ prisma generate
. postinstall: Loaded Prisma config from prisma.config.ts.
. postinstall: Prisma schema loaded from prisma/schema.
. postinstall: ✔ Generated Prisma Client (v7.8.0) to ./node_modules/.pnpm/@prisma+client@7.8.0_prisma@7.8.0_@types+react-dom@19.2.3_@types+react@19.2.17__@types+_12a6afd4e8168cdd815b06207f03ccf9/node_modules/@prisma/client in 3.38s
. postinstall: Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)
. postinstall: Done
╭ Warning ─────────────────────────────────────────────────────────────────────╮
│                                                                              │
│   Ignored build scripts: @parcel/watcher@2.5.6, @swc/core@1.15.43.           │
│   Run "pnpm approve-builds" to pick which dependencies should be allowed     │
│   to run scripts.                                                            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
Done in 7.3s using pnpm v10.33.0
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
  ✅ [F15.3a] ปุ่ม POS ที่มี data-testid มีแถวใน scripts/pos-ui-inventory.json ครบ + ไม่มีปุ่มใหม่ที่ไร้ testid (สแกน 62 ไฟล์ · หนี้ไร้ testid 47)
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
  ✅ [F15.3a] ปุ่ม POS ที่มี data-testid มีแถวใน scripts/pos-ui-inventory.json ครบ + ไม่มีปุ่มใหม่ที่ไร้ testid (สแกน 62 ไฟล์ · หนี้ไร้ testid 47)
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
  ✅ [F15.3a] ปุ่ม POS ที่มี data-testid มีแถวใน scripts/pos-ui-inventory.json ครบ + ไม่มีปุ่มใหม่ที่ไร้ testid (สแกน 62 ไฟล์ · หนี้ไร้ testid 47) — ครบ (testid กดได้ 113 · แถว 112 · ของทะเบียนอื่น 2)
  ✅ [F15.3b] ทุกแถวใน scripts/pos-ui-inventory.json ชี้ testid ที่มีจริง · ไม่ซ้ำ · ฟิลด์ถูกต้อง · baselineDebt ไม่เหลือหนี้ที่ปิดแล้ว (112 แถว) — ตรง
  ✅ [F15.4] ข้อความ pos.* มีครบทั้ง th/en · ไม่ว่าง · ค่าภาษาไทยมีอักษรไทย (ยกเว้นคำสากลใน UNIVERSAL_TOKENS) — ครบ 301 คีย์ (th/pos.json, en/pos.json)
  ✅ [F15.5] ตัวบ่งชี้ผู้เรียกระดับระบบของแคตตาล็อก + backfill ไม่หลุดถึงโค้ดที่รับคำขอ (catalog.ts · สคริปต์ backfill · qc-* · allowlist เท่านั้น) · R4: ห้าม ?? / || / ?: / alias ของตัวบ่งชี้ — สะอาด
  ✅ [F15.7] ประตูเดิมของคลัง/บัญชีแตะ POS ได้เฉพาะ pos/catalog-legacy · pos (CatalogError) · pos/catalog (F2.1 เปิดเส้น inventory→pos / account→pos ให้แค่นี้) — สะอาด
  ✅ [F15.6] src/** ห้าม import จาก scripts/** (static · import() · require · import = require · typeof import()) · baseline 0 จุด — สะอาด (0 จุดตาม baseline)

JSON_SUMMARY {"suite":"fitness-pos","total":8,"passed":8,"findings":[]}
```

### 06-qc-pos-p1.14-forced.log (last 15 lines)
```
  ✅ [P1.14-CF5] แข่งยืนยัน 6 connection คีย์ต่างกัน → ok 1 · COUNT_NOT_OPEN 5 · ADJUST ต่อบรรทัด 1 แถว · event 1 · ยอดถูก
  ✅ [P1.14-OC2] เปิดรอบ CATEGORY: บรรทัดเฉพาะหมวดที่เลือก · ตรวจค่า (หมวดของคลังอื่น · CATEGORY ไม่มีหมวด · ALL ส่งหมวด · คีย์แปลก · คีย์ซ้ำสั้น) → VALIDATION ไม่มีแถว
  ✅ [P1.14-CF2] uncounted ZERO: รอบหมวด · ยืนยันแบบ SKIP ทั้งที่ไม่ได้นับ → NOTHING_COUNTED · นับ 1 บรรทัด แล้ว ZERO → บรรทัดที่ไม่นับเป็น 0 (ยอดที่ที่เก็บ = 0) · บรรทัดที่นับตามกติกา R6
  ✅ [P1.14-OC3] 1 รอบ OPEN ต่อที่เก็บ: เปิดซ้ำคีย์ใหม่ → COUNT_ALREADY_OPEN (+countId) · คีย์เดิม → duplicated id เดิม · ที่เก็บอื่นเปิดได้ (countNo +1) · แข่งเปิด 6 connection → ok 1 · COUNT_ALREADY_OPEN 5 · OPEN 1 แถว
  ✅ [P1.14-PM1] สิทธิ์/ขอบเขต: ขายได้อย่างเดียว → PERMISSION_DENIED (เปิด/บันทึก) · คนนับ (pos.stock.count) นับได้ ยืนยัน/ยกเลิกรอบคนอื่นไม่ได้ · STAFF สาขาอื่น → PERMISSION_DENIED · สาขาไม่มีคลัง → NO_INVENTORY · ร้านอื่น/สาขาอื่น → NOT_FOUND · blind: คนนับเห็น snapshot/expected/variance = null · เจ้าของเห็นตัวเลข
  ✅ [P1.14-SH1] รับของจาก POS: IN · key pos-recv-<k> · POS/PosUnit/unitId · ต้นทุนไม่ส่ง = ต้นทุนเฉลี่ยเดิม (ไม่ขยับ) · สแกนบาร์โค้ดได้ · ซ้ำ → duplicated · บริการ → NOT_STOCKED · qty 0 → VALIDATION · ไม่มีสิทธิ์รับ → PERMISSION_DENIED · audit pos.stock.receive 1
  ✅ [P1.14-SH2] โอนจาก POS: TRANSFER คู่ pos-tf-<k>-out/-in · onHand รวมไม่เปลี่ยน · ที่เก็บปลายทาง +qty · ซ้ำ → duplicated · ต้นทาง=ปลายทาง → VALIDATION · ที่เก็บของคลังร้านอื่น → NOT_FOUND · ไม่มีสิทธิ์ → PERMISSION_DENIED
  ✅ [P1.14-SH3] ปรับจาก POS: ADJUST qtyDelta = deltaQty · key pos-adj-<k> · note = เหตุผล · POS/PosUnit · ซ้ำ → duplicated · delta 0 / ไม่มีเหตุผล → VALIDATION · คนนับไม่มีสิทธิ์ adjust → PERMISSION_DENIED · Σ ที่เก็บ = onHand
  ✅ [P1.14-RF1] คำปฏิเสธทุกตัว = {ok:false, code, message} ไม่ throw · code อยู่ใน STOCK_COUNT_REFUSAL_CODES · เห็นครบ 11 รหัสที่ยั่วได้ · message ไม่ว่าง
  ลบแล้ว: {"outbox":5,"audit":19,"entry":21,"line":33,"count":6,"payment":2,"saleLine":2,"sale":2,"movement":29,"locStock":8,"product":8,"item":8} · รอบ 6 · บิล 2 · สินค้า 8 · สาขา 2 · ระบบ 2
  ✅ [P1.14-Z1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง
  ✅ [P1.14-Z2] QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (ระบบ · สาขา · สมาชิก · InvItem · InvLocationStock · InvLocation · PosProduct · PosStockCount*) ทุกคอลัมน์ ก่อน = หลัง

===== qc-pos-p1.14 ===== ผ่าน 30/30 (QC_FORCE)
JSON_SUMMARY {"suite":"qc-pos-p1.14","total":30,"passed":30,"failed":[],"skipped":false,"forced":true,"missing":[],"a5":{"drift":[]}}
```

### 07-qc-pos-p1.14.log (last 15 lines)
```
  ✅ [P1.14-CF5] แข่งยืนยัน 6 connection คีย์ต่างกัน → ok 1 · COUNT_NOT_OPEN 5 · ADJUST ต่อบรรทัด 1 แถว · event 1 · ยอดถูก
  ✅ [P1.14-OC2] เปิดรอบ CATEGORY: บรรทัดเฉพาะหมวดที่เลือก · ตรวจค่า (หมวดของคลังอื่น · CATEGORY ไม่มีหมวด · ALL ส่งหมวด · คีย์แปลก · คีย์ซ้ำสั้น) → VALIDATION ไม่มีแถว
  ✅ [P1.14-CF2] uncounted ZERO: รอบหมวด · ยืนยันแบบ SKIP ทั้งที่ไม่ได้นับ → NOTHING_COUNTED · นับ 1 บรรทัด แล้ว ZERO → บรรทัดที่ไม่นับเป็น 0 (ยอดที่ที่เก็บ = 0) · บรรทัดที่นับตามกติกา R6
  ✅ [P1.14-OC3] 1 รอบ OPEN ต่อที่เก็บ: เปิดซ้ำคีย์ใหม่ → COUNT_ALREADY_OPEN (+countId) · คีย์เดิม → duplicated id เดิม · ที่เก็บอื่นเปิดได้ (countNo +1) · แข่งเปิด 6 connection → ok 1 · COUNT_ALREADY_OPEN 5 · OPEN 1 แถว
  ✅ [P1.14-PM1] สิทธิ์/ขอบเขต: ขายได้อย่างเดียว → PERMISSION_DENIED (เปิด/บันทึก) · คนนับ (pos.stock.count) นับได้ ยืนยัน/ยกเลิกรอบคนอื่นไม่ได้ · STAFF สาขาอื่น → PERMISSION_DENIED · สาขาไม่มีคลัง → NO_INVENTORY · ร้านอื่น/สาขาอื่น → NOT_FOUND · blind: คนนับเห็น snapshot/expected/variance = null · เจ้าของเห็นตัวเลข
  ✅ [P1.14-SH1] รับของจาก POS: IN · key pos-recv-<k> · POS/PosUnit/unitId · ต้นทุนไม่ส่ง = ต้นทุนเฉลี่ยเดิม (ไม่ขยับ) · สแกนบาร์โค้ดได้ · ซ้ำ → duplicated · บริการ → NOT_STOCKED · qty 0 → VALIDATION · ไม่มีสิทธิ์รับ → PERMISSION_DENIED · audit pos.stock.receive 1
  ✅ [P1.14-SH2] โอนจาก POS: TRANSFER คู่ pos-tf-<k>-out/-in · onHand รวมไม่เปลี่ยน · ที่เก็บปลายทาง +qty · ซ้ำ → duplicated · ต้นทาง=ปลายทาง → VALIDATION · ที่เก็บของคลังร้านอื่น → NOT_FOUND · ไม่มีสิทธิ์ → PERMISSION_DENIED
  ✅ [P1.14-SH3] ปรับจาก POS: ADJUST qtyDelta = deltaQty · key pos-adj-<k> · note = เหตุผล · POS/PosUnit · ซ้ำ → duplicated · delta 0 / ไม่มีเหตุผล → VALIDATION · คนนับไม่มีสิทธิ์ adjust → PERMISSION_DENIED · Σ ที่เก็บ = onHand
  ✅ [P1.14-RF1] คำปฏิเสธทุกตัว = {ok:false, code, message} ไม่ throw · code อยู่ใน STOCK_COUNT_REFUSAL_CODES · เห็นครบ 11 รหัสที่ยั่วได้ · message ไม่ว่าง
  ลบแล้ว: {"outbox":5,"audit":19,"entry":21,"line":33,"count":6,"payment":2,"saleLine":2,"sale":2,"movement":29,"locStock":8,"product":8,"item":8} · รอบ 6 · บิล 2 · สินค้า 8 · สาขา 2 · ระบบ 2
  ✅ [P1.14-Z1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง
  ✅ [P1.14-Z2] QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (ระบบ · สาขา · สมาชิก · InvItem · InvLocationStock · InvLocation · PosProduct · PosStockCount*) ทุกคอลัมน์ ก่อน = หลัง

===== qc-pos-p1.14 ===== ผ่าน 30/30
JSON_SUMMARY {"suite":"qc-pos-p1.14","total":30,"passed":30,"failed":[],"skipped":false,"forced":false,"missing":[],"a5":{"drift":[]}}
```

### 08-qc-inventory.log (last 15 lines)
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

### 09-qc-hf-inventory-atomic.log (last 15 lines)
```
  ✅ [AT-24.1] บิลชำระแล้วแต่ตัดสต็อกล้ม ⇒ console.error 1 บรรทัด "[pos] stock cut failed — sale committed without stock movement" + { saleId, itemId, qty, code } เท่านั้น (ได้ 1)
  ✅ [AT-24.2] void บิลแต่คืนสต็อกล้ม ⇒ console.error 1 บรรทัด "[pos] stock restore failed — void committed without stock movement" + { saleId, itemId, qty, code } (ได้ 1)

AT-25 inv-cache-audit: URL prod รูปแบบอื่น ⇒ exit 4 ก่อนต่อฐานข้อมูล · ตรวจ E/F บนร้านทดสอบ
  ✅ [AT-25.1] ด่าน prod ของ audit: ตัวพิมพ์ใหญ่ / percent-encode / host-less + ?host= / PGHOST ⇒ exit 4 ทุกแบบ (ไม่ต่อฐานข้อมูล)
  ✅ [AT-25.2] ร้าน 1 (มี AT-1..AT-24 ที่แข่งกันจริง + ของเสียจงใจ 2 ตัว) ⇒ E 1 · F 1 · A/B/C/D 0 · สินค้าเพี้ยน 2
  ✅ [AT-25.3] ร้าน 2 (ใบปรับต้นทุน · ใบเบิก/คืน · ตัดชุด แข่งกัน) ⇒ ไม่มีสินค้าเพี้ยน (F ไม่เตือนหลอกเมื่อมีใบปรับต้นทุน)
  ✅ [AT-Z] ปิดท้าย: 39 สินค้าทั้งหมด invariant ครบ (ไม่นับ 2 ตัวที่ AT-25 ทำเสียจงใจ)

TIMING per round (wall, 10 parallel): AT-1 1.1/0.8/0.8/0.8/0.8s · AT-2 0.8/0.8/0.7/0.7/0.8s · AT-3 1.1/0.9/0.9/0.9/0.9s · AT-4 1.1/1.1/1.1/1.3/1.7s · AT-5 0.8/0.8/0.8/0.8/0.8s · AT-6 0.3/0.3/0.3/0.3/0.3s · AT-8 1.0/0.9/0.9/0.9/0.9s · AT-9 0.9/0.8/0.8/0.8/0.8s · AT-7 2.9/3.0/2.9/2.9/3.7s · AT-10 0.9/0.9/0.9/0.9/0.9s · AT-12 2.0/2.0/2.0s · AT-13 1.8/1.8/1.8s · AT-14 0.4/0.3/0.3s · AT-15 2.5/2.4/2.5s · AT-16 0.6/0.6/0.6s · AT-17 0.5/0.5/0.3/0.3/0.5/0.5s · AT-19 2.2/2.2/2.2/2.1/2.5s · AT-20 0.5/0.5/0.5s

===== QC HF-INV-1 inventory atomic =====
ผ่าน 143/143
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":143,"passed":143,"findings":[]}
```

### 10-qc-pos-p1.3-forced.log (last 15 lines)
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

### 11-serve-build.log (last 15 lines)
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
✅ พร้อมใช้งานที่ http://127.0.0.1:3226 (pid 1975014)
```
