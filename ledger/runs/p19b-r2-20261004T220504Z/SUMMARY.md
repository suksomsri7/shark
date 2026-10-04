# suites run p19b-r2 — 20261004T220504Z

| # | step | exit | seconds | summary |
|---|---|---|---|---|
- tree `/root/projects/shark-pos-p11` · branch `wip/pos-p1.9b-r2` · head `9aaa4caf`
| 1 | install | 0 | 7 |  |
| 2 | typecheck | 0 | 17 |  |
| 3 | fitness-env | 0 | 9 |  |
| 4 | fitness-noenv | 0 | 10 |  |
| 5 | fitness-pos | 0 | 7 |  |
| 6 | qc-pos-p1.9b | 0 | 12 | "total":22,"passed":22,"failed":[] |
| 7 | qc-pos-p1.9 | 0 | 20 | "total":53,"passed":53,"failed":[] |
| 8 | serve-build | 0 | 413 |  |

### 01-install.log (last 15 lines)
```

. postinstall$ prisma generate
. postinstall: Loaded Prisma config from prisma.config.ts.
. postinstall: Prisma schema loaded from prisma/schema.
. postinstall: ✔ Generated Prisma Client (v7.8.0) to ./node_modules/.pnpm/@prisma+client@7.8.0_prisma@7.8.0_@types+react-dom@19.2.3_@types+react@19.2.17__@types+_12a6afd4e8168cdd815b06207f03ccf9/node_modules/@prisma/client in 3.58s
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
  ✅ [F15.3a] ปุ่ม POS ที่มี data-testid มีแถวใน scripts/pos-ui-inventory.json ครบ + ไม่มีปุ่มใหม่ที่ไร้ testid (สแกน 58 ไฟล์ · หนี้ไร้ testid 47)
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
  ✅ [F15.3a] ปุ่ม POS ที่มี data-testid มีแถวใน scripts/pos-ui-inventory.json ครบ + ไม่มีปุ่มใหม่ที่ไร้ testid (สแกน 58 ไฟล์ · หนี้ไร้ testid 47)
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
  ✅ [F15.2] สัญญา createSale/voidSale/refundSale ใน src/lib/modules/pos/service.ts เข้ากันได้ย้อนหลังกับ scripts/pos-sale-contract.json (ขาเข้า/ขาออก · ทุก overload) — ตรง (createSale/voidSale · 42 ฟิลด์ · ผู้เรียก createSale 15 ไฟล์) · ของใหม่ที่เข้ากันได้ 4: CreateSaleInput.lines[].options?, CreateSaleInput.lines[].components?, CreateSaleInput.lines[].weightGrams?, CreateSaleInput.shiftId? → รัน --update-pos-contract
  ✅ [F15.3a] ปุ่ม POS ที่มี data-testid มีแถวใน scripts/pos-ui-inventory.json ครบ + ไม่มีปุ่มใหม่ที่ไร้ testid (สแกน 58 ไฟล์ · หนี้ไร้ testid 47) — ครบ (testid กดได้ 113 · แถว 112 · ของทะเบียนอื่น 2)
  ✅ [F15.3b] ทุกแถวใน scripts/pos-ui-inventory.json ชี้ testid ที่มีจริง · ไม่ซ้ำ · ฟิลด์ถูกต้อง · baselineDebt ไม่เหลือหนี้ที่ปิดแล้ว (112 แถว) — ตรง
  ✅ [F15.4] ข้อความ pos.* มีครบทั้ง th/en · ไม่ว่าง · ค่าภาษาไทยมีอักษรไทย (ยกเว้นคำสากลใน UNIVERSAL_TOKENS) — ครบ 275 คีย์ (th/pos.json, en/pos.json)
  ✅ [F15.5] ตัวบ่งชี้ผู้เรียกระดับระบบของแคตตาล็อก + backfill ไม่หลุดถึงโค้ดที่รับคำขอ (catalog.ts · สคริปต์ backfill · qc-* · allowlist เท่านั้น) · R4: ห้าม ?? / || / ?: / alias ของตัวบ่งชี้ — สะอาด
  ✅ [F15.7] ประตูเดิมของคลัง/บัญชีแตะ POS ได้เฉพาะ pos/catalog-legacy · pos (CatalogError) · pos/catalog (F2.1 เปิดเส้น inventory→pos / account→pos ให้แค่นี้) — สะอาด
  ✅ [F15.6] src/** ห้าม import จาก scripts/** (static · import() · require · import = require · typeof import()) · baseline 0 จุด — สะอาด (0 จุดตาม baseline)

JSON_SUMMARY {"suite":"fitness-pos","total":8,"passed":8,"findings":[]}
```

### 06-qc-pos-p1.9b.log (last 15 lines)
```
  ✅ [P1.9b-RC2] Z แช่แข็ง: แถว PosShift ทุกคอลัมน์ (รวม updatedAt/zReport/counted null/closeKey null) ก่อน = หลังนับ · zReport().report เดิมทุกไบต์ · PosShiftCounter ไม่ขยับ · ไม่มี event ใหม่ของกะ · บิล/การจ่าย/เงินเข้าออกของสาขาไม่เปลี่ยน
  ✅ [P1.9b-RC3] audit: AuditLog action pos.shift.recount 1 แถวต่อการนับ · targetType PosShift · targetId shiftId · unitId · actorType USER · actorId ผู้นับ · before.status FORCE_CLOSED + expected · after.recountId/countedCashSatang/varianceSatang
  ✅ [P1.9b-RC5] เฉพาะกะบังคับปิด: กะ OPEN → SHIFT_NOT_FORCED · กะปิดปกติ (CLOSED) → SHIFT_NOT_FORCED · ไม่มีแถวนับ ไม่มี audit · แถวกะไม่เปลี่ยน
  ✅ [P1.9b-RC4] ทางอ่าน: zReport/xReport กะที่นับแล้ว = report เดิม + recount ข้างกัน (id/counted/variance/by/at) · ไม่ผสานเข้า report · listShifts item.recount ของกะนั้นไม่ null · กะปิดปกติ recount = null (มีคีย์)
  ✅ [P1.9b-RC6] สิทธิ์: operate อย่างเดียว (คนเปิดกะเอง) → PERMISSION_DENIED · ขายได้อย่างเดียว → PERMISSION_DENIED · ไม่มีแถว · STAFF ที่มี manage → ok · คนเปิดกะ (operate) อ่าน zReport กะตัวเองเห็น recount
  ✅ [P1.9b-RC7] กันซ้ำ: คีย์เดิม payload เดิม → ok duplicated แถวเดิม ไม่มีแถว/audit เพิ่ม · คีย์เดิม payload ต่าง → IDEMPOTENCY_CONFLICT · คีย์ใหม่กับกะที่นับแล้ว → ALREADY_RECOUNTED · แถวเดิมไม่เปลี่ยน · audit ยัง 1
  ✅ [P1.9b-RC10] แข่งนับ (คีย์ต่างกัน): 10 connection × 3 กะ → ok 1 · ALREADY_RECOUNTED 9 · ไม่มีรหัสอื่น · แถวนับ 1 · audit 1 · แถวที่ชนะตรงกับผล ok
  ✅ [P1.9b-RC11] แข่งนับ (คีย์เดียวกัน payload เดียวกัน): 6 connection → ok ทั้งหมด id เดียวกัน · ไม่ duplicated ไม่เกิน 1 · แถวนับ 1 · audit 1
  ✅ [P1.9b-RC12] คำปฏิเสธของ recountShift (SHIFT_NOT_FORCED · ALREADY_RECOUNTED · PERMISSION_DENIED · VALIDATION · NOT_FOUND · IDEMPOTENCY_CONFLICT) = คืน {ok:false, code, message} ไม่ throw · ครบทุกรหัส · message ไม่ว่าง
  ลบแล้ว: {"outbox":19,"audit":6,"recount":6,"recountByShift":0,"move":0,"payment":1,"line":1,"sale":1,"shift":9} · กะ 9 · บิล 1 · สาขา 2 · ระบบ 1
  ✅ [P1.9b-Z1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ · รวม PosShift/PosShiftRecount/AuditLog) ก่อน = หลัง · ผลรวมตัวนับใบเสร็จไม่ขยับ
  ✅ [P1.9b-Z2] QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (AppSystem · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter · PosShift · PosShiftCounter · PosShiftRecount) ทุกคอลัมน์ ก่อน = หลัง

===== qc-pos-p1.9b ===== ผ่าน 22/22
JSON_SUMMARY {"suite":"qc-pos-p1.9b","total":22,"passed":22,"failed":[],"skipped":false,"forced":false,"missing":[],"a5":{"drift":[]}}
```

### 07-qc-pos-p1.9.log (last 15 lines)
```
  ✅ [P1.9-I1] ข้ามสาขา: ctx สาขา 2 กับกะของสาขา 1 → xReport/zReport/closeShift/recordCashMovement = NOT_FOUND · createSale สาขา 2 + shiftId กะเปิดของสาขา 1 → SHIFT_REQUIRED · deviceId เดียวกันเปิดที่สาขา 2 ได้ (คนละลิ้นชัก)
  ✅ [P1.9-I2] ข้ามร้าน: เจ้าของร้าน QC อาหาร (ctx ร้านตัวเอง) กับ shiftId ร้านกาแฟ → NOT_FOUND ทั้ง x/z/close/cash · currentShift(deviceId เดียวกัน) = null · listShifts ไม่เห็น
  ✅ [P1.9-P1] STAFF ไม่มี pos.shift.operate → PERMISSION_DENIED ทั้ง open/close/x/cash ไม่มีแถว · แคชเชียร์จริง (สีลม) ที่สาขา sandbox → NOT_FOUND
  ✅ [P1.9-P2] operate ปิดกะของคนอื่น → PERMISSION_DENIED กะยัง OPEN · operate เปิด-ปิดกะของตัวเองได้ · STAFF ที่มี manage ปิดกะของคนอื่นได้
  ✅ [P1.9-E1] event: pos.shift.opened 1 แถวต่อกะ · pos.shift.closed 1 แถวต่อกะที่ปิด (รวมบังคับปิด/แข่ง) · payload มี shiftId zNumber overShortSatang forced · consumers มีทั้งสอง · เล่นซ้ำ 2 ครั้งไม่ throw ไม่มีแถวเพิ่ม
  ✅ [P1.9-D1] คำปฏิเสธของ shift.ts / หน้าขาย (SHIFT_REQUIRED · SHIFT_ALREADY_OPEN · SHIFT_CLOSED · REASON_REQUIRED · DRAWER_INSUFFICIENT · VALIDATION · NOT_FOUND · PERMISSION_DENIED) = คืน {ok:false, code, message} ไม่ throw
  ✅ [P1.9-S.R2.6] R2 F3: STAFF B (operate ไม่มี manage) xReport กะที่ปิดแล้วของ A → PERMISSION_DENIED (zReport เช่นกัน) · กะเปิดของ A จากเครื่องอื่น → PERMISSION_DENIED · กะเปิดของ A ที่เครื่องที่ยืนอยู่ (ctx.deviceId = เครื่องของกะ) → ok (X4) · manage อ่านกะปิดของ A ได้ · B อ่านกะปิดของตัวเองได้
  ✅ [P1.9-S.R2.7] R2 F4: otherSources เปิด · บิล HOTEL ผูกกะ (กะเดียวของสาขา) · ปิดกะ → voidSale บิล HOTEL สำเร็จ (VOIDED) · บิล POS ในกะเดียวกัน → ยัง SHIFT_CLOSED บิลยัง PAID (S11 ของหน้าขายคงเดิม)
  ✅ [P1.9-S.R2.8] R2 F5 (ระดับหน่วย): voidErrorToApi(new PosSaleError("SHIFT_CLOSED")) = ApiError 409 state_conflict + ข้อความไทย/อังกฤษ · PosSaleError อื่น / Error อื่น = ส่งผ่านตัวเดิม · ข้อความ 'บิลนี้ void ไม่ได้' ยัง 409
  ลบแล้ว: {"outbox":64,"audit":3,"move":2,"payment":21,"line":19,"sale":19,"shift":25,"product":3,"productBySystem":0} · กะ 25 · บิล 19 · สาขา 4 · ระบบ 3
  ✅ [P1.9-Z1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ · รวม PosShift/PosCashMovement/PosShiftCounter) ก่อน = หลัง · ผลรวมตัวนับใบเสร็จไม่ขยับ
  ✅ [P1.9-Z2] QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · AppSystem · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter · PosShift) ทุกคอลัมน์ ก่อน = หลัง

===== qc-pos-p1.9 ===== ผ่าน 53/53
JSON_SUMMARY {"suite":"qc-pos-p1.9","total":53,"passed":53,"failed":[],"skipped":false,"forced":false,"skippedChecks":{},"missing":[],"a5":{"drift":[]}}
```

### 08-serve-build.log (last 15 lines)
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
✅ พร้อมใช้งานที่ http://127.0.0.1:3226 (pid 1835736)
```
