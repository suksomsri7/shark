# suites run p16-r3 — 20261004T102504Z

| # | step | exit | seconds | summary |
|---|---|---|---|---|
- tree `/root/projects/shark-pos-p11` · branch `wip/pos-p1.6` · head `cc849533`
| 1 | install | 0 | 7 |  |
| 2 | qc-subscription-money | 0 | 7 |  |
| 3 | qc-pos-p1.6 | 0 | 40 | "total":48,"passed":48,"failed":[] |
| 4 | qc-pos-p1.3 | 0 | 99 | "total":128,"passed":128,"failed":[] |

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
Done in 7s using pnpm v10.33.0
```

### 02-qc-subscription-money.log (last 15 lines)
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

### 03-qc-pos-p1.6.log (last 15 lines)
```
  ✅ [P1.6-U3] ร้านมี POS ตัวเดียว (ร้าน QC อาหาร) · สาขาไม่ผูก POS → ขายได้เหมือนวันนี้ (ผู้เรียกแบบ 'POS ตัวแรก') · คู่ที่ผูกถูก (sandbox) → PAID

── B oversellPolicy ──
  ✅ [P1.6-B1] BLOCK: เหลือ 2 ขาย 3 → STOCK_INSUFFICIENT ไม่มีบิล สต็อก 2 ไม่มี OUT ตัวนับไม่ขยับ · ขาย 2 → PAID สต็อก 0 OUT 1 แถว (ไม่ตัดซ้ำหลัง commit) · สินค้าไม่นับสต็อกยังขายได้
  ✅ [P1.6-B2] BLOCK ผ่าน createSale รูปแบบเดิม (บรรทัดมี itemId): เหลือ 1 ขาย 2 → STOCK_INSUFFICIENT ไม่มีบิล สต็อก 1
  ✅ [P1.6-B3] BLOCK ชิ้นสุดท้าย 10 connection × 3 รอบ → PAID 1 · STOCK_INSUFFICIENT 9 · สต็อก 0 ไม่ติดลบ · ไม่มีรหัสอื่น (deadlock/BUSY/INTERNAL/THROW)
  ✅ [P1.6-B4] BLOCK สองสินค้าสลับลำดับบรรทัด ([X,Y]/[Y,X]) 10 connection × 3 รอบ (เหลืออย่างละ 5) → PAID 5 · STOCK_INSUFFICIENT 5 · สต็อก 0/0 · ไม่มี deadlock
  ✅ [P1.6-B5] ไม่ตั้งนโยบาย / ALLOW_NEGATIVE → ขายเกินได้เหมือนวันนี้ (PAID · สต็อก −1)
  ✅ [P1.6-R1] คำปฏิเสธใหม่ของหน้าขาย/ตั้งค่า (SPLIT_INVALID · STOCK_INSUFFICIENT · PAYMENT_MISMATCH เงินรับ · VALIDATION หมายเหตุ/ทิป · TIP_ACCOUNT_REQUIRED) = คืน {ok:false, code, message} ไม่ throw
  ลบแล้ว: {"outbox":49,"audit":27,"journal":0,"point":0,"coupon":0,"restaurantOrderItem":1,"restaurantOrder":1,"tableSession":1,"restaurantTable":1,"restaurantZone":1,"kdsStation":1,"restaurantSetting":1,"payment":69,"line":85,"sale":59,"product":14,"productBySystem":0,"invJournal":47,"invItem":13,"counter":5,"accLink":2,"accJournal":0,"accDoc":0,"accSettings":2} · สาขา 6 · ระบบ 6
  ✅ [P1.6-Z1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง · ผลรวมตัวนับใบเสร็จไม่ขยับ
  ✅ [P1.6-Z2] QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · InvItem · AppSystem รวม settings · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter · AccountSettings · AccountSystemLink) ทุกคอลัมน์ ก่อน = หลัง

===== qc-pos-p1.6 ===== ผ่าน 48/48
JSON_SUMMARY {"suite":"qc-pos-p1.6","total":48,"passed":48,"failed":[],"skipped":false,"forced":false,"skippedChecks":{},"missing":[],"a5":{"drift":[]}}
```

### 04-qc-pos-p1.3.log (last 15 lines)
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

===== qc-pos-p1.3 ===== ผ่าน 128/128
JSON_SUMMARY {"suite":"qc-pos-p1.3","total":128,"passed":128,"failed":[],"skipped":false,"forced":false,"skippedChecks":{},"missing":[],"a5":{"drift":[]}}
```
