# suites run o23-r2 — 20261005T034004Z

| # | step | exit | seconds | summary |
|---|---|---|---|---|
- tree `/root/projects/shark-pos-p11` · branch `wip/pos-hf-o23-r2` · head `f85f5455`
| 1 | install | 0 | 8 |  |
| 2 | typecheck | 0 | 180 |  |
| 3 | fitness-env | 0 | 5 |  |
| 4 | fitness-noenv | 0 | 4 |  |
| 5 | qc-hf-o23-forced | 0 | 6 | "total":16,"passed":16,"failed":[] |
| 6 | qc-hf-o23-forced | 0 | 5 | "total":16,"passed":16,"failed":[] |
| 7 | qc-hf-o23 | 0 | 4 | "total":16,"passed":16,"failed":[] |
| 8 | qc-hf-pos-page-authz | 0 | 4 |  |
| 9 | qc-pos-register | 0 | 9 |  |
| 10 | qc-pos-coupon | 0 | 4 |  |
| 11 | qc-pos-closeday | 0 | 4 |  |
| 12 | qc-pos-account | 0 | 7 |  |
| 13 | qc-hotel-money | 0 | 5 |  |
| 14 | qc-booking-deposit | 0 | 6 |  |
| 15 | qc-shop | 0 | 4 |  |
| 16 | qc-rental | 0 | 4 |  |
| 17 | qc-clinic | 0 | 4 |  |
| 18 | qc-school | 0 | 4 |  |
| 19 | qc-restaurant-pay | 0 | 5 |  |
| 20 | serve-build | 0 | 413 |  |

### 01-install.log (last 15 lines)
```

. postinstall$ prisma generate
. postinstall: Loaded Prisma config from prisma.config.ts.
. postinstall: Prisma schema loaded from prisma/schema.
. postinstall: ✔ Generated Prisma Client (v7.8.0) to ./node_modules/.pnpm/@prisma+client@7.8.0_prisma@7.8.0_@types+react-dom@19.2.3_@types+react@19.2.17__@types+_12a6afd4e8168cdd815b06207f03ccf9/node_modules/@prisma/client in 3.75s
. postinstall: Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)
. postinstall: Done
╭ Warning ─────────────────────────────────────────────────────────────────────╮
│                                                                              │
│   Ignored build scripts: @parcel/watcher@2.5.6, @swc/core@1.15.43.           │
│   Run "pnpm approve-builds" to pick which dependencies should be allowed     │
│   to run scripts.                                                            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
Done in 7.7s using pnpm v10.33.0
```

### 02-typecheck.log (last 15 lines)
```

> shark-in-th@0.1.0 typecheck /root/projects/shark-pos-p11
> tsc --noEmit

```

### 03-fitness-env.log (last 15 lines)
```
  ✅ [F13.8] docs/api/MEMBER-API.md ตรงกับ generator (ไม่ stale)
  ✅ [F13.9] tool ของ op ระบบสมาชิก (54 ตัว) ลงทะเบียนในสกิล AI แล้ว
  ✅ [F13.10] ทุก op ของ CRM (122 + พอร์ทัล 16) มี test id ที่อ้างถึงจริงใน scripts/qc-crm-*.mts
  ✅ [F13.11] docs/api/CRM-API.md ตรงกับ generator (ไม่ stale)
  ✅ [F13.12] tool ของ op CRM (32 ตัว) ลงทะเบียนในสกิล AI แล้ว

── F14: ทะเบียนปุ่ม CRM (ปุ่มทุกตัวมีแถว · แถวทุกแถวมีปุ่มจริง) ──
  ✅ [F14.1] data-testid ที่กดได้ในโฟลเดอร์ CRM (1052 ตัว · สแกน 368 ไฟล์ใน 9 โฟลเดอร์: src/app/api/mobile/crm, src/app/api/v1/crm, src/app/app/sys/[id]/crm, src/app/b, src/app/t, src/app/u, src/components/chat/crm, src/components/crm, src/lib/modules/crm) มีแถวใน scripts/crm-ui-inventory.json ครบ (หนี้เดิม 0)
  ✅ [F14.2] ทุกแถวใน scripts/crm-ui-inventory.json (1052) ชี้ไปที่ testid ที่มีจริงในโค้ด + baseline ไม่มีตัวที่ปิดแล้ว

===== FITNESS =====
ผ่าน 33/33
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":33,"passed":33,"findings":[]}
```

### 04-fitness-noenv.log (last 15 lines)
```
  ✅ [F13.8] docs/api/MEMBER-API.md ตรงกับ generator (ไม่ stale)
  ✅ [F13.9] tool ของ op ระบบสมาชิก (54 ตัว) ลงทะเบียนในสกิล AI แล้ว
  ✅ [F13.10] ทุก op ของ CRM (122 + พอร์ทัล 16) มี test id ที่อ้างถึงจริงใน scripts/qc-crm-*.mts
  ✅ [F13.11] docs/api/CRM-API.md ตรงกับ generator (ไม่ stale)
  ✅ [F13.12] tool ของ op CRM (32 ตัว) ลงทะเบียนในสกิล AI แล้ว

── F14: ทะเบียนปุ่ม CRM (ปุ่มทุกตัวมีแถว · แถวทุกแถวมีปุ่มจริง) ──
  ✅ [F14.1] data-testid ที่กดได้ในโฟลเดอร์ CRM (1052 ตัว · สแกน 368 ไฟล์ใน 9 โฟลเดอร์: src/app/api/mobile/crm, src/app/api/v1/crm, src/app/app/sys/[id]/crm, src/app/b, src/app/t, src/app/u, src/components/chat/crm, src/components/crm, src/lib/modules/crm) มีแถวใน scripts/crm-ui-inventory.json ครบ (หนี้เดิม 0)
  ✅ [F14.2] ทุกแถวใน scripts/crm-ui-inventory.json (1052) ชี้ไปที่ testid ที่มีจริงในโค้ด + baseline ไม่มีตัวที่ปิดแล้ว

===== FITNESS =====
ผ่าน 33/33
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":33,"passed":33,"findings":[]}
```

### 05-qc-hf-o23-forced.log (last 15 lines)
```

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✅ [O23-DB1] จองคีย์: คีย์ client hotel-sale-<x> → lookupPosKey = none · ขายด้วย posStoredKey → แถวเก็บเป็น pos1:hotel-sale-<x> (ไม่ใช่คีย์เปล่า)
  ✅ [O23-DB2] โมดูลโรงแรมขายทีหลังด้วยคีย์เปล่า hotel-sale-<x> → ได้บิลใหม่ของตัวเอง (id ต่างจากบิลจอง · sourceModule HOTEL · ยอดของโรงแรม)
  ✅ [O23-DB3] กดซ้ำ: lookupPosKey(สาขาเดิม, คีย์เดิม) = replay บิลเดิม (receiptNo/ยอดเดียวกัน · legacyBareKey false) · สาขาอื่นของร้านเดียวกัน = taken (ไม่คืนบิล)
  ✅ [O23-DB4] อ่านบิลโมดูลอื่น: บิล HOTEL คีย์เปล่า hotel-sale-<y> → lookupPosKey(คีย์นั้น) = none (ไม่คืนเลขใบเสร็จ/ยอด) · ขายต่อด้วย pos1: ได้ · บิลโรงแรมไม่ถูกแตะ
  ✅ [O23-DB5] ช่วงเปลี่ยนรุ่น: บิล POS คีย์เปล่า (ก่อน deploy) สาขาเดียวกัน → replay legacyBareKey true · สาขาอื่น → none
  ✅ [O23-DB6] [action] registerSaleAction(คีย์ hotel-sale-<z>) → ok · แถวเก็บเป็น pos1:hotel-sale-<z> (POS · สาขานี้) · ไม่มีแถวคีย์เปล่า
  ✅ [O23-DB7] [action] หลัง DB6 โรงแรม createSale ด้วยคีย์เปล่า hotel-sale-<z> → บิลใหม่ HOTEL (id ต่าง · ยอดของโรงแรม)
  ✅ [O23-DB8] [action] กดซ้ำคีย์เดิม → ok เลขใบเสร็จเดิม (ไม่มีบิลเพิ่ม) · ส่งคีย์ของบิล HOTEL ที่มีอยู่ → ไม่ได้เลขใบเสร็จ/ยอดของโรงแรม
  ✅ [O23-Z1] คืนสภาพ: ร้านชั่วคราว qc-hfo23-* ถูกลบ · ไม่เหลือ PosSale/PosSaleLine/PosPayment/OutboxEvent ของร้านนั้น · ผู้ใช้ OWNER ชั่วคราว (+session/membership) ถูกลบ

===== qc-hf-o23 ===== ผ่าน 16/16 (QC_FORCE)
JSON_SUMMARY {"suite":"qc-hf-o23","total":16,"passed":16,"failed":[],"skipped":false,"forced":true,"missing":[]}
```

### 06-qc-hf-o23-forced.log (last 15 lines)
```

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✅ [O23-DB1] จองคีย์: คีย์ client hotel-sale-<x> → lookupPosKey = none · ขายด้วย posStoredKey → แถวเก็บเป็น pos1:hotel-sale-<x> (ไม่ใช่คีย์เปล่า)
  ✅ [O23-DB2] โมดูลโรงแรมขายทีหลังด้วยคีย์เปล่า hotel-sale-<x> → ได้บิลใหม่ของตัวเอง (id ต่างจากบิลจอง · sourceModule HOTEL · ยอดของโรงแรม)
  ✅ [O23-DB3] กดซ้ำ: lookupPosKey(สาขาเดิม, คีย์เดิม) = replay บิลเดิม (receiptNo/ยอดเดียวกัน · legacyBareKey false) · สาขาอื่นของร้านเดียวกัน = taken (ไม่คืนบิล)
  ✅ [O23-DB4] อ่านบิลโมดูลอื่น: บิล HOTEL คีย์เปล่า hotel-sale-<y> → lookupPosKey(คีย์นั้น) = none (ไม่คืนเลขใบเสร็จ/ยอด) · ขายต่อด้วย pos1: ได้ · บิลโรงแรมไม่ถูกแตะ
  ✅ [O23-DB5] ช่วงเปลี่ยนรุ่น: บิล POS คีย์เปล่า (ก่อน deploy) สาขาเดียวกัน → replay legacyBareKey true · สาขาอื่น → none
  ✅ [O23-DB6] [action] registerSaleAction(คีย์ hotel-sale-<z>) → ok · แถวเก็บเป็น pos1:hotel-sale-<z> (POS · สาขานี้) · ไม่มีแถวคีย์เปล่า
  ✅ [O23-DB7] [action] หลัง DB6 โรงแรม createSale ด้วยคีย์เปล่า hotel-sale-<z> → บิลใหม่ HOTEL (id ต่าง · ยอดของโรงแรม)
  ✅ [O23-DB8] [action] กดซ้ำคีย์เดิม → ok เลขใบเสร็จเดิม (ไม่มีบิลเพิ่ม) · ส่งคีย์ของบิล HOTEL ที่มีอยู่ → ไม่ได้เลขใบเสร็จ/ยอดของโรงแรม
  ✅ [O23-Z1] คืนสภาพ: ร้านชั่วคราว qc-hfo23-* ถูกลบ · ไม่เหลือ PosSale/PosSaleLine/PosPayment/OutboxEvent ของร้านนั้น · ผู้ใช้ OWNER ชั่วคราว (+session/membership) ถูกลบ

===== qc-hf-o23 ===== ผ่าน 16/16 (QC_FORCE)
JSON_SUMMARY {"suite":"qc-hf-o23","total":16,"passed":16,"failed":[],"skipped":false,"forced":true,"missing":[]}
```

### 07-qc-hf-o23.log (last 15 lines)
```

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✅ [O23-DB1] จองคีย์: คีย์ client hotel-sale-<x> → lookupPosKey = none · ขายด้วย posStoredKey → แถวเก็บเป็น pos1:hotel-sale-<x> (ไม่ใช่คีย์เปล่า)
  ✅ [O23-DB2] โมดูลโรงแรมขายทีหลังด้วยคีย์เปล่า hotel-sale-<x> → ได้บิลใหม่ของตัวเอง (id ต่างจากบิลจอง · sourceModule HOTEL · ยอดของโรงแรม)
  ✅ [O23-DB3] กดซ้ำ: lookupPosKey(สาขาเดิม, คีย์เดิม) = replay บิลเดิม (receiptNo/ยอดเดียวกัน · legacyBareKey false) · สาขาอื่นของร้านเดียวกัน = taken (ไม่คืนบิล)
  ✅ [O23-DB4] อ่านบิลโมดูลอื่น: บิล HOTEL คีย์เปล่า hotel-sale-<y> → lookupPosKey(คีย์นั้น) = none (ไม่คืนเลขใบเสร็จ/ยอด) · ขายต่อด้วย pos1: ได้ · บิลโรงแรมไม่ถูกแตะ
  ✅ [O23-DB5] ช่วงเปลี่ยนรุ่น: บิล POS คีย์เปล่า (ก่อน deploy) สาขาเดียวกัน → replay legacyBareKey true · สาขาอื่น → none
  ✅ [O23-DB6] [action] registerSaleAction(คีย์ hotel-sale-<z>) → ok · แถวเก็บเป็น pos1:hotel-sale-<z> (POS · สาขานี้) · ไม่มีแถวคีย์เปล่า
  ✅ [O23-DB7] [action] หลัง DB6 โรงแรม createSale ด้วยคีย์เปล่า hotel-sale-<z> → บิลใหม่ HOTEL (id ต่าง · ยอดของโรงแรม)
  ✅ [O23-DB8] [action] กดซ้ำคีย์เดิม → ok เลขใบเสร็จเดิม (ไม่มีบิลเพิ่ม) · ส่งคีย์ของบิล HOTEL ที่มีอยู่ → ไม่ได้เลขใบเสร็จ/ยอดของโรงแรม
  ✅ [O23-Z1] คืนสภาพ: ร้านชั่วคราว qc-hfo23-* ถูกลบ · ไม่เหลือ PosSale/PosSaleLine/PosPayment/OutboxEvent ของร้านนั้น · ผู้ใช้ OWNER ชั่วคราว (+session/membership) ถูกลบ

===== qc-hf-o23 ===== ผ่าน 16/16
JSON_SUMMARY {"suite":"qc-hf-o23","total":16,"passed":16,"failed":[],"skipped":false,"forced":false,"missing":[]}
```

### 08-qc-hf-pos-page-authz.log (last 15 lines)
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

### 09-qc-pos-register.log (last 15 lines)
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

### 10-qc-pos-coupon.log (last 15 lines)
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

### 11-qc-pos-closeday.log (last 15 lines)
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

### 12-qc-pos-account.log (last 15 lines)
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

### 13-qc-hotel-money.log (last 15 lines)
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

### 14-qc-booking-deposit.log (last 15 lines)
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

### 15-qc-shop.log (last 15 lines)
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

### 16-qc-rental.log (last 15 lines)
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

### 17-qc-clinic.log (last 15 lines)
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

### 18-qc-school.log (last 15 lines)
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

### 20-serve-build.log (last 15 lines)
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
✅ พร้อมใช้งานที่ http://127.0.0.1:3226 (pid 2140810)
```
