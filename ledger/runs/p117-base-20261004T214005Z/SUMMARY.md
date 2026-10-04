# suites run p117-base — 20261004T214005Z

| # | step | exit | seconds | summary |
|---|---|---|---|---|
- tree `/root/projects/shark-pos-p11` · branch `wip/pos-p1.17-oracle` · head `117dae49`
| 1 | install | 0 | 9 |  |
| 2 | qc-pos-p1.17 | 0 | 2 | "total":0,"passed":0,"failed":[] |
| 3 | qc-pos-p1.17-forced | 1 | 6 | "total":35,"passed":3,"failed":["P1.17-ST1","P1.17-ST2","P1.17-ST3","P1.17-ST4","P1.17-ST5","P1.17-ST6","P1.17-D1","P1.17-D2","P1.17-D3","P1.17-D4","P1.17-PR1", |

### 01-install.log (last 15 lines)
```
. postinstall: │  Run the following to update                            │
. postinstall: │    npm i --save-dev prisma@latest                       │
. postinstall: │    npm i @prisma/client@latest                          │
. postinstall: └─────────────────────────────────────────────────────────┘
. postinstall: ✔ Generated Prisma Client (v7.8.0) to ./node_modules/.pnpm/@prisma+client@7.8.0_prisma@7.8.0_@types+react-dom@19.2.3_@types+react@19.2.17__@types+_12a6afd4e8168cdd815b06207f03ccf9/node_modules/@prisma/client in 5.89s
. postinstall: Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)
. postinstall: Done
╭ Warning ─────────────────────────────────────────────────────────────────────╮
│                                                                              │
│   Ignored build scripts: @parcel/watcher@2.5.6, @swc/core@1.15.43.           │
│   Run "pnpm approve-builds" to pick which dependencies should be allowed     │
│   to run scripts.                                                            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
Done in 9.3s using pnpm v10.33.0
```

### 02-qc-pos-p1.17.log (last 15 lines)
```
(Use `node --trace-warnings ...` to show where the warning was created)
⏭️  SKIPPED — qc-pos-p1.17: ของใบ P1.17 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง)
   • src/lib/modules/pos/reports.ts ยังไม่มี export reportDailySales
   • src/lib/modules/pos/reports.ts ยังไม่มี export reportProducts
   • src/lib/modules/pos/reports.ts ยังไม่มี export reportStaff
   • src/lib/modules/pos/reports.ts ยังไม่มี export reportPayments
   • src/lib/modules/pos/reports.ts ยังไม่มี export reportMargin
   • src/lib/modules/pos/reports.ts ยังไม่มี export reportShifts
   • src/lib/modules/pos/reports.ts ยังไม่มี export reportTax
   • src/lib/modules/pos/reports.ts ยังไม่มี export reportCsv
   • src/lib/modules/pos/reports.ts ยังไม่มี export posDashboardCard
   • PosSale.soldByUserId ยังไม่มี (client/DB · R6)
   ข้อมูล: seed ร้านกาแฟ มี · seed ร้านอาหาร มี · ข้อสอบ 35 ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล)
   A5 (อ่านอย่างเดียว) จำนวนแถวร้าน QC POS: {"posqc-coffee-tenant.posSale":6,"posqc-coffee-tenant.posSaleLine":12,"posqc-coffee-tenant.posPayment":6,"posqc-coffee-tenant.posReceiptCounter":2,"posqc-coffee-tenant.outboxEvent":6,"posqc-coffee-tenant.appSystem":5,"posqc-coffee-tenant.appSystemUnit":10,"posqc-coffee-tenant.businessUnit":2,"posqc-coffee-tenant.auditLog":0,"posqc-coffee-tenant.posShift":0,"posqc-coffee-tenant.posCashMovement":0,"posqc-coffee-tenant.posShiftCounter":0,"posqc-coffee-tenant.invItem":7,"posqc-coffee-tenant.invMovement":2,"posqc-coffee-tenant.couponRedemption":0,"posqc-coffee-tenant.pointLedger":0,"posqc-coffee-tenant.receiptSeqSum":7,"posqc-resto-tenant.posSale":0,"posqc-resto-tenant.posSaleLine":0,"posqc-resto-tenant.posPayment":0,"posqc-resto-tenant.posReceiptCounter":0,"posqc-resto-tenant.outboxEvent":0,"posqc-resto-tenant.appSystem":3,"posqc-resto-tenant.appSystemUnit":3,"posqc-resto-tenant.businessUnit":1,"posqc-resto-tenant.auditLog":0,"posqc-resto-tenant.posShift":0,"posqc-resto-tenant.posCashMovement":0,"posqc-resto-tenant.posShiftCounter":0,"posqc-resto-tenant.invItem":2,"posqc-resto-tenant.invMovement":1,"posqc-resto-tenant.couponRedemption":0,"posqc-resto-tenant.pointLedger":0,"posqc-resto-tenant.receiptSeqSum":0}
JSON_SUMMARY {"suite":"qc-pos-p1.17","total":0,"passed":0,"failed":[],"skipped":true,"reason":["src/lib/modules/pos/reports.ts ยังไม่มี export reportDailySales","src/lib/modules/pos/reports.ts ยังไม่มี export reportProducts","src/lib/modules/pos/reports.ts ยังไม่มี export reportStaff","src/lib/modules/pos/reports.ts ยังไม่มี export reportPayments","src/lib/modules/pos/reports.ts ยังไม่มี export reportMargin","src/lib/modules/pos/reports.ts ยังไม่มี export reportShifts","src/lib/modules/pos/reports.ts ยังไม่มี export reportTax","src/lib/modules/pos/reports.ts ยังไม่มี export reportCsv","src/lib/modules/pos/reports.ts ยังไม่มี export posDashboardCard","PosSale.soldByUserId ยังไม่มี (client/DB · R6)"],"registered":35,"seed":{"coffee":true,"resto":true},"a5":{"posqc-coffee-tenant.posSale":6,"posqc-coffee-tenant.posSaleLine":12,"posqc-coffee-tenant.posPayment":6,"posqc-coffee-tenant.posReceiptCounter":2,"posqc-coffee-tenant.outboxEvent":6,"posqc-coffee-tenant.appSystem":5,"posqc-coffee-tenant.appSystemUnit":10,"posqc-coffee-tenant.businessUnit":2,"posqc-coffee-tenant.auditLog":0,"posqc-coffee-tenant.posShift":0,"posqc-coffee-tenant.posCashMovement":0,"posqc-coffee-tenant.posShiftCounter":0,"posqc-coffee-tenant.invItem":7,"posqc-coffee-tenant.invMovement":2,"posqc-coffee-tenant.couponRedemption":0,"posqc-coffee-tenant.pointLedger":0,"posqc-coffee-tenant.receiptSeqSum":7,"posqc-resto-tenant.posSale":0,"posqc-resto-tenant.posSaleLine":0,"posqc-resto-tenant.posPayment":0,"posqc-resto-tenant.posReceiptCounter":0,"posqc-resto-tenant.outboxEvent":0,"posqc-resto-tenant.appSystem":3,"posqc-resto-tenant.appSystemUnit":3,"posqc-resto-tenant.businessUnit":1,"posqc-resto-tenant.auditLog":0,"posqc-resto-tenant.posShift":0,"posqc-resto-tenant.posCashMovement":0,"posqc-resto-tenant.posShiftCounter":0,"posqc-resto-tenant.invItem":2,"posqc-resto-tenant.invMovement":1,"posqc-resto-tenant.couponRedemption":0,"posqc-resto-tenant.pointLedger":0,"posqc-resto-tenant.receiptSeqSum":0}}
```

### 03-qc-pos-p1.17-forced.log (last 15 lines)
```
  ❌ [P1.17-V1] ตรวจช่วงวัน: from > to · 2026-9-14 · 2026-02-30 · ตัวเลข · ไม่ส่ง · 93 วัน → VALIDATION (ทุกรายงาน + CSV) · 92 วัน ok · CSV kind ไม่รู้จัก → VALIDATION — expected VALIDATION ทุกกรณี · 92 วัน ok | actual reportDailySales from>to → MISSING:reportDailySales · reportProducts from>to → MISSING:reportProducts · reportStaff from>to → MISSING:reportStaff · reportPayments from>to → MISSING:reportPayments · reportMargin from>to → MISSING:reportMargin · reportShifts from>to → MISSING:reportShifts …(+44)
  ❌ [P1.17-A1] สิทธิ์: STAFF มีแค่ pos.sale.create → PERMISSION_DENIED ทั้ง 7 รายงาน + CSV (การ์ด ok) · STAFF ไม่มีสิทธิ์ POS → การ์ด PERMISSION_DENIED — expected 7 + CSV = PERMISSION_DENIED · การ์ด ok / DENIED | actual daily → MISSING:reportDailySales · products → MISSING:reportProducts · staff → MISSING:reportStaff · payments → MISSING:reportPayments · margin → MISSING:reportMargin · shifts → MISSING:reportShifts …(+4)
  ❌ [P1.17-A2] สาขาจำกัด: STAFF pos.report.view unitAccess [u1] ไม่ส่ง unitId → เห็นแค่ u1 (D1 52,450/3 · D2 4,500/1) · ส่ง unitId u2 → NOT_FOUND · การ์ดเห็น u1 (4,500/1 · กะเปิด 0) — expected u1 เท่านั้น · u2 NOT_FOUND · การ์ด u1 | actual u1-only: MISSING:reportDailySales ยังไม่มีฟังก์ชัน reportDailySales · unitId u2 → MISSING:reportDailySales · การ์ด MISSING:posDashboardCard
  ❌ [P1.17-I1] ข้ามระบบ: บิลของ POS อีกตัว (u3) ไม่อยู่ในรายงานของ POS นี้ และกลับกัน · systemId ที่เป็นระบบคลัง / ไม่มีจริง / unitId ร้านอื่น → NOT_FOUND — expected S/S2 แยกกัน · NOT_FOUND ×3 | actual POS S2 → MISSING:reportDailySales undefined (ต้อง 1/4,500) · ระบบคลัง → MISSING:reportDailySales · ไม่มีจริง → MISSING:reportDailySales · สาขาร้านอื่น → MISSING:reportDailySales
  ❌ [P1.17-I2] ข้ามร้าน: เจ้าของร้าน QC อาหาร (ctx ร้านตัวเอง) กับ systemId ร้านกาแฟ → NOT_FOUND ทั้งรายวัน/ภาษี/CSV/การ์ด — expected NOT_FOUND ×4 | actual reportDailySales → MISSING:reportDailySales · reportTax → MISSING:reportTax · csv → MISSING:reportCsv · card → MISSING:posDashboardCard
  ❌ [P1.17-SH1] กะในช่วง (วันเปิดกะเวลาไทย): กะปิดของ B = ค่าจาก Z แช่แข็ง (3 บิล 43,450 ทิป 1,000) + คอลัมน์ (ควรมี 72,450 นับ 72,000 ขาด −450 Z#1) · กะเปิดของ A คำนวณสด (0 บิล ควรมี 100,000 นับ null) · กะ 09-16 ไม่อยู่ · รวม ขาด −450 shortCount 1 openCount 1 — expected SH (Z) + SH2 (สด) · ไม่มี SH0 · −450 | actual shifts: MISSING:reportShifts ยังไม่มีฟังก์ชัน reportShifts
  ❌ [P1.17-SB1] ทางเขียนผู้ขาย: createSale({…, soldByUserId}) → แถว PosSale.soldByUserId ตรง · ไม่ส่ง = null (ผู้เรียกเดิมไม่กระทบ) — expected เขียน soldByUserId · ไม่ส่ง = null | actual PosSale.soldByUserId ยังไม่มี · soldByUserId undefined
  ❌ [P1.17-SH2] Z แช่แข็งในรายงาน: เปลี่ยนบิล 06:30 ในกะที่ปิดแล้วเป็น VOIDED ใน DB → แถวกะเดิมไม่เปลี่ยน (3/43,450) แต่รายวัน D2 เหลือ 1 บิล 4,500 — expected แถวกะ = Z เดิม · รายวันเปลี่ยน | actual ไม่มีแถว SH หลังแก้ (MISSING:reportShifts) · รายวัน D2 หลังแก้ undefined (ต้อง 1/4,500 · ยกเลิก 1)
  ❌ [P1.17-R1] คำปฏิเสธของ reports.ts (VALIDATION · NOT_FOUND · PERMISSION_DENIED) ≥ 12 รายการ = คืน {ok:false, code, message} ไม่ throw — expected ≥ 12 · {ok:false, code, message} · ไม่ throw | actual เก็บได้ 0 รายการ (ต้อง ≥ 12)
  ลบแล้ว: {"outbox":2,"audit":0,"movementBySale":5,"payment":14,"line":14,"sale":12,"movement":0,"item":2,"shift":3} · บิล 12 · กะ 3 · สาขา 3 · ระบบ 3
  ✅ [P1.17-Z1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ · รวม InvItem/InvMovement/PosShift) ก่อน = หลัง · ผลรวมตัวนับใบเสร็จไม่ขยับ
  ✅ [P1.17-Z2] QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · AppSystem · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter · PosShift · InvItem) ทุกคอลัมน์ ก่อน = หลัง

===== qc-pos-p1.17 ===== ผ่าน 3/35 (QC_FORCE)
JSON_SUMMARY {"suite":"qc-pos-p1.17","total":35,"passed":3,"failed":["P1.17-ST1","P1.17-ST2","P1.17-ST3","P1.17-ST4","P1.17-ST5","P1.17-ST6","P1.17-D1","P1.17-D2","P1.17-D3","P1.17-D4","P1.17-PR1","P1.17-PR2","P1.17-SF1","P1.17-SF2","P1.17-PM1","P1.17-PM2","P1.17-MG1","P1.17-MG2","P1.17-TX1","P1.17-TX2","P1.17-CSV1","P1.17-CSV2","P1.17-CD1","P1.17-V1","P1.17-A1","P1.17-A2","P1.17-I1","P1.17-I2","P1.17-SH1","P1.17-SB1","P1.17-SH2","P1.17-R1"],"skipped":false,"forced":true,"skippedChecks":{},"missing":["src/lib/modules/pos/reports.ts ยังไม่มี export reportDailySales","src/lib/modules/pos/reports.ts ยังไม่มี export reportProducts","src/lib/modules/pos/reports.ts ยังไม่มี export reportStaff","src/lib/modules/pos/reports.ts ยังไม่มี export reportPayments","src/lib/modules/pos/reports.ts ยังไม่มี export reportMargin","src/lib/modules/pos/reports.ts ยังไม่มี export reportShifts","src/lib/modules/pos/reports.ts ยังไม่มี export reportTax","src/lib/modules/pos/reports.ts ยังไม่มี export reportCsv","src/lib/modules/pos/reports.ts ยังไม่มี export posDashboardCard","PosSale.soldByUserId ยังไม่มี (client/DB · R6)"],"a5":{"drift":[]}}
```
