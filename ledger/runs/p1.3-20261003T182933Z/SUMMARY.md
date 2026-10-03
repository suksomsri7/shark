# P1.3 controller run on VPS — 20261003T182933Z

| # | step | exit | seconds |
|---|---|---|---|
- head `653db842` · tree `/root/projects/shark-pos-p11` · port 3225
| 1 | install | 0 | 6 |
| 2 | typecheck | 0 | 188 |
| 3 | fitness-env | 0 | 11 |
| 4 | fitness-noenv | 0 | 8 |
| 5 | fitness-pos | 0 | 6 |
| 6 | p13-forced-1 | 1 | 102 |
| 7 | p13-forced-2 | 1 | 106 |
| 8 | p13-unforced | 0 | 98 |
| 9 | qc-pos-p1.1 | 0 | 72 |
| 10 | qc-pos-p0.2 | 0 | 4 |
| 11 | qc-pos-register | 0 | 8 |
| 12 | qc-pos-inventory | 0 | 5 |
| 13 | qc-pos-account | 0 | 6 |
| 14 | qc-hf-inventory-atomic | 0 | 230 |
| 15 | qc-hf-pos-page-authz | 0 | 5 |
| 16 | qc-account-cpa | 0 | 12 |
| 17 | qc-restaurant-money | 0 | 7 |
| 18 | qc-shop-refund | 0 | 5 |
| 19 | qc-hotel-money | 0 | 4 |
| 20 | qc-ticket-money | 0 | 4 |
| 21 | qc-subscription-money | 0 | 5 |
| 22 | qc-crm-c2.7 | 0 | 361 |
| 23 | qc-branding-b3 | 0 | 2 |
| 24 | seed | 0 | 5 |
| 25 | serve-build | 0 | 395 |
| 26 | visual-owner | 1 | 176 |
| 27 | visual-cashier | 1 | 173 |
| 28 | visual-owner-en | 1 | 169 |
| 29 | visual-legacy-flagoff | 0 | 10 |

### 00-db-ping.log (ท้าย 12 บรรทัด)
```
[env] vps-flag · ไฟล์ .env.qc4 · DB ep-frosty-lab-aoylqlv8-pooler.c-2.ap-southeast-1.aws.neon.tech (QC4)
(node:355952) Warning: SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full'.
In the next major version (pg-connection-string v3.0.0 and pg v9.0.0), these modes will adopt standard libpq semantics, which have weaker security guarantees.

To prepare for this change:
- If you want the current behavior, explicitly use 'sslmode=verify-full'
- If you want libpq compatibility now, use 'uselibpqcompat=true&sslmode=require'

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.
(Use `node --trace-warnings ...` to show where the warning was created)
ping ok [{"ok":1}]
```

### 01-install.log (ท้าย 12 บรรทัด)
```
. postinstall: Prisma schema loaded from prisma/schema.
. postinstall: ✔ Generated Prisma Client (v7.8.0) to ./node_modules/.pnpm/@prisma+client@7.8.0_prisma@7.8.0_@types+react-dom@19.2.3_@types+react@19.2.17__@types+_12a6afd4e8168cdd815b06207f03ccf9/node_modules/@prisma/client in 3.02s
. postinstall: Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)
. postinstall: Done
╭ Warning ─────────────────────────────────────────────────────────────────────╮
│                                                                              │
│   Ignored build scripts: @parcel/watcher@2.5.6, @swc/core@1.15.43.           │
│   Run "pnpm approve-builds" to pick which dependencies should be allowed     │
│   to run scripts.                                                            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
Done in 6.3s using pnpm v10.33.0
```

### 02-typecheck.log (ท้าย 12 บรรทัด)
```

> shark-in-th@0.1.0 typecheck /root/projects/shark-pos-p11
> tsc --noEmit

```

### 03-fitness-env.log (ท้าย 12 บรรทัด)
```
  ✅ [F15.2] สัญญา createSale/voidSale/refundSale ใน src/lib/modules/pos/service.ts เข้ากันได้ย้อนหลังกับ scripts/pos-sale-contract.json (ขาเข้า/ขาออก · ทุก overload)
  ✅ [F15.3a] ปุ่ม POS ที่มี data-testid มีแถวใน scripts/pos-ui-inventory.json ครบ + ไม่มีปุ่มใหม่ที่ไร้ testid (สแกน 44 ไฟล์ · หนี้ไร้ testid 46)
  ✅ [F15.3b] ทุกแถวใน scripts/pos-ui-inventory.json ชี้ testid ที่มีจริง · ไม่ซ้ำ · ฟิลด์ถูกต้อง · baselineDebt ไม่เหลือหนี้ที่ปิดแล้ว (79 แถว)
  ✅ [F15.4] ข้อความ pos.* มีครบทั้ง th/en · ไม่ว่าง · ค่าภาษาไทยมีอักษรไทย (ยกเว้นคำสากลใน UNIVERSAL_TOKENS)
  ✅ [F15.5] ตัวบ่งชี้ผู้เรียกระดับระบบของแคตตาล็อก + backfill ไม่หลุดถึงโค้ดที่รับคำขอ (catalog.ts · สคริปต์ backfill · qc-* · allowlist เท่านั้น) · R4: ห้าม ?? / || / ?: / alias ของตัวบ่งชี้
  ✅ [F15.6] src/** ห้าม import จาก scripts/** (static · import() · require · import = require · typeof import()) · baseline 0 จุด

===== FITNESS =====
ผ่าน 40/40
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":40,"passed":40,"findings":[]}
```

### 04-fitness-noenv.log (ท้าย 12 บรรทัด)
```
  ✅ [F15.2] สัญญา createSale/voidSale/refundSale ใน src/lib/modules/pos/service.ts เข้ากันได้ย้อนหลังกับ scripts/pos-sale-contract.json (ขาเข้า/ขาออก · ทุก overload)
  ✅ [F15.3a] ปุ่ม POS ที่มี data-testid มีแถวใน scripts/pos-ui-inventory.json ครบ + ไม่มีปุ่มใหม่ที่ไร้ testid (สแกน 44 ไฟล์ · หนี้ไร้ testid 46)
  ✅ [F15.3b] ทุกแถวใน scripts/pos-ui-inventory.json ชี้ testid ที่มีจริง · ไม่ซ้ำ · ฟิลด์ถูกต้อง · baselineDebt ไม่เหลือหนี้ที่ปิดแล้ว (79 แถว)
  ✅ [F15.4] ข้อความ pos.* มีครบทั้ง th/en · ไม่ว่าง · ค่าภาษาไทยมีอักษรไทย (ยกเว้นคำสากลใน UNIVERSAL_TOKENS)
  ✅ [F15.5] ตัวบ่งชี้ผู้เรียกระดับระบบของแคตตาล็อก + backfill ไม่หลุดถึงโค้ดที่รับคำขอ (catalog.ts · สคริปต์ backfill · qc-* · allowlist เท่านั้น) · R4: ห้าม ?? / || / ?: / alias ของตัวบ่งชี้
  ✅ [F15.6] src/** ห้าม import จาก scripts/** (static · import() · require · import = require · typeof import()) · baseline 0 จุด

===== FITNESS =====
ผ่าน 40/40
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":40,"passed":40,"findings":[]}
```

### 05-fitness-pos.log (ท้าย 12 บรรทัด)
```

── F15: POS (แคตตาล็อก/ราคาผู้เขียนเดียว · สัญญา createSale · ทะเบียนปุ่ม POS · ข้อความ pos.* สองภาษา) ──
  ✅ [F15.1] แคตตาล็อก/ราคามีผู้เขียนที่เดียว (catalog.ts ∪ baseline ต่อจุดเขียน · หนี้เดิม 9 ไฟล์ 36 จุด) — ตรง (10 ไฟล์ 38 จุด)
  ✅ [F15.2] สัญญา createSale/voidSale/refundSale ใน src/lib/modules/pos/service.ts เข้ากันได้ย้อนหลังกับ scripts/pos-sale-contract.json (ขาเข้า/ขาออก · ทุก overload) — ตรง (createSale/voidSale · 34 ฟิลด์ · ผู้เรียก createSale 15 ไฟล์) · ของใหม่ที่เข้ากันได้ 1: CreateSaleInput.lines[].productId? → รัน --update-pos-contract · ผู้เรียก createSale เปลี่ยน (+1 src/lib/modules/pos/register.ts · −0 ) — อัปเดต snapshot ด้วย --update-pos-contract
  ✅ [F15.3a] ปุ่ม POS ที่มี data-testid มีแถวใน scripts/pos-ui-inventory.json ครบ + ไม่มีปุ่มใหม่ที่ไร้ testid (สแกน 44 ไฟล์ · หนี้ไร้ testid 46) — ครบ (testid กดได้ 80 · แถว 79 · ของทะเบียนอื่น 2)
  ✅ [F15.3b] ทุกแถวใน scripts/pos-ui-inventory.json ชี้ testid ที่มีจริง · ไม่ซ้ำ · ฟิลด์ถูกต้อง · baselineDebt ไม่เหลือหนี้ที่ปิดแล้ว (79 แถว) — ตรง
  ✅ [F15.4] ข้อความ pos.* มีครบทั้ง th/en · ไม่ว่าง · ค่าภาษาไทยมีอักษรไทย (ยกเว้นคำสากลใน UNIVERSAL_TOKENS) — ครบ 168 คีย์ (th/pos.json, en/pos.json)
  ✅ [F15.5] ตัวบ่งชี้ผู้เรียกระดับระบบของแคตตาล็อก + backfill ไม่หลุดถึงโค้ดที่รับคำขอ (catalog.ts · สคริปต์ backfill · qc-* · allowlist เท่านั้น) · R4: ห้าม ?? / || / ?: / alias ของตัวบ่งชี้ — สะอาด
  ✅ [F15.6] src/** ห้าม import จาก scripts/** (static · import() · require · import = require · typeof import()) · baseline 0 จุด — สะอาด (0 จุดตาม baseline)

JSON_SUMMARY {"suite":"fitness-pos","total":7,"passed":7,"findings":[]}
```

### 06-p13-forced-1.log (ท้าย 12 บรรทัด)
```
  ✅ [P1.3-S4.2] ยังไม่มีกะ (PosShift ของ P1.9 ยังไม่มี/ไม่เปิด) → shift = null ไม่ throw
  ✅ [P1.3-S4.3] pendingStockCount ('รอตัดสต็อก'): บิลวันนี้ (ตัดวันเวลาไทย +07:00) ที่ตัดสต็อกครบ → 0 · บิลที่ยังไม่ตัด (createSale ใน tx ผู้อื่น) → นับ 1
  ✅ [P1.3-S4.4] registerStatus ข้ามร้าน (unit ร้านอาหาร) → NOT_FOUND · แคชเชียร์สาขาอื่น → NOT_FOUND · สาขาตัวเอง → ok (คู่บวก)
  ✅ [P1.3-S4.5] [Q23] registerStatus.user.role = รหัสบทบาท OWNER · MANAGER · STAFF ตาม actor (roleLabel ภาษาคนยังอยู่ · S4.1)
  ✅ [P1.3-S4.6] [Q25] registerVatConfig(ctx) = {mode, rateBp} เดียวกับ vatMode/vatRateBp ของ quote (สาขา sandbox และสาขาสีลม) · mode ∈ INCLUDED|NONE
  ✅ [P1.3-S4.7] [3.2 ข้อ 11] pendingStockCount: บิล PAID วันนี้ที่บรรทัดผูกสต็อกยังไม่มี movement pos-consume-<sale>-<line> → +1 · ตัดด้วยคีย์นั้นแล้ว → กลับเท่าเดิม
  ลบแล้ว: {"outbox":134,"audit":268,"journal":0,"point":0,"coupon":0,"payment":135,"line":335,"sale":133,"product":537,"productBySystem":0,"category":2,"menuGroup":2,"invJournal":84,"invItem":20,"customer":2,"user":2} · สาขา 3 · ระบบ 4
  ❌ [P1.3-S9.1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง · ตัวนับใบเสร็จสาขาจริงไม่ขยับ — expected ก่อน = หลัง | actual posqc-coffee-tenant.posReceiptCounter:0→1, posqc-coffee-tenant.receiptSeqSum:0→1
  ❌ [P1.3-S9.2] QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · InvItem · AppSystem รวม settings · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter) ทุกคอลัมน์ ก่อน = หลัง — expected ลายนิ้วมือเท่าเดิมทุกตาราง | actual posReceiptCounter:0:4f53cda18c2baa0c→1:618b7c96a0d5c49c

===== qc-pos-p1.3 ===== ผ่าน 125/128 (QC_FORCE)
JSON_SUMMARY {"suite":"qc-pos-p1.3","total":128,"passed":125,"failed":["P1.3-S6.1","P1.3-S9.1","P1.3-S9.2"],"skipped":false,"forced":true,"skippedChecks":{},"missing":[],"a5":{"drift":["posqc-coffee-tenant.posReceiptCounter:0→1","posqc-coffee-tenant.receiptSeqSum:0→1"]}}
```

### 07-p13-forced-2.log (ท้าย 12 บรรทัด)
```
  ✅ [P1.3-S4.2] ยังไม่มีกะ (PosShift ของ P1.9 ยังไม่มี/ไม่เปิด) → shift = null ไม่ throw
  ✅ [P1.3-S4.3] pendingStockCount ('รอตัดสต็อก'): บิลวันนี้ (ตัดวันเวลาไทย +07:00) ที่ตัดสต็อกครบ → 0 · บิลที่ยังไม่ตัด (createSale ใน tx ผู้อื่น) → นับ 1
  ✅ [P1.3-S4.4] registerStatus ข้ามร้าน (unit ร้านอาหาร) → NOT_FOUND · แคชเชียร์สาขาอื่น → NOT_FOUND · สาขาตัวเอง → ok (คู่บวก)
  ✅ [P1.3-S4.5] [Q23] registerStatus.user.role = รหัสบทบาท OWNER · MANAGER · STAFF ตาม actor (roleLabel ภาษาคนยังอยู่ · S4.1)
  ✅ [P1.3-S4.6] [Q25] registerVatConfig(ctx) = {mode, rateBp} เดียวกับ vatMode/vatRateBp ของ quote (สาขา sandbox และสาขาสีลม) · mode ∈ INCLUDED|NONE
  ✅ [P1.3-S4.7] [3.2 ข้อ 11] pendingStockCount: บิล PAID วันนี้ที่บรรทัดผูกสต็อกยังไม่มี movement pos-consume-<sale>-<line> → +1 · ตัดด้วยคีย์นั้นแล้ว → กลับเท่าเดิม
  ลบแล้ว: {"outbox":134,"audit":268,"journal":0,"point":0,"coupon":0,"payment":135,"line":335,"sale":133,"product":537,"productBySystem":0,"category":2,"menuGroup":2,"invJournal":86,"invItem":20,"customer":2,"user":2} · สาขา 3 · ระบบ 4
  ✅ [P1.3-S9.1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง · ตัวนับใบเสร็จสาขาจริงไม่ขยับ
  ✅ [P1.3-S9.2] QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · InvItem · AppSystem รวม settings · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter) ทุกคอลัมน์ ก่อน = หลัง

===== qc-pos-p1.3 ===== ผ่าน 127/128 (QC_FORCE)
JSON_SUMMARY {"suite":"qc-pos-p1.3","total":128,"passed":127,"failed":["P1.3-S6.1"],"skipped":false,"forced":true,"skippedChecks":{},"missing":[],"a5":{"drift":[]}}
```

### 08-p13-unforced.log (ท้าย 12 บรรทัด)
```
  ✅ [P1.3-S4.2] ยังไม่มีกะ (PosShift ของ P1.9 ยังไม่มี/ไม่เปิด) → shift = null ไม่ throw
  ✅ [P1.3-S4.3] pendingStockCount ('รอตัดสต็อก'): บิลวันนี้ (ตัดวันเวลาไทย +07:00) ที่ตัดสต็อกครบ → 0 · บิลที่ยังไม่ตัด (createSale ใน tx ผู้อื่น) → นับ 1
  ✅ [P1.3-S4.4] registerStatus ข้ามร้าน (unit ร้านอาหาร) → NOT_FOUND · แคชเชียร์สาขาอื่น → NOT_FOUND · สาขาตัวเอง → ok (คู่บวก)
  ✅ [P1.3-S4.5] [Q23] registerStatus.user.role = รหัสบทบาท OWNER · MANAGER · STAFF ตาม actor (roleLabel ภาษาคนยังอยู่ · S4.1)
  ✅ [P1.3-S4.6] [Q25] registerVatConfig(ctx) = {mode, rateBp} เดียวกับ vatMode/vatRateBp ของ quote (สาขา sandbox และสาขาสีลม) · mode ∈ INCLUDED|NONE
  ✅ [P1.3-S4.7] [3.2 ข้อ 11] pendingStockCount: บิล PAID วันนี้ที่บรรทัดผูกสต็อกยังไม่มี movement pos-consume-<sale>-<line> → +1 · ตัดด้วยคีย์นั้นแล้ว → กลับเท่าเดิม
  ลบแล้ว: {"outbox":104,"audit":262,"journal":0,"point":0,"coupon":0,"payment":105,"line":305,"sale":103,"product":534,"productBySystem":0,"category":2,"menuGroup":2,"invJournal":52,"invItem":17,"customer":2,"user":2} · สาขา 3 · ระบบ 4
  ✅ [P1.3-S9.1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง · ตัวนับใบเสร็จสาขาจริงไม่ขยับ
  ✅ [P1.3-S9.2] QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · InvItem · AppSystem รวม settings · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter) ทุกคอลัมน์ ก่อน = หลัง

===== qc-pos-p1.3 ===== ผ่าน 127/127 · ข้าม 1 (กลุ่มของใบอื่น)
JSON_SUMMARY {"suite":"qc-pos-p1.3","total":127,"passed":127,"failed":[],"skipped":false,"forced":false,"skippedChecks":{"P1.3-S6.1":"P1.6 — ยังไม่มีโค้ดใน src/ อ่าน settings.pos.stock.oversellPolicy (นโยบาย BLOCK ตรวจใน tx ของบิล)"},"missing":[],"a5":{"drift":[]}}
```

### 09-qc-pos-p1.1.log (ท้าย 12 บรรทัด)
```
  ✅ [P1.1-S3.54] F2 ทุกการเรียกของ S3.52/S3.53 + id/สาขา/ctx ที่มี NUL: error ที่ throw เป็น CatalogError ที่ code ∈ ชุดรับรอง (NOT_FOUND · PERMISSION_DENIED · VALIDATION · CONFLICT · BUSY · INTERNAL) ไม่มี path (/root/ · src/lib/) · error ไม่คาดคิดจาก client = INTERNAL ข้อความไทยคงที่ เก็บต้นฉบับใน cause {X12}
  ✅ [P1.1-S3.55] F3 อีก connection ถือ pg_advisory_xact_lock(hashtext('pos-catalog:'||tenant)) 8 วิ: createProduct(บาร์โค้ด) · createProduct(invItemId) · ensureForInvItem = BUSY ภายใน < 7 วิ (ข้อความไทย) ไม่เขียนอะไร · ปล่อยล็อกแล้วเรียกเดิมสำเร็จ {X6}
  ✅ [P1.1-S3.57] F6 checkCatalogWrite เจ้าของ + invItemId ของร้านอื่น / คลังที่ไม่ขายผ่าน POS นี้ / ไม่มีจริง = "NOT_FOUND" (แถวทุกสาขา + แถวสาขา) · InvItem ของคลัง POS นี้ = "OK" (คู่บวก) {X2}
  ✅ [P1.1-S3.58] F6 อ่านเฉพาะคีย์ของตัวเอง (Object.hasOwn): patch ที่ unitId มาจาก prototype ไม่ย้ายแถว · create ที่ unitId มาจาก prototype ไม่ลงสาขานั้น · คีย์แปลกของตัวเอง = VALIDATION (create + update) · patch/input null หรือ array = VALIDATION {X4}
  ✅ [P1.1-S3.59] F5 scripts/fitness-pos.mts ลงทะเบียนกฎ F15.6 (src/** ห้าม import จาก scripts/**) — static (หลักฐานลบเป็นของ builder) {X12}
  ⏭️  P1.1b ยังไม่เริ่ม (ผู้เขียนเดิม 8 ไฟล์ยังไม่ import pos/catalog) — ข้าม 28 ข้อ
  ✅ [P1.1-X9.1] event outbox ตระกูล pos.* ที่เกิดระหว่างรัน (ถ้ามี) มี consumer ลงทะเบียนครบ {X9}
  ✅ [P1.1-S1.36] rollback ปลายทาง: ลบแถวตารางใหม่ที่รันนี้สร้าง + คืนคอลัมน์เชื่อม + ลบ fixtures → ตารางเดิม (จำนวน + checksum) และตารางใหม่ เท่าก่อนรัน · ร้าน QC กลับสภาพเดิม {X5}
ROWCOUNTS_AFTER {"BusinessUnit":3,"AppSystemUnit":13,"InvItem":9,"InvItemImage":0,"InvLocationStock":3,"InvMovement":3,"AccountProduct":8,"MenuCategory":3,"MenuItem":4,"MenuOptionGroup":0,"MenuOptionChoice":0,"MenuItemOptionGroup":0,"KdsStation":2,"ShopProduct":0,"ShopOrder":0,"ShopOrderLine":0,"RestaurantOrderItem":0,"PosSale":0,"PosSaleLine":0,"PosPayment":0,"PosReceiptCounter":1,"BookingService":0,"Membership":4,"AppSystem":8,"AccountSettings":0,"PosProduct":13,"PosCategory":3,"PosProductOptionGroup":0,"RecipeLine":0,"OutboxEvent":0} · เท่าเดิม

===== qc-pos-p1.1 ===== ผ่าน 113/113
JSON_SUMMARY {"suite":"qc-pos-p1.1","total":113,"passed":113,"failed":[],"skipped":null,"catalogue":141,"tag":"qc-p1.1-15f603","skippedGroups":{"S2":"P1.1b ยังไม่เริ่ม (ผู้เขียนเดิม 8 ไฟล์ยังไม่ import pos/catalog) — ข้าม 28 ข้อ"},"force":false,"p11bStarted":false}
```

### 10-qc-pos-p0.2.log (ท้าย 12 บรรทัด)
```
  ✅ [P0.2-S7.3] sales.summary ไม่ระบุ days = 7
  ✅ [P0.2-S7.4] sales.byDay 5 แถว ใหม่→เก่า เริ่มวันนี้ วันต่อเนื่อง
  ✅ [P0.2-S7.1] sales.summary ระบบจริง 16 วัน = aggregate อิสระ (ยอด 285000 สตางค์ · 1 บิล)
  ✅ [P0.2-S7.5] sales.byDay วัน 2026-09-19 = aggregate อิสระของวันนั้น (285000 สตางค์)
  ✅ [P0.2-S7.6] ระบบ POS อื่นของร้านเดียวกัน (ช่วงเดียวกันที่มียอดจริง > 0) เห็น 0 — ไม่รั่วข้ามระบบ
  ✅ [P0.2-S1.5] ทุก op มี test id ไม่ซ้ำ และมีข้อสอบที่รันจริง + ผ่าน ติดป้าย id นั้น (ไม่นับข้อความในไฟล์)

===== QC: POS P0.2 ทะเบียน op =====
ผ่าน 55/55 · SKIP 1 (P0.2-S6.7)
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":55,"passed":55,"skipped":["P0.2-S6.7"],"findings":[]}
```

### 11-qc-pos-register.log (ท้าย 12 บรรทัด)
```
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

### 12-qc-pos-inventory.log (ท้าย 12 บรรทัด)
```
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

### 13-qc-pos-account.log (ท้าย 12 บรรทัด)
```

── Conservation: รายได้ในบัญชี = ยอดขายที่ไม่ void ──
  ✅ [ACC-6.1] Σ รายได้ 4000 = 200.00 (เหลือแค่บิลโอนที่ไม่ถูก void)
  ✅ [ACC-6.2] ทั้งสมุด Σdr = Σcr

[cleanup] ลบ test tenant เรียบร้อย

===== QC M1: POS→Account =====
ผ่าน 16/16
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":16,"passed":16,"findings":[]}
```

### 14-qc-hf-inventory-atomic.log (ท้าย 12 บรรทัด)
```
AT-25 inv-cache-audit: URL prod รูปแบบอื่น ⇒ exit 4 ก่อนต่อฐานข้อมูล · ตรวจ E/F บนร้านทดสอบ
  ✅ [AT-25.1] ด่าน prod ของ audit: ตัวพิมพ์ใหญ่ / percent-encode / host-less + ?host= / PGHOST ⇒ exit 4 ทุกแบบ (ไม่ต่อฐานข้อมูล)
  ✅ [AT-25.2] ร้าน 1 (มี AT-1..AT-24 ที่แข่งกันจริง + ของเสียจงใจ 2 ตัว) ⇒ E 1 · F 1 · A/B/C/D 0 · สินค้าเพี้ยน 2
  ✅ [AT-25.3] ร้าน 2 (ใบปรับต้นทุน · ใบเบิก/คืน · ตัดชุด แข่งกัน) ⇒ ไม่มีสินค้าเพี้ยน (F ไม่เตือนหลอกเมื่อมีใบปรับต้นทุน)
  ✅ [AT-Z] ปิดท้าย: 39 สินค้าทั้งหมด invariant ครบ (ไม่นับ 2 ตัวที่ AT-25 ทำเสียจงใจ)

TIMING per round (wall, 10 parallel): AT-1 1.5/0.9/0.8/0.8/0.8s · AT-2 0.8/0.8/0.8/0.8/0.8s · AT-3 0.9/0.9/0.9/0.8/0.9s · AT-4 1.1/1.1/1.1/1.1/1.1s · AT-5 0.8/0.8/0.8/1.8/0.7s · AT-6 0.3/0.3/0.3/0.3/0.3s · AT-8 1.0/0.9/0.9/0.9/0.9s · AT-9 0.8/0.8/0.8/0.9/0.8s · AT-7 2.8/2.9/2.8/2.8/2.8s · AT-10 0.9/0.9/0.9/0.9/0.9s · AT-12 2.0/2.0/2.4s · AT-13 2.4/1.8/1.8s · AT-14 0.4/0.3/0.3s · AT-15 2.4/2.4/2.4s · AT-16 0.6/0.6/0.6s · AT-17 0.5/0.5/0.4/0.4/0.5/0.6s · AT-19 2.2/2.1/2.1/2.1/2.1s · AT-20 0.4/0.4/0.4s

===== QC HF-INV-1 inventory atomic =====
ผ่าน 143/143
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":143,"passed":143,"findings":[]}
```

### 15-qc-hf-pos-page-authz.log (ท้าย 12 บรรทัด)
```
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

### 16-qc-account-cpa.log (ท้าย 12 บรรทัด)
```
  4030: -2,000.00
  5000: 0.00
  6800: 330.00
  6900: 1,000.00

[cleanup] ลบ test tenant เรียบร้อย

===== QC6 CPA audit (service layer จริง + Neon) =====
ผ่าน 107/107 ข้อตรวจ
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":107,"passed":107,"findings":[]}
```

### 17-qc-restaurant-money.log (ท้าย 12 บรรทัด)
```
  ✅ [RM-2.2] Dr เงินสด 1000 = 120.00
  ✅ [RM-2.3] Cr รายได้ 4000 = 112.15 (ฐานหลังถอด VAT 7%)
  ✅ [RM-2.4] Cr ภาษีขาย 2200 = ส่วน VAT
  ✅ [RM-2.5] Σdr = Σcr

[cleanup] เรียบร้อย

===== QC Restaurant Money Chain =====
ผ่าน 6/6
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":6,"passed":6,"findings":[]}
```

### 18-qc-shop-refund.log (ท้าย 12 บรรทัด)
```
  ✅ [RF-1.5] คืนสต็อกกลับ 48→50 (เฉพาะ line ผูกคลัง)
  ✅ [RF-1.6] ต้นทุนถัวเฉลี่ยไม่เพี้ยน (8000)
  ✅ [RF-1.7] movement คืนสต็อก type IN idempotencyKey ผูก order+line (1 รายการ)
  ✅ [RF-2.1] refund ซ้ำ → ok:false (ไม่ทำซ้ำ)
  ✅ [RF-2.2] สต็อกไม่เบิ้ล (ยัง 50) + void outbox ไม่เพิ่ม + IN movement ยัง 1
  ✅ [RF-3.1] refund PENDING_PAYMENT → ok:false + order ยัง PENDING
  ✅ [RF-4.1] cross-tenant refund → ok:false + order t1 ยัง PAID (ไม่ถูกคืน)

===== QC Shop Refund =====
ผ่าน 12/12
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":12,"passed":12,"findings":[]}
```

### 19-qc-hotel-money.log (ท้าย 12 บรรทัด)
```
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

### 20-qc-ticket-money.log (ท้าย 12 บรรทัด)
```
  ✅ [TK-1.1] สร้างออเดอร์ตั๋วได้ (฿107)
  ✅ [TK-2.1] markPaid → เกิด journal entry อัตโนมัติ
  ✅ [TK-2.2] Cr รายได้ 4000 = ฐานหลังถอด VAT (100)
  ✅ [TK-2.3] Cr ภาษีขาย 2200 = 7
  ✅ [TK-2.4] Σdr=Σcr
  ✅ [TK-3.1] markPaid ซ้ำ idempotent (ไม่ post เบิ้ล)
[cleanup] ok

===== QC Ticket Money =====
ผ่าน 6/6
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":6,"passed":6,"findings":[]}
```

### 21-qc-subscription-money.log (ท้าย 12 บรรทัด)
```
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

### 22-qc-crm-c2.7.log (ท้าย 12 บรรทัด)
```
  ✅ [C2.7-X9.1] every money mutation leaves an audit row: the automatic payment path audits the deal (actorType SYSTEM) and `linkSaleToDeal` writes `crm.deal.pos.link` for the cashier who pressed it
  ✅ [C2.7-X9.2] the automatic transitions are attributable: auto-WON (paid ≥ value) and auto-invoice write an audit row whose actor is the SYSTEM, never a random user

── U · uiVersion 1 ──
  ✅ [C2.7-U.1] uiVersion 1: a real payment of a v1 shop's invoice leaves the CRM side untouched (no CrmDealPayment, paidSatang 0, lifecycle unchanged) while accounting completes normally and the queue still drains
  ✅ [C2.7-U.3] uiVersion 1: a POS bill of that shop is sold, posted and drained exactly as before C2.7 — and CRM wrote nothing for it (the pilot switch is the only thing that turns the money bridge on)
  ✅ [C2.7-U.2] uiVersion 1: linkSaleToDeal is refused with CrmV2DisabledError and nothing is written · openDealsForParty answers [] · dealForDoc answers null (no v2 surface leaks into a v1 shop)
  ✅ [C2.7-U.4] [positive control] the same shop switched to uiVersion 2 counts the NEXT payment immediately (the gate is read live, not cached) — so U.1's silence is the gate, not a broken fixture. The payment that arrived while the shop was on v1 is NOT counted retroactively (documented semantics — controller decision in the report)
  ✅ [C2.7-CLEAN] the oracle gives the QC database back exactly as found — every throwaway tenant, every row it owned, the throwaway users and the lab triggers are gone

🟢 C2.7: 79/79
JSON_SUMMARY {"total":79,"passed":79,"findings":[]}
```

### 23-qc-branding-b3.log (ท้าย 12 บรรทัด)
```
  ✅ [B3-S5.1] จอ <lg / ในแอป: ปัดจากขอบซ้าย (≤24px) ไปทางขวา ≥60px เปิดเมนู (pointer/touch ใน AppShell หรือ SwipeEdge.tsx) · ไม่ทำงานเมื่อเริ่มในช่องพิมพ์/แนวนอนเลื่อนได้
  ✅ [B3-S5.2] IssueReportSheet.tsx: ประเภท 3 (BUG/DISPLAY/IDEA) · ข้อความ · แนบรูป (ไม่บังคับ) · แนบ pageUrl/userAgent/appVersion อัตโนมัติ · ส่งผ่าน reportIssueAction · ไม่ใช้ alert()
  ✅ [B3-S5.3] reportIssueAction: ต้องล็อกอิน (requireTenant) → createIssueReport(ctx,{userId,…}) · ไฟล์แนบผ่าน validateLogoFile-แบบรูป ≤2MB → uploadFile · คืน {ok} ไม่ throw
  ✅ [B3-S5.4] issues.ts มี assertCanReport/สิทธิ์: ผู้แจ้งต้องเป็นสมาชิกร้าน (membership accepted) ไม่งั้น throw ไทย
  ✅ [B3-S5.5] เมนูมือถือ (overlay) ท้ายเมนูมีรายการ 'แจ้งปัญหาการใช้งาน' (เพราะแถบบนจอเล็กไม่มีที่)
  ✅ [B3-S6.1] visual-branding.mts มี spec b3: โครงแอป 3 โทน (LIGHT/BRAND/DARK) × desktop · ราง (ย่อ) · มือถือหลังปัดขวา · แผ่นแจ้งปัญหา · finally คืนค่า
  ❌ [B3-S6.2] มีภาพจริง ≥ 8 ใบใน .qc-shots/branding/b3 — exp ≥8 | act 0

===== QC Branding B3 =====
ผ่าน 19/20
FINDINGS: CRITICAL 0 · MAJOR 1 · MINOR 0
JSON_SUMMARY {"total":20,"passed":19,"findings":["B3-S6.2"]}
```

### 24-seed.log (ท้าย 12 บรรทัด)
```
  PQC-RS-COKE     2000 สต. · คงเหลือ 24 · 8851959132012
  PQC-RS-ICE         0 สต. · คงเหลือ 0
  เมนู ข้าวกะเพราหมูสับไข่ดาว 6500 สต.
  เมนู ผัดไทยกุ้งสด 8500 สต.
  เมนู ต้มยำกุ้งน้ำข้น 15000 สต. · สต็อกเมนู 20
  เมนู ชาไทยเย็น 4500 สต.

ลายนิ้วมือร้านอื่น 36 ค่า · ไม่เปลี่ยนเลย ✅
FINGERPRINT_OTHER_TENANTS {"tenant":"17","tenant.maxUpdatedAt":"2026-09-30T21:47:16.041Z","user":"72","user.maxUpdatedAt":"2026-10-01T19:58:42.794Z","membership":"35","membership.maxUpdatedAt":"2026-10-01T00:43:16.914Z","businessUnit":"11","businessUnit.maxUpdatedAt":"2026-09-27T19:34:52.723Z","appSystem":"94","appSystem.maxUpdatedAt":"2026-10-01T17:04:53.296Z","customer":"68","customer.maxUpdatedAt":"2026-10-01T17:04:37.671Z","crmContact":"107","crmContact.maxUpdatedAt":"2026-09-28T18:00:41.237Z","crmDeal":"74","crmDeal.maxUpdatedAt":"2026-10-01T07:01:35.741Z","posSale":"139","posSale.maxUpdatedAt":"2026-09-27T19:35:45.879Z","invItem":"8","invItem.maxUpdatedAt":"2026-09-27T19:35:45.943Z","accountProduct":"13","accountProduct.maxUpdatedAt":"2026-09-27T19:35:46.202Z","menuItem":"0","menuItem.maxUpdatedAt":"null","menuCategory":"0","menuCategory.maxUpdatedAt":"null","shopProduct":"0","shopProduct.maxUpdatedAt":"null","accountSystemLink":"113","accountSystemLink.maxUpdatedAt":"2026-10-01T19:58:52.710Z","appSystemUnit":"60","invMovement":"11","paymentProfile":"0","outboxEvent.PENDING":"0","outboxEvent":"14131","session":"148"}
แถวใหม่รอบนี้: ไม่มี (รันซ้ำ) · เฉลย scripts/pos-expected.json · 3 วิ
SEED_SUMMARY {"coffee":{"units":2,"systems":5,"systemUnitLinks":10,"memberships":2,"invItems":7,"invItemsWithBarcode":1,"services":1,"accountProducts":6,"accountProductsNoVat":1,"accountProductsZeroPrice":1,"invReceives":2,"onHandTotal":68,"menuCategories":0,"menuItems":0,"kdsStations":0,"members":1,"accountSystemLinks":1,"posSales":0,"paymentProfiles":1},"resto":{"units":1,"systems":3,"systemUnitLinks":3,"memberships":2,"invItems":2,"invItemsWithBarcode":1,"services":0,"accountProducts":2,"accountProductsNoVat":0,"accountProductsZeroPrice":1,"invReceives":1,"onHandTotal":24,"menuCategories":3,"menuItems":4,"kdsStations":2,"members":0,"accountSystemLinks":1,"posSales":0,"paymentProfiles":0},"qcUsers":4,"otherTenantsUnchanged":true}
JSON_SUMMARY {"suite":"seed-pos-qc","ok":true,"createdThisRun":{},"drift":[]}
```

### 25-serve-build.log (ท้าย 12 บรรทัด)
```
├ ƒ /u/[token]
├ ƒ /u/[token]/one-click
└ ƒ /vendor/[token]


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

🚀 start ที่ http://127.0.0.1:3225 (log: /root/projects/shark-pos-p11/.qc-shots/acc-v2/server.log)
✅ พร้อมใช้งานที่ http://127.0.0.1:3225 (pid 380152)
```

### 26-visual-owner.log (ท้าย 12 บรรทัด)
```
  ✅ sales 1440x900 HTTP 200 (คาด 200) → .qc-shots/pos/p1.3/sales-owner-1440x900.png
  ✅ sales 1024x768 HTTP 200 (คาด 200) → .qc-shots/pos/p1.3/sales-owner-1024x768.png
  ✅ sales 390x844 HTTP 200 (คาด 200) → .qc-shots/pos/p1.3/sales-owner-390x844.png
  ✅ products 1440x900 HTTP 200 (คาด 200) → .qc-shots/pos/p1.3/products-owner-1440x900.png
  ✅ products 1024x768 HTTP 200 (คาด 200) → .qc-shots/pos/p1.3/products-owner-1024x768.png
  ✅ products 390x844 HTTP 200 (คาด 200) → .qc-shots/pos/p1.3/products-owner-390x844.png
  ✅ close 1440x900 HTTP 200 (คาด 200) → .qc-shots/pos/p1.3/close-owner-1440x900.png
  ✅ close 1024x768 HTTP 200 (คาด 200) → .qc-shots/pos/p1.3/close-owner-1024x768.png
  ✅ close 390x844 HTTP 200 (คาด 200) → .qc-shots/pos/p1.3/close-owner-390x844.png

🧹 ลบ session ของรอบนี้ 1 · ลบสินค้าชั่วคราว 3 (+InvItem 2) · ลบโปรไฟล์ chromium /tmp/chr-pos-380260 · ภาพ 35 ใบใน .qc-shots/pos/p1.3
JSON_SUMMARY {"wo":"p1.3","user":"owner","tenant":"coffee","base":"http://127.0.0.1:3225","shots":[{"page":"register","state":"default","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-default-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"default","stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/register-default-owner-1024x768.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"default","stepError":null,"viewport":"390x844","file":".qc-shots/pos/p1.3/register-default-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"cart3","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-cart3-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"cart3","stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/register-cart3-owner-1024x768.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"cart3","stepError":"ไม่พบ [data-testid^=\"pos-reg-cart-line-\"] ตัวที่ 2 ที่มองเห็น","viewport":"390x844","file":".qc-shots/pos/p1.3/register-cart3-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":false,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"line-editor","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-line-editor-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"line-editor","stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/register-line-editor-owner-1024x768.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"line-editor","stepError":"ไม่พบ [data-testid^=\"pos-reg-cart-line-\"] ตัวที่ 2 ที่มองเห็น","viewport":"390x844","file":".qc-shots/pos/p1.3/register-line-editor-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":false,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"bill-discount","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-bill-discount-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"bill-discount","stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/register-bill-discount-owner-1024x768.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"bill-discount","stepError":"ไม่พบ [data-testid^=\"pos-reg-cart-line-\"] ตัวที่ 2 ที่มองเห็น","viewport":"390x844","file":".qc-shots/pos/p1.3/register-bill-discount-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":false,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"custom-item","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-custom-item-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"custom-item","stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/register-custom-item-owner-1024x768.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"custom-item","stepError":null,"viewport":"390x844","file":".qc-shots/pos/p1.3/register-custom-item-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"paydlg-cash","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-paydlg-cash-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"paydlg-cash","stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/register-paydlg-cash-owner-1024x768.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"paydlg-cash","stepError":"ไม่พบ [data-testid^=\"pos-reg-cart-line-\"] ตัวที่ 2 ที่มองเห็น","viewport":"390x844","file":".qc-shots/pos/p1.3/register-paydlg-cash-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":false,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"sale-done","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-sale-done-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"search-empty","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-search-empty-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"search-empty","stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/register-search-empty-owner-1024x768.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"search-empty","stepError":null,"viewport":"390x844","file":".qc-shots/pos/p1.3/register-search-empty-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"stock-warn","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-stock-warn-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"stock-warn","stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/register-stock-warn-owner-1024x768.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"stock-warn","stepError":null,"viewport":"390x844","file":".qc-shots/pos/p1.3/register-stock-warn-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"mobile-sheet","stepError":"ไม่พบ [data-testid^=\"pos-reg-cart-line-\"] ตัวที่ 2 ที่มองเห็น","viewport":"390x844","file":".qc-shots/pos/p1.3/register-mobile-sheet-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":false,"consoleErrors":0,"httpErrors":0},{"page":"sales","state":null,"stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/sales-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/sales","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"sales","state":null,"stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/sales-owner-1024x768.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/sales","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"sales","state":null,"stepError":null,"viewport":"390x844","file":".qc-shots/pos/p1.3/sales-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/sales","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"products","state":null,"stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/products-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/products","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"products","state":null,"stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/products-owner-1024x768.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/products","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"products","state":null,"stepError":null,"viewport":"390x844","file":".qc-shots/pos/p1.3/products-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/products","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"close","state":null,"stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/close-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/close","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"close","state":null,"stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/close-owner-1024x768.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/close","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"close","state":null,"stepError":null,"viewport":"390x844","file":".qc-shots/pos/p1.3/close-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/close","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0}],"failures":5,"fatal":null}
```

### 27-visual-cashier.log (ท้าย 12 บรรทัด)
```
  ✅ sales 1440x900 HTTP 200 (คาด record) → .qc-shots/pos/p1.3/sales-cashier-1440x900.png
  ✅ sales 1024x768 HTTP 200 (คาด record) → .qc-shots/pos/p1.3/sales-cashier-1024x768.png
  ✅ sales 390x844 HTTP 200 (คาด record) → .qc-shots/pos/p1.3/sales-cashier-390x844.png
  ✅ products 1440x900 HTTP 404 (คาด record) · console error 1: Failed to load resource: the server responded with a status of 404 (Not Found) → .qc-shots/pos/p1.3/products-cashier-1440x900.png
  ✅ products 1024x768 HTTP 404 (คาด record) · console error 1: Failed to load resource: the server responded with a status of 404 (Not Found) → .qc-shots/pos/p1.3/products-cashier-1024x768.png
  ✅ products 390x844 HTTP 404 (คาด record) · console error 1: Failed to load resource: the server responded with a status of 404 (Not Found) → .qc-shots/pos/p1.3/products-cashier-390x844.png
  ✅ close 1440x900 HTTP 200 (คาด record) → .qc-shots/pos/p1.3/close-cashier-1440x900.png
  ✅ close 1024x768 HTTP 200 (คาด record) → .qc-shots/pos/p1.3/close-cashier-1024x768.png
  ✅ close 390x844 HTTP 200 (คาด record) → .qc-shots/pos/p1.3/close-cashier-390x844.png

🧹 ลบ session ของรอบนี้ 1 · ลบสินค้าชั่วคราว 3 (+InvItem 2) · ลบโปรไฟล์ chromium /tmp/chr-pos-383478 · ภาพ 35 ใบใน .qc-shots/pos/p1.3
JSON_SUMMARY {"wo":"p1.3","user":"cashier","tenant":"coffee","base":"http://127.0.0.1:3225","shots":[{"page":"register","state":"default","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-default-cashier-1440x900.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"default","stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/register-default-cashier-1024x768.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"default","stepError":null,"viewport":"390x844","file":".qc-shots/pos/p1.3/register-default-cashier-390x844.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"cart3","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-cart3-cashier-1440x900.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"cart3","stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/register-cart3-cashier-1024x768.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"cart3","stepError":"ไม่พบ [data-testid^=\"pos-reg-cart-line-\"] ตัวที่ 2 ที่มองเห็น","viewport":"390x844","file":".qc-shots/pos/p1.3/register-cart3-cashier-390x844.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":false,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"line-editor","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-line-editor-cashier-1440x900.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"line-editor","stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/register-line-editor-cashier-1024x768.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"line-editor","stepError":"ไม่พบ [data-testid^=\"pos-reg-cart-line-\"] ตัวที่ 2 ที่มองเห็น","viewport":"390x844","file":".qc-shots/pos/p1.3/register-line-editor-cashier-390x844.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":false,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"bill-discount","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-bill-discount-cashier-1440x900.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"bill-discount","stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/register-bill-discount-cashier-1024x768.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"bill-discount","stepError":"ไม่พบ [data-testid^=\"pos-reg-cart-line-\"] ตัวที่ 2 ที่มองเห็น","viewport":"390x844","file":".qc-shots/pos/p1.3/register-bill-discount-cashier-390x844.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":false,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"custom-item","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-custom-item-cashier-1440x900.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"custom-item","stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/register-custom-item-cashier-1024x768.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"custom-item","stepError":null,"viewport":"390x844","file":".qc-shots/pos/p1.3/register-custom-item-cashier-390x844.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"paydlg-cash","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-paydlg-cash-cashier-1440x900.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"paydlg-cash","stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/register-paydlg-cash-cashier-1024x768.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"paydlg-cash","stepError":"ไม่พบ [data-testid^=\"pos-reg-cart-line-\"] ตัวที่ 2 ที่มองเห็น","viewport":"390x844","file":".qc-shots/pos/p1.3/register-paydlg-cash-cashier-390x844.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":false,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"sale-done","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-sale-done-cashier-1440x900.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"search-empty","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-search-empty-cashier-1440x900.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"search-empty","stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/register-search-empty-cashier-1024x768.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"search-empty","stepError":null,"viewport":"390x844","file":".qc-shots/pos/p1.3/register-search-empty-cashier-390x844.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"stock-warn","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-stock-warn-cashier-1440x900.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"stock-warn","stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/register-stock-warn-cashier-1024x768.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"stock-warn","stepError":null,"viewport":"390x844","file":".qc-shots/pos/p1.3/register-stock-warn-cashier-390x844.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"mobile-sheet","stepError":"ไม่พบ [data-testid^=\"pos-reg-cart-line-\"] ตัวที่ 2 ที่มองเห็น","viewport":"390x844","file":".qc-shots/pos/p1.3/register-mobile-sheet-cashier-390x844.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":false,"consoleErrors":0,"httpErrors":0},{"page":"sales","state":null,"stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/sales-cashier-1440x900.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/sales","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"sales","state":null,"stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/sales-cashier-1024x768.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/sales","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"sales","state":null,"stepError":null,"viewport":"390x844","file":".qc-shots/pos/p1.3/sales-cashier-390x844.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/sales","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"products","state":null,"stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/products-cashier-1440x900.png","status":404,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/products","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":1,"httpErrors":1},{"page":"products","state":null,"stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/products-cashier-1024x768.png","status":404,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/products","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":1,"httpErrors":1},{"page":"products","state":null,"stepError":null,"viewport":"390x844","file":".qc-shots/pos/p1.3/products-cashier-390x844.png","status":404,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/products","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":1,"httpErrors":1},{"page":"close","state":null,"stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/close-cashier-1440x900.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/close","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"close","state":null,"stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/close-cashier-1024x768.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/close","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"close","state":null,"stepError":null,"viewport":"390x844","file":".qc-shots/pos/p1.3/close-cashier-390x844.png","status":200,"expect":"record","finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/close","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0}],"failures":5,"fatal":null}
```

### 28-visual-owner-en.log (ท้าย 12 บรรทัด)
```
  ✅ sales 1440x900 HTTP 200 (คาด 200) → .qc-shots/pos/p1.3/sales-owner-1440x900.png
  ✅ sales 1024x768 HTTP 200 (คาด 200) → .qc-shots/pos/p1.3/sales-owner-1024x768.png
  ✅ sales 390x844 HTTP 200 (คาด 200) → .qc-shots/pos/p1.3/sales-owner-390x844.png
  ✅ products 1440x900 HTTP 200 (คาด 200) → .qc-shots/pos/p1.3/products-owner-1440x900.png
  ✅ products 1024x768 HTTP 200 (คาด 200) → .qc-shots/pos/p1.3/products-owner-1024x768.png
  ✅ products 390x844 HTTP 200 (คาด 200) → .qc-shots/pos/p1.3/products-owner-390x844.png
  ✅ close 1440x900 HTTP 200 (คาด 200) → .qc-shots/pos/p1.3/close-owner-1440x900.png
  ✅ close 1024x768 HTTP 200 (คาด 200) → .qc-shots/pos/p1.3/close-owner-1024x768.png
  ✅ close 390x844 HTTP 200 (คาด 200) → .qc-shots/pos/p1.3/close-owner-390x844.png

🧹 ลบ session ของรอบนี้ 1 · ลบสินค้าชั่วคราว 3 (+InvItem 2) · ลบโปรไฟล์ chromium /tmp/chr-pos-386624 · ภาพ 35 ใบใน .qc-shots/pos/p1.3
JSON_SUMMARY {"wo":"p1.3","user":"owner","tenant":"coffee","base":"http://127.0.0.1:3225","shots":[{"page":"register","state":"default","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-default-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"default","stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/register-default-owner-1024x768.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"default","stepError":null,"viewport":"390x844","file":".qc-shots/pos/p1.3/register-default-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"cart3","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-cart3-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"cart3","stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/register-cart3-owner-1024x768.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"cart3","stepError":"ไม่พบ [data-testid^=\"pos-reg-cart-line-\"] ตัวที่ 2 ที่มองเห็น","viewport":"390x844","file":".qc-shots/pos/p1.3/register-cart3-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":false,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"line-editor","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-line-editor-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"line-editor","stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/register-line-editor-owner-1024x768.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"line-editor","stepError":"ไม่พบ [data-testid^=\"pos-reg-cart-line-\"] ตัวที่ 2 ที่มองเห็น","viewport":"390x844","file":".qc-shots/pos/p1.3/register-line-editor-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":false,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"bill-discount","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-bill-discount-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"bill-discount","stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/register-bill-discount-owner-1024x768.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"bill-discount","stepError":"ไม่พบ [data-testid^=\"pos-reg-cart-line-\"] ตัวที่ 2 ที่มองเห็น","viewport":"390x844","file":".qc-shots/pos/p1.3/register-bill-discount-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":false,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"custom-item","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-custom-item-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"custom-item","stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/register-custom-item-owner-1024x768.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"custom-item","stepError":null,"viewport":"390x844","file":".qc-shots/pos/p1.3/register-custom-item-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"paydlg-cash","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-paydlg-cash-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"paydlg-cash","stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/register-paydlg-cash-owner-1024x768.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"paydlg-cash","stepError":"ไม่พบ [data-testid^=\"pos-reg-cart-line-\"] ตัวที่ 2 ที่มองเห็น","viewport":"390x844","file":".qc-shots/pos/p1.3/register-paydlg-cash-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":false,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"sale-done","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-sale-done-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"search-empty","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-search-empty-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"search-empty","stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/register-search-empty-owner-1024x768.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"search-empty","stepError":null,"viewport":"390x844","file":".qc-shots/pos/p1.3/register-search-empty-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"stock-warn","stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/register-stock-warn-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"stock-warn","stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/register-stock-warn-owner-1024x768.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"stock-warn","stepError":null,"viewport":"390x844","file":".qc-shots/pos/p1.3/register-stock-warn-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":"mobile-sheet","stepError":"ไม่พบ [data-testid^=\"pos-reg-cart-line-\"] ตัวที่ 2 ที่มองเห็น","viewport":"390x844","file":".qc-shots/pos/p1.3/register-mobile-sheet-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":false,"consoleErrors":0,"httpErrors":0},{"page":"sales","state":null,"stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/sales-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/sales","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"sales","state":null,"stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/sales-owner-1024x768.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/sales","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"sales","state":null,"stepError":null,"viewport":"390x844","file":".qc-shots/pos/p1.3/sales-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/sales","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"products","state":null,"stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/products-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/products","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"products","state":null,"stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/products-owner-1024x768.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/products","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"products","state":null,"stepError":null,"viewport":"390x844","file":".qc-shots/pos/p1.3/products-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/products","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"close","state":null,"stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p1.3/close-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/close","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"close","state":null,"stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p1.3/close-owner-1024x768.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/close","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"close","state":null,"stepError":null,"viewport":"390x844","file":".qc-shots/pos/p1.3/close-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-coffee-sys-pos/pos/close","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0}],"failures":5,"fatal":null}
```

### 29-visual-legacy-flagoff.log (ท้าย 12 บรรทัด)
```
To prepare for this change:
- If you want the current behavior, explicitly use 'sslmode=verify-full'
- If you want libpq compatibility now, use 'uselibpqcompat=true&sslmode=require'

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✅ register 1440x900 HTTP 200 (คาด 200) → .qc-shots/pos/p13-legacy/register-owner-1440x900.png
  ✅ register 1024x768 HTTP 200 (คาด 200) → .qc-shots/pos/p13-legacy/register-owner-1024x768.png
  ✅ register 390x844 HTTP 200 (คาด 200) → .qc-shots/pos/p13-legacy/register-owner-390x844.png

🧹 ลบ session ของรอบนี้ 1 · ลบโปรไฟล์ chromium /tmp/chr-pos-389725 · ภาพ 3 ใบใน .qc-shots/pos/p13-legacy
JSON_SUMMARY {"wo":"p13-legacy","user":"owner","tenant":"resto","base":"http://127.0.0.1:3225","shots":[{"page":"register","state":null,"stepError":null,"viewport":"1440x900","file":".qc-shots/pos/p13-legacy/register-owner-1440x900.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-resto-sys-pos/pos/register?unit=posqc-resto-unit-main","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":null,"stepError":null,"viewport":"1024x768","file":".qc-shots/pos/p13-legacy/register-owner-1024x768.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-resto-sys-pos/pos/register?unit=posqc-resto-unit-main","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0},{"page":"register","state":null,"stepError":null,"viewport":"390x844","file":".qc-shots/pos/p13-legacy/register-owner-390x844.png","status":200,"expect":200,"finalUrl":"/app/sys/posqc-resto-sys-pos/pos/register?unit=posqc-resto-unit-main","redirectedToLogin":false,"overflow":false,"overflowEl":null,"http5xx":0,"ok":true,"consoleErrors":0,"httpErrors":0}],"failures":0,"fatal":null}
```

### flag-off.log (ท้าย 12 บรรทัด)
```
[env] vps-flag · ไฟล์ .env.qc4 · DB ep-frosty-lab-aoylqlv8-pooler.c-2.ap-southeast-1.aws.neon.tech (QC4)
(node:389642) Warning: SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full'.
In the next major version (pg-connection-string v3.0.0 and pg v9.0.0), these modes will adopt standard libpq semantics, which have weaker security guarantees.

To prepare for this change:
- If you want the current behavior, explicitly use 'sslmode=verify-full'
- If you want libpq compatibility now, use 'uselibpqcompat=true&sslmode=require'

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.
(Use `node --trace-warnings ...` to show where the warning was created)
flag off posqc-resto-sys-pos
```

### flag-on.log (ท้าย 12 บรรทัด)
```
[env] vps-flag · ไฟล์ .env.qc4 · DB ep-frosty-lab-aoylqlv8-pooler.c-2.ap-southeast-1.aws.neon.tech (QC4)
(node:390191) Warning: SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full'.
In the next major version (pg-connection-string v3.0.0 and pg v9.0.0), these modes will adopt standard libpq semantics, which have weaker security guarantees.

To prepare for this change:
- If you want the current behavior, explicitly use 'sslmode=verify-full'
- If you want libpq compatibility now, use 'uselibpqcompat=true&sslmode=require'

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.
(Use `node --trace-warnings ...` to show where the warning was created)
flag on posqc-resto-sys-pos
```

### server.log (ท้าย 12 บรรทัด)
```
- Local:         http://localhost:3225
- Network:       http://72.62.196.201:3225
✓ Ready in 203ms
(node:380167) Warning: SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full'.
In the next major version (pg-connection-string v3.0.0 and pg v9.0.0), these modes will adopt standard libpq semantics, which have weaker security guarantees.

To prepare for this change:
- If you want the current behavior, explicitly use 'sslmode=verify-full'
- If you want libpq compatibility now, use 'uselibpqcompat=true&sslmode=require'

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.
(Use `node --trace-warnings ...` to show where the warning was created)
```
