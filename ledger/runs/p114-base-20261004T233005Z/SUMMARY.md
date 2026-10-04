# suites run p114-base — 20261004T233005Z

| # | step | exit | seconds | summary |
|---|---|---|---|---|
- tree `/root/projects/shark-pos-p11` · branch `wip/pos-p1.14-oracle` · head `6e6983cb`
| 1 | install | 0 | 7 |  |
| 2 | qc-pos-p1.14 | 0 | 4 | "total":0,"passed":0,"failed":[] |
| 3 | qc-pos-p1.14-forced | 1 | 11 | "total":30,"passed":3,"failed":["P1.14-ST1","P1.14-ST2","P1.14-ST3","P1.14-ST4","P1.14-ST5","P1.14-ST6","P1.14-OC1","P1.14-RE1","P1.14-RE2","P1.14-RE3","P1.14-R |

### 01-install.log (last 15 lines)
```

. postinstall$ prisma generate
. postinstall: Loaded Prisma config from prisma.config.ts.
. postinstall: Prisma schema loaded from prisma/schema.
. postinstall: ✔ Generated Prisma Client (v7.8.0) to ./node_modules/.pnpm/@prisma+client@7.8.0_prisma@7.8.0_@types+react-dom@19.2.3_@types+react@19.2.17__@types+_12a6afd4e8168cdd815b06207f03ccf9/node_modules/@prisma/client in 3.45s
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

### 02-qc-pos-p1.14.log (last 15 lines)
```
(node:1908154) Warning: SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full'.
In the next major version (pg-connection-string v3.0.0 and pg v9.0.0), these modes will adopt standard libpq semantics, which have weaker security guarantees.

To prepare for this change:
- If you want the current behavior, explicitly use 'sslmode=verify-full'
- If you want libpq compatibility now, use 'uselibpqcompat=true&sslmode=require'

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.
(Use `node --trace-warnings ...` to show where the warning was created)
⏭️  SKIPPED — qc-pos-p1.14: ของใบ P1.14 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง)
   • src/lib/modules/pos/stock-count.ts ยังไม่มี
   • Prisma client ยังไม่มี delegate posStockCount/posStockCountLine/posStockCountEntry (R1)
   • คอลัมน์ขาด (client/DB): PosStockCount.id,PosStockCount.tenantId,PosStockCount.systemId,PosStockCount.unitId,PosStockCount.inventorySystemId,PosStockCount.locationId …(+42)
   ข้อมูล: seed ร้านกาแฟ มี · seed ร้านอาหาร มี · ข้อสอบ 30 ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล)
JSON_SUMMARY {"suite":"qc-pos-p1.14","total":0,"passed":0,"failed":[],"skipped":true,"reason":["src/lib/modules/pos/stock-count.ts ยังไม่มี","Prisma client ยังไม่มี delegate posStockCount/posStockCountLine/posStockCountEntry (R1)","คอลัมน์ขาด (client/DB): PosStockCount.id,PosStockCount.tenantId,PosStockCount.systemId,PosStockCount.unitId,PosStockCount.inventorySystemId,PosStockCount.locationId …(+42)"],"registered":30,"seed":{"coffee":true,"resto":true},"a5":{"posqc-coffee-tenant.posSale":6,"posqc-coffee-tenant.posSaleLine":12,"posqc-coffee-tenant.posPayment":6,"posqc-coffee-tenant.posReceiptCounter":2,"posqc-coffee-tenant.outboxEvent":6,"posqc-coffee-tenant.appSystem":5,"posqc-coffee-tenant.appSystemUnit":10,"posqc-coffee-tenant.businessUnit":2,"posqc-coffee-tenant.auditLog":0,"posqc-coffee-tenant.invItem":7,"posqc-coffee-tenant.invMovement":2,"posqc-coffee-tenant.invLocation":1,"posqc-coffee-tenant.invLocationStock":2,"posqc-coffee-tenant.invLot":0,"posqc-coffee-tenant.invCategory":0,"posqc-coffee-tenant.invSettings":1,"posqc-coffee-tenant.posProduct":7,"posqc-coffee-tenant.posCategory":0,"posqc-coffee-tenant.posStockCount":"absent","posqc-coffee-tenant.posStockCountLine":"absent","posqc-coffee-tenant.posStockCountEntry":"absent","posqc-coffee-tenant.accountProduct":6,"posqc-coffee-tenant.appNotification":2,"posqc-resto-tenant.posSale":0,"posqc-resto-tenant.posSaleLine":0,"posqc-resto-tenant.posPayment":0,"posqc-resto-tenant.posReceiptCounter":0,"posqc-resto-tenant.outboxEvent":0,"posqc-resto-tenant.appSystem":3,"posqc-resto-tenant.appSystemUnit":3,"posqc-resto-tenant.businessUnit":1,"posqc-resto-tenant.auditLog":0,"posqc-resto-tenant.invItem":2,"posqc-resto-tenant.invMovement":1,"posqc-resto-tenant.invLocation":1,"posqc-resto-tenant.invLocationStock":1,"posqc-resto-tenant.invLot":0,"posqc-resto-tenant.invCategory":0,"posqc-resto-tenant.invSettings":0,"posqc-resto-tenant.posProduct":6,"posqc-resto-tenant.posCategory":3,"posqc-resto-tenant.posStockCount":"absent","posqc-resto-tenant.posStockCountLine":"absent","posqc-resto-tenant.posStockCountEntry":"absent","posqc-resto-tenant.accountProduct":2,"posqc-resto-tenant.appNotification":2}}
```

### 03-qc-pos-p1.14-forced.log (last 15 lines)
```
  ❌ [P1.14-CF5] แข่งยืนยัน 6 connection คีย์ต่างกัน → ok 1 · COUNT_NOT_OPEN 5 · ADJUST ต่อบรรทัด 1 แถว · event 1 · ยอดถูก — expected ok 1 · COUNT_NOT_OPEN 5 · ADJUST 1 · B=7 | actual นับ B → MISSING:recordStockCount · ผล MISSING:confirmStockCount,MISSING:confirmStockCount,MISSING:confirmStockCount,MISSING:confirmStockCount,MISSING:confirmStockCount,MISSING:confirmStockCount · ADJUST B ไม่เท่ากับ 1 · onHand B 10 · event ≠ 1
  ❌ [P1.14-OC2] เปิดรอบ CATEGORY: บรรทัดเฉพาะหมวดที่เลือก · ตรวจค่า (หมวดของคลังอื่น · CATEGORY ไม่มีหมวด · ALL ส่งหมวด · คีย์แปลก · คีย์ซ้ำสั้น) → VALIDATION ไม่มีแถว — expected หมวด A = A,B,N · VALIDATION ×6 ไม่มีแถว | actual หมวดร้านอื่น → MISSING:openStockCount · CATEGORY ไม่มีหมวด → MISSING:openStockCount · ALL + หมวด → MISSING:openStockCount · คีย์แปลก → MISSING:openStockCount · scope แปลก → MISSING:openStockCount · คีย์สั้น → MISSING:openStockCount · เปิดหมวด → MISSING:openStockCount
  ❌ [P1.14-CF2] uncounted ZERO: รอบหมวด · ยืนยันแบบ SKIP ทั้งที่ไม่ได้นับ → NOTHING_COUNTED · นับ 1 บรรทัด แล้ว ZERO → บรรทัดที่ไม่นับเป็น 0 (ยอดที่ที่เก็บ = 0) · บรรทัดที่นับตามกติกา R6 — expected NOTHING_COUNTED · ZERO → B,N = 0 · A = 10 | actual ไม่ได้นับ → MISSING:confirmStockCount · นอกหมวด → MISSING:recordStockCount · A exp undefined (ต้อง 11) · ZERO → MISSING:confirmStockCount · A onHand 12/ที่เก็บ 12 ≠ 10 · B onHand 10/ที่เก็บ 10 ≠ 0 · B line undefined/undefined
  ❌ [P1.14-OC3] 1 รอบ OPEN ต่อที่เก็บ: เปิดซ้ำคีย์ใหม่ → COUNT_ALREADY_OPEN (+countId) · คีย์เดิม → duplicated id เดิม · ที่เก็บอื่นเปิดได้ (countNo +1) · แข่งเปิด 6 connection → ok 1 · COUNT_ALREADY_OPEN 5 · OPEN 1 แถว — expected ALREADY_OPEN · dup · ที่เก็บอื่น · แข่ง 1/5 | actual เปิดซ้ำ → MISSING:openStockCount countId=undefined · คีย์เดิม → MISSING:openStockCount dup=undefined · ที่เก็บ 2 → MISSING:openStockCount · แข่ง MISSING:openStockCount,MISSING:openStockCount,MISSING:openStockCount,MISSING:openStockCount,MISSING:openStockCount,MISSING:openStockCount · OPEN -1
  ❌ [P1.14-PM1] สิทธิ์/ขอบเขต: ขายได้อย่างเดียว → PERMISSION_DENIED (เปิด/บันทึก) · คนนับ (pos.stock.count) นับได้ ยืนยัน/ยกเลิกรอบคนอื่นไม่ได้ · STAFF สาขาอื่น → PERMISSION_DENIED · สาขาไม่มีคลัง → NO_INVENTORY · ร้านอื่น/สาขาอื่น → NOT_FOUND · blind: คนนับเห็น snapshot/expected/variance = null · เจ้าของเห็นตัวเลข — expected DENIED ×5 · NO_INVENTORY · NOT_FOUND ×3 · blind | actual ขายอย่างเดียวเปิด → MISSING:openStockCount · ขายอย่างเดียวนับ → MISSING:recordStockCount · คนนับนับ → MISSING:recordStockCount · คนนับยืนยัน → MISSING:confirmStockCount · คนนับยกเลิกรอบคนอื่น → MISSING:cancelStockCount · STAFF สาขาอื่น → MISSING:recordStockCount · สาขาไม่มีคลัง → MISSING:openStockCount · รอบสาขาอื่น → MISSING:getStockCount · ร้านอื่น → MISSING:getStockCount · ร้านอื่นนับ → MISSING:recordStockCount · blind get → MISSING:getStockCount · blind: เจ้าของไม่เห็นตัวเลข
  ❌ [P1.14-SH1] รับของจาก POS: IN · key pos-recv-<k> · POS/PosUnit/unitId · ต้นทุนไม่ส่ง = ต้นทุนเฉลี่ยเดิม (ไม่ขยับ) · สแกนบาร์โค้ดได้ · ซ้ำ → duplicated · บริการ → NOT_STOCKED · qty 0 → VALIDATION · ไม่มีสิทธิ์รับ → PERMISSION_DENIED · audit pos.stock.receive 1 — expected IN · pos-recv · ต้นทุนเดิม · dup · NOT_STOCKED · VALIDATION · DENIED · audit | actual รับ → MISSING:posReceiveStock mv=0 · onHand ไม่ +3 · ซ้ำ → MISSING:posReceiveStock · สแกน → MISSING:posReceiveStock · บริการ → MISSING:posReceiveStock · qty 0 → MISSING:posReceiveStock · ไม่มีสิทธิ์ → MISSING:posReceiveStock
  ❌ [P1.14-SH2] โอนจาก POS: TRANSFER คู่ pos-tf-<k>-out/-in · onHand รวมไม่เปลี่ยน · ที่เก็บปลายทาง +qty · ซ้ำ → duplicated · ต้นทาง=ปลายทาง → VALIDATION · ที่เก็บของคลังร้านอื่น → NOT_FOUND · ไม่มีสิทธิ์ → PERMISSION_DENIED — expected TRANSFER คู่ · รวมเท่าเดิม · dup · VALIDATION · NOT_FOUND · DENIED | actual โอน → MISSING:posTransferStock out=0 in=0 · ที่เก็บ 2 ไม่ +2 · ซ้ำ → MISSING:posTransferStock · ต้นทาง=ปลายทาง → MISSING:posTransferStock · ที่เก็บร้านอื่น → MISSING:posTransferStock · ไม่มีสิทธิ์ → MISSING:posTransferStock
  ❌ [P1.14-SH3] ปรับจาก POS: ADJUST qtyDelta = deltaQty · key pos-adj-<k> · note = เหตุผล · POS/PosUnit · ซ้ำ → duplicated · delta 0 / ไม่มีเหตุผล → VALIDATION · คนนับไม่มีสิทธิ์ adjust → PERMISSION_DENIED · Σ ที่เก็บ = onHand — expected ADJUST −1 · pos-adj · note · dup · VALIDATION ×3 · DENIED | actual ปรับ → MISSING:posAdjustStock mv=0 · onHand ไม่ −1 · ซ้ำ → MISSING:posAdjustStock · delta 0 → MISSING:posAdjustStock · ไม่มีเหตุผล → MISSING:posAdjustStock · เหตุผลว่าง → MISSING:posAdjustStock · คนนับ → MISSING:posAdjustStock
  ❌ [P1.14-RF1] คำปฏิเสธทุกตัว = {ok:false, code, message} ไม่ throw · code อยู่ใน STOCK_COUNT_REFUSAL_CODES · เห็นครบ 11 รหัสที่ยั่วได้ · message ไม่ว่าง — expected 11 รหัส · ไม่ throw · 106 คำปฏิเสธ | actual รหัสอื่น MISSING:openStockCount,MISSING:recordStockCount,MISSING:getStockCount,MISSING:confirmStockCount,MISSING:cancelStockCount · ไม่เห็น VALIDATION,NOT_FOUND,PERMISSION_DENIED,NO_INVENTORY,COUNT_ALREADY_OPEN,COUNT_NOT_OPEN,UNKNOWN_CODE,NOT_IN_COUNT,NOT_STOCKED,NOTHING_COUNTED,IDEMPOTENCY_CONFLICT
  ลบแล้ว: {"outbox":2,"audit":9,"payment":2,"saleLine":2,"sale":2,"movement":16,"locStock":7,"product":8,"item":8} · รอบ 0 · บิล 2 · สินค้า 8 · สาขา 2 · ระบบ 2
  ✅ [P1.14-Z1] QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง
  ✅ [P1.14-Z2] QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (ระบบ · สาขา · สมาชิก · InvItem · InvLocationStock · InvLocation · PosProduct · PosStockCount*) ทุกคอลัมน์ ก่อน = หลัง

===== qc-pos-p1.14 ===== ผ่าน 3/30 (QC_FORCE)
JSON_SUMMARY {"suite":"qc-pos-p1.14","total":30,"passed":3,"failed":["P1.14-ST1","P1.14-ST2","P1.14-ST3","P1.14-ST4","P1.14-ST5","P1.14-ST6","P1.14-OC1","P1.14-RE1","P1.14-RE2","P1.14-RE3","P1.14-RE4","P1.14-RE5","P1.14-AB1","P1.14-AB2","P1.14-CF1","P1.14-CF3","P1.14-CF4","P1.14-CA1","P1.14-CF5","P1.14-OC2","P1.14-CF2","P1.14-OC3","P1.14-PM1","P1.14-SH1","P1.14-SH2","P1.14-SH3","P1.14-RF1"],"skipped":false,"forced":true,"missing":["src/lib/modules/pos/stock-count.ts ยังไม่มี","Prisma client ยังไม่มี delegate posStockCount/posStockCountLine/posStockCountEntry (R1)","คอลัมน์ขาด (client/DB): PosStockCount.id,PosStockCount.tenantId,PosStockCount.systemId,PosStockCount.unitId,PosStockCount.inventorySystemId,PosStockCount.locationId …(+42)"],"a5":{"drift":[]}}
```
