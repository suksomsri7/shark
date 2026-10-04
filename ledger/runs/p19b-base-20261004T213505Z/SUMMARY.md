# suites run p19b-base — 20261004T213505Z

| # | step | exit | seconds | summary |
|---|---|---|---|---|
- tree `/root/projects/shark-pos-p11` · branch `wip/pos-p1.9b-oracle` · head `a4bc5d44`
| 1 | install | 0 | 14 |  |
| 2 | qc-pos-p1.9b | 0 | 3 | "total":0,"passed":0,"failed":[] |
| 3 | qc-pos-p1.9b-forced | 1 | 8 | "total":22,"passed":3,"failed":["P1.9b-ST1","P1.9b-ST2","P1.9b-ST3","P1.9b-ST4","P1.9b-ST5","P1.9b-ST6","P1.9b-ST7","P1.9b-RC8","P1.9b-RC9","P1.9b-RC1","P1.9b-R |

### 01-install.log (last 15 lines)
```

. postinstall$ prisma generate
. postinstall: Loaded Prisma config from prisma.config.ts.
. postinstall: Prisma schema loaded from prisma/schema.
. postinstall: ✔ Generated Prisma Client (v7.8.0) to ./node_modules/.pnpm/@prisma+client@7.8.0_prisma@7.8.0_@types+react-dom@19.2.3_@types+react@19.2.17__@types+_12a6afd4e8168cdd815b06207f03ccf9/node_modules/@prisma/client in 7.54s
. postinstall: Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)
. postinstall: Done
╭ Warning ─────────────────────────────────────────────────────────────────────╮
│                                                                              │
│   Ignored build scripts: @parcel/watcher@2.5.6, @swc/core@1.15.43.           │
│   Run "pnpm approve-builds" to pick which dependencies should be allowed     │
│   to run scripts.                                                            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
Done in 13.7s using pnpm v10.33.0
```

### 02-qc-pos-p1.9b.log (last 15 lines)
```
In the next major version (pg-connection-string v3.0.0 and pg v9.0.0), these modes will adopt standard libpq semantics, which have weaker security guarantees.

To prepare for this change:
- If you want the current behavior, explicitly use 'sslmode=verify-full'
- If you want libpq compatibility now, use 'uselibpqcompat=true&sslmode=require'

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.
(Use `node --trace-warnings ...` to show where the warning was created)
⏭️  SKIPPED — qc-pos-p1.9b: ของใบ P1.9b ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง)
   • src/lib/modules/pos/shift.ts ยังไม่มี export recountShift
   • Prisma client ยังไม่มี delegate posShiftRecount (R1)
   • ตาราง PosShiftRecount ขาดคอลัมน์ (client/DB): id,tenantId,unitId,systemId,shiftId,zNumber,expectedCashSatang,countedCashSatang,varianceSatang,countDetail,note,recountedByUserId,idempotencyKey,createdAt
   ข้อมูล: seed ร้านกาแฟ มี · seed ร้านอาหาร มี · ข้อสอบ 22 ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล)
   A5 (อ่านอย่างเดียว) จำนวนแถวร้าน QC POS: {"posqc-coffee-tenant.posSale":6,"posqc-coffee-tenant.posSaleLine":12,"posqc-coffee-tenant.posPayment":6,"posqc-coffee-tenant.posReceiptCounter":2,"posqc-coffee-tenant.outboxEvent":6,"posqc-coffee-tenant.appSystem":5,"posqc-coffee-tenant.appSystemUnit":10,"posqc-coffee-tenant.businessUnit":2,"posqc-coffee-tenant.auditLog":0,"posqc-coffee-tenant.posShift":0,"posqc-coffee-tenant.posCashMovement":0,"posqc-coffee-tenant.posShiftCounter":0,"posqc-coffee-tenant.posShiftRecount":"absent","posqc-coffee-tenant.couponRedemption":0,"posqc-coffee-tenant.pointLedger":0,"posqc-coffee-tenant.receiptSeqSum":7,"posqc-resto-tenant.posSale":0,"posqc-resto-tenant.posSaleLine":0,"posqc-resto-tenant.posPayment":0,"posqc-resto-tenant.posReceiptCounter":0,"posqc-resto-tenant.outboxEvent":0,"posqc-resto-tenant.appSystem":3,"posqc-resto-tenant.appSystemUnit":3,"posqc-resto-tenant.businessUnit":1,"posqc-resto-tenant.auditLog":0,"posqc-resto-tenant.posShift":0,"posqc-resto-tenant.posCashMovement":0,"posqc-resto-tenant.posShiftCounter":0,"posqc-resto-tenant.posShiftRecount":"absent","posqc-resto-tenant.couponRedemption":0,"posqc-resto-tenant.pointLedger":0,"posqc-resto-tenant.receiptSeqSum":0}
JSON_SUMMARY {"suite":"qc-pos-p1.9b","total":0,"passed":0,"failed":[],"skipped":true,"reason":["src/lib/modules/pos/shift.ts ยังไม่มี export recountShift","Prisma client ยังไม่มี delegate posShiftRecount (R1)","ตาราง PosShiftRecount ขาดคอลัมน์ (client/DB): id,tenantId,unitId,systemId,shiftId,zNumber,expectedCashSatang,countedCashSatang,varianceSatang,countDetail,note,recountedByUserId,idempotencyKey,createdAt"],"registered":22,"seed":{"coffee":true,"resto":true},"a5":{"posqc-coffee-tenant.posSale":6,"posqc-coffee-tenant.posSaleLine":12,"posqc-coffee-tenant.posPayment":6,"posqc-coffee-tenant.posReceiptCounter":2,"posqc-coffee-tenant.outboxEvent":6,"posqc-coffee-tenant.appSystem":5,"posqc-coffee-tenant.appSystemUnit":10,"posqc-coffee-tenant.businessUnit":2,"posqc-coffee-tenant.auditLog":0,"posqc-coffee-tenant.posShift":0,"posqc-coffee-tenant.posCashMovement":0,"posqc-coffee-tenant.posShiftCounter":0,"posqc-coffee-tenant.posShiftRecount":"absent","posqc-coffee-tenant.couponRedemption":0,"posqc-coffee-tenant.pointLedger":0,"posqc-coffee-tenant.receiptSeqSum":7,"posqc-resto-tenant.posSale":0,"posqc-resto-tenant.posSaleLine":0,"posqc-resto-tenant.posPayment":0,"posqc-resto-tenant.posReceiptCounter":0,"posqc-resto-tenant.outboxEvent":0,"posqc-resto-tenant.appSystem":3,"posqc-resto-tenant.appSystemUnit":3,"posqc-resto-tenant.businessUnit":1,"posqc-resto-tenant.auditLog":0,"posqc-resto-tenant.posShift":0,"posqc-resto-tenant.posCashMovement":0,"posqc-resto-tenant.posShiftCounter":0,"posqc-resto-tenant.posShiftRecount":"absent","posqc-resto-tenant.couponRedemption":0,"posqc-resto-tenant.pointLedger":0,"posqc-resto-tenant.receiptSeqSum":0}}
```

### 03-qc-pos-p1.9b-forced.log (last 15 lines)
```
  ❌ [P1.9b-RC2] Z แช่แข็ง: แถว PosShift ทุกคอลัมน์ (รวม updatedAt/zReport/counted null/closeKey null) ก่อน = หลังนับ · zReport().report เดิมทุกไบต์ · PosShiftCounter ไม่ขยับ · ไม่มี event ใหม่ของกะ · บิล/การจ่าย/เงินเข้าออกของสาขาไม่เปลี่ยน — expected แถวกะ · Z · ตัวนับ · event · บิล เท่าเดิม | actual ยังนับไม่ได้ (MISSING:recountShift) — ตรวจการแช่แข็งหลังนับไม่ได้
  ❌ [P1.9b-RC3] audit: AuditLog action pos.shift.recount 1 แถวต่อการนับ · targetType PosShift · targetId shiftId · unitId · actorType USER · actorId ผู้นับ · before.status FORCE_CLOSED + expected · after.recountId/countedCashSatang/varianceSatang — expected audit 1 แถว ครบฟิลด์ | actual audit 0 แถว
  ❌ [P1.9b-RC5] เฉพาะกะบังคับปิด: กะ OPEN → SHIFT_NOT_FORCED · กะปิดปกติ (CLOSED) → SHIFT_NOT_FORCED · ไม่มีแถวนับ ไม่มี audit · แถวกะไม่เปลี่ยน — expected OPEN/CLOSED → SHIFT_NOT_FORCED · ไม่มีแถว | actual OPEN MISSING:recountShift · CLOSED MISSING:recountShift
  ❌ [P1.9b-RC4] ทางอ่าน: zReport/xReport กะที่นับแล้ว = report เดิม + recount ข้างกัน (id/counted/variance/by/at) · ไม่ผสานเข้า report · listShifts item.recount ของกะนั้นไม่ null · กะปิดปกติ recount = null (มีคีย์) — expected Z/X = report เดิม + recount ข้างกัน · list item.recount · ปกติ null | actual zReport.recount undefined · xReport.recount undefined · list SA.recount undefined · list SC.recount undefined · zReport กะปิดปกติ recount OK undefined
  ❌ [P1.9b-RC6] สิทธิ์: operate อย่างเดียว (คนเปิดกะเอง) → PERMISSION_DENIED · ขายได้อย่างเดียว → PERMISSION_DENIED · ไม่มีแถว · STAFF ที่มี manage → ok · คนเปิดกะ (operate) อ่าน zReport กะตัวเองเห็น recount — expected operate/sale → DENIED · manage ok · คนเปิดเห็น recount | actual operate (คนเปิด) MISSING:recountShift · sale.create MISSING:recountShift · STAFF manage MISSING:recountShift · คนเปิดอ่าน Z OK recount undefined
  ❌ [P1.9b-RC7] กันซ้ำ: คีย์เดิม payload เดิม → ok duplicated แถวเดิม ไม่มีแถว/audit เพิ่ม · คีย์เดิม payload ต่าง → IDEMPOTENCY_CONFLICT · คีย์ใหม่กับกะที่นับแล้ว → ALREADY_RECOUNTED · แถวเดิมไม่เปลี่ยน · audit ยัง 1 — expected duplicated · CONFLICT · ALREADY_RECOUNTED · 1 แถว 1 audit | actual คีย์เดิม payload เดิม MISSING:recountShift dup undefined · คีย์เดิม payload ต่าง MISSING:recountShift · คีย์ใหม่ MISSING:recountShift · แถวนับ 0 · audit 0
  ❌ [P1.9b-RC10] แข่งนับ (คีย์ต่างกัน): 10 connection × 3 กะ → ok 1 · ALREADY_RECOUNTED 9 · ไม่มีรหัสอื่น · แถวนับ 1 · audit 1 · แถวที่ชนะตรงกับผล ok — expected ok 1 · ALREADY_RECOUNTED 9 · 1 แถว 1 audit ×3 | actual รอบ 1: MISSING:recountShift×10 · รอบ 1: แถว 0 · รอบ 1: audit 0 · รอบ 2: MISSING:recountShift×10 · รอบ 2: แถว 0 · รอบ 2: audit 0 · รอบ 3: MISSING:recountShift×10 · รอบ 3: แถว 0 · รอบ 3: audit 0
  ❌ [P1.9b-RC11] แข่งนับ (คีย์เดียวกัน payload เดียวกัน): 6 connection → ok ทั้งหมด id เดียวกัน · ไม่ duplicated ไม่เกิน 1 · แถวนับ 1 · audit 1 — expected ok ×6 id เดียว · 1 แถว 1 audit | actual รหัส MISSING:recountShift,MISSING:recountShift,MISSING:recountShift,MISSING:recountShift,MISSING:recountShift,MISSING:recountShift · id 0 แบบ · แถว 0 · audit 0
  ❌ [P1.9b-RC12] คำปฏิเสธของ recountShift (SHIFT_NOT_FORCED · ALREADY_RECOUNTED · PERMISSION_DENIED · VALIDATION · NOT_FOUND · IDEMPOTENCY_CONFLICT) = คืน {ok:false, code, message} ไม่ throw · ครบทุกรหัส · message ไม่ว่าง — expected 6 รหัส · คืนไม่ throw · มี message | actual ไม่เคยได้ SHIFT_NOT_FORCED,ALREADY_RECOUNTED,PERMISSION_DENIED,VALIDATION,NOT_FOUND,IDEMPOTENCY_CONFLICT · รหัสอื่น MISSING:recountShift
  ลบแล้ว: {"outbox":19,"audit":0,"recount":0,"recountByShift":0,"move":0,"payment":1,"line":1,"sale":1,"shift":9} · กะ 9 · บิล 1 · สาขา 2 · ระบบ 1
  ✅ [P1.9b-Z1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ · รวม PosShift/PosShiftRecount/AuditLog) ก่อน = หลัง · ผลรวมตัวนับใบเสร็จไม่ขยับ
  ✅ [P1.9b-Z2] QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (AppSystem · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter · PosShift · PosShiftCounter · PosShiftRecount) ทุกคอลัมน์ ก่อน = หลัง

===== qc-pos-p1.9b ===== ผ่าน 3/22 (QC_FORCE)
JSON_SUMMARY {"suite":"qc-pos-p1.9b","total":22,"passed":3,"failed":["P1.9b-ST1","P1.9b-ST2","P1.9b-ST3","P1.9b-ST4","P1.9b-ST5","P1.9b-ST6","P1.9b-ST7","P1.9b-RC8","P1.9b-RC9","P1.9b-RC1","P1.9b-RC2","P1.9b-RC3","P1.9b-RC5","P1.9b-RC4","P1.9b-RC6","P1.9b-RC7","P1.9b-RC10","P1.9b-RC11","P1.9b-RC12"],"skipped":false,"forced":true,"missing":["src/lib/modules/pos/shift.ts ยังไม่มี export recountShift","Prisma client ยังไม่มี delegate posShiftRecount (R1)","ตาราง PosShiftRecount ขาดคอลัมน์ (client/DB): id,tenantId,unitId,systemId,shiftId,zNumber,expectedCashSatang,countedCashSatang,varianceSatang,countDetail,note,recountedByUserId,idempotencyKey,createdAt"],"a5":{"drift":[]}}
```
