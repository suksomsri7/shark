# suites run p19b-r1 — 20261004T214504Z

| # | step | exit | seconds | summary |
|---|---|---|---|---|
- tree `/root/projects/shark-pos-p11` · branch `wip/pos-p1.9b` · head `3490f690`
| 1 | install | 0 | 8 |  |
| 2 | migrate-qc4 | 0 | 2 |  |
| 3 | prisma-generate | 0 | 6 |  |
| 4 | typecheck | 0 | 191 |  |
| 5 | fitness-env | 0 | 10 |  |
| 6 | fitness-noenv | 0 | 8 |  |
| 7 | fitness-pos | 0 | 6 |  |
| 8 | qc-pos-p1.9b-forced | 0 | 11 | "total":22,"passed":22,"failed":[] |
| 9 | qc-pos-p1.9b-forced | 0 | 10 | "total":22,"passed":22,"failed":[] |
| 10 | qc-pos-p1.9b | 0 | 9 | "total":22,"passed":22,"failed":[] |
| 11 | qc-pos-p1.9 | 0 | 19 | "total":53,"passed":53,"failed":[] |
| 12 | qc-pos-p1.3-forced | 0 | 128 | "total":128,"passed":128,"failed":[] |
| 13 | qc-pos-p1.6 | 0 | 41 | "total":48,"passed":48,"failed":[] |
| 14 | qc-pos-p1.5 | 0 | 10 | "total":21,"passed":21,"failed":[] |
| 15 | qc-pos-p1.2 | 1 | 26 | "total":55,"passed":53,"failed":["P1.2-S1","P1.2-S2"] |
| 16 | qc-pos-closeday | 0 | 4 |  |
| 17 | qc-pos-register | 0 | 10 |  |
| 18 | qc-hf-pos-page-authz | 0 | 5 |  |
| 19 | serve-build | 0 | 440 |  |

### 01-install.log (last 15 lines)
```

. postinstall$ prisma generate
. postinstall: Loaded Prisma config from prisma.config.ts.
. postinstall: Prisma schema loaded from prisma/schema.
. postinstall: ✔ Generated Prisma Client (v7.8.0) to ./node_modules/.pnpm/@prisma+client@7.8.0_prisma@7.8.0_@types+react-dom@19.2.3_@types+react@19.2.17__@types+_12a6afd4e8168cdd815b06207f03ccf9/node_modules/@prisma/client in 4.41s
. postinstall: Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)
. postinstall: Done
╭ Warning ─────────────────────────────────────────────────────────────────────╮
│                                                                              │
│   Ignored build scripts: @parcel/watcher@2.5.6, @swc/core@1.15.43.           │
│   Run "pnpm approve-builds" to pick which dependencies should be allowed     │
│   to run scripts.                                                            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
Done in 8.1s using pnpm v10.33.0
```

### 02-migrate-qc4.log (last 15 lines)
```

Prisma schema loaded from prisma/schema.
Datasource "db": PostgreSQL database "neondb", schema "public" at "ep-frosty-lab-aoylqlv8.c-2.ap-southeast-1.aws.neon.tech"

154 migrations found in prisma/migrations

Applying migration `20261125000000_pos_p19b_shift_recount`

The following migration(s) have been applied:

migrations/
  └─ 20261125000000_pos_p19b_shift_recount/
    └─ migration.sql

All migrations have been successfully applied.
```

### 03-prisma-generate.log (last 15 lines)
```
Loaded Prisma config from prisma.config.ts.

Prisma schema loaded from prisma/schema.

✔ Generated Prisma Client (v7.8.0) to ./node_modules/.pnpm/@prisma+client@7.8.0_prisma@7.8.0_@types+react-dom@19.2.3_@types+react@19.2.17__@types+_12a6afd4e8168cdd815b06207f03ccf9/node_modules/@prisma/client in 2.97s

Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)


```

### 04-typecheck.log (last 15 lines)
```

> shark-in-th@0.1.0 typecheck /root/projects/shark-pos-p11
> tsc --noEmit

```

### 05-fitness-env.log (last 15 lines)
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

### 06-fitness-noenv.log (last 15 lines)
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

### 07-fitness-pos.log (last 15 lines)
```

── F15: POS (แคตตาล็อก/ราคาผู้เขียนเดียว · สัญญา createSale · ทะเบียนปุ่ม POS · ข้อความ pos.* สองภาษา) ──
  ✅ [F15.1] แคตตาล็อก/ราคามีผู้เขียนที่เดียว (catalog.ts ∪ baseline ต่อจุดเขียน · หนี้เดิม 1 ไฟล์ 2 จุด) — ตรง (3 ไฟล์ 45 จุด)
  ✅ [F15.2] สัญญา createSale/voidSale/refundSale ใน src/lib/modules/pos/service.ts เข้ากันได้ย้อนหลังกับ scripts/pos-sale-contract.json (ขาเข้า/ขาออก · ทุก overload) — ตรง (createSale/voidSale · 42 ฟิลด์ · ผู้เรียก createSale 15 ไฟล์) · ของใหม่ที่เข้ากันได้ 4: CreateSaleInput.lines[].options?, CreateSaleInput.lines[].components?, CreateSaleInput.lines[].weightGrams?, CreateSaleInput.shiftId? → รัน --update-pos-contract
  ✅ [F15.3a] ปุ่ม POS ที่มี data-testid มีแถวใน scripts/pos-ui-inventory.json ครบ + ไม่มีปุ่มใหม่ที่ไร้ testid (สแกน 58 ไฟล์ · หนี้ไร้ testid 47) — ครบ (testid กดได้ 113 · แถว 112 · ของทะเบียนอื่น 2)
  ✅ [F15.3b] ทุกแถวใน scripts/pos-ui-inventory.json ชี้ testid ที่มีจริง · ไม่ซ้ำ · ฟิลด์ถูกต้อง · baselineDebt ไม่เหลือหนี้ที่ปิดแล้ว (112 แถว) — ตรง
  ✅ [F15.4] ข้อความ pos.* มีครบทั้ง th/en · ไม่ว่าง · ค่าภาษาไทยมีอักษรไทย (ยกเว้นคำสากลใน UNIVERSAL_TOKENS) — ครบ 274 คีย์ (th/pos.json, en/pos.json)
  ✅ [F15.5] ตัวบ่งชี้ผู้เรียกระดับระบบของแคตตาล็อก + backfill ไม่หลุดถึงโค้ดที่รับคำขอ (catalog.ts · สคริปต์ backfill · qc-* · allowlist เท่านั้น) · R4: ห้าม ?? / || / ?: / alias ของตัวบ่งชี้ — สะอาด
  ✅ [F15.7] ประตูเดิมของคลัง/บัญชีแตะ POS ได้เฉพาะ pos/catalog-legacy · pos (CatalogError) · pos/catalog (F2.1 เปิดเส้น inventory→pos / account→pos ให้แค่นี้) — สะอาด
  ✅ [F15.6] src/** ห้าม import จาก scripts/** (static · import() · require · import = require · typeof import()) · baseline 0 จุด — สะอาด (0 จุดตาม baseline)

JSON_SUMMARY {"suite":"fitness-pos","total":8,"passed":8,"findings":[]}
```

### 08-qc-pos-p1.9b-forced.log (last 15 lines)
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

===== qc-pos-p1.9b ===== ผ่าน 22/22 (QC_FORCE)
JSON_SUMMARY {"suite":"qc-pos-p1.9b","total":22,"passed":22,"failed":[],"skipped":false,"forced":true,"missing":[],"a5":{"drift":[]}}
```

### 09-qc-pos-p1.9b-forced.log (last 15 lines)
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

===== qc-pos-p1.9b ===== ผ่าน 22/22 (QC_FORCE)
JSON_SUMMARY {"suite":"qc-pos-p1.9b","total":22,"passed":22,"failed":[],"skipped":false,"forced":true,"missing":[],"a5":{"drift":[]}}
```

### 10-qc-pos-p1.9b.log (last 15 lines)
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

### 11-qc-pos-p1.9.log (last 15 lines)
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

### 12-qc-pos-p1.3-forced.log (last 15 lines)
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

### 13-qc-pos-p1.6.log (last 15 lines)
```

── B oversellPolicy ──
  ✅ [P1.6-B1] BLOCK: เหลือ 2 ขาย 3 → STOCK_INSUFFICIENT ไม่มีบิล สต็อก 2 ไม่มี OUT ตัวนับไม่ขยับ · ขาย 2 → PAID สต็อก 0 OUT 1 แถว (ไม่ตัดซ้ำหลัง commit) · สินค้าไม่นับสต็อกยังขายได้
  ✅ [P1.6-B2] BLOCK ผ่าน createSale รูปแบบเดิม (บรรทัดมี itemId): เหลือ 1 ขาย 2 → STOCK_INSUFFICIENT ไม่มีบิล สต็อก 1
  ✅ [P1.6-B3] BLOCK ชิ้นสุดท้าย 10 connection × 3 รอบ → PAID 1 · STOCK_INSUFFICIENT 9 · สต็อก 0 ไม่ติดลบ · ไม่มีรหัสอื่น (deadlock/BUSY/INTERNAL/THROW)
  ✅ [P1.6-B4] BLOCK สองสินค้าสลับลำดับบรรทัด ([X,Y]/[Y,X]) 10 connection × 3 รอบ (เหลืออย่างละ 5) → PAID 5 · STOCK_INSUFFICIENT 5 · สต็อก 0/0 · ไม่มี deadlock
  ✅ [P1.6-B5] ไม่ตั้งนโยบาย / ALLOW_NEGATIVE → ขายเกินได้เหมือนวันนี้ (PAID · สต็อก −1)
  ✅ [P1.6-R1] คำปฏิเสธใหม่ของหน้าขาย/ตั้งค่า (SPLIT_INVALID · STOCK_INSUFFICIENT · PAYMENT_MISMATCH เงินรับ · VALIDATION หมายเหตุ/ทิป · TIP_ACCOUNT_REQUIRED) = คืน {ok:false, code, message} ไม่ throw
  (ลบ accountLedger ไม่ได้: update or delete on table "AccountLedger" violates RESTRICT setting of foreign key constraint "Accou)
  ลบแล้ว: {"outbox":49,"audit":27,"journal":0,"point":0,"coupon":0,"restaurantOrderItem":1,"restaurantOrder":1,"tableSession":1,"restaurantTable":1,"restaurantZone":1,"kdsStation":1,"restaurantSetting":1,"payment":69,"line":85,"sale":59,"product":14,"productBySystem":0,"invJournal":44,"invItem":13,"counter":5,"accLink":2,"accJournal":0,"accDoc":0,"accSettings":2} · สาขา 6 · ระบบ 6
  ✅ [P1.6-Z1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง · ผลรวมตัวนับใบเสร็จไม่ขยับ
  ✅ [P1.6-Z2] QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · InvItem · AppSystem รวม settings · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter · AccountSettings · AccountSystemLink) ทุกคอลัมน์ ก่อน = หลัง

===== qc-pos-p1.6 ===== ผ่าน 48/48
JSON_SUMMARY {"suite":"qc-pos-p1.6","total":48,"passed":48,"failed":[],"skipped":false,"forced":false,"skippedChecks":{},"missing":[],"a5":{"drift":[]}}
```

### 14-qc-pos-p1.5.log (last 15 lines)
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

### 15-qc-pos-p1.2.log (last 15 lines)
```
  ✅ [P1.2-S.R2.4] [F4] ตัวแปรไม่ตั้งราคาของแม่ชั่ง: soldByWeight false → VALIDATION ไม่มีแถว · true → สร้างได้ · แก้เป็น false → VALIDATION · ตั้งราคาเองแบบต่อชิ้น → สร้างได้

── S.R3 มติ R3 ──
  ✅ [P1.2-S.R3.1] [F7] inventory.createItem (แถวซิงก์ P1.1b) → createProduct({invItemId, parentId}) คืน id แถวเดิม · parentId = แม่ · ราคา/ชื่อตามที่ส่ง · ชื่อย้อนลง InvItem · แถวของ InvItem ยังมีแถวเดียว · ครั้งที่สอง → CONFLICT ไม่เปลี่ยน · ไม่ส่ง parentId → CONFLICT ตามเดิม (แถวไม่เปลี่ยน)
  ✅ [P1.2-R1] คำปฏิเสธใหม่ (OPTIONS_INVALID OPTION_UNAVAILABLE VARIANT_REQUIRED WEIGHT_REQUIRED + OPTIONS_REQUIRED/VALIDATION ของตัวเลือก) = {ok:false, code, message} ไม่ throw

── S.R2 ข้อสถิต (มติ R2) ──
  ✅ [P1.2-S.R2.7] [static · F5] HeldCartNoticeCode มี PERMISSION_DENIED · held-cart probe แยก PERMISSION_DENIED · held.noticeNeedsPermission th+en (en ไม่มีอักษรไทย) และจอใช้คีย์นี้
  ✅ [P1.2-S.R2.8] [static · F1] regVisibleWhere ใน register.ts กรองชุดด้วย RecipeLine (ส่วนประกอบต้องอยู่ในคลังของสาขา)
  ลบแล้ว: {"held":2,"outbox":12,"audit":45,"journal":0,"point":0,"lineOption":9,"payment":12,"line":16,"sale":12,"menuItem":1,"menuCategory":1,"kdsStation":1,"product":32,"productBySystem":0,"choice":23,"group":11,"invJournal":13,"invItem":9,"counter":1} · สาขา 4 · ระบบ 4 · กลุ่ม 11
  ✅ [P1.2-Z1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง · ผลรวมตัวนับใบเสร็จไม่ขยับ
  ✅ [P1.2-Z2] QC4 ลายนิ้วมือ: แถวเดิม (PosProduct PosCategory InvItem AppSystem AppSystemUnit BusinessUnit Membership PosReceiptCounter MenuOptionGroup MenuOptionChoice PosProductOptionGroup RecipeLine) ก่อน = หลัง

===== qc-pos-p1.2 ===== ผ่าน 53/55
JSON_SUMMARY {"suite":"qc-pos-p1.2","total":55,"passed":53,"failed":["P1.2-S1","P1.2-S2"],"skipped":false,"forced":false,"skippedChecks":{},"missing":[],"a5":{"drift":[]}}
```

### 16-qc-pos-closeday.log (last 15 lines)
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

### 17-qc-pos-register.log (last 15 lines)
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

### 19-serve-build.log (last 15 lines)
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
✅ พร้อมใช้งานที่ http://127.0.0.1:3226 (pid 1824443)
```
